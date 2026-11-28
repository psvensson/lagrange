import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LAGRANGE_OLTP_SCHEMA_DDL} from '../distributed/reference-client/lagrange-oltp-adapter.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {buildSchemaDefinition, derivePartitionKey} from '../../src/query/table-creation-service-schema-derivation.js';
import {PARTITION_BOUNDARY_KEY_TYPE, resolveDeclaredPartitionKeyType}
  from '../../src/partition/partition-boundary-representation.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/distributed-write-coordinator.js';
import {resolveFailureSqlState} from '../../src/runtime/pgwire-result-mapper.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {GENERATION_ORIGIN_INDEX, originOf, resetFixtureSingletons, clearFixtureSingletons, send, startLeader, shutdownAll}
  from '../test-helpers/participant-transaction-fixture.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';

const read = 'SELECT next_order_id FROM district WHERE warehouse_id = ? AND district_id = ?';
const advance = 'UPDATE district SET next_order_id = ? WHERE warehouse_id = ? AND district_id = ?';
const insert = 'INSERT INTO orders (warehouse_id, district_id, order_id, customer_id, carrier_id, ' +
  'line_count, all_local) VALUES (?, ?, ?, ?, NULL, ?, ?)';

async function allocationFixture(t) {
  resetFixtureSingletons();
  const replicas = new Map();
  const tables = [];
  const partitions = [];
  const services = [];
  const descriptors = [];
  const deliveries = [];
  const gateway = createTransactionPersistenceGateway();
  const late = {engine: null};
  t.after(async () => {
    try {
      await late.engine?.shutdown();
    } finally {
      gateway.db.close();
      try {
        await shutdownAll(...replicas.values());
      } finally {
        clearFixtureSingletons();
      }
    }
  });
  for (const name of ['district', 'orders']) {
    const ddl = LAGRANGE_OLTP_SCHEMA_DDL.find((statement) => statement.startsWith('CREATE TABLE ' + name + ' ('));
    const ast = new SQLParser(ddl).parse();
    const schema = buildSchemaDefinition(ast.columns, ast);
    const table = {table_id: name, table_name: name, active_partition_version: 1,
      partition_key: derivePartitionKey(ast.primaryKey),
      schema_definition: JSON.stringify(schema)};
    const keyType = resolveDeclaredPartitionKeyType(table);
    assert.equal(keyType, PARTITION_BOUNDARY_KEY_TYPE.COMPOSITE);
    const id = name + '-p1';
    const replicaId = id + '-r1';
    const nodeId = 'test-node';
    const address = nodeId + '/partition/' + replicaId;
    descriptors.push({name, schema, id, replicaId, nodeId, address});
    tables.push({...table, partition_key_type: keyType});
    partitions.push({table_name: name, table_id: name, partition_id: id,
      partition_version: table.active_partition_version, leader_node_id: nodeId,
      partition_key_type: keyType, partition_key_start: null, partition_key_end: null});
    services.push({service_id: replicaId, service_type: 'partition', partition_id: id,
      node_id: nodeId, raft_role: 'leader', address, status: 'active'});
  }
  const catalog = createMockSystemCache(tables, partitions, services);
  for (const {name, schema, id, replicaId, nodeId, address} of descriptors) {
    const {leader} = await startLeader({tableName: name, schema, replicaId, nodeId,
      replicaIds: [replicaId], systemTableCache: catalog}, id);
    replicas.set(address, leader);
    assert.equal(leader.resolveLocalActivePartitionVersion(), catalog.get('partitions', id).partition_version);
    assert.equal(originOf(leader), GENERATION_ORIGIN_INDEX);
    assert.equal(leader.leaderId, replicaId);
    leader.concurrencyGranularity = 'row-key';
    leader.controllablePort.setProposeHandler(async (entry) => {
      leader.controllablePort.commit(entry);
    });
  }
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    controlPlaneSystemTableGateway: gateway, autoStartDistributedTransactionRecovery: false,
    systemCache: catalog,
    messageRouter: {async deliver(address, message) {
      const replica = replicas.get(address);
      assert.ok(replica, address);
      const answer = await send(replica, message);
      deliveries.push({address, message, answer});
      return buildDeliveryEnvelope({acknowledged: true}, answer);
    }}});
  late.engine = engine;
  const [district, orders] = replicas.values();
  const seeded = await district.executeQuery('INSERT INTO district ' +
    '(warehouse_id, district_id, ytd_cents, next_order_id) VALUES (?, ?, ?, ?)', [1, 2, 0, 14],
  {entryId: 'seed-district'});
  assert.equal(seeded.success, true, JSON.stringify(seeded));
  const query = (sessionId, sql, params = []) => engine.executeQuery(sql, params, {sessionId});
  async function success(session, sql, params) {
    const result = await query(session, sql, params);
    assert.equal(result.success, true, JSON.stringify(result));
    return result;
  }
  return {query, success, deliveries, district, orders};
}

test('a concurrent committed allocation invalidates the plain district read before a dependent orders insert',
  async (t) => {
    const {success, query, deliveries, district, orders} = await allocationFixture(t);
    const loser = await success('loser', 'BEGIN');
    await success('winner', 'BEGIN');
    for (const session of ['loser', 'winner']) {
      assert.deepEqual((await success(session, read, [1, 2])).rows, [{next_order_id: 14}]);
    }
    const readDelivery = deliveries.find(({message}) => message.type === 'QUERY' &&
      message.transactionId === loser.transactionId && message.sql.includes('next_order_id'));
    assert.equal(readDelivery?.message.participantId, loser.transactionId + ':district-p1');
    await success('winner', advance, [15, 1, 2]);
    await success('winner', insert, [1, 2, 14, 7, 10, 1]);
    await success('winner', 'COMMIT');
    assert.equal(district.db.prepare('SELECT next_order_id FROM district').get().next_order_id, 15);
    assert.equal(orders.db.prepare('SELECT order_id FROM orders').get().order_id, 14);

    const update = await query('loser', advance, [15, 1, 2]);
    // If staging missed the stale read, preserve the first downstream refusal
    // in the failing assertion, as the physical client did.
    const downstream = update.success ? await query('loser', insert, [1, 2, 14, 7, 10, 1]) : null;
    await success('loser', 'ROLLBACK');
    assert.equal(update.success, false, JSON.stringify({update, downstream}));
    const writes = deliveries.filter(({message}) => message.type === 'QUERY' &&
      message.transactionId === loser.transactionId && /^UPDATE\b/i.test(message.sql));
    assert.equal(writes.length, 1, JSON.stringify(writes));
    const [{address, message, answer}] = writes;
    assert.equal(address, district.nodeId + '/partition/' + district.replicaId);
    assert.equal(message.participantId, readDelivery.message.participantId);
    assert.ok(message.idempotencyKey);
    assert.equal(message.entryId,
      deriveParticipantEntryId(message.idempotencyKey, district.partitionId));
    assert.equal(answer.success, false);
    assert.equal(answer.failureCode, 'participant_transaction_stale_read', JSON.stringify(answer));
    assert.equal(update.firstFailedParticipant?.failureCode, answer.failureCode);
    assert.equal(resolveFailureSqlState(update), '40001', JSON.stringify(update));
    assert.equal(deliveries.some(({message, address}) => message.type === 'QUERY' &&
      message.transactionId === loser.transactionId && address.endsWith('/orders-p1-r1')), false);
  });

test('duplicate order with a current district read retains the deterministic statement failure', async (t) => {
  const {success, query, orders} = await allocationFixture(t);
  const seeded = await orders.executeQuery(insert, [1, 2, 14, 26, 10, 1], {entryId: 'seed-duplicate'});
  assert.equal(seeded.success, true, JSON.stringify(seeded));
  await success('current', 'BEGIN');
  assert.deepEqual((await success('current', read, [1, 2])).rows, [{next_order_id: 14}]);
  await success('current', advance, [15, 1, 2]);
  const duplicate = await query('current', insert, [1, 2, 14, 7, 10, 1]);
  assert.equal(duplicate.success, false);
  assert.equal(duplicate.firstFailedParticipant?.failureCode, 'participant_transaction_statement_failed',
    JSON.stringify(duplicate));
  assert.notEqual(resolveFailureSqlState(duplicate), '40001');
  await success('current', 'ROLLBACK');
});

for (const disjointCommit of [false, true]) {
  test(`current allocation commits after ${disjointCommit ? 'a disjoint district commit' : 'an unchanged generation'}`,
    async (t) => {
      const {success, district, orders} = await allocationFixture(t);
      if (disjointCommit) {
        const seeded = await district.executeQuery('INSERT INTO district ' +
          '(warehouse_id, district_id, ytd_cents, next_order_id) VALUES (?, ?, ?, ?)',
        [1, 1, 0, 70], {entryId: 'seed-other-district'});
        assert.equal(seeded.success, true, JSON.stringify(seeded));
      }
      await success('reader', 'BEGIN');
      assert.deepEqual((await success('reader', read, [1, 2])).rows, [{next_order_id: 14}]);
      if (disjointCommit) {
        await success('other', 'BEGIN');
        await success('other', advance, [71, 1, 1]);
        await success('other', 'COMMIT');
        assert.equal(district.db.prepare('SELECT next_order_id FROM district WHERE district_id = 1').get().next_order_id, 71);
      }
      await success('reader', advance, [15, 1, 2]);
      await success('reader', insert, [1, 2, 14, 7, 10, 1]);
      await success('reader', 'COMMIT');
      assert.equal(district.db.prepare('SELECT next_order_id FROM district WHERE district_id = 2').get().next_order_id, 15);
      assert.equal(orders.db.prepare('SELECT order_id FROM orders').get().order_id, 14);
    });
}
