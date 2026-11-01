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
  OLTP_PAIRED_SWEEP_STATUS,
  runScenarioAPairedSweep,
} from '../../test/distributed/harness/oltp-paired-sweep-runner.js';
import {
  buildScenarioAPairedSweepPlan,
} from '../../test/distributed/harness/oltp-paired-sweep-plan.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  COMPARISON_VIEW,
} from '../../test/distributed/harness/comparative-system-budget.js';
import {
  getScenarioDefinitionHref,
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
const STR_LAGRANGE_V030 = '0.4.0';
const STR_LAGRANGE_V031 = '0.4.1';
const STR_TIDB_V858 = 'v8.5.8';
const STR_TIDB_V859 = 'v8.5.9';
const STR_TIMING_OBSERVED = 'observed';
const STR_MODELED_HARNESS_BASELINE = 'local-oracle-plus-network-model';
const STR_SMOKE_PROFILE = 'smoke';
const STR_SCORECARD_MD_HEADER = '## Scenario B distributed risk & movement scorecard';
const STR_SCORECARD_HTML_HEADER = 'Scenario B Distributed Risk &amp; Movement Scorecard';
const STR_TMP_PREFIX = 'scenario-b-version-gate-';
const STR_TMP_NDJSON = 'history.ndjson';
const STR_TMP_SUMMARY = 'summary.json';
const STR_RISK_DECISIONS_PER_SEC = 'Risk Decisions/sec';
const STR_CROSS_ISLAND_WAN_TRAFFIC = 'Cross-Island WAN Traffic';
const STR_SCENARIO_B_SVG_FILENAME = 'tidb-scenario-b-comparison.svg';
const STR_SCENARIO_B_DOC_HREF = 'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision';

const NUM_BYTES_192 = 192;
const NUM_RATE_ONE = 1;
const NUM_RATE_TWO = 2;
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

  // An unchanged-version sweep is a typed not-measured outcome: no step is
  // executed and no cached record or number is returned.
  let executedSteps = 0;
  const sweepUnchanged = await runScenarioAPairedSweep({
    sweepPlan: buildScenarioAPairedSweepPlan({
      systems: [OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV, OLTP_SCENARIO_A_SYSTEM.LAGRANGE],
      comparisonView: COMPARISON_VIEW.ARCHITECTURE_NATIVE,
      offeredRatesPerSec: [NUM_RATE_ONE, NUM_RATE_TWO],
      repetitions: NUM_RATE_TWO,
      slo: {p99Ms: 50, maxErrorRate: 0.01},
      workload: {seed: NUM_SEED, workers: 1, warmupOperationsPerWorker: 0,
        measurementOperationsPerWorker: 2, warehouseCount: 1, districtsPerWarehouse: 1,
        customersPerDistrict: 1, itemCount: 15},
    }),
    executeStep: async () => {
      executedSteps += 1;
    },
    versionGate: gateUnchanged,
  });
  assert.equal(sweepUnchanged.status, OLTP_PAIRED_SWEEP_STATUS.NOT_MEASURED);
  assert.equal(sweepUnchanged.curves, null);
  assert.equal(sweepUnchanged.executionOrderLog.length, 0);
  assert.equal(executedSteps, 0);

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
  assert.equal(getScenarioDefinitionHref(STR_SCENARIO_B), STR_SCENARIO_B_DOC_HREF);
  assert.equal(stringIncludes(markdown, STR_SCORECARD_MD_HEADER), true);
  assert.equal(stringIncludes(html, STR_SCORECARD_HTML_HEADER), true);
  assert.equal(stringIncludes(markdown, STR_SCENARIO_B_SVG_FILENAME), true);
  assert.equal(stringIncludes(markdown, STR_SCENARIO_B_DOC_HREF), true);
  assert.equal(stringIncludes(html, STR_SCENARIO_B_DOC_HREF), true);
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
  assert.equal(observedSmoke.timingSource, STR_MODELED_HARNESS_BASELINE);
  assert.equal(observedSmoke.evidenceSource?.kind, STR_MODELED_HARNESS_BASELINE);
  assert.equal(observedSmoke.comparable, false);
  assert.equal(observedSmoke.fairnessEvidence?.oraclePassed, true);

  await verifyScenarioASystemVersionGate(existingRecords);
  verifyScenarioBFairnessGateEvaluation();
  await verifyScenarioBVersionGatedExecution(existingRecords);
}

await runGuard();

console.log(PASS_MESSAGE);
