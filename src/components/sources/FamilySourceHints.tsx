'use client';

import { useState } from 'react';
import type { SourceSummaryDto } from '@/lib/tree/source-entries-api';
import { SourcePreview } from './SourcePreview';
import { EyeIcon } from './SourceIcons';
import { peopleCountLabel } from './arabicDigits';
import styles from './PersonSourcesSection.module.css';

export interface FamilySourceHintsProps {
  workspaceId: string;
  treeId?: string;
  /** The server's «مصادر أسرته» (≤ 2, editors only, only for a person with no sources). */
  hints: readonly SourceSummaryDto[];
  /** The person's sex: «مصادر أسرتها» for a woman. */
  sex?: string;
  /** «إضافة» (or [ربطه بهذا الشخص] in the preview): the sidebar saves at once, the person form stages it. */
  onAdd: (hint: SourceSummaryDto) => void;
  /** A hint being saved (its button is busy). */
  busyId?: string | null;
}

/**
 * «مصادر أسرته:» — sources of the person's household (parents, spouses,
 * siblings, children) offered to a person with none: «عرض» opens the
 * read-only preview, «إضافة» links the same source (no re-upload).
 */
export function FamilySourceHints({ workspaceId, treeId, hints, sex, onAdd, busyId = null }: FamilySourceHintsProps) {
  const [preview, setPreview] = useState<SourceSummaryDto | null>(null);
  if (hints.length === 0) return null;
  return (
    <div className={styles.hints}>
      <span className={styles.hintsTitle}>{sex === 'F' ? 'مصادر أسرتها:' : 'مصادر أسرته:'}</span>
      <ul className={styles.hintList}>
        {hints.map((hint) => (
          <li key={hint.id} className={styles.hint}>
            <span className={styles.hintText} dir="auto">
              {`${hint.text ?? ''} · مصدر لـ ${peopleCountLabel(hint.peopleCount)}`}
            </span>
            <span className={styles.hintActions}>
              <button
                type="button"
                className={styles.hintView}
                aria-label={`عرض ${hint.text ?? ''}`.trim()}
                onClick={() => setPreview(hint)}
              >
                <EyeIcon size={14} />
                عرض
              </button>
              <button
                type="button"
                className={styles.hintAdd}
                disabled={busyId === hint.id}
                onClick={() => onAdd(hint)}
              >
                إضافة
              </button>
            </span>
          </li>
        ))}
      </ul>
      {preview && (
        <SourcePreview
          workspaceId={workspaceId}
          treeId={treeId}
          sourceId={preview.id}
          onLink={() => {
            onAdd(preview);
            setPreview(null);
          }}
          onBack={() => setPreview(null)}
        />
      )}
    </div>
  );
}
