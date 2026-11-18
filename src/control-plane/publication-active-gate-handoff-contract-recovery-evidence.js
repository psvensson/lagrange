// What a handoff knows about recovery, as two separate facts.
//
// (1) recoveryGate: ONE cluster-level fact. The readiness owner emits
//     PRIORITY_CONTROL_PLANE_RECOVERY_PENDING for every node that is not serve
//     eligible while the publication recovery gate is active
//     (control-plane-readiness-evidence-reasons.js), published nodes and
//     missing nodes alike. The gate is also held active by the publication
//     itself (unpublished, unacknowledged, or its priority summary not yet
//     rewritten), so a node missing from the publication can never be made to
//     wait for it: publishing is one of the things that clears it.
// (2) pendingRecoveryNodeIds: per-node facts only. A node is listed when its
//     own readiness entry carries a reason that names that node (the control
//     snapshot's observation overlay writes a deferred snapshot source on the
//     one node it observed).
import {collectReasonCodes} from './eligibility-snapshot.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NODE_WAIT_REASON_CODES,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_COUNT_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_LIST_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_SUMMARY_BLOCKER_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON_CODE,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  isPublicationActiveGateHandoffRecord,
  normalizePublicationActiveGateHandoffInteger,
  normalizePublicationActiveGateHandoffNodeIdList,
} from './publication-active-gate-handoff-contract-helpers.js';
import {
  collectPublicationActiveGateHandoffPriorityRecoveryEvidenceRecords,
} from './publication-active-gate-handoff-contract-evidence.js';

const PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE = Object.freeze({
  // A readiness entry states the gate reason and no priority-recovery
  // evidence reports it clean.
  ACTIVE: 'active',
  // Readiness entries were read and none states the gate reason, or the
  // priority-recovery evidence reports recovery clean.
  CLEAR: 'clear',
  // No readiness entry was supplied: the gate was not observed.
  UNAVAILABLE: 'unavailable',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON = Object.freeze({
  RECOVERY_PENDING: PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON_CODE,
  PRIORITY_RECOVERY_CLEAN: 'priority_recovery_clean',
  NO_ENTRY_REPORTS_RECOVERY_PENDING: 'no_entry_reports_recovery_pending',
  READINESS_EVIDENCE_UNAVAILABLE: 'readiness_evidence_unavailable',
});

const RECOVERY_GATE_STATE_SET = new Set(
  Object.values(PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE));

function buildRecoveryGate(state, reasonCode) {
  return Object.freeze({state, reasonCode});
}

const RECOVERY_GATE_UNAVAILABLE = buildRecoveryGate(
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.UNAVAILABLE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON
    .READINESS_EVIDENCE_UNAVAILABLE,
);

// A readiness entry states its reason codes in the two shapes its producers
// write: the readiness owner's `reasons` records, read through that owner's
// own reading, and the `reasonCodes` list the control snapshot's observation
// overlay adds (admin-control-snapshot-local-build-base.js).
function normalizePublicationActiveGateHandoffReasonCodes(readinessEntry) {
  if (!isPublicationActiveGateHandoffRecord(readinessEntry)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  const overlayReasonCodes =
    readinessEntry[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODES];
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...(Array.isArray(overlayReasonCodes) ?
      overlayReasonCodes :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...collectReasonCodes(readinessEntry),
  ]);
}

function normalizePublicationActiveGateHandoffPriorityRecoveryEvidenceRecord(
  evidenceRecord,
) {
  const blockerCounts =
    [
      ...PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_COUNT_FIELDS,
      ...PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_SUMMARY_BLOCKER_FIELDS,
    ]
      .map((fieldName) =>
        normalizePublicationActiveGateHandoffInteger(
          evidenceRecord?.[fieldName],
        ))
      .filter((value) => value !== null);
  const cleanCountGroups =
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS.map(
      (fieldNames) =>
        fieldNames
          .map((fieldName) =>
            normalizePublicationActiveGateHandoffInteger(
              evidenceRecord?.[fieldName],
            ))
          .filter((value) => value !== null),
    );
  const blockerListLengths =
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_LIST_FIELDS
      .map((fieldName) =>
        normalizePublicationActiveGateHandoffNodeIdList(
          evidenceRecord?.[fieldName],
        ).length);
  const hasUnresolvedEvidence = [
    ...blockerCounts,
    ...blockerListLengths,
  ].some((value) => value > 0);
  if (hasUnresolvedEvidence) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNRESOLVED;
  }
  const hasExplicitCleanEvidence =
    cleanCountGroups.some((cleanCounts, index) =>
      cleanCounts.length ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS[
          index
        ].length &&
      cleanCounts.every((value) => value === 0),
    );
  return hasExplicitCleanEvidence ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.CLEAN :
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNKNOWN;
}

function resolvePublicationActiveGateHandoffPriorityRecoveryState(
  publicationConvergence = null,
) {
  const evidenceStates =
    collectPublicationActiveGateHandoffPriorityRecoveryEvidenceRecords(
      publicationConvergence,
    ).map((evidenceRecord) =>
      normalizePublicationActiveGateHandoffPriorityRecoveryEvidenceRecord(
        evidenceRecord,
      ));
  if (
    evidenceStates.includes(
      PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNRESOLVED,
    )
  ) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNRESOLVED;
  }
  return evidenceStates.includes(
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.CLEAN,
  ) ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.CLEAN :
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNKNOWN;
}

function collectExpectedReadinessReasonCodes(expectedNodeIds, readinessByNodeId) {
  return expectedNodeIds
    .filter((nodeId) =>
      isPublicationActiveGateHandoffRecord(readinessByNodeId[nodeId]))
    .map((nodeId) => Object.freeze({
      nodeId,
      reasonCodes: normalizePublicationActiveGateHandoffReasonCodes(
        readinessByNodeId[nodeId]),
    }));
}

/**
 * The cluster-level recovery gate as the supplied readiness entries state it.
 * @param {string[]} expectedNodeIds
 * @param {Object|null} readinessByNodeId
 * @param {Object|null} publicationConvergence
 * @return {{state: string, reasonCode: string}}
 */
function resolvePublicationActiveGateHandoffRecoveryGate(
  expectedNodeIds,
  readinessByNodeId,
  publicationConvergence = null,
) {
  if (!isPublicationActiveGateHandoffRecord(readinessByNodeId)) {
    return RECOVERY_GATE_UNAVAILABLE;
  }
  const entries =
    collectExpectedReadinessReasonCodes(expectedNodeIds, readinessByNodeId);
  if (entries.length === 0) {
    return RECOVERY_GATE_UNAVAILABLE;
  }
  const gateReasonStated = entries.some((entry) =>
    entry.reasonCodes.includes(
      PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON_CODE));
  if (!gateReasonStated) {
    return buildRecoveryGate(
      PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.CLEAR,
      PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON
        .NO_ENTRY_REPORTS_RECOVERY_PENDING,
    );
  }
  return resolvePublicationActiveGateHandoffPriorityRecoveryState(
    publicationConvergence,
  ) === PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.CLEAN ?
    buildRecoveryGate(
      PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.CLEAR,
      PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON
        .PRIORITY_RECOVERY_CLEAN,
    ) :
    buildRecoveryGate(
      PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.ACTIVE,
      PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON.RECOVERY_PENDING,
    );
}

// A recovery gate carried on an already built contract (the normalize path).
// Anything that is not a gate record with a named state was not observed.
function normalizePublicationActiveGateHandoffRecoveryGate(value) {
  if (
    !isPublicationActiveGateHandoffRecord(value) ||
    !RECOVERY_GATE_STATE_SET.has(value.state) ||
    typeof value.reasonCode !== 'string'
  ) {
    return RECOVERY_GATE_UNAVAILABLE;
  }
  return buildRecoveryGate(value.state, value.reasonCode);
}

// The nodes whose OWN readiness entry names a per-node wait.
function resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
  expectedNodeIds,
  readinessByNodeId,
) {
  if (!isPublicationActiveGateHandoffRecord(readinessByNodeId)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    collectExpectedReadinessReasonCodes(expectedNodeIds, readinessByNodeId)
      .filter((entry) => entry.reasonCodes.some((reasonCode) =>
        PUBLICATION_ACTIVE_GATE_HANDOFF_NODE_WAIT_REASON_CODES.includes(
          reasonCode)))
      .map((entry) => entry.nodeId),
  );
}

// The missing nodes the publication owner publishes: every missing node
// except one that is itself waiting. The cluster gate removes none.
function resolvePublicationActiveGateHandoffPendingReconcileNodeIds({
  missingPublishedNodeIds,
  pendingRecoveryNodeIds,
}) {
  const pendingRecoveryNodeIdSet = new Set(pendingRecoveryNodeIds);
  return normalizePublicationActiveGateHandoffNodeIdList(
    missingPublishedNodeIds.filter(
      (nodeId) => !pendingRecoveryNodeIdSet.has(nodeId),
    ),
  );
}

/**
 * The recovery evidence of one handoff: the cluster gate and the per-node
 * lists. A contract that is being re-read (normalize) supplies its own lists
 * and gate; a fresh build derives them from the readiness entries.
 * @param {Object} options contract build options
 * @param {string[]} expectedNodeIds
 * @param {string[]} missingPublishedNodeIds
 * @return {Object}
 */
function resolvePublicationActiveGateHandoffRecoveryEvidence(
  options,
  expectedNodeIds,
  missingPublishedNodeIds,
) {
  const pendingRecoveryNodeIds =
    Array.isArray(options.pendingRecoveryNodeIds) ?
      normalizePublicationActiveGateHandoffNodeIdList(
        options.pendingRecoveryNodeIds) :
      resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
        expectedNodeIds, options.readinessByNodeId);
  const pendingReconcileNodeIds =
    Array.isArray(options.pendingReconcileNodeIds) ?
      normalizePublicationActiveGateHandoffNodeIdList(
        options.pendingReconcileNodeIds) :
      resolvePublicationActiveGateHandoffPendingReconcileNodeIds({
        missingPublishedNodeIds,
        pendingRecoveryNodeIds,
      });
  const recoveryGate = Object.hasOwn(options, 'recoveryGate') ?
    normalizePublicationActiveGateHandoffRecoveryGate(options.recoveryGate) :
    resolvePublicationActiveGateHandoffRecoveryGate(
      expectedNodeIds,
      options.readinessByNodeId,
      options.publicationConvergence,
    );
  return Object.freeze({
    recoveryGate,
    pendingRecoveryNodeIds,
    pendingReconcileNodeIds,
  });
}

export {
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE,
  normalizePublicationActiveGateHandoffReasonCodes,
  resolvePublicationActiveGateHandoffPendingRecoveryNodeIds,
  resolvePublicationActiveGateHandoffRecoveryEvidence,
  resolvePublicationActiveGateHandoffRecoveryGate,
};
