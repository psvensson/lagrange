import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';

/**
 * R09 supersession note: sealed quest `serve-eligibility-committed-epoch-read`
 * (commit `2f83f97fdc48`) retired internal SQLQueryEngine transient-hold
 * admission polling (`SQLQueryEngineProvisioningDeadlineMethods` /
 * `waitOutWholeClusterTransientProvisioningHold`), delegating retry pacing to
 * `SchemaProvisioningJobOwner` while bounding cohort-readiness refreshes via
 * `controlPlaneReadinessService.readServeEligibility({timeoutBudget, ...})`.
 */
const PROVISIONING_SOURCE =
  'src/query/sql-query-engine-initial-partition-provisioning.js';
const RETIRED_DEADLINE_SOURCE =
  'src/query/sql-query-engine-provisioning-deadline-methods.js';
const PROVISION_TARGET_SOURCE =
  'src/query/sql-query-engine-provision-target-methods.js';
const ROUTING_READINESS_SOURCE =
  'src/query/sql-query-engine-partition-routing-readiness.js';
const SELECT_EXECUTION_SOURCE =
  'src/query/sql-query-engine-select-execution.js';
const STATEMENT_EXECUTION_SOURCE =
  'src/query/sql-query-engine-statement-execution.js';
const TABLE_CREATION_DURABLE_JOB_SOURCE =
  'src/query/table-creation-service-durable-job.js';
const TABLE_CREATION_SOURCES = [
  'src/query/table-creation-service-create-table.js',
  'src/query/table-creation-service-existing-table-reconciliation.js',
  'src/query/table-creation-service-partition-provisioning.js',
];

function extractWaitForCondition(source) {
  const start = source.indexOf('async waitForCondition(');
  const end = source.indexOf(
    '\n  /**\n   * Delay helper for provisioning polling loops.',
    start,
  );
  if (start < 0 || end < 0) return '';
  return source.slice(start, end);
}

test('provisioning parent deadline dependency guard - nested progress waits ' +
  'cannot mint top-level budgets', (t) => {
  t.equal(
    fs.existsSync(RETIRED_DEADLINE_SOURCE),
    false,
    'retired transient-hold deadline stub remains deleted',
  );
  const provisioningSource = fs.readFileSync(PROVISIONING_SOURCE, 'utf8');
  const provisionTargetSource = fs.readFileSync(
    PROVISION_TARGET_SOURCE,
    'utf8',
  );
  const routingReadinessSource = fs.readFileSync(
    ROUTING_READINESS_SOURCE,
    'utf8',
  );
  const statementExecutionSource = fs.readFileSync(
    STATEMENT_EXECUTION_SOURCE,
    'utf8',
  );
  const selectExecutionSource = fs.readFileSync(
    SELECT_EXECUTION_SOURCE,
    'utf8',
  );
  const tableCreationSource = TABLE_CREATION_SOURCES.map((sourcePath) =>
    fs.readFileSync(sourcePath, 'utf8'),
  ).join('\n');
  const combinedSource = [
    provisioningSource,
    provisionTargetSource,
    routingReadinessSource,
    selectExecutionSource,
    statementExecutionSource,
    tableCreationSource,
  ].join('\n');
  const waitForConditionSource = extractWaitForCondition(
    selectExecutionSource,
  );

  t.notMatch(
    combinedSource,
    /waitOutWholeClusterTransientProvisioningHold|isWholeClusterTransientProvisioningHold/,
    'retired internal transient-hold re-wait stub is absent across query provisioning',
  );
  t.equal(
    combinedSource.match(/this\.createControlPlaneTimeoutBudget\s*\(/g)
      ?.length || 0,
    2,
    'the full path has only its root and guarded generic-wait fallbacks',
  );
  t.match(
    provisioningSource,
    /context\?\.timeoutBudget\s*\|\|\s*this\.createControlPlaneTimeoutBudget/,
    'the sole budget creation is guarded by absence of a caller budget',
  );
  t.notMatch(
    combinedSource,
    /resolveOperationLedgerConcentrationProgressSnapshot/,
    'deadline ownership cannot regain the retired concentration-snapshot loop',
  );
  t.match(
    provisionTargetSource,
    /timeoutBudget:\s*options\.timeoutBudget\s*\|\|\s*null/,
    'target convergence passes its parent budget into readServeEligibility',
  );
  t.ok(
    waitForConditionSource.length > 0,
    'the terminal generic wait owner is included in the dependency guard',
  );
  t.match(
    waitForConditionSource,
    /timeoutOptions\?\.timeoutBudget\s*\?[\s\S]*allocateControlPlaneTimeoutBudget\([\s\S]*:\s*this\.createControlPlaneTimeoutBudget\(timeoutMs\)/,
    'waitForCondition allocates from a supplied parent before its standalone fallback',
  );
  t.equal(
    routingReadinessSource.match(/allocateControlPlaneTimeoutBudget\s*\(/g)
      ?.length || 0,
    4,
    'metadata, routing, and leader waits allocate only nested child budgets',
  );
  t.match(
    provisioningSource,
    /waitForPartitionServiceMetadata\(replicaId, timeoutBudget/,
    'replica metadata waits receive the provisioning parent budget',
  );
  t.match(
    provisioningSource,
    /waitForRoutablePartitionServiceCount\([\s\S]{0,180}timeoutBudget/,
    'routable-count readiness receives the provisioning parent budget',
  );
  t.match(
    provisioningSource,
    /waitForPartitionLeaderService\(partitionId, timeoutBudget/,
    'leader readiness receives the provisioning parent budget',
  );
  t.match(
    statementExecutionSource,
    /timeoutBudget:\s*options\?\.timeoutBudget/,
    'SQL CREATE forwards the request budget to TableCreationService',
  );
  // Superseded (R09) by the formation-stability snapshot 620bb9460: the
  // unpersisted CREATE TABLE route was deleted, so the durable schema job is
  // the one entry into table creation. SQL CREATE's request budget is owned
  // by SchemaProvisioningJobOwner (its retry pacing and deadline); the job's
  // executor never carried a caller budget (it passed `timeoutBudget: null`
  // before the snapshot), so the e1f687ea option-builder forwarding below the
  // job owner was dead and is gone. Below the job owner, provisioning mints
  // its single root budget (asserted above) - never a second caller budget.
  const durableJobSource = fs.readFileSync(TABLE_CREATION_DURABLE_JOB_SOURCE, 'utf8');
  t.match(
    durableJobSource,
    /schemaProvisioningJobOwner\.execute\([\s\S]{0,160}timeoutBudget:\s*options\.timeoutBudget/,
    'the SQL CREATE request budget is handed to the schema job owner',
  );
  const jobExecutor = durableJobSource.slice(
    durableJobSource.indexOf('executeDurableSchemaProvisioningJob('),
    durableJobSource.indexOf('async createTable('),
  );
  t.ok(jobExecutor.length > 0, 'the durable job executor is included in the guard');
  t.notMatch(
    jobExecutor + tableCreationSource,
    /timeoutBudget/,
    'table creation below the job owner forwards no caller budget',
  );
  t.equal(
    (tableCreationSource.match(
      /service\.provisionInitialPartition\(\s*buildDurableProvisioningInput\(/g,
    ) || []).length,
    (tableCreationSource.match(/service\.provisionInitialPartition\(/g) || [])
      .length,
    'every create-table provisioning call site routes through the durable ' +
      'provisioning input',
  );
  t.end();
});
