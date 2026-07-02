/**
 * Evidence normalizer for operation workflow progress decisions.
 */

import {
  OPERATION_WORKFLOW_COMMAND_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
  OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE,
  OPERATION_WORKFLOW_EVIDENCE_FIELDS,
  OPERATION_WORKFLOW_FORBIDDEN_INPUT_FIELDS,
  OPERATION_WORKFLOW_FORBIDDEN_INPUT_STATE,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
  OPERATION_WORKFLOW_RECORD_FIELDS,
  OPERATION_WORKFLOW_RETRY_BUDGET_STATE,
  OPERATION_WORKFLOW_RETRY_DEADLINE_STATE,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_TYPE,
  OPERATION_WORKFLOW_WAKE_STATE,
} from './operation-workflow-owner-constants.js';

const OPERATION_WORKFLOW_EMPTY_RECORD = Object.freeze({});

const OPERATION_WORKFLOW_CONTRACT_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.OUTSIDE_CONTRACT,
    matches: (evidence) =>
      evidence.requestedContractState ===
        OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.OUTSIDE_CONTRACT,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.OUTSIDE_CONTRACT,
    matches: (evidence) =>
      evidence.forbiddenInputState ===
        OPERATION_WORKFLOW_FORBIDDEN_INPUT_STATE.PRESENT,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.OUTSIDE_CONTRACT,
    matches: (evidence) => evidence.ownerMatches !== true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.OUTSIDE_CONTRACT,
    matches: (evidence) => evidence.boundaryMatches !== true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.INSIDE_CONTRACT,
    matches: () => true,
  }),
]);

function isOperationWorkflowRecord(value) {
  return Boolean(value) &&
    typeof value === OPERATION_WORKFLOW_TYPE.OBJECT &&
    !Array.isArray(value);
}

function selectOperationWorkflowVariant(value, variants, fallback) {
  return Object.values(variants).includes(value) ? value : fallback;
}

function normalizeOperationWorkflowText(value, fallback) {
  return typeof value === OPERATION_WORKFLOW_TYPE.STRING ?
    value.trim() || fallback :
    fallback;
}

function normalizeOperationWorkflowRevision(value, fallback) {
  if (typeof value === OPERATION_WORKFLOW_TYPE.NUMBER) {
    return value;
  }
  return normalizeOperationWorkflowText(value, fallback);
}

function readOperationWorkflowRecord(raw) {
  return isOperationWorkflowRecord(raw) ?
    raw :
    OPERATION_WORKFLOW_EMPTY_RECORD;
}

function normalizeOperationWorkflowRecordState(raw) {
  return isOperationWorkflowRecord(raw) ?
    OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.AVAILABLE :
    OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.UNAVAILABLE;
}

function normalizeDurableOperationEvidence(raw) {
  const record = readOperationWorkflowRecord(raw);
  return Object.freeze({
    recordState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.RECORD_STATE],
      OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
      normalizeOperationWorkflowRecordState(raw),
    ),
    operationKey: normalizeOperationWorkflowText(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.OPERATION_KEY],
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
    ),
    terminalState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.TERMINAL_STATE] ||
        record[OPERATION_WORKFLOW_RECORD_FIELDS.TERMINAL_MARKER],
      OPERATION_WORKFLOW_TERMINAL_STATE,
      OPERATION_WORKFLOW_TERMINAL_STATE.UNAVAILABLE,
    ),
    dispatchState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.DISPATCH_STATE],
      OPERATION_WORKFLOW_DISPATCH_STATE,
      OPERATION_WORKFLOW_DISPATCH_STATE.UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.SOURCE_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function normalizeWorkflowHistoryEvidence(raw) {
  const record = readOperationWorkflowRecord(raw);
  return Object.freeze({
    freshnessState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.FRESHNESS_STATE],
      OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
      OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.UNAVAILABLE,
    ),
    terminalState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.TERMINAL_STATE],
      OPERATION_WORKFLOW_TERMINAL_STATE,
      OPERATION_WORKFLOW_TERMINAL_STATE.UNAVAILABLE,
    ),
    transitionState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.TRANSITION_STATE],
      OPERATION_WORKFLOW_TRANSITION_STATE,
      OPERATION_WORKFLOW_TRANSITION_STATE.UNAVAILABLE,
    ),
    commandState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.COMMAND_STATE],
      OPERATION_WORKFLOW_COMMAND_STATE,
      OPERATION_WORKFLOW_COMMAND_STATE.UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.SOURCE_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function normalizeOwnerLeaseEvidence(raw) {
  const record = readOperationWorkflowRecord(raw);
  return Object.freeze({
    authorityState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.AUTHORITY_STATE],
      OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
      OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.UNAVAILABLE,
    ),
    freshnessState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.FRESHNESS_STATE],
      OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
      OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.UNAVAILABLE,
    ),
    ownerNodeKey: normalizeOperationWorkflowText(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.OWNER_NODE_KEY],
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OWNER_NODE_KEY_UNAVAILABLE,
    ),
    leaseTerm: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.LEASE_TERM],
      OPERATION_WORKFLOW_REVISION_VARIANTS.LEASE_TERM_UNAVAILABLE,
    ),
  });
}

function normalizeSerialDependencyEvidence(raw) {
  const record = readOperationWorkflowRecord(raw);
  return Object.freeze({
    dependencyState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.DEPENDENCY_STATE],
      OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
      OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.CLEAR,
    ),
    priorOperationKey: normalizeOperationWorkflowText(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.PRIOR_OPERATION_KEY],
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.PRIOR_OPERATION_KEY_UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.SOURCE_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function normalizeRetryBudgetEvidence(raw) {
  const record = readOperationWorkflowRecord(raw);
  return Object.freeze({
    budgetState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.BUDGET_STATE],
      OPERATION_WORKFLOW_RETRY_BUDGET_STATE,
      OPERATION_WORKFLOW_RETRY_BUDGET_STATE.UNAVAILABLE,
    ),
    deadlineState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.DEADLINE_STATE],
      OPERATION_WORKFLOW_RETRY_DEADLINE_STATE,
      OPERATION_WORKFLOW_RETRY_DEADLINE_STATE.UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.SOURCE_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function normalizeTimeoutBudgetEvidence(raw) {
  const record = readOperationWorkflowRecord(raw);
  return Object.freeze({
    timeoutState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.TIMEOUT_STATE],
      OPERATION_WORKFLOW_TIMEOUT_STATE,
      OPERATION_WORKFLOW_TIMEOUT_STATE.UNAVAILABLE,
    ),
    staleProgressState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.STALE_PROGRESS_STATE],
      OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
      OPERATION_WORKFLOW_STALE_PROGRESS_STATE.UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.SOURCE_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function normalizePublicationFenceEvidence(raw) {
  const record = readOperationWorkflowRecord(raw);
  return Object.freeze({
    fenceState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.FENCE_STATE],
      OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
      OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.UNAVAILABLE,
    ),
    requiredRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.REQUIRED_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS
        .REQUIRED_PUBLICATION_REVISION_UNAVAILABLE,
    ),
    observedRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.OBSERVED_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS
        .OBSERVED_PUBLICATION_REVISION_UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.SOURCE_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function normalizeDispatchObservationEvidence(raw) {
  const record = readOperationWorkflowRecord(raw);
  return Object.freeze({
    dispatchState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.DISPATCH_STATE],
      OPERATION_WORKFLOW_DISPATCH_STATE,
      OPERATION_WORKFLOW_DISPATCH_STATE.UNAVAILABLE,
    ),
    wakeState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.WAKE_STATE],
      OPERATION_WORKFLOW_WAKE_STATE,
      OPERATION_WORKFLOW_WAKE_STATE.UNAVAILABLE,
    ),
    commandState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.COMMAND_STATE],
      OPERATION_WORKFLOW_COMMAND_STATE,
      OPERATION_WORKFLOW_COMMAND_STATE.UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationWorkflowRevision(
      record[OPERATION_WORKFLOW_RECORD_FIELDS.SOURCE_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function hasForbiddenOperationWorkflowInput(raw) {
  const record = readOperationWorkflowRecord(raw);
  return OPERATION_WORKFLOW_FORBIDDEN_INPUT_FIELDS.some((field) =>
    Object.hasOwn(record, field),
  );
}

function resolveForbiddenInputState(raw) {
  const record = readOperationWorkflowRecord(raw);
  const requestedState = selectOperationWorkflowVariant(
    record[OPERATION_WORKFLOW_EVIDENCE_FIELDS.FORBIDDEN_INPUT_STATE],
    OPERATION_WORKFLOW_FORBIDDEN_INPUT_STATE,
    OPERATION_WORKFLOW_FORBIDDEN_INPUT_STATE.ABSENT,
  );
  return hasForbiddenOperationWorkflowInput(raw) ?
    OPERATION_WORKFLOW_FORBIDDEN_INPUT_STATE.PRESENT :
    requestedState;
}

function resolveOperationWorkflowEvidenceContractState(raw) {
  const record = readOperationWorkflowRecord(raw);
  const inputOwner = normalizeOperationWorkflowText(
    record[OPERATION_WORKFLOW_EVIDENCE_FIELDS.OWNER],
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OWNER_KEY_UNAVAILABLE,
  );
  const inputBoundary = normalizeOperationWorkflowText(
    record[OPERATION_WORKFLOW_EVIDENCE_FIELDS.BOUNDARY],
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OWNER_KEY_UNAVAILABLE,
  );
  const contractEvidence = Object.freeze({
    requestedContractState: selectOperationWorkflowVariant(
      record[OPERATION_WORKFLOW_EVIDENCE_FIELDS.CONTRACT_STATE],
      OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE,
      OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.INSIDE_CONTRACT,
    ),
    forbiddenInputState: resolveForbiddenInputState(raw),
    ownerMatches: inputOwner === OPERATION_WORKFLOW_OWNER,
    boundaryMatches:
      inputBoundary === OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  });
  return OPERATION_WORKFLOW_CONTRACT_STATE_TABLE.find((entry) =>
    entry.matches(contractEvidence),
  ).state;
}

function normalizeOperationWorkflowEvidence(rawEvidence) {
  const raw = readOperationWorkflowRecord(rawEvidence);
  const contractState = resolveOperationWorkflowEvidenceContractState(raw);
  const progressContract = raw.progressContract || {
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: 'workflow_progress',
    state: contractState === OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.INSIDE_CONTRACT ? 'inside_contract' : 'outside_contract',
    reason: 'operation_workflow_evidence_normalized',
    nextAction: 'wait_for_owner_progress',
    wakeSource: 'operation_lifecycle_event',
    retryAfterMs: 0,
    terminalState: 'satisfied',
    evidencePath: 'test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json',
    blockingDependency: 'operation_progress',
  };
  return Object.freeze({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    operationKey: normalizeOperationWorkflowText(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.OPERATION_KEY],
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
    ),
    correlationKey: normalizeOperationWorkflowText(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.CORRELATION_KEY],
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.CORRELATION_KEY_UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationWorkflowRevision(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.SOURCE_REVISION],
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
    durableOperation: normalizeDurableOperationEvidence(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.DURABLE_OPERATION],
    ),
    workflowHistory: normalizeWorkflowHistoryEvidence(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.WORKFLOW_HISTORY],
    ),
    ownerLease: normalizeOwnerLeaseEvidence(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.OWNER_LEASE],
    ),
    serialDependency: normalizeSerialDependencyEvidence(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.SERIAL_DEPENDENCY],
    ),
    retryBudget: normalizeRetryBudgetEvidence(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.RETRY_BUDGET],
    ),
    timeoutBudget: normalizeTimeoutBudgetEvidence(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.TIMEOUT_BUDGET],
    ),
    publicationFence: normalizePublicationFenceEvidence(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.PUBLICATION_FENCE],
    ),
    dispatchObservation: normalizeDispatchObservationEvidence(
      raw[OPERATION_WORKFLOW_EVIDENCE_FIELDS.DISPATCH_OBSERVATION],
    ),
    contractState,
    progressContract,
  });
}

export {
  normalizeOperationWorkflowEvidence,
};
