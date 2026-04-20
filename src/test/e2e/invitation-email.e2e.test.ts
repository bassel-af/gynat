/**
 * End-to-end test: invitation email template → real nodemailer → Mailpit SMTP.
 *
 * Exercises the same transport + template code path that the production
 * /api/workspaces/[id]/members POST handler uses, just with SMTP pointed at
 * the local Mailpit container so we can inspect the captured message
 * programmatically.
 *
 * Requires:
 *   cd docker && docker compose up -d mailpit
 * Run with:
 *   pnpm test:e2e
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MailpitClient } from '@/lib/email/test/mailpit-client';

const MAILPIT_API = process.env.MAILPIT_API_URL || 'http://localhost:8125';

describe('Invitation email — full flow through Mailpit', () => {
  let client: MailpitClient;

  beforeAll(async () => {
    const probe = await fetch(`${MAILPIT_API}/readyz`).catch(() => null);
    if (!probe || !probe.ok) {
      throw new Error(
        `Mailpit not reachable at ${MAILPIT_API}. Run: cd docker && docker compose up -d mailpit`
      );
    }
    client = new MailpitClient(MAILPIT_API);

    // Point the transport at Mailpit for the duration of this suite.
    vi.stubEnv('SMTP_HOST', '127.0.0.1');
    vi.stubEnv('SMTP_PORT', String(process.env.MAILPIT_SMTP_PORT || 1125));
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');
    vi.stubEnv('SMTP_SENDER_EMAIL', 'invites@test.solalah.local');
    vi.stubEnv('SMTP_SENDER_NAME', 'سُلالة (test)');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await client.clearMailbox();
  });

  test('sendEmail with invite template delivers to Mailpit with a working invite link', async () => {
    // Re-import to pick up the stubbed env. Transport module caches a transporter
    // on globalThis — use a fresh ESM import via query-string bust isn't trivial,
    // so we construct the transport lazily here.
    const { buildInviteEmail } = await import('@/lib/email/templates/invite');
    const { sendEmail } = await import('@/lib/email/transport');

    const recipient = `invite-${randomUUID()}@test.solalah.local`;
    const invitationId = randomUUID();
    const inviteUrl = `http://localhost:4000/invite/${invitationId}`;

    const content = buildInviteEmail({
      workspaceName: 'آل سعيد',
      inviterName: 'باسل',
      inviteUrl,
    });

    await sendEmail({ to: recipient, ...content });

    const summary = await client.waitForEmail(recipient);
    expect(summary.subject).toContain('آل سعيد');
    expect(summary.to).toContain(recipient);

    const full = await client.getMessage(summary.id);
    expect(full.html).toContain('dir="rtl"');
    expect(full.text).toContain('باسل');

    const link = client.extractLink(full.html, { hrefContains: '/invite/' });
    expect(link).toBe(inviteUrl);
  });

  test('production-mode guard refuses to send through Mailpit', async () => {
    const { sendEmail } = await import('@/lib/email/transport');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', 'localhost');

    try {
      await expect(
        sendEmail({
          to: `blocked-${randomUUID()}@test.solalah.local`,
          subject: 'should not send',
          html: '<p>nope</p>',
          text: 'nope',
        })
      ).rejects.toThrow(/production/i);
    } finally {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('SMTP_HOST', '127.0.0.1');
    }
  });
});
