// @vitest-environment node
/**
 * JSON-LD is inlined into a raw <script> tag, where the HTML parser ends the
 * script at the first `</script>` — whatever the JSON says. `safeJsonLd`
 * escapes it so a user-controlled name can never break out.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { safeJsonLd } from '@/lib/utils/safe-json-ld';

const HOSTILE = '</script><script>alert(1)</script>';

describe('safeJsonLd', () => {
  test('a name that closes the script tag is emitted inert', () => {
    const out = safeJsonLd({ '@type': 'Person', name: HOSTILE });
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain('<');
  });

  test('escapes >, & and the JS line separators too', () => {
    const out = safeJsonLd({ name: 'a>b&c\u2028d\u2029e' });
    expect(out).not.toMatch(/[>&\u2028\u2029]/);
  });

  test('parses back to exactly the same data', () => {
    const data = { name: `${HOSTILE} & <!-- x --> \u2028\u2029 محمد` };
    expect(JSON.parse(safeJsonLd(data))).toEqual(data);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

test('every JSON-LD <script> in the app goes through safeJsonLd', () => {
  const offenders = walk(path.join(process.cwd(), 'src/app')).filter((file) =>
    /__html:\s*JSON\.stringify\(/.test(readFileSync(file, 'utf8')),
  );
  expect(offenders).toEqual([]);
});
