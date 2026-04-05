import type { ZxcvbnResult } from '@zxcvbn-ts/core';

const SCORE_LABELS: Record<number, string> = {
  0: 'ضعيفة جداً',
  1: 'ضعيفة',
  2: 'تحتاج لتحسين',
  3: 'قوية',
  4: 'قوية جداً',
};

const arTranslations = {
  warnings: {
    straightRow: 'صفوف المفاتيح المستقيمة على لوحة المفاتيح سهلة التخمين.',
    keyPattern: 'أنماط لوحة المفاتيح القصيرة سهلة التخمين.',
    simpleRepeat: 'الأحرف المكررة مثل "aaa" سهلة التخمين.',
    extendedRepeat: 'أنماط الأحرف المكررة مثل "abcabcabc" سهلة التخمين.',
    sequences: 'التسلسلات الشائعة مثل "abc" سهلة التخمين.',
    recentYears: 'السنوات الأخيرة سهلة التخمين.',
    dates: 'التواريخ سهلة التخمين.',
    topTen: 'هذه كلمة مرور شائعة جداً.',
    topHundred: 'هذه كلمة مرور مستخدمة بكثرة.',
    common: 'هذه كلمة مرور شائعة.',
    similarToCommon: 'هذه مشابهة لكلمة مرور شائعة.',
    wordByItself: 'الكلمات المفردة سهلة التخمين.',
    namesByThemselves: 'الأسماء المفردة سهلة التخمين.',
    commonNames: 'الأسماء الشائعة سهلة التخمين.',
    userInputs: 'يجب ألا تحتوي على بيانات شخصية.',
    pwned: 'كلمة المرور هذه تم تسريبها في اختراق بيانات.',
  },
  suggestions: {
    l33t: 'تجنّب الاستبدالات المتوقعة للأحرف مثل "@" بدل "a".',
    reverseWords: 'تجنّب عكس الكلمات الشائعة.',
    allUppercase: 'اجعل بعض الأحرف كبيرة، وليس كلها.',
    capitalization: 'الأحرف الكبيرة لا تساعد كثيراً.',
    dates: 'تجنّب التواريخ والسنوات المرتبطة بك.',
    recentYears: 'تجنّب السنوات الأخيرة.',
    associatedYears: 'تجنّب السنوات المرتبطة بك.',
    sequences: 'تجنّب التسلسلات الشائعة.',
    repeated: 'تجنّب الكلمات والأحرف المكررة.',
    longerKeyboardPattern: 'استخدم نمط لوحة مفاتيح أطول مع تغييرات أكثر.',
    anotherWord: 'أضف كلمات أقل شيوعاً.',
    useWords: 'استخدم كلمات متعددة، تجنّب العبارات الشائعة.',
    noNeed: 'لا حاجة لرموز أو أرقام أو أحرف كبيرة.',
    pwned: 'إذا كنت تستخدم هذه الكلمة في مواقع أخرى، غيّرها.',
  },
  timeEstimation: {
    ltSecond: 'أقل من ثانية',
    second: '{base} ثانية',
    seconds: '{base} ثوانٍ',
    minute: '{base} دقيقة',
    minutes: '{base} دقائق',
    hour: '{base} ساعة',
    hours: '{base} ساعات',
    day: '{base} يوم',
    days: '{base} أيام',
    month: '{base} شهر',
    months: '{base} أشهر',
    year: '{base} سنة',
    years: '{base} سنوات',
    centuries: 'قرون',
  },
};

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  feedback: string[];
  label: string;
}

let loadPromise: Promise<void> | null = null;
let zxcvbnFn: ((password: string, userInputs?: (string | number)[]) => ZxcvbnResult) | null = null;

export function preloadZxcvbn(): void {
  if (loadPromise) return;
  loadPromise = (async () => {
    try {
      const [{ zxcvbn, zxcvbnOptions }, { adjacencyGraphs, dictionary: commonDict }, { dictionary: enDict }, { dictionary: arDict }] =
        await Promise.all([
          import('@zxcvbn-ts/core'),
          import('@zxcvbn-ts/language-common'),
          import('@zxcvbn-ts/language-en'),
          import('@zxcvbn-ts/language-ar'),
        ]);

      zxcvbnOptions.setOptions({
        graphs: adjacencyGraphs,
        dictionary: {
          ...commonDict,
          ...enDict,
          ...arDict,
        },
        useLevenshteinDistance: true,
        translations: arTranslations,
      });

      zxcvbnFn = zxcvbn;
    } catch (err) {
      console.warn('[password-strength] Failed to load zxcvbn:', err);
    }
  })();
}

export function isZxcvbnReady(): boolean {
  return zxcvbnFn !== null;
}

export function getLoadPromise(): Promise<void> | null {
  return loadPromise;
}

export function checkPasswordStrength(
  password: string,
  userInputs?: string[],
): PasswordStrengthResult | null {
  if (!zxcvbnFn) return null;

  const result = zxcvbnFn(password, userInputs);
  const feedback: string[] = [];

  if (result.feedback.warning) {
    feedback.push(result.feedback.warning);
  }
  feedback.push(...result.feedback.suggestions);

  return {
    score: result.score,
    feedback,
    label: SCORE_LABELS[result.score] ?? '',
  };
}
