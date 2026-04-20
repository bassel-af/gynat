/**
 * Production safety guard for the email transport layer.
 *
 * Refuses to let the app run in production with a Mailpit-like loopback or
 * mail-trap SMTP target. Mailpit is a local-only test trap; sending real user
 * mail to it would silently swallow account recovery and invitation emails.
 */

const MAIL_TRAP_HOSTS = new Set([
  'mailpit',
  'solalah-mailpit',
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
]);

export function assertProductionSafe(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const host = (process.env.SMTP_HOST || '').trim().toLowerCase();
  if (!host) return;
  if (MAIL_TRAP_HOSTS.has(host)) {
    throw new Error(
      `SMTP safety check: refusing to start in production with mail-trap host "${host}". ` +
        `Configure a real SMTP server (e.g. smtp.gmail.com) before deploying.`
    );
  }
}
