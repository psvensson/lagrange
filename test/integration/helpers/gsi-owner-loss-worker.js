// Only the named index loses its submitting process. A short caller budget
// detaches the public request; real schema execution continues in background.
import {createTimeoutBudget} from '../../../src/control-plane/timeout-budget.js';
import {SchemaProvisioningJobOwner} from '../../../src/query/schema-provisioning-job-owner.js';
import {GlobalIndexLifecycleCoordinator} from
  '../../../src/index-management/global-index-lifecycle-coordinator.js';
import {registerEmbeddedWorkerOperations} from './embedded-node-worker.js';

let target;
let warm = false;
let cut;
let completed;
const discover = SchemaProvisioningJobOwner.prototype.readNonterminalRows;
SchemaProvisioningJobOwner.prototype.readNonterminalRows = async function(...args) {
  const result = await discover.apply(this, args);
  warm = true;
  return result;
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
    cut = {status: row.status, jobId: row.job_id, dataset: row.table_id,
      indexId: intent.globalIndex.indexId, generation: intent.globalIndex.generation,
      background: options.background, registeredCallback: this.retryCompletionHandlers.has(row.job_id)};
    // Parent verifies the cut and kills this process before forwarding the callback.
    await new Promise(() => {});
  }
  return notify.call(this, intent, outcome, options);
};

const complete = GlobalIndexLifecycleCoordinator.prototype.completeRecoveredProvisioning;
GlobalIndexLifecycleCoordinator.prototype.completeRecoveredProvisioning = async function(intent) {
  const result = await complete.call(this, intent);
  if (target && intent.indexName === target && !result?.fenced && !result?.deferred) {
    completed = {indexId: intent.indexId, generation: intent.generation, dataset: intent.tableId};
  }
  return result;
};

registerEmbeddedWorkerOperations({
  armIndexLoss: ({indexName}) => { target = indexName; },
  indexLossTrace: () => ({warm, cut, completed}),
});
