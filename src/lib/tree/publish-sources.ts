/**
 * Sources («المصادر») — the publish flow's ONE question (step 7):
 * «المصادر في الشجرة المنشورة». Client-side helpers only; every change goes
 * through the existing admin routes (bulk + tree-entry), applied AFTER the
 * publish itself succeeded.
 */
import {
  bulkSources,
  putTreeEntry,
  type PublishSourcesSummary,
} from '@/lib/tree/source-entries-api';
import { MAX_BULK_IDS } from '@/lib/tree/source-entry-schemas';

export type PublishSourcesMode = 'none' | 'all' | 'pick';

export interface PublishSourcesChoice {
  /** «لا شيء» (default — nothing changes) / «كلها» / «أختار بنفسي». */
  mode: PublishSourcesMode;
  /** «أختار بنفسي»: the ticked entry ids. */
  pickedIds: string[];
  /** «ومصدر الشجرة»: also raise the tree-wide entry. */
  includeTreeEntry: boolean;
}

export const DEFAULT_PUBLISH_SOURCES_CHOICE: PublishSourcesChoice = {
  mode: 'none',
  pickedIds: [],
  includeTreeEntry: false,
};

/** The tree-wide entry exists and visitors can't see it yet. */
export function treeEntryPending(summary: PublishSourcesSummary | null): boolean {
  return !!summary?.treeEntry && summary.treeEntry.visibility !== 'public';
}

/** Ask only when something could change for visitors (N > 0 or a hidden tree-wide entry). */
export function shouldAskAboutSources(summary: PublishSourcesSummary | null): boolean {
  if (!summary || !Array.isArray(summary.pendingIds)) return false;
  return summary.pendingIds.length > 0 || treeEntryPending(summary);
}

/** The person entry ids to raise — never anything outside the pending list. */
export function idsToPublish(choice: PublishSourcesChoice, summary: PublishSourcesSummary): string[] {
  if (choice.mode === 'all') return [...summary.pendingIds];
  if (choice.mode === 'pick') {
    const pending = new Set(summary.pendingIds);
    return [...new Set(choice.pickedIds)].filter((id) => pending.has(id));
  }
  return [];
}

export function chunk<T>(items: readonly T[], size: number = MAX_BULK_IDS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Apply the admin's choice: person entries via the bulk route (≤ 500 ids per
 * call), the tree-wide entry via its own PUT. Resolves to false when any call
 * failed (the caller keeps the publish and shows a toast); true otherwise.
 * «لا شيء» with the tree-wide box unticked sends nothing.
 */
export async function applyPublishSourcesChoice(
  workspaceId: string,
  treeId: string | undefined,
  choice: PublishSourcesChoice,
  summary: PublishSourcesSummary | null,
): Promise<boolean> {
  if (!summary) return true;
  try {
    for (const ids of chunk(idsToPublish(choice, summary))) {
      await bulkSources(workspaceId, { ids, action: 'setVisibility', visibility: 'public' }, treeId);
    }
    if (choice.includeTreeEntry && treeEntryPending(summary)) {
      await putTreeEntry(workspaceId, { visibility: 'public' }, treeId);
    }
    return true;
  } catch {
    return false;
  }
}
