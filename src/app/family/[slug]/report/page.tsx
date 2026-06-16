import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicTreeForRequest } from '@/lib/tree/public-serve';
import ReportPageClient from './ReportPageClient';

// Dynamic SSR per request — same posture as the public tree page.
export const dynamic = 'force-dynamic';

// A utility page; never index it (PRD §7.6 keeps the indexable surface small).
export const metadata: Metadata = {
  title: 'الإبلاغ عن محتوى',
  robots: { index: false, follow: false },
};

type PageParams = { params: Promise<{ slug: string }> };

/**
 * Public, no-account report page (PRD §1.5, §7.7, §8.2). Reachable from the
 * public viewer footer and the make-private dialog's "request permanent
 * removal" link. Deny-by-default: a report page only exists for a tree that is
 * actually public (unknown/private slug -> 404, no existence leak), mirroring
 * the report endpoint it posts to.
 */
export default async function ReportPage({ params }: PageParams) {
  const { slug } = await params;

  const record = await getPublicTreeForRequest(slug);
  if (!record) notFound();

  const familyName = record.nameAr || record.workspaceNameAr;
  return <ReportPageClient slug={slug} familyName={familyName} />;
}
