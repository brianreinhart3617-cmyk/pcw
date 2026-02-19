import type { MakeWebhookEvent, MakeWebhookPayload } from '../types/make';

const LOG = '[Make]';

export function isMakeConfigured(): boolean {
  return !!process.env.MAKE_WEBHOOK_URL;
}

export async function fireMakeWebhook(event: MakeWebhookEvent): Promise<void> {
  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  const payload: MakeWebhookPayload = {
    event_type: event.event_type,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
    data: event.data,
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`${LOG} Webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} Failed to send webhook: ${message}`);
  }
}
