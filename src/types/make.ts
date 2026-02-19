import type { EmailClassification } from './email';

// ─── Event Data Types ───

export interface EmailClassifiedData {
  emailLogId: string;
  conversationId: string;
  companyId: string;
  companyName: string;
  fromEmail: string;
  subject: string | null;
  classification: EmailClassification;
}

export interface EmailDraftReadyData {
  conversationId: string;
  companyName: string;
  clientEmail: string;
  draftSubject: string;
  draftBodyPreview: string;
}

export interface EmailApprovedData {
  conversationId: string;
  companyName: string;
  clientEmail: string;
  subject: string;
  messageId: string;
  threadId: string;
}

export interface EmailRejectedData {
  conversationId: string;
  feedback: string;
  permanent: boolean;
}

export interface EmailChangesRequestedData {
  conversationId: string;
  feedback: string;
}

export interface DeliverableCreatedData {
  deliverableId: string;
  conversationId: string;
  companyName: string;
  clientEmail: string;
  type: string;
  version: number;
  canvaDesignUrl: string;
  exportUrls: string[];
}

export interface DeliverableApprovedData {
  deliverableId: string;
}

export interface DeliverableRejectedData {
  deliverableId: string;
  feedback: string;
}

export interface DeliverableChangesRequestedData {
  deliverableId: string;
  feedback: string;
}

export interface SystemTestData {
  message: string;
}

// ─── Discriminated Union ───

export type MakeWebhookEvent =
  | { event_type: 'email.classified'; data: EmailClassifiedData }
  | { event_type: 'email.draft_ready'; data: EmailDraftReadyData }
  | { event_type: 'email.approved'; data: EmailApprovedData }
  | { event_type: 'email.rejected'; data: EmailRejectedData }
  | { event_type: 'email.changes_requested'; data: EmailChangesRequestedData }
  | { event_type: 'deliverable.created'; data: DeliverableCreatedData }
  | { event_type: 'deliverable.approved'; data: DeliverableApprovedData }
  | { event_type: 'deliverable.rejected'; data: DeliverableRejectedData }
  | { event_type: 'deliverable.changes_requested'; data: DeliverableChangesRequestedData }
  | { event_type: 'system.test'; data: SystemTestData };

// ─── Envelope ───

export interface MakeWebhookPayload {
  event_type: MakeWebhookEvent['event_type'];
  timestamp: string;
  environment: string;
  data: MakeWebhookEvent['data'];
}
