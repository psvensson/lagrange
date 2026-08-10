/**
 * Tests for CallbackExecutionHost.
 *
 * Validates: Requirements 1.3, 14.2, 14.3
 *
 * Verifies that the Callback_Execution_Host is the single
 * callback invocation surface with budget/cancellation/lineage/
 * dedupe enforcement per batch. All callback invocation goes
 * through the runtime driver registry — no fallback handler
 * path exists.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CallbackExecutionHost,
  validateDescriptor,
} from '../../src/query/callback/callback-execution-host.js';
import {
  buildPartitionReadFailureHostResult,
  mergePartitionReadFailuresIntoHostResult,
} from '../../src/query/callback/partition-callback-dispatcher.js';
import {ADAPTER_ERROR_MSG, CALLBACK_RUNTIME_KIND} from
  '../../src/query/sql-adapter-constants.js';
import {STAGE_STATE} from
  '../../src/query/callback/callback-stage-constants.js';
import {LineageTracker} from
  '../../src/query/lineage-tracker.js';
import {DedupeRegistry} from
  '../../src/query/dedupe-registry.js';
import {CancellationToken} from
  '../../src/query/cancellation-token.js';
import {createCallbackDriverRegistry} from
  '../../src/query/callback/callback-runtime-driver-registry.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {BudgetEnforcer} from
  '../../src/query/budget-enforcer.js';
import {ExecutionContext} from
  '../../src/query/execution-context.js';
import {
  NESTED_CALL_ERROR_MSG,
} from '../../src/query/runtime-constants.js';
import {
  CALLBACK_TELEMETRY_EVENT as CTE,
  CALLBACK_TELEMETRY_FIELD as CTF,
} from '../../src/query/callback/callback-stage-constants.js';

// --- Helpers ---

function makeDescriptor(overrides = {}) {
  return {
    callbackModuleRef: overrides.callbackModuleRef || 'mod-1',
    callbackExport: overrides.callbackExport || 'run_batch',
    runtimeKind: overrides.runtimeKind ||
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
  };
}

function makeBatches(count) {
  const batches = [];
  for (let i = 0; i < count; i++) {
    batches.push({
      partitionId: `p${i}`,
      rows: [{id: i + 1}],
    });
  }
  return batches;
}

/**
 * Create a registry pre-configured with all standard drivers.
 * The native_js driver delegates to options.handler.
 */
function makeRegistry() {
  const runtimeWiring = createRuntimeStartupWiring();
  return createCallbackDriverRegistry({
    runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
  });
}

// --- Descriptor validation ---

test('validateDescriptor - throws when descriptor is null',
  async (t) => {
    try {
      validateDescriptor(null);
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.CALLBACK_HOST_DESCRIPTOR_REQUIRED);
    }
  });

test('validateDescriptor - throws when callbackModuleRef missing',
  async (t) => {
    try {
      validateDescriptor({
        callbackExport: 'run',
        runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
      });
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.CALLBACK_HOST_MODULE_REF_REQUIRED);
    }
  });

test('validateDescriptor - throws when callbackExport missing',
  async (t) => {
    try {
      validateDescriptor({
        callbackModuleRef: 'mod-1',
        runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
      });
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.CALLBACK_HOST_EXPORT_REQUIRED);
    }
  });

test('validateDescriptor - throws when runtimeKind missing',
  async (t) => {
    try {
      validateDescriptor({
        callbackModuleRef: 'mod-1',
        callbackExport: 'run',
      });
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.CALLBACK_HOST_RUNTIME_KIND_REQUIRED);
    }
  });

test('validateDescriptor - throws for unsupported runtime kind',
  async (t) => {
    try {
      validateDescriptor({
        callbackModuleRef: 'mod-1',
        callbackExport: 'run',
        runtimeKind: 'unknown_runtime',
      });
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('unknown_runtime'));
    }
  });

test('validateDescriptor - accepts native_js', async (t) => {
  validateDescriptor(makeDescriptor({
    runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
  }));
  t.pass('no error thrown');
});

test('validateDescriptor - accepts wasm_component', async (t) => {
  validateDescriptor(makeDescriptor({
    runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
  }));
  t.pass('no error thrown');
});

// --- Core execution via registry ---

test('execute - processes single batch via registry',
  async (t) => {
    const handler =
      (batch, _desc) => [{id: batch.rows[0].id * 10}];

    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
    });
    const result = await host.execute(
      makeBatches(1),
      makeDescriptor(),
      {handler},
    );

    t.equal(result.state, STAGE_STATE.COMPLETED);
    t.equal(result.totalPartitions, 1);
    t.equal(result.processedPartitions, 1);
    t.equal(result.failedPartitions, 0);
    t.equal(result.partitionResults.length, 1);
    t.equal(result.partitionResults[0].partitionId, 'p0');
    t.same(result.partitionResults[0].rows, [{id: 10}]);
  });

test('execute - processes multiple batches sequentially',
  async (t) => {
    const invocations = [];
    const handler = (batch, _desc) => {
      invocations.push(batch.partitionId);
      return batch.rows;
    };

    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
    });
    const result = await host.execute(
      makeBatches(3),
      makeDescriptor(),
      {handler},
    );

    t.equal(result.state, STAGE_STATE.COMPLETED);
    t.equal(result.totalPartitions, 3);
    t.equal(result.processedPartitions, 3);
    t.same(invocations, ['p0', 'p1', 'p2']);
  });

test('execute - throws when batches is null', async (t) => {
  const host = new CallbackExecutionHost({
    runtimeDriverRegistry: makeRegistry(),
  });
  try {
    await host.execute(null, makeDescriptor());
    t.fail('should have thrown');
  } catch (err) {
    t.equal(err.message,
      ADAPTER_ERROR_MSG.CALLBACK_HOST_BATCHES_REQUIRED);
  }
});

test('execute - throws when batches is not array', async (t) => {
  const host = new CallbackExecutionHost({
    runtimeDriverRegistry: makeRegistry(),
  });
  try {
    await host.execute('not-array', makeDescriptor());
    t.fail('should have thrown');
  } catch (err) {
    t.equal(err.message,
      ADAPTER_ERROR_MSG.CALLBACK_HOST_BATCHES_REQUIRED);
  }
});

test('execute - handles empty batches array', async (t) => {
  const host = new CallbackExecutionHost({
    runtimeDriverRegistry: makeRegistry(),
  });
  const result = await host.execute(
    [], makeDescriptor(), {handler: () => []},
  );

  t.equal(result.state, STAGE_STATE.COMPLETED);
  t.equal(result.totalPartitions, 0);
  t.equal(result.processedPartitions, 0);
});

// --- Read-failure host result semantics (ARCH-0139) ---

test('host result - empty-because-failed is distinguishable from ' +
  'succeeded-with-zero-rows', async (t) => {
  const host = new CallbackExecutionHost({
    runtimeDriverRegistry: makeRegistry(),
  });

  // Succeeded with zero rows: every partition read produced a batch,
  // the callback ran, and there were simply no rows.
  const zeroRowBatches = [
    {partitionId: 'p0', rows: []},
  ];
  const zeroRowResult = await host.execute(
    zeroRowBatches, makeDescriptor(), {handler: () => []},
  );
  t.equal(zeroRowResult.state, STAGE_STATE.COMPLETED);
  t.equal(zeroRowResult.totalPartitions, 1);
  t.equal(zeroRowResult.failedPartitions, 0);
  t.equal(zeroRowResult.totalRows, 0);
  t.equal(zeroRowResult.failedPartitionReads, undefined);

  // Empty because failed: the partition read never produced a batch.
  // The merged aggregate records the partition as failed and carries
  // the typed read-failure entry — a different observable outcome.
  const readFailure = {
    partitionId: 'p0',
    error: 'partition read failed: ack timeout',
    errorCode: 'TIMEOUT',
    participantNodeId: 'node-9',
    retryAfterMs: 25,
    backpressured: true,
  };
  const emptyHostResult = await host.execute(
    [], makeDescriptor(), {handler: () => []},
  );
  const failedResult = mergePartitionReadFailuresIntoHostResult(
    emptyHostResult,
    [readFailure],
  );
  t.equal(failedResult.state, STAGE_STATE.FAILED);
  t.equal(failedResult.totalPartitions, 1);
  t.equal(failedResult.failedPartitions, 1);
  t.same(failedResult.failedPartitionReads, [readFailure]);
});

test('host result - merge keeps invocation counts and adds read ' +
  'failures on partial outcomes', async (t) => {
  const host = new CallbackExecutionHost({
    runtimeDriverRegistry: makeRegistry(),
  });
  const result = await host.execute(
    makeBatches(2), makeDescriptor(), {handler: (batch) => batch.rows},
  );
  const readFailure = {
    partitionId: 'p9',
    error: 'partition read failed: ack timeout',
  };
  const merged = mergePartitionReadFailuresIntoHostResult(
    result,
    [readFailure],
  );

  t.equal(merged.state, STAGE_STATE.FAILED);
  t.equal(merged.totalPartitions, 3);
  t.equal(merged.processedPartitions, 2);
  t.equal(merged.failedPartitions, 1);
  t.same(merged.failedPartitionReads, [readFailure]);

  // No read failures: the host result passes through untouched.
  const untouched = mergePartitionReadFailuresIntoHostResult(result, []);
  t.equal(untouched, result);
});

test('host result - all-reads-failed synthesized aggregate records ' +
  'every partition as failed', async (t) => {
  const readFailures = [
    {partitionId: 'p0', error: 'partition read failed: ack timeout'},
    {partitionId: 'p1', error: 'partition read failed: ack timeout'},
  ];
  const synthesized = buildPartitionReadFailureHostResult(readFailures);

  t.equal(synthesized.state, STAGE_STATE.FAILED);
  t.equal(synthesized.totalPartitions, 2);
  t.equal(synthesized.processedPartitions, 0);
  t.equal(synthesized.failedPartitions, 2);
  t.same(synthesized.failedPartitionReads, readFailures);
  t.equal(synthesized.totalRows, 0);
});

// --- Failure handling ---

test('execute - marks batch as failed on handler error',
  async (t) => {
    const handler = () => {
      throw new Error('handler boom');
    };

    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
    });
    const result = await host.execute(
      makeBatches(2),
      makeDescriptor(),
      {handler},
    );

    t.equal(result.state, STAGE_STATE.FAILED);
    t.equal(result.failedPartitions, 2);
    t.equal(result.partitionResults[0].state,
      STAGE_STATE.FAILED);
    t.equal(result.partitionResults[0].error,
      'handler boom');
  });

test('execute - mixed success and failure', async (t) => {
  let callCount = 0;
  const handler = () => {
    callCount++;
    if (callCount === 2) throw new Error('fail p1');
    return [{ok: true}];
  };

  const host = new CallbackExecutionHost({
    runtimeDriverRegistry: makeRegistry(),
  });
  const result = await host.execute(
    makeBatches(3),
    makeDescriptor(),
    {handler},
  );

  t.equal(result.state, STAGE_STATE.FAILED);
  t.equal(result.failedPartitions, 1);
  t.equal(result.partitionResults[0].state,
    STAGE_STATE.COMPLETED);
  t.equal(result.partitionResults[1].state,
    STAGE_STATE.FAILED);
  t.equal(result.partitionResults[2].state,
    STAGE_STATE.COMPLETED);
});

// --- Cancellation ---

test('execute - returns cancelled when token already cancelled',
  async (t) => {
    const token = new CancellationToken();
    token.cancel('user abort');

    const host = new CallbackExecutionHost({
      cancellationToken: token,
      runtimeDriverRegistry: makeRegistry(),
    });
    const result = await host.execute(
      makeBatches(2),
      makeDescriptor(),
      {handler: () => []},
    );

    t.equal(result.state, STAGE_STATE.CANCELLED);
    t.equal(result.processedPartitions, 0);
    t.equal(result.cancelReason, 'user abort');
  });

test('execute - stops processing on mid-execution cancel',
  async (t) => {
    const token = new CancellationToken();
    let callCount = 0;
    const handler = () => {
      callCount++;
      if (callCount === 1) token.cancel('timeout');
      return [];
    };

    const host = new CallbackExecutionHost({
      cancellationToken: token,
      runtimeDriverRegistry: makeRegistry(),
    });
    const result = await host.execute(
      makeBatches(3),
      makeDescriptor(),
      {handler},
    );

    t.equal(result.state, STAGE_STATE.CANCELLED);
    t.ok(result.processedPartitions <= 2);
  });

// --- Lineage tracking ---

test('execute - attaches lineage IDs when tracker provided',
  async (t) => {
    const tracker = new LineageTracker('q-123');
    const host = new CallbackExecutionHost({
      lineageTracker: tracker,
      runtimeDriverRegistry: makeRegistry(),
    });

    const result = await host.execute(
      makeBatches(2),
      makeDescriptor(),
      {handler: (batch) => batch.rows},
    );

    t.equal(result.state, STAGE_STATE.COMPLETED);
    t.ok(result.lineageId);
    t.ok(result.lineageId.includes('q-123'));
    t.ok(result.partitionResults[0].lineageId);
    t.ok(result.partitionResults[1].lineageId);
    t.not(result.partitionResults[0].lineageId,
      result.partitionResults[1].lineageId);
  });

// --- Dedupe registry ---

test('execute - skips duplicate batch on retry via dedupe',
  async (t) => {
    const tracker = new LineageTracker('q-456');
    const registry = new DedupeRegistry();
    let invokeCount = 0;

    const handler = (batch) => {
      invokeCount++;
      return batch.rows;
    };

    const driverRegistry = makeRegistry();

    const host1 = new CallbackExecutionHost({
      lineageTracker: tracker,
      dedupeRegistry: registry,
      runtimeDriverRegistry: driverRegistry,
    });
    await host1.execute(
      makeBatches(1), makeDescriptor(), {handler},
    );
    t.equal(invokeCount, 1);

    const host2 = new CallbackExecutionHost({
      lineageTracker: tracker,
      dedupeRegistry: registry,
      runtimeDriverRegistry: driverRegistry,
    });
    const result = await host2.execute(
      makeBatches(1), makeDescriptor(), {handler},
    );

    t.equal(invokeCount, 1);
    t.equal(result.partitionResults.length, 1);
    t.equal(result.partitionResults[0].partitionId, 'p0');
  });

// --- Budget enforcement ---

test('execute - throws when budget is terminated', async (t) => {
  const budgetEnforcer = {
    isTerminated: () => true,
    checkWallTime: () => {},
  };

  const host = new CallbackExecutionHost({
    budgetEnforcer,
    runtimeDriverRegistry: makeRegistry(),
  });
  try {
    await host.execute(
      makeBatches(1), makeDescriptor(), {handler: () => []},
    );
    t.fail('should have thrown');
  } catch (err) {
    t.equal(err.message,
      ADAPTER_ERROR_MSG.CALLBACK_HOST_BUDGET_TERMINATED);
  }
});

test('execute - calls checkWallTime before each batch',
  async (t) => {
    let wallChecks = 0;
    const budgetEnforcer = {
      isTerminated: () => false,
      checkWallTime: () => {
        wallChecks++;
      },
      recordOutBytes: () => {},
    };

    const host = new CallbackExecutionHost({
      budgetEnforcer,
      runtimeDriverRegistry: makeRegistry(),
    });
    await host.execute(
      makeBatches(3), makeDescriptor(),
      {handler: (batch) => batch.rows},
    );

    // 1 initial check + 3 pre-batch + 3 post-batch = 7
    t.ok(wallChecks >= 4);
  });

// --- Runtime driver registry ---

test('execute - uses runtime driver registry when provided',
  async (t) => {
    let driverCalled = false;
    const registry = {
      getDriver: (kind) => {
        t.equal(kind, CALLBACK_RUNTIME_KIND.NATIVE_JS);
        return {
          invokeCallback: async (batch, desc, _opts) => {
            driverCalled = true;
            return [{processed: desc.callbackExport}];
          },
        };
      },
    };

    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: registry,
    });
    const result = await host.execute(
      makeBatches(1), makeDescriptor(), {},
    );

    t.ok(driverCalled);
    t.equal(result.state, STAGE_STATE.COMPLETED);
    t.same(result.partitionResults[0].rows,
      [{processed: 'run_batch'}]);
  });

// --- No parallel path ---

test('execute - fails when no registry provided',
  async (t) => {
    const host = new CallbackExecutionHost();
    const result = await host.execute(
      makeBatches(1), makeDescriptor(), {},
    );

    t.equal(result.state, STAGE_STATE.FAILED);
    t.equal(result.failedPartitions, 1);
    t.ok(result.partitionResults[0].error.includes(
      'Unsupported runtime kind'));
  });

// --- Callback context wiring (Requirement 14.4) ---

function makeExecContext() {
  return new ExecutionContext({
    session: 'test-session',
    snapshot: {mode: 'readCommitted'},
    budgetEnforcer: new BudgetEnforcer(),
    cancellationToken: new CancellationToken(),
    lineageTracker: new LineageTracker('ctx-test'),
    queryExecutor: async () => ({rows: []}),
  });
}

test('execute - passes bounded callback context to handler',
  async (t) => {
    let receivedCtx = null;
    const handler = (_batch, _desc, cbCtx) => {
      receivedCtx = cbCtx;
      return [];
    };

    const execCtx = makeExecContext();
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
      executionContext: execCtx,
    });
    await host.execute(
      makeBatches(1), makeDescriptor(), {handler},
    );

    t.ok(receivedCtx, 'callback context was provided');
    t.equal(typeof receivedCtx.emit, 'function');
    t.equal(typeof receivedCtx.out, 'function');
    t.equal(typeof receivedCtx.lookup, 'function');
    t.equal(typeof receivedCtx.broadcast, 'function');
    t.equal(typeof receivedCtx.useBroadcast, 'function');
    t.equal(typeof receivedCtx.call, 'function');
    t.equal(typeof receivedCtx.isCancelled, 'function');
    t.equal(typeof receivedCtx.throwIfCancelled, 'function');
    t.ok(Object.isFrozen(receivedCtx));
  });

test('execute - callback context rejects unbounded nested call',
  async (t) => {
    let caughtError = null;
    const handler = async (_batch, _desc, cbCtx) => {
      try {
        await cbCtx.call('SELECT * FROM users');
      } catch (err) {
        caughtError = err;
      }
      return [];
    };

    const execCtx = makeExecContext();
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
      executionContext: execCtx,
    });
    await host.execute(
      makeBatches(1), makeDescriptor(), {handler},
    );

    t.ok(caughtError, 'unbounded call was rejected');
    t.equal(caughtError.message,
      NESTED_CALL_ERROR_MSG.UNBOUNDED_REJECTED);
  });

test('execute - callback context allows bounded nested call',
  async (t) => {
    let callSucceeded = false;
    const handler = async (_batch, _desc, cbCtx) => {
      // pk point lookup is bounded — should not throw
      await cbCtx.call(
        'SELECT * FROM t WHERE id = ?', [1],
      );
      callSucceeded = true;
      return [];
    };

    const execCtx = makeExecContext();
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
      executionContext: execCtx,
    });
    await host.execute(
      makeBatches(1), makeDescriptor(), {handler},
    );

    t.ok(callSucceeded, 'bounded call was allowed');
  });

test('execute - no callback context when no executionContext',
  async (t) => {
    let receivedCtx = 'sentinel';
    const handler = (_batch, _desc, cbCtx) => {
      receivedCtx = cbCtx;
      return [];
    };

    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
    });
    await host.execute(
      makeBatches(1), makeDescriptor(), {handler},
    );

    t.equal(receivedCtx, null,
      'no callback context when executionContext absent');
  });

// --- Telemetry emission (Requirement 13.3, 14.5) ---

test('execute - emits per-batch and aggregate telemetry',
  async (t) => {
    const events = [];
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
      onTelemetry: (data) => events.push(data),
    });
    await host.execute(
      makeBatches(2), makeDescriptor(),
      {handler: (batch) => batch.rows},
    );

    // 2 per-batch + 1 aggregate = 3 events
    t.equal(events.length, 3);
    t.equal(events[0][CTF.EVENT_TYPE], CTE.BATCH_COMPLETE);
    t.equal(events[0][CTF.PARTITION_ID], 'p0');
    t.equal(events[0][CTF.BATCH_INDEX], 0);
    t.equal(events[0][CTF.ROW_COUNT], 1);
    t.ok(events[0][CTF.BYTE_ESTIMATE] > 0);
    t.equal(events[1][CTF.EVENT_TYPE], CTE.BATCH_COMPLETE);
    t.equal(events[1][CTF.PARTITION_ID], 'p1');
    // Aggregate event
    t.equal(events[2][CTF.EVENT_TYPE],
      CTE.EXECUTION_COMPLETE);
    t.equal(events[2][CTF.TOTAL_BATCHES], 2);
    t.equal(events[2][CTF.TOTAL_ROWS], 2);
    t.ok(events[2][CTF.TOTAL_BYTES] > 0);
    t.equal(events[2][CTF.STATE], STAGE_STATE.COMPLETED);
  });

test('execute - emits failure telemetry on handler error',
  async (t) => {
    const events = [];
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
      onTelemetry: (data) => events.push(data),
    });
    await host.execute(
      makeBatches(1), makeDescriptor(),
      {handler: () => {
        throw new Error('boom');
      }},
    );

    t.equal(events.length, 2);
    t.equal(events[0][CTF.EVENT_TYPE], CTE.BATCH_FAILED);
    t.equal(events[0][CTF.PARTITION_ID], 'p0');
    t.equal(events[0][CTF.ERROR], 'boom');
    t.equal(events[1][CTF.EVENT_TYPE],
      CTE.EXECUTION_COMPLETE);
    t.equal(events[1][CTF.STATE], STAGE_STATE.FAILED);
  });

test('execute - emits cancelled telemetry', async (t) => {
  const token = new CancellationToken();
  token.cancel('timeout');
  const events = [];
  const host = new CallbackExecutionHost({
    cancellationToken: token,
    runtimeDriverRegistry: makeRegistry(),
    onTelemetry: (data) => events.push(data),
  });
  await host.execute(
    makeBatches(2), makeDescriptor(),
    {handler: () => []},
  );

  // Only aggregate event (no batches processed)
  t.equal(events.length, 1);
  t.equal(events[0][CTF.EVENT_TYPE], CTE.CANCELLED);
  t.equal(events[0][CTF.STATE], STAGE_STATE.CANCELLED);
});

test('execute - emits dedupe skip telemetry on retry',
  async (t) => {
    const tracker = new LineageTracker('q-tel');
    const registry = new DedupeRegistry();
    const events = [];

    const host1 = new CallbackExecutionHost({
      lineageTracker: tracker,
      dedupeRegistry: registry,
      runtimeDriverRegistry: makeRegistry(),
    });
    await host1.execute(
      makeBatches(1), makeDescriptor(),
      {handler: (batch) => batch.rows},
    );

    // Second execution with same lineage — dedupe skip
    const host2 = new CallbackExecutionHost({
      lineageTracker: tracker,
      dedupeRegistry: registry,
      runtimeDriverRegistry: makeRegistry(),
      onTelemetry: (data) => events.push(data),
    });
    await host2.execute(
      makeBatches(1), makeDescriptor(),
      {handler: () => {
        throw new Error('should not run');
      }},
    );

    const dedupeEvents = events.filter(
      (e) => e[CTF.EVENT_TYPE] === CTE.DEDUPE_SKIP,
    );
    t.equal(dedupeEvents.length, 1);
    t.equal(dedupeEvents[0][CTF.PARTITION_ID], 'p0');
    t.equal(dedupeEvents[0][CTF.BATCH_INDEX], 0);
  });

// --- Budget enforcement across all dimensions (Req 9.1) ---

test('execute - records output bytes in budget enforcer',
  async (t) => {
    let recordedBytes = 0;
    const budgetEnforcer = {
      isTerminated: () => false,
      checkWallTime: () => {},
      recordOutBytes: (bytes) => {
        recordedBytes += bytes;
      },
    };

    const host = new CallbackExecutionHost({
      budgetEnforcer,
      runtimeDriverRegistry: makeRegistry(),
    });
    await host.execute(
      makeBatches(2), makeDescriptor(),
      {handler: (batch) => batch.rows},
    );

    t.ok(recordedBytes > 0,
      'output bytes were recorded in budget enforcer');
  });

test('execute - budget recordOutBytes throws terminates batch',
  async (t) => {
    const budgetEnforcer = {
      isTerminated: () => false,
      checkWallTime: () => {},
      recordOutBytes: () => {
        throw new Error('out bytes exceeded');
      },
    };

    const events = [];
    const host = new CallbackExecutionHost({
      budgetEnforcer,
      runtimeDriverRegistry: makeRegistry(),
      onTelemetry: (data) => events.push(data),
    });
    const result = await host.execute(
      makeBatches(1), makeDescriptor(),
      {handler: (batch) => batch.rows},
    );

    t.equal(result.state, STAGE_STATE.FAILED);
    t.equal(result.partitionResults[0].state,
      STAGE_STATE.FAILED);
    t.ok(result.partitionResults[0].error.includes(
      'out bytes exceeded'));
    const failEvents = events.filter(
      (e) => e[CTF.EVENT_TYPE] === CTE.BATCH_FAILED,
    );
    t.equal(failEvents.length, 1);
  });

// --- Cancellation timeout propagation (Req 9.5) ---

test('execute - mid-batch cancellation propagates to result',
  async (t) => {
    const token = new CancellationToken();
    const events = [];
    const host = new CallbackExecutionHost({
      cancellationToken: token,
      runtimeDriverRegistry: makeRegistry(),
      onTelemetry: (data) => events.push(data),
    });

    let callCount = 0;
    const result = await host.execute(
      makeBatches(3), makeDescriptor(),
      {handler: () => {
        callCount++;
        if (callCount === 2) token.cancel('wall_time');
        return [];
      }},
    );

    t.equal(result.state, STAGE_STATE.CANCELLED);
    t.ok(result.processedPartitions < 3);
    const aggEvent = events.find(
      (e) => e[CTF.EVENT_TYPE] === CTE.CANCELLED ||
             e[CTF.EVENT_TYPE] === CTE.EXECUTION_COMPLETE,
    );
    t.ok(aggEvent, 'aggregate telemetry was emitted');
  });

// --- Aggregate result includes telemetry fields ---

test('execute - aggregate result includes totalRows/Bytes',
  async (t) => {
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
    });
    const result = await host.execute(
      makeBatches(2), makeDescriptor(),
      {handler: (batch) => batch.rows},
    );

    t.equal(result.totalRows, 2);
    t.ok(result.totalBytes > 0);
    t.equal(typeof result.totalDurationMs, 'number');
    // Per-batch results include byteEstimate
    t.ok(result.partitionResults[0].byteEstimate > 0);
  });

// --- No telemetry callback — silent (no crash) ---

test('execute - works without onTelemetry callback',
  async (t) => {
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
    });
    const result = await host.execute(
      makeBatches(1), makeDescriptor(),
      {handler: (batch) => batch.rows},
    );

    t.equal(result.state, STAGE_STATE.COMPLETED);
    t.equal(result.totalRows, 1);
  });

test('execute - emits lineage-correlated traces through collector',
  async (t) => {
    const traceEvents = [];
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: makeRegistry(),
      lineageTracker: new LineageTracker('q-trace'),
      stageIndex: 3,
      executionContext: makeExecContext(),
      debugSessionResolver: {
        isTraceActive: (scope) => Boolean(scope.lineageId),
      },
      traceCollector: {
        emit: (event) => traceEvents.push(event),
      },
      nodeId: 'node-a',
      serviceDefinitionId: 'svc-a',
      replicaId: 'replica-a',
    });

    const result = await host.execute(
      makeBatches(1),
      makeDescriptor(),
      {
        handler: (_batch, _descriptor, callbackContext) => {
          callbackContext.debug.trace('info', 'callback trace', {step: 1});
          return [];
        },
      },
    );

    t.equal(result.state, STAGE_STATE.COMPLETED);
    t.equal(traceEvents.length, 1, 'should emit one callback trace event');
    t.equal(traceEvents[0].source, 'partition_callback');
    t.equal(traceEvents[0].serviceDefinitionId, 'svc-a');
    t.equal(traceEvents[0].nodeId, 'node-a');
    t.equal(traceEvents[0].replicaId, 'replica-a');
    t.ok(String(traceEvents[0].lineageId).startsWith('q-trace'));
  });
