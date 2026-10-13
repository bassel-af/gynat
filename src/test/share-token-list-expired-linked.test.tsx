import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { ShareTokenList } from '@/components/workspace/ShareTokenList/ShareTokenList';

const PAST = '2026-05-22T03:13:42.994Z';

function token(overrides: Record<string, unknown>) {
  return {
    id: 'tok-1',
    rootPersonName: 'عبدالناصر سعيّد',
    depthLimit: null,
    activePointerCount: 0,
    isPublic: false,
    targetWorkspaceName: 'شربك',
    isRevoked: false,
    expiresAt: PAST,
    createdAt: '2026-04-22T03:13:42.994Z',
    ...overrides,
  };
}

function serve(tokens: unknown[]) {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ data: tokens }) });
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

// An expired code only stops NEW links; a branch already linked through it is
// live. Labelling that card «منتهي الصلاحية» reads as "the link is dead".
describe('ShareTokenList — expired code with a live link', () => {
  test('shows «مرتبط», not «منتهي الصلاحية», when the expired code still has a linked branch', async () => {
    serve([token({ activePointerCount: 1 })]);
    render(<ShareTokenList workspaceId="ws-1" />);

    expect(await screen.findByText('مرتبط')).toBeTruthy();
    expect(screen.queryByText('منتهي الصلاحية')).toBeNull();
  });

  test('still shows «منتهي الصلاحية» when the expired code has no linked branch', async () => {
    serve([token({ activePointerCount: 0 })]);
    render(<ShareTokenList workspaceId="ws-1" />);

    expect(await screen.findByText('منتهي الصلاحية')).toBeTruthy();
    expect(screen.queryByText('مرتبط')).toBeNull();
  });
});
