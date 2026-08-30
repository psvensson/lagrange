// Witness for the admin-query-participant-failures-surfaced quest: the
// distributed write owner emits exactly one typed warn line per failed
// fan-out, naming the operation and the partition/service ids and error codes
// of every failed participant, and stays silent when every participant
// succeeds.

import {test} from '../../src/test-helpers/tap.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {QUERY_LOG_MSG} from '../../src/query/query-constants.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const UPDATE_SQL =
  'UPDATE users SET status = \'active\' WHERE id > 0 RETURNING id';
const FAILING_PARTITION_ID = 'p2';
const HEALTHY_PARTITION_ID = 'p1';
const NO_FAILING_PARTITION = null;
const FAILING_NODE_ID = 'node-2';
const FAILING_ADDRESS = '10.0.0.2:7000';
const FAILING_ERROR_CODE = 'PARTITION_ROUTING_FAILED';
const FAILING_ERROR = 'Canonical partition leader metadata missing';
const FAILED_TABLE = 'users';
const IDEMPOTENCY_KEY = 'participant-failure-log-key';
const LOG_LEVEL_WARN = 'warn';

function createRecordingLogger() {
  const lines = [];
  const record = (level) => (message, context) => {
    lines.push({level, message, context});
  };
  return {
    lines,
    debug: record('debug'),
    info: record('info'),
    warn: record(LOG_LEVEL_WARN),
    error: record('error'),
  };
}

function createCoordinator({failPartitionId}) {
  return new DistributedWriteCoordinator({
    partitionResolver: {},
    queryExecutor: {
      async executeInsert() {
        return {success: true, affectedRows: 0, rows: []};
      },
      async executeUpdate(_ast, partitionIds, _params) {
        if (partitionIds[0] === failPartitionId) {
          return {
            success: false,
            error: FAILING_ERROR,
            errorCode: FAILING_ERROR_CODE,
            participantNodeId: FAILING_NODE_ID,
            participantAddress: FAILING_ADDRESS,
            failedTable: FAILED_TABLE,
            affectedRows: 0,
            rows: [],
          };
        }
        return {success: true, affectedRows: 1, rows: [{id: 1}]};
      },
      async executeDelete() {
        return {success: true, affectedRows: 0, rows: []};
      },
    },
    getTablePartitions() {
      return [];
    },
    getTableInfo() {
      return {primaryKey: 'id'};
    },
  });
}

async function executeUpdate(coordinator) {
  const ast = new SQLParser(UPDATE_SQL).parse();
  const plan = coordinator.createWritePlan(ast, [], {
    partitionIds: [HEALTHY_PARTITION_ID, FAILING_PARTITION_ID],
    idempotencyKey: IDEMPOTENCY_KEY,
  });
  const result = await coordinator.executePlan(plan, []);
  return {plan, result};
}

function participantFailureLines(logger) {
  return logger.lines.filter((line) =>
    line.message === QUERY_LOG_MSG.DISTRIBUTED_WRITE_PARTICIPANT_FAILURES,
  );
}

test('DistributedWriteCoordinator logs one typed warn line per failed ' +
  'fan-out naming the operation, partition/service ids and error codes',
async (t) => {
  const coordinator = createCoordinator({
    failPartitionId: FAILING_PARTITION_ID,
  });
  const logger = createRecordingLogger();
  coordinator.logger = logger;

  const {plan, result} = await executeUpdate(coordinator);
  t.equal(result.success, false, 'the fan-out failed');

  const warnLines = participantFailureLines(logger);
  t.equal(warnLines.length, 1, 'exactly one line per failed operation');
  const [line] = warnLines;
  t.equal(line.level, LOG_LEVEL_WARN, 'the line is emitted at warn');
  t.equal(line.context.operation, plan.statementType);
  t.equal(line.context.operationId, plan.operationId);
  t.equal(line.context.idempotencyKey, IDEMPOTENCY_KEY);
  t.equal(line.context.failedParticipantCount, 1);
  t.same(line.context.failedPartitions, [FAILING_PARTITION_ID]);
  t.same(line.context.participantFailures, [{
    partitionId: FAILING_PARTITION_ID,
    participantNodeId: FAILING_NODE_ID,
    participantAddress: FAILING_ADDRESS,
    errorCode: FAILING_ERROR_CODE,
    error: FAILING_ERROR,
    failedTable: FAILED_TABLE,
  }], 'the line names each failed participant with its error code');
  t.same(
    result.participantFailures.map((entry) => entry.partitionId),
    [FAILING_PARTITION_ID],
    'the logged participants are the ones the result carries',
  );
});

test('DistributedWriteCoordinator logs nothing for a fan-out where every ' +
  'participant succeeds', async (t) => {
  const coordinator = createCoordinator({
    failPartitionId: NO_FAILING_PARTITION,
  });
  const logger = createRecordingLogger();
  coordinator.logger = logger;

  const {result} = await executeUpdate(coordinator);
  t.equal(result.success, true, 'the fan-out succeeded');
  t.equal(
    participantFailureLines(logger).length,
    0,
    'a successful fan-out emits no participant-failure line',
  );
});
