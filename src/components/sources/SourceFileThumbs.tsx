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
  /** Called with the tapped file's index (the viewer opens either way). */
  onOpen?: (index: number) => void;
  className?: string;
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
  onOpen,
  className,
}: SourceFileThumbsProps) {
  const urls = useSourceFileUrls(workspaceId, treeId, entryId, files);
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
            void downloadSourceFile(workspaceId, treeId, entryId, file).catch(() => undefined);
          }}
        />
      )}
    </>
  );
}
