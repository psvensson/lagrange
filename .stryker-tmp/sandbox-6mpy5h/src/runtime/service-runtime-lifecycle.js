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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'node:events';
import { RuntimeDriverRegistry } from './runtime-driver-registry.js';
import { RUNTIME_FIELD, LIFECYCLE_OPERATION, LIFECYCLE_EVENT, OPERATION_JOURNAL_EVENT, ENDPOINT_INTENT_FIELD, STATE_PROJECTION_EVENT, QUERY_EXECUTOR_FACTORY_EVENT, RUNTIME_REPLICA_STATUS, MIN_PORT, MAX_PORT } from '../constants/runtime.js';
import { WASM_OPERATION_STATE } from '../constants/wasm-meta.js';
import { LifecycleOrchestrationError, EndpointIntentError, OperationJournalError, IdempotencyCheckError } from './runtime-driver-errors.js';
import { TYPEOF } from '../constants/types.js';
import { UNIFIED_SERVICE_TYPE } from '../constants/unified-service-lifecycle.js';
import { createOperation, transitionOperation, buildIdempotencyCheckSQL } from '../wasm-service/operation-lifecycle.js';
import { validateRuntimeDescriptor } from '../wasm-service/runtime-descriptor-validator.js';
import { getOrCreateCauseId, normalizeCauseId } from '../utils/cause-id.js';

/**
 * Resolve the runtime kind string from a service definition object.
 *
 * @param {Object} definition - Service definition.
 * @return {string|undefined} The runtime kind value.
 */
function resolveRuntimeKind(definition) {
  if (stryMutAct_9fa48("148860")) {
    {}
  } else {
    stryCov_9fa48("148860");
    if (stryMutAct_9fa48("148863") ? !definition && typeof definition !== TYPEOF.OBJECT : stryMutAct_9fa48("148862") ? false : stryMutAct_9fa48("148861") ? true : (stryCov_9fa48("148861", "148862", "148863"), (stryMutAct_9fa48("148864") ? definition : (stryCov_9fa48("148864"), !definition)) || (stryMutAct_9fa48("148866") ? typeof definition === TYPEOF.OBJECT : stryMutAct_9fa48("148865") ? false : (stryCov_9fa48("148865", "148866"), typeof definition !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("148867")) {
        {}
      } else {
        stryCov_9fa48("148867");
        return undefined;
      }
    }
    return stryMutAct_9fa48("148868") ? definition[RUNTIME_FIELD.RUNTIME_KIND] && definition.runtimeKind : (stryCov_9fa48("148868"), definition[RUNTIME_FIELD.RUNTIME_KIND] ?? definition.runtimeKind);
  }
}

/**
 * Resolve a service identifier for diagnostics/telemetry.
 *
 * @param {Object} definition - Service definition or replica context.
 * @return {string} Service identifier or 'unknown'.
 */
function resolveServiceId(definition) {
  if (stryMutAct_9fa48("148869")) {
    {}
  } else {
    stryCov_9fa48("148869");
    if (stryMutAct_9fa48("148872") ? !definition && typeof definition !== TYPEOF.OBJECT : stryMutAct_9fa48("148871") ? false : stryMutAct_9fa48("148870") ? true : (stryCov_9fa48("148870", "148871", "148872"), (stryMutAct_9fa48("148873") ? definition : (stryCov_9fa48("148873"), !definition)) || (stryMutAct_9fa48("148875") ? typeof definition === TYPEOF.OBJECT : stryMutAct_9fa48("148874") ? false : (stryCov_9fa48("148874", "148875"), typeof definition !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("148876")) {
        {}
      } else {
        stryCov_9fa48("148876");
        return stryMutAct_9fa48("148877") ? "" : (stryCov_9fa48("148877"), 'unknown');
      }
    }
    return stryMutAct_9fa48("148878") ? (definition.serviceId ?? definition.service_id ?? definition.name) && 'unknown' : (stryCov_9fa48("148878"), (stryMutAct_9fa48("148879") ? (definition.serviceId ?? definition.service_id) && definition.name : (stryCov_9fa48("148879"), (stryMutAct_9fa48("148880") ? definition.serviceId && definition.service_id : (stryCov_9fa48("148880"), definition.serviceId ?? definition.service_id)) ?? definition.name)) ?? (stryMutAct_9fa48("148881") ? "" : (stryCov_9fa48("148881"), 'unknown')));
  }
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
  if (stryMutAct_9fa48("148882")) {
    {}
  } else {
    stryCov_9fa48("148882");
    const port = stryMutAct_9fa48("148883") ? intent[ENDPOINT_INTENT_FIELD.PORT] : (stryCov_9fa48("148883"), intent?.[ENDPOINT_INTENT_FIELD.PORT]);
    const host = stryMutAct_9fa48("148884") ? intent[ENDPOINT_INTENT_FIELD.HOST] : (stryCov_9fa48("148884"), intent?.[ENDPOINT_INTENT_FIELD.HOST]);
    const protocol = stryMutAct_9fa48("148885") ? intent[ENDPOINT_INTENT_FIELD.PROTOCOL] : (stryCov_9fa48("148885"), intent?.[ENDPOINT_INTENT_FIELD.PROTOCOL]);
    const invalidReason = (stryMutAct_9fa48("148888") ? !intent && typeof intent !== TYPEOF.OBJECT : stryMutAct_9fa48("148887") ? false : stryMutAct_9fa48("148886") ? true : (stryCov_9fa48("148886", "148887", "148888"), (stryMutAct_9fa48("148889") ? intent : (stryCov_9fa48("148889"), !intent)) || (stryMutAct_9fa48("148891") ? typeof intent === TYPEOF.OBJECT : stryMutAct_9fa48("148890") ? false : (stryCov_9fa48("148890", "148891"), typeof intent !== TYPEOF.OBJECT)))) ? stryMutAct_9fa48("148892") ? "" : (stryCov_9fa48("148892"), 'endpoint intent must be a non-null object') : (stryMutAct_9fa48("148895") ? (typeof port !== TYPEOF.NUMBER || !Number.isInteger(port) || port < MIN_PORT) && port > MAX_PORT : stryMutAct_9fa48("148894") ? false : stryMutAct_9fa48("148893") ? true : (stryCov_9fa48("148893", "148894", "148895"), (stryMutAct_9fa48("148897") ? (typeof port !== TYPEOF.NUMBER || !Number.isInteger(port)) && port < MIN_PORT : stryMutAct_9fa48("148896") ? false : (stryCov_9fa48("148896", "148897"), (stryMutAct_9fa48("148899") ? typeof port !== TYPEOF.NUMBER && !Number.isInteger(port) : stryMutAct_9fa48("148898") ? false : (stryCov_9fa48("148898", "148899"), (stryMutAct_9fa48("148901") ? typeof port === TYPEOF.NUMBER : stryMutAct_9fa48("148900") ? false : (stryCov_9fa48("148900", "148901"), typeof port !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("148902") ? Number.isInteger(port) : (stryCov_9fa48("148902"), !Number.isInteger(port))))) || (stryMutAct_9fa48("148905") ? port >= MIN_PORT : stryMutAct_9fa48("148904") ? port <= MIN_PORT : stryMutAct_9fa48("148903") ? false : (stryCov_9fa48("148903", "148904", "148905"), port < MIN_PORT)))) || (stryMutAct_9fa48("148908") ? port <= MAX_PORT : stryMutAct_9fa48("148907") ? port >= MAX_PORT : stryMutAct_9fa48("148906") ? false : (stryCov_9fa48("148906", "148907", "148908"), port > MAX_PORT)))) ? stryMutAct_9fa48("148909") ? `` : (stryCov_9fa48("148909"), `port must be an integer in [${MIN_PORT}, ${MAX_PORT}]`) : (stryMutAct_9fa48("148912") ? host !== undefined || typeof host !== TYPEOF.STRING : stryMutAct_9fa48("148911") ? false : stryMutAct_9fa48("148910") ? true : (stryCov_9fa48("148910", "148911", "148912"), (stryMutAct_9fa48("148914") ? host === undefined : stryMutAct_9fa48("148913") ? true : (stryCov_9fa48("148913", "148914"), host !== undefined)) && (stryMutAct_9fa48("148916") ? typeof host === TYPEOF.STRING : stryMutAct_9fa48("148915") ? true : (stryCov_9fa48("148915", "148916"), typeof host !== TYPEOF.STRING)))) ? stryMutAct_9fa48("148917") ? "" : (stryCov_9fa48("148917"), 'host must be a string when provided') : (stryMutAct_9fa48("148920") ? protocol !== undefined || typeof protocol !== TYPEOF.STRING : stryMutAct_9fa48("148919") ? false : stryMutAct_9fa48("148918") ? true : (stryCov_9fa48("148918", "148919", "148920"), (stryMutAct_9fa48("148922") ? protocol === undefined : stryMutAct_9fa48("148921") ? true : (stryCov_9fa48("148921", "148922"), protocol !== undefined)) && (stryMutAct_9fa48("148924") ? typeof protocol === TYPEOF.STRING : stryMutAct_9fa48("148923") ? true : (stryCov_9fa48("148923", "148924"), typeof protocol !== TYPEOF.STRING)))) ? stryMutAct_9fa48("148925") ? "" : (stryCov_9fa48("148925"), 'protocol must be a string when provided') : stryMutAct_9fa48("148926") ? "Stryker was here!" : (stryCov_9fa48("148926"), '');
    return invalidReason ? stryMutAct_9fa48("148927") ? {} : (stryCov_9fa48("148927"), {
      valid: stryMutAct_9fa48("148928") ? true : (stryCov_9fa48("148928"), false),
      reason: invalidReason
    }) : stryMutAct_9fa48("148929") ? {} : (stryCov_9fa48("148929"), {
      valid: stryMutAct_9fa48("148930") ? false : (stryCov_9fa48("148930"), true)
    });
  }
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
    if (stryMutAct_9fa48("148931")) {
      {}
    } else {
      stryCov_9fa48("148931");
      super();
      if (stryMutAct_9fa48("148934") ? false : stryMutAct_9fa48("148933") ? true : stryMutAct_9fa48("148932") ? registry instanceof RuntimeDriverRegistry : (stryCov_9fa48("148932", "148933", "148934"), !(registry instanceof RuntimeDriverRegistry))) {
        if (stryMutAct_9fa48("148935")) {
          {}
        } else {
          stryCov_9fa48("148935");
          throw new TypeError(stryMutAct_9fa48("148936") ? "" : (stryCov_9fa48("148936"), 'registry must be an instance of RuntimeDriverRegistry'));
        }
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
    if (stryMutAct_9fa48("148937")) {
      {}
    } else {
      stryCov_9fa48("148937");
      if (stryMutAct_9fa48("148940") ? typeof factory === TYPEOF.FUNCTION : stryMutAct_9fa48("148939") ? false : stryMutAct_9fa48("148938") ? true : (stryCov_9fa48("148938", "148939", "148940"), typeof factory !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("148941")) {
          {}
        } else {
          stryCov_9fa48("148941");
          throw new TypeError(stryMutAct_9fa48("148942") ? "" : (stryCov_9fa48("148942"), 'query executor factory must be a function'));
        }
      }
      this._queryExecutorFactory = factory;
      this.emit(QUERY_EXECUTOR_FACTORY_EVENT.FACTORY_SET, {});
    }
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
    if (stryMutAct_9fa48("148943")) {
      {}
    } else {
      stryCov_9fa48("148943");
      if (stryMutAct_9fa48("148946") ? typeof writer === TYPEOF.FUNCTION : stryMutAct_9fa48("148945") ? false : stryMutAct_9fa48("148944") ? true : (stryCov_9fa48("148944", "148945", "148946"), typeof writer !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("148947")) {
          {}
        } else {
          stryCov_9fa48("148947");
          throw new TypeError(stryMutAct_9fa48("148948") ? "" : (stryCov_9fa48("148948"), 'endpoint writer must be a function'));
        }
      }
      this._endpointWriter = writer;
    }
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
    if (stryMutAct_9fa48("148949")) {
      {}
    } else {
      stryCov_9fa48("148949");
      if (stryMutAct_9fa48("148952") ? typeof remover === TYPEOF.FUNCTION : stryMutAct_9fa48("148951") ? false : stryMutAct_9fa48("148950") ? true : (stryCov_9fa48("148950", "148951", "148952"), typeof remover !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("148953")) {
          {}
        } else {
          stryCov_9fa48("148953");
          throw new TypeError(stryMutAct_9fa48("148954") ? "" : (stryCov_9fa48("148954"), 'endpoint remover must be a function'));
        }
      }
      this._endpointRemover = remover;
    }
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
    if (stryMutAct_9fa48("148955")) {
      {}
    } else {
      stryCov_9fa48("148955");
      if (stryMutAct_9fa48("148958") ? typeof writer === TYPEOF.FUNCTION : stryMutAct_9fa48("148957") ? false : stryMutAct_9fa48("148956") ? true : (stryCov_9fa48("148956", "148957", "148958"), typeof writer !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("148959")) {
          {}
        } else {
          stryCov_9fa48("148959");
          throw new TypeError(stryMutAct_9fa48("148960") ? "" : (stryCov_9fa48("148960"), 'operation writer must be a function'));
        }
      }
      this._operationWriter = writer;
    }
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
    if (stryMutAct_9fa48("148961")) {
      {}
    } else {
      stryCov_9fa48("148961");
      if (stryMutAct_9fa48("148964") ? typeof reader === TYPEOF.FUNCTION : stryMutAct_9fa48("148963") ? false : stryMutAct_9fa48("148962") ? true : (stryCov_9fa48("148962", "148963", "148964"), typeof reader !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("148965")) {
          {}
        } else {
          stryCov_9fa48("148965");
          throw new TypeError(stryMutAct_9fa48("148966") ? "" : (stryCov_9fa48("148966"), 'idempotency reader must be a function'));
        }
      }
      this._idempotencyReader = reader;
    }
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
    if (stryMutAct_9fa48("148967")) {
      {}
    } else {
      stryCov_9fa48("148967");
      if (stryMutAct_9fa48("148970") ? typeof writer === TYPEOF.FUNCTION : stryMutAct_9fa48("148969") ? false : stryMutAct_9fa48("148968") ? true : (stryCov_9fa48("148968", "148969", "148970"), typeof writer !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("148971")) {
          {}
        } else {
          stryCov_9fa48("148971");
          throw new TypeError(stryMutAct_9fa48("148972") ? "" : (stryCov_9fa48("148972"), 'state projection writer must be a function'));
        }
      }
      this._stateProjectionWriter = writer;
    }
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
  async _projectReplicaState(serviceId, definition, status, extras, context) {
    if (stryMutAct_9fa48("148973")) {
      {}
    } else {
      stryCov_9fa48("148973");
      if (stryMutAct_9fa48("148976") ? false : stryMutAct_9fa48("148975") ? true : stryMutAct_9fa48("148974") ? this._stateProjectionWriter : (stryCov_9fa48("148974", "148975", "148976"), !this._stateProjectionWriter)) {
        if (stryMutAct_9fa48("148977")) {
          {}
        } else {
          stryCov_9fa48("148977");
          return;
        }
      }
      const now = Date.now();
      const nodeId = stryMutAct_9fa48("148978") ? (definition?.nodeId ?? definition?.node_id) && null : (stryCov_9fa48("148978"), (stryMutAct_9fa48("148979") ? definition?.nodeId && definition?.node_id : (stryCov_9fa48("148979"), (stryMutAct_9fa48("148980") ? definition.nodeId : (stryCov_9fa48("148980"), definition?.nodeId)) ?? (stryMutAct_9fa48("148981") ? definition.node_id : (stryCov_9fa48("148981"), definition?.node_id)))) ?? null);
      const serviceType = stryMutAct_9fa48("148982") ? (definition?.serviceType ?? definition?.service_type) && UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE : (stryCov_9fa48("148982"), (stryMutAct_9fa48("148983") ? definition?.serviceType && definition?.service_type : (stryCov_9fa48("148983"), (stryMutAct_9fa48("148984") ? definition.serviceType : (stryCov_9fa48("148984"), definition?.serviceType)) ?? (stryMutAct_9fa48("148985") ? definition.service_type : (stryCov_9fa48("148985"), definition?.service_type)))) ?? UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);
      const address = stryMutAct_9fa48("148986") ? definition?.address && null : (stryCov_9fa48("148986"), (stryMutAct_9fa48("148987") ? definition.address : (stryCov_9fa48("148987"), definition?.address)) ?? null);
      const stateRow = stryMutAct_9fa48("148988") ? {} : (stryCov_9fa48("148988"), {
        service_type: serviceType,
        node_id: nodeId,
        status,
        address,
        updated_at: now,
        ...extras
      });
      const causeId = normalizeCauseId(stryMutAct_9fa48("148989") ? context.causeId : (stryCov_9fa48("148989"), context?.causeId));
      try {
        if (stryMutAct_9fa48("148990")) {
          {}
        } else {
          stryCov_9fa48("148990");
          await this._stateProjectionWriter(serviceId, stateRow, stryMutAct_9fa48("148991") ? {} : (stryCov_9fa48("148991"), {
            causeId
          }));
          this.emit(STATE_PROJECTION_EVENT.STATE_PROJECTED, stryMutAct_9fa48("148992") ? {} : (stryCov_9fa48("148992"), {
            serviceId,
            status,
            nodeId,
            causeId
          }));
        }
      } catch (err) {
        if (stryMutAct_9fa48("148993")) {
          {}
        } else {
          stryCov_9fa48("148993");
          this.emit(STATE_PROJECTION_EVENT.STATE_PROJECTION_FAILED, stryMutAct_9fa48("148994") ? {} : (stryCov_9fa48("148994"), {
            serviceId,
            status,
            nodeId,
            causeId,
            error: err
          }));
        }
      }
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
    if (stryMutAct_9fa48("148995")) {
      {}
    } else {
      stryCov_9fa48("148995");
      if (stryMutAct_9fa48("148998") ? false : stryMutAct_9fa48("148997") ? true : stryMutAct_9fa48("148996") ? this._endpointRemover : (stryCov_9fa48("148996", "148997", "148998"), !this._endpointRemover)) {
        if (stryMutAct_9fa48("148999")) {
          {}
        } else {
          stryCov_9fa48("148999");
          return;
        }
      }
      const nodeId = stryMutAct_9fa48("149000") ? (definition?.nodeId ?? definition?.node_id) && null : (stryCov_9fa48("149000"), (stryMutAct_9fa48("149001") ? definition?.nodeId && definition?.node_id : (stryCov_9fa48("149001"), (stryMutAct_9fa48("149002") ? definition.nodeId : (stryCov_9fa48("149002"), definition?.nodeId)) ?? (stryMutAct_9fa48("149003") ? definition.node_id : (stryCov_9fa48("149003"), definition?.node_id)))) ?? null);
      try {
        if (stryMutAct_9fa48("149004")) {
          {}
        } else {
          stryCov_9fa48("149004");
          await this._endpointRemover(serviceId, nodeId);
          this.emit(LIFECYCLE_EVENT.ENDPOINT_REMOVED, stryMutAct_9fa48("149005") ? {} : (stryCov_9fa48("149005"), {
            serviceId,
            nodeId
          }));
        }
      } catch (err) {
        if (stryMutAct_9fa48("149006")) {
          {}
        } else {
          stryCov_9fa48("149006");
          this.emit(LIFECYCLE_EVENT.ENDPOINT_REMOVAL_FAILED, stryMutAct_9fa48("149007") ? {} : (stryCov_9fa48("149007"), {
            serviceId,
            nodeId,
            error: err
          }));
        }
      }
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
  async _checkIdempotency(tenantId, idempotencyKey, runtimeKind, serviceId) {
    if (stryMutAct_9fa48("149008")) {
      {}
    } else {
      stryCov_9fa48("149008");
      if (stryMutAct_9fa48("149011") ? !this._idempotencyReader && !idempotencyKey : stryMutAct_9fa48("149010") ? false : stryMutAct_9fa48("149009") ? true : (stryCov_9fa48("149009", "149010", "149011"), (stryMutAct_9fa48("149012") ? this._idempotencyReader : (stryCov_9fa48("149012"), !this._idempotencyReader)) || (stryMutAct_9fa48("149013") ? idempotencyKey : (stryCov_9fa48("149013"), !idempotencyKey)))) {
        if (stryMutAct_9fa48("149014")) {
          {}
        } else {
          stryCov_9fa48("149014");
          return null;
        }
      }
      const check = buildIdempotencyCheckSQL(tenantId, idempotencyKey);
      if (stryMutAct_9fa48("149017") ? false : stryMutAct_9fa48("149016") ? true : stryMutAct_9fa48("149015") ? check.success : (stryCov_9fa48("149015", "149016", "149017"), !check.success)) {
        if (stryMutAct_9fa48("149018")) {
          {}
        } else {
          stryCov_9fa48("149018");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("149019")) {
          {}
        } else {
          stryCov_9fa48("149019");
          const rows = await this._idempotencyReader(check.sql, check.params);
          if (stryMutAct_9fa48("149022") ? rows || rows.length > 0 : stryMutAct_9fa48("149021") ? false : stryMutAct_9fa48("149020") ? true : (stryCov_9fa48("149020", "149021", "149022"), rows && (stryMutAct_9fa48("149025") ? rows.length <= 0 : stryMutAct_9fa48("149024") ? rows.length >= 0 : stryMutAct_9fa48("149023") ? true : (stryCov_9fa48("149023", "149024", "149025"), rows.length > 0)))) {
            if (stryMutAct_9fa48("149026")) {
              {}
            } else {
              stryCov_9fa48("149026");
              return rows[0];
            }
          }
          return null;
        }
      } catch (err) {
        if (stryMutAct_9fa48("149027")) {
          {}
        } else {
          stryCov_9fa48("149027");
          throw new IdempotencyCheckError(runtimeKind, serviceId, stryMutAct_9fa48("149028") ? `` : (stryCov_9fa48("149028"), `query failed: ${err.message}`), stryMutAct_9fa48("149029") ? {} : (stryCov_9fa48("149029"), {
            cause: err
          }));
        }
      }
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
  async _journalCreate(serviceId, runtimeKind, command, tenantId, idempotencyKey) {
    if (stryMutAct_9fa48("149030")) {
      {}
    } else {
      stryCov_9fa48("149030");
      if (stryMutAct_9fa48("149033") ? false : stryMutAct_9fa48("149032") ? true : stryMutAct_9fa48("149031") ? this._operationWriter : (stryCov_9fa48("149031", "149032", "149033"), !this._operationWriter)) {
        if (stryMutAct_9fa48("149034")) {
          {}
        } else {
          stryCov_9fa48("149034");
          return null;
        }
      }
      const tenantValue = stryMutAct_9fa48("149037") ? tenantId && serviceId : stryMutAct_9fa48("149036") ? false : stryMutAct_9fa48("149035") ? true : (stryCov_9fa48("149035", "149036", "149037"), tenantId || serviceId);

      // Idempotency check: return existing operation if found
      if (stryMutAct_9fa48("149039") ? false : stryMutAct_9fa48("149038") ? true : (stryCov_9fa48("149038", "149039"), idempotencyKey)) {
        if (stryMutAct_9fa48("149040")) {
          {}
        } else {
          stryCov_9fa48("149040");
          const existing = await this._checkIdempotency(tenantValue, idempotencyKey, runtimeKind, serviceId);
          if (stryMutAct_9fa48("149042") ? false : stryMutAct_9fa48("149041") ? true : (stryCov_9fa48("149041", "149042"), existing)) {
            if (stryMutAct_9fa48("149043")) {
              {}
            } else {
              stryCov_9fa48("149043");
              this.emit(OPERATION_JOURNAL_EVENT.IDEMPOTENCY_HIT, stryMutAct_9fa48("149044") ? {} : (stryCov_9fa48("149044"), {
                runtimeKind,
                serviceId,
                command,
                idempotencyKey,
                existingOperationId: stryMutAct_9fa48("149045") ? existing.operation_id && existing.operationId : (stryCov_9fa48("149045"), existing.operation_id ?? existing.operationId),
                existingState: existing.state
              }));
              return stryMutAct_9fa48("149046") ? {} : (stryCov_9fa48("149046"), {
                operationId: stryMutAct_9fa48("149047") ? existing.operation_id && existing.operationId : (stryCov_9fa48("149047"), existing.operation_id ?? existing.operationId),
                idempotent: stryMutAct_9fa48("149048") ? false : (stryCov_9fa48("149048"), true),
                existing
              });
            }
          }
        }
      }
      const result = createOperation(tenantValue, command, idempotencyKey);
      if (stryMutAct_9fa48("149051") ? false : stryMutAct_9fa48("149050") ? true : stryMutAct_9fa48("149049") ? result.success : (stryCov_9fa48("149049", "149050", "149051"), !result.success)) {
        if (stryMutAct_9fa48("149052")) {
          {}
        } else {
          stryCov_9fa48("149052");
          throw new OperationJournalError(runtimeKind, serviceId, command, result.errors.join(stryMutAct_9fa48("149053") ? "" : (stryCov_9fa48("149053"), '; ')));
        }
      }
      try {
        if (stryMutAct_9fa48("149054")) {
          {}
        } else {
          stryCov_9fa48("149054");
          await this._operationWriter(result.sql, result.params);
        }
      } catch (err) {
        if (stryMutAct_9fa48("149055")) {
          {}
        } else {
          stryCov_9fa48("149055");
          throw new OperationJournalError(runtimeKind, serviceId, command, stryMutAct_9fa48("149056") ? `` : (stryCov_9fa48("149056"), `create failed: ${err.message}`), stryMutAct_9fa48("149057") ? {} : (stryCov_9fa48("149057"), {
            cause: err
          }));
        }
      }
      this.emit(OPERATION_JOURNAL_EVENT.OPERATION_CREATED, stryMutAct_9fa48("149058") ? {} : (stryCov_9fa48("149058"), {
        runtimeKind,
        serviceId,
        command,
        operationId: result.operation.operationId,
        state: WASM_OPERATION_STATE.PENDING
      }));
      return result.operation;
    }
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
  async _journalTransition(operation, serviceId, runtimeKind, command, fromState, toState, resultOrError) {
    if (stryMutAct_9fa48("149059")) {
      {}
    } else {
      stryCov_9fa48("149059");
      if (stryMutAct_9fa48("149062") ? !this._operationWriter && !operation : stryMutAct_9fa48("149061") ? false : stryMutAct_9fa48("149060") ? true : (stryCov_9fa48("149060", "149061", "149062"), (stryMutAct_9fa48("149063") ? this._operationWriter : (stryCov_9fa48("149063"), !this._operationWriter)) || (stryMutAct_9fa48("149064") ? operation : (stryCov_9fa48("149064"), !operation)))) {
        if (stryMutAct_9fa48("149065")) {
          {}
        } else {
          stryCov_9fa48("149065");
          return;
        }
      }
      // Skip transitions for idempotent (already-existing) operations
      if (stryMutAct_9fa48("149067") ? false : stryMutAct_9fa48("149066") ? true : (stryCov_9fa48("149066", "149067"), operation.idempotent)) {
        if (stryMutAct_9fa48("149068")) {
          {}
        } else {
          stryCov_9fa48("149068");
          return;
        }
      }
      const result = transitionOperation(operation.operationId, fromState, toState, resultOrError);
      if (stryMutAct_9fa48("149071") ? false : stryMutAct_9fa48("149070") ? true : stryMutAct_9fa48("149069") ? result.success : (stryCov_9fa48("149069", "149070", "149071"), !result.success)) {
        if (stryMutAct_9fa48("149072")) {
          {}
        } else {
          stryCov_9fa48("149072");
          const err = new OperationJournalError(runtimeKind, serviceId, command, result.errors.join(stryMutAct_9fa48("149073") ? "" : (stryCov_9fa48("149073"), '; ')));
          this.emit(OPERATION_JOURNAL_EVENT.OPERATION_JOURNAL_FAILED, stryMutAct_9fa48("149074") ? {} : (stryCov_9fa48("149074"), {
            runtimeKind,
            serviceId,
            command,
            operationId: operation.operationId,
            fromState,
            toState,
            error: err
          }));
          throw err;
        }
      }
      try {
        if (stryMutAct_9fa48("149075")) {
          {}
        } else {
          stryCov_9fa48("149075");
          await this._operationWriter(result.sql, result.params);
        }
      } catch (err) {
        if (stryMutAct_9fa48("149076")) {
          {}
        } else {
          stryCov_9fa48("149076");
          const journalErr = new OperationJournalError(runtimeKind, serviceId, command, stryMutAct_9fa48("149077") ? `` : (stryCov_9fa48("149077"), `transition ${fromState}->${toState} failed: ${err.message}`), stryMutAct_9fa48("149078") ? {} : (stryCov_9fa48("149078"), {
            cause: err
          }));
          this.emit(OPERATION_JOURNAL_EVENT.OPERATION_JOURNAL_FAILED, stryMutAct_9fa48("149079") ? {} : (stryCov_9fa48("149079"), {
            runtimeKind,
            serviceId,
            command,
            operationId: operation.operationId,
            fromState,
            toState,
            error: journalErr
          }));
          throw journalErr;
        }
      }
      this.emit(OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED, stryMutAct_9fa48("149080") ? {} : (stryCov_9fa48("149080"), {
        runtimeKind,
        serviceId,
        command,
        operationId: operation.operationId,
        fromState,
        toState
      }));
    }
  }

  /**
   * Resolve the driver for a runtime kind via the registry.
   * Fail-closed: unknown kinds propagate UnknownRuntimeKindError.
   *
   * @param {string} runtimeKind - The runtime kind to resolve.
   * @return {import('./runtime-driver.js').RuntimeDriver}
   */
  _resolveDriver(runtimeKind) {
    if (stryMutAct_9fa48("149081")) {
      {}
    } else {
      stryCov_9fa48("149081");
      return this._registry.getDriver(runtimeKind);
    }
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
  _validateRuntimeDescriptor(definition, runtimeKind, operation, serviceId) {
    if (stryMutAct_9fa48("149082")) {
      {}
    } else {
      stryCov_9fa48("149082");
      const validation = validateRuntimeDescriptor(stryMutAct_9fa48("149083") ? {} : (stryCov_9fa48("149083"), {
        runtimeKind,
        runtimeRef: stryMutAct_9fa48("149084") ? (definition?.runtime_ref ?? definition?.runtimeRef) && null : (stryCov_9fa48("149084"), (stryMutAct_9fa48("149085") ? definition?.runtime_ref && definition?.runtimeRef : (stryCov_9fa48("149085"), (stryMutAct_9fa48("149086") ? definition.runtime_ref : (stryCov_9fa48("149086"), definition?.runtime_ref)) ?? (stryMutAct_9fa48("149087") ? definition.runtimeRef : (stryCov_9fa48("149087"), definition?.runtimeRef)))) ?? null),
        runtimeConfig: stryMutAct_9fa48("149088") ? (definition?.runtime_config ?? definition?.runtimeConfig) && null : (stryCov_9fa48("149088"), (stryMutAct_9fa48("149089") ? definition?.runtime_config && definition?.runtimeConfig : (stryCov_9fa48("149089"), (stryMutAct_9fa48("149090") ? definition.runtime_config : (stryCov_9fa48("149090"), definition?.runtime_config)) ?? (stryMutAct_9fa48("149091") ? definition.runtimeConfig : (stryCov_9fa48("149091"), definition?.runtimeConfig)))) ?? null)
      }));
      if (stryMutAct_9fa48("149094") ? false : stryMutAct_9fa48("149093") ? true : stryMutAct_9fa48("149092") ? validation.valid : (stryCov_9fa48("149092", "149093", "149094"), !validation.valid)) {
        if (stryMutAct_9fa48("149095")) {
          {}
        } else {
          stryCov_9fa48("149095");
          throw new LifecycleOrchestrationError(operation, runtimeKind, serviceId, validation.errors.join(stryMutAct_9fa48("149096") ? "" : (stryCov_9fa48("149096"), '; ')));
        }
      }
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
    if (stryMutAct_9fa48("149097")) {
      {}
    } else {
      stryCov_9fa48("149097");
      const runtimeKind = resolveRuntimeKind(definition);
      const serviceId = resolveServiceId(definition);
      const op = LIFECYCLE_OPERATION.PREPARE;
      const idempotencyKey = stryMutAct_9fa48("149098") ? options?.idempotencyKey && null : (stryCov_9fa48("149098"), (stryMutAct_9fa48("149099") ? options.idempotencyKey : (stryCov_9fa48("149099"), options?.idempotencyKey)) ?? null);
      if (stryMutAct_9fa48("149102") ? false : stryMutAct_9fa48("149101") ? true : stryMutAct_9fa48("149100") ? runtimeKind : (stryCov_9fa48("149100", "149101", "149102"), !runtimeKind)) {
        if (stryMutAct_9fa48("149103")) {
          {}
        } else {
          stryCov_9fa48("149103");
          throw new LifecycleOrchestrationError(op, stryMutAct_9fa48("149104") ? "" : (stryCov_9fa48("149104"), 'none'), serviceId, stryMutAct_9fa48("149105") ? "" : (stryCov_9fa48("149105"), 'service definition is missing runtime_kind'));
        }
      }
      this._validateRuntimeDescriptor(definition, runtimeKind, op, serviceId);
      this.emit(LIFECYCLE_EVENT.PREPARE_START, stryMutAct_9fa48("149106") ? {} : (stryCov_9fa48("149106"), {
        runtimeKind,
        serviceId
      }));
      const start = Date.now();
      let operation = null;
      try {
        if (stryMutAct_9fa48("149107")) {
          {}
        } else {
          stryCov_9fa48("149107");
          operation = await this._journalCreate(serviceId, runtimeKind, op, definition.tenantId, idempotencyKey);

          // Idempotency hit: return existing operation identity
          if (stryMutAct_9fa48("149110") ? operation || operation.idempotent : stryMutAct_9fa48("149109") ? false : stryMutAct_9fa48("149108") ? true : (stryCov_9fa48("149108", "149109", "149110"), operation && operation.idempotent)) {
            if (stryMutAct_9fa48("149111")) {
              {}
            } else {
              stryCov_9fa48("149111");
              const durationMs = stryMutAct_9fa48("149112") ? Date.now() + start : (stryCov_9fa48("149112"), Date.now() - start);
              const result = stryMutAct_9fa48("149113") ? {} : (stryCov_9fa48("149113"), {
                status: stryMutAct_9fa48("149114") ? operation.existing.state && WASM_OPERATION_STATE.PENDING : (stryCov_9fa48("149114"), operation.existing.state ?? WASM_OPERATION_STATE.PENDING),
                operationId: operation.operationId,
                idempotent: stryMutAct_9fa48("149115") ? false : (stryCov_9fa48("149115"), true)
              });
              this.emit(LIFECYCLE_EVENT.PREPARE_SUCCESS, stryMutAct_9fa48("149116") ? {} : (stryCov_9fa48("149116"), {
                runtimeKind,
                serviceId,
                durationMs,
                result
              }));
              return result;
            }
          }
          await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.PENDING, WASM_OPERATION_STATE.IN_PROGRESS);
          const driver = this._resolveDriver(runtimeKind);
          const result = await driver.prepare(definition, context);
          const durationMs = stryMutAct_9fa48("149117") ? Date.now() + start : (stryCov_9fa48("149117"), Date.now() - start);
          await this._projectReplicaState(serviceId, definition, RUNTIME_REPLICA_STATUS.CREATED, stryMutAct_9fa48("149118") ? {} : (stryCov_9fa48("149118"), {
            created_at: start
          }));
          await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.IN_PROGRESS, WASM_OPERATION_STATE.COMPLETED, result);
          this.emit(LIFECYCLE_EVENT.PREPARE_SUCCESS, stryMutAct_9fa48("149119") ? {} : (stryCov_9fa48("149119"), {
            runtimeKind,
            serviceId,
            durationMs,
            result
          }));
          return result;
        }
      } catch (err) {
        if (stryMutAct_9fa48("149120")) {
          {}
        } else {
          stryCov_9fa48("149120");
          const durationMs = stryMutAct_9fa48("149121") ? Date.now() + start : (stryCov_9fa48("149121"), Date.now() - start);
          if (stryMutAct_9fa48("149124") ? operation && !(err instanceof OperationJournalError) || !(err instanceof IdempotencyCheckError) : stryMutAct_9fa48("149123") ? false : stryMutAct_9fa48("149122") ? true : (stryCov_9fa48("149122", "149123", "149124"), (stryMutAct_9fa48("149126") ? operation || !(err instanceof OperationJournalError) : stryMutAct_9fa48("149125") ? true : (stryCov_9fa48("149125", "149126"), operation && (stryMutAct_9fa48("149127") ? err instanceof OperationJournalError : (stryCov_9fa48("149127"), !(err instanceof OperationJournalError))))) && (stryMutAct_9fa48("149128") ? err instanceof IdempotencyCheckError : (stryCov_9fa48("149128"), !(err instanceof IdempotencyCheckError))))) {
            if (stryMutAct_9fa48("149129")) {
              {}
            } else {
              stryCov_9fa48("149129");
              await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.IN_PROGRESS, WASM_OPERATION_STATE.FAILED, stryMutAct_9fa48("149130") ? {} : (stryCov_9fa48("149130"), {
                message: err.message
              })).catch(() => {});
            }
          }
          await this._projectReplicaState(serviceId, definition, RUNTIME_REPLICA_STATUS.FAILED, stryMutAct_9fa48("149131") ? {} : (stryCov_9fa48("149131"), {
            error_message: err.message
          }));
          this.emit(LIFECYCLE_EVENT.PREPARE_FAILURE, stryMutAct_9fa48("149132") ? {} : (stryCov_9fa48("149132"), {
            runtimeKind,
            serviceId,
            durationMs,
            error: err
          }));
          if (stryMutAct_9fa48("149135") ? (err instanceof LifecycleOrchestrationError || err instanceof OperationJournalError) && err instanceof IdempotencyCheckError : stryMutAct_9fa48("149134") ? false : stryMutAct_9fa48("149133") ? true : (stryCov_9fa48("149133", "149134", "149135"), (stryMutAct_9fa48("149137") ? err instanceof LifecycleOrchestrationError && err instanceof OperationJournalError : stryMutAct_9fa48("149136") ? false : (stryCov_9fa48("149136", "149137"), err instanceof LifecycleOrchestrationError || err instanceof OperationJournalError)) || err instanceof IdempotencyCheckError)) {
            if (stryMutAct_9fa48("149138")) {
              {}
            } else {
              stryCov_9fa48("149138");
              throw err;
            }
          }
          throw new LifecycleOrchestrationError(op, runtimeKind, serviceId, err.message, stryMutAct_9fa48("149139") ? {} : (stryCov_9fa48("149139"), {
            cause: err
          }));
        }
      }
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
    if (stryMutAct_9fa48("149140")) {
      {}
    } else {
      stryCov_9fa48("149140");
      const definition = stryMutAct_9fa48("149141") ? replicaContext?.definition && replicaContext : (stryCov_9fa48("149141"), (stryMutAct_9fa48("149142") ? replicaContext.definition : (stryCov_9fa48("149142"), replicaContext?.definition)) ?? replicaContext);
      const runtimeKind = resolveRuntimeKind(definition);
      const serviceId = resolveServiceId(definition);
      const op = LIFECYCLE_OPERATION.START;
      const idempotencyKey = stryMutAct_9fa48("149143") ? options?.idempotencyKey && null : (stryCov_9fa48("149143"), (stryMutAct_9fa48("149144") ? options.idempotencyKey : (stryCov_9fa48("149144"), options?.idempotencyKey)) ?? null);
      if (stryMutAct_9fa48("149147") ? false : stryMutAct_9fa48("149146") ? true : stryMutAct_9fa48("149145") ? runtimeKind : (stryCov_9fa48("149145", "149146", "149147"), !runtimeKind)) {
        if (stryMutAct_9fa48("149148")) {
          {}
        } else {
          stryCov_9fa48("149148");
          throw new LifecycleOrchestrationError(op, stryMutAct_9fa48("149149") ? "" : (stryCov_9fa48("149149"), 'none'), serviceId, stryMutAct_9fa48("149150") ? "" : (stryCov_9fa48("149150"), 'replica context is missing runtime_kind'));
        }
      }
      this._validateRuntimeDescriptor(definition, runtimeKind, op, serviceId);
      this.emit(LIFECYCLE_EVENT.START_START, stryMutAct_9fa48("149151") ? {} : (stryCov_9fa48("149151"), {
        runtimeKind,
        serviceId
      }));
      const start = Date.now();
      let operation = null;
      let causeId = null;
      try {
        if (stryMutAct_9fa48("149152")) {
          {}
        } else {
          stryCov_9fa48("149152");
          operation = await this._journalCreate(serviceId, runtimeKind, op, definition.tenantId, idempotencyKey);

          // Idempotency hit: return existing operation identity
          if (stryMutAct_9fa48("149155") ? operation || operation.idempotent : stryMutAct_9fa48("149154") ? false : stryMutAct_9fa48("149153") ? true : (stryCov_9fa48("149153", "149154", "149155"), operation && operation.idempotent)) {
            if (stryMutAct_9fa48("149156")) {
              {}
            } else {
              stryCov_9fa48("149156");
              const durationMs = stryMutAct_9fa48("149157") ? Date.now() + start : (stryCov_9fa48("149157"), Date.now() - start);
              const result = stryMutAct_9fa48("149158") ? {} : (stryCov_9fa48("149158"), {
                status: stryMutAct_9fa48("149159") ? operation.existing.state && WASM_OPERATION_STATE.PENDING : (stryCov_9fa48("149159"), operation.existing.state ?? WASM_OPERATION_STATE.PENDING),
                operationId: operation.operationId,
                idempotent: stryMutAct_9fa48("149160") ? false : (stryCov_9fa48("149160"), true)
              });
              this.emit(LIFECYCLE_EVENT.START_SUCCESS, stryMutAct_9fa48("149161") ? {} : (stryCov_9fa48("149161"), {
                runtimeKind,
                serviceId,
                durationMs,
                result
              }));
              return result;
            }
          }
          await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.PENDING, WASM_OPERATION_STATE.IN_PROGRESS);
          causeId = getOrCreateCauseId(stryMutAct_9fa48("149162") ? operation.operationId : (stryCov_9fa48("149162"), operation?.operationId));

          // Inject service-scoped query executor into replica context
          // so drivers and lifecycle modules can query tables through
          // the standard SQL execution path.
          if (stryMutAct_9fa48("149164") ? false : stryMutAct_9fa48("149163") ? true : (stryCov_9fa48("149163", "149164"), this._queryExecutorFactory)) {
            if (stryMutAct_9fa48("149165")) {
              {}
            } else {
              stryCov_9fa48("149165");
              replicaContext.queryExecutor = this._queryExecutorFactory(serviceId);
              this.emit(QUERY_EXECUTOR_FACTORY_EVENT.EXECUTOR_INJECTED, stryMutAct_9fa48("149166") ? {} : (stryCov_9fa48("149166"), {
                runtimeKind,
                serviceId
              }));
            }
          }
          const driver = this._resolveDriver(runtimeKind);
          const result = await driver.start(replicaContext);
          const durationMs = stryMutAct_9fa48("149167") ? Date.now() + start : (stryCov_9fa48("149167"), Date.now() - start);

          // --- Endpoint intent single-write-path handling ---
          if (stryMutAct_9fa48("149170") ? result || result.endpointIntent : stryMutAct_9fa48("149169") ? false : stryMutAct_9fa48("149168") ? true : (stryCov_9fa48("149168", "149169", "149170"), result && result.endpointIntent)) {
            if (stryMutAct_9fa48("149171")) {
              {}
            } else {
              stryCov_9fa48("149171");
              const validation = validateEndpointIntent(result.endpointIntent);
              if (stryMutAct_9fa48("149174") ? false : stryMutAct_9fa48("149173") ? true : stryMutAct_9fa48("149172") ? validation.valid : (stryCov_9fa48("149172", "149173", "149174"), !validation.valid)) {
                if (stryMutAct_9fa48("149175")) {
                  {}
                } else {
                  stryCov_9fa48("149175");
                  throw new EndpointIntentError(runtimeKind, serviceId, validation.reason);
                }
              }
              this.emit(LIFECYCLE_EVENT.ENDPOINT_INTENT_RECEIVED, stryMutAct_9fa48("149176") ? {} : (stryCov_9fa48("149176"), {
                runtimeKind,
                serviceId,
                endpointIntent: result.endpointIntent,
                causeId
              }));
              if (stryMutAct_9fa48("149178") ? false : stryMutAct_9fa48("149177") ? true : (stryCov_9fa48("149177", "149178"), this._endpointWriter)) {
                if (stryMutAct_9fa48("149179")) {
                  {}
                } else {
                  stryCov_9fa48("149179");
                  try {
                    if (stryMutAct_9fa48("149180")) {
                      {}
                    } else {
                      stryCov_9fa48("149180");
                      await this._endpointWriter(serviceId, runtimeKind, result.endpointIntent, stryMutAct_9fa48("149181") ? {} : (stryCov_9fa48("149181"), {
                        causeId
                      }));
                      this.emit(LIFECYCLE_EVENT.ENDPOINT_REGISTERED, stryMutAct_9fa48("149182") ? {} : (stryCov_9fa48("149182"), {
                        runtimeKind,
                        serviceId,
                        endpointIntent: result.endpointIntent,
                        causeId
                      }));
                    }
                  } catch (writeErr) {
                    if (stryMutAct_9fa48("149183")) {
                      {}
                    } else {
                      stryCov_9fa48("149183");
                      this.emit(LIFECYCLE_EVENT.ENDPOINT_REGISTRATION_FAILED, stryMutAct_9fa48("149184") ? {} : (stryCov_9fa48("149184"), {
                        runtimeKind,
                        serviceId,
                        error: writeErr,
                        causeId
                      }));
                      throw new LifecycleOrchestrationError(op, runtimeKind, serviceId, stryMutAct_9fa48("149185") ? `` : (stryCov_9fa48("149185"), `endpoint registration failed: ${writeErr.message}`), stryMutAct_9fa48("149186") ? {} : (stryCov_9fa48("149186"), {
                        cause: writeErr
                      }));
                    }
                  }
                }
              }
            }
          }
          await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.IN_PROGRESS, WASM_OPERATION_STATE.COMPLETED, result);
          await this._projectReplicaState(serviceId, definition, RUNTIME_REPLICA_STATUS.ACTIVE, null, stryMutAct_9fa48("149187") ? {} : (stryCov_9fa48("149187"), {
            causeId
          }));
          this.emit(LIFECYCLE_EVENT.START_SUCCESS, stryMutAct_9fa48("149188") ? {} : (stryCov_9fa48("149188"), {
            runtimeKind,
            serviceId,
            durationMs,
            result
          }));
          return result;
        }
      } catch (err) {
        if (stryMutAct_9fa48("149189")) {
          {}
        } else {
          stryCov_9fa48("149189");
          const durationMs = stryMutAct_9fa48("149190") ? Date.now() + start : (stryCov_9fa48("149190"), Date.now() - start);
          if (stryMutAct_9fa48("149193") ? operation && !(err instanceof OperationJournalError) || !(err instanceof IdempotencyCheckError) : stryMutAct_9fa48("149192") ? false : stryMutAct_9fa48("149191") ? true : (stryCov_9fa48("149191", "149192", "149193"), (stryMutAct_9fa48("149195") ? operation || !(err instanceof OperationJournalError) : stryMutAct_9fa48("149194") ? true : (stryCov_9fa48("149194", "149195"), operation && (stryMutAct_9fa48("149196") ? err instanceof OperationJournalError : (stryCov_9fa48("149196"), !(err instanceof OperationJournalError))))) && (stryMutAct_9fa48("149197") ? err instanceof IdempotencyCheckError : (stryCov_9fa48("149197"), !(err instanceof IdempotencyCheckError))))) {
            if (stryMutAct_9fa48("149198")) {
              {}
            } else {
              stryCov_9fa48("149198");
              await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.IN_PROGRESS, WASM_OPERATION_STATE.FAILED, stryMutAct_9fa48("149199") ? {} : (stryCov_9fa48("149199"), {
                message: err.message
              })).catch(() => {});
            }
          }
          await this._removeEndpoint(serviceId, definition);
          await this._projectReplicaState(serviceId, definition, RUNTIME_REPLICA_STATUS.FAILED, stryMutAct_9fa48("149200") ? {} : (stryCov_9fa48("149200"), {
            error_message: err.message
          }), stryMutAct_9fa48("149201") ? {} : (stryCov_9fa48("149201"), {
            causeId: stryMutAct_9fa48("149204") ? causeId && getOrCreateCauseId(operation?.operationId) : stryMutAct_9fa48("149203") ? false : stryMutAct_9fa48("149202") ? true : (stryCov_9fa48("149202", "149203", "149204"), causeId || getOrCreateCauseId(stryMutAct_9fa48("149205") ? operation.operationId : (stryCov_9fa48("149205"), operation?.operationId)))
          }));
          this.emit(LIFECYCLE_EVENT.START_FAILURE, stryMutAct_9fa48("149206") ? {} : (stryCov_9fa48("149206"), {
            runtimeKind,
            serviceId,
            durationMs,
            error: err
          }));
          if (stryMutAct_9fa48("149209") ? (err instanceof LifecycleOrchestrationError || err instanceof EndpointIntentError || err instanceof OperationJournalError) && err instanceof IdempotencyCheckError : stryMutAct_9fa48("149208") ? false : stryMutAct_9fa48("149207") ? true : (stryCov_9fa48("149207", "149208", "149209"), (stryMutAct_9fa48("149211") ? (err instanceof LifecycleOrchestrationError || err instanceof EndpointIntentError) && err instanceof OperationJournalError : stryMutAct_9fa48("149210") ? false : (stryCov_9fa48("149210", "149211"), (stryMutAct_9fa48("149213") ? err instanceof LifecycleOrchestrationError && err instanceof EndpointIntentError : stryMutAct_9fa48("149212") ? false : (stryCov_9fa48("149212", "149213"), err instanceof LifecycleOrchestrationError || err instanceof EndpointIntentError)) || err instanceof OperationJournalError)) || err instanceof IdempotencyCheckError)) {
            if (stryMutAct_9fa48("149214")) {
              {}
            } else {
              stryCov_9fa48("149214");
              throw err;
            }
          }
          throw new LifecycleOrchestrationError(op, runtimeKind, serviceId, err.message, stryMutAct_9fa48("149215") ? {} : (stryCov_9fa48("149215"), {
            cause: err
          }));
        }
      }
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
    if (stryMutAct_9fa48("149216")) {
      {}
    } else {
      stryCov_9fa48("149216");
      const definition = stryMutAct_9fa48("149217") ? replicaContext?.definition && replicaContext : (stryCov_9fa48("149217"), (stryMutAct_9fa48("149218") ? replicaContext.definition : (stryCov_9fa48("149218"), replicaContext?.definition)) ?? replicaContext);
      const runtimeKind = resolveRuntimeKind(definition);
      const serviceId = resolveServiceId(definition);
      const op = LIFECYCLE_OPERATION.STOP;
      const idempotencyKey = stryMutAct_9fa48("149219") ? options?.idempotencyKey && null : (stryCov_9fa48("149219"), (stryMutAct_9fa48("149220") ? options.idempotencyKey : (stryCov_9fa48("149220"), options?.idempotencyKey)) ?? null);
      if (stryMutAct_9fa48("149223") ? false : stryMutAct_9fa48("149222") ? true : stryMutAct_9fa48("149221") ? runtimeKind : (stryCov_9fa48("149221", "149222", "149223"), !runtimeKind)) {
        if (stryMutAct_9fa48("149224")) {
          {}
        } else {
          stryCov_9fa48("149224");
          throw new LifecycleOrchestrationError(op, stryMutAct_9fa48("149225") ? "" : (stryCov_9fa48("149225"), 'none'), serviceId, stryMutAct_9fa48("149226") ? "" : (stryCov_9fa48("149226"), 'replica context is missing runtime_kind'));
        }
      }
      this._validateRuntimeDescriptor(definition, runtimeKind, op, serviceId);
      this.emit(LIFECYCLE_EVENT.STOP_START, stryMutAct_9fa48("149227") ? {} : (stryCov_9fa48("149227"), {
        runtimeKind,
        serviceId
      }));
      const start = Date.now();
      let operation = null;
      try {
        if (stryMutAct_9fa48("149228")) {
          {}
        } else {
          stryCov_9fa48("149228");
          operation = await this._journalCreate(serviceId, runtimeKind, op, definition.tenantId, idempotencyKey);

          // Idempotency hit: return existing operation identity
          if (stryMutAct_9fa48("149231") ? operation || operation.idempotent : stryMutAct_9fa48("149230") ? false : stryMutAct_9fa48("149229") ? true : (stryCov_9fa48("149229", "149230", "149231"), operation && operation.idempotent)) {
            if (stryMutAct_9fa48("149232")) {
              {}
            } else {
              stryCov_9fa48("149232");
              const durationMs = stryMutAct_9fa48("149233") ? Date.now() + start : (stryCov_9fa48("149233"), Date.now() - start);
              this.emit(LIFECYCLE_EVENT.STOP_SUCCESS, stryMutAct_9fa48("149234") ? {} : (stryCov_9fa48("149234"), {
                runtimeKind,
                serviceId,
                durationMs
              }));
              return stryMutAct_9fa48("149235") ? {} : (stryCov_9fa48("149235"), {
                operationId: operation.operationId,
                idempotent: stryMutAct_9fa48("149236") ? false : (stryCov_9fa48("149236"), true)
              });
            }
          }
          await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.PENDING, WASM_OPERATION_STATE.IN_PROGRESS);
          const driver = this._resolveDriver(runtimeKind);
          await driver.stop(replicaContext);
          const durationMs = stryMutAct_9fa48("149237") ? Date.now() + start : (stryCov_9fa48("149237"), Date.now() - start);
          await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.IN_PROGRESS, WASM_OPERATION_STATE.COMPLETED);
          await this._removeEndpoint(serviceId, definition);
          await this._projectReplicaState(serviceId, definition, RUNTIME_REPLICA_STATUS.STOPPED);
          this.emit(LIFECYCLE_EVENT.STOP_SUCCESS, stryMutAct_9fa48("149238") ? {} : (stryCov_9fa48("149238"), {
            runtimeKind,
            serviceId,
            durationMs
          }));
        }
      } catch (err) {
        if (stryMutAct_9fa48("149239")) {
          {}
        } else {
          stryCov_9fa48("149239");
          const durationMs = stryMutAct_9fa48("149240") ? Date.now() + start : (stryCov_9fa48("149240"), Date.now() - start);
          if (stryMutAct_9fa48("149243") ? operation && !(err instanceof OperationJournalError) || !(err instanceof IdempotencyCheckError) : stryMutAct_9fa48("149242") ? false : stryMutAct_9fa48("149241") ? true : (stryCov_9fa48("149241", "149242", "149243"), (stryMutAct_9fa48("149245") ? operation || !(err instanceof OperationJournalError) : stryMutAct_9fa48("149244") ? true : (stryCov_9fa48("149244", "149245"), operation && (stryMutAct_9fa48("149246") ? err instanceof OperationJournalError : (stryCov_9fa48("149246"), !(err instanceof OperationJournalError))))) && (stryMutAct_9fa48("149247") ? err instanceof IdempotencyCheckError : (stryCov_9fa48("149247"), !(err instanceof IdempotencyCheckError))))) {
            if (stryMutAct_9fa48("149248")) {
              {}
            } else {
              stryCov_9fa48("149248");
              await this._journalTransition(operation, serviceId, runtimeKind, op, WASM_OPERATION_STATE.IN_PROGRESS, WASM_OPERATION_STATE.FAILED, stryMutAct_9fa48("149249") ? {} : (stryCov_9fa48("149249"), {
                message: err.message
              })).catch(() => {});
            }
          }
          await this._removeEndpoint(serviceId, definition);
          await this._projectReplicaState(serviceId, definition, RUNTIME_REPLICA_STATUS.FAILED, stryMutAct_9fa48("149250") ? {} : (stryCov_9fa48("149250"), {
            error_message: err.message
          }));
          this.emit(LIFECYCLE_EVENT.STOP_FAILURE, stryMutAct_9fa48("149251") ? {} : (stryCov_9fa48("149251"), {
            runtimeKind,
            serviceId,
            durationMs,
            error: err
          }));
          if (stryMutAct_9fa48("149254") ? (err instanceof LifecycleOrchestrationError || err instanceof OperationJournalError) && err instanceof IdempotencyCheckError : stryMutAct_9fa48("149253") ? false : stryMutAct_9fa48("149252") ? true : (stryCov_9fa48("149252", "149253", "149254"), (stryMutAct_9fa48("149256") ? err instanceof LifecycleOrchestrationError && err instanceof OperationJournalError : stryMutAct_9fa48("149255") ? false : (stryCov_9fa48("149255", "149256"), err instanceof LifecycleOrchestrationError || err instanceof OperationJournalError)) || err instanceof IdempotencyCheckError)) {
            if (stryMutAct_9fa48("149257")) {
              {}
            } else {
              stryCov_9fa48("149257");
              throw err;
            }
          }
          throw new LifecycleOrchestrationError(op, runtimeKind, serviceId, err.message, stryMutAct_9fa48("149258") ? {} : (stryCov_9fa48("149258"), {
            cause: err
          }));
        }
      }
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
    if (stryMutAct_9fa48("149259")) {
      {}
    } else {
      stryCov_9fa48("149259");
      const definition = stryMutAct_9fa48("149260") ? replicaContext?.definition && replicaContext : (stryCov_9fa48("149260"), (stryMutAct_9fa48("149261") ? replicaContext.definition : (stryCov_9fa48("149261"), replicaContext?.definition)) ?? replicaContext);
      const runtimeKind = resolveRuntimeKind(definition);
      const serviceId = resolveServiceId(definition);
      const op = LIFECYCLE_OPERATION.HEALTH;
      if (stryMutAct_9fa48("149264") ? false : stryMutAct_9fa48("149263") ? true : stryMutAct_9fa48("149262") ? runtimeKind : (stryCov_9fa48("149262", "149263", "149264"), !runtimeKind)) {
        if (stryMutAct_9fa48("149265")) {
          {}
        } else {
          stryCov_9fa48("149265");
          throw new LifecycleOrchestrationError(op, stryMutAct_9fa48("149266") ? "" : (stryCov_9fa48("149266"), 'none'), serviceId, stryMutAct_9fa48("149267") ? "" : (stryCov_9fa48("149267"), 'replica context is missing runtime_kind'));
        }
      }
      this._validateRuntimeDescriptor(definition, runtimeKind, op, serviceId);
      this.emit(LIFECYCLE_EVENT.HEALTH_CHECK, stryMutAct_9fa48("149268") ? {} : (stryCov_9fa48("149268"), {
        runtimeKind,
        serviceId
      }));
      const start = Date.now();
      try {
        if (stryMutAct_9fa48("149269")) {
          {}
        } else {
          stryCov_9fa48("149269");
          const driver = this._resolveDriver(runtimeKind);
          const result = await driver.health(replicaContext);
          const durationMs = stryMutAct_9fa48("149270") ? Date.now() + start : (stryCov_9fa48("149270"), Date.now() - start);
          this.emit(LIFECYCLE_EVENT.HEALTH_RESULT, stryMutAct_9fa48("149271") ? {} : (stryCov_9fa48("149271"), {
            runtimeKind,
            serviceId,
            durationMs,
            result
          }));
          return result;
        }
      } catch (err) {
        if (stryMutAct_9fa48("149272")) {
          {}
        } else {
          stryCov_9fa48("149272");
          const durationMs = stryMutAct_9fa48("149273") ? Date.now() + start : (stryCov_9fa48("149273"), Date.now() - start);
          this.emit(LIFECYCLE_EVENT.HEALTH_RESULT, stryMutAct_9fa48("149274") ? {} : (stryCov_9fa48("149274"), {
            runtimeKind,
            serviceId,
            durationMs,
            error: err
          }));
          if (stryMutAct_9fa48("149276") ? false : stryMutAct_9fa48("149275") ? true : (stryCov_9fa48("149275", "149276"), err instanceof LifecycleOrchestrationError)) {
            if (stryMutAct_9fa48("149277")) {
              {}
            } else {
              stryCov_9fa48("149277");
              throw err;
            }
          }
          throw new LifecycleOrchestrationError(op, runtimeKind, serviceId, err.message, stryMutAct_9fa48("149278") ? {} : (stryCov_9fa48("149278"), {
            cause: err
          }));
        }
      }
    }
  }
}
export { ServiceRuntimeLifecycle, validateEndpointIntent };