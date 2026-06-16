'use client';

import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { NodeFigure } from '@/components/heritage/FigureCluster';
import { stripArabicDiacritics } from '@/lib/utils/search';
import { validateConfirmationPhrase } from '@/lib/tree/publish';
import { SearchIrreversibleWarning } from '../SearchIrreversibleWarning';
import type { CheckpointPerson, PublishCheckpointData } from './types';
import styles from './PublishCheckpoint.module.css';

export interface PublishCheckpointProps {
  isOpen: boolean;
  /** Living-people view-model. Computed by the TDD phase; rendered as-is here. */
  data: PublishCheckpointData;
  /**
   * The phrase the admin must type to confirm — the recognizable family name
   * (e.g. "عائلة السعيد"), intentionally decoupled from the public URL.
   */
  confirmPhrase: string;
  /**
   * When true, shows the search-listing irreversibility warning. Driven by the
   * chosen visibility level (the caller decides; this component just displays).
   */
  showIrreversible?: boolean;
  onClose: () => void;
  /** Fired with the typed phrase when the admin proceeds (wired later). */
  onPublish?: () => void;
  /**
   * Per-person quick actions — mark deceased / mark private (wired later).
   * "Living" is driven by the deceased flag + the 130-year rule, NOT by whether
   * a death date exists — so the fix offered is "mark deceased", not "add a date".
   */
  onMarkDeceased?: (personId: string) => void;
  onMarkPrivate?: (personId: string) => void;
  /** Disables the publish button while a request is in flight. */
  loading?: boolean;
  className?: string;
}

/**
 * The publish gate: shows ALL living people (grouped by household, with a
 * no-birth-date "attention" group first), lets the admin fix mistakes inline,
 * and requires typing the family name to proceed — defeating warning fatigue,
 * consistent with the cascade-delete confirm pattern.
 *
 * Presentational only: it renders the supplied view-model, matches the typed
 * phrase for the enabled/disabled button state, and reports intent via
 * callbacks. No living-status rule, no publish logic.
 */
export function PublishCheckpoint({
  isOpen,
  data,
  confirmPhrase,
  showIrreversible = false,
  onClose,
  onPublish,
  onMarkDeceased,
  onMarkPrivate,
  loading = false,
  className,
}: PublishCheckpointProps) {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  // Static-only: people the admin has marked deceased/private in this session
  // visually drop out of the list (and the count). No persistence.
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());

  const phraseMatches = validateConfirmationPhrase(typed, confirmPhrase);
  const canPublish = !loading && phraseMatches;

  const normalizedQuery = stripArabicDiacritics(query.trim());
  const visible = (p: CheckpointPerson) =>
    !removedIds.has(p.id) &&
    (normalizedQuery === '' || stripArabicDiacritics(p.name).includes(normalizedQuery));

  const filteredAttention = useMemo(
    () => data.attention.filter(visible),
    [data.attention, normalizedQuery, removedIds],
  );
  const filteredHouseholds = useMemo(
    () =>
      data.households
        .map((h) => ({ ...h, members: h.members.filter(visible) }))
        .filter((h) => h.members.length > 0),
    [data.households, normalizedQuery, removedIds],
  );

  // Living count drops as people are marked deceased/private (static demo).
  const remainingCount = Math.max(0, data.livingCount - removedIds.size);
  // Zero living people → skip the whole review section; the dialog becomes a
  // simple, calm "confirm to publish" step (different header, no list).
  const isZeroLiving = remainingCount === 0;

  // Each fix fires the (placeholder) callback AND visually removes the chip.
  const handleMarkDeceased = (id: string) => {
    onMarkDeceased?.(id);
    setRemovedIds((prev) => new Set(prev).add(id));
  };
  const handleMarkPrivate = (id: string) => {
    onMarkPrivate?.(id);
    setRemovedIds((prev) => new Set(prev).add(id));
  };

  if (!isOpen) return null;

  return (
    <div className={clsx(styles.overlay, className)}>
      <div
        className={clsx(styles.modal, { [styles.modalCompact]: isZeroLiving })}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkpoint-title"
      >
        {isZeroLiving ? (
          /* ---- Zero living people: a calm, simple confirm step, no review ---- */
          <div className={styles.zeroHead}>
            <div className={styles.zeroSeal} aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l2.4 1.4 2.8-.2.9 2.6 2 1.9-1 2.6 1 2.6-2 1.9-.9 2.6-2.8-.2L12 21l-2.4-1.4-2.8.2-.9-2.6-2-1.9 1-2.6-1-2.6 2-1.9.9-2.6 2.8.2z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                  opacity="0.55"
                />
                <path d="M8.5 12.2l2.4 2.3 4.6-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 id="checkpoint-title" className={styles.zeroTitle}>
              جاهزة للنشر
            </h2>
            <p className={styles.zeroLead}>
              لا يوجد أفراد أحياء سيظهرون للعموم في هذه الشجرة — جميع من فيها متوفون.
              لم يبق سوى تأكيد النشر.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.head}>
              <div className={styles.kicker}>مراجعة قبل النشر</div>
              <h2 id="checkpoint-title" className={styles.title}>
                الأشخاص الأحياء في الشجرة
              </h2>
              <p className={styles.lead}>
                هؤلاء أكثر من قد يتأثر بالنشر. راجعهم قبل المتابعة — وإن وجدت خطأ، صححه الآن:
                ضع علامة «متوفى»، أو «خاص» على من لا تريد عرضه.
              </p>
            </div>

            <div className={styles.count}>
              <span className={styles.countNum}>{remainingCount}</span>
              <span className={styles.countText}>
                سيعرض {remainingCount} فردا حيا للعموم (بأسمائهم وصلاتهم، دون تاريخ ميلادهم الدقيق).
              </span>
            </div>

            <div className={styles.tools}>
              <div className={styles.search}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
                  <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <input
                  placeholder="ابحث عن اسم للوصول إليه بسرعة…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="بحث عن شخص"
                />
              </div>
            </div>

            <div className={styles.groups}>
              {filteredAttention.length > 0 && (
                <div className={styles.attentionGroup}>
                  <div className={styles.groupHead}>
                    <div className={clsx(styles.groupTitle, styles.groupTitleAttention)}>
                      <span className={styles.groupIcon} aria-hidden="true">
                        ⚑
                      </span>
                      يحتاجون انتباها — بلا تاريخ ميلاد
                    </div>
                    <span className={styles.groupCount}>{filteredAttention.length} أفراد</span>
                  </div>
                  <div className={styles.personGrid}>
                    {filteredAttention.map((p) => (
                      <PersonChip
                        key={p.id}
                        person={p}
                        onMarkDeceased={handleMarkDeceased}
                        onMarkPrivate={handleMarkPrivate}
                      />
                    ))}
                  </div>
                </div>
              )}

              {filteredHouseholds.map((h) => (
                <div key={h.id} className={styles.householdGroup}>
                  <div className={styles.groupHead}>
                    <div className={styles.groupTitle}>
                      <span className={styles.groupIcon} aria-hidden="true">
                        ⌂
                      </span>
                      {h.title}
                    </div>
                    <span className={styles.groupCount}>{h.members.length} أفراد</span>
                  </div>
                  <div className={styles.personGrid}>
                    {h.members.map((p) => (
                      <PersonChip
                        key={p.id}
                        person={p}
                        onMarkDeceased={handleMarkDeceased}
                        onMarkPrivate={handleMarkPrivate}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {filteredAttention.length === 0 && filteredHouseholds.length === 0 && (
                <p className={styles.noResults}>لا توجد نتائج مطابقة.</p>
              )}
            </div>
          </>
        )}

        {showIrreversible && <SearchIrreversibleWarning className={styles.irreversibleSlot} />}

        <div className={styles.confirmZone}>
          <label className={styles.confirmLabel} htmlFor="checkpoint-confirm">
            للتأكيد، اكتب اسم العائلة <strong>«{confirmPhrase}»</strong> في الحقل أدناه:
          </label>
          <input
            id="checkpoint-confirm"
            className={styles.confirmInput}
            placeholder={confirmPhrase}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            dir="rtl"
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={clsx(styles.publish, { [styles.publishDisabled]: !canPublish })}
            disabled={!canPublish}
            onClick={onPublish}
          >
            {loading ? 'جار النشر…' : 'نشر الشجرة'}
          </button>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
            إلغاء
          </button>
          {!phraseMatches && (
            <span className={styles.hint}>
              <span className={styles.hintDot} />
              الزر يبقى معطلا حتى تكتب اسم العائلة
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonChip({
  person,
  onMarkDeceased,
  onMarkPrivate,
}: {
  person: CheckpointPerson;
  onMarkDeceased?: (id: string) => void;
  onMarkPrivate?: (id: string) => void;
}) {
  return (
    <div className={styles.chip}>
      <div className={clsx(styles.chipAvatar, { [styles.female]: person.gender === 'female' })}>
        <NodeFigure gender={person.gender} />
      </div>
      <div className={styles.chipText}>
        <div className={styles.chipName}>{person.name}</div>
        <div className={clsx(styles.chipMeta, { [styles.chipMetaWarn]: person.needsAttention })}>
          {person.meta}
        </div>
      </div>
      <div className={styles.chipActions}>
        <button type="button" className={styles.miniBtn} onClick={() => onMarkDeceased?.(person.id)}>
          متوفى
        </button>
        <button type="button" className={styles.miniBtn} onClick={() => onMarkPrivate?.(person.id)}>
          خاص
        </button>
      </div>
    </div>
  );
}
