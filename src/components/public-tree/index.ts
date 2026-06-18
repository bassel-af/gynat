/**
 * Public Tree — presentational component library.
 *
 * Static/visual building blocks for the Public Tree feature. All are
 * props-driven and carry no data fetching or business logic; the TDD phase
 * feeds them server-computed view models. See each component's index for its
 * prop and view-model types.
 */

export { PublicTreeHeader } from './PublicTreeHeader';
export type { PublicTreeHeaderProps } from './PublicTreeHeader';

export { PublicGrowthCTA } from './PublicGrowthCTA';
export type { PublicGrowthCTAProps } from './PublicGrowthCTA';

export { PublicTreeState } from './PublicTreeState';
export type { PublicTreeStateProps, PublicTreeStateVariant } from './PublicTreeState';

export { VisibilityLadder } from './VisibilityLadder';
export type { VisibilityLadderProps, VisibilityLevel } from './VisibilityLadder';

export { PublishCheckpoint } from './PublishCheckpoint';
export type {
  PublishCheckpointProps,
  CheckpointPerson,
  CheckpointHousehold,
  PublishCheckpointData,
} from './PublishCheckpoint';

export { MakePrivateDialog } from './MakePrivateDialog';
export type { MakePrivateDialogProps } from './MakePrivateDialog';

export { ReportForm } from './ReportForm';
export type { ReportFormProps } from './ReportForm';

export { PublishSuccess } from './PublishSuccess';
export type { PublishSuccessProps } from './PublishSuccess';

export { ManagePublicPanel } from './ManagePublicPanel';
export type { ManagePublicPanelProps } from './ManagePublicPanel';

export { SearchIrreversibleWarning } from './SearchIrreversibleWarning';
export type { SearchIrreversibleWarningProps } from './SearchIrreversibleWarning';

export { PublishFlow } from './PublishFlow';
export type { PublishFlowProps } from './PublishFlow';

export { PublicTreeViewer } from './PublicTreeViewer';
export type { PublicTreeViewerProps } from './PublicTreeViewer';

export { PublishIcon } from './PublishIcon';

export { PublishFlowContainer } from './PublishFlowContainer';

// NOTE: the SAMPLE_* dev fixtures are intentionally NOT re-exported from this
// production barrel — dev-harness routes import them by full path.

// Local shared overlay helper (intentionally not a ui/ export — see component doc).
export { HeritageOverlay } from './HeritageOverlay';
export type { HeritageOverlayProps } from './HeritageOverlay';
