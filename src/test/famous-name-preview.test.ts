import { describe, it, expect } from 'vitest';
import { famousNamePreview } from '@/lib/person-detail-helpers';
import { hashimData } from './helpers/hashim-fixture';

describe('famousNamePreview', () => {
  it('leads with the famous name and names the father in the own row', () => {
    const data = hashimData();
    const p = famousNamePreview(data, data.individuals.I2);
    expect(p.main).toBe('أبو طالب بن عبدالمطلب');
  });

  it('shows the real name on the grey line when the famous name leads', () => {
    const data = hashimData();
    expect(famousNamePreview(data, data.individuals.I2).alternate).toBe('واسمه عبدمناف');
  });

  it('uses the draft, not the saved person', () => {
    const data = hashimData();
    const draft = { ...data.individuals.I2, famousNameInNasab: false };
    const p = famousNamePreview(data, draft);
    expect(p.main).toBe('عبدمناف بن عبدالمطلب');
    expect(p.alternate).toBe('ويُعرف بأبي طالب');
  });

  it('returns only the person’s own row, even for a father with a son', () => {
    const data = hashimData();
    expect(Object.keys(famousNamePreview(data, data.individuals.I2)).sort()).toEqual(['alternate', 'main']);
  });
});
