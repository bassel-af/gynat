import { describe, test, expect, vi, beforeEach } from 'vitest';

// --- 1. Password reset validation schema ---

describe('passwordResetSchema', () => {
  // Dynamic import so the test fails clearly if the export doesn't exist
  let passwordResetSchema: typeof import('@/lib/profile/validation').passwordResetSchema;

  beforeEach(async () => {
    const mod = await import('@/lib/profile/validation');
    passwordResetSchema = mod.passwordResetSchema;
  });

  test('accepts valid matching passwords', () => {
    const result = passwordResetSchema.safeParse({
      newPassword: 'MyStr0ngPw!',
      confirmPassword: 'MyStr0ngPw!',
    });
    expect(result.success).toBe(true);
  });

  test('rejects when confirmPassword does not match', () => {
    const result = passwordResetSchema.safeParse({
      newPassword: 'MyStr0ngPw!',
      confirmPassword: 'Different1!',
    });
    expect(result.success).toBe(false);
  });

  test('rejects weak password (no uppercase)', () => {
    const result = passwordResetSchema.safeParse({
      newPassword: 'mypass12!',
      confirmPassword: 'mypass12!',
    });
    expect(result.success).toBe(false);
  });

  test('rejects weak password (no digit)', () => {
    const result = passwordResetSchema.safeParse({
      newPassword: 'Abcdefgh!',
      confirmPassword: 'Abcdefgh!',
    });
    expect(result.success).toBe(false);
  });

  test('rejects weak password (too short)', () => {
    const result = passwordResetSchema.safeParse({
      newPassword: 'Ab1!',
      confirmPassword: 'Ab1!',
    });
    expect(result.success).toBe(false);
  });

  test('rejects weak password (no lowercase)', () => {
    const result = passwordResetSchema.safeParse({
      newPassword: 'MYPASS12!',
      confirmPassword: 'MYPASS12!',
    });
    expect(result.success).toBe(false);
  });

  test('accepts Arabic letters as lowercase', () => {
    const result = passwordResetSchema.safeParse({
      newPassword: 'كلمةA1234',
      confirmPassword: 'كلمةA1234',
    });
    expect(result.success).toBe(true);
  });
});

// --- 2. Redirect validation accepts /auth/reset-password ---

import { validateRedirectPath } from '@/lib/auth/validate-redirect';

describe('validateRedirectPath for reset-password', () => {
  test('allows /auth/reset-password through', () => {
    expect(validateRedirectPath('/auth/reset-password')).toBe('/auth/reset-password');
  });
});

// --- 3. Middleware: /auth/reset-password is protected ---

const mockGetUser = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

describe('middleware for /auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    });
  });

  test('redirects unauthenticated users to /auth/login', async () => {
    const request = new NextRequest('http://localhost:3000/auth/reset-password');
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/auth/login');
    expect(location.searchParams.get('next')).toBe('/auth/reset-password');
  });

  test('passes through for authenticated users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const request = new NextRequest('http://localhost:3000/auth/reset-password');
    request.cookies.set('sb-access-token', 'valid');
    request.cookies.set('sb-refresh-token', 'valid');
    const response = await middleware(request);

    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });
});
