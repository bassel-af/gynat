'use client';

import { useState, useMemo, useCallback, type FormEvent } from 'react';
import { passwordChangeSchema } from '@/lib/profile/validation';
import { Button } from '@/components/ui/Button';
import styles from './SecuritySettings.module.css';

interface SecuritySettingsProps {
  email: string;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

interface PasswordRequirement {
  label: string;
  met: boolean;
}

function usePasswordStrength(password: string): PasswordRequirement[] {
  return useMemo(() => [
    { label: '٨ أحرف على الأقل', met: password.length >= 8 },
    { label: 'حرف صغير واحد على الأقل', met: /[a-z\u0600-\u06FF]/.test(password) },
    { label: 'حرف كبير واحد على الأقل (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'رقم واحد على الأقل', met: /\d/.test(password) },
  ], [password]);
}

export function SecuritySettings({ email: _email, onChangePassword }: SecuritySettingsProps) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const requirements = usePasswordStrength(newPassword);
  const allRequirementsMet = requirements.every((r) => r.met);

  const clearMessages = useCallback(() => {
    setError('');
    setFieldErrors({});
    setSuccess(false);
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
    [currentPassword, newPassword, confirmPassword, onChangePassword, clearMessages],
  );

  const canSubmit =
    currentPassword.length > 0 &&
    allRequirementsMet &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;

  if (!open) {
    return (
      <div className={styles.collapsed}>
        <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
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
          <ul className={styles.requirements}>
            {requirements.map((req) => (
              <li
                key={req.label}
                className={`${styles.requirement} ${req.met ? styles.requirementMet : styles.requirementUnmet}`}
              >
                <span className={styles.requirementIcon}>
                  {req.met ? '\u2713' : '\u2717'}
                </span>
                {req.label}
              </li>
            ))}
          </ul>
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
