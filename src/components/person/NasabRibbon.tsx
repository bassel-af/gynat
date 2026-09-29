'use client';

import { useId } from 'react';
import type { PersonSubject, SpineChip } from '@/lib/tree/person-projection';
import {
  getAlternateNameLine,
  getLeadName,
  getNasabToken,
  getOtherName,
} from '@/lib/gedcom/display';
import { asNamedIndividual } from './personNames';
import { PersonLink } from './PersonLink';
import { JumpDivider } from './JumpDivider';
import styles from './person.module.css';

/**
 * The hero signature: the subject's full patronymic chain as ONE continuous
 * ribbon — «<subject> بن <father> بن <grandfather> …».
 *
 * The family name is NEVER part of the ribbon — with or without a «قفزة نسب».
 * It is shown once, in the page's «من بيت X» line. (After a jump a trailing
 * surname would read as the distant ancestor's house.)
 *
 * The ribbon WRAPS onto multiple centered lines when it does not fit; it never
 * horizontal-scrolls (scrolling a name reads badly). The subject leads (largest,
 * brightest); ancestors fade toward the past (further left). A private ancestor
 * renders as a non-clickable «خاص» token via PersonLink.
 *
 * `chain` is the paternal spine OLDEST → person; we reverse it so the ribbon
 * reads subject-first (RTL: subject on the right, oldest on the left).
 *
 * PUBLIC surfaces pass `suppressLivingConnectors` — on the public tree a chain
 * of living people is shown without the بن/بنت connector between two living
 * people (the connector asserts a documented descent we don't surface publicly
 * for the living). The connector between a deceased ancestor and anyone is kept.
 */
export function NasabRibbon({
  subject,
  chain,
  hrefFor,
  suppressLivingConnectors = false,
}: {
  subject: PersonSubject;
  chain: SpineChip[];
  hrefFor: (id: string) => string;
  suppressLivingConnectors?: boolean;
}) {
  // Reversed = ribbon order (subject-first). For each segment the "younger"
  // person is the one to its right: the subject for the first segment, else the
  // previous (younger) ancestor.
  const reversed = [...chain].reverse();
  const idBase = useId();

  return (
    <div className={styles.ribbonScroller}>
      <h1 className={styles.ribbon}>
        <PersonLink
          chip={{ id: subject.id, name: getLeadName(asNamedIndividual(subject)) }}
          kind="lead"
          interactive={false}
          hrefFor={hrefFor}
        />
        {reversed.map((anc, i) => {
          const younger = i === 0 ? subject : reversed[i - 1];
          const bothLiving = !!younger.living && !!anc.living;
          const hideConnector = suppressLivingConnectors && bothLiving;
          return (
            <span key={anc.id ?? `anc-${i}`} className={styles.ribbonSegment}>
              {anc.jump ? (
                /* «قفزة نسب»: this ancestor was reached across an unrecorded
                   (or deliberately skipped) number of generations. A «بن» here
                   would assert a father→son link the record does not make, so
                   the connector is replaced by the named divider. */
                <JumpDivider range={anc.jump} />
              ) : (
                !hideConnector && (
                  <span className={styles.nasabConnector}>
                    {/* بن/بنت reflects the YOUNGER person (son/daughter OF the
                        ancestor), not the ancestor — so a female subject reads
                        «رندة بنت بشر», not «رندة بن بشر». */}
                    {younger.gender === 'female' ? 'بنت' : 'بن'}
                  </span>
                )
              )}
              {/* Ancestors show only their LEAD name (famous or given, genitive
                  after بن) — the family name is not part of the ribbon at all
                  (it lives in the «من بيت» line). */}
              <AncestorName anc={anc} descId={`${idBase}-alt-${i}`} hrefFor={hrefFor} />
            </span>
          );
        })}
      </h1>
    </div>
  );
}

/**
 * One ancestor in the ribbon: a link by his lead name in the genitive
 * («أبي طالب»), and — when he has a famous name — a tiny muted caption of his
 * other name, with «واسمه …» / «ويُعرف ب…» as the link's description. A private
 * placeholder stays a bare «خاص» token (no caption, no description).
 */
function AncestorName({
  anc,
  descId,
  hrefFor,
}: {
  anc: SpineChip;
  descId: string;
  hrefFor: (id: string) => string;
}) {
  if (anc.private) {
    return <PersonLink chip={{ ...anc, name: anc.givenName }} hrefFor={hrefFor} />;
  }
  const person = asNamedIndividual(anc);
  const token = getNasabToken(person);
  const altLine = getAlternateNameLine(person);
  if (!altLine) {
    return <PersonLink chip={{ ...anc, name: token }} hrefFor={hrefFor} />;
  }
  const caption = getOtherName(person);
  return (
    <span className={styles.ribbonName}>
      <PersonLink chip={{ ...anc, name: token }} hrefFor={hrefFor} describedBy={descId} />
      <span className={styles.ribbonCaption} aria-hidden="true">
        {caption}
      </span>
      <span id={descId} hidden>
        {altLine}
      </span>
    </span>
  );
}
