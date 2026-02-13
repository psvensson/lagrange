/**
 * Tests for SQL/CDC-only metadata mutation path contract.
 *
 * Verifies that all runtime/service lifecycle mutations flow
 * through SQL/CDC paths only. No direct partition writes.
 *
 * Validates: Requirements 6.1, 6.2
 */

import {describe, it, beforeEach} from 'node:test';
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
import {RUNTIME_KIND, LIFECYCLE_EVENT} from
  '../../src/constants/runtime.js';
import {
  executeMetaWrite,
  executeMetaRead,
  META_WRITE_ERROR_MSG,
} from '../../src/wasm-service/meta-write-executor.js';

// --- Mock driver ---

class MockDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor() {
    return {valid: true};
  }
  async prepare() {
    return {status: PREPARE_STATUS.READY};
  }
  async start() {
    return {status: START_STATUS.RUNNING};
  }
  async stop() {}
  async health() {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

// --- Mock driver that returns endpoint intent ---

class EndpointDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor() {
    return {valid: true};
  }
  async prepare() {
    return {status: PREPARE_STATUS.READY};
  }
  async start() {
    return {
      status: START_STATUS.RUNNING,
      endpointIntent: {port: 8081},
    };
  }
  async stop() {}
  async health() {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

// --- Helpers ---

function makeRegistry(driver) {
  const registry = new RuntimeDriverRegistry();
  registry.register(driver);
  registry.freeze();
  return registry;
}

function nativeDef(serviceId = 'svc-1') {
  return {runtime_kind: RUNTIME_KIND.NATIVE_JS, serviceId};
}

function replicaCtx(definition) {
  return {definition};
}

function createMockEngine(result = {rows: []}) {
  return {executeQuery: async () => result};
}

// --- ServiceRuntimeLifecycle operationWriter tests ---

describe('ServiceRuntimeLifecycle operationWriter (SQL/CDC path)', () => {
  let lifecycle;
  let writerCalls;
  let mockWriter;

  beforeEach(() => {
    writerCalls = [];
    mockWriter = async (sql, params) => {
      writerCalls.push({sql, params});
    };
    const registry = makeRegistry(new MockDriver());
    lifecycle = new ServiceRuntimeLifecycle(registry);
  });

  it('prepare creates operation records through writer', async () => {
    lifecycle.setOperationWriter(mockWriter);
    await lifecycle.prepare(nativeDef('op-svc'), {});
    // At least one call for create, plus transitions
    assert.ok(writerCalls.length >= 1);
    // First call is the INSERT (create operation)
    assert.ok(writerCalls[0].sql.includes('INSERT'));
    assert.ok(Array.isArray(writerCalls[0].params));
  });

  it('start creates operation records through writer', async () => {
    lifecycle.setOperationWriter(mockWriter);
    await lifecycle.start(replicaCtx(nativeDef('op-svc')));
    assert.ok(writerCalls.length >= 1);
    assert.ok(writerCalls[0].sql.includes('INSERT'));
  });

  it('stop creates operation records through writer', async () => {
    lifecycle.setOperationWriter(mockWriter);
    await lifecycle.stop(replicaCtx(nativeDef('op-svc')));
    assert.ok(writerCalls.length >= 1);
    assert.ok(writerCalls[0].sql.includes('INSERT'));
  });

  it('writer receives SQL and params, not direct partition writes',
    async () => {
      lifecycle.setOperationWriter(mockWriter);
      await lifecycle.prepare(nativeDef('sql-svc'), {});
      for (const call of writerCalls) {
        assert.equal(typeof call.sql, 'string');
        assert.ok(Array.isArray(call.params));
        // SQL contains table reference, not partition IDs
        assert.ok(
          call.sql.includes('wasm_operations') ||
          call.sql.includes('INSERT') ||
          call.sql.includes('UPDATE'),
        );
      }
    });

  it('prepare transitions PENDING -> IN_PROGRESS -> COMPLETED',
    async () => {
      lifecycle.setOperationWriter(mockWriter);
      await lifecycle.prepare(nativeDef('trans-svc'), {});
      // Expect: 1 INSERT (create) + 2 UPDATEs (transitions)
      assert.equal(writerCalls.length, 3);
      assert.ok(writerCalls[0].sql.includes('INSERT'));
      assert.ok(writerCalls[1].sql.includes('UPDATE'));
      assert.ok(writerCalls[2].sql.includes('UPDATE'));
    });

  it('without operationWriter, operations still succeed', async () => {
    // No writer set — should not throw
    const result = await lifecycle.prepare(nativeDef('no-writer'), {});
    assert.equal(result.status, PREPARE_STATUS.READY);
  });

  it('without operationWriter, start still succeeds', async () => {
    const result = await lifecycle.start(
      replicaCtx(nativeDef('no-writer')),
    );
    assert.equal(result.status, START_STATUS.RUNNING);
  });

  it('without operationWriter, stop still succeeds', async () => {
    await lifecycle.stop(replicaCtx(nativeDef('no-writer')));
    // No throw = success
  });
});

// --- ServiceRuntimeLifecycle endpointWriter tests ---

describe('ServiceRuntimeLifecycle endpointWriter (SQL/CDC path)',
  () => {
    let lifecycle;
    let endpointCalls;

    beforeEach(() => {
      endpointCalls = [];
      const registry = makeRegistry(new EndpointDriver());
      lifecycle = new ServiceRuntimeLifecycle(registry);
    });

    it('writes endpoint intent through endpointWriter', async () => {
      lifecycle.setEndpointWriter(
        async (serviceId, runtimeKind, endpointIntent) => {
          endpointCalls.push({serviceId, runtimeKind, endpointIntent});
        },
      );
      await lifecycle.start(replicaCtx(nativeDef('ep-svc')));
      assert.equal(endpointCalls.length, 1);
      assert.equal(endpointCalls[0].serviceId, 'ep-svc');
      assert.equal(
        endpointCalls[0].runtimeKind, RUNTIME_KIND.NATIVE_JS,
      );
      assert.deepStrictEqual(
        endpointCalls[0].endpointIntent, {port: 8081},
      );
    });

    it('writer receives (serviceId, runtimeKind, endpointIntent)',
      async () => {
        lifecycle.setEndpointWriter(
          async (serviceId, runtimeKind, endpointIntent) => {
            endpointCalls.push({serviceId, runtimeKind, endpointIntent});
          },
        );
        await lifecycle.start(replicaCtx(nativeDef('args-svc')));
        const call = endpointCalls[0];
        assert.equal(typeof call.serviceId, 'string');
        assert.equal(typeof call.runtimeKind, 'string');
        assert.equal(typeof call.endpointIntent, 'object');
        assert.ok(call.endpointIntent !== null);
      });

    it('without endpointWriter, intent is emitted but not written',
      async () => {
        const events = [];
        lifecycle.on(
          LIFECYCLE_EVENT.ENDPOINT_INTENT_RECEIVED,
          (e) => events.push(e),
        );
        // No writer set
        await lifecycle.start(replicaCtx(nativeDef('no-ep-writer')));
        assert.equal(events.length, 1);
        assert.equal(endpointCalls.length, 0);
      });
  });

// --- MetaWriteExecutor routes writes through SQL engine ---

describe('MetaWriteExecutor routes writes through SQL engine', () => {
  it('executeMetaWrite requires a SQL query engine', async () => {
    await assert.rejects(
      () => executeMetaWrite(null, {success: true, sql: 'x', params: []}),
      (err) => {
        assert.equal(err.message, META_WRITE_ERROR_MSG.ENGINE_REQUIRED);
        return true;
      },
    );
  });

  it('executeMetaWrite throws when engine is undefined', async () => {
    await assert.rejects(
      () => executeMetaWrite(
        undefined, {success: true, sql: 'x', params: []},
      ),
      (err) => {
        assert.equal(err.message, META_WRITE_ERROR_MSG.ENGINE_REQUIRED);
        return true;
      },
    );
  });

  it('writes go through sqlQueryEngine.executeQuery()', async () => {
    const calls = [];
    const engine = {
      executeQuery: async (sql, params) => {
        calls.push({sql, params});
        return {rows: [{id: 1}]};
      },
    };
    const commandResult = {
      success: true,
      sql: 'INSERT INTO services VALUES ($1)',
      params: ['svc-1'],
      operationId: 'op-1',
    };
    const result = await executeMetaWrite(engine, commandResult);
    assert.equal(result.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sql, 'INSERT INTO services VALUES ($1)');
    assert.deepStrictEqual(calls[0].params, ['svc-1']);
    // operationId preserved, sql/params stripped
    assert.equal(result.operationId, 'op-1');
    assert.equal(result.sql, undefined);
    assert.equal(result.params, undefined);
  });

  it('no direct partition writes — only engine.executeQuery',
    async () => {
      let queryCalled = false;
      const engine = {
        executeQuery: async () => {
          queryCalled = true;
          return {rows: []};
        },
      };
      await executeMetaWrite(engine, {
        success: true,
        sql: 'UPDATE services SET status = $1',
        params: ['active'],
      });
      assert.equal(queryCalled, true);
    });

  it('returns failure when commandResult.success is false', async () => {
    const engine = createMockEngine();
    const result = await executeMetaWrite(engine, {
      success: false,
      errors: ['validation failed'],
    });
    assert.equal(result.success, false);
    assert.deepStrictEqual(result.errors, ['validation failed']);
  });
});

// --- MetaWriteExecutor routes reads through SQL engine ---

describe('MetaWriteExecutor routes reads through SQL engine', () => {
  it('executeMetaRead requires a SQL query engine', async () => {
    await assert.rejects(
      () => executeMetaRead(null, {success: true, sql: 'x', params: []}),
      (err) => {
        assert.equal(err.message, META_WRITE_ERROR_MSG.ENGINE_REQUIRED);
        return true;
      },
    );
  });

  it('reads go through sqlQueryEngine.executeQuery()', async () => {
    const calls = [];
    const engine = {
      executeQuery: async (sql, params) => {
        calls.push({sql, params});
        return {rows: [{id: 1, name: 'test'}]};
      },
    };
    const commandResult = {
      success: true,
      sql: 'SELECT * FROM services WHERE id = $1',
      params: ['svc-1'],
    };
    const result = await executeMetaRead(engine, commandResult);
    assert.equal(result.success, true);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].sql, 'SELECT * FROM services WHERE id = $1',
    );
    assert.deepStrictEqual(result.rows, [{id: 1, name: 'test'}]);
  });

  it('returns rows from query result', async () => {
    const engine = createMockEngine({
      rows: [{a: 1}, {a: 2}],
    });
    const result = await executeMetaRead(engine, {
      success: true,
      sql: 'SELECT * FROM t',
      params: [],
    });
    assert.equal(result.success, true);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].a, 1);
    assert.equal(result.rows[1].a, 2);
  });

  it('returns failure when commandResult.success is false', async () => {
    const engine = createMockEngine();
    const result = await executeMetaRead(engine, {
      success: false,
      errors: ['bad query'],
    });
    assert.equal(result.success, false);
    assert.deepStrictEqual(result.errors, ['bad query']);
  });
});

// --- Drivers return results/intents, they don't write ---

describe('No direct metadata writes from drivers', () => {
  it('MockDriver.prepare returns result, does not write', async () => {
    const driver = new MockDriver();
    const result = await driver.prepare({}, {});
    assert.equal(result.status, PREPARE_STATUS.READY);
    // Driver returns a plain result object — no write side effects
    assert.equal(typeof result, 'object');
    assert.equal(result.sql, undefined);
    assert.equal(result.partition, undefined);
  });

  it('MockDriver.start returns result, does not write', async () => {
    const driver = new MockDriver();
    const result = await driver.start({});
    assert.equal(result.status, START_STATUS.RUNNING);
    assert.equal(result.sql, undefined);
    assert.equal(result.partition, undefined);
  });

  it('EndpointDriver.start returns intent, does not write',
    async () => {
      const driver = new EndpointDriver();
      const result = await driver.start({});
      assert.equal(result.status, START_STATUS.RUNNING);
      assert.deepStrictEqual(result.endpointIntent, {port: 8081});
      // Intent is returned for the lifecycle owner to write
      assert.equal(result.sql, undefined);
      assert.equal(result.partition, undefined);
    });

  it('lifecycle owner is the single write coordinator', async () => {
    const writerCalls = [];
    const endpointCalls = [];
    const registry = makeRegistry(new EndpointDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.setOperationWriter(async (sql, params) => {
      writerCalls.push({sql, params});
    });
    lifecycle.setEndpointWriter(
      async (serviceId, runtimeKind, endpointIntent) => {
        endpointCalls.push({serviceId, runtimeKind, endpointIntent});
      },
    );

    await lifecycle.start(replicaCtx(nativeDef('coord-svc')));

    // Operation writer called for journal entries
    assert.ok(writerCalls.length >= 1);
    // Endpoint writer called for endpoint registration
    assert.equal(endpointCalls.length, 1);
    // All writes went through the lifecycle owner's writers
    assert.equal(endpointCalls[0].serviceId, 'coord-svc');
  });
});
