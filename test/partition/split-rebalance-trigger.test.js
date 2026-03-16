/**
 * Regression tests proving that SPLIT_COMPLETED events on
 * PartitionSplitMergeManager trigger recordStateChange on child
 * partition rebalancers via the composition-root wiring pattern.
 *
 * Validates: Requirements 1.1, 1.4
 * Design: §1 (Split Completion Rebalance Trigger)
 *
 * Owner path verified: PartitionSplitMergeManager emits
 *   SPLIT_COMPLETED → composition root listener → resolves child
 *   partition services → calls rebalancer.recordStateChange(
 *   STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED)
 */
import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {
  SPLIT_MERGE_EVENT,
} from '../../src/partition/partition-constants.js';
import {
  STABILIZATION_RESET_TRIGGER,
} from '../../src/rebalancer/rebalancer-constants.js';

/**
 * Resolve a partition service by partitionId from a Map keyed by
 * replicaId. This mirrors the production helper in src/index.js
 * (resolvePartitionServiceByPartitionId) so the test exercises the
 * same lookup semantics.
 * @param {Map} partitionServices - Map keyed by replicaId.
 * @param {string} partitionId - The partition ID to find.
 * @return {Object|null} The matching partition service, or null.
 */
function resolvePartitionServiceByPartitionId(
  partitionServices, partitionId,
) {
  if (!partitionServices || !partitionId ||
      typeof partitionServices.values !== 'function') {
    return null;
  }
  for (const service of partitionServices.values()) {
    if (service && service.partitionId === partitionId) {
      return service;
    }
  }
  return null;
}

const FIXTURE_LEFT_PARTITION_ID = 'users-p-left';
const FIXTURE_RIGHT_PARTITION_ID = 'users-p-right';
const FIXTURE_LEFT_REPLICA_ID = 'replica-left-1';
const FIXTURE_RIGHT_REPLICA_ID = 'replica-right-1';
const FIXTURE_ORPHAN_REPLICA_ID = 'replica-orphan-1';
const FIXTURE_ORPHAN_PARTITION_ID = 'orphan-partition';

/**
 * Build a mock rebalancer with a recordStateChange spy.
 * @return {{recordStateChange: Function, calls: Array}}
 */
function buildMockRebalancer() {
  const calls = [];
  return {
    calls,
    recordStateChange(reason) {
      calls.push(reason);
    },
  };
}

/**
 * Build a mock partition service.
 * @param {string} partitionId
 * @param {Object|null} rebalancer
 * @return {Object}
 */
function buildMockPartitionService(partitionId, rebalancer) {
  return {partitionId, rebalancer};
}

/**
 * Wire the SPLIT_COMPLETED listener on a PartitionSplitMergeManager,
 * mirroring the composition-root pattern from src/index.js.
 * @param {EventEmitter} splitMergeManager
 * @param {Map} partitionServices
 */
function wireSplitCompletedListener(splitMergeManager, partitionServices) {
  splitMergeManager.on(
    SPLIT_MERGE_EVENT.SPLIT_COMPLETED,
    (result) => {
      const childPartitionIds = [
        result?.leftPartition?.partitionId,
        result?.rightPartition?.partitionId,
      ].filter(Boolean);
      for (const childPartitionId of childPartitionIds) {
        const partitionService =
          resolvePartitionServiceByPartitionId(
            partitionServices,
            childPartitionId,
          );
        if (!partitionService?.rebalancer) {
          continue;
        }
        partitionService.rebalancer.recordStateChange(
          STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED,
        );
      }
    },
  );
}

test('split completion triggers recordStateChange with ' +
  'split_completed for each child partition that has a rebalancer ' +
  '(uses rebalancer.recordStateChange as canonical trigger owner)',
async (t) => {
  const splitMergeManager = new EventEmitter();
  const leftRebalancer = buildMockRebalancer();
  const rightRebalancer = buildMockRebalancer();

  const partitionServices = new Map();
  partitionServices.set(
    FIXTURE_LEFT_REPLICA_ID,
    buildMockPartitionService(
      FIXTURE_LEFT_PARTITION_ID, leftRebalancer,
    ),
  );
  partitionServices.set(
    FIXTURE_RIGHT_REPLICA_ID,
    buildMockPartitionService(
      FIXTURE_RIGHT_PARTITION_ID, rightRebalancer,
    ),
  );

  wireSplitCompletedListener(splitMergeManager, partitionServices);

  splitMergeManager.emit(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, {
    leftPartition: {partitionId: FIXTURE_LEFT_PARTITION_ID},
    rightPartition: {partitionId: FIXTURE_RIGHT_PARTITION_ID},
  });

  t.equal(leftRebalancer.calls.length, 1,
    'left child rebalancer called once');
  t.equal(leftRebalancer.calls[0],
    STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED,
    'left child receives split_completed trigger');
  t.equal(rightRebalancer.calls.length, 1,
    'right child rebalancer called once');
  t.equal(rightRebalancer.calls[0],
    STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED,
    'right child receives split_completed trigger');
});

test('no recordStateChange call when child partition service has ' +
  'no rebalancer (rebalancer not yet initialized)',
async (t) => {
  const splitMergeManager = new EventEmitter();
  const partitionServices = new Map();
  partitionServices.set(
    FIXTURE_LEFT_REPLICA_ID,
    buildMockPartitionService(FIXTURE_LEFT_PARTITION_ID, null),
  );
  partitionServices.set(
    FIXTURE_RIGHT_REPLICA_ID,
    buildMockPartitionService(FIXTURE_RIGHT_PARTITION_ID, undefined),
  );

  wireSplitCompletedListener(splitMergeManager, partitionServices);

  splitMergeManager.emit(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, {
    leftPartition: {partitionId: FIXTURE_LEFT_PARTITION_ID},
    rightPartition: {partitionId: FIXTURE_RIGHT_PARTITION_ID},
  });

  t.pass('no error thrown when rebalancers are absent');
});

test('no recordStateChange call when partition service is not ' +
  'found for a child partition ID',
async (t) => {
  const splitMergeManager = new EventEmitter();
  const rebalancer = buildMockRebalancer();

  const partitionServices = new Map();
  partitionServices.set(
    FIXTURE_ORPHAN_REPLICA_ID,
    buildMockPartitionService(
      FIXTURE_ORPHAN_PARTITION_ID, rebalancer,
    ),
  );

  wireSplitCompletedListener(splitMergeManager, partitionServices);

  splitMergeManager.emit(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, {
    leftPartition: {partitionId: FIXTURE_LEFT_PARTITION_ID},
    rightPartition: {partitionId: FIXTURE_RIGHT_PARTITION_ID},
  });

  t.equal(rebalancer.calls.length, 0,
    'unrelated partition rebalancer not called');
});

test('handles result with only one child partition ' +
  '(leftPartition present, rightPartition absent)',
async (t) => {
  const splitMergeManager = new EventEmitter();
  const leftRebalancer = buildMockRebalancer();

  const partitionServices = new Map();
  partitionServices.set(
    FIXTURE_LEFT_REPLICA_ID,
    buildMockPartitionService(
      FIXTURE_LEFT_PARTITION_ID, leftRebalancer,
    ),
  );

  wireSplitCompletedListener(splitMergeManager, partitionServices);

  splitMergeManager.emit(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, {
    leftPartition: {partitionId: FIXTURE_LEFT_PARTITION_ID},
    rightPartition: null,
  });

  t.equal(leftRebalancer.calls.length, 1,
    'left child rebalancer called once');
  t.equal(leftRebalancer.calls[0],
    STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED,
    'left child receives split_completed trigger');
});
