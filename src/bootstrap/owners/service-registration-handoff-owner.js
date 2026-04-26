import {
  COLUMN,
  HTTP_STATUS,
  TYPEOF,
} from '../../constants/index.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
} from '../bootstrap-api-constants.js';
import {
  BOOTSTRAP_API_HANDOFF_PHASE,
  BOOTSTRAP_API_HANDOFF_STATUS,
} from '../bootstrap-api-constants.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {TABLES} from '../../constants/index.js';
import {runRetryableControlPlaneWrite} from
  '../shared/retryable-control-plane-write.js';

const REGISTER_SERVICE_SQL_ENGINE_UNAVAILABLE_RETRY_AFTER_MS =
  BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_RETRY_AFTER_MS;

class ServiceRegistrationHandoffOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getSqlQueryEngine() {
    return this.delegates.getSqlQueryEngine?.() || null;
  }

  getNow() {
    return this.delegates.getNow?.() || Date.now();
  }

  getRegisterServiceWriteRetryTimeoutMs() {
    return this.delegates.getRegisterServiceWriteRetryTimeoutMs?.() ||
      BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_WRITE_RETRY_TIMEOUT_MS;
  }

  async sleep(delayMs) {
    const sleepImpl = this.delegates.getSleep?.();
    if (typeof sleepImpl === TYPEOF.FUNCTION) {
      await sleepImpl(delayMs);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async writeRegisteredServiceRowWithRetry(serviceData, registeredServiceRow) {
    return runRetryableControlPlaneWrite(
      () => this.delegates.executeBootstrapControlPlaneMutation({
        operation: 'upsert',
        tableName: TABLES.SERVICES,
        row: registeredServiceRow,
      }, {
        skipCacheWait: true,
      }),
      {
        timeoutMs: this.getRegisterServiceWriteRetryTimeoutMs(),
        now: () => this.getNow(),
        onRetry: ({
          attempt,
          delayMs,
          remainingMs,
          retryAfterMs,
          resultOrError,
        }) => {
          this.getLogger().warn(
            BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_WRITE_RETRY,
            {
              serviceId: serviceData[COLUMN.SERVICE_ID],
              serviceType: serviceData[COLUMN.SERVICE_TYPE],
              nodeId: serviceData[COLUMN.NODE_ID],
              groupId: serviceData[COLUMN.GROUP_ID] || null,
              tableName: TABLES.SERVICES,
              attempt,
              retryAfterMs,
              delayMs,
              remainingMs,
              error:
                resultOrError?.error ||
                resultOrError?.message ||
                'retryable register-service metadata write failure',
            },
          );
        },
        sleep: (delayMs) => this.sleep(delayMs),
      },
    );
  }

  isRetryableRegisteredServicePublicationError(error) {
    return Number.isFinite(error?.statusCode) &&
      Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE &&
      error?.details?.tableName === TABLES.SERVICES;
  }

  resolveTypedRegisterServiceErrorLogMessage(error) {
    if (error?.errorCode ===
        BOOTSTRAP_PIPELINE_ERROR_CODE
          .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT) {
      return BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT;
    }
    if (this.isRetryableRegisteredServicePublicationError(error)) {
      return BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_DEFERRED;
    }
    return BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED;
  }

  async handleRegisterServiceRequest(request, reply) {
    const serviceData = request.body || {};
    let assignmentContext = null;

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RECEIVED_REGISTER_SERVICE, {
      serviceId: serviceData[COLUMN.SERVICE_ID],
      serviceType: serviceData[COLUMN.SERVICE_TYPE],
      nodeId: serviceData[COLUMN.NODE_ID],
      groupId: serviceData[COLUMN.GROUP_ID],
    });

    if (!serviceData[COLUMN.SERVICE_ID]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_ID_REQUIRED};
    }

    if (!serviceData[COLUMN.SERVICE_TYPE]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_TYPE_REQUIRED};
    }

    if (!serviceData[COLUMN.NODE_ID]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_NODE_ID_REQUIRED};
    }

    let handoffContext = null;
    let previousRegisteredServiceRow = null;
    let targetServiceRowWritten = false;
    let sourceRemovalCompleted = false;
    try {
      if (!this.getSqlQueryEngine()) {
        this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_MISSING);
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return {
          success: false,
          error: BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
          retryAfterMs: REGISTER_SERVICE_SQL_ENGINE_UNAVAILABLE_RETRY_AFTER_MS,
        };
      }

      assignmentContext =
        await this.delegates.validateMoveReplicaAssignmentToken(serviceData);
      this.delegates.assertSingleOwnerReplicaRegistration(
        serviceData,
        assignmentContext,
      );
      handoffContext = await this.delegates.startMoveReplicaHandoff(
        serviceData,
        assignmentContext,
      );
      if (handoffContext) {
        previousRegisteredServiceRow =
          await this.delegates.readCurrentRegisteredServiceRow(
            serviceData[COLUMN.SERVICE_ID],
          );
      }

      if (handoffContext) {
        await this.delegates.executeMoveReplicaHandoffPhase(
          handoffContext,
          BOOTSTRAP_API_HANDOFF_PHASE.VERIFY_TARGET,
          'syncing',
          BOOTSTRAP_API_HANDOFF_STATUS.VERIFYING,
          () => this.delegates.verifyMoveReplicaHandoffTarget(
            handoffContext,
            serviceData,
          ),
        );
      }

      const registeredServiceRow =
        this.delegates.buildRegisteredServiceMutationRow(serviceData);
      try {
        const mutationResult =
          await this.writeRegisteredServiceRowWithRetry(
            serviceData,
            registeredServiceRow,
          );
        if (mutationResult?.success === false) {
          throw this.delegates.buildBootstrapControlPlaneQueryError(
            mutationResult,
            BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED,
          );
        }
      } catch (mutationError) {
        throw this.delegates.buildBootstrapControlPlaneMutationError(
          mutationError,
          TABLES.SERVICES,
          BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED,
        );
      }
      targetServiceRowWritten = true;

      if (handoffContext) {
        const expectedRegisteredService =
          this.delegates.buildExpectedRegisteredServiceData(
            registeredServiceRow,
          );
        await this.delegates.waitForRegisteredServiceCacheVisibility(
          expectedRegisteredService,
        );
      }

      if (handoffContext) {
        await this.delegates.executeMoveReplicaHandoffPhase(
          handoffContext,
          BOOTSTRAP_API_HANDOFF_PHASE.REMOVE_SOURCE,
          'stopping',
          BOOTSTRAP_API_HANDOFF_STATUS.REMOVING,
          async () => {
            await this.delegates.removeLocalSourceReplicaForMoveReplica(
              serviceData,
            );
            sourceRemovalCompleted = true;
          },
        );
        await this.delegates.completeMoveReplicaHandoff(handoffContext);
      }

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTERED, {
        serviceId: serviceData[COLUMN.SERVICE_ID],
        serviceType: serviceData[COLUMN.SERVICE_TYPE],
        nodeId: serviceData[COLUMN.NODE_ID],
        groupId: serviceData[COLUMN.GROUP_ID],
        assignmentId: assignmentContext?.assignmentId || null,
        operationId: handoffContext?.operationId || null,
      });

      return {
        success: true,
        serviceId: serviceData[COLUMN.SERVICE_ID],
        assignmentId: assignmentContext?.assignmentId || null,
        operationId: handoffContext?.operationId || null,
      };
    } catch (error) {
      if (handoffContext &&
          targetServiceRowWritten &&
          !sourceRemovalCompleted) {
        await this.delegates.restoreRegisteredServiceRowAfterFailedHandoff(
          previousRegisteredServiceRow,
          serviceData,
          error,
        );
      }
      if (handoffContext) {
        const shouldPreserveRetryableHandoff =
          this.delegates.shouldPreserveMoveReplicaHandoffReservation(
            handoffContext,
            error,
            sourceRemovalCompleted,
          );
        if (shouldPreserveRetryableHandoff) {
          this.getLogger().warn(
            'Preserving MOVE_REPLICA handoff reservation after retryable register-service failure',
            {
              operationId: handoffContext.operationId,
              serviceId: handoffContext.replicaId,
              sourceNodeId: handoffContext.sourceNodeId,
              targetNodeId: handoffContext.targetNodeId,
              code: error?.errorCode || null,
              error: error?.message || null,
            },
          );
        } else {
          await this.delegates.failMoveReplicaHandoff(handoffContext, error);
        }
      }
      if (Number.isFinite(error?.statusCode) &&
          typeof error?.errorCode === TYPEOF.STRING) {
        const typedErrorLogMessage =
          this.resolveTypedRegisterServiceErrorLogMessage(error);
        this.getLogger().warn(typedErrorLogMessage, {
          serviceId: serviceData[COLUMN.SERVICE_ID],
          assignmentId: serviceData[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID] || null,
          code: error.errorCode,
          error: error.message,
          details: error.details || null,
        });
        reply.code(Math.floor(error.statusCode));
        return {
          success: false,
          error: error.message,
          code: error.errorCode,
          ...(Number.isFinite(error.retryAfterMs) ?
            {retryAfterMs: Math.floor(error.retryAfterMs)} :
            {}),
          ...(error.details && typeof error.details === TYPEOF.OBJECT ?
            {details: error.details} :
            {}),
        };
      }
      this.getLogger().error(BOOTSTRAP_API_LOG_MSG.REGISTER_SERVICE_FAILED, {
        serviceId: serviceData[COLUMN.SERVICE_ID],
        error: error.message,
        stack: error.stack,
      });
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      throw error;
    }
  }
}

export {ServiceRegistrationHandoffOwner};
