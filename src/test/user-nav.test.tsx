import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { UserNav } from '@/components/ui/UserNav';

// The tree top bar shows only the avatar (linking to the profile). The display
// name and the sign-out button were intentionally removed from this component.
describe('UserNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the avatar + profile link after successful API fetch', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { displayName: 'باسل', avatarUrl: null },
      }),
    });

    render(<UserNav />);

    // Fallback avatar shows the first letter of the display name
    await waitFor(() => {
      expect(screen.getByText('ب')).toBeInTheDocument();
    });

    // The avatar links to the profile page
    const profileLink = screen.getByTitle('الملف الشخصي');
    expect(profileLink).toHaveAttribute('href', '/profile');

    // The display name itself is NOT rendered (avatar only)
    expect(screen.queryByText('باسل')).not.toBeInTheDocument();
  });

  it('does NOT render a sign-out button', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { displayName: 'باسل', avatarUrl: null },
      }),
    });

    render(<UserNav />);

    await waitFor(() => {
      expect(screen.getByTitle('الملف الشخصي')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('تسجيل الخروج')).not.toBeInTheDocument();
  });

  it('renders avatar image when avatarUrl is provided', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { displayName: 'باسل', avatarUrl: 'https://example.com/avatar.jpg' },
      }),
    });

    render(<UserNav />);

    await waitFor(() => {
      const img = screen.getByAltText('باسل');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });
  });

  it('renders no profile link when API fetch fails', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });

    render(<UserNav />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    expect(screen.queryByTitle('الملف الشخصي')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('تسجيل الخروج')).not.toBeInTheDocument();
  });

  it('updates the avatar in response to profile:updated event', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { displayName: 'باسل', avatarUrl: null },
      }),
    });

    render(<UserNav />);

    await waitFor(() => {
      expect(screen.getByText('ب')).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('profile:updated', {
          detail: { displayName: 'أحمد', avatarUrl: null },
        }),
      );
    });

    // Fallback avatar letter updates to the new name's first letter
    await waitFor(() => {
      expect(screen.getByText('أ')).toBeInTheDocument();
    });
    expect(screen.queryByText('ب')).not.toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    // Make the fetch never resolve
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = render(<UserNav />);

    // Should render nothing (empty)
    expect(container.innerHTML).toBe('');
  });
});
