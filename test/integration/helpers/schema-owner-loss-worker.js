// Observers on real runtime instances. Only the named CREATE pauses, after its
// catalog write and before its first attempt can finish provisioning.
import {readPartitionAppliedIndex} from '../../../src/partition/partition-committed-log.js';
import {decodeReplicaOperationRow} from '../../../src/rebalancer/replica-operation-repository-row-methods.js';
import {OPERATION_METADATA_KEY} from '../../../src/rebalancer/replica-status.js';
import {replaceIntentEntryOf, REPLACE_INTENT_FIELD} from '../../../src/rebalancer/operation-workflow-replace-owner-state.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {readPartitionReplicaMembership} from '../../../src/partition/partition-service-raft-membership-administration.js';
import {TableCreationService} from '../../../src/query/table-creation-service-class.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from '../../../src/query/schema-provisioning-job-constants.js';
import {SchemaProvisioningJobOwner} from '../../../src/query/schema-provisioning-job-owner.js';
import {registerEmbeddedWorkerOperations} from './embedded-node-worker.js';

import {armListenerObservation, boundListenerReplicas, listenerObservation} from './schema-owner-loss-listener-observer.js';

import {LoggingService} from '../../../src/logging/logging-service.js';
import {PARTICIPANT_RELEASE_LOG} from '../../../src/partition/partition-participant-transaction-cutover-constants.js';

let observeRelease = false;
const releaseReports = new Map(['schema_operations-p1', 'partitions-p1', 'services-p1',
  'sql_transactions-p1'].map((id) => [id, []]));
const info = LoggingService.prototype.info;
LoggingService.prototype.info = function(message, fields) {
  if (observeRelease && message === PARTICIPANT_RELEASE_LOG &&
      releaseReports.has(fields?.partitionId)) {
    retain(releaseReports.get(fields.partitionId), {at: Date.now(), ...fields});
  }
  return info.call(this, message, fields);
};

const partitions = new Map();
const grants = [];
const claims = [];
let trackedJobId;
let repository;
let target;
let barrier;
let completed;
const attempts = [];
const pending = [];
const provisioning = [];
let attemptCount = 0;

// Keep the initial observation and the current one across arbitrarily many retries.
function retain(history, entry) {
  if (history.length < 2) history.push(entry);
  else history[1] = entry;
}

function describe(value) {
  const summary = value?.provisioningSummary ?? value;
  return {state: value?.contractState, nextAction: value?.nextAction,
    code: value?.code ?? value?.errorCode, message: value?.message ?? value?.error,
    reasons: value?.detail?.reasons ?? summary?.reasonCodes,
    admissionReason: value?.placementResult?.reason, entryId: value?.entryId,
    requested: summary?.requestedReplicaCount, committed: summary?.committedReplicaCount,
    routable: summary?.routableReplicaCount, minimum: summary?.minimumRoutableReplicaCount};
}
const release = Promise.withResolvers();

const initialize = PartitionService.prototype.initialize;
PartitionService.prototype.initialize = async function(...args) {
  const result = await initialize.apply(this, args);
  partitions.set(this.replicaId, this);
  return result;
};

const resume = SchemaProvisioningJobOwner.prototype.resumeNonterminal;
SchemaProvisioningJobOwner.prototype.resumeNonterminal = function(...args) {
  repository = this.repository;
  return resume.apply(this, args);
};

const claim = SchemaProvisioningJobOwner.prototype.claimOwnership;
SchemaProvisioningJobOwner.prototype.claimOwnership = async function(workflow, fence) {
  const answer = await claim.call(this, workflow, fence);
  if (workflow.workflowId === trackedJobId && answer.accepted) {
    retain(claims, {ownerId: answer.workflow.workflowOwnerId, fence: answer.workflow.fenceToken,
      lease: answer.workflow.leaseExpiresAt, at: Date.now()});
  }
  return answer;
};

const execute = SchemaProvisioningJobOwner.prototype.executeJob;
SchemaProvisioningJobOwner.prototype.executeJob = function(intent, executor, options) {
  if (intent.tableName !== target) return execute.call(this, intent, executor, options);
  repository = this.repository;
  trackedJobId = intent.workflowId;
  return execute.call(this, intent, executor, options);
};

const perform = TableCreationService.prototype.executeDurableSchemaProvisioningJob;
TableCreationService.prototype.executeDurableSchemaProvisioningJob = async function(ast, job, ...args) {
  if (job.tableName !== target) return perform.call(this, ast, job, ...args);
  const grant = {ownerId: this.schemaProvisioningJobOwner.ownerId, jobId: job.jobId,
    tableId: job.tableId, key: job.tableIdentityKey, fence: job.ownerFenceToken, at: Date.now()};
  retain(grants, grant);
  const attempt = {number: ++attemptCount, fence: grant.fence, stage: 'executor entered'};
  retain(attempts, attempt);
  try {
    const result = await perform.call(this, ast, job, ...args);
    attempt.stage = 'executor returned';
    attempt.result = describe(result);
    return result;
  } catch (error) {
    attempt.stage = 'executor threw';
    attempt.error = describe(error);
    throw error;
  }
};

const defer = SchemaProvisioningJobOwner.prototype.transitionPendingForRetry;
SchemaProvisioningJobOwner.prototype.transitionPendingForRetry = async function(intent, executor, workflow, error) {
  if (intent.tableName !== target) return defer.call(this, intent, executor, workflow, error);
  const observation = {fence: workflow.fenceToken, at: Date.now(), cause: describe(error)};
  retain(pending, observation);
  const result = await defer.call(this, intent, executor, workflow, error);
  observation.outcome = describe(result);
  return result;
};

const provision = TableCreationService.prototype.provisionInitialPartition;
TableCreationService.prototype.provisionInitialPartition = async function(context) {
  if (context.tableName !== target) return provision.call(this, context);
  barrier = {jobId: context.schemaJobId, tableId: context.tableId, partitionId: context.partitionId,
    ownerId: this.schemaProvisioningJobOwner.ownerId};
  await release.promise;
  const call = {fence: context.schemaOwnerFenceToken, at: Date.now(),
    provisionerWired: typeof this.partitionProvisioner === 'function', requested: context.replicaCount};
  retain(provisioning, call);
  try {
    const result = await provision.call(this, context);
    call.result = describe(result);
    return result;
  } catch (error) {
    call.error = describe(error);
    throw error;
  }
};

const terminal = SchemaProvisioningJobOwner.prototype.transitionTerminal;
SchemaProvisioningJobOwner.prototype.transitionTerminal = async function(intent, workflow, options) {
  const result = await terminal.call(this, intent, workflow, options);
  if (intent.tableName === target) {
    completed = {jobId: intent.workflowId, tableId: intent.tableId, ownerId: this.ownerId,
      fence: workflow.fenceToken, status: options.updates.status};
  }
  return result;
};

// One synchronous local applied view per hosted ledger on takeover failure.
function retirementRecords({createdPartitionId}) {
  const limit = 16;
  const targets = ['schema_operations-p1', 'sql_transactions-p1', 'partitions-p1', createdPartitionId];
  const snapshots = [];
  for (const service of partitions.values()) {
    if (service.partitionId !== 'replica_operations-p1' || !service.initialized || service.isShutdown) continue;
    const status = service.getStatus();
    const subjects = targets.map((partitionId) => {
      const rows = service.db.prepare(`SELECT * FROM replica_operations WHERE partition_id = ?
        AND (type IN ('REPLACE','REMOVE') OR (partition_id = ? AND type = 'ADD'))
        ORDER BY updated_at DESC, operation_id LIMIT ?`).all(partitionId, createdPartitionId, limit + 1);
      return {partitionId, truncated: rows.length > limit, operations: rows.slice(0, limit).map((row) => {
        const op = decodeReplicaOperationRow(row);
        const intent = replaceIntentEntryOf(op);
        return {operationId: op.operationId, type: op.type, replicaId: op.replicaId,
          sourceReplicaId: op.sourceReplicaId, sourceNodeId: op.sourceNodeId, targetNodeId: op.targetNodeId,
          workflowStep: op.workflowStep, status: op.status, updatedAt: op.updatedAt,
          voterRetirement: op.stepsHistory[0]?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION]?.voterRetirement ?? null,
          removalIntent: intent && Object.fromEntries(Object.values(REPLACE_INTENT_FIELD)
            .map((field) => [field, intent[field]]))};
      })};
    });
    snapshots.push({replicaId: service.replicaId, term: status.term, isLeader: status.isLeader,
      appliedIndex: readPartitionAppliedIndex(service), subjects});
  }
  return snapshots;
}

registerEmbeddedWorkerOperations({
  arm: ({tableName, sql}) => { target = tableName; armListenerObservation(sql); },
  trace: () => ({grants, claims, barrier, completed, attemptCount, attempts, pending, provisioning}),
  retirementRecords,
  armReleaseObservation: () => { observeRelease = true; },
  releaseObservation: () => [...releaseReports.values()].flat(),
  boundListeners: boundListenerReplicas,
  closeProvenance: listenerObservation,
  release: () => release.resolve(),
  job: async ({key}) => {
    let row;
    try {
      row = await repository?.findByTableIdentity(key);
    } catch (error) {
      if (error.code === SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE) return null;
      throw error;
    }
    if (!row) return null;
    return {jobId: row.job_id, tableId: row.table_id, status: row.status,
      ownerId: row.workflow_owner_id, fence: row.workflow_fence_token,
      lease: row.workflow_lease_expires_at, version: row.row_version};
  },
  membership: async ({ids}) => {
    const local = [...partitions.values()].filter((service) =>
      ids.includes(service.partitionId) && service.initialized && !service.isShutdown);
    return Promise.all(local.map(async (service) => {
      const membership = await readPartitionReplicaMembership(service, service.replicaId);
      const status = service.getStatus();
      return {...membership, isLeader: status.isLeader && status.term === membership.term};
    }));
  },
});
