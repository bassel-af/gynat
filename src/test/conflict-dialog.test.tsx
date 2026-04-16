import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConflictDialog } from '@/components/tree/ConflictDialog/ConflictDialog';

describe('ConflictDialog', () => {
  it('does not render when isOpen is false', () => {
    render(<ConflictDialog isOpen={false} variant="stale" onRefresh={vi.fn()} />);
    expect(screen.queryByText('تغيّرت الشجرة')).not.toBeInTheDocument();
  });

  it('renders stale-variant title and body copy from the PRD', () => {
    render(<ConflictDialog isOpen={true} variant="stale" onRefresh={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'تغيّرت الشجرة' })).toBeInTheDocument();
    expect(screen.getByText(/تغيّرت الشجرة منذ ذلك التعديل/)).toBeInTheDocument();
    expect(screen.getByText(/الرجاء تحديث الصفحة/)).toBeInTheDocument();
  });

  it('renders auth-variant with session/permissions copy', () => {
    render(<ConflictDialog isOpen={true} variant="auth" onRefresh={vi.fn()} />);
    expect(screen.getByText(/انتهت صلاحية الجلسة أو تغيّرت الصلاحيات/)).toBeInTheDocument();
  });

  it('shows the refresh button with correct Arabic label', () => {
    render(<ConflictDialog isOpen={true} variant="stale" onRefresh={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'تحديث الصفحة' })).toBeInTheDocument();
  });

  it('calls onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(<ConflictDialog isOpen={true} variant="stale" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'تحديث الصفحة' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('does NOT close on Escape key', () => {
    const onRefresh = vi.fn();
    render(<ConflictDialog isOpen={true} variant="stale" onRefresh={onRefresh} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    // Dialog is still in the document
    expect(screen.getByRole('dialog', { name: 'تغيّرت الشجرة' })).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
