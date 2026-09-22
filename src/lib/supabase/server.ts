import { cookies } from 'next/headers';
import { createSsrClient } from './ssr-client';

export async function createClient() {
  const cookieStore = await cookies();

  return createSsrClient({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // setAll can be called from a Server Component where cookies
        // are read-only. The middleware will handle refreshing instead.
      }
    },
  });
}
