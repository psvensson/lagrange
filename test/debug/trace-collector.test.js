import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  TraceCollector,
} from '../../src/debug/trace-collector.js';

function createEvent(overrides = {}) {
  return {
    level: 'info',
    message: 'hello',
    lineageId: 'lineage-1',
    stageId: 1,
    partitionId: 'p1',
    nodeId: 'node-a',
    serviceDefinitionId: 'svc-a',
    replicaId: 'replica-a',
    runtimeKind: 'wasm_component',
    source: 'service',
    ...overrides,
  };
}

describe('TraceCollector', () => {
  it('preserves per-source ordering', () => {
    const collector = new TraceCollector();
    const delivered = [];
    collector.subscribe((payload) => {
      delivered.push(JSON.parse(payload).message);
    });

    collector.emit(createEvent({message: 'm1'}));
    collector.emit(createEvent({message: 'm2'}));
    collector.emit(createEvent({message: 'm3'}));

    assert.deepEqual(delivered, ['m1', 'm2', 'm3']);
  });

  it('applies lineage prefix filters', () => {
    const collector = new TraceCollector();
    const delivered = [];
    collector.subscribe((payload) => {
      delivered.push(JSON.parse(payload).lineageId);
    }, {lineagePrefix: 'lineage-abc'});

    collector.emit(createEvent({lineageId: 'lineage-abc-1'}));
    collector.emit(createEvent({lineageId: 'lineage-xyz-1'}));

    assert.deepEqual(delivered, ['lineage-abc-1']);
  });

  it('drops when there are no subscribers', () => {
    const collector = new TraceCollector();
    const result = collector.emit(createEvent());
    assert.equal(result.delivered, 0);
    assert.equal(result.dropped, true);
  });

  it('supports unsubscribe cleanup', () => {
    const collector = new TraceCollector();
    const delivered = [];
    const subscription = collector.subscribe((payload) => {
      delivered.push(JSON.parse(payload).message);
    });

    collector.emit(createEvent({message: 'first'}));
    subscription.unsubscribe();
    collector.emit(createEvent({message: 'second'}));

    assert.deepEqual(delivered, ['first']);
    assert.equal(collector.getSubscriberCount(), 0);
  });
});
