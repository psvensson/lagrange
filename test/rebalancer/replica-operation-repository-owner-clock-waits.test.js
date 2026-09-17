import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';

// The replica-operation repository owns three bounded loops - the post-commit
// visibility confirmation, the retryable authoritative read and the persist
// retry - and reads every deadline from its TimeSource. The waits between polls must sleep on
// the SAME clock: a deadline on the owner's clock and a sleep on the
// platform clock is a loop that never approaches its deadline under a
// virtual clock, which is exactly how the DT6 formation falsifiers hung on
// the owner clock. Live behaviour is byte-identical (RealTimeSource delegates
// to the platform), so the witness is a virtual drive: it advances the
// repository's clock and expects each loop to settle on it, never on wall
// time.

const TEST_NODE_ID = 'node-a';
const TEST_OPERATION_ID = 'op-owner-clock';
const TEST_PARTITION_ID = 'replica_operations-p1';
const TEST_REPLICA_ID = 'replica_operations-p1-r5';
const START_MS = 5_000_000;
const VISIBILITY_TIMEOUT_MS = 5_000;
const VISIBILITY_RETRY_DELAY_MS = 200;
const DRIVE_STEP_MS = 200;
const DRIVE_STEP_LIMIT = 200;
const RETRYABLE_FAILURE = Object.freeze({success: false, deferRetry: true});

function makeOperation(repository) {
  return repository.rowToOperation({
    operation_id: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_NODE_ID,
    target_node_id: 'node-b',
    status: ReplicaStatus.ACTIVE,
    workflow_step: WORKFLOW_STEP.ACTIVE,
    created_at: START_MS,
    updated_at: START_MS,
    completed_at: START_MS,
    error_message: null,
    steps_history: JSON.stringify([]),
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
  });
}

function createRepository({timeSource, readAuthoritativeRows, executeQuery}) {
  return new ReplicaOperationRepository({
    nodeId: TEST_NODE_ID,
    timeSource,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows,
      executeQuery: executeQuery || (async () => ({success: true, changes: 1})),
    },
    authoritativeVisibilityTimeoutMs: VISIBILITY_TIMEOUT_MS,
    authoritativeVisibilityRetryDelayMs: VISIBILITY_RETRY_DELAY_MS,
    logger: {info() {}, warn() {}, error() {}, debug() {}},
  });
}

// Advance the virtual clock one step at a time, letting the loop's
// continuations run between steps, until the promise settles or the drive
// gives up. Nothing here waits on wall time.
async function driveUntilSettled(timeSource, promise) {
  let settled = false;
  const watched = promise.then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      throw error;
    },
  );
  let steps = 0;
  while (!settled && steps < DRIVE_STEP_LIMIT) {
    await new Promise((resolve) => setImmediate(resolve));
    if (settled) break;
    timeSource.advance(DRIVE_STEP_MS);
    steps += 1;
  }
  await new Promise((resolve) => setImmediate(resolve));
  return {settled, steps, value: settled ? await watched : null};
}

test('the visibility confirmation settles on the repository clock', async (t) => {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  let reads = 0;
  const repository = createRepository({
    timeSource,
    readAuthoritativeRows: async () => {
      reads += 1;
      return {success: true, rows: []};
    },
  });
  const operation = makeOperation(repository);
  const drive = await driveUntilSettled(
    timeSource,
    repository.confirmReplicaOperationVisibility(operation),
  );
  t.ok(drive.settled,
    'the confirmation settled while only the virtual clock advanced');
  t.ok(
    timeSource.now() - START_MS >= VISIBILITY_TIMEOUT_MS,
    'it ran to its deadline on that clock',
  );
  t.ok(
    timeSource.now() - START_MS <= VISIBILITY_TIMEOUT_MS + DRIVE_STEP_MS,
    'and not past it',
  );
  t.ok(reads > 2, `it polled while the deadline approached (${reads} reads)`);
  t.equal(drive.value?.operation ?? null, null,
    'nothing was visible, so nothing was confirmed');
  t.end();
});

test('the retryable authoritative read settles on the repository clock', async (t) => {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  let reads = 0;
  const repository = createRepository({
    timeSource,
    readAuthoritativeRows: async () => {
      reads += 1;
      return RETRYABLE_FAILURE;
    },
  });
  const drive = await driveUntilSettled(
    timeSource,
    repository.executeReplicaOperationsRead(
      'SELECT 1',
      [],
      {retryOnRetryableFailure: true},
    ),
  );
  t.ok(drive.settled,
    'the retrying read settled while only the virtual clock advanced');
  t.equal(drive.value?.success, false,
    'and returned the last retryable failure honestly');
  t.ok(reads > 1, `it retried on that clock (${reads} reads)`);
  t.ok(timeSource.now() > START_MS, 'the deadline was reached virtually');
  t.end();
});

test('the persist retry settles on the repository clock', async (t) => {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  let attempts = 0;
  const repository = createRepository({
    timeSource,
    readAuthoritativeRows: async () => ({success: true, rows: []}),
    executeQuery: async () => {
      attempts += 1;
      return RETRYABLE_FAILURE;
    },
  });
  const drive = await driveUntilSettled(
    timeSource,
    repository.executeOperationMutationWithRetry('UPDATE replica_operations SET status = ?', ['x'], {}),
  );
  t.ok(drive.settled,
    'the persist retry settled while only the virtual clock advanced');
  t.equal(drive.value?.success, false,
    'and returned the last retryable failure honestly');
  t.ok(attempts > 1, `it retried on that clock (${attempts} attempts)`);
  t.ok(timeSource.now() > START_MS, 'the budget was spent virtually');
  t.end();
});
