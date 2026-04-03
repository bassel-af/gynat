import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccountSettings } from '@/components/profile/AccountSettings';

describe('AccountSettings email change form', () => {
  const defaultProps = {
    displayName: 'محمد',
    email: 'old@example.com',
    onSaveName: vi.fn().mockResolvedValue(undefined),
    onSaveEmail: vi.fn().mockResolvedValue(undefined),
  };

  it('shows error when submitting empty email', async () => {
    render(<AccountSettings {...defaultProps} />);

    const form = screen.getByLabelText('البريد الإلكتروني')
      .closest('form')!;
    fireEvent.submit(form);

    expect(screen.getByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();
  });

  it('disables the submit button when email field is empty', () => {
    render(<AccountSettings {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: 'تغيير' });
    expect(submitButton).toBeDisabled();
  });

  it('enables the submit button when email field has text', () => {
    render(<AccountSettings {...defaultProps} />);

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    const submitButton = screen.getByRole('button', { name: 'تغيير' });
    expect(submitButton).not.toBeDisabled();
  });

  it('calls onSaveEmail with trimmed email on submit', async () => {
    const onSaveEmail = vi.fn().mockResolvedValue(undefined);
    render(<AccountSettings {...defaultProps} onSaveEmail={onSaveEmail} />);

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: '  new@example.com  ' } });

    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSaveEmail).toHaveBeenCalledWith('new@example.com');
    });
  });

  it('replaces the email form with a confirmation card after successful submission', async () => {
    render(<AccountSettings {...defaultProps} />);

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      // The email form input should be gone, replaced by confirmation card
      expect(screen.queryByPlaceholderText('بريد إلكتروني جديد')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  it('shows both old and new email addresses in the confirmation card', async () => {
    const onSaveEmail = vi.fn().mockResolvedValue(undefined);
    render(
      <AccountSettings
        {...defaultProps}
        email="old@example.com"
        onSaveEmail={onSaveEmail}
      />,
    );

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('old@example.com')).toBeInTheDocument();
      expect(screen.getByText('new@example.com')).toBeInTheDocument();
    });
  });

  it('shows dual-confirmation instruction mentioning both messages', async () => {
    render(<AccountSettings {...defaultProps} />);

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/كلا الرسالتين/)).toBeInTheDocument();
    });
  });

  it('restores the email form when dismiss button is clicked', async () => {
    render(<AccountSettings {...defaultProps} />);

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('تغيير بريد آخر')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('تغيير بريد آخر'));

    // Form should be back
    expect(screen.getByPlaceholderText('بريد إلكتروني جديد')).toBeInTheDocument();
  });

  it('shows error message when onSaveEmail rejects', async () => {
    const onSaveEmail = vi.fn().mockRejectedValue(new Error('البريد مستخدم بالفعل'));
    render(<AccountSettings {...defaultProps} onSaveEmail={onSaveEmail} />);

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: 'taken@example.com' } });

    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('البريد مستخدم بالفعل')).toBeInTheDocument();
    });
  });

  it('shows generic error message when onSaveEmail throws a non-Error', async () => {
    const onSaveEmail = vi.fn().mockRejectedValue('unknown');
    render(<AccountSettings {...defaultProps} onSaveEmail={onSaveEmail} />);

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('فشل في تحديث البريد الإلكتروني')).toBeInTheDocument();
    });
  });

  it('clears error when user types in the email field', async () => {
    render(<AccountSettings {...defaultProps} />);

    // Trigger error first
    const form = screen.getByLabelText('البريد الإلكتروني')
      .closest('form')!;
    fireEvent.submit(form);
    expect(screen.getByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();

    // Type in input clears the error
    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: 'a' } });

    expect(screen.queryByText('البريد الإلكتروني مطلوب')).not.toBeInTheDocument();
  });

  it('does not call onSaveEmail when email is only whitespace', async () => {
    const onSaveEmail = vi.fn();
    render(<AccountSettings {...defaultProps} onSaveEmail={onSaveEmail} />);

    const emailInput = screen.getByPlaceholderText('بريد إلكتروني جديد');
    fireEvent.change(emailInput, { target: { value: '   ' } });

    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    expect(onSaveEmail).not.toHaveBeenCalled();
    expect(screen.getByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();
  });
});
