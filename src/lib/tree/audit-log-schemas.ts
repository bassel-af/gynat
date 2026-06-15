import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants — exported for use in route handlers and UI
// ---------------------------------------------------------------------------

export const AUDIT_ACTION_TYPES = [
  'create',
  'update',
  'delete',
  'cascade_delete',
  'deep_copy',
  'move_child',
  'import',
  'redeem_pointer',
  'break_pointer',
  'copy_pointer',
  'revoke_token',
  'MOVE_SUBTREE',
  'disconnect',
  'token_revoked',
  'publish',
  'unpublish',
  'change_visibility',
] as const;

export const AUDIT_ENTITY_TYPES = [
  'individual',
  'family',
  'family_child',
  'rada_family',
  'rada_family_child',
  'branch_pointer',
  'share_token',
  'tree',
] as const;

// ---------------------------------------------------------------------------
// ISO date string validation helper
// ---------------------------------------------------------------------------

const isoDateString = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid ISO date string' },
);

// ---------------------------------------------------------------------------
// Audit log query parameter schema
// ---------------------------------------------------------------------------

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  action: z.enum(AUDIT_ACTION_TYPES).optional(),
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: isoDateString.optional(),
  to: isoDateString.optional(),
});
