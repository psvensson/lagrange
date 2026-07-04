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
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';

const TEST_NODE_ID = 'test-node-1';
const TEST_OPERATION_ID = 'op-idem-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_REPLICA_ID = 'partition-1-r1';
const TEST_TARGET_NODE_ID = 'node-2';
const VISIBILITY_TIMEOUT_MS = 200;
const VISIBILITY_RETRY_DELAY_MS = 10;

function makeRow(overrides = {}) {
  return {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: 'in_progress',
    workflow_step: WORKFLOW_STEP.CREATING,
    created_at: 1000,
    updated_at: 1000,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    ...overrides,
  };
}

function createRepository({insertResults, authoritativeRows, insertCalls}) {
  const mockLogger = {info() {}, warn() {}, error() {}, debug() {}};
  const gateway = {
    insertSystemTableRow: async (tableName, row, options = {}) => {
      insertCalls.push({tableName, row, options});
      const next = insertResults.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next || {success: true, affectedRows: 1};
    },
    readRows: async () => ({
      success: true,
      rows: authoritativeRows(),
    }),
    readAuthoritativeRows: async () => ({
      success: true,
      rows: authoritativeRows(),
    }),
    executeQuery: async () => ({success: true, changes: 1}),
    resolveCdcIntegrationService: () => ({
      insertSystemTableRow: async () => ({success: true}),
    }),
  };
  return new ReplicaOperationRepository({
    nodeId: TEST_NODE_ID,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: (_table, predicate) => [].filter(predicate),
    },
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
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
  // be weakened by the OR-IGNORE lane.
  const insertCalls = [];
  const repo = createRepository({
    insertResults: [{success: true, affectedRows: 0}],
    authoritativeRows: () => [
      makeRow({
        workflow_step: WORKFLOW_STEP.SENDING,
        status: 'failed',
        updated_at: 1,
      }),
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
