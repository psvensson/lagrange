/**
 * Unit tests for CDCConfirmationTracker.
 * Tests awaitable CDC delivery confirmation, timeout, and shutdown.
 * Requirements: 1.1, 1.3, 1.4
 */

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
    fire(tableName, operation, record, metadata) {
      for (const l of listeners) {
        l(tableName, operation, record, metadata);
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

test('CDCConfirmationTracker — concurrent waiters for same key both resolve independently',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 500,
    });

    let p1Resolved = false;
    let p2Resolved = false;
    const p1 = tracker.awaitConfirmation('nodes', 'node-1', {
      expectedFields: {status: 'JOINING'},
      originHlc: '1700000000001-0-node-1',
    }).then(() => {
      p1Resolved = true;
    });
    const p2 = tracker.awaitConfirmation('nodes', 'node-1', {
      expectedFields: {status: 'ACTIVE'},
      originHlc: '1700000000002-0-node-1',
    }).then(() => {
      p2Resolved = true;
    });

    cache.fire('nodes', 'INSERT', {
      node_id: 'node-1',
      status: 'JOINING',
      updated_at_hlc: '1700000000001-0-node-1',
    });
    await p1;
    t.equal(p1Resolved, true, 'first waiter resolved on its causal event');
    t.equal(p2Resolved, false, 'second waiter remains pending until its own event');

    cache.fire('nodes', 'UPDATE', {
      node_id: 'node-1',
      status: 'ACTIVE',
      updated_at_hlc: '1700000000002-0-node-1',
    });
    await p2;
    t.equal(p2Resolved, true, 'second waiter resolved on its causal event');

    tracker.shutdown();
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

test('CDCConfirmationTracker — causal criteria ignore unrelated updates and missing HLCs',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 500,
    });

    let resolved = false;
    const promise = tracker.awaitConfirmation('nodes', 'node-1', {
      expectedFields: {storage_budget_source: 'test-update-source'},
      originHlc: '1700000000002-0-node-1',
    }).then(() => {
      resolved = true;
    });

    // Unrelated heartbeat update with older HLC and stale budget source must NOT resolve
    cache.fire('nodes', 'UPDATE', {
      node_id: 'node-1',
      status: 'active',
      storage_budget_source: 'backfill',
      updated_at_hlc: '1700000000001-0-node-1',
    });
    await Promise.resolve();
    t.equal(resolved, false, 'unrelated heartbeat must not satisfy causal confirmation');

    // Event with matching fields but absent causal HLC metadata must NOT resolve
    cache.fire('nodes', 'UPDATE', {
      node_id: 'node-1',
      status: 'active',
      storage_budget_source: 'test-update-source',
    });
    await Promise.resolve();
    t.equal(resolved, false, 'event missing causal HLC metadata must not satisfy causal confirmation');

    // Matching causal update resolves the confirmation
    cache.fire('nodes', 'UPDATE', {
      node_id: 'node-1',
      status: 'active',
      storage_budget_source: 'test-update-source',
      updated_at_hlc: '1700000000002-0-node-1',
    });
    await promise;
    t.equal(resolved, true, 'matching causal update resolves confirmation');

    tracker.shutdown();
    t.end();
  });

test('CDCConfirmationTracker — resolves immediately when matching causal event arrived before waiter registration',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 100,
    });

    // CDC event arrives BEFORE awaitConfirmation is called
    cache.fire('nodes', 'UPDATE', {
      node_id: 'node-early',
      status: 'READY',
      updated_at_hlc: '1700000000005-0-node-early',
    });

    await tracker.awaitConfirmation('nodes', 'node-early', {
      operation: 'UPDATE',
      expectedFields: {status: 'READY'},
      originHlc: '1700000000005-0-node-early',
    });

    t.pass('causal confirmation resolved from recent event history without race');
    tracker.shutdown();
    t.end();
  });

test('CDCConfirmationTracker — bounds global recentEvents key retention under key churn',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 60,
    });

    for (let i = 0; i < 400; i += 1) {
      cache.fire('replica_operations', 'INSERT', {
        operation_id: `op-${i}`,
        status: 'COMPLETED',
        updated_at_hlc: `1700000000${String(i).padStart(3, '0')}-0-node-1`,
      });
    }

    t.ok(
      tracker.recentEvents.size <= 256,
      `recentEvents size (${tracker.recentEvents.size}) is bounded at <= 256 keys`,
    );
    t.equal(
      tracker.recentEvents.has('replica_operations:op-0'),
      false,
      'oldest key is evicted when global key cap is exceeded',
    );
    t.equal(
      tracker.recentEvents.has('replica_operations:op-399'),
      true,
      'newest key is retained in bounded recent event history',
    );

    await tracker.awaitConfirmation('replica_operations', 'op-399', {
      originHlc: '1700000000399-0-node-1',
    });

    tracker.shutdown();
    t.end();
  });

test('CDCConfirmationTracker — fail-closed rejection when record or required HLC is malformed',
  async (t) => {
    const cache = createCacheStub();
    const tracker = new CDCConfirmationTracker({
      systemTableCache: cache,
      timeoutMs: 60,
    });

    let resolved = false;
    const promise = tracker.awaitConfirmation('nodes', 'node-hlc-guard', {
      timeoutMs: 60,
      expectedFields: {status: 'READY'},
      originHlc: '1700000000002-0-node-1',
    }).then(() => {
      resolved = true;
    });

    // 'zzzz-invalid-hlc' would compare > '1700000000002-0-node-1' under localeCompare,
    // but must be rejected fail-closed by HLCTimestamp parsing.
    cache.fire('nodes', 'UPDATE', {
      node_id: 'node-hlc-guard',
      status: 'READY',
      updated_at_hlc: 'zzzz-invalid-hlc',
    });
    await Promise.resolve();
    t.equal(
      resolved,
      false,
      'malformed record HLC must not satisfy causal confirmation via string comparison',
    );

    // Valid HLC >= required originHlc resolves the waiter.
    cache.fire('nodes', 'UPDATE', {
      node_id: 'node-hlc-guard',
      status: 'READY',
      updated_at_hlc: '1700000000002-0-node-1',
    });
    await promise;
    t.equal(resolved, true, 'valid HLC satisfies causal confirmation');

    // A waiter supplying a malformed required HLC must also fail closed.
    await t.rejects(
      tracker.awaitConfirmation('nodes', 'node-hlc-guard', {
        timeoutMs: 40,
        originHlc: 'malformed:required:hlc',
      }),
      {name: CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT},
      'waiter with malformed required HLC fails closed instead of matching recent events',
    );

    tracker.shutdown();
    t.end();
  });
