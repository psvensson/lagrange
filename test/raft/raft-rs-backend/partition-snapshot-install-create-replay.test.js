// Witness H3 (quest partition-checkpoint-epoch-generation, hand-over coverage
// model cell 13): the replay of a replica's own CREATE while that replica is
// stopped for a snapshot install. It must open nothing and must not answer,
// or emit, that the stopped replica exists and is active.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {EXECUTOR_OUTCOME_TYPE} from
  '../../../src/rebalancer/executor-outcome-constants.js';
import {
  ReplicaOperationResponseStatus,
} from '../../../src/rebalancer/replica-operation-constants.js';
import {
  CADENCE_ENTRY_THRESHOLD,
  PARTITION_ID,
  committedAddRequest,
  cutOff,
  faultNextOpen,
  recreationOf,
  targetService,
  waitFor,
  withInstallWorld,
  writeAndCompact,
} from './snapshot-install-recreate-fixture.js';

const ROWS = CADENCE_ENTRY_THRESHOLD;
const REPLICA_ID = `${PARTITION_ID}-r4`;

test('H3: the replay of a CREATE whose replica is stopped for an install ' +
  'opens nothing and does not report the stopped replica active',
{timeout: 180000}, async () => {
  await withInstallWorld({establishedOnTarget: false}, async (world) => {
    // The replica is created through the handler and reaches ACTIVE.
    await writeAndCompact(world, 1, ROWS);
    const {request} = await committedAddRequest(world, REPLICA_ID);
    const created = new Promise((resolve) => {
      world.handler.once('replicaCreated', resolve);
      world.handler.once('replicaCreationFailed', resolve);
    });
    await world.handler.handleCreateReplica(request);
    await created;
    await waitFor(() => targetService(world, REPLICA_ID)?.raft?.readStatus()
      .appliedIndex === world.leader.raft.readStatus().appliedIndex,
    'the created replica caught up');
    // It falls behind a later compaction; its reopen after the install is held.
    const reconnect = cutOff(world, targetService(world, REPLICA_ID));
    await writeAndCompact(world, ROWS + 1, 2 * ROWS);
    const gate = Promise.withResolvers();
    const reached = Promise.withResolvers();
    faultNextOpen(world, REPLICA_ID, async () => {
      reached.resolve();
      await gate.promise;
    });
    const outcomes = [];
    const emit = world.handler.emitExecutorOutcome.bind(world.handler);
    world.handler.emitExecutorOutcome = (type, ...rest) => {
      outcomes.push(type);
      return emit(type, ...rest);
    };
    const opensBefore = world.created.length;
    reconnect();
    await reached.promise;
    let facts;
    try {
      const response = await world.handler.handleCreateReplica(request);
      facts = {status: response.status, errorCode: response.errorCode ?? null,
        outcomes: [...outcomes], record: recreationOf(world, REPLICA_ID)?.state,
        opened: world.created.length - opensBefore};
    } finally {
      gate.resolve();
    }
    await waitFor(() => targetService(world, REPLICA_ID)?.isShutdown === false,
      'the replica returns from its own install');
    assert.equal(world.created.length - opensBefore, 1,
      `the replay opened nothing: ${JSON.stringify(facts)}`);
    assert.notEqual(facts.status, ReplicaOperationResponseStatus.ALREADY_EXISTS,
      `a stopped replica is not answered as existing: ${JSON.stringify(facts)}`);
    assert.equal(facts.outcomes.includes(
      EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE), false,
    `no ACTIVE outcome is emitted for a stopped replica: ${JSON.stringify(facts)}`);
  });
});
