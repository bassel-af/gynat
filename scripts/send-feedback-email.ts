/**
 * One-off outreach: send the "رأيك يهمّنا" feedback-request email to a single recipient.
 *
 * Usage:
 *   npx tsx --env-file=.env.local --env-file-if-exists=.env scripts/send-feedback-email.ts <email> <name>
 */
import { sendEmail } from '../src/lib/email/transport';
import { buildFeedbackRequestEmail } from '../src/lib/email/templates/feedback-request';

const LOGO_URL = 'https://gynat.com/brand/avatar-400.png';

async function main() {
  const [to, name] = process.argv.slice(2);
  if (!to || !name) {
    console.error('Usage: send-feedback-email.ts <email> <name>');
    process.exit(1);
  }

  const { subject, html, text } = buildFeedbackRequestEmail({ recipientName: name, logoSrc: LOGO_URL });

  const info = await sendEmail({ to, subject, html, text });
  console.log('Sent:', info.messageId || info);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
