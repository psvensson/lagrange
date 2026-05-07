import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';
import {
  HTTP_STATUS,
  NUM,
  TYPEOF,
} from '../../constants/index.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_RESPONSE_FIELD,
} from '../bootstrap-api-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  createTopLevelOperationBudget,
  getRemainingBudgetMs,
} from '../../control-plane/timeout-budget.js';

const LOCAL_STR_836HW = 'move_replica_handoff_stabilizing';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const BOOTSTRAP_REQUEST_EXECUTION_OPERATION_NAME =
  'bootstrap_request_execution';
const BOOTSTRAP_REQUEST_TIMEOUT_BUDGET_FIELD = 'timeoutBudget';

const RETRYABLE_BOOTSTRAP_DEPENDENCY_ERROR_FRAGMENTS = Object.freeze([
  'ControlPlaneSystemTableGateway requires cdcIntegrationService',
  'ControlPlaneSystemTableGateway requires sqlQueryEngine',
]);
const BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED =
  'bootstrap_request_admission_untracked';
const BOOTSTRAP_REQUEST_ADMISSION_EMPTY_EXPIRATIONS = Object.freeze([]);

class BootstrapRequestOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getSeedNodeAddress() {
    return this.delegates.getSeedNodeAddress?.() || null;
  }

  getSeedNodeWsAddress() {
    return this.delegates.getSeedNodeWsAddress?.() || null;
  }

  getWsPort() {
    return this.delegates.getWsPort?.() || null;
  }

  getBootstrapService() {
    return this.delegates.getBootstrapService?.() || null;
  }

  async getBootstrapJoinAdmissionSnapshot() {
    const snapshot =
      await this.delegates.getBootstrapJoinAdmissionSnapshot?.();
    return snapshot && typeof snapshot === TYPEOF.OBJECT ?
      snapshot :
      null;
  }

  isBootstrapRequestStartupComplete(bootstrapService) {
    if (!bootstrapService) {
      return true;
    }
    if (
      typeof bootstrapService.isBootstrapStartupComplete === TYPEOF.FUNCTION
    ) {
      return bootstrapService.isBootstrapStartupComplete() === true;
    }
    return bootstrapService.phase === BOOTSTRAP_PHASE.COMPLETE;
  }

  getMaxConcurrentBootstrapRequests() {
    return this.delegates.getMaxConcurrentBootstrapRequests?.() || NUM.ZERO;
  }

  getBootstrapAdmissionRetryAfterMs() {
    return this.delegates.getBootstrapAdmissionRetryAfterMs?.() || NUM.ZERO;
  }

  getBootstrapRequestExecutionBudgetMs() {
    return this.delegates.getBootstrapRequestExecutionBudgetMs?.() || NUM.ZERO;
  }

  getBootstrapAdmissionLeaseMs() {
    return this.delegates.getBootstrapAdmissionLeaseMs?.() || NUM.ZERO;
  }

  expireStaleBootstrapAdmissions(now) {
    return this.delegates.expireStaleBootstrapAdmissions?.(now) ||
      BOOTSTRAP_REQUEST_ADMISSION_EMPTY_EXPIRATIONS;
  }

  acquireBootstrapAdmission(snapshot) {
    const admission = this.delegates.acquireBootstrapAdmission?.(snapshot);
    if (admission && typeof admission === TYPEOF.OBJECT) {
      return admission;
    }
    this.setInFlightBootstrapRequestCount(
      this.getInFlightBootstrapRequestCount() + NUM.ONE,
    );
    return {
      admissionId: BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED,
    };
  }

  releaseBootstrapAdmission(admission) {
    if (
      admission?.admissionId &&
      admission.admissionId !== BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED &&
      typeof this.delegates.releaseBootstrapAdmission === TYPEOF.FUNCTION
    ) {
      this.delegates.releaseBootstrapAdmission(admission);
      return;
    }
    this.setInFlightBootstrapRequestCount(
      Math.max(
        NUM.ZERO,
        this.getInFlightBootstrapRequestCount() - NUM.ONE,
      ),
    );
  }

  getInFlightBootstrapRequestCount() {
    return this.delegates.getInFlightBootstrapRequestCount?.() || NUM.ZERO;
  }

  setInFlightBootstrapRequestCount(count) {
    this.delegates.setInFlightBootstrapRequestCount?.(count);
  }

  validateBootstrapRequest(nodeId, nodeAddress) {
    return this.delegates.validateBootstrapRequest?.(nodeId, nodeAddress);
  }

  async checkForConflicts(nodeId, nodeAddress, options = {}) {
    return this.delegates.checkForConflicts?.(
      nodeId,
      nodeAddress,
      options,
    );
  }

  async getBlockingMoveReplicaBootstrapAdmissions(now, options = {}) {
    return this.delegates.getBlockingMoveReplicaBootstrapAdmissions?.(
      now,
      options,
    ) || [];
  }

  resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now) {
    return this.delegates.resolveMoveReplicaBootstrapAdmissionRetryAfterMs?.(
      reservation,
      now,
    ) || NUM.ZERO;
  }

  buildBootstrapNotReadyResponse(options) {
    return this.delegates.buildBootstrapNotReadyResponse?.(options) || {
      success: false,
      error: options?.error,
      code: options?.code,
    };
  }

  async waitForServiceLeaders(options = {}) {
    return this.delegates.waitForServiceLeaders?.(options) || {ready: false};
  }

  async determineAndReserveMessageGroupAssignment(nodeId, options = {}) {
    return this.delegates.determineAndReserveMessageGroupAssignment?.(
      nodeId,
      options,
    );
  }

  getCurrentEpoch() {
    return this.delegates.getCurrentEpoch?.() || null;
  }

  buildBootstrapTopologySnapshotEnvelope(options) {
    return this.delegates.buildBootstrapTopologySnapshotEnvelope?.(options) || {
      systemTableSnapshots: {},
      topologySnapshotMeta: null,
    };
  }

  buildBootstrapResponseTopologySnapshotEnvelope(options) {
    return this.delegates.buildBootstrapResponseTopologySnapshotEnvelope?.(
      options,
    ) || this.buildBootstrapTopologySnapshotEnvelope(options);
  }

  getClusterConfiguration() {
    return this.delegates.getClusterConfiguration?.() || {};
  }

  getReadyNodes(options = {}) {
    return this.delegates.getReadyNodes?.(options) || [];
  }

  getTablePolicies() {
    return this.delegates.getTablePolicies?.() || {};
  }

  getLatencyTopologyHints(nodeId) {
    return this.delegates.getLatencyTopologyHints?.(nodeId) || null;
  }

  getStartupAuthoritySnapshotForBootstrapResponse(observedAt) {
    const startupAuthority =
      this.delegates.getStartupAuthoritySnapshotForBootstrapResponse?.(
        observedAt,
      );
    return startupAuthority && typeof startupAuthority === TYPEOF.OBJECT ?
      startupAuthority :
      null;
  }

  isRetryableBootstrapDependencyError(error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    return RETRYABLE_BOOTSTRAP_DEPENDENCY_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    );
  }

  isRetryableBootstrapRequestError(error) {
    if (!error) {
      return false;
    }
    if (Number.isFinite(error?.statusCode) &&
        Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE) {
      return true;
    }
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > NUM.ZERO) {
      return true;
    }
    return isRetryableControlPlaneError(error) ||
      this.isRetryableBootstrapDependencyError(error);
  }

  resolveBootstrapRequestRetryAfterMs(error) {
    const retryAfterMs = getControlPlaneRetryAfterMs(error);
    if (retryAfterMs > NUM.ZERO) {
      return retryAfterMs;
    }
    return Math.max(NUM.ZERO, this.getBootstrapAdmissionRetryAfterMs());
  }

  createBootstrapRequestExecutionBudget(startedAtMs) {
    const configuredBudgetMs = this.getBootstrapRequestExecutionBudgetMs();
    if (!Number.isFinite(configuredBudgetMs) || configuredBudgetMs <= NUM.ZERO) {
      return null;
    }
    return createTopLevelOperationBudget({
      configuredBudgetMs,
      startedAtMs,
      operationName: BOOTSTRAP_REQUEST_EXECUTION_OPERATION_NAME,
    });
  }

  hasRemainingBootstrapRequestExecutionBudget(
    timeoutBudget,
    now = Date.now(),
  ) {
    if (!timeoutBudget || typeof timeoutBudget !== TYPEOF.OBJECT) {
      return true;
    }
    return getRemainingBudgetMs(timeoutBudget, {
      now: () => now,
    }) > NUM.ZERO;
  }

  buildBootstrapRequestExecutionBudgetDeferredResponse(
    reply,
    observedAt = Date.now(),
  ) {
    const startupAuthority =
      this.getStartupAuthoritySnapshotForBootstrapResponse(observedAt);
    reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
    return this.buildBootstrapNotReadyResponse({
      error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      reasonCode:
        BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
      retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
      startupAuthority,
    });
  }

  attachBootstrapRequestExecutionBudget(options = {}, timeoutBudget) {
    if (!timeoutBudget || typeof timeoutBudget !== TYPEOF.OBJECT) {
      return options;
    }
    const nextOptions = {
      ...options,
    };
    Object.defineProperty(
      nextOptions,
      BOOTSTRAP_REQUEST_TIMEOUT_BUDGET_FIELD,
      {
        value: timeoutBudget,
        enumerable: false,
        configurable: true,
        writable: false,
      },
    );
    return nextOptions;
  }

  async handleBootstrapRequest(request, reply) {
    const {nodeId, nodeAddress} = request.body || {};

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RECEIVED_BOOTSTRAP_REQUEST, {
      nodeId,
      nodeAddress,
      seedNodeId: this.getSeedNodeId(),
    });

    const validationError =
      this.validateBootstrapRequest(nodeId, nodeAddress);
    if (validationError) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.VALIDATION_FAILED, {
        nodeId,
        nodeAddress,
        error: validationError,
      });
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {error: validationError};
    }

    const bootstrapService = this.getBootstrapService();
    const bootstrapJoinAdmissionSnapshot =
      await this.getBootstrapJoinAdmissionSnapshot();
    if (
      !this.isBootstrapRequestStartupComplete(bootstrapService) &&
      bootstrapJoinAdmissionSnapshot?.ready !== true
    ) {
      const responseTimestamp = Date.now();
      const startupAuthority =
        this.getStartupAuthoritySnapshotForBootstrapResponse(
          responseTimestamp,
        );
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        phase: bootstrapService.phase,
        reasonCode: BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
        retryAfterMs: bootstrapJoinAdmissionSnapshot?.retryAfterMs,
        startupAuthority,
      });
    }

    const conflictError = await this.checkForConflicts(
      nodeId,
      nodeAddress,
      {
        startupMode: request.body?.startupMode || null,
      },
    );
    if (conflictError) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, {
        nodeId,
        nodeAddress,
        error: conflictError,
      });
      reply.code(HTTP_STATUS.CONFLICT);
      return {error: conflictError};
    }

    const now = Date.now();
    this.expireStaleBootstrapAdmissions(now);
    if (this.getInFlightBootstrapRequestCount() >=
        this.getMaxConcurrentBootstrapRequests()) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, {
        nodeId,
        nodeAddress,
        seedNodeId: this.getSeedNodeId(),
        inFlightBootstrapRequests: this.getInFlightBootstrapRequestCount(),
        maxConcurrentBootstrapRequests:
          this.getMaxConcurrentBootstrapRequests(),
        retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
      });
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        reasonCode: BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
        retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
      });
    }

    const admission = this.acquireBootstrapAdmission({
      nodeId,
      nodeAddress,
      now,
    });
    const requestExecutionBudget =
      this.createBootstrapRequestExecutionBudget(now);
    try {
      const budgetedBlockingOptions =
        this.attachBootstrapRequestExecutionBudget(
          {},
          requestExecutionBudget,
        );
      const blockingMoveReplicaAdmissions =
        await this.getBlockingMoveReplicaBootstrapAdmissions(
          now,
          budgetedBlockingOptions,
        );
      if (!this.hasRemainingBootstrapRequestExecutionBudget(
        requestExecutionBudget,
      )) {
        return this.buildBootstrapRequestExecutionBudgetDeferredResponse(
          reply,
        );
      }
      if (blockingMoveReplicaAdmissions.length > NUM.ZERO) {
        const blockingReservation = blockingMoveReplicaAdmissions[NUM.ZERO];
        const retryAfterMs =
          this.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
            blockingReservation,
            now,
          );
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED,
          {
            nodeId,
            nodeAddress,
            seedNodeId: this.getSeedNodeId(),
            admissionBlock: LOCAL_STR_836HW,
            assignmentId: blockingReservation.assignmentId,
            replicaId: blockingReservation.replicaId,
            groupId: blockingReservation.groupId || null,
            sourceNodeId: blockingReservation.sourceNodeId || null,
            targetNodeId: blockingReservation.targetNodeId,
            retryAfterMs,
          },
        );
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.buildBootstrapNotReadyResponse({
          error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
          reasonCode:
            BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
          retryAfterMs,
        });
      }

      const leaderStatus = await this.waitForServiceLeaders({
        startupMode: request.body?.startupMode || null,
      });
      if (!leaderStatus.ready) {
        const responseTimestamp = Date.now();
        const startupAuthority =
          this.getStartupAuthoritySnapshotForBootstrapResponse(
            responseTimestamp,
          );
        this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, {
          nodeId,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders,
          missingMessageGroupLeaders: leaderStatus.missingMessageGroupLeaders,
          missingPartitionLeaderNodes: leaderStatus.missingPartitionLeaderNodes,
          missingMessageGroupLeaderNodes:
            leaderStatus.missingMessageGroupLeaderNodes,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.buildBootstrapNotReadyResponse({
          error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          leaderReadiness: leaderStatus,
          startupAuthority,
        });
      }
      if (!this.hasRemainingBootstrapRequestExecutionBudget(
        requestExecutionBudget,
      )) {
        return this.buildBootstrapRequestExecutionBudgetDeferredResponse(
          reply,
        );
      }

      const budgetedAssignmentOptions =
        this.attachBootstrapRequestExecutionBudget(
          {
            startupMode: request.body?.startupMode || null,
          },
          requestExecutionBudget,
        );
      const assignment =
        await this.determineAndReserveMessageGroupAssignment(
          nodeId,
          budgetedAssignmentOptions,
        );
      const currentEpoch = this.getCurrentEpoch();
      const {
        systemTableSnapshots,
        topologySnapshotMeta,
      } = this.buildBootstrapResponseTopologySnapshotEnvelope({
        currentEpoch,
      });
      const clusterConfig = this.getClusterConfiguration();
      const readyNodes = this.getReadyNodes({
        requirePublishedMembership: true,
      });

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.READY_NODES_FOR_BOOTSTRAP, {
        nodeId,
        readyNodesCount: readyNodes.length,
        readyNodes,
        seedNodeId: this.getSeedNodeId(),
      });

      const tablePolicies = this.getTablePolicies();
      const latencyTopologyHints = this.getLatencyTopologyHints(nodeId);
      const responseTimestamp = Date.now();
      const startupAuthority =
        this.getStartupAuthoritySnapshotForBootstrapResponse(responseTimestamp);
      const seedNodeWsAddress = resolveAdvertisedWebSocketAddress({
        advertisedAddress: this.getSeedNodeWsAddress(),
        nodeAddress: this.getSeedNodeAddress() ||
          BOOTSTRAP_API_DEFAULT.WS_HOST,
        wsPort: this.getWsPort() || null,
      });

      const response = {
        success: true,
        seedNodeId: this.getSeedNodeId(),
        seedNodeAddress: this.getSeedNodeAddress(),
        seedNodeWsAddress,
        messageGroupAssignment: assignment,
        systemTableSnapshots,
        topologySnapshotMeta,
        readyNodes,
        tablePolicies,
        currentEpoch,
        latencyTopologyHints,
        clusterConfig,
        ...(startupAuthority ?
          {
            [BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY]:
              startupAuthority,
          } :
          {}),
        leaderReadiness: {
          ready: leaderStatus.ready === true,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders || [],
          missingPartitionLeaderNodes:
            leaderStatus.missingPartitionLeaderNodes || [],
          missingPartitionLeaderAddresses:
            leaderStatus.missingPartitionLeaderAddresses || [],
          missingMessageGroupLeaders:
            leaderStatus.missingMessageGroupLeaders || [],
          missingMessageGroupLeaderNodes:
            leaderStatus.missingMessageGroupLeaderNodes || [],
          missingMessageGroupLeaderAddresses:
            leaderStatus.missingMessageGroupLeaderAddresses || [],
        },
        timestamp: responseTimestamp,
      };

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RESPONSE_PREPARED, {
        nodeId,
        strategy: assignment.strategy,
        groupId: assignment.groupId,
      });

      return response;
    } catch (error) {
      if (this.isRetryableBootstrapRequestError(error)) {
        const retryAfterMs = this.resolveBootstrapRequestRetryAfterMs(error);
        const responseTimestamp = Date.now();
        const startupAuthority =
          this.getStartupAuthoritySnapshotForBootstrapResponse(
            responseTimestamp,
          );
        this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, {
          nodeId,
          nodeAddress,
          error: error.message,
          code: error?.errorCode || error?.code || null,
          retryAfterMs,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.buildBootstrapNotReadyResponse({
          error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
          code:
            typeof error?.errorCode === LOCAL_STR_STRING &&
            error.errorCode.length > LOCAL_NUM_ZERO ?
              error.errorCode :
              BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
          reasonCode:
            BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
          retryAfterMs,
          startupAuthority,
        });
      }
      this.getLogger().error(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, {
        nodeId,
        nodeAddress,
        error: error.message,
        stack: error.stack,
      });
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      throw error;
    } finally {
      this.releaseBootstrapAdmission(admission);
    }
  }
}

export {BootstrapRequestOwner};
