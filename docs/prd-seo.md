# Product Requirements Document — Landing Page SEO

**Status**: Phase 1 shipped (2026-04-24) — Phase 2 (social & icon assets) next
**Audience**: Human developers, AI coding assistants
**Parent PRD**: `docs/prd.md`

---

## 1. Purpose

The marketing surface of gynat (`/`, `/islamic-gedcom`, `/policy`) is how external users find the product through search and social shares. Today that surface is nearly invisible to crawlers:

- The root page (`/`) may be blocked by a contradictory `robots.ts` rule.
- The hero renders client-side only; crawlers see an empty document during the session check.
- Metadata is a one-line title + generic English description.
- No OpenGraph, no Twitter card, no canonical, no structured data, no OG image.
- The sitemap advertises a page (`/features`) that returns 404.

Goal: make gynat discoverable in Arabic-first genealogy searches ("شجرة العائلة"، "توثيق الأنساب"، "برنامج أنساب") and render cleanly when shared on WhatsApp, X, Telegram, Facebook.

Non-goals: SEM/paid, content marketing strategy, blog infrastructure, backlink building, authenticated pages (those stay `noindex`).

---

## 2. Target keywords & intent

Arabic (primary):
- شجرة العائلة — navigational/tool intent
- توثيق الأنساب — research intent
- برنامج أنساب — product intent
- شجرة نسب — tool intent
- تقويم هجري عائلة — niche differentiator
- رَضاعة / رضاع نسب — niche differentiator

English (secondary):
- Arabic family tree software
- Islamic genealogy app
- Hijri calendar family tree
- GEDCOM Arabic

Long-tail brand:
- gynat / جينات / جيناتي

---

## 3. Pages in scope

| Route | Indexed | Priority |
|---|---|---|
| `/` | yes | 1.0 |
| `/islamic-gedcom` | yes | 0.6 |
| `/policy` | yes | 0.3 |
| `/auth/login`, `/auth/signup`, `/auth/forgot-password` | yes (but low priority) | 0.2 |
| `/workspaces/**`, `/profile`, `/admin`, `/auth/callback`, `/auth/confirm` | **noindex** | — |
| `/test`, `/design-preview` | **noindex** | — |

---

## 4. Phases

Each phase is a self-contained session. Phases are ordered by impact × effort.

---

### Phase 0 — Critical fixes (blocking)

**Why first**: these are bugs that null out every other SEO effort. Ship before anything else.

- [x] Fix `src/app/robots.ts`: root `/` currently appears in both `disallow` and `allow`. Rewrite so only authenticated/dynamic routes are disallowed (e.g. `/api/`, `/workspaces/`, `/profile`, `/admin`, `/auth/callback`, `/auth/confirm`, `/test`, `/design-preview`). Everything else allowed by default.
- [x] Remove `/features` from `src/app/sitemap.ts` (page does not exist — sitemap-advertised 404).
- [x] Server-render landing hero. `src/app/page.tsx` is `'use client'` and returns `null` during session check — crawlers see an empty document. Split into:
  - Server component that renders the hero markup (title, lead, CTAs, figure cluster).
  - Small client island that handles the hash-forwarding and session-redirect logic only.
- [x] Verify with `curl -A "Googlebot" https://gynat.com/ | grep -c "<h1"` — should be ≥ 1 after fix (currently 0).

**Acceptance**: `curl` as Googlebot returns full hero HTML; `robots.txt` allows `/`; `sitemap.xml` has no 404 entries.

---

### Phase 1 — Metadata foundation

**Why**: single highest-ROI change. Title/description drive click-through on the search results page; OG/Twitter drive clicks on social shares.

- [x] In `src/app/layout.tsx`, expand `metadata`:
  - `metadataBase: new URL('https://gynat.com')`
  - `title: { default: 'جينات — شجرة العائلة وتوثيق الأنساب', template: '%s · جينات' }`
  - `description`: Arabic, 150–160 chars, include primary keywords + differentiators (hijri calendar, encryption, رَضاعة).
  - `keywords`: Arabic + English primaries.
  - `authors`, `creator`, `publisher`.
  - `alternates.canonical: '/'`, `alternates.languages: { 'ar': '/' }`.
  - `openGraph`: `type: 'website'`, `locale: 'ar_SA'`, `url`, `siteName: 'جينات'`, `title`, `description`. Image deferred to Phase 2.
  - `twitter`: `card: 'summary'`, title, description. Upgrade to `summary_large_image` in Phase 2 when image lands.
  - `robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } }`.
  - `formatDetection: { telephone: false, email: false, address: false }`.
- [x] Add per-page metadata for `/islamic-gedcom` (exists in `src/app/islamic-gedcom/page.tsx`) and `/policy` — each with its own title/description/canonical.
- [x] Add `noindex` metadata to `/auth/confirm` (new `auth/confirm/layout.tsx`). `/auth/callback` is a route handler (no metadata surface). `/test` does not exist as a route. `/design-preview` was already `noindex`. Authenticated routes rely on middleware redirect (crawlers can't reach them).

**Acceptance**: `view-source:` on `/` shows ≥ 15 `<meta>` tags including OG + Twitter + canonical; [metatags.io](https://metatags.io) preview renders correctly.

---

### Phase 2 — Social & icon assets

**Why**: Phase 1's OG tags point to images that don't exist yet.

- [ ] Design and export `src/app/opengraph-image.png` — 1200×630, Arabic title "جينات"، tagline "شَجَرةُ عائلتك محفوظةٌ كما تستحق"، brand gradient (obsidian + emerald + gold from jeweled heritage design).
- [ ] Design and export `src/app/twitter-image.png` — same concept, 1200×600.
- [ ] Export `src/app/icon.png` (32×32 or 512×512), `src/app/apple-icon.png` (180×180). Next.js file-based metadata picks these up automatically — no code changes needed.
- [ ] Optionally: `src/app/icon.svg` for a scalable favicon.
- [ ] Verify with [opengraph.xyz](https://www.opengraph.xyz) and by sharing the URL in WhatsApp/Telegram.

**Acceptance**: share link on WhatsApp/X/Telegram renders branded preview card.

---

### Phase 3 — Structured data (JSON-LD)

**Why**: eligibility for rich results in Google, disambiguates brand queries, feeds Knowledge Graph.

- [ ] Add `<Script type="application/ld+json">` to root layout with an `Organization` schema (name, url, logo, sameAs for social profiles once they exist, contactPoint with `contact@gynat.com`).
- [ ] Add a `WebSite` schema with `potentialAction: SearchAction` if/when site search exists (skip for now).
- [ ] Add a `SoftwareApplication` schema on `/`: name, operatingSystem, applicationCategory "LifestyleApplication", description, in-language "ar", aggregateRating (skip until real ratings exist).
- [ ] Add `BreadcrumbList` on `/islamic-gedcom` and `/policy`.
- [ ] Validate with [Rich Results Test](https://search.google.com/test/rich-results).

**Acceptance**: Rich Results Test reports 0 errors, detects Organization + SoftwareApplication on `/`.

---

### Phase 4 — Landing content expansion

**Why**: today's landing is one hero section — thin on indexable keyword surface. Arabic genealogy is a low-competition niche; substantial content wins quickly.

- [ ] Add a "الميزات" section below the hero with 4–6 feature cards. Each card is a short `<h3>` + paragraph. Cover: تشفير مزدوج، التقويم الهجري، الرَضاعة والنَسَب، أدوار المشاركة، سجل التعديلات، تصدير GEDCOM. These are real differentiators and rich in long-tail keywords.
- [ ] Add a "كيف تعمل" (how it works) section — 3 steps with headings.
- [ ] Add an Arabic FAQ section (`<h2>أسئلة شائعة</h2>`) answering: "هل بياناتي آمنة؟"، "هل يدعم التقويم الهجري؟"، "هل يمكنني استيراد ملف GEDCOM؟"، "ما الفرق بين النسب والرَضاعة؟"، "هل التطبيق مجاني؟". Wrap each Q/A as `FAQPage` JSON-LD for rich results eligibility.
- [ ] Add a footer with site links (currently only email + ayah) — helps crawl depth and distributes link equity.
- [ ] Ensure heading hierarchy: one `<h1>` (hero title), `<h2>` per section, `<h3>` per card/FAQ item.

**Acceptance**: landing page word count ≥ 500 Arabic words; FAQ rich results appear in Rich Results Test.

---

### Phase 5 — Technical polish

**Why**: smaller wins that compound once the foundation is in place.

- [ ] Add `lastModified` to every entry in `src/app/sitemap.ts` (pull from git `HEAD` time or hardcode on content change).
- [ ] Add `BreadcrumbList` structured data where hierarchy exists.
- [ ] Audit `src/app/layout.tsx` script strategies — third-party analytics should be `afterInteractive` (already correct), Iconify is `beforeInteractive` (consider deferring since it's not used above the fold).
- [ ] Lighthouse SEO audit on `/` — target ≥ 95 (currently unmeasured).
- [ ] Verify Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms on the landing page.
- [ ] Submit sitemap to Google Search Console + Bing Webmaster Tools.
- [ ] Set up Search Console domain property verification (DNS TXT record).
- [ ] Monitor first 30 days post-launch: impressions, CTR, average position for target keywords.

**Acceptance**: Lighthouse SEO ≥ 95; Search Console reports "valid" for sitemap; landing page has no CWV regressions.

---

## 5. Out of scope

- Blog / articles / content calendar (separate initiative if desired later).
- Paid search / display ads.
- Backlink outreach.
- Translations beyond Arabic + English meta fallbacks.
- Indexing authenticated pages (explicit non-goal — workspace data is private).
- AMP / instant articles.

---

## 6. Success metrics

Measured 90 days after Phase 4 ships:

- Google Search Console: ≥ 1,000 impressions/month on brand + primary Arabic keywords.
- Landing page CTR ≥ 3% on impressions.
- Indexed pages: `/`, `/islamic-gedcom`, `/policy` all confirmed indexed.
- Social share preview renders correctly on WhatsApp, X, Telegram, Facebook.
- Lighthouse SEO ≥ 95 on `/`.

---

## 7. File reference

Files touched across phases:

- `src/app/robots.ts` — Phase 0
- `src/app/sitemap.ts` — Phase 0, Phase 5
- `src/app/page.tsx` — Phase 0 (split server/client), Phase 4 (content)
- `src/app/page.module.css` — Phase 4
- `src/app/layout.tsx` — Phase 1, Phase 3, Phase 5
- `src/app/opengraph-image.png`, `src/app/twitter-image.png`, `src/app/icon.png`, `src/app/apple-icon.png` — Phase 2 (new)
- `src/app/islamic-gedcom/page.tsx`, `src/app/policy/page.tsx` — Phase 1, Phase 3
- `src/app/auth/callback/page.tsx`, `src/app/auth/confirm/page.tsx`, `src/app/test/`, `src/app/design-preview/layout.tsx` — Phase 1 (noindex)
