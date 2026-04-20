import { escapeHtml } from '@/lib/utils/html-escape';

interface InviteEmailParams {
  workspaceName: string;
  inviterName: string;
  inviteUrl: string;
}

export function buildInviteEmail({ workspaceName, inviterName, inviteUrl }: InviteEmailParams) {
  // Strip newlines and carriage returns from subject to prevent header injection
  const subject = `دعوة للانضمام إلى ${workspaceName} على جينات`.replace(/[\r\n]/g, '');

  // Validate URL scheme — only allow http/https, escape double quotes for safe HTML embedding
  const safeUrl = /^https?:\/\//.test(inviteUrl) ? inviteUrl.replace(/"/g, '&quot;') : '';

  // Escape dynamic values to prevent HTML injection in the email body
  const safeInviterName = escapeHtml(inviterName);
  const safeWorkspaceName = escapeHtml(workspaceName);

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="dark only" />
  <meta name="supported-color-schemes" content="dark only" />
  <title>دعوة للانضمام إلى ${safeWorkspaceName}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .padding-mobile { padding-left: 28px !important; padding-right: 28px !important; }
      .heading-mobile { font-size: 26px !important; line-height: 1.25 !important; }
      .medallion-mobile { width: 56px !important; height: 56px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #070b18; font-family: 'IBM Plex Sans Arabic', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;">
  <!-- Preheader (hidden in body, visible in inbox preview) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #070b18;">
    ${safeInviterName} يدعوك للانضمام إلى عائلة ${safeWorkspaceName} — جينات، ذاكرةٌ مصونة.
  </div>

  <!-- Outer obsidian wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #070b18;">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <!-- Card -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" align="center" class="email-container" style="margin: auto; max-width: 560px; background-color: #0f1528; background-image: linear-gradient(180deg, #0f1528 0%, #070b18 100%); border-radius: 20px; overflow: hidden; border: 1px solid rgba(200, 168, 101, 0.22);">

          <!-- Gold seam (1px gradient line at top) -->
          <tr>
            <td style="line-height: 0; font-size: 0; height: 1px; background-color: #c8a865; background-image: linear-gradient(90deg, rgba(200, 168, 101, 0) 0%, rgba(200, 168, 101, 0.9) 50%, rgba(200, 168, 101, 0) 100%);">&nbsp;</td>
          </tr>

          <!-- Brand medallion -->
          <tr>
            <td style="padding: 48px 48px 20px 48px; text-align: center;" class="padding-mobile">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: auto;">
                <tr>
                  <td class="medallion-mobile" style="width: 64px; height: 64px; background-color: #c8a865; background-image: linear-gradient(135deg, #e6cf9e 0%, #c8a865 45%, #8c7441 100%); border-radius: 50%; text-align: center; vertical-align: middle; border: 1px solid rgba(255, 255, 255, 0.25); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);">
                    <span style="font-family: 'Reem Kufi', 'Amiri', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 30px; color: #070b18; font-weight: 600; line-height: 64px; mso-line-height-rule: exactly;">&#1580;</span>
                  </td>
                </tr>
              </table>
              <p style="margin: 18px 0 0 0; font-family: 'Reem Kufi', 'Amiri', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 20px; font-weight: 500; color: #f4ead4; letter-spacing: 0.04em;">
                جينات
              </p>
              <p style="margin: 4px 0 0 0; font-size: 10px; font-weight: 500; color: #c8a865; letter-spacing: 0.28em; text-transform: uppercase;">
                نَسَبٌ موثَّق
              </p>
            </td>
          </tr>

          <!-- Ornament divider (top) -->
          <tr>
            <td style="padding: 24px 48px 0 48px; text-align: center;" class="padding-mobile">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: auto;">
                <tr>
                  <td style="width: 64px; height: 1px; line-height: 0; font-size: 0; background-color: rgba(200, 168, 101, 0.35);">&nbsp;</td>
                  <td style="padding: 0 12px; color: #c8a865; font-size: 10px; line-height: 1;">&#9670;</td>
                  <td style="width: 64px; height: 1px; line-height: 0; font-size: 0; background-color: rgba(200, 168, 101, 0.35);">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Headline + body -->
          <tr>
            <td style="padding: 28px 48px 8px 48px; text-align: right;" class="padding-mobile" dir="rtl">
              <p style="margin: 0 0 12px 0; font-size: 10px; font-weight: 500; color: #c8a865; letter-spacing: 0.28em; text-transform: uppercase;">
                دعوة عائليّة
              </p>
              <h1 class="heading-mobile" style="margin: 0 0 20px 0; font-family: 'Reem Kufi', 'Amiri', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 30px; font-weight: 500; color: #f4ead4; line-height: 1.25; letter-spacing: -0.01em; text-align: right;">
                انضمّ إلى شجرة <span style="color: #e6cf9e;">${safeWorkspaceName}</span>
              </h1>
              <p style="margin: 0 0 12px 0; font-size: 14.5px; font-weight: 300; color: rgba(244, 234, 212, 0.72); line-height: 1.95; text-align: right;">
                قام <span style="color: #e6cf9e; font-weight: 500;">${safeInviterName}</span> بدعوتك للانضمام إلى مساحة <span style="color: #e6cf9e; font-weight: 500;">${safeWorkspaceName}</span> على جينات — حيث تُحفظ أسماء الأجداد وتُروى حكاياتهم عبر الأجيال.
              </p>
            </td>
          </tr>

          <!-- CTA button -->
          ${safeUrl ? `<tr>
            <td style="padding: 28px 48px 24px 48px; text-align: center;" class="padding-mobile" dir="rtl">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="50%" strokecolor="#c8a865" strokeweight="1px" fillcolor="#c8a865">
                <w:anchorlock/>
                <center style="color:#070b18;font-family:'Segoe UI',Tahoma,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.02em;">قبول الدعوة &#8592;</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: auto;">
                <tr>
                  <td style="border-radius: 999px; background-color: #c8a865; background-image: linear-gradient(135deg, #e6cf9e 0%, #c8a865 100%); border: 1px solid rgba(255, 255, 255, 0.35); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 8px 24px rgba(200, 168, 101, 0.25);">
                    <a href="${safeUrl}" target="_blank" style="display: inline-block; padding: 16px 44px; font-family: 'Reem Kufi', 'Amiri', 'Segoe UI', Tahoma, sans-serif; font-size: 15px; font-weight: 500; color: #070b18; text-decoration: none; border-radius: 999px; letter-spacing: 0.02em; mso-line-height-rule: exactly; line-height: 1;">
                      قبول الدعوة &#8592;
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding: 0 48px 36px 48px;" class="padding-mobile" dir="rtl">
              <p style="margin: 0 0 6px 0; font-size: 11px; color: rgba(244, 234, 212, 0.45); line-height: 1.7; text-align: right; letter-spacing: 0.02em;">
                لا يعمل الزر؟ انسخ الرابط التالي وألصقه في المتصفح:
              </p>
              <p style="margin: 0; font-family: 'SF Mono', 'Menlo', Consolas, monospace; font-size: 11px; word-break: break-all; text-align: left; direction: ltr; padding: 10px 14px; background-color: rgba(200, 168, 101, 0.06); border: 1px dashed rgba(200, 168, 101, 0.22); border-radius: 8px;">
                <a href="${safeUrl}" style="color: #e6cf9e; text-decoration: none; letter-spacing: 0.02em;">${safeUrl}</a>
              </p>
            </td>
          </tr>` : ''}

          <!-- Ornament divider (bottom) -->
          <tr>
            <td style="padding: 0 48px 24px 48px; text-align: center;" class="padding-mobile">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: auto;">
                <tr>
                  <td style="width: 64px; height: 1px; line-height: 0; font-size: 0; background-color: rgba(200, 168, 101, 0.25);">&nbsp;</td>
                  <td style="padding: 0 12px; color: #c8a865; font-size: 9px; line-height: 1; opacity: 0.7;">&#9670;</td>
                  <td style="width: 64px; height: 1px; line-height: 0; font-size: 0; background-color: rgba(200, 168, 101, 0.25);">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 48px 16px 48px; text-align: center;" class="padding-mobile">
              <p style="margin: 0; font-size: 11px; color: rgba(244, 234, 212, 0.4); line-height: 1.7; letter-spacing: 0.02em;">
                إن لم تكن تتوقّع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.
              </p>
            </td>
          </tr>

          <!-- Arabic tagline -->
          <tr>
            <td style="padding: 8px 48px 40px 48px; text-align: center;" class="padding-mobile">
              <p style="margin: 0; font-family: 'Amiri', 'Reem Kufi', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, serif; font-size: 14px; font-style: italic; color: rgba(200, 168, 101, 0.55); letter-spacing: 0.04em;">
                &#65148; وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا &#65147;
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <!-- Outside-card wordmark -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" align="center" class="email-container" style="margin: 16px auto 0 auto; max-width: 560px;">
          <tr>
            <td style="text-align: center; padding: 12px 0;">
              <p style="margin: 0; font-family: 'Reem Kufi', 'Amiri', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 11px; color: rgba(200, 168, 101, 0.45); letter-spacing: 0.32em; text-transform: uppercase;">
                gynat &nbsp;&middot;&nbsp; ذاكرة مصونة
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `جينات — دعوة عائليّة

قام ${inviterName} بدعوتك للانضمام إلى مساحة ${workspaceName} على جينات — حيث تُحفظ أسماء الأجداد وتُروى حكاياتهم عبر الأجيال.
${safeUrl ? `
لقبول الدعوة، افتح الرابط التالي:
${safeUrl}
` : ''}
إن لم تكن تتوقّع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.

﴾ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا ﴿`;

  return { subject, html, text };
}
