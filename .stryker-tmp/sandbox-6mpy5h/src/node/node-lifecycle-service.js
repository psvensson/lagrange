/**
 * Node Lifecycle Service - Manages node lifecycle events via CDC.
 * Ensures all node state changes go through system table partitions.
 *
 * This service is a write-only helper for node registration, heartbeat,
 * and removal. Failure detection is owned solely by FailureDetector.
 *
 * Requirements: 5.6, 5.7, 5.8
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
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { NUM } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { NODE_CONFIG_KEY, NODE_LIFECYCLE_DEFAULT, NODE_LIFECYCLE_SERVICE_ERROR_MSG, NODE_LIFECYCLE_SERVICE_EVENT, NODE_LIFECYCLE_SERVICE_LOG_MSG, NODE_LIFECYCLE_SERVICE_SUBSYSTEM, NODE_STATUS } from './node-constants.js';
const NodeLifecycleStatus = NODE_STATUS;

/**
 * NodeLifecycleService manages node lifecycle events via CDC.
 * All node state changes go through the CDCIntegrationService to ensure
 * cache consistency across all nodes.
 *
 * This service handles write-only operations: registration, heartbeat
 * updates, and node removal. Failure detection (heartbeat timeout
 * checking, suspicion, failure marking) is the sole responsibility
 * of FailureDetector.
 */
class NodeLifecycleService extends EventEmitter {
  /**
   * Create a new NodeLifecycleService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("92726")) {
      {}
    } else {
      stryCov_9fa48("92726");
      super();
      this.cdcIntegrationService = stryMutAct_9fa48("92729") ? options.cdcIntegrationService && null : stryMutAct_9fa48("92728") ? false : stryMutAct_9fa48("92727") ? true : (stryCov_9fa48("92727", "92728", "92729"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("92732") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("92731") ? false : stryMutAct_9fa48("92730") ? true : (stryCov_9fa48("92730", "92731", "92732"), options.controlPlaneSystemTableGateway || null);
      this.nodeId = stryMutAct_9fa48("92735") ? options.nodeId && null : stryMutAct_9fa48("92734") ? false : stryMutAct_9fa48("92733") ? true : (stryCov_9fa48("92733", "92734", "92735"), options.nodeId || null);

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.heartbeatIntervalMs = stryMutAct_9fa48("92738") ? config.get(NODE_CONFIG_KEY.HEARTBEAT_INTERVAL_MS) && NODE_LIFECYCLE_DEFAULT.HEARTBEAT_INTERVAL_MS : stryMutAct_9fa48("92737") ? false : stryMutAct_9fa48("92736") ? true : (stryCov_9fa48("92736", "92737", "92738"), config.get(NODE_CONFIG_KEY.HEARTBEAT_INTERVAL_MS) || NODE_LIFECYCLE_DEFAULT.HEARTBEAT_INTERVAL_MS);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(NODE_LIFECYCLE_SERVICE_SUBSYSTEM) : console;

      // Heartbeat timer
      this.heartbeatTimer = null;
      this.initialized = stryMutAct_9fa48("92739") ? true : (stryCov_9fa48("92739"), false);
    }
  }

  /**
   * Initialize the node lifecycle service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {string} options.nodeId - This node's ID.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("92740")) {
      {}
    } else {
      stryCov_9fa48("92740");
      if (stryMutAct_9fa48("92742") ? false : stryMutAct_9fa48("92741") ? true : (stryCov_9fa48("92741", "92742"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("92743")) {
          {}
        } else {
          stryCov_9fa48("92743");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("92745") ? false : stryMutAct_9fa48("92744") ? true : (stryCov_9fa48("92744", "92745"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("92746")) {
          {}
        } else {
          stryCov_9fa48("92746");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("92748") ? false : stryMutAct_9fa48("92747") ? true : (stryCov_9fa48("92747", "92748"), options.nodeId)) {
        if (stryMutAct_9fa48("92749")) {
          {}
        } else {
          stryCov_9fa48("92749");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("92752") ? !this.cdcIntegrationService || !this.controlPlaneSystemTableGateway : stryMutAct_9fa48("92751") ? false : stryMutAct_9fa48("92750") ? true : (stryCov_9fa48("92750", "92751", "92752"), (stryMutAct_9fa48("92753") ? this.cdcIntegrationService : (stryCov_9fa48("92753"), !this.cdcIntegrationService)) && (stryMutAct_9fa48("92754") ? this.controlPlaneSystemTableGateway : (stryCov_9fa48("92754"), !this.controlPlaneSystemTableGateway)))) {
        if (stryMutAct_9fa48("92755")) {
          {}
        } else {
          stryCov_9fa48("92755");
          throw new Error(NODE_LIFECYCLE_SERVICE_ERROR_MSG.MISSING_CDC);
        }
      }
      if (stryMutAct_9fa48("92758") ? false : stryMutAct_9fa48("92757") ? true : stryMutAct_9fa48("92756") ? this.nodeId : (stryCov_9fa48("92756", "92757", "92758"), !this.nodeId)) {
        if (stryMutAct_9fa48("92759")) {
          {}
        } else {
          stryCov_9fa48("92759");
          throw new Error(NODE_LIFECYCLE_SERVICE_ERROR_MSG.MISSING_NODE_ID);
        }
      }
      this.initialized = stryMutAct_9fa48("92760") ? false : (stryCov_9fa48("92760"), true);
      this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.INITIALIZED, stryMutAct_9fa48("92761") ? {} : (stryCov_9fa48("92761"), {
        nodeId: this.nodeId,
        heartbeatIntervalMs: this.heartbeatIntervalMs
      }));
    }
  }

  /**
   * Register a new node in the cluster via CDC.
   * This writes the node entry to the nodes system table.
   *
   * @param {Object} nodeData - Node data to register.
   * @param {string} nodeData.node_id - Node ID.
   * @param {string} nodeData.node_address - Node address.
   * @param {number} nodeData.cpu_cores - CPU core count.
   * @param {number} nodeData.memory_mb - Memory in MB.
   * @param {number} nodeData.disk_gb - Disk in GB.
   * @return {Promise<Object>} Registration result.
   */
  async registerNode(nodeData) {
    if (stryMutAct_9fa48("92762")) {
      {}
    } else {
      stryCov_9fa48("92762");
      this.validateInitialized();
      const now = Date.now();
      const data = stryMutAct_9fa48("92763") ? {} : (stryCov_9fa48("92763"), {
        node_id: nodeData.node_id,
        node_address: nodeData.node_address,
        cpu_cores: stryMutAct_9fa48("92766") ? nodeData.cpu_cores && NUM.ZERO : stryMutAct_9fa48("92765") ? false : stryMutAct_9fa48("92764") ? true : (stryCov_9fa48("92764", "92765", "92766"), nodeData.cpu_cores || NUM.ZERO),
        memory_mb: stryMutAct_9fa48("92769") ? nodeData.memory_mb && NUM.ZERO : stryMutAct_9fa48("92768") ? false : stryMutAct_9fa48("92767") ? true : (stryCov_9fa48("92767", "92768", "92769"), nodeData.memory_mb || NUM.ZERO),
        disk_gb: stryMutAct_9fa48("92772") ? nodeData.disk_gb && NUM.ZERO : stryMutAct_9fa48("92771") ? false : stryMutAct_9fa48("92770") ? true : (stryCov_9fa48("92770", "92771", "92772"), nodeData.disk_gb || NUM.ZERO),
        cpu_usage_percent: stryMutAct_9fa48("92775") ? nodeData.cpu_usage_percent && NUM.ZERO : stryMutAct_9fa48("92774") ? false : stryMutAct_9fa48("92773") ? true : (stryCov_9fa48("92773", "92774", "92775"), nodeData.cpu_usage_percent || NUM.ZERO),
        memory_usage_percent: stryMutAct_9fa48("92778") ? nodeData.memory_usage_percent && NUM.ZERO : stryMutAct_9fa48("92777") ? false : stryMutAct_9fa48("92776") ? true : (stryCov_9fa48("92776", "92777", "92778"), nodeData.memory_usage_percent || NUM.ZERO),
        disk_usage_percent: stryMutAct_9fa48("92781") ? nodeData.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("92780") ? false : stryMutAct_9fa48("92779") ? true : (stryCov_9fa48("92779", "92780", "92781"), nodeData.disk_usage_percent || NUM.ZERO),
        status: NODE_STATUS.ACTIVE,
        last_heartbeat: now,
        created_at: now,
        // Set id for cache compatibility
        id: nodeData.node_id
      });
      this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.REGISTERING_NODE, stryMutAct_9fa48("92782") ? {} : (stryCov_9fa48("92782"), {
        nodeId: data.node_id,
        nodeAddress: data.node_address
      }));
      try {
        if (stryMutAct_9fa48("92783")) {
          {}
        } else {
          stryCov_9fa48("92783");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("92784") ? {} : (stryCov_9fa48("92784"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: SYSTEM_TABLE_NAME.NODES,
            row: data
          }), stryMutAct_9fa48("92785") ? {} : (stryCov_9fa48("92785"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("92786") ? "" : (stryCov_9fa48("92786"), 'critical')
          }));
          this.emit(NODE_LIFECYCLE_SERVICE_EVENT.NODE_REGISTERED, stryMutAct_9fa48("92787") ? {} : (stryCov_9fa48("92787"), {
            nodeId: data.node_id,
            nodeAddress: data.node_address
          }));
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("92788")) {
          {}
        } else {
          stryCov_9fa48("92788");
          this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.REGISTER_NODE_FAILED, stryMutAct_9fa48("92789") ? {} : (stryCov_9fa48("92789"), {
            nodeId: data.node_id,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Update node heartbeat via CDC.
   * This updates the last_heartbeat timestamp in the nodes system table.
   *
   * @param {string} nodeId - Node ID to update.
   * @param {Object} stats - Optional node statistics to update.
   * @return {Promise<Object>} Update result.
   */
  async updateHeartbeat(nodeId, stats = {}) {
    if (stryMutAct_9fa48("92790")) {
      {}
    } else {
      stryCov_9fa48("92790");
      this.validateInitialized();
      const now = Date.now();
      const updateData = stryMutAct_9fa48("92791") ? {} : (stryCov_9fa48("92791"), {
        last_heartbeat: now
      });

      // Include optional stats if provided
      if (stryMutAct_9fa48("92794") ? stats.cpu_usage_percent === undefined : stryMutAct_9fa48("92793") ? false : stryMutAct_9fa48("92792") ? true : (stryCov_9fa48("92792", "92793", "92794"), stats.cpu_usage_percent !== undefined)) {
        if (stryMutAct_9fa48("92795")) {
          {}
        } else {
          stryCov_9fa48("92795");
          updateData.cpu_usage_percent = stats.cpu_usage_percent;
        }
      }
      if (stryMutAct_9fa48("92798") ? stats.memory_usage_percent === undefined : stryMutAct_9fa48("92797") ? false : stryMutAct_9fa48("92796") ? true : (stryCov_9fa48("92796", "92797", "92798"), stats.memory_usage_percent !== undefined)) {
        if (stryMutAct_9fa48("92799")) {
          {}
        } else {
          stryCov_9fa48("92799");
          updateData.memory_usage_percent = stats.memory_usage_percent;
        }
      }
      if (stryMutAct_9fa48("92802") ? stats.disk_usage_percent === undefined : stryMutAct_9fa48("92801") ? false : stryMutAct_9fa48("92800") ? true : (stryCov_9fa48("92800", "92801", "92802"), stats.disk_usage_percent !== undefined)) {
        if (stryMutAct_9fa48("92803")) {
          {}
        } else {
          stryCov_9fa48("92803");
          updateData.disk_usage_percent = stats.disk_usage_percent;
        }
      }
      this.logger.debug(NODE_LIFECYCLE_SERVICE_LOG_MSG.UPDATING_HEARTBEAT, stryMutAct_9fa48("92804") ? {} : (stryCov_9fa48("92804"), {
        nodeId,
        timestamp: now
      }));
      try {
        if (stryMutAct_9fa48("92805")) {
          {}
        } else {
          stryCov_9fa48("92805");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("92806") ? {} : (stryCov_9fa48("92806"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.NODES,
            whereClause: stryMutAct_9fa48("92807") ? {} : (stryCov_9fa48("92807"), {
              node_id: nodeId
            }),
            data: updateData
          }), stryMutAct_9fa48("92808") ? {} : (stryCov_9fa48("92808"), {
            workClass: PRESSURE_WORK_CLASS.BACKGROUND,
            deliveryPriority: stryMutAct_9fa48("92809") ? "" : (stryCov_9fa48("92809"), 'background'),
            allowPressureDefer: stryMutAct_9fa48("92810") ? false : (stryCov_9fa48("92810"), true),
            pressureRetryAfterMs: this.heartbeatIntervalMs,
            allowCoalescing: stryMutAct_9fa48("92811") ? false : (stryCov_9fa48("92811"), true),
            coalescingKey: stryMutAct_9fa48("92812") ? `` : (stryCov_9fa48("92812"), `nodes:heartbeat:${nodeId}`)
          }));
          this.emit(NODE_LIFECYCLE_SERVICE_EVENT.HEARTBEAT_UPDATED, stryMutAct_9fa48("92813") ? {} : (stryCov_9fa48("92813"), {
            nodeId,
            timestamp: now
          }));
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("92814")) {
          {}
        } else {
          stryCov_9fa48("92814");
          this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.UPDATE_HEARTBEAT_FAILED, stryMutAct_9fa48("92815") ? {} : (stryCov_9fa48("92815"), {
            nodeId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Remove a node from the cluster via CDC.
   *
   * @param {string} nodeId - Node ID to remove.
   * @return {Promise<Object>} Delete result.
   */
  async removeNode(nodeId) {
    if (stryMutAct_9fa48("92816")) {
      {}
    } else {
      stryCov_9fa48("92816");
      this.validateInitialized();
      this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.REMOVING_NODE, stryMutAct_9fa48("92817") ? {} : (stryCov_9fa48("92817"), {
        nodeId
      }));
      try {
        if (stryMutAct_9fa48("92818")) {
          {}
        } else {
          stryCov_9fa48("92818");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("92819") ? {} : (stryCov_9fa48("92819"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
            tableName: SYSTEM_TABLE_NAME.NODES,
            whereClause: stryMutAct_9fa48("92820") ? {} : (stryCov_9fa48("92820"), {
              node_id: nodeId
            })
          }), stryMutAct_9fa48("92821") ? {} : (stryCov_9fa48("92821"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("92822") ? "" : (stryCov_9fa48("92822"), 'critical')
          }));
          this.emit(NODE_LIFECYCLE_SERVICE_EVENT.NODE_REMOVED, stryMutAct_9fa48("92823") ? {} : (stryCov_9fa48("92823"), {
            nodeId
          }));
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("92824")) {
          {}
        } else {
          stryCov_9fa48("92824");
          this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.REMOVE_NODE_FAILED, stryMutAct_9fa48("92825") ? {} : (stryCov_9fa48("92825"), {
            nodeId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Start periodic heartbeat updates for this node.
   */
  startHeartbeat() {
    if (stryMutAct_9fa48("92826")) {
      {}
    } else {
      stryCov_9fa48("92826");
      this.validateInitialized();
      if (stryMutAct_9fa48("92828") ? false : stryMutAct_9fa48("92827") ? true : (stryCov_9fa48("92827", "92828"), this.heartbeatTimer)) {
        if (stryMutAct_9fa48("92829")) {
          {}
        } else {
          stryCov_9fa48("92829");
          return;
        }
      }
      this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.STARTING_HEARTBEAT, stryMutAct_9fa48("92830") ? {} : (stryCov_9fa48("92830"), {
        nodeId: this.nodeId,
        intervalMs: this.heartbeatIntervalMs
      }));
      this.heartbeatTimer = setInterval(async () => {
        if (stryMutAct_9fa48("92831")) {
          {}
        } else {
          stryCov_9fa48("92831");
          try {
            if (stryMutAct_9fa48("92832")) {
              {}
            } else {
              stryCov_9fa48("92832");
              await this.updateHeartbeat(this.nodeId);
            }
          } catch (error) {
            if (stryMutAct_9fa48("92833")) {
              {}
            } else {
              stryCov_9fa48("92833");
              this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.HEARTBEAT_FAILED, stryMutAct_9fa48("92834") ? {} : (stryCov_9fa48("92834"), {
                nodeId: this.nodeId,
                error: error.message
              }));
              this.emit(NODE_LIFECYCLE_SERVICE_EVENT.HEARTBEAT_ERROR, error);
            }
          }
        }
      }, this.heartbeatIntervalMs);
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Stop periodic heartbeat updates.
   */
  stopHeartbeat() {
    if (stryMutAct_9fa48("92835")) {
      {}
    } else {
      stryCov_9fa48("92835");
      if (stryMutAct_9fa48("92837") ? false : stryMutAct_9fa48("92836") ? true : (stryCov_9fa48("92836", "92837"), this.heartbeatTimer)) {
        if (stryMutAct_9fa48("92838")) {
          {}
        } else {
          stryCov_9fa48("92838");
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
          this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.STOPPED_HEARTBEAT, stryMutAct_9fa48("92839") ? {} : (stryCov_9fa48("92839"), {
            nodeId: this.nodeId
          }));
        }
      }
    }
  }

  /**
   * Validate that the service is initialized.
   * @throws {Error} If not initialized.
   * @private
   */
  validateInitialized() {
    if (stryMutAct_9fa48("92840")) {
      {}
    } else {
      stryCov_9fa48("92840");
      if (stryMutAct_9fa48("92843") ? false : stryMutAct_9fa48("92842") ? true : stryMutAct_9fa48("92841") ? this.initialized : (stryCov_9fa48("92841", "92842", "92843"), !this.initialized)) {
        if (stryMutAct_9fa48("92844")) {
          {}
        } else {
          stryCov_9fa48("92844");
          throw new Error(NODE_LIFECYCLE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
    }
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("92845")) {
      {}
    } else {
      stryCov_9fa48("92845");
      return this.initialized;
    }
  }

  /**
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("92846")) {
      {}
    } else {
      stryCov_9fa48("92846");
      if (stryMutAct_9fa48("92848") ? false : stryMutAct_9fa48("92847") ? true : (stryCov_9fa48("92847", "92848"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("92849")) {
          {}
        } else {
          stryCov_9fa48("92849");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("92850") ? {} : (stryCov_9fa48("92850"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("92851") ? () => undefined : (stryCov_9fa48("92851"), () => this.cdcIntegrationService),
        getMessageRouter: stryMutAct_9fa48("92852") ? () => undefined : (stryCov_9fa48("92852"), () => stryMutAct_9fa48("92855") ? this.cdcIntegrationService?.messageRouter && null : stryMutAct_9fa48("92854") ? false : stryMutAct_9fa48("92853") ? true : (stryCov_9fa48("92853", "92854", "92855"), (stryMutAct_9fa48("92856") ? this.cdcIntegrationService.messageRouter : (stryCov_9fa48("92856"), this.cdcIntegrationService?.messageRouter)) || null))
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    if (stryMutAct_9fa48("92857")) {
      {}
    } else {
      stryCov_9fa48("92857");
      this.stopHeartbeat();
      this.initialized = stryMutAct_9fa48("92858") ? true : (stryCov_9fa48("92858"), false);
      this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("92859") ? {} : (stryCov_9fa48("92859"), {
        nodeId: this.nodeId
      }));
    }
  }
}
export { NodeLifecycleService, NodeLifecycleStatus };