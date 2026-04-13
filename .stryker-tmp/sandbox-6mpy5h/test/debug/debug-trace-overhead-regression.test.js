// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {DebugEmitter} from '../../src/debug/debug-emitter.js';

describe('Debug trace inactive overhead regression', () => {
  it('keeps inactive trace path within a bounded overhead budget', () => {
    let collectorCalls = 0;
    const emitter = new DebugEmitter({
      sessionResolver: {
        resolveSession() {
          return null;
        },
      },
      traceCollector: {
        emit() {
          collectorCalls += 1;
        },
      },
    });

    const traceApi = emitter.createTraceApi({
      serviceDefinitionId: 'svc-overhead',
      source: 'service',
    });

    const iterations = 5000;
    const baselineMs = measure(iterations, () => {
      noop();
    });
    const inactiveTraceMs = measure(iterations, () => {
      traceApi.trace('info', 'inactive');
    });

    const allowedMs = baselineMs * 8 + 20;
    assert.equal(collectorCalls, 0);
    assert.equal(inactiveTraceMs <= allowedMs, true);
  });
});

function measure(iterations, work) {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    work();
  }
  return performance.now() - start;
}

function noop() {}
