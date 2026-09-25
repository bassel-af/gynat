'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { LastLinkError, patchSource, type SourceWithPeopleDto } from '@/lib/tree/source-entries-api';
import { LastLinkDialog } from '@/components/sources/LastLinkDialog';

export type UnlinkResult =
  | { outcome: 'unlinked'; source: SourceWithPeopleDto | null }
  | { outcome: 'kept'; source: SourceWithPeopleDto | null }
  | { outcome: 'deleted' }
  | { outcome: 'cancelled' };

type Choice = 'delete' | 'keep' | null;

/**
 * Remove people from a source («إزالته عن … فقط», × on the «المصادر» page).
 * When that would leave the source with nobody, the server answers
 * «هذا آخر شخص لهذا المصدر» and this hook shows `LastLinkDialog`, then sends
 * the same removal again with the answer. Render `dialog` somewhere in the
 * caller. Other failures reject (the caller shows its own message).
 */
export function useSourceUnlink({
  workspaceId,
  treeId,
  stacked = false,
}: {
  workspaceId: string;
  treeId?: string;
  /** The dialog opens over another modal. */
  stacked?: boolean;
}): {
  unlink: (sourceId: string, personIds: string[]) => Promise<UnlinkResult>;
  dialog: ReactNode;
} {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<Choice>(null);
  const answerRef = useRef<((choice: Choice) => void) | null>(null);

  const unlink = useCallback(
    async (sourceId: string, personIds: string[]): Promise<UnlinkResult> => {
      const body = { removePersonIds: personIds };
      try {
        return { outcome: 'unlinked', source: await patchSource(workspaceId, sourceId, body, treeId) };
      } catch (err) {
        if (!(err instanceof LastLinkError)) throw err;
      }
      setAsking(true);
      const choice = await new Promise<Choice>((resolve) => {
        answerRef.current = resolve;
      });
      answerRef.current = null;
      if (!choice) {
        setAsking(false);
        return { outcome: 'cancelled' };
      }
      setBusy(choice);
      try {
        const source = await patchSource(workspaceId, sourceId, { ...body, onLastLink: choice }, treeId);
        return choice === 'delete' ? { outcome: 'deleted' } : { outcome: 'kept', source };
      } finally {
        setBusy(null);
        setAsking(false);
      }
    },
    [workspaceId, treeId],
  );

  const dialog = asking ? (
    <LastLinkDialog
      busy={busy}
      stacked={stacked}
      onDelete={() => answerRef.current?.('delete')}
      onKeep={() => answerRef.current?.('keep')}
      onCancel={() => answerRef.current?.(null)}
    />
  ) : null;

  return { unlink, dialog };
}
