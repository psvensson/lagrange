/**
 * Canonical scalar owners for the operation workflow progress decision kernel.
 */

const OPERATION_WORKFLOW_OWNER = 'operation_workflow_owner';
const OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL =
  'workflow_progress_decision_kernel';

const OPERATION_WORKFLOW_TEXT = Object.freeze({
  EMPTY: '',
});

const OPERATION_WORKFLOW_TYPE = Object.freeze({
  NUMBER: 'number',
  OBJECT: 'object',
  STRING: 'string',
});

const OPERATION_WORKFLOW_EVIDENCE_FIELDS = Object.freeze({
  OWNER: 'owner',
  BOUNDARY: 'boundary',
  OPERATION_KEY: 'operationKey',
  CORRELATION_KEY: 'correlationKey',
  SOURCE_REVISION: 'sourceRevision',
  DURABLE_OPERATION: 'durableOperation',
  WORKFLOW_HISTORY: 'workflowHistory',
  OWNER_LEASE: 'ownerLease',
  SERIAL_DEPENDENCY: 'serialDependency',
  RETRY_BUDGET: 'retryBudget',
  TIMEOUT_BUDGET: 'timeoutBudget',
  PUBLICATION_FENCE: 'publicationFence',
  DISPATCH_OBSERVATION: 'dispatchObservation',
  CONTRACT_STATE: 'contractState',
  FORBIDDEN_INPUT_STATE: 'forbiddenInputState',
});

const OPERATION_WORKFLOW_RECORD_FIELDS = Object.freeze({
  AUTHORITY_STATE: 'authorityState',
  BUDGET_STATE: 'budgetState',
  COMMAND_STATE: 'commandState',
  CONTRACT_STATE: 'contractState',
  DEADLINE_STATE: 'deadlineState',
  DEPENDENCY_STATE: 'dependencyState',
  DISPATCH_STATE: 'dispatchState',
  FENCE_STATE: 'fenceState',
  FRESHNESS_STATE: 'freshnessState',
  LEASE_TERM: 'leaseTerm',
  OPERATION_KEY: 'operationKey',
  OWNER_NODE_KEY: 'ownerNodeKey',
  PRIOR_OPERATION_KEY: 'priorOperationKey',
  RECORD_STATE: 'recordState',
  REQUIRED_REVISION: 'requiredRevision',
  OBSERVED_REVISION: 'observedRevision',
  SOURCE_REVISION: 'sourceRevision',
  STALE_PROGRESS_STATE: 'staleProgressState',
  TERMINAL_MARKER: 'terminalMarker',
  TERMINAL_STATE: 'terminalState',
  TIMEOUT_STATE: 'timeoutState',
  TRANSITION_STATE: 'transitionState',
  WAKE_STATE: 'wakeState',
});

const OPERATION_WORKFLOW_FORBIDDEN_INPUT_FIELDS = Object.freeze([
  'priorityRecoveryWorkflowProgressLabel',
  'diagnosticBlockerName',
  'cacheMissPresent',
  'rawRowAbsence',
  'wallClockAgeMs',
  'dispatchCounter',
  'publicationSymptom',
]);

const OPERATION_WORKFLOW_PROGRESS_STATE_VALUES = Object.freeze({
  OPERATION_INPUT_REJECTED: 'operation_input_rejected',
  TERMINAL_FAILURE_OBSERVED: 'terminal_failure_observed',
  TERMINAL_SUCCESS_OBSERVED: 'terminal_success_observed',
  AUTHORITATIVE_VISIBILITY_DEFERRED:
    'authoritative_visibility_deferred',
  STALE_PROGRESS_RECONCILE_REQUIRED:
    'stale_progress_reconcile_required',
  SERIAL_DEPENDENCY_PENDING: 'serial_dependency_pending',
  LOCAL_OWNER_DISPATCH_READY: 'local_owner_dispatch_ready',
  REMOTE_OWNER_WAKE_REQUIRED: 'remote_owner_wake_required',
  EXISTING_OPERATION_ADVANCEMENT_READY:
    'existing_operation_advancement_ready',
  OWNER_PROGRESS_WAIT_REQUIRED: 'owner_progress_wait_required',
});

const OPERATION_WORKFLOW_OUTCOME_VALUES = Object.freeze({
  REJECT_OUT_OF_CONTRACT_EVIDENCE:
    'reject_out_of_contract_evidence',
  TERMINAL_FAILURE: 'terminal_failure',
  TERMINAL_SUCCESS: 'terminal_success',
  DEFER_AUTHORITATIVE_VISIBILITY: 'defer_authoritative_visibility',
  RECONCILE_STALE_PROGRESS: 'reconcile_stale_progress',
  WAIT_FOR_SERIAL_OPERATION: 'wait_for_serial_operation',
  DISPATCH_LOCAL_OWNER: 'dispatch_local_owner',
  WAKE_REMOTE_OWNER: 'wake_remote_owner',
  ADVANCE_EXISTING_OPERATION: 'advance_existing_operation',
  WAIT_FOR_OWNER_PROGRESS: 'wait_for_owner_progress',
});

const OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES = Object.freeze({
  NO_OPERATION_EFFECT: 'no_operation_effect',
  DISPATCH_LOCAL_OWNER_COMMAND: 'dispatch_local_owner_command',
  WAKE_REMOTE_OWNER_COMMAND: 'wake_remote_owner_command',
  ADVANCE_EXISTING_OPERATION_COMMAND:
    'advance_existing_operation_command',
  RECONCILE_STALE_PROGRESS_COMMAND:
    'reconcile_stale_progress_command',
  RECORD_TERMINAL_SUCCESS_COMMAND:
    'record_terminal_success_command',
  RECORD_TERMINAL_FAILURE_COMMAND:
    'record_terminal_failure_command',
});

const OPERATION_WORKFLOW_REASON_CODE_VALUES = Object.freeze({
  OUTSIDE_CONTRACT_EVIDENCE: 'outside_contract_evidence',
  DURABLE_FAILURE_RECORDED: 'durable_failure_recorded',
  DURABLE_SUCCESS_RECORDED: 'durable_success_recorded',
  WORKFLOW_HISTORY_TERMINAL: 'workflow_history_terminal',
  PUBLICATION_FENCE_STALE: 'publication_fence_stale',
  TIMEOUT_BUDGET_EXPIRED: 'timeout_budget_expired',
  WORKFLOW_HISTORY_STALE: 'workflow_history_stale',
  SERIAL_DEPENDENCY_PENDING: 'serial_dependency_pending',
  LOCAL_OWNER_AUTHORITATIVE: 'local_owner_authoritative',
  DISPATCH_NOT_OBSERVED: 'dispatch_not_observed',
  REMOTE_OWNER_AUTHORITATIVE: 'remote_owner_authoritative',
  WAKE_REQUIRED: 'wake_required',
  WORKFLOW_TRANSITION_AVAILABLE: 'workflow_transition_available',
  OWNER_PROGRESS_IN_FLIGHT: 'owner_progress_in_flight',
});

const OPERATION_WORKFLOW_ABSENCE_VARIANT_VALUES = Object.freeze({
  OPERATION_RECORD_UNAVAILABLE: 'operation_record_unavailable',
  WORKFLOW_HISTORY_STALE: 'workflow_history_stale',
  OWNER_LEASE_UNAVAILABLE: 'owner_lease_unavailable',
  SERIAL_DEPENDENCY_CLEAR: 'serial_dependency_clear',
  PUBLICATION_FENCE_STALE: 'publication_fence_stale',
  NO_OPERATION_EFFECT:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
});

const OPERATION_WORKFLOW_IDENTIFIER_VARIANTS = Object.freeze({
  OPERATION_KEY_UNAVAILABLE: 'operation_key_unavailable',
  CORRELATION_KEY_UNAVAILABLE: 'correlation_key_unavailable',
  OWNER_KEY_UNAVAILABLE: 'owner_key_unavailable',
  OWNER_NODE_KEY_UNAVAILABLE: 'owner_node_key_unavailable',
  PRIOR_OPERATION_KEY_UNAVAILABLE: 'prior_operation_key_unavailable',
});

const OPERATION_WORKFLOW_REVISION_VARIANTS = Object.freeze({
  SOURCE_REVISION_UNAVAILABLE: 'source_revision_unavailable',
  LEASE_TERM_UNAVAILABLE: 'lease_term_unavailable',
  REQUIRED_PUBLICATION_REVISION_UNAVAILABLE:
    'required_publication_revision_unavailable',
  OBSERVED_PUBLICATION_REVISION_UNAVAILABLE:
    'observed_publication_revision_unavailable',
});

const OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE = Object.freeze({
  INSIDE_CONTRACT: 'inside_contract_evidence',
  OUTSIDE_CONTRACT: 'outside_contract_evidence',
});

const OPERATION_WORKFLOW_FORBIDDEN_INPUT_STATE = Object.freeze({
  ABSENT: 'forbidden_input_absent',
  PRESENT: 'forbidden_input_present',
});

const OPERATION_WORKFLOW_DURABLE_OPERATION_STATE = Object.freeze({
  AVAILABLE: 'operation_record_available',
  UNAVAILABLE:
    OPERATION_WORKFLOW_ABSENCE_VARIANT_VALUES.OPERATION_RECORD_UNAVAILABLE,
});

const OPERATION_WORKFLOW_TERMINAL_STATE = Object.freeze({
  FAILURE: 'terminal_failure',
  SUCCESS: 'terminal_success',
  NON_TERMINAL: 'operation_not_terminal',
  UNAVAILABLE: 'terminal_state_unavailable',
});

const OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE = Object.freeze({
  CURRENT: 'workflow_history_current',
  STALE: OPERATION_WORKFLOW_ABSENCE_VARIANT_VALUES.WORKFLOW_HISTORY_STALE,
  UNAVAILABLE: 'workflow_history_unavailable',
});

const OPERATION_WORKFLOW_TRANSITION_STATE = Object.freeze({
  AVAILABLE: 'workflow_transition_available',
  BLOCKED: 'workflow_transition_blocked',
  UNAVAILABLE: 'workflow_transition_unavailable',
});

const OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE = Object.freeze({
  LOCAL_AUTHORITATIVE: 'local_owner_authoritative',
  REMOTE_AUTHORITATIVE: 'remote_owner_authoritative',
  UNAVAILABLE:
    OPERATION_WORKFLOW_ABSENCE_VARIANT_VALUES.OWNER_LEASE_UNAVAILABLE,
});

const OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE = Object.freeze({
  CURRENT: 'owner_lease_current',
  STALE: 'owner_lease_stale',
  UNAVAILABLE:
    OPERATION_WORKFLOW_ABSENCE_VARIANT_VALUES.OWNER_LEASE_UNAVAILABLE,
});

const OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE = Object.freeze({
  CLEAR:
    OPERATION_WORKFLOW_ABSENCE_VARIANT_VALUES.SERIAL_DEPENDENCY_CLEAR,
  PENDING: 'serial_dependency_pending',
});

const OPERATION_WORKFLOW_RETRY_BUDGET_STATE = Object.freeze({
  AVAILABLE: 'retry_budget_available',
  EXHAUSTED: 'retry_budget_exhausted',
  UNAVAILABLE: 'retry_budget_unavailable',
});

const OPERATION_WORKFLOW_RETRY_DEADLINE_STATE = Object.freeze({
  ACTIVE: 'retry_deadline_active',
  EXPIRED: 'retry_deadline_expired',
  UNAVAILABLE: 'retry_deadline_unavailable',
});

const OPERATION_WORKFLOW_TIMEOUT_STATE = Object.freeze({
  ACTIVE: 'timeout_budget_active',
  EXPIRED: 'timeout_budget_expired',
  UNAVAILABLE: 'timeout_budget_unavailable',
});

const OPERATION_WORKFLOW_STALE_PROGRESS_STATE = Object.freeze({
  PROVEN: 'stale_progress_proven',
  NOT_OBSERVED: 'stale_progress_not_observed',
  UNAVAILABLE: 'stale_progress_unavailable',
});

const OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE = Object.freeze({
  CURRENT: 'publication_fence_current',
  STALE: OPERATION_WORKFLOW_ABSENCE_VARIANT_VALUES.PUBLICATION_FENCE_STALE,
  INCOMPLETE: 'publication_fence_incomplete',
  UNAVAILABLE: 'publication_fence_unavailable',
});

const OPERATION_WORKFLOW_DISPATCH_STATE = Object.freeze({
  OBSERVED: 'dispatch_observed',
  NOT_OBSERVED: 'dispatch_not_observed',
  IN_FLIGHT: 'dispatch_in_flight',
  UNAVAILABLE: 'dispatch_state_unavailable',
});

const OPERATION_WORKFLOW_WAKE_STATE = Object.freeze({
  OBSERVED: 'wake_observed',
  REQUIRED: 'wake_required',
  UNAVAILABLE: 'wake_state_unavailable',
});

const OPERATION_WORKFLOW_COMMAND_STATE = Object.freeze({
  IDLE: 'owner_command_idle',
  IN_FLIGHT: 'owner_command_in_flight',
  UNAVAILABLE: 'owner_command_unavailable',
});

export {
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_TEXT,
  OPERATION_WORKFLOW_TYPE,
  OPERATION_WORKFLOW_EVIDENCE_FIELDS,
  OPERATION_WORKFLOW_RECORD_FIELDS,
  OPERATION_WORKFLOW_FORBIDDEN_INPUT_FIELDS,
  OPERATION_WORKFLOW_PROGRESS_STATE_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_REASON_CODE_VALUES,
  OPERATION_WORKFLOW_ABSENCE_VARIANT_VALUES,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
  OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE,
  OPERATION_WORKFLOW_FORBIDDEN_INPUT_STATE,
  OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_RETRY_BUDGET_STATE,
  OPERATION_WORKFLOW_RETRY_DEADLINE_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_WAKE_STATE,
  OPERATION_WORKFLOW_COMMAND_STATE,
};
