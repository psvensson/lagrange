import {NUM} from '../constants/index.js';
import {buildPriorityRecoveryObservationSnapshot} from
  './priority-recovery-observation-snapshot.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from
  './publication-recovery-gate.js';

const PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST = Object.freeze([]);
const PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE = Object.freeze({
  PROVIDED: 'provided',
  UNAVAILABLE: 'unavailable',
});
const PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT = Object.freeze({
  UNAVAILABLE: Object.freeze({
    state: PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE.UNAVAILABLE,
    value: PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  }),
});
const PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD = Object.freeze({
  MISSING_PUBLISHED_COUNT: 'missingPublishedCount',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  PENDING_ACK_COUNT: 'pendingAckCount',
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  SELECTED_MISSING_PUBLISHED_NODE_IDS: 'selectedMissingPublishedNodeIds',
  SELECTED_PENDING_ACK_NODE_IDS: 'selectedPendingAckNodeIds',
});
const PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD = Object.freeze({
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  PUBLICATION: 'publication',
  SNAPSHOTS: 'snapshots',
});
const PUBLICATION_RECOVERY_EVIDENCE_TEXT = Object.freeze({
  EMPTY: '',
});
const PUBLICATION_RECOVERY_EVIDENCE_TYPEOF = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});

function isRecord(value) {
  return Boolean(value) &&
    typeof value === PUBLICATION_RECOVERY_EVIDENCE_TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function buildPublicationRecoveryAckNodeListInput(value) {
  return Array.isArray(value) ?
    Object.freeze({
      state: PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE.PROVIDED,
      value,
    }) :
    PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
}

function isPublicationRecoveryAckNodeListProvided(input) {
  return input?.state ===
    PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE.PROVIDED;
}

function resolvePublicationRecoveryAckNodeListInput(inputs = []) {
  return inputs.find((input) =>
    isPublicationRecoveryAckNodeListProvided(input),
  ) || PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
}

function resolvePublicationRecoveryGateRequiredAckNodeListInput(gate = null) {
  if (
    !isRecord(gate) ||
    gate.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(gate.requiredAckNodeIds);
}

function resolvePublicationRecoveryGateAcknowledgedNodeListInput(gate = null) {
  if (
    !isRecord(gate) ||
    gate.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(gate.acknowledgedNodeIds);
}

function resolvePublicationRecoveryConvergenceRequiredAckNodeListInput(
  publicationConvergence = null,
) {
  if (
    !isRecord(publicationConvergence) ||
    publicationConvergence.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(
    publicationConvergence.requiredAckNodeIds,
  );
}

function resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput(
  publicationConvergence = null,
) {
  if (
    !isRecord(publicationConvergence) ||
    publicationConvergence.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(
    publicationConvergence.acknowledgedNodeIds,
  );
}

function normalizeDistinctStringArray(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          String(value || PUBLICATION_RECOVERY_EVIDENCE_TEXT.EMPTY).trim())
        .filter((value) => value.length > NUM.ZERO),
    )],
  );
}

function normalizePublicationEpoch(value) {
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

function normalizeNonNegativeInteger(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= NUM.ZERO ?
    Math.floor(numericValue) :
    NUM.ZERO;
}

function normalizeMaximumNonNegativeInteger(values = []) {
  return Math.max(
    NUM.ZERO,
    ...values.map((value) => normalizeNonNegativeInteger(value)),
  );
}

function resolvePendingRequiredAckNodeIds(
  requiredAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  acknowledgedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  const acknowledgedNodeIdSet = new Set(acknowledgedNodeIds);
  return Object.freeze(
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)),
  );
}

function normalizePublicationRecoveryAckEvidence(options = {}) {
  const requiredAckNodeListInput = isRecord(options.requiredAckNodeListInput) ?
    options.requiredAckNodeListInput :
    buildPublicationRecoveryAckNodeListInput(options.requiredAckNodeIds);
  const evidenceState =
    isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) ?
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST :
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
  const requiredAckNodeIds = normalizeDistinctStringArray(
    requiredAckNodeListInput.value,
  );
  const acknowledgedNodeIds = normalizeDistinctStringArray(
    options.acknowledgedNodeIds,
  );
  const derivedPendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST ?
      resolvePendingRequiredAckNodeIds(requiredAckNodeIds, acknowledgedNodeIds) :
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const pendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST ?
      derivedPendingAckNodeIds :
      explicitPendingAckNodeIds;
  const pendingAckCountByState = Object.freeze({
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY]:
      Math.max(
        pendingAckNodeIds.length,
        normalizeMaximumNonNegativeInteger(options.pendingAckCountValues),
      ),
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST]:
      pendingAckNodeIds.length,
  });

  return Object.freeze({
    evidenceState,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    pendingAckCount: pendingAckCountByState[evidenceState],
  });
}

function normalizeOptionalString(value) {
  return typeof value === PUBLICATION_RECOVERY_EVIDENCE_TYPEOF.STRING &&
    value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeActiveGateProgressRecords(options = {}) {
  return Object.freeze([
    options.activeGateProgress,
    options.activeGate?.progress,
  ].filter((progress) => isRecord(progress)));
}

function normalizeProgressNodeIds(
  progress = null,
  fieldName = PUBLICATION_RECOVERY_EVIDENCE_TEXT.EMPTY,
) {
  return normalizeDistinctStringArray(progress?.[fieldName]);
}

function normalizeActiveGateProgressNodeIds(
  activeGateProgressRecords = [],
  fieldNames = [],
) {
  return normalizeDistinctStringArray(
    activeGateProgressRecords.flatMap((progress) =>
      fieldNames.flatMap((fieldName) =>
        normalizeProgressNodeIds(progress, fieldName),
      ),
    ),
  );
}

function normalizeActiveGateProgressCount(
  activeGateProgressRecords = [],
  fieldName = PUBLICATION_RECOVERY_EVIDENCE_TEXT.EMPTY,
) {
  return normalizeMaximumNonNegativeInteger(
    activeGateProgressRecords.map((progress) => progress?.[fieldName]),
  );
}

function normalizePriorityRecoveryDecisionPendingAckNodeIds(
  priorityRecoveryDecisionSnapshots = null,
) {
  const snapshots = Array.isArray(
    priorityRecoveryDecisionSnapshots?.[
      PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD.SNAPSHOTS
    ],
  ) ?
    priorityRecoveryDecisionSnapshots[
      PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD.SNAPSHOTS
    ] :
    PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  return normalizeDistinctStringArray(
    snapshots.flatMap((snapshot) =>
      normalizeDistinctStringArray(
        snapshot?.[
          PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD.PUBLICATION
        ]?.[
          PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD.PENDING_ACK_NODE_IDS
        ],
      ),
    ),
  );
}

function resolveRawPublicationConvergenceGate(
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  if (isRecord(publicationConvergenceGate)) {
    return publicationConvergenceGate;
  }
  if (isRecord(publicationConvergence?.publicationRecoveryGate)) {
    return publicationConvergence.publicationRecoveryGate;
  }
  return null;
}

function resolvePriorityRecoveryClosureWitness(
  publicationConvergence = null,
  rawPublicationConvergenceGate = null,
  priorityRecoveryDecisionSnapshots = null,
) {
  if (isRecord(priorityRecoveryDecisionSnapshots?.closureWitness)) {
    return priorityRecoveryDecisionSnapshots.closureWitness;
  }
  if (isRecord(rawPublicationConvergenceGate?.priorityRecoveryClosureWitness)) {
    return rawPublicationConvergenceGate.priorityRecoveryClosureWitness;
  }
  if (isRecord(publicationConvergence?.priorityRecoveryClosureWitness)) {
    return publicationConvergence.priorityRecoveryClosureWitness;
  }
  return null;
}

function buildCanonicalPublicationConvergenceGate(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const priorityRecoveryObservation = isRecord(
    options.priorityRecoveryObservation,
  ) ?
    options.priorityRecoveryObservation :
    null;
  const priorityRecoveryDecisionSnapshots = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  ) ?
    options.priorityRecoveryDecisionSnapshots :
    null;
  const rawPublicationConvergenceGate = resolveRawPublicationConvergenceGate(
    publicationConvergence,
    options.publicationConvergenceGate,
  );
  const priorityRecoveryClosureWitness = isRecord(
    options.priorityRecoveryClosureWitness,
  ) ?
    options.priorityRecoveryClosureWitness :
    resolvePriorityRecoveryClosureWitness(
      publicationConvergence,
      rawPublicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
    );
  const activeGateProgressRecords = normalizeActiveGateProgressRecords({
    activeGate:
      options.activeGate ||
      priorityRecoveryObservation?.activeGate,
    activeGateProgress:
      options.activeGateProgress ||
      priorityRecoveryObservation?.activeGateProgress,
    activeGateBestProgress:
      options.activeGateBestProgress ||
      priorityRecoveryObservation?.activeGateBestProgress,
  });
  const activeGatePendingAckNodeIds = normalizeActiveGateProgressNodeIds(
    activeGateProgressRecords,
    [
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PENDING_ACK_NODE_IDS,
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_PENDING_ACK_NODE_IDS,
    ],
  );
  const decisionPendingAckNodeIds =
    normalizePriorityRecoveryDecisionPendingAckNodeIds(
      priorityRecoveryDecisionSnapshots,
    );
  const activeGateMissingPublishedNodeIds = normalizeActiveGateProgressNodeIds(
    activeGateProgressRecords,
    [
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .MISSING_PUBLISHED_NODE_IDS,
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_MISSING_PUBLISHED_NODE_IDS,
    ],
  );
  const requiredAckNodeListInput = resolvePublicationRecoveryAckNodeListInput([
    resolvePublicationRecoveryGateRequiredAckNodeListInput(
      rawPublicationConvergenceGate,
    ),
    resolvePublicationRecoveryConvergenceRequiredAckNodeListInput(
      publicationConvergence,
    ),
  ]);
  const acknowledgedNodeListInput = resolvePublicationRecoveryAckNodeListInput([
    resolvePublicationRecoveryGateAcknowledgedNodeListInput(
      rawPublicationConvergenceGate,
    ),
    resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput(
      publicationConvergence,
    ),
  ]);
  const pendingAckEvidence = normalizePublicationRecoveryAckEvidence({
    requiredAckNodeListInput,
    acknowledgedNodeIds: acknowledgedNodeListInput.value,
    pendingAckNodeIds: normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(rawPublicationConvergenceGate
        ?.pendingAckNodeIds),
      ...normalizeDistinctStringArray(publicationConvergence?.pendingAckNodeIds),
      ...normalizeDistinctStringArray(priorityRecoveryObservation
        ?.pendingAckNodeIds),
      ...activeGatePendingAckNodeIds,
      ...decisionPendingAckNodeIds,
    ]),
    pendingAckCountValues: [
      rawPublicationConvergenceGate?.pendingAckCount,
      publicationConvergence?.pendingAckCount,
      priorityRecoveryObservation?.pendingAckCount,
      normalizeActiveGateProgressCount(
        activeGateProgressRecords,
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PENDING_ACK_COUNT,
      ),
    ],
  });
  const missingPublishedCount = normalizeMaximumNonNegativeInteger([
    rawPublicationConvergenceGate?.missingPublishedCount,
    publicationConvergence?.missingPublishedCount,
    priorityRecoveryObservation?.missingPublishedCount,
    activeGateMissingPublishedNodeIds.length,
    normalizeActiveGateProgressCount(
      activeGateProgressRecords,
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.MISSING_PUBLISHED_COUNT,
    ),
  ]);

  if (
    !publicationConvergence &&
    !rawPublicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryObservation &&
    activeGateProgressRecords.length === NUM.ZERO
  ) {
    return null;
  }

  const canonicalPublicationConvergenceGate = buildPublicationRecoveryGateSnapshot({
    ...(rawPublicationConvergenceGate || {}),
    publicationEpoch:
      rawPublicationConvergenceGate?.publicationEpoch ??
      publicationConvergence?.publicationEpoch ??
      priorityRecoveryObservation?.publicationEpoch ??
      null,
    publicationStatus:
      rawPublicationConvergenceGate?.publicationStatus ??
      publicationConvergence?.publicationStatus ??
      publicationConvergence?.status ??
      priorityRecoveryObservation?.publicationStatus ??
      null,
    publicationObservationState:
      rawPublicationConvergenceGate?.publicationObservationState ??
      publicationConvergence?.publicationObservationState ??
      null,
    recoveryProtocolState:
      rawPublicationConvergenceGate?.recoveryProtocolState ??
      publicationConvergence?.recoveryProtocolState ??
      publicationConvergence?.membershipLifecycleSummary
        ?.recoveryProtocolState ??
      priorityRecoveryObservation?.recoveryProtocolState ??
      null,
    priorityRecoveryReasonCodes:
      rawPublicationConvergenceGate?.reasonCodes ??
      rawPublicationConvergenceGate?.reasons ??
      publicationConvergence?.priorityRecoveryReasonCodes ??
      publicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary:
      rawPublicationConvergenceGate?.priorityPartitionSummary ??
      publicationConvergence?.priorityPartitionSummary ??
      priorityRecoveryObservation?.priorityPartitionSummary ??
      null,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness,
    ...(isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) ?
      {requiredAckNodeIds: pendingAckEvidence.requiredAckNodeIds} :
      {}),
    acknowledgedNodeIds: pendingAckEvidence.acknowledgedNodeIds,
    pendingAckNodeIds: pendingAckEvidence.pendingAckNodeIds,
    pendingAckCount: pendingAckEvidence.pendingAckCount,
    missingPublishedNodeIds: normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(rawPublicationConvergenceGate
        ?.missingPublishedNodeIds),
      ...normalizeDistinctStringArray(publicationConvergence
        ?.missingPublishedNodeIds),
      ...normalizeDistinctStringArray(publicationConvergence
        ?.missingPublishedRecoveryActiveNodeIds),
      ...normalizeDistinctStringArray(priorityRecoveryObservation
        ?.missingPublishedNodeIds),
      ...activeGateMissingPublishedNodeIds,
    ]),
    missingPublishedCount,
  });

  return Array.isArray(rawPublicationConvergenceGate?.reasons) ?
    {
      ...canonicalPublicationConvergenceGate,
      reasons: normalizeDistinctStringArray(rawPublicationConvergenceGate.reasons),
    } :
    canonicalPublicationConvergenceGate;
}

function buildCanonicalPriorityRecoveryObservation(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const publicationConvergenceGate = isRecord(options.publicationConvergenceGate) ?
    options.publicationConvergenceGate :
    null;
  const existingPriorityRecoveryObservation = isRecord(
    options.priorityRecoveryObservation,
  ) ?
    options.priorityRecoveryObservation :
    null;
  const priorityRecoveryDecisionSnapshots = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  ) ?
    options.priorityRecoveryDecisionSnapshots :
    null;
  const priorityRecoveryInvariants = isRecord(
    options.priorityRecoveryInvariants,
  ) ?
    options.priorityRecoveryInvariants :
    null;
  const logsTable = isRecord(options.logsTable) ? options.logsTable : null;
  const hasExplicitPublicationConvergenceGate =
    options.hasExplicitPublicationConvergenceGate === true;
  const hasActiveGateEvidenceSource =
    isRecord(options.activeGate) ||
    isRecord(options.activeGateProgress) ||
    isRecord(options.activeGateBestProgress) ||
    isRecord(options.activeGateNoProgress) ||
    Array.isArray(options.activeGateBlockerHistory);
  const hasCanonicalObservationSource =
    Boolean(publicationConvergence) ||
    hasExplicitPublicationConvergenceGate ||
    Boolean(priorityRecoveryDecisionSnapshots) ||
    Boolean(priorityRecoveryInvariants) ||
    Boolean(logsTable) ||
    hasActiveGateEvidenceSource;

  if (
    !publicationConvergence &&
    !publicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryInvariants &&
    !logsTable &&
    !existingPriorityRecoveryObservation
  ) {
    return null;
  }

  if (!hasCanonicalObservationSource && existingPriorityRecoveryObservation) {
    return existingPriorityRecoveryObservation;
  }

  const baseDerivedPriorityRecoveryObservation =
    buildPriorityRecoveryObservationSnapshot({
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants,
      activeGate:
        options.activeGate ||
        existingPriorityRecoveryObservation?.activeGate ||
        null,
      activeGateProgress:
        options.activeGateProgress ||
        existingPriorityRecoveryObservation?.activeGateProgress ||
        null,
      activeGateBestProgress:
        options.activeGateBestProgress ||
        existingPriorityRecoveryObservation?.activeGateBestProgress ||
        null,
      activeGateNoProgress:
        options.activeGateNoProgress ||
        existingPriorityRecoveryObservation?.activeGateNoProgress ||
        null,
      activeGateBlockerHistory:
        options.activeGateBlockerHistory ||
        existingPriorityRecoveryObservation?.activeGateBlockerHistory ||
        null,
      logsTable,
      closureRecordId: null,
      closureWitnessClass: null,
    });
  const existingClosureRecordId = normalizeOptionalString(
    existingPriorityRecoveryObservation?.closureRecordId,
  );
  const existingClosureWitnessClass = normalizeOptionalString(
    existingPriorityRecoveryObservation?.closureWitnessClass,
  );
  const shouldRetainClosureDiagnostics =
    (existingClosureRecordId || existingClosureWitnessClass) &&
    shouldRetainPriorityRecoveryClosureDiagnostics(
      baseDerivedPriorityRecoveryObservation,
    );
  const derivedPriorityRecoveryObservation =
    shouldRetainClosureDiagnostics ?
      {
        ...baseDerivedPriorityRecoveryObservation,
        ...(existingClosureRecordId ?
          {closureRecordId: existingClosureRecordId} :
          {}),
        ...(existingClosureWitnessClass ?
          {closureWitnessClass: existingClosureWitnessClass} :
          {}),
      } :
      baseDerivedPriorityRecoveryObservation;

  if (
    !existingPriorityRecoveryObservation ||
    !derivedPriorityRecoveryObservation
  ) {
    return derivedPriorityRecoveryObservation ||
      existingPriorityRecoveryObservation;
  }

  return samePriorityRecoveryObservationContract(
    existingPriorityRecoveryObservation,
    derivedPriorityRecoveryObservation,
  ) ?
    existingPriorityRecoveryObservation :
    derivedPriorityRecoveryObservation;
}

function buildObservationPublicationGate(priorityRecoveryObservation = null) {
  if (!isRecord(priorityRecoveryObservation)) {
    return null;
  }
  return buildPublicationRecoveryGateSnapshot({
    publicationEpoch: priorityRecoveryObservation.publicationEpoch ?? null,
    publicationStatus: priorityRecoveryObservation.publicationStatus ?? null,
    recoveryProtocolState:
      priorityRecoveryObservation.recoveryProtocolState ?? null,
    priorityRecoveryReasonCodes:
      priorityRecoveryObservation.priorityRecoveryReasonCodes ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary:
      priorityRecoveryObservation.priorityPartitionSummary ?? null,
    pendingAckNodeIds:
      priorityRecoveryObservation.pendingAckNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    pendingAckCount: priorityRecoveryObservation.pendingAckCount,
    missingPublishedNodeIds:
      priorityRecoveryObservation.missingPublishedNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    missingPublishedCount: priorityRecoveryObservation.missingPublishedCount,
  });
}

function samePublicationGateState(leftObservationGate = null, rightObservationGate = null) {
  if (!leftObservationGate && !rightObservationGate) {
    return true;
  }
  if (!leftObservationGate || !rightObservationGate) {
    return false;
  }
  const leftPendingAckNodeIds = normalizeDistinctStringArray(
    leftObservationGate.pendingAckNodeIds,
  );
  const rightPendingAckNodeIds = normalizeDistinctStringArray(
    rightObservationGate.pendingAckNodeIds,
  );
  const leftMissingPublishedNodeIds = normalizeDistinctStringArray(
    leftObservationGate.missingPublishedNodeIds,
  );
  const rightMissingPublishedNodeIds = normalizeDistinctStringArray(
    rightObservationGate.missingPublishedNodeIds,
  );
  return normalizeOptionalString(leftObservationGate.state) ===
      normalizeOptionalString(rightObservationGate.state) &&
    normalizeBoolean(leftObservationGate.publicationPending) ===
      normalizeBoolean(rightObservationGate.publicationPending) &&
    normalizeBoolean(leftObservationGate.prioritySpreadPending) ===
      normalizeBoolean(rightObservationGate.prioritySpreadPending) &&
    normalizeNonNegativeInteger(leftObservationGate.pendingAckCount) ===
      normalizeNonNegativeInteger(rightObservationGate.pendingAckCount) &&
    normalizeNonNegativeInteger(leftObservationGate.missingPublishedCount) ===
      normalizeNonNegativeInteger(rightObservationGate.missingPublishedCount) &&
    leftPendingAckNodeIds.length === rightPendingAckNodeIds.length &&
    leftPendingAckNodeIds.every((nodeId, index) =>
      nodeId === rightPendingAckNodeIds[index],
    ) &&
    leftMissingPublishedNodeIds.length === rightMissingPublishedNodeIds.length &&
    leftMissingPublishedNodeIds.every((nodeId, index) =>
      nodeId === rightMissingPublishedNodeIds[index],
    );
}

function sameStringArray(leftValues = [], rightValues = []) {
  const left = normalizeDistinctStringArray(leftValues);
  const right = normalizeDistinctStringArray(rightValues);
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function resolvePriorityRecoveryCurrentSummary(priorityRecoveryObservation = null) {
  return isRecord(priorityRecoveryObservation?.priorityRecoveryCurrentSummary) ?
    priorityRecoveryObservation.priorityRecoveryCurrentSummary :
    null;
}

function isEmptyPriorityRecoveryCurrentSummary(currentSummary = null) {
  if (!currentSummary) {
    return true;
  }
  return normalizeDistinctStringArray(currentSummary.unresolvedClassIds)
    .length === NUM.ZERO &&
    normalizeDistinctStringArray(currentSummary.unresolvedSemanticStateIds)
      .length === NUM.ZERO &&
    normalizeDistinctStringArray(currentSummary.blockedPartitionIds)
      .length === NUM.ZERO;
}

function shouldRetainPriorityRecoveryClosureDiagnostics(
  priorityRecoveryObservation = null,
) {
  const priorityRecoveryCurrentSummary =
    resolvePriorityRecoveryCurrentSummary(priorityRecoveryObservation);
  return priorityRecoveryObservation?.prioritySpreadPending === true ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryReasonCodes,
    ).length > NUM.ZERO ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds,
    ).length > NUM.ZERO ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionIds,
    ).length > NUM.ZERO ||
    normalizeNonNegativeInteger(
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount,
    ) > NUM.ZERO ||
    normalizeNonNegativeInteger(
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionCount,
    ) > NUM.ZERO ||
    !isEmptyPriorityRecoveryCurrentSummary(priorityRecoveryCurrentSummary);
}

function samePriorityRecoveryCurrentSummary(
  leftObservation = null,
  rightObservation = null,
) {
  const leftCurrentSummary = resolvePriorityRecoveryCurrentSummary(
    leftObservation,
  );
  const rightCurrentSummary = resolvePriorityRecoveryCurrentSummary(
    rightObservation,
  );
  if (!leftCurrentSummary && !rightCurrentSummary) {
    return true;
  }
  if (!leftCurrentSummary || !rightCurrentSummary) {
    return isEmptyPriorityRecoveryCurrentSummary(leftCurrentSummary) &&
      isEmptyPriorityRecoveryCurrentSummary(rightCurrentSummary);
  }
  return normalizeOptionalString(leftCurrentSummary.scope) ===
      normalizeOptionalString(rightCurrentSummary.scope) &&
    sameStringArray(
      leftCurrentSummary.unresolvedClassIds,
      rightCurrentSummary.unresolvedClassIds,
    ) &&
    sameStringArray(
      leftCurrentSummary.unresolvedSemanticStateIds,
      rightCurrentSummary.unresolvedSemanticStateIds,
    ) &&
    sameStringArray(
      leftCurrentSummary.blockedPartitionIds,
      rightCurrentSummary.blockedPartitionIds,
    );
}

function samePriorityRecoveryObservationContract(
  leftObservation = null,
  rightObservation = null,
) {
  return samePublicationGateState(
    buildObservationPublicationGate(leftObservation),
    buildObservationPublicationGate(rightObservation),
  ) &&
    normalizeOptionalString(leftObservation?.closureRecordId) ===
      normalizeOptionalString(rightObservation?.closureRecordId) &&
    normalizeOptionalString(leftObservation?.closureWitnessClass) ===
      normalizeOptionalString(rightObservation?.closureWitnessClass) &&
    normalizeOptionalString(leftObservation?.priorityRecoveryClosureState) ===
      normalizeOptionalString(rightObservation?.priorityRecoveryClosureState) &&
    sameStringArray(
      leftObservation?.priorityRecoveryReasonCodes,
      rightObservation?.priorityRecoveryReasonCodes,
    ) &&
    samePriorityRecoveryCurrentSummary(leftObservation, rightObservation) &&
    sameStringArray(
      leftObservation?.priorityRecoveryProgressClassIds,
      rightObservation?.priorityRecoveryProgressClassIds,
    ) &&
    sameStringArray(
      leftObservation?.priorityRecoverySemanticStateIds,
      rightObservation?.priorityRecoverySemanticStateIds,
    ) &&
    sameStringArray(
      leftObservation?.priorityRecoveryBlockedPartitionIds,
      rightObservation?.priorityRecoveryBlockedPartitionIds,
    );
}

function buildCanonicalPublicationConvergence(options = {}) {
  const rawPublicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const publicationConvergenceGate = isRecord(options.publicationConvergenceGate) ?
    options.publicationConvergenceGate :
    null;
  const priorityRecoveryObservation = isRecord(options.priorityRecoveryObservation) ?
    options.priorityRecoveryObservation :
    null;
  const priorityRecoveryDecisionSnapshots = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  ) ?
    options.priorityRecoveryDecisionSnapshots :
    null;
  const activeGateProgressRecords = normalizeActiveGateProgressRecords({
    activeGate:
      options.activeGate ||
      priorityRecoveryObservation?.activeGate,
    activeGateProgress:
      options.activeGateProgress ||
      priorityRecoveryObservation?.activeGateProgress,
    activeGateBestProgress:
      options.activeGateBestProgress ||
      priorityRecoveryObservation?.activeGateBestProgress,
  });
  const activeGatePendingAckNodeIds = normalizeActiveGateProgressNodeIds(
    activeGateProgressRecords,
    [
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PENDING_ACK_NODE_IDS,
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_PENDING_ACK_NODE_IDS,
    ],
  );
  const decisionPendingAckNodeIds =
    normalizePriorityRecoveryDecisionPendingAckNodeIds(
      priorityRecoveryDecisionSnapshots,
    );
  const activeGateMissingPublishedNodeIds = normalizeActiveGateProgressNodeIds(
    activeGateProgressRecords,
    [
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .MISSING_PUBLISHED_NODE_IDS,
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_MISSING_PUBLISHED_NODE_IDS,
    ],
  );

  if (
    !rawPublicationConvergence &&
    !publicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryObservation &&
    activeGateProgressRecords.length === NUM.ZERO
  ) {
    return null;
  }

  const publicationEpoch =
    normalizePublicationEpoch(priorityRecoveryObservation?.publicationEpoch) ??
    normalizePublicationEpoch(publicationConvergenceGate?.publicationEpoch) ??
    normalizePublicationEpoch(rawPublicationConvergence?.publicationEpoch);
  const publicationStatus =
    normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
    normalizeOptionalString(rawPublicationConvergence?.publicationStatus) ||
    normalizeOptionalString(rawPublicationConvergence?.status);
  const recoveryProtocolState =
    normalizeOptionalString(priorityRecoveryObservation?.recoveryProtocolState) ||
    normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
    normalizeOptionalString(rawPublicationConvergence?.recoveryProtocolState) ||
    normalizeOptionalString(
      rawPublicationConvergence?.membershipLifecycleSummary
        ?.recoveryProtocolState,
    );
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      publicationConvergenceGate?.reasonCodes ??
      publicationConvergenceGate?.reasons ??
      rawPublicationConvergence?.priorityRecoveryReasonCodes ??
      rawPublicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const priorityPartitionSummary =
    priorityRecoveryObservation?.priorityPartitionSummary ??
    publicationConvergenceGate?.priorityPartitionSummary ??
    rawPublicationConvergence?.priorityPartitionSummary ??
    null;
  const publishedActiveNodeIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.publishedActiveNodeIds ??
      rawPublicationConvergence?.publishedActiveNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const requiredAckNodeListInput = resolvePublicationRecoveryAckNodeListInput([
    resolvePublicationRecoveryGateRequiredAckNodeListInput(
      publicationConvergenceGate,
    ),
    resolvePublicationRecoveryConvergenceRequiredAckNodeListInput(
      rawPublicationConvergence,
    ),
  ]);
  const acknowledgedNodeListInput = resolvePublicationRecoveryAckNodeListInput([
    resolvePublicationRecoveryGateAcknowledgedNodeListInput(
      publicationConvergenceGate,
    ),
    resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput(
      rawPublicationConvergence,
    ),
  ]);
  const pendingAckEvidence = normalizePublicationRecoveryAckEvidence({
    requiredAckNodeListInput,
    acknowledgedNodeIds: acknowledgedNodeListInput.value,
    pendingAckNodeIds: normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(priorityRecoveryObservation
        ?.pendingAckNodeIds),
      ...normalizeDistinctStringArray(publicationConvergenceGate
        ?.pendingAckNodeIds),
      ...normalizeDistinctStringArray(rawPublicationConvergence
        ?.pendingAckNodeIds),
      ...activeGatePendingAckNodeIds,
      ...decisionPendingAckNodeIds,
    ]),
    pendingAckCountValues: [
      priorityRecoveryObservation?.pendingAckCount,
      publicationConvergenceGate?.pendingAckCount,
      rawPublicationConvergence?.pendingAckCount,
      normalizeActiveGateProgressCount(
        activeGateProgressRecords,
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PENDING_ACK_COUNT,
      ),
    ],
  });
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    [
      ...normalizeDistinctStringArray(publicationConvergenceGate
        ?.missingPublishedNodeIds),
      ...normalizeDistinctStringArray(rawPublicationConvergence
        ?.missingPublishedNodeIds),
      ...normalizeDistinctStringArray(rawPublicationConvergence
        ?.missingPublishedRecoveryActiveNodeIds),
      ...normalizeDistinctStringArray(priorityRecoveryObservation
        ?.missingPublishedNodeIds),
      ...activeGateMissingPublishedNodeIds,
    ],
  );
  const missingPublishedCount = normalizeMaximumNonNegativeInteger([
    missingPublishedNodeIds.length,
    priorityRecoveryObservation?.missingPublishedCount,
    publicationConvergenceGate?.missingPublishedCount,
    rawPublicationConvergence?.missingPublishedCount,
    normalizeActiveGateProgressCount(
      activeGateProgressRecords,
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.MISSING_PUBLISHED_COUNT,
    ),
  ]);
  const closureRecordId =
    normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
    normalizeOptionalString(publicationConvergenceGate?.closureRecordId) ||
    normalizeOptionalString(rawPublicationConvergence?.closureRecordId);
  const closureWitnessClass =
    normalizeOptionalString(priorityRecoveryObservation?.closureWitnessClass) ||
    normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass) ||
    normalizeOptionalString(rawPublicationConvergence?.closureWitnessClass);
  const priorityRecoveryClosureWitness =
    publicationConvergenceGate?.priorityRecoveryClosureWitness ||
    rawPublicationConvergence?.priorityRecoveryClosureWitness ||
    null;
  const priorityRecoveryCurrentSummary = isRecord(
    priorityRecoveryObservation?.priorityRecoveryCurrentSummary,
  ) ?
    priorityRecoveryObservation.priorityRecoveryCurrentSummary :
    null;

  return {
    ...(rawPublicationConvergence || {}),
    ...(publicationEpoch !== null ? {publicationEpoch} : {}),
    ...(publicationStatus ? {status: publicationStatus, publicationStatus} : {}),
    ...(recoveryProtocolState ? {recoveryProtocolState} : {}),
    priorityRecoveryReasonCodes,
    priorityPartitionSummary,
    priorityRecoveryClosureWitness,
    publishedActiveNodeIds,
    ...(isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) ?
      {requiredAckNodeIds: pendingAckEvidence.requiredAckNodeIds} :
      {}),
    ...(isPublicationRecoveryAckNodeListProvided(acknowledgedNodeListInput) ?
      {acknowledgedNodeIds: pendingAckEvidence.acknowledgedNodeIds} :
      {}),
    pendingAckNodeIds: pendingAckEvidence.pendingAckNodeIds,
    pendingAckCount: pendingAckEvidence.pendingAckCount,
    pendingAckEvidenceState: pendingAckEvidence.evidenceState,
    missingPublishedNodeIds,
    missingPublishedCount,
    publicationPending:
      priorityRecoveryObservation?.publicationPending === true ||
      publicationConvergenceGate?.publicationPending === true,
    prioritySpreadPending:
      priorityRecoveryObservation?.prioritySpreadPending === true ||
      publicationConvergenceGate?.prioritySpreadPending === true,
    ...(priorityRecoveryCurrentSummary ?
      {priorityRecoveryCurrentSummary} :
      {}),
    closureRecordId,
    closureWitnessClass,
    ...(publicationConvergenceGate ?
      {publicationRecoveryGate: publicationConvergenceGate} :
      {}),
  };
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
    priorityRecoveryObservation,
    activeGate: options.activeGate,
    activeGateProgress: options.activeGateProgress,
    activeGateBestProgress: options.activeGateBestProgress,
  });

  return Object.freeze({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
  });
}

export {
  buildCanonicalPublicationRecoveryEvidence,
};
