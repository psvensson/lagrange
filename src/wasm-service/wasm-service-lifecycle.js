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
import {WasmServiceReplica} from './wasm-service-replica.js';
import {buildEndpointRecord} from './service-endpoint-builder.js';
import {
  WASM_SERVICE_SUBSYSTEM,
  WASM_SERVICE_LOG_MSG,
  WASM_SERVICE_ERROR_MSG,
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
});

/**
 * Lifecycle states for a managed replica.
 * @enum {string}
 */
const REPLICA_LIFECYCLE_STATE = Object.freeze({
  CREATED: 'created',
  STARTING: 'starting',
  READY: 'ready',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
});

/**
 * Manages the full lifecycle of WasmServiceReplica instances.
 * Tracks active replicas by serviceId and coordinates startup
 * and shutdown sequences.
 */
class WasmServiceLifecycle {
  /**
   * @param {Object} options - Configuration options.
   * @param {import('./port-allocator.js').PortAllocator}
   *   options.portAllocator - Node-level port allocator.
   * @param {import('./module-mirror.js').ModuleMirror}
   *   options.moduleMirror - Local WASM module cache.
   * @param {Object} options.messageRouter - MessageRouter
   *   instance for replica transport.
   * @param {string} options.nodeId - ID of the hosting node.
   */
  constructor(options = {}) {
    this.portAllocator = options.portAllocator;
    this.moduleMirror = options.moduleMirror;
    this.messageRouter = options.messageRouter;
    this.nodeId = options.nodeId;
    this.cdcIntegrationService =
      options.cdcIntegrationService || null;
    this.roleUpdateWriter = options.roleUpdateWriter || null;
    this.leaderNodeUpdateWriter =
      options.leaderNodeUpdateWriter || null;

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

  /**
   * Create a WasmServiceReplica from a service definition
   * and replica configuration. The replica is stored in the
   * active replicas map keyed by serviceId.
   *
   * @param {Object} serviceDefinition - Service definition
   *   with serviceId, handlerFunctionId, readConsistency,
   *   writeConsistency, safetyIntervalMs fields.
   * @param {Object} replicaConfig - Replica configuration
   *   with replicaId, replicaIds, dbPath, transport fields.
   * @return {WasmServiceReplica} The created replica.
   */
  createReplica(serviceDefinition, replicaConfig) {
    const replica = new WasmServiceReplica({
      replicaId: replicaConfig.replicaId,
      nodeId: this.nodeId,
      replicaIds: replicaConfig.replicaIds,
      transport: replicaConfig.transport || this.messageRouter,
      serviceDefinitionId: serviceDefinition.serviceId,
      dbPath: replicaConfig.dbPath,
      readConsistency: serviceDefinition.readConsistency,
      writeConsistency: serviceDefinition.writeConsistency,
      safetyIntervalMs: serviceDefinition.safetyIntervalMs,
      cdcIntegrationService: this.cdcIntegrationService,
      roleUpdateWriter: this.roleUpdateWriter,
      leaderNodeUpdateWriter: this.leaderNodeUpdateWriter,
    });

    this.activeReplicas.set(
      serviceDefinition.serviceId, replica,
    );

    this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_CREATED, {
      serviceId: serviceDefinition.serviceId,
      replicaId: replicaConfig.replicaId,
      nodeId: this.nodeId,
    });

    return replica;
  }

  /**
   * Start a replica by checking module availability,
   * allocating a port, and building an endpoint record.
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
   * @return {{
   *   started: boolean,
   *   port?: number,
   *   endpoint?: Object|null,
   *   error?: string,
   *   diagnostic?: Object|null,
   * }|null} Startup result, or null when not found.
   */
  startReplica(serviceId, startOptions = {}) {
    const replica = this.activeReplicas.get(serviceId);
    if (!replica) {
      return null;
    }

    const moduleFailure = this.resolveModuleFailure(startOptions);
    if (moduleFailure) {
      const diagnostic = this.recordStartDiagnostic(serviceId, {
        [START_DIAGNOSTIC_FIELD.CODE]: moduleFailure.code,
        [START_DIAGNOSTIC_FIELD.SERVICE_ID]: serviceId,
        [START_DIAGNOSTIC_FIELD.HANDLER_FUNCTION_ID]:
          startOptions.handlerFunctionId,
        [START_DIAGNOSTIC_FIELD.MODULE_VERSION]:
          startOptions.moduleVersion || null,
        [START_DIAGNOSTIC_FIELD.NODE_ID]: this.nodeId,
        [START_DIAGNOSTIC_FIELD.TIMESTAMP]: Date.now(),
      });

      this.logger.error(WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE, {
        serviceId,
        handlerFunctionId: startOptions.handlerFunctionId,
        moduleVersion: startOptions.moduleVersion || null,
        diagnosticCode: moduleFailure.code,
      });

      return {
        [START_RESULT_FIELD.STARTED]: false,
        [START_RESULT_FIELD.ERROR]: WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE,
        [START_RESULT_FIELD.DIAGNOSTIC]: diagnostic,
      };
    }

    this.clearStartDiagnostic(serviceId);

    const port = this.portAllocator.allocate(serviceId);

    this.logger.info(WASM_SERVICE_LOG_MSG.PORT_ALLOCATED, {
      serviceId,
      port,
    });

    let endpoint = null;
    if (startOptions.serviceDefinition) {
      endpoint = buildEndpointRecord({
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
    }

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
   * Stop a replica by releasing its port, shutting it down,
   * and removing it from the active replicas map.
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

    this.portAllocator.release(serviceId);

    this.logger.info(WASM_SERVICE_LOG_MSG.PORT_RELEASED, {
      serviceId,
    });

    await replica.shutdown();

    this.activeReplicas.delete(serviceId);
    this.clearStartDiagnostic(serviceId);

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
