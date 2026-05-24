import {NUM, TYPEOF} from '../constants/index.js';
import {buildReadinessByNodeId} from './active-node-projection.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from './control-plane-publication-merge.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';
import {
  buildPriorityRecoveryClosureWitness,
  buildPriorityRecoveryDecisionSnapshots,
} from './priority-recovery-snapshot.js';
import {
  normalizeMembershipPublicationStringList,
} from './membership-publication-normalizers.js';

const READINESS_REASON_CODE_KEY = 'code';
const READINESS_REASON_CODES_KEY = 'reasonCodes';
const READINESS_REASONS_KEY = 'reasons';

const MEMBERSHIP_PUBLICATION_STATUS = CONTROL_PLANE_PUBLICATION_STATUS;
const PRIORITY_RECOVERY_PENDING_PUBLICATION_DIMENSIONS = Object.freeze({
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
});

function normalizePriorityRecoveryClosureWitness(value) {
  return value && typeof value === TYPEOF.OBJECT ?
    value :
    null;
}

function normalizeReadinessReasonCodeValue(reason) {
  if (typeof reason === TYPEOF.STRING) {
    return reason;
  }
  if (
    reason &&
    typeof reason === TYPEOF.OBJECT &&
    typeof reason[READINESS_REASON_CODE_KEY] === TYPEOF.STRING
  ) {
    return reason[READINESS_REASON_CODE_KEY];
  }
  return '';
}

function normalizeReadinessReasonCodes(readinessEntry = null) {
  if (!readinessEntry || typeof readinessEntry !== TYPEOF.OBJECT) {
    return [];
  }
  return normalizeMembershipPublicationStringList([
    ...(Array.isArray(readinessEntry[READINESS_REASON_CODES_KEY]) ?
      readinessEntry[READINESS_REASON_CODES_KEY] :
      []),
    ...(Array.isArray(readinessEntry[READINESS_REASONS_KEY]) ?
      readinessEntry[READINESS_REASONS_KEY].map((reason) =>
        normalizeReadinessReasonCodeValue(reason),
      ) :
      []),
  ]);
}

function resolveReadinessDimensions(readinessEntry = null) {
  return readinessEntry?.dimensions &&
    typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
    readinessEntry.dimensions :
    null;
}

function hasPriorityRecoveryPendingPublicationRepairEvidence(
  readinessEntry = null,
) {
  if (!readinessEntry || typeof readinessEntry !== TYPEOF.OBJECT) {
    return false;
  }
  const priorityRecoveryPending = normalizeReadinessReasonCodes(
    readinessEntry,
  ).includes(
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  );
  if (priorityRecoveryPending !== true) {
    return false;
  }
  const dimensions = resolveReadinessDimensions(readinessEntry);
  return dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !==
    false;
}

function buildPublicationPlanningReadinessEntry(readinessEntry = null) {
  if (
    hasPriorityRecoveryPendingPublicationRepairEvidence(readinessEntry) !== true
  ) {
    return readinessEntry;
  }
  return {
    ...readinessEntry,
    dimensions: {
      ...(resolveReadinessDimensions(readinessEntry) || {}),
      ...PRIORITY_RECOVERY_PENDING_PUBLICATION_DIMENSIONS,
    },
  };
}

function buildPublicationPlanningReadinessByNodeId(options = {}) {
  const readinessByNodeId = buildReadinessByNodeId(options);
  return Object.keys(readinessByNodeId)
    .sort()
    .reduce((accumulator, nodeId) => {
      accumulator[nodeId] = buildPublicationPlanningReadinessEntry(
        readinessByNodeId[nodeId],
      );
      return accumulator;
    }, {});
}

function buildPriorityRecoveryDecisionPublicationConvergence(options = {}, helperFns = {}) {
  const latestPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublicationRow,
  );
  const latestPublishedPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublishedPublicationRow,
  );
  const publicationEpoch = helperFns.normalizePositiveInteger(
    latestPublicationRow?.publicationEpoch ??
      latestPublishedPublicationRow?.publicationEpoch,
    null,
  );
  const publicationStatus =
    typeof latestPublicationRow?.status === TYPEOF.STRING &&
      latestPublicationRow.status.length > NUM.ZERO ?
      latestPublicationRow.status :
      typeof latestPublishedPublicationRow?.status === TYPEOF.STRING &&
        latestPublishedPublicationRow.status.length > NUM.ZERO ?
        latestPublishedPublicationRow.status :
        MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
  return {
    publicationEpoch,
    publicationStatus,
    publishedActiveNodeIds: options.publishedActiveNodeIds,
    pendingAckNodeIds: options.pendingAckNodeIds,
    priorityPartitionSummary: options.priorityPartitionSummary,
    membershipLifecycleSummary: options.membershipLifecycleSummary,
    recoveryActiveNodeIds: options.recoveryActiveNodeIds,
    recoveryActiveNodeSource: options.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      options.missingPublishedRecoveryActiveNodeIds,
  };
}

function buildPriorityRecoveryClosureEvidence(options = {}, helperFns = {}) {
  const retainedPriorityRecoveryClosureWitness =
    normalizePriorityRecoveryClosureWitness(
      options.priorityRecoveryPlanningSnapshot?.priorityRecoveryClosureWitness,
    );
  const replicaOperationRows = Array.isArray(options.replicaOperationRows) ?
    options.replicaOperationRows :
    [];
  const closureShortcut = [
    {
      matches: Boolean(retainedPriorityRecoveryClosureWitness),
      priorityRecoveryClosureWitness: retainedPriorityRecoveryClosureWitness,
      priorityRecoveryDecisionSnapshots: null,
    },
    {
      matches: replicaOperationRows.length === NUM.ZERO,
      priorityRecoveryClosureWitness: null,
      priorityRecoveryDecisionSnapshots: null,
    },
  ].find((entry) => entry.matches === true);
  if (closureShortcut) {
    return {
      priorityRecoveryClosureWitness:
        closureShortcut.priorityRecoveryClosureWitness,
      priorityRecoveryDecisionSnapshots:
        closureShortcut.priorityRecoveryDecisionSnapshots,
    };
  }
  const priorityRecoveryDecisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
    capturedAt: helperFns.normalizePositiveInteger(options.nowMs, null),
    publicationConvergence:
      buildPriorityRecoveryDecisionPublicationConvergence(options, helperFns),
    readinessByNodeId: options.readinessByNodeId,
    workflowAdmissionsByWorkflowId: {},
    replicaOperationRows,
    serviceRows: options.serviceRows,
  });
  return {
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      normalizePriorityRecoveryClosureWitness(
        priorityRecoveryDecisionSnapshots?.closureWitness,
      ) || buildPriorityRecoveryClosureWitness({
        decisionSnapshots: priorityRecoveryDecisionSnapshots,
        priorityPartitionSummary: options.priorityPartitionSummary,
      }),
  };
}

export {
  buildPriorityRecoveryClosureEvidence,
  buildPublicationPlanningReadinessByNodeId,
};
