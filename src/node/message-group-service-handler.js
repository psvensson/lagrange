/**
 * MessageGroupServiceHandler - Handles CREATE_REPLICA and REMOVE_REPLICA
 * operations for message-group entities.
 */
import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {MessageGroupServiceRowOwner} from
  '../message-group/message-group-service-row-owner.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {REBALANCER_SKIP_REASON} from '../rebalancer/rebalancer-constants.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../rebalancer/executor-outcome-constants.js';
import {
  MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS,
  MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG,
  MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM,
} from './message-group-service-handler-constants.js';
import {
  activateCreatedMessageGroupReplica,
  buildMessageGroupCreateFailureOptions,
} from './message-group-create-activation.js';

import {readMessageGroupLearnerAtRecipient} from
  './message-group-membership-recipient.js';

function isFunction(value) {
  return typeof value === 'function';
}

function buildReplicaOperationResponse(status, fields = {}) {
  return {
    status,
    ...fields,
  };
}

class MessageGroupServiceHandler extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Function} options.createMessageGroupReplica
   * @param {Function} options.startMessageGroupReplica
   * @param {Function} options.stopMessageGroupReplica
   * @param {Function} [options.resolveLocalMessageGroupReplica]
   * @param {MessageGroupServiceRowOwner}
   *   [options.messageGroupServiceRowOwner]
   */
  constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.createMessageGroupReplica =
      options.createMessageGroupReplica || null;
    this.startMessageGroupReplica =
      options.startMessageGroupReplica || null;
    this.stopMessageGroupReplica =
      options.stopMessageGroupReplica || null;
    this.resolveLocalMessageGroupReplica =
      options.resolveLocalMessageGroupReplica || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache: this.systemTableCache,
      }).controlPlaneSystemTableGateway;
    this.messageGroupServiceRowOwner =
      options.messageGroupServiceRowOwner ||
      new MessageGroupServiceRowOwner({
        systemTableWriter: this.controlPlaneSystemTableGateway,
      });
    this.messageRouter = options.messageRouter || null;
    this.rpcClient = null;
    this.registeredRouterHandler = null;

    // Executor outcome emitter — replaces direct replica_operations writes.
    this.executorOutcomeEmitter = options.executorOutcomeEmitter || null;

    this.inProgressOperations = new Map();
    this.localReplicas = new Map();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM,
      ) : console;
  }

  initialize() {
    this.logger.debug(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.INITIALIZING,
      {nodeId: this.nodeId},
    );

    if (!isFunction(this.createMessageGroupReplica)) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CREATE_REQUIRED,
      );
    }
    if (!isFunction(this.startMessageGroupReplica)) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.START_REQUIRED,
      );
    }
    if (!isFunction(this.stopMessageGroupReplica)) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.STOP_REQUIRED,
      );
    }
    if (!this.cdcIntegrationService) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CDC_REQUIRED,
      );
    }
    if (!this.systemTableCache) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CACHE_REQUIRED,
      );
    }
  }

  async handleMessage(envelope, delivery, invocation) {
    const {payload, correlationId} = envelope;
    const type = payload?.[ReplicaOperationField.TYPE];

    this.logger.debug(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.MESSAGE_RECEIVED,
      {type, correlationId, operationId: payload?.operationId},
    );

    let response;
    if (type === ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP) {
      response = await readMessageGroupLearnerAtRecipient(this, payload, delivery, invocation);
    } else if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
      response = await this.handleCreateReplica(payload);
    } else if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
      response = await this.handleRemoveReplica(payload);
    } else {
      response = buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error:
          MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE(
            type,
          ),
        },
      );
    }

    return {...response, correlationId};
  }

  /**
   * CREATE_REPLICA for a message group is refused (owner decision
   * 2026-10-04, raft-rs full cutover): no message-group replica is created
   * on a dispatcher's word until the fresh-identity ADD path for message
   * groups exists. The create this answered opened a GENESIS self-founder
   * from the services rows that elected at once; under a reissued replica
   * name it reused a raft id whose history the group holds elsewhere. The
   * planner mints no such operation (UnifiedRebalancer
   * .messageGroupMembershipChangeRefusal); this answer fails a stray or
   * pre-upgrade dispatch closed. It opens nothing - no create or start, no
   * services row, no tracked operation - and is answered ERROR, so the
   * coordinator fails the operation once instead of retrying it. The
   * executor half (createReplicaAsync) is what the fresh-identity ADD reuses.
   * @param {Object} request - The CREATE_REPLICA payload.
   * @return {Object} The typed refusal.
   */
  handleCreateReplica(request) {
    const reason =
      REBALANCER_SKIP_REASON.MESSAGE_GROUP_MEMBERSHIP_CHANGE_UNSUPPORTED;
    this.logger.warn(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_REFUSED, {
      operationId: request?.[ReplicaOperationField.OPERATION_ID],
      groupId: this.resolveGroupId(request),
      replicaId: request?.[ReplicaOperationField.REPLICA_ID],
      nodeId: this.nodeId,
      reason,
    });
    return buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.ERROR,
      {error: reason, reason, nodeId: this.nodeId},
    );
  }

  async createReplicaAsync({
    operationId,
    groupId,
    replicaId,
    replicaOptions,
  }) {
    try {
      await this.createMessageGroupReplica(replicaOptions);
      await this.startMessageGroupReplica(replicaOptions);
      // The replica generation this operation created and started: its exact
      // transport handler and lifecycle owner are bound from here on.
      const service = this.resolveActiveReplicaService(replicaId);
      const registrationEvidence =
        await this.messageGroupServiceRowOwner.registerReplica({
          groupId,
          replicaId,
          nodeId: this.nodeId,
          service,
          status: SERVICE_STATUS.STOPPED,
        });
      await this.activateCreatedReplica({
        groupId,
        replicaId,
        service,
        registrationEvidence,
      });

      this.localReplicas.set(replicaId, {
        replicaId,
        entityId: groupId,
        status: ReplicaStatus.ACTIVE,
      });

      // Emit active outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE,
        operationId,
        WORKFLOW_STEP.ACTIVE,
        {replicaId},
      );

      this.logger.info(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_COMPLETED,
        {operationId, groupId, replicaId, nodeId: this.nodeId},
      );
    } catch (error) {
      this.localReplicas.set(replicaId, {
        replicaId,
        entityId: groupId,
        status: ReplicaStatus.FAILED,
      });

      const failedOutcomeOptions =
        buildMessageGroupCreateFailureOptions(error, replicaId);

      // Emit failed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED,
        operationId,
        WORKFLOW_STEP.FAILED,
        failedOutcomeOptions,
      );

      this.logger.error(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_FAILED,
        {
          operationId,
          groupId,
          replicaId,
          error: error.message,
          nodeId: this.nodeId,
        },
      );
    } finally {
      this.inProgressOperations.delete(operationId);
    }
  }

  /**
   * STOPPED -> ACTIVE for an executor-created replica (owner decision N2).
   * @param {Object} activation - {groupId, replicaId, service,
   *   registrationEvidence}.
   * @return {Promise<Object>} The ACTIVE row.
   */
  activateCreatedReplica(activation) {
    return activateCreatedMessageGroupReplica(this, activation);
  }

  hasInProgressReplicaRemoval(replicaId) {
    for (const operation of this.inProgressOperations.values()) {
      if (
        operation?.type === ReplicaOperationMessageType.REMOVE_REPLICA &&
        operation?.replicaId === replicaId
      ) {
        return true;
      }
    }
    return false;
  }

  trackReplicaRemovalOperation(operationId, groupId, replicaId) {
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.REMOVE_REPLICA,
      replicaId,
      entityId: groupId,
      startedAt: Date.now(),
    });
  }

  startRemoveReplicaAsync({operationId, groupId, replicaId, reason}) {
    setImmediate(() => {
      this.removeReplicaAsync({
        operationId,
        groupId,
        replicaId,
        reason,
      }).catch((error) => {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED,
          {
            operationId,
            replicaId,
            error: error.message,
            stack: error.stack,
          },
        );
      });
    });
  }

  async handleRemoveReplica(request) {
    const operationId =
      request?.[ReplicaOperationField.OPERATION_ID];
    const groupId = this.resolveGroupId(request);
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
    const reason = request?.[ReplicaOperationField.REASON];

    this.logger.info(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_REQUEST,
      {operationId, groupId, replicaId, reason, nodeId: this.nodeId},
    );

    if (!operationId || !groupId || !replicaId) {
      this.logger.warn(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_MISSING_FIELDS,
        {operationId, groupId, replicaId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error:
          MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
          nodeId: this.nodeId,
        },
      );
    }

    const replica = this.getKnownLocalReplica(replicaId, groupId);
    if (!replica) {
      this.logger.warn(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_NOT_FOUND,
        {replicaId, groupId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.NOT_FOUND,
        {
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }

    if (replica.status === ReplicaStatus.REMOVING) {
      if (!this.hasInProgressReplicaRemoval(replicaId)) {
        this.trackReplicaRemovalOperation(operationId, groupId, replicaId);
        this.startRemoveReplicaAsync({
          operationId,
          groupId,
          replicaId,
          reason,
        });
      }
      this.logger.info(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS,
        {replicaId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.IN_PROGRESS,
        {
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }

    if (replica.status === ReplicaStatus.REMOVED) {
      this.logger.info(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED,
        {replicaId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }

    if (this.inProgressOperations.has(operationId)) {
      this.logger.info(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS,
        {operationId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.IN_PROGRESS,
        {
          operationId,
          nodeId: this.nodeId,
        },
      );
    }

    this.trackReplicaRemovalOperation(operationId, groupId, replicaId);
    this.localReplicas.set(replicaId, {
      ...replica,
      status: ReplicaStatus.REMOVING,
    });

    this.startRemoveReplicaAsync({
      operationId,
      groupId,
      replicaId,
      reason,
    });

    return buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.INITIATED,
      {
        operationId,
        replicaId,
        nodeId: this.nodeId,
      },
    );
  }

  async removeReplicaAsync({
    operationId,
    groupId,
    replicaId,
    reason,
  }) {
    try {
      const stoppedRow = await this.messageGroupServiceRowOwner
        .updateReplicaStatus({
          groupId,
          replicaId,
          nodeId: this.nodeId,
          service: this.resolveActiveReplicaService(replicaId),
          status: SERVICE_STATUS.STOPPED,
        });
      await this.stopMessageGroupReplica({
        groupId,
        replicaId,
        reason,
      });
      await this.messageGroupServiceRowOwner.removeReplica({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        stoppedRow,
      });

      this.localReplicas.set(replicaId, {
        replicaId,
        entityId: groupId,
        status: ReplicaStatus.REMOVED,
      });

      // Emit removed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_REMOVE_COMPLETED,
        operationId,
        WORKFLOW_STEP.REMOVED,
        {replicaId},
      );

      this.logger.info(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_COMPLETED,
        {operationId, groupId, replicaId, nodeId: this.nodeId},
      );
    } catch (error) {
      this.localReplicas.set(replicaId, {
        replicaId,
        entityId: groupId,
        status: ReplicaStatus.FAILED,
      });

      // Emit failed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_REMOVE_FAILED,
        operationId,
        WORKFLOW_STEP.FAILED,
        {replicaId, errorMessage: error.message},
      );

      this.logger.error(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_FAILED,
        {
          operationId,
          groupId,
          replicaId,
          error: error.message,
          nodeId: this.nodeId,
        },
      );
    } finally {
      this.inProgressOperations.delete(operationId);
    }
  }

  resolveGroupId(request) {
    return request?.[ReplicaOperationField.ENTITY_ID] ||
      request?.[ReplicaOperationField.PARTITION_ID] ||
      null;
  }

  resolveActiveReplicaService(replicaId) {
    if (!isFunction(this.resolveLocalMessageGroupReplica)) {
      return null;
    }

    return this.resolveLocalMessageGroupReplica(replicaId) || null;
  }

  getKnownLocalReplica(replicaId, groupId) {
    const existing = this.localReplicas.get(replicaId);
    if (existing) {
      return existing;
    }

    if (isFunction(this.resolveLocalMessageGroupReplica) &&
        this.resolveLocalMessageGroupReplica(replicaId)) {
      const replica = {
        replicaId,
        entityId: groupId,
        status: ReplicaStatus.ACTIVE,
      };
      this.localReplicas.set(replicaId, replica);
      return replica;
    }

    const service = this.systemTableCache?.get?.(
      SYSTEM_TABLE_NAME.SERVICES,
      replicaId,
    );
    if (service &&
        service.service_type === SERVICE_TYPE.MESSAGE_GROUP &&
        service.node_id === this.nodeId &&
        (!groupId || service.group_id === groupId)) {
      const replica = {
        replicaId,
        entityId: groupId || service.group_id,
        status: ReplicaStatus.ACTIVE,
      };
      this.localReplicas.set(replicaId, replica);
      return replica;
    }

    return null;
  }

  /**
     * Emit a typed executor outcome instead of writing to
     * replica_operations directly. The coordinator consumes these
     * outcomes through the owner-key reconcile queue.
     *
     * @param {string} outcomeType - EXECUTOR_OUTCOME_TYPE value.
     * @param {string} operationId - Replica operation ID.
     * @param {string} workflowStep - WORKFLOW_STEP the executor reached.
     * @param {Object} [options] - Optional replicaId, errorMessage.
     */
  emitExecutorOutcome(outcomeType, operationId, workflowStep, options = {}) {
    if (this.executorOutcomeEmitter) {
      this.executorOutcomeEmitter.emitOutcome(
        outcomeType,
        operationId,
        workflowStep,
        options,
      );
    }
  }

  registerWithRouter(messageRouter, options = {}) {
    if (!messageRouter) {
      this.logger.warn(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.NO_MESSAGE_ROUTER,
      );
      return;
    }
    // Retire only our own previous registration; an address may already
    // belong to a successor handler.
    this.unregisterFromRouter(this.messageRouter);
    this.messageRouter = messageRouter;

    const handlerAddress =
      `${this.nodeId}/` +
      `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
      `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`;

    if (options.rpcClient) {
      this.rpcClient = options.rpcClient;
    }

    const handler = this;
    async function routerHandler(envelope, delivery) {
      // Bind the callback actually invoked, not a later registration observed
      // after MessageRouter has queued this delivery in a microtask.
      const invocation = Object.freeze({router: messageRouter, callback: routerHandler});
      const response = await handler.handleMessage(envelope, delivery, invocation);
      if (handler.rpcClient && response.correlationId) {
        handler.rpcClient.handleResponse(
          response.correlationId,
          response,
        );
      }
      return {acknowledged: true, ...response};
    }

    this.registeredRouterHandler = routerHandler;
    messageRouter.register(handlerAddress, routerHandler);

    this.logger.info(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REGISTERED_ROUTER,
      {address: handlerAddress, nodeId: this.nodeId},
    );
  }

  unregisterFromRouter(messageRouter) {
    if (!messageRouter || messageRouter !== this.messageRouter) return;
    const registration = this.registeredRouterHandler;
    if (typeof registration !== 'function') return;
    this.registeredRouterHandler = null;

    const handlerAddress =
      `${this.nodeId}/` +
      `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
      `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`;

    if (isFunction(messageRouter.unregisterExact)) {
      messageRouter.unregisterExact(handlerAddress, registration);
    }

    this.logger.info(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.UNREGISTERED_ROUTER,
      {address: handlerAddress, nodeId: this.nodeId},
    );
  }

  shutdown() {
    this.unregisterFromRouter(this.messageRouter);
    this.logger.info(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.SHUTTING_DOWN,
      {nodeId: this.nodeId},
    );
    this.inProgressOperations.clear();
    this.localReplicas.clear();
    this.removeAllListeners();
  }
}

export {MessageGroupServiceHandler};
