// PLACEMENT_ADMIT from a non-leader through the partition message route, its
// CDC row image, and the declared schema column (quest
// replica-placement-admission-owner, design section 2.5; WP-E falsifiers F1,
// F2 and F10).
//
// REAL: the replica_operations-p1 leader and a follower replica, the
// partition message dispatch (handleTransportMessage), the committed apply
// path, the CDC obligation ledger, its delivery lane and committed
// acknowledgements, and every receiver's SystemTableCache apply entry.
// DOUBLES: the consensus port (the test commits), the transport between the
// proposer and the leader (an in-process delivery that serialises the
// message), and the acknowledging CDC subscriber standing in for receivers.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementAdmission, routePlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {
  PARTITION_TABLE_OBSERVATION,
  readPartitionServiceTableSchemaIn,
} from '../../src/partition/partition-service-table-bootstrap.js';
import {renderTableDefinitionSql} from '../../src/query/sql-table-definition.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {pump} from '../test-helpers/cdc-hydration-handoff-fixture.js';
import {
  REPLICAS, applyCommitted, awaitProposal, clearFixtureSingletons, resetFixtureSingletons,
  settleTicks, shutdownAll, startReplica, temporaryDbPath, track,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  LEDGER_PARTITION_ID, NODE, admitOnLeader, ledgerRows, onLedgerLeader, placementStatement,
} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const LEDGER_EXTRA = Object.freeze({tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  schema: REPLICA_OPERATIONS_SCHEMA});
const LEADER_ADDRESS = `test-node/partition/${REPLICAS[0]}`;
const DELIVERY = Object.freeze({timeoutMs: 1000});
const resultOf = (answer) => answer[PLACEMENT_RESULT_FIELD];

// The proposer's transport: the message crosses as bytes and reaches the
// leader's transport handler; every hop is recorded.
function transportTo(leader) {
  const hops = [];
  return {hops, deliver: async (address, message) => {
    hops.push({address, type: message.type});
    const answer = await leader.handleTransportMessage(JSON.parse(JSON.stringify(message)));
    return buildDeliveryEnvelope({acknowledged: true}, answer);
  }};
}

async function routed(transport, leader, proposed, entryId, body) {
  const pending = track(routePlacementAdmission(transport, LEADER_ADDRESS,
    {entryId, body}, DELIVERY));
  const command = await awaitProposal(proposed, (entry) => entry.entryId === entryId);
  assert.ok(command, `${entryId} reached the leader's consensus`);
  assert.equal(applyCommitted(leader, command), null);
  return pending.promise;
}

test('F1: a non-leader reaches the leader\'s applier through the partition message route',
  () => onLedgerLeader(async (leader, proposed) => {
    const follower = await startReplica(REPLICAS[1], LEDGER_EXTRA, LEDGER_PARTITION_ID);
    try {
      const body = placementStatement({partitionId: 'tables-p1', target: NODE.B});
      // The follower proposes nothing itself: a typed leadership refusal.
      const local = await requestPlacementAdmission(follower, {entryId: 'f1-0', body});
      assert.equal(local.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER);
      const transport = transportTo(leader);
      const answers = [
        await routed(transport, leader, proposed, 'f1-1', body),
        await routed(transport, leader, proposed, 'f1-2',
          placementStatement({partitionId: 'indices-p1', target: NODE.B})),
        await routed(transport, leader, proposed, 'f1-3',
          placementStatement({partitionId: 'services-p1', target: NODE.B})),
        await routed(transport, leader, proposed, 'f1-4',
          placementStatement({partitionId: 'config-p1', target: NODE.B})),
        await routed(transport, leader, proposed, 'f1-5', placementStatement({
          partitionId: 'tables-p1', type: OperationType.REPLACE, target: NODE.C,
          sourceReplicaId: 'tables-p1-r1'})),
      ];
      assert.deepEqual(answers.map((answer) => [resultOf(answer).outcome,
        resultOf(answer).reason ?? null]), [
        [PLACEMENT_OUTCOME.ADMITTED, null],
        [PLACEMENT_OUTCOME.ADMITTED, null],
        [PLACEMENT_OUTCOME.ADMITTED, null],
        [PLACEMENT_OUTCOME.REFUSED, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY],
        [PLACEMENT_OUTCOME.REFUSED, PLACEMENT_REFUSAL.PARTITION_BUSY],
      ]);
      assert.ok(answers.every((answer) => answer.committed === true &&
        answer.failureCode === undefined));
      assert.deepEqual(transport.hops.map((hop) => hop.type),
        ['PLACEMENT_ADMIT', 'PLACEMENT_ADMIT', 'PLACEMENT_ADMIT', 'PLACEMENT_ADMIT',
          'PLACEMENT_ADMIT']);
      // Only typed placement commands entered consensus: no SQL statement.
      assert.ok(proposed.every((entry) => entry.type === 'PLACEMENT_ADMIT' &&
        entry.sql === undefined));
      // The route is a removal-serving request: fenced while the leader's
      // replica is being removed, never admitted past the drain.
      leader.removalServingAdmissionFenced = true;
      const fenced = await routePlacementAdmission(transport, LEADER_ADDRESS,
        {entryId: 'f1-6', body}, DELIVERY);
      leader.removalServingAdmissionFenced = false;
      assert.equal(fenced.error,
        PARTITION_SERVICE_ERROR_MSG.SERVING_ADMISSION_FENCED_FOR_REMOVAL);
      assert.equal(proposed.some((entry) => entry.entryId === 'f1-6'), false);
      // The follower applies the same committed entries to the same rows.
      for (const command of proposed) {
        assert.equal(applyCommitted(follower, command), null);
      }
      assert.deepEqual(ledgerRows(follower), ledgerRows(leader));
    } finally {
      await shutdownAll(follower);
    }
  }));

test('F2: every receiver applies the admitted row with its primary key from the ' +
  'CDC row image, through committed delivery', async () => {
  const timeSource = new VirtualTimeSource();
  const leaderCache = new SystemTableCache();
  await onLedgerLeader(async (leader, proposed) => {
    const subscriber = acknowledgingCdcSubscriber();
    await leader.subscribeToCDCWithHandshake(subscriber, {subscriberId: 'f2-receiver'});
    const admitted = await admitOnLeader(leader, proposed, 'f2-1',
      placementStatement({partitionId: 'tables-p1', target: NODE.B}));
    const [operationId] = resultOf(admitted.answer).operationIds;
    await settleTicks();
    await pump(timeSource, leader, proposed, new Set());
    const events = subscriber.events.filter((event) =>
      event.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
    assert.equal(events.length, 1);
    const [row] = ledgerRows(leader);
    const receivers = [new SystemTableCache(), new SystemTableCache()];
    for (const receiver of receivers) {
      const [event] = events;
      receiver.applySystemTableChange(event.tableName, event.operation, event.data);
    }
    for (const cache of [leaderCache, ...receivers]) {
      const cached = cache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId);
      assert.ok(cached, 'the receiver holds the admitted row by its primary key');
      for (const column of ['operation_id', 'type', 'partition_id', 'replica_id',
        'source_node_id', 'target_node_id', 'workflow_step', 'steps_history',
        'copy_source_node_id', 'entity_type', 'entity_id']) {
        assert.equal(cached[column], row[column], column);
      }
    }
  }, {timeSource, systemTableCache: leaderCache});
});

test('F10: a ledger replica of this version creates copy_source_node_id from ' +
  'REPLICA_OPERATIONS_SCHEMA, never alters an older table in place, and ' +
  'proposes no replicated ALTER', async () => {
  const declared = REPLICA_OPERATIONS_SCHEMA.columns.map((column) => column.name);
  assert.equal(declared.at(-1), 'copy_source_node_id');
  await onLedgerLeader(async (leader, proposed) => {
    const columns = leader.db.prepare('PRAGMA table_info(replica_operations)').all()
      .map((column) => column.name);
    assert.ok(columns.includes('copy_source_node_id'));
    assert.equal(
      readPartitionServiceTableSchemaIn(leader.db, REPLICA_OPERATIONS_SCHEMA).state,
      PARTITION_TABLE_OBSERVATION.COMPLETE);
    await admitOnLeader(leader, proposed, 'f10-1',
      placementStatement({partitionId: 'tables-p1', target: NODE.B}));
    assert.ok(proposed.every((entry) =>
      entry.type !== PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE));
  });
  // Under O16 + A3, a pre-release table without copy_source_node_id is not
  // altered in place at replica start.
  const {directory, dbPath} = temporaryDbPath();
  try {
    const older = {...REPLICA_OPERATIONS_SCHEMA, columns:
      REPLICA_OPERATIONS_SCHEMA.columns.filter((column) =>
        column.name !== 'copy_source_node_id')};
    const db = new Database(dbPath);
    db.exec(renderTableDefinitionSql(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, older));
    db.close();
    const replica = await startReplica(REPLICAS[1], {...LEDGER_EXTRA, dbPath},
      LEDGER_PARTITION_ID);
    try {
      const observed = readPartitionServiceTableSchemaIn(
        replica.db, REPLICA_OPERATIONS_SCHEMA);
      assert.equal(observed.state, PARTITION_TABLE_OBSERVATION.UNAVAILABLE);
      assert.deepEqual(observed.missingColumns, ['copy_source_node_id']);
    } finally {
      await shutdownAll(replica);
    }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
