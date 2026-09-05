import {ControlPlaneReadinessPriorityRecoveryPlanning} from './control-plane-readiness-priority-recovery-planning.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';
import {readPublishedMembershipEpoch} from './published-membership-epoch-reading.js';
import {
  PRIORITY_RECOVERY_PLANNING_PROJECTION,
} from './control-plane-readiness-constants.js';
import {planningIdentitiesEqual} from
  './readiness-planning-semantic-generation.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
  normalizeDiagnosticTimestampMs,
} = SHARED;

// Named empty-state for the publication epoch/status probe: the service
// exposes no cheap probe surface, so freshness falls back to the legacy
// full-read comparison and memo stores carry this marker instead of a raw
// null runtime state.
const PUBLICATION_EPOCH_STATUS_PROBE_UNAVAILABLE = Object.freeze({
  probeUnavailable: true,
});

// Field separator inside the publication component of the readiness-planning
// memo version key. Neither an epoch nor a status renders this sequence, so
// (epoch, status) pairs map one-to-one onto component text.
const PLANNING_MEMO_VERSION_KEY_SEPARATOR = '#planning-memo#';
// Named key components for the two publication states that are not a live
// (epoch, status) pair. They are key TEXT, not runtime state: a service with
// no probe surface keys every entry identically (freshness is governed by the
// floored generation alone, exactly as the removed live veto did), and an
// absent epoch or status keys distinctly from any real value.
const PLANNING_MEMO_VERSION_KEY_PROBE_UNAVAILABLE = 'publication-probe-unavailable';
const PLANNING_MEMO_VERSION_KEY_ABSENT = 'absent';

class ControlPlaneReadinessPublicationPlanningSnapshot extends
  ControlPlaneReadinessPriorityRecoveryPlanning {
  hasMembershipPublicationRecoveryGateEvidence(planningSnapshot = null) {
    // A branded (unmodified builder-output) projection already carries every
    // field this predicate reads - matrix-proven equivalent to re-projecting
    // it - so skip the per-call rebuild. Hand-merged snapshots lose the
    // non-enumerable brand via spread and keep the re-projection.
    const priorityRecoveryProjection =
      planningSnapshot?.[PRIORITY_RECOVERY_PLANNING_PROJECTION] === true ?
        planningSnapshot :
        this.buildPriorityRecoveryPlanningProjection(planningSnapshot);
    if (!priorityRecoveryProjection) {
      return false;
    }
    if (priorityRecoveryProjection.priorityRecoveryActive === true) {
      return true;
    }
    if (
      Array.isArray(priorityRecoveryProjection.priorityRecoveryReasonCodes) &&
      priorityRecoveryProjection.priorityRecoveryReasonCodes.length > 0
    ) {
      return true;
    }
    if (
      priorityRecoveryProjection.priorityPartitionSummary &&
      typeof priorityRecoveryProjection.priorityPartitionSummary === 'object'
    ) {
      return true;
    }
    return (
      typeof priorityRecoveryProjection.publicationStatus === 'string' &&
      priorityRecoveryProjection.publicationStatus.length > 0 &&
      priorityRecoveryProjection.publicationStatus.toUpperCase() !==
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    );
  }

  buildRetainedPriorityRecoveryPlanningGate(
    planningSnapshot = null,
    retainedSnapshot = null,
  ) {
    if (!retainedSnapshot || typeof retainedSnapshot !== 'object') {
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
      typeof planningSnapshot.priorityPartitionSummary === 'object' ?
        planningSnapshot.priorityPartitionSummary :
        retainedSnapshot?.priorityPartitionSummary &&
            typeof retainedSnapshot.priorityPartitionSummary === 'object' ?
          retainedSnapshot.priorityPartitionSummary :
          null;
    const recoveryProtocolState =
      typeof planningSnapshot?.recoveryProtocolState === 'string' &&
      planningSnapshot.recoveryProtocolState.length > 0 ?
        planningSnapshot.recoveryProtocolState :
        typeof retainedSnapshot?.recoveryProtocolState === 'string' &&
            retainedSnapshot.recoveryProtocolState.length > 0 ?
          retainedSnapshot.recoveryProtocolState :
          null;
    return buildPublicationRecoveryGateSnapshot({
      publicationEpoch: Number.isFinite(planningSnapshot?.publicationEpoch) ?
        planningSnapshot.publicationEpoch :
        Number.isFinite(retainedSnapshot?.publicationEpoch) ?
          retainedSnapshot.publicationEpoch :
          (planningGate?.publicationEpoch ?? retainedGate?.publicationEpoch),
      publicationStatus:
        typeof planningSnapshot?.publicationStatus === 'string' &&
        planningSnapshot.publicationStatus.length > 0 ?
          planningSnapshot.publicationStatus :
          typeof planningSnapshot?.status === 'string' &&
              planningSnapshot.status.length > 0 ?
            planningSnapshot.status :
            typeof retainedSnapshot?.publicationStatus === 'string' &&
                retainedSnapshot.publicationStatus.length > 0 ?
              retainedSnapshot.publicationStatus :
              typeof retainedSnapshot?.status === 'string' &&
                  retainedSnapshot.status.length > 0 ?
                retainedSnapshot.status :
                planningGate?.publicationStatus ||
                  retainedGate?.publicationStatus,
      publicationObservationState:
        typeof planningSnapshot?.publicationObservationState ===
          'string' &&
        planningSnapshot.publicationObservationState.length > 0 ?
          planningSnapshot.publicationObservationState :
          typeof retainedSnapshot?.publicationObservationState ===
                'string' &&
              retainedSnapshot.publicationObservationState.length > 0 ?
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
        0,
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
        typeof planningSnapshot?.publicationExcludesTargetNode === 'boolean' ?
          planningSnapshot.publicationExcludesTargetNode :
          typeof planningGate?.publicationExcludesTargetNode === 'boolean' ?
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
  // reuse only while the cluster-wide planning source revision is unchanged.
  // Per-node readiness invalidation is insufficient because a replica row on
  // another node still changes this publisher's priority-spread summary. The
  // per-node retain/active layers in getPriorityRecoveryPlanningAnswerSync stay
  // OUTSIDE this memo and run every call on the (shared, frozen) projection.
  // CL-033/CL-034 (regression repair): the wall-time stale-grace bound for the
  // readiness planning memos. observedAt on the sync readiness hot path is an ISO
  // STRING (getNodeReadinessSync: normalizeIsoTimestamp(now)), so the prior
  // `Number(observedAt)` form produced NaN and `NaN <= grace` is ALWAYS false —
  // silently disabling both memos in production (and turning their guard tests
  // red). Parse via normalizeDiagnosticTimestampMs (handles ISO strings, numeric
  // strings, and numbers); when either side is unparseable fall back to reuse and
  // rely on the strong guards (the cluster-wide planning-source revision plus
  // the epoch/status freshness recheck) rather than a NaN comparison.
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
  // Reads the live publication winner row's (epoch, status) for the memo
  // freshness probes. Returns null when the service exposes no probe surface
  // (stubs that predate it) — callers treat that as "probe unavailable, not
  // stale". Scope-consistent: reads the CLUSTER winner without the
  // node-inclusion filter — the inclusion-filtered form returns null for
  // excluded (joining/recovering) nodes and made the guard read permanently
  // stale; inclusion-list changes invalidate via the planning generation,
  // not this probe.
  readLatestMembershipPublicationEpochStatusProbe(nodeId) {
    const service = this.membershipPublicationService;
    if (
      !service ||
      typeof service.getLatestMembershipPublicationEpochStatusForNodeSync !==
        'function'
    ) {
      // No probe surface on this service: freshness is governed entirely
      // by the floored planning generation. A full-row read here would add
      // an unprofiled publication-lane read to every memo store, breaking
      // the sealed lane-separation contract.
      return PUBLICATION_EPOCH_STATUS_PROBE_UNAVAILABLE;
    }
    const latestPub =
      service.getLatestMembershipPublicationEpochStatusForNodeSync(
        nodeId,
        {requireNodeInclusion: false},
      );
    return Object.freeze({
      epoch: latestPub ?
        (latestPub.publicationEpoch ?? latestPub.publication_epoch ?? null) :
        null,
      status: latestPub ? (latestPub.status ?? null) : null,
    });
  }

  // The publication component of the readiness-planning memo version key.
  // Byte-for-byte the same (epoch, status) pair the removed live veto
  // compared, rendered as comparable key TEXT: a service with no probe
  // surface renders one fixed marker (freshness then rests entirely on the
  // floored generation, exactly as the veto's probe-unavailable branch did),
  // and an absent epoch or status renders a named marker rather than a raw
  // null.
  buildMembershipPublicationPlanningMemoKeyComponent(nodeId) {
    const probe = this.readLatestMembershipPublicationEpochStatusProbe(nodeId);
    if (probe === PUBLICATION_EPOCH_STATUS_PROBE_UNAVAILABLE) {
      return PLANNING_MEMO_VERSION_KEY_PROBE_UNAVAILABLE;
    }
    return (probe.epoch ?? PLANNING_MEMO_VERSION_KEY_ABSENT) +
      PLANNING_MEMO_VERSION_KEY_SEPARATOR +
      (probe.status ?? PLANNING_MEMO_VERSION_KEY_ABSENT);
  }

  // ONE version key for the readiness planning memos, replacing the previous
  // (floored generation key) + (live epoch/status staleness VETO) pair. The
  // veto was probe-derived: a live read no cached entry could carry, checked
  // as a side condition after the key comparison had already passed. Folding
  // the same (epoch, status) into the key makes planning freshness
  // key-derived — declarative, storable and comparable — with exactly the
  // veto's strength: a moved (epoch, status) yields a different key and is
  // never served from the memo, and an unmoved one yields an equal key.
  readMembershipPublicationPlanningMemoVersionKey(nodeId, observedAt) {
    const planningIdentity =
      typeof this.readPlanningProjectionMemoIdentity === 'function' ?
        this.readPlanningProjectionMemoIdentity(nodeId, observedAt) : null;
    return Object.freeze({
      planningIdentity,
      sourceGeneration: planningIdentity ? null :
        this.readPlanningProjectionSourceGeneration(observedAt),
      publicationComponent: planningIdentity ? null :
        this.buildMembershipPublicationPlanningMemoKeyComponent(nodeId),
    });
  }

  // The planning identity keys this memo only while current; a saturated
  // identity yields null so the key falls back to the floored generation plus
  // the publication component (see readCurrentPlanningProjectionIdentity).
  readPlanningProjectionMemoIdentity(nodeId, _observedAt) {
    if (typeof this.readCurrentPlanningProjectionIdentity !== 'function') {
      return null;
    }
    return typeof nodeId === 'string' ?
      this.readCurrentPlanningProjectionIdentity(nodeId) : null;
  }

  // Key equality, cheap component first. The generation component is a string
  // compare; the publication component costs one publications-table winner
  // read, so it is derived only once the generation already matches — the
  // same short-circuit order (and therefore the same number of publication
  // reads per call) the generation-check + live-veto pair had.
  membershipPublicationPlanningMemoVersionKeyMatches(
    cachedVersionKey,
    nodeId,
    sourceGeneration,
    planningIdentity = null,
  ) {
    const currencyMatches = planningIdentity ?
      planningIdentitiesEqual(
        cachedVersionKey.planningIdentity,
        planningIdentity,
      ) :
      cachedVersionKey.sourceGeneration === sourceGeneration;
    return currencyMatches && (planningIdentity !== null ||
      cachedVersionKey.publicationComponent ===
        this.buildMembershipPublicationPlanningMemoKeyComponent(nodeId));
  }

  // Keyed on the shared floored planning generation (the same key the
  // derivation memo uses) rather than the raw per-write source revision:
  // during formation data load the revision rotated between consecutive
  // reads, this memo missed on every call, and each rebuilt projection was
  // a fresh identity that defeated every downstream identity memo (gate,
  // placement observation, projection retention) — live-measured as the
  // dominant content of the residual 3s seed gaps (archived run
  // 17-51-37-407Z-natural-manual). Inclusion-list changes now invalidate
  // via the floored generation (same tables, latched up to 250ms — well
  // inside the CL-033 grace its consumers accept); direct publication
  // epoch/status changes still invalidate immediately via the publication
  // component of the memo version key above. Caches that cannot version their
  // tables keep the exact revision-counter key.
  readPlanningProjectionSourceGeneration(observedAt) {
    const flooredGeneration =
      typeof this.readMembershipPlanningDerivationVersionKey === 'function' ?
        this.readMembershipPlanningDerivationVersionKey(observedAt) :
        null;
    return flooredGeneration ??
      this.membershipPublicationPlanningSourceRevision;
  }

  resolveMemoizedPriorityRecoveryPlanningProjectionSync(nodeId, observedAt) {
    const memoKey = nodeId || this.nodeId;
    const memo = this.priorityRecoveryPlanningProjectionMemoByNodeId;
    const planningIdentity =
      typeof this.readPlanningProjectionMemoIdentity === 'function' ?
        this.readPlanningProjectionMemoIdentity(memoKey, observedAt) : null;
    const sourceGeneration = planningIdentity ? null :
      this.readPlanningProjectionSourceGeneration(observedAt);
    if (memo && memoKey) {
      const cached = memo.get(memoKey);
      if (
        cached &&
        cached.fn === this.getMembershipPublicationPlanningSnapshotSync &&
        this.isReadinessPlanningMemoWithinStaleGrace(
          observedAt,
          cached.capturedAtMs,
        ) &&
        this.membershipPublicationPlanningMemoVersionKeyMatches(
          cached.versionKey,
          memoKey,
          sourceGeneration,
          planningIdentity,
        )
      ) {
        return cached.projection;
      }
    }
    const capturedAtMs = this.now();
    // Miss path builds UNCONDITIONALLY (bypassing the input-identity
    // projection memo): the publication component of the version key moves on
    // row changes that arrive without a table write, and a key-forced miss
    // must produce a genuinely fresh projection identity even when the derived
    // input identity is unchanged — the observable
    // projection-planning-identity-memoization pins.
    const projection = this.buildTrackedPriorityRecoveryPlanningProjection(
      this.getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt),
    );
    if (memo && memoKey) {
      memo.set(memoKey, {
        projection,
        capturedAtMs,
        versionKey: this.readMembershipPublicationPlanningMemoVersionKey(
          memoKey,
          observedAt,
        ),
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
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
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
          if (typeof timeoutHandle?.unref === 'function') {
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
    // A planning answer without a PUBLISHED epoch (publication absent or
    // still establishing) is unreadable, never epoch 0.
    return readPublishedMembershipEpoch(
      planningSnapshot?.publishedPlanningEpoch,
    );
  }

  buildMembershipPublicationDiagnostics(row, observedAt) {
    const protocolSnapshot = buildPublicationRecoveryProtocolSnapshot(row);
    if (!protocolSnapshot) {
      return null;
    }

    const publicationEpoch = readPublishedMembershipEpoch(
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
      publicationEpoch: publicationEpoch ?? protocolSnapshot.publicationEpoch,
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
