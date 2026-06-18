import { describe, test, expect } from 'vitest';
import { collectionVisibilityPatchSchema } from '@/lib/collections/schemas';

// ---------------------------------------------------------------------------
// PATCH .../collections/[id]/visibility request body schema.
//
// Wire format is the DB enum (private | public_link | public_listed), plus the
// optional promote-own-trees-to-listed flag (Slice C). When an admin lists a
// collection they may opt to flip their own public_link leaf trees to
// public_listed in the same call.
// ---------------------------------------------------------------------------

describe('collectionVisibilityPatchSchema', () => {
  test('accepts each DB enum visibility value', () => {
    for (const visibility of ['private', 'public_link', 'public_listed']) {
      expect(collectionVisibilityPatchSchema.safeParse({ visibility }).success).toBe(true);
    }
  });

  test('rejects a UI ladder value (link/search are not the wire format)', () => {
    expect(collectionVisibilityPatchSchema.safeParse({ visibility: 'link' }).success).toBe(false);
  });

  test('accepts an optional promoteOwnTreesToListed boolean', () => {
    const r = collectionVisibilityPatchSchema.safeParse({
      visibility: 'public_listed',
      promoteOwnTreesToListed: true,
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.promoteOwnTreesToListed).toBe(true);
  });

  test('rejects a non-boolean promoteOwnTreesToListed', () => {
    const r = collectionVisibilityPatchSchema.safeParse({
      visibility: 'public_listed',
      promoteOwnTreesToListed: 'yes',
    });
    expect(r.success).toBe(false);
  });
});
