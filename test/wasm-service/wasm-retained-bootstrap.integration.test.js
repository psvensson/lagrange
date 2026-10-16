import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, rmSync, copyFileSync, renameSync, readFileSync} from 'node:fs';
import {WASM_SERVICE_COMMAND_TYPE} from '../../src/wasm-service/wasm-service-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {fixtureWithHeldReconciliation as fixture, bootstrapGroup, initialization, administer} from
  './wasm-retained-bootstrap-fixture.js';

// This file does not prove metadata quorum or user serving. All native groups
// below are real raft-rs groups, with the explicitly documented component SQL backing.
test('retained manager intent opens native RF3 held without nested journal or ACTIVE routes', async (t) => {
  const f = await fixture(t);
  await bootstrapGroup(f);
  const rows = f.metadata.db.prepare('SELECT * FROM wasm_operations ORDER BY operation_id').all();
  assert.equal(rows.length, 3);
  assert.equal(new Set(f.replicas.map((r) => r.replicaId)).size, 3);
  assert.notEqual(f.groupId, f.metadata.serviceId);
  for (const host of f.hosts) {
    const row = rows.find((r) => r.operation_id === host.intent.consensusSlotRequest.operationId);
    assert.equal(row.state, 'in_progress');
    assert.equal(host.result.operationId, row.operation_id);
    assert.deepEqual(JSON.parse(row.intent_json), host.intent);
    assert.deepEqual(JSON.parse(row.admission_json), host.result.consensusResourceToken);
    assert.deepEqual(host.publications, []);
    const root = host.replica.db.prepare('SELECT binding FROM _wasm_creation_root').get();
    assert.deepEqual(JSON.parse(root.binding), host.intent.consensusBinding);
    const local = host.replica.db.prepare('SELECT record FROM _wasm_creation_local').get();
    assert.equal(JSON.parse(local.record).phase, 'ADMITTED');
    assert.equal(JSON.parse(local.record).replicaId, host.replica.replicaId);
    assert.equal(host.replica.writerState.meta().initialization, null);
    assert.equal(host.replica.timerManager.activeTimers.size, 0);
    assert.equal(host.replica.pendingLeaderNodeUpdate, null,
      'HELD_GENESIS_QUEUED_LEADER_PUBLICATION');
    const rejected = await host.replica.handleMessage({operation: 'read', sessionId: 's', key: 'k'});
    assert.equal(rejected.reason, 'WRITER_NOT_READY');
  }
  t.diagnostic(JSON.stringify({scope: 'native WASM RF3, component metadata/journal',
    groupId: f.groupId, replicas: f.replicas.map((r) => r.replicaId),
    operationRows: rows.length, status: 'BOOTSTRAPPED_HELD'}));
});

test('common creation root refuses another INIT incarnation before any writer is initialized', async (t) => {
  const f = await fixture(t);
  await bootstrapGroup(f);
  const init = initialization(f.metadata.intent.consensusBinding);
  const invalid = {...init, incarnation: 'f'.repeat(64)};
  const rejected = await administer(f, invalid);
  assert.equal(rejected.status, 'REFUSED');
  assert.equal(rejected.reason, 'WRITER_INCARNATION_MISMATCH');
  for (const replica of f.replicas) {
    assert.equal(replica.writerState.meta().initialization, null);
  }
  const recorded = await administer(f, init);
  assert.equal(recorded.status, 'RECORDED');
  for (const host of f.hosts) {
    assert.equal(host.replica.writerState.meta().initialization.command.incarnation,
      init.incarnation);
    assert.deepEqual(host.publications, []);
    const result = await f.bootstrap(host);
    assert.equal(result.status, 'BOOTSTRAPPED_HELD');
  }
});

test('reentering physical bootstrap uses one operation, resource ordinal and exact replica', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  const first = await f.bootstrap(host);
  assert.equal(first.status, 'BOOTSTRAPPED_HELD');
  const replica = host.replica;
  const again = await f.bootstrap(host);
  assert.deepEqual(again, first);
  assert.equal(host.replica, replica);
  assert.equal(f.metadata.db.prepare('SELECT count(*) n FROM wasm_operations').get().n, 1);
  assert.equal(f.metadata.state().selected.resources[0].ordinal, 1);
  assert.deepEqual(host.publications, []);
});

test('shutdown during authoritative opening cannot leave a late native handle or handler', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  const original = f.metadata.primary.resolveInstanceResource.bind(f.metadata.primary);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  f.metadata.primary.resolveInstanceResource = async (...args) => {
    const answer = await original(...args);
    if (host.lifecycle.getReplica(f.metadata.serviceId)) {
      entered.resolve();
      await release.promise;
    }
    return answer;
  };
  const pending = f.bootstrap(host);
  await entered.promise;
  const replica = host.lifecycle.getReplica(f.metadata.serviceId);
  const stopped = host.lifecycle.stopReplica(f.metadata.serviceId);
  release.resolve();
  const result = await pending;
  await stopped;
  assert.notEqual(result.status, 'BOOTSTRAPPED_HELD');
  assert.equal(replica.db, null);
  assert.equal(replica.raft, null);
  assert.equal(replica.transportHandler, null);
  assert.equal(existsSync(replica.dbPath), false);
  assert.deepEqual(host.publications, []);
});

test('bound bootstrap rejects a driver running claim instead of publishing it', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  host.driver.start = async () => ({status: 'running', endpointIntent: {port: 8080}});
  const answer = await f.bootstrap(host);
  assert.notEqual(answer.status, 'BOOTSTRAPPED_HELD');
  assert.deepEqual(host.publications, []);
  assert.equal(f.metadata.row().state, 'in_progress');
});


test('a known opening with lost application storage cannot become a fresh peer', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  const dbPath = host.replica.dbPath;
  await host.lifecycle.stopReplica(f.metadata.serviceId);
  rmSync(dbPath);
  const answer = await f.bootstrap(host);
  assert.notEqual(answer.status, 'BOOTSTRAPPED_HELD', 'LOST_STORAGE_REOPENED_AS_FRESH');
  assert.equal(existsSync(dbPath), false, 'REFUSED_RECOVERY_RECREATED_MISSING_DATABASE');
  assert.equal(f.metadata.state().selected.resources[0].ordinal, 1);
  assert.deepEqual(host.publications, []);
});

test('removing a bound common root cannot turn writer admission into an unbound INIT', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  host.replica.db.exec('DROP TABLE _wasm_creation_root');
  assert.throws(() => host.replica.writerState.classify(
    initialization(host.intent.consensusBinding)),
  undefined, 'MISSING_BOUND_ROOT_BECAME_UNBOUND_INIT');
  assert.equal(host.replica.writerState.meta().initialization, null);
});

test('held admission applies to direct read and write owners, not just the transport dispatcher', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  const read = host.replica._handleRead({sessionId: 'session', key: 'key'});
  const write = await host.replica._handleWrite({sessionId: 'session', key: 'key', value: 'value'});
  assert.equal(read.reason, 'WRITER_NOT_READY', 'DIRECT_READ_BYPASSED_HELD_ADMISSION');
  assert.equal(write.reason, 'WRITER_NOT_READY', 'DIRECT_WRITE_BYPASSED_HELD_ADMISSION');
  for (const type of Object.values(WASM_SERVICE_COMMAND_TYPE)) {
    await assert.rejects(host.replica.proposeEntry({type}),
      (error) => error.reason === 'WRITER_NOT_READY',
      'DIRECT_COMMAND_BYPASSED_HELD_ADMISSION');
  }
});

test('runtime shutdown closes its actual held consensus resource before clearing bookkeeping', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  const replica = host.replica;
  await host.runtime.shutdown();
  assert.equal(replica.db, null, 'RUNTIME_SHUTDOWN_ORPHANED_HELD_DATABASE');
  assert.equal(replica.raft, null);
  assert.equal(replica.transportHandler, null);
  assert.equal(host.driver._lifecycles.size, 0);
  assert.equal(f.metadata.row().state, 'in_progress');
  assert.equal(f.metadata.state().selected.resources[0].phase, 'ADMITTED');
});

test('runtime shutdown propagates failed consensus cleanup and keeps driver custody', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  const original = host.lifecycle.shutdownAll.bind(host.lifecycle);
  const cause = new Error('injected held native cleanup refusal');
  host.lifecycle.shutdownAll = async () => {
    throw cause;
  };
  t.after(() => {
    host.lifecycle.shutdownAll = original;
  });
  try {
    await assert.rejects(host.runtime.shutdown(), (error) =>
      error.errors?.some((failure) => failure === cause || failure.errors?.includes(cause)),
    'CLEANUP_FAILURE_WAS_HIDDEN');
  } finally {
    host.lifecycle.shutdownAll = original;
  }
  assert.equal(host.driver._lifecycles.get(f.metadata.serviceId), host.lifecycle);
  assert.ok(host.replica.db.open);
  // Release the deliberate test fault through the same real owner for cleanup.
  host.lifecycle.shutdownAll = original;
});


test('an intact original file reopens the same native history and remains held', async (t) => {
  const f = await fixture(t);
  await bootstrapGroup(f);
  assert.equal((await administer(f, initialization(f.metadata.intent.consensusBinding))).status,
    'RECORDED');
  const before = f.hosts.map((host) => ({
    peer: host.replica.replicaId,
    initialization: host.replica.writerState.meta().initialization,
    applied: RaftRsDurableStore.readDurableRecordIn(host.replica.db, f.groupId).appliedIndex,
    token: host.result.consensusResourceToken,
  }));
  for (const host of f.hosts) await host.lifecycle.stopReplica(f.metadata.serviceId);
  for (const [index, host] of f.hosts.entries()) {
    assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
    assert.equal(host.replica.replicaId, before[index].peer);
    assert.deepEqual(host.replica.writerState.meta().initialization, before[index].initialization);
    const durable = RaftRsDurableStore.readDurableRecordIn(host.replica.db, f.groupId);
    assert.equal(durable.appliedIndex, before[index].applied);
    assert.deepEqual(host.result.consensusResourceToken, before[index].token);
    assert.deepEqual(host.publications, []);
  }
  assert.equal(f.metadata.db.prepare('SELECT count(*) n FROM wasm_operations').get().n, 3);
});

test('copying application bytes into a different file does not copy local opening identity', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  const path = host.replica.dbPath;
  await host.lifecycle.stopReplica(f.metadata.serviceId);
  const before = readFileSync(path);
  copyFileSync(path, `${path}.copy`);
  rmSync(path);
  renameSync(`${path}.copy`, path);
  assert.ok(readFileSync(path).equals(before), 'the copy has the actual original application bytes');
  const result = await f.bootstrap(host);
  assert.notEqual(result.status, 'BOOTSTRAPPED_HELD', 'COPIED_LOCAL_RECORD_OPENED_A_NEW_FILE');
  assert.equal(host.replica.db, null);
  assert.equal(host.replica.raft, null);
  assert.deepEqual(host.publications, []);
});

test('an applied first-opening claim with a lost reply resolves the same claim once', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  let claims = 0;
  host.manager.setOperationWriter(async (sql, params) => {
    const result = await f.metadata.writer(sql, params);
    if (/SET opening_json =/u.test(sql)) {
      claims += 1;
      throw new Error('APPLIED_FIRST_OPENING_REPLY_LOST');
    }
    return result;
  });
  assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  const first = JSON.parse(f.metadata.row().opening_json);
  assert.equal((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  assert.deepEqual(JSON.parse(f.metadata.row().opening_json), first);
  assert.equal(claims, 1);
});

test('uncertain first opening never recreates an unwitnessed missing application file', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  let claimWritten = false;
  host.manager.setOperationWriter(async (sql, params) => {
    const result = await f.metadata.writer(sql, params);
    if (/SET opening_json =/u.test(sql)) claimWritten = true;
    return result;
  });
  host.manager.setIdempotencyReader(async (sql, params) => {
    if (claimWritten) throw new Error('FIRST_OPENING_RESOLUTION_UNAVAILABLE');
    return f.metadata.reader(sql, params);
  });
  assert.notEqual((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  assert.ok(JSON.parse(f.metadata.row().opening_json).claimId);
  assert.equal(existsSync(host.replica.dbPath), false);
  host.manager.setIdempotencyReader(f.metadata.reader);
  assert.notEqual((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  assert.equal(existsSync(host.replica.dbPath), false, 'AMBIGUOUS_OPENING_INVENTED_FRESH_PERMISSION');
  assert.equal(f.metadata.row().state, 'in_progress');
});

test('a held driver answer must carry the original binding and token, not just a status', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  host.driver.start = async (context) => ({status: 'BOOTSTRAPPED_HELD',
    consensusBinding: context.consensusCreation.intent.consensusBinding,
    consensusResourceToken: {...context.consensusCreation.token, ordinal: 999}});
  assert.notEqual((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  assert.deepEqual(host.publications, []);
});

test('whole-runtime shutdown closes new bound admission even before the first prepare', async (t) => {
  const f = await fixture(t);
  const host = await f.addHost(0);
  await host.runtime.shutdown();
  assert.notEqual((await f.bootstrap(host)).status, 'BOOTSTRAPPED_HELD');
  assert.equal(host.lifecycle.getReplica(f.metadata.serviceId), null);
  assert.deepEqual(host.publications, []);
});
