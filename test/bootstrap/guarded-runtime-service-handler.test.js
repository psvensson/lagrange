import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeGuardedRuntimeServiceHandler} from
  '../../src/bootstrap/shared/guarded-runtime-service-handler.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createPostgresWireDefinition} from '../../src/wasm-service/meta-service-factory.js';
import {serializeServiceDefinition} from '../../src/wasm-service/wasm-service-models.js';
import {AUTHORITATIVE_DEFINITION_READ_AUTHORITY} from
  '../../src/node/runtime-service-definition-resolution.js';

function fixture(t, gateway) {
  const registrations = new Map();
  const cache = new SystemTableCache();
  const service = {
    nodeId: 'runtime-definition-port-node', bootIncarnation: 1,
    controlPlaneSystemTableGateway: gateway,
    serviceLifecycleManager: {}, heartbeatService: {}, cdcIntegrationService: {},
    attachRuntimeServiceRebalancerOwner() {},
    messageRouter: {
      register(key, handler) {
        registrations.set(key, handler);
      },
      getRegisteredHandler(key) {
        return registrations.get(key) ?? null;
      },
      unregisterExact(key, handler) {
        return registrations.get(key) === handler && registrations.delete(key);
      },
    },
  };
  t.after(async () => {
    if (service.runtimeServiceHandler) {
      service.runtimeServiceHandler.unregisterFromRouter(service.messageRouter);
      await service.runtimeServiceHandler.shutdown();
    }
    assert.equal(registrations.size, 0, 'owned handler registration retires');
  });
  return {service, cache, registrations};
}

for (const gateway of [undefined, {}, {readAuthoritativeRows: true}]) {
  test(`guarded startup refuses an unusable authoritative reader: ${typeof gateway?.readAuthoritativeRows}`,
    (t) => {
      const world = fixture(t, gateway);
      initializeGuardedRuntimeServiceHandler(world.service, world.cache);
      assert.equal(world.service.runtimeServiceHandler, undefined);
      assert.equal(world.registrations.size, 0, 'no unusable handler is registered');
    });
}

test('guarded startup passes its exact owner to actual handler resolution after a blocked attempt',
  async (t) => {
    const row = serializeServiceDefinition({...createPostgresWireDefinition(), replicaCount: 1});
    const calls = [];
    const gateway = {
      async readAuthoritativeRows(...args) {
        calls.push(args);
        return {success: true, rows: [row]};
      },
    };
    const world = fixture(t, null);
    initializeGuardedRuntimeServiceHandler(world.service, world.cache);
    assert.equal(world.registrations.size, 0);
    world.service.controlPlaneSystemTableGateway = gateway;
    initializeGuardedRuntimeServiceHandler(world.service, world.cache);
    const handler = world.service.runtimeServiceHandler;
    assert.equal(world.registrations.size, 1);
    assert.equal(handler.controlPlaneSystemTableGateway, gateway);
    const answer = await handler.resolveServiceDefinitionOutcomeForCreate(row.service_id);
    assert.equal(answer.outcome, 'ELIGIBLE');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'service_definitions');
    assert.deepEqual(calls[0][2], [row.service_id]);
    assert.equal(calls[0][3].readAuthority, AUTHORITATIVE_DEFINITION_READ_AUTHORITY);
  });
