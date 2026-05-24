/**
 * Unified lifecycle owner for all service types.
 */

import {LoggingService} from '../logging/logging-service.js';
import {
  NUM,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_LIFECYCLE_TRANSITIONS,
  SERVICE_OPERATION_STATE,
  SUBSYSTEM,
  TYPEOF,
} from '../constants/index.js';
import {
  buildIdempotencyCheckSQL,
  buildListOperationsSQL,
  createOperation,
  transitionOperation,
} from '../wasm-service/operation-lifecycle.js';
import {ServiceTypeAdapter} from './service-type-adapter.js';
import {
  ServiceIdempotencyCheckError,
  ServicePolicyViolationError,
  ServiceLifecycleTransitionError,
  ServiceOperationJournalError,
  UnknownServiceTypeError,
} from './service-lifecycle-errors.js';
import {
  LIFECYCLE_MGR_MSG,
  SERVICE_LIFECYCLE_LOG,
  SERVICE_LIFECYCLE_MANAGER_LITERAL,
  SERVICE_LIFECYCLE_METRIC_STATUS,
  SERVICE_POLICY_TYPE,
  allowRuntimeLifecyclePolicy,
  resolveServiceFields,
} from './service-lifecycle-common.js';
import {
  createReplica as createLifecycleReplica,
  restartReplica as restartLifecycleReplica,
  startReplica as startLifecycleReplica,
  stopReplica as stopLifecycleReplica,
} from './service-lifecycle-operations.js';
import {recoverPendingOperations as recoverLifecyclePendingOperations} from './service-lifecycle-recovery.js';

const DEFAULT_DIAGNOSTICS_LIMIT = 100;
const MAX_DIAGNOSTICS_LIMIT = 500;
/**
 * ServiceLifecycleManager is the single lifecycle owner for all service types.
 */ class ServiceLifecycleManager {
  constructor(options = {}) {
    /** @type {Map<string, ServiceTypeAdapter>} */ this._adapters = new Map();
    /** @type {Function|null} */ this._operationWriter = null;
    /** @type {Function|null} */ this._idempotencyReader = null;
    /** @type {Function|null} */ this._recoveryReader = null;
    /** @type {Function} */ this._runtimePolicyCheck = allowRuntimeLifecyclePolicy;
    /** @type {Map<string, string>} */ this._replicaStateById = new Map();
    /** @type {Map<string, number>} */ this._adapterSelectionCountByType = new Map();
    /** @type {Object[]} */ this._recentOperations = [];
    /** @type {Object} */ this._metrics = {
      operationTotal: NUM.ZERO,
      operationSuccess: NUM.ZERO,
      operationFailure: NUM.ZERO,
      operationLatencyMsTotal: NUM.ZERO,
      operationLatencyMsMax: NUM.ZERO,
      lastOperationDurationMs: NUM.ZERO,
      lastError: null,
      byOperation: {},
    };
    /** @type {Object} */ this._logger = options.logger || this._initLogger();
    if (options.runtimePolicyCheck !== undefined) {
      this.setRuntimePolicyCheck(options.runtimePolicyCheck);
    }
  }
  /**
   * @return {Object}
   * @private
   */ _initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(SUBSYSTEM.SERVICE_LIFECYCLE);
      }
    } catch {
      // Logging service may not be initialized in unit tests.
    }
    return console;
  }
  /**
   * Register a lifecycle adapter for one service type.
   *
   * @param {ServiceTypeAdapter} adapter
   * @return {void}
   */ registerAdapter(adapter) {
    if (!(adapter instanceof ServiceTypeAdapter)) {
      throw new TypeError(LIFECYCLE_MGR_MSG.ADAPTER_INSTANCE_REQUIRED);
    }
    const serviceType = adapter.serviceType;
    if (this._adapters.has(serviceType)) {
      throw new Error(`${LIFECYCLE_MGR_MSG.ADAPTER_ALREADY_REGISTERED}: ${serviceType}`);
    }
    this._adapters.set(serviceType, adapter);
  }
  /**
   * Set SQL/CDC writer used to persist operation-journal SQL.
   *
   * @param {Function} writer
   * @return {void}
   */ setOperationWriter(writer) {
    if (typeof writer !== TYPEOF.FUNCTION) {
      throw new TypeError(LIFECYCLE_MGR_MSG.OPERATION_WRITER_REQUIRED);
    }
    this._operationWriter = writer;
  }
  /**
   * Set SQL/CDC reader used for idempotency lookups.
   *
   * @param {Function} reader
   * @return {void}
   */ setIdempotencyReader(reader) {
    if (typeof reader !== TYPEOF.FUNCTION) {
      throw new TypeError(LIFECYCLE_MGR_MSG.IDEMPOTENCY_READER_REQUIRED);
    }
    this._idempotencyReader = reader;
  }
  /**
   * Set SQL/CDC reader used to recover pending/in-progress operations.
   *
   * @param {Function} reader
   * @return {void}
   */ setRecoveryReader(reader) {
    if (typeof reader !== TYPEOF.FUNCTION) {
      throw new TypeError(LIFECYCLE_MGR_MSG.RECOVERY_READER_REQUIRED);
    }
    this._recoveryReader = reader;
  }
  /**
   * Set runtime policy check used by mutating lifecycle operations.
   *
   * @param {Function} check
   * @return {void}
   */ setRuntimePolicyCheck(check) {
    if (typeof check !== TYPEOF.FUNCTION) {
      throw new TypeError(LIFECYCLE_MGR_MSG.RUNTIME_POLICY_CHECK_REQUIRED);
    }
    this._runtimePolicyCheck = check;
  }
  /**
   * Resolve lifecycle adapter for a service type.
   *
   * @param {string} serviceType
   * @return {ServiceTypeAdapter}
   * @private
   */ _resolveAdapter(serviceType) {
    const adapter = this._adapters.get(serviceType);
    if (!adapter) {
      throw new UnknownServiceTypeError(serviceType, this.registeredServiceTypes);
    }
    this._adapterSelectionCountByType.set(
      serviceType,
      (this._adapterSelectionCountByType.get(serviceType) || NUM.ZERO) + NUM.ONE,
    );
    return adapter;
  }
  /**
   * Get the tracked lifecycle state for a replica.
   *
   * @param {Object} serviceContext
   * @return {string}
   */ getReplicaState(serviceContext) {
    const {replicaId} = resolveServiceFields(serviceContext);
    return this._replicaStateById.get(replicaId) || SERVICE_LIFECYCLE_STATE.CREATED;
  }
  /**
   * List registered service types.
   *
   * @return {string[]}
   */ get registeredServiceTypes() {
    return [...this._adapters.keys()];
  }
  /**
   * @return {Object}
   */ getMetrics() {
    return {...this._metrics, byOperation: {...this._metrics.byOperation}};
  }
  /**
   * @param {number} [limit]
   * @return {Object[]}
   */ getRecentOperations(limit = DEFAULT_DIAGNOSTICS_LIMIT) {
    const boundedLimit = Number.isFinite(limit) ?
      Math.max(1, Math.min(MAX_DIAGNOSTICS_LIMIT, Math.floor(limit))) :
      DEFAULT_DIAGNOSTICS_LIMIT;
    return this._recentOperations.slice(-boundedLimit).map((entry) => ({...entry}));
  }
  /**
   * @return {Object}
   */ getAdapterSelectionReport() {
    const adapters = [];
    for (const [serviceType, adapter] of this._adapters.entries()) {
      adapters.push({
        serviceType,
        adapterClass: adapter.constructor?.name || SERVICE_LIFECYCLE_MANAGER_LITERAL.UNKNOWNADAPTER,
        selectionCount: this._adapterSelectionCountByType.get(serviceType) || NUM.ZERO,
      });
    }
    return {adapters};
  }
  /**
   * @param {Object} [options]
   * @param {number} [options.limit]
   * @return {Object}
   */ getDiagnosticsReport(options = {}) {
    return {
      metrics: this.getMetrics(),
      adapterSelections: this.getAdapterSelectionReport(),
      recentOperations: this.getRecentOperations(options.limit),
    };
  }
  /**
   * @param {string} lifecycleOperation
   * @param {Object} serviceContext
   * @param {Object} [context]
   * @param {Object} [extras]
   * @return {Object}
   * @private
   */ _buildLifecycleLogContext(lifecycleOperation, serviceContext, context = {}, extras = {}) {
    const descriptor = serviceContext?.definition || serviceContext || {};
    const serviceId = descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] || null;
    const serviceType = descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] || null;
    const runtimeKind =
      descriptor[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || descriptor.runtime_kind || null;
    const replicaId = descriptor[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] || null;
    return {
      lifecycleOperation,
      serviceId,
      serviceType,
      runtimeKind,
      replicaId,
      operationId: extras.operationId || null,
      traceId: context?.traceId || null,
      nodeId: context?.nodeId || null,
    };
  }
  /**
   * @param {string} lifecycleOperation
   * @param {Object} serviceContext
   * @param {Object} context
   * @param {Object} options
   * @param {string|null} [options.operationId]
   * @param {string} options.status
   * @param {number} options.durationMs
   * @param {Error|null} [options.error]
   * @param {boolean} [options.recovery]
   * @return {void}
   * @private
   */ _recordLifecycleOutcome(lifecycleOperation, serviceContext, context, options) {
    const operationId = options.operationId || null;
    const status = options.status;
    const durationMs = options.durationMs;
    const error = options.error || null;
    const recovery = options.recovery === true;
    const logContext = this._buildLifecycleLogContext(lifecycleOperation, serviceContext, context, {
      operationId,
    });
    this._metrics.operationTotal += NUM.ONE;
    this._metrics.lastOperationDurationMs = durationMs;
    this._metrics.operationLatencyMsTotal += durationMs;
    this._metrics.operationLatencyMsMax = Math.max(this._metrics.operationLatencyMsMax, durationMs);
    const opMetrics = this._metrics.byOperation[lifecycleOperation] || {
      total: 0,
      success: 0,
      failure: 0,
      latencyMsTotal: 0,
      latencyMsMax: 0,
      lastDurationMs: 0,
    };
    opMetrics.total += NUM.ONE;
    opMetrics.lastDurationMs = durationMs;
    opMetrics.latencyMsTotal += durationMs;
    opMetrics.latencyMsMax = Math.max(opMetrics.latencyMsMax, durationMs);
    if (status === SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS) {
      this._metrics.operationSuccess += NUM.ONE;
      opMetrics.success += NUM.ONE;
      this._metrics.lastError = null;
      this._logger.info(
        recovery ? SERVICE_LIFECYCLE_LOG.RECOVERY_SUCCESS : SERVICE_LIFECYCLE_LOG.OPERATION_SUCCESS,
        {...logContext, durationMs},
      );
    } else {
      this._metrics.operationFailure += NUM.ONE;
      opMetrics.failure += NUM.ONE;
      this._metrics.lastError = error ? error.message : null;
      this._logger.error(
        recovery ? SERVICE_LIFECYCLE_LOG.RECOVERY_FAILURE : SERVICE_LIFECYCLE_LOG.OPERATION_FAILURE,
        {...logContext, durationMs, error: error ? error.message : null},
      );
    }
    this._metrics.byOperation[lifecycleOperation] = opMetrics;
    this._recentOperations.push({
      timestamp: Date.now(),
      lifecycleOperation,
      serviceId: logContext.serviceId,
      serviceType: logContext.serviceType,
      runtimeKind: logContext.runtimeKind,
      replicaId: logContext.replicaId,
      operationId,
      durationMs,
      status,
      recovery,
      error: error ? error.message : null,
    });
    if (this._recentOperations.length > MAX_DIAGNOSTICS_LIMIT) {
      this._recentOperations.shift();
    }
  }
  /**
   * Enforce a configured lifecycle transition.
   *
   * @param {string} serviceId
   * @param {string} lifecycleOperation
   * @param {string} fromState
   * @param {string} toState
   * @return {void}
   * @private
   */ _assertTransition(serviceId, lifecycleOperation, fromState, toState) {
    const allowed = SERVICE_LIFECYCLE_TRANSITIONS[fromState] || [];
    if (!allowed.includes(toState)) {
      throw new ServiceLifecycleTransitionError(serviceId, lifecycleOperation, fromState, toState);
    }
  }
  /**
   * Enforce runtime policy checks (fail-closed).
   *
   * @param {string} lifecycleOperation
   * @param {Object} serviceContext
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */ async _enforceRuntimePolicy(lifecycleOperation, serviceContext, context) {
    if (typeof this._runtimePolicyCheck !== TYPEOF.FUNCTION) {
      throw new TypeError(LIFECYCLE_MGR_MSG.RUNTIME_POLICY_CHECK_REQUIRED);
    }
    const {serviceId, serviceType, tenantId, replicaId} = resolveServiceFields(serviceContext);
    try {
      await this._runtimePolicyCheck({
        lifecycleOperation,
        serviceId,
        serviceType,
        tenantId,
        replicaId,
        definition: serviceContext?.definition || serviceContext,
        context,
      });
    } catch (error) {
      throw new ServicePolicyViolationError(
        SERVICE_POLICY_TYPE.RUNTIME,
        lifecycleOperation,
        serviceId,
        error.message,
        {cause: error},
      );
    }
  }
  /**
   * Check whether an idempotency key already has an operation.
   *
   * @param {string} tenantId
   * @param {string} serviceId
   * @param {string} lifecycleOperation
   * @param {string|null} idempotencyKey
   * @return {Promise<Object|null>}
   * @private
   */ async _checkIdempotency(tenantId, serviceId, lifecycleOperation, idempotencyKey) {
    if (!idempotencyKey || !this._idempotencyReader) {
      return null;
    }
    const check = buildIdempotencyCheckSQL(tenantId, idempotencyKey);
    if (!check.success) {
      throw new ServiceIdempotencyCheckError(
        serviceId,
        lifecycleOperation,
        check.errors.join(SERVICE_LIFECYCLE_MANAGER_LITERAL.VALUE),
      );
    }
    try {
      const rows = await this._idempotencyReader(check.sql, check.params);
      if (!rows || rows.length === NUM.ZERO) {
        return null;
      }
      return rows[NUM.ZERO];
    } catch (error) {
      throw new ServiceIdempotencyCheckError(
        serviceId,
        lifecycleOperation,
        `query failed: ${error.message}`,
        {cause: error},
      );
    }
  }
  /**
   * Create a PENDING operation record.
   *
   * @param {string} tenantId
   * @param {string} serviceId
   * @param {string} lifecycleOperation
   * @param {string|null} idempotencyKey
   * @return {Promise<Object|null>}
   * @private
   */ async _journalCreate(tenantId, serviceId, lifecycleOperation, idempotencyKey) {
    if (!this._operationWriter) {
      return null;
    }
    const existing = await this._checkIdempotency(
      tenantId,
      serviceId,
      lifecycleOperation,
      idempotencyKey,
    );
    if (existing) {
      return {
        operationId: existing.operation_id || existing.operationId,
        idempotent: true,
        existing,
      };
    }
    const createResult = createOperation(
      tenantId,
      `${lifecycleOperation}:${serviceId}`,
      idempotencyKey,
    );
    if (!createResult.success) {
      throw new ServiceOperationJournalError(
        serviceId,
        lifecycleOperation,
        createResult.errors.join(SERVICE_LIFECYCLE_MANAGER_LITERAL.VALUE),
      );
    }
    try {
      await this._operationWriter(createResult.sql, createResult.params);
    } catch (error) {
      throw new ServiceOperationJournalError(
        serviceId,
        lifecycleOperation,
        `create failed: ${error.message}`,
        {cause: error},
      );
    }
    return createResult.operation;
  }
  /**
   * Persist an operation transition.
   *
   * @param {Object|null} operation
   * @param {string} serviceId
   * @param {string} lifecycleOperation
   * @param {string} fromState
   * @param {string} toState
   * @param {*} [resultOrError]
   * @return {Promise<void>}
   * @private
   */ async _journalTransition(
    operation,
    serviceId,
    lifecycleOperation,
    fromState,
    toState,
    resultOrError,
  ) {
    if (!operation || !this._operationWriter || operation.idempotent) {
      return;
    }
    const transitionResult = transitionOperation(
      operation.operationId,
      fromState,
      toState,
      resultOrError,
    );
    if (!transitionResult.success) {
      throw new ServiceOperationJournalError(
        serviceId,
        lifecycleOperation,
        transitionResult.errors.join(SERVICE_LIFECYCLE_MANAGER_LITERAL.VALUE),
      );
    }
    try {
      await this._operationWriter(transitionResult.sql, transitionResult.params);
    } catch (error) {
      throw new ServiceOperationJournalError(
        serviceId,
        lifecycleOperation,
        `transition ${fromState}->${toState} failed: ${error.message}`,
        {cause: error},
      );
    }
  }
  /**
   * Read recoverable operation rows from journal storage.
   *
   * @return {Promise<Object[]>}
   * @private
   */ async _readRecoverableOperations() {
    if (!this._recoveryReader) {
      throw new TypeError(LIFECYCLE_MGR_MSG.RECOVERY_READER_REQUIRED);
    }
    const pendingQuery = buildListOperationsSQL(undefined, SERVICE_OPERATION_STATE.PENDING);
    const inProgressQuery = buildListOperationsSQL(undefined, SERVICE_OPERATION_STATE.IN_PROGRESS);
    const [pendingRows, inProgressRows] = await Promise.all([
      this._recoveryReader(pendingQuery.sql, pendingQuery.params),
      this._recoveryReader(inProgressQuery.sql, inProgressQuery.params),
    ]);
    const rows = [...(pendingRows || []), ...(inProgressRows || [])];
    rows.sort((left, right) => {
      const leftCreatedAt = Number(left.created_at ?? left.createdAt ?? 0);
      const rightCreatedAt = Number(right.created_at ?? right.createdAt ?? 0);
      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
      }
      const leftOperationId = left.operation_id || left.operationId || '';
      const rightOperationId = right.operation_id || right.operationId || '';
      return leftOperationId.localeCompare(rightOperationId);
    });
    return rows;
  }
  /**
   * Resume pending and in-progress lifecycle operations from journal state.
   *
   * @param {Object} options
   * @param {Function} options.resolveServiceContext
   * @param {Object} [options.context]
   * @return {Promise<Object[]>}
   */ async recoverPendingOperations(options = {}) {
    return recoverLifecyclePendingOperations(this, options);
  }
  /**
   * Create a service replica via the matching adapter.
   *
   * @param {Object} definition
   * @param {Object} [context]
   * @param {Object} [options]
   * @param {string} [options.idempotencyKey]
   * @return {Promise<Object>}
   */ async createReplica(definition, context = {}, options = {}) {
    return createLifecycleReplica(this, definition, context, options);
  }
  /**
   * Start a service replica via the matching adapter.
   *
   * @param {Object} replicaHandle
   * @param {Object} [context]
   * @param {Object} [options]
   * @param {string} [options.idempotencyKey]
   * @return {Promise<Object>}
   */ async startReplica(replicaHandle, context = {}, options = {}) {
    return startLifecycleReplica(this, replicaHandle, context, options);
  }

  /**
   * Stop a service replica via the matching adapter.
   *
   * @param {Object} replicaHandle
   * @param {Object} [context]
   * @param {Object} [options]
   * @param {string} [options.idempotencyKey]
   * @return {Promise<Object>}
   */
  async stopReplica(replicaHandle, context = {}, options = {}) {
    return stopLifecycleReplica(this, replicaHandle, context, options);
  }

  /**
   * Restart a replica by delegating stop/start to the same adapter.
   *
   * @param {Object} replicaHandle
   * @param {Object} [context]
   * @param {Object} [options]
   * @param {string} [options.idempotencyKey]
   * @return {Promise<Object>}
   */
  async restartReplica(replicaHandle, context = {}, options = {}) {
    return restartLifecycleReplica(this, replicaHandle, context, options);
  }

  /**
   * Query adapter health without mutating lifecycle state.
   *
   * @param {Object} replicaHandle
   * @param {Object} [context]
   * @return {Promise<Object>}
   */
  async health(replicaHandle, context = {}) {
    const {serviceType} = resolveServiceFields(replicaHandle);
    const adapter = this._resolveAdapter(serviceType);
    return adapter.health(replicaHandle, context);
  }
}

export {ServiceLifecycleManager};
