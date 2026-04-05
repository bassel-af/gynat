const DEFAULT_REDIRECT = '/workspaces';

/**
 * Validates a redirect path to prevent open redirect attacks.
 * Only allows relative paths starting with a single `/`.
 * Returns the default fallback for any unsafe input.
 */
export function validateRedirectPath(path: string | null | undefined): string {
  if (!path || typeof path !== 'string') {
    return DEFAULT_REDIRECT;
  }

  const trimmed = path.trim();

  // Must start with exactly one forward slash (not //)
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return DEFAULT_REDIRECT;
  }

  // Reject backslash-based bypasses (e.g. \/evil.com)
  if (trimmed.includes('\\')) {
    return DEFAULT_REDIRECT;
  }

  return trimmed;
}
