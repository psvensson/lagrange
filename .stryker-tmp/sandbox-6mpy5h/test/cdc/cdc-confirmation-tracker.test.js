/**
 * Unit tests for CDCConfirmationTracker.
 * Tests awaitable CDC delivery confirmation, timeout, and shutdown.
 * Requirements: 1.1, 1.3, 1.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {CDCConfirmationTracker} from
  '../../src/cdc/cdc-confirmation-tracker.js';
import {
  CDC_CONFIRMATION_ERROR_TYPE,
} from '../../src/constants/cdc-lifecycle-constants.js';

/**
 * Minimal SystemTableCache stub that supports onCacheChange/offCacheChange.
 * Calling fire() simulates a cache-change notification.
 */
function createCacheStub() {
  const listeners = new Set();
  return {
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    fire(tableName, operation, record) {
      for (const l of listeners) {
        l(tableName, operation, record);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

test('CDCConfirmationTracker — resolves on matching INSERT', async (t) => {
  const cache = createCacheStub();
  const tracker = new CDCConfirmationTracker({
    systemTableCache: cache,
    timeoutMs: 500,
  });

  const promise = tracker.awaitConfirmation('nodes', 'node-1');
  cache.fire('nodes', 'INSERT', {node_id: 'node-1', status: 'ACTIVE'});
  await promise;

  tracker.shutdown();
  t.pass('confirmation resolved for INSERT');
  t.end();
});

test('CDCConfirmationTracker — resolves on matching UPDATE', async (t) => {
  const cache = createCacheStub();
  const tracker = new CDCConfirmationTracker({
    systemTableCache: cache,
    timeoutMs: 500,
  });

  const promise = tracker.awaitConfirmation('nodes', 'node-2');
  cache.fire('nodes', 'UPDATE', {node_id: 'node-2', status: 'READY'});
  await promise;

  tracker.shutdown();
  t.pass('confirmation resolved for UPDATE');
  t.end();
});

test('CDCConfirmationTracker — resolves on matching UPSERT', async (t) => {
  const cache = createCacheStub();
  const tracker = new CDCConfirmationTracker({
    systemTableCache: cache,
    timeoutMs: 500,
  });

  const promise = tracker.awaitConfirmation('config', 'my_key');
  cache.fire('config', 'UPSERT', {config_key: 'my_key', config_value: '1'});
  await promise;

  tracker.shutdown();
  t.pass('confirmation resolved for UPSERT');
  t.end();
});

test('CDCConfirmationTracker — resolves on matching DELETE', async (t) => {
  const cache = createCacheStub();
  const tracker = new CDCConfirmationTracker({
    systemTableCache: cache,
    timeoutMs: 500,
  });

  const promise = tracker.awaitConfirmation('nodes', 'node-3');
  cache.fire('nodes', 'DELETE', {node_id: 'node-3'});
  await promise;

  tracker.shutdown();
  t.pass('confirmation resolved for DELETE');
  t.end();
});

test('CDCConfirmationTracker — timeout rejects with descriptive error',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 50,
    });

    try {
      await tracker.awaitConfirmation('nodes', 'node-x', 50);
      t.fail('should have rejected');
    } catch (err) {
      t.equal(err.name, CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT);
      t.equal(err.tableName, 'nodes');
      t.equal(err.primaryKey, 'node-x');
      t.equal(err.timeoutMs, 50);
      t.ok(err.message.includes('timeout=50ms'));
    }

    tracker.shutdown();
    t.end();
  });

test('CDCConfirmationTracker — shutdown rejects all pending', async (t) => {
  const cache = createCacheStub();
  const tracker = new CDCConfirmationTracker({
    systemTableCache: cache,
    timeoutMs: 5000,
  });

  const p1 = tracker.awaitConfirmation('nodes', 'n1');
  const p2 = tracker.awaitConfirmation('partitions', 'p1');

  tracker.shutdown();

  const results = await Promise.allSettled([p1, p2]);
  for (const r of results) {
    t.equal(r.status, 'rejected');
    t.equal(r.reason.name, CDC_CONFIRMATION_ERROR_TYPE.SHUTDOWN);
  }
  t.end();
});

test('CDCConfirmationTracker — shutdown unregisters cache listener',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 500,
    });

    t.equal(cache.listenerCount(), 1, 'listener registered');
    tracker.shutdown();
    t.equal(cache.listenerCount(), 0, 'listener removed after shutdown');
    t.end();
  });

test('CDCConfirmationTracker — awaitConfirmation after shutdown rejects',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 500,
    });

    tracker.shutdown();

    try {
      await tracker.awaitConfirmation('nodes', 'n1');
      t.fail('should have rejected');
    } catch (err) {
      t.equal(err.name, CDC_CONFIRMATION_ERROR_TYPE.SHUTDOWN);
    }
    t.end();
  });

test('CDCConfirmationTracker — ignores non-matching events', async (t) => {
  const cache = createCacheStub();
  const tracker = new CDCConfirmationTracker({
    systemTableCache: cache,
    timeoutMs: 100,
  });

  const promise = tracker.awaitConfirmation('nodes', 'node-1', 100);

  // Fire event for a different key — should not resolve
  cache.fire('nodes', 'INSERT', {node_id: 'node-other'});
  // Fire event for a different table — should not resolve
  cache.fire('partitions', 'INSERT', {partition_id: 'node-1'});

  try {
    await promise;
    t.fail('should have timed out');
  } catch (err) {
    t.equal(err.name, CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT);
  }

  tracker.shutdown();
  t.end();
});

test('CDCConfirmationTracker — duplicate confirmation for same key',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 500,
    });

    // Second awaitConfirmation for same key overwrites the first
    const p1 = tracker.awaitConfirmation('nodes', 'node-1');
    const p2 = tracker.awaitConfirmation('nodes', 'node-1');

    cache.fire('nodes', 'INSERT', {node_id: 'node-1'});

    // p2 should resolve (it replaced p1 in the map)
    await p2;

    // p1's timer is still running — it will timeout since its entry
    // was replaced. Clean up by shutting down.
    tracker.shutdown();

    const result = await Promise.allSettled([p1]);
    // p1 was overwritten so its timer fires or shutdown rejects it
    t.equal(result[0].status, 'rejected');
    t.end();
  });

test('CDCConfirmationTracker — ignores events with null/undefined pk',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 100,
    });

    const promise = tracker.awaitConfirmation('nodes', 'node-1', 100);

    // Fire event with missing pk field
    cache.fire('nodes', 'INSERT', {});
    // Fire event with null pk
    cache.fire('nodes', 'INSERT', {node_id: null});

    try {
      await promise;
      t.fail('should have timed out');
    } catch (err) {
      t.equal(err.name, CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT);
    }

    tracker.shutdown();
    t.end();
  });
