'use client';

import styles from './ProfileHeader.module.css';

interface ProfileHeaderProps {
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export function ProfileHeader({ displayName, email, avatarUrl }: ProfileHeaderProps) {
  const initial = (displayName || email || '?').charAt(0).toUpperCase();

  return (
    <div className={styles.wrapper}>
      <div className={styles.avatarContainer}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName || 'صورة المستخدم'}
            className={styles.avatarImage}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={styles.avatar} aria-label={`صورة ${displayName}`}>
            {initial}
          </div>
        )}
      </div>

      <div className={styles.info}>
        <h2 className={styles.name}>{displayName || 'بدون اسم'}</h2>
        <span className={styles.email}>{email}</span>
      </div>
    </div>
  );
}
