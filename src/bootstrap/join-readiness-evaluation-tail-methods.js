import {
  normalizeJoinSchemaVersion,
  compareJoinSchemaVersions,
} from './join-schema-version-resolver.js';
import {
  JOIN_READINESS_REASON,
  JOINING_LOG_MSG,
} from './node-joining-constants.js';
import {
  evaluateJoinPromotionState,
} from './join-promotion-state-owner.js';

function createJoinReadinessEvaluationTailMethods(options = {}) {
  const joinReadinessReasonPrecedence =
    options.joinReadinessReasonPrecedence || [];
  const canonicalJoinReadinessLogIntervalMs =
    options.canonicalJoinReadinessLogIntervalMs || 0;

  return {
    /**
     * Resolve node IDs required for join-readiness diagnostics.
     * @param {Object|null} systemTableCache
     * @return {Array<string>}
     */
    resolveJoinReadinessRequiredNodeIds(systemTableCache) {
      const nodeIds = [...new Set(
        this.getCanonicalJoinActiveNodeIds(systemTableCache),
      )];

      if (!nodeIds.includes(this.nodeId)) {
        nodeIds.push(this.nodeId);
      }
      return nodeIds;
    },

    /**
     * Evaluate one canonical join-readiness snapshot.
     * @param {Object} snapshot
     * @return {Object}
     */
    evaluateCanonicalJoinReadinessSnapshot(snapshot) {
      const normalized =
        this.normalizeCanonicalJoinReadinessSnapshot(snapshot);
      const promotion = evaluateJoinPromotionState({
        systemCacheHydrated:
          this.delegates.getSystemCacheHydrated?.() === true,
        startupMode:
          this.delegates.getJoinStartupMode?.() || null,
        restoreState:
          this.delegates.getDurableRejoinRestoreState?.() || null,
        routingReady: normalized.routingReady,
        topologyReady: normalized.topologyReady,
        requiredSchemaVersion: normalized.requiredSchemaVersion,
        appliedSchemaVersion: normalized.appliedSchemaVersion,
        inFlightReplicaOperations: normalized.inFlightReplicaOperations,
        lifecycleState:
          this.delegates.getLifecycleState?.() || null,
      });
      const reasons =
        this.classifyCanonicalJoinReadinessReasons(normalized);
      return {
        ...normalized,
        promotionState: promotion.state,
        promotionRestoreState: promotion.restoreState,
        promotionReasons: promotion.reasons,
        reasons,
        ready:
          reasons.length === 0 &&
          promotion.readyToPromote === true,
      };
    },

    /**
     * Classify canonical join-readiness reasons with stable precedence.
     * @param {Object} snapshot
     * @return {Array<string>}
     */
    classifyCanonicalJoinReadinessReasons(snapshot) {
      const reasons = [];
      if (snapshot?.routingReady !== true) {
        reasons.push(JOIN_READINESS_REASON.ROUTING_NOT_READY);
      }

      const requiredVersion = normalizeJoinSchemaVersion(
        snapshot?.requiredSchemaVersion,
      );
      const appliedVersion = normalizeJoinSchemaVersion(
        snapshot?.appliedSchemaVersion,
      );
      if (!requiredVersion || !appliedVersion) {
        reasons.push(JOIN_READINESS_REASON.SCHEMA_VERSION_UNKNOWN);
      } else if (compareJoinSchemaVersions(
        appliedVersion,
        requiredVersion,
      ) < 0) {
        reasons.push(JOIN_READINESS_REASON.SCHEMA_VERSION_LAG);
      }

      if (snapshot?.topologyReady !== true) {
        reasons.push(JOIN_READINESS_REASON.TOPOLOGY_NOT_READY);
      }

      return reasons.sort((left, right) => {
        const leftRank = this.getJoinReadinessReasonRank(left);
        const rightRank = this.getJoinReadinessReasonRank(right);
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return String(left).localeCompare(String(right));
      });
    },

    /**
     * Normalize one canonical join-readiness snapshot.
     * @param {Object} snapshot
     * @return {Object}
     */
    normalizeCanonicalJoinReadinessSnapshot(snapshot) {
      const source = snapshot && typeof snapshot === 'object' ?
        snapshot :
        {};
      const requiredVersion = normalizeJoinSchemaVersion(
        source.requiredSchemaVersion,
      );
      const appliedVersion = normalizeJoinSchemaVersion(
        source.appliedSchemaVersion,
      );
      const requiredNodeIds = Array.isArray(source.requiredNodeIds) ?
        source.requiredNodeIds.filter((value) =>
          typeof value === 'string' && value.length > 0,
        ) :
        [this.nodeId];

      return {
        nodeId: source.nodeId || this.nodeId,
        tableName:
          source.tableName || this.resolveJoinReadinessTableName(),
        routingReady: source.routingReady === true,
        topologyReady: source.topologyReady === true,
        requiredSchemaVersion: requiredVersion,
        appliedSchemaVersion: appliedVersion,
        requiredNodeIds,
        topologySnapshotEpoch:
          Number.isFinite(source.topologySnapshotEpoch) ?
            Math.max(0, Math.floor(source.topologySnapshotEpoch)) :
            null,
        appliedTopologyEpoch:
          Number.isFinite(source.appliedTopologyEpoch) ?
            Math.max(0, Math.floor(source.appliedTopologyEpoch)) :
            null,
        missingLeaders:
          source.missingLeaders &&
          typeof source.missingLeaders === 'object' ?
            source.missingLeaders :
            null,
        inFlightReplicaOperations:
          Number.isFinite(source.inFlightReplicaOperations) ?
            Math.max(
              0,
              Math.floor(source.inFlightReplicaOperations),
            ) :
            0,
        inFlightReplicaOperationDetails:
          Array.isArray(source.inFlightReplicaOperationDetails) ?
            source.inFlightReplicaOperationDetails :
            [],
        excludedSelfTargetedCount:
          Number.isFinite(source.excludedSelfTargetedCount) ?
            Math.max(
              0,
              Math.floor(source.excludedSelfTargetedCount),
            ) :
            0,
        excludedWarmingTargetCount:
          Number.isFinite(source.excludedWarmingTargetCount) ?
            Math.max(
              0,
              Math.floor(source.excludedWarmingTargetCount),
            ) :
            0,
        excludedNonDiscoveryPartitionCount:
          Number.isFinite(source.excludedNonDiscoveryPartitionCount) ?
            Math.max(
              0,
              Math.floor(source.excludedNonDiscoveryPartitionCount),
            ) :
            0,
        excludedRemotePriorityControlPlaneCount:
          Number.isFinite(source.excludedRemotePriorityControlPlaneCount) ?
            Math.max(
              0,
              Math.floor(source.excludedRemotePriorityControlPlaneCount),
            ) :
            0,
        excludedRemotePriorityControlPlaneOperationDetails:
          Array.isArray(
            source.excludedRemotePriorityControlPlaneOperationDetails,
          ) ?
            source.excludedRemotePriorityControlPlaneOperationDetails :
            [],
        excludedSelfSourcePriorityControlPlaneCount:
          Number.isFinite(
            source.excludedSelfSourcePriorityControlPlaneCount,
          ) ?
            Math.max(
              0,
              Math.floor(
                source.excludedSelfSourcePriorityControlPlaneCount,
              ),
            ) :
            0,
        excludedSelfSourcePriorityControlPlaneOperationDetails:
          Array.isArray(
            source.excludedSelfSourcePriorityControlPlaneOperationDetails,
          ) ?
            source.excludedSelfSourcePriorityControlPlaneOperationDetails :
            [],
        missingNodeEndpointNodeIds:
          Array.isArray(source.missingNodeEndpointNodeIds) ?
            source.missingNodeEndpointNodeIds.filter((value) =>
              typeof value === 'string' &&
              value.length > 0,
            ) :
            [],
        missingPostgresWireNodeIds:
          Array.isArray(source.missingPostgresWireNodeIds) ?
            source.missingPostgresWireNodeIds.filter((value) =>
              typeof value === 'string' &&
              value.length > 0,
            ) :
            [],
        controlPlaneTargetAddress:
          typeof source.controlPlaneTargetAddress === 'string' &&
          source.controlPlaneTargetAddress.length > 0 ?
            source.controlPlaneTargetAddress :
            null,
        controlPlaneTargetCandidates:
          Array.isArray(source.controlPlaneTargetCandidates) ?
            source.controlPlaneTargetCandidates.filter((value) =>
              typeof value === 'string' &&
              value.length > 0,
            ) :
            [],
        controlPlaneTargetConnectionStates:
          source.controlPlaneTargetConnectionStates &&
          typeof source.controlPlaneTargetConnectionStates === 'object' ?
            source.controlPlaneTargetConnectionStates :
            null,
        observedSchemaByNodeId:
          source.observedSchemaByNodeId &&
          typeof source.observedSchemaByNodeId === 'object' ?
            source.observedSchemaByNodeId :
            null,
        snapshotRevision:
          Number.isFinite(source.snapshotRevision) ?
            Math.max(0, Math.floor(source.snapshotRevision)) :
            null,
        snapshotRevisionSource:
          typeof source.snapshotRevisionSource === 'string' &&
          source.snapshotRevisionSource.length > 0 ?
            source.snapshotRevisionSource :
            null,
        snapshotRevisionState:
          typeof source.snapshotRevisionState === 'string' &&
          source.snapshotRevisionState.length > 0 ?
            source.snapshotRevisionState :
            null,
        snapshotExpectedMinimumRevision:
          Number.isFinite(source.snapshotExpectedMinimumRevision) ?
            Math.max(
              0,
              Math.floor(source.snapshotExpectedMinimumRevision),
            ) :
            null,
        snapshotRevisionGap:
          Number.isFinite(source.snapshotRevisionGap) ?
            Math.max(0, Math.floor(source.snapshotRevisionGap)) :
            null,
        snapshotResumeToken:
          typeof source.snapshotResumeToken === 'string' &&
          source.snapshotResumeToken.length > 0 ?
            source.snapshotResumeToken :
            null,
        snapshotObservedAt:
          typeof source.snapshotObservedAt === 'string' &&
          source.snapshotObservedAt.length > 0 ?
            source.snapshotObservedAt :
            null,
        snapshotObservedAtMs:
          Number.isFinite(source.snapshotObservedAtMs) ?
            Math.max(0, Math.floor(source.snapshotObservedAtMs)) :
            null,
      };
    },

    /**
     * Build per-node schema diagnostics for join timeout reporting.
     * @param {Object} evaluation
     * @return {Object}
     */
    buildJoinSchemaDiagnosticsByNode(evaluation) {
      const requiredVersion =
        evaluation?.requiredSchemaVersion || null;
      const observedVersion =
        evaluation?.appliedSchemaVersion || null;
      const reasons = Array.isArray(evaluation?.reasons) ?
        evaluation.reasons :
        [];
      const requiredNodeIds =
        Array.isArray(evaluation?.requiredNodeIds) &&
        evaluation.requiredNodeIds.length > 0 ?
          evaluation.requiredNodeIds :
          [this.nodeId];
      const observedByNodeId =
        evaluation?.observedSchemaByNodeId &&
        typeof evaluation.observedSchemaByNodeId === 'object' ?
          evaluation.observedSchemaByNodeId :
          {};

      const diagnostics = {};
      for (const nodeId of requiredNodeIds) {
        diagnostics[nodeId] = {
          requiredSchemaVersion: requiredVersion,
          observedSchemaVersion:
            normalizeJoinSchemaVersion(observedByNodeId[nodeId]) ||
            observedVersion,
          unmetReasons: reasons,
        };
      }
      return diagnostics;
    },

    /**
     * Emit throttled diagnostics while canonical readiness remains blocked.
     * @param {Object|null} evaluation
     * @param {Object} options
     */
    logCanonicalJoinReadinessBlocked(evaluation, options = {}) {
      if (!evaluation || evaluation.ready === true) {
        return;
      }

      const nowMs = this.now();
      const force = options.force === true;
      if (
        !force &&
        this.lastCanonicalJoinBlockedLogAtMs > 0 &&
        nowMs - this.lastCanonicalJoinBlockedLogAtMs <
          canonicalJoinReadinessLogIntervalMs
      ) {
        return;
      }

      this.lastCanonicalJoinBlockedLogAtMs = nowMs;
      this.delegates.getLogger().warn(
        JOINING_LOG_MSG.CANONICAL_READINESS_BLOCKED,
        {
          nodeId: this.nodeId,
          attempts: Number.isFinite(options.attempts) ?
            options.attempts :
            null,
          elapsedMs: Number.isFinite(options.elapsedMs) ?
            options.elapsedMs :
            null,
          reasons: evaluation.reasons,
          routingReady: evaluation.routingReady,
          topologyReady: evaluation.topologyReady,
          requiredSchemaVersion: evaluation.requiredSchemaVersion,
          appliedSchemaVersion: evaluation.appliedSchemaVersion,
          missingLeaders: evaluation.missingLeaders,
          inFlightReplicaOperations:
            evaluation.inFlightReplicaOperations,
          inFlightReplicaOperationDetails:
            evaluation.inFlightReplicaOperationDetails,
          excludedSelfTargetedCount:
            evaluation.excludedSelfTargetedCount,
          excludedWarmingTargetCount:
            evaluation.excludedWarmingTargetCount,
          excludedNonDiscoveryPartitionCount:
            evaluation.excludedNonDiscoveryPartitionCount,
          excludedRemotePriorityControlPlaneCount:
            evaluation.excludedRemotePriorityControlPlaneCount,
          excludedRemotePriorityControlPlaneOperationDetails:
            evaluation.excludedRemotePriorityControlPlaneOperationDetails,
          excludedSelfSourcePriorityControlPlaneCount:
            evaluation.excludedSelfSourcePriorityControlPlaneCount,
          excludedSelfSourcePriorityControlPlaneOperationDetails:
            evaluation.excludedSelfSourcePriorityControlPlaneOperationDetails,
          missingNodeEndpointNodeIds:
            evaluation.missingNodeEndpointNodeIds,
          missingPostgresWireNodeIds:
            evaluation.missingPostgresWireNodeIds,
          controlPlaneTargetAddress:
            evaluation.controlPlaneTargetAddress,
          controlPlaneTargetCandidates:
            evaluation.controlPlaneTargetCandidates,
          controlPlaneTargetConnectionStates:
            evaluation.controlPlaneTargetConnectionStates,
          topologySnapshotEpoch:
            evaluation.topologySnapshotEpoch,
          appliedTopologyEpoch:
            evaluation.appliedTopologyEpoch,
          promotionState:
            evaluation.promotionState,
          promotionReasons:
            evaluation.promotionReasons,
          snapshotRevision:
            evaluation.snapshotRevision,
          snapshotRevisionState:
            evaluation.snapshotRevisionState,
          snapshotExpectedMinimumRevision:
            evaluation.snapshotExpectedMinimumRevision,
          snapshotRevisionGap:
            evaluation.snapshotRevisionGap,
          snapshotResumeToken:
            evaluation.snapshotResumeToken,
          snapshotError: options.snapshotError?.message || null,
        },
      );
    },

    recordObservedSnapshotRevisionMetadata(revisionMetadata = null) {
      const revision =
        Number.isFinite(revisionMetadata?.revision) ?
          Math.max(0, Math.floor(revisionMetadata.revision)) :
          null;
      if (revision === null) {
        return;
      }
      if (
        this.highestObservedSnapshotRevision !== null &&
        revision < this.highestObservedSnapshotRevision
      ) {
        return;
      }
      this.highestObservedSnapshotRevision = revision;
      this.highestObservedSnapshotResumeToken =
        typeof revisionMetadata?.resumeToken === 'string' &&
        revisionMetadata.resumeToken.length > 0 ?
          revisionMetadata.resumeToken :
          null;
    },

    recordObservedSnapshotFromSnapshot(snapshot = null) {
      if (!snapshot || typeof snapshot !== 'object') {
        return;
      }
      this.recordObservedSnapshotRevisionMetadata({
        revision: snapshot.snapshotRevision,
        resumeToken: snapshot.snapshotResumeToken,
      });
    },

    /**
     * Resolve the published bootstrap topology snapshot metadata.
     * @return {Object|null}
     */
    resolveBootstrapTopologySnapshotMeta() {
      const delegateMeta =
        this.delegates.getBootstrapTopologySnapshotMeta?.();
      if (delegateMeta && typeof delegateMeta === 'object') {
        return delegateMeta;
      }

      const bootstrapResponse = this.delegates.getBootstrapResponse?.();
      const responseMeta = bootstrapResponse?.topologySnapshotMeta;
      return responseMeta && typeof responseMeta === 'object' ?
        responseMeta :
        null;
    },

    /**
     * Resolve active node IDs published with the bootstrap topology snapshot.
     * @return {Array<string>}
     */
    resolveBootstrapTopologySnapshotActiveNodeIds() {
      const topologySnapshotMeta =
        this.resolveBootstrapTopologySnapshotMeta();
      if (!Array.isArray(topologySnapshotMeta?.activeNodeIds)) {
        return [];
      }

      return [...new Set(topologySnapshotMeta.activeNodeIds.filter((value) =>
        typeof value === 'string' && value.length > 0,
      ))];
    },

    /**
     * Resolve the published bootstrap topology epoch.
     * @return {number|null}
     */
    resolveBootstrapTopologySnapshotEpoch() {
      const delegatedEpoch =
        this.delegates.getBootstrapTopologySnapshotEpoch?.();
      if (Number.isFinite(delegatedEpoch)) {
        return Math.max(0, Math.floor(delegatedEpoch));
      }
      const topologySnapshotMeta =
        this.resolveBootstrapTopologySnapshotMeta();
      if (Number.isFinite(topologySnapshotMeta?.topologyEpoch)) {
        return Math.max(
          0,
          Math.floor(topologySnapshotMeta.topologyEpoch),
        );
      }

      const bootstrapResponse = this.delegates.getBootstrapResponse?.();
      if (Number.isFinite(bootstrapResponse?.currentEpoch?.epoch)) {
        return Math.max(
          0,
          Math.floor(bootstrapResponse.currentEpoch.epoch),
        );
      }
      return null;
    },

    /**
     * Resolve the locally applied topology epoch watermark.
     * @param {Object|null} systemTableCache
     * @return {number}
     */
    resolveAppliedTopologyEpoch(systemTableCache) {
      if (typeof systemTableCache?.getEpoch === 'function') {
        const cacheEpoch = systemTableCache.getEpoch();
        if (Number.isFinite(cacheEpoch)) {
          return Math.max(0, Math.floor(cacheEpoch));
        }
      }
      return 0;
    },

    /**
     * Determine whether the local cache has applied the bootstrap topology
     * epoch.
     * @param {Object} options
     * @return {boolean}
     */
    isBootstrapTopologyEpochSatisfied(options = {}) {
      if (!Number.isFinite(options.topologySnapshotEpoch)) {
        return true;
      }
      return Number.isFinite(options.appliedTopologyEpoch) &&
        options.appliedTopologyEpoch >= options.topologySnapshotEpoch;
    },

    /**
     * Rank one join-readiness reason according to stable precedence.
     * @param {string} reason
     * @return {number}
     */
    getJoinReadinessReasonRank(reason) {
      const index = joinReadinessReasonPrecedence.indexOf(reason);
      return index >= 0 ?
        index :
        joinReadinessReasonPrecedence.length;
    },
  };
}

export {createJoinReadinessEvaluationTailMethods};
