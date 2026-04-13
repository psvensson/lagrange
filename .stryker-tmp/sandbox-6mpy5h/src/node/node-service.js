/**
 * Node Service - Administrative component present on every node.
 * Handles service lifecycle, health monitoring, and node statistics.
 * Requirements: 1.3, 2.3, 5.1, 5.4, 5.7
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
import os from 'os';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { ServiceThreadManager, ServiceStatus } from '../threading/service-thread-manager.js';
import { AddressManager } from '../address/address-manager.js';
import { NodeLifecycleStateMachine, NodeState } from './node-lifecycle-state-machine.js';
import { SystemTableCache } from '../cache/system-table-cache.js';
import { createReadOnlyCache } from '../cache/read-only-system-table-cache.js';
import { NODE_CONFIG_KEY, NODE_LIFECYCLE_EVENT, NODE_SERVICE_DEFAULT, NODE_SERVICE_ERROR_MSG, NODE_SERVICE_EVENT, NODE_SERVICE_HEALTH_STATUS, NODE_SERVICE_LOG_MSG, NODE_SERVICE_SUBSYSTEM, NODE_STATUS } from './node-constants.js';
import { NUM, STRING } from '../constants/index.js';

/**
 * Node status enumeration.
 */
const NodeStatus = NODE_STATUS;

/**
 * NodeService is the administrative component present on every node.
 * It manages service lifecycle, health monitoring, and node statistics.
 * Uses NodeLifecycleStateMachine for explicit state management.
 */
class NodeService extends EventEmitter {
  static instance = null;

  /**
   * Create a new NodeService instance.
   * @private
   */
  constructor() {
    super();
    this.nodeId = null;
    this.nodeAddress = null;
    this.status = NODE_STATUS.INITIALIZING;
    this.lifecycleStateMachine = null;
    this.services = new Map();
    this.messageGroupServices = new Map();
    this.heartbeatInterval = null;
    this.heartbeatIntervalMs = NODE_SERVICE_DEFAULT.HEARTBEAT_INTERVAL_MS;
    this.statsCollectionIntervalMs = NODE_SERVICE_DEFAULT.STATS_COLLECTION_INTERVAL_MS;
    this.statsInterval = null;
    this.lastStats = null;
    this.startTime = null;
    this.logger = null;
    this.config = null;
    this.threadManager = null;
    this.addressManager = null;
    this.initialized = stryMutAct_9fa48("93610") ? true : (stryCov_9fa48("93610"), false);

    // System table cache - singleton per node, created once
    this._systemTableCache = null;
    this._readOnlyCache = null;
  }

  /**
   * Get the singleton instance.
   * @return {NodeService} The node service instance.
   */
  static getInstance() {
    if (stryMutAct_9fa48("93611")) {
      {}
    } else {
      stryCov_9fa48("93611");
      if (stryMutAct_9fa48("93614") ? false : stryMutAct_9fa48("93613") ? true : stryMutAct_9fa48("93612") ? NodeService.instance : (stryCov_9fa48("93612", "93613", "93614"), !NodeService.instance)) {
        if (stryMutAct_9fa48("93615")) {
          {}
        } else {
          stryCov_9fa48("93615");
          NodeService.instance = new NodeService();
        }
      }
      return NodeService.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("93616")) {
      {}
    } else {
      stryCov_9fa48("93616");
      if (stryMutAct_9fa48("93618") ? false : stryMutAct_9fa48("93617") ? true : (stryCov_9fa48("93617", "93618"), NodeService.instance)) {
        if (stryMutAct_9fa48("93619")) {
          {}
        } else {
          stryCov_9fa48("93619");
          NodeService.instance.shutdown().catch(() => {});
        }
      }
      NodeService.instance = null;
    }
  }

  /**
   * Initialize the node service.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Optional node ID (generated if not provided).
   * @param {string} options.nodeAddress - Optional node address.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("93620")) {
      {}
    } else {
      stryCov_9fa48("93620");
      if (stryMutAct_9fa48("93622") ? false : stryMutAct_9fa48("93621") ? true : (stryCov_9fa48("93621", "93622"), this.initialized)) {
        if (stryMutAct_9fa48("93623")) {
          {}
        } else {
          stryCov_9fa48("93623");
          return;
        }
      }
      this.config = ConfigurationManager.getInstance();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(NODE_SERVICE_SUBSYSTEM);

      // Set node identity
      this.nodeId = stryMutAct_9fa48("93626") ? (options.nodeId || this.config.get(NODE_CONFIG_KEY.ID)) && uuidv4() : stryMutAct_9fa48("93625") ? false : stryMutAct_9fa48("93624") ? true : (stryCov_9fa48("93624", "93625", "93626"), (stryMutAct_9fa48("93628") ? options.nodeId && this.config.get(NODE_CONFIG_KEY.ID) : stryMutAct_9fa48("93627") ? false : (stryCov_9fa48("93627", "93628"), options.nodeId || this.config.get(NODE_CONFIG_KEY.ID))) || uuidv4());
      this.addressManager = AddressManager.getInstance();
      this.nodeAddress = stryMutAct_9fa48("93631") ? options.nodeAddress && this.addressManager.generateNodeAddress() : stryMutAct_9fa48("93630") ? false : stryMutAct_9fa48("93629") ? true : (stryCov_9fa48("93629", "93630", "93631"), options.nodeAddress || this.addressManager.generateNodeAddress());

      // Get configuration values
      this.heartbeatIntervalMs = stryMutAct_9fa48("93634") ? this.config.get(NODE_CONFIG_KEY.HEARTBEAT_INTERVAL_MS) && NODE_SERVICE_DEFAULT.HEARTBEAT_INTERVAL_MS : stryMutAct_9fa48("93633") ? false : stryMutAct_9fa48("93632") ? true : (stryCov_9fa48("93632", "93633", "93634"), this.config.get(NODE_CONFIG_KEY.HEARTBEAT_INTERVAL_MS) || NODE_SERVICE_DEFAULT.HEARTBEAT_INTERVAL_MS);
      this.statsCollectionIntervalMs = stryMutAct_9fa48("93637") ? this.config.get(NODE_CONFIG_KEY.STATS_COLLECTION_INTERVAL_MS) && NODE_SERVICE_DEFAULT.STATS_COLLECTION_INTERVAL_MS : stryMutAct_9fa48("93636") ? false : stryMutAct_9fa48("93635") ? true : (stryCov_9fa48("93635", "93636", "93637"), this.config.get(NODE_CONFIG_KEY.STATS_COLLECTION_INTERVAL_MS) || NODE_SERVICE_DEFAULT.STATS_COLLECTION_INTERVAL_MS);

      // Initialize thread manager
      this.threadManager = ServiceThreadManager.getInstance();
      if (stryMutAct_9fa48("93640") ? false : stryMutAct_9fa48("93639") ? true : stryMutAct_9fa48("93638") ? this.threadManager.isInitialized() : (stryCov_9fa48("93638", "93639", "93640"), !this.threadManager.isInitialized())) {
        if (stryMutAct_9fa48("93641")) {
          {}
        } else {
          stryCov_9fa48("93641");
          this.threadManager.initialize();
        }
      }
      const providedLifecycleStateMachine = options.lifecycleStateMachine;
      const autoTransitionLifecycle = stryMutAct_9fa48("93644") ? options.autoTransitionLifecycle === false : stryMutAct_9fa48("93643") ? false : stryMutAct_9fa48("93642") ? true : (stryCov_9fa48("93642", "93643", "93644"), options.autoTransitionLifecycle !== (stryMutAct_9fa48("93645") ? true : (stryCov_9fa48("93645"), false)));
      // Initialize lifecycle state machine (or use externally managed one)
      this.lifecycleStateMachine = stryMutAct_9fa48("93648") ? providedLifecycleStateMachine && new NodeLifecycleStateMachine({
        nodeId: this.nodeId,
        initialState: NodeState.STARTING
      }) : stryMutAct_9fa48("93647") ? false : stryMutAct_9fa48("93646") ? true : (stryCov_9fa48("93646", "93647", "93648"), providedLifecycleStateMachine || new NodeLifecycleStateMachine(stryMutAct_9fa48("93649") ? {} : (stryCov_9fa48("93649"), {
        nodeId: this.nodeId,
        initialState: NodeState.STARTING
      })));

      // Forward state change events from the state machine
      this.lifecycleStateMachine.on(NODE_LIFECYCLE_EVENT.STATE_CHANGE, event => {
        if (stryMutAct_9fa48("93650")) {
          {}
        } else {
          stryCov_9fa48("93650");
          this._onLifecycleStateChange(event);
        }
      });
      this.startTime = Date.now();

      // Default node-service initialization owns lifecycle transitions.
      // Join/bootstrap flows can pass autoTransitionLifecycle=false and provide
      // an external lifecycle state machine to keep one lifecycle authority.
      if (stryMutAct_9fa48("93652") ? false : stryMutAct_9fa48("93651") ? true : (stryCov_9fa48("93651", "93652"), autoTransitionLifecycle)) {
        if (stryMutAct_9fa48("93653")) {
          {}
        } else {
          stryCov_9fa48("93653");
          this.lifecycleStateMachine.transition(NodeState.CONNECTING);
          this.lifecycleStateMachine.transition(NodeState.DISCOVERING);
          this.lifecycleStateMachine.transition(NodeState.JOINING);
          this.lifecycleStateMachine.transition(NodeState.SYNCING);
          this.lifecycleStateMachine.transition(NodeState.READY);
        }
      }
      this.status = NODE_STATUS.ACTIVE;
      this.initialized = stryMutAct_9fa48("93654") ? false : (stryCov_9fa48("93654"), true);
      this.logger.info(NODE_SERVICE_LOG_MSG.INITIALIZED, stryMutAct_9fa48("93655") ? {} : (stryCov_9fa48("93655"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        lifecycleState: this.lifecycleStateMachine.getState()
      }));
    }
  }

  /**
   * Handle lifecycle state change events.
   * Emits CDC events for nodes table updates.
   * @param {Object} event - State change event.
   * @param {string} event.from - Previous state.
   * @param {string} event.to - New state.
   * @param {number} event.timestamp - Timestamp of the change.
   * @private
   */
  _onLifecycleStateChange(event) {
    if (stryMutAct_9fa48("93656")) {
      {}
    } else {
      stryCov_9fa48("93656");
      this.logger.info(NODE_SERVICE_LOG_MSG.LIFECYCLE_STATE_CHANGED, stryMutAct_9fa48("93657") ? {} : (stryCov_9fa48("93657"), {
        nodeId: this.nodeId,
        from: event.from,
        to: event.to,
        timestamp: event.timestamp
      }));

      // Forward the state change event for external listeners
      this.emit(NODE_SERVICE_EVENT.LIFECYCLE_STATE_CHANGE, stryMutAct_9fa48("93658") ? {} : (stryCov_9fa48("93658"), {
        nodeId: this.nodeId,
        from: event.from,
        to: event.to,
        timestamp: event.timestamp
      }));

      // Emit CDC event for nodes table update
      // This allows other components to react to state changes
      this.emit(NODE_SERVICE_EVENT.CDC_NODE_STATE_CHANGE, stryMutAct_9fa48("93659") ? {} : (stryCov_9fa48("93659"), {
        nodeId: this.nodeId,
        state: event.to,
        previousState: event.from,
        timestamp: event.timestamp
      }));
    }
  }

  /**
   * Start a service on this node.
   * @param {Object} serviceConfig - Service configuration.
   * @param {string} serviceConfig.type - Service type (partition, messageGroup, custom).
   * @param {string} serviceConfig.id - Optional service ID (generated if not provided).
   * @param {Object} serviceConfig.config - Service-specific configuration.
   * @return {Promise<Object>} Service info with ID and status.
   */
  async startService(serviceConfig) {
    if (stryMutAct_9fa48("93660")) {
      {}
    } else {
      stryCov_9fa48("93660");
      if (stryMutAct_9fa48("93663") ? false : stryMutAct_9fa48("93662") ? true : stryMutAct_9fa48("93661") ? this.initialized : (stryCov_9fa48("93661", "93662", "93663"), !this.initialized)) {
        if (stryMutAct_9fa48("93664")) {
          {}
        } else {
          stryCov_9fa48("93664");
          throw new Error(NODE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const serviceId = stryMutAct_9fa48("93667") ? serviceConfig.id && this.addressManager.generateServiceAddress(this.nodeAddress) : stryMutAct_9fa48("93666") ? false : stryMutAct_9fa48("93665") ? true : (stryCov_9fa48("93665", "93666", "93667"), serviceConfig.id || this.addressManager.generateServiceAddress(this.nodeAddress));
      const serviceType = stryMutAct_9fa48("93670") ? serviceConfig.type && NODE_SERVICE_DEFAULT.SERVICE_TYPE_CUSTOM : stryMutAct_9fa48("93669") ? false : stryMutAct_9fa48("93668") ? true : (stryCov_9fa48("93668", "93669", "93670"), serviceConfig.type || NODE_SERVICE_DEFAULT.SERVICE_TYPE_CUSTOM);
      if (stryMutAct_9fa48("93672") ? false : stryMutAct_9fa48("93671") ? true : (stryCov_9fa48("93671", "93672"), this.services.has(serviceId))) {
        if (stryMutAct_9fa48("93673")) {
          {}
        } else {
          stryCov_9fa48("93673");
          throw new Error(stryMutAct_9fa48("93674") ? `` : (stryCov_9fa48("93674"), `${NODE_SERVICE_ERROR_MSG.SERVICE_EXISTS}: ${serviceId}`));
        }
      }
      this.logger.info(NODE_SERVICE_LOG_MSG.STARTING_SERVICE, stryMutAct_9fa48("93675") ? {} : (stryCov_9fa48("93675"), {
        serviceId,
        serviceType,
        nodeId: this.nodeId
      }));
      const serviceInfo = stryMutAct_9fa48("93676") ? {} : (stryCov_9fa48("93676"), {
        id: serviceId,
        type: serviceType,
        nodeId: this.nodeId,
        status: ServiceStatus.STARTING,
        config: stryMutAct_9fa48("93679") ? serviceConfig.config && {} : stryMutAct_9fa48("93678") ? false : stryMutAct_9fa48("93677") ? true : (stryCov_9fa48("93677", "93678", "93679"), serviceConfig.config || {}),
        startedAt: Date.now(),
        lastHealthCheck: null,
        healthStatus: null
      });
      this.services.set(serviceId, serviceInfo);
      try {
        if (stryMutAct_9fa48("93680")) {
          {}
        } else {
          stryCov_9fa48("93680");
          // Register with thread manager
          await this.threadManager.registerService(serviceId, stryMutAct_9fa48("93681") ? {} : (stryCov_9fa48("93681"), {
            handler: stryMutAct_9fa48("93684") ? serviceConfig.handler && {} : stryMutAct_9fa48("93683") ? false : stryMutAct_9fa48("93682") ? true : (stryCov_9fa48("93682", "93683", "93684"), serviceConfig.handler || {})
          }));
          serviceInfo.status = ServiceStatus.RUNNING;

          // Track message group services separately
          if (stryMutAct_9fa48("93687") ? serviceType !== NODE_SERVICE_DEFAULT.MESSAGE_GROUP_TYPE : stryMutAct_9fa48("93686") ? false : stryMutAct_9fa48("93685") ? true : (stryCov_9fa48("93685", "93686", "93687"), serviceType === NODE_SERVICE_DEFAULT.MESSAGE_GROUP_TYPE)) {
            if (stryMutAct_9fa48("93688")) {
              {}
            } else {
              stryCov_9fa48("93688");
              this.messageGroupServices.set(serviceId, serviceInfo);
            }
          }
          this.logger.info(NODE_SERVICE_LOG_MSG.SERVICE_STARTED, stryMutAct_9fa48("93689") ? {} : (stryCov_9fa48("93689"), {
            serviceId,
            serviceType,
            nodeId: this.nodeId
          }));
          this.emit(NODE_SERVICE_EVENT.SERVICE_STARTED, serviceId, serviceInfo);
          return stryMutAct_9fa48("93690") ? {} : (stryCov_9fa48("93690"), {
            id: serviceId,
            type: serviceType,
            status: serviceInfo.status,
            nodeId: this.nodeId
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("93691")) {
          {}
        } else {
          stryCov_9fa48("93691");
          serviceInfo.status = ServiceStatus.FAILED;
          this.logger.error(NODE_SERVICE_LOG_MSG.SERVICE_START_FAILED, stryMutAct_9fa48("93692") ? {} : (stryCov_9fa48("93692"), {
            serviceId,
            serviceType,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Stop a service on this node.
   * @param {string} serviceId - The service identifier.
   * @return {Promise<Object>} Result of the stop operation.
   */
  async stopService(serviceId) {
    if (stryMutAct_9fa48("93693")) {
      {}
    } else {
      stryCov_9fa48("93693");
      if (stryMutAct_9fa48("93696") ? false : stryMutAct_9fa48("93695") ? true : stryMutAct_9fa48("93694") ? this.initialized : (stryCov_9fa48("93694", "93695", "93696"), !this.initialized)) {
        if (stryMutAct_9fa48("93697")) {
          {}
        } else {
          stryCov_9fa48("93697");
          throw new Error(NODE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const serviceInfo = this.services.get(serviceId);
      if (stryMutAct_9fa48("93700") ? false : stryMutAct_9fa48("93699") ? true : stryMutAct_9fa48("93698") ? serviceInfo : (stryCov_9fa48("93698", "93699", "93700"), !serviceInfo)) {
        if (stryMutAct_9fa48("93701")) {
          {}
        } else {
          stryCov_9fa48("93701");
          throw new Error(stryMutAct_9fa48("93702") ? `` : (stryCov_9fa48("93702"), `${NODE_SERVICE_ERROR_MSG.SERVICE_NOT_FOUND}: ${serviceId}`));
        }
      }
      this.logger.info(NODE_SERVICE_LOG_MSG.STOPPING_SERVICE, stryMutAct_9fa48("93703") ? {} : (stryCov_9fa48("93703"), {
        serviceId,
        serviceType: serviceInfo.type,
        nodeId: this.nodeId
      }));
      serviceInfo.status = ServiceStatus.STOPPING;
      try {
        if (stryMutAct_9fa48("93704")) {
          {}
        } else {
          stryCov_9fa48("93704");
          // Unregister from thread manager
          await this.threadManager.unregisterService(serviceId);

          // Remove from tracking
          this.services.delete(serviceId);
          this.messageGroupServices.delete(serviceId);

          // Unregister address
          this.addressManager.unregisterServiceAddress(serviceId);
          this.logger.info(NODE_SERVICE_LOG_MSG.SERVICE_STOPPED, stryMutAct_9fa48("93705") ? {} : (stryCov_9fa48("93705"), {
            serviceId,
            nodeId: this.nodeId
          }));
          this.emit(NODE_SERVICE_EVENT.SERVICE_STOPPED, serviceId);
          return stryMutAct_9fa48("93706") ? {} : (stryCov_9fa48("93706"), {
            id: serviceId,
            status: ServiceStatus.STOPPED,
            stoppedAt: Date.now()
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("93707")) {
          {}
        } else {
          stryCov_9fa48("93707");
          serviceInfo.status = ServiceStatus.FAILED;
          this.logger.error(NODE_SERVICE_LOG_MSG.SERVICE_STOP_FAILED, stryMutAct_9fa48("93708") ? {} : (stryCov_9fa48("93708"), {
            serviceId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Get node statistics including CPU, memory, and disk usage.
   * @return {Promise<Object>} Node statistics.
   */
  async getNodeStats() {
    if (stryMutAct_9fa48("93709")) {
      {}
    } else {
      stryCov_9fa48("93709");
      const cpus = os.cpus();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = stryMutAct_9fa48("93710") ? totalMemory + freeMemory : (stryCov_9fa48("93710"), totalMemory - freeMemory);

      // Calculate CPU usage
      let totalIdle = NUM.ZERO;
      let totalTick = NUM.ZERO;
      for (const cpu of cpus) {
        if (stryMutAct_9fa48("93711")) {
          {}
        } else {
          stryCov_9fa48("93711");
          for (const type of Object.keys(cpu.times)) {
            if (stryMutAct_9fa48("93712")) {
              {}
            } else {
              stryCov_9fa48("93712");
              stryMutAct_9fa48("93713") ? totalTick -= cpu.times[type] : (stryCov_9fa48("93713"), totalTick += cpu.times[type]);
            }
          }
          stryMutAct_9fa48("93714") ? totalIdle -= cpu.times.idle : (stryCov_9fa48("93714"), totalIdle += cpu.times.idle);
        }
      }
      const cpuUsagePercent = stryMutAct_9fa48("93715") ? (totalTick - totalIdle) / totalTick / NUM.HUNDRED : (stryCov_9fa48("93715"), (stryMutAct_9fa48("93716") ? (totalTick - totalIdle) * totalTick : (stryCov_9fa48("93716"), (stryMutAct_9fa48("93717") ? totalTick + totalIdle : (stryCov_9fa48("93717"), totalTick - totalIdle)) / totalTick)) * NUM.HUNDRED);

      // Memory usage
      const memoryUsagePercent = stryMutAct_9fa48("93718") ? usedMemory / totalMemory / NUM.HUNDRED : (stryCov_9fa48("93718"), (stryMutAct_9fa48("93719") ? usedMemory * totalMemory : (stryCov_9fa48("93719"), usedMemory / totalMemory)) * NUM.HUNDRED);

      // Get pool stats from thread manager
      const poolStats = stryMutAct_9fa48("93722") ? this.threadManager?.getPoolStats() && {} : stryMutAct_9fa48("93721") ? false : stryMutAct_9fa48("93720") ? true : (stryCov_9fa48("93720", "93721", "93722"), (stryMutAct_9fa48("93723") ? this.threadManager.getPoolStats() : (stryCov_9fa48("93723"), this.threadManager?.getPoolStats())) || {});
      const stats = stryMutAct_9fa48("93724") ? {} : (stryCov_9fa48("93724"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        status: this.status,
        uptime: stryMutAct_9fa48("93725") ? Date.now() + this.startTime : (stryCov_9fa48("93725"), Date.now() - this.startTime),
        timestamp: Date.now(),
        cpu: stryMutAct_9fa48("93726") ? {} : (stryCov_9fa48("93726"), {
          count: cpus.length,
          model: stryMutAct_9fa48("93729") ? cpus[NUM.ZERO]?.model && STRING.UNKNOWN : stryMutAct_9fa48("93728") ? false : stryMutAct_9fa48("93727") ? true : (stryCov_9fa48("93727", "93728", "93729"), (stryMutAct_9fa48("93730") ? cpus[NUM.ZERO].model : (stryCov_9fa48("93730"), cpus[NUM.ZERO]?.model)) || STRING.UNKNOWN),
          usagePercent: stryMutAct_9fa48("93731") ? Math.round(cpuUsagePercent * NUM.HUNDRED) * NUM.HUNDRED : (stryCov_9fa48("93731"), Math.round(stryMutAct_9fa48("93732") ? cpuUsagePercent / NUM.HUNDRED : (stryCov_9fa48("93732"), cpuUsagePercent * NUM.HUNDRED)) / NUM.HUNDRED)
        }),
        memory: stryMutAct_9fa48("93733") ? {} : (stryCov_9fa48("93733"), {
          totalBytes: totalMemory,
          usedBytes: usedMemory,
          freeBytes: freeMemory,
          usagePercent: stryMutAct_9fa48("93734") ? Math.round(memoryUsagePercent * NUM.HUNDRED) * NUM.HUNDRED : (stryCov_9fa48("93734"), Math.round(stryMutAct_9fa48("93735") ? memoryUsagePercent / NUM.HUNDRED : (stryCov_9fa48("93735"), memoryUsagePercent * NUM.HUNDRED)) / NUM.HUNDRED)
        }),
        services: stryMutAct_9fa48("93736") ? {} : (stryCov_9fa48("93736"), {
          total: this.services.size,
          running: this.getRunningServiceCount(),
          messageGroups: this.messageGroupServices.size
        }),
        threadPool: poolStats,
        platform: stryMutAct_9fa48("93737") ? {} : (stryCov_9fa48("93737"), {
          os: os.platform(),
          arch: os.arch(),
          nodeVersion: process.version,
          hostname: os.hostname()
        })
      });
      this.lastStats = stats;
      return stats;
    }
  }

  /**
   * Get health status of a specific service.
   * @param {string} serviceId - The service identifier.
   * @return {Promise<Object>} Service health status.
   */
  async getServiceHealth(serviceId) {
    if (stryMutAct_9fa48("93738")) {
      {}
    } else {
      stryCov_9fa48("93738");
      if (stryMutAct_9fa48("93741") ? false : stryMutAct_9fa48("93740") ? true : stryMutAct_9fa48("93739") ? this.initialized : (stryCov_9fa48("93739", "93740", "93741"), !this.initialized)) {
        if (stryMutAct_9fa48("93742")) {
          {}
        } else {
          stryCov_9fa48("93742");
          throw new Error(NODE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const serviceInfo = this.services.get(serviceId);
      if (stryMutAct_9fa48("93745") ? false : stryMutAct_9fa48("93744") ? true : stryMutAct_9fa48("93743") ? serviceInfo : (stryCov_9fa48("93743", "93744", "93745"), !serviceInfo)) {
        if (stryMutAct_9fa48("93746")) {
          {}
        } else {
          stryCov_9fa48("93746");
          throw new Error(stryMutAct_9fa48("93747") ? `` : (stryCov_9fa48("93747"), `${NODE_SERVICE_ERROR_MSG.SERVICE_NOT_FOUND}: ${serviceId}`));
        }
      }
      const health = await this.threadManager.checkServiceHealth(serviceId);
      serviceInfo.lastHealthCheck = Date.now();
      serviceInfo.healthStatus = health.healthy ? NODE_SERVICE_HEALTH_STATUS.HEALTHY : NODE_SERVICE_HEALTH_STATUS.UNHEALTHY;
      return stryMutAct_9fa48("93748") ? {} : (stryCov_9fa48("93748"), {
        serviceId,
        type: serviceInfo.type,
        status: serviceInfo.status,
        healthy: health.healthy,
        lastHealthCheck: serviceInfo.lastHealthCheck,
        details: health
      });
    }
  }

  /**
   * Route a message to a service.
   * @param {string} serviceId - The target service ID.
   * @param {Object} message - The message to route.
   * @return {Promise<*>} The response from the service.
   */
  async routeServiceMessage(serviceId, message) {
    if (stryMutAct_9fa48("93749")) {
      {}
    } else {
      stryCov_9fa48("93749");
      if (stryMutAct_9fa48("93752") ? false : stryMutAct_9fa48("93751") ? true : stryMutAct_9fa48("93750") ? this.initialized : (stryCov_9fa48("93750", "93751", "93752"), !this.initialized)) {
        if (stryMutAct_9fa48("93753")) {
          {}
        } else {
          stryCov_9fa48("93753");
          throw new Error(NODE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const serviceInfo = this.services.get(serviceId);
      if (stryMutAct_9fa48("93756") ? false : stryMutAct_9fa48("93755") ? true : stryMutAct_9fa48("93754") ? serviceInfo : (stryCov_9fa48("93754", "93755", "93756"), !serviceInfo)) {
        if (stryMutAct_9fa48("93757")) {
          {}
        } else {
          stryCov_9fa48("93757");
          throw new Error(stryMutAct_9fa48("93758") ? `` : (stryCov_9fa48("93758"), `${NODE_SERVICE_ERROR_MSG.SERVICE_NOT_FOUND}: ${serviceId}`));
        }
      }
      if (stryMutAct_9fa48("93761") ? serviceInfo.status === ServiceStatus.RUNNING : stryMutAct_9fa48("93760") ? false : stryMutAct_9fa48("93759") ? true : (stryCov_9fa48("93759", "93760", "93761"), serviceInfo.status !== ServiceStatus.RUNNING)) {
        if (stryMutAct_9fa48("93762")) {
          {}
        } else {
          stryCov_9fa48("93762");
          throw new Error((stryMutAct_9fa48("93763") ? `` : (stryCov_9fa48("93763"), `${NODE_SERVICE_ERROR_MSG.SERVICE_NOT_RUNNING}: ${serviceId} `)) + (stryMutAct_9fa48("93764") ? `` : (stryCov_9fa48("93764"), `(status: ${serviceInfo.status})`)));
        }
      }
      return await this.threadManager.executeServiceOperation(serviceId, stryMutAct_9fa48("93767") ? message.operation && NODE_SERVICE_DEFAULT.OPERATION_HANDLER : stryMutAct_9fa48("93766") ? false : stryMutAct_9fa48("93765") ? true : (stryCov_9fa48("93765", "93766", "93767"), message.operation || NODE_SERVICE_DEFAULT.OPERATION_HANDLER), stryMutAct_9fa48("93770") ? message.data && message : stryMutAct_9fa48("93769") ? false : stryMutAct_9fa48("93768") ? true : (stryCov_9fa48("93768", "93769", "93770"), message.data || message));
    }
  }

  /**
   * Get service information.
   * @param {string} serviceId - The service identifier.
   * @return {Object|null} Service info or null if not found.
   */
  getService(serviceId) {
    if (stryMutAct_9fa48("93771")) {
      {}
    } else {
      stryCov_9fa48("93771");
      const serviceInfo = this.services.get(serviceId);
      if (stryMutAct_9fa48("93774") ? false : stryMutAct_9fa48("93773") ? true : stryMutAct_9fa48("93772") ? serviceInfo : (stryCov_9fa48("93772", "93773", "93774"), !serviceInfo)) {
        if (stryMutAct_9fa48("93775")) {
          {}
        } else {
          stryCov_9fa48("93775");
          return null;
        }
      }
      return stryMutAct_9fa48("93776") ? {} : (stryCov_9fa48("93776"), {
        id: serviceInfo.id,
        type: serviceInfo.type,
        nodeId: serviceInfo.nodeId,
        status: serviceInfo.status,
        startedAt: serviceInfo.startedAt,
        lastHealthCheck: serviceInfo.lastHealthCheck,
        healthStatus: serviceInfo.healthStatus
      });
    }
  }

  /**
   * Get all services on this node.
   * @return {Array<Object>} Array of service info objects.
   */
  getAllServices() {
    if (stryMutAct_9fa48("93777")) {
      {}
    } else {
      stryCov_9fa48("93777");
      const services = stryMutAct_9fa48("93778") ? ["Stryker was here"] : (stryCov_9fa48("93778"), []);
      for (const serviceInfo of this.services.values()) {
        if (stryMutAct_9fa48("93779")) {
          {}
        } else {
          stryCov_9fa48("93779");
          services.push(stryMutAct_9fa48("93780") ? {} : (stryCov_9fa48("93780"), {
            id: serviceInfo.id,
            type: serviceInfo.type,
            nodeId: serviceInfo.nodeId,
            status: serviceInfo.status,
            startedAt: serviceInfo.startedAt,
            lastHealthCheck: serviceInfo.lastHealthCheck,
            healthStatus: serviceInfo.healthStatus
          }));
        }
      }
      return services;
    }
  }

  /**
   * Get the count of running services.
   * @return {number} Number of running services.
   */
  getRunningServiceCount() {
    if (stryMutAct_9fa48("93781")) {
      {}
    } else {
      stryCov_9fa48("93781");
      let count = NUM.ZERO;
      for (const serviceInfo of this.services.values()) {
        if (stryMutAct_9fa48("93782")) {
          {}
        } else {
          stryCov_9fa48("93782");
          if (stryMutAct_9fa48("93785") ? serviceInfo.status !== ServiceStatus.RUNNING : stryMutAct_9fa48("93784") ? false : stryMutAct_9fa48("93783") ? true : (stryCov_9fa48("93783", "93784", "93785"), serviceInfo.status === ServiceStatus.RUNNING)) {
            if (stryMutAct_9fa48("93786")) {
              {}
            } else {
              stryCov_9fa48("93786");
              stryMutAct_9fa48("93787") ? count -= NUM.ONE : (stryCov_9fa48("93787"), count += NUM.ONE);
            }
          }
        }
      }
      return count;
    }
  }

  /**
   * Get the node ID.
   * @return {string} The node ID.
   */
  getNodeId() {
    if (stryMutAct_9fa48("93788")) {
      {}
    } else {
      stryCov_9fa48("93788");
      return this.nodeId;
    }
  }

  /**
   * Get the node address.
   * @return {string} The node address.
   */
  getNodeAddress() {
    if (stryMutAct_9fa48("93789")) {
      {}
    } else {
      stryCov_9fa48("93789");
      return this.nodeAddress;
    }
  }

  /**
   * Get the node status.
   * @return {string} The node status.
   */
  getStatus() {
    if (stryMutAct_9fa48("93790")) {
      {}
    } else {
      stryCov_9fa48("93790");
      return this.status;
    }
  }

  /**
   * Get the system table cache for this node.
   * Creates the cache on first access (lazy initialization).
   * The cache is a singleton per node - only created once.
   * @return {SystemTableCache} The writable system table cache.
   */
  getSystemTableCache() {
    if (stryMutAct_9fa48("93791")) {
      {}
    } else {
      stryCov_9fa48("93791");
      if (stryMutAct_9fa48("93794") ? false : stryMutAct_9fa48("93793") ? true : stryMutAct_9fa48("93792") ? this._systemTableCache : (stryCov_9fa48("93792", "93793", "93794"), !this._systemTableCache)) {
        if (stryMutAct_9fa48("93795")) {
          {}
        } else {
          stryCov_9fa48("93795");
          this._systemTableCache = new SystemTableCache();
          this._readOnlyCache = createReadOnlyCache(this._systemTableCache);
          if (stryMutAct_9fa48("93797") ? false : stryMutAct_9fa48("93796") ? true : (stryCov_9fa48("93796", "93797"), this.logger)) {
            if (stryMutAct_9fa48("93798")) {
              {}
            } else {
              stryCov_9fa48("93798");
              this.logger.debug(NODE_SERVICE_LOG_MSG.SYSTEM_TABLE_CACHE_CREATED, stryMutAct_9fa48("93799") ? {} : (stryCov_9fa48("93799"), {
                nodeId: this.nodeId
              }));
            }
          }
        }
      }
      return this._systemTableCache;
    }
  }

  /**
   * Set the system cache proxy/cache instance for this node.
   * This preserves backward compatibility for tests and bootstrap wiring
   * that inject a pre-built cache/proxy instance.
   * @param {Object} cacheProxy - Cache or proxy instance.
   */
  setSystemCacheProxy(cacheProxy) {
    if (stryMutAct_9fa48("93800")) {
      {}
    } else {
      stryCov_9fa48("93800");
      this._systemTableCache = cacheProxy;
      this._readOnlyCache = cacheProxy;
    }
  }

  /**
   * Get the read-only view of the system table cache.
   * Creates the cache on first access if not already created.
   * @return {Object} Read-only proxy to the system table cache.
   */
  getReadOnlySystemTableCache() {
    if (stryMutAct_9fa48("93801")) {
      {}
    } else {
      stryCov_9fa48("93801");
      if (stryMutAct_9fa48("93804") ? false : stryMutAct_9fa48("93803") ? true : stryMutAct_9fa48("93802") ? this._readOnlyCache : (stryCov_9fa48("93802", "93803", "93804"), !this._readOnlyCache)) {
        if (stryMutAct_9fa48("93805")) {
          {}
        } else {
          stryCov_9fa48("93805");
          // Ensure cache is created
          this.getSystemTableCache();
        }
      }
      return this._readOnlyCache;
    }
  }

  /**
   * Get the current lifecycle state from the state machine.
   * @return {string|null} The current lifecycle state, or null if not initialized.
   */
  getLifecycleState() {
    if (stryMutAct_9fa48("93806")) {
      {}
    } else {
      stryCov_9fa48("93806");
      if (stryMutAct_9fa48("93809") ? false : stryMutAct_9fa48("93808") ? true : stryMutAct_9fa48("93807") ? this.lifecycleStateMachine : (stryCov_9fa48("93807", "93808", "93809"), !this.lifecycleStateMachine)) {
        if (stryMutAct_9fa48("93810")) {
          {}
        } else {
          stryCov_9fa48("93810");
          return null;
        }
      }
      return this.lifecycleStateMachine.getState();
    }
  }

  /**
   * Get the lifecycle state machine instance.
   * @return {NodeLifecycleStateMachine|null} The state machine, or null if not initialized.
   */
  getLifecycleStateMachine() {
    if (stryMutAct_9fa48("93811")) {
      {}
    } else {
      stryCov_9fa48("93811");
      return this.lifecycleStateMachine;
    }
  }

  /**
   * Check if the node is in READY state (accepting traffic).
   * @return {boolean} True if node is ready.
   */
  isReady() {
    if (stryMutAct_9fa48("93812")) {
      {}
    } else {
      stryCov_9fa48("93812");
      return stryMutAct_9fa48("93815") ? this.lifecycleStateMachine?.isReady() && false : stryMutAct_9fa48("93814") ? false : stryMutAct_9fa48("93813") ? true : (stryCov_9fa48("93813", "93814", "93815"), (stryMutAct_9fa48("93816") ? this.lifecycleStateMachine.isReady() : (stryCov_9fa48("93816"), this.lifecycleStateMachine?.isReady())) || (stryMutAct_9fa48("93817") ? true : (stryCov_9fa48("93817"), false)));
    }
  }

  /**
   * Check if the node is in DRAINING state.
   * @return {boolean} True if node is draining.
   */
  isDraining() {
    if (stryMutAct_9fa48("93818")) {
      {}
    } else {
      stryCov_9fa48("93818");
      return stryMutAct_9fa48("93821") ? this.lifecycleStateMachine?.isDraining() && false : stryMutAct_9fa48("93820") ? false : stryMutAct_9fa48("93819") ? true : (stryCov_9fa48("93819", "93820", "93821"), (stryMutAct_9fa48("93822") ? this.lifecycleStateMachine.isDraining() : (stryCov_9fa48("93822"), this.lifecycleStateMachine?.isDraining())) || (stryMutAct_9fa48("93823") ? true : (stryCov_9fa48("93823"), false)));
    }
  }

  /**
   * Check if the node service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("93824")) {
      {}
    } else {
      stryCov_9fa48("93824");
      return this.initialized;
    }
  }

  /**
   * Check if the node has any local message group replicas.
   * @return {boolean} True if node has message group replicas.
   */
  hasLocalMessageGroupReplica() {
    if (stryMutAct_9fa48("93825")) {
      {}
    } else {
      stryCov_9fa48("93825");
      return stryMutAct_9fa48("93829") ? this.messageGroupServices.size <= NUM.ZERO : stryMutAct_9fa48("93828") ? this.messageGroupServices.size >= NUM.ZERO : stryMutAct_9fa48("93827") ? false : stryMutAct_9fa48("93826") ? true : (stryCov_9fa48("93826", "93827", "93828", "93829"), this.messageGroupServices.size > NUM.ZERO);
    }
  }

  /**
   * Get the first active local message group replica.
   * @return {Object|null} Message group service info or null.
   */
  getLocalMessageGroupReplica() {
    if (stryMutAct_9fa48("93830")) {
      {}
    } else {
      stryCov_9fa48("93830");
      for (const serviceInfo of this.messageGroupServices.values()) {
        if (stryMutAct_9fa48("93831")) {
          {}
        } else {
          stryCov_9fa48("93831");
          if (stryMutAct_9fa48("93834") ? serviceInfo.status !== ServiceStatus.RUNNING : stryMutAct_9fa48("93833") ? false : stryMutAct_9fa48("93832") ? true : (stryCov_9fa48("93832", "93833", "93834"), serviceInfo.status === ServiceStatus.RUNNING)) {
            if (stryMutAct_9fa48("93835")) {
              {}
            } else {
              stryCov_9fa48("93835");
              return serviceInfo;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Shutdown the node service and all managed services.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("93836")) {
      {}
    } else {
      stryCov_9fa48("93836");
      if (stryMutAct_9fa48("93839") ? false : stryMutAct_9fa48("93838") ? true : stryMutAct_9fa48("93837") ? this.initialized : (stryCov_9fa48("93837", "93838", "93839"), !this.initialized)) {
        if (stryMutAct_9fa48("93840")) {
          {}
        } else {
          stryCov_9fa48("93840");
          return;
        }
      }
      this.logger.info(NODE_SERVICE_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("93841") ? {} : (stryCov_9fa48("93841"), {
        nodeId: this.nodeId
      }));
      this.status = NODE_STATUS.SHUTTING_DOWN;

      // Transition to DRAINING state if we're in READY state
      if (stryMutAct_9fa48("93844") ? this.lifecycleStateMachine || this.lifecycleStateMachine.getState() === NodeState.READY : stryMutAct_9fa48("93843") ? false : stryMutAct_9fa48("93842") ? true : (stryCov_9fa48("93842", "93843", "93844"), this.lifecycleStateMachine && (stryMutAct_9fa48("93846") ? this.lifecycleStateMachine.getState() !== NodeState.READY : stryMutAct_9fa48("93845") ? true : (stryCov_9fa48("93845", "93846"), this.lifecycleStateMachine.getState() === NodeState.READY)))) {
        if (stryMutAct_9fa48("93847")) {
          {}
        } else {
          stryCov_9fa48("93847");
          this.lifecycleStateMachine.transition(NodeState.DRAINING);
        }
      }

      // Clear intervals
      if (stryMutAct_9fa48("93849") ? false : stryMutAct_9fa48("93848") ? true : (stryCov_9fa48("93848", "93849"), this.heartbeatInterval)) {
        if (stryMutAct_9fa48("93850")) {
          {}
        } else {
          stryCov_9fa48("93850");
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
      }
      if (stryMutAct_9fa48("93852") ? false : stryMutAct_9fa48("93851") ? true : (stryCov_9fa48("93851", "93852"), this.statsInterval)) {
        if (stryMutAct_9fa48("93853")) {
          {}
        } else {
          stryCov_9fa48("93853");
          clearInterval(this.statsInterval);
          this.statsInterval = null;
        }
      }

      // Stop all services
      const serviceIds = Array.from(this.services.keys());
      for (const serviceId of serviceIds) {
        if (stryMutAct_9fa48("93854")) {
          {}
        } else {
          stryCov_9fa48("93854");
          try {
            if (stryMutAct_9fa48("93855")) {
              {}
            } else {
              stryCov_9fa48("93855");
              await this.stopService(serviceId);
            }
          } catch (error) {
            if (stryMutAct_9fa48("93856")) {
              {}
            } else {
              stryCov_9fa48("93856");
              this.logger.warn(NODE_SERVICE_LOG_MSG.SHUTDOWN_SERVICE_STOP_FAILED, stryMutAct_9fa48("93857") ? {} : (stryCov_9fa48("93857"), {
                serviceId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }

      // Unregister node address
      if (stryMutAct_9fa48("93859") ? false : stryMutAct_9fa48("93858") ? true : (stryCov_9fa48("93858", "93859"), this.nodeAddress)) {
        if (stryMutAct_9fa48("93860")) {
          {}
        } else {
          stryCov_9fa48("93860");
          this.addressManager.unregisterNodeAddress(this.nodeAddress);
        }
      }

      // Transition to STOPPED state
      if (stryMutAct_9fa48("93863") ? this.lifecycleStateMachine || this.lifecycleStateMachine.getState() === NodeState.DRAINING : stryMutAct_9fa48("93862") ? false : stryMutAct_9fa48("93861") ? true : (stryCov_9fa48("93861", "93862", "93863"), this.lifecycleStateMachine && (stryMutAct_9fa48("93865") ? this.lifecycleStateMachine.getState() !== NodeState.DRAINING : stryMutAct_9fa48("93864") ? true : (stryCov_9fa48("93864", "93865"), this.lifecycleStateMachine.getState() === NodeState.DRAINING)))) {
        if (stryMutAct_9fa48("93866")) {
          {}
        } else {
          stryCov_9fa48("93866");
          this.lifecycleStateMachine.transition(NodeState.STOPPED);
        }
      }

      // Clean up state machine event listeners
      if (stryMutAct_9fa48("93868") ? false : stryMutAct_9fa48("93867") ? true : (stryCov_9fa48("93867", "93868"), this.lifecycleStateMachine)) {
        if (stryMutAct_9fa48("93869")) {
          {}
        } else {
          stryCov_9fa48("93869");
          this.lifecycleStateMachine.removeAllListeners();
        }
      }

      // Shutdown thread manager
      if (stryMutAct_9fa48("93871") ? false : stryMutAct_9fa48("93870") ? true : (stryCov_9fa48("93870", "93871"), this.threadManager)) {
        if (stryMutAct_9fa48("93872")) {
          {}
        } else {
          stryCov_9fa48("93872");
          await this.threadManager.shutdown();
        }
      }

      // Clear system table cache references
      this._systemTableCache = null;
      this._readOnlyCache = null;
      this.status = NODE_STATUS.STOPPED;
      this.initialized = stryMutAct_9fa48("93873") ? true : (stryCov_9fa48("93873"), false);
      this.logger.info(NODE_SERVICE_LOG_MSG.SHUTDOWN_COMPLETE, stryMutAct_9fa48("93874") ? {} : (stryCov_9fa48("93874"), {
        nodeId: this.nodeId
      }));
      this.emit(NODE_SERVICE_EVENT.SHUTDOWN, this.nodeId);
    }
  }
}
export { NodeService, NodeStatus, NodeState };