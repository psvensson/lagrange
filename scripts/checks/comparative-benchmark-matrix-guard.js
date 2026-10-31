import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {readEpic} from '../solve/store.js';
import {epicProblems} from '../solve/schema.js';
import {
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH, EPIC_ID, MULTI_SYSTEM_MATRIX_SCHEMA, TOTAL_EPIC_SLICES,
  buildMultiSystemComparativeMatrix, readMultiSystemComparativeMatrix,
  writeMultiSystemComparativeMatrix,
} from '../../test/distributed/harness/comparative-matrix-runner.js';
import {
  DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH, DEFAULT_POSTGRESQL_PROGRESS_MD_PATH,
  DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH, renderPostgresqlComparisonHtml,
  renderPostgresqlComparisonMarkdown, renderPostgresqlComparisonSvg,
  writePostgresqlComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/postgresql-comparison-static-web.js';
import {
  DEFAULT_CITUS_PROGRESS_HTML_PATH, DEFAULT_CITUS_PROGRESS_MD_PATH,
  DEFAULT_CITUS_PROGRESS_SVG_PATH, renderCitusComparisonHtml,
  renderCitusComparisonMarkdown, renderCitusComparisonSvg, writeCitusComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/citus-comparison-static-web.js';
import {
  DEFAULT_SCENARIO_B_CROSSOVER_SVG_PATH, DEFAULT_YUGABYTE_IGNITE_PROGRESS_HTML_PATH,
  DEFAULT_YUGABYTE_IGNITE_PROGRESS_MD_PATH, DEFAULT_YUGABYTE_IGNITE_PROGRESS_SVG_PATH,
  renderScenarioBShapeCrossoverSvg, renderYugabyteIgniteComparisonHtml,
  renderYugabyteIgniteComparisonMarkdown, renderYugabyteIgniteComparisonSvg,
  writeYugabyteIgniteComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/yugabyte-ignite-comparison-static-web.js';
import {
  CANONICAL_DEFAULT_TARGETS, DEFAULT_COMPARATIVE_LANDING_HTML_PATH,
  DEFAULT_COMPARATIVE_LANDING_MD_PATH, DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH, renderComparativeLandingHtml,
  renderComparativeLandingMarkdown, renderComparativeOverviewSvg,
  renderScenarioSetupBreakdownSvg, writeComparativeLandingArtifacts,
} from '../../test/distributed/harness/comparative-landing-page.js';
import {
  DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH, DEFAULT_SCENARIO_C_PROGRESS_MD_PATH,
  DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH, renderScenarioCComparisonHtml,
  renderScenarioCComparisonMarkdown, renderScenarioCComparisonSvg,
  writeScenarioCComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/scenario-c-comparison-static-web.js';
import {runScenarioCRollupComparison} from '../../test/distributed/harness/scenario-c-rollup-comparator.js';
import {runDistributedScaleoutProvenanceGuard} from './distributed-scaleout-provenance-guard.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8'; const TYPE_FUNCTION = 'function'; const PASS_MESSAGE = 'comparative-benchmark-matrix-guard: PASS\n';
const NEWLINE = '\n'; const FLAG_METRIC = '--metric'; const PARENT_DIR = '..';
const TARGET_LAGRANGE = 'lagrange'; const TARGET_LAGRANGE_5NODE = 'lagrange-5node-rf3';
const TARGET_TIDB = 'tidb-tikv'; const TARGET_PG_SINGLE = 'pg-single-primary';
const TARGET_PG_PATRONI = 'pg-patroni-sync-ha-rf3';
const TARGET_PG_PLPGSQL_SINGLE = 'pg-plpgsql-single-primary';
const TARGET_PG_PLPGSQL_PATRONI = 'pg-plpgsql-sync-ha-rf3';
const TARGET_CITUS_SQL = 'citus-sql-service'; const TARGET_CITUS_UDF = 'citus-distributed-function';
const TARGET_YUGABYTE_YSQL = 'yugabytedb-ysql-rf3'; const TARGET_YUGABYTE_PROC = 'yugabytedb-stored-proc';
const TARGET_IGNITE_COMPUTE = 'ignite3-colocated-compute';
const TARGET_PG_VALKEY_SYNC = 'pg-valkey-sync-write-through';
const TARGET_PG_VALKEY_ASYNC = 'pg-valkey-async-stream';
const REQUIRED_TARGET_IDS = Object.freeze([
  TARGET_LAGRANGE, TARGET_LAGRANGE_5NODE, TARGET_TIDB, TARGET_PG_SINGLE, TARGET_PG_PATRONI,
  TARGET_PG_PLPGSQL_SINGLE, TARGET_PG_PLPGSQL_PATRONI, TARGET_CITUS_SQL, TARGET_CITUS_UDF,
  TARGET_YUGABYTE_YSQL, TARGET_YUGABYTE_PROC, TARGET_IGNITE_COMPUTE,
  TARGET_PG_VALKEY_SYNC, TARGET_PG_VALKEY_ASYNC,
]);
const EXPECTED_COMPLETED_SLICES = 5; const EXPECTED_REMAINING_SLICES = 0;
const MARKER_LOCALITY_CONTROL_MD = 'Three-way locality control'; const MARKER_LOCALITY_CONTROL_HTML = 'Three-Way Locality Control';
const MARKER_CITUS_LOCALITY_MD = 'Entity-locality progression'; const MARKER_CITUS_LOCALITY_HTML = 'Entity-Locality Progression';
const MARKER_IGNITE_COLOCATED_MD = 'Colocated compute comparison'; const MARKER_IGNITE_COLOCATED_HTML = 'Colocated Compute Comparison';
const MARKER_SCENARIO_C_FRESHNESS_MD = 'Feature-freshness SLA tradeoff'; const MARKER_SCENARIO_C_FRESHNESS_HTML = 'Feature-Freshness SLA Tradeoff';
const SHAPE_LOCAL_ONLY = 'local-only'; const SHAPE_ONE_REMOTE = 'one-remote-stage';
const SHAPE_SEQUENTIAL = 'sequential'; const SHAPE_FAN_OUT = 'fan-out';
const REQUIRED_SHAPE_IDS = Object.freeze([
  SHAPE_LOCAL_ONLY, SHAPE_ONE_REMOTE, SHAPE_SEQUENTIAL, SHAPE_FAN_OUT,
]);
const LINK_SCENARIO_A = 'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline';
const LINK_SCENARIO_B = 'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision';
const LINK_SCENARIO_C = 'tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision';
const LINK_TIDB_PROGRESS = 'tidb-comparison-progress.md';
const LINK_POSTGRES_PROGRESS = 'postgresql-comparison-progress.md';
const LINK_CITUS_PROGRESS = 'citus-comparison-progress.md';
const LINK_YUGABYTE_IGNITE_PROGRESS = 'yugabyte-ignite-comparison-progress.md';
const LINK_SCENARIO_C_PROGRESS = 'scenario-c-feature-store-progress.md';
const LINK_CROSSOVER_SVG = 'scenario-b-shape-crossover.svg';
const LINK_SETUP_BREAKDOWN_SVG = 'scenario-setup-time-breakdown.svg';
const README_PATH = 'README.md'; const DOCS_README_PATH = 'docs/README.md';
const LINK_BENCHMARKS_README = 'benchmarks/README.md'; const LINK_BENCHMARKS_INDEX = 'benchmarks/index.html';
const ERR_TARGETS_MISSING = 'All required targets must be present';
const ERR_ROOT_README_MISSING = 'README.md must exist'; const ERR_DOCS_README_MISSING = 'docs/README.md must exist';
const ERR_EPIC_PREFIX = 'Epic '; const ERR_EPIC_SUFFIX = ' must exist';
const ERR_TARGET_PREFIX = 'Target '; const ERR_TARGET_SCEN_A = ' must define scenarioA';
const ERR_TARGET_SHAPES_DEF = ' must define scenarioB.shapes';
const ERR_TARGET_SHAPES_REQ = ' must define all required shapes';
const ERR_FILE_PREFIX = 'File must exist on disk: '; const ERR_MATRIX_PREFIX = 'Matrix file must exist: ';
const NUM_ZERO = 0; const NUM_ONE = 1;

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), PARENT_DIR, PARENT_DIR,
);

function verifyEpicDefinition(rootDir) {
  const epic = readEpic(rootDir, EPIC_ID);
  assert.ok(epic, `${ERR_EPIC_PREFIX}${EPIC_ID}${ERR_EPIC_SUFFIX}`);
  assert.equal(epicProblems(epic.front).length, NUM_ZERO);
  assert.equal(epic.front.quests.length, TOTAL_EPIC_SLICES);
}

function verifyComparativeMatrix(matrix) {
  assert.equal(matrix.schema, MULTI_SYSTEM_MATRIX_SCHEMA);
  assert.equal(matrix.epicId, EPIC_ID);
  assert.equal(matrix.completedSlices.length + matrix.remainingSlicesCount, TOTAL_EPIC_SLICES);
  assert.equal(matrix.completedSlices.length, EXPECTED_COMPLETED_SLICES);
  assert.equal(matrix.remainingSlicesCount, EXPECTED_REMAINING_SLICES);
  const targetIds = arrayMap(matrix.targets, (t) => t.targetId);
  const allTargetsValid = arrayEvery(REQUIRED_TARGET_IDS, (id) => arrayIncludes(targetIds, id));
  assert.equal(allTargetsValid, true, ERR_TARGETS_MISSING);
  for (const target of matrix.targets) {
    assert.ok(target.scenarioA, `${ERR_TARGET_PREFIX}${target.targetId}${ERR_TARGET_SCEN_A}`);
    assert.ok(target.scenarioB?.shapes, `${ERR_TARGET_PREFIX}${target.targetId}${ERR_TARGET_SHAPES_DEF}`);
    const allShapes = arrayEvery(REQUIRED_SHAPE_IDS, (s) => Boolean(target.scenarioB.shapes[s]));
    assert.equal(allShapes, true, `${ERR_TARGET_PREFIX}${target.targetId}${ERR_TARGET_SHAPES_REQ}`);
  }
}

function verifyBenchmarkDocumentsAndLinks(rootDir) {
  const docRelPaths = [
    DEFAULT_COMPARATIVE_LANDING_MD_PATH, DEFAULT_COMPARATIVE_LANDING_HTML_PATH,
    DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH, DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH,
    DEFAULT_POSTGRESQL_PROGRESS_MD_PATH, DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH,
    DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH, DEFAULT_CITUS_PROGRESS_MD_PATH,
    DEFAULT_CITUS_PROGRESS_HTML_PATH, DEFAULT_CITUS_PROGRESS_SVG_PATH,
    DEFAULT_YUGABYTE_IGNITE_PROGRESS_MD_PATH, DEFAULT_YUGABYTE_IGNITE_PROGRESS_HTML_PATH,
    DEFAULT_YUGABYTE_IGNITE_PROGRESS_SVG_PATH, DEFAULT_SCENARIO_C_PROGRESS_MD_PATH,
    DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH, DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH,
    DEFAULT_SCENARIO_B_CROSSOVER_SVG_PATH,
  ];
  const contents = {};
  for (const relPath of docRelPaths) {
    const absPath = path.resolve(rootDir, relPath);
    assert.equal(fs.existsSync(absPath), true, `${ERR_FILE_PREFIX}${absPath}`);
    const text = fs.readFileSync(absPath, UTF8);
    assert.equal(stringIncludes(text, LINK_SCENARIO_A), true);
    assert.equal(stringIncludes(text, LINK_SCENARIO_B), true);
    contents[relPath] = text;
  }

  const landingMd = contents[DEFAULT_COMPARATIVE_LANDING_MD_PATH];
  const landingHtml = contents[DEFAULT_COMPARATIVE_LANDING_HTML_PATH];
  const pgMd = contents[DEFAULT_POSTGRESQL_PROGRESS_MD_PATH];
  const pgHtml = contents[DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH];
  const citusMd = contents[DEFAULT_CITUS_PROGRESS_MD_PATH];
  const citusHtml = contents[DEFAULT_CITUS_PROGRESS_HTML_PATH];
  const ybMd = contents[DEFAULT_YUGABYTE_IGNITE_PROGRESS_MD_PATH];
  const ybHtml = contents[DEFAULT_YUGABYTE_IGNITE_PROGRESS_HTML_PATH];
  const scMd = contents[DEFAULT_SCENARIO_C_PROGRESS_MD_PATH];
  const scHtml = contents[DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH];
  const scSvg = contents[DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH];

  for (const link of [
    LINK_TIDB_PROGRESS, LINK_POSTGRES_PROGRESS, LINK_CITUS_PROGRESS,
    LINK_YUGABYTE_IGNITE_PROGRESS, LINK_SCENARIO_C_PROGRESS, LINK_CROSSOVER_SVG,
    LINK_SETUP_BREAKDOWN_SVG, LINK_SCENARIO_C,
  ]) {
    assert.equal(stringIncludes(landingMd, link), true);
    assert.equal(stringIncludes(landingHtml, link), true);
  }
  for (const scDoc of [scMd, scHtml, scSvg]) {
    assert.equal(stringIncludes(scDoc, LINK_SCENARIO_C), true);
  }
  for (const [docs, markers] of [
    [[pgMd, pgHtml], [TARGET_PG_PLPGSQL_SINGLE, TARGET_PG_PLPGSQL_PATRONI]],
    [[citusMd, citusHtml], [TARGET_CITUS_SQL, TARGET_CITUS_UDF]],
    [[ybMd, ybHtml], [
      TARGET_YUGABYTE_YSQL, TARGET_YUGABYTE_PROC, TARGET_IGNITE_COMPUTE, LINK_CROSSOVER_SVG,
    ]],
    [[scMd, scHtml], [TARGET_PG_VALKEY_SYNC, TARGET_PG_VALKEY_ASYNC]],
  ]) {
    for (const doc of docs) {
      for (const marker of markers) {
        assert.equal(stringIncludes(doc, marker), true);
      }
    }
  }
  for (const [doc, marker] of [
    [pgMd, LINK_TIDB_PROGRESS],
    [pgMd, MARKER_LOCALITY_CONTROL_MD], [pgHtml, MARKER_LOCALITY_CONTROL_HTML],
    [citusMd, MARKER_CITUS_LOCALITY_MD], [citusHtml, MARKER_CITUS_LOCALITY_HTML],
    [ybMd, MARKER_IGNITE_COLOCATED_MD], [ybHtml, MARKER_IGNITE_COLOCATED_HTML],
    [scMd, MARKER_SCENARIO_C_FRESHNESS_MD], [scHtml, MARKER_SCENARIO_C_FRESHNESS_HTML],
  ]) {
    assert.equal(stringIncludes(doc, marker), true);
  }
  for (const [docFile, errMsg] of [
    [README_PATH, ERR_ROOT_README_MISSING],
    [DOCS_README_PATH, ERR_DOCS_README_MISSING],
  ]) {
    const abs = path.resolve(rootDir, docFile);
    assert.equal(fs.existsSync(abs), true, errMsg);
    const text = fs.readFileSync(abs, UTF8);
    assert.equal(stringIncludes(text, LINK_BENCHMARKS_README), true);
    assert.equal(stringIncludes(text, LINK_BENCHMARKS_INDEX), true);
  }
}

function verifyHarnessRendererParity(rootDir, matrix) {
  const defaultMatrix = buildMultiSystemComparativeMatrix();
  assert.equal(defaultMatrix.schema, MULTI_SYSTEM_MATRIX_SCHEMA);
  assert.equal(defaultMatrix.epicId, EPIC_ID);
  assert.equal(defaultMatrix.totalSlices, TOTAL_EPIC_SLICES);
  assert.equal(Array.isArray(CANONICAL_DEFAULT_TARGETS), true);
  for (const fn of [
    writeMultiSystemComparativeMatrix, writePostgresqlComparisonStaticWebArtifacts,
    writeCitusComparisonStaticWebArtifacts, writeYugabyteIgniteComparisonStaticWebArtifacts,
    writeScenarioCComparisonStaticWebArtifacts, writeComparativeLandingArtifacts,
  ]) {
    assert.equal(typeof fn, TYPE_FUNCTION);
  }

  const testMatrix = matrix || defaultMatrix;
  for (const [renderer, relPath] of [
    [renderPostgresqlComparisonMarkdown, DEFAULT_POSTGRESQL_PROGRESS_MD_PATH],
    [renderPostgresqlComparisonHtml, DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH],
    [renderPostgresqlComparisonSvg, DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH],
    [renderCitusComparisonMarkdown, DEFAULT_CITUS_PROGRESS_MD_PATH],
    [renderCitusComparisonHtml, DEFAULT_CITUS_PROGRESS_HTML_PATH],
    [renderCitusComparisonSvg, DEFAULT_CITUS_PROGRESS_SVG_PATH],
    [renderYugabyteIgniteComparisonMarkdown, DEFAULT_YUGABYTE_IGNITE_PROGRESS_MD_PATH],
    [renderYugabyteIgniteComparisonHtml, DEFAULT_YUGABYTE_IGNITE_PROGRESS_HTML_PATH],
    [renderYugabyteIgniteComparisonSvg, DEFAULT_YUGABYTE_IGNITE_PROGRESS_SVG_PATH],
    [renderScenarioCComparisonMarkdown, DEFAULT_SCENARIO_C_PROGRESS_MD_PATH],
    [renderScenarioCComparisonHtml, DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH],
    [renderScenarioCComparisonSvg, DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH],
    [renderScenarioBShapeCrossoverSvg, DEFAULT_SCENARIO_B_CROSSOVER_SVG_PATH],
    [renderComparativeLandingMarkdown, DEFAULT_COMPARATIVE_LANDING_MD_PATH],
    [renderComparativeLandingHtml, DEFAULT_COMPARATIVE_LANDING_HTML_PATH],
    [renderComparativeOverviewSvg, DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH],
    [renderScenarioSetupBreakdownSvg, DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH],
  ]) {
    assert.equal(renderer(testMatrix), fs.readFileSync(path.resolve(rootDir, relPath), UTF8));
  }
}

export async function runComparativeBenchmarkMatrixGuard(rootDir = REPO_ROOT) {
  verifyEpicDefinition(rootDir);
  const matrixPath = path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  assert.equal(fs.existsSync(matrixPath), true, `${ERR_MATRIX_PREFIX}${matrixPath}`);
  const matrix = await readMultiSystemComparativeMatrix({rootDir, matrixPath});
  verifyComparativeMatrix(matrix);
  verifyBenchmarkDocumentsAndLinks(rootDir);
  verifyHarnessRendererParity(rootDir, matrix);
  const rollupReport = runScenarioCRollupComparison();
  assert.equal(rollupReport.parityMismatches, NUM_ZERO);
  assert.equal(rollupReport.staleReads, NUM_ZERO);
  assert.equal(rollupReport.decisionDowntimeMs, NUM_ZERO);
  assert.equal(rollupReport.wanBytesTransferred, NUM_ZERO);
  assert.equal(rollupReport.rollupBucketsScannedTotal < rollupReport.rawEventsScannedTotal, true);
  await runDistributedScaleoutProvenanceGuard(rootDir);
  return {
    ok: true,
    remainingSlicesCount: matrix.remainingSlicesCount,
    completedSlicesCount: matrix.completedSlices.length,
  };
}

const isDirectCli = process.argv[NUM_ONE] &&
  path.resolve(process.argv[NUM_ONE]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  const result = await runComparativeBenchmarkMatrixGuard();
  const isMetric = arrayIncludes(process.argv, FLAG_METRIC);
  process.stdout.write(isMetric ? `${result.remainingSlicesCount}${NEWLINE}` : PASS_MESSAGE);
  if (isMetric) process.exitCode = result.remainingSlicesCount === NUM_ZERO ? NUM_ZERO : NUM_ONE;
}
