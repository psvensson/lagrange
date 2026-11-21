// Fixture projections consume the production result builders. They do not
// replace repository authority in persistence or reconstruction witnesses.
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  getWorkflowSteps, isTerminalStep, ReplicaStatus, WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-operation-progress.js';
import {createOperationAt} from '../../src/rebalancer/replica-status.js';
import {normalizeRebalancerEntityIdentity} from '../../src/rebalancer/rebalancer-entity-identity.js';
import {buildOperationUpdateOutcome} from '../../src/rebalancer/replica-operation-update-outcome.js';
import {buildOperationTransitionOutcome} from '../../src/rebalancer/operation-workflow-transition-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {buildCanonicalReplicaOperationRow, buildReplicaOperationWakeRow} from
  '../../src/rebalancer/replica-operation-repository-mutation-row-methods.js';
import {decodeReplicaOperationRow} from '../../src/rebalancer/replica-operation-repository-row-methods.js';

// A preexisting fixture operation carries the latest committed step and its
// timestamp. Alternate or malformed histories should be supplied explicitly.
function workflowFixtureHistory(step, timestamp) {
  return [{step, timestamp}];
}

// The operation record the coordinator creates: the one record builder at
// `createdAt`, stamped with the entity identity the coordinator's ingress
// normalizes (the partition unless the case names another entity). Its
// durable row is buildCanonicalReplicaOperationRow(record, lease).
function buildCreatedOperationFixture({createdAt, entityType, entityId, ...params}) {
  return {
    ...createOperationAt(params, createdAt),
    ...normalizeRebalancerEntityIdentity({entityType, entityId, partitionId: params.partitionId}),
  };
}

// That record after its owner committed `workflowStep` at `updatedAt`: the
// status the step maps to, the step appended to the producer history, and,
// for a terminal step, the completion time the owner's terminal commit sets.
function advanceOperationFixture(operation, workflowStep, updatedAt = operation.updatedAt) {
  const failed = workflowStep === WORKFLOW_STEP.FAILED;
  return {
    ...operation,
    workflowStep,
    status: failed ? ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[workflowStep],
    updatedAt,
    completedAt: isTerminalStep(operation.type, workflowStep) ? updatedAt : null,
    stepsHistory: [...operation.stepsHistory, ...workflowFixtureHistory(workflowStep, updatedAt)],
  };
}

// The record the repository's reads (rowToOperation, queryIncompleteOperations)
// answer once `operation` is durable: the one row decoder over the one row builder.
function readBackOperationFixture(operation, leaseExpiresAt = null) {
  return decodeReplicaOperationRow(buildCanonicalReplicaOperationRow(operation, leaseExpiresAt));
}

// The row a wake (direct dispatch wake-up, ready-node retry, cache or CDC
// replay) is expected to carry for `operation`. Its column set is the
// canonical row's: every wake producer builds it through
// buildReplicaOperationWakeRow (4f347ca3f, e8f4bdb84). `assertedColumns`
// restates as literals every column the test is about; a name outside the
// canonical column set is refused, so a renamed or dropped column fails here.
function expectedOperationWakeRow(operation, assertedColumns) {
  const row = buildReplicaOperationWakeRow(operation);
  const unknown = Object.keys(assertedColumns).filter((column) => !Object.hasOwn(row, column));
  if (unknown.length > 0) {
    throw new Error(`not a canonical replica_operations column: ${unknown.join(', ')}`);
  }
  return {...row, ...assertedColumns};
}

function completeServicesFixtureRead(rows) {
  return {success: true, rowSetComplete: true, rows};
}

function installServicesAuthorityFixture(gateway, answer) {
  const read = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = (table, sql, params, options) =>
    table === TABLES.SERVICES ?
      answer(sql, params, options) :
      read(table, sql, params, options);
  return () => {
    gateway.readAuthoritativeRows = read;
  };
}

// A coordinator SQL-store fixture already routes submitMutation through the
// production planner. Advertise the same CDC ingress capability as that owner.
function installCommittedOperationMutationFixture(gateway) {
  gateway.cdcIntegrationService = {
    insertSystemTableRow: (tableName, row) =>
      gateway.submitMutation({operation: 'insert', tableName, row}),
    updateSystemTableRow: (tableName, whereClause, data) =>
      gateway.submitMutation({operation: 'update', tableName, whereClause, data}),
  };
}

function buildTerminalOperationFixtureOutcome(operation, {
  failed = false,
  disposition = REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
  persisted = true,
  completedAt = Date.now(),
} = {}) {
  const step = failed ? WORKFLOW_STEP.FAILED : getWorkflowSteps(operation.type).at(-1);
  const projected = {...operation, workflowStep: step,
    status: failed ? ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[step],
    updatedAt: completedAt, completedAt};
  return buildOperationTransitionOutcome(buildOperationUpdateOutcome({
    persisted, disposition, operation: projected,
  }));
}

export {
  advanceOperationFixture,
  buildCreatedOperationFixture,
  buildTerminalOperationFixtureOutcome,
  completeServicesFixtureRead,
  expectedOperationWakeRow,
  installCommittedOperationMutationFixture,
  installServicesAuthorityFixture,
  readBackOperationFixture,
  workflowFixtureHistory,
};
