import {createRaftOperationPort} from '../../../src/raft/raft-operation-port.js';
import {closeMessageGroupConsensus} from '../../../src/message-group/message-group-consensus-port.js';
import {closeWasmServiceConsensus} from '../../../src/wasm-service/wasm-service-consensus-port.js';
import {SessionKVStore} from '../../../src/wasm-service/session-kv-store.js';
// PR117: production initialization consumes the real runtime's opening refusal.
// No constructor is stubbed. A shared-core trap is injected through the existing
// native-call seam; the three service initializers and their cleanup are real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {PARTITION_CONSENSUS_STARTUP_OUTCOME} from '../../../src/partition/partition-service-constants.js';
import {MessageGroupService} from '../../../src/message-group/message-group-service.js';
import {MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME} from '../../../src/message-group/constants.js';
import {WasmServiceReplica} from '../../../src/wasm-service/wasm-service-replica.js';
import {WASM_SERVICE_ERROR_MSG, WASM_SERVICE_COMMAND_TYPE} from '../../../src/wasm-service/wasm-service-constants.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {genesisStamp} from '../../../src/raft/raft-committed-membership-stamp.js';
import {createRaftRsOperationPort} from '../../../src/raft/raft-rs-operation-port.js';
import {RaftRsPeerIdentityRegistry} from '../../../src/raft/raft-rs-peer-identity.js';
import {raftRsMembershipAdministration} from '../../../src/raft/raft-rs-membership-administration.js';
import {setCoreFaultInjector, setActualCoreEntryObserver} from '../../../src/raft/raft-rs-runtime-owner.js';
import {RUNTIME_PHASE, RUNTIME_REASON} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME, RAFT_MEMBERSHIP_RESERVATION_OUTCOME as RESERVATION} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_TABLE} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from '../../../src/raft/raft-committed-membership-constants.js';
import {TEST_BOOT_INCARNATION} from '../../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'opening-refusal-node';
const EXISTING_GROUP = 'opening-refusal-survivor';
const EXISTING_REPLICA = 'opening-refusal-survivor-r1';
const JOINER = 'opening-refusal-joining-identity';
const KINDS = ['partition', 'message-group', 'wasm-service'];

async function createFixture(t) {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, raft: {
    heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300,
  }});
  LoggingService.getInstance().initialize({level: 'error'});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-opening-refusal-'));
  const clock = new VirtualTimeSource({startMs: 1000});
  const router = new MessageRouter({nodeId: NODE_ID, wsPort: 0,
    bootIncarnation: TEST_BOOT_INCARNATION, timeSource: clock});
  await router.initialize({startServer: false});
  const survivor = new PartitionNodeCluster({partitionId: EXISTING_GROUP,
    replicaIds: [EXISTING_REPLICA], substrateFor: () => ({timeSource: clock})});
  const port = survivor.node(EXISTING_REPLICA);
  const services = [];
  const databases = [];
  const entries = [];
  setActualCoreEntryObserver((entry) => entries.push(entry));
  t.after(async () => {
    setCoreFaultInjector(null);
    for (const service of services.reverse()) await service.shutdown();
    survivor.dispose();
    for (const database of databases) if (database.open) database.close();
    await router.shutdown();
    setActualCoreEntryObserver(null);
    fs.rmSync(directory, {recursive: true, force: true});
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  assert.equal((await port.campaign()).outcome, OUTCOME.CORE_OK);
  assert.equal((await port.propose('before-opening-refusal')).outcome, OUTCOME.CORE_OK);
  const initial = port.readStatus();
  let traps = 0;
  const trap = async () => {
    setCoreFaultInjector((groupId, operation) => {
      if (groupId === EXISTING_GROUP && operation === 'propose') {
        setCoreFaultInjector(null); traps += 1;
        throw new globalThis.WebAssembly.RuntimeError('opening-refusal core-boundary trap');
      }
    });
    assert.equal((await port.propose('must-not-commit')).outcome, OUTCOME.CORE_FATAL);
    assert.equal(traps, 1, 'a real contained native fault must engage');
  };
  return {directory, clock, router, survivor, port, services, databases, entries, initial, trap};
}

function buildService(fixture, kind) {
  const id = `opening-${kind}`;
  const replicaId = `${id}-r1`;
  const options = {nodeId: NODE_ID, replicaId, replicaIds: [replicaId],
    dbPath: path.join(fixture.directory, `${id}.db`), transport: fixture.router,
    timeSource: fixture.clock, deferElection: true, systemTableCache: new SystemTableCache()};
  let service;
  if (kind === 'partition') {
    service = new PartitionService({...options, partitionId: id, tableId: `${id}-table`,
      tableName: 'opening_refusal_rows', bootstrapMembership: genesisStamp([replicaId])});
  } else if (kind === 'message-group') {
    service = new MessageGroupService({...options, groupId: id});
  } else {
    service = new WasmServiceReplica({...options, serviceDefinitionId: id});
  }
  fixture.services.push(service);
  return service;
}

function assertInitializationRefusal(kind, error, replicaId, shared = null) {
  assert.ok(error, 'initialization must refuse, not silently return');
  assert.equal(error.consensus?.outcome, OUTCOME.HOST_FAILURE);
  assert.equal(error.consensus.phase, shared?.phase ?? RUNTIME_PHASE.RUNTIME_REPLACEMENT);
  assert.equal(error.consensus.reason, shared?.reason ?? RUNTIME_REASON.REPLACEMENT_IN_PROGRESS);
  assert.equal(error.consensus.retryAfterMs, shared?.retryAfterMs ?? 0,
    'startup carries the original shared retry remainder without renewal');
  assert.equal(error.consensus.retryable, true);
  assert.equal(error.consensus.recoveryRequired, true);
  assert.equal(error.consensus.replicaIdentity, replicaId);
  assert.equal(Object.isFrozen(error.consensus), true, 'the owner answer is retained as immutable data');
  if (kind === 'partition') {
    assert.equal(error.code, PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
      'partition initialize must expose its existing typed refusal');
  } else if (kind === 'message-group') {
    assert.equal(error.code, MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
      'message-group initialize must expose its existing typed refusal');
  } else {
    assert.equal(error.message, WASM_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED,
      'WASM initialize must expose its existing startup refusal');
    assert.equal(error.replicaId, replicaId);
  }
}

for (const kind of KINDS) {
  for (const backoff of [false, true]) {
    test(`native runtime opening: ${kind} ${backoff ? 'backoff' : 'unhealthy'} initialization is typed, cleans up, and can retry`, async (t) => {
      const fixture = await createFixture(t);
      await fixture.trap();
      let shared = null;
      if (backoff) {
        let restoreTraps = 0;
        setCoreFaultInjector((groupId, operation) => {
          if (groupId === EXISTING_GROUP && operation === 'create_node') {
            setCoreFaultInjector(null); restoreTraps += 1;
            throw new globalThis.WebAssembly.RuntimeError('opening-refusal restoration trap');
          }
        });
        shared = await fixture.port.readStatus();
        assert.equal(restoreTraps, 1, 'the native restoration fault must establish shared backoff');
        assert.equal(shared.outcome, OUTCOME.HOST_FAILURE);
        assert.ok(shared.retryAfterMs > 0, 'a real shared retry window must engage');
      }
      const service = buildService(fixture, kind);
      const before = fixture.entries.length;
      let refused;
      try {
        await service.initialize();
      } catch (error) {
        refused = error;
      }
      assertInitializationRefusal(kind, refused, service.replicaId, shared);
      assert.equal(fixture.entries.length, before, 'a refused new opening never drives shared reconstruction');
      assert.ok(service.raft === null || service.raft === undefined,
        'no refused port remains owned by the service');
      assert.ok(service.db === null || service.db.open === false, 'initialization releases its database');
      assert.equal(raftRsMembershipAdministration.reservePeerIdentity({
        groupId: `opening-${kind}`, localReplicaIdentity: service.replicaId, joiningReplicaIdentity: JOINER,
      }).outcome, RESERVATION.NOT_MANAGED, 'failed startup leaves no membership reservation owner');
      if (shared !== null) fixture.clock.advance(shared.retryAfterMs);
      const recovered = await fixture.port.readStatus();
      assert.equal(recovered.outcome, OUTCOME.CORE_OK);
      assert.equal(recovered.runtimeGeneration,
        fixture.initial.runtimeGeneration + (backoff ? 2 : 1));
      const successor = buildService(fixture, kind);
      await successor.initialize();
      assert.equal((await successor.raft.readStatus()).outcome, OUTCOME.CORE_OK,
        'a legitimate new instance opens on the same durable file after shared recovery');
      assert.equal((await fixture.port.propose('after-opening-refusal')).outcome, OUTCOME.CORE_OK);
      assert.deepEqual(fixture.survivor.replica(EXISTING_REPLICA).appliedCommands,
        ['before-opening-refusal', 'after-opening-refusal'], 'the original group keeps its committed operation sequence');
    });
  }
}

for (const phase of ['unhealthy', 'replacing']) {
  for (const collision of [false, true]) {
    test(`native runtime opening: ${phase} refusal preserves ${collision ? 'an existing' : 'absence of a'} reservation owner`, async (t) => {
      const fixture = await createFixture(t);
      const groupId = collision ? EXISTING_GROUP : 'refused-new-group';
      const replicaId = collision ? EXISTING_REPLICA : 'refused-new-replica';
      const database = new Database(path.join(fixture.directory, 'refused.db'));
      database.pragma('journal_mode = WAL'); database.pragma('synchronous = FULL');
      fixture.databases.push(database);
      const request = {...fixture.survivor.replica(EXISTING_REPLICA).request,
        groupId, peerId: replicaId, peerAddress: replicaId, bootstrapPeerIds: [replicaId],
        bootstrapMembership: genesisStamp([replicaId]), durableStorage: database};
      await fixture.trap();
      let attempts = 0;
      const attempt = () => {
        attempts += 1;
        const before = fixture.entries.length;
        let refused;
        try {
          createRaftRsOperationPort(request);
        } catch (error) {
          refused = error;
        }
        assert.equal(refused?.consensus?.outcome, OUTCOME.HOST_FAILURE);
        assert.equal(refused.consensus.phase, RUNTIME_PHASE.RUNTIME_REPLACEMENT);
        assert.equal(fixture.entries.length, before, 'new opening enters no native primitive');
      };
      if (phase === 'unhealthy') attempt();
      else {
        setCoreFaultInjector((gid, operation) => {
          if (gid === EXISTING_GROUP && operation === 'create_node') {
            setCoreFaultInjector(null); attempt();
          }
        });
        assert.equal((await fixture.port.readStatus()).outcome, OUTCOME.CORE_OK);
      }
      assert.equal(attempts, 1, 'the intended constructor window engaged once');
      const reserved = raftRsMembershipAdministration.reservePeerIdentity({
        groupId, localReplicaIdentity: replicaId, joiningReplicaIdentity: JOINER});
      if (collision) {
        assert.equal(reserved.outcome, RESERVATION.RESERVED);
        const original = new RaftRsPeerIdentityRegistry(
          fixture.survivor.replica(EXISTING_REPLICA).db);
        assert.equal(original.raftPeerIdOf(JOINER), reserved.peerId,
          'a refused same-name opening must not replace the live reservation owner');
        assert.equal(new RaftRsPeerIdentityRegistry(database).raftPeerIdOf(JOINER), null,
          'a refused constructor cannot receive another generation\'s admission work');
      } else {
        assert.equal(reserved.outcome, RESERVATION.NOT_MANAGED,
          'no failed constructor may publish a membership reservation owner');
      }
      assert.equal((await fixture.port.readStatus()).outcome, OUTCOME.CORE_OK);
    });
  }
}

// User ownership audit finding 2. The lifecycle row is deliberately retained
// while only the native history is lost; application bytes are not invented.
for (const loseHistory of [false, true]) {
  test(`WASM opening history: ${loseHistory ? 'lost record refuses' : 'intact restart restores'} after a real commit`, async (t) => {
    const fixture = await createFixture(t);
    const first = buildService(fixture, 'wasm-service');
    await first.initialize();
    assert.equal((await first.raft.campaign()).outcome, OUTCOME.CORE_OK);
    await first.proposeEntry({type: WASM_SERVICE_COMMAND_TYPE.KV_SET,
      sessionId: 'history-session', key: 'marker', value: 'committed-before-restart'});
    assert.deepEqual(first.kvStore.get('history-session', 'marker'),
      Buffer.from('committed-before-restart'));
    const committed = await first.raft.readStatus();
    assert.ok(committed.commitIndex > 0, 'actual native history must exist');
    await first.shutdown();
    const db = new Database(first.dbPath);
    const lifecycle = db.prepare('SELECT * FROM _raft_rs_replica_lifecycle').get();
    assert.equal(lifecycle.state, 'active');
    if (loseHistory) {
      db.transaction(() => {
        for (const table of Object.values(RAFT_RS_TABLE)) {
          db.prepare(`DELETE FROM ${table} WHERE group_id = ?`).run(first.serviceDefinitionId);
        }
      })();
    }
    assert.deepEqual(db.prepare('SELECT * FROM _raft_rs_replica_lifecycle').get(), lifecycle,
      'fault injection must preserve the existing lifecycle authority byte-for-byte');
    db.close();
    const successor = buildService(fixture, 'wasm-service');
    const entries = fixture.entries.length;
    if (loseHistory) {
      let failure;
      try {
        await successor.initialize();
      } catch (error) {
        failure = error;
      }
      assert.ok(failure, 'surviving lifecycle history must not be reopened as fresh genesis');
      assert.equal(failure.consensus?.reason, COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED);
      assert.equal(fixture.entries.length, entries, 'lost history must refuse before native entry');
      assert.ok(successor.db === null || !successor.db.open, 'refusal releases its database');
    } else {
      await successor.initialize();
      assert.deepEqual(successor.kvStore.get('history-session', 'marker'),
        Buffer.from('committed-before-restart'));
      assert.equal((await successor.raft.readStatus()).lifecycleIncarnation,
        committed.lifecycleIncarnation, 'an intact restart preserves the durable generation');
    }
  });
}


// PR117 cleanup-failure review: the primary native refusal must survive a
// failed release, and the existing service must keep custody until shutdown
// can finish. The fault wraps an actual SQLite close, not a fake consensus path.
for (const kind of KINDS) {
  for (const afterEffect of [false, true]) {
    test(`startup cleanup custody: ${kind} SQLite close ${afterEffect ? 'after' : 'before'} effect retains both failures and retries`, async (t) => {
      const fixture = await createFixture(t);
      const service = buildService(fixture, kind);
      await fixture.trap();
      let restorationTraps = 0;
      setCoreFaultInjector((groupId, operation) => {
        if (groupId === EXISTING_GROUP && operation === 'create_node') {
          setCoreFaultInjector(null); restorationTraps += 1;
          throw new globalThis.WebAssembly.RuntimeError('cleanup refusal retry-window trap');
        }
      });
      const shared = await fixture.port.readStatus();
      assert.equal(restorationTraps, 1);
      assert.equal(shared.outcome, OUTCOME.HOST_FAILURE);
      assert.ok(shared.retryAfterMs > 0);
      const entries = fixture.entries.length;
      const originalClose = Database.prototype.close;
      const cleanupError = new Error(`injected ${kind} SQLite release failure`);
      let captured = null;
      let attempts = 0;
      let healed = false;
      Database.prototype.close = function() {
        if (this.name === service.dbPath) {
          captured = this;
          attempts += 1;
          if (!healed) {
            if (afterEffect) originalClose.call(this);
            throw cleanupError;
          }
        }
        return originalClose.call(this);
      };
      try {
        let failure;
        try {
          await service.initialize();
        } catch (error) {
          failure = error;
        }
        assert.ok(captured, 'actual service database release must be reached');
        assert.equal(attempts, 1, 'one real cleanup attempt, not a retry loop');
        assertInitializationRefusal(kind, failure, service.replicaId, shared);
        assert.ok(failure instanceof AggregateError, 'secondary cleanup failure must remain visible');
        assert.equal(failure.errors.length, 2);
        assert.equal(failure.cause, failure.errors[0], 'the primary refusal is the cause');
        assert.equal(failure.errors[1], cleanupError, 'retain the exact cleanup error');
        assert.equal(failure.consensus, failure.errors[0].consensus,
          'never rebuild or renew the immutable owner answer');
        assert.equal(service.db, captured, 'owner retains exact handle until release is confirmed');
        assert.equal(captured.open, !afterEffect);
        assert.equal(fixture.entries.length, entries, 'refused opening/cleanup enters no core');
        // Even after runtime healing, unfinished local cleanup cannot admit a
        // second opening that would overwrite its retained connection.
        fixture.clock.advance(shared.retryAfterMs);
        assert.equal((await fixture.port.readStatus()).outcome, OUTCOME.CORE_OK);
        await assert.rejects(service.initialize(), (error) => error === failure,
          'pending cleanup refuses initialize with the retained failure');
        assert.equal(service.db, captured);
        assert.equal(attempts, 1, 'an initialize call cannot drive a second cleanup algorithm');
        healed = true;
        await service.shutdown();
        await service.shutdown();
        assert.equal(captured.open, false, 'existing shutdown eventually releases its connection');
        assert.equal(service.db, null);
        assert.ok(service.raft == null);
        const successor = buildService(fixture, kind);
        await successor.initialize();
        assert.equal(successor.raft.readStatus().outcome, OUTCOME.CORE_OK,
          'ordinary fresh instance reopens the same file after cleanup');
        await successor.shutdown();
      } finally {
        healed = true;
        Database.prototype.close = originalClose;
        // Baseline failures can drop custody; rescue only for test teardown,
        // never count this out-of-owner release as a positive witness.
        try {
          await service.shutdown();
        } finally {
          if (captured?.open) originalClose.call(captured);
        }
      }
    });
  }
}

for (const kind of ['partition', 'wasm-service']) {
  test(`startup cleanup custody: ${kind} earlier cleanup stage retains primary and remaining releases`, async (t) => {
    const fixture = await createFixture(t);
    const service = buildService(fixture, kind);
    await fixture.trap();
    const holder = kind === 'partition' ? service.roleMutationHelper : SessionKVStore.prototype;
    const method = kind === 'partition' ? 'shutdown' : 'close';
    const original = holder[method];
    const cleanupError = new Error(`injected ${kind} earlier release failure`);
    let attempts = 0;
    let healed = false;
    holder[method] = function(...args) {
      attempts += 1;
      if (!healed) throw cleanupError;
      return original.apply(this, args);
    };
    try {
      let failure;
      try {
        await service.initialize();
      } catch (error) {
        failure = error;
      }
      assert.equal(attempts, 1, 'the claimed existing release stage must engage');
      assertInitializationRefusal(kind, failure, service.replicaId);
      assert.ok(failure instanceof AggregateError);
      assert.equal(failure.errors[1], cleanupError);
      await assert.rejects(service.initialize(), (error) => error === failure);
      healed = true;
      await service.shutdown();
      assert.equal(service.db, null);
      if (kind === 'wasm-service') assert.equal(service.kvStore, null);
      assert.ok(service.raft == null);
    } finally {
      healed = true; holder[method] = original;
      await service.shutdown();
    }
  });
}


for (const [kind, close] of [['message-group', closeMessageGroupConsensus], ['wasm-service', closeWasmServiceConsensus]]) {
  test(`startup cleanup custody: ${kind} concurrent release joins and retains rejected port before database`, async () => {
    // Contract-level release witness. Real SQLite, a controllable asynchronous
    // port-close boundary; this is not a native Raft fault witness.
    const db = new Database(':memory:');
    let attempts = 0;
    let finish;
    const cleanupError = new Error('port release refused before effect');
    const service = {db, raft: {close() {
      attempts += 1;
      return new Promise((resolve, reject) => {
        finish = {resolve, reject};
      });
    }}};
    const original = service.raft;
    const first = close(service);
    const second = close(service);
    const outcomes = Promise.allSettled([first, second]);
    const pending = {attempts, port: service.raft, db: service.db, open: db.open};
    finish.reject(cleanupError);
    const refused = await outcomes;
    assert.equal(pending.attempts, 1, 'concurrent cleanup has one release owner and one attempt');
    assert.equal(pending.port, original, 'pending port release retains exact custody');
    assert.equal(pending.db, db);
    assert.equal(pending.open, true, 'database cannot close before the port releases it');
    assert.ok(refused.every((result) => result.status === 'rejected' && result.reason === cleanupError));
    assert.equal(service.raft, original);
    assert.equal(service.db, db);
    const third = close(service);
    const fourth = close(service);
    assert.equal(attempts, 2, 'one subsequent shared retry, not one per caller');
    finish.resolve();
    await Promise.all([third, fourth]);
    assert.equal(db.open, false);
    assert.equal(service.raft, null);
    assert.equal(service.db, null);
  });
}

for (const afterEffect of [false, true]) {
  test(`startup cleanup custody: WASM transport retirement ${afterEffect ? 'after' : 'before'} effect remains nonterminal and retries exact identity`, async (t) => {
    const fixture = await createFixture(t);
    const service = buildService(fixture, 'wasm-service');
    await service.initialize();
    const handler = fixture.router.getRegisteredHandler(service.unifiedAddress);
    assert.equal(typeof handler, 'function');
    const db = service.db;
    const originalUnregister = fixture.router.unregisterExact;
    const cleanupError = new Error('injected exact handler retirement failure');
    let calls = 0;
    let healed = false;
    fixture.router.unregisterExact = function(address, candidate) {
      if (address === service.unifiedAddress && candidate === handler) {
        calls += 1;
        if (!healed) {
          if (afterEffect) originalUnregister.call(this, address, candidate);
          throw cleanupError;
        }
      }
      return originalUnregister.call(this, address, candidate);
    };
    try {
      await assert.rejects(service.shutdown(), (error) => error === cleanupError);
      assert.equal(calls, 1);
      assert.equal(service.lifecycleState, 'cleanup-required', 'failed teardown is not STOPPED');
      assert.equal(service.live, true, 'host cannot replace an instance that still owns cleanup');
      assert.equal(service.transportHandler, handler, 'keep the exact identity for a retry');
      assert.equal(service.db, db);
      assert.equal(db.open, true);
      await assert.rejects(service.initialize());
      healed = true;
      const successorHandler = () => undefined;
      // A newer handler identity at the same address must survive old cleanup.
      fixture.router.register(service.unifiedAddress, successorHandler);
      await service.shutdown();
      assert.equal(service.lifecycleState, 'stopped');
      assert.equal(service.db, null);
      assert.equal(service.transportHandler, null);
      assert.equal(fixture.router.getRegisteredHandler(service.unifiedAddress), successorHandler);
      originalUnregister.call(fixture.router, service.unifiedAddress, successorHandler);
      assert.equal(db.open, false);
    } finally {
      healed = true; fixture.router.unregisterExact = originalUnregister;
      await service.shutdown();
      // An old STOPPED-on-failure implementation may have abandoned these
      // handles. Test teardown rescue is not owner-driven release evidence.
      service.raft?.close();
      if (db.open) db.close();
    }
  });
}

test('startup cleanup custody: WASM stop-activity failure is reported after owned release without falsely completing shutdown', async (t) => {
  const fixture = await createFixture(t);
  const service = buildService(fixture, 'wasm-service');
  await service.initialize();
  const original = service.roleMutationHelper.shutdown;
  const failure = new Error('injected activity-stop failure');
  let healed = false;
  service.roleMutationHelper.shutdown = function() {
    if (!healed) throw failure;
    return original.call(this);
  };
  try {
    await assert.rejects(service.shutdown(), (error) => error === failure);
    // Join any in-flight release; it must report the same incomplete activity
    // rather than claiming all obligations settled.
    await assert.rejects(service.lifecycleSettlement, (error) => error === failure);
    assert.equal(service.lifecycleState, 'cleanup-required');
    assert.equal(service.db, null);
    assert.equal(service.raft, null);
    healed = true;
    await service.shutdown();
    assert.equal(service.lifecycleState, 'stopped');
  } finally {
    healed = true; service.roleMutationHelper.shutdown = original;
    await service.shutdown();
  }
});


for (const edge of ['status', 'campaign']) {
  test(`startup cleanup custody: partition ${edge} refusal uses the same cleanup boundary`, async (t) => {
    const fixture = await createFixture(t);
    const service = buildService(fixture, 'partition');
    service.deferElection = false;
    const answer = Object.freeze({outcome: OUTCOME.HOST_FAILURE,
      phase: `controlled-${edge}`, reason: 'controlled host refusal',
      retryAfterMs: 37, retryable: true, recoveryRequired: true});
    const makePort = service.createOperationPort;
    let nativePort;
    let engaged = 0;
    service.createOperationPort = (request) => {
      nativePort = makePort(request);
      const operations = {...nativePort};
      // Real port construction; controlled returned outcome at the service
      // adapter. This is not a native fault reproduction.
      if (edge === 'status') {
        operations.readStatus = () => {
          engaged += 1; return answer;
        };
      } else {
        operations.campaign = () => {
          engaged += 1; return answer;
        };
      }
      return createRaftOperationPort(operations);
    };
    const cleanupError = new Error('partition post-open cleanup failure');
    const original = service.roleMutationHelper.shutdown;
    let healed = false;
    service.roleMutationHelper.shutdown = function() {
      if (!healed) throw cleanupError;
      return original.call(this);
    };
    try {
      let failure;
      try {
        await service.initialize();
      } catch (error) {
        failure = error;
      }
      assert.ok(engaged > 0, 'the actual initializer must consume the controlled refusal');
      assert.equal(failure?.code, PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED);
      assert.equal(failure.consensus, answer, 'keep exact post-open refusal');
      assert.ok(failure instanceof AggregateError);
      assert.equal(failure.errors[1], cleanupError);
      await assert.rejects(service.initialize(), (error) => error === failure);
      healed = true;
      await service.shutdown();
      assert.equal(service.db, null);
      assert.equal(service.raft, null);
    } finally {
      healed = true; service.roleMutationHelper.shutdown = original;
      await service.shutdown(); nativePort?.close();
    }
  });
}
