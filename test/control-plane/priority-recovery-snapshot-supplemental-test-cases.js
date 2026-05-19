import {registerPriorityRecoverySnapshotSupplementalDispatchPendingOwnerProgressTests} from './priority-recovery-snapshot-supplemental-dispatch-pending-owner-progress-test-cases.js';
import {registerPriorityRecoverySnapshotSupplementalSerialWaitStaleSourceTests} from './priority-recovery-snapshot-supplemental-serial-wait-stale-source-test-cases.js';
import {registerPriorityRecoverySnapshotSupplementalSerialWaitMixedSummarySourceContextTests} from './priority-recovery-snapshot-supplemental-serial-wait-mixed-summary-source-context-test-cases.js';
import {registerPriorityRecoverySnapshotSupplementalSerialWaitMixedSummarySpreadSatisfiedTests} from './priority-recovery-snapshot-supplemental-serial-wait-mixed-summary-spread-satisfied-test-cases.js';
import {registerPriorityRecoverySnapshotSupplementalSerialWaitSpreadSatisfiedSiblingTests} from './priority-recovery-snapshot-supplemental-serial-wait-spread-satisfied-sibling-test-cases.js';
import {registerPriorityRecoverySnapshotSupplementalTerminalSerialWaitCarriersTests} from './priority-recovery-snapshot-supplemental-terminal-serial-wait-carriers-test-cases.js';
import {registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitCarriersTests} from './priority-recovery-snapshot-supplemental-retained-serial-wait-carriers-test-cases.js';
import {registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitReleaseTests} from './priority-recovery-snapshot-supplemental-retained-serial-wait-release-test-cases.js';
import {registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitPreserveRestorationTests} from './priority-recovery-snapshot-supplemental-retained-serial-wait-preserve-restoration-test-cases.js';

export function registerPriorityRecoverySnapshotSupplementalTests(
  context,
) {
  registerPriorityRecoverySnapshotSupplementalDispatchPendingOwnerProgressTests(context);
  registerPriorityRecoverySnapshotSupplementalSerialWaitStaleSourceTests(context);
  registerPriorityRecoverySnapshotSupplementalSerialWaitMixedSummarySourceContextTests(context);
  registerPriorityRecoverySnapshotSupplementalSerialWaitMixedSummarySpreadSatisfiedTests(context);
  registerPriorityRecoverySnapshotSupplementalSerialWaitSpreadSatisfiedSiblingTests(context);
  registerPriorityRecoverySnapshotSupplementalTerminalSerialWaitCarriersTests(context);
  registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitCarriersTests(context);
  registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitReleaseTests(context);
  registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitPreserveRestorationTests(context);
}
