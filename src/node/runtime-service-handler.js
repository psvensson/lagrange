/**
 * RuntimeServiceHandler - Handles CREATE_REPLICA and REMOVE_REPLICA
 * operations for runtime-service entities.
 *
 * Delegates to ServiceLifecycleManager for replica materialization
 * and uses the existing operation step persistence path via
 * cdcIntegrationService.
 *
 * Requirements: 2.1, 3.2, 4.4, 11.2
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
} from '../rebalancer/replica-status.js';
import {
  RUNTIME_SERVICE_HANDLER_ADDRESS,
  RUNTIME_SERVICE_HANDLER_ERROR_MSG,
  RUNTIME_SERVICE_HANDLER_LOG_MSG,
  RUNTIME_SERVICE_HANDLER_SUBSYSTEM,
  RUNTIME_SERVICE_HANDLER_WORKFLOW,
} from './runtime-service-handler-constants.js';

class RuntimeServiceHandler extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration.
   * @param {Object} options.serviceLifecycleManager - Lifecycle manager.
   */
  constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.serviceLifecycleManager =
      options.serviceLifecycleManager || null;
    this.rpcClient = null;

    /** @type {Map<string, Object>} In-progress operations by ID */
    this.inProgressOperations = new Map();
    /** @type {Map<string, Object>} Local replica state by ID */
    this.localReplicas = new Map();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        RUNTIME_SERVICE_HANDLER_SUBSYSTEM,
      ) : console;
  }

  /**
   * Validate required dependencies.
   */
  initialize() {
    this.logger.debug(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.INITIALIZING,
      {nodeId: this.nodeId},
    );

    if (!this.serviceLifecycleManager) {
      throw new Error(
        RUNTIME_SERVICE_HANDLER_ERROR_MSG.LIFECYCLE_MANAGER_REQUIRED,
      );
    }
    if (!this.cdcIntegrationService) {
      throw new Error(
        RUNTIME_SERVICE_HANDLER_ERROR_MSG.CDC_REQUIRED,
      );
    }
    if (!this.systemTableCache) {
      throw new Error(
        RUNTIME_SERVICE_HANDLER_ERROR_MSG.CACHE_REQUIRED,
      );
    }
  }

  /**
   * Handle incoming message envelope.
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response.
   */
  async handleMessage(envelope) {
    const {payload, correlationId} = envelope;
    const type = payload?.[ReplicaOperationField.TYPE];

    this.logger.debug(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.MESSAGE_RECEIVED,
      {type, correlationId, operationId: payload?.operationId},
    );

    let response;
    if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
      response = await this.handleCreateReplica(payload);
    } else if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
      response = await this.handleRemoveReplica(payload);
    } else {
      const unknownType =
        RUNTIME_SERVICE_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
      response = {
        status: ReplicaOperationResponseStatus.ERROR,
        error: unknownType(type),
      };
    }

    return {...response, correlationId};
  }

  /**
   * Handle CREATE_REPLICA for a runtime service.
   * @param {Object} request - Operation request payload.
   * @return {Promise<Object>} Response.
   */
  async handleCreateReplica(request) {
    const operationId =
      request?.[ReplicaOperationField.OPERATION_ID];
    const entityId = request?.[ReplicaOperationField.ENTITY_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];

    this.logger.info(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_REQUEST,
      {operationId, entityId, replicaId, nodeId: this.nodeId},
    );

    if (!operationId || !entityId || !replicaId) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_MISSING_FIELDS,
        {operationId, entityId, replicaId, nodeId: this.nodeId},
      );
      return {
        status: ReplicaOperationResponseStatus.ERROR,
        error:
          RUNTIME_SERVICE_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
        nodeId: this.nodeId,
      };
    }

    // Idempotency: existing active replica
    const existing = this.localReplicas.get(replicaId);
    if (existing) {
      if (existing.status === ReplicaStatus.ACTIVE) {
        this.logger.info(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE,
          {replicaId, nodeId: this.nodeId},
        );
        return {
          status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
          replicaId,
          nodeId: this.nodeId,
        };
      }
      if (existing.status === ReplicaStatus.CREATING) {
        this.logger.info(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_IN_PROGRESS,
          {replicaId, nodeId: this.nodeId},
        );
        return {
          status: ReplicaOperationResponseStatus.IN_PROGRESS,
          replicaId,
          nodeId: this.nodeId,
        };
      }
    }

    // Idempotency: in-progress operation
    if (this.inProgressOperations.has(operationId)) {
      this.logger.info(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS,
        {operationId, nodeId: this.nodeId},
      );
      return {
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
        operationId,
        nodeId: this.nodeId,
      };
    }

    // Track in-progress
    this.localReplicas.set(replicaId, {
      replicaId,
      entityId,
      status: ReplicaStatus.CREATING,
    });
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      replicaId,
      entityId,
      startedAt: Date.now(),
    });

    // Async creation after ACK
    setImmediate(() => {
      this.createReplicaAsync({
        operationId, entityId, replicaId,
      }).catch((error) => {
        this.logger.error(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED,
          {
            operationId, replicaId,
            error: error.message, stack: error.stack,
          },
        );
      });
    });

    return {
      status: ReplicaOperationResponseStatus.INITIATED,
      operationId,
      replicaId,
      nodeId: this.nodeId,
    };
  }

  /**
   * Async create: resolve definition, create + start replica,
   * persist operation transitions.
   * @param {Object} params
   * @param {string} params.operationId
   * @param {string} params.entityId
   * @param {string} params.replicaId
   * @return {Promise<void>}
   */
  async createReplicaAsync({operationId, entityId, replicaId}) {
    try {
      const definition = this.resolveServiceDefinition(entityId);
      if (!definition) {
        const definitionNotFound =
          RUNTIME_SERVICE_HANDLER_ERROR_MSG.DEFINITION_NOT_FOUND;
        throw new Error(definitionNotFound(entityId));
      }

      const replicaHandle = {
        serviceId: replicaId,
        serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        replicaId,
        ...definition,
      };

      await this.serviceLifecycleManager.createReplica(
        replicaHandle, {nodeId: this.nodeId},
      );
      await this.serviceLifecycleManager.startReplica(
        replicaHandle, {nodeId: this.nodeId},
      );

      this.localReplicas.set(replicaId, {
        replicaId, entityId, status: ReplicaStatus.ACTIVE,
      });

      await this.updateOperationStep(
        operationId, WORKFLOW_STEP.ACTIVE,
        {replicaId},
      );

      this.logger.info(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_COMPLETED,
        {operationId, replicaId, entityId, nodeId: this.nodeId},
      );
    } catch (error) {
      this.localReplicas.set(replicaId, {
        replicaId, entityId, status: ReplicaStatus.FAILED,
      });

      await this.updateOperationStep(
        operationId, WORKFLOW_STEP.FAILED,
        {replicaId, errorMessage: error.message},
      ).catch((stepErr) => {
        this.logger.warn(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.UPDATE_STATUS_FAILED,
          {operationId, replicaId, error: stepErr.message},
        );
      });

      this.logger.error(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_FAILED,
        {
          operationId, replicaId, entityId,
          error: error.message, nodeId: this.nodeId,
        },
      );
    } finally {
      this.inProgressOperations.delete(operationId);
    }
  }

  /**
   * Handle REMOVE_REPLICA for a runtime service.
   * @param {Object} request - Operation request payload.
   * @return {Promise<Object>} Response.
   */
  async handleRemoveReplica(request) {
    const operationId =
      request?.[ReplicaOperationField.OPERATION_ID];
    const entityId = request?.[ReplicaOperationField.ENTITY_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
    const reason = request?.[ReplicaOperationField.REASON];

    this.logger.info(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_REQUEST,
      {
        operationId, entityId, replicaId,
        reason, nodeId: this.nodeId,
      },
    );

    if (!operationId || !entityId || !replicaId) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_MISSING_FIELDS,
        {operationId, entityId, replicaId, nodeId: this.nodeId},
      );
      return {
        status: ReplicaOperationResponseStatus.ERROR,
        error:
          RUNTIME_SERVICE_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
        nodeId: this.nodeId,
      };
    }

    const replica = this.localReplicas.get(replicaId);
    if (!replica) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_NOT_FOUND,
        {replicaId, nodeId: this.nodeId},
      );
      return {
        status: ReplicaOperationResponseStatus.NOT_FOUND,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    if (replica.status === ReplicaStatus.REMOVING) {
      this.logger.info(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS,
        {replicaId, nodeId: this.nodeId},
      );
      return {
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    if (replica.status === ReplicaStatus.REMOVED) {
      this.logger.info(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED,
        {replicaId, nodeId: this.nodeId},
      );
      return {
        status: ReplicaOperationResponseStatus.COMPLETED,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    if (this.inProgressOperations.has(operationId)) {
      this.logger.info(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS,
        {operationId, nodeId: this.nodeId},
      );
      return {
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
        operationId,
        nodeId: this.nodeId,
      };
    }

    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.REMOVE_REPLICA,
      replicaId,
      entityId,
      startedAt: Date.now(),
    });
    this.localReplicas.set(replicaId, {
      ...replica,
      status: ReplicaStatus.REMOVING,
    });

    // Async removal after ACK
    setImmediate(() => {
      this.removeReplicaAsync({
        operationId, entityId, replicaId, reason,
      }).catch((error) => {
        this.logger.error(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED,
          {
            operationId, replicaId,
            error: error.message, stack: error.stack,
          },
        );
      });
    });

    return {
      status: ReplicaOperationResponseStatus.INITIATED,
      operationId,
      replicaId,
      nodeId: this.nodeId,
    };
  }

  /**
   * Async remove: stop replica via lifecycle manager,
   * persist operation transitions.
   * @param {Object} params
   * @param {string} params.operationId
   * @param {string} params.entityId
   * @param {string} params.replicaId
   * @param {string} [params.reason]
   * @return {Promise<void>}
   */
  async removeReplicaAsync({
    operationId, entityId, replicaId, reason,
  }) {
    try {
      const definition = this.resolveServiceDefinition(entityId);
      const replicaHandle = {
        serviceId: replicaId,
        serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        replicaId,
        ...(definition || {}),
      };

      await this.serviceLifecycleManager.stopReplica(
        replicaHandle, {nodeId: this.nodeId, reason},
      );

      this.localReplicas.set(replicaId, {
        replicaId, entityId, status: ReplicaStatus.REMOVED,
      });

      await this.updateOperationStep(
        operationId, WORKFLOW_STEP.REMOVED,
        {replicaId},
      );

      this.logger.info(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_COMPLETED,
        {operationId, replicaId, entityId, nodeId: this.nodeId},
      );
    } catch (error) {
      this.localReplicas.set(replicaId, {
        replicaId, entityId, status: ReplicaStatus.FAILED,
      });

      await this.updateOperationStep(
        operationId, WORKFLOW_STEP.FAILED,
        {replicaId, errorMessage: error.message},
      ).catch((stepErr) => {
        this.logger.warn(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.UPDATE_STATUS_FAILED,
          {operationId, replicaId, error: stepErr.message},
        );
      });

      this.logger.error(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_FAILED,
        {
          operationId, replicaId, entityId,
          error: error.message, nodeId: this.nodeId,
        },
      );
    } finally {
      this.inProgressOperations.delete(operationId);
    }
  }

  /**
   * Resolve service definition from system table cache.
   * @param {string} entityId - Service definition ID.
   * @return {Object|null} Definition row or null.
   */
  resolveServiceDefinition(entityId) {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.get !== 'function') {
      return null;
    }
    const row = this.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, entityId,
    );
    if (!row) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.DEFINITION_NOT_FOUND,
        {entityId, nodeId: this.nodeId},
      );
      return null;
    }
    return row;
  }

  /**
   * Persist operation step transition via CDC.
   * @param {string} operationId
   * @param {string} workflowStep
   * @param {Object} [options]
   * @return {Promise<void>}
   */
  async updateOperationStep(operationId, workflowStep, options = {}) {
    if (!operationId) {
      return;
    }

    const existing = this.systemTableCache.get(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId,
    );

    if (!existing && !options.replicaId) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.OPERATION_NOT_FOUND,
        {operationId, workflowStep, nodeId: this.nodeId},
      );
      return;
    }

    const now = Date.now();
    let stepsHistory = [];
    if (Array.isArray(existing?.steps_history)) {
      stepsHistory = [...existing.steps_history];
    } else if (existing?.steps_history) {
      try {
        stepsHistory = JSON.parse(existing.steps_history);
      } catch (error) {
        this.logger.warn(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.PARSE_STEPS_HISTORY_FAILED,
          {operationId, error: error.message},
        );
        throw error;
      }
    }

    stepsHistory.push({step: workflowStep, timestamp: now});

    const status = workflowStep === WORKFLOW_STEP.FAILED ?
      ReplicaStatus.FAILED :
      (WORKFLOW_STEP_TO_STATUS[workflowStep] ||
        existing?.status ||
        ReplicaStatus.PENDING);

    const updateData = {
      workflow_step: workflowStep,
      status,
      updated_at: now,
      steps_history: JSON.stringify(stepsHistory),
    };

    if (options.replicaId) {
      updateData.replica_id = options.replicaId;
    }
    if (options.errorMessage) {
      updateData.error_message = options.errorMessage;
    }
    if (RUNTIME_SERVICE_HANDLER_WORKFLOW.COMPLETION_STEPS
      .includes(workflowStep)) {
      updateData.completed_at = now;
    }

    try {
      await this.cdcIntegrationService.updateSystemTableRow(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {operation_id: operationId},
        updateData,
      );
    } catch (error) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.UPDATE_STATUS_FAILED,
        {operationId, workflowStep, error: error.message},
      );
      throw error;
    }
  }

  /**
   * Register this handler with a message router.
   * @param {Object} messageRouter - Message router instance.
   * @param {Object} [options] - Registration options.
   */
  registerWithRouter(messageRouter, options = {}) {
    if (!messageRouter) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.NO_MESSAGE_ROUTER,
      );
      return;
    }

    const handlerAddress =
      `${this.nodeId}/` +
      `${RUNTIME_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
      `${RUNTIME_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`;

    if (options.rpcClient) {
      this.rpcClient = options.rpcClient;
    }

    const routerHandler = async (envelope) => {
      const response = await this.handleMessage(envelope);
      if (this.rpcClient && response.correlationId) {
        this.rpcClient.handleResponse(
          response.correlationId, response,
        );
      }
      return {acknowledged: true, ...response};
    };

    messageRouter.register(handlerAddress, routerHandler);

    this.logger.info(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.REGISTERED_ROUTER,
      {address: handlerAddress, nodeId: this.nodeId},
    );
  }

  /**
   * Unregister this handler from a message router.
   * @param {Object} messageRouter - Message router instance.
   */
  unregisterFromRouter(messageRouter) {
    if (!messageRouter) {
      return;
    }

    const handlerAddress =
      `${this.nodeId}/` +
      `${RUNTIME_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
      `${RUNTIME_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`;

    if (typeof messageRouter.unregister === 'function') {
      messageRouter.unregister(handlerAddress);
    }

    this.logger.info(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.UNREGISTERED_ROUTER,
      {address: handlerAddress, nodeId: this.nodeId},
    );
  }

  /**
   * Get local replica info.
   * @param {string} replicaId
   * @return {Object|undefined}
   */
  getLocalReplica(replicaId) {
    return this.localReplicas.get(replicaId);
  }

  /**
   * Register an existing replica (e.g. from recovery).
   * @param {Object} replicaInfo
   */
  registerExistingReplica(replicaInfo) {
    if (replicaInfo?.replicaId) {
      this.localReplicas.set(replicaInfo.replicaId, replicaInfo);
    }
  }

  /**
   * Shutdown handler.
   */
  shutdown() {
    this.logger.info(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.SHUTTING_DOWN,
      {nodeId: this.nodeId},
    );
    this.inProgressOperations.clear();
    this.localReplicas.clear();
    this.removeAllListeners();
  }
}

export {RuntimeServiceHandler};
