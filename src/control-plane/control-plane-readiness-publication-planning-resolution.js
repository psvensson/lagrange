import {readPublicationRecordStatus} from './system-row-normalizers.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';
import {readWiredCollaborator} from './control-plane-readiness-collaborators.js';
import {
  CONTROL_PLANE_READINESS_COLLABORATOR as COLLABORATOR,
  CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED as UNWIRED,
} from './control-plane-readiness-constants.js';
import {
  isResolvedNodePlanningAnswerForContext,
  rememberResolvedNodePlanningAnswer,
} from './readiness-resolved-planning-answer-context.js';

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

function resolveMembershipPublicationPlanningSnapshot(service, context = {}) {
  const directPlanningSnapshot = service.buildMembershipPublicationPlanningSnapshot({
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
    service.shouldUseProvidedReadyGateForMembershipPublicationPlanningMerge(
      directPlanningSnapshot,
      providedPlanningSnapshot,
    )
  ) {
    return service.buildPriorityRecoveryPlanningProjection(
      providedPlanningSnapshot,
    );
  }
  const preferDirectReadyGate =
    service.shouldUseDirectReadyGateForMembershipPublicationPlanningMerge(
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
    service.resolvePlanningPendingAckEvidenceState(
      directPlanningSnapshot,
      directPublicationRecoveryGate,
    );
  const providedPendingAckEvidenceState =
    service.resolvePlanningPendingAckEvidenceState(
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
    service.shouldUseProvidedPriorityRecoveryDecisionSnapshotsForMembershipPublicationPlanningMerge(
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
    service.shouldPreferDirectPublicationStatusForMembershipPublicationPlanningMerge(
      directPlanningSnapshot,
      providedPlanningSnapshot,
      publicationConvergenceGate,
    );
  const priorityRecoveryObservation =
    diagnosticPublicationEvidence?.priorityRecoveryObservation ||
    publicationEvidence.priorityRecoveryObservation ||
    null;
  return service.buildPriorityRecoveryPlanningProjection({
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
        readPublicationRecordStatus(directPlanningSnapshot) ??
          publicationConvergenceGate?.publicationStatus ??
          readPublicationRecordStatus(providedPlanningSnapshot) ??
          null :
        publicationConvergenceGate?.publicationStatus ??
          readPublicationRecordStatus(directPlanningSnapshot) ??
          readPublicationRecordStatus(providedPlanningSnapshot) ??
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
function resolveMemoizedMembershipPublicationPlanningSnapshotSync(
  service,
  nodeId,
  observedAt,
  membershipPublication,
  membershipPublicationPlanningSnapshot,
) {
  const memoKey = nodeId || service.nodeId;
  const memo = service.membershipPublicationPlanningSnapshotMemoByNodeId;
  // Same version key as the projection memo: the floored planning
  // generation with the live publication (epoch, status) folded in. The raw
  // per-write revision rotated between consecutive reads under formation
  // churn and made this memo miss per call, minting fresh merge identities;
  // the publication component keeps the freshness the removed live veto
  // enforced, without a probe-forced miss on the hit path.
  const planningIdentity =
    service.readPlanningProjectionMemoIdentity(memoKey, observedAt);
  const sourceGeneration = planningIdentity ? null :
    service.readPlanningProjectionSourceGeneration(observedAt);
  if (memo && memoKey) {
    const cached = memo.get(memoKey);
    if (
      cached &&
      cached.fn === service.resolveMembershipPublicationPlanningSnapshot &&
      service.isReadinessPlanningMemoWithinStaleGrace(
        observedAt,
        cached.capturedAtMs,
      ) &&
      service.membershipPublicationPlanningMemoVersionKeyMatches(
        cached.versionKey,
        memoKey,
        sourceGeneration,
        planningIdentity,
      )
    ) {
      return cached.projection;
    }
  }
  const capturedAtMs = service.now();
  const projection = service.resolveMembershipPublicationPlanningSnapshot({
    nodeId,
    observedAt,
    membershipPublication,
    membershipPublicationPlanningSnapshot,
  });
  if (memo && memoKey) {
    memo.set(memoKey, {
      projection,
      capturedAtMs,
      versionKey: service.readMembershipPublicationPlanningMemoVersionKey(
        memoKey,
        observedAt,
      ),
      fn: service.resolveMembershipPublicationPlanningSnapshot,
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
function resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(service, context = {}) {
  const provided = context?.membershipPublicationPlanningSnapshot;
  const memo = service.membershipPublicationPlanningSnapshotContextMemo;
  if (!memo || !provided || typeof provided !== 'object') {
    return service.resolveMembershipPublicationPlanningSnapshot(context);
  }
  const membershipPublication = context?.membershipPublication ?? null;
  if (isResolvedNodePlanningAnswerForContext(
    service,
    provided,
    context,
    membershipPublication,
  )) {
    return provided;
  }
  const cached = memo.get(provided);
  if (
    cached !== undefined &&
    cached.membershipPublication === membershipPublication
  ) {
    return cached.projection;
  }
  const projection = service.resolveMembershipPublicationPlanningSnapshot(context);
  memo.set(provided, {projection, membershipPublication});
  return projection;
}

function resolveServiceMembershipPublicationPlanningSource(service, options = {}) {
  return resolveMembershipPublicationPlanningSource(
    options?.membershipPublicationPlanningSource,
  );
}

function shouldPersistReadinessSnapshot(service, options = {}) {
  return (
    service.resolveMembershipPublicationPlanningSource(options) !==
    MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
  );
}

function buildDirectMembershipPublicationPlanningAnswer(
  service,
  nodeId,
  observedAt,
  membershipPublication,
) {
  return service.resolvePriorityRecoveryPlanningAnswer(
    nodeId,
    observedAt,
    service.buildMembershipPublicationPlanningSnapshot({
      nodeId,
      observedAt,
      membershipPublication,
    }),
  );
}

async function resolveNodeMembershipPublicationPlanningAnswer(
  service,
  nodeId,
  observedAt,
  membershipPublication,
  options = {},
) {
  if (
    service.resolveMembershipPublicationPlanningSource(options) ===
    MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
  ) {
    return rememberResolvedNodePlanningAnswer(
      service,
      nodeId,
      observedAt,
      membershipPublication,
      service.buildDirectMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
      ),
    );
  }
  // The caller has already performed the async direct publication read;
  // the AVAILABLE planning projection itself has no reason to be async.
  return rememberResolvedNodePlanningAnswer(
    service,
    nodeId,
    observedAt,
    membershipPublication,
    service.resolveAvailableNodePlanningAnswer(
      nodeId,
      observedAt,
      membershipPublication,
    ),
  );
}

/**
 * The canonical AVAILABLE planning answer for one readiness evaluation.
 *
 * Both the async and the sync outer methods use this after their own
 * source-mode branching, so there is exactly one AVAILABLE implementation.
 * It merges against the SAME membershipPublication object the evaluation
 * already captured, which is what keeps the merge identity contract intact:
 * the async path used to reach the compatibility bestEffort surface
 * instead, recapturing planning state and producing a second, logically
 * equivalent but distinct product, so one readiness build merged twice.
 * The compatibility surface is for external callers; it is not an
 * owner-to-owner dependency.
 * @param {string} nodeId
 * @param {number} observedAt
 * @param {Object} membershipPublication - the captured direct row
 * @return {Object|null}
 * @private
 */
function resolveAvailableNodePlanningAnswer(service, nodeId, observedAt, membershipPublication) {
  return service.resolvePriorityRecoveryPlanningAnswer(
    nodeId,
    observedAt,
    // The MEMOIZED merge, never the raw one. The raw entry point bypasses
    // the CL-034 contract this owner already holds - publisher scoping,
    // floored planning currency, publication epoch and status folded into
    // freshness, frozen reuse while stable, invalidation on publication or
    // source-generation advance - and calling it per invocation multiplied
    // heavy planning builds roughly tenfold against their sealed bound.
    service.resolveMemoizedMembershipPublicationPlanningSnapshotSync(
      nodeId,
      observedAt,
      membershipPublication,
      service.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt),
    ),
  );
}

/**
 * Mark one final, concrete planning answer as resolved for exactly this
 * context. The marker describes the owner, node, observation time and the
 * FINAL direct membership-publication object, so a later consumer can
 * recognise a completed answer instead of merging it again. It is applied
 * only to a final answer, never to an intermediate candidate-derived one
 * carried across a subsequent direct-row resolution.
 * @param {string} nodeId
 * @param {number} observedAt
 * @param {Object} membershipPublication
 * @param {Object} answer
 * @return {Object} the same answer
 */
function markResolvedNodePlanningAnswer(
  service, nodeId, observedAt, membershipPublication, answer,
) {
  return rememberResolvedNodePlanningAnswer(
    service,
    nodeId,
    observedAt,
    membershipPublication,
    answer,
  );
}

function resolveNodeMembershipPublicationPlanningAnswerSync(
  service,
  nodeId,
  observedAt,
  membershipPublication,
  options = {},
) {
  if (
    service.resolveMembershipPublicationPlanningSource(options) ===
    MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
  ) {
    return rememberResolvedNodePlanningAnswer(
      service,
      nodeId,
      observedAt,
      membershipPublication,
      service.buildDirectMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
      ),
    );
  }
  return service.resolveAvailableNodePlanningAnswer(
    nodeId,
    observedAt,
    membershipPublication,
  );
}

function buildMembershipPublicationReadOptions(service, readOptions = {}) {
  return resolveMembershipPublicationReadOptions({
    lane: resolveMembershipPublicationReadLane(readOptions?.lane),
    queryTimeoutMs:
      Number.isFinite(readOptions?.queryTimeoutMs) &&
      readOptions.queryTimeoutMs > 0 ?
        readOptions.queryTimeoutMs :
        service.membershipPublicationDiagnosticsQueryTimeoutMs,
  });
}

function getLatestMembershipPublicationRowSync(service, nodeId, readOptions = {}) {
  const publicationService =
    readWiredCollaborator(service, COLLABORATOR.MEMBERSHIP_PUBLICATION);
  if (publicationService === UNWIRED) {
    return null;
  }
  const normalizedReadOptions =
    service.buildMembershipPublicationReadOptions(readOptions);
  const normalizedScope = resolveMembershipPublicationReadScope(
    readOptions?.scope,
  );
  if (normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER) {
    return publicationService.getLatestClusterPublicationSync(normalizedReadOptions);
  }
  return publicationService.getLatestPublicationForNodeSync(
    nodeId,
    normalizedReadOptions,
  );
}

async function getLatestMembershipPublicationRow(service, nodeId, readOptions = {}) {
  const publicationService =
    readWiredCollaborator(service, COLLABORATOR.MEMBERSHIP_PUBLICATION);
  if (publicationService === UNWIRED) {
    return null;
  }
  const normalizedReadOptions =
    service.buildMembershipPublicationReadOptions(readOptions);
  const normalizedScope = resolveMembershipPublicationReadScope(
    readOptions?.scope,
  );
  if (normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER) {
    return publicationService.getLatestClusterPublication(normalizedReadOptions);
  }
  return publicationService.getLatestPublicationForNode(nodeId, normalizedReadOptions);
}

function getLatestPublishedMembershipPublicationRowSync(service, readOptions = {}) {
  const publicationService =
    readWiredCollaborator(service, COLLABORATOR.MEMBERSHIP_PUBLICATION);
  if (publicationService === UNWIRED) {
    return null;
  }
  return publicationService.getLatestPublishedClusterPublicationSync(
    service.buildMembershipPublicationReadOptions(readOptions),
  );
}

export {
  resolveMembershipPublicationPlanningSnapshot,
  resolveMemoizedMembershipPublicationPlanningSnapshotSync,
  resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync,
  resolveServiceMembershipPublicationPlanningSource,
  shouldPersistReadinessSnapshot,
  buildDirectMembershipPublicationPlanningAnswer,
  resolveNodeMembershipPublicationPlanningAnswer,
  resolveAvailableNodePlanningAnswer,
  markResolvedNodePlanningAnswer,
  resolveNodeMembershipPublicationPlanningAnswerSync,
  buildMembershipPublicationReadOptions,
  getLatestMembershipPublicationRowSync,
  getLatestMembershipPublicationRow,
  getLatestPublishedMembershipPublicationRowSync,
};
