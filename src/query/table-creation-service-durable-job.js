import {OWNER_CONTRACT_STATE} from
  '../control-plane/owner-contract-outcome.js';
import {validateUserTableCreateIntent} from './user-table-create-intent.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from
  './schema-provisioning-job-constants.js';

const CREATE_TABLE_STATEMENT = 'CREATE TABLE';
const PROJECTION_UNAVAILABLE_MESSAGE =
  'CREATE TABLE committed, but this node cannot yet answer it visible: the ' +
  'projection wait ended';

/**
 * The client statement's same-node read-your-writes: CREATE TABLE answers
 * once this node's projection holds its own committed metadata, so the
 * session's next statement finds the table. The answer's content still comes
 * from the commit and provisioning; this wait decides nothing. It is the one
 * projection wait (no timer; ended by the projection, shutdown or the client's
 * disconnect); a typed ending answers typed unavailable with the metadata
 * committed. A job resumed with no client never waits. A node that did not
 * write the metadata has no position and stays eventually consistent.
 * @param {Object|null} committed - {gateway, positions} of this statement.
 * @param {AbortSignal} [abortSignal] - The client's session.
 * @return {Promise<void>}
 */
async function awaitCreateTableProjection(committed, abortSignal) {
  if (committed === null) return;
  try {
    await Promise.all(committed.positions.map((position) =>
      committed.gateway.awaitProjectionAt(position,
        {abortSignal, statement: CREATE_TABLE_STATEMENT})));
  } catch (error) {
    throw Object.assign(new Error(PROJECTION_UNAVAILABLE_MESSAGE, {cause: error}),
      {code: SCHEMA_PROVISIONING_ERROR_CODE.PROJECTION_UNAVAILABLE,
        projectionOutcome: error?.code});
  }
}

function executeDurableSchemaProvisioningJob(
  service,
  ast,
  job,
  onMetadataCommitted = null,
) {
  return service.executeCreateTableProvisioning(ast, {
    onMetadataCommitted,
    tableId: job.tableId,
    partitionId: job.partitionId,
    partitions: job.partitions || null,
    globalIndex: job.globalIndex || null,
    schemaJobId: job.jobId,
    schemaOwnerFenceToken: job.ownerFenceToken,
    assertProvisioningOwnership: job.assertOwnership,
    timeoutBudget: null,
    cancellationToken: service.schemaProvisioningCancellationToken,
  });
}

async function createTable(service, ast, options = {}) {
  validateUserTableCreateIntent(ast);
  let committed = null;
  const result = await service.schemaProvisioningJobOwner.execute(
    ast,
    {
      namespace: options.namespace,
      timeoutBudget: options.timeoutBudget,
    },
    (job) => service.executeDurableSchemaProvisioningJob(ast, job,
      (gateway, positions) => {
        committed = {gateway, positions};
      }),
  );
  if (
    result?.provisioningDeadlineExpired !== true &&
    result?.contractState !== OWNER_CONTRACT_STATE.PENDING
  ) {
    await awaitCreateTableProjection(committed, options.abortSignal);
  }
  return result;
}

function resumeDurableProvisioningJobs(service) {
  return service.schemaProvisioningJobOwner.resumeNonterminal(
    (job) => service.executeDurableSchemaProvisioningJob(job.ast, job),
  );
}

export {
  createTable,
  executeDurableSchemaProvisioningJob,
  resumeDurableProvisioningJobs,
};
