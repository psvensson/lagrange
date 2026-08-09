/**
 * Committed-prefix same-index term-conflict livelock (quest
 * raft-committed-prefix-conflict-livelock).
 *
 * The hazard (CL-040 class): base commit-index catch-up advances the DURABLE
 * committed watermark over a stale same-index entry whose per-entry committed
 * FLAG lags (and, on the sqlite adapter, whose liferaft-visible committedIndex
 * CACHE lags the durable _raft_state row — more than one facade can hold an
 * adapter over the same database). truncateConflictingSameIndexTail used to
 * trust the FLAG while sqlite-log-adapter.removeEntriesAfter refuses by a
 * FRESH committed-INDEX read, so every leader heartbeat re-requested a
 * truncation the adapter must refuse — the unbounded livelock that starved
 * formation (46-363 identical 'Refused raft log truncation into the committed
 * prefix' retries in red runs).
 *
 * Red-on-revert: restoring the flag-gated truncation makes every delivered
 * heartbeat below call removeEntriesAfter(conflictIndex - 1) and increment the
 * adapter's committedTruncationBlockedCount witness — the zero-truncation and
 * zero-refusal assertions here go red, and no divergence event is surfaced.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';

import {
  RAFT_COMMITTED_ENTRY_CONFLICT_CODE,
} from '../../src/raft/committed-entry-guard.js';
import {RAFT_EVENT, RAFT_PACKET_TYPE} from '../../src/raft/constants.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {LiferaftProvider} from '../../src/raft/liferaft-provider.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

const HEARTBEAT = '10s';
const ELECTION_MIN = '20s';
const ELECTION_MAX = '30s';

const LEADER_ADDRESS = 'leader-node';
const FOLLOWER_ADDRESS = 'conflict-follower';
const CONFLICT_INDEX = 2;
const LOCAL_TERM = 1;
const LEADER_CONFLICT_TERM = 9;
const SECOND_LEADER_CONFLICT_TERM = 11;
const STALE_CACHED_COMMITTED_INDEX = 1;
const SQLITE_COMMITTED_INDEX_UPSERT =
  'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)';
const SQLITE_COMMITTED_INDEX_KEY = 'committedIndex';

function command(value) {
  return {type: 'committed-prefix-conflict', value};
}

function createProviderNode(address, Log) {
  const provider = new LiferaftProvider();
  const RaftNode = provider.createNodeClass({
    resolvePeerAddress: (peerAddress) => peerAddress,
    deliverPacket: async () => null,
  });
  return new RaftNode(address, {
    'heartbeat': HEARTBEAT,
    'election min': ELECTION_MIN,
    'election max': ELECTION_MAX,
    'Log': Log,
  });
}

function createSQLiteRaft() {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: FOLLOWER_ADDRESS, term: 1});
  function SQLiteLogFactory() {
    return adapter;
  }
  const raft = createProviderNode(FOLLOWER_ADDRESS, SQLiteLogFactory);
  return {
    raft,
    db,
    close() {
      raft.end();
      db.close();
    },
  };
}

function createInMemoryRaft() {
  const raft = createProviderNode(FOLLOWER_ADDRESS, InMemoryLogAdapter);
  return {raft, close: () => raft.end()};
}

function conflictingHeartbeat(leaderTerm, packetCommittedIndex) {
  return {
    type: RAFT_PACKET_TYPE.APPEND,
    term: leaderTerm,
    state: LifeRaft.LEADER,
    address: LEADER_ADDRESS,
    leader: LEADER_ADDRESS,
    last: {
      index: CONFLICT_INDEX,
      term: leaderTerm,
      committedIndex: packetCommittedIndex,
    },
  };
}

function instrument(raft) {
  const outgoing = [];
  raft.message = (who, packet) => {
    outgoing.push({who, packet});
    return raft;
  };
  const truncationRequests = [];
  const originalRemove = raft.log.removeEntriesAfter.bind(raft.log);
  raft.log.removeEntriesAfter = (index) => {
    truncationRequests.push(index);
    return originalRemove(index);
  };
  const divergenceEvents = [];
  raft.on(RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE, (observation) => {
    divergenceEvents.push(observation);
  });
  return {outgoing, truncationRequests, divergenceEvents};
}

function typedAppendFails(outgoing) {
  return outgoing.filter(({packet}) =>
    packet.type === RAFT_PACKET_TYPE.APPEND_FAIL &&
    packet.data?.code === RAFT_COMMITTED_ENTRY_CONFLICT_CODE);
}

test('sqlite follower with a lagging committed-index cache stops the ' +
  'truncation livelock and surfaces divergence once', async (t) => {
  const fixture = createSQLiteRaft();
  const {raft, db} = fixture;
  try {
    await raft.log.saveCommand(command('committed-1'), LOCAL_TERM, 1);
    await raft.log.saveCommand(command('stale-2'), LOCAL_TERM, CONFLICT_INDEX);
    await raft.log.commit(1);
    // Base commit-index catch-up on ANOTHER facade over the same database
    // advances the DURABLE watermark past the stale entry (the CL-040
    // hazard shape): entry 2's committed flag and this adapter's cached
    // committedIndex both still lag durable truth.
    db.prepare(SQLITE_COMMITTED_INDEX_UPSERT).run(
      SQLITE_COMMITTED_INDEX_KEY,
      String(CONFLICT_INDEX),
    );
    t.equal(raft.log.committedIndex, STALE_CACHED_COMMITTED_INDEX,
      'precondition: liferaft-visible committedIndex cache lags the store');
    const staleEntry = await raft.log.get(CONFLICT_INDEX);
    t.equal(staleEntry.committed, false,
      'precondition: the stale committed-prefix entry keeps a false flag');

    const {outgoing, truncationRequests, divergenceEvents} = instrument(raft);
    const incoming = raft.listeners('data')[0];
    const heartbeatDeliveries = 3;
    for (let delivery = 0; delivery < heartbeatDeliveries; delivery += 1) {
      // Each live heartbeat arrived while the cached view lagged durable
      // truth (base catch-up keeps running on the other facade); re-stale
      // the cache the same way. Inert under the fix — the truncate helper
      // re-reads durable truth before deciding — but under the reverted
      // flag-gated code every delivery re-requests the refused truncation.
      raft.log._committedIndexCache = STALE_CACHED_COMMITTED_INDEX;
      await incoming(conflictingHeartbeat(LEADER_CONFLICT_TERM, CONFLICT_INDEX),
        () => {});
    }

    t.same(truncationRequests, [],
      'no truncation is ever requested for a committed-prefix conflict');
    t.equal(raft.log.committedTruncationBlockedCount, 0,
      'the adapter refusal witness stays silent (livelock signature gone)');
    t.equal(divergenceEvents.length, 1,
      'the poisoned committed prefix is surfaced exactly once');
    t.same(divergenceEvents[0], {
      index: CONFLICT_INDEX,
      localTerm: LOCAL_TERM,
      leaderTerm: LEADER_CONFLICT_TERM,
      committedIndex: CONFLICT_INDEX,
    }, 'the divergence observation carries the full conflict identity');
    t.same(raft._lastCommittedPrefixDivergence, divergenceEvents[0],
      'the last observation is recorded on the instance');
    t.equal(typedAppendFails(outgoing).length, heartbeatDeliveries,
      'every heartbeat is rejected to the leader with the typed ' +
      'committed-conflict append-fail (the existing repair route)');

    const survivingEntry = await raft.log.get(CONFLICT_INDEX);
    t.equal(survivingEntry.term, LOCAL_TERM,
      'the committed-prefix entry is never deleted or replaced');
    t.equal(raft.log.getLastInfo().index, CONFLICT_INDEX,
      'the log head is intact (no committed-entry loss)');

    // A DISTINCT conflict identity (new leader term) surfaces separately:
    // the dedup is per identity, not a one-shot latch.
    await incoming(
      conflictingHeartbeat(SECOND_LEADER_CONFLICT_TERM, CONFLICT_INDEX),
      () => {});
    t.equal(divergenceEvents.length, 2,
      'a new conflict identity is surfaced once more');
    t.equal(divergenceEvents[1].leaderTerm, SECOND_LEADER_CONFLICT_TERM,
      'the second observation carries the new leader term');
    t.same(truncationRequests, [],
      'still no truncation requests after the second identity');
  } finally {
    fixture.close();
  }
});

test('in-memory follower whose watermark advanced over a stale flag ' +
  'surfaces divergence once and never truncates', async (t) => {
  const fixture = createInMemoryRaft();
  const {raft} = fixture;
  try {
    await raft.log.saveCommand(command('committed-1'), LOCAL_TERM, 1);
    await raft.log.saveCommand(command('stale-2'), LOCAL_TERM, CONFLICT_INDEX);
    // Watermark advanced over the stale entry; its committed flag lags
    // (same CL-040 shape, plain-property adapter).
    raft.log.committedIndex = CONFLICT_INDEX;

    const {outgoing, truncationRequests, divergenceEvents} = instrument(raft);
    const incoming = raft.listeners('data')[0];
    await incoming(conflictingHeartbeat(LEADER_CONFLICT_TERM, CONFLICT_INDEX),
      () => {});
    await incoming(conflictingHeartbeat(LEADER_CONFLICT_TERM, CONFLICT_INDEX),
      () => {});

    t.same(truncationRequests, [], 'no truncation is requested');
    t.equal(divergenceEvents.length, 1, 'divergence is surfaced exactly once');
    t.same(divergenceEvents[0], {
      index: CONFLICT_INDEX,
      localTerm: LOCAL_TERM,
      leaderTerm: LEADER_CONFLICT_TERM,
      committedIndex: CONFLICT_INDEX,
    }, 'the observation carries the full conflict identity');
    t.equal(typedAppendFails(outgoing).length, 2,
      'each heartbeat is rejected with the typed append-fail');
    const survivingEntry = await raft.log.get(CONFLICT_INDEX);
    t.equal(survivingEntry.term, LOCAL_TERM, 'the entry survives untouched');
  } finally {
    fixture.close();
  }
});

test('an UNCOMMITTED same-index term conflict keeps its truncation ' +
  'behavior exactly (no divergence surfacing)', async (t) => {
  const fixture = createSQLiteRaft();
  const {raft} = fixture;
  try {
    await raft.log.saveCommand(command('committed-1'), LOCAL_TERM, 1);
    await raft.log.saveCommand(command('stale-2'), LOCAL_TERM, CONFLICT_INDEX);
    await raft.log.saveCommand(command('stale-3'), LOCAL_TERM, 3);
    await raft.log.commit(1);
    t.equal(raft.log.committedIndex, 1,
      'precondition: the conflict sits above the committed index');

    const {outgoing, truncationRequests, divergenceEvents} = instrument(raft);
    const incoming = raft.listeners('data')[0];
    await incoming(conflictingHeartbeat(LEADER_CONFLICT_TERM, 1), () => {});

    t.same(truncationRequests, [CONFLICT_INDEX - 1],
      'the uncommitted conflicting suffix is truncated exactly as before');
    t.equal(raft.log.committedTruncationBlockedCount, 0,
      'the truncation is legitimate: the adapter records no refusal');
    t.equal(await raft.log.get(CONFLICT_INDEX), null,
      'the conflicting uncommitted entry is removed');
    t.equal(await raft.log.get(3), null,
      'the uncommitted suffix after it is removed');
    t.ok(await raft.log.get(1), 'the committed prefix survives');
    t.same(divergenceEvents, [],
      'no divergence is surfaced for a repairable uncommitted conflict');
    t.equal(outgoing.some(({packet}) =>
      packet.type === RAFT_PACKET_TYPE.APPEND_FAIL), true,
    'the base append-fail catch-up path takes over after truncation');

    // A matching-term committed replay right after stays silent: no event,
    // no truncation (the divergence witness only fires on genuine
    // conflicts).
    await incoming({
      ...conflictingHeartbeat(LEADER_CONFLICT_TERM, 1),
      last: {index: 1, term: LOCAL_TERM, committedIndex: 1},
    }, () => {});
    t.same(divergenceEvents, [], 'a matching-term replay surfaces nothing');
    t.same(truncationRequests, [CONFLICT_INDEX - 1],
      'a matching-term replay truncates nothing further');
  } finally {
    fixture.close();
  }
});
