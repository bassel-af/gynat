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
        visibility: 'admins',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      'x',
    );
    expect(dto.files).toEqual([]);
  });

  test('the DTO individualId is the first linked person unless the route names one', () => {
    const row = {
      id: UUID,
      visibility: 'members' as const,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      links: [
        { individualId: 'P1', individual: { isPrivate: false } },
        { individualId: 'P2', individual: { isPrivate: false } },
      ],
    };
    expect(sourceEntryDto(row, 'x').individualId).toBe('P1');
    expect(sourceEntryDto(row, 'x', [], 'P2').individualId).toBe('P2');
    expect(sourceEntryDto({ ...row, links: [] }, 'x').individualId).toBeNull();
  });

  test('by default the DTO individualId skips a private (or unknown) first link — fail-closed', () => {
    const row = {
      id: UUID,
      visibility: 'members' as const,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      links: [
        { individualId: 'PRIV', individual: { isPrivate: true } },
        { individualId: 'GONE', individual: null },
        { individualId: 'P1', individual: { isPrivate: false } },
      ],
    };
    expect(sourceEntryDto(row, 'x').individualId).toBe('P1');
    expect(sourceEntryDto({ ...row, links: row.links.slice(0, 2) }, 'x').individualId).toBeNull();
  });

  test('snapshotSourceEntry adds fileCount only when given', () => {
    const snap = snapshotSourceEntry({ id: UUID, individualId: null, visibility: 'members', text: null, fileCount: 2 });
    expect(snap).toEqual({ id: UUID, individualId: null, visibility: 'members', text: null, fileCount: 2 });
  });
});

// ===========================================================================
// R2 — shared sources: create with people, link deltas, list filter, audit
// ===========================================================================

import {
  createSourceSchema,
  MAX_LINKS_PER_SOURCE,
} from '@/lib/tree/source-entry-schemas';

describe('createSourceSchema', () => {
  const P = 'cccccccc-0000-4000-8000-000000000001';

  test('needs at least one person', () => {
    expect(createSourceSchema.safeParse({ text: 'x', personIds: [] }).success).toBe(false);
    expect(createSourceSchema.safeParse({ text: 'x' }).success).toBe(false);
  });

  test('caps people at 500', () => {
    const ids = Array.from({ length: MAX_LINKS_PER_SOURCE + 1 }, () => P);
    expect(MAX_LINKS_PER_SOURCE).toBe(500);
    expect(createSourceSchema.safeParse({ text: 'x', personIds: ids }).success).toBe(false);
  });

  test('rejects a malformed person id', () => {
    expect(createSourceSchema.safeParse({ text: 'x', personIds: ['nope'] }).success).toBe(false);
  });

  test('still needs text or a file', () => {
    expect(createSourceSchema.safeParse({ personIds: [P] }).success).toBe(false);
    expect(createSourceSchema.parse({ text: ' ب ', personIds: [P] })).toMatchObject({ text: 'ب', personIds: [P] });
  });
});

describe('updateSourceEntrySchema — link deltas', () => {
  const P = 'cccccccc-0000-4000-8000-000000000001';
  const Q = 'cccccccc-0000-4000-8000-000000000002';

  test('a links-only patch is a valid patch', () => {
    expect(updateSourceEntrySchema.safeParse({ addPersonIds: [P] }).success).toBe(true);
    expect(updateSourceEntrySchema.safeParse({ removePersonIds: [P], onLastLink: 'keep' }).success).toBe(true);
  });

  test('empty delta arrays alone are still an empty patch', () => {
    expect(updateSourceEntrySchema.safeParse({ addPersonIds: [], removePersonIds: [] }).success).toBe(false);
  });

  test('add and remove must be disjoint', () => {
    expect(updateSourceEntrySchema.safeParse({ addPersonIds: [P, Q], removePersonIds: [Q] }).success).toBe(false);
  });

  test('caps each list at 500 and refuses a bad onLastLink', () => {
    const ids = Array.from({ length: MAX_LINKS_PER_SOURCE + 1 }, () => P);
    expect(updateSourceEntrySchema.safeParse({ addPersonIds: ids }).success).toBe(false);
    expect(updateSourceEntrySchema.safeParse({ removePersonIds: [P], onLastLink: 'maybe' }).success).toBe(false);
  });
});

describe('listSourceEntriesQuerySchema — filter', () => {
  test('accepts shared and unlinked, refuses anything else', () => {
    expect(listSourceEntriesQuerySchema.parse({ filter: 'shared' }).filter).toBe('shared');
    expect(listSourceEntriesQuerySchema.parse({ filter: 'unlinked' }).filter).toBe('unlinked');
    expect(listSourceEntriesQuerySchema.safeParse({ filter: 'all-of-it' }).success).toBe(false);
  });
});

describe('snapshotSourceEntry — people', () => {
  test('records the linked person ids and their count (ids only)', () => {
    const snap = snapshotSourceEntry({
      id: UUID,
      visibility: 'members',
      text: 'نص',
      personIds: ['p1', 'p2'],
    });
    expect(snap).toEqual({ id: UUID, visibility: 'members', text: 'نص', personIds: ['p1', 'p2'], peopleCount: 2 });
  });
});
