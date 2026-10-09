#!/usr/bin/env node
// Controlled owner-boundary measurement, not a production election latency claim.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ERRORS} from '../../src/constants/errors.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {createMockSystemCache} from '../../test/query/query-executor-test-support.js';
import {SCHEDULE_KIND} from '../../test/raft/raft-rs-backend/native-election-schedules.js';

refuseUnderProbe('retry recovery-window owner measurement');
const [output, sourceSha, mode = 'all'] = process.argv.slice(2);
assert.ok(output && /^[0-9a-f]{40}$/u.test(sourceSha || ''), 'output and exact SHA required');
assert.ok(['all', 'query-only'].includes(mode));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PARTITION = 'retry-window-p1';
const BUDGET_MS = 8000;
const RETRY_MS = 5;
const CLOCK_START = 100000;
const UNKNOWN = PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
const nativeLimit = 600;

// Inputs are response availability and metadata, not a replacement retry policy.
// The real executor owns routing, entry identity, delay choice, budget and result.
async function queryWindow(name, availableAtMs, suppliedEntryId = null) {
  let clock = CLOCK_START;
  const deliveries = [];
  const delays = [];
  const warnings = [];
  const cache = createMockSystemCache([PARTITION]);
  const executor = new QueryExecutor({nodeId: 'test-node', systemCache: cache,
    nowFn: () => clock,
    messageRouter: {async deliver(address, request, options) {
      assert.ok(deliveries.length < 256, 'bounded delivery engagement, not an infinite spin');
      assert.ok(typeof request.entryId === 'string' && request.entryId.length > 0,
        'the real request carries a write identity');
      assert.ok(options.timeoutMs > 0 && clock - CLOCK_START < BUDGET_MS,
        'no new delivery at or beyond the caller deadline');
      deliveries.push({atMs: clock - CLOCK_START, address, entryId: request.entryId,
        timeoutMs: options.timeoutMs});
      if (clock - CLOCK_START >= availableAtMs) {
        return {acknowledged: true, success: true, rows: [], changes: 1};
      }
      return {acknowledged: true, success: false, error: ERRORS.WRITE_OUTCOME_UNKNOWN,
        failureCode: UNKNOWN, entryId: request.entryId};
    }}});
  executor.leaderRetryDelayMs = RETRY_MS;
  executor.logger = {debug() {}, info() {}, error() {},
    warn(message, detail) { warnings.push({message, detail}); }};
  executor.delay = async (delayMs) => {
    assert.ok(Number.isFinite(delayMs) && delayMs > 0);
    delays.push({atMs: clock - CLOCK_START, delayMs});
    clock += delayMs;
  };
  const response = await executor.executeOnPartition(PARTITION,
    'UPDATE witness_rows SET value = value + 1 WHERE id = ?', ['row'],
    false, false, false, {timeoutMs: BUDGET_MS,
      timeoutBudget: {deadlineMs: CLOCK_START + BUDGET_MS},
      ...(suppliedEntryId === null ? {} : {entryId: suppliedEntryId})});
  const entryId = deliveries[0]?.entryId;
  assert.ok(deliveries.length > 0, 'actual executor delivery must engage');
  assert.equal(new Set(deliveries.map((item) => item.entryId)).size, 1,
    'all deliveries use exactly one entry identity');
  if (suppliedEntryId !== null) assert.equal(entryId, suppliedEntryId);
  if (response.success !== true) {
    assert.equal(response.failureCode, UNKNOWN, 'unsettled write must stay typed unknown');
    assert.equal(response.entryId, entryId, 'unknown outcome preserves its exact write identity');
    assert.equal(response.spentWait.deliveries, deliveries.length);
  }
  return {name, availableAtMs, budgetMs: BUDGET_MS, returnedAtMs: clock - CLOCK_START,
    remainingAtReturnMs: BUDGET_MS - (clock - CLOCK_START), response,
    deliveries, delays, warnings};
}

// Independent native mechanism control: no wall-clock/automatic tick assumptions.
// Does NOT pretend the simulated executor replies came from this native cluster.
function nativeSchedule() {
  const schedule = new SCHEDULE_KIND.guarded('retry-window-native', ['a', 'b', 'c']);
  try {
    assert.equal(schedule.run(['a'], nativeLimit,
      () => schedule.leaderOf(['a', 'b', 'c']) === 'a'), true,
    'native positive control: established leader');
    schedule.lost.add('a');
    const before = ['b', 'c'].map((name) => schedule.status(name));
    for (let i = 0; i < 10; i += 1) {
      assert.deepEqual(['b', 'c'].map((name) => schedule.status(name)), before,
        'observations alone do not advance the election');
    }
    let rounds = 0;
    while (rounds < nativeLimit && schedule.leaderOf(['b', 'c']) === null) {
      schedule.tick(['b', 'c']);
      rounds += 1;
    }
    const leader = schedule.leaderOf(['b', 'c']);
    assert.ok(leader !== null, 'ticking surviving native quorum elects a replacement');
    return {kind: 'guarded-production-operation-ports', founders: ['a', 'b', 'c'],
      lost: 'a', leader, rounds, boundRounds: nativeLimit,
      pausedObservations: 10, before, after: ['b', 'c'].map((name) => schedule.status(name)),
      limitation: 'No conversion from deterministic ticks to physical latency; not a SQL workload.'};
  } finally { schedule.dispose(); }
}

ConfigurationManager.resetInstance();
ConfigurationManager.getInstance().initialize();
const report = {schema: 'retry-recovery-window/1', sourceSha,
  measurementStatus: 'incomplete', runtimeChanged: false, queryBoundaryResults: [],
  nativeElectionControl: null,
  proofCeiling: 'Real QueryExecutor routing/budget/redelivery with supplied responses and clock; separate real native tick schedule. Not an end-to-end SQL/election composition, durability or pass-rate proof.'};
try {
  const immediate = await queryWindow('positive-immediate', 0);
  assert.equal(immediate.response.success, true);
  assert.equal(immediate.deliveries.length, 1);
  report.queryBoundaryResults.push(immediate);
  const timely = await queryWindow('positive-timely-recovery', 1000);
  assert.equal(timely.response.success, true, 'recovery reached by an allowed retry settles');
  assert.ok(timely.deliveries.length > 1);
  report.queryBoundaryResults.push(timely);
  const outlasting = await queryWindow('recovery-after-deadline', 9000, 'caller-stable-id');
  assert.notEqual(outlasting.response.success, true);
  assert.ok(outlasting.returnedAtMs <= BUDGET_MS);
  report.queryBoundaryResults.push(outlasting);
  // Locate the residual window from the actual owner result, not copied backoff math.
  const residualAtMs = outlasting.returnedAtMs +
    Math.max(1, Math.floor(outlasting.remainingAtReturnMs / 2));
  if (residualAtMs < BUDGET_MS) {
    const residual = await queryWindow('recovery-in-residual-window', residualAtMs);
    report.queryBoundaryResults.push(residual);
    report.residualWindow = {exists: true, recoveryAtMs: residualAtMs,
      responseSettled: residual.response.success === true,
      ownerReturnedBeforeRecovery: residual.returnedAtMs < residualAtMs,
      policyOwner: 'createPartitionAttemptBudget.waitForRetryBudget',
      classification: 'Observed policy boundary, not an automatic source-repair decision.'};
  } else { report.residualWindow = {exists: false}; }
  if (mode === 'all') report.nativeElectionControl = nativeSchedule();
  const paths = ['src/query/query-executor-partition-delivery.js',
    'src/query/query-executor-partition-attempt-budget.js',
    'src/query/query-executor-unknown-outcome.js',
    'test/raft/raft-rs-backend/native-election-schedules.js'];
  report.sourceDigests = Object.fromEntries(paths.map((file) => [file,
    createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
  report.measurementStatus = 'measured';
} finally {
  ConfigurationManager.resetInstance();
  fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(report, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
}
console.log(JSON.stringify({sourceSha, status: report.measurementStatus,
  windows: report.queryBoundaryResults.map(({name, returnedAtMs, availableAtMs, response}) =>
    ({name, returnedAtMs, availableAtMs, success: response.success, failureCode: response.failureCode})),
  residualWindow: report.residualWindow, nativeLeader: report.nativeElectionControl?.leader}));
