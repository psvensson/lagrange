// TX1 v10 8.1: the request owner consults the split/merge owners before new
// BEGIN/PREPARE admission. This is the R10 hint, not the Leg B commit barrier.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {PARTITION_TRANSITION_STATE as STATE} from
  '../../src/partition/partition-constants.js';
import {PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {
  PARTITION_ID, ROW, V3, applyCommitted, beginMessage, clearFixtureSingletons,
  generationOf, identityOf, operationOf, prepareCommandOf, prepareMessage,
  resetFixtureSingletons, send, settleTicks, shutdownAll, startLeader, track,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const UNAVAILABLE = 'participant_transaction_topology_unavailable';
const cacheOf = (rows) => ({getAll: () => rows, get: () => null});
const rowOf = (state, metadata) => ({partition_transition_state: state,
  partition_transition_metadata: metadata});
const split = (sourcePartitionId, targetPartitionIds) => ({sourcePartitionId,
  targetPartitionIds, primaryKeyColumn: 'id', targetPartitionVersion: 2});
const merge = (sourcePartitionIds, targetPartitionIds) => ({sourcePartitionIds,
  targetPartitionIds, primaryKeyColumn: 'id', targetPartitionVersion: 2});
const topologyCases = [
  ['split handle', {splitReplication: {phase: STATE.SPLIT_BACKFILLING}}],
  ['merge handle', {mergeReplication: {phase: STATE.MERGE_CATCHUP}}],
  ['split source', {systemTableCache: cacheOf([rowOf(STATE.SPLIT_BACKFILLING,
    split(PARTITION_ID, ['left', 'right']))])}],
  ['split target', {systemTableCache: cacheOf([rowOf(STATE.SPLIT_CATCHUP,
    JSON.stringify(split('source', [PARTITION_ID, 'right'])))])}],
  ['merge source', {systemTableCache: cacheOf([rowOf(STATE.MERGE_CUTOVER_ACTIVE,
    merge(['left', PARTITION_ID], ['target']))])}],
  ['merge target', {systemTableCache: cacheOf([rowOf(STATE.MERGE_BACKFILLING,
    merge(['left', 'right'], [PARTITION_ID]))])}],
];

async function onLeader(measure) {
  const {leader, proposed} = await startLeader();
  leader.systemTableCache = cacheOf([]);
  try {
    return await measure(leader, proposed);
  } finally {
    leader.splitReplication = null;
    leader.mergeReplication = null;
    await shutdownAll(leader);
  }
}

for (const [name, state] of topologyCases) {
  test(`TX1 topology request owner: ${name} refuses BEGIN and new PREPARE`, () =>
    onLeader(async (leader, proposed) => {
      const tx = identityOf(`topology-${name}`);
      assert.equal((await send(leader, beginMessage(tx))).success, true);
      Object.assign(leader, state);
      const begin = await send(leader, beginMessage(identityOf('blocked-begin')));
      const prepare = track(send(leader, prepareMessage(tx)));
      await settleTicks();
      assert.equal(begin.failureCode, CODE.TOPOLOGY_TRANSITION_ACTIVE);
      assert.equal(begin.deferRetry, true);
      assert.equal(prepare.settled, true, 'the fence answers without a Raft proposal');
      assert.equal(prepare.value.failureCode, CODE.TOPOLOGY_TRANSITION_ACTIVE);
      assert.equal(proposed.length, 0);
    }));
}

for (const [name, cache] of [
  ['missing owner', null],
  ['unreadable owner', {getAll: () => {
    throw new Error('owner unavailable');
  }}],
  ['unavailable rows', cacheOf(null)],
  ['malformed active metadata', cacheOf([rowOf(STATE.SPLIT_CATCHUP, '{broken')])],
  ['incomplete source metadata', cacheOf([rowOf(STATE.SPLIT_CATCHUP,
    {sourcePartitionId: PARTITION_ID})])],
]) {
  test(`TX1 topology request owner: ${name} cannot prove absence`, () =>
    onLeader(async (leader, proposed) => {
      leader.systemTableCache = cache;
      const answer = await send(leader, beginMessage(identityOf('unavailable')));
      assert.equal(answer.failureCode, UNAVAILABLE);
      assert.equal(answer.deferRetry, true);
      assert.equal(proposed.length, 0);
    }));
}

test('TX1 topology request owner: unrelated valid transition permits BEGIN; a durable ' +
  'PREPARED receipt remains answerable when topology becomes active', () =>
  onLeader(async (leader, proposed) => {
    leader.systemTableCache = cacheOf([rowOf(STATE.SPLIT_CATCHUP,
      split('elsewhere', ['left', 'right']))]);
    const tx = identityOf('already-prepared');
    assert.equal((await send(leader, beginMessage(tx))).success, true);
    applyCommitted(leader, prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader)));
    leader.splitReplication = {phase: STATE.SPLIT_CATCHUP};
    const answer = await send(leader, prepareMessage(tx));
    assert.equal(answer.success, true);
    assert.equal(answer.state, V3.STATE.PREPARED);
    assert.equal(proposed.length, 0, 'answer the durable receipt, never propose again');
  }));
