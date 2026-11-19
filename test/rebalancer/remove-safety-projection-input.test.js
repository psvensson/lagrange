// The remove-safety owner's one projection input (quest
// replica-placement-admission-owner, design section 2.8, constraint
// remove-safety-unchanged): the evaluator and the placement owner read the
// same derivation - committed node floor, voter-ready rows, the removed
// replica's identity, the rows left after it - and the same simple floor.
//
// REAL: the coordinator, workflow owner, readiness service and committed
// node owner of committed-node-remove-safety-fixture.js; only their SQL,
// transport and clock boundaries are controlled.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  REMOVE_SAFETY_PROJECTION_STATE, buildRemoveSafetyProjectionInput,
  resolveRemoveSafetySimpleFloor,
} from '../../src/rebalancer/operation-workflow-remove-safety-evaluator.js';
import {createCommittedFloorHarness, floorNodeRow, FLOOR_NODE_IDS} from
  './committed-node-remove-safety-fixture.js';

async function onHarness(measure, options) {
  const harness = await createCommittedFloorHarness(options);
  try {
    return await measure(harness);
  } finally {
    await harness.shutdown();
  }
}

const replicaIdsOf = (rows) => rows.map((row) => row.replica_id ?? row.service_id).sort();

test('the projection input is the evaluator\'s: the same floor decides both', () =>
  onHarness(async ({owner, operation, state}) => {
    const rows = await owner.getCriticalReplicaRowsForSafety(operation.partitionId);
    const ready = await buildRemoveSafetyProjectionInput(owner, operation, rows);
    assert.equal(ready.state, REMOVE_SAFETY_PROJECTION_STATE.READY);
    assert.equal(ready.operationReplicaId, operation.replicaId);
    assert.equal(ready.currentVoterReadyRows.length, 4);
    assert.deepEqual(replicaIdsOf(ready.projectedVoterReadyRows),
      replicaIdsOf(ready.currentVoterReadyRows.filter((row) =>
        (row.replica_id ?? row.service_id) !== operation.replicaId)));
    const floor = await resolveRemoveSafetySimpleFloor(owner, operation,
      ready.projectedVoterReadyRows);
    assert.deepEqual([floor.minReplicaCount, floor.projectedVoterReadyCount,
      floor.floorSatisfied], [3, 3, true]);
    assert.equal((await owner.evaluateRemoveSafety(operation)).classification, 'safe');
    // One voter's lease lapses: both read the same short floor.
    state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1], 999);
    const short = await buildRemoveSafetyProjectionInput(owner, operation, rows);
    const shortFloor = await resolveRemoveSafetySimpleFloor(owner, operation,
      short.projectedVoterReadyRows);
    assert.deepEqual([shortFloor.projectedVoterReadyCount, shortFloor.floorSatisfied],
      [2, false]);
    const denied = await owner.evaluateRemoveSafety(operation);
    assert.notEqual(denied.classification, 'safe');
    assert.match(denied.error, /\(2\/3\)/u);
  }));

test('counterexample: a seed replica is not removable while the only other voters ' +
  'are SYNCING', () => onHarness(async ({owner, operation}) => {
  const rows = await owner.getCriticalReplicaRowsForSafety(operation.partitionId);
  const syncing = rows.map((row) => (row.replica_id ?? row.service_id) ===
    operation.replicaId ? row : {...row, status: 'syncing'});
  const input = await buildRemoveSafetyProjectionInput(owner, operation, syncing);
  assert.equal(input.state, REMOVE_SAFETY_PROJECTION_STATE.READY);
  const floor = await resolveRemoveSafetySimpleFloor(owner, operation,
    input.projectedVoterReadyRows);
  assert.equal(floor.floorSatisfied, false);
  assert.equal(floor.projectedVoterReadyCount, 0);
}));

test('an unavailable committed node floor and a missing replica identity are typed, in ' +
  'the evaluator\'s order', async () => {
  await onHarness(async ({owner, operation}) => {
    const rows = await owner.getCriticalReplicaRowsForSafety(operation.partitionId);
    const noIdentity = await buildRemoveSafetyProjectionInput(owner,
      {...operation, replicaId: null}, rows);
    assert.equal(noIdentity.state,
      REMOVE_SAFETY_PROJECTION_STATE.REPLICA_IDENTITY_UNAVAILABLE);
  });
  await onHarness(async ({owner, operation}) => {
    const rows = await owner.getCriticalReplicaRowsForSafety(operation.partitionId);
    const unavailable = await buildRemoveSafetyProjectionInput(owner,
      {...operation, replicaId: null}, rows);
    assert.equal(unavailable.state, REMOVE_SAFETY_PROJECTION_STATE.NODE_FLOOR_UNAVAILABLE);
    assert.equal(typeof unavailable.committedNodeFloor.reason, 'string');
  }, {fail: true});
});
