import { NextResponse, type NextRequest } from 'next/server';
import { createSsrClient } from './ssr-client';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createSsrClient({
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) =>
        request.cookies.set(name, value),
      );
      supabaseResponse = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) =>
        supabaseResponse.cookies.set(name, value, options),
      );
    },
  });

  // This refreshes the session if expired and sets updated cookies
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabaseResponse };
}
