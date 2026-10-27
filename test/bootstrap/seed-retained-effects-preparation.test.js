// Actual preparation/custody and startup consumer over physical owner-built
// storage. No native runtime is entered: native replay has a separate witness.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {createSeedOriginalAllocation} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {prepareOriginalSeedAttempt, closeOriginalSeedAttempt} from
  '../../src/bootstrap/seed-original-allocation-startup.js';
import {SEED_RETAINED_EFFECT_STATE as EFFECT, SEED_RETAINED_EFFECT_REASON as EFFECT_REASON} from
  '../../src/bootstrap/seed-retained-effects-constants.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {runtimeBuildProvenance, RUNTIME_BUILD_STATE} from
  '../../src/diagnostics/runtime-build-provenance.js';
import {RaftRsOriginalAllocationPreparation} from
  '../../src/raft/raft-rs-original-allocation-preparation.js';
import {RaftRsPreparationCustody} from '../../src/raft/raft-rs-preparation-custody.js';
import {RaftRsReplicaLifecycleOwner} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_COMMIT_DURABILITY, RAFT_RS_TABLE} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {ORIGINAL_ALLOCATION as ALLOCATION, ORIGINAL_ALLOCATION_REASON as REASON} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {acquireDataDirectoryProcessOwner, ownsDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {RETAINED_STORE_ERROR} from '../../src/partition/partition-retained-store-observation.js';
import {NODE_ID, DECLARED_AT, createApplicationOwners, foundationMutation} from
  './seed-retained-effects-fixture.js';

const hold = (reason) => (error) =>
  error?.code === ALLOCATION.HOLD && error.reason === reason;

async function retainedFixture(t) {
  const build = await runtimeBuildProvenance();
  assert.equal(build.state, RUNTIME_BUILD_STATE.MEASURED);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-retained-preparation-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: NODE_ID, buildDigest: build.digest};
  const draft = createSeedOriginalAllocation({...identity, now: DECLARED_AT});
  const preparations = [];
  const startups = [];
  const nativeEntries = [];
  setActualCoreEntryObserver((entry) => nativeEntries.push(entry));
  const createPreparation = () => {
    const preparation = new RaftRsOriginalAllocationPreparation({directoryOwner, ...identity});
    preparations.push(preparation);
    return preparation;
  };
  const createStartup = () => {
    const service = {nodeId: NODE_ID, dataDirectoryManager: {getDataDir: () => dataDir},
      dataDirectoryProcessOwner: directoryOwner, startupAbortSignal: new AbortController().signal};
    startups.push(service);
    return service;
  };
  t.after(() => {
    setActualCoreEntryObserver(null);
    const errors = [];
    for (const startup of startups) {
      try {
        closeOriginalSeedAttempt(startup);
      } catch (error) {
        errors.push(error);
      }
    }
    for (const preparation of preparations) {
      try {
        preparation.close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, `custody retained at ${dataDir}`);
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  const issuer = createPreparation();
  assert.throws(() => issuer.foundationTimestamp(), hold(REASON.IDENTITY));
  // The issued declaration carries the stamps the lifecycle owner minted.
  const declaration = issuer.prepare(draft);
  assert.equal(issuer.foundationTimestamp(), DECLARED_AT,
    'the actual preparation owns the declared registration timestamp');
  issuer.close();
  return {dataDir, directoryOwner, declaration, nativeEntries, createPreparation, createStartup};
}

function withMember(member, use) {
  const db = new Database(member.dbPath, {fileMustExist: true});
  try {
    return use(db);
  } finally {
    db.close();
  }
}

function establishStorage(f, member) {
  withMember(member, (db) => {
    const lifecycle = new RaftRsReplicaLifecycleOwner({db, groupId: member.groupId,
      peerId: member.peerId, replicaIdentity: member.replicaId});
    const store = new RaftRsDurableStore(db);
    store.transaction(() => {
      store.putBootstrapAppliedState(member.groupId, {
        voters: member.replicaIds.map(deriveRaftRsPeerId), learners: [],
        votersOutgoing: [], learnersNext: [], autoLeave: false,
      }, {bootstrapIndex: '0', admissionIndex: '0'});
      lifecycle.recordOpeningHistory(member.incarnation);
    }, RAFT_RS_COMMIT_DURABILITY.SYNCED);
    if (member.serviceType === SERVICE_TYPE.PARTITION) {
      createApplicationOwners(db, f.declaration, member);
    }
  });
}

function cohortBytes(f) {
  return f.declaration.members.map((member) => {
    const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
    try {
      return {replicaId: member.replicaId,
        sha256: createHash('sha256').update(db.serialize()).digest('hex')};
    } finally {
      db.close();
    }
  });
}

function trackInspection(t, failCloseReplica = null) {
  const handles = [];
  let observation = null;
  let failure = null;
  let closeAttempts = 0;
  const closeFailure = new Error('exact retained inspection handle close failed');
  const closeMocks = [];
  const open = RaftRsPreparationCustody.prototype.open;
  t.mock.method(RaftRsPreparationCustody.prototype, 'open', function(member, options) {
    assert.deepEqual(options, {readonly: true, fileMustExist: true});
    const db = Reflect.apply(open, this, [member, options]);
    handles.push({member, db});
    if (member.replicaId === failCloseReplica) {
      closeMocks.push(t.mock.method(db, 'close', () => {
        closeAttempts++;
        throw closeFailure;
      }));
    }
    return db;
  });
  const observe = RaftRsOriginalAllocationPreparation.prototype.observeRetainedEffects;
  t.mock.method(RaftRsOriginalAllocationPreparation.prototype, 'observeRetainedEffects',
    function(declaration) {
      try {
        observation = Reflect.apply(observe, this, [declaration]);
        return observation;
      } catch (error) {
        failure = error;
        throw error;
      }
    });
  return {handles, closeFailure, observation: () => observation, failure: () => failure,
    closeAttempts: () => closeAttempts,
    restoreClose: () => closeMocks.forEach((mock) => mock.mock.restore())};
}

async function startupHold(f) {
  const service = f.createStartup();
  let error;
  await assert.rejects(prepareOriginalSeedAttempt(service), (cause) => {
    error = cause;
    return hold(REASON.CLASSIFICATION_UNAVAILABLE)(cause);
  });
  const preparation = service.originalAllocationPreparation;
  assert.ok(preparation instanceof RaftRsOriginalAllocationPreparation);
  assert.throws(() => preparation.assertCurrent(), hold(REASON.CLOSED));
  assert.throws(() => preparation.openingFor(f.declaration.members[0].replicaId),
    hold(REASON.CLOSED));
  assert.deepEqual(f.nativeEntries, [], 'diagnostic startup hold enters no native core');
  assert.equal(ownsDataDirectoryProcessOwner(f.directoryOwner, f.dataDir), true);
  return {error, service, preparation};
}

function assertClosedReads(tracked, preparation) {
  assert.ok(tracked.handles.length > 0, 'the actual read-only custody path must engage');
  assert.ok(tracked.handles.every(({db}) => db.open === false));
  assert.deepEqual(preparation.observeResources(), []);
}

test('retained startup keeps classification hold and exact preparation evidence without opening',
  async (t) => {
    const f = await retainedFixture(t);
    const [first, second] = f.declaration.members;
    assert.notEqual(first.replicaId, f.declaration.anchorReplicaId,
      'the failure target must not intercept declaration read cleanup');

    await t.test('prepare-only regression preserves the precise never-opened history refusal',
      async (t) => {
        const before = cohortBytes(f);
        const tracked = trackInspection(t);
        const {error, preparation} = await startupHold(f);
        assert.equal(error.cause, tracked.failure());
        assert.ok(hold(REASON.HISTORY)(error.cause));
        assert.equal(error.cause.detail, first.replicaId);
        assert.equal(error.detail, null);
        assertClosedReads(tracked, preparation);
        assert.deepEqual(cohortBytes(f), before);
      });

    establishStorage(f, first);
    await t.test('partial native history preserves the exact first unavailable member', async (t) => {
      const before = cohortBytes(f);
      const tracked = trackInspection(t);
      const {error, preparation} = await startupHold(f);
      assert.equal(error.cause, tracked.failure());
      assert.ok(hold(REASON.HISTORY)(error.cause));
      assert.equal(error.cause.detail, second.replicaId);
      assert.deepEqual(tracked.handles.slice(1).map(({member}) => member.replicaId),
        [first.replicaId, second.replicaId]);
      assertClosedReads(tracked, preparation);
      assert.deepEqual(cohortBytes(f), before);
    });

    for (const member of f.declaration.members.slice(1)) establishStorage(f, member);
    await t.test('complete accepted observation still has no opening or foundation-time authority',
      (t) => {
        const before = cohortBytes(f);
        const preparation = f.createPreparation();
        const tracked = trackInspection(t);
        const observations = preparation.observeRetainedEffects(f.declaration);
        assert.equal(observations, tracked.observation());
        assert.equal(observations.length, f.declaration.members.length);
        assert.ok(observations.every(({state}) => state === EFFECT.ACCEPTED));
        assert.equal(Object.isFrozen(observations), true);
        assert.deepEqual(observations.map(({replicaId}) => replicaId),
          f.declaration.members.map(({replicaId}) => replicaId));
        assert.throws(() => preparation.openingFor(first.replicaId), hold(REASON.AUTHORITY));
        assert.throws(() => preparation.foundationTimestamp(), hold(REASON.IDENTITY));
        assert.throws(() => preparation.observeRetainedEffects(f.declaration),
          hold(REASON.REENTRANT));
        assertClosedReads(tracked, preparation);
        assert.deepEqual(cohortBytes(f), before);
        assert.deepEqual(f.nativeEntries, []);
      });

    await t.test('startup preserves the complete immutable observation array as hold detail',
      async (t) => {
        const before = cohortBytes(f);
        const tracked = trackInspection(t);
        const {error, preparation} = await startupHold(f);
        assert.equal(error.detail, tracked.observation());
        assert.equal(error.cause, undefined);
        assert.equal(error.detail.length, f.declaration.members.length);
        assert.ok(error.detail.every(({state}) => state === EFFECT.ACCEPTED));
        assertClosedReads(tracked, preparation);
        assert.deepEqual(cohortBytes(f), before);
      });

    const partition = f.declaration.members.find(({tableName}) =>
      tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS);
    await t.test('contrary rows remain structured evidence without opening or repair', async (t) => {
      const mutation = foundationMutation(f.declaration, partition.tableName);
      withMember(partition, (db) => db.prepare(mutation.sql).run(...mutation.params));
      try {
        const before = cohortBytes(f);
        const tracked = trackInspection(t);
        const {error, preparation} = await startupHold(f);
        const contrary = error.detail.find(({replicaId}) => replicaId === partition.replicaId);
        assert.equal(error.detail, tracked.observation());
        assert.equal(contrary.state, EFFECT.CONTRARY);
        assert.equal(contrary.reason, EFFECT_REASON.ROWS);
        assert.equal(error.cause, undefined);
        assertClosedReads(tracked, preparation);
        assert.deepEqual(cohortBytes(f), before);
      } finally {
        withMember(partition, (db) => db.exec(`DELETE FROM ${partition.tableName}`));
      }
    });

    await t.test('unavailable application owner remains precise evidence, then restoration is reread',
      async (t) => {
        const table = '_partition_statement_outcomes';
        const schema = withMember(partition, (db) => {
          const {sql} = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(table);
          db.exec(`DROP TABLE ${table}`);
          return sql;
        });
        try {
          const before = cohortBytes(f);
          const tracked = trackInspection(t);
          const {error, preparation} = await startupHold(f);
          const unavailable = error.detail.find(({replicaId}) => replicaId === partition.replicaId);
          assert.equal(error.detail, tracked.observation());
          assert.equal(unavailable.state, EFFECT.UNAVAILABLE);
          assert.equal(unavailable.reason, EFFECT_REASON.OBSERVATION);
          assert.equal(unavailable.cause.code, RETAINED_STORE_ERROR.SCHEMA_UNAVAILABLE);
          assert.equal(unavailable.cause.table, table);
          assertClosedReads(tracked, preparation);
          assert.deepEqual(cohortBytes(f), before);
        } finally {
          withMember(partition, (db) => db.exec(schema));
        }
        const {error, preparation} = await startupHold(f);
        assert.ok(error.detail.every(({state}) => state === EFFECT.ACCEPTED));
        assert.deepEqual(preparation.observeResources(), []);
      });

    await t.test('failed exact read close retains that handle and startup preserves its cause',
      async (t) => {
        const last = f.declaration.members.at(-1);
        const before = cohortBytes(f);
        const tracked = trackInspection(t, last.replicaId);
        const {error, preparation} = await startupHold(f);
        try {
          assert.equal(error.cause, tracked.failure());
          assert.ok(error.cause instanceof AggregateError);
          assert.deepEqual(error.cause.errors, [tracked.closeFailure]);
          assert.equal(tracked.closeAttempts(), 1, 'startup must not retry failed exact close');
          assert.deepEqual(preparation.observeResources().map(({replicaId, dbPath, open}) =>
            ({replicaId, dbPath, open})),
          [{replicaId: last.replicaId, dbPath: last.dbPath, open: true}]);
          assert.ok(tracked.handles.filter(({member}) => member.replicaId !== last.replicaId)
            .every(({db}) => db.open === false));
          assert.deepEqual(cohortBytes(f), before);
        } finally {
          tracked.restoreClose();
          preparation.close();
        }
        assertClosedReads(tracked, preparation);
      });

    await t.test('inspection plus cleanup failure preserves both exact errors and directory custody',
      async (t) => {
        withMember(first, (db) => new RaftRsDurableStore(db).putHardState(first.groupId,
          {term: '1', vote: first.peerId, commit: '1'}));
        const before = cohortBytes(f);
        const tracked = trackInspection(t, first.replicaId);
        const {error, preparation} = await startupHold(f);
        try {
          assert.equal(error.cause, tracked.failure());
          assert.ok(error.cause instanceof AggregateError);
          const [primary, cleanup] = error.cause.errors;
          assert.equal(error.cause.errors.length, 2);
          assert.ok(hold(REASON.HISTORY)(primary));
          assert.equal(primary.detail, first.replicaId);
          assert.ok(primary.cause instanceof Error);
          assert.ok(cleanup instanceof AggregateError);
          assert.deepEqual(cleanup.errors, [tracked.closeFailure]);
          assert.equal(tracked.closeAttempts(), 1);
          assert.deepEqual(preparation.observeResources().map(({replicaId}) => replicaId),
            [first.replicaId]);
          assert.equal(ownsDataDirectoryProcessOwner(f.directoryOwner, f.dataDir), true);
          assert.deepEqual(cohortBytes(f), before);
        } finally {
          tracked.restoreClose();
          preparation.close();
          withMember(first, (db) => db.prepare(`DELETE FROM ${RAFT_RS_TABLE.HARD_STATE} ` +
            'WHERE group_id = ?').run(first.groupId));
        }
        assertClosedReads(tracked, preparation);
      });
  });
