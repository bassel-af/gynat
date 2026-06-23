import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Person Page Preview · جينات',
  description: 'Static mockup of the dedicated person profile page',
  robots: { index: false, follow: false },
};

export default function PersonPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
