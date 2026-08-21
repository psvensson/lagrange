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
  WORKFLOW_STEP} from
  '../constants/index.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {
  ReplicaStatus} from
  '../rebalancer/replica-status.js';
import {
  EXECUTOR_OUTCOME_TYPE} from
  '../rebalancer/executor-outcome-constants.js';
import {
  buildRuntimeServiceTargetClaimKey,
} from '../rebalancer/runtime-service-replica-identity.js';
import {
  RUNTIME_SERVICE_HANDLER_ADDRESS,
  RUNTIME_SERVICE_HANDLER_ERROR_MSG,
  RUNTIME_SERVICE_HANDLER_LOG_MSG,
  RUNTIME_SERVICE_HANDLER_SUBSYSTEM} from
  './runtime-service-handler-constants.js';
import {
  assertCurrentRequestCellTarget,
  handleRequestCellInvocation,
} from './runtime-service-request-cell-handler.js';
import {
  assertCurrentCallCellTarget,
  handleCallCellInvocation,
} from './runtime-service-call-cell-handler.js';
import {CallBindingRouteResolver} from
  '../service/call-binding-route-resolver.js';
import {RequestBindingRouteResolver} from
  '../service/request-binding-route-resolver.js';
import {
  REQUEST_CELL_ROUTE_MESSAGE_TYPE,
  REQUEST_CELL_ROUTE_OPERATION,
} from '../service/request-cell-routing-contract.js';
import {
  CALL_CELL_ROUTE_MESSAGE_TYPE,
  CALL_CELL_ROUTE_OPERATION,
} from '../service/call-cell-routing-contract.js';

function buildReplicaOperationResponse(status, fields = {}) {
  return {
    status,
    ...fields,
  };
}

function resolveRequestCellServiceEnvelope(envelope) {
  if (envelope?.operation === REQUEST_CELL_ROUTE_OPERATION) {
    return envelope;
  }
  if (envelope?.payload?.operation === REQUEST_CELL_ROUTE_OPERATION) {
    return envelope.payload;
  }
  return null;
}

function resolveCallCellServiceEnvelope(envelope) {
  if (envelope?.operation === CALL_CELL_ROUTE_OPERATION) {
    return envelope;
  }
  if (envelope?.payload?.operation === CALL_CELL_ROUTE_OPERATION) {
    return envelope.payload;
  }
  return null;
}

async function dispatchRuntimeServiceMessage(
  handler,
  type,
  payload,
  serviceEnvelope,
) {
  if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
    return handler.handleCreateReplica(payload);
  }
  if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
    return handler.handleRemoveReplica(payload);
  }
  if (type === REQUEST_CELL_ROUTE_MESSAGE_TYPE) {
    return handler.handleRequestCellInvocation(serviceEnvelope);
  }
  if (type === CALL_CELL_ROUTE_MESSAGE_TYPE) {
    return handler.handleCallCellInvocation(serviceEnvelope);
  }
  const unknownType =
    RUNTIME_SERVICE_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
  return buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.ERROR,
    {error: unknownType(type)},
  );
}

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
    this.serviceRuntimeLifecycle =
      options.serviceRuntimeLifecycle || null;
    this.rpcClient = null;
    this.requestBindingRouteResolver =
      options.requestBindingRouteResolver ||
      new RequestBindingRouteResolver({
        systemTableCacheProvider: () => this.systemTableCache,
      });
    this.callBindingRouteResolver =
      options.callBindingRouteResolver ||
      new CallBindingRouteResolver({
        systemTableCacheProvider: () => this.systemTableCache,
      });
    // Local partition replicas for data-local shard batch building. The
    // self-default reuses the provider CDC already carries in production;
    // absence degrades to a typed RETRYABLE refusal, never a crash.
    this.partitionServicesProvider =
      typeof options.partitionServicesProvider === 'function' ?
        options.partitionServicesProvider :
        () => this.cdcIntegrationService?.resolvePartitionServices?.() ||
          this.cdcIntegrationService?.partitionServicesProvider?.() ||
          null;

    // Executor outcome emitter — replaces direct replica_operations writes.
    this.executorOutcomeEmitter = options.executorOutcomeEmitter || null;

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
    const {correlationId} = envelope;
    const serviceEnvelope = resolveRequestCellServiceEnvelope(envelope) ||
      resolveCallCellServiceEnvelope(envelope);
    const payload = serviceEnvelope?.payload || envelope.payload;
    const type = payload?.[ReplicaOperationField.TYPE] || payload?.type;

    this.logger.debug(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.MESSAGE_RECEIVED,
      {type, correlationId, operationId: payload?.operationId},
    );

    const response = await dispatchRuntimeServiceMessage(
      this,
      type,
      payload,
      serviceEnvelope,
    );

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
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error:
          RUNTIME_SERVICE_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
          nodeId: this.nodeId,
        },
      );
    }
    if (buildRuntimeServiceTargetClaimKey(
      replicaId,
      entityId,
    ) === null) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_INVALID_REPLICA_ID,
        {operationId, entityId, replicaId, nodeId: this.nodeId},
      );
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error:
            RUNTIME_SERVICE_HANDLER_ERROR_MSG.CREATE_INVALID_REPLICA_ID,
          errorCode:
            RUNTIME_SERVICE_HANDLER_ERROR_MSG.CREATE_INVALID_REPLICA_ID_CODE,
          deferRetry: false,
          nodeId: this.nodeId,
        },
      );
    }

    // Idempotency: existing active replica
    const existing = this.localReplicas.get(replicaId);
    if (existing) {
      if (existing.status === ReplicaStatus.ACTIVE) {
        this.logger.info(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE,
          {replicaId, nodeId: this.nodeId},
        );
        this.emitExecutorOutcome(
          EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
          operationId,
          WORKFLOW_STEP.ACTIVE,
          {replicaId},
        );
        return buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          {
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      if (existing.status === ReplicaStatus.CREATING) {
        this.logger.info(
          RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_IN_PROGRESS,
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
    }

    // Idempotency: in-progress operation
    if (this.inProgressOperations.has(operationId)) {
      this.logger.info(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS,
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

    return buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.INITIATED,
      {
        operationId,
        replicaId,
        nodeId: this.nodeId,
      },
    );
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
        entityId,
        nodeId: this.nodeId,
        ...definition,
        // service_definitions rows are stored snake_case, but the runtime
        // descriptor validator (and adapter) read camelCase. Provide the
        // camelCase runtime fields additively so a placed replica validates;
        // without this every runtime-service create fails "runtime_kind is
        // required". (Accept an already-camelCase definition too.)
        runtimeKind: definition.runtime_kind ?? definition.runtimeKind ?? null,
        runtimeRef: definition.runtime_ref ?? definition.runtimeRef ?? null,
        runtimeConfig:
          definition.runtime_config ?? definition.runtimeConfig ?? null,
      };

      await this.serviceLifecycleManager.createReplica(
        replicaHandle, {nodeId: this.nodeId},
      );
      await this.serviceLifecycleManager.startReplica(
        replicaHandle, {nodeId: this.nodeId},
      );

      this.localReplicas.set(replicaId, {
        replicaHandle,
        replicaId,
        entityId,
        status: ReplicaStatus.ACTIVE,
      });

      // Emit active outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
        operationId,
        WORKFLOW_STEP.ACTIVE,
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

      // Emit failed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
        operationId,
        WORKFLOW_STEP.FAILED,
        {replicaId, errorMessage: error.message},
      );

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

  trackReplicaRemovalOperation(operationId, entityId, replicaId) {
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.REMOVE_REPLICA,
      replicaId,
      entityId,
      startedAt: Date.now(),
    });
  }

  startRemoveReplicaAsync({operationId, entityId, replicaId, reason}) {
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
  }

  recoverLocalReplicaForRemoval(replicaId, entityId) {
    if (typeof this.systemTableCache?.get !== 'function') {
      return null;
    }
    const row = this.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      replicaId,
    );
    if (
      !row ||
      row.service_id !== replicaId ||
      row.service_type !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE ||
      row.node_id !== this.nodeId ||
      row.status === ReplicaStatus.REMOVED
    ) {
      return null;
    }
    const recoveredReplica = {
      replicaId,
      entityId,
      status: row.status || ReplicaStatus.ACTIVE,
    };
    this.localReplicas.set(replicaId, recoveredReplica);
    return recoveredReplica;
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
      return buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error:
          RUNTIME_SERVICE_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
          nodeId: this.nodeId,
        },
      );
    }

    const replica =
      this.localReplicas.get(replicaId) ||
      this.recoverLocalReplicaForRemoval(replicaId, entityId);
    if (!replica) {
      this.logger.warn(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_NOT_FOUND,
        {replicaId, nodeId: this.nodeId},
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
        this.trackReplicaRemovalOperation(operationId, entityId, replicaId);
        this.startRemoveReplicaAsync({
          operationId, entityId, replicaId, reason,
        });
      }
      this.logger.info(
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS,
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
        RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED,
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
        RUNTIME_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS,
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

    this.trackReplicaRemovalOperation(operationId, entityId, replicaId);
    this.localReplicas.set(replicaId, {
      ...replica,
      status: ReplicaStatus.REMOVING,
    });

    // Async removal after ACK
    this.startRemoveReplicaAsync({
      operationId, entityId, replicaId, reason,
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
        entityId,
        nodeId: this.nodeId,
        ...(definition || {}),
      };

      await this.serviceLifecycleManager.stopReplica(
        replicaHandle, {nodeId: this.nodeId, reason},
      );

      this.localReplicas.set(replicaId, {
        replicaId, entityId, status: ReplicaStatus.REMOVED,
      });

      // Emit removed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_COMPLETED,
        operationId,
        WORKFLOW_STEP.REMOVED,
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

      // Emit failed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED,
        operationId,
        WORKFLOW_STEP.FAILED,
        {replicaId, errorMessage: error.message},
      );

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

  assertCurrentRequestCellTarget(
    request,
    route,
    invocation,
  ) {
    return assertCurrentRequestCellTarget(
      this,
      request,
      route,
      invocation,
    );
  }

  async handleRequestCellInvocation(envelope) {
    return handleRequestCellInvocation(this, envelope);
  }

  assertCurrentCallCellTarget(
    call,
    route,
    invocation,
  ) {
    return assertCurrentCallCellTarget(
      this,
      call,
      route,
      invocation,
    );
  }

  async handleCallCellInvocation(envelope) {
    return handleCallCellInvocation(this, envelope);
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
