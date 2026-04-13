/**
 * WasmServiceReplica — Raft-based replica for WASM service groups.
 * Extends RaftReplicaBase with session KV store, safety interval
 * broadcasts, persistent timers, and read routing.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 5.1, 5.2, 5.3, 6.1, 6.2
 * @module wasm-service/wasm-service-replica
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
import { RaftReplicaBase } from '../raft/raft-replica-base.js';
import { AuthoritativeRowMutationHelper } from '../raft/authoritative-row-mutation-helper.js';
import { SERVICE_TYPE } from '../constants/service.js';
import { COLUMN, TABLES, TYPEOF } from '../constants/index.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { isSystemTableWriteReady } from '../cache/leader-readiness-gate.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { SessionKVStore } from './session-kv-store.js';
import { SafetyInterval } from './safety-interval.js';
import { TimerManager } from './timer-manager.js';
import { routeRead } from './read-router.js';
import { WASM_SERVICE_SUBSYSTEM, WASM_SERVICE_LOG_MSG, WASM_SERVICE_ERROR_MSG, WASM_SERVICE_DEFAULT, WRITE_CONSISTENCY_MODE } from './wasm-service-constants.js';

// Entry type scalar values
const ENTRY_TYPE_KV_SET = stryMutAct_9fa48("164073") ? "" : (stryCov_9fa48("164073"), 'kv_set');
const ENTRY_TYPE_KV_DELETE = stryMutAct_9fa48("164074") ? "" : (stryCov_9fa48("164074"), 'kv_delete');
const ENTRY_TYPE_KV_DELETE_SESSION = stryMutAct_9fa48("164075") ? "" : (stryCov_9fa48("164075"), 'kv_delete_session');
const ENTRY_TYPE_TIMER_STATE = stryMutAct_9fa48("164076") ? "" : (stryCov_9fa48("164076"), 'timer_state');

/**
 * Entry type constants for committed Raft log entries.
 * @enum {string}
 */
const ENTRY_TYPE = Object.freeze(stryMutAct_9fa48("164077") ? {} : (stryCov_9fa48("164077"), {
  KV_SET: ENTRY_TYPE_KV_SET,
  KV_DELETE: ENTRY_TYPE_KV_DELETE,
  KV_DELETE_SESSION: ENTRY_TYPE_KV_DELETE_SESSION,
  TIMER_STATE: ENTRY_TYPE_TIMER_STATE
}));

// Message operation scalar values
const MESSAGE_OP_READ = stryMutAct_9fa48("164078") ? "" : (stryCov_9fa48("164078"), 'read');
const MESSAGE_OP_WRITE = stryMutAct_9fa48("164079") ? "" : (stryCov_9fa48("164079"), 'write');

/**
 * Message operation constants for incoming service messages.
 * @enum {string}
 */
const MESSAGE_OP = Object.freeze(stryMutAct_9fa48("164080") ? {} : (stryCov_9fa48("164080"), {
  READ: MESSAGE_OP_READ,
  WRITE: MESSAGE_OP_WRITE
}));
const METADATA_FLUSH_RETRY_DELAY_MS = 250;
const SQLITE_MEMORY_PATH = stryMutAct_9fa48("164081") ? "" : (stryCov_9fa48("164081"), ':memory:');
const FLUSH_REASON_NOT_OWNER = stryMutAct_9fa48("164082") ? "" : (stryCov_9fa48("164082"), 'not-owner');
const FLUSH_REASON_READY = stryMutAct_9fa48("164083") ? "" : (stryCov_9fa48("164083"), 'ready');
const METADATA_FLUSH_LOG_MSG = Object.freeze(stryMutAct_9fa48("164084") ? {} : (stryCov_9fa48("164084"), {
  ROLE_RETRY_FAILED: stryMutAct_9fa48("164085") ? "" : (stryCov_9fa48("164085"), 'WASM role update retry failed'),
  LEADER_RETRY_FAILED: stryMutAct_9fa48("164086") ? "" : (stryCov_9fa48("164086"), 'WASM leader-node update retry failed')
}));

/**
 * WasmServiceReplica extends RaftReplicaBase to provide a
 * Raft consensus group for WASM services. Each replica
 * maintains a local SQLite-backed KV store, participates
 * in safety interval broadcasts for strong reads, and
 * manages persistent timers on the leader.
 */
class WasmServiceReplica extends RaftReplicaBase {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.replicaId - This replica's ID.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Array<string>} options.replicaIds - All replica IDs.
   * @param {Object} options.transport - MessageRouter instance.
   * @param {string} options.serviceDefinitionId - Service def ID.
   * @param {string} options.dbPath - Path to SQLite database.
   * @param {number} [options.safetyIntervalMs] - Staleness bound.
   * @param {string} [options.readConsistency] - Read mode.
   * @param {string} [options.writeConsistency] - Write mode.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("164087")) {
      {}
    } else {
      stryCov_9fa48("164087");
      super(stryMutAct_9fa48("164088") ? {} : (stryCov_9fa48("164088"), {
        ...options,
        entityType: SERVICE_TYPE.WASM_SERVICE,
        subsystemName: WASM_SERVICE_SUBSYSTEM.REPLICA
      }));
      this.serviceDefinitionId = options.serviceDefinitionId;
      this.readConsistency = stryMutAct_9fa48("164091") ? options.readConsistency && WASM_SERVICE_DEFAULT.READ_CONSISTENCY : stryMutAct_9fa48("164090") ? false : stryMutAct_9fa48("164089") ? true : (stryCov_9fa48("164089", "164090", "164091"), options.readConsistency || WASM_SERVICE_DEFAULT.READ_CONSISTENCY);
      this.writeConsistency = stryMutAct_9fa48("164094") ? options.writeConsistency && WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY : stryMutAct_9fa48("164093") ? false : stryMutAct_9fa48("164092") ? true : (stryCov_9fa48("164092", "164093", "164094"), options.writeConsistency || WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY);
      this.kvStore = new SessionKVStore(stryMutAct_9fa48("164097") ? options.dbPath && SQLITE_MEMORY_PATH : stryMutAct_9fa48("164096") ? false : stryMutAct_9fa48("164095") ? true : (stryCov_9fa48("164095", "164096", "164097"), options.dbPath || SQLITE_MEMORY_PATH));
      this.timerManager = new TimerManager(this);
      this.safetyInterval = new SafetyInterval(options.safetyIntervalMs);
      this.wasmExecutor = null;
      this.portAllocation = null;
      this.onTimerCallback = null;
      this.roleUpdateWriter = stryMutAct_9fa48("164100") ? options.roleUpdateWriter && null : stryMutAct_9fa48("164099") ? false : stryMutAct_9fa48("164098") ? true : (stryCov_9fa48("164098", "164099", "164100"), options.roleUpdateWriter || null);
      this.leaderNodeUpdateWriter = stryMutAct_9fa48("164103") ? options.leaderNodeUpdateWriter && null : stryMutAct_9fa48("164102") ? false : stryMutAct_9fa48("164101") ? true : (stryCov_9fa48("164101", "164102", "164103"), options.leaderNodeUpdateWriter || null);
      this.roleMutationTransport = this.createRoleMutationTransport();
      this.leaderNodeMutationTransport = this.createLeaderNodeMutationTransport();
      this.roleMutationHelper = this.createRoleMutationHelper();
      this.pendingRoleUpdate = this.role;
      this.persistedRole = null;
      this.leaderNodeMutationHelper = this.createLeaderNodeMutationHelper();
      this.pendingLeaderNodeUpdate = null;
      this.persistedLeaderNodeId = null;
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("164104") ? {} : (stryCov_9fa48("164104"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("164105") ? () => undefined : (stryCov_9fa48("164105"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("164106") ? () => undefined : (stryCov_9fa48("164106"), () => this.systemTableCache),
        getMessageRouter: stryMutAct_9fa48("164107") ? () => undefined : (stryCov_9fa48("164107"), () => this.transport)
      })).controlPlaneSystemTableGateway;
      this._safetyBroadcastTimer = null;
      this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_CREATED, stryMutAct_9fa48("164108") ? {} : (stryCov_9fa48("164108"), {
        replicaId: this.replicaId,
        serviceDefinitionId: this.serviceDefinitionId
      }));
    }
  }
  get systemTableCache() {
    if (stryMutAct_9fa48("164109")) {
      {}
    } else {
      stryCov_9fa48("164109");
      return stryMutAct_9fa48("164112") ? this._systemTableCache && null : stryMutAct_9fa48("164111") ? false : stryMutAct_9fa48("164110") ? true : (stryCov_9fa48("164110", "164111", "164112"), this._systemTableCache || null);
    }
  }
  set systemTableCache(systemTableCache) {
    if (stryMutAct_9fa48("164113")) {
      {}
    } else {
      stryCov_9fa48("164113");
      this._systemTableCache = systemTableCache;
      stryMutAct_9fa48("164114") ? this.roleMutationHelper.setSystemTableCache(systemTableCache) : (stryCov_9fa48("164114"), this.roleMutationHelper?.setSystemTableCache(systemTableCache));
      stryMutAct_9fa48("164115") ? this.leaderNodeMutationHelper.setSystemTableCache(systemTableCache) : (stryCov_9fa48("164115"), this.leaderNodeMutationHelper?.setSystemTableCache(systemTableCache));
    }
  }
  get cdcIntegrationService() {
    if (stryMutAct_9fa48("164116")) {
      {}
    } else {
      stryCov_9fa48("164116");
      return stryMutAct_9fa48("164119") ? this._cdcIntegrationService && null : stryMutAct_9fa48("164118") ? false : stryMutAct_9fa48("164117") ? true : (stryCov_9fa48("164117", "164118", "164119"), this._cdcIntegrationService || null);
    }
  }
  set cdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("164120")) {
      {}
    } else {
      stryCov_9fa48("164120");
      this._cdcIntegrationService = cdcIntegrationService;
    }
  }
  get pendingRoleUpdate() {
    if (stryMutAct_9fa48("164121")) {
      {}
    } else {
      stryCov_9fa48("164121");
      return stryMutAct_9fa48("164124") ? this.roleMutationHelper?.pendingValue && null : stryMutAct_9fa48("164123") ? false : stryMutAct_9fa48("164122") ? true : (stryCov_9fa48("164122", "164123", "164124"), (stryMutAct_9fa48("164125") ? this.roleMutationHelper.pendingValue : (stryCov_9fa48("164125"), this.roleMutationHelper?.pendingValue)) || null);
    }
  }
  set pendingRoleUpdate(role) {
    if (stryMutAct_9fa48("164126")) {
      {}
    } else {
      stryCov_9fa48("164126");
      if (stryMutAct_9fa48("164128") ? false : stryMutAct_9fa48("164127") ? true : (stryCov_9fa48("164127", "164128"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("164129")) {
          {}
        } else {
          stryCov_9fa48("164129");
          this.roleMutationHelper.pendingValue = role;
        }
      }
    }
  }
  get persistedRole() {
    if (stryMutAct_9fa48("164130")) {
      {}
    } else {
      stryCov_9fa48("164130");
      return stryMutAct_9fa48("164133") ? this.roleMutationHelper?.persistedValue && null : stryMutAct_9fa48("164132") ? false : stryMutAct_9fa48("164131") ? true : (stryCov_9fa48("164131", "164132", "164133"), (stryMutAct_9fa48("164134") ? this.roleMutationHelper.persistedValue : (stryCov_9fa48("164134"), this.roleMutationHelper?.persistedValue)) || null);
    }
  }
  set persistedRole(role) {
    if (stryMutAct_9fa48("164135")) {
      {}
    } else {
      stryCov_9fa48("164135");
      if (stryMutAct_9fa48("164137") ? false : stryMutAct_9fa48("164136") ? true : (stryCov_9fa48("164136", "164137"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("164138")) {
          {}
        } else {
          stryCov_9fa48("164138");
          this.roleMutationHelper.persistedValue = role;
        }
      }
    }
  }
  get roleUpdateInFlight() {
    if (stryMutAct_9fa48("164139")) {
      {}
    } else {
      stryCov_9fa48("164139");
      return stryMutAct_9fa48("164142") ? this.roleMutationHelper?.inFlight && false : stryMutAct_9fa48("164141") ? false : stryMutAct_9fa48("164140") ? true : (stryCov_9fa48("164140", "164141", "164142"), (stryMutAct_9fa48("164143") ? this.roleMutationHelper.inFlight : (stryCov_9fa48("164143"), this.roleMutationHelper?.inFlight)) || (stryMutAct_9fa48("164144") ? true : (stryCov_9fa48("164144"), false)));
    }
  }
  set roleUpdateInFlight(inFlight) {
    if (stryMutAct_9fa48("164145")) {
      {}
    } else {
      stryCov_9fa48("164145");
      if (stryMutAct_9fa48("164147") ? false : stryMutAct_9fa48("164146") ? true : (stryCov_9fa48("164146", "164147"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("164148")) {
          {}
        } else {
          stryCov_9fa48("164148");
          this.roleMutationHelper.inFlight = inFlight;
        }
      }
    }
  }
  get roleUpdateRetryTimer() {
    if (stryMutAct_9fa48("164149")) {
      {}
    } else {
      stryCov_9fa48("164149");
      return stryMutAct_9fa48("164152") ? this.roleMutationHelper?.retryTimer && null : stryMutAct_9fa48("164151") ? false : stryMutAct_9fa48("164150") ? true : (stryCov_9fa48("164150", "164151", "164152"), (stryMutAct_9fa48("164153") ? this.roleMutationHelper.retryTimer : (stryCov_9fa48("164153"), this.roleMutationHelper?.retryTimer)) || null);
    }
  }
  set roleUpdateRetryTimer(timer) {
    if (stryMutAct_9fa48("164154")) {
      {}
    } else {
      stryCov_9fa48("164154");
      if (stryMutAct_9fa48("164156") ? false : stryMutAct_9fa48("164155") ? true : (stryCov_9fa48("164155", "164156"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("164157")) {
          {}
        } else {
          stryCov_9fa48("164157");
          this.roleMutationHelper.retryTimer = timer;
        }
      }
    }
  }
  get pendingLeaderNodeUpdate() {
    if (stryMutAct_9fa48("164158")) {
      {}
    } else {
      stryCov_9fa48("164158");
      return stryMutAct_9fa48("164161") ? this.leaderNodeMutationHelper?.pendingValue && null : stryMutAct_9fa48("164160") ? false : stryMutAct_9fa48("164159") ? true : (stryCov_9fa48("164159", "164160", "164161"), (stryMutAct_9fa48("164162") ? this.leaderNodeMutationHelper.pendingValue : (stryCov_9fa48("164162"), this.leaderNodeMutationHelper?.pendingValue)) || null);
    }
  }
  set pendingLeaderNodeUpdate(leaderNodeId) {
    if (stryMutAct_9fa48("164163")) {
      {}
    } else {
      stryCov_9fa48("164163");
      if (stryMutAct_9fa48("164165") ? false : stryMutAct_9fa48("164164") ? true : (stryCov_9fa48("164164", "164165"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("164166")) {
          {}
        } else {
          stryCov_9fa48("164166");
          this.leaderNodeMutationHelper.pendingValue = leaderNodeId;
        }
      }
    }
  }
  get persistedLeaderNodeId() {
    if (stryMutAct_9fa48("164167")) {
      {}
    } else {
      stryCov_9fa48("164167");
      return stryMutAct_9fa48("164170") ? this.leaderNodeMutationHelper?.persistedValue && null : stryMutAct_9fa48("164169") ? false : stryMutAct_9fa48("164168") ? true : (stryCov_9fa48("164168", "164169", "164170"), (stryMutAct_9fa48("164171") ? this.leaderNodeMutationHelper.persistedValue : (stryCov_9fa48("164171"), this.leaderNodeMutationHelper?.persistedValue)) || null);
    }
  }
  set persistedLeaderNodeId(leaderNodeId) {
    if (stryMutAct_9fa48("164172")) {
      {}
    } else {
      stryCov_9fa48("164172");
      if (stryMutAct_9fa48("164174") ? false : stryMutAct_9fa48("164173") ? true : (stryCov_9fa48("164173", "164174"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("164175")) {
          {}
        } else {
          stryCov_9fa48("164175");
          this.leaderNodeMutationHelper.persistedValue = leaderNodeId;
        }
      }
    }
  }
  get leaderNodeUpdateInFlight() {
    if (stryMutAct_9fa48("164176")) {
      {}
    } else {
      stryCov_9fa48("164176");
      return stryMutAct_9fa48("164179") ? this.leaderNodeMutationHelper?.inFlight && false : stryMutAct_9fa48("164178") ? false : stryMutAct_9fa48("164177") ? true : (stryCov_9fa48("164177", "164178", "164179"), (stryMutAct_9fa48("164180") ? this.leaderNodeMutationHelper.inFlight : (stryCov_9fa48("164180"), this.leaderNodeMutationHelper?.inFlight)) || (stryMutAct_9fa48("164181") ? true : (stryCov_9fa48("164181"), false)));
    }
  }
  set leaderNodeUpdateInFlight(inFlight) {
    if (stryMutAct_9fa48("164182")) {
      {}
    } else {
      stryCov_9fa48("164182");
      if (stryMutAct_9fa48("164184") ? false : stryMutAct_9fa48("164183") ? true : (stryCov_9fa48("164183", "164184"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("164185")) {
          {}
        } else {
          stryCov_9fa48("164185");
          this.leaderNodeMutationHelper.inFlight = inFlight;
        }
      }
    }
  }
  get leaderNodeUpdateRetryTimer() {
    if (stryMutAct_9fa48("164186")) {
      {}
    } else {
      stryCov_9fa48("164186");
      return stryMutAct_9fa48("164189") ? this.leaderNodeMutationHelper?.retryTimer && null : stryMutAct_9fa48("164188") ? false : stryMutAct_9fa48("164187") ? true : (stryCov_9fa48("164187", "164188", "164189"), (stryMutAct_9fa48("164190") ? this.leaderNodeMutationHelper.retryTimer : (stryCov_9fa48("164190"), this.leaderNodeMutationHelper?.retryTimer)) || null);
    }
  }
  set leaderNodeUpdateRetryTimer(timer) {
    if (stryMutAct_9fa48("164191")) {
      {}
    } else {
      stryCov_9fa48("164191");
      if (stryMutAct_9fa48("164193") ? false : stryMutAct_9fa48("164192") ? true : (stryCov_9fa48("164192", "164193"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("164194")) {
          {}
        } else {
          stryCov_9fa48("164194");
          this.leaderNodeMutationHelper.retryTimer = timer;
        }
      }
    }
  }
  createRoleMutationTransport() {
    if (stryMutAct_9fa48("164195")) {
      {}
    } else {
      stryCov_9fa48("164195");
      return stryMutAct_9fa48("164196") ? {} : (stryCov_9fa48("164196"), {
        updateSystemTableRow: stryMutAct_9fa48("164197") ? () => undefined : (stryCov_9fa48("164197"), async (_tableName, _whereClause, data, options = {}) => this.writeRoleUpdate(stryMutAct_9fa48("164198") ? data[COLUMN.RAFT_ROLE] : (stryCov_9fa48("164198"), data?.[COLUMN.RAFT_ROLE]), stryMutAct_9fa48("164199") ? data[COLUMN.UPDATED_AT] : (stryCov_9fa48("164199"), data?.[COLUMN.UPDATED_AT]), options))
      });
    }
  }
  createLeaderNodeMutationTransport() {
    if (stryMutAct_9fa48("164200")) {
      {}
    } else {
      stryCov_9fa48("164200");
      return stryMutAct_9fa48("164201") ? {} : (stryCov_9fa48("164201"), {
        updateSystemTableRow: stryMutAct_9fa48("164202") ? () => undefined : (stryCov_9fa48("164202"), async (_tableName, _whereClause, data, options = {}) => this.writeLeaderNodeUpdate(stryMutAct_9fa48("164203") ? data[COLUMN.NODE_ID] : (stryCov_9fa48("164203"), data?.[COLUMN.NODE_ID]), stryMutAct_9fa48("164204") ? data[COLUMN.UPDATED_AT] : (stryCov_9fa48("164204"), data?.[COLUMN.UPDATED_AT]), stryMutAct_9fa48("164205") ? data[COLUMN.RAFT_ROLE] : (stryCov_9fa48("164205"), data?.[COLUMN.RAFT_ROLE]), options))
      });
    }
  }
  createRoleMutationHelper() {
    if (stryMutAct_9fa48("164206")) {
      {}
    } else {
      stryCov_9fa48("164206");
      return new AuthoritativeRowMutationHelper(stryMutAct_9fa48("164207") ? {} : (stryCov_9fa48("164207"), {
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        buildWhereClause: (_role, context = {}) => {
          if (stryMutAct_9fa48("164208")) {
            {}
          } else {
            stryCov_9fa48("164208");
            const whereClause = stryMutAct_9fa48("164209") ? {} : (stryCov_9fa48("164209"), {
              [COLUMN.SERVICE_ID]: this.replicaId
            });
            const cachedRow = context.cachedRow;
            if (stryMutAct_9fa48("164212") ? typeof cachedRow?.[COLUMN.RAFT_ROLE] === 'string' || cachedRow[COLUMN.RAFT_ROLE].length > 0 : stryMutAct_9fa48("164211") ? false : stryMutAct_9fa48("164210") ? true : (stryCov_9fa48("164210", "164211", "164212"), (stryMutAct_9fa48("164214") ? typeof cachedRow?.[COLUMN.RAFT_ROLE] !== 'string' : stryMutAct_9fa48("164213") ? true : (stryCov_9fa48("164213", "164214"), typeof (stryMutAct_9fa48("164215") ? cachedRow[COLUMN.RAFT_ROLE] : (stryCov_9fa48("164215"), cachedRow?.[COLUMN.RAFT_ROLE])) === (stryMutAct_9fa48("164216") ? "" : (stryCov_9fa48("164216"), 'string')))) && (stryMutAct_9fa48("164219") ? cachedRow[COLUMN.RAFT_ROLE].length <= 0 : stryMutAct_9fa48("164218") ? cachedRow[COLUMN.RAFT_ROLE].length >= 0 : stryMutAct_9fa48("164217") ? true : (stryCov_9fa48("164217", "164218", "164219"), cachedRow[COLUMN.RAFT_ROLE].length > 0)))) {
              if (stryMutAct_9fa48("164220")) {
                {}
              } else {
                stryCov_9fa48("164220");
                whereClause[COLUMN.RAFT_ROLE] = cachedRow[COLUMN.RAFT_ROLE];
              }
            }
            if (stryMutAct_9fa48("164222") ? false : stryMutAct_9fa48("164221") ? true : (stryCov_9fa48("164221", "164222"), Number.isFinite(stryMutAct_9fa48("164223") ? cachedRow[COLUMN.UPDATED_AT] : (stryCov_9fa48("164223"), cachedRow?.[COLUMN.UPDATED_AT])))) {
              if (stryMutAct_9fa48("164224")) {
                {}
              } else {
                stryCov_9fa48("164224");
                whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
              }
            }
            return whereClause;
          }
        },
        buildUpdateData: stryMutAct_9fa48("164225") ? () => undefined : (stryCov_9fa48("164225"), (role, updatedAt) => stryMutAct_9fa48("164226") ? {} : (stryCov_9fa48("164226"), {
          [COLUMN.RAFT_ROLE]: role,
          [COLUMN.UPDATED_AT]: updatedAt
        })),
        buildExpectedCacheFields: stryMutAct_9fa48("164227") ? () => undefined : (stryCov_9fa48("164227"), role => stryMutAct_9fa48("164228") ? {} : (stryCov_9fa48("164228"), {
          [COLUMN.RAFT_ROLE]: role
        })),
        readRowFromCache: stryMutAct_9fa48("164229") ? () => undefined : (stryCov_9fa48("164229"), systemTableCache => stryMutAct_9fa48("164232") ? systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) && null : stryMutAct_9fa48("164231") ? false : stryMutAct_9fa48("164230") ? true : (stryCov_9fa48("164230", "164231", "164232"), (stryMutAct_9fa48("164234") ? systemTableCache.get?.(TABLES.SERVICES, this.replicaId) : stryMutAct_9fa48("164233") ? systemTableCache?.get(TABLES.SERVICES, this.replicaId) : (stryCov_9fa48("164233", "164234"), systemTableCache?.get?.(TABLES.SERVICES, this.replicaId))) || null)),
        readValueFromCache: stryMutAct_9fa48("164235") ? () => undefined : (stryCov_9fa48("164235"), systemTableCache => stryMutAct_9fa48("164238") ? systemTableCache?.get?.(TABLES.SERVICES, this.replicaId)?.[COLUMN.RAFT_ROLE] && null : stryMutAct_9fa48("164237") ? false : stryMutAct_9fa48("164236") ? true : (stryCov_9fa48("164236", "164237", "164238"), (stryMutAct_9fa48("164241") ? systemTableCache.get?.(TABLES.SERVICES, this.replicaId)?.[COLUMN.RAFT_ROLE] : stryMutAct_9fa48("164240") ? systemTableCache?.get(TABLES.SERVICES, this.replicaId)?.[COLUMN.RAFT_ROLE] : stryMutAct_9fa48("164239") ? systemTableCache?.get?.(TABLES.SERVICES, this.replicaId)[COLUMN.RAFT_ROLE] : (stryCov_9fa48("164239", "164240", "164241"), systemTableCache?.get?.(TABLES.SERVICES, this.replicaId)?.[COLUMN.RAFT_ROLE])) || null)),
        isWriteReady: stryMutAct_9fa48("164242") ? () => undefined : (stryCov_9fa48("164242"), () => this.isServicesLeaderAvailable()),
        retryDelayMs: METADATA_FLUSH_RETRY_DELAY_MS,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.roleMutationTransport,
        onAsyncError: (error, context = {}) => {
          if (stryMutAct_9fa48("164243")) {
            {}
          } else {
            stryCov_9fa48("164243");
            this.logger.warn(METADATA_FLUSH_LOG_MSG.ROLE_RETRY_FAILED, stryMutAct_9fa48("164244") ? {} : (stryCov_9fa48("164244"), {
              replicaId: this.replicaId,
              role: stryMutAct_9fa48("164245") ? context.value && this.pendingRoleUpdate : (stryCov_9fa48("164245"), context.value ?? this.pendingRoleUpdate),
              error: error.message
            }));
          }
        }
      }));
    }
  }
  createLeaderNodeMutationHelper() {
    if (stryMutAct_9fa48("164246")) {
      {}
    } else {
      stryCov_9fa48("164246");
      return new AuthoritativeRowMutationHelper(stryMutAct_9fa48("164247") ? {} : (stryCov_9fa48("164247"), {
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        buildWhereClause: (_leaderNodeId, context = {}) => {
          if (stryMutAct_9fa48("164248")) {
            {}
          } else {
            stryCov_9fa48("164248");
            const whereClause = stryMutAct_9fa48("164249") ? {} : (stryCov_9fa48("164249"), {
              [COLUMN.SERVICE_ID]: this.replicaId
            });
            const cachedRow = context.cachedRow;
            if (stryMutAct_9fa48("164252") ? typeof cachedRow?.[COLUMN.NODE_ID] === 'string' || cachedRow[COLUMN.NODE_ID].length > 0 : stryMutAct_9fa48("164251") ? false : stryMutAct_9fa48("164250") ? true : (stryCov_9fa48("164250", "164251", "164252"), (stryMutAct_9fa48("164254") ? typeof cachedRow?.[COLUMN.NODE_ID] !== 'string' : stryMutAct_9fa48("164253") ? true : (stryCov_9fa48("164253", "164254"), typeof (stryMutAct_9fa48("164255") ? cachedRow[COLUMN.NODE_ID] : (stryCov_9fa48("164255"), cachedRow?.[COLUMN.NODE_ID])) === (stryMutAct_9fa48("164256") ? "" : (stryCov_9fa48("164256"), 'string')))) && (stryMutAct_9fa48("164259") ? cachedRow[COLUMN.NODE_ID].length <= 0 : stryMutAct_9fa48("164258") ? cachedRow[COLUMN.NODE_ID].length >= 0 : stryMutAct_9fa48("164257") ? true : (stryCov_9fa48("164257", "164258", "164259"), cachedRow[COLUMN.NODE_ID].length > 0)))) {
              if (stryMutAct_9fa48("164260")) {
                {}
              } else {
                stryCov_9fa48("164260");
                whereClause[COLUMN.NODE_ID] = cachedRow[COLUMN.NODE_ID];
              }
            }
            if (stryMutAct_9fa48("164262") ? false : stryMutAct_9fa48("164261") ? true : (stryCov_9fa48("164261", "164262"), Number.isFinite(stryMutAct_9fa48("164263") ? cachedRow[COLUMN.UPDATED_AT] : (stryCov_9fa48("164263"), cachedRow?.[COLUMN.UPDATED_AT])))) {
              if (stryMutAct_9fa48("164264")) {
                {}
              } else {
                stryCov_9fa48("164264");
                whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
              }
            }
            return whereClause;
          }
        },
        buildUpdateData: stryMutAct_9fa48("164265") ? () => undefined : (stryCov_9fa48("164265"), (leaderNodeId, updatedAt) => stryMutAct_9fa48("164266") ? {} : (stryCov_9fa48("164266"), {
          [COLUMN.NODE_ID]: leaderNodeId,
          [COLUMN.RAFT_ROLE]: this.role,
          [COLUMN.UPDATED_AT]: updatedAt
        })),
        buildExpectedCacheFields: stryMutAct_9fa48("164267") ? () => undefined : (stryCov_9fa48("164267"), leaderNodeId => stryMutAct_9fa48("164268") ? {} : (stryCov_9fa48("164268"), {
          [COLUMN.NODE_ID]: leaderNodeId,
          [COLUMN.RAFT_ROLE]: this.role
        })),
        readRowFromCache: stryMutAct_9fa48("164269") ? () => undefined : (stryCov_9fa48("164269"), systemTableCache => stryMutAct_9fa48("164272") ? systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) && null : stryMutAct_9fa48("164271") ? false : stryMutAct_9fa48("164270") ? true : (stryCov_9fa48("164270", "164271", "164272"), (stryMutAct_9fa48("164274") ? systemTableCache.get?.(TABLES.SERVICES, this.replicaId) : stryMutAct_9fa48("164273") ? systemTableCache?.get(TABLES.SERVICES, this.replicaId) : (stryCov_9fa48("164273", "164274"), systemTableCache?.get?.(TABLES.SERVICES, this.replicaId))) || null)),
        readValueFromCache: stryMutAct_9fa48("164275") ? () => undefined : (stryCov_9fa48("164275"), systemTableCache => stryMutAct_9fa48("164278") ? systemTableCache?.get?.(TABLES.SERVICES, this.replicaId)?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("164277") ? false : stryMutAct_9fa48("164276") ? true : (stryCov_9fa48("164276", "164277", "164278"), (stryMutAct_9fa48("164281") ? systemTableCache.get?.(TABLES.SERVICES, this.replicaId)?.[COLUMN.NODE_ID] : stryMutAct_9fa48("164280") ? systemTableCache?.get(TABLES.SERVICES, this.replicaId)?.[COLUMN.NODE_ID] : stryMutAct_9fa48("164279") ? systemTableCache?.get?.(TABLES.SERVICES, this.replicaId)[COLUMN.NODE_ID] : (stryCov_9fa48("164279", "164280", "164281"), systemTableCache?.get?.(TABLES.SERVICES, this.replicaId)?.[COLUMN.NODE_ID])) || null)),
        prepareFlush: stryMutAct_9fa48("164282") ? () => undefined : (stryCov_9fa48("164282"), () => stryMutAct_9fa48("164283") ? {} : (stryCov_9fa48("164283"), {
          skip: stryMutAct_9fa48("164284") ? this.isLeader : (stryCov_9fa48("164284"), !this.isLeader),
          clearPending: stryMutAct_9fa48("164285") ? this.isLeader : (stryCov_9fa48("164285"), !this.isLeader),
          reason: (stryMutAct_9fa48("164286") ? this.isLeader : (stryCov_9fa48("164286"), !this.isLeader)) ? FLUSH_REASON_NOT_OWNER : FLUSH_REASON_READY
        })),
        isWriteReady: stryMutAct_9fa48("164287") ? () => undefined : (stryCov_9fa48("164287"), () => this.isServicesLeaderAvailable()),
        retryDelayMs: METADATA_FLUSH_RETRY_DELAY_MS,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.leaderNodeMutationTransport,
        onAsyncError: (error, context = {}) => {
          if (stryMutAct_9fa48("164288")) {
            {}
          } else {
            stryCov_9fa48("164288");
            this.logger.warn(METADATA_FLUSH_LOG_MSG.LEADER_RETRY_FAILED, stryMutAct_9fa48("164289") ? {} : (stryCov_9fa48("164289"), {
              replicaId: this.replicaId,
              leaderNodeId: stryMutAct_9fa48("164290") ? context.value && this.pendingLeaderNodeUpdate : (stryCov_9fa48("164290"), context.value ?? this.pendingLeaderNodeUpdate),
              error: error.message
            }));
          }
        }
      }));
    }
  }

  /**
   * Called when a Raft entry is committed. Delegates to
   * applyCommittedEntry and updates the safety interval
   * local applied index.
   *
   * @param {Object} command - The committed command.
   */
  onCommit(command) {
    if (stryMutAct_9fa48("164291")) {
      {}
    } else {
      stryCov_9fa48("164291");
      this.applyCommittedEntry(command);
      if (stryMutAct_9fa48("164294") ? command || command.index !== undefined : stryMutAct_9fa48("164293") ? false : stryMutAct_9fa48("164292") ? true : (stryCov_9fa48("164292", "164293", "164294"), command && (stryMutAct_9fa48("164296") ? command.index === undefined : stryMutAct_9fa48("164295") ? true : (stryCov_9fa48("164295", "164296"), command.index !== undefined)))) {
        if (stryMutAct_9fa48("164297")) {
          {}
        } else {
          stryCov_9fa48("164297");
          this.safetyInterval.updateLocalAppliedIndex(command.index);
        }
      }
    }
  }

  /**
   * Apply a committed Raft log entry to the local state.
   * Handles KV writes, deletes, session deletes, and timer
   * state changes.
   *
   * @param {Object} entry - The committed entry.
   * @return {{accepted: boolean, error: string|null}} Result.
   */
  applyCommittedEntry(entry) {
    if (stryMutAct_9fa48("164298")) {
      {}
    } else {
      stryCov_9fa48("164298");
      if (stryMutAct_9fa48("164301") ? !entry && !entry.type : stryMutAct_9fa48("164300") ? false : stryMutAct_9fa48("164299") ? true : (stryCov_9fa48("164299", "164300", "164301"), (stryMutAct_9fa48("164302") ? entry : (stryCov_9fa48("164302"), !entry)) || (stryMutAct_9fa48("164303") ? entry.type : (stryCov_9fa48("164303"), !entry.type)))) {
        if (stryMutAct_9fa48("164304")) {
          {}
        } else {
          stryCov_9fa48("164304");
          return stryMutAct_9fa48("164305") ? {} : (stryCov_9fa48("164305"), {
            accepted: stryMutAct_9fa48("164306") ? false : (stryCov_9fa48("164306"), true),
            error: null
          });
        }
      }
      switch (entry.type) {
        case ENTRY_TYPE.KV_SET:
          if (stryMutAct_9fa48("164307")) {} else {
            stryCov_9fa48("164307");
            {
              if (stryMutAct_9fa48("164308")) {
                {}
              } else {
                stryCov_9fa48("164308");
                const result = this.kvStore.applySet(entry.sessionId, entry.key, entry.value);
                if (stryMutAct_9fa48("164310") ? false : stryMutAct_9fa48("164309") ? true : (stryCov_9fa48("164309", "164310"), result.accepted)) {
                  if (stryMutAct_9fa48("164311")) {
                    {}
                  } else {
                    stryCov_9fa48("164311");
                    this.logger.debug(WASM_SERVICE_LOG_MSG.KV_WRITE_APPLIED, stryMutAct_9fa48("164312") ? {} : (stryCov_9fa48("164312"), {
                      replicaId: this.replicaId,
                      sessionId: entry.sessionId,
                      key: entry.key
                    }));
                  }
                }
                return result;
              }
            }
          }
        case ENTRY_TYPE.KV_DELETE:
          if (stryMutAct_9fa48("164313")) {} else {
            stryCov_9fa48("164313");
            {
              if (stryMutAct_9fa48("164314")) {
                {}
              } else {
                stryCov_9fa48("164314");
                this.kvStore.applyDelete(entry.sessionId, entry.key);
                this.logger.debug(WASM_SERVICE_LOG_MSG.KV_DELETE_APPLIED, stryMutAct_9fa48("164315") ? {} : (stryCov_9fa48("164315"), {
                  replicaId: this.replicaId,
                  sessionId: entry.sessionId,
                  key: entry.key
                }));
                return stryMutAct_9fa48("164316") ? {} : (stryCov_9fa48("164316"), {
                  accepted: stryMutAct_9fa48("164317") ? false : (stryCov_9fa48("164317"), true),
                  error: null
                });
              }
            }
          }
        case ENTRY_TYPE.KV_DELETE_SESSION:
          if (stryMutAct_9fa48("164318")) {} else {
            stryCov_9fa48("164318");
            {
              if (stryMutAct_9fa48("164319")) {
                {}
              } else {
                stryCov_9fa48("164319");
                this.kvStore.applyDeleteSession(entry.sessionId);
                this.logger.debug(WASM_SERVICE_LOG_MSG.SESSION_DELETED, stryMutAct_9fa48("164320") ? {} : (stryCov_9fa48("164320"), {
                  replicaId: this.replicaId,
                  sessionId: entry.sessionId
                }));
                return stryMutAct_9fa48("164321") ? {} : (stryCov_9fa48("164321"), {
                  accepted: stryMutAct_9fa48("164322") ? false : (stryCov_9fa48("164322"), true),
                  error: null
                });
              }
            }
          }
        case ENTRY_TYPE.TIMER_STATE:
          if (stryMutAct_9fa48("164323")) {} else {
            stryCov_9fa48("164323");
            {
              if (stryMutAct_9fa48("164324")) {
                {}
              } else {
                stryCov_9fa48("164324");
                const val = (stryMutAct_9fa48("164327") ? typeof entry.value !== 'string' : stryMutAct_9fa48("164326") ? false : stryMutAct_9fa48("164325") ? true : (stryCov_9fa48("164325", "164326", "164327"), typeof entry.value === (stryMutAct_9fa48("164328") ? "" : (stryCov_9fa48("164328"), 'string')))) ? entry.value : JSON.stringify(entry.value);
                this.kvStore.applySet(stryMutAct_9fa48("164331") ? entry.sessionId && entry.key : stryMutAct_9fa48("164330") ? false : stryMutAct_9fa48("164329") ? true : (stryCov_9fa48("164329", "164330", "164331"), entry.sessionId || entry.key), stryMutAct_9fa48("164334") ? entry.key && entry.sessionId : stryMutAct_9fa48("164333") ? false : stryMutAct_9fa48("164332") ? true : (stryCov_9fa48("164332", "164333", "164334"), entry.key || entry.sessionId), Buffer.from(val));
                return stryMutAct_9fa48("164335") ? {} : (stryCov_9fa48("164335"), {
                  accepted: stryMutAct_9fa48("164336") ? false : (stryCov_9fa48("164336"), true),
                  error: null
                });
              }
            }
          }
        default:
          if (stryMutAct_9fa48("164337")) {} else {
            stryCov_9fa48("164337");
            return stryMutAct_9fa48("164338") ? {} : (stryCov_9fa48("164338"), {
              accepted: stryMutAct_9fa48("164339") ? false : (stryCov_9fa48("164339"), true),
              error: null
            });
          }
      }
    }
  }

  /**
   * Handle an incoming service message. Routes reads via the
   * read router and proposes writes through Raft.
   *
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Response object.
   */
  async handleMessage(message) {
    if (stryMutAct_9fa48("164340")) {
      {}
    } else {
      stryCov_9fa48("164340");
      const raftResult = this.handleRaftPacket(message);
      if (stryMutAct_9fa48("164342") ? false : stryMutAct_9fa48("164341") ? true : (stryCov_9fa48("164341", "164342"), raftResult)) {
        if (stryMutAct_9fa48("164343")) {
          {}
        } else {
          stryCov_9fa48("164343");
          return raftResult;
        }
      }
      const payload = stryMutAct_9fa48("164346") ? message.payload && message : stryMutAct_9fa48("164345") ? false : stryMutAct_9fa48("164344") ? true : (stryCov_9fa48("164344", "164345", "164346"), message.payload || message);
      const operation = stryMutAct_9fa48("164349") ? payload.operation && payload.op : stryMutAct_9fa48("164348") ? false : stryMutAct_9fa48("164347") ? true : (stryCov_9fa48("164347", "164348", "164349"), payload.operation || payload.op);
      if (stryMutAct_9fa48("164352") ? operation !== MESSAGE_OP.READ : stryMutAct_9fa48("164351") ? false : stryMutAct_9fa48("164350") ? true : (stryCov_9fa48("164350", "164351", "164352"), operation === MESSAGE_OP.READ)) {
        if (stryMutAct_9fa48("164353")) {
          {}
        } else {
          stryCov_9fa48("164353");
          return this._handleRead(payload);
        }
      }
      if (stryMutAct_9fa48("164356") ? operation !== MESSAGE_OP.WRITE : stryMutAct_9fa48("164355") ? false : stryMutAct_9fa48("164354") ? true : (stryCov_9fa48("164354", "164355", "164356"), operation === MESSAGE_OP.WRITE)) {
        if (stryMutAct_9fa48("164357")) {
          {}
        } else {
          stryCov_9fa48("164357");
          return this._handleWrite(payload);
        }
      }
      return stryMutAct_9fa48("164358") ? {} : (stryCov_9fa48("164358"), {
        error: WASM_SERVICE_ERROR_MSG.SERVICE_NOT_READY
      });
    }
  }

  /**
   * Handle a read request using the read router to decide
   * whether to serve locally or forward to the leader.
   *
   * @param {Object} payload - Read request payload.
   * @return {Object} Read result or forward instruction.
   * @private
   */
  _handleRead(payload) {
    if (stryMutAct_9fa48("164359")) {
      {}
    } else {
      stryCov_9fa48("164359");
      const decision = routeRead(this.readConsistency, this.isLeader, this.safetyInterval);
      if (stryMutAct_9fa48("164361") ? false : stryMutAct_9fa48("164360") ? true : (stryCov_9fa48("164360", "164361"), decision.forwardToLeader)) {
        if (stryMutAct_9fa48("164362")) {
          {}
        } else {
          stryCov_9fa48("164362");
          this.logger.debug(WASM_SERVICE_LOG_MSG.READ_FORWARDED_TO_LEADER, stryMutAct_9fa48("164363") ? {} : (stryCov_9fa48("164363"), {
            replicaId: this.replicaId,
            leaderId: this.leaderId
          }));
          return stryMutAct_9fa48("164364") ? {} : (stryCov_9fa48("164364"), {
            forwarded: stryMutAct_9fa48("164365") ? false : (stryCov_9fa48("164365"), true),
            leaderId: this.leaderId
          });
        }
      }
      this.logger.debug(WASM_SERVICE_LOG_MSG.READ_SERVED_LOCALLY, stryMutAct_9fa48("164366") ? {} : (stryCov_9fa48("164366"), {
        replicaId: this.replicaId
      }));
      const value = this.kvStore.get(payload.sessionId, payload.key);
      return stryMutAct_9fa48("164367") ? {} : (stryCov_9fa48("164367"), {
        forwarded: stryMutAct_9fa48("164368") ? true : (stryCov_9fa48("164368"), false),
        value
      });
    }
  }

  /**
   * Handle a write request. Only the leader can accept writes.
   * For strong writes, waits for Raft commit. For async writes,
   * responds immediately after proposal.
   *
   * @param {Object} payload - Write request payload.
   * @return {Promise<Object>} Write result.
   * @private
   */
  async _handleWrite(payload) {
    if (stryMutAct_9fa48("164369")) {
      {}
    } else {
      stryCov_9fa48("164369");
      if (stryMutAct_9fa48("164372") ? false : stryMutAct_9fa48("164371") ? true : stryMutAct_9fa48("164370") ? this.isLeader : (stryCov_9fa48("164370", "164371", "164372"), !this.isLeader)) {
        if (stryMutAct_9fa48("164373")) {
          {}
        } else {
          stryCov_9fa48("164373");
          return stryMutAct_9fa48("164374") ? {} : (stryCov_9fa48("164374"), {
            forwarded: stryMutAct_9fa48("164375") ? false : (stryCov_9fa48("164375"), true),
            leaderId: this.leaderId
          });
        }
      }
      const entry = stryMutAct_9fa48("164376") ? {} : (stryCov_9fa48("164376"), {
        type: ENTRY_TYPE.KV_SET,
        sessionId: payload.sessionId,
        key: payload.key,
        value: payload.value
      });
      if (stryMutAct_9fa48("164379") ? this.writeConsistency !== WRITE_CONSISTENCY_MODE.ASYNC : stryMutAct_9fa48("164378") ? false : stryMutAct_9fa48("164377") ? true : (stryCov_9fa48("164377", "164378", "164379"), this.writeConsistency === WRITE_CONSISTENCY_MODE.ASYNC)) {
        if (stryMutAct_9fa48("164380")) {
          {}
        } else {
          stryCov_9fa48("164380");
          this.proposeEntry(entry);
          return stryMutAct_9fa48("164381") ? {} : (stryCov_9fa48("164381"), {
            accepted: stryMutAct_9fa48("164382") ? false : (stryCov_9fa48("164382"), true),
            async: stryMutAct_9fa48("164383") ? false : (stryCov_9fa48("164383"), true)
          });
        }
      }
      await this.proposeEntry(entry);
      return stryMutAct_9fa48("164384") ? {} : (stryCov_9fa48("164384"), {
        accepted: stryMutAct_9fa48("164385") ? false : (stryCov_9fa48("164385"), true),
        async: stryMutAct_9fa48("164386") ? true : (stryCov_9fa48("164386"), false)
      });
    }
  }

  /**
   * Propose an entry to the Raft log. Wraps the liferaft
   * command method in a Promise. Used by TimerManager and
   * write handling.
   *
   * @param {Object} entry - Entry to propose.
   * @return {Promise<void>}
   */
  proposeEntry(entry) {
    if (stryMutAct_9fa48("164387")) {
      {}
    } else {
      stryCov_9fa48("164387");
      if (stryMutAct_9fa48("164390") ? false : stryMutAct_9fa48("164389") ? true : stryMutAct_9fa48("164388") ? this.raft : (stryCov_9fa48("164388", "164389", "164390"), !this.raft)) {
        if (stryMutAct_9fa48("164391")) {
          {}
        } else {
          stryCov_9fa48("164391");
          return Promise.reject(new Error(WASM_SERVICE_ERROR_MSG.SERVICE_NOT_READY));
        }
      }
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("164392")) {
          {}
        } else {
          stryCov_9fa48("164392");
          this.raftProvider.propose(this.raft, entry, err => {
            if (stryMutAct_9fa48("164393")) {
              {}
            } else {
              stryCov_9fa48("164393");
              if (stryMutAct_9fa48("164395") ? false : stryMutAct_9fa48("164394") ? true : (stryCov_9fa48("164394", "164395"), err)) {
                if (stryMutAct_9fa48("164396")) {
                  {}
                } else {
                  stryCov_9fa48("164396");
                  reject(err);
                }
              } else {
                if (stryMutAct_9fa48("164397")) {
                  {}
                } else {
                  stryCov_9fa48("164397");
                  resolve();
                }
              }
            }
          });
        }
      });
    }
  }

  /**
   * Called when this replica becomes the Raft leader.
   * Reconstructs timers and starts safety interval broadcasts.
   */
  onBecameLeader() {
    if (stryMutAct_9fa48("164398")) {
      {}
    } else {
      stryCov_9fa48("164398");
      this.logger.info(WASM_SERVICE_LOG_MSG.BECAME_LEADER, stryMutAct_9fa48("164399") ? {} : (stryCov_9fa48("164399"), {
        replicaId: this.replicaId,
        serviceDefinitionId: this.serviceDefinitionId
      }));
      this.timerManager.reconstructTimers().then(count => {
        if (stryMutAct_9fa48("164400")) {
          {}
        } else {
          stryCov_9fa48("164400");
          this.logger.info(WASM_SERVICE_LOG_MSG.TIMER_RECONSTRUCTED, stryMutAct_9fa48("164401") ? {} : (stryCov_9fa48("164401"), {
            replicaId: this.replicaId,
            count
          }));
        }
      });
      this._startSafetyBroadcasts();
    }
  }

  /**
   * Called when this replica becomes a follower.
   * Stops all timers and safety interval broadcasts.
   */
  onBecameFollower() {
    if (stryMutAct_9fa48("164402")) {
      {}
    } else {
      stryCov_9fa48("164402");
      this.logger.info(WASM_SERVICE_LOG_MSG.LOST_LEADERSHIP, stryMutAct_9fa48("164403") ? {} : (stryCov_9fa48("164403"), {
        replicaId: this.replicaId,
        serviceDefinitionId: this.serviceDefinitionId
      }));
      this.timerManager.stopAll();
      this._stopSafetyBroadcasts();
    }
  }

  /**
   * Persist the raft role update to the services table.
   * Uses canonical owner callbacks (or CDC integration).
   * @return {Promise<void>}
   */
  async flushRoleUpdate() {
    if (stryMutAct_9fa48("164404")) {
      {}
    } else {
      stryCov_9fa48("164404");
      return this.roleMutationHelper.flush();
    }
  }

  /**
   * Persist the leader node update to the services table.
   * Uses canonical owner callbacks (or CDC integration).
   * @return {Promise<void>}
   */
  async flushLeaderNodeUpdate() {
    if (stryMutAct_9fa48("164405")) {
      {}
    } else {
      stryCov_9fa48("164405");
      return this.leaderNodeMutationHelper.flush();
    }
  }

  /**
   * Write raft role update through owner callback or CDC owner.
   * @param {string} role
   * @return {Promise<void>}
   * @private
   */
  async writeRoleUpdate(role, updatedAt = Date.now(), options = {}) {
    if (stryMutAct_9fa48("164406")) {
      {}
    } else {
      stryCov_9fa48("164406");
      const writerPayload = stryMutAct_9fa48("164407") ? {} : (stryCov_9fa48("164407"), {
        serviceId: this.replicaId,
        serviceDefinitionId: this.serviceDefinitionId,
        role,
        nodeId: this.nodeId,
        updatedAt
      });
      if (stryMutAct_9fa48("164410") ? this.roleUpdateWriter || typeof this.roleUpdateWriter === TYPEOF.FUNCTION : stryMutAct_9fa48("164409") ? false : stryMutAct_9fa48("164408") ? true : (stryCov_9fa48("164408", "164409", "164410"), this.roleUpdateWriter && (stryMutAct_9fa48("164412") ? typeof this.roleUpdateWriter !== TYPEOF.FUNCTION : stryMutAct_9fa48("164411") ? true : (stryCov_9fa48("164411", "164412"), typeof this.roleUpdateWriter === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("164413")) {
          {}
        } else {
          stryCov_9fa48("164413");
          await this.roleUpdateWriter(writerPayload);
          return stryMutAct_9fa48("164414") ? {} : (stryCov_9fa48("164414"), {
            success: stryMutAct_9fa48("164415") ? false : (stryCov_9fa48("164415"), true)
          });
        }
      }
      if (stryMutAct_9fa48("164418") ? false : stryMutAct_9fa48("164417") ? true : stryMutAct_9fa48("164416") ? this.cdcIntegrationService : (stryCov_9fa48("164416", "164417", "164418"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("164419")) {
          {}
        } else {
          stryCov_9fa48("164419");
          return stryMutAct_9fa48("164420") ? {} : (stryCov_9fa48("164420"), {
            success: stryMutAct_9fa48("164421") ? false : (stryCov_9fa48("164421"), true)
          });
        }
      }
      return this.controlPlaneSystemTableGateway.submitMutation(stryMutAct_9fa48("164422") ? {} : (stryCov_9fa48("164422"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: stryMutAct_9fa48("164423") ? {} : (stryCov_9fa48("164423"), {
          [COLUMN.SERVICE_ID]: this.replicaId
        }),
        data: stryMutAct_9fa48("164424") ? {} : (stryCov_9fa48("164424"), {
          [COLUMN.RAFT_ROLE]: role,
          [COLUMN.UPDATED_AT]: updatedAt
        })
      }), options);
    }
  }

  /**
   * Write leader-node update through owner callback or CDC owner.
   * @param {string} leaderNodeId
   * @return {Promise<void>}
   * @private
   */
  async writeLeaderNodeUpdate(leaderNodeId, updatedAt = Date.now(), role = this.role, options = {}) {
    if (stryMutAct_9fa48("164425")) {
      {}
    } else {
      stryCov_9fa48("164425");
      const writerPayload = stryMutAct_9fa48("164426") ? {} : (stryCov_9fa48("164426"), {
        serviceId: this.replicaId,
        serviceDefinitionId: this.serviceDefinitionId,
        leaderNodeId,
        role,
        nodeId: this.nodeId,
        updatedAt
      });
      if (stryMutAct_9fa48("164429") ? this.leaderNodeUpdateWriter || typeof this.leaderNodeUpdateWriter === TYPEOF.FUNCTION : stryMutAct_9fa48("164428") ? false : stryMutAct_9fa48("164427") ? true : (stryCov_9fa48("164427", "164428", "164429"), this.leaderNodeUpdateWriter && (stryMutAct_9fa48("164431") ? typeof this.leaderNodeUpdateWriter !== TYPEOF.FUNCTION : stryMutAct_9fa48("164430") ? true : (stryCov_9fa48("164430", "164431"), typeof this.leaderNodeUpdateWriter === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("164432")) {
          {}
        } else {
          stryCov_9fa48("164432");
          await this.leaderNodeUpdateWriter(writerPayload);
          return stryMutAct_9fa48("164433") ? {} : (stryCov_9fa48("164433"), {
            success: stryMutAct_9fa48("164434") ? false : (stryCov_9fa48("164434"), true)
          });
        }
      }
      if (stryMutAct_9fa48("164437") ? false : stryMutAct_9fa48("164436") ? true : stryMutAct_9fa48("164435") ? this.cdcIntegrationService : (stryCov_9fa48("164435", "164436", "164437"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("164438")) {
          {}
        } else {
          stryCov_9fa48("164438");
          return stryMutAct_9fa48("164439") ? {} : (stryCov_9fa48("164439"), {
            success: stryMutAct_9fa48("164440") ? false : (stryCov_9fa48("164440"), true)
          });
        }
      }
      return this.controlPlaneSystemTableGateway.submitMutation(stryMutAct_9fa48("164441") ? {} : (stryCov_9fa48("164441"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: stryMutAct_9fa48("164442") ? {} : (stryCov_9fa48("164442"), {
          [COLUMN.SERVICE_ID]: this.replicaId
        }),
        data: stryMutAct_9fa48("164443") ? {} : (stryCov_9fa48("164443"), {
          [COLUMN.NODE_ID]: leaderNodeId,
          [COLUMN.RAFT_ROLE]: role,
          [COLUMN.UPDATED_AT]: updatedAt
        })
      }), options);
    }
  }

  /**
   * Check whether services system table writes are routable.
   * @return {boolean}
   * @private
   */
  isServicesLeaderAvailable() {
    if (stryMutAct_9fa48("164444")) {
      {}
    } else {
      stryCov_9fa48("164444");
      return isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES);
    }
  }

  /**
   * Start periodic safety interval broadcasts. Only the
   * leader broadcasts its committed index and timestamp
   * so followers can serve strong reads.
   * @private
   */
  _startSafetyBroadcasts() {
    if (stryMutAct_9fa48("164445")) {
      {}
    } else {
      stryCov_9fa48("164445");
      this._stopSafetyBroadcasts();
      const intervalMs = this.safetyInterval.intervalMs;
      this._safetyBroadcastTimer = setInterval(() => {
        if (stryMutAct_9fa48("164446")) {
          {}
        } else {
          stryCov_9fa48("164446");
          const committedIndex = this.raftProvider.getCommittedIndex(this.raft);
          this.safetyInterval.broadcastState(committedIndex, Date.now());
          this.logger.debug(WASM_SERVICE_LOG_MSG.SAFETY_INTERVAL_BROADCAST, stryMutAct_9fa48("164447") ? {} : (stryCov_9fa48("164447"), {
            replicaId: this.replicaId,
            committedIndex
          }));
        }
      }, intervalMs);
    }
  }

  /**
   * Stop safety interval broadcasts.
   * @private
   */
  _stopSafetyBroadcasts() {
    if (stryMutAct_9fa48("164448")) {
      {}
    } else {
      stryCov_9fa48("164448");
      if (stryMutAct_9fa48("164450") ? false : stryMutAct_9fa48("164449") ? true : (stryCov_9fa48("164449", "164450"), this._safetyBroadcastTimer)) {
        if (stryMutAct_9fa48("164451")) {
          {}
        } else {
          stryCov_9fa48("164451");
          clearInterval(this._safetyBroadcastTimer);
          this._safetyBroadcastTimer = null;
        }
      }
    }
  }

  /**
   * Shutdown the replica. Stops timers, broadcasts, and
   * closes the KV store before calling the base shutdown.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("164452")) {
      {}
    } else {
      stryCov_9fa48("164452");
      this.timerManager.stopAll();
      this._stopSafetyBroadcasts();
      this.roleMutationHelper.shutdown();
      this.leaderNodeMutationHelper.shutdown();
      if (stryMutAct_9fa48("164454") ? false : stryMutAct_9fa48("164453") ? true : (stryCov_9fa48("164453", "164454"), this.kvStore)) {
        if (stryMutAct_9fa48("164455")) {
          {}
        } else {
          stryCov_9fa48("164455");
          this.kvStore.close();
          this.kvStore = null;
        }
      }
      await super.shutdown();
      this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STOPPED, stryMutAct_9fa48("164456") ? {} : (stryCov_9fa48("164456"), {
        replicaId: this.replicaId,
        serviceDefinitionId: this.serviceDefinitionId
      }));
    }
  }
}
export { WasmServiceReplica, ENTRY_TYPE, MESSAGE_OP };