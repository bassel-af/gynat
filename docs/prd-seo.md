# Product Requirements Document — Landing Page SEO

**Status**: Phase 1 shipped (2026-04-24) — Phase 2 (landing content expansion) next. Social/icon assets deferred to Phase 4 while content comes first.
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

- [ ] **Hero** (keep current) — no change.
- [ ] **"لماذا جينات؟" — features grid** (6 cards). Each card: `<h3>` headline + 1–2 sentence paragraph. Suggested copy:
  - **التقويم الهجري** — "تواريخ الميلاد والوفاة بالهجري والميلادي معاً."
  - **الرَضاعة والنَسَب** — "أول منصّة توثّق أبناء الرضاعة كجزء من شجرة العائلة."
  - **تشفير مزدوج** — "بياناتك محميّة بطبقتين من التشفير، حتى نحن لا نراها."
  - **صلاحيات المشاركة** — "أنت تختار من يرى ومن يُعدّل، فرداً فرداً."
  - **سجل التعديلات** — "كلّ تغيير محفوظ ومعروف مَن أجراه ومتى."
  - **استيراد وتصدير GEDCOM** — "أحضر سجلّاتك من أي برنامج أنساب، وصدّرها متى شئت."
- [ ] **"كيف تعمل" — 3 steps** (numbered, each with `<h3>`):
  1. أنشئ مساحة لعائلتك.
  2. ابنِ الشجرة أو استورد ملف GEDCOM.
  3. ادعُ أقاربك بصلاحيات تختارها.
- [ ] **"أسئلة شائعة" — FAQ**, `<h2>أسئلة شائعة</h2>`, Q&A pairs as `<h3>` + `<p>`. Wrap as `FAQPage` JSON-LD for Google rich results eligibility. Suggested questions:
  - "هل بياناتي آمنة؟"
  - "هل يدعم التقويم الهجري؟"
  - "هل يمكنني استيراد ملف GEDCOM؟"
  - "ما الفرق بين النسب والرَضاعة في المنصّة؟"
  - "هل التطبيق مجاني؟" **← blocker: needs a decision on pricing stance before copy can be written.**
  - "هل يمكنني تصدير بياناتي إذا أردت؟"
- [ ] **Footer with site links** — replace current (email + ayah) with: السياسات، مرجع GEDCOM الإسلامي، تسجيل الدخول، إنشاء حساب، contact email. Improves crawl depth and distributes link equity.
- [ ] **Heading hierarchy**: exactly one `<h1>` (hero), `<h2>` per section, `<h3>` per card / step / FAQ item. Validate no skipped levels.
- [ ] **Internal links**: at least one in-body link from landing → `/islamic-gedcom` (e.g. from the GEDCOM feature card or FAQ answer about imports). Feeds link equity to a lower-priority indexed page.

**Acceptance**: landing page word count ≥ 500 Arabic words; `FAQPage` JSON-LD validates clean in Rich Results Test; all headings follow h1→h2→h3 hierarchy with no gaps.

**Open questions**:
- Pricing stance for the "هل التطبيق مجاني؟" FAQ — free forever? beta-free? free up to N members?
- Do we want testimonials / member count / tree count stats in this phase, or defer until real numbers exist?

---

### Phase 3 — Structured data (JSON-LD)

**Why**: eligibility for rich results in Google, disambiguates brand queries, feeds Knowledge Graph. Should ship alongside or just after Phase 2's FAQ JSON-LD so all schema lands together.

- [ ] Add `<Script type="application/ld+json">` to root layout with an `Organization` schema (name, url, logo, sameAs for social profiles once they exist, contactPoint with `contact@gynat.com`).
- [ ] Add a `WebSite` schema with `potentialAction: SearchAction` if/when site search exists (skip for now).
- [ ] Add a `SoftwareApplication` schema on `/`: name, operatingSystem, applicationCategory "LifestyleApplication", description, in-language "ar", aggregateRating (skip until real ratings exist).
- [ ] Add `BreadcrumbList` on `/islamic-gedcom` and `/policy`.
- [ ] Validate with [Rich Results Test](https://search.google.com/test/rich-results).

**Acceptance**: Rich Results Test reports 0 errors, detects Organization + SoftwareApplication on `/`.

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
