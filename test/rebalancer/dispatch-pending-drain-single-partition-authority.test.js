/**
 * Regression for the single-authority simplification of the dispatch-pending drain gate.
 *
 * The drain re-drive previously checked partition scope in TWO places that encoded the
 * identical 5-table set: the outer gate `shouldReconcilePriorityRecoveryDispatchPendingDrain`
 * (via a hardcoded PRIORITY_RECOVERY_DISPATCH_PENDING_DRAIN_PARTITION_IDS set) and the inner
 * drain-candidate gate `isPriorityRecoveryOperationDrainCandidate` (via
 * isPriorityControlPlanePartition). The outer pre-filter was redundant with — and could drift
 * from — the inner authority, so it was removed: partition scope is now owned SOLELY by the
 * inner candidate gate.
 *
 * This pins that the outer gate is partition-agnostic (a non-priority partition no longer
 * short-circuits here; it falls through to reconcile, which NOOPs for non-candidates) and
 * that every lifecycle/ownership safety conjunct still gates unchanged.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildPriorityRecoveryDispatchPendingDrainEvidence,
  shouldReconcilePriorityRecoveryDispatchPendingDrain,
} from '../../src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED,
} from '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const {
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} = SHARED;

const PRIORITY_PARTITION =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
const NON_PRIORITY_PARTITION = 'indices-p1';

function buildDrainReadySnapshot(partitionId, overrides = {}) {
  return {
    partitionId,
    completion: {state: PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED},
    actuation: {
      state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    },
    progress: {
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    },
    ...overrides,
  };
}

const owner = {buildPriorityRecoveryDispatchPendingDrainEvidence};

test('the drain gate is partition-agnostic (single authority = inner candidate gate)', (t) => {
  // Identical lifecycle conjuncts → identical verdict, regardless of partition. The outer
  // gate no longer encodes a partition pre-filter that could drift from the inner authority.
  t.equal(
    shouldReconcilePriorityRecoveryDispatchPendingDrain(
      owner, buildDrainReadySnapshot(PRIORITY_PARTITION)),
    true,
    'priority control-plane partition passes the gate');
  t.equal(
    shouldReconcilePriorityRecoveryDispatchPendingDrain(
      owner, buildDrainReadySnapshot(NON_PRIORITY_PARTITION)),
    true,
    'non-priority partition also passes the OUTER gate — partition scope is decided downstream');
  t.end();
});

test('the drain evidence no longer carries a partition-scope field', (t) => {
  const evidence = buildPriorityRecoveryDispatchPendingDrainEvidence(
    buildDrainReadySnapshot(NON_PRIORITY_PARTITION));
  t.equal('priorityDrainPartition' in evidence, false,
    'the redundant priorityDrainPartition evidence field is gone');
  t.equal(evidence.completionAccepted, true, 'lifecycle conjuncts are unchanged');
  t.equal(evidence.persistedNotDispatched, true, 'lifecycle conjuncts are unchanged');
  t.equal(evidence.dispatchPending, true, 'lifecycle conjuncts are unchanged');
  t.equal(evidence.ownerProgressRequested, true, 'lifecycle conjuncts are unchanged');
  t.equal(evidence.workflowProgressBoundary, true, 'lifecycle conjuncts are unchanged');
  t.end();
});

test('every lifecycle/ownership safety conjunct still gates the drain', (t) => {
  const brokenConjuncts = [
    ['completionAccepted', {completion: {state: 'rejected_unknown_state'}}],
    [
      'persistedNotDispatched',
      {actuation: {
        state: 'dispatched_unknown_state',
        workflowProgressPhaseId:
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      }},
    ],
    [
      'ownerProgressRequested',
      {progress: {
        workflowProgressPhaseId:
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
        currentOwner: 'some_other_owner',
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
        waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      }},
    ],
  ];
  for (const [conjunct, override] of brokenConjuncts) {
    // Use the priority partition so the only thing that can fail is the broken conjunct.
    const snapshot = buildDrainReadySnapshot(PRIORITY_PARTITION, override);
    t.equal(
      shouldReconcilePriorityRecoveryDispatchPendingDrain(owner, snapshot),
      false,
      `the gate still blocks when ${conjunct} is unsatisfied`);
  }
  t.end();
});
