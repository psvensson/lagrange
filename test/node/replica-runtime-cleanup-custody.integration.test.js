// Actual host owners and real native services/SQLite; injected DB close failures.
// Registry succession is explicit boundary control, not remote CREATE certification.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import path from 'node:path';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {REPLICA_CLEANUP_ERROR_CODE} from '../../src/node/replica-cleanup-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {WasmServiceLifecycle} from '../../src/wasm-service/wasm-service-lifecycle.js';
import {WASM_SERVICE_LIFECYCLE_REFUSAL, WASM_SERVICE_REPLICA_STATE as STATE} from
  '../../src/wasm-service/wasm-service-constants.js';
import {PortAllocator} from '../../src/wasm-service/port-allocator.js';
import {createFixture, buildService} from '../raft/raft-rs-backend/startup-cleanup-native-fixture.js';

function handlerFor(fixture) {
  return new ReplicaHandler({nodeId: 'opening-refusal-node', dataDir: fixture.directory,
    systemTableCache: new SystemTableCache(), cdcIntegrationService: {},
    createPartitionService: () => {
      throw new Error('unexpected physical factory call');
    },
    messageRouter: fixture.router, timeSource: fixture.clock});
}
function failClose(db) {
  const original = Database.prototype.close;
  const error = new Error('actual retained connection release failed');
  let enabled = true; let attempts = 0;
  Database.prototype.close = function(...args) {
    if (this === db && enabled) {
      attempts++; throw error;
    }
    return original.apply(this, args);
  };
  return {error, get attempts() {
    return attempts;
  }, repair() {
    enabled = false;
  },
  restore() {
    enabled = false; Database.prototype.close = original;
  }};
}
for (const published of [false, true]) {
  test(`ReplicaHandler failed CREATE retains ${published ? 'published' : 'unpublished'} service through loss of routing entry and retries its existing fence`, async (t) => {
    const fixture = await createFixture(t); const handler = handlerFor(fixture);
    const service = buildService(fixture, 'partition'); await service.initialize();
    const db = service.db; fixture.databases.push(db);
    if (published) {
      handler.localServices.set(service.replicaId, service);
      handler.setLocalReplica(service.replicaId, {partitionId: service.partitionId, service});
    }
    const primary = Object.assign(new Error('original CREATE refusal'), {
      code: 'create-refused', consensus: Object.freeze({retryAfterMs: 41})});
    const fault = failClose(db);
    try {
      await assert.rejects(handler.fenceFailedReplicaCreateRuntime(service.replicaId,
        service.partitionId, service, primary), (error) => {
        assert.equal(error.cause, primary); assert.equal(error.errors[1], fault.error);
        assert.equal(error.consensus, primary.consensus); return true;
      });
      assert.equal(fault.attempts, 1); assert.equal(service.isShutdown, true);
      // A routability change is not release evidence. The host must retain exact custody.
      handler.localServices.clear(); handler.localReplicas.clear();
      fault.repair();
      assert.equal(await handler.fenceFailedReplicaCreateRuntime(service.replicaId,
        service.partitionId), true);
      assert.equal(db.open, false, 'same fence resolves retained untracked cleanup');
      assert.equal(await handler.fenceFailedReplicaCreateRuntime(service.replicaId,
        service.partitionId), false, 'settled debt is removed, not re-executed');
    } finally {
      fault.restore(); await handler.shutdown();
    }
  });
}
test('ReplicaHandler shutdown surfaces failure, still closes unrelated replicas, and is retryable without losing the old service', async (t) => {
  const fixture = await createFixture(t); const handler = handlerFor(fixture);
  const first = buildService(fixture, 'partition');
  const other = buildService(fixture, 'message-group');
  await first.initialize(); await other.initialize();
  const firstDb = first.db; const otherDb = other.db; fixture.databases.push(firstDb);
  handler.localServices.set(first.replicaId, first);
  handler.localServices.set(other.replicaId, other);
  const fault = failClose(firstDb);
  try {
    await assert.rejects(handler.shutdown(), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.ok(error.errors.includes(fault.error));
      return true;
    });
    assert.equal(otherDb.open, false, 'one failed release must not abandon unrelated cleanup');
    assert.equal(firstDb.open, true); assert.equal(handler.initialized, false);
    fault.repair(); await handler.shutdown();
    assert.equal(firstDb.open, false); assert.equal(handler.localServices.size, 0);
    assert.equal(handler.localReplicas.size, 0);
  } finally {
    fault.restore(); await handler.shutdown();
  }
});
test('ReplicaHandler retry retires only the failed service, not a newer registry entry', async (t) => {
  const fixture = await createFixture(t); const handler = handlerFor(fixture);
  const service = buildService(fixture, 'partition'); await service.initialize();
  const db = service.db; fixture.databases.push(db);
  handler.localServices.set(service.replicaId, service);
  const fault = failClose(db);
  let successorShutdowns = 0;
  const successor = {shutdown: async () => {
    successorShutdowns++;
  }};
  try {
    await assert.rejects(handler.fenceFailedReplicaCreateRuntime(service.replicaId,
      service.partitionId, service), (error) => error === fault.error);
    handler.localServices.set(service.replicaId, successor);
    handler.setLocalReplica(service.replicaId,
      {partitionId: service.partitionId, service: successor});
    fault.repair();
    await handler.fenceFailedReplicaCreateRuntime(service.replicaId, service.partitionId, service);
    assert.equal(db.open, false); assert.equal(successorShutdowns, 0);
    assert.equal(handler.getTrackedService(service.replicaId), successor);
  } finally {
    fault.restore(); await handler.shutdown();
  }
});
function managed(fixture) {
  const owner = new WasmServiceLifecycle({messageRouter: fixture.router, nodeId: 'opening-refusal-node',
    portAllocator: new PortAllocator(), dataDirectoryManager: {
      getWasmServiceDbPath: (_id, replica) => path.join(fixture.directory, replica + '.db'),
      ensureWasmServiceDirExists() {},
    }});
  const definition = {serviceId: 'managed-custody'};
  const config = {replicaId: 'managed-custody-r1', replicaIds: ['managed-custody-r1']};
  return {owner, definition, config};
}
for (const wholeHost of [false, true]) {
  test(`WASM host ${wholeHost ? 'shutdownAll' : 'stopReplica'} retries a failed STOPPING predecessor even after its successor takes the active slot`, async (t) => {
    const fixture = await createFixture(t); const {owner, definition, config} = managed(fixture);
    const old = owner.createReplica(definition, config); fixture.services.push(old);
    assert.equal((await owner.startReplica(definition.serviceId)).started, true);
    const db = old.db; fixture.databases.push(db); const fault = failClose(db);
    try {
      const stopping = owner.stopReplica(definition.serviceId);
      const successor = owner.createReplica(definition, {...config, replicaId: 'managed-custody-r2', replicaIds: ['managed-custody-r2']});
      fixture.services.push(successor);
      await assert.rejects(stopping, (error) => error === fault.error);
      assert.equal(old.lifecycleState, STATE.CLEANUP_REQUIRED);
      assert.equal(owner.getReplica(definition.serviceId), successor);
      fault.repair();
      if (wholeHost) await owner.shutdownAll(); else await owner.stopReplica(definition.serviceId);
      assert.equal(db.open, false, 'host-owned retry includes predecessor absent from active map');
      assert.equal(old.lifecycleState, STATE.STOPPED);
      assert.equal(owner.getReplica(definition.serviceId), null);
    } finally {
      fault.restore(); await owner.shutdownAll();
    }
  });
}
test('WASM host bounds successor accumulation while an earlier stop remains outstanding', async (t) => {
  const fixture = await createFixture(t); const {owner, definition, config} = managed(fixture);
  const old = owner.createReplica(definition, config); fixture.services.push(old);
  await old.initialize();
  const db = old.db;
  fixture.databases.push(db);
  const fault = failClose(db);
  try {
    const stopping = owner.stopReplica(definition.serviceId);
    const next = owner.createReplica(definition, {...config, replicaId: 'managed-custody-r2', replicaIds: ['managed-custody-r2']});
    fixture.services.push(next);
    await assert.rejects(stopping);
    assert.throws(() => owner.createReplica(definition, {...config, replicaId: 'managed-custody-r3', replicaIds: ['managed-custody-r3']}),
      (error) => error.code === WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_LIVE);
    assert.equal(owner.getReplica(definition.serviceId), next);
    fault.repair(); await owner.stopReplica(definition.serviceId);
    const clean = owner.createReplica(definition, config); fixture.services.push(clean);
    await clean.initialize(); assert.equal(clean.initialized, true);
  } finally {
    fault.restore(); await owner.shutdownAll();
  }
});

test('ReplicaHandler CREATE retry drives the same failed release before opening admission', async (t) => {
  const fixture = await createFixture(t); const handler = handlerFor(fixture);
  const service = buildService(fixture, 'partition'); await service.initialize();
  const db = service.db; fixture.databases.push(db); const fault = failClose(db);
  const primary = Object.assign(new Error('prior admitted CREATE refused'), {
    consensus: Object.freeze({retryAfterMs: 37}), code: 'prior-create-refused'});
  try {
    await assert.rejects(handler.fenceFailedReplicaCreateRuntime(service.replicaId,
      service.partitionId, service, primary));
    await assert.rejects(handler.createReplicaAsync({replicaId: service.replicaId,
      partitionId: service.partitionId}), (error) => {
      assert.equal(error.code, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS);
      assert.equal(error.deferRetry, true);
      assert.equal(error.consensus, primary.consensus);
      assert.equal(error.cause.cause, primary);
      return true;
    });
    assert.equal(fault.attempts, 2, 'one original and one owned continuation, not a spin loop');
    fault.repair();
    await handler.settlePendingReplicaRuntimeCleanup(service.replicaId, service.partitionId);
    assert.equal(db.open, false);
    assert.equal(await handler.fenceFailedReplicaCreateRuntime(
      service.replicaId, service.partitionId),
    false);
  } finally {
    fault.restore(); await handler.shutdown();
  }
});
