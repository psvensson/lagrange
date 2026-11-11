/**
 * A replica_operations list read that did not answer is never "no
 * operations". The incomplete-operation and entity list observations name
 * it DEFERRED with a typed outcome (complete=false; any operations are a
 * projection fallback), admission gates hold on it, a strict dedupe read
 * throws instead of answering "none", and the keyed authority reads used
 * by insert-collision checks answer a named state.
 *
 * Faults are injected at the replica_operations read port of a real
 * RebalanceCoordinator (durable-step-authority-fixture.js).
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CACHE_PROJECTION,
  OWNER_READ,
  createDurableStepWorld,
} from './durable-step-authority-fixture.js';
import {
  OPERATION_VISIBILITY_STATE,
  isOperationVisibilityUnavailableError,
} from '../../src/rebalancer/replica-operation-repository-operation-visibility.js';
import {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';

const ENTITY_TYPE = 'partition';

function unavailableWorld(cacheProjection) {
  const world = createDurableStepWorld();
  world.cacheProjection = cacheProjection;
  world.ownerRead = OWNER_READ.UNAVAILABLE;
  return world;
}

test('L1: a failed incomplete-operation read is DEFERRED, typed, never EMPTY',
  async (t) => {
    const world = unavailableWorld(CACHE_PROJECTION.EMPTY);
    try {
      const repository = world.owner.repository;
      const observation =
        await repository.getIncompleteOperationVisibilityObservation({
          visibilityReadMode:
            REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
        });
      t.ok(world.unavailableOwnerReads > 0, 'the owner read was attempted');
      t.equal(observation.state, INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED,
        'a read that did not answer is DEFERRED');
      t.not(observation.deferredOutcome, null, 'with its typed outcome');
      t.equal(observation.deferredOutcome?.retryable, true,
        'carrying the failure\'s retry semantics');
      t.equal(observation.complete, false, 'and never a complete list');
    } finally {
      await world.coordinator.shutdown();
    }
  });

test('L2: an admission gate holds on a failed in-flight read', async (t) => {
  const world = unavailableWorld(CACHE_PROJECTION.EMPTY);
  try {
    const coordinator = world.coordinator;
    await coordinator.queryIncompleteOperations({
      visibilityReadMode:
        REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
    });
    const observation = coordinator.getIncompleteOperationObservation();
    t.equal(
      coordinator.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
        observation,
      ),
      true,
      'the gate does not open on "no operations" from a failed read',
    );
  } finally {
    await world.coordinator.shutdown();
  }
});

test('L3: a strict create-dedupe read that fails throws, never "none"',
  async (t) => {
    const world = unavailableWorld(CACHE_PROJECTION.EMPTY);
    try {
      const outcome = await world.owner.repository.queryExistingInFlightOperation(
        world.partitionId,
        'node-2',
        ENTITY_TYPE,
        world.partitionId,
        {},
        () => true,
        {allowCacheFallbackOnReadFailure: false},
      ).then((value) => ({value}), (error) => ({error}));
      t.equal(isOperationVisibilityUnavailableError(outcome.error), true,
        'the typed retryable unavailability, not null');
    } finally {
      await world.coordinator.shutdown();
    }
  });

test('L4: the advisory entity projection without a cache throws on a failed ' +
  'read instead of answering []', async (t) => {
  const world = unavailableWorld(CACHE_PROJECTION.EMPTY);
  const repository = world.owner.repository;
  const cache = repository.systemTableCache;
  try {
    repository.systemTableCache = null;
    const outcome = await repository.getOperationsByEntity(
      ENTITY_TYPE, world.partitionId,
    ).then((value) => ({value}), (error) => ({error}));
    t.equal(isOperationVisibilityUnavailableError(outcome.error), true,
      'a failed read is unavailability');
  } finally {
    repository.systemTableCache = cache;
    await world.coordinator.shutdown();
  }
});

test('L5: a failed entity read with cached in-flight rows is DEFERRED, ' +
  'not a PRESENT list', async (t) => {
  const world = unavailableWorld(CACHE_PROJECTION.MIRRORS_DURABLE);
  try {
    const observation = await world.owner.repository
      .getOperationsByEntityAuthoritativeObservation(
        ENTITY_TYPE, world.partitionId,
      );
    t.equal(observation.state, INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED,
      'the cached rows are a projection fallback');
    t.equal(observation.complete, false, 'not a complete list');
    t.ok(observation.operationCount >= 1, 'the projection is still carried');
  } finally {
    await world.coordinator.shutdown();
  }
});

test('L6: the insert-collision authority reads answer a named state',
  async (t) => {
    const world = unavailableWorld(CACHE_PROJECTION.EMPTY);
    try {
      const repository = world.owner.repository;
      const lane = await repository
        .observeAuthoritativeOperationByMessageGroupMembershipLane('lane-1');
      const claim = await repository
        .observeAuthoritativeOperationByTargetClaimKey('claim-1');
      t.equal(lane.state, OPERATION_VISIBILITY_STATE.UNAVAILABLE,
        'a failed lane read is UNAVAILABLE, not "no holder"');
      t.equal(claim.state, OPERATION_VISIBILITY_STATE.UNAVAILABLE,
        'a failed claim read is UNAVAILABLE, not "no holder"');
      world.ownerRead = OWNER_READ.ABSENT;
      const absent = await repository
        .observeAuthoritativeOperationByTargetClaimKey('claim-1');
      t.equal(absent.state, OPERATION_VISIBILITY_STATE.ABSENT,
        'an answered empty read is ABSENT');
    } finally {
      await world.coordinator.shutdown();
    }
  });

test('L7: a confirmed empty list stays EMPTY and complete', async (t) => {
  const world = createDurableStepWorld();
  world.cacheProjection = CACHE_PROJECTION.EMPTY;
  world.ownerRead = OWNER_READ.ABSENT;
  try {
    const observation =
      await world.owner.repository.getIncompleteOperationVisibilityObservation({
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
    t.equal(observation.state, INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
      'the owner answered with no rows');
    t.equal(observation.complete, true, 'a complete (confirmed) empty');
  } finally {
    await world.coordinator.shutdown();
  }
});
