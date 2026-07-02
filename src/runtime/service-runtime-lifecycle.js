/**
 * Service_Runtime_Lifecycle — the single lifecycle orchestrator for
 * all replicated service runtimes.
 *
 * Responsibilities:
 *   1. Resolve runtime kind -> driver (via RuntimeDriverRegistry).
 *   2. Execute prepare/start/stop/health with shared semantics.
 *   3. Coordinate endpoint registration through one write path.
 *   4. Coordinate operation journaling transitions.
 *   5. Emit structured lifecycle telemetry with runtime dimensions.
 *
 * Endpoint registration contract (Requirements: 8.1, 8.2, 8.3):
 *   Drivers return an optional endpointIntent from start().
 *   This class is the ONLY component that validates the intent and
 *   coordinates the write through the SQL/CDC path. No driver may
 *   write to service_endpoints or any system table directly.
 *
 * Operation journaling contract (Requirements: 6.4, 11.1, 11.3):
 *   Mutating lifecycle operations (prepare, start, stop) create
 *   operation records through the existing operation lifecycle
 *   module. The lifecycle owner coordinates all state transitions:
 *   PENDING -> IN_PROGRESS -> terminal (COMPLETED/FAILED).
 *   Drivers must NOT maintain ad-hoc mutation state.
 *   All writes go through the operationWriter callback (SQL/CDC).
 *
 * This component is runtime-kind-agnostic. It delegates all
 * runtime-specific behavior to drivers resolved through the
 * registry. No per-kind lifecycle branching exists here.
 *
 * NO-DUPLICATION CONTRACT (Requirements: 1.3, 1.5):
 *   There must be exactly ONE lifecycle orchestrator for replicated
 *   services. No parallel lifecycle system per runtime kind is
 *   allowed. All lifecycle calls flow through this class.
 *
 * @module runtime/service-runtime-lifecycle
 */

import {EventEmitter} from 'node:events';
import {RuntimeDriverRegistry} from './runtime-driver-registry.js';
import {
  createServiceRuntimeLifecycleOperationMethods,
} from './service-runtime-lifecycle-operation-methods.js';
import {
  RUNTIME_FIELD,
  LIFECYCLE_OPERATION,
  LIFECYCLE_EVENT,
  OPERATION_JOURNAL_EVENT,
  ENDPOINT_INTENT_FIELD,
  STATE_PROJECTION_EVENT,
  QUERY_EXECUTOR_FACTORY_EVENT,
  RUNTIME_REPLICA_STATUS,
  MIN_PORT,
  MAX_PORT,
} from '../constants/runtime.js';
import {WASM_OPERATION_STATE} from '../constants/wasm-meta.js';
import {
  LifecycleOrchestrationError,
  EndpointIntentError,
  OperationJournalError,
  IdempotencyCheckError,
} from './runtime-driver-errors.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {
  createOperation,
  transitionOperation,
  buildIdempotencyCheckSQL,
} from '../wasm-service/operation-lifecycle.js';
import {
  validateRuntimeDescriptor,
} from '../wasm-service/runtime-descriptor-validator.js';
import {getOrCreateCauseId, normalizeCauseId} from '../utils/cause-id.js';

const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_STR_REGISTRY_MUST_BE_AN_INSTANCE_OF_RUNTIMED = 'registry must be an instance of RuntimeDriverRegistry';
const LOCAL_STR_QUERY_EXECUTOR_FACTORY_MUST_BE_A_FUNCTIO = 'query executor factory must be a function';
const LOCAL_STR_ENDPOINT_WRITER_MUST_BE_A_FUNCTION = 'endpoint writer must be a function';
const LOCAL_STR_ENDPOINT_REMOVER_MUST_BE_A_FUNCTION = 'endpoint remover must be a function';
const LOCAL_STR_OPERATION_WRITER_MUST_BE_A_FUNCTION = 'operation writer must be a function';
const LOCAL_STR_IDEMPOTENCY_READER_MUST_BE_A_FUNCTION = 'idempotency reader must be a function';
const LOCAL_STR_STATE_PROJECTION_WRITER_MUST_BE_A_FUNCTI = 'state projection writer must be a function';
const LOCAL_STR_SEMI_SPACE = '; ';
const LOCAL_STR_NONE = 'none';
const LOCAL_STR_17O4M = 'service definition is missing runtime_kind';
const LOCAL_STR_VUZ91 = 'replica context is missing runtime_kind';

/**
 * Resolve the runtime kind string from a service definition object.
 *
 * @param {Object} definition - Service definition.
 * @return {string|undefined} The runtime kind value.
 */
function resolveRuntimeKind(definition) {
  if (!definition || typeof definition !== 'object') {
    return undefined;
  }
  return definition[RUNTIME_FIELD.RUNTIME_KIND] ??
    definition.runtimeKind;
}

/**
 * Resolve a service identifier for diagnostics/telemetry.
 *
 * @param {Object} definition - Service definition or replica context.
 * @return {string} Service identifier or 'unknown'.
 */
function resolveServiceId(definition) {
  if (!definition || typeof definition !== 'object') {
    return LOCAL_STR_UNKNOWN;
  }
  return definition.serviceId ??
    definition.service_id ??
    definition.name ??
    LOCAL_STR_UNKNOWN;
}

/**
 * Validate an endpoint intent returned by a driver's start().
 *
 * A valid endpoint intent must have a numeric port in [1, 65535].
 * Host and protocol are optional strings.
 *
 * @param {Object} intent - The endpoint intent object.
 * @return {{valid: boolean, reason?: string}}
 */
function validateEndpointIntent(intent) {
  const port = intent?.[ENDPOINT_INTENT_FIELD.PORT];
  const host = intent?.[ENDPOINT_INTENT_FIELD.HOST];
  const protocol = intent?.[ENDPOINT_INTENT_FIELD.PROTOCOL];
  const invalidReason =
    !intent || typeof intent !== 'object' ?
      'endpoint intent must be a non-null object' :
      typeof port !== 'number' ||
        !Number.isInteger(port) ||
        port < MIN_PORT ||
        port > MAX_PORT ?
        `port must be an integer in [${MIN_PORT}, ${MAX_PORT}]` :
        host !== undefined && typeof host !== 'string' ?
          'host must be a string when provided' :
          protocol !== undefined && typeof protocol !== 'string' ?
            'protocol must be a string when provided' :
            '';

  return invalidReason ?
    {valid: false, reason: invalidReason} :
    {valid: true};
}

/**
 * ServiceRuntimeLifecycle — unified lifecycle owner for all
 * replicated service runtimes.
 *
 * Emits lifecycle telemetry events with runtime dimensions
 * (runtime kind, service id, operation, duration).
 *
 * @extends EventEmitter
 */
class ServiceRuntimeLifecycle extends EventEmitter {
  /**
   * @param {RuntimeDriverRegistry} registry - The driver registry.
   * @throws {TypeError} If registry is not a RuntimeDriverRegistry.
   */
  constructor(registry) {
    super();
    if (!(registry instanceof RuntimeDriverRegistry)) {
      throw new TypeError(
        LOCAL_STR_REGISTRY_MUST_BE_AN_INSTANCE_OF_RUNTIMED,
      );
    }
    /** @type {RuntimeDriverRegistry} */
    this._registry = registry;

    /**
     * Optional endpoint writer callback for the SQL/CDC write path.
     * When set, validated endpoint intents are written through this
     * function. This is the single endpoint registration coordinator.
     *
     * Signature: (serviceId, runtimeKind, endpointIntent) => Promise
     *
     * @type {Function|null}
     * @private
     */
    this._endpointWriter = null;

    /**
     * Optional endpoint remover callback for the SQL/CDC write path.
     * When set, endpoint rows are removed or marked unhealthy during
     * stop and failure transitions. This is the single endpoint
     * cleanup coordinator.
     *
     * Signature: (serviceId, nodeId) => Promise
     *
     * Requirements: 6.4
     *
     * @type {Function|null}
     * @private
     */
    this._endpointRemover = null;

    /**
     * Optional operation journal writer callback for SQL/CDC path.
     * When set, operation create/transition SQL is written through
     * this function. The lifecycle owner coordinates all operation
     * state transitions — drivers must NOT maintain ad-hoc state.
     *
     * Signature: (sql, params) => Promise
     *
     * Requirements: 6.4, 11.1, 11.3
     *
     * @type {Function|null}
     * @private
     */
    this._operationWriter = null;

    /**
     * Optional idempotency reader callback for SQL/CDC path.
     * When set, idempotency checks query for existing operations
     * through this function before creating new ones.
     * Reuses buildIdempotencyCheckSQL from operation-lifecycle.js.
     *
     * Signature: (sql, params) => Promise<Array<Object>>
     *   Returns rows matching the idempotency key query.
     *
     * Requirements: 11.2
     *
     * @type {Function|null}
     * @private
     */
    this._idempotencyReader = null;

    /**
     * Optional state projection writer for the SQL/CDC write path.
     * When set, lifecycle transitions project replica state into
     * the `services` table so runtime-service replicas are visible
     * in admin replica views.
     *
     * Signature:
     *   (serviceId, stateRow) => Promise
     *
     * `stateRow` is an object with services-table column values:
     *   { service_type, node_id, status, address, created_at,
     *     updated_at, ... }
     *
     * On first projection (prepare/create), the writer inserts.
     * On subsequent transitions, the writer updates.
     *
     * Requirements: 5.1, 5.2, 5.4, 13.1
     *
     * @type {Function|null}
     * @private
     */
    this._stateProjectionWriter = null;

    /**
     * Optional query executor factory for injecting table query
     * capability into service replicas during start().
     *
     * When set, the lifecycle owner creates a service-scoped
     * query executor and attaches it to the replicaContext before
     * delegating to the driver. This is the single injection
     * point for service-to-table query access.
     *
     * Signature: (serviceId) => async (sql, params) => result
     *
     * The factory is owned by SqlQueryEngine and produces closures
     * that route through the standard query execution path.
     *
     * @type {Function|null}
     * @private
     */
    this._queryExecutorFactory = null;
  }

  /**
   * Set the query executor factory for service replica table access.
   *
   * The factory receives a serviceId and returns a scoped query
   * executor function. The lifecycle owner injects the executor
   * into replicaContext during start() so drivers and lifecycle
   * modules can query tables through the standard SQL path.
   *
   * @param {Function} factory - (serviceId) => queryExecutorFn.
   * @throws {TypeError} If factory is not a function.
   */
  setQueryExecutorFactory(factory) {
    if (typeof factory !== 'function') {
      throw new TypeError(
        LOCAL_STR_QUERY_EXECUTOR_FACTORY_MUST_BE_A_FUNCTIO,
      );
    }
    this._queryExecutorFactory = factory;
    this.emit(QUERY_EXECUTOR_FACTORY_EVENT.FACTORY_SET, {});
  }

  /**
   * Set the endpoint writer callback for the SQL/CDC write path.
   *
   * This is the single registration coordinator for endpoint
   * intents returned by drivers. No driver may write endpoint
   * records directly — all writes flow through this callback.
   *
   * Requirements: 8.1, 8.3
   *
   * @param {Function} writer - Async callback
   *   (serviceId, runtimeKind, endpointIntent) => Promise.
   * @throws {TypeError} If writer is not a function.
   */
  setEndpointWriter(writer) {
    if (typeof writer !== 'function') {
      throw new TypeError(
        LOCAL_STR_ENDPOINT_WRITER_MUST_BE_A_FUNCTION,
      );
    }
    this._endpointWriter = writer;
  }

  /**
   * Set the endpoint remover callback for the SQL/CDC write path.
   *
   * This is the single cleanup coordinator for endpoint rows
   * during stop and failure transitions. No driver or external
   * component may remove endpoint records directly.
   *
   * Requirements: 6.4
   *
   * @param {Function} remover - Async callback
   *   (serviceId, nodeId) => Promise.
   * @throws {TypeError} If remover is not a function.
   */
  setEndpointRemover(remover) {
    if (typeof remover !== 'function') {
      throw new TypeError(
        LOCAL_STR_ENDPOINT_REMOVER_MUST_BE_A_FUNCTION,
      );
    }
    this._endpointRemover = remover;
  }

  /**
   * Set the operation journal writer callback for SQL/CDC path.
   *
   * This is the single coordinator for operation record writes.
   * The lifecycle owner calls createOperation/transitionOperation
   * from the existing operation lifecycle module and persists the
   * resulting SQL through this callback. Drivers must NOT maintain
   * ad-hoc mutation state.
   *
   * Requirements: 6.4, 11.1, 11.3
   *
   * @param {Function} writer - Async callback (sql, params) => Promise.
   * @throws {TypeError} If writer is not a function.
   */
  setOperationWriter(writer) {
    if (typeof writer !== 'function') {
      throw new TypeError(
        LOCAL_STR_OPERATION_WRITER_MUST_BE_A_FUNCTION,
      );
    }
    this._operationWriter = writer;
  }

  /**
   * Set the idempotency reader callback for SQL/CDC path.
   *
   * When set, lifecycle operations with an idempotency key will
   * check for existing operations before creating new ones.
   * Duplicate idempotency keys return the original operation
   * identity instead of creating a new operation.
   *
   * Reuses buildIdempotencyCheckSQL from the existing operation
   * lifecycle module — no duplicate idempotency logic.
   *
   * Requirements: 11.2
   *
   * @param {Function} reader - Async callback
   *   (sql, params) => Promise<Array<Object>>.
   * @throws {TypeError} If reader is not a function.
   */
  setIdempotencyReader(reader) {
    if (typeof reader !== 'function') {
      throw new TypeError(
        LOCAL_STR_IDEMPOTENCY_READER_MUST_BE_A_FUNCTION,
      );
    }
    this._idempotencyReader = reader;
  }

  /**
   * Set the state projection writer for the SQL/CDC write path.
   *
   * This is the single coordinator for projecting runtime replica
   * lifecycle state into the `services` table. No driver or
   * external component may write services rows directly.
   *
   * Requirements: 5.1, 5.2, 5.4, 13.1
   *
   * @param {Function} writer - Async callback
   *   (serviceId, stateRow) => Promise.
   * @throws {TypeError} If writer is not a function.
   */
  setStateProjectionWriter(writer) {
    if (typeof writer !== 'function') {
      throw new TypeError(
        LOCAL_STR_STATE_PROJECTION_WRITER_MUST_BE_A_FUNCTI,
      );
    }
    this._stateProjectionWriter = writer;
  }

  /**
   * Project runtime replica state into the `services` table.
   *
   * Builds a row object with the required services-table columns
   * and delegates the write to the configured state projection
   * writer. Failures are emitted as events but do not block the
   * lifecycle operation — the projection is best-effort so that
   * a transient CDC/SQL failure does not prevent replica startup.
   *
   * Requirements: 5.1, 5.2, 5.4, 13.1
   *
   * @param {string} serviceId - Replica service identifier.
   * @param {Object} definition - Service definition or context.
   * @param {string} status - Target status value for the row.
   * @param {Object} [extras] - Additional column values.
   * @return {Promise<void>}
   * @private
   */
  async _projectReplicaState(
    serviceId, definition, status, extras, context,
  ) {
    if (!this._stateProjectionWriter) {
      return;
    }
    const now = Date.now();
    const nodeId = definition?.nodeId ??
      definition?.node_id ?? null;
    const serviceType = definition?.serviceType ??
      definition?.service_type ??
      UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
    const address = definition?.address ?? null;
    const stateRow = {
      service_type: serviceType,
      node_id: nodeId,
      status,
      address,
      updated_at: now,
      ...extras,
    };
    const causeId = normalizeCauseId(context?.causeId);
    try {
      await this._stateProjectionWriter(serviceId, stateRow, {causeId});
      this.emit(STATE_PROJECTION_EVENT.STATE_PROJECTED, {
        serviceId, status, nodeId, causeId,
      });
    } catch (err) {
      this.emit(STATE_PROJECTION_EVENT.STATE_PROJECTION_FAILED, {
        serviceId, status, nodeId, causeId, error: err,
      });
    }
  }

  /**
   * Remove or clean up endpoint rows during stop/failure.
   *
   * Delegates to the configured endpoint remover callback.
   * Failures are emitted as events but do not block the
   * lifecycle operation — cleanup is best-effort so that a
   * transient SQL/CDC failure does not prevent replica shutdown.
   *
   * Requirements: 6.4
   *
   * @param {string} serviceId - Replica service identifier.
   * @param {Object} definition - Service definition or context.
   * @return {Promise<void>}
   * @private
   */
  async _removeEndpoint(serviceId, definition) {
    if (!this._endpointRemover) {
      return;
    }
    const nodeId = definition?.nodeId ??
      definition?.node_id ?? null;
    try {
      await this._endpointRemover(serviceId, nodeId);
      this.emit(LIFECYCLE_EVENT.ENDPOINT_REMOVED, {
        serviceId, nodeId,
      });
    } catch (err) {
      this.emit(LIFECYCLE_EVENT.ENDPOINT_REMOVAL_FAILED, {
        serviceId, nodeId, error: err,
      });
    }
  }

  /**
   * Check for an existing operation with the same idempotency key.
   * Returns the existing operation if found, null otherwise.
   *
   * Uses buildIdempotencyCheckSQL from the existing operation
   * lifecycle module (no duplication).
   *
   * Requirements: 11.2
   *
   * @param {string} tenantId - Tenant identifier.
   * @param {string} idempotencyKey - The idempotency key to check.
   * @param {string} runtimeKind - Runtime kind (for error context).
   * @param {string} serviceId - Service id (for error context).
   * @return {Promise<Object|null>} Existing operation or null.
   * @private
   */
  async _checkIdempotency(
    tenantId, idempotencyKey, runtimeKind, serviceId,
  ) {
    if (!this._idempotencyReader || !idempotencyKey) {
      return null;
    }
    const check = buildIdempotencyCheckSQL(tenantId, idempotencyKey);
    if (!check.success) {
      return null;
    }
    try {
      const rows = await this._idempotencyReader(
        check.sql, check.params,
      );
      if (rows && rows.length > 0) {
        return rows[0];
      }
      return null;
    } catch (err) {
      throw new IdempotencyCheckError(
        runtimeKind, serviceId,
        `query failed: ${err.message}`,
        {cause: err},
      );
    }
  }

  /**
   * Create a PENDING operation record and persist it via the
   * operation writer. Returns the operation object on success,
   * or null if no writer is configured.
   *
   * @param {string} serviceId - Service identifier.
   * @param {string} runtimeKind - Runtime kind.
   * @param {string} command - Lifecycle command name.
   * @param {string|null} [tenantId] - Tenant identifier.
   * @param {string|null} [idempotencyKey] - Idempotency key.
   * @return {Promise<Object|null>} The created operation or null.
   * @private
   */
  async _journalCreate(
    serviceId, runtimeKind, command, tenantId, idempotencyKey,
  ) {
    if (!this._operationWriter) {
      return null;
    }
    const tenantValue = tenantId || serviceId;

    // Idempotency check: return existing operation if found
    if (idempotencyKey) {
      const existing = await this._checkIdempotency(
        tenantValue, idempotencyKey, runtimeKind, serviceId,
      );
      if (existing) {
        this.emit(OPERATION_JOURNAL_EVENT.IDEMPOTENCY_HIT, {
          runtimeKind, serviceId, command, idempotencyKey,
          existingOperationId: existing.operation_id ??
            existing.operationId,
          existingState: existing.state,
        });
        return {
          operationId: existing.operation_id ??
            existing.operationId,
          idempotent: true,
          existing,
        };
      }
    }

    const result = createOperation(tenantValue, command, idempotencyKey);
    if (!result.success) {
      throw new OperationJournalError(
        runtimeKind, serviceId, command,
        result.errors.join(LOCAL_STR_SEMI_SPACE),
      );
    }
    try {
      await this._operationWriter(result.sql, result.params);
    } catch (err) {
      throw new OperationJournalError(
        runtimeKind, serviceId, command,
        `create failed: ${err.message}`,
        {cause: err},
      );
    }
    this.emit(OPERATION_JOURNAL_EVENT.OPERATION_CREATED, {
      runtimeKind, serviceId, command,
      operationId: result.operation.operationId,
      state: WASM_OPERATION_STATE.PENDING,
    });
    return result.operation;
  }

  /**
   * Transition an operation record and persist it via the
   * operation writer. No-op if no writer is configured or
   * operation is null.
   *
   * @param {Object|null} operation - The operation object.
   * @param {string} serviceId - Service identifier.
   * @param {string} runtimeKind - Runtime kind.
   * @param {string} command - Lifecycle command name.
   * @param {string} fromState - Current state.
   * @param {string} toState - Target state.
   * @param {*} [resultOrError] - Result or error payload.
   * @return {Promise<void>}
   * @private
   */
  async _journalTransition(
    operation, serviceId, runtimeKind, command,
    fromState, toState, resultOrError,
  ) {
    if (!this._operationWriter || !operation) {
      return;
    }
    // Skip transitions for idempotent (already-existing) operations
    if (operation.idempotent) {
      return;
    }
    const result = transitionOperation(
      operation.operationId, fromState, toState, resultOrError,
    );
    if (!result.success) {
      const err = new OperationJournalError(
        runtimeKind, serviceId, command,
        result.errors.join('; '),
      );
      this.emit(OPERATION_JOURNAL_EVENT.OPERATION_JOURNAL_FAILED, {
        runtimeKind, serviceId, command,
        operationId: operation.operationId,
        fromState, toState, error: err,
      });
      throw err;
    }
    try {
      await this._operationWriter(result.sql, result.params);
    } catch (err) {
      const journalErr = new OperationJournalError(
        runtimeKind, serviceId, command,
        `transition ${fromState}->${toState} failed: ${err.message}`,
        {cause: err},
      );
      this.emit(OPERATION_JOURNAL_EVENT.OPERATION_JOURNAL_FAILED, {
        runtimeKind, serviceId, command,
        operationId: operation.operationId,
        fromState, toState, error: journalErr,
      });
      throw journalErr;
    }
    this.emit(OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED, {
      runtimeKind, serviceId, command,
      operationId: operation.operationId,
      fromState, toState,
    });
  }

  /**
   * Resolve the driver for a runtime kind via the registry.
   * Fail-closed: unknown kinds propagate UnknownRuntimeKindError.
   *
   * @param {string} runtimeKind - The runtime kind to resolve.
   * @return {import('./runtime-driver.js').RuntimeDriver}
   */
  _resolveDriver(runtimeKind) {
    return this._registry.getDriver(runtimeKind);
  }

  /**
   * Validate runtime descriptor before lifecycle operations.
   *
   * @param {Object} definition - Service definition.
   * @param {string} runtimeKind - Runtime kind.
   * @param {string} operation - Lifecycle operation name.
   * @param {string} serviceId - Service identifier.
   * @private
   */
  _validateRuntimeDescriptor(
    definition, runtimeKind, operation, serviceId,
  ) {
    const validation = validateRuntimeDescriptor({
      runtimeKind,
      runtimeRef: definition?.runtime_ref ??
        definition?.runtimeRef ??
        null,
      runtimeConfig: definition?.runtime_config ??
        definition?.runtimeConfig ??
        null,
    });
    if (!validation.valid) {
      throw new LifecycleOrchestrationError(
        operation,
        runtimeKind,
        serviceId,
        validation.errors.join(LOCAL_STR_SEMI_SPACE),
      );
    }
  }
}

Object.defineProperties(
  ServiceRuntimeLifecycle.prototype,
  createServiceRuntimeLifecycleOperationMethods({
    ENDPOINT_INTENT_FIELD,
    EndpointIntentError,
    IdempotencyCheckError,
    LIFECYCLE_EVENT,
    LIFECYCLE_OPERATION,
    LifecycleOrchestrationError,
    LOCAL_STR_17O4M,
    LOCAL_STR_NONE,
    LOCAL_STR_VUZ91,
    OperationJournalError,
    QUERY_EXECUTOR_FACTORY_EVENT,
    RUNTIME_REPLICA_STATUS,
    WASM_OPERATION_STATE,
    getOrCreateCauseId,
    resolveRuntimeKind,
    resolveServiceId,
    validateEndpointIntent,
  }),
);

export {ServiceRuntimeLifecycle, validateEndpointIntent};
