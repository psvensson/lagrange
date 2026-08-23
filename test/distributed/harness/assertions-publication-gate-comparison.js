import {
  CONTROL_PLANE_SNAPSHOT_REVISION_STATE,
} from '../../../src/control-plane/control-plane-snapshot-revision.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../../src/control-plane/control-plane-readiness-constants.js';
import {
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from '../../../src/admin/admin-constants.js';
import {
  formatPublicationRecoveryGateContract,
} from './assertions-publication-recovery-gate.js';
import {
  CONSISTENCY_GATE_SUMMARY_SEPARATOR,
  CONSISTENCY_SINGLE_REASON_COUNT,
  EMPTY_LIST_LENGTH,
  PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
  PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING,
  VALUE_UNKNOWN,
  normalizeConsistencyStringList,
} from './assertions-consistency-shared.js';

export function resolvePublicationScopedLeaderComparison(records) {
  const contractRecords = records.filter(
    (record) => record?.publicationRecoveryGate?.contractPresent === true,
  );
  if (contractRecords.length === 0) {
    return {
      hasContract: false,
      ready: true,
      blockedRecords: [],
    };
  }
  const readyPublicationGateEpochs = contractRecords
    .filter((record) => record.publicationRecoveryGate.ready === true)
    .map((record) => record.publicationRecoveryGate.publicationEpoch)
    .filter((epoch) => Number.isInteger(epoch));
  const readyPublicationGateEpochSet = new Set(readyPublicationGateEpochs);
  const blockedRecords = contractRecords.filter(
    (record) => record.publicationRecoveryGate.ready !== true,
  );
  const authoritativeBlockedRecords = blockedRecords.filter(
    (record) =>
      isAuthoritativePublicationRecoveryGateBlocker(
        record,
        readyPublicationGateEpochSet,
      ),
  );
  return {
    hasContract: true,
    ready: authoritativeBlockedRecords.length === 0,
    blockedRecords: authoritativeBlockedRecords,
  };
}

function isAuthoritativePublicationRecoveryGateBlocker(
  record,
  readyPublicationGateEpochSet,
) {
  if (
    isStalePublicationRecoveryGateLagRecord(
      record,
      readyPublicationGateEpochSet,
    )
  ) {
    return false;
  }
  return true;
}

const STALE_PUBLICATION_GATE_LAG_DECISION_TABLE = Object.freeze([
  (evidence) =>
    evidence.gateReady !== true &&
    evidence.observationMode ===
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED &&
    evidence.snapshotRevisionState ===
      CONTROL_PLANE_SNAPSHOT_REVISION_STATE.STALE_USABLE &&
    (
      (
        evidence.gateState ===
          PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING &&
        evidence.prioritySpreadOnly === true
      ) ||
      (
        evidence.gateState ===
          PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE &&
        evidence.prioritySpreadEvidenceUnavailableOnly === true
      )
    ),
]);

function isStalePublicationRecoveryGateLagRecord(
  record,
  readyPublicationGateEpochSet,
) {
  const gate = record?.publicationRecoveryGate;
  if (
    !(readyPublicationGateEpochSet instanceof Set) ||
    readyPublicationGateEpochSet.size === EMPTY_LIST_LENGTH ||
    !Number.isInteger(gate?.publicationEpoch) ||
    !readyPublicationGateEpochSet.has(gate.publicationEpoch)
  ) {
    return false;
  }
  const staleGateEvidence = normalizeStalePublicationGateEvidence(record);
  return STALE_PUBLICATION_GATE_LAG_DECISION_TABLE.some((decision) =>
    decision(staleGateEvidence),
  );
}

function normalizeStalePublicationGateEvidence(record) {
  const gate = record?.publicationRecoveryGate;
  const reasonCodes = normalizeConsistencyStringList(gate?.reasonCodes);
  return {
    observationMode: record?.observationMode,
    snapshotRevisionState: record?.snapshotRevisionState,
    gateState: gate?.state,
    gateReady: gate?.ready === true,
    reasonCodes,
    prioritySpreadOnly:
      reasonCodes.length === CONSISTENCY_SINGLE_REASON_COUNT &&
      reasonCodes[EMPTY_LIST_LENGTH] ===
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    prioritySpreadEvidenceUnavailableOnly:
      reasonCodes.length === CONSISTENCY_SINGLE_REASON_COUNT &&
      reasonCodes[EMPTY_LIST_LENGTH] ===
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
  };
}

export function buildPublicationRecoveryGateNotReadyMessage(records) {
  const summaries = records.map(
    (record) =>
      String(record?.nodeId || VALUE_UNKNOWN) +
      '=' +
      formatPublicationRecoveryGateContract(record?.publicationRecoveryGate),
  );
  return (
    'Publication-scoped consistency not ready. Node gates: ' +
    summaries.join(CONSISTENCY_GATE_SUMMARY_SEPARATOR)
  );
}
