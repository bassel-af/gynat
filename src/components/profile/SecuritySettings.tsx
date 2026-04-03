'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './SecuritySettings.module.css';

interface SecuritySettingsProps {
  onChangePassword: (newPassword: string) => Promise<void>;
}

export function SecuritySettings({ onChangePassword }: SecuritySettingsProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError('');
      setSuccess(false);

      if (newPassword.length < 6) {
        setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
      }

      if (newPassword !== confirmPassword) {
        setError('كلمتا المرور غير متطابقتين');
        return;
      }

      setLoading(true);
      try {
        await onChangePassword(newPassword);
        setSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'فشل في تغيير كلمة المرور');
      } finally {
        setLoading(false);
      }
    },
    [newPassword, confirmPassword, onChangePassword],
  );

  const canSubmit = newPassword.length >= 6 && confirmPassword.length > 0;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.passwordGrid}>
        <div className={styles.fieldRow}>
          <label htmlFor="new-password" className={styles.label}>
            كلمة المرور الجديدة
          </label>
          <input
            id="new-password"
            type="password"
            className={`${styles.input} ${error && newPassword.length > 0 && newPassword.length < 6 ? styles.inputError : ''}`}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError('');
              setSuccess(false);
            }}
            placeholder="6 أحرف على الأقل"
            minLength={6}
            disabled={loading}
            autoComplete="new-password"
          />
        </div>

        <div className={styles.fieldRow}>
          <label htmlFor="confirm-password" className={styles.label}>
            تأكيد كلمة المرور
          </label>
          <input
            id="confirm-password"
            type="password"
            className={`${styles.input} ${error && confirmPassword.length > 0 && newPassword !== confirmPassword ? styles.inputError : ''}`}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError('');
              setSuccess(false);
            }}
            placeholder="أعد إدخال كلمة المرور"
            disabled={loading}
            autoComplete="new-password"
          />
        </div>
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
          تغيير كلمة المرور
        </Button>
      </div>
    </form>
  );
}
