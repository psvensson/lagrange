import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from './membership-lifecycle-constants.js';
import {
  PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE,
  PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE,
  PUBLICATION_RECOVERY_OWNER_REASON_CODE_SET,
} from './publication-recovery-gate-constants.js';
import {
  normalizeDistinctStringArray,
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

function resolvePriorityClosureWitnessSummaryState(
  priorityRecoveryClosureWitness = null,
  durablePriorityPartitionSummary = null,
) {
  const summarySpreadPending =
    durablePriorityPartitionSummary ?
      resolvePrioritySpreadPendingFromSummary(durablePriorityPartitionSummary) :
      null;
  const closureWitnessSatisfied =
    priorityRecoveryClosureWitness?.prioritySpreadPending === false;
  const stalePublicationWitness =
    priorityRecoveryClosureWitness?.publicationRefreshRequired === true ||
    priorityRecoveryClosureWitness?.state ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION;
  const durableSummaryRefreshed =
    closureWitnessSatisfied &&
    stalePublicationWitness &&
    summarySpreadPending === false;
  return durableSummaryRefreshed ?
    PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE.DURABLE_SUMMARY_REFRESHED :
    PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE.RETAINED;
}

function normalizePriorityClosureWitnessForDurableSummary(
  priorityRecoveryClosureWitness = null,
  durablePriorityPartitionSummary = null,
) {
  const normalizedPriorityRecoveryClosureWitness =
    normalizePriorityRecoveryClosureWitness(priorityRecoveryClosureWitness);
  if (!normalizedPriorityRecoveryClosureWitness) {
    return null;
  }
  const closureWitnessSummaryState =
    resolvePriorityClosureWitnessSummaryState(
      normalizedPriorityRecoveryClosureWitness,
      durablePriorityPartitionSummary,
    );
  if (
    closureWitnessSummaryState !==
      PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE.DURABLE_SUMMARY_REFRESHED
  ) {
    return normalizedPriorityRecoveryClosureWitness;
  }
  return Object.freeze({
    ...normalizedPriorityRecoveryClosureWitness,
    state: PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_FRESH,
    publicationRefreshRequired: false,
    closureRecordId: null,
    closureWitnessClass: null,
    refreshedPriorityPartitionSummary:
      normalizePriorityPartitionSummary(
        normalizedPriorityRecoveryClosureWitness
          .refreshedPriorityPartitionSummary,
      ) || durablePriorityPartitionSummary,
    summarySpreadPending: false,
  });
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

function buildPrioritySpreadDecision(options = {}) {
  const durablePriorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary,
  );
  const decisionSnapshotClosureWitness =
    readPriorityRecoveryDecisionClosureWitness(
      options.priorityRecoveryDecisionSnapshots,
    );
  const rawPriorityRecoveryClosureWitness = normalizePriorityRecoveryClosureWitness(
    options.priorityRecoveryClosureWitness,
  ) || decisionSnapshotClosureWitness;
  const priorityRecoveryClosureWitness =
    normalizePriorityClosureWitnessForDurableSummary(
      rawPriorityRecoveryClosureWitness,
      durablePriorityPartitionSummary,
    );
  const priorityPartitionSummary =
    normalizePriorityPartitionSummary(
      priorityRecoveryClosureWitness?.refreshedPriorityPartitionSummary,
    ) || durablePriorityPartitionSummary;
  const recoveryProtocolState = normalizeOptionalString(
    options.recoveryProtocolState,
  );
  const reasonCodes = Array.isArray(options.reasonCodes) ?
    options.reasonCodes :
    [];
  const prioritySpreadOwnerEvidenceRequired =
    requiresPrioritySpreadOwnerEvidence({
      recoveryProtocolState,
      reasonCodes,
    });
  const closureWitnessPrioritySpreadPending =
    typeof priorityRecoveryClosureWitness?.prioritySpreadPending === 'boolean' ?
      priorityRecoveryClosureWitness.prioritySpreadPending :
      null;
  const summaryPrioritySpreadPending =
    priorityPartitionSummary ?
      hasZeroPrioritySpreadGapSummary(priorityPartitionSummary) ?
        false :
        hasPriorityRecoverySpreadGap(priorityPartitionSummary) :
      null;
  const prioritySpreadEvidenceUnavailable =
    !priorityRecoveryClosureWitness &&
    !priorityPartitionSummary &&
    prioritySpreadOwnerEvidenceRequired === true;
  const decisionSource = priorityRecoveryClosureWitness ?
    PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.CLOSURE_WITNESS :
    priorityPartitionSummary ?
      PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.PRIORITY_PARTITION_SUMMARY :
      PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.OWNER_EVIDENCE_UNAVAILABLE;

  return Object.freeze({
    decisionSource,
    priorityPartitionSummary,
    durablePriorityPartitionSummary,
    priorityRecoveryClosureWitness,
    prioritySpreadEvidenceUnavailable,
    prioritySpreadPending:
      priorityRecoveryClosureWitness ?
        closureWitnessPrioritySpreadPending :
        priorityPartitionSummary ?
          summaryPrioritySpreadPending :
          false,
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
};
