// The CDC owner arms every timer, and reads every budget, on one injected
// time source.
//
// The cold-formation harness model hosts the real CDC owner between real
// caches on a virtual clock, so its propagation delay is computed rather
// than waited for. That is only possible if the owner never reaches the
// ambient clock: the cache-visibility wait and the budget that bounds it,
// the routed-mutation retry delays and the budget that bounds them, and the
// catch-up sleep all read `this.timeSource`, resolved the way every other
// seamed owner resolves it (src/time/time-source.js). A timer on one clock
// under a budget on another let the attempt count depend on which clock
// moved (verifier probe, 2026-09-12: 6, 4 or 1 attempts for the same call).
//
// Red on revert, for the right reason: with an ambient setTimeout the
// virtual clock sees no timer, so advancing it settles nothing and the
// assertions on what the virtual clock drives fail.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RealTimeSource, VirtualTimeSource} from '../../src/time/time-source.js';

import {METRICS_LOG_TAG} from '../../src/constants/index.js';
import {HLCClockService} from '../../src/hlc/hlc-clock-service.js';
const NODE_ID = 'seam-node';
const ABSENT_KEY = 'node-that-never-arrives';
const WAIT_BUDGET_MS = 1000;
const QUERY_BUDGET_MS = 200;
const RETRY_AFTER_MS = 50;
const PUMP_LIMIT = 50;
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

function serviceOnVirtualClock(options = {}) {
  const timeSource = new VirtualTimeSource();
  const service = new CDCIntegrationService({
    nodeId: NODE_ID, systemTableCache: new SystemTableCache(), timeSource, ...options,
  });
  service.bootstrapMode = false;
  service.logger = QUIET_LOGGER;
  return {service, timeSource};
}

// Drive a promise to settlement by advancing ONLY the virtual clock: each
// pump lets microtasks run, then fires whatever the owner armed on the
// virtual clock. Nothing here waits on the wall clock.
async function pumpOnVirtualClock(timeSource, pending, stepMs) {
  let pumps = 0;
  for (; pumps < PUMP_LIMIT; pumps += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    const outcome = await Promise.race([pending, Promise.resolve(null)]);
    if (outcome !== null) return {outcome, pumps};
    if (timeSource.pendingTimerCount() > 0) timeSource.advance(stepMs);
  }
  return {outcome: null, pumps};
}

test('the cache-visibility wait arms its timeout on the injected clock', async () => {
  const {service, timeSource} = serviceOnVirtualClock();
  assert.equal(timeSource.pendingTimerCount(), 0);
  let settled = false;
  const wait = service.waitForCacheUpdate(
    SYSTEM_TABLE_NAME.NODES, ABSENT_KEY, true, {timeoutMs: WAIT_BUDGET_MS})
    .catch((error) => error)
    .then((outcome) => {
      settled = true;
      return outcome;
    });
  await Promise.resolve();
  assert.equal(timeSource.pendingTimerCount(), 1,
    'the wait must be armed on the injected clock, not the ambient one');
  assert.equal(settled, false, 'nothing has happened on the virtual clock yet');
  // The owner splits the budget: the cache-wait timer fires at the
  // cache-wait share (750 of 1000) and the repair leg uses the rest.
  // Advancing the whole budget fires it; the row never arrives, so the
  // owner's own timeout contract is the outcome - reached because the
  // virtual clock ran, not because a wall-clock second passed.
  timeSource.advance(WAIT_BUDGET_MS);
  const outcome = await wait;
  assert.equal(settled, true, 'advancing the virtual clock is what settles the wait');
  assert.match(String(outcome && outcome.message), /within 1000ms/u);
});

test('the authoritative-fallback retry delay and the timeout classification are on the injected clock', async () => {
  // A repair leg that neither confirms nor defers drives the wait's own
  // retry: a delay armed on the owner's clock, then a second attempt, then
  // the timeout error - whose remaining-budget classification must be read
  // on the same clock the deadline was stamped on. (The pump advances in
  // 50ms steps, so the 25ms delay lands one step later; the assertion
  // compares against the clock, not a hand-counted instant.)
  const {service, timeSource} = serviceOnVirtualClock();
  service.repairCacheVisibilityHole = async () => ({
    authoritativeVisibilityConfirmed: false, visibilityState: null,
  });
  const armedMs = [];
  const original = timeSource.setTimeout.bind(timeSource);
  timeSource.setTimeout = (fn, ms, ...args) => {
    armedMs.push(ms);
    return original(fn, ms, ...args);
  };
  const wait = service.waitForCacheUpdate(
    SYSTEM_TABLE_NAME.NODES, ABSENT_KEY, true, {timeoutMs: WAIT_BUDGET_MS})
    .then((result) => ({result}), (error) => ({error}));
  const {outcome} = await pumpOnVirtualClock(timeSource, wait, RETRY_AFTER_MS);
  assert.ok(outcome && outcome.error, 'the wait must settle by virtual time alone');
  assert.ok(armedMs.includes(service.authoritativeFallbackRetryDelayMs),
    `the fallback retry delay (${service.authoritativeFallbackRetryDelayMs}ms) is armed on the injected clock`);
  const remaining = outcome.error.timeoutClassification.remainingBudgetMs;
  assert.equal(remaining, WAIT_BUDGET_MS - timeSource.now(),
    'the error classifies the remaining budget on the virtual clock, not the wall');
  assert.ok(remaining > 0 && remaining < WAIT_BUDGET_MS,
    'the timer fired inside the budget: neither exhausted nor untouched');
});

test('the routed-mutation retry loop delays and budgets on the injected clock', async () => {
  const attempts = [];
  const {service, timeSource} = serviceOnVirtualClock({
    sqlQueryEngine: {
      async executeQuery(_sql, _params, options) {
        attempts.push({virtualMs: timeSource.now(), timeoutMs: options.timeoutMs});
        return {
          success: false, error: 'query transport reconnecting',
          errorCode: 'ROUTER_CONNECTION_CLOSED', deferRetry: true,
          retryAfterMs: RETRY_AFTER_MS,
        };
      },
    },
  });
  service.initialize();
  const mutation = service.updateSystemTableRow(
    SYSTEM_TABLE_NAME.NODES, {node_id: 'n1'}, {status: 'active'},
    {queryTimeoutMs: QUERY_BUDGET_MS, skipCacheWait: true})
    .then((result) => ({result}), (error) => ({error}));
  const {outcome} = await pumpOnVirtualClock(timeSource, mutation, RETRY_AFTER_MS);
  assert.ok(outcome, 'the loop must settle by virtual time alone');
  assert.ok(outcome.error, 'a budget that ran out is the typed exhaustion outcome');
  // Every attempt after the first waited on a delay armed on the virtual
  // clock, and each attempt's own timeout is what remained of the budget
  // ON THAT CLOCK: 200, 150, 100, 50. A budget read from the wall clock
  // would have handed every attempt the full 200.
  assert.deepEqual(attempts.map((attempt) => attempt.timeoutMs),
    [QUERY_BUDGET_MS, QUERY_BUDGET_MS - RETRY_AFTER_MS,
      QUERY_BUDGET_MS - (2 * RETRY_AFTER_MS), QUERY_BUDGET_MS - (3 * RETRY_AFTER_MS)]);
  assert.deepEqual(attempts.map((attempt) => attempt.virtualMs),
    [0, RETRY_AFTER_MS, 2 * RETRY_AFTER_MS, 3 * RETRY_AFTER_MS],
    'attempts are spaced by the retry delay in virtual time');
});

test('the catch-up default sleep is armed on the injected clock', async () => {
  // The real service, reading an authority that defers under pressure three
  // times: with no `sleep` injected, the catch-up's DEFAULT sleep between
  // attempts must arm on the owner's clock, where the virtual pump can see
  // it, and never on the ambient one.
  const {service, timeSource} = serviceOnVirtualClock();
  let reads = 0;
  service.executeAuthoritativeSystemTableRead = async () => {
    reads += 1;
    return {success: false, error: 'pressure', retryAfterMs: RETRY_AFTER_MS, deferRetry: true};
  };
  let armed = 0;
  const original = timeSource.setTimeout.bind(timeSource);
  timeSource.setTimeout = (...args) => {
    armed += 1;
    return original(...args);
  };
  const hydration = service.hydrateCdcPropagatedTablesFromAuthority({
    tables: [SYSTEM_TABLE_NAME.NODES], maxAttemptsPerTable: 3,
  }).then((result) => ({result}), (error) => ({error}));
  const {outcome} = await pumpOnVirtualClock(timeSource, hydration, RETRY_AFTER_MS);
  assert.ok(outcome && outcome.result, 'hydration must settle by virtual time alone');
  assert.equal(reads, 3, 'the authority was retried up to the attempt bound');
  assert.equal(armed, 2,
    'each of the two sleeps between three attempts is armed on the injected clock');
  assert.deepEqual(outcome.result.tablesFailed, [SYSTEM_TABLE_NAME.NODES],
    'the exhausted table is recorded as failed, the owner contract');
});

test('the catch-up sweep sweeps a stale row under a virtual clock', async () => {
  // Same intended scenario, same expectation: a row older than the moment the
  // authoritative read began is swept.
  //
  // This witness previously recorded the opposite conclusion - that the stamp
  // had to stay on the wall clock, because seaming it alone made the sweep
  // inert (rowsSwept 0 vs 1). That measurement was right and the inference was
  // wrong: the consumer was not the defect, the DOMAIN was incomplete. The row
  // it compares against, the tombstone instants beside it and the
  // authoritative observation boundary were each stamped by a different clock.
  // With every producer reading an owner TimeSource, the comparison closes and
  // the original expectation holds again.
  const {service, timeSource} = serviceOnVirtualClock();
  const cache = service.systemTableCache;
  // The row's own writer stamps it in the same domain as the reader.
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT,
    {service_id: 'stale', status: 'active', updated_at: timeSource.now() - 10_000});
  service.executeAuthoritativeSystemTableRead = async () => ({
    success: true, rows: [], source: 'owner_rpc_lane',
    readAuthorityWitness: {
      state: 'observed', partitionId: INITIAL_PARTITION_IDS.services,
      role: RAFT_ROLE.LEADER, servingNodeId: 'N1',
      servingReplicaId: 'services-p1-r1', observedAtMs: timeSource.now(),
    },
  });
  const summary = await service.hydrateCdcPropagatedTablesFromAuthority({
    tables: [TABLES.SERVICES], maxAttemptsPerTable: 1,
  });
  assert.equal(timeSource.now(), 0, 'the virtual clock never moved');
  assert.equal(summary.rowsSwept, 1,
    'the stale row is swept: every stamp in the comparison is one domain');
  assert.equal(cache.has(TABLES.SERVICES, 'stale'), false);
});

test('MUTATION: one producer back on ambient time breaks the sweep again',
  async () => {
    // The red-on-revert for the domain repair: put the ROW's stamp back on the
    // process clock while the reader stays on the owner clock, and the sweep
    // goes inert exactly as it did when only the consumer had moved.
    const {service, timeSource} = serviceOnVirtualClock();
    const cache = service.systemTableCache;
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT,
      {service_id: 'stale', status: 'active', updated_at: Date.now() - 10_000});
    service.executeAuthoritativeSystemTableRead = async () => ({
      success: true, rows: [], source: 'owner_rpc_lane',
      readAuthorityWitness: {
        state: 'observed', partitionId: INITIAL_PARTITION_IDS.services,
        role: RAFT_ROLE.LEADER, servingNodeId: 'N1',
        servingReplicaId: 'services-p1-r1', observedAtMs: timeSource.now(),
      },
    });
    const summary = await service.hydrateCdcPropagatedTablesFromAuthority({
      tables: [TABLES.SERVICES], maxAttemptsPerTable: 1,
    });
    assert.equal(summary.rowsSwept, 0,
      'a row stamped in another time domain looks newer than the read that ' +
      'began before it, so the safety check declines to sweep it');
    assert.equal(cache.has(TABLES.SERVICES, 'stale'), true);
  });

test('the owner holds one clock, the injected one, and defaults to the platform clock', () => {
  const {service, timeSource} = serviceOnVirtualClock();
  assert.equal(service.timeSource, timeSource);
  const plain = new CDCIntegrationService({nodeId: NODE_ID});
  assert.ok(plain.timeSource instanceof RealTimeSource,
    'with nothing injected the default is the platform clock, byte-for-byte');
});

test('the HLC is the service\'s child clock, not its own time authority', () => {
  // The seam this pins: CDC constructed HLCClockService without threading its
  // TimeSource, so inside a deterministic node the HLC resolved a
  // RealTimeSource of its own and read platform time underneath a subsystem
  // that had been handed a virtual clock. The repair is the missing arrow at
  // the construction boundary; RealTimeSource itself is untouched and remains
  // the default for everyone who supplies nothing.
  const {service, timeSource} = serviceOnVirtualClock();
  assert.equal(service.hlcClock.timeSource, timeSource,
    'the HLC reads the clock its parent was given');
  assert.equal(service.hlcClock.physical, timeSource.now(),
    'and its physical component starts at the owner\'s instant');

  // Advancing the owner clock moves the HLC's physical component; wall time
  // never enters the comparison.
  timeSource.advance(5000);
  const stamped = service.hlcClock.now();
  assert.equal(stamped.physical, timeSource.now(),
    'an HLC timestamp tracks the owner clock across a threshold move');
  assert.ok(stamped.physical < Date.now(),
    'and is nowhere near platform time, which is what a defaulted ' +
    'RealTimeSource would have produced');
});

test('MUTATION: an HLC that resolves its own clock leaves the owner\'s domain',
  () => {
    const {service, timeSource} = serviceOnVirtualClock();
    // Exactly what the unthreaded construction produced.
    const unthreaded = new HLCClockService(NODE_ID);
    assert.notEqual(unthreaded.physical, timeSource.now(),
      'a defaulted HLC starts on platform time, not the node\'s instant');
    assert.ok(unthreaded.physical >= service.hlcClock.physical,
      'which is the drift the threading removed');
  });

test('a write duration is measured end to end on the owner clock', async () => {
  // A duration proof, not a threshold one: this timestamp selects no branch,
  // it reports how long a write took. The claim is that ONE owner clock
  // defines both ends, so the reported elapsed time is virtual time that
  // actually passed during the dependency rather than host time that happened
  // to pass around it.
  const ELAPSED_MS = 4000;
  const {service, timeSource} = serviceOnVirtualClock();
  const metrics = [];
  service.logger = {
    ...QUIET_LOGGER,
    info(tag, payload) {
      if (tag === METRICS_LOG_TAG.CDC_WRITE) metrics.push(payload);
    },
  };
  // The controlled dependency: virtual time advances while the write is in
  // flight, exactly as a slow write would.
  service.executeSQL = async () => {
    timeSource.advance(ELAPSED_MS);
    return {success: true, changes: 1};
  };
  service.waitForCacheUpdate = async () => undefined;
  await service.insertSystemTableRow(TABLES.SERVICES,
    {service_id: 'duration-witness', status: 'active'});
  const [written] = metrics;
  assert.ok(written, 'the write metric was emitted');
  assert.equal(written.sqlDurationMs, ELAPSED_MS,
    'the reported duration is the virtual time that passed during the write');
  assert.equal(written.cacheWaitDurationMs, 0,
    'and the cache wait, which consumed no virtual time, reports none');
});

test('MUTATION: mixing ambient time into a duration breaks its end-to-end claim',
  async () => {
    // Half the measurement on the owner clock and half on the process clock
    // is exactly the shape that makes a deterministic run depend on host
    // speed: the reported elapsed time stops being the virtual time that
    // passed.
    const ELAPSED_MS = 4000;
    const {service, timeSource} = serviceOnVirtualClock();
    const metrics = [];
    service.logger = {
      ...QUIET_LOGGER,
      info(tag, payload) {
        if (tag === METRICS_LOG_TAG.CDC_WRITE) metrics.push(payload);
      },
    };
    // One end of the duration on ambient time. Poisoned RELATIVE TO THE
    // WRITE rather than by read index: the owner takes other readings on the
    // way in (a row stamp, for one), and counting them would make this
    // witness a statement about how many times the clock is read instead of
    // about which clock closes the duration.
    const virtualNow = timeSource.now.bind(timeSource);
    let poisonNextRead = false;
    service.executeSQL = async () => {
      timeSource.advance(ELAPSED_MS);
      poisonNextRead = true;
      return {success: true, changes: 1};
    };
    service.waitForCacheUpdate = async () => undefined;
    service.timeSource = {
      ...timeSource,
      now: () => {
        if (!poisonNextRead) return virtualNow();
        poisonNextRead = false;
        return Date.now();
      },
    };
    await service.insertSystemTableRow(TABLES.SERVICES,
      {service_id: 'duration-witness', status: 'active'});
    const [written] = metrics;
    assert.notEqual(written.sqlDurationMs, ELAPSED_MS,
      'a duration whose ends come from different clocks no longer reports ' +
      'the virtual time that passed');
  });
