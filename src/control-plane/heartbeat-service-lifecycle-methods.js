import {ConfigurationManager} from '../config/configuration-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {NUM, SERVICE_STATUS, STATE, STRING, TYPEOF} from '../constants/index.js';
import {TABLES} from '../constants/tables.js';
import {buildPublicationActiveGateHandoffContract} from './publication-active-gate-handoff-contract.js';
import {TRANSPORT_CONFIG_KEY, TRANSPORT_DEFAULT} from '../constants/transport.js';
import {assertCritical} from '../utils/assert.js';
import {
  HEARTBEAT_DEFAULT,
  HEARTBEAT_ERROR_MSG,
  HEARTBEAT_EVENT,
  HEARTBEAT_LOG_MSG,
  HEARTBEAT_STATE,
} from './heartbeat-service-constants.js';
import {
  normalizeHeartbeatPublicationDiagnostics,
  recordHeartbeatPublicationAttempt,
  recordHeartbeatPublicationSuccess,
  recordHeartbeatPublicationTarget,
} from './heartbeat-service-write-coalescing.js';
import {HEARTBEAT_SERVICE_LITERAL, ONE, ZERO} from './heartbeat-service-runtime-state.js';

// Phase 4 (4.1c): the membership-publication reconcile is only ever triggered on
// recovering nodes, never on the stable leader — so when those nodes defer to the
// leader (4.1a/b) nothing drives publication. This periodic leader-side driver
// closes that gap: on each heartbeat tick the control_plane_publications
// write-leader enqueues a membership reconcile (idempotent — a no-op once
// converged), so the authority always drives the cluster-wide publication to
// completion. Unconditional since 2026-07-02 (no-flag policy).
// Diagnostics for the EXISTING leader-driven reconcile tick (research, not a new
// mechanism): why does runScheduledMembershipPublicationReconcileTick not drive
// publication during the stall? Transition-logged at warn so it lands in bundles.
const SCHEDULED_RECONCILE_NO_SERVICE_MSG =
  'Scheduled membership reconcile tick: no membershipPublicationService';
const SCHEDULED_RECONCILE_DIAG_MSG =
  'Scheduled membership reconcile tick: owner/leadership state';

class HeartbeatServiceLifecycleMethods {
  /**
   * Initialize the heartbeat service.
   * Transitions: CREATED → INITIALIZED
   */ initialize() {
    assertCritical(this.nodeId, HEARTBEAT_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(this.nodeAddress, HEARTBEAT_ERROR_MSG.MISSING_NODE_ADDRESS);
    assertCritical(this.cdcIntegrationService, HEARTBEAT_ERROR_MSG.MISSING_CDC);
    assertCritical(this.systemTableCache, HEARTBEAT_ERROR_MSG.MISSING_CACHE);
    this.state = HEARTBEAT_STATE.INITIALIZED;
    this.logger.info(HEARTBEAT_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      heartbeatAttemptTimeoutMs: this.heartbeatAttemptTimeoutMs,
    });
  }
  /**
   * Resolve per-attempt heartbeat timeout.
   * Keeps the timeout inside the ready-lease budget so one stalled
   * write cannot suppress all future lease refreshes.
   * @param {number|undefined} overrideMs
   * @return {number}
   * @private
   */ resolveHeartbeatAttemptTimeoutMs(overrideMs) {
    if (Number.isFinite(overrideMs) && overrideMs > ZERO) {
      return Math.floor(overrideMs);
    }
    const config = ConfigurationManager.getInstance();
    const configuredTransportTimeoutMs = config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS);
    const transportMessageTimeoutMs =
      Number.isFinite(configuredTransportTimeoutMs) && configuredTransportTimeoutMs > ZERO ?
        Math.floor(configuredTransportTimeoutMs) :
        TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
    const leaseSafetyWindowMs = Math.max(ONE, Math.floor(this.readyLeaseMs / 3));
    const transportSafetyWindowMs =
      transportMessageTimeoutMs + HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS;
    const defaultTimeoutMs = Math.max(
      this.heartbeatIntervalMs,
      leaseSafetyWindowMs,
      transportSafetyWindowMs,
    );
    const maxSafeTimeoutMs = Math.max(ONE, this.readyLeaseMs - this.heartbeatIntervalMs);
    return Math.max(ONE, Math.min(defaultTimeoutMs, maxSafeTimeoutMs));
  }
  /**
   * Resolve one bounded query timeout for heartbeat write-side SQL.
   * Keeps write routing below the outer heartbeat-attempt watchdog so
   * failed writes do not continue consuming resources after the attempt
   * has already been marked as timed out.
   * @return {number}
   * @private
   */ resolveHeartbeatWriteQueryTimeoutMs() {
    return Math.max(
      ONE,
      this.heartbeatAttemptTimeoutMs - HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS,
    );
  }
  /**
   * Bound how long one successful reporter visibility proof can be reused
   * before the next heartbeat forces another authoritative verification read.
   * @param {number|null|undefined} overrideMs
   * @return {number}
   * @private
   */ resolveReporterVisibilitySuccessTtlMs(overrideMs) {
    if (Number.isFinite(overrideMs) && overrideMs > ZERO) {
      return Math.floor(overrideMs);
    }
    return Math.max(
      this.heartbeatIntervalMs,
      Math.floor(this.readyLeaseMs / HEARTBEAT_SERVICE_LITERAL.VALUE_2),
    );
  }
  /**
   * Bound how often failed or unverified reporter visibility checks can
   * re-trigger authoritative readback while the hot heartbeat path is active.
   * @param {number|null|undefined} overrideMs
   * @return {number}
   * @private
   */ resolveReporterVisibilityRetryIntervalMs(overrideMs) {
    if (Number.isFinite(overrideMs) && overrideMs > ZERO) {
      return Math.floor(overrideMs);
    }
    return Math.max(
      HEARTBEAT_DEFAULT.REPORTER_VISIBILITY_RETRY_INTERVAL_MS,
      this.reporterVisibilitySuccessTtlMs,
    );
  }
  /**
   * Bound the reporter call inside the overall heartbeat write budget.
   * @param {number|null|undefined} heartbeatWriteQueryTimeoutMs
   * @return {number}
   * @private
   */ resolveNodeStateReporterTimeoutMs(heartbeatWriteQueryTimeoutMs) {
    const writeTimeoutMs = Number(heartbeatWriteQueryTimeoutMs);
    if (!Number.isFinite(writeTimeoutMs) || writeTimeoutMs <= ZERO) {
      return ONE;
    }
    const reporterSlackMs = Math.min(
      HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS,
      Math.max(ONE, Math.floor(writeTimeoutMs / 5)),
    );
    return Math.max(ONE, writeTimeoutMs - reporterSlackMs);
  }
  /**
   * Return true when one node-state reporter error was raised by the local
   * reporter timeout watchdog.
   * @param {Error|Object|null} error
   * @return {boolean}
   * @private
   */ isNodeStateReporterTimeoutError(error) {
    return error?.code === HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER_TIMEOUT;
  }
  /**
   * Build one typed missing-node-row error for steady-state heartbeats.
   * @param {string} operation
   * @return {Error}
   * @private
   */ buildMissingNodeRowError(operation = HEARTBEAT_SERVICE_LITERAL.HEARTBEAT) {
    const error = new Error(`${HEARTBEAT_ERROR_MSG.NODE_ROW_MISSING}: ${this.nodeId}`);
    error.code = HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING;
    error.nodeId = this.nodeId;
    error.operation = operation;
    return error;
  }
  /**
   * Execute node-state reporter with an explicit timeout budget.
   * @param {Object} payload
   * @param {number} timeoutMs
   * @return {Promise<Object>}
   * @private
   */ async callNodeStateReporterWithTimeout(payload, timeoutMs) {
    const boundedTimeoutMs = Number(timeoutMs);
    if (!Number.isFinite(boundedTimeoutMs) || boundedTimeoutMs <= ZERO) {
      return this.nodeStateReporter(payload);
    }
    let timeoutHandle = null;
    let settled = false;
    return new Promise((resolve, reject) => {
      const finalize = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle) {
          this.clearTimeoutFn(timeoutHandle);
          timeoutHandle = null;
        }
        callback(value);
      };
      timeoutHandle = this.setTimeoutFn(() => {
        const timeoutError = new Error(`Node-state reporter timed out after ${boundedTimeoutMs}ms`);
        timeoutError.code = HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER_TIMEOUT;
        timeoutError.publicationDiagnostics = {
          publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER,
        };
        finalize(reject, timeoutError);
      }, boundedTimeoutMs);
      if (typeof timeoutHandle?.unref === TYPEOF.FUNCTION) {
        timeoutHandle.unref();
      }
      Promise.resolve()
        .then(() => this.nodeStateReporter(payload))
        .then((result) => {
          finalize(resolve, result);
        })
        .catch((error) => {
          finalize(reject, error);
        });
    });
  }
  /**
   * Set the node-state reporter used for control-plane mediated heartbeats.
   * @param {Function|null} reporter - Async reporter callback.
   */ setNodeStateReporter(reporter) {
    this.nodeStateReporter = typeof reporter === TYPEOF.FUNCTION ? reporter : null;
  }
  /**
   * Enable or disable reporter success visibility verification.
   * Join-time READY publication may opt into one proof, while steady-state
   * heartbeats should not keep re-querying the canonical nodes row.
   * @param {boolean} enabled
   */ setVerifyReporterVisibilityOnSuccess(enabled) {
    this.verifyReporterVisibilityOnSuccess = enabled === true;
  }
  /**
   * Start periodic heartbeats.
   * Transitions: INITIALIZED → RUNNING
   * @param {Object} [options] - Heartbeat options.
   * @param {Function} [options.getStats] - Async fn returning node stats.
   * @param {Object} [options.stats] - Static node stats snapshot.
   * @param {Array<string>} [options.capabilities] - Node capabilities.
   */ start(options = {}) {
    if (this.state !== HEARTBEAT_STATE.INITIALIZED) {
      throw new Error(HEARTBEAT_ERROR_MSG.NOT_INITIALIZED);
    }
    if (this.heartbeatTimer) {
      return;
    }
    this.state = HEARTBEAT_STATE.RUNNING;
    const sendHeartbeat = async () => {
      if (this.state !== HEARTBEAT_STATE.RUNNING || this.heartbeatInFlight === true) {
        return;
      }
      const attempt = this.beginHeartbeatAttempt();
      try {
        let stats = options.stats;
        if (options.getStats) {
          try {
            stats = await options.getStats();
          } catch (error) {
            if (!attempt.timedOut) {
              this.recordFailure('stats', error.message);
            }
            return;
          }
        }
        if (attempt.timedOut) {
          return;
        }
        try {
          await this.sendHeartbeat(stats, options.capabilities);
        } catch (error) {
          if (!attempt.timedOut) {
            this.recordFailure('register', error.message);
          }
          return;
        }
        if (attempt.timedOut) {
          return;
        }
        try {
          await this.runScheduledMembershipPublicationReconcileTick();
        } catch (reconcileError) {
          this.logger.error('Error during scheduled membership publication reconcile tick', reconcileError);
        }
        if (attempt.timedOut) {
          return;
        }
        this.heartbeatCount++;
        if (this.heartbeatConsecutiveFailures > NUM.ZERO) {
          this.logger.info(HEARTBEAT_LOG_MSG.HEARTBEAT_RECOVERED, {
            nodeId: this.nodeId,
            previousFailures: this.heartbeatConsecutiveFailures,
          });
          this.heartbeatConsecutiveFailures = NUM.ZERO;
          this.heartbeatPublicationDiagnostics.consecutiveFailures = NUM.ZERO;
        }
        this.emit(HEARTBEAT_EVENT.HEARTBEAT_SENT, {
          nodeId: this.nodeId,
          count: this.heartbeatCount,
        });
      } finally {
        this.completeHeartbeatAttempt(attempt);
      }
    };
    const heartbeatTick = () => {
      sendHeartbeat();
      // The leader-driven reconcile (runScheduledMembershipPublicationReconcileTick)
      // is otherwise reached only AFTER a successful heartbeat send; during a send
      // stall it would never run. Drive it here, DECOUPLED from the heartbeat-send
      // outcome — it self-guards (in-flight guard + publication-owner check), so an
      // extra drive on a non-owner or busy node is a no-op.
      this.runScheduledMembershipPublicationReconcileTick();
    };
    this.heartbeatTimer = this.setIntervalFn(heartbeatTick, this.heartbeatIntervalMs);
    if (typeof this.heartbeatTimer?.unref === TYPEOF.FUNCTION) {
      this.heartbeatTimer.unref();
    }
    heartbeatTick();
    this.logger.info(HEARTBEAT_LOG_MSG.STARTED, {nodeId: this.nodeId});
  }
  /**
   * Run one scheduled membership publication reconcile tick.
   * If local node is publication owner and missingPublishedCount > 0,
   * drives the owner reconcile directly.
   * @return {Promise<void>}
   */
  async runScheduledMembershipPublicationReconcileTick() {
    if (!this.membershipPublicationService) {
      if (this.scheduledReconcileNoServiceLogged !== true) {
        this.scheduledReconcileNoServiceLogged = true;
        this.logger?.warn?.(SCHEDULED_RECONCILE_NO_SERVICE_MSG, {
          nodeId: this.nodeId,
        });
      }
      this.scheduledReconcileObligationEnabled = false;
      return;
    }
    if (this.scheduledReconcileTickInFlight === true) {
      return;
    }
    this.scheduledReconcileTickInFlight = true;
    try {
      const partitions = this.systemTableCache?.getAll(TABLES.PARTITIONS) || [];
      const pubPartition = partitions.find(
        (p) => p.table_id === TABLES.CONTROL_PLANE_PUBLICATIONS ||
          p.table_name === TABLES.CONTROL_PLANE_PUBLICATIONS,
      );
      const isOwner = pubPartition?.leader_node_id === this.nodeId;

      const reconcileDiagSnapshot =
        `found=${!!pubPartition} owner=${isOwner} ` +
        `leader=${pubPartition?.leader_node_id || 'none'}`;
      if (this.scheduledReconcileDiagSnapshot !== reconcileDiagSnapshot) {
        this.scheduledReconcileDiagSnapshot = reconcileDiagSnapshot;
        this.logger?.warn?.(SCHEDULED_RECONCILE_DIAG_MSG, {
          nodeId: this.nodeId,
          isOwner,
          pubPartitionFound: !!pubPartition,
          pubPartitionLeaderNodeId: pubPartition?.leader_node_id || null,
          partitionRowCount: partitions.length,
        });
      }

      if (!isOwner) {
        this.scheduledReconcileObligationEnabled = false;
        return;
      }

      const planningSnapshot =
        await this.membershipPublicationService.readPublicationPlanningSnapshot({
          preferAuthoritativeRead: true,
        });

      if (!planningSnapshot) {
        return;
      }

      const latestPublishedRow = planningSnapshot.latestPublishedPublicationRow;
      const latestRow = planningSnapshot.latestPublicationRow;
      const publicationEpoch =
        latestPublishedRow?.publicationEpoch ??
        latestRow?.publicationEpoch ??
        0;
      const publishedActiveNodeIds =
        latestPublishedRow?.publishedActiveNodeIds ??
        latestRow?.publishedActiveNodeIds ??
        [];

      const handoffContract = buildPublicationActiveGateHandoffContract({
        nodeRows: planningSnapshot.nodeRows,
        readinessByNodeId: planningSnapshot.readinessByNodeId,
        publicationConvergence: {
          publicationEpoch,
          publishedActiveNodeIds,
        },
      });

      const missingCount = handoffContract?.missingPublishedCount ?? 0;
      if (missingCount > 0) {
        this.scheduledReconcileObligationEnabled = true;
        await this.membershipPublicationService.reconcileActiveGateMembershipPublication(
          handoffContract,
          {reconcileAuthoritativeMembershipPublication: true},
        );
      } else {
        this.scheduledReconcileObligationEnabled = false;
      }
    } catch (error) {
      this.logger.error('Error in scheduled membership publication reconcile tick', {
        message: error?.message,
        stack: error?.stack,
      });
    } finally {
      this.scheduledReconcileTickInFlight = false;
    }
  }
  /**
   * Stop periodic heartbeats.
   * Transitions: RUNNING → STOPPED
   * @return {void}
   */ stop() {
    if (this.heartbeatTimer) {
      this.clearIntervalFn(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.activeHeartbeatAttempt?.timeoutHandle) {
      this.clearTimeoutFn(this.activeHeartbeatAttempt.timeoutHandle);
      this.activeHeartbeatAttempt.timeoutHandle = null;
    }
    this.activeHeartbeatAttempt = null;
    this.heartbeatInFlight = false;
    this.state = HEARTBEAT_STATE.STOPPED;
    this.logger.info(HEARTBEAT_LOG_MSG.STOPPED, {nodeId: this.nodeId});
  }
  /**
   * Publish one terminal node row before graceful shutdown tears down the
   * control-plane path. This lets immediate rejoin reuse the same node ID
   * without waiting for ready-lease expiry.
   * @return {Promise<boolean>} True when a shutdown row was published.
   */ async reportNodeShutdown() {
    const now = this.now();
    const existing = this.systemTableCache?.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) || null;
    if (!existing) {
      this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_SKIPPED, {
        nodeId: this.nodeId,
        reason: HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING_FROM_CACHE,
      });
      return false;
    }
    const shutdownRow = {
      node_address: this.nodeAddress || existing?.node_address || STRING.UNKNOWN,
      cpu_cores: Number.isFinite(existing?.cpu_cores) ? existing.cpu_cores : NUM.ZERO,
      memory_mb: Number.isFinite(existing?.memory_mb) ? existing.memory_mb : NUM.ZERO,
      disk_gb: Number.isFinite(existing?.disk_gb) ? existing.disk_gb : NUM.ZERO,
      cpu_usage_percent: Number.isFinite(existing?.cpu_usage_percent) ?
        existing.cpu_usage_percent :
        NUM.ZERO,
      memory_usage_percent: Number.isFinite(existing?.memory_usage_percent) ?
        existing.memory_usage_percent :
        NUM.ZERO,
      disk_usage_percent: Number.isFinite(existing?.disk_usage_percent) ?
        existing.disk_usage_percent :
        NUM.ZERO,
      status: SERVICE_STATUS.STOPPED,
      connection_state: STATE.DISCONNECTED,
      capabilities: existing?.capabilities || STRING.EMPTY_JSON_ARRAY,
      last_heartbeat: now,
      ready_lease_expires_at: null,
    };
    const shutdownNodeRow = {...existing, node_id: this.nodeId, ...shutdownRow};
    const queryTimeoutMs = this.resolveHeartbeatWriteQueryTimeoutMs();
    const reporterTimeoutMs = this.resolveNodeStateReporterTimeoutMs(queryTimeoutMs);
    recordHeartbeatPublicationAttempt({
      diagnostics: this.heartbeatPublicationDiagnostics,
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      startedAtMs: now,
    });
    if (typeof this.nodeStateReporter === TYPEOF.FUNCTION) {
      try {
        const reporterResult = await this.callNodeStateReporterWithTimeout(
          {
            nodeId: this.nodeId,
            nodeAddress: shutdownRow.node_address,
            state: shutdownRow.connection_state,
            capabilities: shutdownRow.capabilities,
            heartbeatAt: now,
            readyLeaseExpiresAt: null,
            nodeRow: shutdownNodeRow,
          },
          reporterTimeoutMs,
        );
        const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          reporterResult,
          'node_shutdown_reporter',
        );
        const reporterVisible = await this.verifyReporterHeartbeatVisibility(now, {
          expectedStatus: SERVICE_STATUS.STOPPED,
          expectedConnectionState: STATE.DISCONNECTED,
          expectedReadyLeaseCleared: true,
        });
        if (!reporterVisible) {
          recordHeartbeatPublicationSuccess({
            diagnostics: {
              ...reporterDiagnostics,
              publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_REPORTER_UNVERIFIED,
            },
            heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
            heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
            now,
            serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
          });
          this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, {
            nodeId: this.nodeId,
            publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_REPORTER_UNVERIFIED,
          });
          return true;
        }
        recordHeartbeatPublicationSuccess({
          diagnostics: reporterDiagnostics,
          heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
          heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
          now,
          serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
        });
        this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, {
          nodeId: this.nodeId,
          publicationPath: reporterDiagnostics.publicationPath,
        });
        return true;
      } catch (error) {
        const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          error?.publicationDiagnostics || error,
          'node_shutdown_reporter',
        );
        recordHeartbeatPublicationTarget({
          diagnostics: reporterDiagnostics,
          heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
          serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
        });
        error.publicationDiagnostics = reporterDiagnostics;
        throw error;
      }
    }
    const updateResult = await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: this.nodeId},
      shutdownRow,
      {skipCacheWait: true, queryTimeoutMs},
    );
    const affectedRows = Number(updateResult?.partitionResult?.affectedRows);
    if (affectedRows === NUM.ZERO) {
      this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_SKIPPED, {
        nodeId: this.nodeId,
        reason: HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING_FROM_STORAGE,
      });
      return false;
    }
    recordHeartbeatPublicationSuccess({
      diagnostics: {publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_CDC_UPDATE},
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
      now,
      serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
    });
    this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, {
      nodeId: this.nodeId,
      publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_CDC_UPDATE,
    });
    return true;
  }
  /**
   * Begin one guarded heartbeat attempt with a timeout watchdog.
   * @return {{id: number, timedOut: boolean, timeoutHandle: Object|null}}
   * @private
   */ beginHeartbeatAttempt() {
    const attempt = {
      id: this.heartbeatAttemptSequence + ONE,
      timedOut: false,
      timeoutHandle: null,
      startedAtMs: this.now(),
    };
    this.heartbeatAttemptSequence = attempt.id;
    this.activeHeartbeatAttempt = attempt;
    this.heartbeatInFlight = true;
    recordHeartbeatPublicationAttempt({
      diagnostics: this.heartbeatPublicationDiagnostics,
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      startedAtMs: attempt.startedAtMs,
    });
    attempt.timeoutHandle = this.setTimeoutFn(() => {
      if (attempt.timedOut) {
        return;
      }
      attempt.timedOut = true;
      this.recordFailure(
        HEARTBEAT_SERVICE_LITERAL.ATTEMPT_TIMEOUT,
        `Heartbeat attempt timed out after ${this.heartbeatAttemptTimeoutMs}ms`,
      );
      if (this.activeHeartbeatAttempt?.id === attempt.id) {
        this.activeHeartbeatAttempt = null;
        this.heartbeatInFlight = false;
      }
    }, this.heartbeatAttemptTimeoutMs);
    if (typeof attempt.timeoutHandle?.unref === TYPEOF.FUNCTION) {
      attempt.timeoutHandle.unref();
    }
    return attempt;
  }
  /**
   * Complete one heartbeat attempt and release ownership if still current.
   * @param {{id: number, timeoutHandle: Object|null}|null} attempt
   * @private
   */ completeHeartbeatAttempt(attempt) {
    if (!attempt) {
      return;
    }
    if (attempt.timeoutHandle) {
      this.clearTimeoutFn(attempt.timeoutHandle);
      attempt.timeoutHandle = null;
    }
    if (this.activeHeartbeatAttempt?.id === attempt.id) {
      this.activeHeartbeatAttempt = null;
      this.heartbeatInFlight = false;
    }
  }
}

function defineHeartbeatServiceLifecycleMethods(HeartbeatService) {
  const methodDescriptors = Object.getOwnPropertyDescriptors(
    HeartbeatServiceLifecycleMethods.prototype,
  );
  delete methodDescriptors.constructor;
  Object.defineProperties(HeartbeatService.prototype, methodDescriptors);
}

export {defineHeartbeatServiceLifecycleMethods};
