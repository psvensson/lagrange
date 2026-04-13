/**
 * Preflight critical path snapshot building for the admin WebSocket API.
 *
 * This module owns all preflight critical-path diagnostics: node address
 * resolution, router connectivity, control-plane partition health, CDC
 * health, cache freshness, row counts, and discovery summary. The parent
 * AdminWebSocketAPI instantiates one AdminPreflightSnapshot and delegates
 * all preflight-related calls to it.
 *
 * Single-use helpers that exist only for preflight logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
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
import { COLUMN, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { CONNECTION_STATE } from '../constants/transport.js';
import { INITIAL_PARTITION_IDS } from '../bootstrap/system-table-schemas-constants.js';
import { META_SERVICE_ID } from '../constants/wasm-meta.js';
import { ADMIN_CACHE_DUMP, ADMIN_DEFAULT, ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT } from './admin-constants.js';
import { evaluateAuthoritativeRepairPolicy } from './admin-authoritative-repair-policy.js';
import { AUTHORITATIVE_DISCOVERY_REPAIR } from './admin-service-discovery.js';
import { firstStringField, normalizeSchemaVersionValue, uniqueSorted } from './admin-helpers.js';
import { evaluatePartitionReplicaTopology } from './admin-shared-metadata-consistency.js';

// ── file-local constants ────────────────────────────────────────────────────
const EMPTY_STRING = stryMutAct_9fa48("4243") ? "Stryker was here!" : (stryCov_9fa48("4243"), '');
const LEADER_RAFT_ROLE = stryMutAct_9fa48("4244") ? "" : (stryCov_9fa48("4244"), 'leader');
const SERVICE_TYPE_PARTITION = stryMutAct_9fa48("4245") ? "" : (stryCov_9fa48("4245"), 'partition');
const STATUS_ACTIVE = stryMutAct_9fa48("4246") ? "" : (stryCov_9fa48("4246"), 'active');
const PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS = 1000;
const PREFLIGHT_ERROR_CODE = Object.freeze(stryMutAct_9fa48("4247") ? {} : (stryCov_9fa48("4247"), {
  PARTITION_ID_UNKNOWN: stryMutAct_9fa48("4248") ? "" : (stryCov_9fa48("4248"), 'partition_id_unknown'),
  CACHE_UNAVAILABLE: stryMutAct_9fa48("4249") ? "" : (stryCov_9fa48("4249"), 'cache_unavailable'),
  PARTITION_ROW_MISSING: stryMutAct_9fa48("4250") ? "" : (stryCov_9fa48("4250"), 'partition_row_missing'),
  LEADER_SERVICE_MISSING: stryMutAct_9fa48("4251") ? "" : (stryCov_9fa48("4251"), 'leader_service_missing'),
  LEADER_NODE_ID_MISSING: stryMutAct_9fa48("4252") ? "" : (stryCov_9fa48("4252"), 'leader_node_id_missing')
}));
const PREFLIGHT_REPAIR_REASON = stryMutAct_9fa48("4253") ? "" : (stryCov_9fa48("4253"), 'preflight_critical_path_snapshot');

// ── AdminPreflightSnapshot class ────────────────────────────────────────────

/**
 * Preflight critical path snapshot builder.
 *
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (service discovery snapshot, authoritative repair)
 * are injected as functions so this module has no back-reference to
 * AdminWebSocketAPI.
 */
class AdminPreflightSnapshot {
  /**
   * @param {Object} deps
   * @param {Object} deps.systemTableCache
   * @param {string} deps.nodeId
   * @param {Object|null} deps.messageRouter
   * @param {Object|null} deps.cacheMutationTarget
   * @param {Object|null} deps.sqlQueryEngine
   * @param {Function|null} deps.buildLocalServiceDiscoverySnapshot
   * @param {Function|null} deps.ensureAuthoritativeDiscoveryCacheRepair
   * @param {Function|null} deps.buildControlPlaneDiagnosticsSnapshot
   */
  constructor(deps = {}) {
    if (stryMutAct_9fa48("4254")) {
      {}
    } else {
      stryCov_9fa48("4254");
      this.systemTableCache = stryMutAct_9fa48("4257") ? deps.systemTableCache && null : stryMutAct_9fa48("4256") ? false : stryMutAct_9fa48("4255") ? true : (stryCov_9fa48("4255", "4256", "4257"), deps.systemTableCache || null);
      this.nodeId = stryMutAct_9fa48("4260") ? deps.nodeId && null : stryMutAct_9fa48("4259") ? false : stryMutAct_9fa48("4258") ? true : (stryCov_9fa48("4258", "4259", "4260"), deps.nodeId || null);
      this.messageRouter = stryMutAct_9fa48("4263") ? deps.messageRouter && null : stryMutAct_9fa48("4262") ? false : stryMutAct_9fa48("4261") ? true : (stryCov_9fa48("4261", "4262", "4263"), deps.messageRouter || null);
      this.cacheMutationTarget = stryMutAct_9fa48("4266") ? deps.cacheMutationTarget && null : stryMutAct_9fa48("4265") ? false : stryMutAct_9fa48("4264") ? true : (stryCov_9fa48("4264", "4265", "4266"), deps.cacheMutationTarget || null);
      this.sqlQueryEngine = stryMutAct_9fa48("4269") ? deps.sqlQueryEngine && null : stryMutAct_9fa48("4268") ? false : stryMutAct_9fa48("4267") ? true : (stryCov_9fa48("4267", "4268", "4269"), deps.sqlQueryEngine || null);
      this.buildLocalServiceDiscoverySnapshot = (stryMutAct_9fa48("4272") ? typeof deps.buildLocalServiceDiscoverySnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("4271") ? false : stryMutAct_9fa48("4270") ? true : (stryCov_9fa48("4270", "4271", "4272"), typeof deps.buildLocalServiceDiscoverySnapshot === TYPEOF.FUNCTION)) ? deps.buildLocalServiceDiscoverySnapshot : null;
      this.ensureAuthoritativeDiscoveryCacheRepair = (stryMutAct_9fa48("4275") ? typeof deps.ensureAuthoritativeDiscoveryCacheRepair !== TYPEOF.FUNCTION : stryMutAct_9fa48("4274") ? false : stryMutAct_9fa48("4273") ? true : (stryCov_9fa48("4273", "4274", "4275"), typeof deps.ensureAuthoritativeDiscoveryCacheRepair === TYPEOF.FUNCTION)) ? deps.ensureAuthoritativeDiscoveryCacheRepair : null;
      this.buildControlPlaneDiagnosticsSnapshot = (stryMutAct_9fa48("4278") ? typeof deps.buildControlPlaneDiagnosticsSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("4277") ? false : stryMutAct_9fa48("4276") ? true : (stryCov_9fa48("4276", "4277", "4278"), typeof deps.buildControlPlaneDiagnosticsSnapshot === TYPEOF.FUNCTION)) ? deps.buildControlPlaneDiagnosticsSnapshot : null;
      this.authoritativeRepairWaitBudgetMs = (stryMutAct_9fa48("4281") ? Number.isFinite(deps.authoritativeRepairWaitBudgetMs) || deps.authoritativeRepairWaitBudgetMs > NUM.ZERO : stryMutAct_9fa48("4280") ? false : stryMutAct_9fa48("4279") ? true : (stryCov_9fa48("4279", "4280", "4281"), Number.isFinite(deps.authoritativeRepairWaitBudgetMs) && (stryMutAct_9fa48("4284") ? deps.authoritativeRepairWaitBudgetMs <= NUM.ZERO : stryMutAct_9fa48("4283") ? deps.authoritativeRepairWaitBudgetMs >= NUM.ZERO : stryMutAct_9fa48("4282") ? true : (stryCov_9fa48("4282", "4283", "4284"), deps.authoritativeRepairWaitBudgetMs > NUM.ZERO)))) ? Math.floor(deps.authoritativeRepairWaitBudgetMs) : PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS;
    }
  }

  /**
   * Build bounded preflight critical-path snapshot from node-local
   * diagnostics.
   * @return {Object}
   */
  async buildLocalPreflightCriticalPathSnapshot() {
    if (stryMutAct_9fa48("4285")) {
      {}
    } else {
      stryCov_9fa48("4285");
      const capturedAtMs = Date.now();
      const nodeAddress = this.resolvePreflightSnapshotNodeAddress();
      const routerConnectivity = this.buildPreflightRouterConnectivitySummary();
      const controlPlanePartitions = this.buildPreflightControlPlanePartitionsSummary();
      const cdcHealth = this.buildPreflightCdcHealthSummary();
      const cacheFreshness = this.buildPreflightCacheFreshnessSummary(stryMutAct_9fa48("4286") ? {} : (stryCov_9fa48("4286"), {
        capturedAtMs
      }));
      const rowCounts = this.buildPreflightRowCountsSummary();
      const discovery = this.buildPreflightDiscoverySummary();
      const controlPlaneDiagnostics = await this.resolveControlPlaneDiagnosticsSnapshot();
      return stryMutAct_9fa48("4287") ? {} : (stryCov_9fa48("4287"), {
        schemaVersion: ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.SCHEMA_VERSION,
        capturedAtMs,
        nodeId: this.nodeId,
        address: nodeAddress,
        routerConnectivity,
        controlPlanePartitions,
        cdcHealth,
        cacheFreshness,
        rowCounts,
        discovery,
        controlPlaneDiagnostics
      });
    }
  }

  /**
   * Resolve local preflight critical-path snapshot with bounded
   * authoritative repair.
   * @return {Promise<Object>}
   */
  async resolvePreflightCriticalPathSnapshot() {
    if (stryMutAct_9fa48("4288")) {
      {}
    } else {
      stryCov_9fa48("4288");
      const snapshot = await this.buildLocalPreflightCriticalPathSnapshot();
      const repairEvaluation = this.evaluateAuthoritativePreflightRepair(snapshot);
      if (stryMutAct_9fa48("4291") ? repairEvaluation?.shouldRepair === true : stryMutAct_9fa48("4290") ? false : stryMutAct_9fa48("4289") ? true : (stryCov_9fa48("4289", "4290", "4291"), (stryMutAct_9fa48("4292") ? repairEvaluation.shouldRepair : (stryCov_9fa48("4292"), repairEvaluation?.shouldRepair)) !== (stryMutAct_9fa48("4293") ? false : (stryCov_9fa48("4293"), true)))) {
        if (stryMutAct_9fa48("4294")) {
          {}
        } else {
          stryCov_9fa48("4294");
          return snapshot;
        }
      }
      if (stryMutAct_9fa48("4297") ? false : stryMutAct_9fa48("4296") ? true : stryMutAct_9fa48("4295") ? this.ensureAuthoritativeDiscoveryCacheRepair : (stryCov_9fa48("4295", "4296", "4297"), !this.ensureAuthoritativeDiscoveryCacheRepair)) {
        if (stryMutAct_9fa48("4298")) {
          {}
        } else {
          stryCov_9fa48("4298");
          return snapshot;
        }
      }
      const repair = await this.awaitAuthoritativeRepairWithinBudget(this.ensureAuthoritativeDiscoveryCacheRepair(stryMutAct_9fa48("4299") ? {} : (stryCov_9fa48("4299"), {
        reason: PREFLIGHT_REPAIR_REASON,
        triggerCodes: repairEvaluation.triggerCodes
      })));
      if (stryMutAct_9fa48("4302") ? repair.applied === true : stryMutAct_9fa48("4301") ? false : stryMutAct_9fa48("4300") ? true : (stryCov_9fa48("4300", "4301", "4302"), repair.applied !== (stryMutAct_9fa48("4303") ? false : (stryCov_9fa48("4303"), true)))) {
        if (stryMutAct_9fa48("4304")) {
          {}
        } else {
          stryCov_9fa48("4304");
          return snapshot;
        }
      }
      return this.buildLocalPreflightCriticalPathSnapshot();
    }
  }

  /**
   * Resolve canonical control-plane diagnostics for preflight snapshots.
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveControlPlaneDiagnosticsSnapshot() {
    if (stryMutAct_9fa48("4305")) {
      {}
    } else {
      stryCov_9fa48("4305");
      if (stryMutAct_9fa48("4308") ? false : stryMutAct_9fa48("4307") ? true : stryMutAct_9fa48("4306") ? this.buildControlPlaneDiagnosticsSnapshot : (stryCov_9fa48("4306", "4307", "4308"), !this.buildControlPlaneDiagnosticsSnapshot)) {
        if (stryMutAct_9fa48("4309")) {
          {}
        } else {
          stryCov_9fa48("4309");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("4310")) {
          {}
        } else {
          stryCov_9fa48("4310");
          const diagnostics = await this.buildControlPlaneDiagnosticsSnapshot();
          return (stryMutAct_9fa48("4313") ? diagnostics || typeof diagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("4312") ? false : stryMutAct_9fa48("4311") ? true : (stryCov_9fa48("4311", "4312", "4313"), diagnostics && (stryMutAct_9fa48("4315") ? typeof diagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("4314") ? true : (stryCov_9fa48("4314", "4315"), typeof diagnostics === TYPEOF.OBJECT)))) ? diagnostics : null;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("4316")) {
          {}
        } else {
          stryCov_9fa48("4316");
          return null;
        }
      }
    }
  }

  /**
   * Wait for authoritative repair only within the preflight budget.
   * Preflight diagnostics must not block on expensive cache repair.
   * @param {Promise<Object>} repairPromise
   * @return {Promise<Object>}
   * @private
   */
  async awaitAuthoritativeRepairWithinBudget(repairPromise) {
    if (stryMutAct_9fa48("4317")) {
      {}
    } else {
      stryCov_9fa48("4317");
      const waitBudgetMs = this.authoritativeRepairWaitBudgetMs;
      const wrappedRepairPromise = Promise.resolve(repairPromise).then(stryMutAct_9fa48("4318") ? () => undefined : (stryCov_9fa48("4318"), repair => stryMutAct_9fa48("4319") ? {} : (stryCov_9fa48("4319"), {
        kind: stryMutAct_9fa48("4320") ? "" : (stryCov_9fa48("4320"), 'repair'),
        repair
      }))).catch(stryMutAct_9fa48("4321") ? () => undefined : (stryCov_9fa48("4321"), () => stryMutAct_9fa48("4322") ? {} : (stryCov_9fa48("4322"), {
        kind: stryMutAct_9fa48("4323") ? "" : (stryCov_9fa48("4323"), 'repair'),
        repair: stryMutAct_9fa48("4324") ? {} : (stryCov_9fa48("4324"), {
          applied: stryMutAct_9fa48("4325") ? true : (stryCov_9fa48("4325"), false),
          skipped: stryMutAct_9fa48("4326") ? false : (stryCov_9fa48("4326"), true),
          tableCount: NUM.ZERO
        })
      })));
      const timeoutResult = stryMutAct_9fa48("4327") ? {} : (stryCov_9fa48("4327"), {
        kind: stryMutAct_9fa48("4328") ? "" : (stryCov_9fa48("4328"), 'timeout'),
        repair: stryMutAct_9fa48("4329") ? {} : (stryCov_9fa48("4329"), {
          applied: stryMutAct_9fa48("4330") ? true : (stryCov_9fa48("4330"), false),
          skipped: stryMutAct_9fa48("4331") ? false : (stryCov_9fa48("4331"), true),
          tableCount: NUM.ZERO
        })
      });
      if (stryMutAct_9fa48("4334") ? !Number.isFinite(waitBudgetMs) && waitBudgetMs <= NUM.ZERO : stryMutAct_9fa48("4333") ? false : stryMutAct_9fa48("4332") ? true : (stryCov_9fa48("4332", "4333", "4334"), (stryMutAct_9fa48("4335") ? Number.isFinite(waitBudgetMs) : (stryCov_9fa48("4335"), !Number.isFinite(waitBudgetMs))) || (stryMutAct_9fa48("4338") ? waitBudgetMs > NUM.ZERO : stryMutAct_9fa48("4337") ? waitBudgetMs < NUM.ZERO : stryMutAct_9fa48("4336") ? false : (stryCov_9fa48("4336", "4337", "4338"), waitBudgetMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("4339")) {
          {}
        } else {
          stryCov_9fa48("4339");
          const result = await wrappedRepairPromise;
          return result.repair;
        }
      }
      let timeoutHandle = null;
      try {
        if (stryMutAct_9fa48("4340")) {
          {}
        } else {
          stryCov_9fa48("4340");
          const timeoutPromise = new Promise(resolve => {
            if (stryMutAct_9fa48("4341")) {
              {}
            } else {
              stryCov_9fa48("4341");
              timeoutHandle = setTimeout(stryMutAct_9fa48("4342") ? () => undefined : (stryCov_9fa48("4342"), () => resolve(timeoutResult)), waitBudgetMs);
            }
          });
          const result = await Promise.race(stryMutAct_9fa48("4343") ? [] : (stryCov_9fa48("4343"), [wrappedRepairPromise, timeoutPromise]));
          return result.repair;
        }
      } finally {
        if (stryMutAct_9fa48("4344")) {
          {}
        } else {
          stryCov_9fa48("4344");
          if (stryMutAct_9fa48("4346") ? false : stryMutAct_9fa48("4345") ? true : (stryCov_9fa48("4345", "4346"), timeoutHandle)) {
            if (stryMutAct_9fa48("4347")) {
              {}
            } else {
              stryCov_9fa48("4347");
              clearTimeout(timeoutHandle);
            }
          }
        }
      }
    }
  }

  /**
   * Determine whether preflight snapshot warrants authoritative cache
   * repair.
   * @param {Object} snapshot
   * @return {boolean}
   */
  shouldAttemptAuthoritativePreflightRepair(snapshot) {
    if (stryMutAct_9fa48("4348")) {
      {}
    } else {
      stryCov_9fa48("4348");
      return stryMutAct_9fa48("4351") ? this.evaluateAuthoritativePreflightRepair(snapshot)?.shouldRepair !== true : stryMutAct_9fa48("4350") ? false : stryMutAct_9fa48("4349") ? true : (stryCov_9fa48("4349", "4350", "4351"), (stryMutAct_9fa48("4352") ? this.evaluateAuthoritativePreflightRepair(snapshot).shouldRepair : (stryCov_9fa48("4352"), this.evaluateAuthoritativePreflightRepair(snapshot)?.shouldRepair)) === (stryMutAct_9fa48("4353") ? false : (stryCov_9fa48("4353"), true)));
    }
  }

  /**
   * Determine whether preflight snapshot warrants authoritative cache
   * repair.
   * @param {Object} snapshot
   * @return {Object|null}
   */
  evaluateAuthoritativePreflightRepair(snapshot) {
    if (stryMutAct_9fa48("4354")) {
      {}
    } else {
      stryCov_9fa48("4354");
      if (stryMutAct_9fa48("4357") ? (!this.systemTableCache || !this.cacheMutationTarget || typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION || !this.sqlQueryEngine) && typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION : stryMutAct_9fa48("4356") ? false : stryMutAct_9fa48("4355") ? true : (stryCov_9fa48("4355", "4356", "4357"), (stryMutAct_9fa48("4359") ? (!this.systemTableCache || !this.cacheMutationTarget || typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION) && !this.sqlQueryEngine : stryMutAct_9fa48("4358") ? false : (stryCov_9fa48("4358", "4359"), (stryMutAct_9fa48("4361") ? (!this.systemTableCache || !this.cacheMutationTarget) && typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("4360") ? false : (stryCov_9fa48("4360", "4361"), (stryMutAct_9fa48("4363") ? !this.systemTableCache && !this.cacheMutationTarget : stryMutAct_9fa48("4362") ? false : (stryCov_9fa48("4362", "4363"), (stryMutAct_9fa48("4364") ? this.systemTableCache : (stryCov_9fa48("4364"), !this.systemTableCache)) || (stryMutAct_9fa48("4365") ? this.cacheMutationTarget : (stryCov_9fa48("4365"), !this.cacheMutationTarget)))) || (stryMutAct_9fa48("4367") ? typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("4366") ? false : (stryCov_9fa48("4366", "4367"), typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("4368") ? this.sqlQueryEngine : (stryCov_9fa48("4368"), !this.sqlQueryEngine)))) || (stryMutAct_9fa48("4370") ? typeof this.sqlQueryEngine.executeRequest === TYPEOF.FUNCTION : stryMutAct_9fa48("4369") ? false : (stryCov_9fa48("4369", "4370"), typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("4371")) {
          {}
        } else {
          stryCov_9fa48("4371");
          return null;
        }
      }
      const selectedNodeIds = Array.isArray(stryMutAct_9fa48("4373") ? snapshot.discovery?.selectedNodeIds : stryMutAct_9fa48("4372") ? snapshot?.discovery.selectedNodeIds : (stryCov_9fa48("4372", "4373"), snapshot?.discovery?.selectedNodeIds)) ? snapshot.discovery.selectedNodeIds : ADMIN_CACHE_DUMP.EMPTY;
      const serviceEndpointsCount = Number(stryMutAct_9fa48("4375") ? snapshot.rowCounts?.serviceEndpointsCount : stryMutAct_9fa48("4374") ? snapshot?.rowCounts.serviceEndpointsCount : (stryCov_9fa48("4374", "4375"), snapshot?.rowCounts?.serviceEndpointsCount));
      const stalenessMs = Number(stryMutAct_9fa48("4377") ? snapshot.cacheFreshness?.stalenessMs : stryMutAct_9fa48("4376") ? snapshot?.cacheFreshness.stalenessMs : (stryCov_9fa48("4376", "4377"), snapshot?.cacheFreshness?.stalenessMs));
      const evaluation = evaluateAuthoritativeRepairPolicy(stryMutAct_9fa48("4378") ? {} : (stryCov_9fa48("4378"), {
        cacheStalenessMs: stalenessMs,
        staleThresholdMs: AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS,
        selectedNodeCount: selectedNodeIds.length,
        serviceEndpointsCount
      }));
      return evaluation;
    }
  }

  /**
   * Resolve best-effort node address for preflight snapshots.
   * @return {string}
   */
  resolvePreflightSnapshotNodeAddress() {
    if (stryMutAct_9fa48("4379")) {
      {}
    } else {
      stryCov_9fa48("4379");
      const routerAddress = (stryMutAct_9fa48("4382") ? typeof this.messageRouter?.nodeAddress !== TYPEOF.STRING : stryMutAct_9fa48("4381") ? false : stryMutAct_9fa48("4380") ? true : (stryCov_9fa48("4380", "4381", "4382"), typeof (stryMutAct_9fa48("4383") ? this.messageRouter.nodeAddress : (stryCov_9fa48("4383"), this.messageRouter?.nodeAddress)) === TYPEOF.STRING)) ? this.messageRouter.nodeAddress : null;
      if (stryMutAct_9fa48("4385") ? false : stryMutAct_9fa48("4384") ? true : (stryCov_9fa48("4384", "4385"), routerAddress)) {
        if (stryMutAct_9fa48("4386")) {
          {}
        } else {
          stryCov_9fa48("4386");
          return routerAddress;
        }
      }
      if (stryMutAct_9fa48("4389") ? this.systemTableCache || typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("4388") ? false : stryMutAct_9fa48("4387") ? true : (stryCov_9fa48("4387", "4388", "4389"), this.systemTableCache && (stryMutAct_9fa48("4391") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("4390") ? true : (stryCov_9fa48("4390", "4391"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("4392")) {
          {}
        } else {
          stryCov_9fa48("4392");
          const nodes = this.systemTableCache.getAll(TABLES.NODES);
          const localRow = nodes.find(stryMutAct_9fa48("4393") ? () => undefined : (stryCov_9fa48("4393"), row => stryMutAct_9fa48("4396") ? firstStringField(row, COLUMN.NODE_ID, 'id') !== this.nodeId : stryMutAct_9fa48("4395") ? false : stryMutAct_9fa48("4394") ? true : (stryCov_9fa48("4394", "4395", "4396"), firstStringField(row, COLUMN.NODE_ID, stryMutAct_9fa48("4397") ? "" : (stryCov_9fa48("4397"), 'id')) === this.nodeId)));
          const address = firstStringField(localRow, COLUMN.NODE_ADDRESS, stryMutAct_9fa48("4398") ? "" : (stryCov_9fa48("4398"), 'address'));
          if (stryMutAct_9fa48("4400") ? false : stryMutAct_9fa48("4399") ? true : (stryCov_9fa48("4399", "4400"), address)) {
            if (stryMutAct_9fa48("4401")) {
              {}
            } else {
              stryCov_9fa48("4401");
              return address;
            }
          }
        }
      }
      return stryMutAct_9fa48("4404") ? this.nodeId && ADMIN_DEFAULT.NODE_ID : stryMutAct_9fa48("4403") ? false : stryMutAct_9fa48("4402") ? true : (stryCov_9fa48("4402", "4403", "4404"), this.nodeId || ADMIN_DEFAULT.NODE_ID);
    }
  }

  /**
   * Summarize message-router connectivity by coarse state buckets.
   * @return {Object}
   */
  buildPreflightRouterConnectivitySummary() {
    if (stryMutAct_9fa48("4405")) {
      {}
    } else {
      stryCov_9fa48("4405");
      const defaultSummary = stryMutAct_9fa48("4406") ? {} : (stryCov_9fa48("4406"), {
        connectedCount: NUM.ZERO,
        reconnectingCount: NUM.ZERO,
        disconnectedCount: NUM.ZERO
      });
      if (stryMutAct_9fa48("4409") ? !this.messageRouter && typeof this.messageRouter.getStats !== TYPEOF.FUNCTION : stryMutAct_9fa48("4408") ? false : stryMutAct_9fa48("4407") ? true : (stryCov_9fa48("4407", "4408", "4409"), (stryMutAct_9fa48("4410") ? this.messageRouter : (stryCov_9fa48("4410"), !this.messageRouter)) || (stryMutAct_9fa48("4412") ? typeof this.messageRouter.getStats === TYPEOF.FUNCTION : stryMutAct_9fa48("4411") ? false : (stryCov_9fa48("4411", "4412"), typeof this.messageRouter.getStats !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("4413")) {
          {}
        } else {
          stryCov_9fa48("4413");
          return defaultSummary;
        }
      }
      const stats = this.messageRouter.getStats();
      const connections = (stryMutAct_9fa48("4416") ? stats?.connections || typeof stats.connections === TYPEOF.OBJECT : stryMutAct_9fa48("4415") ? false : stryMutAct_9fa48("4414") ? true : (stryCov_9fa48("4414", "4415", "4416"), (stryMutAct_9fa48("4417") ? stats.connections : (stryCov_9fa48("4417"), stats?.connections)) && (stryMutAct_9fa48("4419") ? typeof stats.connections !== TYPEOF.OBJECT : stryMutAct_9fa48("4418") ? true : (stryCov_9fa48("4418", "4419"), typeof stats.connections === TYPEOF.OBJECT)))) ? stats.connections : {};
      let connectedCount = NUM.ZERO;
      let reconnectingCount = NUM.ZERO;
      let disconnectedCount = NUM.ZERO;
      for (const [nodeId, info] of Object.entries(connections)) {
        if (stryMutAct_9fa48("4420")) {
          {}
        } else {
          stryCov_9fa48("4420");
          if (stryMutAct_9fa48("4423") ? !nodeId && nodeId === this.nodeId : stryMutAct_9fa48("4422") ? false : stryMutAct_9fa48("4421") ? true : (stryCov_9fa48("4421", "4422", "4423"), (stryMutAct_9fa48("4424") ? nodeId : (stryCov_9fa48("4424"), !nodeId)) || (stryMutAct_9fa48("4426") ? nodeId !== this.nodeId : stryMutAct_9fa48("4425") ? false : (stryCov_9fa48("4425", "4426"), nodeId === this.nodeId)))) {
            if (stryMutAct_9fa48("4427")) {
              {}
            } else {
              stryCov_9fa48("4427");
              continue;
            }
          }
          const state = stryMutAct_9fa48("4429") ? String(info?.state || EMPTY_STRING).toLowerCase() : stryMutAct_9fa48("4428") ? String(info?.state || EMPTY_STRING).trim().toUpperCase() : (stryCov_9fa48("4428", "4429"), String(stryMutAct_9fa48("4432") ? info?.state && EMPTY_STRING : stryMutAct_9fa48("4431") ? false : stryMutAct_9fa48("4430") ? true : (stryCov_9fa48("4430", "4431", "4432"), (stryMutAct_9fa48("4433") ? info.state : (stryCov_9fa48("4433"), info?.state)) || EMPTY_STRING)).trim().toLowerCase());
          if (stryMutAct_9fa48("4436") ? state !== CONNECTION_STATE.CONNECTED : stryMutAct_9fa48("4435") ? false : stryMutAct_9fa48("4434") ? true : (stryCov_9fa48("4434", "4435", "4436"), state === CONNECTION_STATE.CONNECTED)) {
            if (stryMutAct_9fa48("4437")) {
              {}
            } else {
              stryCov_9fa48("4437");
              stryMutAct_9fa48("4438") ? connectedCount -= NUM.ONE : (stryCov_9fa48("4438"), connectedCount += NUM.ONE);
            }
          } else if (stryMutAct_9fa48("4441") ? state !== CONNECTION_STATE.RECONNECTING : stryMutAct_9fa48("4440") ? false : stryMutAct_9fa48("4439") ? true : (stryCov_9fa48("4439", "4440", "4441"), state === CONNECTION_STATE.RECONNECTING)) {
            if (stryMutAct_9fa48("4442")) {
              {}
            } else {
              stryCov_9fa48("4442");
              stryMutAct_9fa48("4443") ? reconnectingCount -= NUM.ONE : (stryCov_9fa48("4443"), reconnectingCount += NUM.ONE);
            }
          } else {
            if (stryMutAct_9fa48("4444")) {
              {}
            } else {
              stryCov_9fa48("4444");
              stryMutAct_9fa48("4445") ? disconnectedCount -= NUM.ONE : (stryCov_9fa48("4445"), disconnectedCount += NUM.ONE);
            }
          }
        }
      }
      return stryMutAct_9fa48("4446") ? {} : (stryCov_9fa48("4446"), {
        connectedCount,
        reconnectingCount,
        disconnectedCount
      });
    }
  }

  /**
   * Summarize leadership/health for control-plane partitions required
   * for discovery.
   * @return {Object}
   */
  buildPreflightControlPlanePartitionsSummary() {
    if (stryMutAct_9fa48("4447")) {
      {}
    } else {
      stryCov_9fa48("4447");
      const partitionTables = stryMutAct_9fa48("4448") ? [] : (stryCov_9fa48("4448"), [TABLES.NODES, TABLES.SERVICES, TABLES.NODE_ENDPOINTS, TABLES.SERVICE_ENDPOINTS]);
      const summary = {};
      for (const tableName of partitionTables) {
        if (stryMutAct_9fa48("4449")) {
          {}
        } else {
          stryCov_9fa48("4449");
          summary[tableName] = this.buildPreflightControlPlanePartitionEntry(tableName);
        }
      }
      return summary;
    }
  }

  /**
   * Build a single control-plane partition entry.
   * @param {string} tableName
   * @return {Object}
   */
  buildPreflightControlPlanePartitionEntry(tableName) {
    if (stryMutAct_9fa48("4450")) {
      {}
    } else {
      stryCov_9fa48("4450");
      const partitionId = stryMutAct_9fa48("4453") ? INITIAL_PARTITION_IDS[tableName] && null : stryMutAct_9fa48("4452") ? false : stryMutAct_9fa48("4451") ? true : (stryCov_9fa48("4451", "4452", "4453"), INITIAL_PARTITION_IDS[tableName] || null);
      if (stryMutAct_9fa48("4456") ? false : stryMutAct_9fa48("4455") ? true : stryMutAct_9fa48("4454") ? partitionId : (stryCov_9fa48("4454", "4455", "4456"), !partitionId)) {
        if (stryMutAct_9fa48("4457")) {
          {}
        } else {
          stryCov_9fa48("4457");
          return stryMutAct_9fa48("4458") ? {} : (stryCov_9fa48("4458"), {
            leaderKnown: stryMutAct_9fa48("4459") ? true : (stryCov_9fa48("4459"), false),
            leaderNodeId: null,
            isLeaderLocal: stryMutAct_9fa48("4460") ? true : (stryCov_9fa48("4460"), false),
            lastErrorCode: PREFLIGHT_ERROR_CODE.PARTITION_ID_UNKNOWN
          });
        }
      }
      if (stryMutAct_9fa48("4463") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("4462") ? false : stryMutAct_9fa48("4461") ? true : (stryCov_9fa48("4461", "4462", "4463"), (stryMutAct_9fa48("4464") ? this.systemTableCache : (stryCov_9fa48("4464"), !this.systemTableCache)) || (stryMutAct_9fa48("4466") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("4465") ? false : (stryCov_9fa48("4465", "4466"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("4467")) {
          {}
        } else {
          stryCov_9fa48("4467");
          return stryMutAct_9fa48("4468") ? {} : (stryCov_9fa48("4468"), {
            leaderKnown: stryMutAct_9fa48("4469") ? true : (stryCov_9fa48("4469"), false),
            leaderNodeId: null,
            isLeaderLocal: stryMutAct_9fa48("4470") ? true : (stryCov_9fa48("4470"), false),
            lastErrorCode: PREFLIGHT_ERROR_CODE.CACHE_UNAVAILABLE
          });
        }
      }
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const partitionRow = partitionRows.find(stryMutAct_9fa48("4471") ? () => undefined : (stryCov_9fa48("4471"), row => stryMutAct_9fa48("4474") ? row?.[COLUMN.PARTITION_ID] !== partitionId : stryMutAct_9fa48("4473") ? false : stryMutAct_9fa48("4472") ? true : (stryCov_9fa48("4472", "4473", "4474"), (stryMutAct_9fa48("4475") ? row[COLUMN.PARTITION_ID] : (stryCov_9fa48("4475"), row?.[COLUMN.PARTITION_ID])) === partitionId)));
      if (stryMutAct_9fa48("4478") ? false : stryMutAct_9fa48("4477") ? true : stryMutAct_9fa48("4476") ? partitionRow : (stryCov_9fa48("4476", "4477", "4478"), !partitionRow)) {
        if (stryMutAct_9fa48("4479")) {
          {}
        } else {
          stryCov_9fa48("4479");
          return stryMutAct_9fa48("4480") ? {} : (stryCov_9fa48("4480"), {
            leaderKnown: stryMutAct_9fa48("4481") ? true : (stryCov_9fa48("4481"), false),
            leaderNodeId: null,
            isLeaderLocal: stryMutAct_9fa48("4482") ? true : (stryCov_9fa48("4482"), false),
            lastErrorCode: PREFLIGHT_ERROR_CODE.PARTITION_ROW_MISSING
          });
        }
      }
      const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
      const requiresAddress = stryMutAct_9fa48("4485") ? tableName === TABLES.SERVICES : stryMutAct_9fa48("4484") ? false : stryMutAct_9fa48("4483") ? true : (stryCov_9fa48("4483", "4484", "4485"), tableName !== TABLES.SERVICES);
      const canonicalLeaderNodeId = firstStringField(partitionRow, COLUMN.LEADER_NODE_ID, stryMutAct_9fa48("4486") ? "" : (stryCov_9fa48("4486"), 'leader_node_id'), stryMutAct_9fa48("4487") ? "" : (stryCov_9fa48("4487"), 'leaderNodeId'));
      const partitionTopology = evaluatePartitionReplicaTopology(stryMutAct_9fa48("4488") ? {} : (stryCov_9fa48("4488"), {
        partitionRow,
        serviceRows,
        requiresAddress,
        requireLeaderNodeId: stryMutAct_9fa48("4489") ? true : (stryCov_9fa48("4489"), false)
      }));
      if (stryMutAct_9fa48("4492") ? partitionTopology.leaderKnown === true : stryMutAct_9fa48("4491") ? false : stryMutAct_9fa48("4490") ? true : (stryCov_9fa48("4490", "4491", "4492"), partitionTopology.leaderKnown !== (stryMutAct_9fa48("4493") ? false : (stryCov_9fa48("4493"), true)))) {
        if (stryMutAct_9fa48("4494")) {
          {}
        } else {
          stryCov_9fa48("4494");
          return stryMutAct_9fa48("4495") ? {} : (stryCov_9fa48("4495"), {
            leaderKnown: stryMutAct_9fa48("4496") ? true : (stryCov_9fa48("4496"), false),
            leaderNodeId: null,
            isLeaderLocal: stryMutAct_9fa48("4497") ? true : (stryCov_9fa48("4497"), false),
            lastErrorCode: PREFLIGHT_ERROR_CODE.LEADER_SERVICE_MISSING
          });
        }
      }
      const leaderNodeId = stryMutAct_9fa48("4500") ? (canonicalLeaderNodeId || partitionTopology.leaderRoleNodeIds[NUM.ZERO]) && null : stryMutAct_9fa48("4499") ? false : stryMutAct_9fa48("4498") ? true : (stryCov_9fa48("4498", "4499", "4500"), (stryMutAct_9fa48("4502") ? canonicalLeaderNodeId && partitionTopology.leaderRoleNodeIds[NUM.ZERO] : stryMutAct_9fa48("4501") ? false : (stryCov_9fa48("4501", "4502"), canonicalLeaderNodeId || partitionTopology.leaderRoleNodeIds[NUM.ZERO])) || null);
      if (stryMutAct_9fa48("4505") ? false : stryMutAct_9fa48("4504") ? true : stryMutAct_9fa48("4503") ? leaderNodeId : (stryCov_9fa48("4503", "4504", "4505"), !leaderNodeId)) {
        if (stryMutAct_9fa48("4506")) {
          {}
        } else {
          stryCov_9fa48("4506");
          return stryMutAct_9fa48("4507") ? {} : (stryCov_9fa48("4507"), {
            leaderKnown: stryMutAct_9fa48("4508") ? true : (stryCov_9fa48("4508"), false),
            leaderNodeId: null,
            isLeaderLocal: stryMutAct_9fa48("4509") ? true : (stryCov_9fa48("4509"), false),
            lastErrorCode: PREFLIGHT_ERROR_CODE.LEADER_NODE_ID_MISSING
          });
        }
      }
      return stryMutAct_9fa48("4510") ? {} : (stryCov_9fa48("4510"), {
        leaderKnown: stryMutAct_9fa48("4511") ? false : (stryCov_9fa48("4511"), true),
        leaderNodeId,
        isLeaderLocal: stryMutAct_9fa48("4514") ? leaderNodeId !== this.nodeId : stryMutAct_9fa48("4513") ? false : stryMutAct_9fa48("4512") ? true : (stryCov_9fa48("4512", "4513", "4514"), leaderNodeId === this.nodeId),
        lastErrorCode: null
      });
    }
  }

  /**
   * Summarize CDC/mutation pipeline health.
   * @return {Object}
   */
  buildPreflightCdcHealthSummary() {
    if (stryMutAct_9fa48("4515")) {
      {}
    } else {
      stryCov_9fa48("4515");
      let bufferDepth = NUM.ZERO;
      let retryCount = NUM.ZERO;
      if (stryMutAct_9fa48("4518") ? this.messageRouter || typeof this.messageRouter.getStats === TYPEOF.FUNCTION : stryMutAct_9fa48("4517") ? false : stryMutAct_9fa48("4516") ? true : (stryCov_9fa48("4516", "4517", "4518"), this.messageRouter && (stryMutAct_9fa48("4520") ? typeof this.messageRouter.getStats !== TYPEOF.FUNCTION : stryMutAct_9fa48("4519") ? true : (stryCov_9fa48("4519", "4520"), typeof this.messageRouter.getStats === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("4521")) {
          {}
        } else {
          stryCov_9fa48("4521");
          const stats = this.messageRouter.getStats();
          const outboundQueues = (stryMutAct_9fa48("4524") ? stats?.outboundQueues || typeof stats.outboundQueues === TYPEOF.OBJECT : stryMutAct_9fa48("4523") ? false : stryMutAct_9fa48("4522") ? true : (stryCov_9fa48("4522", "4523", "4524"), (stryMutAct_9fa48("4525") ? stats.outboundQueues : (stryCov_9fa48("4525"), stats?.outboundQueues)) && (stryMutAct_9fa48("4527") ? typeof stats.outboundQueues !== TYPEOF.OBJECT : stryMutAct_9fa48("4526") ? true : (stryCov_9fa48("4526", "4527"), typeof stats.outboundQueues === TYPEOF.OBJECT)))) ? stats.outboundQueues : {};
          for (const queue of Object.values(outboundQueues)) {
            if (stryMutAct_9fa48("4528")) {
              {}
            } else {
              stryCov_9fa48("4528");
              stryMutAct_9fa48("4529") ? bufferDepth -= Number(queue?.pending || NUM.ZERO) : (stryCov_9fa48("4529"), bufferDepth += Number(stryMutAct_9fa48("4532") ? queue?.pending && NUM.ZERO : stryMutAct_9fa48("4531") ? false : stryMutAct_9fa48("4530") ? true : (stryCov_9fa48("4530", "4531", "4532"), (stryMutAct_9fa48("4533") ? queue.pending : (stryCov_9fa48("4533"), queue?.pending)) || NUM.ZERO)));
            }
          }
          const connections = (stryMutAct_9fa48("4536") ? stats?.connections || typeof stats.connections === TYPEOF.OBJECT : stryMutAct_9fa48("4535") ? false : stryMutAct_9fa48("4534") ? true : (stryCov_9fa48("4534", "4535", "4536"), (stryMutAct_9fa48("4537") ? stats.connections : (stryCov_9fa48("4537"), stats?.connections)) && (stryMutAct_9fa48("4539") ? typeof stats.connections !== TYPEOF.OBJECT : stryMutAct_9fa48("4538") ? true : (stryCov_9fa48("4538", "4539"), typeof stats.connections === TYPEOF.OBJECT)))) ? stats.connections : {};
          for (const conn of Object.values(connections)) {
            if (stryMutAct_9fa48("4540")) {
              {}
            } else {
              stryCov_9fa48("4540");
              stryMutAct_9fa48("4541") ? retryCount -= Number(conn?.reconnectAttempts || NUM.ZERO) : (stryCov_9fa48("4541"), retryCount += Number(stryMutAct_9fa48("4544") ? conn?.reconnectAttempts && NUM.ZERO : stryMutAct_9fa48("4543") ? false : stryMutAct_9fa48("4542") ? true : (stryCov_9fa48("4542", "4543", "4544"), (stryMutAct_9fa48("4545") ? conn.reconnectAttempts : (stryCov_9fa48("4545"), conn?.reconnectAttempts)) || NUM.ZERO)));
            }
          }
        }
      }
      return stryMutAct_9fa48("4546") ? {} : (stryCov_9fa48("4546"), {
        bufferDepth: Number.isFinite(bufferDepth) ? stryMutAct_9fa48("4547") ? Math.min(NUM.ZERO, Math.floor(bufferDepth)) : (stryCov_9fa48("4547"), Math.max(NUM.ZERO, Math.floor(bufferDepth))) : NUM.ZERO,
        retryCount: Number.isFinite(retryCount) ? stryMutAct_9fa48("4548") ? Math.min(NUM.ZERO, Math.floor(retryCount)) : (stryCov_9fa48("4548"), Math.max(NUM.ZERO, Math.floor(retryCount))) : NUM.ZERO,
        lastErrorCode: null,
        lastForwardAttemptAtMs: null
      });
    }
  }

  /**
   * Summarize cache freshness/watermark relevant to readiness.
   * @param {Object} options
   * @param {number} options.capturedAtMs
   * @return {Object}
   */
  buildPreflightCacheFreshnessSummary(options) {
    if (stryMutAct_9fa48("4549")) {
      {}
    } else {
      stryCov_9fa48("4549");
      const capturedAtMs = Number(stryMutAct_9fa48("4550") ? options.capturedAtMs : (stryCov_9fa48("4550"), options?.capturedAtMs));
      const lastAppliedAtMs = (stryMutAct_9fa48("4553") ? typeof this.systemTableCache?.getLastAppliedAtMs !== TYPEOF.FUNCTION : stryMutAct_9fa48("4552") ? false : stryMutAct_9fa48("4551") ? true : (stryCov_9fa48("4551", "4552", "4553"), typeof (stryMutAct_9fa48("4554") ? this.systemTableCache.getLastAppliedAtMs : (stryCov_9fa48("4554"), this.systemTableCache?.getLastAppliedAtMs)) === TYPEOF.FUNCTION)) ? this.systemTableCache.getLastAppliedAtMs(TABLES.SERVICE_ENDPOINTS) : null;
      const tableNames = stryMutAct_9fa48("4555") ? [] : (stryCov_9fa48("4555"), [TABLES.SERVICES, TABLES.NODE_ENDPOINTS, TABLES.SERVICE_ENDPOINTS]);
      const lastAppliedCauseIdByTableName = {};
      for (const tableName of tableNames) {
        if (stryMutAct_9fa48("4556")) {
          {}
        } else {
          stryCov_9fa48("4556");
          lastAppliedCauseIdByTableName[tableName] = (stryMutAct_9fa48("4559") ? typeof this.systemTableCache?.getLastAppliedCauseId !== TYPEOF.FUNCTION : stryMutAct_9fa48("4558") ? false : stryMutAct_9fa48("4557") ? true : (stryCov_9fa48("4557", "4558", "4559"), typeof (stryMutAct_9fa48("4560") ? this.systemTableCache.getLastAppliedCauseId : (stryCov_9fa48("4560"), this.systemTableCache?.getLastAppliedCauseId)) === TYPEOF.FUNCTION)) ? this.systemTableCache.getLastAppliedCauseId(tableName) : null;
        }
      }
      const appliedSchemaVersion = (stryMutAct_9fa48("4563") ? typeof this.systemTableCache?.getAppliedSchemaVersion !== TYPEOF.FUNCTION : stryMutAct_9fa48("4562") ? false : stryMutAct_9fa48("4561") ? true : (stryCov_9fa48("4561", "4562", "4563"), typeof (stryMutAct_9fa48("4564") ? this.systemTableCache.getAppliedSchemaVersion : (stryCov_9fa48("4564"), this.systemTableCache?.getAppliedSchemaVersion)) === TYPEOF.FUNCTION)) ? normalizeSchemaVersionValue(this.systemTableCache.getAppliedSchemaVersion(TABLES.SERVICE_ENDPOINTS)) : null;
      const numericLastAppliedAtMs = Number(lastAppliedAtMs);
      const hasNumericLastAppliedAtMs = stryMutAct_9fa48("4567") ? lastAppliedAtMs !== null && typeof lastAppliedAtMs !== TYPEOF.UNDEFINED || Number.isFinite(numericLastAppliedAtMs) : stryMutAct_9fa48("4566") ? false : stryMutAct_9fa48("4565") ? true : (stryCov_9fa48("4565", "4566", "4567"), (stryMutAct_9fa48("4569") ? lastAppliedAtMs !== null || typeof lastAppliedAtMs !== TYPEOF.UNDEFINED : stryMutAct_9fa48("4568") ? true : (stryCov_9fa48("4568", "4569"), (stryMutAct_9fa48("4571") ? lastAppliedAtMs === null : stryMutAct_9fa48("4570") ? true : (stryCov_9fa48("4570", "4571"), lastAppliedAtMs !== null)) && (stryMutAct_9fa48("4573") ? typeof lastAppliedAtMs === TYPEOF.UNDEFINED : stryMutAct_9fa48("4572") ? true : (stryCov_9fa48("4572", "4573"), typeof lastAppliedAtMs !== TYPEOF.UNDEFINED)))) && Number.isFinite(numericLastAppliedAtMs));
      const stalenessMs = (stryMutAct_9fa48("4576") ? Number.isFinite(capturedAtMs) || hasNumericLastAppliedAtMs : stryMutAct_9fa48("4575") ? false : stryMutAct_9fa48("4574") ? true : (stryCov_9fa48("4574", "4575", "4576"), Number.isFinite(capturedAtMs) && hasNumericLastAppliedAtMs)) ? stryMutAct_9fa48("4577") ? Math.min(NUM.ZERO, Math.floor(capturedAtMs - numericLastAppliedAtMs)) : (stryCov_9fa48("4577"), Math.max(NUM.ZERO, Math.floor(stryMutAct_9fa48("4578") ? capturedAtMs + numericLastAppliedAtMs : (stryCov_9fa48("4578"), capturedAtMs - numericLastAppliedAtMs)))) : null;
      return stryMutAct_9fa48("4579") ? {} : (stryCov_9fa48("4579"), {
        lastAppliedAtMs: hasNumericLastAppliedAtMs ? Math.floor(numericLastAppliedAtMs) : null,
        appliedSchemaVersion,
        stalenessMs,
        lastAppliedCauseIdByTableName
      });
    }
  }

  /**
   * Summarize control-plane row counts relevant to readiness.
   * @return {Object}
   */
  buildPreflightRowCountsSummary() {
    if (stryMutAct_9fa48("4580")) {
      {}
    } else {
      stryCov_9fa48("4580");
      if (stryMutAct_9fa48("4583") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("4582") ? false : stryMutAct_9fa48("4581") ? true : (stryCov_9fa48("4581", "4582", "4583"), (stryMutAct_9fa48("4584") ? this.systemTableCache : (stryCov_9fa48("4584"), !this.systemTableCache)) || (stryMutAct_9fa48("4586") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("4585") ? false : (stryCov_9fa48("4585", "4586"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("4587")) {
          {}
        } else {
          stryCov_9fa48("4587");
          return stryMutAct_9fa48("4588") ? {} : (stryCov_9fa48("4588"), {
            sysPostgresWireServiceCount: NUM.ZERO,
            nodeEndpointsCount: NUM.ZERO,
            serviceEndpointsCount: NUM.ZERO
          });
        }
      }
      const serviceDefinitionRows = this.systemTableCache.getAll(TABLES.SERVICE_DEFINITIONS);
      const sysPostgresWireServiceCount = stryMutAct_9fa48("4589") ? serviceDefinitionRows.length : (stryCov_9fa48("4589"), serviceDefinitionRows.filter(stryMutAct_9fa48("4590") ? () => undefined : (stryCov_9fa48("4590"), row => stryMutAct_9fa48("4593") ? row?.[COLUMN.SERVICE_ID] !== META_SERVICE_ID.POSTGRES_WIRE : stryMutAct_9fa48("4592") ? false : stryMutAct_9fa48("4591") ? true : (stryCov_9fa48("4591", "4592", "4593"), (stryMutAct_9fa48("4594") ? row[COLUMN.SERVICE_ID] : (stryCov_9fa48("4594"), row?.[COLUMN.SERVICE_ID])) === META_SERVICE_ID.POSTGRES_WIRE))).length);
      const nodeEndpointsCount = (stryMutAct_9fa48("4597") ? typeof this.systemTableCache.count !== TYPEOF.FUNCTION : stryMutAct_9fa48("4596") ? false : stryMutAct_9fa48("4595") ? true : (stryCov_9fa48("4595", "4596", "4597"), typeof this.systemTableCache.count === TYPEOF.FUNCTION)) ? this.systemTableCache.count(TABLES.NODE_ENDPOINTS) : this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS).length;
      const serviceEndpointsCount = (stryMutAct_9fa48("4600") ? typeof this.systemTableCache.count !== TYPEOF.FUNCTION : stryMutAct_9fa48("4599") ? false : stryMutAct_9fa48("4598") ? true : (stryCov_9fa48("4598", "4599", "4600"), typeof this.systemTableCache.count === TYPEOF.FUNCTION)) ? this.systemTableCache.count(TABLES.SERVICE_ENDPOINTS) : this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS).length;
      return stryMutAct_9fa48("4601") ? {} : (stryCov_9fa48("4601"), {
        sysPostgresWireServiceCount,
        nodeEndpointsCount,
        serviceEndpointsCount
      });
    }
  }

  /**
   * Summarize strict discovery selection/exclusion from local service
   * discovery state.
   * @return {Object}
   */
  buildPreflightDiscoverySummary() {
    if (stryMutAct_9fa48("4602")) {
      {}
    } else {
      stryCov_9fa48("4602");
      try {
        if (stryMutAct_9fa48("4603")) {
          {}
        } else {
          stryCov_9fa48("4603");
          if (stryMutAct_9fa48("4606") ? false : stryMutAct_9fa48("4605") ? true : stryMutAct_9fa48("4604") ? this.buildLocalServiceDiscoverySnapshot : (stryCov_9fa48("4604", "4605", "4606"), !this.buildLocalServiceDiscoverySnapshot)) {
            if (stryMutAct_9fa48("4607")) {
              {}
            } else {
              stryCov_9fa48("4607");
              return stryMutAct_9fa48("4608") ? {} : (stryCov_9fa48("4608"), {
                selectedNodeIds: ADMIN_CACHE_DUMP.EMPTY,
                excludedByNodeId: {}
              });
            }
          }
          const snapshot = this.buildLocalServiceDiscoverySnapshot(stryMutAct_9fa48("4609") ? {} : (stryCov_9fa48("4609"), {
            serviceIdAllowlist: stryMutAct_9fa48("4610") ? [] : (stryCov_9fa48("4610"), [META_SERVICE_ID.POSTGRES_WIRE])
          }));
          const selectedNodeIds = stryMutAct_9fa48("4611") ? ["Stryker was here"] : (stryCov_9fa48("4611"), []);
          const excludedByNodeId = {};
          const services = Array.isArray(stryMutAct_9fa48("4612") ? snapshot.services : (stryCov_9fa48("4612"), snapshot?.services)) ? snapshot.services : stryMutAct_9fa48("4613") ? ["Stryker was here"] : (stryCov_9fa48("4613"), []);
          for (const service of services) {
            if (stryMutAct_9fa48("4614")) {
              {}
            } else {
              stryCov_9fa48("4614");
              const replicas = Array.isArray(stryMutAct_9fa48("4615") ? service.replicas : (stryCov_9fa48("4615"), service?.replicas)) ? service.replicas : stryMutAct_9fa48("4616") ? ["Stryker was here"] : (stryCov_9fa48("4616"), []);
              for (const replica of replicas) {
                if (stryMutAct_9fa48("4617")) {
                  {}
                } else {
                  stryCov_9fa48("4617");
                  const nodeId = (stryMutAct_9fa48("4620") ? typeof replica?.nodeId !== TYPEOF.STRING : stryMutAct_9fa48("4619") ? false : stryMutAct_9fa48("4618") ? true : (stryCov_9fa48("4618", "4619", "4620"), typeof (stryMutAct_9fa48("4621") ? replica.nodeId : (stryCov_9fa48("4621"), replica?.nodeId)) === TYPEOF.STRING)) ? replica.nodeId : null;
                  if (stryMutAct_9fa48("4624") ? false : stryMutAct_9fa48("4623") ? true : stryMutAct_9fa48("4622") ? nodeId : (stryCov_9fa48("4622", "4623", "4624"), !nodeId)) {
                    if (stryMutAct_9fa48("4625")) {
                      {}
                    } else {
                      stryCov_9fa48("4625");
                      continue;
                    }
                  }
                  const readiness = stryMutAct_9fa48("4628") ? replica?.readiness && null : stryMutAct_9fa48("4627") ? false : stryMutAct_9fa48("4626") ? true : (stryCov_9fa48("4626", "4627", "4628"), (stryMutAct_9fa48("4629") ? replica.readiness : (stryCov_9fa48("4629"), replica?.readiness)) || null);
                  const reasons = Array.isArray(stryMutAct_9fa48("4630") ? readiness.reasons : (stryCov_9fa48("4630"), readiness?.reasons)) ? readiness.reasons : stryMutAct_9fa48("4631") ? ["Stryker was here"] : (stryCov_9fa48("4631"), []);
                  const reasonCodes = uniqueSorted(stryMutAct_9fa48("4632") ? reasons.map(reason => String(reason?.code || EMPTY_STRING)) : (stryCov_9fa48("4632"), reasons.map(stryMutAct_9fa48("4633") ? () => undefined : (stryCov_9fa48("4633"), reason => String(stryMutAct_9fa48("4636") ? reason?.code && EMPTY_STRING : stryMutAct_9fa48("4635") ? false : stryMutAct_9fa48("4634") ? true : (stryCov_9fa48("4634", "4635", "4636"), (stryMutAct_9fa48("4637") ? reason.code : (stryCov_9fa48("4637"), reason?.code)) || EMPTY_STRING)))).filter(Boolean)));
                  if (stryMutAct_9fa48("4640") ? reasonCodes.length !== NUM.ZERO : stryMutAct_9fa48("4639") ? false : stryMutAct_9fa48("4638") ? true : (stryCov_9fa48("4638", "4639", "4640"), reasonCodes.length === NUM.ZERO)) {
                    if (stryMutAct_9fa48("4641")) {
                      {}
                    } else {
                      stryCov_9fa48("4641");
                      selectedNodeIds.push(nodeId);
                    }
                  } else {
                    if (stryMutAct_9fa48("4642")) {
                      {}
                    } else {
                      stryCov_9fa48("4642");
                      excludedByNodeId[nodeId] = reasonCodes;
                    }
                  }
                }
              }
            }
          }
          return stryMutAct_9fa48("4643") ? {} : (stryCov_9fa48("4643"), {
            selectedNodeIds: uniqueSorted(selectedNodeIds),
            excludedByNodeId
          });
        }
      } catch (_error) {
        if (stryMutAct_9fa48("4644")) {
          {}
        } else {
          stryCov_9fa48("4644");
          return stryMutAct_9fa48("4645") ? {} : (stryCov_9fa48("4645"), {
            selectedNodeIds: ADMIN_CACHE_DUMP.EMPTY,
            excludedByNodeId: {}
          });
        }
      }
    }
  }

  /**
   * Build canonical query_result payload for preflight critical-path
   * snapshot query.
   * @return {Promise<Object>}
   */
  async buildPreflightCriticalPathSnapshotQueryResult() {
    if (stryMutAct_9fa48("4646")) {
      {}
    } else {
      stryCov_9fa48("4646");
      const snapshot = await this.resolvePreflightCriticalPathSnapshot();
      return stryMutAct_9fa48("4647") ? {} : (stryCov_9fa48("4647"), {
        success: stryMutAct_9fa48("4648") ? false : (stryCov_9fa48("4648"), true),
        rows: stryMutAct_9fa48("4649") ? [] : (stryCov_9fa48("4649"), [snapshot]),
        count: NUM.ONE,
        partitions: ADMIN_CACHE_DUMP.EMPTY,
        tableName: ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.TABLE_NAME
      });
    }
  }
}
export { AdminPreflightSnapshot };