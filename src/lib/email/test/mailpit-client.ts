/**
 * Mailpit HTTP API client for tests.
 *
 * SECURITY: refuses to connect to any non-loopback host. Mailpit is a
 * test-only mail trap and must never be reachable from outside the dev
 * machine. Loopback check is defense-in-depth on top of the 127.0.0.1
 * docker port binding.
 *
 * SECURITY: link extraction uses a real HTML parser (jsdom), not regex, so
 * malformed or hostile email bodies cannot mislead the test harness.
 */

import { JSDOM } from 'jsdom';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function assertLoopback(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`MailpitClient: invalid URL ${baseUrl}`);
  }
  const host = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `MailpitClient: refusing to connect to non-loopback host "${host}" — only localhost/127.0.0.1/::1 are allowed`
    );
  }
  return parsed;
}

export interface MessageSummary {
  id: string;
  subject: string;
  to: string[];
  from: string;
  receivedAt: string;
}

export interface FullMessage extends MessageSummary {
  html: string;
  text: string;
}

export interface WaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface ExtractLinkOptions {
  hrefContains?: string;
}

interface MailpitListMessage {
  ID: string;
  Subject: string;
  From?: { Address: string; Name: string };
  To?: Array<{ Address: string; Name: string }>;
  Created: string;
}

interface MailpitSearchResponse {
  messages: MailpitListMessage[];
}

interface MailpitFullMessage {
  ID: string;
  Subject: string;
  From: { Address: string; Name: string };
  To: Array<{ Address: string; Name: string }>;
  HTML: string;
  Text: string;
  Date: string;
}

export class MailpitClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    const parsed = assertLoopback(baseUrl);
    this.baseUrl = parsed.origin;
  }

  async clearMailbox(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/messages`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`MailpitClient.clearMailbox: HTTP ${res.status}`);
    }
  }

  async getMessagesTo(address: string): Promise<MessageSummary[]> {
    const query = `to:${address}`;
    const url = `${this.baseUrl}/api/v1/search?query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`MailpitClient.getMessagesTo: HTTP ${res.status}`);
    }
    const body = (await res.json()) as MailpitSearchResponse;
    return body.messages.map(toSummary);
  }

  async getLastEmail(address: string): Promise<MessageSummary> {
    const messages = await this.getMessagesTo(address);
    if (messages.length === 0) {
      throw new Error(`MailpitClient.getLastEmail: no messages for ${address}`);
    }
    // Mailpit returns newest-first.
    return messages[0];
  }

  async waitForEmail(
    address: string,
    options: WaitOptions = {}
  ): Promise<MessageSummary> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const messages = await this.getMessagesTo(address);
      if (messages.length > 0) return messages[0];
      await sleep(pollIntervalMs);
    }
    throw new Error(
      `MailpitClient.waitForEmail: timed out after ${timeoutMs}ms waiting for mail to ${address}`
    );
  }

  async waitForCount(
    address: string,
    count: number,
    options: WaitOptions = {}
  ): Promise<MessageSummary[]> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const messages = await this.getMessagesTo(address);
      if (messages.length >= count) return messages;
      await sleep(pollIntervalMs);
    }
    throw new Error(
      `MailpitClient.waitForCount: timed out after ${timeoutMs}ms waiting for ${count} messages to ${address}`
    );
  }

  async getMessage(id: string): Promise<FullMessage> {
    const res = await fetch(`${this.baseUrl}/api/v1/message/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(`MailpitClient.getMessage: HTTP ${res.status}`);
    }
    const body = (await res.json()) as MailpitFullMessage;
    return {
      id: body.ID,
      subject: body.Subject,
      from: body.From?.Address ?? '',
      to: (body.To ?? []).map((t) => t.Address),
      html: body.HTML ?? '',
      text: body.Text ?? '',
      receivedAt: body.Date,
    };
  }

  /**
   * Extract an href from a message HTML body using a real DOM parser.
   * Returns the first matching link's absolute href string, or null.
   */
  extractLink(html: string, options: ExtractLinkOptions = {}): string | null {
    const dom = new JSDOM(html);
    const anchors = Array.from(dom.window.document.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const href = a.getAttribute('href') ?? '';
      if (!href) continue;
      if (options.hrefContains && !href.includes(options.hrefContains)) continue;
      return href;
    }
    return null;
  }
}

function toSummary(m: MailpitListMessage): MessageSummary {
  return {
    id: m.ID,
    subject: m.Subject,
    from: m.From?.Address ?? '',
    to: (m.To ?? []).map((t) => t.Address),
    receivedAt: m.Created,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
