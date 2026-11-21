// Fixture projections consume the production result builders. They do not
// replace repository authority in persistence or reconstruction witnesses.
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  getWorkflowSteps, ReplicaStatus, WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-operation-progress.js';
import {createOperationAt} from '../../src/rebalancer/replica-status.js';
import {normalizeRebalancerEntityIdentity} from '../../src/rebalancer/rebalancer-entity-identity.js';
import {buildOperationUpdateOutcome} from '../../src/rebalancer/replica-operation-update-outcome.js';
import {buildOperationTransitionOutcome} from '../../src/rebalancer/operation-workflow-transition-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from '../../src/rebalancer/replica-operation-update-disposition.js';

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
// status the step maps to, and the step appended to the producer history.
function advanceOperationFixture(operation, workflowStep, updatedAt = operation.updatedAt) {
  return {
    ...operation,
    workflowStep,
    status: WORKFLOW_STEP_TO_STATUS[workflowStep],
    updatedAt,
    stepsHistory: [...operation.stepsHistory, ...workflowFixtureHistory(workflowStep, updatedAt)],
  };
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
  installCommittedOperationMutationFixture,
  installServicesAuthorityFixture,
  workflowFixtureHistory,
};
