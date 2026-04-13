/**
 * PgWireStartupSafetyGate - Ensures PG wire lifecycle starts only
 * after control-plane readiness and isolates startup failures from
 * core bootstrap/join flows.
 *
 * This gate enforces two invariants:
 * 1. PG wire runtime replicas are only materialized after the
 *    control plane, system cache, CDC, and routing are ready.
 * 2. PG wire startup failure does not deadlock or abort core
 *    bootstrap/join — the node remains recoverable via existing
 *    admin/bootstrap ingress.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
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
import { PGWIRE_SAFETY_GATE_ERROR_MSG, PGWIRE_SAFETY_GATE_LOG_MSG, PGWIRE_SAFETY_GATE_SUBSYSTEM } from './pgwire-startup-safety-gate-constants.js';
const CONTROL_PLANE_READY_REASON = Object.freeze(stryMutAct_9fa48("24363") ? {} : (stryCov_9fa48("24363"), {
  READY: stryMutAct_9fa48("24364") ? "" : (stryCov_9fa48("24364"), 'ready')
}));
const CONTROL_PLANE_READY_STATE = Object.freeze(stryMutAct_9fa48("24365") ? {} : (stryCov_9fa48("24365"), {
  READY: stryMutAct_9fa48("24366") ? "" : (stryCov_9fa48("24366"), 'ready'),
  BLOCKED: stryMutAct_9fa48("24367") ? "" : (stryCov_9fa48("24367"), 'blocked')
}));
const CONTROL_PLANE_PREREQUISITE = Object.freeze(stryMutAct_9fa48("24368") ? {} : (stryCov_9fa48("24368"), {
  NONE: stryMutAct_9fa48("24369") ? "" : (stryCov_9fa48("24369"), 'none'),
  LIFECYCLE_MANAGER: stryMutAct_9fa48("24370") ? "" : (stryCov_9fa48("24370"), 'lifecycle_manager'),
  SYSTEM_TABLE_CACHE: stryMutAct_9fa48("24371") ? "" : (stryCov_9fa48("24371"), 'system_table_cache'),
  HEARTBEAT_SERVICE: stryMutAct_9fa48("24372") ? "" : (stryCov_9fa48("24372"), 'heartbeat_service')
}));
class PgWireStartupSafetyGate {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.serviceLifecycleManager - Lifecycle manager.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.heartbeatService - Heartbeat service
   *   (control-plane readiness indicator).
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("24373")) {
      {}
    } else {
      stryCov_9fa48("24373");
      this.nodeId = stryMutAct_9fa48("24376") ? options.nodeId && null : stryMutAct_9fa48("24375") ? false : stryMutAct_9fa48("24374") ? true : (stryCov_9fa48("24374", "24375", "24376"), options.nodeId || null);
      this.serviceLifecycleManager = stryMutAct_9fa48("24379") ? options.serviceLifecycleManager && null : stryMutAct_9fa48("24378") ? false : stryMutAct_9fa48("24377") ? true : (stryCov_9fa48("24377", "24378", "24379"), options.serviceLifecycleManager || null);
      this.systemTableCache = stryMutAct_9fa48("24382") ? options.systemTableCache && null : stryMutAct_9fa48("24381") ? false : stryMutAct_9fa48("24380") ? true : (stryCov_9fa48("24380", "24381", "24382"), options.systemTableCache || null);
      this.heartbeatService = stryMutAct_9fa48("24385") ? options.heartbeatService && null : stryMutAct_9fa48("24384") ? false : stryMutAct_9fa48("24383") ? true : (stryCov_9fa48("24383", "24384", "24385"), options.heartbeatService || null);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(PGWIRE_SAFETY_GATE_SUBSYSTEM) : console;
    }
  }

  /**
   * Check whether control-plane prerequisites are met for PG wire
   * runtime startup.
   *
   * @return {Object} Result with `ready`, `state`, `reason`, and
   *   `blockingDependency`.
   */
  checkControlPlaneReady() {
    if (stryMutAct_9fa48("24386")) {
      {}
    } else {
      stryCov_9fa48("24386");
      const readinessEvidence = this.collectControlPlaneReadinessEvidence();
      const decision = this.resolveControlPlaneReadinessDecision(readinessEvidence);
      return this.buildControlPlaneReadyResult(decision);
    }
  }

  /**
   * Initialize the runtime service handler only if control-plane
   * prerequisites are met. Wraps the setup call so that a PG wire
   * startup failure is logged but does not propagate.
   *
   * @param {Function} setupFn - Function that performs the actual
   *   RuntimeServiceHandlerSetup.create() call. Must return the
   *   handler result object.
   * @return {Object|null} Handler result or null if gated/failed.
   */
  guardedSetup(setupFn) {
    if (stryMutAct_9fa48("24387")) {
      {}
    } else {
      stryCov_9fa48("24387");
      const readiness = this.checkControlPlaneReady();
      if (stryMutAct_9fa48("24390") ? false : stryMutAct_9fa48("24389") ? true : stryMutAct_9fa48("24388") ? readiness.ready : (stryCov_9fa48("24388", "24389", "24390"), !readiness.ready)) {
        if (stryMutAct_9fa48("24391")) {
          {}
        } else {
          stryCov_9fa48("24391");
          this.logger.warn(PGWIRE_SAFETY_GATE_LOG_MSG.GATE_BLOCKED, stryMutAct_9fa48("24392") ? {} : (stryCov_9fa48("24392"), {
            nodeId: this.nodeId,
            reason: readiness.reason
          }));
          return null;
        }
      }
      this.logger.info(PGWIRE_SAFETY_GATE_LOG_MSG.GATE_PASSED, stryMutAct_9fa48("24393") ? {} : (stryCov_9fa48("24393"), {
        nodeId: this.nodeId
      }));
      try {
        if (stryMutAct_9fa48("24394")) {
          {}
        } else {
          stryCov_9fa48("24394");
          const result = setupFn();
          this.logger.info(PGWIRE_SAFETY_GATE_LOG_MSG.SETUP_COMPLETED, stryMutAct_9fa48("24395") ? {} : (stryCov_9fa48("24395"), {
            nodeId: this.nodeId
          }));
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("24396")) {
          {}
        } else {
          stryCov_9fa48("24396");
          this.logger.error(PGWIRE_SAFETY_GATE_LOG_MSG.SETUP_FAILED_ISOLATED, stryMutAct_9fa48("24397") ? {} : (stryCov_9fa48("24397"), {
            nodeId: this.nodeId,
            error: error.message,
            stack: error.stack
          }));
          return null;
        }
      }
    }
  }
  collectControlPlaneReadinessEvidence() {
    if (stryMutAct_9fa48("24398")) {
      {}
    } else {
      stryCov_9fa48("24398");
      return stryMutAct_9fa48("24399") ? [] : (stryCov_9fa48("24399"), [stryMutAct_9fa48("24400") ? {} : (stryCov_9fa48("24400"), {
        dependency: CONTROL_PLANE_PREREQUISITE.LIFECYCLE_MANAGER,
        available: Boolean(this.serviceLifecycleManager),
        blockedReason: PGWIRE_SAFETY_GATE_ERROR_MSG.LIFECYCLE_MANAGER_MISSING
      }), stryMutAct_9fa48("24401") ? {} : (stryCov_9fa48("24401"), {
        dependency: CONTROL_PLANE_PREREQUISITE.SYSTEM_TABLE_CACHE,
        available: Boolean(this.systemTableCache),
        blockedReason: PGWIRE_SAFETY_GATE_ERROR_MSG.SYSTEM_CACHE_MISSING
      }), stryMutAct_9fa48("24402") ? {} : (stryCov_9fa48("24402"), {
        dependency: CONTROL_PLANE_PREREQUISITE.HEARTBEAT_SERVICE,
        available: Boolean(this.heartbeatService),
        blockedReason: PGWIRE_SAFETY_GATE_ERROR_MSG.CONTROL_PLANE_NOT_READY
      })]);
    }
  }
  resolveControlPlaneReadinessDecision(readinessEvidence = stryMutAct_9fa48("24403") ? ["Stryker was here"] : (stryCov_9fa48("24403"), [])) {
    if (stryMutAct_9fa48("24404")) {
      {}
    } else {
      stryCov_9fa48("24404");
      const blockingEvidence = readinessEvidence.find(stryMutAct_9fa48("24405") ? () => undefined : (stryCov_9fa48("24405"), entry => stryMutAct_9fa48("24408") ? entry.available === true : stryMutAct_9fa48("24407") ? false : stryMutAct_9fa48("24406") ? true : (stryCov_9fa48("24406", "24407", "24408"), entry.available !== (stryMutAct_9fa48("24409") ? false : (stryCov_9fa48("24409"), true)))));
      if (stryMutAct_9fa48("24412") ? false : stryMutAct_9fa48("24411") ? true : stryMutAct_9fa48("24410") ? blockingEvidence : (stryCov_9fa48("24410", "24411", "24412"), !blockingEvidence)) {
        if (stryMutAct_9fa48("24413")) {
          {}
        } else {
          stryCov_9fa48("24413");
          return stryMutAct_9fa48("24414") ? {} : (stryCov_9fa48("24414"), {
            state: CONTROL_PLANE_READY_STATE.READY,
            reason: CONTROL_PLANE_READY_REASON.READY,
            blockingDependency: CONTROL_PLANE_PREREQUISITE.NONE
          });
        }
      }
      return stryMutAct_9fa48("24415") ? {} : (stryCov_9fa48("24415"), {
        state: CONTROL_PLANE_READY_STATE.BLOCKED,
        reason: blockingEvidence.blockedReason,
        blockingDependency: blockingEvidence.dependency
      });
    }
  }
  buildControlPlaneReadyResult(decision) {
    if (stryMutAct_9fa48("24416")) {
      {}
    } else {
      stryCov_9fa48("24416");
      return stryMutAct_9fa48("24417") ? {} : (stryCov_9fa48("24417"), {
        ready: stryMutAct_9fa48("24420") ? decision.state !== CONTROL_PLANE_READY_STATE.READY : stryMutAct_9fa48("24419") ? false : stryMutAct_9fa48("24418") ? true : (stryCov_9fa48("24418", "24419", "24420"), decision.state === CONTROL_PLANE_READY_STATE.READY),
        state: decision.state,
        reason: decision.reason,
        blockingDependency: decision.blockingDependency
      });
    }
  }
}
export { PgWireStartupSafetyGate };