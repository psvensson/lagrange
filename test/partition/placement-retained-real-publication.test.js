// Cross-boundary witness of the retained placement repair owner. The REAL
// partition leadership publishers (applyReplicaLeadership -> queueRoleUpdate /
// queueLeaderNodeUpdate) write one durable control-plane truth; every applied
// write reaches each coordinator's cache only through CDC delivery (CDCHandler
// -> cache admission); the retained consumer wakes and rebinds from the cache.
// Registered as the coupled pair leadership publication <-> retained repair.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {raiseParticipantCutoverPause} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {clearFixtureSingletons, resetFixtureSingletons, resumeFixtureParticipantAdmission} from
  '../test-helpers/participant-transaction-fixture.js';
import {attachRealPublication, publishedLeader, withRetainedLeadershipPair} from
  './placement-retained-leadership-fixture.js';
import {bounded, idleRepairs, ledgerRow, repairCommands, retainMissingOperation} from
  './placement-retained-witness-support.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PARTITION_ID = 'retained-real-publication-p1';
const OPERATION_ID = 'retained-real-publication-remove';
const LEDGER_PARTITION = 'replica_operations-p1';

test('real leadership publication through CDC rebinds the retained owner A-B-A; the exact entry completes once', () =>
  withRetainedLeadershipPair(async ({a, b, changeRoles}) => {
    const {emitted} = attachRealPublication([a, b]);
    const retained = await retainMissingOperation(a, {operationId: OPERATION_ID,
      partitionId: PARTITION_ID, replicaId: `${PARTITION_ID}-r1`, targetNodeId: a.leader.nodeId});
    raiseParticipantCutoverPause(a.leader);
    const repository = a.coordinator.repository;
    assert.equal(await bounded(repository.repairRetainedOperation(retained), 'paused'), false);
    const pinned = repository.retainedPlacementRepairs.get(retained.operationId).entry;
    assert.equal(pinned.state, 'pinned');
    const bodyText = JSON.stringify(pinned.body);

    await changeRoles(b, {resume: false});
    await publishedLeader([a, b], b);
    await idleRepairs(repository, b.coordinator.repository);
    const atB = repository.retainedPlacementRepairs.get(retained.operationId);
    assert.equal(atB.binding.state, 'remote', 'the consumer rebound from the real publication');
    assert.equal(atB.binding.nodeId, b.leader.nodeId);
    assert.equal(atB.entry.entryId, pinned.entryId, 'the exact entry survives the handoff');
    assert.equal(repairCommands(a, b).length, 0, 'a paused receiver proposes nothing');

    await changeRoles(a, {resume: false});
    await publishedLeader([a, b], a);
    await idleRepairs(repository, b.coordinator.repository);
    const atA = repository.retainedPlacementRepairs.get(retained.operationId);
    assert.equal(atA.binding.state, 'local', 'the publication back to A rebinds to the local leader');
    assert.equal(atA.entry.entryId, pinned.entryId);
    assert.equal(JSON.stringify(atA.entry.body), bodyText);
    assert.equal(repairCommands(a, b).length, 0);

    await resumeFixtureParticipantAdmission(a.leader);
    await idleRepairs(repository, b.coordinator.repository);
    assert.ok(ledgerRow(a, retained.operationId), 'the actual release on A restores the row');
    const restores = repairCommands(a, b).filter((command) =>
      command.body.operation.operationId === retained.operationId);
    assert.equal(restores.length, 1, 'exactly one native proposal');
    assert.equal(restores[0].entryId, pinned.entryId, 'the original entry');
    assert.equal(JSON.stringify(restores[0].body), bodyText, 'the original bytes');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
    assert.equal(b.coordinator.repository.retainedPlacementRepairs.size, 0,
      'B released the custody of its ended tenure');

    // Producer conformance: what the real publishers emitted for these raft
    // transitions is what the fixture primitives admit for routing.
    const leaders = emitted.filter((change) => change.tableName === 'partitions' &&
      change.data.partition_id === LEDGER_PARTITION).map((change) => change.data.leader_node_id);
    assert.deepEqual(leaders.slice(-2), [b.leader.nodeId, a.leader.nodeId]);
    assert.equal(emitted.filter((change) => change.tableName === 'services' &&
      change.data.raft_role === RAFT_ROLE.LEADER).length, 0,
    'a partition SERVICES row never publishes leader');
  }));
