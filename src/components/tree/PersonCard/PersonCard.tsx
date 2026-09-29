'use client';

import clsx from 'clsx';
import type { Individual } from '@/lib/gedcom';
import { getLeadDisplayName } from '@/lib/gedcom';
import { getAlternateNameLine, shouldShowKunya, withOtherNames } from '@/lib/gedcom/display';
import { useTree } from '@/context/TreeContext';
import { useOptionalWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { shouldHideBirthDate } from '@/lib/tree/birth-date-privacy';
import styles from './PersonCard.module.css';

interface PersonCardProps {
  person: Individual | null | undefined;
  isRoot?: boolean;
}

export function PersonCard({ person, isRoot = false }: PersonCardProps) {
  const { searchQuery } = useTree();
  const wsContext = useOptionalWorkspaceTree();

  if (!person) return null;

  const displayName = getLeadDisplayName(person);
  const alternateName = getAlternateNameLine(person);

  // Matches the card by any name the person goes by (famous, real, kunya).
  const isMatch =
    searchQuery &&
    withOtherNames(displayName, person).toLowerCase().includes(searchQuery.toLowerCase());

  const hideBirth = shouldHideBirthDate(person, {
    hideBirthDateForFemale: wsContext?.hideBirthDateForFemale,
    hideBirthDateForMale: wsContext?.hideBirthDateForMale,
  });

  let dates = '';
  if (hideBirth) {
    if (person.death) dates = person.death;
  } else if (person.birth || person.death) {
    dates = `${person.birth || '?'} - ${person.death || ''}`;
  }

  return (
    <div
      className={clsx(styles.person, {
        [styles.male]: person.sex === 'M',
        [styles.female]: person.sex === 'F',
        [styles.root]: isRoot,
        [styles.searchMatch]: isMatch,
        [styles.deceased]: person.isDeceased,
      })}
    >
      <div className={styles.personName}>{displayName}</div>
      {alternateName && (
        <div className={styles.personAltName} title={alternateName}>{alternateName}</div>
      )}
      {shouldShowKunya(person) && <div className={styles.personKunya}>{person.kunya}</div>}
      {dates && <div className={styles.personDates}>{dates}</div>}
    </div>
  );
}
