import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// --- Mocks ---

const mockSignInWithOtp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

import LoginPage from '@/app/auth/login/page';

describe('Magic link login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
  });

  // --- 1. Default mode is password ---

  test('renders in password mode by default', () => {
    render(<LoginPage />);

    // Password field should be visible in default mode
    expect(screen.getByLabelText('كلمة المرور')).toBeInTheDocument();
    // Primary submit button should say "دخول"
    expect(screen.getByRole('button', { name: 'دخول' })).toBeInTheDocument();
    // Mode switch link should offer magic link alternative
    expect(screen.getByText('الدخول برابط سريع بدون كلمة مرور')).toBeInTheDocument();
  });

  // --- 2. Toggle to magic link mode ---

  test('switches to magic link mode when toggle link is clicked', () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    // Password field should no longer be visible
    expect(screen.queryByLabelText('كلمة المرور')).not.toBeInTheDocument();
    // Forgot password link should be hidden too
    expect(screen.queryByText('نسيت كلمة المرور؟')).not.toBeInTheDocument();
    // Magic link send button should appear
    expect(screen.getByRole('button', { name: 'إرسال رابط الدخول' })).toBeInTheDocument();
    // Email field should remain
    expect(screen.getByLabelText('البريد الإلكتروني')).toBeInTheDocument();
  });

  // --- 3. Toggle back to password mode ---

  test('switches back to password mode when toggle link is clicked again', () => {
    render(<LoginPage />);

    // Go to magic link mode
    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));
    // Now go back to password mode
    fireEvent.click(screen.getByText('الدخول بكلمة المرور'));

    // Password field should be back
    expect(screen.getByLabelText('كلمة المرور')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'دخول' })).toBeInTheDocument();
    // Forgot password link should be back
    expect(screen.getByText('نسيت كلمة المرور؟')).toBeInTheDocument();
  });

  // --- 4. Email is preserved when switching modes ---

  test('preserves email value when switching between modes', () => {
    render(<LoginPage />);

    // Type email in password mode
    const emailInput = screen.getByLabelText('البريد الإلكتروني');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    // Switch to magic link mode
    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    // Email should still be there
    expect(screen.getByLabelText('البريد الإلكتروني')).toHaveValue('test@example.com');
  });

  // --- 5. Magic link form calls signInWithOtp ---

  test('calls signInWithOtp with correct email and default next param', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط الدخول' }));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining('/auth/callback?next=%2Fworkspaces'),
        }),
      });
    });
  });

  // --- 5b. Magic link preserves custom next param ---

  test('passes custom next param through emailRedirectTo', async () => {
    mockSearchParams = new URLSearchParams('next=/workspaces/my-family/tree');

    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط الدخول' }));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(
            '/auth/callback?next=%2Fworkspaces%2Fmy-family%2Ftree'
          ),
        }),
      });
    });
  });

  // --- 6. Shows success message after sending ---

  test('shows success message after magic link is sent', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط الدخول' }));

    await waitFor(() => {
      expect(
        screen.getByText('تم إرسال رابط الدخول إلى بريدك الإلكتروني. تحقق من صندوق الوارد.')
      ).toBeInTheDocument();
    });

    // Send button should be gone (replaced by success state)
    expect(screen.queryByRole('button', { name: 'إرسال رابط الدخول' })).not.toBeInTheDocument();
  });

  // --- 7. Shows error message on failure ---

  test('shows error message when signInWithOtp fails', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { message: 'Rate limit exceeded' },
    });

    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط الدخول' }));

    await waitFor(() => {
      expect(
        screen.getByText('تم تجاوز الحد المسموح من الرسائل، حاول لاحقاً')
      ).toBeInTheDocument();
    });

    // Should stay in magic link mode (not switch to sent state)
    expect(screen.getByRole('button', { name: 'إرسال رابط الدخول' })).toBeInTheDocument();
  });

  // --- 8. Button shows loading state while sending ---

  test('disables send button and shows loading text while sending', async () => {
    // Make the OTP call hang so we can check the loading state
    let resolveOtp: (value: unknown) => void;
    mockSignInWithOtp.mockReturnValue(
      new Promise((resolve) => {
        resolveOtp = resolve;
      })
    );

    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط الدخول' }));

    // Button should show loading text and be disabled
    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'جاري الإرسال...' });
      expect(button).toBeDisabled();
    });

    // Resolve to clean up
    await act(async () => {
      resolveOtp!({ data: {}, error: null });
    });
  });

  // --- 9. Google OAuth button remains visible in magic link mode ---

  test('Google OAuth button is visible in magic link mode', () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    expect(screen.getByText('تسجيل الدخول بحساب Google')).toBeInTheDocument();
  });

  // --- 10. Signup link remains visible in magic link mode ---

  test('signup link is visible in magic link mode', () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    expect(screen.getByText('إنشاء حساب')).toBeInTheDocument();
  });

  // --- 11. Resend link appears in sent state ---

  test('shows resend link in sent state', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط الدخول' }));

    await waitFor(() => {
      expect(screen.getByText('أرسل مرة أخرى')).toBeInTheDocument();
    });
  });

  // --- 12. Resend link has cooldown ---

  test('resend link is disabled during cooldown period', async () => {
    vi.useFakeTimers();

    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'user@example.com' },
    });

    // Submit the magic link form — mock resolves immediately but we need to flush microtasks
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط الدخول' }));
    });

    // Resend should be visible and disabled (cooldown active)
    expect(screen.getByText('أرسل مرة أخرى')).toBeInTheDocument();
    expect(screen.getByText('أرسل مرة أخرى')).toHaveAttribute('aria-disabled', 'true');

    // Advance through the full 30-second cooldown (chained 1s timeouts).
    // Each tick fires one setTimeout, which triggers a React re-render that
    // schedules the next setTimeout — so we must advance+flush 30 times.
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(screen.getByText('أرسل مرة أخرى')).not.toHaveAttribute('aria-disabled', 'true');

    vi.useRealTimers();
  });

  // --- 13. Resend calls signInWithOtp again ---

  test('clicking resend after cooldown calls signInWithOtp again', async () => {
    vi.useFakeTimers();

    render(<LoginPage />);

    fireEvent.click(screen.getByText('الدخول برابط سريع بدون كلمة مرور'));

    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'user@example.com' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط الدخول' }));
    });

    expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);

    // Advance through the full cooldown (30 chained 1s timeouts)
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }

    // Click resend and flush the async handler
    await act(async () => {
      fireEvent.click(screen.getByText('أرسل مرة أخرى'));
    });

    expect(mockSignInWithOtp).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
