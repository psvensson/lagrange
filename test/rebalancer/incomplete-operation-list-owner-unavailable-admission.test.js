/**
 * The incomplete-operation list read answers one named observation:
 * PRESENT / EMPTY with the owner's complete list, or DEFERRED with no list.
 * It used to return the cache projection when the owner did not answer (and
 * in its default mode whenever the cache held a row), so a coordinator
 * admission counted the projection and admitted on the cache's word.
 *
 * Paired, from the coordinator's admission entries on a real
 * RebalanceCoordinator, faults injected at the replica_operations read port
 * (durable-step-authority-fixture.js): (a) the owner cannot answer - the
 * gates hold with the named DEFERRED state and nothing is admitted, although
 * the cache projects an in-flight row; (b) the owner answers - the same
 * gates proceed.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CACHE_PROJECTION,
  OWNER_READ,
  createDurableStepWorld,
} from './durable-step-authority-fixture.js';
import {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
} from '../../src/rebalancer/incomplete-operation-list-observation.js';

test('an unanswered list holds admission with the DEFERRED state; the owner\'s ' +
  'answer lets the same admission proceed', async (t) => {
  const world = createDurableStepWorld();
  world.cacheProjection = CACHE_PROJECTION.MIRRORS_DURABLE;
  const coordinator = world.coordinator;
  const userPartitionId = 'users-p1';
  try {
    // (a) The owner cannot answer; the cache projects the in-flight ADD.
    world.ownerRead = OWNER_READ.UNAVAILABLE;
    t.equal(coordinator.repository.queryCachedIncompleteOperations().length, 1,
      'the cache projection holds an in-flight operation');
    const unanswered = await coordinator.queryIncompleteOperations();
    t.equal(unanswered.state, INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED,
      'the list read is DEFERRED');
    t.same(unanswered.operations, [], 'and carries no list');
    t.not(unanswered.deferredOutcome, null, 'with its typed outcome');
    // Past the failed read's backoff, so the gate reads the owner again.
    coordinator.repository.nextIncompleteOperationSqlRetryAtMs = 0;
    const readsBefore = world.unavailableOwnerReads;
    t.equal(await coordinator.canStartRemoveOperation({
      partitionId: userPartitionId,
      bypassEmptyQueryDelay: true,
    }), false, 'REMOVE admission holds: no count on the cache\'s word');
    t.ok(world.unavailableOwnerReads > readsBefore,
      'the gate asked the owner, not the cache');
    const interlock = await coordinator.ensureOperationLedgerSelfMoveSerialized({
      normalizedMoveType: 'ADD',
      partitionId: userPartitionId,
      entityType: 'partition',
      entityId: userPartitionId,
      move: {type: 'ADD', partitionId: userPartitionId},
    }).then(() => ({admitted: true}), (error) => ({error}));
    t.equal(interlock.admitted, undefined,
      'the ledger interlock does not admit on an unanswered list');
    t.equal(interlock.error?.operationVisibilityState,
      INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED,
      'it holds with the named DEFERRED state');

    // (b) The owner answers: the same list and the same gates proceed.
    world.ownerRead = OWNER_READ.AVAILABLE;
    coordinator.repository.nextIncompleteOperationSqlRetryAtMs = 0;
    const answered = await coordinator.queryIncompleteOperations();
    t.equal(answered.state, INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
      'the owner\'s answer is PRESENT');
    t.equal(answered.complete, true, 'and complete');
    t.same(answered.operations.map((operation) => operation.operationId),
      [world.operationId], 'with the owner\'s rows');
    t.equal(await coordinator.canStartRemoveOperation({
      partitionId: userPartitionId,
      bypassEmptyQueryDelay: true,
    }), true, 'REMOVE admission proceeds on the owner\'s count');
    await coordinator.ensureOperationLedgerSelfMoveSerialized({
      normalizedMoveType: 'ADD',
      partitionId: userPartitionId,
      entityType: 'partition',
      entityId: userPartitionId,
      move: {type: 'ADD', partitionId: userPartitionId},
    });
    t.pass('the ledger interlock admits on the owner\'s answer');
  } finally {
    await coordinator.shutdown();
  }
});
