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
  RUNTIME_FIELD,
  LIFECYCLE_OPERATION,
  LIFECYCLE_EVENT,
  OPERATION_JOURNAL_EVENT,
  ENDPOINT_INTENT_FIELD,
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
import {TYPEOF} from '../constants/types.js';
import {
  createOperation,
  transitionOperation,
  buildIdempotencyCheckSQL,
} from '../wasm-service/operation-lifecycle.js';
import {
  validateRuntimeDescriptor,
} from '../wasm-service/runtime-descriptor-validator.js';

/**
 * Resolve the runtime kind string from a service definition object.
 *
 * @param {Object} definition - Service definition.
 * @return {string|undefined} The runtime kind value.
 */
function resolveRuntimeKind(definition) {
  if (!definition || typeof definition !== TYPEOF.OBJECT) {
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
  if (!definition || typeof definition !== TYPEOF.OBJECT) {
    return 'unknown';
  }
  return definition.serviceId ??
    definition.service_id ??
    definition.name ??
    'unknown';
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
  if (!intent || typeof intent !== TYPEOF.OBJECT) {
    return {valid: false, reason: 'endpoint intent must be a non-null object'};
  }
  const port = intent[ENDPOINT_INTENT_FIELD.PORT];
  if (typeof port !== TYPEOF.NUMBER || !Number.isInteger(port) ||
      port < MIN_PORT || port > MAX_PORT) {
    return {
      valid: false,
      reason: `port must be an integer in [${MIN_PORT}, ${MAX_PORT}]`,
    };
  }
  const host = intent[ENDPOINT_INTENT_FIELD.HOST];
  if (host !== undefined && typeof host !== TYPEOF.STRING) {
    return {valid: false, reason: 'host must be a string when provided'};
  }
  const protocol = intent[ENDPOINT_INTENT_FIELD.PROTOCOL];
  if (protocol !== undefined && typeof protocol !== TYPEOF.STRING) {
    return {
      valid: false,
      reason: 'protocol must be a string when provided',
    };
  }
  return {valid: true};
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
        'registry must be an instance of RuntimeDriverRegistry',
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
    if (typeof writer !== TYPEOF.FUNCTION) {
      throw new TypeError(
        'endpoint writer must be a function',
      );
    }
    this._endpointWriter = writer;
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
    if (typeof writer !== TYPEOF.FUNCTION) {
      throw new TypeError(
        'operation writer must be a function',
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
    if (typeof reader !== TYPEOF.FUNCTION) {
      throw new TypeError(
        'idempotency reader must be a function',
      );
    }
    this._idempotencyReader = reader;
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
        result.errors.join('; '),
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
        validation.errors.join('; '),
      );
    }
  }

  /**
   * Prepare runtime artifacts for a service definition.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} context - Preparation context (node info, etc.).
   * @param {Object} [options] - Optional lifecycle options.
   * @param {string} [options.idempotencyKey] - Idempotency key for
   *   deduplication. When provided and a matching operation exists,
   *   returns the original operation identity (Req 11.2).
   * @return {Promise<{status: string, error?: string,
   *   operationId?: string, idempotent?: boolean}>}
   * @throws {LifecycleOrchestrationError} On driver failure.
   */
  async prepare(definition, context, options) {
    const runtimeKind = resolveRuntimeKind(definition);
    const serviceId = resolveServiceId(definition);
    const op = LIFECYCLE_OPERATION.PREPARE;
    const idempotencyKey = options?.idempotencyKey ?? null;

    if (!runtimeKind) {
      throw new LifecycleOrchestrationError(
        op, 'none', serviceId,
        'service definition is missing runtime_kind',
      );
    }
    this._validateRuntimeDescriptor(
      definition, runtimeKind, op, serviceId,
    );

    this.emit(LIFECYCLE_EVENT.PREPARE_START, {
      runtimeKind, serviceId,
    });
    const start = Date.now();
    let operation = null;

    try {
      operation = await this._journalCreate(
        serviceId, runtimeKind, op,
        definition.tenantId, idempotencyKey,
      );

      // Idempotency hit: return existing operation identity
      if (operation && operation.idempotent) {
        const durationMs = Date.now() - start;
        const result = {
          status: operation.existing.state ??
            WASM_OPERATION_STATE.PENDING,
          operationId: operation.operationId,
          idempotent: true,
        };
        this.emit(LIFECYCLE_EVENT.PREPARE_SUCCESS, {
          runtimeKind, serviceId, durationMs, result,
        });
        return result;
      }

      await this._journalTransition(
        operation, serviceId, runtimeKind, op,
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );

      const driver = this._resolveDriver(runtimeKind);
      const result = await driver.prepare(definition, context);
      const durationMs = Date.now() - start;

      await this._journalTransition(
        operation, serviceId, runtimeKind, op,
        WASM_OPERATION_STATE.IN_PROGRESS,
        WASM_OPERATION_STATE.COMPLETED,
        result,
      );

      this.emit(LIFECYCLE_EVENT.PREPARE_SUCCESS, {
        runtimeKind, serviceId, durationMs, result,
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      if (operation && !(err instanceof OperationJournalError) &&
          !(err instanceof IdempotencyCheckError)) {
        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.IN_PROGRESS,
          WASM_OPERATION_STATE.FAILED,
          {message: err.message},
        ).catch(() => {});
      }
      this.emit(LIFECYCLE_EVENT.PREPARE_FAILURE, {
        runtimeKind, serviceId, durationMs, error: err,
      });
      if (err instanceof LifecycleOrchestrationError ||
          err instanceof OperationJournalError ||
          err instanceof IdempotencyCheckError) {
        throw err;
      }
      throw new LifecycleOrchestrationError(
        op, runtimeKind, serviceId, err.message, {cause: err},
      );
    }
  }

  /**
   * Start a service replica.
   *
   * When the driver returns an endpointIntent in its StartResult,
   * this method validates the intent and emits an
   * ENDPOINT_INTENT_RECEIVED event. The lifecycle owner is the
   * single coordinator for endpoint registration — no driver may
   * write endpoint records directly.
   *
   * If an endpointWriter is configured, the validated intent is
   * written through it (SQL/CDC path) and an ENDPOINT_REGISTERED
   * event is emitted. If the write fails, an
   * ENDPOINT_REGISTRATION_FAILED event is emitted and the error
   * is wrapped in a LifecycleOrchestrationError.
   *
   * Requirements: 8.1, 8.2, 8.3, 11.2
   *
   * @param {Object} replicaContext - Replica execution context.
   *   Must include a service definition with runtime_kind.
   * @param {Object} [options] - Optional lifecycle options.
   * @param {string} [options.idempotencyKey] - Idempotency key for
   *   deduplication (Req 11.2).
   * @return {Promise<{status: string, endpointIntent?: Object,
   *   error?: string, operationId?: string, idempotent?: boolean}>}
   * @throws {LifecycleOrchestrationError} On driver failure.
   * @throws {EndpointIntentError} On invalid endpoint intent.
   */
  async start(replicaContext, options) {
    const definition = replicaContext?.definition ?? replicaContext;
    const runtimeKind = resolveRuntimeKind(definition);
    const serviceId = resolveServiceId(definition);
    const op = LIFECYCLE_OPERATION.START;
    const idempotencyKey = options?.idempotencyKey ?? null;

    if (!runtimeKind) {
      throw new LifecycleOrchestrationError(
        op, 'none', serviceId,
        'replica context is missing runtime_kind',
      );
    }
    this._validateRuntimeDescriptor(
      definition, runtimeKind, op, serviceId,
    );

    this.emit(LIFECYCLE_EVENT.START_START, {
      runtimeKind, serviceId,
    });
    const start = Date.now();
    let operation = null;

    try {
      operation = await this._journalCreate(
        serviceId, runtimeKind, op,
        definition.tenantId, idempotencyKey,
      );

      // Idempotency hit: return existing operation identity
      if (operation && operation.idempotent) {
        const durationMs = Date.now() - start;
        const result = {
          status: operation.existing.state ??
            WASM_OPERATION_STATE.PENDING,
          operationId: operation.operationId,
          idempotent: true,
        };
        this.emit(LIFECYCLE_EVENT.START_SUCCESS, {
          runtimeKind, serviceId, durationMs, result,
        });
        return result;
      }

      await this._journalTransition(
        operation, serviceId, runtimeKind, op,
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );

      const driver = this._resolveDriver(runtimeKind);
      const result = await driver.start(replicaContext);
      const durationMs = Date.now() - start;

      // --- Endpoint intent single-write-path handling ---
      if (result && result.endpointIntent) {
        const validation = validateEndpointIntent(
          result.endpointIntent,
        );
        if (!validation.valid) {
          throw new EndpointIntentError(
            runtimeKind, serviceId, validation.reason,
          );
        }
        this.emit(LIFECYCLE_EVENT.ENDPOINT_INTENT_RECEIVED, {
          runtimeKind, serviceId, endpointIntent: result.endpointIntent,
        });

        if (this._endpointWriter) {
          try {
            await this._endpointWriter(
              serviceId, runtimeKind, result.endpointIntent,
            );
            this.emit(LIFECYCLE_EVENT.ENDPOINT_REGISTERED, {
              runtimeKind, serviceId,
              endpointIntent: result.endpointIntent,
            });
          } catch (writeErr) {
            this.emit(LIFECYCLE_EVENT.ENDPOINT_REGISTRATION_FAILED, {
              runtimeKind, serviceId, error: writeErr,
            });
            throw new LifecycleOrchestrationError(
              op, runtimeKind, serviceId,
              `endpoint registration failed: ${writeErr.message}`,
              {cause: writeErr},
            );
          }
        }
      }

      await this._journalTransition(
        operation, serviceId, runtimeKind, op,
        WASM_OPERATION_STATE.IN_PROGRESS,
        WASM_OPERATION_STATE.COMPLETED,
        result,
      );

      this.emit(LIFECYCLE_EVENT.START_SUCCESS, {
        runtimeKind, serviceId, durationMs, result,
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      if (operation && !(err instanceof OperationJournalError) &&
          !(err instanceof IdempotencyCheckError)) {
        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.IN_PROGRESS,
          WASM_OPERATION_STATE.FAILED,
          {message: err.message},
        ).catch(() => {});
      }
      this.emit(LIFECYCLE_EVENT.START_FAILURE, {
        runtimeKind, serviceId, durationMs, error: err,
      });
      if (err instanceof LifecycleOrchestrationError ||
          err instanceof EndpointIntentError ||
          err instanceof OperationJournalError ||
          err instanceof IdempotencyCheckError) {
        throw err;
      }
      throw new LifecycleOrchestrationError(
        op, runtimeKind, serviceId, err.message, {cause: err},
      );
    }
  }

  /**
   * Stop a service replica.
   *
   * @param {Object} replicaContext - Replica execution context.
   * @param {Object} [options] - Optional lifecycle options.
   * @param {string} [options.idempotencyKey] - Idempotency key for
   *   deduplication (Req 11.2).
   * @return {Promise<void|{operationId: string, idempotent: true}>}
   * @throws {LifecycleOrchestrationError} On driver failure.
   */
  async stop(replicaContext, options) {
    const definition = replicaContext?.definition ?? replicaContext;
    const runtimeKind = resolveRuntimeKind(definition);
    const serviceId = resolveServiceId(definition);
    const op = LIFECYCLE_OPERATION.STOP;
    const idempotencyKey = options?.idempotencyKey ?? null;

    if (!runtimeKind) {
      throw new LifecycleOrchestrationError(
        op, 'none', serviceId,
        'replica context is missing runtime_kind',
      );
    }
    this._validateRuntimeDescriptor(
      definition, runtimeKind, op, serviceId,
    );

    this.emit(LIFECYCLE_EVENT.STOP_START, {
      runtimeKind, serviceId,
    });
    const start = Date.now();
    let operation = null;

    try {
      operation = await this._journalCreate(
        serviceId, runtimeKind, op,
        definition.tenantId, idempotencyKey,
      );

      // Idempotency hit: return existing operation identity
      if (operation && operation.idempotent) {
        const durationMs = Date.now() - start;
        this.emit(LIFECYCLE_EVENT.STOP_SUCCESS, {
          runtimeKind, serviceId, durationMs,
        });
        return {
          operationId: operation.operationId,
          idempotent: true,
        };
      }

      await this._journalTransition(
        operation, serviceId, runtimeKind, op,
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );

      const driver = this._resolveDriver(runtimeKind);
      await driver.stop(replicaContext);
      const durationMs = Date.now() - start;

      await this._journalTransition(
        operation, serviceId, runtimeKind, op,
        WASM_OPERATION_STATE.IN_PROGRESS,
        WASM_OPERATION_STATE.COMPLETED,
      );

      this.emit(LIFECYCLE_EVENT.STOP_SUCCESS, {
        runtimeKind, serviceId, durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      if (operation && !(err instanceof OperationJournalError) &&
          !(err instanceof IdempotencyCheckError)) {
        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.IN_PROGRESS,
          WASM_OPERATION_STATE.FAILED,
          {message: err.message},
        ).catch(() => {});
      }
      this.emit(LIFECYCLE_EVENT.STOP_FAILURE, {
        runtimeKind, serviceId, durationMs, error: err,
      });
      if (err instanceof LifecycleOrchestrationError ||
          err instanceof OperationJournalError ||
          err instanceof IdempotencyCheckError) {
        throw err;
      }
      throw new LifecycleOrchestrationError(
        op, runtimeKind, serviceId, err.message, {cause: err},
      );
    }
  }

  /**
   * Check health of a service replica.
   *
   * @param {Object} replicaContext - Replica execution context.
   * @return {Promise<{status: string, detail?: string}>}
   * @throws {LifecycleOrchestrationError} On driver failure.
   */
  async health(replicaContext) {
    const definition = replicaContext?.definition ?? replicaContext;
    const runtimeKind = resolveRuntimeKind(definition);
    const serviceId = resolveServiceId(definition);
    const op = LIFECYCLE_OPERATION.HEALTH;

    if (!runtimeKind) {
      throw new LifecycleOrchestrationError(
        op, 'none', serviceId,
        'replica context is missing runtime_kind',
      );
    }
    this._validateRuntimeDescriptor(
      definition, runtimeKind, op, serviceId,
    );

    this.emit(LIFECYCLE_EVENT.HEALTH_CHECK, {
      runtimeKind, serviceId,
    });
    const start = Date.now();

    try {
      const driver = this._resolveDriver(runtimeKind);
      const result = await driver.health(replicaContext);
      const durationMs = Date.now() - start;
      this.emit(LIFECYCLE_EVENT.HEALTH_RESULT, {
        runtimeKind, serviceId, durationMs, result,
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      this.emit(LIFECYCLE_EVENT.HEALTH_RESULT, {
        runtimeKind, serviceId, durationMs, error: err,
      });
      if (err instanceof LifecycleOrchestrationError) {
        throw err;
      }
      throw new LifecycleOrchestrationError(
        op, runtimeKind, serviceId, err.message, {cause: err},
      );
    }
  }
}

export {ServiceRuntimeLifecycle, validateEndpointIntent};
