import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Public Tree — Viewer Preview · جينات',
  description: 'Dev preview of the read-only public tree viewer',
  robots: { index: false, follow: false },
};

export default function PublicTreeViewPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
