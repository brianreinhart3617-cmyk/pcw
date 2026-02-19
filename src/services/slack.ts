import type { SlackNotificationPayload } from '../types/approval';

export async function notifyApprovalNeeded(
  payload: SlackNotificationPayload,
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Slack] SLACK_WEBHOOK_URL not configured, skipping notification');
    return;
  }

  const emoji = payload.itemType === 'email' ? ':envelope:' : ':art:';
  const lines = [
    `${emoji} *New ${payload.itemType} pending approval*`,
    `*Company:* ${payload.companyName}`,
    `*Client:* ${payload.clientEmail}`,
    payload.subject ? `*Subject:* ${payload.subject}` : null,
    `*Summary:* ${payload.summary}`,
    payload.urgency ? `*Urgency:* ${payload.urgency}` : null,
  ].filter(Boolean);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n') }),
    });

    if (!res.ok) {
      console.error(`[Slack] Webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Slack] Failed to send notification: ${message}`);
  }
}
