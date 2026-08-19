# Paid acquisition plan — X, targeting Saudi Arabia and Syria

Written 2026-08-15, corrected 2026-08-18. Supersedes `google-ads-campaign.md` (deleted —
Google is closed to us, see below).

**The problem this solves:** gynat gets ~3.3 real visitors/day and converts them well.
Conversion is not the bottleneck. Arrivals are.

| Measure | Value |
|---|---|
| Real visitors, all time (excluding owner dev sessions) | 595 |
| Real visitors, last 30 days | 99 (~3.3/day) |
| Registered users | 51 |
| New users, last 30 days | 16 |
| Conversion, all time | 8.6% |
| Conversion, last 30 days | **16%** |

---

## Corrections to earlier versions of this document

Two claims in the 2026-08-15 draft were wrong. Both are corrected throughout.

1. **"Saudi visitors browse 12.7 pages per visit."** That number counted the owner's own
   development machine — sessions with a `localhost` or `tree.local` referrer were being
   geolocated to Saudi Arabia. Excluding them, the real figure is **4.6 pages/visit** across
   336 Saudi visitors. Saudi remains far ahead of every other market, so the conclusion held,
   but the magnitude was overstated by roughly 2.7×. All engagement figures below now exclude
   dev sessions.

2. **"Syria — not targetable on Snapchat or X at all."** This was wrong, and it was based on
   pre-2025 sanctions conditions. See below.

---

## 0. Why not Google

Google Ads permits **only "Organization" account types in Saudi Arabia** (Google's own words:
*"In some countries (like UAE and Saudi Arabia), only 'Organization' account types are
supported"*). Organization verification requires business registration documents. As a
non-Saudi individual with no CR, that path is closed.

Confirmed empirically: a brand-new Google account with zero payments profiles still forced
Organization. Not a duplicate-profile issue, not a missing phone/card — a country rule.

Also lost with it: the SAR 1,300 matched-credit offer.

## 0b. Regulatory position (not legal advice)

- **Mawthooq attaches to the ADVERTISER'S residency, not the audience.** GAMR: the controls
  apply to "the individual — the citizen, the resident, and the foreign investor." There is
  no audience-location language. **Geo-targeting Syria instead of Saudi does not reduce
  exposure**, so regulation is not a reason to pick one audience over the other.
- **Promoting your OWN product is explicitly exempt.** GAMR's published exempt cases include
  «إذا كان صاحب مهنة أو حرفة وأعلن عن المنتج الخاص به في حسابه الشخصي». The trigger is *own
  product vs someone else's* — NOT paid vs unpaid. The regulation says «بمقابل أو بغير مقابل»,
  so the widely-repeated "only if you earn revenue" framing in the press is wrong.
- **The one open question:** every GAMR exempt example is *organic posting on a personal
  account*. Whether the exemption reaches *paid media buying* is unaddressed anywhere. That is
  a 30-minute question for a Saudi media/regulatory lawyer, or a written enquiry to GAMR.
- **Avoid Kuwait** (e-media licences are restricted to Kuwaiti citizens — no compliance path
  if it ever applied).

---

## 1. Syria — reopened, and now a legitimate target

US sanctions on Syria were **revoked by Executive Order of 30 June 2025, effective 1 July
2025**, dismantling the comprehensive Syrian Sanctions Regulations. What replaced them
(PAARSS) targets only named individuals and entities — Assad-regime figures, Captagon
traffickers, ISIS/al-Qaeda, Iranian proxies — not the general population. US companies may
lawfully serve advertising to ordinary Syrian audiences.

Corroboration that platforms have followed: **Google removed Syria from its Ads sanctions
restrictions on 13 August 2025** (`support.google.com/adspolicy/answer/16489352`).

For X specifically: X's published eligibility policy lists only five prohibited jurisdictions
— Cuba, Crimea, Donetsk/Luhansk, Iran, North Korea. **Syria is absent from that list.** X does
not publish its positive list of selectable geo locations, so this is strong but not
conclusive. **Verify in Ads Manager before relying on it** — it is a ten-second check once the
account exists.

Snapchat has published no Syria-specific update either way. Treat as unknown; check directly.

### What our own data says about Syria

| | Saudi Arabia | Syria |
|---|---|---|
| Visitors | 336 | 11 |
| Pages per visit | 4.6 | 1.8 |
| Arabic-language sessions | 108 | 9 |
| Arrived from search | 27 | 1 |
| Arrived direct | 367* | 10 |

The Syrian visitors are real people, not bots — nine of eleven browse in Arabic. But ten of
eleven arrived **direct**, meaning they typed the address or followed a shared link. That is
the owner's own network, not discovered demand. Jordan is identical in shape (13 direct, 1
search).

So Syria has **no demonstrated organic demand** — but it has also never been advertised to.
This is a bet on judgement, not on evidence, and should be sized accordingly.

*(\*Direct + referrer counts exceed unique visitors because a session can produce events with
more than one referrer value.)*

### The case FOR spending in Syria anyway

- **Media is far cheaper.** Saudi is one of the most expensive ad markets in the region; Syria
  is one of the cheapest. The same $2 buys an order of magnitude more impressions. For a test
  whose purpose is to learn whether the *message* works, cheap impressions are the point.
- **Low purchasing power is not a disqualifier here.** gynat is free. There is no payment
  barrier between a Syrian visitor and becoming a user.
- **Founder market knowledge.** The owner knows this audience, its naming conventions, and its
  family structures directly.

### The case AGAINST

- X's penetration in Syria is a fraction of Saudi's; electricity and connectivity are
  constrained.
- Cheap clicks are worthless if they don't convert. Watch pages-per-visit, not click count.

---

## 2. Market decision — run both, but never in the same ad group

### Evidence for Saudi as the primary market

| Signal | Finding |
|---|---|
| Search | Saudi is the **only country on earth** with measurable volume for `علم الأنساب`; #1 for `نسابة` |
| Own analytics | **336 visitors at 4.6 pages/visit**, 108 Arabic sessions — more than everywhere else combined |
| Institutions | صناديق الأسر (incorporated extended-family funds with boards and budgets) need exactly this |
| Platform reach | X ~15M users; Snapchat 87.7% of Saudi |
| Paid market exists | Ansab.io sells to صناديق الأسر at **SAR 499–999/yr**; Nasb.io names Al-Rajhi / Al-Jasser / Al-Hamdan as clients |
| Product fit | Hijri dates, رضاعة, polygamy modelling map directly onto Saudi practice |

### CRITICAL structural rule

**Saudi and Syria must be separate ad groups, each with its own budget.** If both countries
sit in one ad group, X's optimiser will pour essentially the entire budget into whichever is
cheaper — which will be Syria by a wide margin — and the Saudi test will never run. The
resulting report would look like "Syria performs better" when all it means is "Syria is
cheaper and Saudi never got served."

This is the single most important implementation detail in this document.

### Budget split

| Ad group | Locations | Daily budget |
|---|---|---|
| SA — primary | Saudi Arabia | **$4** |
| SY — cheap-reach test | Syria | **$2** |

Compare the two on **cost per engaged visitor** (a visitor who views 3+ pages), not on cost
per click.

### Markets to AVOID, and why

- **Algeria / Morocco / Tunisia — the homework trap.** They top every Arabic family-tree
  Trends chart, and it is primary-school assignments: related queries are literally
  `للسنة الثانية ابتدائي`, `بالفرنسية`, `مجسم`, `نموذج`. Algeria's interest tracks the school
  calendar and hits **zero for twelve straight summer weeks**. Zero Maghreb countries appear
  in our own traffic despite topping Trends.
- **Egypt — the population trap.** Real demand, wrong shape: Egyptians search
  `شجرة العائلة بالرقم القومي` and `دار المحفوظات` — they want to *retrieve an official state
  record*, not build a tree. Our numbers: 10 Egyptian visitors vs 336 Saudi, despite Egypt
  having ~2.3× Saudi's internet population.
- **Western diaspora (US/CA/UK/NL/FR) — it was bots.** 95 US "visitors" at **1.1 pages each
  and zero Arabic-language sessions**. The real diaspora uses English and Ancestry/MyHeritage,
  and wants Ottoman records, which we don't provide.
- **Yemen / Sudan / Mauritania** — best cultural fit in the Arab world, but 17% internet
  penetration and conflict. Unreachable.

### Syrian diaspora — the fallback, and a later opportunity

If Syria turns out not to be selectable in Ads Manager, Syrians are reachable where they
already live: **Turkey, Jordan, Lebanon, Germany, and the Gulf** are all standard, unrestricted
X ad markets. Combine with Arabic-language targeting. Note our own data already shows Turkey
at 3.8 pages/visit and Iraq at 6.3 — small numbers, but engaged.

---

## 3. Budget reality

At **$6/day total** split across two countries, expect a few hundred impressions daily in
Saudi and rather more in Syria. **This is a test of whether the message works, not a growth
lever.** Say so out loud before spending, so the results aren't judged against the wrong
expectation.

| | X | Snapchat |
|---|---|---|
| Fixed cost | **X Premium ~$8/mo** (mandatory for individuals) | none |
| VAT | none added (Saudi is outside X's VAT buckets) | **+15% Saudi VAT** |
| Billing currency | **USD** for Saudi accounts → bank FX + foreign-txn fees | selectable |
| Daily minimum | none | **$5/day** |
| Free credit | — | **$75 after $50 spend** |

VAT follows the *billing* country, not the audience.

**Account country note:** the ads account country and currency are permanent and should match
where the advertiser actually resides and banks — not where the audience is. Targeting Syria
does not require a Syrian account, and no account country change is needed to reach it.

---

## 4. The X campaign

**Eligibility prerequisites (do these first — some have delays):**
- Profile photo and display name set, **not GIFs** — assets built, see `~/Downloads/gynat-brand/`
- Bio contains a live, non-gated URL: `gynat.com`
- Posts public, phone number verified
- **No change to profile photo, display name or @handle for 3 days before advertising**
- Subscribe to **X Premium** (~$8 tier — the $3 Basic tier has no checkmark and does not
  qualify). Subscribe **via web**, not the iOS app, which costs more.

**Campaign:**

| Setting | Value |
|---|---|
| Objective | Website traffic |
| Structure | **Two ad groups**: `SA` and `SY` — never combined |
| Language | **Arabic** (essential in the Gulf, which has large non-Arab expat populations) |
| Age | 35+ primary; a second comparison group at 25–34 if budget grows |
| Devices | All |
| Daily budget | $4 (SA) + $2 (SY) |

**Post copy:**

```
شجرة عائلتك بالعربي، كما تستحق أن تُحفظ.

منصة لتوثيق النسب عبر الأجيال: التقويم الهجري، توثيق الرضاعة،
واستيراد وتصدير GEDCOM.

بياناتك مشفّرة بطبقتين، وأنت وحدك تقرر من يراها. مجاني بالكامل.

gynat.com
```

**Interest / keyword targeting:** الأنساب، علم الأنساب، القبائل، التاريخ، صناديق الأسر، شجرة
العائلة. Avoid `شجرة النسب` as a keyword — globally it resolves to the high-school biology
pedigree chart.

---

## 5. Tracking

- **Final URL:** `https://gynat.com/`
- **Append, per ad group:**
  - `?utm_source=x&utm_medium=cpc&utm_campaign=sa_ar`
  - `?utm_source=x&utm_medium=cpc&utm_campaign=sy_ar`

Distinct campaign tags per country are what make the comparison possible at all. Umami already
records UTM tags. Without them, paid clicks blend into existing direct traffic and there is no
way to tell afterwards whether the money did anything.

Send clicks to the **homepage**, not the signup form — the homepage carries the FAQ answering
the privacy question, which is this audience's main hesitation.

---

## 6. Launch order

1. Upload avatar + banner, finish the X profile, then **wait 3 days** (eligibility freeze).
2. Subscribe to X Premium via web.
3. Create the X ads account. Country/currency permanent — match residence, not audience.
4. **Check whether Syria appears in the location picker.** If not, swap the SY ad group for a
   Syrian-diaspora group (Turkey + Jordan + Germany, Arabic language).
5. Build both ad groups with separate UTM tags. Review paused, then enable.
6. Run 2 weeks. Judge on Umami, not the platform dashboard.

---

## 7. What to watch

- **Umami, not the ad platform.** Ad dashboards report clicks; Umami reports whether those
  people did anything.
- **Pages per visit is the honest quality signal.** Real Saudi traffic averages 4.6. Bot
  traffic sits at 1.1. If paid traffic arrives near 1, it is the wrong audience regardless of
  what the click count says.
- **Cost per engaged visitor**, compared between SA and SY. Not cost per click.
- Signup rate. It is currently 16% over 30 days. If clicks rise but signups don't, tighten
  targeting rather than raising budget.

---

## 8. The finding that outranks this whole document

**Saudi families already pay for this.** Ansab.io charges SAR 499–999/year for family-tree
software aimed at صناديق الأسر. Nasb.io sells an upmarket version to named Saudi families.
Neither appears to offer what gynat has — رضاعة documentation, Hijri dates, real privacy
architecture, polygamous family modelling — and both look weakly executed.

gynat is free, has no revenue, and therefore no payback loop on any advertising. But it sits
next to a proven paying category, in its strongest market, where the customer type (صناديق
الأسر — incorporated family funds with boards and budgets) is institutional rather than
individual.

Being free is a sharp wedge for acquisition. It is worth deciding deliberately whether it
stays that way forever, because the market has already been educated that this category exists
and is worth paying for.

---

## 9. Free levers that outlast any budget

Paid traffic stops the moment payment stops. These don't:

- **Publish a tree.** Google can currently index exactly 5 pages of gynat (home, policy,
  islamic-gedcom, login, signup). All trees are private and no collections are published. The
  entire public-tree and search infrastructure built in June is pointed at nothing.
- **Arabic reference content.** The `/islamic-gedcom` page proves we can write it, and Arabic
  genealogy content is a near-empty search space.
- **Existing communities.** منتدى الأنساب والعائلات الشامية (~14.3k) — directly relevant to the
  Syrian audience — plus Alansab.net (~4.4k) and majlisansab.org. Old-web genealogy communities,
  ready-made audiences, zero cost.
