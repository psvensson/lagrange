import {ControlPlaneReadinessEvidenceReasons} from './control-plane-readiness-evidence-reasons.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';
import {trackSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';
import {
  PRIORITY_RECOVERY_PLANNING_PROJECTION,
} from './control-plane-readiness-constants.js';
import {planningIdentitiesEqual} from
  './readiness-planning-semantic-generation.js';

const PRIORITY_RECOVERY_PLANNING_PROJECTION_BUILD_SECTION =
  'priority_recovery_planning_projection_build';

// Structural walk bound for the planning-projection equality check. A genuine
// difference deeper than this reads as "not equal", so the bound can only
// DECLINE a canonical identity, never grant one.
const PLANNING_PROJECTION_EQUALITY_MAX_DEPTH = 12;

function planningCurrencyEquals(left, right) {
  if ((left && typeof left === 'object') ||
      (right && typeof right === 'object')) {
    return planningIdentitiesEqual(left, right);
  }
  return left === right;
}

// Reference-first structural equality for planning-projection content.
//
// The projection is literally `{...planningSnapshot, <derived overrides>}`, so
// every key it does NOT override is copied BY REFERENCE and settles in one
// `===`. Only the overridden keys are ever walked, nothing is stringified, and
// nothing is allocated beyond the key lists — cheap enough to run on the build
// path. Any shape it cannot decide (differing key sets, differing array-ness,
// excess depth) reads as NOT equal, which declines a canonical identity.
function planningProjectionValueEquals(left, right, depth) {
  if (left === right) {
    return true;
  }
  if (
    depth <= 0 ||
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  return leftKeys.every((key) => Object.hasOwn(right, key) &&
    planningProjectionValueEquals(left[key], right[key], depth - 1));
}

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
    const generation = this.readPlanningProjectionGenerationForCall(
      observedAt,
      nodeId,
    );
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
      planningCurrencyEquals(cached.generation, generation) &&
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

  // ONE identity owner for the canonical planning snapshot.
  //
  // Every planning-snapshot producer reaches this normalizer (as
  // normalizeMembershipPublicationPlanningSnapshot, as the merge tail, and as
  // the answer paths), so it is the only mint of a canonical planning
  // snapshot — and therefore owns that snapshot's IDENTITY. It previously
  // owned only the (input identity, floored generation) pair: every producer
  // that re-normalised an ALREADY canonical snapshot got a fresh, byte-equal
  // object back, so the input identity had no owner and every downstream
  // identity memo missed. Live evidence: 42762 gate builds across 33 seed
  // gaps (archived run 18-53-48-768Z-natural-manual); production-composition
  // rig evidence: 1430 of 2242 projection calls per 1000 owner builds were
  // re-normalisations of an already canonical snapshot.
  //
  // VERIFIED FIXED POINT. Re-normalising a canonical snapshot is OFTEN the
  // identity function on content — but far from always. A 21600-shape search of
  // the planning-snapshot space finds 15235 shapes (70.5%) whose second
  // normalisation differs from the first, and no cheap structural precondition
  // separates them: the narrowest candidate (status is a non-empty string AND
  // epoch is an integer) accepts 9770 shapes of which 3405 still diverge. So a
  // snapshot becomes canonical only once THIS call's real rebuild has been
  // observed to return content-equal to it. It is then recorded as its own
  // canonical answer — a SELF entry carrying no projection reference, so the
  // WeakMap never holds a back-reference to its own key and the entry dies with
  // the snapshot it describes. Shapes that fail verification never become
  // canonical and rebuild per call exactly as they did before this owner
  // existed. The verification costs no extra build: it compares the rebuild the
  // caller already asked for against the input it was derived from.
  //
  // FRESHNESS PARITY. Every entry is gated on the reference identity of the
  // three things the derivation actually reads — the admission fence, the
  // planning source cache and the membership publication owner — so an entry
  // can never outlive its inputs. A DERIVED entry hands back a different object
  // than the caller passed in, so it additionally carries the floored source
  // generation, exactly as this memo did before. A SELF entry does not: it is a
  // proof about one object, and readCanonicalPlanningProjection records why that
  // proof cannot expire with the generation.
  // The version key's LIVE publication component stays where it is
  // load-bearing and where it is paid for once per read rather than once per
  // projection call: the node-scoped planning memos
  // (resolveMemoizedPriorityRecoveryPlanningProjectionSync and the merge memo),
  // whose miss paths build UNCONDITIONALLY and so still mint a fresh identity
  // the instant a publication row moves without a table write — which is what
  // the sealed projection-planning identity observable pins.
  // Non-object inputs and unversioned caches keep per-call builds.
  buildPriorityRecoveryPlanningProjection(planningSnapshot = null, observedAt) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return this.buildTrackedPriorityRecoveryPlanningProjection(
        planningSnapshot,
      );
    }
    const generation = this.readPlanningProjectionGenerationForCall(
      observedAt,
      planningSnapshot.nodeId || planningSnapshot.publisherNodeId || this.nodeId,
    );
    if (generation === null) {
      return this.buildTrackedPriorityRecoveryPlanningProjection(
        planningSnapshot,
      );
    }
    const admissionEvidenceSource = this.getLocalClusterIncarnationFence();
    const canonical = this.readCanonicalPlanningProjection(
      planningSnapshot,
      generation,
      admissionEvidenceSource,
    );
    if (canonical) {
      return canonical;
    }
    return this.recordPlanningProjectionIdentity(
      planningSnapshot,
      this.buildTrackedPriorityRecoveryPlanningProjection(planningSnapshot),
      generation,
      admissionEvidenceSource,
    );
  }

  // Clock: prefer the caller's observedAt, else the service's injectable
  // clock — mixing Date.now into the shared floor latch alongside logical
  // caller clocks corrupts the latch ordering. Null when the composed owner
  // exposes no generation surface or the cache cannot version its tables:
  // identity reuse then disables and every call rebuilds, as it did before.
  readPlanningProjectionGenerationForCall(observedAt, nodeId = this.nodeId) {
    const currentIdentity =
      typeof this.readCurrentPlanningProjectionIdentity === 'function' &&
      typeof nodeId === 'string' ?
        this.readCurrentPlanningProjectionIdentity(nodeId) :
        null;
    if (currentIdentity) {
      return currentIdentity;
    }
    const observedAtMs = normalizeDiagnosticTimestampMs(observedAt) ??
      (typeof this.now === 'function' ? this.now() : null);
    if (typeof this.readPlanningProjectionSourceGeneration !== 'function') {
      return null;
    }
    return this.readPlanningProjectionSourceGeneration(
      observedAtMs,
    );
  }

  // The canonical answer this snapshot's identity entry serves, or null when
  // there is none current.
  //
  // The entry names EVERY owner it was derived from, so it can never outlive
  // its inputs: a replacement system-table cache can present IDENTICAL table
  // mutation counters, and a replacement membership owner reads different
  // publications, so neither is separable by the floored generation alone. A
  // snapshot retained across either swap therefore misses and re-derives.
  //
  // A SELF entry (projection === null) is a VERIFIED proof that this snapshot
  // is its own canonical projection, and that proof does not expire with the
  // floored generation. buildPriorityRecoveryPlanningProjectionUntracked is a
  // pure function of exactly three things — the snapshot, this node's id, and
  // the admission fence: its gate builder (publication-recovery-gate.js) reads
  // no clock, no cache and no instance state, and its two helpers
  // (resolvePendingAckEvidenceStateFromSources,
  // filterPriorityRecoveryReasonCodesForPublicationGate) are pure in their
  // arguments. The snapshot is the WeakMap key, the node id is fixed for the
  // instance, and the fence is compared above — so a rebuild here would return
  // the same content it returned when the proof was taken, whatever the
  // generation now is. The generation still gates the DERIVED entry below,
  // where reuse hands back a different object than the caller passed in.
  readCanonicalPlanningProjection(
    planningSnapshot,
    generation,
    admissionEvidenceSource,
  ) {
    const cached = this.planningProjectionByInputSnapshot?.get(
      planningSnapshot,
    );
    if (
      !cached ||
      cached.admissionEvidenceSource !== admissionEvidenceSource ||
      cached.planningSourceCache !== this.systemTableCache ||
      cached.membershipPublicationOwner !== this.membershipPublicationService
    ) {
      return null;
    }
    if (cached.projection === null) {
      return planningSnapshot;
    }
    return planningCurrencyEquals(cached.generation, generation) ?
      cached.projection : null;
  }

  // Install this call's identity entry, and grant a canonical identity ONLY
  // when this call's own rebuild VERIFIED it. The caller always receives the
  // rebuild, exactly as it did before this owner existed; what the entry buys
  // is that the NEXT re-normalisation of either object is served rather than
  // minting the next link of a fresh-object chain.
  //
  // Normalisation is NOT universally idempotent. buildPublicationRecoveryGateSnapshot
  // spreads the gate the projection already derived back through its
  // provided-owner-stream branch, which defaults an ABSENT publication status or
  // epoch to UNKNOWN/0 on that second pass but to null on the first. A snapshot
  // carrying no status string or no finite epoch therefore re-normalises to
  // different owner-visible content (publicationStatus null -> "UNKNOWN",
  // publicationEpoch null -> 0, and the same pair plus publicationStatusNormalized
  // inside publicationRecoveryGate) — measured on release-0.2 formation paths
  // reached through buildPriorityControlPlaneRecoveryProjection, where
  // publicationEpoch null-vs-0 is decision-bearing for
  // isRetainedPublicationEpochAhead.
  //
  // So the fixed point is VERIFIED, never assumed: a SELF entry is installed only
  // when the rebuild the caller already asked for came back content-equal to the
  // input it was derived from. Shapes that fail the check never become canonical
  // and keep rebuilding exactly as they did before this owner existed. The
  // verification costs no extra build — it compares two objects the call already
  // holds.
  recordPlanningProjectionIdentity(
    planningSnapshot,
    projection,
    generation,
    admissionEvidenceSource,
  ) {
    if (!projection || typeof projection !== 'object') {
      return projection;
    }
    if (!this.planningProjectionByInputSnapshot) {
      this.planningProjectionByInputSnapshot = new WeakMap();
    }
    const entry = {
      generation,
      admissionEvidenceSource,
      planningSourceCache: this.systemTableCache,
      membershipPublicationOwner: this.membershipPublicationService,
      projection: null,
    };
    if (planningProjectionValueEquals(
      projection,
      planningSnapshot,
      PLANNING_PROJECTION_EQUALITY_MAX_DEPTH,
    )) {
      // Verified: the input already IS its own canonical projection, so it
      // becomes the one identity every later re-normalisation is served. The
      // rebuild is canonical too, and by the SAME proof: the projection is a
      // pure function of its input's content, and this rebuild's content was
      // just shown equal to that input's, so re-normalising the rebuild must
      // return the rebuild. Recording both keeps the caller that already holds
      // one of them from starting a fresh chain.
      this.planningProjectionByInputSnapshot.set(planningSnapshot, entry);
      this.planningProjectionByInputSnapshot.set(projection, entry);
      return projection;
    }
    this.planningProjectionByInputSnapshot.set(planningSnapshot, {
      ...entry,
      projection,
    });
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
