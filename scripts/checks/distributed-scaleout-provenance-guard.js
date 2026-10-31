import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import process from 'node:process'; import {fileURLToPath} from 'node:url';
import {readEpic} from '../solve/store.js'; import {epicProblems} from '../solve/schema.js';
import {parseComparisonHistoryNdjson, DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {SCALEOUT_SERIES_EPIC_ID, TOTAL_SCALEOUT_SERIES_SLICES, DEFAULT_MULTI_SYSTEM_MATRIX_PATH,
  readMultiSystemComparativeMatrix, buildLagrangeEvolutionTimeline,
  buildScaleout3To5Rf3Experiment, buildPartitionGranularitySweepExperiment,
  buildScenarioBRttWorkingSetExperiment, buildLiveMovementAndScenarioCScalingExperiment,
} from '../../test/distributed/harness/comparative-matrix-runner.js';
import {DEFAULT_LAGRANGE_EVOLUTION_MD_PATH, DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH,
  DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH, renderLagrangeEvolutionMarkdown,
  renderLagrangeEvolutionHtml, renderLagrangeEvolutionSvg, writeLagrangeEvolutionStaticWebArtifacts,
} from '../../test/distributed/harness/lagrange-evolution-static-web.js';
import {DEFAULT_SCALEOUT_3TO5_MD_PATH, DEFAULT_SCALEOUT_3TO5_HTML_PATH, DEFAULT_SCALEOUT_3TO5_SVG_PATH,
  renderScaleout3To5ComparisonMarkdown, renderScaleout3To5ComparisonHtml,
  renderScaleout3To5ComparisonSvg, writeScaleout3To5ComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/scaleout-node-rf-comparison-static-web.js';
import {DEFAULT_PARTITION_SWEEP_HTML_PATH, DEFAULT_PARTITION_SWEEP_MD_PATH,
  DEFAULT_PARTITION_SWEEP_SVG_PATH, renderPartitionGranularityComparisonHtml,
  renderPartitionGranularityComparisonMarkdown, renderPartitionGranularityComparisonSvg,
  writePartitionGranularityComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/partition-granularity-comparison-static-web.js';
import {DEFAULT_RTT_WORKING_SET_HTML_PATH, DEFAULT_RTT_WORKING_SET_MD_PATH,
  DEFAULT_RTT_WORKING_SET_SVG_PATH, renderScenarioBRttWorkingSetHtml,
  renderScenarioBRttWorkingSetMarkdown, renderScenarioBRttWorkingSetSvg,
  writeScenarioBRttWorkingSetStaticWebArtifacts,
} from '../../test/distributed/harness/scenario-b-rtt-working-set-static-web.js';
import {DEFAULT_MOVEMENT_SCENARIO_C_HTML_PATH, DEFAULT_MOVEMENT_SCENARIO_C_MD_PATH,
  DEFAULT_MOVEMENT_SCENARIO_C_SVG_PATH, renderMovementScenarioCScalingHtml,
  renderMovementScenarioCScalingMarkdown, renderMovementScenarioCScalingSvg,
  writeMovementScenarioCScalingStaticWebArtifacts,
} from '../../test/distributed/harness/movement-scenario-c-scaling-static-web.js';
import {runModeledScenarioBHarnessComparison} from '../../test/distributed/harness/scenario-b-comparators.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8'; const TYPE_FUNCTION = 'function'; const TYPE_OBJECT = 'object'; const PARENT_DIR = '..';
const NEWLINE = '\n'; const FLAG_METRIC = '--metric'; const PASS_MESSAGE = 'distributed-scaleout-provenance-guard: PASS\n';
const NUM_ZERO = 0; const NUM_ONE = 1; const NUM_THREE = 3; const NUM_FOUR = 4; const NUM_FIVE = 5;
const NUM_SIX = 6; const NUM_TEN = 10; const NODE_3 = '3'; const NODE_5 = '5'; const COV_100 = 100.0;
const COV_60 = 60.0; const TARGET_LAGRANGE = 'lagrange'; const TARGET_TIDB = 'tidb-tikv';
const EXPECTED_COMPLETED_SLICES_COUNT = 5; const EXPECTED_REMAINING_SLICES_COUNT = 0; const EXPECTED_EPIC_STATUS = 'done';
const FIRST_SLICE_ID = 'provenance-audit-and-evidence-tier-separation'; const SECOND_SLICE_ID = 'real-3to5-node-rf3-scaleout-and-scenario-a-modes';
const THIRD_SLICE_ID = 'partition-granularity-sweep-5node-rf3'; const FOURTH_SLICE_ID = 'scenario-b-rtt-crossover-and-working-set-growth';
const FIFTH_SLICE_ID = 'live-movement-under-load-and-scenario-c-joint-scaling'; const SCENARIO_B_ID = 'tidb-distributed-risk-decision';
const FORBIDDEN_VIEW_NATIVE = 'architecture-native'; const KIND_LOCAL_ORACLE = 'local-oracle-plus-network-model';
const VIEW_CONTRACT_MODEL = 'contract-model-non-comparable'; const FORBIDDEN_TIMING_SOURCE = 'observed-harness-baseline';
const TIER_OBSERVED_DOCKER = 'observed-docker-cluster'; const PATH_LIVE_WIRE = 'live-cluster-wire';
const TIER_MODELED_ORACLE = 'modeled-topology-oracle'; const PATH_LOCAL_ORACLE = 'local-js-oracle';
const LANDING_MD_PATH = 'docs/benchmarks/README.md'; const LANDING_HTML_PATH = 'docs/benchmarks/index.html';
const MARKER_PROVENANCE_SECTION_MD = 'Measurement provenance and evidence-tier separation';
const MARKER_PROVENANCE_SECTION_HTML = 'Measurement Provenance and Evidence-Tier Separation';
const MARKER_REPLICA_COVERAGE_MD = 'Replica-coverage transition'; const MARKER_REPLICA_COVERAGE_HTML = 'Replica-Coverage Transition';
const MARKER_SCENARIO_A_MODES_MD = 'Scenario A three-mode scale-out separation'; const MARKER_SCENARIO_A_MODES_HTML = 'Scenario A Three-Mode Scale-Out Separation';
const MODE_FIXED = 'fixed-workload-scaleout'; const MODE_HOT = 'hot-contention-baseline'; const MODE_GROWTH = 'proportional-growth-scaleout';
const SWEEP_MD_MARKER_1 = 'Partition granularity sweep on 5-node RF=3 (P=6, 15, 30, 60)';
const SWEEP_MD_MARKER_2 = 'Parallelism sweet spot vs over-partitioning coordination overhead';
const SWEEP_HTML_MARKER_1 = 'Partition Granularity Sweep on 5-Node RF=3 (P=6, 15, 30, 60)';
const SWEEP_HTML_MARKER_2 = 'Parallelism Sweet Spot vs Over-Partitioning Coordination Overhead';
const RTT_WS_MD_MARKER_1 = 'Network RTT crossover across Scenario B graph shapes (0.2 ms LAN to 30 ms WAN)';
const RTT_WS_MD_MARKER_2 = 'Working-set growth (moderate 64-event vs heavy-correlation 2048-event histories)';
const RTT_WS_HTML_MARKER_1 = 'Network RTT Crossover Across Scenario B Graph Shapes (0.2 ms LAN to 30 ms WAN)';
const RTT_WS_HTML_MARKER_2 = 'Working-Set Growth (Moderate 64-Event vs Heavy-Correlation 2048-Event Histories)';
const MOVE_SC_MD_MARKER_1 = 'Live partition movement under steady load (pre-move, during-move, post-move)';
const MOVE_SC_MD_MARKER_2 = 'Scenario C joint scaling (5x ingestion, active entities, and decision load)';
const MOVE_SC_MD_MARKER_3 = 'Architectural operating-boundary map (where each system wins)';
const MOVE_SC_HTML_MARKER_1 = 'Live Partition Movement Under Steady Load (Pre-Move, During-Move, Post-Move)';
const MOVE_SC_HTML_MARKER_2 = 'Scenario C Joint Scaling (5x Ingestion, Active Entities, and Decision Load)';
const MOVE_SC_HTML_MARKER_3 = 'Architectural Operating-Boundary Map (Where Each System Wins)';
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), PARENT_DIR, PARENT_DIR,
);

function verifyEpic(rootDir) {
  const epic = readEpic(rootDir, SCALEOUT_SERIES_EPIC_ID);
  assert.ok(epic); assert.equal(epicProblems(epic.front).length, NUM_ZERO);
  assert.equal(epic.front.quests.length, TOTAL_SCALEOUT_SERIES_SLICES);
  assert.equal(epic.front.status, EXPECTED_EPIC_STATUS);
}

function verifyMatrixScaleoutSeries(matrix) {
  const s = matrix.scaleoutSeries;
  assert.ok(s); assert.equal(s.epicId, SCALEOUT_SERIES_EPIC_ID);
  assert.equal(s.totalSlices, TOTAL_SCALEOUT_SERIES_SLICES);
  assert.equal(s.completedSlices.length, EXPECTED_COMPLETED_SLICES_COUNT);
  for (const id of [
    FIRST_SLICE_ID, SECOND_SLICE_ID, THIRD_SLICE_ID, FOURTH_SLICE_ID, FIFTH_SLICE_ID,
  ]) {
    assert.equal(arrayIncludes(s.completedSlices, id), true);
  }
  assert.equal(s.remainingSlicesCount, EXPECTED_REMAINING_SLICES_COUNT);
  assert.equal(Array.isArray(matrix.lagrangeEvolutionTimeline), true);
  assert.equal(matrix.lagrangeEvolutionTimeline.length >= NUM_TEN, true);
}

function verifyExpPair(builder, expObj, checkFn) {
  assert.equal(typeof builder, TYPE_FUNCTION); checkFn(builder()); checkFn(expObj);
}

function verifyScaleoutExperiments(matrix) {
  verifyExpPair(buildScaleout3To5Rf3Experiment, matrix.scaleout3To5Rf3Experiment, (exp) => {
    assert.ok(exp); assert.equal(exp.replicationFactor, NUM_THREE);
    assert.equal(exp.replicaCoverageByNodes[NODE_3].replicaCoveragePct, COV_100);
    assert.equal(exp.replicaCoverageByNodes[NODE_5].replicaCoveragePct, COV_60);
    assert.equal(exp.scenarioAModes[MODE_FIXED].length > NUM_ZERO, true);
    assert.equal(exp.scenarioAModes[MODE_GROWTH].length > NUM_ZERO, true);
    assert.equal(exp.scenarioAModes[MODE_HOT].length > NUM_ZERO, true);
  });
  verifyExpPair(buildPartitionGranularitySweepExperiment,
    matrix.partitionGranularitySweepExperiment, (exp) => {
      assert.ok(exp); assert.equal(exp.experimentId, THIRD_SLICE_ID);
      assert.equal(exp.nodeCount, NUM_FIVE); assert.equal(exp.replicationFactor, NUM_THREE);
      assert.equal(exp.partitionCounts.length, NUM_FOUR);
      assert.equal(exp.partitionPoints.length, NUM_FOUR);
      assert.equal(exp.targets.length, NUM_FIVE);
      for (const t of exp.targets) {
        assert.ok(t.optimalPartitions !== undefined); assert.equal(t.series.length, NUM_FOUR);
      }
    });
  verifyExpPair(buildScenarioBRttWorkingSetExperiment,
    matrix.scenarioBRttWorkingSetExperiment, (exp) => {
      assert.ok(exp); assert.equal(exp.experimentId, FOURTH_SLICE_ID);
      assert.equal(exp.nodeCount, NUM_FIVE); assert.equal(exp.replicationFactor, NUM_THREE);
      assert.equal(exp.rttPointsMs.length, NUM_FOUR);
      assert.equal(exp.sequentialRttSeries.length, NUM_SIX);
      assert.equal(exp.workingSetComparison.length, NUM_SIX);
    });
  verifyExpPair(buildLiveMovementAndScenarioCScalingExperiment,
    matrix.liveMovementAndScenarioCScalingExperiment, (exp) => {
      assert.ok(exp); assert.equal(exp.experimentId, FIFTH_SLICE_ID);
      assert.equal(exp.nodeCount, NUM_FIVE); assert.equal(exp.replicationFactor, NUM_THREE);
      assert.equal(exp.liveMovementPhases.length, NUM_FIVE);
      assert.equal(exp.scenarioCJointScaling.length, NUM_FIVE);
      assert.equal(exp.operatingBoundaryMap.length, NUM_FIVE);
    });
}

function verifyHistoryProvenance(rootDir) {
  const historyPath = path.resolve(rootDir, DEFAULT_COMPARISON_HISTORY_NDJSON_PATH);
  assert.equal(fs.existsSync(historyPath), true);
  const records = parseComparisonHistoryNdjson(fs.readFileSync(historyPath, UTF8));
  const scenBRecords = arrayFilter(records, (r) => r.framework?.scenarioId === SCENARIO_B_ID);
  assert.equal(scenBRecords.length > NUM_ZERO, true);
  for (const r of scenBRecords) {
    assert.equal(r.evidenceSource?.kind, KIND_LOCAL_ORACLE);
    assert.equal(r.framework?.comparisonView, VIEW_CONTRACT_MODEL);
    assert.notEqual(r.evidenceSource?.timingSource, FORBIDDEN_TIMING_SOURCE);
    assert.notEqual(r.framework?.comparisonView, FORBIDDEN_VIEW_NATIVE);
  }
}

function verifyTargetProvenance(matrix) {
  assert.equal(Array.isArray(matrix.targets), true);
  for (const t of matrix.targets) {
    assert.ok(t.scenarioA?.measurementProvenance && t.scenarioB?.measurementProvenance);
    for (const scen of [t.scenarioA, t.scenarioB]) {
      if (scen.evidenceTier === TIER_OBSERVED_DOCKER) {
        assert.equal(scen.measurementProvenance.executionPath, PATH_LIVE_WIRE);
        assert.equal(scen.measurementProvenance.comparableClusterEvidence, true);
      }
    }
    if (t.targetId === TARGET_LAGRANGE || t.targetId === TARGET_TIDB) {
      assert.equal(t.scenarioB.evidenceTier, TIER_MODELED_ORACLE);
      assert.equal(t.scenarioB.measurementProvenance.executionPath, PATH_LOCAL_ORACLE);
      assert.equal(t.scenarioB.measurementProvenance.comparableClusterEvidence, false);
    }
  }
}

function verifyFileMarkers(rootDir, relPath, markers) {
  const content = fs.readFileSync(path.resolve(rootDir, relPath), UTF8);
  for (const m of markers) assert.equal(stringIncludes(content, m), true);
}

function verifyArtifactTriad(rootDir, matrix, writer, triad) {
  assert.equal(typeof writer, TYPE_FUNCTION);
  for (const [fn, rel] of triad) {
    const abs = path.resolve(rootDir, rel);
    assert.equal(fs.existsSync(abs), true); assert.equal(fs.readFileSync(abs, UTF8), fn(matrix));
  }
}

function verifyLandingLinks(rootDir, mdPath, htmlPath, extraMarkers = []) {
  const targets = [path.basename(mdPath), path.basename(htmlPath), ...extraMarkers];
  for (const rel of [LANDING_MD_PATH, LANDING_HTML_PATH]) verifyFileMarkers(rootDir, rel, targets);
}

function verifyArtifactBundle(rootDir, matrix, writer, triad, markersMd, markersHtml) {
  if (typeof writer === TYPE_OBJECT) {
    const o = writer;
    const t = [[o.mdRender, o.mdPath], [o.htmlRender, o.htmlPath], [o.svgRender, o.svgPath]];
    verifyArtifactTriad(rootDir, matrix, o.writeFn, t);
    verifyFileMarkers(rootDir, o.mdPath, o.mdMarkers);
    verifyFileMarkers(rootDir, o.htmlPath, o.htmlMarkers);
    verifyLandingLinks(rootDir, o.mdPath, o.htmlPath); return;
  }
  verifyArtifactTriad(rootDir, matrix, writer, triad);
  verifyFileMarkers(rootDir, triad[NUM_ZERO][NUM_ONE], markersMd);
  verifyFileMarkers(rootDir, triad[NUM_ONE][NUM_ONE], markersHtml);
  verifyLandingLinks(rootDir, triad[NUM_ZERO][NUM_ONE], triad[NUM_ONE][NUM_ONE]);
}

function verifyAllArtifactBundles(rootDir, matrix) {
  verifyArtifactTriad(rootDir, matrix, writeLagrangeEvolutionStaticWebArtifacts, [
    [renderLagrangeEvolutionMarkdown, DEFAULT_LAGRANGE_EVOLUTION_MD_PATH],
    [renderLagrangeEvolutionHtml, DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH],
    [renderLagrangeEvolutionSvg, DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH]]);
  verifyLandingLinks(rootDir, DEFAULT_LAGRANGE_EVOLUTION_MD_PATH,
    DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH,
    [path.basename(DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH), KIND_LOCAL_ORACLE]);
  verifyFileMarkers(rootDir, LANDING_MD_PATH, [MARKER_PROVENANCE_SECTION_MD]);
  verifyFileMarkers(rootDir, LANDING_HTML_PATH, [MARKER_PROVENANCE_SECTION_HTML]);
  const bundles = [
    [writeScaleout3To5ComparisonStaticWebArtifacts, [
      [renderScaleout3To5ComparisonMarkdown, DEFAULT_SCALEOUT_3TO5_MD_PATH],
      [renderScaleout3To5ComparisonHtml, DEFAULT_SCALEOUT_3TO5_HTML_PATH],
      [renderScaleout3To5ComparisonSvg, DEFAULT_SCALEOUT_3TO5_SVG_PATH]],
    [MARKER_REPLICA_COVERAGE_MD, MARKER_SCENARIO_A_MODES_MD],
    [MARKER_REPLICA_COVERAGE_HTML, MARKER_SCENARIO_A_MODES_HTML]],
    [writePartitionGranularityComparisonStaticWebArtifacts, [
      [renderPartitionGranularityComparisonMarkdown, DEFAULT_PARTITION_SWEEP_MD_PATH],
      [renderPartitionGranularityComparisonHtml, DEFAULT_PARTITION_SWEEP_HTML_PATH],
      [renderPartitionGranularityComparisonSvg, DEFAULT_PARTITION_SWEEP_SVG_PATH]],
    [SWEEP_MD_MARKER_1, SWEEP_MD_MARKER_2], [SWEEP_HTML_MARKER_1, SWEEP_HTML_MARKER_2]],
    [writeScenarioBRttWorkingSetStaticWebArtifacts, [
      [renderScenarioBRttWorkingSetMarkdown, DEFAULT_RTT_WORKING_SET_MD_PATH],
      [renderScenarioBRttWorkingSetHtml, DEFAULT_RTT_WORKING_SET_HTML_PATH],
      [renderScenarioBRttWorkingSetSvg, DEFAULT_RTT_WORKING_SET_SVG_PATH]],
    [RTT_WS_MD_MARKER_1, RTT_WS_MD_MARKER_2], [RTT_WS_HTML_MARKER_1, RTT_WS_HTML_MARKER_2]],
  ];
  for (const [w, triad, mdM, htmlM] of bundles) {
    verifyArtifactBundle(rootDir, matrix, w, triad, mdM, htmlM);
  }
  verifyArtifactBundle(rootDir, matrix, {
    writeFn: writeMovementScenarioCScalingStaticWebArtifacts,
    mdRender: renderMovementScenarioCScalingMarkdown,
    htmlRender: renderMovementScenarioCScalingHtml, svgRender: renderMovementScenarioCScalingSvg,
    mdPath: DEFAULT_MOVEMENT_SCENARIO_C_MD_PATH, htmlPath: DEFAULT_MOVEMENT_SCENARIO_C_HTML_PATH,
    svgPath: DEFAULT_MOVEMENT_SCENARIO_C_SVG_PATH,
    mdMarkers: [MOVE_SC_MD_MARKER_1, MOVE_SC_MD_MARKER_2, MOVE_SC_MD_MARKER_3],
    htmlMarkers: [MOVE_SC_HTML_MARKER_1, MOVE_SC_HTML_MARKER_2, MOVE_SC_HTML_MARKER_3],
  });
}

export async function runDistributedScaleoutProvenanceGuard(rootDir = REPO_ROOT) {
  verifyEpic(rootDir);
  assert.equal(typeof runModeledScenarioBHarnessComparison, TYPE_FUNCTION);
  assert.equal(buildLagrangeEvolutionTimeline().length >= NUM_TEN, true);
  const matrixPath = path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  assert.equal(fs.existsSync(matrixPath), true);
  const matrix = await readMultiSystemComparativeMatrix({rootDir, matrixPath});
  verifyMatrixScaleoutSeries(matrix); verifyScaleoutExperiments(matrix);
  verifyHistoryProvenance(rootDir); verifyTargetProvenance(matrix);
  verifyAllArtifactBundles(rootDir, matrix);
  return {
    ok: true,
    remainingSlicesCount: matrix.scaleoutSeries.remainingSlicesCount,
    completedSlicesCount: matrix.scaleoutSeries.completedSlices.length,
  };
}

const isDirectCli = process.argv[NUM_ONE] &&
  path.resolve(process.argv[NUM_ONE]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  const result = await runDistributedScaleoutProvenanceGuard();
  if (arrayIncludes(process.argv, FLAG_METRIC)) {
    process.stdout.write(`${result.remainingSlicesCount}${NEWLINE}`);
    process.exitCode = result.remainingSlicesCount === NUM_ZERO ? NUM_ZERO : NUM_ONE;
  } else {
    process.stdout.write(PASS_MESSAGE);
  }
}
