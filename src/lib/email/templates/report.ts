import { escapeHtml } from '@/lib/utils/html-escape';

interface ReportEmailParams {
  /** The reported tree's display name (family name). */
  familyName: string;
  /** The free-text complaint composed by the reporter (category + details). */
  reason: string;
  /** Optional contact the reporter left for a reply. */
  reporterContact?: string | null;
  /** Public link to view the reported tree. */
  publicUrl: string;
  /** The public slug + internal IDs, for locating the tree in the backend. */
  publicSlug: string;
  treeId: string;
  workspaceId: string;
}

/**
 * Internal alert email sent to the platform inbox (contact@gynat.com) when a
 * public tree is reported (PRD §1.5, §8.2). Branded like the invitation email
 * (obsidian + gold). All dynamic values are HTML-escaped; the subject is
 * stripped of CR/LF to prevent header injection. No action is taken
 * automatically — reports are reviewed and handled manually in the backend.
 */
export function buildReportEmail({
  familyName,
  reason,
  reporterContact,
  publicUrl,
  publicSlug,
  treeId,
  workspaceId,
}: ReportEmailParams) {
  const subject = `بلاغ جديد عن شجرة ${familyName} — جينات`.replace(/[\r\n]/g, '');

  const safeUrl = /^https?:\/\//.test(publicUrl) ? publicUrl.replace(/"/g, '&quot;') : '';
  const safeFamilyName = escapeHtml(familyName);
  const safeReasonHtml = escapeHtml(reason).replace(/\r?\n/g, '<br />');
  const safeContact = reporterContact ? escapeHtml(reporterContact) : '';
  const safeSlug = escapeHtml(publicSlug);
  const safeTreeId = escapeHtml(treeId);
  const safeWorkspaceId = escapeHtml(workspaceId);

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="dark only" />
  <meta name="supported-color-schemes" content="dark only" />
  <title>بلاغ جديد عن شجرة ${safeFamilyName}</title>
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
      .heading-mobile { font-size: 24px !important; line-height: 1.3 !important; }
      .medallion-mobile { width: 56px !important; height: 56px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #070b18; font-family: 'IBM Plex Sans Arabic', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;">
  <!-- Preheader (hidden in body, visible in inbox preview) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #070b18;">
    وصل بلاغ بخصوص شجرة ${safeFamilyName} العامّة — للمراجعة اليدويّة.
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
                بلاغ عن محتوى
              </p>
              <h1 class="heading-mobile" style="margin: 0 0 20px 0; font-family: 'Reem Kufi', 'Amiri', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 28px; font-weight: 500; color: #f4ead4; line-height: 1.3; letter-spacing: -0.01em; text-align: right;">
                بلاغ جديد بخصوص شجرة <span style="color: #e6cf9e;">${safeFamilyName}</span>
              </h1>
              <p style="margin: 0 0 12px 0; font-size: 14.5px; font-weight: 300; color: rgba(244, 234, 212, 0.72); line-height: 1.95; text-align: right;">
                وصلنا بلاغٌ من زائرٍ بخصوص هذه الشجرة العامّة. لا يُتّخذ أيُّ إجراءٍ تلقائيّاً؛ تُراجَع البلاغات وتُعالَج يدويّاً.
              </p>
            </td>
          </tr>

          <!-- Reason block -->
          <tr>
            <td style="padding: 12px 48px 0 48px;" class="padding-mobile" dir="rtl">
              <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 500; color: #c8a865; letter-spacing: 0.22em; text-transform: uppercase;">
                سبب البلاغ
              </p>
              <div style="font-size: 14px; color: rgba(244, 234, 212, 0.82); line-height: 1.85; text-align: right; padding: 14px 18px; background-color: rgba(200, 168, 101, 0.06); border: 1px solid rgba(200, 168, 101, 0.18); border-radius: 12px;">
                ${safeReasonHtml}
              </div>
            </td>
          </tr>

          <!-- Reporter contact -->
          <tr>
            <td style="padding: 18px 48px 0 48px;" class="padding-mobile" dir="rtl">
              <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 500; color: #c8a865; letter-spacing: 0.22em; text-transform: uppercase;">
                وسيلة تواصل المُبلِّغ
              </p>
              <p style="margin: 0; font-size: 14px; color: ${safeContact ? '#e6cf9e' : 'rgba(244, 234, 212, 0.45)'}; line-height: 1.7; text-align: right;">
                ${safeContact || 'لم يترك المُبلِّغ وسيلة تواصل'}
              </p>
            </td>
          </tr>

          <!-- CTA: view the public tree -->
          ${safeUrl ? `<tr>
            <td style="padding: 28px 48px 8px 48px; text-align: center;" class="padding-mobile" dir="rtl">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="50%" strokecolor="#c8a865" strokeweight="1px" fillcolor="#c8a865">
                <w:anchorlock/>
                <center style="color:#070b18;font-family:'Segoe UI',Tahoma,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.02em;">عرض الشجرة العامّة &#8592;</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: auto;">
                <tr>
                  <td style="border-radius: 999px; background-color: #c8a865; background-image: linear-gradient(135deg, #e6cf9e 0%, #c8a865 100%); border: 1px solid rgba(255, 255, 255, 0.35); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 8px 24px rgba(200, 168, 101, 0.25);">
                    <a href="${safeUrl}" target="_blank" style="display: inline-block; padding: 16px 44px; font-family: 'Reem Kufi', 'Amiri', 'Segoe UI', Tahoma, sans-serif; font-size: 15px; font-weight: 500; color: #070b18; text-decoration: none; border-radius: 999px; letter-spacing: 0.02em; mso-line-height-rule: exactly; line-height: 1;">
                      عرض الشجرة العامّة &#8592;
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>` : ''}

          <!-- Ornament divider (bottom) -->
          <tr>
            <td style="padding: 24px 48px 0 48px; text-align: center;" class="padding-mobile">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: auto;">
                <tr>
                  <td style="width: 64px; height: 1px; line-height: 0; font-size: 0; background-color: rgba(200, 168, 101, 0.25);">&nbsp;</td>
                  <td style="padding: 0 12px; color: #c8a865; font-size: 9px; line-height: 1; opacity: 0.7;">&#9670;</td>
                  <td style="width: 64px; height: 1px; line-height: 0; font-size: 0; background-color: rgba(200, 168, 101, 0.25);">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Technical reference (for locating the tree in the backend) -->
          <tr>
            <td style="padding: 20px 48px 36px 48px;" class="padding-mobile" dir="rtl">
              <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 500; color: rgba(200, 168, 101, 0.7); letter-spacing: 0.22em; text-transform: uppercase;">
                مرجع تقنيّ
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family: 'SF Mono', 'Menlo', Consolas, monospace; font-size: 11px; direction: ltr; text-align: left; background-color: rgba(200, 168, 101, 0.06); border: 1px dashed rgba(200, 168, 101, 0.22); border-radius: 8px;">
                <tr><td style="padding: 10px 14px 2px 14px; color: rgba(244, 234, 212, 0.5);">slug:&nbsp;<span style="color: #e6cf9e;">${safeSlug}</span></td></tr>
                <tr><td style="padding: 2px 14px; color: rgba(244, 234, 212, 0.5);">treeId:&nbsp;<span style="color: #e6cf9e;">${safeTreeId}</span></td></tr>
                <tr><td style="padding: 2px 14px 10px 14px; color: rgba(244, 234, 212, 0.5);">workspaceId:&nbsp;<span style="color: #e6cf9e;">${safeWorkspaceId}</span></td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 48px 16px 48px; text-align: center;" class="padding-mobile">
              <p style="margin: 0; font-size: 11px; color: rgba(244, 234, 212, 0.4); line-height: 1.7; letter-spacing: 0.02em;">
                رسالةٌ تلقائيّة من جينات — لا حاجة للردّ عليها.
              </p>
            </td>
          </tr>

          <!-- Arabic tagline -->
          <tr>
            <td style="padding: 8px 48px 40px 48px; text-align: center;" class="padding-mobile">
              <p style="margin: 0; font-family: 'Amiri', 'Reem Kufi', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, serif; font-size: 14px; font-style: italic; color: rgba(200, 168, 101, 0.55); letter-spacing: 0.04em;">
                وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا
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

  const text = `جينات — بلاغ عن محتوى

وصل بلاغ من زائر بخصوص شجرة ${familyName} العامّة. لا يُتّخذ أي إجراء تلقائياً؛ تُراجَع البلاغات وتُعالَج يدوياً.

سبب البلاغ:
${reason}

وسيلة تواصل المُبلِّغ: ${reporterContact || 'لم يترك المُبلِّغ وسيلة تواصل'}
${safeUrl ? `
لعرض الشجرة العامّة:
${safeUrl}
` : ''}
مرجع تقنيّ:
slug: ${publicSlug}
treeId: ${treeId}
workspaceId: ${workspaceId}

رسالة تلقائية من جينات — لا حاجة للرد عليها.

وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا`;

  return { subject, html, text };
}
