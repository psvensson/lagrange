// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  MessageGroupServiceAdapter,
  PartitionServiceAdapter,
  RuntimeServiceAdapter,
} from '../../../src/service/index.js';
import {
  RUNTIME_KIND,
  UNIFIED_SERVICE_TYPE,
} from '../../../src/constants/index.js';

function runAdapterConformanceSuite(options) {
  describe(`${options.name} adapter conformance`, () => {
    it('exposes the expected service type', () => {
      const setup = options.makeAdapter();
      assert.equal(setup.adapter.serviceType, options.serviceType);
    });

    it('returns canonical validateDefinition result', () => {
      const setup = options.makeAdapter();
      const result = setup.adapter.validateDefinition(options.validDefinition);
      assert.equal(result.valid, true);
    });

    it('delegates create/start/stop/health through contract methods', async () => {
      const setup = options.makeAdapter();

      const createResult = await setup.adapter.createReplica(options.createContext);
      const startResult = await setup.adapter.startReplica(options.replicaHandle, {});
      const stopResult = await setup.adapter.stopReplica(options.replicaHandle, {});
      const healthResult = await setup.adapter.health(options.replicaHandle, {});

      assert.deepEqual(createResult, options.expected.create);
      assert.deepEqual(startResult, options.expected.start);
      assert.deepEqual(stopResult, options.expected.stop);
      assert.deepEqual(healthResult, options.expected.health);
      assert.deepEqual(setup.calls, options.expected.calls);
    });
  });
}

runAdapterConformanceSuite({
  name: 'partition',
  serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
  validDefinition: {serviceId: 'svc-p', serviceType: UNIFIED_SERVICE_TYPE.PARTITION},
  createContext: {
    definition: {serviceId: 'svc-p', serviceType: UNIFIED_SERVICE_TYPE.PARTITION},
  },
  replicaHandle: {
    serviceId: 'svc-p',
    serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
    replicaId: 'svc-p-replica-1',
  },
  makeAdapter: () => {
    const calls = [];
    const adapter = new PartitionServiceAdapter({
      createReplica: async (_context) => {
        calls.push('createReplica');
        return {created: true};
      },
      startReplica: async (_replicaHandle, _context) => {
        calls.push('startReplica');
        return {started: true};
      },
      stopReplica: async (_replicaHandle, _context) => {
        calls.push('stopReplica');
        return {stopped: true};
      },
      health: async (_replicaHandle, _context) => {
        calls.push('health');
        return {status: 'healthy'};
      },
    });
    return {adapter, calls};
  },
  expected: {
    create: {created: true},
    start: {started: true},
    stop: {stopped: true},
    health: {status: 'healthy'},
    calls: ['createReplica', 'startReplica', 'stopReplica', 'health'],
  },
});

runAdapterConformanceSuite({
  name: 'message-group',
  serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
  validDefinition: {
    serviceId: 'svc-m',
    serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
  },
  createContext: {
    definition: {
      serviceId: 'svc-m',
      serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    },
  },
  replicaHandle: {
    serviceId: 'svc-m',
    serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    replicaId: 'svc-m-replica-1',
  },
  makeAdapter: () => {
    const calls = [];
    const adapter = new MessageGroupServiceAdapter({
      createReplica: async (_context) => {
        calls.push('createReplica');
        return {created: true};
      },
      startReplica: async (_replicaHandle, _context) => {
        calls.push('startReplica');
        return {started: true};
      },
      stopReplica: async (_replicaHandle, _context) => {
        calls.push('stopReplica');
        return {stopped: true};
      },
      health: async (_replicaHandle, _context) => {
        calls.push('health');
        return {status: 'healthy'};
      },
    });
    return {adapter, calls};
  },
  expected: {
    create: {created: true},
    start: {started: true},
    stop: {stopped: true},
    health: {status: 'healthy'},
    calls: ['createReplica', 'startReplica', 'stopReplica', 'health'],
  },
});

runAdapterConformanceSuite({
  name: 'runtime-service',
  serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
  validDefinition: {
    serviceId: 'svc-r',
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    runtime_kind: RUNTIME_KIND.NATIVE_JS,
    runtime_ref: null,
    runtime_config: '{"memoryMb":64}',
  },
  createContext: {
    definition: {
      serviceId: 'svc-r',
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      runtime_kind: RUNTIME_KIND.NATIVE_JS,
      runtime_ref: null,
      runtime_config: '{"memoryMb":64}',
    },
  },
  replicaHandle: {
    definition: {
      serviceId: 'svc-r',
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      runtime_kind: RUNTIME_KIND.NATIVE_JS,
      runtime_ref: null,
      runtime_config: '{"memoryMb":64}',
    },
  },
  makeAdapter: () => {
    const calls = [];
    const lifecycle = {
      prepare: async (_definition, _context) => {
        calls.push('prepare');
        return {status: 'ready'};
      },
      start: async (_replicaContext) => {
        calls.push('start');
        return {status: 'running'};
      },
      stop: async (_replicaContext) => {
        calls.push('stop');
        return {status: 'stopped'};
      },
      health: async (_replicaContext) => {
        calls.push('health');
        return {status: 'healthy'};
      },
    };
    const adapter = new RuntimeServiceAdapter({
      serviceRuntimeLifecycle: lifecycle,
    });
    return {adapter, calls};
  },
  expected: {
    create: {status: 'ready'},
    start: {status: 'running'},
    stop: {status: 'stopped'},
    health: {status: 'healthy'},
    calls: ['prepare', 'start', 'stop', 'health'],
  },
});

describe('RuntimeServiceAdapter validation', () => {
  it('fails closed for unknown runtime kind', () => {
    const lifecycle = {
      prepare: async () => ({status: 'ready'}),
      start: async () => ({status: 'running'}),
      stop: async () => ({status: 'stopped'}),
      health: async () => ({status: 'healthy'}),
    };

    const adapter = new RuntimeServiceAdapter({
      serviceRuntimeLifecycle: lifecycle,
    });

    const validation = adapter.validateDefinition({
      runtime_kind: 'unknown-runtime-kind',
      runtime_ref: null,
      runtime_config: null,
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.length > 0);
  });
});
