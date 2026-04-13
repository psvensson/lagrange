/**
 * Storage Capacity Accounting Service - derives storage snapshots from metadata.
 *
 * Requirements: 2.2, 2.3, 2.4, 8.1
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { COLUMN, NUM, SERVICE_TYPE, TABLES, TYPEOF } from '../constants/index.js';
import { ReplicaStatus } from './replica-status.js';
import { PRESSURE_STATE, RESERVATION_STATUS, STORAGE_CAPACITY_CONFIG_KEY, STORAGE_CAPACITY_DEFAULT, STORAGE_CAPACITY_ERROR_MSG, STORAGE_CAPACITY_SUBSYSTEM } from './storage-capacity-constants.js';
const STORAGE_ACCOUNTING_SQL = Object.freeze(stryMutAct_9fa48("141345") ? {} : (stryCov_9fa48("141345"), {
  [TABLES.NODES]: stryMutAct_9fa48("141346") ? "" : (stryCov_9fa48("141346"), 'SELECT * FROM nodes'),
  [TABLES.PARTITIONS]: stryMutAct_9fa48("141347") ? "" : (stryCov_9fa48("141347"), 'SELECT * FROM partitions'),
  [TABLES.SERVICES]: stryMutAct_9fa48("141348") ? "" : (stryCov_9fa48("141348"), 'SELECT * FROM services'),
  [TABLES.STORAGE_RESERVATIONS]: stryMutAct_9fa48("141349") ? "" : (stryCov_9fa48("141349"), 'SELECT * FROM storage_reservations')
}));
class StorageCapacityAccountingService {
  /**
   * @param {Object} options
   * @param {Object} options.systemTableCache
   * @param {Object} options.sqlQueryEngine
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("141350")) {
      {}
    } else {
      stryCov_9fa48("141350");
      this.systemTableCache = stryMutAct_9fa48("141353") ? options.systemTableCache && null : stryMutAct_9fa48("141352") ? false : stryMutAct_9fa48("141351") ? true : (stryCov_9fa48("141351", "141352", "141353"), options.systemTableCache || null);
      this.sqlQueryEngine = stryMutAct_9fa48("141356") ? options.sqlQueryEngine && null : stryMutAct_9fa48("141355") ? false : stryMutAct_9fa48("141354") ? true : (stryCov_9fa48("141354", "141355", "141356"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("141359") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        getSqlQueryEngine: () => this.sqlQueryEngine
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("141358") ? false : stryMutAct_9fa48("141357") ? true : (stryCov_9fa48("141357", "141358", "141359"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("141360") ? {} : (stryCov_9fa48("141360"), {
        getSqlQueryEngine: stryMutAct_9fa48("141361") ? () => undefined : (stryCov_9fa48("141361"), () => this.sqlQueryEngine)
      })).controlPlaneSystemTableGateway);
      this.usesDefaultControlPlaneSystemTableGateway = stryMutAct_9fa48("141362") ? options.controlPlaneSystemTableGateway : (stryCov_9fa48("141362"), !options.controlPlaneSystemTableGateway);
      this.config = ConfigurationManager.getInstance();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
      this.refreshConfig();
    }
  }

  /**
   * Initialize or refresh dependencies.
   * @param {Object} options
   * @param {Object} [options.systemTableCache]
   * @param {Object} [options.sqlQueryEngine]
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("141363")) {
      {}
    } else {
      stryCov_9fa48("141363");
      if (stryMutAct_9fa48("141365") ? false : stryMutAct_9fa48("141364") ? true : (stryCov_9fa48("141364", "141365"), options.systemTableCache)) {
        if (stryMutAct_9fa48("141366")) {
          {}
        } else {
          stryCov_9fa48("141366");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("141368") ? false : stryMutAct_9fa48("141367") ? true : (stryCov_9fa48("141367", "141368"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("141369")) {
          {}
        } else {
          stryCov_9fa48("141369");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("141371") ? false : stryMutAct_9fa48("141370") ? true : (stryCov_9fa48("141370", "141371"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("141372")) {
          {}
        } else {
          stryCov_9fa48("141372");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
          this.usesDefaultControlPlaneSystemTableGateway = stryMutAct_9fa48("141373") ? true : (stryCov_9fa48("141373"), false);
        }
      }
      this.refreshConfig();
      this.ensureDataSource();
    }
  }

  /**
   * Refresh configuration values.
   * @private
   */
  refreshConfig() {
    if (stryMutAct_9fa48("141374")) {
      {}
    } else {
      stryCov_9fa48("141374");
      this.softPressurePercent = this.getNumericConfig(STORAGE_CAPACITY_CONFIG_KEY.SOFT_PRESSURE_PERCENT, STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT);
      this.hardPressurePercent = this.getNumericConfig(STORAGE_CAPACITY_CONFIG_KEY.HARD_PRESSURE_PERCENT, STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT);
      this.minimumReplicaBytes = this.getNumericConfig(STORAGE_CAPACITY_CONFIG_KEY.MINIMUM_REPLICA_BYTES, STORAGE_CAPACITY_DEFAULT.MINIMUM_REPLICA_BYTES);
      this.partitionReplicaOverheadBytes = this.getNumericConfig(STORAGE_CAPACITY_CONFIG_KEY.PARTITION_REPLICA_OVERHEAD_BYTES, STORAGE_CAPACITY_DEFAULT.PARTITION_REPLICA_OVERHEAD_BYTES);
      this.messageGroupReplicaOverheadBytes = this.getNumericConfig(STORAGE_CAPACITY_CONFIG_KEY.MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES, STORAGE_CAPACITY_DEFAULT.MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES);
      this.serviceReplicaOverheadBytes = this.getNumericConfig(STORAGE_CAPACITY_CONFIG_KEY.SERVICE_REPLICA_OVERHEAD_BYTES, STORAGE_CAPACITY_DEFAULT.SERVICE_REPLICA_OVERHEAD_BYTES);
    }
  }

  /**
   * Resolve numeric config value with default fallback.
   * @param {string} key
   * @param {number} fallback
   * @return {number}
   * @private
   */
  getNumericConfig(key, fallback) {
    if (stryMutAct_9fa48("141375")) {
      {}
    } else {
      stryCov_9fa48("141375");
      const value = this.config.get(key);
      if (stryMutAct_9fa48("141378") ? typeof value === TYPEOF.NUMBER || Number.isFinite(value) : stryMutAct_9fa48("141377") ? false : stryMutAct_9fa48("141376") ? true : (stryCov_9fa48("141376", "141377", "141378"), (stryMutAct_9fa48("141380") ? typeof value !== TYPEOF.NUMBER : stryMutAct_9fa48("141379") ? true : (stryCov_9fa48("141379", "141380"), typeof value === TYPEOF.NUMBER)) && Number.isFinite(value))) {
        if (stryMutAct_9fa48("141381")) {
          {}
        } else {
          stryCov_9fa48("141381");
          return value;
        }
      }
      return fallback;
    }
  }

  /**
   * Ensure at least one data source is available.
   * @private
   */
  ensureDataSource() {
    if (stryMutAct_9fa48("141382")) {
      {}
    } else {
      stryCov_9fa48("141382");
      const hasReadableGateway = (stryMutAct_9fa48("141385") ? typeof this.controlPlaneSystemTableGateway?.supportsReadRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("141384") ? false : stryMutAct_9fa48("141383") ? true : (stryCov_9fa48("141383", "141384", "141385"), typeof (stryMutAct_9fa48("141386") ? this.controlPlaneSystemTableGateway.supportsReadRows : (stryCov_9fa48("141386"), this.controlPlaneSystemTableGateway?.supportsReadRows)) === TYPEOF.FUNCTION)) ? this.controlPlaneSystemTableGateway.supportsReadRows() : stryMutAct_9fa48("141389") ? typeof this.controlPlaneSystemTableGateway?.readRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("141388") ? false : stryMutAct_9fa48("141387") ? true : (stryCov_9fa48("141387", "141388", "141389"), typeof (stryMutAct_9fa48("141390") ? this.controlPlaneSystemTableGateway.readRows : (stryCov_9fa48("141390"), this.controlPlaneSystemTableGateway?.readRows)) === TYPEOF.FUNCTION);
      assertCritical(stryMutAct_9fa48("141393") ? this.systemTableCache && hasReadableGateway : stryMutAct_9fa48("141392") ? false : stryMutAct_9fa48("141391") ? true : (stryCov_9fa48("141391", "141392", "141393"), this.systemTableCache || hasReadableGateway), STORAGE_CAPACITY_ERROR_MSG.ACCOUNTING_SOURCE_REQUIRED);
    }
  }

  /**
   * Fetch system table rows from cache or SQL.
   * @param {string} tableName
   * @return {Promise<Object[]>}
   * @private
   */
  async getSystemTableRows(tableName) {
    if (stryMutAct_9fa48("141394")) {
      {}
    } else {
      stryCov_9fa48("141394");
      this.ensureDataSource();
      if (stryMutAct_9fa48("141397") ? this.systemTableCache || typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("141396") ? false : stryMutAct_9fa48("141395") ? true : (stryCov_9fa48("141395", "141396", "141397"), this.systemTableCache && (stryMutAct_9fa48("141399") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("141398") ? true : (stryCov_9fa48("141398", "141399"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("141400")) {
          {}
        } else {
          stryCov_9fa48("141400");
          return stryMutAct_9fa48("141403") ? this.systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("141402") ? false : stryMutAct_9fa48("141401") ? true : (stryCov_9fa48("141401", "141402", "141403"), this.systemTableCache.getAll(tableName) || (stryMutAct_9fa48("141404") ? ["Stryker was here"] : (stryCov_9fa48("141404"), [])));
        }
      }
      if (stryMutAct_9fa48("141407") ? false : stryMutAct_9fa48("141406") ? true : stryMutAct_9fa48("141405") ? this.controlPlaneSystemTableGateway : (stryCov_9fa48("141405", "141406", "141407"), !this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("141408")) {
          {}
        } else {
          stryCov_9fa48("141408");
          return stryMutAct_9fa48("141409") ? ["Stryker was here"] : (stryCov_9fa48("141409"), []);
        }
      }
      const query = STORAGE_ACCOUNTING_SQL[tableName];
      if (stryMutAct_9fa48("141412") ? false : stryMutAct_9fa48("141411") ? true : stryMutAct_9fa48("141410") ? query : (stryCov_9fa48("141410", "141411", "141412"), !query)) {
        if (stryMutAct_9fa48("141413")) {
          {}
        } else {
          stryCov_9fa48("141413");
          return stryMutAct_9fa48("141414") ? ["Stryker was here"] : (stryCov_9fa48("141414"), []);
        }
      }
      const result = await this.controlPlaneSystemTableGateway.readRows(tableName, query, stryMutAct_9fa48("141415") ? ["Stryker was here"] : (stryCov_9fa48("141415"), []));
      return stryMutAct_9fa48("141418") ? result?.rows && [] : stryMutAct_9fa48("141417") ? false : stryMutAct_9fa48("141416") ? true : (stryCov_9fa48("141416", "141417", "141418"), (stryMutAct_9fa48("141419") ? result.rows : (stryCov_9fa48("141419"), result?.rows)) || (stryMutAct_9fa48("141420") ? ["Stryker was here"] : (stryCov_9fa48("141420"), [])));
    }
  }
  getSystemTableRowsSync(tableName) {
    if (stryMutAct_9fa48("141421")) {
      {}
    } else {
      stryCov_9fa48("141421");
      this.ensureDataSource();
      if (stryMutAct_9fa48("141424") ? this.systemTableCache || typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("141423") ? false : stryMutAct_9fa48("141422") ? true : (stryCov_9fa48("141422", "141423", "141424"), this.systemTableCache && (stryMutAct_9fa48("141426") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("141425") ? true : (stryCov_9fa48("141425", "141426"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("141427")) {
          {}
        } else {
          stryCov_9fa48("141427");
          return stryMutAct_9fa48("141430") ? this.systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("141429") ? false : stryMutAct_9fa48("141428") ? true : (stryCov_9fa48("141428", "141429", "141430"), this.systemTableCache.getAll(tableName) || (stryMutAct_9fa48("141431") ? ["Stryker was here"] : (stryCov_9fa48("141431"), [])));
        }
      }
      return stryMutAct_9fa48("141432") ? ["Stryker was here"] : (stryCov_9fa48("141432"), []);
    }
  }

  /**
   * Estimate replica bytes for a given entity type and payload size.
   * @param {Object} options
   * @param {string} options.entityType
   * @param {number} options.sizeBytes
   * @param {number} [options.amplificationFactor]
   * @return {number}
   */
  estimateReplicaBytes(options = {}) {
    if (stryMutAct_9fa48("141433")) {
      {}
    } else {
      stryCov_9fa48("141433");
      const entityType = stryMutAct_9fa48("141436") ? options.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("141435") ? false : stryMutAct_9fa48("141434") ? true : (stryCov_9fa48("141434", "141435", "141436"), options.entityType || SERVICE_TYPE.PARTITION);
      const sizeBytes = Number(options.sizeBytes);
      const baseBytes = (stryMutAct_9fa48("141439") ? Number.isFinite(sizeBytes) || sizeBytes > NUM.ZERO : stryMutAct_9fa48("141438") ? false : stryMutAct_9fa48("141437") ? true : (stryCov_9fa48("141437", "141438", "141439"), Number.isFinite(sizeBytes) && (stryMutAct_9fa48("141442") ? sizeBytes <= NUM.ZERO : stryMutAct_9fa48("141441") ? sizeBytes >= NUM.ZERO : stryMutAct_9fa48("141440") ? true : (stryCov_9fa48("141440", "141441", "141442"), sizeBytes > NUM.ZERO)))) ? sizeBytes : NUM.ZERO;
      const payloadBytes = stryMutAct_9fa48("141443") ? Math.min(baseBytes, this.minimumReplicaBytes) : (stryCov_9fa48("141443"), Math.max(baseBytes, this.minimumReplicaBytes));
      const overheadBytes = this.getOverheadBytes(entityType);
      const rawEstimate = stryMutAct_9fa48("141444") ? payloadBytes - overheadBytes : (stryCov_9fa48("141444"), payloadBytes + overheadBytes);
      const amplificationFactor = Number(options.amplificationFactor);
      const multiplier = (stryMutAct_9fa48("141447") ? Number.isFinite(amplificationFactor) || amplificationFactor > NUM.ZERO : stryMutAct_9fa48("141446") ? false : stryMutAct_9fa48("141445") ? true : (stryCov_9fa48("141445", "141446", "141447"), Number.isFinite(amplificationFactor) && (stryMutAct_9fa48("141450") ? amplificationFactor <= NUM.ZERO : stryMutAct_9fa48("141449") ? amplificationFactor >= NUM.ZERO : stryMutAct_9fa48("141448") ? true : (stryCov_9fa48("141448", "141449", "141450"), amplificationFactor > NUM.ZERO)))) ? amplificationFactor : NUM.ONE;
      return Math.ceil(stryMutAct_9fa48("141451") ? rawEstimate / multiplier : (stryCov_9fa48("141451"), rawEstimate * multiplier));
    }
  }

  /**
   * Build storage snapshots for all nodes.
   * @return {Promise<Object[]>}
   */
  async getCapacitySnapshots() {
    if (stryMutAct_9fa48("141452")) {
      {}
    } else {
      stryCov_9fa48("141452");
      const nodes = await this.getSystemTableRows(TABLES.NODES);
      if (stryMutAct_9fa48("141455") ? false : stryMutAct_9fa48("141454") ? true : stryMutAct_9fa48("141453") ? nodes.length : (stryCov_9fa48("141453", "141454", "141455"), !nodes.length)) {
        if (stryMutAct_9fa48("141456")) {
          {}
        } else {
          stryCov_9fa48("141456");
          return stryMutAct_9fa48("141457") ? ["Stryker was here"] : (stryCov_9fa48("141457"), []);
        }
      }
      const partitions = await this.getSystemTableRows(TABLES.PARTITIONS);
      const services = await this.getSystemTableRows(TABLES.SERVICES);
      const reservations = await this.getSystemTableRows(TABLES.STORAGE_RESERVATIONS);
      const partitionSizes = this.buildPartitionSizeMap(partitions);
      const usedBytesByNode = this.calculateUsedBytes(services, partitionSizes);
      const reservedBytesByNode = this.calculateReservedBytes(reservations);
      return nodes.map(node => {
        if (stryMutAct_9fa48("141458")) {
          {}
        } else {
          stryCov_9fa48("141458");
          const nodeId = stryMutAct_9fa48("141459") ? node[COLUMN.NODE_ID] : (stryCov_9fa48("141459"), node?.[COLUMN.NODE_ID]);
          const usedBytes = stryMutAct_9fa48("141462") ? usedBytesByNode.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("141461") ? false : stryMutAct_9fa48("141460") ? true : (stryCov_9fa48("141460", "141461", "141462"), usedBytesByNode.get(nodeId) || NUM.ZERO);
          const reservedBytes = stryMutAct_9fa48("141465") ? reservedBytesByNode.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("141464") ? false : stryMutAct_9fa48("141463") ? true : (stryCov_9fa48("141463", "141464", "141465"), reservedBytesByNode.get(nodeId) || NUM.ZERO);
          return this.buildSnapshot(node, usedBytes, reservedBytes);
        }
      });
    }
  }

  /**
   * Build a storage snapshot for a specific node.
   * @param {string} nodeId
   * @return {Promise<Object|null>}
   */
  async getCapacitySnapshotForNode(nodeId) {
    if (stryMutAct_9fa48("141466")) {
      {}
    } else {
      stryCov_9fa48("141466");
      if (stryMutAct_9fa48("141469") ? false : stryMutAct_9fa48("141468") ? true : stryMutAct_9fa48("141467") ? nodeId : (stryCov_9fa48("141467", "141468", "141469"), !nodeId)) {
        if (stryMutAct_9fa48("141470")) {
          {}
        } else {
          stryCov_9fa48("141470");
          return null;
        }
      }
      const nodes = await this.getSystemTableRows(TABLES.NODES);
      const node = nodes.find(stryMutAct_9fa48("141471") ? () => undefined : (stryCov_9fa48("141471"), row => stryMutAct_9fa48("141474") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("141473") ? false : stryMutAct_9fa48("141472") ? true : (stryCov_9fa48("141472", "141473", "141474"), (stryMutAct_9fa48("141475") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("141475"), row?.[COLUMN.NODE_ID])) === nodeId)));
      if (stryMutAct_9fa48("141478") ? false : stryMutAct_9fa48("141477") ? true : stryMutAct_9fa48("141476") ? node : (stryCov_9fa48("141476", "141477", "141478"), !node)) {
        if (stryMutAct_9fa48("141479")) {
          {}
        } else {
          stryCov_9fa48("141479");
          return null;
        }
      }
      const partitions = await this.getSystemTableRows(TABLES.PARTITIONS);
      const services = await this.getSystemTableRows(TABLES.SERVICES);
      const reservations = await this.getSystemTableRows(TABLES.STORAGE_RESERVATIONS);
      const partitionSizes = this.buildPartitionSizeMap(partitions);
      const usedBytesByNode = this.calculateUsedBytes(services, partitionSizes);
      const reservedBytesByNode = this.calculateReservedBytes(reservations);
      const usedBytes = stryMutAct_9fa48("141482") ? usedBytesByNode.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("141481") ? false : stryMutAct_9fa48("141480") ? true : (stryCov_9fa48("141480", "141481", "141482"), usedBytesByNode.get(nodeId) || NUM.ZERO);
      const reservedBytes = stryMutAct_9fa48("141485") ? reservedBytesByNode.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("141484") ? false : stryMutAct_9fa48("141483") ? true : (stryCov_9fa48("141483", "141484", "141485"), reservedBytesByNode.get(nodeId) || NUM.ZERO);
      return this.buildSnapshot(node, usedBytes, reservedBytes);
    }
  }
  getCapacitySnapshotForNodeSync(nodeId) {
    if (stryMutAct_9fa48("141486")) {
      {}
    } else {
      stryCov_9fa48("141486");
      if (stryMutAct_9fa48("141489") ? false : stryMutAct_9fa48("141488") ? true : stryMutAct_9fa48("141487") ? nodeId : (stryCov_9fa48("141487", "141488", "141489"), !nodeId)) {
        if (stryMutAct_9fa48("141490")) {
          {}
        } else {
          stryCov_9fa48("141490");
          return null;
        }
      }
      const nodes = this.getSystemTableRowsSync(TABLES.NODES);
      const node = nodes.find(stryMutAct_9fa48("141491") ? () => undefined : (stryCov_9fa48("141491"), row => stryMutAct_9fa48("141494") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("141493") ? false : stryMutAct_9fa48("141492") ? true : (stryCov_9fa48("141492", "141493", "141494"), (stryMutAct_9fa48("141495") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("141495"), row?.[COLUMN.NODE_ID])) === nodeId)));
      if (stryMutAct_9fa48("141498") ? false : stryMutAct_9fa48("141497") ? true : stryMutAct_9fa48("141496") ? node : (stryCov_9fa48("141496", "141497", "141498"), !node)) {
        if (stryMutAct_9fa48("141499")) {
          {}
        } else {
          stryCov_9fa48("141499");
          return null;
        }
      }
      const partitions = this.getSystemTableRowsSync(TABLES.PARTITIONS);
      const services = this.getSystemTableRowsSync(TABLES.SERVICES);
      const reservations = this.getSystemTableRowsSync(TABLES.STORAGE_RESERVATIONS);
      const partitionSizes = this.buildPartitionSizeMap(partitions);
      const usedBytesByNode = this.calculateUsedBytes(services, partitionSizes);
      const reservedBytesByNode = this.calculateReservedBytes(reservations);
      const usedBytes = stryMutAct_9fa48("141502") ? usedBytesByNode.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("141501") ? false : stryMutAct_9fa48("141500") ? true : (stryCov_9fa48("141500", "141501", "141502"), usedBytesByNode.get(nodeId) || NUM.ZERO);
      const reservedBytes = stryMutAct_9fa48("141505") ? reservedBytesByNode.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("141504") ? false : stryMutAct_9fa48("141503") ? true : (stryCov_9fa48("141503", "141504", "141505"), reservedBytesByNode.get(nodeId) || NUM.ZERO);
      return this.buildSnapshot(node, usedBytes, reservedBytes);
    }
  }

  /**
   * Build a map of partition sizes keyed by partition ID.
   * @param {Object[]} partitions
   * @return {Map<string, number>}
   * @private
   */
  buildPartitionSizeMap(partitions) {
    if (stryMutAct_9fa48("141506")) {
      {}
    } else {
      stryCov_9fa48("141506");
      const sizes = new Map();
      for (const partition of partitions) {
        if (stryMutAct_9fa48("141507")) {
          {}
        } else {
          stryCov_9fa48("141507");
          const partitionId = stryMutAct_9fa48("141508") ? partition[COLUMN.PARTITION_ID] : (stryCov_9fa48("141508"), partition?.[COLUMN.PARTITION_ID]);
          if (stryMutAct_9fa48("141511") ? false : stryMutAct_9fa48("141510") ? true : stryMutAct_9fa48("141509") ? partitionId : (stryCov_9fa48("141509", "141510", "141511"), !partitionId)) {
            if (stryMutAct_9fa48("141512")) {
              {}
            } else {
              stryCov_9fa48("141512");
              continue;
            }
          }
          const sizeBytes = Number(stryMutAct_9fa48("141513") ? partition[COLUMN.SIZE_BYTES] : (stryCov_9fa48("141513"), partition?.[COLUMN.SIZE_BYTES]));
          const normalized = (stryMutAct_9fa48("141516") ? Number.isFinite(sizeBytes) || sizeBytes > NUM.ZERO : stryMutAct_9fa48("141515") ? false : stryMutAct_9fa48("141514") ? true : (stryCov_9fa48("141514", "141515", "141516"), Number.isFinite(sizeBytes) && (stryMutAct_9fa48("141519") ? sizeBytes <= NUM.ZERO : stryMutAct_9fa48("141518") ? sizeBytes >= NUM.ZERO : stryMutAct_9fa48("141517") ? true : (stryCov_9fa48("141517", "141518", "141519"), sizeBytes > NUM.ZERO)))) ? Math.floor(sizeBytes) : NUM.ZERO;
          sizes.set(partitionId, normalized);
        }
      }
      return sizes;
    }
  }

  /**
   * Calculate used bytes per node from replica metadata.
   * @param {Object[]} services
   * @param {Map<string, number>} partitionSizes
   * @return {Map<string, number>}
   * @private
   */
  calculateUsedBytes(services, partitionSizes) {
    if (stryMutAct_9fa48("141520")) {
      {}
    } else {
      stryCov_9fa48("141520");
      const usedBytesByNode = new Map();
      for (const service of services) {
        if (stryMutAct_9fa48("141521")) {
          {}
        } else {
          stryCov_9fa48("141521");
          const nodeId = stryMutAct_9fa48("141522") ? service[COLUMN.NODE_ID] : (stryCov_9fa48("141522"), service?.[COLUMN.NODE_ID]);
          if (stryMutAct_9fa48("141525") ? false : stryMutAct_9fa48("141524") ? true : stryMutAct_9fa48("141523") ? nodeId : (stryCov_9fa48("141523", "141524", "141525"), !nodeId)) {
            if (stryMutAct_9fa48("141526")) {
              {}
            } else {
              stryCov_9fa48("141526");
              continue;
            }
          }
          if (stryMutAct_9fa48("141529") ? false : stryMutAct_9fa48("141528") ? true : stryMutAct_9fa48("141527") ? this.shouldCountService(service) : (stryCov_9fa48("141527", "141528", "141529"), !this.shouldCountService(service))) {
            if (stryMutAct_9fa48("141530")) {
              {}
            } else {
              stryCov_9fa48("141530");
              continue;
            }
          }
          const entityType = stryMutAct_9fa48("141533") ? service?.[COLUMN.SERVICE_TYPE] && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("141532") ? false : stryMutAct_9fa48("141531") ? true : (stryCov_9fa48("141531", "141532", "141533"), (stryMutAct_9fa48("141534") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("141534"), service?.[COLUMN.SERVICE_TYPE])) || SERVICE_TYPE.PARTITION);
          const sizeBytes = this.getServicePayloadBytes(service, partitionSizes);
          const estimated = this.estimateReplicaBytes(stryMutAct_9fa48("141535") ? {} : (stryCov_9fa48("141535"), {
            entityType,
            sizeBytes
          }));
          const current = stryMutAct_9fa48("141538") ? usedBytesByNode.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("141537") ? false : stryMutAct_9fa48("141536") ? true : (stryCov_9fa48("141536", "141537", "141538"), usedBytesByNode.get(nodeId) || NUM.ZERO);
          usedBytesByNode.set(nodeId, stryMutAct_9fa48("141539") ? current - estimated : (stryCov_9fa48("141539"), current + estimated));
        }
      }
      return usedBytesByNode;
    }
  }

  /**
   * Calculate reserved bytes per node from reservation metadata.
   * @param {Object[]} reservations
   * @return {Map<string, number>}
   * @private
   */
  calculateReservedBytes(reservations) {
    if (stryMutAct_9fa48("141540")) {
      {}
    } else {
      stryCov_9fa48("141540");
      const reservedByNode = new Map();
      const now = Date.now();
      for (const reservation of reservations) {
        if (stryMutAct_9fa48("141541")) {
          {}
        } else {
          stryCov_9fa48("141541");
          const status = stryMutAct_9fa48("141544") ? reservation?.[COLUMN.STATUS] && RESERVATION_STATUS.ACTIVE : stryMutAct_9fa48("141543") ? false : stryMutAct_9fa48("141542") ? true : (stryCov_9fa48("141542", "141543", "141544"), (stryMutAct_9fa48("141545") ? reservation[COLUMN.STATUS] : (stryCov_9fa48("141545"), reservation?.[COLUMN.STATUS])) || RESERVATION_STATUS.ACTIVE);
          if (stryMutAct_9fa48("141548") ? status === RESERVATION_STATUS.ACTIVE : stryMutAct_9fa48("141547") ? false : stryMutAct_9fa48("141546") ? true : (stryCov_9fa48("141546", "141547", "141548"), status !== RESERVATION_STATUS.ACTIVE)) {
            if (stryMutAct_9fa48("141549")) {
              {}
            } else {
              stryCov_9fa48("141549");
              continue;
            }
          }
          const expiresAt = Number(stryMutAct_9fa48("141550") ? reservation[COLUMN.EXPIRES_AT] : (stryCov_9fa48("141550"), reservation?.[COLUMN.EXPIRES_AT]));
          if (stryMutAct_9fa48("141553") ? Number.isFinite(expiresAt) || expiresAt <= now : stryMutAct_9fa48("141552") ? false : stryMutAct_9fa48("141551") ? true : (stryCov_9fa48("141551", "141552", "141553"), Number.isFinite(expiresAt) && (stryMutAct_9fa48("141556") ? expiresAt > now : stryMutAct_9fa48("141555") ? expiresAt < now : stryMutAct_9fa48("141554") ? true : (stryCov_9fa48("141554", "141555", "141556"), expiresAt <= now)))) {
            if (stryMutAct_9fa48("141557")) {
              {}
            } else {
              stryCov_9fa48("141557");
              continue;
            }
          }
          const nodeId = stryMutAct_9fa48("141558") ? reservation[COLUMN.TARGET_NODE_ID] : (stryCov_9fa48("141558"), reservation?.[COLUMN.TARGET_NODE_ID]);
          if (stryMutAct_9fa48("141561") ? false : stryMutAct_9fa48("141560") ? true : stryMutAct_9fa48("141559") ? nodeId : (stryCov_9fa48("141559", "141560", "141561"), !nodeId)) {
            if (stryMutAct_9fa48("141562")) {
              {}
            } else {
              stryCov_9fa48("141562");
              continue;
            }
          }
          const estimatedBytes = Number(stryMutAct_9fa48("141563") ? reservation[COLUMN.ESTIMATED_BYTES] : (stryCov_9fa48("141563"), reservation?.[COLUMN.ESTIMATED_BYTES]));
          if (stryMutAct_9fa48("141566") ? !Number.isFinite(estimatedBytes) && estimatedBytes <= NUM.ZERO : stryMutAct_9fa48("141565") ? false : stryMutAct_9fa48("141564") ? true : (stryCov_9fa48("141564", "141565", "141566"), (stryMutAct_9fa48("141567") ? Number.isFinite(estimatedBytes) : (stryCov_9fa48("141567"), !Number.isFinite(estimatedBytes))) || (stryMutAct_9fa48("141570") ? estimatedBytes > NUM.ZERO : stryMutAct_9fa48("141569") ? estimatedBytes < NUM.ZERO : stryMutAct_9fa48("141568") ? false : (stryCov_9fa48("141568", "141569", "141570"), estimatedBytes <= NUM.ZERO)))) {
            if (stryMutAct_9fa48("141571")) {
              {}
            } else {
              stryCov_9fa48("141571");
              continue;
            }
          }
          const amplification = Number(stryMutAct_9fa48("141572") ? reservation[COLUMN.AMPLIFICATION_FACTOR] : (stryCov_9fa48("141572"), reservation?.[COLUMN.AMPLIFICATION_FACTOR]));
          const multiplier = (stryMutAct_9fa48("141575") ? Number.isFinite(amplification) || amplification > NUM.ZERO : stryMutAct_9fa48("141574") ? false : stryMutAct_9fa48("141573") ? true : (stryCov_9fa48("141573", "141574", "141575"), Number.isFinite(amplification) && (stryMutAct_9fa48("141578") ? amplification <= NUM.ZERO : stryMutAct_9fa48("141577") ? amplification >= NUM.ZERO : stryMutAct_9fa48("141576") ? true : (stryCov_9fa48("141576", "141577", "141578"), amplification > NUM.ZERO)))) ? amplification : NUM.ONE;
          const reservedBytes = Math.ceil(stryMutAct_9fa48("141579") ? estimatedBytes / multiplier : (stryCov_9fa48("141579"), estimatedBytes * multiplier));
          const current = stryMutAct_9fa48("141582") ? reservedByNode.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("141581") ? false : stryMutAct_9fa48("141580") ? true : (stryCov_9fa48("141580", "141581", "141582"), reservedByNode.get(nodeId) || NUM.ZERO);
          reservedByNode.set(nodeId, stryMutAct_9fa48("141583") ? current - reservedBytes : (stryCov_9fa48("141583"), current + reservedBytes));
        }
      }
      return reservedByNode;
    }
  }

  /**
   * Determine if a service should count toward used bytes.
   * @param {Object} service
   * @return {boolean}
   * @private
   */
  shouldCountService(service) {
    if (stryMutAct_9fa48("141584")) {
      {}
    } else {
      stryCov_9fa48("141584");
      const status = stryMutAct_9fa48("141585") ? service[COLUMN.STATUS] : (stryCov_9fa48("141585"), service?.[COLUMN.STATUS]);
      return stryMutAct_9fa48("141588") ? status === ReplicaStatus.REMOVED : stryMutAct_9fa48("141587") ? false : stryMutAct_9fa48("141586") ? true : (stryCov_9fa48("141586", "141587", "141588"), status !== ReplicaStatus.REMOVED);
    }
  }

  /**
   * Resolve payload size for a service row.
   * @param {Object} service
   * @param {Map<string, number>} partitionSizes
   * @return {number}
   * @private
   */
  getServicePayloadBytes(service, partitionSizes) {
    if (stryMutAct_9fa48("141589")) {
      {}
    } else {
      stryCov_9fa48("141589");
      const entityType = stryMutAct_9fa48("141590") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("141590"), service?.[COLUMN.SERVICE_TYPE]);
      if (stryMutAct_9fa48("141593") ? entityType === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("141592") ? false : stryMutAct_9fa48("141591") ? true : (stryCov_9fa48("141591", "141592", "141593"), entityType !== SERVICE_TYPE.PARTITION)) {
        if (stryMutAct_9fa48("141594")) {
          {}
        } else {
          stryCov_9fa48("141594");
          return NUM.ZERO;
        }
      }
      const partitionId = stryMutAct_9fa48("141595") ? service[COLUMN.PARTITION_ID] : (stryCov_9fa48("141595"), service?.[COLUMN.PARTITION_ID]);
      if (stryMutAct_9fa48("141598") ? false : stryMutAct_9fa48("141597") ? true : stryMutAct_9fa48("141596") ? partitionId : (stryCov_9fa48("141596", "141597", "141598"), !partitionId)) {
        if (stryMutAct_9fa48("141599")) {
          {}
        } else {
          stryCov_9fa48("141599");
          return NUM.ZERO;
        }
      }
      return stryMutAct_9fa48("141602") ? partitionSizes.get(partitionId) && NUM.ZERO : stryMutAct_9fa48("141601") ? false : stryMutAct_9fa48("141600") ? true : (stryCov_9fa48("141600", "141601", "141602"), partitionSizes.get(partitionId) || NUM.ZERO);
    }
  }

  /**
   * Get overhead bytes based on entity type.
   * @param {string} entityType
   * @return {number}
   * @private
   */
  getOverheadBytes(entityType) {
    if (stryMutAct_9fa48("141603")) {
      {}
    } else {
      stryCov_9fa48("141603");
      if (stryMutAct_9fa48("141606") ? entityType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("141605") ? false : stryMutAct_9fa48("141604") ? true : (stryCov_9fa48("141604", "141605", "141606"), entityType === SERVICE_TYPE.PARTITION)) {
        if (stryMutAct_9fa48("141607")) {
          {}
        } else {
          stryCov_9fa48("141607");
          return this.partitionReplicaOverheadBytes;
        }
      }
      if (stryMutAct_9fa48("141610") ? entityType === SERVICE_TYPE.MESSAGE_GROUP && entityType === SERVICE_TYPE.MESSAGE_GROUP_REPLICA : stryMutAct_9fa48("141609") ? false : stryMutAct_9fa48("141608") ? true : (stryCov_9fa48("141608", "141609", "141610"), (stryMutAct_9fa48("141612") ? entityType !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("141611") ? false : (stryCov_9fa48("141611", "141612"), entityType === SERVICE_TYPE.MESSAGE_GROUP)) || (stryMutAct_9fa48("141614") ? entityType !== SERVICE_TYPE.MESSAGE_GROUP_REPLICA : stryMutAct_9fa48("141613") ? false : (stryCov_9fa48("141613", "141614"), entityType === SERVICE_TYPE.MESSAGE_GROUP_REPLICA)))) {
        if (stryMutAct_9fa48("141615")) {
          {}
        } else {
          stryCov_9fa48("141615");
          return this.messageGroupReplicaOverheadBytes;
        }
      }
      return this.serviceReplicaOverheadBytes;
    }
  }

  /**
   * Build a capacity snapshot for a node.
   * @param {Object} nodeRow
   * @param {number} usedBytes
   * @param {number} reservedBytes
   * @return {Object}
   * @private
   */
  buildSnapshot(nodeRow, usedBytes, reservedBytes) {
    if (stryMutAct_9fa48("141616")) {
      {}
    } else {
      stryCov_9fa48("141616");
      const nodeId = stryMutAct_9fa48("141617") ? nodeRow[COLUMN.NODE_ID] : (stryCov_9fa48("141617"), nodeRow?.[COLUMN.NODE_ID]);
      const budgetBytes = Number(stryMutAct_9fa48("141618") ? nodeRow[COLUMN.STORAGE_BUDGET_BYTES] : (stryCov_9fa48("141618"), nodeRow?.[COLUMN.STORAGE_BUDGET_BYTES]));
      const hasBudget = stryMutAct_9fa48("141621") ? Number.isFinite(budgetBytes) || budgetBytes > NUM.ZERO : stryMutAct_9fa48("141620") ? false : stryMutAct_9fa48("141619") ? true : (stryCov_9fa48("141619", "141620", "141621"), Number.isFinite(budgetBytes) && (stryMutAct_9fa48("141624") ? budgetBytes <= NUM.ZERO : stryMutAct_9fa48("141623") ? budgetBytes >= NUM.ZERO : stryMutAct_9fa48("141622") ? true : (stryCov_9fa48("141622", "141623", "141624"), budgetBytes > NUM.ZERO)));
      const normalizedBudget = hasBudget ? Math.floor(budgetBytes) : null;
      const normalizedUsed = Number.isFinite(usedBytes) ? usedBytes : NUM.ZERO;
      const normalizedReserved = Number.isFinite(reservedBytes) ? reservedBytes : NUM.ZERO;
      const totalAllocated = stryMutAct_9fa48("141625") ? normalizedUsed - normalizedReserved : (stryCov_9fa48("141625"), normalizedUsed + normalizedReserved);
      const availableBytes = hasBudget ? stryMutAct_9fa48("141626") ? Math.min(NUM.ZERO, normalizedBudget - totalAllocated) : (stryCov_9fa48("141626"), Math.max(NUM.ZERO, stryMutAct_9fa48("141627") ? normalizedBudget + totalAllocated : (stryCov_9fa48("141627"), normalizedBudget - totalAllocated))) : NUM.ZERO;
      const pressureState = this.getPressureState(totalAllocated, normalizedBudget);
      const utilizationPercent = (stryMutAct_9fa48("141630") ? hasBudget || normalizedBudget > NUM.ZERO : stryMutAct_9fa48("141629") ? false : stryMutAct_9fa48("141628") ? true : (stryCov_9fa48("141628", "141629", "141630"), hasBudget && (stryMutAct_9fa48("141633") ? normalizedBudget <= NUM.ZERO : stryMutAct_9fa48("141632") ? normalizedBudget >= NUM.ZERO : stryMutAct_9fa48("141631") ? true : (stryCov_9fa48("141631", "141632", "141633"), normalizedBudget > NUM.ZERO)))) ? stryMutAct_9fa48("141634") ? totalAllocated / normalizedBudget / NUM.HUNDRED : (stryCov_9fa48("141634"), (stryMutAct_9fa48("141635") ? totalAllocated * normalizedBudget : (stryCov_9fa48("141635"), totalAllocated / normalizedBudget)) * NUM.HUNDRED) : NUM.HUNDRED;
      return stryMutAct_9fa48("141636") ? {} : (stryCov_9fa48("141636"), {
        nodeId,
        budgetBytes: normalizedBudget,
        usedBytes: normalizedUsed,
        reservedBytes: normalizedReserved,
        availableBytes,
        utilizationPercent,
        pressureState
      });
    }
  }

  /**
   * Derive pressure state from utilization.
   * @param {number} allocatedBytes
   * @param {number|null} budgetBytes
   * @return {string}
   * @private
   */
  getPressureState(allocatedBytes, budgetBytes) {
    if (stryMutAct_9fa48("141637")) {
      {}
    } else {
      stryCov_9fa48("141637");
      if (stryMutAct_9fa48("141640") ? !Number.isFinite(budgetBytes) && budgetBytes <= NUM.ZERO : stryMutAct_9fa48("141639") ? false : stryMutAct_9fa48("141638") ? true : (stryCov_9fa48("141638", "141639", "141640"), (stryMutAct_9fa48("141641") ? Number.isFinite(budgetBytes) : (stryCov_9fa48("141641"), !Number.isFinite(budgetBytes))) || (stryMutAct_9fa48("141644") ? budgetBytes > NUM.ZERO : stryMutAct_9fa48("141643") ? budgetBytes < NUM.ZERO : stryMutAct_9fa48("141642") ? false : (stryCov_9fa48("141642", "141643", "141644"), budgetBytes <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("141645")) {
          {}
        } else {
          stryCov_9fa48("141645");
          return PRESSURE_STATE.EXHAUSTED;
        }
      }
      const utilization = stryMutAct_9fa48("141646") ? allocatedBytes / budgetBytes / NUM.HUNDRED : (stryCov_9fa48("141646"), (stryMutAct_9fa48("141647") ? allocatedBytes * budgetBytes : (stryCov_9fa48("141647"), allocatedBytes / budgetBytes)) * NUM.HUNDRED);
      if (stryMutAct_9fa48("141651") ? utilization < NUM.HUNDRED : stryMutAct_9fa48("141650") ? utilization > NUM.HUNDRED : stryMutAct_9fa48("141649") ? false : stryMutAct_9fa48("141648") ? true : (stryCov_9fa48("141648", "141649", "141650", "141651"), utilization >= NUM.HUNDRED)) {
        if (stryMutAct_9fa48("141652")) {
          {}
        } else {
          stryCov_9fa48("141652");
          return PRESSURE_STATE.EXHAUSTED;
        }
      }
      if (stryMutAct_9fa48("141656") ? utilization < this.hardPressurePercent : stryMutAct_9fa48("141655") ? utilization > this.hardPressurePercent : stryMutAct_9fa48("141654") ? false : stryMutAct_9fa48("141653") ? true : (stryCov_9fa48("141653", "141654", "141655", "141656"), utilization >= this.hardPressurePercent)) {
        if (stryMutAct_9fa48("141657")) {
          {}
        } else {
          stryCov_9fa48("141657");
          return PRESSURE_STATE.HARD;
        }
      }
      if (stryMutAct_9fa48("141661") ? utilization < this.softPressurePercent : stryMutAct_9fa48("141660") ? utilization > this.softPressurePercent : stryMutAct_9fa48("141659") ? false : stryMutAct_9fa48("141658") ? true : (stryCov_9fa48("141658", "141659", "141660", "141661"), utilization >= this.softPressurePercent)) {
        if (stryMutAct_9fa48("141662")) {
          {}
        } else {
          stryCov_9fa48("141662");
          return PRESSURE_STATE.SOFT;
        }
      }
      return PRESSURE_STATE.NORMAL;
    }
  }
}
export { StorageCapacityAccountingService };