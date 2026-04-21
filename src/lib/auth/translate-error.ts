/**
 * Translate common Supabase/GoTrue English error messages to Arabic.
 * Falls back to a generic message when no match is found so we never surface
 * raw English to the user in an Arabic RTL UI.
 */

type Rule = { test: RegExp; ar: string };

const RULES: Rule[] = [
  {
    test: /new password should be different from the old password/i,
    ar: 'يجب أن تكون كلمة المرور الجديدة مختلفة عن القديمة',
  },
  {
    test: /password should be at least (\d+) characters/i,
    ar: 'يجب أن تتكون كلمة المرور من ٨ أحرف على الأقل',
  },
  {
    test: /password is too weak|password is known to be weak/i,
    ar: 'كلمة المرور ضعيفة، اختر كلمة مرور أقوى',
  },
  {
    test: /invalid login credentials/i,
    ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  },
  {
    test: /email not confirmed/i,
    ar: 'لم يتم تأكيد البريد الإلكتروني بعد',
  },
  {
    test: /rate limit exceeded/i,
    ar: 'تم تجاوز الحد المسموح من الرسائل، حاول لاحقاً',
  },
  {
    test: /for security purposes, you can only request this after (\d+) seconds?/i,
    ar: 'لأسباب أمنية، يرجى المحاولة بعد قليل',
  },
  {
    test: /user already registered|already been registered/i,
    ar: 'هذا البريد الإلكتروني مسجل مسبقاً',
  },
  {
    test: /unable to validate email address/i,
    ar: 'صيغة البريد الإلكتروني غير صحيحة',
  },
  {
    test: /signups not allowed/i,
    ar: 'التسجيل غير متاح حالياً',
  },
  {
    test: /token has expired or is invalid|invalid or expired token/i,
    ar: 'انتهت صلاحية الرابط أو أنه غير صالح',
  },
  {
    test: /same as the existing email/i,
    ar: 'البريد الإلكتروني الجديد مطابق للحالي',
  },
  {
    test: /a user with this email address has already been registered/i,
    ar: 'هذا البريد الإلكتروني مسجل مسبقاً',
  },
];

export function translateAuthError(message: string | undefined | null): string {
  if (!message) return 'حدث خطأ غير متوقع، حاول مرة أخرى';
  // If the message already contains Arabic, return it as-is.
  if (/[\u0600-\u06FF]/.test(message)) return message;
  for (const rule of RULES) {
    if (rule.test.test(message)) return rule.ar;
  }
  return 'حدث خطأ أثناء العملية، حاول مرة أخرى';
}
