# Ancestry gaps («جدّ أعلى») — research + design proposal

> **Status: COMPLETE.** Research and design only — no code was written or changed.
> Date: 2026-09-20. Author: gedcom-expert agent.
> The problem: a family knows for certain that a distant ancestor X is an ancestor
> of person Y, but does not know how many generations lie between, nor the names
> of the intervening people. Canonical case: عدنان ⇢ إسماعيل.

Three parallel web-research agents covered the standards, the software landscape,
and the Arabic domain; the gynat code was read directly. Claims are marked
**[verified online]**, **[read in code]**, or **[my inference]**.

---

## (a) Findings

### A1. The standards have no answer — confirmed, not assumed

**[verified online]** Neither GEDCOM 5.5.1 nor 7.0 has a construct for "certain
ancestor, unknown number of generations." Every candidate was checked against the
primary specs:

| Mechanism | Verdict |
|---|---|
| `ASSO`/`RELA` (5.5.1) | **The only near-miss.** Free text, **max 25 characters**, INDI-level only, `RELA` is *required*. Crucially, the spec's own worked example is `2 RELA great grandson` — a multi-generation descent claim. Our use case is literally the illustration in the standard. |
| `ASSO`/`ROLE`+`PHRASE` (7.0) | `RELA` free text replaced by a closed 15-value enum. The candidate list (CHIL, CLERGY, FATH, FRIEND, GODP, HUSB, MOTH, MULTIPLE, NGHBR, OFFICIATOR, PARENT, SPOU, WIFE, WITN, OTHER) is **confirmed exact and complete**. No ancestor value. `ROLE OTHER` + `PHRASE` is the escape hatch. |
| `PEDI` | ❌ Qualifies *how* a child belongs to a family; requires a real one-generation `FAMC`. Cannot express a gap without fabricating a fake father. 7.0 adds `OTHER`+`PHRASE`; 5.5.1 had no `OTHER`. |
| `FAMC`/`STAT` (challenged/disproven/proven) | ❌ Wrong axis. It rates *confidence in a direct parent-child link*. Here the ancestry is **certain** and the *path* is unknown. |
| `QUAY` | ❌ Rates a source citation's reliability, not a relationship. Kept in 7.0, values 0–3 unchanged. |
| `NO` tag (7.0) | ❌ Not relevant — a negative assertion that an *event* did not occur ("no marriage happened"), not "unknown". Frequently misread as "not recorded". |

Sources: [GEDCOM 5.5.1 spec (PDF)](https://gedcom.io/specifications/ged551.pdf) ·
[FamilySearch GEDCOM 7.0.18](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html) ·
[g7:enumset-ROLE](https://gedcom.io/terms/v7/enumset-ROLE) ·
[g7:ASSO](https://gedcom.io/terms/v7/ASSO) · [g7:PEDI](https://gedcom.io/terms/v7/PEDI)

Note the 5.5.1 internal defect: the `RELA` example points at a `SUBM` record while
the prose two pages earlier says `ASSO` is INDI→INDI only. This is a known spec
inconsistency and is why implementations diverge.

Also relevant, GEDCOM 5.5.5 (Tamura Jones' annotated successor, not the official
line) **reverses** the 5.5.1 precedent: *"Applications should issue a strong warning
when an ASSO.RELA value seems to duplicate a familial relationship (e.g.
grandfather)."* ([PDF](https://webtrees.net/downloads/gedcom-555.pdf), p.65)

### A2. The standards body considered this exact problem once and declined to solve it

**[verified online]** [FamilySearch/GEDCOM Discussion #461](https://github.com/FamilySearch/GEDCOM/discussions/461),
opened 2 May 2024 by **Luther Tychonievich** (GEDCOM steering committee), asks how
to record identity groups based on a shared ancestor "despite centuries of unknown
genealogy in between." His words: *"Because of the gap in the genealogy, d'Aboville
string won't work, nor will a full chain of INDIs linked with FAMCs."* Structurally
identical to عدنان → إسماعيل.

- His workaround: `ASSO` with **`ROLE OTHER` and a defining `PHRASE`**, or a new extension ROLE.
- **dthaler**, reporting back from a Steering Committee discussion (9 May 2024),
  floated **"a 'descendant of' ROLE type for an ASSO to an ancestor"** as possible
  future work. **Never filed, never drafted, not in the spec** — confirmed against
  the live enum.
- The accepted answer sidesteps lineage entirely and models it as group identity
  via `NATI` + `TYPE TRIBE` (`g7:NATI` = "national heritage or origin, or other
  folk, house, kindred, lineage, or tribal interest").

**[verified online]** [FamilySearch/GEDCOM-registries](https://github.com/FamilySearch/GEDCOM-registries)
contains 14 extension files (`Ancestry_PUBL_DATE`, `MagiKey_*`, etc.) — **nothing
related**. The `enumeration/extension` directory does not exist at all, so **no
extension ROLE values are registered anywhere**. The URI space is unclaimed.

Adjacent but not on-point: Issue #781 "DISPUTE & PROOF announcement" (opened July
2026, still open) proposes structures for recording disagreement and evidentiary
reasoning — about uncertainty in general, not generation gaps.

### A3. GEDCOM 7.0 legally permits extension *enumeration values* — the clean path

**[verified online]** Spec §1.5: *"Extensions can introduce... **new enumeration
values**... [and] **extend existing enumeration-type payloads with new permitted
values.**"* §2.3: *"Payload values that match production extTag are always permitted
in structures with an enumeration payload and have their URI defined by the schema."*

So `ROLE _ANCESTOR` declared in `SCHMA` is **fully spec-legal 7.0**, not a hack —
and materially better than `ROLE OTHER` + prose, because the semantics are
URI-identified.

Also: §1.5.2 — *"It is recommended that applications **not** use undocumented
extension tags."* Our existing `_RADA_*` / `_UMM_WALAD` tags are already
`SCHMA`-declared **[read in code — `EXT_URIS`, `src/lib/gedcom/exporter.ts:19-27`]**,
so we are already on the right side of this.

§1.5.3 additionally **requires** that where a standard structure can express a
subset of an extension's semantics, the standard tag be generated alongside and
kept in sync. This is why our design emits a `NOTE` next to the custom tags.

**[verified online]** The one place the concept exists as a named first-class type
anywhere is **GEDCOM X**: `http://gedcomx.org/AncestorDescendant` — *"A relationship
from an ancestor to a descendant"*
([spec](https://github.com/FamilySearch/gedcomx/blob/master/specifications/relationship-types-specification.md)).
FamilySearch's own model. Worth citing in our extension documentation.

### A4. Twelve programs, zero first-class gap links — and the failure mode is documented

**[verified online]** Gramps, MacFamilyTree, FTM, RootsMagic, Legacy, Family
Historian, webtrees, Ancestry, Geni, WikiTree, FamilySearch, MyHeritage — **all
twelve** model kinship exclusively as parent→child edges. Every one offers at best
a side-channel "association," and **no program draws an association in a pedigree
chart.** webtrees makes this structural: its relationship-path search filters edges
to `whereIn('l_type', ['FAMS', 'FAMC'])` — an association can *never* make two
people related there
([RelationshipService.php](https://github.com/fisharebest/webtrees/blob/main/app/Services/RelationshipService.php)).

**The empirical finding that most justifies building this:** FamilySearch's official
position on lineages to Adam is *"at worst, plain fabrication"* — yet its **live
profile for عدنان ([LYS6-M9G](https://ancestors.familysearch.org/en/LYS6-M9G/adnan-ibn-udad-bayt-qaydar-))**
renders as ordinary sourced fact: born ~122 BC, named father, named mother, no
uncertainty marker of any kind, and an internal impossibility (mother dated 111
years *after* her son). **Without a gap primitive, a lost chain does not get
recorded as a lost chain — it gets rendered as false precision.**

**Community norm, sharpest formulation
([Geni](https://help.geni.com/hc/en-us/articles/41336291843223)):** legendary
figures may be recorded but must be *"clearly marked as legendary — **not used as
anchors for fictional family trees**."* An explicit gap edge does not violate this;
auto-generating unnamed filler people would.

**The closest thread found anywhere** is on Gramps Discourse
([#1471](https://gramps.discourse.group/t/how-do-you-link-your-known-unknowns-its-all-relative/1471)),
and its conclusion is ours: *"you could **not** create fake families, just create
associations... and add a shared note."*

**Other useful prior art:**
- **Family Historian / FHUG** publishes an article on precisely this question,
  ranking techniques by GEDCOM portability, and rates `INDI.ASSO` *"standard GEDCOM
  compatible... allows uncertain relationships to be recorded with Source
  Citations"*
  ([FHUG](https://www.fhug.org.uk/kb/kb-article/recording-credibility-of-family-relationships/)).
- **WikiTree** is the only platform where uncertainty propagates into computed
  relationship paths, and it has a five-case decision table for uncertain parents
  ([Help:Uncertain](https://www.wikitree.com/wiki/Help:Uncertain),
  [Help:Uncertain Parents](https://www.wikitree.com/wiki/Help:Uncertain_Parents)).
  It resolves the Adnan↔Ishmael gap by a hard structural cutoff: nobody born BCE
  may be added at all.
- **Against placeholders:** *"we would have duplicate unknowns that we would
  practically never be able to identify as duplicates and never be able to get rid
  of"* ([G2G 1771265](https://www.wikitree.com/g2g/1771265/what-to-do-about-placeholder-profiles));
  the "epidemic of false medieval ancestries" thread (156 votes, 18.4k views) reports
  ~⅓ of one contributor's colonial immigrant ancestors had fabricated ancestries and
  that *"these false lineages are like weeds, they keep growing back"*
  ([G2G 76708](https://www.wikitree.com/g2g/76708/epidemic-false-medieval-ancestries-for-colonial-immigrants)).

### A5. Round-trip reality — what other software will do with our file

**[verified online, from shipping source code]**

| Program | INDI-level `ASSO` | Unknown `_` tags |
|---|---|---|
| **Gramps** | ✅ imports + exports (`PersonRef`, RELA stored verbatim). Event-level `ASSO` is **silently discarded** (`TOKEN_ASSO: self.__ignore`) | ❌ **silently discarded** (logged only, not stored, not round-tripped) |
| **webtrees** | ✅ imports + exports, `_ASSO` treated as `ASSO` | ✅ **preserved**, rendered as "Unrecognized GEDCOM code" |
| **Family Historian** | ✅ — FHUG explicitly calls `INDI.ASSO` *"standard GEDCOM compatible"* | its own `_SHAR`/`_FLGS` "may not migrate" |
| **RootsMagic** | ❌ **Associations are excluded from GEDCOM entirely** — *"trapped inside RM"* | not verified |
| **MacFamilyTree** | MFT 11 "Influential Persons" claims GEDCOM support; **tag not named in docs** — unverified | not verified |
| Legacy / FTM | no associations feature found | not verified |

Sources: [libgedcom.py](https://github.com/gramps-project/gramps/blob/master/gramps/plugins/lib/libgedcom.py) ·
[exportgedcom.py](https://github.com/gramps-project/gramps/blob/master/gramps/plugins/export/exportgedcom.py) ·
[webtrees ElementFactory.php](https://github.com/fisharebest/webtrees/blob/main/app/Factories/ElementFactory.php) ·
[RootsMagic community](https://community.rootsmagic.com/t/the-big-picture-regarding-associations/11786)

**Practical upshot:** `INDI`-level `ASSO`+`RELA` is the **only** indirect-link
construct with more than one confirmed implementation on both sides. Our structured
metadata must ride in a `NOTE` (universally preserved) *as well as* a custom tag,
because Gramps destroys custom tags. 5.5.1 itself says: *"Using a Note field is a
more universal way of transmitting genealogical data that does not fit into the
standard GEDCOM structure."*

**Display, consolidated:** nobody draws a dashed line for an association. The
dashed convention in the wild (Gramps Graph View, MyHeritage) is reserved for
*non-birth parentage* — adopted, step, foster. Since gynat has no adoption feature,
the dashed convention is free to take.

### A6. The Arabic domain — the tradition already does exactly this

**[verified online]** The single most important finding, and the product argument in
one line:

> **«عدنان من وَلَد إسماعيل بن إبراهيم عليهما السلام بإجماع الناس»** — asserted with *ijmāʿ* —
> alongside **«بين عدنان وإسماعيل ثلاثون أباً لا يُعرفون»** (Ibn Abbas).

The tradition asserts the descent with consensus **while simultaneously declaring
the intermediate names unknown.** That is precisely this feature, with 1,200 years
of authority behind it.
([al-Jazeera](https://www.aljazeera.net/blogs/2019/11/10/نسب-الحبيب-المصطفى-ويوم-ميلاده) ·
[al-Qalqashandi, نهاية الأرب](https://shamela.ws/book/31382/23) ·
[البداية والنهاية](https://ar.wikisource.org/wiki/البداية_والنهاية/الجزء_الثاني/خبر_عدنان_جد_عرب_الحجاز))

**Ibn Hazm's precedent is even closer to our data model** — his chapter is titled
**«هؤلاء وَلَد عدنان والصريح من وَلَد إسماعيل»**: he asserts the descent, states that
*«تسمية الآباء بينه وبين إسماعيل قد جُهلت جملةً»*, and refuses to list what he cannot
verify.
([wikisource](https://ar.wikisource.org/wiki/جمهرة_أنساب_العرب/ولد_عدنان_و_الصريح_من_ولد_إسماعيل))

Supporting reports, all sourced: عمر بن الخطاب «إنما تُنسب إلى عدنان»؛ عروة بن الزبير
«ما وجدنا أحداً يعرف ما بين عدنان وإسماعيل»؛ البلاذري «ما وجدنا في علم عالمٍ ولا شعر
شاعرٍ من وراء عدنان بثَبَت»؛ النووي «ليس فيما وراء عدنان إلى آدم طريق صحيح».

**The generation count — verified, and the answer is a *range*, not a number.**
Ibn Kathir enumerates the opinions verbatim:

> «أكثر ما قيل **أربعون** أباً — وهو الموجود عند أهل الكتاب، وقيل: بينهما **ثلاثون**،
> وقيل: **عشرون**، وقيل: **خمسة عشر**، وقيل: **عشرة**، وقيل: **تسعة**، وقيل: **سبعة**
> … وقيل: إن أقلّ ما قيل في ذلك **أربعة**»

So 7, 9, 15, 30, 40 are all genuinely reported — **plus 4, 10, 20**. Ibn Isḥāq's own
chain gives **seven** (أدد، مقوم، ناحور، تيرح، يعرب، يشجب، نابت), which is also the
chain al-Qalqashandi reproduces; al-Zuhri and al-Kalbi give ~5–6; the "4" comes via
an أم سلمة narration and is the chain al-Bukhari carries; the 40 figure is explicitly
flagged as the biblical reckoning. Ibn Kathir's own summing-up:
**«ما بين عدنان إلى إسماعيل فيه اضطرابٌ شديد واختلافٌ متفاوت»**.
**This directly justifies storing min/max rather than a single count.**

⚠️ **Two corrections to the original brief:**

1. **«إذا بلغ نسبي عدنان فأمسكوا» could not be sourced as a hadith.** It appears to
   be a paraphrase of the descriptive reports (*«كان إذا انتهى في النسب إلى عدنان
   أمسك»*) and the scholars' formula *«الأمر عندنا الإمساك عمّا وراء عدنان»*.
   **Do not use it in product copy.**
2. **«كذب النسابون»** in its *marfūʿ* form is graded **موضوع** by al-Albani, on a
   chain with two *matrūk* narrators (Hishām al-Kalbī and his father; Ibn Hibban
   adds that Abū Ṣāliḥ never met Ibn Abbas). Ibn Kathir notes the stronger
   attribution is *mawqūf*, and «والأصحّ عن ابن مسعود مثله». Ibn ʿAbd al-Barr reads
   the phrase as aimed at those who claim to enumerate *all* of Adam's descendants,
   not at genealogists generally. **Keep it out of the UI entirely** — it reads as
   an accusation against genealogists. The safe, sourced line for docs is
   **«الأمر عندنا الإمساك عمّا وراء عدنان إلى إسماعيل»**.
   Also: **«لا ترفعوني فوق عدنان»** is **لا أصل له** — scholars searching for it
   report «بحثتُ عنه طويلاً ولم أجده».
   ([islamweb fatwa 70753](https://www.islamweb.net/ar/fatwa/70753/) ·
   [al-maktaba](https://al-maktaba.org/book/31615/32682) ·
   [dorar.net](https://dorar.net/h/Ln2tcT6F))

**Terminology — the linguistic proof that this is a different edge type.**
لسان العرب: *«الوَلَدُ... ما وُلِدَ أيّاً كان»* — *ولد* covers a son **and** a remote
descendant, and the partitive **«من وَلَد فلان»** is what signals *descendant-of*.
Compare **«من صُلب فلان»**, which means a *direct biological son* («هؤلاء أبناءُ
صِلَبَتِهم») and would read as a factual error across a gap. **«من عَقِب فلان»** is
*«وَلَدُ الرجل ووَلَدُ وَلَدِه الباقون بعده»* — it reaches past the first generation
but is bound up with *survival of issue* and waqf/inheritance law, implying a line
you can actually follow; wrong register for a gap. **«من ذرّية»** is broad, Qur'anic
and safe but not the genealogists' working term; **«من نسل»** is a neutral middle.

**Ranking for "X descends from Y, intermediate fathers unknown":**
**من وَلَد** ≫ **من ذرّية** ≈ **من نسل** > **من عَقِب** ≫ **من صُلب** (means *son*; wrong).

The Arabic connector itself changes at the gap: **«بن» → «من وَلَد»**. That is the
strongest single argument that a gap is not a decorated parent link.
([لسان العرب — ولد](https://wiki.dorar-aliraq.net/lisan-alarab/ولد) ·
[عقب](https://wiki.dorar-aliraq.net/lisan-alarab/عقب) ·
[صلب](https://wiki.dorar-aliraq.net/lisan-alarab/صلب))

**[verified online]** The genealogists' own register has a real vocabulary for this,
from *اصطلاحات النسابة* (ابن عنبة, عمدة الطالب) and
[مصطلحات النسّابين](http://www.mkalat.com/wordpress/?p=22):

- **«نسب القَطْع»** and the register mark **«ع» = النسب منقطع** — the insider term
  for a lost connection. Also **«غ»** (record missing/illegible), **«يُنظر حاله»**
  (genealogists uncertain whether the connection continues).
- The four-grade ladder **صحيح / مقبول / مشهور / مردود**, where **«مشهور النسب»** =
  *"known and accepted for his standing while his actual nasab is not documented"*
  — an exact fit for a gap link.
- **«عمود النسب»** = the direct agnatic father-line spine; in fiqh, *عمودا النسب* =
  the ascending and descending lines as opposed to collaterals
  ([islamweb](https://www.islamweb.net/ar/fatwa/54192/)).
- **«الجدّ الجامع»** is a real, current term — verified live usage for حويط بن جمّاز
  (الحويطات), همدان, آل باعباد (حضرموت), and ashraf families. It connotes *several
  branches converging*, which slightly over-claims for a single family.

⚠️ **Words to avoid** — these are the register's vocabulary for *fraudulent
claimants* and would be genuinely insulting:
**ملصق، مناط، دعيّ، متحيّر، مرجّى، مغموز، منقود**, and by extension the verb
**«إلحاق»**. Use **«وصل»**, never «إلحاق».
Also avoid **«الحلقة المفقودة»** (no Arabic nasab pedigree — reads as the
*evolutionary* "missing link"), **«نسب مرسل»** (not an established term; hadith
terminology by false analogy), and **«الجد المجهول»** (inverts the meaning — the
ancestor is known; the intermediates are not).

**Loose thread worth ~10 minutes if anyone wants it:** confirm **«الاستفاضة» /
«نسب مستفيض»** as an evidentiary category. If it checks out it would be an
exceptionally elegant *status label* — it means precisely "established by broad,
consistent, uncontested transmission rather than documents." The research agent's
search budget ran out before it could be confirmed.

### A7. Is it general? Yes — overwhelmingly

**[verified online]** Arabic genealogical literature names the problem itself —
**«ضياع الأنساب»** — enumerates eleven causes (urbanisation, limits of oral memory,
political re-affiliation, absorption of weaker groups, adoption, early record
errors), and cites al-Suwaydi as documenting **over fifty Arab tribes of unknown
origin** ([al-maktaba](https://al-maktaba.org/book/31616/75122)). *Okaz* reports
genealogical forgery as *«ظاهرة اجتماعية ملحوظة تستحق الدراسة»*
([okaz](https://www.okaz.com.sa/article/260687)).

Modern **نقابة الأشراف** (Egypt) requires applicants to anchor to *«آخر جدٍّ مسجَّل
بالصك أو المشجَّر»* with شهود عدول testimony rather than documents alone — the
institution's entire function is adjudicating exactly this gap
([الوطن](https://www.elwatannews.com/news/details/7486227)). A whole academic
subfield exists (Kazuo Morimoto's "Sayyido-Sharifology"; Szombathy, *Motives and
Techniques of Genealogical Forgery in Pre-modern Muslim Societies*, EUP 2014).

Non-Arab parallels: Charlemagne "gateway ancestors" (only ~8 of his own ancestors
are provable); Scottish clan surnames (~70% of Scottish families were never tied to
the historic clans); Jewish Kohen descent to Aaron across ~100 undocumented
generations; Indian gotra attachment to a Vedic seer.

**Design implication: treat this as the common case, not an exception.** Where
institutions exist to police it, their raison d'être is proof of how routine it is.

---

## (b) Options

| | **Option 1 — flag on the existing parent link** | **Option 2 — separate `AncestryGap` relation** ⭐ | **Option 3 — placeholder "unknown" people** |
|---|---|---|---|
| **Shape** | `Family.isAncestryGap = true`; إسماعيل is stored as عدنان's "father" with a flag | New model, parallel to `RadaFamily`. Both people are ordinary `Individual`s; a separate row asserts "X descends from Y, N unknown between" | Auto-generate ~7–40 nameless `Individual` rows to bridge |
| **Work** | Smallest — every traversal, layout, count and export works unchanged | Medium — each traversal must opt in; layout needs a new edge kind | Small |
| **Failure mode** | **Fail-open.** Any code path that forgets the flag asserts false fatherhood — including `buildPersonJsonLd`, which would publish `"parent": إسماعيل` into Google's knowledge graph | **Fail-closed.** Code that doesn't know about gaps simply doesn't see the edge. Worst case is a missing link, never a false claim | Fabricates people who never existed |
| **Nasab** | Cannot render «من وَلَد» without special-casing anyway, so the saving is illusory | Renders «عدنان، من وَلَد إسماعيل» naturally | Renders a chain of «بن فلان بن فلان» that is pure invention |
| **Verdict** | ❌ Reject — the one thing we must never do is publish false precision, and this makes that the default | ✅ **Recommend** | ❌ Reject — condemned by every community source found; FamilySearch: *"at worst, plain fabrication"*; irreversible |

**On Option 1's apparent cheapness:** it looks like it buys free traversal, but the
two places that matter most — the nasab connector and the JSON-LD — need
special-casing regardless. So it costs almost the same and trades away the safety
property. **[my inference, held strongly.]**

---

## (c) Recommendation

### C1. Naming (Arabic)

> **OWNER DECISION (2026-09-22) — supersedes the table below.**
> Feature name = button = dashed-line label = **«قفزة نسب»**.
> **Why the label must NOT say the names are unknown/lost** (e.g. «أسماء لم تُحفظ»،
> «أجيال غير معروفة»): a user may add a jump even when the intermediate names ARE known,
> simply because those people are not of interest in his tree and he wants to skip them.
> "Jump" is neutral about the reason for the gap. The nasab connector «من وَلَد» stays
> when the distant ANCESTOR is a man (the descendant may be of either sex — a woman can
> be jumped to a male ancestor); a female-only ancestor is not put in the name chain. The button opens two
> paths: «شخص جديد» / «شخص موجود في الشجرة». Optional generation range kept.

| Surface | Term | Why |
|---|---|---|
| **Feature / button** | **«ربط بجدّ أعلى»** | *الجد الأعلى* is plain, universally understood, claims nothing about documentation, zero fraud connotation. |
| **Nasab connector** | **«من وَلَد»** | The *ijmāʿ* formula for this exact case, and Ibn Hazm's own chapter heading. E.g. «... بن عدنان، من وَلَد إسماعيل بن إبراهيم». |
| **Status label** | **«نسبٌ غير مُتَّصل»** or **«الآباء بينهما غير معروفين»** | Faithful to «قد جُهلت جملةً» / «لا يُعرفون». (The insider-accurate «نسب القَطْع» is authentic but reads harsh to a lay user.) |
| **Explanatory line** | «هذا الشخص من وَلَد فلان، دون معرفة الآباء الذين بينهما.» | Echoes both Ibn Abbas and Ibn Hazm. |

Runner-up: **«الجدّ الجامع»** — verified live usage, flatters a knowledgeable user,
but connotes *several branches converging*, so it over-claims for a single family.
Keep in reserve.

### C2. GEDCOM representation

**Principle applied** (per this project's standard-over-custom rule): the
*relationship* uses the standard `ASSO` mechanism. **Only the structured metadata is
custom.** On the reference page this must be documented as a **standard mechanism**,
not under "custom extensions" — the same distinction as `@#DHIJRI@`.

**5.5.1 export** (on the descendant's record):

```
0 @adnan-uuid@ INDI
1 NAME عدنان
1 SEX M
1 FAMS @fam-uuid@
1 ASSO @ishmael-uuid@
2 RELA ancestor
2 _GAP_MIN 4
2 _GAP_MAX 40
2 NOTE جدّ أعلى: عدنان من وَلَد إسماعيل بن إبراهيم عليهما السلام بإجماع الناس،
3 CONT والآباء الذين بينهما غير معروفين. قيل سبعة، وقيل ثلاثون، وقيل أربعون.
```

Three deliberate choices:

- **`RELA ancestor`** — 8 chars, safely inside the **25-character `RELA` limit**
  (our `sanitizeLine` does *not* truncate today; a truncation guard must be added).
  Direction follows the spec's own frame ("object 1's relation is object 2" →
  *"Adnan's ancestor is Ishmael"*), matching the `RELA great grandson` example.
  Lowercase, because webtrees requires lowercase for its translation lookup.
  ⚠️ Known risk: implementations read the direction inconsistently; the `NOTE`
  disambiguates.
- **`_GAP_MIN` / `_GAP_MAX`** carry the structured range. Gramps will silently drop
  these; that is acceptable and expected.
- **The `NOTE` duplicates the meaning in prose**, because the `NOTE` is what
  survives everywhere, and because 7.0 §1.5.3 requires the standard equivalent
  alongside an extension.

**7.0 export** — `SCHMA`-declared extension enum value (legal per §1.5/§2.3):

```
0 HEAD
1 GEDC
2 VERS 7.0
1 SCHMA
2 TAG _ANCESTOR https://gynat.com/gedcom/ext/_ANCESTOR
2 TAG _GAP_MIN  https://gynat.com/gedcom/ext/_GAP_MIN
2 TAG _GAP_MAX  https://gynat.com/gedcom/ext/_GAP_MAX
...
0 @adnan-uuid@ INDI
1 NAME عدنان
1 ASSO @ishmael-uuid@
2 ROLE _ANCESTOR
3 PHRASE جدّ أعلى — الآباء بينهما غير معروفين
2 _GAP_MIN 4
2 _GAP_MAX 40
2 NOTE عدنان من وَلَد إسماعيل بن إبراهيم بإجماع الناس، والآباء بينهما غير معروفين.
```

The `https://gynat.com/gedcom/ext/_ANCESTOR` page should state that it corresponds
to GEDCOM X's `http://gedcomx.org/AncestorDescendant`.

**Cheap opportunity:** the registry has *zero* entries in this space — filing
`_ANCESTOR` to [GEDCOM-registries](https://github.com/FamilySearch/GEDCOM-registries)
would make gynat the first implementation on record for a problem a
steering-committee member raised and left open.

**Graceful degradation — what others actually see:**

- **Gramps / Family Historian / webtrees:** an Association on عدنان pointing at
  إسماعيل, labelled `ancestor`, with our note attached. Correct meaning, no chart
  line. Gramps drops `_GAP_MIN/MAX`; the note survives.
- **MacFamilyTree:** unverified. Likely an association or a dropped line — either
  way the file imports cleanly; nothing crashes.
- **RootsMagic:** associations are excluded from its GEDCOM entirely, so the link is
  lost on *its* export, not ours.
- **Nothing anywhere renders a false parent-child link.** That is the property we are
  buying.

### C3. Data model

```prisma
model AncestryGap {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  treeId         String   @map("tree_id") @db.Uuid
  gedcomId       String?  @map("gedcom_id")
  descendantId   String   @map("descendant_id") @db.Uuid   // عدنان
  ancestorId     String   @map("ancestor_id")   @db.Uuid   // إسماعيل
  generationsMin Int?     @map("generations_min")          // 4
  generationsMax Int?     @map("generations_max")          // 40
  notes          Bytes?                                     // AES-256-GCM, workspace data key
  createdById    String?  @map("created_by") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  tree       FamilyTree @relation(fields: [treeId], references: [id], onDelete: Cascade)
  descendant Individual @relation("GapDescendant", fields: [descendantId], references: [id], onDelete: Cascade)
  ancestor   Individual @relation("GapAncestor",   fields: [ancestorId],   references: [id], onDelete: Cascade)

  @@unique([treeId, descendantId])   // v1: at most one gap-ancestor per person
  @@unique([treeId, gedcomId])
  @@index([ancestorId])
  @@map("ancestry_gaps")
}
```

**`notes` MUST be `Bytes?`** and go through `src/lib/tree/encryption.ts` like every
other free-text field — easy to miss on a new model **[read in code: every free-text
column on `Individual`/`Family`/`RadaFamily` is `Bytes?`]**.

**Why a range, not a count:** Ibn Kathir reports eight different figures. A single
number would force the user to pick one and would render as the same false precision
we are trying to avoid. Both fields nullable — "unknown how many" is the honest
default, and the عدنان case fills in 4–40.

**Constraints (v1):**

1. **Only on a person with no known father.** The gap belongs at the *top* of a
   known line. Enforced in the Zod schema + a server check.
2. **At most one gap-ancestor per person** (the unique index). Chains form
   naturally: عدنان ⇢ إسماعيل → إبراهيم (a normal father link) → ... ⇢ نوح.
3. **Cycle prevention is mandatory** — the proposed ancestor must not already be a
   descendant of the person via family *or* gap edges. Without this,
   `calculateDescendantCounts` (Kahn's) would silently drop the cyclic component
   rather than error. **[read in code: `graph.ts:345`]**
4. **Gender:** allow either sex on the ancestor, but only a **male** gap-ancestor
   extends the نسب line (patrilineal, per *«النسب مختصٌّ في الشرع بالآباء»*). A
   female gap-ancestor shows as a chip on the Person Page, not in the nasab ribbon.
5. **Both ends must be in the same tree** (`treeId` scoped) — no cross-tree gaps in v1.

**Deliberately deferred:** a certainty grade. The tradition hands us a ready-made
native ladder — **صحيح / مقبول / مشهور / مردود** (ابن عنبة) — which beats inventing
one or copying GEDCOM's `proven/challenged/disproven`. Flagged rather than
recommended, because it is scope the owner did not ask for. If ever added, use that
vocabulary. (Column-only now, UI later, is a reasonable middle.)

**The traversal rule that makes this safe:** every graph helper that could cross a
gap takes an explicit option, **defaulting to `false`**:

```ts
getAllAncestors(data, personId, { includeGaps?: boolean })  // default false
```

Existing callers keep today's behavior with no edits. Three call sites opt in
deliberately: the tree canvas, the Person Page nasab spine, and root finding.
Anything that forgets simply doesn't see the edge.

---

## (d) Impact list

All line references from code read on 2026-09-20.

**GEDCOM layer**

- `src/lib/gedcom/types.ts` — new `AncestryGap` interface; `GedcomData.ancestryGaps?`;
  `Individual.ancestryGapAsDescendant?` / `ancestryGapsAsAncestor?`, mirroring the
  `radaFamiliesAsChild` pattern (`types.ts:35`).
- `src/lib/gedcom/parser.ts` — handle `1 ASSO` at level 1 (INDI) and
  `RELA`/`ROLE`/`_GAP_MIN`/`_GAP_MAX`/`NOTE` at level 2, plus `CONT` at level 3.
  The parser's level-2 dispatch is keyed on `currentSubRecord` (`parser.ts:251`), so
  this slots in; ASSO records with a `RELA` we don't recognise should be ignored,
  not misread as gaps.
- `src/lib/gedcom/exporter.ts` — new emit block in `emitIndividual`; add the three
  tags to `EXT_URIS` (`:19`) and `collectCustomTags` (`:183`). **Add a 25-char
  truncation guard for `RELA`** — `sanitizeLine` (`:108`) strips `@` and newlines but
  does not truncate. Note the real export function is `gedcomDataToGedcom`, not
  `exportGedcom` as CLAUDE.md states (pre-existing doc drift).
- **GEDCOM import** — the import route must persist gaps and remap `@ID@` → new
  UUIDs, same as families.

**Graph & display**

- `src/lib/gedcom/graph.ts` — `includeGaps` option on `getAllAncestors` (`:8`),
  `getAllDescendants` (`:41`), `buildChildrenGraph` (`:311`),
  `calculateDescendantCounts` (`:345`), `findTopmostAncestor` (`:494`),
  `getConnectedIndividuals` (`:137`), `getCanvasVisibleIndividuals` (`:178`).
  `extractSubtree` (`:412`) is downward-only, so a gap ancestor above the root is
  naturally excluded — good, fail-closed.
- `src/lib/gedcom/roots.ts` — **`findDefaultRoot` (`:28`) tests
  `!person.familyAsChild`.** With a gap, عدنان still has no `familyAsChild`, so he
  would wrongly stay a "true root" while إسماعيل sits above him. Must become
  `!familyAsChild && !ancestryGapAsDescendant`. `findRootAncestors` returns everyone,
  so no change there.
- `src/lib/gedcom/display.ts` — `getDisplayNameWithNasab`: at a gap, emit
  «، من وَلَد X» and **stop** — never continue with «بن».
  ⚠️ **Real bug risk at `display.ts:93`**: the surname is taken from
  `lastPersonInChain`, so a naive implementation would stamp the *entire family* with
  إسماعيل's surname. The gap ancestor must be excluded from surname selection.
  Default `depth = 2` means most callers never reach a gap.

**Person Page**

- `src/lib/tree/person-projection.ts` — the paternal spine climb needs a third
  vertical transition kind alongside `isBoundary`/`climbBoundary`, emitting a visible
  gap marker and continuing to the ancestor. The **private gate invariant** must
  hold: a private gap ancestor follows the same «خاص» rule.
  **Bump `PROJECTION_ETAG_VERSION`** — logic-only changes leave `lastModifiedAt`
  untouched.
- `src/components/person/NasabRibbon` — render the gap visually (a «⋯» divider with
  «من وَلَد»), not as another «بن» token.

**Tree canvas — the largest single chunk**

- `src/components/tree/FamilyTree/layout.ts` — the two-pass subtree-width algorithm
  is keyed on `Family` records; a gap ancestor has none, so this is a new node/edge
  kind. Recommended visual: **dashed vertical edge with a «⋯» chip labelled
  «نسب غير متصل»**. The dashed convention is free to take: elsewhere in the industry
  dashed means adoptive/foster parentage, and gynat has no adoption feature.
  **[read in code]** rada'a is not drawn on the canvas at all (it lives only in the
  Person Page `RadaBlock`), so a gap edge would be the first non-`Family` edge the
  canvas has ever drawn.

**Safety-critical surfaces**

- `src/lib/tree/public-visibility.ts` (`redactForPublic`) — strip gap `notes` for
  redacted people; **suppress the gap edge entirely if either end is private**
  (fail-closed).
- `src/lib/tree/person-jsonld.ts` — ⚠️ **must NOT emit schema.org `parent`/`children`
  for a gap edge.** schema.org has no "ancestor" property, and publishing a false
  `parent` into Google's index is exactly the FamilySearch-عدنان failure mode.
  Recommendation: **emit nothing for gap edges.** That leaves the locked JSON-LD spec
  unchanged, so it needs no re-litigation — but it must be *written down* as a rule,
  or someone will "helpfully" add it later.
- `src/lib/tree/cascade-delete.ts` — **gap edges must NOT be traversed by
  `computeDeleteImpact`'s BFS.** A gap ancestor is a claim, not a dependent;
  traversing would sweep an entire apex lineage into a delete. Deleting either end
  deletes only the gap row. `computeVersionHash` should include gaps so stale-data
  detection stays correct.
- `src/lib/tree/branch-pointer-deep-copy.ts` — copy gap rows whose **both** ends are
  inside the copied set; drop dangling ones.

**Everything else**

- **Search** — no change; gap ancestors are ordinary `Individual`s, already indexed.
- **Audit log** — new `entityType: 'ancestry_gap'`, `snapshotAncestryGap()` in
  `audit.ts`, Arabic strings in `buildAuditDescription()`.
- **Undo** — create/delete are single-row ops, so they fit the existing per-tab undo
  stack for free.
- **API** — `POST`/`DELETE /api/workspaces/[id]/tree/ancestry-gaps[/:id]`, modelled
  on the rada'a routes; `treeId`-aware; `tree_editor`-or-admin gated;
  `touchTreeTimestamp` on every mutation.
- **No workspace feature toggle.** Rada'a doesn't have one **[read in code]**, and
  adding one here would be unrequested scope.

**Tests to write first (TDD):** parser round-trip; exporter 5.5.1 + 7.0 incl. the
`RELA` 25-char truncation; cycle rejection; nasab renders «من وَلَد» and does *not*
inherit the gap ancestor's surname; descendant counts unchanged with `includeGaps`
defaulted off; cascade delete does not traverse gaps; redaction suppresses a gap
touching a private person; JSON-LD emits no `parent` for a gap.

### C4. The `/islamic-gedcom` reference page

New section `id="ancestry-gap"`, titled **«الجدّ الأعلى — النسب غير المتصل»**, placed
after «الرضاعة». It must use the page's existing badge split
**[read in code: `tagBadgeStandard` vs `tagBadgeCustom`]**:

- `ASSO` / `RELA` / `ROLE` / `NOTE` → **standard** badges, with the note that 5.5.1's
  own spec example is `RELA great grandson`.
- `_GAP_MIN` / `_GAP_MAX` / `ROLE _ANCESTOR` → **custom** badges.

Content: the عدنان→إسماعيل worked example; both 5.5.1 and 7.0 snippets; the `SCHMA`
block; the 25-char `RELA` limit; what other software shows; and the constraint that a
gap link requires no known father. For the scholarly framing use only the sourced
line **«الأمر عندنا الإمساك عمّا وراء عدنان إلى إسماعيل»** — **not** «كذب النسابون»
(graded موضوع) and **not** «إذا بلغ نسبي عدنان فأمسكوا» (unsourceable). Add the
section to the page's nav list and to the `/compatibility` section.

---

## (e) Open questions for the owner — in plain language

1. **Should the distant ancestor appear on the main tree canvas, or only on the
   person's page?** Putting him on the canvas is the bigger piece of work, and it
   changes what people see the moment they open the tree — a broken, dashed line
   climbing above the top of the family. I think it belongs on the canvas, because
   hiding it would defeat the point. But it is the one decision that doubles the
   build.

2. **How should the name read when it crosses the gap?** Recommendation:
   «محمد بن عبد الله بن عبد المطلب … بن عدنان، **من وَلَد** إسماعيل بن إبراهيم».
   The wording changes from "son of" to "of the progeny of" exactly where the
   knowledge stops. This is the classical phrasing and the reason the gap is not
   treated as an ordinary parent link.

3. **Do you want to record how many generations are missing?** The sources give eight
   different answers for عدنان→إسماعيل (from 4 up to 40). Suggestion: let people enter
   a range — "between 4 and 40" — or leave it blank for "we don't know." A single
   number would be inventing certainty we don't have.

4. **Should someone be able to add a distant ancestor to a person who already has a
   known father?** Recommendation: no, for now. The gap naturally belongs at the *top*
   of a known line, and allowing it in the middle produces confusing names. Easy to
   relax later if families ask.

5. **Can a distant ancestor be a woman?** The link itself can point at anyone. But the
   نسب line is father-to-father by tradition, so a female distant ancestor would show
   on the person's page without joining the name chain. Confirm whether that split
   feels right.

6. **Do you want a "how sure are we?" label on the link?** Classical genealogists had
   their own four-word scale for exactly this: **صحيح / مقبول / مشهور / مردود**. It
   would be one dropdown. It is also scope that was not asked for, so it is left out
   of the recommendation.

7. **Should we publish this extension to the international GEDCOM registry?** There is
   currently *nothing* registered for this anywhere, and a member of the GEDCOM
   committee raised the same problem in 2024 and left it unsolved. Filing ours would
   cost about an afternoon and would put gynat on record as the first implementation.
   Purely optional, no effect on the product.

8. **One thing to bless explicitly:** when a gap ancestor is on a *public* tree, we
   will publish **no machine-readable parent-child claim** to Google for that link.
   Google has no way to say "ancestor, generations unknown," and saying "father" would
   be false. The link stays visible to human readers; it just doesn't go into search
   engines' data.

---

## Known gaps in the research (unverified / not chased)

These were reported as unverified by the research agents and are safe to skip unless
a specific decision turns on them:

- Whether **MacFamilyTree**'s "Influential Persons" uses `ASSO` or a custom tag —
  Synium's docs claim GEDCOM support but never name the tag.
- **Ancestry.com** help centre (403 to automated access); its reported "Related" and
  "Unknown" relationship types are unconfirmed second-hand.
- **Geni** profile/project pages (403). The unread
  [geni.com/discussions/237702](https://www.geni.com/discussions/237702) —
  "Geni's policy of detaching mythological profiles from the Tree" — is the
  highest-value unread source found.
- `ASSO` import/export behavior for Ancestry, MyHeritage, FTM, Geni, WikiTree,
  FamilySearch.
- A specific generation count endorsed by **السهيلي** personally — he is confirmed to
  argue the *small* counts are implausible, but **do not attribute a figure to him**.
- **«الاستفاضة» / «نسب مستفيض»** as a formal evidentiary category (see A6 loose thread).
- No single named ordinary family (within الدواسر / شمر / عنزة / عتيبة) was found
  explicitly documenting "we descend from founder X but generations Y–Z are
  undocumented" — though those tribes' own genealogy forums do this branch-reconciliation
  work continuously.
