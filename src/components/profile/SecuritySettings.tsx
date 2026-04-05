'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { passwordChangeSchema } from '@/lib/profile/validation';
import {
  preloadZxcvbn,
  checkPasswordStrength,
} from '@/lib/profile/password-strength';
import { usePasswordStrength } from '@/hooks/usePasswordStrength';
import { RequirementsList, StrengthMeter } from '@/components/ui/PasswordStrength';
import { Button } from '@/components/ui/Button';
import styles from './SecuritySettings.module.css';

interface SecuritySettingsProps {
  email: string;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export function SecuritySettings({ email, onChangePassword }: SecuritySettingsProps) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const { requirements, score, label, feedback, isLoading } = usePasswordStrength(newPassword, email);
  const allStructuralRequirementsMet = requirements.every((r) => r.met);

  const clearMessages = useCallback(() => {
    setError('');
    setFieldErrors({});
    setSuccess(false);
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
    preloadZxcvbn();
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    clearMessages();
  }, [clearMessages]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      clearMessages();

      const result = passwordChangeSchema.safeParse({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      if (!result.success) {
        const errors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0] as string;
          if (!errors[field]) {
            errors[field] = issue.message;
          }
        }
        setFieldErrors(errors);
        return;
      }

      // zxcvbn check
      const strength = checkPasswordStrength(newPassword, [email].filter(Boolean));
      if (strength === null) {
        setError('جاري التحميل، حاول مرة أخرى');
        return;
      }
      if (strength.score < 3) {
        setError(strength.feedback[0] || 'كلمة المرور ضعيفة، اختر كلمة مرور أقوى');
        return;
      }

      setLoading(true);
      try {
        await onChangePassword(currentPassword, newPassword);
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setSuccess(false);
          setOpen(false);
        }, 2000);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'فشل في تغيير كلمة المرور';
        if (message === 'كلمة المرور الحالية غير صحيحة') {
          setFieldErrors({ currentPassword: message });
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
      }
    },
    [currentPassword, newPassword, confirmPassword, email, onChangePassword, clearMessages],
  );

  const canSubmit =
    currentPassword.length > 0 &&
    allStructuralRequirementsMet &&
    (score === null || score >= 3) &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;

  if (!open) {
    return (
      <div className={styles.collapsed}>
        <Button variant="secondary" size="md" onClick={handleOpen}>
          تغيير كلمة المرور
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* Current password */}
      <div className={styles.fieldRow}>
        <label htmlFor="current-password" className={styles.label}>
          كلمة المرور الحالية
        </label>
        <input
          id="current-password"
          type="password"
          className={`${styles.input} ${fieldErrors.currentPassword ? styles.inputError : ''}`}
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            clearMessages();
          }}
          placeholder="أدخل كلمة المرور الحالية"
          maxLength={256}
          disabled={loading}
          autoComplete="current-password"
          autoFocus
        />
        {fieldErrors.currentPassword && (
          <span className={styles.fieldError}>{fieldErrors.currentPassword}</span>
        )}
      </div>

      <div className={styles.divider} />

      {/* New password */}
      <div className={styles.fieldRow}>
        <label htmlFor="new-password" className={styles.label}>
          كلمة المرور الجديدة
        </label>
        <input
          id="new-password"
          type="password"
          className={`${styles.input} ${fieldErrors.newPassword ? styles.inputError : ''}`}
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            clearMessages();
          }}
          placeholder="٨ أحرف على الأقل"
          maxLength={256}
          disabled={loading}
          autoComplete="new-password"
        />
        {fieldErrors.newPassword && (
          <span className={styles.fieldError}>{fieldErrors.newPassword}</span>
        )}

        {/* Password strength requirements */}
        {newPassword.length > 0 && (
          <>
            <RequirementsList requirements={requirements} />
            <StrengthMeter
              score={score}
              label={label}
              feedback={feedback}
            />
          </>
        )}
      </div>

      {/* Confirm password */}
      <div className={styles.fieldRow}>
        <label htmlFor="confirm-password" className={styles.label}>
          تأكيد كلمة المرور الجديدة
        </label>
        <input
          id="confirm-password"
          type="password"
          className={`${styles.input} ${fieldErrors.confirmPassword ? styles.inputError : ''}`}
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            clearMessages();
          }}
          placeholder="أعد إدخال كلمة المرور الجديدة"
          maxLength={256}
          disabled={loading}
          autoComplete="new-password"
        />
        {fieldErrors.confirmPassword && (
          <span className={styles.fieldError}>{fieldErrors.confirmPassword}</span>
        )}
      </div>

      {error && <span className={styles.errorText}>{error}</span>}
      {success && <span className={styles.successText}>تم تغيير كلمة المرور بنجاح</span>}

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="md"
          type="submit"
          loading={loading}
          disabled={!canSubmit || loading}
        >
          حفظ كلمة المرور
        </Button>
        <Button
          variant="ghost"
          size="md"
          type="button"
          onClick={handleCancel}
          disabled={loading}
        >
          إلغاء
        </Button>
      </div>
    </form>
  );
}
