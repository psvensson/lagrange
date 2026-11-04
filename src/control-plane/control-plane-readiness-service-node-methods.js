import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {buildNodeTrustState} from './node-trust-state.js';
import {resolvePublishedActiveNodeIds} from
  './active-node-publication-snapshots.js';
import {NODE_LIVENESS_SEMANTIC_STATE} from
  './node-liveness-semantic-projection-owner.js';
import {readCurrentEndpointRows} from
  './owners/endpoint-incarnation-currentness.js';
const {
  COLUMN,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MISSING_NODE_READINESS_STATE,
  TABLES,
  normalizeIsoTimestamp,
  normalizePositiveInteger,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const TRUST_CACHE_STATE_KNOWN = 'known';
const TRUST_CACHE_STATE_UNKNOWN = 'unknown';
const TRUST_TRANSPORT_STATE_CONNECTED = 'connected';
const TRUST_ROW_STATUS_ACTIVE = 'active';
const TRUST_GRACE_KEY_FIELDS = Object.freeze([
  'lastHeartbeat',
  'readyLeaseExpiresAt',
  'rowConnectionState',
  'status',
]);

function readTrustCacheRows(service, tableName) {
  return typeof service.systemTableCache?.getAll === 'function' ?
    service.systemTableCache.getAll(tableName) || [] :
    [];
}

function readTrustCacheWatermark(service, tableName, methodName) {
  const method = service.systemTableCache?.[methodName];
  return typeof method === 'function' ?
    method.call(service.systemTableCache, tableName) :
    null;
}

function buildProvisioningCacheWatermark(service) {
  const watermark = {
    nodesVersion:
      readTrustCacheWatermark(service, TABLES.NODES, 'getAppliedSchemaVersion'),
    servicesVersion:
      readTrustCacheWatermark(
        service,
        TABLES.SERVICES,
        'getAppliedSchemaVersion',
      ),
    nodesAppliedAtMs:
      readTrustCacheWatermark(service, TABLES.NODES, 'getLastAppliedAtMs'),
    servicesAppliedAtMs:
      readTrustCacheWatermark(service, TABLES.SERVICES, 'getLastAppliedAtMs'),
  };
  const nodesKnown =
    watermark.nodesVersion !== null || watermark.nodesAppliedAtMs !== null;
  const servicesKnown =
    watermark.servicesVersion !== null ||
    watermark.servicesAppliedAtMs !== null;
  return Object.freeze({
    ...watermark,
    state: nodesKnown && servicesKnown ?
      TRUST_CACHE_STATE_KNOWN :
      TRUST_CACHE_STATE_UNKNOWN,
  });
}

function collectProvisioningTrustNodeIds(
  service,
  nodeRows,
  serviceRows,
  publishedActiveNodeIds,
) {
  return [...new Set([
    ...nodeRows.map((row) => row?.[COLUMN.NODE_ID]),
    ...serviceRows.map((row) => row?.[COLUMN.NODE_ID]),
    ...(publishedActiveNodeIds || []),
    service.nodeId,
  ].filter(Boolean))].sort();
}

function resolveProvisioningTrustTransportState(service, nodeId, readiness) {
  const observed = String(
    readiness?.nodeEvidence?.routerConnectionState || '',
  ).toLowerCase();
  if (observed) {
    return observed;
  }
  return nodeId === service.nodeId && readiness?.dimensions?.processAlive === true ?
    TRUST_TRANSPORT_STATE_CONNECTED :
    TRUST_CACHE_STATE_UNKNOWN;
}

function isProvisioningTrustHeartbeatStale(readiness) {
  return readiness?.nodeEvidence?.clusterMemberHeartbeatFreshness ===
    NODE_LIVENESS_SEMANTIC_STATE.STALE;
}

function isNodeInInstalledMembership(nodeId, publishedActiveNodeIds) {
  return publishedActiveNodeIds?.includes(nodeId) === true;
}

function normalizeOptionalTrustKeyValue(value) {
  return value === undefined ? null : value;
}

function buildProvisioningTrustGraceKey(context) {
  return Object.freeze({
    lastHeartbeat: normalizeOptionalTrustKeyValue(
      context.readiness?.nodeEvidence?.lastHeartbeat,
    ),
    readyLeaseExpiresAt: normalizeOptionalTrustKeyValue(
      context.readiness?.nodeEvidence?.readyLeaseExpiresAt,
    ),
    rowConnectionState: normalizeOptionalTrustKeyValue(
      context.readiness?.nodeEvidence?.rowConnectionState,
    ),
    status: normalizeOptionalTrustKeyValue(
      context.readiness?.nodeEvidence?.status,
    ),
  });
}

function areProvisioningTrustGraceKeysEqual(left, right) {
  if (!left || !right) {
    return false;
  }
  return TRUST_GRACE_KEY_FIELDS.every(
    (field) => left[field] === right[field],
  );
}

function resolveProvisioningTrustGrace(service, context) {
  const selfRuntimeGrace =
    context.readiness?.runtimeAuthority?.visibility?.state ===
      'retained_local_runtime';
  const graceEligible = [
    context.transportState === TRUST_TRANSPORT_STATE_CONNECTED,
    isNodeInInstalledMembership(
      context.nodeId,
      context.publishedActiveNodeIds,
    ),
    isProvisioningTrustHeartbeatStale(context.readiness) || selfRuntimeGrace,
  ].every(Boolean);
  if (!graceEligible) {
    service.provisioningTrustGraceByNodeId.delete(context.nodeId);
    return {selfRuntimeGrace, startedAtMs: null};
  }
  const graceKey = buildProvisioningTrustGraceKey(context);
  const existing = service.provisioningTrustGraceByNodeId.get(context.nodeId);
  const startedAtMs = areProvisioningTrustGraceKeysEqual(
    existing?.key,
    graceKey,
  ) ?
    existing.startedAtMs :
    context.capturedAtMs;
  service.provisioningTrustGraceByNodeId.set(
    context.nodeId,
    {key: graceKey, startedAtMs},
  );
  return {selfRuntimeGrace, startedAtMs};
}

function isActiveTrustRow(row, nodeId) {
  return row?.[COLUMN.NODE_ID] === nodeId &&
    String(row?.status || '').toLowerCase() === TRUST_ROW_STATUS_ACTIVE;
}

function buildProvisioningNodeTrustState(service, nodeId, context, options) {
  const snapshot = service.getNodeReadinessSync(nodeId, {
    ...options,
    membershipPublicationPlanningSource:
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
  });
  const readiness = snapshot ? {
    ...snapshot,
    membershipPublication: context.membershipPublication,
  } : {
    nodeId,
    membershipPublication: context.membershipPublication,
  };
  const transportState = resolveProvisioningTrustTransportState(
    service,
    nodeId,
    readiness,
  );
  const grace = resolveProvisioningTrustGrace(service, {
    ...context,
    nodeId,
    readiness,
    transportState,
  });
  const liveness = service.nodeLivenessSemanticProjectionOwner
    ?.recordProvisioningTrustGraceEvidence(nodeId, {
      eligible: grace.startedAtMs !== null,
      startedAtMs: grace.startedAtMs,
    }, context.capturedAtMs);
  return buildNodeTrustState(readiness, {
    observerNodeId: service.nodeId,
    capturedAtMs: context.capturedAtMs,
    publicationRows: context.publicationRows,
    cacheWatermark: context.cacheWatermark,
    transport: {
      state: transportState,
      observedAtMs:
        transportState === TRUST_CACHE_STATE_UNKNOWN ?
          null :
          context.capturedAtMs,
    },
    graceStartedAtMs: grace.startedAtMs,
    graceLimitMs: service.clusterMemberStaleHeartbeatMaxAgeMs,
    livenessProjection: liveness,
    selfRuntimeGrace: grace.selfRuntimeGrace,
    activeNodeRow: context.nodeRows.some(
      (row) => isActiveTrustRow(row, nodeId),
    ),
    activeServiceCount: context.serviceRows.filter(
      (row) => isActiveTrustRow(row, nodeId),
    ).length,
  });
}

function pruneProvisioningTrustGrace(service, nodeIds) {
  const currentNodeIds = new Set(nodeIds);
  for (const nodeId of service.provisioningTrustGraceByNodeId.keys()) {
    if (!currentNodeIds.has(nodeId)) {
      service.provisioningTrustGraceByNodeId.delete(nodeId);
    }
  }
}

function collectPublishedRequiredNodeIds(service, options = {}) {
  const publicationRows = readTrustCacheRows(
    service,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
  );
  const publishedActiveNodeIds =
    resolvePublishedActiveNodeIds({publicationRows}) || [];
  const explicitRequiredNodeIds = Array.isArray(options.requiredNodeIds) ?
    options.requiredNodeIds :
    [];
  return [
    ...publishedActiveNodeIds,
    ...explicitRequiredNodeIds,
    ...(service.nodeId ? [service.nodeId] : []),
  ].filter((nodeId) => typeof nodeId === 'string' && nodeId.length > 0);
}

function addRowNodeIdsToSet(nodeIds, rows = []) {
  for (const row of rows) {
    const nodeId = row?.[COLUMN.NODE_ID] || null;
    if (nodeId) {
      nodeIds.add(nodeId);
    }
  }
}

function collectCandidateReadinessNodeIds(
  service,
  nodeRows,
  serviceRows,
  options = {},
) {
  const nodeIds = new Set(collectPublishedRequiredNodeIds(service, options));
  addRowNodeIdsToSet(nodeIds, nodeRows);
  addRowNodeIdsToSet(nodeIds, serviceRows);
  const nodeEndpointRows =
    readCurrentEndpointRows(service.systemTableCache, TABLES.NODE_ENDPOINTS);
  addRowNodeIdsToSet(nodeIds, nodeEndpointRows);
  for (const nodeId of service.lastReadinessSnapshotByNodeId.keys()) {
    if (nodeId) {
      nodeIds.add(nodeId);
    }
  }
  return [...nodeIds].sort();
}

function hasAuthoritativeBulkRows(options, owner, methodName) {
  return Boolean(
    options.allowAuthoritativeRefresh === true &&
    owner &&
    typeof owner[methodName] === 'function',
  );
}

const controlPlaneReadinessNodeMethods = {
  /**
   * Build readiness for every known node.
   * @return {Promise<Object[]>}
   */
  async getAllNodeReadiness(options = {}) {
    const nodeRows = await this.readNodeRows(options);
    const serviceRows = await this.readAllNodeServiceRows(options);
    const allNodeRows = hasAuthoritativeBulkRows(
      options,
      this.nodesOwner,
      'listNodes',
    ) ?
      nodeRows :
      null;
    const allServiceRows = hasAuthoritativeBulkRows(
      options,
      this.servicesOwner,
      'listServices',
    ) ?
      serviceRows :
      null;
    const sortedNodeIds = collectCandidateReadinessNodeIds(
      this,
      nodeRows,
      serviceRows,
      options,
    );
    const readiness = [];
    for (const nodeId of sortedNodeIds) {
      readiness.push(
        await this.getNodeReadiness(nodeId, {
          ...options,
          allNodeRows,
          allServiceRows,
        }),
      );
    }
    return readiness;
  },

  getAllNodeReadinessSync(options = {}) {
    const getAllRows = (tableName) =>
      typeof this.systemTableCache?.getAll === 'function' ?
        this.systemTableCache.getAll(tableName) || [] :
        [];
    const nodeRows = getAllRows(TABLES.NODES);
    const serviceRows = getAllRows(TABLES.SERVICES);
    const sortedNodeIds = collectCandidateReadinessNodeIds(
      this,
      nodeRows,
      serviceRows,
      options,
    );
    const maxCachedAgeMs = normalizePositiveInteger(
      options.maxCachedAgeMs,
      this.clusterMemberStaleHeartbeatMaxAgeMs,
    );
    const readiness = [];
    for (const nodeId of sortedNodeIds) {
      const cachedSnapshot = this.getCachedReadinessSnapshot(
        nodeId,
        maxCachedAgeMs,
        options,
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
        continue;
      }
      const currentSnapshot = this.buildNodeReadinessSyncCurrent(
        nodeId,
        options,
      );
      if (currentSnapshot) {
        readiness.push(currentSnapshot);
      }
    }
    return readiness;
  },

  getProvisioningNodeTrustViewSync(options = {}) {
    const capturedAtMs = this.now();
    const observedAt = normalizeIsoTimestamp(capturedAtMs);
    const nodeRows = readTrustCacheRows(this, TABLES.NODES);
    const serviceRows = readTrustCacheRows(this, TABLES.SERVICES);
    const membershipPublication =
      this.getMembershipPublicationDiagnosticsSync(this.nodeId, observedAt);
    const publicationRows =
      readTrustCacheRows(this, TABLES.CONTROL_PLANE_PUBLICATIONS);
    // The published membership is the snapshot owner's read (a) over the
    // same inputs the trust state reads (node-trust-state.js).
    const publishedActiveNodeIds = resolvePublishedActiveNodeIds({
      publicationRows,
      latestPublicationRow: membershipPublication,
    });
    const cacheWatermark = buildProvisioningCacheWatermark(this);
    const nodeIds = collectProvisioningTrustNodeIds(
      this,
      nodeRows,
      serviceRows,
      publishedActiveNodeIds,
    );
    pruneProvisioningTrustGrace(this, nodeIds);
    const context = {
      capturedAtMs,
      cacheWatermark,
      membershipPublication,
      publicationRows,
      publishedActiveNodeIds,
      nodeRows,
      serviceRows,
    };
    return Object.freeze(
      nodeIds.map((nodeId) =>
        buildProvisioningNodeTrustState(this, nodeId, context, options),
      ),
    );
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

    const repaired =
      await this.authoritativeNodeEvidenceReconciler.maybeRepairNodeEvidence(
        {nodeId, nodeRow, serviceRows},
        options,
      );
    if (repaired) {
      nodeRow = await this.readNodeRow(nodeId, options);
      serviceRows = await this.readNodeServiceRows(nodeId, options);
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
          readinessPlanningOwnerBuild:
            options.readinessPlanningOwnerBuild === true,
          readinessPlanningColdBootstrapBuild:
            options.readinessPlanningColdBootstrapBuild === true,
        });
      }
      // Planning-owner and cold-bootstrap builds project the currently
      // visible source evidence (Quest 2 contract); the sealed CL-012 bridge
      // for query routing is applied by the planning owner at read time, for
      // routed reads only, and never re-stamps a record.
      const planningBuild = options.readinessPlanningOwnerBuild === true ||
        options.readinessPlanningColdBootstrapBuild === true;
      const fresherStoredSnapshot = planningBuild ? null :
        this.getFresherStoredReadinessSnapshot(
          nodeId,
          null,
          publication,
          membershipPublication,
        );
      if (fresherStoredSnapshot) {
        return fresherStoredSnapshot;
      }
      return this.buildAndStoreMissingNodeReadinessSnapshot({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        persistSnapshot,
        buildStartedAtMs,
        options,
      });
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
      readinessPlanningOwnerBuild:
        options.readinessPlanningOwnerBuild === true,
      readinessPlanningColdBootstrapBuild:
        options.readinessPlanningColdBootstrapBuild === true,
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
    if (
      options.readinessPlanningOwnerBuild === true ||
      !this.readinessPlanningSnapshotOwner
    ) {
      return this.buildNodeReadinessSyncCurrent(nodeId, options);
    }
    return this.readinessPlanningSnapshotOwner.readSync(
      nodeId,
      options,
      () => this.buildNodeReadinessSyncCurrent(nodeId, {
        ...options,
        readinessPlanningColdBootstrapBuild: true,
      }),
    );
  },

  /**
   * Build a synchronous snapshot from the currently visible production inputs.
   * The versioned planning owner is the only hot-path caller of this method.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Object|null}
   * @private
   */
  buildNodeReadinessSyncCurrent(nodeId, options = {}) {
    const buildStartedAtMs = this.now();
    const observedAt = normalizeIsoTimestamp(buildStartedAtMs);
    const nodeRow = this.getNodeRow(nodeId);
    const publication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
    );
    const persistSnapshot = this.shouldPersistReadinessSnapshot(options);

    // CL-012: reuse before the heavy query-routing evidence prelude. Keep
    // serviceRows lazy for the doubly-gated background repair path.
    const usesDirectPublicationPlanning =
      options.membershipPublicationPlanningSource ===
        MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW;
    const planningBuild = options.readinessPlanningOwnerBuild === true ||
      options.readinessPlanningColdBootstrapBuild === true;
    const fresherStoredSnapshot = !usesDirectPublicationPlanning &&
      !planningBuild ?
      this.getFresherStoredReadinessSnapshot(
        nodeId,
        nodeRow,
        publication,
        membershipPublication,
      ) :
      null;

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
          readinessPlanningOwnerBuild:
            options.readinessPlanningOwnerBuild === true,
          readinessPlanningColdBootstrapBuild:
            options.readinessPlanningColdBootstrapBuild === true,
        });
      }
      const snapshot = this.buildAndStoreMissingNodeReadinessSnapshot({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        persistSnapshot,
        buildStartedAtMs,
        options,
      });
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
      readinessPlanningOwnerBuild:
        options.readinessPlanningOwnerBuild === true,
      readinessPlanningColdBootstrapBuild:
        options.readinessPlanningColdBootstrapBuild === true,
    });
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
