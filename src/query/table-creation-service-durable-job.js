import {validateUserTableCreateIntent} from './user-table-create-intent.js';

const TABLE_CREATION_DURABLE_JOB_METHODS = Object.freeze({
  executeDurableSchemaProvisioningJob(ast, job) {
    return this.executeCreateTableProvisioning(ast, {
      tableId: job.tableId,
      partitionId: job.partitionId,
      schemaJobId: job.jobId,
      schemaOwnerFenceToken: job.ownerFenceToken,
      assertProvisioningOwnership: job.assertOwnership,
      timeoutBudget: null,
      cancellationToken: this.schemaProvisioningCancellationToken,
    });
  },

  async createTable(ast, options = {}) {
    validateUserTableCreateIntent(ast);
    return this.schemaProvisioningJobOwner.execute(
      ast,
      {
        namespace: options.namespace,
        timeoutBudget: options.timeoutBudget,
      },
      (job) => this.executeDurableSchemaProvisioningJob(ast, job),
    );
  },

  resumeDurableProvisioningJobs() {
    return this.schemaProvisioningJobOwner.resumeNonterminal(
      (job) => this.executeDurableSchemaProvisioningJob(job.ast, job),
    );
  },
});

function defineTableCreationDurableJobMethod(serviceClass) {
  for (const [methodName, method] of Object.entries(
    TABLE_CREATION_DURABLE_JOB_METHODS,
  )) {
    Object.defineProperty(serviceClass.prototype, methodName, {
      configurable: true,
      value: method,
      writable: true,
    });
  }
}

export {defineTableCreationDurableJobMethod};
