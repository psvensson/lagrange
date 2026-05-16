/**
 * Control snapshot building for the admin WebSocket API.
 *
 * This module owns all control-snapshot diagnostics: leader summary,
 * voter counts, replica operation summary, and CDC telemetry. The parent
 * AdminWebSocketAPI instantiates one AdminControlSnapshot and delegates
 * all control-snapshot-related calls to it.
 *
 * Single-use helpers that exist only for control-snapshot logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */
import {NUM, TYPEOF} from '../constants/index.js';
import {AUTHORITATIVE_REPAIR_TRIGGER} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from './admin-constants.js';
import {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  shouldAttemptAuthoritativeRepair,
} from './admin-authoritative-repair-evaluation.js';
import {
  hasPublicationActiveGateOwnerReconcileSignal,
  selectPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../control-plane/control-plane-error-classification.js';
import {AdminControlSnapshotPart1} from './admin-control-snapshot-class-part-1.js';
// ── file-local constants ────────────────────────────────────────────────────
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: '',
  READY: 'ready',
  UPDATEDAT: 'updatedAt',
  UPDATED_AT: 'updated_at',
  UNKNOWN_ERROR: 'unknown_error',
  PUBLISHED: 'PUBLISHED',
  NODEID: 'nodeId',
  ID: 'id',
  NAME: 'name',
  CAPTUREDAT: 'capturedAt',
  SOURCELEADERNODEID: 'sourceLeaderNodeId',
  DECISIONTIMESTAMP: 'decisionTimestamp',
  FAILEDAT: 'failedAt',
  NEXTATTEMPTAT: 'nextAttemptAt',
  TABLEID: 'tableId',
  TABLE_NAME: 'table_name',
  TABLENAME: 'tableName',
  PARTITIONSTATE: 'partitionState',
  REPLICAID: 'replicaId',
  RAFTROLE: 'raftRole',
  STATUS: 'status',
  ADDRESS: 'address',
});
const CONTROL_SNAPSHOT_REPAIR_REASON = 'control_snapshot';
const AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP =
  'leader_resolution_gap';
const AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT = 'query_timeout';
const AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE =
  'control_plane_backpressure';
const CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS = Object.freeze([
  'leader is unknown',
  'leader unknown',
  'no handler',
  'no leader',
  'partition_service_not_found',
  'partition service not found',
]);
const CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD =
  'controlPlaneDiagnostics';
const CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD =
  'publicationConvergence';
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD =
  'activeGateOwnerCohort';
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD =
  'membershipPublicationHandoffOutcome';
const CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD =
  'controlPlaneConvergence';
const CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD =
  'criticalConvergenceDeferred';
const CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD =
  'ordinaryRepairDeferred';
const CONTROL_SNAPSHOT_PRESSURE_OUTCOME_FIELD = 'pressureOutcome';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_DETAIL_SEPARATOR = ':';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_ERROR_FIELD = 'error';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_MESSAGE_FIELD = 'message';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_FAILED_TABLE_FIELD =
  'failedTable';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_TABLE_NAME_FIELD =
  'tableName';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_SKIPPED_DETAIL = 'repair_skipped';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_NOT_APPLIED_DETAIL =
  'repair_not_applied';
function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.length > NUM.ZERO &&
    causeChain.every(
      (value) => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP,
    )
  );
}
function hasPressureOrTimeoutRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT) ||
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE)
  );
}
function isRecoverableControlSnapshotPublicationReadError(error = null) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.length > NUM.ZERO &&
    CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    )
  );
}
function buildAuthoritativeControlSnapshotRepairFailure(detail, cause = null) {
  const error = new Error(
    'Authoritative control snapshot repair failed: ' +
      String(detail || 'unknown_error'),
  );
  if (cause) {
    error.cause = cause;
  }
  return error;
}
function normalizeControlSnapshotRepairDetailList(values = []) {
  return (Array.isArray(values) ? values : ADMIN_CACHE_DUMP.EMPTY)
    .map((value) =>
      typeof value === TYPEOF.STRING ?
        value.trim() :
        ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
    )
    .filter((value) => value.length > NUM.ZERO);
}
function firstControlSnapshotRepairDetail(...values) {
  for (const value of values) {
    if (typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO) {
      return value.trim();
    }
  }
  return null;
}
function extractControlSnapshotRepairTableNameFromDetail(detail = null) {
  const normalizedDetail = firstControlSnapshotRepairDetail(detail);
  if (!normalizedDetail) {
    return null;
  }
  const separatorIndex = normalizedDetail.indexOf(
    CONTROL_SNAPSHOT_REPAIR_FAILURE_DETAIL_SEPARATOR,
  );
  if (separatorIndex <= NUM.ZERO) {
    return null;
  }
  return normalizedDetail.slice(NUM.ZERO, separatorIndex);
}
function resolveControlSnapshotRepairFailureTableName(repair = null) {
  const errorDetails = normalizeControlSnapshotRepairDetailList(
    repair?.errors,
  );
  const failedTables = normalizeControlSnapshotRepairDetailList(
    repair?.failedTables,
  );
  return firstControlSnapshotRepairDetail(
    repair?.firstFailedParticipant?.[
      CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_FAILED_TABLE_FIELD
    ],
    repair?.firstFailedParticipant?.[
      CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_TABLE_NAME_FIELD
    ],
    failedTables[NUM.ZERO],
    extractControlSnapshotRepairTableNameFromDetail(errorDetails[NUM.ZERO]),
  );
}
function resolveControlSnapshotRepairParticipantFailureDetail(repair = null) {
  const participantError = firstControlSnapshotRepairDetail(
    repair?.firstFailedParticipant?.[
      CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_ERROR_FIELD
    ],
    repair?.firstFailedParticipant?.[
      CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_MESSAGE_FIELD
    ],
  );
  if (!participantError) {
    return null;
  }
  const tableName = resolveControlSnapshotRepairFailureTableName(repair);
  return tableName ?
    `${tableName}${CONTROL_SNAPSHOT_REPAIR_FAILURE_DETAIL_SEPARATOR}` +
      participantError :
    participantError;
}
function resolveControlSnapshotRepairFailureDetail(repair = null) {
  const participantFailureDetail =
    resolveControlSnapshotRepairParticipantFailureDetail(repair);
  if (participantFailureDetail) {
    return participantFailureDetail;
  }
  const errorDetails = normalizeControlSnapshotRepairDetailList(
    repair?.errors,
  );
  return firstControlSnapshotRepairDetail(
    errorDetails[NUM.ZERO],
    repair?.error,
  ) ||
    (
      repair?.skipped === true ?
        CONTROL_SNAPSHOT_REPAIR_FAILURE_SKIPPED_DETAIL :
        CONTROL_SNAPSHOT_REPAIR_FAILURE_NOT_APPLIED_DETAIL
    );
}
function isReadyLocalQueryTransportDiagnostic(localQueryTransport = null) {
  if (!localQueryTransport || typeof localQueryTransport !== TYPEOF.OBJECT) {
    return false;
  }
  if (localQueryTransport.ready === true) {
    return true;
  }
  return (
    String(
      localQueryTransport.state || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
    ).toLowerCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.READY
  );
}
function attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
    return snapshot;
  }
  const activeProjection =
    options.repairEvaluation?.nodeCoverage?.activeProjection || null;
  snapshot.authoritativeRepair = {
    applied: options.repair?.applied === true,
    forced: options.forceAuthoritativeRepair === true,
    triggerCodes: Array.isArray(options.repairEvaluation?.triggerCodes) ?
      [...options.repairEvaluation.triggerCodes] :
      ADMIN_CACHE_DUMP.EMPTY,
    activeProjectionCoverageGap: activeProjection?.hasCoverageGap === true,
    activeProjectionMissingNodeIds: Array.isArray(
      activeProjection?.missingNodeIds,
    ) ?
      [...activeProjection.missingNodeIds] :
      ADMIN_CACHE_DUMP.EMPTY,
  };
  return snapshot;
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
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart2 extends AdminControlSnapshotPart1 {
  async triggerMembershipPublicationHandoffOwnerCommand(
    snapshot = null,
    options = {},
  ) {
    const controlPlaneDiagnostics =
      snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
    if (
      hasPublicationActiveGateOwnerReconcileSignal(
        controlPlaneDiagnostics,
      ) !== true ||
      typeof this.reconcileAuthoritativeMembershipPublicationFromHandoff !==
        TYPEOF.FUNCTION
    ) {
      return snapshot;
    }
    const publicationActiveGateHandoff =
      selectPublicationActiveGateHandoffContract(controlPlaneDiagnostics) ||
      controlPlaneDiagnostics;
    try {
      const outcome =
        await this.reconcileAuthoritativeMembershipPublicationFromHandoff(
          publicationActiveGateHandoff,
          {
            ...options,
            reconcileAuthoritativeMembershipPublication: true,
          },
        );
      return attachMembershipPublicationHandoffOutcome(snapshot, outcome);
    } catch (_error) {
      const failureOutcome =
        typeof this.buildMembershipPublicationHandoffOwnerCommandErrorOutcome ===
          TYPEOF.FUNCTION ?
          this.buildMembershipPublicationHandoffOwnerCommandErrorOutcome(
            _error,
            publicationActiveGateHandoff,
          ) :
          null;
      return attachMembershipPublicationHandoffOutcome(
        snapshot,
        failureOutcome,
      );
    }
  }

  /**
   * Resolve one local control snapshot with optional authoritative
   * cache repair when partition topology appears incomplete.
   * @return {Promise<Object>}
   */
  async resolveLocalControlSnapshot(options = {}) {
    const forceAuthoritativeRepair = options.forceAuthoritativeRepair === true;
    const allowAuthoritativeRepair = options.allowAuthoritativeRepair === true;
    let snapshot = null;
    try {
      snapshot = await this.buildLocalControlSnapshot(options);
    } catch (error) {
      if (
        !forceAuthoritativeRepair ||
        !this.canRunAuthoritativeControlSnapshotRepair() ||
        !isRecoverableControlSnapshotPublicationReadError(error)
      ) {
        throw error;
      }
      let repair = null;
      try {
        repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
          reason: CONTROL_SNAPSHOT_REPAIR_REASON,
          bypassReuse: true,
          queryTimeoutMs: options.queryTimeoutMs,
        });
      } catch (repairError) {
        throw buildAuthoritativeControlSnapshotRepairFailure(
          repairError?.message || repairError,
          repairError,
        );
      }
      if (repair?.applied !== true) {
        throw buildAuthoritativeControlSnapshotRepairFailure(
          resolveControlSnapshotRepairFailureDetail(repair),
          repair,
        );
      }
      const repairedSnapshot = await this.buildLocalControlSnapshot({
        ...options,
        preferAuthoritativePublicationRead: true,
        reconcileAuthoritativeMembershipPublication: true,
      });
      const repairedEvaluation =
        this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot);
      return this.resolveSharedControlSnapshot(
        attachAuthoritativeRepairDiagnostics(repairedSnapshot, {
          repair,
          repairEvaluation: repairedEvaluation,
          forceAuthoritativeRepair,
        }),
        {
          ...options,
          observationMode:
            ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR,
          repair,
          repairEvaluation: repairedEvaluation,
        },
      );
    }
    const repairEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(snapshot);
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      const triggeredSnapshot =
        await this.triggerMembershipPublicationHandoffOwnerCommand(
          snapshot,
          options,
        );
      return this.resolveSharedControlSnapshot(triggeredSnapshot, options);
    }
    if (
      forceAuthoritativeRepair !== true &&
      !shouldAttemptAuthoritativeRepair({
        repairEvaluation,
        forceAuthoritativeRepair,
        allowAuthoritativeRepair,
      })
    ) {
      const triggeredSnapshot =
        await this.triggerMembershipPublicationHandoffOwnerCommand(
          snapshot,
          options,
        );
      return this.resolveSharedControlSnapshot(
        attachOrdinaryRepairDeferralDiagnostics(
          triggeredSnapshot,
          repairEvaluation?.shouldRepair === true,
        ),
        repairEvaluation?.shouldRepair === true ?
          {
            ...options,
            observationMode:
                ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
            repairEvaluation,
            repairDeferred: true,
          } :
          options,
      );
    }
    const canDegradeRepairFailure =
      this.canDegradeAuthoritativeControlSnapshotRepairFailure({
        forceAuthoritativeRepair,
        repairEvaluation,
      });
    let repair = null;
    try {
      repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
        reason: CONTROL_SNAPSHOT_REPAIR_REASON,
        bypassReuse: forceAuthoritativeRepair,
        queryTimeoutMs: options.queryTimeoutMs,
        triggerCodes: repairEvaluation?.triggerCodes,
      });
    } catch (error) {
      if (canDegradeRepairFailure) {
        const triggeredSnapshot =
          await this.triggerMembershipPublicationHandoffOwnerCommand(
            snapshot,
            options,
          );
        return this.resolveSharedControlSnapshot(
          attachOrdinaryRepairDeferralDiagnostics(triggeredSnapshot, true),
          {
            ...options,
            observationMode:
              ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
            repairEvaluation,
            repairAttempted: true,
            repairDeferred: true,
            retryAfterMs: error?.retryAfterMs,
          },
        );
      }
      throw buildAuthoritativeControlSnapshotRepairFailure(
        error?.message || error || ADMIN_CONTROL_SNAPSHOT_LITERAL.UNKNOWN_ERROR,
        error,
      );
    }
    if (repair?.applied !== true) {
      const canDegradeUnappliedRepair =
        canDegradeRepairFailure === true ||
        this.canDegradeAuthoritativeControlSnapshotRepairFailure({
          forceAuthoritativeRepair,
          repairEvaluation,
          repair,
        });
      if (canDegradeUnappliedRepair) {
        const triggeredSnapshot =
          await this.triggerMembershipPublicationHandoffOwnerCommand(
            snapshot,
            options,
          );
        return this.resolveSharedControlSnapshot(
          attachOrdinaryRepairDeferralDiagnostics(triggeredSnapshot, true),
          {
            ...options,
            observationMode:
              ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
            repair,
            repairEvaluation,
            repairAttempted: true,
            repairDeferred: true,
          },
        );
      }
      throw buildAuthoritativeControlSnapshotRepairFailure(
        resolveControlSnapshotRepairFailureDetail(repair),
        repair,
      );
    }
    const repairedSnapshot = await this.buildLocalControlSnapshot({
      ...options,
      preferAuthoritativePublicationRead: true,
      reconcileAuthoritativeMembershipPublication: true,
    });
    const repairedEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot);
    return this.resolveSharedControlSnapshot(
      attachAuthoritativeRepairDiagnostics(repairedSnapshot, {
        repair,
        repairEvaluation: repairedEvaluation,
        forceAuthoritativeRepair,
      }),
      {
        ...options,
        observationMode: forceAuthoritativeRepair ?
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR :
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.SCHEDULED_REPAIR,
        repair,
        repairEvaluation: repairedEvaluation,
      },
    );
  }
  canDegradeAuthoritativeControlSnapshotRepairFailure(options = {}) {
    if (
      options.forceAuthoritativeRepair !== true &&
      hasOnlyLeaderResolutionGapRepairCause(options.repair) &&
      isReadyLocalQueryTransportDiagnostic(options.repair?.localQueryTransport)
    ) {
      return true;
    }
    if (
      options.forceAuthoritativeRepair !== true &&
      hasPressureOrTimeoutRepairCause(options.repair) &&
      isReadyLocalQueryTransportDiagnostic(options.repair?.localQueryTransport)
    ) {
      return true;
    }
    if (
      hasAuthoritativeRepairTrigger(
        options.repairEvaluation,
        AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
      ) ||
      options.repairEvaluation?.nodeCoverage?.activeProjection
        ?.hasCoverageGap === true
    ) {
      return false;
    }
    if (isReplicaOperationsOnlyRepairScope(options.repairEvaluation)) {
      return true;
    }
    const failedTables = Array.isArray(options.repair?.failedTables) ?
      options.repair.failedTables.filter(
        (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ) :
      ADMIN_CACHE_DUMP.EMPTY;
    return isReplicaOperationsOnlyTableSet(failedTables);
  }
  resolveControlSnapshotActiveNodeIds(
    nodeRows = [],
    serviceRows = [],
    nodeEndpointRows = [],
    controlPlaneDiagnostics = null,
    publicationRows = [],
  ) {
    return this.resolveControlSnapshotNodeViews(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      controlPlaneDiagnostics,
      publicationRows,
    ).authoritativeActiveNodeIds;
  }
}
export {AdminControlSnapshotPart2};
