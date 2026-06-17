'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { VisibilityChip } from '@/components/collections/CollectionBadges/CollectionBadges';
import {
  listExtraTrees,
  listCollections,
  addItem,
  collectionUsedSourceIds,
  SOURCE_LABEL,
  type AddItemBody,
  type CollectionItem,
  type ItemLinkMode,
  type ItemSourceLabel,
  type Visibility,
} from '@/lib/collections/api';
import modal from '../shared-modal.module.css';
import styles from './AddItemFlow.module.css';

interface AddItemFlowProps {
  workspaceId: string;
  /** Used to label the main tree, whose row carries a null nameAr. */
  workspaceName: string;
  collectionId: string;
  /** The collection we're adding into — used to block nesting it inside itself. */
  currentCollectionId: string;
  /** The items already in this collection — used to block re-adding a source. */
  existingItems: CollectionItem[];
  onClose: () => void;
  /** Called after a successful POST so the parent can refetch the detail. */
  onAdded: () => void;
}

/** A pickable source — a tree (treeId), a collection (childCollectionId), or a
 *  pasted link/token (linkInput, Slice B). */
interface SourceOption {
  key: string;
  nameAr: string;
  source: ItemSourceLabel;
  visibility: Visibility;
  peopleCount?: number;
  /** Set when this option is a tree already in this workspace. */
  treeId?: string;
  /** Set when this option is a collection (nesting). */
  collectionId?: string;
  /** Set when this option is a pasted public link / share token (§2.5, Slice B). */
  linkInput?: string;
  /** Blocked because it would create a loop (§2.4). */
  blocked?: boolean;
  blockedReason?: string;
}

/** Where the user is sourcing from: already-here, or pasted from outside (§2.5). */
type Origin = 'mine' | 'link';
type Step = 'pick' | 'mode' | 'details';

/**
 * Screen 5 — the add-item flow (§2.5). Chunk 1 wires the "من مساحتي" path only:
 * trees already inside this workspace (the main tree + extra trees) plus other
 * collections to nest (§2.4). The "عبر رابط" path (bringing a tree/branch from
 * another family) is Chunk 2 — shown here in a calm coming-soon state.
 *
 * Loop prevention (§2.4): the collection being edited appears as a blocked
 * choice rather than being hidden, so the rule is visible. The server is the
 * authority — a deeper cycle returns 409 and surfaces inline.
 */
export function AddItemFlow({
  workspaceId,
  workspaceName,
  collectionId,
  currentCollectionId,
  existingItems,
  onClose,
  onAdded,
}: AddItemFlowProps) {
  const [step, setStep] = useState<Step>('pick');
  const [origin, setOrigin] = useState<Origin>('mine');
  const [picked, setPicked] = useState<SourceOption | null>(null);
  const [linkMode, setLinkMode] = useState<ItemLinkMode>('linked');
  const [linkValue, setLinkValue] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [treeOptions, setTreeOptions] = useState<SourceOption[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<SourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Source ids already in this collection — a tree's id or a nested id. Used to
  // mark a source blocked in the picker (the server is still the 409 authority).
  // Keyed by a stable join so the loader effect doesn't re-run on prop identity.
  const usedSourceIds = collectionUsedSourceIds(existingItems);
  const usedKey = [...usedSourceIds].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [trees, collections] = await Promise.all([
          listExtraTrees(workspaceId),
          listCollections(workspaceId),
        ]);
        if (cancelled) return;
        const used = new Set(usedKey ? usedKey.split(',') : []);
        setTreeOptions(
          trees.map((t) => {
            const already = used.has(t.id);
            return {
              key: t.id,
              // The main tree row carries a null nameAr — label it from the workspace.
              nameAr: t.kind === 'main' ? workspaceName : t.nameAr,
              source: t.kind === 'main' ? 'own-main' : 'extra',
              visibility: t.visibility,
              peopleCount: t.peopleCount,
              treeId: t.id,
              blocked: already,
              blockedReason: already ? 'مضافة بالفعل' : undefined,
            };
          }),
        );
        setCollectionOptions(
          collections.map((c) => {
            const isSelf = c.id === currentCollectionId;
            const already = used.has(c.id);
            return {
              key: c.id,
              nameAr: c.titleAr,
              source: 'nested' as ItemSourceLabel,
              visibility: c.visibility,
              collectionId: c.id,
              blocked: isSelf || already,
              blockedReason: isSelf
                ? 'لا يمكن إدراج المجموعة داخل نفسها'
                : already
                  ? 'مضافة بالفعل'
                  : undefined,
            };
          }),
        );
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'تعذّر تحميل المصادر');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, workspaceName, currentCollectionId, usedKey]);

  function choose(option: SourceOption) {
    if (option.blocked) return;
    setPicked(option);
    setTitle(option.nameAr);
    setSubmitError('');
    // OWN trees (main/extra) are ALWAYS a live link — copying into the same
    // workspace is confusing, so the link/copy step is skipped and the item is
    // submitted as `linked`. Nested collections also skip it (they're
    // references, not trees). The `'mode'` step + ModeStep are PRESERVED below
    // for Chunk 2's by-link/borrowed content (the coming-soon "عبر رابط" tab),
    // where choosing link vs frozen-copy genuinely matters. In Chunk 1 every
    // pickable source is an own tree or a nested collection, so it never shows.
    setLinkMode('linked');
    setStep('details');
  }

  // Advance the "via link" path: the pasted public link / share token becomes a
  // pickable source. Unlike an own tree, link/copy genuinely matters here, so it
  // routes through the 'mode' step (ربط مباشر vs نسخة مثبّتة) before the details.
  function chooseLink() {
    const value = linkValue.trim();
    if (!value) return;
    setPicked({
      key: 'link',
      nameAr: 'عنصر عبر رابط',
      source: 'public-borrowed',
      visibility: 'private',
      linkInput: value,
    });
    setTitle('');
    setSubmitError('');
    setLinkMode('linked');
    setStep('mode');
  }

  async function commit() {
    if (!picked || !title.trim()) return;
    setBusy(true);
    setSubmitError('');
    try {
      let body: AddItemBody;
      if (picked.collectionId) {
        body = {
          kind: 'collection',
          childCollectionId: picked.collectionId,
          titleAr: title.trim(),
          descriptionAr: description.trim() || undefined,
        };
      } else if (picked.linkInput) {
        body = {
          kind: 'tree',
          linkInput: picked.linkInput,
          linkMode,
          titleAr: title.trim(),
          descriptionAr: description.trim() || undefined,
        };
      } else if (picked.treeId) {
        body = {
          kind: 'tree',
          treeId: picked.treeId,
          linkMode,
          titleAr: title.trim(),
          descriptionAr: description.trim() || undefined,
        };
      } else {
        setBusy(false);
        return;
      }
      await addItem(workspaceId, collectionId, body);
      onAdded();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'تعذّر إضافة العنصر');
      setBusy(false);
    }
  }

  const stepTitle =
    step === 'pick'
      ? 'إضافة عنصر إلى المجموعة'
      : step === 'mode'
        ? 'ربط مباشر أم نسخة؟'
        : 'العنوان والوصف';

  return (
    <Modal
      isOpen
      onClose={() => !busy && onClose()}
      title={stepTitle}
      className={styles.wide}
      actions={
        <div className={styles.footerRow}>
          <span className={styles.stepDots} aria-hidden="true">
            <span className={step === 'pick' ? styles.dotOn : styles.dot} />
            <span className={step === 'mode' ? styles.dotOn : styles.dot} />
            <span className={step === 'details' ? styles.dotOn : styles.dot} />
          </span>
          <div className={styles.footerBtns}>
            {step !== 'pick' && (
              <Button
                variant="ghost"
                size="md"
                // Own trees skip 'mode', so their 'details' steps straight back
                // to the picker. A by-link source DOES pass through 'mode', so
                // 'details' steps back to it; 'mode' itself steps back to 'pick'.
                onClick={() =>
                  setStep(
                    step === 'details' && picked?.linkInput ? 'mode' : 'pick',
                  )
                }
              >
                رجوع
              </Button>
            )}
            {step === 'details' ? (
              <Button
                variant="primary"
                size="md"
                onClick={commit}
                disabled={!title.trim() || busy}
                loading={busy}
              >
                إضافة
              </Button>
            ) : step === 'mode' ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => setStep('details')}
              >
                متابعة
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      {step === 'pick' && (
        <PickStep
          origin={origin}
          onOrigin={setOrigin}
          loading={loading}
          loadError={loadError}
          treeOptions={treeOptions}
          collectionOptions={collectionOptions}
          onChoose={choose}
          linkValue={linkValue}
          onLinkValue={setLinkValue}
          onLinkContinue={chooseLink}
        />
      )}

      {step === 'mode' && picked && (
        <ModeStep linkMode={linkMode} onChange={setLinkMode} picked={picked} />
      )}

      {step === 'details' && picked && (
        <DetailsStep
          picked={picked}
          linkMode={linkMode}
          title={title}
          description={description}
          onTitle={setTitle}
          onDescription={setDescription}
        />
      )}

      {submitError && <p className={modal.errorText}>{submitError}</p>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — pick a source (two origins via a segmented switcher)
// ---------------------------------------------------------------------------

function PickStep({
  origin,
  onOrigin,
  loading,
  loadError,
  treeOptions,
  collectionOptions,
  onChoose,
  linkValue,
  onLinkValue,
  onLinkContinue,
}: {
  origin: Origin;
  onOrigin: (o: Origin) => void;
  loading: boolean;
  loadError: string | null;
  treeOptions: SourceOption[];
  collectionOptions: SourceOption[];
  onChoose: (o: SourceOption) => void;
  linkValue: string;
  onLinkValue: (v: string) => void;
  onLinkContinue: () => void;
}) {
  return (
    <div className={styles.pickWrap}>
      {/* The placement decision: the FIRST choice is where the source lives —
          inside this workspace (a pick-list) or outside it (paste a link). */}
      <div className={styles.originTabs} role="tablist" aria-label="مصدر العنصر">
        <button
          type="button"
          role="tab"
          aria-selected={origin === 'mine'}
          className={`${styles.originTab} ${origin === 'mine' ? styles.originTabOn : ''}`}
          onClick={() => onOrigin('mine')}
        >
          <iconify-icon
            icon="material-symbols:home-storage-outline"
            width="17"
            height="17"
            aria-hidden="true"
          />
          من مساحتي
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={origin === 'link'}
          className={`${styles.originTab} ${origin === 'link' ? styles.originTabOn : ''}`}
          onClick={() => onOrigin('link')}
        >
          <iconify-icon
            icon="material-symbols:link"
            width="17"
            height="17"
            aria-hidden="true"
          />
          عبر رابط
        </button>
      </div>

      {origin === 'mine' ? (
        loading ? (
          <div className={styles.tabBody} style={{ display: 'grid', placeItems: 'center', padding: '2rem' }}>
            <Spinner size="md" label="جاري التحميل..." />
          </div>
        ) : loadError ? (
          <div className={styles.tabBody}>
            <p className={modal.errorText}>{loadError}</p>
          </div>
        ) : (
          <MineTab
            treeOptions={treeOptions}
            collectionOptions={collectionOptions}
            onChoose={onChoose}
          />
        )
      ) : (
        <LinkTab
          value={linkValue}
          onValue={onLinkValue}
          onContinue={onLinkContinue}
        />
      )}
    </div>
  );
}

// --- "من مساحتي": trees already here + collections to nest -------------------

function MineTab({
  treeOptions,
  collectionOptions,
  onChoose,
}: {
  treeOptions: SourceOption[];
  collectionOptions: SourceOption[];
  onChoose: (o: SourceOption) => void;
}) {
  const groups: { label: string; source: ItemSourceLabel }[] = [
    { label: SOURCE_LABEL['own-main'], source: 'own-main' },
    { label: SOURCE_LABEL.extra, source: 'extra' },
  ];

  const hasAnything =
    treeOptions.length > 0 || collectionOptions.length > 0;

  if (!hasAnything) {
    return (
      <div className={styles.tabBody}>
        <p className={styles.linkIntro}>
          لا توجد أشجارٌ أو مجموعاتٌ بعد. أنشئ شجرةً إضافية أو مجموعةً أخرى لتضمّها
          هنا.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.tabBody}>
      {groups.map((group) => {
        const items = treeOptions.filter((o) => o.source === group.source);
        if (items.length === 0) return null;
        return (
          <div key={group.source} className={styles.pickGroup}>
            <h4 className={styles.pickGroupLabel}>{group.label}</h4>
            <div className={styles.pickList}>
              {items.map((o) => (
                <SourceRow key={o.key} option={o} onChoose={onChoose} />
              ))}
            </div>
          </div>
        );
      })}

      {collectionOptions.length > 0 && (
        <div className={styles.pickGroup}>
          <h4 className={styles.pickGroupLabel}>تضمين مجموعةٍ أخرى</h4>
          <div className={styles.pickList}>
            {collectionOptions.map((o) => (
              <SourceRow key={o.key} option={o} onChoose={onChoose} nested />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- "عبر رابط": bring a tree/branch from another family by link/token -------

function LinkTab({
  value,
  onValue,
  onContinue,
}: {
  value: string;
  onValue: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className={styles.tabBody}>
      <p className={styles.linkIntro}>
        الصق رابط العائلة العام أو رمز المشاركة لاستحضار شجرةٍ أو فرعٍ من عائلةٍ
        أخرى إلى مجموعتك.
      </p>
      <label className={modal.fieldLabel}>الرابط أو رمز المشاركة</label>
      <input
        type="text"
        className={modal.input}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onContinue();
        }}
        placeholder="https://… أو رمز المشاركة"
        aria-label="الرابط أو رمز المشاركة"
        autoFocus
      />
      <div className={styles.linkActions}>
        <Button
          variant="primary"
          size="md"
          onClick={onContinue}
          disabled={!value.trim()}
        >
          متابعة
        </Button>
      </div>
    </div>
  );
}

function SourceRow({
  option,
  onChoose,
  nested,
}: {
  option: SourceOption;
  onChoose: (o: SourceOption) => void;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.sourceRow} ${option.blocked ? styles.sourceRowBlocked : ''}`}
      onClick={() => onChoose(option)}
      disabled={option.blocked}
      aria-disabled={option.blocked}
    >
      <span className={styles.sourceIcon}>
        <iconify-icon
          icon={
            nested
              ? 'material-symbols:collections-bookmark'
              : 'material-symbols:account-tree'
          }
          width="18"
          height="18"
        />
      </span>
      <span className={styles.sourceBody}>
        <span className={styles.sourceName}>{option.nameAr}</span>
        <span className={styles.sourceMeta}>
          {option.peopleCount != null && (
            <span>{option.peopleCount} فرداً</span>
          )}
          {option.blockedReason && (
            <span className={styles.blockedReason}>{option.blockedReason}</span>
          )}
        </span>
      </span>
      <VisibilityChip level={option.visibility} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — link vs copy
// ---------------------------------------------------------------------------

function ModeStep({
  linkMode,
  onChange,
  picked,
}: {
  linkMode: ItemLinkMode;
  onChange: (m: ItemLinkMode) => void;
  picked: SourceOption;
}) {
  return (
    <div className={styles.modeWrap}>
      <p className={styles.modeIntro}>
        كيف تريد إضافة <strong>{picked.nameAr}</strong> إلى المجموعة؟
      </p>

      <button
        type="button"
        className={`${styles.modeCard} ${linkMode === 'linked' ? styles.modeCardActive : ''}`}
        onClick={() => onChange('linked')}
        role="radio"
        aria-checked={linkMode === 'linked'}
      >
        <span className={styles.modeIcon}>
          <iconify-icon icon="material-symbols:sync" width="22" height="22" />
        </span>
        <span className={styles.modeText}>
          <span className={styles.modeTitle}>ربط مباشر</span>
          <span className={styles.modeDesc}>
            يبقى العنصر متزامناً مع المصدر — أي تعديلٍ لاحق يظهر هنا تلقائياً.
          </span>
        </span>
        <span className={styles.radioDot} aria-hidden="true" />
      </button>

      <button
        type="button"
        className={`${styles.modeCard} ${linkMode === 'copied' ? styles.modeCardActive : ''}`}
        onClick={() => onChange('copied')}
        role="radio"
        aria-checked={linkMode === 'copied'}
      >
        <span className={styles.modeIcon}>
          <iconify-icon icon="material-symbols:lock-clock" width="22" height="22" />
        </span>
        <span className={styles.modeText}>
          <span className={styles.modeTitle}>نسخة مثبّتة</span>
          <span className={styles.modeDesc}>
            صورةٌ ثابتة تملكها بالكامل، ولا تتبع تعديلات المصدر أو حذفه.
          </span>
        </span>
        <span className={styles.radioDot} aria-hidden="true" />
      </button>

      {linkMode === 'copied' && (
        <div className={styles.copyWarning} role="note">
          <iconify-icon
            icon="material-symbols:warning-outline"
            width="18"
            height="18"
            aria-hidden="true"
          />
          <span>
            النسخة دائمة — لن تتلقّى تحديثات المصدر، ولن تُزال إن أزال صاحبها
            المصدر لاحقاً.
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — title + description
// ---------------------------------------------------------------------------

function DetailsStep({
  picked,
  linkMode,
  title,
  description,
  onTitle,
  onDescription,
}: {
  picked: SourceOption;
  linkMode: ItemLinkMode;
  title: string;
  description: string;
  onTitle: (v: string) => void;
  onDescription: (v: string) => void;
}) {
  return (
    <div className={styles.detailsWrap}>
      <div className={styles.detailsSummary}>
        <span className={styles.summaryName}>{picked.nameAr}</span>
        <span className={styles.summaryTags}>
          {picked.collectionId ? (
            <span className={styles.summaryNested}>مجموعة متداخلة</span>
          ) : (
            <span className={styles.summaryMode}>
              {linkMode === 'linked' ? 'ربط مباشر' : 'نسخة مثبّتة'}
            </span>
          )}
        </span>
      </div>

      <div>
        <label className={modal.fieldLabel}>عنوان العنصر</label>
        <input
          type="text"
          className={modal.input}
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="عنوان يظهر داخل المجموعة"
          autoFocus
        />
      </div>
      <div>
        <label className={modal.fieldLabel}>الوصف (اختياري)</label>
        <textarea
          className={modal.textarea}
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          placeholder="وصفٌ خاصٌّ بهذا العنصر داخل المجموعة"
          rows={3}
        />
        <p className={modal.hint}>
          لكلّ عنصرٍ عنوانه ووصفه المستقلّان عن اسم المصدر.
        </p>
      </div>
    </div>
  );
}
