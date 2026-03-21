import {
  COLUMN,
  HTTP_STATUS,
  TYPEOF,
} from '../../constants/index.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
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
        this.getLogger().error(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_MISSING);
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return {success: false, error: BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE};
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
          await this.delegates.executeBootstrapControlPlaneMutation({
            operation: 'upsert',
            tableName: TABLES.SERVICES,
            row: registeredServiceRow,
          }, {
            skipCacheWait: true,
          });
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

      const expectedRegisteredService =
        this.delegates.buildExpectedRegisteredServiceData(
          registeredServiceRow,
        );
      await this.delegates.waitForRegisteredServiceCacheVisibility(
        expectedRegisteredService,
      );

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
        const isCacheVisibilityTimeout =
          error.errorCode ===
            BOOTSTRAP_PIPELINE_ERROR_CODE
              .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT;
        const typedErrorLogMessage = isCacheVisibilityTimeout ?
          BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT :
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED;
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
