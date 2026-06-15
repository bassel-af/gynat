/**
 * View-model types for the publish checkpoint.
 *
 * These describe the PRESENTATION shape the component renders. The TDD phase
 * computes this from the tree (living-status rule: not deceased AND not 130+ by
 * birth date; no-date + no-mark = living) — the component never derives any of
 * it; it only renders what it's given. Prop shape proposed to software-architect
 * for alignment with the server-side living-people computation.
 */

export interface CheckpointPerson {
  id: string;
  name: string;
  gender: 'male' | 'female';
  /** Short meta line under the name (e.g. "وُلد ١٩٧٢" or an attention reason). */
  meta: string;
  /** True when the person has no birth date AND no deceased mark. */
  needsAttention?: boolean;
}

export interface CheckpointHousehold {
  id: string;
  /** Household display title, e.g. "بيت أحمد السعيد". */
  title: string;
  members: CheckpointPerson[];
}

export interface PublishCheckpointData {
  /** Total count of living people who will be shown publicly. */
  livingCount: number;
  /** People needing attention (no birth date), surfaced first. */
  attention: CheckpointPerson[];
  /** Remaining living people grouped by household. */
  households: CheckpointHousehold[];
}
