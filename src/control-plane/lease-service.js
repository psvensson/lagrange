/**
 * LeaseService - Lease-based readiness tracking and lease sweeping.
 * Extracted from ControlPlaneService.
 * Requirements: 8.3, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  NUM,
  SERVICE_STATUS,
  STATE,
  STRING,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {emitInvariant} from '../invariants/invariant-emitter.js';
import {INVARIANT_ID} from '../invariants/invariant-catalog.js';
import {assertCritical} from '../utils/assert.js';
import {
  ControlPlaneSystemTableGateway,
} from './control-plane-system-table-gateway.js';
import {
  LEASE_CONFIG_KEY,
  LEASE_DEFAULT_OPTIONS,
  LEASE_EMPTY_QUERY_PARAMS,
  LEASE_DEFAULT,
  LEASE_ERROR_MSG,
  LEASE_EVENT,
  LEASE_LOG_MSG,
  LEASE_NOW,
  LEASE_SQL,
  LEASE_STATE,
  LEASE_SUBSYSTEM,
} from './lease-service-constants.js';

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
      new ControlPlaneSystemTableGateway({
        nodeId: this.nodeId,
        sqlQueryEngine: this.sqlQueryEngine,
      });
    this.messageGroupServices =
      options.messageGroupServices ?? createDefaultMessageGroupServices();
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      LEASE_NOW;
    this.setIntervalFn = typeof options.setIntervalFn === TYPEOF.FUNCTION ?
      options.setIntervalFn :
      setInterval;
    this.clearIntervalFn = typeof options.clearIntervalFn === TYPEOF.FUNCTION ?
      options.clearIntervalFn :
      clearInterval;

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
    if (typeof this.sweepTimer?.unref === TYPEOF.FUNCTION) {
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
    let nodes = [];
    if (this.controlPlaneSystemTableGateway) {
      const result = await this.controlPlaneSystemTableGateway.readRows(
        TABLES.NODES,
        LEASE_SQL.SELECT_ALL_NODES,
        LEASE_EMPTY_QUERY_PARAMS,
      );
      nodes = result.rows || [];
    }

    const expired = nodes.filter((node) => {
      const leaseExpiry = Number(node.ready_lease_expires_at);
      return Number.isFinite(leaseExpiry) && leaseExpiry <= now;
    });

    const expiredIds = [];
    for (const node of expired) {
      const updateResult =
        await this.nodeLeaseOwner.disconnectNodeDueToLeaseExpiry(
          node,
          now,
      );
      const affectedRows = Number(updateResult?.partitionResult?.affectedRows);
      if (!(affectedRows > NUM.ZERO)) {
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

    if (expiredIds.length > NUM.ZERO) {
      this.logger.info(LEASE_LOG_MSG.SWEEP_EXPIRED, {
        count: expiredIds.length,
        nodeIds: expiredIds,
      });
    }

    this.emit(LEASE_EVENT.SWEEP_COMPLETE, {
      expired: expiredIds.length,
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
}

export {LeaseService};
