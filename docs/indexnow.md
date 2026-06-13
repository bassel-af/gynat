# IndexNow — instant crawl pings

IndexNow lets us tell participating search engines "these URLs changed, re-crawl
them now" instead of waiting for them to discover the change on their own.

**Important:** IndexNow reaches **Bing, Yandex, Naver, Seznam, and DuckDuckGo** —
**not Google**. Google does not use IndexNow; for Google we rely on the sitemap
(`/sitemap.xml`) plus Google Search Console. So this is a complement to, not a
replacement for, the sitemap/GSC channel.

## How it works here

- **Script:** `scripts/seo-ping.ts`, run via `pnpm seo:ping`.
- It fetches `https://gynat.com/sitemap.xml`, extracts every `<loc>` URL, and
  POSTs the list to `https://api.indexnow.org/IndexNow`.
- **Runs automatically on every deploy** — it's the last step of the deployer
  (`.claude/agents/deployer.md`), wrapped in `(... || echo ...)` so a transient
  IndexNow failure never fails an otherwise-successful deploy.
- You can also run it manually any time after a content change: `pnpm seo:ping`.

## The ownership key (required — easy to miss)

IndexNow only acts on a ping if it can verify we own the domain. Verification is
a plaintext key file hosted at the site root:

- **Key:** `dc3b8360bea04bd18cdba72cd06ee11c`
- **Key file:** `public/dc3b8360bea04bd18cdba72cd06ee11c.txt` — its only content
  is the key itself. Next.js serves `public/` at the domain root, so it resolves
  to `https://gynat.com/dc3b8360bea04bd18cdba72cd06ee11c.txt`.
- The script sends this URL as `keyLocation`. If the key file is missing, the API
  still returns `200` (accepted) but each search engine then fails to validate
  ownership and **silently drops the submitted URLs** — the ping becomes a no-op.

If you ever rotate the key, update **both** the `KEY` constant in
`scripts/seo-ping.ts` and rename the file in `public/` to match.

## Verifying it works

```bash
# 1. Key file must return 200 with the key as its body:
curl -s -o /dev/null -w "%{http_code}\n" https://gynat.com/dc3b8360bea04bd18cdba72cd06ee11c.txt   # → 200
curl -s https://gynat.com/dc3b8360bea04bd18cdba72cd06ee11c.txt                                     # → dc3b8360bea04bd18cdba72cd06ee11c

# 2. Run the ping and confirm a 200/202 status:
pnpm seo:ping
```
