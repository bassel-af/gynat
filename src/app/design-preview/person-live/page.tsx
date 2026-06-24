'use client';

/**
 * Live-component preview of the Person Page — renders the REAL wired components
 * (`src/components/person/*`) against a PersonProjection shaped exactly like the
 * backend `projectPerson` output (Surface 1). Dev-only (parent layout
 * prod-guards + noindexes). This is the screenshot target that proves the ported
 * components match the approved `design-preview/person` mockup.
 *
 * Chips are built with small factories so the verbose raw-date contract stays
 * readable; the dates are gregorian-only here (the calendar toggle just passes
 * them through), which is enough to exercise every component + state.
 */

import { use } from 'react';
import { PersonPage } from '@/components/person';
import type {
  MotherLine,
  PersonChip,
  PersonProjection,
  SpineChip,
} from '@/lib/tree/person-projection';

type G = 'male' | 'female';

/** A living/deceased person chip from a compact spec. */
function p(id: string, name: string, gender: G, birth = '', death = ''): PersonChip {
  return {
    id,
    name,
    givenName: name,
    gender,
    birth,
    birthHijriDate: '',
    death,
    deathHijriDate: '',
    isDeceased: !!death,
    living: !death,
    private: false,
  };
}

/**
 * A private «خاص» chain placeholder. Faithful to the contract: NO id (a private
 * placeholder carries no navigable handle), `private: true`.
 */
function priv(_key: string, gender: G): PersonChip {
  return {
    name: 'خاص',
    givenName: 'خاص',
    gender,
    birth: '',
    birthHijriDate: '',
    death: '',
    deathHijriDate: '',
    isDeceased: false,
    private: true,
  };
}

function withParent(chip: PersonChip, parentId: string): PersonChip {
  return { ...chip, parentId };
}

function mother(
  id: string,
  name: string,
  birth: string,
  death: string,
  fathers: PersonChip[],
  motherOf?: MotherLine,
): MotherLine {
  return { ...p(id, name, 'female', birth, death), gender: 'female', fathers, mother: motherOf };
}

function spine(chip: PersonChip, m?: MotherLine): SpineChip {
  return { ...chip, mother: m };
}

const projection: PersonProjection = {
  subject: {
    id: 'p-basel',
    name: 'باسل آل السعيد',
    givenName: 'باسل',
    surname: 'آل السعيد',
    kunya: 'أبو عمر',
    gender: 'male',
    birth: '١٩٨٠ م',
    birthHijriDate: '١٤٠٠ هـ',
    birthPlace: 'حلب · الحي القديم',
    death: '',
    deathHijriDate: '',
    deathPlace: '',
    notes:
      'هاجر إلى دمشق عام ١٤١٠ هـ ثم عاد إلى حلب. تتطابق سنة ميلاده في سجل العائلة مع ما ورد في وثيقة النفوس. يُراجَع اسم جده الأكبر للتثبت من ضبطه.',
    isDeceased: false,
    living: true,
    house: 'آل السعيد',
  },
  paternalChain: [
    spine(
      p('p-ibrahim', 'إبراهيم', 'male', '١٨٢٠', '١٨٩٥'),
      mother('pm-ib', 'حفصة الزعبي', '١٨٠٠', '١٨٧٥', [
        p('pm-ib-f', 'عبدالله الزعبي', 'male', '١٧٧٠', '١٨٤٠'),
        priv('pm-ib-priv', 'male'),
      ], mother('pm-ib-m', 'سارة الزعبي', '١٧٨٠', '١٨٥٠', [p('pm-ib-m-f', 'حسن المغربي', 'male', '١٧٥٠', '١٨٢٠')])),
    ),
    spine(priv('p-private-anc', 'male')),
    spine(
      p('p-omar1', 'عمر', 'male', '١٨٧٠', '١٩٤٠'),
      mother('pm-omar', 'آمنة القدسي', '١٨٥٠', '١٩٢٥', [
        p('pm-omar-f', 'يوسف القدسي', 'male', '١٨٤٥', '١٩١٠'),
        p('pm-omar-gf', 'مصطفى القدسي', 'male', '١٨٢٠', '١٨٩٠'),
      ]),
    ),
    spine(
      p('p-khaled', 'خالد', 'male', '١٩٠٠', '١٩٧٢'),
      mother('pm-khaled', 'خديجة المللي', '١٨٨٠', '١٩٦٠', [p('pm-khaled-f', 'سعيد المللي', 'male', '١٨٥٥', '١٩٢٠')]),
    ),
    spine(
      p('p-abdulnasser', 'عبدالناصر', 'male', '١٩٤٥', '٢٠١٨'),
      mother('pm-an', 'فاطمة الحموي', '١٩٢٢', '٢٠٠٥', [
        p('pm-an-f', 'محمود الحموي', 'male', '١٩٠٠', '١٩٧٨'),
        p('pm-an-gf', 'إبراهيم الحموي', 'male', '١٨٧٥', '١٩٤٥'),
      ]),
    ),
  ],
  maternalChain: [
    spine(
      p('m-suleiman', 'سليمان الدباغ', 'male', '١٨٥٠', '١٩٢٠'),
      mother('mm-sul', 'زينب الكردية', '١٨٢٥', '١٩٠٠', [p('mm-sul-f', 'عمر الكردي', 'male', '١٨٠٠', '١٨٧٠')]),
    ),
    spine(
      p('m-hasan', 'حسن الدباغ', 'male', '١٩١٥', '١٩٨٨'),
      mother('mm-has', 'صفية العطار', '١٨٩٠', '١٩٧٠', [
        p('mm-has-f', 'كامل العطار', 'male', '١٨٧٠', '١٩٤٠'),
        p('mm-has-gf', 'أحمد العطار', 'male', '١٨٤٥', '١٩١٥'),
      ]),
    ),
    spine(
      p('m-mother', 'رقية الدباغ', 'female', '١٩٥٠'),
      mother(
        'rq-m1', 'نجيبة الحفار', '١٩٢٥', '٢٠١٠',
        [p('rq-m1-f', 'توفيق الحفار', 'male', '١٩٠٠', '١٩٧٢')],
        mother(
          'rq-m2', 'مريم السمان', '١٩٠٠', '١٩٧٥',
          [p('rq-m2-f', 'رشيد السمان', 'male', '١٨٧٠', '١٩٤٠'), priv('rq-m2-gf', 'male')],
          mother(
            'rq-m3', 'لطيفة البارودي', '١٨٧٥', '١٩٥٠',
            [p('rq-m3-f', 'عبد الرحمن البارودي', 'male', '١٨٤٥', '١٩٢٠')],
            mother('rq-m4', 'عائشة الجابري', '١٨٥٠', '١٩٢٥', [p('rq-m4-f', 'سليم الجابري', 'male', '١٨٢٠', '١٨٩٥')]),
          ),
        ),
      ),
    ),
  ],
  marriages: [
    {
      familyId: 'fam-1',
      spouse: p('s-layla', 'ليلى الدالاتي', 'female', '١٩٨٤'),
      marriageEvent: { date: '', hijriDate: '١٤٢٧ هـ', place: 'حلب' },
      children: [
        p('c-omar', 'عمر', 'male', '٢٠٠٨'),
        p('c-yousef', 'يوسف', 'male', '٢٠١٠'),
        p('c-noor', 'نور', 'female', '٢٠١٣'),
      ],
    },
    {
      familyId: 'fam-2',
      spouse: p('s-mariam', 'مريم الدباغ', 'female', '١٩٨٨'),
      marriageEvent: { date: '', hijriDate: '١٤٣٦ هـ', place: 'دمشق' },
      children: [p('c-sara', 'سارة', 'female', '٢٠١٦')],
    },
  ],
  grandchildren: [
    withParent(p('g-tasnim', 'تسنيم', 'female'), 'c-omar'),
    withParent(p('g-ziad', 'زياد', 'male'), 'c-omar'),
    withParent(p('g-lina', 'لينا', 'female'), 'c-noor'),
  ],
  siblings: [p('sib-ahmad', 'أحمد', 'male', '١٩٧٨'), p('sib-huda', 'هدى', 'female', '١٩٨٢')],
  paternalUncles: [p('u-walid', 'وليد', 'male', '١٩٤٢', '٢٠٠٩'), p('u-sami', 'سامي', 'male', '١٩٤٨')],
  maternalUncles: [
    p('mu-ghassan', 'غسان الدباغ', 'male', '١٩٥٢'),
    p('mu-anwar', 'أنور الدباغ', 'male', '١٩٥٥', '٢٠٢١'),
  ],
  paternalCousins: [
    withParent(p('pc-tareq', 'طارق', 'male'), 'u-walid'),
    withParent(p('pc-rana', 'رنا', 'female'), 'u-walid'),
    withParent(p('pc-fadi', 'فادي', 'male'), 'u-sami'),
    withParent(p('pc-dima', 'ديمة', 'female'), 'u-sami'),
  ],
  maternalCousins: [
    withParent(p('mc-kareem', 'كريم', 'male'), 'mu-ghassan'),
    withParent(p('mc-salma', 'سلمى', 'female'), 'mu-ghassan'),
    withParent(p('mc-jad', 'جاد', 'male'), 'mu-anwar'),
  ],
  rada: {
    fathers: [p('r-father', 'عبد القادر الحلبي', 'male', '١٩٤٤', '٢٠١٢')],
    mothers: [p('r-mother', 'زينب الحلبي', 'female', '١٩٤٨')],
    siblings: [p('r-sib-bilal', 'بلال الحلبي', 'male', '١٩٧٩'), p('r-sib-aisha', 'عائشة الحلبي', 'female', '١٩٨١')],
  },
};

// A living-chain projection to exercise the public living-connector suppression:
// subject + the two nearest ancestors are all living, so the public ribbon drops
// the بن between them; the deceased great-grandfather keeps his connector.
const livingChainProjection: PersonProjection = {
  ...projection,
  paternalChain: [
    p('lc-jad', 'الجد الأكبر', 'male', '١٩٣٠', '٢٠٠٠'), // deceased → keeps بن
    { ...p('lc-grand', 'الجد', 'male', '١٩٥٥'), living: true },
    { ...p('lc-father', 'الأب', 'male', '١٩٨٠'), living: true },
  ],
};

export default function PersonLivePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const isPublic = use(searchParams)?.variant === 'public';
  return (
    <PersonPage
      projection={isPublic ? livingChainProjection : projection}
      hrefFor={(id) => `#${id}`}
      backHref="#back"
      treeHref="#tree"
      enableKunya
      variant={isPublic ? 'public' : 'member'}
    />
  );
}
