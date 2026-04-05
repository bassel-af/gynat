'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { UserNav } from '@/components/ui/UserNav/UserNav';
import { RootBackChip } from '@/components/tree/RootBackChip/RootBackChip';
import { useToast } from '@/context/ToastContext';
import { apiFetch } from '@/lib/api/client';
import styles from './CanvasToolbar.module.css';

interface CanvasToolbarProps {
  workspaceSlug: string;
  workspaceId: string;
}

export function CanvasToolbar({ workspaceSlug, workspaceId }: CanvasToolbarProps) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Close dropdown on outside click
  useEffect(() => {
    if (!isExportMenuOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsExportMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isExportMenuOpen]);

  const handleExport = useCallback(async (version: '5.5.1' | '7.0') => {
    setIsExportMenuOpen(false);
    setIsExporting(true);
    try {
      const res = await apiFetch(
        `/api/workspaces/${workspaceId}/tree/export?version=${version}`,
      );
      if (!res.ok) {
        throw new Error('Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workspaceSlug}.ged`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('تم تصدير الملف بنجاح', 'success');
    } catch {
      showToast('فشل في تصدير الملف', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [workspaceId, workspaceSlug, showToast]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.pill}>
        <Link
          href={`/workspaces/${workspaceSlug}`}
          className={styles.backLink}
          aria-label="مساحة العائلة"
        >
          <svg
            className={styles.backIcon}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 18L15 12L9 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.backLabel}>مساحة العائلة</span>
        </Link>
        <span className={styles.separator} />
        <UserNav />
        <span className={styles.separator} />
        <div className={styles.exportWrapper} ref={exportRef}>
          <button
            className={styles.exportButton}
            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
            disabled={isExporting}
            aria-label="تصدير ملف GEDCOM"
            aria-expanded={isExportMenuOpen}
            aria-haspopup="true"
            aria-busy={isExporting}
          >
            {isExporting ? (
              <span className={styles.exportSpinner} aria-hidden="true" />
            ) : (
              <svg
                className={styles.exportIcon}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 3v12M12 15l-4-4M12 15l4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <span className={styles.exportLabel}>
              {isExporting ? 'جاري التصدير...' : 'تصدير'}
            </span>
          </button>
          {isExportMenuOpen && (
            <ul className={styles.exportMenu} role="menu">
              <li
                className={styles.exportMenuItem}
                role="menuitem"
                tabIndex={0}
                onClick={() => handleExport('5.5.1')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExport('5.5.1'); } }}
              >
                <span className={styles.exportMenuItemLabel} dir="ltr">GEDCOM 5.5.1</span>
                <span className={styles.exportMenuItemSub}>متوافق مع أغلب البرامج</span>
              </li>
              <li
                className={styles.exportMenuItem}
                role="menuitem"
                tabIndex={0}
                onClick={() => handleExport('7.0')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExport('7.0'); } }}
              >
                <span className={styles.exportMenuItemLabel} dir="ltr">GEDCOM 7.0</span>
                <span className={styles.exportMenuItemSub}>الإصدار الحديث</span>
              </li>
            </ul>
          )}
        </div>
      </div>
      <RootBackChip />
    </div>
  );
}
