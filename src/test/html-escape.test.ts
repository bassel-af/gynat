import { describe, test, expect } from 'vitest';

// Tests written before the implementation exists — these should fail initially.
// Finding 13: Email Template HTML Injection

describe('escapeHtml', () => {
  test('escapes script tags', async () => {
    const { escapeHtml } = await import('@/lib/utils/html-escape');
    const input = "<script>alert('xss')</script>";
    const result = escapeHtml(input);
    expect(result).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  test('escapes anchor tags', async () => {
    const { escapeHtml } = await import('@/lib/utils/html-escape');
    const input = '<a href="evil">click</a>';
    const result = escapeHtml(input);
    expect(result).toBe('&lt;a href=&quot;evil&quot;&gt;click&lt;/a&gt;');
  });

  test('passes normal text through unchanged', async () => {
    const { escapeHtml } = await import('@/lib/utils/html-escape');
    const input = 'Hello World 123';
    const result = escapeHtml(input);
    expect(result).toBe('Hello World 123');
  });

  test('passes Arabic text through unchanged', async () => {
    const { escapeHtml } = await import('@/lib/utils/html-escape');
    const input = 'مرحبا بالعالم';
    const result = escapeHtml(input);
    expect(result).toBe('مرحبا بالعالم');
  });

  test('escapes ampersands', async () => {
    const { escapeHtml } = await import('@/lib/utils/html-escape');
    const input = 'Tom & Jerry';
    const result = escapeHtml(input);
    expect(result).toBe('Tom &amp; Jerry');
  });
});

describe('buildInviteEmail escapes dynamic values', () => {
  test('escapes inviterName in HTML output', async () => {
    const { buildInviteEmail } = await import('@/lib/email/templates/invite');
    const { html } = buildInviteEmail({
      workspaceName: 'آل سعيد',
      inviterName: '<script>alert("xss")</script>',
      inviteUrl: 'http://localhost:3000/invite/test',
    });
    // The raw <script> tag should NOT appear in the HTML
    expect(html).not.toContain('<script>alert');
    // The escaped version should appear
    expect(html).toContain('&lt;script&gt;');
  });

  test('escapes workspaceName in HTML output', async () => {
    const { buildInviteEmail } = await import('@/lib/email/templates/invite');
    const { html } = buildInviteEmail({
      workspaceName: '<img onerror="alert(1)" src=x>',
      inviterName: 'باسل',
      inviteUrl: 'http://localhost:3000/invite/test',
    });
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img');
  });
});
