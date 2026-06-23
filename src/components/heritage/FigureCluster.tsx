'use client';

/**
 * Hand-drawn silhouette primitives used across heritage-styled surfaces.
 * - FigureCluster: grouped silhouettes for hero medallion / card corners / trios
 * - FigureMan / FigureWoman: avatar-sized single silhouettes for tree nodes
 * - NodeFigure: gender-driven wrapper around FigureMan / FigureWoman
 *
 * Gradient ids are made unique per instance via useId — duplicate SVG ids on a
 * page cause a `url(#id)` fill to resolve to the FIRST match, which fails (and
 * paints invisibly) when that first match lives inside a collapsed `<details>`
 * (display:none) subtree.
 */

import { useId } from 'react';

type Variant = 'medallion' | 'corner' | 'trio';

/** useId can contain ':' which is unsafe inside SVG `url(#…)` fills on some browsers. */
function safeId(raw: string) {
  return raw.replace(/:/g, '');
}

export function FigureMan({ className }: { className?: string }) {
  const gid = safeId(useId());
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8c7441" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="15" r="7" fill={`url(#${gid})`} />
      <path d="M 10 42 Q 10 27 24 27 Q 38 27 38 42 Z" fill={`url(#${gid})`} />
    </svg>
  );
}

export function FigureWoman({ className }: { className?: string }) {
  const gid = safeId(useId());
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f4d9c0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7b4b55" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="14" r="7" fill={`url(#${gid})`} />
      <path d="M 8 44 Q 12 28 24 26 Q 36 28 40 44 Z" fill={`url(#${gid})`} />
    </svg>
  );
}

export function NodeFigure({ gender, className }: { gender: 'male' | 'female'; className?: string }) {
  return gender === 'female' ? <FigureWoman className={className} /> : <FigureMan className={className} />;
}

export function FigureCluster({
  variant = 'medallion',
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const uid = safeId(useId());

  if (variant === 'corner') {
    const gid = `${uid}-corner`;
    return (
      <svg viewBox="0 0 140 120" className={className} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c8a865" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1a5d4a" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <g fill={`url(#${gid})`}>
          <circle cx="35" cy="48" r="10" />
          <path d="M 15 100 Q 15 70 35 70 Q 55 70 55 100 Z" />
          <circle cx="70" cy="40" r="11" />
          <path d="M 48 105 Q 48 68 70 68 Q 92 68 92 105 Z" />
          <circle cx="105" cy="50" r="9" />
          <path d="M 88 100 Q 88 72 105 72 Q 122 72 122 100 Z" />
        </g>
      </svg>
    );
  }

  if (variant === 'trio') {
    const gid = `${uid}-trio`;
    return (
      <svg viewBox="0 0 90 64" className={className} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#1a5d4a" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <g fill={`url(#${gid})`}>
          <circle cx="20" cy="22" r="7" />
          <path d="M 8 58 Q 8 36 20 36 Q 32 36 32 58 Z" />
          <circle cx="45" cy="18" r="8" />
          <path d="M 31 60 Q 31 32 45 32 Q 59 32 59 60 Z" />
          <circle cx="70" cy="22" r="7" />
          <path d="M 58 58 Q 58 36 70 36 Q 82 36 82 58 Z" />
        </g>
      </svg>
    );
  }

  const manGid = `${uid}-med-man`;
  const womanGid = `${uid}-med-woman`;
  return (
    <svg viewBox="0 0 320 340" className={className} aria-hidden>
      <defs>
        <linearGradient id={manGid} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#1a5d4a" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={womanGid} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f4d9c0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#7b4b55" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* patriarch back-center */}
      <g fill={`url(#${manGid})`}>
        <circle cx="160" cy="78" r="26" />
        <path d="M 112 230 Q 112 125 160 125 Q 208 125 208 230 Z" />
      </g>
      {/* woman left */}
      <g fill={`url(#${womanGid})`}>
        <circle cx="95" cy="148" r="22" />
        <path d="M 52 280 Q 52 188 95 188 Q 138 188 138 280 Z" />
      </g>
      {/* man right */}
      <g fill={`url(#${manGid})`}>
        <circle cx="228" cy="152" r="22" />
        <path d="M 186 284 Q 186 192 228 192 Q 270 192 270 284 Z" />
      </g>
      {/* child front */}
      <g fill={`url(#${womanGid})`}>
        <circle cx="160" cy="212" r="14" />
        <path d="M 138 300 Q 138 240 160 240 Q 182 240 182 300 Z" />
      </g>
    </svg>
  );
}
