'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import {
  getTreeColorSettings,
  saveTreeColorSettings,
  resetTreeColorSettings,
  DEFAULT_MALE_COLOR,
  DEFAULT_FEMALE_COLOR,
  type TreeColorSettings,
} from '@/lib/profile/tree-settings';
import styles from './TreeDisplaySettings.module.css';

export function TreeDisplaySettings() {
  const [settings, setSettings] = useState<TreeColorSettings>({
    maleNodeColor: DEFAULT_MALE_COLOR,
    femaleNodeColor: DEFAULT_FEMALE_COLOR,
  });
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    setSettings(getTreeColorSettings());
  }, []);

  const handleColorChange = useCallback(
    (key: keyof TreeColorSettings, value: string) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveTreeColorSettings(next);
        return next;
      });
      setResetSuccess(false);
    },
    [],
  );

  const handleReset = useCallback(() => {
    resetTreeColorSettings();
    setSettings({ maleNodeColor: DEFAULT_MALE_COLOR, femaleNodeColor: DEFAULT_FEMALE_COLOR });
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 2000);
  }, []);

  const isDefault =
    settings.maleNodeColor === DEFAULT_MALE_COLOR &&
    settings.femaleNodeColor === DEFAULT_FEMALE_COLOR;

  return (
    <div className={styles.wrapper}>
      {/* Male node color */}
      <div className={styles.colorRow}>
        <div className={styles.colorInfo}>
          <span className={styles.colorLabel}>لون عقد الذكور</span>
          <span className={styles.colorHex}>{settings.maleNodeColor}</span>
        </div>
        <div
          className={styles.swatchButton}
          style={{ backgroundColor: settings.maleNodeColor }}
        >
          <input
            type="color"
            className={styles.colorInput}
            value={settings.maleNodeColor}
            onChange={(e) => handleColorChange('maleNodeColor', e.target.value)}
            aria-label="لون عقد الذكور"
          />
        </div>
      </div>

      {/* Female node color */}
      <div className={styles.colorRow}>
        <div className={styles.colorInfo}>
          <span className={styles.colorLabel}>لون عقد الإناث</span>
          <span className={styles.colorHex}>{settings.femaleNodeColor}</span>
        </div>
        <div
          className={styles.swatchButton}
          style={{ backgroundColor: settings.femaleNodeColor }}
        >
          <input
            type="color"
            className={styles.colorInput}
            value={settings.femaleNodeColor}
            onChange={(e) => handleColorChange('femaleNodeColor', e.target.value)}
            aria-label="لون عقد الإناث"
          />
        </div>
      </div>

      <hr className={styles.divider} />

      {/* Preview */}
      <div className={styles.previewStrip}>
        <div
          className={styles.previewCard}
          style={{ borderTopColor: settings.maleNodeColor }}
        >
          <div className={styles.previewCardLabel}>محمد</div>
          <div className={styles.previewCardSub}>1950 - 2020</div>
        </div>
        <div
          className={styles.previewCard}
          style={{ borderTopColor: settings.femaleNodeColor }}
        >
          <div className={styles.previewCardLabel}>فاطمة</div>
          <div className={styles.previewCardSub}>1955 - 2018</div>
        </div>
      </div>

      {/* Reset */}
      <div className={styles.resetRow}>
        <span className={styles.resetHint}>
          {resetSuccess ? 'تم إعادة تعيين الألوان' : 'الألوان الافتراضية: أزرق للذكور، وردي للإناث'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={handleReset}
          disabled={isDefault}
        >
          إعادة تعيين الألوان
        </Button>
      </div>
    </div>
  );
}
