'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import styles from './UserNav.module.css';

interface UserProfile {
  displayName: string;
  avatarUrl: string | null;
}

export function UserNav() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, setFetchFailed] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await apiFetch('/api/users/me');
        if (res.ok) {
          const body = await res.json();
          setProfile({
            displayName: body.data.displayName,
            avatarUrl: body.data.avatarUrl,
          });
        } else {
          setFetchFailed(true);
        }
      } catch {
        setFetchFailed(true);
      } finally {
        setLoaded(true);
      }
    }
    fetchProfile();

    function handleProfileUpdated(e: Event) {
      const detail = (e as CustomEvent<{ displayName?: string; avatarUrl?: string | null }>).detail;
      if (!detail) return;
      setProfile((prev) => ({
        displayName: detail.displayName ?? prev?.displayName ?? '',
        avatarUrl: detail.avatarUrl !== undefined ? detail.avatarUrl : prev?.avatarUrl ?? null,
      }));
    }
    window.addEventListener('profile:updated', handleProfileUpdated);
    return () => window.removeEventListener('profile:updated', handleProfileUpdated);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  if (!loaded) return null;

  return (
    <div className={styles.userNav}>
      {profile && (
        <Link href="/profile" className={styles.profileLink} title="الملف الشخصي">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className={styles.profileAvatar}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className={styles.profileAvatarFallback}>
              {(profile.displayName || '?').charAt(0).toUpperCase()}
            </span>
          )}
          <span className={styles.profileName}>{profile.displayName}</span>
        </Link>
      )}
      <button
        onClick={handleLogout}
        className={styles.logoutButton}
        aria-label="تسجيل الخروج"
      >
        <svg
          className={styles.logoutIcon}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 17l-5-5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M15 12H5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.logoutTooltip} role="tooltip" aria-hidden="true">
          تسجيل الخروج
        </span>
      </button>
    </div>
  );
}
