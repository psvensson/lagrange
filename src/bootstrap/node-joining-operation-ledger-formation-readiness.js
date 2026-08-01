import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {NodeJoiningOwnerConstruction} from './node-joining-owner-construction.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../control-plane/control-plane-constants.js';
import {
  COLUMN,
  STATE,
  TABLES,
} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {
  SYSTEM_TABLE_NAME,
  getInitialReplicaIds,
} from './system-table-schemas-constants.js';
import {
  getAuthoritativeOperationLedgerPlacementObservation,
  getOperationLedgerQuorumObservation,
} from '../rebalancer/operation-ledger-quorum-concentration.js';
import {
  isLedgerQuorumConcentratedPartition,
} from '../rebalancer/operation-ledger-hold-policy.js';
import {
  isReplicaOperationInFlight,
} from '../rebalancer/replica-operation-liveness.js';

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
  WAITING_OPERATION_DRAIN: 'waiting_for_ledger_operation_drain',
  WAITING_OPERATION_OBSERVATION:
    'waiting_for_ledger_operation_observation',
  WAITING_OBSERVATION: 'waiting_for_ledger_observation',
  WAITING_SPREAD: 'waiting_for_ledger_spread',
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
  if (!snapshot.spreadProofComplete) {
    return OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_OBSERVATION;
  }
  if (snapshot.spreadConcentrated) {
    return OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_SPREAD;
  }
  if (!snapshot.operationObservationComplete) {
    return (
      OPERATION_LEDGER_FORMATION_BARRIER_STATE
        .WAITING_OPERATION_OBSERVATION
    );
  }
  return snapshot.inFlightOperationCount > 0 ?
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_OPERATION_DRAIN :
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.SATISFIED;
}

class NodeJoiningOperationLedgerFormationReadiness
  extends NodeJoiningOwnerConstruction {
  async getOperationLedgerFormationPlacementObservation(
    partitionId,
    targetReplicaCount,
  ) {
    const readinessService =
      this.rebalanceCoordinator?.controlPlaneReadinessService || null;
    const authoritativeView =
      typeof readinessService?.getAuthoritativeControlPlaneView ===
        'function' ?
        readinessService.getAuthoritativeControlPlaneView() :
        null;
    if (
      !authoritativeView ||
      typeof authoritativeView.canRead !== 'function' ||
      authoritativeView.canRead() !== true ||
      typeof authoritativeView.readRows !== 'function'
    ) {
      return Object.freeze({
        complete: false,
        concentrated: null,
        distinctNodeCount: 0,
        observedVoterCount: 0,
        source: null,
        spreadComplete: false,
      });
    }
    try {
      const result = await authoritativeView.readRows(
        TABLES.SERVICES,
        `SELECT * FROM ${TABLES.SERVICES} ` +
          `WHERE ${COLUMN.PARTITION_ID} = ?`,
        [partitionId],
        {
          authoritativeReadMode:
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
          allowSqlFallback: false,
          preferOwnerRpcReadLeader: true,
        },
      );
      return getAuthoritativeOperationLedgerPlacementObservation({
        available: result?.success === true,
        rows: result?.rows,
        source: result?.source,
        partitionId,
        targetReplicaCount,
        snapshotVersion: result?.snapshotVersion ?? null,
      });
    } catch {
      return getAuthoritativeOperationLedgerPlacementObservation({
        available: false,
        rows: [],
        source: null,
        partitionId,
        targetReplicaCount,
      });
    }
  }
  /**
   * Read the authoritative operation owner after physical spread becomes
   * visible. Service-row deletion precedes terminal REMOVED persistence in the
   * production executor, so concentration alone is not a release witness.
   *
   * @param {string} partitionId
   * @param {number} now
   * @return {Promise<Object>}
   * @private
   */
  async getOperationLedgerFormationDrainObservation(partitionId, now) {
    const coordinator = this.rebalanceCoordinator || null;
    if (
      typeof coordinator?.getEntityAuthoritativeOperationObservation !==
        'function'
    ) {
      return Object.freeze({
        complete: false,
        inFlightOperationCount: null,
        state: null,
      });
    }
    try {
      const observation =
        await coordinator.getEntityAuthoritativeOperationObservation(
          SERVICE_TYPE.PARTITION,
          partitionId,
        );
      const operations = Array.isArray(observation?.operations) ?
        observation.operations :
        [];
      const state = String(observation?.state || '').toLowerCase();
      const complete =
        observation?.deferredOutcome == null &&
        (state === 'empty' || state === 'present') &&
        Array.isArray(observation?.operations);
      return Object.freeze({
        complete,
        inFlightOperationCount: complete ?
          operations.filter((operation) =>
            isReplicaOperationInFlight(operation, {nowMs: now}),
          ).length :
          null,
        state: state || null,
      });
    } catch {
      return Object.freeze({
        complete: false,
        inFlightOperationCount: null,
        state: null,
      });
    }
  }
  /**
   * Snapshot the join-time operation-ledger placement barrier.
   *
   * Completeness and concentration come from the canonical ledger predicate,
   * so a partial cache cannot be mistaken for successful spread.
   *
   * @param {Object} [options]
   * @return {Promise<Object>}
   * @private
   */
  async getOperationLedgerFormationBarrierSnapshot(options = {}) {
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    const partitionId = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
    const initialReplicaIds =
      getInitialReplicaIds(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
    const minimumTargetReplicaCount =
      Array.isArray(initialReplicaIds) && initialReplicaIds.length > 0 ?
        initialReplicaIds.length :
        null;
    const now = this.now();
    const observation = getOperationLedgerQuorumObservation(
      systemTableCache,
      partitionId,
      {minimumTargetReplicaCount},
    );
    const concentrated = isLedgerQuorumConcentratedPartition(
      systemTableCache,
      partitionId,
    );
    const startupAuthority =
      this.getPriorityPlacementFormationStartupAuthority(now);
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
    const authoritativePlacement =
      options.observeOperationDrain === true &&
      (!observation.complete || concentrated) ?
        await this.getOperationLedgerFormationPlacementObservation(
          partitionId,
          observation.targetReplicaCount,
        ) :
        {
          complete: false,
          concentrated: null,
          distinctNodeCount: 0,
          observedVoterCount: 0,
          source: null,
          spreadComplete: false,
        };
    const spreadProofComplete = authoritativePlacement.complete ?
      authoritativePlacement.spreadComplete :
      observation.complete;
    const spreadConcentrated = authoritativePlacement.complete ?
      authoritativePlacement.concentrated :
      concentrated;
    const operationDrainObservation =
      options.observeOperationDrain === true &&
      spreadProofComplete &&
      !spreadConcentrated ?
        await this.getOperationLedgerFormationDrainObservation(
          partitionId,
          now,
        ) :
        {
          complete: false,
          inFlightOperationCount: null,
          state: null,
        };
    return Object.freeze({
      now,
      partitionId,
      targetReplicaCount: observation.targetReplicaCount,
      observedVoterCount: observation.observedVoterCount,
      observationComplete: observation.complete,
      spreadProofComplete,
      concentrated,
      spreadConcentrated,
      authoritativePlacementComplete: authoritativePlacement.complete,
      authoritativePlacementConcentrated:
        authoritativePlacement.concentrated,
      authoritativePlacementDistinctNodeCount:
        authoritativePlacement.distinctNodeCount,
      authoritativePlacementObservedVoterCount:
        authoritativePlacement.observedVoterCount,
      authoritativePlacementSource: authoritativePlacement.source,
      operationObservationComplete: operationDrainObservation.complete,
      operationObservationState: operationDrainObservation.state,
      inFlightOperationCount:
        operationDrainObservation.inFlightOperationCount,
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
  logOperationLedgerFormationBarrierState(state, snapshot) {
    this.logger.info(JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER, {
      nodeId: this.nodeId,
      state,
      partitionId: snapshot.partitionId,
      candidateNodeCount: snapshot.candidateNodeIds.length,
      preReadyCandidateNodeCount: snapshot.preReadyCandidateNodeIds.length,
      targetReplicaCount: snapshot.targetReplicaCount,
      observedVoterCount: snapshot.observedVoterCount,
      observationComplete: snapshot.observationComplete,
      spreadProofComplete: snapshot.spreadProofComplete,
      concentrated: snapshot.concentrated,
      spreadConcentrated: snapshot.spreadConcentrated,
      authoritativePlacementComplete:
        snapshot.authoritativePlacementComplete,
      authoritativePlacementConcentrated:
        snapshot.authoritativePlacementConcentrated,
      authoritativePlacementDistinctNodeCount:
        snapshot.authoritativePlacementDistinctNodeCount,
      authoritativePlacementObservedVoterCount:
        snapshot.authoritativePlacementObservedVoterCount,
      authoritativePlacementSource:
        snapshot.authoritativePlacementSource,
      operationObservationComplete: snapshot.operationObservationComplete,
      operationObservationState: snapshot.operationObservationState,
      inFlightOperationCount: snapshot.inFlightOperationCount,
    });
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
      typeof readinessService.getStartupAuthoritySnapshotSync !== 'function'
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

    while (true) {
      const snapshot =
        await this.getOperationLedgerFormationBarrierSnapshot({
          observeOperationDrain: barrierEngaged,
        });
      barrierEngaged = barrierEngaged ||
        this.hasSufficientOperationLedgerFormationCohort(snapshot);
      const state = resolveOperationLedgerFormationBarrierState({
        barrierEngaged,
        discoveryDeadline,
        snapshot,
      });

      if (state !== lastState) {
        this.logOperationLedgerFormationBarrierState(state, snapshot);
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
        await this.publishOperationLedgerFormationLiveness(snapshot.now);
      }
      await this.sleep(pollMs);
    }
  }
}

export {NodeJoiningOperationLedgerFormationReadiness};
