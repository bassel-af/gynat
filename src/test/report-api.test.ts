import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockMembershipFindMany = vi.fn();
const mockNotificationCreateMany = vi.fn().mockResolvedValue({});

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findMany: (...a: unknown[]) => mockMembershipFindMany(...a) },
    notification: { createMany: (...a: unknown[]) => mockNotificationCreateMany(...a) },
  },
}));

const mockLoadPublicTreeBySlug = vi.fn();
vi.mock('@/lib/tree/public-serve', () => ({
  loadPublicTreeBySlug: (...a: unknown[]) => mockLoadPublicTreeBySlug(...a),
}));

import { POST } from '@/app/api/family/[slug]/report/route';

function req(body: unknown) {
  return new Request('http://localhost/api/family/al-saeed/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}
const params = Promise.resolve({ slug: 'al-saeed' });

const RECORD = {
  treeId: 'tree-1',
  workspaceId: 'ws-1',
  publicSlug: 'al-saeed',
  visibility: 'public_listed',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockNotificationCreateMany.mockResolvedValue({});
  mockLoadPublicTreeBySlug.mockResolvedValue(RECORD);
  mockMembershipFindMany.mockResolvedValue([{ userId: 'admin-1' }, { userId: 'admin-2' }]);
});

describe('POST report', () => {
  test('404 when the tree is not public/known', async () => {
    mockLoadPublicTreeBySlug.mockResolvedValue(null);
    const res = await POST(req({ reason: 'this exposes me' }), { params });
    expect(res.status).toBe(404);
    expect(mockNotificationCreateMany).not.toHaveBeenCalled();
  });

  test('rejects an empty reason (validation)', async () => {
    const res = await POST(req({ reason: '' }), { params });
    expect(res.status).toBe(400);
  });

  test('notifies every workspace admin and never auto-takes-down', async () => {
    const res = await POST(
      req({ reason: 'this person did not consent', reporterContact: 'me@example.com' }),
      { params },
    );
    expect(res.status).toBe(201);
    expect(mockNotificationCreateMany).toHaveBeenCalledTimes(1);
    const arg = mockNotificationCreateMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(2);
    expect(arg.data[0].type).toBe('public_tree_report');
    expect(arg.data[0].payload.reason).toBe('this person did not consent');
  });

  test('returns a neutral success even with no admins (no enumeration)', async () => {
    mockMembershipFindMany.mockResolvedValue([]);
    const res = await POST(req({ reason: 'valid reason here' }), { params });
    expect(res.status).toBe(201);
    expect(mockNotificationCreateMany).not.toHaveBeenCalled();
  });
});
