// Receipts:
//   raft-persist-commits-with-full-sync-before-any-message-of-its-ready
//   commit-index-only-persist-pays-no-sync
//   the-store-honours-raft-rs-must-sync-on-every-ready-shape
//
// Owner decision 2026-10-05 ("option 2", closes design O4): the Raft persist
// transaction commits with full synchronous durability whenever raft-rs says
// the Ready must be synced, so what Raft promised a peer survives power loss
// and an OS crash, not only a process crash. Application writes keep the
// connection's own setting.
//
// Everything is measured on the real connection: the observer reads
// `PRAGMA synchronous` on the replica's own SQLite connection inside each
// transaction immediately before COMMIT, and the expected answer comes from
// raft-rs's own rule (raw_node.rs `RawNode::ready`) applied to the Ready and
// the record's prior hard state - never from the store's flag.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  RAFT_RS_STORE_ERROR_CODE,
} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
} from '../../../src/raft/raft-rs-ready-loop-constants.js';
import {RaftRsReplicaLifecycleOwner} from
  '../../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {setActualCoreEntryObserver} from
  '../../../src/raft/raft-rs-runtime-owner.js';
import {REPLICA_DB_PRAGMA} from '../../../src/storage/storage-constants.js';
import {
  DURABLE_EVENT,
  SQLITE_SYNCHRONOUS,
  installDurableCommitObserver,
  persistCommits,
  raftRsRequiresSync,
} from './durable-commit-observer.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {loadRaftRsCore} from './raw-raft-rs-test-core.js';

const PARTITION_ID = 'durable-commit-sync';
const FOUNDING = Object.freeze(['replica-a', 'replica-b', 'replica-c']);
const LEARNER = 'replica-d';
const SETTLE_ROUNDS = 400;
const QUIET_ROUNDS = 40;
const COMMANDS = 5;
// eraftpb ConfChangeType::AddLearnerNode; ConfChangeTransition::Auto.
const ADD_LEARNER_CHANGE_TYPE = 2;
const AUTO_TRANSITION = 0;
const TAKE_READY = 'take_ready';
const READY_SHAPE = Object.freeze({
  TERM_OR_VOTE: 'term-or-vote-change',
  ENTRIES: 'entries-appended',
  CONF_CHANGE: 'conf-change-entry-appended',
  COMMIT_ONLY: 'commit-index-only',
  NO_STORAGE: 'messages-or-soft-state-only',
  SNAPSHOT: 'snapshot',
});

function readyShape(persist) {
  const prior = persist.priorHardState ?? {term: '0', vote: '0'};
  if (persist.snapshot) {
    return READY_SHAPE.SNAPSHOT;
  }
  if (persist.hardState !== null && (persist.hardState.term !== prior.term ||
    persist.hardState.vote !== prior.vote)) {
    return READY_SHAPE.TERM_OR_VOTE;
  }
  if (persist.entryTypes.some((type) =>
    RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(type))) {
    return READY_SHAPE.CONF_CHANGE;
  }
  if (persist.entries > 0) {
    return READY_SHAPE.ENTRIES;
  }
  return persist.hardState === null ? READY_SHAPE.NO_STORAGE :
    READY_SHAPE.COMMIT_ONLY;
}

function levelOf(db) {
  return db.pragma('synchronous', {simple: true});
}

// Every persist: the level SQLite committed it under is FULL exactly when
// raft-rs's own rule requires the Ready synced, the core's exposed flag says
// the same, and the connection is back at its own setting afterwards.
function assertPersistDurability(events, label) {
  const pairs = persistCommits(events);
  assert.ok(pairs.length > 0, `${label}: persists were observed`);
  const shapes = new Map();
  for (const {persist, commit, end} of pairs) {
    const required = raftRsRequiresSync(persist);
    const shape = readyShape(persist);
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    assert.ok(commit !== null, `${label}: persist of ${shape} committed`);
    assert.equal(persist.mustSync, required,
      `${label}: the core's must_sync matches raft-rs's rule for ${shape}`);
    assert.equal(commit.level >= SQLITE_SYNCHRONOUS.FULL, required,
      `${label}: a ${shape} Ready commits at level ${commit.level}; ` +
      `raft-rs requires a sync: ${required}`);
    assert.equal(end.levelAfter, SQLITE_SYNCHRONOUS.NORMAL,
      `${label}: the connection is back at NORMAL after a ${shape} persist`);
  }
  return shapes;
}

// Every message the replica hands its transport leaves after the Ready it
// came from was committed - durably when raft-rs required it. The sends of a
// Ready run in the same synchronous drain as its take_ready, so the last
// take_ready before a send is that send's Ready.
function assertSendsFollowDurableCommit(events, fileOf) {
  let checked = 0;
  for (let index = 0; index < events.length; index += 1) {
    const send = events[index];
    if (send.type !== DURABLE_EVENT.SEND) {
      continue;
    }
    let taken = -1;
    for (let back = index - 1; back >= 0; back -= 1) {
      if (events[back].type === DURABLE_EVENT.CORE &&
        events[back].operation === TAKE_READY) {
        taken = back;
        break;
      }
    }
    assert.ok(taken >= 0, 'every send follows a taken Ready');
    const between = events.slice(taken + 1, index);
    const persist = between.find((event) =>
      event.type === DURABLE_EVENT.PERSIST);
    assert.ok(persist !== undefined,
      `send #${index} from ${send.from}: its Ready was persisted first`);
    assert.equal(persist.file, fileOf(send.from),
      `send #${index}: the sender's own record persisted its Ready`);
    const committed = between.find((event) =>
      event.type === DURABLE_EVENT.COMMITTED && event.file === persist.file);
    assert.ok(committed !== undefined,
      `send #${index} from ${send.from}: the persist COMMITTED before it`);
    if (raftRsRequiresSync(persist)) {
      assert.ok(committed.level >= SQLITE_SYNCHRONOUS.FULL,
        `send #${index} from ${send.from}: a must-sync Ready was committed ` +
        `at level ${committed.level} before its messages left`);
    }
    checked += 1;
  }
  return checked;
}

function observedCluster(observer) {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID,
    replicaIds: FOUNDING,
    sendFor: (replicaId) => {
      observer.events.push({type: DURABLE_EVENT.SEND, from: replicaId});
      return undefined;
    },
    wrapDatabase: (replicaId, db) => {
      // The replica database as every production kind opens it.
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
  return cluster;
}

test('a three-replica partition commits every must-sync Ready at FULL ' +
  'before any of its messages leave, and nothing else pays a sync',
async () => {
  const observer = installDurableCommitObserver();
  const cluster = observedCluster(observer);
  try {
    assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
      {rounds: SETTLE_ROUNDS}), 'the partition elects a leader');
    const leader = cluster.leaderReplicaId();
    for (let index = 0; index < COMMANDS; index += 1) {
      assert.equal(cluster.propose(leader, `command-${index}`).outcome,
        'CORE_OK');
    }
    assert.ok(cluster.settle(() => FOUNDING.every((replicaId) =>
      cluster.replica(replicaId).appliedCommands.length === COMMANDS),
    {rounds: SETTLE_ROUNDS}), 'every replica applies every command');
    // Heartbeats only: a follower's Ready carries at most a commit index.
    cluster.settle(() => false, {rounds: QUIET_ROUNDS});

    // A configuration change: its entry is appended like any other.
    cluster.addReplica(LEARNER, FOUNDING);
    cluster.proposeConfigurationChange([{
      changeType: ADD_LEARNER_CHANGE_TYPE,
      nodeId: cluster.raftPeerIdOf(LEARNER),
    }], AUTO_TRANSITION, leader);
    assert.ok(cluster.settle(() => cluster.coreConfState(leader).learners
      .includes(cluster.raftPeerIdOf(LEARNER)), {rounds: SETTLE_ROUNDS}),
    'the learner is added');

    // A second election: the old leader is cut off and another times out.
    cluster.isolate(leader);
    cluster.tickers = FOUNDING.filter((replicaId) => replicaId !== leader);
    assert.ok(cluster.settle(() => {
      const others = cluster.tickers;
      const leads = new Set(others.map((replicaId) =>
        cluster.coreStatus(replicaId).lead));
      return leads.size === 1 && !leads.has('0') &&
        !leads.has(cluster.raftPeerIdOf(leader));
    }, {rounds: SETTLE_ROUNDS}), 'the remaining voters elect a new leader');

    const shapes = assertPersistDurability(observer.events, 'partition');
    for (const shape of [READY_SHAPE.TERM_OR_VOTE, READY_SHAPE.ENTRIES,
      READY_SHAPE.CONF_CHANGE, READY_SHAPE.COMMIT_ONLY,
      READY_SHAPE.NO_STORAGE]) {
      assert.ok((shapes.get(shape) ?? 0) > 0,
        `the scenario produced a ${shape} Ready: ${JSON.stringify(
          Object.fromEntries(shapes))}`);
    }
    const sends = assertSendsFollowDurableCommit(observer.events,
      (replicaId) => cluster.dbFileOf(replicaId));
    assert.ok(sends > 0, 'messages were sent');

    // Writes outside the persist transaction keep the connection's setting:
    // every other transaction (application, applied state, bootstrap)
    // committed at NORMAL, and every connection rests at NORMAL.
    const otherCommits = observer.events.filter((event) =>
      event.type === DURABLE_EVENT.COMMIT && !event.persist);
    assert.ok(otherCommits.length > 0, 'application transactions ran');
    assert.deepEqual([...new Set(otherCommits.map((event) => event.level))],
      [SQLITE_SYNCHRONOUS.NORMAL],
      'application transactions commit at the connection\'s own NORMAL');
    for (const replicaId of [...FOUNDING, LEARNER]) {
      assert.equal(levelOf(cluster.replica(replicaId).db),
        SQLITE_SYNCHRONOUS.NORMAL, `${replicaId} rests at NORMAL`);
    }
  } finally {
    setActualCoreEntryObserver(null);
    observer.uninstall();
    cluster.dispose();
  }
});

// A snapshot Ready from the real core: a leader restored from a snapshot at
// index 5 whose follower holds nothing must send it one, and the follower's
// Ready carries it.
test('a snapshot-bearing Ready from the real core commits at FULL',
  async () => {
    const core = loadRaftRsCore();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),
      'durable-commit-snapshot-'));
    const tuning = {electionTick: 10, heartbeatTick: 2, preVote: false,
      checkQuorum: false};
    const confState = {voters: ['1', '2'], learners: [], votersOutgoing: [],
      learnersNext: [], autoLeave: false};
    const observer = installDurableCommitObserver();
    const dbs = [];
    const handles = new Map();
    try {
      const storeOf = new Map();
      for (const peerId of ['1', '2']) {
        const db = new Database(path.join(directory, `${peerId}.db`));
        db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
        db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
        dbs.push(db);
        storeOf.set(peerId, new RaftRsDurableStore(db));
      }
      handles.set('1', core.create_node({id: '1', peers: [], learners: [],
        applied: '5', ...tuning, bootstrap: {confState, entries: [],
          hardState: {term: '1', vote: '1', commit: '5'},
          snapshot: {metadata: {index: '5', term: '1', confState}}}}));
      handles.set('2', core.create_node({id: '2', peers: ['1', '2'],
        learners: [], applied: '0', ...tuning}));
      core.campaign(handles.get('1'));
      for (let round = 0; round < QUIET_ROUNDS; round += 1) {
        for (const [peerId, handle] of handles) {
          while (core.has_ready(handle)) {
            const ready = core.take_ready(handle);
            storeOf.get(peerId).persistReady('snapshot-group', ready);
            core.persist_ready(handle);
            const light = core.advance_append(handle);
            core.advance_apply(handle);
            for (const message of [...(ready.messages || []),
              ...(ready.persistedMessages || []),
              ...(light.messages || [])]) {
              core.step(handles.get(message.to), message);
            }
          }
        }
        core.tick(handles.get('1'));
      }
      const shapes = assertPersistDurability(observer.events, 'snapshot');
      assert.ok((shapes.get(READY_SHAPE.SNAPSHOT) ?? 0) > 0,
        'the follower persisted a snapshot-bearing Ready');
    } finally {
      observer.uninstall();
      for (const handle of handles.values()) {
        core.free(handle);
      }
      for (const db of dbs) {
        db.close();
      }
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });

function scratchStore(directory, name, {synchronous} = {}) {
  const db = new Database(path.join(directory, `${name}.db`));
  db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  db.pragma(synchronous ?? REPLICA_DB_PRAGMA.SYNCHRONOUS);
  return {db, store: new RaftRsDurableStore(db)};
}

const ENTRY = Object.freeze({index: '1', term: '1', entryType: 0});
const VOTE = Object.freeze({term: '1', vote: '1', commit: '0'});

test('the persist transaction: fail closed without the flag, restored on ' +
  'throw, never downgrading, refused nested', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),
    'durable-commit-unit-'));
  const observer = installDurableCommitObserver();
  try {
    const {db, store} = scratchStore(directory, 'unit');
    // A Ready the core did not flag either way is synced (sync when in
    // doubt).
    store.persistReady('g', {hardState: VOTE, entries: [ENTRY]});
    // A Ready the core says needs no sync does not pay one.
    store.persistReady('g', {mustSync: false,
      hardState: {...VOTE, commit: '1'}, entries: []});
    const [unflagged, commitOnly] = persistCommits(observer.events);
    assert.equal(unflagged.commit.level, SQLITE_SYNCHRONOUS.FULL,
      'a Ready without must_sync is committed at FULL');
    assert.equal(commitOnly.commit.level, SQLITE_SYNCHRONOUS.NORMAL,
      'a commit-index-only Ready is committed at NORMAL');

    // A failing persist rolls back and still restores the level.
    assert.throws(() => store.persistReady('g', {mustSync: true,
      hardState: {term: '2', vote: '1', commit: '1'},
      entries: [{index: 'not-an-index', term: '2', entryType: 0}]}));
    assert.equal(levelOf(db), SQLITE_SYNCHRONOUS.NORMAL,
      'the level is restored after a persist that threw');
    assert.equal(store.readDurableRecord('g').hardState.term, '1',
      'the failed persist wrote nothing');

    // Nested inside a transaction the store opened, the level cannot be
    // raised (SQLite refuses a safety-level change inside a transaction): the
    // persist is refused, typed, rather than committed without the sync.
    assert.throws(() => store.transaction(() => store.persistReady('g', {
      mustSync: true, hardState: {term: '3', vote: '1', commit: '1'},
      entries: []})),
    {code: RAFT_RS_STORE_ERROR_CODE.DURABLE_COMMIT_INSIDE_TRANSACTION});
    assert.equal(levelOf(db), SQLITE_SYNCHRONOUS.NORMAL);

    // A connection already at FULL is never lowered by a persist.
    const full = scratchStore(directory, 'full',
      {synchronous: 'synchronous = FULL'});
    full.store.persistReady('g', {mustSync: false,
      hardState: VOTE, entries: []});
    full.store.persistReady('g', {mustSync: true,
      hardState: {term: '2', vote: '1', commit: '0'}, entries: []});
    assert.equal(levelOf(full.db), SQLITE_SYNCHRONOUS.FULL,
      'a FULL connection stays FULL');
    db.close();
    full.db.close();
  } finally {
    observer.uninstall();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

// The lifecycle row is what the open-time refusal reads: a replica held for
// reseed, or retired, must not come back active after a power loss. Its
// write is its own transaction, synced like a must-sync Ready.
test('the reseed hold and the retirement row commit at FULL', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),
    'durable-commit-lifecycle-'));
  const observer = installDurableCommitObserver();
  try {
    const {db} = scratchStore(directory, 'lifecycle');
    const held = new RaftRsReplicaLifecycleOwner({db, groupId: 'held',
      peerId: '1', replicaIdentity: 'replica-held'});
    const retired = new RaftRsReplicaLifecycleOwner({db, groupId: 'retired',
      peerId: '1', replicaIdentity: 'replica-retired'});
    const before = observer.events.length;
    assert.equal(held.holdForReseed().outcome, 'CORE_OK');
    assert.equal((await retired.retire('removed')).outcome, 'CORE_OK');
    const commits = observer.events.slice(before).filter((event) =>
      event.type === DURABLE_EVENT.COMMITTED && event.file === db.name);
    assert.deepEqual(commits.map((event) => event.level),
      [SQLITE_SYNCHRONOUS.FULL, SQLITE_SYNCHRONOUS.FULL],
      'the hold and the retirement each committed at FULL');
    assert.equal(levelOf(db), SQLITE_SYNCHRONOUS.NORMAL,
      'the connection is back at NORMAL');
    db.close();
  } finally {
    observer.uninstall();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
