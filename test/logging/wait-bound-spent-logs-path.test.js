/**
 * A spent wait on the logs-table write path never writes back into the logs
 * table: with the logs partition down, every failed log write may report a
 * spent wait, and each report must leave the number of queued log writes
 * unchanged (console sink only), or the reports would feed the table that
 * just failed.
 */

import {test} from '../../src/test-helpers/tap.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {
  WAIT_BOUND_SPENT_EVENT,
  WAIT_BOUND_SPENT_OUTCOME,
  WaitBoundSpentReporter,
} from '../../src/logging/wait-bound-spent.js';

const FAILED_LOG_WRITES = 25;

async function persistingLogger(t) {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node', level: 'error'});
  const queued = [];
  await logger.onLogsTableReady((entry) => {
    queued.push(entry);
  });
  queued.length = 0;
  t.teardown(() => LoggingService.resetInstance());
  return {logger, queued};
}

function spent(scope, index) {
  return {
    wait: 'partition_execution_deadline',
    awaited: 'successful partition delivery before the execution deadline',
    boundMs: 1000,
    elapsedMs: 1000 + index,
    lastObserved: {attempt: index},
    scope,
  };
}

test('logs partition down: spent-wait reports of the logs path queue no ' +
  'log writes', async (t) => {
  const {logger, queued} = await persistingLogger(t);
  const reporter = new WaitBoundSpentReporter({now: () => 0});
  const logsScopes = [
    {partitionId: 'logs-p1', nodeId: 'n1'},
    {partitionId: 'logs-p7', nodeId: 'n1'},
    {tableName: 'logs', ownerName: 'logs-owner'},
  ];
  for (let index = 0; index < FAILED_LOG_WRITES; index += 1) {
    const scope = logsScopes[index % logsScopes.length];
    t.equal(reporter.report(logger, spent(scope, index)),
      WAIT_BOUND_SPENT_OUTCOME.LOGGED, 'still reported (console sink)');
  }
  t.equal(queued.length, 0, 'queued log writes did not grow');

  reporter.report(logger, spent({partitionId: 'nodes-p1'}, 0));
  t.equal(queued.length, 1,
    'a spent wait off the logs path still persists (the table path works)');
});

test('the logs sink\'s own spent retry budget is reported console-only and ' +
  'queues no log write', async (t) => {
  const {logger, queued} = await persistingLogger(t);
  const consoleOnly = [];
  logger.logConsoleOnly = (level, message, context) => {
    consoleOnly.push({level, message, context});
  };
  LogsTableService.resetInstance();
  let attempts = 0;
  const service = new LogsTableService({
    logsOwner: {
      async upsertLog() {
        attempts += 1;
        throw new Error('logs partition has no leader');
      },
    },
    maxRetries: 2,
    retryDelayMs: 1,
  });
  service.initialize();
  t.teardown(() => LogsTableService.resetInstance());
  await t.rejects(service.writeEntryWithRetry({
    logId: 'log-1', timestamp: 1, level: 'INFO', nodeId: 'n1',
    message: 'm', createdAt: 1,
  }), /no leader/, 'the exhausted write still throws as before');
  t.equal(attempts, 2, 'the retry count is unchanged');
  const spentLines = consoleOnly.filter(
    (line) => line.context?.event === WAIT_BOUND_SPENT_EVENT);
  t.equal(spentLines.length, 1, 'one console-only spent-wait ERROR');
  t.equal(spentLines[0].level, 'error');
  t.equal(spentLines[0].context.wait, 'LOGS_TABLE_DEFAULT.MAX_RETRIES');
  t.equal(spentLines[0].context.lastObserved.attempts, 2);
  t.equal(queued.length, 0, 'no log write queued by the report');
});
