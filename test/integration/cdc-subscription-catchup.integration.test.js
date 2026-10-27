/**
 * CDC subscription handshake + catch-up integration tests.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  ConfigurationManager,
} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {
  PARTITION_SERVICE_CDC,
} from '../../src/partition/partition-service-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {CDC_TABLE} from '../test-helpers/participant-transaction-fixture.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {resumeFixtureParticipantAdmission} from
  '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber, settlePendingCdcDeliveries} from
  '../test-helpers/acknowledging-cdc-subscriber.js';

const TEST_TABLE_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'value', type: 'INTEGER'},
  ],
});

const TEST_IDS = Object.freeze({
  PARTITION_ID: 'cdc-handshake-p1',
  // A CDC-carrying table: only a propagated table records CDC (decision D2).
  TABLE_ID: CDC_TABLE,
  REPLICA_ID: 'cdc-handshake-p1-r1',
  NODE_ID: 'cdc-handshake-node-1',
});

const HANDSHAKE_STATUS_OK =
  PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK;

const SUBSCRIBER_A_ID = 'integration-subscriber-a';
const SUBSCRIBER_B_ID = 'integration-subscriber-b';
const LATE_SUBSCRIBER_ID = 'integration-late-subscriber-1';
const MIN_EXPECTED_EVENTS = 3;
const ROW_VALUE_ONE = 1;
const ROW_VALUE_TWO = 2;
const ROW_VALUE_THREE = 3;
const ROW_VALUE_FOUR = 4;

function createPartition() {
  return new PartitionService(withFoundingStamp({
    partitionId: TEST_IDS.PARTITION_ID,
    tableId: TEST_IDS.TABLE_ID,
    tableName: TEST_IDS.TABLE_ID,
    replicaId: TEST_IDS.REPLICA_ID,
    replicaIds: [TEST_IDS.REPLICA_ID],
    nodeId: TEST_IDS.NODE_ID,
    schema: TEST_TABLE_SCHEMA,
    systemTableCache: new SystemTableCache(),
    dbPath: ':memory:',
  }));
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

test('CDC subscription handshake + catch-up integration',
  async (t) => {
    t.beforeEach(() => {
      initializeTestEnvironment();
    });

    t.afterEach(() => {
      cleanupTestEnvironment();
    });

    await t.test(
      'late subscriber receives deterministic catch-up ' +
      'and steady-state transition',
      async (t) => {
        const partition = createPartition();

        try {
          await partition.initialize();
          await resumeFixtureParticipantAdmission(partition);

          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'row-1', value: ROW_VALUE_ONE},
          );
          await partition.updateData(
            TEST_IDS.TABLE_ID,
            {id: 'row-1'},
            {value: ROW_VALUE_TWO},
          );
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'row-2', value: ROW_VALUE_THREE},
          );

          // The writes above are owed obligations in the durable ledger;
          // the late subscriber catches up from that ledger, accepting each
          // event with the owner's committed receipt.
          const subscriber = acknowledgingCdcSubscriber();
          const delivered = subscriber.events;

          const handshake =
            await partition.subscribeToCDCWithHandshake(
              subscriber,
              {subscriberId: LATE_SUBSCRIBER_ID},
            );
          await settlePendingCdcDeliveries(partition);

          t.equal(
            handshake.status, HANDSHAKE_STATUS_OK,
            'handshake should acknowledge subscription',
          );
          // Deleted: catchup.mode === backfill and bufferedEventsReplayed >= 3 asserted the retired volatile buffer, which writes no longer feed.
          t.equal(
            delivered.length, MIN_EXPECTED_EVENTS,
            'late subscriber observes every write made before it subscribed',
          );
          t.same(
            delivered.map((e) => [e.operation, e.data?.id]),
            [[CDC_OPERATION.INSERT, 'row-1'], [CDC_OPERATION.UPDATE, 'row-1'],
              [CDC_OPERATION.INSERT, 'row-2']],
            'catch-up delivers the pre-subscription writes',
          );

          const catchupSeq = delivered.map(
            (e) => e.sourceLogIndex,
          );
          const sortedSeq =
            [...catchupSeq].sort((a, b) => a - b);
          t.same(
            catchupSeq, sortedSeq,
            'catch-up events in deterministic order',
          );

          await partition.updateData(
            TEST_IDS.TABLE_ID,
            {id: 'row-2'},
            {value: ROW_VALUE_FOUR},
          );
          await settlePendingCdcDeliveries(partition);

          t.ok(
            delivered.some(
              (e) => e.data?.id === 'row-2' &&
                e.data?.value === ROW_VALUE_FOUR,
            ),
            'steady stream includes post-catch-up update',
          );
        } finally {
          await partition.shutdown();
        }
      },
    );
  },
);

const LEDGER_DRAIN_BUDGET_MS = 20000;
const LEDGER_DRAIN_POLL_MS = 25;

// Bounded poll of the durable ledger: true once nothing is owed.
async function ledgerDrained(t, partition) {
  for (let waited = 0; waited <= LEDGER_DRAIN_BUDGET_MS; waited += LEDGER_DRAIN_POLL_MS) {
    await settlePendingCdcDeliveries(partition);
    if (countCdcObligations(partition.db).owed === 0) return true;
    await managedSleep(t, LEDGER_DRAIN_POLL_MS);
  }
  return false;
}

/**
 * The hydration -> live CDC hand-off on the real write path (CDC decision
 * D4, 2026-10-26). The sliding-window subtests that stood here were deleted
 * with the window; the partition-level witness is W-D4a
 * (test/partition/cdc-hydration-live-handoff.test.js).
 */
test('CDC subscribe-before-hydrate handoff integration',
  async (t) => {
    t.beforeEach(() => {
      initializeTestEnvironment();
    });

    t.afterEach(() => {
      cleanupTestEnvironment();
    });

    await t.test(
      'a subscriber registered before readHydrationImage receives every ' +
      'write after the image position P and none replayed outside the lane',
      async (t) => {
        const partition = createPartition();

        try {
          await partition.initialize();
          await resumeFixtureParticipantAdmission(partition);

          const subscriberA = acknowledgingCdcSubscriber();
          await partition.subscribeToCDCWithHandshake(
            subscriberA,
            {subscriberId: SUBSCRIBER_A_ID},
          );
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'hand-row-1', value: ROW_VALUE_ONE},
          );
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'hand-row-2', value: ROW_VALUE_TWO},
          );
          await settlePendingCdcDeliveries(partition);

          const subscriberB = acknowledgingCdcSubscriber();
          const handshakeB =
            await partition.subscribeToCDCWithHandshake(
              subscriberB,
              {subscriberId: SUBSCRIBER_B_ID},
            );
          const image = partition.readHydrationImage(
            `SELECT * FROM ${TEST_IDS.TABLE_ID}`);
          const position = Number(image.appliedIndex);

          await partition.updateData(
            TEST_IDS.TABLE_ID,
            {id: 'hand-row-1'},
            {value: ROW_VALUE_THREE},
          );
          await partition.deleteData(
            TEST_IDS.TABLE_ID,
            {id: 'hand-row-2'},
          );
          // The lane's retry runs on the partition's real clock and
          // settlePendingCdcDeliveries does not wait for an armed timer: wait
          // on the ledger itself, bounded, until every event is delivered.
          const drained = await ledgerDrained(t, partition);

          t.equal(drained, true, 'the ledger delivers every event (owed 0)');
          t.equal(
            handshakeB.status, HANDSHAKE_STATUS_OK,
            'subscriber B handshake acknowledged',
          );
          t.notOk(
            Object.hasOwn(handshakeB, 'catchup'),
            'the handshake carries no catch-up of its own',
          );
          t.same(
            image.rows.map((row) => row.id).sort(),
            ['hand-row-1', 'hand-row-2'],
            'the image holds the rows at P',
          );
          // Writes at or below P that were still owed when B registered
          // (A's acknowledgement not yet committed) reach B too; the cache's
          // row-version merge absorbs them. Above P, B gets every write.
          t.same(
            subscriberB.events.filter((event) => event.sourceLogIndex > position)
              .map((event) => [event.operation, event.data?.id ?? event.oldData?.id]),
            [[CDC_OPERATION.UPDATE, 'hand-row-1'],
              [CDC_OPERATION.DELETE, 'hand-row-2']],
            'B receives every write after P, in log order',
          );
          t.equal(
            subscriberB.events.filter((event) => event.replayOnly === true).length,
            0,
            'nothing reached B outside the obligation lane',
          );
        } finally {
          await partition.shutdown();
        }
      },
    );
  },
);
