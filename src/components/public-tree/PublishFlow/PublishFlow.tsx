'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { HeritageOverlay } from '../HeritageOverlay';
import { VisibilityLadder, type VisibilityLevel } from '../VisibilityLadder';
import { PublishCheckpoint, type PublishCheckpointData } from '../PublishCheckpoint';
import { PublishSuccess } from '../PublishSuccess';
import { MakePrivateDialog } from '../MakePrivateDialog';
import { ManagePublicPanel } from '../ManagePublicPanel';
import styles from './PublishFlow.module.css';

export interface PublishFlowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Family / tree display name — used as the type-to-confirm phrase. */
  familyName: string;
  /** The tree's current visibility (static in this phase). */
  currentLevel: VisibilityLevel;
  /** Living-people view model for the checkpoint (static fixture for now). */
  checkpointData: PublishCheckpointData;
  /** The shareable link shown on success (a fake value in the static flow). */
  shareUrl: string;
  /**
   * Real publish action. When provided, going-public is persisted by calling
   * this with the chosen level (and the typed confirmation phrase, already
   * validated client-side). Resolve to advance to success; reject to surface
   * an error and stay on the checkpoint. When omitted, publishing is faked
   * (static demo).
   */
  onPublishConfirm?: (level: Exclude<VisibilityLevel, 'private'>, confirmationPhrase: string) => Promise<void>;
  /**
   * Real visibility change for an ALREADY-public tree (link↔search). Distinct
   * from `onPublishConfirm` and takes NO confirmation phrase — switching levels
   * while already public never re-confirms (the server skips the phrase check on
   * public→public). The link↔search escalation's irreversibility acknowledge is
   * a client-side UX gate only. When omitted, the change is faked (static demo).
   */
  onChangeVisibility?: (level: Exclude<VisibilityLevel, 'private'>) => Promise<void>;
  /** Real make-private action. When omitted, the dialog just closes (static demo). */
  onMakePrivateConfirm?: () => Promise<void>;
  /** Where the make-private dialog's "request permanent removal" link points. */
  reportHref?: string;
}

type Step = 'manage' | 'choose' | 'checkpoint' | 'success' | 'makePrivate';

/** Already-public trees open to the manage panel; private trees to the chooser. */
function initialStep(level: VisibilityLevel): Step {
  return level === 'private' ? 'choose' : 'manage';
}

/**
 * Orchestrates the static, clickable share journey on the real tree page:
 *
 *   choose visibility → (more public) review living people → type-to-confirm → success+link
 *   choose private    → (currently public) make-private dialog
 *
 * Step transitions are local UI state — NOT business logic. Nothing is
 * persisted; publishing is faked. The components do the real work; this only
 * sequences them.
 */
export function PublishFlow({
  isOpen,
  onClose,
  familyName,
  currentLevel,
  checkpointData,
  shareUrl,
  onPublishConfirm,
  onChangeVisibility,
  onMakePrivateConfirm,
  reportHref,
}: PublishFlowProps) {
  const [step, setStep] = useState<Step>(() => initialStep(currentLevel));
  // The level the admin is selecting in the ladder (starts at current).
  const [pendingLevel, setPendingLevel] = useState<VisibilityLevel>(currentLevel);
  // The level actually "published" at, for the success copy.
  const [publishedLevel, setPublishedLevel] = useState<Exclude<VisibilityLevel, 'private'>>('link');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reset to the first step whenever the flow is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setStep(initialStep(currentLevel));
      setPendingLevel(currentLevel);
      setActionError(null);
      setBusy(false);
    }
  }, [isOpen, currentLevel]);

  if (!isOpen) return null;

  // Going from the ladder's "متابعة": decide the next step from the chosen level.
  const handleContinue = () => {
    if (pendingLevel === 'private') {
      // Choosing private while currently public → confirm via make-private.
      if (currentLevel !== 'private') {
        setStep('makePrivate');
      } else {
        onClose(); // already private, nothing to do
      }
      return;
    }
    // Going public (link or search) → the publish review checkpoint.
    setStep('checkpoint');
  };

  // Run a persisted action with shared busy/error handling. Returns true on
  // success (or when no callback is wired — the static demo), false if the
  // action threw (error surfaced, caller should NOT advance).
  const runAction = async (
    cb: (() => Promise<void>) | undefined,
    fallbackMsg: string,
  ): Promise<boolean> => {
    if (!cb) return true; // static demo: nothing to persist
    setBusy(true);
    setActionError(null);
    try {
      await cb();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : fallbackMsg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handlePublished = async () => {
    const level: Exclude<VisibilityLevel, 'private'> = pendingLevel === 'search' ? 'search' : 'link';
    const ok = await runAction(
      onPublishConfirm && (() => onPublishConfirm(level, familyName)),
      'تعذر نشر الشجرة',
    );
    if (!ok) return; // stay on checkpoint
    setPublishedLevel(level);
    setStep('success');
  };

  const handleMakePrivate = async () => {
    const ok = await runAction(onMakePrivateConfirm, 'تعذر جعل الشجرة خاصة');
    if (!ok) return;
    onClose();
  };

  // From the manage panel: apply a visibility change for an ALREADY-public tree.
  // Uses the no-phrase visibility endpoint, NOT the fresh-publish callback.
  // (Escalation's irreversibility acknowledge was a client-side UX gate; the
  // server does not re-confirm public→public.) Escalation publishes straight to
  // success with no re-review; a downgrade applies silently and confirms too.
  const applyManageChange = async (level: Exclude<VisibilityLevel, 'private'>) => {
    const ok = await runAction(
      onChangeVisibility && (() => onChangeVisibility(level)),
      'تعذر تحديث الإعدادات',
    );
    if (!ok) return;
    setPendingLevel(level);
    setPublishedLevel(level);
    setStep('success');
  };

  // The manage panel, checkpoint, and make-private dialog render their own
  // overlays/panels, so for those steps we delegate entirely.
  if (step === 'manage' && currentLevel !== 'private') {
    return (
      <HeritageOverlay isOpen={isOpen} onClose={onClose} align="top">
        <ManagePublicPanel
          currentLevel={currentLevel as Exclude<VisibilityLevel, 'private'>}
          shareUrl={shareUrl}
          onChangeLevel={(level) => applyManageChange(level)}
          onEscalateToSearch={() => applyManageChange('search')}
          onGoPrivate={() => setStep('makePrivate')}
          onClose={onClose}
        />
      </HeritageOverlay>
    );
  }

  if (step === 'checkpoint') {
    return (
      <PublishCheckpoint
        isOpen
        data={checkpointData}
        confirmPhrase={familyName}
        showIrreversible={pendingLevel === 'search'}
        loading={busy}
        onClose={() => setStep('choose')}
        onPublish={handlePublished}
      />
    );
  }

  if (step === 'makePrivate') {
    return (
      <MakePrivateDialog
        isOpen
        onClose={() => setStep(initialStep(currentLevel))}
        onConfirm={handleMakePrivate}
        reportHref={reportHref}
      />
    );
  }

  // 'choose' and 'success' share a centered glass panel.
  return (
    <HeritageOverlay isOpen={isOpen} onClose={onClose} align="top">
      <div
        className={clsx(styles.panel, { [styles.panelWide]: step === 'choose' })}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {step === 'success' && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {step === 'choose' && (
          <>
            <VisibilityLadder
              level={pendingLevel}
              onLevelChange={setPendingLevel}
              allowReuse={false}
              className={styles.ladder}
            />
            {actionError && (
              <p role="alert" style={{ color: '#c0564b', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                {actionError}
              </p>
            )}
            <div className={styles.choiceActions}>
              <button type="button" className={styles.continueBtn} onClick={handleContinue}>
                متابعة
              </button>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>
                إلغاء
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <PublishSuccess
            level={publishedLevel}
            shareUrl={shareUrl}
            onDone={onClose}
          />
        )}
      </div>
    </HeritageOverlay>
  );
}
