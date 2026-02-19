const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Approval Queue ───

export interface PendingEmailItem {
  type: 'email';
  conversationId: string;
  companyName: string;
  clientEmail: string;
  clientName: string | null;
  subject: string | null;
  category: string | null;
  draftBody: string;
  updatedAt: string;
}

export interface PendingDeliverableItem {
  type: 'deliverable';
  deliverableId: string;
  conversationId: string;
  deliverableType: string;
  version: number;
  content: Record<string, unknown> | null;
  previewUrls: string[] | null;
  createdAt: string;
}

export type PendingItem = PendingEmailItem | PendingDeliverableItem;

export function fetchQueue() {
  return request<{ items: PendingItem[]; count: number }>('/approval/queue');
}

export function approveEmail(conversationId: string) {
  return request<{ status: string }>(`/approval/emails/${conversationId}/approve`, {
    method: 'POST',
  });
}

export function rejectEmail(conversationId: string, feedback: string, permanent = false) {
  return request<{ status: string }>(`/approval/emails/${conversationId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ feedback, permanent }),
  });
}

export function requestChangesEmail(conversationId: string, feedback: string) {
  return request<{ status: string }>(`/approval/emails/${conversationId}/request-changes`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
}

export function approveDeliverable(deliverableId: string) {
  return request<{ status: string }>(`/approval/deliverables/${deliverableId}/approve`, {
    method: 'POST',
  });
}

export function rejectDeliverable(deliverableId: string, feedback: string) {
  return request<{ status: string }>(`/approval/deliverables/${deliverableId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
}

export function requestChangesDeliverable(deliverableId: string, feedback: string) {
  return request<{ status: string }>(`/approval/deliverables/${deliverableId}/request-changes`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
}

// ─── Emails ───

export interface EmailLogRow {
  id: string;
  company_id: string;
  direction: 'inbound' | 'outbound';
  from_email: string;
  to_email: string;
  subject: string | null;
  body: string | null;
  classification: Record<string, unknown> | null;
  gmail_message_id: string;
  conversation_id: string | null;
  sent_at: string;
}

export function fetchEmails() {
  return request<EmailLogRow[]>('/emails');
}

export function triggerPoll() {
  return request<{ status: string }>('/emails/poll', { method: 'POST' });
}

// ─── Conversations ───

export interface ConversationRow {
  id: string;
  company_id: string;
  thread_id: string | null;
  client_email: string;
  client_name: string | null;
  category: string | null;
  sub_type: string | null;
  status: string;
  conversation_history: Array<{
    role: string;
    content: string;
    timestamp: string;
    subject?: string;
  }>;
  created_at: string;
  updated_at: string;
  companies: { name: string } | null;
}

export function fetchConversations(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return request<ConversationRow[]>(`/conversations${qs}`);
}

// ─── Companies ───

export interface CompanyRow {
  id: string;
  name: string;
  type: string;
  gmail_address: string;
  is_active: boolean;
  created_at: string;
}

export function fetchCompanies() {
  return request<CompanyRow[]>('/companies');
}

// ─── Integrations ───

export function fetchMakeStatus() {
  return request<{ configured: boolean; webhookUrl: string | null }>('/make/status');
}

export function fetchCanvaStatus() {
  return request<{ status: string }>('/canva/status');
}

export function testMakeWebhook() {
  return request<{ status: string }>('/make/test', { method: 'POST' });
}

export function fetchHealth() {
  return request<{ status: string; timestamp: string }>('/../health');
}
