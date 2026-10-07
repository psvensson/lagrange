// Exactly-once application of a write whose first delivery's answer was lost
// across a leader change, on a real three-replica rs-raft group behind the
// production engine (the executor's partition delivery is the one
// redelivery owner; every delivery carries the write's one entryId).
//
// (c1) The first copy reached the new leader's log uncommitted, and the
//      redelivery is proposed again there: TWO log entries for one entryId,
//      both committed - the first applies, the second is answered from its
//      outcome row (the first application's result).
// (c2/d) The first copy is on the deposed leader only, which still believes
//      it leads (term t) while the redelivery is proposed on the new leader
//      (term t+1) and commits: the first copy is truncated, never applied.
// In both, the caller's answer is the first application's result and every
// replica holds the row once.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../src/raft/raft-rs-ingress-constants.js';
import {tuningOf} from '../../src/raft/raft-rs-runtime-tuning.js';
import {
  SETTLE_BUDGET_MS,
  SURFACE_INSERT,
  USER_TABLE,
  lastLogIndexOf,
  logEntriesOf,
  waitFor,
  withGroupSurface,
} from './unknown-outcome-surface-fixture.js';

const TEST_TIMEOUT_MS = 90000;
const TEMP_PREFIX = 'write-exactly-once-schedules-';
// raft-rs message types the new leader's replication is held with.
const MSG_APPEND = 3;
const MSG_HEARTBEAT = 8;
const ROUTER_CONNECTION_CLOSED = 'ROUTER_CONNECTION_CLOSED';

// The first delivery to r1 is proposed there, then its answer is lost (the
// router's connection closes) once `afterProposed` has run: the executor
// re-delivers it under the same entryId elsewhere.
function loseFirstAnswerFromR1({interceptors, services, members, dbFileOf,
  afterProposed}) {
  const lost = {entryId: null, done: false};
  interceptors.push(async (entry, message) => {
    if (lost.done || entry.index !== 0) {
      return undefined;
    }
    lost.done = true;
    lost.entryId = message.entryId;
    services[0].handleRemoteQuery(message).catch(() => undefined);
    assert.equal(await waitFor(() =>
      logEntriesOf(dbFileOf(members[0]), message.entryId).length === 1),
    true, 'setup: the first delivery is on r1\'s log');
    await afterProposed();
    const error = new Error(`connection to ${members[0][1]} closed`);
    error.code = ROUTER_CONNECTION_CLOSED;
    throw error;
  });
  return lost;
}

async function transferLeadershipToR2(services) {
  const transfer = await services[0].raft.transferLeadership({
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
    replicaIdentity: services[1].replicaId,
  });
  assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    `setup: the live leader transfers to r2 (${JSON.stringify(transfer)})`);
  assert.equal(await waitFor(() => services[1].raft.readStatus().role ===
    RAFT_ROLE.LEADER), true, 'setup: r2 leads');
}

async function driveNativeR2Election(services) {
  for (const service of services.slice(1)) {
    service.raft.stopScheduling();
  }
  const rounds = 2 * Math.max(...services.slice(1).map((service) =>
    tuningOf({
      heartbeatMs: service.raftTimingConfig.heartbeatMs,
      electionMinMs: service.raftTimingConfig.electionMinMs,
      tickIntervalMs: service.raftTimingConfig.tickIntervalMs,
    }).electionTick)) + 1;
  for (let round = 0; round < rounds; round += 1) {
    await services[1].raft.tick();
    await services[2].raft.tick();
    if (services[1].raft.readStatus().role === RAFT_ROLE.LEADER) {
      for (const service of services.slice(1)) {
        service.raft.startScheduling();
      }
      return;
    }
  }
  assert.fail('setup: r2 did not lead after the native lease/election bound');
}

async function everyReplicaHoldsOnce(rowsEverywhere) {
  return waitFor(() => rowsEverywhere(`SELECT node_id FROM ${USER_TABLE} ` +
    'ORDER BY node_id').every((rows) =>
    rows.map((row) => row.node_id).join() === 'row-0,row-1'));
}

test('(c1) two log entries for one entryId, both committed: applied once, ' +
  'the caller answered with the first application\'s result',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withGroupSurface({partitionId: 'xo-c1', table: USER_TABLE,
    tempPrefix: TEMP_PREFIX}, async ({engine, services, members, peers,
    blocked, dropIf, interceptors, dbFileOf, rowsEverywhere}) => {
    assert.equal((await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']))
      .success, true, 'setup: the group serves a write');
    const [p1, p2, p3] = peers;
    // r1's appends reach r2 only and nothing reaches r1: the first copy is
    // on r1's and r2's logs, uncommitted.
    for (const pair of [`${p1}>${p3}`, `${p2}>${p1}`, `${p3}>${p1}`]) {
      blocked.add(pair);
    }
    // r2, once it leads, cannot replicate until the redelivery is on its
    // log too.
    const holdR2 = (packet) => packet?.from === p2 &&
      [MSG_APPEND, MSG_HEARTBEAT].includes(packet?.message?.msgType);
    const lost = loseFirstAnswerFromR1({interceptors, services, members,
      dbFileOf,
      afterProposed: async () => {
        assert.equal(await waitFor(() => lastLogIndexOf(dbFileOf(members[1])) ===
          lastLogIndexOf(dbFileOf(members[0]))), true,
        'setup: the first copy reached r2');
        dropIf.add(holdR2);
        await transferLeadershipToR2(services);
      }});
    const write = engine.executeQuery(SURFACE_INSERT, ['row-1', 'v'],
      {timeoutMs: SETTLE_BUDGET_MS});
    assert.equal(await waitFor(() => lost.entryId !== null &&
      logEntriesOf(dbFileOf(members[1]), lost.entryId).length === 2), true,
    'setup: the redelivery is proposed again on r2 - two entries');
    dropIf.delete(holdR2);
    blocked.clear();
    const answered = await write;
    const copies = logEntriesOf(dbFileOf(members[1]), lost.entryId);
    assert.equal(copies.length, 2, 'both copies on the leader\'s log ' +
      `(${JSON.stringify(copies)})`);
    assert.ok(copies[0].term < copies[1].term,
      'the first copy in term t, the redelivery in term t+1');
    assert.equal(answered.success, true, 'answered applied ' +
      `(${JSON.stringify(answered.error ?? null)})`);
    assert.equal(answered.affectedRows, 1,
      'with the first application\'s count');
    assert.ok(await everyReplicaHoldsOnce(rowsEverywhere),
      'every replica holds the row once');
  });
});

test('(c2/d) the first copy on the deposed leader only, the redelivery on ' +
  'the new leader in the next term: the first copy is truncated, the ' +
  'redelivery applies once', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withGroupSurface({partitionId: 'xo-c2', table: USER_TABLE,
    tempPrefix: TEMP_PREFIX}, async ({engine, services, members, peers,
    blocked, dropIf, interceptors, dbFileOf, rowsEverywhere}) => {
    assert.equal((await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']))
      .success, true, 'setup: the group serves a write');
    const [p1, p2, p3] = peers;
    // r1 is cut off both ways: it keeps leading term t with the first copy
    // on its own log only.
    for (const pair of [`${p1}>${p2}`, `${p1}>${p3}`, `${p2}>${p1}`,
      `${p3}>${p1}`]) {
      blocked.add(pair);
    }
    // Both followers keep ticking so their native leader leases expire. Hold
    // only r3's competing election requests; its vote responses to r2 still
    // flow, so r2 wins through the ordinary pre-vote/vote protocol.
    dropIf.add((packet) => packet?.from === p3 && [
      RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE,
      RAFT_RS_MESSAGE_TYPE.REQUEST_PRE_VOTE,
    ].includes(packet?.message?.msgType));
    let firstCopy = null;
    const lost = loseFirstAnswerFromR1({interceptors, services, members,
      dbFileOf,
      afterProposed: async () => {
        await driveNativeR2Election(services);
        assert.equal(services[0].raft.readStatus().role, RAFT_ROLE.LEADER,
          'setup: r1 still leads its own term (the race)');
      }});
    const write = engine.executeQuery(SURFACE_INSERT, ['row-1', 'v'],
      {timeoutMs: SETTLE_BUDGET_MS});
    assert.equal(await waitFor(() => lost.entryId !== null &&
      (firstCopy = logEntriesOf(dbFileOf(members[0]), lost.entryId)[0]) !==
        undefined), true, 'setup: the first copy is on r1\'s log');
    const answered = await write;
    assert.equal(answered.success, true, 'answered applied ' +
      `(${JSON.stringify(answered.error ?? null)})`);
    assert.equal(answered.affectedRows, 1, 'with its one application\'s count');
    blocked.clear();
    assert.ok(await everyReplicaHoldsOnce(rowsEverywhere),
      'every replica holds the row once');
    assert.equal(await waitFor(() => {
      const copies = logEntriesOf(dbFileOf(members[0]), lost.entryId);
      return copies.length === 1 && copies[0].term > firstCopy.term;
    }), true, 'r1\'s first copy was truncated: its log holds only the ' +
      'redelivery\'s');
  });
});
