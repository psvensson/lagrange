/**
 * Heartbeat liveness when the projection does not move (quest
 * replica-admission-from-committed-operation, attempt 2; lead decision
 * 2026-11-02, census site 1). The heartbeat's NODES write answers at its
 * commit through the real CDC write path; with this node's projection
 * paused (no CDC event applied) the heartbeat still answers and the loop's
 * next beat proceeds. The heartbeat's merge read of its own row from the
 * projection stays a named census row (owner Group A).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {TABLES} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HeartbeatService} from './heartbeat-memory-trend-test-helpers.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'node-heartbeat-liveness';
const PROMPT_MS = 300;
const PENDING = Symbol('pending');
const COMMIT_HLC = new HLCTimestamp(1793615397288, 3, 'node-1').toString();

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

async function within(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(PENDING), ms);
  });
  try {
    return await Promise.race([
      promise.then((value) => ({value}), (error) => ({error})),
      timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function composePausedProjection() {
  const engine = {
    writes: [],
    async executeQuery(sql, params) {
      engine.writes.push({sql, params});
      return {success: true, affectedRows: 1, originHlc: COMMIT_HLC,
        partitionResult: {affectedRows: 1}};
    },
  };
  // The projection holds the node's row as it was; no CDC event is ever
  // applied, so it never reflects the heartbeat's own writes.
  const cache = new SystemTableCache();
  const projectedRow = {
    node_id: NODE_ID,
    node_address: '10.0.0.12:8080',
    status: 'active',
    created_at: 50000,
    storage_budget_bytes: 1024,
    storage_budget_source: 'absolute',
  };
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', projectedRow);
  const clock = {nowMs: 60000};
  const cdc = new CDCIntegrationService({
    nodeId: NODE_ID,
    sqlQueryEngine: engine,
    systemTableCache: cache,
  });
  cdc.initialize();
  const heartbeat = new HeartbeatService({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    nodeAddress: projectedRow.node_address,
    cdcIntegrationService: cdc,
    systemTableCache: cache,
    now: () => clock.nowMs,
  });
  return {cdc, cache, clock, engine, heartbeat, projectedRow};
}

test('heartbeat liveness: with the projection paused the NODES write ' +
  'answers at its commit and the next beat proceeds', async (t) => {
  const {cdc, cache, clock, engine, heartbeat, projectedRow} =
    composePausedProjection();

  for (const beat of [1, 2]) {
    clock.nowMs += 60000;
    const outcome = await within(heartbeat.sendHeartbeat(null, null),
      PROMPT_MS);
    t.not(outcome, PENDING,
      `beat ${beat} answers within ${PROMPT_MS} ms with the projection paused`);
    t.notOk(outcome?.error,
      `beat ${beat} does not fail (${outcome?.error?.message ?? 'no error'})`);
  }
  const nodeWrites = engine.writes.filter(({sql}) =>
    /^UPDATE nodes /iu.test(sql));
  t.equal(nodeWrites.length, 2, 'each beat committed one NODES write');
  t.same(cache.get(TABLES.NODES, NODE_ID)?.created_at,
    projectedRow.created_at, 'the projection never moved');
  cdc.markShuttingDown();
});
