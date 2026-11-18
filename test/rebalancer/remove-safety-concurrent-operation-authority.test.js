/**
 * Paired witness, gate 2: remove safety's serialization floor ("no other
 * membership change of this entity is in flight") rests on the operation
 * ledger owner's answer, never on the cache projection.
 *
 * The world: an in-flight ADD of the partition that the owner holds while
 * the cache projection is EMPTY (lagging). The REMOVE of the same partition
 * is evaluated through the workflow owner's production entry point
 * (evaluateRemoveSafety). Owner unavailable: the removal WAITS (it is not
 * failed and does not run). Owner answers the ADD: the removal waits on it.
 * Owner answers that there is none: the serialization floor passes.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CACHE_PROJECTION,
  OWNER_READ,
  createDurableStepWorld,
} from './durable-step-authority-fixture.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../src/rebalancer/operation-workflow-owner-shared.js';

const {REMOVE_SAFETY_EVALUATION_CLASSIFICATION} =
  OPERATION_WORKFLOW_OWNER_SHARED;

const PARTITION_ID = 'user_orders-p1';
const CONCURRENT_MESSAGE = /concurrent partition operation op-durable-step-authority is active/u;
const UNOBSERVED_MESSAGE = /did not answer whether another operation/u;

function buildRemove(world) {
  return world.owner.repository.rowToOperation({
    ...world.durable,
    operation_id: 'op-remove-peer',
    type: OperationType.REMOVE,
    replica_id: `${PARTITION_ID}-r1`,
    source_node_id: 'node-1',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.PENDING,
    status: ReplicaStatus.PENDING,
  });
}

test('remove safety waits on an unanswered ledger read and decides on the owner answer',
  async (t) => {
    const world = createDurableStepWorld({partitionId: PARTITION_ID});
    world.cacheProjection = CACHE_PROJECTION.EMPTY;
    world.owner.isConcurrentOperationTargetUncontactable = async () => false;
    const remove = buildRemove(world);

    world.ownerRead = OWNER_READ.UNAVAILABLE;
    const unobserved = await world.owner.evaluateRemoveSafety(remove);
    t.ok(world.unavailableOwnerReads > 0, 'the owner read failed at the port');
    t.equal(unobserved.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      'an unanswered ledger read holds the removal (not run, not failed)');
    t.match(unobserved.error, UNOBSERVED_MESSAGE, 'the wait is named');

    world.ownerRead = OWNER_READ.AVAILABLE;
    const concurrent = await world.owner.evaluateRemoveSafety(remove);
    t.not(concurrent.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      'the owner-visible concurrent ADD holds the removal although the ' +
        'projection is empty');
    t.match(concurrent.error, CONCURRENT_MESSAGE);

    world.ownerRead = OWNER_READ.ABSENT;
    const answered = await world.owner.evaluateRemoveSafety(remove);
    t.notMatch(String(answered.error || ''), CONCURRENT_MESSAGE,
      'no concurrent operation once the owner answers none');
    t.notMatch(String(answered.error || ''), UNOBSERVED_MESSAGE,
      'and no unobserved wait');
    world.coordinator.shutdown?.();
  });

// Paired witness, item B: a system-partition REMOVE held by a concurrent
// operation waits only while it is over-replicated; whether it is must be
// read. A replica-row read that did not answer is UNAVAILABLE and the
// removal waits (named); it is never read as "not over-replicated", which
// failed the REMOVE. Once the rows answer, the at-minimum REMOVE fails as
// before and the over-replicated one waits.
test('a held system REMOVE waits while its replication cannot be read',
  async (t) => {
    const partitionId = 'sql_transactions-p1';
    const world = createDurableStepWorld({partitionId});
    world.owner.isConcurrentOperationTargetUncontactable = async () => false;
    // The policy owner answers the minimum (the fixture has no policy port).
    world.owner.getCriticalMinReplicaCount = async () => 3;
    const remove = buildRemove(world);
    const rowsOf = (count) => Array.from({length: count}, (_, index) => ({
      replica_id: `${partitionId}-r${index + 1}`,
      node_id: `node-${index + 1}`,
      partition_id: partitionId,
    }));

    // The fixture's services answer carries no complete leader-witnessed
    // row set: the production read reports it unavailable.
    const unread = await world.owner.evaluateRemoveSafety(remove);
    t.equal(unread.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      'an unreadable replication state holds the REMOVE');
    t.equal(unread.deferReason, 'remove_safety_blocked');
    t.match(unread.error, CONCURRENT_MESSAGE);

    world.owner.getCriticalReplicaRowsForSafety = async () => rowsOf(3);
    const atMinimum = await world.owner.evaluateRemoveSafety(remove);
    t.equal(atMinimum.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
      'an answered at-minimum replica set fails the held REMOVE');

    world.owner.getCriticalReplicaRowsForSafety = async () => rowsOf(4);
    const over = await world.owner.evaluateRemoveSafety(remove);
    t.equal(over.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      'an answered over-replicated set waits');
    world.coordinator.shutdown?.();
  });
