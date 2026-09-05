import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {
  isStoredNodeLivenessCurrent,
  recordNodeLivenessSourceChange,
} from './control-plane-readiness-node-liveness-methods.js';
import {installControlPlaneReadinessStoredSnapshotReuseMethods} from
  './control-plane-readiness-stored-snapshot-reuse.js';
import {installControlPlaneReadinessLifecycleMethods} from
  './control-plane-readiness-lifecycle.js';
import {readOwnDataValue} from './readiness-planning-version-contract.js';
import {installControlPlaneReadinessRecoveryEpochSummaryMethods} from
  './control-plane-readiness-recovery-epoch-summary-methods.js';

const READINESS_PLANNING_SOURCE_OBSERVER_LOG_LEVEL = 'warn';
const READINESS_PLANNING_SOURCE_OBSERVER_FAILED_MSG =
  'Readiness planning source observer failed';
const LOCAL_STR_REFRESH = '::refresh=';
const LOCAL_STR_STALE = '::stale=';
const LOCAL_STR_PLANNING = '::planning=';
const LOCAL_STR_REQUIRE_FRESH = '::requireFresh=';
const LOCAL_STR_BACKGROUND = '::background=';
const LOCAL_STR_DIMENSION = '::dimension=';
const stringConstructor = String;

function isPlanningOwnerProducedSnapshot(options = {}) {
  return options.readinessPlanningOwnerBuild === true ||
    options.readinessPlanningColdBootstrapBuild === true;
}

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  TABLES,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const controlPlaneReadinessSnapshotStoreMethods = {
  /**
   * Best-effort services-table mutation version for snapshot reuse
   * arbitration. Null when the cache does not expose versions, which keeps
   * version arbitration disabled rather than wrongly always-invalid.
   * @return {number|null}
   * @private
   */
  getServicesTableMutationVersionForSnapshotReuse() {
    if (
      typeof this.systemTableCache?.getTableMutationVersion !== 'function'
    ) {
      return null;
    }
    try {
      return this.systemTableCache.getTableMutationVersion(TABLES.SERVICES);
    } catch {
      return null;
    }
  },

  /**
   * Return true when the live local query-transport evidence no longer
   * matches the transport verdict captured inside one stored snapshot.
   * Only the self node carries local transport evidence
   * (getLocalQueryTransportEvidence answers null for every other node), so
   * this is a cheap in-memory comparison on the hot path and a no-op for
   * remote rows.
   * @param {string} nodeId
   * @param {Object|null} storedSnapshot
   * @return {boolean}
   * @private
   */
  hasStoredSnapshotLocalQueryTransportDrift(nodeId, storedSnapshot) {
    if (typeof this.getLocalQueryTransportEvidence !== 'function') {
      return false;
    }
    const liveEvidence = this.getLocalQueryTransportEvidence(nodeId);
    if (!liveEvidence || typeof liveEvidence !== 'object') {
      return false;
    }
    const nodeEvidence = storedSnapshot?.nodeEvidence;
    if (!nodeEvidence || typeof nodeEvidence !== 'object') {
      return false;
    }
    return (
      (nodeEvidence.localQueryTransportState ?? null) !==
        (liveEvidence.state ?? null) ||
      (nodeEvidence.localQueryTransportReady ?? null) !==
        (liveEvidence.ready ?? null) ||
      (nodeEvidence.localQueryTransportReasonCode ?? null) !==
        (liveEvidence.reasonCode ?? null) ||
      (nodeEvidence.localQueryTransportRetryAfterMs ?? null) !==
        (liveEvidence.retryAfterMs ?? null)
    );
  },

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
    if (now - capturedAtMs > this.clusterMemberStaleHeartbeatMaxAgeMs) {
      return false;
    }

    if (!isStoredNodeLivenessCurrent(this, snapshot, now)) {
      return false;
    }

    return true;
  },

  /**
   * Build a comparable node watermark from one stored readiness snapshot.
   * @param {Object|null} snapshot
   * @return {Object|null}
   * @private
   */
  buildStoredReadinessSnapshotWatermark(snapshot) {
    const nodeEvidence = snapshot?.nodeEvidence;
    if (!nodeEvidence || typeof nodeEvidence !== 'object') {
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
    if (
      typeof nodeEvidence.rowConnectionState === 'string' &&
      nodeEvidence.rowConnectionState.length > 0
    ) {
      watermark.connectionState = nodeEvidence.rowConnectionState;
    }

    return Object.keys(watermark).length > 0 ?
      Object.freeze(watermark) :
      null;
  },

  /**
   * Return one recent readiness snapshot when available.
   * @param {string} nodeId
   * @param {number} maxCachedAgeMs
   * @return {Object|null}
   * @private
   */
  getCachedReadinessSnapshot(nodeId, maxCachedAgeMs, options = {}) {
    if (!nodeId || maxCachedAgeMs <= 0) {
      return null;
    }
    const snapshot = this.lastReadinessSnapshotByNodeId.get(nodeId) || null;
    const capturedAtMs =
      this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null;
    if (!snapshot || !Number.isFinite(capturedAtMs)) {
      return null;
    }
    if (this.now() - capturedAtMs > maxCachedAgeMs) {
      return null;
    }
    if (
      this.isReadinessSnapshotInvalidated(nodeId, capturedAtMs) &&
      options.allowStaleOnCacheChange !== true
    ) {
      return null;
    }
    return snapshot;
  },

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
    const decisionDimension = this.resolveReadinessDecisionDimension(options);
    const dimensions = snapshot?.dimensions;
    if (!dimensions || typeof dimensions !== 'object') {
      return true;
    }
    return dimensions[decisionDimension] !== true;
  },

  /**
   * Return true when callers should reuse a recent cached ineligible snapshot
   * immediately and refresh the canonical readiness owner in the background.
   * @param {Object|null} snapshot
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  shouldPreferBackgroundRefreshOnIneligible(snapshot, options = {}) {
    if (
      options.allowAuthoritativeRefresh !== true ||
      options.preferBackgroundRefreshOnIneligible !== true
    ) {
      return false;
    }
    const dimensions = snapshot?.dimensions;
    if (!dimensions || typeof dimensions !== 'object') {
      return false;
    }
    const decisionDimension = this.resolveReadinessDecisionDimension(options);
    return dimensions[decisionDimension] !== true;
  },

  /**
   * Resolve the caller's gating dimension with a stable serve default.
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  resolveReadinessDecisionDimension(options = {}) {
    return typeof options.decisionDimension === 'string' &&
      options.decisionDimension.length > 0 ?
      options.decisionDimension :
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
  },

  /**
   * Persist one recent readiness snapshot for hot-path reuse.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @param {number|null} [buildStartedAtMs] When the producing evaluation
   *   began reading its inputs. The snapshot is stamped as of this instant so
   *   an invalidation landing MID-build (CL-019 TOCTOU) still marks it stale;
   *   omitted = legacy behavior (stamped at store time).
   * @private
   */
  storeReadinessSnapshot(
    nodeId,
    snapshot,
    buildStartedAtMs = null,
    options = {},
  ) {
    if (!nodeId || !snapshot) {
      return;
    }
    const nowMs = this.now();
    const capturedAtMs =
      Number.isFinite(buildStartedAtMs) && buildStartedAtMs <= nowMs ?
        buildStartedAtMs :
        nowMs;
    const previousSnapshot = this.lastReadinessSnapshotByNodeId.get(nodeId);
    const snapshotChanged = !previousSnapshot ||
      this.buildRecoveryEpochSignature(nodeId, previousSnapshot) !==
        this.buildRecoveryEpochSignature(nodeId, snapshot);
    this.lastReadinessSnapshotByNodeId.set(nodeId, snapshot);
    this.lastReadinessSnapshotAtMsByNodeId.set(nodeId, capturedAtMs);
    if (!this.lastReadinessSnapshotServicesVersionByNodeId) {
      this.lastReadinessSnapshotServicesVersionByNodeId = new Map();
    }
    this.lastReadinessSnapshotServicesVersionByNodeId.set(
      nodeId,
      this.getServicesTableMutationVersionForSnapshotReuse(),
    );
    const invalidation =
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.get(nodeId);
    const invalidatedAtMs = Number(invalidation?.atMs ?? invalidation);
    if (!Number.isFinite(invalidatedAtMs) || invalidatedAtMs < capturedAtMs) {
      // The marker predates this build's input reads: consumed. A marker at
      // or after capturedAtMs is KEPT so isReadinessSnapshotInvalidated
      // forces one more rebuild — slower, never wrong.
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.delete(nodeId);
    }
    this.recordRecoveryEpochObservation(nodeId, snapshot, nowMs, options);
    if (
      snapshotChanged &&
      !isPlanningOwnerProducedSnapshot(options)
    ) {
      this.recordReadinessPlanningSnapshotChange?.(nodeId);
    }
  },

  /**
   * Track restart/recovery epochs as bounded per-node timelines keyed by the
   * canonical readiness owner, so harness diagnostics can inspect progress
   * directly instead of inferring it from raw logs.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @param {number} observedAtMs
   * @return {void}
   * @private
   */
  recordRecoveryEpochObservation(
    nodeId,
    snapshot,
    observedAtMs,
    options = {},
  ) {
    // This sits on the getNodeReadinessSync hot path (dispatch, admission,
    // planning). The change check must therefore be allocation-light and
    // EXCLUDE observation timestamps: the previous full-summary
    // JSON.stringify compare included observedAtMs, so it never matched —
    // every observation allocated a frozen summary (embedding the whole
    // projection contract), stringified it twice, and appended. The V8
    // profiler pinned this function as the dominant named frame inside the
    // seed's 20-80s event-loop gaps (closure record CL-010).
    const signature = this.buildRecoveryEpochSignature(nodeId, snapshot);
    const recoveryActive = this.isRecoverySnapshotActive(snapshot);
    const currentEpoch = this.currentRecoveryEpochByNodeId.get(nodeId) || null;
    if (!currentEpoch && !recoveryActive) {
      return;
    }

    if (!currentEpoch && recoveryActive) {
      const summary = this.buildRecoveryEpochSummary(
        nodeId,
        snapshot,
        observedAtMs,
      );
      const history = this.recoveryEpochHistoryByNodeId.get(nodeId) || [];
      const epoch = {
        epochId: `${nodeId}:${history.length + this.currentRecoveryEpochByNodeId.size + 1}`,
        nodeId,
        startedAt: summary.observedAt,
        startedAtMs: observedAtMs,
        open: true,
        events: [summary],
        lastEventSignature: signature,
      };
      this.currentRecoveryEpochByNodeId.set(nodeId, epoch);
      if (!isPlanningOwnerProducedSnapshot(options)) {
        this.recordReadinessPlanningRecoveryEpochChange?.(nodeId);
      }
      return;
    }

    if (!currentEpoch) {
      return;
    }

    if (recoveryActive && signature === currentEpoch.lastEventSignature) {
      // Steady-state fast path: nothing semantically changed.
      return;
    }

    const summary = this.buildRecoveryEpochSummary(
      nodeId,
      snapshot,
      observedAtMs,
    );
    if (signature !== currentEpoch.lastEventSignature) {
      currentEpoch.events.push(summary);
      currentEpoch.lastEventSignature = signature;
      if (currentEpoch.events.length > this.recoveryEpochEventLimit) {
        currentEpoch.events.splice(
          0,
          currentEpoch.events.length - this.recoveryEpochEventLimit,
        );
      }
    }

    if (!recoveryActive) {
      currentEpoch.open = false;
      currentEpoch.endedAt = summary.observedAt;
      currentEpoch.endedAtMs = observedAtMs;
      this.currentRecoveryEpochByNodeId.delete(nodeId);
      const {lastEventSignature: _lastEventSignature, ...epochForHistory} =
        currentEpoch;
      const history = this.recoveryEpochHistoryByNodeId.get(nodeId) || [];
      history.push(
        Object.freeze({
          ...epochForHistory,
          events: Object.freeze(
            currentEpoch.events.map((event) => Object.freeze({...event})),
          ),
        }),
      );
      while (history.length > this.recoveryEpochHistoryLimit) {
        history.shift();
      }
      this.recoveryEpochHistoryByNodeId.set(nodeId, history);
    }
    if (!isPlanningOwnerProducedSnapshot(options)) {
      this.recordReadinessPlanningRecoveryEpochChange?.(nodeId);
    }
  },

  /**
   * Build one stable single-flight key for readiness evaluations.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  buildReadinessEvaluationKey(nodeId, options = {}) {
    return (
      stringConstructor(nodeId || '') +
      LOCAL_STR_REFRESH +
      stringConstructor(options.allowAuthoritativeRefresh === true) +
      LOCAL_STR_STALE +
      stringConstructor(options.allowStaleOnCacheChange === true) +
      LOCAL_STR_PLANNING +
      this.resolveMembershipPublicationPlanningSource(options) +
      LOCAL_STR_REQUIRE_FRESH +
      stringConstructor(options.requireFreshOnIneligible === true) +
      LOCAL_STR_BACKGROUND +
      stringConstructor(options.preferBackgroundRefreshOnIneligible === true) +
      LOCAL_STR_DIMENSION +
      this.resolveReadinessDecisionDimension(options)
    );
  },

  /**
   * Subscribe to node/service cache changes so hot-path readiness reuse does
   * not outlive fresh cluster evidence.
   * @private
   */
  subscribeToCacheChanges() {
    if (
      this.isShutDown === true ||
      !this.systemTableCache ||
      typeof this.systemTableCache.onCacheChange !== 'function'
    ) {
      return;
    }
    this.cacheChangeListener = (tableName, operation, record, metadata) => {
      this.handleCacheChange(tableName, operation, record, metadata);
    };
    this.systemTableCache.onCacheChange(this.cacheChangeListener);
  },

  /**
   * Invalidate cached readiness snapshots affected by one cache change.
   * @param {string} tableName
   * @param {string|null} operation
   * @param {Object|null} record
   * @param {Object|null} metadata
   * @private
   */
  handleCacheChange(tableName, operation, record = null, metadata = null) {
    if (record === null && operation && typeof operation === 'object') {
      record = operation;
      operation = null;
    }
    let firstPlanningSourceError = null;
    let semanticSourceOwnerFailed = false;
    const capturePlanningSourceError = (error) => {
      firstPlanningSourceError = firstPlanningSourceError || error;
    };
    this.readinessPlanningSnapshotOwner?.beginCacheChangeTransaction();
    try {
      try {
        recordNodeLivenessSourceChange(this, tableName, record);
      } catch (error) {
        semanticSourceOwnerFailed = true;
        capturePlanningSourceError(error);
      }
      try {
        this.storageAccountingService?.recordCapacitySourceChange?.(
          tableName,
          operation,
          record,
          this.now(),
        );
      } catch (error) {
        semanticSourceOwnerFailed = true;
        capturePlanningSourceError(error);
      }
      try {
        const sourceRevision = readOwnDataValue(
          metadata,
          'tableMutationRevision',
        );
        this.readinessPlanningSnapshotOwner?.recordTableChange(
          tableName,
          operation,
          record,
          semanticSourceOwnerFailed ? null : sourceRevision,
        );
      } catch (error) {
        capturePlanningSourceError(error);
      }
    } finally {
      try {
        this.readinessPlanningSnapshotOwner?.commitCacheChangeTransaction();
      } catch (error) {
        capturePlanningSourceError(error);
      }
    }
    if (firstPlanningSourceError) {
      this.reportReadinessPlanningSourceObserverFailure(
        firstPlanningSourceError,
        tableName,
      );
    } else {
      this.readinessPlanningSourceObserverFailureStreak = 0;
    }
    if (
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS ||
      tableName === TABLES.NODES ||
      tableName === TABLES.SERVICES ||
      tableName === TABLES.PARTITIONS
    ) {
      this.membershipPublicationPlanningSourceRevision += 1;
    }
    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
      // CL-019: publication content feeds the memoized membership-publication
      // diagnostics AND the publication-derived dimensions baked into every
      // stored readiness snapshot. Publication rows carry publication_id, not
      // node_id, so this invalidates cluster-wide.
      this.membershipPublicationDiagnosticsMemo = null;
      this.lastReadinessSnapshotClusterInvalidatedAtMs = this.now();
      return;
    }
    if (tableName !== TABLES.NODES && tableName !== TABLES.SERVICES) {
      return;
    }
    const nodeId = stringConstructor(
      record?.[COLUMN.NODE_ID] ?? record?.node_id ?? '',
    );
    if (!nodeId) {
      return;
    }
    const nowMs = this.now();
    const previous =
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.get(nodeId);
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId.set(nodeId, {
      atMs: nowMs,
      independentAtMs: tableName === TABLES.SERVICES ?
        nowMs : Number(previous?.independentAtMs) || 0,
    });
  },

  /**
   * Determine whether one cached readiness snapshot was invalidated by a
   * subsequent node/service cache mutation.
   * @param {string} nodeId
   * @param {number|null} [capturedAtMs]
   * @return {boolean}
   * @private
   */
  // handleCacheChange is a hot path (one call per cache write): a persistent
  // source-owner fault must not become a per-write log storm. The first
  // failure of a streak goes through the console-only seam; every further
  // failure in the streak is counted, never emitted, and the streak resets on
  // the next clean change.
  reportReadinessPlanningSourceObserverFailure(error, tableName) {
    const streak =
      (this.readinessPlanningSourceObserverFailureStreak ?? 0) + 1;
    this.readinessPlanningSourceObserverFailureStreak = streak;
    if (streak > 1) {
      this.readinessPlanningSourceObserverLogSuppressedCount =
        (this.readinessPlanningSourceObserverLogSuppressedCount ?? 0) + 1;
      return;
    }
    try {
      this.logger?.logConsoleOnly?.(
        READINESS_PLANNING_SOURCE_OBSERVER_LOG_LEVEL,
        READINESS_PLANNING_SOURCE_OBSERVER_FAILED_MSG,
        {error: error.message, tableName},
      );
    } catch {
      // The seam itself failed; keep the failure observable as a count.
      this.readinessPlanningSourceObserverLogSuppressedCount =
        (this.readinessPlanningSourceObserverLogSuppressedCount ?? 0) + 1;
    }
  },

  isReadinessSnapshotInvalidated(nodeId, capturedAtMs = null) {
    if (!nodeId) {
      return false;
    }
    const invalidation =
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.get(nodeId);
    const perNodeInvalidatedAtMs =
      Number(invalidation?.atMs ?? invalidation);
    const clusterInvalidatedAtMs = Number(
      this.lastReadinessSnapshotClusterInvalidatedAtMs,
    );
    const invalidatedAtMs = Math.max(
      Number.isFinite(perNodeInvalidatedAtMs) ? perNodeInvalidatedAtMs : 0,
      Number.isFinite(clusterInvalidatedAtMs) ? clusterInvalidatedAtMs : 0,
    );
    if (invalidatedAtMs <= 0) {
      return false;
    }
    const snapshotAtMs = Number.isFinite(capturedAtMs) ?
      capturedAtMs :
      Number(this.lastReadinessSnapshotAtMsByNodeId.get(nodeId));
    if (!Number.isFinite(snapshotAtMs) || snapshotAtMs <= 0) {
      return true;
    }
    return invalidatedAtMs >= snapshotAtMs;
  },

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
    this.readinessEvaluationLane
      .run({ownerKey: evaluationKey}, async () =>
        this.evaluateNodeReadiness(nodeId, options),
      )
      .catch((_error) => null);
  },

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
    const refresh = this.authoritativeNodeEvidenceReconciler
      .maybeRepairNodeEvidence(context, options)
      .catch((_error) => null);
    if (options.readinessPlanningOwnerBuild !== true) {
      refresh.then((repaired) => {
        if (repaired === true) {
          this.readinessPlanningSnapshotOwner?.requestRefresh(
            context.nodeId,
            options,
          );
        }
      });
    }
  },
};

function installControlPlaneReadinessSnapshotStoreMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(controlPlaneReadinessSnapshotStoreMethods).map(
        ([name, value]) => [
          name,
          {
            configurable: true,
            value,
            writable: true,
          },
        ],
      ),
    ),
  );
  installControlPlaneReadinessStoredSnapshotReuseMethods(prototype);
  installControlPlaneReadinessRecoveryEpochSummaryMethods(prototype);
  installControlPlaneReadinessLifecycleMethods(prototype);
}

export {installControlPlaneReadinessSnapshotStoreMethods};
