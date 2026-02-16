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

import {LoggingService} from '../logging/logging-service.js';
import {
  PGWIRE_SAFETY_GATE_ERROR_MSG,
  PGWIRE_SAFETY_GATE_LOG_MSG,
  PGWIRE_SAFETY_GATE_SUBSYSTEM,
} from './pgwire-startup-safety-gate-constants.js';

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
    this.nodeId = options.nodeId || null;
    this.serviceLifecycleManager =
      options.serviceLifecycleManager || null;
    this.systemTableCache = options.systemTableCache || null;
    this.heartbeatService = options.heartbeatService || null;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PGWIRE_SAFETY_GATE_SUBSYSTEM) :
      console;
  }

  /**
   * Check whether control-plane prerequisites are met for PG wire
   * runtime startup.
   *
   * @return {Object} Result with `ready` boolean and `reason` string.
   */
  checkControlPlaneReady() {
    if (!this.serviceLifecycleManager) {
      return {
        ready: false,
        reason: PGWIRE_SAFETY_GATE_ERROR_MSG.LIFECYCLE_MANAGER_MISSING,
      };
    }

    if (!this.systemTableCache) {
      return {
        ready: false,
        reason: PGWIRE_SAFETY_GATE_ERROR_MSG.SYSTEM_CACHE_MISSING,
      };
    }

    if (!this.heartbeatService) {
      return {
        ready: false,
        reason: PGWIRE_SAFETY_GATE_ERROR_MSG.CONTROL_PLANE_NOT_READY,
      };
    }

    return {ready: true, reason: null};
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
    const readiness = this.checkControlPlaneReady();
    if (!readiness.ready) {
      this.logger.warn(PGWIRE_SAFETY_GATE_LOG_MSG.GATE_BLOCKED, {
        nodeId: this.nodeId,
        reason: readiness.reason,
      });
      return null;
    }

    this.logger.info(PGWIRE_SAFETY_GATE_LOG_MSG.GATE_PASSED, {
      nodeId: this.nodeId,
    });

    try {
      const result = setupFn();
      this.logger.info(
        PGWIRE_SAFETY_GATE_LOG_MSG.SETUP_COMPLETED,
        {nodeId: this.nodeId},
      );
      return result;
    } catch (error) {
      this.logger.error(
        PGWIRE_SAFETY_GATE_LOG_MSG.SETUP_FAILED_ISOLATED,
        {
          nodeId: this.nodeId,
          error: error.message,
          stack: error.stack,
        },
      );
      return null;
    }
  }
}

export {PgWireStartupSafetyGate};
