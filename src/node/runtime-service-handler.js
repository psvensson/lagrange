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
import {UNIFIED_SERVICE_TYPE} from '../constants/index.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {
  ReplicaStatus} from
  '../rebalancer/replica-status.js';
import {
  buildRuntimeServiceTargetClaimKey, runtimeServiceReplicaBelongsToEntity,
} from '../rebalancer/runtime-service-replica-identity.js';
import {consumeCreationWake, namesCreation, replyToExistingReplica,
  routeBoundRemoval, routeRuntimeServiceCreate, rowCreationHint, admitBoundRemoval} from
  './runtime-service-bound-creation-route.js';
import {createRestartLatch, notReadyReply, recoverRetainedCreations, resumeRestartPlans,
  replyToRestartPlan, retryRetiredPlans} from
  './runtime-service-restart-inventory.js';
import {captureCreationRequest, replicaExecution, currentExecution,
  executionRefusal, installExecution, executionRequestConflict} from './runtime-service-creation-execution.js';
import {SERVICE_INSTANCE_OUTCOME as CREATION_OUTCOME} from '../constants/service-instance.js';
import {createGenericReplica, removeGenericReplica, admitGenericRemoval} from './runtime-service-generic-replica.js';
import {
  RUNTIME_SERVICE_CREATION_MEMO,
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
import {resolveRequestCellServiceEnvelope, resolveCallCellServiceEnvelope,
  dispatchRuntimeServiceMessage} from './runtime-service-message-dispatch.js';

function buildReplicaOperationResponse(status, fields = {}) {
  return {
    status,
    ...fields,
  };
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
    this.legacyRemovalAuthority =
      typeof options.legacyRemovalAuthority === 'function' ?
        options.legacyRemovalAuthority : null;
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
    this.stopped = false;
    this.restartTask = undefined;
    // The restart ready latch (design RECOVERY-DESIGN-20261017 R1-H): a host
    // that applies a restart inventory refuses every message NOT_READY until
    // recoverRetainedCreations() wrote the memos.
    this.restartLatch = createRestartLatch(options.awaitsRestartInventory === true);
    /** @type {Promise<void>} Resolved once the restart inventory is applied. */
    this.ready = this.restartLatch.ready;

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
    if (!this.restartLatch.isReady()) return {...notReadyReply(this), correlationId};

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
    if (!this.restartLatch.isReady()) return notReadyReply(this);
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

    let params;
    try {
      params = captureCreationRequest(request, {operationId, entityId, replicaId});
    } catch (_error) {
      return executionRefusal(this, CREATION_OUTCOME.CONTENT_CONFLICT, false);
    }
    const retainedReply = replyToRestartPlan(this, params);
    if (retainedReply !== undefined) return retainedReply;
    if (executionRequestConflict(this, params, ReplicaOperationMessageType.CREATE_REPLICA)) {
      return executionRefusal(this, CREATION_OUTCOME.CONTENT_CONFLICT, false);
    }
    const inFlight = this.inProgressOperations.get(operationId);
    const existing = this.localReplicas.get(replicaId);
    if (existing?.status === RUNTIME_SERVICE_CREATION_MEMO.CONTINUATION_PENDING) {
      return executionRefusal(this,
        RUNTIME_SERVICE_HANDLER_ERROR_MSG.CREATION_CONTINUATION_PENDING);
    }
    const existingReply = this.replyToExistingReplica(existing, params);
    if (existingReply) return existingReply;
    if (replicaExecution(this, replicaId) !== undefined && inFlight === undefined) {
      return executionRefusal(this);
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

    const entry = this.trackCreateRequest(existing, params);
    if (entry === undefined) return executionRefusal(this);

    // Async creation after ACK
    setImmediate(() => {
      if (!currentExecution(this, entry)) return;
      this.createReplicaAsync(params, entry).catch((error) => {
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
   * Track a CREATE in progress. A memo that names a creation has one writer,
   * the bound route's settle (design RV6.1): the request is tracked in flight
   * only; any other memo becomes CREATING as before.
   * @param {Object|undefined} existing - The local replica memo.
   * @param {Object} params - {operationId, entityId, replicaId}.
   */
  trackCreateRequest(existing, params) {
    const entry = installExecution(this, params, ReplicaOperationMessageType.CREATE_REPLICA);
    if (entry === undefined) return undefined;
    if (!namesCreation(existing)) {
      this.localReplicas.set(params.replicaId, {
        replicaId: params.replicaId, entityId: params.entityId, status: ReplicaStatus.CREATING,
      });
    }
    return entry;
  }

  /**
   * The reply a CREATE gets from an existing local replica memo: ACTIVE
   * re-announces (a request under another id than a named memo's creation
   * is answered CONTENT_CONFLICT instead, design RV7.3); a locally retained creation (HELD, a named deferral, a
   * named retirement) answers through the bound route (design RV3.5, RV5.1,
   * RV6.2-RV6.4); CREATING is in progress; any other memo (or none) proceeds.
   * @param {Object|undefined} existing - The local replica memo.
   * @param {Object} params - {operationId, entityId, replicaId}.
   * @return {Object|null} The reply, or null to proceed.
   */
  replyToExistingReplica(existing, params) {
    return replyToExistingReplica(this, existing, params);
  }

  /**
   * Async create: the retained creation first, else the generic create
   * (runtime-service-bound-creation-route.js, design RV2.2).
   * @param {Object} params - {operationId, entityId, replicaId}.
   * @return {Promise<void>}
   */
  async createReplicaAsync(params, entry) {
    return routeRuntimeServiceCreate(this, params, entry);
  }

  /**
   * Apply the restart inventory of bound creations (design
   * RECOVERY-DESIGN-20261017 R1-A, R1-H): memos first, then `ready`, then
   * one re-entry or re-drive per creation of this node.
   * @return {Promise<Object[]>} The applied plans.
   */
  async recoverRetainedCreations() {
    return recoverRetainedCreations(this);
  }

  resumeRestartPlans(replicaId) {
    resumeRestartPlans(this, replicaId);
  }

  retryRetiredPlans(replicaId) {
    retryRetiredPlans(this, replicaId);
  }

  /**
   * The node-local creation wake consumer (enqueue-only, design RV2.4).
   * @param {string} serviceDefinitionId
   * @param {Object} wake - {reason, binding, token}.
   * @return {{outcome: string}}
   */
  onCreationWake(serviceDefinitionId, wake) {
    return consumeCreationWake(this, serviceDefinitionId, wake);
  }

  /**
   * Generic async create: resolve definition, create + start replica,
   * persist operation transitions.
   * @param {Object} params
   * @param {string} params.operationId
   * @param {string} params.entityId
   * @param {string} params.replicaId
   * @return {Promise<void>}
   */
  async createGenericReplicaAsync(params, entry) {
    return createGenericReplica(this, params, entry);
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

  trackReplicaRemovalOperation(params) {
    return installExecution(this, params,
      ReplicaOperationMessageType.REMOVE_REPLICA);
  }

  startRemoveReplicaAsync(params, entry) {
    if (!currentExecution(this, entry) || entry.params !== params) return;
    setImmediate(() => {
      if (!currentExecution(this, entry)) return;
      this.removeReplicaAsync(params, entry).catch((error) => {
        this.logger.error(RUNTIME_SERVICE_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED,
          {operationId: params.operationId, replicaId: params.replicaId,
            error: error.message, stack: error.stack});
      });
    });
  }

  recoverLocalReplicaForRemoval(replicaId, entityId) {
    if (typeof this.systemTableCache?.get !== 'function') {
      return null;
    }
    // A bound row is keyed by its physical id and names the canonical id in
    // replica_id: the miss path finds it (design RV2.1, RV3.6 N3).
    const row = this.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      replicaId,
    ) || this.systemTableCache.find?.(SYSTEM_TABLE_NAME.SERVICES,
      (candidate) => candidate?.replica_id === replicaId);
    if (
      !row ||
      (row.service_id !== replicaId && row.replica_id !== replicaId) ||
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
      ...rowCreationHint(row),
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
    if (!this.restartLatch.isReady()) return notReadyReply(this);
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

    let params;
    try {
      params = captureCreationRequest(request, {operationId, entityId, replicaId, reason});
    } catch (_error) {
      return executionRefusal(this, CREATION_OUTCOME.CONTENT_CONFLICT, false);
    }
    if (executionRequestConflict(this, params, ReplicaOperationMessageType.REMOVE_REPLICA)) {
      return executionRefusal(this, CREATION_OUTCOME.CONTENT_CONFLICT, false);
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

    if (replica.entityId !== entityId ||
        (namesCreation(replica) &&
          buildRuntimeServiceTargetClaimKey(replicaId, entityId) === null)) {
      return executionRefusal(this, CREATION_OUTCOME.CONTENT_CONFLICT, false);
    }
    // An opaque historical target's services row is only custody evidence.
    // Before any generic STOP consume the *original* operation owner's exact
    // durable identity, not the incoming request's unverified entity claim.
    if (!namesCreation(replica) &&
        !runtimeServiceReplicaBelongsToEntity(replicaId, entityId)) {
      let authorization;
      try {
        authorization = await this.legacyRemovalAuthority?.({
          operationId, entityId, replicaId, nodeId: this.nodeId,
        });
      } catch {
        authorization = {outcome: CREATION_OUTCOME.UNAVAILABLE};
      }
      if (authorization?.outcome !== CREATION_OUTCOME.ADMITTED) {
        const conflict = authorization?.outcome === CREATION_OUTCOME.CONTENT_CONFLICT;
        return executionRefusal(this, conflict ?
          CREATION_OUTCOME.CONTENT_CONFLICT : CREATION_OUTCOME.UNAVAILABLE, !conflict);
      }
      if (this.stopped || this.localReplicas.get(replicaId) !== replica) {
        return notReadyReply(this);
      }
    }
    if (replica.status === RUNTIME_SERVICE_CREATION_MEMO.CONTINUATION_PENDING) {
      return executionRefusal(this,
        RUNTIME_SERVICE_HANDLER_ERROR_MSG.CREATION_CONTINUATION_PENDING);
    }
    if (namesCreation(replica) && replica.status !== ReplicaStatus.REMOVED) {
      return admitBoundRemoval(this, params, replica);
    }
    return admitGenericRemoval(this, params, replica);
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
  async removeReplicaAsync(params, installed) {
    const entry = installed;
    if (!currentExecution(this, entry) || entry.params !== params) return;
    if (entry?.creationOperationId) {
      return routeBoundRemoval(this, params, entry.creationOperationId, entry);
    }
    return this.removeGenericReplicaAsync(params, entry);
  }

  async removeGenericReplicaAsync(params, entry) {
    return removeGenericReplica(this, params, entry);
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
    if (!this.stopped && this.executorOutcomeEmitter) {
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
    if (!this.stopped && replicaInfo?.replicaId) {
      this.localReplicas.set(replicaInfo.replicaId, replicaInfo);
    }
  }

  /**
   * Shutdown handler.
   */
  shutdown() {
    this.stopped = true;
    this.restartLatch.close();
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
