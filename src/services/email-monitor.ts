import { supabase } from '../config/supabase';
import { buildGmailClient, getRefreshTokenForCompany } from '../config/gmail';
import { fetchNewMessageIds, getEmailDetails } from './gmail';
import type { CompanyRecord, EmailLogInsert } from '../types/email';

const POLL_INTERVAL_MS = 60_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function pollAllInboxes(): Promise<void> {
  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('[EmailMonitor] Failed to fetch companies:', error.message);
    return;
  }

  if (!companies || companies.length === 0) {
    console.log('[EmailMonitor] No active companies found');
    return;
  }

  for (const company of companies as CompanyRecord[]) {
    try {
      await pollCompanyInbox(company);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[EmailMonitor] Error polling ${company.name}:`, message);
    }
  }
}

async function pollCompanyInbox(company: CompanyRecord): Promise<void> {
  const refreshToken = getRefreshTokenForCompany(company.name);
  if (!refreshToken) {
    console.warn(`[EmailMonitor] No refresh token for ${company.name}, skipping`);
    return;
  }

  const gmail = buildGmailClient(refreshToken);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const messageIds = await fetchNewMessageIds(gmail, fiveMinutesAgo);

  if (messageIds.length === 0) return;

  // Batch-check which messages already exist
  const { data: existing } = await supabase
    .from('email_log')
    .select('gmail_message_id')
    .eq('company_id', company.id)
    .in('gmail_message_id', messageIds);

  const existingIds = new Set((existing ?? []).map((r) => r.gmail_message_id));
  const newIds = messageIds.filter((id) => !existingIds.has(id));

  for (const messageId of newIds) {
    try {
      const parsed = await getEmailDetails(gmail, messageId);

      const insert: EmailLogInsert = {
        company_id: company.id,
        direction: 'inbound',
        from_email: parsed.from_email,
        to_email: parsed.to_email,
        subject: parsed.subject,
        body: parsed.body,
        gmail_message_id: parsed.gmail_message_id,
        sent_at: parsed.received_at.toISOString(),
      };

      const { error: insertError } = await supabase
        .from('email_log')
        .insert(insert);

      if (insertError) {
        console.error(
          `[EmailMonitor] Failed to insert email ${messageId}:`,
          insertError.message,
        );
      } else {
        console.log(
          `[EmailMonitor] New email for ${company.name}: "${parsed.subject}" from ${parsed.from_email}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[EmailMonitor] Failed to process message ${messageId}:`, message);
    }
  }
}

export function startEmailMonitor(): void {
  console.log(
    `[EmailMonitor] Starting polling every ${POLL_INTERVAL_MS / 1000}s`,
  );

  pollAllInboxes().catch((err) =>
    console.error('[EmailMonitor] Initial poll failed:', err),
  );

  pollTimer = setInterval(() => {
    pollAllInboxes().catch((err) =>
      console.error('[EmailMonitor] Poll cycle failed:', err),
    );
  }, POLL_INTERVAL_MS);
}

export function stopEmailMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[EmailMonitor] Stopped');
  }
}
