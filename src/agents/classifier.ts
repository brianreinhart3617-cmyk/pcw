import { anthropic } from '../config/anthropic';
import type { CompanyRecord, EmailClassification } from '../types/email';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;

const MARKETING_CATEGORIES = [
  'new_project_request',
  'revision_request',
  'general_inquiry',
  'vendor_communication',
  'partnership_proposal',
  'billing_payment',
  'internal_operations',
  'spam_irrelevant',
];

const BH_CENTER_CATEGORIES = [
  'patient_inquiry',
  'appointment_request',
  'insurance_verification',
  'referral',
  'medical_records',
  'billing_payment',
  'vendor_communication',
  'compliance_legal',
  'staff_internal',
  'spam_irrelevant',
];

function buildDefaultSystemPrompt(
  companyType: CompanyRecord['type'],
  companyName: string,
): string {
  const categories =
    companyType === 'marketing_company' ? MARKETING_CATEGORIES : BH_CENTER_CATEGORIES;

  return `You are an email classification agent for ${companyName}.

Your job is to analyze incoming emails and return a structured JSON classification.

## Valid Categories
${categories.map((c) => `- ${c}`).join('\n')}

## Output Format
You MUST respond with ONLY a valid JSON object (no markdown, no explanation, no wrapping) matching this exact schema:

{
  "category": "<one of the valid categories above>",
  "sub_type": "<optional further specificity, or null>",
  "urgency": "<low | medium | high>",
  "sentiment": "<positive | neutral | negative>",
  "requires_response": <true | false>,
  "summary": "<1-2 sentence summary of the email's purpose>"
}

## Classification Guidelines

### Urgency
- **high**: Time-sensitive requests, compliance/legal matters, medical emergencies, payment issues with deadlines
- **medium**: Standard business requests that need attention within 1-2 business days
- **low**: Informational emails, newsletters, non-urgent vendor communications, spam

### requires_response
- true: The sender is asking a question, making a request, or expecting a reply
- false: Informational only, spam, automated notifications, or no action needed

### sub_type
- Provide a more specific label within the category when useful (e.g., category "billing_payment" might have sub_type "invoice_dispute" or "payment_confirmation")
- Set to null if no meaningful sub-classification exists

Classify the following email accurately. Respond with ONLY the JSON object.`;
}

function getSystemPrompt(company: CompanyRecord): string {
  if (company.system_prompt_classification) {
    return company.system_prompt_classification;
  }
  return buildDefaultSystemPrompt(company.type, company.name);
}

function buildUserMessage(email: {
  subject: string | null;
  body: string | null;
  from_email: string;
}): string {
  const parts: string[] = [];
  parts.push(`From: ${email.from_email}`);
  parts.push(`Subject: ${email.subject ?? '(no subject)'}`);
  parts.push('');
  parts.push(email.body ?? '(empty body)');
  return parts.join('\n');
}

function parseClassificationResponse(text: string): EmailClassification {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse classification JSON: ${cleaned.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  const VALID_URGENCY = ['low', 'medium', 'high'];
  const VALID_SENTIMENT = ['positive', 'neutral', 'negative'];

  if (typeof obj.category !== 'string' || obj.category.length === 0) {
    throw new Error('Classification missing valid "category" field');
  }
  if (!VALID_URGENCY.includes(obj.urgency as string)) {
    throw new Error(`Classification has invalid urgency: ${obj.urgency}`);
  }
  if (!VALID_SENTIMENT.includes(obj.sentiment as string)) {
    throw new Error(`Classification has invalid sentiment: ${obj.sentiment}`);
  }
  if (typeof obj.requires_response !== 'boolean') {
    throw new Error('Classification missing boolean "requires_response" field');
  }
  if (typeof obj.summary !== 'string' || obj.summary.length === 0) {
    throw new Error('Classification missing valid "summary" field');
  }

  return {
    category: obj.category,
    sub_type: typeof obj.sub_type === 'string' ? obj.sub_type : null,
    urgency: obj.urgency as EmailClassification['urgency'],
    sentiment: obj.sentiment as EmailClassification['sentiment'],
    requires_response: obj.requires_response,
    summary: obj.summary,
  };
}

export async function classifyEmail(
  email: { subject: string | null; body: string | null; from_email: string },
  company: CompanyRecord,
): Promise<EmailClassification> {
  const systemPrompt = getSystemPrompt(company);
  const userMessage = buildUserMessage(email);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content in classification response');
  }

  return parseClassificationResponse(textBlock.text);
}
