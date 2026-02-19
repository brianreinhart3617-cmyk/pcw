import { supabase } from '../config/supabase';
import { classifyEmail } from '../agents/classifier';
import { generateResponse } from '../agents/response-agent';
import type {
  CompanyRecord,
  EmailClassification,
  ConversationInsert,
  ConversationHistoryEntry,
} from '../types/email';

export async function processNewEmail(
  emailLogId: string,
  company: CompanyRecord,
  threadId: string | null,
): Promise<void> {
  // 1. Fetch the email_log row
  const { data: emailRow, error: fetchError } = await supabase
    .from('email_log')
    .select('*')
    .eq('id', emailLogId)
    .single();

  if (fetchError || !emailRow) {
    console.error(`[EmailProcessor] Failed to fetch email_log ${emailLogId}:`, fetchError?.message);
    return;
  }

  // Skip if already classified (idempotency)
  if (emailRow.classification) {
    console.log(`[EmailProcessor] Email ${emailLogId} already classified, skipping`);
    return;
  }

  // 2. Classify
  let classification: EmailClassification;
  try {
    classification = await classifyEmail(
      {
        subject: emailRow.subject,
        body: emailRow.body,
        from_email: emailRow.from_email,
      },
      company,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[EmailProcessor] Classification failed for ${emailLogId}:`, message);
    return;
  }

  console.log(
    `[EmailProcessor] Classified ${emailLogId}: ${classification.category} (${classification.urgency})`,
  );

  // 3. Find or create conversation
  const conversationId = await upsertConversation(emailRow, company, classification, threadId);

  // 4. Update email_log with classification and conversation link
  const { error: updateError } = await supabase
    .from('email_log')
    .update({
      classification: classification as unknown as Record<string, unknown>,
      conversation_id: conversationId,
    })
    .eq('id', emailLogId);

  if (updateError) {
    console.error(`[EmailProcessor] Failed to update email_log ${emailLogId}:`, updateError.message);
  }

  // 5. Auto-draft response if needed
  if (classification.requires_response) {
    generateResponse(conversationId, classification, company).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[EmailProcessor] Response generation failed for conversation ${conversationId}:`,
        msg,
      );
    });
  }
}

async function upsertConversation(
  emailRow: { id: string; company_id: string; from_email: string; subject: string | null; body: string | null; sent_at: string },
  company: CompanyRecord,
  classification: EmailClassification,
  threadId: string | null,
): Promise<string> {
  const historyEntry: ConversationHistoryEntry = {
    role: 'client',
    content: emailRow.body ?? '',
    timestamp: emailRow.sent_at,
    email_log_id: emailRow.id,
  };

  // Primary match: by thread_id within the same company
  if (threadId) {
    const { data: threadMatch } = await supabase
      .from('conversations')
      .select('*')
      .eq('company_id', company.id)
      .eq('thread_id', threadId)
      .limit(1);

    if (threadMatch && threadMatch.length > 0) {
      const conv = threadMatch[0];
      const history = Array.isArray(conv.conversation_history)
        ? [...conv.conversation_history, historyEntry]
        : [historyEntry];

      await supabase
        .from('conversations')
        .update({
          conversation_history: history,
          category: classification.category,
          sub_type: classification.sub_type,
        })
        .eq('id', conv.id);

      return conv.id;
    }
  }

  // Fallback: match by client_email + active status
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('company_id', company.id)
    .eq('client_email', emailRow.from_email)
    .in('status', ['active', 'waiting_client', 'waiting_approval'])
    .order('updated_at', { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    const conv = existing[0];
    const history = Array.isArray(conv.conversation_history)
      ? [...conv.conversation_history, historyEntry]
      : [historyEntry];

    await supabase
      .from('conversations')
      .update({
        conversation_history: history,
        category: classification.category,
        sub_type: classification.sub_type,
      })
      .eq('id', conv.id);

    return conv.id;
  }

  // Create new conversation
  const insert: ConversationInsert = {
    company_id: company.id,
    thread_id: threadId,
    client_email: emailRow.from_email,
    client_name: null,
    category: classification.category,
    sub_type: classification.sub_type,
    status: classification.requires_response ? 'active' : 'ignored',
    conversation_history: [historyEntry],
  };

  const { data: newConv, error: insertError } = await supabase
    .from('conversations')
    .insert(insert)
    .select('id')
    .single();

  if (insertError || !newConv) {
    console.error('[EmailProcessor] Failed to create conversation:', insertError?.message);
    throw new Error('Failed to create conversation');
  }

  return newConv.id;
}
