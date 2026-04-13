/**
 * MessageGroupServiceHandler - Handles CREATE_REPLICA and REMOVE_REPLICA
 * operations for message-group entities.
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {MessageGroupServiceRowOwner} from
  '../message-group/message-group-service-row-owner.js';
import {
  ENTITY_TYPE,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  ReplicaStatus,
} from '../rebalancer/replica-status.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../rebalancer/executor-outcome-constants.js';
import {
  MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS,
  MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG,
  MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM,
} from './message-group-service-handler-constants.js';

function isFunction(value) {
  return typeof value === TYPEOF.FUNCTION;
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
    this.messageGroupServiceRowOwner =
      options.messageGroupServiceRowOwner ||
      new MessageGroupServiceRowOwner({
        systemTableWriter: this.cdcIntegrationService,
      });
    this.messageRouter = options.messageRouter || null;
    this.rpcClient = null;

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

  async handleMessage(envelope) {
    const {payload, correlationId} = envelope;
    const type = payload?.[ReplicaOperationField.TYPE];

    this.logger.debug(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.MESSAGE_RECEIVED,
      {type, correlationId, operationId: payload?.operationId},
    );

    let response;
    if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
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

  async handleCreateReplica(request) {
    const operationId =
      request?.[ReplicaOperationField.OPERATION_ID];
    const groupId = this.resolveGroupId(request);
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];

    this.logger.info(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_REQUEST,
      {operationId, groupId, replicaId, nodeId: this.nodeId},
    );

    if (!operationId || !groupId || !replicaId) {
      this.logger.warn(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_MISSING_FIELDS,
        {operationId, groupId, replicaId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
        error:
          MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
        nodeId: this.nodeId,
        },
      );
    }

    const existingReplica =
      this.getKnownLocalReplica(replicaId, groupId);
    if (existingReplica &&
        existingReplica.status === ReplicaStatus.ACTIVE) {
      this.logger.info(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE,
        {groupId, replicaId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ALREADY_EXISTS,
        {
        replicaId,
        nodeId: this.nodeId,
        },
      );
    }

    if (existingReplica &&
        existingReplica.status === ReplicaStatus.CREATING) {
      this.logger.info(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_IN_PROGRESS,
        {groupId, replicaId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.IN_PROGRESS,
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

    let replicaOptions;
    try {
      replicaOptions = this.buildReplicaOptions(groupId, replicaId, request);
    } catch (error) {
      this.logger.warn(
        MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_TOPOLOGY_INVALID,
        {
          operationId,
          groupId,
          replicaId,
          error: error.message,
          nodeId: this.nodeId,
        },
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
        error: error.message,
        nodeId: this.nodeId,
        },
      );
    }

    this.localReplicas.set(replicaId, {
      replicaId,
      entityId: groupId,
      status: ReplicaStatus.CREATING,
    });
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      replicaId,
      entityId: groupId,
      startedAt: Date.now(),
      replicaOptions,
    });

    setImmediate(() => {
      this.createReplicaAsync({
        operationId,
        groupId,
        replicaId,
        replicaOptions,
      }).catch((error) => {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED,
          {
            operationId,
            replicaId,
            error: error.message,
            stack: error.stack,
          },
        );
      });
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

  async createReplicaAsync({
    operationId,
    groupId,
    replicaId,
    replicaOptions,
  }) {
    try {
      await this.createMessageGroupReplica(replicaOptions);
      await this.startMessageGroupReplica(replicaOptions);
      const service = this.resolveActiveReplicaService(replicaId);
      if (!this.isReplicaHandlerRegistered(replicaId, service)) {
        throw new Error(
          MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.
            REPLICA_HANDLER_NOT_REGISTERED(replicaId),
        );
      }
      await this.messageGroupServiceRowOwner.registerReplica({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        service,
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

      // Emit failed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED,
        operationId,
        WORKFLOW_STEP.FAILED,
        {replicaId, errorMessage: error.message},
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

    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.REMOVE_REPLICA,
      replicaId,
      entityId: groupId,
      startedAt: Date.now(),
    });
    this.localReplicas.set(replicaId, {
      ...replica,
      status: ReplicaStatus.REMOVING,
    });

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
      await this.messageGroupServiceRowOwner.updateReplicaStatus({
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
        replicaId,
        nodeId: this.nodeId,
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

  buildReplicaOptions(groupId, replicaId, request = {}) {
    const requestedReplicaIds = Array.isArray(
      request?.[ReplicaOperationField.REPLICA_IDS],
    ) ? request[ReplicaOperationField.REPLICA_IDS].filter((value) =>
      typeof value === 'string' && value.length > 0,
    ) : [];
    const requestedPeerAddresses = Array.isArray(
      request?.[ReplicaOperationField.PEER_ADDRESSES],
    ) ? request[ReplicaOperationField.PEER_ADDRESSES].filter((value) =>
      typeof value === 'string' && value.length > 0,
    ) : [];

    const addressManager = AddressManager.getInstance();
    const services = this.systemTableCache?.filter?.(
      SYSTEM_TABLE_NAME.SERVICES,
      (row) =>
        row?.service_type === SERVICE_TYPE.MESSAGE_GROUP &&
        row?.group_id === groupId,
    ) || [];
    const topologyMustBeComplete =
      requestedReplicaIds.length > 0 ||
      requestedPeerAddresses.length > 0 ||
      services.length > 0;

    const replicaIds = [];
    const peerAddresses = [];
    const seenReplicaIds = new Set();

    for (const service of services) {
      const serviceReplicaId = service.service_id || service.replica_id;
      if (!serviceReplicaId) {
        continue;
      }
      if (!seenReplicaIds.has(serviceReplicaId)) {
        seenReplicaIds.add(serviceReplicaId);
        replicaIds.push(serviceReplicaId);
      }
      const peerAddress = service.address ||
        (service.node_id ?
          addressManager.format(
            service.node_id,
            ENTITY_TYPE.MESSAGE_GROUP,
            serviceReplicaId,
          ) :
          null);
      if (peerAddress && !peerAddresses.includes(peerAddress)) {
        peerAddresses.push(peerAddress);
      }
    }

    for (const requestedReplicaId of requestedReplicaIds) {
      if (!seenReplicaIds.has(requestedReplicaId)) {
        seenReplicaIds.add(requestedReplicaId);
        replicaIds.push(requestedReplicaId);
      }
    }

    if (!seenReplicaIds.has(replicaId)) {
      seenReplicaIds.add(replicaId);
      replicaIds.push(replicaId);
    }

    const selfAddress = addressManager.format(
      this.nodeId,
      ENTITY_TYPE.MESSAGE_GROUP,
      replicaId,
    );
    if (!peerAddresses.includes(selfAddress)) {
      peerAddresses.push(selfAddress);
    }

    for (const requestedPeerAddress of requestedPeerAddresses) {
      if (!peerAddresses.includes(requestedPeerAddress)) {
        peerAddresses.push(requestedPeerAddress);
      }
    }

    const hasPeerReplica = replicaIds.some((value) => value !== replicaId);
    const hasPeerAddress = peerAddresses.some((value) => value !== selfAddress);
    if (topologyMustBeComplete &&
        (!hasPeerReplica ||
          !hasPeerAddress ||
          peerAddresses.length < replicaIds.length)) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CREATE_TOPOLOGY_REQUIRED(
          groupId,
          replicaId,
        ),
      );
    }

    return {
      groupId,
      replicaId,
      replicaIds,
      peerAddresses,
      deferElection: false,
      createDelayMs: NUM.ZERO,
    };
  }

  resolveActiveReplicaService(replicaId) {
    if (!isFunction(this.resolveLocalMessageGroupReplica)) {
      return null;
    }

    return this.resolveLocalMessageGroupReplica(replicaId) || null;
  }

  isReplicaHandlerRegistered(replicaId, service = null) {
    if (!this.messageRouter || !isFunction(this.messageRouter.isRegistered)) {
      return false;
    }
    const unifiedAddress =
      service?.unifiedAddress ||
      (isFunction(service?.getUnifiedAddress) ?
        service.getUnifiedAddress() :
        AddressManager.getInstance().format(
          this.nodeId,
          ENTITY_TYPE.MESSAGE_GROUP,
          replicaId,
        ));
    return this.messageRouter.isRegistered(unifiedAddress);
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
    this.messageRouter = messageRouter;

    const handlerAddress =
      `${this.nodeId}/` +
      `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
      `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`;

    if (options.rpcClient) {
      this.rpcClient = options.rpcClient;
    }

    const routerHandler = async (envelope) => {
      const response = await this.handleMessage(envelope);
      if (this.rpcClient && response.correlationId) {
        this.rpcClient.handleResponse(
          response.correlationId,
          response,
        );
      }
      return {acknowledged: true, ...response};
    };

    messageRouter.register(handlerAddress, routerHandler);

    this.logger.info(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REGISTERED_ROUTER,
      {address: handlerAddress, nodeId: this.nodeId},
    );
  }

  unregisterFromRouter(messageRouter) {
    if (!messageRouter) {
      return;
    }

    const handlerAddress =
      `${this.nodeId}/` +
      `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
      `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`;

    if (isFunction(messageRouter.unregister)) {
      messageRouter.unregister(handlerAddress);
    }

    this.logger.info(
      MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.UNREGISTERED_ROUTER,
      {address: handlerAddress, nodeId: this.nodeId},
    );
  }

  shutdown() {
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
