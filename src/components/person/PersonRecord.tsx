'use client';

import { FigureCluster } from '@/components/heritage/FigureCluster';
import type { PersonSubject } from '@/lib/tree/person-projection';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import { subjectBirth, subjectDeath } from './yearFormat';
import styles from './person.module.css';

/**
 * السجل — the factual record. Birth (place + dates), optional death (ONLY for the
 * deceased — never show الوفاة with a dash for a living person), kunya, house,
 * and الملاحظات taken from the person's notes.
 *
 * Dates honor the user's calendar preference (formatted client-side from the
 * raw hijri/gregorian strings the projection provides).
 *
 * There is NO biography field here — سيرة مختصرة is a separate deferred chunk
 * (needs a new data-model field + GEDCOM _BIO tag).
 */
export function PersonRecord({ subject }: { subject: PersonSubject }) {
  const { preference } = useCalendarPreference();

  const birthDates = subjectBirth(subject, preference);
  const deathDates = subjectDeath(subject, preference);

  return (
    <section className={styles.record}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>السجل</h2>
        <p className={styles.sectionHint}>المولد، والمكان، والملاحظات.</p>
      </div>

      <div className={styles.recordGrid}>
        {(subject.birthPlace || birthDates) && (
          <div className={styles.recordField}>
            <div className={styles.recordLabel}>الميلاد</div>
            {subject.birthPlace && <div className={styles.recordValue}>{subject.birthPlace}</div>}
            {birthDates && <div className={styles.recordHint}>{birthDates}</div>}
          </div>
        )}

        {/* Death field ONLY for the deceased — never show الوفاة for a living
            person (the "على قيد الحياة" tag already says so, and a dash here
            reads as "this person is dead" at a glance). */}
        {!subject.living && (subject.deathPlace || deathDates) && (
          <div className={styles.recordField}>
            <div className={styles.recordLabel}>الوفاة</div>
            {subject.deathPlace && <div className={styles.recordValue}>{subject.deathPlace}</div>}
            {deathDates && <div className={styles.recordHint}>{deathDates}</div>}
          </div>
        )}

        {subject.kunya && (
          <div className={styles.recordField}>
            <div className={styles.recordLabel}>الكنية</div>
            <div className={styles.recordValue}>{subject.kunya}</div>
          </div>
        )}

        {subject.surname && (
          <div className={styles.recordField}>
            <div className={styles.recordLabel}>البيت</div>
            <div className={styles.recordValue}>{subject.surname}</div>
          </div>
        )}

        {subject.notes && (
          <div className={`${styles.recordField} ${styles.recordFieldWide}`}>
            <div className={styles.recordLabel}>ملاحظات</div>
            <p className={styles.recordBio}>{subject.notes}</p>
          </div>
        )}
      </div>

      <div className={styles.recordOrnament} aria-hidden>
        <FigureCluster variant="trio" />
      </div>
    </section>
  );
}
