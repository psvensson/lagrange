/**
 * Tests for idempotency-key semantics on mutating runtime commands
 * through ServiceRuntimeLifecycle.
 *
 * Validates: Requirements 11.2, 11.5
 *
 * Covers:
 *   - Deduplication on prepare/start/stop
 *   - Null key and missing reader skip behavior
 *   - Reader failure error typing
 *   - IDEMPOTENCY_HIT event emission
 *   - Idempotent operations skip journal transitions
 *   - Different keys create separate operations
 *   - Key passed through to buildIdempotencyCheckSQL
 *   - Consistent behavior across all three lifecycle operations
 *   - setIdempotencyReader rejects non-function
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
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
  RUNTIME_KIND,
  OPERATION_JOURNAL_EVENT,
} from '../../src/constants/runtime.js';
import {WASM_OPERATION_STATE} from '../../src/constants/wasm-meta.js';
import {
  IdempotencyCheckError,
} from '../../src/runtime/runtime-driver-errors.js';

// --- Stub driver ---

class StubDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor() {
    return {valid: true, errors: []};
  }
  async prepare() {
    return {status: PREPARE_STATUS.READY};
  }
  async start() {
    return {status: START_STATUS.RUNNING};
  }
  async stop() {
    return undefined;
  }
  async health() {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

// --- Shared fixtures ---

const EXISTING_OP = Object.freeze({
  operation_id: 'op-existing-001',
  tenant_id: 'test-svc',
  command: 'prepare',
  idempotency_key: 'idem-key-1',
  state: WASM_OPERATION_STATE.COMPLETED,
});

const DEFINITION = Object.freeze({
  runtime_kind: RUNTIME_KIND.NATIVE_JS,
  serviceId: 'test-svc',
  tenantId: 'tenant-1',
});

function replicaCtx(def = DEFINITION) {
  return {definition: def};
}

// --- Factory helpers ---

function createRegistry() {
  const registry = new RuntimeDriverRegistry();
  registry.register(new StubDriver());
  return registry;
}

function createLifecycle(readerResult) {
  const registry = createRegistry();
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  const writerCalls = [];
  lifecycle.setOperationWriter(async (sql, params) => {
    writerCalls.push({sql, params});
  });
  if (readerResult !== undefined) {
    lifecycle.setIdempotencyReader(async (_sql, _params) => {
      return readerResult;
    });
  }
  return {lifecycle, writerCalls};
}

// --- Tests ---

describe('Idempotency-key semantics (Req 11.2, 11.5)', () => {
  // 1. Idempotency key deduplication on prepare
  describe('deduplication on prepare', () => {
    it('returns existing operation with idempotent: true', async () => {
      const {lifecycle, writerCalls} = createLifecycle([EXISTING_OP]);

      const result = await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: 'idem-key-1'},
      );

      assert.equal(result.idempotent, true);
      assert.equal(result.operationId, EXISTING_OP.operation_id);
      assert.equal(result.status, WASM_OPERATION_STATE.COMPLETED);
      assert.equal(writerCalls.length, 0);
    });
  });

  // 2. Idempotency key deduplication on start
  describe('deduplication on start', () => {
    it('returns existing operation with idempotent: true', async () => {
      const {lifecycle, writerCalls} = createLifecycle([EXISTING_OP]);

      const result = await lifecycle.start(
        replicaCtx(),
        {idempotencyKey: 'idem-key-1'},
      );

      assert.equal(result.idempotent, true);
      assert.equal(result.operationId, EXISTING_OP.operation_id);
      assert.equal(writerCalls.length, 0);
    });
  });

  // 3. Idempotency key deduplication on stop
  describe('deduplication on stop', () => {
    it('returns existing operation with idempotent: true', async () => {
      const {lifecycle, writerCalls} = createLifecycle([EXISTING_OP]);

      const result = await lifecycle.stop(
        replicaCtx(),
        {idempotencyKey: 'idem-key-1'},
      );

      assert.equal(result.idempotent, true);
      assert.equal(result.operationId, EXISTING_OP.operation_id);
      assert.equal(writerCalls.length, 0);
    });
  });

  // 4. No idempotency check when key is null
  describe('no check when key is null', () => {
    it('skips idempotency check when key is not provided', async () => {
      let readerCalled = false;
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      lifecycle.setOperationWriter(async () => {});
      lifecycle.setIdempotencyReader(async () => {
        readerCalled = true;
        return [];
      });

      await lifecycle.prepare(DEFINITION, {});

      assert.equal(readerCalled, false);
    });

    it('skips idempotency check when key is explicit null', async () => {
      let readerCalled = false;
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      lifecycle.setOperationWriter(async () => {});
      lifecycle.setIdempotencyReader(async () => {
        readerCalled = true;
        return [];
      });

      await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: null},
      );

      assert.equal(readerCalled, false);
    });
  });

  // 5. No idempotency check when reader is not set
  describe('no check when reader is not set', () => {
    it('skips check and proceeds normally without reader', async () => {
      const {lifecycle} = createLifecycle(undefined);

      const result = await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: 'some-key'},
      );

      assert.equal(result.status, PREPARE_STATUS.READY);
      assert.equal(result.idempotent, undefined);
    });
  });

  // 6. Idempotency reader failure throws IdempotencyCheckError
  describe('reader failure throws IdempotencyCheckError', () => {
    it('wraps reader error in IdempotencyCheckError', async () => {
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      lifecycle.setOperationWriter(async () => {});
      lifecycle.setIdempotencyReader(async () => {
        throw new Error('connection refused');
      });

      await assert.rejects(
        () => lifecycle.prepare(
          DEFINITION, {},
          {idempotencyKey: 'fail-key'},
        ),
        (err) => {
          assert.ok(err instanceof IdempotencyCheckError);
          assert.equal(err.runtimeKind, RUNTIME_KIND.NATIVE_JS);
          assert.equal(err.serviceId, 'test-svc');
          assert.ok(err.message.includes('query failed'));
          assert.ok(err.cause.message.includes('connection refused'));
          return true;
        },
      );
    });
  });

  // 7. Idempotency hit emits IDEMPOTENCY_HIT event
  describe('IDEMPOTENCY_HIT event emission', () => {
    it('emits event with correct payload on duplicate', async () => {
      const {lifecycle} = createLifecycle([EXISTING_OP]);
      const events = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.IDEMPOTENCY_HIT,
        (e) => events.push(e),
      );

      await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: 'idem-key-1'},
      );

      assert.equal(events.length, 1);
      const evt = events[0];
      assert.equal(evt.runtimeKind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(evt.serviceId, 'test-svc');
      assert.equal(evt.idempotencyKey, 'idem-key-1');
      assert.equal(
        evt.existingOperationId, EXISTING_OP.operation_id,
      );
      assert.equal(
        evt.existingState, WASM_OPERATION_STATE.COMPLETED,
      );
    });
  });

  // 8. Idempotent operations skip journal transitions
  describe('idempotent ops skip journal transitions', () => {
    it('produces zero writer calls on idempotent hit', async () => {
      const {lifecycle, writerCalls} = createLifecycle([EXISTING_OP]);

      await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: 'idem-key-1'},
      );

      // No create, no PENDING->IN_PROGRESS, no IN_PROGRESS->COMPLETED
      assert.equal(writerCalls.length, 0);
    });

    it('non-idempotent path produces 3 journal writes', async () => {
      const {lifecycle, writerCalls} = createLifecycle([]);

      await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: 'fresh-key'},
      );

      // create + PENDING->IN_PROGRESS + IN_PROGRESS->COMPLETED
      assert.equal(writerCalls.length, 3);
    });
  });

  // 9. Different idempotency keys create separate operations
  describe('different keys create separate operations', () => {
    it('two calls with different keys both create new ops', async () => {
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const writerCalls = [];
      lifecycle.setOperationWriter(async (sql, params) => {
        writerCalls.push({sql, params});
      });
      lifecycle.setIdempotencyReader(async () => []);

      await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: 'key-alpha'},
      );
      const firstBatch = writerCalls.length;

      await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: 'key-beta'},
      );

      // Each call produces 3 writes (create + 2 transitions)
      assert.equal(firstBatch, 3);
      assert.equal(writerCalls.length, 6);
    });
  });

  // 10. Idempotency key passed through to buildIdempotencyCheckSQL
  describe('key passed to buildIdempotencyCheckSQL', () => {
    it('reader receives SQL with correct tenant and key', async () => {
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      lifecycle.setOperationWriter(async () => {});

      const readerArgs = [];
      lifecycle.setIdempotencyReader(async (sql, params) => {
        readerArgs.push({sql, params});
        return [];
      });

      await lifecycle.prepare(
        DEFINITION, {},
        {idempotencyKey: 'check-key-99'},
      );

      assert.equal(readerArgs.length, 1);
      const {sql, params} = readerArgs[0];
      assert.ok(sql.includes('wasm_operations'));
      assert.ok(sql.includes('tenant_id'));
      assert.ok(sql.includes('idempotency_key'));
      // tenantId from definition or fallback to serviceId
      assert.ok(
        params.includes('tenant-1') || params.includes('test-svc'),
      );
      assert.ok(params.includes('check-key-99'));
    });
  });

  // 11. Idempotency works across all three lifecycle operations
  describe('consistent across prepare, start, and stop', () => {
    it('all three operations support idempotency dedup', async () => {
      const ops = [];

      for (const method of ['prepare', 'start', 'stop']) {
        const {lifecycle, writerCalls} = createLifecycle([EXISTING_OP]);
        const events = [];
        lifecycle.on(
          OPERATION_JOURNAL_EVENT.IDEMPOTENCY_HIT,
          (e) => events.push(e),
        );

        let result;
        if (method === 'prepare') {
          result = await lifecycle.prepare(
            DEFINITION, {},
            {idempotencyKey: 'idem-key-1'},
          );
        } else if (method === 'start') {
          result = await lifecycle.start(
            replicaCtx(),
            {idempotencyKey: 'idem-key-1'},
          );
        } else {
          result = await lifecycle.stop(
            replicaCtx(),
            {idempotencyKey: 'idem-key-1'},
          );
        }

        ops.push({method, result, writerCalls, events});
      }

      for (const {method, result, writerCalls, events} of ops) {
        assert.equal(
          result.idempotent, true,
          `${method} should return idempotent: true`,
        );
        assert.equal(
          result.operationId, EXISTING_OP.operation_id,
          `${method} should return existing operationId`,
        );
        assert.equal(
          writerCalls.length, 0,
          `${method} should produce zero journal writes`,
        );
        assert.equal(
          events.length, 1,
          `${method} should emit one IDEMPOTENCY_HIT event`,
        );
      }
    });
  });

  // 12. setIdempotencyReader rejects non-function
  describe('setIdempotencyReader rejects non-function', () => {
    it('throws TypeError for string', () => {
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      assert.throws(
        () => lifecycle.setIdempotencyReader('not-a-fn'),
        (err) => err instanceof TypeError,
      );
    });

    it('throws TypeError for null', () => {
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      assert.throws(
        () => lifecycle.setIdempotencyReader(null),
        (err) => err instanceof TypeError,
      );
    });

    it('throws TypeError for number', () => {
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      assert.throws(
        () => lifecycle.setIdempotencyReader(42),
        (err) => err instanceof TypeError,
      );
    });

    it('throws TypeError for object', () => {
      const registry = createRegistry();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      assert.throws(
        () => lifecycle.setIdempotencyReader({}),
        (err) => err instanceof TypeError,
      );
    });
  });
});
