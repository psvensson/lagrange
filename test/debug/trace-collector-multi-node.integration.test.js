import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TraceCollector} from '../../src/debug/trace-collector.js';
import {DebugEmitter} from '../../src/debug/debug-emitter.js';

describe('TraceCollector multi-node lineage integration', () => {
  it('collects lineage-correlated trace events across multiple emitters',
    () => {
      const collector = new TraceCollector();
      const delivered = [];
      collector.subscribe((payload) => {
        delivered.push(JSON.parse(payload));
      }, {
        lineagePrefix: 'lineage-multi',
      });

      const resolver = {
        resolveSession() {
          return {sessionId: 'session-multi'};
        },
        isTraceActive(scope) {
          return Boolean(this.resolveSession(scope));
        },
      };

      const emitterA = new DebugEmitter({
        sessionResolver: resolver,
        traceCollector: collector,
        nodeId: 'node-a',
        serviceDefinitionId: 'svc-a',
        source: 'service',
      });
      const emitterB = new DebugEmitter({
        sessionResolver: resolver,
        traceCollector: collector,
        nodeId: 'node-b',
        serviceDefinitionId: 'svc-b',
        source: 'partition_callback',
      });

      const traceA = emitterA.createTraceApi({
        lineageId: 'lineage-multi-1',
        stageId: 1,
        source: 'service',
      });
      const traceB = emitterB.createTraceApi({
        lineageId: 'lineage-multi-1',
        stageId: 2,
        source: 'partition_callback',
      });

      traceA.trace('info', 'service trace');
      traceB.trace('debug', 'callback trace');

      assert.equal(delivered.length, 2);
      assert.deepEqual(
        delivered.map((event) => event.nodeId),
        ['node-a', 'node-b'],
      );
      assert.deepEqual(
        delivered.map((event) => event.lineageId),
        ['lineage-multi-1', 'lineage-multi-1'],
      );
      assert.deepEqual(
        delivered.map((event) => event.stageId),
        [1, 2],
      );
    });
});
