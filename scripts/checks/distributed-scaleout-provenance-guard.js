import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {readEpic} from '../solve/store.js';
import {epicProblems} from '../solve/schema.js';
import {
  parseComparisonHistoryNdjson,
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {
  SCALEOUT_SERIES_EPIC_ID, TOTAL_SCALEOUT_SERIES_SLICES,
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH, readMultiSystemComparativeMatrix,
  buildLagrangeEvolutionTimeline, buildScaleout3To5Rf3Experiment,
} from '../../test/distributed/harness/comparative-matrix-runner.js';
import {
  DEFAULT_LAGRANGE_EVOLUTION_MD_PATH, DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH,
  DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH, renderLagrangeEvolutionMarkdown,
  renderLagrangeEvolutionHtml, renderLagrangeEvolutionSvg,
  writeLagrangeEvolutionStaticWebArtifacts,
} from '../../test/distributed/harness/lagrange-evolution-static-web.js';
import {
  DEFAULT_SCALEOUT_3TO5_MD_PATH, DEFAULT_SCALEOUT_3TO5_HTML_PATH,
  DEFAULT_SCALEOUT_3TO5_SVG_PATH, renderScaleout3To5ComparisonMarkdown,
  renderScaleout3To5ComparisonHtml, renderScaleout3To5ComparisonSvg,
  writeScaleout3To5ComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/scaleout-node-rf-comparison-static-web.js';
import {
  runModeledScenarioBHarnessComparison,
} from '../../test/distributed/harness/scenario-b-comparators.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8';
const TYPE_FUNCTION = 'function';
const PASS_MESSAGE = 'distributed-scaleout-provenance-guard: PASS\n';
const NEWLINE = '\n';
const FLAG_METRIC = '--metric';
const PARENT_DIR = '..';

const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_THREE = 3;
const NUM_SEVEN = 7;
const PCT_100 = 100.0;
const PCT_60 = 60.0;

const EXPECTED_COMPLETED_SLICES_COUNT = 2;
const EXPECTED_REMAINING_SLICES_COUNT = 3;
const EXPECTED_COMPLETED_SLICE_NAME = 'provenance-audit-and-evidence-tier-separation';
const EXPECTED_SLICE_TWO_NAME = 'real-3to5-node-rf3-scaleout-and-scenario-a-modes';

const SCENARIO_B_ID = 'tidb-distributed-risk-decision';
const KIND_LOCAL_ORACLE = 'local-oracle-plus-network-model';
const VIEW_CONTRACT_MODEL = 'contract-model-non-comparable';
const FORBIDDEN_TIMING_SOURCE = 'observed-harness-baseline';
const FORBIDDEN_VIEW_NATIVE = 'architecture-native';

const TIER_OBSERVED_DOCKER = 'observed-docker-cluster';
const TIER_MODELED_ORACLE = 'modeled-topology-oracle';
const PATH_LIVE_WIRE = 'live-cluster-wire';
const PATH_LOCAL_ORACLE = 'local-js-oracle';

const TARGET_LAGRANGE = 'lagrange';
const TARGET_TIDB = 'tidb-tikv';

const LANDING_MD_PATH = 'docs/benchmarks/README.md';
const LANDING_HTML_PATH = 'docs/benchmarks/index.html';
const MARKER_PROVENANCE_SECTION_MD = 'Measurement provenance and evidence-tier separation';
const MARKER_PROVENANCE_SECTION_HTML = 'Measurement Provenance and Evidence-Tier Separation';
const MARKER_LOCAL_ORACLE_MODEL = 'local-oracle-plus-network-model';

const MARKER_REPLICA_COVERAGE_MD = 'Replica-coverage transition';
const MARKER_REPLICA_COVERAGE_HTML = 'Replica-Coverage Transition';
const MARKER_SCENARIO_A_MODES_MD = 'Scenario A three-mode scale-out separation';
const MARKER_SCENARIO_A_MODES_HTML = 'Scenario A Three-Mode Scale-Out Separation';
const MODE_FIXED = 'fixed-workload-scaleout';
const MODE_GROWTH = 'proportional-growth-scaleout';
const MODE_HOT = 'hot-contention-baseline';
const NODE_3 = '3';
const NODE_5 = '5';

const ERR_EPIC_NOT_FOUND = 'Scale-out series epic must exist';
const ERR_HISTORY_NOT_FOUND = 'Comparison history ndjson must exist';
const ERR_MATRIX_NOT_FOUND = 'Multi-system comparative matrix must exist';
const ERR_SCENARIO_B_HISTORY_EMPTY = 'Scenario B history records must not be empty';
const ERR_TARGETS_NOT_ARRAY = 'Matrix targets must be an array';
const ERR_TIMELINE_NOT_ARRAY = 'Lagrange evolution timeline must be an array';
const ERR_SCALEOUT_EXP_MISSING = 'Scale-out 3-to-5 RF=3 experiment must exist';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), PARENT_DIR, PARENT_DIR,
);

function verifyEpic(rootDir) {
  const epic = readEpic(rootDir, SCALEOUT_SERIES_EPIC_ID);
  assert.ok(epic, ERR_EPIC_NOT_FOUND);
  assert.equal(epicProblems(epic.front).length, NUM_ZERO);
  assert.equal(epic.front.quests.length, TOTAL_SCALEOUT_SERIES_SLICES);
}

function verifyMatrixScaleoutSeries(matrix) {
  assert.ok(matrix.scaleoutSeries);
  assert.equal(matrix.scaleoutSeries.epicId, SCALEOUT_SERIES_EPIC_ID);
  assert.equal(matrix.scaleoutSeries.totalSlices, TOTAL_SCALEOUT_SERIES_SLICES);
  assert.equal(matrix.scaleoutSeries.completedSlices.length, EXPECTED_COMPLETED_SLICES_COUNT);
  assert.equal(
    arrayIncludes(matrix.scaleoutSeries.completedSlices, EXPECTED_COMPLETED_SLICE_NAME), true,
  );
  assert.equal(arrayIncludes(matrix.scaleoutSeries.completedSlices, EXPECTED_SLICE_TWO_NAME), true);
  assert.equal(matrix.scaleoutSeries.remainingSlicesCount, EXPECTED_REMAINING_SLICES_COUNT);
  assert.equal(Array.isArray(matrix.lagrangeEvolutionTimeline), true, ERR_TIMELINE_NOT_ARRAY);
  assert.equal(matrix.lagrangeEvolutionTimeline.length >= NUM_SEVEN, true);
}

function verifyScaleout3To5Rf3Experiment(matrix) {
  assert.equal(typeof buildScaleout3To5Rf3Experiment, TYPE_FUNCTION);
  const verifyExp = (exp) => {
    assert.ok(exp, ERR_SCALEOUT_EXP_MISSING);
    assert.equal(exp.replicationFactor === NUM_THREE, true);
    assert.equal(exp.replicaCoverageByNodes?.[NODE_3]?.replicaCoveragePct === PCT_100, true);
    assert.equal(exp.replicaCoverageByNodes?.[NODE_5]?.replicaCoveragePct === PCT_60, true);
    const m = exp.scenarioAModes || {};
    assert.equal(Array.isArray(m[MODE_FIXED]) && m[MODE_FIXED].length > NUM_ZERO, true);
    assert.equal(Array.isArray(m[MODE_GROWTH]) && m[MODE_GROWTH].length > NUM_ZERO, true);
    assert.equal(Array.isArray(m[MODE_HOT]) && m[MODE_HOT].length > NUM_ZERO, true);
  };
  verifyExp(buildScaleout3To5Rf3Experiment());
  verifyExp(matrix.scaleout3To5Rf3Experiment);
}

function verifyHistoryProvenance(rootDir) {
  const historyPath = path.resolve(rootDir, DEFAULT_COMPARISON_HISTORY_NDJSON_PATH);
  assert.equal(fs.existsSync(historyPath), true, ERR_HISTORY_NOT_FOUND);
  const records = parseComparisonHistoryNdjson(fs.readFileSync(historyPath, UTF8));
  const scenBRecords = arrayFilter(records, (r) => r.framework?.scenarioId === SCENARIO_B_ID);
  assert.equal(scenBRecords.length > NUM_ZERO, true, ERR_SCENARIO_B_HISTORY_EMPTY);
  for (const r of scenBRecords) {
    assert.equal(r.evidenceSource?.kind, KIND_LOCAL_ORACLE);
    assert.equal(r.framework?.comparisonView, VIEW_CONTRACT_MODEL);
    assert.notEqual(r.evidenceSource?.timingSource, FORBIDDEN_TIMING_SOURCE);
    assert.notEqual(r.framework?.comparisonView, FORBIDDEN_VIEW_NATIVE);
  }
}

function verifyTargetProvenance(matrix) {
  assert.equal(Array.isArray(matrix.targets), true, ERR_TARGETS_NOT_ARRAY);
  for (const t of matrix.targets) {
    assert.ok(t.scenarioA?.measurementProvenance);
    assert.ok(t.scenarioB?.measurementProvenance);
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

function verifyLagrangeEvolutionArtifacts(rootDir, matrix) {
  assert.equal(typeof writeLagrangeEvolutionStaticWebArtifacts, TYPE_FUNCTION);
  for (const [renderer, relPath] of [
    [renderLagrangeEvolutionMarkdown, DEFAULT_LAGRANGE_EVOLUTION_MD_PATH],
    [renderLagrangeEvolutionHtml, DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH],
    [renderLagrangeEvolutionSvg, DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH],
  ]) {
    const absPath = path.resolve(rootDir, relPath);
    assert.equal(fs.existsSync(absPath), true, `Evolution artifact must exist: ${absPath}`);
    assert.equal(fs.readFileSync(absPath, UTF8), renderer(matrix));
  }
  const evoMdBase = path.basename(DEFAULT_LAGRANGE_EVOLUTION_MD_PATH);
  const evoHtmlBase = path.basename(DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH);
  const evoSvgBase = path.basename(DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH);
  for (const [landingRel, sectionMarker] of [
    [LANDING_MD_PATH, MARKER_PROVENANCE_SECTION_MD],
    [LANDING_HTML_PATH, MARKER_PROVENANCE_SECTION_HTML],
  ]) {
    const landingAbs = path.resolve(rootDir, landingRel);
    assert.equal(fs.existsSync(landingAbs), true, `Landing file must exist: ${landingAbs}`);
    const content = fs.readFileSync(landingAbs, UTF8);
    assert.equal(stringIncludes(content, evoMdBase), true);
    assert.equal(stringIncludes(content, evoHtmlBase), true);
    assert.equal(stringIncludes(content, evoSvgBase), true);
    assert.equal(stringIncludes(content, sectionMarker), true);
    assert.equal(stringIncludes(content, MARKER_LOCAL_ORACLE_MODEL), true);
  }
}

function verifyScaleout3To5Artifacts(rootDir, matrix) {
  assert.equal(typeof writeScaleout3To5ComparisonStaticWebArtifacts, TYPE_FUNCTION);
  for (const [renderer, relPath] of [
    [renderScaleout3To5ComparisonMarkdown, DEFAULT_SCALEOUT_3TO5_MD_PATH],
    [renderScaleout3To5ComparisonHtml, DEFAULT_SCALEOUT_3TO5_HTML_PATH],
    [renderScaleout3To5ComparisonSvg, DEFAULT_SCALEOUT_3TO5_SVG_PATH],
  ]) {
    const absPath = path.resolve(rootDir, relPath);
    assert.equal(fs.existsSync(absPath), true, `Scaleout artifact must exist: ${absPath}`);
    assert.equal(fs.readFileSync(absPath, UTF8), renderer(matrix));
  }
  const md = fs.readFileSync(path.resolve(rootDir, DEFAULT_SCALEOUT_3TO5_MD_PATH), UTF8);
  const html = fs.readFileSync(path.resolve(rootDir, DEFAULT_SCALEOUT_3TO5_HTML_PATH), UTF8);
  assert.equal(stringIncludes(md, MARKER_REPLICA_COVERAGE_MD), true);
  assert.equal(stringIncludes(md, MARKER_SCENARIO_A_MODES_MD), true);
  assert.equal(stringIncludes(html, MARKER_REPLICA_COVERAGE_HTML), true);
  assert.equal(stringIncludes(html, MARKER_SCENARIO_A_MODES_HTML), true);
  const mdBase = path.basename(DEFAULT_SCALEOUT_3TO5_MD_PATH);
  const htmlBase = path.basename(DEFAULT_SCALEOUT_3TO5_HTML_PATH);
  for (const landingRel of [LANDING_MD_PATH, LANDING_HTML_PATH]) {
    const content = fs.readFileSync(path.resolve(rootDir, landingRel), UTF8);
    assert.equal(stringIncludes(content, mdBase), true);
    assert.equal(stringIncludes(content, htmlBase), true);
  }
}

export async function runDistributedScaleoutProvenanceGuard(rootDir = REPO_ROOT) {
  verifyEpic(rootDir);
  assert.equal(typeof runModeledScenarioBHarnessComparison, TYPE_FUNCTION);
  assert.equal(buildLagrangeEvolutionTimeline().length >= NUM_SEVEN, true);
  const matrixPath = path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  assert.equal(fs.existsSync(matrixPath), true, ERR_MATRIX_NOT_FOUND);
  const matrix = await readMultiSystemComparativeMatrix({rootDir, matrixPath});
  verifyMatrixScaleoutSeries(matrix);
  verifyScaleout3To5Rf3Experiment(matrix);
  verifyHistoryProvenance(rootDir);
  verifyTargetProvenance(matrix);
  verifyLagrangeEvolutionArtifacts(rootDir, matrix);
  verifyScaleout3To5Artifacts(rootDir, matrix);
  return {
    ok: true,
    remainingSlicesCount: matrix.scaleoutSeries.remainingSlicesCount,
    completedSlicesCount: matrix.scaleoutSeries.completedSlices.length,
  };
}

const isDirectCli = process.argv[NUM_ONE] &&
  path.resolve(process.argv[NUM_ONE]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  const isMetric = arrayIncludes(process.argv, FLAG_METRIC);
  const result = await runDistributedScaleoutProvenanceGuard();
  if (isMetric) {
    process.stdout.write(`${result.remainingSlicesCount}${NEWLINE}`);
    process.exitCode = result.remainingSlicesCount === NUM_ZERO ? NUM_ZERO : NUM_ONE;
  } else {
    process.stdout.write(PASS_MESSAGE);
  }
}
