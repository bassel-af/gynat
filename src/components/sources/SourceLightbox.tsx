'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SourceFileDto } from '@/lib/tree/source-entries-api';
import { toArabicDigits } from './arabicDigits';
import { ChevronIcon, CloseIcon, DocumentIcon, DownloadIcon } from './SourceIcons';
import styles from './SourceLightbox.module.css';

export interface SourceLightboxProps {
  files: readonly SourceFileDto[];
  /** fileId → object URL for images already fetched (see useSourceFileUrls). */
  urls: Readonly<Record<string, string>>;
  startIndex: number;
  onClose: () => void;
  /** Download a file through a blob (PDFs are never shown inline). */
  onDownload: (file: SourceFileDto) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * Full-screen viewer for a source entry's files: images over a dark backdrop
 * with basic zoom (wheel, pinch, double-tap), RTL prev/next, «٢ / ٣» counter,
 * Esc / × to close and a focus trap. A PDF is never rendered inline (the file
 * route serves it sandboxed as a download) — its slide offers «تنزيل الملف».
 */
export function SourceLightbox({ files, urls, startIndex, onClose, onDownload }: SourceLightboxProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(files.length - 1, 0)));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const count = files.length;
  const file = files[index];
  const isImage = !!file && file.mimeType.startsWith('image/');

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((i) => (i + delta + count) % count);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    },
    [count],
  );

  // Keyboard: Esc, RTL arrows (← is "next" in a right-to-left reading), and a
  // Tab trap so focus never leaves the viewer while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        go(1);
      } else if (e.key === 'ArrowRight') {
        go(-1);
      } else if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Focus in on open, back to where it was on close; no page scroll behind.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    if (!isImage) return;
    setZoom((z) => {
      const next = clampZoom(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const pinch = pinchRef.current;
    if (!pinch || e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    setZoom(clampZoom((pinch.zoom * distance) / pinch.distance));
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1 || e.pointerType === 'touch') return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: drag.panX + (e.clientX - drag.x), y: drag.panY + (e.clientY - drag.y) });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (!file || typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={file.fileName || 'ملف المصدر'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.topBar}>
          <button ref={closeRef} type="button" className={styles.iconButton} aria-label="إغلاق" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
          <span className={styles.fileName} dir="auto">{file.fileName}</span>
          <span className={styles.counter}>
            {toArabicDigits(index + 1)} / {toArabicDigits(count)}
          </span>
        </div>

        <div
          className={styles.stage}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => {
            if (!isImage) return;
            setZoom((z) => (z > 1 ? 1 : 2));
            setPan({ x: 0, y: 0 });
          }}
        >
          {isImage ? (
            urls[file.id] ? (
              // eslint-disable-next-line @next/next/no-img-element -- object URL, not optimisable
              <img
                src={urls[file.id]}
                alt={file.fileName}
                className={styles.image}
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                draggable={false}
              />
            ) : (
              <span className={styles.loading}>جاري التحميل...</span>
            )
          ) : (
            <div className={styles.pdfPanel}>
              <DocumentIcon size={48} className={styles.pdfIcon} />
              <span className={styles.pdfName} dir="auto">{file.fileName}</span>
              <button type="button" className={styles.downloadButton} onClick={() => onDownload(file)}>
                <DownloadIcon size={16} />
                تنزيل الملف
              </button>
            </div>
          )}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              className={`${styles.navButton} ${styles.navPrev}`}
              aria-label="السابق"
              onClick={() => go(-1)}
            >
              <ChevronIcon direction="right" size={24} />
            </button>
            <button
              type="button"
              className={`${styles.navButton} ${styles.navNext}`}
              aria-label="التالي"
              onClick={() => go(1)}
            >
              <ChevronIcon direction="left" size={24} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
