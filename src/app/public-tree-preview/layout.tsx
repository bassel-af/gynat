import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Public Tree — Mockups · جينات',
  description: 'Static, non-functional mockups for the Public Tree feature',
  robots: { index: false, follow: false },
};

export default function PublicTreePreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
