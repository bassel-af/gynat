'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import { translateAuthError } from '@/lib/auth/translate-error';
import { useToast } from '@/context/ToastContext';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { UserNav } from '@/components/ui/UserNav';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { AccountSettings } from '@/components/profile/AccountSettings';
import { SecuritySettings } from '@/components/profile/SecuritySettings';
import { TreeDisplaySettings } from '@/components/profile/TreeDisplaySettings';
import styles from '@/components/profile/ProfilePage.module.css';

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  calendarPreference: string;
}

export default function ProfileClient() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoutLoading, setLogoutLoading] = useState(false);
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const toastShownRef = useRef(false);

  // Show toast when returning from a successful email change
  useEffect(() => {
    if (toastShownRef.current) return;
    if (searchParams.get('email_changed') === 'true') {
      toastShownRef.current = true;
      showToast('تم تغيير بريدك الإلكتروني بنجاح', 'success');
      // Clean up the URL param without a full page reload
      window.history.replaceState({}, '', '/profile');
    }
  }, [searchParams, showToast]);

  useEffect(() => {
    async function fetchProfile() {
      try {
        // If returning from an email change, sync GoTrue user -> public.users first
        // so the profile reflects the new email address.
        if (searchParams.get('email_changed') === 'true') {
          console.log('[profile] email_changed=true, syncing user before fetch');
          try {
            const syncRes = await apiFetch('/api/auth/sync-user', { method: 'POST' });
            console.log('[profile] sync-user response:', syncRes.status);
          } catch (e) {
            console.warn('[profile] sync-user failed (non-blocking):', e);
          }
        }

        const res = await apiFetch('/api/users/me');
        if (!res.ok) {
          const body = await res.json();
          setError(body.error || 'فشل في تحميل الملف الشخصي');
          return;
        }
        const body = await res.json();
        console.log('[profile] Fetched profile, email:', body.data?.email);
        setProfile(body.data);
      } catch {
        setError('فشل في تحميل الملف الشخصي');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [searchParams]);

  const handleSaveName = useCallback(
    async (name: string) => {
      const res = await apiFetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'فشل في حفظ الاسم');
      }
      const body = await res.json();
      setProfile((prev) => (prev ? { ...prev, displayName: body.data.displayName } : prev));
      window.dispatchEvent(
        new CustomEvent('profile:updated', {
          detail: { displayName: body.data.displayName, avatarUrl: body.data.avatarUrl },
        }),
      );
    },
    [],
  );

  const handleSaveEmail = useCallback(async (newEmail: string) => {
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    );
    if (err) {
      throw new Error(translateAuthError(err.message));
    }
  }, []);

  const handleChangePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const supabase = createClient();

    // Verify current password first
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: profile!.email,
      password: currentPassword,
    });
    if (signInErr) {
      throw new Error('كلمة المرور الحالية غير صحيحة');
    }

    // Current password is correct — update to new password
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) {
      throw new Error(translateAuthError(updateErr.message));
    }
  }, [profile]);

  const handleLogout = useCallback(async () => {
    setLogoutLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }, []);

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" label="جاري التحميل..." />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className={styles.container}>
        <header className={styles.header}>
          <Link href="/workspaces" className={styles.backLink}>
            &rarr; مساحات العمل
          </Link>
        </header>
        <div className={styles.content}>
          <div className={styles.errorMessage}>{error || 'حدث خطأ'}</div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>الملف الشخصي</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <UserNav />
          <Link href="/workspaces" className={styles.backLink}>
            &rarr; مساحات العمل
          </Link>
        </div>
      </header>

      <div className={styles.content}>
        {/* Profile header — avatar + name + email */}
        <div className={styles.section}>
          <ProfileHeader
            displayName={profile.displayName}
            email={profile.email}
            avatarUrl={profile.avatarUrl}
          />
        </div>

        {/* Account settings — name & email */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}>
              <iconify-icon icon="material-symbols:person-outline" width="18" height="18" />
            </span>
            <h3 className={styles.sectionTitle}>إعدادات الحساب</h3>
          </div>
          <div className={styles.sectionBody}>
            <AccountSettings
              displayName={profile.displayName}
              email={profile.email}
              onSaveName={handleSaveName}
              onSaveEmail={handleSaveEmail}
            />
          </div>
        </div>

        {/* Security — password change */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}>
              <iconify-icon icon="material-symbols:lock-outline" width="18" height="18" />
            </span>
            <h3 className={styles.sectionTitle}>الأمان</h3>
          </div>
          <div className={styles.sectionBody}>
            <SecuritySettings email={profile.email} onChangePassword={handleChangePassword} />
          </div>
        </div>

        {/* Tree display settings — color pickers */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}>
              <iconify-icon icon="material-symbols:palette-outline" width="18" height="18" />
            </span>
            <h3 className={styles.sectionTitle}>إعدادات شجرة العائلة</h3>
          </div>
          <div className={styles.sectionBody}>
            <TreeDisplaySettings />
          </div>
        </div>

        {/* Danger zone — logout */}
        <div className={styles.section} style={{ borderColor: 'rgba(229, 62, 62, 0.15)' }}>
          <div className={styles.sectionHeader} style={{ borderBottomColor: 'rgba(229, 62, 62, 0.08)' }}>
            <span className={styles.sectionIcon} style={{ color: '#fc8181' }}>
              <iconify-icon icon="material-symbols:logout" width="18" height="18" />
            </span>
            <h3 className={styles.sectionTitle} style={{ color: '#f0b98b' }}>تسجيل الخروج</h3>
          </div>
          <div className={styles.sectionBody}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(232, 223, 200, 0.5)', lineHeight: '1.6' }}>
                سيتم تسجيل خروجك من جميع مساحات العائلة على هذا الجهاز
              </span>
              <Button
                variant="danger"
                size="md"
                onClick={handleLogout}
                loading={logoutLoading}
                disabled={logoutLoading}
              >
                تسجيل الخروج
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
