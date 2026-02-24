/**
 * LeaseService - Lease-based readiness tracking and lease sweeping.
 * Extracted from ControlPlaneService.
 * Requirements: 8.3, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {NUM, SERVICE_STATUS, STATE, STRING} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  LEASE_CONFIG_KEY,
  LEASE_DEFAULT,
  LEASE_ERROR_MSG,
  LEASE_EVENT,
  LEASE_LOG_MSG,
  LEASE_STATE,
  LEASE_SUBSYSTEM,
} from './lease-service-constants.js';

class LeaseService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Array<Object>} [options.messageGroupServices] - MG services.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.messageGroupServices = options.messageGroupServices || new Set();

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
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(LEASE_SUBSYSTEM) : console;
  }

  /**
   * Initialize the lease service.
   * Transitions: CREATED → INITIALIZED
   */
  initialize() {
    assertCritical(this.nodeId, LEASE_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(
      this.cdcIntegrationService, LEASE_ERROR_MSG.MISSING_CDC,
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

    this.sweepTimer = setInterval(() => {
      if (this.state !== LEASE_STATE.RUNNING || this.sweepInFlight) {
        return;
      }
      this.sweepInFlight = true;

      this.sweepExpiredLeases().catch((error) => {
        this.logger.error(LEASE_LOG_MSG.SWEEP_FAILED, {
          error: error.message,
        });
      }).finally(() => {
        this.sweepInFlight = false;
      });
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();

    this.logger.info(LEASE_LOG_MSG.STARTED, {nodeId: this.nodeId});
  }

  /**
   * Stop periodic lease sweeps.
   * Transitions: RUNNING → STOPPED
   */
  stop() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
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

    const now = Date.now();
    let nodes = [];
    if (this.sqlQueryEngine) {
      const result = await this.sqlQueryEngine.executeQuery(
        'SELECT * FROM nodes', [],
      );
      nodes = result.rows || [];
    }

    const expired = nodes.filter((node) => {
      const leaseExpiry = Number(node.ready_lease_expires_at);
      return Number.isFinite(leaseExpiry) && leaseExpiry <= now;
    });

    const expiredIds = [];
    for (const node of expired) {
      const baseRow = {
        node_id: node.node_id,
        node_address: node.node_address || STRING.UNKNOWN,
        cpu_cores: node.cpu_cores || NUM.ZERO,
        memory_mb: node.memory_mb || NUM.ZERO,
        disk_gb: node.disk_gb || NUM.ZERO,
        cpu_usage_percent: node.cpu_usage_percent || NUM.ZERO,
        memory_usage_percent: node.memory_usage_percent || NUM.ZERO,
        disk_usage_percent: node.disk_usage_percent || NUM.ZERO,
        status: node.status || SERVICE_STATUS.ACTIVE,
        connection_state: STATE.DISCONNECTED,
        capabilities: node.capabilities || STRING.EMPTY_JSON_ARRAY,
        last_heartbeat: node.last_heartbeat || now,
        ready_lease_expires_at: null,
        created_at: node.created_at || now,
      };

      await this.cdcIntegrationService.upsertSystemTableRow(
        SystemTableName.NODES, baseRow,
      );

      expiredIds.push(node.node_id);
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
