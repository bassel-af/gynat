import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { useCalendarPreferenceState } from '@/hooks/useCalendarPreference';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

let localStorageStore: Record<string, string> = {};

beforeEach(() => {
  localStorageStore = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
    (key: string) => localStorageStore[key] ?? null,
  );
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
    (key: string, value: string) => {
      localStorageStore[key] = value;
    },
  );
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCalendarPreferenceState server reconciliation', () => {
  it('fetches server preference on mount', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { calendarPreference: 'hijri' } }),
    });

    renderHook(() => useCalendarPreferenceState());

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/users/me/preferences');
    });
  });

  it('updates state and localStorage when server has different value', async () => {
    localStorageStore['calendarPreference'] = 'hijri';

    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { calendarPreference: 'gregorian' } }),
    });

    const { result } = renderHook(() => useCalendarPreferenceState());

    // Initially uses localStorage value
    expect(result.current.preference).toBe('hijri');

    // After server response, should update to server value
    await waitFor(() => {
      expect(result.current.preference).toBe('gregorian');
    });

    expect(localStorageStore['calendarPreference']).toBe('gregorian');
  });

  it('keeps localStorage value when server returns same value', async () => {
    localStorageStore['calendarPreference'] = 'hijri';

    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { calendarPreference: 'hijri' } }),
    });

    const { result } = renderHook(() => useCalendarPreferenceState());

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    expect(result.current.preference).toBe('hijri');
  });

  it('keeps localStorage value when server fetch fails', async () => {
    localStorageStore['calendarPreference'] = 'gregorian';

    mockApiFetch.mockRejectedValue(new Error('No active session'));

    const { result } = renderHook(() => useCalendarPreferenceState());

    // Wait for the fetch attempt to complete
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    // Should still have the localStorage value
    expect(result.current.preference).toBe('gregorian');
  });

  it('keeps localStorage value when server returns non-ok response', async () => {
    localStorageStore['calendarPreference'] = 'gregorian';

    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const { result } = renderHook(() => useCalendarPreferenceState());

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    expect(result.current.preference).toBe('gregorian');
  });
});
