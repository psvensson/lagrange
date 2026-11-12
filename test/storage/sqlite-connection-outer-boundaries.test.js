// Real SQLite and original-allocation owners. Cold records below are storage-owner
// fixtures, not native Raft execution or build-provenance evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {SQLiteConnection} from '../../src/storage/sqlite-prepared-statement-owner.js';
import {readOriginalSeedRetainedEffects} from '../../src/bootstrap/seed-retained-effects.js';
import {SEED_RETAINED_EFFECT_STATE as EFFECT, SEED_RETAINED_EFFECT_REASON as EFFECT_REASON} from
  '../../src/bootstrap/seed-retained-effects-constants.js';
import {ownerStampedSeedDeclaration} from
  '../test-helpers/original-allocation-declaration-fixture.js';
import {createSeedOriginalAllocation} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {detectLegacyPartitionConsensusState} from
  '../../src/partition/partition-legacy-consensus-state.js';
import {LEGACY_PARTITION_CONSENSUS_OUTCOME as LEGACY} from
  '../../src/partition/partition-legacy-consensus-state-constants.js';
import {compactRaftRsCommittedEntries} from '../../src/raft/snapshot-compaction.js';
import {RAFT_COMPACTION_OUTCOME as COMPACTION} from '../../src/raft/compaction-policy.js';
import {RaftRsDurableStore, commitDurably} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_STORE_ERROR_CODE as STORE_ERROR} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {createRaftRsOperationPort} from '../../src/raft/raft-rs-operation-port.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {RaftRsOriginalAllocationPreparation, consumeOriginalAllocationOpening} from
  '../../src/raft/raft-rs-original-allocation-preparation.js';
import {RaftRsReplicaLifecycleOwner, transitionOriginalRight, readOriginalAllocationRow} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {ORIGINAL_ALLOCATION as ORIGINAL, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN, isOriginalAllocationHold} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';
import {REPLICA_LIFECYCLE_TABLE} from '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {RAFT_OPERATION_PORT_REQUEST as REQUEST, RAFT_COMMITTED_ENTRY_APPLY_MODE as APPLY} from
  '../../src/raft/raft-operation-port-request.js';

const MISSING = 'sqlite_statement_owner_missing';
const DECLARED_AT = 1234;
const TIMING = Object.freeze({heartbeatMs: 50, electionMinMs: 150,
  electionMaxMs: 300, tickIntervalMs: 10});
const hold = (reason) => (error) => isOriginalAllocationHold(error, reason);
const declaration = ownerStampedSeedDeclaration({dataDir: '/outer-boundary-fixture',
  nodeId: 'outer-boundary', buildDigest: 'fixture-not-build-proof'}, DECLARED_AT);
const member = declaration.members[0];

function observe(work) {
  try {
    return {value: work()};
  } catch (error) {
    return {error};
  }
}

function refused(work, effects) {
  const result = observe(work);
  console.log(JSON.stringify({effects, code: result.error?.code,
    reason: result.error?.reason, cause: result.error?.cause?.code, value: result.value}));
  assert.deepEqual(effects, [], 'no SQL, database property or callback effect before admission');
  assert.equal(result.error?.constructor, Error);
  assert.equal(result.error.code, MISSING, 'ownership refusal remains outside domain conversion');
}

function rawDatabase(t, filename = ':memory:') {
  const effects = [];
  const db = new Database(filename, {verbose: (sql) => effects.push({sql})});
  for (const key of ['prepare', 'exec', 'transaction', 'pragma']) {
    const method = db[key].bind(db);
    db[key] = (...args) => {
      effects.push({method: key});
      return method(...args);
    };
  }
  t.after(() => db.close());
  return {db, effects};
}

function foreignDatabase(effects) {
  return new Proxy({}, {get(_target, key) {
    effects.push({get: String(key)});
    throw new Error('foreign property reached');
  }});
}

const boundaries = [
  ['readOriginalSeedRetainedEffects', (db) =>
    readOriginalSeedRetainedEffects({db, declaration, member})],
  ['detectLegacyPartitionConsensusState', (db) =>
    detectLegacyPartitionConsensusState({db, partitionId: member.groupId})],
  ['compactRaftRsCommittedEntries', (db) =>
    compactRaftRsCommittedEntries(db, member.groupId, {toIndex: 1})],
];
for (const [name, invoke] of boundaries) {
  test(`${name} admits before raw native effects or domain results`, (t) => {
    const {db, effects} = rawDatabase(t);
    refused(() => invoke(db), effects);
  });
  test(`${name} admits before foreign property getters`, () => {
    const effects = [];
    refused(() => invoke(foreignDatabase(effects)), effects);
  });
}

test('readOriginalSeedRetainedEffects refuses raw existing transaction without touching it', (t) => {
  const {db, effects} = rawDatabase(t);
  db.exec('BEGIN');
  effects.length = 0;
  refused(() => readOriginalSeedRetainedEffects({db, declaration, member}), effects);
  assert.equal(db.inTransaction, true);
});

test('readOriginalSeedRetainedEffects retains owned observation, identity and transaction results',
  (t) => {
    const sql = [];
    const db = new SQLiteConnection(':memory:', {verbose: (statement) => sql.push(statement)});
    t.after(() => db.close());
    const unavailable = readOriginalSeedRetainedEffects({db, declaration, member});
    assert.equal(unavailable.state, EFFECT.UNAVAILABLE);
    assert.equal(unavailable.reason, EFFECT_REASON.OBSERVATION);
    assert.equal(unavailable.cause.code, STORE_ERROR.RETAINED_HISTORY_UNAVAILABLE);
    assert.ok(sql.includes('BEGIN'));
    assert.ok(sql.includes('ROLLBACK'));
    assert.equal(db.inTransaction, false);
    const contrary = readOriginalSeedRetainedEffects({db, declaration,
      member: {...member, replicaId: 'another-replica'}});
    assert.equal(contrary.state, EFFECT.CONTRARY);
    assert.equal(contrary.reason, EFFECT_REASON.IDENTITY);
    db.transaction(() => {
      const result = readOriginalSeedRetainedEffects({db, declaration, member});
      assert.equal(result.state, EFFECT.UNAVAILABLE);
      assert.equal(result.reason, EFFECT_REASON.TRANSACTION);
      assert.equal(db.inTransaction, true);
    })();
  });

test('detectLegacyPartitionConsensusState preserves owned empty-schema ABSENT', (t) => {
  const db = new SQLiteConnection(':memory:');
  t.after(() => db.close());
  assert.deepEqual(detectLegacyPartitionConsensusState({db, partitionId: member.groupId}),
    {outcome: LEGACY.ABSENT, reasons: []});
});

test('rs compaction preserves owned memory, closed, index and proof refusals', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outer-compaction-'));
  const memory = new SQLiteConnection(':memory:');
  const db = new SQLiteConnection(path.join(dir, 'replica.sqlite'));
  t.after(() => {
    if (memory.open) memory.close();
    db.close();
    fs.rmSync(dir, {recursive: true, force: true});
  });
  const compact = (connection, toIndex) =>
    compactRaftRsCommittedEntries(connection, member.groupId, {toIndex});
  assert.equal(compact(memory, 1).outcome, COMPACTION.SNAPSHOT_PROTOCOL_UNAVAILABLE);
  memory.close();
  assert.equal(compact(memory, 1).outcome, COMPACTION.SNAPSHOT_PROTOCOL_UNAVAILABLE);
  const store = new RaftRsDurableStore(db);
  store.putBootstrapAppliedState(member.groupId, {voters: [member.peerId]},
    {bootstrapIndex: '0', admissionIndex: '0'});
  assert.equal(compact(db, -1).outcome, COMPACTION.INVALID_COMPACTION_INDEX);
  assert.equal(compact(db, 1).outcome, COMPACTION.SNAPSHOT_PROOF_MISSING);
});

function originalFixture(t, cold = false) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outer-original-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: 'outer-original', buildDigest: 'fixture-not-build-proof'};
  const owners = [];
  const databases = [];
  const ports = [];
  const native = [];
  const createOwner = () => {
    const owner = new RaftRsOriginalAllocationPreparation({directoryOwner, ...identity});
    owners.push(owner);
    return owner;
  };
  let preparation = createOwner();
  const declaration = preparation.prepare(createSeedOriginalAllocation({...identity,
    now: DECLARED_AT}));
  let classifications = 0;
  if (cold) {
    for (const member of declaration.members) {
      const db = new SQLiteConnection(member.dbPath, {fileMustExist: true});
      try {
        const owner = new RaftRsReplicaLifecycleOwner({db, groupId: member.groupId,
          peerId: member.peerId, replicaIdentity: member.replicaId});
        const store = new RaftRsDurableStore(db);
        commitDurably(db, () => {
          store.putBootstrapAppliedState(member.groupId, {voters: [member.peerId],
            learners: [], votersOutgoing: [], learnersNext: [], autoLeave: false},
          {bootstrapIndex: '0', admissionIndex: '0'});
          owner.recordOpeningHistory(member.incarnation);
        });
      } finally {
        db.close();
      }
    }
    preparation.close();
    preparation = createOwner();
    preparation.inspect(declaration, ({db, record}) => {
      assert.equal(db.readonly, true);
      assert.equal(record.entries.length, 0);
      classifications++;
      return ORIGINAL.HISTORY_ACCEPTED;
    });
  }
  const member = declaration.members[0];
  const opening = preparation.openingFor(member.replicaId);
  setActualCoreEntryObserver((event) => native.push(event));
  t.after(() => {
    setActualCoreEntryObserver(null);
    for (const port of ports.reverse()) port.close();
    for (const db of databases.reverse()) if (db.open) db.close();
    for (const owner of owners) owner.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  function owned(effects = []) {
    const db = new SQLiteConnection(member.dbPath, {fileMustExist: true,
      verbose: (sql) => effects.push({sql})});
    databases.push(db);
    return db;
  }
  function request(db) {
    return {[REQUEST.GROUP_ID]: member.groupId, [REQUEST.PEER_ID]: member.replicaId,
      [REQUEST.DURABLE_STORAGE]: db, [REQUEST.BOOTSTRAP_PEER_IDS]: member.replicaIds,
      [REQUEST.BOOTSTRAP_MEMBERSHIP]: cold ? durableRecordBootstrap() : member.membership,
      [REQUEST.IDENTITY_EXISTED]: cold, [REQUEST.ORIGINAL_ALLOCATION_OPENING]: opening,
      [REQUEST.TIMING]: TIMING, [REQUEST.DEFER_ELECTION]: true,
      [REQUEST.RESOLVE_PEER_ADDRESS]: (id) => `raft-rs://${id}`,
      [REQUEST.SEND_TO_PEER]: () => {}, [REQUEST.APPLY_COMMITTED_ENTRY]: () => {},
      [REQUEST.APPLY_COMMITTED_ENTRY_MODE]: APPLY.SYNCHRONOUS};
  }
  return {declaration, preparation, member, opening, owned, request, native,
    classifications: () => classifications, directoryOwner,
    port(request) {
      const port = createRaftRsOperationPort(request);
      ports.push(port);
      return port;
    }};
}

for (const cold of [false, true]) {
  for (const entry of ['port', 'opening owner']) {
    test(`${entry} ${cold ? 'cold' : 'live'} admits raw/foreign before original validation`, (t) => {
      const f = originalFixture(t, cold);
      const invoke = (request) => entry === 'port' ? f.port(request) :
        consumeOriginalAllocationOpening(f.opening, request);
      const {db, effects} = rawDatabase(t, f.member.dbPath);
      refused(() => invoke(f.request(db)), effects);
      const foreignEffects = [];
      refused(() => invoke(f.request(foreignDatabase(foreignEffects))), foreignEffects);
      const check = consumeOriginalAllocationOpening(f.opening, f.request(f.owned()));
      check(f.member.incarnation);
      assert.deepEqual(f.native, [], 'direct helper calibration does not enter native Raft');
      assert.equal(f.classifications(), cold ? f.declaration.members.length + 1 : 0);
    });
  }
}

// Unlike proxying A, changing the carrier exercises reference selection while
// both native connections keep their actual private brand.
for (const cold of [false, true]) {
  for (const replacement of ['foreign', 'owned']) {
    test(`opening owner captures ${cold ? 'cold' : 'live'} A once before ${replacement} B`, (t) => {
      const f = originalFixture(t, cold);
      const a = f.owned();
      const effects = [];
      const b = replacement === 'owned' ? f.owned(effects) : foreignDatabase(effects);
      const request = f.request(a);
      let reads = 0;
      Object.defineProperty(request, REQUEST.DURABLE_STORAGE,
        {get: () => ++reads === 1 ? a : b});
      const result = observe(() => {
        const check = consumeOriginalAllocationOpening(f.opening, request);
        check(f.member.incarnation);
        return check;
      });
      console.log(JSON.stringify({case: 'opening capture', cold, replacement, reads,
        effects, error: result.error?.message}));
      assert.equal(reads, 1);
      assert.deepEqual(effects, []);
      assert.equal(typeof result.value, 'function');
      assert.deepEqual(f.native, []);
      // Fresh owner facts on A must still refuse at the final cut.
      transitionOriginalRight({db: a, member: f.member, right: COLUMN.SERVICE_RIGHT,
        from: ORIGINAL.UNUSED, to: ORIGINAL.SUBMITTED});
      assert.throws(() => result.value(f.member.incarnation), hold(REASON.SPENT));
      assert.equal(reads, 1);
      assert.deepEqual(effects, []);
    });
  }
}

for (const replacement of ['foreign', 'owned']) {
  test(`original port retains A across construction callbacks instead of ${replacement} B`, (t) => {
    const f = originalFixture(t);
    const a = f.owned();
    const effects = [];
    const b = replacement === 'owned' ? f.owned(effects) : foreignDatabase(effects);
    const request = f.request(a);
    let reads = 0;
    Object.defineProperty(request, REQUEST.DURABLE_STORAGE,
      {get: () => ++reads === 1 ? a : b});
    assert.equal(f.port(request).readStatus().outcome, 'CORE_OK');
    assert.equal(reads, 1);
    assert.deepEqual(effects, []);
    assert.ok(f.native.some(({operation}) => operation === 'create_node'));
    assert.equal(readOriginalAllocationRow({db: a, member: f.member}).native_history_state,
      HISTORY.ESTABLISHED);
  });
}

test('opening owner retains capability, lifetime, incarnation and fresh durable checks', (t) => {
  const f = originalFixture(t);
  const db = f.owned();
  const request = f.request(db);
  assert.throws(() => consumeOriginalAllocationOpening({}, request), hold(REASON.AUTHORITY));
  const check = consumeOriginalAllocationOpening(f.opening, request);
  assert.throws(() => consumeOriginalAllocationOpening(f.opening, request),
    hold(REASON.OPENING_CONSUMED));
  assert.throws(() => check('other-incarnation'), hold(REASON.IDENTITY));
  assert.doesNotThrow(() => check(f.member.incarnation));
  db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE} SET incarnation = ? WHERE replica_identity = ?`)
    .run('other-incarnation', f.member.replicaId);
  assert.throws(() => check(f.member.incarnation), hold(REASON.IDENTITY));
  f.preparation.revoke();
  assert.throws(() => check(f.member.incarnation), hold(REASON.CLOSED));
  assert.deepEqual(f.native, []);
});

test('opening owner checks current directory custody after admission', (t) => {
  const f = originalFixture(t);
  const check = consumeOriginalAllocationOpening(f.opening, f.request(f.owned()));
  f.directoryOwner.release();
  assert.throws(() => check(f.member.incarnation), hold(REASON.DIRECTORY));
  assert.deepEqual(f.native, []);
});
