/**
 * Tests for ServiceRuntimeLifecycle operation journaling integration.
 *
 * Validates: Requirements 6.4, 11.1, 11.3
 *
 * The lifecycle owner coordinates all operation state transitions
 * through the existing operation lifecycle module. Drivers must NOT
 * maintain ad-hoc mutation state.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {
  RuntimeDriver,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {
  OperationJournalError,
} from '../../src/runtime/runtime-driver-errors.js';
import {
  RUNTIME_KIND,
  OPERATION_JOURNAL_EVENT,
  LIFECYCLE_OPERATION,
} from '../../src/constants/runtime.js';
import {WASM_OPERATION_STATE} from '../../src/constants/wasm-meta.js';

// --- Test drivers ---

class StubDriver extends RuntimeDriver {
  constructor(kind = RUNTIME_KIND.NATIVE_JS) {
    super(kind);
  }
  validateDescriptor(_d) {
    return {valid: true};
  }
  async prepare(_d, _c) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_c) {
    return {status: START_STATUS.RUNNING};
  }
  async stop(_c) {}
  async health(_c) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class FailingDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor(_d) {
    return {valid: true};
  }
  async prepare(_d, _c) {
    throw new Error('prepare boom');
  }
  async start(_c) {
    throw new Error('start boom');
  }
  async stop(_c) {
    throw new Error('stop boom');
  }
  async health(_c) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

// --- Helpers ---

function makeRegistry(...drivers) {
  const registry = new RuntimeDriverRegistry();
  for (const d of drivers) {
    registry.register(d);
  }
  registry.freeze();
  return registry;
}

function runtimeDef(kind, serviceId = 'svc-1') {
  const definition = {runtime_kind: kind, serviceId};
  if (kind === RUNTIME_KIND.WASM_COMPONENT) {
    definition.runtime_ref = `${serviceId}-module@sha256:test`;
  } else if (kind === RUNTIME_KIND.OCI_CONTAINER) {
    definition.runtime_ref = `registry.example/${serviceId}@sha256:test`;
  }
  return definition;
}

function nativeDef(serviceId = 'svc-1') {
  return runtimeDef(RUNTIME_KIND.NATIVE_JS, serviceId);
}

function replicaCtx(definition) {
  return {definition};
}

/**
 * Create a lifecycle instance with a spy operation writer.
 * Returns {lifecycle, writes} where writes is an array of
 * {sql, params} objects recorded by the writer.
 */
function lifecycleWithJournal(...drivers) {
  const registry = makeRegistry(...drivers);
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  const writes = [];
  lifecycle.setOperationWriter(async (sql, params) => {
    writes.push({sql, params});
  });
  return {lifecycle, writes};
}

// --- setOperationWriter ---

describe('ServiceRuntimeLifecycle setOperationWriter', () => {
  it('should accept a function', () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.setOperationWriter(async () => {});
  });

  it('should reject non-function', () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    assert.throws(
      () => lifecycle.setOperationWriter('not-a-fn'),
      (err) => err instanceof TypeError,
    );
  });

  it('should reject null', () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    assert.throws(
      () => lifecycle.setOperationWriter(null),
      (err) => err instanceof TypeError,
    );
  });
});


// --- prepare operation journaling ---

describe('ServiceRuntimeLifecycle prepare journaling', () => {
  it('should create and complete operation on success', async () => {
    const {lifecycle, writes} = lifecycleWithJournal(new StubDriver());
    await lifecycle.prepare(nativeDef('j-svc'), {});

    // 3 writes: create (PENDING), transition PENDING->IN_PROGRESS,
    // transition IN_PROGRESS->COMPLETED
    assert.equal(writes.length, 3);
    assert.ok(writes[0].sql.includes('INSERT'));
    assert.ok(writes[1].sql.includes('UPDATE'));
    assert.ok(writes[2].sql.includes('UPDATE'));
  });

  it('should emit OPERATION_CREATED event', async () => {
    const {lifecycle} = lifecycleWithJournal(new StubDriver());
    const events = [];
    lifecycle.on(
      OPERATION_JOURNAL_EVENT.OPERATION_CREATED, (e) => events.push(e),
    );

    await lifecycle.prepare(nativeDef('ev-svc'), {});

    assert.equal(events.length, 1);
    assert.equal(events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS);
    assert.equal(events[0].serviceId, 'ev-svc');
    assert.equal(events[0].command, LIFECYCLE_OPERATION.PREPARE);
    assert.equal(events[0].state, WASM_OPERATION_STATE.PENDING);
    assert.ok(events[0].operationId);
  });

  it('should emit OPERATION_TRANSITIONED events', async () => {
    const {lifecycle} = lifecycleWithJournal(new StubDriver());
    const events = [];
    lifecycle.on(
      OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED,
      (e) => events.push(e),
    );

    await lifecycle.prepare(nativeDef('tr-svc'), {});

    assert.equal(events.length, 2);
    // PENDING -> IN_PROGRESS
    assert.equal(events[0].fromState, WASM_OPERATION_STATE.PENDING);
    assert.equal(events[0].toState, WASM_OPERATION_STATE.IN_PROGRESS);
    // IN_PROGRESS -> COMPLETED
    assert.equal(events[1].fromState, WASM_OPERATION_STATE.IN_PROGRESS);
    assert.equal(events[1].toState, WASM_OPERATION_STATE.COMPLETED);
  });

  it('should transition to FAILED on driver error', async () => {
    const {lifecycle, writes} = lifecycleWithJournal(new FailingDriver());

    await assert.rejects(
      () => lifecycle.prepare(nativeDef('fail-svc'), {}),
    );

    // 3 writes: create, PENDING->IN_PROGRESS, IN_PROGRESS->FAILED
    assert.equal(writes.length, 3);
  });

  it('should not journal when no writer configured', async () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    // No setOperationWriter call
    const result = await lifecycle.prepare(nativeDef(), {});
    assert.equal(result.status, PREPARE_STATUS.READY);
  });

  it('should throw OperationJournalError on writer failure', async () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.setOperationWriter(async () => {
      throw new Error('SQL write failed');
    });

    await assert.rejects(
      () => lifecycle.prepare(nativeDef('wr-fail'), {}),
      (err) => {
        assert.ok(err instanceof OperationJournalError);
        assert.equal(err.runtimeKind, RUNTIME_KIND.NATIVE_JS);
        assert.equal(err.serviceId, 'wr-fail');
        assert.ok(err.message.includes('create failed'));
        return true;
      },
    );
  });
});

// --- start operation journaling ---

describe('ServiceRuntimeLifecycle start journaling', () => {
  it('should create and complete operation on success', async () => {
    const {lifecycle, writes} = lifecycleWithJournal(new StubDriver());
    await lifecycle.start(replicaCtx(nativeDef('s-svc')));

    assert.equal(writes.length, 3);
    assert.ok(writes[0].sql.includes('INSERT'));
    assert.ok(writes[1].sql.includes('UPDATE'));
    assert.ok(writes[2].sql.includes('UPDATE'));
  });

  it('should transition to FAILED on driver error', async () => {
    const {lifecycle, writes} = lifecycleWithJournal(new FailingDriver());

    await assert.rejects(
      () => lifecycle.start(replicaCtx(nativeDef('sf-svc'))),
    );

    assert.equal(writes.length, 3);
  });

  it('should not journal when no writer configured', async () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const result = await lifecycle.start(replicaCtx(nativeDef()));
    assert.equal(result.status, START_STATUS.RUNNING);
  });
});

// --- stop operation journaling ---

describe('ServiceRuntimeLifecycle stop journaling', () => {
  it('should create and complete operation on success', async () => {
    const {lifecycle, writes} = lifecycleWithJournal(new StubDriver());
    await lifecycle.stop(replicaCtx(nativeDef('st-svc')));

    assert.equal(writes.length, 3);
    assert.ok(writes[0].sql.includes('INSERT'));
  });

  it('should transition to FAILED on driver error', async () => {
    const {lifecycle, writes} = lifecycleWithJournal(new FailingDriver());

    await assert.rejects(
      () => lifecycle.stop(replicaCtx(nativeDef('stf-svc'))),
    );

    assert.equal(writes.length, 3);
  });

  it('should not journal when no writer configured', async () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await lifecycle.stop(replicaCtx(nativeDef()));
    // No error means success
  });
});

// --- health does NOT journal (read-only) ---

describe('ServiceRuntimeLifecycle health does not journal', () => {
  it('should not create operation records for health checks', async () => {
    const {lifecycle, writes} = lifecycleWithJournal(new StubDriver());
    await lifecycle.health(replicaCtx(nativeDef('h-svc')));
    assert.equal(writes.length, 0);
  });
});

// --- OperationJournalError ---

describe('OperationJournalError', () => {
  it('should include runtimeKind, serviceId, lifecycleOp, reason',
    () => {
      const err = new OperationJournalError(
        'native_js', 'svc-1', 'prepare', 'write failed',
      );
      assert.equal(err.name, 'OperationJournalError');
      assert.equal(err.runtimeKind, 'native_js');
      assert.equal(err.serviceId, 'svc-1');
      assert.equal(err.lifecycleOp, 'prepare');
      assert.equal(err.reason, 'write failed');
      assert.ok(err.message.includes('svc-1'));
      assert.ok(err.message.includes('native_js'));
      assert.ok(err.message.includes('prepare'));
    });

  it('should have context metadata', () => {
    const err = new OperationJournalError(
      'wasm_component', 'svc-2', 'start', 'timeout',
    );
    assert.equal(
      err.context.component, 'ServiceRuntimeLifecycle',
    );
    assert.equal(err.context.operation, 'operationJournal');
    assert.equal(
      err.context.metadata.runtimeKind, 'wasm_component',
    );
    assert.equal(err.context.metadata.serviceId, 'svc-2');
    assert.equal(err.context.metadata.lifecycleOp, 'start');
  });

  it('should support cause chaining', () => {
    const cause = new Error('root');
    const err = new OperationJournalError(
      'native_js', 'svc-3', 'stop', 'fail', {cause},
    );
    assert.equal(err.cause, cause);
  });

  it('should serialize to JSON', () => {
    const err = new OperationJournalError(
      'oci_container', 'svc-4', 'prepare', 'denied',
    );
    const json = err.toJSON();
    assert.equal(json.name, 'OperationJournalError');
    assert.ok(json.message.includes('denied'));
  });
});

// --- Cross-runtime journaling (all kinds share one path) ---

describe('Operation journaling across runtime kinds', () => {
  it('should journal for all runtime kinds through same path',
    async () => {
      const wasmDriver = new StubDriver(RUNTIME_KIND.WASM_COMPONENT);
      const ociDriver = new StubDriver(RUNTIME_KIND.OCI_CONTAINER);
      const {lifecycle, writes} = lifecycleWithJournal(
        new StubDriver(), wasmDriver, ociDriver,
      );

      await lifecycle.prepare(nativeDef('n-svc'), {});
      const nativeWrites = writes.length;

      await lifecycle.prepare(
        runtimeDef(RUNTIME_KIND.WASM_COMPONENT, 'w-svc'),
        {},
      );
      const wasmWrites = writes.length - nativeWrites;

      await lifecycle.prepare(
        runtimeDef(RUNTIME_KIND.OCI_CONTAINER, 'o-svc'),
        {},
      );
      const ociWrites = writes.length - nativeWrites - wasmWrites;

      // Each runtime kind produces same number of journal writes
      assert.equal(nativeWrites, 3);
      assert.equal(wasmWrites, 3);
      assert.equal(ociWrites, 3);
    });
});

// --- OPERATION_JOURNAL_FAILED event ---

describe('Operation journal failure events', () => {
  it('should emit OPERATION_JOURNAL_FAILED on transition write error',
    async () => {
      const registry = makeRegistry(new StubDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      let callCount = 0;
      lifecycle.setOperationWriter(async () => {
        callCount++;
        // Fail on second write (PENDING->IN_PROGRESS transition)
        if (callCount === 2) {
          throw new Error('transition write failed');
        }
      });
      const events = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_JOURNAL_FAILED,
        (e) => events.push(e),
      );

      await assert.rejects(
        () => lifecycle.prepare(nativeDef('jf-svc'), {}),
        (err) => err instanceof OperationJournalError,
      );

      assert.equal(events.length, 1);
      assert.equal(events[0].serviceId, 'jf-svc');
      assert.ok(events[0].error instanceof OperationJournalError);
    });
});


// --- Property-based tests ---

describe('Operation journaling property-based tests', () => {
  /**
   * **Validates: Requirements 11.1**
   *
   * Property: Every mutating lifecycle operation (prepare, start,
   * stop) with an operation writer configured MUST produce exactly
   * 3 journal writes: create (INSERT), PENDING->IN_PROGRESS
   * (UPDATE), IN_PROGRESS->COMPLETED (UPDATE).
   */
  it('mutating ops always produce 3 journal writes on success',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            LIFECYCLE_OPERATION.PREPARE,
            LIFECYCLE_OPERATION.START,
            LIFECYCLE_OPERATION.STOP,
          ),
          fc.string({minLength: 1, maxLength: 20}),
          async (op, serviceId) => {
            const {lifecycle, writes} = lifecycleWithJournal(
              new StubDriver(),
            );
            const def = nativeDef(serviceId);
            const ctx = replicaCtx(def);

            if (op === LIFECYCLE_OPERATION.PREPARE) {
              await lifecycle.prepare(def, {});
            } else if (op === LIFECYCLE_OPERATION.START) {
              await lifecycle.start(ctx);
            } else {
              await lifecycle.stop(ctx);
            }

            assert.equal(writes.length, 3);
            assert.ok(writes[0].sql.includes('INSERT'));
            assert.ok(writes[1].sql.includes('UPDATE'));
            assert.ok(writes[2].sql.includes('UPDATE'));
          },
        ),
        {numRuns: 10},
      );
    });

  /**
   * **Validates: Requirements 11.3**
   *
   * Property: Operation state transitions follow the valid
   * transition graph: PENDING -> IN_PROGRESS -> terminal.
   * On driver failure, the terminal state is FAILED.
   * On success, the terminal state is COMPLETED.
   */
  it('journal transitions follow valid state machine',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (shouldFail) => {
            const driver = shouldFail ?
              new FailingDriver() :
              new StubDriver();
            const {lifecycle, writes} = lifecycleWithJournal(driver);
            const def = nativeDef('prop-svc');

            try {
              await lifecycle.prepare(def, {});
            } catch (_e) {
              // expected on failure
            }

            // Always 3 writes
            assert.equal(writes.length, 3);

            // First write is INSERT (create PENDING)
            assert.ok(writes[0].sql.includes('INSERT'));

            // Second write transitions to IN_PROGRESS
            assert.ok(writes[1].params.includes(
              WASM_OPERATION_STATE.IN_PROGRESS,
            ));

            // Third write transitions to terminal state
            if (shouldFail) {
              assert.ok(writes[2].params.includes(
                WASM_OPERATION_STATE.FAILED,
              ));
            } else {
              assert.ok(writes[2].params.includes(
                WASM_OPERATION_STATE.COMPLETED,
              ));
            }
          },
        ),
        {numRuns: 10},
      );
    });

  /**
   * **Validates: Requirements 6.4**
   *
   * Property: Health checks (read-only) NEVER produce journal
   * writes regardless of runtime kind.
   */
  it('health checks never produce journal writes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          RUNTIME_KIND.NATIVE_JS,
          RUNTIME_KIND.WASM_COMPONENT,
          RUNTIME_KIND.OCI_CONTAINER,
        ),
        async (kind) => {
          const driver = new StubDriver(kind);
          const {lifecycle, writes} = lifecycleWithJournal(driver);
          const def = runtimeDef(kind, 'h-prop');

          await lifecycle.health(replicaCtx(def));

          assert.equal(writes.length, 0);
        },
      ),
      {numRuns: 10},
    );
  });
});
