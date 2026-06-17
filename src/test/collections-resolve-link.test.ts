import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// resolve-link — turns a pasted public-tree URL/slug or a private share code
// into a single ResolvedLinkSource shape (or null → one generic 400 oracle).
//
// Reuse-gate (S11) is enforced LIVE here: the SOURCE main tree's allowReuse +
// visibility are re-queried at resolve time, so a stale add never grandfathers
// a later revoke. Deny-by-default: a missing/unknown/forbidden source → null.
// ---------------------------------------------------------------------------

const mockTokenFindFirst = vi.fn();
const mockTreeFindUnique = vi.fn();
const mockTreeFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    branchShareToken: { findFirst: (...a: unknown[]) => mockTokenFindFirst(...a) },
    familyTree: {
      findUnique: (...a: unknown[]) => mockTreeFindUnique(...a),
      findFirst: (...a: unknown[]) => mockTreeFindFirst(...a),
    },
  },
}));

// resolvePublicTreeRoot maps a source tree to GedcomData and picks the root —
// stub the source-tree load + key + mapper + root picker.
const mockGetTreeByWorkspaceId = vi.fn();
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: (...a: unknown[]) => mockGetTreeByWorkspaceId(...a),
}));
vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: () => Promise.resolve(Buffer.from('k')),
}));
const mockDbTreeToGedcom = vi.fn();
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: (...a: unknown[]) => mockDbTreeToGedcom(...a),
}));
const mockFindDefaultRoot = vi.fn();
vi.mock('@/lib/gedcom/roots', () => ({
  findDefaultRoot: (...a: unknown[]) => mockFindDefaultRoot(...a),
}));

import {
  resolveLinkSource,
  extractSlugCandidate,
  resolvePublicTreeRoot,
} from '@/lib/collections/resolve-link';
import { hashToken } from '@/lib/tree/branch-share-token';

const ADDING_WS = 'ws-adding-0000';
const SOURCE_WS = 'ws-source-0000';
const SOURCE_TREE = 'tree-source-000';
const ROOT_IND = 'ind-root-00000';

beforeEach(() => vi.clearAllMocks());

// ===========================================================================
// extractSlugCandidate — pulls a slug out of a raw code OR a /family/<slug> URL
// ===========================================================================
describe('extractSlugCandidate', () => {
  test('returns a raw alphanumeric code unchanged', () => {
    expect(extractSlugCandidate('abc123def456ghi789jkl0')).toBe('abc123def456ghi789jkl0');
  });

  test('pulls the slug from a /family/<slug> URL', () => {
    expect(extractSlugCandidate('https://gynat.com/family/abc123def456ghi789jkl0')).toBe(
      'abc123def456ghi789jkl0',
    );
  });

  test('pulls the slug from a /family/<slug> URL with a trailing slash', () => {
    expect(extractSlugCandidate('https://gynat.com/family/abc123def456ghi789jkl0/')).toBe(
      'abc123def456ghi789jkl0',
    );
  });
});

// ===========================================================================
// resolveLinkSource — private share token
// ===========================================================================
describe('resolveLinkSource — private share token', () => {
  function validToken(overrides = {}) {
    return {
      id: 'token-id-0000',
      sourceWorkspaceId: SOURCE_WS,
      rootIndividualId: ROOT_IND,
      depthLimit: 3,
      includeGrafts: true,
      isRevoked: false,
      isPublic: false,
      maxUses: 1,
      useCount: 0,
      ...overrides,
    };
  }

  test('resolves a valid token to a private-shared source', async () => {
    mockTokenFindFirst.mockResolvedValue(validToken());
    // SOURCE main tree exists, reuse allowed, public-ish? token doesn't need public.
    mockTreeFindFirst.mockResolvedValue({
      id: SOURCE_TREE,
      allowReuse: true,
      visibility: 'private',
    });

    const res = await resolveLinkSource('brsh_sometoken', ADDING_WS);
    expect(res).not.toBeNull();
    expect(res!.type).toBe('private-token');
    expect(res!.sourceWorkspaceId).toBe(SOURCE_WS);
    expect(res!.rootIndividualId).toBe(ROOT_IND);
    expect(res!.depthLimit).toBe(3);
    expect(res!.includeGrafts).toBe(true);
    expect(res!.shareTokenId).toBe('token-id-0000');
    expect(res!.isPublic).toBe(false);
    // The token lookup is by sha256 hash, never the plaintext.
    const where = mockTokenFindFirst.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(hashToken('brsh_sometoken'));
  });

  test('null when the token is unknown / revoked / expired (no slug match either)', async () => {
    mockTokenFindFirst.mockResolvedValue(null);
    mockTreeFindUnique.mockResolvedValue(null); // not a public slug either
    const res = await resolveLinkSource('brsh_bad', ADDING_WS);
    expect(res).toBeNull();
  });

  test('null when the token use count is exhausted', async () => {
    mockTokenFindFirst.mockResolvedValue(validToken({ maxUses: 1, useCount: 1 }));
    mockTreeFindUnique.mockResolvedValue(null);
    const res = await resolveLinkSource('brsh_used', ADDING_WS);
    expect(res).toBeNull();
  });

  test('S11: null when the SOURCE tree has reuse turned off (live re-query)', async () => {
    mockTokenFindFirst.mockResolvedValue(validToken());
    mockTreeFindFirst.mockResolvedValue({
      id: SOURCE_TREE,
      allowReuse: false, // owner revoked reuse after the token was minted
      visibility: 'private',
    });
    const res = await resolveLinkSource('brsh_sometoken', ADDING_WS);
    expect(res).toBeNull();
  });
});

// ===========================================================================
// resolveLinkSource — public slug
// ===========================================================================
describe('resolveLinkSource — public slug', () => {
  function publicTree(overrides = {}) {
    return {
      id: SOURCE_TREE,
      workspaceId: SOURCE_WS,
      kind: 'main',
      visibility: 'public_listed',
      allowReuse: true,
      ...overrides,
    };
  }

  test('resolves a public slug to a public-borrowed whole-tree source', async () => {
    mockTokenFindFirst.mockResolvedValue(null); // not a token
    mockTreeFindUnique.mockResolvedValue(publicTree());

    const res = await resolveLinkSource('https://gynat.com/family/slug22charslug22chars0', ADDING_WS);
    expect(res).not.toBeNull();
    expect(res!.type).toBe('public-slug');
    expect(res!.sourceWorkspaceId).toBe(SOURCE_WS);
    expect(res!.sourceTreeId).toBe(SOURCE_TREE);
    expect(res!.depthLimit).toBeNull(); // whole tree
    expect(res!.includeGrafts).toBe(false);
    expect(res!.isPublic).toBe(true);
    expect(res!.shareTokenId).toBeNull();
  });

  test('S11: null when the public tree has reuse turned off (viewable ≠ reusable)', async () => {
    mockTokenFindFirst.mockResolvedValue(null);
    mockTreeFindUnique.mockResolvedValue(publicTree({ allowReuse: false }));
    const res = await resolveLinkSource('slug22charslug22chars0', ADDING_WS);
    expect(res).toBeNull();
  });

  test('null when the slug resolves to a private tree (deny-by-default)', async () => {
    mockTokenFindFirst.mockResolvedValue(null);
    mockTreeFindUnique.mockResolvedValue(publicTree({ visibility: 'private' }));
    const res = await resolveLinkSource('slug22charslug22chars0', ADDING_WS);
    expect(res).toBeNull();
  });

  test('null when the slug resolves to an extra (non-main) tree', async () => {
    mockTokenFindFirst.mockResolvedValue(null);
    mockTreeFindUnique.mockResolvedValue(publicTree({ kind: 'extra' }));
    const res = await resolveLinkSource('slug22charslug22chars0', ADDING_WS);
    expect(res).toBeNull();
  });
});

// ===========================================================================
// resolvePublicTreeRoot — real root id for a whole-tree (public-slug) borrow
// ===========================================================================
describe('resolvePublicTreeRoot', () => {
  test('returns the source tree default root id', async () => {
    mockGetTreeByWorkspaceId.mockResolvedValue({ id: SOURCE_TREE });
    mockDbTreeToGedcom.mockReturnValue({ individuals: {}, families: {} });
    mockFindDefaultRoot.mockReturnValue({ id: 'real-root-id' });
    const root = await resolvePublicTreeRoot(SOURCE_WS);
    expect(root).toBe('real-root-id');
  });

  test('returns null for an empty source tree (no root)', async () => {
    mockGetTreeByWorkspaceId.mockResolvedValue({ id: SOURCE_TREE });
    mockDbTreeToGedcom.mockReturnValue({ individuals: {}, families: {} });
    mockFindDefaultRoot.mockReturnValue(null);
    const root = await resolvePublicTreeRoot(SOURCE_WS);
    expect(root).toBeNull();
  });

  test('returns null when the source main tree is missing', async () => {
    mockGetTreeByWorkspaceId.mockResolvedValue(null);
    const root = await resolvePublicTreeRoot(SOURCE_WS);
    expect(root).toBeNull();
  });
});
