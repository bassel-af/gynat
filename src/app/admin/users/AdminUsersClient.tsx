'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import styles from '../AdminDashboard.module.css';
import type { UserAccountsPayload } from '@/lib/admin/users';

/**
 * /admin/users client — fetches the accounts list and renders it as one
 * table. Same fail-soft contract as the dashboard sections: a query
 * failure shows an inline error, never a blank page.
 */

type PageState =
  | { status: 'loading' }
  | { status: 'ok'; data: UserAccountsPayload }
  | { status: 'error'; message: string };

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${date.toLocaleDateString('ar', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })} · ${date.toLocaleTimeString('ar', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function AdminUsersClient() {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await apiFetch('/api/admin/users');
      if (!res.ok) {
        setState({ status: 'error', message: `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as
        | UserAccountsPayload
        | { error?: string; errorType?: string };
      if ('error' in body && body.error === 'query_failed') {
        setState({
          status: 'error',
          message: `query_failed: ${body.errorType ?? 'unknown'}`,
        });
        return;
      }
      setState({ status: 'ok', data: body as UserAccountsPayload });
    } catch (err) {
      const message =
        err instanceof Error ? err.constructor.name : 'UnknownError';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>لوحة المنصة</span>
          <h1 className={styles.title}>المستخدمون</h1>
          <p className={styles.subtitle}>
            جميع الحسابات المسجّلة في المنصة: الاسم، البريد، عدد المساحات،
            وتاريخ الانضمام.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/admin" className={styles.backLink}>
            العودة إلى اللوحة
          </Link>
        </div>
      </header>

      <section className={styles.section} aria-labelledby="users-heading">
        <div className={styles.sectionHead} id="users-heading">
          <div>
            <span className={styles.sectionKicker}>الحسابات</span>
            <h2 className={styles.sectionTitle}>جميع الحسابات</h2>
          </div>
          {state.status === 'ok' ? (
            <span className={styles.sectionMeta}>
              {state.data.totalUsers} حسابًا
            </span>
          ) : null}
        </div>

        {state.status === 'loading' ? (
          <div className={styles.loading}>جارٍ التحميل…</div>
        ) : state.status === 'error' ? (
          <div className={styles.error}>
            تعذر تحميل الحسابات: {state.message}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.topTable}>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>البريد الإلكتروني</th>
                  <th style={{ textAlign: 'end' }}>المساحات</th>
                  <th>تاريخ الانضمام</th>
                  <th>آخر نشاط</th>
                </tr>
              </thead>
              <tbody>
                {state.data.users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.empty}>
                      لا توجد حسابات
                    </td>
                  </tr>
                ) : (
                  state.data.users.map((u) => (
                    <tr key={u.id}>
                      <td className={styles.colName}>
                        {u.displayName}
                        {u.isPlatformOwner ? (
                          <span
                            className={`${styles.tag} ${styles.tagGold}`}
                            style={{ marginInlineStart: '10px' }}
                          >
                            مالك المنصة
                          </span>
                        ) : null}
                      </td>
                      <td className={styles.colEmail}>
                        <span dir="ltr">{u.email}</span>
                      </td>
                      <td className={styles.colNumber}>{u.workspaceCount}</td>
                      <td className={styles.colDate}>
                        {formatDate(u.createdAt)}
                      </td>
                      <td className={styles.colDate}>
                        {formatDateTime(u.lastActiveAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
