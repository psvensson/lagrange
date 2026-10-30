import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  SCENARIO_B_FAIRNESS_GATE_VERSION,
  evaluateScenarioSystemVersionGate,
  evaluateScenarioBFairnessGate,
  buildScenarioBScorecardRecord,
  runScenarioBVersionGatedComparison,
} from '../../test/distributed/harness/scenario-b-fairness-gate.js';
import {
  parseComparisonHistoryNdjson,
  buildComparisonProgressSummary,
  recordComparisonResultToDisk,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {
  runScenarioAPairedSweep,
} from '../../test/distributed/harness/oltp-paired-sweep-runner.js';
import {
  renderComparisonProgressHtml,
  renderComparisonProgressMarkdown,
  renderComparisonProgressSvg,
  renderScenarioBComparisonSvg,
} from '../../test/distributed/harness/oltp-comparison-static-web.js';
import {
  runObservedScenarioBHarnessComparison,
} from '../../test/distributed/harness/scenario-b-comparators.js';

const stringIncludes = Function.call.bind(String.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);

const PASS_MESSAGE = 'scenario-b-fairness-version-gate-guard: PASS';
const STR_HISTORY_PATH = 'data/tidb-comparison/history.ndjson';
const STR_UTF8 = 'utf8';
const STR_SCENARIO_A = 'tidb-oltp-baseline';
const STR_SCENARIO_B = 'tidb-distributed-risk-decision';
const STR_PROFILE_B = 'risk-three-island-rf3';
const STR_LAGRANGE_V030 = '0.3.0';
const STR_LAGRANGE_V031 = '0.3.1';
const STR_TIDB_V858 = 'v8.5.8';
const STR_TIDB_V859 = 'v8.5.9';
const STR_TIMING_OBSERVED = 'observed';
const STR_OBSERVED_HARNESS_BASELINE = 'observed-harness-baseline';
const STR_SMOKE_PROFILE = 'smoke';
const STR_CONTRACT_MODEL = 'deterministic-contract-model';
const STR_SCORECARD_MD_HEADER = '## Scenario B distributed risk & movement scorecard';
const STR_SCORECARD_HTML_HEADER = 'Scenario B Distributed Risk &amp; Movement Scorecard';
const STR_TMP_PREFIX = 'scenario-b-version-gate-';
const STR_TMP_NDJSON = 'history.ndjson';
const STR_TMP_SUMMARY = 'summary.json';
const STR_RISK_DECISIONS_PER_SEC = 'Risk Decisions/sec';
const STR_CROSS_ISLAND_WAN_TRAFFIC = 'Cross-Island WAN Traffic';
const STR_SCENARIO_B_SVG_FILENAME = 'tidb-scenario-b-comparison.svg';

const NUM_BYTES_192 = 192;
const NUM_RATE_ONE = 1;
const NUM_RATE_TWO = 2;
const NUM_STEP_DURATION_MS = 10;
const NUM_SEED = 42;

function createSatisfiedScenarioBEvidence() {
  return {
    tidbPushdownVerified: true,
    distributedCoordinatorFairnessSatisfied: true,
    warmStateVerified: true,
    readOnlyHistoryVerified: true,
    resourceParityVerified: true,
    coordinatorResourcesCounted: true,
    edgeAccountingWindowClosed: true,
    crossIslandBytesPerRequest: NUM_BYTES_192,
    oraclePassed: true,
    movementIdentityPreserved: true,
    timingSource: STR_TIMING_OBSERVED,
  };
}

async function verifyScenarioASystemVersionGate(existingRecords) {
  const systemsBase = {
    lagrange: {version: STR_LAGRANGE_V030},
    tidbTikv: {version: STR_TIDB_V858},
  };
  const gateUnchanged = evaluateScenarioSystemVersionGate({
    existingRecords,
    scenarioId: STR_SCENARIO_A,
    systems: systemsBase,
  });
  assert.equal(gateUnchanged.shouldRun, false);
  assert.equal(gateUnchanged.skippedBecauseSystemVersionsUnchanged, true);

  const sweepUnchanged = await runScenarioAPairedSweep({
    existingRecords,
    scenarioId: STR_SCENARIO_A,
    systems: systemsBase,
    profile: STR_SMOKE_PROFILE,
  });
  assert.equal(sweepUnchanged.skipped, true);
  assert.equal(sweepUnchanged.skippedBecauseSystemVersionsUnchanged, true);
  assert.equal(sweepUnchanged.executionOrderLog.length, 0);

  const systemsLagrangeBumped = {
    lagrange: {version: STR_LAGRANGE_V031},
    tidbTikv: {version: STR_TIDB_V858},
  };
  const gateLagrangeBumped = evaluateScenarioSystemVersionGate({
    existingRecords,
    scenarioId: STR_SCENARIO_A,
    systems: systemsLagrangeBumped,
  });
  assert.equal(gateLagrangeBumped.shouldRun, true);
  assert.equal(gateLagrangeBumped.lagrangeVersionChanged, true);

  const sweepLagrangeBumped = await runScenarioAPairedSweep({
    existingRecords,
    scenarioId: STR_SCENARIO_A,
    systems: systemsLagrangeBumped,
    profile: STR_SMOKE_PROFILE,
    offeredRatesPerSec: Object.freeze([NUM_RATE_ONE, NUM_RATE_TWO]),
    repetitions: NUM_RATE_TWO,
    stepDurationMs: NUM_STEP_DURATION_MS,
    warmupOperationsPerSystem: 0,
    seed: NUM_SEED,
    timingSource: STR_CONTRACT_MODEL,
    executeSystemTx: async () => ({committed: true}),
  });
  assert.equal(sweepLagrangeBumped.skipped, false);
  assert.equal(sweepLagrangeBumped.skippedBecauseSystemVersionsUnchanged, false);

  const systemsTidbBumped = {
    lagrange: {version: STR_LAGRANGE_V030},
    tidbTikv: {version: STR_TIDB_V859},
  };
  const gateTidbBumped = evaluateScenarioSystemVersionGate({
    existingRecords,
    scenarioId: STR_SCENARIO_A,
    systems: systemsTidbBumped,
  });
  assert.equal(gateTidbBumped.shouldRun, true);
  assert.equal(gateTidbBumped.tidbTikvVersionChanged, true);

  const sweepTidbBumped = await runScenarioAPairedSweep({
    existingRecords,
    scenarioId: STR_SCENARIO_A,
    systems: systemsTidbBumped,
    profile: STR_SMOKE_PROFILE,
    offeredRatesPerSec: Object.freeze([NUM_RATE_ONE, NUM_RATE_TWO]),
    repetitions: NUM_RATE_TWO,
    stepDurationMs: NUM_STEP_DURATION_MS,
    warmupOperationsPerSystem: 0,
    seed: NUM_SEED,
    timingSource: STR_CONTRACT_MODEL,
    executeSystemTx: async () => ({committed: true}),
  });
  assert.equal(sweepTidbBumped.skipped, false);
  assert.equal(sweepTidbBumped.skippedBecauseSystemVersionsUnchanged, false);
}

function verifyScenarioBFairnessGateEvaluation() {
  const incompleteReport = evaluateScenarioBFairnessGate({});
  assert.equal(incompleteReport.gateVersion, SCENARIO_B_FAIRNESS_GATE_VERSION);
  assert.equal(incompleteReport.comparable, false);
  assert.equal(incompleteReport.failedChecks.length > 0, true);

  const satisfiedReport = evaluateScenarioBFairnessGate(createSatisfiedScenarioBEvidence());
  assert.equal(satisfiedReport.comparable, true);
  assert.equal(satisfiedReport.failedChecks.length, 0);

  const directRecord = buildScenarioBScorecardRecord({
    fairnessReport: satisfiedReport,
    systems: {
      lagrange: {version: STR_LAGRANGE_V030},
      tidbTikv: {version: STR_TIDB_V858},
    },
  });
  assert.equal(directRecord.comparable, true);
  assert.equal(typeof directRecord.recordSha256 === 'string', true);
}

async function verifyScenarioBVersionGatedExecution(existingRecords) {
  const systemsBase = {lagrange: {version: STR_LAGRANGE_V030}, tidbTikv: {version: STR_TIDB_V858}};
  const executeComparison = async () => ({
    fairnessEvidence: createSatisfiedScenarioBEvidence(),
  });

  const recordsWithoutScenarioB = arrayFilter(
    existingRecords,
    (r) => r?.framework?.scenarioId !== STR_SCENARIO_B,
  );

  const firstRun = await runScenarioBVersionGatedComparison({
    existingRecords: recordsWithoutScenarioB,
    scenarioId: STR_SCENARIO_B,
    profileId: STR_PROFILE_B,
    systems: systemsBase,
    executeComparison,
  });
  assert.equal(firstRun.executed, true);
  assert.equal(firstRun.skipped, false);
  assert.equal(typeof firstRun.record?.recordSha256 === 'string', true);

  const recordsWithScenarioB = [...recordsWithoutScenarioB, firstRun.record];
  const secondRun = await runScenarioBVersionGatedComparison({
    existingRecords: recordsWithScenarioB,
    scenarioId: STR_SCENARIO_B,
    profileId: STR_PROFILE_B,
    systems: systemsBase,
    executeComparison,
  });
  assert.equal(secondRun.executed, false);
  assert.equal(secondRun.skipped, true);
  assert.equal(secondRun.skippedBecauseSystemVersionsUnchanged, true);

  const runLagrangeBumped = await runScenarioBVersionGatedComparison({
    existingRecords: recordsWithScenarioB,
    scenarioId: STR_SCENARIO_B,
    profileId: STR_PROFILE_B,
    systems: {
      lagrange: {version: STR_LAGRANGE_V031},
      tidbTikv: {version: STR_TIDB_V858},
    },
    executeComparison,
  });
  assert.equal(runLagrangeBumped.executed, true);
  assert.equal(runLagrangeBumped.skipped, false);

  const runTidbBumped = await runScenarioBVersionGatedComparison({
    existingRecords: recordsWithScenarioB,
    scenarioId: STR_SCENARIO_B,
    profileId: STR_PROFILE_B,
    systems: {
      lagrange: {version: STR_LAGRANGE_V030},
      tidbTikv: {version: STR_TIDB_V859},
    },
    executeComparison,
  });
  assert.equal(runTidbBumped.executed, true);
  assert.equal(runTidbBumped.skipped, false);

  const summary = buildComparisonProgressSummary(recordsWithScenarioB);
  const markdown = renderComparisonProgressMarkdown(summary);
  const html = renderComparisonProgressHtml(summary);
  const progressSvg = renderComparisonProgressSvg(summary);
  const scenarioBSvg = renderScenarioBComparisonSvg(summary);
  assert.equal(stringIncludes(markdown, STR_SCORECARD_MD_HEADER), true);
  assert.equal(stringIncludes(html, STR_SCORECARD_HTML_HEADER), true);
  assert.equal(stringIncludes(markdown, STR_SCENARIO_B_SVG_FILENAME), true);
  assert.equal(stringIncludes(progressSvg, STR_RISK_DECISIONS_PER_SEC), true);
  assert.equal(stringIncludes(progressSvg, STR_CROSS_ISLAND_WAN_TRAFFIC), true);
  assert.equal(stringIncludes(scenarioBSvg, STR_RISK_DECISIONS_PER_SEC), true);
  assert.equal(stringIncludes(scenarioBSvg, STR_CROSS_ISLAND_WAN_TRAFFIC), true);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), STR_TMP_PREFIX));
  try {
    const tmpNdjson = path.join(tmpDir, STR_TMP_NDJSON);
    const tmpSummary = path.join(tmpDir, STR_TMP_SUMMARY);
    const diskWriteFirst = await recordComparisonResultToDisk({
      record: firstRun.record,
      ndjsonPath: tmpNdjson,
      summaryPath: tmpSummary,
      skipIfSystemVersionsUnchanged: true,
    });
    assert.equal(diskWriteFirst.skipped, false);

    const diskWriteSecond = await recordComparisonResultToDisk({
      record: firstRun.record,
      ndjsonPath: tmpNdjson,
      summaryPath: tmpSummary,
      skipIfSystemVersionsUnchanged: true,
    });
    assert.equal(diskWriteSecond.skipped, true);
  } finally {
    await fs.rm(tmpDir, {recursive: true, force: true});
  }
}

async function runGuard() {
  const rawNdjson = await fs.readFile(STR_HISTORY_PATH, STR_UTF8);
  const existingRecords = parseComparisonHistoryNdjson(rawNdjson);

  const observedSmoke = runObservedScenarioBHarnessComparison({profile: STR_SMOKE_PROFILE});
  assert.equal(observedSmoke.timingSource, STR_OBSERVED_HARNESS_BASELINE);
  assert.equal(observedSmoke.fairnessEvidence?.oraclePassed, true);

  await verifyScenarioASystemVersionGate(existingRecords);
  verifyScenarioBFairnessGateEvaluation();
  await verifyScenarioBVersionGatedExecution(existingRecords);
}

await runGuard();

console.log(PASS_MESSAGE);
