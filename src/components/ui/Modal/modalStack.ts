'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * The open overlays (ui/Modal and the full-screen viewers), bottom → top.
 * Only the top one answers Esc and backdrop clicks, and the body stays
 * scroll-locked until the last one closes. Module-level on purpose: every
 * overlay in the page shares one stack.
 */
const stack: symbol[] = [];
let savedOverflow: string | null = null;

function push(id: symbol): void {
  if (stack.length === 0 && typeof document !== 'undefined') {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  stack.push(id);
}

function remove(id: symbol): void {
  const i = stack.indexOf(id);
  if (i !== -1) stack.splice(i, 1);
  if (stack.length === 0 && savedOverflow !== null && typeof document !== 'undefined') {
    document.body.style.overflow = savedOverflow;
    savedOverflow = null;
  }
}

/**
 * Register an open overlay. Returns `isTop()` — true while nothing else has
 * opened above it. Pass `active = false` for a closed overlay.
 */
export function useModalStackEntry(active: boolean): () => boolean {
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol('modal');

  useEffect(() => {
    if (!active) return;
    const id = idRef.current as symbol;
    push(id);
    return () => remove(id);
  }, [active]);

  return useCallback(() => stack.length > 0 && stack[stack.length - 1] === idRef.current, []);
}
