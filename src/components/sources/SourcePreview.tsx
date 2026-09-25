'use client';

import { useEffect, useState } from 'react';
import { fetchSourcePreview, type SourceWithPeopleDto } from '@/lib/tree/source-entries-api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SourceFileThumbs } from './SourceFileThumbs';
import { SOURCE_LEVEL_LABELS } from './SourceVisibilityPicker';
import { namesSummary } from './arabicDigits';
import styles from './SourcePreview.module.css';

const LOAD_FAILED = 'تعذّر فتح المصدر';
const THUMB_SIZE = 64;

export interface SourcePreviewProps {
  workspaceId: string;
  treeId?: string;
  sourceId: string;
  /** [ربطه بهذا الشخص] — absent ⇒ read-only with [رجوع] only. */
  onLink?: (source: SourceWithPeopleDto) => void;
  /** [رجوع] / Escape. */
  onBack: () => void;
}

/**
 * «معاينة المصدر» — a read-only look at an existing source (from a typing
 * suggestion or a family hint): the full text, the files (tap → the viewer),
 * who sees it and who it is «مصدر لـ» — names as the server filtered them
 * for this viewer. A text-only source shows its text only.
 */
export function SourcePreview({ workspaceId, treeId, sourceId, onLink, onBack }: SourcePreviewProps) {
  const [source, setSource] = useState<SourceWithPeopleDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setSource(null);
    setFailed(false);
    fetchSourcePreview(workspaceId, sourceId, treeId)
      .then((s) => {
        if (live) setSource(s);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [workspaceId, treeId, sourceId]);

  const hasFiles = !!source && source.files.length > 0;

  const actions = (
    <>
      <Button variant="ghost" size="md" className={styles.action} onClick={onBack}>
        رجوع
      </Button>
      {onLink && (
        <Button
          variant="primary"
          size="md"
          className={styles.action}
          disabled={!source}
          onClick={() => source && onLink(source)}
        >
          ربطه بهذا الشخص
        </Button>
      )}
    </>
  );

  return (
    <Modal isOpen onClose={onBack} title="معاينة المصدر" actions={actions} className={styles.modal} stacked>
      <div className={styles.body}>
        <span className={styles.readOnly}>للقراءة فقط</span>
        {failed && (
          <p className={styles.error} role="alert">
            {LOAD_FAILED}
          </p>
        )}
        {!source && !failed && <span className={styles.loading} role="status" aria-label="جاري التحميل" />}
        {source && (
          <>
            {source.text && (
              <p className={styles.text} dir="auto">
                {source.text}
              </p>
            )}
            {hasFiles && (
              <>
                <SourceFileThumbs
                  workspaceId={workspaceId}
                  treeId={treeId}
                  entryId={source.id}
                  files={source.files}
                  size={THUMB_SIZE}
                />
                <p className={styles.caption}>اضغط على أي صورة لفتحها في العارض بملء الشاشة.</p>
                <p className={styles.meta}>من يرى هذا المصدر: {SOURCE_LEVEL_LABELS[source.visibility]}</p>
                {source.peopleCount > 0 && (
                  <p className={styles.meta}>
                    مصدر لـ: <b>{namesSummary(source.people.map((p) => p.name), source.peopleCount)}</b>
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
