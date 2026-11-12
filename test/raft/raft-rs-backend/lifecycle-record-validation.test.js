// Real lifecycle writer and SQLite rows; corruption is injected only after birth.
// Every reader must refuse the same malformed authority without repairing it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {SQLiteConnection} from '../../../src/storage/sqlite-prepared-statement-owner.js';
import {allocateLifecycleFixture} from '../../helpers/replica-lifecycle-fixture.js';
import {pollutePrototypeProperty, polluteWithAccessor,
  replacePrototypeProperty, withHostileIntrinsics} from
  '../../helpers/hostile-intrinsics.js';
import {RaftRsReplicaLifecycleOwner, readDurableReplicaLifecycle,
  readDurableReplicaLifecycleBeside, inspectReplicaLifecycleForSnapshot,
  DURABLE_LIFECYCLE_READ, prepareReplicaLifecycleForSnapshot,
  prepareOriginalAllocationRow, readOriginalAllocationRow,
  markOriginalAllocationIssued, readOriginalAllocationDeclaration, transitionOriginalRight} from
  '../../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {LIFECYCLE_STATE, REPLICA_LIFECYCLE_TABLE, LIFECYCLE_REASON} from
  '../../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {raftRsLifecycleAdministration as administration} from
  '../../../src/raft/raft-rs-lifecycle-administration.js';
import {pendingTurn, settledTurn} from '../../../src/raft/raft-rs-turn-answer.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {decodeReplicaLifecycleRow, encodeLifecycleRetirement} from
  '../../../src/raft/raft-rs-replica-lifecycle-record.js';
import {ORIGINAL_ALLOCATION, ORIGINAL_ALLOCATION_COLUMN} from
  '../../../src/raft/raft-rs-original-allocation-constants.js';

const IDENTITY = Object.freeze({groupId: 'row-validation-group', peerId: '7',
  replicaIdentity: 'row-validation-replica'});
const INVALID = Object.freeze({STATE: 'lifecycle-state-invalid',
  REASON: 'lifecycle-reason-invalid', EVIDENCE: 'lifecycle-evidence-invalid'});
const RETIREMENT_REASON = 'row-validation-removal';
const READERS = Object.freeze(['durable', 'runtime', 'snapshot']);
const BAD_EVIDENCE = Object.freeze(['{', '', ' ', 'null', 'false', '0',
  '"text"', '[]', '[{}]', Buffer.from('{}'), '{"value":1e999}']);

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-validation-'));
  const file = path.join(dir, 'replica.sqlite');
  const db = new SQLiteConnection(file);
  allocateLifecycleFixture({db, ...IDENTITY});
  t.after(() => {
    if (db.open) db.close();
    fs.rmSync(dir, {recursive: true, force: true});
  });
  return {file, db};
}

function snapshot(file, extra = {}) {
  return inspectReplicaLifecycleForSnapshot({receiverDbPath: file, ...IDENTITY, ...extra});
}

function row(db) {
  return db.prepare(`SELECT * FROM ${REPLICA_LIFECYCLE_TABLE}`).get();
}

function corrupt(f, fields) {
  f.db.pragma('ignore_check_constraints = ON');
  for (const [field, value] of Object.entries(fields)) {
    f.db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE} SET ${field} = ?`).run(value);
  }
  f.db.close();
}

function checkRefusal(f, reader, reason) {
  const bytes = fs.readFileSync(f.file);
  if (reader === 'durable') {
    let besideCalls = 0;
    const read = readDurableReplicaLifecycleBeside(f.file, IDENTITY.groupId,
      IDENTITY.replicaIdentity, () => {
        besideCalls++; return {};
      });
    assert.equal(read.lifecycle.state, DURABLE_LIFECYCLE_READ.UNREADABLE.state);
    assert.equal(read.lifecycle.reason, reason);
    assert.equal(read.lifecycle.opening, null);
    assert.equal(read.lifecycle.retirementEvidence, null);
    assert.equal(besideCalls, 0, 'no other authority read beside an invalid row');
    assert.equal(administration.holdsRow(read.lifecycle), false);
    assert.equal(administration.isRetired(read.lifecycle), false);
    assert.equal(administration.isNeverOpened(read.lifecycle), false);
  } else if (reader === 'runtime') {
    const db = new SQLiteConnection(f.file);
    try {
      const owner = new RaftRsReplicaLifecycleOwner({db, ...IDENTITY});
      assert.equal(owner.active, false);
      assert.equal(owner.admission().outcome, OUTCOME.CORE_REFUSED);
      assert.equal(owner.admission().reason, reason);
      assert.equal(owner.incarnation, null, 'invalid record grants no runtime identity');
    } finally {
      db.close();
    }
  } else {
    const result = snapshot(f.file);
    assert.equal(result.outcome, OUTCOME.CORE_REFUSED);
    assert.equal(result.reason, reason);
  }
  assert.deepEqual(fs.readFileSync(f.file), bytes, 'observation cannot repair authority');
}

for (const state of Object.values(LIFECYCLE_STATE)) {
  for (const [index, raw] of BAD_EVIDENCE.entries()) {
    for (const reader of READERS) {
      test(`${reader} refuses malformed evidence ${index} in ${state} row`, (t) => {
        const f = fixture(t);
        corrupt(f, {state, reason: state === LIFECYCLE_STATE.ACTIVE ? null :
          RETIREMENT_REASON, retirement_evidence: raw});
        checkRefusal(f, reader, INVALID.EVIDENCE);
      });
    }
  }
}

for (const [label, fields, reason] of [
  ['unknown state', {state: 'unrecognized'}, INVALID.STATE],
  ['empty state', {state: ''}, INVALID.STATE],
  ['active retirement reason', {reason: RETIREMENT_REASON}, INVALID.REASON],
  ['blob reason', {reason: Buffer.from('reason')}, INVALID.REASON],
  ['empty active reason', {reason: ''}, INVALID.REASON],
  ['null terminal reason', {state: LIFECYCLE_STATE.RETIRED, reason: null}, INVALID.REASON],
  ['empty terminal reason', {state: LIFECYCLE_STATE.RETIRED, reason: ''}, INVALID.REASON],
  ['active evidence object', {retirement_evidence: '{}'}, INVALID.EVIDENCE],
]) {
  for (const reader of READERS) {
    test(`${reader} refuses ${label}`, (t) => {
      const f = fixture(t);
      corrupt(f, fields);
      checkRefusal(f, reader, reason);
    });
  }
}

test('empty active evidence stays fresh through runtime, removal and snapshot', (t) => {
  const f = fixture(t);
  const before = row(f.db);
  const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
  assert.equal(owner.admission().outcome, OUTCOME.CORE_OK);
  f.db.close();
  const bytes = fs.readFileSync(f.file);
  const read = administration.readReplicaLifecycle(f.file, IDENTITY.groupId,
    IDENTITY.replicaIdentity);
  assert.equal(administration.isNeverOpened(read), true);
  assert.equal(read.retirementEvidence, null);
  assert.equal(snapshot(f.file).outcome, OUTCOME.CORE_OK);
  assert.equal(snapshot(f.file).detail.incarnation, before.incarnation);
  assert.deepEqual(fs.readFileSync(f.file), bytes);
});

for (const evidence of [null, {}, {marker: 'retained', nested: {value: 1}}]) {
  test(`terminal evidence ${JSON.stringify(evidence)} remains readable and refuses reopen`,
    async (t) => {
      const f = fixture(t);
      const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
      assert.equal((await owner.retire(RETIREMENT_REASON, evidence)).outcome, OUTCOME.CORE_OK);
      const before = row(f.db);
      assert.equal(before.state, LIFECYCLE_STATE.RETIRED);
      assert.equal(before.reason, RETIREMENT_REASON);
      f.db.close();
      const read = readDurableReplicaLifecycle(f.file, IDENTITY.groupId, IDENTITY.replicaIdentity);
      assert.equal(administration.isRetired(read), true);
      assert.deepEqual(read.retirementEvidence, evidence);
      assert.equal(read.incarnation, before.incarnation);
      assert.equal(snapshot(f.file).reason, LIFECYCLE_STATE.RETIRED);
      const db = new SQLiteConnection(f.file);
      try {
        const reopened = new RaftRsReplicaLifecycleOwner({db, ...IDENTITY});
        assert.equal(reopened.admission().reason, LIFECYCLE_STATE.RETIRED);
        assert.equal(prepareReplicaLifecycleForSnapshot({db, ...IDENTITY}).reason,
          LIFECYCLE_STATE.RETIRED);
        assert.deepEqual(row(db), before);
      } finally {
        db.close();
      }
    });
}

test('reseed terminal state has one refusal before and after restart and in snapshots', (t) => {
  const f = fixture(t);
  const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
  owner.holdForReseed();
  assert.equal(owner.admission().reason, LIFECYCLE_REASON.RESEED_REQUIRED);
  f.db.close();
  const read = administration.readReplicaLifecycle(f.file, IDENTITY.groupId,
    IDENTITY.replicaIdentity);
  assert.equal(administration.isRetired(read), true);
  assert.equal(read.retirementEvidence, null);
  assert.equal(read.reason, LIFECYCLE_REASON.RESEED_REQUIRED);
  assert.equal(snapshot(f.file).reason, LIFECYCLE_REASON.RESEED_REQUIRED);
});

for (const reason of [null, '', 0, false, {}, []]) {
  test(`retire refuses invalid reason ${JSON.stringify(reason)} before closing admission`,
    async (t) => {
      const f = fixture(t);
      const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
      const before = row(f.db);
      await assert.rejects(owner.retire(reason), {code: INVALID.REASON});
      assert.equal(owner.active, true);
      assert.deepEqual(row(f.db), before);
      assert.equal((await owner.retire(RETIREMENT_REASON)).outcome, OUTCOME.CORE_OK);
    });
}

for (const evidence of [false, 0, '', [], new Date(0)]) {
  test(`retire refuses invalid evidence ${JSON.stringify(evidence)} before closing admission`,
    async (t) => {
      const f = fixture(t);
      const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
      const before = row(f.db);
      await assert.rejects(owner.retire(RETIREMENT_REASON, evidence), {code: INVALID.EVIDENCE});
      assert.equal(owner.active, true);
      assert.deepEqual(row(f.db), before);
      assert.equal((await owner.retire(RETIREMENT_REASON, {})).outcome, OUTCOME.CORE_OK);
    });
}

test('retire captures valid evidence before waiting for the admitted runtime turn', async (t) => {
  const f = fixture(t);
  const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
  let release;
  const running = owner.execute(() => pendingTurn(new Promise((resolve) => {
    release = resolve;
  })));
  const evidence = {marker: 'original', nested: {sequence: 1}};
  const retirement = owner.retire(RETIREMENT_REASON, evidence);
  assert.equal(owner.active, false);
  evidence.marker = 'changed';
  evidence.nested.sequence = 2;
  release(settledTurn(null));
  await running.pending;
  assert.equal((await retirement).outcome, OUTCOME.CORE_OK);
  assert.deepEqual(JSON.parse(row(f.db).retirement_evidence),
    {marker: 'original', nested: {sequence: 1}});
});

test('retirement rejects a throwing or lossy carrier before any awaited cleanup continuation',
  async (t) => {
    const f = fixture(t);
    const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
    let getterCalls = 0;
    const hostile = {get marker() {
      getterCalls++; return 'not-data';
    }};
    const cyclic = {};
    cyclic.self = cyclic;
    for (const evidence of [hostile, cyclic, {toJSON: () => ({})}, {value: undefined},
      {value: Infinity}, Object.create({marker: 'inherited'})]) {
      let continued = false;
      const before = row(f.db);
      await assert.rejects((async () => {
        await owner.retire(RETIREMENT_REASON, evidence);
        continued = true;
      })(), {code: INVALID.EVIDENCE});
      assert.equal(continued, false);
      assert.equal(owner.active, true);
      assert.deepEqual(row(f.db), before);
    }
    assert.equal(getterCalls, 0);
    assert.equal((await owner.retire(RETIREMENT_REASON, {})).outcome, OUTCOME.CORE_OK);
  });

for (const operation of ['read', 'declaration', 'issue', 'right']) {
  test(`original-allocation ${operation} refuses malformed lifecycle before any durable effect`, (t) => {
    const f = fixture(t);
    const member = {groupId: IDENTITY.groupId, peerId: IDENTITY.peerId,
      replicaId: IDENTITY.replicaIdentity, incarnation: row(f.db).incarnation,
      createdAt: 17, createAttemptToken: 'original-attempt'};
    const declaration = {allocationId: 'original-allocation',
      anchorReplicaId: member.replicaId, members: [member]};
    prepareOriginalAllocationRow({db: f.db, declaration, member});
    f.db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE} SET retirement_evidence = ?`).run('{');
    const before = row(f.db);
    const invoke = {
      read: () => readOriginalAllocationRow({db: f.db, member}),
      declaration: () => readOriginalAllocationDeclaration({db: f.db, ...IDENTITY}),
      issue: () => markOriginalAllocationIssued({db: f.db, declaration, anchor: member}),
      right: () => transitionOriginalRight({db: f.db, member,
        right: ORIGINAL_ALLOCATION_COLUMN.SERVICE_RIGHT,
        from: ORIGINAL_ALLOCATION.UNUSED, to: ORIGINAL_ALLOCATION.SUBMITTED}),
    };
    assert.throws(invoke[operation], {code: INVALID.EVIDENCE});
    assert.deepEqual(row(f.db), before, 'refusal precedes commit, not just readback');
  });
}

test('actual operation port refuses malformed active evidence before every native entry', (t) => {
  let before;
  const cluster = new PartitionNodeCluster({partitionId: IDENTITY.groupId,
    replicaIds: [IDENTITY.replicaIdentity], wrapDatabase: (_replica, db) => {
      db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE} SET retirement_evidence = ?`).run('{');
      before = row(db);
      return db;
    }});
  t.after(() => cluster.dispose());
  const port = cluster.node(IDENTITY.replicaIdentity);
  assert.equal(cluster.coreEntryCount(), 0, 'no dispatcher/native opening for invalid authority');
  for (const call of [() => port.readStatus(), () => port.tick().result,
    () => port.campaign().result, () => port.propose('refused').result]) {
    const result = call();
    assert.equal(result.outcome, OUTCOME.CORE_REFUSED);
    assert.equal(result.reason, INVALID.EVIDENCE);
  }
  assert.equal(cluster.coreEntryCount(), 0);
  assert.deepEqual(row(cluster.replica(IDENTITY.replicaIdentity).db), before,
    'port construction preserves lifecycle row; unrelated peer schema is outside this claim');
});

test('actual operation port control enters native core with valid empty evidence', (t) => {
  const cluster = new PartitionNodeCluster({partitionId: IDENTITY.groupId,
    replicaIds: [IDENTITY.replicaIdentity]});
  t.after(() => cluster.dispose());
  assert.equal(cluster.node(IDENTITY.replicaIdentity).readStatus().outcome, OUTCOME.CORE_OK);
  assert.ok(cluster.coreEntryCount() > 0, 'engaged native-entry instrument');
});

test('ordinary retirement with reseed reason preserves the live and reopened refusal', async (t) => {
  const f = fixture(t);
  const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
  await owner.retire(LIFECYCLE_REASON.RESEED_REQUIRED);
  assert.equal(owner.admission().reason, LIFECYCLE_REASON.RESEED_REQUIRED);
  assert.equal(new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY}).admission().reason,
    LIFECYCLE_REASON.RESEED_REQUIRED);
});

test('row and evidence codecs reject exotic fields without coercion or accessor execution', (t) => {
  const f = fixture(t);
  const valid = row(f.db);
  let calls = 0;
  for (const reason of [undefined, Symbol('reason'), Object('reason'),
    Object(1), Object(true), {toString() {
      calls++; return 'reason';
    }}]) {
    assert.throws(() => encodeLifecycleRetirement(reason, null), {code: INVALID.REASON});
  }
  for (const evidence of [{value: 1n}, {value: Symbol('value')}, Object('evidence')]) {
    assert.throws(() => encodeLifecycleRetirement(RETIREMENT_REASON, evidence),
      {code: INVALID.EVIDENCE});
  }
  assert.throws(() => decodeReplicaLifecycleRow(Object.create(valid)));
  assert.throws(() => decodeReplicaLifecycleRow({...valid, get reason() {
    calls++; return null;
  }}));
  assert.equal(calls, 0);
});

test('codec ignores prototype toJSON and uses captured JSON intrinsics', (t) => {
  const f = fixture(t);
  const valid = {...row(f.db), state: LIFECYCLE_STATE.RETIRED,
    reason: RETIREMENT_REASON, retirement_evidence: '{"marker":"retained","nested":[1]}'};
  let decoded;
  let encoded;
  withHostileIntrinsics([
    pollutePrototypeProperty(Object.prototype, 'toJSON', () => 'not-authority'),
    replacePrototypeProperty(JSON, 'parse', () => {
      throw new Error('ambient parse used');
    }),
    replacePrototypeProperty(JSON, 'stringify', () => {
      throw new Error('ambient stringify used');
    }),
  ], () => {
    decoded = decodeReplicaLifecycleRow(valid);
    encoded = encodeLifecycleRetirement(RETIREMENT_REASON, {marker: 'retained', nested: [1]});
  });
  assert.deepEqual(decoded.retirementEvidence, {marker: 'retained', nested: [1]});
  assert.deepEqual(JSON.parse(encoded.evidenceText), decoded.retirementEvidence);
});

const ARRAY_CASES = [
  ['index accessor', (call) => Object.defineProperty([1], '0', {get: call})],
  ['extra field', () => Object.assign([1], {extra: 'must not disappear'})],
  ['extra accessor', (call) => Object.defineProperty([1], 'extra', {get: call})],
  ['symbol field', () => Object.assign([1], {[Symbol('extra')]: 'must not disappear'})],
  ['nonenumerable index', () => Object.defineProperty([1], '0', {enumerable: false})],
  ['array subclass', () => new (class EvidenceArray extends Array {})(1, 2)],
];
for (const [label, make] of ARRAY_CASES) {
  test(`retirement rejects nested ${label} before callbacks or durable effects`, async (t) => {
    const f = fixture(t);
    const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
    let calls = 0;
    const value = make(() => {
      calls++; return 1;
    });
    const before = row(f.db);
    await assert.rejects(owner.retire(RETIREMENT_REASON, {outer: [{inner: value}]}),
      {code: INVALID.EVIDENCE});
    assert.equal(calls, 0);
    assert.equal(owner.active, true);
    assert.deepEqual(row(f.db), before);
    await owner.retire(RETIREMENT_REASON, {outer: [{inner: [1, null, {}]}]});
    assert.deepEqual(JSON.parse(row(f.db).retirement_evidence),
      {outer: [{inner: [1, null, {}]}]});
  });
}

test('an inherited array element is not accepted as evidence data', () => {
  let refusal;
  withHostileIntrinsics([pollutePrototypeProperty(Array.prototype, '0', 17)], () => {
    try {
      encodeLifecycleRetirement(RETIREMENT_REASON, {nested: Array(1)});
    } catch (error) {
      refusal = error;
    }
  });
  assert.equal(refusal?.code, INVALID.EVIDENCE);
});

for (const operation of ['encode', 'decode']) {
  test(`${operation} ignores inherited serializer option accessors`, async (t) => {
    const f = fixture(t);
    const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
    await owner.retire(RETIREMENT_REASON, {nested: [1, null, {}]});
    const valid = row(f.db);
    let calls = 0;
    let answer;
    let failure;
    const get = () => {
      calls++; throw new Error('inherited serializer option');
    };
    withHostileIntrinsics([
      polluteWithAccessor(Object.prototype, 'spacing', {get}),
      polluteWithAccessor(Object.prototype, 'sortKeys', {get}),
    ], () => {
      try {
        answer = operation === 'encode' ?
          encodeLifecycleRetirement(RETIREMENT_REASON, {nested: [1, null, {}]}) :
          decodeReplicaLifecycleRow(valid);
      } catch (error) {
        failure = error;
      }
    });
    assert.ifError(failure);
    assert.equal(calls, 0);
    assert.deepEqual(operation === 'encode' ? JSON.parse(answer.evidenceText) :
      answer.retirementEvidence, {nested: [1, null, {}]});
  });
}

test('valid nested record and empty/dense arrays are preserved', async (t) => {
  const f = fixture(t);
  const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
  const evidence = {nested: [{empty: [], values: [1, null, {}]}]};
  await owner.retire(RETIREMENT_REASON, evidence);
  assert.deepEqual(JSON.parse(row(f.db).retirement_evidence), evidence);
});

const TRAVERSAL_INTRINSICS = [[globalThis, 'Set'], [Set.prototype, 'has'],
  [Set.prototype, 'add'], [Set.prototype, 'delete']];
for (const operation of ['encode', 'decode']) {
  for (const [target, field] of TRAVERSAL_INTRINSICS) {
    test(`${operation} evidence validation ignores replaced Set ${field}`, async (t) => {
      const f = fixture(t);
      const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
      const evidence = {nested: [1, null, {}]};
      await owner.retire(RETIREMENT_REASON, evidence);
      const valid = row(f.db);
      let calls = 0;
      let answer;
      let failure;
      withHostileIntrinsics([replacePrototypeProperty(target, field, function replaced() {
        calls++;
        throw new Error('ambient traversal intrinsic used');
      })], () => {
        try {
          answer = operation === 'encode' ?
            encodeLifecycleRetirement(RETIREMENT_REASON, evidence) :
            decodeReplicaLifecycleRow(valid);
        } catch (error) {
          failure = error;
        }
      });
      assert.ifError(failure);
      assert.equal(calls, 0);
      assert.deepEqual(operation === 'encode' ? JSON.parse(answer.evidenceText) :
        answer.retirementEvidence, evidence);
    });
  }
}

test('a mutable traversal hook cannot install an accessor after array validation', () => {
  const nested = [1];
  const originalAdd = Set.prototype.add;
  let getterCalls = 0;
  let answer;
  let failure;
  withHostileIntrinsics([replacePrototypeProperty(Set.prototype, 'add', function replaced(value) {
    if (value === nested) {
      Object.defineProperty(nested, '0', {enumerable: true, configurable: true,
        get() {
          getterCalls++; return 1;
        }});
    }
    return originalAdd.call(this, value);
  })], () => {
    try {
      answer = encodeLifecycleRetirement(RETIREMENT_REASON, {nested});
    } catch (error) {
      failure = error;
    }
  });
  assert.ifError(failure);
  assert.equal(getterCalls, 0, 'no getter installed between validation and serialization');
  assert.deepEqual(JSON.parse(answer.evidenceText), {nested: [1]});
});

test('repeated acyclic evidence objects remain valid', () => {
  const shared = {member: 7};
  const evidence = {first: shared, again: [shared, shared]};
  assert.deepEqual(JSON.parse(encodeLifecycleRetirement(RETIREMENT_REASON,
    evidence).evidenceText), evidence);
});

for (const operation of ['encode', 'decode']) {
  for (const field of ['get', 'set']) {
    for (const shape of ['accessor', 'callable']) {
      test(`${operation} valid evidence survives inherited descriptor ${field} ${shape}`,
        async (t) => {
          const f = fixture(t);
          const owner = new RaftRsReplicaLifecycleOwner({db: f.db, ...IDENTITY});
          await owner.retire(RETIREMENT_REASON, {});
          const valid = row(f.db);
          let calls = 0;
          let answer;
          let failure;
          const poison = () => {
            calls++; throw new Error('inherited descriptor field used');
          };
          const restore = shape === 'accessor' ?
            polluteWithAccessor(Object.prototype, field, {get: poison}) :
            pollutePrototypeProperty(Object.prototype, field, poison);
          withHostileIntrinsics([restore], () => {
            try {
              answer = operation === 'encode' ? encodeLifecycleRetirement(RETIREMENT_REASON, {}) :
                decodeReplicaLifecycleRow(valid);
            } catch (error) {
              failure = error;
            }
          });
          assert.ifError(failure);
          assert.equal(calls, 0);
          assert.deepEqual(operation === 'encode' ? JSON.parse(answer.evidenceText) :
            answer.retirementEvidence, {});
        });
    }
  }
  test(`${operation} malformed evidence retains an own typed refusal under code pollution`, (t) => {
    const f = fixture(t);
    const malformed = {...row(f.db), retirement_evidence: '{'};
    let calls = 0;
    let refusal;
    withHostileIntrinsics([polluteWithAccessor(Object.prototype, 'code', {
      get() {
        calls++; return 'forged-code';
      }, set() {
        calls++;
      },
    })], () => {
      try {
        if (operation === 'encode') encodeLifecycleRetirement(RETIREMENT_REASON, []);
        else decodeReplicaLifecycleRow(malformed);
      } catch (error) {
        refusal = error;
      }
    });
    assert.equal(calls, 0, 'refusal construction never dispatches an inherited setter');
    assert.equal(Object.hasOwn(refusal, 'code'), true);
    assert.equal(refusal.code, INVALID.EVIDENCE);
  });
}
