import {ControlPlaneReadinessPublicationPlanningSnapshot} from './control-plane-readiness-publication-planning-snapshot.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';

const {
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildCanonicalPublicationRecoveryEvidence,
  resolveMembershipPublicationPlanningSource,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
} = SHARED;

class ControlPlaneReadinessPublicationPlanningResolution extends
  ControlPlaneReadinessPublicationPlanningSnapshot {
  resolveMembershipPublicationPlanningSnapshot(context = {}) {
    const directPlanningSnapshot = this.buildMembershipPublicationPlanningSnapshot({
      nodeId: context?.nodeId,
      observedAt: context?.observedAt,
      membershipPublication: context?.membershipPublication,
    });
    const providedPlanningSnapshot =
      context?.membershipPublicationPlanningSnapshot &&
      typeof context.membershipPublicationPlanningSnapshot === 'object' ?
        context.membershipPublicationPlanningSnapshot :
        null;
    if (!providedPlanningSnapshot) {
      return directPlanningSnapshot;
    }
    if (!directPlanningSnapshot) {
      return providedPlanningSnapshot;
    }
    if (
      this.shouldUseProvidedReadyGateForMembershipPublicationPlanningMerge(
        directPlanningSnapshot,
        providedPlanningSnapshot,
      )
    ) {
      return this.buildPriorityRecoveryPlanningProjection(
        providedPlanningSnapshot,
      );
    }
    const preferDirectReadyGate =
      this.shouldUseDirectReadyGateForMembershipPublicationPlanningMerge(
        directPlanningSnapshot,
        providedPlanningSnapshot,
      );
    const directPublicationRecoveryGate =
      directPlanningSnapshot.publicationRecoveryGate &&
      typeof directPlanningSnapshot.publicationRecoveryGate === 'object' ?
        directPlanningSnapshot.publicationRecoveryGate :
        null;
    const providedPublicationRecoveryGate =
      providedPlanningSnapshot.publicationRecoveryGate &&
      typeof providedPlanningSnapshot.publicationRecoveryGate ===
        'object' ?
        providedPlanningSnapshot.publicationRecoveryGate :
        null;
    const directPendingAckEvidenceState =
      this.resolvePlanningPendingAckEvidenceState(
        directPlanningSnapshot,
        directPublicationRecoveryGate,
      );
    const providedPendingAckEvidenceState =
      this.resolvePlanningPendingAckEvidenceState(
        providedPlanningSnapshot,
        providedPublicationRecoveryGate,
      );
    const providedPendingAckCountValue =
      providedPlanningSnapshot.pendingAckCount ??
      providedPlanningSnapshot.publicationRecoveryGate?.pendingAckCount;
    const providedPendingAckCount = Number(providedPendingAckCountValue);
    const directRequiredAckNodeIds = Array.isArray(
      directPlanningSnapshot.requiredAckNodeIds,
    ) ?
      directPlanningSnapshot.requiredAckNodeIds :
      Array.isArray(
        directPlanningSnapshot.publicationRecoveryGate?.requiredAckNodeIds,
      ) ?
        directPlanningSnapshot.publicationRecoveryGate.requiredAckNodeIds :
        [];
    const providedRequiredAckNodeIds = Array.isArray(
      providedPlanningSnapshot.requiredAckNodeIds,
    ) ?
      providedPlanningSnapshot.requiredAckNodeIds :
      [];
    const directPendingAckCount = Number(
      directPlanningSnapshot.pendingAckCount ??
      directPlanningSnapshot.publicationRecoveryGate?.pendingAckCount ??
      0,
    );
    const directHasPendingAckDebt =
      Number.isFinite(directPendingAckCount) &&
      directPendingAckCount > 0;
    const directHasRequiredAckNodeListDebt =
      directPendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST &&
      directRequiredAckNodeIds.length > 0;
    const providedHasCountOnlyAckDebt =
      providedPendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
      Number.isFinite(providedPendingAckCount) &&
      providedPendingAckCount > 0;
    const directCanAcceptProvidedCountOnlyAckDebt =
      directPendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
      (
        directHasPendingAckDebt !== true &&
        directHasRequiredAckNodeListDebt !== true
      );
    const shouldUseProvidedAckNodeList =
      providedPendingAckEvidenceState !==
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
      providedRequiredAckNodeIds.length > 0 &&
      (
        directPendingAckEvidenceState ===
          PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
        (
          directPendingAckEvidenceState ===
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
              .REQUIRED_ACK_NODE_LIST &&
          directHasPendingAckDebt !== true &&
          directHasRequiredAckNodeListDebt !== true
        )
      );
    const shouldUseProvidedCountOnlyAckDebt =
      shouldUseProvidedAckNodeList !== true &&
      providedHasCountOnlyAckDebt &&
      directCanAcceptProvidedCountOnlyAckDebt;
    const publicationConvergenceForEvidence =
      shouldUseProvidedAckNodeList ?
        {
          ...directPlanningSnapshot,
          requiredAckNodeIds: providedPlanningSnapshot.requiredAckNodeIds,
          acknowledgedNodeIds: Array.isArray(
            providedPlanningSnapshot.acknowledgedNodeIds,
          ) ?
            providedPlanningSnapshot.acknowledgedNodeIds :
            directPlanningSnapshot.acknowledgedNodeIds,
          pendingAckNodeIds: Array.isArray(
            providedPlanningSnapshot.pendingAckNodeIds,
          ) ?
            providedPlanningSnapshot.pendingAckNodeIds :
            directPlanningSnapshot.pendingAckNodeIds,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
              .REQUIRED_ACK_NODE_LIST,
          publicationRecoveryGate: (() => {
            const gate = providedPlanningSnapshot.publicationRecoveryGate ||
              directPlanningSnapshot.publicationRecoveryGate ||
              {};
            const requiredAckIds = providedPlanningSnapshot.requiredAckNodeIds;
            const acknowledgedIds = Array.isArray(
              providedPlanningSnapshot.acknowledgedNodeIds,
            ) ?
              providedPlanningSnapshot.acknowledgedNodeIds :
              directPlanningSnapshot.acknowledgedNodeIds;
            const pendingAckIds = Array.isArray(
              providedPlanningSnapshot.pendingAckNodeIds,
            ) ?
              providedPlanningSnapshot.pendingAckNodeIds :
              directPlanningSnapshot.pendingAckNodeIds;
            return {
              ...gate,
              requiredAckNodeIds: requiredAckIds,
              acknowledgedNodeIds: acknowledgedIds,
              pendingAckNodeIds: pendingAckIds,
              pendingAckCount: providedPendingAckCount,
              pendingAckEvidenceState:
                PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
                  .REQUIRED_ACK_NODE_LIST,
              publicationOwnerStream: gate.publicationOwnerStream ? {
                ...gate.publicationOwnerStream,
                requiredAckNodeIds: requiredAckIds,
                acknowledgedNodeIds: acknowledgedIds,
                pendingAckNodeIds: pendingAckIds,
                pendingAckCount: providedPendingAckCount,
                pendingAckEvidenceState:
                  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
                    .REQUIRED_ACK_NODE_LIST,
              } : null,
            };
          })(),
        } :
        shouldUseProvidedCountOnlyAckDebt ?
          {
            ...directPlanningSnapshot,
            pendingAckCount: providedPendingAckCount,
            pendingAckEvidenceState:
              PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
            pendingAckNodeIds: Array.isArray(
              providedPlanningSnapshot.pendingAckNodeIds,
            ) ?
              providedPlanningSnapshot.pendingAckNodeIds :
              directPlanningSnapshot.pendingAckNodeIds,
            publicationRecoveryGate: (() => {
              const gate = directPlanningSnapshot.publicationRecoveryGate || {};
              const pendingAckIds = Array.isArray(
                providedPlanningSnapshot.pendingAckNodeIds,
              ) ?
                providedPlanningSnapshot.pendingAckNodeIds :
                directPlanningSnapshot.pendingAckNodeIds;
              return {
                ...gate,
                pendingAckCount: providedPendingAckCount,
                pendingAckEvidenceState:
                  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
                pendingAckNodeIds: pendingAckIds,
                publicationOwnerStream: gate.publicationOwnerStream ? {
                  ...gate.publicationOwnerStream,
                  pendingAckCount: providedPendingAckCount,
                  pendingAckEvidenceState:
                    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
                  pendingAckNodeIds: pendingAckIds,
                } : null,
              };
            })(),
          } :
          directPlanningSnapshot;
    const publicationConvergenceGateForMerge =
      publicationConvergenceForEvidence.publicationRecoveryGate ||
      directPlanningSnapshot.publicationRecoveryGate ||
      providedPlanningSnapshot.publicationRecoveryGate ||
      null;
    const shouldUseProvidedPriorityRecoveryDecisionSnapshots =
      this.shouldUseProvidedPriorityRecoveryDecisionSnapshotsForMembershipPublicationPlanningMerge(
        directPlanningSnapshot,
        providedPlanningSnapshot,
        publicationConvergenceGateForMerge,
      );
    const providedPriorityRecoveryObservation =
      shouldUseProvidedPriorityRecoveryDecisionSnapshots &&
      providedPlanningSnapshot.priorityRecoveryObservation &&
      typeof providedPlanningSnapshot.priorityRecoveryObservation ===
        'object' ?
        providedPlanningSnapshot.priorityRecoveryObservation :
        null;
    const providedPriorityRecoveryDecisionSnapshots =
      shouldUseProvidedPriorityRecoveryDecisionSnapshots ?
        providedPlanningSnapshot.priorityRecoveryDecisionSnapshots || null :
        null;
    const publicationEvidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: publicationConvergenceForEvidence,
      publicationConvergenceGate:
        publicationConvergenceForEvidence.publicationRecoveryGate ||
        providedPlanningSnapshot.publicationRecoveryGate ||
        null,
      priorityRecoveryObservation: providedPriorityRecoveryObservation,
      priorityRecoveryDecisionSnapshots:
        preferDirectReadyGate ?
          null :
          providedPriorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        preferDirectReadyGate ?
          directPlanningSnapshot.priorityRecoveryClosureWitness ||
            null :
          providedPlanningSnapshot.priorityRecoveryClosureWitness ||
        directPlanningSnapshot.priorityRecoveryClosureWitness ||
        null,
      priorityRecoveryInvariants:
        providedPlanningSnapshot.priorityRecoveryInvariants || null,
    });
    const diagnosticPublicationEvidence =
      preferDirectReadyGate ?
        buildCanonicalPublicationRecoveryEvidence({
          publicationConvergence: publicationConvergenceForEvidence,
          publicationConvergenceGate:
            publicationConvergenceForEvidence.publicationRecoveryGate ||
            providedPlanningSnapshot.publicationRecoveryGate ||
            null,
          priorityRecoveryObservation: providedPriorityRecoveryObservation,
          priorityRecoveryDecisionSnapshots:
            providedPriorityRecoveryDecisionSnapshots,
          priorityRecoveryClosureWitness:
            providedPlanningSnapshot.priorityRecoveryClosureWitness || null,
          priorityRecoveryInvariants:
            providedPlanningSnapshot.priorityRecoveryInvariants || null,
        }) :
        null;
    const publicationConvergenceGate =
      publicationEvidence.publicationConvergenceGate ||
      directPlanningSnapshot.publicationRecoveryGate ||
      providedPlanningSnapshot.publicationRecoveryGate ||
      null;
    const preferDirectPublicationStatus =
      this.shouldPreferDirectPublicationStatusForMembershipPublicationPlanningMerge(
        directPlanningSnapshot,
        providedPlanningSnapshot,
        publicationConvergenceGate,
      );
    const priorityRecoveryObservation =
      diagnosticPublicationEvidence?.priorityRecoveryObservation ||
      publicationEvidence.priorityRecoveryObservation ||
      null;
    return this.buildPriorityRecoveryPlanningProjection({
      ...providedPlanningSnapshot,
      ...directPlanningSnapshot,
      ...(shouldUseProvidedAckNodeList ?
        {
          requiredAckNodeIds: providedPlanningSnapshot.requiredAckNodeIds,
          acknowledgedNodeIds: Array.isArray(
            providedPlanningSnapshot.acknowledgedNodeIds,
          ) ?
            providedPlanningSnapshot.acknowledgedNodeIds :
            directPlanningSnapshot.acknowledgedNodeIds,
          pendingAckNodeIds: Array.isArray(
            providedPlanningSnapshot.pendingAckNodeIds,
          ) ?
            providedPlanningSnapshot.pendingAckNodeIds :
            directPlanningSnapshot.pendingAckNodeIds,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
              .REQUIRED_ACK_NODE_LIST,
        } :
        {}),
      ...(shouldUseProvidedCountOnlyAckDebt ?
        {
          pendingAckCount: providedPendingAckCount,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
          pendingAckNodeIds: Array.isArray(
            providedPlanningSnapshot.pendingAckNodeIds,
          ) ?
            providedPlanningSnapshot.pendingAckNodeIds :
            directPlanningSnapshot.pendingAckNodeIds,
        } :
        {}),
      priorityRecoveryDecisionSnapshots:
        preferDirectReadyGate ?
          null :
          providedPriorityRecoveryDecisionSnapshots,
      publicationEpoch:
        publicationConvergenceGate?.publicationEpoch ??
        directPlanningSnapshot.publicationEpoch ??
        providedPlanningSnapshot.publicationEpoch ??
        null,
      publicationStatus:
        preferDirectPublicationStatus ?
          directPlanningSnapshot.publicationStatus ??
            directPlanningSnapshot.status ??
            publicationConvergenceGate?.publicationStatus ??
            providedPlanningSnapshot.publicationStatus ??
            providedPlanningSnapshot.status ??
            null :
          publicationConvergenceGate?.publicationStatus ??
            directPlanningSnapshot.publicationStatus ??
            directPlanningSnapshot.status ??
            providedPlanningSnapshot.publicationStatus ??
            providedPlanningSnapshot.status ??
            null,
      publicationObservationState:
        preferDirectPublicationStatus ?
          directPlanningSnapshot.publicationObservationState ??
            publicationConvergenceGate?.publicationObservationState ??
            providedPlanningSnapshot.publicationObservationState ??
            null :
          publicationConvergenceGate?.publicationObservationState ??
            directPlanningSnapshot.publicationObservationState ??
            providedPlanningSnapshot.publicationObservationState ??
            null,
      pendingAckCount:
        publicationConvergenceGate?.pendingAckCount ??
        directPlanningSnapshot.pendingAckCount ??
        providedPlanningSnapshot.pendingAckCount ??
        0,
      recoveryProtocolState:
        priorityRecoveryObservation?.recoveryProtocolState ??
        publicationConvergenceGate?.recoveryProtocolState ??
        directPlanningSnapshot.recoveryProtocolState ??
        providedPlanningSnapshot.recoveryProtocolState ??
        null,
      priorityRecoveryReasonCodes:
        priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
        publicationConvergenceGate?.reasonCodes ??
        directPlanningSnapshot.priorityRecoveryReasonCodes ??
        providedPlanningSnapshot.priorityRecoveryReasonCodes ??
        [],
      priorityPartitionSummary:
        priorityRecoveryObservation?.priorityPartitionSummary ??
        publicationConvergenceGate?.priorityPartitionSummary ??
        directPlanningSnapshot.priorityPartitionSummary ??
        providedPlanningSnapshot.priorityPartitionSummary ??
        null,
      priorityRecoveryClosureWitness:
        publicationConvergenceGate?.priorityRecoveryClosureWitness ??
        (preferDirectReadyGate ?
          directPlanningSnapshot.priorityRecoveryClosureWitness ||
            null :
          directPlanningSnapshot.priorityRecoveryClosureWitness ??
            providedPlanningSnapshot.priorityRecoveryClosureWitness ??
            null),
      diagnosticPriorityRecoveryClosureWitness:
        providedPlanningSnapshot.diagnosticPriorityRecoveryClosureWitness ||
        providedPlanningSnapshot.priorityRecoveryClosureWitness ||
        providedPlanningSnapshot.publicationRecoveryGate
          ?.priorityRecoveryClosureWitness ||
        null,
      diagnosticPriorityRecoveryReasonCodes:
        Array.isArray(
          providedPlanningSnapshot.diagnosticPriorityRecoveryReasonCodes,
        ) ?
          [...providedPlanningSnapshot.diagnosticPriorityRecoveryReasonCodes] :
          Array.isArray(providedPlanningSnapshot.priorityRecoveryReasonCodes) ?
            [...providedPlanningSnapshot.priorityRecoveryReasonCodes] :
            Array.isArray(providedPlanningSnapshot.publicationRecoveryGate
              ?.reasonCodes) ?
              [...providedPlanningSnapshot.publicationRecoveryGate.reasonCodes] :
              [],
      publicationRecoveryGate: publicationConvergenceGate,
      priorityRecoveryObservation,
    });
  }

  // CL-034: resolveMembershipPublicationPlanningSnapshot is the residual
  // readiness-build cost CL-033's projection memo did not cover. CL-033 memoized
  // the DIRECT planning projection (getPriorityRecoveryPlanningAnswerSync); this
  // MERGE re-reads the cluster (buildMembershipPublicationPlanningSnapshot
  // directPlanningSnapshot) and runs the full pending-ack merge + a second
  // buildPriorityRecoveryPlanningProjection on EVERY routing call. During recovery
  // the stored-snapshot fast path misses every call, so this merge dominated the
  // ~14s residual seed event-loop gap that still exceeds the raft election timeout
  // and loses control_plane_publications-p1 leadership (CL-001 variant B). The
  // merge is a pure function of publication + node/service/partition state for the
  // publisher node, so memoize its (already Object.frozen) output per publisher
  // node and reuse it until the cluster-wide planning source revision changes,
  // plus the identical epoch/status freshness recheck. A remote replica
  // transition changes every publisher's summary without changing that
  // publisher's per-node readiness evidence. The
  // side-effectful per-node layer (resolvePriorityRecoveryPlanningAnswer) and the
  // input planning answer stay OUTSIDE this memo and run every call.
  resolveMemoizedMembershipPublicationPlanningSnapshotSync(
    nodeId,
    observedAt,
    membershipPublication,
    membershipPublicationPlanningSnapshot,
  ) {
    const memoKey = nodeId || this.nodeId;
    const memo = this.membershipPublicationPlanningSnapshotMemoByNodeId;
    // Same floored-generation key as the projection memo: the raw per-write
    // revision rotated between consecutive reads under formation churn and
    // made this memo miss per call, minting fresh merge identities.
    const sourceGeneration =
      this.readPlanningProjectionSourceGeneration(observedAt);
    if (memo && memoKey) {
      const cached = memo.get(memoKey);
      if (
        cached &&
        cached.fn === this.resolveMembershipPublicationPlanningSnapshot &&
        cached.sourceGeneration === sourceGeneration &&
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
    const projection = this.resolveMembershipPublicationPlanningSnapshot({
      nodeId,
      observedAt,
      membershipPublication,
      membershipPublicationPlanningSnapshot,
    });
    if (memo && memoKey) {
      memo.set(memoKey, {
        projection,
        capturedAtMs,
        sourceGeneration,
        fn: this.resolveMembershipPublicationPlanningSnapshot,
      });
    }
    return projection;
  }

  // CL-034 follow-up: the readiness-build sub-builders re-run the SAME merge ~6 times
  // per getNodeReadinessSync — getPriorityControlPlaneRecoveryState (once, from
  // buildDimensionsEvaluation), its segment-2 wrapper,
  // buildRuntimeAuthoritySnapshot, isControlPlaneRecoveryEligible, and
  // buildPriorityControlPlaneRecoveryProjection — all calling
  // resolveMembershipPublicationPlanningSnapshot(context) with the SAME already-RESOLVED
  // planning snapshot threaded through context (a different provided snapshot than the
  // main path, so the main-path nodeId memo does not cover it). That left the dominant
  // residual readiness-build cost on the hot path. Memoize WITHIN the build, keyed by
  // the providedPlanningSnapshot OBJECT REFERENCE: every sub-builder of one readiness
  // build shares the same snapshot object so they collapse to one merge, while a caller
  // passing a DIFFERENT snapshot (different epoch/status, e.g. a later build or a direct
  // getPriorityControlPlaneRecoveryState call) gets a different key — so the memo can
  // never return a result computed for a different logical input. The merge output is
  // already Object.frozen; reuse is mutation-safe. Falls through to a direct merge when
  // no snapshot object is present.
  //
  // STALENESS GUARD: the provided snapshot is USUALLY a fresh per-build object, but
  // resolvePriorityRecoveryPlanningAnswer can RETAIN an active snapshot object across
  // builds (lastActivePriorityRecoveryPlanningSnapshotByNodeId) — that object stays
  // GC-reachable, so the WeakMap entry would survive into later builds whose live
  // publication has advanced, serving a stale merge. The merge also depends on
  // context.membershipPublication (it builds the direct planning snapshot from it), and
  // that value is re-read fresh each getNodeReadinessSync — reference-stable only while
  // the publication is unchanged (its diagnostics memo is nulled on any
  // CONTROL_PLANE_PUBLICATIONS change AND on a service/cache swap). So gate the hit on
  // membershipPublication reference identity: a retained provided snapshot re-presented
  // after the publication advances (or after a swap) misses and recomputes.
  resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(context = {}) {
    const provided = context?.membershipPublicationPlanningSnapshot;
    const memo = this.membershipPublicationPlanningSnapshotContextMemo;
    if (!memo || !provided || typeof provided !== 'object') {
      return this.resolveMembershipPublicationPlanningSnapshot(context);
    }
    const membershipPublication = context?.membershipPublication ?? null;
    const cached = memo.get(provided);
    if (
      cached !== undefined &&
      cached.membershipPublication === membershipPublication
    ) {
      return cached.projection;
    }
    const projection = this.resolveMembershipPublicationPlanningSnapshot(context);
    memo.set(provided, {projection, membershipPublication});
    return projection;
  }

  resolveMembershipPublicationPlanningSource(options = {}) {
    return resolveMembershipPublicationPlanningSource(
      options?.membershipPublicationPlanningSource,
    );
  }

  shouldPersistReadinessSnapshot(options = {}) {
    return (
      this.resolveMembershipPublicationPlanningSource(options) !==
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
    );
  }

  buildDirectMembershipPublicationPlanningAnswer(
    nodeId,
    observedAt,
    membershipPublication,
  ) {
    return this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      this.buildMembershipPublicationPlanningSnapshot({
        nodeId,
        observedAt,
        membershipPublication,
      }),
    );
  }

  async resolveNodeMembershipPublicationPlanningAnswer(
    nodeId,
    observedAt,
    membershipPublication,
    options = {},
  ) {
    if (
      this.resolveMembershipPublicationPlanningSource(options) ===
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
    ) {
      return this.buildDirectMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
      );
    }
    const planningSnapshot = await this.getMembershipPublicationPlanningSnapshotBestEffort(
      nodeId,
      observedAt,
    );
    return this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      this.resolveMembershipPublicationPlanningSnapshot({
        nodeId,
        observedAt,
        membershipPublication,
        membershipPublicationPlanningSnapshot: planningSnapshot,
      }),
    );
  }

  resolveNodeMembershipPublicationPlanningAnswerSync(
    nodeId,
    observedAt,
    membershipPublication,
    options = {},
  ) {
    if (
      this.resolveMembershipPublicationPlanningSource(options) ===
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
    ) {
      return this.buildDirectMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
      );
    }
    const planningSnapshot = this.getMembershipPublicationPlanningAnswerSync(
      nodeId,
      observedAt,
    );
    return this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      this.resolveMemoizedMembershipPublicationPlanningSnapshotSync(
        nodeId,
        observedAt,
        membershipPublication,
        planningSnapshot,
      ),
    );
  }

  buildMembershipPublicationReadOptions(readOptions = {}) {
    return resolveMembershipPublicationReadOptions({
      lane: resolveMembershipPublicationReadLane(readOptions?.lane),
      queryTimeoutMs:
        Number.isFinite(readOptions?.queryTimeoutMs) &&
        readOptions.queryTimeoutMs > 0 ?
          readOptions.queryTimeoutMs :
          this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
  }

  getLatestMembershipPublicationRowSync(nodeId, readOptions = {}) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== 'object') {
      return null;
    }
    const normalizedReadOptions =
      this.buildMembershipPublicationReadOptions(readOptions);
    const normalizedScope = resolveMembershipPublicationReadScope(
      readOptions?.scope,
    );
    if (
      normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER &&
      typeof service.getLatestClusterPublicationSync === 'function'
    ) {
      return service.getLatestClusterPublicationSync(normalizedReadOptions);
    }
    if (typeof service.getLatestPublicationForNodeSync === 'function') {
      return service.getLatestPublicationForNodeSync(
        nodeId,
        normalizedReadOptions,
      );
    }
    if (typeof service.getLatestClusterPublicationSync === 'function') {
      return service.getLatestClusterPublicationSync(normalizedReadOptions);
    }
    return null;
  }

  async getLatestMembershipPublicationRow(nodeId, readOptions = {}) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== 'object') {
      return null;
    }
    const normalizedReadOptions =
      this.buildMembershipPublicationReadOptions(readOptions);
    const normalizedScope = resolveMembershipPublicationReadScope(
      readOptions?.scope,
    );
    if (
      normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER &&
      typeof service.getLatestClusterPublication === 'function'
    ) {
      return service.getLatestClusterPublication(normalizedReadOptions);
    }
    if (typeof service.getLatestPublicationForNode === 'function') {
      return service.getLatestPublicationForNode(nodeId, normalizedReadOptions);
    }
    if (typeof service.getLatestClusterPublication === 'function') {
      return service.getLatestClusterPublication(normalizedReadOptions);
    }
    return null;
  }

  getLatestPublishedMembershipPublicationRowSync(readOptions = {}) {
    const service = this.membershipPublicationService;
    if (
      !service ||
      typeof service !== 'object' ||
      typeof service.getLatestPublishedClusterPublicationSync !==
        'function'
    ) {
      return null;
    }
    return service.getLatestPublishedClusterPublicationSync(
      this.buildMembershipPublicationReadOptions(readOptions),
    );
  }
}

export {ControlPlaneReadinessPublicationPlanningResolution};
