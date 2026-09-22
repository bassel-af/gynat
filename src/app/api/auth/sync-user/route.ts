import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { syncUserToDb } from '@/lib/auth/sync-user';

// POST /api/auth/sync-user
// Called after successful sign-in/sign-up to ensure the user exists in public.users.
// This mirrors the GoTrue auth.users record into our application schema.
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) {
    console.log('[sync-user] Auth failed:', error ?? 'no user');
    // A missing header is the caller's bug and is named; a rejected token is not.
    const message = error === 'Missing authorization' ? error : 'Invalid session';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  console.log('[sync-user] Syncing user:', user.id, 'email:', user.email);
  const dbUser = await syncUserToDb(user);
  console.log('[sync-user] Synced successfully, db email:', dbUser.email);
  return NextResponse.json({ user: dbUser });
}
