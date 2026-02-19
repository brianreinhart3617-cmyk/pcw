import { supabase } from '../config/supabase';
import { buildGmailClient, getRefreshTokenForCompany } from '../config/gmail';
import { sendEmail } from './gmail';
import { notifyApprovalNeeded } from './slack';
import { fireMakeWebhook } from './make';
import type { CompanyRecord, ConversationHistoryEntry, EmailLogInsert } from '../types/email';
import type { PendingItem, PendingEmailItem, PendingDeliverableItem } from '../types/approval';

const LOG = '[ApprovalQueue]';

// ─── Draft Submission ───

export async function submitDraftResponse(
  conversationId: string,
  draftSubject: string,
  draftBody: string,
): Promise<void> {
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*, companies(*)')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const validStatuses = ['active', 'waiting_client'];
  if (!validStatuses.includes(conversation.status)) {
    throw new Error(
      `Cannot submit draft for conversation in status '${conversation.status}'`,
    );
  }

  const agentEntry: ConversationHistoryEntry = {
    role: 'agent',
    content: draftBody,
    timestamp: new Date().toISOString(),
    email_log_id: '',
    subject: draftSubject,
  };

  const history: ConversationHistoryEntry[] = Array.isArray(conversation.conversation_history)
    ? [...conversation.conversation_history, agentEntry]
    : [agentEntry];

  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      status: 'waiting_approval',
      conversation_history: history,
    })
    .eq('id', conversationId);

  if (updateError) {
    throw new Error(`Failed to update conversation: ${updateError.message}`);
  }

  const company = conversation.companies as CompanyRecord;
  notifyApprovalNeeded({
    itemType: 'email',
    companyName: company.name,
    clientEmail: conversation.client_email,
    subject: draftSubject,
    summary: draftBody.slice(0, 200),
  }).catch((err) => {
    console.error(`${LOG} Slack notification failed:`, err);
  });

  fireMakeWebhook({
    event_type: 'email.draft_ready',
    data: {
      conversationId,
      companyName: company.name,
      clientEmail: conversation.client_email,
      draftSubject,
      draftBodyPreview: draftBody.slice(0, 500),
    },
  }).catch((err) => {
    console.error(`${LOG} Make webhook failed:`, err);
  });

  console.log(`${LOG} Draft submitted for conversation ${conversationId}`);
}

// ─── List Pending Items ───

export async function listPendingItems(): Promise<PendingItem[]> {
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('*, companies(name)')
    .eq('status', 'waiting_approval')
    .order('updated_at', { ascending: false });

  if (convError) {
    throw new Error(`Failed to fetch pending conversations: ${convError.message}`);
  }

  const { data: deliverables, error: delError } = await supabase
    .from('deliverables')
    .select('*')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });

  if (delError) {
    throw new Error(`Failed to fetch pending deliverables: ${delError.message}`);
  }

  const items: PendingItem[] = [];

  for (const conv of conversations ?? []) {
    const history = conv.conversation_history as ConversationHistoryEntry[];
    const lastAgentEntry = [...history].reverse().find((e) => e.role === 'agent');

    const item: PendingEmailItem = {
      type: 'email',
      conversationId: conv.id,
      companyName: (conv.companies as { name: string })?.name ?? 'Unknown',
      clientEmail: conv.client_email,
      clientName: conv.client_name,
      subject: lastAgentEntry?.subject ?? null,
      category: conv.category,
      draftBody: lastAgentEntry?.content ?? '',
      updatedAt: conv.updated_at,
    };
    items.push(item);
  }

  for (const del of deliverables ?? []) {
    const item: PendingDeliverableItem = {
      type: 'deliverable',
      deliverableId: del.id,
      conversationId: del.conversation_id,
      deliverableType: del.type,
      version: del.version,
      content: del.content,
      previewUrls: del.preview_urls,
      createdAt: del.created_at,
    };
    items.push(item);
  }

  return items;
}

// ─── Email Actions ───

export async function approveEmail(
  conversationId: string,
): Promise<{ messageId: string; threadId: string }> {
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*, companies(*)')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  if (conversation.status !== 'waiting_approval') {
    throw new Error(
      `Conversation ${conversationId} is '${conversation.status}', expected 'waiting_approval'`,
    );
  }

  const company = conversation.companies as CompanyRecord;
  const history = conversation.conversation_history as ConversationHistoryEntry[];
  const lastAgentEntry = [...history].reverse().find((e) => e.role === 'agent');

  if (!lastAgentEntry) {
    throw new Error(`No agent draft found in conversation ${conversationId}`);
  }

  const draftSubject = lastAgentEntry.subject ?? '(no subject)';
  const draftBody = lastAgentEntry.content;

  // Build Gmail client for this company
  const refreshToken = getRefreshTokenForCompany(company.name);
  if (!refreshToken) {
    throw new Error(`No Gmail refresh token configured for ${company.name}`);
  }
  const gmail = buildGmailClient(refreshToken);

  // Look up last inbound message for threading
  const { data: lastInbound } = await supabase
    .from('email_log')
    .select('gmail_message_id')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1);

  const inReplyTo = lastInbound?.[0]?.gmail_message_id ?? undefined;

  // Send the email
  const sendResult = await sendEmail(
    gmail,
    {
      to: conversation.client_email,
      subject: draftSubject,
      body: draftBody,
      thread_id: conversation.thread_id ?? undefined,
      in_reply_to: inReplyTo,
    },
    company.gmail_address,
  );

  // Log outbound email
  const emailLogInsert: EmailLogInsert = {
    company_id: company.id,
    direction: 'outbound',
    from_email: company.gmail_address,
    to_email: conversation.client_email,
    subject: draftSubject,
    body: draftBody,
    gmail_message_id: sendResult.messageId,
    conversation_id: conversationId,
    sent_at: new Date().toISOString(),
  };

  const { data: insertedLog } = await supabase
    .from('email_log')
    .insert(emailLogInsert)
    .select('id')
    .single();

  // Update conversation: status + agent entry's email_log_id
  const updatedHistory = insertedLog
    ? history.map((entry) =>
        entry === lastAgentEntry ? { ...entry, email_log_id: insertedLog.id } : entry,
      )
    : history;

  await supabase
    .from('conversations')
    .update({
      status: 'waiting_client',
      conversation_history: updatedHistory,
      thread_id: conversation.thread_id ?? sendResult.threadId,
    })
    .eq('id', conversationId);

  fireMakeWebhook({
    event_type: 'email.approved',
    data: {
      conversationId,
      companyName: company.name,
      clientEmail: conversation.client_email,
      subject: draftSubject,
      messageId: sendResult.messageId,
      threadId: sendResult.threadId,
    },
  }).catch((err) => {
    console.error(`${LOG} Make webhook failed:`, err);
  });

  console.log(`${LOG} Email approved and sent for conversation ${conversationId}`);
  return sendResult;
}

export async function rejectEmail(
  conversationId: string,
  feedback: string,
  permanent: boolean = false,
): Promise<void> {
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error || !conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  if (conversation.status !== 'waiting_approval') {
    throw new Error(`Cannot reject conversation in status '${conversation.status}'`);
  }

  const history: ConversationHistoryEntry[] = Array.isArray(conversation.conversation_history)
    ? [...conversation.conversation_history]
    : [];

  history.push({
    role: 'system',
    content: `[REJECTED] ${feedback}`,
    timestamp: new Date().toISOString(),
    email_log_id: '',
  });

  await supabase
    .from('conversations')
    .update({
      status: permanent ? 'completed' : 'active',
      conversation_history: history,
    })
    .eq('id', conversationId);

  fireMakeWebhook({
    event_type: 'email.rejected',
    data: {
      conversationId,
      feedback,
      permanent,
    },
  }).catch((err) => {
    console.error(`${LOG} Make webhook failed:`, err);
  });

  console.log(`${LOG} Email rejected for conversation ${conversationId}`);
}

export async function requestChangesEmail(
  conversationId: string,
  feedback: string,
): Promise<void> {
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error || !conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  if (conversation.status !== 'waiting_approval') {
    throw new Error(`Cannot request changes for conversation in status '${conversation.status}'`);
  }

  const history: ConversationHistoryEntry[] = Array.isArray(conversation.conversation_history)
    ? [...conversation.conversation_history]
    : [];

  history.push({
    role: 'system',
    content: `[CHANGES REQUESTED] ${feedback}`,
    timestamp: new Date().toISOString(),
    email_log_id: '',
  });

  await supabase
    .from('conversations')
    .update({
      status: 'active',
      conversation_history: history,
    })
    .eq('id', conversationId);

  fireMakeWebhook({
    event_type: 'email.changes_requested',
    data: {
      conversationId,
      feedback,
    },
  }).catch((err) => {
    console.error(`${LOG} Make webhook failed:`, err);
  });

  console.log(`${LOG} Changes requested for conversation ${conversationId}`);
}

// ─── Deliverable Actions ───

export async function approveDeliverable(deliverableId: string): Promise<void> {
  const { error } = await supabase
    .from('deliverables')
    .update({ approval_status: 'approved' })
    .eq('id', deliverableId)
    .eq('approval_status', 'pending');

  if (error) {
    throw new Error(`Failed to approve deliverable ${deliverableId}: ${error.message}`);
  }

  fireMakeWebhook({
    event_type: 'deliverable.approved',
    data: { deliverableId },
  }).catch((err) => {
    console.error(`${LOG} Make webhook failed:`, err);
  });

  console.log(`${LOG} Deliverable ${deliverableId} approved`);
}

export async function rejectDeliverable(
  deliverableId: string,
  feedback: string,
): Promise<void> {
  const { error } = await supabase
    .from('deliverables')
    .update({
      approval_status: 'rejected',
      brian_feedback: feedback,
    })
    .eq('id', deliverableId)
    .eq('approval_status', 'pending');

  if (error) {
    throw new Error(`Failed to reject deliverable ${deliverableId}: ${error.message}`);
  }

  fireMakeWebhook({
    event_type: 'deliverable.rejected',
    data: { deliverableId, feedback },
  }).catch((err) => {
    console.error(`${LOG} Make webhook failed:`, err);
  });

  console.log(`${LOG} Deliverable ${deliverableId} rejected`);
}

export async function requestChangesDeliverable(
  deliverableId: string,
  feedback: string,
): Promise<void> {
  const { error } = await supabase
    .from('deliverables')
    .update({
      approval_status: 'changes_requested',
      brian_feedback: feedback,
    })
    .eq('id', deliverableId)
    .eq('approval_status', 'pending');

  if (error) {
    throw new Error(`Failed to request changes for deliverable ${deliverableId}: ${error.message}`);
  }

  fireMakeWebhook({
    event_type: 'deliverable.changes_requested',
    data: { deliverableId, feedback },
  }).catch((err) => {
    console.error(`${LOG} Make webhook failed:`, err);
  });

  console.log(`${LOG} Changes requested for deliverable ${deliverableId}`);
}
