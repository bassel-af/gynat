import { z } from 'zod';

/** Rejects strings containing HTML tags like <script>, <img>, etc. */
const noHtmlTags = z.string().refine(
  (val) => !/<[a-zA-Z][^>]*>/.test(val),
  { message: 'HTML tags are not allowed' },
);

export const displayNameSchema = z
  .string()
  .min(1, 'الاسم مطلوب')
  .max(100, 'الاسم طويل جداً')
  .trim()
  .refine((val) => val.trim().length > 0, { message: 'الاسم مطلوب' })
  .pipe(noHtmlTags);

export const passwordStrengthSchema = z
  .string()
  .min(8, 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل')
  .max(256, 'كلمة المرور طويلة جداً')
  .regex(/[a-z\u0600-\u06FF]/, 'يجب أن تحتوي على حرف صغير واحد على الأقل')
  .regex(/[A-Z]/, 'يجب أن تحتوي على حرف كبير واحد على الأقل')
  .regex(/[0-9]/, 'يجب أن تحتوي على رقم واحد على الأقل');

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
    newPassword: passwordStrengthSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية',
    path: ['newPassword'],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

export const emailChangeSchema = z
  .object({
    newEmail: z.string().email('البريد الإلكتروني غير صالح').min(1).max(320),
    currentEmail: z.string().email(),
  })
  .refine((data) => data.newEmail !== data.currentEmail, {
    message: 'البريد الإلكتروني الجديد مطابق للحالي',
    path: ['newEmail'],
  });

export const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color');

export const treeColorSettingsSchema = z.object({
  maleNodeColor: hexColorSchema,
  femaleNodeColor: hexColorSchema,
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
});
