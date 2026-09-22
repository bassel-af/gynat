/**
 * «قفزة نسب» — audit trail.
 *
 * `snapshotAncestryJump` is the before/after envelope the three routes store on
 * `TreeEditLog`. The Arabic descriptions need NO new `action` case — the shared
 * create/update/delete cases compose with the new entity label, and the undo
 * prefix «تراجع عن: » composes on top of that.
 */
import { describe, test, expect } from 'vitest';
import {
  snapshotAncestryJump,
  buildAuditDescription,
  encryptAuditDescription,
  decryptAuditDescription,
} from '@/lib/tree/audit';
import { AUDIT_ENTITY_TYPES } from '@/lib/tree/audit-log-schemas';

const KEY = Buffer.alloc(32, 9);

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

describe('snapshotAncestryJump', () => {
  test('captures every field the undo/diff surfaces need', () => {
    expect(
      snapshotAncestryJump({
        id: 'J1',
        descendantId: 'ADNAN',
        ancestorFamilyId: 'FAM-ISH',
        generationsMin: 4,
        generationsMax: 40,
        notes: 'عدنان من وَلَد إسماعيل',
      }),
    ).toEqual({
      id: 'J1',
      descendantId: 'ADNAN',
      ancestorFamilyId: 'FAM-ISH',
      generationsMin: 4,
      generationsMax: 40,
      notes: 'عدنان من وَلَد إسماعيل',
    });
  });

  test('normalizes absent optional fields to null', () => {
    expect(
      snapshotAncestryJump({
        id: 'J1',
        descendantId: 'ADNAN',
        ancestorFamilyId: 'FAM-ISH',
      }),
    ).toEqual({
      id: 'J1',
      descendantId: 'ADNAN',
      ancestorFamilyId: 'FAM-ISH',
      generationsMin: null,
      generationsMax: null,
      notes: null,
    });
  });

  test('is JSON-serializable (it lands in a Prisma Json column)', () => {
    const snap = snapshotAncestryJump({
      id: 'J1',
      descendantId: 'ADNAN',
      ancestorFamilyId: 'FAM-ISH',
      generationsMin: 4,
    });
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

// ---------------------------------------------------------------------------
// Arabic descriptions
// ---------------------------------------------------------------------------

describe('buildAuditDescription — ancestry_jump', () => {
  test('create', () => {
    expect(buildAuditDescription('create', 'ancestry_jump')).toBe('إضافة قفزة نسب');
  });

  test('update', () => {
    expect(buildAuditDescription('update', 'ancestry_jump')).toBe('تعديل قفزة نسب');
  });

  test('delete', () => {
    expect(buildAuditDescription('delete', 'ancestry_jump')).toBe('حذف قفزة نسب');
  });

  test('undo prefixes the create description', () => {
    expect(buildAuditDescription('create', 'ancestry_jump', undefined, { isUndo: true })).toBe(
      'تراجع عن: إضافة قفزة نسب',
    );
  });

  test('undo prefixes the delete description', () => {
    expect(buildAuditDescription('delete', 'ancestry_jump', undefined, { isUndo: true })).toBe(
      'تراجع عن: حذف قفزة نسب',
    );
  });

  test('the raw entity type never leaks into the description', () => {
    expect(buildAuditDescription('create', 'ancestry_jump')).not.toContain('ancestry_jump');
  });
});

// ---------------------------------------------------------------------------
// Encryption round-trip (the routes only ever store ciphertext)
// ---------------------------------------------------------------------------

describe('encryptAuditDescription — ancestry_jump', () => {
  test('round-trips the Arabic description', () => {
    const encrypted = encryptAuditDescription('create', 'ancestry_jump', null, KEY);
    expect(Buffer.isBuffer(encrypted)).toBe(true);
    expect(decryptAuditDescription(encrypted, KEY)).toBe('إضافة قفزة نسب');
  });

  test('round-trips the undo variant', () => {
    const encrypted = encryptAuditDescription('delete', 'ancestry_jump', null, KEY, {
      isUndo: true,
    });
    expect(decryptAuditDescription(encrypted, KEY)).toBe('تراجع عن: حذف قفزة نسب');
  });
});

// ---------------------------------------------------------------------------
// Filter enum — the audit log page must be able to filter on the new type.
// ---------------------------------------------------------------------------

describe('AUDIT_ENTITY_TYPES', () => {
  test('includes ancestry_jump', () => {
    expect(AUDIT_ENTITY_TYPES).toContain('ancestry_jump');
  });
});
