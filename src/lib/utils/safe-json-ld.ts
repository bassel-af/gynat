/**
 * Serialise JSON-LD for an inline `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is NOT safe there: the HTML parser ends the script
 * at the first `</script>` no matter what the JSON says, so a user-controlled
 * string (a person's name on a public page) could break out and inject
 * markup. Every `<`, `>` and `&` becomes its JSON unicode escape (the parser
 * sees no tag, entity or comment), and so do U+2028 / U+2029 (line
 * terminators in older JS engines). The result parses back to exactly the
 * same data. Use it at EVERY JSON-LD script site.
 */
const UNSAFE = /[<>&\u2028\u2029]/g;

const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (ch) => ESCAPES[ch]);
}
