import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

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
