import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PublicCollectionPageClient from '@/app/collections/[slug]/PublicCollectionPageClient';

// next/link renders as a plain <a> — the href (which /family/[slug] each card
// opens) is the whole point of the test. PublicTreeHeader fetches nothing, but
// PublicGrowthCTA links to /auth/signup; both render fine under jsdom.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('PublicCollectionPageClient', () => {
  it('renders one card per published tree linking into that tree’s /family viewer', () => {
    render(
      <PublicCollectionPageClient
        titleAr="مجموعة العائلات"
        descriptionAr="وصف"
        trees={[
          { slug: 'aaa111', titleAr: 'آل سعيد', peopleCount: 12 },
          { slug: 'bbb222', titleAr: 'آل شربك', peopleCount: 7 },
        ]}
      />,
    );

    const first = screen.getByText('آل سعيد').closest('a');
    const second = screen.getByText('آل شربك').closest('a');
    expect(first).toHaveAttribute('href', '/family/aaa111');
    expect(second).toHaveAttribute('href', '/family/bbb222');
    // The card surfaces the leaf tree's people count.
    expect(screen.getByText('12 شخصا موثقا')).toBeInTheDocument();
    expect(screen.getByText('7 شخصا موثقا')).toBeInTheDocument();
  });

  it('shows the empty state (never a blank page) when the collection has no public trees', () => {
    render(
      <PublicCollectionPageClient
        titleAr="مجموعة فارغة"
        descriptionAr={null}
        trees={[]}
      />,
    );

    // PublicTreeState empty variant copy — proves a fallback renders, not blank.
    expect(screen.getByText('لا تتوفر معلومات معروضة')).toBeInTheDocument();
    // No tree cards present.
    expect(screen.queryByText('عرض الشجرة')).not.toBeInTheDocument();
  });
});
