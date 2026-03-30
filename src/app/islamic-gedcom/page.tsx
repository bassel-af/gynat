import type { Metadata } from 'next';
import styles from './islamic-gedcom.module.css';

export const metadata: Metadata = {
  title: 'مرجع GEDCOM الإسلامي | Islamic GEDCOM Reference',
  description:
    'مرجع شامل لتوثيق الأنساب الإسلامية في صيغة GEDCOM — التاريخ الهجري، عقد القران، الزفاف، الطلاق، والرضاعة. A comprehensive reference for documenting Islamic genealogy in GEDCOM format — Hijri dates, Nikah, marriage events, divorce, and Rada\'a (milk kinship).',
  keywords: [
    'Islamic GEDCOM',
    'GEDCOM الإسلامي',
    'Hijri date GEDCOM',
    'التاريخ الهجري',
    'عقد القران',
    'Nikah GEDCOM',
    'MARC tag',
    'Muslim genealogy',
    'الأنساب الإسلامية',
    'شجرة العائلة',
    'Islamic family tree',
    'Nasab',
    'النسب',
    'الرضاعة',
    'Rada milk kinship GEDCOM',
    '_RADA_FAM',
    '_UMM_WALAD',
    'أم ولد',
    'GEDCOM 5.5.1',
    'GEDCOM 7',
    '@#DHIJRI@',
    '_HIJR',
    'Arabic genealogy',
  ],
  openGraph: {
    title: 'مرجع GEDCOM الإسلامي | Islamic GEDCOM Reference',
    description:
      'مرجع شامل لتوثيق الأنساب الإسلامية في صيغة GEDCOM — التاريخ الهجري، عقد القران، الزفاف، الطلاق، والرضاعة.',
    type: 'article',
    locale: 'ar_SA',
    alternateLocale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'مرجع GEDCOM الإسلامي | Islamic GEDCOM Reference',
    description:
      'A comprehensive reference for documenting Islamic genealogy in GEDCOM — Hijri dates, Nikah, marriage, divorce, and Rada\'a (milk kinship).',
  },
  alternates: {
    canonical: '/islamic-gedcom',
  },
};

export default function IslamicGedcomPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>مرجع GEDCOM الإسلامي</h1>
          <p className={styles.pageSubtitle}>
            مرجع شامل لتوثيق الأنساب وفق المفاهيم الشرعية الإسلامية،
            باستخدام علامات GEDCOM القياسية (5.5.1 و 7.0) وامتدادات مخصصة.
          </p>
        </header>

        {/* ─── Why ─── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>لماذا هذا المرجع؟</h2>
          <p className={styles.desc}>
            صيغة GEDCOM هي المعيار العالمي لتبادل بيانات الأنساب، لكنها صُممت
            بمنظور غربي لا يغطي بعض خصوصيات التوثيق الإسلامي جميعها مثل: التقويم الهجري، الأقارب من الرضاعة وغير ذلك.
            </p>
          <p className={styles.desc}>
            هذا المرجع يوضّح كيفية استخدام علامات GEDCOM الموجودة لتمثيل المفاهيم
            الإسلامية بدقة، ويُعرّف امتدادات مخصصة عند عدم وجود علامة قياسية مناسبة.
          </p>
        </section>

        {/* ─── Hijri Calendar ─── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>التقويم الهجري</h2>
          <p className={styles.desc}>
            يُسجّل التاريخ الهجري باستخدام آلية معرّف التقويم (calendar escape)
            القياسية في GEDCOM.
            يوضع <span className={styles.inlineCode}>@#DHIJRI@</span> كبادئة على سطر DATE تحت أي حدث
            (ولادة، وفاة، زواج، عقد، طلاق). يمكن وضع سطرين DATE تحت نفس الحدث:
            واحد ميلادي وواحد هجري.
          </p>

          <div className={styles.tagBlock}>
            <div className={styles.tagHeader}>
              <span className={`${styles.tagBadge} ${styles.tagBadgeStandard}`}>@#DHIJRI@</span>
              <span className={styles.tagLabel}>معرّف تقويم</span>
              <span className={styles.tagName}>التاريخ الهجري</span>
            </div>
            <p className={styles.tagDesc}>
              الصيغة: <span className={styles.inlineCode}>@#DHIJRI@</span> يوم رمز_الشهر سنة.
            </p>
            <div className={styles.codeBlock}>
              <span className={styles.codeComment}>{"// تاريخ ميلادي وهجري معاً"}</span>{'\n'}
              <span className={styles.codeTag}>1 BIRT</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>1 JAN 1990</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 15 MUHAR 1410</span>{'\n'}
              <span className={styles.codeTag}>2 PLAC</span> <span className={styles.codeVal}>مكة المكرمة</span>{'\n'}
              {'\n'}
              <span className={styles.codeComment}>{"// تاريخ هجري فقط (بدون ميلادي)"}</span>{'\n'}
              <span className={styles.codeTag}>1 BIRT</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 3 RAMAD 1380</span>{'\n'}
              <span className={styles.codeTag}>2 PLAC</span> <span className={styles.codeVal}>المدينة المنورة</span>
            </div>
            <div className={styles.note}>
              رموز الأشهر الهجرية: MUHAR (محرم)، SAFAR (صفر)، RABIA (ربيع الأول)، RABIT (ربيع الثاني)،
              JUMAA (جمادى الأولى)، JUMAT (جمادى الآخرة)، RAJAB (رجب)، SHAAB (شعبان)،
              RAMAD (رمضان)، SHAWW (شوال)، DHUAQ (ذو القعدة)، DHUAH (ذو الحجة).
              <br /><br />
              <span className={styles.inlineCode}>_HIJR</span> مدعوم كبديل قديم للتوافق مع الملفات السابقة.
            </div>
          </div>
        </section>

        {/* ─── Custom Tags ─── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>الامتدادات المخصصة</h2>
          <p className={styles.desc}>
            علامات غير موجودة في معيار GEDCOM الرسمي، أُنشئت لتغطية احتياجات
            التوثيق الإسلامي. تبدأ بشرطة سفلية وفق اتفاقية GEDCOM للعلامات المخصصة.
            متوافقة مع GEDCOM 5.5.1 و 7.0.
          </p>

          {/* _UMM_WALAD */}
          <div id="umm-walad" className={styles.tagBlock}>
            <div className={styles.tagHeader}>
              <span className={`${styles.tagBadge} ${styles.tagBadgeCustom}`}>_UMM_WALAD</span>
              <span className={styles.tagLabel}>امتداد</span>
              <span className={styles.tagName}>أم ولد</span>
            </div>
            <p className={styles.tagDesc}>
              في التاريخ الإسلامي، كان يحق للرجل أن تكون له إماء (جوارٍ)،
              وإذا أنجبت الأَمَة من سيدها سُمّيت &laquo;أم ولد&raquo; — وهو مصطلح فقهي
              يمنحها مكانة خاصة.
            </p>
            <p className={styles.tagDesc}>
              يوضع على سجل العائلة (<span className={styles.inlineCode}>FAM</span>) للإشارة
              إلى أن الأم هي أم ولد وليست زوجة بعقد نكاح.
              الأبناء في هذه العائلة هم أبناء شرعيون في النسب ولا فرق بينهم وبين أبناء الزوجة.
              غياب هذه العلامة يعني أن العلاقة علاقة نكاح بشكل افتراضي.
            </p>
            <div className={styles.codeBlock}>
              <span className={styles.codeId}>0 @F2@ FAM</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _UMM_WALAD</span> <span className={styles.codeVal}>Y</span>{'\n'}
              <span className={styles.codeTag}>1 HUSB</span> <span className={styles.codeId}>@I1@</span>{'\n'}
              <span className={styles.codeTag}>1 WIFE</span> <span className={styles.codeId}>@I5@</span>{'\n'}
              <span className={styles.codeTag}>1 CHIL</span> <span className={styles.codeId}>@I10@</span>{'\n'}
              <span className={styles.codeTag}>1 CHIL</span> <span className={styles.codeId}>@I11@</span>
            </div>
            <div className={styles.note}>
              هذا التوثيق يخص الحالات التاريخية. ملك اليمين كان شائعاً في التاريخ الإسلامي
              وكثير من الشخصيات البارزة كانوا أبناء جوارٍ.
              العلامة لا تؤثر على بنية الشجرة — الأبناء يظهرون كأي أبناء آخرين.
              <br /><br />
              <span className={styles.inlineCode}>_UMM_WALAD</span> و<span className={styles.inlineCode}>MARC</span>/<span className={styles.inlineCode}>MARR</span>{' '}
              متعارضان: عائلة أم الولد لا يكون فيها عقد قران ولا زفاف.
              وجود <span className={styles.inlineCode}>_UMM_WALAD Y</span> يعني عدم وجود{' '}
              <span className={styles.inlineCode}>MARC</span> أو{' '}
              <span className={styles.inlineCode}>MARR</span> في نفس السجل.
            </div>
          </div>
        </section>

        {/* ─── Standard Tags for Islamic Events ─── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>أحداث الزواج الإسلامي</h2>
          <p className={styles.desc}>
            في الثقافة الإسلامية، الزواج يمر بمراحل مختلفة قد تكون متباعدة زمنياً.
            علامات GEDCOM القياسية تتوافق مباشرة مع هذه المراحل:
          </p>

          {/* Mapping table */}
          <div className={styles.mappingTable}>
            <div className={styles.mappingRow}>
              <span className={styles.mappingTag}>MARC</span>
              <span className={styles.mappingArrow}>&larr;</span>
              <span className={styles.mappingConcept}>عقد القران (النكاح)</span>
            </div>
            <div className={styles.mappingRow}>
              <span className={styles.mappingTag}>MARR</span>
              <span className={styles.mappingArrow}>&larr;</span>
              <span className={styles.mappingConcept}>حفل الزفاف (الوليمة)</span>
            </div>
            <div className={styles.mappingRow}>
              <span className={styles.mappingTag}>DIV</span>
              <span className={styles.mappingArrow}>&larr;</span>
              <span className={styles.mappingConcept}>الطلاق أو الخلع</span>
            </div>
          </div>

          {/* MARC */}
          <div className={styles.tagBlock}>
            <div className={styles.tagHeader}>
              <span className={`${styles.tagBadge} ${styles.tagBadgeStandard}`}>MARC</span>
              <span className={styles.tagLabel}>قياسي</span>
              <span className={styles.tagName}>عقد القران (النكاح)</span>
            </div>
            <p className={styles.tagDesc}>
              العقد الشرعي الذي يتم بحضور الولي والشهود مع تحديد المهر.
              هذا هو الحدث الذي يصبح فيه الزوجان مرتبطان شرعاً.
              قد يسبق حفل الزفاف بأيام أو أشهر أو حتى سنوات.
            </p>
            <p className={styles.tagDesc}>
              علامة <span className={styles.inlineCode}>MARC</span> (Marriage Contract) موجودة
              في معيار GEDCOM منذ الإصدار 5.5 — وهي تتطابق تماماً مع مفهوم عقد القران الإسلامي.
            </p>
            <div className={styles.codeBlock}>
              <span className={styles.codeId}>0 @F1@ FAM</span>{'\n'}
              <span className={styles.codeTag}>1 MARC</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>11 JUL 2022</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 12 DHUAH 1443</span>{'\n'}
              <span className={styles.codeTag}>2 PLAC</span> <span className={styles.codeVal}>الرياض</span>{'\n'}
              <span className={styles.codeTag}>2 NOTE</span> <span className={styles.codeVal}>بحضور الشيخ أحمد</span>
            </div>
          </div>

          {/* MARR */}
          <div className={styles.tagBlock}>
            <div className={styles.tagHeader}>
              <span className={`${styles.tagBadge} ${styles.tagBadgeStandard}`}>MARR</span>
              <span className={styles.tagLabel}>قياسي</span>
              <span className={styles.tagName}>حفل الزفاف (الوليمة)</span>
            </div>
            <p className={styles.tagDesc}>
              حفل الزفاف والوليمة — الاحتفال العلني بالزواج.
              غالباً يكون بعد عقد القران بفترة.
              إذا تم عقد القران والزفاف في نفس اليوم، يمكن تسجيل كليهما بنفس التاريخ
              أو الاكتفاء بـ <span className={styles.inlineCode}>MARR</span>.
            </p>
            <div className={styles.codeBlock}>
              <span className={styles.codeId}>0 @F1@ FAM</span>{'\n'}
              <span className={styles.codeTag}>1 MARR</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>27 APR 2023</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 7 SHAWW 1444</span>{'\n'}
              <span className={styles.codeTag}>2 PLAC</span> <span className={styles.codeVal}>الرياض</span>
            </div>
          </div>

          {/* DIV */}
          <div className={styles.tagBlock}>
            <div className={styles.tagHeader}>
              <span className={`${styles.tagBadge} ${styles.tagBadgeDivorce}`}>DIV</span>
              <span className={styles.tagLabel}>قياسي</span>
              <span className={styles.tagName}>الطلاق أو الخلع</span>
            </div>
            <p className={styles.tagDesc}>
              إنهاء عقد الزواج، سواء بطلاق أو خلع.
              لا يؤثر على شجرة النسب — الأطفال يبقون مرتبطين بسجل العائلة
              وبكلا الوالدين بعد الطلاق، لذا ليس هناك داع لعلامات مخصصة.
            </p>
            <div className={styles.codeBlock}>
              <span className={styles.codeId}>0 @F1@ FAM</span>{'\n'}
              <span className={styles.codeTag}>1 MARC</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>15 MAR 2018</span>{'\n'}
              <span className={styles.codeTag}>1 DIV</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>20 NOV 2023</span>{'\n'}
              <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 5 JUMAA 1445</span>{'\n'}
              <span className={styles.codeTag}>1 HUSB</span> <span className={styles.codeId}>@I1@</span>{'\n'}
              <span className={styles.codeTag}>1 WIFE</span> <span className={styles.codeId}>@I2@</span>
            </div>
          </div>
        </section>

        {/* ─── Rada'a ─── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>الرضاعة</h2>
          <p className={styles.desc}>
            في الشريعة الإسلامية، الرضاعة تُنشئ علاقة تترتب عليها
            أحكام شرعية كتحريم الزواج. هذه العلاقة غير موجودة في معيار GEDCOM
            لأنها مفهوم إسلامي خاص.
          </p>
          <div className={styles.note}>
            الرضاعة لا تُغيّر شجرة النسب ولا تُضيف أشخاصاً من خارجها.
            الهدف هو توثيق علاقة الرضاعة بين أفراد <strong>موجودين أصلاً</strong> في
            شجرة النسب، لما لها من أثر شرعي على الأجيال القادمة (كتحريم الزواج).
          </div>

          {/* _RADA_FAM */}
          <div className={styles.tagBlock}>
            <div className={styles.tagHeader}>
              <span className={`${styles.tagBadge} ${styles.tagBadgeCustom}`}>_RADA_FAM</span>
              <span className={styles.tagLabel}>امتداد</span>
              <span className={styles.tagName}>عائلة من الرضاعة</span>
            </div>
            <p className={styles.tagDesc}>
              سجل يُجمّع الأفراد الذين تربطهم علاقة رضاعة واحدة.
              يعمل بنفس منطق سجل العائلة (<span className={styles.inlineCode}>FAM</span>)
              في GEDCOM: من يشتركون في نفس{' '}
              <span className={styles.inlineCode}>_RADA_FAM</span> عبر{' '}
              <span className={styles.inlineCode}>_RADA_CHIL</span> هم إخوة من الرضاعة تلقائياً،
              والأم فيه (<span className={styles.inlineCode}>_RADA_WIFE</span>) هي أمهم من الرضاعة،
              وزوجها (<span className={styles.inlineCode}>_RADA_HUSB</span>) أبوهم من الرضاعة.
            </p>
            <p className={styles.tagDesc}>
              تُستخدم علامات مخصصة بالكامل (<span className={styles.inlineCode}>_RADA_WIFE</span> /{' '}
              <span className={styles.inlineCode}>_RADA_HUSB</span> /{' '}
              <span className={styles.inlineCode}>_RADA_CHIL</span>) بدلاً من العلامات
              القياسية (<span className={styles.inlineCode}>WIFE</span> /{' '}
              <span className={styles.inlineCode}>HUSB</span> /{' '}
              <span className={styles.inlineCode}>CHIL</span>) لمنع الخلط بين بيانات النسب
              وبيانات الرضاعة عند المعالجة البرمجية.
            </p>
            <p className={styles.tagDesc}>

              إذا كانت المرضعة أو زوجها موجودين في شجرة النسب، يُشار إليهما
              بـ <span className={styles.inlineCode}>_RADA_WIFE</span> و<span className={styles.inlineCode}>_RADA_HUSB</span>.
              وإذا لم يكونا من الشجرة، يُكتفى بذكر اسمهما اختيارياً
              في <span className={styles.inlineCode}>NOTE</span> دون إضافتهما كأفراد.
            </p>
            <div className={styles.codeBlock}>
              <span className={styles.codeComment}>{"// المرضعة وزوجها موجودان في شجرة النسب"}</span>{'\n'}
              <span className={styles.codeId}>0 @RF1@ _RADA_FAM</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_HUSB</span> <span className={styles.codeId}>@I9@</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_WIFE</span> <span className={styles.codeId}>@I10@</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_CHIL</span> <span className={styles.codeId}>@I3@</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_CHIL</span> <span className={styles.codeId}>@I7@</span>{'\n'}
              {'\n'}
              <span className={styles.codeComment}>{"// زوج المرضعة فقط في الشجرة (المرضعة ليست فيها)"}</span>{'\n'}
              <span className={styles.codeId}>0 @RF2@ _RADA_FAM</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_HUSB</span> <span className={styles.codeId}>@I15@</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_CHIL</span> <span className={styles.codeId}>@I5@</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_CHIL</span> <span className={styles.codeId}>@I12@</span>{'\n'}
              {'\n'}
              <span className={styles.codeComment}>{"// كلاهما ليسا من شجرة النسب"}</span>{'\n'}
              <span className={styles.codeId}>0 @RF3@ _RADA_FAM</span>{'\n'}
              <span className={styles.codeTag}>1 NOTE</span> <span className={styles.codeVal}>المرضعة: فاطمة بنت أحمد</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_CHIL</span> <span className={styles.codeId}>@I8@</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_CHIL</span> <span className={styles.codeId}>@I14@</span>
            </div>
          </div>

          {/* _RADA_FAMC */}
          <div className={styles.tagBlock}>
            <div className={styles.tagHeader}>
              <span className={`${styles.tagBadge} ${styles.tagBadgeCustom}`}>_RADA_FAMC</span>
              <span className={styles.tagLabel}>امتداد</span>
              <span className={styles.tagName}>الانتماء لعائلة من رضاعة</span>
            </div>
            <p className={styles.tagDesc}>
              يوضع على سجل الفرد للإشارة إلى عائلة الرضاعة التي ينتمي إليها.
              يعمل بنفس منطق <span className={styles.inlineCode}>FAMC</span>{' '}
              (الانتماء لعائلة كطفل) لكن لعلاقة الرضاعة.
            </p>
            <div className={styles.codeBlock}>
              <span className={styles.codeId}>0 @I3@ INDI</span>{'\n'}
              <span className={styles.codeTag}>1 NAME</span> <span className={styles.codeVal}>أحمد /بن سعيد/</span>{'\n'}
              <span className={styles.codeTag}>1 SEX</span> <span className={styles.codeVal}>M</span>{'\n'}
              <span className={styles.codeTag}>1 FAMC</span> <span className={styles.codeId}>@F2@</span>
              <span className={styles.codeComment}>{"          // عائلته في النسب"}</span>{'\n'}
              <span className={styles.codeCustomTag}>1 _RADA_FAMC</span> <span className={styles.codeId}>@RF1@</span>
              <span className={styles.codeComment}>{"   // عائلته من الرضاعة"}</span>
            </div>
            <div className={styles.note}>
              العلاقات تُشتق تلقائياً: كل من يشترك في نفس{' '}
              <span className={styles.inlineCode}>_RADA_FAM</span> هم إخوة من الرضاعة.
              أطفال المرضعة البيولوجيون (إن كانت في الشجرة) يُعتبرون إخوة من الرضاعة أيضاً.
            </div>
          </div>
        </section>

        {/* ─── Full Example ─── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>مثال كامل</h2>
          <p className={styles.desc}>
            عائلة مع عقد قران وحفل زفاف بتواريخ مختلفة، كل منهما بتاريخ هجري وميلادي.
          </p>
          <div className={styles.codeBlock}>
            <span className={styles.codeComment}>{"// ─── الزوج ───"}</span>{'\n'}
            <span className={styles.codeId}>0 @I1@ INDI</span>{'\n'}
            <span className={styles.codeTag}>1 NAME</span> <span className={styles.codeVal}>محمد /بن عبدالله/</span>{'\n'}
            <span className={styles.codeTag}>1 SEX</span> <span className={styles.codeVal}>M</span>{'\n'}
            <span className={styles.codeTag}>1 BIRT</span>{'\n'}
            <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>15 MAR 1995</span>{'\n'}
            <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 14 SHAWW 1415</span>{'\n'}
            <span className={styles.codeTag}>2 PLAC</span> <span className={styles.codeVal}>الرياض</span>{'\n'}
            <span className={styles.codeTag}>1 FAMS</span> <span className={styles.codeId}>@F1@</span>{'\n'}
            {'\n'}
            <span className={styles.codeComment}>{"// ─── الزوجة ───"}</span>{'\n'}
            <span className={styles.codeId}>0 @I2@ INDI</span>{'\n'}
            <span className={styles.codeTag}>1 NAME</span> <span className={styles.codeVal}>نورة /بنت سعد/</span>{'\n'}
            <span className={styles.codeTag}>1 SEX</span> <span className={styles.codeVal}>F</span>{'\n'}
            <span className={styles.codeTag}>1 BIRT</span>{'\n'}
            <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>22 SEP 1998</span>{'\n'}
            <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 1 JUMAT 1419</span>{'\n'}
            <span className={styles.codeTag}>1 FAMS</span> <span className={styles.codeId}>@F1@</span>{'\n'}
            {'\n'}
            <span className={styles.codeComment}>{"// ─── العائلة ───"}</span>{'\n'}
            <span className={styles.codeId}>0 @F1@ FAM</span>{'\n'}
            <span className={styles.codeTag}>1 HUSB</span> <span className={styles.codeId}>@I1@</span>{'\n'}
            <span className={styles.codeTag}>1 WIFE</span> <span className={styles.codeId}>@I2@</span>{'\n'}
            <span className={styles.codeTag}>1 MARC</span>{'\n'}
            <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>11 JUL 2022</span>{'\n'}
            <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 12 DHUAH 1443</span>{'\n'}
            <span className={styles.codeTag}>2 PLAC</span> <span className={styles.codeVal}>الرياض</span>{'\n'}
            <span className={styles.codeTag}>1 MARR</span>{'\n'}
            <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>27 APR 2023</span>{'\n'}
            <span className={styles.codeTag}>2 DATE</span> <span className={styles.codeVal}>@#DHIJRI@ 7 SHAWW 1444</span>{'\n'}
            <span className={styles.codeTag}>2 PLAC</span> <span className={styles.codeVal}>جدة</span>{'\n'}
            <span className={styles.codeTag}>1 CHIL</span> <span className={styles.codeId}>@I3@</span>
          </div>
        </section>

        {/* ─── Compatibility ─── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>التوافق</h2>
          <div className={styles.compatGrid}>
            <div className={styles.compatItem}>
              <span className={styles.compatVersion}>GEDCOM 5.5.1</span>
              <p className={styles.compatDesc}>
                العلامات القياسية (<span className={styles.inlineCode}>MARC</span>,{' '}
                <span className={styles.inlineCode}>MARR</span>,{' '}
                <span className={styles.inlineCode}>DIV</span>) مدعومة بالكامل.
                التاريخ الهجري يُسجّل عبر معرّف التقويم{' '}
                <span className={styles.inlineCode}>@#DHIJRI@</span>.{' '}
                العلامات المخصصة (<span className={styles.inlineCode}>_RADA_FAM</span>,{' '}
                <span className={styles.inlineCode}>_RADA_FAMC</span>,{' '}
                <span className={styles.inlineCode}>_RADA_HUSB</span>,{' '}
                <span className={styles.inlineCode}>_RADA_WIFE</span>,{' '}
                <span className={styles.inlineCode}>_RADA_CHIL</span>,{' '}
                <span className={styles.inlineCode}>_UMM_WALAD</span>) تتبع
                اتفاقية الشرطة السفلية المعتمدة.
              </p>
            </div>
            <div className={styles.compatItem}>
              <span className={styles.compatVersion}>GEDCOM 7.0</span>
              <p className={styles.compatDesc}>
                متوافق بالكامل. GEDCOM 7 يوفر آلية رسمية لتسجيل الامتدادات
                المخصصة عبر{' '}
                <span className={styles.inlineCode}>GEDCOM-registries</span>.
              </p>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <p className={styles.lastUpdated}>
            آخر تحديث: مارس ٢٠٢٦ &middot; الإصدار ٠.١
          </p>
          <p className={styles.footerNote}>
            هذا المرجع مفتوح للمجتمع. إذا كنت مهتماً بتوحيد توثيق الأنساب الإسلامية،
            تواصل معنا.
          </p>
        </footer>
      </div>
    </div>
  );
}
