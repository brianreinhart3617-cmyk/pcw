import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '../config/anthropic';
import { supabase } from '../config/supabase';
import { submitDraftResponse } from '../services/approval-queue';
import type { CompanyRecord, EmailClassification, ConversationHistoryEntry } from '../types/email';

type MessageParam = Anthropic.MessageParam;

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;
const LOG = '[ResponseAgent]';

// ─── System Prompts ───

function buildBHCenterPrompt(companyName: string): string {
  return `You are an email response agent for ${companyName}, a behavioral health services center.

## Your Role
Draft professional, compassionate email replies on behalf of the center's team.

## Tone & Style
- Warm, empathetic, and professional
- Use plain language — avoid clinical jargon in client-facing emails
- Be reassuring without making promises about treatment outcomes
- Address the sender by name when available

## HIPAA Compliance — CRITICAL
- NEVER include Protected Health Information (PHI) in responses
- Do NOT reference specific diagnoses, treatment plans, medications, or clinical details
- Do NOT confirm or deny that someone is or was a patient
- If the sender asks about specific medical details, direct them to call the office directly
- Keep responses general and procedural

## Response Guidelines
- For appointment requests: Acknowledge receipt, indicate someone will follow up, provide the office phone number
- For insurance questions: Direct them to the admissions/billing team
- For referrals: Thank the referrer, confirm the referral will be reviewed by the clinical team
- For general inquiries: Provide helpful general information, offer to connect them with the right department
- For medical records requests: Direct them to the records department

## Output Format
You MUST respond with ONLY a valid JSON object (no markdown, no explanation, no wrapping):

{
  "subject": "<reply subject line — typically 'Re: <original subject>'>",
  "body": "<the full email body text>"
}

The body should be a complete, ready-to-send email with an appropriate greeting and sign-off using the company name.`;
}

function buildMarketingCompanyPrompt(companyName: string): string {
  return `You are an email response agent for ${companyName}, a full-service marketing company.

## Your Role
Draft professional, creative, and service-oriented email replies on behalf of the company.

## Tone & Style
- Professional yet approachable and creative
- Enthusiastic about potential projects without being pushy
- Confident and knowledgeable about marketing services
- Responsive and solution-oriented

## Response Guidelines
- For new project requests: Express enthusiasm, ask clarifying questions about scope/timeline/budget if not provided, suggest scheduling a discovery call
- For revision requests: Acknowledge the feedback, confirm understanding of requested changes, provide estimated turnaround
- For general inquiries: Provide helpful information about services, suggest a meeting or call
- For partnership proposals: Thank them for the interest, indicate the team will review and follow up
- For billing/payment: Acknowledge receipt, direct to the appropriate team member if needed
- For vendor communications: Respond professionally, address the specific topic

## Output Format
You MUST respond with ONLY a valid JSON object (no markdown, no explanation, no wrapping):

{
  "subject": "<reply subject line — typically 'Re: <original subject>'>",
  "body": "<the full email body text>"
}

The body should be a complete, ready-to-send email with an appropriate greeting and sign-off using the company name.`;
}

function buildDefaultSystemPrompt(
  companyType: CompanyRecord['type'],
  companyName: string,
): string {
  return companyType === 'bh_center'
    ? buildBHCenterPrompt(companyName)
    : buildMarketingCompanyPrompt(companyName);
}

function getSystemPrompt(company: CompanyRecord): string {
  if (company.system_prompt_agent) {
    return company.system_prompt_agent;
  }
  return buildDefaultSystemPrompt(company.type, company.name);
}

// ─── Message Mapping ───

function mergeConsecutiveMessages(messages: MessageParam[]): MessageParam[] {
  if (messages.length === 0) return messages;

  const merged: MessageParam[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = messages[i];

    if (prev.role === curr.role) {
      const prevText = typeof prev.content === 'string' ? prev.content : '';
      const currText = typeof curr.content === 'string' ? curr.content : '';
      merged[merged.length - 1] = {
        role: prev.role,
        content: prevText + '\n\n---\n\n' + currText,
      };
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

function buildMessagesFromHistory(
  history: ConversationHistoryEntry[],
  classification: EmailClassification,
): MessageParam[] {
  const messages: MessageParam[] = [];

  const contextPrefix =
    `[Classification: ${classification.category}` +
    `${classification.sub_type ? '/' + classification.sub_type : ''}` +
    ` | Urgency: ${classification.urgency}` +
    ` | Sentiment: ${classification.sentiment}]\n\n`;

  for (const entry of history) {
    if (entry.role === 'client') {
      const subjectLine = entry.subject ? `Subject: ${entry.subject}\n\n` : '';
      messages.push({ role: 'user', content: subjectLine + entry.content });
    } else if (entry.role === 'agent') {
      messages.push({ role: 'assistant', content: entry.content });
    } else if (entry.role === 'system') {
      messages.push({
        role: 'user',
        content: `[INTERNAL NOTE FROM REVIEWER]: ${entry.content}`,
      });
    }
  }

  // Prepend classification context to the first user message
  if (messages.length > 0 && messages[0].role === 'user') {
    const first = messages[0];
    messages[0] = {
      role: 'user',
      content: contextPrefix + (typeof first.content === 'string' ? first.content : ''),
    };
  }

  return mergeConsecutiveMessages(messages);
}

// ─── Response Parsing ───

interface AgentResponse {
  subject: string;
  body: string;
}

function parseAgentResponse(text: string): AgentResponse {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse response JSON: ${cleaned.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.subject !== 'string' || obj.subject.length === 0) {
    throw new Error('Response missing valid "subject" field');
  }
  if (typeof obj.body !== 'string' || obj.body.length === 0) {
    throw new Error('Response missing valid "body" field');
  }

  return { subject: obj.subject, body: obj.body };
}

// ─── Main Export ───

export async function generateResponse(
  conversationId: string,
  classification: EmailClassification,
  company: CompanyRecord,
): Promise<void> {
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    console.error(`${LOG} Failed to fetch conversation ${conversationId}:`, convError?.message);
    return;
  }

  const history: ConversationHistoryEntry[] = Array.isArray(conversation.conversation_history)
    ? conversation.conversation_history
    : [];

  if (history.length === 0) {
    console.warn(`${LOG} Conversation ${conversationId} has no history, skipping`);
    return;
  }

  const systemPrompt = getSystemPrompt(company);
  const messages = buildMessagesFromHistory(history, classification);

  if (messages.length === 0) {
    console.warn(`${LOG} No messages to respond to in conversation ${conversationId}`);
    return;
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content in response generation');
  }

  const agentResponse = parseAgentResponse(textBlock.text);

  await submitDraftResponse(conversationId, agentResponse.subject, agentResponse.body);

  console.log(`${LOG} Draft generated for conversation ${conversationId}: "${agentResponse.subject}"`);
}
