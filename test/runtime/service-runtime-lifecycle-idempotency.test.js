/**
 * Tests for ServiceRuntimeLifecycle idempotency checks.
 *
 * Validates: Requirements 11.2, 11.3, 14.4
 *
 * Duplicate idempotency keys SHALL return the original operation
 * identity. The lifecycle owner checks for existing operations
 * via buildIdempotencyCheckSQL from the existing operation
 * lifecycle module (no duplication).
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
  IdempotencyCheckError,
} from '../../src/runtime/runtime-driver-errors.js';
import {
  RUNTIME_KIND,
  OPERATION_JOURNAL_EVENT,
  LIFECYCLE_OPERATION,
} from '../../src/constants/runtime.js';
import {WASM_OPERATION_STATE} from '../../src/constants/wasm-meta.js';

// --- Test driver ---

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

// --- Helpers ---

function makeRegistry(...drivers) {
  const registry = new RuntimeDriverRegistry();
  for (const d of drivers) {
    registry.register(d);
  }
  registry.freeze();
  return registry;
}

function nativeDef(serviceId = 'svc-1') {
  return {runtime_kind: RUNTIME_KIND.NATIVE_JS, serviceId};
}

function replicaCtx(definition) {
  return {definition};
}

/**
 * Create a lifecycle with operation writer and idempotency reader.
 * The reader returns the provided rows when queried.
 */
function lifecycleWithIdempotency(existingRows, ...drivers) {
  const registry = makeRegistry(...drivers);
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  const writes = [];
  lifecycle.setOperationWriter(async (sql, params) => {
    writes.push({sql, params});
  });
  lifecycle.setIdempotencyReader(async (_sql, _params) => {
    return existingRows;
  });
  return {lifecycle, writes};
}

/**
 * Create a lifecycle with writer + reader that returns empty
 * (no existing operation).
 */
function lifecycleNoHit(...drivers) {
  return lifecycleWithIdempotency([], ...drivers);
}

// --- setIdempotencyReader ---

describe('ServiceRuntimeLifecycle setIdempotencyReader', () => {
  it('should accept a function', () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.setIdempotencyReader(async () => []);
  });

  it('should reject non-function', () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    assert.throws(
      () => lifecycle.setIdempotencyReader('not-a-fn'),
      (err) => err instanceof TypeError,
    );
  });

  it('should reject null', () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    assert.throws(
      () => lifecycle.setIdempotencyReader(null),
      (err) => err instanceof TypeError,
    );
  });
});

// --- Idempotency hit returns original operation ---

describe('Idempotency hit returns original operation (Req 11.2)',
  () => {
    const existingOp = {
      operation_id: 'op-existing-123',
      tenant_id: 'svc-idem',
      command: 'prepare',
      idempotency_key: 'key-abc',
      state: WASM_OPERATION_STATE.COMPLETED,
    };

    it('prepare returns existing operation on duplicate key',
      async () => {
        const {lifecycle, writes} = lifecycleWithIdempotency(
          [existingOp], new StubDriver(),
        );
        const result = await lifecycle.prepare(
          nativeDef('svc-idem'), {},
          {idempotencyKey: 'key-abc'},
        );

        assert.equal(result.idempotent, true);
        assert.equal(result.operationId, 'op-existing-123');
        assert.equal(result.status, WASM_OPERATION_STATE.COMPLETED);
        // No journal writes — operation already exists
        assert.equal(writes.length, 0);
      });

    it('start returns existing operation on duplicate key',
      async () => {
        const {lifecycle, writes} = lifecycleWithIdempotency(
          [existingOp], new StubDriver(),
        );
        const result = await lifecycle.start(
          replicaCtx(nativeDef('svc-idem')),
          {idempotencyKey: 'key-abc'},
        );

        assert.equal(result.idempotent, true);
        assert.equal(result.operationId, 'op-existing-123');
        assert.equal(writes.length, 0);
      });

    it('stop returns existing operation on duplicate key',
      async () => {
        const {lifecycle, writes} = lifecycleWithIdempotency(
          [existingOp], new StubDriver(),
        );
        const result = await lifecycle.stop(
          replicaCtx(nativeDef('svc-idem')),
          {idempotencyKey: 'key-abc'},
        );

        assert.equal(result.idempotent, true);
        assert.equal(result.operationId, 'op-existing-123');
        assert.equal(writes.length, 0);
      });

    it('emits IDEMPOTENCY_HIT event on duplicate key', async () => {
      const {lifecycle} = lifecycleWithIdempotency(
        [existingOp], new StubDriver(),
      );
      const events = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.IDEMPOTENCY_HIT,
        (e) => events.push(e),
      );

      await lifecycle.prepare(
        nativeDef('svc-idem'), {},
        {idempotencyKey: 'key-abc'},
      );

      assert.equal(events.length, 1);
      assert.equal(events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(events[0].serviceId, 'svc-idem');
      assert.equal(events[0].command, LIFECYCLE_OPERATION.PREPARE);
      assert.equal(events[0].idempotencyKey, 'key-abc');
      assert.equal(
        events[0].existingOperationId, 'op-existing-123',
      );
      assert.equal(
        events[0].existingState, WASM_OPERATION_STATE.COMPLETED,
      );
    });

    it('does not invoke driver on idempotency hit', async () => {
      let driverCalled = false;
      class SpyDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.NATIVE_JS);
        }
        validateDescriptor(_d) {
          return {valid: true};
        }
        async prepare(_d, _c) {
          driverCalled = true;
          return {status: PREPARE_STATUS.READY};
        }
        async start(_c) {
          driverCalled = true;
          return {status: START_STATUS.RUNNING};
        }
        async stop(_c) {
          driverCalled = true;
        }
        async health(_c) {
          return {status: HEALTH_STATUS.HEALTHY};
        }
      }
      const {lifecycle} = lifecycleWithIdempotency(
        [existingOp], new SpyDriver(),
      );

      await lifecycle.prepare(
        nativeDef('svc-idem'), {},
        {idempotencyKey: 'key-abc'},
      );

      assert.equal(driverCalled, false);
    });
  });

// --- No idempotency hit proceeds normally ---

describe('No idempotency hit proceeds normally', () => {
  it('prepare creates new operation when no match', async () => {
    const {lifecycle, writes} = lifecycleNoHit(new StubDriver());
    const result = await lifecycle.prepare(
      nativeDef('svc-new'), {},
      {idempotencyKey: 'key-new'},
    );

    assert.equal(result.status, PREPARE_STATUS.READY);
    assert.equal(result.idempotent, undefined);
    // 3 writes: create, PENDING->IN_PROGRESS, IN_PROGRESS->COMPLETED
    assert.equal(writes.length, 3);
  });

  it('start creates new operation when no match', async () => {
    const {lifecycle, writes} = lifecycleNoHit(new StubDriver());
    const result = await lifecycle.start(
      replicaCtx(nativeDef('svc-new')),
      {idempotencyKey: 'key-new'},
    );

    assert.equal(result.status, START_STATUS.RUNNING);
    assert.equal(writes.length, 3);
  });

  it('stop creates new operation when no match', async () => {
    const {lifecycle, writes} = lifecycleNoHit(new StubDriver());
    await lifecycle.stop(
      replicaCtx(nativeDef('svc-new')),
      {idempotencyKey: 'key-new'},
    );

    assert.equal(writes.length, 3);
  });
});

// --- No idempotency key skips check ---

describe('No idempotency key skips check', () => {
  it('prepare without key does not check idempotency', async () => {
    let readerCalled = false;
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.setOperationWriter(async () => {});
    lifecycle.setIdempotencyReader(async () => {
      readerCalled = true;
      return [];
    });

    await lifecycle.prepare(nativeDef('svc-nokey'), {});

    assert.equal(readerCalled, false);
  });

  it('prepare with null key does not check idempotency',
    async () => {
      let readerCalled = false;
      const registry = makeRegistry(new StubDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      lifecycle.setOperationWriter(async () => {});
      lifecycle.setIdempotencyReader(async () => {
        readerCalled = true;
        return [];
      });

      await lifecycle.prepare(
        nativeDef('svc-null'), {},
        {idempotencyKey: null},
      );

      assert.equal(readerCalled, false);
    });
});

// --- No reader configured skips check ---

describe('No idempotency reader configured', () => {
  it('prepare with key but no reader proceeds normally',
    async () => {
      const registry = makeRegistry(new StubDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      lifecycle.setOperationWriter(async () => {});
      // No setIdempotencyReader call

      const result = await lifecycle.prepare(
        nativeDef('svc-noreader'), {},
        {idempotencyKey: 'key-123'},
      );

      assert.equal(result.status, PREPARE_STATUS.READY);
    });
});

// --- Idempotency reader failure ---

describe('Idempotency reader failure', () => {
  it('throws IdempotencyCheckError on reader failure', async () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.setOperationWriter(async () => {});
    lifecycle.setIdempotencyReader(async () => {
      throw new Error('SQL read failed');
    });

    await assert.rejects(
      () => lifecycle.prepare(
        nativeDef('svc-fail'), {},
        {idempotencyKey: 'key-fail'},
      ),
      (err) => {
        assert.ok(err instanceof IdempotencyCheckError);
        assert.equal(err.runtimeKind, RUNTIME_KIND.NATIVE_JS);
        assert.equal(err.serviceId, 'svc-fail');
        assert.ok(err.message.includes('query failed'));
        assert.ok(err.cause.message.includes('SQL read failed'));
        return true;
      },
    );
  });

  it('reader failure does not create journal writes', async () => {
    const registry = makeRegistry(new StubDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const writes = [];
    lifecycle.setOperationWriter(async (sql, params) => {
      writes.push({sql, params});
    });
    lifecycle.setIdempotencyReader(async () => {
      throw new Error('read boom');
    });

    await assert.rejects(
      () => lifecycle.prepare(
        nativeDef('svc-fail'), {},
        {idempotencyKey: 'key-fail'},
      ),
    );

    assert.equal(writes.length, 0);
  });
});

// --- IdempotencyCheckError ---

describe('IdempotencyCheckError', () => {
  it('should include runtimeKind, serviceId, and reason', () => {
    const err = new IdempotencyCheckError(
      'native_js', 'svc-1', 'query failed',
    );
    assert.equal(err.name, 'IdempotencyCheckError');
    assert.equal(err.runtimeKind, 'native_js');
    assert.equal(err.serviceId, 'svc-1');
    assert.equal(err.reason, 'query failed');
    assert.ok(err.message.includes('svc-1'));
    assert.ok(err.message.includes('native_js'));
    assert.ok(err.message.includes('query failed'));
  });

  it('should have context metadata', () => {
    const err = new IdempotencyCheckError(
      'wasm_component', 'svc-2', 'timeout',
    );
    assert.equal(
      err.context.component, 'ServiceRuntimeLifecycle',
    );
    assert.equal(err.context.operation, 'idempotencyCheck');
    assert.equal(
      err.context.metadata.runtimeKind, 'wasm_component',
    );
  });

  it('should support cause chaining', () => {
    const cause = new Error('root');
    const err = new IdempotencyCheckError(
      'native_js', 'svc-3', 'fail', {cause},
    );
    assert.equal(err.cause, cause);
  });

  it('should serialize to JSON', () => {
    const err = new IdempotencyCheckError(
      'oci_container', 'svc-4', 'denied',
    );
    const json = err.toJSON();
    assert.equal(json.name, 'IdempotencyCheckError');
    assert.ok(json.message.includes('denied'));
  });
});

// --- Idempotency with operationId field variant ---

describe('Idempotency with camelCase operationId field', () => {
  it('handles camelCase operationId from existing row', async () => {
    const existingOp = {
      operationId: 'op-camel-456',
      state: WASM_OPERATION_STATE.IN_PROGRESS,
    };
    const {lifecycle} = lifecycleWithIdempotency(
      [existingOp], new StubDriver(),
    );

    const result = await lifecycle.prepare(
      nativeDef('svc-camel'), {},
      {idempotencyKey: 'key-camel'},
    );

    assert.equal(result.idempotent, true);
    assert.equal(result.operationId, 'op-camel-456');
    assert.equal(
      result.status, WASM_OPERATION_STATE.IN_PROGRESS,
    );
  });
});

// --- Property-based tests ---

describe('Idempotency property-based tests', () => {
  /**
   * **Validates: Requirements 11.2**
   *
   * Property: When an idempotency reader returns an existing
   * operation for a given key, the lifecycle method MUST return
   * the original operation identity and produce zero journal
   * writes, regardless of runtime kind or lifecycle operation.
   */
  it('idempotency hit always returns original and skips writes',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            LIFECYCLE_OPERATION.PREPARE,
            LIFECYCLE_OPERATION.START,
            LIFECYCLE_OPERATION.STOP,
          ),
          fc.constantFrom(
            RUNTIME_KIND.NATIVE_JS,
            RUNTIME_KIND.WASM_COMPONENT,
            RUNTIME_KIND.OCI_CONTAINER,
          ),
          fc.uuid(),
          fc.string({minLength: 1, maxLength: 30}),
          async (op, kind, opId, idemKey) => {
            const existingOp = {
              operation_id: opId,
              state: WASM_OPERATION_STATE.COMPLETED,
            };
            const driver = new StubDriver(kind);
            const {lifecycle, writes} = lifecycleWithIdempotency(
              [existingOp], driver,
            );
            const def = {runtime_kind: kind, serviceId: 'prop-svc'};
            const ctx = replicaCtx(def);
            const opts = {idempotencyKey: idemKey};

            let result;
            if (op === LIFECYCLE_OPERATION.PREPARE) {
              result = await lifecycle.prepare(def, {}, opts);
            } else if (op === LIFECYCLE_OPERATION.START) {
              result = await lifecycle.start(ctx, opts);
            } else {
              result = await lifecycle.stop(ctx, opts);
            }

            assert.equal(result.idempotent, true);
            assert.equal(result.operationId, opId);
            assert.equal(writes.length, 0);
          },
        ),
        {numRuns: 10},
      );
    });

  /**
   * **Validates: Requirements 11.2**
   *
   * Property: When no existing operation matches the idempotency
   * key, the lifecycle method MUST create a new operation and
   * produce exactly 3 journal writes (create + 2 transitions).
   */
  it('no idempotency hit always creates new operation with 3 writes',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            LIFECYCLE_OPERATION.PREPARE,
            LIFECYCLE_OPERATION.START,
            LIFECYCLE_OPERATION.STOP,
          ),
          fc.string({minLength: 1, maxLength: 30}),
          async (op, idemKey) => {
            const {lifecycle, writes} = lifecycleNoHit(
              new StubDriver(),
            );
            const def = nativeDef('prop-new');
            const ctx = replicaCtx(def);
            const opts = {idempotencyKey: idemKey};

            if (op === LIFECYCLE_OPERATION.PREPARE) {
              await lifecycle.prepare(def, {}, opts);
            } else if (op === LIFECYCLE_OPERATION.START) {
              await lifecycle.start(ctx, opts);
            } else {
              await lifecycle.stop(ctx, opts);
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
   * Property: Idempotent results preserve the existing operation
   * state — the returned status always matches the state of the
   * existing operation found by the reader.
   */
  it('idempotent result status matches existing operation state',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            WASM_OPERATION_STATE.PENDING,
            WASM_OPERATION_STATE.IN_PROGRESS,
            WASM_OPERATION_STATE.COMPLETED,
            WASM_OPERATION_STATE.FAILED,
            WASM_OPERATION_STATE.CANCELLED,
          ),
          async (existingState) => {
            const existingOp = {
              operation_id: 'op-state-test',
              state: existingState,
            };
            const {lifecycle} = lifecycleWithIdempotency(
              [existingOp], new StubDriver(),
            );

            const result = await lifecycle.prepare(
              nativeDef('prop-state'), {},
              {idempotencyKey: 'key-state'},
            );

            assert.equal(result.idempotent, true);
            assert.equal(result.status, existingState);
          },
        ),
        {numRuns: 10},
      );
    });
});
