'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './AcknowledgmentModal.module.css';

const STORAGE_KEY = 'acknowledgment_modal_dismissed';

export function AcknowledgmentModal() {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
      try {
        if (localStorage.getItem(STORAGE_KEY) === 'true') return;
      } catch {
        // localStorage unavailable — show the modal
      }
    }
    const timer = setTimeout(() => {
      setIsVisible(true);
      if (!isDev) {
        try {
          localStorage.setItem(STORAGE_KEY, 'true');
        } catch {
          // localStorage unavailable
        }
      }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    setIsClosing(true);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // localStorage unavailable
    }
    setTimeout(() => {
      setIsVisible(false);
    }, 350);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    },
    [handleDismiss],
  );

  if (!isVisible) return null;

  return (
    <div
      className={`${styles.overlay} ${isClosing ? styles.overlayClosing : ''}`}
      onClick={handleDismiss}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      {/* Confetti particles */}
      <div className={styles.confettiContainer} aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => (
          <span key={i} className={styles.confetti} style={{
            '--delay': `${Math.random() * 3}s`,
            '--x-start': `${Math.random() * 100}vw`,
            '--x-drift': `${(Math.random() - 0.5) * 120}px`,
            '--size': `${4 + Math.random() * 6}px`,
            '--duration': `${3 + Math.random() * 4}s`,
            '--color': ['#f6ad55', '#f5a623', '#63b3ed', '#4a90d9', '#ed64a6', '#38b2ac', '#fff'][Math.floor(Math.random() * 7)],
            '--rotation': `${Math.random() * 360}deg`,
          } as React.CSSProperties} />
        ))}
      </div>

      <div
        className={`${styles.modal} ${isClosing ? styles.modalClosing : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="شكر وتقدير"
      >
        {/* Golden glow behind top */}
        <div className={styles.glow} aria-hidden="true" />

        {/* Decorative star burst */}
        <div className={styles.starBurst} aria-hidden="true">
          <span className={styles.star}>&#10022;</span>
        </div>

        {/* Top ornament */}
        <div className={styles.ornament} aria-hidden="true">
          <span className={styles.ornamentLine} />
          <span className={styles.ornamentDiamond} />
          <span className={styles.ornamentLine} />
        </div>

        <h2 className={styles.title}>الحمد لله على التمام</h2>

        <div className={styles.body}>
          <p className={styles.paragraph}>
            أحمد الله على توفيقه ومنه بصدور النسخة الأولية لهذا الموقع.
          </p>

          <p className={styles.paragraph}>
            ثم أشكر أخي <span className={styles.name}>خالد سعيّد</span> على مبادرته بتجميع المعلومات الخاصة بشجرة عائلتنا،
            وأشكر <span className={styles.name}>أمي فدوى وأبي عبدالناصر وزوجتي رغد وعمي عبدالغني وعمتي غادة</span> على مساهمتهم
            الكبيرة في إنشاء الأشجار المختلفة لعوائلنا القريبة، <span className={styles.family}>سعيّد</span> و<span className={styles.family}>شربك</span> و<span className={styles.family}>الدالاتي</span> و<span className={styles.family}>الدباغ</span>، وأشكر <span className={styles.name}>إخوتي</span> وكل من ساهم وأضاف معلومات ثمينة لجعل هذه
            الأشجار تزدهر بالفروع والأوراق.
          </p>

          <p className={styles.paragraph}>
            هذه الأشجار بين أيديكم، وأصبح بإمكان الجميع من مختلف العوائل إنشاء الأشجار الخاصة بهم
            وإدارتها.
          </p>
        </div>

        <p className={styles.signature}>باسل سعيّد</p>

        {/* Bottom ornament */}
        <div className={styles.ornament} aria-hidden="true">
          <span className={styles.ornamentLine} />
          <span className={styles.ornamentDiamond} />
          <span className={styles.ornamentLine} />
        </div>

        <button
          className={styles.dismissButton}
          onClick={handleDismiss}
          type="button"
          autoFocus
        >
          ابدأ
        </button>
      </div>
    </div>
  );
}
