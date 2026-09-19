import { describe, test, expect } from 'vitest';
import {
  isPublicPersonPageIndexable,
  type PublicTreeRecord,
} from '@/lib/tree/public-serve';

// ---------------------------------------------------------------------------
// isPublicPersonPageIndexable — THE single gate for per-person search exposure.
//
// A person page is indexable iff the tree itself is indexable (main +
// public_listed) AND the owner opted in (personPagesIndexable). Off by default,
// fail-closed: an extra tree or a by-link tree is never person-indexable even
// with the flag on.
// ---------------------------------------------------------------------------

function record(overrides: Partial<PublicTreeRecord> = {}): PublicTreeRecord {
  return {
    treeId: 't1',
    workspaceId: 'ws1',
    workspaceNameAr: 'آل السعيد',
    nameAr: 'آل السعيد',
    kind: 'main',
    visibility: 'public_listed',
    lastModifiedAt: new Date(),
    publicSlug: 'slug',
    enableKunya: true,
    hideBirthDateForFemale: false,
    hideBirthDateForMale: false,
    personPagesIndexable: false,
    ...overrides,
  };
}

describe('isPublicPersonPageIndexable', () => {
  test('listed main tree with the flag ON is indexable', () => {
    expect(
      isPublicPersonPageIndexable(
        record({ visibility: 'public_listed', personPagesIndexable: true }),
      ),
    ).toBe(true);
  });

  test('listed main tree with the flag OFF is not indexable (opt-in)', () => {
    expect(
      isPublicPersonPageIndexable(
        record({ visibility: 'public_listed', personPagesIndexable: false }),
      ),
    ).toBe(false);
  });

  test('by-link main tree with the flag ON is not indexable', () => {
    expect(
      isPublicPersonPageIndexable(
        record({ visibility: 'public_link', personPagesIndexable: true }),
      ),
    ).toBe(false);
  });

  test('by-link main tree with the flag OFF is not indexable', () => {
    expect(
      isPublicPersonPageIndexable(
        record({ visibility: 'public_link', personPagesIndexable: false }),
      ),
    ).toBe(false);
  });

  test('an extra tree is never person-indexable, even listed with the flag ON', () => {
    expect(
      isPublicPersonPageIndexable(
        record({ kind: 'extra', visibility: 'public_listed', personPagesIndexable: true }),
      ),
    ).toBe(false);
  });
});
