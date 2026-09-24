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
