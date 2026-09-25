'use client';

import { usePersonSources } from '@/hooks/usePersonSources';
import personStyles from '@/components/person/person.module.css';
import { SourceFileThumbs } from './SourceFileThumbs';
import { toArabicDigits } from './arabicDigits';
import { SharedTag } from './SourceRow';
import styles from './PersonSourcesCard.module.css';

export interface PersonSourcesCardProps {
  workspaceId: string;
  treeId?: string;
  individualId: string;
}

/**
 * «المصادر» on the member person page — read-only footnotes (١، ٢، ٣) after
 * السجل, the inherited tree-wide entry last. Renders nothing when the viewer
 * has nothing to see (the server already decided what is visible).
 */
export function PersonSourcesCard({ workspaceId, treeId, individualId }: PersonSourcesCardProps) {
  const { entries, inherited, loaded } = usePersonSources(workspaceId, treeId, individualId);
  if (!loaded || (entries.length === 0 && !inherited)) return null;

  return (
    <section className={styles.card} aria-labelledby="person-sources-title">
      <div className={personStyles.sectionHead}>
        <h2 id="person-sources-title" className={personStyles.sectionTitle}>
          المصادر
        </h2>
        <p className={personStyles.sectionHint}>ما يستند إليه هذا السجل.</p>
      </div>

      <ol className={styles.notes}>
        {entries.map((entry, i) => (
          <li key={entry.id} className={styles.note}>
            <span className={styles.number} aria-hidden="true">
              {toArabicDigits(i + 1)}
            </span>
            <div className={styles.body}>
              {entry.text && <p className={styles.text}>{entry.text}</p>}
              <SourceFileThumbs
                workspaceId={workspaceId}
                treeId={treeId}
                entryId={entry.id}
                files={entry.files}
                size={48}
              />
              <SharedTag count={entry.sharedCount} className={styles.sharedTag} />
            </div>
          </li>
        ))}
        {inherited && (
          <li className={`${styles.note} ${styles.inherited}`}>
            <span className={styles.number} aria-hidden="true">
              {toArabicDigits(entries.length + 1)}
            </span>
            <div className={styles.body}>
              {inherited.text && <p className={styles.text}>{inherited.text}</p>}
              <SourceFileThumbs
                workspaceId={workspaceId}
                treeId={treeId}
                entryId={inherited.id}
                files={inherited.files}
                size={48}
              />
              <span className={styles.inheritedTag}>من مصدر الشجرة</span>
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}
