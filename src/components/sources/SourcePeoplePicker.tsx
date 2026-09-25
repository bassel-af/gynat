'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { GedcomData } from '@/lib/gedcom/types';
import type { BirthDatePrivacySettings } from '@/lib/tree/birth-date-privacy';
import {
  isSelectablePerson,
  pickerRow,
  quickGroups,
  searchPickerPeople,
  type PickerRow,
} from '@/lib/tree/source-people';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { selectedPeopleLabel } from './arabicDigits';
import styles from './SourcePeoplePicker.module.css';

export const NEW_PERSON_LABEL = 'هذا الشخص (جديد)';
const LOCKED_NOTE = 'أضفت المصدر من صفحته';

export interface SourcePeoplePickerProps {
  /** The loaded tree — search and quick buttons run over it. */
  data: GedcomData;
  /** The starting person (checked, locked, never removable); null ⇒ none. */
  lockedId?: string | null;
  /** The starting person is being created now: the locked row reads «هذا الشخص (جديد)». */
  newPerson?: boolean;
  /** The people already on the form (never the locked one). */
  initialIds: readonly string[];
  /** «تم» — the chosen people, locked person excluded. Nothing is saved here. */
  onDone: (ids: string[]) => void;
  onClose: () => void;
  birthPrivacy?: BirthDatePrivacySettings;
}

/**
 * «اختيار الأشخاص» — who a source is «مصدر لـ». Quick buttons from the
 * starting person's family, search across the tree, and «تم», which only
 * fills the form's «مصدر لـ» line.
 */
export function SourcePeoplePicker({
  data,
  lockedId = null,
  newPerson = false,
  initialIds,
  onDone,
  onClose,
  birthPrivacy,
}: SourcePeoplePickerProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds.filter((id) => id !== lockedId)));
  const [query, setQuery] = useState('');
  // Everyone ticked at some point stays listed when the search is cleared.
  const [listed, setListed] = useState<string[]>(() => initialIds.filter((id) => id !== lockedId));
  const groups = useMemo(() => (lockedId ? quickGroups(data, lockedId) : []), [data, lockedId]);
  const hasLocked = !!lockedId || newPerson;

  const isOn = (id: string) => id === lockedId || selected.has(id);
  const groupPressed = (ids: readonly string[]) => ids.every(isOn);

  const toggleGroup = (ids: readonly string[]) => {
    const pressed = groupPressed(ids);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (id === lockedId) continue;
        if (pressed) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const toggle = (id: string) => {
    setListed((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // No search: the family from the quick buttons plus everyone already ticked.
  const rows: PickerRow[] = useMemo(() => {
    const row = (id: string) => pickerRow(data, lockedId, id, birthPrivacy);
    if (query.trim()) {
      return searchPickerPeople(data, query)
        .filter((ind) => ind.id !== lockedId)
        .map((ind) => row(ind.id));
    }
    const ids = new Set<string>();
    for (const g of groups) for (const id of g.ids) if (id !== lockedId) ids.add(id);
    for (const id of listed) if (isSelectablePerson(data.individuals[id])) ids.add(id);
    return [...ids].map(row);
  }, [data, lockedId, groups, query, listed, birthPrivacy]);

  const count = selected.size + (hasLocked ? 1 : 0);
  const lockedName = lockedId
    ? pickerRow(data, null, lockedId, birthPrivacy).name
    : NEW_PERSON_LABEL;
  const lockedSub = lockedId ? pickerRow(data, null, lockedId, birthPrivacy).sub : null;

  const actions = (
    <div className={styles.footer}>
      <span className={styles.count} data-testid="picker-count" aria-live="polite">
        {count > 0 ? selectedPeopleLabel(count) : ''}
      </span>
      <Button variant="primary" size="md" className={styles.done} onClick={() => onDone([...selected])}>
        تم
      </Button>
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} title="اختيار الأشخاص" actions={actions} className={styles.modal} stacked>
      <div className={styles.body}>
        {groups.length > 0 && (
          <div className={styles.quick} role="group" aria-label="اختيار سريع">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                className={styles.quickButton}
                aria-pressed={groupPressed(g.ids)}
                onClick={() => toggleGroup(g.ids)}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        <input
          type="search"
          className={styles.search}
          placeholder="ابحث باسم أو نسب…"
          aria-label="ابحث باسم أو نسب"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />

        <ul className={styles.people} aria-label="الأشخاص">
          {hasLocked && !query.trim() && (
            <li>
              <label className={clsx(styles.row, styles.rowLocked)}>
                <input type="checkbox" checked disabled readOnly className={styles.check} />
                <span className={styles.names}>
                  <span className={styles.name}>{lockedName}</span>
                  {lockedSub && <span className={styles.sub}>{lockedSub}</span>}
                  <span className={styles.why}>{LOCKED_NOTE}</span>
                </span>
              </label>
            </li>
          )}
          {rows.map((r) => (
            <li key={r.id}>
              <label className={clsx(styles.row, { [styles.rowOn]: selected.has(r.id), [styles.rowOff]: r.disabled })}>
                <input
                  type="checkbox"
                  className={styles.check}
                  checked={selected.has(r.id)}
                  disabled={r.disabled}
                  onChange={() => toggle(r.id)}
                />
                <span className={styles.names}>
                  <span className={styles.name}>{r.name}</span>
                  {r.sub && <span className={styles.sub}>{r.sub}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
