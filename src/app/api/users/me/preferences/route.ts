import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { treeMutateLimiter } from '@/lib/api/rate-limit';
import { z } from 'zod';

const updatePreferencesSchema = z.object({
  calendarPreference: z.enum(['hijri', 'gregorian']),
});

// GET /api/users/me/preferences — Get user preferences
export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: error ?? 'Unauthorized' }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { calendarPreference: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { calendarPreference: dbUser.calendarPreference } });
}

// PATCH /api/users/me/preferences — Update user preferences
export async function PATCH(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: error ?? 'Unauthorized' }, { status: 401 });
  }

  if (!treeMutateLimiter.check(user.id)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { calendarPreference: parsed.data.calendarPreference },
    select: { calendarPreference: true },
  });

  return NextResponse.json({ data: { calendarPreference: updated.calendarPreference } });
}
