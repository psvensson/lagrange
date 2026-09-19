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
const LEASE_SKIP_FIRST_OBSERVATION_MS = 0;

const createDefaultMessageGroupServices = () => new Set();

/**
 * How far past expiry the skipped node's lease is, and for how long this
 * sweep's decision has been taken consecutively for that node - the two
 * facts the existing skip line never carried (the traced seed skipped the
 * same node 33 times while its lease went 166 s past expiry).
 *
 * A RUN IS A RUN OF SKIPS, and it is broken by anything else this sweep
 * observed: a renewal (the lease expiry this sweep read differs from the one
 * the run started on - even a renewal to a time already past), a disconnect,
 * a row that disappeared, or simply a sweep that did not skip this node.
 * That holds whether the sweep completes or a guarded write rejects it,
 * because the reconcile below runs in a `finally`. A sweep whose nodes READ
 * throws is different: it never reaches that `finally`, and it observed
 * nothing, so it leaves every run exactly as it found it. The consequence a
 * test can check on every emitted line:
 * `0 <= skippedForMs <= leaseExpiredForMs`, because the run starts on a sweep
 * that already saw the lease expired, at a time no later than this one.
 *
 * `skippedNodeId` names the node with a role key: the logging service
 * rewrites a top-level `nodeId` to the EMITTING node, and the line's
 * pre-existing `nodeId` field is left exactly as main wrote it.
 *
 * Diagnosis only: nothing read or written here reaches the skip decision,
 * which is still `isNodeTransportConnected` alone.
 * @param {Map<string, Object>} observations - Per-node run state.
 * @param {Object} node - The nodes row the sweep just skipped.
 * @param {number} now - The sweep's own time, from the service's clock.
 * @return {{skippedNodeId: string, leaseExpiredForMs: number|null,
 *   skippedForMs: number}}
 */
function noteLeaseSkipObservation(observations, node, now) {
  const leaseExpiry = Number(node.ready_lease_expires_at);
  const leaseExpiredForMs = Number.isFinite(leaseExpiry) ?
    now - leaseExpiry :
    null;
  const observation = observations.get(node.node_id);
  const continuingRun = observation !== undefined &&
    observation.leaseExpiresAtMs === leaseExpiry;
  if (!continuingRun) {
    observations.set(node.node_id, {
      sinceMs: now,
      leaseExpiresAtMs: leaseExpiry,
    });
    return {
      skippedNodeId: node.node_id,
      leaseExpiredForMs,
      skippedForMs: LEASE_SKIP_FIRST_OBSERVATION_MS,
    };
  }
  return {
    skippedNodeId: node.node_id,
    leaseExpiredForMs,
    // A sweep observed at a time earlier than the run's own start cannot
    // measure that run - the service's clock is the owner's, and a virtual or
    // re-anchored one can step backwards. The run is not restarted by that;
    // this one observation simply reports nothing rather than a negative age.
    skippedForMs: Math.max(
      LEASE_SKIP_FIRST_OBSERVATION_MS,
      now - observation.sinceMs,
    ),
  };
}

/**
 * Forget every node this sweep did not skip. Called from a `finally`, so a
 * sweep that rejects part-way still forgets the nodes it had already stopped
 * skipping, and the map stays bounded by the nodes actually being skipped.
 * @param {Map<string, Object>} observations - Per-node run state.
 * @param {Set<string>} skippedNodeIds - Nodes skipped by the sweep just run.
 * @return {void}
 */
function pruneLeaseSkipObservations(observations, skippedNodeIds) {
  for (const nodeId of observations.keys()) {
    if (!skippedNodeIds.has(nodeId)) {
      observations.delete(nodeId);
    }
  }
}

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
    // Diagnosis only: when each currently-skipped node was first skipped.
    // Pruned to the nodes the last sweep skipped, so it cannot grow.
    this.leaseSkipObservations = new Map();

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
    this.leaseSkipObservations.clear();
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
      this.leaseSkipObservations.clear();
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
    const skippedNodeIds = new Set();
    try {
      await this.disconnectExpiredLeaseHolders(
        expired,
        now,
        expiredIds,
        skippedNodeIds,
      );
    } finally {
      // Whether this sweep completed or a guarded write rejected it, every
      // node it did not skip stops being consecutively skipped. A sweep whose
      // nodes read threw never got here, and observed nothing to reconcile.
      pruneLeaseSkipObservations(this.leaseSkipObservations, skippedNodeIds);
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
   * Reconcile every expired lease this sweep read: skip the ones whose
   * transport is up (the unchanged §1.4.12 decision) and disconnect the
   * rest. Extracted verbatim from `sweepExpiredLeases` so the caller can put
   * the skip bookkeeping in a `finally`; the decisions, their order and the
   * writes and events they produce are unchanged.
   * @param {Object[]} expired - Rows whose ready lease has expired.
   * @param {number} now - The sweep's own time.
   * @param {string[]} expiredIds - Out: node ids actually disconnected.
   * @param {Set<string>} skippedNodeIds - Out: node ids skipped.
   * @return {Promise<void>}
   * @private
   */
  async disconnectExpiredLeaseHolders(
    expired,
    now,
    expiredIds,
    skippedNodeIds,
  ) {
    for (const node of expired) {
      if (this.isNodeTransportConnected(node.node_id)) {
        skippedNodeIds.add(node.node_id);
        this.logger.info(
          LEASE_LOG_MSG.SWEEP_SKIPPED_TRANSPORT_CONNECTED,
          {
            nodeId: node.node_id,
            ...noteLeaseSkipObservation(
              this.leaseSkipObservations,
              node,
              now,
            ),
          },
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
