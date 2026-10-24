// Owner decision 2026-10-26 (Q1, Q2): the original-allocation preparation
// reaches the lifecycle owner through one named operation, which births a
// founder's row and mints its incarnation; the class, retirement and every
// other lifecycle capability stay refused to that caller. Q3 adds exactly the
// owner's allocation-field operations and reads the preparation declares.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {
  prepareReplicaLifecycleForOriginalAllocation,
  RaftRsReplicaLifecycleOwner,
} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';
import {LIFECYCLE_ERROR, REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {auditRaftRsOperationBoundary} from
  '../../scripts/checks/raft-rs-operation-boundary-audit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREPARATION = 'src/raft/raft-rs-original-allocation-preparation.js';
const IMPORT_BYPASS = 'lifecycle-owner-import-bypass';
const IDENTITY = Object.freeze({groupId: 'original-group', peerId: '3',
  replicaIdentity: 'original-founder'});

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  return {db, rows: () => db.prepare(`SELECT * FROM ${TABLE} ORDER BY peer_id`).all()};
}

// The operation requires the caller's transaction, as the preparation commits
// the birth together with its peer-identity rows.
function bear(db, request = {}) {
  return db.transaction(() =>
    prepareReplicaLifecycleForOriginalAllocation({db, ...IDENTITY, ...request}))();
}

test('the owner births a NEVER_OPENED founder row and returns only its own stamp', (t) => {
  const f = fixture(t);
  const born = bear(f.db);
  assert.equal(born.outcome, OUTCOME.CORE_OK);
  assert.equal(born.reason, 'original-allocation-lifecycle-prepared');
  assert.deepEqual(Object.keys(born).sort(), ['detail', 'outcome', 'reason']);
  assert.deepEqual(Object.keys(born.detail), ['incarnation']);
  assert.equal(Object.isFrozen(born), true);
  assert.equal(Object.isFrozen(born.detail), true);
  assert.equal(Object.values(born).some((value) => typeof value === 'function'), false,
    'no owner, registration or retirement capability crosses');
  const [row] = f.rows();
  assert.equal(f.rows().length, 1);
  assert.equal(row.state, 'active');
  assert.equal(row.native_history_state, HISTORY.NEVER_OPENED, 'never marked established');
  assert.equal(typeof row.incarnation, 'string');
  assert.equal(row.incarnation, born.detail.incarnation);
});

test('the caller cannot choose the incarnation: only the identity reaches the owner', (t) => {
  const f = fixture(t);
  const born = bear(f.db, {mintIncarnation: () => 'caller-chosen', incarnation: 'caller-chosen'});
  assert.equal(born.outcome, OUTCOME.CORE_OK);
  assert.notEqual(born.detail.incarnation, 'caller-chosen');
  assert.equal(f.rows()[0].incarnation, born.detail.incarnation);
  const other = fixture(t);
  assert.notEqual(bear(other.db).detail.incarnation, born.detail.incarnation,
    'two births never share a minted incarnation');
});

test('the class takes no caller mint: a passed mintIncarnation never stamps a row (F7)', (t) => {
  const f = fixture(t);
  const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY,
    mintIncarnation: () => 'caller-chosen'});
  assert.equal(typeof owner.incarnation, 'string');
  assert.notEqual(owner.incarnation, 'caller-chosen');
  assert.equal(f.rows()[0].incarnation, owner.incarnation);
});

test('birth is once: an existing row in any state is refused unchanged', async (t) => {
  for (const [name, setup, request] of [
    ['exact active row', (db) => bear(db), {}],
    ['retired row', async (db) => {
      await new RaftRsReplicaLifecycleOwner({db, ...IDENTITY}).retire('removed');
    }, {}],
    ['row holding the peer under another replica', (db) => bear(db),
      {replicaIdentity: 'other-founder'}],
    ['row holding the replica under another peer', (db) => bear(db), {peerId: '4'}],
  ]) {
    const f = fixture(t);
    await setup(f.db);
    const before = f.rows();
    const refused = bear(f.db, request);
    assert.equal(refused.outcome, OUTCOME.CORE_REFUSED, name);
    assert.equal(refused.reason, 'original-allocation-lifecycle-row-present', name);
    assert.equal(refused.detail, null, name);
    assert.equal(Object.isFrozen(refused), true, name);
    assert.deepEqual(f.rows(), before, `${name}: nothing re-minted or replaced`);
  }
});

test('durable native history without a row is refused and no row is synthesized', (t) => {
  const f = fixture(t);
  new RaftRsDurableStore(f.db).putBootstrapAppliedState(IDENTITY.groupId,
    {voters: [IDENTITY.peerId], learners: [], votersOutgoing: [], learnersNext: [],
      autoLeave: false}, {bootstrapIndex: '0', admissionIndex: '0'});
  const refused = bear(f.db);
  assert.equal(refused.outcome, OUTCOME.CORE_REFUSED);
  assert.equal(refused.reason, 'lifecycle-record-missing');
  assert.deepEqual(f.rows(), []);
});

test('outside the caller transaction the operation refuses before any write', (t) => {
  const f = fixture(t);
  // The lifecycle owner's own refusal (F4), not the opening-history code.
  assert.throws(() => prepareReplicaLifecycleForOriginalAllocation({db: f.db, ...IDENTITY}),
    {message: LIFECYCLE_ERROR.TRANSACTION_REQUIRED});
  assert.equal(f.db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(TABLE),
    undefined, 'not even the table is created');
});

// The allowance is the symbol at its declared caller, not the caller file.
const OPERATION = 'prepareReplicaLifecycleForOriginalAllocation';
const OWNER_MODULE = './raft-rs-replica-lifecycle-owner.js';
// The preparation's declared calls (Q3): exactly these, nothing else.
const DECLARED = Object.freeze([OPERATION, 'prepareOriginalAllocationRow',
  'markOriginalAllocationIssued', 'readOriginalAllocationRow',
  'readOriginalAllocationDeclaration']);
for (const [label, source, accepted, caller = 'raft-rs-original-allocation-preparation.js'] of [
  ['named operation', `import {${OPERATION}} from '${OWNER_MODULE}';`, true],
  ['aliased operation', `import {${OPERATION} as bear} from '${OWNER_MODULE}';`, true],
  ['class', `import {RaftRsReplicaLifecycleOwner} from '${OWNER_MODULE}';`, false],
  ['operation with the class', `import {${OPERATION}, RaftRsReplicaLifecycleOwner} from '${OWNER_MODULE}';`, false],
  ['second operation', `import {${OPERATION}, readDurableReplicaLifecycle} from '${OWNER_MODULE}';`, false],
  ['second operation in its own import',
    `import {${OPERATION}} from '${OWNER_MODULE}';\nimport {readDurableReplicaLifecycle} from '${OWNER_MODULE}';`,
    false],
  ['snapshot staging operation', `import {prepareReplicaLifecycleForSnapshot} from '${OWNER_MODULE}';`, false],
  ['retirement', `import {retireReplicaLifecycle} from '${OWNER_MODULE}';`, false],
  ['registration', `import {registerRuntimeLifecycle} from '${OWNER_MODULE}';`, false],
  ['default import', `import lifecycle from '${OWNER_MODULE}';`, false],
  ['namespace', `import * as lifecycle from '${OWNER_MODULE}';`, false],
  ['dynamic', `const lifecycle = await import('${OWNER_MODULE}');`, false],
  ['re-export', `export {${OPERATION}} from '${OWNER_MODULE}';`, false],
  ['second caller', `import {${OPERATION}} from '${OWNER_MODULE}';`, false,
    'raft-rs-original-allocation-second-caller.js'],
  ['snapshot caller', `import {${OPERATION}} from '${OWNER_MODULE}';`, false, 'snapshot-install.js'],
  ['every declared operation in one import', `import {${DECLARED.join(', ')}} from '${OWNER_MODULE}';`,
    true],
  ['a declared operation in its own import',
    `import {${OPERATION}} from '${OWNER_MODULE}';\nimport {markOriginalAllocationIssued} from '${OWNER_MODULE}';`,
    true],
  ['undeclared rights transition', `import {transitionOriginalRight} from '${OWNER_MODULE}';`, false],
  ['declared operations with the rights transition',
    `import {${DECLARED.join(', ')}, transitionOriginalRight} from '${OWNER_MODULE}';`, false],
  ['declared operation at the snapshot caller',
    `import {markOriginalAllocationIssued} from '${OWNER_MODULE}';`, false, 'snapshot-install.js'],
]) {
  test(`original-allocation lifecycle import boundary: ${label}`, (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'original-lifecycle-boundary-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const src = path.join(directory, 'src/raft');
    fs.mkdirSync(src, {recursive: true});
    fs.writeFileSync(path.join(src, caller), source);
    const violations = auditRaftRsOperationBoundary({root: directory});
    assert.equal(violations.some((entry) => entry.code === IMPORT_BYPASS), !accepted);
  });
}

test('the real preparation imports exactly the declared operations and the census holds', () => {
  const violations = auditRaftRsOperationBoundary({root: ROOT});
  assert.deepEqual(violations.filter((entry) => entry.file === PREPARATION), [],
    'the inherited class import is replaced by the declared operations');
  const source = fs.readFileSync(path.join(ROOT, PREPARATION), 'utf8');
  const lifecycleImports = source.match(/import\s*\{[^}]*\}\s*from\s*'\.\/raft-rs-replica-lifecycle-owner\.js'/gu);
  assert.equal(lifecycleImports.length, 1);
  const imported = lifecycleImports[0].slice(lifecycleImports[0].indexOf('{') + 1,
    lifecycleImports[0].indexOf('}')).split(',').map((name) => name.trim()).sort();
  assert.deepEqual(imported, [...DECLARED].sort());
  assert.doesNotMatch(source, /RaftRsReplicaLifecycleOwner|mintIncarnation/u);
});
