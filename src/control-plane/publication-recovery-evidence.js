import {NUM} from '../constants/index.js';
import {
  isRecord,
  PUBLICATION_RECOVERY_LEASE_DEFAULT_DURATION_MS,
} from './publication-recovery-evidence-normalizers.js';
import {
  buildCanonicalPublicationConvergenceGate,
  buildCanonicalPriorityRecoveryObservation,
  buildCanonicalPublicationConvergence,
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
  constructor(currentEpoch = NUM.ZERO) {
    this.currentEpoch = Number(currentEpoch) || NUM.ZERO;
  }

  advanceEpoch() {
    this.currentEpoch += NUM.ONE;
    return this.currentEpoch;
  }

  assertEpochValid(incomingEpoch) {
    const epochNum = Number(incomingEpoch) || NUM.ZERO;
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
      NUM.ZERO);

  const localEpoch = Number(evidenceSnapshot?.localEpoch) || NUM.ZERO;
  const globalEpoch = Number(evidenceSnapshot?.globalEpoch) || NUM.ZERO;
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

function buildCanonicalPublicationRecoveryEvidence(options = {}) {
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
    hasExplicitPublicationConvergenceGate:
      isRecord(options.publicationConvergenceGate) ||
      isRecord(options.publicationConvergence?.publicationRecoveryGate),
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

  const lease = options.lease instanceof PublicationRecoveryLease ? options.lease : null;
  const leaseExpired = lease ? lease.isExpired(options.now || Date.now()) : false;

  return Object.freeze({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
    preemptionAdjudication,
    leaseExpired,
  });
}

export {
  buildCanonicalPublicationRecoveryEvidence,
  RECOVERY_PREEMPTION_DECISION,
  TopologyEpochFencer,
  PublicationRecoveryLease,
  adjudicateRecoveryPreemption,
};
