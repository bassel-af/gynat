'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { setCollectionsEnabled } from '@/lib/collections/api';
import styles from './EnableCollectionsSetting.module.css';

interface EnableCollectionsSettingProps {
  slug: string;
  workspaceId: string;
  isAdmin: boolean;
  enabled: boolean;
  /** Lets the parent keep its workspace state in sync after a successful toggle. */
  onChange?: (enabled: boolean) => void;
}

/**
 * Screen 1 — the per-workspace "enable collections" toggle (§2.9), off by
 * default. When on, it reveals the two new areas (trees + collections). Backed
 * by PATCH /api/workspaces/[id] { enableCollections } (admin only).
 */
export function EnableCollectionsSetting({
  slug,
  workspaceId,
  isAdmin,
  enabled,
  onChange,
}: EnableCollectionsSettingProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await setCollectionsEnabled(workspaceId, next);
      onChange?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر حفظ الإعداد');
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleSection title="المجموعات">
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.content}>
            <div className={styles.nameRow}>
              <span className={styles.name}>تفعيل المجموعات</span>
              {enabled && <span className={styles.badge}>مفعّل</span>}
            </div>
            <p className={styles.description}>
              أنشئ أشجاراً إضافية داخل المساحة، واجمعها في مجموعاتٍ تُشارَك
              كوحدةٍ واحدة. تبقى هذه الميزة مخفيّة عن العائلات التي لا تحتاجها.
            </p>
            <p className={styles.note}>
              لا يؤثّر التفعيل على شجرة عائلتك الرئيسية — تبقى كما هي.
            </p>
            {error && <p className={styles.error}>{error}</p>}
          </div>
          <ToggleSwitch
            checked={enabled}
            onChange={toggle}
            disabled={!isAdmin || busy}
            aria-label="تفعيل المجموعات"
          />
        </div>

        {enabled && (
          <div className={styles.links}>
            <Link href={`/workspaces/${slug}/trees`} className={styles.linkCard}>
              <span className={styles.linkIcon}>
                <iconify-icon
                  icon="material-symbols:forest"
                  width="22"
                  height="22"
                />
              </span>
              <span className={styles.linkText}>
                <span className={styles.linkTitle}>الأشجار</span>
                <span className={styles.linkHint}>
                  الشجرة الرئيسية والأشجار الإضافية
                </span>
              </span>
              <span className={styles.linkArrow} aria-hidden="true">
                ←
              </span>
            </Link>

            <Link
              href={`/workspaces/${slug}/collections`}
              className={styles.linkCard}
            >
              <span className={styles.linkIcon}>
                <iconify-icon
                  icon="material-symbols:collections-bookmark"
                  width="22"
                  height="22"
                />
              </span>
              <span className={styles.linkText}>
                <span className={styles.linkTitle}>المجموعات</span>
                <span className={styles.linkHint}>
                  تنظيم الأشجار والفروع في مجموعات
                </span>
              </span>
              <span className={styles.linkArrow} aria-hidden="true">
                ←
              </span>
            </Link>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
