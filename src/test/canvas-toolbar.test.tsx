import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanvasToolbar } from '@/components/tree/CanvasToolbar/CanvasToolbar';

// Mock UserNav — it fetches user profile via API, not relevant here
vi.mock('@/components/ui/UserNav/UserNav', () => ({
  UserNav: () => <div data-testid="user-nav">UserNav</div>,
}));

// Mock RootBackChip — it uses TreeContext internally, tested separately
vi.mock('@/components/tree/RootBackChip/RootBackChip', () => ({
  RootBackChip: () => <div data-testid="root-back-chip">RootBackChip</div>,
}));

// Mock ToastContext
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Mock apiFetch
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

const defaultProps = { workspaceSlug: 'test', workspaceId: 'ws-123' };

describe('CanvasToolbar', () => {
  it('renders a back link pointing to the workspace page', () => {
    render(<CanvasToolbar workspaceSlug="al-saeed" workspaceId="ws-1" />);

    const backLink = screen.getByRole('link', { name: /مساحة العائلة/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/workspaces/al-saeed');
  });

  it('renders UserNav component', () => {
    render(<CanvasToolbar {...defaultProps} />);
    expect(screen.getByTestId('user-nav')).toBeInTheDocument();
  });

  it('renders RootBackChip component', () => {
    render(<CanvasToolbar {...defaultProps} />);
    expect(screen.getByTestId('root-back-chip')).toBeInTheDocument();
  });

  it('generates correct back link for different slugs', () => {
    const { rerender } = render(<CanvasToolbar workspaceSlug="family-one" workspaceId="ws-1" />);
    expect(screen.getByRole('link', { name: /مساحة العائلة/i })).toHaveAttribute(
      'href',
      '/workspaces/family-one',
    );

    rerender(<CanvasToolbar workspaceSlug="family-two" workspaceId="ws-2" />);
    expect(screen.getByRole('link', { name: /مساحة العائلة/i })).toHaveAttribute(
      'href',
      '/workspaces/family-two',
    );
  });

  it('renders export button with correct aria attributes', () => {
    render(<CanvasToolbar {...defaultProps} />);
    const exportBtn = screen.getByRole('button', { name: /تصدير ملف GEDCOM/i });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).toHaveAttribute('aria-haspopup', 'true');
    expect(exportBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens export dropdown with two version options on click', () => {
    render(<CanvasToolbar {...defaultProps} />);
    const exportBtn = screen.getByRole('button', { name: /تصدير ملف GEDCOM/i });

    fireEvent.click(exportBtn);

    expect(exportBtn).toHaveAttribute('aria-expanded', 'true');
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems).toHaveLength(2);
    expect(screen.getByText('GEDCOM 5.5.1')).toBeInTheDocument();
    expect(screen.getByText('GEDCOM 7.0')).toBeInTheDocument();
  });

  it('shows Arabic subtitles for each version option', () => {
    render(<CanvasToolbar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /تصدير ملف GEDCOM/i }));

    expect(screen.getByText('متوافق مع أغلب البرامج')).toBeInTheDocument();
    expect(screen.getByText('الإصدار الحديث')).toBeInTheDocument();
  });

  it('closes dropdown on Escape key', () => {
    render(<CanvasToolbar {...defaultProps} />);
    const exportBtn = screen.getByRole('button', { name: /تصدير ملف GEDCOM/i });

    fireEvent.click(exportBtn);
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});
