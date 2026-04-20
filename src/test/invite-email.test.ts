import { describe, test, expect } from 'vitest';
import { buildInviteEmail } from '@/lib/email/templates/invite';

const params = {
  workspaceName: 'آل سعيد',
  inviterName: 'باسل',
  inviteUrl: 'http://localhost:3000/invite/inv-uuid-123',
};

describe('buildInviteEmail', () => {
  test('subject contains the workspace name', () => {
    const { subject } = buildInviteEmail(params);
    expect(subject).toContain('آل سعيد');
  });

  test('subject contains the app name', () => {
    const { subject } = buildInviteEmail(params);
    expect(subject).toContain('جينات');
  });

  test('html contains the invite URL', () => {
    const { html } = buildInviteEmail(params);
    expect(html).toContain(params.inviteUrl);
  });

  test('text contains the invite URL', () => {
    const { text } = buildInviteEmail(params);
    expect(text).toContain(params.inviteUrl);
  });

  test('html has RTL direction', () => {
    const { html } = buildInviteEmail(params);
    expect(html).toContain('dir="rtl"');
  });

  test('html contains the inviter name', () => {
    const { html } = buildInviteEmail(params);
    expect(html).toContain('باسل');
  });

  test('html contains the workspace name', () => {
    const { html } = buildInviteEmail(params);
    expect(html).toContain('آل سعيد');
  });

  test('text contains the inviter name', () => {
    const { text } = buildInviteEmail(params);
    expect(text).toContain('باسل');
  });

  test('html contains a CTA link element', () => {
    const { html } = buildInviteEmail(params);
    expect(html).toContain(`href="${params.inviteUrl}"`);
  });

  // Fix 2: inviteUrl validation and escaping
  test('includes valid https URL as a link in the email', () => {
    const { html } = buildInviteEmail({
      ...params,
      inviteUrl: 'https://gynat.com/invite/abc-123',
    });
    expect(html).toContain('href="https://gynat.com/invite/abc-123"');
  });

  test('does not include javascript: URI as a link', () => {
    const { html } = buildInviteEmail({
      ...params,
      inviteUrl: 'javascript:alert(1)',
    });
    expect(html).not.toContain('href="javascript:');
    // Should not contain any anchor tag with the malicious URL
    expect(html).not.toContain('javascript:alert');
  });

  test('escapes double quotes in URL within href attribute', () => {
    const { html } = buildInviteEmail({
      ...params,
      inviteUrl: 'https://example.com/invite?a="bad"',
    });
    // Double quotes should be escaped to &quot; in the href
    expect(html).toContain('href="https://example.com/invite?a=&quot;bad&quot;"');
    // Should NOT contain unescaped double quotes that would break the attribute
    expect(html).not.toContain('href="https://example.com/invite?a="bad""');
  });

  // Fix 3: Subject line header injection prevention
  test('subject strips newlines from workspace name to prevent header injection', () => {
    const { subject } = buildInviteEmail({
      ...params,
      workspaceName: 'Evil\r\nBcc: attacker@evil.com',
    });
    expect(subject).not.toContain('\r');
    expect(subject).not.toContain('\n');
    expect(subject).toContain('Evil');
  });
});
