'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  preloadZxcvbn,
  checkPasswordStrength,
  isZxcvbnReady,
  getLoadPromise,
} from '@/lib/profile/password-strength';

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export interface PasswordStrengthResult {
  requirements: PasswordRequirement[];
  score: number | null;
  label: string;
  feedback: string[];
  isLoading: boolean;
}

export function usePasswordStrength(password: string, email: string): PasswordStrengthResult {
  const [zxcvbnLoaded, setZxcvbnLoaded] = useState(isZxcvbnReady());

  useEffect(() => {
    if (zxcvbnLoaded) return;
    preloadZxcvbn();
    const promise = getLoadPromise()!;
    let cancelled = false;
    promise.then(() => {
      if (!cancelled) setZxcvbnLoaded(true);
    }).catch(() => {
      if (!cancelled) setZxcvbnLoaded(true);
    });
    return () => { cancelled = true; };
  }, [zxcvbnLoaded]);

  const strength = useMemo(() => {
    if (!password || !zxcvbnLoaded) return null;
    return checkPasswordStrength(password, [email].filter(Boolean));
  }, [password, email, zxcvbnLoaded]);

  const requirements = useMemo<PasswordRequirement[]>(() => {
    const reqs: PasswordRequirement[] = [
      { label: '٨ أحرف على الأقل', met: password.length >= 8 },
      { label: 'حرف صغير واحد على الأقل', met: /[a-z\u0600-\u06FF]/.test(password) },
      { label: 'حرف كبير واحد على الأقل (A-Z)', met: /[A-Z]/.test(password) },
      { label: 'رقم واحد على الأقل', met: /\d/.test(password) },
    ];
    // Show zxcvbn warning in the checklist if password is weak
    if (strength && strength.score < 3) {
      const warning = strength.feedback[0] || 'كلمة المرور ضعيفة، اختر كلمة مرور أقوى';
      reqs.push({ label: warning, met: false });
    } else if (strength && strength.score >= 3) {
      reqs.push({ label: 'كلمة مرور قوية', met: true });
    }
    return reqs;
  }, [password, strength]);

  return {
    requirements,
    score: strength?.score ?? null,
    label: strength?.label ?? '',
    feedback: strength?.feedback ?? [],
    isLoading: !zxcvbnLoaded && !!getLoadPromise(),
  };
}
