import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {NodeJoiningOwnerConstruction} from './node-joining-owner-construction.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../control-plane/control-plane-constants.js';
import {
  STATE,
} from '../constants/index.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
  formationReleaseHandoffAuthorizesNode,
} from '../control-plane/formation-release-handoff-contract.js';
import {FORMATION_RELEASE_HANDOFF_MINIMUM_COHORT_SIZE} from
  '../control-plane/formation-release-handoff-policy.js';
import {countStartupAuthorityNodeIds} from
  '../control-plane/startup-authority-placement-eligibility.js';
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
const OPERATION_LEDGER_FORMATION_LIVENESS_PUBLISH_FAILURE =
  'formation_liveness_publish_failed';
const arrayIsArray = Array.isArray;
const arrayPrototypeSlice = Function.call.bind(Array.prototype.slice);
const mathMax = Math.max;
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const objectFreeze = Object.freeze;
const setPrototypeHas = Function.call.bind(Set.prototype.has);

function resolveFormationBarrierDuration(value, fallback, minimum) {
  return numberIsFinite(value) ? mathMax(minimum, value) : fallback;
}

function resolveOperationLedgerFormationBarrierState({
  barrierEngaged,
  bypassAuthorized,
  discoveryDeadline,
  snapshot,
}) {
  if (!barrierEngaged) {
    return snapshot.now >= discoveryDeadline &&
      bypassAuthorized ?
      OPERATION_LEDGER_FORMATION_BARRIER_STATE
        .BYPASSED_INSUFFICIENT_COHORT :
      OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_COHORT;
  }
  return snapshot.startupAuthorityReady === true ?
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.SATISFIED :
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_STARTUP_AUTHORITY;
}

function resolveOperationLedgerFormationReplicaCount(snapshot) {
  return snapshot.targetReplicaCount ||
    getInitialReplicaIds(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)?.length ||
    0;
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
  async getOperationLedgerFormationBarrierSnapshot(requestTimeoutMs) {
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    const partitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
    const initialReplicaIds =
      getInitialReplicaIds(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
    const targetReplicaCount =
      arrayIsArray(initialReplicaIds) && initialReplicaIds.length > 0 ?
        initialReplicaIds.length :
        null;
    const now = this.now();
    const startupAuthority =
      await this.getPriorityPlacementFormationStartupAuthority(now, {
        requestTimeoutMs,
      });
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
    const formationReleaseHandoff =
      startupAuthority?.formationReleaseHandoff || null;
    return objectFreeze({
      now,
      partitionId,
      targetReplicaCount,
      startupAuthorityAvailable:
        startupAuthority?.authorityAvailable === true,
      startupAuthorityState: startupAuthority?.state || null,
      startupAuthorityReady:
        startupAuthority?.ready === true &&
        formationReleaseHandoff?.state ===
          FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
        formationReleaseHandoff?.releaseAuthorized === true,
      startupAuthorityRecoveryReasonCodes: objectFreeze(
        arrayIsArray(startupAuthority?.priorityRecoveryReasonCodes) ?
          arrayPrototypeSlice(startupAuthority.priorityRecoveryReasonCodes) :
          [],
      ),
      startupAuthorityPublicationRecoveryGateState:
        startupAuthority?.publicationRecoveryGate?.state || null,
      formationReleaseHandoff,
      startupAuthorityNodeCount:
        countStartupAuthorityNodeIds(startupAuthority),
      candidateNodeIds: objectFreeze(candidateNodeIds),
      preReadyCandidateNodeIds: objectFreeze(preReadyCandidateNodeIds),
    });
  }
  resolveOperationLedgerFormationBarrierTiming() {
    return objectFreeze({
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
        error: typeof error?.message === 'string' ?
          error.message :
          OPERATION_LEDGER_FORMATION_LIVENESS_PUBLISH_FAILURE,
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
      resolveOperationLedgerFormationReplicaCount(snapshot);
    const formationWaveNodeCount = mathMax(
      FORMATION_RELEASE_HANDOFF_MINIMUM_COHORT_SIZE,
      formationReplicaCount - 1,
    );
    const readyCandidateNodeCount =
      snapshot.candidateNodeIds.length -
      snapshot.preReadyCandidateNodeIds.length;
    return numberIsInteger(formationReplicaCount) &&
      formationReplicaCount > 0 &&
      snapshot.candidateNodeIds.length >= formationReplicaCount &&
      snapshot.preReadyCandidateNodeIds.length <=
        snapshot.candidateNodeIds.length &&
      snapshot.preReadyCandidateNodeIds.length >= formationWaveNodeCount &&
      readyCandidateNodeCount < formationReplicaCount;
  }
  hasPositiveOperationLedgerFormationBypassEvidence(snapshot) {
    const formationReplicaCount =
      resolveOperationLedgerFormationReplicaCount(snapshot);
    if (
      snapshot.startupAuthorityAvailable !== true ||
      !numberIsInteger(formationReplicaCount) ||
      formationReplicaCount <= 0 ||
      !numberIsInteger(snapshot.startupAuthorityNodeCount) ||
      snapshot.startupAuthorityNodeCount < 0
    ) {
      return false;
    }
    const readyCandidateNodeCount =
      snapshot.candidateNodeIds.length -
      snapshot.preReadyCandidateNodeIds.length;
    return snapshot.startupAuthorityNodeCount < formationReplicaCount ||
      readyCandidateNodeCount >= formationReplicaCount;
  }
  hasCapturedOperationLedgerFormationHandoff(snapshot) {
    return formationReleaseHandoffAuthorizesNode(
      snapshot.formationReleaseHandoff,
      this.nodeId,
    );
  }
  logOperationLedgerFormationBarrierState(state, snapshot) {
    this.logger.info(JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER, {
      nodeId: this.nodeId,
      state,
      partitionId: snapshot.partitionId,
      candidateNodeCount: snapshot.candidateNodeIds.length,
      preReadyCandidateNodeCount: snapshot.preReadyCandidateNodeIds.length,
      readyCandidateNodeCount:
        snapshot.candidateNodeIds.length -
        snapshot.preReadyCandidateNodeIds.length,
      startupAuthorityNodeCount: snapshot.startupAuthorityNodeCount,
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
   * A short discovery window avoids penalizing intentionally small clusters
   * and later join waves whose established READY members already satisfy the
   * replica floor. Only a current available authority observation can prove
   * that bypass is safe; absence keeps waiting and reaches the existing
   * retryable timeout. Once a genuinely cold cohort or exact self-capturing
   * handoff is observed, the owner latches the barrier and fails closed rather
   * than opening ACTIVE over incomplete/concentrated evidence.
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

    while (true) {
      const snapshot =
        await this.getOperationLedgerFormationBarrierSnapshot(pollMs);
      barrierEngaged = barrierEngaged ||
        this.hasSufficientOperationLedgerFormationCohort(snapshot) ||
        this.hasCapturedOperationLedgerFormationHandoff(snapshot);
      const bypassAuthorized =
        this.hasPositiveOperationLedgerFormationBypassEvidence(snapshot);
      const state = resolveOperationLedgerFormationBarrierState({
        barrierEngaged,
        bypassAuthorized,
        discoveryDeadline,
        snapshot,
      });

      if (state !== lastState) {
        this.logOperationLedgerFormationBarrierState(state, snapshot);
        lastState = state;
      }

      if (setPrototypeHas(
        OPERATION_LEDGER_FORMATION_BARRIER_RELEASE_STATES,
        state,
      )) {
        return;
      }
      if (snapshot.now >= timeoutDeadline) {
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
