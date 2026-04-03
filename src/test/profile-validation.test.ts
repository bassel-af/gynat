import { describe, test, expect } from 'vitest';

// ============================================================================
// Display name validation
// ============================================================================
describe('displayNameSchema', () => {
  test('accepts a valid Arabic display name', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse('محمد السعيد');
    expect(result.success).toBe(true);
  });

  test('accepts a valid Latin display name', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse('John Doe');
    expect(result.success).toBe(true);
  });

  test('rejects empty string', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  test('rejects whitespace-only string', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse('   ');
    expect(result.success).toBe(false);
  });

  test('rejects name longer than 100 characters', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse('ا'.repeat(101));
    expect(result.success).toBe(false);
  });

  test('accepts name at exactly 100 characters', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse('ا'.repeat(100));
    expect(result.success).toBe(true);
  });

  test('rejects string containing HTML tags', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse('<script>alert("xss")</script>');
    expect(result.success).toBe(false);
  });

  test('rejects string containing an img tag', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse('<img onerror="alert(1)" src=x>');
    expect(result.success).toBe(false);
  });

  test('allows name with special characters that are not HTML', async () => {
    const { displayNameSchema } = await import('@/lib/profile/validation');
    const result = displayNameSchema.safeParse("أحمد بن عبد الله - الأول");
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Password change validation
// ============================================================================
describe('passwordChangeSchema', () => {
  test('accepts valid password change', async () => {
    const { passwordChangeSchema } = await import('@/lib/profile/validation');
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass456!',
      confirmPassword: 'NewPass456!',
    });
    expect(result.success).toBe(true);
  });

  test('rejects when current password is missing', async () => {
    const { passwordChangeSchema } = await import('@/lib/profile/validation');
    const result = passwordChangeSchema.safeParse({
      newPassword: 'NewPass456!',
      confirmPassword: 'NewPass456!',
    });
    expect(result.success).toBe(false);
  });

  test('rejects when new password is too short', async () => {
    const { passwordChangeSchema } = await import('@/lib/profile/validation');
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass123!',
      newPassword: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
  });

  test('rejects when new password matches current password', async () => {
    const { passwordChangeSchema } = await import('@/lib/profile/validation');
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'SamePass123!',
      newPassword: 'SamePass123!',
      confirmPassword: 'SamePass123!',
    });
    expect(result.success).toBe(false);
  });

  test('rejects when confirmation does not match new password', async () => {
    const { passwordChangeSchema } = await import('@/lib/profile/validation');
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass456!',
      confirmPassword: 'Mismatch999!',
    });
    expect(result.success).toBe(false);
  });

  test('rejects when new password is empty', async () => {
    const { passwordChangeSchema } = await import('@/lib/profile/validation');
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass123!',
      newPassword: '',
      confirmPassword: '',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Email change validation
// ============================================================================
describe('emailChangeSchema', () => {
  test('accepts a valid email', async () => {
    const { emailChangeSchema } = await import('@/lib/profile/validation');
    const result = emailChangeSchema.safeParse({
      newEmail: 'new@example.com',
      currentEmail: 'old@example.com',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid email format', async () => {
    const { emailChangeSchema } = await import('@/lib/profile/validation');
    const result = emailChangeSchema.safeParse({
      newEmail: 'not-an-email',
      currentEmail: 'old@example.com',
    });
    expect(result.success).toBe(false);
  });

  test('rejects when new email is same as current email', async () => {
    const { emailChangeSchema } = await import('@/lib/profile/validation');
    const result = emailChangeSchema.safeParse({
      newEmail: 'same@example.com',
      currentEmail: 'same@example.com',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty email', async () => {
    const { emailChangeSchema } = await import('@/lib/profile/validation');
    const result = emailChangeSchema.safeParse({
      newEmail: '',
      currentEmail: 'old@example.com',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Color settings validation
// ============================================================================
describe('hexColorSchema', () => {
  test('accepts valid 6-digit hex color with hash', async () => {
    const { hexColorSchema } = await import('@/lib/profile/validation');
    const result = hexColorSchema.safeParse('#1a2b3c');
    expect(result.success).toBe(true);
  });

  test('accepts valid 3-digit hex color with hash', async () => {
    const { hexColorSchema } = await import('@/lib/profile/validation');
    const result = hexColorSchema.safeParse('#abc');
    expect(result.success).toBe(true);
  });

  test('accepts uppercase hex color', async () => {
    const { hexColorSchema } = await import('@/lib/profile/validation');
    const result = hexColorSchema.safeParse('#AABBCC');
    expect(result.success).toBe(true);
  });

  test('rejects hex color without hash', async () => {
    const { hexColorSchema } = await import('@/lib/profile/validation');
    const result = hexColorSchema.safeParse('1a2b3c');
    expect(result.success).toBe(false);
  });

  test('rejects invalid hex characters', async () => {
    const { hexColorSchema } = await import('@/lib/profile/validation');
    const result = hexColorSchema.safeParse('#gggggg');
    expect(result.success).toBe(false);
  });

  test('rejects wrong length hex color', async () => {
    const { hexColorSchema } = await import('@/lib/profile/validation');
    const result = hexColorSchema.safeParse('#12345');
    expect(result.success).toBe(false);
  });

  test('rejects empty string', async () => {
    const { hexColorSchema } = await import('@/lib/profile/validation');
    const result = hexColorSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('treeColorSettingsSchema', () => {
  test('accepts valid male and female colors', async () => {
    const { treeColorSettingsSchema } = await import('@/lib/profile/validation');
    const result = treeColorSettingsSchema.safeParse({
      maleNodeColor: '#4a90d9',
      femaleNodeColor: '#d94a7b',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid male color', async () => {
    const { treeColorSettingsSchema } = await import('@/lib/profile/validation');
    const result = treeColorSettingsSchema.safeParse({
      maleNodeColor: 'not-a-color',
      femaleNodeColor: '#d94a7b',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid female color', async () => {
    const { treeColorSettingsSchema } = await import('@/lib/profile/validation');
    const result = treeColorSettingsSchema.safeParse({
      maleNodeColor: '#4a90d9',
      femaleNodeColor: 'red',
    });
    expect(result.success).toBe(false);
  });
});
