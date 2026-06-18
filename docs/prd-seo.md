# Product Requirements Document — Landing Page SEO

**Status**: Phase 2 shipped (2026-06-13); refined + IndexNow fix (2026-06-14).
- **Live**: landing content expansion (features grid + how-it-works + cross-family branch-sharing explainer + 7-question FAQ + FAQPage JSON-LD + richer footer). Hero untouched.
- **Structured data live (Phase 3, 2026-06-14)**: Organization (site-wide) + **WebApplication** w/ free offer on `/` + BreadcrumbList on `/islamic-gedcom` and `/policy`, all native server-rendered JSON-LD. (Used `WebApplication`, the SoftwareApplication subtype for browser-based apps — confirmed via Google's software-app docs.) `WebSite`/`SearchAction` skipped (no site search); `logo`/`sameAs`/`aggregateRating` deliberately omitted (no assets/socials/ratings yet). **Note**: Google's app *rich result* needs offers + a rating, so the visible app snippet stays ineligible until real reviews exist — the markup still aids entity understanding.
- **Indexing pipeline live**: Google Search Console verified + sitemap submitted (Google's channel); **Bing Webmaster Tools** sitemap submitted too (2026-06-14). IndexNow ownership key now hosted (`public/<key>.txt`) and pinging on every deploy → Bing/Yandex/Naver/Seznam (see `docs/indexnow.md`). Note: IndexNow does not reach Google.
- **Remaining**: Phase 4 (social/OG image + icons; also unlocks Organization `logo`), and the rest of Phase 5 (sitemap `lastModified`, Lighthouse/CWV audit, 30-day monitoring).
- **New indexable surface (2026-06-18, owned by `docs/prd-public-tree-collections.md`, not this PRD)**: opt-in published family content is now search-discoverable — a `public_listed` main tree's `/family/[slug]` and a fully-listable `public_listed` collection's `/collections/[slug]` now carry OG + JSON-LD and appear in `sitemap.ts`. Everything still private/by-link stays `noindex`. This is the ONLY non-marketing surface that may be indexed; the §3 table below still holds for the app itself (workspaces/profile/admin remain `noindex`). Open follow-up: per-tree OG image (falls back to the site-wide one); whether to hide living people's names from the crawlable list.
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

### Phase 2 — Landing content expansion

**Why**: today's landing is one hero section — thin on indexable keyword surface. Arabic genealogy is a low-competition niche; substantial content wins quickly. Content beats polish: a keyword-rich landing with FAQ rich results will outrank a prettier OG card without content. This is now prioritised ahead of social/icon assets.

**Narrative arc** (top → bottom): hook → convince → reassure → close objections → catch late scrollers.

#### Sections to build

- [x] **Hero** (keep current) — no change.
- [x] **"لماذا جينات؟" — features grid** (6 cards). Each card: `<h3>` headline + 1–2 sentence paragraph. Suggested copy:
  - **التقويم الهجري** — "تواريخ الميلاد والوفاة بالهجري والميلادي معاً."
  - **الرَضاعة والنَسَب** — "أول منصّة توثّق أبناء الرضاعة كجزء من شجرة العائلة."
  - **تشفير مزدوج** — "بياناتك محميّة بطبقتين من التشفير، حتى نحن لا نراها."
  - **صلاحيات المشاركة** — "أنت تختار من يرى ومن يُعدّل، فرداً فرداً."
  - **سجل التعديلات** — "كلّ تغيير محفوظ ومعروف مَن أجراه ومتى."
  - **استيراد وتصدير GEDCOM** — "أحضر سجلّاتك من أي برنامج أنساب، وصدّرها متى شئت."
- [x] **"كيف تعمل" — 3 steps** (numbered, each with `<h3>`):
  1. أنشئ مساحة لعائلتك.
  2. ابنِ الشجرة أو استورد ملف GEDCOM.
  3. ادعُ أقاربك بصلاحيات تختارها.
- [x] **"أسئلة شائعة" — FAQ**, `<h2>أسئلة شائعة</h2>`, Q&A pairs as `<h3>` + `<p>`. Wrap as `FAQPage` JSON-LD for Google rich results eligibility. Suggested questions:
  - "هل بياناتي آمنة؟"
  - "هل يدعم التقويم الهجري؟"
  - "هل يمكنني استيراد ملف GEDCOM؟"
  - "ما الفرق بين النسب والرَضاعة في المنصّة؟"
  - "هل التطبيق مجاني؟" **← resolved: free, no time limit ("نعم، استخدام جينات مجاني بالكامل").**
  - "هل يمكنني نشر عائلتي للعموم؟" **← shipped: private by default; historical-families publishing framed as قريباً بإذن الله.**
  - "هل يمكنني تصدير بياناتي إذا أردت؟"
  - *Shipped 7 questions (added the "نشر عائلتي للعموم" question above). The GEDCOM-import answer renders "مرجع GEDCOM الإسلامي" as an in-body link to `/islamic-gedcom`, while the answer text in the FAQPage JSON-LD stays plain (valid structured data).*
- [x] **Footer with site links** — added a richer site-links band at the bottom of `<main>` (السياسات، مرجع GEDCOM الإسلامي، تسجيل الدخول، إنشاء حساب، contact email + brand line). The original hero email + ayah footer was kept inside `.page` untouched per the no-touch-hero constraint. Improves crawl depth and distributes link equity.
- [x] **Heading hierarchy**: exactly one `<h1>` (hero), `<h2>` per section, `<h3>` per card / step / FAQ item. Validated — no skipped levels.
- [x] **Internal links**: two in-body `<a href="/islamic-gedcom">` links — one from the GEDCOM feature card (card 6) and one from the GEDCOM-import FAQ answer. Feeds link equity to a lower-priority indexed page.
- [x] **Cross-family branch-sharing explainer** — added a full-width `<h2 id="branch-sharing">` band (heading "عائلتان تجمعهما قرابة؟ شاركوا الفرع المشترك"), placed **below "كيف تعمل"** (owner moved it there). Explains that two related families can share their common branch (live link, not a copy; opt-in, owner-controlled, specific branch + chosen family + chosen depth, revocable, never public). Trimmed to setup → two-trees analogy → privacy reassurance (the benefit-bullets were removed to avoid repeating the "shared once" point). No new FAQ entry (owner declined); FAQ stays at 7 questions, FAQPage JSON-LD unchanged.

**Acceptance**: landing page word count ≥ 500 Arabic words; `FAQPage` JSON-LD validates clean in Rich Results Test; all headings follow h1→h2→h3 hierarchy with no gaps.

**Open questions** (resolved):
- ~~Pricing stance for the "هل التطبيق مجاني؟" FAQ~~ — **Resolved**: the product is free, with no time limit and no member cap. Copy reads "نعم، استخدام جينات مجاني بالكامل." No duration or "beta" qualifier.
- ~~Do we want testimonials / member count / tree count stats in this phase?~~ — **Resolved: deferred**. No testimonials, member counts, ratings, or other stats are included in this phase — we do not fabricate numbers. Revisit once real, verifiable figures exist.

---

### Phase 3 — Structured data (JSON-LD)

**Why**: eligibility for rich results in Google, disambiguates brand queries, feeds Knowledge Graph. Should ship alongside or just after Phase 2's FAQ JSON-LD so all schema lands together.

- [x] Added native server-rendered `<script type="application/ld+json">` to root layout with an `Organization` schema (name, alternateName, url, description, inLanguage, contactPoint with `contact@gynat.com`). **`logo` + `sameAs` deferred to Phase 4** (pending icon asset + social profiles — never reference non-existent URLs).
- [x] `WebSite` schema — **skipped** (no on-site search, so `SearchAction` doesn't apply; a bare WebSite block is redundant with Organization). Revisit if site search ships.
- [x] Added `WebApplication` schema on `/` (the SoftwareApplication subtype for browser-based apps; Google supports it for the software-app result): name, applicationCategory "LifestyleApplication", operatingSystem "All", `browserRequirements`, description, inLanguage "ar", publisher, and a free `offers` Offer (`price: "0"`, matches FAQ "مجاني بالكامل"). `aggregateRating` omitted (no real ratings — not fabricated; this keeps the visible app rich result ineligible for now, which is expected).
- [x] Added `BreadcrumbList` on `/islamic-gedcom` and `/policy` (names match each page's H1/title).
- [x] Validated locally: each page's JSON-LD parses cleanly and is present in the raw server HTML (not the flight payload) — `/` has Organization + FAQPage + SoftwareApplication; sub-pages have Organization + BreadcrumbList. **Owner/dev follow-up**: run the live URLs through [Rich Results Test](https://search.google.com/test/rich-results) post-deploy to confirm 0 errors (a "no logo"/"no rating" note is a non-blocking suggestion, expected).

**Acceptance**: Rich Results Test reports 0 errors, detects Organization + SoftwareApplication on `/`. *(Shipped 2026-06-14; structured data implemented directly in code — no design step.)*

---

### Phase 4 — Social & icon assets

**Why**: once content is rich, branded share previews become the last-mile polish. Deferred from original Phase 2 so content wins came first. Phase 1's OG tags currently have no image; twitter card is `summary`; landing this phase upgrades to `summary_large_image`.

- [ ] Design and export `src/app/opengraph-image.png` — 1200×630, Arabic title "جينات"، tagline "شَجَرةُ عائلتك محفوظةٌ كما تستحق"، brand gradient (obsidian + emerald + gold from jeweled heritage design).
- [ ] Design and export `src/app/twitter-image.png` — same concept, 1200×600.
- [ ] Export `src/app/icon.png` (32×32 or 512×512), `src/app/apple-icon.png` (180×180). Next.js file-based metadata picks these up automatically — no code changes needed.
- [ ] Optionally: `src/app/icon.svg` for a scalable favicon.
- [ ] Upgrade `twitter.card` from `summary` to `summary_large_image` in `src/app/layout.tsx` once images exist; add `openGraph.images` and `twitter.images` entries.
- [ ] Verify with [opengraph.xyz](https://www.opengraph.xyz) and by sharing the URL in WhatsApp/Telegram.

**Acceptance**: share link on WhatsApp/X/Telegram renders branded preview card.

---

### Phase 5 — Technical polish

**Why**: smaller wins that compound once the foundation is in place.

- [x] **IndexNow instant-crawl pings** — `scripts/seo-ping.ts` (`pnpm seo:ping`) submits all sitemap URLs to IndexNow on every deploy. **Fixed 2026-06-14**: the ownership key file (`public/dc3b8360bea04bd18cdba72cd06ee11c.txt`) was never hosted (404), so prior pings were silently no-ops; it now returns 200 and pings validate. Reaches Bing/Yandex/Naver/Seznam only — **not Google**. Documented in `docs/indexnow.md`.
- [x] Submit sitemap to **Google Search Console** — done (owner verified the property and resubmitted the sitemap, 2026-06-14).
- [x] Set up Search Console domain property verification — done (owner).
- [ ] Add `lastModified` to every entry in `src/app/sitemap.ts` (pull from git `HEAD` time or hardcode on content change).
- [x] Add `BreadcrumbList` structured data where hierarchy exists — done in Phase 3 (`/islamic-gedcom`, `/policy`).
- [ ] Audit `src/app/layout.tsx` script strategies — third-party analytics should be `afterInteractive` (already correct), Iconify is `beforeInteractive` (consider deferring since it's not used above the fold).
- [ ] Lighthouse SEO audit on `/` — target ≥ 95 (currently unmeasured).
- [ ] Verify Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms on the landing page.
- [x] Submit sitemap to **Bing Webmaster Tools** — done (owner, 2026-06-14). Separate from IndexNow; gives Bing-side reporting (impressions, backlinks, etc.).
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

Measured 90 days after Phase 2 (content) ships:

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
- `src/app/page.tsx` — Phase 0 (split server/client), Phase 2 (content)
- `src/app/page.module.css` — Phase 2
- `src/app/layout.tsx` — Phase 1, Phase 3 (JSON-LD), Phase 4 (OG image refs), Phase 5
- `src/app/opengraph-image.png`, `src/app/twitter-image.png`, `src/app/icon.png`, `src/app/apple-icon.png` — Phase 4 (new, was Phase 2)
- `src/app/islamic-gedcom/page.tsx`, `src/app/policy/page.tsx` — Phase 1, Phase 3
- `src/app/auth/confirm/layout.tsx` — Phase 1 (noindex, shipped)
- `src/app/design-preview/layout.tsx` — already noindex pre-Phase 1
