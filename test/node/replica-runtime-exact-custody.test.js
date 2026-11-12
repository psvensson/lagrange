// Host custody boundary schedules; native unlink safety remains a separate witness.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fenceFailedReplicaCreateRuntime} from
  '../../src/node/replica-runtime-cleanup-custody.js';

const REPLICA = 'custody-r';
const PARTITION = 'custody-p';
function host() {
  return {pendingRuntimeShutdowns: new Map(), localServices: new Map(),
    localReplicas: new Map(), snapshotInstallOwner: {
      async claimForCreateFailure(_id, service) {
        return service;
      },
    }, setLocalReplica(id, value) {
      this.localReplicas.set(id, {...this.localReplicas.get(id), ...value});
    }};
}
function service(shutdown) {
  return {replicaId: REPLICA, partitionId: PARTITION, shutdown};
}
function fence(handler, object) {
  return fenceFailedReplicaCreateRuntime(handler, REPLICA, PARTITION, object);
}

test('predecessor cannot hide failed replacement; retry retains both exact objects', async () => {
  const handler = host();
  const fault = new Error('replacement release failed');
  let oldCalls = 0; let productCalls = 0; let fail = true;
  const old = service(async () => {
    oldCalls++;
  });
  const product = service(async () => {
    productCalls++; if (fail) throw fault;
  });
  handler.localServices.set(REPLICA, old);
  handler.pendingRuntimeShutdowns.set(product,
    {replicaId: REPLICA, partitionId: PARTITION, primary: null});
  await assert.rejects(fence(handler, old), (error) => error === fault);
  assert.equal(oldCalls, 1);
  assert.equal(productCalls, 1);
  assert.equal(handler.pendingRuntimeShutdowns.has(product), true);
  fail = false;
  await fence(handler, null);
  assert.equal(productCalls, 2);
  assert.equal(handler.pendingRuntimeShutdowns.size, 0);
});

test('simultaneous fences join one release and cannot delete a successor', async () => {
  const handler = host();
  const entered = Promise.withResolvers(); const gate = Promise.withResolvers();
  let calls = 0;
  const old = service(async () => {
    calls++; entered.resolve(); await gate.promise;
  });
  const next = service(async () => {
    throw new Error('successor must not close');
  });
  handler.localServices.set(REPLICA, old);
  const first = fence(handler, old);
  await entered.promise;
  const second = fence(handler, old);
  handler.localServices.set(REPLICA, next);
  handler.localReplicas.set(REPLICA, {service: next});
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(handler.localServices.get(REPLICA), next);
  assert.equal(handler.localReplicas.get(REPLICA).service, next);
});
