import { escapeHtml } from '@/lib/utils/html-escape';

interface FeedbackRequestEmailParams {
  recipientName: string;
  /** data: URI or hosted https:// URL for the brand mark shown at the top of the email. */
  logoSrc: string;
}

export function buildFeedbackRequestEmail({ recipientName, logoSrc }: FeedbackRequestEmailParams) {
  const subject = 'رأيك يهمّنا في جينات';

  const safeName = escapeHtml(recipientName);
  const safeLogoSrc = logoSrc.replace(/"/g, '&quot;');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark only" />
  <meta name="supported-color-schemes" content="dark only" />
  <title>${subject}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .padding-mobile { padding-left: 28px !important; padding-right: 28px !important; }
      .heading-mobile { font-size: 26px !important; line-height: 1.25 !important; }
      .medallion-mobile { width: 56px !important; height: 56px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #070b18; font-family: 'IBM Plex Sans Arabic', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #070b18;">
    فريق جينات يسأل عن رأيك — بضع كلمات تكفي.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #070b18;">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" align="center" class="email-container" style="margin: auto; max-width: 560px; background-color: #0f1528; background-image: linear-gradient(180deg, #0f1528 0%, #070b18 100%); border-radius: 20px; overflow: hidden; border: 1px solid rgba(200, 168, 101, 0.22);">

          <tr>
            <td style="line-height: 0; font-size: 0; height: 1px; background-color: #c8a865; background-image: linear-gradient(90deg, rgba(200, 168, 101, 0) 0%, rgba(200, 168, 101, 0.9) 50%, rgba(200, 168, 101, 0) 100%);">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding: 48px 48px 20px 48px; text-align: center;" class="padding-mobile">
              <img src="${safeLogoSrc}" width="64" height="64" alt="جينات" class="medallion-mobile" style="width: 64px; height: 64px; border-radius: 50%; display: inline-block;" />
              <p style="margin: 18px 0 0 0; font-family: 'Reem Kufi', 'Amiri', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 20px; font-weight: 500; color: #f4ead4; letter-spacing: 0.04em;">
                جينات
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 48px 0 48px; text-align: center;" class="padding-mobile">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: auto;">
                <tr>
                  <td style="width: 64px; height: 1px; line-height: 0; font-size: 0; background-color: rgba(200, 168, 101, 0.35);">&nbsp;</td>
                  <td style="padding: 0 12px; color: #c8a865; font-size: 10px; line-height: 1;">&#9670;</td>
                  <td style="width: 64px; height: 1px; line-height: 0; font-size: 0; background-color: rgba(200, 168, 101, 0.35);">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 28px 48px 8px 48px; text-align: right;" class="padding-mobile" dir="rtl">
              <p style="margin: 0 0 12px 0; font-size: 10px; font-weight: 500; color: #c8a865; letter-spacing: 0.28em; text-transform: uppercase;">
                من فريق جينات
              </p>
              <h1 class="heading-mobile" style="margin: 0 0 20px 0; font-family: 'Reem Kufi', 'Amiri', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 28px; font-weight: 500; color: #f4ead4; line-height: 1.3; letter-spacing: -0.01em; text-align: right;">
                رأيك <span style="color: #e6cf9e;">يهمّنا</span>
              </h1>
              <p style="margin: 0 0 16px 0; font-size: 14.5px; font-weight: 300; color: rgba(244, 234, 212, 0.72); line-height: 1.95; text-align: right;">
                السلام عليكم <span style="color: #e6cf9e; font-weight: 500;">${safeName}</span>،
              </p>
              <p style="margin: 0 0 16px 0; font-size: 14.5px; font-weight: 300; color: rgba(244, 234, 212, 0.72); line-height: 1.95; text-align: right;">
                نعمل باستمرار على تطوير جينات ليكون المكان الذي توثّق فيه العائلات شجرتها ونسبها بثقة. يسعدنا أن نسمع منك مباشرة: ما الذي أعجبك؟ وما الذي كان غير واضح أو يحتاج تحسينًا؟
              </p>
              <p style="margin: 0 0 12px 0; font-size: 14.5px; font-weight: 300; color: rgba(244, 234, 212, 0.72); line-height: 1.95; text-align: right;">
                حتى الملاحظة القصيرة تساعدنا كثيرًا.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 48px 36px 48px; text-align: right;" class="padding-mobile" dir="rtl">
              <p style="margin: 0; font-size: 13px; color: rgba(244, 234, 212, 0.55); line-height: 1.8; text-align: right;">
                يكفي أن تردّ على هذا البريد — نقرأ كل رسالة تصلنا.
              </p>
              <p style="margin: 16px 0 0 0; font-size: 14px; color: rgba(244, 234, 212, 0.72);">
                شكرًا لوقتك،<br/>
                <span style="color: #e6cf9e;">فريق جينات</span>
              </p>
            </td>
          </tr>

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

          <tr>
            <td style="padding: 8px 48px 40px 48px; text-align: center;" class="padding-mobile">
              <p style="margin: 0; font-family: 'Amiri', 'Reem Kufi', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, serif; font-size: 14px; font-style: italic; color: rgba(200, 168, 101, 0.55); letter-spacing: 0.04em;">
                وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا
              </p>
            </td>
          </tr>

        </table>

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

  const text = `جينات — رأيك يهمّنا

السلام عليكم ${recipientName}،

نعمل باستمرار على تطوير جينات ليكون المكان الذي توثّق فيه العائلات شجرتها ونسبها بثقة. يسعدنا أن نسمع منك مباشرة: ما الذي أعجبك؟ وما الذي كان غير واضح أو يحتاج تحسينًا؟

حتى الملاحظة القصيرة تساعدنا كثيرًا. يكفي أن تردّ على هذا البريد — نقرأ كل رسالة تصلنا.

شكرًا لوقتك،
فريق جينات

وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا`;

  return { subject, html, text };
}
