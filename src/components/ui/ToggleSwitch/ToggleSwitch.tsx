import styles from './ToggleSwitch.module.css';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  className?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  loading = false,
  id,
  className,
}: ToggleSwitchProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading}
      disabled={isDisabled}
      className={[
        styles.track,
        checked ? styles.trackOn : '',
        isDisabled ? styles.trackDisabled : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span
        className={[styles.thumb, checked ? styles.thumbOn : '']
          .filter(Boolean)
          .join(' ')}
      >
        {loading && <span className={styles.thumbSpinner} />}
      </span>
    </button>
  );
}
