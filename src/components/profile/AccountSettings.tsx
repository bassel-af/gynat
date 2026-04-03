'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './AccountSettings.module.css';

interface AccountSettingsProps {
  displayName: string;
  email: string;
  onSaveName: (name: string) => Promise<void>;
  onSaveEmail: (email: string) => Promise<void>;
}

export function AccountSettings({
  displayName,
  email,
  onSaveName,
  onSaveEmail,
}: AccountSettingsProps) {
  const [name, setName] = useState(displayName);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  // When non-empty, the dual-confirmation notice is shown instead of the form
  const [pendingEmail, setPendingEmail] = useState('');

  const handleSaveName = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) {
        setNameError('الاسم مطلوب');
        return;
      }
      if (trimmed === displayName) return;

      setNameLoading(true);
      setNameError('');
      setNameSuccess(false);
      try {
        await onSaveName(trimmed);
        setNameSuccess(true);
        setTimeout(() => setNameSuccess(false), 3000);
      } catch (err) {
        setNameError(err instanceof Error ? err.message : 'فشل في حفظ الاسم');
      } finally {
        setNameLoading(false);
      }
    },
    [name, displayName, onSaveName],
  );

  const handleSaveEmail = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = newEmail.trim();
      if (!trimmed) {
        setEmailError('البريد الإلكتروني مطلوب');
        return;
      }

      setEmailLoading(true);
      setEmailError('');
      try {
        await onSaveEmail(trimmed);
        setPendingEmail(trimmed);
        setNewEmail('');
      } catch (err) {
        setEmailError(err instanceof Error ? err.message : 'فشل في تحديث البريد الإلكتروني');
      } finally {
        setEmailLoading(false);
      }
    },
    [newEmail, onSaveEmail],
  );

  const nameChanged = name.trim() !== displayName;

  return (
    <div className={styles.form}>
      {/* Display Name */}
      <form onSubmit={handleSaveName}>
        <div className={styles.fieldRow}>
          <label htmlFor="profile-name" className={styles.label}>
            الاسم
          </label>
          <div className={styles.inputRow}>
            <input
              id="profile-name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError('');
                setNameSuccess(false);
              }}
              maxLength={100}
              placeholder="أدخل اسمك"
              disabled={nameLoading}
              autoComplete="name"
            />
            <Button
              variant="primary"
              size="md"
              type="submit"
              loading={nameLoading}
              disabled={!nameChanged || nameLoading}
              className={styles.saveButton}
            >
              حفظ
            </Button>
          </div>
          {nameError && <span className={styles.fieldError}>{nameError}</span>}
          {nameSuccess && <span className={styles.fieldSuccess}>تم التحديث بنجاح</span>}
        </div>
      </form>

      <hr className={styles.divider} />

      {/* Email */}
      {pendingEmail ? (
        <div className={styles.confirmationCard} role="status" aria-live="polite">
          <div className={styles.confirmationIcon} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 4L12 13L2 4" />
            </svg>
          </div>

          <p className={styles.confirmationTitle}>تم إرسال رابط التأكيد</p>

          <p className={styles.confirmationDescription}>
            يجب الضغط على الرابط في <strong>كلا الرسالتين</strong> لإتمام تغيير البريد الإلكتروني:
          </p>

          <div className={styles.emailList}>
            <div className={styles.emailListItem}>
              <span className={styles.emailBadge}>الحالي</span>
              <span className={styles.emailAddress}>{email}</span>
            </div>
            <div className={styles.emailListItem}>
              <span className={`${styles.emailBadge} ${styles.emailBadgeNew}`}>الجديد</span>
              <span className={styles.emailAddress}>{pendingEmail}</span>
            </div>
          </div>

          <p className={styles.confirmationHint}>
            تحقق من صندوق الوارد (ومجلد الرسائل غير المرغوب فيها) لكلا البريدين
          </p>

          <button
            type="button"
            className={styles.dismissLink}
            onClick={() => setPendingEmail('')}
          >
            تغيير بريد آخر
          </button>
        </div>
      ) : (
        <form onSubmit={handleSaveEmail}>
          <div className={styles.fieldRow}>
            <label htmlFor="profile-email" className={styles.label}>
              البريد الإلكتروني
            </label>
            <div className={styles.emailDisplay}>{email}</div>
            <div className={styles.inputRow}>
              <input
                id="profile-email"
                type="email"
                className={styles.input}
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailError('');
                }}
                placeholder="بريد إلكتروني جديد"
                dir="ltr"
                disabled={emailLoading}
                autoComplete="email"
              />
              <Button
                variant="secondary"
                size="md"
                type="submit"
                loading={emailLoading}
                disabled={!newEmail.trim() || emailLoading}
                className={styles.saveButton}
              >
                تغيير
              </Button>
            </div>
            <span className={styles.emailHint}>
              سيتم إرسال رابط تأكيد إلى البريد الحالي والجديد
            </span>
            {emailError && <span className={styles.fieldError}>{emailError}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
