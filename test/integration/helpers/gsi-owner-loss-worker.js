// Observe the named index's real finalizer at the accepted terminal write.
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {SchemaProvisioningJobOwner} from '../../../src/query/schema-provisioning-job-owner.js';
import {SchemaProvisioningJobRepository} from '../../../src/query/schema-provisioning-job-repository.js';
import {QUERY_OPERATION} from '../../../src/query/query-constants.js';
import {getGlobalIndexDatasetName} from '../../../src/index-management/global-index-dataset-manager.js';
import {GlobalIndexLifecycleCoordinator} from
  '../../../src/index-management/global-index-lifecycle-coordinator.js';
import {registerEmbeddedWorkerOperations} from './embedded-node-worker.js';

import {readPartitionCommittedMembership} from
  '../../../src/partition/partition-service-raft-membership-administration.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND, COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../../src/raft/raft-committed-membership-constants.js';

let target;
const finalization = new AsyncLocalStorage();
let repository;
let warm = false;
let cut;
let firstTerminalAttemptNs;
let completed;
const discover = SchemaProvisioningJobOwner.prototype.readNonterminalRows;
SchemaProvisioningJobOwner.prototype.readNonterminalRows = async function(...args) {
  const result = await discover.apply(this, args);
  repository = this.repository;
  warm = true;
  return result;
};

// Retain the last observation at each handoff; trace requests only read it.
const progress = {};
const findIntent = SchemaProvisioningJobOwner.prototype.findSucceededGlobalIndexIntent;
SchemaProvisioningJobOwner.prototype.findSucceededGlobalIndexIntent = async function(dataset,
  generation) {
  if (!target || dataset !== target.dataset || generation !== target.generation) {
    return findIntent.call(this, dataset, generation);
  }
  const lookup = progress.lookup = {dataset, generation, state: 'entered'};
  try {
    const intent = await findIntent.call(this, dataset, generation);
    lookup.state = intent ? 'matched' : 'absent';
    lookup.jobId = intent?.jobId;
    return intent;
  } catch (error) {
    lookup.state = 'failed';
    lookup.error = error.message;
    throw error;
  }
};
const complete = GlobalIndexLifecycleCoordinator.prototype.completeRecoveredProvisioning;
GlobalIndexLifecycleCoordinator.prototype.completeRecoveredProvisioning = async function(intent) {
  if (!matchesTarget(intent)) return complete.call(this, intent);
  const attempt = progress.recovery = {indexId: intent.indexId, state: 'entered'};
  try {
    const result = await complete.call(this, intent);
    attempt.state = result?.fenced ? 'fenced' : result?.deferred ? 'deferred' : 'returned';
    return result;
  } catch (error) {
    attempt.state = 'failed';
    attempt.error = error.message;
    throw error;
  }
};

function matchesTarget(index) {
  return Boolean(target && index?.tableName === target.tableName &&
      index.indexName === target.indexName &&
    index.indexId === target.indexId && index.generation === target.generation);
}

const finalize = SchemaProvisioningJobOwner.prototype.completeExecutedJob;
SchemaProvisioningJobOwner.prototype.completeExecutedJob = function(intent, owned, result,
  options) {
  if (!matchesTarget(intent.globalIndex)) {
    return finalize.call(this, intent, owned, result, options);
  }
  const scope = {intent, result, repository: this.repository, ownerId: this.ownerId,
    fenceToken: owned.fenceToken};
  return finalization.run(scope, () => finalize.call(this, intent, owned, result, options));
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function describeAcceptedWrite(scope, candidate, context, accepted, before, row) {
  const {intent, ownerId, fenceToken} = scope;
  const previous = context.previousWorkflow;
  const version = previous.rowVersion;
  assert.ok(Number.isSafeInteger(version) && version > 0);
  assert.ok(typeof ownerId === 'string' && ownerId.length > 0 && Number.isSafeInteger(fenceToken) && fenceToken > 0);
  assert.equal(context.expectedOwnerId, ownerId);
  assert.equal(context.expectedFenceToken, fenceToken);
  for (const workflow of [previous, candidate, accepted.workflow]) {
    assert.equal(workflow.workflowId, intent.jobId);
    assert.equal(workflow.ownerKey, intent.ownerKey);
    assert.equal(workflow.workflowOwnerId, ownerId);
    assert.equal(workflow.fenceToken, fenceToken);
  }
  for (const stored of [before, row]) {
    assert.equal(stored.job_id, intent.jobId);
    assert.equal(stored.workflow_id, intent.workflowId);
    assert.equal(stored.table_identity_key, intent.tableIdentityKey);
    assert.equal(stored.owner_key, intent.ownerKey);
    assert.equal(stored.workflow_owner_id, ownerId);
    assert.equal(Number(stored.workflow_fence_token), fenceToken);
    assert.equal(stored.normalized_ddl, intent.normalizedDdl);
    assert.equal(stored.intent_hash, intent.intentHash);
  }
  assert.equal(sha256(row.normalized_ddl), intent.intentHash);
  assert.equal(previous.status, 'RUNNING');
  assert.equal(before.status, previous.status);
  assert.equal(Number(before.row_version), version);
  assert.equal(accepted.workflow.status, 'SUCCEEDED');
  assert.equal(accepted.workflow.step, 'SUCCEEDED');
  assert.equal(row.status, 'SUCCEEDED');
  assert.equal(row.current_step, 'SUCCEEDED');
  assert.equal(accepted.workflow.rowVersion, version + 1);
  assert.equal(Number(row.row_version), version + 1);
  const resultSha256 = sha256(row.result_json);
  for (const result of [scope.result, candidate.result, accepted.workflow.result]) {
    assert.equal(sha256(JSON.stringify(result)), resultSha256);
  }
  const persisted = JSON.parse(row.normalized_ddl);
  const result = JSON.parse(row.result_json);
  assert.ok(matchesTarget(persisted.globalIndex));
  assert.equal(persisted.tableId, target.dataset);
  assert.equal(persisted.tableName, target.dataset);
  assert.equal(row.table_id, target.dataset);
  assert.equal(result.tableId, row.table_id);
  assert.equal(result.partitionId, intent.partitionId);
  assert.equal(persisted.partitions[0].partitionId, result.partitionId);
  // Generic CREATE TABLE takeover wraps the native completion summary; the
  // GSI executor returns that summary directly with the same outer identities.
  let summary = result;
  if (result.operation !== undefined) {
    assert.equal(result.operation, QUERY_OPERATION.CREATE_TABLE);
    summary = result.provisioningSummary;
    assert.equal(summary.contractState, result.contractState);
    assert.equal(summary.nextAction, result.nextAction);
    assert.equal(summary.requestedReplicaCount, result.requestedReplicaCount);
    assert.equal(summary.committedReplicaCount, result.committedReplicaCount);
  }
  return {status: row.status, previousStatus: before.status, jobId: row.job_id,
    workflowId: row.workflow_id, dataset: row.table_id, partitions: persisted.partitions,
    result: {tableId: result.tableId, partitionId: result.partitionId,
      contractState: result.contractState,
      requested: summary.requestedReplicaCount, nextAction: result.nextAction,
      converged: summary.fullReplicaCountConverged, routable: summary.routableReplicaCount,
      committed: summary.committedReplicaCount}, resultSha256,
    indexId: persisted.globalIndex.indexId,
    generation: persisted.globalIndex.generation, ownerId, fenceToken, previousRowVersion: version,
    rowVersion: accepted.workflow.rowVersion, expiresNs: target.expiresNs.toString()};
}

const persist = SchemaProvisioningJobRepository.prototype.persistWorkflowCandidate;
SchemaProvisioningJobRepository.prototype.persistWorkflowCandidate = async function(candidate,
  context) {
  const scope = finalization.getStore();
  if (cut || this !== scope?.repository || candidate.status !== 'SUCCEEDED' ||
      candidate.workflowId !== scope.intent.workflowId) {
    return persist.call(this, candidate, context);
  }
  const before = this.rowsByJobId.get(candidate.workflowId);
  const accepted = await persist.call(this, candidate, context);
  if (accepted.accepted !== true) return accepted;
  // The repository records the acknowledged row (or matching durable readback)
  // before it returns. Only this finalizer's accepted transition can arm the cut.
  try {
    const row = this.rowsByJobId.get(candidate.workflowId);
    cut = describeAcceptedWrite(scope, candidate, context, accepted, before, row);
    let remaining;
    while ((remaining = target.expiresNs - process.hrtime.bigint()) > 0n) {
      await delay(Math.ceil(Number(remaining) / 1e6));
    }
  } catch (error) {
    progress.terminal = {state: 'cut rejected', error: error.message};
  }
  return accepted;
};

// All embedded workers and their parent share the host's monotonic clock.
// Publish the first attempt immediately. A qualifying completion is observable
// only after its original update returns successfully.
const update = GlobalIndexLifecycleCoordinator.prototype._updateCatalogRecord;
GlobalIndexLifecycleCoordinator.prototype._updateCatalogRecord = async function(checkpoint) {
  const record = this.catalog.get(target?.indexName);
  const attempt = terminalAttemptOf(record, checkpoint);
  if (attempt) firstTerminalAttemptNs ??= attempt.startedNs;
  const result = await update.call(this, checkpoint);
  if (completesBackfillFirst(attempt)) completed = attempt;
  return result;
};

function terminalAttemptOf(record, checkpoint) {
  const sameIndex = record && target && record.table_name === target.tableName &&
    record.index_id === target.indexId && record.index_generation === target.generation &&
    record.index_id === checkpoint.indexId;
  return sameIndex && checkpoint.state === 'READ_WRITE' ?
    {indexId: record.index_id, generation: record.index_generation,
      priorState: record.state, rows: checkpoint.backfill_total_rows,
      startedNs: process.hrtime.bigint().toString()} : null;
}

function completesBackfillFirst(attempt) {
  return attempt?.priorState === 'BACKFILLING' && attempt.rows === 2 &&
    (!completed || BigInt(attempt.startedNs) < BigInt(completed.startedNs));
}

async function observeMembership(replica) {
  // The leader's read also refuses an unapplied configuration change. Each
  // follower reports its own applied configuration through the witness read.
  const leaderRead = replica.isLeader === true;
  const purpose = leaderRead ? COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT :
    COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS;
  const answer = await readPartitionCommittedMembership(replica, purpose);
  const local = {partitionId: replica.partitionId, replicaId: replica.replicaId, leaderRead};
  if (answer?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED) {
    return {...local, refusal: answer?.reason ?? 'no committed answer'};
  }
  return {...local, term: answer.term, leaderReplicaId: answer.leaderId,
    configurationKey: answer.configurationKey, generation: answer.membershipGenerationIndex,
    gateOpen: answer.gateOpen, appliedIndex: answer.appliedIndex, commitIndex: answer.commitIndex,
    voterReplicaIds: answer.voters.map((id) => answer.identities[id]),
    outgoingVoters: answer.votersOutgoing, nextLearners: answer.learnersNext};
}

registerEmbeddedWorkerOperations({
  armIndexLoss: ({tableName, indexName, generation, holdMs}) => {
    assert.ok(!target && typeof tableName === 'string' && tableName && typeof indexName === 'string' && indexName);
    assert.ok(Number.isSafeInteger(generation) && generation > 0);
    assert.ok(Number.isSafeInteger(holdMs) && holdMs > 0 && holdMs <= 2147483647);
    target = {tableName, indexName, generation, indexId: `${indexName}-gen${generation}`,
      dataset: getGlobalIndexDatasetName(tableName, indexName),
      expiresNs: process.hrtime.bigint() + BigInt(holdMs) * 1000000n};
  },
  indexMembership: ({partitionIds}) => {
    const owner = repository.gateway.resolveCdcIntegrationService().hostedReplicaOwner;
    const hosted = partitionIds.flatMap((id) => owner.hostedPartitionReplicas(id));
    return Promise.all(hosted.map(observeMembership));
  },
  indexLossTrace: () => ({warm, cut, progress, firstTerminalAttemptNs, completed}),
});
