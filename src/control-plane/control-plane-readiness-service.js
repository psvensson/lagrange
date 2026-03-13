import {LoggingService} from '../logging/logging-service.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from
  '../cache/system-cache-key-descriptor.js';
import {
  CDC_OPERATION,
  COLUMN,
  NUM,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  compareNodeHeartbeatWatermarks,
  isNodeRecordReady,
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {PRESSURE_STATE} from '../rebalancer/storage-capacity-constants.js';
import {AuthoritativeControlPlaneView} from
  './authoritative-control-plane-view.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
} from './control-plane-readiness-constants.js';
import {
  compactEligibilitySnapshot,
  createEligibilitySnapshot,
} from './eligibility-snapshot.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';

const PUBLICATION_REASON_CONFIG_SAFE_MODE = 'config_safe_mode';
const AUTHORITATIVE_READINESS_REPAIR = Object.freeze({
  COOLDOWN_MS: 5000,
  FAILURE_COOLDOWN_MS: 30000,
  NO_CHANGE_COOLDOWN_MS: 15000,
  QUERY_TIMEOUT_MS: 1500,
  STALE_HEARTBEAT_MAX_AGE_MS: 10000,
});
const READINESS_TRANSITION_HISTORY_LIMIT = 32;
const READINESS_ERROR_MSG = Object.freeze({
  STORAGE_ACCOUNTING_OWNER_REQUIRED:
    'ControlPlaneReadinessService requires ' +
    'storageAccountingService for strict readiness evaluation',
  PUBLICATION_OWNER_REQUIRED:
    'ControlPlaneReadinessService requires ' +
    'cdcGroupPropagationService for strict readiness evaluation',
});

function buildReason(
  code,
  dimension,
  sourceOwner,
  observedAt,
  details = null,
) {
  const reason = {
    code,
    dimension,
    sourceOwner,
    observedAt,
  };
  if (details && typeof details === 'object') {
    reason.details = details;
  }
  return Object.freeze(reason);
}

function normalizeIsoTimestamp(nowValue) {
  return new Date(nowValue).toISOString();
}

function normalizePositiveInteger(value, fallback = NUM.ZERO) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    fallback;
}

function normalizeDiagnosticTimestampMs(value) {
  if (Number.isFinite(value)) {
    return value;
  }
  if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

class ControlPlaneReadinessService {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.messageRouter = options.messageRouter || null;
    this.nodeLifecycleStateMachine = options.nodeLifecycleStateMachine || null;
    this.storageAccountingService = options.storageAccountingService || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.cacheMutationTarget =
      options.cacheMutationTarget ||
      options.systemTableCache ||
      null;
    this.cdcGroupPropagationService = options.cdcGroupPropagationService || null;
    this.heartbeatService = options.heartbeatService || null;
    this.strictOwnerDependencies = options.strictOwnerDependencies === true;
    this.clusterMemberStaleHeartbeatMaxAgeMs =
      Number.isFinite(options.clusterMemberStaleHeartbeatMaxAgeMs) &&
        options.clusterMemberStaleHeartbeatMaxAgeMs > NUM.ZERO ?
        Math.floor(options.clusterMemberStaleHeartbeatMaxAgeMs) :
        CONTROL_PLANE_READINESS_DEFAULT
          .CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS;
    this.authoritativeReadinessRepairCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairCooldownMs) &&
        options.authoritativeReadinessRepairCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.COOLDOWN_MS;
    this.authoritativeReadinessRepairFailureCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairFailureCooldownMs) &&
        options.authoritativeReadinessRepairFailureCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairFailureCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.FAILURE_COOLDOWN_MS;
    this.authoritativeReadinessRepairNoChangeCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairNoChangeCooldownMs) &&
        options.authoritativeReadinessRepairNoChangeCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairNoChangeCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.NO_CHANGE_COOLDOWN_MS;
    this.authoritativeReadinessRepairQueryTimeoutMs =
      Number.isFinite(options.authoritativeReadinessRepairQueryTimeoutMs) &&
        options.authoritativeReadinessRepairQueryTimeoutMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairQueryTimeoutMs) :
        AUTHORITATIVE_READINESS_REPAIR.QUERY_TIMEOUT_MS;
    this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs =
      Number.isFinite(
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
      ) &&
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs > NUM.ZERO ?
        Math.floor(
          options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
        ) :
        AUTHORITATIVE_READINESS_REPAIR.STALE_HEARTBEAT_MAX_AGE_MS;
    this.loggedMissingStorageAccountingOwner = false;
    this.loggedMissingPublicationOwner = false;
    this.lastAuthoritativeReadinessRepairAtMsByKey = new Map();
    this.lastAuthoritativeReadinessRepairCooldownMsByKey = new Map();
    this.readinessTransitionHistoryLimit =
      Number.isInteger(options.readinessTransitionHistoryLimit) &&
        options.readinessTransitionHistoryLimit > NUM.ZERO ?
        Math.floor(options.readinessTransitionHistoryLimit) :
        READINESS_TRANSITION_HISTORY_LIMIT;
    this.readinessTransitionHistoryByNodeId = new Map();
    this.lastReadinessEvaluationByNodeId = new Map();
    this.lastReadinessSnapshotByNodeId = new Map();
    this.lastReadinessSnapshotAtMsByNodeId = new Map();
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId = new Map();
    this.authoritativeControlPlaneView =
      options.authoritativeControlPlaneView || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.readinessOperationWorkflowCoordinator =
      options.readinessOperationWorkflowCoordinator ||
      new DurableWorkflowCoordinator({
        now: this.now,
      });
    this.readinessEvaluationLane =
      options.readinessEvaluationLane ||
      new OperationLane({
        name: 'control-plane-readiness-evaluation',
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
      });
    this.authoritativeReadinessRepairLane =
      options.authoritativeReadinessRepairLane ||
      new OperationLane({
        name: 'control-plane-readiness-repair',
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
      });
    this.cacheChangeListener = null;
    this.subscribeToCacheChanges();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CONTROL_PLANE_READINESS_SUBSYSTEM) :
      console;
  }

  /**
   * Build readiness for every known node.
   * @return {Promise<Object[]>}
   */
  async getAllNodeReadiness(options = {}) {
    const nodeRows = this.getNodeRows();
    const readiness = [];

    for (const nodeRow of nodeRows) {
      const nodeId = nodeRow?.[COLUMN.NODE_ID] || null;
      if (!nodeId) {
        continue;
      }
      readiness.push(await this.getNodeReadiness(nodeId, options));
    }

    return readiness;
  }

  /**
   * Build readiness for one node.
   * @readModel READINESS_NODE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_SERVICE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_CAPACITY — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async getNodeReadiness(nodeId, options = {}) {
    const maxCachedAgeMs = normalizePositiveInteger(options.maxCachedAgeMs);
    const cachedSnapshot = this.getCachedReadinessSnapshot(
      nodeId,
      maxCachedAgeMs,
      options,
    );
    if (cachedSnapshot) {
      const snapshotInvalidated = this.isReadinessSnapshotInvalidated(nodeId);
      if (this.shouldBypassCachedSnapshot(cachedSnapshot, options)) {
        // Fall through to a fresh owner-path evaluation when cached readiness
        // is currently ineligible for the requested decision.
      } else if (options.allowStaleOnCacheChange === true && snapshotInvalidated) {
        this.maybeStartBackgroundReadinessRefresh(nodeId, options);
        return cachedSnapshot;
      } else {
        return cachedSnapshot;
      }
    }

    const evaluationKey = this.buildReadinessEvaluationKey(nodeId, options);
    return this.readinessEvaluationLane.run(
      {ownerKey: evaluationKey},
      async () => this.evaluateNodeReadiness(nodeId, options),
    );
  }

  /**
   * Build readiness for one node without consulting the short-lived snapshot
   * cache. Callers that need hot-path deduplication should use
   * `getNodeReadiness`.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   * @private
   */
  async evaluateNodeReadiness(nodeId, options = {}) {
    const observedAt = normalizeIsoTimestamp(this.now());
    const publication = this.getPublicationDiagnostics(observedAt);
    let nodeRow = this.getNodeRow(nodeId);
    let serviceRows = this.getNodeServiceRows(nodeId);

    if (options.allowAuthoritativeRefresh === true) {
      const repaired = await this.maybeRepairAuthoritativeNodeEvidence(
        {
          nodeId,
          nodeRow,
          serviceRows,
        },
        options,
      );
      if (repaired) {
        nodeRow = this.getNodeRow(nodeId);
        serviceRows = this.getNodeServiceRows(nodeId);
      }
    }

    if (!nodeRow) {
      const missingReadiness = this.buildMissingNodeReadiness(
        nodeId,
        observedAt,
        publication,
      );
      this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        nodeEvidence: null,
        dimensions: missingReadiness.dimensions,
        reasons: missingReadiness.reasons,
      });
      const snapshot = Object.freeze({
        ...missingReadiness,
        recentTransitions: this.getReadinessTransitionHistory(nodeId),
      });
      this.storeReadinessSnapshot(nodeId, snapshot);
      return snapshot;
    }

    const lifecycleState = this.getLifecycleState(nodeId, nodeRow);
    const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
    const capacity = await this.getCapacitySnapshot(nodeId, nodeRow);
    const dimensions = this.buildDimensions({
      nodeId,
      nodeRow,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
    });
    const reasons = this.buildReasons({
      nodeId,
      nodeRow,
      nodeEvidence,
      dimensions,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      observedAt,
    });

    const snapshot = Object.freeze({
      ...createEligibilitySnapshot({
        nodeId,
        lifecycleState,
        publication,
        capacity,
        nodeEvidence,
        observedAt,
        dimensions,
        reasons,
      }),
      recentTransitions: this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        nodeEvidence,
        dimensions,
        reasons,
      }),
    });
    this.storeReadinessSnapshot(nodeId, snapshot);
    return snapshot;
  }

  /**
   * Synchronous readiness snapshot for a single node.
   * Computes all dimensions that do not require async capacity lookup.
   * `placementEligible` is conservatively false when capacity is
   * unavailable synchronously, but `serveEligible` remains a pure
   * traffic-admission signal so routing does not fail closed on
   * unavailable placement accounting alone.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Object|null} Frozen readiness snapshot or null.
   */
  getNodeReadinessSync(nodeId, options = {}) {
    const observedAt = normalizeIsoTimestamp(this.now());
    const nodeRow = this.getNodeRow(nodeId);
    const publication = this.getPublicationDiagnostics(observedAt);
    const serviceRows = this.getNodeServiceRows(nodeId);
    const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(
      nodeId,
      nodeRow,
      publication,
    );

    if (fresherStoredSnapshot) {
      this.maybeStartBackgroundSyncReadinessRefresh(
        {
          nodeId,
          nodeRow,
          serviceRows,
          snapshot: fresherStoredSnapshot,
        },
        options,
      );
      return fresherStoredSnapshot;
    }

    if (!nodeRow) {
      const missingReadiness = this.buildMissingNodeReadiness(
        nodeId,
        observedAt,
        publication,
      );
      this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        nodeEvidence: null,
        dimensions: missingReadiness.dimensions,
        reasons: missingReadiness.reasons,
      });
      const snapshot = Object.freeze({
        ...missingReadiness,
        recentTransitions: this.getReadinessTransitionHistory(nodeId),
      });
      this.storeReadinessSnapshot(nodeId, snapshot);
      this.maybeStartBackgroundSyncReadinessRefresh(
        {
          nodeId,
          nodeRow,
          serviceRows,
          snapshot,
        },
        options,
      );
      return snapshot;
    }

    const lifecycleState = this.getLifecycleState(nodeId, nodeRow);
    const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
    const dimensions = this.buildDimensions({
      nodeId,
      nodeRow,
      lifecycleState,
      serviceRows,
      capacity: null,
      publication,
    });
    const reasons = this.buildReasons({
      nodeId,
      nodeRow,
      nodeEvidence,
      dimensions,
      lifecycleState,
      serviceRows,
      capacity: null,
      publication,
      observedAt,
    });

    const snapshot = Object.freeze({
      ...createEligibilitySnapshot({
        nodeId,
        lifecycleState,
        publication,
        capacity: null,
        nodeEvidence,
        observedAt,
        dimensions,
        reasons,
      }),
      recentTransitions: this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        nodeEvidence,
        dimensions,
        reasons,
      }),
    });
    this.storeReadinessSnapshot(nodeId, snapshot);
    this.maybeStartBackgroundSyncReadinessRefresh(
      {
        nodeId,
        nodeRow,
        serviceRows,
        snapshot,
      },
      options,
    );
    return snapshot;
  }

  /**
   * Reuse one previously-computed readiness snapshot when it is fresher than
   * the currently visible cache row. This bridges short read-cache lag after a
   * canonical owner-path refresh without reopening the sync call path to I/O.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @param {Object|null} publication
   * @return {Object|null}
   * @private
   */
  getFresherStoredReadinessSnapshot(nodeId, nodeRow, publication) {
    const storedSnapshot =
      this.lastReadinessSnapshotByNodeId.get(nodeId) || null;
    const capturedAtMs =
      this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null;
    if (!storedSnapshot ||
        !this.isStoredReadinessSnapshotFresh(
          storedSnapshot,
          capturedAtMs,
        )) {
      return null;
    }

    const storedWatermark =
      this.buildStoredReadinessSnapshotWatermark(storedSnapshot);
    if (!storedWatermark) {
      return null;
    }

    if (nodeRow &&
        compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) <= NUM.ZERO) {
      return null;
    }

    return Object.freeze({
      ...storedSnapshot,
      publication: publication && typeof publication === TYPEOF.OBJECT ?
        Object.freeze({...publication}) :
        null,
      recentTransitions: this.getReadinessTransitionHistory(nodeId),
    });
  }

  /**
   * Return true when one stored readiness snapshot is still safe to reuse for
   * hot-path sync consumers.
   * @param {Object|null} snapshot
   * @param {number|null} capturedAtMs
   * @return {boolean}
   * @private
   */
  isStoredReadinessSnapshotFresh(snapshot, capturedAtMs) {
    if (!snapshot || !Number.isFinite(capturedAtMs)) {
      return false;
    }

    const now = this.now();
    if ((now - capturedAtMs) > this.clusterMemberStaleHeartbeatMaxAgeMs) {
      return false;
    }

    const readyLeaseExpiresAt = Number(
      snapshot?.nodeEvidence?.readyLeaseExpiresAt,
    );
    if (Number.isFinite(readyLeaseExpiresAt) &&
        readyLeaseExpiresAt <= now) {
      return false;
    }

    return true;
  }

  /**
   * Build a comparable node watermark from one stored readiness snapshot.
   * @param {Object|null} snapshot
   * @return {Object|null}
   * @private
   */
  buildStoredReadinessSnapshotWatermark(snapshot) {
    const nodeEvidence = snapshot?.nodeEvidence;
    if (!nodeEvidence || typeof nodeEvidence !== TYPEOF.OBJECT) {
      return null;
    }

    const watermark = {};
    const lastHeartbeat = Number(nodeEvidence.lastHeartbeat);
    if (Number.isFinite(lastHeartbeat)) {
      watermark.lastHeartbeat = lastHeartbeat;
    }
    const readyLeaseExpiresAt = Number(nodeEvidence.readyLeaseExpiresAt);
    if (Number.isFinite(readyLeaseExpiresAt)) {
      watermark.readyLeaseExpiresAt = readyLeaseExpiresAt;
    }
    if (typeof nodeEvidence.rowConnectionState === TYPEOF.STRING &&
        nodeEvidence.rowConnectionState.length > NUM.ZERO) {
      watermark.connectionState = nodeEvidence.rowConnectionState;
    }

    return Object.keys(watermark).length > NUM.ZERO ?
      Object.freeze(watermark) :
      null;
  }

  /**
   * Return one recent readiness snapshot when available.
   * @param {string} nodeId
   * @param {number} maxCachedAgeMs
   * @return {Object|null}
   * @private
   */
  getCachedReadinessSnapshot(nodeId, maxCachedAgeMs, options = {}) {
    if (!nodeId || maxCachedAgeMs <= NUM.ZERO) {
      return null;
    }
    const snapshot = this.lastReadinessSnapshotByNodeId.get(nodeId) || null;
    const capturedAtMs =
      this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null;
    if (!snapshot || !Number.isFinite(capturedAtMs)) {
      return null;
    }
    if ((this.now() - capturedAtMs) > maxCachedAgeMs) {
      return null;
    }
    if (this.isReadinessSnapshotInvalidated(nodeId, capturedAtMs) &&
        options.allowStaleOnCacheChange !== true) {
      return null;
    }
    return snapshot;
  }

  /**
   * Return true when callers should bypass cached readiness and refresh
   * synchronously before making a gating decision.
   * @param {Object|null} snapshot
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  shouldBypassCachedSnapshot(snapshot, options = {}) {
    if (options.requireFreshOnIneligible !== true) {
      return false;
    }
    const decisionDimension =
      typeof options.decisionDimension === TYPEOF.STRING &&
        options.decisionDimension.length > NUM.ZERO ?
        options.decisionDimension :
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    const dimensions = snapshot?.dimensions;
    if (!dimensions || typeof dimensions !== TYPEOF.OBJECT) {
      return true;
    }
    return dimensions[decisionDimension] !== true;
  }

  /**
   * Persist one recent readiness snapshot for hot-path reuse.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @private
   */
  storeReadinessSnapshot(nodeId, snapshot) {
    if (!nodeId || !snapshot) {
      return;
    }
    const capturedAtMs = this.now();
    this.lastReadinessSnapshotByNodeId.set(nodeId, snapshot);
    this.lastReadinessSnapshotAtMsByNodeId.set(nodeId, capturedAtMs);
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId.delete(nodeId);
  }

  /**
   * Build one stable single-flight key for readiness evaluations.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  buildReadinessEvaluationKey(nodeId, options = {}) {
    return String(nodeId || '') +
      '::refresh=' +
      String(options.allowAuthoritativeRefresh === true) +
      '::stale=' +
      String(options.allowStaleOnCacheChange === true);
  }

  /**
   * Subscribe to node/service cache changes so hot-path readiness reuse does
   * not outlive fresh cluster evidence.
   * @private
   */
  subscribeToCacheChanges() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.onCacheChange !== TYPEOF.FUNCTION) {
      return;
    }
    this.cacheChangeListener = (tableName, _operation, record) => {
      this.handleCacheChange(tableName, record);
    };
    this.systemTableCache.onCacheChange(this.cacheChangeListener);
  }

  /**
   * Invalidate cached readiness snapshots affected by one cache change.
   * @param {string} tableName
   * @param {Object|null} record
   * @private
   */
  handleCacheChange(tableName, record) {
    if (tableName !== TABLES.NODES && tableName !== TABLES.SERVICES) {
      return;
    }
    const nodeId = String(
      record?.[COLUMN.NODE_ID] ??
        record?.node_id ??
        '',
    );
    if (!nodeId) {
      return;
    }
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId.set(
      nodeId,
      this.now(),
    );
  }

  /**
   * Determine whether one cached readiness snapshot was invalidated by a
   * subsequent node/service cache mutation.
   * @param {string} nodeId
   * @param {number|null} [capturedAtMs]
   * @return {boolean}
   * @private
   */
  isReadinessSnapshotInvalidated(nodeId, capturedAtMs = null) {
    if (!nodeId) {
      return false;
    }
    const invalidatedAtMs = Number(
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.get(nodeId),
    );
    if (!Number.isFinite(invalidatedAtMs) || invalidatedAtMs <= NUM.ZERO) {
      return false;
    }
    const snapshotAtMs = Number.isFinite(capturedAtMs) ?
      capturedAtMs :
      Number(this.lastReadinessSnapshotAtMsByNodeId.get(nodeId));
    if (!Number.isFinite(snapshotAtMs) || snapshotAtMs <= NUM.ZERO) {
      return true;
    }
    return invalidatedAtMs >= snapshotAtMs;
  }

  /**
   * Start one deduped asynchronous readiness refresh when a hot-path caller is
   * allowed to reuse a recently invalidated snapshot.
   * @param {string} nodeId
   * @param {Object} [options]
   * @private
   */
  maybeStartBackgroundReadinessRefresh(nodeId, options = {}) {
    if (!nodeId) {
      return;
    }
    const evaluationKey = this.buildReadinessEvaluationKey(nodeId, options);
    this.readinessEvaluationLane.run(
      {ownerKey: evaluationKey},
      async () => this.evaluateNodeReadiness(nodeId, options),
    ).catch((_error) => null);
  }

  /**
   * Start one background owner-path refresh for sync callers when the visible
   * snapshot is ineligible for the requested decision and connected evidence
   * suggests the cache may be stale.
   * @param {Object} context
   * @param {Object} [options]
   * @private
   */
  maybeStartBackgroundSyncReadinessRefresh(context = {}, options = {}) {
    if (options.allowAuthoritativeRefresh !== true) {
      return;
    }
    if (!this.shouldBypassCachedSnapshot(context.snapshot, options)) {
      return;
    }
    if (!this.shouldRepairAuthoritativeNodeEvidence(context)) {
      return;
    }
    this.maybeStartBackgroundReadinessRefresh(
      context.nodeId,
      options,
    );
  }

  /**
   * Resolve local heartbeat publication diagnostics when available.
   * @return {Object|null}
   * @private
   */
  getHeartbeatPublicationDiagnostics() {
    if (!this.heartbeatService ||
        typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !==
          TYPEOF.FUNCTION) {
      return null;
    }
    try {
      const diagnostics =
        this.heartbeatService.getHeartbeatPublicationDiagnostics();
      return diagnostics && typeof diagnostics === TYPEOF.OBJECT ?
        diagnostics :
        null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Treat fresh local node_state_reporter success as self-liveness evidence
   * when the local cache lags the control-plane round-trip for this node.
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  hasFreshLocalReporterSuccess(nodeId) {
    if (nodeId !== this.nodeId) {
      return false;
    }

    const diagnostics = this.getHeartbeatPublicationDiagnostics();
    if (!diagnostics ||
        diagnostics.publicationPath !== 'node_state_reporter') {
      return false;
    }

    const lastSuccessAtMs =
      normalizeDiagnosticTimestampMs(diagnostics.lastSuccessAt);
    if (!Number.isFinite(lastSuccessAtMs)) {
      return false;
    }

    const lastFailureAtMs =
      normalizeDiagnosticTimestampMs(diagnostics.lastFailureAt);
    if (Number(diagnostics.consecutiveFailures) > NUM.ZERO ||
        (Number.isFinite(lastFailureAtMs) &&
          lastFailureAtMs > lastSuccessAtMs)) {
      return this.shouldGraceTimedOutLocalReporterFailure({
        diagnostics,
        lastSuccessAtMs,
        lastFailureAtMs,
      });
    }

    return (this.now() - lastSuccessAtMs) <=
      this.clusterMemberStaleHeartbeatMaxAgeMs;
  }

  /**
   * Keep self-readiness open through one timed-out reporter attempt when the
   * last canonically visible reporter heartbeat is still fresh. This prevents
   * load-lane self denial while the bounded authoritative repair path is
   * timing out under transient control-plane pressure.
   * @param {Object} context
   * @param {Object} context.diagnostics
   * @param {number} context.lastSuccessAtMs
   * @param {number} context.lastFailureAtMs
   * @return {boolean}
   * @private
   */
  shouldGraceTimedOutLocalReporterFailure(context = {}) {
    const diagnostics = context?.diagnostics || {};
    const lastSuccessAtMs = Number(context?.lastSuccessAtMs);
    const lastFailureAtMs = Number(context?.lastFailureAtMs);
    if (!Number.isFinite(lastSuccessAtMs)) {
      return false;
    }

    if ((this.now() - lastSuccessAtMs) >
        this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs) {
      return false;
    }

    if (!Number.isFinite(lastFailureAtMs) ||
        lastFailureAtMs <= lastSuccessAtMs) {
      return false;
    }

    if (String(diagnostics?.lastFailureStage || '') !== 'attempt_timeout') {
      return false;
    }

    return Number(diagnostics?.consecutiveFailures) <= NUM.ONE;
  }

  /**
   * Resolve publication diagnostics from the canonical publication owner.
   * @param {string} observedAt
   * @return {Object}
   * @private
   */
  getPublicationDiagnostics(observedAt) {
    if (this.cdcGroupPropagationService &&
        typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics ===
          TYPEOF.FUNCTION) {
      return this.cdcGroupPropagationService.getPublicationModeDiagnostics();
    }

    if (!this.loggedMissingPublicationOwner) {
      this.loggedMissingPublicationOwner = true;
      this.logger.error(
        'ControlPlaneReadinessService missing CDC publication owner',
        {
          nodeId: this.nodeId,
          owner: CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
        },
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.PUBLICATION_OWNER_REQUIRED);
    }

    return Object.freeze({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
      reasonCode: 'publication_owner_unavailable',
      enteredAt: observedAt,
      recentTransitions: Object.freeze([]),
    });
  }

  /**
   * Build the readiness dimensions.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildDimensions(context) {
    const publicationHealthy = this.isPublicationHealthy(context.publication);
    const processAlive =
      !CONTROL_PLANE_READINESS_DEFAULT.NON_RUNNING_PROCESS_STATES.includes(
        String(context.lifecycleState || ''),
      );
    const clusterMemberHealthy = this.isClusterMemberHealthy(
      context.nodeId,
      context.nodeRow,
    );
    const routingReady = this.hasRoutableService(context.serviceRows);
    const loadReady = this.isLoadReady(context.nodeRow);
    const controlPlaneWritable = clusterMemberHealthy &&
      routingReady &&
      this.hasWritableControlPlaneService(context.serviceRows) &&
      publicationHealthy;
    const placementEligible = processAlive &&
      clusterMemberHealthy &&
      routingReady &&
      loadReady &&
      controlPlaneWritable &&
      publicationHealthy &&
      this.isCapacityPlacementEligible(context.capacity);

    const repairEligible = processAlive &&
      clusterMemberHealthy &&
      routingReady &&
      controlPlaneWritable &&
      publicationHealthy;

    const transportState = this.getNodeTransportState(
      context.nodeId,
      context.nodeRow,
    );
    const transportNotExplicitlyNegative =
      transportState.routerState !== STATE.DISCONNECTED;

    const serveEligible = repairEligible &&
      loadReady &&
      transportNotExplicitlyNegative;

    return Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: processAlive,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        clusterMemberHealthy,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: routingReady,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: loadReady,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
        placementEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        controlPlaneWritable,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        publicationHealthy,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
        repairEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
        serveEligible,
    });
  }

  /**
   * Determine whether metadata publication mode supports control-plane writes.
   * Grouped mode is healthy, and explicit config-safe-mode repair-only remains
   * healthy because it is a canonical direct-fanout mode rather than runtime
   * degradation.
   * @param {Object} publication
   * @return {boolean}
   * @private
   */
  isPublicationHealthy(publication) {
    const currentMode = publication?.currentMode || null;
    if (currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED) {
      return true;
    }
    if (currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY &&
        publication?.reasonCode === PUBLICATION_REASON_CONFIG_SAFE_MODE) {
      return true;
    }
    return false;
  }

  /**
   * Build structured reasons for non-ready dimensions.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  buildReasons(context) {
    const reasons = [];
    const dimensions = context.dimensions;

    if (!dimensions.processAlive) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
        CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
        CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
        context.observedAt,
      ));
    }
    if (!dimensions.clusterMemberHealthy) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
        CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
        CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
        context.observedAt,
        context.nodeEvidence ||
          this.buildNodeEvidence(context.nodeId, context.nodeRow),
      ));
    }
    if (!dimensions.routingReady) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY,
        CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        context.observedAt,
      ));
    }
    if (!dimensions.loadReady) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY,
        CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        context.observedAt,
      ));
    }
    if (!dimensions.metadataPublicationHealthy) {
      reasons.push(buildReason(
        context.publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY ?
          CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY :
          CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
        CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
        CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
        context.observedAt,
      ));
    }
    if (!dimensions.controlPlaneWritable) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        context.observedAt,
      ));
    }
    if (!this.isCapacityPlacementEligible(context.capacity)) {
      const code = this.getCapacityReasonCode(context.capacity);
      if (code) {
        reasons.push(buildReason(
          code,
          CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
          CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
          context.observedAt,
        ));
      }
    }

    return Object.freeze(reasons);
  }

  /**
   * Build readiness for a missing node row.
   * @param {string} nodeId
   * @param {string} observedAt
   * @param {Object} publication
   * @return {Object}
   * @private
   */
  buildMissingNodeReadiness(nodeId, observedAt, publication) {
    const dimensions = Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    });
    const reasons = Object.freeze([
      buildReason(
        CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING,
        CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        observedAt,
      ),
    ]);

    return createEligibilitySnapshot({
      nodeId,
      lifecycleState: null,
      publication,
      capacity: null,
      nodeEvidence: null,
      observedAt,
      dimensions,
      reasons,
    });
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      now: this.now,
      queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
    });
    return this.authoritativeControlPlaneView;
  }

  /**
   * Build node-row liveness evidence used by readiness diagnostics.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @return {Object|null}
   * @private
   */
  buildNodeEvidence(nodeId, nodeRow) {
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      return null;
    }
    return this.buildClusterMemberHealthDetails(nodeId, nodeRow);
  }

  /**
   * Record one readiness transition when repair/serve eligibility flips.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  recordReadinessTransition(context) {
    const currentState = this.buildReadinessTransitionState(context);
    const previousState =
      this.lastReadinessEvaluationByNodeId.get(context.nodeId) || null;
    this.lastReadinessEvaluationByNodeId.set(context.nodeId, currentState);

    if (!previousState) {
      return this.getReadinessTransitionHistory(context.nodeId);
    }

    const flippedDimensions = [];
    if (previousState.serveEligible !== currentState.serveEligible) {
      flippedDimensions.push(
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      );
    }
    if (previousState.repairEligible !== currentState.repairEligible) {
      flippedDimensions.push(
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );
    }
    if (flippedDimensions.length === NUM.ZERO) {
      return this.getReadinessTransitionHistory(context.nodeId);
    }

    const entry = Object.freeze({
      nodeId: context.nodeId,
      observedAt: currentState.observedAt,
      observedAtMs: currentState.observedAtMs,
      previousServeEligible: previousState.serveEligible,
      serveEligible: currentState.serveEligible,
      previousRepairEligible: previousState.repairEligible,
      repairEligible: currentState.repairEligible,
      previousReasonCodes: Object.freeze([...previousState.reasonCodes]),
      reasonCodes: Object.freeze([...currentState.reasonCodes]),
      flippedDimensions: Object.freeze(flippedDimensions),
      rawInputs: Object.freeze({...currentState.rawInputs}),
    });
    const history =
      this.readinessTransitionHistoryByNodeId.get(context.nodeId) || [];
    const nextHistory = [...history, entry];
    while (nextHistory.length > this.readinessTransitionHistoryLimit) {
      nextHistory.shift();
    }
    this.readinessTransitionHistoryByNodeId.set(context.nodeId, nextHistory);
    return this.getReadinessTransitionHistory(context.nodeId);
  }

  /**
   * Return one defensive copy of readiness transition history.
   * @param {string} nodeId
   * @return {Object[]}
   */
  getReadinessTransitionHistory(nodeId) {
    const history = this.readinessTransitionHistoryByNodeId.get(nodeId);
    if (!Array.isArray(history) || history.length === NUM.ZERO) {
      return Object.freeze([]);
    }
    return Object.freeze(history.map((entry) => Object.freeze({
      ...entry,
      previousReasonCodes: Array.isArray(entry.previousReasonCodes) ?
        Object.freeze([...entry.previousReasonCodes]) :
        Object.freeze([]),
      reasonCodes: Array.isArray(entry.reasonCodes) ?
        Object.freeze([...entry.reasonCodes]) :
        Object.freeze([]),
      flippedDimensions: Array.isArray(entry.flippedDimensions) ?
        Object.freeze([...entry.flippedDimensions]) :
        Object.freeze([]),
      rawInputs: entry.rawInputs && typeof entry.rawInputs === TYPEOF.OBJECT ?
        Object.freeze({...entry.rawInputs}) :
        Object.freeze({}),
    })));
  }

  /**
   * Return transition history for every tracked node.
   * @return {Object}
   */
  getReadinessTransitionHistoryByNodeId() {
    const entries = {};
    for (const nodeId of this.readinessTransitionHistoryByNodeId.keys()) {
      entries[nodeId] = this.getReadinessTransitionHistory(nodeId);
    }
    return Object.freeze(entries);
  }

  /**
   * Normalize one readiness state for transition tracking.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildReadinessTransitionState(context) {
    const observedAtMs = this.now();
    const observedAt = typeof context.observedAt === TYPEOF.STRING &&
      context.observedAt.length > NUM.ZERO ?
      context.observedAt :
      normalizeIsoTimestamp(observedAtMs);
    const reasonCodes = Array.isArray(context.reasons) ?
      [...new Set(
        context.reasons
          .map((reason) => String(reason?.code || ''))
          .filter(Boolean),
      )].sort() :
      [];
    const nodeEvidence = context.nodeEvidence &&
      typeof context.nodeEvidence === TYPEOF.OBJECT ?
      context.nodeEvidence :
      {};
    const dimensions = context.dimensions &&
      typeof context.dimensions === TYPEOF.OBJECT ?
      context.dimensions :
      {};
    const publication = context.publication &&
      typeof context.publication === TYPEOF.OBJECT ?
      context.publication :
      {};

    return Object.freeze({
      observedAt,
      observedAtMs,
      serveEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true,
      repairEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true,
      reasonCodes: Object.freeze(reasonCodes),
      rawInputs: Object.freeze({
        lastHeartbeat: Number.isFinite(nodeEvidence.lastHeartbeat) ?
          nodeEvidence.lastHeartbeat :
          null,
        heartbeatAgeMs: Number.isFinite(nodeEvidence.heartbeatAgeMs) ?
          nodeEvidence.heartbeatAgeMs :
          null,
        readyLeaseExpiresAt: Number.isFinite(nodeEvidence.readyLeaseExpiresAt) ?
          nodeEvidence.readyLeaseExpiresAt :
          null,
        readyLeaseLagMs: Number.isFinite(nodeEvidence.readyLeaseAgeMs) ?
          nodeEvidence.readyLeaseAgeMs :
          null,
        staleHeartbeatLimitMs:
          Number.isFinite(nodeEvidence.staleHeartbeatLimitMs) ?
            nodeEvidence.staleHeartbeatLimitMs :
            null,
        controlPlaneWritable:
          dimensions[
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
          ] === true,
        routingReady:
          dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] === true,
        loadReady:
          dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] === true,
        clusterMemberHealthy:
          dimensions[
            CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
          ] === true,
        metadataPublicationHealthy:
          dimensions[
            CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY
          ] === true,
        publicationMode:
          typeof publication.currentMode === TYPEOF.STRING ?
            publication.currentMode :
            null,
        publicationReasonCode:
          typeof publication.reasonCode === TYPEOF.STRING ?
            publication.reasonCode :
            null,
      }),
    });
  }

  /**
   * Return true when authoritative node/service repair can run.
   * @return {boolean}
   * @private
   */
  canRepairAuthoritativeNodeEvidence() {
    return Boolean(
      this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead ===
        TYPEOF.FUNCTION &&
      this.cacheMutationTarget &&
      typeof this.cacheMutationTarget.applySystemTableChange ===
        TYPEOF.FUNCTION,
    );
  }

  /**
   * Attempt one bounded authoritative repair when cached readiness
   * contradicts active transport state.
   * @param {Object} context
   * @return {Promise<boolean>}
   * @private
   */
  async maybeRepairAuthoritativeNodeEvidence(context, options = {}) {
    if (!this.shouldRepairAuthoritativeNodeEvidence(context)) {
      return false;
    }
    return this.ensureAuthoritativeNodeEvidence(context.nodeId, options);
  }

  /**
   * Build one deduplication key for authoritative readiness repair attempts.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  buildAuthoritativeReadinessRepairKey(nodeId, _options = {}) {
    return String(nodeId || '');
  }

  /**
   * Return true when callers should bypass authoritative-repair cooldown.
   * Admission gates that require a fresh ineligible decision must not stay
   * pinned behind repair backoff when topology availability may have changed.
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  shouldBypassAuthoritativeReadinessRepairCooldown(options = {}) {
    if (options.allowAuthoritativeRefresh !== true ||
        options.requireFreshOnIneligible !== true) {
      return false;
    }
    return true;
  }

  /**
   * Decide whether cached readiness should be refreshed from authoritative
   * node/service rows before denying internal topology work.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  shouldRepairAuthoritativeNodeEvidence(context) {
    if (!this.canRepairAuthoritativeNodeEvidence()) {
      return false;
    }

    const nodeId = context?.nodeId || null;
    const nodeRow = context?.nodeRow || null;
    const serviceRows = Array.isArray(context?.serviceRows) ?
      context.serviceRows :
      [];
    const transportState = this.getNodeTransportState(nodeId, nodeRow);
    if (!transportState.connected) {
      return false;
    }

    if (!nodeRow) {
      return true;
    }

    const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();
    if (status.length > NUM.ZERO && status !== SERVICE_STATUS.ACTIVE) {
      return false;
    }

    const hasFreshLocalReporterSuccess =
      this.hasFreshLocalReporterSuccess(nodeId);
    const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
    if (this.shouldRepairAuthoritativeStaleHeartbeat(nodeEvidence)) {
      return !hasFreshLocalReporterSuccess;
    }

    if (!this.isClusterMemberHealthy(nodeId, nodeRow)) {
      return !hasFreshLocalReporterSuccess;
    }

    return !this.hasRoutableService(serviceRows) ||
      !this.hasWritableControlPlaneService(serviceRows);
  }

  /**
   * Refresh connected node evidence when cached heartbeats are older than the
   * tighter freshness budget used by control-plane diagnostics.
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  shouldRepairAuthoritativeStaleHeartbeat(nodeEvidence) {
    const heartbeatAgeMs = Number(nodeEvidence?.heartbeatAgeMs);
    return Number.isFinite(heartbeatAgeMs) &&
      heartbeatAgeMs >
        this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs;
  }

  /**
   * Run one authoritative node/service repair with per-node deduplication
   * and cooldown so repeated cache contradictions do not fan out work.
   * @param {string} nodeId
   * @return {Promise<boolean>}
   * @private
   */
  async ensureAuthoritativeNodeEvidence(nodeId, options = {}) {
    if (!nodeId || !this.canRepairAuthoritativeNodeEvidence()) {
      return false;
    }
    const repairKey =
      this.buildAuthoritativeReadinessRepairKey(nodeId, options);
    return this.authoritativeReadinessRepairLane.run(
      {ownerKey: repairKey},
      async () => {
        const now = this.now();
        const lastRepairAt =
          this.lastAuthoritativeReadinessRepairAtMsByKey.get(repairKey) ||
          NUM.ZERO;
        const cooldownMs =
          this.lastAuthoritativeReadinessRepairCooldownMsByKey.get(repairKey) ||
          this.authoritativeReadinessRepairCooldownMs;
        const bypassRepairCooldown =
          this.shouldBypassAuthoritativeReadinessRepairCooldown(options);
        if (!bypassRepairCooldown && (now - lastRepairAt) < cooldownMs) {
          return false;
        }

        try {
          const repairResult =
            await this.repairAuthoritativeNodeEvidence(nodeId, options);
          const normalizedRepairResult =
            this.normalizeAuthoritativeReadinessRepairResult(repairResult);
          this.lastAuthoritativeReadinessRepairCooldownMsByKey.set(
            repairKey,
            this.resolveAuthoritativeReadinessRepairCooldownMs(
              normalizedRepairResult,
            ),
          );
          return normalizedRepairResult.repaired === true;
        } catch (error) {
          this.lastAuthoritativeReadinessRepairCooldownMsByKey.set(
            repairKey,
            this.authoritativeReadinessRepairFailureCooldownMs,
          );
          this.logger.warn(
            'Authoritative readiness repair failed',
            {
              nodeId,
              error: error?.message || String(error),
            },
          );
          return false;
        } finally {
          this.lastAuthoritativeReadinessRepairAtMsByKey.set(
            repairKey,
            this.now(),
          );
        }
      },
    );
  }

  /**
   * Reconcile cached node/service rows for one node from authoritative local
   * system-table reads.
   * @param {string} nodeId
   * @return {Promise<Object|boolean>}
   * @private
   */
  async repairAuthoritativeNodeEvidence(nodeId, _options = {}) {
    const causeId = `readiness-authoritative-cache-repair:${nodeId}:${Date.now()}`;
    const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
    if (!authoritativeControlPlaneView) {
      return {
        repaired: false,
        outcome: 'failed',
      };
    }
    const snapshot = await authoritativeControlPlaneView.readNodeSnapshot(
      nodeId,
      {
        allowSqlFallback: true,
        queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
      },
    );
    const nodeRows = snapshot.tables.nodes.success ?
      snapshot.nodeRows :
      null;
    const serviceRows = snapshot.tables.services.success ?
      snapshot.serviceRows :
      null;

    if (!nodeRows && !serviceRows) {
      return {
        repaired: false,
        outcome: 'failed',
      };
    }

    let repairedRowCount = NUM.ZERO;
    if (nodeRows) {
      repairedRowCount += this.applyAuthoritativeRows(
        TABLES.NODES,
        nodeRows,
        this.getNodeRow(nodeId) ? [this.getNodeRow(nodeId)] : [],
        causeId,
      );
    }
    if (serviceRows) {
      repairedRowCount += this.applyAuthoritativeRows(
        TABLES.SERVICES,
        serviceRows,
        this.getNodeServiceRows(nodeId),
        causeId,
      );
    }

    if (repairedRowCount > NUM.ZERO) {
      this.logger.warn(
        'Repaired readiness cache from authoritative node/service rows',
        {
          nodeId,
          repairedRowCount,
          repairedNodeRowCount: Array.isArray(nodeRows) ? nodeRows.length : 0,
          repairedServiceRowCount:
            Array.isArray(serviceRows) ? serviceRows.length : 0,
        },
      );
      return {
        repaired: true,
        outcome: 'repaired',
      };
    }

    return {
      repaired: false,
      outcome: 'unchanged',
    };
  }

  /**
   * Normalize one authoritative repair outcome into a stable shape.
   * @param {Object|boolean|null} repairResult
   * @return {{repaired:boolean,outcome:string}}
   * @private
   */
  normalizeAuthoritativeReadinessRepairResult(repairResult) {
    if (repairResult && typeof repairResult === TYPEOF.OBJECT) {
      return {
        repaired: repairResult.repaired === true,
        outcome: String(repairResult.outcome || 'unchanged'),
      };
    }
    return {
      repaired: repairResult === true,
      outcome: repairResult === true ? 'repaired' : 'unchanged',
    };
  }

  /**
   * Resolve the next repair cooldown from the previous repair outcome.
   * @param {{repaired:boolean,outcome:string}} repairResult
   * @return {number}
   * @private
   */
  resolveAuthoritativeReadinessRepairCooldownMs(repairResult) {
    if (repairResult?.repaired === true ||
        repairResult?.outcome === 'repaired') {
      return this.authoritativeReadinessRepairCooldownMs;
    }
    if (repairResult?.outcome === 'failed') {
      return this.authoritativeReadinessRepairFailureCooldownMs;
    }
    return this.authoritativeReadinessRepairNoChangeCooldownMs;
  }

  /**
   * Apply one authoritative row set to the writable cache target.
   * Rows present authoritatively are upserted; missing cached rows are deleted.
   * @param {string} tableName
   * @param {Object[]} rows
   * @param {Object[]} cachedRows
   * @param {string} causeId
   * @return {number}
   * @private
   */
  applyAuthoritativeRows(tableName, rows, cachedRows, causeId) {
    const primaryKeyField =
      getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const authoritativeRows = Array.isArray(rows) ? rows : [];
    const cachedEntries = Array.isArray(cachedRows) ? cachedRows : [];
    const authoritativeKeys = new Set();
    let mutationCount = NUM.ZERO;

    for (const row of authoritativeRows) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (typeof key === TYPEOF.UNDEFINED || key === null) {
        continue;
      }
      authoritativeKeys.add(key);
      this.cacheMutationTarget.applySystemTableChange(
        tableName,
        CDC_OPERATION.UPSERT,
        row,
        {causeId},
      );
      mutationCount += NUM.ONE;
    }

    for (const row of cachedEntries) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (typeof key === TYPEOF.UNDEFINED ||
          key === null ||
          authoritativeKeys.has(key)) {
        continue;
      }
      this.cacheMutationTarget.applySystemTableChange(
        tableName,
        CDC_OPERATION.DELETE,
        row,
        {causeId},
      );
      mutationCount += NUM.ONE;
    }

    return mutationCount;
  }

  /**
   * Resolve one node row from cache.
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getNodeRow(nodeId) {
    if (!this.systemTableCache) {
      return null;
    }
    if (typeof this.systemTableCache.get === TYPEOF.FUNCTION) {
      return this.systemTableCache.get(TABLES.NODES, nodeId) || null;
    }

    return this.getNodeRows().find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
      null;
  }

  /**
   * Resolve all node rows from cache.
   * @return {Object[]}
   * @private
   */
  getNodeRows() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.NODES);
  }

  /**
   * Resolve service rows for one node.
   * @param {string} nodeId
   * @return {Object[]}
   * @private
   */
  getNodeServiceRows(nodeId) {
    if (!this.systemTableCache) {
      return [];
    }
    if (typeof this.systemTableCache.filter === TYPEOF.FUNCTION) {
      return this.systemTableCache.filter(TABLES.SERVICES, (row) => {
        return row?.[COLUMN.NODE_ID] === nodeId;
      });
    }
    if (typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES).filter((row) => {
      return row?.[COLUMN.NODE_ID] === nodeId;
    });
  }

  /**
   * Resolve the canonical lifecycle state for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {string|null}
   * @private
   */
  getLifecycleState(nodeId, nodeRow) {
    if (nodeId === this.nodeId &&
        this.nodeLifecycleStateMachine &&
        typeof this.nodeLifecycleStateMachine.getState === TYPEOF.FUNCTION) {
      return this.nodeLifecycleStateMachine.getState();
    }
    return nodeRow?.[COLUMN.STATUS] || null;
  }

  /**
   * Resolve the storage snapshot for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Promise<Object|null>}
   * @private
   */
  async getCapacitySnapshot(nodeId, _nodeRow) {
    if (this.storageAccountingService &&
        typeof this.storageAccountingService.getCapacitySnapshotForNode ===
          TYPEOF.FUNCTION) {
      return this.storageAccountingService.getCapacitySnapshotForNode(nodeId);
    }

    if (!this.loggedMissingStorageAccountingOwner) {
      this.loggedMissingStorageAccountingOwner = true;
      this.logger.error(
        'ControlPlaneReadinessService missing storage accounting owner',
        {
          nodeId: this.nodeId,
          owner: CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
        },
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.STORAGE_ACCOUNTING_OWNER_REQUIRED);
    }

    return null;
  }

  /**
   * Return true when the node has at least one active addressed service.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasRoutableService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    if (!serviceRows.some((serviceRow) => {
      return typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    })) {
      return true;
    }
    return serviceRows.some((serviceRow) => {
      return String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
        SERVICE_STATUS.ACTIVE &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
  }

  /**
   * Return true when the node has an active message-group control-plane path.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasWritableControlPlaneService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    return serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
  }

  /**
   * Return true when node resource usage is below the blocking threshold.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isLoadReady(nodeRow) {
    const loadValues = [
      Number(nodeRow?.[COLUMN.CPU_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]),
    ];

    return loadValues.every((value) => {
      return !Number.isFinite(value) ||
        value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT;
    });
  }

  /**
   * Return true when storage state permits placement.
   * @param {Object|null} capacity
   * @return {boolean}
   * @private
   */
  isCapacityPlacementEligible(capacity) {
    if (!capacity) {
      return false;
    }
    if (!Number.isFinite(Number(capacity.budgetBytes)) ||
        Number(capacity.budgetBytes) <= NUM.ZERO) {
      return false;
    }
    return !CONTROL_PLANE_READINESS_DEFAULT
      .PLACEMENT_BLOCKING_PRESSURE_STATES.includes(
        String(capacity.pressureState || ''),
      );
  }

  /**
   * Map storage state to a stable readiness reason code.
   * @param {Object|null} capacity
   * @return {string|null}
   * @private
   */
  getCapacityReasonCode(capacity) {
    if (!capacity) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (!Number.isFinite(Number(capacity.budgetBytes)) ||
        Number(capacity.budgetBytes) <= NUM.ZERO) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (capacity.pressureState === PRESSURE_STATE.HARD) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD;
    }
    if (capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED;
    }
    return null;
  }

  /**
   * Build structured diagnostics for one cluster-member-health miss.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Object}
   * @private
   */
  buildClusterMemberHealthDetails(nodeId, nodeRow) {
    const now = this.now();
    const transportState = this.getNodeTransportState(nodeId, nodeRow);
    const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]);
    const readyLeaseExpiresAt = Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]);
    const heartbeatAgeMs = Number.isFinite(lastHeartbeat) ?
      now - lastHeartbeat :
      null;
    const readyLeaseAgeMs = Number.isFinite(readyLeaseExpiresAt) ?
      now - readyLeaseExpiresAt :
      null;
    const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();

    return Object.freeze({
      status: status.length > NUM.ZERO ? status : null,
      rowConnectionState: transportState.rowState,
      routerConnectionState: transportState.routerState,
      transportConnected: transportState.connected,
      lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
      heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
      readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt) ?
        readyLeaseExpiresAt :
        null,
      readyLeaseAgeMs: Number.isFinite(readyLeaseAgeMs) ? readyLeaseAgeMs : null,
      staleHeartbeatLimitMs: this.clusterMemberStaleHeartbeatMaxAgeMs,
      readyNow: isNodeRecordReady(nodeRow, {now}),
      readyWhenWritten: wasNodeRecordReadyWhenWritten(nodeRow, {now}),
    });
  }

  /**
   * Resolve transport connectivity evidence from row and live router state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {{connected:boolean,rowState:string|null,routerState:string|null}}
   * @private
   */
  getNodeTransportState(nodeId, nodeRow) {
    let routerState = null;
    if (nodeId &&
        this.messageRouter &&
        typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION) {
      routerState = String(
        this.messageRouter.getConnectionState(nodeId) || '',
      ).toLowerCase();
    }

    const rowStateRaw = String(nodeRow?.[COLUMN.CONNECTION_STATE] || '')
      .toLowerCase();
    const normalizedRowState = rowStateRaw.length > NUM.ZERO ?
      rowStateRaw :
      null;
    const normalizedRouterState =
      typeof routerState === TYPEOF.STRING && routerState.length > NUM.ZERO ?
        routerState :
        null;

    let connected = false;
    if (normalizedRouterState === STATE.DISCONNECTED) {
      connected = false;
    } else if (
      normalizedRouterState === STATE.CONNECTED ||
      normalizedRouterState === STATE.READY
    ) {
      connected = true;
    } else {
      connected = normalizedRowState === STATE.CONNECTED ||
        normalizedRowState === STATE.READY;
    }

    return Object.freeze({
      connected,
      rowState: normalizedRowState,
      routerState: normalizedRouterState,
    });
  }

  /**
   * Return true when a node row encodes a transport-connected state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isNodeTransportConnected(nodeId, nodeRow) {
    return this.getNodeTransportState(nodeId, nodeRow).connected;
  }

  /**
   * Return true when heartbeat evidence is recent enough for stale-lease grace.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isRecentHeartbeat(nodeRow) {
    const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]);
    if (!Number.isFinite(lastHeartbeat)) {
      return false;
    }
    return (this.now() - lastHeartbeat) <=
      this.clusterMemberStaleHeartbeatMaxAgeMs;
  }

  /**
   * Evaluate cluster membership health using canonical readiness row data and
   * live transport connectivity when available.
   *
   * Node rows with valid leases are healthy. Rows that were ready when written
   * remain healthy through short cache-propagation lag as long as transport is
   * connected and heartbeat evidence is still fresh.
   *
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isClusterMemberHealthy(nodeId, nodeRow) {
    const hasLeaseField = Number.isFinite(Number(
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT],
    ));
    const hasStatusField = typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING &&
      nodeRow[COLUMN.STATUS].length > NUM.ZERO;

    if (!hasLeaseField && !hasStatusField) {
      return !!nodeRow;
    }

    const now = this.now();
    if (isNodeRecordReady(nodeRow, {now})) {
      return true;
    }

    if (String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase() !==
      SERVICE_STATUS.ACTIVE) {
      return false;
    }

    if (!this.isNodeTransportConnected(nodeId, nodeRow)) {
      return false;
    }

    // §1.4.12: Live transport connectivity is the strongest evidence that
    // a node is reachable.  When the message router reports the node as
    // connected, trust that signal over stale cache lease/heartbeat data.
    // This prevents transient serveEligible=false during topology changes
    // (splits, rebalance) where CDC-driven cache updates lag behind
    // authoritative state.
    return true;
  }

  /**
   * Build a compact snapshot summary suitable for persistence
   * alongside admission, dispatch, and progression decisions.
   *
   * Extracts only the key fields needed for diagnostics linkage
   * without the full verbose snapshot (publication details, capacity
   * breakdown, etc.).
   *
   * @param {Object|null} snapshot - Frozen readiness snapshot from
   *   getNodeReadiness / getNodeReadinessSync.
   * @param {string|null} [decisionDimension] - Canonical dimension used by
   *   the caller when evaluating this snapshot.
   * @return {Object|null} Compact frozen summary or null.
   */
  static compactSnapshotSummary(snapshot, decisionDimension = null) {
    return compactEligibilitySnapshot(snapshot, decisionDimension);
  }
}

export {ControlPlaneReadinessService};
