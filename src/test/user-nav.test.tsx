import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// Mock Supabase client
const mockSignOut = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { UserNav } from '@/components/ui/UserNav';

describe('UserNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
  });

  it('renders user info after successful API fetch', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { displayName: 'باسل', avatarUrl: null },
      }),
    });

    render(<UserNav />);

    await waitFor(() => {
      expect(screen.getByText('باسل')).toBeInTheDocument();
    });

    // Should show fallback avatar (first letter)
    expect(screen.getByText('ب')).toBeInTheDocument();

    // Should have a link to profile
    const profileLink = screen.getByTitle('الملف الشخصي');
    expect(profileLink).toHaveAttribute('href', '/profile');
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

  it('calls signOut and redirects on logout click', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { displayName: 'باسل', avatarUrl: null },
      }),
    });
    mockSignOut.mockResolvedValue({});

    render(<UserNav />);

    await waitFor(() => {
      expect(screen.getByText('باسل')).toBeInTheDocument();
    });

    const logoutButton = screen.getByLabelText('تسجيل الخروج');
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(window.location.href).toBe('/auth/login');
    });
  });

  it('shows only logout button when API fetch fails', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });

    render(<UserNav />);

    await waitFor(() => {
      expect(screen.getByLabelText('تسجيل الخروج')).toBeInTheDocument();
    });

    // Should NOT show any profile link
    expect(screen.queryByTitle('الملف الشخصي')).not.toBeInTheDocument();
  });

  it('updates displayName in response to profile:updated event', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { displayName: 'باسل', avatarUrl: null },
      }),
    });

    render(<UserNav />);

    await waitFor(() => {
      expect(screen.getByText('باسل')).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('profile:updated', {
          detail: { displayName: 'أحمد', avatarUrl: null },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('أحمد')).toBeInTheDocument();
    });
    expect(screen.queryByText('باسل')).not.toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    // Make the fetch never resolve
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = render(<UserNav />);

    // Should render nothing (empty)
    expect(container.innerHTML).toBe('');
  });
});
