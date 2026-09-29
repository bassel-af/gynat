import type { ReactNode } from 'react';
import { highlightSegments, matchesSearch } from '@/lib/utils/search';
import styles from './PersonListName.module.css';

export interface PersonListNameProps {
  /** The row's main text (lead name, usually with nasab). */
  main: string;
  /** The grey second line («واسمه شيبة» / «ويُعرف بأبي طالب»), if any. */
  alternate?: string | null;
  /** The active search query; matches are highlighted in both lines. */
  query?: string;
  /** Extra content at the end of the main line (e.g. a birth year). */
  aside?: ReactNode;
}

/** Text with query matches wrapped in <mark> — React text nodes only. */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightSegments(text, query).map((s, i) =>
        s.hit ? <mark key={i} className={styles.mark}>{s.text}</mark> : s.text,
      )}
    </>
  );
}

/**
 * The shared person-name block for people lists: the main line plus an
 * optional grey line with the person's other name. Each list keeps its own
 * outer element (li / label / button). The grey line is strengthened when the
 * search matched only it, so the row shows why it was found.
 */
export function PersonListName({ main, alternate, query = '', aside }: PersonListNameProps) {
  const altOnlyHit = !!alternate && query.trim() !== '' && !matchesSearch(main, query);
  return (
    <span className={styles.root}>
      <span className={styles.mainLine}>
        <span className={styles.main}>
          <Highlighted text={main} query={query} />
        </span>
        {aside != null && <span className={styles.aside}>{aside}</span>}
      </span>
      {alternate && (
        <span
          className={altOnlyHit ? `${styles.alternate} ${styles.alternateHit}` : styles.alternate}
          data-hit={altOnlyHit ? 'true' : 'false'}
        >
          <Highlighted text={alternate} query={query} />
        </span>
      )}
    </span>
  );
}
