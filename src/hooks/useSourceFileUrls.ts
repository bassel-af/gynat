'use client';

import { useEffect, useState } from 'react';
import { fetchSourceFileBlob, type SourceFileDto } from '@/lib/tree/source-entries-api';

/**
 * Object URLs for an entry's IMAGE files. The file route needs the Bearer
 * token, so an `<img src>` cannot point at it: fetch the bytes, wrap them in
 * an object URL, and revoke every URL when the files change or the consumer
 * unmounts (a late answer after that is revoked on arrival). PDFs are never
 * fetched here — they download on demand.
 */
export function useSourceFileUrls(
  workspaceId: string,
  treeId: string | undefined,
  entryId: string,
  files: readonly SourceFileDto[],
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const imageIds = files.filter((f) => f.mimeType.startsWith('image/')).map((f) => f.id);
  const key = imageIds.join('|');

  useEffect(() => {
    if (!key) return;
    let active = true;
    const made: string[] = [];
    for (const fileId of key.split('|')) {
      fetchSourceFileBlob(workspaceId, entryId, fileId, treeId)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          if (!active) {
            URL.revokeObjectURL(url);
            return;
          }
          made.push(url);
          setUrls((prev) => ({ ...prev, [fileId]: url }));
        })
        .catch(() => {
          // A thumbnail that fails to load stays a placeholder.
        });
    }
    return () => {
      active = false;
      for (const url of made) URL.revokeObjectURL(url);
      setUrls({});
    };
  }, [workspaceId, treeId, entryId, key]);

  return urls;
}

/** Download one file (PDF or image) through a short-lived object URL. */
export async function downloadSourceFile(
  workspaceId: string,
  treeId: string | undefined,
  entryId: string,
  file: SourceFileDto,
): Promise<void> {
  const blob = await fetchSourceFileBlob(workspaceId, entryId, file.id, treeId);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.fileName || 'source';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
