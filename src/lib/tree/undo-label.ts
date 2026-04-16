/**
 * Session Undo (Phase 15a) — UI label builder.
 *
 * PII: Labels may contain decrypted person names. They are safe in JSX text
 * nodes only. NEVER include a label (or its `name` input) in Error.message,
 * console.*, analytics events, or any telemetry payload.
 */

export const MAX_LABEL_LENGTH = 40;
const ELLIPSIS = '…';

export type UndoAction =
  | { kind: 'createIndividual'; name?: string }
  | { kind: 'updateIndividual'; name?: string }
  | { kind: 'deleteIndividual'; name?: string }
  | { kind: 'createFamily' }
  | { kind: 'updateFamily' }
  | { kind: 'deleteFamily' }
  | { kind: 'addChild'; name?: string }
  | { kind: 'removeChild'; name?: string }
  | { kind: 'moveChild'; name?: string }
  | { kind: 'editMarriageEvent'; eventType?: 'MARC' | 'MARR' | 'DIV' }
  | { kind: 'addSpouse'; sex?: 'M' | 'F'; name?: string }
  | { kind: 'linkExistingSpouse'; sex?: 'M' | 'F'; name?: string }
  | { kind: 'unlinkSpouse'; sex?: 'M' | 'F' }
  | { kind: 'addParent'; sex?: 'M' | 'F'; name?: string }
  | { kind: 'createRadaFamily' }
  | { kind: 'updateRadaFamily' }
  | { kind: 'deleteRadaFamily' }
  | { kind: 'addRadaChild'; name?: string }
  | { kind: 'removeRadaChild'; name?: string };

function withName(bareLabel: string, prefixWithName: string, name?: string): string {
  if (!name) return bareLabel;
  return `${prefixWithName}: ${name}`;
}

function truncate(label: string): string {
  const chars = Array.from(label);
  if (chars.length <= MAX_LABEL_LENGTH) return label;
  return chars.slice(0, MAX_LABEL_LENGTH - 1).join('') + ELLIPSIS;
}

export function buildUndoLabel(action: UndoAction): string {
  const raw = renderLabel(action);
  return truncate(raw);
}

function renderLabel(action: UndoAction): string {
  switch (action.kind) {
    case 'createIndividual':
      return withName('إضافة شخص', 'إضافة شخص', action.name);
    case 'updateIndividual':
      return withName('تعديل شخص', 'تعديل', action.name);
    case 'deleteIndividual':
      return withName('حذف شخص', 'حذف', action.name);

    case 'createFamily':
      return 'إنشاء أسرة';
    case 'updateFamily':
      return 'تعديل أسرة';
    case 'deleteFamily':
      return 'حذف أسرة';

    case 'addChild':
      return withName('إضافة ابن', 'إضافة ابن', action.name);
    case 'removeChild':
      return withName('إزالة ابن', 'إزالة ابن', action.name);
    case 'moveChild':
      return withName('نقل ابن', 'نقل ابن', action.name);

    case 'editMarriageEvent':
      if (action.eventType === 'MARC') return 'تعديل عقد زواج';
      if (action.eventType === 'MARR') return 'تعديل زواج';
      if (action.eventType === 'DIV') return 'تعديل طلاق';
      return 'تعديل حدث زواج';

    case 'addSpouse': {
      const base = action.sex === 'F' ? 'إضافة زوجة' : 'إضافة زوج';
      return withName(base, base, action.name);
    }
    case 'linkExistingSpouse': {
      const base = action.sex === 'F' ? 'ربط زوجة' : 'ربط زوج';
      return withName(base, base, action.name);
    }
    case 'unlinkSpouse':
      return action.sex === 'F' ? 'فصل الزوجة' : 'فصل الزوج';
    case 'addParent': {
      const base = action.sex === 'F' ? 'إضافة والدة' : 'إضافة والد';
      return withName(base, base, action.name);
    }

    case 'createRadaFamily':
      return 'إضافة أسرة رضاعة';
    case 'updateRadaFamily':
      return 'تعديل أسرة رضاعة';
    case 'deleteRadaFamily':
      return 'حذف أسرة رضاعة';
    case 'addRadaChild':
      return withName('إضافة ابن رضاعة', 'إضافة ابن رضاعة', action.name);
    case 'removeRadaChild':
      return withName('إزالة ابن رضاعة', 'إزالة ابن رضاعة', action.name);
  }
}
