/**
 * Single owner of replica-operation STEP-COVERAGE policy (quest
 * step-coverage-single-owner-table; epic self-hosting-circularity-
 * generic-treatment Option 5, rung 2 — the CL-029 lineage).
 *
 * "Which WORKFLOW_STEP values of which operation type does THIS mechanism
 * cover" used to be enumerated ad hoc at every call site (24 hand-rolled
 * sets + 28 branch piles across 33 files), so coverage GAPS were invisible:
 * the dispatch-wake preempt set stopped one step short of target_sync
 * (CL-029), and the deferred-local-progress rows (CREATING, ACTIVE,
 * STOPPING) were each a separate production incident. This module declares
 * every coverage row ONCE, side by side, named after its mechanism.
 * Consumers import a row; they never enumerate steps inline. The census
 * analyzer (scripts/check-step-coverage-owner.js, npm run
 * audit:step-coverage-owner) counts any re-derivation outside this module
 * and replica-operation-progress.js (which owns the progression/terminal
 * tables).
 *
 * Rows deliberately DIFFER — that is the point of naming them. Review
 * question for every new mechanism: which existing row covers it, and if
 * none does, what is the new row's name and why does its coverage stop
 * where it stops?
 */
import {WORKFLOW_STEP} from '../constants/index.js';
import {OperationType} from './replica-status.js';
import {OPERATION_TRANSITION_REASON} from './rebalancer-constants.js';

// ---------------------------------------------------------------------------
// Dispatch-lane coverage
// ---------------------------------------------------------------------------

// Wake-driven progress preemption: wakeups can arrive after cache evidence
// has already moved the replica beyond the current durable step. CL-029's
// lost-completion class lived exactly at this row's boundary — extending or
// narrowing it is an incident-class decision, never a drive-by edit.
const DISPATCH_WAKE_PROGRESS_PREEMPT_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
  ]),
);

// Explicit runtime target outcomes can race ahead of the source owner's
// post-send CREATING commit. These are the only two durable steps at which the
// target wake may retain a serialized source-owner turn.
const RUNTIME_TARGET_PROGRESS_WAKE_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
  ]),
);

// Retention scope for the one-shot post-success dispatch verification only —
// never wake admission. The dispatch request row is built from the in-memory
// operation before the dispatch path claims SENDING, so a successful dispatch
// can be observed while the retained payload still says PENDING; the durable
// row has by then advanced, and dropping retention on the stale payload shape
// strands a lost-handoff CREATING ADD forever (quest
// runtime-service-add-creating-owner-rearm, live ADD bd00c558).
const RUNTIME_TARGET_PROGRESS_RETENTION_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
  ]),
);

// Generic replica ACTIVE outcomes may be observed remotely while their
// source-owned create workflow is still creating or syncing.
const TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
  ]),
);

// Owner-port reconcile of dispatch-pending rows.
const OPERATION_WORKFLOW_OWNER_PORT_RECONCILE_DISPATCH_PENDING_STEPS =
  Object.freeze(
    new Set([
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
    ]),
  );

// Priority dispatch durable-step mutations that run under the bounded
// operation budget instead of the unbounded persist-then-act gate.
const PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
  ]),
);

// Claimed but not yet handed to an executor — the pre-dispatch coverage row
// shared by the dispatch retry/replay/reconcile family.
const DISPATCH_PENDING_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
  ]),
);

// A REPLACE at ACTIVE is in its source-removal phase: the replacement is
// placed and the remaining dispatchable work is removing the superseded
// source replica.
function isActiveReplaceSourceRemovalPhase(operationType, workflowStep) {
  return (
    operationType === OperationType.REPLACE &&
    workflowStep === WORKFLOW_STEP.ACTIVE
  );
}

// Type-agnostic terminal markers used by remove-like in-flight gate checks
// (REMOVE/REPLACE rows only — an ADD terminates at ACTIVE and must not use
// this row; see OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE for typed truth).
const REMOVE_LIKE_TERMINAL_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.REMOVED,
    WORKFLOW_STEP.FAILED,
  ]),
);

// Priority-recovery diagnostic surface for rows stuck before dispatch.
const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_WORKFLOW_STEPS =
  Object.freeze(
    new Set([
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
    ]),
  );

// Steps at which an operation counts as DISPATCHED for the priority-recovery
// snapshot contract (everything past the claim, terminal steps excluded).
const PRIORITY_RECOVERY_DISPATCHED_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// ---------------------------------------------------------------------------
// Observed-progress / executor-outcome reconcile coverage
// ---------------------------------------------------------------------------

// Non-terminal steps whose observed target progress is worth reconciling.
const OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// Row steps eligible for observed-target-progress reconciliation.
const OBSERVED_OPERATION_ROW_TARGET_PROGRESS_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
  ]),
);

// REPLACE source-removal phase as seen by observed progress.
const OBSERVED_PROGRESS_REPLACE_SOURCE_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// Rows still admissible for a target CREATING create-reconcile.
const TARGET_CREATING_CREATE_ADMISSION_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
  ]),
);

// Executor step-update outcomes applied through the reconcile lane.
const EXECUTOR_STEP_UPDATE_RECONCILE_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.ACTIVE,
  ]),
);

// ---------------------------------------------------------------------------
// Priority-recovery drain / visibility coverage
// ---------------------------------------------------------------------------

// Every non-terminal step participates in the priority-recovery drain.
const PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// REPLACE steps whose drain hold releases on completed placement.
const PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_REPLACE_WORKFLOW_STEPS =
  Object.freeze(
    new Set([
      WORKFLOW_STEP.ACTIVE,
      WORKFLOW_STEP.STOPPING,
    ]),
  );

// Incomplete-operation visibility reads (repository incomplete-read lane).
const PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// Canonical ordered non-terminal step list for incomplete-read SQL/display
// lanes (same membership as the visibility set, order significant).
const PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STEP_ORDER = Object.freeze([
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
  WORKFLOW_STEP.SYNCING,
  WORKFLOW_STEP.STOPPING,
  WORKFLOW_STEP.ACTIVE,
]);

// Cache-side incompleteness: these steps are in-flight for EVERY operation
// type; ACTIVE is handled by isIncompleteOperationRowStep below because an
// ADD at ACTIVE is terminal while remove-phase types still have work left.
const INCOMPLETE_OPERATION_UNCONDITIONAL_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.STOPPING,
  ]),
);

const INCOMPLETE_OPERATION_ACTIVE_STEP_TYPES = Object.freeze(
  new Set([OperationType.REPLACE, OperationType.REMOVE]),
);

function isIncompleteOperationRowStep(operationType, workflowStep) {
  if (workflowStep === WORKFLOW_STEP.ACTIVE) {
    return INCOMPLETE_OPERATION_ACTIVE_STEP_TYPES.has(operationType);
  }
  return INCOMPLETE_OPERATION_UNCONDITIONAL_WORKFLOW_STEPS.has(workflowStep);
}

// Steps whose age counts against the priority-recovery step timeout.
const PRIORITY_RECOVERY_WORKFLOW_TIMEOUT_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// ---------------------------------------------------------------------------
// Pre-sync phase coverage
// ---------------------------------------------------------------------------

// Steps strictly before data sync begins: no replica data movement has
// happened yet, so lifecycle actions may recreate/retarget freely.
const PRE_SYNC_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
  ]),
);

// Pre-sync REPLACE rows in priority recovery (same boundary, REPLACE lane).
const PRIORITY_RECOVERY_PRE_SYNC_REPLACE_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
  ]),
);

// ---------------------------------------------------------------------------
// Coordinator / intent / lane-admission coverage
// ---------------------------------------------------------------------------

// Recent-intent-miss reuse extends only to rows not yet dispatched.
const PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_WORKFLOW_STEPS =
  Object.freeze(
    new Set([
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
    ]),
  );

// Priority control-plane REMOVE-lane admission per operation type: REMOVEs
// conflict only while pre-dispatch or stopping; REPLACEs occupy the lane
// across their whole non-terminal life.
const PRIORITY_CONTROL_PLANE_REMOVE_LANE_WORKFLOW_STEPS_BY_TYPE =
  Object.freeze(
    new Map([
      [
        OperationType.REMOVE,
        Object.freeze(
          new Set([
            WORKFLOW_STEP.PENDING,
            WORKFLOW_STEP.SENDING,
            WORKFLOW_STEP.STOPPING,
          ]),
        ),
      ],
      [
        OperationType.REPLACE,
        Object.freeze(
          new Set([
            WORKFLOW_STEP.PENDING,
            WORKFLOW_STEP.SENDING,
            WORKFLOW_STEP.CREATING,
            WORKFLOW_STEP.SYNCING,
            WORKFLOW_STEP.ACTIVE,
            WORKFLOW_STEP.STOPPING,
          ]),
        ),
      ],
    ]),
  );

// Coordinator-side "the operation made real progress" watermark.
const PRIORITY_RECOVERY_COORDINATOR_STEP_PROGRESS_SET = Object.freeze(
  new Set([
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.REMOVED,
  ]),
);

// ---------------------------------------------------------------------------
// Executor completion signaling (node/message-group/runtime handlers)
// ---------------------------------------------------------------------------

// Steps whose executor outcome message signals operation completion.
// Previously three IDENTICAL copies (replica-handler-constants,
// message-group-service-handler-constants, runtime-service-handler-constants)
// that could silently drift.
const OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.REMOVED,
    WORKFLOW_STEP.FAILED,
  ]),
);

// ---------------------------------------------------------------------------
// Dispatch phase windows and recovery classification
// ---------------------------------------------------------------------------

// The remove-phase dispatch window: a REPLACE removing its superseded source,
// or a REMOVE being re-driven, is dispatchable only at these steps.
const REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// REMOVE rows eligible for (re-)dispatch of the initial removal.
const REMOVE_INITIAL_DISPATCH_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.ACTIVE,
  ]),
);

// Create-rearm applies to placement-creating operation types (critical
// partitions, CREATING step; the caller owns those two checks).
const CREATE_REARM_DISPATCH_OPERATION_TYPES = Object.freeze(
  new Set([OperationType.ADD, OperationType.REPLACE]),
);

// Steps whose durable transitions run under the protected priority budget.
// CREATING is deliberately absent: it takes the bounded
// PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS lane instead.
const PROTECTED_PRIORITY_BUDGET_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// Steps whose reconciled replica status feeds a durable step advance.
const RECONCILE_REPLICA_STATUS_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
  ]),
);

// Node-recovery classification: rows at these steps are marked failed on
// recovery (pre-sync steps plus STOPPING); SYNCING rows reconcile instead.
const NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.STOPPING,
  ]),
);

// ---------------------------------------------------------------------------
// Transition-reason projection
// ---------------------------------------------------------------------------

// Canonical reason per durable step transition (next step -> reason), with
// the single progression-sensitive case: ACTIVE reached from SYNCING is a
// reconcile promotion, ACTIVE reached any other way means the dispatch found
// the replica already in place.
const OPERATION_TRANSITION_REASON_BY_NEXT_STEP = Object.freeze(new Map([
  [WORKFLOW_STEP.SENDING, OPERATION_TRANSITION_REASON.DISPATCH_SENDING],
  [WORKFLOW_STEP.CREATING, OPERATION_TRANSITION_REASON.DISPATCH_CREATING],
  [WORKFLOW_STEP.STOPPING, OPERATION_TRANSITION_REASON.DISPATCH_STOPPING],
  [WORKFLOW_STEP.REMOVED, OPERATION_TRANSITION_REASON.OPERATION_COMPLETED],
  [WORKFLOW_STEP.FAILED, OPERATION_TRANSITION_REASON.OPERATION_FAILED],
]));

function resolveOperationTransitionReason(previousStep, nextStep) {
  if (nextStep === WORKFLOW_STEP.ACTIVE) {
    return previousStep === WORKFLOW_STEP.SYNCING ?
      OPERATION_TRANSITION_REASON.RECONCILE_ACTIVE :
      OPERATION_TRANSITION_REASON.DISPATCH_ALREADY_EXISTS;
  }
  return OPERATION_TRANSITION_REASON_BY_NEXT_STEP.get(nextStep) ??
    OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
}

// ---------------------------------------------------------------------------
// Deferred owner-local progress (lever-(a) supersession) coverage
// ---------------------------------------------------------------------------

// Which operation types may take the owner-local deferred-progress escape at
// which executor-outcome step (priority control-plane partitions only; the
// caller owns the partition-class and retryable-error checks). Each row was
// a separate production incident before this table existed: CREATING
// (64a18b76, via the mutation-steps row above), ACTIVE (9ef19615),
// STOPPING (c6c35d7e). Terminal steps are deliberately absent: REMOVED flows
// exclusively through completeOperation, which owns its own durable
// convergence.
const PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP = Object.freeze(
  new Map([
    [
      WORKFLOW_STEP.ACTIVE,
      Object.freeze(new Set([OperationType.REPLACE])),
    ],
    [
      WORKFLOW_STEP.STOPPING,
      Object.freeze(
        new Set([OperationType.REPLACE, OperationType.REMOVE]),
      ),
    ],
  ]),
);

function isPriorityOutcomeDeferredLocalProgressCovered(operationType, step) {
  const coveredTypes =
    PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP.get(step);
  return coveredTypes ? coveredTypes.has(operationType) : false;
}

// Local projections consume these named predicates rather than rebuilding a
// multi-step branch pile beside the durable transition owner. Although each
// action covers one step today, naming the rows keeps later extensions in the
// policy table instead of silently widening only one projection path.
function shouldRetainPriorityActiveReplaceRetry(step) {
  return step === WORKFLOW_STEP.ACTIVE;
}

function shouldClearPriorityDeferredClaim(step) {
  return step === WORKFLOW_STEP.CREATING;
}

export {
  CREATE_REARM_DISPATCH_OPERATION_TYPES,
  DISPATCH_PENDING_WORKFLOW_STEPS,
  DISPATCH_WAKE_PROGRESS_PREEMPT_WORKFLOW_STEPS,
  NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS,
  PROTECTED_PRIORITY_BUDGET_WORKFLOW_STEPS,
  RECONCILE_REPLICA_STATUS_WORKFLOW_STEPS,
  REMOVE_INITIAL_DISPATCH_WORKFLOW_STEPS,
  REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS,
  RUNTIME_TARGET_PROGRESS_RETENTION_WORKFLOW_STEPS,
  RUNTIME_TARGET_PROGRESS_WAKE_WORKFLOW_STEPS,
  TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_WORKFLOW_STEPS,
  resolveOperationTransitionReason,
  EXECUTOR_STEP_UPDATE_RECONCILE_WORKFLOW_STEPS,
  OBSERVED_OPERATION_ROW_TARGET_PROGRESS_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_REPLACE_SOURCE_WORKFLOW_STEPS,
  OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
  OPERATION_WORKFLOW_OWNER_PORT_RECONCILE_DISPATCH_PENDING_STEPS,
  PRE_SYNC_WORKFLOW_STEPS,
  PRIORITY_CONTROL_PLANE_REMOVE_LANE_WORKFLOW_STEPS_BY_TYPE,
  PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS,
  PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP,
  PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_COORDINATOR_STEP_PROGRESS_SET,
  PRIORITY_RECOVERY_DISPATCHED_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STEP_ORDER,
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_REPLACE_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_WORKFLOW_TIMEOUT_STEPS,
  REMOVE_LIKE_TERMINAL_WORKFLOW_STEPS,
  TARGET_CREATING_CREATE_ADMISSION_WORKFLOW_STEPS,
  isActiveReplaceSourceRemovalPhase,
  isIncompleteOperationRowStep,
  isPriorityOutcomeDeferredLocalProgressCovered,
  shouldClearPriorityDeferredClaim,
  shouldRetainPriorityActiveReplaceRetry,
};
