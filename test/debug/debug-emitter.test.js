import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DebugEmitter,
} from '../../src/debug/debug-emitter.js';
import {
  DEBUG_ERROR_MSG,
  DEBUG_TRACE_LEVEL,
} from '../../src/debug/debug-constants.js';

describe('DebugEmitter', () => {
  it('rejects invalid trace level', () => {
    const emitter = new DebugEmitter({
      sessionResolver: {isTraceActive: () => true},
      traceCollector: {emit: () => {}},
    });

    assert.throws(
      () => emitter.emitTrace({
        level: 'invalid',
        message: 'bad level',
      }),
      (error) => {
        assert.match(
          error.message,
          new RegExp(DEBUG_ERROR_MSG.TRACE_LEVEL_INVALID_PREFIX),
        );
        return true;
      },
    );
  });

  it('takes no allocation path when trace is inactive', () => {
    let collectorCalled = false;
    let buildCalled = false;
    const emitter = new DebugEmitter({
      sessionResolver: {isTraceActive: () => false},
      traceCollector: {
        emit: () => {
          collectorCalled = true;
        },
      },
      buildTraceEvent: () => {
        buildCalled = true;
        return {};
      },
    });

    const emitted = emitter.emitTrace({
      level: DEBUG_TRACE_LEVEL.INFO,
      message: 'inactive',
      scope: {serviceDefinitionId: 'svc-a'},
    });

    assert.equal(emitted, false);
    assert.equal(collectorCalled, false);
    assert.equal(buildCalled, false);
  });

  it('builds full envelope and forwards to collector when active', () => {
    const events = [];
    const emitter = new DebugEmitter({
      sessionResolver: {isTraceActive: () => true},
      traceCollector: {
        emit: (event) => {
          events.push(event);
        },
      },
      now: () => 12345,
      nodeId: 'node-a',
      serviceDefinitionId: 'svc-a',
      replicaId: 'replica-a',
      runtimeKind: 'wasm_component',
      source: 'service',
    });

    const emitted = emitter.emitTrace({
      level: DEBUG_TRACE_LEVEL.DEBUG,
      message: 'hello',
      context: {x: 1},
      scope: {
        lineageId: 'lineage-1',
        stageId: 2,
        partitionId: 'p1',
      },
      metadata: {
        sessionId: 'session-1',
      },
    });

    assert.equal(emitted, true);
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.level, 'debug');
    assert.equal(event.message, 'hello');
    assert.equal(event.timestamp, 12345);
    assert.equal(event.lineageId, 'lineage-1');
    assert.equal(event.stageId, 2);
    assert.equal(event.partitionId, 'p1');
    assert.equal(event.nodeId, 'node-a');
    assert.equal(event.serviceDefinitionId, 'svc-a');
    assert.equal(event.replicaId, 'replica-a');
    assert.equal(event.runtimeKind, 'wasm_component');
    assert.equal(event.source, 'service');
    assert.equal(event.sessionId, 'session-1');
  });
});
