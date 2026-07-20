import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';

const PROVISIONING_SOURCE =
  'src/query/sql-query-engine-initial-partition-provisioning.js';
const DEADLINE_SOURCE =
  'src/query/sql-query-engine-provisioning-deadline-methods.js';
const PROVISION_TARGET_SOURCE =
  'src/query/sql-query-engine-provision-target-methods.js';
const ROUTING_READINESS_SOURCE =
  'src/query/sql-query-engine-partition-routing-readiness.js';
const SELECT_EXECUTION_SOURCE =
  'src/query/sql-query-engine-select-execution.js';
const STATEMENT_EXECUTION_SOURCE =
  'src/query/sql-query-engine-statement-execution.js';
const TABLE_CREATION_SOURCES = [
  'src/query/table-creation-service-create-table.js',
  'src/query/table-creation-service-existing-table-reconciliation.js',
  'src/query/table-creation-service-partition-provisioning.js',
];

function extractTransientHoldWait(source) {
  const start = source.indexOf(
    'async waitOutWholeClusterTransientProvisioningHold',
  );
  const end = source.indexOf(
    '\n  logTransientProvisioningHoldWait(',
    start + 'async waitOutWholeClusterTransientProvisioningHold'.length,
  );
  if (start < 0 || end < 0) return '';
  return source.slice(start, end);
}

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
  const provisioningSource = fs.readFileSync(PROVISIONING_SOURCE, 'utf8');
  const deadlineSource = fs.readFileSync(DEADLINE_SOURCE, 'utf8');
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
    deadlineSource,
    provisionTargetSource,
    routingReadinessSource,
    selectExecutionSource,
    statementExecutionSource,
    tableCreationSource,
  ].join('\n');
  const methodSource = extractTransientHoldWait(deadlineSource);
  const waitForConditionSource = extractWaitForCondition(
    selectExecutionSource,
  );

  t.ok(methodSource.length > 0, 'the guarded progress-wait owner exists');
  t.notMatch(
    methodSource,
    /createControlPlaneTimeoutBudget\s*\(/,
    'the nested progress path cannot create a new top-level timeout budget',
  );
  t.match(
    methodSource,
    /getRemainingBudgetMs\s*\(\s*options\.timeoutBudget/,
    'the progress path derives its wait from the parent remaining budget',
  );
  t.match(
    methodSource,
    /timeoutBudget:\s*options\.timeoutBudget/,
    'the same parent budget is passed to the nested wait',
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
    'target convergence passes its parent budget into waitForCondition',
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
  // e1f687ea consolidated the inline budget forwards into shared option
  // builders, so assert the builders forward the budget AND every
  // provisioning/reconciliation call site routes through a builder — the
  // contract, not a raw occurrence count.
  t.ok(
    (tableCreationSource.match(
      /timeoutBudget:\s*options\?\.timeoutBudget/g,
    )?.length || 0) >= 2,
    'the shared option builders forward the request budget',
  );
  t.match(
    tableCreationSource,
    /buildDurableProvisioningInput[\s\S]{0,80}\.\.\.buildBaseProvisioningInput\(context, options\)/,
    'the durable provisioning input inherits the base budget forwarding',
  );
  t.match(
    tableCreationSource,
    /reconcileExistingInitialPartition\([\s\S]{0,120}buildExistingReconciliationOptions\(options\)/,
    'existing-table reconciliation routes through the budget-forwarding builder',
  );
  t.equal(
    (tableCreationSource.match(
      /service\.provisionInitialPartition\(\s*build(?:Durable|Base)ProvisioningInput\(/g,
    ) || []).length,
    (tableCreationSource.match(/service\.provisionInitialPartition\(/g) || [])
      .length,
    'every create-table provisioning call site routes through a ' +
      'budget-forwarding builder',
  );
  t.match(
    tableCreationSource,
    /this\.provisionInitialPartition\(\{[\s\S]{0,320}timeoutBudget:\s*options\?\.timeoutBudget/,
    'the existing-table reconciliation provisioning call forwards the ' +
      'request budget inline',
  );
  t.end();
});
