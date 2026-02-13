/**
 * Tests for ServiceRuntimeLifecycle — the single lifecycle
 * orchestrator for all replicated service runtimes.
 *
 * Validates: Requirements 1.3, 1.5
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
  LifecycleOrchestrationError,
  UnknownRuntimeKindError,
  EndpointIntentError,
} from '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND, LIFECYCLE_EVENT} from
  '../../src/constants/runtime.js';
import {
  validateEndpointIntent,
} from '../../src/runtime/service-runtime-lifecycle.js';

// --- Test drivers ---

class StubNativeDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor(_def) {
    return {valid: true};
  }
  async prepare(_def, _ctx) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_ctx) {
    return {status: START_STATUS.RUNNING, endpointIntent: {port: 8081}};
  }
  async stop(_ctx) {}
  async health(_ctx) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class StubWasmDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.WASM_COMPONENT);
  }
  validateDescriptor(_def) {
    return {valid: true};
  }
  async prepare(_def, _ctx) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_ctx) {
    return {status: START_STATUS.RUNNING};
  }
  async stop(_ctx) {}
  async health(_ctx) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class StubOciDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.OCI_CONTAINER);
  }
  validateDescriptor(_def) {
    return {valid: true};
  }
  async prepare(_def, _ctx) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_ctx) {
    return {status: START_STATUS.RUNNING};
  }
  async stop(_ctx) {}
  async health(_ctx) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class FailingDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor(_def) {
    return {valid: false, errors: ['bad']};
  }
  async prepare(_def, _ctx) {
    throw new Error('prepare boom');
  }
  async start(_ctx) {
    throw new Error('start boom');
  }
  async stop(_ctx) {
    throw new Error('stop boom');
  }
  async health(_ctx) {
    throw new Error('health boom');
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

function wasmDef(serviceId = 'svc-wasm') {
  return {
    runtime_kind: RUNTIME_KIND.WASM_COMPONENT,
    runtime_ref: `${serviceId}-module@sha256:test`,
    serviceId,
  };
}

function replicaCtx(definition) {
  return {definition};
}

// --- Constructor ---

describe('ServiceRuntimeLifecycle constructor', () => {
  it('should accept a valid RuntimeDriverRegistry', () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    assert.ok(lifecycle instanceof ServiceRuntimeLifecycle);
  });

  it('should reject non-registry argument', () => {
    assert.throws(
      () => new ServiceRuntimeLifecycle({}),
      (err) => err instanceof TypeError,
    );
  });

  it('should reject null', () => {
    assert.throws(
      () => new ServiceRuntimeLifecycle(null),
      (err) => err instanceof TypeError,
    );
  });

  it('should reject undefined', () => {
    assert.throws(
      () => new ServiceRuntimeLifecycle(undefined),
      (err) => err instanceof TypeError,
    );
  });
});

// --- prepare ---

describe('ServiceRuntimeLifecycle prepare', () => {
  it('should delegate to the correct driver', async () => {
    const registry = makeRegistry(
      new StubNativeDriver(), new StubWasmDriver(),
    );
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const result = await lifecycle.prepare(nativeDef(), {});
    assert.equal(result.status, PREPARE_STATUS.READY);
  });

  it('should resolve driver for wasm definitions', async () => {
    const registry = makeRegistry(
      new StubNativeDriver(), new StubWasmDriver(),
    );
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const result = await lifecycle.prepare(wasmDef(), {});
    assert.equal(result.status, PREPARE_STATUS.READY);
  });

  it('should throw LifecycleOrchestrationError on missing kind', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.prepare({serviceId: 'x'}, {}),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.equal(err.operation, 'prepare');
        assert.ok(err.message.includes('missing runtime_kind'));
        return true;
      },
    );
  });

  it('should wrap driver errors in LifecycleOrchestrationError', async () => {
    const registry = makeRegistry(new FailingDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.prepare(nativeDef(), {}),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.equal(err.operation, 'prepare');
        assert.equal(err.runtimeKind, RUNTIME_KIND.NATIVE_JS);
        assert.ok(err.cause instanceof Error);
        assert.ok(err.cause.message.includes('prepare boom'));
        return true;
      },
    );
  });

  it('should propagate UnknownRuntimeKindError for bad kind', async () => {
    const registry = makeRegistry(new StubWasmDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.prepare(nativeDef(), {}),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.ok(err.cause instanceof UnknownRuntimeKindError);
        return true;
      },
    );
  });
});

// --- start ---

describe('ServiceRuntimeLifecycle start', () => {
  it('should delegate to driver via replica context', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const result = await lifecycle.start(replicaCtx(nativeDef()));
    assert.equal(result.status, START_STATUS.RUNNING);
    assert.deepStrictEqual(result.endpointIntent, {port: 8081});
  });

  it('should resolve kind from flat context (no .definition)', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const result = await lifecycle.start(nativeDef());
    assert.equal(result.status, START_STATUS.RUNNING);
  });

  it('should throw on missing runtime_kind', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.start(replicaCtx({serviceId: 'x'})),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.equal(err.operation, 'start');
        return true;
      },
    );
  });

  it('should wrap driver errors', async () => {
    const registry = makeRegistry(new FailingDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.start(replicaCtx(nativeDef())),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.equal(err.operation, 'start');
        assert.ok(err.cause.message.includes('start boom'));
        return true;
      },
    );
  });
});

// --- stop ---

describe('ServiceRuntimeLifecycle stop', () => {
  it('should delegate to driver', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await lifecycle.stop(replicaCtx(nativeDef()));
  });

  it('should throw on missing runtime_kind', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.stop(replicaCtx({serviceId: 'x'})),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.equal(err.operation, 'stop');
        return true;
      },
    );
  });

  it('should wrap driver errors', async () => {
    const registry = makeRegistry(new FailingDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.stop(replicaCtx(nativeDef())),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.equal(err.operation, 'stop');
        assert.ok(err.cause.message.includes('stop boom'));
        return true;
      },
    );
  });
});

// --- health ---

describe('ServiceRuntimeLifecycle health', () => {
  it('should delegate to driver', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const result = await lifecycle.health(replicaCtx(nativeDef()));
    assert.equal(result.status, HEALTH_STATUS.HEALTHY);
  });

  it('should throw on missing runtime_kind', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.health(replicaCtx({serviceId: 'x'})),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.equal(err.operation, 'health');
        return true;
      },
    );
  });

  it('should wrap driver errors', async () => {
    const registry = makeRegistry(new FailingDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.health(replicaCtx(nativeDef())),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.equal(err.operation, 'health');
        assert.ok(err.cause.message.includes('health boom'));
        return true;
      },
    );
  });
});

// --- Telemetry events ---

describe('ServiceRuntimeLifecycle telemetry events', () => {
  it('should emit prepare start/success events', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_START, (e) => events.push(e));
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (e) => events.push(e));

    await lifecycle.prepare(nativeDef('my-svc'), {});

    assert.equal(events.length, 2);
    assert.equal(events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS);
    assert.equal(events[0].serviceId, 'my-svc');
    assert.equal(events[1].runtimeKind, RUNTIME_KIND.NATIVE_JS);
    assert.equal(typeof events[1].durationMs, 'number');
    assert.ok(events[1].result);
  });

  it('should emit prepare failure event on error', async () => {
    const registry = makeRegistry(new FailingDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_FAILURE, (e) => events.push(e));

    await assert.rejects(() => lifecycle.prepare(nativeDef(), {}));

    assert.equal(events.length, 1);
    assert.equal(events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS);
    assert.ok(events[0].error);
    assert.equal(typeof events[0].durationMs, 'number');
  });

  it('should emit start start/success events', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.START_START, (e) => events.push(e));
    lifecycle.on(LIFECYCLE_EVENT.START_SUCCESS, (e) => events.push(e));

    await lifecycle.start(replicaCtx(nativeDef('s1')));

    assert.equal(events.length, 2);
    assert.equal(events[0].serviceId, 's1');
    assert.ok(events[1].result);
  });

  it('should emit stop start/success events', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.STOP_START, (e) => events.push(e));
    lifecycle.on(LIFECYCLE_EVENT.STOP_SUCCESS, (e) => events.push(e));

    await lifecycle.stop(replicaCtx(nativeDef('s2')));

    assert.equal(events.length, 2);
    assert.equal(events[0].serviceId, 's2');
    assert.equal(typeof events[1].durationMs, 'number');
  });

  it('should emit health check/result events', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.HEALTH_CHECK, (e) => events.push(e));
    lifecycle.on(LIFECYCLE_EVENT.HEALTH_RESULT, (e) => events.push(e));

    await lifecycle.health(replicaCtx(nativeDef('s3')));

    assert.equal(events.length, 2);
    assert.equal(events[0].serviceId, 's3');
    assert.ok(events[1].result);
  });
});

// --- LifecycleOrchestrationError ---

describe('LifecycleOrchestrationError', () => {
  it('should include operation, runtimeKind, and serviceId', () => {
    const err = new LifecycleOrchestrationError(
      'start', 'native_js', 'svc-1', 'handler threw',
    );
    assert.equal(err.name, 'LifecycleOrchestrationError');
    assert.equal(err.operation, 'start');
    assert.equal(err.runtimeKind, 'native_js');
    assert.equal(err.serviceId, 'svc-1');
    assert.ok(err.message.includes('svc-1'));
    assert.ok(err.message.includes('native_js'));
    assert.ok(err.message.includes('handler threw'));
  });

  it('should have context metadata', () => {
    const err = new LifecycleOrchestrationError(
      'prepare', 'wasm_component', 'svc-2', 'fail',
    );
    assert.equal(err.context.component, 'ServiceRuntimeLifecycle');
    assert.equal(err.context.operation, 'prepare');
    assert.equal(err.context.metadata.runtimeKind, 'wasm_component');
    assert.equal(err.context.metadata.serviceId, 'svc-2');
  });

  it('should support cause chaining', () => {
    const cause = new Error('root cause');
    const err = new LifecycleOrchestrationError(
      'stop', 'native_js', 'svc-3', 'wrapped', {cause},
    );
    assert.equal(err.cause, cause);
  });

  it('should serialize to JSON', () => {
    const err = new LifecycleOrchestrationError(
      'health', 'oci_container', 'svc-4', 'timeout',
    );
    const json = err.toJSON();
    assert.equal(json.name, 'LifecycleOrchestrationError');
    assert.ok(json.message.includes('timeout'));
  });
});

// --- Routing chain: lifecycle -> registry -> driver (Req 1.2, 1.3, 4.5) ---

describe('ServiceRuntimeLifecycle routing chain', () => {
  it('prepare routes through registry.getDriver to driver.prepare',
    async () => {
      const calls = [];
      class SpyDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.NATIVE_JS);
        }
        validateDescriptor(_d) {
          return {valid: true};
        }
        async prepare(def, ctx) {
          calls.push({op: 'prepare', def, ctx});
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
      const registry = makeRegistry(new SpyDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const def = nativeDef('chain-svc');
      const ctx = {nodeId: 'n1'};
      await lifecycle.prepare(def, ctx);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].op, 'prepare');
      assert.equal(calls[0].def, def);
      assert.equal(calls[0].ctx, ctx);
    });

  it('start routes through registry.getDriver to driver.start',
    async () => {
      const calls = [];
      class SpyDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.NATIVE_JS);
        }
        validateDescriptor(_d) {
          return {valid: true};
        }
        async prepare(_d, _c) {
          return {status: PREPARE_STATUS.READY};
        }
        async start(ctx) {
          calls.push({op: 'start', ctx});
          return {status: START_STATUS.RUNNING};
        }
        async stop(_c) {}
        async health(_c) {
          return {status: HEALTH_STATUS.HEALTHY};
        }
      }
      const registry = makeRegistry(new SpyDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const rCtx = replicaCtx(nativeDef('chain-svc'));
      await lifecycle.start(rCtx);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].op, 'start');
      assert.equal(calls[0].ctx, rCtx);
    });

  it('stop routes through registry.getDriver to driver.stop',
    async () => {
      const calls = [];
      class SpyDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.NATIVE_JS);
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
        async stop(ctx) {
          calls.push({op: 'stop', ctx});
        }
        async health(_c) {
          return {status: HEALTH_STATUS.HEALTHY};
        }
      }
      const registry = makeRegistry(new SpyDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const rCtx = replicaCtx(nativeDef('chain-svc'));
      await lifecycle.stop(rCtx);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].op, 'stop');
      assert.equal(calls[0].ctx, rCtx);
    });

  it('health routes through registry.getDriver to driver.health',
    async () => {
      const calls = [];
      class SpyDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.NATIVE_JS);
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
        async health(ctx) {
          calls.push({op: 'health', ctx});
          return {status: HEALTH_STATUS.HEALTHY};
        }
      }
      const registry = makeRegistry(new SpyDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const rCtx = replicaCtx(nativeDef('chain-svc'));
      await lifecycle.health(rCtx);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].op, 'health');
      assert.equal(calls[0].ctx, rCtx);
    });

  it('oci_container reuses the same lifecycle chain (Req 4.5)',
    async () => {
      const ops = [];
      class StubOciDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.OCI_CONTAINER);
        }
        validateDescriptor(_d) {
          return {valid: true};
        }
        async prepare(_d, _c) {
          ops.push('prepare');
          return {status: PREPARE_STATUS.READY};
        }
        async start(_c) {
          ops.push('start');
          return {status: START_STATUS.RUNNING};
        }
        async stop(_c) {
          ops.push('stop');
        }
        async health(_c) {
          ops.push('health');
          return {status: HEALTH_STATUS.HEALTHY};
        }
      }
      const registry = makeRegistry(new StubOciDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const def = {
        runtime_kind: RUNTIME_KIND.OCI_CONTAINER,
        runtime_ref: 'registry.example/oci-svc@sha256:deadbeef',
        serviceId: 'oci-svc',
      };
      const rCtx = replicaCtx(def);

      await lifecycle.prepare(def, {});
      await lifecycle.start(rCtx);
      await lifecycle.health(rCtx);
      await lifecycle.stop(rCtx);

      assert.deepStrictEqual(ops, [
        'prepare', 'start', 'health', 'stop',
      ]);
    });

  it('all three runtime kinds share one lifecycle path', async () => {
    const kinds = [];
    class SpyNative extends RuntimeDriver {
      constructor() {
        super(RUNTIME_KIND.NATIVE_JS);
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
    const registry = makeRegistry(
      new SpyNative(), new StubWasmDriver(), new StubOciDriver(),
    );
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (e) => {
      kinds.push(e.runtimeKind);
    });

    await lifecycle.prepare(nativeDef(), {});
    await lifecycle.prepare(wasmDef(), {});
    await lifecycle.prepare(
      {
        runtime_kind: RUNTIME_KIND.OCI_CONTAINER,
        runtime_ref: 'registry.example/oci@sha256:feedface',
        serviceId: 'oci',
      },
      {},
    );

    assert.equal(kinds.length, 3);
    assert.equal(kinds[0], RUNTIME_KIND.NATIVE_JS);
    assert.equal(kinds[1], RUNTIME_KIND.WASM_COMPONENT);
    assert.equal(kinds[2], RUNTIME_KIND.OCI_CONTAINER);
  });
});

// --- No-duplication contract ---

describe('ServiceRuntimeLifecycle no-duplication contract', () => {
  it('should use the same lifecycle path for all runtime kinds', async () => {
    const registry = makeRegistry(
      new StubNativeDriver(), new StubWasmDriver(),
    );
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const kinds = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (e) => {
      kinds.push(e.runtimeKind);
    });

    await lifecycle.prepare(nativeDef(), {});
    await lifecycle.prepare(wasmDef(), {});

    assert.equal(kinds.length, 2);
    assert.equal(kinds[0], RUNTIME_KIND.NATIVE_JS);
    assert.equal(kinds[1], RUNTIME_KIND.WASM_COMPONENT);
  });

  it('should not have per-kind branching in lifecycle', () => {
    // Verify the class has no runtime-kind-specific methods
    const proto = ServiceRuntimeLifecycle.prototype;
    const methods = Object.getOwnPropertyNames(proto)
      .filter((n) => n !== 'constructor');
    for (const m of methods) {
      assert.ok(
        !m.includes('native') && !m.includes('wasm') &&
        !m.includes('oci'),
        `Found kind-specific method: ${m}`,
      );
    }
  });
});


// --- Endpoint intent single-write-path (Req 8.1, 8.2, 8.3) ---

describe('ServiceRuntimeLifecycle endpoint intent handling', () => {
  it('should emit ENDPOINT_INTENT_RECEIVED when driver returns intent',
    async () => {
      const registry = makeRegistry(new StubNativeDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const events = [];
      lifecycle.on(LIFECYCLE_EVENT.ENDPOINT_INTENT_RECEIVED, (e) => {
        events.push(e);
      });

      await lifecycle.start(replicaCtx(nativeDef('ep-svc')));

      assert.equal(events.length, 1);
      assert.equal(events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(events[0].serviceId, 'ep-svc');
      assert.deepStrictEqual(events[0].endpointIntent, {port: 8081});
    });

  it('should not emit ENDPOINT_INTENT_RECEIVED when no intent',
    async () => {
      const registry = makeRegistry(new StubWasmDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      const events = [];
      lifecycle.on(LIFECYCLE_EVENT.ENDPOINT_INTENT_RECEIVED, (e) => {
        events.push(e);
      });

      await lifecycle.start(replicaCtx(wasmDef('no-ep')));

      assert.equal(events.length, 0);
    });

  it('should throw EndpointIntentError for invalid port', async () => {
    class BadPortDriver extends RuntimeDriver {
      constructor() {
        super(RUNTIME_KIND.NATIVE_JS);
      }
      validateDescriptor(_d) {
        return {valid: true};
      }
      async prepare(_d, _c) {
        return {status: PREPARE_STATUS.READY};
      }
      async start(_c) {
        return {
          status: START_STATUS.RUNNING,
          endpointIntent: {port: -1},
        };
      }
      async stop(_c) {}
      async health(_c) {
        return {status: HEALTH_STATUS.HEALTHY};
      }
    }
    const registry = makeRegistry(new BadPortDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    await assert.rejects(
      () => lifecycle.start(replicaCtx(nativeDef('bad-port'))),
      (err) => {
        assert.ok(err instanceof EndpointIntentError);
        assert.equal(err.runtimeKind, RUNTIME_KIND.NATIVE_JS);
        assert.equal(err.serviceId, 'bad-port');
        assert.ok(err.reason.includes('port'));
        return true;
      },
    );
  });

  it('should throw EndpointIntentError for non-object intent',
    async () => {
      class StringIntentDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.NATIVE_JS);
        }
        validateDescriptor(_d) {
          return {valid: true};
        }
        async prepare(_d, _c) {
          return {status: PREPARE_STATUS.READY};
        }
        async start(_c) {
          return {
            status: START_STATUS.RUNNING,
            endpointIntent: 'not-an-object',
          };
        }
        async stop(_c) {}
        async health(_c) {
          return {status: HEALTH_STATUS.HEALTHY};
        }
      }
      const registry = makeRegistry(new StringIntentDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      await assert.rejects(
        () => lifecycle.start(replicaCtx(nativeDef('str-ep'))),
        (err) => {
          assert.ok(err instanceof EndpointIntentError);
          return true;
        },
      );
    });

  it('should call endpointWriter with validated intent', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const writes = [];
    lifecycle.setEndpointWriter(async (svcId, kind, intent) => {
      writes.push({svcId, kind, intent});
    });

    await lifecycle.start(replicaCtx(nativeDef('writer-svc')));

    assert.equal(writes.length, 1);
    assert.equal(writes[0].svcId, 'writer-svc');
    assert.equal(writes[0].kind, RUNTIME_KIND.NATIVE_JS);
    assert.deepStrictEqual(writes[0].intent, {port: 8081});
  });

  it('should emit ENDPOINT_REGISTERED after successful write',
    async () => {
      const registry = makeRegistry(new StubNativeDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      lifecycle.setEndpointWriter(async () => {});
      const events = [];
      lifecycle.on(LIFECYCLE_EVENT.ENDPOINT_REGISTERED, (e) => {
        events.push(e);
      });

      await lifecycle.start(replicaCtx(nativeDef('reg-svc')));

      assert.equal(events.length, 1);
      assert.equal(events[0].serviceId, 'reg-svc');
      assert.deepStrictEqual(events[0].endpointIntent, {port: 8081});
    });

  it('should throw on endpoint writer failure', async () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.setEndpointWriter(async () => {
      throw new Error('SQL write failed');
    });
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.ENDPOINT_REGISTRATION_FAILED, (e) => {
      events.push(e);
    });

    await assert.rejects(
      () => lifecycle.start(replicaCtx(nativeDef('fail-ep'))),
      (err) => {
        assert.ok(err instanceof LifecycleOrchestrationError);
        assert.ok(err.message.includes('endpoint registration failed'));
        assert.ok(err.cause.message.includes('SQL write failed'));
        return true;
      },
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].serviceId, 'fail-ep');
  });

  it('should not call endpointWriter when no intent returned',
    async () => {
      const registry = makeRegistry(new StubWasmDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      let called = false;
      lifecycle.setEndpointWriter(async () => {
        called = true;
      });

      await lifecycle.start(replicaCtx(wasmDef('no-ep')));

      assert.equal(called, false);
    });

  it('should reject non-function endpointWriter', () => {
    const registry = makeRegistry(new StubNativeDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    assert.throws(
      () => lifecycle.setEndpointWriter('not-a-fn'),
      (err) => err instanceof TypeError,
    );
  });

  it('should accept intent with host and protocol', async () => {
    class FullIntentDriver extends RuntimeDriver {
      constructor() {
        super(RUNTIME_KIND.NATIVE_JS);
      }
      validateDescriptor(_d) {
        return {valid: true};
      }
      async prepare(_d, _c) {
        return {status: PREPARE_STATUS.READY};
      }
      async start(_c) {
        return {
          status: START_STATUS.RUNNING,
          endpointIntent: {
            host: '0.0.0.0', port: 9090, protocol: 'ws',
          },
        };
      }
      async stop(_c) {}
      async health(_c) {
        return {status: HEALTH_STATUS.HEALTHY};
      }
    }
    const registry = makeRegistry(new FullIntentDriver());
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const writes = [];
    lifecycle.setEndpointWriter(async (svcId, kind, intent) => {
      writes.push(intent);
    });

    await lifecycle.start(replicaCtx(nativeDef('full-ep')));

    assert.equal(writes.length, 1);
    assert.equal(writes[0].host, '0.0.0.0');
    assert.equal(writes[0].port, 9090);
    assert.equal(writes[0].protocol, 'ws');
  });
});

// --- validateEndpointIntent unit tests ---

describe('validateEndpointIntent', () => {
  it('should accept valid intent with port only', () => {
    const result = validateEndpointIntent({port: 8080});
    assert.equal(result.valid, true);
  });

  it('should accept valid intent with all fields', () => {
    const result = validateEndpointIntent({
      host: 'localhost', port: 443, protocol: 'https',
    });
    assert.equal(result.valid, true);
  });

  it('should reject null', () => {
    const result = validateEndpointIntent(null);
    assert.equal(result.valid, false);
  });

  it('should reject non-object', () => {
    const result = validateEndpointIntent('string');
    assert.equal(result.valid, false);
  });

  it('should reject missing port', () => {
    const result = validateEndpointIntent({host: 'localhost'});
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('port'));
  });

  it('should reject port below 1', () => {
    const result = validateEndpointIntent({port: 0});
    assert.equal(result.valid, false);
  });

  it('should reject port above 65535', () => {
    const result = validateEndpointIntent({port: 65536});
    assert.equal(result.valid, false);
  });

  it('should reject non-integer port', () => {
    const result = validateEndpointIntent({port: 80.5});
    assert.equal(result.valid, false);
  });

  it('should reject non-string host', () => {
    const result = validateEndpointIntent({port: 80, host: 123});
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('host'));
  });

  it('should reject non-string protocol', () => {
    const result = validateEndpointIntent({port: 80, protocol: 42});
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('protocol'));
  });

  it('should accept port 1 (min boundary)', () => {
    assert.equal(validateEndpointIntent({port: 1}).valid, true);
  });

  it('should accept port 65535 (max boundary)', () => {
    assert.equal(validateEndpointIntent({port: 65535}).valid, true);
  });
});

// --- EndpointIntentError ---

describe('EndpointIntentError', () => {
  it('should include runtimeKind, serviceId, and reason', () => {
    const err = new EndpointIntentError(
      'native_js', 'svc-1', 'port out of range',
    );
    assert.equal(err.name, 'EndpointIntentError');
    assert.equal(err.runtimeKind, 'native_js');
    assert.equal(err.serviceId, 'svc-1');
    assert.equal(err.reason, 'port out of range');
    assert.ok(err.message.includes('native_js'));
    assert.ok(err.message.includes('svc-1'));
    assert.ok(err.message.includes('port out of range'));
  });

  it('should have context metadata', () => {
    const err = new EndpointIntentError(
      'wasm_component', 'svc-2', 'bad host',
    );
    assert.equal(
      err.context.component, 'ServiceRuntimeLifecycle',
    );
    assert.equal(err.context.operation, 'registerEndpoint');
    assert.equal(
      err.context.metadata.runtimeKind, 'wasm_component',
    );
  });

  it('should serialize to JSON', () => {
    const err = new EndpointIntentError(
      'oci_container', 'svc-3', 'missing port',
    );
    const json = err.toJSON();
    assert.equal(json.name, 'EndpointIntentError');
    assert.ok(json.message.includes('missing port'));
  });
});
