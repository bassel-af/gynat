import { describe, test, expect, beforeAll } from 'vitest';

// These tests will fail until the schemas module is created
// at src/lib/tree/audit-log-schemas.ts

// ============================================================================
// Audit log query parameter validation schemas
// ============================================================================

describe('auditLogQuerySchema — pagination', () => {
  let auditLogQuerySchema: import('zod').ZodType;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit-log-schemas');
    auditLogQuerySchema = mod.auditLogQuerySchema;
  });

  test('accepts empty query (all defaults)', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  test('accepts valid page and limit', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      page: 2,
      limit: 30,
    });
    expect(result.success).toBe(true);
  });

  test('rejects limit > 50', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      limit: 100,
    });
    expect(result.success).toBe(false);
  });

  test('rejects limit = 0', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects negative limit', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      limit: -5,
    });
    expect(result.success).toBe(false);
  });

  test('rejects page = 0', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      page: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects negative page', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      page: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('auditLogQuerySchema — action filter', () => {
  let auditLogQuerySchema: import('zod').ZodType;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit-log-schemas');
    auditLogQuerySchema = mod.auditLogQuerySchema;
  });

  const validActions = [
    'create', 'update', 'delete', 'cascade_delete',
    'deep_copy', 'MOVE_SUBTREE', 'import',
    'redeem_pointer', 'disconnect', 'token_revoked',
  ];

  for (const action of validActions) {
    test(`accepts valid action: ${action}`, () => {
      const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({ action });
      expect(result.success).toBe(true);
    });
  }

  test('rejects invalid action', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({ action: 'hack' });
    expect(result.success).toBe(false);
  });
});

describe('auditLogQuerySchema — entityType filter', () => {
  let auditLogQuerySchema: import('zod').ZodType;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit-log-schemas');
    auditLogQuerySchema = mod.auditLogQuerySchema;
  });

  const validEntityTypes = [
    'individual', 'family', 'family_child',
    'rada_family', 'rada_family_child',
    'branch_pointer', 'share_token', 'tree',
  ];

  for (const entityType of validEntityTypes) {
    test(`accepts valid entityType: ${entityType}`, () => {
      const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({ entityType });
      expect(result.success).toBe(true);
    });
  }

  test('rejects invalid entityType', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({ entityType: 'hacked_table' });
    expect(result.success).toBe(false);
  });
});

describe('auditLogQuerySchema — userId filter', () => {
  let auditLogQuerySchema: import('zod').ZodType;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit-log-schemas');
    auditLogQuerySchema = mod.auditLogQuerySchema;
  });

  test('accepts valid UUID for userId', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      userId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  test('rejects non-UUID userId', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      userId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('auditLogQuerySchema — entityId filter', () => {
  let auditLogQuerySchema: import('zod').ZodType;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit-log-schemas');
    auditLogQuerySchema = mod.auditLogQuerySchema;
  });

  test('accepts valid UUID for entityId', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      entityId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  test('rejects non-UUID entityId', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      entityId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('auditLogQuerySchema — date range filter', () => {
  let auditLogQuerySchema: import('zod').ZodType;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit-log-schemas');
    auditLogQuerySchema = mod.auditLogQuerySchema;
  });

  test('accepts valid ISO date strings', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-04-06T23:59:59.999Z',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid from date', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      from: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid to date', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      to: 'garbage',
    });
    expect(result.success).toBe(false);
  });

  test('accepts from without to', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      from: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  test('accepts to without from', () => {
    const result = (auditLogQuerySchema as import('zod').ZodObject<Record<string, import('zod').ZodTypeAny>>).safeParse({
      to: '2026-04-06T23:59:59.999Z',
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Exported enum arrays
// ============================================================================

describe('AUDIT_ACTION_TYPES — exported enum values', () => {
  let AUDIT_ACTION_TYPES: readonly string[];

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit-log-schemas');
    AUDIT_ACTION_TYPES = mod.AUDIT_ACTION_TYPES;
  });

  test('includes all known action types', () => {
    expect(AUDIT_ACTION_TYPES).toContain('create');
    expect(AUDIT_ACTION_TYPES).toContain('update');
    expect(AUDIT_ACTION_TYPES).toContain('delete');
    expect(AUDIT_ACTION_TYPES).toContain('cascade_delete');
    expect(AUDIT_ACTION_TYPES).toContain('deep_copy');
    expect(AUDIT_ACTION_TYPES).toContain('MOVE_SUBTREE');
    expect(AUDIT_ACTION_TYPES).toContain('import');
    expect(AUDIT_ACTION_TYPES).toContain('redeem_pointer');
    expect(AUDIT_ACTION_TYPES).toContain('disconnect');
    expect(AUDIT_ACTION_TYPES).toContain('token_revoked');
  });
});

describe('AUDIT_ENTITY_TYPES — exported enum values', () => {
  let AUDIT_ENTITY_TYPES: readonly string[];

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit-log-schemas');
    AUDIT_ENTITY_TYPES = mod.AUDIT_ENTITY_TYPES;
  });

  test('includes all known entity types', () => {
    expect(AUDIT_ENTITY_TYPES).toContain('individual');
    expect(AUDIT_ENTITY_TYPES).toContain('family');
    expect(AUDIT_ENTITY_TYPES).toContain('family_child');
    expect(AUDIT_ENTITY_TYPES).toContain('rada_family');
    expect(AUDIT_ENTITY_TYPES).toContain('rada_family_child');
    expect(AUDIT_ENTITY_TYPES).toContain('branch_pointer');
    expect(AUDIT_ENTITY_TYPES).toContain('share_token');
    expect(AUDIT_ENTITY_TYPES).toContain('tree');
  });
});
