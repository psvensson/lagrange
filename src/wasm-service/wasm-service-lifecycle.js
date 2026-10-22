/**
 * WasmServiceLifecycle — manages creation, startup, and
 * shutdown of WasmServiceReplica instances from service
 * definitions. Coordinates module mirror checks, port
 * allocation, and endpoint registration during startup,
 * and port release, endpoint removal, and timer cleanup
 * during shutdown.
 *
 * Requirements: 2.4, 8.1, 8.2, 8.3, 8.4, 9.1
 * @module wasm-service/wasm-service-lifecycle
 */

import {LoggingService} from '../logging/logging-service.js';
import {DataDirectoryManager} from '../storage/data-directory-manager.js';
import {WasmServiceReplica} from './wasm-service-replica.js';
import {assertFoundingReplicaSet} from './wasm-service-consensus-port.js';
import {buildEndpointRecord} from './service-endpoint-builder.js';
import {
  WASM_SERVICE_SUBSYSTEM,
  WASM_SERVICE_LOG_MSG,
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_LIFECYCLE_REFUSAL,
  WASM_SERVICE_REPLICA_STATE,
} from './wasm-service-constants.js';

const START_RESULT_FIELD = Object.freeze({
  STARTED: 'started',
  PORT: 'port',
  ENDPOINT: 'endpoint',
  ERROR: 'error',
  DIAGNOSTIC: 'diagnostic',
});

const START_DIAGNOSTIC_FIELD = Object.freeze({
  CODE: 'code',
  SERVICE_ID: 'serviceId',
  HANDLER_FUNCTION_ID: 'handlerFunctionId',
  MODULE_VERSION: 'moduleVersion',
  NODE_ID: 'nodeId',
  TIMESTAMP: 'timestamp',
});

const START_DIAGNOSTIC_CODE = Object.freeze({
  MODULE_UNAVAILABLE: 'module_unavailable',
  MODULE_MIRROR_MISSING: 'module_mirror_missing',
  PORT_ALLOCATOR_UNAVAILABLE: 'port_allocator_unavailable',
  CONSENSUS_START_REFUSED: 'consensus_start_refused',
});

/**
 * Lifecycle states for a managed replica: the replica's own states.
 * @enum {string}
 */
const REPLICA_LIFECYCLE_STATE = WASM_SERVICE_REPLICA_STATE;
// A replica whose stop began: it never starts again (single-use instance).
// A replica whose start allocated the serviceId's port.
const PORT_HOLDING_REPLICA_STATES = new Set([
  WASM_SERVICE_REPLICA_STATE.STARTING,
  WASM_SERVICE_REPLICA_STATE.READY,
]);
const RETIRED_REPLICA_STATES = new Set([
  WASM_SERVICE_REPLICA_STATE.STOPPING,
  WASM_SERVICE_REPLICA_STATE.STOPPED,
]);

/**
 * A typed lifecycle refusal.
 * @param {string} code - A WASM_SERVICE_LIFECYCLE_REFUSAL.
 * @param {string} message
 * @param {string} serviceId
 * @return {Error}
 */
function lifecycleRefusal(code, message, serviceId) {
  const error = new Error(message);
  error.code = code;
  error.serviceId = serviceId;
  return error;
}

/**
 * Manages the full lifecycle of WasmServiceReplica instances.
 * Tracks active replicas by serviceId and coordinates startup
 * and shutdown sequences.
 */
class WasmServiceLifecycle {
  /**
   * @param {Object} [dependencies] - The owner of the node dependencies a
   *   replica runs on, read when a replica is created or started (a node's
   *   router exists only after its startup wiring): portAllocator,
   *   moduleMirror, messageRouter, nodeId, cdcIntegrationService,
   *   roleUpdateWriter, leaderNodeUpdateWriter, and dataDirectoryManager
   *   (the node's own data directory unless the owner supplies one). An
   *   absent port allocator or module mirror is a typed start refusal,
   *   never a locally built substitute.
   */
  constructor(dependencies = {}) {
    this.dependencies = dependencies;

    /** @type {Map<string, WasmServiceReplica>} */
    this.activeReplicas = new Map();

    /** @type {Map<string, Object>} */
    this.startDiagnostics = new Map();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        WASM_SERVICE_SUBSYSTEM.LIFECYCLE,
      ) : console;

    if (this.moduleMirror &&
      typeof this.moduleMirror.bindCdcIntegrationService === 'function' &&
      this.cdcIntegrationService) {
      this.moduleMirror.bindCdcIntegrationService(
        this.cdcIntegrationService,
      );
    }
  }

  /** @return {DataDirectoryManager} The owner of replica database paths. */
  get dataDirectoryManager() {
    return this.dependencies.dataDirectoryManager ||
      DataDirectoryManager.getInstance();
  }

  /** @return {Object|null} The node's WASM service port allocator. */
  get portAllocator() {
    return this.dependencies.portAllocator || null;
  }

  /** @return {Object|null} The node's WASM module mirror. */
  get moduleMirror() {
    return this.dependencies.moduleMirror || null;
  }

  /** @return {Object|null} The node's message router. */
  get messageRouter() {
    return this.dependencies.messageRouter || null;
  }

  /** @return {string} The hosting node's identity. */
  get nodeId() {
    return this.dependencies.nodeId;
  }

  /** @return {Object|null} The node's CDC integration owner. */
  get cdcIntegrationService() {
    return this.dependencies.cdcIntegrationService || null;
  }

  /** @return {Object|null} The replica role publication writer. */
  get roleUpdateWriter() {
    return this.dependencies.roleUpdateWriter || null;
  }

  /** @return {Object|null} The replica leader publication writer. */
  get leaderNodeUpdateWriter() {
    return this.dependencies.leaderNodeUpdateWriter || null;
  }

  /**
   * Create a WasmServiceReplica from a service definition
   * and replica configuration. The replica is stored in the
   * active replicas map keyed by serviceId.
   *
   * @param {Object} serviceDefinition - Service definition
   *   with serviceId, handlerFunctionId, readConsistency,
   *   writeConsistency, safetyIntervalMs fields.
   * @param {Object} replicaConfig - The replica's founding identity:
   *   replicaId and replicaIds. Its durable database path is the data
   *   directory's, never the caller's.
   * A replica still starting or ready for the serviceId is never replaced
   * (that would orphan it): creation is refused typed (REPLICA_LIVE) until
   * its stop has begun; a successor created while the old replica stops
   * takes the entry, and the old stop then leaves it in place.
   * @return {WasmServiceReplica} The created replica.
   */
  createReplica(serviceDefinition, replicaConfig) {
    const serviceId = serviceDefinition.serviceId;
    if (this.activeReplicas.get(serviceId)?.live) {
      throw lifecycleRefusal(WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_LIVE,
        WASM_SERVICE_ERROR_MSG.REPLICA_LIVE, serviceId);
    }
    assertFoundingReplicaSet(replicaConfig.replicaId,
      replicaConfig.replicaIds);
    const dbPath = this.dataDirectoryManager.getWasmServiceDbPath(
      serviceId, replicaConfig.replicaId,
    );
    this.dataDirectoryManager.ensureWasmServiceDirExists(serviceId);
    const replica = new WasmServiceReplica({
      replicaId: replicaConfig.replicaId,
      nodeId: this.nodeId,
      replicaIds: replicaConfig.replicaIds,
      transport: this.messageRouter,
      serviceDefinitionId: serviceId,
      dbPath,
      readConsistency: serviceDefinition.readConsistency,
      writeConsistency: serviceDefinition.writeConsistency,
      safetyIntervalMs: serviceDefinition.safetyIntervalMs,
      cdcIntegrationService: this.cdcIntegrationService,
      roleUpdateWriter: this.roleUpdateWriter,
      leaderNodeUpdateWriter: this.leaderNodeUpdateWriter,
    });

    this.activeReplicas.set(serviceId, replica);

    this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_CREATED, {
      serviceId,
      replicaId: replicaConfig.replicaId,
      nodeId: this.nodeId,
    });

    return replica;
  }

  /**
   * Start a replica: refuse it typed when its module or the node's port
   * allocator is unavailable, otherwise allocate its port, open its
   * consensus on the raft-rs operation port, and build its endpoint. A
   * consensus start refusal releases the port and reports the refusal.
   *
   * @param {string} serviceId - The service ID of the
   *   replica to start.
   * @param {Object} [startOptions] - Optional start params.
   * @param {string} [startOptions.handlerFunctionId] -
   *   Handler function ID for module mirror check.
   * @param {string} [startOptions.moduleVersion] - Expected
   *   module version string.
   * @param {string} [startOptions.address] - Node address
   *   for endpoint registration.
   * @param {Object} [startOptions.serviceDefinition] -
   *   Service definition for endpoint building.
   * @return {Promise<{
   *   started: boolean,
   *   port?: number,
   *   endpoint?: Object|null,
   *   error?: string,
   *   diagnostic?: Object|null,
   * }|null>} Startup result, or null when not found.
   */
  async startReplica(serviceId, startOptions = {}) {
    const replica = this.activeReplicas.get(serviceId);
    if (!replica) {
      return null;
    }

    const refusal = this.resolveStartRefusal(startOptions);
    if (refusal) {
      return this.refuseStart(serviceId, startOptions, refusal);
    }

    // A replica whose stop began is retired: refused before any port is
    // allocated for it, so no allocate/release pair can outlive it.
    if (RETIRED_REPLICA_STATES.has(replica.lifecycleState)) {
      return this.refuseStart(serviceId, startOptions, {
        code: WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_RETIRED,
        error: WASM_SERVICE_ERROR_MSG.REPLICA_RETIRED,
      }, replica);
    }

    this.clearStartDiagnostic(serviceId);

    const port = this.portAllocator.allocate(serviceId);

    this.logger.info(WASM_SERVICE_LOG_MSG.PORT_ALLOCATED, {
      serviceId,
      port,
    });

    // A replica whose stop began is refused typed by its own initialize
    // (REPLICA_RETIRED); a successor is a new replica. Everything after the
    // await is keyed by serviceId: the start diagnostic is recorded only
    // while this replica still holds the entry, and the serviceId's port is
    // released unless a starting or ready successor now holds it.
    try {
      await replica.initialize();
    } catch (cause) {
      if (!this.successorHoldsPort(serviceId, replica)) {
        this.portAllocator.release(serviceId);
      }
      return this.refuseStart(serviceId, startOptions, {
        code: cause.code || START_DIAGNOSTIC_CODE.CONSENSUS_START_REFUSED,
        error: cause.message,
      }, replica);
    }
    if (!replica.initialized) {
      // Its stop began while this start awaited: the stop released the
      // port and owns the replica's retirement.
      return this.refuseStart(serviceId, startOptions, {
        code: WASM_SERVICE_LIFECYCLE_REFUSAL.STOPPED_DURING_START,
        error: WASM_SERVICE_ERROR_MSG.STOPPED_DURING_START,
      }, replica);
    }

    const endpoint = this.registerEndpoint(serviceId, startOptions, port);

    replica.portAllocation = port;

    this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STARTED, {
      serviceId,
      port,
    });

    return {
      [START_RESULT_FIELD.STARTED]: true,
      [START_RESULT_FIELD.PORT]: port,
      [START_RESULT_FIELD.ENDPOINT]: endpoint,
      [START_RESULT_FIELD.DIAGNOSTIC]: null,
    };
  }

  /**
   * Whether a replica other than `replica` holds the serviceId's port: the
   * allocation is per serviceId, and a starting or ready successor
   * allocated it before its own initialization.
   * @param {string} serviceId
   * @param {WasmServiceReplica} replica
   * @return {boolean}
   * @private
   */
  successorHoldsPort(serviceId, replica) {
    const current = this.activeReplicas.get(serviceId);
    return Boolean(current) && current !== replica &&
      PORT_HOLDING_REPLICA_STATES.has(current.lifecycleState);
  }

  /**
   * The typed refusal of a start whose module or port allocator is absent.
   * @param {Object} startOptions
   * @return {{code: string, error: string}|null}
   * @private
   */
  resolveStartRefusal(startOptions) {
    const moduleFailure = this.resolveModuleFailure(startOptions);
    if (moduleFailure) {
      return {
        code: moduleFailure.code,
        error: WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE,
      };
    }
    if (!this.portAllocator) {
      return {
        code: START_DIAGNOSTIC_CODE.PORT_ALLOCATOR_UNAVAILABLE,
        error: WASM_SERVICE_ERROR_MSG.PORT_ALLOCATOR_UNAVAILABLE,
      };
    }
    return null;
  }

  /**
   * Record and report a refused start. A start refused for a particular
   * replica records its diagnostic only while that replica holds the
   * serviceId's entry; a removed or replaced replica's refusal is reported
   * to its caller and logged, never recorded over the entry's owner.
   * @param {string} serviceId
   * @param {Object} startOptions
   * @param {{code: string, error: string}} refusal
   * @param {WasmServiceReplica|null} [replica] The replica the start ran for.
   * @return {{started: boolean, error: string, diagnostic: Object}}
   * @private
   */
  refuseStart(serviceId, startOptions, refusal, replica = null) {
    const ownsEntry = replica === null ||
      this.activeReplicas.get(serviceId) === replica;
    const record = ownsEntry ?
      (entry) => this.recordStartDiagnostic(serviceId, entry) :
      (entry) => entry;
    const diagnostic = record({
      [START_DIAGNOSTIC_FIELD.CODE]: refusal.code,
      [START_DIAGNOSTIC_FIELD.SERVICE_ID]: serviceId,
      [START_DIAGNOSTIC_FIELD.HANDLER_FUNCTION_ID]:
        startOptions.handlerFunctionId,
      [START_DIAGNOSTIC_FIELD.MODULE_VERSION]:
        startOptions.moduleVersion || null,
      [START_DIAGNOSTIC_FIELD.NODE_ID]: this.nodeId,
      [START_DIAGNOSTIC_FIELD.TIMESTAMP]: Date.now(),
    });

    this.logger.error(refusal.error, {
      serviceId,
      handlerFunctionId: startOptions.handlerFunctionId,
      moduleVersion: startOptions.moduleVersion || null,
      diagnosticCode: refusal.code,
    });

    return {
      [START_RESULT_FIELD.STARTED]: false,
      [START_RESULT_FIELD.ERROR]: refusal.error,
      [START_RESULT_FIELD.DIAGNOSTIC]: diagnostic,
    };
  }

  /**
   * Build the started replica's endpoint record when its definition is
   * known.
   * @param {string} serviceId
   * @param {Object} startOptions
   * @param {number} port
   * @return {Object|null}
   * @private
   */
  registerEndpoint(serviceId, startOptions, port) {
    if (!startOptions.serviceDefinition) {
      return null;
    }
    const endpoint = buildEndpointRecord({
      serviceDefinition: startOptions.serviceDefinition,
      nodeId: this.nodeId,
      address: startOptions.address || this.nodeId,
      port,
    });

    this.logger.info(
      WASM_SERVICE_LOG_MSG.ENDPOINT_REGISTERED, {
        serviceId,
        port,
        endpointId: endpoint.endpoint_id,
      },
    );
    return endpoint;
  }

  /**
   * Stop a replica by releasing its port, shutting it down,
   * and removing it from the active replicas map. Removal is by exact
   * identity: a successor created for the serviceId while this replica
   * stopped keeps its entry (and its start diagnostic).
   *
   * @param {string} serviceId - The service ID of the
   *   replica to stop.
   * @return {Promise<{stopped: boolean}>} Shutdown result.
   */
  async stopReplica(serviceId) {
    const replica = this.activeReplicas.get(serviceId);
    if (!replica) {
      return {stopped: false};
    }

    // A replica refused before its start holds no port to release.
    this.portAllocator?.release(serviceId);

    this.logger.info(WASM_SERVICE_LOG_MSG.PORT_RELEASED, {
      serviceId,
    });

    await replica.shutdown();

    if (this.activeReplicas.get(serviceId) === replica) {
      this.activeReplicas.delete(serviceId);
      this.clearStartDiagnostic(serviceId);
    }

    this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STOPPED, {
      serviceId,
    });

    return {stopped: true};
  }

  /**
   * Get an active replica by serviceId.
   *
   * @param {string} serviceId - The service ID to look up.
   * @return {WasmServiceReplica|null} The replica or null
   *   if not found.
   */
  getReplica(serviceId) {
    return this.activeReplicas.get(serviceId) ?? null;
  }

  /**
   * Get all active replicas as a Map.
   *
   * @return {Map<string, WasmServiceReplica>} Map of
   *   serviceId to replica.
   */
  getActiveReplicas() {
    return this.activeReplicas;
  }

  /**
   * Return the latest startup diagnostic for a service.
   * @param {string} serviceId
   * @return {Object|null}
   */
  getStartDiagnostic(serviceId) {
    return this.startDiagnostics.get(serviceId) || null;
  }

  /**
   * Resolve missing module failures for fail-closed startup.
   * @param {Object} startOptions
   * @return {{code: string}|null}
   * @private
   */
  resolveModuleFailure(startOptions) {
    const handlerFunctionId = startOptions.handlerFunctionId;
    if (!handlerFunctionId) {
      return null;
    }

    if (!this.moduleMirror) {
      return {code: START_DIAGNOSTIC_CODE.MODULE_MIRROR_MISSING};
    }

    const moduleVersion = startOptions.moduleVersion;
    if (moduleVersion) {
      const hasModule = this.moduleMirror.hasModule(
        handlerFunctionId,
        moduleVersion,
      );
      if (!hasModule) {
        return {code: START_DIAGNOSTIC_CODE.MODULE_UNAVAILABLE};
      }
      return null;
    }

    const moduleEntry = this.moduleMirror.getModule(handlerFunctionId);
    if (!moduleEntry) {
      return {code: START_DIAGNOSTIC_CODE.MODULE_UNAVAILABLE};
    }

    return null;
  }

  /**
   * Persist startup diagnostic state.
   * @param {string} serviceId
   * @param {Object} diagnostic
   * @return {Object}
   * @private
   */
  recordStartDiagnostic(serviceId, diagnostic) {
    this.startDiagnostics.set(serviceId, diagnostic);
    return diagnostic;
  }

  /**
   * Clear startup diagnostic for service.
   * @param {string} serviceId
   * @private
   */
  clearStartDiagnostic(serviceId) {
    this.startDiagnostics.delete(serviceId);
  }

  /**
   * Shutdown all active replicas. Releases ports and calls
   * shutdown on each replica.
   *
   * @return {Promise<void>}
   */
  async shutdownAll() {
    const serviceIds = [...this.activeReplicas.keys()];
    for (const serviceId of serviceIds) {
      await this.stopReplica(serviceId);
    }

    if (this.moduleMirror &&
      typeof this.moduleMirror.unbindCdcIntegrationService === 'function') {
      this.moduleMirror.unbindCdcIntegrationService();
    }
  }
}

export {WasmServiceLifecycle, REPLICA_LIFECYCLE_STATE};
