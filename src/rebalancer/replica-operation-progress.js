import {WORKFLOW_STEP} from '../constants/index.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';

/**
 * ReplicaStatus - Single source of truth for replica states.
 * Used by RebalanceCoordinator, ReplicaHandler, CDC, and Admin CLI.
 *
 * @enum {string}
 */
const ReplicaStatus = {
  /** Operation created, not yet sent */
  PENDING: 'pending',
  /** Request sent, awaiting creation */
  CREATING: 'creating',
  /** Replica created, syncing data */
  SYNCING: 'syncing',
  /** Fully operational */
  ACTIVE: 'active',
  /** Removal in progress */
  REMOVING: 'removing',
  /** Fully removed */
  REMOVED: 'removed',
  /** Operation failed */
  FAILED: 'failed',
};

/**
 * Terminal statuses represent completed or failed operations.
 * A replica in one of these statuses has reached a final state.
 *
 * @type {string[]}
 */
const TERMINAL_STATUSES = [
  ReplicaStatus.ACTIVE,
  ReplicaStatus.REMOVED,
  ReplicaStatus.FAILED,
];

/**
 * SQL clause fragment for filtering by terminal statuses.
 * Built programmatically from TERMINAL_STATUSES to ensure consistency.
 * Usage: `WHERE status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})`
 *
 * @type {string}
 */
const TERMINAL_STATUS_SQL_CLAUSE =
  TERMINAL_STATUSES.map((s) => `'${s}'`).join(', ');

/**
 * Direction constants for adjustToOddCount function.
 *
 * @enum {string}
 */
const ADJUST_DIRECTION = Object.freeze({
  UP: 'up',
  DOWN: 'down',
});

/**
 * Workflow steps map to statuses.
 * Maps workflow step names to their corresponding ReplicaStatus values.
 *
 * @type {Object.<string, string>}
 */
const WORKFLOW_STEP_TO_STATUS = {
  [WORKFLOW_STEP.PENDING]: ReplicaStatus.PENDING,
  [WORKFLOW_STEP.SENDING]: ReplicaStatus.PENDING,
  [WORKFLOW_STEP.CREATING]: ReplicaStatus.CREATING,
  [WORKFLOW_STEP.SYNCING]: ReplicaStatus.SYNCING,
  [WORKFLOW_STEP.ACTIVE]: ReplicaStatus.ACTIVE,
  [WORKFLOW_STEP.STOPPING]: ReplicaStatus.REMOVING,
  [WORKFLOW_STEP.REMOVED]: ReplicaStatus.REMOVED,
};

const REPLICA_OPERATION_SEMANTIC_PHASE = Object.freeze({
  UNKNOWN: 'unknown',
  ACCEPTED: 'accepted',
  TARGET_READY: 'target_ready',
  SOURCE_RETIRING: 'source_retiring',
  SETTLED: 'settled',
  FAILED: 'failed',
});

const TERMINAL_REPLICA_OPERATION_SEMANTIC_PHASES = Object.freeze([
  REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED,
  REPLICA_OPERATION_SEMANTIC_PHASE.FAILED,
]);

/**
 * Operation types for replica operations.
 *
 * @enum {string}
 */
const OperationType = {
  /** Add a new replica */
  ADD: 'ADD',
  /** Remove an existing replica */
  REMOVE: 'REMOVE',
  /** Replace an existing replica (create/sync/promote/remove source) */
  REPLACE: 'REPLACE',
};

const COORDINATOR_OWNED_OPERATION_TYPES = Object.freeze([
  OperationType.ADD,
  OperationType.REMOVE,
  OperationType.REPLACE,
]);

const COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE =
  COORDINATOR_OWNED_OPERATION_TYPES
    .map((type) => `'${type}'`)
    .join(', ');

const REPLICA_OPERATION_RECORD_FIELD = Object.freeze({
  TYPE: 'type',
  OPERATION_TYPE: 'operation_type',
  OPERATION_TYPE_CAMEL: 'operationType',
  WORKFLOW_STEP: 'workflowStep',
  WORKFLOW_STEP_SNAKE: 'workflow_step',
  STATUS: 'status',
  SEMANTIC_PHASE: 'semanticPhase',
});

const SQL_FIELD = Object.freeze({
  TYPE: 'type',
  WORKFLOW_STEP: 'workflow_step',
  STATUS: 'status',
});

const SQL_LITERAL = Object.freeze({
  QUOTE: '\'',
  COMMA_SPACE: ', ',
  OPEN_PAREN: '(',
  CLOSE_PAREN: ')',
  EQUALS: ' = ',
  IN: ' IN ',
  AND: ' AND ',
  OR: ' OR ',
});

/**
 * Workflow steps for ADD operations.
 * Progress in order: PENDING -> SENDING -> CREATING -> SYNCING -> ACTIVE
 *
 * @type {string[]}
 */
const ADD_WORKFLOW_STEPS = [
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
  WORKFLOW_STEP.SYNCING,
  WORKFLOW_STEP.ACTIVE,
];

/**
 * Workflow steps for REMOVE operations.
 * Progress in order: PENDING -> SENDING -> STOPPING -> REMOVED
 *
 * @type {string[]}
 */
const REMOVE_WORKFLOW_STEPS = [
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.STOPPING,
  WORKFLOW_STEP.REMOVED,
];

/**
 * Workflow steps for REPLACE operations.
 * Progress in order:
 * PENDING -> SENDING -> CREATING -> SYNCING -> ACTIVE -> STOPPING -> REMOVED
 *
 * ACTIVE represents "replacement promoted and voter-ready".
 *
 * @type {string[]}
 */
const REPLACE_WORKFLOW_STEPS = [
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
  WORKFLOW_STEP.SYNCING,
  WORKFLOW_STEP.ACTIVE,
  WORKFLOW_STEP.STOPPING,
  WORKFLOW_STEP.REMOVED,
];

const OPERATION_TERMINAL_STATUSES_BY_TYPE = Object.freeze(
  new Map([
    [
      OperationType.ADD,
      Object.freeze(new Set([
        ReplicaStatus.ACTIVE,
        ReplicaStatus.FAILED,
      ])),
    ],
    [
      OperationType.REMOVE,
      Object.freeze(new Set([
        ReplicaStatus.REMOVED,
        ReplicaStatus.FAILED,
      ])),
    ],
    [
      OperationType.REPLACE,
      Object.freeze(new Set([
        ReplicaStatus.REMOVED,
        ReplicaStatus.FAILED,
      ])),
    ],
  ]),
);

const OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE = Object.freeze(
  new Map([
    [
      OperationType.ADD,
      Object.freeze(new Set([
        WORKFLOW_STEP.ACTIVE,
        WORKFLOW_STEP.FAILED,
      ])),
    ],
    [
      OperationType.REMOVE,
      Object.freeze(new Set([
        WORKFLOW_STEP.REMOVED,
        WORKFLOW_STEP.FAILED,
      ])),
    ],
    [
      OperationType.REPLACE,
      Object.freeze(new Set([
        WORKFLOW_STEP.REMOVED,
        WORKFLOW_STEP.FAILED,
      ])),
    ],
  ]),
);

const TARGET_BUILD_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
  ]),
);

const TARGET_BUILD_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.PENDING,
    ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING,
  ]),
);

const SOURCE_RETIRING_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.STOPPING,
  ]),
);

const SOURCE_RETIRING_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.PENDING,
    ReplicaStatus.REMOVING,
  ]),
);

const REPLICA_OPERATION_FAILED_WORKFLOW_STEPS = Object.freeze(
  new Set([WORKFLOW_STEP.FAILED]),
);

const REPLICA_OPERATION_FAILED_STATUSES = Object.freeze(
  new Set([ReplicaStatus.FAILED]),
);

const REPLACE_REMOVE_DISPATCH_WORKFLOW_STEPS = Object.freeze(
  new Set([WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.STOPPING]),
);

const REPLICA_OPERATION_SEMANTIC_PHASE_RULES_BY_TYPE = Object.freeze(
  new Map([
    [
      OperationType.ADD,
      Object.freeze([
        buildReplicaOperationSemanticPhaseRule(
          REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED,
          [WORKFLOW_STEP.ACTIVE],
          [ReplicaStatus.ACTIVE],
        ),
        buildReplicaOperationSemanticPhaseRule(
          REPLICA_OPERATION_SEMANTIC_PHASE.ACCEPTED,
          TARGET_BUILD_WORKFLOW_STEPS,
          TARGET_BUILD_STATUSES,
        ),
      ]),
    ],
    [
      OperationType.REMOVE,
      Object.freeze([
        buildReplicaOperationSemanticPhaseRule(
          REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED,
          [WORKFLOW_STEP.REMOVED],
          [ReplicaStatus.REMOVED],
        ),
        buildReplicaOperationSemanticPhaseRule(
          REPLICA_OPERATION_SEMANTIC_PHASE.SOURCE_RETIRING,
          SOURCE_RETIRING_WORKFLOW_STEPS,
          SOURCE_RETIRING_STATUSES,
        ),
      ]),
    ],
    [
      OperationType.REPLACE,
      Object.freeze([
        buildReplicaOperationSemanticPhaseRule(
          REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED,
          [WORKFLOW_STEP.REMOVED],
          [ReplicaStatus.REMOVED],
        ),
        buildReplicaOperationSemanticPhaseRule(
          REPLICA_OPERATION_SEMANTIC_PHASE.SOURCE_RETIRING,
          [WORKFLOW_STEP.STOPPING],
          [ReplicaStatus.REMOVING],
        ),
        buildReplicaOperationSemanticPhaseRule(
          REPLICA_OPERATION_SEMANTIC_PHASE.TARGET_READY,
          [WORKFLOW_STEP.ACTIVE],
          [ReplicaStatus.ACTIVE],
        ),
        buildReplicaOperationSemanticPhaseRule(
          REPLICA_OPERATION_SEMANTIC_PHASE.ACCEPTED,
          TARGET_BUILD_WORKFLOW_STEPS,
          TARGET_BUILD_STATUSES,
        ),
      ]),
    ],
  ]),
);

/**
 * Metadata keys stored in operation stepsHistory entries.
 *
 * @enum {string}
 */
const OPERATION_METADATA_KEY = Object.freeze({
  SOURCE_REPLICA_ID: 'sourceReplicaId',
  READINESS_SNAPSHOT: 'readinessSnapshot',
  REPLICA_IDS: 'replicaIds',
  PEER_ADDRESSES: 'peerAddresses',
  BOOTSTRAP_TABLE_METADATA: 'bootstrapTableMetadata',
  BOOTSTRAP_PARTITION_METADATA: 'bootstrapPartitionMetadata',
  BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED:
    'bootstrapTopologyDispatchDeferred',
});

function quoteSqlValue(value) {
  return SQL_LITERAL.QUOTE + value + SQL_LITERAL.QUOTE;
}

function buildSqlInList(values) {
  return [...values].map(quoteSqlValue).join(SQL_LITERAL.COMMA_SPACE);
}

function buildTerminalRecordSqlClauseForType(operationType) {
  const terminalWorkflowSteps =
    OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE.get(operationType);
  const terminalStatuses =
    OPERATION_TERMINAL_STATUSES_BY_TYPE.get(operationType);
  return SQL_LITERAL.OPEN_PAREN +
    SQL_FIELD.TYPE +
    SQL_LITERAL.EQUALS +
    quoteSqlValue(operationType) +
    SQL_LITERAL.AND +
    SQL_LITERAL.OPEN_PAREN +
    SQL_FIELD.WORKFLOW_STEP +
    SQL_LITERAL.IN +
    SQL_LITERAL.OPEN_PAREN +
    buildSqlInList(terminalWorkflowSteps) +
    SQL_LITERAL.CLOSE_PAREN +
    SQL_LITERAL.OR +
    SQL_FIELD.STATUS +
    SQL_LITERAL.IN +
    SQL_LITERAL.OPEN_PAREN +
    buildSqlInList(terminalStatuses) +
    SQL_LITERAL.CLOSE_PAREN +
    SQL_LITERAL.CLOSE_PAREN +
    SQL_LITERAL.CLOSE_PAREN;
}

const REPLICA_OPERATION_TERMINAL_RECORD_SQL_CLAUSE =
  COORDINATOR_OWNED_OPERATION_TYPES
    .map(buildTerminalRecordSqlClauseForType)
    .join(SQL_LITERAL.OR);

/**
 * Get the workflow steps for an operation type.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @return {string[]} Array of workflow steps in order.
 */
function getWorkflowSteps(operationType) {
  if (operationType === OperationType.ADD) {
    return [...ADD_WORKFLOW_STEPS];
  }
  if (operationType === OperationType.REMOVE) {
    return [...REMOVE_WORKFLOW_STEPS];
  }
  if (operationType === OperationType.REPLACE) {
    return [...REPLACE_WORKFLOW_STEPS];
  }
  return [];
}

/**
 * Check if a workflow step is valid for an operation type.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} step - The workflow step to validate.
 * @return {boolean} True if the step is valid for the operation type.
 */
function isValidWorkflowStep(operationType, step) {
  const steps = getWorkflowSteps(operationType);
  return steps.includes(step);
}

/**
 * Get the next workflow step for an operation.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} currentStep - The current workflow step.
 * @return {string|null} The next step, or null if at final step or invalid.
 */
function getNextWorkflowStep(operationType, currentStep) {
  const steps = getWorkflowSteps(operationType);
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex === -1 ||
      currentIndex >= steps.length - 1) {
    return null;
  }
  return steps[currentIndex + 1];
}

/**
 * Check if a workflow step is a terminal step (final step or FAILED).
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} step - The workflow step to check.
 * @return {boolean} True if the step is terminal.
 */
function isTerminalStep(operationType, step) {
  if (step === WORKFLOW_STEP.FAILED) {
    return true;
  }
  const steps = getWorkflowSteps(operationType);
  if (steps.length === 0) {
    return false;
  }
  return step === steps[steps.length - 1];
}

function normalizeWorkflowStepIdentifier(step) {
  return typeof step === LOCAL_STR_STRING && step.length > 0 ?
    step.toUpperCase() :
    '';
}

function normalizeReplicaStatusIdentifier(status) {
  return typeof status === LOCAL_STR_STRING && status.length > 0 ?
    status.toLowerCase() :
    '';
}

function buildReplicaOperationSemanticPhaseRule(
  semanticPhase,
  workflowSteps,
  statuses,
) {
  return Object.freeze({
    semanticPhase,
    workflowSteps: Object.freeze(new Set(workflowSteps)),
    statuses: Object.freeze(new Set(statuses)),
  });
}

function normalizeOperationTypeIdentifier(operationType) {
  return typeof operationType === LOCAL_STR_STRING &&
    operationType.length > 0 ?
    operationType.toUpperCase() :
    '';
}

function readReplicaOperationRecordType(record) {
  return normalizeOperationTypeIdentifier(
    record?.[REPLICA_OPERATION_RECORD_FIELD.TYPE] ||
    record?.[REPLICA_OPERATION_RECORD_FIELD.OPERATION_TYPE] ||
    record?.[REPLICA_OPERATION_RECORD_FIELD.OPERATION_TYPE_CAMEL] ||
    '',
  );
}

function readReplicaOperationRecordWorkflowStep(record) {
  return normalizeWorkflowStepIdentifier(
    record?.[REPLICA_OPERATION_RECORD_FIELD.WORKFLOW_STEP] ??
    record?.[REPLICA_OPERATION_RECORD_FIELD.WORKFLOW_STEP_SNAKE] ??
    '',
  );
}

function readReplicaOperationRecordStatus(record) {
  return normalizeReplicaStatusIdentifier(
    record?.[REPLICA_OPERATION_RECORD_FIELD.STATUS] || '',
  );
}

function resolveReplicaOperationSemanticPhaseFromRecord(record) {
  const explicitSemanticPhase =
    record?.[REPLICA_OPERATION_RECORD_FIELD.SEMANTIC_PHASE];
  if (
    typeof explicitSemanticPhase === LOCAL_STR_STRING &&
    Object.values(REPLICA_OPERATION_SEMANTIC_PHASE)
      .includes(explicitSemanticPhase)
  ) {
    return explicitSemanticPhase;
  }
  return resolveReplicaOperationSemanticPhase(
    readReplicaOperationRecordType(record),
    readReplicaOperationRecordWorkflowStep(record),
    readReplicaOperationRecordStatus(record),
  );
}

function isTerminalReplicaOperationStatusForType(operationType, status) {
  const terminalStatuses = OPERATION_TERMINAL_STATUSES_BY_TYPE.get(
    normalizeOperationTypeIdentifier(operationType),
  );
  return terminalStatuses ?
    terminalStatuses.has(normalizeReplicaStatusIdentifier(status)) :
    false;
}

function replicaOperationSemanticPhaseRuleMatches(rule, workflowStep, status) {
  return rule.workflowSteps.has(workflowStep) || rule.statuses.has(status);
}

function resolveReplicaOperationSemanticPhaseRule(
  operationType,
  workflowStep,
  status,
) {
  return REPLICA_OPERATION_SEMANTIC_PHASE_RULES_BY_TYPE
    .get(operationType)
    ?.find((rule) =>
      replicaOperationSemanticPhaseRuleMatches(rule, workflowStep, status),
    );
}

function isTerminalReplicaOperationRecord(record) {
  if (!record || typeof record !== LOCAL_STR_OBJECT) {
    return false;
  }
  const semanticPhase = resolveReplicaOperationSemanticPhaseFromRecord(record);
  if (isTerminalReplicaOperationSemanticPhase(semanticPhase)) {
    return true;
  }
  if (semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.UNKNOWN) {
    return false;
  }
  const operationType = readReplicaOperationRecordType(record);
  const workflowStep = readReplicaOperationRecordWorkflowStep(record);
  if (operationType && workflowStep) {
    if (isTerminalStep(operationType, workflowStep)) {
      return true;
    }
    if (isValidWorkflowStep(operationType, workflowStep)) {
      return false;
    }
  }
  return isTerminalReplicaOperationStatusForType(
    operationType,
    readReplicaOperationRecordStatus(record),
  );
}

/**
 * Terminal-successful create evidence: an ADD that reached ACTIVE, or a REPLACE
 * whose source retired to REMOVED, proven by durable status OR workflow step.
 * Planning surfaces use this as proof the create target reached readiness
 * without waiting for a lagging service-cache lifecycle row. Deliberately
 * status-OR-step rather than semantic-phase SETTLED: a settled status with a
 * lagging (even failed) step still counts, preserving the exact semantics of
 * the former inline consumer in unified-rebalancer-replica-state.
 * @param {Object} normalizedOperation
 * @return {boolean}
 */
function isTerminalSuccessfulCreateOperation(normalizedOperation) {
  if (!normalizedOperation ||
      typeof normalizedOperation !== LOCAL_STR_OBJECT) {
    return false;
  }
  const terminalAdd =
    normalizedOperation.type === OperationType.ADD &&
    (normalizedOperation.status === ReplicaStatus.ACTIVE ||
      normalizedOperation.workflowStep === WORKFLOW_STEP.ACTIVE);
  const terminalReplace =
    normalizedOperation.type === OperationType.REPLACE &&
    (normalizedOperation.status === ReplicaStatus.REMOVED ||
      normalizedOperation.workflowStep === WORKFLOW_STEP.REMOVED);
  return terminalAdd || terminalReplace;
}

function buildReplicaOperationProgressSnapshot(record = {}) {
  const operationType = readReplicaOperationRecordType(record);
  const workflowStep = readReplicaOperationRecordWorkflowStep(record);
  const status = readReplicaOperationRecordStatus(record);
  const semanticPhase = resolveReplicaOperationSemanticPhaseFromRecord(record);
  const witnesses = buildReplicaOperationSemanticWitnesses(
    operationType,
    workflowStep,
    status,
  );
  const terminal = isTerminalReplicaOperationRecord(record);
  return Object.freeze({
    operationType,
    workflowStep,
    status,
    semanticPhase,
    terminal,
    inFlight:
      terminal !== true &&
      semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.UNKNOWN,
    ...witnesses,
  });
}

function resolveReplicaOperationSemanticPhase(
  operationType,
  workflowStep,
  status = '',
) {
  const normalizedType = normalizeOperationTypeIdentifier(operationType);
  const normalizedWorkflowStep = normalizeWorkflowStepIdentifier(workflowStep);
  const normalizedStatus = normalizeReplicaStatusIdentifier(status);

  if (
    REPLICA_OPERATION_FAILED_WORKFLOW_STEPS.has(normalizedWorkflowStep) ||
    REPLICA_OPERATION_FAILED_STATUSES.has(normalizedStatus)
  ) {
    return REPLICA_OPERATION_SEMANTIC_PHASE.FAILED;
  }

  const rule = resolveReplicaOperationSemanticPhaseRule(
    normalizedType,
    normalizedWorkflowStep,
    normalizedStatus,
  );
  return rule?.semanticPhase ||
    REPLICA_OPERATION_SEMANTIC_PHASE.UNKNOWN;
}

function buildReplicaOperationSemanticWitnesses(
  operationType,
  workflowStep,
  status = '',
) {
  const semanticPhase = resolveReplicaOperationSemanticPhase(
    operationType,
    workflowStep,
    status,
  );

  return Object.freeze({
    activationWitness:
      semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.TARGET_READY ||
      semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.SOURCE_RETIRING ||
      semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED,
    sourceRetirementWitness:
      semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.SOURCE_RETIRING ||
      semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED,
    settlementWitness:
      semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED,
    failureWitness:
      semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.FAILED,
  });
}

function isTerminalReplicaOperationSemanticPhase(semanticPhase) {
  return TERMINAL_REPLICA_OPERATION_SEMANTIC_PHASES.includes(semanticPhase);
}

/**
 * Check whether an operation type belongs to the steady-state coordinator
 * domain. Bootstrap-owned MOVE_ASSIGNMENT rows must not be treated as
 * dispatchable or recoverable coordinator work.
 *
 * @param {string} value - Operation type to check.
 * @return {boolean} True when the type is coordinator-owned.
 */
function isCoordinatorOwnedOperationType(value) {
  if (typeof value !== LOCAL_STR_STRING) {
    return false;
  }
  return COORDINATOR_OWNED_OPERATION_TYPES.includes(value.toUpperCase());
}

/**
 * Return true when a REPLACE operation has already completed add-side spread
 * and is only dispatching source removal.
 *
 * ACTIVE is the initial source-removal dispatch. STOPPING is the replay /
 * reconciliation phase while source-removal completion is still being
 * observed.
 *
 * @param {Object} operation
 * @return {boolean}
 */
function isReplaceRemoveDispatchPhase(operation) {
  return readReplicaOperationRecordType(operation) === OperationType.REPLACE &&
    REPLACE_REMOVE_DISPATCH_WORKFLOW_STEPS.has(
      readReplicaOperationRecordWorkflowStep(operation),
    );
}

export {
  ReplicaStatus,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  REPLICA_OPERATION_TERMINAL_RECORD_SQL_CLAUSE,
  ADJUST_DIRECTION,
  WORKFLOW_STEP_TO_STATUS,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  TERMINAL_REPLICA_OPERATION_SEMANTIC_PHASES,
  OPERATION_TERMINAL_STATUSES_BY_TYPE,
  OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE,
  OperationType,
  OPERATION_METADATA_KEY,
  ADD_WORKFLOW_STEPS,
  REMOVE_WORKFLOW_STEPS,
  REPLACE_WORKFLOW_STEPS,
  getWorkflowSteps,
  isValidWorkflowStep,
  getNextWorkflowStep,
  isTerminalStep,
  COORDINATOR_OWNED_OPERATION_TYPES,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  isCoordinatorOwnedOperationType,
  isReplaceRemoveDispatchPhase,
  isTerminalReplicaOperationRecord,
  isTerminalReplicaOperationStatusForType,
  isTerminalSuccessfulCreateOperation,
  buildReplicaOperationProgressSnapshot,
  resolveReplicaOperationSemanticPhase,
  resolveReplicaOperationSemanticPhaseFromRecord,
  buildReplicaOperationSemanticWitnesses,
  isTerminalReplicaOperationSemanticPhase,
};
