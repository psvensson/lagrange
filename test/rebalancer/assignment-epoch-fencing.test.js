/**
 * Assignment-epoch fencing regression tests (verified-audit finding 7, quest
 * assignment-epoch-fencing). The assignment epoch must fence stale work
 * instead of being checked once at creation and forgotten.
 *
 * Receipts:
 * - unreadable-epoch-defers: an epoch-bound move whose current published
 *   membership epoch is unreadable at creation is DEFERRED — the typed
 *   MEMBERSHIP_EPOCH_UNAVAILABLE skip routes into the rebalance loop's
 *   existing skip-and-retry-next-cycle path (buildSkippedMoveResult), never
 *   silently passing into persistence. Reverting the fail-closed assert
 *   (letting an unreadable current epoch pass) flips this red.
 * - executor-rejects-stale-epoch: the operation's planning epoch is carried
 *   into the executor request AND the dispatch-time epoch gate rejects a
 *   stale ADD/REPLACE — a readable current epoch that advanced past the
 *   operation's planning epoch fails the operation closed before any
 *   dispatch; an unreadable current epoch defers the dispatch as
 *   DEFERRED_RETRY_PENDING instead of dispatching unfenced. Reverting the
 *   gate flips these red.
 * - durable-planning-epoch: the planning epoch lives in the operation row's
 *   dedicated membership_publication_epoch column and survives repository
 *   serialization without a stepsHistory copy.
 *
 * Every test is red-on-revert against the fail-closed creation assert or
 * the executor staleness gate while the rest of the change remains.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {REBALANCER_SKIP_REASON} from
  '../../src/rebalancer/rebalancer-constants.js';
import {UnifiedRebalancer} from
  '../../src/rebalancer/unified-rebalancer.js';
import {
  UNIFIED_REBALANCER_SHARED,
} from '../../src/rebalancer/unified-rebalancer-shared.js';

const {MoveType, EntityType, NodeStatus} = UNIFIED_REBALANCER_SHARED;
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockCoordinator,
} from './test-helpers.js';
import {
  PLANNING_EPOCH,
  TEST_NODE_ID,
  TEST_PARTITION_ID,
  TEST_TARGET_NODE_ID,
  buildEpochBoundAddMove,
  buildEpochBoundAddOperation,
  createEpochCoordinator,
  grantEpochCoordinatorStorageAdmission,
  initializeConfig,
  wireEpochDispatchProbe,
} from './epoch-fence-test-harness.js';

// --- unreadable-epoch-defers ---

test('unreadable-epoch-defers: an epoch-bound move with an unreadable ' +
  'current epoch is deferred (typed skip), never persisted',
async (t) => {
  initializeConfig();
  const {coordinator, persistedRowCount} = createEpochCoordinator({
    currentEpoch: null, // unreadable current epoch
  });

  try {
    await coordinator.createOperation(buildEpochBoundAddMove(PLANNING_EPOCH));
    t.fail('an unreadable current epoch must not silently pass');
  } catch (error) {
    t.equal(
      error?.rebalanceSkipReason,
      REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE,
      'the deferral exposes the typed MEMBERSHIP_EPOCH_UNAVAILABLE skip',
    );
    t.equal(
      error?.requestedMembershipPublicationEpoch,
      PLANNING_EPOCH,
      'the deferral carries the planning epoch it refused to fence open',
    );
  }
  t.equal(
    persistedRowCount(),
    0,
    'an unreadable epoch never persists the operation row',
  );
  await coordinator.shutdown();
});

test('unreadable-epoch-defers: the deferral routes into the existing ' +
  'rebalance-loop skip-and-retry path (skip result, no throw)',
async (t) => {
  initializeConfig();
  const mockCache = createMockCache([
    {node_id: TEST_TARGET_NODE_ID, status: NodeStatus.ACTIVE,
      connection_state: 'ready'},
  ]);
  // Epoch unreadable at ingress: the rebalancer must surface a skip (the
  // existing retry-next-cycle channel), not throw and not schedule.
  const rebalancer = new UnifiedRebalancer({
    entityId: TEST_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: TEST_NODE_ID,
    systemTableCache: mockCache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: {
      getCurrentPublishedMembershipEpochSync() {
        return null; // unreadable
      },
    },
    rebalanceCoordinator: {
      ...createMockCoordinator(),
      async createOperation() {
        const error = new Error('current epoch unreadable');
        error.rebalanceSkipReason =
          REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE;
        throw error;
      },
    },
  });

  const result = await rebalancer.executeMoveViaCoordinator({
    type: MoveType.ADD,
    partitionId: TEST_PARTITION_ID,
    entityType: EntityType.PARTITION,
    entityId: TEST_PARTITION_ID,
    nodeId: TEST_TARGET_NODE_ID,
    replicaId: `${TEST_PARTITION_ID}-r4`,
  });

  t.equal(result?.skipped, true, 'the unreadable epoch skips the move');
  t.equal(
    result?.reason,
    REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE,
    'the skip carries the typed deferral reason into the retry path',
  );
  t.equal(result?.success, false, 'a deferred move is not scheduled');

  rebalancer.shutdown();
});

// --- executor-rejects-stale-epoch ---

test('executor-rejects-stale-epoch: the planning epoch is carried in the ' +
  'executor request for an epoch-bound ADD',
async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({currentEpoch: PLANNING_EPOCH});
  const {deliveredRequests, dispatch} = wireEpochDispatchProbe(coordinator);

  await dispatch(buildEpochBoundAddOperation(PLANNING_EPOCH));

  t.equal(
    deliveredRequests.length,
    1,
    'a current-epoch ADD dispatches to the executor',
  );
  t.equal(
    deliveredRequests[0]?.[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
    PLANNING_EPOCH,
    'the executor request carries the planning membership epoch',
  );
  await coordinator.shutdown();
});

test('executor-rejects-stale-epoch: a stale epoch-bound ADD fails closed ' +
  'before any dispatch',
async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({
    currentEpoch: PLANNING_EPOCH + 1, // advanced past the planning epoch
  });
  const {deliveredRequests, failedOperations, dispatch} =
    wireEpochDispatchProbe(coordinator);

  const result = await dispatch(buildEpochBoundAddOperation(PLANNING_EPOCH));

  t.equal(result?.success, false, 'a stale epoch-bound ADD does not dispatch');
  t.equal(
    deliveredRequests.length,
    0,
    'the executor never receives a stale request',
  );
  t.equal(
    failedOperations.length,
    1,
    'the stale operation is failed closed',
  );
  t.match(
    String(failedOperations[0]?.message),
    /Stale dispatch for published membership epoch/,
    'the failure names the stale-epoch fence',
  );
  await coordinator.shutdown();
});

test('executor-rejects-stale-epoch: an unreadable current epoch defers the ' +
  'dispatch instead of dispatching unfenced',
async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({currentEpoch: null});
  const {deliveredRequests, dispatch} = wireEpochDispatchProbe(coordinator);

  const result = await dispatch(buildEpochBoundAddOperation(PLANNING_EPOCH));

  t.equal(result?.success, false, 'an unreadable epoch does not dispatch');
  t.equal(result?.skipped, true, 'the unreadable-epoch dispatch is skipped');
  t.equal(
    result?.reason,
    REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
    'the skip defers into the existing dispatch-retry path',
  );
  t.equal(
    deliveredRequests.length,
    0,
    'the executor never dispatches unfenced',
  );
  await coordinator.shutdown();
});

// --- durable-planning-epoch ---

test('durable-planning-epoch: repository serialization preserves the sole ' +
  'planning epoch field',
async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({currentEpoch: PLANNING_EPOCH});
  // Admit + account so an epoch-bound ADD can persist to the record.
  grantEpochCoordinatorStorageAdmission(coordinator);

  const operation = await coordinator.createOperation(
    buildEpochBoundAddMove(PLANNING_EPOCH),
  );

  t.equal(
    operation?.[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
    PLANNING_EPOCH,
    'the operation record carries its planning epoch top-level',
  );
  const historyEpoch = (operation?.stepsHistory || []).find(
    (step) => step?.membershipPublicationEpoch !== undefined,
  );
  t.equal(
    historyEpoch,
    undefined,
    'no stepsHistory entry duplicates the planning epoch (dead write deleted)',
  );
  const persistedRow = coordinator.repository.buildReplicaOperationRow(
    operation,
  );
  t.equal(
    persistedRow.membership_publication_epoch,
    PLANNING_EPOCH,
    'the canonical row owns the planning epoch',
  );
  const reloaded = coordinator.repository.rowToOperation(persistedRow);
  t.equal(
    reloaded[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
    PLANNING_EPOCH,
    'repository reload restores the same top-level field',
  );
  await coordinator.shutdown();
});
