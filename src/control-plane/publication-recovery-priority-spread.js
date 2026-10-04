import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from './membership-lifecycle-constants.js';
import {
  PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE,
  PUBLICATION_RECOVERY_OWNER_REASON_CODE_SET,
} from './publication-recovery-gate-constants.js';
import {
  normalizeDistinctStringArray,
} from './publication-recovery-evidence-values.js';
import {
  normalizeNonNegativeInteger,
  normalizeOptionalString,
} from './publication-recovery-stream-evidence.js';
import {
  hasPriorityRecoverySpreadGap,
} from './priority-recovery-planning-intent.js';
import {
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from './priority-recovery-snapshot-contract.js';

function normalizePriorityPartitionSummary(value) {
  return value && typeof value === 'object' ?
    value :
    null;
}

function normalizePriorityRecoveryClosureWitness(value) {
  return value && typeof value === 'object' ?
    value :
    null;
}

function readPriorityRecoveryDecisionClosureWitness(
  priorityRecoveryDecisionSnapshots,
) {
  return normalizePriorityRecoveryClosureWitness(
    priorityRecoveryDecisionSnapshots?.closureWitness,
  );
}

function hasPrioritySpreadMetricEvidence(priorityPartitionSummary = null) {
  return Number.isFinite(Number(priorityPartitionSummary?.blockedPartitionCount)) ||
    Number.isFinite(Number(priorityPartitionSummary?.largestSpreadGap)) ||
    Number.isFinite(Number(priorityPartitionSummary?.totalSpreadGap));
}

function hasZeroPrioritySpreadGapSummary(priorityPartitionSummary = null) {
  const missingPartitionIds = normalizeDistinctStringArray(
    priorityPartitionSummary?.missingPartitionIds,
  );
  const blockedPartitions = Array.isArray(
    priorityPartitionSummary?.blockedPartitions,
  ) ?
    priorityPartitionSummary.blockedPartitions :
    [];
  return hasPrioritySpreadMetricEvidence(priorityPartitionSummary) &&
    missingPartitionIds.length === 0 &&
    blockedPartitions.length === 0 &&
    normalizeNonNegativeInteger(priorityPartitionSummary?.blockedPartitionCount) ===
      0 &&
    normalizeNonNegativeInteger(priorityPartitionSummary?.largestSpreadGap) ===
      0 &&
    normalizeNonNegativeInteger(priorityPartitionSummary?.totalSpreadGap) ===
      0;
}

function resolvePrioritySpreadPendingFromSummary(priorityPartitionSummary = null) {
  return hasZeroPrioritySpreadGapSummary(priorityPartitionSummary) ?
    false :
    hasPriorityRecoverySpreadGap(priorityPartitionSummary);
}

function requiresPrioritySpreadOwnerEvidence(options = {}) {
  const recoveryProtocolState = normalizeOptionalString(
    options.recoveryProtocolState,
  );
  if (
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING
  ) {
    return true;
  }
  const reasonCodes = Array.isArray(options.reasonCodes) ?
    options.reasonCodes :
    [];
  return reasonCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
  );
}

function isPriorityRecoveryClosureWitnessPending(priorityRecoveryClosureWitness) {
  return priorityRecoveryClosureWitness?.state ===
    PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.PENDING;
}

// THE rule (owner decision 2026-10-04, "delete the second authority"):
// priority spread is pending iff the census shows a gap, or the closure
// witness is PENDING. The census is the one owner of "is it spread?"; the
// witness may only add a blocker, and a non-pending witness never clears a
// census gap. Every reader of priority-spread-pending consumes this answer.
function resolvePrioritySpreadPending(options = {}) {
  const priorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary,
  );
  const censusGap = priorityPartitionSummary ?
    resolvePrioritySpreadPendingFromSummary(priorityPartitionSummary) :
    false;
  return censusGap === true ||
    isPriorityRecoveryClosureWitnessPending(
      options.priorityRecoveryClosureWitness,
    );
}

function buildPrioritySpreadDecision(options = {}) {
  const priorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary,
  );
  const priorityRecoveryClosureWitness = normalizePriorityRecoveryClosureWitness(
    options.priorityRecoveryClosureWitness,
  ) || readPriorityRecoveryDecisionClosureWitness(
    options.priorityRecoveryDecisionSnapshots,
  );
  const prioritySpreadOwnerEvidenceRequired =
    requiresPrioritySpreadOwnerEvidence({
      recoveryProtocolState: normalizeOptionalString(
        options.recoveryProtocolState,
      ),
      reasonCodes: Array.isArray(options.reasonCodes) ?
        options.reasonCodes :
        [],
    });
  // Evidence is unavailable only when neither the census summary nor a
  // closure witness is present. A non-pending witness without any summary
  // has no census gap to clear: it is evidence, not an override.
  const prioritySpreadEvidenceUnavailable =
    !priorityPartitionSummary &&
    !priorityRecoveryClosureWitness &&
    prioritySpreadOwnerEvidenceRequired === true;
  const decisionSource = priorityPartitionSummary ?
    PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.PRIORITY_PARTITION_SUMMARY :
    priorityRecoveryClosureWitness ?
      PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.CLOSURE_WITNESS :
      PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.OWNER_EVIDENCE_UNAVAILABLE;

  return Object.freeze({
    decisionSource,
    priorityPartitionSummary,
    durablePriorityPartitionSummary: priorityPartitionSummary,
    priorityRecoveryClosureWitness,
    prioritySpreadEvidenceUnavailable,
    prioritySpreadPending: resolvePrioritySpreadPending({
      priorityPartitionSummary,
      priorityRecoveryClosureWitness,
    }),
  });
}

function shouldRetainPriorityRecoveryReasonCode(
  reasonCode,
  prioritySpreadDecision,
  prioritySpreadEvidenceUnavailableReasonActive,
  publicationEpochReasonActive,
) {
  if (
    reasonCode ===
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING
  ) {
    return publicationEpochReasonActive === true;
  }
  if (
    reasonCode !==
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD
  ) {
    return true;
  }
  if (prioritySpreadEvidenceUnavailableReasonActive === true) {
    return false;
  }
  return (
    prioritySpreadDecision.prioritySpreadPending === true ||
    prioritySpreadDecision.prioritySpreadEvidenceUnavailable === true
  );
}

function filterProvidedPriorityRecoveryReasonCodes(
  providedReasonCodes,
  prioritySpreadDecision,
  prioritySpreadEvidenceUnavailableReasonActive,
  publicationEpochReasonActive,
) {
  return Object.freeze(
    providedReasonCodes
      .filter((reasonCode) =>
        PUBLICATION_RECOVERY_OWNER_REASON_CODE_SET.has(reasonCode))
      .filter((reasonCode) =>
        shouldRetainPriorityRecoveryReasonCode(
          reasonCode,
          prioritySpreadDecision,
          prioritySpreadEvidenceUnavailableReasonActive,
          publicationEpochReasonActive,
        ),
      ),
  );
}

export {
  buildPrioritySpreadDecision,
  filterProvidedPriorityRecoveryReasonCodes,
  isPriorityRecoveryClosureWitnessPending,
  resolvePrioritySpreadPending,
};
