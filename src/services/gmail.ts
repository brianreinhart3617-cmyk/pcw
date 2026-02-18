import type { gmail_v1 } from 'googleapis';
import type { ParsedEmail, SendEmailParams } from '../types/email';

/**
 * List message IDs from the inbox received after a given timestamp.
 * Defaults to last 5 minutes if no timestamp provided.
 */
export async function fetchNewMessageIds(
  gmail: gmail_v1.Gmail,
  afterTimestamp?: Date,
): Promise<string[]> {
  const after = afterTimestamp ?? new Date(Date.now() - 5 * 60 * 1000);
  const epochSeconds = Math.floor(after.getTime() / 1000);
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
      q: `after:${epochSeconds}`,
      pageToken,
      maxResults: 100,
    });

    if (res.data.messages) {
      for (const msg of res.data.messages) {
        if (msg.id) ids.push(msg.id);
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return ids;
}

/**
 * Fetch a full message and parse it into a normalized ParsedEmail.
 */
export async function getEmailDetails(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<ParsedEmail> {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const msg = res.data;
  const headers = msg.payload?.headers ?? [];

  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

  const fromRaw = getHeader('From');
  const { name: fromName, email: fromEmail } = parseFromHeader(fromRaw);

  const body = msg.payload ? extractBody(msg.payload) : '';

  return {
    gmail_message_id: msg.id!,
    thread_id: msg.threadId!,
    from_email: fromEmail,
    from_name: fromName,
    to_email: getHeader('To'),
    subject: getHeader('Subject'),
    body,
    received_at: new Date(Number(msg.internalDate)),
  };
}

/**
 * Send an email via the Gmail API. Used after approval queue releases a message.
 */
export async function sendEmail(
  gmail: gmail_v1.Gmail,
  params: SendEmailParams,
  fromEmail: string,
): Promise<{ messageId: string; threadId: string }> {
  const lines = [
    `From: ${fromEmail}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];

  if (params.in_reply_to) {
    lines.push(`In-Reply-To: ${params.in_reply_to}`);
    lines.push(`References: ${params.in_reply_to}`);
  }

  lines.push('', params.body);

  const raw = Buffer.from(lines.join('\r\n')).toString('base64url');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: params.thread_id,
    },
  });

  return {
    messageId: res.data.id!,
    threadId: res.data.threadId!,
  };
}

// --- Helpers ---

function parseFromHeader(raw: string): { name: string | null; email: string } {
  const match = raw.match(/^(?:"?(.+?)"?\s)?<?([^\s>]+@[^\s>]+)>?$/);
  if (match) {
    return { name: match[1]?.trim() || null, email: match[2] };
  }
  return { name: null, email: raw.trim() };
}

function extractBody(payload: gmail_v1.Schema$MessagePart): string {
  // Simple message (no parts)
  if (!payload.parts && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (!payload.parts) return '';

  // Prefer text/plain
  for (const part of payload.parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }

  // Recurse into multipart/* parts
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  // Fall back to text/html with tags stripped
  for (const part of payload.parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, '');
    }
  }

  return '';
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}
