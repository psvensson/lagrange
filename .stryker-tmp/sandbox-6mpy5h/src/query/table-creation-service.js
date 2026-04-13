/**
 * Table Creation Service - Handles CREATE TABLE with automatic partition key.
 * Implements automatic partition key from PRIMARY KEY and partition transparency.
 * Requirements: 20.1, 20.2, 20.3, 20.10
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
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { NUM, STATE, TABLES } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_LOG_MSG, QUERY_OPERATION, QUERY_SUBSYSTEM } from './query-constants.js';
const TABLE_CREATION_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("125527") ? {} : (stryCov_9fa48("125527"), {
  FUNCTION: stryMutAct_9fa48("125528") ? "" : (stryCov_9fa48("125528"), "function"),
  STRING: stryMutAct_9fa48("125529") ? "" : (stryCov_9fa48("125529"), "string"),
  UPDATE: stryMutAct_9fa48("125530") ? "" : (stryCov_9fa48("125530"), "UPDATE"),
  INSERT: stryMutAct_9fa48("125531") ? "" : (stryCov_9fa48("125531"), "INSERT"),
  TABLE_POLICY_CHANGED: stryMutAct_9fa48("125532") ? "" : (stryCov_9fa48("125532"), "table_policy_changed"),
  PARTITION_SIZE_CHANGED: stryMutAct_9fa48("125533") ? "" : (stryCov_9fa48("125533"), "partition_size_changed"),
  VISIBLE: stryMutAct_9fa48("125534") ? "" : (stryCov_9fa48("125534"), "visible"),
  EMPTY: stryMutAct_9fa48("125535") ? "" : (stryCov_9fa48("125535"), ","),
  UNABLE_TO_RESTORE_MISSING_INITIAL_PARTITION_METADATA_FOR_TABLE: stryMutAct_9fa48("125536") ? "" : (stryCov_9fa48("125536"), "Unable to restore missing initial partition metadata for table "),
  TABLE_CONSTRAINT: stryMutAct_9fa48("125537") ? "" : (stryCov_9fa48("125537"), "table_constraint"),
  COLUMN_CONSTRAINT: stryMutAct_9fa48("125538") ? "" : (stryCov_9fa48("125538"), "column_constraint")
}));
const TABLE_CREATION_SQL = Object.freeze(stryMutAct_9fa48("125539") ? {} : (stryCov_9fa48("125539"), {
  SELECT_TABLE_BY_NAME: stryMutAct_9fa48("125540") ? `` : (stryCov_9fa48("125540"), `SELECT * FROM ${TABLES.TABLES} WHERE table_name = ? LIMIT 1`),
  SELECT_PARTITION_BY_ID: stryMutAct_9fa48("125541") ? `` : (stryCov_9fa48("125541"), `SELECT * FROM ${TABLES.PARTITIONS} WHERE partition_id = ? LIMIT 1`)
}));
const TABLE_CREATION_COMPLETION_STATE = Object.freeze(stryMutAct_9fa48("125542") ? {} : (stryCov_9fa48("125542"), {
  ACTIVE: stryMutAct_9fa48("125543") ? "" : (stryCov_9fa48("125543"), 'active'),
  PENDING_CREATION: stryMutAct_9fa48("125544") ? "" : (stryCov_9fa48("125544"), 'pending_creation')
}));
const TABLE_CREATION_COMPLETION_REASON = Object.freeze(stryMutAct_9fa48("125545") ? {} : (stryCov_9fa48("125545"), {
  METADATA_VISIBILITY_PENDING: stryMutAct_9fa48("125546") ? "" : (stryCov_9fa48("125546"), 'metadata_visibility_pending'),
  REPLICA_CONVERGENCE_PENDING: stryMutAct_9fa48("125547") ? "" : (stryCov_9fa48("125547"), 'replica_convergence_pending')
}));
const TABLE_CREATION_VISIBILITY_STATE = Object.freeze(stryMutAct_9fa48("125548") ? {} : (stryCov_9fa48("125548"), {
  VISIBLE: stryMutAct_9fa48("125549") ? "" : (stryCov_9fa48("125549"), 'visible')
}));
function normalizeProvisioningSummary(provisioningResult = null, context = {}) {
  if (stryMutAct_9fa48("125550")) {
    {}
  } else {
    stryCov_9fa48("125550");
    const requestedReplicaCount = (stryMutAct_9fa48("125553") ? Number.isInteger(context?.replicaCount) || context.replicaCount > 0 : stryMutAct_9fa48("125552") ? false : stryMutAct_9fa48("125551") ? true : (stryCov_9fa48("125551", "125552", "125553"), Number.isInteger(stryMutAct_9fa48("125554") ? context.replicaCount : (stryCov_9fa48("125554"), context?.replicaCount)) && (stryMutAct_9fa48("125557") ? context.replicaCount <= 0 : stryMutAct_9fa48("125556") ? context.replicaCount >= 0 : stryMutAct_9fa48("125555") ? true : (stryCov_9fa48("125555", "125556", "125557"), context.replicaCount > 0)))) ? context.replicaCount : null;
    const minimumRoutableReplicaCount = (stryMutAct_9fa48("125560") ? Number.isInteger(context?.minimumRoutableReplicaCount) || context.minimumRoutableReplicaCount > 0 : stryMutAct_9fa48("125559") ? false : stryMutAct_9fa48("125558") ? true : (stryCov_9fa48("125558", "125559", "125560"), Number.isInteger(stryMutAct_9fa48("125561") ? context.minimumRoutableReplicaCount : (stryCov_9fa48("125561"), context?.minimumRoutableReplicaCount)) && (stryMutAct_9fa48("125564") ? context.minimumRoutableReplicaCount <= 0 : stryMutAct_9fa48("125563") ? context.minimumRoutableReplicaCount >= 0 : stryMutAct_9fa48("125562") ? true : (stryCov_9fa48("125562", "125563", "125564"), context.minimumRoutableReplicaCount > 0)))) ? context.minimumRoutableReplicaCount : null;
    const normalized = (stryMutAct_9fa48("125567") ? provisioningResult || typeof provisioningResult === 'object' : stryMutAct_9fa48("125566") ? false : stryMutAct_9fa48("125565") ? true : (stryCov_9fa48("125565", "125566", "125567"), provisioningResult && (stryMutAct_9fa48("125569") ? typeof provisioningResult !== 'object' : stryMutAct_9fa48("125568") ? true : (stryCov_9fa48("125568", "125569"), typeof provisioningResult === (stryMutAct_9fa48("125570") ? "" : (stryCov_9fa48("125570"), 'object')))))) ? provisioningResult : {};
    const resolvedReplicaCount = (stryMutAct_9fa48("125573") ? Number.isInteger(normalized?.resolvedReplicaCount) || normalized.resolvedReplicaCount > 0 : stryMutAct_9fa48("125572") ? false : stryMutAct_9fa48("125571") ? true : (stryCov_9fa48("125571", "125572", "125573"), Number.isInteger(stryMutAct_9fa48("125574") ? normalized.resolvedReplicaCount : (stryCov_9fa48("125574"), normalized?.resolvedReplicaCount)) && (stryMutAct_9fa48("125577") ? normalized.resolvedReplicaCount <= 0 : stryMutAct_9fa48("125576") ? normalized.resolvedReplicaCount >= 0 : stryMutAct_9fa48("125575") ? true : (stryCov_9fa48("125575", "125576", "125577"), normalized.resolvedReplicaCount > 0)))) ? normalized.resolvedReplicaCount : requestedReplicaCount;
    const fallbackRoutableReplicaCount = (stryMutAct_9fa48("125580") ? Number.isInteger(minimumRoutableReplicaCount) || minimumRoutableReplicaCount > 0 : stryMutAct_9fa48("125579") ? false : stryMutAct_9fa48("125578") ? true : (stryCov_9fa48("125578", "125579", "125580"), Number.isInteger(minimumRoutableReplicaCount) && (stryMutAct_9fa48("125583") ? minimumRoutableReplicaCount <= 0 : stryMutAct_9fa48("125582") ? minimumRoutableReplicaCount >= 0 : stryMutAct_9fa48("125581") ? true : (stryCov_9fa48("125581", "125582", "125583"), minimumRoutableReplicaCount > 0)))) ? minimumRoutableReplicaCount : NUM.ZERO;
    const routableReplicaCount = (stryMutAct_9fa48("125586") ? Number.isInteger(normalized?.routableReplicaCount) || normalized.routableReplicaCount >= 0 : stryMutAct_9fa48("125585") ? false : stryMutAct_9fa48("125584") ? true : (stryCov_9fa48("125584", "125585", "125586"), Number.isInteger(stryMutAct_9fa48("125587") ? normalized.routableReplicaCount : (stryCov_9fa48("125587"), normalized?.routableReplicaCount)) && (stryMutAct_9fa48("125590") ? normalized.routableReplicaCount < 0 : stryMutAct_9fa48("125589") ? normalized.routableReplicaCount > 0 : stryMutAct_9fa48("125588") ? true : (stryCov_9fa48("125588", "125589", "125590"), normalized.routableReplicaCount >= 0)))) ? normalized.routableReplicaCount : fallbackRoutableReplicaCount;
    return stryMutAct_9fa48("125591") ? {} : (stryCov_9fa48("125591"), {
      requestedReplicaCount,
      resolvedReplicaCount,
      minimumRoutableReplicaCount: (stryMutAct_9fa48("125594") ? Number.isInteger(normalized?.minimumRoutableReplicaCount) || normalized.minimumRoutableReplicaCount > NUM.ZERO : stryMutAct_9fa48("125593") ? false : stryMutAct_9fa48("125592") ? true : (stryCov_9fa48("125592", "125593", "125594"), Number.isInteger(stryMutAct_9fa48("125595") ? normalized.minimumRoutableReplicaCount : (stryCov_9fa48("125595"), normalized?.minimumRoutableReplicaCount)) && (stryMutAct_9fa48("125598") ? normalized.minimumRoutableReplicaCount <= NUM.ZERO : stryMutAct_9fa48("125597") ? normalized.minimumRoutableReplicaCount >= NUM.ZERO : stryMutAct_9fa48("125596") ? true : (stryCov_9fa48("125596", "125597", "125598"), normalized.minimumRoutableReplicaCount > NUM.ZERO)))) ? normalized.minimumRoutableReplicaCount : minimumRoutableReplicaCount,
      routableReplicaCount,
      fullReplicaCountConverged: stryMutAct_9fa48("125601") ? (!Number.isInteger(requestedReplicaCount) || requestedReplicaCount <= NUM.ZERO) && routableReplicaCount >= requestedReplicaCount : stryMutAct_9fa48("125600") ? false : stryMutAct_9fa48("125599") ? true : (stryCov_9fa48("125599", "125600", "125601"), (stryMutAct_9fa48("125603") ? !Number.isInteger(requestedReplicaCount) && requestedReplicaCount <= NUM.ZERO : stryMutAct_9fa48("125602") ? false : (stryCov_9fa48("125602", "125603"), (stryMutAct_9fa48("125604") ? Number.isInteger(requestedReplicaCount) : (stryCov_9fa48("125604"), !Number.isInteger(requestedReplicaCount))) || (stryMutAct_9fa48("125607") ? requestedReplicaCount > NUM.ZERO : stryMutAct_9fa48("125606") ? requestedReplicaCount < NUM.ZERO : stryMutAct_9fa48("125605") ? false : (stryCov_9fa48("125605", "125606", "125607"), requestedReplicaCount <= NUM.ZERO)))) || (stryMutAct_9fa48("125610") ? routableReplicaCount < requestedReplicaCount : stryMutAct_9fa48("125609") ? routableReplicaCount > requestedReplicaCount : stryMutAct_9fa48("125608") ? false : (stryCov_9fa48("125608", "125609", "125610"), routableReplicaCount >= requestedReplicaCount)))
    });
  }
}
function resolveTableCreationCompletion(options = {}) {
  if (stryMutAct_9fa48("125611")) {
    {}
  } else {
    stryCov_9fa48("125611");
    const visibilityState = String(stryMutAct_9fa48("125614") ? options?.visibilityState && TABLE_CREATION_VISIBILITY_STATE.VISIBLE : stryMutAct_9fa48("125613") ? false : stryMutAct_9fa48("125612") ? true : (stryCov_9fa48("125612", "125613", "125614"), (stryMutAct_9fa48("125615") ? options.visibilityState : (stryCov_9fa48("125615"), options?.visibilityState)) || TABLE_CREATION_VISIBILITY_STATE.VISIBLE));
    const provisioningSummary = stryMutAct_9fa48("125618") ? options?.provisioningSummary && null : stryMutAct_9fa48("125617") ? false : stryMutAct_9fa48("125616") ? true : (stryCov_9fa48("125616", "125617", "125618"), (stryMutAct_9fa48("125619") ? options.provisioningSummary : (stryCov_9fa48("125619"), options?.provisioningSummary)) || null);
    let completionState = TABLE_CREATION_COMPLETION_STATE.ACTIVE;
    let completionReason = null;
    if (stryMutAct_9fa48("125622") ? visibilityState === TABLE_CREATION_VISIBILITY_STATE.VISIBLE : stryMutAct_9fa48("125621") ? false : stryMutAct_9fa48("125620") ? true : (stryCov_9fa48("125620", "125621", "125622"), visibilityState !== TABLE_CREATION_VISIBILITY_STATE.VISIBLE)) {
      if (stryMutAct_9fa48("125623")) {
        {}
      } else {
        stryCov_9fa48("125623");
        completionState = TABLE_CREATION_COMPLETION_STATE.PENDING_CREATION;
        completionReason = TABLE_CREATION_COMPLETION_REASON.METADATA_VISIBILITY_PENDING;
      }
    } else if (stryMutAct_9fa48("125626") ? provisioningSummary || provisioningSummary.fullReplicaCountConverged === false : stryMutAct_9fa48("125625") ? false : stryMutAct_9fa48("125624") ? true : (stryCov_9fa48("125624", "125625", "125626"), provisioningSummary && (stryMutAct_9fa48("125628") ? provisioningSummary.fullReplicaCountConverged !== false : stryMutAct_9fa48("125627") ? true : (stryCov_9fa48("125627", "125628"), provisioningSummary.fullReplicaCountConverged === (stryMutAct_9fa48("125629") ? true : (stryCov_9fa48("125629"), false)))))) {
      if (stryMutAct_9fa48("125630")) {
        {}
      } else {
        stryCov_9fa48("125630");
        completionState = TABLE_CREATION_COMPLETION_STATE.PENDING_CREATION;
        completionReason = TABLE_CREATION_COMPLETION_REASON.REPLICA_CONVERGENCE_PENDING;
      }
    }
    return stryMutAct_9fa48("125631") ? {} : (stryCov_9fa48("125631"), {
      completionState,
      completionReason
    });
  }
}
function buildCreateTableSuccessResult(options = {}) {
  if (stryMutAct_9fa48("125632")) {
    {}
  } else {
    stryCov_9fa48("125632");
    return stryMutAct_9fa48("125633") ? {} : (stryCov_9fa48("125633"), {
      success: stryMutAct_9fa48("125634") ? false : (stryCov_9fa48("125634"), true),
      operation: QUERY_OPERATION.CREATE_TABLE,
      ...options
    });
  }
}

/**
 * TableCreationService handles table creation with automatic partition key
 * derivation from PRIMARY KEY and ensures partition transparency.
 */
class TableCreationService {
  /**
   * Create a new TableCreationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Function} options.partitionProvisioner - Initial partition
   *   provisioning callback.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("125635")) {
      {}
    } else {
      stryCov_9fa48("125635");
      this.systemCache = null;
      this.cdcIntegrationService = stryMutAct_9fa48("125638") ? options.cdcIntegrationService && null : stryMutAct_9fa48("125637") ? false : stryMutAct_9fa48("125636") ? true : (stryCov_9fa48("125636", "125637", "125638"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("125641") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemCache
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("125640") ? false : stryMutAct_9fa48("125639") ? true : (stryCov_9fa48("125639", "125640", "125641"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("125642") ? {} : (stryCov_9fa48("125642"), {
        getCdcIntegrationService: stryMutAct_9fa48("125643") ? () => undefined : (stryCov_9fa48("125643"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("125644") ? () => undefined : (stryCov_9fa48("125644"), () => this.systemCache)
      })).controlPlaneSystemTableGateway);
      this.partitionSplitMergeManager = null;
      this.tablePolicyByTableId = new Map();
      this.partitionSizeByPartitionId = new Map();
      this.cachePolicyChangeListener = null;
      this.calculateQuorumReplicaCount = (stryMutAct_9fa48("125647") ? typeof options.calculateQuorumReplicaCount !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125646") ? false : stryMutAct_9fa48("125645") ? true : (stryCov_9fa48("125645", "125646", "125647"), typeof options.calculateQuorumReplicaCount === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) ? options.calculateQuorumReplicaCount : null;
      this.partitionProvisioner = (stryMutAct_9fa48("125650") ? typeof options.partitionProvisioner !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125649") ? false : stryMutAct_9fa48("125648") ? true : (stryCov_9fa48("125648", "125649", "125650"), typeof options.partitionProvisioner === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) ? options.partitionProvisioner : null;

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.defaultReplicaCount = stryMutAct_9fa48("125653") ? config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) && NUM.THREE : stryMutAct_9fa48("125652") ? false : stryMutAct_9fa48("125651") ? true : (stryCov_9fa48("125651", "125652", "125653"), config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || NUM.THREE);
      this.logger = this.initLogger();
      this.setSystemCache(stryMutAct_9fa48("125656") ? options.systemCache && null : stryMutAct_9fa48("125655") ? false : stryMutAct_9fa48("125654") ? true : (stryCov_9fa48("125654", "125655", "125656"), options.systemCache || null));
      this.setPartitionSplitMergeManager(stryMutAct_9fa48("125659") ? options.partitionSplitMergeManager && null : stryMutAct_9fa48("125658") ? false : stryMutAct_9fa48("125657") ? true : (stryCov_9fa48("125657", "125658", "125659"), options.partitionSplitMergeManager || null));
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("125660")) {
      {}
    } else {
      stryCov_9fa48("125660");
      try {
        if (stryMutAct_9fa48("125661")) {
          {}
        } else {
          stryCov_9fa48("125661");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("125663") ? false : stryMutAct_9fa48("125662") ? true : (stryCov_9fa48("125662", "125663"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("125664")) {
              {}
            } else {
              stryCov_9fa48("125664");
              return loggingService.forSubsystem(QUERY_SUBSYSTEM.TABLE_CREATION_SERVICE);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    if (stryMutAct_9fa48("125665")) {
      {}
    } else {
      stryCov_9fa48("125665");
      if (stryMutAct_9fa48("125668") ? this.systemCache !== cache : stryMutAct_9fa48("125667") ? false : stryMutAct_9fa48("125666") ? true : (stryCov_9fa48("125666", "125667", "125668"), this.systemCache === cache)) {
        if (stryMutAct_9fa48("125669")) {
          {}
        } else {
          stryCov_9fa48("125669");
          return;
        }
      }
      this.detachCachePolicyListener();
      this.systemCache = stryMutAct_9fa48("125672") ? cache && null : stryMutAct_9fa48("125671") ? false : stryMutAct_9fa48("125670") ? true : (stryCov_9fa48("125670", "125671", "125672"), cache || null);
      this.attachCachePolicyListener();
    }
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    if (stryMutAct_9fa48("125673")) {
      {}
    } else {
      stryCov_9fa48("125673");
      this.cdcIntegrationService = service;
    }
  }
  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    if (stryMutAct_9fa48("125674")) {
      {}
    } else {
      stryCov_9fa48("125674");
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("125677") ? controlPlaneSystemTableGateway && null : stryMutAct_9fa48("125676") ? false : stryMutAct_9fa48("125675") ? true : (stryCov_9fa48("125675", "125676", "125677"), controlPlaneSystemTableGateway || null);
    }
  }

  /**
   * Set partition split/merge manager integration hook.
   * @param {Object} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    if (stryMutAct_9fa48("125678")) {
      {}
    } else {
      stryCov_9fa48("125678");
      if (stryMutAct_9fa48("125681") ? this.partitionSplitMergeManager !== manager : stryMutAct_9fa48("125680") ? false : stryMutAct_9fa48("125679") ? true : (stryCov_9fa48("125679", "125680", "125681"), this.partitionSplitMergeManager === manager)) {
        if (stryMutAct_9fa48("125682")) {
          {}
        } else {
          stryCov_9fa48("125682");
          return;
        }
      }
      this.detachCachePolicyListener();
      this.stopPeriodicSplitMergeEvaluation();
      this.partitionSplitMergeManager = stryMutAct_9fa48("125685") ? manager && null : stryMutAct_9fa48("125684") ? false : stryMutAct_9fa48("125683") ? true : (stryCov_9fa48("125683", "125684", "125685"), manager || null);
      this.startPeriodicSplitMergeEvaluation();
      this.attachCachePolicyListener();
    }
  }

  /**
   * Attach cache listener that triggers split/merge evaluation when table
   * policy values change.
   * @private
   */
  attachCachePolicyListener() {
    if (stryMutAct_9fa48("125686")) {
      {}
    } else {
      stryCov_9fa48("125686");
      const cache = this.systemCache;
      const manager = this.partitionSplitMergeManager;
      if (stryMutAct_9fa48("125689") ? (!cache || typeof cache.onCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION || typeof cache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION || !manager) && typeof manager.evaluateAllPartitions !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION && typeof manager.requestEvaluation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125688") ? false : stryMutAct_9fa48("125687") ? true : (stryCov_9fa48("125687", "125688", "125689"), (stryMutAct_9fa48("125691") ? (!cache || typeof cache.onCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION || typeof cache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION) && !manager : stryMutAct_9fa48("125690") ? false : (stryCov_9fa48("125690", "125691"), (stryMutAct_9fa48("125693") ? (!cache || typeof cache.onCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION) && typeof cache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125692") ? false : (stryCov_9fa48("125692", "125693"), (stryMutAct_9fa48("125695") ? !cache && typeof cache.onCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125694") ? false : (stryCov_9fa48("125694", "125695"), (stryMutAct_9fa48("125696") ? cache : (stryCov_9fa48("125696"), !cache)) || (stryMutAct_9fa48("125698") ? typeof cache.onCacheChange === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125697") ? false : (stryCov_9fa48("125697", "125698"), typeof cache.onCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) || (stryMutAct_9fa48("125700") ? typeof cache.getAll === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125699") ? false : (stryCov_9fa48("125699", "125700"), typeof cache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) || (stryMutAct_9fa48("125701") ? manager : (stryCov_9fa48("125701"), !manager)))) || (stryMutAct_9fa48("125703") ? typeof manager.evaluateAllPartitions !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION || typeof manager.requestEvaluation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125702") ? false : (stryCov_9fa48("125702", "125703"), (stryMutAct_9fa48("125705") ? typeof manager.evaluateAllPartitions === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125704") ? true : (stryCov_9fa48("125704", "125705"), typeof manager.evaluateAllPartitions !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) && (stryMutAct_9fa48("125707") ? typeof manager.requestEvaluation === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125706") ? true : (stryCov_9fa48("125706", "125707"), typeof manager.requestEvaluation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))))) {
        if (stryMutAct_9fa48("125708")) {
          {}
        } else {
          stryCov_9fa48("125708");
          this.tablePolicyByTableId.clear();
          this.partitionSizeByPartitionId.clear();
          return;
        }
      }
      this.seedTablePolicyCache(cache);
      this.seedPartitionMetricsCache(cache);
      this.cachePolicyChangeListener = (tableName, operation, record) => {
        if (stryMutAct_9fa48("125709")) {
          {}
        } else {
          stryCov_9fa48("125709");
          this.onSystemTableCacheChange(tableName, operation, record);
        }
      };
      cache.onCacheChange(this.cachePolicyChangeListener);
    }
  }

  /**
   * Detach previously registered cache policy listener.
   * @private
   */
  detachCachePolicyListener() {
    if (stryMutAct_9fa48("125710")) {
      {}
    } else {
      stryCov_9fa48("125710");
      const cache = this.systemCache;
      if (stryMutAct_9fa48("125713") ? cache && typeof cache.offCacheChange === TABLE_CREATION_SERVICE_LITERAL.FUNCTION || this.cachePolicyChangeListener : stryMutAct_9fa48("125712") ? false : stryMutAct_9fa48("125711") ? true : (stryCov_9fa48("125711", "125712", "125713"), (stryMutAct_9fa48("125715") ? cache || typeof cache.offCacheChange === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125714") ? true : (stryCov_9fa48("125714", "125715"), cache && (stryMutAct_9fa48("125717") ? typeof cache.offCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125716") ? true : (stryCov_9fa48("125716", "125717"), typeof cache.offCacheChange === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) && this.cachePolicyChangeListener)) {
        if (stryMutAct_9fa48("125718")) {
          {}
        } else {
          stryCov_9fa48("125718");
          cache.offCacheChange(this.cachePolicyChangeListener);
        }
      }
      this.cachePolicyChangeListener = null;
      this.tablePolicyByTableId.clear();
      this.partitionSizeByPartitionId.clear();
    }
  }

  /**
   * Seed known table policy values from current cache rows.
   * @param {Object} cache
   * @private
   */
  seedTablePolicyCache(cache) {
    if (stryMutAct_9fa48("125719")) {
      {}
    } else {
      stryCov_9fa48("125719");
      this.tablePolicyByTableId.clear();
      const tableRows = cache.getAll(TABLES.TABLES);
      if (stryMutAct_9fa48("125722") ? false : stryMutAct_9fa48("125721") ? true : stryMutAct_9fa48("125720") ? Array.isArray(tableRows) : (stryCov_9fa48("125720", "125721", "125722"), !Array.isArray(tableRows))) {
        if (stryMutAct_9fa48("125723")) {
          {}
        } else {
          stryCov_9fa48("125723");
          return;
        }
      }
      for (const row of tableRows) {
        if (stryMutAct_9fa48("125724")) {
          {}
        } else {
          stryCov_9fa48("125724");
          const tableId = this.resolveTableId(row);
          const policyValue = this.resolveTablePolicyValue(row);
          if (stryMutAct_9fa48("125727") ? !tableId && policyValue === null : stryMutAct_9fa48("125726") ? false : stryMutAct_9fa48("125725") ? true : (stryCov_9fa48("125725", "125726", "125727"), (stryMutAct_9fa48("125728") ? tableId : (stryCov_9fa48("125728"), !tableId)) || (stryMutAct_9fa48("125730") ? policyValue !== null : stryMutAct_9fa48("125729") ? false : (stryCov_9fa48("125729", "125730"), policyValue === null)))) {
            if (stryMutAct_9fa48("125731")) {
              {}
            } else {
              stryCov_9fa48("125731");
              continue;
            }
          }
          this.tablePolicyByTableId.set(tableId, policyValue);
        }
      }
    }
  }

  /**
   * Seed known partition sizes from current cache rows.
   * @param {Object} cache
   * @private
   */
  seedPartitionMetricsCache(cache) {
    if (stryMutAct_9fa48("125732")) {
      {}
    } else {
      stryCov_9fa48("125732");
      this.partitionSizeByPartitionId.clear();
      const partitionRows = cache.getAll(TABLES.PARTITIONS);
      if (stryMutAct_9fa48("125735") ? false : stryMutAct_9fa48("125734") ? true : stryMutAct_9fa48("125733") ? Array.isArray(partitionRows) : (stryCov_9fa48("125733", "125734", "125735"), !Array.isArray(partitionRows))) {
        if (stryMutAct_9fa48("125736")) {
          {}
        } else {
          stryCov_9fa48("125736");
          return;
        }
      }
      for (const row of partitionRows) {
        if (stryMutAct_9fa48("125737")) {
          {}
        } else {
          stryCov_9fa48("125737");
          const partitionId = this.resolvePartitionId(row);
          const partitionSize = this.resolvePartitionSizeValue(row);
          if (stryMutAct_9fa48("125740") ? !partitionId && partitionSize === null : stryMutAct_9fa48("125739") ? false : stryMutAct_9fa48("125738") ? true : (stryCov_9fa48("125738", "125739", "125740"), (stryMutAct_9fa48("125741") ? partitionId : (stryCov_9fa48("125741"), !partitionId)) || (stryMutAct_9fa48("125743") ? partitionSize !== null : stryMutAct_9fa48("125742") ? false : (stryCov_9fa48("125742", "125743"), partitionSize === null)))) {
            if (stryMutAct_9fa48("125744")) {
              {}
            } else {
              stryCov_9fa48("125744");
              continue;
            }
          }
          this.partitionSizeByPartitionId.set(partitionId, partitionSize);
        }
      }
    }
  }

  /**
   * Resolve canonical table ID from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolveTableId(row) {
    if (stryMutAct_9fa48("125745")) {
      {}
    } else {
      stryCov_9fa48("125745");
      const tableId = stryMutAct_9fa48("125746") ? (row?.table_id ?? row?.tableId) && null : (stryCov_9fa48("125746"), (stryMutAct_9fa48("125747") ? row?.table_id && row?.tableId : (stryCov_9fa48("125747"), (stryMutAct_9fa48("125748") ? row.table_id : (stryCov_9fa48("125748"), row?.table_id)) ?? (stryMutAct_9fa48("125749") ? row.tableId : (stryCov_9fa48("125749"), row?.tableId)))) ?? null);
      return (stryMutAct_9fa48("125752") ? typeof tableId === TABLE_CREATION_SERVICE_LITERAL.STRING || tableId.length > NUM.ZERO : stryMutAct_9fa48("125751") ? false : stryMutAct_9fa48("125750") ? true : (stryCov_9fa48("125750", "125751", "125752"), (stryMutAct_9fa48("125754") ? typeof tableId !== TABLE_CREATION_SERVICE_LITERAL.STRING : stryMutAct_9fa48("125753") ? true : (stryCov_9fa48("125753", "125754"), typeof tableId === TABLE_CREATION_SERVICE_LITERAL.STRING)) && (stryMutAct_9fa48("125757") ? tableId.length <= NUM.ZERO : stryMutAct_9fa48("125756") ? tableId.length >= NUM.ZERO : stryMutAct_9fa48("125755") ? true : (stryCov_9fa48("125755", "125756", "125757"), tableId.length > NUM.ZERO)))) ? tableId : null;
    }
  }

  /**
   * Resolve normalized table policy value from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolveTablePolicyValue(row) {
    if (stryMutAct_9fa48("125758")) {
      {}
    } else {
      stryCov_9fa48("125758");
      const value = stryMutAct_9fa48("125759") ? (row?.table_policies ?? row?.tablePolicies) && null : (stryCov_9fa48("125759"), (stryMutAct_9fa48("125760") ? row?.table_policies && row?.tablePolicies : (stryCov_9fa48("125760"), (stryMutAct_9fa48("125761") ? row.table_policies : (stryCov_9fa48("125761"), row?.table_policies)) ?? (stryMutAct_9fa48("125762") ? row.tablePolicies : (stryCov_9fa48("125762"), row?.tablePolicies)))) ?? null);
      if (stryMutAct_9fa48("125765") ? value === null && value === undefined : stryMutAct_9fa48("125764") ? false : stryMutAct_9fa48("125763") ? true : (stryCov_9fa48("125763", "125764", "125765"), (stryMutAct_9fa48("125767") ? value !== null : stryMutAct_9fa48("125766") ? false : (stryCov_9fa48("125766", "125767"), value === null)) || (stryMutAct_9fa48("125769") ? value !== undefined : stryMutAct_9fa48("125768") ? false : (stryCov_9fa48("125768", "125769"), value === undefined)))) {
        if (stryMutAct_9fa48("125770")) {
          {}
        } else {
          stryCov_9fa48("125770");
          return null;
        }
      }
      if (stryMutAct_9fa48("125773") ? typeof value !== TABLE_CREATION_SERVICE_LITERAL.STRING : stryMutAct_9fa48("125772") ? false : stryMutAct_9fa48("125771") ? true : (stryCov_9fa48("125771", "125772", "125773"), typeof value === TABLE_CREATION_SERVICE_LITERAL.STRING)) {
        if (stryMutAct_9fa48("125774")) {
          {}
        } else {
          stryCov_9fa48("125774");
          return value;
        }
      }
      try {
        if (stryMutAct_9fa48("125775")) {
          {}
        } else {
          stryCov_9fa48("125775");
          return JSON.stringify(value);
        }
      } catch (_error) {
        if (stryMutAct_9fa48("125776")) {
          {}
        } else {
          stryCov_9fa48("125776");
          return String(value);
        }
      }
    }
  }

  /**
   * Resolve canonical partition ID from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolvePartitionId(row) {
    if (stryMutAct_9fa48("125777")) {
      {}
    } else {
      stryCov_9fa48("125777");
      const partitionId = stryMutAct_9fa48("125778") ? (row?.partition_id ?? row?.partitionId) && null : (stryCov_9fa48("125778"), (stryMutAct_9fa48("125779") ? row?.partition_id && row?.partitionId : (stryCov_9fa48("125779"), (stryMutAct_9fa48("125780") ? row.partition_id : (stryCov_9fa48("125780"), row?.partition_id)) ?? (stryMutAct_9fa48("125781") ? row.partitionId : (stryCov_9fa48("125781"), row?.partitionId)))) ?? null);
      return (stryMutAct_9fa48("125784") ? typeof partitionId === TABLE_CREATION_SERVICE_LITERAL.STRING || partitionId.length > NUM.ZERO : stryMutAct_9fa48("125783") ? false : stryMutAct_9fa48("125782") ? true : (stryCov_9fa48("125782", "125783", "125784"), (stryMutAct_9fa48("125786") ? typeof partitionId !== TABLE_CREATION_SERVICE_LITERAL.STRING : stryMutAct_9fa48("125785") ? true : (stryCov_9fa48("125785", "125786"), typeof partitionId === TABLE_CREATION_SERVICE_LITERAL.STRING)) && (stryMutAct_9fa48("125789") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("125788") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("125787") ? true : (stryCov_9fa48("125787", "125788", "125789"), partitionId.length > NUM.ZERO)))) ? partitionId : null;
    }
  }

  /**
   * Resolve normalized partition size from a row.
   * @param {Object} row
   * @return {number|null}
   * @private
   */
  resolvePartitionSizeValue(row) {
    if (stryMutAct_9fa48("125790")) {
      {}
    } else {
      stryCov_9fa48("125790");
      const sizeBytes = Number(stryMutAct_9fa48("125791") ? row?.size_bytes && row?.sizeBytes : (stryCov_9fa48("125791"), (stryMutAct_9fa48("125792") ? row.size_bytes : (stryCov_9fa48("125792"), row?.size_bytes)) ?? (stryMutAct_9fa48("125793") ? row.sizeBytes : (stryCov_9fa48("125793"), row?.sizeBytes))));
      return (stryMutAct_9fa48("125796") ? Number.isFinite(sizeBytes) || sizeBytes >= NUM.ZERO : stryMutAct_9fa48("125795") ? false : stryMutAct_9fa48("125794") ? true : (stryCov_9fa48("125794", "125795", "125796"), Number.isFinite(sizeBytes) && (stryMutAct_9fa48("125799") ? sizeBytes < NUM.ZERO : stryMutAct_9fa48("125798") ? sizeBytes > NUM.ZERO : stryMutAct_9fa48("125797") ? true : (stryCov_9fa48("125797", "125798", "125799"), sizeBytes >= NUM.ZERO)))) ? sizeBytes : null;
    }
  }

  /**
   * Handle system cache change notifications.
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  onSystemTableCacheChange(tableName, operation, record) {
    if (stryMutAct_9fa48("125800")) {
      {}
    } else {
      stryCov_9fa48("125800");
      if (stryMutAct_9fa48("125803") ? operation !== TABLE_CREATION_SERVICE_LITERAL.UPDATE || operation !== TABLE_CREATION_SERVICE_LITERAL.INSERT : stryMutAct_9fa48("125802") ? false : stryMutAct_9fa48("125801") ? true : (stryCov_9fa48("125801", "125802", "125803"), (stryMutAct_9fa48("125805") ? operation === TABLE_CREATION_SERVICE_LITERAL.UPDATE : stryMutAct_9fa48("125804") ? true : (stryCov_9fa48("125804", "125805"), operation !== TABLE_CREATION_SERVICE_LITERAL.UPDATE)) && (stryMutAct_9fa48("125807") ? operation === TABLE_CREATION_SERVICE_LITERAL.INSERT : stryMutAct_9fa48("125806") ? true : (stryCov_9fa48("125806", "125807"), operation !== TABLE_CREATION_SERVICE_LITERAL.INSERT)))) {
        if (stryMutAct_9fa48("125808")) {
          {}
        } else {
          stryCov_9fa48("125808");
          return;
        }
      }
      if (stryMutAct_9fa48("125811") ? tableName !== TABLES.TABLES : stryMutAct_9fa48("125810") ? false : stryMutAct_9fa48("125809") ? true : (stryCov_9fa48("125809", "125810", "125811"), tableName === TABLES.TABLES)) {
        if (stryMutAct_9fa48("125812")) {
          {}
        } else {
          stryCov_9fa48("125812");
          this.handleTablePolicyCacheChange(operation, record);
          return;
        }
      }
      if (stryMutAct_9fa48("125815") ? tableName !== TABLES.PARTITIONS : stryMutAct_9fa48("125814") ? false : stryMutAct_9fa48("125813") ? true : (stryCov_9fa48("125813", "125814", "125815"), tableName === TABLES.PARTITIONS)) {
        if (stryMutAct_9fa48("125816")) {
          {}
        } else {
          stryCov_9fa48("125816");
          this.handlePartitionMetricsCacheChange(operation, record);
        }
      }
    }
  }

  /**
   * Handle split/merge trigger decisions for table policy cache changes.
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handleTablePolicyCacheChange(operation, record) {
    if (stryMutAct_9fa48("125817")) {
      {}
    } else {
      stryCov_9fa48("125817");
      const tableId = this.resolveTableId(record);
      const policyValue = this.resolveTablePolicyValue(record);
      if (stryMutAct_9fa48("125820") ? !tableId && policyValue === null : stryMutAct_9fa48("125819") ? false : stryMutAct_9fa48("125818") ? true : (stryCov_9fa48("125818", "125819", "125820"), (stryMutAct_9fa48("125821") ? tableId : (stryCov_9fa48("125821"), !tableId)) || (stryMutAct_9fa48("125823") ? policyValue !== null : stryMutAct_9fa48("125822") ? false : (stryCov_9fa48("125822", "125823"), policyValue === null)))) {
        if (stryMutAct_9fa48("125824")) {
          {}
        } else {
          stryCov_9fa48("125824");
          return;
        }
      }
      const previousPolicyValue = this.tablePolicyByTableId.get(tableId);
      this.tablePolicyByTableId.set(tableId, policyValue);
      if (stryMutAct_9fa48("125827") ? previousPolicyValue !== policyValue : stryMutAct_9fa48("125826") ? false : stryMutAct_9fa48("125825") ? true : (stryCov_9fa48("125825", "125826", "125827"), previousPolicyValue === policyValue)) {
        if (stryMutAct_9fa48("125828")) {
          {}
        } else {
          stryCov_9fa48("125828");
          return;
        }
      }
      this.logger.debug(QUERY_LOG_MSG.TABLE_POLICY_CHANGE_TRIGGER_SPLIT_EVAL, stryMutAct_9fa48("125829") ? {} : (stryCov_9fa48("125829"), {
        tableId,
        operation
      }));
      this.requestSplitMergeEvaluation(stryMutAct_9fa48("125830") ? {} : (stryCov_9fa48("125830"), {
        reasonCode: TABLE_CREATION_SERVICE_LITERAL.TABLE_POLICY_CHANGED
      }));
    }
  }

  /**
   * Handle split/merge trigger decisions for partition size cache changes.
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handlePartitionMetricsCacheChange(operation, record) {
    if (stryMutAct_9fa48("125831")) {
      {}
    } else {
      stryCov_9fa48("125831");
      const partitionId = this.resolvePartitionId(record);
      const partitionSize = this.resolvePartitionSizeValue(record);
      if (stryMutAct_9fa48("125834") ? !partitionId && partitionSize === null : stryMutAct_9fa48("125833") ? false : stryMutAct_9fa48("125832") ? true : (stryCov_9fa48("125832", "125833", "125834"), (stryMutAct_9fa48("125835") ? partitionId : (stryCov_9fa48("125835"), !partitionId)) || (stryMutAct_9fa48("125837") ? partitionSize !== null : stryMutAct_9fa48("125836") ? false : (stryCov_9fa48("125836", "125837"), partitionSize === null)))) {
        if (stryMutAct_9fa48("125838")) {
          {}
        } else {
          stryCov_9fa48("125838");
          return;
        }
      }
      const previousPartitionSize = this.partitionSizeByPartitionId.get(partitionId);
      this.partitionSizeByPartitionId.set(partitionId, partitionSize);
      if (stryMutAct_9fa48("125841") ? previousPartitionSize !== partitionSize : stryMutAct_9fa48("125840") ? false : stryMutAct_9fa48("125839") ? true : (stryCov_9fa48("125839", "125840", "125841"), previousPartitionSize === partitionSize)) {
        if (stryMutAct_9fa48("125842")) {
          {}
        } else {
          stryCov_9fa48("125842");
          return;
        }
      }
      this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_SIZE_CHANGE_TRIGGER_SPLIT_EVAL, stryMutAct_9fa48("125843") ? {} : (stryCov_9fa48("125843"), {
        partitionId,
        operation,
        previousPartitionSize,
        partitionSize
      }));
      this.requestSplitMergeEvaluation(stryMutAct_9fa48("125844") ? {} : (stryCov_9fa48("125844"), {
        reasonCode: TABLE_CREATION_SERVICE_LITERAL.PARTITION_SIZE_CHANGED,
        partitionId
      }));
    }
  }

  /**
   * Request split/merge evaluation through the manager's canonical trigger path.
   * Falls back to direct evaluation when the manager does not expose the
   * coalesced request API yet.
   * @param {Object} [context]
   * @private
   */
  requestSplitMergeEvaluation(context = {}) {
    if (stryMutAct_9fa48("125845")) {
      {}
    } else {
      stryCov_9fa48("125845");
      const manager = this.partitionSplitMergeManager;
      if (stryMutAct_9fa48("125848") ? false : stryMutAct_9fa48("125847") ? true : stryMutAct_9fa48("125846") ? manager : (stryCov_9fa48("125846", "125847", "125848"), !manager)) {
        if (stryMutAct_9fa48("125849")) {
          {}
        } else {
          stryCov_9fa48("125849");
          return;
        }
      }
      if (stryMutAct_9fa48("125852") ? typeof manager.requestEvaluation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125851") ? false : stryMutAct_9fa48("125850") ? true : (stryCov_9fa48("125850", "125851", "125852"), typeof manager.requestEvaluation === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) {
        if (stryMutAct_9fa48("125853")) {
          {}
        } else {
          stryCov_9fa48("125853");
          manager.requestEvaluation(context);
          return;
        }
      }
      void this.evaluateSplitMergeLifecycle();
    }
  }

  /**
   * Set initial table partition provisioning callback.
   * @param {Function} provisioner - Provisioning callback.
   */
  setPartitionProvisioner(provisioner) {
    if (stryMutAct_9fa48("125854")) {
      {}
    } else {
      stryCov_9fa48("125854");
      this.partitionProvisioner = (stryMutAct_9fa48("125857") ? typeof provisioner !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125856") ? false : stryMutAct_9fa48("125855") ? true : (stryCov_9fa48("125855", "125856", "125857"), typeof provisioner === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) ? provisioner : null;
    }
  }

  /**
   * Create a table from a parsed CREATE TABLE AST.
   * Automatically uses PRIMARY KEY as partition key.
   * Requirements: 20.1, 20.2, 20.3
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @return {Promise<Object>} Creation result.
   */
  async createTable(ast) {
    if (stryMutAct_9fa48("125858")) {
      {}
    } else {
      stryCov_9fa48("125858");
      const {
        tableName,
        columns,
        primaryKey,
        ifNotExists
      } = ast;
      this.logger.info(QUERY_LOG_MSG.TABLE_CREATE_START, stryMutAct_9fa48("125859") ? {} : (stryCov_9fa48("125859"), {
        tableName,
        columnCount: columns.length,
        primaryKey,
        ifNotExists
      }));

      // Validate PRIMARY KEY requirement (Requirement 20.2)
      if (stryMutAct_9fa48("125862") ? !primaryKey && primaryKey.length === NUM.ZERO : stryMutAct_9fa48("125861") ? false : stryMutAct_9fa48("125860") ? true : (stryCov_9fa48("125860", "125861", "125862"), (stryMutAct_9fa48("125863") ? primaryKey : (stryCov_9fa48("125863"), !primaryKey)) || (stryMutAct_9fa48("125865") ? primaryKey.length !== NUM.ZERO : stryMutAct_9fa48("125864") ? false : (stryCov_9fa48("125864", "125865"), primaryKey.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("125866")) {
          {}
        } else {
          stryCov_9fa48("125866");
          const error = new Error((stryMutAct_9fa48("125867") ? `` : (stryCov_9fa48("125867"), `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}`)) + (stryMutAct_9fa48("125868") ? `` : (stryCov_9fa48("125868"), `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX}. `)) + QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL);
          error.code = QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED;
          throw error;
        }
      }

      // Check if table already exists
      const existingTable = await this.findExistingTableRecord(tableName);
      if (stryMutAct_9fa48("125870") ? false : stryMutAct_9fa48("125869") ? true : (stryCov_9fa48("125869", "125870"), existingTable)) {
        if (stryMutAct_9fa48("125871")) {
          {}
        } else {
          stryCov_9fa48("125871");
          if (stryMutAct_9fa48("125873") ? false : stryMutAct_9fa48("125872") ? true : (stryCov_9fa48("125872", "125873"), ifNotExists)) {
            if (stryMutAct_9fa48("125874")) {
              {}
            } else {
              stryCov_9fa48("125874");
              const reconciliation = await this.reconcileExistingInitialPartition(tableName, existingTable);
              const visibilityState = String(stryMutAct_9fa48("125877") ? reconciliation?.visibilityState && TABLE_CREATION_VISIBILITY_STATE.VISIBLE : stryMutAct_9fa48("125876") ? false : stryMutAct_9fa48("125875") ? true : (stryCov_9fa48("125875", "125876", "125877"), (stryMutAct_9fa48("125878") ? reconciliation.visibilityState : (stryCov_9fa48("125878"), reconciliation?.visibilityState)) || TABLE_CREATION_VISIBILITY_STATE.VISIBLE));
              const completion = resolveTableCreationCompletion(stryMutAct_9fa48("125879") ? {} : (stryCov_9fa48("125879"), {
                visibilityState,
                provisioningSummary: stryMutAct_9fa48("125882") ? reconciliation?.provisioningSummary && null : stryMutAct_9fa48("125881") ? false : stryMutAct_9fa48("125880") ? true : (stryCov_9fa48("125880", "125881", "125882"), (stryMutAct_9fa48("125883") ? reconciliation.provisioningSummary : (stryCov_9fa48("125883"), reconciliation?.provisioningSummary)) || null)
              }));
              this.logger.debug(QUERY_LOG_MSG.TABLE_EXISTS_SKIP, stryMutAct_9fa48("125884") ? {} : (stryCov_9fa48("125884"), {
                tableName
              }));
              return buildCreateTableSuccessResult(stryMutAct_9fa48("125885") ? {} : (stryCov_9fa48("125885"), {
                tableName,
                skipped: stryMutAct_9fa48("125886") ? false : (stryCov_9fa48("125886"), true),
                completionState: completion.completionState,
                completionReason: completion.completionReason,
                visibilityState,
                visibilityPending: stryMutAct_9fa48("125889") ? visibilityState === TABLE_CREATION_SERVICE_LITERAL.VISIBLE : stryMutAct_9fa48("125888") ? false : stryMutAct_9fa48("125887") ? true : (stryCov_9fa48("125887", "125888", "125889"), visibilityState !== TABLE_CREATION_SERVICE_LITERAL.VISIBLE),
                partitionMetadataCreated: stryMutAct_9fa48("125892") ? reconciliation?.partitionMetadataCreated !== true : stryMutAct_9fa48("125891") ? false : stryMutAct_9fa48("125890") ? true : (stryCov_9fa48("125890", "125891", "125892"), (stryMutAct_9fa48("125893") ? reconciliation.partitionMetadataCreated : (stryCov_9fa48("125893"), reconciliation?.partitionMetadataCreated)) === (stryMutAct_9fa48("125894") ? false : (stryCov_9fa48("125894"), true))),
                provisioningSummary: stryMutAct_9fa48("125897") ? reconciliation?.provisioningSummary && null : stryMutAct_9fa48("125896") ? false : stryMutAct_9fa48("125895") ? true : (stryCov_9fa48("125895", "125896", "125897"), (stryMutAct_9fa48("125898") ? reconciliation.provisioningSummary : (stryCov_9fa48("125898"), reconciliation?.provisioningSummary)) || null),
                message: (stryMutAct_9fa48("125899") ? `` : (stryCov_9fa48("125899"), `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}`)) + QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX
              }));
            }
          }
          const error = new Error((stryMutAct_9fa48("125900") ? `` : (stryCov_9fa48("125900"), `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}`)) + QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX);
          error.code = QUERY_ERROR_CODE.TABLE_EXISTS;
          throw error;
        }
      }

      // Derive partition key from PRIMARY KEY (Requirement 20.1)
      const partitionKey = this.derivePartitionKey(primaryKey);

      // Generate table ID
      const tableId = stryMutAct_9fa48("125901") ? `` : (stryCov_9fa48("125901"), `tbl-${uuidv4()}`);

      // Build schema definition
      const schemaDefinition = this.buildSchemaDefinition(columns);

      // Create table metadata
      const tableMetadata = stryMutAct_9fa48("125902") ? {} : (stryCov_9fa48("125902"), {
        table_id: tableId,
        table_name: tableName,
        schema_definition: JSON.stringify(schemaDefinition),
        partition_key: partitionKey,
        table_policies: JSON.stringify({}),
        partition_count: 1,
        active_partition_version: 1,
        pending_partition_version: null,
        partition_transition_state: null,
        partition_transition_metadata: null,
        created_at: Date.now(),
        updated_at: Date.now()
      });

      // Create initial partition with full key range [NULL, NULL) (Requirement 20.3)
      const partitionId = stryMutAct_9fa48("125903") ? `` : (stryCov_9fa48("125903"), `${tableId}-p1`);
      const partitionMetadata = stryMutAct_9fa48("125904") ? {} : (stryCov_9fa48("125904"), {
        partition_id: partitionId,
        table_id: tableId,
        table_name: tableName,
        partition_key_start: null,
        // NULL means unbounded lower
        partition_key_end: null,
        // NULL means unbounded upper
        partition_version: 1,
        replica_count: this.defaultReplicaCount,
        size_bytes: 0,
        leader_node_id: null,
        state: STATE.NORMAL,
        created_at: Date.now(),
        updated_at: Date.now()
      });

      // Write to system tables via CDC
      if (stryMutAct_9fa48("125906") ? false : stryMutAct_9fa48("125905") ? true : (stryCov_9fa48("125905", "125906"), this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("125907")) {
          {}
        } else {
          stryCov_9fa48("125907");
          const tableMetadataMutation = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("125908") ? {} : (stryCov_9fa48("125908"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: TABLES.TABLES,
            row: tableMetadata
          }), stryMutAct_9fa48("125909") ? {} : (stryCov_9fa48("125909"), {
            allowPendingVisibility: stryMutAct_9fa48("125910") ? false : (stryCov_9fa48("125910"), true),
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("125911") ? "" : (stryCov_9fa48("125911"), 'critical')
          }));
          const partitionMetadataMutation = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("125912") ? {} : (stryCov_9fa48("125912"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: TABLES.PARTITIONS,
            row: partitionMetadata
          }), stryMutAct_9fa48("125913") ? {} : (stryCov_9fa48("125913"), {
            allowPendingVisibility: stryMutAct_9fa48("125914") ? false : (stryCov_9fa48("125914"), true),
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("125915") ? "" : (stryCov_9fa48("125915"), 'critical')
          }));
          const metadataVisibilityState = (stryMutAct_9fa48("125916") ? [] : (stryCov_9fa48("125916"), [String(stryMutAct_9fa48("125919") ? tableMetadataMutation?.visibilityState && 'visible' : stryMutAct_9fa48("125918") ? false : stryMutAct_9fa48("125917") ? true : (stryCov_9fa48("125917", "125918", "125919"), (stryMutAct_9fa48("125920") ? tableMetadataMutation.visibilityState : (stryCov_9fa48("125920"), tableMetadataMutation?.visibilityState)) || (stryMutAct_9fa48("125921") ? "" : (stryCov_9fa48("125921"), 'visible')))), String(stryMutAct_9fa48("125924") ? partitionMetadataMutation?.visibilityState && 'visible' : stryMutAct_9fa48("125923") ? false : stryMutAct_9fa48("125922") ? true : (stryCov_9fa48("125922", "125923", "125924"), (stryMutAct_9fa48("125925") ? partitionMetadataMutation.visibilityState : (stryCov_9fa48("125925"), partitionMetadataMutation?.visibilityState)) || (stryMutAct_9fa48("125926") ? "" : (stryCov_9fa48("125926"), 'visible'))))])).includes(stryMutAct_9fa48("125927") ? "" : (stryCov_9fa48("125927"), 'deferred_by_pressure')) ? stryMutAct_9fa48("125928") ? "" : (stryCov_9fa48("125928"), 'deferred_by_pressure') : (stryMutAct_9fa48("125929") ? [] : (stryCov_9fa48("125929"), [String(stryMutAct_9fa48("125932") ? tableMetadataMutation?.visibilityState && 'visible' : stryMutAct_9fa48("125931") ? false : stryMutAct_9fa48("125930") ? true : (stryCov_9fa48("125930", "125931", "125932"), (stryMutAct_9fa48("125933") ? tableMetadataMutation.visibilityState : (stryCov_9fa48("125933"), tableMetadataMutation?.visibilityState)) || (stryMutAct_9fa48("125934") ? "" : (stryCov_9fa48("125934"), 'visible')))), String(stryMutAct_9fa48("125937") ? partitionMetadataMutation?.visibilityState && 'visible' : stryMutAct_9fa48("125936") ? false : stryMutAct_9fa48("125935") ? true : (stryCov_9fa48("125935", "125936", "125937"), (stryMutAct_9fa48("125938") ? partitionMetadataMutation.visibilityState : (stryCov_9fa48("125938"), partitionMetadataMutation?.visibilityState)) || (stryMutAct_9fa48("125939") ? "" : (stryCov_9fa48("125939"), 'visible'))))])).includes(stryMutAct_9fa48("125940") ? "" : (stryCov_9fa48("125940"), 'pending_visibility')) ? stryMutAct_9fa48("125941") ? "" : (stryCov_9fa48("125941"), 'pending_visibility') : stryMutAct_9fa48("125942") ? "" : (stryCov_9fa48("125942"), 'visible');
          const provisioningSummary = await this.provisionInitialPartition(stryMutAct_9fa48("125943") ? {} : (stryCov_9fa48("125943"), {
            tableId,
            tableName,
            tableMetadata,
            partitionId,
            partitionMetadata,
            replicaCount: partitionMetadata.replica_count
          }));
          await this.evaluateSplitMergeLifecycle();
          this.logger.info(QUERY_LOG_MSG.TABLE_CREATED_SUCCESS, stryMutAct_9fa48("125944") ? {} : (stryCov_9fa48("125944"), {
            tableId,
            tableName,
            partitionKey,
            partitionId
          }));
          const completion = resolveTableCreationCompletion(stryMutAct_9fa48("125945") ? {} : (stryCov_9fa48("125945"), {
            visibilityState: metadataVisibilityState,
            provisioningSummary
          }));
          return stryMutAct_9fa48("125946") ? {} : (stryCov_9fa48("125946"), {
            success: stryMutAct_9fa48("125947") ? false : (stryCov_9fa48("125947"), true),
            operation: QUERY_OPERATION.CREATE_TABLE,
            tableId,
            tableName,
            partitionKey,
            partitionId,
            columns: columns.length,
            completionState: completion.completionState,
            completionReason: completion.completionReason,
            visibilityState: metadataVisibilityState,
            visibilityPending: stryMutAct_9fa48("125950") ? metadataVisibilityState === TABLE_CREATION_SERVICE_LITERAL.VISIBLE : stryMutAct_9fa48("125949") ? false : stryMutAct_9fa48("125948") ? true : (stryCov_9fa48("125948", "125949", "125950"), metadataVisibilityState !== TABLE_CREATION_SERVICE_LITERAL.VISIBLE),
            provisioningSummary
          });
        }
      }
      const provisioningSummary = await this.provisionInitialPartition(stryMutAct_9fa48("125951") ? {} : (stryCov_9fa48("125951"), {
        tableId,
        tableName,
        tableMetadata,
        partitionId,
        partitionMetadata,
        replicaCount: partitionMetadata.replica_count
      }));
      await this.evaluateSplitMergeLifecycle();
      this.logger.info(QUERY_LOG_MSG.TABLE_CREATED_SUCCESS, stryMutAct_9fa48("125952") ? {} : (stryCov_9fa48("125952"), {
        tableId,
        tableName,
        partitionKey,
        partitionId
      }));
      const completion = resolveTableCreationCompletion(stryMutAct_9fa48("125953") ? {} : (stryCov_9fa48("125953"), {
        visibilityState: stryMutAct_9fa48("125954") ? "" : (stryCov_9fa48("125954"), 'visible'),
        provisioningSummary
      }));
      return stryMutAct_9fa48("125955") ? {} : (stryCov_9fa48("125955"), {
        success: stryMutAct_9fa48("125956") ? false : (stryCov_9fa48("125956"), true),
        operation: QUERY_OPERATION.CREATE_TABLE,
        tableId,
        tableName,
        partitionKey,
        partitionId,
        columns: columns.length,
        completionState: completion.completionState,
        completionReason: completion.completionReason,
        visibilityState: TABLE_CREATION_SERVICE_LITERAL.VISIBLE,
        visibilityPending: stryMutAct_9fa48("125957") ? true : (stryCov_9fa48("125957"), false),
        provisioningSummary
      });
    }
  }

  /**
   * Provision initial partition replica(s) for a newly-created table.
   * @param {Object} context - Provisioning context.
   * @param {string} context.tableId - Table ID.
   * @param {string} context.tableName - Table name.
   * @param {Object} [context.tableMetadata] - Canonical table row snapshot.
   * @param {string} context.partitionId - Initial partition ID.
   * @param {Object} [context.partitionMetadata] - Canonical partition row
   *   snapshot.
   * @param {number} context.replicaCount - Desired replica count.
   * @return {Promise<Object|null>}
   * @private
   */
  async provisionInitialPartition(context) {
    if (stryMutAct_9fa48("125958")) {
      {}
    } else {
      stryCov_9fa48("125958");
      const minimumRoutableReplicaCount = (stryMutAct_9fa48("125961") ? Number.isInteger(context?.minimumRoutableReplicaCount) || context.minimumRoutableReplicaCount > 0 : stryMutAct_9fa48("125960") ? false : stryMutAct_9fa48("125959") ? true : (stryCov_9fa48("125959", "125960", "125961"), Number.isInteger(stryMutAct_9fa48("125962") ? context.minimumRoutableReplicaCount : (stryCov_9fa48("125962"), context?.minimumRoutableReplicaCount)) && (stryMutAct_9fa48("125965") ? context.minimumRoutableReplicaCount <= 0 : stryMutAct_9fa48("125964") ? context.minimumRoutableReplicaCount >= 0 : stryMutAct_9fa48("125963") ? true : (stryCov_9fa48("125963", "125964", "125965"), context.minimumRoutableReplicaCount > 0)))) ? context.minimumRoutableReplicaCount : this.resolveDefaultMinimumRoutableReplicaCount(stryMutAct_9fa48("125966") ? context.replicaCount : (stryCov_9fa48("125966"), context?.replicaCount));
      if (stryMutAct_9fa48("125969") ? typeof this.partitionProvisioner === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("125968") ? false : stryMutAct_9fa48("125967") ? true : (stryCov_9fa48("125967", "125968", "125969"), typeof this.partitionProvisioner !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) {
        if (stryMutAct_9fa48("125970")) {
          {}
        } else {
          stryCov_9fa48("125970");
          return normalizeProvisioningSummary(null, stryMutAct_9fa48("125971") ? {} : (stryCov_9fa48("125971"), {
            ...context,
            minimumRoutableReplicaCount
          }));
        }
      }
      const {
        tableId,
        tableName,
        partitionId,
        replicaCount
      } = context;
      this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, stryMutAct_9fa48("125972") ? {} : (stryCov_9fa48("125972"), {
        tableId,
        tableName,
        partitionId,
        replicaCount
      }));
      try {
        if (stryMutAct_9fa48("125973")) {
          {}
        } else {
          stryCov_9fa48("125973");
          const provisioningResult = await this.partitionProvisioner(stryMutAct_9fa48("125974") ? {} : (stryCov_9fa48("125974"), {
            ...context,
            minimumRoutableReplicaCount
          }));
          this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_SUCCESS, stryMutAct_9fa48("125975") ? {} : (stryCov_9fa48("125975"), {
            tableId,
            tableName,
            partitionId,
            replicaCount
          }));
          return normalizeProvisioningSummary(provisioningResult, stryMutAct_9fa48("125976") ? {} : (stryCov_9fa48("125976"), {
            ...context,
            minimumRoutableReplicaCount
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("125977")) {
          {}
        } else {
          stryCov_9fa48("125977");
          this.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_FAILED, stryMutAct_9fa48("125978") ? {} : (stryCov_9fa48("125978"), {
            tableId,
            tableName,
            partitionId,
            replicaCount,
            error: error.message
          }));
          if (stryMutAct_9fa48("125981") ? false : stryMutAct_9fa48("125980") ? true : stryMutAct_9fa48("125979") ? error.code : (stryCov_9fa48("125979", "125980", "125981"), !error.code)) {
            if (stryMutAct_9fa48("125982")) {
              {}
            } else {
              stryCov_9fa48("125982");
              error.code = QUERY_ERROR_CODE.INTERNAL_ERROR;
            }
          }
          throw error;
        }
      }
    }
  }

  /**
   * Resolve the default minimum routable cohort for CREATE TABLE partition
   * provisioning. CREATE TABLE only needs a writable quorum before the
   * statement can return; remaining replicas may continue converging.
   * @param {number} replicaCount
   * @return {number|null}
   * @private
   */
  resolveDefaultMinimumRoutableReplicaCount(replicaCount) {
    if (stryMutAct_9fa48("125983")) {
      {}
    } else {
      stryCov_9fa48("125983");
      const normalizedReplicaCount = (stryMutAct_9fa48("125986") ? Number.isInteger(replicaCount) || replicaCount > 0 : stryMutAct_9fa48("125985") ? false : stryMutAct_9fa48("125984") ? true : (stryCov_9fa48("125984", "125985", "125986"), Number.isInteger(replicaCount) && (stryMutAct_9fa48("125989") ? replicaCount <= 0 : stryMutAct_9fa48("125988") ? replicaCount >= 0 : stryMutAct_9fa48("125987") ? true : (stryCov_9fa48("125987", "125988", "125989"), replicaCount > 0)))) ? replicaCount : null;
      if (stryMutAct_9fa48("125992") ? false : stryMutAct_9fa48("125991") ? true : stryMutAct_9fa48("125990") ? normalizedReplicaCount : (stryCov_9fa48("125990", "125991", "125992"), !normalizedReplicaCount)) {
        if (stryMutAct_9fa48("125993")) {
          {}
        } else {
          stryCov_9fa48("125993");
          return null;
        }
      }
      const minimumRoutableReplicaCount = (stryMutAct_9fa48("125996") ? typeof this.calculateQuorumReplicaCount !== 'function' : stryMutAct_9fa48("125995") ? false : stryMutAct_9fa48("125994") ? true : (stryCov_9fa48("125994", "125995", "125996"), typeof this.calculateQuorumReplicaCount === (stryMutAct_9fa48("125997") ? "" : (stryCov_9fa48("125997"), 'function')))) ? this.calculateQuorumReplicaCount(normalizedReplicaCount) : stryMutAct_9fa48("125998") ? Math.floor(normalizedReplicaCount / 2) - 1 : (stryCov_9fa48("125998"), Math.floor(stryMutAct_9fa48("125999") ? normalizedReplicaCount * 2 : (stryCov_9fa48("125999"), normalizedReplicaCount / 2)) + 1);
      return (stryMutAct_9fa48("126002") ? Number.isInteger(minimumRoutableReplicaCount) || minimumRoutableReplicaCount > NUM.ZERO : stryMutAct_9fa48("126001") ? false : stryMutAct_9fa48("126000") ? true : (stryCov_9fa48("126000", "126001", "126002"), Number.isInteger(minimumRoutableReplicaCount) && (stryMutAct_9fa48("126005") ? minimumRoutableReplicaCount <= NUM.ZERO : stryMutAct_9fa48("126004") ? minimumRoutableReplicaCount >= NUM.ZERO : stryMutAct_9fa48("126003") ? true : (stryCov_9fa48("126003", "126004", "126005"), minimumRoutableReplicaCount > NUM.ZERO)))) ? minimumRoutableReplicaCount : null;
    }
  }

  /**
   * Trigger policy-driven split/merge evaluation after table lifecycle changes.
   * @return {Promise<void>}
   * @private
   */
  async evaluateSplitMergeLifecycle() {
    if (stryMutAct_9fa48("126006")) {
      {}
    } else {
      stryCov_9fa48("126006");
      const manager = this.partitionSplitMergeManager;
      if (stryMutAct_9fa48("126009") ? !manager && typeof manager.evaluateAllPartitions !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126008") ? false : stryMutAct_9fa48("126007") ? true : (stryCov_9fa48("126007", "126008", "126009"), (stryMutAct_9fa48("126010") ? manager : (stryCov_9fa48("126010"), !manager)) || (stryMutAct_9fa48("126012") ? typeof manager.evaluateAllPartitions === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126011") ? false : (stryCov_9fa48("126011", "126012"), typeof manager.evaluateAllPartitions !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("126013")) {
          {}
        } else {
          stryCov_9fa48("126013");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("126014")) {
          {}
        } else {
          stryCov_9fa48("126014");
          await manager.evaluateAllPartitions();
        }
      } catch (error) {
        if (stryMutAct_9fa48("126015")) {
          {}
        } else {
          stryCov_9fa48("126015");
          this.logger.warn(QUERY_LOG_MSG.TABLE_SPLIT_MERGE_EVAL_FAILED, stryMutAct_9fa48("126016") ? {} : (stryCov_9fa48("126016"), {
            splitMergeEvaluationError: error.message
          }));
        }
      }
    }
  }

  /**
   * Start periodic split/merge evaluation when supported by the manager.
   * @private
   */
  startPeriodicSplitMergeEvaluation() {
    if (stryMutAct_9fa48("126017")) {
      {}
    } else {
      stryCov_9fa48("126017");
      const manager = this.partitionSplitMergeManager;
      if (stryMutAct_9fa48("126020") ? !manager && typeof manager.startPeriodicEvaluation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126019") ? false : stryMutAct_9fa48("126018") ? true : (stryCov_9fa48("126018", "126019", "126020"), (stryMutAct_9fa48("126021") ? manager : (stryCov_9fa48("126021"), !manager)) || (stryMutAct_9fa48("126023") ? typeof manager.startPeriodicEvaluation === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126022") ? false : (stryCov_9fa48("126022", "126023"), typeof manager.startPeriodicEvaluation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("126024")) {
          {}
        } else {
          stryCov_9fa48("126024");
          return;
        }
      }
      manager.startPeriodicEvaluation();
    }
  }

  /**
   * Stop periodic split/merge evaluation when supported by the manager.
   * @private
   */
  stopPeriodicSplitMergeEvaluation() {
    if (stryMutAct_9fa48("126025")) {
      {}
    } else {
      stryCov_9fa48("126025");
      const manager = this.partitionSplitMergeManager;
      if (stryMutAct_9fa48("126028") ? !manager && typeof manager.stopPeriodicEvaluation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126027") ? false : stryMutAct_9fa48("126026") ? true : (stryCov_9fa48("126026", "126027", "126028"), (stryMutAct_9fa48("126029") ? manager : (stryCov_9fa48("126029"), !manager)) || (stryMutAct_9fa48("126031") ? typeof manager.stopPeriodicEvaluation === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126030") ? false : (stryCov_9fa48("126030", "126031"), typeof manager.stopPeriodicEvaluation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("126032")) {
          {}
        } else {
          stryCov_9fa48("126032");
          return;
        }
      }
      manager.stopPeriodicEvaluation();
    }
  }

  /**
   * Shutdown lifecycle-owned resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("126033")) {
      {}
    } else {
      stryCov_9fa48("126033");
      this.detachCachePolicyListener();
      this.stopPeriodicSplitMergeEvaluation();
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("126034")) {
      {}
    } else {
      stryCov_9fa48("126034");
      return this.controlPlaneSystemTableGateway;
    }
  }
  buildInitialPartitionMetadataFromTableRecord(tableId, tableName, existingTableRecord = null) {
    if (stryMutAct_9fa48("126035")) {
      {}
    } else {
      stryCov_9fa48("126035");
      const partitionVersion = Number(stryMutAct_9fa48("126036") ? (existingTableRecord?.active_partition_version ?? existingTableRecord?.activePartitionVersion) && 1 : (stryCov_9fa48("126036"), (stryMutAct_9fa48("126037") ? existingTableRecord?.active_partition_version && existingTableRecord?.activePartitionVersion : (stryCov_9fa48("126037"), (stryMutAct_9fa48("126038") ? existingTableRecord.active_partition_version : (stryCov_9fa48("126038"), existingTableRecord?.active_partition_version)) ?? (stryMutAct_9fa48("126039") ? existingTableRecord.activePartitionVersion : (stryCov_9fa48("126039"), existingTableRecord?.activePartitionVersion)))) ?? 1));
      return stryMutAct_9fa48("126040") ? {} : (stryCov_9fa48("126040"), {
        partition_id: stryMutAct_9fa48("126041") ? `` : (stryCov_9fa48("126041"), `${tableId}-p1`),
        table_id: tableId,
        table_name: stryMutAct_9fa48("126044") ? (existingTableRecord?.table_name || existingTableRecord?.tableName) && tableName : stryMutAct_9fa48("126043") ? false : stryMutAct_9fa48("126042") ? true : (stryCov_9fa48("126042", "126043", "126044"), (stryMutAct_9fa48("126046") ? existingTableRecord?.table_name && existingTableRecord?.tableName : stryMutAct_9fa48("126045") ? false : (stryCov_9fa48("126045", "126046"), (stryMutAct_9fa48("126047") ? existingTableRecord.table_name : (stryCov_9fa48("126047"), existingTableRecord?.table_name)) || (stryMutAct_9fa48("126048") ? existingTableRecord.tableName : (stryCov_9fa48("126048"), existingTableRecord?.tableName)))) || tableName),
        partition_key_start: null,
        partition_key_end: null,
        partition_version: (stryMutAct_9fa48("126051") ? Number.isInteger(partitionVersion) || partitionVersion > NUM.ZERO : stryMutAct_9fa48("126050") ? false : stryMutAct_9fa48("126049") ? true : (stryCov_9fa48("126049", "126050", "126051"), Number.isInteger(partitionVersion) && (stryMutAct_9fa48("126054") ? partitionVersion <= NUM.ZERO : stryMutAct_9fa48("126053") ? partitionVersion >= NUM.ZERO : stryMutAct_9fa48("126052") ? true : (stryCov_9fa48("126052", "126053", "126054"), partitionVersion > NUM.ZERO)))) ? partitionVersion : NUM.ONE,
        replica_count: this.defaultReplicaCount,
        size_bytes: NUM.ZERO,
        leader_node_id: null,
        state: STATE.NORMAL,
        created_at: Date.now(),
        updated_at: Date.now()
      });
    }
  }

  /**
   * Derive partition key from PRIMARY KEY columns.
   * Requirement 20.1: Automatically use PRIMARY KEY as partition key.
   * @param {Array<string>} primaryKey - PRIMARY KEY column names.
   * @return {string} Partition key (comma-separated for composite keys).
   * @private
   */
  derivePartitionKey(primaryKey) {
    if (stryMutAct_9fa48("126055")) {
      {}
    } else {
      stryCov_9fa48("126055");
      if (stryMutAct_9fa48("126058") ? !primaryKey && primaryKey.length === NUM.ZERO : stryMutAct_9fa48("126057") ? false : stryMutAct_9fa48("126056") ? true : (stryCov_9fa48("126056", "126057", "126058"), (stryMutAct_9fa48("126059") ? primaryKey : (stryCov_9fa48("126059"), !primaryKey)) || (stryMutAct_9fa48("126061") ? primaryKey.length !== NUM.ZERO : stryMutAct_9fa48("126060") ? false : (stryCov_9fa48("126060", "126061"), primaryKey.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("126062")) {
          {}
        } else {
          stryCov_9fa48("126062");
          throw new Error(QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL);
        }
      }

      // For composite PRIMARY KEY, use all columns as partition key
      return primaryKey.join(TABLE_CREATION_SERVICE_LITERAL.EMPTY);
    }
  }

  /**
   * Build schema definition from column AST.
   * @param {Array<Object>} columns - Column definitions from AST.
   * @return {Object} Schema definition.
   * @private
   */
  buildSchemaDefinition(columns) {
    if (stryMutAct_9fa48("126063")) {
      {}
    } else {
      stryCov_9fa48("126063");
      return stryMutAct_9fa48("126064") ? {} : (stryCov_9fa48("126064"), {
        columns: columns.map(stryMutAct_9fa48("126065") ? () => undefined : (stryCov_9fa48("126065"), col => stryMutAct_9fa48("126066") ? {} : (stryCov_9fa48("126066"), {
          name: col.name,
          type: this.normalizeDataType(col.dataType),
          primaryKey: stryMutAct_9fa48("126069") ? col.primaryKey && false : stryMutAct_9fa48("126068") ? false : stryMutAct_9fa48("126067") ? true : (stryCov_9fa48("126067", "126068", "126069"), col.primaryKey || (stryMutAct_9fa48("126070") ? true : (stryCov_9fa48("126070"), false))),
          notNull: stryMutAct_9fa48("126073") ? col.notNull && false : stryMutAct_9fa48("126072") ? false : stryMutAct_9fa48("126071") ? true : (stryCov_9fa48("126071", "126072", "126073"), col.notNull || (stryMutAct_9fa48("126074") ? true : (stryCov_9fa48("126074"), false))),
          unique: stryMutAct_9fa48("126077") ? col.unique && false : stryMutAct_9fa48("126076") ? false : stryMutAct_9fa48("126075") ? true : (stryCov_9fa48("126075", "126076", "126077"), col.unique || (stryMutAct_9fa48("126078") ? true : (stryCov_9fa48("126078"), false))),
          defaultValue: stryMutAct_9fa48("126079") ? col.defaultValue.value : (stryCov_9fa48("126079"), col.defaultValue?.value)
        })))
      });
    }
  }

  /**
   * Normalize data type to SQLite-compatible type.
   * @param {Object} dataType - Data type AST.
   * @return {string} Normalized type name.
   * @private
   */
  normalizeDataType(dataType) {
    if (stryMutAct_9fa48("126080")) {
      {}
    } else {
      stryCov_9fa48("126080");
      const typeName = stryMutAct_9fa48("126081") ? dataType.name.toLowerCase() : (stryCov_9fa48("126081"), dataType.name.toUpperCase());

      // Map common SQL types to SQLite types
      const typeMap = stryMutAct_9fa48("126082") ? {} : (stryCov_9fa48("126082"), {
        'INT': stryMutAct_9fa48("126083") ? "" : (stryCov_9fa48("126083"), 'INTEGER'),
        'BIGINT': stryMutAct_9fa48("126084") ? "" : (stryCov_9fa48("126084"), 'INTEGER'),
        'SMALLINT': stryMutAct_9fa48("126085") ? "" : (stryCov_9fa48("126085"), 'INTEGER'),
        'TINYINT': stryMutAct_9fa48("126086") ? "" : (stryCov_9fa48("126086"), 'INTEGER'),
        'VARCHAR': stryMutAct_9fa48("126087") ? "" : (stryCov_9fa48("126087"), 'TEXT'),
        'CHAR': stryMutAct_9fa48("126088") ? "" : (stryCov_9fa48("126088"), 'TEXT'),
        'NVARCHAR': stryMutAct_9fa48("126089") ? "" : (stryCov_9fa48("126089"), 'TEXT'),
        'NCHAR': stryMutAct_9fa48("126090") ? "" : (stryCov_9fa48("126090"), 'TEXT'),
        'CLOB': stryMutAct_9fa48("126091") ? "" : (stryCov_9fa48("126091"), 'TEXT'),
        'FLOAT': stryMutAct_9fa48("126092") ? "" : (stryCov_9fa48("126092"), 'REAL'),
        'DOUBLE': stryMutAct_9fa48("126093") ? "" : (stryCov_9fa48("126093"), 'REAL'),
        'DECIMAL': stryMutAct_9fa48("126094") ? "" : (stryCov_9fa48("126094"), 'REAL'),
        'NUMERIC': stryMutAct_9fa48("126095") ? "" : (stryCov_9fa48("126095"), 'REAL'),
        'BOOLEAN': stryMutAct_9fa48("126096") ? "" : (stryCov_9fa48("126096"), 'INTEGER'),
        'BOOL': stryMutAct_9fa48("126097") ? "" : (stryCov_9fa48("126097"), 'INTEGER'),
        'DATETIME': stryMutAct_9fa48("126098") ? "" : (stryCov_9fa48("126098"), 'TEXT'),
        'TIMESTAMP': stryMutAct_9fa48("126099") ? "" : (stryCov_9fa48("126099"), 'TEXT'),
        'DATE': stryMutAct_9fa48("126100") ? "" : (stryCov_9fa48("126100"), 'TEXT'),
        'TIME': stryMutAct_9fa48("126101") ? "" : (stryCov_9fa48("126101"), 'TEXT')
      });
      return stryMutAct_9fa48("126104") ? typeMap[typeName] && typeName : stryMutAct_9fa48("126103") ? false : stryMutAct_9fa48("126102") ? true : (stryCov_9fa48("126102", "126103", "126104"), typeMap[typeName] || typeName);
    }
  }

  /**
   * Check if a table exists.
   * @param {string} tableName - Table name.
   * @return {boolean} True if table exists.
   * @private
   */
  tableExists(tableName) {
    if (stryMutAct_9fa48("126105")) {
      {}
    } else {
      stryCov_9fa48("126105");
      return stryMutAct_9fa48("126108") ? this.getTableRecord(tableName) === null : stryMutAct_9fa48("126107") ? false : stryMutAct_9fa48("126106") ? true : (stryCov_9fa48("126106", "126107", "126108"), this.getTableRecord(tableName) !== null);
    }
  }

  /**
   * Resolve one table metadata row, preferring cache and falling back to an
   * authoritative control-plane read when cache visibility lags.
   * @param {string} tableName
   * @return {Promise<Object|null>}
   * @private
   */
  async findExistingTableRecord(tableName) {
    if (stryMutAct_9fa48("126109")) {
      {}
    } else {
      stryCov_9fa48("126109");
      const cachedTable = this.getTableRecord(tableName);
      if (stryMutAct_9fa48("126111") ? false : stryMutAct_9fa48("126110") ? true : (stryCov_9fa48("126110", "126111"), cachedTable)) {
        if (stryMutAct_9fa48("126112")) {
          {}
        } else {
          stryCov_9fa48("126112");
          return cachedTable;
        }
      }
      const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("126115") ? !controlPlaneGateway && typeof controlPlaneGateway.readRows !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126114") ? false : stryMutAct_9fa48("126113") ? true : (stryCov_9fa48("126113", "126114", "126115"), (stryMutAct_9fa48("126116") ? controlPlaneGateway : (stryCov_9fa48("126116"), !controlPlaneGateway)) || (stryMutAct_9fa48("126118") ? typeof controlPlaneGateway.readRows === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126117") ? false : (stryCov_9fa48("126117", "126118"), typeof controlPlaneGateway.readRows !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("126119")) {
          {}
        } else {
          stryCov_9fa48("126119");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("126120")) {
          {}
        } else {
          stryCov_9fa48("126120");
          const result = await controlPlaneGateway.readRows(TABLES.TABLES, TABLE_CREATION_SQL.SELECT_TABLE_BY_NAME, stryMutAct_9fa48("126121") ? [] : (stryCov_9fa48("126121"), [tableName]), stryMutAct_9fa48("126122") ? {} : (stryCov_9fa48("126122"), {
            readProfile: stryMutAct_9fa48("126123") ? "" : (stryCov_9fa48("126123"), 'table_lifecycle')
          }));
          return (stryMutAct_9fa48("126126") ? Array.isArray(result?.rows) || result.rows.length > NUM.ZERO : stryMutAct_9fa48("126125") ? false : stryMutAct_9fa48("126124") ? true : (stryCov_9fa48("126124", "126125", "126126"), Array.isArray(stryMutAct_9fa48("126127") ? result.rows : (stryCov_9fa48("126127"), result?.rows)) && (stryMutAct_9fa48("126130") ? result.rows.length <= NUM.ZERO : stryMutAct_9fa48("126129") ? result.rows.length >= NUM.ZERO : stryMutAct_9fa48("126128") ? true : (stryCov_9fa48("126128", "126129", "126130"), result.rows.length > NUM.ZERO)))) ? result.rows[NUM.ZERO] : null;
        }
      } catch {
        if (stryMutAct_9fa48("126131")) {
          {}
        } else {
          stryCov_9fa48("126131");
          return null;
        }
      }
    }
  }

  /**
   * Resolve one partition metadata row, preferring cache and falling back to
   * an authoritative control-plane read when cache visibility lags.
   * @param {string} partitionId
   * @return {Promise<Object|null>}
   * @private
   */
  async findExistingPartitionRecord(partitionId) {
    if (stryMutAct_9fa48("126132")) {
      {}
    } else {
      stryCov_9fa48("126132");
      const cachedPartition = this.getPartitionRecord(partitionId);
      if (stryMutAct_9fa48("126134") ? false : stryMutAct_9fa48("126133") ? true : (stryCov_9fa48("126133", "126134"), cachedPartition)) {
        if (stryMutAct_9fa48("126135")) {
          {}
        } else {
          stryCov_9fa48("126135");
          return cachedPartition;
        }
      }
      const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("126138") ? !controlPlaneGateway && typeof controlPlaneGateway.readRows !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126137") ? false : stryMutAct_9fa48("126136") ? true : (stryCov_9fa48("126136", "126137", "126138"), (stryMutAct_9fa48("126139") ? controlPlaneGateway : (stryCov_9fa48("126139"), !controlPlaneGateway)) || (stryMutAct_9fa48("126141") ? typeof controlPlaneGateway.readRows === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126140") ? false : (stryCov_9fa48("126140", "126141"), typeof controlPlaneGateway.readRows !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("126142")) {
          {}
        } else {
          stryCov_9fa48("126142");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("126143")) {
          {}
        } else {
          stryCov_9fa48("126143");
          const result = await controlPlaneGateway.readRows(TABLES.PARTITIONS, TABLE_CREATION_SQL.SELECT_PARTITION_BY_ID, stryMutAct_9fa48("126144") ? [] : (stryCov_9fa48("126144"), [partitionId]), stryMutAct_9fa48("126145") ? {} : (stryCov_9fa48("126145"), {
            readProfile: stryMutAct_9fa48("126146") ? "" : (stryCov_9fa48("126146"), 'table_lifecycle')
          }));
          return (stryMutAct_9fa48("126149") ? Array.isArray(result?.rows) || result.rows.length > NUM.ZERO : stryMutAct_9fa48("126148") ? false : stryMutAct_9fa48("126147") ? true : (stryCov_9fa48("126147", "126148", "126149"), Array.isArray(stryMutAct_9fa48("126150") ? result.rows : (stryCov_9fa48("126150"), result?.rows)) && (stryMutAct_9fa48("126153") ? result.rows.length <= NUM.ZERO : stryMutAct_9fa48("126152") ? result.rows.length >= NUM.ZERO : stryMutAct_9fa48("126151") ? true : (stryCov_9fa48("126151", "126152", "126153"), result.rows.length > NUM.ZERO)))) ? result.rows[NUM.ZERO] : null;
        }
      } catch {
        if (stryMutAct_9fa48("126154")) {
          {}
        } else {
          stryCov_9fa48("126154");
          return null;
        }
      }
    }
  }

  /**
   * Re-run initial partition provisioning for existing CREATE TABLE IF NOT EXISTS
   * retries when metadata was created before provisioning finished.
   * @param {string} tableName
   * @return {Promise<void>}
   * @private
   */
  async reconcileExistingInitialPartition(tableName, existingTable = null) {
    if (stryMutAct_9fa48("126155")) {
      {}
    } else {
      stryCov_9fa48("126155");
      const existingTableRecord = stryMutAct_9fa48("126158") ? existingTable && (await this.findExistingTableRecord(tableName)) : stryMutAct_9fa48("126157") ? false : stryMutAct_9fa48("126156") ? true : (stryCov_9fa48("126156", "126157", "126158"), existingTable || (await this.findExistingTableRecord(tableName)));
      if (stryMutAct_9fa48("126161") ? false : stryMutAct_9fa48("126160") ? true : stryMutAct_9fa48("126159") ? existingTableRecord : (stryCov_9fa48("126159", "126160", "126161"), !existingTableRecord)) {
        if (stryMutAct_9fa48("126162")) {
          {}
        } else {
          stryCov_9fa48("126162");
          return stryMutAct_9fa48("126163") ? {} : (stryCov_9fa48("126163"), {
            partitionMetadataCreated: stryMutAct_9fa48("126164") ? true : (stryCov_9fa48("126164"), false)
          });
        }
      }
      const tableId = stryMutAct_9fa48("126167") ? (existingTableRecord.table_id || existingTableRecord.tableId) && null : stryMutAct_9fa48("126166") ? false : stryMutAct_9fa48("126165") ? true : (stryCov_9fa48("126165", "126166", "126167"), (stryMutAct_9fa48("126169") ? existingTableRecord.table_id && existingTableRecord.tableId : stryMutAct_9fa48("126168") ? false : (stryCov_9fa48("126168", "126169"), existingTableRecord.table_id || existingTableRecord.tableId)) || null);
      if (stryMutAct_9fa48("126172") ? false : stryMutAct_9fa48("126171") ? true : stryMutAct_9fa48("126170") ? tableId : (stryCov_9fa48("126170", "126171", "126172"), !tableId)) {
        if (stryMutAct_9fa48("126173")) {
          {}
        } else {
          stryCov_9fa48("126173");
          return stryMutAct_9fa48("126174") ? {} : (stryCov_9fa48("126174"), {
            partitionMetadataCreated: stryMutAct_9fa48("126175") ? true : (stryCov_9fa48("126175"), false)
          });
        }
      }
      const partitionId = stryMutAct_9fa48("126176") ? `` : (stryCov_9fa48("126176"), `${tableId}-p1`);
      let existingPartition = await this.findExistingPartitionRecord(partitionId);
      let partitionMetadataCreated = stryMutAct_9fa48("126177") ? true : (stryCov_9fa48("126177"), false);
      let visibilityState = TABLE_CREATION_SERVICE_LITERAL.VISIBLE;
      if (stryMutAct_9fa48("126180") ? false : stryMutAct_9fa48("126179") ? true : stryMutAct_9fa48("126178") ? existingPartition : (stryCov_9fa48("126178", "126179", "126180"), !existingPartition)) {
        if (stryMutAct_9fa48("126181")) {
          {}
        } else {
          stryCov_9fa48("126181");
          const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
          if (stryMutAct_9fa48("126184") ? !controlPlaneGateway && typeof controlPlaneGateway.submitMutation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126183") ? false : stryMutAct_9fa48("126182") ? true : (stryCov_9fa48("126182", "126183", "126184"), (stryMutAct_9fa48("126185") ? controlPlaneGateway : (stryCov_9fa48("126185"), !controlPlaneGateway)) || (stryMutAct_9fa48("126187") ? typeof controlPlaneGateway.submitMutation === TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126186") ? false : (stryCov_9fa48("126186", "126187"), typeof controlPlaneGateway.submitMutation !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION)))) {
            if (stryMutAct_9fa48("126188")) {
              {}
            } else {
              stryCov_9fa48("126188");
              throw new Error(stryMutAct_9fa48("126189") ? TABLE_CREATION_SERVICE_LITERAL.UNABLE_TO_RESTORE_MISSING_INITIAL_PARTITION_METADATA_FOR_TABLE - String(tableName || tableId) : (stryCov_9fa48("126189"), TABLE_CREATION_SERVICE_LITERAL.UNABLE_TO_RESTORE_MISSING_INITIAL_PARTITION_METADATA_FOR_TABLE + String(stryMutAct_9fa48("126192") ? tableName && tableId : stryMutAct_9fa48("126191") ? false : stryMutAct_9fa48("126190") ? true : (stryCov_9fa48("126190", "126191", "126192"), tableName || tableId))));
            }
          }
          existingPartition = this.buildInitialPartitionMetadataFromTableRecord(tableId, tableName, existingTableRecord);
          const partitionMutation = await controlPlaneGateway.submitMutation(stryMutAct_9fa48("126193") ? {} : (stryCov_9fa48("126193"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: TABLES.PARTITIONS,
            row: existingPartition
          }), stryMutAct_9fa48("126194") ? {} : (stryCov_9fa48("126194"), {
            allowPendingVisibility: stryMutAct_9fa48("126195") ? false : (stryCov_9fa48("126195"), true),
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("126196") ? "" : (stryCov_9fa48("126196"), 'critical')
          }));
          partitionMetadataCreated = stryMutAct_9fa48("126197") ? false : (stryCov_9fa48("126197"), true);
          visibilityState = String(stryMutAct_9fa48("126200") ? partitionMutation?.visibilityState && TABLE_CREATION_SERVICE_LITERAL.VISIBLE : stryMutAct_9fa48("126199") ? false : stryMutAct_9fa48("126198") ? true : (stryCov_9fa48("126198", "126199", "126200"), (stryMutAct_9fa48("126201") ? partitionMutation.visibilityState : (stryCov_9fa48("126201"), partitionMutation?.visibilityState)) || TABLE_CREATION_SERVICE_LITERAL.VISIBLE));
        }
      }
      const replicaCount = Number(stryMutAct_9fa48("126202") ? existingPartition.replica_count && existingPartition.replicaCount : (stryCov_9fa48("126202"), existingPartition.replica_count ?? existingPartition.replicaCount));
      const provisioningSummary = await this.provisionInitialPartition(stryMutAct_9fa48("126203") ? {} : (stryCov_9fa48("126203"), {
        tableId,
        tableName,
        tableMetadata: existingTableRecord,
        partitionId,
        partitionMetadata: existingPartition,
        replicaCount: (stryMutAct_9fa48("126206") ? Number.isInteger(replicaCount) || replicaCount > 0 : stryMutAct_9fa48("126205") ? false : stryMutAct_9fa48("126204") ? true : (stryCov_9fa48("126204", "126205", "126206"), Number.isInteger(replicaCount) && (stryMutAct_9fa48("126209") ? replicaCount <= 0 : stryMutAct_9fa48("126208") ? replicaCount >= 0 : stryMutAct_9fa48("126207") ? true : (stryCov_9fa48("126207", "126208", "126209"), replicaCount > 0)))) ? replicaCount : this.defaultReplicaCount
      }));
      const completion = resolveTableCreationCompletion(stryMutAct_9fa48("126210") ? {} : (stryCov_9fa48("126210"), {
        visibilityState,
        provisioningSummary
      }));
      return stryMutAct_9fa48("126211") ? {} : (stryCov_9fa48("126211"), {
        partitionMetadataCreated,
        visibilityState,
        completionState: completion.completionState,
        completionReason: completion.completionReason,
        provisioningSummary
      });
    }
  }

  /**
   * Resolve one table metadata row from cache.
   * @param {string} tableName
   * @return {Object|null}
   * @private
   */
  getTableRecord(tableName) {
    if (stryMutAct_9fa48("126212")) {
      {}
    } else {
      stryCov_9fa48("126212");
      if (stryMutAct_9fa48("126215") ? false : stryMutAct_9fa48("126214") ? true : stryMutAct_9fa48("126213") ? this.systemCache : (stryCov_9fa48("126213", "126214", "126215"), !this.systemCache)) {
        if (stryMutAct_9fa48("126216")) {
          {}
        } else {
          stryCov_9fa48("126216");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("126217")) {
          {}
        } else {
          stryCov_9fa48("126217");
          if (stryMutAct_9fa48("126220") ? typeof this.systemCache.find !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126219") ? false : stryMutAct_9fa48("126218") ? true : (stryCov_9fa48("126218", "126219", "126220"), typeof this.systemCache.find === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) {
            if (stryMutAct_9fa48("126221")) {
              {}
            } else {
              stryCov_9fa48("126221");
              return stryMutAct_9fa48("126224") ? this.systemCache.find(TABLES.TABLES, table => table?.table_name === tableName || table?.tableName === tableName) && null : stryMutAct_9fa48("126223") ? false : stryMutAct_9fa48("126222") ? true : (stryCov_9fa48("126222", "126223", "126224"), this.systemCache.find(TABLES.TABLES, stryMutAct_9fa48("126225") ? () => undefined : (stryCov_9fa48("126225"), table => stryMutAct_9fa48("126228") ? table?.table_name === tableName && table?.tableName === tableName : stryMutAct_9fa48("126227") ? false : stryMutAct_9fa48("126226") ? true : (stryCov_9fa48("126226", "126227", "126228"), (stryMutAct_9fa48("126230") ? table?.table_name !== tableName : stryMutAct_9fa48("126229") ? false : (stryCov_9fa48("126229", "126230"), (stryMutAct_9fa48("126231") ? table.table_name : (stryCov_9fa48("126231"), table?.table_name)) === tableName)) || (stryMutAct_9fa48("126233") ? table?.tableName !== tableName : stryMutAct_9fa48("126232") ? false : (stryCov_9fa48("126232", "126233"), (stryMutAct_9fa48("126234") ? table.tableName : (stryCov_9fa48("126234"), table?.tableName)) === tableName))))) || null);
            }
          }
          if (stryMutAct_9fa48("126237") ? typeof this.systemCache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126236") ? false : stryMutAct_9fa48("126235") ? true : (stryCov_9fa48("126235", "126236", "126237"), typeof this.systemCache.getAll === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) {
            if (stryMutAct_9fa48("126238")) {
              {}
            } else {
              stryCov_9fa48("126238");
              const tables = stryMutAct_9fa48("126241") ? this.systemCache.getAll(TABLES.TABLES) && [] : stryMutAct_9fa48("126240") ? false : stryMutAct_9fa48("126239") ? true : (stryCov_9fa48("126239", "126240", "126241"), this.systemCache.getAll(TABLES.TABLES) || (stryMutAct_9fa48("126242") ? ["Stryker was here"] : (stryCov_9fa48("126242"), [])));
              return stryMutAct_9fa48("126245") ? tables.find(table => table?.table_name === tableName || table?.tableName === tableName) && null : stryMutAct_9fa48("126244") ? false : stryMutAct_9fa48("126243") ? true : (stryCov_9fa48("126243", "126244", "126245"), tables.find(stryMutAct_9fa48("126246") ? () => undefined : (stryCov_9fa48("126246"), table => stryMutAct_9fa48("126249") ? table?.table_name === tableName && table?.tableName === tableName : stryMutAct_9fa48("126248") ? false : stryMutAct_9fa48("126247") ? true : (stryCov_9fa48("126247", "126248", "126249"), (stryMutAct_9fa48("126251") ? table?.table_name !== tableName : stryMutAct_9fa48("126250") ? false : (stryCov_9fa48("126250", "126251"), (stryMutAct_9fa48("126252") ? table.table_name : (stryCov_9fa48("126252"), table?.table_name)) === tableName)) || (stryMutAct_9fa48("126254") ? table?.tableName !== tableName : stryMutAct_9fa48("126253") ? false : (stryCov_9fa48("126253", "126254"), (stryMutAct_9fa48("126255") ? table.tableName : (stryCov_9fa48("126255"), table?.tableName)) === tableName))))) || null);
            }
          }
        }
      } catch {
        if (stryMutAct_9fa48("126256")) {
          {}
        } else {
          stryCov_9fa48("126256");
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Resolve one partition metadata row from cache.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getPartitionRecord(partitionId) {
    if (stryMutAct_9fa48("126257")) {
      {}
    } else {
      stryCov_9fa48("126257");
      if (stryMutAct_9fa48("126260") ? !this.systemCache && !partitionId : stryMutAct_9fa48("126259") ? false : stryMutAct_9fa48("126258") ? true : (stryCov_9fa48("126258", "126259", "126260"), (stryMutAct_9fa48("126261") ? this.systemCache : (stryCov_9fa48("126261"), !this.systemCache)) || (stryMutAct_9fa48("126262") ? partitionId : (stryCov_9fa48("126262"), !partitionId)))) {
        if (stryMutAct_9fa48("126263")) {
          {}
        } else {
          stryCov_9fa48("126263");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("126264")) {
          {}
        } else {
          stryCov_9fa48("126264");
          if (stryMutAct_9fa48("126267") ? typeof this.systemCache.find !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126266") ? false : stryMutAct_9fa48("126265") ? true : (stryCov_9fa48("126265", "126266", "126267"), typeof this.systemCache.find === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) {
            if (stryMutAct_9fa48("126268")) {
              {}
            } else {
              stryCov_9fa48("126268");
              return stryMutAct_9fa48("126271") ? this.systemCache.find(TABLES.PARTITIONS, partition => partition?.partition_id === partitionId || partition?.partitionId === partitionId) && null : stryMutAct_9fa48("126270") ? false : stryMutAct_9fa48("126269") ? true : (stryCov_9fa48("126269", "126270", "126271"), this.systemCache.find(TABLES.PARTITIONS, stryMutAct_9fa48("126272") ? () => undefined : (stryCov_9fa48("126272"), partition => stryMutAct_9fa48("126275") ? partition?.partition_id === partitionId && partition?.partitionId === partitionId : stryMutAct_9fa48("126274") ? false : stryMutAct_9fa48("126273") ? true : (stryCov_9fa48("126273", "126274", "126275"), (stryMutAct_9fa48("126277") ? partition?.partition_id !== partitionId : stryMutAct_9fa48("126276") ? false : (stryCov_9fa48("126276", "126277"), (stryMutAct_9fa48("126278") ? partition.partition_id : (stryCov_9fa48("126278"), partition?.partition_id)) === partitionId)) || (stryMutAct_9fa48("126280") ? partition?.partitionId !== partitionId : stryMutAct_9fa48("126279") ? false : (stryCov_9fa48("126279", "126280"), (stryMutAct_9fa48("126281") ? partition.partitionId : (stryCov_9fa48("126281"), partition?.partitionId)) === partitionId))))) || null);
            }
          }
          if (stryMutAct_9fa48("126284") ? typeof this.systemCache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126283") ? false : stryMutAct_9fa48("126282") ? true : (stryCov_9fa48("126282", "126283", "126284"), typeof this.systemCache.getAll === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) {
            if (stryMutAct_9fa48("126285")) {
              {}
            } else {
              stryCov_9fa48("126285");
              const partitions = stryMutAct_9fa48("126288") ? this.systemCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("126287") ? false : stryMutAct_9fa48("126286") ? true : (stryCov_9fa48("126286", "126287", "126288"), this.systemCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("126289") ? ["Stryker was here"] : (stryCov_9fa48("126289"), [])));
              return stryMutAct_9fa48("126292") ? partitions.find(partition => partition?.partition_id === partitionId || partition?.partitionId === partitionId) && null : stryMutAct_9fa48("126291") ? false : stryMutAct_9fa48("126290") ? true : (stryCov_9fa48("126290", "126291", "126292"), partitions.find(stryMutAct_9fa48("126293") ? () => undefined : (stryCov_9fa48("126293"), partition => stryMutAct_9fa48("126296") ? partition?.partition_id === partitionId && partition?.partitionId === partitionId : stryMutAct_9fa48("126295") ? false : stryMutAct_9fa48("126294") ? true : (stryCov_9fa48("126294", "126295", "126296"), (stryMutAct_9fa48("126298") ? partition?.partition_id !== partitionId : stryMutAct_9fa48("126297") ? false : (stryCov_9fa48("126297", "126298"), (stryMutAct_9fa48("126299") ? partition.partition_id : (stryCov_9fa48("126299"), partition?.partition_id)) === partitionId)) || (stryMutAct_9fa48("126301") ? partition?.partitionId !== partitionId : stryMutAct_9fa48("126300") ? false : (stryCov_9fa48("126300", "126301"), (stryMutAct_9fa48("126302") ? partition.partitionId : (stryCov_9fa48("126302"), partition?.partitionId)) === partitionId))))) || null);
            }
          }
        }
      } catch {
        if (stryMutAct_9fa48("126303")) {
          {}
        } else {
          stryCov_9fa48("126303");
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Validate that a table has a PRIMARY KEY.
   * Requirement 20.2: Require PRIMARY KEY for user tables.
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @return {Object} Validation result.
   */
  validatePrimaryKey(ast) {
    if (stryMutAct_9fa48("126304")) {
      {}
    } else {
      stryCov_9fa48("126304");
      const {
        tableName,
        columns,
        primaryKey
      } = ast;

      // Check for table-level PRIMARY KEY constraint
      if (stryMutAct_9fa48("126307") ? primaryKey || primaryKey.length > NUM.ZERO : stryMutAct_9fa48("126306") ? false : stryMutAct_9fa48("126305") ? true : (stryCov_9fa48("126305", "126306", "126307"), primaryKey && (stryMutAct_9fa48("126310") ? primaryKey.length <= NUM.ZERO : stryMutAct_9fa48("126309") ? primaryKey.length >= NUM.ZERO : stryMutAct_9fa48("126308") ? true : (stryCov_9fa48("126308", "126309", "126310"), primaryKey.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("126311")) {
          {}
        } else {
          stryCov_9fa48("126311");
          return stryMutAct_9fa48("126312") ? {} : (stryCov_9fa48("126312"), {
            valid: stryMutAct_9fa48("126313") ? false : (stryCov_9fa48("126313"), true),
            primaryKey,
            source: TABLE_CREATION_SERVICE_LITERAL.TABLE_CONSTRAINT
          });
        }
      }

      // Check for column-level PRIMARY KEY
      const pkColumns = stryMutAct_9fa48("126314") ? columns : (stryCov_9fa48("126314"), columns.filter(stryMutAct_9fa48("126315") ? () => undefined : (stryCov_9fa48("126315"), col => col.primaryKey)));
      if (stryMutAct_9fa48("126319") ? pkColumns.length <= NUM.ZERO : stryMutAct_9fa48("126318") ? pkColumns.length >= NUM.ZERO : stryMutAct_9fa48("126317") ? false : stryMutAct_9fa48("126316") ? true : (stryCov_9fa48("126316", "126317", "126318", "126319"), pkColumns.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("126320")) {
          {}
        } else {
          stryCov_9fa48("126320");
          return stryMutAct_9fa48("126321") ? {} : (stryCov_9fa48("126321"), {
            valid: stryMutAct_9fa48("126322") ? false : (stryCov_9fa48("126322"), true),
            primaryKey: pkColumns.map(stryMutAct_9fa48("126323") ? () => undefined : (stryCov_9fa48("126323"), col => col.name)),
            source: TABLE_CREATION_SERVICE_LITERAL.COLUMN_CONSTRAINT
          });
        }
      }
      return stryMutAct_9fa48("126324") ? {} : (stryCov_9fa48("126324"), {
        valid: stryMutAct_9fa48("126325") ? true : (stryCov_9fa48("126325"), false),
        error: (stryMutAct_9fa48("126326") ? `` : (stryCov_9fa48("126326"), `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}`)) + QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX,
        code: QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED
      });
    }
  }

  /**
   * Get partition key for a table.
   * @param {string} tableName - Table name.
   * @return {string|null} Partition key or null.
   */
  getPartitionKey(tableName) {
    if (stryMutAct_9fa48("126327")) {
      {}
    } else {
      stryCov_9fa48("126327");
      if (stryMutAct_9fa48("126330") ? false : stryMutAct_9fa48("126329") ? true : stryMutAct_9fa48("126328") ? this.systemCache : (stryCov_9fa48("126328", "126329", "126330"), !this.systemCache)) {
        if (stryMutAct_9fa48("126331")) {
          {}
        } else {
          stryCov_9fa48("126331");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("126332")) {
          {}
        } else {
          stryCov_9fa48("126332");
          if (stryMutAct_9fa48("126335") ? typeof this.systemCache.find !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126334") ? false : stryMutAct_9fa48("126333") ? true : (stryCov_9fa48("126333", "126334", "126335"), typeof this.systemCache.find === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) {
            if (stryMutAct_9fa48("126336")) {
              {}
            } else {
              stryCov_9fa48("126336");
              const table = this.systemCache.find(TABLES.TABLES, stryMutAct_9fa48("126337") ? () => undefined : (stryCov_9fa48("126337"), t => stryMutAct_9fa48("126340") ? t.table_name === tableName && t.tableName === tableName : stryMutAct_9fa48("126339") ? false : stryMutAct_9fa48("126338") ? true : (stryCov_9fa48("126338", "126339", "126340"), (stryMutAct_9fa48("126342") ? t.table_name !== tableName : stryMutAct_9fa48("126341") ? false : (stryCov_9fa48("126341", "126342"), t.table_name === tableName)) || (stryMutAct_9fa48("126344") ? t.tableName !== tableName : stryMutAct_9fa48("126343") ? false : (stryCov_9fa48("126343", "126344"), t.tableName === tableName)))));
              return stryMutAct_9fa48("126347") ? (table?.partition_key || table?.partitionKey) && null : stryMutAct_9fa48("126346") ? false : stryMutAct_9fa48("126345") ? true : (stryCov_9fa48("126345", "126346", "126347"), (stryMutAct_9fa48("126349") ? table?.partition_key && table?.partitionKey : stryMutAct_9fa48("126348") ? false : (stryCov_9fa48("126348", "126349"), (stryMutAct_9fa48("126350") ? table.partition_key : (stryCov_9fa48("126350"), table?.partition_key)) || (stryMutAct_9fa48("126351") ? table.partitionKey : (stryCov_9fa48("126351"), table?.partitionKey)))) || null);
            }
          }
        }
      } catch {
        // Cache not available
      }
      return null;
    }
  }

  /**
   * Get table schema.
   * @param {string} tableName - Table name.
   * @return {Object|null} Schema definition or null.
   */
  getTableSchema(tableName) {
    if (stryMutAct_9fa48("126352")) {
      {}
    } else {
      stryCov_9fa48("126352");
      if (stryMutAct_9fa48("126355") ? false : stryMutAct_9fa48("126354") ? true : stryMutAct_9fa48("126353") ? this.systemCache : (stryCov_9fa48("126353", "126354", "126355"), !this.systemCache)) {
        if (stryMutAct_9fa48("126356")) {
          {}
        } else {
          stryCov_9fa48("126356");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("126357")) {
          {}
        } else {
          stryCov_9fa48("126357");
          if (stryMutAct_9fa48("126360") ? typeof this.systemCache.find !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION : stryMutAct_9fa48("126359") ? false : stryMutAct_9fa48("126358") ? true : (stryCov_9fa48("126358", "126359", "126360"), typeof this.systemCache.find === TABLE_CREATION_SERVICE_LITERAL.FUNCTION)) {
            if (stryMutAct_9fa48("126361")) {
              {}
            } else {
              stryCov_9fa48("126361");
              const table = this.systemCache.find(TABLES.TABLES, stryMutAct_9fa48("126362") ? () => undefined : (stryCov_9fa48("126362"), t => stryMutAct_9fa48("126365") ? t.table_name === tableName && t.tableName === tableName : stryMutAct_9fa48("126364") ? false : stryMutAct_9fa48("126363") ? true : (stryCov_9fa48("126363", "126364", "126365"), (stryMutAct_9fa48("126367") ? t.table_name !== tableName : stryMutAct_9fa48("126366") ? false : (stryCov_9fa48("126366", "126367"), t.table_name === tableName)) || (stryMutAct_9fa48("126369") ? t.tableName !== tableName : stryMutAct_9fa48("126368") ? false : (stryCov_9fa48("126368", "126369"), t.tableName === tableName)))));
              if (stryMutAct_9fa48("126372") ? table.schema_definition : stryMutAct_9fa48("126371") ? false : stryMutAct_9fa48("126370") ? true : (stryCov_9fa48("126370", "126371", "126372"), table?.schema_definition)) {
                if (stryMutAct_9fa48("126373")) {
                  {}
                } else {
                  stryCov_9fa48("126373");
                  return JSON.parse(table.schema_definition);
                }
              }
              if (stryMutAct_9fa48("126376") ? table.schemaDefinition : stryMutAct_9fa48("126375") ? false : stryMutAct_9fa48("126374") ? true : (stryCov_9fa48("126374", "126375", "126376"), table?.schemaDefinition)) {
                if (stryMutAct_9fa48("126377")) {
                  {}
                } else {
                  stryCov_9fa48("126377");
                  return JSON.parse(table.schemaDefinition);
                }
              }
            }
          }
        }
      } catch {
        // Cache not available or parse error
      }
      return null;
    }
  }

  /**
   * Strip partition details from query results.
   * Requirement 20.10: Never expose partition details in query results.
   * Note: We keep high-level partition metadata (like which partitions were queried)
   * but strip internal partition details from individual rows.
   * @param {Object} result - Query result.
   * @return {Object} Result with internal partition details stripped.
   */
  stripPartitionDetails(result) {
    if (stryMutAct_9fa48("126378")) {
      {}
    } else {
      stryCov_9fa48("126378");
      if (stryMutAct_9fa48("126381") ? false : stryMutAct_9fa48("126380") ? true : stryMutAct_9fa48("126379") ? result : (stryCov_9fa48("126379", "126380", "126381"), !result)) {
        if (stryMutAct_9fa48("126382")) {
          {}
        } else {
          stryCov_9fa48("126382");
          return result;
        }
      }

      // Create a copy to avoid mutating the original
      const stripped = stryMutAct_9fa48("126383") ? {} : (stryCov_9fa48("126383"), {
        ...result
      });

      // Remove internal partition-related fields from top-level result
      // Keep 'partitions' array as it's useful metadata about which partitions were queried
      delete stripped.sourcePartition;
      delete stripped.partition_key_start;
      delete stripped.partition_key_end;

      // Strip internal partition details from rows if present
      if (stryMutAct_9fa48("126385") ? false : stryMutAct_9fa48("126384") ? true : (stryCov_9fa48("126384", "126385"), Array.isArray(stripped.rows))) {
        if (stryMutAct_9fa48("126386")) {
          {}
        } else {
          stryCov_9fa48("126386");
          stripped.rows = stripped.rows.map(row => {
            if (stryMutAct_9fa48("126387")) {
              {}
            } else {
              stryCov_9fa48("126387");
              const cleanRow = stryMutAct_9fa48("126388") ? {} : (stryCov_9fa48("126388"), {
                ...row
              });
              // Remove internal partition tracking fields
              delete cleanRow._partition_id;
              delete cleanRow._partitionId;
              delete cleanRow._sourcePartition;
              return cleanRow;
            }
          });
        }
      }
      return stripped;
    }
  }

  /**
   * Check if a field name is a partition-related field.
   * @param {string} fieldName - Field name to check.
   * @return {boolean} True if partition-related.
   */
  isPartitionField(fieldName) {
    if (stryMutAct_9fa48("126389")) {
      {}
    } else {
      stryCov_9fa48("126389");
      const partitionFields = new Set(stryMutAct_9fa48("126390") ? [] : (stryCov_9fa48("126390"), [stryMutAct_9fa48("126391") ? "" : (stryCov_9fa48("126391"), 'partition_id'), stryMutAct_9fa48("126392") ? "" : (stryCov_9fa48("126392"), 'partitionId'), stryMutAct_9fa48("126393") ? "" : (stryCov_9fa48("126393"), '_partition_id'), stryMutAct_9fa48("126394") ? "" : (stryCov_9fa48("126394"), '_partitionId'), stryMutAct_9fa48("126395") ? "" : (stryCov_9fa48("126395"), 'partition_key_start'), stryMutAct_9fa48("126396") ? "" : (stryCov_9fa48("126396"), 'partition_key_end'), stryMutAct_9fa48("126397") ? "" : (stryCov_9fa48("126397"), 'partitionKeyStart'), stryMutAct_9fa48("126398") ? "" : (stryCov_9fa48("126398"), 'partitionKeyEnd'), stryMutAct_9fa48("126399") ? "" : (stryCov_9fa48("126399"), 'sourcePartition')]));
      return partitionFields.has(fieldName);
    }
  }
}
export { TableCreationService };