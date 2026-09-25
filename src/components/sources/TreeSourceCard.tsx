'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchTreeEntry, deleteTreeEntry, type SourceEntryDto } from '@/lib/tree/source-entries-api';
import { notifySourcesChanged } from '@/hooks/usePersonSources';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SourceEntryForm } from './SourceEntryForm';
import { SourceFileThumbs } from './SourceFileThumbs';
import { SourceLevelBadge } from './SourceLevelBadge';
import styles from './SourcesAdmin.module.css';

export interface TreeSourceCardProps {
  workspaceId: string;
  /** Target tree; absent ⇒ the workspace main tree. */
  treeId?: string;
}

/**
 * «مصدر الشجرة» — the one tree-wide entry (admins only). It shows on every
 * person who has no entry of their own visible to the viewer.
 */
export function TreeSourceCard({ workspaceId, treeId }: TreeSourceCardProps) {
  const { showToast } = useToast();
  const [entry, setEntry] = useState<SourceEntryDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntry(await fetchTreeEntry(workspaceId, treeId));
    } catch {
      setEntry(null);
    } finally {
      setLoaded(true);
    }
  }, [workspaceId, treeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deleteTreeEntry(workspaceId, treeId);
      setEntry(null);
      setConfirmRemove(false);
      notifySourcesChanged();
      showToast('تمت إزالة مصدر الشجرة', 'success');
    } catch {
      showToast('تعذّرت إزالة مصدر الشجرة', 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className={styles.treeCard} aria-labelledby="tree-source-title">
      <h2 id="tree-source-title" className={styles.treeCardTitle}>
        مصدر الشجرة
      </h2>

      {!loaded ? null : entry ? (
        <div className={styles.treeCardBody}>
          {entry.text && (
            <p className={styles.treeCardText} dir="auto">
              {entry.text}
            </p>
          )}
          <SourceFileThumbs workspaceId={workspaceId} treeId={treeId} entryId={entry.id} files={entry.files} size={44} />
          <div className={styles.treeCardFooter}>
            <SourceLevelBadge level={entry.visibility} />
            <div className={styles.treeCardActions}>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                تعديل
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                إزالة
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.treeCardEmpty}>
          <p className={styles.treeCardHint}>يظهر عند كل شخص ليس له مصدر خاص</p>
          <Button variant="secondary" size="md" onClick={() => setEditing(true)}>
            إضافة مصدر للشجرة
          </Button>
        </div>
      )}

      {editing && (
        <SourceEntryForm
          mode={entry ? 'edit' : 'create'}
          treeWide
          workspaceId={workspaceId}
          treeId={treeId}
          entry={entry ?? undefined}
          isAdmin
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEntry(saved);
            notifySourcesChanged();
          }}
        />
      )}

      <Modal
        isOpen={confirmRemove}
        onClose={() => (removing ? undefined : setConfirmRemove(false))}
        title="إزالة مصدر الشجرة"
        actions={
          <>
            <Button variant="ghost" size="md" onClick={() => setConfirmRemove(false)} disabled={removing}>
              إلغاء
            </Button>
            <Button variant="danger" size="md" loading={removing} onClick={() => void handleRemove()}>
              إزالة
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>سيُحذف مصدر الشجرة مع ملفاته، ولا يمكن التراجع.</p>
      </Modal>
    </section>
  );
}
