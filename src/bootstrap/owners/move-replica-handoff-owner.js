import {v4 as uuidv4} from 'uuid';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  HTTP_STATUS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TYPEOF,
  WORKFLOW_STEP,
} from '../../constants/index.js';
import {MessageGroupAssignment} from '../message-group-assignment.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HANDOFF_OPERATION,
  BOOTSTRAP_API_HANDOFF_PHASE,
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
} from '../bootstrap-api-constants.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';

const LOCAL_STR_SJUG2 = 'MOVE_REPLICA target node must differ from source node';
const LOCAL_STR_11VSR = 'MOVE_REPLICA target address mismatch';
const LOCAL_STR_P1U35 = 'unknown MOVE_REPLICA handoff failure';
const LOCAL_STR_D6B6P = 'Restored previous service owner after failed MOVE_REPLICA target registration';
const LOCAL_STR_Y2LF5 = 'Failed to restore previous service owner after MOVE_REPLICA target registration failure';

class MoveReplicaHandoffOwner {
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

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getMessageGroupServices() {
    return this.delegates.getMessageGroupServices?.() || null;
  }

  getMessageRouter() {
    return this.delegates.getMessageRouter?.() || null;
  }

  getMoveReplicaAssignmentReservations() {
    return this.delegates.getMoveReplicaAssignmentReservations?.() || null;
  }

  buildRegisterServiceValidationError(statusCode, message, code, options) {
    return this.delegates.buildRegisterServiceValidationError?.(
      statusCode,
      message,
      code,
      options,
    ) || new Error(message);
  }

  buildRegisteredServiceMutationRow(serviceData) {
    return this.delegates.buildRegisteredServiceMutationRow?.(serviceData) || serviceData;
  }

  async executeBootstrapControlPlaneMutation(operation, options) {
    return this.delegates.executeBootstrapControlPlaneMutation?.(
      operation,
      options,
    );
  }

  buildBootstrapControlPlaneQueryError(result, fallbackMessage) {
    return this.delegates.buildBootstrapControlPlaneQueryError?.(
      result,
      fallbackMessage,
    ) || new Error(fallbackMessage);
  }

  async waitForRegisteredServiceCacheVisibility(expectedService) {
    return this.delegates.waitForRegisteredServiceCacheVisibility?.(
      expectedService,
    );
  }

  async insertMoveReplicaHandoffOperation(handoffContext) {
    return this.delegates.insertMoveReplicaHandoffOperation?.(handoffContext);
  }

  async updateMoveReplicaHandoffOperation(handoffContext) {
    return this.delegates.updateMoveReplicaHandoffOperation?.(handoffContext);
  }

  isRetryableMoveReplicaHandoffError(error) {
    if (!error) {
      return false;
    }
    if (error?.errorCode ===
      BOOTSTRAP_PIPELINE_ERROR_CODE
        .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT) {
      return true;
    }
    if (Number.isFinite(error?.statusCode) &&
        Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE) {
      return true;
    }
    return Number.isFinite(error?.retryAfterMs);
  }

  shouldPreserveMoveReplicaHandoffReservation(
    handoffContext,
    error,
    sourceRemovalCompleted,
  ) {
    if (!handoffContext || sourceRemovalCompleted === true) {
      return false;
    }
    return this.isRetryableMoveReplicaHandoffError(error);
  }

  assertSingleOwnerReplicaRegistration(serviceData, assignmentContext) {
    if (serviceData?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP) {
      return;
    }

    const serviceId = serviceData?.[COLUMN.SERVICE_ID];
    const targetNodeId = serviceData?.[COLUMN.NODE_ID];
    const existingRow = this.getSystemTableCache()?.get(TABLES.SERVICES, serviceId);
    if (!existingRow) {
      return;
    }

    const existingNodeId = existingRow[COLUMN.NODE_ID] || null;
    const existingStatus = String(
      existingRow[COLUMN.STATUS] || STRING.UNKNOWN,
    ).toLowerCase();
    if (!existingNodeId ||
        existingNodeId === targetNodeId ||
        existingStatus !== SERVICE_STATUS.ACTIVE) {
      return;
    }

    const assignmentMatchesConflict = assignmentContext &&
      assignmentContext.replicaId === serviceId &&
      assignmentContext.targetNodeId === targetNodeId &&
      assignmentContext.sourceNodeId === existingNodeId;
    if (assignmentMatchesConflict) {
      return;
    }

    if (this.isCanonicalGroupHomeNode(
      serviceData?.[COLUMN.GROUP_ID],
      targetNodeId,
    )) {
      return;
    }

    throw this.buildRegisterServiceValidationError(
      HTTP_STATUS.CONFLICT,
      BOOTSTRAP_API_ERROR.REPLICA_OWNER_CONFLICT,
      BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.REPLICA_OWNER_CONFLICT,
    );
  }

  isCanonicalGroupHomeNode(groupId, nodeId) {
    if (!groupId || !nodeId) {
      return false;
    }
    const mgAssignment = new MessageGroupAssignment({
      seedNodeAddress: this.getSeedNodeAddress(),
    });
    const canonicalGroupId = mgAssignment.generateGroupId(nodeId);
    return groupId === canonicalGroupId;
  }

  buildMoveReplicaHandoffContext(serviceData) {
    const serviceId = serviceData[COLUMN.SERVICE_ID];
    const existing =
      this.getSystemTableCache()?.get(TABLES.SERVICES, serviceId) || {};
    const now = Date.now();
    const groupId =
      serviceData[COLUMN.GROUP_ID] ||
      existing[COLUMN.GROUP_ID] ||
      serviceId;
    const sourceNodeId = existing[COLUMN.NODE_ID] || this.getSeedNodeId();
    const targetNodeId = serviceData[COLUMN.NODE_ID];

    return {
      operationId: uuidv4(),
      type: BOOTSTRAP_API_HANDOFF_OPERATION.TYPE,
      partitionId: groupId,
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      entityId: groupId,
      replicaId: serviceId,
      sourceNodeId,
      targetNodeId,
      status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      workflowStep: WORKFLOW_STEP.CREATING,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      leaseExpiresAt: null,
      errorMessage: null,
      stepsHistory: [],
    };
  }

  buildMoveReplicaHandoffContextFromAssignment(serviceData, assignmentContext) {
    const now = Date.now();
    const groupId = serviceData[COLUMN.GROUP_ID] || assignmentContext.groupId || null;
    const existingStepsHistory = Array.isArray(assignmentContext?.stepsHistory) ?
      assignmentContext.stepsHistory.map((step) => ({...step})) :
      [];
    return {
      operationId: assignmentContext.assignmentId,
      type: BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
      partitionId: groupId,
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      entityId: groupId,
      replicaId: assignmentContext.replicaId,
      sourceNodeId: assignmentContext.sourceNodeId || this.getSeedNodeId(),
      targetNodeId: assignmentContext.targetNodeId,
      status: assignmentContext.status || BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      leaseExpiresAt: Number.isFinite(assignmentContext.leaseExpiresAt) ?
        Math.floor(assignmentContext.leaseExpiresAt) :
        null,
      errorMessage: null,
      stepsHistory: existingStepsHistory,
    };
  }

  recordMoveReplicaHandoffPhase(handoffContext, phase, workflowStep, status) {
    const now = Date.now();
    handoffContext.workflowStep = workflowStep;
    handoffContext.status = status;
    handoffContext.updatedAt = now;
    handoffContext.stepsHistory.push({
      phase,
      step: workflowStep,
      status,
      timestamp: now,
    });

    const reservations = this.getMoveReplicaAssignmentReservations();
    const existingReservation = reservations?.get(handoffContext.operationId);
    if (existingReservation) {
      reservations.set(handoffContext.operationId, {
        ...existingReservation,
        status,
        updatedAt: now,
        stepsHistory: handoffContext.stepsHistory,
      });
    }
  }

  async startMoveReplicaHandoff(serviceData, assignmentContext = null) {
    const handoffContext = assignmentContext ?
      this.buildMoveReplicaHandoffContextFromAssignment(
        serviceData,
        assignmentContext,
      ) :
      this.buildMoveReplicaHandoffContext(serviceData);
    this.recordMoveReplicaHandoffPhase(
      handoffContext,
      BOOTSTRAP_API_HANDOFF_PHASE.PREPARE_TARGET,
      WORKFLOW_STEP.CREATING,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
    );

    const reservations = this.getMoveReplicaAssignmentReservations();
    if (assignmentContext) {
      try {
        await this.updateMoveReplicaHandoffOperation(handoffContext);
      } catch (handoffWriteError) {
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED,
          {
            operationId: handoffContext.operationId,
            assignmentId: assignmentContext.assignmentId,
            error: handoffWriteError.message,
          },
        );
      }
      reservations?.set(assignmentContext.assignmentId, {
        ...assignmentContext,
        status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
        updatedAt: handoffContext.updatedAt,
        leaseExpiresAt: handoffContext.leaseExpiresAt,
        stepsHistory: handoffContext.stepsHistory,
      });
    } else {
      await this.insertMoveReplicaHandoffOperation(handoffContext);
    }

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_STARTED, {
      operationId: handoffContext.operationId,
      serviceId: handoffContext.replicaId,
      sourceNodeId: handoffContext.sourceNodeId,
      targetNodeId: handoffContext.targetNodeId,
    });

    return handoffContext;
  }

  async executeMoveReplicaHandoffPhase(
    handoffContext,
    phase,
    workflowStep,
    status,
    executor,
  ) {
    this.recordMoveReplicaHandoffPhase(
      handoffContext,
      phase,
      workflowStep,
      status,
    );
    try {
      await this.updateMoveReplicaHandoffOperation(handoffContext);
    } catch (phaseWriteError) {
      this.getLogger().warn(
        BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED,
        {
          operationId: handoffContext.operationId,
          phase,
          error: phaseWriteError.message,
        },
      );
    }
    await executor();

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_PHASE_APPLIED, {
      operationId: handoffContext.operationId,
      phase,
      workflowStep,
      status,
      serviceId: handoffContext.replicaId,
    });
  }

  verifyMoveReplicaHandoffTarget(handoffContext, serviceData) {
    if (handoffContext.sourceNodeId === handoffContext.targetNodeId) {
      throw new Error(LOCAL_STR_SJUG2);
    }

    const expectedAddress = `${handoffContext.targetNodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${handoffContext.replicaId}`;
    const suppliedAddress = serviceData[COLUMN.ADDRESS];
    if (suppliedAddress && suppliedAddress !== expectedAddress) {
      throw new Error(LOCAL_STR_11VSR);
    }
  }

  async completeMoveReplicaHandoff(handoffContext) {
    this.recordMoveReplicaHandoffPhase(
      handoffContext,
      BOOTSTRAP_API_HANDOFF_PHASE.COMMIT_METADATA,
      WORKFLOW_STEP.ACTIVE,
      BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
    );
    handoffContext.completedAt = handoffContext.updatedAt;
    handoffContext.leaseExpiresAt = handoffContext.updatedAt;
    handoffContext.errorMessage = null;
    try {
      await this.updateMoveReplicaHandoffOperation(handoffContext);
    } catch (completionWriteError) {
      this.getLogger().warn(
        BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED,
        {
          operationId: handoffContext.operationId,
          phase: BOOTSTRAP_API_HANDOFF_PHASE.COMMIT_METADATA,
          error: completionWriteError.message,
        },
      );
    }

    this.getMoveReplicaAssignmentReservations()?.set(handoffContext.operationId, {
      ...(this.getMoveReplicaAssignmentReservations()?.get(handoffContext.operationId) || {}),
      assignmentId: handoffContext.operationId,
      replicaId: handoffContext.replicaId,
      sourceNodeId: handoffContext.sourceNodeId,
      targetNodeId: handoffContext.targetNodeId,
      groupId: handoffContext.partitionId,
      status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      leaseExpiresAt: handoffContext.leaseExpiresAt,
      updatedAt: handoffContext.updatedAt,
      stepsHistory: handoffContext.stepsHistory,
    });

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_COMPLETED, {
      operationId: handoffContext.operationId,
      serviceId: handoffContext.replicaId,
      sourceNodeId: handoffContext.sourceNodeId,
      targetNodeId: handoffContext.targetNodeId,
    });
  }

  async failMoveReplicaHandoff(handoffContext, error) {
    try {
      this.recordMoveReplicaHandoffPhase(
        handoffContext,
        BOOTSTRAP_API_HANDOFF_PHASE.FAILED,
        WORKFLOW_STEP.FAILED,
        BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
      );
      handoffContext.completedAt = handoffContext.updatedAt;
      handoffContext.leaseExpiresAt = handoffContext.updatedAt;
      handoffContext.errorMessage =
        error?.message || LOCAL_STR_P1U35;
      await this.updateMoveReplicaHandoffOperation(handoffContext);
      this.getMoveReplicaAssignmentReservations()?.set(handoffContext.operationId, {
        ...(this.getMoveReplicaAssignmentReservations()?.get(handoffContext.operationId) || {}),
        assignmentId: handoffContext.operationId,
        replicaId: handoffContext.replicaId,
        sourceNodeId: handoffContext.sourceNodeId,
        targetNodeId: handoffContext.targetNodeId,
        groupId: handoffContext.partitionId,
        status: BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
        leaseExpiresAt: handoffContext.leaseExpiresAt,
        updatedAt: handoffContext.updatedAt,
        stepsHistory: handoffContext.stepsHistory,
      });
    } catch (persistError) {
      this.getLogger().error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_FAILED, {
        operationId: handoffContext.operationId,
        serviceId: handoffContext.replicaId,
        error: persistError.message,
      });
      return;
    }

    this.getLogger().error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_FAILED, {
      operationId: handoffContext.operationId,
      serviceId: handoffContext.replicaId,
      sourceNodeId: handoffContext.sourceNodeId,
      targetNodeId: handoffContext.targetNodeId,
      error: error?.message || null,
    });
  }

  async removeLocalSourceReplicaForMoveReplica(serviceData) {
    const serviceId = serviceData?.[COLUMN.SERVICE_ID];
    const serviceType = serviceData?.[COLUMN.SERVICE_TYPE];
    const targetNodeId = serviceData?.[COLUMN.NODE_ID];

    if (!serviceId || !targetNodeId) {
      return;
    }
    if (serviceType !== SERVICE_TYPE.MESSAGE_GROUP) {
      return;
    }
    if (targetNodeId === this.getSeedNodeId()) {
      return;
    }

    const messageGroupServices = this.getMessageGroupServices();
    const localService = messageGroupServices?.get(serviceId);
    if (!localService) {
      return;
    }

    const existingService = this.getSystemTableCache()?.get(TABLES.SERVICES, serviceId);
    const localAddress = localService.unifiedAddress ||
      existingService?.[COLUMN.ADDRESS] ||
      `${this.getSeedNodeId()}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${serviceId}`;

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVAL_START, {
      serviceId,
      sourceNodeId: this.getSeedNodeId(),
      targetNodeId,
      localAddress,
    });

    try {
      if (typeof localService.shutdown === TYPEOF.FUNCTION) {
        await localService.shutdown();
      }
      messageGroupServices.delete(serviceId);

      const messageRouter = this.getMessageRouter();
      if (messageRouter && typeof messageRouter.unregister === TYPEOF.FUNCTION) {
        messageRouter.unregister(localAddress);
      }

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVED, {
        serviceId,
        sourceNodeId: this.getSeedNodeId(),
        targetNodeId,
        localAddress,
      });
    } catch (error) {
      this.getLogger().error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVAL_FAILED, {
        serviceId,
        sourceNodeId: this.getSeedNodeId(),
        targetNodeId,
        error: error.message,
      });
      throw error;
    }
  }

  async restoreRegisteredServiceRowAfterFailedHandoff(
    previousServiceRow,
    requestedServiceData,
    error,
  ) {
    if (!previousServiceRow ||
        typeof previousServiceRow !== TYPEOF.OBJECT) {
      return;
    }

    try {
      const rollbackResult = await this.executeBootstrapControlPlaneMutation({
        operation: 'upsert',
        tableName: TABLES.SERVICES,
        row: this.buildRegisteredServiceMutationRow(previousServiceRow),
      }, {
        skipCacheWait: true,
      });
      if (rollbackResult?.success === false) {
        throw this.buildBootstrapControlPlaneQueryError(
          rollbackResult,
          BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED,
        );
      }
      await this.waitForRegisteredServiceCacheVisibility(previousServiceRow);
      this.getLogger().warn(
        LOCAL_STR_D6B6P,
        {
          serviceId: requestedServiceData?.[COLUMN.SERVICE_ID] || null,
          targetNodeId: requestedServiceData?.[COLUMN.NODE_ID] || null,
          restoredNodeId: previousServiceRow?.[COLUMN.NODE_ID] || null,
          error: error?.message || String(error),
        },
      );
    } catch (rollbackError) {
      this.getLogger().error(
        LOCAL_STR_Y2LF5,
        {
          serviceId: requestedServiceData?.[COLUMN.SERVICE_ID] || null,
          targetNodeId: requestedServiceData?.[COLUMN.NODE_ID] || null,
          restoredNodeId: previousServiceRow?.[COLUMN.NODE_ID] || null,
          error: rollbackError?.message || String(rollbackError),
          originalError: error?.message || String(error),
        },
      );
    }
  }
}

export {MoveReplicaHandoffOwner};
