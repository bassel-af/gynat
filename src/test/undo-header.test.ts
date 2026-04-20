import { describe, it, expect } from 'vitest';
import { isUndoRequest } from '@/lib/api/undo-header';
import { buildAuditDescription } from '@/lib/tree/audit';

describe('isUndoRequest', () => {
  it('returns true when X-Gynat-Undo header is "true"', () => {
    const req = new Request('http://x/', { headers: { 'X-Gynat-Undo': 'true' } });
    expect(isUndoRequest(req)).toBe(true);
  });

  it('returns false when header is absent', () => {
    const req = new Request('http://x/');
    expect(isUndoRequest(req)).toBe(false);
  });

  it('returns false when header is set to other values', () => {
    const req = new Request('http://x/', { headers: { 'X-Gynat-Undo': 'false' } });
    expect(isUndoRequest(req)).toBe(false);
    const req2 = new Request('http://x/', { headers: { 'X-Gynat-Undo': '1' } });
    expect(isUndoRequest(req2)).toBe(false);
  });
});

describe('buildAuditDescription — undo prefix', () => {
  it('prefixes "تراجع عن: " when isUndo is true', () => {
    expect(buildAuditDescription('update', 'individual', 'أحمد', { isUndo: true }))
      .toBe('تراجع عن: تعديل شخص "أحمد"');
  });

  it('does NOT prefix when isUndo is false or omitted', () => {
    expect(buildAuditDescription('update', 'individual', 'أحمد'))
      .toBe('تعديل شخص "أحمد"');
    expect(buildAuditDescription('update', 'individual', 'أحمد', { isUndo: false }))
      .toBe('تعديل شخص "أحمد"');
  });

  it('prefix works for create action too', () => {
    expect(buildAuditDescription('create', 'family', undefined, { isUndo: true }))
      .toBe('تراجع عن: إضافة عائلة');
  });
});
