import { NextResponse } from 'next/server';
import { z } from 'zod';

type ParseResult<T> = { data: T } | NextResponse;

export async function parseValidatedBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<ParseResult<z.infer<T>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  return { data: parsed.data };
}

export function isParseError(result: ParseResult<unknown>): result is NextResponse {
  return result instanceof NextResponse;
}
