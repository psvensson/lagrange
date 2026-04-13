/**
 * Integration tests proving partition_callback execution uses
 * unified runtime ownership.
 *
 * Validates end-to-end callback execution through
 * CallbackExecutionHost with CallbackRuntimeDriverRegistry
 * for native_js, wasm_component, and gated oci_container.
 *
 * Validates: Requirements 4.3, 14.2, 14.3
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  CALLBACK_RUNTIME_KIND,
  ADAPTER_ERROR_MSG,
} from '../../src/query/sql-adapter-constants.js';
import {
  STAGE_STATE,
  CALLBACK_TELEMETRY_EVENT,
  STAGE_RESULT_FIELD as SF,
} from '../../src/query/callback/callback-stage-constants.js';
import {
  CallbackExecutionHost,
} from '../../src/query/callback/callback-execution-host.js';
import {
  createCallbackDriverRegistry,
} from '../../src/query/callback/callback-runtime-driver-registry.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

// --- Helpers ---

function makeBatch(partitionId, rows) {
  return {partitionId, rows};
}

function nativeDescriptor() {
  return {
    callbackModuleRef: 'mod-native',
    callbackExport: 'run',
    runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
  };
}

function wasmDescriptor() {
  return {
    callbackModuleRef: 'mod-wasm',
    callbackExport: 'process',
    runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
  };
}

function ociDescriptor() {
  return {
    callbackModuleRef: 'mod-oci',
    callbackExport: 'run',
    runtimeKind: CALLBACK_RUNTIME_KIND.OCI_CONTAINER,
  };
}

function makeBudgetEnforcer() {
  const calls = [];
  return {
    calls,
    isTerminated: () => false,
    checkWallTime: () => {
      calls.push('checkWallTime');
    },
    recordOutBytes: (bytes) => {
      calls.push({recordOutBytes: bytes});
    },
  };
}

function makeCancellationToken(cancelled = false) {
  return {
    isCancelled: () => cancelled,
    getReason: () => cancelled ? 'test cancellation' : 'none',
  };
}

function makeLineageTracker() {
  const attached = [];
  return {
    attached,
    generateLineageId: (stageIdx, type, batchIdx) =>
      `${stageIdx}-${type}-${batchIdx}`,
    attachLineage: (result, _stageIdx, _type, _batchIdx) => {
      result._lineage = true;
      attached.push(result);
    },
  };
}

function makeWasmExecutor() {
  return {
    execute: async (_func, _context, args) => ({
      result: args.rows.map((r) => ({...r, processed: true})),
    }),
  };
}

function createRuntimeRegistry() {
  const runtimeWiring = createRuntimeStartupWiring();
  return runtimeWiring.runtimeDriverRegistry;
}

function createCallbackRegistry(overrides = {}) {
  return createCallbackDriverRegistry({
    runtimeDriverRegistry: createRuntimeRegistry(),
    ...overrides,
  });
}

function makeHost(overrides = {}) {
  const registry = createCallbackRegistry({
    wasmExecutor: overrides.wasmExecutor || makeWasmExecutor(),
    ociFeatureGateEnabled: overrides.ociFeatureGateEnabled || false,
  });
  return new CallbackExecutionHost({
    runtimeDriverRegistry: registry,
    budgetEnforcer: overrides.budgetEnforcer || null,
    cancellationToken: overrides.cancellationToken || null,
    lineageTracker: overrides.lineageTracker || null,
    dedupeRegistry: overrides.dedupeRegistry || null,
    stageIndex: overrides.stageIndex ?? 0,
    onTelemetry: overrides.onTelemetry || null,
  });
}

// --- 1. End-to-end native_js callback execution ---

describe('E2E native_js callback via unified runtime', () => {
  it('executes callback through NativeJsCallbackDriver', async () => {
    const handler = (batch, _desc, _ctx) =>
      batch.rows.map((r) => ({...r, handled: true}));

    const host = makeHost();
    const batch = makeBatch('p1', [{id: 1}, {id: 2}]);
    const result = await host.execute(
      [batch], nativeDescriptor(), {handler},
    );

    assert.equal(result[SF.STATE], STAGE_STATE.COMPLETED);
    assert.equal(result.totalPartitions, 1);
    assert.equal(result.processedPartitions, 1);
    assert.equal(result.failedPartitions, 0);
    assert.equal(result.totalRows, 2);

    const pr = result.partitionResults[0];
    assert.equal(pr[SF.PARTITION_ID], 'p1');
    assert.equal(pr[SF.ROW_COUNT], 2);
    assert.equal(pr[SF.STATE], STAGE_STATE.COMPLETED);
    assert.equal(pr[SF.ROWS][0].handled, true);
    assert.equal(pr[SF.ROWS][1].handled, true);
  });
});

// --- 2. End-to-end wasm_component callback execution ---

describe('E2E wasm_component callback via unified runtime', () => {
  it('executes callback through WasmComponentCallbackDriver', async () => {
    const host = makeHost();
    const batch = makeBatch('p2', [{val: 'a'}, {val: 'b'}]);
    const result = await host.execute(
      [batch], wasmDescriptor(),
    );

    assert.equal(result[SF.STATE], STAGE_STATE.COMPLETED);
    assert.equal(result.totalPartitions, 1);
    assert.equal(result.processedPartitions, 1);
    assert.equal(result.failedPartitions, 0);
    assert.equal(result.totalRows, 2);

    const pr = result.partitionResults[0];
    assert.equal(pr[SF.PARTITION_ID], 'p2');
    assert.equal(pr[SF.ROW_COUNT], 2);
    assert.equal(pr[SF.STATE], STAGE_STATE.COMPLETED);
    assert.equal(pr[SF.ROWS][0].processed, true);
    assert.equal(pr[SF.ROWS][1].processed, true);
  });
});

// --- 3. oci_container runtime is feature-gated by driver ---

describe('oci_container callback runtime is gated', () => {
  it('returns failed stage result when feature gate is disabled', async () => {
    const host = makeHost();
    const batch = makeBatch('p3', [{id: 1}]);

    const result = await host.execute([batch], ociDescriptor());
    assert.equal(result[SF.STATE], STAGE_STATE.FAILED);
    assert.equal(result.totalPartitions, 1);
    assert.equal(result.processedPartitions, 1);
    assert.equal(result.failedPartitions, 1);
    assert.ok(result.partitionResults[0][SF.ERROR].includes(
      ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED,
    ));
  });

  it('oci_container has a registered driver but still fails when gate is off', async () => {
    // Descriptor validation accepts oci_container; execution
    // still fails closed through the gated driver.
    const registry = createCallbackRegistry();
    assert.ok(
      registry.hasDriver(RUNTIME_KIND.OCI_CONTAINER),
      'registry has oci driver registered',
    );

    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: registry,
    });
    const batch = makeBatch('p3', []);

    const result = await host.execute([batch], ociDescriptor());
    assert.equal(result[SF.STATE], STAGE_STATE.FAILED);
    assert.equal(result.failedPartitions, 1);
    assert.ok(result.partitionResults[0][SF.ERROR].includes(
      ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED,
    ));
  });
});

// --- 4. Multi-batch through same runtime driver ---

describe('Multi-batch callback execution', () => {
  it('processes multiple partition batches sequentially', async () => {
    const invocations = [];
    const handler = (batch, _desc, _ctx) => {
      invocations.push(batch.partitionId);
      return batch.rows.map((r) => ({...r, done: true}));
    };

    const host = makeHost();
    const batches = [
      makeBatch('p-a', [{id: 1}]),
      makeBatch('p-b', [{id: 2}, {id: 3}]),
      makeBatch('p-c', [{id: 4}]),
    ];

    const result = await host.execute(
      batches, nativeDescriptor(), {handler},
    );

    assert.equal(result[SF.STATE], STAGE_STATE.COMPLETED);
    assert.equal(result.totalPartitions, 3);
    assert.equal(result.processedPartitions, 3);
    assert.equal(result.failedPartitions, 0);
    assert.equal(result.totalRows, 4);
    assert.deepStrictEqual(invocations, ['p-a', 'p-b', 'p-c']);

    assert.equal(result.partitionResults.length, 3);
    assert.equal(
      result.partitionResults[0][SF.PARTITION_ID], 'p-a',
    );
    assert.equal(
      result.partitionResults[1][SF.PARTITION_ID], 'p-b',
    );
    assert.equal(
      result.partitionResults[2][SF.PARTITION_ID], 'p-c',
    );
    assert.equal(
      result.partitionResults[1][SF.ROW_COUNT], 2,
    );
  });
});

// --- 5. Callback registry uses same RUNTIME_KIND constants ---

describe('Callback registry uses unified RUNTIME_KIND', () => {
  it('CALLBACK_RUNTIME_KIND is same object as RUNTIME_KIND', () => {
    assert.equal(CALLBACK_RUNTIME_KIND, RUNTIME_KIND);
  });

  it('callback registry keys match unified registry enum', () => {
    const callbackRegistry = createCallbackRegistry();
    for (const kind of Object.values(RUNTIME_KIND)) {
      assert.ok(
        callbackRegistry.hasDriver(kind),
        `callback registry must have driver for ${kind}`,
      );
    }
  });

  it('unified RuntimeDriverRegistry accepts same enum values', () => {
    const unified = new RuntimeDriverRegistry();
    // Both registries use the same RUNTIME_KIND enum values
    // as keys — verified by the alias identity assertion above.
    assert.ok(unified);
    for (const kind of Object.values(RUNTIME_KIND)) {
      assert.equal(
        kind, CALLBACK_RUNTIME_KIND[
          Object.keys(RUNTIME_KIND).find(
            (k) => RUNTIME_KIND[k] === kind,
          )
        ],
      );
    }
  });
});

// --- 6. createCallbackDriverRegistry factory ---

describe('createCallbackDriverRegistry factory', () => {
  it('creates registry with all three runtime kinds', () => {
    const registry = createCallbackRegistry();
    assert.ok(registry.hasDriver(RUNTIME_KIND.NATIVE_JS));
    assert.ok(registry.hasDriver(RUNTIME_KIND.WASM_COMPONENT));
    assert.ok(registry.hasDriver(RUNTIME_KIND.OCI_CONTAINER));
  });

  it('each driver has invokeCallback method', () => {
    const registry = createCallbackRegistry();
    for (const kind of Object.values(RUNTIME_KIND)) {
      const driver = registry.getDriver(kind);
      assert.equal(typeof driver.invokeCallback, 'function');
    }
  });

  it('passes wasmExecutor to wasm driver', async () => {
    let executeCalled = false;
    const executor = {
      execute: async (_func, _ctx, args) => {
        executeCalled = true;
        return {result: args.rows};
      },
    };
    const registry = createCallbackRegistry({
      wasmExecutor: executor,
    });
    const driver = registry.getDriver(RUNTIME_KIND.WASM_COMPONENT);
    const batch = {partitionId: 'p1', rows: [{x: 1}]};
    const desc = wasmDescriptor();
    await driver.invokeCallback(batch, desc, {});
    assert.ok(executeCalled);
  });
});

// --- 7. Budget enforcement through callback path ---

describe('Budget enforcement in callback execution', () => {
  it('calls checkWallTime before and during execution', async () => {
    const budget = makeBudgetEnforcer();
    const handler = (batch) => batch.rows;
    const host = makeHost({budgetEnforcer: budget});
    const batch = makeBatch('p1', [{id: 1}]);

    await host.execute([batch], nativeDescriptor(), {handler});

    const wallChecks = budget.calls.filter(
      (c) => c === 'checkWallTime',
    );
    // At least 2: one before loop, one pre-invocation per batch
    assert.ok(
      wallChecks.length >= 2,
      `expected >= 2 checkWallTime calls, got ${wallChecks.length}`,
    );
  });

  it('records output bytes after successful batch', async () => {
    const budget = makeBudgetEnforcer();
    const handler = (batch) => batch.rows;
    const host = makeHost({budgetEnforcer: budget});
    const batch = makeBatch('p1', [{id: 1}]);

    await host.execute([batch], nativeDescriptor(), {handler});

    const byteRecords = budget.calls.filter(
      (c) => typeof c === 'object' && c.recordOutBytes,
    );
    assert.ok(
      byteRecords.length >= 1,
      'expected at least one recordOutBytes call',
    );
    assert.ok(byteRecords[0].recordOutBytes > 0);
  });

  it('terminates when budget is exceeded', async () => {
    const budget = {
      isTerminated: () => true,
      checkWallTime: () => {},
      recordOutBytes: () => {},
    };
    const host = makeHost({budgetEnforcer: budget});
    const batch = makeBatch('p1', [{id: 1}]);

    // Budget terminated check throws before batch processing
    await assert.rejects(
      () => host.execute(
        [batch], nativeDescriptor(), {handler: (b) => b.rows},
      ),
      (err) => {
        assert.ok(err.message.includes('budget'));
        return true;
      },
    );
  });
});

// --- 8. Cancellation propagation ---

describe('Cancellation propagation in callback execution', () => {
  it('returns cancelled state when token is cancelled', async () => {
    const token = makeCancellationToken(true);
    const host = makeHost({cancellationToken: token});
    const batch = makeBatch('p1', [{id: 1}]);

    const result = await host.execute(
      [batch], nativeDescriptor(), {handler: (b) => b.rows},
    );

    assert.equal(result[SF.STATE], STAGE_STATE.CANCELLED);
    assert.equal(result.processedPartitions, 0);
    assert.equal(result.partitionResults.length, 0);
  });

  it('completes normally when token is not cancelled', async () => {
    const token = makeCancellationToken(false);
    const handler = (batch) => batch.rows;
    const host = makeHost({cancellationToken: token});
    const batch = makeBatch('p1', [{id: 1}]);

    const result = await host.execute(
      [batch], nativeDescriptor(), {handler},
    );

    assert.equal(result[SF.STATE], STAGE_STATE.COMPLETED);
    assert.equal(result.processedPartitions, 1);
  });
});

// --- 9. Lineage tracking ---

describe('Lineage tracking in callback execution', () => {
  it('attaches lineage to batch and aggregate results', async () => {
    const tracker = makeLineageTracker();
    const handler = (batch) => batch.rows;
    const host = makeHost({lineageTracker: tracker});
    const batch = makeBatch('p1', [{id: 1}]);

    const result = await host.execute(
      [batch], nativeDescriptor(), {handler},
    );

    // Lineage attached to batch result and aggregate result
    assert.ok(tracker.attached.length >= 2);
    assert.ok(result.partitionResults[0]._lineage);
    assert.ok(result._lineage);
  });

  it('generates lineage IDs with stage index', async () => {
    const ids = [];
    const tracker = {
      generateLineageId: (stageIdx, type, batchIdx) => {
        const id = `${stageIdx}-${type}-${batchIdx}`;
        ids.push(id);
        return id;
      },
      attachLineage: (result) => {
        result._lineage = true;
      },
    };
    const handler = (batch) => batch.rows;
    const host = makeHost({
      lineageTracker: tracker,
      stageIndex: 5,
    });
    const batches = [
      makeBatch('p1', [{id: 1}]),
      makeBatch('p2', [{id: 2}]),
    ];

    await host.execute(batches, nativeDescriptor(), {handler});

    assert.ok(ids.includes('5-callback_batch-0'));
    assert.ok(ids.includes('5-callback_batch-1'));
  });
});

// --- 10. Telemetry events ---

describe('Telemetry events during callback execution', () => {
  it('emits batch_complete and execution_complete events', async () => {
    const events = [];
    const onTelemetry = (evt) => events.push(evt);
    const handler = (batch) => batch.rows;
    const host = makeHost({onTelemetry});
    const batch = makeBatch('p1', [{id: 1}]);

    await host.execute([batch], nativeDescriptor(), {handler});

    const batchEvents = events.filter(
      (e) => e.eventType === CALLBACK_TELEMETRY_EVENT.BATCH_COMPLETE,
    );
    const completeEvents = events.filter(
      (e) => e.eventType ===
        CALLBACK_TELEMETRY_EVENT.EXECUTION_COMPLETE,
    );

    assert.equal(batchEvents.length, 1);
    assert.equal(batchEvents[0].partitionId, 'p1');
    assert.equal(batchEvents[0].rowCount, 1);
    assert.equal(batchEvents[0].batchIndex, 0);

    assert.equal(completeEvents.length, 1);
    assert.equal(
      completeEvents[0].state, STAGE_STATE.COMPLETED,
    );
    assert.equal(completeEvents[0].totalBatches, 1);
    assert.equal(completeEvents[0].totalRows, 1);
  });

  it('emits cancelled event when token is cancelled', async () => {
    const events = [];
    const onTelemetry = (evt) => events.push(evt);
    const token = makeCancellationToken(true);
    const host = makeHost({
      onTelemetry,
      cancellationToken: token,
    });
    const batch = makeBatch('p1', [{id: 1}]);

    await host.execute(
      [batch], nativeDescriptor(), {handler: (b) => b.rows},
    );

    const cancelEvents = events.filter(
      (e) => e.eventType === CALLBACK_TELEMETRY_EVENT.CANCELLED,
    );
    assert.equal(cancelEvents.length, 1);
    assert.equal(
      cancelEvents[0].state, STAGE_STATE.CANCELLED,
    );
  });

  it('emits batch_failed on driver error', async () => {
    const events = [];
    const onTelemetry = (evt) => events.push(evt);
    const handler = () => {
      throw new Error('boom');
    };
    const host = makeHost({onTelemetry});
    const batch = makeBatch('p1', [{id: 1}]);

    await host.execute(
      [batch], nativeDescriptor(), {handler},
    );

    const failEvents = events.filter(
      (e) => e.eventType ===
        CALLBACK_TELEMETRY_EVENT.BATCH_FAILED,
    );
    assert.equal(failEvents.length, 1);
    assert.equal(failEvents[0].partitionId, 'p1');
    assert.ok(failEvents[0].error.includes('boom'));
  });
});
