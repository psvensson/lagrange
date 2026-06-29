import {ControlPlaneReadinessPriorityRecoveryPlanning} from './control-plane-readiness-priority-recovery-planning.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  NUM,
  TYPEOF,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
  normalizeDiagnosticTimestampMs,
} = SHARED;

class ControlPlaneReadinessPublicationPlanningSnapshot extends
  ControlPlaneReadinessPriorityRecoveryPlanning {
  hasMembershipPublicationRecoveryGateEvidence(planningSnapshot = null) {
    const priorityRecoveryProjection =
      this.buildPriorityRecoveryPlanningProjection(planningSnapshot);
    if (!priorityRecoveryProjection) {
      return false;
    }
    if (priorityRecoveryProjection.priorityRecoveryActive === true) {
      return true;
    }
    if (
      Array.isArray(priorityRecoveryProjection.priorityRecoveryReasonCodes) &&
      priorityRecoveryProjection.priorityRecoveryReasonCodes.length > NUM.ZERO
    ) {
      return true;
    }
    if (
      priorityRecoveryProjection.priorityPartitionSummary &&
      typeof priorityRecoveryProjection.priorityPartitionSummary === TYPEOF.OBJECT
    ) {
      return true;
    }
    return (
      typeof priorityRecoveryProjection.publicationStatus === TYPEOF.STRING &&
      priorityRecoveryProjection.publicationStatus.length > NUM.ZERO &&
      priorityRecoveryProjection.publicationStatus.toUpperCase() !==
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    );
  }

  buildRetainedPriorityRecoveryPlanningGate(
    planningSnapshot = null,
    retainedSnapshot = null,
  ) {
    if (!retainedSnapshot || typeof retainedSnapshot !== TYPEOF.OBJECT) {
      return this.getMembershipPublicationRecoveryGate(planningSnapshot);
    }
    const planningGate =
      this.getMembershipPublicationRecoveryGate(planningSnapshot);
    const retainedGate =
      this.getMembershipPublicationRecoveryGate(retainedSnapshot);
    const planningReasonCodes = Array.isArray(
      planningSnapshot?.priorityRecoveryReasonCodes,
    ) ?
      planningSnapshot.priorityRecoveryReasonCodes :
      planningGate?.reasonCodes || [];
    const retainedReasonCodes = Array.isArray(
      retainedSnapshot?.priorityRecoveryReasonCodes,
    ) ?
      retainedSnapshot.priorityRecoveryReasonCodes :
      retainedGate?.reasonCodes || [];
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT ?
        planningSnapshot.priorityPartitionSummary :
        retainedSnapshot?.priorityPartitionSummary &&
            typeof retainedSnapshot.priorityPartitionSummary === TYPEOF.OBJECT ?
          retainedSnapshot.priorityPartitionSummary :
          null;
    const recoveryProtocolState =
      typeof planningSnapshot?.recoveryProtocolState === TYPEOF.STRING &&
      planningSnapshot.recoveryProtocolState.length > NUM.ZERO ?
        planningSnapshot.recoveryProtocolState :
        typeof retainedSnapshot?.recoveryProtocolState === TYPEOF.STRING &&
            retainedSnapshot.recoveryProtocolState.length > NUM.ZERO ?
          retainedSnapshot.recoveryProtocolState :
          null;
    return buildPublicationRecoveryGateSnapshot({
      publicationEpoch: Number.isFinite(planningSnapshot?.publicationEpoch) ?
        planningSnapshot.publicationEpoch :
        Number.isFinite(retainedSnapshot?.publicationEpoch) ?
          retainedSnapshot.publicationEpoch :
          (planningGate?.publicationEpoch ?? retainedGate?.publicationEpoch),
      publicationStatus:
        typeof planningSnapshot?.publicationStatus === TYPEOF.STRING &&
        planningSnapshot.publicationStatus.length > NUM.ZERO ?
          planningSnapshot.publicationStatus :
          typeof planningSnapshot?.status === TYPEOF.STRING &&
              planningSnapshot.status.length > NUM.ZERO ?
            planningSnapshot.status :
            typeof retainedSnapshot?.publicationStatus === TYPEOF.STRING &&
                retainedSnapshot.publicationStatus.length > NUM.ZERO ?
              retainedSnapshot.publicationStatus :
              typeof retainedSnapshot?.status === TYPEOF.STRING &&
                  retainedSnapshot.status.length > NUM.ZERO ?
                retainedSnapshot.status :
                planningGate?.publicationStatus ||
                  retainedGate?.publicationStatus,
      publicationObservationState:
        typeof planningSnapshot?.publicationObservationState ===
          TYPEOF.STRING &&
        planningSnapshot.publicationObservationState.length > NUM.ZERO ?
          planningSnapshot.publicationObservationState :
          typeof retainedSnapshot?.publicationObservationState ===
                TYPEOF.STRING &&
              retainedSnapshot.publicationObservationState.length > NUM.ZERO ?
            retainedSnapshot.publicationObservationState :
            planningGate?.publicationObservationState ||
              retainedGate?.publicationObservationState,
      recoveryProtocolState,
      priorityPartitionSummary,
      requiredAckNodeIds:
        Array.isArray(planningSnapshot?.requiredAckNodeIds) ?
          planningSnapshot.requiredAckNodeIds :
          Array.isArray(retainedSnapshot?.requiredAckNodeIds) ?
            retainedSnapshot.requiredAckNodeIds :
            planningGate?.requiredAckNodeIds ||
              retainedGate?.requiredAckNodeIds,
      acknowledgedNodeIds:
        Array.isArray(planningSnapshot?.acknowledgedNodeIds) ?
          planningSnapshot.acknowledgedNodeIds :
          Array.isArray(retainedSnapshot?.acknowledgedNodeIds) ?
            retainedSnapshot.acknowledgedNodeIds :
            planningGate?.acknowledgedNodeIds ||
              retainedGate?.acknowledgedNodeIds,
      pendingAckNodeIds:
        Array.isArray(planningSnapshot?.pendingAckNodeIds) ?
          planningSnapshot.pendingAckNodeIds :
          Array.isArray(retainedSnapshot?.pendingAckNodeIds) ?
            retainedSnapshot.pendingAckNodeIds :
            planningGate?.pendingAckNodeIds ||
              retainedGate?.pendingAckNodeIds,
      pendingAckCount:
        planningSnapshot?.pendingAckCount ??
        retainedSnapshot?.pendingAckCount ??
        planningGate?.pendingAckCount ??
        retainedGate?.pendingAckCount ??
        NUM.ZERO,
      pendingAckEvidenceState: this.resolveRetainedPendingAckEvidenceState(
        planningSnapshot,
        retainedSnapshot,
        planningGate,
        retainedGate,
      ),
      reasonCodes: Object.freeze([
        ...new Set([...planningReasonCodes, ...retainedReasonCodes]),
      ]),
      missingPublishedNodeIds:
        Array.isArray(planningSnapshot?.missingPublishedNodeIds) ?
          planningSnapshot.missingPublishedNodeIds :
          Array.isArray(
            planningSnapshot?.missingPublishedRecoveryActiveNodeIds,
          ) ?
            planningSnapshot.missingPublishedRecoveryActiveNodeIds :
            Array.isArray(planningGate?.missingPublishedNodeIds) ?
              planningGate.missingPublishedNodeIds :
              Array.isArray(retainedSnapshot?.missingPublishedNodeIds) ?
                retainedSnapshot.missingPublishedNodeIds :
                Array.isArray(
                  retainedSnapshot?.missingPublishedRecoveryActiveNodeIds,
                ) ?
                  retainedSnapshot.missingPublishedRecoveryActiveNodeIds :
                  planningGate?.missingPublishedNodeIds ||
                    retainedGate?.missingPublishedNodeIds,
      publicationExcludesTargetNode:
        typeof planningSnapshot?.publicationExcludesTargetNode === TYPEOF.BOOLEAN ?
          planningSnapshot.publicationExcludesTargetNode :
          typeof planningGate?.publicationExcludesTargetNode === TYPEOF.BOOLEAN ?
            planningGate.publicationExcludesTargetNode :
            retainedSnapshot?.publicationExcludesTargetNode === true ||
            retainedGate?.publicationExcludesTargetNode === true,
    });
  }

  normalizeMembershipPublicationPlanningSnapshot(planningSnapshot = null) {
    return this.buildPriorityRecoveryPlanningProjection(planningSnapshot);
  }

  // CL-033: getNodeReadinessSync is the query-routing hot path (evaluated per
  // service row, per query, per ingress/mutation-readiness check). During
  // recovery the CL-012/CL-019 stored-snapshot fast path misses on every call
  // (publication/membership rows churn faster than its watermark-equality
  // reuse), so this priority-recovery planning projection — the deep cluster
  // read (getMembershipPublicationPlanningSnapshotSync over nodes/services/
  // partitions/publications) plus the parse/clone-heavy
  // buildPriorityRecoveryPlanningProjection — was rebuilt on every routing
  // call, amplifying into the seed event-loop freeze↔leadership-churn spiral.
  // The projection is a pure function of publication + node/service/partition
  // state for a given publisher node, so memoize it per publisher node and
  // reuse until the EXISTING readiness invalidation supersedes it: the same
  // isReadinessSnapshotInvalidated predicate the stored-snapshot fast path uses
  // (publication cluster marker OR this node's node/service change). The
  // per-node retain/active layers in getPriorityRecoveryPlanningAnswerSync stay
  // OUTSIDE this memo and run every call on the (shared, frozen) projection.
  // CL-033/CL-034 (regression repair): the wall-time stale-grace bound for the
  // readiness planning memos. observedAt on the sync readiness hot path is an ISO
  // STRING (getNodeReadinessSync: normalizeIsoTimestamp(now)), so the prior
  // `Number(observedAt)` form produced NaN and `NaN <= grace` is ALWAYS false —
  // silently disabling both memos in production (and turning their guard tests
  // red). Parse via normalizeDiagnosticTimestampMs (handles ISO strings, numeric
  // strings, and numbers); when either side is unparseable fall back to reuse and
  // rely on the strong guards (isReadinessSnapshotInvalidated + the epoch/status
  // freshness recheck) rather than a NaN comparison.
  isReadinessPlanningMemoWithinStaleGrace(observedAt, capturedAtMs) {
    const observedAtMs = normalizeDiagnosticTimestampMs(observedAt);
    const capturedMs = normalizeDiagnosticTimestampMs(capturedAtMs);
    if (observedAtMs === null || capturedMs === null) {
      return true;
    }
    return (
      (observedAtMs - capturedMs) <=
      this.membershipPublicationPlanningActiveStaleGraceMs
    );
  }

  // CL-033/CL-034: belt-and-suspenders freshness recheck shared by the readiness
  // planning memos — even within the marker-stable + grace window, reject a cached
  // projection whose publication epoch/status no longer matches the live publication
  // row (an ack/epoch/status advance normally also fires the cluster marker, but this
  // catches it directly). Returns true when the cached projection is stale.
  isMemoizedMembershipPublicationPlanningProjectionEpochStale(
    nodeId,
    cachedProjection,
  ) {
    const service = this.membershipPublicationService;
    if (!service) {
      return false;
    }
    // Prefer the cheap (epoch, status) probe that normalizes only the winning row
    // (saturation-relief: avoids the per-tick full-table re-normalize); fall back
    // to the full read for service stubs that predate the probe.
    let latestPub = null;
    if (
      typeof service.getLatestMembershipPublicationEpochStatusForNodeSync ===
      TYPEOF.FUNCTION
    ) {
      latestPub = service.getLatestMembershipPublicationEpochStatusForNodeSync(
        nodeId,
      );
    } else if (
      typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION
    ) {
      latestPub = service.getLatestPublicationForNodeSync(nodeId);
    } else {
      return false;
    }
    const latestEpoch = latestPub ?
      (latestPub.publicationEpoch ?? latestPub.publication_epoch) :
      null;
    const cachedEpoch = cachedProjection ?
      (cachedProjection.publicationEpoch ?? cachedProjection.publication_epoch) :
      null;
    const latestStatus = latestPub ? latestPub.status : null;
    const cachedStatus = cachedProjection ?
      (cachedProjection.publicationStatus ?? cachedProjection.status) :
      null;
    return latestEpoch !== cachedEpoch || latestStatus !== cachedStatus;
  }

  resolveMemoizedPriorityRecoveryPlanningProjectionSync(nodeId, observedAt) {
    const memoKey = nodeId || this.nodeId;
    const memo = this.priorityRecoveryPlanningProjectionMemoByNodeId;
    if (memo && memoKey) {
      const cached = memo.get(memoKey);
      if (
        cached &&
        cached.fn === this.getMembershipPublicationPlanningSnapshotSync &&
        !this.isReadinessSnapshotInvalidated(memoKey, cached.capturedAtMs) &&
        this.isReadinessPlanningMemoWithinStaleGrace(
          observedAt,
          cached.capturedAtMs,
        )
      ) {
        if (
          !this.isMemoizedMembershipPublicationPlanningProjectionEpochStale(
            memoKey,
            cached.projection,
          )
        ) {
          return cached.projection;
        }
      }
    }
    const capturedAtMs = this.now();
    const projection = this.buildPriorityRecoveryPlanningProjection(
      this.getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt),
    );
    if (memo && memoKey) {
      memo.set(memoKey, {
        projection,
        capturedAtMs,
        fn: this.getMembershipPublicationPlanningSnapshotSync,
      });
    }
    return projection;
  }

  getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt) {
    const planningSnapshot =
      this.resolveMemoizedPriorityRecoveryPlanningProjectionSync(
        nodeId,
        observedAt,
      );
    if (this.isPriorityControlPlaneRecoveryActive(planningSnapshot)) {
      this.storeActivePriorityRecoveryPlanningSnapshot(
        nodeId,
        planningSnapshot,
        observedAt,
      );
      return planningSnapshot;
    }
    const resolvedPlanningSnapshot = this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      planningSnapshot,
    );
    if (
      !this.isPriorityControlPlaneRecoveryActive(resolvedPlanningSnapshot) &&
      !this.shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(
        planningSnapshot,
        resolvedPlanningSnapshot,
      )
    ) {
      this.clearActivePriorityRecoveryPlanningSnapshot(nodeId);
    }
    return resolvedPlanningSnapshot;
  }

  async getMembershipPublicationPlanningSnapshotBestEffort(nodeId, observedAt) {
    const syncSnapshot = this.getMembershipPublicationPlanningAnswerSync(
      nodeId,
      observedAt,
    );
    const timeoutMs =
      this.membershipPublicationPlanningSnapshotRefreshTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= NUM.ZERO) {
      const asyncSnapshot = await this.getMembershipPublicationPlanningSnapshot(
        nodeId,
        observedAt,
      );
      return this.resolvePriorityRecoveryPlanningAnswer(
        nodeId,
        observedAt,
        asyncSnapshot || syncSnapshot,
      );
    }

    let timeoutHandle = null;
    try {
      const asyncSnapshot = await Promise.race([
        this.getMembershipPublicationPlanningSnapshot(nodeId, observedAt),
        new Promise((_resolve, reject) => {
          timeoutHandle = this.setTimeoutFn(() => {
            reject(
              new Error(
                'Timed out refreshing membership publication planning snapshot ' +
                  `for ${nodeId || 'unknown'} after ${timeoutMs}ms`,
              ),
            );
          }, timeoutMs);
          if (typeof timeoutHandle?.unref === TYPEOF.FUNCTION) {
            timeoutHandle.unref();
          }
        }),
      ]);
      return this.resolvePriorityRecoveryPlanningAnswer(
        nodeId,
        observedAt,
        asyncSnapshot || syncSnapshot,
      );
    } catch {
      return syncSnapshot;
    } finally {
      if (timeoutHandle) {
        this.clearTimeoutFn(timeoutHandle);
      }
    }
  }

  async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId, observedAt) {
    return this.getMembershipPublicationPlanningSnapshotBestEffort(
      nodeId,
      observedAt,
    );
  }

  async getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId, observedAt) {
    let membershipPublication = null;
    try {
      membershipPublication = await this.getMembershipPublicationDiagnostics(
        nodeId,
        observedAt,
      );
    } catch (_error) {
      membershipPublication = null;
    }
    return this.resolveNodeMembershipPublicationPlanningAnswer(
      nodeId,
      observedAt,
      membershipPublication,
    );
  }

  getPriorityRecoveryPlanningAnswerForOwnerReadSync(nodeId, observedAt) {
    let membershipPublication = null;
    try {
      membershipPublication = this.getMembershipPublicationDiagnosticsSync(
        nodeId,
        observedAt,
      );
    } catch (_error) {
      membershipPublication = null;
    }
    return this.resolveNodeMembershipPublicationPlanningAnswerSync(
      nodeId,
      observedAt,
      membershipPublication,
    );
  }

  getCurrentPublishedMembershipEpochSync(nodeId, observedAt) {
    const planningSnapshot = this.getMembershipPublicationPlanningAnswerSync(
      nodeId,
      observedAt,
    );
    const publishedPlanningEpoch = Number(
      planningSnapshot?.publishedPlanningEpoch,
    );
    if (
      Number.isInteger(publishedPlanningEpoch) &&
      publishedPlanningEpoch >= NUM.ZERO
    ) {
      return publishedPlanningEpoch;
    }
    return null;
  }

  buildMembershipPublicationDiagnostics(row, observedAt) {
    const protocolSnapshot = buildPublicationRecoveryProtocolSnapshot(row);
    if (!protocolSnapshot) {
      return null;
    }

    const publicationEpoch = Number(
      row.publicationEpoch ?? row.publication_epoch,
    );
    const sourceSnapshotVersion = Number(
      row.sourceSnapshotVersion ?? row.source_snapshot_version,
    );
    const createdAt = normalizeDiagnosticTimestampMs(
      row.createdAt ?? row.created_at ?? observedAt,
    );
    const updatedAt = normalizeDiagnosticTimestampMs(
      row.updatedAt ?? row.updated_at ?? createdAt,
    );
    return Object.freeze({
      publicationEpoch: Number.isFinite(publicationEpoch) ?
        publicationEpoch :
        protocolSnapshot.publicationEpoch,
      sourceSnapshotVersion: Number.isFinite(sourceSnapshotVersion) ?
        sourceSnapshotVersion :
        protocolSnapshot.sourceSnapshotVersion,
      status: protocolSnapshot.publicationStatus,
      publicationObservationState: protocolSnapshot.publicationObservationState,
      publishedActiveNodeIdsPresent:
        protocolSnapshot.publishedActiveNodeIdsPresent,
      publishedActiveNodeIds: protocolSnapshot.publishedActiveNodeIds,
      requiredAckNodeIds: protocolSnapshot.requiredAckNodeIds,
      acknowledgedNodeIds: protocolSnapshot.acknowledgedNodeIds,
      priorityPartitionSummary: protocolSnapshot.priorityPartitionSummary,
      membershipLifecycleSummary: protocolSnapshot.membershipLifecycleSummary,
      projectedServingNodeIds: protocolSnapshot.projectedServingNodeIds,
      locallyEligibleNodeIds: protocolSnapshot.locallyEligibleNodeIds,
      recoveryEligibleIncludedNodeIds:
        protocolSnapshot.recoveryEligibleIncludedNodeIds,
      recoveryActiveNodeIds: protocolSnapshot.recoveryActiveNodeIds,
      recoveryActiveNodeSource: protocolSnapshot.recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds:
        protocolSnapshot.missingPublishedRecoveryActiveNodeIds,
      participationByNodeId: protocolSnapshot.participationByNodeId,
      participationStateCounts: protocolSnapshot.participationStateCounts,
      recoveryProtocolState: protocolSnapshot.recoveryProtocolState,
      priorityRecoveryReasonCodes: protocolSnapshot.priorityRecoveryReasonCodes,
      publicationRecoveryGate: protocolSnapshot.publicationRecoveryGate,
      publicationBoundaryOutcome: protocolSnapshot.publicationBoundaryOutcome,
      createdAt,
      updatedAt,
    });
  }

  buildMembershipPublicationPlanningSnapshot(context = {}) {
    const protocolSnapshot = buildPublicationRecoveryProtocolSnapshot(
      context.membershipPublication,
      {
        targetNodeId: context.nodeId,
      },
    );
    if (!protocolSnapshot) {
      return null;
    }
    return this.normalizeMembershipPublicationPlanningSnapshot(
      protocolSnapshot,
    );
  }
}

export {ControlPlaneReadinessPublicationPlanningSnapshot};
