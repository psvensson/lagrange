/**
 * Schema-provisioning collision/retry closure (round-7 root causes).
 *
 * A schema job's replica operation carries a deterministic id per
 * (job, target), so a retry after a completed-but-unconfirmed attempt lands
 * on its own durable row with zero changes. Three races turned that benign
 * collision into run-fatal failures (local baseline repro plus archived
 * runs 21-34-12 and 22-15-08): the collision read-back demanded
 * fresh-timestamp visibility an advanced row can never satisfy, the
 * resulting "not confirmed" error was classified non-transient and poisoned
 * every later CREATE via the schema_operations terminal short-circuit, and
 * the job prologue ran outside the request deadline so a slow
 * schema_operations partition produced client-side silence.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  SchemaProvisioningJobOwner,
  isTransientProvisioningError,
} from '../../src/query/schema-provisioning-job-owner.js';
import {
  applyRebalanceCoordinatorOperationCreationMethods,
} from '../../src/rebalancer/rebalance-coordinator-operation-creation.js';

class OperationCreationHost {}
applyRebalanceCoordinatorOperationCreationMethods(OperationCreationHost);

const NOT_CONFIRMED_MESSAGE =
  'Authoritative replica operation not confirmed: schema-job-x:operation:n1';

test('the authoritative-not-confirmed collision outcome is transient for ' +
  'schema provisioning', async (t) => {
  t.equal(isTransientProvisioningError(new Error(NOT_CONFIRMED_MESSAGE)),
    true,
    'a visibility-timing collision retries instead of terminal-failing');
  t.equal(isTransientProvisioningError(new Error('schema exploded')),
    false,
    'semantic failures stay terminal');
  t.end();
});

test('deterministic-intent operation creation requests the idempotent ' +
  'collision disposition', async (t) => {
  const persistCalls = [];
  const self = {
    logger: {info() {}, warn() {}, error() {}},
    nodeId: 'n0',
    now: () => 1000,
    stats: {operationsCreated: 0},
    controlPlaneReadinessService: {getNodeReadinessSync: () => null},
    buildOperationReadinessSnapshot: () => null,
    resolveEntitySizeBytes: () => 0,
    ensureProvisioningAdmissionAllowed: () => {},
    buildOperationBootstrapTopology: () => null,
    resolveOperationReadinessDecisionDimension: () => null,
    persistNewOperation: async (operation, resultOptions) => {
      persistCalls.push({operation, resultOptions});
      return true;
    },
  };
  const prototype = OperationCreationHost.prototype;
  await prototype.createOperationRecordInternal.call(self, {
    move: {
      type: 'add',
      nodeId: 'n1',
      operationIntentId: 'schema-job-x:operation:n1',
    },
    normalizedMove: {type: 'add', nodeId: 'n1'},
    normalizedMoveType: 'add',
    shouldEmitOperationCreated: false,
    entityType: 'partition',
    entityId: 'tbl-x-p1',
    partitionId: 'tbl-x-p1',
    dedupeKey: 'k',
    criticalAddLikeIntentKey: null,
    sourceNodeId: 'n0',
  }).catch(() => {});
  t.equal(persistCalls.length, 1, 'the operation persists once');
  t.equal(persistCalls[0].resultOptions?.returnDisposition, true,
    'a deterministic-intent create takes the idempotent disposition lane');
  t.end();
});

test('the schema-job prologue honors the request deadline', async (t) => {
  const owner = new SchemaProvisioningJobOwner({
    repository: {
      findByTableIdentity: () => new Promise(() => {}),
      listNonterminalRows: async () => [],
      recoverWorkflowRows: () => [],
      persistWorkflowCandidate: async (workflow) => ({workflow}),
    },
    now: () => Date.now(),
    setTimeoutFn: (fn) => {
      fn();
      return {unref() {}};
    },
    clearTimeoutFn: () => {},
  });
  const sentinel = new Promise((resolve) =>
    setTimeout(() => resolve({sentinel: true}), 250));
  const outcome = await Promise.race([
    owner.execute(
      {type: 'create_table', table: {name: 'ratings'}},
      {timeoutBudget: {startedAtMs: Date.now(), budgetMs: 5}},
      async () => ({success: true}),
    ),
    sentinel,
  ]);
  t.notOk(outcome?.sentinel,
    'a hung insertOrAttach resolves through the deadline race instead of ' +
      'client-side silence');
  t.equal(outcome?.provisioningDeadlineExpired, true,
    'the deadline outcome is an explicit pending/retry contract');
  t.end();
});
