// Only the named index loses its submitting process. A short caller budget
// detaches the public request; real schema execution continues in background.
import {createTimeoutBudget} from '../../../src/control-plane/timeout-budget.js';
import {SchemaProvisioningJobOwner} from '../../../src/query/schema-provisioning-job-owner.js';
import {GlobalIndexLifecycleCoordinator} from
  '../../../src/index-management/global-index-lifecycle-coordinator.js';
import {registerEmbeddedWorkerOperations} from './embedded-node-worker.js';

import {PartitionService} from '../../../src/partition/partition-service.js';
import {readPartitionReplicaMembership} from
  '../../../src/partition/partition-service-raft-membership-administration.js';
import {getGlobalIndexDatasetName} from '../../../src/index-management/global-index-dataset-manager.js';

let targetDataset;
const datasetReplicas = new Map();
const initializePartition = PartitionService.prototype.initialize;
PartitionService.prototype.initialize = async function(...args) {
  const result = await initializePartition.apply(this, args);
  if (targetDataset && this.tableName === targetDataset) datasetReplicas.set(this.replicaId, this);
  return result;
};

let target;
let warm = false;
let cut;
let completed;
const permitTerminalCheckpoint = Promise.withResolvers();
const discover = SchemaProvisioningJobOwner.prototype.readNonterminalRows;
SchemaProvisioningJobOwner.prototype.readNonterminalRows = async function(...args) {
  const result = await discover.apply(this, args);
  warm = true;
  return result;
};

// Retain the last observation at each handoff; trace requests only read it.
const progress = {};
const findIntent = SchemaProvisioningJobOwner.prototype.findSucceededGlobalIndexIntent;
SchemaProvisioningJobOwner.prototype.findSucceededGlobalIndexIntent = async function(dataset, generation) {
  if (!target || !dataset.endsWith('_' + target)) return findIntent.call(this, dataset, generation);
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
  if (!target || intent.indexName !== target) return complete.call(this, intent);
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

const submit = SchemaProvisioningJobOwner.prototype.execute;
SchemaProvisioningJobOwner.prototype.execute = function(ast, options, executor) {
  if (target && options.globalIndex?.indexName === target) {
    options = {...options, timeoutBudget: createTimeoutBudget({configuredBudgetMs: 1})};
  }
  return submit.call(this, ast, options, executor);
};

const notify = SchemaProvisioningJobOwner.prototype.notifyBackgroundSucceeded;
SchemaProvisioningJobOwner.prototype.notifyBackgroundSucceeded = async function(intent, outcome, options) {
  if (target && intent.globalIndex?.indexName === target) {
    const row = await this.repository.findByTableIdentity(intent.tableIdentityKey);
    const persisted = JSON.parse(row.normalized_ddl);
    const result = JSON.parse(row.result_json);
    cut = {status: row.status, jobId: row.job_id, dataset: row.table_id,
      partitions: persisted.partitions, result: {partitionId: result.partitionId,
        contractState: result.contractState, requested: result.requestedReplicaCount,
        routable: result.routableReplicaCount, committed: result.committedReplicaCount},
      indexId: intent.globalIndex.indexId, generation: intent.globalIndex.generation,
      background: options.background, registeredCallback: this.retryCompletionHandlers.has(row.job_id)};
    // Parent verifies the cut and kills this process before forwarding the callback.
    await new Promise(() => {});
  }
  return notify.call(this, intent, outcome, options);
};

// All embedded workers and their parent run on one host. Capture the start
// of the actual terminal checkpoint on its monotonic clock, and expose it
// only after the production catalog update returns successfully.
const update = GlobalIndexLifecycleCoordinator.prototype._updateCatalogRecord;
GlobalIndexLifecycleCoordinator.prototype._updateCatalogRecord = async function(checkpoint) {
  const record = this.catalog.get(target);
  if (record && record.index_id === checkpoint.indexId && checkpoint.state === 'READ_WRITE') {
    // Hold only the final write. Discovery, lease expiry, and backfill keep
    // their ordinary schedules; the parent never calls a recovery entrypoint.
    await permitTerminalCheckpoint.promise;
  }
  const transition = record && record.index_id === checkpoint.indexId &&
    record.state === 'BACKFILLING' && checkpoint.state === 'READ_WRITE' &&
    checkpoint.backfill_total_rows === 2 ?
    {indexId: record.index_id, generation: record.index_generation,
      priorState: record.state, rows: checkpoint.backfill_total_rows,
      startedNs: process.hrtime.bigint().toString()} : null;
  const result = await update.call(this, checkpoint);
  if (transition) completed = transition;
  return result;
};

registerEmbeddedWorkerOperations({
  armIndexLoss: ({tableName, indexName}) => {
    target = indexName;
    targetDataset = getGlobalIndexDatasetName(tableName, indexName);
  },
  indexMembership: async ({partitionId}) => {
    const facts = [];
    for (const replica of datasetReplicas.values()) {
      if (replica.partitionId !== partitionId || replica.isShutdown) continue;
      facts.push(await readPartitionReplicaMembership(replica, replica.replicaId));
    }
    return facts;
  },
  permitIndexTerminalWrite: () => permitTerminalCheckpoint.resolve(),
  indexLossTrace: () => ({warm, cut, progress, completed}),
});
