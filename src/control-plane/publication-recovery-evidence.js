import {deepFreeze} from '../utils/deep-freeze.js';
import {
  isRecord,
  PUBLICATION_RECOVERY_LEASE_DEFAULT_DURATION_MS,
} from './publication-recovery-evidence-normalizers.js';
import {
  buildCanonicalPublicationConvergenceGate,
  buildCanonicalPriorityRecoveryObservation,
  buildCanonicalPublicationConvergence,
  isRecursivelyImmutableOwnData,
} from './publication-recovery-evidence-builders.js';

const RECOVERY_PREEMPTION_DECISION = Object.freeze({
  CONTINUE: 'continue',
  PREEMPT_AND_BYPASS: 'preempt_and_bypass',
});
const RECOVERY_PREEMPTION_REASON = Object.freeze({
  DOWNSTREAM_HANDOFF_PENDING:
    'Downstream active-gate reconcile handoff is pending.',
  LOCAL_EPOCH_STALE: 'Local coordination epoch is stale.',
  NO_ACTIVE_TRIGGERS: 'No active preemption triggers detected.',
});

class TopologyEpochFencer {
  constructor(currentEpoch = 0) {
    this.currentEpoch = Number(currentEpoch) || 0;
  }

  advanceEpoch() {
    this.currentEpoch += 1;
    return this.currentEpoch;
  }

  assertEpochValid(incomingEpoch) {
    const epochNum = Number(incomingEpoch) || 0;
    if (epochNum < this.currentEpoch) {
      throw new Error(
        `Fencing Violation: Upstream operation epoch ${epochNum} ` +
        `has been fenced out by current epoch ${this.currentEpoch}.`,
      );
    }
    return true;
  }
}

class PublicationRecoveryLease {
  constructor(leaseDurationMs = PUBLICATION_RECOVERY_LEASE_DEFAULT_DURATION_MS) {
    this.leaseDurationMs = Number(leaseDurationMs) ||
      PUBLICATION_RECOVERY_LEASE_DEFAULT_DURATION_MS;
    this.grantedAt = null;
    this.active = false;
  }

  acquire(now = Date.now()) {
    this.grantedAt = now;
    this.active = true;
  }

  isExpired(now = Date.now()) {
    if (!this.active || this.grantedAt === null) {
      return true;
    }
    return now - this.grantedAt > this.leaseDurationMs;
  }

  evaluateLivenessOrStepDown(now = Date.now(), onStepDown = () => {}) {
    if (this.isExpired(now)) {
      this.active = false;
      onStepDown();
      return true;
    }
    return false;
  }
}

function adjudicateRecoveryPreemption(evidenceSnapshot) {
  const hasDownstreamPendingHandoff =
    Boolean(evidenceSnapshot?.publicationActiveGateHandoffPendingReconcileCount &&
    evidenceSnapshot.publicationActiveGateHandoffPendingReconcileCount >
      0);

  const localEpoch = Number(evidenceSnapshot?.localEpoch) || 0;
  const globalEpoch = Number(evidenceSnapshot?.globalEpoch) || 0;
  const hasEpochMismatch = localEpoch < globalEpoch;

  if (hasDownstreamPendingHandoff || hasEpochMismatch) {
    return Object.freeze({
      decision: RECOVERY_PREEMPTION_DECISION.PREEMPT_AND_BYPASS,
      reason: hasDownstreamPendingHandoff ?
        RECOVERY_PREEMPTION_REASON.DOWNSTREAM_HANDOFF_PENDING :
        RECOVERY_PREEMPTION_REASON.LOCAL_EPOCH_STALE,
    });
  }

  return Object.freeze({
    decision: RECOVERY_PREEMPTION_DECISION.CONTINUE,
    reason: RECOVERY_PREEMPTION_REASON.NO_ACTIVE_TRIGGERS,
  });
}

const PURE_SNAPSHOT_EVIDENCE_OPTION_KEYS = Object.freeze(new Set([
  'publicationConvergence',
  'publicationConvergenceGate',
  'priorityRecoveryObservation',
  'priorityRecoveryDecisionSnapshots',
  'priorityRecoveryClosureWitness',
  'priorityRecoveryInvariants',
]));
const MAX_EVIDENCE_CACHE_ENTRIES_PER_CONVERGENCE = 4;

function isOptionalImmutableEvidenceInput(value) {
  return value === undefined || value === null ||
    isRecursivelyImmutableOwnData(value);
}

function canMemoizePureSnapshotEvidenceOptions(options) {
  if (!isRecord(options) || !isRecord(options.publicationConvergence)) {
    return false;
  }
  const keys = Object.keys(options);
  for (let index = 0; index < keys.length; index += 1) {
    if (!PURE_SNAPSHOT_EVIDENCE_OPTION_KEYS.has(keys[index])) {
      return false;
    }
  }
  return isRecursivelyImmutableOwnData(options.publicationConvergence) &&
    isOptionalImmutableEvidenceInput(options.publicationConvergenceGate) &&
    isOptionalImmutableEvidenceInput(options.priorityRecoveryObservation) &&
    isOptionalImmutableEvidenceInput(options.priorityRecoveryDecisionSnapshots) &&
    isOptionalImmutableEvidenceInput(options.priorityRecoveryClosureWitness) &&
    isOptionalImmutableEvidenceInput(options.priorityRecoveryInvariants);
}

function findMemoizedPureSnapshotEvidence(entries, options) {
  const gate = options.publicationConvergenceGate ?? null;
  const obs = options.priorityRecoveryObservation ?? null;
  const dec = options.priorityRecoveryDecisionSnapshots ?? null;
  const wit = options.priorityRecoveryClosureWitness ?? null;
  const inv = options.priorityRecoveryInvariants ?? null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.gate === gate && entry.obs === obs && entry.dec === dec &&
        entry.wit === wit && entry.inv === inv) {
      return entry.result;
    }
  }
  return null;
}

function storeMemoizedPureSnapshotEvidence(
  evidenceMemo,
  convergence,
  entries,
  options,
  result,
) {
  const nextEntries = entries || [];
  if (nextEntries.length >= MAX_EVIDENCE_CACHE_ENTRIES_PER_CONVERGENCE) {
    nextEntries.shift();
  }
  nextEntries.push({
    gate: options.publicationConvergenceGate ?? null,
    obs: options.priorityRecoveryObservation ?? null,
    dec: options.priorityRecoveryDecisionSnapshots ?? null,
    wit: options.priorityRecoveryClosureWitness ?? null,
    inv: options.priorityRecoveryInvariants ?? null,
    result,
  });
  if (!entries) {
    evidenceMemo.set(convergence, nextEntries);
  }
}

function preparePureSnapshotEvidenceMemo(options, evidenceMemo) {
  if (evidenceMemo === null || !canMemoizePureSnapshotEvidenceOptions(options)) {
    return null;
  }
  const convergence = options.publicationConvergence;
  const entries = evidenceMemo.get(convergence) || null;
  const hit = entries ? findMemoizedPureSnapshotEvidence(entries, options) : null;
  return {convergence, entries, hit};
}

function resolvePublicationRecoveryLeaseExpired(options) {
  const lease = options.lease instanceof PublicationRecoveryLease ?
    options.lease :
    null;
  return lease ? lease.isExpired(options.now || Date.now()) : false;
}

function hasExplicitConvergenceGate(options) {
  return isRecord(options.publicationConvergenceGate) ||
    isRecord(options.publicationConvergence?.publicationRecoveryGate);
}

function finalizePureSnapshotEvidence(evidenceMemo, memoLookup, options, result) {
  if (!memoLookup) return result;
  const frozenResult = deepFreeze(result);
  storeMemoizedPureSnapshotEvidence(
    evidenceMemo, memoLookup.convergence, memoLookup.entries, options, frozenResult,
  );
  return frozenResult;
}

function buildCanonicalPublicationRecoveryEvidence(
  options = {},
  evidenceMemo = null,
) {
  const memoLookup = preparePureSnapshotEvidenceMemo(options, evidenceMemo);
  if (memoLookup?.hit) return memoLookup.hit;

  const publicationConvergenceGate = buildCanonicalPublicationConvergenceGate({
    publicationConvergence: options.publicationConvergence,
    publicationConvergenceGate: options.publicationConvergenceGate,
    priorityRecoveryObservation: options.priorityRecoveryObservation,
    priorityRecoveryDecisionSnapshots:
      options.priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      options.priorityRecoveryClosureWitness,
    activeGate: options.activeGate,
    activeGateProgress: options.activeGateProgress,
    activeGateBestProgress: options.activeGateBestProgress,
    publicationActiveGateHandoff: options.publicationActiveGateHandoff,
  });
  const priorityRecoveryObservation = buildCanonicalPriorityRecoveryObservation({
    publicationConvergence: options.publicationConvergence,
    publicationConvergenceGate,
    hasExplicitPublicationConvergenceGate: hasExplicitConvergenceGate(options),
    priorityRecoveryObservation: options.priorityRecoveryObservation,
    priorityRecoveryDecisionSnapshots:
      options.priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants: options.priorityRecoveryInvariants,
    activeGate: options.activeGate,
    activeGateProgress: options.activeGateProgress,
    activeGateBestProgress: options.activeGateBestProgress,
    activeGateNoProgress: options.activeGateNoProgress,
    activeGateBlockerHistory: options.activeGateBlockerHistory,
    logsTable: options.logsTable,
  });
  const publicationConvergence = buildCanonicalPublicationConvergence({
    publicationConvergence: options.publicationConvergence,
    publicationConvergenceGate,
    rawPriorityRecoveryObservation: options.priorityRecoveryObservation,
    priorityRecoveryObservation,
    activeGate: options.activeGate,
    activeGateProgress: options.activeGateProgress,
    activeGateBestProgress: options.activeGateBestProgress,
    publicationActiveGateHandoff: options.publicationActiveGateHandoff,
  });

  const preemptionAdjudication = adjudicateRecoveryPreemption({
    publicationActiveGateHandoffPendingReconcileCount:
      publicationConvergenceGate?.publicationActiveGateHandoffPendingReconcileCount ||
      options.activeGateProgress?.publicationActiveGateHandoffPendingReconcileCount || 0,
    localEpoch: options.localEpoch || 0,
    globalEpoch: options.globalEpoch || 0,
  });

  const result = Object.freeze({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
    preemptionAdjudication,
    leaseExpired: resolvePublicationRecoveryLeaseExpired(options),
  });
  return finalizePureSnapshotEvidence(evidenceMemo, memoLookup, options, result);
}

export {
  buildCanonicalPublicationRecoveryEvidence,
  RECOVERY_PREEMPTION_DECISION,
  TopologyEpochFencer,
  PublicationRecoveryLease,
  adjudicateRecoveryPreemption,
};
