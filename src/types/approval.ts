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

export interface SlackNotificationPayload {
  itemType: 'email' | 'deliverable';
  companyName: string;
  clientEmail: string;
  subject: string | null;
  summary: string;
  urgency?: string;
}
