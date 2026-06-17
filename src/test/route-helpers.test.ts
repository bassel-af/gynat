import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  parseValidatedBody,
  isParseError,
  extractTreeId,
  parseTreeIdFromBody,
} from '@/lib/api/route-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().positive('Age must be positive'),
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json {{',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseValidatedBody', () => {
  it('returns { data } when JSON is valid and matches schema', async () => {
    const request = makeRequest({ name: 'Ali', age: 30 });
    const result = await parseValidatedBody(request, testSchema);

    expect(isParseError(result)).toBe(false);
    expect((result as { data: z.infer<typeof testSchema> }).data).toEqual({
      name: 'Ali',
      age: 30,
    });
  });

  it('returns 400 NextResponse when JSON is invalid', async () => {
    const request = makeInvalidJsonRequest();
    const result = await parseValidatedBody(request, testSchema);

    expect(isParseError(result)).toBe(true);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid JSON');
  });

  it('returns 400 NextResponse with first Zod issue when schema validation fails', async () => {
    const request = makeRequest({ name: '', age: -5 });
    const result = await parseValidatedBody(request, testSchema);

    expect(isParseError(result)).toBe(true);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
    const json = await response.json();
    // First issue should be the name validation error
    expect(json.error).toBe('Name is required');
  });

  it('returns first Zod issue even when multiple fields fail', async () => {
    const request = makeRequest({ name: 123, age: 'not a number' });
    const result = await parseValidatedBody(request, testSchema);

    expect(isParseError(result)).toBe(true);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
    const json = await response.json();
    // Should be the first issue message, not all issues
    expect(typeof json.error).toBe('string');
    expect(json.error.length).toBeGreaterThan(0);
  });
});

describe('isParseError', () => {
  it('returns true for NextResponse instances', () => {
    const response = NextResponse.json({ error: 'test' }, { status: 400 });
    expect(isParseError(response)).toBe(true);
  });

  it('returns false for { data } objects', () => {
    expect(isParseError({ data: { name: 'Ali', age: 30 } })).toBe(false);
  });
});

describe('extractTreeId', () => {
  it('returns the string treeId when present', () => {
    expect(extractTreeId({ treeId: 'tree-abc' })).toBe('tree-abc');
  });

  it('returns undefined when treeId is absent', () => {
    expect(extractTreeId({ foo: 'bar' })).toBeUndefined();
    expect(extractTreeId({})).toBeUndefined();
  });

  it('returns undefined for null/undefined/non-object bodies', () => {
    expect(extractTreeId(null)).toBeUndefined();
    expect(extractTreeId(undefined)).toBeUndefined();
    expect(extractTreeId('a string')).toBeUndefined();
  });

  it('rejects a non-string treeId (Prisma-operator injection guard)', () => {
    // A Prisma operator object must never reach a `where: { id: treeId }` clause.
    expect(extractTreeId({ treeId: { in: ['x', 'y'] } })).toBeUndefined();
    expect(extractTreeId({ treeId: 42 })).toBeUndefined();
    expect(extractTreeId({ treeId: ['x'] })).toBeUndefined();
    expect(extractTreeId({ treeId: null })).toBeUndefined();
  });
});

describe('parseTreeIdFromBody', () => {
  it('reads a string treeId from the request JSON body', async () => {
    const req = makeRequest({ treeId: 'tree-xyz' });
    expect(await parseTreeIdFromBody(req)).toBe('tree-xyz');
  });

  it('returns undefined for invalid JSON (no body / unparsable)', async () => {
    expect(await parseTreeIdFromBody(makeInvalidJsonRequest())).toBeUndefined();
  });

  it('returns undefined when treeId is missing or a non-string operator object', async () => {
    expect(await parseTreeIdFromBody(makeRequest({ other: 1 }))).toBeUndefined();
    expect(
      await parseTreeIdFromBody(makeRequest({ treeId: { in: ['x'] } })),
    ).toBeUndefined();
  });
});
