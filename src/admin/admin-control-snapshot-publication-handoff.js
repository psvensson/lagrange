/**
 * Publication handoff refresh and deferral helpers for admin control snapshots.
 */
import {NUM, TYPEOF} from '../constants/index.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from './admin-constants.js';
import {
  buildPublicationActiveGateOwnerOutcomeEnvelope,
  selectPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../control-plane/control-plane-error-classification.js';
import {
  OWNER_OUTCOME_FRESHNESS,
  OWNER_OUTCOME_STATE,
} from '../control-plane/owner-outcome-contract.js';
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: '',
});
const CONTROL_SNAPSHOT_ABSENT_HANDOFF_OUTCOME = null;
const CONTROL_SNAPSHOT_ABSENT_HANDOFF_RETRY_AFTER_MS = null;
const CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD =
  'controlPlaneDiagnostics';
const CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD =
  'publicationConvergence';
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD =
  'activeGateOwnerCohort';
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD =
  'membershipPublicationHandoffOutcome';
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE =
  Object.freeze({
    PUBLISHED_VISIBLE: 'published_visible',
    WRITE_DEFERRED: 'write_deferred',
  });
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD =
  Object.freeze({
    ENQUEUED: 'enqueued',
    PUBLICATION_ROW: 'publicationRow',
    RETRY_AFTER_MS: 'retryAfterMs',
    STATE: 'state',
  });
const CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD = Object.freeze({
  NEXT_ACTION: 'nextAction',
  PENDING_RECOVERY_COUNT: 'pendingRecoveryCount',
  PENDING_RECOVERY_NODE_IDS: 'pendingRecoveryNodeIds',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  REASON_CODE: 'reasonCode',
  RUNTIME_PROMOTION_ALLOWED: 'runtimePromotionAllowed',
  STATE: 'state',
});
const CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON =
  Object.freeze({
    OWNER_RECONCILE_PENDING: 'owner_reconcile_pending',
  });
const CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD =
  'controlPlaneConvergence';
const CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD =
  'criticalConvergenceDeferred';
const CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD =
  'ordinaryRepairDeferred';
const CONTROL_SNAPSHOT_PRESSURE_OUTCOME_FIELD = 'pressureOutcome';
const CONTROL_SNAPSHOT_RETRY_AFTER_MS_FIELD = 'retryAfterMs';
const CONTROL_SNAPSHOT_NODES_FIELD = 'nodes';
const CONTROL_SNAPSHOT_OWNER_OUTCOME_STATE_PROGRESS_RANK = Object.freeze({
  [OWNER_OUTCOME_STATE.FAILED]: NUM.ZERO,
  [OWNER_OUTCOME_STATE.BLOCKED]: NUM.ONE,
  [OWNER_OUTCOME_STATE.DEFERRED]: NUM.TWO,
  [OWNER_OUTCOME_STATE.PENDING]: NUM.THREE,
  [OWNER_OUTCOME_STATE.READY]: NUM.FOUR,
});
const CONTROL_SNAPSHOT_OWNER_OUTCOME_FRESHNESS_PROGRESS_RANK = Object.freeze({
  [OWNER_OUTCOME_FRESHNESS.UNKNOWN]: NUM.ZERO,
  [OWNER_OUTCOME_FRESHNESS.STALE]: NUM.ONE,
  [OWNER_OUTCOME_FRESHNESS.FRESH]: NUM.TWO,
});
function normalizeControlSnapshotNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : ADMIN_CACHE_DUMP.EMPTY)
      .map((value) =>
        typeof value === TYPEOF.STRING ?
          value.trim() :
          ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
      )
      .filter((value) => value.length > NUM.ZERO),
  )].sort((left, right) => left.localeCompare(right));
}
function attachMembershipPublicationHandoffOutcome(snapshot, outcome) {
  if (
    !snapshot ||
    typeof snapshot !== TYPEOF.OBJECT ||
    !outcome ||
    typeof outcome !== TYPEOF.OBJECT
  ) {
    return snapshot;
  }
  const controlPlaneDiagnostics =
    snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] &&
      typeof snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] ===
        TYPEOF.OBJECT ?
      snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] :
      {};
  const activeGateOwnerCohort =
    controlPlaneDiagnostics[CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD] &&
      typeof controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD
      ] === TYPEOF.OBJECT ?
      controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD
      ] :
      {};
  const publicationConvergence =
    controlPlaneDiagnostics[CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD] &&
      typeof controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
      ] === TYPEOF.OBJECT &&
      !Array.isArray(
        controlPlaneDiagnostics[
          CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
        ],
      ) ?
      controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
      ] :
      null;
  const controlPlaneConvergence =
    outcome[CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD] &&
      typeof outcome[CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD] ===
        TYPEOF.OBJECT ?
      outcome[CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD] :
      null;
  const pressureOutcome =
    typeof controlPlaneConvergence?.[
      CONTROL_SNAPSHOT_PRESSURE_OUTCOME_FIELD
    ] === TYPEOF.STRING ?
      controlPlaneConvergence[CONTROL_SNAPSHOT_PRESSURE_OUTCOME_FIELD] :
      outcome.controlPlanePressureOutcome;
  const criticalConvergenceDeferred =
    pressureOutcome ===
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED ||
    pressureOutcome ===
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED;
  snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] = {
    ...controlPlaneDiagnostics,
    [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD]:
      outcome,
    ...(controlPlaneConvergence ?
      {
        [CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD]:
          controlPlaneConvergence,
        [CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD]:
          criticalConvergenceDeferred,
        [CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD]: false,
      } :
      {}),
    ...(publicationConvergence ?
      {
        [CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD]: {
          ...publicationConvergence,
          [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD]:
            outcome,
          ...(controlPlaneConvergence ?
            {
              [CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD]:
                controlPlaneConvergence,
              [CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD]:
                criticalConvergenceDeferred,
              [CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD]: false,
            } :
            {}),
        },
      } :
      {}),
    [CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD]: {
      ...activeGateOwnerCohort,
      [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD]:
        outcome,
      ...(controlPlaneConvergence ?
        {
          [CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD]:
            controlPlaneConvergence,
          [CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD]:
            criticalConvergenceDeferred,
          [CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD]: false,
        } :
        {}),
    },
  };
  return snapshot;
}

function selectMembershipPublicationHandoffOutcome(snapshot = null) {
  const controlPlaneDiagnostics =
    snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
  if (
    !controlPlaneDiagnostics ||
    typeof controlPlaneDiagnostics !== TYPEOF.OBJECT ||
    Array.isArray(controlPlaneDiagnostics)
  ) {
    return CONTROL_SNAPSHOT_ABSENT_HANDOFF_OUTCOME;
  }
  const outcomeCandidates = [
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
    ],
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
    ]?.[CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD],
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD
    ]?.[CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD],
  ];
  return outcomeCandidates.find((candidate) =>
    candidate &&
    typeof candidate === TYPEOF.OBJECT &&
    !Array.isArray(candidate),
  ) || CONTROL_SNAPSHOT_ABSENT_HANDOFF_OUTCOME;
}

function isVisibleMembershipPublicationHandoffOutcome(outcome = null) {
  return (
    outcome &&
    typeof outcome === TYPEOF.OBJECT &&
    !Array.isArray(outcome) &&
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD.STATE
    ] ===
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE
        .PUBLISHED_VISIBLE &&
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
        .PUBLICATION_ROW
    ] &&
    typeof outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
        .PUBLICATION_ROW
    ] === TYPEOF.OBJECT &&
    !Array.isArray(
      outcome[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
          .PUBLICATION_ROW
      ],
    )
  );
}

function normalizeControlSnapshotRetryAfterMs(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > NUM.ZERO ?
    Math.floor(numericValue) :
    null;
}

function selectMembershipPublicationHandoffRetryAfterMs(snapshot = null) {
  const outcome = selectMembershipPublicationHandoffOutcome(snapshot);
  if (
    !outcome ||
    typeof outcome !== TYPEOF.OBJECT ||
    Array.isArray(outcome) ||
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD.STATE
    ] !==
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE
        .WRITE_DEFERRED ||
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
        .ENQUEUED
    ] !== false
  ) {
    return CONTROL_SNAPSHOT_ABSENT_HANDOFF_RETRY_AFTER_MS;
  }
  return normalizeControlSnapshotRetryAfterMs(
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
        .RETRY_AFTER_MS
    ],
  ) ||
    normalizeControlSnapshotRetryAfterMs(
      outcome[CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD]?.[
        CONTROL_SNAPSHOT_RETRY_AFTER_MS_FIELD
      ],
    );
}

function buildControlSnapshotHandoffRetryOptions(
  snapshot = null,
  options = {},
) {
  const retryAfterMs =
    selectMembershipPublicationHandoffRetryAfterMs(snapshot);
  if (retryAfterMs === null) {
    return options;
  }
  const repair =
    options.repair &&
      typeof options.repair === TYPEOF.OBJECT &&
      !Array.isArray(options.repair) ?
      {
        ...options.repair,
        [CONTROL_SNAPSHOT_RETRY_AFTER_MS_FIELD]: retryAfterMs,
      } :
      null;
  return {
    ...options,
    [CONTROL_SNAPSHOT_RETRY_AFTER_MS_FIELD]: retryAfterMs,
    ...(repair ? {repair} : {}),
  };
}

function buildControlSnapshotHandoffProgressOptions(options = {}) {
  return options.forceAuthoritativeRepair === true ?
    {
      ...options,
      forceAuthoritativeRepair: false,
    } :
    options;
}

function buildControlSnapshotHandoffDeferredOptions(
  snapshot = null,
  options = {},
) {
  const retryOptions = buildControlSnapshotHandoffRetryOptions(
    snapshot,
    options,
  );
  if (retryOptions === options) {
    return options;
  }
  return {
    ...retryOptions,
    observationMode: ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
    repairAttempted: true,
    repairDeferred: true,
  };
}

function resolveControlSnapshotCoverageNodeCount(snapshot = null) {
  const nodeIds = snapshot?.[CONTROL_SNAPSHOT_NODES_FIELD];
  return Array.isArray(nodeIds) ? nodeIds.length : NUM.ZERO;
}

function buildControlSnapshotHandoffRefreshResult(snapshot, refreshed) {
  return Object.freeze({
    snapshot,
    refreshed,
  });
}

function normalizeControlSnapshotHandoffText(value) {
  return typeof value === TYPEOF.STRING ?
    value.trim() :
    ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE;
}

function normalizeControlSnapshotHandoffInteger(value, fallback = NUM.ZERO) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ?
    Math.max(NUM.ZERO, Math.floor(numericValue)) :
    fallback;
}

function normalizeControlSnapshotHandoffOwnerOutcomeRevision(value) {
  if (Number.isFinite(value)) {
    return Math.max(NUM.ZERO, Math.floor(value));
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ?
    Math.max(NUM.ZERO, Math.floor(numericValue)) :
    NUM.ZERO;
}

function resolveControlSnapshotHandoffOwnerOutcomeStateProgressRank(
  state = ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
) {
  return Number.isFinite(
    CONTROL_SNAPSHOT_OWNER_OUTCOME_STATE_PROGRESS_RANK[state],
  ) ?
    CONTROL_SNAPSHOT_OWNER_OUTCOME_STATE_PROGRESS_RANK[state] :
    NUM.ZERO;
}

function resolveControlSnapshotHandoffOwnerOutcomeFreshnessProgressRank(
  freshness = ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
) {
  return Number.isFinite(
    CONTROL_SNAPSHOT_OWNER_OUTCOME_FRESHNESS_PROGRESS_RANK[freshness],
  ) ?
    CONTROL_SNAPSHOT_OWNER_OUTCOME_FRESHNESS_PROGRESS_RANK[freshness] :
    NUM.ZERO;
}

function hasControlSnapshotHandoffOwnerOutcomeProgress(
  currentOutcome = null,
  refreshedOutcome = null,
) {
  const currentStateRank =
    resolveControlSnapshotHandoffOwnerOutcomeStateProgressRank(
      currentOutcome?.state,
    );
  const refreshedStateRank =
    resolveControlSnapshotHandoffOwnerOutcomeStateProgressRank(
      refreshedOutcome?.state,
    );
  if (refreshedStateRank > currentStateRank) {
    return true;
  }
  const currentFreshnessRank =
    resolveControlSnapshotHandoffOwnerOutcomeFreshnessProgressRank(
      currentOutcome?.freshness,
    );
  const refreshedFreshnessRank =
    resolveControlSnapshotHandoffOwnerOutcomeFreshnessProgressRank(
      refreshedOutcome?.freshness,
    );
  if (refreshedFreshnessRank > currentFreshnessRank) {
    return true;
  }
  return normalizeControlSnapshotHandoffOwnerOutcomeRevision(
    refreshedOutcome?.revision,
  ) >
    normalizeControlSnapshotHandoffOwnerOutcomeRevision(
      currentOutcome?.revision,
    );
}

function selectControlSnapshotHandoffEvidence(snapshot = null) {
  const controlPlaneDiagnostics =
    snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
  const handoff = selectPublicationActiveGateHandoffContract(
    controlPlaneDiagnostics,
  );
  const ownerOutcome =
    buildPublicationActiveGateOwnerOutcomeEnvelope(controlPlaneDiagnostics);
  const hasHandoff =
    handoff &&
    typeof handoff === TYPEOF.OBJECT &&
    !Array.isArray(handoff);
  const pendingReconcileNodeIds = hasHandoff ?
    normalizeControlSnapshotNodeIdList(
      handoff[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PENDING_RECONCILE_NODE_IDS
      ],
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  const pendingRecoveryNodeIds = hasHandoff ?
    normalizeControlSnapshotNodeIdList(
      handoff[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PENDING_RECOVERY_NODE_IDS
      ],
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return Object.freeze({
    available: hasHandoff === true,
    state: normalizeControlSnapshotHandoffText(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE
      ],
    ),
    reasonCode: normalizeControlSnapshotHandoffText(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODE
      ],
    ),
    nextAction: normalizeControlSnapshotHandoffText(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NEXT_ACTION
      ],
    ),
    runtimePromotionAllowed:
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .RUNTIME_PROMOTION_ALLOWED
      ] === true,
    pendingReconcileCount: normalizeControlSnapshotHandoffInteger(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PENDING_RECONCILE_COUNT
      ],
      pendingReconcileNodeIds.length,
    ),
    pendingRecoveryCount: normalizeControlSnapshotHandoffInteger(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PENDING_RECOVERY_COUNT
      ],
      pendingRecoveryNodeIds.length,
    ),
    ownerOutcome,
    pendingRecoveryNodeIds,
    pendingReconcileNodeIds,
  });
}

function buildControlSnapshotHandoffProgressComparison(
  snapshot = null,
  refreshedSnapshot = null,
) {
  const current = selectControlSnapshotHandoffEvidence(snapshot);
  const refreshed = selectControlSnapshotHandoffEvidence(refreshedSnapshot);
  const comparable = current.available === true && refreshed.available === true;
  const ownerOutcomeProgressed =
    hasControlSnapshotHandoffOwnerOutcomeProgress(
      current.ownerOutcome,
      refreshed.ownerOutcome,
    );
  const progressSignals = Object.freeze({
    ownerOutcomeProgressed,
    pendingReconcileCountDecreased:
      comparable &&
      refreshed.pendingReconcileCount < current.pendingReconcileCount,
    pendingReconcileNodeIdsDecreased:
      comparable &&
      refreshed.pendingReconcileNodeIds.length <
        current.pendingReconcileNodeIds.length,
    pendingRecoveryCountDecreased:
      comparable &&
      refreshed.pendingRecoveryCount < current.pendingRecoveryCount,
    pendingRecoveryNodeIdsDecreased:
      comparable &&
      refreshed.pendingRecoveryNodeIds.length <
        current.pendingRecoveryNodeIds.length,
    ownerReconcilePendingChanged:
      comparable &&
      current.reasonCode ===
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
          .OWNER_RECONCILE_PENDING &&
      (
        refreshed.reasonCode !== current.reasonCode ||
        refreshed.state !== current.state ||
        refreshed.nextAction !== current.nextAction
      ),
    runtimePromotionAllowed:
      comparable &&
      current.runtimePromotionAllowed !== true &&
      refreshed.runtimePromotionAllowed === true,
  });
  const handoffEvidenceProgressed =
    ownerOutcomeProgressed === true ||
    progressSignals.pendingReconcileCountDecreased === true ||
    progressSignals.pendingReconcileNodeIdsDecreased === true ||
    progressSignals.pendingRecoveryCountDecreased === true ||
    progressSignals.pendingRecoveryNodeIdsDecreased === true ||
    progressSignals.ownerReconcilePendingChanged === true ||
    progressSignals.runtimePromotionAllowed === true;
  return Object.freeze({
    current,
    refreshed,
    progressSignals,
    handoffProgressed: handoffEvidenceProgressed,
  });
}

function buildControlSnapshotHandoffRefreshDecision(
  snapshot = null,
  refreshedSnapshot = null,
) {
  const handoffComparison =
    buildControlSnapshotHandoffProgressComparison(snapshot, refreshedSnapshot);
  const decisionSignals = Object.freeze({
    coverageIncreased:
      handoffComparison.handoffProgressed === true &&
      resolveControlSnapshotCoverageNodeCount(refreshedSnapshot) >
        resolveControlSnapshotCoverageNodeCount(snapshot),
    handoffEvidenceProgressed: handoffComparison.handoffProgressed === true,
    ownerOutcomeProgressed:
      handoffComparison.progressSignals.ownerOutcomeProgressed === true,
  });
  return Object.freeze({
    refreshed: decisionSignals.handoffEvidenceProgressed === true,
    decisionSignals,
    handoffComparison,
  });
}

function attachOrdinaryRepairDeferralDiagnostics(snapshot, repairDeferred) {
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
    return snapshot;
  }
  const controlPlaneDiagnostics =
    snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] &&
      typeof snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] ===
        TYPEOF.OBJECT ?
      snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] :
      {};
  const criticalConvergenceDeferred =
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD
    ] === true;
  const ordinaryRepairDeferred =
    repairDeferred === true ||
    (
      criticalConvergenceDeferred !== true &&
      controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD
      ] === true
    );
  snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] = {
    ...controlPlaneDiagnostics,
    [CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD]:
      ordinaryRepairDeferred,
  };
  return snapshot;
}
export {
  CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD,
  attachMembershipPublicationHandoffOutcome,
  attachOrdinaryRepairDeferralDiagnostics,
  buildControlSnapshotHandoffDeferredOptions,
  buildControlSnapshotHandoffProgressOptions,
  buildControlSnapshotHandoffRefreshDecision,
  buildControlSnapshotHandoffRefreshResult,
  buildControlSnapshotHandoffRetryOptions,
  isVisibleMembershipPublicationHandoffOutcome,
  selectMembershipPublicationHandoffOutcome,
};
