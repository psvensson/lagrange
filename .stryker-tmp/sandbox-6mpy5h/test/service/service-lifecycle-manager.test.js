// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME_KIND,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_OPERATION_STATE,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';
import {ServiceLifecycleManager} from '../../src/service/service-lifecycle-manager.js';
import {ServiceTypeAdapter} from '../../src/service/service-type-adapter.js';
import {
  ServiceDescriptorValidationError,
  ServicePolicyViolationError,
  ServiceLifecycleTransitionError,
  UnknownServiceTypeError,
} from '../../src/service/service-lifecycle-errors.js';

class StubServiceAdapter extends ServiceTypeAdapter {
  constructor(serviceType) {
    super(serviceType);
    this.calls = [];
    this.startFailure = null;
  }

  validateDefinition(_definition) {
    return {valid: true};
  }

  async createReplica(_context) {
    this.calls.push('createReplica');
    return {created: true};
  }

  async startReplica(_replicaHandle, _context) {
    this.calls.push('startReplica');
    if (this.startFailure) {
      throw this.startFailure;
    }
    return {status: SERVICE_LIFECYCLE_STATE.RUNNING};
  }

  async stopReplica(_replicaHandle, _context) {
    this.calls.push('stopReplica');
    return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
  }

  async health(_replicaHandle, _context) {
    this.calls.push('health');
    return {status: 'healthy'};
  }
}

function serviceHandle(
  serviceId = 'svc-1',
  serviceType = UNIFIED_SERVICE_TYPE.PARTITION,
) {
  return {
    serviceId,
    serviceType,
    replicaId: `${serviceId}-replica`,
    tenantId: 'tenant-1',
  };
}

function serviceDefinition(
  serviceId = 'svc-1',
  serviceType = UNIFIED_SERVICE_TYPE.PARTITION,
) {
  return {
    serviceId,
    serviceType,
    tenantId: 'tenant-1',
    replicaId: `${serviceId}-replica`,
    replicaCount: 1,
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: null,
    runtimeConfig: null,
  };
}

describe('ServiceLifecycleManager adapter delegation', () => {
  it('delegates start/stop/restart to registered adapter only', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-delegate');

    manager.registerAdapter(adapter);

    await manager.startReplica(handle);
    await manager.restartReplica(handle);
    await manager.stopReplica(handle);

    assert.deepEqual(adapter.calls, [
      'startReplica',
      'stopReplica',
      'startReplica',
      'stopReplica',
    ]);
  });

  it('fails closed for unregistered service type', async () => {
    const manager = new ServiceLifecycleManager();

    await assert.rejects(
      () => manager.startReplica(serviceHandle('svc-unknown')),
      (error) => {
        assert.ok(error instanceof UnknownServiceTypeError);
        return true;
      },
    );
  });
});

describe('ServiceLifecycleManager lifecycle transitions', () => {
  it('validates canonical descriptor on createReplica', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    manager.registerAdapter(adapter);

    await assert.rejects(
      () => manager.createReplica({
        serviceId: 'svc-invalid-descriptor',
        serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
        replicaCount: 1,
      }),
      (error) => {
        assert.ok(error instanceof ServiceDescriptorValidationError);
        return true;
      },
    );
  });

  it('tracks state through start then stop', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-state');

    manager.registerAdapter(adapter);

    await manager.startReplica(handle);
    assert.equal(
      manager.getReplicaState(handle),
      SERVICE_LIFECYCLE_STATE.RUNNING,
    );

    await manager.stopReplica(handle);
    assert.equal(
      manager.getReplicaState(handle),
      SERVICE_LIFECYCLE_STATE.STOPPED,
    );
  });

  it('throws typed transition errors for invalid state transitions', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-transition');

    manager.registerAdapter(adapter);

    await manager.startReplica(handle);

    await assert.rejects(
      () => manager.startReplica(handle),
      (error) => {
        assert.ok(error instanceof ServiceLifecycleTransitionError);
        assert.equal(error.fromState, SERVICE_LIFECYCLE_STATE.RUNNING);
        assert.equal(error.toState, SERVICE_LIFECYCLE_STATE.STARTING);
        return true;
      },
    );
  });

  it('moves state to failed when adapter start throws', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-fail');

    adapter.startFailure = new Error('start failed');
    manager.registerAdapter(adapter);

    await assert.rejects(() => manager.startReplica(handle));

    assert.equal(
      manager.getReplicaState(handle),
      SERVICE_LIFECYCLE_STATE.FAILED,
    );
  });
});

describe('ServiceLifecycleManager journaling and idempotency', () => {
  it('persists operation create and transitions when writer configured', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const writes = [];

    manager.registerAdapter(adapter);
    manager.setOperationWriter(async (sql, params) => {
      writes.push({sql, params});
    });
    manager.setIdempotencyReader(async () => []);

    const result = await manager.startReplica(serviceHandle('svc-journal'), {}, {
      idempotencyKey: 'k-1',
    });

    assert.equal(typeof result.operationId, 'string');
    assert.equal(writes.length, 3);
    assert.ok(writes[0].sql.includes('INSERT INTO wasm_operations'));
    assert.ok(writes[1].sql.includes('UPDATE wasm_operations'));
    assert.ok(writes[2].sql.includes('UPDATE wasm_operations'));
  });

  it('returns idempotent result without invoking adapter on duplicate key', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-idem');

    manager.registerAdapter(adapter);
    manager.setOperationWriter(async () => {});
    manager.setIdempotencyReader(async () => {
      return [{operation_id: 'op-1', state: SERVICE_OPERATION_STATE.COMPLETED}];
    });

    const result = await manager.startReplica(handle, {}, {
      idempotencyKey: 'duplicate-key',
    });

    assert.deepEqual(adapter.calls, []);
    assert.equal(result.idempotent, true);
    assert.equal(result.operationId, 'op-1');
    assert.equal(result.status, SERVICE_OPERATION_STATE.COMPLETED);
    assert.equal(
      manager.getReplicaState(handle),
      SERVICE_LIFECYCLE_STATE.CREATED,
    );
  });

  it('returns idempotent create result without invoking adapter', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);

    manager.registerAdapter(adapter);
    manager.setOperationWriter(async () => {});
    manager.setIdempotencyReader(async () => {
      return [{operation_id: 'op-create', state: SERVICE_OPERATION_STATE.IN_PROGRESS}];
    });

    const result = await manager.createReplica(
      serviceDefinition('svc-idem-create'),
      {},
      {idempotencyKey: 'dup-create'},
    );

    assert.deepEqual(adapter.calls, []);
    assert.equal(result.idempotent, true);
    assert.equal(result.operationId, 'op-create');
    assert.equal(result.status, SERVICE_OPERATION_STATE.IN_PROGRESS);
  });

  it('returns idempotent stop result without mutating state', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-idem-stop');

    manager.registerAdapter(adapter);
    await manager.startReplica(handle);
    adapter.calls = [];

    manager.setOperationWriter(async () => {});
    manager.setIdempotencyReader(async () => {
      return [{operation_id: 'op-stop', state: SERVICE_OPERATION_STATE.IN_PROGRESS}];
    });

    const result = await manager.stopReplica(handle, {}, {
      idempotencyKey: 'dup-stop',
    });

    assert.deepEqual(adapter.calls, []);
    assert.equal(result.idempotent, true);
    assert.equal(result.operationId, 'op-stop');
    assert.equal(result.status, SERVICE_OPERATION_STATE.IN_PROGRESS);
    assert.equal(
      manager.getReplicaState(handle),
      SERVICE_LIFECYCLE_STATE.RUNNING,
    );
  });

  it('returns idempotent restart result without invoking adapter hooks', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-idem-restart');

    manager.registerAdapter(adapter);
    await manager.startReplica(handle);
    adapter.calls = [];

    manager.setOperationWriter(async () => {});
    manager.setIdempotencyReader(async () => {
      return [{operation_id: 'op-restart', state: SERVICE_OPERATION_STATE.COMPLETED}];
    });

    const result = await manager.restartReplica(handle, {}, {
      idempotencyKey: 'dup-restart',
    });

    assert.deepEqual(adapter.calls, []);
    assert.equal(result.idempotent, true);
    assert.equal(result.operationId, 'op-restart');
    assert.equal(result.status, SERVICE_OPERATION_STATE.COMPLETED);
    assert.equal(
      manager.getReplicaState(handle),
      SERVICE_LIFECYCLE_STATE.RUNNING,
    );
  });
});

describe('ServiceLifecycleManager runtime policy checks', () => {
  it('fails closed when runtime policy rejects create', async () => {
    const manager = new ServiceLifecycleManager({
      runtimePolicyCheck: async () => {
        throw new Error('runtime denied');
      },
    });
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);

    manager.registerAdapter(adapter);

    await assert.rejects(
      () => manager.createReplica(serviceDefinition('svc-policy-create')),
      (error) => {
        assert.equal(error instanceof ServicePolicyViolationError, true);
        assert.equal(error.policyType, 'runtime');
        return true;
      },
    );
    assert.deepEqual(adapter.calls, []);
  });

  it('fails closed when runtime policy rejects start', async () => {
    const manager = new ServiceLifecycleManager({
      runtimePolicyCheck: async () => {
        throw new Error('runtime denied');
      },
    });
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-policy-start');

    manager.registerAdapter(adapter);

    await assert.rejects(
      () => manager.startReplica(handle),
      (error) => {
        assert.equal(error instanceof ServicePolicyViolationError, true);
        assert.equal(error.policyType, 'runtime');
        return true;
      },
    );
    assert.deepEqual(adapter.calls, []);
  });

  it('requires runtime policy check to be a function', () => {
    const manager = new ServiceLifecycleManager();

    assert.throws(
      () => manager.setRuntimePolicyCheck('invalid'),
      /runtime policy check must be a function/,
    );

    assert.throws(
      () => new ServiceLifecycleManager({runtimePolicyCheck: 'invalid'}),
      /runtime policy check must be a function/,
    );
  });
});

describe('ServiceLifecycleManager recovery', () => {
  it('recovers pending start operations from journal', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const writes = [];

    manager.registerAdapter(adapter);
    manager.setOperationWriter(async (sql, params) => {
      writes.push({sql, params});
    });
    manager.setRecoveryReader(async (_sql, params) => {
      if (params[0] === SERVICE_OPERATION_STATE.PENDING) {
        return [{
          operation_id: 'op-recover-start',
          command: 'start:svc-recover-start',
          state: SERVICE_OPERATION_STATE.PENDING,
          created_at: 1,
        }];
      }
      return [];
    });

    const results = await manager.recoverPendingOperations({
      resolveServiceContext: ({serviceId}) => ({
        replicaHandle: serviceHandle(serviceId),
      }),
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'recovered');
    assert.deepEqual(adapter.calls, ['startReplica']);
    assert.equal(
      manager.getReplicaState(serviceHandle('svc-recover-start')),
      SERVICE_LIFECYCLE_STATE.RUNNING,
    );
    assert.equal(writes.length, 2);
  });

  it('recovers in-progress stop operations from journal', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const writes = [];
    const handle = serviceHandle('svc-recover-stop');

    manager.registerAdapter(adapter);
    await manager.startReplica(handle);
    adapter.calls = [];

    manager.setOperationWriter(async (sql, params) => {
      writes.push({sql, params});
    });
    manager.setRecoveryReader(async (_sql, params) => {
      if (params[0] === SERVICE_OPERATION_STATE.IN_PROGRESS) {
        return [{
          operation_id: 'op-recover-stop',
          command: 'stop:svc-recover-stop',
          state: SERVICE_OPERATION_STATE.IN_PROGRESS,
          created_at: 2,
        }];
      }
      return [];
    });

    const results = await manager.recoverPendingOperations({
      resolveServiceContext: ({serviceId}) => ({
        replicaHandle: serviceHandle(serviceId),
      }),
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'recovered');
    assert.deepEqual(adapter.calls, ['stopReplica']);
    assert.equal(
      manager.getReplicaState(handle),
      SERVICE_LIFECYCLE_STATE.STOPPED,
    );
    assert.equal(writes.length, 1);
  });

  it('marks recovered operation failed when adapter execution fails', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const writes = [];

    adapter.startFailure = new Error('start failed during recovery');
    manager.registerAdapter(adapter);
    manager.setOperationWriter(async (sql, params) => {
      writes.push({sql, params});
    });
    manager.setRecoveryReader(async (_sql, params) => {
      if (params[0] === SERVICE_OPERATION_STATE.PENDING) {
        return [{
          operation_id: 'op-recover-failure',
          command: 'start:svc-recover-failure',
          state: SERVICE_OPERATION_STATE.PENDING,
          created_at: 3,
        }];
      }
      return [];
    });

    const results = await manager.recoverPendingOperations({
      resolveServiceContext: ({serviceId}) => ({
        replicaHandle: serviceHandle(serviceId),
      }),
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'failed');
    assert.equal(
      manager.getReplicaState(serviceHandle('svc-recover-failure')),
      SERVICE_LIFECYCLE_STATE.FAILED,
    );
    assert.equal(writes.length, 2);
  });

  it('requires resolveServiceContext for recovery', async () => {
    const manager = new ServiceLifecycleManager();

    manager.setRecoveryReader(async () => []);

    await assert.rejects(
      () => manager.recoverPendingOperations(),
      /resolveServiceContext/,
    );
  });
});

describe('ServiceLifecycleManager diagnostics', () => {
  it('records lifecycle metrics and adapter selections', async () => {
    const manager = new ServiceLifecycleManager();
    const adapter = new StubServiceAdapter(UNIFIED_SERVICE_TYPE.PARTITION);
    const handle = serviceHandle('svc-diagnostics');

    manager.registerAdapter(adapter);
    await manager.startReplica(handle);
    await manager.stopReplica(handle);

    const metrics = manager.getMetrics();
    assert.equal(metrics.operationTotal, 2);
    assert.equal(metrics.operationSuccess, 2);
    assert.equal(metrics.operationFailure, 0);
    assert.equal(metrics.byOperation.start.success, 1);
    assert.equal(metrics.byOperation.stop.success, 1);

    const adapterReport = manager.getAdapterSelectionReport();
    assert.equal(adapterReport.adapters.length, 1);
    assert.equal(adapterReport.adapters[0].serviceType, UNIFIED_SERVICE_TYPE.PARTITION);
    assert.equal(adapterReport.adapters[0].selectionCount > 0, true);

    const diagnostics = manager.getDiagnosticsReport({limit: 2});
    assert.equal(diagnostics.recentOperations.length, 2);
    assert.equal(diagnostics.recentOperations[0].status, 'success');
  });
});
