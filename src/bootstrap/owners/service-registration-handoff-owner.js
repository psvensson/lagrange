import {
  COLUMN,
  HTTP_STATUS,
  NUM,
  TYPEOF,
} from '../../constants/index.js';
import {
  OWNER_OUTCOME_FRESHNESS,
  OWNER_OUTCOME_STATE,
  buildOwnerOutcomeEnvelope,
} from '../../control-plane/owner-outcome-contract.js';
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

const LOCAL_STR_UPSERT = 'upsert';
const LOCAL_STR_1ANOQ = 'retryable register-service metadata write failure';
const LOCAL_STR_SYNCING = 'syncing';
const LOCAL_STR_STOPPING = 'stopping';
const LOCAL_STR_1TLI7 = 'Preserving MOVE_REPLICA handoff reservation after retryable register-service failure';

const REGISTER_SERVICE_SQL_ENGINE_UNAVAILABLE_RETRY_AFTER_MS =
  BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_RETRY_AFTER_MS;
const SERVICE_REGISTRATION_HANDOFF_SCHEMA_VERSION = 1;
const SERVICE_REGISTRATION_HANDOFF_FIELD = Object.freeze({
  CONTRACT: 'serviceRegistrationHandoffContract',
});
const SERVICE_REGISTRATION_HANDOFF_OWNER = Object.freeze({
  PRODUCER: 'bootstrap_service_registration_owner',
  PRODUCER_BOUNDARY: 'service_registration_publication',
  CONSUMER: 'move_replica_handoff_owner',
  CONSUMER_BOUNDARY: 'target_service_registration',
});
const SERVICE_REGISTRATION_HANDOFF_OUTCOME = Object.freeze({
  COMMITTED: 'service_registration_committed',
  DEFERRED: 'service_registration_deferred',
  FAILED: 'service_registration_failed',
});
const SERVICE_REGISTRATION_HANDOFF_REASON = Object.freeze({
  CACHE_VISIBILITY_TIMEOUT:
    BOOTSTRAP_PIPELINE_ERROR_CODE
      .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT,
  SERVICE_REGISTERED: 'service_registered',
  SERVICE_REGISTRATION_FAILED: 'service_registration_failed',
  SQL_ENGINE_UNAVAILABLE: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
});
const SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION = Object.freeze({
  COMPLETE_MOVE_REPLICA_HANDOFF: 'complete_move_replica_handoff',
  FAIL_MOVE_REPLICA_HANDOFF: 'fail_move_replica_handoff',
  PROCEED: 'proceed',
  RETRY_SERVICE_REGISTRATION: 'retry_service_registration',
});
const SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT = Object.freeze({
  ACKNOWLEDGED: 'acknowledged',
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
});
const SERVICE_REGISTRATION_HANDOFF_OBSERVATION = Object.freeze({
  UNOBSERVED: 'unobserved',
});

const SERVICE_REGISTRATION_HANDOFF_OUTCOME_RULES = Object.freeze([
  Object.freeze({
    matches: (evidence) => evidence.completed === true,
    ownerState: OWNER_OUTCOME_STATE.READY,
    outcome: SERVICE_REGISTRATION_HANDOFF_OUTCOME.COMMITTED,
    reasonCode: SERVICE_REGISTRATION_HANDOFF_REASON.SERVICE_REGISTERED,
    nextAction: SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION.PROCEED,
    freshness: OWNER_OUTCOME_FRESHNESS.FRESH,
    terminal: false,
  }),
  Object.freeze({
    matches: (evidence) => evidence.retryable === true,
    ownerState: OWNER_OUTCOME_STATE.DEFERRED,
    outcome: SERVICE_REGISTRATION_HANDOFF_OUTCOME.DEFERRED,
    reasonCode: SERVICE_REGISTRATION_HANDOFF_REASON.SERVICE_REGISTRATION_FAILED,
    nextAction:
      SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION.RETRY_SERVICE_REGISTRATION,
    freshness: OWNER_OUTCOME_FRESHNESS.STALE,
    terminal: false,
  }),
  Object.freeze({
    matches: () => true,
    ownerState: OWNER_OUTCOME_STATE.FAILED,
    outcome: SERVICE_REGISTRATION_HANDOFF_OUTCOME.FAILED,
    reasonCode: SERVICE_REGISTRATION_HANDOFF_REASON.SERVICE_REGISTRATION_FAILED,
    nextAction:
      SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION.FAIL_MOVE_REPLICA_HANDOFF,
    freshness: OWNER_OUTCOME_FRESHNESS.UNKNOWN,
    terminal: true,
  }),
]);

function isServiceRegistrationHandoffRecord(value) {
  return typeof value === TYPEOF.OBJECT && value !== null && !Array.isArray(value);
}

function normalizeServiceRegistrationHandoffText(value, fallback) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    fallback;
}

function normalizeServiceRegistrationRetryAfterMs(value) {
  return Number.isFinite(value) ? Math.max(NUM.ZERO, Math.floor(value)) :
    NUM.ZERO;
}

function selectServiceRegistrationHandoffOutcome(evidence) {
  return SERVICE_REGISTRATION_HANDOFF_OUTCOME_RULES.find((rule) =>
    rule.matches(evidence),
  );
}

function resolveServiceRegistrationHandoffRevision({
  serviceData,
  handoffContext,
  assignmentContext,
}) {
  return normalizeServiceRegistrationHandoffText(
    handoffContext?.operationId,
    normalizeServiceRegistrationHandoffText(
      assignmentContext?.assignmentId,
      normalizeServiceRegistrationHandoffText(
        serviceData?.[COLUMN.SERVICE_ID],
        SERVICE_REGISTRATION_HANDOFF_OBSERVATION.UNOBSERVED,
      ),
    ),
  );
}

function resolveServiceRegistrationHandoffReasonCode({
  selectedOutcome,
  reasonCode,
}) {
  return normalizeServiceRegistrationHandoffText(
    reasonCode,
    selectedOutcome.reasonCode,
  );
}

function buildServiceRegistrationHandoffAcknowledgementRule({
  handoffRequired,
  targetServiceRowWritten,
  serviceRegistrationVisibilitySatisfied,
  sourceRemovalCompleted,
  handoffCompleted,
}) {
  const cacheVisibilityAcknowledgement = handoffRequired === true ?
    (serviceRegistrationVisibilitySatisfied === true ?
      SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.ACKNOWLEDGED :
      SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.PENDING) :
    SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.NOT_REQUIRED;
  const sourceRemovalAcknowledgement = handoffRequired === true ?
    (sourceRemovalCompleted === true ?
      SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.ACKNOWLEDGED :
      SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.PENDING) :
    SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.NOT_REQUIRED;
  const handoffCompletionAcknowledgement = handoffRequired === true ?
    (handoffCompleted === true ?
      SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.ACKNOWLEDGED :
      SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.PENDING) :
    SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.NOT_REQUIRED;
  const serviceRowAcknowledged = targetServiceRowWritten === true;
  return Object.freeze({
    serviceRowAcknowledged,
    cacheVisibilityAcknowledgement,
    sourceRemovalAcknowledgement,
    handoffCompletionAcknowledgement,
    acknowledgementSatisfied:
      serviceRowAcknowledged === true &&
      cacheVisibilityAcknowledgement !==
        SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.PENDING &&
      sourceRemovalAcknowledgement !==
        SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.PENDING &&
      handoffCompletionAcknowledgement !==
        SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.PENDING,
  });
}

function buildServiceRegistrationDiagnosticVocabulary() {
  return Object.freeze({
    ownerState: Object.freeze(Object.values(OWNER_OUTCOME_STATE)),
    outcome: Object.freeze(Object.values(SERVICE_REGISTRATION_HANDOFF_OUTCOME)),
    reasonCode: Object.freeze(Object.values(SERVICE_REGISTRATION_HANDOFF_REASON)),
    nextAction: Object.freeze(
      Object.values(SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION),
    ),
    acknowledgement: Object.freeze(
      Object.values(SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT),
    ),
  });
}

function buildServiceRegistrationHandoffContract(options = {}) {
  const serviceData = isServiceRegistrationHandoffRecord(options.serviceData) ?
    options.serviceData :
    {};
  const assignmentContext =
    isServiceRegistrationHandoffRecord(options.assignmentContext) ?
      options.assignmentContext :
      {};
  const handoffContext =
    isServiceRegistrationHandoffRecord(options.handoffContext) ?
      options.handoffContext :
      {};
  const handoffRequired = Object.keys(handoffContext).length > NUM.ZERO;
  const retryAfterMs = normalizeServiceRegistrationRetryAfterMs(
    options.retryAfterMs,
  );
  const evidence = Object.freeze({
    completed: options.completed === true,
    retryable:
      options.retryable === true ||
      retryAfterMs > NUM.ZERO,
  });
  const selectedOutcome = selectServiceRegistrationHandoffOutcome(evidence);
  const reasonCode = resolveServiceRegistrationHandoffReasonCode({
    selectedOutcome,
    reasonCode: options.reasonCode,
  });
  const producerOwnerOutcome = buildOwnerOutcomeEnvelope({
    owner: SERVICE_REGISTRATION_HANDOFF_OWNER.PRODUCER,
    boundary: SERVICE_REGISTRATION_HANDOFF_OWNER.PRODUCER_BOUNDARY,
    state: selectedOutcome.ownerState,
    outcome: selectedOutcome.outcome,
    reasonCodes: [reasonCode],
    nextAction: selectedOutcome.nextAction,
    freshness: selectedOutcome.freshness,
    revision: resolveServiceRegistrationHandoffRevision({
      serviceData,
      handoffContext,
      assignmentContext,
    }),
    retryAfterMs,
    terminal: selectedOutcome.terminal,
    evidence: {
      serviceId: normalizeServiceRegistrationHandoffText(
        serviceData[COLUMN.SERVICE_ID],
        SERVICE_REGISTRATION_HANDOFF_OBSERVATION.UNOBSERVED,
      ),
      assignmentId: normalizeServiceRegistrationHandoffText(
        assignmentContext.assignmentId,
        normalizeServiceRegistrationHandoffText(
          serviceData[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID],
          SERVICE_REGISTRATION_HANDOFF_OBSERVATION.UNOBSERVED,
        ),
      ),
      operationId: normalizeServiceRegistrationHandoffText(
        handoffContext.operationId,
        SERVICE_REGISTRATION_HANDOFF_OBSERVATION.UNOBSERVED,
      ),
    },
  });
  const acknowledgementRule =
    buildServiceRegistrationHandoffAcknowledgementRule({
      handoffRequired,
      targetServiceRowWritten: options.targetServiceRowWritten === true,
      serviceRegistrationVisibilitySatisfied:
        options.serviceRegistrationVisibilitySatisfied === true,
      sourceRemovalCompleted: options.sourceRemovalCompleted === true,
      handoffCompleted: options.handoffCompleted === true,
    });
  const visibilityRequired = handoffRequired === true;
  const visibilitySatisfied = visibilityRequired === true ?
    options.serviceRegistrationVisibilitySatisfied === true :
    true;
  return Object.freeze({
    schemaVersion: SERVICE_REGISTRATION_HANDOFF_SCHEMA_VERSION,
    producerOwnerOutcome,
    consumerPrecondition: Object.freeze({
      consumerOwner: SERVICE_REGISTRATION_HANDOFF_OWNER.CONSUMER,
      consumerBoundary: SERVICE_REGISTRATION_HANDOFF_OWNER.CONSUMER_BOUNDARY,
      handoffRequired,
      serviceId: producerOwnerOutcome.evidence.serviceId,
      assignmentId: producerOwnerOutcome.evidence.assignmentId,
      operationId: producerOwnerOutcome.evidence.operationId,
    }),
    freshnessRevisionRequirement: Object.freeze({
      requiredFreshness: OWNER_OUTCOME_FRESHNESS.FRESH,
      observedFreshness: producerOwnerOutcome.freshness,
      revision: producerOwnerOutcome.revision,
      visibilityRequired,
      visibilitySatisfied,
      requirementSatisfied:
        producerOwnerOutcome.freshness === OWNER_OUTCOME_FRESHNESS.FRESH &&
        visibilitySatisfied === true,
    }),
    acknowledgementRule,
    retryDeferBehavior: Object.freeze({
      retryAfterMs,
      deferConsumer:
        producerOwnerOutcome.state !== OWNER_OUTCOME_STATE.READY ||
        acknowledgementRule.acknowledgementSatisfied !== true,
      retryable: evidence.retryable,
      nextAction: producerOwnerOutcome.nextAction,
    }),
    terminalCondition: Object.freeze({
      terminal: producerOwnerOutcome.terminal,
      terminalState: producerOwnerOutcome.state,
      terminalReasonCodes: producerOwnerOutcome.reasonCodes,
    }),
    diagnosticVocabulary: buildServiceRegistrationDiagnosticVocabulary(),
  });
}

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
        operation: LOCAL_STR_UPSERT,
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
                LOCAL_STR_1ANOQ,
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

  buildRegisterServiceHandoffContract(options = {}) {
    return buildServiceRegistrationHandoffContract(options);
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
    let serviceRegistrationVisibilitySatisfied = false;
    let sourceRemovalCompleted = false;
    let handoffCompleted = false;
    try {
      if (!this.getSqlQueryEngine()) {
        this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_MISSING);
        const handoffContract = this.buildRegisterServiceHandoffContract({
          serviceData,
          retryable: true,
          reasonCode: SERVICE_REGISTRATION_HANDOFF_REASON.SQL_ENGINE_UNAVAILABLE,
          retryAfterMs: REGISTER_SERVICE_SQL_ENGINE_UNAVAILABLE_RETRY_AFTER_MS,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return {
          success: false,
          error: BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
          retryAfterMs: REGISTER_SERVICE_SQL_ENGINE_UNAVAILABLE_RETRY_AFTER_MS,
          [SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT]: handoffContract,
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
          LOCAL_STR_SYNCING,
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
        serviceRegistrationVisibilitySatisfied = true;
      }

      if (handoffContext) {
        await this.delegates.executeMoveReplicaHandoffPhase(
          handoffContext,
          BOOTSTRAP_API_HANDOFF_PHASE.REMOVE_SOURCE,
          LOCAL_STR_STOPPING,
          BOOTSTRAP_API_HANDOFF_STATUS.REMOVING,
          async () => {
            await this.delegates.removeLocalSourceReplicaForMoveReplica(
              serviceData,
            );
            sourceRemovalCompleted = true;
          },
        );
        await this.delegates.completeMoveReplicaHandoff(handoffContext);
        handoffCompleted = true;
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
        [SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT]:
          this.buildRegisterServiceHandoffContract({
            serviceData,
            assignmentContext,
            handoffContext,
            completed: true,
            targetServiceRowWritten,
            serviceRegistrationVisibilitySatisfied,
            sourceRemovalCompleted,
            handoffCompleted,
          }),
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
            LOCAL_STR_1TLI7,
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
          [SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT]:
            this.buildRegisterServiceHandoffContract({
              serviceData,
              assignmentContext,
              handoffContext,
              retryable:
                this.isRetryableRegisteredServicePublicationError(error) ||
                Number.isFinite(error.retryAfterMs),
              reasonCode: error.errorCode,
              retryAfterMs: error.retryAfterMs,
              targetServiceRowWritten,
              serviceRegistrationVisibilitySatisfied,
              sourceRemovalCompleted,
              handoffCompleted,
            }),
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

export {
  SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT,
  SERVICE_REGISTRATION_HANDOFF_FIELD,
  SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION,
  SERVICE_REGISTRATION_HANDOFF_OUTCOME,
  SERVICE_REGISTRATION_HANDOFF_OWNER,
  SERVICE_REGISTRATION_HANDOFF_REASON,
  buildServiceRegistrationHandoffContract,
  ServiceRegistrationHandoffOwner,
};
