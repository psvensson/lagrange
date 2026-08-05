/**
 * LeaseService - Lease-based readiness tracking and lease sweeping.
 * Extracted from ControlPlaneService.
 * Requirements: 8.3, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {resolveTimeSource} from '../time/time-source.js';
import {
  ENDPOINT_STATUS,
  STATE,
  TABLES,
} from '../constants/index.js';
import {emitInvariant} from '../invariants/invariant-emitter.js';
import {INVARIANT_ID} from '../invariants/invariant-catalog.js';
import {assertCritical} from '../utils/assert.js';
import {
  createControlPlaneRuntimeBundle,
} from './control-plane-runtime-bundle.js';
import {
  readAuthoritativeControlPlaneRows,
} from './control-plane-system-table-gateway.js';
import {
  hasLiveTransportEvidence,
} from './live-transport-evidence.js';
import {
  LEASE_CONFIG_KEY,
  LEASE_REAPER,
  LEASE_DEFAULT_OPTIONS,
  LEASE_EMPTY_QUERY_PARAMS,
  LEASE_DEFAULT,
  LEASE_ERROR_MSG,
  LEASE_EVENT,
  LEASE_LOG_MSG,
  LEASE_SQL,
  LEASE_STATE,
  LEASE_SUBSYSTEM,
} from './lease-service-constants.js';

const LOCAL_STR_LEASESERVICE_REQUIRES_CONTROLPLANESYSTEM = 'LeaseService requires controlPlaneSystemTableGateway';
const LOCAL_STR_UNHEALTHY = 'unhealthy';

const createDefaultMessageGroupServices = () => new Set();

class LeaseService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.nodeLeaseOwner - Canonical owner for node lease
   *   state mutations.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Array<Object>} [options.messageGroupServices] - MG services.
   */
  constructor(options = LEASE_DEFAULT_OPTIONS) {
    super();

    this.nodeId = options.nodeId;
    this.nodeLeaseOwner = options.nodeLeaseOwner || null;
    this.systemTableCache = options.systemTableCache;
    this.sqlQueryEngine = options.sqlQueryEngine;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      (options.sqlQueryEngine || options.systemTableCache || options.messageRouter ?
        createControlPlaneRuntimeBundle({
          nodeId: this.nodeId,
          sqlQueryEngine: this.sqlQueryEngine || null,
          systemTableCache: this.systemTableCache,
          messageRouter: options.messageRouter || null,
        }).controlPlaneSystemTableGateway :
        null);
    this.messageGroupServices =
      options.messageGroupServices ?? createDefaultMessageGroupServices();
    this.messageRouter = options.messageRouter || null;
    // DT4 seam: clock + sweep timer run on one TimeSource (default RealTimeSource =
    // platform Date.now/setInterval/clearInterval, byte-identical to the prior
    // LEASE_NOW/setInterval/clearInterval) so the convergence harness can advance the
    // lease deterministically. Explicit per-fn options keep precedence.
    this.timeSource = resolveTimeSource(options);
    this.now = typeof options.now === 'function' ?
      options.now :
      () => this.timeSource.now();
    this.setIntervalFn = typeof options.setIntervalFn === 'function' ?
      options.setIntervalFn :
      (fn, ms) => this.timeSource.setInterval(fn, ms);
    this.clearIntervalFn = typeof options.clearIntervalFn === 'function' ?
      options.clearIntervalFn :
      (handle) => this.timeSource.clearInterval(handle);

    const config = ConfigurationManager.getInstance();
    this.readyLeaseMs =
      config.get(LEASE_CONFIG_KEY.READY_LEASE_MS) ||
      LEASE_DEFAULT.READY_LEASE_MS;
    this.sweepIntervalMs =
      config.get(LEASE_CONFIG_KEY.SWEEP_INTERVAL_MS) ||
      LEASE_DEFAULT.SWEEP_INTERVAL_MS;

    this.sweepTimer = null;
    this.sweepInFlight = false;
    this.state = LEASE_STATE.CREATED;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(LEASE_SUBSYSTEM);
  }

  /**
   * Initialize the lease service.
   * Transitions: CREATED → INITIALIZED
   */
  initialize() {
    assertCritical(this.nodeId, LEASE_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(
      this.nodeLeaseOwner, LEASE_ERROR_MSG.MISSING_NODE_LEASE_OWNER,
    );
    assertCritical(
      this.systemTableCache, LEASE_ERROR_MSG.MISSING_CACHE,
    );

    this.state = LEASE_STATE.INITIALIZED;
    this.logger.info(LEASE_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      sweepIntervalMs: this.sweepIntervalMs,
    });
  }

  /**
   * Start periodic lease sweeps.
   * Transitions: INITIALIZED → RUNNING
   */
  start() {
    if (this.state !== LEASE_STATE.INITIALIZED) {
      throw new Error(LEASE_ERROR_MSG.NOT_INITIALIZED);
    }
    if (this.sweepTimer) {
      return;
    }

    this.state = LEASE_STATE.RUNNING;

    this.sweepTimer = this.setIntervalFn(() => {
      if (this.state !== LEASE_STATE.RUNNING || this.sweepInFlight) {
        return;
      }
      this.sweepInFlight = true;

      this.sweepExpiredLeases().catch((error) => {
        this.logger.error(LEASE_LOG_MSG.SWEEP_FAILED, {
          error: error.message,
        });
        this.emit(LEASE_EVENT.SWEEP_ERROR, {
          nodeId: this.nodeId,
          error,
        });
      }).finally(() => {
        this.sweepInFlight = false;
      });
    }, this.sweepIntervalMs);
    if (typeof this.sweepTimer?.unref === 'function') {
      this.sweepTimer.unref();
    }

    this.logger.info(LEASE_LOG_MSG.STARTED, {nodeId: this.nodeId});
  }

  /**
   * Stop periodic lease sweeps.
   * Transitions: RUNNING → STOPPED
   */
  stop() {
    if (this.sweepTimer) {
      this.clearIntervalFn(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.sweepInFlight = false;
    this.state = LEASE_STATE.STOPPED;
    this.logger.info(LEASE_LOG_MSG.STOPPED, {nodeId: this.nodeId});
  }

  /**
   * Sweep expired readiness leases.
   * Only runs on the leader replica.
   * @return {Promise<Array>} Expired node IDs.
   */
  async sweepExpiredLeases() {
    const hasLeader = Array.from(this.messageGroupServices.values())
      .some((svc) => svc.isLeaderReplica && svc.isLeaderReplica());
    if (!hasLeader) {
      return [];
    }

    const now = this.now();
    const result = await readAuthoritativeControlPlaneRows(
      this.getControlPlaneSystemTableGateway(),
      TABLES.NODES,
      LEASE_SQL.SELECT_ALL_NODES,
      LEASE_EMPTY_QUERY_PARAMS,
    );
    const nodes = result.rows || [];

    const expired = nodes.filter((node) => {
      const leaseExpiry = Number(node.ready_lease_expires_at);
      return Number.isFinite(leaseExpiry) && leaseExpiry <= now;
    });

    const expiredIds = [];
    for (const node of expired) {
      if (this.isNodeTransportConnected(node.node_id)) {
        this.logger.info(
          LEASE_LOG_MSG.SWEEP_SKIPPED_TRANSPORT_CONNECTED,
          {nodeId: node.node_id},
        );
        continue;
      }

      const updateResult =
        await this.nodeLeaseOwner.disconnectNodeDueToLeaseExpiry(
          node,
          now,
        );
      const affectedRows = Number(updateResult?.partitionResult?.affectedRows);
      if (!(affectedRows > 0)) {
        emitInvariant(this, {
          invariantId: INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
          passed: true,
          entityId: node.node_id,
          owningSubsystem: LEASE_SUBSYSTEM,
          observed: {
            guardedWriteApplied: false,
            readyLeaseExpiresAt: node.ready_lease_expires_at ?? null,
            lastHeartbeat: node.last_heartbeat ?? null,
          },
        });
        continue;
      }

      expiredIds.push(node.node_id);
      emitInvariant(this, {
        invariantId: INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
        passed: true,
        entityId: node.node_id,
        owningSubsystem: LEASE_SUBSYSTEM,
        observed: {
          guardedWriteApplied: true,
          readyLeaseExpiresAt: node.ready_lease_expires_at ?? null,
          lastHeartbeat: node.last_heartbeat ?? null,
          nextConnectionState: STATE.DISCONNECTED,
        },
      });
      this.emit(LEASE_EVENT.LEASE_EXPIRED, {nodeId: node.node_id});
    }

    if (expiredIds.length > 0) {
      this.logger.info(LEASE_LOG_MSG.SWEEP_EXPIRED, {
        count: expiredIds.length,
        nodeIds: expiredIds,
      });
    }

    const reapedIds = await this.reapStrandedJoiningRows(nodes, now);

    this.emit(LEASE_EVENT.SWEEP_COMPLETE, {
      expired: expiredIds.length,
      staleRowsReaped: reapedIds.length,
    });

    return expiredIds;
  }

  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */
  getState() {
    return this.state;
  }

  /**
   * §1.4.12: Check whether the message router reports a node as
   * transport-connected. When the router reports connected or ready,
   * the node is reachable and the expired lease is likely caused by
   * CDC propagation delay, not actual node failure.
   * @param {string} nodeId - Node ID to check.
   * @return {boolean} True when the router reports the node connected.
   */
  isNodeTransportConnected(nodeId) {
    return hasLiveTransportEvidence(nodeId, {
      messageRouter: this.messageRouter,
    });
  }

  /**
   * Reap one stranded failed-join row's endpoint rows (node_endpoints and
   * service_endpoints) so no routing target survives the membership row's
   * terminal transition. Endpoint failures are warn-only and never block the
   * membership reap: an orphaned endpoint row is diagnosis noise, a stranded
   * membership row is a correctness hazard.
   * @param {string} nodeId - Node whose endpoint rows are reaped.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async reapStaleRowEndpoints(nodeId, now) {
    const gateway = this.getControlPlaneSystemTableGateway();
    const endpointReaps = [
      {
        tableName: TABLES.NODE_ENDPOINTS,
        data: {status: ENDPOINT_STATUS.INACTIVE, updated_at: now},
      },
      {
        tableName: TABLES.SERVICE_ENDPOINTS,
        data: {health_status: LOCAL_STR_UNHEALTHY, updated_at: now},
      },
    ];
    for (const reap of endpointReaps) {
      try {
        await gateway.updateSystemTableRow(
          reap.tableName,
          {node_id: nodeId},
          reap.data,
        );
      } catch (error) {
        this.logger.warn(LEASE_LOG_MSG.REAPER_ROW_STOP_FAILED, {
          nodeId,
          tableName: reap.tableName,
          error: error.message,
        });
      }
    }
  }

  /**
   * Reap stranded failed-join rows: nodes rows left in `joining` with no
   * live ready lease and no live transport. The failed-join withdrawal
   * drives these to STOPPED on the happy path; when it is deferred, its
   * in-memory reconcile queue is destroyed by teardown, or the process dies
   * first, no live writer ever drives the row terminal. This reaper owns
   * that terminal transition (status -> stopped) and reaps the row's
   * endpoint rows, complementing (not replacing) the lease sweep's
   * connection_state write and the active-node projection's stale-lease
   * trim. A row holding a live lease or live transport is never reaped —
   * the same guard the lease sweep applies, so the reaper cannot strand a
   * genuinely-joining node.
   * @param {Object[]} nodes - Authoritative nodes rows (already read).
   * @param {number} now - Current timestamp.
   * @return {Promise<string[]>} Node IDs driven to STOPPED.
   * @private
   */
  async reapStrandedJoiningRows(nodes, now) {
    const stranded = nodes.filter((node) => {
      if (node.status !== LEASE_REAPER.STRANDED_STATUS) return false;
      const leaseExpiry = Number(node.ready_lease_expires_at);
      const leaseLive = Number.isFinite(leaseExpiry) && leaseExpiry > now;
      return !leaseLive;
    });

    const reapedIds = [];
    for (const node of stranded) {
      if (this.isNodeTransportConnected(node.node_id)) {
        this.logger.info(LEASE_LOG_MSG.REAPER_SKIPPED_TRANSPORT_CONNECTED,
          {nodeId: node.node_id});
        continue;
      }
      try {
        await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
          TABLES.NODES,
          {node_id: node.node_id, status: LEASE_REAPER.STRANDED_STATUS},
          {status: LEASE_REAPER.TARGET_STATUS, updated_at: now},
        );
      } catch (error) {
        this.logger.warn(LEASE_LOG_MSG.REAPER_ROW_STOP_FAILED, {
          nodeId: node.node_id,
          error: error.message,
        });
        continue;
      }
      await this.reapStaleRowEndpoints(node.node_id, now);
      this.logger.warn(LEASE_LOG_MSG.REAPER_ROW_STOPPED,
        {nodeId: node.node_id});
      this.emit(LEASE_EVENT.STALE_ROW_REAPED, {nodeId: node.node_id});
      reapedIds.push(node.node_id);
    }
    if (reapedIds.length > 0) {
      this.logger.warn(LEASE_LOG_MSG.SWEEP_STALE_ROWS_REAPED, {
        count: reapedIds.length,
        nodeIds: reapedIds,
      });
    }
    return reapedIds;
  }

  /**
   * Resolve the canonical system-table gateway for lease sweeps.
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    assertCritical(
      this.controlPlaneSystemTableGateway,
      LOCAL_STR_LEASESERVICE_REQUIRES_CONTROLPLANESYSTEM,
    );
    return this.controlPlaneSystemTableGateway;
  }
}

export {LeaseService};
