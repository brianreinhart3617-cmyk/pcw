export interface CompanyRecord {
  id: string;
  name: string;
  type: 'bh_center' | 'marketing_company';
  gmail_address: string;
  is_active: boolean;
  system_prompt_classification: string | null;
  system_prompt_agent: string | null;
}

export interface ParsedEmail {
  gmail_message_id: string;
  thread_id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string;
  body: string;
  received_at: Date;
}

export interface EmailLogInsert {
  company_id: string;
  direction: 'inbound' | 'outbound';
  from_email: string;
  to_email: string;
  subject: string | null;
  body: string | null;
  gmail_message_id: string;
  conversation_id?: string;
  sent_at: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  thread_id?: string;
  in_reply_to?: string;
}

export interface EmailClassification {
  category: string;
  sub_type: string | null;
  urgency: 'low' | 'medium' | 'high';
  sentiment: 'positive' | 'neutral' | 'negative';
  requires_response: boolean;
  summary: string;
}

export interface ConversationHistoryEntry {
  role: 'client' | 'agent' | 'system';
  content: string;
  timestamp: string;
  email_log_id: string;
  subject?: string;
}

export interface ConversationInsert {
  company_id: string;
  thread_id: string | null;
  client_email: string;
  client_name: string | null;
  category: string;
  sub_type: string | null;
  status: 'active' | 'waiting_client' | 'waiting_approval' | 'completed' | 'ignored';
  conversation_history: ConversationHistoryEntry[];
}
