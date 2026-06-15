import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';

const {
  COLUMN,
  MISSING_NODE_READINESS_STATE,
  NUM,
  TABLES,
  TYPEOF,
  normalizeIsoTimestamp,
  normalizePositiveInteger,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const controlPlaneReadinessNodeMethods = {
  /**
   * Build readiness for every known node.
   * @return {Promise<Object[]>}
   */
  async getAllNodeReadiness(options = {}) {
    const nodeRows = await this.readNodeRows(options);
    const serviceRows = await this.readAllNodeServiceRows(options);
    const bulkNodeRowsAreAuthoritative =
      options.allowAuthoritativeRefresh === true &&
      this.nodesOwner &&
      typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION;
    const bulkServiceRowsAreAuthoritative =
      options.allowAuthoritativeRefresh === true &&
      this.servicesOwner &&
      typeof this.servicesOwner.listServices === TYPEOF.FUNCTION;
    const nodeIds = new Set();
    for (const nodeRow of nodeRows) {
      const nodeId = nodeRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    if (
      serviceRows.length > NUM.ZERO ||
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION
    ) {
      const nodeEndpointRows =
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [];
      for (const serviceRow of serviceRows) {
        const nodeId = serviceRow?.[COLUMN.NODE_ID] || null;
        if (nodeId) {
          nodeIds.add(nodeId);
        }
      }
      for (const endpointRow of nodeEndpointRows) {
        const nodeId = endpointRow?.[COLUMN.NODE_ID] || null;
        if (nodeId) {
          nodeIds.add(nodeId);
        }
      }
    }
    for (const nodeId of this.lastReadinessSnapshotByNodeId.keys()) {
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    const readiness = [];

    for (const nodeId of [...nodeIds].sort()) {
      readiness.push(
        await this.getNodeReadiness(nodeId, {
          ...options,
          allNodeRows: bulkNodeRowsAreAuthoritative ? nodeRows : null,
          allServiceRows: bulkServiceRowsAreAuthoritative ? serviceRows : null,
        }),
      );
    }

    return readiness;
  },

  getAllNodeReadinessSync(options = {}) {
    const nodeRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.NODES) || [] :
        [];
    const serviceRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.SERVICES) || [] :
        [];
    const nodeEndpointRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [] :
        [];
    const nodeIds = new Set();
    for (const nodeRow of nodeRows) {
      const nodeId = nodeRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    for (const serviceRow of serviceRows) {
      const nodeId = serviceRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    for (const endpointRow of nodeEndpointRows) {
      const nodeId = endpointRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    for (const nodeId of this.lastReadinessSnapshotByNodeId.keys()) {
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    const maxCachedAgeMs = normalizePositiveInteger(
      options.maxCachedAgeMs,
      this.clusterMemberStaleHeartbeatMaxAgeMs,
    );
    const readiness = [];
    for (const nodeId of [...nodeIds].sort()) {
      const cachedSnapshot = this.getCachedReadinessSnapshot(
        nodeId,
        maxCachedAgeMs,
        {
          ...options,
          allowStaleOnCacheChange: true,
        },
      );
      if (cachedSnapshot) {
        readiness.push(cachedSnapshot);
        continue;
      }
      const storedSnapshot = this.getFresherStoredReadinessSnapshot(
        nodeId,
        this.getNodeRow(nodeId),
        null,
        null,
      );
      if (storedSnapshot) {
        readiness.push(storedSnapshot);
      }
    }
    return readiness;
  },

  /**
   * Build readiness for one node.
   * @readModel READINESS_NODE_STATE - READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_SERVICE_STATE - READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_CAPACITY - READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
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
      if (
        this.shouldPreferBackgroundRefreshOnIneligible(cachedSnapshot, options)
      ) {
        this.maybeStartBackgroundReadinessRefresh(nodeId, options);
        return cachedSnapshot;
      }
      if (this.shouldBypassCachedSnapshot(cachedSnapshot, options)) {
        // Fall through to a fresh owner-path evaluation when cached readiness
        // is currently ineligible for the requested decision.
      } else if (
        options.allowStaleOnCacheChange === true &&
        snapshotInvalidated
      ) {
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
  },

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
    const buildStartedAtMs = this.now();
    const observedAt = normalizeIsoTimestamp(buildStartedAtMs);
    const publication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication =
      await this.getMembershipPublicationDiagnostics(nodeId, observedAt);
    const persistSnapshot = this.shouldPersistReadinessSnapshot(options);
    const membershipPublicationPlanningSnapshot =
      await this.resolveNodeMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
        options,
      );
    let nodeRow = await this.readNodeRow(nodeId, options);
    let serviceRows = await this.readNodeServiceRows(nodeId, options);

    if (options.allowAuthoritativeRefresh === true) {
      const repaired =
        await this.authoritativeNodeEvidenceReconciler.maybeRepairNodeEvidence(
          {
            nodeId,
            nodeRow,
            serviceRows,
          },
          options,
        );
      if (repaired) {
        nodeRow = await this.readNodeRow(nodeId, options);
        serviceRows = await this.readNodeServiceRows(nodeId, options);
      }
    }

    const lifecycleState = nodeRow ?
      this.getLifecycleState(nodeId, nodeRow) :
      this.getLifecycleState(nodeId, null);
    const nodeEvidence = nodeRow ?
      this.buildNodeEvidence(nodeId, nodeRow) :
      this.buildMissingSelfNodeEvidence(nodeId);
    const missingNodeReadiness = nodeRow ?
      null :
      this.resolveMissingNodeReadinessState({
        nodeId,
        lifecycleState,
        serviceRows,
      });

    if (!nodeRow) {
      if (
        missingNodeReadiness?.state ===
        MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE
      ) {
        const capacity = await this.getCapacitySnapshot(nodeId, nodeRow);
        return this.buildEvaluatedNodeReadinessSnapshot({
          nodeId,
          nodeRow,
          nodeEvidence,
          lifecycleState,
          serviceRows,
          capacity,
          publication,
          membershipPublication,
          membershipPublicationPlanningSnapshot,
          missingNodeReadinessState: missingNodeReadiness.state,
          persistSnapshot,
          observedAt,
          buildStartedAtMs,
        });
      }
      const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(
        nodeId,
        null,
        publication,
        membershipPublication,
      );
      if (fresherStoredSnapshot) {
        return fresherStoredSnapshot;
      }
      const missingReadiness = this.buildMissingNodeReadiness(
        nodeId,
        observedAt,
        publication,
        membershipPublication,
      );
      const recentTransitions = persistSnapshot ?
        this.recordReadinessTransition({
          nodeId,
          observedAt,
          publication,
          membershipPublication,
          nodeEvidence: null,
          dimensions: missingReadiness.dimensions,
          reasons: missingReadiness.reasons,
          runtimeAuthority: missingReadiness.runtimeAuthority,
          priorityControlPlaneRecovery:
              missingReadiness.priorityControlPlaneRecovery,
        }) :
        this.getReadinessTransitionHistory(nodeId);
      const snapshot = Object.freeze({
        ...missingReadiness,
        recentTransitions,
      });
      if (persistSnapshot) {
        this.storeReadinessSnapshot(nodeId, snapshot, buildStartedAtMs);
      }
      return snapshot;
    }

    const capacity = await this.getCapacitySnapshot(nodeId, nodeRow);
    return this.buildEvaluatedNodeReadinessSnapshot({
      nodeId,
      nodeRow,
      nodeEvidence,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      membershipPublication,
      membershipPublicationPlanningSnapshot,
      persistSnapshot,
      observedAt,
      buildStartedAtMs,
    });
  },

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
    const buildStartedAtMs = this.now();
    const observedAt = normalizeIsoTimestamp(buildStartedAtMs);
    const nodeRow = this.getNodeRow(nodeId);
    const publication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
    );
    const persistSnapshot = this.shouldPersistReadinessSnapshot(options);

    // CL-012: consult the stored-snapshot reuse BEFORE the heavy evidence
    // prelude. This is the query-routing hot path (a routing snapshot
    // evaluates every service row of a partition, and routing snapshots are
    // built per query, per ingress admission, and per mutation-readiness
    // check); the planning-snapshot resolution, service-row scan, lifecycle
    // and evidence builds below are only needed when a fresh snapshot is
    // NOT reusable. serviceRows is provided lazily because the background
    // refresh consumes it only on its doubly-gated repair path.
    const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(
      nodeId,
      nodeRow,
      publication,
      membershipPublication,
    );

    if (fresherStoredSnapshot) {
      const readinessService = this;
      this.maybeStartBackgroundSyncReadinessRefresh(
        {
          nodeId,
          nodeRow,
          get serviceRows() {
            return readinessService.getNodeServiceRows(nodeId);
          },
          snapshot: fresherStoredSnapshot,
        },
        options,
      );
      return fresherStoredSnapshot;
    }

    // WS4 (bound the readiness build): the strict reuse above missed, so a fresh
    // build is due. Under recovery churn that miss recurs every routing call and the
    // heavy build below can monopolize the event loop long enough to lose raft
    // leadership. When this node's last full build was expensive and a stored
    // snapshot is still within the bounded-stale window, serve it synchronously and
    // refresh in the background instead of rebuilding now. Default-off kill switch.
    if (this.readinessBuildBoundEnabled === true) {
      const boundedStaleSnapshot = this.getBoundedStaleReadinessSnapshot(
        nodeId,
        buildStartedAtMs,
        {
          sliceMs: this.readinessBuildSliceMs,
          maxStaleMs: this.readinessBuildMaxStaleMs,
        },
      );
      if (boundedStaleSnapshot) {
        const readinessService = this;
        this.maybeStartBackgroundSyncReadinessRefresh(
          {
            nodeId,
            nodeRow,
            get serviceRows() {
              return readinessService.getNodeServiceRows(nodeId);
            },
            snapshot: boundedStaleSnapshot,
          },
          options,
        );
        return boundedStaleSnapshot;
      }
    }

    const membershipPublicationPlanningSnapshot =
      this.resolveNodeMembershipPublicationPlanningAnswerSync(
        nodeId,
        observedAt,
        membershipPublication,
        options,
      );
    const serviceRows = this.getNodeServiceRows(nodeId);
    const lifecycleState = nodeRow ?
      this.getLifecycleState(nodeId, nodeRow) :
      this.getLifecycleState(nodeId, null);
    const nodeEvidence = nodeRow ?
      this.buildNodeEvidence(nodeId, nodeRow) :
      this.buildMissingSelfNodeEvidence(nodeId);
    const missingNodeReadiness = nodeRow ?
      null :
      this.resolveMissingNodeReadinessState({
        nodeId,
        lifecycleState,
        serviceRows,
      });

    if (!nodeRow) {
      if (
        missingNodeReadiness?.state ===
        MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE
      ) {
        const capacity = this.getCapacitySnapshotSync(nodeId, nodeRow);
        return this.buildEvaluatedNodeReadinessSnapshot({
          nodeId,
          nodeRow,
          nodeEvidence,
          lifecycleState,
          serviceRows,
          capacity,
          publication,
          membershipPublication,
          membershipPublicationPlanningSnapshot,
          missingNodeReadinessState: missingNodeReadiness.state,
          persistSnapshot,
          observedAt,
          buildStartedAtMs,
        });
      }
      const missingReadiness = this.buildMissingNodeReadiness(
        nodeId,
        observedAt,
        publication,
        membershipPublication,
      );
      const recentTransitions = persistSnapshot ?
        this.recordReadinessTransition({
          nodeId,
          observedAt,
          publication,
          membershipPublication,
          nodeEvidence: null,
          dimensions: missingReadiness.dimensions,
          reasons: missingReadiness.reasons,
          runtimeAuthority: missingReadiness.runtimeAuthority,
          priorityControlPlaneRecovery:
              missingReadiness.priorityControlPlaneRecovery,
        }) :
        this.getReadinessTransitionHistory(nodeId);
      const snapshot = Object.freeze({
        ...missingReadiness,
        recentTransitions,
      });
      if (persistSnapshot) {
        this.storeReadinessSnapshot(nodeId, snapshot, buildStartedAtMs);
      }
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

    const capacity = this.getCapacitySnapshotSync(nodeId, nodeRow);
    const snapshot = this.buildEvaluatedNodeReadinessSnapshot({
      nodeId,
      nodeRow,
      nodeEvidence,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      membershipPublication,
      membershipPublicationPlanningSnapshot,
      persistSnapshot,
      observedAt,
      buildStartedAtMs,
    });
    // WS4: record how long this full synchronous build took so a subsequent
    // hot-path call can serve bounded-stale instead of rebuilding (see
    // getBoundedStaleReadinessSnapshot). Always recorded (cheap, flag-independent).
    this.recordReadinessBuildDurationMs(nodeId, this.now() - buildStartedAtMs);
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
  },
};

function installControlPlaneReadinessNodeMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(controlPlaneReadinessNodeMethods).map(([name, value]) => [
        name,
        {
          configurable: true,
          value,
          writable: true,
        },
      ]),
    ),
  );
}

export {installControlPlaneReadinessNodeMethods};
