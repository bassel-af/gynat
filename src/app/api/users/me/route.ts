import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { profileUpdateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { updateProfileSchema } from '@/lib/profile/validation';

// GET /api/users/me — Get current user profile
export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: error ?? 'Unauthorized' }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      calendarPreference: true,
    },
  });

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ data: dbUser });
}

// PATCH /api/users/me — Update current user profile
export async function PATCH(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: error ?? 'Unauthorized' }, { status: 401 });
  }

  const rl = profileUpdateLimiter.check(user.id);
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterSeconds);
  }

  const parsed = await parseValidatedBody(request, updateProfileSchema);
  if (isParseError(parsed)) return parsed;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { displayName: parsed.data.displayName },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      calendarPreference: true,
    },
  });

  return NextResponse.json({ data: updated });
}
