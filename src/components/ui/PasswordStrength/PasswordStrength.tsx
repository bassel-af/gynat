import type { PasswordRequirement } from '@/hooks/usePasswordStrength';
import styles from './PasswordStrength.module.css';

const SEGMENT_COUNT = 4;

export function RequirementsList({ requirements }: { requirements: PasswordRequirement[] }) {
  return (
    <ul className={styles.requirements}>
      {requirements.map((req) => (
        <li
          key={req.label}
          className={`${styles.requirement} ${req.met ? styles.requirementMet : styles.requirementUnmet}`}
        >
          <span className={styles.requirementIcon}>
            {req.met ? '\u2713' : '\u2717'}
          </span>
          {req.label}
        </li>
      ))}
    </ul>
  );
}

export function StrengthMeter({ score, label, feedback }: {
  score: number | null;
  label: string;
  feedback: string[];
}) {
  if (score === null) return null;

  const colorClass =
    score <= 1
      ? styles.strengthWeak
      : score === 2
        ? styles.strengthFair
        : score === 3
          ? styles.strengthGood
          : styles.strengthStrong;

  return (
    <div className={styles.strengthContainer}>
      <div className={styles.strengthMeterRow}>
        <div className={styles.strengthMeter} role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={4} aria-label="قوة كلمة المرور">
          {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
            <div
              key={i}
              className={`${styles.strengthSegment} ${i < score ? colorClass : ''}`}
              data-active={i < score ? '' : undefined}
            />
          ))}
        </div>
        <span className={`${styles.strengthLabel} ${colorClass}`}>{label}</span>
      </div>
      {score < 3 && feedback.length > 0 && (
        <ul className={styles.strengthFeedback}>
          {feedback.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
