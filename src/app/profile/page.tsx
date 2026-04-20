import { Suspense } from 'react';
import type { Metadata } from 'next';
import ProfileClient from './ProfileClient';

export const metadata: Metadata = {
  title: 'الملف الشخصي | جينات',
};

/**
 * Profile page — protected by middleware (redirects unauthenticated users to /auth/login).
 * All data fetching happens client-side via apiFetch.
 * Suspense boundary required because ProfileClient uses useSearchParams().
 */
export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileClient />
    </Suspense>
  );
}
