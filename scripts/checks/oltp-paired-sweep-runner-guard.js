#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  validateComparisonHistoryRecord,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {
  OLTP_PAIRED_SWEEP_RUNNER_VERSION,
  evaluateOltpSweepStepSlo,
  summarizePairedSweepSystemCurve,
  runScenarioAPairedSweep,
  buildPairedSweepHistoryRecord,
} from '../../test/distributed/harness/oltp-paired-sweep-runner.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayPush = Function.call.bind(Array.prototype.push);
const stringIncludes = Function.call.bind(String.prototype.includes);

const PASS_MESSAGE = 'oltp-paired-sweep-runner-guard: PASS';
const STR_EXPECTED_VERSION = 'scenario-a-open-loop-paired-sweep-runner-v1';
const STR_LAGRANGE = 'lagrange';
const STR_TIDB = 'tidb';
const STR_SMOKE = 'smoke';
const STR_OBSERVED = 'observed';
const STR_CONTRACT_MODEL = 'deterministic-contract-model';
const STR_RECORDED_AT = '2026-10-30T14:50:00.000Z';
const STR_REASON_SUBSTRING = 'Non-comparable evidence';
const STR_TYPE_STRING = 'string';
const STR_TYPE_OBJECT = 'object';
const NUM_RATE_25 = 25;
const NUM_RATE_50 = 50;
const NUM_STEP_DURATION_MS = 10;
const NUM_WARMUP_OPS = 4;
const NUM_TOTAL_SCHEDULED = 100;
const NUM_COMPLETED_OK = 100;
const NUM_P99_LOW = 20;
const NUM_P99_HIGH = 80;
const NUM_SLO_P99_LIMIT = 50;
const NUM_SLO_MAX_ERROR_RATE = 0.001;
const NUM_SEED = 0x51a7e001;
const NUM_LOG_LENGTH_EIGHT = 8;
const NUM_SHA_LENGTH_64 = 64;
const NUM_FAILED_COUNT_HIGH = 5;
const NUM_INDEX_THREE = 3;

function verifyRunnerVersionAndSloEvaluation() {
  assert.equal(OLTP_PAIRED_SWEEP_RUNNER_VERSION, STR_EXPECTED_VERSION);

  const sloConfig = Object.freeze({
    p99Ms: NUM_SLO_P99_LIMIT,
    maxErrorRate: NUM_SLO_MAX_ERROR_RATE,
  });

  const passingReport = Object.freeze({
    totalScheduled: NUM_TOTAL_SCHEDULED,
    completedOk: NUM_COMPLETED_OK,
    failed: 0,
    timedOut: 0,
    overallLatencyMs: Object.freeze({p99: NUM_P99_LOW}),
    achievedCompletedPerSec: NUM_RATE_50,
    offeredRatePerSec: NUM_RATE_50,
  });
  const passingEval = evaluateOltpSweepStepSlo(passingReport, sloConfig);
  assert.equal(passingEval.latencyPass, true);
  assert.equal(passingEval.errorRatePass, true);
  assert.equal(passingEval.sloPass, true);

  const failingLatencyReport = Object.freeze({
    ...passingReport,
    overallLatencyMs: Object.freeze({p99: NUM_P99_HIGH}),
  });
  const failingLatencyEval = evaluateOltpSweepStepSlo(failingLatencyReport, sloConfig);
  assert.equal(failingLatencyEval.latencyPass, false);
  assert.equal(failingLatencyEval.sloPass, false);

  const failingErrorReport = Object.freeze({
    ...passingReport,
    failed: NUM_FAILED_COUNT_HIGH,
  });
  const failingErrorEval = evaluateOltpSweepStepSlo(failingErrorReport, sloConfig);
  assert.equal(failingErrorEval.errorRatePass, false);
  assert.equal(failingErrorEval.sloPass, false);
}

function verifyCurveSummarizationAndExclusion() {
  const sloConfig = Object.freeze({
    p99Ms: NUM_SLO_P99_LIMIT,
    maxErrorRate: NUM_SLO_MAX_ERROR_RATE,
  });

  const runPassRate25 = Object.freeze({
    offeredRatePerSec: NUM_RATE_25,
    repetition: 1,
    stepReport: Object.freeze({
      totalScheduled: NUM_TOTAL_SCHEDULED,
      completedOk: NUM_TOTAL_SCHEDULED,
      failed: 0,
      overallLatencyMs: Object.freeze({p99: NUM_P99_LOW}),
      achievedCompletedPerSec: NUM_RATE_25,
      offeredRatePerSec: NUM_RATE_25,
    }),
  });
  const runPassRate25Rep2 = Object.freeze({
    ...runPassRate25,
    repetition: 2,
  });

  const runFailRate50Rep1 = Object.freeze({
    offeredRatePerSec: NUM_RATE_50,
    repetition: 1,
    stepReport: Object.freeze({
      totalScheduled: NUM_TOTAL_SCHEDULED,
      completedOk: NUM_TOTAL_SCHEDULED,
      failed: 0,
      overallLatencyMs: Object.freeze({p99: NUM_P99_HIGH}),
      achievedCompletedPerSec: NUM_RATE_50,
      offeredRatePerSec: NUM_RATE_50,
    }),
  });
  const runPassRate50Rep2 = Object.freeze({
    offeredRatePerSec: NUM_RATE_50,
    repetition: 2,
    stepReport: Object.freeze({
      totalScheduled: NUM_TOTAL_SCHEDULED,
      completedOk: NUM_TOTAL_SCHEDULED,
      failed: 0,
      overallLatencyMs: Object.freeze({p99: NUM_P99_LOW}),
      achievedCompletedPerSec: NUM_RATE_50,
      offeredRatePerSec: NUM_RATE_50,
    }),
  });

  const curve = summarizePairedSweepSystemCurve({
    system: STR_LAGRANGE,
    runs: [runPassRate25, runPassRate25Rep2, runFailRate50Rep1, runPassRate50Rep2],
    sloConfig,
  });

  assert.equal(curve.system, STR_LAGRANGE);
  assert.equal(curve.ratePoints.length, 2);
  assert.equal(curve.ratePoints[0].allRepetitionsPassSlo, true);
  assert.equal(curve.ratePoints[1].allRepetitionsPassSlo, false);
  assert.equal(curve.maxSustainedCommittedPerSecUnderSlo, NUM_RATE_25);
  assert.equal(curve.bestMedianP99Ms, NUM_P99_LOW);
}

async function verifyPairedSweepExecutionOrderAndPrep() {
  const recordedTxEvents = [];
  const sweep = await runScenarioAPairedSweep({
    profile: STR_SMOKE,
    offeredRatesPerSec: Object.freeze([NUM_RATE_25, NUM_RATE_50]),
    repetitions: 2,
    stepDurationMs: NUM_STEP_DURATION_MS,
    warmupOperationsPerSystem: NUM_WARMUP_OPS,
    seed: NUM_SEED,
    timingSource: STR_CONTRACT_MODEL,
    executeSystemTx: async ({system, phase}) => {
      arrayPush(recordedTxEvents, `${system}:${phase}`);
      return {committed: true};
    },
  });

  assert.equal(sweep.runnerVersion, STR_EXPECTED_VERSION);
  assert.equal(sweep.comparable, false);
  assert.equal(typeof sweep.nonComparableReason, STR_TYPE_STRING);
  assert.equal(stringIncludes(sweep.nonComparableReason, STR_REASON_SUBSTRING), true);
  assert.equal(sweep.executionOrderLog.length, NUM_LOG_LENGTH_EIGHT);

  for (let index = 0; index < sweep.executionOrderLog.length; index += 1) {
    const entry = sweep.executionOrderLog[index];
    assert.equal(entry.freshDatasetPrepared, true);
    assert.equal(entry.warmupCompleted, true);
    assert.equal(entry.warmupOperations, NUM_WARMUP_OPS);
    assert.equal(typeof entry.sloEvaluation, STR_TYPE_OBJECT);
  }

  const rep1Entries = arrayFilter(sweep.executionOrderLog, (entry) => entry.repetition === 1);
  const rep2Entries = arrayFilter(sweep.executionOrderLog, (entry) => entry.repetition === 2);

  assert.equal(rep1Entries[0].system, STR_TIDB);
  assert.equal(rep1Entries[0].offeredRatePerSec, NUM_RATE_25);
  assert.equal(rep1Entries[1].system, STR_LAGRANGE);
  assert.equal(rep1Entries[1].offeredRatePerSec, NUM_RATE_25);
  assert.equal(rep1Entries[2].system, STR_TIDB);
  assert.equal(rep1Entries[2].offeredRatePerSec, NUM_RATE_50);
  assert.equal(rep1Entries[NUM_INDEX_THREE].system, STR_LAGRANGE);
  assert.equal(rep1Entries[NUM_INDEX_THREE].offeredRatePerSec, NUM_RATE_50);

  assert.equal(rep2Entries[0].system, STR_LAGRANGE);
  assert.equal(rep2Entries[0].offeredRatePerSec, NUM_RATE_50);
  assert.equal(rep2Entries[1].system, STR_TIDB);
  assert.equal(rep2Entries[1].offeredRatePerSec, NUM_RATE_50);
  assert.equal(rep2Entries[2].system, STR_LAGRANGE);
  assert.equal(rep2Entries[2].offeredRatePerSec, NUM_RATE_25);
  assert.equal(rep2Entries[NUM_INDEX_THREE].system, STR_TIDB);
  assert.equal(rep2Entries[NUM_INDEX_THREE].offeredRatePerSec, NUM_RATE_25);

  assert.equal(sweep.curves.lagrange.system, STR_LAGRANGE);
  assert.equal(sweep.curves.tidb.system, STR_TIDB);
}

async function verifyFailClosedComparabilityAndObserved() {
  const sweepObservedPass = await runScenarioAPairedSweep({
    profile: STR_SMOKE,
    offeredRatesPerSec: Object.freeze([NUM_RATE_25, NUM_RATE_50]),
    repetitions: 2,
    stepDurationMs: NUM_STEP_DURATION_MS,
    warmupOperationsPerSystem: NUM_WARMUP_OPS,
    seed: NUM_SEED,
    timingSource: STR_OBSERVED,
    semanticGatePassed: true,
    resourceIntegrityVerified: true,
  });
  assert.equal(sweepObservedPass.comparable, true);
  assert.equal(sweepObservedPass.nonComparableReason, undefined);

  const sweepSemanticFail = await runScenarioAPairedSweep({
    profile: STR_SMOKE,
    offeredRatesPerSec: Object.freeze([NUM_RATE_25, NUM_RATE_50]),
    repetitions: 2,
    stepDurationMs: NUM_STEP_DURATION_MS,
    warmupOperationsPerSystem: NUM_WARMUP_OPS,
    seed: NUM_SEED,
    timingSource: STR_OBSERVED,
    semanticGatePassed: false,
    resourceIntegrityVerified: true,
  });
  assert.equal(sweepSemanticFail.comparable, false);
  assert.equal(typeof sweepSemanticFail.nonComparableReason, STR_TYPE_STRING);

  const sweepResourceFail = await runScenarioAPairedSweep({
    profile: STR_SMOKE,
    offeredRatesPerSec: Object.freeze([NUM_RATE_25, NUM_RATE_50]),
    repetitions: 2,
    stepDurationMs: NUM_STEP_DURATION_MS,
    warmupOperationsPerSystem: NUM_WARMUP_OPS,
    seed: NUM_SEED,
    timingSource: STR_OBSERVED,
    semanticGatePassed: true,
    resourceIntegrityVerified: false,
  });
  assert.equal(sweepResourceFail.comparable, false);
  assert.equal(typeof sweepResourceFail.nonComparableReason, STR_TYPE_STRING);
}

async function verifyHistoryRecordCreationInMemory() {
  const sweep = await runScenarioAPairedSweep({
    profile: STR_SMOKE,
    offeredRatesPerSec: Object.freeze([NUM_RATE_25, NUM_RATE_50]),
    repetitions: 2,
    stepDurationMs: NUM_STEP_DURATION_MS,
    warmupOperationsPerSystem: NUM_WARMUP_OPS,
    seed: NUM_SEED,
    timingSource: STR_CONTRACT_MODEL,
  });

  const record = buildPairedSweepHistoryRecord({
    sweepResult: sweep,
    recordedAt: STR_RECORDED_AT,
  });

  const validated = validateComparisonHistoryRecord(record);
  assert.equal(typeof validated.recordSha256, STR_TYPE_STRING);
  assert.equal(validated.recordSha256.length, NUM_SHA_LENGTH_64);
  assert.equal(record.comparable, false);
  assert.equal(typeof record.nonComparableReason, STR_TYPE_STRING);
}

async function runGuard() {
  verifyRunnerVersionAndSloEvaluation();
  verifyCurveSummarizationAndExclusion();
  await verifyPairedSweepExecutionOrderAndPrep();
  await verifyFailClosedComparabilityAndObserved();
  await verifyHistoryRecordCreationInMemory();
}

await runGuard();
console.log(PASS_MESSAGE);
