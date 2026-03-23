import { escapeHtml } from '@/lib/utils/html-escape';

interface InviteEmailParams {
  workspaceName: string;
  inviterName: string;
  inviteUrl: string;
}

export function buildInviteEmail({ workspaceName, inviterName, inviteUrl }: InviteEmailParams) {
  const subject = `دعوة للانضمام إلى ${workspaceName} على سلالة`;

  // Escape dynamic values to prevent HTML injection in the email body
  const safeInviterName = escapeHtml(inviterName);
  const safeWorkspaceName = escapeHtml(workspaceName);

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #1a5c3a; padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">سلالة</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <p style="font-size: 18px; color: #333; margin: 0 0 16px;">مرحبا،</p>
              <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 24px;">
                قام <strong>${safeInviterName}</strong> بدعوتك للانضمام إلى عائلة <strong>${safeWorkspaceName}</strong> على منصة سلالة.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 24px;">
                <tr>
                  <td style="background-color: #1a5c3a; border-radius: 6px;">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold;">قبول الدعوة</a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 14px; color: #888; line-height: 1.6; margin: 0;">
                إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذا البريد الإلكتروني.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #fafafa; padding: 16px 24px; text-align: center;">
              <p style="font-size: 12px; color: #aaa; margin: 0;">سلالة - منصة العائلة</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `مرحبا،

قام ${inviterName} بدعوتك للانضمام إلى عائلة ${workspaceName} على منصة سلالة.

لقبول الدعوة، افتح الرابط التالي:
${inviteUrl}

إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذا البريد الإلكتروني.`;

  return { subject, html, text };
}
