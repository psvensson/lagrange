import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {
  RECONCILER_ACTION_TYPE,
  RECONCILER_EVENT,
  ServiceLifecycleManager,
  ServicePolicyViolationError,
  ServiceReconciler,
} from '../../src/service/index.js';
import {
  SERVICE_LIFECYCLE_STATE,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';

class SpyLifecycleManager extends ServiceLifecycleManager {
  constructor(options = {}) {
    super();
    this.calls = [];
    this.delayMs = Number.isFinite(options.delayMs) ?
      Math.max(0, Math.floor(options.delayMs)) :
      0;
    this.inFlight = 0;
    this.maxInFlight = 0;
  }

  async _recordCall(call, result) {
    this.calls.push(call);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
      return result;
    } finally {
      this.inFlight -= 1;
    }
  }

  async createReplica(definition, context) {
    return this._recordCall(
      {method: 'createReplica', definition, context},
      {created: true},
    );
  }

  async startReplica(replicaHandle, context) {
    return this._recordCall(
      {method: 'startReplica', replicaHandle, context},
      {started: true},
    );
  }

  async stopReplica(replicaHandle, context) {
    return this._recordCall(
      {method: 'stopReplica', replicaHandle, context},
      {stopped: true},
    );
  }
}

function waitForEvent(emitter, eventName) {
  return new Promise((resolve) => {
    emitter.once(eventName, resolve);
  });
}

describe('ServiceReconciler diff planning', () => {
  it('produces deterministic action ordering for equivalent inputs', () => {
    const lifecycleManager = new SpyLifecycleManager();
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [],
      actualStateReader: async () => [],
    });

    const desiredRowsA = [
      {
        serviceId: 'svc-b',
        serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
        replicaCount: 2,
        tenantId: 'tenant-1',
      },
      {
        serviceId: 'svc-a',
        serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        replicaCount: 1,
        tenantId: 'tenant-1',
      },
    ];

    const actualRowsA = [
      {
        serviceId: 'svc-b',
        serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
        replicaId: 'svc-b-replica-2',
        lifecycleState: SERVICE_LIFECYCLE_STATE.RUNNING,
      },
      {
        serviceId: 'svc-z',
        serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
        replicaId: 'svc-z-replica-1',
        lifecycleState: SERVICE_LIFECYCLE_STATE.RUNNING,
      },
      {
        serviceId: 'svc-b',
        serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
        replicaId: 'svc-b-replica-1',
        lifecycleState: SERVICE_LIFECYCLE_STATE.STOPPED,
      },
    ];

    const desiredRowsB = [desiredRowsA[1], desiredRowsA[0]];
    const actualRowsB = [actualRowsA[2], actualRowsA[0], actualRowsA[1]];

    const actionsA = reconciler.planActions(desiredRowsA, actualRowsA);
    const actionsB = reconciler.planActions(desiredRowsB, actualRowsB);

    assert.deepEqual(actionsA, actionsB);
    assert.deepEqual(
      actionsA.map((action) => action.type),
      [
        RECONCILER_ACTION_TYPE.START_REPLICA,
        RECONCILER_ACTION_TYPE.STOP_REPLICA,
        RECONCILER_ACTION_TYPE.CREATE_START_REPLICA,
      ],
    );
  });

  it('plans create_start_replica when desired count exceeds available replicas', () => {
    const lifecycleManager = new SpyLifecycleManager();
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [],
      actualStateReader: async () => [],
    });

    const actions = reconciler.planActions(
      [
        {
          serviceId: 'svc-create',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaCount: 2,
          tenantId: 'tenant-1',
        },
      ],
      [
        {
          serviceId: 'svc-create',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-create-replica-1',
          lifecycleState: SERVICE_LIFECYCLE_STATE.RUNNING,
          tenantId: 'tenant-1',
        },
      ],
    );

    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, RECONCILER_ACTION_TYPE.CREATE_START_REPLICA);
    assert.equal(actions[0].replica.replicaId, 'svc-create-replica-2');
  });
});

describe('ServiceReconciler action emission', () => {
  it('emits actions through lifecycle manager methods only', async () => {
    const lifecycleManager = new SpyLifecycleManager();
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [],
      actualStateReader: async () => [],
    });

    await reconciler.executePlan([
      {
        type: RECONCILER_ACTION_TYPE.STOP_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-1',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-1',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-1-replica-1',
          tenantId: 'tenant-1',
        },
      },
      {
        type: RECONCILER_ACTION_TYPE.START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-2',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-2',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-2-replica-1',
          tenantId: 'tenant-1',
        },
      },
      {
        type: RECONCILER_ACTION_TYPE.CREATE_START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-3',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-3',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-3-replica-1',
          tenantId: 'tenant-1',
        },
      },
    ], {
      reason: 'unit-test',
      metadata: {source: 'test'},
    });

    assert.deepEqual(
      lifecycleManager.calls.map((call) => call.method),
      ['stopReplica', 'startReplica', 'createReplica', 'startReplica'],
    );
    assert.equal(lifecycleManager.calls[0].context.reason, 'unit-test');
    assert.equal(lifecycleManager.calls[2].definition.replicaId, 'svc-3-replica-1');
  });

  it('executes independent services in parallel when configured', async () => {
    const lifecycleManager = new SpyLifecycleManager({delayMs: 10});
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [],
      actualStateReader: async () => [],
      maxConcurrentServiceActions: 3,
    });

    await reconciler.executePlan([
      {
        type: RECONCILER_ACTION_TYPE.START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-1',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-1',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-1-replica-1',
          tenantId: 'tenant-1',
        },
      },
      {
        type: RECONCILER_ACTION_TYPE.START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-2',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-2',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-2-replica-1',
          tenantId: 'tenant-1',
        },
      },
      {
        type: RECONCILER_ACTION_TYPE.START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-3',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-3',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-3-replica-1',
          tenantId: 'tenant-1',
        },
      },
    ], {
      reason: 'unit-test',
      metadata: {source: 'test'},
    });

    assert.equal(lifecycleManager.calls.length, 3);
    assert.ok(lifecycleManager.maxInFlight > 1);
  });

  it('preserves same-service action order under parallel execution', async () => {
    const lifecycleManager = new SpyLifecycleManager({delayMs: 10});
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [],
      actualStateReader: async () => [],
      maxConcurrentServiceActions: 3,
    });

    await reconciler.executePlan([
      {
        type: RECONCILER_ACTION_TYPE.START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-order',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-order',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-order-replica-1',
          tenantId: 'tenant-1',
        },
      },
      {
        type: RECONCILER_ACTION_TYPE.START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-other',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-other',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-other-replica-1',
          tenantId: 'tenant-1',
        },
      },
      {
        type: RECONCILER_ACTION_TYPE.STOP_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-order',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-order',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-order-replica-1',
          tenantId: 'tenant-1',
        },
      },
    ], {
      reason: 'unit-test-ordering',
      metadata: {source: 'test'},
    });

    const orderCalls = lifecycleManager.calls
      .filter((call) => call.replicaHandle?.serviceId === 'svc-order')
      .map((call) => call.method);
    assert.deepEqual(orderCalls, ['startReplica', 'stopReplica']);
  });

  it('fails closed when placement policy check rejects action', async () => {
    const lifecycleManager = new SpyLifecycleManager();
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [],
      actualStateReader: async () => [],
      placementPolicyCheck: async () => {
        throw new Error('placement denied');
      },
    });

    const execution = await reconciler.executePlan([
      {
        type: RECONCILER_ACTION_TYPE.START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-policy',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-policy',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-policy-replica-1',
          tenantId: 'tenant-1',
        },
      },
    ], {
      reason: 'unit-test-policy',
      metadata: {source: 'test'},
    });

    assert.equal(lifecycleManager.calls.length, 0);
    assert.equal(execution.length, 1);
    assert.equal(execution[0].success, false);
    assert.equal(
      execution[0].error instanceof ServicePolicyViolationError,
      true,
    );
    assert.equal(execution[0].error.policyType, 'placement');
  });

  it('omits error field from decision logs when action succeeds', async () => {
    const lifecycleManager = new SpyLifecycleManager();
    const infoCalls = [];
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [],
      actualStateReader: async () => [],
      logger: {
        info: (_message, payload) => infoCalls.push(payload),
        error: () => {},
      },
    });

    await reconciler.executePlan([
      {
        type: RECONCILER_ACTION_TYPE.START_REPLICA,
        driftReason: 'drift',
        definition: {
          serviceId: 'svc-log',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          tenantId: 'tenant-1',
          replicaCount: 1,
        },
        replica: {
          serviceId: 'svc-log',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-log-replica-1',
          tenantId: 'tenant-1',
        },
      },
    ], {
      reason: 'unit-test',
      metadata: {source: 'test'},
    });

    assert.equal(infoCalls.length, 1);
    assert.equal(infoCalls[0].success, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(infoCalls[0], 'error'),
      false,
    );
  });
});

describe('ServiceReconciler loop and telemetry', () => {
  it('demotes idle interval completion logs to debug level', async () => {
    const lifecycleManager = new SpyLifecycleManager();
    const infoLogs = [];
    const debugLogs = [];
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [],
      actualStateReader: async () => [],
      logger: {
        debug: (message, payload) => debugLogs.push({message, payload}),
        info: (message, payload) => infoLogs.push({message, payload}),
        error: () => {},
      },
    });

    await reconciler.trigger('interval', {nodeId: 'node-1'});

    assert.equal(
      infoLogs.length,
      0,
      'idle interval cycles should avoid info-level completion logs',
    );
    assert.ok(
      debugLogs.some((entry) => entry.payload?.actionCount === 0),
      'idle interval cycles should still emit debug completion diagnostics',
    );
  });

  it('runs event-triggered reconciliation cycles', async () => {
    const lifecycleManager = new SpyLifecycleManager();
    let desiredReads = 0;
    let actualReads = 0;
    const eventSource = new EventEmitter();

    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => {
        desiredReads += 1;
        return [];
      },
      actualStateReader: async () => {
        actualReads += 1;
        return [];
      },
      checkIntervalMs: 1000,
      eventSource,
      eventNames: ['state-changed'],
    });

    await reconciler.start();

    const cycleCompletePromise = waitForEvent(
      reconciler,
      RECONCILER_EVENT.CYCLE_COMPLETE,
    );
    eventSource.emit('state-changed');
    await cycleCompletePromise;

    reconciler.stop();

    assert.ok(desiredReads >= 2);
    assert.ok(actualReads >= 2);
  });

  it('records reconciliation decisions in telemetry sink and events', async () => {
    const lifecycleManager = new SpyLifecycleManager();
    const telemetry = [];
    const decisions = [];

    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [
        {
          serviceId: 'svc-telemetry',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaCount: 1,
          tenantId: 'tenant-1',
        },
      ],
      actualStateReader: async () => [
        {
          serviceId: 'svc-telemetry',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-telemetry-replica-1',
          lifecycleState: SERVICE_LIFECYCLE_STATE.STOPPED,
          tenantId: 'tenant-1',
        },
      ],
      telemetrySink: (decision) => {
        telemetry.push(decision);
      },
    });

    reconciler.on(RECONCILER_EVENT.DECISION, (decision) => {
      decisions.push(decision);
    });

    await reconciler.trigger('manual-test', {requestId: 'req-1'});

    assert.equal(telemetry.length, 1);
    assert.equal(decisions.length, 1);
    assert.equal(telemetry[0].reason, 'manual-test');
    assert.equal(telemetry[0].success, true);
    assert.equal(telemetry[0].action.type, RECONCILER_ACTION_TYPE.START_REPLICA);
  });

  it('exposes diagnostics report with decision history and adapter selections', async () => {
    const lifecycleManager = new SpyLifecycleManager();
    const reconciler = new ServiceReconciler({
      lifecycleManager,
      desiredStateReader: async () => [
        {
          serviceId: 'svc-report',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaCount: 1,
          tenantId: 'tenant-1',
        },
      ],
      actualStateReader: async () => [
        {
          serviceId: 'svc-report',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaId: 'svc-report-replica-1',
          lifecycleState: SERVICE_LIFECYCLE_STATE.STOPPED,
          tenantId: 'tenant-1',
        },
      ],
    });

    await reconciler.trigger('diagnostics-test', {nodeId: 'node-1'});

    const diagnostics = reconciler.getDiagnosticsReport({limit: 1});
    assert.equal(diagnostics.stats.cycleCount, 1);
    assert.equal(diagnostics.stats.actionCount, 1);
    assert.equal(diagnostics.stats.actionSuccessCount, 1);
    assert.equal(diagnostics.recentDecisions.length, 1);
    assert.equal(diagnostics.recentDecisions[0].reason, 'diagnostics-test');
    assert.equal(
      Array.isArray(diagnostics.lifecycleAdapterSelections.adapters),
      true,
    );
  });
});
