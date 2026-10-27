// Actual PartitionService completion/custody controls. Transport holds are
// after native follower response production, with no fabricated ACK. This is
// a consumer witness, not a repetition of the F1 late-vote ordering oracle.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeFixture, INSERT_SQL} from
  '../../partition/participant-release-tx1-native-fixture.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../../src/partition/partition-service-constants.js';
import {buildPartitionWriteEntry, isWriteOutcomeUnknown} from
  '../../../src/partition/partition-write-kernel.js';
import {readCommittedStatementOutcome} from
  '../../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD} from
  '../../../src/partition/partition-committed-statement-outcome-constants.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {RAFT_RS_MESSAGE_TYPE as MESSAGE, RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {traceConsumer, trackAnswer, holdNativeDeliveries,
  durableConsumerView, observeProposalDispatch} from
  './runtime-completion-consumers-fixture.js';

const TIMEOUT_MS = 40000;
const TABLE = 'release_tx1_rows';

function writeEntry(service, suffix) {
  return buildPartitionWriteEntry({type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL, params: [suffix, suffix],
    entryId: `runtime-consumer-${suffix}`},
  {proposedBy: service.replicaId, proposedAt: service.timeSource.now()});
}

function rows(service) {
  return service.db.prepare(`SELECT * FROM ${TABLE} ORDER BY id`).all();
}

function outcomeOf(service, entry) {
  return readCommittedStatementOutcome(service,
    service.getCommittedEntryKey(entry));
}

function entryMatches(entry, entryId) {
  if (typeof entry.data !== 'string' || entry.data.length === 0) return false;
  try {
    return JSON.parse(Buffer.from(entry.data, 'base64').toString()).entryId === entryId;
  } catch {
    return false;
  }
}

function holdQuorumResponses(f) {
  const address = `${f.leader.nodeId}/partition/${f.leader.replicaId}`;
  const baseline = durableConsumerView(f.leader);
  const lastIndex = baseline.entries.at(-1)?.index ?? baseline.commitIndex;
  return holdNativeDeliveries(f.leader.transport, (to, packet) =>
    to === address && packet?.protocol === RAFT_RS_TRANSPORT_PROTOCOL &&
    packet.groupId === f.leader.partitionId &&
    packet.message?.msgType === MESSAGE.APPEND_RESPONSE &&
    BigInt(packet.message.index) > BigInt(lastIndex));
}

async function waitForUncommittedProposal(f, gate, dispatch, entry) {
  assert.equal(await f.group.waitFor(() => {
    const local = durableConsumerView(f.leader);
    const proposed = local.entries.find((item) => entryMatches(item, entry.entryId));
    if (!proposed || dispatch.completed.length === 0) return false;
    const acknowledgingPeers = new Set(gate.records.filter(({packet}) =>
      BigInt(packet.message.index) >= BigInt(proposed.index))
      .map(({packet}) => packet.message.from));
    return acknowledgingPeers.size === 2;
  }), true,
  'seam: both native followers acknowledge this exact new entry while responses are held');
  const before = durableConsumerView(f.leader);
  const proposed = before.entries.find((item) => entryMatches(item, entry.entryId));
  assert.ok(proposed, 'native proposal is present in the leader durable log');
  assert.ok(BigInt(before.commitIndex) < BigInt(proposed.index),
    'quorum withholding reached an actual uncommitted proposal');
  assert.ok(BigInt(before.appliedIndex) < BigInt(proposed.index));
  return {before, proposed};
}

test('partition application owner keeps the caller pending after native proposal acceptance',
  {timeout: TIMEOUT_MS}, async (t) => {
    const f = await nativeFixture(t);
    f.group.services.forEach((service) => service.raft.stopScheduling());
    const gate = holdQuorumResponses(f);
    const phaseTimings = {};
    const dispatch = observeProposalDispatch(f.leader, phaseTimings);
    const entry = writeEntry(f.leader, 'applied-wait');
    const pending = trackAnswer(f.leader.applyWrite(entry, phaseTimings));
    try {
      const held = await waitForUncommittedProposal(f, gate, dispatch, entry);
      traceConsumer(t, 'partition-before-quorum', {held, dispatch: dispatch.completed,
        deliveries: gate.evidence(), callerSettled: pending.settled,
        outcome: outcomeOf(f.leader, entry),
        rows: rows(f.leader)});
      assert.equal(pending.settled, false,
        'proposal acceptance is not the PartitionService write answer');
      assert.equal(outcomeOf(f.leader, entry).state,
        RECORD.UNSETTLED);
      assert.deepEqual(rows(f.leader), []);
      gate.release();
      const answer = await pending.promise;
      const applied = durableConsumerView(f.leader);
      const outcome = outcomeOf(f.leader, entry);
      const replay = await f.leader.applyWrite(entry);
      traceConsumer(t, 'partition-after-quorum', {answer, replay, outcome, applied,
        rows: rows(f.leader), deliveries: gate.evidence()});
      assert.equal(answer.success, true, JSON.stringify(answer));
      assert.equal(outcome.state, RECORD.SETTLED);
      assert.equal(answer.logIndex, outcome.logIndex);
      assert.ok(BigInt(applied.commitIndex) >= BigInt(answer.logIndex));
      assert.ok(BigInt(applied.appliedIndex) >= BigInt(answer.logIndex));
      assert.equal(replay.success, true);
      assert.equal(replay.replayOfLogIndex, answer.logIndex);
      assert.equal(rows(f.leader).length, 1, 'exact replay applies no second effect');
      assert.deepEqual(outcomeOf(f.leader, entry), outcome);
    } finally {
      await gate.restore();
      dispatch.restore();
      await pending.promise.catch(() => undefined);
    }
  });

test('partition shutdown after proposal returns same-entry UNKNOWN and a surviving quorum replays one applied result',
  {timeout: TIMEOUT_MS}, async (t) => {
    const f = await nativeFixture(t);
    f.group.services.forEach((service) => service.raft.stopScheduling());
    const gate = holdQuorumResponses(f);
    const phaseTimings = {};
    const dispatch = observeProposalDispatch(f.leader, phaseTimings);
    const entry = writeEntry(f.leader, 'unknown-custody');
    const pending = trackAnswer(f.leader.applyWrite(entry, phaseTimings));
    try {
      const held = await waitForUncommittedProposal(f, gate, dispatch, entry);
      traceConsumer(t, 'partition-before-shutdown', {held,
        callerSettled: pending.settled, deliveries: gate.evidence()});
      assert.equal(pending.settled, false);
      // A real service shutdown releases this already-proposed caller. It
      // does not roll back the durable log or manufacture a new Raft term.
      await f.leader.shutdown();
      const unknown = await pending.promise;
      traceConsumer(t, 'partition-shutdown-answer', unknown);
      assert.equal(isWriteOutcomeUnknown(unknown), true, JSON.stringify(unknown));
      assert.equal(unknown.entryId, entry.entryId);
      // These actual old response deliveries now encounter the retired
      // recipient. Their failure is retained; no fake successful ACK is used.
      await gate.restore();
      const survivors = f.group.services.filter((service) => service !== f.leader);
      survivors.forEach((service) => service.raft.startScheduling());
      assert.equal(await f.group.waitFor(() => survivors.some((service) =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER)), true,
      'post-measurement recovery: the actual surviving quorum elects a leader');
      const leader = survivors.find((service) =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER);
      assert.equal(await f.group.waitFor(() =>
        outcomeOf(leader, entry).state === RECORD.SETTLED),
      true, 'the new leader commits the retained proposal through actual application');
      const outcome = outcomeOf(leader, entry);
      const beforeReplay = durableConsumerView(leader);
      const replay = await leader.applyWrite(entry);
      const afterReplay = durableConsumerView(leader);
      traceConsumer(t, 'partition-survivor-replay', {unknown, replay, outcome,
        beforeReplay, afterReplay, rows: rows(leader), deliveries: gate.evidence()});
      assert.equal(replay.success, true, JSON.stringify(replay));
      assert.equal(replay.replayOfLogIndex, outcome.logIndex);
      assert.equal(rows(leader).length, 1, 'the uncertain write has exactly one effect');
      assert.deepEqual(outcomeOf(leader, entry), outcome);
      assert.equal(afterReplay.entries.filter((item) =>
        entryMatches(item, entry.entryId)).length, 1,
      'same-identity replay does not append another copy');
    } finally {
      await gate.restore();
      dispatch.restore();
      await pending.promise.catch(() => undefined);
    }
  });
