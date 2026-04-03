import { describe, test, expect } from 'vitest';

// ============================================================================
// lightenHex — blends a hex color toward white
// ============================================================================
describe('lightenHex', () => {
  test('produces correct lighter color at default amount (0.5)', async () => {
    const { lightenHex } = await import('@/lib/profile/tree-settings');
    // #000000 blended 50% toward white → #808080 (128,128,128)
    expect(lightenHex('#000000')).toBe('#808080');
  });

  test('with amount=0 returns original color', async () => {
    const { lightenHex } = await import('@/lib/profile/tree-settings');
    expect(lightenHex('#4a90d9', 0)).toBe('#4a90d9');
  });

  test('with amount=1 returns white', async () => {
    const { lightenHex } = await import('@/lib/profile/tree-settings');
    expect(lightenHex('#4a90d9', 1)).toBe('#ffffff');
  });

  test('handles uppercase hex', async () => {
    const { lightenHex } = await import('@/lib/profile/tree-settings');
    expect(lightenHex('#4A90D9', 0)).toBe('#4a90d9');
  });

  test('blends arbitrary color correctly', async () => {
    const { lightenHex } = await import('@/lib/profile/tree-settings');
    // #4a90d9 = (74, 144, 217)
    // 50% toward white: (74 + (255-74)*0.5, 144 + (255-144)*0.5, 217 + (255-217)*0.5)
    //                  = (164.5, 199.5, 236)  → rounded: (165, 200, 236)
    //                  = #a5c8ec
    // Math.round(74 + 181*0.5) = Math.round(164.5) = 164 or 165 depending on rounding
    // Let's compute: 74 + 90.5 = 164.5 → Math.round → 164 (banker's) or 165 (JS rounds to 165)
    // JS Math.round(164.5) = 165, Math.round(199.5) = 200, Math.round(236) = 236
    expect(lightenHex('#4a90d9', 0.5)).toBe('#a5c8ec');
  });
});

// ============================================================================
// Default settings produce correct CSS var values
// ============================================================================
describe('default tree color CSS values', () => {
  test('default male color lightened 50% matches expected light variant', async () => {
    const { lightenHex, DEFAULT_MALE_COLOR } = await import(
      '@/lib/profile/tree-settings'
    );
    // DEFAULT_MALE_COLOR = #4a90d9
    const lightMale = lightenHex(DEFAULT_MALE_COLOR, 0.5);
    // Should be a valid hex color
    expect(lightMale).toMatch(/^#[0-9a-f]{6}$/);
    // And specifically: #a5c8ec
    expect(lightMale).toBe('#a5c8ec');
  });

  test('default female color lightened 50% matches expected light variant', async () => {
    const { lightenHex, DEFAULT_FEMALE_COLOR } = await import(
      '@/lib/profile/tree-settings'
    );
    // DEFAULT_FEMALE_COLOR = #e91e8c
    // (233, 30, 140) → 50% toward white:
    // (233 + 11 = 244, 30 + 112.5 = 142.5 → 143, 140 + 57.5 = 197.5 → 198)
    // Wait: (255-233)*0.5 = 11, (255-30)*0.5 = 112.5, (255-140)*0.5 = 57.5
    // 233+11=244, 30+112.5=142.5→143, 140+57.5=197.5→198
    // → #f48fc6
    const lightFemale = lightenHex(DEFAULT_FEMALE_COLOR, 0.5);
    expect(lightFemale).toMatch(/^#[0-9a-f]{6}$/);
    expect(lightFemale).toBe('#f48fc6');
  });
});
