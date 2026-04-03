'use client';

import { useEffect } from 'react';
import { getTreeColorSettings, lightenHex } from '@/lib/profile/tree-settings';

const CSS_VARS = ['--color-male', '--color-female', '--color-male-light', '--color-female-light'] as const;

function applyColors() {
  const settings = getTreeColorSettings();
  const style = document.documentElement.style;
  style.setProperty('--color-male', settings.maleNodeColor);
  style.setProperty('--color-female', settings.femaleNodeColor);
  style.setProperty('--color-male-light', lightenHex(settings.maleNodeColor, 0.5));
  style.setProperty('--color-female-light', lightenHex(settings.femaleNodeColor, 0.5));
}

/**
 * Reads tree color settings from localStorage and applies them as CSS custom
 * properties on `document.documentElement`. Listens for cross-tab `storage`
 * events to stay in sync. Removes the custom properties on unmount.
 */
export function useTreeColorOverrides(): void {
  useEffect(() => {
    applyColors();

    function handleStorage(e: StorageEvent) {
      if (e.key === 'solalah:tree-display-settings' || e.key === null) {
        applyColors();
      }
    }

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      const style = document.documentElement.style;
      for (const v of CSS_VARS) {
        style.removeProperty(v);
      }
    };
  }, []);
}
