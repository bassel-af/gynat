/**
 * Live Mailpit HTTP API tests.
 *
 * Requires `cd docker && docker compose up -d mailpit` before running.
 * Run with: pnpm test:e2e
 */

import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { MailpitClient } from '@/lib/email/test/mailpit-client';

const MAILPIT_API = process.env.MAILPIT_API_URL || 'http://localhost:8125';
const SMTP_HOST = '127.0.0.1';
const SMTP_PORT = Number(process.env.MAILPIT_SMTP_PORT || 1125);

function uniqueAddress(label: string): string {
  return `${label}-${randomUUID()}@test.solalah.local`;
}

async function sendTestMail(to: string, subject: string, html: string, text?: string) {
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
  });
  await transport.sendMail({
    from: '"Solalah Tests" <tests@test.solalah.local>',
    to,
    subject,
    html,
    text: text ?? html.replace(/<[^>]+>/g, ''),
  });
}

describe('MailpitClient — live Mailpit API', () => {
  let client: MailpitClient;

  beforeAll(async () => {
    // Fail fast if Mailpit isn't reachable — better error than a timeout later.
    const probe = await fetch(`${MAILPIT_API}/readyz`).catch(() => null);
    if (!probe || !probe.ok) {
      throw new Error(
        `Mailpit not reachable at ${MAILPIT_API}. Run: cd docker && docker compose up -d mailpit`
      );
    }
    client = new MailpitClient(MAILPIT_API);
  });

  beforeEach(async () => {
    await client.clearMailbox();
  });

  test('clearMailbox empties the inbox', async () => {
    await sendTestMail(uniqueAddress('clear'), 'before clear', '<p>hi</p>');
    // Allow Mailpit a moment to persist.
    await client.waitForEmail(uniqueAddress('noone'), { timeoutMs: 10 }).catch(() => {});
    await client.clearMailbox();
    const messages = await client.getMessagesTo(uniqueAddress('clear'));
    expect(messages).toEqual([]);
  });

  test('getMessagesTo returns messages sent to a specific address', async () => {
    const alice = uniqueAddress('alice');
    const bob = uniqueAddress('bob');
    await sendTestMail(alice, 'for alice', '<p>hello alice</p>');
    await sendTestMail(bob, 'for bob', '<p>hello bob</p>');

    const aliceMessages = await client.waitForEmail(alice);
    expect(aliceMessages.subject).toBe('for alice');

    const bobMatches = await client.getMessagesTo(bob);
    expect(bobMatches).toHaveLength(1);
    expect(bobMatches[0].subject).toBe('for bob');
  });

  test('getLastEmail returns the most recently received message', async () => {
    const addr = uniqueAddress('last');
    await sendTestMail(addr, 'first', '<p>1</p>');
    await client.waitForEmail(addr);
    await sendTestMail(addr, 'second', '<p>2</p>');

    // Poll until we see both.
    const messages = await client.waitForCount(addr, 2);
    expect(messages).toHaveLength(2);

    const last = await client.getLastEmail(addr);
    expect(last.subject).toBe('second');
  });

  test('waitForEmail throws a clear error when no mail arrives in time', async () => {
    const addr = uniqueAddress('timeout');
    await expect(
      client.waitForEmail(addr, { timeoutMs: 300, pollIntervalMs: 50 })
    ).rejects.toThrow(/timed out|timeout/i);
  });

  test('getMessage returns the full message body (HTML + text)', async () => {
    const addr = uniqueAddress('body');
    const html = '<p>subject body <a href="https://solalah.test/x">link</a></p>';
    await sendTestMail(addr, 'with body', html, 'plain body text');

    const summary = await client.waitForEmail(addr);
    const full = await client.getMessage(summary.id);

    expect(full.html).toContain('https://solalah.test/x');
    expect(full.text).toContain('plain body text');
    expect(full.to).toContain(addr);
  });

  test('extractLink finds a specific href via a real HTML parser', async () => {
    const addr = uniqueAddress('link');
    const html = `
      <html><body>
        <p>Click below:</p>
        <a href="https://solalah.test/invite/abc-123?tok=xyz">Accept</a>
        <a href="https://solalah.test/unsubscribe">Unsubscribe</a>
      </body></html>
    `;
    await sendTestMail(addr, 'link test', html);
    const summary = await client.waitForEmail(addr);
    const full = await client.getMessage(summary.id);

    const accept = client.extractLink(full.html, { hrefContains: '/invite/' });
    expect(accept).toBe('https://solalah.test/invite/abc-123?tok=xyz');

    const unsub = client.extractLink(full.html, { hrefContains: '/unsubscribe' });
    expect(unsub).toBe('https://solalah.test/unsubscribe');
  });

  test('extractLink does not get fooled by angle brackets inside attributes', async () => {
    // This is the "regex over HTML" trap — a real parser handles it correctly.
    const html =
      '<a href="https://solalah.test/safe?a=%3Cscript%3E">safe link</a>';
    const link = client.extractLink(html, { hrefContains: '/safe' });
    expect(link).toBe('https://solalah.test/safe?a=%3Cscript%3E');
  });

  test('extractLink returns null when no matching link is found', () => {
    const html = '<a href="https://solalah.test/a">a</a>';
    const link = client.extractLink(html, { hrefContains: '/nope' });
    expect(link).toBeNull();
  });
});
