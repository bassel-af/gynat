import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the apiFetch layer the wrappers sit on top of, so these tests stay at
// the client-wrapper level (URL built, body shaped, response unwrapped) without
// touching the network or the real route.
const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
}));

import {
  setCollectionVisibility,
  getCollectionPublishPreview,
} from '@/lib/collections/api';

const WS = 'ws-uuid-1';
const COLL = 'c0000000-0000-4000-a000-000000000001';

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('setCollectionVisibility', () => {
  beforeEach(() => vi.clearAllMocks());

  test('PATCHes the collection visibility route with the chosen level', async () => {
    mockApiFetch.mockResolvedValue(
      ok({ data: { publicSlug: 'abc123', visibility: 'public_link' } }),
    );

    const result = await setCollectionVisibility(WS, COLL, 'link');

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/workspaces/${WS}/collections/${COLL}/visibility`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ visibility: 'public_link' }),
      }),
    );
    expect(result.publicSlug).toBe('abc123');
    expect(result.visibility).toBe('public_link');
  });

  test('maps the "search" UI level to public_listed on the wire', async () => {
    mockApiFetch.mockResolvedValue(
      ok({ data: { publicSlug: 's', visibility: 'public_listed' } }),
    );

    await setCollectionVisibility(WS, COLL, 'search');

    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.visibility).toBe('public_listed');
  });

  test('maps the "private" UI level to private on the wire', async () => {
    mockApiFetch.mockResolvedValue(
      ok({ data: { publicSlug: null, visibility: 'private' } }),
    );

    await setCollectionVisibility(WS, COLL, 'private');

    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.visibility).toBe('private');
  });

  test('throws on a non-ok response', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'بلا صلاحية' }), { status: 403 }),
    );

    await expect(setCollectionVisibility(WS, COLL, 'link')).rejects.toThrow(
      'بلا صلاحية',
    );
  });
});

describe('getCollectionPublishPreview', () => {
  beforeEach(() => vi.clearAllMocks());

  test('GETs the publish-preview route and returns the withheld trees', async () => {
    mockApiFetch.mockResolvedValue(
      ok({
        data: {
          withheldTrees: [{ titleAr: 'فرع خاص' }],
          publishableCount: 2,
          publicSlug: null,
          currentVisibility: 'private',
        },
      }),
    );

    const preview = await getCollectionPublishPreview(WS, COLL);

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/workspaces/${WS}/collections/${COLL}/publish-preview`,
    );
    expect(preview.withheldTrees).toEqual([{ titleAr: 'فرع خاص' }]);
    expect(preview.publishableCount).toBe(2);
    expect(preview.currentVisibility).toBe('private');
  });
});
