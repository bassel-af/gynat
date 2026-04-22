'use client';

import styles from './AuditLog.module.css';

const FIELD_LABELS: Record<string, string> = {
  givenName: 'الاسم',
  surname: 'اسم العائلة',
  fullName: 'الاسم الكامل',
  sex: 'الجنس',
  birthDate: 'تاريخ الميلاد',
  birthPlace: 'مكان الميلاد',
  birthHijriDate: 'تاريخ الميلاد الهجري',
  birthDescription: 'وصف الميلاد',
  birthNotes: 'ملاحظات الميلاد',
  deathDate: 'تاريخ الوفاة',
  deathPlace: 'مكان الوفاة',
  deathHijriDate: 'تاريخ الوفاة الهجري',
  deathDescription: 'وصف الوفاة',
  deathNotes: 'ملاحظات الوفاة',
  kunya: 'الكنية',
  notes: 'ملاحظات',
  isDeceased: 'متوفى',
  isPrivate: 'خاص',
  husbandId: 'الزوج',
  wifeId: 'الزوجة',
  childrenIds: 'الأبناء',
  marriageContractDate: 'تاريخ عقد القران',
  marriageContractHijriDate: 'تاريخ عقد القران الهجري',
  marriageContractPlace: 'مكان عقد القران',
  marriageContractDescription: 'وصف عقد القران',
  marriageContractNotes: 'ملاحظات عقد القران',
  marriageDate: 'تاريخ الزفاف',
  marriageHijriDate: 'تاريخ الزفاف الهجري',
  marriagePlace: 'مكان الزفاف',
  marriageDescription: 'وصف الزفاف',
  marriageNotes: 'ملاحظات الزفاف',
  divorceDate: 'تاريخ الطلاق',
  divorceHijriDate: 'تاريخ الطلاق الهجري',
  divorcePlace: 'مكان الطلاق',
  divorceDescription: 'وصف الطلاق',
  divorceNotes: 'ملاحظات الطلاق',
  isDivorced: 'مطلقة',
  isUmmWalad: 'أم ولد',
  fosterFatherId: 'زوج المرضعة',
  fosterMotherId: 'المرضعة',
};

const SEX_LABELS: Record<string, string> = {
  M: 'ذكر',
  F: 'أنثى',
  U: 'غير محدد',
};

// Fields that are internal IDs — not useful to display raw values
const ID_FIELDS = new Set([
  'id', 'birthPlaceId', 'deathPlaceId',
  'marriageContractPlaceId', 'marriagePlaceId', 'divorcePlaceId',
  'sourceWorkspaceId', 'rootIndividualId', 'selectedIndividualId',
  'targetWorkspaceId', 'anchorIndividualId', 'shareTokenId',
  'husbandId', 'wifeId', 'fosterFatherId', 'fosterMotherId',
  'childrenIds', 'familyId', 'individualId', 'radaFamilyId',
]);

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (key === 'sex' && typeof value === 'string') return SEX_LABELS[value] ?? value;
  if (Array.isArray(value)) return value.length === 0 ? '—' : `${value.length} عنصر`;
  return String(value);
}

interface AuditLogDiffProps {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function AuditLogDiff({ before, after }: AuditLogDiffProps) {
  if (!before && !after) {
    return (
      <p className={styles.diffEmpty}>لا تتوفر تفاصيل التغييرات</p>
    );
  }

  // Collect all keys from both snapshots
  const allKeys = new Set<string>();
  if (before) Object.keys(before).forEach(k => allKeys.add(k));
  if (after) Object.keys(after).forEach(k => allKeys.add(k));

  // Filter out ID fields and unchanged values
  const changes: { key: string; label: string; oldVal: string; newVal: string; type: 'added' | 'removed' | 'changed' }[] = [];

  for (const key of allKeys) {
    if (ID_FIELDS.has(key)) continue;

    const oldRaw = before?.[key] ?? null;
    const newRaw = after?.[key] ?? null;

    // Skip if both are null/undefined
    if (oldRaw === null && newRaw === null) continue;
    if (oldRaw === undefined && newRaw === undefined) continue;

    // Deep equality for arrays
    const oldStr = JSON.stringify(oldRaw);
    const newStr = JSON.stringify(newRaw);
    if (oldStr === newStr) continue;

    const label = FIELD_LABELS[key] ?? key;
    const oldVal = formatValue(key, oldRaw);
    const newVal = formatValue(key, newRaw);

    if (!before || (oldRaw === null && newRaw !== null)) {
      changes.push({ key, label, oldVal, newVal, type: 'added' });
    } else if (!after || (newRaw === null && oldRaw !== null)) {
      changes.push({ key, label, oldVal, newVal, type: 'removed' });
    } else {
      changes.push({ key, label, oldVal, newVal, type: 'changed' });
    }
  }

  if (changes.length === 0) {
    return (
      <p className={styles.diffEmpty}>لا توجد تغييرات مرئية</p>
    );
  }

  return (
    <div className={styles.diffTable}>
      {changes.map(({ key, label, oldVal, newVal, type }) => (
        <div key={key} className={styles.diffRow}>
          <span className={styles.diffLabel}>{label}</span>
          <div className={styles.diffValues}>
            {type === 'added' ? (
              <span className={styles.diffAdded}>{newVal}</span>
            ) : type === 'removed' ? (
              <span className={styles.diffRemoved}>{oldVal}</span>
            ) : (
              <>
                <span className={styles.diffRemoved}>{oldVal}</span>
                <svg className={styles.diffArrow} width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className={styles.diffAdded}>{newVal}</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
