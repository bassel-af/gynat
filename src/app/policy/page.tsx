import type { Metadata } from 'next';
import styles from './policy.module.css';

export const metadata: Metadata = {
  title: 'السياسات والشروط | Policies',
  description: 'سياسة الاستخدام والخصوصية لمنصة جينات',
};

export default function PolicyPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.pageTitle}>السياسات والشروط</h1>
        <p className={styles.pageSubtitle}>Policies &amp; Terms</p>

        {/* Terms of Service */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>سياسة الاستخدام / Terms of Service</h2>

          <div className={styles.arabicBlock}>
            <p>
              منصة جينات هي منصة للعائلات لتوثيق الأنساب والتواصل بين أفراد
              العائلة. التسجيل مفتوح للجميع، ويمكن لأي مستخدم إنشاء مساحة
              عائلية ودعوة أقاربه إليها. باستخدامك للمنصة، فإنك توافق على
              الشروط التالية:
            </p>
            <p>
              الوصول إلى كل مساحة عائلية يقتصر على الأعضاء المدعوين إليها من
              قِبَل مدير المساحة. يُمنع مشاركة بيانات الدخول مع أشخاص غير مصرح
              لهم.
            </p>
            <p>
              أنت مسؤول عن دقة المعلومات التي تضيفها إلى شجرة العائلة والمحتوى
              الذي تنشره على المنصة.
            </p>
            <p>
              يحق لمديري المساحات إدارة الأعضاء والمحتوى وفقاً لصلاحياتهم.
              يُحتفظ بسجل تعديلات لجميع التغييرات على شجرة العائلة.
            </p>
            <p>
              نحتفظ بالحق في تعليق أو إنهاء الحسابات التي تنتهك هذه الشروط أو
              تُسيء استخدام المنصة.
            </p>
          </div>

          <div className={styles.englishBlock}>
            <p className={styles.englishLabel}>English</p>
            <p>
              Gynat is a family collaboration platform for documenting
              genealogy and connecting family members. Sign-up is open to
              anyone, and any registered user can create a family workspace and
              invite their relatives. By using the platform, you agree to the
              following terms:
            </p>
            <p>
              Access to each family workspace is limited to members invited by
              a workspace administrator. Sharing login credentials with
              unauthorized individuals is prohibited.
            </p>
            <p>
              You are responsible for the accuracy of information you add to the
              family tree and content you publish on the platform.
            </p>
            <p>
              Workspace administrators may manage members and content according
              to their permissions. An edit log is maintained for all family tree
              changes.
            </p>
            <p>
              We reserve the right to suspend or terminate accounts that violate
              these terms or misuse the platform.
            </p>
          </div>
        </section>

        {/* Privacy Policy */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>سياسة الخصوصية / Privacy Policy</h2>

          <div className={styles.arabicBlock}>
            <p>
              نحن نأخذ خصوصية بياناتك على محمل الجد. جميع البيانات المخزنة على
              المنصة تبقى على خوادمنا الخاصة ولا تُشارك مع أي طرف ثالث.
            </p>
            <p>
              نجمع فقط المعلومات الضرورية لتشغيل المنصة: البريد الإلكتروني،
              الاسم، وبيانات شجرة العائلة التي تضيفها.
            </p>
            <p>
              لا نستخدم أي أدوات تتبع أو تحليلات من طرف ثالث. لا نبيع أو نشارك
              بياناتك مع أي جهة خارجية تحت أي ظرف.
            </p>
            <p>
              يمكنك طلب حذف حسابك وجميع بياناتك المرتبطة به في أي وقت عن طريق
              التواصل مع مدير المنصة.
            </p>
            <p>
              بيانات شجرة عائلتك مشفّرة بالكامل على خوادمنا بمفتاح خاص بكل
              عائلة. الأسماء، التواريخ، الأحداث، وسجل التعديلات جميعها محمية
              بتشفير من المستوى المصرفي. يتم تأمين الاتصال عبر بروتوكول HTTPS.
            </p>
          </div>

          <div className={styles.englishBlock}>
            <p className={styles.englishLabel}>English</p>
            <p>
              We take your data privacy seriously. All data stored on the
              platform remains on our own servers and is never shared with any
              third party.
            </p>
            <p>
              We only collect information necessary to operate the platform:
              email address, display name, and family tree data you provide.
            </p>
            <p>
              We do not use any third-party tracking or analytics tools. We never
              sell or share your data with any external party under any
              circumstances.
            </p>
            <p>
              You may request deletion of your account and all associated data
              at any time by contacting the platform administrator.
            </p>
            <p>
              Your family tree data is fully encrypted on our servers with a
              dedicated key per family workspace. Names, dates, events, and the
              edit history are all protected with bank-grade encryption.
              Communication is secured via HTTPS.
            </p>
          </div>
        </section>

        {/* Storage & Billing Policy */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            سياسة التخزين والفوترة / Storage &amp; Billing Policy
          </h2>

          <div className={styles.arabicBlock}>
            <p>
              المنصة مجانية الاستخدام حالياً لجميع أفراد العائلة المدعوين.
            </p>
            <p>
              تحصل كل مساحة عمل على حصة تخزين قدرها 5 جيجابايت تشمل الصور
              والوسائط المرفوعة. يمكن لمديري المساحات متابعة استهلاك التخزين من
              لوحة الإدارة.
            </p>
            <p>
              نحتفظ بالحق في تعديل سياسة التسعير أو حصص التخزين مستقبلاً. في
              حال إجراء أي تغييرات، سيتم إخطار جميع المستخدمين قبل 30 يوماً على
              الأقل من تاريخ التطبيق.
            </p>
            <p>
              في حال تجاوز حصة التخزين، لن يتم حذف أي بيانات موجودة، لكن لن
              يكون بالإمكان رفع ملفات جديدة حتى يتم تحرير مساحة كافية.
            </p>
          </div>

          <div className={styles.englishBlock}>
            <p className={styles.englishLabel}>English</p>
            <p>
              The platform is currently free to use for all invited family
              members.
            </p>
            <p>
              Each workspace receives a 5GB storage quota for uploaded photos and
              media. Workspace administrators can monitor storage usage from the
              admin panel.
            </p>
            <p>
              We reserve the right to modify pricing or storage quotas in the
              future. Any changes will be communicated to all users at least 30
              days before taking effect.
            </p>
            <p>
              If the storage quota is exceeded, no existing data will be deleted,
              but new file uploads will be blocked until sufficient space is
              freed.
            </p>
          </div>
        </section>

        {/* Disclaimer */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            إخلاء المسؤولية / Disclaimer
          </h2>

          <div className={styles.arabicBlock}>
            <p>
              تُقدَّم المنصة &laquo;كما هي&raquo; و&laquo;حسب التوفر&raquo; دون
              أي ضمانات من أي نوع، سواء كانت صريحة أو ضمنية.
            </p>
            <p>
              لا نضمن أن المنصة ستكون خالية من الأخطاء أو الأعطال أو الانقطاعات،
              ولا نضمن توفر جميع الميزات التي قد يرغب بها المستخدم.
            </p>
            <p>
              باستخدامك للمنصة، فإنك تقبل أنها قد تحتوي على مشكلات تقنية أو
              ميزات غير مكتملة، وأنك تستخدمها على مسؤوليتك الخاصة.
            </p>
            <p>
              لا نتحمل أي مسؤولية عن أي أضرار مباشرة أو غير مباشرة ناتجة عن
              استخدام المنصة أو عدم القدرة على استخدامها.
            </p>
          </div>

          <div className={styles.englishBlock}>
            <p className={styles.englishLabel}>English</p>
            <p>
              The platform is provided &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo; without warranties of any kind, whether express or
              implied.
            </p>
            <p>
              We do not guarantee that the platform will be free from errors,
              defects, or interruptions, nor do we guarantee the availability of
              any particular feature the user may desire.
            </p>
            <p>
              By using the platform, you accept that it may contain technical
              issues or incomplete features, and that you use it at your own
              risk.
            </p>
            <p>
              We shall not be liable for any direct or indirect damages arising
              from the use of, or inability to use, the platform.
            </p>
          </div>
        </section>

        <p className={styles.lastUpdated}>
          آخر تحديث: أبريل 2026 &mdash; Last updated: April 2026
        </p>
      </div>
    </div>
  );
}
