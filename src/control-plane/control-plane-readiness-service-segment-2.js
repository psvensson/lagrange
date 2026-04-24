import { CONTROL_PLANE_READINESS_SERVICE_SHARED } from "./control-plane-readiness-service-shared.js";
import { ControlPlaneReadinessServiceSegment1 } from "./control-plane-readiness-service-segment-1.js";

const {
  AUTHORITATIVE_READINESS_REPAIR,
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  AuthoritativeControlPlaneView,
  AuthoritativeNodeEvidenceReconciler,
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  ControlPlaneDiagnosticsLedger,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DurableWorkflowCoordinator,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  MEMBERSHIP_PUBLICATION_AUTHORITATIVE_READ_MODE,
  MEMBERSHIP_PUBLICATION_PLANNING,
  MEMBERSHIP_PUBLICATION_PLANNING_READ_OPTIONS,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MEMBERSHIP_PUBLICATION_READ_LANE,
  MEMBERSHIP_PUBLICATION_READ_OPTIONS,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  MISSING_NODE_READINESS_REASON,
  MISSING_NODE_READINESS_STATE,
  NUM,
  OperationLane,
  PRESSURE_STATE,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  PROVISIONING_ELIGIBILITY_STATE,
  PUBLICATION_REASON_CONFIG_SAFE_MODE,
  READINESS_DIAGNOSTICS_LEDGER_LIMIT,
  READINESS_ERROR_MSG,
  READINESS_TRANSITION_HISTORY_LIMIT,
  RECOVERY_EPOCH_EVENT_LIMIT,
  RECOVERY_EPOCH_HISTORY_LIMIT,
  RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
  RECOVERY_PROTOCOL_STATE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STARTUP_AUTHORITY_STATE,
  STATE,
  TABLES,
  TIME_MS,
  TYPEOF,
  assertCritical,
  buildControlPlanePublicationStory,
  buildParticipationErrorCode,
  buildParticipationErrorMessage,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
  buildReadinessTransitionOwnerState,
  buildReason,
  buildStartupAuthorityFailureOwnerDescriptor,
  buildStartupAuthorityHealthDetails,
  buildStartupAuthorityOwnerContract,
  buildStartupAuthorityOwnerSnapshotFromPlanningAnswer,
  buildStartupAuthorityOwnerUnavailableSnapshot,
  buildStartupAuthorityPriorityPartitionOwnerDescriptor,
  buildStartupAuthorityPublicationOwnerDescriptor,
  buildStartupAuthorityRecoveryProtocolOwnerDescriptor,
  buildStartupAuthorityTargetParticipationOwnerDescriptor,
  compactEligibilitySnapshot,
  compareNodeHeartbeatWatermarks,
  createControlPlaneRuntimeBundle,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  normalizeControlPlaneParticipationKind,
  normalizeDiagnosticTimestampMs,
  normalizeIsoTimestamp,
  normalizeLocalQueryTransportEvidence,
  normalizeNodeIdList,
  normalizePositiveInteger,
  resolveMembershipPublicationPlanningSource,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
  resolveParticipationDecisionDimension,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldAllowLocalExecutionForParticipation,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const SERVE_ADMISSION_STATE = Object.freeze({
  ADMITTED: "admitted",
  BLOCKED_PRIORITY_RECOVERY: "blocked_priority_recovery",
  BLOCKED_RUNTIME: "blocked_runtime",
});

class ControlPlaneReadinessServiceSegment2 extends ControlPlaneReadinessServiceSegment1 {
  recordParticipationDecision(participation) {
    if (!participation || !this.participationDecisionLedger) {
      return;
    }
    this.participationDecisionLedger.append({
      nodeId: participation.nodeId || null,
      tableName: participation.tableName || null,
      partitionId: participation.partitionId || null,
      participationKind: participation.participationKind || null,
      decisionDimension: participation.decisionDimension || null,
      decision: participation.decision || null,
      eligible: participation.eligible === true,
      reasonCode: participation.reasonCode || null,
      reasonCodes: Array.isArray(participation.reasonCodes)
        ? [...participation.reasonCodes]
        : [],
      failedDimensions: Array.isArray(participation.failedDimensions)
        ? [...participation.failedDimensions]
        : [],
      localExecutionAllowed: participation.localExecutionAllowed === true,
      cacheWatermark:
        participation.cacheWatermark &&
        typeof participation.cacheWatermark === TYPEOF.OBJECT
          ? { ...participation.cacheWatermark }
          : null,
      transportState:
        participation.transportState &&
        typeof participation.transportState === TYPEOF.OBJECT
          ? { ...participation.transportState }
          : null,
      authoritativeRepair:
        participation.authoritativeRepair &&
        typeof participation.authoritativeRepair === TYPEOF.OBJECT
          ? { ...participation.authoritativeRepair }
          : null,
      lifecyclePhase: participation.lifecyclePhase || null,
      lifecycleState: participation.summary?.lifecycleState || null,
      observedAt: participation.summary?.observedAt || null,
    });
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getParticipationDecisionLedgerEntries(options = {}) {
    return this.participationDecisionLedger
      ? this.participationDecisionLedger.getEntries(options)
      : Object.freeze([]);
  }

  /**
   * @param {Object} entry
   * @return {void}
   * @private
   */
  recordAuthoritativeReadinessRepair(entry = {}) {
    this.authoritativeNodeEvidenceReconciler.recordRepair(entry);
  }

  /**
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getLatestAuthoritativeReadinessRepair(nodeId) {
    return this.authoritativeNodeEvidenceReconciler.getLatestRepair(nodeId);
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getAuthoritativeReadinessRepairLedgerEntries(options = {}) {
    return this.authoritativeNodeEvidenceReconciler.getLedgerEntries(options);
  }

  /**
   * Reuse one previously-computed readiness snapshot when it is fresher than
   * the currently visible cache row. This bridges short read-cache lag after a
   * canonical owner-path refresh without reopening the sync call path to I/O.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @param {Object|null} publication
   * @param {Object|null} membershipPublication
   * @return {Object|null}
   * @private
   */
  getFresherStoredReadinessSnapshot(
    nodeId,
    nodeRow,
    publication,
    membershipPublication,
  ) {
    const storedSnapshot =
      this.lastReadinessSnapshotByNodeId.get(nodeId) || null;
    const capturedAtMs =
      this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null;
    if (
      !storedSnapshot ||
      !this.isStoredReadinessSnapshotFresh(storedSnapshot, capturedAtMs)
    ) {
      return null;
    }

    const storedWatermark =
      this.buildStoredReadinessSnapshotWatermark(storedSnapshot);
    if (!storedWatermark) {
      return null;
    }

    if (
      nodeRow &&
      compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) <= NUM.ZERO
    ) {
      return null;
    }

    return Object.freeze({
      ...storedSnapshot,
      publication:
        publication && typeof publication === TYPEOF.OBJECT
          ? Object.freeze({ ...publication })
          : null,
      membershipPublication:
        membershipPublication && typeof membershipPublication === TYPEOF.OBJECT
          ? Object.freeze({ ...membershipPublication })
          : null,
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
    if (now - capturedAtMs > this.clusterMemberStaleHeartbeatMaxAgeMs) {
      return false;
    }

    const readyLeaseExpiresAt = Number(
      snapshot?.nodeEvidence?.readyLeaseExpiresAt,
    );
    if (Number.isFinite(readyLeaseExpiresAt) && readyLeaseExpiresAt <= now) {
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
    if (
      typeof nodeEvidence.rowConnectionState === TYPEOF.STRING &&
      nodeEvidence.rowConnectionState.length > NUM.ZERO
    ) {
      watermark.connectionState = nodeEvidence.rowConnectionState;
    }

    return Object.keys(watermark).length > NUM.ZERO
      ? Object.freeze(watermark)
      : null;
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
    const decisionDimension = this.resolveReadinessDecisionDimension(options);
    const dimensions = snapshot?.dimensions;
    if (!dimensions || typeof dimensions !== TYPEOF.OBJECT) {
      return true;
    }
    return dimensions[decisionDimension] !== true;
  }

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
    if (!dimensions || typeof dimensions !== TYPEOF.OBJECT) {
      return false;
    }
    const decisionDimension = this.resolveReadinessDecisionDimension(options);
    return dimensions[decisionDimension] !== true;
  }

  /**
   * Resolve the caller's gating dimension with a stable serve default.
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  resolveReadinessDecisionDimension(options = {}) {
    return typeof options.decisionDimension === TYPEOF.STRING &&
      options.decisionDimension.length > NUM.ZERO
      ? options.decisionDimension
      : CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
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
    this.recordRecoveryEpochObservation(nodeId, snapshot, capturedAtMs);
  }

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
  recordRecoveryEpochObservation(nodeId, snapshot, observedAtMs) {
    const summary = this.buildRecoveryEpochSummary(
      nodeId,
      snapshot,
      observedAtMs,
    );
    const recoveryActive = summary.recoveryActive === true;
    const currentEpoch = this.currentRecoveryEpochByNodeId.get(nodeId) || null;
    if (!currentEpoch && !recoveryActive) {
      return;
    }

    if (!currentEpoch && recoveryActive) {
      const history = this.recoveryEpochHistoryByNodeId.get(nodeId) || [];
      const epoch = {
        epochId: `${nodeId}:${history.length + this.currentRecoveryEpochByNodeId.size + 1}`,
        nodeId,
        startedAt: summary.observedAt,
        startedAtMs: observedAtMs,
        open: true,
        events: [summary],
      };
      this.currentRecoveryEpochByNodeId.set(nodeId, epoch);
      return;
    }

    if (!currentEpoch) {
      return;
    }

    const lastEvent =
      currentEpoch.events[currentEpoch.events.length - 1] || null;
    if (!lastEvent || JSON.stringify(lastEvent) !== JSON.stringify(summary)) {
      currentEpoch.events.push(summary);
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
      const history = this.recoveryEpochHistoryByNodeId.get(nodeId) || [];
      history.push(
        Object.freeze({
          ...currentEpoch,
          events: Object.freeze(
            currentEpoch.events.map((event) => Object.freeze({ ...event })),
          ),
        }),
      );
      while (history.length > this.recoveryEpochHistoryLimit) {
        history.shift();
      }
      this.recoveryEpochHistoryByNodeId.set(nodeId, history);
    }
  }

  /**
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @param {number} observedAtMs
   * @return {Object}
   * @private
   */
  buildRecoveryEpochSummary(nodeId, snapshot, observedAtMs) {
    const dimensions =
      snapshot?.dimensions && typeof snapshot.dimensions === TYPEOF.OBJECT
        ? snapshot.dimensions
        : {};
    const reasonCodes = Array.isArray(snapshot?.reasons)
      ? [
          ...new Set(
            snapshot.reasons
              .map((reason) => String(reason?.code || ""))
              .filter(Boolean),
          ),
        ]
      : [];
    return Object.freeze({
      nodeId,
      observedAt: snapshot?.observedAt || normalizeIsoTimestamp(observedAtMs),
      observedAtMs,
      lifecycleState: snapshot?.lifecycleState || null,
      processAlive:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true,
      clusterMemberHealthy:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] ===
        true,
      controlPlaneWritable:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] ===
        true,
      controlPlanePublished:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
        ] === true,
      controlPlaneRecoveryEligible:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
        ] === true,
      repairEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true,
      serveEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true,
      priorityControlPlaneRecoveryActive:
        snapshot?.priorityControlPlaneRecovery?.active === true,
      priorityControlPlaneRecoveryReasonCodes: Array.isArray(
        snapshot?.priorityControlPlaneRecovery?.reasonCodes,
      )
        ? Object.freeze([...snapshot.priorityControlPlaneRecovery.reasonCodes])
        : Object.freeze([]),
      reasonCodes: Object.freeze(reasonCodes),
      recoveryActive: !(
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
        ] === true &&
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] ===
          true &&
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
        ] === true &&
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] ===
          true &&
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true
      ),
    });
  }

  /**
   * @return {Object}
   */
  getRecoveryEpochHistoryByNodeId() {
    const entries = {};
    for (const [
      nodeId,
      history,
    ] of this.recoveryEpochHistoryByNodeId.entries()) {
      entries[nodeId] = Array.isArray(history)
        ? history.map((epoch) =>
            Object.freeze({
              ...epoch,
              events: Object.freeze(
                (Array.isArray(epoch.events) ? epoch.events : []).map((event) =>
                  Object.freeze({ ...event }),
                ),
              ),
            }),
          )
        : [];
    }
    for (const [nodeId, epoch] of this.currentRecoveryEpochByNodeId.entries()) {
      entries[nodeId] = Object.freeze([
        ...(Array.isArray(entries[nodeId]) ? entries[nodeId] : []),
        Object.freeze({
          ...epoch,
          events: Object.freeze(
            (Array.isArray(epoch.events) ? epoch.events : []).map((event) =>
              Object.freeze({ ...event }),
            ),
          ),
        }),
      ]);
    }
    return Object.freeze(entries);
  }

  /**
   * Build one stable single-flight key for readiness evaluations.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  buildReadinessEvaluationKey(nodeId, options = {}) {
    return (
      String(nodeId || "") +
      "::refresh=" +
      String(options.allowAuthoritativeRefresh === true) +
      "::stale=" +
      String(options.allowStaleOnCacheChange === true) +
      "::planning=" +
      this.resolveMembershipPublicationPlanningSource(options)
    );
  }

  /**
   * Subscribe to node/service cache changes so hot-path readiness reuse does
   * not outlive fresh cluster evidence.
   * @private
   */
  subscribeToCacheChanges() {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.onCacheChange !== TYPEOF.FUNCTION
    ) {
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
    const nodeId = String(record?.[COLUMN.NODE_ID] ?? record?.node_id ?? "");
    if (!nodeId) {
      return;
    }
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId.set(nodeId, this.now());
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
    const snapshotAtMs = Number.isFinite(capturedAtMs)
      ? capturedAtMs
      : Number(this.lastReadinessSnapshotAtMsByNodeId.get(nodeId));
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
    this.readinessEvaluationLane
      .run({ ownerKey: evaluationKey }, async () =>
        this.evaluateNodeReadiness(nodeId, options),
      )
      .catch((_error) => null);
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
    this.authoritativeNodeEvidenceReconciler
      .maybeRepairNodeEvidence(context, options)
      .catch((_error) => null);
  }

  /**
   * Resolve local heartbeat publication diagnostics when available.
   * @return {Object|null}
   * @private
   */
  getHeartbeatPublicationDiagnostics() {
    if (
      !this.heartbeatService ||
      typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    try {
      const diagnostics =
        this.heartbeatService.getHeartbeatPublicationDiagnostics();
      return diagnostics && typeof diagnostics === TYPEOF.OBJECT
        ? diagnostics
        : null;
    } catch (_error) {
      return null;
    }
  }

  getHeartbeatPublicationMode() {
    const publicationMode =
      this.heartbeatService?.lastHeartbeatPublicationDecision?.publicationMode;
    return typeof publicationMode === TYPEOF.STRING &&
      publicationMode.length > NUM.ZERO
      ? publicationMode
      : null;
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
    if (!diagnostics || diagnostics.publicationPath !== "node_state_reporter") {
      return false;
    }

    const lastSuccessAtMs = normalizeDiagnosticTimestampMs(
      diagnostics.lastSuccessAt,
    );
    if (!Number.isFinite(lastSuccessAtMs)) {
      return false;
    }

    const lastFailureAtMs = normalizeDiagnosticTimestampMs(
      diagnostics.lastFailureAt,
    );
    if (
      Number(diagnostics.consecutiveFailures) > NUM.ZERO ||
      (Number.isFinite(lastFailureAtMs) && lastFailureAtMs > lastSuccessAtMs)
    ) {
      return this.shouldGraceTimedOutLocalReporterFailure({
        diagnostics,
        lastSuccessAtMs,
        lastFailureAtMs,
      });
    }

    return (
      this.now() - lastSuccessAtMs <= this.clusterMemberStaleHeartbeatMaxAgeMs
    );
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

    if (
      this.now() - lastSuccessAtMs >
      this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs
    ) {
      return false;
    }

    if (
      !Number.isFinite(lastFailureAtMs) ||
      lastFailureAtMs <= lastSuccessAtMs
    ) {
      return false;
    }

    if (String(diagnostics?.lastFailureStage || "") !== "attempt_timeout") {
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
    if (
      this.cdcGroupPropagationService &&
      typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics ===
        TYPEOF.FUNCTION
    ) {
      return this.cdcGroupPropagationService.getPublicationModeDiagnostics();
    }

    if (!this.loggedMissingPublicationOwner) {
      this.loggedMissingPublicationOwner = true;
      this.logMissingOwner(
        "ControlPlaneReadinessService missing CDC publication owner",
        CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.PUBLICATION_OWNER_REQUIRED);
    }

    return Object.freeze({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
      reasonCode: "publication_owner_unavailable",
      enteredAt: observedAt,
      recentTransitions: Object.freeze([]),
    });
  }

  /**
   * Build the single external-serve admission decision from normalized
   * runtime, transport, load, service, and priority-recovery evidence.
   * Recovery admission remains owned by runtime authority; this gate only
   * controls externally routed traffic readiness.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildServeAdmissionSnapshot(context = {}) {
    const runtimeAuthority =
      context?.runtimeAuthority &&
      typeof context.runtimeAuthority === TYPEOF.OBJECT
        ? context.runtimeAuthority
        : this.buildRuntimeAuthoritySnapshot(context);
    const membershipPublicationPlanningSnapshot =
      this.resolveMembershipPublicationPlanningSnapshot(context);
    const priorityRecoveryActive =
      runtimeAuthority.visibility?.priorityRecoveryActive === true ||
      this.isPriorityControlPlaneRecoveryActive(
        membershipPublicationPlanningSnapshot,
      );
    const evidence = Object.freeze({
      repairEligible: runtimeAuthority.repairEligible === true,
      loadReady: context.loadReady === true,
      transportNotExplicitlyNegative:
        context.transportNotExplicitlyNegative === true,
      serveEligibleControlPlaneService:
        context.serveEligibleControlPlaneService === true,
      priorityRecoveryActive,
    });
    const runtimeServeEligible =
      evidence.repairEligible &&
      evidence.loadReady &&
      evidence.transportNotExplicitlyNegative &&
      evidence.serveEligibleControlPlaneService;
    const state = priorityRecoveryActive
      ? SERVE_ADMISSION_STATE.BLOCKED_PRIORITY_RECOVERY
      : runtimeServeEligible
        ? SERVE_ADMISSION_STATE.ADMITTED
        : SERVE_ADMISSION_STATE.BLOCKED_RUNTIME;
    const reasonCodes =
      state === SERVE_ADMISSION_STATE.BLOCKED_PRIORITY_RECOVERY
        ? Object.freeze([
            CONTROL_PLANE_READINESS_REASON
              .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
          ])
        : Object.freeze([]);

    return Object.freeze({
      state,
      eligible: state === SERVE_ADMISSION_STATE.ADMITTED,
      evidence,
      reasonCodes,
    });
  }

  /**
   * Build the readiness dimensions.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildDimensions(context) {
    const runtimeAuthority =
      context?.runtimeAuthority &&
      typeof context.runtimeAuthority === TYPEOF.OBJECT
        ? context.runtimeAuthority
        : this.buildRuntimeAuthoritySnapshot(context);
    const serveEligibleControlPlaneService =
      this.hasServeEligibleControlPlaneService(context.serviceRows);
    const loadReady = this.isLoadReady(context.nodeRow);
    const placementEligible =
      runtimeAuthority.provisioning?.eligible === true &&
      loadReady &&
      this.isCapacityPlacementEligible(context.capacity);
    const transportState = this.getNodeTransportState(
      context.nodeId,
      context.nodeRow,
    );
    const transportNotExplicitlyNegative =
      transportState.routerState !== STATE.DISCONNECTED;
    const serveAdmission = this.buildServeAdmissionSnapshot({
      ...context,
      runtimeAuthority,
      loadReady,
      transportNotExplicitlyNegative,
      serveEligibleControlPlaneService,
    });

    return Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]:
        runtimeAuthority.processAlive === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        runtimeAuthority.clusterMemberHealthy === true,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]:
        runtimeAuthority.routingReady === true,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: loadReady,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: placementEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE]:
        runtimeAuthority.provisioning?.eligible === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        runtimeAuthority.writeEligible === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]:
        runtimeAuthority.visibility?.published === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
        runtimeAuthority.recoveryEligible === true,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        runtimeAuthority.publication?.healthy === true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
        runtimeAuthority.repairEligible === true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
        serveAdmission.eligible,
    });
  }

  /**
   * Recovery admission is broader than ordinary routed traffic: internal
   * control-plane repair must stay possible while cached lifecycle or lease
   * evidence is still converging, as long as transport and service evidence
   * show a reachable control-plane path. During active priority recovery,
   * degraded `REPAIR_ONLY` publication mode still permits recovery admission so
   * the system can repair its way back to grouped publication; steady-state
   * write eligibility remains closed until metadata publication becomes
   * healthy.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  isControlPlaneRecoveryEligible(context = {}) {
    const membershipPublicationPlanningSnapshot =
      this.resolveMembershipPublicationPlanningSnapshot(context);
    const priorityRecoveryActive = this.isPriorityControlPlaneRecoveryActive(
      membershipPublicationPlanningSnapshot,
    );
    const publicationSupportsRecovery =
      context.publicationHealthy === true ||
      (priorityRecoveryActive &&
        context.publicationMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY);
    if (
      context.routingReady !== true ||
      publicationSupportsRecovery !== true ||
      (context.controlPlanePublished !== true && !priorityRecoveryActive)
    ) {
      return false;
    }
    if (context.clusterMemberHealthy === true) {
      return context.writableControlPlaneService === true;
    }
    return this.shouldAllowTransportBackedRecoveryGrace(context);
  }

  isPriorityControlPlaneRecoveryActive(
    membershipPublicationPlanningSnapshot = null,
  ) {
    if (
      !membershipPublicationPlanningSnapshot ||
      typeof membershipPublicationPlanningSnapshot !== TYPEOF.OBJECT
    ) {
      return false;
    }
    const providedPublicationRecoveryGate =
      membershipPublicationPlanningSnapshot.publicationRecoveryGate &&
      typeof membershipPublicationPlanningSnapshot.publicationRecoveryGate ===
        TYPEOF.OBJECT
        ? membershipPublicationPlanningSnapshot.publicationRecoveryGate
        : null;
    const publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
      ...(providedPublicationRecoveryGate || {}),
      publicationEpoch:
        membershipPublicationPlanningSnapshot.publicationEpoch ??
        providedPublicationRecoveryGate?.publicationEpoch ??
        null,
      publicationStatus:
        membershipPublicationPlanningSnapshot.publicationStatus ??
        membershipPublicationPlanningSnapshot.status ??
        providedPublicationRecoveryGate?.publicationStatus ??
        null,
      publicationObservationState:
        membershipPublicationPlanningSnapshot.publicationObservationState ??
        providedPublicationRecoveryGate?.publicationObservationState ??
        null,
      recoveryProtocolState:
        membershipPublicationPlanningSnapshot.recoveryProtocolState ??
        providedPublicationRecoveryGate?.recoveryProtocolState ??
        null,
      priorityRecoveryReasonCodes:
        Array.isArray(
          membershipPublicationPlanningSnapshot.priorityRecoveryReasonCodes,
        )
          ? membershipPublicationPlanningSnapshot.priorityRecoveryReasonCodes
          : providedPublicationRecoveryGate?.reasonCodes,
      priorityPartitionSummary:
        membershipPublicationPlanningSnapshot.priorityPartitionSummary ??
        providedPublicationRecoveryGate?.priorityPartitionSummary ??
        null,
      priorityRecoveryClosureWitness:
        membershipPublicationPlanningSnapshot.priorityRecoveryClosureWitness ??
        providedPublicationRecoveryGate?.priorityRecoveryClosureWitness ??
        null,
      requiredAckNodeIds:
        membershipPublicationPlanningSnapshot.requiredAckNodeIds ??
        providedPublicationRecoveryGate?.requiredAckNodeIds ??
        [],
      acknowledgedNodeIds:
        membershipPublicationPlanningSnapshot.acknowledgedNodeIds ??
        providedPublicationRecoveryGate?.acknowledgedNodeIds ??
        [],
      pendingAckNodeIds:
        membershipPublicationPlanningSnapshot.pendingAckNodeIds ??
        providedPublicationRecoveryGate?.pendingAckNodeIds ??
        [],
      missingPublishedNodeIds:
        membershipPublicationPlanningSnapshot.missingPublishedNodeIds ??
        membershipPublicationPlanningSnapshot
          .missingPublishedRecoveryActiveNodeIds ??
        providedPublicationRecoveryGate?.missingPublishedNodeIds ??
        [],
    });
    return publicationRecoveryGate.active === true;
  }

  /**
   * Bound recovery-only grace to nodes that still present live transport and
   * active control-plane service evidence, even if lifecycle or lease rows lag.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  shouldAllowTransportBackedRecoveryGrace(context = {}) {
    const nodeEvidence =
      context.nodeEvidence && typeof context.nodeEvidence === TYPEOF.OBJECT
        ? context.nodeEvidence
        : null;
    const serviceRows = Array.isArray(context.serviceRows)
      ? context.serviceRows
      : [];
    if (nodeEvidence?.transportConnected !== true) {
      return false;
    }
    return (
      this.hasRoutableService(serviceRows) &&
      this.hasRecoveryGraceControlPlaneService(serviceRows)
    );
  }

  resolveProvisioningEligibility(context = {}) {
    const state =
      context.processAlive !== true
        ? PROVISIONING_ELIGIBILITY_STATE.BLOCKED
        : context.repairEligible === true
          ? PROVISIONING_ELIGIBILITY_STATE.STEADY
          : context.controlPlaneRecoveryEligible === true &&
              this.isProvisioningConvergenceGraceActive(context)
            ? PROVISIONING_ELIGIBILITY_STATE.CONVERGENCE_GRACE
            : PROVISIONING_ELIGIBILITY_STATE.BLOCKED;
    return Object.freeze({
      state,
      eligible: state !== PROVISIONING_ELIGIBILITY_STATE.BLOCKED,
    });
  }

  isProvisioningConvergenceGraceActive(context = {}) {
    if (context.priorityRecoveryActive === true) {
      return true;
    }
    return context.controlPlanePublished !== true;
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
    if (
      currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY &&
      publication?.reasonCode === PUBLICATION_REASON_CONFIG_SAFE_MODE
    ) {
      return true;
    }
    return false;
  }

  isControlPlanePublished(membershipPublication) {
    if (
      !membershipPublication ||
      typeof membershipPublication !== TYPEOF.OBJECT
    ) {
      return true;
    }
    return (
      String(membershipPublication.status || "").toUpperCase() ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    );
  }

  /**
   * Build structured reasons for non-ready dimensions.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
}

export { ControlPlaneReadinessServiceSegment2 };
