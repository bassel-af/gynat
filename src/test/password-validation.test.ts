import { describe, it, expect } from 'vitest';
import { passwordStrengthSchema, passwordChangeSchema } from '@/lib/profile/validation';

describe('passwordStrengthSchema', () => {
  it('rejects passwords shorter than 8 characters', () => {
    const result = passwordStrengthSchema.safeParse('Ab1cdef');
    expect(result.success).toBe(false);
  });

  it('rejects passwords with no letters', () => {
    const result = passwordStrengthSchema.safeParse('12345678');
    expect(result.success).toBe(false);
  });

  it('rejects passwords with no uppercase letter', () => {
    const result = passwordStrengthSchema.safeParse('mypass12');
    expect(result.success).toBe(false);
  });

  it('rejects passwords with no lowercase letter', () => {
    const result = passwordStrengthSchema.safeParse('MYPASS12');
    expect(result.success).toBe(false);
  });

  it('rejects passwords with no digits', () => {
    const result = passwordStrengthSchema.safeParse('Abcdefgh');
    expect(result.success).toBe(false);
  });

  it('accepts valid passwords', () => {
    const result = passwordStrengthSchema.safeParse('MyPass12');
    expect(result.success).toBe(true);
  });

  it('accepts passwords with Arabic letters as lowercase', () => {
    const result = passwordStrengthSchema.safeParse('كلمةA1234');
    expect(result.success).toBe(true);
  });

  it('rejects empty string', () => {
    const result = passwordStrengthSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects passwords over 256 characters', () => {
    const longPassword = 'a'.repeat(257) + '1';
    const result = passwordStrengthSchema.safeParse(longPassword);
    expect(result.success).toBe(false);
  });
});

describe('passwordChangeSchema', () => {
  it('rejects when currentPassword is empty', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: '',
      newPassword: 'NewPass12',
      confirmPassword: 'NewPass12',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when newPassword equals currentPassword', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass12',
      newPassword: 'OldPass12',
      confirmPassword: 'OldPass12',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when confirmPassword does not match newPassword', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass12',
      newPassword: 'NewPass12',
      confirmPassword: 'Different1',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid change with all fields correct', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass12',
      newPassword: 'NewPass12',
      confirmPassword: 'NewPass12',
    });
    expect(result.success).toBe(true);
  });

  it('applies passwordStrengthSchema rules to newPassword', () => {
    // Too short
    const tooShort = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass12',
      newPassword: 'Ab1',
      confirmPassword: 'Ab1',
    });
    expect(tooShort.success).toBe(false);

    // No digits
    const noDigits = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass12',
      newPassword: 'abcdefgh',
      confirmPassword: 'abcdefgh',
    });
    expect(noDigits.success).toBe(false);

    // No letters
    const noLetters = passwordChangeSchema.safeParse({
      currentPassword: 'OldPass12',
      newPassword: '12345678',
      confirmPassword: '12345678',
    });
    expect(noLetters.success).toBe(false);
  });
});
