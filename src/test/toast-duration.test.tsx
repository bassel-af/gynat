import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '@/context/ToastContext';

function Trigger({ durationMs }: { durationMs?: number }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast('رسالة طويلة', 'info', durationMs)}>show</button>;
}

function showWith(durationMs?: number) {
  vi.useFakeTimers();
  render(
    <ToastProvider>
      <Trigger durationMs={durationMs} />
    </ToastProvider>,
  );
  act(() => screen.getByText('show').click());
}

afterEach(() => vi.useRealTimers());

describe('ToastContext — duration', () => {
  test('a toast disappears after 3 s by default', () => {
    showWith();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText('رسالة طويلة')).toBeNull();
  });

  test('a longer duration keeps the toast past 3 s', () => {
    showWith(8000);
    act(() => vi.advanceTimersByTime(7000));
    expect(screen.getByText('رسالة طويلة')).toBeInTheDocument();
  });

  test('a longer duration still ends', () => {
    showWith(8000);
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByText('رسالة طويلة')).toBeNull();
  });
});
