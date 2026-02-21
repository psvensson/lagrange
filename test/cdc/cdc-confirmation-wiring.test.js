/**
 * Wiring tests for CDC confirmation in PartitionService write methods.
 * Verifies that insertData, updateData, upsertData, deleteData correctly
 * attach cdcConfirmation when awaitCDCConfirmation is set, and that the
 * confirmation resolves when the cache event fires.
 * Requirements: 1.1, 1.3, 1.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {CDCConfirmationTracker} from
  '../../src/cdc/cdc-confirmation-tracker.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDC_CONFIRMATION_ERROR_TYPE,
} from '../../src/constants/cdc-lifecycle-constants.js';

const SCHEMA = {
  columns: [
    {name: 'node_id', type: 'TEXT', primaryKey: true},
    {name: 'status', type: 'TEXT'},
  ],
};

const SHORT_TIMEOUT_MS = 100;

/**
 * Minimal SystemTableCache stub supporting onCacheChange/offCacheChange.
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
  };
}

/**
 * Create a single-replica PartitionService with a CDCConfirmationTracker.
 */
async function createWiredPartition(cache) {
  const tracker = new CDCConfirmationTracker({
    systemTableCache: cache,
    timeoutMs: SHORT_TIMEOUT_MS,
  });

  const partition = new PartitionService({
    partitionId: 'wiring-p1',
    tableId: 'nodes',
    tableName: 'nodes',
    replicaId: 'wiring-p1-r1',
    replicaIds: ['wiring-p1-r1'],
    nodeId: 'test-node',
    dbPath: ':memory:',
    schema: SCHEMA,
    cdcConfirmationTracker: tracker,
  });

  await partition.initialize();
  await Promise.resolve();

  return {partition, tracker};
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('CDC wiring — insertData attaches cdcConfirmation that resolves',
  async (t) => {
    const cache = createCacheStub();
    const {partition, tracker} = await createWiredPartition(cache);

    const result = await partition.insertData(
      'nodes',
      {node_id: 'n1', status: 'ACTIVE'},
      {awaitCDCConfirmation: true},
    );

    t.ok(result.cdcConfirmation instanceof Promise,
      'cdcConfirmation is a Promise');

    cache.fire('nodes', 'INSERT', {node_id: 'n1'});
    await result.cdcConfirmation;

    t.pass('insertData confirmation resolved');
    tracker.shutdown();
    await partition.shutdown();
    t.end();
  });

test('CDC wiring — updateData attaches cdcConfirmation that resolves',
  async (t) => {
    const cache = createCacheStub();
    const {partition, tracker} = await createWiredPartition(cache);

    await partition.insertData('nodes', {node_id: 'n2', status: 'INIT'});

    const result = await partition.updateData(
      'nodes',
      {node_id: 'n2'},
      {status: 'ACTIVE'},
      {awaitCDCConfirmation: true},
    );

    t.ok(result.cdcConfirmation instanceof Promise,
      'cdcConfirmation is a Promise');

    cache.fire('nodes', 'UPDATE', {node_id: 'n2', status: 'ACTIVE'});
    await result.cdcConfirmation;

    t.pass('updateData confirmation resolved');
    tracker.shutdown();
    await partition.shutdown();
    t.end();
  });

test('CDC wiring — upsertData attaches cdcConfirmation that resolves',
  async (t) => {
    const cache = createCacheStub();
    const {partition, tracker} = await createWiredPartition(cache);

    const result = await partition.upsertData(
      'nodes',
      {node_id: 'n3', status: 'READY'},
      {awaitCDCConfirmation: true},
    );

    t.ok(result.cdcConfirmation instanceof Promise,
      'cdcConfirmation is a Promise');

    cache.fire('nodes', 'UPSERT', {node_id: 'n3'});
    await result.cdcConfirmation;

    t.pass('upsertData confirmation resolved');
    tracker.shutdown();
    await partition.shutdown();
    t.end();
  });

test('CDC wiring — deleteData attaches cdcConfirmation that resolves',
  async (t) => {
    const cache = createCacheStub();
    const {partition, tracker} = await createWiredPartition(cache);

    await partition.insertData('nodes', {node_id: 'n4', status: 'ACTIVE'});

    const result = await partition.deleteData(
      'nodes',
      {node_id: 'n4'},
      {awaitCDCConfirmation: true},
    );

    t.ok(result.cdcConfirmation instanceof Promise,
      'cdcConfirmation is a Promise');

    cache.fire('nodes', 'DELETE', {node_id: 'n4'});
    await result.cdcConfirmation;

    t.pass('deleteData confirmation resolved');
    tracker.shutdown();
    await partition.shutdown();
    t.end();
  });

test('CDC wiring — no cdcConfirmation without awaitCDCConfirmation flag',
  async (t) => {
    const cache = createCacheStub();
    const {partition, tracker} = await createWiredPartition(cache);

    const result = await partition.insertData(
      'nodes',
      {node_id: 'n5', status: 'ACTIVE'},
    );

    t.equal(result.cdcConfirmation, undefined,
      'no cdcConfirmation on default path');

    tracker.shutdown();
    await partition.shutdown();
    t.end();
  });

test('CDC wiring — shutdown rejects pending wired confirmations',
  async (t) => {
    const cache = createCacheStub();
    const {partition, tracker} = await createWiredPartition(cache);

    const result = await partition.insertData(
      'nodes',
      {node_id: 'n6', status: 'ACTIVE'},
      {awaitCDCConfirmation: true},
    );

    t.ok(result.cdcConfirmation instanceof Promise);

    tracker.shutdown();

    try {
      await result.cdcConfirmation;
      t.fail('should have rejected');
    } catch (err) {
      t.equal(err.name, CDC_CONFIRMATION_ERROR_TYPE.SHUTDOWN);
    }

    await partition.shutdown();
    t.end();
  });

test('CDC wiring — duplicate key: second write resolves, first rejected',
  async (t) => {
    const cache = createCacheStub();
    const {partition, tracker} = await createWiredPartition(cache);

    const r1 = await partition.insertData(
      'nodes',
      {node_id: 'dup-1', status: 'INIT'},
      {awaitCDCConfirmation: true},
    );

    const r2 = await partition.upsertData(
      'nodes',
      {node_id: 'dup-1', status: 'ACTIVE'},
      {awaitCDCConfirmation: true},
    );

    t.ok(r1.cdcConfirmation instanceof Promise);
    t.ok(r2.cdcConfirmation instanceof Promise);

    // Fire cache event — resolves the latest (r2) confirmation
    cache.fire('nodes', 'UPSERT', {node_id: 'dup-1'});
    await r2.cdcConfirmation;

    // r1 was overwritten in the tracker map; shut down to reject it
    tracker.shutdown();

    const settled = await Promise.allSettled([r1.cdcConfirmation]);
    t.equal(settled[0].status, 'rejected',
      'first confirmation rejected after overwrite');

    await partition.shutdown();
    t.end();
  });
