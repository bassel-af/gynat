/**
 * Lock: the default one-line name (`getDisplayNameWithNasab`, depth 2) must stay
 * byte-identical across every existing fixture tree when the «قفزة نسب»
 * surname placement changes (a jump can never be crossed at depth 2 — it costs
 * `JUMP_GENERATION_COST` slots — so the default name must not move at all).
 *
 * The snapshot stores a SHA-256 per fixture (plus the person count) rather
 * than the names themselves, so no family's names are copied into the repo a
 * second time. It was recorded BEFORE the placement change.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseGedcom } from '@/lib/gedcom/parser';
import { getDisplayNameWithNasab } from '@/lib/gedcom/display';

const FIXTURES = ['ancestry-jump.ged', 'test-family.ged', 'saeed-family.ged'];

describe('depth-2 one-line names are unchanged', () => {
  test.each(FIXTURES)('%s', (file) => {
    const data = parseGedcom(readFileSync(join(__dirname, 'fixtures', file), 'utf8'));
    const ids = Object.keys(data.individuals).sort();
    const lines = ids.map((id) => `${id}\t${getDisplayNameWithNasab(data, data.individuals[id], 2)}`);
    const digest = createHash('sha256').update(lines.join('\n')).digest('hex');
    expect({ people: ids.length, digest }).toMatchSnapshot();
  });
});
