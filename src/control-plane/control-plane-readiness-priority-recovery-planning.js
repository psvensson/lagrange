import {ControlPlaneReadinessEvidenceReasons} from './control-plane-readiness-evidence-reasons.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';
import {trackSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';
import {
  PRIORITY_RECOVERY_PLANNING_PROJECTION,
} from './control-plane-readiness-constants.js';

const PRIORITY_RECOVERY_PLANNING_PROJECTION_BUILD_SECTION =
  'priority_recovery_planning_projection_build';

const {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  RECOVERY_PROTOCOL_STATE,
  STARTUP_AUTHORITY_ADMISSION_STATE,
  buildPublicationRecoveryGateSnapshot,
  normalizeDiagnosticTimestampMs,
  resolvePendingAckEvidenceStateFromSources,
} = SHARED;

class ControlPlaneReadinessPriorityRecoveryPlanning extends ControlPlaneReadinessEvidenceReasons {
  getLocalClusterIncarnationFence() {
    if (
      typeof this.localClusterIncarnationFenceProvider !== 'function'
    ) {
      return null;
    }
    const clusterIncarnationFence = this.localClusterIncarnationFenceProvider();
    return clusterIncarnationFence &&
      typeof clusterIncarnationFence === 'object' ?
      clusterIncarnationFence :
      null;
  }

  resolveLocalPlanningAdmissionEvidence(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }
    const targetNodeId =
      typeof planningSnapshot.targetNodeId === 'string' &&
        planningSnapshot.targetNodeId.length > 0 ?
        planningSnapshot.targetNodeId :
        typeof planningSnapshot.publisherNodeId === 'string' &&
          planningSnapshot.publisherNodeId.length > 0 ?
          planningSnapshot.publisherNodeId :
          null;
    if (targetNodeId !== this.nodeId) {
      return null;
    }
    const clusterIncarnationFence = this.getLocalClusterIncarnationFence();
    if (!clusterIncarnationFence) {
      return null;
    }
    const admissionReasonCodes = Object.freeze(
      [...new Set(
        (Array.isArray(clusterIncarnationFence.reasonCodes) ?
          clusterIncarnationFence.reasonCodes :
          [])
          .filter((reasonCode) =>
            typeof reasonCode === 'string' &&
            reasonCode.length > 0),
      )],
    );
    return Object.freeze({
      admissionState:
        clusterIncarnationFence.allowed === true ?
          STARTUP_AUTHORITY_ADMISSION_STATE.ADMITTED :
          STARTUP_AUTHORITY_ADMISSION_STATE.BLOCKED,
      admissionReasonCodes,
      clusterIncarnationFence,
    });
  }

  // One answer per (input-snapshot identity, node, floored generation).
  // The projection-entry memo cannot stabilize the retained-merge tail: it
  // spreads a fresh merge input per call whenever an active retained
  // snapshot overlays an incomplete resolution — the exact shape the live
  // per-node readiness evaluations drive at storm rates (round-6 census:
  // 228/228 fresh answers per cycle; live gap windows carried 98k gate and
  // 203k projection builds on a run that still passed both sealed bars on
  // VM speed alone). Store/clear side-effects are idempotent and their
  // grace timestamps tolerate the 250ms window by the same sealed bound.
  resolvePriorityRecoveryPlanningAnswer(
    nodeId,
    observedAt,
    planningSnapshot = null,
  ) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return this.resolvePriorityRecoveryPlanningAnswerUncached(
        nodeId,
        observedAt,
        planningSnapshot,
      );
    }
    if (!this.planningAnswerMemoByInputSnapshot) {
      this.planningAnswerMemoByInputSnapshot = new WeakMap();
    }
    const generation =
      typeof this.readPlanningProjectionSourceGeneration === 'function' ?
        this.readPlanningProjectionSourceGeneration(
          observedAt ??
            (typeof this.now === 'function' ? this.now() : undefined),
        ) :
        null;
    // The answer also depends on the retained active snapshot, which other
    // paths (the async best-effort flow) mutate between calls — key on its
    // identity at entry so a fresher retained witness always re-merges.
    const retainedAtEntry = this.getActivePriorityRecoveryPlanningSnapshot(
      nodeId,
      observedAt,
    );
    const cached = this.readMemoizedPlanningAnswer(
      planningSnapshot,
      nodeId,
      generation,
      retainedAtEntry,
    );
    if (cached) {
      return cached.answer;
    }
    const answer = this.resolvePriorityRecoveryPlanningAnswerUncached(
      nodeId,
      observedAt,
      planningSnapshot,
    );
    this.storeMemoizedPlanningAnswer(
      planningSnapshot,
      nodeId,
      generation,
      retainedAtEntry,
      answer,
    );
    return answer;
  }

  readMemoizedPlanningAnswer(
    planningSnapshot,
    nodeId,
    generation,
    retainedAtEntry,
  ) {
    if (generation === null) {
      return null;
    }
    const byNode = this.planningAnswerMemoByInputSnapshot.get(
      planningSnapshot,
    );
    const cached = byNode ? byNode.get(nodeId) : undefined;
    if (
      cached &&
      cached.generation === generation &&
      cached.retainedAtEntry === retainedAtEntry
    ) {
      return cached;
    }
    return null;
  }

  storeMemoizedPlanningAnswer(
    planningSnapshot,
    nodeId,
    generation,
    retainedAtEntry,
    answer,
  ) {
    if (generation === null) {
      return;
    }
    let byNode = this.planningAnswerMemoByInputSnapshot.get(planningSnapshot);
    if (!byNode) {
      byNode = new Map();
      this.planningAnswerMemoByInputSnapshot.set(planningSnapshot, byNode);
    }
    byNode.set(nodeId, {generation, retainedAtEntry, answer});
  }

  resolvePriorityRecoveryPlanningAnswerUncached(
    nodeId,
    observedAt,
    planningSnapshot = null,
  ) {
    const resolvedPlanningSnapshot =
      this.buildPriorityRecoveryPlanningProjection(
        planningSnapshot,
        observedAt,
      );
    if (this.isPriorityControlPlaneRecoveryActive(resolvedPlanningSnapshot)) {
      this.storeActivePriorityRecoveryPlanningSnapshot(
        nodeId,
        resolvedPlanningSnapshot,
        observedAt,
      );
      return resolvedPlanningSnapshot;
    }
    const retainedSnapshot = this.getActivePriorityRecoveryPlanningSnapshot(
      nodeId,
      observedAt,
    );
    if (
      !this.isPriorityRecoveryPlanningSnapshotIncomplete(resolvedPlanningSnapshot)
    ) {
      return this.shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(
        resolvedPlanningSnapshot,
        retainedSnapshot,
      ) ?
        retainedSnapshot :
        resolvedPlanningSnapshot;
    }
    if (!retainedSnapshot) {
      return resolvedPlanningSnapshot;
    }
    if (
      !resolvedPlanningSnapshot ||
      typeof resolvedPlanningSnapshot !== 'object'
    ) {
      return retainedSnapshot;
    }
    return this.buildPriorityRecoveryPlanningProjection({
      ...resolvedPlanningSnapshot,
      publicationRecoveryGate: this.buildRetainedPriorityRecoveryPlanningGate(
        resolvedPlanningSnapshot,
        retainedSnapshot,
      ),
    });
  }

  isPriorityRecoveryPlanningSnapshotIncomplete(planningSnapshot = null) {
    return !this.hasMembershipPublicationRecoveryGateEvidence(planningSnapshot);
  }

  storeActivePriorityRecoveryPlanningSnapshot(
    nodeId,
    planningSnapshot,
    observedAt,
  ) {
    if (
      !nodeId ||
      !planningSnapshot ||
      typeof planningSnapshot !== 'object'
    ) {
      return;
    }
    const observedAtMs =
      normalizeDiagnosticTimestampMs(observedAt) ?? this.now();
    this.lastActivePriorityRecoveryPlanningSnapshotByNodeId.set(
      nodeId,
      planningSnapshot,
    );
    this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId.set(
      nodeId,
      observedAtMs,
    );
  }

  getActivePriorityRecoveryPlanningSnapshot(nodeId, observedAt) {
    const planningSnapshot =
      this.lastActivePriorityRecoveryPlanningSnapshotByNodeId.get(nodeId) ||
      null;
    const observedAtMs =
      this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId.get(nodeId) ||
      null;
    if (!planningSnapshot || !Number.isFinite(observedAtMs)) {
      return null;
    }
    const referenceObservedAtMs =
      normalizeDiagnosticTimestampMs(observedAt) ?? this.now();
    if (
      referenceObservedAtMs - observedAtMs >
      this.membershipPublicationPlanningActiveStaleGraceMs
    ) {
      return null;
    }
    return planningSnapshot;
  }

  clearActivePriorityRecoveryPlanningSnapshot(nodeId) {
    if (!nodeId) {
      return;
    }
    this.lastActivePriorityRecoveryPlanningSnapshotByNodeId.delete(nodeId);
    this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId.delete(nodeId);
  }

  getPriorityRecoveryPlanningPublicationEpoch(planningSnapshot = null) {
    const publicationEpoch = Number(planningSnapshot?.publicationEpoch);
    return Number.isInteger(publicationEpoch) && publicationEpoch >= 0 ?
      publicationEpoch :
      null;
  }

  getPriorityRecoveryDecisionSnapshotsPublicationEpoch(planningSnapshot = null) {
    const publicationEpoch = Number(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.publicationEpoch,
    );
    return Number.isInteger(publicationEpoch) && publicationEpoch >= 0 ?
      publicationEpoch :
      null;
  }

  shouldUseDirectReadyGateForMembershipPublicationPlanningMerge(
    directPlanningSnapshot = null,
    providedPlanningSnapshot = null,
  ) {
    const directPriorityRecoveryProjection =
      this.buildPriorityRecoveryPlanningProjection(directPlanningSnapshot);
    if (directPriorityRecoveryProjection?.publicationRecoveryGate?.ready !== true) {
      return false;
    }
    if (!this.isPriorityControlPlaneRecoveryActive(providedPlanningSnapshot)) {
      return false;
    }
    const directPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(
        directPriorityRecoveryProjection,
      );
    const providedPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(providedPlanningSnapshot);
    if (!Number.isInteger(directPublicationEpoch)) {
      return false;
    }
    if (!Number.isInteger(providedPublicationEpoch)) {
      return true;
    }
    return directPublicationEpoch >= providedPublicationEpoch;
  }

  shouldUseProvidedReadyGateForMembershipPublicationPlanningMerge(
    directPlanningSnapshot = null,
    providedPlanningSnapshot = null,
  ) {
    const directPriorityRecoveryProjection =
      this.buildPriorityRecoveryPlanningProjection(directPlanningSnapshot);
    const providedPriorityRecoveryProjection =
      this.buildPriorityRecoveryPlanningProjection(providedPlanningSnapshot);
    const providedPublicationRecoveryGate =
      providedPriorityRecoveryProjection?.publicationRecoveryGate || null;
    if (providedPublicationRecoveryGate?.ready !== true) {
      return false;
    }
    const hasAckDebtEvidence = (planningSnapshot = null) => {
      const publicationRecoveryGate =
        planningSnapshot?.publicationRecoveryGate || null;
      const pendingAckCount = Number(
        planningSnapshot?.pendingAckCount ??
        publicationRecoveryGate?.pendingAckCount ??
        0,
      );
      return (
        (Number.isFinite(pendingAckCount) && pendingAckCount > 0) ||
        (
          Array.isArray(planningSnapshot?.requiredAckNodeIds) &&
          planningSnapshot.requiredAckNodeIds.length > 0
        ) ||
        (
          Array.isArray(publicationRecoveryGate?.requiredAckNodeIds) &&
          publicationRecoveryGate.requiredAckNodeIds.length > 0
        ) ||
        (
          Array.isArray(planningSnapshot?.pendingAckNodeIds) &&
          planningSnapshot.pendingAckNodeIds.length > 0
        ) ||
        (
          Array.isArray(publicationRecoveryGate?.pendingAckNodeIds) &&
          publicationRecoveryGate.pendingAckNodeIds.length > 0
        )
      );
    };
    if (
      hasAckDebtEvidence(directPriorityRecoveryProjection) ||
      hasAckDebtEvidence(providedPriorityRecoveryProjection)
    ) {
      return false;
    }
    const directPublicationStatus =
      directPriorityRecoveryProjection?.publicationStatus ||
      directPriorityRecoveryProjection?.status ||
      null;
    const providedPublicationStatus =
      providedPriorityRecoveryProjection?.publicationStatus ||
      providedPriorityRecoveryProjection?.status ||
      providedPublicationRecoveryGate?.publicationStatus ||
      null;
    if (
      String(directPublicationStatus || '').toUpperCase() !==
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    ) {
      return false;
    }
    if (
      String(providedPublicationStatus || '').toUpperCase() !==
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    ) {
      return false;
    }
    if (
      directPriorityRecoveryProjection?.recoveryProtocolState !==
      RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION
    ) {
      return false;
    }
    const directPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(
        directPriorityRecoveryProjection,
      );
    const providedPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(
        providedPriorityRecoveryProjection,
      );
    if (!Number.isInteger(providedPublicationEpoch)) {
      return false;
    }
    return !Number.isInteger(directPublicationEpoch) ||
      providedPublicationEpoch >= directPublicationEpoch;
  }

  shouldPreferDirectPublicationStatusForMembershipPublicationPlanningMerge(
    directPlanningSnapshot = null,
    providedPlanningSnapshot = null,
    publicationConvergenceGate = null,
  ) {
    const directPublicationStatus =
      typeof directPlanningSnapshot?.publicationStatus === 'string' &&
        directPlanningSnapshot.publicationStatus.length > 0 ?
        directPlanningSnapshot.publicationStatus :
        typeof directPlanningSnapshot?.status === 'string' &&
            directPlanningSnapshot.status.length > 0 ?
          directPlanningSnapshot.status :
          null;
    if (!directPublicationStatus) {
      return false;
    }
    const directPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(directPlanningSnapshot);
    if (!Number.isInteger(directPublicationEpoch)) {
      return false;
    }
    const gatePublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(
        publicationConvergenceGate,
      );
    if (!Number.isInteger(gatePublicationEpoch)) {
      const providedPublicationEpoch =
        this.getPriorityRecoveryPlanningPublicationEpoch(
          providedPlanningSnapshot,
        );
      return !Number.isInteger(providedPublicationEpoch) ||
        directPublicationEpoch >= providedPublicationEpoch;
    }
    return directPublicationEpoch >= gatePublicationEpoch;
  }

  shouldUseProvidedPriorityRecoveryDecisionSnapshotsForMembershipPublicationPlanningMerge(
    directPlanningSnapshot = null,
    providedPlanningSnapshot = null,
    publicationConvergenceGate = null,
  ) {
    const providedDecisionSnapshotsPublicationEpoch =
      this.getPriorityRecoveryDecisionSnapshotsPublicationEpoch(
        providedPlanningSnapshot,
      );
    if (!Number.isInteger(providedDecisionSnapshotsPublicationEpoch)) {
      return true;
    }
    const directPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(directPlanningSnapshot) ??
      this.getPriorityRecoveryPlanningPublicationEpoch(
        publicationConvergenceGate,
      );
    if (!Number.isInteger(directPublicationEpoch)) {
      return true;
    }
    return directPublicationEpoch <= providedDecisionSnapshotsPublicationEpoch;
  }

  shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(
    planningSnapshot = null,
    retainedSnapshot = null,
  ) {
    if (
      !this.isPriorityControlPlaneRecoveryActive(retainedSnapshot) ||
      this.isPriorityControlPlaneRecoveryActive(planningSnapshot)
    ) {
      return false;
    }
    const retainedPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(retainedSnapshot);
    const currentPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(planningSnapshot);
    if (!Number.isInteger(retainedPublicationEpoch)) {
      return false;
    }
    if (!Number.isInteger(currentPublicationEpoch)) {
      return true;
    }
    return currentPublicationEpoch < retainedPublicationEpoch;
  }

  getMembershipPublicationRecoveryGate(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }
    return planningSnapshot.publicationRecoveryGate &&
      typeof planningSnapshot.publicationRecoveryGate === 'object' ?
      planningSnapshot.publicationRecoveryGate :
      null;
  }

  resolvePlanningPendingAckEvidenceState(
    planningSnapshot = null,
    publicationRecoveryGate = null,
  ) {
    return resolvePendingAckEvidenceStateFromSources([
      planningSnapshot,
      publicationRecoveryGate,
    ]);
  }

  resolveRetainedPendingAckEvidenceState(
    planningSnapshot = null,
    retainedSnapshot = null,
    planningGate = null,
    retainedGate = null,
  ) {
    if (Array.isArray(planningSnapshot?.requiredAckNodeIds)) {
      return PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST;
    }
    if (Array.isArray(retainedSnapshot?.requiredAckNodeIds)) {
      return PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST;
    }
    const planningGateState = this.resolvePlanningPendingAckEvidenceState(
      null,
      planningGate,
    );
    if (
      planningGateState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST
    ) {
      return planningGateState;
    }
    return this.resolvePlanningPendingAckEvidenceState(null, retainedGate);
  }

  filterPriorityRecoveryReasonCodesForPublicationGate(
    reasonCodes = [],
    publicationRecoveryGate = null,
  ) {
    const retainedReasonCodes = [];
    const retainedReasonCodeSet = new Set();
    for (const reasonCode of Array.isArray(reasonCodes) ? reasonCodes : []) {
      if (
        typeof reasonCode !== 'string' ||
        reasonCode.length === 0
      ) {
        continue;
      }
      if (
        reasonCode ===
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD &&
        publicationRecoveryGate?.prioritySpreadPending !== true
      ) {
        continue;
      }
      if (!retainedReasonCodeSet.has(reasonCode)) {
        retainedReasonCodes.push(reasonCode);
        retainedReasonCodeSet.add(reasonCode);
      }
    }
    return Object.freeze(retainedReasonCodes);
  }

  // One projection per (input-snapshot identity, floored generation) at the
  // single entry every caller shares — the answer paths, the merge-decision
  // helpers that re-project the same snapshot several times per merge, and
  // the brand-gated predicates. Rebuilding per call minted a fresh identity
  // per read that defeated every downstream identity memo (live evidence:
  // 42762 gate builds across 33 seed gaps, archived run
  // 18-53-48-768Z-natural-manual). The projection derives from the snapshot
  // plus cache-backed evidence, both covered by the floored generation;
  // non-object inputs and unversioned caches keep per-call builds.
  buildPriorityRecoveryPlanningProjection(planningSnapshot = null, observedAt) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return this.buildTrackedPriorityRecoveryPlanningProjection(
        planningSnapshot,
      );
    }
    if (!this.planningProjectionByInputSnapshot) {
      this.planningProjectionByInputSnapshot = new WeakMap();
    }
    // Clock: prefer the caller's observedAt, else the service's injectable
    // clock — mixing Date.now into the shared floor latch alongside logical
    // caller clocks corrupts the latch ordering.
    const generation =
      typeof this.readPlanningProjectionSourceGeneration === 'function' ?
        this.readPlanningProjectionSourceGeneration(
          observedAt ??
            (typeof this.now === 'function' ? this.now() : undefined),
        ) :
        null;
    const cached = this.planningProjectionByInputSnapshot.get(
      planningSnapshot,
    );
    if (cached && generation !== null && cached.generation === generation) {
      return cached.projection;
    }
    const projection = this.buildTrackedPriorityRecoveryPlanningProjection(
      planningSnapshot,
    );
    if (generation !== null) {
      this.planningProjectionByInputSnapshot.set(planningSnapshot, {
        generation,
        projection,
      });
    }
    return projection;
  }

  buildTrackedPriorityRecoveryPlanningProjection(planningSnapshot) {
    // Sync-section attribution (instrumentation-only, quest
    // publication-recovery-snapshot-starvation-relief): profiled as part of
    // the dominant seed event-loop cost; the count measures how often the
    // projection is actually rebuilt (CL-033/CL-034 memo misses included).
    return trackSyncSection(
      PRIORITY_RECOVERY_PLANNING_PROJECTION_BUILD_SECTION,
      () => this.buildPriorityRecoveryPlanningProjectionUntracked(
        planningSnapshot,
      ),
    );
  }

  buildPriorityRecoveryPlanningProjectionUntracked(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }
    const localPlanningAdmission =
      this.resolveLocalPlanningAdmissionEvidence(planningSnapshot);
    // The gate is a pure derivation of the planning snapshot (the provided
    // gate is read off the snapshot itself), and the shipped
    // planning-derivation memo returns the same frozen snapshot until a
    // source-table write rotates the version key — snapshot identity is an
    // exact memo key. Live profiling counted thousands of these rebuilds
    // per freeze burst, each minting fresh spread-copied records that
    // defeated the projection-evidence identity retention downstream.
    // Inline (not extracted) so the sealed complexity ratchet keeps one
    // over-threshold function here instead of two.
    if (!this.planningPublicationRecoveryGateMemo) {
      this.planningPublicationRecoveryGateMemo = new WeakMap();
    }
    let publicationRecoveryGate =
      this.planningPublicationRecoveryGateMemo.get(planningSnapshot);
    if (!publicationRecoveryGate) {
      const providedPublicationRecoveryGate =
        this.getMembershipPublicationRecoveryGate(planningSnapshot);
      publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
        ...(providedPublicationRecoveryGate || {}),
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            Math.floor(planningSnapshot.publicationEpoch) :
            providedPublicationRecoveryGate?.publicationEpoch ??
            null,
        publicationStatus:
          typeof planningSnapshot.publicationStatus === 'string' &&
            planningSnapshot.publicationStatus.length > 0 ?
            planningSnapshot.publicationStatus :
            typeof planningSnapshot.status === 'string' &&
              planningSnapshot.status.length > 0 ?
              planningSnapshot.status :
              providedPublicationRecoveryGate?.publicationStatus ??
              null,
        publicationObservationState:
          typeof planningSnapshot.publicationObservationState === 'string' &&
            planningSnapshot.publicationObservationState.length > 0 ?
            planningSnapshot.publicationObservationState :
            providedPublicationRecoveryGate?.publicationObservationState ??
            null,
        recoveryProtocolState:
          typeof planningSnapshot.recoveryProtocolState === 'string' &&
            planningSnapshot.recoveryProtocolState.length > 0 ?
            planningSnapshot.recoveryProtocolState :
            providedPublicationRecoveryGate?.recoveryProtocolState ??
            null,
        priorityRecoveryReasonCodes:
          Array.isArray(planningSnapshot.priorityRecoveryReasonCodes) ?
            planningSnapshot.priorityRecoveryReasonCodes :
            providedPublicationRecoveryGate?.reasonCodes,
        priorityPartitionSummary:
          planningSnapshot.priorityPartitionSummary &&
            typeof planningSnapshot.priorityPartitionSummary === 'object' ?
            planningSnapshot.priorityPartitionSummary :
            providedPublicationRecoveryGate?.priorityPartitionSummary ??
            null,
        priorityRecoveryClosureWitness:
          planningSnapshot.priorityRecoveryClosureWitness &&
            typeof planningSnapshot.priorityRecoveryClosureWitness ===
              'object' ?
            planningSnapshot.priorityRecoveryClosureWitness :
            providedPublicationRecoveryGate?.priorityRecoveryClosureWitness ??
            null,
        requiredAckNodeIds:
          Array.isArray(planningSnapshot.requiredAckNodeIds) ?
            planningSnapshot.requiredAckNodeIds :
            providedPublicationRecoveryGate?.requiredAckNodeIds ??
            [],
        acknowledgedNodeIds:
          Array.isArray(planningSnapshot.acknowledgedNodeIds) ?
            planningSnapshot.acknowledgedNodeIds :
            providedPublicationRecoveryGate?.acknowledgedNodeIds ??
            [],
        pendingAckNodeIds:
          Array.isArray(planningSnapshot.pendingAckNodeIds) ?
            planningSnapshot.pendingAckNodeIds :
            providedPublicationRecoveryGate?.pendingAckNodeIds ??
            [],
        pendingAckCount:
          planningSnapshot.pendingAckCount ??
          providedPublicationRecoveryGate?.pendingAckCount ??
          0,
        pendingAckEvidenceState: this.resolvePlanningPendingAckEvidenceState(
          planningSnapshot,
          providedPublicationRecoveryGate,
        ),
        missingPublishedNodeIds:
          Array.isArray(planningSnapshot.missingPublishedNodeIds) ?
            planningSnapshot.missingPublishedNodeIds :
            Array.isArray(
              planningSnapshot.missingPublishedRecoveryActiveNodeIds,
            ) ?
              planningSnapshot.missingPublishedRecoveryActiveNodeIds :
              providedPublicationRecoveryGate?.missingPublishedNodeIds ??
              [],
        publicationExcludesTargetNode:
          typeof planningSnapshot.publicationExcludesTargetNode === 'boolean' ?
            planningSnapshot.publicationExcludesTargetNode :
            providedPublicationRecoveryGate?.publicationExcludesTargetNode === true,
      });
      this.planningPublicationRecoveryGateMemo.set(
        planningSnapshot,
        publicationRecoveryGate,
      );
    }
    const priorityRecoveryReasonCodes =
      this.filterPriorityRecoveryReasonCodesForPublicationGate(
        [
          ...(Array.isArray(publicationRecoveryGate?.reasonCodes) ?
            publicationRecoveryGate.reasonCodes :
            []),
          ...(Array.isArray(planningSnapshot.priorityRecoveryReasonCodes) ?
            planningSnapshot.priorityRecoveryReasonCodes :
            []),
        ],
        publicationRecoveryGate,
      );
    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === 'object' ?
        planningSnapshot.priorityPartitionSummary :
        publicationRecoveryGate?.priorityPartitionSummary || null;
    const publicationObservationState =
      typeof planningSnapshot.publicationObservationState === 'string' &&
      planningSnapshot.publicationObservationState.length > 0 ?
        planningSnapshot.publicationObservationState :
        publicationRecoveryGate?.publicationObservationState || null;
    const publicationStatus =
      typeof planningSnapshot.publicationStatus === 'string' &&
      planningSnapshot.publicationStatus.length > 0 ?
        planningSnapshot.publicationStatus :
        typeof planningSnapshot.status === 'string' &&
            planningSnapshot.status.length > 0 ?
          planningSnapshot.status :
          publicationRecoveryGate?.publicationStatus || null;
    const recoveryProtocolState =
      typeof planningSnapshot.recoveryProtocolState === 'string' &&
      planningSnapshot.recoveryProtocolState.length > 0 ?
        planningSnapshot.recoveryProtocolState :
        publicationRecoveryGate?.recoveryProtocolState || null;
    const publicationEpoch = Number.isFinite(planningSnapshot.publicationEpoch) ?
      Math.floor(planningSnapshot.publicationEpoch) :
      Number.isFinite(publicationRecoveryGate?.publicationEpoch) ?
        Math.floor(publicationRecoveryGate.publicationEpoch) :
        null;
    const admissionState =
      typeof planningSnapshot.admissionState === 'string' &&
        planningSnapshot.admissionState.length > 0 ?
        planningSnapshot.admissionState :
        typeof localPlanningAdmission?.admissionState === 'string' ?
          localPlanningAdmission.admissionState :
          null;
    const admissionReasonCodes = Array.isArray(
      planningSnapshot.admissionReasonCodes,
    ) ?
      planningSnapshot.admissionReasonCodes :
      Array.isArray(localPlanningAdmission?.admissionReasonCodes) ?
        localPlanningAdmission.admissionReasonCodes :
        null;
    const clusterIncarnationFence =
      planningSnapshot.clusterIncarnationFence &&
        typeof planningSnapshot.clusterIncarnationFence === 'object' ?
        planningSnapshot.clusterIncarnationFence :
        localPlanningAdmission?.clusterIncarnationFence || null;
    const projection = {
      ...planningSnapshot,
      publicationEpoch,
      publicationRecoveryGate,
      publicationObservationState,
      publicationStatus,
      requiredAckNodeIds:
        Array.isArray(publicationRecoveryGate?.requiredAckNodeIds) ?
          publicationRecoveryGate.requiredAckNodeIds :
          planningSnapshot.requiredAckNodeIds,
      acknowledgedNodeIds:
        Array.isArray(publicationRecoveryGate?.acknowledgedNodeIds) ?
          publicationRecoveryGate.acknowledgedNodeIds :
          planningSnapshot.acknowledgedNodeIds,
      pendingAckNodeIds:
        Array.isArray(publicationRecoveryGate?.pendingAckNodeIds) ?
          publicationRecoveryGate.pendingAckNodeIds :
          planningSnapshot.pendingAckNodeIds,
      pendingAckCount:
        publicationRecoveryGate?.pendingAckCount ??
        planningSnapshot.pendingAckCount,
      pendingAckEvidenceState:
        publicationRecoveryGate?.pendingAckEvidenceState ??
        planningSnapshot.pendingAckEvidenceState,
      priorityRecoveryReasonCodes,
      priorityPartitionSummary,
      priorityRecoveryActive: publicationRecoveryGate?.active === true,
      recoveryProtocolState,
      ...(admissionState !== null ? {admissionState} : {}),
      ...(admissionReasonCodes !== null ? {admissionReasonCodes} : {}),
      ...(clusterIncarnationFence ? {clusterIncarnationFence} : {}),
    };
    Object.defineProperty(
      projection,
      PRIORITY_RECOVERY_PLANNING_PROJECTION,
      {value: true},
    );
    return Object.freeze(projection);
  }
}

export {ControlPlaneReadinessPriorityRecoveryPlanning};
