import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from './query-constants.js';

function validateDurableCreateIntent(ast = {}) {
  if (Array.isArray(ast.primaryKey) && ast.primaryKey.length > 0) {
    return;
  }
  const error = new Error(
    `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${ast.tableName}` +
    `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX}. ` +
    QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL,
  );
  error.code = QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED;
  throw error;
}

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
    validateDurableCreateIntent(ast);
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
