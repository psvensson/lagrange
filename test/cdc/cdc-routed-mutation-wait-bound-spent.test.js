/**
 * Spent-wait witness for the routed system-table write
 * (executeSQLViaQueryEngine): a spent per-call retry budget and an
 * exhausted attempt count each log exactly one wait_bound_spent ERROR, the
 * write still rejects exactly as before, and a write that succeeds or fails
 * terminally logs none.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const RECONNECTING_ANSWER = Object.freeze({
  success: false,
  error: 'query transport reconnecting',
  errorCode: 'ROUTER_CONNECTION_CLOSED',
  deferRetry: true,
});

beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createRoutedWriteService({retryMaxAttempts, answer}) {
  const executed = [];
  const service = new CDCIntegrationService({
    nodeId: 'witness-node',
    sqlQueryEngine: {
      async executeQuery(sql, params, options) {
        executed.push({options});
        return answer;
      },
    },
  });
  service.initialize();
  // The constructor reads both from configuration only.
  service.retryMaxAttempts = retryMaxAttempts;
  service.retryDelayMs = 1;
  const capture = captureLogger();
  service.logger = capture.logger;
  return {service, capture, executed};
}

function updateNode(service, options) {
  return service.updateSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    {node_id: 'node-1'},
    {status: 'active'},
    {skipCacheWait: true, ...options},
  );
}

test('a spent routed-write retry budget logs one wait_bound_spent ERROR ' +
  'and still rejects with the defer-retry answer', async (t) => {
  const {service, capture, executed} = createRoutedWriteService({
    retryMaxAttempts: 5,
    answer: {...RECONNECTING_ANSWER, retryAfterMs: 250},
  });

  const error = await t.rejects(updateNode(service, {queryTimeoutMs: 200}));

  t.equal(executed.length, 1, 'no attempt beyond the budget');
  t.equal(error?.deferRetry, true);
  t.equal(error?.retryAfterMs, 250);
  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent for one expiry');
  t.equal(spent[0].context.wait, 'cdc_routed_mutation_retry_budget');
  t.equal(spent[0].context.boundMs, 200);
  t.equal(spent[0].context.lastObserved.attempt, 1);
  t.equal(spent[0].context.lastObserved.requestedDelayMs, 250);
  t.equal(spent[0].context.scope.tableName, SYSTEM_TABLE_NAME.NODES);
});

test('exhausted routed-write attempts log one wait_bound_spent ERROR and ' +
  'still reject with the annotated error', async (t) => {
  const {service, capture, executed} = createRoutedWriteService({
    retryMaxAttempts: 2,
    answer: {...RECONNECTING_ANSWER, retryAfterMs: 1},
  });

  const error = await t.rejects(updateNode(service, {}));

  t.equal(executed.length, 2, 'every attempt is still taken');
  t.equal(error?.attempt, 2, 'the error is annotated with the last attempt');
  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent');
  t.equal(spent[0].context.wait, 'CDC_DEFAULTS.RETRY_MAX_ATTEMPTS');
  t.equal(spent[0].context.lastObserved.attempts, 2);
  t.equal(spent[0].context.lastObserved.errorCode, 'ROUTER_CONNECTION_CLOSED');
});

test('a routed write that succeeds or fails terminally logs no ' +
  'wait_bound_spent ERROR', async (t) => {
  const ok = createRoutedWriteService({
    retryMaxAttempts: 3,
    answer: {success: true, rows: [], rowCount: 1},
  });
  await updateNode(ok.service, {queryTimeoutMs: 500});
  t.equal(ok.capture.spent().length, 0, 'success: none');

  const terminal = createRoutedWriteService({
    retryMaxAttempts: 3,
    answer: {success: false, error: 'syntax error near SET'},
  });
  await t.rejects(updateNode(terminal.service, {queryTimeoutMs: 500}));
  t.equal(terminal.executed.length, 1, 'a terminal failure is not retried');
  t.equal(terminal.capture.spent().length, 0, 'terminal failure: none');
});
