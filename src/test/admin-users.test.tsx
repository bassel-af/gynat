/**
 * /admin/users drill-down — query helper, API route wiring, and UI.
 *
 * Covers:
 *   1. `getUserAccounts()` shapes prisma rows into the payload (join date
 *      as ISO string, membership count flattened, newest-first ordering
 *      delegated to prisma).
 *   2. `GET /api/admin/users` wires the owner guard, writes an
 *      `admin_users_read` access-log row, caches per user, and returns the
 *      `query_failed` envelope instead of a 500.
 *   3. `AdminUsersClient` renders one row per account with name, email,
 *      workspace count, and join date.
 *   4. The dashboard's "إجمالي المستخدمين" card is a link to /admin/users
 *      (nav-target regression guard).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn();
const mockRequireOwner = vi.fn();
const mockLogAdminAccess = vi.fn();
const mockWithUserCache = vi.fn();
const mockApiFetch = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock('@/lib/api/admin-auth', () => ({
  requirePlatformOwner: (...args: unknown[]) => mockRequireOwner(...args),
}));

vi.mock('@/lib/audit/admin-access', () => ({
  logAdminAccess: (...args: unknown[]) => mockLogAdminAccess(...args),
}));

vi.mock('@/lib/admin/cache', () => ({
  withUserCache: (...args: unknown[]) => mockWithUserCache(...args),
}));

vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { getUserAccounts } from '@/lib/admin/users';
import AdminUsersClient from '@/app/admin/users/AdminUsersClient';
import { Card } from '@/app/admin/AdminDashboardClient';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOwner.mockResolvedValue({ user: { id: 'owner-1' } });
  mockWithUserCache.mockImplementation(
    async (_userId: string, _key: string, fn: () => Promise<unknown>) => fn(),
  );
  mockLogAdminAccess.mockResolvedValue(undefined);
});

const dbRows = [
  {
    id: 'u-1',
    displayName: 'أحمد سعيد',
    email: 'ahmad@example.com',
    isPlatformOwner: false,
    createdAt: new Date('2026-05-01T10:00:00Z'),
    lastActiveAt: new Date('2026-07-13T08:30:00Z'),
    _count: { workspaceMemberships: 3 },
  },
  {
    id: 'u-2',
    displayName: 'باسل',
    email: 'owner@example.com',
    isPlatformOwner: true,
    createdAt: new Date('2026-01-15T09:00:00Z'),
    lastActiveAt: null,
    _count: { workspaceMemberships: 1 },
  },
];

// ---------------------------------------------------------------------------
// 1. Query helper
// ---------------------------------------------------------------------------

describe('getUserAccounts', () => {
  test('flattens prisma rows into the payload shape', async () => {
    mockFindMany.mockResolvedValue(dbRows);

    const payload = await getUserAccounts();

    expect(payload.totalUsers).toBe(2);
    expect(payload.users[0]).toEqual({
      id: 'u-1',
      displayName: 'أحمد سعيد',
      email: 'ahmad@example.com',
      isPlatformOwner: false,
      workspaceCount: 3,
      createdAt: '2026-05-01T10:00:00.000Z',
      lastActiveAt: '2026-07-13T08:30:00.000Z',
    });
    expect(payload.users[1].lastActiveAt).toBeNull();
  });

  test('orders newest account first via prisma orderBy', async () => {
    mockFindMany.mockResolvedValue([]);
    await getUserAccounts();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. API route
// ---------------------------------------------------------------------------

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:4000/api/admin/users', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/admin/users', () => {
  test('returns the accounts payload for an owner', async () => {
    mockFindMany.mockResolvedValue(dbRows);

    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalUsers).toBe(2);
    expect(body.users[0].email).toBe('ahmad@example.com');
  });

  test('propagates the guard response for a non-owner and skips the query', async () => {
    const forbidden = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    mockRequireOwner.mockResolvedValueOnce(forbidden);

    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeRequest());

    expect(res).toBe(forbidden);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockLogAdminAccess).not.toHaveBeenCalled();
  });

  test('logs an admin_users_read access row', async () => {
    mockFindMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/admin/users/route');
    await GET(makeRequest({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'ua' }));

    expect(mockLogAdminAccess).toHaveBeenCalledTimes(1);
    const call = mockLogAdminAccess.mock.calls[0][0];
    expect(call.userId).toBe('owner-1');
    expect(call.action).toBe('admin_users_read');
    expect(call.ipAddress).toBe('1.2.3.4');
  });

  test('returns query_failed envelope instead of 500 when the query throws', async () => {
    mockFindMany.mockRejectedValue(new TypeError('boom'));
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      error: 'query_failed',
      errorType: 'TypeError',
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Users page UI
// ---------------------------------------------------------------------------

describe('AdminUsersClient', () => {
  test('renders a row per account with email, workspace count, and join date', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        totalUsers: 2,
        users: [
          {
            id: 'u-1',
            displayName: 'أحمد سعيد',
            email: 'ahmad@example.com',
            isPlatformOwner: false,
            workspaceCount: 3,
            createdAt: '2026-05-01T10:00:00.000Z',
            lastActiveAt: null,
          },
          {
            id: 'u-2',
            displayName: 'باسل',
            email: 'owner@example.com',
            isPlatformOwner: true,
            workspaceCount: 1,
            createdAt: '2026-01-15T09:00:00.000Z',
            lastActiveAt: null,
          },
        ],
      }),
    });

    render(<AdminUsersClient />);

    await waitFor(() => {
      expect(screen.getByText('أحمد سعيد')).toBeTruthy();
    });
    expect(screen.getByText('ahmad@example.com')).toBeTruthy();
    expect(screen.getByText('owner@example.com')).toBeTruthy();
    // Owner badge shows only on the platform owner's row.
    expect(screen.getAllByText('مالك المنصة')).toHaveLength(1);
    // Join date column renders a formatted Arabic date for each row
    // (exact string depends on ICU; assert the year is present).
    expect(screen.getAllByText(/٢٠٢٦|2026/).length).toBeGreaterThanOrEqual(2);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/users');
  });

  test('shows an inline error on query_failed instead of a blank page', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'query_failed', errorType: 'TypeError' }),
    });

    render(<AdminUsersClient />);

    await waitFor(() => {
      expect(screen.getByText(/تعذر تحميل الحسابات/)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Dashboard card is a link
// ---------------------------------------------------------------------------

describe('dashboard Card drill-down link', () => {
  test('renders an anchor to /admin/users when href is set', () => {
    render(
      <Card
        label="إجمالي المستخدمين"
        value={34}
        secondary="جميع الحسابات"
        href="/admin/users"
      />,
    );

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/admin/users');
    expect(link.textContent).toContain('جميع الحسابات');
  });

  test('renders a plain div (no link) when href is absent', () => {
    render(<Card label="تعديلات" value={5} secondary="آخر ٧ أيام" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
