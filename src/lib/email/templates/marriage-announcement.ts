import { EMAIL_LOGO_URL } from '@/lib/site';
import { escapeHtml } from '@/lib/utils/html-escape';

interface CongratsContact {
  /** Label shown above the name, e.g. «العريس». */
  role: string;
  name: string;
  /** Person page URL — the name renders as a link when present. */
  url?: string;
  /** International format without "+" or spaces, e.g. "9665XXXXXXXX". Empty → placeholder. */
  phone: string;
  /** Feminine wording for the WhatsApp button («هنّئها»). */
  female?: boolean;
}

type GroomRelation =
  | { kind: 'son' }
  | { kind: 'daughtersSon'; mother: { name: string; url?: string } };

interface MarriageAnnouncementEmailParams {
  groomFullName: string;
  groomUrl?: string;
  brideName: string;
  brideUrl?: string;
  /** The recipients' family: headline, sign-off and footer. */
  familyName: string;
  /** How the groom relates to `familyName` — «ابننا», or the son of a woman of this family (named, opens the news). */
  relation: GroomRelation;
  hijriDate: string;
  gregorianDate: string;
  contacts: CongratsContact[];
  /** Optional per-recipient greeting name. */
  recipientName?: string;
}

// The site's heritage palette (src/styles/tokens/heritage.css), used as-is:
// midnight ground, emerald glow, gold titles, parchment text, glass cards.
const C = {
  midnight: '#070b18',
  midnightDeep: '#03050c',
  midnightSoft: '#0f1528',
  emerald: '#1a5d4a',
  emeraldGlow: '#2e9876',
  emeraldDeep: '#0f3a2d',
  gold: '#c8a865',
  goldBright: '#e6cf9e',
  goldDeep: '#8c7441',
  parchment: '#f4ead4',
  textSoft: 'rgba(232, 223, 200, 0.78)',
  textMuted: 'rgba(232, 223, 200, 0.55)',
  glassBg: 'rgba(255, 255, 255, 0.035)',
  glassBorder: 'rgba(200, 168, 101, 0.22)',
};

const KUFI = "'Reem Kufi', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif";
const RUQAA = "'Aref Ruqaa', 'Amiri', 'Noto Naskh Arabic', serif";
const SANS = "'IBM Plex Sans Arabic', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif";

/** "966512345678" → "+966 51 234 5678" (LTR-safe display). */
function formatSaudiPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '+966 5X XXX XXXX';
  if (digits.startsWith('966') && digits.length === 12) {
    const local = digits.slice(3);
    return `+966 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  return `+${digits}`;
}

/** Name as a link to the person page (plain span when no URL). */
function nameLink(name: string, url: string | undefined, style: string): string {
  const safe = escapeHtml(name);
  if (!url) return `<span style="${style}">${safe}</span>`;
  return `<a href="${url.replace(/"/g, '&quot;')}" style="${style} text-decoration: none; border-bottom: 1px solid rgba(200, 168, 101, 0.45);">${safe}</a>`;
}

export function buildMarriageAnnouncementEmail({
  groomFullName,
  groomUrl,
  brideName,
  brideUrl,
  familyName,
  relation,
  hijriDate,
  gregorianDate,
  contacts,
  recipientName,
}: MarriageAnnouncementEmailParams) {
  const subject = `عقد قران ${groomFullName}`;

  const safeGroom = escapeHtml(groomFullName);
  const safeBride = escapeHtml(brideName);
  const safeFamily = escapeHtml(familyName);
  const safeHijri = escapeHtml(hijriDate);
  const safeGregorian = escapeHtml(gregorianDate);
  const greeting = recipientName
    ? `السلام عليكم ورحمة الله وبركاته يا ${escapeHtml(recipientName)}،`
    : 'السلام عليكم ورحمة الله وبركاته،';

  const coupleStyle = `font-family: ${RUQAA}; font-size: 28px; font-weight: 700; color: ${C.parchment}; line-height: 1.5;`;
  const inlineNameStyle = `color: ${C.goldBright}; font-weight: 600;`;

  // The news sentence ends on the couple; for a daughter's son it opens on
  // the mother, so the family shares her joy first.
  const newsHtml = (bride: string) =>
    relation.kind === 'son'
      ? `يسرّنا أن نزفّ إليكم البشرى؛ فقد تمّ اليوم بحمد الله وتوفيقه عقد قران ابننا ${nameLink(groomFullName, groomUrl, inlineNameStyle)} على ${bride}.`
      : `يسرّ عائلة ${escapeHtml(familyName)} أن تشارك ${nameLink(relation.mother.name, relation.mother.url, inlineNameStyle)} فرحتها، فقد تمّ اليوم بحمد الله وتوفيقه عقد قران ابنها ${nameLink(groomFullName, groomUrl, inlineNameStyle)} على ${bride}.`;
  const newsText =
    relation.kind === 'son'
      ? `يسرّنا أن نزفّ إليكم البشرى؛ فقد تمّ اليوم بحمد الله وتوفيقه عقد قران ابننا ${groomFullName} على ${brideName}.`
      : `يسرّ عائلة ${familyName} أن تشارك ${relation.mother.name} فرحتها، فقد تمّ اليوم بحمد الله وتوفيقه عقد قران ابنها ${groomFullName} على ${brideName}.`;

  // Each contact: role on its own line, then name and number side by side on
  // one baseline (number modest, never louder than the name).
  const contactRows = contacts
    .map((c, i) => {
      const digits = c.phone.replace(/\D/g, '');
      const display = escapeHtml(formatSaudiPhone(c.phone));
      const numberStyle = `color: ${C.textSoft}; font-size: 14px; font-weight: 400; letter-spacing: 0.02em; unicode-bidi: embed; white-space: nowrap; text-decoration: none;`;
      const phone = digits
        ? `<a href="tel:+${digits}" dir="ltr" style="${numberStyle}">${display}</a>`
        : `<span dir="ltr" style="${numberStyle}">${display}</span>`;
      // The site's primary button: gold gradient pill with midnight text.
      const whatsapp = digits
        ? `
                      <tr>
                        <td colspan="2" style="padding: 10px 0 0 0; text-align: left;">
                          <a href="https://wa.me/${digits}" style="display: inline-block; padding: 6px 14px; border-radius: 999px; background-color: ${C.gold}; background-image: linear-gradient(135deg, ${C.goldBright} 0%, ${C.gold} 100%); color: ${C.midnight}; font-size: 12px; font-weight: 600; text-decoration: none;">${c.female ? 'هنّئها' : 'هنّئه'} على واتساب</a>
                        </td>
                      </tr>`
        : '';
      const rule = i > 0 ? `border-top: 1px solid ${C.glassBorder};` : '';
      return `
                      <tr>
                        <td colspan="2" style="padding: 18px 0 2px 0; ${rule} text-align: right; font-size: 12px; color: ${C.gold};" dir="rtl">${escapeHtml(c.role)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 0 0 ${digits ? '0' : '18px'} 0; text-align: right; vertical-align: baseline; font-size: 17px; line-height: 1.6;" dir="rtl">${nameLink(c.name, c.url, `color: ${C.parchment}; font-weight: 600;`)}</td>
                        <td style="padding: 0 12px ${digits ? '0' : '18px'} 0; text-align: left; vertical-align: baseline; line-height: 1.6;">${phone}</td>
                      </tr>${whatsapp}${digits ? `
                      <tr><td colspan="2" style="height: 18px; font-size: 0; line-height: 0;">&nbsp;</td></tr>` : ''}`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark only" />
  <meta name="supported-color-schemes" content="dark only" />
  <title>${subject}</title>
  <link href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;700&family=Aref+Ruqaa:wght@700&family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet" />
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .pad { padding-left: 22px !important; padding-right: 22px !important; }
      .title { font-size: 44px !important; }
      .orbit { width: 318px !important; height: 318px !important; }
      .medallion { width: 290px !important; height: 290px !important; }
      .couple { font-size: 25px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${C.midnight}; font-family: ${SANS};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${C.midnight};">
    تمّ بحمد الله عقد قران ${safeGroom} على ${safeBride} — بارك الله لهما وبارك عليهما.
  </div>

  <!-- dir="rtl" on the wrappers: Gmail drops <html dir>, which flips bidi
       (ornate brackets land on the wrong ends). Site background: midnight with an emerald glow up top and a gold glow below -->
  <table role="presentation" dir="rtl" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${C.midnight}; background-image: radial-gradient(ellipse 80% 45% at 80% 0%, rgba(46, 152, 118, 0.28) 0%, rgba(7, 11, 24, 0) 60%), radial-gradient(ellipse 70% 40% at 15% 100%, rgba(200, 168, 101, 0.14) 0%, rgba(7, 11, 24, 0) 60%);">
    <tr>
      <td align="center" style="padding: 28px 12px 36px 12px;">
        <table role="presentation" dir="rtl" cellspacing="0" cellpadding="0" border="0" width="560" align="center" class="email-container" style="margin: auto; max-width: 560px;">

          <!-- Brand row, like the site header -->
          <tr>
            <td style="padding: 0 24px 34px 24px; text-align: right;" class="pad" dir="rtl">
              <img src="${EMAIL_LOGO_URL}" width="34" height="34" alt="" style="width: 34px; height: 34px; border-radius: 50%; display: inline-block; vertical-align: middle;" />
              <span style="font-family: ${KUFI}; font-size: 20px; font-weight: 500; color: ${C.goldBright}; vertical-align: middle; margin-right: 8px;">جينات</span>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding: 0 24px; text-align: center;" class="pad">
              <p style="margin: 0 0 10px 0; font-size: 13px; color: ${C.gold};">
                فرحة في عائلة ${safeFamily}
              </p>
              <p class="title" style="margin: 0; font-family: ${KUFI}; font-size: 54px; font-weight: 700; line-height: 1.25; color: ${C.goldBright};">
                ألف مبروك
              </p>
              <p style="margin: 6px 0 0 0; font-family: ${RUQAA}; font-size: 24px; font-weight: 700; color: ${C.emeraldGlow}; line-height: 1.5;">
                عقد قران مبارك
              </p>
            </td>
          </tr>

          <!-- Centerpiece: the site's hero medallion, holding the couple -->
          <tr>
            <td align="center" style="padding: 30px 12px 8px 12px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" class="orbit" style="width: 360px; height: 360px; border: 1px dashed rgba(200, 168, 101, 0.4); border-radius: 50%;">
                <tr>
                  <td align="center" valign="middle">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" class="medallion" style="width: 326px; height: 326px; border-radius: 50%; border: 1px solid rgba(200, 168, 101, 0.45); background-color: ${C.emeraldDeep}; background-image: radial-gradient(circle at 50% 30%, ${C.emerald} 0%, ${C.emeraldDeep} 55%, ${C.midnightSoft} 100%);">
                      <tr>
                        <td align="center" valign="middle" style="padding: 0 30px; text-align: center;">
                          <p style="margin: 0 0 10px 0; color: ${C.goldBright}; font-size: 12px; letter-spacing: 0.5em; line-height: 1;">&#10022; &#10022; &#10022;</p>
                          <p class="couple" style="margin: 0; ${coupleStyle}">${nameLink(groomFullName, groomUrl, `color: ${C.parchment};`)}</p>
                          <p style="margin: 6px 0; font-family: ${RUQAA}; font-size: 22px; font-weight: 700; color: ${C.gold}; line-height: 1;">و</p>
                          <p class="couple" style="margin: 0; ${coupleStyle}">${nameLink(brideName, brideUrl, `color: ${C.parchment};`)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Date, as one of the site's glass chips -->
          <tr>
            <td align="center" style="padding: 18px 24px 0 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td style="padding: 12px 24px; background-color: ${C.glassBg}; border: 1px solid ${C.glassBorder}; border-radius: 16px; text-align: center;" dir="rtl">
                    <p style="margin: 0; font-size: 12px; color: ${C.gold};">يوم العقد</p>
                    <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 600; color: ${C.parchment};">${safeHijri}</p>
                    <p style="margin: 2px 0 0 0; font-size: 13px; color: ${C.textMuted};">الموافق ${safeGregorian}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 34px 32px 0 32px; text-align: right;" class="pad" dir="rtl">
              <p style="margin: 0 0 12px 0; font-size: 16px; color: ${C.textSoft}; line-height: 1.9;">${greeting}</p>
              <p style="margin: 0; font-size: 16px; color: ${C.textSoft}; line-height: 2;">
                ${newsHtml(nameLink(brideName, brideUrl, inlineNameStyle))}
              </p>
            </td>
          </tr>

          <!-- Blessing -->
          <tr>
            <td style="padding: 30px 24px 6px 24px; text-align: center;" class="pad">
              <p style="margin: 0; font-family: ${RUQAA}; font-size: 27px; font-weight: 700; color: ${C.goldBright}; line-height: 1.8;">
                بارك الله لهما، وبارك عليهما،<br/>وجمع بينهما في خير
              </p>
            </td>
          </tr>

          <!-- Congratulate: one glass card, rows split by a hairline -->
          <tr>
            <td style="padding: 30px 24px 0 24px;" class="pad" dir="rtl">
              <p style="margin: 0 0 12px 0; font-size: 16px; color: ${C.textSoft}; text-align: right; line-height: 1.9;">
                ولمن أحبّ أن يشاركهم الفرحة ويهنّئهم:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${C.glassBg}; border: 1px solid ${C.glassBorder}; border-radius: 18px;">
                <tr>
                  <td style="padding: 2px 22px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">${contactRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding: 28px 32px 0 32px; text-align: right;" class="pad" dir="rtl">
              <p style="margin: 0; font-size: 15px; color: ${C.textSoft}; line-height: 1.9;">أدام الله الأفراح في بيوتكم،</p>
              <p style="margin: 2px 0 0 0; font-family: ${RUQAA}; font-size: 24px; font-weight: 700; color: ${C.gold};">عائلة ${safeFamily}</p>
            </td>
          </tr>

          <!-- Ayah: U+FD3F opens, U+FD3E closes (logical order). They only face the
               text in an RTL paragraph, hence the explicit dir="rtl" — Gmail drops <html dir>. -->
          <tr>
            <td style="padding: 34px 24px 0 24px; text-align: center;" class="pad">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="border-top: 1px solid rgba(200, 168, 101, 0.18); font-size: 0; line-height: 0;">&nbsp;</td></tr>
              </table>
              <p dir="rtl" style="margin: 22px 0 0 0; font-family: ${RUQAA}; font-size: 18px; font-weight: 700; color: rgba(200, 168, 101, 0.75); line-height: 2;">
                ﴿وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُم مِّنْ أَنفُسِكُمْ أَزْوَاجًا لِّتَسْكُنُوا إِلَيْهَا وَجَعَلَ بَيْنَكُم مَّوَدَّةً وَرَحْمَةً﴾
              </p>
              <p style="margin: 22px 0 0 0; font-size: 12px; color: ${C.textMuted};">
                أُرسلت عبر جينات من شجرة عائلة ${safeFamily}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const contactText = contacts
    .map((c) => `${c.role}: ${c.name} — ${formatSaudiPhone(c.phone)}${c.url ? `\n${c.url}` : ''}`)
    .join('\n\n');

  const text = `ألف مبروك — فرحة في عائلة ${familyName}

عقد قران ${groomFullName} على ${brideName}
${hijriDate} — الموافق ${gregorianDate}

${recipientName ? `السلام عليكم ورحمة الله وبركاته يا ${recipientName}،` : 'السلام عليكم ورحمة الله وبركاته،'}

${newsText}

بارك الله لهما، وبارك عليهما، وجمع بينهما في خير

ولمن أحبّ أن يشاركهم الفرحة ويهنّئهم:
${contactText}

أدام الله الأفراح في بيوتكم،
عائلة ${familyName}

﴿وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُم مِّنْ أَنفُسِكُمْ أَزْوَاجًا لِّتَسْكُنُوا إِلَيْهَا وَجَعَلَ بَيْنَكُم مَّوَدَّةً وَرَحْمَةً﴾`;

  return { subject, html, text };
}
