/**
 * Guard for quest replica-operation-insert-retry-idempotency.
 *
 * Production witness (affinity-demo runs 16-17, 2/2 modal): an op-row INSERT
 * lands, its outcome is lost (post-apply delivery failure now honestly
 * surfaced instead of silently acked), and the blind re-INSERT collides with
 * 'UNIQUE constraint failed: replica_operations.operation_id' — wrapped as a
 * fatal DISTRIBUTED_PARTICIPANT_FAILURE that kills rebalancer moves and the
 * client's CREATE TABLE (379 UNIQUE warns / 36 fatal in run 17).
 *
 * The fix: the op-row insert is OR-IGNORE idempotent (operation ids are
 * minted once), and a zero-change collision resolves through the EXISTING
 * authoritative visibility confirmation — the already-applied claim is
 * proven by observing the expected row, never inferred from the write
 * result. A collision whose authoritative row is absent or content-mismatched
 * stays a hard failure.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schema-shared-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {buildCanonicalReplicaOperationRow} from
  '../../src/rebalancer/replica-operation-repository-mutation-row-methods.js';
import {createMockControlPlaneSystemTableGateway} from './test-helpers.js';
import {advanceOperationFixture, buildCreatedOperationFixture} from './operation-outcome-fixture.js';

const TEST_NODE_ID = 'test-node-1';
const TEST_OPERATION_ID = 'op-idem-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_REPLICA_ID = 'partition-1-r1';
const TEST_TARGET_NODE_ID = 'node-2';
const TEST_CREATED_AT = 1000;
const VISIBILITY_TIMEOUT_MS = 200;
const VISIBILITY_RETRY_DELAY_MS = 10;

// The ADD as its coordinator created it (the one record builder).
function createdOperation() {
  return buildCreatedOperationFixture({
    operationId: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    createdAt: TEST_CREATED_AT,
  });
}

// The durable row (the repository's one row builder) of that ADD once its
// owner committed SENDING and then CREATING.
function makeRow() {
  const sending =
    advanceOperationFixture(createdOperation(), WORKFLOW_STEP.SENDING, TEST_CREATED_AT);
  return buildCanonicalReplicaOperationRow(
    advanceOperationFixture(sending, WORKFLOW_STEP.CREATING, TEST_CREATED_AT), null);
}

function createRepository({insertResults, authoritativeRows, insertCalls}) {
  const mockLogger = {info() {}, warn() {}, error() {}, debug() {}};
  // `authoritativeRows()` is this fixture's whole replica_operations
  // authority, so its reads answer as a complete owner read (the shared
  // fixture gateway's authoritative-read completeness and witness).
  const gateway = createMockControlPlaneSystemTableGateway({
    executeQuery: async () => ({success: true, rows: authoritativeRows()}),
  });
  gateway.submitMutation = async ({operation, tableName, row}, options) => {
    if (operation !== CONTROL_PLANE_MUTATION_OPERATION.INSERT ||
        tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      throw new Error('Unexpected insert retry mutation');
    }
    insertCalls.push({tableName, row, options});
    const next = insertResults.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next || {success: true, affectedRows: 1};
  };
  return new ReplicaOperationRepository({
    nodeId: TEST_NODE_ID,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: (_table, predicate) => [].filter(predicate),
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: gateway,
    authoritativeVisibilityTimeoutMs: VISIBILITY_TIMEOUT_MS,
    authoritativeVisibilityRetryDelayMs: VISIBILITY_RETRY_DELAY_MS,
    logger: mockLogger,
  });
}

test('lost-outcome insert retry converges to already-applied success', async (t) => {
  // The OR-IGNORE collision surface: the gateway reports success with zero
  // affected rows because an identical-id row (this op's own earlier landed
  // write) already exists; the authority serves the expected row.
  const insertCalls = [];
  const repo = createRepository({
    insertResults: [{success: true, affectedRows: 0}],
    authoritativeRows: () => [makeRow()],
    insertCalls,
  });
  const operation = repo.rowToOperation(makeRow());

  const persisted = await repo.persistNewOperation(operation);

  t.equal(
    persisted,
    true,
    'a zero-change collision with a confirmed authoritative row is already-applied success',
  );
  t.equal(insertCalls.length, 1, 'one canonical insert submission');
  t.equal(
    insertCalls[0]?.options?.ignoreExisting,
    true,
    'the op-row insert must ride the OR-IGNORE lane — operation ids are minted once, ' +
      'so a same-id re-insert is always a lost-outcome retry',
  );
});

test('fresh insert keeps returning success unchanged', async (t) => {
  const insertCalls = [];
  const repo = createRepository({
    insertResults: [{success: true, affectedRows: 1}],
    authoritativeRows: () => [makeRow()],
    insertCalls,
  });
  const operation = repo.rowToOperation(makeRow());

  const persisted = await repo.persistNewOperation(operation);

  t.equal(persisted, true, 'a fresh insert persists as before');
});

test('collision without an authoritative row stays a hard failure', async (t) => {
  // Honesty guard: already-applied must be PROVEN by observing the row.
  // success+0 changes with an empty authoritative read is not a witness.
  const insertCalls = [];
  const repo = createRepository({
    insertResults: [{success: true, affectedRows: 0}],
    authoritativeRows: () => [],
    insertCalls,
  });
  const operation = repo.rowToOperation(makeRow());

  const outcome = await repo.persistNewOperation(operation).then(
    (value) => ({value}),
    (error) => ({error}),
  );

  t.ok(
    outcome.error || outcome.value !== true,
    'an unobservable collision must not claim success (false or a thrown ' +
      'not-confirmed are both honest outcomes)',
  );
});

test('collision with content-mismatched authoritative row stays a hard failure', async (t) => {
  // A same-id row whose content does not satisfy the expected operation is
  // NOT an already-applied witness — genuine-duplicate detection must not
  // be weakened by the OR-IGNORE lane. The mismatched row is one the owner
  // can durably hold: the same ADD committed at SENDING (updated_at 1), not
  // at the expected CREATING.
  const insertCalls = [];
  const repo = createRepository({
    insertResults: [{success: true, affectedRows: 0}],
    authoritativeRows: () => [
      buildCanonicalReplicaOperationRow(
        advanceOperationFixture(createdOperation(), WORKFLOW_STEP.SENDING, 1), null),
    ],
    insertCalls,
  });
  const operation = repo.rowToOperation(makeRow());

  const outcome = await repo.persistNewOperation(operation).then(
    (value) => ({value}),
    (error) => ({error}),
  );

  t.ok(
    outcome.error || outcome.value !== true,
    'a mismatched same-id row must not be claimed as already-applied',
  );
});
