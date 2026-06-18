/**
 * The share-node glyph (three circles + connecting lines) used by the ONE
 * publish action everywhere it appears — the tree top bar (`CanvasToolbar`) and
 * every trees-list row (`TreesArea`). Extracted to a single source so the icon
 * can never visually diverge between the two entry points. Purely presentational.
 */
export function PublishIcon({
  size = 12,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="2.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="19" r="2.4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8.1 10.9l7.8-4.4M8.1 13.1l7.8 4.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
