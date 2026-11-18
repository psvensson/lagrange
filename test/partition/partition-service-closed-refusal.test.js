// A partition replica whose persistence the lifecycle owner released
// (closePartitionPersistenceResources: shutdown, removal teardown, a failed
// initialization) answers every serving request with ONE named, retryable
// service-closed refusal at its entry (handleCanonicalApplicationPayload):
// a closed replica is a routing fact, so the sender re-routes. That covers a
// request arriving after the release and a continuation that resumes after
// it and meets the released connection. Before, the same requests answered
// an untyped null-connection TypeError text (a query), threw (a forwarded
// write, a system-table write), or a transaction control's refusal with its
// code dropped and deferRetry false.
import {SERVICE_TYPE} from '../../src/constants/index.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from
  '../../src/partition/partition-service-constants.js';
import {PARTITION_SERVICE_CLOSED} from
  '../../src/partition/partition-service-closed-refusal.js';
import {test} from '../../src/test-helpers/tap.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {createControllablePartitionService} from
  './partition-service-test-support.js';

const PARTITION_ID = 'closed-p1';
const REPLICA_ID = 'closed-p1-r1';
const NODE_ID = 'node-a';
const TABLE = 'closed_table';

const CLOSED_ANSWER = Object.freeze({
  success: false,
  errorCode: PARTITION_SERVICE_CLOSED.CODE,
  deferRetry: true,
  partitionId: PARTITION_ID,
  replicaId: REPLICA_ID,
});

const SERVING_REQUESTS = Object.freeze({
  query: {type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY,
    sql: `SELECT * FROM ${TABLE}`, params: []},
  forwardWrite: {type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
    operation: {type: 'INSERT', table: TABLE, sql:
      `INSERT INTO ${TABLE} (id) VALUES (1)`, params: []}},
  systemTableWrite: {type: PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE,
    operation: 'INSERT', tableName: TABLE, data: {id: 1}},
  transaction: {type: PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION,
    operation: 'BEGIN', transactionId: 'closed-tx-1',
    participantId: `closed-tx-1:${PARTITION_ID}`, partitionId: PARTITION_ID},
});

// The typed fields of one entry answer, or what it threw.
async function answerOf(service, payload) {
  try {
    const answer = await service.handleApplicationMessage(payload);
    return {success: answer?.success, errorCode: answer?.errorCode ?? null,
      deferRetry: answer?.deferRetry ?? null,
      partitionId: answer?.partitionId ?? null,
      replicaId: answer?.replicaId ?? null};
  } catch (error) {
    return {threw: error.message};
  }
}

async function openService(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const service = createControllablePartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE,
    tableName: TABLE,
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    bootstrapMembership: genesisStamp([REPLICA_ID], {[REPLICA_ID]: NODE_ID}),
    nodeId: NODE_ID,
    dbPath: ':memory:',
    deferElection: true,
    schema: {columns: [{name: 'id', type: 'INTEGER', primaryKey: true}]},
    serviceType: SERVICE_TYPE.PARTITION,
  });
  t.teardown(async () => {
    await service.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  await service.initialize();
  return service;
}

test('every serving request on a released replica answers the one ' +
  'service-closed refusal', async (t) => {
  const service = await openService(t);
  await service.shutdown();
  t.equal(service.db, null, 'setup: the lifecycle owner released the connection');
  const answers = {};
  for (const [name, payload] of Object.entries(SERVING_REQUESTS)) {
    answers[name] = await answerOf(service, payload);
  }
  t.same(answers, Object.fromEntries(Object.keys(SERVING_REQUESTS)
    .map((name) => [name, CLOSED_ANSWER])));
});

test('a query whose continuation resumes after the release answers the ' +
  'service-closed refusal, not the released connection\'s TypeError',
async (t) => {
  const service = await openService(t);
  // The query's execution resumes only after the release (it awaits a turn
  // the test holds), then reads through the partition's connection.
  const resume = Promise.withResolvers();
  const execute = service.executeQuery.bind(service);
  service.executeQuery = async (...args) => {
    await resume.promise;
    return execute(...args);
  };
  const pending = answerOf(service, SERVING_REQUESTS.query);
  await service.shutdown();
  resume.resolve();
  t.same(await pending, CLOSED_ANSWER);
});
