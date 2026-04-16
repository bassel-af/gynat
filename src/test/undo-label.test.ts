import { describe, it, expect } from 'vitest';
import { buildUndoLabel, MAX_LABEL_LENGTH } from '@/lib/tree/undo-label';

describe('buildUndoLabel', () => {
  describe('individual mutations', () => {
    it('creates individual with name', () => {
      expect(buildUndoLabel({ kind: 'createIndividual', name: 'أحمد' })).toBe('إضافة شخص: أحمد');
    });

    it('updates individual with name', () => {
      expect(buildUndoLabel({ kind: 'updateIndividual', name: 'أحمد' })).toBe('تعديل: أحمد');
    });

    it('deletes individual with name', () => {
      expect(buildUndoLabel({ kind: 'deleteIndividual', name: 'أحمد' })).toBe('حذف: أحمد');
    });

    it('falls back to bare label when name is missing', () => {
      expect(buildUndoLabel({ kind: 'createIndividual' })).toBe('إضافة شخص');
      expect(buildUndoLabel({ kind: 'updateIndividual' })).toBe('تعديل شخص');
      expect(buildUndoLabel({ kind: 'deleteIndividual' })).toBe('حذف شخص');
    });
  });

  describe('family mutations', () => {
    it('creates family', () => {
      expect(buildUndoLabel({ kind: 'createFamily' })).toBe('إنشاء أسرة');
    });

    it('updates family', () => {
      expect(buildUndoLabel({ kind: 'updateFamily' })).toBe('تعديل أسرة');
    });

    it('deletes family', () => {
      expect(buildUndoLabel({ kind: 'deleteFamily' })).toBe('حذف أسرة');
    });
  });

  describe('family child ops', () => {
    it('adds child', () => {
      expect(buildUndoLabel({ kind: 'addChild', name: 'يوسف' })).toBe('إضافة ابن: يوسف');
    });

    it('removes child', () => {
      expect(buildUndoLabel({ kind: 'removeChild', name: 'يوسف' })).toBe('إزالة ابن: يوسف');
    });

    it('moves child', () => {
      expect(buildUndoLabel({ kind: 'moveChild', name: 'يوسف' })).toBe('نقل ابن: يوسف');
    });
  });

  describe('marriage events', () => {
    it('edits MARC (contract)', () => {
      expect(buildUndoLabel({ kind: 'editMarriageEvent', eventType: 'MARC' })).toBe('تعديل عقد زواج');
    });

    it('edits MARR (marriage)', () => {
      expect(buildUndoLabel({ kind: 'editMarriageEvent', eventType: 'MARR' })).toBe('تعديل زواج');
    });

    it('edits DIV (divorce)', () => {
      expect(buildUndoLabel({ kind: 'editMarriageEvent', eventType: 'DIV' })).toBe('تعديل طلاق');
    });

    it('generic fallback when type unknown', () => {
      expect(buildUndoLabel({ kind: 'editMarriageEvent' })).toBe('تعديل حدث زواج');
    });
  });

  describe('spouse/parent relationship ops (gendered)', () => {
    it('adds male spouse', () => {
      expect(buildUndoLabel({ kind: 'addSpouse', sex: 'M', name: 'خالد' })).toBe('إضافة زوج: خالد');
    });

    it('adds female spouse', () => {
      expect(buildUndoLabel({ kind: 'addSpouse', sex: 'F', name: 'سارة' })).toBe('إضافة زوجة: سارة');
    });

    it('links male existing spouse', () => {
      expect(buildUndoLabel({ kind: 'linkExistingSpouse', sex: 'M', name: 'خالد' })).toBe('ربط زوج: خالد');
    });

    it('links female existing spouse', () => {
      expect(buildUndoLabel({ kind: 'linkExistingSpouse', sex: 'F', name: 'سارة' })).toBe('ربط زوجة: سارة');
    });

    it('unlinks male spouse', () => {
      expect(buildUndoLabel({ kind: 'unlinkSpouse', sex: 'M' })).toBe('فصل الزوج');
    });

    it('unlinks female spouse', () => {
      expect(buildUndoLabel({ kind: 'unlinkSpouse', sex: 'F' })).toBe('فصل الزوجة');
    });

    it('adds male parent', () => {
      expect(buildUndoLabel({ kind: 'addParent', sex: 'M', name: 'محمد' })).toBe('إضافة والد: محمد');
    });

    it('adds female parent', () => {
      expect(buildUndoLabel({ kind: 'addParent', sex: 'F', name: 'فاطمة' })).toBe('إضافة والدة: فاطمة');
    });
  });

  describe("rada'a (foster nursing)", () => {
    it('creates rada family', () => {
      expect(buildUndoLabel({ kind: 'createRadaFamily' })).toBe('إضافة أسرة رضاعة');
    });

    it('updates rada family', () => {
      expect(buildUndoLabel({ kind: 'updateRadaFamily' })).toBe('تعديل أسرة رضاعة');
    });

    it('deletes rada family', () => {
      expect(buildUndoLabel({ kind: 'deleteRadaFamily' })).toBe('حذف أسرة رضاعة');
    });

    it('adds rada child', () => {
      expect(buildUndoLabel({ kind: 'addRadaChild', name: 'يوسف' })).toBe('إضافة ابن رضاعة: يوسف');
    });

    it('removes rada child', () => {
      expect(buildUndoLabel({ kind: 'removeRadaChild', name: 'يوسف' })).toBe('إزالة ابن رضاعة: يوسف');
    });
  });

  describe('truncation', () => {
    it('MAX_LABEL_LENGTH is 40', () => {
      expect(MAX_LABEL_LENGTH).toBe(40);
    });

    it('truncates names longer than max with ellipsis', () => {
      const longName = 'ا'.repeat(100);
      const label = buildUndoLabel({ kind: 'updateIndividual', name: longName });
      expect(Array.from(label).length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
      expect(label.endsWith('…')).toBe(true);
    });

    it('leaves short labels untouched', () => {
      const label = buildUndoLabel({ kind: 'updateIndividual', name: 'أحمد' });
      expect(label).toBe('تعديل: أحمد');
      expect(label.includes('…')).toBe(false);
    });
  });
});
