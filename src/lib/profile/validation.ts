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

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
    newPassword: z.string().min(6, 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'),
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
