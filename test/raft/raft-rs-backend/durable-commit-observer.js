// A test-side observer of commit durability at the SQLite driver boundary.
//
// It wraps better-sqlite3's own `Database.prototype.transaction` and the
// store's `persistReady`, and records, on one ordered event list:
//   - every outermost transaction's COMMIT, with the connection's REAL
//     `PRAGMA synchronous` level read on that connection inside the
//     transaction, after its work and immediately before COMMIT (the level
//     SQLite commits under);
//   - every persistReady call, with the Ready's storage-bearing shape and the
//     hard state the record held before it, and the level after it returned.
// A caller adds its own events (sends, core entries) to the same list, so
// "the durable commit precedes the send" is an ordering on one list.
//
// Nothing here decides durability: it reads what the production code left on
// the real connection. SQLite's level numbers are its own (0 OFF, 1 NORMAL,
// 2 FULL, 3 EXTRA); a commit at 2 or above fsyncs the WAL in WAL mode.

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';

const SQLITE_SYNCHRONOUS = Object.freeze({NORMAL: 1, FULL: 2});
const READ_LEVEL = 'synchronous';
const DURABLE_EVENT = Object.freeze({
  COMMIT: 'commit',
  COMMITTED: 'committed',
  PERSIST: 'persist',
  PERSIST_END: 'persist-end',
  SEND: 'send',
  CORE: 'core',
});

const originalTransaction = Database.prototype.transaction;
const originalPragma = Database.prototype.pragma;
const originalPersistReady = RaftRsDurableStore.prototype.persistReady;

function levelOf(db) {
  return originalPragma.call(db, READ_LEVEL, {simple: true});
}

/**
 * Install the observer. Only one may be installed at a time.
 * @param {Object} [options] - Hooks.
 * @param {Function} [options.onDurableCommit] - Called with (db) after an
 *   outermost transaction committed at FULL or above.
 * @return {Object} {events, uninstall}.
 */
function installDurableCommitObserver({onDurableCommit = null} = {}) {
  if (Database.prototype.transaction !== originalTransaction) {
    throw new Error('a durable-commit observer is already installed');
  }
  const events = [];
  const depth = new WeakMap();
  const persisting = new WeakSet();
  Database.prototype.transaction = function observedTransaction(work) {
    const db = this;
    const observedWork = function observedWork(...args) {
      const result = work.apply(this, args);
      if (depth.get(db) === 1) {
        events.push({type: DURABLE_EVENT.COMMIT, file: db.name,
          level: levelOf(db), persist: persisting.has(db)});
      }
      return result;
    };
    const run = originalTransaction.call(db, observedWork);
    const wrapped = function observedRun(...args) {
      depth.set(db, (depth.get(db) ?? 0) + 1);
      let committedLevel = null;
      try {
        const result = run.apply(this, args);
        if (depth.get(db) === 1) {
          committedLevel = events.findLast((event) =>
            event.type === DURABLE_EVENT.COMMIT && event.file === db.name)
            ?.level ?? null;
          events.push({type: DURABLE_EVENT.COMMITTED, file: db.name,
            level: committedLevel});
        }
        return result;
      } finally {
        depth.set(db, depth.get(db) - 1);
        if (committedLevel !== null &&
          committedLevel >= SQLITE_SYNCHRONOUS.FULL && onDurableCommit) {
          onDurableCommit(db);
        }
      }
    };
    for (const variant of ['deferred', 'immediate', 'exclusive']) {
      wrapped[variant] = run[variant];
    }
    return wrapped;
  };
  RaftRsDurableStore.prototype.persistReady = function observedPersist(
    groupId, ready) {
    const prior = this.readDurableRecord(groupId).hardState;
    events.push({
      type: DURABLE_EVENT.PERSIST,
      file: this.db.name,
      groupId,
      mustSync: ready.mustSync,
      hardState: ready.hardState ?? null,
      priorHardState: prior,
      entries: (ready.entries || []).length,
      entryTypes: (ready.entries || []).map((entry) => entry.entryType),
      snapshot: Boolean(ready.snapshot),
    });
    persisting.add(this.db);
    let threw = false;
    try {
      return originalPersistReady.call(this, groupId, ready);
    } catch (error) {
      threw = true;
      throw error;
    } finally {
      persisting.delete(this.db);
      events.push({type: DURABLE_EVENT.PERSIST_END, file: this.db.name,
        levelAfter: this.db.open ? levelOf(this.db) : null, threw});
    }
  };
  return {
    events,
    uninstall() {
      Database.prototype.transaction = originalTransaction;
      RaftRsDurableStore.prototype.persistReady = originalPersistReady;
    },
  };
}

/**
 * Pair each persist event with the COMMIT that persisted it.
 * @param {Array<Object>} events - The observer's list.
 * @return {Array<Object>} {persist, commit, end, position} per persistReady.
 */
function persistCommits(events) {
  const pairs = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type !== DURABLE_EVENT.PERSIST) {
      continue;
    }
    let commit = null;
    let end = null;
    for (let next = index + 1; next < events.length; next += 1) {
      const candidate = events[next];
      if (candidate.file !== event.file) {
        continue;
      }
      if (candidate.type === DURABLE_EVENT.COMMIT && candidate.persist &&
        commit === null) {
        commit = candidate;
      }
      if (candidate.type === DURABLE_EVENT.PERSIST_END) {
        end = candidate;
        break;
      }
    }
    pairs.push({persist: event, commit, end, position: index});
  }
  return pairs;
}

/**
 * raft-rs's own rule (raft 0.7.0 raw_node.rs `RawNode::ready`, the three
 * places that set `rd.must_sync = true`): a hard state whose term or vote
 * differs from the one before, any appended entry, or a snapshot. A hard
 * state whose only change is its commit index needs no sync. The "before" is
 * the record's own durable hard state, which raft-rs's `prev_hs` equals
 * once the previous Ready persisted.
 * @param {Object} persist - A persist event.
 * @return {boolean} Whether raft-rs requires this Ready synced.
 */
function raftRsRequiresSync(persist) {
  const prior = persist.priorHardState ?? {term: '0', vote: '0'};
  const hardState = persist.hardState;
  const termOrVoteChanged = hardState !== null &&
    (hardState.term !== prior.term || hardState.vote !== prior.vote);
  return termOrVoteChanged || persist.entries > 0 || persist.snapshot;
}

export {
  DURABLE_EVENT,
  SQLITE_SYNCHRONOUS,
  installDurableCommitObserver,
  persistCommits,
  raftRsRequiresSync,
};
