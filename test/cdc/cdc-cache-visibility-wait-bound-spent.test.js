/**
 * Spent-wait witness for the post-write cache visibility wait: an absent
 * row spends the cache-wait bound (one wait_bound_spent, observed inside the
 * reporter) and then the bounded authoritative repair (one more, for its own
 * bound), and the wait still rejects with the same typed timeout error. A
 * repair that confirms visibility reports only the cache-wait bound.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
} from '../../src/control-plane/timeout-budget.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const CACHE_WAIT = 'CACHE_WAIT_TIMEOUT_MS';
const REPAIR_WAIT = 'authoritative_visibility_repair_attempts';

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

function createAbsentRowService(repairAnswer) {
  const cache = {
    has: () => false,
    get: () => null,
    onCacheChange() {},
    offCacheChange() {},
  };
  const service = new CDCIntegrationService({
    nodeId: 'witness-node',
    systemTableCache: cache,
    sqlQueryEngine: {executeQuery: async () => ({success: true, rows: []})},
  });
  service.initialize();
  service.authoritativeFallbackRetryDelayMs = 1;
  const repairs = [];
  service.repairCacheVisibilityHole = async (tableName, key) => {
    repairs.push({tableName, key});
    return repairAnswer;
  };
  const capture = captureLogger();
  service.logger = capture.logger;
  return {service, capture, repairs};
}

function waitsOf(capture) {
  return capture.spent().map((line) => line.context.wait);
}

test('an unconfirmed visibility hole reports the cache wait and the spent ' +
  'repair once each, and still rejects with the typed timeout', async (t) => {
  const {service, capture, repairs} = createAbsentRowService(
    {visible: false, visibilityState: null});

  const error = await t.rejects(service.waitForCacheUpdate(
    SYSTEM_TABLE_NAME.NODES, 'node-1', true, {timeoutMs: 40}));

  t.equal(error?.timeoutClassification?.nestedOperation,
    `cache_wait:${SYSTEM_TABLE_NAME.NODES}`,
    'the typed timeout answer is unchanged');
  t.ok([TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
    TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT].includes(
    error?.timeoutClassification?.classification));
  t.ok(repairs.length >= 1 && repairs.length <= 2,
    'the bounded repair still runs within its two attempts');
  t.same(waitsOf(capture), [CACHE_WAIT, REPAIR_WAIT],
    'one line per spent bound');
  const cacheLine = capture.spent()[0].context;
  t.same(cacheLine.lastObserved,
    {recordPresent: false, expectPresent: true,
      fallbackPhase: cacheLine.lastObserved.fallbackPhase},
    'the cache-wait observation is gathered by the reporter');
  const repairLine = capture.spent()[1].context;
  t.equal(repairLine.lastObserved.attempts, repairs.length);
  t.equal(repairLine.lastObserved.maxAttempts, 2);
  t.equal(repairLine.scope.tableName, SYSTEM_TABLE_NAME.NODES);
  t.equal(repairLine.boundMs, 40);
});

test('a repair that confirms visibility reports only the spent cache wait',
  async (t) => {
    const {service, capture, repairs} = createAbsentRowService({
      visible: true,
      authoritativeVisibilityConfirmed: true,
      visibilityState: 'visible',
    });

    const result = await service.waitForCacheUpdate(
      SYSTEM_TABLE_NAME.NODES, 'node-1', true, {timeoutMs: 40});

    t.equal(result.visible, true, 'the confirmed answer is unchanged');
    t.equal(repairs.length, 1);
    t.same(waitsOf(capture), [CACHE_WAIT]);
  });
