import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';
import {
  HTTP_STATUS,
  NUM,
  TYPEOF,
} from '../../constants/index.js';
import {
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
  buildMembershipOwnerOutcome,
} from '../../control-plane/membership-lifecycle-controller.js';
import {
  BOOTSTRAP_REQUEST_ADMISSION_DECISION,
} from './bootstrap-request-admission-decision.js';
import {
  BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION,
  normalizeBootstrapRequestClientAttemptDeadlineSnapshot,
} from './bootstrap-request-owner-deadline.js';

const LOCAL_STR_836HW = 'move_replica_handoff_stabilizing';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const BOOTSTRAP_REQUEST_DEFER_STAGE = Object.freeze({
  REQUEST_START: 'request_start',
  BOOTSTRAP_JOIN_ADMISSION: 'bootstrap_join_admission',
  ADMISSION_BOUNDARY: 'admission_boundary',
  ADMISSION_SATURATION: 'admission_saturation',
  ADMISSION_CLAIM: 'admission_claim',
  REQUEST_EXECUTION_START: 'request_execution_start',
  BLOCKING_MOVE_REPLICA_ADMISSIONS: 'blocking_move_replica_admissions',
  SERVICE_LEADER_READINESS: 'service_leader_readiness',
  ASSIGNMENT_RESERVATION: 'assignment_reservation',
  RESPONSE_PREPARED: 'response_prepared',
  RETRYABLE_ERROR: 'retryable_error',
});
const BOOTSTRAP_REQUEST_BOUNDED_WORK_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  FAILED: 'failed',
});
const CLIENT_ATTEMPT_DEADLINE_RESPONSE_GUARD_MS = NUM.HUNDRED;

function resolveClientAttemptBoundedWorkTimeoutMs(clientAttemptDeadline) {
  const deadlineMs = Number(clientAttemptDeadline?.deadlineMs);
  const remainingBudgetMs = Number(clientAttemptDeadline?.remainingBudgetMs);
  if (
    !Number.isFinite(deadlineMs) ||
    deadlineMs <= NUM.ZERO ||
    !Number.isFinite(remainingBudgetMs) ||
    remainingBudgetMs <= NUM.ZERO
  ) {
    return NUM.ZERO;
  }
  return Math.max(
    NUM.ONE,
    Math.floor(remainingBudgetMs) -
      CLIENT_ATTEMPT_DEADLINE_RESPONSE_GUARD_MS,
  );
}

async function awaitClientAttemptBoundedWork(action, clientAttemptDeadline) {
  const timeoutMs =
    resolveClientAttemptBoundedWorkTimeoutMs(clientAttemptDeadline);
  if (timeoutMs <= NUM.ZERO) {
    return {
      outcome: BOOTSTRAP_REQUEST_BOUNDED_WORK_OUTCOME.COMPLETED,
      value: await action(),
    };
  }

  let timeoutHandle = null;
  const timeoutResult = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({
        outcome: BOOTSTRAP_REQUEST_BOUNDED_WORK_OUTCOME.EXPIRED,
        observedAtMs: Date.now(),
      });
    }, timeoutMs);
  });
  const workResult = Promise.resolve()
    .then(action)
    .then(
      (value) => ({
        outcome: BOOTSTRAP_REQUEST_BOUNDED_WORK_OUTCOME.COMPLETED,
        value,
      }),
      (error) => ({
        outcome: BOOTSTRAP_REQUEST_BOUNDED_WORK_OUTCOME.FAILED,
        error,
      }),
    );
  const result = await Promise.race([workResult, timeoutResult]);
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  if (result.outcome === BOOTSTRAP_REQUEST_BOUNDED_WORK_OUTCOME.FAILED) {
    throw result.error;
  }
  return result;
}

async function handleBootstrapRequest(request, reply) {
  const requestBody = request.body || {};
  const {nodeId, nodeAddress} = requestBody;

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

  const requestStartedAtMs = Date.now();
  const requestStartDeadlineSnapshot =
    normalizeBootstrapRequestClientAttemptDeadlineSnapshot(
      requestBody,
      requestStartedAtMs,
    );
  if (
    requestStartDeadlineSnapshot.decision ===
      BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.DEFER_EXPIRED
  ) {
    return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
      reply,
      {
        nodeId,
        nodeAddress,
        deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.REQUEST_START,
        observedAtMs: requestStartDeadlineSnapshot.observedAtMs,
        clientAttemptDeadline:
          requestStartDeadlineSnapshot.clientAttemptDeadline,
      },
    );
  }

  const bootstrapService = this.getBootstrapService();
  const bootstrapJoinAdmissionWork =
    await awaitClientAttemptBoundedWork(
      () => this.getBootstrapJoinAdmissionSnapshot(),
      requestStartDeadlineSnapshot.clientAttemptDeadline,
    );
  if (
    bootstrapJoinAdmissionWork.outcome ===
      BOOTSTRAP_REQUEST_BOUNDED_WORK_OUTCOME.EXPIRED
  ) {
    return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
      reply,
      {
        nodeId,
        nodeAddress,
        deferStage:
          BOOTSTRAP_REQUEST_DEFER_STAGE.BOOTSTRAP_JOIN_ADMISSION,
        observedAtMs: bootstrapJoinAdmissionWork.observedAtMs,
        clientAttemptDeadline:
          requestStartDeadlineSnapshot.clientAttemptDeadline,
      },
    );
  }
  const bootstrapJoinAdmissionSnapshot = bootstrapJoinAdmissionWork.value;
  const bootstrapRequestAdmissionDecision =
    this.evaluateBootstrapRequestAdmissionDecision(
      bootstrapService,
      bootstrapJoinAdmissionSnapshot,
    );
  if (
    bootstrapRequestAdmissionDecision.decision !==
      BOOTSTRAP_REQUEST_ADMISSION_DECISION.ADMIT
  ) {
    const responseTimestamp = Date.now();
    const startupAuthority =
      this.getStartupAuthoritySnapshotForBootstrapResponse(
        responseTimestamp,
      );
    this.logBootstrapRequestDeferred({
      nodeId,
      nodeAddress,
      deferStage:
        BOOTSTRAP_REQUEST_DEFER_STAGE.BOOTSTRAP_JOIN_ADMISSION,
      observedAtMs: responseTimestamp,
      reasonCode: bootstrapRequestAdmissionDecision.reasonCode,
      retryAfterMs: bootstrapRequestAdmissionDecision.retryAfterMs,
    });
    reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
    return this.buildBootstrapNotReadyResponse({
      error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      phase: bootstrapRequestAdmissionDecision.phase,
      reasonCode: bootstrapRequestAdmissionDecision.reasonCode,
      retryAfterMs: bootstrapRequestAdmissionDecision.retryAfterMs,
      startupAuthority,
    });
  }

  const requestStartupMode = requestBody.startupMode || null;
  const membershipOwnerOutcome = buildMembershipOwnerOutcome({
    membershipOwnerOutcome: requestBody.membershipOwnerOutcome,
    startupMode: requestStartupMode,
  });

  const conflictError = await this.checkForConflicts(
    nodeId,
    nodeAddress,
    {
      startupMode: requestStartupMode,
      membershipOwnerOutcome,
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

  const admissionBoundaryDeadlineSnapshot =
    normalizeBootstrapRequestClientAttemptDeadlineSnapshot(
      requestBody,
      Date.now(),
    );
  if (
    admissionBoundaryDeadlineSnapshot.decision ===
      BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.DEFER_EXPIRED
  ) {
    return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
      reply,
      {
        nodeId,
        nodeAddress,
        deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.ADMISSION_BOUNDARY,
        observedAtMs: admissionBoundaryDeadlineSnapshot.observedAtMs,
        clientAttemptDeadline:
          admissionBoundaryDeadlineSnapshot.clientAttemptDeadline,
      },
    );
  }

  this.expireStaleBootstrapAdmissions(
    admissionBoundaryDeadlineSnapshot.observedAtMs,
  );
  if (this.getInFlightBootstrapRequestCount() >=
      this.getMaxConcurrentBootstrapRequests()) {
    const retryAfterMs = this.getBootstrapAdmissionRetryAfterMs();
    this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, {
      nodeId,
      nodeAddress,
      seedNodeId: this.getSeedNodeId(),
      inFlightBootstrapRequests: this.getInFlightBootstrapRequestCount(),
      maxConcurrentBootstrapRequests:
        this.getMaxConcurrentBootstrapRequests(),
      retryAfterMs,
    });
    this.logBootstrapRequestDeferred({
      nodeId,
      nodeAddress,
      deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.ADMISSION_SATURATION,
      observedAtMs: admissionBoundaryDeadlineSnapshot.observedAtMs,
      reasonCode: BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
      retryAfterMs,
      clientAttemptDeadline:
        admissionBoundaryDeadlineSnapshot.clientAttemptDeadline,
    });
    reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
    return this.buildBootstrapNotReadyResponse({
      error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      reasonCode: BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
      retryAfterMs,
    });
  }

  const admissionClaimDeadlineSnapshot =
    normalizeBootstrapRequestClientAttemptDeadlineSnapshot(
      requestBody,
      Date.now(),
    );
  if (
    admissionClaimDeadlineSnapshot.decision ===
      BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.DEFER_EXPIRED
  ) {
    return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
      reply,
      {
        nodeId,
        nodeAddress,
        deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.ADMISSION_CLAIM,
        observedAtMs: admissionClaimDeadlineSnapshot.observedAtMs,
        clientAttemptDeadline:
          admissionClaimDeadlineSnapshot.clientAttemptDeadline,
      },
    );
  }

  const now = admissionClaimDeadlineSnapshot.observedAtMs;
  const admission = this.acquireBootstrapAdmission({
    nodeId,
    nodeAddress,
    now,
  });
  const requestExecutionBudget =
    this.createBootstrapRequestExecutionBudget(
      now,
      admissionClaimDeadlineSnapshot.clientAttemptDeadline,
    );
  try {
    if (!this.hasRemainingBootstrapRequestExecutionBudget(
      requestExecutionBudget,
    )) {
      return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
        reply,
        {
          nodeId,
          nodeAddress,
          deferStage:
            BOOTSTRAP_REQUEST_DEFER_STAGE.REQUEST_EXECUTION_START,
          observedAtMs: now,
          clientAttemptDeadline:
            admissionClaimDeadlineSnapshot.clientAttemptDeadline,
          timeoutBudget: requestExecutionBudget,
        },
      );
    }
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
        {
          nodeId,
          nodeAddress,
          deferStage:
            BOOTSTRAP_REQUEST_DEFER_STAGE
              .BLOCKING_MOVE_REPLICA_ADMISSIONS,
          timeoutBudget: requestExecutionBudget,
        },
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
      this.logBootstrapRequestDeferred({
        nodeId,
        nodeAddress,
        deferStage:
          BOOTSTRAP_REQUEST_DEFER_STAGE
            .BLOCKING_MOVE_REPLICA_ADMISSIONS,
        reasonCode:
          BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
        retryAfterMs,
        timeoutBudget: requestExecutionBudget,
      });
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
      startupMode: requestStartupMode,
      membershipOwnerOutcome,
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
      this.logBootstrapRequestDeferred({
        nodeId,
        nodeAddress,
        deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.SERVICE_LEADER_READINESS,
        observedAtMs: responseTimestamp,
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
        timeoutBudget: requestExecutionBudget,
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
        {
          nodeId,
          nodeAddress,
          deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.SERVICE_LEADER_READINESS,
          timeoutBudget: requestExecutionBudget,
        },
      );
    }

    const budgetedAssignmentOptions =
      this.attachBootstrapRequestExecutionBudget(
        {
          startupMode: requestStartupMode,
          membershipOwnerOutcome,
        },
        requestExecutionBudget,
      );
    const assignment =
      await this.determineAndReserveMessageGroupAssignment(
        nodeId,
        budgetedAssignmentOptions,
      );
    if (!this.hasRemainingBootstrapRequestExecutionBudget(
      requestExecutionBudget,
    )) {
      return this.buildBootstrapRequestExecutionBudgetDeferredResponse(
        reply,
        {
          nodeId,
          nodeAddress,
          deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.ASSIGNMENT_RESERVATION,
          timeoutBudget: requestExecutionBudget,
        },
      );
    }
    const currentEpoch = this.getCurrentEpoch();
    const topologySnapshotEnvelope = this.attachBootstrapAdmissionPeerHints(
      this.buildBootstrapResponseTopologySnapshotEnvelope({
        currentEpoch,
      }),
      {excludeNodeId: nodeId},
    );
    const {
      systemTableSnapshots,
      topologySnapshotMeta,
    } = topologySnapshotEnvelope;
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

    if (!this.hasRemainingBootstrapRequestExecutionBudget(
      requestExecutionBudget,
    )) {
      return this.buildBootstrapRequestExecutionBudgetDeferredResponse(
        reply,
        {
          nodeId,
          nodeAddress,
          deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.RESPONSE_PREPARED,
          observedAtMs: responseTimestamp,
          timeoutBudget: requestExecutionBudget,
        },
      );
    }

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
      const requestExecutionBudgetExhausted =
        this.hasRemainingBootstrapRequestExecutionBudget(
          requestExecutionBudget,
          responseTimestamp,
        ) !== true;
      const reasonCode =
        typeof error?.reasonCode === TYPEOF.STRING &&
        error.reasonCode.length > NUM.ZERO ?
          error.reasonCode :
          requestExecutionBudgetExhausted ?
            BOOTSTRAP_API_PROBE_REASON
              .BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED :
          BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE;
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, {
        nodeId,
        nodeAddress,
        error: error.message,
        code: error?.errorCode || error?.code || null,
        reasonCode,
        retryAfterMs,
      });
      this.logBootstrapRequestDeferred({
        nodeId,
        nodeAddress,
        deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.RETRYABLE_ERROR,
        observedAtMs: responseTimestamp,
        reasonCode,
        retryAfterMs,
        timeoutBudget: requestExecutionBudget,
      });
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code:
          typeof error?.errorCode === LOCAL_STR_STRING &&
          error.errorCode.length > LOCAL_NUM_ZERO ?
            error.errorCode :
            BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        reasonCode,
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

function defineBootstrapRequestOwnerHandlerMethods(OwnerClass) {
  Object.defineProperties(OwnerClass.prototype, {
    handleBootstrapRequest: {
      value: handleBootstrapRequest,
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });
}

export {defineBootstrapRequestOwnerHandlerMethods};
