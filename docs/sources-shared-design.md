# Shared sources (one document, many people): designs under review

Status: PROPOSED, awaiting the owner's answers (2026-09-25). Three designs are below; a separate review recommended design A (the «يخص» picker) plus a household quick-pick and the reuse suggestion.

---

# Problem: one document backs many people

## Owner's words (2026-09-25)
"If a source is applicable to 30 people, or 10, or 5, or 100 (let's say دفتر العائلة, like in Syria), then currently we have to upload it to every person of the family. This is a disaster."

## What is built today (committed, v1 in progress)
- A source is a standalone **entry on ONE person**, holding:
  - free text «المصدر» (e.g. «طبقات ابن سعد، ص ٩٠»),
  - optional files (images/PDF, encrypted, up to 8 MB each, about 20 per entry),
  - one visibility level, «من يرى هذا المصدر؟»: المشرفون فقط (default) / أعضاء مساحة العائلة / أعضاء مساحة العائلة وزوار الشجرة المنشورة.
- Entries are never shared or linked. Typing suggestions copy earlier TEXT only; files are not copied.
- There is one tree-wide entry, «مصدر الشجرة», inherited by anyone who has no own entry. It is all-or-nothing for the whole tree.
- The admin «المصادر» page offers search, select-all, bulk level change and bulk delete.
- A person's sources appear:
  - in the sidebar panel;
  - in the person edit/create form, staged and saved on «حفظ»;
  - on the member person page;
  - and publicly, for level-3 entries on people the public tree shows.
- The publish flow asks once which sources become public.
- Copy rules: same-workspace copies carry everything. Cross-family copies carry only level-3 entries, re-encrypted. (That code was not built yet, because step 8 is paused.)

## Owner decisions that still stand (don't re-open)
- **No "create a source first" library step.** The owner found a separate library/types/«الموضع» flow too complex and chose "every entry stands alone" for simplicity. The new design must stay AS SIMPLE for the one-person case.
  - Tension to resolve: the owner now also wants one document to serve many people without re-uploading.
- The 3 visibility levels and their exact wording.
- Admins see everything, including on private people. Members never see sources on private people. Public visitors see level 3 only, on people the public tree shows.
- Nothing is auto-saved inside a panel that has a save button.
- Mobile-first Arabic RTL. Plain Arabic copy, no «الآن/أصبح».

## Real scenarios to design for
1. A Syrian دفتر العائلة: one booklet (several scanned pages) lists a father, a mother and 8 children. It should back all 10 people.
2. An إخراج قيد or family register that lists 3 generations: about 30 people.
3. A book, «طبقات ابن سعد»: the same book backs 200 people, each at a different page. It may have no files, just text.
4. A passport that backs 1 person only. This must stay as simple as today.
5. Later, the admin discovers the دفتر العائلة also covers 2 more people, or that one child was wrongly attached.
6. The admin wants the دفتر العائلة to be admins-only, but the book to be visible to the public.

---

# Designer A: "Pick the people" (condensed, faithful)

**Form**
- Today's form gains one line under the files: «يخص:» with one chip (the starting person) and the link «+ أشخاص آخرون».
- A passport never touches this line.
- The picker opens inline:
  - Quick-pick toggle chips from `getPersonRelationships` (only groups that exist):
    - From the father: «الزوجة: فاطمة» · «الأبناء (٨)» · «الأسرة كلها (١٠)».
    - From a child: «الوالدان» · «الإخوة (٧)» · «الأسرة كلها».
    - A polygamous father gets one chip per wife and her children.
  - Search with a 2-generation nasab to tell apart people with the same name.
- More than 6 chips collapse to «محمد، فاطمة، و٨ آخرون ▾».
- «حفظ» makes one source with N links, as one undo entry.

**Reverse path**
- Suggestions can be existing sources: «📎 دفتر العائلة · ١٠ أشخاص · ٣ ملفات».
- Picking one offers «ربطه بهذا الشخص» (link, no upload) or «نسخ النص فقط».

**On each person**
- A pill «مشترك مع ٩ آخرين».
- The edit banner, when N > 1: «هذا المصدر يخص ١٠ أشخاص. أي تعديل هنا يظهر عندهم جميعًا.»
- Row menu: «إزالته عن أحمد فقط» and «حذف المصدر من الجميع (١٠)».
- Detaching a wrongly attached child: × on their chip.

**Other rules**
- No per-link page field; the owner rejected «الموضع». Books with different pages stay as one entry per person.
- Visibility lives on the source. Raising it to level 3 adds «…ويظهر على ١٠ أشخاص» to the warning.
- Admin page: one row per source, a people column «محمد، فاطمة و٨ آخرون ▾», and the filter «مشتركة فقط».

**Model**
- `SourceEntry` becomes `Source`, plus `SourceLink(sourceId, individualId)` with a unique pair.
- Migration: 1:1, then `individualId` is dropped.
- The tree-wide source stays a Source with no links.
- The gate works per (source, person).

**Edges**
- Non-admin editors never see private people in the picker.
- Counts include only people the viewer can see.
- A non-admin's delete removes only the links they can see.
- Borrowed people are excluded, with a note.
- Deleting the last link deletes the source.
- In the new-person form, the chip «هذا الشخص (جديد)» is saved on «حفظ».
- The publish step counts sources.

**Designer's own risks**
1. An edit meant for one person changes it for everyone.
2. Private-people counts and delete logic must be correct, or they leak.
3. The picker grows into a mini app on 390px.

# Designer C: "Sources live where the document lives" (condensed, faithful)

**Verdicts**
- KEEP the household source: the head, all his spouses and the children of all his couples. It is worked out when read, so a child added later is covered.
- DROP the branch source: a 1970 register would silently "prove" grandchildren.
- DROP canvas multi-select: it clashes with pan and select, and doesn't work on mobile.

**Form**
- A new field «من يشمل هذا المصدر؟» appears only when the person heads a household. Its default is «هذا الشخص فقط».
- Options: «هذا الشخص فقط» / «محمد وزوجاته وأبناؤهم (١٠)». For a female head: «{الاسم} وزوجها وأبناؤهما».
- The household option has a collapsed checklist, all ticked. Unticking stores an exclusion.
- «إضافة أشخاص آخرين» adds explicit extras.
- A couple entry point: «إضافة مصدر للعائلة» in «معلومات الزواج».

**On each person**
- An inherited row: «من دفتر عائلة محمد · يشمل ١٠ أشخاص», with a «⋯» menu offering «إزالة هذا الشخص من المصدر».
- A shared-edit banner.
- Full delete is only possible from the head's panel or the admin page.
- A household entry counts as a person's own source for the «مصدر الشجرة» fallback.

**Model**
- `SourceEntry` keeps `individualId` as the anchor and gains `scope` (person | household).
- A new table `SourceEntryPerson(entryId, individualId, mode include|exclude)`.
- A pure `resolveCoveredPeople(entry, data)` computes coverage at read time.
- When the head is deleted, the covered people are frozen into include rows.
- A book with different pages (scenario 3) stays one entry per person.

**Designer's own risks**
1. People get "proven" silently, e.g. a child from a later marriage.
2. Coverage is computed, so a bug in `resolveCoveredPeople` leaks an admins-only دفتر onto the wrong person, and every leak test must run against the resolved coverage.
3. One edit changes many people.

---

# Designer B: "Reuse as you go" (condensed, faithful)

**Model**
- `Source`: treeId, encrypted text, files, visibility.
- `SourceLink`: sourceId, individualId, optional encrypted `note` (page/line), createdById; unique on (source, individual).
- Visibility lives on the Source. A one-person source is a source with one link.
- The tree-wide source is a Source with no links, flagged `treeWide`.
- Migration: each existing entry becomes one Source plus one link. There is no auto-merge.

**Flow**
- The first person gets today's form, unchanged.
- On person #2 onward, a strip «مصادر مستخدمة في هذه العائلة» appears above the box.
  - It shows up to 3 cards (thumbnail, title, «مستخدم لـ ١٠ أشخاص»).
  - Ranking: household first (parents, spouses, siblings, children), then recent use by this admin, then typing.
- Tapping a card switches to linked mode:
  - A read-only card with the «مصدر مشترك» chip; the files and level are hidden.
  - One box: «ملاحظة لهذا الشخص (اختياري)», e.g. «ص ٤، السطر ٧».
  - «إلغاء الاختيار» returns to the plain form.
- Typing suggestions become «استخدام نفس المصدر · مستخدم لـ ٢٠٠ شخص», and picking one opens linked mode with focus on the note. The last option is always «مصدر جديد بهذا النص». There is no text-copy any more.
- After save, a sheet asks «أضف «دفتر العائلة» لبقية الأسرة؟».
  - Household members not yet linked are pre-ticked.
  - Buttons: [إضافة لـ ٥] [ليس الآن]. It is its own button, so the no-auto-save rule holds.

**Edit and remove**
- Editing a shared source shows a banner: «هذا المصدر مستخدم لـ ١٠ أشخاص. تعديل النص والملفات ومن يراه يسري عليهم جميعًا.» The note is edited per person.
- «إزالة من هذا الشخص» removes it from one person. When it is the last person, the source stays under «لا يستخدمه أحد» until deleted.

**Admin page**
- One row per source, with a «١٠ أشخاص ▾» chip that expands to the names, each with ×, plus «إضافة أشخاص» (a person picker).
- Bulk actions work on sources. Delete asks «حذف المصدر من ١٠ أشخاص؟».
- A filter shows «لا يستخدمه أحد».

**Edge cases**
- Members never see links on private people, and the counts include only people the viewer can see.
- Public visitors never see the people list.
- Borrowed people: no strip and no linking.
- Undo: one entry per link; the sheet counts as one combined entry. Deleting a person drops their links, and undo re-links them.
- Publish counts sources: «٣ مصادر (تغطي ٤٢ شخصًا)».
- A branch copy carries a source plus only the links whose person landed in the copy.

**Drop:** text-copy suggestions, per-entry admin rows, the picker in linked mode, and the "never shared" rule.

**Designer's own risks**
1. Admins edit a shared source for everyone by accident. There is no "edit only for this person".
2. Page numbers get typed into the shared text instead of the note, creating near-duplicates; there is no merge tool.
3. One level per source: a دفتر covering a dead grandfather and living children is public for all or none.

---

# REVIEWER'S RECOMMENDATION (the direction going forward, pending owner answers)
**Design A (the explicit «يخص» picker), plus C's household only as a quick-pick chip, plus B's reuse suggestion.**

Why C's computed coverage and B's strip and sheet were cut:
- C's coverage is computed when read, so it silently "proves" people nobody chose, and every privacy test would have to run against the computed result.
- B's reuse strip and after-save sheet add noise, the kind of complexity the owner already rejected.

## Form
- The form keeps today's fields, plus one line: «يخص: (محمد) + أشخاص آخرون». A passport never touches it.
- The picker is a bottom sheet at 390px.
- Quick-pick chips come from `getPersonRelationships`:
  - «الزوجة: …», «الأبناء (٨)», «الأسرة كلها (١٠)», «الأبناء والأحفاد (٣٠)».
  - A polygamous father gets one chip per wife.
- Each chip picks its people ONCE, at pick time, and they become an explicit list the admin can untick. Coverage is never computed later.
- Search results show the 2-generation nasab.
- «تم» stages the choice; nothing is saved until the form's «حفظ». In the new-person form, the person shows as the chip «هذا الشخص (جديد)».

## Reuse
- Typing suggestions show «📎 دفتر العائلة · يخص ١٠ أشخاص · ٣ ملفات», with the choices [ربطه بهذا الشخص] or [نسخ النص فقط].
- A person with no sources whose parents, spouse or siblings share one sees «مصادر أسرته: 📎 … [إضافة]» (at most 2). The button stages the link.

## Safeguards against accidental shared edits
- When the source covers more than one person, the edit form shows the banner «هذا المصدر يخص ١٠ أشخاص. أي تعديل هنا يظهر عندهم جميعًا.»
- When the text, files or level changed, the save button reads «حفظ عند ١٠ أشخاص».
- There is no "edit only for this person". To fork a source, detach the person and add a new one.

## Where a shared source appears
- Sidebar row: a pill «مشترك مع ٩ آخرين», and the row menu «إزالته عن أحمد فقط» · «حذف المصدر من الجميع (١٠)». Deleting from everyone asks to confirm: «سيُحذف المصدر وملفاته من ١٠ أشخاص.»
- Member person page: «يخص أيضًا: …», limited by privacy. The public page never shows the people list.
- Admin page:
  - One row per source, with the people column «محمد، فاطمة و٨ آخرون ▾» (each name with ×, plus «+ إضافة أشخاص»).
  - Filter «مشتركة فقط».
  - Bulk actions work per source.
- Publish step: «٣ مصادر (تظهر على ٤٢ شخصًا)».
- The level-3 files warning is extended: «…ويظهر على الأشخاص الظاهرين في الشجرة المنشورة (٣ من ١٠). تأكد أن الملفات لا تحوي بيانات شخصية لأحياء.»

## Per-person note or page
None; the owner rejected «الموضع». A book cited at different pages stays one entry per person, using the text-copy suggestion. There are no files in that case, so nothing is re-uploaded.

## Removing people
- A source never exists with nobody attached. Detaching the last person, or deleting that person, deletes the source and its files.
- With one person linked, the menu shows only «حذف المصدر».
- Undoing a person delete re-links any shared source that still exists.
- A shared source counts as the person's own for the «مصدر الشجرة» fallback.

## Visibility
One level per source. Public visitors see level 3 only on people the public tree shows. The real risk is what the FILE shows about living people, which is handled by the extended warning above.

## Model
- `SourceEntry` is renamed `Source`: `treeId`, `visibility`, `text`, files, `isTreeWide Boolean`, no `individualId`.
- New `SourceLink(sourceId, individualId, treeId, createdById, createdAt)`, unique on `(sourceId, individualId)`, cascade from both sides. The "last link deletes the source" rule is enforced in the application transaction.
- Migration: 1 source + 1 link per existing row. Sources v1 isn't in production, so the original migration can be amended instead of adding a new one.
- The gate stays per (source, person).
- Branch copies carry the source plus only the links whose person landed in the copy.

## Undo
- One entry per form save, labelled «مصدر «…» لـ ١٠ أشخاص».
- One entry per detach.
- One entry per shared edit.

## Edges
- Non-admin editors never see private people in the picker. For them, delete-from-everyone removes only the links they can see.
- Borrowed people are excluded from the picker, with the note «أشخاص الفروع المرتبطة من عائلة أخرى لا يُضاف لهم مصدر».
