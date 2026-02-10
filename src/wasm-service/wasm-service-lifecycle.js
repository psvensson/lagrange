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

    /** @type {Map<string, WasmServiceReplica>} */
    this.activeReplicas = new Map();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        WASM_SERVICE_SUBSYSTEM.LIFECYCLE,
      ) : console;
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
   * @return {{port: number, endpoint: Object}|null} Startup
   *   result with allocated port and endpoint record, or
   *   null if the replica is not found.
   */
  startReplica(serviceId, startOptions = {}) {
    const replica = this.activeReplicas.get(serviceId);
    if (!replica) {
      return null;
    }

    if (startOptions.handlerFunctionId) {
      const hasModule = this.moduleMirror.hasModule(
        startOptions.handlerFunctionId,
        startOptions.moduleVersion,
      );
      if (!hasModule) {
        this.logger.info(
          WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE, {
            serviceId,
            handlerFunctionId:
              startOptions.handlerFunctionId,
          },
        );
      }
    }

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

    return {port, endpoint};
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
  }
}

export {WasmServiceLifecycle, REPLICA_LIFECYCLE_STATE};
