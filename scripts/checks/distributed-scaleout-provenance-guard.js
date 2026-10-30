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
  SCALEOUT_SERIES_EPIC_ID,
  TOTAL_SCALEOUT_SERIES_SLICES,
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH,
  readMultiSystemComparativeMatrix,
  buildLagrangeEvolutionTimeline,
} from '../../test/distributed/harness/comparative-matrix-runner.js';
import {
  DEFAULT_LAGRANGE_EVOLUTION_MD_PATH,
  DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH,
  DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH,
  renderLagrangeEvolutionMarkdown,
  renderLagrangeEvolutionHtml,
  renderLagrangeEvolutionSvg,
  writeLagrangeEvolutionStaticWebArtifacts,
} from '../../test/distributed/harness/lagrange-evolution-static-web.js';
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
const NUM_SIX = 6;

const EXPECTED_COMPLETED_SLICES_COUNT = 1;
const EXPECTED_REMAINING_SLICES_COUNT = 4;
const EXPECTED_COMPLETED_SLICE_NAME = 'provenance-audit-and-evidence-tier-separation';

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

const ERR_EPIC_NOT_FOUND = 'Scale-out series epic must exist';
const ERR_HISTORY_NOT_FOUND = 'Comparison history ndjson must exist';
const ERR_MATRIX_NOT_FOUND = 'Multi-system comparative matrix must exist';
const ERR_SCENARIO_B_HISTORY_EMPTY = 'Scenario B history records must not be empty';
const ERR_TARGETS_NOT_ARRAY = 'Matrix targets must be an array';
const ERR_TIMELINE_NOT_ARRAY = 'Lagrange evolution timeline must be an array';

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
  assert.equal(matrix.scaleoutSeries.remainingSlicesCount, EXPECTED_REMAINING_SLICES_COUNT);
  assert.equal(Array.isArray(matrix.lagrangeEvolutionTimeline), true, ERR_TIMELINE_NOT_ARRAY);
  assert.equal(matrix.lagrangeEvolutionTimeline.length >= NUM_SIX, true);
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

export async function runDistributedScaleoutProvenanceGuard(rootDir = REPO_ROOT) {
  verifyEpic(rootDir);
  assert.equal(typeof runModeledScenarioBHarnessComparison, TYPE_FUNCTION);
  assert.equal(buildLagrangeEvolutionTimeline().length >= NUM_SIX, true);
  const matrixPath = path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  assert.equal(fs.existsSync(matrixPath), true, ERR_MATRIX_NOT_FOUND);
  const matrix = await readMultiSystemComparativeMatrix({rootDir, matrixPath});
  verifyMatrixScaleoutSeries(matrix);
  verifyHistoryProvenance(rootDir);
  verifyTargetProvenance(matrix);
  verifyLagrangeEvolutionArtifacts(rootDir, matrix);
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
