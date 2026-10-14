/**
 * One-off family announcement: «عقد قران عامر بن عبدالناصر سعيّد».
 * Two versions — each family announces to its own members:
 *   saeed   — «ابننا عامر», congratulations to عامر and his father.
 *   sharbek — «يسرّ عائلة شربك أن تشارك فدوى بنت عبدالإله فرحتها», congratulations to فدوى first, then عامر.
 * Sends to a single recipient per run.
 *
 * Phone numbers are private: they live only in a git-ignored text file the
 * owner fills in (private/marriage-phones.txt). This script reads them straight
 * into the email and NEVER prints them — `--check` reports only which slots are
 * valid, so whoever runs it can verify the file without seeing the numbers.
 *
 * Usage:
 *   npx tsx scripts/send-marriage-announcement.ts --check <phones.txt>
 *   npx tsx --env-file=.env.local --env-file-if-exists=.env scripts/send-marriage-announcement.ts <saeed|sharbek> <email> --phones <phones.txt> [--preview]
 *   npx tsx scripts/send-marriage-announcement.ts <saeed|sharbek> --dump <file.json>   (render only, placeholder numbers, no send)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildMarriageAnnouncementEmail } from '../src/lib/email/templates/marriage-announcement';

interface Phones {
  groom: string;
  father: string;
  mother: string;
}

const NO_PHONES: Phones = { groom: '', father: '', mother: '' };

// File slot name → field. Arabic keys so the owner edits a file in their own words.
const SLOTS: Record<string, keyof Phones> = { 'عامر': 'groom', 'عبدالناصر': 'father', 'فدوى': 'mother' };

/** Any common Saudi mobile spelling (Arabic or Latin digits) → "9665XXXXXXXX", or null. */
function normalizeSaudiMobile(raw: string): string | null {
  const latin = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  let digits = latin.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('966')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^5\d{8}$/.test(digits) ? `966${digits}` : null;
}

/** Parse the phones file. Errors name the slot only — never the value. */
function readPhones(path: string): { phones: Phones; problems: string[] } {
  const phones: Phones = { ...NO_PHONES };
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const field = SLOTS[key];
    if (!field) continue;
    seen.add(key);
    const value = trimmed.slice(eq + 1).trim();
    if (!value) { problems.push(`${key}: فارغ`); continue; }
    const normalized = normalizeSaudiMobile(value);
    if (!normalized) { problems.push(`${key}: ليس رقم جوال سعودي صحيح`); continue; }
    phones[field] = normalized;
  }
  for (const key of Object.keys(SLOTS)) if (!seen.has(key)) problems.push(`${key}: السطر غير موجود`);
  return { phones, problems };
}

const IDS = {
  groom: '348902f6-676d-4258-9c4a-a7e9c1d28be2',
  father: '69ee3b96-1ed6-4ef7-acdc-e690d82a0908',
  mother: '1d57332f-2c90-4b09-ade5-a6f6d802a3cb',
  bride: 'b690eb8b-f7d1-4244-9766-d49b3cf45690',
};

const COMMON = {
  groomFullName: 'عامر بن عبدالناصر سعيّد',
  brideName: 'حبيبة بنت بلال دياب',
  hijriDate: 'الأربعاء ٣ جمادى الأولى ١٤٤٨هـ',
  gregorianDate: '١٤ أكتوبر ٢٠٢٦م',
};

// Both trees are members-only, so links go to the member person page in the
// recipients' own workspace (Sharbek sees this branch through its live link).
const personIn = (slug: string) => (id: string) => `https://gynat.com/workspaces/${slug}/tree/person/${id}`;

function build(family: string, phones: Phones, recipientName?: string) {
  if (family === 'saeed') {
    const p = personIn('saeed');
    return {
      from: '"عائلة سعيّد" <noreply@gynat.com>',
      ...buildMarriageAnnouncementEmail({
        ...COMMON,
        groomUrl: p(IDS.groom),
        brideUrl: p(IDS.bride),
        familyName: 'سعيّد',
        relation: { kind: 'son' },
        contacts: [
          { role: 'العريس', name: 'عامر سعيّد', phone: phones.groom, url: p(IDS.groom) },
          { role: 'والد العريس', name: 'عبدالناصر سعيّد', phone: phones.father, url: p(IDS.father) },
        ],
        recipientName,
      }),
    };
  }
  if (family === 'sharbek') {
    const p = personIn('sharbek');
    return {
      from: '"عائلة شربك" <noreply@gynat.com>',
      ...buildMarriageAnnouncementEmail({
        ...COMMON,
        groomUrl: p(IDS.groom),
        brideUrl: p(IDS.bride),
        familyName: 'شربك',
        relation: { kind: 'daughtersSon', mother: { name: 'فدوى بنت عبدالإله', url: p(IDS.mother) } },
        contacts: [
          { role: 'والدة العريس', name: 'فدوى شربك', phone: phones.mother, url: p(IDS.mother), female: true },
          { role: 'العريس', name: 'عامر سعيّد', phone: phones.groom, url: p(IDS.groom) },
        ],
        recipientName,
      }),
    };
  }
  throw new Error(`Unknown family "${family}" — use saeed or sharbek`);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);

  const checkPath = flag(args, '--check');
  if (checkPath) {
    const { problems } = readPhones(checkPath);
    for (const key of Object.keys(SLOTS)) {
      const problem = problems.find((p) => p.startsWith(`${key}:`));
      console.log(problem ? `✗ ${problem}` : `✓ ${key}`);
    }
    process.exit(problems.length ? 1 : 0);
  }

  const [family, to] = args;
  if (!family || !to) {
    console.error('Usage: send-marriage-announcement.ts <saeed|sharbek> <email> --phones <phones.txt> [--preview]');
    process.exit(1);
  }

  if (to === '--dump') {
    writeFileSync(args[2], JSON.stringify(build(family, NO_PHONES)));
    return;
  }

  const phonesPath = flag(args, '--phones');
  if (!phonesPath) {
    console.error('Missing --phones <phones.txt>');
    process.exit(1);
  }
  const { phones, problems } = readPhones(phonesPath);
  if (problems.length) {
    console.error(`Phones file not ready:\n${problems.join('\n')}`);
    process.exit(1);
  }

  const { from, subject, html, text } = build(family, phones);
  const finalSubject = args.includes('--preview') ? `[معاينة] ${subject}` : subject;
  // Last guard before a real send: no placeholder number may survive, and a
  // real send never carries the preview marker.
  const placeholder = /5X XXX XXXX/;
  if (placeholder.test(html) || placeholder.test(text)) {
    console.error('Refusing to send: a placeholder phone number is still in the email');
    process.exit(1);
  }
  if (!args.includes('--preview') && finalSubject.includes('معاينة')) {
    console.error('Refusing to send: preview marker in a real send');
    process.exit(1);
  }
  // Imported lazily so --check/--dump never build an SMTP transport.
  const { emailTransport } = await import('../src/lib/email/transport');
  const info = await emailTransport.sendMail({ from, to, subject: finalSubject, html, text });
  console.log('Sent:', info.messageId || info);
  process.exit(0);
}

main().catch((err) => {
  // Only the error type — a message could echo file contents.
  console.error('Failed:', (err as Error)?.name ?? 'Error');
  process.exit(1);
});
