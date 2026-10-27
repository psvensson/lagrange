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

const PROBE_REFUSAL_REASON = 'retry recovery-window owner measurement';
const MODE_ALL = 'all';
const MODE_QUERY_ONLY = 'query-only';
const REQUIRED_ARGS_MESSAGE = 'output and exact SHA required';
const ASSERT_DELIVERY_ENGAGED = 'actual executor delivery must engage';
const ASSERT_SINGLE_ENTRY_ID = 'all deliveries use exactly one entry identity';
const ASSERT_UNSETTLED_UNKNOWN = 'unsettled write must stay typed unknown';
const ASSERT_PRESERVES_ENTRY_ID =
  'unknown outcome preserves its exact write identity';
const NODE_A = 'a';
const NODE_B = 'b';
const NODE_C = 'c';
const FOUNDERS = [NODE_A, NODE_B, NODE_C];
const SURVIVORS = [NODE_B, NODE_C];
const PAUSED_OBSERVATIONS = 10;
const ASSERT_ESTABLISHED_LEADER = 'native positive control: established leader';
const ASSERT_OBSERVATIONS_PASSIVE =
  'observations alone do not advance the election';
const ASSERT_SURVIVING_QUORUM_ELECTS =
  'ticking surviving native quorum elects a replacement';
const SCHEDULE_KIND_LABEL = 'guarded-production-operation-ports';
const NATIVE_LIMITATION =
  'No conversion from deterministic ticks to physical latency; not a SQL workload.';
const ASSERT_TIMELY_RECOVERY_SETTLES =
  'recovery reached by an allowed retry settles';
const RESIDUAL_POLICY_OWNER = 'createPartitionAttemptBudget.waitForRetryBudget';
const RESIDUAL_CLASSIFICATION =
  'Observed policy boundary, not an automatic source-repair decision.';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const STATUS_MEASURED = 'measured';
const NEWLINE = '\n';

refuseUnderProbe(PROBE_REFUSAL_REASON);
const [output, sourceSha, mode = MODE_ALL] = process.argv.slice(2);
assert.ok(output && /^[0-9a-f]{40}$/u.test(sourceSha || ''), REQUIRED_ARGS_MESSAGE);
assert.ok([MODE_ALL, MODE_QUERY_ONLY].includes(mode));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PARTITION = 'retry-window-p1';
const BUDGET_MS = 8000;
const RETRY_MS = 5;
const CLOCK_START = 100000;
const UNKNOWN = PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
const nativeLimit = 600;

function partitionTableFixture() {
  return createMockSystemCache([PARTITION]);
}

// Inputs are response availability and metadata, not a replacement retry policy.
// The real executor owns routing, entry identity, delay choice, budget and result.
async function queryWindow(name, availableAtMs, suppliedEntryId = null) {
  let clock = CLOCK_START;
  const deliveries = [];
  const delays = [];
  const warnings = [];
  const systemTableFixture = partitionTableFixture();
  const executor = new QueryExecutor({nodeId: 'test-node', systemCache: systemTableFixture,
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
  executor.logger = {
    debug() {},
    info() {},
    error() {},
    warn(message, detail) {
      warnings.push({message, detail});
    },
  };
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
  assert.ok(deliveries.length > 0, ASSERT_DELIVERY_ENGAGED);
  assert.equal(new Set(deliveries.map((item) => item.entryId)).size, 1,
    ASSERT_SINGLE_ENTRY_ID);
  if (suppliedEntryId !== null) assert.equal(entryId, suppliedEntryId);
  if (response.success !== true) {
    assert.equal(response.failureCode, UNKNOWN, ASSERT_UNSETTLED_UNKNOWN);
    assert.equal(response.entryId, entryId, ASSERT_PRESERVES_ENTRY_ID);
    assert.equal(response.spentWait.deliveries, deliveries.length);
  }
  return {name, availableAtMs, budgetMs: BUDGET_MS, returnedAtMs: clock - CLOCK_START,
    remainingAtReturnMs: BUDGET_MS - (clock - CLOCK_START), response,
    deliveries, delays, warnings};
}

// Independent native mechanism control: no wall-clock/automatic tick assumptions.
// Does NOT pretend the simulated executor replies came from this native cluster.
function nativeSchedule() {
  const GuardedSchedule = SCHEDULE_KIND.guarded;
  const schedule = new GuardedSchedule('retry-window-native', FOUNDERS);
  try {
    assert.equal(schedule.run([NODE_A], nativeLimit,
      () => schedule.leaderOf(FOUNDERS) === NODE_A), true,
    ASSERT_ESTABLISHED_LEADER);
    schedule.lost.add(NODE_A);
    const before = SURVIVORS.map((name) => schedule.status(name));
    for (let i = 0; i < PAUSED_OBSERVATIONS; i += 1) {
      assert.deepEqual(SURVIVORS.map((name) => schedule.status(name)), before,
        ASSERT_OBSERVATIONS_PASSIVE);
    }
    let rounds = 0;
    while (rounds < nativeLimit && schedule.leaderOf(SURVIVORS) === null) {
      schedule.tick(SURVIVORS);
      rounds += 1;
    }
    const leader = schedule.leaderOf(SURVIVORS);
    assert.ok(leader !== null, ASSERT_SURVIVING_QUORUM_ELECTS);
    return {
      kind: SCHEDULE_KIND_LABEL,
      founders: FOUNDERS,
      lost: NODE_A,
      leader,
      rounds,
      boundRounds: nativeLimit,
      pausedObservations: PAUSED_OBSERVATIONS,
      before,
      after: SURVIVORS.map((name) => schedule.status(name)),
      limitation: NATIVE_LIMITATION,
    };
  } finally {
    schedule.dispose();
  }
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
  assert.equal(timely.response.success, true, ASSERT_TIMELY_RECOVERY_SETTLES);
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
      policyOwner: RESIDUAL_POLICY_OWNER,
      classification: RESIDUAL_CLASSIFICATION};
  } else {
    report.residualWindow = {exists: false};
  }
  if (mode === MODE_ALL) report.nativeElectionControl = nativeSchedule();
  const paths = ['src/query/query-executor-partition-delivery.js',
    'src/query/query-executor-partition-attempt-budget.js',
    'src/query/query-executor-unknown-outcome.js',
    'test/raft/raft-rs-backend/native-election-schedules.js'];
  report.sourceDigests = Object.fromEntries(paths.map((file) => [file,
    createHash(DIGEST_ALGORITHM)
      .update(fs.readFileSync(path.join(root, file)))
      .digest(DIGEST_ENCODING)]));
  report.measurementStatus = STATUS_MEASURED;
} finally {
  ConfigurationManager.resetInstance();
  fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(report, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2) + NEWLINE);
}
console.log(JSON.stringify({
  sourceSha,
  status: report.measurementStatus,
  windows: report.queryBoundaryResults.map(({name, returnedAtMs, availableAtMs, response}) => ({
    name,
    returnedAtMs,
    availableAtMs,
    success: response.success,
    failureCode: response.failureCode,
  })),
  residualWindow: report.residualWindow,
  nativeLeader: report.nativeElectionControl?.leader,
}));
