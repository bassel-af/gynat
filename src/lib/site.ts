/**
 * Shared, non-secret site facts. One source of truth so the same value isn't
 * re-typed across metadata, page footers, and API routes (and can't drift).
 */

/** Public contact / support address — also where public-tree reports are sent. */
export const SITE_CONTACT_EMAIL = 'contact@gynat.com'

/**
 * Brand logo for emails — always the absolute production URL: mail clients
 * strip inline data: images and can't reach a dev host.
 */
export const EMAIL_LOGO_URL = 'https://gynat.com/brand/avatar-400.png'
