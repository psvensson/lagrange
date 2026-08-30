import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {NodeJoiningOwnerConstruction} from './node-joining-owner-construction.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../control-plane/control-plane-constants.js';
import {
  STATE,
} from '../constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
  getInitialReplicaIds,
} from './system-table-schemas-constants.js';

const {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  NodeService,
  STARTUP_JOIN_MODE,
} = NODE_JOINING_SERVICE_SHARED;

const OPERATION_LEDGER_FORMATION_BARRIER_STATE = Object.freeze({
  BYPASSED_INSUFFICIENT_COHORT: 'bypassed_insufficient_formation_cohort',
  SATISFIED: 'ledger_spread_satisfied',
  UNOBSERVED: 'unobserved',
  WAITING_COHORT: 'waiting_for_formation_cohort',
  WAITING_STARTUP_AUTHORITY: 'waiting_for_startup_authority',
});
const OPERATION_LEDGER_FORMATION_BARRIER_RELEASE_STATES = new Set([
  OPERATION_LEDGER_FORMATION_BARRIER_STATE.BYPASSED_INSUFFICIENT_COHORT,
  OPERATION_LEDGER_FORMATION_BARRIER_STATE.SATISFIED,
]);
const OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT_CODE =
  'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT';

function resolveFormationBarrierDuration(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function resolveFormationBarrierTargetReplicaCount(initialReplicaIds) {
  return Array.isArray(initialReplicaIds) && initialReplicaIds.length > 0 ?
    initialReplicaIds.length :
    null;
}

function freezeStartupAuthorityRecoveryReasonCodes(startupAuthority) {
  return Object.freeze(
    Array.isArray(startupAuthority?.priorityRecoveryReasonCodes) ?
      [...startupAuthority.priorityRecoveryReasonCodes] :
      [],
  );
}

/**
 * Project the readiness owner's startup-authority answer into the flat
 * barrier-snapshot fields bootstrap logs and gates on. An absent authority
 * answer projects as unavailable/not-ready with empty evidence.
 *
 * @param {Object|null} startupAuthority
 * @return {Object}
 */
function buildFormationBarrierStartupAuthorityFields(startupAuthority) {
  return {
    startupAuthorityAvailable:
      startupAuthority?.authorityAvailable === true,
    startupAuthorityState: startupAuthority?.state || null,
    startupAuthorityReady: startupAuthority?.ready === true,
    startupAuthorityRecoveryReasonCodes:
      freezeStartupAuthorityRecoveryReasonCodes(startupAuthority),
    startupAuthorityPublicationRecoveryGateState:
      startupAuthority?.publicationRecoveryGate?.state || null,
    formationReleaseHandoff:
      startupAuthority?.formationReleaseHandoff || null,
  };
}

/**
 * Project one barrier snapshot into the evidence fields every barrier log
 * line carries. The fields are a view of the owner's own snapshot (the
 * readiness owner's startup-authority answer plus the cohort counts bootstrap
 * already gates on); nothing is re-derived from node rows or publications.
 *
 * @param {Object} snapshot
 * @return {Object}
 */
function buildOperationLedgerFormationBarrierLogFields(snapshot) {
  return {
    partitionId: snapshot.partitionId,
    candidateNodeCount: snapshot.candidateNodeIds.length,
    preReadyCandidateNodeCount: snapshot.preReadyCandidateNodeIds.length,
    targetReplicaCount: snapshot.targetReplicaCount,
    startupAuthorityAvailable: snapshot.startupAuthorityAvailable,
    startupAuthorityState: snapshot.startupAuthorityState,
    startupAuthorityReady: snapshot.startupAuthorityReady,
    startupAuthorityRecoveryReasonCodes:
      snapshot.startupAuthorityRecoveryReasonCodes,
    startupAuthorityPublicationRecoveryGateState:
      snapshot.startupAuthorityPublicationRecoveryGateState,
    formationReleaseHandoffState:
      snapshot.formationReleaseHandoff?.state || null,
    formationReleaseHandoffGeneration:
      snapshot.formationReleaseHandoff?.generation || null,
    formationReleaseHandoffReleaseAuthorized:
      snapshot.formationReleaseHandoff?.releaseAuthorized === true,
    formationReleaseHandoffRequiredCohort:
      snapshot.formationReleaseHandoff?.requiredCohort || [],
    formationReleaseHandoffPendingNodeIds:
      snapshot.formationReleaseHandoff?.pendingNodeIds || [],
  };
}

/**
 * Liveness log for one barrier wait. It is a projection of the wait the
 * owner is already performing: the still-waiting line rides the existing
 * liveness-refresh tick and the evidence-advance line rides the existing
 * poll, rate-limited to one per liveness-refresh window. It owns no timer,
 * no budget, and no readiness decision.
 *
 * @param {Object} options
 * @param {Object} options.logger
 * @param {string} options.nodeId
 * @param {number} options.startedAt
 * @param {number} options.timeoutDeadline
 * @param {number} options.livenessRefreshMs
 * @return {Object}
 */
function createOperationLedgerFormationBarrierWaitLog({
  logger,
  nodeId,
  startedAt,
  timeoutDeadline,
  livenessRefreshMs,
}) {
  let lastLoggedEvidenceKey =
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.UNOBSERVED;
  let lastEvidenceAdvanceLoggedAt = startedAt;

  function project(snapshot, state) {
    const fields = buildOperationLedgerFormationBarrierLogFields(snapshot);
    return {
      evidenceKey: JSON.stringify(fields),
      details: {
        nodeId,
        state,
        elapsedMs: snapshot.now - startedAt,
        ...fields,
      },
    };
  }

  return Object.freeze({
    logState(snapshot, state) {
      const {evidenceKey, details} = project(snapshot, state);
      lastLoggedEvidenceKey = evidenceKey;
      logger.info(JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER, details);
    },
    logStillWaiting(snapshot, state) {
      const {evidenceKey, details} = project(snapshot, state);
      lastLoggedEvidenceKey = evidenceKey;
      logger.info(
        JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER_STILL_WAITING,
        {
          ...details,
          waitingSinceMs: startedAt,
          timeoutRemainingMs: Math.max(0, timeoutDeadline - snapshot.now),
          livenessRefreshMs,
        },
      );
    },
    observeEvidence(snapshot, state) {
      const {evidenceKey, details} = project(snapshot, state);
      if (
        evidenceKey === lastLoggedEvidenceKey ||
        snapshot.now - lastEvidenceAdvanceLoggedAt < livenessRefreshMs
      ) {
        return;
      }
      lastLoggedEvidenceKey = evidenceKey;
      lastEvidenceAdvanceLoggedAt = snapshot.now;
      logger.debug(
        JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER_EVIDENCE_ADVANCED,
        details,
      );
    },
  });
}

function resolveOperationLedgerFormationBarrierState({
  barrierEngaged,
  discoveryDeadline,
  snapshot,
}) {
  if (!barrierEngaged) {
    return snapshot.now >= discoveryDeadline ?
      OPERATION_LEDGER_FORMATION_BARRIER_STATE.BYPASSED_INSUFFICIENT_COHORT :
      OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_COHORT;
  }
  return snapshot.startupAuthorityReady === true ?
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.SATISFIED :
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_STARTUP_AUTHORITY;
}

class NodeJoiningOperationLedgerFormationReadiness
  extends NodeJoiningOwnerConstruction {
  /**
   * Snapshot the join-time formation barrier from one startup-authority
   * answer. The readiness owner alone decides whether priority placement is
   * safe; bootstrap owns only cohort engagement and liveness while waiting.
   *
   * @return {Promise<Object>}
   * @private
   */
  async getOperationLedgerFormationBarrierSnapshot() {
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    const partitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
    const targetReplicaCount = resolveFormationBarrierTargetReplicaCount(
      getInitialReplicaIds(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS),
    );
    const now = this.now();
    const startupAuthority =
      await this.getPriorityPlacementFormationStartupAuthority(now);
    const candidateNodeIds =
      this.getPriorityPlacementFormationCandidateNodeIdsFromAuthority(
        systemTableCache,
        startupAuthority,
      );
    const preReadyCandidateNodeIds =
      this.getPriorityPlacementFormationPreReadyNodeIds(
        systemTableCache,
        candidateNodeIds,
        now,
      );
    return Object.freeze({
      now,
      partitionId,
      targetReplicaCount,
      ...buildFormationBarrierStartupAuthorityFields(startupAuthority),
      candidateNodeIds: Object.freeze(candidateNodeIds),
      preReadyCandidateNodeIds: Object.freeze(preReadyCandidateNodeIds),
    });
  }
  resolveOperationLedgerFormationBarrierTiming() {
    return Object.freeze({
      discoveryMs: resolveFormationBarrierDuration(
        this.config.priorityPlacementFormationDiscoveryMs,
        JOINING_DEFAULT.priorityPlacementFormationDiscoveryMs,
        0,
      ),
      pollMs: resolveFormationBarrierDuration(
        this.config.priorityPlacementFormationPollMs,
        JOINING_DEFAULT.priorityPlacementFormationPollMs,
        1,
      ),
      timeoutMs: resolveFormationBarrierDuration(
        this.config.priorityPlacementFormationTimeoutMs,
        JOINING_DEFAULT.priorityPlacementFormationTimeoutMs,
        1,
      ),
    });
  }
  /**
   * Keep an engaged formation cohort visible to whichever node owns the
   * operation ledger after a directed leader handoff. This is deliberately a
   * CONNECTED heartbeat-only publication: it renews liveness without granting
   * the READY lease that this barrier exists to withhold.
   *
   * @param {number} heartbeatAt
   * @return {Promise<boolean>}
   * @private
   */
  async publishOperationLedgerFormationLiveness(heartbeatAt) {
    if (typeof this.sendControlPlaneNodeStateUpdate !== 'function') {
      return false;
    }
    try {
      await this.sendControlPlaneNodeStateUpdate({
        state: STATE.CONNECTED,
        capabilities: this.getNodeCapabilities(),
        heartbeatAt,
        heartbeatOnly: true,
        nodeStatePublicationMode:
          CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      });
      return true;
    } catch (error) {
      this.logger.warn(JOINING_LOG_MSG.HEARTBEAT_FAILED, {
        nodeId: this.nodeId,
        gate: 'operation_ledger_formation',
        error: error?.message || String(error),
      });
      return false;
    }
  }
  resolveOperationLedgerFormationLivenessRefreshMs() {
    return resolveFormationBarrierDuration(
      this.config.heartbeatIntervalMs,
      JOINING_DEFAULT.heartbeatIntervalMs,
      1,
    );
  }
  hasSufficientOperationLedgerFormationCohort(snapshot) {
    const formationReplicaCount =
      snapshot.targetReplicaCount ||
      getInitialReplicaIds(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)?.length ||
      0;
    const formationWaveNodeCount = Math.max(1, formationReplicaCount - 1);
    return Number.isInteger(formationReplicaCount) &&
      formationReplicaCount > 0 &&
      snapshot.candidateNodeIds.length >= formationReplicaCount &&
      snapshot.preReadyCandidateNodeIds.length >= formationWaveNodeCount;
  }
  buildOperationLedgerFormationBarrierTimeout(snapshot) {
    const error = new Error(
      JOINING_ERROR_MSG.OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT,
    );
    error.code = OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT_CODE;
    error.deferRetry = true;
    error.retryable = true;
    error.formationBarrier = snapshot;
    return error;
  }
  /**
   * Hold the final ready-lease publication while a feasible cold-formation
   * cohort is curing operation-ledger concentration.
   *
   * A short discovery window avoids penalizing intentionally small (one- or
   * two-node) clusters that cannot form a three-node spread. Once a sufficient
   * cohort with multiple simultaneously pre-ready joiners is observed, the
   * owner latches the barrier and fails closed on timeout rather than opening
   * ACTIVE over incomplete/concentrated evidence. Sequential single-node
   * growth retains the ordinary ready-then-rebalance path.
   *
   * @return {Promise<void>}
   * @private
   */
  async awaitOperationLedgerFormationBarrier() {
    if (this.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN) {
      return;
    }
    const readinessService =
      this.rebalanceCoordinator?.controlPlaneReadinessService || null;
    if (
      !readinessService ||
      (
        typeof readinessService
          .getFormationReleaseStartupAuthoritySnapshot !== 'function' &&
        typeof readinessService
          .getFormationReleaseStartupAuthoritySnapshotSync !== 'function' &&
        typeof readinessService.getStartupAuthoritySnapshotSync !== 'function'
      )
    ) {
      return;
    }
    const {discoveryMs, pollMs, timeoutMs} =
      this.resolveOperationLedgerFormationBarrierTiming();
    const startedAt = this.now();
    const discoveryDeadline = startedAt + discoveryMs;
    const timeoutDeadline = startedAt + timeoutMs;
    const livenessRefreshMs =
      this.resolveOperationLedgerFormationLivenessRefreshMs();
    let nextLivenessRefreshAt = startedAt;
    let barrierEngaged = false;
    let lastState =
      OPERATION_LEDGER_FORMATION_BARRIER_STATE.UNOBSERVED;
    const waitLog = createOperationLedgerFormationBarrierWaitLog({
      logger: this.logger,
      nodeId: this.nodeId,
      startedAt,
      timeoutDeadline,
      livenessRefreshMs,
    });

    while (true) {
      const snapshot =
        await this.getOperationLedgerFormationBarrierSnapshot();
      barrierEngaged = barrierEngaged ||
        this.hasSufficientOperationLedgerFormationCohort(snapshot);
      const state = resolveOperationLedgerFormationBarrierState({
        barrierEngaged,
        discoveryDeadline,
        snapshot,
      });

      if (state !== lastState) {
        waitLog.logState(snapshot, state);
        lastState = state;
      }

      if (OPERATION_LEDGER_FORMATION_BARRIER_RELEASE_STATES.has(state)) {
        return;
      }
      if (barrierEngaged && snapshot.now >= timeoutDeadline) {
        throw this.buildOperationLedgerFormationBarrierTimeout(snapshot);
      }
      if (
        barrierEngaged &&
        snapshot.now >= nextLivenessRefreshAt
      ) {
        nextLivenessRefreshAt = snapshot.now + livenessRefreshMs;
        waitLog.logStillWaiting(snapshot, state);
        await this.publishOperationLedgerFormationLiveness(snapshot.now);
      }
      waitLog.observeEvidence(snapshot, state);
      await this.sleep(pollMs);
    }
  }
}

export {NodeJoiningOperationLedgerFormationReadiness};
