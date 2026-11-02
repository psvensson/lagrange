/**
 * The one projection wait has no timer, so what bounds a stuck wait's cost is
 * that it is seen and released (corrective 2b of quest
 * replica-admission-from-committed-operation): each wait logs its start and
 * end with position, statement and node; diagnostics count the waits in
 * progress; the client's disconnect ends the wait typed and releases its
 * cache listener, abort listener and shutdown hold. A clock-skewed row that
 * never reaches the position still waits: the observable is the mitigation.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {CDC_LOG_MSG} from '../../src/cdc/cdc-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const ABANDONED_WAITERS = 1000;
const COMMIT_HLC = new HLCTimestamp(1793615397288, 3, 'node-1').toString();
const POSITION = Object.freeze({tableName: SYSTEM_TABLE_NAME.CONFIG,
  key: 'policy-key', originHlc: COMMIT_HLC});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function composeWaitOwner() {
  const cache = new SystemTableCache();
  const service = new CDCIntegrationService({nodeId: 'node-1',
    sqlQueryEngine: {executeQuery: async () => ({success: true})},
    systemTableCache: cache});
  service.initialize();
  const lines = [];
  const info = service.logger.info.bind(service.logger);
  service.logger.info = (message, data) => {
    lines.push({message, data});
    return info(message, data);
  };
  return {service, cache, lines};
}

test('a wait logs its start and end and is counted while it runs',
  async (t) => {
    const {service, cache, lines} = composeWaitOwner();
    const controller = new AbortController();
    const waiting = service.awaitProjectionAt(POSITION,
      {abortSignal: controller.signal, statement: 'CONFIGURE SERVICE ACCESS'});
    await Promise.resolve();
    t.equal(service.getStats().projectionWaiters, 1, 'counted in diagnostics');
    t.equal(service.getProjectionWaitDiagnostics().activeWaiters, 1);
    const started = lines.find((line) =>
      line.message === CDC_LOG_MSG.PROJECTION_WAIT_STARTED);
    t.same(started?.data, {tableName: POSITION.tableName, key: POSITION.key,
      originHlc: COMMIT_HLC, statement: 'CONFIGURE SERVICE ACCESS',
      nodeId: 'node-1'}, 'the start names position, statement and node');
    cache.applySystemTableChange(POSITION.tableName, 'INSERT',
      {config_key: POSITION.key, updated_at_hlc: COMMIT_HLC});
    await waiting;
    const ended = lines.find((line) =>
      line.message === CDC_LOG_MSG.PROJECTION_WAIT_ENDED);
    t.equal(ended?.data.outcome, 'reached', 'the end names its outcome');
    t.equal(service.getStats().projectionWaiters, 0);
    service.markShuttingDown();
  });

test('1000 abandoned waiters end typed and leave nothing behind',
  async (t) => {
    const {service, cache} = composeWaitOwner();
    const listenersBefore = cache.listeners.size;
    const holdsBefore = service.shutdownReleases.size;
    const controllers = [];
    const endings = [];
    for (let index = 0; index < ABANDONED_WAITERS; index += 1) {
      const controller = new AbortController();
      controllers.push(controller);
      endings.push(service.awaitProjectionAt(POSITION,
        {abortSignal: controller.signal}).then(() => null, (error) => error));
    }
    await Promise.resolve();
    t.equal(cache.listeners.size, listenersBefore + ABANDONED_WAITERS,
      'each wait holds one listener');
    for (const controller of controllers) controller.abort();
    const errors = await Promise.all(endings);
    t.ok(errors.every((error) => error?.code === 'client_disconnected'),
      'every wait ends typed client_disconnected');
    t.equal(cache.listeners.size, listenersBefore, 'zero listeners left');
    t.equal(service.shutdownReleases.size, holdsBefore, 'zero shutdown holds');
    t.equal(service.getStats().projectionWaiters, 0, 'zero waiters counted');
    service.markShuttingDown();
  });

test('an already disconnected client does not start a wait', async (t) => {
  const {service, cache} = composeWaitOwner();
  const controller = new AbortController();
  controller.abort();
  const error = await service.awaitProjectionAt(POSITION,
    {abortSignal: controller.signal}).then(() => null, (failure) => failure);
  t.equal(error?.code, 'client_disconnected');
  t.equal(cache.listeners.size, 0);
  service.markShuttingDown();
});
