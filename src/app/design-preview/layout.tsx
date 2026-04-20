import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Design Preview · صُلالَة',
  description: 'Premium design direction preview',
};

export default function DesignPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
