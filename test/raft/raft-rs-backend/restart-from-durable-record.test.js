// Receipts:
//   restart-reconstructs-raft-state-from-its-own-durable-record-on-real-storage
//   no-recovery-state-is-inferred-from-a-service-or-system-table-cache
//
// Every expectation here comes from the core's own pre-crash reads or from the
// durable bytes on disk. Nothing is replayed through the restore path to
// produce the value the restore path is then checked against, and no value is
// declared by this file.
//
// The second receipt is measured two ways. Structurally: the restore path's
// parameters and its whole import closure are parsed out of `src`, and neither
// can reach a cache, a service or a system table. Behaviourally: the caches a
// replica really has in the same database are poisoned between the crash and
// the restart, and the restored core reports exactly what it reported before.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';
import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

import {SQLiteLogAdapter} from '../../../src/raft/sqlite-log-adapter.js';
import {
  DeterministicRaftRsCluster,
} from './deterministic-raft-rs-cluster.js';

const GROUP_ID = 'partition-under-test';
const VOTERS = Object.freeze(['1', '2', '3']);
const VICTIM = '3';
const SETTLE_ROUNDS = 200;
const QUIET_ROUNDS = 80;
const ADD_LEARNER_CHANGE_TYPE = 2;
const LEARNER_ID = '4';
const CONF_CHANGE_AUTO_TRANSITION = 0;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RESTORE_MODULE = 'src/raft/raft-rs-runtime-owner.js';
const STORE_MODULE = 'src/raft/raft-rs-durable-store.js';
const RESTORE_FUNCTION = 'createNodeArguments';
const FORBIDDEN_SOURCE = /cache|service|system[-_]?table|registry|metadata/iu;
const TEXT_ENCODING = 'utf8';
const RELATIVE_PREFIX = '.';
// Rows a poisoner writes into the caches a replica really keeps beside its
// Raft record. None of them may reach the restored core.
const POISON = Object.freeze({
  TERM: '99',
  VOTED_FOR: 'someone-else',
  SERVICE_PEERS: JSON.stringify(['7', '8', '9']),
});

function parseModule(source) {
  return parse(source, {ecmaVersion: 'latest', sourceType: 'module',
    loc: true});
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const key of KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((child) => walk(child, visit));
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

// Every module reachable from a starting module by static import, inside src.
function importClosure(startRelative) {
  const seen = new Set();
  const queue = [startRelative];
  while (queue.length > 0) {
    const relative = queue.shift();
    if (seen.has(relative)) {
      continue;
    }
    seen.add(relative);
    const absolute = path.join(REPOSITORY_ROOT, relative);
    const tree = parseModule(fs.readFileSync(absolute, TEXT_ENCODING));
    for (const statement of tree.body) {
      const specifier = statement.source?.value;
      if (typeof specifier !== 'string' ||
        !specifier.startsWith(RELATIVE_PREFIX)) {
        continue;
      }
      queue.push(path.relative(REPOSITORY_ROOT,
        path.resolve(path.dirname(absolute), specifier)));
    }
  }
  return seen;
}

// The names the restore function destructures out of its one argument.
function restoreParameterNames() {
  const tree = parseModule(fs.readFileSync(
    path.join(REPOSITORY_ROOT, RESTORE_MODULE), TEXT_ENCODING));
  const names = [];
  walk(tree, (node) => {
    const isRestore = node.type === 'FunctionDeclaration' &&
      node.id?.name === RESTORE_FUNCTION;
    if (!isRestore) {
      return;
    }
    for (const parameter of node.params) {
      const pattern = parameter.type === 'AssignmentPattern' ?
        parameter.left : parameter;
      if (pattern.type === 'Identifier') {
        names.push(pattern.name);
        continue;
      }
      assert.equal(pattern.type, 'ObjectPattern');
      for (const property of pattern.properties) {
        names.push(property.key?.name ?? property.argument?.name);
      }
    }
  });
  return names;
}

// The caches a replica really keeps beside its Raft record, poisoned.
function poisonEveryCacheInTheDatabase(dbFile) {
  const db = new Database(dbFile);
  const adapter = new SQLiteLogAdapter(db);
  db.prepare(
    'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)')
    .run('currentTerm', POISON.TERM);
  db.prepare(
    'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)')
    .run('votedFor', POISON.VOTED_FOR);
  db.prepare(
    'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) ' +
    'VALUES (?, ?, ?, ?)')
    .run(1, Number(POISON.TERM), JSON.stringify({poisoned: true}), 0);
  db.exec(
    'CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, peers TEXT, ' +
    'status TEXT)');
  db.prepare('INSERT OR REPLACE INTO services VALUES (?, ?, ?)')
    .run(GROUP_ID, POISON.SERVICE_PEERS, 'SYNCING');
  adapter.close();
  db.close();
}

function clusterWithHistory() {
  const cluster = new DeterministicRaftRsCluster({
    voters: VOTERS, groupId: GROUP_ID,
  });
  cluster.settle((current) => current.leaderId() !== null,
    {rounds: SETTLE_ROUNDS});
  assert.ok(cluster.leaderId() !== null);
  const leader = cluster.peer(cluster.leaderId());
  cluster.core.propose(leader.handle, new TextEncoder().encode('committed'));
  cluster.settle(() => false, {rounds: 12, ticking: false});
  cluster.core.propose_conf_change_v2(leader.handle, {
    transition: CONF_CHANGE_AUTO_TRANSITION,
    changes: [{changeType: ADD_LEARNER_CHANGE_TYPE, nodeId: LEARNER_ID}],
  });
  cluster.settle((current) => current.confState(VICTIM).learners.length === 1,
    {rounds: QUIET_ROUNDS, ticking: false});
  return cluster;
}

test('a restart reconstructs what the core itself held before the crash',
  async () => {
    const cluster = clusterWithHistory();
    try {
      // The oracle: what the LIVE core said, read before anything was lost.
      const statusBefore = cluster.status(VICTIM);
      const confStateBefore = cluster.confState(VICTIM);
      const exportedBefore =
        cluster.core.export_persisted_state(cluster.peer(VICTIM).handle);
      assert.notEqual(statusBefore.applied, '0');
      assert.deepEqual(confStateBefore.learners, [LEARNER_ID]);

      const dbFile = cluster.peer(VICTIM).dbFile;
      cluster.crash(VICTIM);
      assert.ok(fs.statSync(dbFile).size > 0,
        'the durable record is a real file that outlived the process');

      cluster.restart(VICTIM);
      const statusAfter = cluster.status(VICTIM);
      for (const field of ['term', 'vote', 'commit', 'applied']) {
        assert.equal(statusAfter[field], statusBefore[field],
          `${field} must come back as the core itself had it`);
      }
      assert.deepEqual(cluster.confState(VICTIM), confStateBefore);
      const exportedAfter =
        cluster.core.export_persisted_state(cluster.peer(VICTIM).handle);
      assert.deepEqual(exportedAfter.entries, exportedBefore.entries,
        'the log the core holds after the restart is the log it held before');
      assert.deepEqual(exportedAfter.hardState, exportedBefore.hardState);
      assert.deepEqual(exportedAfter.confState, exportedBefore.confState);
    } finally {
      cluster.dispose();
    }
  });

test('what a restart reconstructs is exactly what the durable bytes hold',
  async () => {
    const cluster = clusterWithHistory();
    try {
      const dbFile = cluster.peer(VICTIM).dbFile;
      cluster.crash(VICTIM);
      // Read the bytes with a connection of this test's own, so the record is
      // what SQLite holds rather than what any live object remembered.
      const independent = new Database(dbFile, {readonly: true});
      const entries = independent.prepare(
        'SELECT log_index, term, entry_type FROM _raft_rs_log ' +
        'WHERE group_id = ? ORDER BY log_index ASC').all(GROUP_ID);
      const hardState = independent.prepare(
        'SELECT term, vote, commit_index FROM _raft_rs_hard_state ' +
        'WHERE group_id = ?').get(GROUP_ID);
      const applied = independent.prepare(
        'SELECT applied_index, voters, learners FROM _raft_rs_applied_state ' +
        'WHERE group_id = ?').get(GROUP_ID);
      independent.close();
      assert.ok(entries.length > 0);

      cluster.restart(VICTIM);
      const statusAfter = cluster.status(VICTIM);
      assert.equal(statusAfter.term, String(hardState.term));
      assert.equal(statusAfter.vote, String(hardState.vote));
      assert.equal(statusAfter.commit, String(hardState.commit_index));
      assert.equal(statusAfter.applied, String(applied.applied_index));
      assert.deepEqual(cluster.confState(VICTIM).voters,
        JSON.parse(applied.voters));
      assert.deepEqual(cluster.confState(VICTIM).learners,
        JSON.parse(applied.learners));
      const exported =
        cluster.core.export_persisted_state(cluster.peer(VICTIM).handle);
      assert.deepEqual(
        exported.entries.map((entry) => [entry.index, entry.term]),
        entries.map((row) => [String(row.log_index), String(row.term)]));
    } finally {
      cluster.dispose();
    }
  });

test('the restore path cannot reach a cache, a service or a system table',
  async () => {
    const names = restoreParameterNames();
    assert.ok(names.length > 0, 'the restore path must have been found');
    for (const name of names) {
      assert.ok(!FORBIDDEN_SOURCE.test(name),
        `the restore path takes ${name}, which could carry recovery state ` +
        'that is not the replica\'s own durable record');
    }
    const closure = new Set([
      ...importClosure(RESTORE_MODULE),
      ...importClosure(STORE_MODULE),
    ]);
    assert.ok(closure.size >= 2);
    for (const module of closure) {
      assert.ok(!FORBIDDEN_SOURCE.test(path.basename(module)),
        `${module} is reachable from the restore path; a restart must not ` +
        'be able to read anything but its own durable Raft record');
    }
    // The check can fail: the same rule over a module that does hold a cache.
    assert.ok([...importClosure(
      'src/partition/partition-raft-storage.js')]
      .some((module) => FORBIDDEN_SOURCE.test(path.basename(module))));
  });

test('poisoning every cache in the same database changes nothing',
  async () => {
    const cluster = clusterWithHistory();
    try {
      const statusBefore = cluster.status(VICTIM);
      const confStateBefore = cluster.confState(VICTIM);
      const dbFile = cluster.peer(VICTIM).dbFile;
      cluster.crash(VICTIM);
      poisonEveryCacheInTheDatabase(dbFile);

      cluster.restart(VICTIM);
      const statusAfter = cluster.status(VICTIM);
      for (const field of ['term', 'vote', 'commit', 'applied']) {
        assert.equal(statusAfter[field], statusBefore[field],
          `${field} moved when a cache beside the record was poisoned`);
      }
      assert.deepEqual(cluster.confState(VICTIM), confStateBefore,
        'the configuration came from the committed record, not from the ' +
        'service row that claims different peers');
      assert.notEqual(statusAfter.term, POISON.TERM);
      assert.notDeepEqual(cluster.confState(VICTIM).voters,
        JSON.parse(POISON.SERVICE_PEERS));
      // The poison really was there to be read.
      const poisoned = new Database(dbFile, {readonly: true});
      assert.equal(poisoned.prepare(
        'SELECT value FROM _raft_state WHERE key = ?').get('currentTerm')
        .value, POISON.TERM);
      assert.equal(poisoned.prepare('SELECT peers FROM services WHERE id = ?')
        .get(GROUP_ID).peers, POISON.SERVICE_PEERS);
      poisoned.close();
    } finally {
      cluster.dispose();
    }
  });
