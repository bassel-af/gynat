/**
 * Sources («المصادر») step 4 — request schemas, the response DTO and the audit
 * wiring. What can break: the text bounds, the admin-only level default, the
 * bulk caps, a DTO that leaks a `Bytes` column, and an audit entity type the
 * audit-log filter rejects.
 */
import { describe, test, expect } from 'vitest';
import {
  createSourceEntrySchema,
  updateSourceEntrySchema,
  putTreeEntrySchema,
  bulkSourceEntriesSchema,
  listSourceEntriesQuerySchema,
  MAX_BULK_IDS,
  MAX_SOURCE_TEXT,
} from '@/lib/tree/source-entry-schemas';
import { sourceEntryDto } from '@/lib/tree/source-entry-route-helpers';
import { snapshotSourceEntry, buildAuditDescription } from '@/lib/tree/audit';
import { AUDIT_ENTITY_TYPES, auditLogQuerySchema } from '@/lib/tree/audit-log-schemas';

const UUID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('createSourceEntrySchema', () => {
  test('trims the text', () => {
    const r = createSourceEntrySchema.parse({ text: '  طبقات ابن سعد  ' });
    expect(r.text).toBe('طبقات ابن سعد');
  });

  test('rejects whitespace-only text', () => {
    expect(createSourceEntrySchema.safeParse({ text: '   ' }).success).toBe(false);
  });

  test('rejects text longer than the cap', () => {
    const r = createSourceEntrySchema.safeParse({ text: 'ا'.repeat(MAX_SOURCE_TEXT + 1) });
    expect(r.success).toBe(false);
  });

  test('accepts text exactly at the cap', () => {
    const r = createSourceEntrySchema.safeParse({ text: 'ا'.repeat(MAX_SOURCE_TEXT) });
    expect(r.success).toBe(true);
  });

  test('rejects an unknown visibility level', () => {
    expect(createSourceEntrySchema.safeParse({ text: 'x', visibility: 'everyone' }).success).toBe(false);
  });

  test('rejects a non-uuid treeId', () => {
    expect(createSourceEntrySchema.safeParse({ text: 'x', treeId: 'nope' }).success).toBe(false);
  });
});

describe('updateSourceEntrySchema', () => {
  test('rejects an empty patch', () => {
    expect(updateSourceEntrySchema.safeParse({}).success).toBe(false);
  });

  test('accepts a visibility-only patch', () => {
    expect(updateSourceEntrySchema.safeParse({ visibility: 'members' }).success).toBe(true);
  });
});

describe('putTreeEntrySchema', () => {
  test('requires the visibility level', () => {
    expect(putTreeEntrySchema.safeParse({ text: 'x' }).success).toBe(false);
  });
});

describe('bulkSourceEntriesSchema', () => {
  test('rejects more than the id cap', () => {
    const ids = Array.from({ length: MAX_BULK_IDS + 1 }, () => UUID);
    expect(bulkSourceEntriesSchema.safeParse({ ids, action: 'delete' }).success).toBe(false);
  });

  test('setVisibility requires a visibility level', () => {
    expect(bulkSourceEntriesSchema.safeParse({ ids: [UUID], action: 'setVisibility' }).success).toBe(false);
  });

  test('rejects a malformed id', () => {
    expect(bulkSourceEntriesSchema.safeParse({ ids: ['x'], action: 'delete' }).success).toBe(false);
  });
});

describe('listSourceEntriesQuerySchema', () => {
  test('caps the page size at 50', () => {
    expect(listSourceEntriesQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  test('defaults the page size', () => {
    expect(listSourceEntriesQuerySchema.parse({}).limit).toBe(20);
  });
});

describe('sourceEntryDto', () => {
  const row = {
    id: UUID,
    treeId: UUID,
    individualId: UUID,
    visibility: 'admins' as const,
    text: Buffer.from('cipher'),
    createdById: UUID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  test('carries the plaintext passed in, never the Bytes column', () => {
    const dto = sourceEntryDto(row, 'طبقات');
    expect(dto.text).toBe('طبقات');
    expect(Object.values(dto).some((v) => Buffer.isBuffer(v) || v instanceof Uint8Array)).toBe(false);
  });

  test('has no undefined keys', () => {
    const dto = sourceEntryDto(row, null);
    expect(Object.values(dto).some((v) => v === undefined)).toBe(false);
  });

  test('does not expose the creator', () => {
    expect('createdById' in sourceEntryDto(row, 'x')).toBe(false);
  });
});

describe('audit wiring', () => {
  test('snapshotSourceEntry keeps only individualId, visibility and text', () => {
    const snap = snapshotSourceEntry({
      id: UUID,
      individualId: null,
      visibility: 'members',
      text: 'نص',
    });
    expect(snap).toEqual({ id: UUID, individualId: null, visibility: 'members', text: 'نص' });
  });

  test('the Arabic label reads «مصدر»', () => {
    expect(buildAuditDescription('create', 'source_entry')).toBe('إضافة مصدر');
  });

  test('the audit-log filter accepts source_entry', () => {
    expect(AUDIT_ENTITY_TYPES).toContain('source_entry');
    expect(auditLogQuerySchema.safeParse({ entityType: 'source_entry' }).success).toBe(true);
  });
});

// ===========================================================================
// Step 5 — files: an entry needs text OR at least one file
// ===========================================================================

describe('text-or-files (step 5)', () => {
  const FILE = 'aaaaaaaa-0000-4000-8000-0000000000f1';

  test('create: a file-only entry is accepted', () => {
    const r = createSourceEntrySchema.safeParse({ fileIds: [FILE] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.text).toBe(null);
  });

  test('create: an empty text counts as no text', () => {
    expect(createSourceEntrySchema.safeParse({ text: '', fileIds: [FILE] }).success).toBe(true);
    expect(createSourceEntrySchema.safeParse({ text: '' }).success).toBe(false);
  });

  test('create: neither text nor files is refused', () => {
    expect(createSourceEntrySchema.safeParse({}).success).toBe(false);
    expect(createSourceEntrySchema.safeParse({ fileIds: [] }).success).toBe(false);
  });

  test('create: more than 20 file ids is refused', () => {
    const ids = Array.from({ length: 21 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(createSourceEntrySchema.safeParse({ text: 'x', fileIds: ids }).success).toBe(false);
  });

  test('create: a malformed file id is refused', () => {
    expect(createSourceEntrySchema.safeParse({ text: 'x', fileIds: ['nope'] }).success).toBe(false);
  });

  test('update: a files-only patch and a text-clearing patch are both changes', () => {
    expect(updateSourceEntrySchema.safeParse({ fileIds: [FILE] }).success).toBe(true);
    const cleared = updateSourceEntrySchema.safeParse({ text: null });
    expect(cleared.success && cleared.data.text).toBe(null);
  });

  test('tree entry: text may be omitted when files come along', () => {
    expect(putTreeEntrySchema.safeParse({ visibility: 'members', fileIds: [FILE] }).success).toBe(true);
  });

  test('the DTO carries a files list, empty by default', () => {
    const dto = sourceEntryDto(
      {
        id: UUID,
        individualId: null,
        visibility: 'admins',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      'x',
    );
    expect(dto.files).toEqual([]);
  });

  test('snapshotSourceEntry adds fileCount only when given', () => {
    const snap = snapshotSourceEntry({ id: UUID, individualId: null, visibility: 'members', text: null, fileCount: 2 });
    expect(snap).toEqual({ id: UUID, individualId: null, visibility: 'members', text: null, fileCount: 2 });
  });
});
