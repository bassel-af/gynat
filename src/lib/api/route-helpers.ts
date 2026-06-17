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

/**
 * Narrow an already-parsed request body to its optional `treeId`. Only a
 * STRING value is accepted — a non-string (e.g. a Prisma operator object like
 * `{ in: [...] }`) is treated as absent so it can never reach a
 * `where: { id: treeId }` clause. Used by routes that read other fields from
 * the same body (e.g. cascade-delete's `versionHash`/`confirmationName`) and
 * therefore must parse `request.json()` exactly once themselves.
 */
export function extractTreeId(body: unknown): string | undefined {
  const treeId = (body as { treeId?: unknown } | null | undefined)?.treeId;
  return typeof treeId === 'string' ? treeId : undefined;
}

/**
 * Read an OPTIONAL `treeId` from a request's JSON body for routes that need
 * nothing else from it (simple DELETEs). Consumes the request stream once, so
 * callers must not also call `request.json()`. A missing body, invalid JSON, or
 * a non-string `treeId` all yield `undefined` (operate on the main tree).
 */
export async function parseTreeIdFromBody(request: Request): Promise<string | undefined> {
  try {
    return extractTreeId(await request.json());
  } catch {
    return undefined;
  }
}
