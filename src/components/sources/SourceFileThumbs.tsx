'use client';

import { useState } from 'react';
import clsx from 'clsx';
import type { SourceFileDto } from '@/lib/tree/source-entries-api';
import { useSourceFileUrls, downloadSourceFile } from '@/hooks/useSourceFileUrls';
import { SourceLightbox } from './SourceLightbox';
import { DocumentIcon } from './SourceIcons';
import styles from './SourceFileThumbs.module.css';

export interface SourceFileThumbsProps {
  workspaceId: string;
  treeId?: string;
  entryId: string;
  files: readonly SourceFileDto[];
  /** Thumbnail edge in px (32 in the sidebar). */
  size?: number;
  /**
   * Direct URL per file, for the anonymous public surface (no Bearer token is
   * needed, so a plain `<img src>` works and nothing is fetched as a blob).
   * Absent ⇒ the member path: authenticated object URLs.
   */
  fileUrl?: (file: SourceFileDto) => string;
  /** Called with the tapped file's index (the viewer opens either way). */
  onOpen?: (index: number) => void;
  className?: string;
}

const NO_FILES: readonly SourceFileDto[] = [];

/** Public files are plain URLs: the route itself answers PDFs as a download. */
function openDirectDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * A source entry's files as small thumbnails: images through authenticated
 * object URLs (revoked on unmount), PDFs as a document tile. Tapping one
 * opens `SourceLightbox` on it.
 */
export function SourceFileThumbs({
  workspaceId,
  treeId,
  entryId,
  files,
  size = 32,
  fileUrl,
  onOpen,
  className,
}: SourceFileThumbsProps) {
  const fetched = useSourceFileUrls(workspaceId, treeId, entryId, fileUrl ? NO_FILES : files);
  const urls = fileUrl
    ? Object.fromEntries(files.filter((f) => f.mimeType.startsWith('image/')).map((f) => [f.id, fileUrl(f)]))
    : fetched;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (files.length === 0) return null;

  return (
    <>
      <div className={clsx(styles.thumbs, className)}>
        {files.map((file, i) => {
          const isImage = file.mimeType.startsWith('image/');
          const url = urls[file.id];
          return (
            <button
              key={file.id}
              type="button"
              className={clsx(styles.thumb, { [styles.pdf]: !isImage })}
              style={{ width: size, height: size }}
              aria-label={isImage ? undefined : `ملف PDF: ${file.fileName}`}
              title={file.fileName}
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex(i);
                onOpen?.(i);
              }}
            >
              {isImage ? (
                url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- object URL, not optimisable
                  <img src={url} alt={file.fileName} className={styles.image} />
                ) : (
                  <span className={styles.placeholder} aria-label={file.fileName} role="img" />
                )
              ) : (
                <>
                  <DocumentIcon size={Math.round(size * 0.45)} />
                  {size >= 40 && <span className={styles.pdfLabel}>PDF</span>}
                </>
              )}
            </button>
          );
        })}
      </div>

      {openIndex !== null && (
        <SourceLightbox
          files={files}
          urls={urls}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          onDownload={(file) => {
            if (fileUrl) {
              openDirectDownload(fileUrl(file));
              return;
            }
            void downloadSourceFile(workspaceId, treeId, entryId, file).catch(() => undefined);
          }}
        />
      )}
    </>
  );
}
