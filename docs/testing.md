# Testing

## Test Mode for Browser/Playwright Testing

**ALWAYS use the test family route when testing in the browser with Playwright/MCP.**

Default test URL: `http://localhost:4000/test?only=canvas`

The `/test` route loads `/public/test-family.ged` (a small test dataset) instead of production data. This is configured as a family entry in `src/config/families.ts`.

### Query Parameters

These query parameters can be appended to any family route to control UI visibility:

| Parameter | Effect |
|-----------|--------|
| `?only=canvas` | Show only tree canvas (hides sidebar, minimap, controls) |
| `?no-sidebar` | Hide sidebar only |
| `?no-minimap` | Hide minimap only |
| `?no-controls` | Hide zoom/pan controls only |
| `?playground` | Load the dev playground component |

## Email testing with Mailpit

Outgoing emails from the app (invitations, password resets, email changes) can
be captured and inspected by **Mailpit**, a local SMTP mail trap bundled into
the docker stack. Tests hit the Mailpit HTTP API (`http://localhost:8125`) to
programmatically verify subject, body, and links without touching a real SMTP
server.

### Starting Mailpit

Mailpit runs as part of the docker stack:

```sh
cd docker && docker compose up -d mailpit
```

Ports (namespaced to avoid conflicts with other Mailpit containers on the
machine):

- SMTP: `127.0.0.1:1125` → container `1025`
- HTTP UI/API: `127.0.0.1:8125` → container `8025`

Browse the captured mail at http://localhost:8125. Binding is loopback-only,
so Mailpit is NEVER reachable from the network — basic auth is therefore not
configured.

### Using Mailpit in tests

E2E tests that talk to real Mailpit live in `src/test/e2e/` and run via:

```sh
pnpm test:e2e
```

They are excluded from `pnpm test` because they require the docker stack.

Import the client:

```ts
import { MailpitClient } from '@/lib/email/test/mailpit-client';

const client = new MailpitClient('http://localhost:8125');
```

The constructor refuses any non-loopback URL as a safety guard.

### API

| Method | Purpose |
|---|---|
| `clearMailbox()` | Delete all messages. Call in `beforeEach`. |
| `getMessagesTo(addr)` | Return all message summaries sent to a recipient (newest first). |
| `getLastEmail(addr)` | Return the most recent message to a recipient. Throws if none. |
| `waitForEmail(addr, { timeoutMs, pollIntervalMs })` | Poll until one message arrives. Defaults: 5000ms / 100ms. |
| `waitForCount(addr, n, { timeoutMs })` | Poll until `n` messages arrive. |
| `getMessage(id)` | Fetch full message with HTML + text bodies. |
| `extractLink(html, { hrefContains })` | Find an `<a>` href in email HTML using a real DOM parser (not regex). |

### Conventions

- **Use unique recipient addresses per test** so parallel/retry runs don't see
  each other's mail. Pattern: `` `${label}-${crypto.randomUUID()}@test.solalah.local` ``.
- Call `client.clearMailbox()` in a `beforeEach` for deterministic state.
- Never send to a real user address from tests — Mailpit accepts anything, but
  tests should use `*.test.solalah.local` so the fake domain is obvious.

### Production safety

The email transport has a runtime guard (`assertProductionSafe()`) that throws
if `NODE_ENV=production` is paired with a mail-trap host (`mailpit`,
`localhost`, `127.0.0.1`, etc.). This prevents a misconfigured production
deploy from silently swallowing account recovery or invitation emails.
