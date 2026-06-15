import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Public Tree — Components Preview · جينات',
  description: 'Dev preview harness for the Public Tree presentational components',
  robots: { index: false, follow: false },
};

export default function PublicTreeComponentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
