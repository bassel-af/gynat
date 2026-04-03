import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasToolbar } from '@/components/tree/CanvasToolbar/CanvasToolbar';

// Mock UserNav — it fetches user profile via API, not relevant here
vi.mock('@/components/ui/UserNav/UserNav', () => ({
  UserNav: () => <div data-testid="user-nav">UserNav</div>,
}));

// Mock RootBackChip — it uses TreeContext internally, tested separately
vi.mock('@/components/tree/RootBackChip/RootBackChip', () => ({
  RootBackChip: () => <div data-testid="root-back-chip">RootBackChip</div>,
}));

describe('CanvasToolbar', () => {
  it('renders a back link pointing to the workspace page', () => {
    render(<CanvasToolbar workspaceSlug="al-saeed" />);

    const backLink = screen.getByRole('link', { name: /مساحة العمل/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/workspaces/al-saeed');
  });

  it('renders UserNav component', () => {
    render(<CanvasToolbar workspaceSlug="test" />);
    expect(screen.getByTestId('user-nav')).toBeInTheDocument();
  });

  it('renders RootBackChip component', () => {
    render(<CanvasToolbar workspaceSlug="test" />);
    expect(screen.getByTestId('root-back-chip')).toBeInTheDocument();
  });

  it('generates correct back link for different slugs', () => {
    const { rerender } = render(<CanvasToolbar workspaceSlug="family-one" />);
    expect(screen.getByRole('link', { name: /مساحة العمل/i })).toHaveAttribute(
      'href',
      '/workspaces/family-one',
    );

    rerender(<CanvasToolbar workspaceSlug="family-two" />);
    expect(screen.getByRole('link', { name: /مساحة العمل/i })).toHaveAttribute(
      'href',
      '/workspaces/family-two',
    );
  });
});
