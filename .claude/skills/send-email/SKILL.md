---
name: send-email
description: How to send a real one-off email (outreach, announcement, notification) from the gynat production app — building the content, getting the sender right, and running the send against the real SMTP transport on hz.
---

# Sending a one-off production email

This is for a real email to a real person that isn't part of a normal in-app
flow (invites, reports) — outreach, an announcement, a manual notification.
See `access-prod-server` for SSH basics and `query-prod-db` for finding
recipients in the database. This skill covers the email-sending mechanics.

## Get the sender right — read this before anything else

`sendEmail()` in `src/lib/email/transport.ts` hardcodes `from` to the
`SMTP_SENDER_EMAIL` / `SMTP_SENDER_NAME` env vars. On this server those
default to `noreply@gynat.com` / `جينات` — a transactional, non-monitored
sender. **Do not call `sendEmail()` as-is for anything that invites a
reply.** A previous outreach email said "just reply, we read every message"
while sending from `noreply@gynat.com` — it worked out because that address
happens to be a Send-As alias on the authenticated Gmail account, but that
was only confirmed after the fact by asking the user to check.

**Confirmed monitored sender for this project: `contact@gynat.com`**
(also `SITE_CONTACT_EMAIL` in `src/lib/site.ts`) — a real alias, mail
actually lands and gets read. Use this as the default outreach `from` going
forward: `"فريق جينات" <contact@gynat.com>`. Only ask the user for a
different sender if they request one explicitly.

Build the email with an explicit `from` override, calling
`emailTransport.sendMail({ from, to, subject, html, text })` directly
(import `emailTransport` from `@/lib/email/transport`) instead of the
`sendEmail()` wrapper, which has no `from` parameter.

## Workflow

1. **Build the content.** Reuse the branded obsidian/gold visual style
   already used in `src/lib/email/templates/` (`invite.ts`, `report.ts`,
   `feedback-request.ts` are good references) unless the user wants
   something different. Write both an HTML and a plain-text version.

2. **Images must be real hosted URLs.** Gmail and most mail clients strip
   inline base64 `data:` images from the message body. If the email needs
   a logo or other asset not already public, add it under `public/` and
   deploy — this app's build snapshots `public/` at build time, so a file
   copied directly onto the server 404s until a full rebuild:
   ```
   git add <asset> && git commit -m "..." && git push
   ssh hz "export NVM_DIR=\$HOME/.nvm && . \"\$NVM_DIR/nvm.sh\" && export PM2_HOME=/mnt/encrypted/gynat/pm2 && cd /mnt/encrypted/gynat/app && git pull && pnpm install --frozen-lockfile && pnpm build && pm2 restart gynat"
   ```
   Verify before relying on it: `curl -sI https://gynat.com/<path>` should
   return `200`.

3. **Preview before sending anything real.** Publish an Artifact with the
   rendered HTML in an `<iframe srcdoc="...">` (a base64-embedded image is
   fine here — it's preview-only, not the real send) so the user can see
   subject, sender, and the actual rendered layout. Get explicit sign-off
   on content, sender, and recipient(s) before the first real send.

4. **Write a one-off script** (e.g. `scripts/send-<purpose>.ts`) that
   imports the built HTML/text and calls the transport with the corrected
   sender — never `cat`/print `.env.local` or any `SMTP_PASS`; the script
   imports `src/lib/email/transport` so credentials are used without ever
   being read or displayed. Example shape:
   ```ts
   import { emailTransport } from '../src/lib/email/transport';
   import { buildMyEmail } from '../src/lib/email/templates/my-template';

   async function main() {
     const [to, name] = process.argv.slice(2);
     const { subject, html, text } = buildMyEmail({ recipientName: name });
     const info = await emailTransport.sendMail({
       from: '"فريق جينات" <contact@gynat.com>',
       to, subject, html, text,
     });
     console.log('Sent:', info.messageId);
   }
   main().catch((err) => { console.error(err); process.exit(1); });
   ```

5. **Get the script onto hz.** Prefer a normal commit + push + pull so it
   stays in source control. A quick `scp` for a throwaway test is fine,
   but clean it up before the next `git pull` — an untracked file at the
   same path as an incoming commit blocks the pull with a merge conflict:
   ```
   ssh hz 'rm -f <the same paths you scp'd>'
   ```

6. **Run it on hz** (`npx` isn't on `PATH` without loading `nvm` first):
   ```
   ssh hz 'export NVM_DIR=$HOME/.nvm && . "$NVM_DIR/nvm.sh" && cd /mnt/encrypted/gynat/app && npx tsx --env-file=.env.local --env-file-if-exists=.env scripts/send-<purpose>.ts <to> <name>'
   ```

7. **Send one recipient at a time**, never bulk-CC, unless explicitly told
   otherwise — call the script once per recipient. If "which users" is
   ambiguous, query the database (`query-prod-db`) to list real candidates
   and let the user pick rather than guessing.

8. **Test-send to the user's own address first** to validate rendering
   (images, RTL layout, any special characters) before sending to anyone
   real. A real email to a real person is irreversible and externally
   visible — always get explicit confirmation before the first live send.
