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
import { LoggingService } from '../logging/logging-service.js';
import { TYPEOF } from '../constants/index.js';
import { WasmServiceReplica } from './wasm-service-replica.js';
import { buildEndpointRecord } from './service-endpoint-builder.js';
import { WASM_SERVICE_SUBSYSTEM, WASM_SERVICE_LOG_MSG, WASM_SERVICE_ERROR_MSG } from './wasm-service-constants.js';
const START_RESULT_FIELD = Object.freeze(stryMutAct_9fa48("163857") ? {} : (stryCov_9fa48("163857"), {
  STARTED: stryMutAct_9fa48("163858") ? "" : (stryCov_9fa48("163858"), 'started'),
  PORT: stryMutAct_9fa48("163859") ? "" : (stryCov_9fa48("163859"), 'port'),
  ENDPOINT: stryMutAct_9fa48("163860") ? "" : (stryCov_9fa48("163860"), 'endpoint'),
  ERROR: stryMutAct_9fa48("163861") ? "" : (stryCov_9fa48("163861"), 'error'),
  DIAGNOSTIC: stryMutAct_9fa48("163862") ? "" : (stryCov_9fa48("163862"), 'diagnostic')
}));
const START_DIAGNOSTIC_FIELD = Object.freeze(stryMutAct_9fa48("163863") ? {} : (stryCov_9fa48("163863"), {
  CODE: stryMutAct_9fa48("163864") ? "" : (stryCov_9fa48("163864"), 'code'),
  SERVICE_ID: stryMutAct_9fa48("163865") ? "" : (stryCov_9fa48("163865"), 'serviceId'),
  HANDLER_FUNCTION_ID: stryMutAct_9fa48("163866") ? "" : (stryCov_9fa48("163866"), 'handlerFunctionId'),
  MODULE_VERSION: stryMutAct_9fa48("163867") ? "" : (stryCov_9fa48("163867"), 'moduleVersion'),
  NODE_ID: stryMutAct_9fa48("163868") ? "" : (stryCov_9fa48("163868"), 'nodeId'),
  TIMESTAMP: stryMutAct_9fa48("163869") ? "" : (stryCov_9fa48("163869"), 'timestamp')
}));
const START_DIAGNOSTIC_CODE = Object.freeze(stryMutAct_9fa48("163870") ? {} : (stryCov_9fa48("163870"), {
  MODULE_UNAVAILABLE: stryMutAct_9fa48("163871") ? "" : (stryCov_9fa48("163871"), 'module_unavailable'),
  MODULE_MIRROR_MISSING: stryMutAct_9fa48("163872") ? "" : (stryCov_9fa48("163872"), 'module_mirror_missing')
}));

/**
 * Lifecycle states for a managed replica.
 * @enum {string}
 */
const REPLICA_LIFECYCLE_STATE = Object.freeze(stryMutAct_9fa48("163873") ? {} : (stryCov_9fa48("163873"), {
  CREATED: stryMutAct_9fa48("163874") ? "" : (stryCov_9fa48("163874"), 'created'),
  STARTING: stryMutAct_9fa48("163875") ? "" : (stryCov_9fa48("163875"), 'starting'),
  READY: stryMutAct_9fa48("163876") ? "" : (stryCov_9fa48("163876"), 'ready'),
  STOPPING: stryMutAct_9fa48("163877") ? "" : (stryCov_9fa48("163877"), 'stopping'),
  STOPPED: stryMutAct_9fa48("163878") ? "" : (stryCov_9fa48("163878"), 'stopped')
}));

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
    if (stryMutAct_9fa48("163879")) {
      {}
    } else {
      stryCov_9fa48("163879");
      this.portAllocator = options.portAllocator;
      this.moduleMirror = options.moduleMirror;
      this.messageRouter = options.messageRouter;
      this.nodeId = options.nodeId;
      this.cdcIntegrationService = stryMutAct_9fa48("163882") ? options.cdcIntegrationService && null : stryMutAct_9fa48("163881") ? false : stryMutAct_9fa48("163880") ? true : (stryCov_9fa48("163880", "163881", "163882"), options.cdcIntegrationService || null);
      this.roleUpdateWriter = stryMutAct_9fa48("163885") ? options.roleUpdateWriter && null : stryMutAct_9fa48("163884") ? false : stryMutAct_9fa48("163883") ? true : (stryCov_9fa48("163883", "163884", "163885"), options.roleUpdateWriter || null);
      this.leaderNodeUpdateWriter = stryMutAct_9fa48("163888") ? options.leaderNodeUpdateWriter && null : stryMutAct_9fa48("163887") ? false : stryMutAct_9fa48("163886") ? true : (stryCov_9fa48("163886", "163887", "163888"), options.leaderNodeUpdateWriter || null);

      /** @type {Map<string, WasmServiceReplica>} */
      this.activeReplicas = new Map();

      /** @type {Map<string, Object>} */
      this.startDiagnostics = new Map();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(WASM_SERVICE_SUBSYSTEM.LIFECYCLE) : console;
      if (stryMutAct_9fa48("163891") ? this.moduleMirror && typeof this.moduleMirror.bindCdcIntegrationService === TYPEOF.FUNCTION || this.cdcIntegrationService : stryMutAct_9fa48("163890") ? false : stryMutAct_9fa48("163889") ? true : (stryCov_9fa48("163889", "163890", "163891"), (stryMutAct_9fa48("163893") ? this.moduleMirror || typeof this.moduleMirror.bindCdcIntegrationService === TYPEOF.FUNCTION : stryMutAct_9fa48("163892") ? true : (stryCov_9fa48("163892", "163893"), this.moduleMirror && (stryMutAct_9fa48("163895") ? typeof this.moduleMirror.bindCdcIntegrationService !== TYPEOF.FUNCTION : stryMutAct_9fa48("163894") ? true : (stryCov_9fa48("163894", "163895"), typeof this.moduleMirror.bindCdcIntegrationService === TYPEOF.FUNCTION)))) && this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("163896")) {
          {}
        } else {
          stryCov_9fa48("163896");
          this.moduleMirror.bindCdcIntegrationService(this.cdcIntegrationService);
        }
      }
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
    if (stryMutAct_9fa48("163897")) {
      {}
    } else {
      stryCov_9fa48("163897");
      const replica = new WasmServiceReplica(stryMutAct_9fa48("163898") ? {} : (stryCov_9fa48("163898"), {
        replicaId: replicaConfig.replicaId,
        nodeId: this.nodeId,
        replicaIds: replicaConfig.replicaIds,
        transport: stryMutAct_9fa48("163901") ? replicaConfig.transport && this.messageRouter : stryMutAct_9fa48("163900") ? false : stryMutAct_9fa48("163899") ? true : (stryCov_9fa48("163899", "163900", "163901"), replicaConfig.transport || this.messageRouter),
        serviceDefinitionId: serviceDefinition.serviceId,
        dbPath: replicaConfig.dbPath,
        readConsistency: serviceDefinition.readConsistency,
        writeConsistency: serviceDefinition.writeConsistency,
        safetyIntervalMs: serviceDefinition.safetyIntervalMs,
        cdcIntegrationService: this.cdcIntegrationService,
        roleUpdateWriter: this.roleUpdateWriter,
        leaderNodeUpdateWriter: this.leaderNodeUpdateWriter
      }));
      this.activeReplicas.set(serviceDefinition.serviceId, replica);
      this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_CREATED, stryMutAct_9fa48("163902") ? {} : (stryCov_9fa48("163902"), {
        serviceId: serviceDefinition.serviceId,
        replicaId: replicaConfig.replicaId,
        nodeId: this.nodeId
      }));
      return replica;
    }
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
    if (stryMutAct_9fa48("163903")) {
      {}
    } else {
      stryCov_9fa48("163903");
      const replica = this.activeReplicas.get(serviceId);
      if (stryMutAct_9fa48("163906") ? false : stryMutAct_9fa48("163905") ? true : stryMutAct_9fa48("163904") ? replica : (stryCov_9fa48("163904", "163905", "163906"), !replica)) {
        if (stryMutAct_9fa48("163907")) {
          {}
        } else {
          stryCov_9fa48("163907");
          return null;
        }
      }
      const moduleFailure = this.resolveModuleFailure(startOptions);
      if (stryMutAct_9fa48("163909") ? false : stryMutAct_9fa48("163908") ? true : (stryCov_9fa48("163908", "163909"), moduleFailure)) {
        if (stryMutAct_9fa48("163910")) {
          {}
        } else {
          stryCov_9fa48("163910");
          const diagnostic = this.recordStartDiagnostic(serviceId, stryMutAct_9fa48("163911") ? {} : (stryCov_9fa48("163911"), {
            [START_DIAGNOSTIC_FIELD.CODE]: moduleFailure.code,
            [START_DIAGNOSTIC_FIELD.SERVICE_ID]: serviceId,
            [START_DIAGNOSTIC_FIELD.HANDLER_FUNCTION_ID]: startOptions.handlerFunctionId,
            [START_DIAGNOSTIC_FIELD.MODULE_VERSION]: stryMutAct_9fa48("163914") ? startOptions.moduleVersion && null : stryMutAct_9fa48("163913") ? false : stryMutAct_9fa48("163912") ? true : (stryCov_9fa48("163912", "163913", "163914"), startOptions.moduleVersion || null),
            [START_DIAGNOSTIC_FIELD.NODE_ID]: this.nodeId,
            [START_DIAGNOSTIC_FIELD.TIMESTAMP]: Date.now()
          }));
          this.logger.error(WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE, stryMutAct_9fa48("163915") ? {} : (stryCov_9fa48("163915"), {
            serviceId,
            handlerFunctionId: startOptions.handlerFunctionId,
            moduleVersion: stryMutAct_9fa48("163918") ? startOptions.moduleVersion && null : stryMutAct_9fa48("163917") ? false : stryMutAct_9fa48("163916") ? true : (stryCov_9fa48("163916", "163917", "163918"), startOptions.moduleVersion || null),
            diagnosticCode: moduleFailure.code
          }));
          return stryMutAct_9fa48("163919") ? {} : (stryCov_9fa48("163919"), {
            [START_RESULT_FIELD.STARTED]: stryMutAct_9fa48("163920") ? true : (stryCov_9fa48("163920"), false),
            [START_RESULT_FIELD.ERROR]: WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE,
            [START_RESULT_FIELD.DIAGNOSTIC]: diagnostic
          });
        }
      }
      this.clearStartDiagnostic(serviceId);
      const port = this.portAllocator.allocate(serviceId);
      this.logger.info(WASM_SERVICE_LOG_MSG.PORT_ALLOCATED, stryMutAct_9fa48("163921") ? {} : (stryCov_9fa48("163921"), {
        serviceId,
        port
      }));
      let endpoint = null;
      if (stryMutAct_9fa48("163923") ? false : stryMutAct_9fa48("163922") ? true : (stryCov_9fa48("163922", "163923"), startOptions.serviceDefinition)) {
        if (stryMutAct_9fa48("163924")) {
          {}
        } else {
          stryCov_9fa48("163924");
          endpoint = buildEndpointRecord(stryMutAct_9fa48("163925") ? {} : (stryCov_9fa48("163925"), {
            serviceDefinition: startOptions.serviceDefinition,
            nodeId: this.nodeId,
            address: stryMutAct_9fa48("163928") ? startOptions.address && this.nodeId : stryMutAct_9fa48("163927") ? false : stryMutAct_9fa48("163926") ? true : (stryCov_9fa48("163926", "163927", "163928"), startOptions.address || this.nodeId),
            port
          }));
          this.logger.info(WASM_SERVICE_LOG_MSG.ENDPOINT_REGISTERED, stryMutAct_9fa48("163929") ? {} : (stryCov_9fa48("163929"), {
            serviceId,
            port,
            endpointId: endpoint.endpoint_id
          }));
        }
      }
      replica.portAllocation = port;
      this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STARTED, stryMutAct_9fa48("163930") ? {} : (stryCov_9fa48("163930"), {
        serviceId,
        port
      }));
      return stryMutAct_9fa48("163931") ? {} : (stryCov_9fa48("163931"), {
        [START_RESULT_FIELD.STARTED]: stryMutAct_9fa48("163932") ? false : (stryCov_9fa48("163932"), true),
        [START_RESULT_FIELD.PORT]: port,
        [START_RESULT_FIELD.ENDPOINT]: endpoint,
        [START_RESULT_FIELD.DIAGNOSTIC]: null
      });
    }
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
    if (stryMutAct_9fa48("163933")) {
      {}
    } else {
      stryCov_9fa48("163933");
      const replica = this.activeReplicas.get(serviceId);
      if (stryMutAct_9fa48("163936") ? false : stryMutAct_9fa48("163935") ? true : stryMutAct_9fa48("163934") ? replica : (stryCov_9fa48("163934", "163935", "163936"), !replica)) {
        if (stryMutAct_9fa48("163937")) {
          {}
        } else {
          stryCov_9fa48("163937");
          return stryMutAct_9fa48("163938") ? {} : (stryCov_9fa48("163938"), {
            stopped: stryMutAct_9fa48("163939") ? true : (stryCov_9fa48("163939"), false)
          });
        }
      }
      this.portAllocator.release(serviceId);
      this.logger.info(WASM_SERVICE_LOG_MSG.PORT_RELEASED, stryMutAct_9fa48("163940") ? {} : (stryCov_9fa48("163940"), {
        serviceId
      }));
      await replica.shutdown();
      this.activeReplicas.delete(serviceId);
      this.clearStartDiagnostic(serviceId);
      this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STOPPED, stryMutAct_9fa48("163941") ? {} : (stryCov_9fa48("163941"), {
        serviceId
      }));
      return stryMutAct_9fa48("163942") ? {} : (stryCov_9fa48("163942"), {
        stopped: stryMutAct_9fa48("163943") ? false : (stryCov_9fa48("163943"), true)
      });
    }
  }

  /**
   * Get an active replica by serviceId.
   *
   * @param {string} serviceId - The service ID to look up.
   * @return {WasmServiceReplica|null} The replica or null
   *   if not found.
   */
  getReplica(serviceId) {
    if (stryMutAct_9fa48("163944")) {
      {}
    } else {
      stryCov_9fa48("163944");
      return stryMutAct_9fa48("163945") ? this.activeReplicas.get(serviceId) && null : (stryCov_9fa48("163945"), this.activeReplicas.get(serviceId) ?? null);
    }
  }

  /**
   * Get all active replicas as a Map.
   *
   * @return {Map<string, WasmServiceReplica>} Map of
   *   serviceId to replica.
   */
  getActiveReplicas() {
    if (stryMutAct_9fa48("163946")) {
      {}
    } else {
      stryCov_9fa48("163946");
      return this.activeReplicas;
    }
  }

  /**
   * Return the latest startup diagnostic for a service.
   * @param {string} serviceId
   * @return {Object|null}
   */
  getStartDiagnostic(serviceId) {
    if (stryMutAct_9fa48("163947")) {
      {}
    } else {
      stryCov_9fa48("163947");
      return stryMutAct_9fa48("163950") ? this.startDiagnostics.get(serviceId) && null : stryMutAct_9fa48("163949") ? false : stryMutAct_9fa48("163948") ? true : (stryCov_9fa48("163948", "163949", "163950"), this.startDiagnostics.get(serviceId) || null);
    }
  }

  /**
   * Resolve missing module failures for fail-closed startup.
   * @param {Object} startOptions
   * @return {{code: string}|null}
   * @private
   */
  resolveModuleFailure(startOptions) {
    if (stryMutAct_9fa48("163951")) {
      {}
    } else {
      stryCov_9fa48("163951");
      const handlerFunctionId = startOptions.handlerFunctionId;
      if (stryMutAct_9fa48("163954") ? false : stryMutAct_9fa48("163953") ? true : stryMutAct_9fa48("163952") ? handlerFunctionId : (stryCov_9fa48("163952", "163953", "163954"), !handlerFunctionId)) {
        if (stryMutAct_9fa48("163955")) {
          {}
        } else {
          stryCov_9fa48("163955");
          return null;
        }
      }
      if (stryMutAct_9fa48("163958") ? false : stryMutAct_9fa48("163957") ? true : stryMutAct_9fa48("163956") ? this.moduleMirror : (stryCov_9fa48("163956", "163957", "163958"), !this.moduleMirror)) {
        if (stryMutAct_9fa48("163959")) {
          {}
        } else {
          stryCov_9fa48("163959");
          return stryMutAct_9fa48("163960") ? {} : (stryCov_9fa48("163960"), {
            code: START_DIAGNOSTIC_CODE.MODULE_MIRROR_MISSING
          });
        }
      }
      const moduleVersion = startOptions.moduleVersion;
      if (stryMutAct_9fa48("163962") ? false : stryMutAct_9fa48("163961") ? true : (stryCov_9fa48("163961", "163962"), moduleVersion)) {
        if (stryMutAct_9fa48("163963")) {
          {}
        } else {
          stryCov_9fa48("163963");
          const hasModule = this.moduleMirror.hasModule(handlerFunctionId, moduleVersion);
          if (stryMutAct_9fa48("163966") ? false : stryMutAct_9fa48("163965") ? true : stryMutAct_9fa48("163964") ? hasModule : (stryCov_9fa48("163964", "163965", "163966"), !hasModule)) {
            if (stryMutAct_9fa48("163967")) {
              {}
            } else {
              stryCov_9fa48("163967");
              return stryMutAct_9fa48("163968") ? {} : (stryCov_9fa48("163968"), {
                code: START_DIAGNOSTIC_CODE.MODULE_UNAVAILABLE
              });
            }
          }
          return null;
        }
      }
      const moduleEntry = this.moduleMirror.getModule(handlerFunctionId);
      if (stryMutAct_9fa48("163971") ? false : stryMutAct_9fa48("163970") ? true : stryMutAct_9fa48("163969") ? moduleEntry : (stryCov_9fa48("163969", "163970", "163971"), !moduleEntry)) {
        if (stryMutAct_9fa48("163972")) {
          {}
        } else {
          stryCov_9fa48("163972");
          return stryMutAct_9fa48("163973") ? {} : (stryCov_9fa48("163973"), {
            code: START_DIAGNOSTIC_CODE.MODULE_UNAVAILABLE
          });
        }
      }
      return null;
    }
  }

  /**
   * Persist startup diagnostic state.
   * @param {string} serviceId
   * @param {Object} diagnostic
   * @return {Object}
   * @private
   */
  recordStartDiagnostic(serviceId, diagnostic) {
    if (stryMutAct_9fa48("163974")) {
      {}
    } else {
      stryCov_9fa48("163974");
      this.startDiagnostics.set(serviceId, diagnostic);
      return diagnostic;
    }
  }

  /**
   * Clear startup diagnostic for service.
   * @param {string} serviceId
   * @private
   */
  clearStartDiagnostic(serviceId) {
    if (stryMutAct_9fa48("163975")) {
      {}
    } else {
      stryCov_9fa48("163975");
      this.startDiagnostics.delete(serviceId);
    }
  }

  /**
   * Shutdown all active replicas. Releases ports and calls
   * shutdown on each replica.
   *
   * @return {Promise<void>}
   */
  async shutdownAll() {
    if (stryMutAct_9fa48("163976")) {
      {}
    } else {
      stryCov_9fa48("163976");
      const serviceIds = stryMutAct_9fa48("163977") ? [] : (stryCov_9fa48("163977"), [...this.activeReplicas.keys()]);
      for (const serviceId of serviceIds) {
        if (stryMutAct_9fa48("163978")) {
          {}
        } else {
          stryCov_9fa48("163978");
          await this.stopReplica(serviceId);
        }
      }
      if (stryMutAct_9fa48("163981") ? this.moduleMirror || typeof this.moduleMirror.unbindCdcIntegrationService === TYPEOF.FUNCTION : stryMutAct_9fa48("163980") ? false : stryMutAct_9fa48("163979") ? true : (stryCov_9fa48("163979", "163980", "163981"), this.moduleMirror && (stryMutAct_9fa48("163983") ? typeof this.moduleMirror.unbindCdcIntegrationService !== TYPEOF.FUNCTION : stryMutAct_9fa48("163982") ? true : (stryCov_9fa48("163982", "163983"), typeof this.moduleMirror.unbindCdcIntegrationService === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("163984")) {
          {}
        } else {
          stryCov_9fa48("163984");
          this.moduleMirror.unbindCdcIntegrationService();
        }
      }
    }
  }
}
export { WasmServiceLifecycle, REPLICA_LIFECYCLE_STATE };