/**
 * Hand-drawn silhouette cluster used across heritage-styled surfaces.
 * - medallion variant: 4 figures (patriarch, couple, child) for hero
 * - corner variant: 3 figures for card bottom corners
 * - trio variant: 3 figures for workspace card header accent
 */

type Variant = 'medallion' | 'corner' | 'trio';

export function FigureCluster({
  variant = 'medallion',
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  if (variant === 'corner') {
    return (
      <svg viewBox="0 0 140 120" className={className} aria-hidden>
        <defs>
          <linearGradient id={`fcCorner-${variant}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c8a865" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1a5d4a" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <g fill={`url(#fcCorner-${variant})`}>
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
    return (
      <svg viewBox="0 0 90 64" className={className} aria-hidden>
        <defs>
          <linearGradient id="fcTrio" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#1a5d4a" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <g fill="url(#fcTrio)">
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

  return (
    <svg viewBox="0 0 320 340" className={className} aria-hidden>
      <defs>
        <linearGradient id="fcMedMan" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#1a5d4a" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="fcMedWoman" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f4d9c0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#7b4b55" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* patriarch back-center */}
      <g fill="url(#fcMedMan)">
        <circle cx="160" cy="78" r="26" />
        <path d="M 112 230 Q 112 125 160 125 Q 208 125 208 230 Z" />
      </g>
      {/* woman left */}
      <g fill="url(#fcMedWoman)">
        <circle cx="95" cy="148" r="22" />
        <path d="M 52 280 Q 52 188 95 188 Q 138 188 138 280 Z" />
        <path
          d="M 75 140 Q 95 128 115 140 L 115 155 Q 105 150 95 150 Q 85 150 75 155 Z"
          fill="#0b1222"
          opacity="0.5"
        />
      </g>
      {/* man right */}
      <g fill="url(#fcMedMan)">
        <circle cx="228" cy="152" r="22" />
        <path d="M 186 284 Q 186 192 228 192 Q 270 192 270 284 Z" />
      </g>
      {/* child front */}
      <g fill="url(#fcMedWoman)">
        <circle cx="160" cy="212" r="14" />
        <path d="M 138 300 Q 138 240 160 240 Q 182 240 182 300 Z" />
      </g>
    </svg>
  );
}
