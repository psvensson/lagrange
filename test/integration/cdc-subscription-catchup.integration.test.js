/**
 * CDC subscription handshake + catch-up integration tests.
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const TEST_TABLE_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'value', type: 'INTEGER'},
  ],
});

const TEST_IDS = Object.freeze({
  PARTITION_ID: 'cdc-handshake-p1',
  TABLE_ID: 'cdc_handshake_items',
  REPLICA_ID: 'cdc-handshake-p1-r1',
  NODE_ID: 'cdc-handshake-node-1',
});

const HANDSHAKE_STATUS_OK = 'ok';
const CATCHUP_MODE_BACKFILL = 'backfill';
const STREAM_MODE_CATCHUP = 'catchup';
const STREAM_MODE_STEADY = 'steady';

function createPartition() {
  return new PartitionService({
    partitionId: TEST_IDS.PARTITION_ID,
    tableId: TEST_IDS.TABLE_ID,
    tableName: TEST_IDS.TABLE_ID,
    replicaId: TEST_IDS.REPLICA_ID,
    replicaIds: [TEST_IDS.REPLICA_ID],
    nodeId: TEST_IDS.NODE_ID,
    schema: TEST_TABLE_SCHEMA,
    dbPath: ':memory:',
  });
}

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: TEST_IDS.NODE_ID},
  });

  const loggingService = LoggingService.getInstance();
  loggingService.initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('CDC subscription handshake + catch-up integration', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  await t.test('late subscriber receives deterministic catch-up and steady-state transition', async (t) => {
    const partition = createPartition();

    try {
      await partition.initialize();

      await partition.insertData(TEST_IDS.TABLE_ID, {id: 'row-1', value: 1});
      await partition.updateData(TEST_IDS.TABLE_ID, {id: 'row-1'}, {value: 2});
      await partition.insertData(TEST_IDS.TABLE_ID, {id: 'row-2', value: 3});

      const delivered = [];
      const subscriber = (event) => {
        delivered.push(event);
      };

      const handshake = await partition.subscribeToCDCWithHandshake(subscriber, {
        subscriberId: 'integration-late-subscriber-1',
      });

      t.equal(handshake.status, HANDSHAKE_STATUS_OK,
        'handshake should acknowledge subscription');
      t.equal(handshake.catchup.mode, CATCHUP_MODE_BACKFILL,
        'late subscription should enter catch-up mode');
      t.ok(handshake.catchup.bufferedEventsReplayed >= 3,
        'catch-up should replay buffered events deterministically');
      t.equal(handshake.streamMode, STREAM_MODE_STEADY,
        'stream should transition to steady after catch-up completes');

      const catchupEvents = delivered.filter((event) => event.streamMode === STREAM_MODE_CATCHUP);
      t.equal(catchupEvents.length, handshake.catchup.bufferedEventsReplayed,
        'subscriber should observe exactly replayed catch-up events');

      const catchupSequence = catchupEvents.map((event) => event.sequenceNumber);
      const sortedSequence = [...catchupSequence].sort((a, b) => a - b);
      t.same(catchupSequence, sortedSequence,
        'catch-up events should be delivered in deterministic sequence order');

      await partition.updateData(TEST_IDS.TABLE_ID, {id: 'row-2'}, {value: 4});

      const steadyEvents = delivered.filter((event) => event.streamMode === STREAM_MODE_STEADY);
      t.ok(steadyEvents.length >= 1,
        'subscriber should continue in steady stream mode after catch-up');
      t.ok(steadyEvents.some((event) => event.data?.id === 'row-2' && event.data?.value === 4),
        'steady stream should include post-catch-up update');
    } finally {
      await partition.shutdown();
    }
  });
});
