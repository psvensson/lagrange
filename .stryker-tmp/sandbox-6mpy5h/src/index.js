/**
 * Distributed Database System - Main Entry Point
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
import { ConfigurationManager } from './config/configuration-manager.js';
import { CONFIG_KEY } from './config/config-constants.js';
import { createDynamicConfigStartupWiring } from './config/dynamic-config-startup-wiring.js';
import { LoggingService } from './logging/logging-service.js';
import { LogsTableService } from './logging/logs-table-service.js';
import { startLogsTablePersistenceOnReadiness } from './logging/logs-persistence-startup.js';
import { HLCClockService } from './hlc/hlc-clock-service.js';
import { DataDirectoryManager } from './storage/data-directory-manager.js';
import { BootstrapService } from './bootstrap/bootstrap-service.js';
import { BootstrapAPI } from './bootstrap/bootstrap-api.js';
import { BootstrapReadinessState } from './bootstrap/bootstrap-readiness-state.js';
import { READINESS_EVENT } from './bootstrap/bootstrap-readiness-state-constants.js';
import { RejoinHintsPersistenceService, persistBootstrapRejoinHints, resolveAutoRejoinStartupDecision } from './bootstrap/rejoin-hints.js';
import { STARTUP_JOIN_MODE } from './bootstrap/rejoin-hints-constants.js';
import { LIFECYCLE_REASON } from './bootstrap/lifecycle-controller-constants.js';
import { AdminWebSocketAPI } from './admin/admin-websocket-api.js';
import { ADMIN_DEFAULT } from './admin/admin-constants.js';
import { NodeJoiningService } from './bootstrap/node-joining-service.js';
import { NodeService } from './node/node-service.js';
import { ResourceDiagnosticsSampler } from './diagnostics/resource-diagnostics-sampler.js';
import { createLiveQueryStartupWiring } from './live-query/live-query-startup-wiring.js';
import { assertCritical } from './utils/assert.js';
import { ModuleMirror } from './wasm-service/module-mirror.js';
import { WasmExecutor } from './wasm-service/wasm-executor.js';
import { ensureLiferaftProviderForRuntime, getProcessRaftProvider } from './raft/raft-provider-control.js';
import { RAFT_PROVIDER_LOG_MSG } from './raft/raft-provider-control-constants.js';
import { ENTRYPOINT_DEFAULT, ENTRYPOINT_ENV, ENTRYPOINT_FLAG, ENTRYPOINT_ERROR_MSG, ENTRYPOINT_LOG_MSG, ENTRYPOINT_SUBSYSTEM, ENTRYPOINT_TEXT, ENTRYPOINT_VERSION } from './constants/entrypoint.js';
import { resolveControlPlaneRolloutControls } from './runtime/control-plane-rollout-controls.js';
import { createManagedSplitMetricsProvider } from './partition/managed-split-metrics-provider.js';
import { TRANSPORT_CONFIG_KEY } from './constants/transport.js';
import { resolveAdvertisedWebSocketAddress } from './transport/node-address-resolution.js';
import { createSystemMetadataOwners } from './control-plane/owners/index.js';
import { createControlPlaneRuntimeBundle } from './control-plane/control-plane-runtime-bundle.js';
import { MembershipLifecycleController } from './control-plane/membership-lifecycle-controller.js';
import { SPLIT_MERGE_EVENT } from './partition/partition-constants.js';
import { STABILIZATION_RESET_TRIGGER } from './rebalancer/rebalancer-constants.js';
import { wireMigrationWorkflowOwners } from './migration/migration-composition.js';
import { wireMigrationRecoveryOnLeaderElection } from './migration/migration-recovery-trigger.js';
import { attachSqlRuntimeToStartupOwner } from './bootstrap/shared/startup-sql-runtime-handoff.js';

// Re-export modules for external use
export * from './query/index.js';
export * from './partition/index.js';
export * from './config/configuration-manager.js';
export * from './logging/logging-service.js';
export * from './hlc/index.js';
export * from './cache/index.js';
export * from './address/index.js';
export * from './bootstrap/index.js';
export * from './cdc/index.js';
export * from './message-group/index.js';
export * from './node/index.js';
export * from './rebalancer/index.js';
export * from './service/index.js';
export * from './threading/index.js';
export * from './transport/index.js';
export * from './storage/index.js';

/**
 * System version.
 */
export const VERSION = ENTRYPOINT_VERSION;
const CONTROL_PLANE_WRITE_FAILURE_THRESHOLD = 3;

/**
 * Check for version flag.
 * @return {boolean} True if version was printed
 */
function checkVersionFlag() {
  if (stryMutAct_9fa48("80672")) {
    {}
  } else {
    stryCov_9fa48("80672");
    const args = stryMutAct_9fa48("80673") ? process.argv : (stryCov_9fa48("80673"), process.argv.slice(2));
    if (stryMutAct_9fa48("80676") ? args.includes(ENTRYPOINT_FLAG.VERSION_LONG) && args.includes(ENTRYPOINT_FLAG.VERSION_SHORT) : stryMutAct_9fa48("80675") ? false : stryMutAct_9fa48("80674") ? true : (stryCov_9fa48("80674", "80675", "80676"), args.includes(ENTRYPOINT_FLAG.VERSION_LONG) || args.includes(ENTRYPOINT_FLAG.VERSION_SHORT))) {
      if (stryMutAct_9fa48("80677")) {
        {}
      } else {
        stryCov_9fa48("80677");
        console.log(ENTRYPOINT_TEXT.versionLine(VERSION));
        return stryMutAct_9fa48("80678") ? false : (stryCov_9fa48("80678"), true);
      }
    }
    if (stryMutAct_9fa48("80681") ? args.includes(ENTRYPOINT_FLAG.HELP_LONG) && args.includes(ENTRYPOINT_FLAG.HELP_SHORT) : stryMutAct_9fa48("80680") ? false : stryMutAct_9fa48("80679") ? true : (stryCov_9fa48("80679", "80680", "80681"), args.includes(ENTRYPOINT_FLAG.HELP_LONG) || args.includes(ENTRYPOINT_FLAG.HELP_SHORT))) {
      if (stryMutAct_9fa48("80682")) {
        {}
      } else {
        stryCov_9fa48("80682");
        console.log(ENTRYPOINT_TEXT.headerLine(VERSION));
        console.log(stryMutAct_9fa48("80683") ? "Stryker was here!" : (stryCov_9fa48("80683"), ''));
        console.log(ENTRYPOINT_TEXT.USAGE_LINE);
        console.log(stryMutAct_9fa48("80684") ? "Stryker was here!" : (stryCov_9fa48("80684"), ''));
        console.log(stryMutAct_9fa48("80685") ? "" : (stryCov_9fa48("80685"), 'Options:'));
        for (const line of ENTRYPOINT_TEXT.OPTIONS_LINES) {
          if (stryMutAct_9fa48("80686")) {
            {}
          } else {
            stryCov_9fa48("80686");
            console.log(line);
          }
        }
        return stryMutAct_9fa48("80687") ? false : (stryCov_9fa48("80687"), true);
      }
    }
    return stryMutAct_9fa48("80688") ? true : (stryCov_9fa48("80688"), false);
  }
}

/**
 * Parse command-line arguments.
 * @return {Object} Parsed arguments
 */
function parseCommandLineArgs() {
  if (stryMutAct_9fa48("80689")) {
    {}
  } else {
    stryCov_9fa48("80689");
    const args = stryMutAct_9fa48("80690") ? process.argv : (stryCov_9fa48("80690"), process.argv.slice(2));
    const result = {};
    for (let i = 0; stryMutAct_9fa48("80693") ? i >= args.length : stryMutAct_9fa48("80692") ? i <= args.length : stryMutAct_9fa48("80691") ? false : (stryCov_9fa48("80691", "80692", "80693"), i < args.length); stryMutAct_9fa48("80694") ? i-- : (stryCov_9fa48("80694"), i++)) {
      if (stryMutAct_9fa48("80695")) {
        {}
      } else {
        stryCov_9fa48("80695");
        if (stryMutAct_9fa48("80698") ? args[i] === ENTRYPOINT_FLAG.DATA_DIR || i + 1 < args.length : stryMutAct_9fa48("80697") ? false : stryMutAct_9fa48("80696") ? true : (stryCov_9fa48("80696", "80697", "80698"), (stryMutAct_9fa48("80700") ? args[i] !== ENTRYPOINT_FLAG.DATA_DIR : stryMutAct_9fa48("80699") ? true : (stryCov_9fa48("80699", "80700"), args[i] === ENTRYPOINT_FLAG.DATA_DIR)) && (stryMutAct_9fa48("80703") ? i + 1 >= args.length : stryMutAct_9fa48("80702") ? i + 1 <= args.length : stryMutAct_9fa48("80701") ? true : (stryCov_9fa48("80701", "80702", "80703"), (stryMutAct_9fa48("80704") ? i - 1 : (stryCov_9fa48("80704"), i + 1)) < args.length)))) {
          if (stryMutAct_9fa48("80705")) {
            {}
          } else {
            stryCov_9fa48("80705");
            result.dataDir = args[stryMutAct_9fa48("80706") ? i - 1 : (stryCov_9fa48("80706"), i + 1)];
            stryMutAct_9fa48("80707") ? i-- : (stryCov_9fa48("80707"), i++);
          }
        } else if (stryMutAct_9fa48("80710") ? args[i] === ENTRYPOINT_FLAG.SEED || i + 1 < args.length : stryMutAct_9fa48("80709") ? false : stryMutAct_9fa48("80708") ? true : (stryCov_9fa48("80708", "80709", "80710"), (stryMutAct_9fa48("80712") ? args[i] !== ENTRYPOINT_FLAG.SEED : stryMutAct_9fa48("80711") ? true : (stryCov_9fa48("80711", "80712"), args[i] === ENTRYPOINT_FLAG.SEED)) && (stryMutAct_9fa48("80715") ? i + 1 >= args.length : stryMutAct_9fa48("80714") ? i + 1 <= args.length : stryMutAct_9fa48("80713") ? true : (stryCov_9fa48("80713", "80714", "80715"), (stryMutAct_9fa48("80716") ? i - 1 : (stryCov_9fa48("80716"), i + 1)) < args.length)))) {
          if (stryMutAct_9fa48("80717")) {
            {}
          } else {
            stryCov_9fa48("80717");
            result.seedNodeAddress = args[stryMutAct_9fa48("80718") ? i - 1 : (stryCov_9fa48("80718"), i + 1)];
            stryMutAct_9fa48("80719") ? i-- : (stryCov_9fa48("80719"), i++);
          }
        } else if (stryMutAct_9fa48("80722") ? args[i] === ENTRYPOINT_FLAG.CONFIG || i + 1 < args.length : stryMutAct_9fa48("80721") ? false : stryMutAct_9fa48("80720") ? true : (stryCov_9fa48("80720", "80721", "80722"), (stryMutAct_9fa48("80724") ? args[i] !== ENTRYPOINT_FLAG.CONFIG : stryMutAct_9fa48("80723") ? true : (stryCov_9fa48("80723", "80724"), args[i] === ENTRYPOINT_FLAG.CONFIG)) && (stryMutAct_9fa48("80727") ? i + 1 >= args.length : stryMutAct_9fa48("80726") ? i + 1 <= args.length : stryMutAct_9fa48("80725") ? true : (stryCov_9fa48("80725", "80726", "80727"), (stryMutAct_9fa48("80728") ? i - 1 : (stryCov_9fa48("80728"), i + 1)) < args.length)))) {
          if (stryMutAct_9fa48("80729")) {
            {}
          } else {
            stryCov_9fa48("80729");
            result.configPath = args[stryMutAct_9fa48("80730") ? i - 1 : (stryCov_9fa48("80730"), i + 1)];
            stryMutAct_9fa48("80731") ? i-- : (stryCov_9fa48("80731"), i++);
          }
        } else if (stryMutAct_9fa48("80734") ? args[i] !== ENTRYPOINT_FLAG.DRY_RUN : stryMutAct_9fa48("80733") ? false : stryMutAct_9fa48("80732") ? true : (stryCov_9fa48("80732", "80733", "80734"), args[i] === ENTRYPOINT_FLAG.DRY_RUN)) {
          if (stryMutAct_9fa48("80735")) {
            {}
          } else {
            stryCov_9fa48("80735");
            result.dryRun = stryMutAct_9fa48("80736") ? false : (stryCov_9fa48("80736"), true);
          }
        }
      }
    }
    return result;
  }
}

/**
 * Parse a positive millisecond value from environment input.
 * @param {string|number|undefined} value
 * @return {number|null}
 */
function parsePositiveTimeoutMs(value) {
  if (stryMutAct_9fa48("80737")) {
    {}
  } else {
    stryCov_9fa48("80737");
    const parsed = Number(value);
    if (stryMutAct_9fa48("80740") ? !Number.isFinite(parsed) && parsed < 1 : stryMutAct_9fa48("80739") ? false : stryMutAct_9fa48("80738") ? true : (stryCov_9fa48("80738", "80739", "80740"), (stryMutAct_9fa48("80741") ? Number.isFinite(parsed) : (stryCov_9fa48("80741"), !Number.isFinite(parsed))) || (stryMutAct_9fa48("80744") ? parsed >= 1 : stryMutAct_9fa48("80743") ? parsed <= 1 : stryMutAct_9fa48("80742") ? false : (stryCov_9fa48("80742", "80743", "80744"), parsed < 1)))) {
      if (stryMutAct_9fa48("80745")) {
        {}
      } else {
        stryCov_9fa48("80745");
        return null;
      }
    }
    return Math.floor(parsed);
  }
}

/**
 * Resolve rollout controls from environment overrides.
 * @param {Object} env
 * @return {Object}
 */
function resolveRolloutControlsFromEnvironment(env) {
  if (stryMutAct_9fa48("80746")) {
    {}
  } else {
    stryCov_9fa48("80746");
    return resolveControlPlaneRolloutControls(stryMutAct_9fa48("80747") ? {} : (stryCov_9fa48("80747"), {
      lifecycleProbes: env[ENTRYPOINT_ENV.CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED],
      workClassScheduler: env[ENTRYPOINT_ENV.CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED],
      durableJoinSessions: env[ENTRYPOINT_ENV.CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED]
    }));
  }
}

/**
 * Create runtime-owned wasm executor for SQL callback execution.
 * @return {WasmExecutor}
 */
function createSqlCallbackWasmExecutor() {
  if (stryMutAct_9fa48("80748")) {
    {}
  } else {
    stryCov_9fa48("80748");
    return new WasmExecutor(stryMutAct_9fa48("80749") ? {} : (stryCov_9fa48("80749"), {
      moduleMirror: new ModuleMirror()
    }));
  }
}

/**
 * Find a partition service by partition ID from the partitionServices map.
 * The map is keyed by replicaId; this iterates values and matches by the
 * partitionId property. Read-only lookup — no new cache or index.
 * @param {Map} partitionServices - Map keyed by replicaId.
 * @param {string} partitionId - The partition ID to find.
 * @return {Object|null} The matching partition service, or null.
 */
function resolvePartitionServiceByPartitionId(partitionServices, partitionId) {
  if (stryMutAct_9fa48("80750")) {
    {}
  } else {
    stryCov_9fa48("80750");
    if (stryMutAct_9fa48("80753") ? (!partitionServices || !partitionId) && typeof partitionServices.values !== 'function' : stryMutAct_9fa48("80752") ? false : stryMutAct_9fa48("80751") ? true : (stryCov_9fa48("80751", "80752", "80753"), (stryMutAct_9fa48("80755") ? !partitionServices && !partitionId : stryMutAct_9fa48("80754") ? false : (stryCov_9fa48("80754", "80755"), (stryMutAct_9fa48("80756") ? partitionServices : (stryCov_9fa48("80756"), !partitionServices)) || (stryMutAct_9fa48("80757") ? partitionId : (stryCov_9fa48("80757"), !partitionId)))) || (stryMutAct_9fa48("80759") ? typeof partitionServices.values === 'function' : stryMutAct_9fa48("80758") ? false : (stryCov_9fa48("80758", "80759"), typeof partitionServices.values !== (stryMutAct_9fa48("80760") ? "" : (stryCov_9fa48("80760"), 'function')))))) {
      if (stryMutAct_9fa48("80761")) {
        {}
      } else {
        stryCov_9fa48("80761");
        return null;
      }
    }
    for (const service of partitionServices.values()) {
      if (stryMutAct_9fa48("80762")) {
        {}
      } else {
        stryCov_9fa48("80762");
        if (stryMutAct_9fa48("80765") ? service || service.partitionId === partitionId : stryMutAct_9fa48("80764") ? false : stryMutAct_9fa48("80763") ? true : (stryCov_9fa48("80763", "80764", "80765"), service && (stryMutAct_9fa48("80767") ? service.partitionId !== partitionId : stryMutAct_9fa48("80766") ? true : (stryCov_9fa48("80766", "80767"), service.partitionId === partitionId)))) {
          if (stryMutAct_9fa48("80768")) {
            {}
          } else {
            stryCov_9fa48("80768");
            return service;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Create a diagnostics provider for unified lifecycle owners.
 * @param {Object} owner - BootstrapService or NodeJoiningService instance.
 * @return {Function} Provider returning lifecycle/reconciler/resource diagnostics.
 */
function createServiceDiagnosticsProvider(owner) {
  if (stryMutAct_9fa48("80769")) {
    {}
  } else {
    stryCov_9fa48("80769");
    const resourceDiagnosticsSampler = new ResourceDiagnosticsSampler(stryMutAct_9fa48("80770") ? {} : (stryCov_9fa48("80770"), {
      nodeId: stryMutAct_9fa48("80773") ? owner?.nodeId && null : stryMutAct_9fa48("80772") ? false : stryMutAct_9fa48("80771") ? true : (stryCov_9fa48("80771", "80772", "80773"), (stryMutAct_9fa48("80774") ? owner.nodeId : (stryCov_9fa48("80774"), owner?.nodeId)) || null),
      owner
    }));
    return () => {
      if (stryMutAct_9fa48("80775")) {
        {}
      } else {
        stryCov_9fa48("80775");
        const lifecycleManager = stryMutAct_9fa48("80778") ? owner?.serviceLifecycleManager && null : stryMutAct_9fa48("80777") ? false : stryMutAct_9fa48("80776") ? true : (stryCov_9fa48("80776", "80777", "80778"), (stryMutAct_9fa48("80779") ? owner.serviceLifecycleManager : (stryCov_9fa48("80779"), owner?.serviceLifecycleManager)) || null);
        const reconciler = stryMutAct_9fa48("80782") ? owner?.serviceReconciler && null : stryMutAct_9fa48("80781") ? false : stryMutAct_9fa48("80780") ? true : (stryCov_9fa48("80780", "80781", "80782"), (stryMutAct_9fa48("80783") ? owner.serviceReconciler : (stryCov_9fa48("80783"), owner?.serviceReconciler)) || null);
        const lifecycleDiagnostics = (stryMutAct_9fa48("80784") ? lifecycleManager.getDiagnosticsReport : (stryCov_9fa48("80784"), lifecycleManager?.getDiagnosticsReport)) ? lifecycleManager.getDiagnosticsReport() : null;
        const reconcilerDiagnostics = (stryMutAct_9fa48("80785") ? reconciler.getDiagnosticsReport : (stryCov_9fa48("80785"), reconciler?.getDiagnosticsReport)) ? reconciler.getDiagnosticsReport() : null;
        const resourceDiagnostics = resourceDiagnosticsSampler.getReport();
        const cdcSubscriptionStatus = (stryMutAct_9fa48("80788") ? typeof owner?.getCdcSubscriptionStatus !== 'function' : stryMutAct_9fa48("80787") ? false : stryMutAct_9fa48("80786") ? true : (stryCov_9fa48("80786", "80787", "80788"), typeof (stryMutAct_9fa48("80789") ? owner.getCdcSubscriptionStatus : (stryCov_9fa48("80789"), owner?.getCdcSubscriptionStatus)) === (stryMutAct_9fa48("80790") ? "" : (stryCov_9fa48("80790"), 'function')))) ? owner.getCdcSubscriptionStatus() : null;
        if (stryMutAct_9fa48("80793") ? !lifecycleDiagnostics && !reconcilerDiagnostics && !resourceDiagnostics || !cdcSubscriptionStatus : stryMutAct_9fa48("80792") ? false : stryMutAct_9fa48("80791") ? true : (stryCov_9fa48("80791", "80792", "80793"), (stryMutAct_9fa48("80795") ? !lifecycleDiagnostics && !reconcilerDiagnostics || !resourceDiagnostics : stryMutAct_9fa48("80794") ? true : (stryCov_9fa48("80794", "80795"), (stryMutAct_9fa48("80797") ? !lifecycleDiagnostics || !reconcilerDiagnostics : stryMutAct_9fa48("80796") ? true : (stryCov_9fa48("80796", "80797"), (stryMutAct_9fa48("80798") ? lifecycleDiagnostics : (stryCov_9fa48("80798"), !lifecycleDiagnostics)) && (stryMutAct_9fa48("80799") ? reconcilerDiagnostics : (stryCov_9fa48("80799"), !reconcilerDiagnostics)))) && (stryMutAct_9fa48("80800") ? resourceDiagnostics : (stryCov_9fa48("80800"), !resourceDiagnostics)))) && (stryMutAct_9fa48("80801") ? cdcSubscriptionStatus : (stryCov_9fa48("80801"), !cdcSubscriptionStatus)))) {
          if (stryMutAct_9fa48("80802")) {
            {}
          } else {
            stryCov_9fa48("80802");
            return null;
          }
        }
        return stryMutAct_9fa48("80803") ? {} : (stryCov_9fa48("80803"), {
          lifecycle: lifecycleDiagnostics,
          reconciler: reconcilerDiagnostics,
          resources: resourceDiagnostics,
          cdcSubscriptionStatus
        });
      }
    };
  }
}

/**
 * Build control-plane write health provider for readiness degradation.
 * @param {Object|null} owner
 * @param {Object} [options]
 * @param {number} [options.failureThreshold]
 * @return {Function}
 */
function createControlPlaneWriteHealthProvider(owner, options = {}) {
  if (stryMutAct_9fa48("80804")) {
    {}
  } else {
    stryCov_9fa48("80804");
    const failureThreshold = (stryMutAct_9fa48("80807") ? Number.isFinite(options.failureThreshold) || options.failureThreshold > 0 : stryMutAct_9fa48("80806") ? false : stryMutAct_9fa48("80805") ? true : (stryCov_9fa48("80805", "80806", "80807"), Number.isFinite(options.failureThreshold) && (stryMutAct_9fa48("80810") ? options.failureThreshold <= 0 : stryMutAct_9fa48("80809") ? options.failureThreshold >= 0 : stryMutAct_9fa48("80808") ? true : (stryCov_9fa48("80808", "80809", "80810"), options.failureThreshold > 0)))) ? Math.floor(options.failureThreshold) : CONTROL_PLANE_WRITE_FAILURE_THRESHOLD;
    return () => {
      if (stryMutAct_9fa48("80811")) {
        {}
      } else {
        stryCov_9fa48("80811");
        const consecutiveFailures = Number(stryMutAct_9fa48("80814") ? owner?.heartbeatService?.heartbeatConsecutiveFailures && 0 : stryMutAct_9fa48("80813") ? false : stryMutAct_9fa48("80812") ? true : (stryCov_9fa48("80812", "80813", "80814"), (stryMutAct_9fa48("80816") ? owner.heartbeatService?.heartbeatConsecutiveFailures : stryMutAct_9fa48("80815") ? owner?.heartbeatService.heartbeatConsecutiveFailures : (stryCov_9fa48("80815", "80816"), owner?.heartbeatService?.heartbeatConsecutiveFailures)) || 0));
        return stryMutAct_9fa48("80817") ? {} : (stryCov_9fa48("80817"), {
          healthy: stryMutAct_9fa48("80821") ? consecutiveFailures >= failureThreshold : stryMutAct_9fa48("80820") ? consecutiveFailures <= failureThreshold : stryMutAct_9fa48("80819") ? false : stryMutAct_9fa48("80818") ? true : (stryCov_9fa48("80818", "80819", "80820", "80821"), consecutiveFailures < failureThreshold),
          reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
          details: stryMutAct_9fa48("80822") ? {} : (stryCov_9fa48("80822"), {
            source: stryMutAct_9fa48("80823") ? "" : (stryCov_9fa48("80823"), 'heartbeat_service'),
            consecutiveFailures,
            failureThreshold
          })
        });
      }
    };
  }
}

/**
 * Create admin API and startup-owned live query wiring.
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {Object} options.systemTableCache
 * @param {Object|null} [options.cacheMutationTarget]
 * @param {Object|null} options.sqlQueryEngine
 * @param {Function|null} options.serviceDiagnosticsProvider
 * @return {{adminAPI: AdminWebSocketAPI, liveQueryWiring: Object}}
 */
function createAdminAPIWithLiveQuery(options) {
  if (stryMutAct_9fa48("80824")) {
    {}
  } else {
    stryCov_9fa48("80824");
    const liveQueryWiring = createLiveQueryStartupWiring(stryMutAct_9fa48("80825") ? {} : (stryCov_9fa48("80825"), {
      nodeId: options.nodeId,
      systemTableCache: options.systemTableCache,
      sqlQueryEngine: stryMutAct_9fa48("80828") ? options.sqlQueryEngine && null : stryMutAct_9fa48("80827") ? false : stryMutAct_9fa48("80826") ? true : (stryCov_9fa48("80826", "80827", "80828"), options.sqlQueryEngine || null)
    }));
    const liveQueryManager = assertCritical(liveQueryWiring.liveQueryManager, ENTRYPOINT_ERROR_MSG.LIVE_QUERY_MANAGER_REQUIRED);
    const adminAPI = new AdminWebSocketAPI(stryMutAct_9fa48("80829") ? {} : (stryCov_9fa48("80829"), {
      nodeId: options.nodeId,
      systemTableCache: options.systemTableCache,
      cacheMutationTarget: stryMutAct_9fa48("80832") ? options.cacheMutationTarget && null : stryMutAct_9fa48("80831") ? false : stryMutAct_9fa48("80830") ? true : (stryCov_9fa48("80830", "80831", "80832"), options.cacheMutationTarget || null),
      sqlQueryEngine: stryMutAct_9fa48("80835") ? options.sqlQueryEngine && null : stryMutAct_9fa48("80834") ? false : stryMutAct_9fa48("80833") ? true : (stryCov_9fa48("80833", "80834", "80835"), options.sqlQueryEngine || null),
      cdcIntegrationService: stryMutAct_9fa48("80838") ? options.cdcIntegrationService && null : stryMutAct_9fa48("80837") ? false : stryMutAct_9fa48("80836") ? true : (stryCov_9fa48("80836", "80837", "80838"), options.cdcIntegrationService || null),
      messageRouter: stryMutAct_9fa48("80841") ? options.messageRouter && null : stryMutAct_9fa48("80840") ? false : stryMutAct_9fa48("80839") ? true : (stryCov_9fa48("80839", "80840", "80841"), options.messageRouter || null),
      serviceDiagnosticsProvider: stryMutAct_9fa48("80844") ? options.serviceDiagnosticsProvider && null : stryMutAct_9fa48("80843") ? false : stryMutAct_9fa48("80842") ? true : (stryCov_9fa48("80842", "80843", "80844"), options.serviceDiagnosticsProvider || null),
      heartbeatService: stryMutAct_9fa48("80847") ? options.heartbeatService && null : stryMutAct_9fa48("80846") ? false : stryMutAct_9fa48("80845") ? true : (stryCov_9fa48("80845", "80846", "80847"), options.heartbeatService || null),
      startupRecoveryCoordinator: stryMutAct_9fa48("80850") ? options.startupRecoveryCoordinator && null : stryMutAct_9fa48("80849") ? false : stryMutAct_9fa48("80848") ? true : (stryCov_9fa48("80848", "80849", "80850"), options.startupRecoveryCoordinator || null),
      bootstrapReadinessState: stryMutAct_9fa48("80853") ? options.bootstrapReadinessState && null : stryMutAct_9fa48("80852") ? false : stryMutAct_9fa48("80851") ? true : (stryCov_9fa48("80851", "80852", "80853"), options.bootstrapReadinessState || null),
      partitionServicesProvider: (stryMutAct_9fa48("80856") ? typeof options.partitionServicesProvider !== 'function' : stryMutAct_9fa48("80855") ? false : stryMutAct_9fa48("80854") ? true : (stryCov_9fa48("80854", "80855", "80856"), typeof options.partitionServicesProvider === (stryMutAct_9fa48("80857") ? "" : (stryCov_9fa48("80857"), 'function')))) ? options.partitionServicesProvider : null,
      liveQueryManager
    }));
    return stryMutAct_9fa48("80858") ? {} : (stryCov_9fa48("80858"), {
      adminAPI,
      liveQueryWiring
    });
  }
}

/**
 * Connect structured logging persistence to the replicated logs table.
 * @param {Object|null} cdcIntegrationService - CDC integration service.
 * @param {Object} logger - Entrypoint logger.
 * @param {Object} rolloutControls - Startup rollout control map.
 * @return {Promise<LogsTableService|null>} Logs table service when connected.
 */
async function connectLogsTablePersistence(cdcIntegrationService, logger, rolloutControls) {
  if (stryMutAct_9fa48("80859")) {
    {}
  } else {
    stryCov_9fa48("80859");
    if (stryMutAct_9fa48("80862") ? false : stryMutAct_9fa48("80861") ? true : stryMutAct_9fa48("80860") ? cdcIntegrationService : (stryCov_9fa48("80860", "80861", "80862"), !cdcIntegrationService)) {
      if (stryMutAct_9fa48("80863")) {
        {}
      } else {
        stryCov_9fa48("80863");
        logger.warn(ENTRYPOINT_LOG_MSG.LOGS_TABLE_CONNECT_SKIPPED);
        return null;
      }
    }
    try {
      if (stryMutAct_9fa48("80864")) {
        {}
      } else {
        stryCov_9fa48("80864");
        const controlPlaneRuntimeBundle = createControlPlaneRuntimeBundle(stryMutAct_9fa48("80865") ? {} : (stryCov_9fa48("80865"), {
          cdcIntegrationService,
          messageRouter: stryMutAct_9fa48("80868") ? cdcIntegrationService?.messageRouter && null : stryMutAct_9fa48("80867") ? false : stryMutAct_9fa48("80866") ? true : (stryCov_9fa48("80866", "80867", "80868"), (stryMutAct_9fa48("80869") ? cdcIntegrationService.messageRouter : (stryCov_9fa48("80869"), cdcIntegrationService?.messageRouter)) || null)
        }));
        const controlPlaneSystemTableGateway = controlPlaneRuntimeBundle.controlPlaneSystemTableGateway;
        const systemMetadataOwners = createSystemMetadataOwners(stryMutAct_9fa48("80870") ? {} : (stryCov_9fa48("80870"), {
          controlPlaneSystemTableGateway
        }));
        const logsTableService = LogsTableService.getInstance(stryMutAct_9fa48("80871") ? {} : (stryCov_9fa48("80871"), {
          rolloutControls
        }));
        logsTableService.initialize(stryMutAct_9fa48("80872") ? {} : (stryCov_9fa48("80872"), {
          cdcIntegrationService,
          logsOwner: systemMetadataOwners.logsOwner,
          messageRouter: stryMutAct_9fa48("80875") ? cdcIntegrationService?.messageRouter && null : stryMutAct_9fa48("80874") ? false : stryMutAct_9fa48("80873") ? true : (stryCov_9fa48("80873", "80874", "80875"), (stryMutAct_9fa48("80876") ? cdcIntegrationService.messageRouter : (stryCov_9fa48("80876"), cdcIntegrationService?.messageRouter)) || null),
          controlPlaneSystemTableGateway
        }));
        const flushedCount = await logsTableService.connectToLoggingService();
        logger.info(ENTRYPOINT_LOG_MSG.LOGS_TABLE_CONNECTED, stryMutAct_9fa48("80877") ? {} : (stryCov_9fa48("80877"), {
          bufferedEntriesFlushed: flushedCount
        }));
        return logsTableService;
      }
    } catch (error) {
      if (stryMutAct_9fa48("80878")) {
        {}
      } else {
        stryCov_9fa48("80878");
        logger.warn(ENTRYPOINT_LOG_MSG.LOGS_TABLE_CONNECT_FAILED, stryMutAct_9fa48("80879") ? {} : (stryCov_9fa48("80879"), {
          error: error.message
        }));
        return null;
      }
    }
  }
}

/**
 * Start logs table persistence only after readiness remains stable.
 * @param {Object|null} cdcIntegrationService - CDC integration service.
 * @param {Object} logger - Entrypoint logger.
 * @param {Object} rolloutControls - Startup rollout control map.
 * @param {Object|null} readinessState - Readiness owner for traffic stability.
 * @return {{getService: Function, promise: Promise<LogsTableService|null>, cancel: Function}}
 */
function startLogsTablePersistence(cdcIntegrationService, logger, rolloutControls, readinessState) {
  if (stryMutAct_9fa48("80880")) {
    {}
  } else {
    stryCov_9fa48("80880");
    return startLogsTablePersistenceOnReadiness(stryMutAct_9fa48("80881") ? {} : (stryCov_9fa48("80881"), {
      readinessState,
      logger,
      start: stryMutAct_9fa48("80882") ? () => undefined : (stryCov_9fa48("80882"), () => connectLogsTablePersistence(cdcIntegrationService, logger, rolloutControls))
    }));
  }
}

/**
 * Shutdown logs table persistence with best-effort semantics.
 * @param {LogsTableService|null} logsTableService - Logs table service instance.
 * @param {Object} logger - Entrypoint logger.
 * @return {Promise<void>}
 */
async function shutdownLogsTablePersistence(logsTableService, logger) {
  if (stryMutAct_9fa48("80883")) {
    {}
  } else {
    stryCov_9fa48("80883");
    if (stryMutAct_9fa48("80886") ? false : stryMutAct_9fa48("80885") ? true : stryMutAct_9fa48("80884") ? logsTableService : (stryCov_9fa48("80884", "80885", "80886"), !logsTableService)) {
      if (stryMutAct_9fa48("80887")) {
        {}
      } else {
        stryCov_9fa48("80887");
        return;
      }
    }
    try {
      if (stryMutAct_9fa48("80888")) {
        {}
      } else {
        stryCov_9fa48("80888");
        await logsTableService.shutdown();
      }
    } catch (error) {
      if (stryMutAct_9fa48("80889")) {
        {}
      } else {
        stryCov_9fa48("80889");
        logger.warn(ENTRYPOINT_LOG_MSG.LOGS_TABLE_SHUTDOWN_FAILED, stryMutAct_9fa48("80890") ? {} : (stryCov_9fa48("80890"), {
          error: error.message
        }));
      }
    }
  }
}

/**
 * Publish one best-effort terminal node row before tearing down the
 * control-plane path during process shutdown.
 * @param {Object|null} heartbeatService
 * @param {Object} logger
 * @param {string} nodeId
 * @return {Promise<void>}
 */
async function publishNodeShutdownStatus(heartbeatService, logger, nodeId) {
  if (stryMutAct_9fa48("80891")) {
    {}
  } else {
    stryCov_9fa48("80891");
    if (stryMutAct_9fa48("80894") ? typeof heartbeatService?.reportNodeShutdown === 'function' : stryMutAct_9fa48("80893") ? false : stryMutAct_9fa48("80892") ? true : (stryCov_9fa48("80892", "80893", "80894"), typeof (stryMutAct_9fa48("80895") ? heartbeatService.reportNodeShutdown : (stryCov_9fa48("80895"), heartbeatService?.reportNodeShutdown)) !== (stryMutAct_9fa48("80896") ? "" : (stryCov_9fa48("80896"), 'function')))) {
      if (stryMutAct_9fa48("80897")) {
        {}
      } else {
        stryCov_9fa48("80897");
        return;
      }
    }
    try {
      if (stryMutAct_9fa48("80898")) {
        {}
      } else {
        stryCov_9fa48("80898");
        await heartbeatService.reportNodeShutdown();
      }
    } catch (error) {
      if (stryMutAct_9fa48("80899")) {
        {}
      } else {
        stryCov_9fa48("80899");
        logger.warn(stryMutAct_9fa48("80900") ? "" : (stryCov_9fa48("80900"), 'Failed to publish node shutdown status'), stryMutAct_9fa48("80901") ? {} : (stryCov_9fa48("80901"), {
          nodeId,
          error: error.message
        }));
      }
    }
  }
}

/**
 * Start runtime dynamic configuration wiring.
 * @param {Object} options
 * @param {Object} logger
 * @return {Promise<Object|null>}
 */
async function startDynamicConfigWiring(options, logger) {
  if (stryMutAct_9fa48("80902")) {
    {}
  } else {
    stryCov_9fa48("80902");
    try {
      if (stryMutAct_9fa48("80903")) {
        {}
      } else {
        stryCov_9fa48("80903");
        return await createDynamicConfigStartupWiring(options);
      }
    } catch (error) {
      if (stryMutAct_9fa48("80904")) {
        {}
      } else {
        stryCov_9fa48("80904");
        logger.warn(ENTRYPOINT_LOG_MSG.DYNAMIC_CONFIG_WIRING_FAILED, stryMutAct_9fa48("80905") ? {} : (stryCov_9fa48("80905"), {
          error: error.message
        }));
        return null;
      }
    }
  }
}

/**
 * Stop runtime dynamic configuration wiring.
 * @param {Object|null} dynamicConfigWiring
 * @param {Object} logger
 */
function shutdownDynamicConfigWiring(dynamicConfigWiring, logger) {
  if (stryMutAct_9fa48("80906")) {
    {}
  } else {
    stryCov_9fa48("80906");
    if (stryMutAct_9fa48("80909") ? false : stryMutAct_9fa48("80908") ? true : stryMutAct_9fa48("80907") ? dynamicConfigWiring : (stryCov_9fa48("80907", "80908", "80909"), !dynamicConfigWiring)) {
      if (stryMutAct_9fa48("80910")) {
        {}
      } else {
        stryCov_9fa48("80910");
        return;
      }
    }
    try {
      if (stryMutAct_9fa48("80911")) {
        {}
      } else {
        stryCov_9fa48("80911");
        dynamicConfigWiring.shutdown();
      }
    } catch (error) {
      if (stryMutAct_9fa48("80912")) {
        {}
      } else {
        stryCov_9fa48("80912");
        logger.warn(ENTRYPOINT_LOG_MSG.DYNAMIC_CONFIG_WIRING_SHUTDOWN_FAILED, stryMutAct_9fa48("80913") ? {} : (stryCov_9fa48("80913"), {
          error: error.message
        }));
      }
    }
  }
}

/**
 * Wire readiness transition diagnostics for one startup branch.
 * @param {Object} readinessState
 * @param {Object} logger
 * @param {string} nodeId
 */
function wireReadinessStateDiagnostics(readinessState, logger, nodeId) {
  if (stryMutAct_9fa48("80914")) {
    {}
  } else {
    stryCov_9fa48("80914");
    readinessState.on(READINESS_EVENT.TRANSITION, transition => {
      if (stryMutAct_9fa48("80915")) {
        {}
      } else {
        stryCov_9fa48("80915");
        logger.info(ENTRYPOINT_LOG_MSG.READINESS_TRANSITION, stryMutAct_9fa48("80916") ? {} : (stryCov_9fa48("80916"), {
          nodeId,
          previousState: transition.previousState,
          previousReady: transition.previousReady,
          state: transition.state,
          ready: transition.ready,
          reasons: transition.reasons,
          timestamp: transition.timestamp
        }));
      }
    });
    readinessState.on(READINESS_EVENT.BLOCKED_DURATION, event => {
      if (stryMutAct_9fa48("80917")) {
        {}
      } else {
        stryCov_9fa48("80917");
        logger.info(ENTRYPOINT_LOG_MSG.READINESS_BLOCKED_DURATION, stryMutAct_9fa48("80918") ? {} : (stryCov_9fa48("80918"), {
          nodeId,
          reason: event.reason,
          durationMs: event.durationMs,
          totalDurationMs: event.totalDurationMs,
          timestamp: event.timestamp
        }));
      }
    });
  }
}

/**
 * Create a readiness owner with shared entrypoint diagnostics wiring.
 * @param {Object} logger
 * @param {string} nodeId
 * @return {BootstrapReadinessState}
 */
function createReadinessStateWithDiagnostics(logger, nodeId) {
  if (stryMutAct_9fa48("80919")) {
    {}
  } else {
    stryCov_9fa48("80919");
    const readinessState = new BootstrapReadinessState();
    wireReadinessStateDiagnostics(readinessState, logger, nodeId);
    return readinessState;
  }
}

/**
 * Emit one runtime handoff snapshot after bootstrap or join startup.
 * @param {Object} options
 * @param {Object} options.logger
 * @param {string} options.nodeId
 * @param {string} options.startupBranch
 * @param {Object|null} options.bootstrapAPI
 * @param {Object|null} options.startupOwner
 * @param {Object|null} options.adminRuntime
 */
function reportStartupRuntimeHandoff(options) {
  if (stryMutAct_9fa48("80920")) {
    {}
  } else {
    stryCov_9fa48("80920");
    if (stryMutAct_9fa48("80923") ? !options?.logger && typeof options.logger.info !== 'function' : stryMutAct_9fa48("80922") ? false : stryMutAct_9fa48("80921") ? true : (stryCov_9fa48("80921", "80922", "80923"), (stryMutAct_9fa48("80924") ? options?.logger : (stryCov_9fa48("80924"), !(stryMutAct_9fa48("80925") ? options.logger : (stryCov_9fa48("80925"), options?.logger)))) || (stryMutAct_9fa48("80927") ? typeof options.logger.info === 'function' : stryMutAct_9fa48("80926") ? false : (stryCov_9fa48("80926", "80927"), typeof options.logger.info !== (stryMutAct_9fa48("80928") ? "" : (stryCov_9fa48("80928"), 'function')))))) {
      if (stryMutAct_9fa48("80929")) {
        {}
      } else {
        stryCov_9fa48("80929");
        return;
      }
    }
    options.logger.info(ENTRYPOINT_LOG_MSG.STARTUP_RUNTIME_HANDOFF, stryMutAct_9fa48("80930") ? {} : (stryCov_9fa48("80930"), {
      nodeId: options.nodeId,
      startupBranch: options.startupBranch,
      startupPhase: stryMutAct_9fa48("80933") ? (options.startupOwner?.phase || options.bootstrapAPI?.bootstrapService?.phase) && null : stryMutAct_9fa48("80932") ? false : stryMutAct_9fa48("80931") ? true : (stryCov_9fa48("80931", "80932", "80933"), (stryMutAct_9fa48("80935") ? options.startupOwner?.phase && options.bootstrapAPI?.bootstrapService?.phase : stryMutAct_9fa48("80934") ? false : (stryCov_9fa48("80934", "80935"), (stryMutAct_9fa48("80936") ? options.startupOwner.phase : (stryCov_9fa48("80936"), options.startupOwner?.phase)) || (stryMutAct_9fa48("80938") ? options.bootstrapAPI.bootstrapService?.phase : stryMutAct_9fa48("80937") ? options.bootstrapAPI?.bootstrapService.phase : (stryCov_9fa48("80937", "80938"), options.bootstrapAPI?.bootstrapService?.phase)))) || null),
      bootstrapApiHasSqlQueryEngine: Boolean(stryMutAct_9fa48("80939") ? options.bootstrapAPI.sqlQueryEngine : (stryCov_9fa48("80939"), options.bootstrapAPI?.sqlQueryEngine)),
      bootstrapApiHasMessageRouter: Boolean(stryMutAct_9fa48("80940") ? options.bootstrapAPI.messageRouter : (stryCov_9fa48("80940"), options.bootstrapAPI?.messageRouter)),
      bootstrapApiHasStartupRecoveryCoordinator: Boolean(stryMutAct_9fa48("80941") ? options.bootstrapAPI.startupRecoveryCoordinator : (stryCov_9fa48("80941"), options.bootstrapAPI?.startupRecoveryCoordinator)),
      adminRuntimeStarted: Boolean(stryMutAct_9fa48("80942") ? options.adminRuntime.adminAPI : (stryCov_9fa48("80942"), options.adminRuntime?.adminAPI)),
      adminPort: stryMutAct_9fa48("80943") ? options.adminRuntime?.adminPort && null : (stryCov_9fa48("80943"), (stryMutAct_9fa48("80944") ? options.adminRuntime.adminPort : (stryCov_9fa48("80944"), options.adminRuntime?.adminPort)) ?? null)
    }));
  }
}

/**
 * Resolve runtime-facing node addresses from config.
 * @param {Object} config
 * @return {{
 *   restApiPort: number,
 *   wsPort: number,
 *   nodeHttpAddress: string,
 *   advertisedNodeWsAddress: string
 * }}
 */
function resolveRuntimeAddresses(config) {
  if (stryMutAct_9fa48("80945")) {
    {}
  } else {
    stryCov_9fa48("80945");
    const restApiPort = stryMutAct_9fa48("80948") ? config.get(CONFIG_KEY.NODE_REST_API_PORT) && ENTRYPOINT_DEFAULT.REST_API_PORT : stryMutAct_9fa48("80947") ? false : stryMutAct_9fa48("80946") ? true : (stryCov_9fa48("80946", "80947", "80948"), config.get(CONFIG_KEY.NODE_REST_API_PORT) || ENTRYPOINT_DEFAULT.REST_API_PORT);
    const wsPort = stryMutAct_9fa48("80951") ? config.get(CONFIG_KEY.NODE_WS_PORT) && restApiPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : stryMutAct_9fa48("80950") ? false : stryMutAct_9fa48("80949") ? true : (stryCov_9fa48("80949", "80950", "80951"), config.get(CONFIG_KEY.NODE_WS_PORT) || (stryMutAct_9fa48("80952") ? restApiPort - ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : (stryCov_9fa48("80952"), restApiPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET)));
    const nodeHttpAddress = stryMutAct_9fa48("80955") ? config.get(CONFIG_KEY.NODE_ADDRESS) && `${ENTRYPOINT_DEFAULT.LOCALHOST}:${restApiPort}` : stryMutAct_9fa48("80954") ? false : stryMutAct_9fa48("80953") ? true : (stryCov_9fa48("80953", "80954", "80955"), config.get(CONFIG_KEY.NODE_ADDRESS) || (stryMutAct_9fa48("80956") ? `` : (stryCov_9fa48("80956"), `${ENTRYPOINT_DEFAULT.LOCALHOST}:${restApiPort}`)));
    const advertisedNodeWsAddress = resolveAdvertisedWebSocketAddress(stryMutAct_9fa48("80957") ? {} : (stryCov_9fa48("80957"), {
      advertisedAddress: config.get(CONFIG_KEY.NODE_ADVERTISED_WS_ADDRESS),
      nodeAddress: nodeHttpAddress,
      wsPort,
      wsHost: config.get(TRANSPORT_CONFIG_KEY.WS_HOST)
    }));
    return stryMutAct_9fa48("80958") ? {} : (stryCov_9fa48("80958"), {
      restApiPort,
      wsPort,
      nodeHttpAddress,
      advertisedNodeWsAddress
    });
  }
}

/**
 * Probe one persisted peer address for auto-rejoin.
 * @param {string} peerAddress
 * @return {Promise<boolean>}
 */
async function probeAutoRejoinPeerAddress(peerAddress) {
  if (stryMutAct_9fa48("80959")) {
    {}
  } else {
    stryCov_9fa48("80959");
    const normalizedPeerAddress = String(stryMutAct_9fa48("80962") ? peerAddress && '' : stryMutAct_9fa48("80961") ? false : stryMutAct_9fa48("80960") ? true : (stryCov_9fa48("80960", "80961", "80962"), peerAddress || (stryMutAct_9fa48("80963") ? "Stryker was here!" : (stryCov_9fa48("80963"), ''))));
    if (stryMutAct_9fa48("80966") ? normalizedPeerAddress.length !== 0 : stryMutAct_9fa48("80965") ? false : stryMutAct_9fa48("80964") ? true : (stryCov_9fa48("80964", "80965", "80966"), normalizedPeerAddress.length === 0)) {
      if (stryMutAct_9fa48("80967")) {
        {}
      } else {
        stryCov_9fa48("80967");
        return stryMutAct_9fa48("80968") ? true : (stryCov_9fa48("80968"), false);
      }
    }
    const baseUrl = (stryMutAct_9fa48("80969") ? normalizedPeerAddress.endsWith('http') : (stryCov_9fa48("80969"), normalizedPeerAddress.startsWith(stryMutAct_9fa48("80970") ? "" : (stryCov_9fa48("80970"), 'http')))) ? normalizedPeerAddress : stryMutAct_9fa48("80971") ? `` : (stryCov_9fa48("80971"), `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${normalizedPeerAddress}`);
    try {
      if (stryMutAct_9fa48("80972")) {
        {}
      } else {
        stryCov_9fa48("80972");
        const response = await fetch(stryMutAct_9fa48("80973") ? `` : (stryCov_9fa48("80973"), `${baseUrl}${ENTRYPOINT_DEFAULT.AUTO_REJOIN_HEALTH_PATH}`), stryMutAct_9fa48("80974") ? {} : (stryCov_9fa48("80974"), {
          method: stryMutAct_9fa48("80975") ? "" : (stryCov_9fa48("80975"), 'GET'),
          signal: AbortSignal.timeout(ENTRYPOINT_DEFAULT.AUTO_REJOIN_PROBE_TIMEOUT_MS)
        }));
        return response.ok;
      }
    } catch (_error) {
      if (stryMutAct_9fa48("80976")) {
        {}
      } else {
        stryCov_9fa48("80976");
        return stryMutAct_9fa48("80977") ? true : (stryCov_9fa48("80977"), false);
      }
    }
  }
}

/**
 * Resolve one startup join decision from explicit config or persisted rejoin hints.
 * @param {Object} options
 * @param {Object} options.cliArgs
 * @param {Object} options.env
 * @param {Object} options.config
 * @param {Object} options.dataDirectoryManager
 * @param {Object} options.logger
 * @return {Promise<{
 *   seedNodeAddress: string|null,
 *   startupMode: string,
 *   source: string,
 * }>}
 */
async function resolveStartupJoinDecision(options) {
  if (stryMutAct_9fa48("80978")) {
    {}
  } else {
    stryCov_9fa48("80978");
    const explicitSeedNodeAddress = stryMutAct_9fa48("80981") ? options.cliArgs.seedNodeAddress && options.env[ENTRYPOINT_ENV.SEED_NODE_ADDRESS] : stryMutAct_9fa48("80980") ? false : stryMutAct_9fa48("80979") ? true : (stryCov_9fa48("80979", "80980", "80981"), options.cliArgs.seedNodeAddress || options.env[ENTRYPOINT_ENV.SEED_NODE_ADDRESS]);
    const nodeId = options.config.get(CONFIG_KEY.NODE_ID);
    const {
      nodeHttpAddress
    } = resolveRuntimeAddresses(options.config);
    const autoRejoinDecision = await resolveAutoRejoinStartupDecision(stryMutAct_9fa48("80982") ? {} : (stryCov_9fa48("80982"), {
      dataDir: options.dataDirectoryManager.getDataDir(),
      nodeId,
      nodeAddress: nodeHttpAddress,
      probePeerAddress: probeAutoRejoinPeerAddress
    }));
    options.logger.info(ENTRYPOINT_LOG_MSG.AUTO_REJOIN_DECISION, stryMutAct_9fa48("80983") ? {} : (stryCov_9fa48("80983"), {
      nodeId,
      nodeAddress: nodeHttpAddress,
      explicitSeedNodeAddress: stryMutAct_9fa48("80986") ? explicitSeedNodeAddress && null : stryMutAct_9fa48("80985") ? false : stryMutAct_9fa48("80984") ? true : (stryCov_9fa48("80984", "80985", "80986"), explicitSeedNodeAddress || null),
      mode: autoRejoinDecision.mode,
      source: autoRejoinDecision.source,
      startupMode: autoRejoinDecision.startupMode,
      peerAddress: stryMutAct_9fa48("80989") ? autoRejoinDecision.peerAddress && null : stryMutAct_9fa48("80988") ? false : stryMutAct_9fa48("80987") ? true : (stryCov_9fa48("80987", "80988", "80989"), autoRejoinDecision.peerAddress || null),
      durableStateDetected: stryMutAct_9fa48("80992") ? autoRejoinDecision.durableStateDetected !== true : stryMutAct_9fa48("80991") ? false : stryMutAct_9fa48("80990") ? true : (stryCov_9fa48("80990", "80991", "80992"), autoRejoinDecision.durableStateDetected === (stryMutAct_9fa48("80993") ? false : (stryCov_9fa48("80993"), true))),
      identityMismatch: stryMutAct_9fa48("80996") ? autoRejoinDecision.identityMismatch !== true : stryMutAct_9fa48("80995") ? false : stryMutAct_9fa48("80994") ? true : (stryCov_9fa48("80994", "80995", "80996"), autoRejoinDecision.identityMismatch === (stryMutAct_9fa48("80997") ? false : (stryCov_9fa48("80997"), true)))
    }));
    if (stryMutAct_9fa48("80999") ? false : stryMutAct_9fa48("80998") ? true : (stryCov_9fa48("80998", "80999"), explicitSeedNodeAddress)) {
      if (stryMutAct_9fa48("81000")) {
        {}
      } else {
        stryCov_9fa48("81000");
        if (stryMutAct_9fa48("81003") ? autoRejoinDecision.identityMismatch !== true : stryMutAct_9fa48("81002") ? false : stryMutAct_9fa48("81001") ? true : (stryCov_9fa48("81001", "81002", "81003"), autoRejoinDecision.identityMismatch === (stryMutAct_9fa48("81004") ? false : (stryCov_9fa48("81004"), true)))) {
          if (stryMutAct_9fa48("81005")) {
            {}
          } else {
            stryCov_9fa48("81005");
            throw new Error(autoRejoinDecision.error);
          }
        }
        return stryMutAct_9fa48("81006") ? {} : (stryCov_9fa48("81006"), {
          seedNodeAddress: explicitSeedNodeAddress,
          startupMode: (stryMutAct_9fa48("81009") ? autoRejoinDecision.startupMode !== STARTUP_JOIN_MODE.DURABLE_REJOIN : stryMutAct_9fa48("81008") ? false : stryMutAct_9fa48("81007") ? true : (stryCov_9fa48("81007", "81008", "81009"), autoRejoinDecision.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN)) ? STARTUP_JOIN_MODE.DURABLE_REJOIN : STARTUP_JOIN_MODE.FRESH_JOIN,
          source: stryMutAct_9fa48("81010") ? "" : (stryCov_9fa48("81010"), 'explicit')
        });
      }
    }
    if (stryMutAct_9fa48("81013") ? autoRejoinDecision.mode !== 'fail' : stryMutAct_9fa48("81012") ? false : stryMutAct_9fa48("81011") ? true : (stryCov_9fa48("81011", "81012", "81013"), autoRejoinDecision.mode === (stryMutAct_9fa48("81014") ? "" : (stryCov_9fa48("81014"), 'fail')))) {
      if (stryMutAct_9fa48("81015")) {
        {}
      } else {
        stryCov_9fa48("81015");
        throw new Error(autoRejoinDecision.error);
      }
    }
    if (stryMutAct_9fa48("81018") ? autoRejoinDecision.mode === 'join' : stryMutAct_9fa48("81017") ? false : stryMutAct_9fa48("81016") ? true : (stryCov_9fa48("81016", "81017", "81018"), autoRejoinDecision.mode !== (stryMutAct_9fa48("81019") ? "" : (stryCov_9fa48("81019"), 'join')))) {
      if (stryMutAct_9fa48("81020")) {
        {}
      } else {
        stryCov_9fa48("81020");
        return stryMutAct_9fa48("81021") ? {} : (stryCov_9fa48("81021"), {
          seedNodeAddress: null,
          startupMode: STARTUP_JOIN_MODE.SEED,
          source: autoRejoinDecision.source
        });
      }
    }
    options.logger.info(ENTRYPOINT_LOG_MSG.AUTO_REJOINING_CLUSTER, stryMutAct_9fa48("81022") ? {} : (stryCov_9fa48("81022"), {
      nodeId,
      peerAddress: autoRejoinDecision.peerAddress,
      source: autoRejoinDecision.source,
      startupMode: autoRejoinDecision.startupMode
    }));
    return stryMutAct_9fa48("81023") ? {} : (stryCov_9fa48("81023"), {
      seedNodeAddress: autoRejoinDecision.peerAddress,
      startupMode: autoRejoinDecision.startupMode,
      source: autoRejoinDecision.source
    });
  }
}

/**
 * Start durable rejoin-hint persistence for the current runtime.
 * @param {Object} options
 * @param {string} options.dataDir
 * @param {string} options.nodeId
 * @param {string} options.nodeAddress
 * @param {string} options.nodeRole
 * @param {Function} options.getSystemTableCache
 * @param {Object} options.logger
 * @return {RejoinHintsPersistenceService}
 */
function startRejoinHintsPersistence(options) {
  if (stryMutAct_9fa48("81024")) {
    {}
  } else {
    stryCov_9fa48("81024");
    const persistence = new RejoinHintsPersistenceService(stryMutAct_9fa48("81025") ? {} : (stryCov_9fa48("81025"), {
      dataDir: options.dataDir,
      nodeId: options.nodeId,
      nodeAddress: options.nodeAddress,
      nodeRole: options.nodeRole,
      getSystemTableCache: options.getSystemTableCache,
      logger: options.logger
    }));
    persistence.start();
    return persistence;
  }
}

/**
 * Hydrate runtime-owned service references into an already-initialized
 * BootstrapAPI instance.
 * @param {Object} options
 * @param {BootstrapAPI} options.bootstrapAPI
 * @param {Object} options.systemTableCache
 * @param {Map} options.messageGroupServices
 * @param {Map} options.partitionServices
 * @param {Object|null} options.replicaHandler
 * @param {Object|null} options.epochManager
 * @param {Object|null} options.messageRouter
 */
function hydrateBootstrapApiRuntime(options) {
  if (stryMutAct_9fa48("81026")) {
    {}
  } else {
    stryCov_9fa48("81026");
    options.bootstrapAPI.systemTableCache = options.systemTableCache;
    options.bootstrapAPI.messageGroupServices = options.messageGroupServices;
    options.bootstrapAPI.partitionServices = options.partitionServices;
    options.bootstrapAPI.replicaHandler = options.replicaHandler;
    options.bootstrapAPI.epochManager = options.epochManager;
    options.bootstrapAPI.messageRouter = options.messageRouter;
    if (stryMutAct_9fa48("81028") ? false : stryMutAct_9fa48("81027") ? true : (stryCov_9fa48("81027", "81028"), Object.hasOwn(options, stryMutAct_9fa48("81029") ? "" : (stryCov_9fa48("81029"), 'startupRecoveryCoordinator')))) {
      if (stryMutAct_9fa48("81030")) {
        {}
      } else {
        stryCov_9fa48("81030");
        options.bootstrapAPI.startupRecoveryCoordinator = stryMutAct_9fa48("81033") ? options.startupRecoveryCoordinator && null : stryMutAct_9fa48("81032") ? false : stryMutAct_9fa48("81031") ? true : (stryCov_9fa48("81031", "81032", "81033"), options.startupRecoveryCoordinator || null);
      }
    }
  }
}

/**
 * Resolve read/write system cache handles from one message-group map.
 * @param {Map} messageGroupServices
 * @return {{systemTableCache: Object|null, cacheMutationTarget: Object|null}}
 */
function resolveSystemCacheHandles(messageGroupServices) {
  if (stryMutAct_9fa48("81034")) {
    {}
  } else {
    stryCov_9fa48("81034");
    let systemTableCache = null;
    let cacheMutationTarget = null;
    if (stryMutAct_9fa48("81037") ? !messageGroupServices && typeof messageGroupServices.values !== 'function' : stryMutAct_9fa48("81036") ? false : stryMutAct_9fa48("81035") ? true : (stryCov_9fa48("81035", "81036", "81037"), (stryMutAct_9fa48("81038") ? messageGroupServices : (stryCov_9fa48("81038"), !messageGroupServices)) || (stryMutAct_9fa48("81040") ? typeof messageGroupServices.values === 'function' : stryMutAct_9fa48("81039") ? false : (stryCov_9fa48("81039", "81040"), typeof messageGroupServices.values !== (stryMutAct_9fa48("81041") ? "" : (stryCov_9fa48("81041"), 'function')))))) {
      if (stryMutAct_9fa48("81042")) {
        {}
      } else {
        stryCov_9fa48("81042");
        return stryMutAct_9fa48("81043") ? {} : (stryCov_9fa48("81043"), {
          systemTableCache,
          cacheMutationTarget
        });
      }
    }
    for (const messageGroupService of messageGroupServices.values()) {
      if (stryMutAct_9fa48("81044")) {
        {}
      } else {
        stryCov_9fa48("81044");
        if (stryMutAct_9fa48("81046") ? false : stryMutAct_9fa48("81045") ? true : (stryCov_9fa48("81045", "81046"), messageGroupService.getReadOnlyCache)) {
          if (stryMutAct_9fa48("81047")) {
            {}
          } else {
            stryCov_9fa48("81047");
            systemTableCache = messageGroupService.getReadOnlyCache();
          }
        } else if (stryMutAct_9fa48("81049") ? false : stryMutAct_9fa48("81048") ? true : (stryCov_9fa48("81048", "81049"), messageGroupService.systemTableCache)) {
          if (stryMutAct_9fa48("81050")) {
            {}
          } else {
            stryCov_9fa48("81050");
            systemTableCache = messageGroupService.systemTableCache;
          }
        }
        if (stryMutAct_9fa48("81052") ? false : stryMutAct_9fa48("81051") ? true : (stryCov_9fa48("81051", "81052"), messageGroupService.getWritableCache)) {
          if (stryMutAct_9fa48("81053")) {
            {}
          } else {
            stryCov_9fa48("81053");
            cacheMutationTarget = messageGroupService.getWritableCache();
          }
        } else if (stryMutAct_9fa48("81055") ? false : stryMutAct_9fa48("81054") ? true : (stryCov_9fa48("81054", "81055"), messageGroupService.systemTableCache)) {
          if (stryMutAct_9fa48("81056")) {
            {}
          } else {
            stryCov_9fa48("81056");
            cacheMutationTarget = messageGroupService.systemTableCache;
          }
        }
        break;
      }
    }
    return stryMutAct_9fa48("81057") ? {} : (stryCov_9fa48("81057"), {
      systemTableCache,
      cacheMutationTarget
    });
  }
}

/**
 * Attach split-completion stabilization reset wiring for child partitions.
 * @param {Object} options
 * @param {Object} options.partitionSplitMergeManager
 * @param {Map} options.partitionServices
 */
function wireSplitCompletionStabilizationReset(options) {
  if (stryMutAct_9fa48("81058")) {
    {}
  } else {
    stryCov_9fa48("81058");
    options.partitionSplitMergeManager.on(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, result => {
      if (stryMutAct_9fa48("81059")) {
        {}
      } else {
        stryCov_9fa48("81059");
        const childPartitionIds = stryMutAct_9fa48("81060") ? [result?.leftPartition?.partitionId, result?.rightPartition?.partitionId] : (stryCov_9fa48("81060"), (stryMutAct_9fa48("81061") ? [] : (stryCov_9fa48("81061"), [stryMutAct_9fa48("81063") ? result.leftPartition?.partitionId : stryMutAct_9fa48("81062") ? result?.leftPartition.partitionId : (stryCov_9fa48("81062", "81063"), result?.leftPartition?.partitionId), stryMutAct_9fa48("81065") ? result.rightPartition?.partitionId : stryMutAct_9fa48("81064") ? result?.rightPartition.partitionId : (stryCov_9fa48("81064", "81065"), result?.rightPartition?.partitionId)])).filter(Boolean));
        for (const childPartitionId of childPartitionIds) {
          if (stryMutAct_9fa48("81066")) {
            {}
          } else {
            stryCov_9fa48("81066");
            const partitionService = resolvePartitionServiceByPartitionId(options.partitionServices, childPartitionId);
            if (stryMutAct_9fa48("81069") ? false : stryMutAct_9fa48("81068") ? true : stryMutAct_9fa48("81067") ? partitionService?.rebalancer : (stryCov_9fa48("81067", "81068", "81069"), !(stryMutAct_9fa48("81070") ? partitionService.rebalancer : (stryCov_9fa48("81070"), partitionService?.rebalancer)))) {
              if (stryMutAct_9fa48("81071")) {
                {}
              } else {
                stryCov_9fa48("81071");
                continue;
              }
            }
            partitionService.rebalancer.recordStateChange(STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED);
          }
        }
      }
    });
  }
}

/**
 * Create SQL query engine + split manager composition for one runtime branch.
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {Object} options.systemTableCache
 * @param {Object|null} options.messageRouter
 * @param {Object} options.owner
 * @param {Map} options.partitionServices
 * @param {Object} options.logger
 * @return {Promise<{sqlQueryEngine: Object|null, detachMigrationRecovery: Function}>}
 */
async function createSqlRuntimeComposition(options) {
  if (stryMutAct_9fa48("81072")) {
    {}
  } else {
    stryCov_9fa48("81072");
    if (stryMutAct_9fa48("81075") ? false : stryMutAct_9fa48("81074") ? true : stryMutAct_9fa48("81073") ? options.messageRouter : (stryCov_9fa48("81073", "81074", "81075"), !options.messageRouter)) {
      if (stryMutAct_9fa48("81076")) {
        {}
      } else {
        stryCov_9fa48("81076");
        return stryMutAct_9fa48("81077") ? {} : (stryCov_9fa48("81077"), {
          sqlQueryEngine: null,
          detachMigrationRecovery: () => {}
        });
      }
    }
    const {
      SQLQueryEngine
    } = await import(stryMutAct_9fa48("81078") ? "" : (stryCov_9fa48("81078"), './query/sql-query-engine.js'));
    const wasmExecutor = createSqlCallbackWasmExecutor();
    const sqlQueryEngine = new SQLQueryEngine(stryMutAct_9fa48("81079") ? {} : (stryCov_9fa48("81079"), {
      systemCache: options.systemTableCache,
      messageRouter: options.messageRouter,
      cdcIntegrationService: options.owner.cdcIntegrationService,
      nodeId: options.nodeId,
      rebalanceCoordinator: options.owner.rebalanceCoordinator,
      controlPlaneReadinessService: stryMutAct_9fa48("81082") ? options.owner.rebalanceCoordinator?.controlPlaneReadinessService && null : stryMutAct_9fa48("81081") ? false : stryMutAct_9fa48("81080") ? true : (stryCov_9fa48("81080", "81081", "81082"), (stryMutAct_9fa48("81083") ? options.owner.rebalanceCoordinator.controlPlaneReadinessService : (stryCov_9fa48("81083"), options.owner.rebalanceCoordinator?.controlPlaneReadinessService)) || null),
      runtimeDriverRegistry: options.owner.runtimeDriverRegistry,
      serviceRuntimeLifecycle: options.owner.serviceRuntimeLifecycle,
      wasmExecutor,
      migrationAutoWire: stryMutAct_9fa48("81084") ? true : (stryCov_9fa48("81084"), false),
      autoStartDistributedTransactionRecovery: stryMutAct_9fa48("81085") ? true : (stryCov_9fa48("81085"), false)
    }));
    wireMigrationWorkflowOwners(stryMutAct_9fa48("81086") ? {} : (stryCov_9fa48("81086"), {
      sqlCore: sqlQueryEngine,
      systemTableCache: options.systemTableCache,
      transactionCoordinator: sqlQueryEngine.transactionCoordinator,
      logger: options.logger,
      now: stryMutAct_9fa48("81087") ? () => undefined : (stryCov_9fa48("81087"), () => Date.now())
    }));
    const {
      PartitionSplitMergeManager
    } = await import(stryMutAct_9fa48("81088") ? "" : (stryCov_9fa48("81088"), './partition/partition-split-merge-manager.js'));
    const partitionSplitMergeManager = new PartitionSplitMergeManager(stryMutAct_9fa48("81089") ? {} : (stryCov_9fa48("81089"), {
      nodeId: options.nodeId,
      messageRouter: options.messageRouter,
      tablePolicyService: options.owner.tablePolicyService,
      listPartitions: stryMutAct_9fa48("81090") ? () => undefined : (stryCov_9fa48("81090"), () => sqlQueryEngine.listManagedSplitPartitions()),
      getPartitionMetrics: createManagedSplitMetricsProvider(stryMutAct_9fa48("81091") ? {} : (stryCov_9fa48("81091"), {
        partitionServices: options.partitionServices
      })),
      executeSplitCandidate: stryMutAct_9fa48("81092") ? () => undefined : (stryCov_9fa48("81092"), partitionId => sqlQueryEngine.executeManagedSplit(partitionId)),
      storageAdmissionService: stryMutAct_9fa48("81095") ? options.owner.rebalanceCoordinator?.storageAdmissionService && null : stryMutAct_9fa48("81094") ? false : stryMutAct_9fa48("81093") ? true : (stryCov_9fa48("81093", "81094", "81095"), (stryMutAct_9fa48("81096") ? options.owner.rebalanceCoordinator.storageAdmissionService : (stryCov_9fa48("81096"), options.owner.rebalanceCoordinator?.storageAdmissionService)) || null),
      storageAccountingService: stryMutAct_9fa48("81099") ? options.owner.rebalanceCoordinator?.storageAccountingService && null : stryMutAct_9fa48("81098") ? false : stryMutAct_9fa48("81097") ? true : (stryCov_9fa48("81097", "81098", "81099"), (stryMutAct_9fa48("81100") ? options.owner.rebalanceCoordinator.storageAccountingService : (stryCov_9fa48("81100"), options.owner.rebalanceCoordinator?.storageAccountingService)) || null)
    }));
    sqlQueryEngine.setPartitionSplitMergeManager(partitionSplitMergeManager);
    wireSplitCompletionStabilizationReset(stryMutAct_9fa48("81101") ? {} : (stryCov_9fa48("81101"), {
      partitionSplitMergeManager,
      partitionServices: options.partitionServices
    }));
    const detachMigrationRecovery = wireMigrationRecoveryOnLeaderElection(stryMutAct_9fa48("81102") ? {} : (stryCov_9fa48("81102"), {
      sqlQueryEngine,
      partitionServices: options.partitionServices,
      logger: options.logger
    }));
    return stryMutAct_9fa48("81103") ? {} : (stryCov_9fa48("81103"), {
      sqlQueryEngine,
      detachMigrationRecovery
    });
  }
}

/**
 * Start admin + live query startup composition.
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {Object} options.systemTableCache
 * @param {Object|null} options.cacheMutationTarget
 * @param {Object|null} options.sqlQueryEngine
 * @param {Object} options.owner
 * @param {Object|null} options.messageRouter
 * @param {Map} options.partitionServices
 * @return {Promise<{adminAPI: Object, liveQueryWiring: Object, adminPort: number}>}
 */
async function startAdminRuntimeComposition(options) {
  if (stryMutAct_9fa48("81104")) {
    {}
  } else {
    stryCov_9fa48("81104");
    const adminStartup = createAdminAPIWithLiveQuery(stryMutAct_9fa48("81105") ? {} : (stryCov_9fa48("81105"), {
      nodeId: options.nodeId,
      systemTableCache: options.systemTableCache,
      cacheMutationTarget: stryMutAct_9fa48("81108") ? options.cacheMutationTarget && options.systemTableCache : stryMutAct_9fa48("81107") ? false : stryMutAct_9fa48("81106") ? true : (stryCov_9fa48("81106", "81107", "81108"), options.cacheMutationTarget || options.systemTableCache),
      sqlQueryEngine: stryMutAct_9fa48("81111") ? options.sqlQueryEngine && null : stryMutAct_9fa48("81110") ? false : stryMutAct_9fa48("81109") ? true : (stryCov_9fa48("81109", "81110", "81111"), options.sqlQueryEngine || null),
      cdcIntegrationService: options.owner.cdcIntegrationService,
      messageRouter: options.messageRouter,
      serviceDiagnosticsProvider: createServiceDiagnosticsProvider(options.owner),
      heartbeatService: options.owner.heartbeatService,
      startupRecoveryCoordinator: stryMutAct_9fa48("81114") ? options.owner.rebalanceCoordinator?.startupRecoveryCoordinator && null : stryMutAct_9fa48("81113") ? false : stryMutAct_9fa48("81112") ? true : (stryCov_9fa48("81112", "81113", "81114"), (stryMutAct_9fa48("81115") ? options.owner.rebalanceCoordinator.startupRecoveryCoordinator : (stryCov_9fa48("81115"), options.owner.rebalanceCoordinator?.startupRecoveryCoordinator)) || null),
      bootstrapReadinessState: stryMutAct_9fa48("81118") ? options.owner.bootstrapReadinessState && null : stryMutAct_9fa48("81117") ? false : stryMutAct_9fa48("81116") ? true : (stryCov_9fa48("81116", "81117", "81118"), options.owner.bootstrapReadinessState || null),
      partitionServicesProvider: stryMutAct_9fa48("81119") ? () => undefined : (stryCov_9fa48("81119"), () => options.partitionServices)
    }));
    const adminAPI = adminStartup.adminAPI;
    const liveQueryWiring = adminStartup.liveQueryWiring;
    const adminPort = ADMIN_DEFAULT.WEBSOCKET_PORT;
    await adminAPI.initialize(adminPort);
    const logger = stryMutAct_9fa48("81120") ? options.owner.logger : (stryCov_9fa48("81120"), options.owner?.logger);
    if (stryMutAct_9fa48("81123") ? logger || typeof logger.info === 'function' : stryMutAct_9fa48("81122") ? false : stryMutAct_9fa48("81121") ? true : (stryCov_9fa48("81121", "81122", "81123"), logger && (stryMutAct_9fa48("81125") ? typeof logger.info !== 'function' : stryMutAct_9fa48("81124") ? true : (stryCov_9fa48("81124", "81125"), typeof logger.info === (stryMutAct_9fa48("81126") ? "" : (stryCov_9fa48("81126"), 'function')))))) {
      if (stryMutAct_9fa48("81127")) {
        {}
      } else {
        stryCov_9fa48("81127");
        logger.info(ENTRYPOINT_LOG_MSG.ADMIN_RUNTIME_STARTED, stryMutAct_9fa48("81128") ? {} : (stryCov_9fa48("81128"), {
          nodeId: options.nodeId,
          adminPort,
          hasSqlQueryEngine: Boolean(options.sqlQueryEngine),
          hasMessageRouter: Boolean(options.messageRouter),
          partitionServiceCount: Number.isFinite(stryMutAct_9fa48("81129") ? options.partitionServices.size : (stryCov_9fa48("81129"), options.partitionServices?.size)) ? options.partitionServices.size : null
        }));
      }
    }
    return stryMutAct_9fa48("81130") ? {} : (stryCov_9fa48("81130"), {
      nodeId: options.nodeId,
      adminAPI,
      liveQueryWiring,
      adminPort
    });
  }
}

/**
 * Attach the SQL engine to an already-started admin runtime.
 * This allows the local admin health/socket surface to come up before
 * full cluster publication converges, while SQL-backed admin actions
 * activate later in the startup sequence.
 * @param {Object|null} adminRuntime
 * @param {Object|null} sqlQueryEngine
 * @return {void}
 */
function attachSqlEngineToAdminRuntime(adminRuntime, sqlQueryEngine) {
  if (stryMutAct_9fa48("81131")) {
    {}
  } else {
    stryCov_9fa48("81131");
    if (stryMutAct_9fa48("81134") ? !adminRuntime && !sqlQueryEngine : stryMutAct_9fa48("81133") ? false : stryMutAct_9fa48("81132") ? true : (stryCov_9fa48("81132", "81133", "81134"), (stryMutAct_9fa48("81135") ? adminRuntime : (stryCov_9fa48("81135"), !adminRuntime)) || (stryMutAct_9fa48("81136") ? sqlQueryEngine : (stryCov_9fa48("81136"), !sqlQueryEngine)))) {
      if (stryMutAct_9fa48("81137")) {
        {}
      } else {
        stryCov_9fa48("81137");
        return;
      }
    }
    const logger = stryMutAct_9fa48("81138") ? adminRuntime.adminAPI.logger : (stryCov_9fa48("81138"), adminRuntime.adminAPI?.logger);
    if (stryMutAct_9fa48("81141") ? typeof adminRuntime.adminAPI?.setSQLQueryEngine !== 'function' : stryMutAct_9fa48("81140") ? false : stryMutAct_9fa48("81139") ? true : (stryCov_9fa48("81139", "81140", "81141"), typeof (stryMutAct_9fa48("81142") ? adminRuntime.adminAPI.setSQLQueryEngine : (stryCov_9fa48("81142"), adminRuntime.adminAPI?.setSQLQueryEngine)) === (stryMutAct_9fa48("81143") ? "" : (stryCov_9fa48("81143"), 'function')))) {
      if (stryMutAct_9fa48("81144")) {
        {}
      } else {
        stryCov_9fa48("81144");
        adminRuntime.adminAPI.setSQLQueryEngine(sqlQueryEngine);
        if (stryMutAct_9fa48("81147") ? logger || typeof logger.info === 'function' : stryMutAct_9fa48("81146") ? false : stryMutAct_9fa48("81145") ? true : (stryCov_9fa48("81145", "81146", "81147"), logger && (stryMutAct_9fa48("81149") ? typeof logger.info !== 'function' : stryMutAct_9fa48("81148") ? true : (stryCov_9fa48("81148", "81149"), typeof logger.info === (stryMutAct_9fa48("81150") ? "" : (stryCov_9fa48("81150"), 'function')))))) {
          if (stryMutAct_9fa48("81151")) {
            {}
          } else {
            stryCov_9fa48("81151");
            logger.info(ENTRYPOINT_LOG_MSG.ADMIN_RUNTIME_SQL_ENGINE_ATTACHED, stryMutAct_9fa48("81152") ? {} : (stryCov_9fa48("81152"), {
              nodeId: stryMutAct_9fa48("81155") ? adminRuntime.nodeId && null : stryMutAct_9fa48("81154") ? false : stryMutAct_9fa48("81153") ? true : (stryCov_9fa48("81153", "81154", "81155"), adminRuntime.nodeId || null)
            }));
          }
        }
        return;
      }
    }
    if (stryMutAct_9fa48("81158") ? adminRuntime.liveQueryWiring?.liveQueryManager || typeof adminRuntime.liveQueryWiring.liveQueryManager.initialize === 'function' : stryMutAct_9fa48("81157") ? false : stryMutAct_9fa48("81156") ? true : (stryCov_9fa48("81156", "81157", "81158"), (stryMutAct_9fa48("81159") ? adminRuntime.liveQueryWiring.liveQueryManager : (stryCov_9fa48("81159"), adminRuntime.liveQueryWiring?.liveQueryManager)) && (stryMutAct_9fa48("81161") ? typeof adminRuntime.liveQueryWiring.liveQueryManager.initialize !== 'function' : stryMutAct_9fa48("81160") ? true : (stryCov_9fa48("81160", "81161"), typeof adminRuntime.liveQueryWiring.liveQueryManager.initialize === (stryMutAct_9fa48("81162") ? "" : (stryCov_9fa48("81162"), 'function')))))) {
      if (stryMutAct_9fa48("81163")) {
        {}
      } else {
        stryCov_9fa48("81163");
        adminRuntime.liveQueryWiring.liveQueryManager.initialize(stryMutAct_9fa48("81164") ? {} : (stryCov_9fa48("81164"), {
          sqlQueryEngine
        }));
        if (stryMutAct_9fa48("81167") ? logger || typeof logger.info === 'function' : stryMutAct_9fa48("81166") ? false : stryMutAct_9fa48("81165") ? true : (stryCov_9fa48("81165", "81166", "81167"), logger && (stryMutAct_9fa48("81169") ? typeof logger.info !== 'function' : stryMutAct_9fa48("81168") ? true : (stryCov_9fa48("81168", "81169"), typeof logger.info === (stryMutAct_9fa48("81170") ? "" : (stryCov_9fa48("81170"), 'function')))))) {
          if (stryMutAct_9fa48("81171")) {
            {}
          } else {
            stryCov_9fa48("81171");
            logger.info(ENTRYPOINT_LOG_MSG.ADMIN_RUNTIME_SQL_ENGINE_ATTACHED, stryMutAct_9fa48("81172") ? {} : (stryCov_9fa48("81172"), {
              nodeId: stryMutAct_9fa48("81175") ? adminRuntime.nodeId && null : stryMutAct_9fa48("81174") ? false : stryMutAct_9fa48("81173") ? true : (stryCov_9fa48("81173", "81174", "81175"), adminRuntime.nodeId || null)
            }));
          }
        }
      }
    }
  }
}

/**
 * Resolve logs table service from one startup persistence handle.
 * @param {Object|null} logsPersistence
 * @return {Promise<LogsTableService|null>}
 */
async function resolveLogsTableServiceFromPersistence(logsPersistence) {
  if (stryMutAct_9fa48("81176")) {
    {}
  } else {
    stryCov_9fa48("81176");
    if (stryMutAct_9fa48("81179") ? false : stryMutAct_9fa48("81178") ? true : stryMutAct_9fa48("81177") ? logsPersistence : (stryCov_9fa48("81177", "81178", "81179"), !logsPersistence)) {
      if (stryMutAct_9fa48("81180")) {
        {}
      } else {
        stryCov_9fa48("81180");
        return null;
      }
    }
    const syncService = stryMutAct_9fa48("81181") ? logsPersistence.getService() : (stryCov_9fa48("81181"), logsPersistence.getService?.());
    if (stryMutAct_9fa48("81183") ? false : stryMutAct_9fa48("81182") ? true : (stryCov_9fa48("81182", "81183"), syncService)) {
      if (stryMutAct_9fa48("81184")) {
        {}
      } else {
        stryCov_9fa48("81184");
        return syncService;
      }
    }
    return stryMutAct_9fa48("81187") ? logsPersistence.promise && null : stryMutAct_9fa48("81186") ? false : stryMutAct_9fa48("81185") ? true : (stryCov_9fa48("81185", "81186", "81187"), logsPersistence.promise || null);
  }
}

/**
 * Build one shared shutdown signal handler for seed/join branches.
 * @param {Object} options
 * @param {Object} options.logger
 * @param {string} options.nodeId
 * @param {Object} options.bootstrapAPI
 * @param {Object|null} options.heartbeatService
 * @param {Object|null} options.logsPersistence
 * @param {Object|null} options.rejoinHintsPersistence
 * @param {Object|null} options.dynamicConfigWiring
 * @param {Function} options.detachMigrationRecovery
 * @param {Function} options.ownerCleanup
 * @param {Object} options.adminAPI
 * @param {Object} options.liveQueryWiring
 * @param {string} options.failureMessage
 * @return {(signal: string) => Promise<void>}
 */
function createShutdownSignalHandler(options) {
  if (stryMutAct_9fa48("81188")) {
    {}
  } else {
    stryCov_9fa48("81188");
    let shutdownSignalCount = 0;
    return async signal => {
      if (stryMutAct_9fa48("81189")) {
        {}
      } else {
        stryCov_9fa48("81189");
        stryMutAct_9fa48("81190") ? shutdownSignalCount-- : (stryCov_9fa48("81190"), shutdownSignalCount++);
        if (stryMutAct_9fa48("81194") ? shutdownSignalCount <= 1 : stryMutAct_9fa48("81193") ? shutdownSignalCount >= 1 : stryMutAct_9fa48("81192") ? false : stryMutAct_9fa48("81191") ? true : (stryCov_9fa48("81191", "81192", "81193", "81194"), shutdownSignalCount > 1)) {
          if (stryMutAct_9fa48("81195")) {
            {}
          } else {
            stryCov_9fa48("81195");
            options.logger.warn(stryMutAct_9fa48("81196") ? "" : (stryCov_9fa48("81196"), 'Shutdown already in progress, forcing process exit'), stryMutAct_9fa48("81197") ? {} : (stryCov_9fa48("81197"), {
              signal
            }));
            process.exit(1);
            return;
          }
        }
        options.logger.info(ENTRYPOINT_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("81198") ? {} : (stryCov_9fa48("81198"), {
          signal
        }));
        try {
          if (stryMutAct_9fa48("81199")) {
            {}
          } else {
            stryCov_9fa48("81199");
            const drainDeadlineMs = stryMutAct_9fa48("81200") ? Date.now() - ENTRYPOINT_DEFAULT.READINESS_DRAIN_DEADLINE_MS : (stryCov_9fa48("81200"), Date.now() + ENTRYPOINT_DEFAULT.READINESS_DRAIN_DEADLINE_MS);
            const drainingSnapshot = (stryMutAct_9fa48("81203") ? typeof options.membershipLifecycleController?.submitDrainIntent !== 'function' : stryMutAct_9fa48("81202") ? false : stryMutAct_9fa48("81201") ? true : (stryCov_9fa48("81201", "81202", "81203"), typeof (stryMutAct_9fa48("81204") ? options.membershipLifecycleController.submitDrainIntent : (stryCov_9fa48("81204"), options.membershipLifecycleController?.submitDrainIntent)) === (stryMutAct_9fa48("81205") ? "" : (stryCov_9fa48("81205"), 'function')))) ? await options.membershipLifecycleController.submitDrainIntent(stryMutAct_9fa48("81206") ? {} : (stryCov_9fa48("81206"), {
              drainDeadlineMs,
              reasonCode: LIFECYCLE_REASON.NODE_DRAINING,
              signal
            })) : options.bootstrapAPI.markDraining(stryMutAct_9fa48("81207") ? {} : (stryCov_9fa48("81207"), {
              drainDeadlineMs
            }));
            options.logger.info(ENTRYPOINT_LOG_MSG.READINESS_DRAINING, stryMutAct_9fa48("81208") ? {} : (stryCov_9fa48("81208"), {
              nodeId: options.nodeId,
              phase: stryMutAct_9fa48("81211") ? drainingSnapshot?.phase && null : stryMutAct_9fa48("81210") ? false : stryMutAct_9fa48("81209") ? true : (stryCov_9fa48("81209", "81210", "81211"), (stryMutAct_9fa48("81212") ? drainingSnapshot.phase : (stryCov_9fa48("81212"), drainingSnapshot?.phase)) || null),
              reasons: stryMutAct_9fa48("81215") ? drainingSnapshot?.reasons && [] : stryMutAct_9fa48("81214") ? false : stryMutAct_9fa48("81213") ? true : (stryCov_9fa48("81213", "81214", "81215"), (stryMutAct_9fa48("81216") ? drainingSnapshot.reasons : (stryCov_9fa48("81216"), drainingSnapshot?.reasons)) || (stryMutAct_9fa48("81217") ? ["Stryker was here"] : (stryCov_9fa48("81217"), []))),
              drainDeadlineMs
            }));
            await publishNodeShutdownStatus(options.heartbeatService, options.logger, options.nodeId);
            stryMutAct_9fa48("81219") ? options.logsPersistence.cancel?.() : stryMutAct_9fa48("81218") ? options.logsPersistence?.cancel() : (stryCov_9fa48("81218", "81219"), options.logsPersistence?.cancel?.());
            const logsTableService = await resolveLogsTableServiceFromPersistence(options.logsPersistence);
            await shutdownLogsTablePersistence(logsTableService, options.logger);
            await (stryMutAct_9fa48("81221") ? options.rejoinHintsPersistence.stop?.() : stryMutAct_9fa48("81220") ? options.rejoinHintsPersistence?.stop() : (stryCov_9fa48("81220", "81221"), options.rejoinHintsPersistence?.stop?.()));
            shutdownDynamicConfigWiring(options.dynamicConfigWiring, options.logger);
            if (stryMutAct_9fa48("81224") ? typeof options.detachMigrationRecovery !== 'function' : stryMutAct_9fa48("81223") ? false : stryMutAct_9fa48("81222") ? true : (stryCov_9fa48("81222", "81223", "81224"), typeof options.detachMigrationRecovery === (stryMutAct_9fa48("81225") ? "" : (stryCov_9fa48("81225"), 'function')))) {
              if (stryMutAct_9fa48("81226")) {
                {}
              } else {
                stryCov_9fa48("81226");
                options.detachMigrationRecovery();
              }
            }
            await options.ownerCleanup();
            await options.bootstrapAPI.shutdown();
            await options.adminAPI.shutdown();
            options.liveQueryWiring.shutdown();
            process.exit(0);
          }
        } catch (error) {
          if (stryMutAct_9fa48("81227")) {
            {}
          } else {
            stryCov_9fa48("81227");
            options.logger.error(options.failureMessage, stryMutAct_9fa48("81228") ? {} : (stryCov_9fa48("81228"), {
              signal,
              error: error.message
            }));
            process.exit(1);
          }
        }
      }
    };
  }
}

/**
 * Register shared shutdown signal listeners for process lifecycle.
 * @param {Function} shutdownHandler
 */
function registerShutdownSignalHandlers(shutdownHandler) {
  if (stryMutAct_9fa48("81229")) {
    {}
  } else {
    stryCov_9fa48("81229");
    process.on(stryMutAct_9fa48("81230") ? "" : (stryCov_9fa48("81230"), 'SIGINT'), () => {
      if (stryMutAct_9fa48("81231")) {
        {}
      } else {
        stryCov_9fa48("81231");
        void shutdownHandler(stryMutAct_9fa48("81232") ? "" : (stryCov_9fa48("81232"), 'SIGINT'));
      }
    });
    process.on(stryMutAct_9fa48("81233") ? "" : (stryCov_9fa48("81233"), 'SIGTERM'), () => {
      if (stryMutAct_9fa48("81234")) {
        {}
      } else {
        stryCov_9fa48("81234");
        void shutdownHandler(stryMutAct_9fa48("81235") ? "" : (stryCov_9fa48("81235"), 'SIGTERM'));
      }
    });
  }
}

/**
 * Register one-time process lifecycle diagnostics for early exit debugging.
 * @param {Object} logger
 * @param {Function} contextProvider
 */
function registerProcessLifecycleDiagnostics(logger, contextProvider) {
  if (stryMutAct_9fa48("81236")) {
    {}
  } else {
    stryCov_9fa48("81236");
    const registrationKey = stryMutAct_9fa48("81237") ? "" : (stryCov_9fa48("81237"), '__ddbProcessLifecycleDiagnosticsRegistered');
    if (stryMutAct_9fa48("81239") ? false : stryMutAct_9fa48("81238") ? true : (stryCov_9fa48("81238", "81239"), globalThis[registrationKey])) {
      if (stryMutAct_9fa48("81240")) {
        {}
      } else {
        stryCov_9fa48("81240");
        return;
      }
    }
    globalThis[registrationKey] = stryMutAct_9fa48("81241") ? false : (stryCov_9fa48("81241"), true);
    const resolveContext = () => {
      if (stryMutAct_9fa48("81242")) {
        {}
      } else {
        stryCov_9fa48("81242");
        if (stryMutAct_9fa48("81245") ? typeof contextProvider === 'function' : stryMutAct_9fa48("81244") ? false : stryMutAct_9fa48("81243") ? true : (stryCov_9fa48("81243", "81244", "81245"), typeof contextProvider !== (stryMutAct_9fa48("81246") ? "" : (stryCov_9fa48("81246"), 'function')))) {
          if (stryMutAct_9fa48("81247")) {
            {}
          } else {
            stryCov_9fa48("81247");
            return {};
          }
        }
        try {
          if (stryMutAct_9fa48("81248")) {
            {}
          } else {
            stryCov_9fa48("81248");
            const context = contextProvider();
            return (stryMutAct_9fa48("81251") ? context || typeof context === 'object' : stryMutAct_9fa48("81250") ? false : stryMutAct_9fa48("81249") ? true : (stryCov_9fa48("81249", "81250", "81251"), context && (stryMutAct_9fa48("81253") ? typeof context !== 'object' : stryMutAct_9fa48("81252") ? true : (stryCov_9fa48("81252", "81253"), typeof context === (stryMutAct_9fa48("81254") ? "" : (stryCov_9fa48("81254"), 'object')))))) ? context : {};
          }
        } catch (_error) {
          if (stryMutAct_9fa48("81255")) {
            {}
          } else {
            stryCov_9fa48("81255");
            return {};
          }
        }
      }
    };
    process.on(stryMutAct_9fa48("81256") ? "" : (stryCov_9fa48("81256"), 'beforeExit'), code => {
      if (stryMutAct_9fa48("81257")) {
        {}
      } else {
        stryCov_9fa48("81257");
        logger.info(ENTRYPOINT_LOG_MSG.PROCESS_BEFORE_EXIT, stryMutAct_9fa48("81258") ? {} : (stryCov_9fa48("81258"), {
          code,
          ...resolveContext()
        }));
      }
    });
    process.on(stryMutAct_9fa48("81259") ? "" : (stryCov_9fa48("81259"), 'exit'), code => {
      if (stryMutAct_9fa48("81260")) {
        {}
      } else {
        stryCov_9fa48("81260");
        logger.info(ENTRYPOINT_LOG_MSG.PROCESS_EXIT, stryMutAct_9fa48("81261") ? {} : (stryCov_9fa48("81261"), {
          code,
          ...resolveContext()
        }));
      }
    });
    process.on(stryMutAct_9fa48("81262") ? "" : (stryCov_9fa48("81262"), 'uncaughtExceptionMonitor'), (error, origin) => {
      if (stryMutAct_9fa48("81263")) {
        {}
      } else {
        stryCov_9fa48("81263");
        logger.error(ENTRYPOINT_LOG_MSG.PROCESS_UNCAUGHT_EXCEPTION, stryMutAct_9fa48("81264") ? {} : (stryCov_9fa48("81264"), {
          origin,
          error: stryMutAct_9fa48("81267") ? error?.message && String(error) : stryMutAct_9fa48("81266") ? false : stryMutAct_9fa48("81265") ? true : (stryCov_9fa48("81265", "81266", "81267"), (stryMutAct_9fa48("81268") ? error.message : (stryCov_9fa48("81268"), error?.message)) || String(error)),
          stack: stryMutAct_9fa48("81271") ? error?.stack && null : stryMutAct_9fa48("81270") ? false : stryMutAct_9fa48("81269") ? true : (stryCov_9fa48("81269", "81270", "81271"), (stryMutAct_9fa48("81272") ? error.stack : (stryCov_9fa48("81272"), error?.stack)) || null),
          ...resolveContext()
        }));
      }
    });
    process.on(stryMutAct_9fa48("81273") ? "" : (stryCov_9fa48("81273"), 'unhandledRejection'), reason => {
      if (stryMutAct_9fa48("81274")) {
        {}
      } else {
        stryCov_9fa48("81274");
        logger.error(ENTRYPOINT_LOG_MSG.PROCESS_UNHANDLED_REJECTION, stryMutAct_9fa48("81275") ? {} : (stryCov_9fa48("81275"), {
          error: stryMutAct_9fa48("81278") ? reason?.message && String(reason) : stryMutAct_9fa48("81277") ? false : stryMutAct_9fa48("81276") ? true : (stryCov_9fa48("81276", "81277", "81278"), (stryMutAct_9fa48("81279") ? reason.message : (stryCov_9fa48("81279"), reason?.message)) || String(reason)),
          stack: stryMutAct_9fa48("81282") ? reason?.stack && null : stryMutAct_9fa48("81281") ? false : stryMutAct_9fa48("81280") ? true : (stryCov_9fa48("81280", "81281", "81282"), (stryMutAct_9fa48("81283") ? reason.stack : (stryCov_9fa48("81283"), reason?.stack)) || null),
          ...resolveContext()
        }));
      }
    });
  }
}

/**
 * Emit a short post-startup liveness pulse to detect early exit or server loss.
 * @param {Object} options
 * @param {Object} options.logger
 * @param {string} options.nodeId
 * @param {string} options.startupBranch
 * @param {Object|null} options.bootstrapAPI
 * @param {Object|null} options.startupOwner
 */
function scheduleStartupLivenessPulse(options) {
  if (stryMutAct_9fa48("81284")) {
    {}
  } else {
    stryCov_9fa48("81284");
    const logger = stryMutAct_9fa48("81285") ? options.logger : (stryCov_9fa48("81285"), options?.logger);
    if (stryMutAct_9fa48("81288") ? !logger && typeof logger.info !== 'function' : stryMutAct_9fa48("81287") ? false : stryMutAct_9fa48("81286") ? true : (stryCov_9fa48("81286", "81287", "81288"), (stryMutAct_9fa48("81289") ? logger : (stryCov_9fa48("81289"), !logger)) || (stryMutAct_9fa48("81291") ? typeof logger.info === 'function' : stryMutAct_9fa48("81290") ? false : (stryCov_9fa48("81290", "81291"), typeof logger.info !== (stryMutAct_9fa48("81292") ? "" : (stryCov_9fa48("81292"), 'function')))))) {
      if (stryMutAct_9fa48("81293")) {
        {}
      } else {
        stryCov_9fa48("81293");
        return;
      }
    }
    let pulseCount = 0;
    const timer = setInterval(() => {
      if (stryMutAct_9fa48("81294")) {
        {}
      } else {
        stryCov_9fa48("81294");
        stryMutAct_9fa48("81295") ? pulseCount -= 1 : (stryCov_9fa48("81295"), pulseCount += 1);
        logger.info(ENTRYPOINT_LOG_MSG.STARTUP_LIVENESS_PULSE, stryMutAct_9fa48("81296") ? {} : (stryCov_9fa48("81296"), {
          nodeId: options.nodeId,
          startupBranch: options.startupBranch,
          pulseCount,
          bootstrapApiInitialized: stryMutAct_9fa48("81299") ? options.bootstrapAPI?.isInitialized?.() !== true : stryMutAct_9fa48("81298") ? false : stryMutAct_9fa48("81297") ? true : (stryCov_9fa48("81297", "81298", "81299"), (stryMutAct_9fa48("81301") ? options.bootstrapAPI.isInitialized?.() : stryMutAct_9fa48("81300") ? options.bootstrapAPI?.isInitialized() : (stryCov_9fa48("81300", "81301"), options.bootstrapAPI?.isInitialized?.())) === (stryMutAct_9fa48("81302") ? false : (stryCov_9fa48("81302"), true))),
          bootstrapApiHasFastify: Boolean(stryMutAct_9fa48("81303") ? options.bootstrapAPI.fastify : (stryCov_9fa48("81303"), options.bootstrapAPI?.fastify)),
          bootstrapApiServerListening: stryMutAct_9fa48("81306") ? options.bootstrapAPI?.fastify?.server?.listening !== true : stryMutAct_9fa48("81305") ? false : stryMutAct_9fa48("81304") ? true : (stryCov_9fa48("81304", "81305", "81306"), (stryMutAct_9fa48("81309") ? options.bootstrapAPI.fastify?.server?.listening : stryMutAct_9fa48("81308") ? options.bootstrapAPI?.fastify.server?.listening : stryMutAct_9fa48("81307") ? options.bootstrapAPI?.fastify?.server.listening : (stryCov_9fa48("81307", "81308", "81309"), options.bootstrapAPI?.fastify?.server?.listening)) === (stryMutAct_9fa48("81310") ? false : (stryCov_9fa48("81310"), true))),
          bootstrapApiHasSqlQueryEngine: Boolean(stryMutAct_9fa48("81311") ? options.bootstrapAPI.sqlQueryEngine : (stryCov_9fa48("81311"), options.bootstrapAPI?.sqlQueryEngine)),
          bootstrapApiHasMessageRouter: Boolean(stryMutAct_9fa48("81312") ? options.bootstrapAPI.messageRouter : (stryCov_9fa48("81312"), options.bootstrapAPI?.messageRouter)),
          startupPhase: stryMutAct_9fa48("81315") ? options.startupOwner?.phase && null : stryMutAct_9fa48("81314") ? false : stryMutAct_9fa48("81313") ? true : (stryCov_9fa48("81313", "81314", "81315"), (stryMutAct_9fa48("81316") ? options.startupOwner.phase : (stryCov_9fa48("81316"), options.startupOwner?.phase)) || null),
          pid: process.pid
        }));
        if (stryMutAct_9fa48("81320") ? pulseCount < 10 : stryMutAct_9fa48("81319") ? pulseCount > 10 : stryMutAct_9fa48("81318") ? false : stryMutAct_9fa48("81317") ? true : (stryCov_9fa48("81317", "81318", "81319", "81320"), pulseCount >= 10)) {
          if (stryMutAct_9fa48("81321")) {
            {}
          } else {
            stryCov_9fa48("81321");
            clearInterval(timer);
          }
        }
      }
    }, 2000);
    if (stryMutAct_9fa48("81324") ? typeof timer.unref !== 'function' : stryMutAct_9fa48("81323") ? false : stryMutAct_9fa48("81322") ? true : (stryCov_9fa48("81322", "81323", "81324"), typeof timer.unref === (stryMutAct_9fa48("81325") ? "" : (stryCov_9fa48("81325"), 'function')))) {
      if (stryMutAct_9fa48("81326")) {
        {}
      } else {
        stryCov_9fa48("81326");
        timer.unref();
      }
    }
  }
}

/**
 * Compose and start one joining-node runtime path.
 * @param {Object} options
 * @param {Object} options.config
 * @param {Object} options.mainLogger
 * @param {Object} options.dataDirectoryManager
 * @param {Object} options.rolloutControls
 * @param {string} options.seedNodeAddress
 * @param {string} options.startupMode
 * @param {Object} options.env
 * @return {Promise<void>}
 */
async function startJoinNode(options) {
  if (stryMutAct_9fa48("81327")) {
    {}
  } else {
    stryCov_9fa48("81327");
    const {
      config,
      mainLogger,
      dataDirectoryManager,
      rolloutControls
    } = options;
    const seedNodeAddress = String(stryMutAct_9fa48("81330") ? options.seedNodeAddress && '' : stryMutAct_9fa48("81329") ? false : stryMutAct_9fa48("81328") ? true : (stryCov_9fa48("81328", "81329", "81330"), options.seedNodeAddress || (stryMutAct_9fa48("81331") ? "Stryker was here!" : (stryCov_9fa48("81331"), ''))));
    const nodeId = config.get(CONFIG_KEY.NODE_ID);
    const startupMode = (stryMutAct_9fa48("81334") ? typeof options.startupMode === 'string' || options.startupMode.length > 0 : stryMutAct_9fa48("81333") ? false : stryMutAct_9fa48("81332") ? true : (stryCov_9fa48("81332", "81333", "81334"), (stryMutAct_9fa48("81336") ? typeof options.startupMode !== 'string' : stryMutAct_9fa48("81335") ? true : (stryCov_9fa48("81335", "81336"), typeof options.startupMode === (stryMutAct_9fa48("81337") ? "" : (stryCov_9fa48("81337"), 'string')))) && (stryMutAct_9fa48("81340") ? options.startupMode.length <= 0 : stryMutAct_9fa48("81339") ? options.startupMode.length >= 0 : stryMutAct_9fa48("81338") ? true : (stryCov_9fa48("81338", "81339", "81340"), options.startupMode.length > 0)))) ? options.startupMode : STARTUP_JOIN_MODE.FRESH_JOIN;
    const env = stryMutAct_9fa48("81343") ? options.env && process.env : stryMutAct_9fa48("81342") ? false : stryMutAct_9fa48("81341") ? true : (stryCov_9fa48("81341", "81342", "81343"), options.env || process.env);
    const {
      restApiPort: _restApiPort,
      wsPort,
      nodeHttpAddress: joiningNodeAddress,
      advertisedNodeWsAddress
    } = resolveRuntimeAddresses(config);
    try {
      if (stryMutAct_9fa48("81344")) {
        {}
      } else {
        stryCov_9fa48("81344");
        await persistBootstrapRejoinHints(stryMutAct_9fa48("81345") ? {} : (stryCov_9fa48("81345"), {
          dataDir: dataDirectoryManager.getDataDir(),
          nodeId,
          nodeAddress: joiningNodeAddress,
          nodeRole: stryMutAct_9fa48("81346") ? "" : (stryCov_9fa48("81346"), 'joiner'),
          peerAddresses: stryMutAct_9fa48("81347") ? [] : (stryCov_9fa48("81347"), [seedNodeAddress]),
          clusterNodeCount: 2
        }));
      }
    } catch (error) {
      if (stryMutAct_9fa48("81348")) {
        {}
      } else {
        stryCov_9fa48("81348");
        mainLogger.warn(stryMutAct_9fa48("81349") ? "" : (stryCov_9fa48("81349"), 'Failed to persist bootstrap rejoin hints'), stryMutAct_9fa48("81350") ? {} : (stryCov_9fa48("81350"), {
          nodeId,
          dataDir: dataDirectoryManager.getDataDir(),
          error: error.message
        }));
      }
    }
    mainLogger.info(ENTRYPOINT_LOG_MSG.JOINING_CLUSTER, stryMutAct_9fa48("81351") ? {} : (stryCov_9fa48("81351"), {
      seedNodeAddress,
      startupMode
    }));
    const seedUrl = (stryMutAct_9fa48("81352") ? seedNodeAddress.endsWith('http') : (stryCov_9fa48("81352"), seedNodeAddress.startsWith(stryMutAct_9fa48("81353") ? "" : (stryCov_9fa48("81353"), 'http')))) ? seedNodeAddress : stryMutAct_9fa48("81354") ? `` : (stryCov_9fa48("81354"), `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${seedNodeAddress}`);
    const joiningConfig = {};
    const joinHttpTimeoutMs = parsePositiveTimeoutMs(env[ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS]);
    if (stryMutAct_9fa48("81357") ? joinHttpTimeoutMs === null : stryMutAct_9fa48("81356") ? false : stryMutAct_9fa48("81355") ? true : (stryCov_9fa48("81355", "81356", "81357"), joinHttpTimeoutMs !== null)) {
      if (stryMutAct_9fa48("81358")) {
        {}
      } else {
        stryCov_9fa48("81358");
        joiningConfig.httpTimeoutMs = joinHttpTimeoutMs;
      }
    }
    const joinLeadershipWaitTimeoutMs = parsePositiveTimeoutMs(env[ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS]);
    if (stryMutAct_9fa48("81361") ? joinLeadershipWaitTimeoutMs === null : stryMutAct_9fa48("81360") ? false : stryMutAct_9fa48("81359") ? true : (stryCov_9fa48("81359", "81360", "81361"), joinLeadershipWaitTimeoutMs !== null)) {
      if (stryMutAct_9fa48("81362")) {
        {}
      } else {
        stryCov_9fa48("81362");
        joiningConfig.leadershipWaitTimeoutMs = joinLeadershipWaitTimeoutMs;
      }
    }
    joiningConfig.autoResumeRetryableFailures = stryMutAct_9fa48("81363") ? false : (stryCov_9fa48("81363"), true);
    const joinReadinessState = createReadinessStateWithDiagnostics(mainLogger, nodeId);
    let joinAdminRuntime = null;
    let bootstrapAPI = null;
    const membershipLifecycleController = new MembershipLifecycleController(stryMutAct_9fa48("81364") ? {} : (stryCov_9fa48("81364"), {
      nodeId,
      startupMode,
      delegates: stryMutAct_9fa48("81365") ? {} : (stryCov_9fa48("81365"), {
        onDrainIntent: ({
          intent
        }) => {
          if (stryMutAct_9fa48("81366")) {
            {}
          } else {
            stryCov_9fa48("81366");
            if (stryMutAct_9fa48("81369") ? bootstrapAPI.markDraining : stryMutAct_9fa48("81368") ? false : stryMutAct_9fa48("81367") ? true : (stryCov_9fa48("81367", "81368", "81369"), bootstrapAPI?.markDraining)) {
              if (stryMutAct_9fa48("81370")) {
                {}
              } else {
                stryCov_9fa48("81370");
                return bootstrapAPI.markDraining(stryMutAct_9fa48("81371") ? {} : (stryCov_9fa48("81371"), {
                  drainDeadlineMs: intent.drainDeadlineMs,
                  reasonCode: intent.reasonCode
                }));
              }
            }
            return stryMutAct_9fa48("81372") ? {} : (stryCov_9fa48("81372"), {
              phase: null,
              reasons: intent.reasonCode ? stryMutAct_9fa48("81373") ? [] : (stryCov_9fa48("81373"), [intent.reasonCode]) : stryMutAct_9fa48("81374") ? ["Stryker was here"] : (stryCov_9fa48("81374"), []),
              draining: stryMutAct_9fa48("81375") ? false : (stryCov_9fa48("81375"), true),
              drainDeadlineMs: intent.drainDeadlineMs
            });
          }
        }
      })
    }));
    const nodeJoiningService = new NodeJoiningService(stryMutAct_9fa48("81376") ? {} : (stryCov_9fa48("81376"), {
      nodeId,
      nodeAddress: joiningNodeAddress,
      advertisedNodeWsAddress,
      seedNodeAddress: seedUrl,
      wsPort: wsPort,
      dataDir: dataDirectoryManager.getDataDir(),
      rolloutControls,
      readinessState: joinReadinessState,
      startupMode,
      membershipLifecycleController,
      onLocalAdminRuntimeReady: async runtime => {
        if (stryMutAct_9fa48("81377")) {
          {}
        } else {
          stryCov_9fa48("81377");
          if (stryMutAct_9fa48("81379") ? false : stryMutAct_9fa48("81378") ? true : (stryCov_9fa48("81378", "81379"), joinAdminRuntime)) {
            if (stryMutAct_9fa48("81380")) {
              {}
            } else {
              stryCov_9fa48("81380");
              return;
            }
          }
          joinAdminRuntime = await startAdminRuntimeComposition(stryMutAct_9fa48("81381") ? {} : (stryCov_9fa48("81381"), {
            nodeId: runtime.nodeId,
            systemTableCache: runtime.systemTableCache,
            cacheMutationTarget: stryMutAct_9fa48("81384") ? runtime.cacheMutationTarget && runtime.systemTableCache : stryMutAct_9fa48("81383") ? false : stryMutAct_9fa48("81382") ? true : (stryCov_9fa48("81382", "81383", "81384"), runtime.cacheMutationTarget || runtime.systemTableCache),
            sqlQueryEngine: null,
            owner: runtime.owner,
            messageRouter: runtime.messageRouter,
            partitionServices: runtime.partitionServices
          }));
        }
      },
      config: (stryMutAct_9fa48("81388") ? Object.keys(joiningConfig).length <= 0 : stryMutAct_9fa48("81387") ? Object.keys(joiningConfig).length >= 0 : stryMutAct_9fa48("81386") ? false : stryMutAct_9fa48("81385") ? true : (stryCov_9fa48("81385", "81386", "81387", "81388"), Object.keys(joiningConfig).length > 0)) ? joiningConfig : undefined
    }));
    bootstrapAPI = new BootstrapAPI(stryMutAct_9fa48("81389") ? {} : (stryCov_9fa48("81389"), {
      seedNodeId: nodeId,
      seedNodeAddress: joiningNodeAddress,
      seedNodeWsAddress: advertisedNodeWsAddress,
      wsPort: wsPort,
      messageGroupServices: nodeJoiningService.messageGroupServices,
      partitionServices: nodeJoiningService.partitionServices,
      replicaHandler: nodeJoiningService.replicaHandler,
      systemTableCache: null,
      bootstrapService: null,
      epochManager: nodeJoiningService.epochManager,
      messageRouter: nodeJoiningService.messageRouter,
      readinessState: joinReadinessState,
      controlPlaneWriteHealthProvider: createControlPlaneWriteHealthProvider(nodeJoiningService),
      runtimeOwner: nodeJoiningService.runtimeDependencyOwner,
      rolloutControls
    }));
    await bootstrapAPI.initialize();
    const joinResult = await nodeJoiningService.join();
    if (stryMutAct_9fa48("81392") ? false : stryMutAct_9fa48("81391") ? true : stryMutAct_9fa48("81390") ? joinResult.success : (stryCov_9fa48("81390", "81391", "81392"), !joinResult.success)) {
      if (stryMutAct_9fa48("81393")) {
        {}
      } else {
        stryCov_9fa48("81393");
        mainLogger.error(ENTRYPOINT_LOG_MSG.FAILED_JOIN, stryMutAct_9fa48("81394") ? {} : (stryCov_9fa48("81394"), {
          error: joinResult.error,
          phase: joinResult.phase
        }));
        await bootstrapAPI.shutdown();
        process.exit(1);
      }
    }
    let joinLogsPersistence = null;
    mainLogger.info(ENTRYPOINT_LOG_MSG.JOINED_CLUSTER, stryMutAct_9fa48("81395") ? {} : (stryCov_9fa48("81395"), {
      messageGroupCount: joinResult.messageGroupServices.size,
      duration: joinResult.duration
    }));
    const joinCacheHandles = resolveSystemCacheHandles(joinResult.messageGroupServices);
    let systemTableCache = joinCacheHandles.systemTableCache;
    let cacheMutationTarget = joinCacheHandles.cacheMutationTarget;
    systemTableCache = assertCritical(systemTableCache, ENTRYPOINT_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
    hydrateBootstrapApiRuntime(stryMutAct_9fa48("81396") ? {} : (stryCov_9fa48("81396"), {
      bootstrapAPI,
      systemTableCache,
      messageGroupServices: joinResult.messageGroupServices,
      partitionServices: joinResult.partitionServices,
      replicaHandler: joinResult.replicaHandler,
      epochManager: nodeJoiningService.epochManager,
      messageRouter: joinResult.messageRouter,
      startupRecoveryCoordinator: stryMutAct_9fa48("81399") ? nodeJoiningService.rebalanceCoordinator?.startupRecoveryCoordinator && null : stryMutAct_9fa48("81398") ? false : stryMutAct_9fa48("81397") ? true : (stryCov_9fa48("81397", "81398", "81399"), (stryMutAct_9fa48("81400") ? nodeJoiningService.rebalanceCoordinator.startupRecoveryCoordinator : (stryCov_9fa48("81400"), nodeJoiningService.rebalanceCoordinator?.startupRecoveryCoordinator)) || null)
    }));
    const joinSqlRuntime = await createSqlRuntimeComposition(stryMutAct_9fa48("81401") ? {} : (stryCov_9fa48("81401"), {
      nodeId,
      systemTableCache,
      messageRouter: joinResult.messageRouter,
      owner: nodeJoiningService.runtimeDependencyOwner,
      partitionServices: joinResult.partitionServices,
      logger: mainLogger
    }));
    const sqlQueryEngine = joinSqlRuntime.sqlQueryEngine;
    const detachJoinMigrationRecovery = joinSqlRuntime.detachMigrationRecovery;
    attachSqlRuntimeToStartupOwner(stryMutAct_9fa48("81402") ? {} : (stryCov_9fa48("81402"), {
      owner: nodeJoiningService,
      sqlQueryEngine,
      systemTableCache,
      cacheMutationTarget: stryMutAct_9fa48("81405") ? cacheMutationTarget && systemTableCache : stryMutAct_9fa48("81404") ? false : stryMutAct_9fa48("81403") ? true : (stryCov_9fa48("81403", "81404", "81405"), cacheMutationTarget || systemTableCache),
      messageRouter: joinResult.messageRouter,
      partitionServicesProvider: stryMutAct_9fa48("81406") ? () => undefined : (stryCov_9fa48("81406"), () => joinResult.partitionServices)
    }));
    const joinDynamicConfigWiring = await startDynamicConfigWiring(stryMutAct_9fa48("81407") ? {} : (stryCov_9fa48("81407"), {
      nodeId,
      systemTableCache,
      sqlQueryEngine,
      messageGroupServices: joinResult.messageGroupServices,
      partitionServices: joinResult.partitionServices,
      runtimeOwner: nodeJoiningService.runtimeDependencyOwner
    }), mainLogger);
    bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);
    if (stryMutAct_9fa48("81410") ? false : stryMutAct_9fa48("81409") ? true : stryMutAct_9fa48("81408") ? joinAdminRuntime : (stryCov_9fa48("81408", "81409", "81410"), !joinAdminRuntime)) {
      if (stryMutAct_9fa48("81411")) {
        {}
      } else {
        stryCov_9fa48("81411");
        joinAdminRuntime = await startAdminRuntimeComposition(stryMutAct_9fa48("81412") ? {} : (stryCov_9fa48("81412"), {
          nodeId,
          systemTableCache,
          cacheMutationTarget: stryMutAct_9fa48("81415") ? cacheMutationTarget && systemTableCache : stryMutAct_9fa48("81414") ? false : stryMutAct_9fa48("81413") ? true : (stryCov_9fa48("81413", "81414", "81415"), cacheMutationTarget || systemTableCache),
          sqlQueryEngine,
          owner: nodeJoiningService.runtimeDependencyOwner,
          messageRouter: joinResult.messageRouter,
          partitionServices: joinResult.partitionServices
        }));
      }
    } else {
      if (stryMutAct_9fa48("81416")) {
        {}
      } else {
        stryCov_9fa48("81416");
        attachSqlEngineToAdminRuntime(joinAdminRuntime, sqlQueryEngine);
      }
    }
    const adminAPI = joinAdminRuntime.adminAPI;
    const liveQueryWiring = joinAdminRuntime.liveQueryWiring;
    const adminPort = joinAdminRuntime.adminPort;
    reportStartupRuntimeHandoff(stryMutAct_9fa48("81417") ? {} : (stryCov_9fa48("81417"), {
      logger: mainLogger,
      nodeId,
      startupBranch: stryMutAct_9fa48("81418") ? "" : (stryCov_9fa48("81418"), 'join'),
      bootstrapAPI,
      startupOwner: nodeJoiningService,
      adminRuntime: joinAdminRuntime
    }));
    const rejoinHintsPersistence = startRejoinHintsPersistence(stryMutAct_9fa48("81419") ? {} : (stryCov_9fa48("81419"), {
      dataDir: dataDirectoryManager.getDataDir(),
      nodeId,
      nodeAddress: joiningNodeAddress,
      nodeRole: stryMutAct_9fa48("81420") ? "" : (stryCov_9fa48("81420"), 'joiner'),
      getSystemTableCache: stryMutAct_9fa48("81421") ? () => undefined : (stryCov_9fa48("81421"), () => systemTableCache),
      logger: mainLogger
    }));
    mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, stryMutAct_9fa48("81422") ? {} : (stryCov_9fa48("81422"), {
      nodeId,
      adminWebSocketPort: adminPort,
      dataDir: dataDirectoryManager.getDataDir()
    }));
    scheduleStartupLivenessPulse(stryMutAct_9fa48("81423") ? {} : (stryCov_9fa48("81423"), {
      logger: mainLogger,
      nodeId,
      startupBranch: stryMutAct_9fa48("81424") ? "" : (stryCov_9fa48("81424"), 'join'),
      bootstrapAPI,
      startupOwner: nodeJoiningService
    }));
    joinLogsPersistence = startLogsTablePersistence(nodeJoiningService.cdcIntegrationService, mainLogger, rolloutControls, joinReadinessState);
    const handleShutdownSignal = createShutdownSignalHandler(stryMutAct_9fa48("81425") ? {} : (stryCov_9fa48("81425"), {
      logger: mainLogger,
      nodeId,
      bootstrapAPI,
      membershipLifecycleController,
      heartbeatService: nodeJoiningService.heartbeatService,
      logsPersistence: joinLogsPersistence,
      rejoinHintsPersistence,
      dynamicConfigWiring: joinDynamicConfigWiring,
      detachMigrationRecovery: detachJoinMigrationRecovery,
      ownerCleanup: stryMutAct_9fa48("81426") ? () => undefined : (stryCov_9fa48("81426"), () => nodeJoiningService.cleanup()),
      adminAPI,
      liveQueryWiring,
      failureMessage: stryMutAct_9fa48("81427") ? "" : (stryCov_9fa48("81427"), 'Failed to shutdown joining node cleanly')
    }));
    registerShutdownSignalHandlers(handleShutdownSignal);
  }
}

/**
 * Compose and start one seed-node runtime path.
 * @param {Object} options
 * @param {Object} options.config
 * @param {Object} options.mainLogger
 * @param {Object} options.dataDirectoryManager
 * @param {Object} options.rolloutControls
 * @return {Promise<void>}
 */
async function startSeedNode(options) {
  if (stryMutAct_9fa48("81428")) {
    {}
  } else {
    stryCov_9fa48("81428");
    const {
      config,
      mainLogger,
      dataDirectoryManager,
      rolloutControls
    } = options;
    const nodeId = config.get(CONFIG_KEY.NODE_ID);
    const {
      wsPort,
      nodeHttpAddress: seedNodeHttpAddress,
      advertisedNodeWsAddress
    } = resolveRuntimeAddresses(config);
    mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING_SEED);
    const readinessState = createReadinessStateWithDiagnostics(mainLogger, nodeId);
    let seedAdminRuntime = null;
    const bootstrapService = new BootstrapService(stryMutAct_9fa48("81429") ? {} : (stryCov_9fa48("81429"), {
      nodeId,
      nodeAddress: seedNodeHttpAddress,
      advertisedNodeWsAddress,
      dataDirectoryManager,
      wsPort: wsPort,
      rolloutControls,
      readinessState,
      onLocalAdminRuntimeReady: async runtime => {
        if (stryMutAct_9fa48("81430")) {
          {}
        } else {
          stryCov_9fa48("81430");
          if (stryMutAct_9fa48("81432") ? false : stryMutAct_9fa48("81431") ? true : (stryCov_9fa48("81431", "81432"), seedAdminRuntime)) {
            if (stryMutAct_9fa48("81433")) {
              {}
            } else {
              stryCov_9fa48("81433");
              return;
            }
          }
          seedAdminRuntime = await startAdminRuntimeComposition(stryMutAct_9fa48("81434") ? {} : (stryCov_9fa48("81434"), {
            nodeId: runtime.nodeId,
            systemTableCache: runtime.systemTableCache,
            cacheMutationTarget: stryMutAct_9fa48("81437") ? runtime.cacheMutationTarget && runtime.systemTableCache : stryMutAct_9fa48("81436") ? false : stryMutAct_9fa48("81435") ? true : (stryCov_9fa48("81435", "81436", "81437"), runtime.cacheMutationTarget || runtime.systemTableCache),
            sqlQueryEngine: null,
            owner: runtime.owner,
            messageRouter: runtime.messageRouter,
            partitionServices: runtime.partitionServices
          }));
        }
      }
    }));
    const bootstrapAPI = new BootstrapAPI(stryMutAct_9fa48("81438") ? {} : (stryCov_9fa48("81438"), {
      seedNodeId: nodeId,
      seedNodeAddress: seedNodeHttpAddress,
      seedNodeWsAddress: advertisedNodeWsAddress,
      wsPort: wsPort,
      messageGroupServices: bootstrapService.messageGroupServices,
      partitionServices: bootstrapService.partitionServices,
      replicaHandler: bootstrapService.replicaHandler,
      systemTableCache: bootstrapService.systemTableCache,
      bootstrapService: bootstrapService,
      epochManager: bootstrapService.epochManager,
      messageRouter: bootstrapService.messageRouter,
      readinessState,
      controlPlaneWriteHealthProvider: createControlPlaneWriteHealthProvider(bootstrapService),
      bootstrapStartupAdapter: bootstrapService.bootstrapApiOwner,
      runtimeOwner: bootstrapService.runtimeDependencyOwner,
      rolloutControls
    }));
    await bootstrapAPI.initialize();
    const bootstrapResult = await bootstrapService.bootstrap();
    if (stryMutAct_9fa48("81441") ? false : stryMutAct_9fa48("81440") ? true : stryMutAct_9fa48("81439") ? bootstrapResult.success : (stryCov_9fa48("81439", "81440", "81441"), !bootstrapResult.success)) {
      if (stryMutAct_9fa48("81442")) {
        {}
      } else {
        stryCov_9fa48("81442");
        mainLogger.error(ENTRYPOINT_LOG_MSG.BOOTSTRAP_FAILED, stryMutAct_9fa48("81443") ? {} : (stryCov_9fa48("81443"), {
          error: bootstrapResult.error
        }));
        process.exit(1);
      }
    }
    let seedLogsPersistence = null;
    mainLogger.info(ENTRYPOINT_LOG_MSG.BOOTSTRAP_COMPLETED, stryMutAct_9fa48("81444") ? {} : (stryCov_9fa48("81444"), {
      servicesCreated: bootstrapResult.servicesCreated,
      partitionsCreated: bootstrapResult.partitionsCreated,
      messageGroupsCreated: bootstrapResult.messageGroupsCreated
    }));
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    hydrateBootstrapApiRuntime(stryMutAct_9fa48("81445") ? {} : (stryCov_9fa48("81445"), {
      bootstrapAPI,
      systemTableCache,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      replicaHandler: bootstrapResult.replicaHandler,
      epochManager: bootstrapResult.epochManager,
      messageRouter: bootstrapResult.messageRouter,
      startupRecoveryCoordinator: stryMutAct_9fa48("81448") ? bootstrapService.rebalanceCoordinator?.startupRecoveryCoordinator && null : stryMutAct_9fa48("81447") ? false : stryMutAct_9fa48("81446") ? true : (stryCov_9fa48("81446", "81447", "81448"), (stryMutAct_9fa48("81449") ? bootstrapService.rebalanceCoordinator.startupRecoveryCoordinator : (stryCov_9fa48("81449"), bootstrapService.rebalanceCoordinator?.startupRecoveryCoordinator)) || null)
    }));
    try {
      if (stryMutAct_9fa48("81450")) {
        {}
      } else {
        stryCov_9fa48("81450");
        await bootstrapService.startWebSocketServer();
        mainLogger.info(ENTRYPOINT_LOG_MSG.WS_STARTED);
      }
    } catch (wsError) {
      if (stryMutAct_9fa48("81451")) {
        {}
      } else {
        stryCov_9fa48("81451");
        mainLogger.warn(ENTRYPOINT_LOG_MSG.WS_START_FAILED, stryMutAct_9fa48("81452") ? {} : (stryCov_9fa48("81452"), {
          error: wsError.message
        }));
      }
    }
    const seedSqlRuntime = await createSqlRuntimeComposition(stryMutAct_9fa48("81453") ? {} : (stryCov_9fa48("81453"), {
      nodeId,
      systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      owner: bootstrapService.runtimeDependencyOwner,
      partitionServices: bootstrapResult.partitionServices,
      logger: mainLogger
    }));
    const sqlQueryEngine = seedSqlRuntime.sqlQueryEngine;
    const detachSeedMigrationRecovery = seedSqlRuntime.detachMigrationRecovery;
    attachSqlRuntimeToStartupOwner(stryMutAct_9fa48("81454") ? {} : (stryCov_9fa48("81454"), {
      owner: bootstrapService,
      sqlQueryEngine,
      systemTableCache,
      cacheMutationTarget: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      partitionServicesProvider: stryMutAct_9fa48("81455") ? () => undefined : (stryCov_9fa48("81455"), () => bootstrapResult.partitionServices)
    }));
    const seedDynamicConfigWiring = await startDynamicConfigWiring(stryMutAct_9fa48("81456") ? {} : (stryCov_9fa48("81456"), {
      nodeId,
      systemTableCache,
      sqlQueryEngine,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      runtimeOwner: bootstrapService.runtimeDependencyOwner
    }), mainLogger);
    bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);
    if (stryMutAct_9fa48("81459") ? false : stryMutAct_9fa48("81458") ? true : stryMutAct_9fa48("81457") ? seedAdminRuntime : (stryCov_9fa48("81457", "81458", "81459"), !seedAdminRuntime)) {
      if (stryMutAct_9fa48("81460")) {
        {}
      } else {
        stryCov_9fa48("81460");
        seedAdminRuntime = await startAdminRuntimeComposition(stryMutAct_9fa48("81461") ? {} : (stryCov_9fa48("81461"), {
          nodeId,
          systemTableCache,
          cacheMutationTarget: systemTableCache,
          sqlQueryEngine,
          owner: bootstrapService.runtimeDependencyOwner,
          messageRouter: bootstrapResult.messageRouter,
          partitionServices: bootstrapResult.partitionServices
        }));
      }
    } else {
      if (stryMutAct_9fa48("81462")) {
        {}
      } else {
        stryCov_9fa48("81462");
        attachSqlEngineToAdminRuntime(seedAdminRuntime, sqlQueryEngine);
      }
    }
    const adminAPI = seedAdminRuntime.adminAPI;
    const liveQueryWiring = seedAdminRuntime.liveQueryWiring;
    const adminPort = seedAdminRuntime.adminPort;
    reportStartupRuntimeHandoff(stryMutAct_9fa48("81463") ? {} : (stryCov_9fa48("81463"), {
      logger: mainLogger,
      nodeId,
      startupBranch: stryMutAct_9fa48("81464") ? "" : (stryCov_9fa48("81464"), 'seed'),
      bootstrapAPI,
      startupOwner: bootstrapService,
      adminRuntime: seedAdminRuntime
    }));
    const rejoinHintsPersistence = startRejoinHintsPersistence(stryMutAct_9fa48("81465") ? {} : (stryCov_9fa48("81465"), {
      dataDir: dataDirectoryManager.getDataDir(),
      nodeId,
      nodeAddress: seedNodeHttpAddress,
      nodeRole: stryMutAct_9fa48("81466") ? "" : (stryCov_9fa48("81466"), 'seed'),
      getSystemTableCache: stryMutAct_9fa48("81467") ? () => undefined : (stryCov_9fa48("81467"), () => systemTableCache),
      logger: mainLogger
    }));
    mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, stryMutAct_9fa48("81468") ? {} : (stryCov_9fa48("81468"), {
      nodeId,
      restApiPort: config.get(CONFIG_KEY.NODE_REST_API_PORT),
      adminWebSocketPort: adminPort,
      dataDir: dataDirectoryManager.getDataDir()
    }));
    scheduleStartupLivenessPulse(stryMutAct_9fa48("81469") ? {} : (stryCov_9fa48("81469"), {
      logger: mainLogger,
      nodeId,
      startupBranch: stryMutAct_9fa48("81470") ? "" : (stryCov_9fa48("81470"), 'seed'),
      bootstrapAPI,
      startupOwner: bootstrapService
    }));
    seedLogsPersistence = startLogsTablePersistence(bootstrapService.cdcIntegrationService, mainLogger, rolloutControls, readinessState);
    const handleShutdownSignal = createShutdownSignalHandler(stryMutAct_9fa48("81471") ? {} : (stryCov_9fa48("81471"), {
      logger: mainLogger,
      nodeId,
      bootstrapAPI,
      heartbeatService: bootstrapService.heartbeatService,
      logsPersistence: seedLogsPersistence,
      rejoinHintsPersistence,
      dynamicConfigWiring: seedDynamicConfigWiring,
      detachMigrationRecovery: detachSeedMigrationRecovery,
      ownerCleanup: stryMutAct_9fa48("81472") ? () => undefined : (stryCov_9fa48("81472"), () => bootstrapService.shutdown()),
      adminAPI,
      liveQueryWiring,
      failureMessage: stryMutAct_9fa48("81473") ? "" : (stryCov_9fa48("81473"), 'Failed to shutdown seed node cleanly')
    }));
    registerShutdownSignalHandlers(handleShutdownSignal);
  }
}

/**
 * Main application entry point.
 */
async function main() {
  if (stryMutAct_9fa48("81474")) {
    {}
  } else {
    stryCov_9fa48("81474");
    // Handle version/help flags early
    if (stryMutAct_9fa48("81476") ? false : stryMutAct_9fa48("81475") ? true : (stryCov_9fa48("81475", "81476"), checkVersionFlag())) {
      if (stryMutAct_9fa48("81477")) {
        {}
      } else {
        stryCov_9fa48("81477");
        // Return early and let Node exit naturally. This keeps the entrypoint
        // testable without needing to intercept `process.exit()`.
        return;
      }
    }

    // Parse command-line arguments
    const cliArgs = parseCommandLineArgs();

    // Build configuration overrides
    // CLI args take precedence over environment variables
    const overrides = {};
    if (stryMutAct_9fa48("81479") ? false : stryMutAct_9fa48("81478") ? true : (stryCov_9fa48("81478", "81479"), cliArgs.dataDir)) {
      if (stryMutAct_9fa48("81480")) {
        {}
      } else {
        stryCov_9fa48("81480");
        overrides.storage = stryMutAct_9fa48("81481") ? {} : (stryCov_9fa48("81481"), {
          dataDir: cliArgs.dataDir
        });
      }
    }

    // Initialize configuration
    const config = ConfigurationManager.getInstance();
    config.initialize(overrides);

    // Initialize logging
    const loggingService = LoggingService.getInstance();
    loggingService.initialize(stryMutAct_9fa48("81482") ? {} : (stryCov_9fa48("81482"), {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      level: config.get(CONFIG_KEY.LOGGING_LEVEL),
      prettyPrint: config.get(CONFIG_KEY.LOGGING_PRETTY_PRINT)
    }));

    // Create subsystem-specific loggers
    const mainLogger = loggingService.forSubsystem(ENTRYPOINT_SUBSYSTEM.MAIN);
    const configLogger = loggingService.forSubsystem(ENTRYPOINT_SUBSYSTEM.CONFIG);
    registerProcessLifecycleDiagnostics(mainLogger, stryMutAct_9fa48("81483") ? () => undefined : (stryCov_9fa48("81483"), () => stryMutAct_9fa48("81484") ? {} : (stryCov_9fa48("81484"), {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      pid: process.pid
    })));
    const selectedRaftProvider = getProcessRaftProvider(process.env);
    mainLogger.info(RAFT_PROVIDER_LOG_MSG.SELECTED, stryMutAct_9fa48("81485") ? {} : (stryCov_9fa48("81485"), {
      provider: selectedRaftProvider
    }));
    ensureLiferaftProviderForRuntime(process.env);
    configLogger.debug(stryMutAct_9fa48("81486") ? "" : (stryCov_9fa48("81486"), 'Configuration loaded'), stryMutAct_9fa48("81487") ? {} : (stryCov_9fa48("81487"), {
      categories: config.getCategories()
    }));

    // Initialize data directory manager
    const dataDirectoryManager = DataDirectoryManager.getInstance();
    dataDirectoryManager.initialize();

    // Initialize HLC clock (it will create its own subsystem logger)
    const hlcClock = new HLCClockService(config.get(CONFIG_KEY.NODE_ID), stryMutAct_9fa48("81488") ? {} : (stryCov_9fa48("81488"), {
      maxDrift: config.get(CONFIG_KEY.HLC_MAX_DRIFT_MS),
      maxLogicalCounter: config.get(CONFIG_KEY.HLC_MAX_LOGICAL_COUNTER)
    }));
    mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING, stryMutAct_9fa48("81489") ? {} : (stryCov_9fa48("81489"), {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      version: VERSION,
      dataDir: dataDirectoryManager.getDataDir(),
      hlcTimestamp: hlcClock.now().toString()
    }));
    if (stryMutAct_9fa48("81491") ? false : stryMutAct_9fa48("81490") ? true : (stryCov_9fa48("81490", "81491"), cliArgs.dryRun)) {
      if (stryMutAct_9fa48("81492")) {
        {}
      } else {
        stryCov_9fa48("81492");
        mainLogger.info(ENTRYPOINT_LOG_MSG.DRY_RUN_COMPLETED, stryMutAct_9fa48("81493") ? {} : (stryCov_9fa48("81493"), {
          nodeId: config.get(CONFIG_KEY.NODE_ID),
          dataDir: dataDirectoryManager.getDataDir(),
          provider: selectedRaftProvider
        }));
        return;
      }
    }

    // Check if we're joining an existing cluster or starting as seed node
    const startupJoinDecision = await resolveStartupJoinDecision(stryMutAct_9fa48("81494") ? {} : (stryCov_9fa48("81494"), {
      cliArgs,
      env: process.env,
      config,
      dataDirectoryManager,
      logger: mainLogger
    }));
    const rolloutControls = resolveRolloutControlsFromEnvironment(process.env);
    if (stryMutAct_9fa48("81496") ? false : stryMutAct_9fa48("81495") ? true : (stryCov_9fa48("81495", "81496"), startupJoinDecision.seedNodeAddress)) {
      if (stryMutAct_9fa48("81497")) {
        {}
      } else {
        stryCov_9fa48("81497");
        await startJoinNode(stryMutAct_9fa48("81498") ? {} : (stryCov_9fa48("81498"), {
          config,
          mainLogger,
          dataDirectoryManager,
          rolloutControls,
          seedNodeAddress: startupJoinDecision.seedNodeAddress,
          startupMode: startupJoinDecision.startupMode,
          env: process.env
        }));
        return;
      }
    }
    await startSeedNode(stryMutAct_9fa48("81499") ? {} : (stryCov_9fa48("81499"), {
      config,
      mainLogger,
      dataDirectoryManager,
      rolloutControls
    }));
  }
}
main().catch(err => {
  if (stryMutAct_9fa48("81500")) {
    {}
  } else {
    stryCov_9fa48("81500");
    console.error(stryMutAct_9fa48("81501") ? `` : (stryCov_9fa48("81501"), `${ENTRYPOINT_TEXT.FATAL_ERROR_PREFIX}`), err);
    process.exit(1);
  }
});