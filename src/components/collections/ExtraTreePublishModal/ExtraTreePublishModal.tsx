'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { VisibilityLadder } from '@/components/public-tree/VisibilityLadder';
import { setTreeVisibility, type Visibility } from '@/lib/collections/api';
import modal from '../shared-modal.module.css';

interface ExtraTreePublishModalProps {
  workspaceId: string;
  treeId: string;
  /** The extra tree's name — both the display label AND the type-to-confirm
   *  phrase the server validates against when going public. */
  treeName: string;
  currentLevel: Visibility;
  onClose: () => void;
  /** Called after a successful change with the new level (so the list updates). */
  onChanged: (level: Visibility) => void;
}

/**
 * The make-public ladder for a single EXTRA tree (Slice B). Reuses the same
 * `VisibilityLadder` and the same visibility route as the main tree, scoped to
 * `treeId`. Going public (private → link/search) requires typing the tree's own
 * name — the same confirmation-phrase gate the server enforces. An already-public
 * tree switches levels with no phrase (the server skips the check public→public).
 */
export function ExtraTreePublishModal({
  workspaceId,
  treeId,
  treeName,
  currentLevel,
  onClose,
  onChanged,
}: ExtraTreePublishModalProps) {
  const [level, setLevel] = useState<Visibility>(currentLevel);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Going public for the first time (currently private, choosing a public level)
  // is the only transition that needs the typed confirmation phrase.
  const goingPublic = currentLevel === 'private' && level !== 'private';
  const changed = level !== currentLevel;
  const phraseOk = !goingPublic || phrase.trim().length > 0;

  async function commit() {
    if (!changed || busy) return;
    setBusy(true);
    setError('');
    try {
      await setTreeVisibility(workspaceId, treeId, {
        level,
        confirmationPhrase: goingPublic ? phrase.trim() : undefined,
      });
      onChanged(level);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تحديث مستوى الظهور');
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={() => !busy && onClose()}
      title="ظهور الشجرة"
      actions={
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={commit}
            disabled={!changed || !phraseOk || busy}
            loading={busy}
          >
            حفظ
          </Button>
        </>
      }
    >
      <VisibilityLadder
        level={level}
        onLevelChange={setLevel}
        allowReuse={false}
      />

      {goingPublic && (
        <div style={{ marginTop: '1rem' }}>
          <label className={modal.fieldLabel}>
            اكتب اسم الشجرة للتأكيد: «{treeName}»
          </label>
          <input
            type="text"
            className={modal.input}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={treeName}
            aria-label="عبارة التأكيد"
            autoFocus
          />
        </div>
      )}

      {error && <p className={modal.errorText}>{error}</p>}
    </Modal>
  );
}
