/**
 * Small circular silhouette used inside person tree cards.
 * Gender-tinted (male: emerald/gold, female: rose/gold).
 */

type Sex = 'M' | 'F' | '' | string | undefined;

export function NodeSilhouette({
  sex,
  size = 40,
  className,
}: {
  sex?: Sex;
  size?: number;
  className?: string;
}) {
  const isFemale = sex === 'F';
  const gradientId = isFemale ? 'nsFemale' : 'nsMale';
  const ringId = isFemale ? 'nsRingF' : 'nsRingM';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
    >
      <defs>
        {/* Ring background — soft radial so the silhouette sits on a gem-like disc */}
        <radialGradient id={ringId} cx="30%" cy="25%" r="80%">
          {isFemale ? (
            <>
              <stop offset="0%" stopColor="rgba(244, 217, 192, 0.32)" />
              <stop offset="55%" stopColor="rgba(139, 92, 81, 0.28)" />
              <stop offset="100%" stopColor="rgba(7, 11, 24, 0.85)" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="rgba(230, 207, 158, 0.3)" />
              <stop offset="55%" stopColor="rgba(15, 58, 45, 0.5)" />
              <stop offset="100%" stopColor="rgba(7, 11, 24, 0.85)" />
            </>
          )}
        </radialGradient>

        {/* Silhouette fill */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          {isFemale ? (
            <>
              <stop offset="0%" stopColor="#f4d9c0" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#8c7441" stopOpacity="0.55" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#8c7441" stopOpacity="0.5" />
            </>
          )}
        </linearGradient>
      </defs>

      {/* disc */}
      <circle cx="24" cy="24" r="23" fill={`url(#${ringId})`} />
      <circle
        cx="24"
        cy="24"
        r="23"
        fill="none"
        stroke="rgba(200, 168, 101, 0.35)"
        strokeWidth="1"
      />

      {/* silhouette head + shoulders */}
      {isFemale ? (
        <g fill={`url(#${gradientId})`}>
          <circle cx="24" cy="18" r="6.5" />
          <path d="M 10 44 Q 12 30 24 28 Q 36 30 38 44 Z" />
          {/* veil shading */}
          <path
            d="M 17 13 Q 24 8 31 13 L 31 19 Q 27 16.5 24 16.5 Q 21 16.5 17 19 Z"
            fill="#070b18"
            opacity="0.45"
          />
        </g>
      ) : (
        <g fill={`url(#${gradientId})`}>
          <circle cx="24" cy="18" r="6.5" />
          <path d="M 11 42 Q 11 28 24 28 Q 37 28 37 42 Z" />
        </g>
      )}
    </svg>
  );
}
