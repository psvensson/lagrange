/**
 * Tests for runtime selection diagnostics — verifies that
 * runtime selection decisions are surfaced in diagnostics.
 *
 * Validates: Requirements 12.5
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {
  RuntimeDriver,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {UnknownRuntimeKindError} from
  '../../src/runtime/runtime-driver-errors.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {RUNTIME_KIND, LIFECYCLE_EVENT} from
  '../../src/constants/runtime.js';
import {BaseError} from '../../src/utils/base-error.js';

// --- Stub drivers ---

class StubNativeDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor(_def) {
    return {valid: true, errors: []};
  }
  async prepare(_def, _ctx) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_ctx) {
    return {status: START_STATUS.RUNNING};
  }
  async stop(_ctx) {
    return undefined;
  }
  async health(_ctx) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class StubWasmDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.WASM_COMPONENT);
  }
  validateDescriptor(_def) {
    return {valid: true, errors: []};
  }
  async prepare(_def, _ctx) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_ctx) {
    return {status: START_STATUS.RUNNING};
  }
  async stop(_ctx) {
    return undefined;
  }
  async health(_ctx) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class StubOciDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.OCI_CONTAINER);
  }
  validateDescriptor(_def) {
    return {valid: true, errors: []};
  }
  async prepare(_def, _ctx) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_ctx) {
    return {status: START_STATUS.RUNNING};
  }
  async stop(_ctx) {
    return undefined;
  }
  async health(_ctx) {
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

// --- Registry selection diagnostics ---

describe('Registry selection diagnostics', () => {
  it('getDriver returns correct driver for registered kind', () => {
    const driver = new StubNativeDriver();
    const registry = makeRegistry(driver);
    const result = registry.getDriver(RUNTIME_KIND.NATIVE_JS);
    assert.equal(result, driver);
  });

  it('getDriver includes available kinds in error', () => {
    const registry = makeRegistry(
      new StubNativeDriver(),
      new StubWasmDriver(),
    );
    assert.throws(
      () => registry.getDriver('unknown_kind'),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.ok(
          err.availableKinds.includes(RUNTIME_KIND.NATIVE_JS),
        );
        assert.ok(
          err.availableKinds.includes(RUNTIME_KIND.WASM_COMPONENT),
        );
        return true;
      },
    );
  });

  it('getDriver error message includes requested kind', () => {
    const registry = makeRegistry(new StubNativeDriver());
    assert.throws(
      () => registry.getDriver('fantasy_runtime'),
      (err) => {
        assert.ok(err.message.includes('fantasy_runtime'));
        return true;
      },
    );
  });

  it('getDriver error message includes available kinds', () => {
    const registry = makeRegistry(
      new StubNativeDriver(),
      new StubWasmDriver(),
    );
    assert.throws(
      () => registry.getDriver('missing_kind'),
      (err) => {
        assert.ok(
          err.message.includes(RUNTIME_KIND.NATIVE_JS),
        );
        assert.ok(
          err.message.includes(RUNTIME_KIND.WASM_COMPONENT),
        );
        return true;
      },
    );
  });

  it('registeredKinds returns all registered kinds', () => {
    const registry = makeRegistry(
      new StubNativeDriver(),
      new StubWasmDriver(),
      new StubOciDriver(),
    );
    const kinds = registry.registeredKinds;
    assert.equal(kinds.length, 3);
    assert.ok(kinds.includes(RUNTIME_KIND.NATIVE_JS));
    assert.ok(kinds.includes(RUNTIME_KIND.WASM_COMPONENT));
    assert.ok(kinds.includes(RUNTIME_KIND.OCI_CONTAINER));
  });

  it('hasDriver returns true for registered kind', () => {
    const registry = makeRegistry(new StubNativeDriver());
    assert.equal(registry.hasDriver(RUNTIME_KIND.NATIVE_JS), true);
  });

  it('hasDriver returns false for unregistered kind', () => {
    const registry = makeRegistry(new StubNativeDriver());
    assert.equal(registry.hasDriver('unknown'), false);
  });
});

// --- Lifecycle selection diagnostics ---

describe('Lifecycle selection diagnostics', () => {
  it('PREPARE_START event surfaces selected runtimeKind', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_START, (evt) => {
      events.push(evt);
    });
    const definition = {
      runtime_kind: RUNTIME_KIND.NATIVE_JS,
      service_id: 'svc-1',
    };
    await lifecycle.prepare(definition, {});
    assert.equal(events.length, 1);
    assert.equal(events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS);
  });

  it('PREPARE_FAILURE surfaces runtimeKind on unknown kind', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const failures = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_FAILURE, (evt) => {
      failures.push(evt);
    });
    const definition = {
      runtime_kind: 'nonexistent_kind',
      service_id: 'svc-bad',
    };
    await assert.rejects(
      () => lifecycle.prepare(definition, {}),
    );
    assert.equal(failures.length, 1);
    assert.equal(failures[0].runtimeKind, 'nonexistent_kind');
  });

  it('lifecycle events provide enough info to diagnose selection',
    async () => {
      const registry = makeRegistry(new StubNativeDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const starts = [];
      const successes = [];
      lifecycle.on(LIFECYCLE_EVENT.PREPARE_START, (evt) => {
        starts.push(evt);
      });
      lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (evt) => {
        successes.push(evt);
      });
      const definition = {
        runtime_kind: RUNTIME_KIND.NATIVE_JS,
        service_id: 'svc-diag',
      };
      await lifecycle.prepare(definition, {});

      // Start event has runtimeKind and serviceId
      assert.equal(starts[0].runtimeKind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(starts[0].serviceId, 'svc-diag');

      // Success event has runtimeKind, serviceId, and result
      assert.equal(
        successes[0].runtimeKind, RUNTIME_KIND.NATIVE_JS,
      );
      assert.equal(successes[0].serviceId, 'svc-diag');
      assert.ok(successes[0].result);

      // Failure events include error — verify via a failing call
      const failureEvents = [];
      lifecycle.on(LIFECYCLE_EVENT.PREPARE_FAILURE, (evt) => {
        failureEvents.push(evt);
      });
      const badDef = {
        runtime_kind: 'bad_kind',
        service_id: 'svc-fail',
      };
      await assert.rejects(
        () => lifecycle.prepare(badDef, {}),
      );
      assert.equal(
        failureEvents[0].runtimeKind, 'bad_kind',
      );
      assert.equal(failureEvents[0].serviceId, 'svc-fail');
      assert.ok(failureEvents[0].error);
    },
  );
});

// --- UnknownRuntimeKindError diagnostics ---

describe('UnknownRuntimeKindError diagnostics', () => {
  it('error has kind property', () => {
    const err = new UnknownRuntimeKindError(
      'mystery_kind', [RUNTIME_KIND.NATIVE_JS],
    );
    assert.equal(err.kind, 'mystery_kind');
  });

  it('error has availableKinds array', () => {
    const available = [
      RUNTIME_KIND.NATIVE_JS,
      RUNTIME_KIND.WASM_COMPONENT,
    ];
    const err = new UnknownRuntimeKindError('x', available);
    assert.ok(Array.isArray(err.availableKinds));
    assert.deepStrictEqual(err.availableKinds, available);
  });

  it('error extends BaseError', () => {
    const err = new UnknownRuntimeKindError('x', []);
    assert.ok(err instanceof BaseError);
    assert.ok(err instanceof Error);
  });

  it('error context includes component and operation', () => {
    const err = new UnknownRuntimeKindError('x', []);
    assert.equal(
      err.context.component, 'RuntimeDriverRegistry',
    );
    assert.equal(err.context.operation, 'getDriver');
  });
});
