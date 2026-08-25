import {test} from '../../src/test-helpers/tap.js';
import {
  ReadinessPlanningSnapshotOwner,
} from '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';

const RETRYABLE_FAILURE_CODE = 'readiness_retention_retryable';
const RETRY_REASON = 'readiness_retention_retry';
const EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY = 256;
const BUILD_COUNT = EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY * 2 + 1;

test('ReadinessPlanningSnapshotOwner retains bounded diagnostics and ' +
  'releases owner graphs',
async (t) => {
  let nowMs = 1_780_000_000_000;
  const snapshot = Object.freeze({
    dimensions: Object.freeze({}),
    nodeEvidence: Object.freeze({}),
  });
  const service = {
    nodeId: 'node-0',
    buildNodeReadinessSyncCurrent: () => snapshot,
  };
  const owner = new ReadinessPlanningSnapshotOwner({
    service,
    now: () => nowMs,
  });

  for (let index = 0; index < BUILD_COUNT; index += 1) {
    nowMs += 1;
    owner.readinessSnapshotGeneration = index + 1;
    owner.reconcile(`node-${index % 7}`, {options: {}});
  }

  const diagnostics = owner.getDiagnostics();
  t.equal(diagnostics.buildCount, BUILD_COUNT,
    'aggregate build count remains exact');
  t.equal(
    diagnostics.diagnosticSampleCapacity,
    EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY,
    'the retention bound is explicit diagnostics contract data');
  t.equal(
    diagnostics.buildOwnerKeys.length,
    EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY,
    'owner-key history retains only the bounded recent tail');
  t.equal(
    Object.keys(diagnostics.buildsByToken).length,
    EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY,
    'token history retains only the bounded recent tail',
  );
  t.equal(
    diagnostics.droppedBuildOwnerKeySampleCount,
    BUILD_COUNT - EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY,
    'owner-key truncation remains visible through an aggregate counter',
  );
  t.equal(
    diagnostics.droppedBuildTokenSampleCount,
    BUILD_COUNT - EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY,
    'token truncation remains visible through an aggregate counter',
  );
  t.equal(
    diagnostics.buildOwnerKeys[0],
    `node-${
      (BUILD_COUNT - EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY) % 7
    }`,
    'owner-key samples begin at the oldest retained build',
  );
  t.equal(
    diagnostics.buildOwnerKeys[diagnostics.buildOwnerKeys.length - 1],
    `node-${(BUILD_COUNT - 1) % 7}`,
    'owner-key samples end at the newest retained build',
  );

  owner.shutdown();
  const shutdownDiagnostics = owner.getDiagnostics();
  t.same(shutdownDiagnostics.buildOwnerKeys, [],
    'shutdown releases retained owner-key samples');
  t.same(shutdownDiagnostics.buildsByToken, {},
    'shutdown releases retained token samples');
  t.same(shutdownDiagnostics.completedOwnerKeys, [],
    'shutdown releases retained completed snapshot graphs');
  t.equal(owner.completedSnapshotsByOwnerAndBuildKey.size, 0,
    'shutdown releases retained completed snapshot variants');
  t.equal(owner.buildOptionsByOwnerAndBuildKey.size, 0,
    'shutdown releases retained build-option graphs');
  t.equal(owner.logicalOwnerKeyByQueueOwnerKey.size, 0,
    'shutdown releases retained queue-key mappings');
});

test('OwnerKeyReconcileQueue retains bounded stale-claim diagnostics',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      name: 'readiness-retention-witness',
      reconcileFn: () => {},
      scheduleDrainFn: () => {},
    });
    queue.logger = {debug: () => {}, error: () => {}, warn: () => {}};
    queue.enqueue('node-0', 'initial', null, {fenceToken: 100});
    for (let index = 0; index < 33; index += 1) {
      queue.enqueue('node-0', `stale-${index}`, null, {fenceToken: index});
    }

    const diagnostics = queue.getDiagnostics();
    t.equal(diagnostics.staleFenceRejectionCount, 33,
      'aggregate stale-fence count remains exact');
    t.equal(diagnostics.staleClaims.length, 32,
      'legacy stale-claim projection is bounded with the recent sample ledger');
    t.equal(diagnostics.recentStaleFenceSamples.length, 32,
      'canonical stale-fence sample ledger remains bounded');

    queue.shutdown();
    const shutdownDiagnostics = queue.getDiagnostics();
    t.same(shutdownDiagnostics.staleClaims, [],
      'shutdown releases retained legacy stale claims');
    t.same(shutdownDiagnostics.recentStaleFenceSamples, [],
      'shutdown releases retained canonical stale-fence samples');
  });

test('OwnerKeyReconcileQueue releases retry diagnostic graphs on shutdown',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      name: 'readiness-retry-retention-witness',
      reconcileFn: async () => {
        const error = new Error(RETRYABLE_FAILURE_CODE);
        error.code = RETRYABLE_FAILURE_CODE;
        throw error;
      },
      retryPolicy: {
        isRetryableError: (error) => error?.code === RETRYABLE_FAILURE_CODE,
        getRetryAfterMs: () => 1,
      },
      setTimeoutFn: () => ({}),
      clearTimeoutFn: () => {},
    });
    queue.logger = {debug: () => {}, error: () => {}, warn: () => {}};
    queue.enqueue('node-retry', RETRY_REASON);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const diagnostics = queue.getDiagnostics();
    t.equal(diagnostics.recentRetryableDrainFailureSamples.length, 1,
      'retry failure retains one bounded diagnostic payload');
    t.same(diagnostics.retryingKeys, ['node-retry'],
      'the retry owner remains active before shutdown');

    queue.shutdown();
    const shutdownDiagnostics = queue.getDiagnostics();
    t.same(shutdownDiagnostics.recentRetryableDrainFailureSamples, [],
      'shutdown releases retry failure sample payloads');
    t.same(shutdownDiagnostics.retryingKeys, [],
      'shutdown releases retained retry owner graphs');
  });
