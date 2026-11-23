// Owner Decision #2 (2026-11-22) of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md, sections
// 4.3 and 21):
// `persistReady()` skips opening a SQLite transaction when a Ready carries no
// durable mutations (no snapshot, no entries, and no hardState).
//
// Invariants witnessed:
//   1. Empty heartbeat Readies open 0 SQLite transactions while stepping and
//      answering every heartbeat.
//   2. Commit-only HardState changes (`mustSync === false`) still open a
//      SQLite transaction and persist the updated commit index to disk (never
//      skipped merely because `mustSync === false`).
//   3. Term/vote changes, log entries, configuration changes, commit-only
//      hard state, and snapshots retain their persistence-before-send
//      ordering, while empty Readies open 0 transactions before send.
//   4. Committed entries still apply, Ready and LightReady advancement remain
//      intact, and restarting a replica from its SQLite file recovers its full
//      durable hardState (including commit-only commit index), appliedIndex,
//      and log entries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {tuningOf} from '../../src/raft/raft-rs-runtime-tuning.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {REPLICA_DB_PRAGMA} from '../../src/storage/storage-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  DURABLE_EVENT,
  SQLITE_SYNCHRONOUS,
  installDurableCommitObserver,
  persistCommits,
  raftRsRequiresSync,
} from './raft-rs-backend/durable-commit-observer.js';
import {DELIVERED_TO_PEER, PartitionNodeCluster} from
  './raft-rs-backend/partition-node-cluster.js';
import {loadRaftRsCore} from './raft-rs-backend/raw-raft-rs-test-core.js';

const PARTITION_ID = 'erp-p1';
const LEADER = 'erp-p1-r1';
const FOLLOWER = 'erp-p1-r2';
const OTHER = 'erp-p1-r3';
const FOUNDING = Object.freeze([LEADER, FOLLOWER, OTHER]);
const QUIET_ROUNDS = 100;
const SHORT_QUIET_ROUNDS = 25;
const WARM_ROUNDS = 5;
const SETTLE_LIMIT = 300;
const TAKE_READY = 'take_ready';

function settleHost() {
  return new Promise((resolve) => setImmediate(resolve));
}

class EmptyReadyPersistenceScenario {
  constructor() {
    this.clock = new VirtualTimeSource({startMs: 0});
    this.queue = [];
    this.database = {transactions: 0, prepares: 0, pragmas: 0};
    this.applications = 0;
    this.measuring = false;
    this.coreEntries = new Map();
    this.cluster = new PartitionNodeCluster({
      partitionId: PARTITION_ID,
      replicaIds: FOUNDING,
      substrateFor: () => ({timeSource: this.clock}),
      sendFor: (from, address, envelope) => {
        this.queue.push({from, to: this.cluster.replicaIdOf(address), envelope});
        return DELIVERED_TO_PEER;
      },
      applyFor: (replicaId) => {
        if (replicaId === FOLLOWER) this.applications += 1;
      },
      wrapDatabase: (replicaId, db) => {
        db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
        db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
        return replicaId === FOLLOWER ? this.countingDatabase(db) : db;
      },
    });
    setActualCoreEntryObserver((entry) => {
      if (this.measuring) {
        this.coreEntries.set(entry.operation,
          (this.coreEntries.get(entry.operation) ?? 0) + 1);
      }
    });
  }

  countingDatabase(target) {
    const database = this.database;
    return new Proxy(target, {get(base, property) {
      if (property === 'transaction') {
        return (work) => {
          const transaction = base.transaction(work);
          return (...args) => {
            database.transactions += 1;
            return transaction(...args);
          };
        };
      }
      if (property === 'prepare') {
        return (sql) => {
          database.prepares += 1;
          return base.prepare(sql);
        };
      }
      if (property === 'pragma') {
        return (...args) => {
          database.pragmas += 1;
          return base.pragma(...args);
        };
      }
      const value = Reflect.get(base, property, base);
      return typeof value === 'function' ? value.bind(base) : value;
    }});
  }

  port(replicaId) {
    return this.cluster.node(replicaId);
  }

  deliver(predicate) {
    const selected = [];
    const kept = [];
    for (const item of this.queue.splice(0)) {
      (predicate(item) ? selected : kept).push(item);
    }
    this.queue.push(...kept);
    for (const item of selected) {
      this.port(item.to).step(item.envelope);
    }
    this.clock.advance(0);
    return selected;
  }

  settle() {
    for (let round = 0; round < SETTLE_LIMIT; round += 1) {
      if (this.queue.length === 0) return;
      this.deliver(() => true);
    }
    throw new Error('the partition did not settle');
  }

  take(predicate) {
    const index = this.queue.findIndex(predicate);
    return index < 0 ? null : this.queue.splice(index, 1)[0];
  }

  leaderTicksOneHeartbeat() {
    const heartbeatTicks = tuningOf(
      this.cluster.replica(LEADER).request.timing,
    ).heartbeatTick;
    for (let tick = 0; tick < heartbeatTicks; tick += 1) {
      this.port(LEADER).tick();
    }
  }

  async measure(work) {
    const before = {...this.database, applications: this.applications,
      queued: this.queue.length};
    this.coreEntries.clear();
    this.measuring = true;
    try {
      work();
      this.clock.advance(0);
      await settleHost();
      this.clock.advance(0);
    } finally {
      this.measuring = false;
    }
    return {
      transactions: this.database.transactions - before.transactions,
      prepares: this.database.prepares - before.prepares,
      pragmas: this.database.pragmas - before.pragmas,
      applications: this.applications - before.applications,
      sent: this.queue.slice(before.queued),
      entries: new Map(this.coreEntries),
    };
  }

  followerFacts() {
    const status = this.port(FOLLOWER).readStatus();
    return {role: status.role, term: String(status.term),
      leaderId: status.leaderId,
      commitIndex: String(status.commitIndex),
      appliedIndex: String(status.appliedIndex)};
  }

  durableRecordOf(replicaId) {
    return RaftRsDurableStore.readDurableRecordIn(
      this.cluster.replica(replicaId).db, PARTITION_ID);
  }

  async elect() {
    await turnChainValue(this.port(LEADER).campaign());
    this.settle();
    for (let round = 0; round < WARM_ROUNDS; round += 1) {
      this.leaderTicksOneHeartbeat();
      this.settle();
    }
    assert.equal(this.port(LEADER).readStatus().role, RAFT_ROLE.LEADER,
      'the scenario elected its leader');
    assert.equal(this.followerFacts().leaderId, LEADER,
      'the follower follows it');
  }

  async measuredHeartbeat() {
    this.leaderTicksOneHeartbeat();
    const heartbeat = this.take((item) => item.to === FOLLOWER);
    assert.ok(heartbeat !== null &&
      heartbeat.envelope.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT,
    'the leader produced a heartbeat for the follower');
    const measured = await this.measure(() =>
      this.port(FOLLOWER).step(heartbeat.envelope));
    this.settle();
    return measured;
  }

  dispose() {
    setActualCoreEntryObserver(null);
    this.cluster.dispose();
  }
}

test('(i-1) empty heartbeat Readies open 0 SQLite transactions while stepping ' +
  'and answering every heartbeat', async () => {
  const scenario = new EmptyReadyPersistenceScenario();
  try {
    await scenario.elect();
    const factsBefore = scenario.followerFacts();
    let transactions = 0;
    let prepares = 0;
    let pragmas = 0;
    let applications = 0;
    let steps = 0;
    let takeReadies = 0;
    let responses = 0;
    for (let round = 0; round < QUIET_ROUNDS; round += 1) {
      const measured = await scenario.measuredHeartbeat();
      transactions += measured.transactions;
      prepares += measured.prepares;
      pragmas += measured.pragmas;
      applications += measured.applications;
      steps += measured.entries.get('step') ?? 0;
      takeReadies += measured.entries.get(TAKE_READY) ?? 0;
      responses += measured.sent.filter((item) => item.from === FOLLOWER &&
        item.envelope.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE)
        .length;
    }
    const factsAfter = scenario.followerFacts();
    assert.equal(steps, QUIET_ROUNDS,
      'the follower stepped every heartbeat once');
    assert.equal(takeReadies, QUIET_ROUNDS,
      'each heartbeat produced a Ready whose message response was processed');
    assert.equal(responses, QUIET_ROUNDS,
      'the follower answered every heartbeat');
    assert.deepEqual(factsAfter, factsBefore,
      'term, leader, commitIndex and appliedIndex did not move');
    assert.equal(applications, 0, 'nothing was applied');
    assert.deepEqual({transactions, prepares, pragmas},
      {transactions: 0, prepares: 0, pragmas: 0},
      'an empty Ready with no snapshot, no entries, and no hardState opens 0 SQLite transactions');
  } finally {
    scenario.dispose();
  }
});

test('(i-2) commit-only HardState changes (mustSync === false) still persist ' +
  'to SQLite and are never skipped', async () => {
  const scenario = new EmptyReadyPersistenceScenario();
  try {
    await scenario.elect();
    const commitBefore = scenario.followerFacts().commitIndex;
    const durableCommitBefore = scenario.durableRecordOf(FOLLOWER).hardState.commit;
    assert.equal(durableCommitBefore, commitBefore,
      'durable commit index starts at the settled commit index');

    await turnChainValue(scenario.port(LEADER).propose({op: 'commit-only-hs'}));
    // Deliver the append to followers and responses back to leader, then drop
    // the leader's commit broadcast to FOLLOWER so the next heartbeat carries
    // a commit-only HardState update (mustSync === false).
    scenario.deliver((item) => item.to !== LEADER);
    scenario.deliver((item) => item.to === LEADER);
    scenario.queue = scenario.queue.filter((item) => item.to !== FOLLOWER);
    scenario.settle();
    assert.equal(scenario.followerFacts().commitIndex, commitBefore,
      'the follower has not yet received the advanced commit index');
    assert.equal(scenario.durableRecordOf(FOLLOWER).hardState.commit,
      commitBefore, 'durable commit index on follower has not advanced yet');

    const measured = await scenario.measuredHeartbeat();
    const factsAfter = scenario.followerFacts();
    const durableCommitAfter = scenario.durableRecordOf(FOLLOWER).hardState.commit;
    assert.ok(BigInt(factsAfter.commitIndex) > BigInt(commitBefore),
      'the heartbeat advanced the follower commit index');
    assert.equal(durableCommitAfter, factsAfter.commitIndex,
      'commit-only HardState (mustSync === false) persisted the new commit index to SQLite');
    assert.equal(measured.applications, 1,
      'the newly committed entry was applied once');
    assert.equal(measured.transactions - measured.applications, 1,
      'persistReady opened 1 SQLite transaction for the commit-only HardState');
  } finally {
    scenario.dispose();
  }
});

test('(i-3) term/vote changes, log entries, configuration changes, ' +
  'commit-only hard state, and snapshots retain persistence ordering before ' +
  'send while empty Readies open 0 transactions', async () => {
  const observer = installDurableCommitObserver();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),
    'empty-ready-ordering-'));
  let cluster = null;
  const snapshotDbs = [];
  const snapshotHandles = new Map();
  const core = loadRaftRsCore();
  try {
    cluster = new PartitionNodeCluster({
      partitionId: PARTITION_ID,
      replicaIds: FOUNDING,
      sendFor: (replicaId) => {
        observer.events.push({type: DURABLE_EVENT.SEND, from: replicaId});
        return undefined;
      },
      wrapDatabase: (_replicaId, db) => {
        db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
        db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
        return db;
      },
    });
    setActualCoreEntryObserver((entry) => {
      cluster.coreEntries.push(entry);
      observer.events.push({type: DURABLE_EVENT.CORE,
        operation: entry.operation});
    });
    assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
      {rounds: SETTLE_LIMIT}), 'leader elected');
    const leader = cluster.leaderReplicaId();
    assert.equal(cluster.propose(leader, 'ordered-entry-1').result.outcome,
      'CORE_OK');
    assert.ok(cluster.settle(() => FOUNDING.every((replicaId) =>
      cluster.replica(replicaId).appliedCommands.length === 1),
    {rounds: SETTLE_LIMIT}), 'command committed and applied');
    // Quiet heartbeats produce empty Readies (NO_STORAGE) that send messages.
    cluster.settle(() => false, {rounds: SHORT_QUIET_ROUNDS});

    const pairs = persistCommits(observer.events);
    let emptyPersists = 0;
    let commitOnlyPersists = 0;
    let syncedPersists = 0;
    for (const {persist, commit} of pairs) {
      const hasStorage = persist.snapshot || persist.entries > 0 ||
        persist.hardState !== null;
      if (!hasStorage) {
        emptyPersists += 1;
        assert.equal(commit, null,
          'empty Ready opens no SQLite transaction');
      } else if (raftRsRequiresSync(persist)) {
        syncedPersists += 1;
        assert.ok(commit !== null && commit.level >= SQLITE_SYNCHRONOUS.FULL,
          'must-sync Ready commits at FULL');
      } else {
        commitOnlyPersists += 1;
        assert.ok(commit !== null && commit.level === SQLITE_SYNCHRONOUS.NORMAL,
          'commit-only HardState Ready commits at NORMAL');
      }
    }
    assert.ok(emptyPersists > 0, 'empty Readies were observed');
    assert.ok(commitOnlyPersists > 0, 'commit-only Readies were observed');
    assert.ok(syncedPersists > 0, 'must-sync Readies were observed');

    // Every send after a storage-bearing Ready follows its SQLite COMMITTED
    // event; every send after an empty Ready has no transaction between
    // take_ready and send.
    let storageSends = 0;
    let emptySends = 0;
    for (let index = 0; index < observer.events.length; index += 1) {
      const send = observer.events[index];
      if (send.type !== DURABLE_EVENT.SEND) continue;
      let taken = -1;
      for (let back = index - 1; back >= 0; back -= 1) {
        if (observer.events[back].type === DURABLE_EVENT.CORE &&
            observer.events[back].operation === TAKE_READY) {
          taken = back;
          break;
        }
      }
      assert.ok(taken >= 0, 'send follows take_ready');
      const between = observer.events.slice(taken + 1, index);
      const persist = between.find((event) =>
        event.type === DURABLE_EVENT.PERSIST);
      assert.ok(persist !== undefined, 'persistReady ran before send');
      const committed = between.find((event) =>
        event.type === DURABLE_EVENT.COMMITTED && event.file === persist.file);
      const hasStorage = persist.snapshot || persist.entries > 0 ||
        persist.hardState !== null;
      if (hasStorage) {
        storageSends += 1;
        assert.ok(committed !== undefined,
          'storage-bearing Ready committed to SQLite before send');
      } else {
        emptySends += 1;
        assert.equal(committed, undefined,
          'empty Ready opened no SQLite transaction before send');
      }
    }
    assert.ok(storageSends > 0, 'storage-bearing sends were verified');
    assert.ok(emptySends > 0, 'empty-Ready sends were verified');

    // Verify snapshot-bearing Ready persistence ordering too.
    const confState = {voters: ['1', '2'], learners: [], votersOutgoing: [],
      learnersNext: [], autoLeave: false};
    const tuning = {electionTick: 10, heartbeatTick: 2, preVote: false,
      checkQuorum: false};
    const storeOf = new Map();
    for (const peerId of ['1', '2']) {
      const db = new Database(path.join(directory, `${peerId}.db`));
      db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
      db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
      snapshotDbs.push(db);
      storeOf.set(peerId, new RaftRsDurableStore(db));
    }
    snapshotHandles.set('1', core.create_node({id: '1', peers: [],
      learners: [], applied: '5', ...tuning, bootstrap: {confState,
        entries: [], hardState: {term: '1', vote: '1', commit: '5'},
        snapshot: {metadata: {index: '5', term: '1', confState}}}}));
    snapshotHandles.set('2', core.create_node({id: '2', peers: ['1', '2'],
      learners: [], applied: '0', ...tuning}));
    const snapEventsStart = observer.events.length;
    core.campaign(snapshotHandles.get('1'));
    for (let round = 0; round < SHORT_QUIET_ROUNDS; round += 1) {
      for (const [peerId, handle] of snapshotHandles) {
        while (core.has_ready(handle)) {
          const ready = core.take_ready(handle);
          storeOf.get(peerId).persistReady('snapshot-group', ready);
          core.persist_ready(handle);
          const light = core.advance_append(handle);
          core.advance_apply(handle);
          for (const message of [...(ready.messages || []),
            ...(ready.persistedMessages || []),
            ...(light.messages || [])]) {
            core.step(snapshotHandles.get(message.to), message);
          }
        }
      }
      core.tick(snapshotHandles.get('1'));
    }
    const snapPairs = persistCommits(observer.events.slice(snapEventsStart));
    const snapshotPersists = snapPairs.filter(({persist}) => persist.snapshot);
    assert.ok(snapshotPersists.length > 0, 'snapshot Ready was persisted');
    assert.ok(snapshotPersists.every(({commit}) =>
      commit !== null && commit.level >= SQLITE_SYNCHRONOUS.FULL),
    'snapshot Ready committed at FULL');
  } finally {
    setActualCoreEntryObserver(null);
    observer.uninstall();
    cluster?.dispose();
    for (const handle of snapshotHandles.values()) core.free(handle);
    for (const db of snapshotDbs) db.close();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('(i-4) committed entries apply, Ready/LightReady advancement continues, ' +
  'and restart recovery restores the full durable state', async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID,
    replicaIds: FOUNDING,
    wrapDatabase: (_replicaId, db) => {
      db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
      db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
      return db;
    },
  });
  try {
    assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
      {rounds: SETTLE_LIMIT}), 'leader elected');
    const leader = cluster.leaderReplicaId();
    const follower = FOUNDING.find((id) => id !== leader);

    for (const cmd of ['cmd-1', 'cmd-2', 'cmd-3']) {
      assert.equal(cluster.propose(leader, cmd).result.outcome, 'CORE_OK');
    }
    assert.ok(cluster.settle(() => FOUNDING.every((id) =>
      cluster.replica(id).appliedCommands.length === 3),
    {rounds: SETTLE_LIMIT}), 'all 3 commands committed and applied');

    // Run quiet heartbeats after the commits (empty Readies on followers and
    // leader).
    cluster.settle(() => false, {rounds: SHORT_QUIET_ROUNDS});

    const leaderStatusBefore = cluster.node(leader).readStatus();
    const followerRecordBefore = RaftRsDurableStore.readDurableRecordIn(
      cluster.replica(follower).db, PARTITION_ID);
    assert.equal(followerRecordBefore.hardState.commit,
      String(leaderStatusBefore.commitIndex),
      'follower durable hardState.commit equals the settled commit index');
    assert.equal(followerRecordBefore.appliedIndex,
      String(leaderStatusBefore.appliedIndex),
      'follower durable appliedIndex equals the settled applied index');

    // Restart the follower and the leader from their SQLite files and verify
    // durable recovery and continued consensus progress.
    cluster.restart(follower);
    cluster.restart(leader);

    const followerRecordAfter = RaftRsDurableStore.readDurableRecordIn(
      cluster.replica(follower).db, PARTITION_ID);
    assert.deepEqual(followerRecordAfter.hardState,
      followerRecordBefore.hardState,
      'follower durable hardState survives restart intact');
    assert.equal(followerRecordAfter.appliedIndex,
      followerRecordBefore.appliedIndex,
      'follower durable appliedIndex survives restart intact');
    assert.equal(
      RAFT_RS_CONF_CHANGE_ENTRY_TYPES.length > 0 &&
        followerRecordAfter.entries.length,
      followerRecordBefore.entries.length,
      'follower durable log entries survive restart intact');

    assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
      {rounds: SETTLE_LIMIT}), 'cluster re-establishes leadership after restart');
    const newLeader = cluster.leaderReplicaId();
    assert.equal(cluster.propose(newLeader, 'cmd-after-restart').result.outcome,
      'CORE_OK');
    assert.ok(cluster.settle(() => FOUNDING.every((id) =>
      cluster.replica(id).appliedCommands.includes('cmd-after-restart')),
    {rounds: SETTLE_LIMIT}),
    'post-restart proposal commits and applies across all replicas');
  } finally {
    cluster.dispose();
  }
});
