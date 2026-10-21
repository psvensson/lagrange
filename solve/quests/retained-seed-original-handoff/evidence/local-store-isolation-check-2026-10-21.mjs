// Exploratory symbol-level check, NOT the repository/native acceptance runner.
// Uses real node:sqlite with a small better-sqlite3-shaped adapter. The
// lifecycle constructor is represented by its local schema fixture; unrelated
// native/runtime dependencies are not loaded. Production store bytes and the
// canonical regression test file are loaded unchanged (except named mutants).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';

const sourceRoot = path.resolve(process.argv[2] || '.');
const testRoot = path.resolve(process.argv[3] || sourceRoot);
const mutant = process.argv[4] || 'none';
const testFile = path.join(testRoot, 'test/raft/raft-rs-original-allocation-store.test.js');
class SQLiteAdapter {
  open = true;
  inTransaction = false;
  constructor(filename) { this.raw = new DatabaseSync(filename); }
  exec(sql) {
    this.raw.exec(sql);
    const command = sql.trim().toUpperCase();
    if (command.startsWith('BEGIN')) this.inTransaction = true;
    if (command === 'COMMIT' || command === 'ROLLBACK') this.inTransaction = false;
  }
  prepare(sql) { return this.raw.prepare(sql); }
  pragma(sql, options = {}) {
    const rows = this.raw.prepare(`PRAGMA ${sql}`).all();
    return options.simple ? Object.values(rows[0] || {})[0] : rows;
  }
  transaction(work) {
    return () => {
      this.exec('BEGIN');
      try {
        const result = work();
        this.exec('COMMIT');
        return result;
      } catch (error) {
        if (this.inTransaction) this.exec('ROLLBACK');
        throw error;
      }
    };
  }
  close() { this.raw.close(); this.open = false; }
}
const lifecycleFixture = `
export class RaftRsReplicaLifecycleOwner {
  constructor({db, groupId, peerId, replicaIdentity, mintIncarnation}) {
    db.exec(\`CREATE TABLE _raft_rs_replica_lifecycle (
      group_id TEXT NOT NULL, peer_id TEXT NOT NULL, replica_identity TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('active', 'retired')), reason TEXT,
      changed_at TEXT NOT NULL, incarnation TEXT, retirement_evidence TEXT,
      native_history_state TEXT, PRIMARY KEY (group_id, peer_id),
      UNIQUE (group_id, replica_identity))\`);
    db.prepare(\`INSERT INTO _raft_rs_replica_lifecycle
      (group_id, peer_id, replica_identity, state, changed_at, incarnation, native_history_state)
      VALUES (?, ?, ?, 'active', ?, ?, 'never-opened')\`)
      .run(groupId, peerId, replicaIdentity, new Date().toISOString(), mintIncarnation());
  }
}`;
// commitDurably body copied verbatim from the pinned source, lines 189-205.
// Only its imported constants are bound here; no complete durable-store/native
// module is claimed to have been exercised.
const durableFixture = `
const RAFT_RS_STORE_ERROR_MSG = {DURABLE_COMMIT_INSIDE_TRANSACTION: 'nested durable commit'};
const RAFT_RS_STORE_ERROR_CODE = {DURABLE_COMMIT_INSIDE_TRANSACTION: 'nested-durable-commit'};
const RAFT_RS_SYNCHRONOUS_PRAGMA = {READ: 'synchronous', FULL_LEVEL: 2,
  SET_FULL: 'synchronous = FULL', setLevel: (level) => 'synchronous = ' + level};
function commitDurably(db, work) {
  if (db.inTransaction) {
    throw Object.assign(
      new Error(RAFT_RS_STORE_ERROR_MSG.DURABLE_COMMIT_INSIDE_TRANSACTION),
      {code: RAFT_RS_STORE_ERROR_CODE.DURABLE_COMMIT_INSIDE_TRANSACTION});
  }
  const level = db.pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.READ, {simple: true});
  if (level >= RAFT_RS_SYNCHRONOUS_PRAGMA.FULL_LEVEL) {
    return db.transaction(work)();
  }
  db.pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.SET_FULL);
  try {
    return db.transaction(work)();
  } finally {
    db.pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.setLevel(level));
  }
}
export {commitDurably};`;
const cache = new Map();
function synthetic(id, namespace) {
  return new vm.SyntheticModule(Object.keys(namespace), function() {
    for (const [name, value] of Object.entries(namespace)) this.setExport(name, value);
  }, {identifier: id});
}
function sourceModule(id, source) {
  return new vm.SourceTextModule(source, {identifier: id});
}
function mutate(source) {
  const substitutions = {
    'no-transition-policy': [
      /  if \(!Object.hasOwn\(ORIGINAL_RIGHT_SUCCESSOR, from\) \|\|\n      ORIGINAL_RIGHT_SUCCESSOR\[from\] !== to\) \{\n    throw originalAllocationError\(REASON.TRANSITION, member.replicaId\);\n  \}\n/u, ''],
    'no-member-binding': [
      /  if \(row\[COLUMN.MEMBER\] !== JSON.stringify\(member\)\) \{\n    throw originalAllocationError\(REASON.IDENTITY, member.replicaId\);\n  \}\n/u, ''],
    'no-issue-declaration-readback': [
      /    row\[COLUMN.DECLARATION\] === declarationText &&\n    row\[COLUMN.ISSUE\] === STATE.ISSUED/u,
      '    row[COLUMN.ISSUE] === STATE.ISSUED'],
    'no-transaction-readback-fence': [
      /    if \(db.inTransaction\) throw originalAllocationError\(REASON.OBSERVATION\);\n/u, ''],
  };
  if (mutant === 'none') return source;
  const substitution = substitutions[mutant];
  if (!substitution || !substitution[0].test(source)) throw Error('Unmatched mutant: ' + mutant);
  return source.replace(...substitution);
}
async function getModule(id) {
  if (cache.has(id)) return cache.get(id);
  let module;
  if (id.startsWith('node:')) module = synthetic(id, await import(id));
  else if (id === 'better-sqlite3') module = synthetic(id, {default: SQLiteAdapter});
  else if (id.endsWith('/raft-rs-replica-lifecycle-owner.js')) module = sourceModule(id, lifecycleFixture);
  else if (id.endsWith('/raft-rs-durable-store.js')) module = sourceModule(id, durableFixture);
  else {
    let source = fs.readFileSync(id, 'utf8');
    if (id.endsWith('/raft-rs-original-allocation-store.js')) source = mutate(source);
    module = sourceModule(id, source);
  }
  cache.set(id, module);
  return module;
}
const root = await getModule(testFile);
await root.link(async (specifier, referencing) => {
  if (specifier.startsWith('node:') || specifier === 'better-sqlite3') return getModule(specifier);
  let resolved = path.resolve(path.dirname(referencing.identifier), specifier);
  const candidateSrc = path.join(testRoot, 'src/');
  if (resolved.startsWith(candidateSrc)) resolved = path.join(sourceRoot, 'src', resolved.slice(candidateSrc.length));
  return getModule(resolved);
});
console.log('# EXPLORATORY: node:sqlite adapter; isolated imports; native/Quest credit = NONE');
console.log('# sourceRoot=' + sourceRoot + '; mutant=' + mutant);
await root.evaluate();
