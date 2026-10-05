import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
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

function makeOperation(repository, operationId = TEST_OPERATION_ID) {
  return repository.rowToOperation({
    operation_id: operationId,
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

const SILENT_LOGGER = Object.freeze({
  info() {}, warn() {}, error() {}, debug() {},
});

function createRepository({timeSource, readAuthoritativeRows, executeQuery,
  logger = SILENT_LOGGER}) {
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
    logger,
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

// A spent wait is a failure, and is visible: each of the three bounded loops
// logs exactly one wait_bound_spent ERROR when its bound is spent, naming the
// wait and what the loop last observed, and none when the awaited condition
// arrives. The post-expiry result is unchanged (the honest last failure /
// MISSING).
const RETRYABLE_SHED_FAILURE = Object.freeze({
  ...RETRYABLE_FAILURE,
  errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
  error: 'control-plane lane shed',
});

test('a spent visibility confirmation logs one wait_bound_spent ERROR',
  async (t) => {
    const capture = captureLogger();
    const timeSource = new VirtualTimeSource({startMs: START_MS});
    const repository = createRepository({
      timeSource,
      logger: capture.logger,
      readAuthoritativeRows: async () => ({success: true, rows: []}),
    });
    const operation = makeOperation(repository, 'op-visibility-spent');
    const drive = await driveUntilSettled(
      timeSource,
      repository.confirmReplicaOperationVisibility(operation),
    );
    t.ok(drive.settled, 'the confirmation settled on the virtual clock');
    t.equal(drive.value?.operation ?? null, null,
      'post-expiry result unchanged: nothing confirmed');
    const spent = capture.spent(
      'REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS');
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    t.equal(capture.errors().length, 1, 'and no other ERROR');
    const context = spent[0].context;
    t.equal(context.boundMs, VISIBILITY_TIMEOUT_MS, 'names the bound');
    t.ok(context.elapsedMs >= VISIBILITY_TIMEOUT_MS,
      'elapsed measured on the repository clock');
    t.ok(context.lastObserved.polls > 1, 'lastObserved carries the polls');
    t.equal(context.lastObserved.sawVisibilityMismatch, false,
      'lastObserved says no mismatching row was seen');
    t.notSame(context.lastObserved, {state: 'site_observed_nothing'},
      'lastObserved is real state');
    t.equal(context.scope.operationId, 'op-visibility-spent');
    t.end();
  });

test('a confirmed visibility logs no wait_bound_spent', async (t) => {
  const capture = captureLogger();
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  let repository = null;
  const operationId = 'op-visibility-confirmed';
  repository = createRepository({
    timeSource,
    logger: capture.logger,
    readAuthoritativeRows: async () => ({
      success: true,
      rows: [{
        operation_id: operationId,
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
      }],
    }),
  });
  const operation = makeOperation(repository, operationId);
  const drive = await driveUntilSettled(
    timeSource,
    repository.confirmReplicaOperationVisibility(operation),
  );
  t.ok(drive.settled, 'settled');
  t.equal(drive.value?.operation?.operationId, operationId, 'confirmed');
  t.equal(capture.errors().length, 0, 'no ERROR on normal completion');
  t.end();
});

test('a spent persist retry logs one wait_bound_spent ERROR and returns the ' +
  'last failure', async (t) => {
  const capture = captureLogger();
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  let attempts = 0;
  const repository = createRepository({
    timeSource,
    logger: capture.logger,
    readAuthoritativeRows: async () => ({success: true, rows: []}),
    executeQuery: async () => {
      attempts += 1;
      return RETRYABLE_SHED_FAILURE;
    },
  });
  const drive = await driveUntilSettled(
    timeSource,
    repository.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET status = ?', ['x'], {}),
  );
  t.ok(drive.settled, 'settled on the virtual clock');
  t.equal(drive.value, RETRYABLE_SHED_FAILURE,
    'post-expiry result unchanged: the last retryable failure');
  const spent = capture.spent('OPERATION_PERSIST_RETRY_TIMEOUT_MS');
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  t.ok(attempts > 1, 'it retried before spending the bound');
  t.equal(spent[0].context.lastObserved.error, RETRYABLE_SHED_FAILURE.error,
    'lastObserved names the last failure');
  t.end();
});

test('a persist that succeeds logs no wait_bound_spent', async (t) => {
  const capture = captureLogger();
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const repository = createRepository({
    timeSource,
    logger: capture.logger,
    readAuthoritativeRows: async () => ({success: true, rows: []}),
  });
  const drive = await driveUntilSettled(
    timeSource,
    repository.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET status = ?', ['x'], {}),
  );
  t.equal(drive.value?.success, true, 'committed');
  t.equal(capture.errors().length, 0, 'no ERROR on normal completion');
  t.end();
});

test('a spent authoritative read retry logs one wait_bound_spent ERROR',
  async (t) => {
    const capture = captureLogger();
    const timeSource = new VirtualTimeSource({startMs: START_MS});
    const repository = createRepository({
      timeSource,
      logger: capture.logger,
      readAuthoritativeRows: async () => RETRYABLE_SHED_FAILURE,
    });
    const drive = await driveUntilSettled(
      timeSource,
      repository.executeReplicaOperationsRead(
        'SELECT 1', [], {retryOnRetryableFailure: true}),
    );
    t.equal(drive.value?.success, false,
      'post-expiry result unchanged: the last retryable failure');
    const spent = capture.spent('REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS');
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    t.ok(spent[0].context.lastObserved.attempts > 1,
      'lastObserved carries the attempts');
    t.end();
  });
