import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { getServerSupabaseUrl, getAuthCookieName } from '@/lib/supabase/internal-url';

const { mockCreateServerClient } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(() => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  })),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }));

// ---------------------------------------------------------------------------
// Server-side Supabase base URL.
//
// In production `NEXT_PUBLIC_SUPABASE_URL` is the public origin (https://gynat.com),
// so every server-side token verification left the box and came back in through
// the CDN — which timed out and surfaced as «fetch failed» / random 401s.
// `SUPABASE_INTERNAL_URL` lets the server talk to the local auth gateway instead.
// The BROWSER client must never follow it: a browser cannot reach 127.0.0.1:8002.
// ---------------------------------------------------------------------------

const ORIGINAL_INTERNAL = process.env.SUPABASE_INTERNAL_URL;
const ORIGINAL_PUBLIC = process.env.NEXT_PUBLIC_SUPABASE_URL;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('SUPABASE_INTERNAL_URL', ORIGINAL_INTERNAL);
  restore('NEXT_PUBLIC_SUPABASE_URL', ORIGINAL_PUBLIC);
});

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('getServerSupabaseUrl', () => {
  it('uses SUPABASE_INTERNAL_URL when it is set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gynat.com';
    process.env.SUPABASE_INTERNAL_URL = 'http://127.0.0.1:8002';

    expect(getServerSupabaseUrl()).toBe('http://127.0.0.1:8002');
  });

  it('falls back to the public URL when the internal one is not set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gynat.com';
    delete process.env.SUPABASE_INTERNAL_URL;

    expect(getServerSupabaseUrl()).toBe('https://gynat.com');
  });

  it('falls back to the public URL when the internal one is blank', () => {
    // A var left declared but empty in an env file must not blank out the base
    // URL — that would turn every auth call into a relative-URL crash.
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gynat.com';
    process.env.SUPABASE_INTERNAL_URL = '   ';

    expect(getServerSupabaseUrl()).toBe('https://gynat.com');
  });

  it('trims surrounding whitespace off the internal URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gynat.com';
    process.env.SUPABASE_INTERNAL_URL = ' http://127.0.0.1:8002 ';

    expect(getServerSupabaseUrl()).toBe('http://127.0.0.1:8002');
  });
});

describe('getAuthCookieName', () => {
  // supabase-js derives its storage key from the URL host
  // (`sb-${hostname.split('.')[0]}-auth-token`). The browser writes the cookie
  // under the PUBLIC host, so a server client pointed at 127.0.0.1 would look
  // for `sb-127-auth-token`, find nothing, and bounce every logged-in visitor
  // back to the login page. The name must stay pinned to the public URL.
  it('derives the name from the public URL, not the internal one', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gynat.com';
    process.env.SUPABASE_INTERNAL_URL = 'http://127.0.0.1:8002';

    expect(getAuthCookieName()).toBe('sb-gynat-auth-token');
  });

  it('gives no name when the public URL is unusable, rather than throwing', () => {
    // Every page request goes through the middleware; a missing or malformed
    // var must degrade to the library's own default, not crash the guard.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(getAuthCookieName()).toBeUndefined();
  });

  it('matches what the browser writes locally', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
    process.env.SUPABASE_INTERNAL_URL = 'http://127.0.0.1:8000';

    expect(getAuthCookieName()).toBe('sb-localhost-auth-token');
  });
});

describe('the middleware session client', () => {
  it('reads the public cookie while calling the internal URL', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gynat.com';
    process.env.SUPABASE_INTERNAL_URL = 'http://127.0.0.1:8002';
    mockCreateServerClient.mockClear();

    const { updateSession } = await import('@/lib/supabase/middleware');
    const { NextRequest } = await import('next/server');
    await updateSession(new NextRequest('http://localhost:4000/workspaces'));

    const [url, , options] = mockCreateServerClient.mock.calls[0] as unknown as [
      string, string, { cookieOptions?: { name?: string } },
    ];
    expect(url).toBe('http://127.0.0.1:8002');
    expect(options.cookieOptions?.name).toBe('sb-gynat-auth-token');
  });
});

describe('which Supabase clients follow the internal URL', () => {
  // Every server-side construction of a Supabase client, found by scanning the
  // source rather than listed by hand — so a new call site that reaches for the
  // public URL fails here instead of quietly reviving the CDN round trip.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  const clientCallSites = walk(join(process.cwd(), 'src'))
    .filter((f) => !f.includes('/test/') && !f.endsWith('src/lib/supabase/client.ts'))
    // Value imports only — `import type { User }` builds nothing.
    .filter((f) => /import \{[^}]*\bcreate(Server)?Client\b[^}]*\} from '@supabase\/(ssr|supabase-js)'/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(process.cwd(), f));

  it('finds the known server-side client factories', () => {
    expect(clientCallSites).toEqual(expect.arrayContaining([
      'src/lib/api/auth.ts',
      'src/lib/supabase/ssr-client.ts',
    ]));
  });

  it.each(clientCallSites)('%s builds its client from getServerSupabaseUrl()', (path) => {
    const source = readSource(path);
    expect(source).toContain('getServerSupabaseUrl');
    expect(source).not.toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('cookie-backed clients all go through the one factory that pins the cookie name', () => {
    const cookieClients = walk(join(process.cwd(), 'src'))
      .filter((f) => !f.includes('/test/'))
      .filter((f) => /createServerClient\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f));
    expect(cookieClients).toEqual(['src/lib/supabase/ssr-client.ts']);
  });

  it('the browser client stays on the public URL', () => {
    // The internal URL is reachable only from the host itself; a browser
    // pointed at it would fail every auth request.
    const source = readSource('src/lib/supabase/client.ts');
    expect(source).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(source).not.toContain('SUPABASE_INTERNAL_URL');
    expect(source).not.toContain('getServerSupabaseUrl');
  });
});
