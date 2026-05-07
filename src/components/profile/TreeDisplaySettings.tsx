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
      {/* Color picker tiles */}
      <div className={styles.colorTiles}>
        <label className={styles.colorTile}>
          <div
            className={styles.swatch}
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
          <span className={styles.colorLabel}>لون عقد الذكور</span>
        </label>

        <label className={styles.colorTile}>
          <div
            className={styles.swatch}
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
          <span className={styles.colorLabel}>لون عقد الإناث</span>
        </label>
      </div>

      {/* Live preview */}
      <div className={styles.previewStage}>
        <div className={styles.previewLabel}>معاينة</div>
        <div className={styles.previewCards}>
          <div
            className={styles.previewCard}
            style={{ borderTopColor: settings.maleNodeColor }}
          >
            <div className={styles.previewCardName}>محمد</div>
            <div className={styles.previewCardDates}>1950 - 2020</div>
          </div>
          <div className={styles.previewConnector}>
            <div className={styles.previewConnectorLine} />
          </div>
          <div
            className={styles.previewCard}
            style={{ borderTopColor: settings.femaleNodeColor }}
          >
            <div className={styles.previewCardName}>فاطمة</div>
            <div className={styles.previewCardDates}>1955 - 2018</div>
          </div>
        </div>
      </div>

      {/* Reset */}
      <div className={styles.resetFooter}>
        <span
          className={`${styles.resetHint} ${resetSuccess ? styles.resetHintSuccess : ''}`}
        >
          {resetSuccess
            ? 'تم إعادة تعيين الألوان'
            : 'الألوان الافتراضية: أخضر للذكور، وردي للإناث'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={handleReset}
          disabled={isDefault}
        >
          إعادة تعيين
        </Button>
      </div>
    </div>
  );
}
