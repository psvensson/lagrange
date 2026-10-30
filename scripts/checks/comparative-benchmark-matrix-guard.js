import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {readEpic} from '../solve/store.js';
import {epicProblems} from '../solve/schema.js';
import {
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH,
  EPIC_ID,
  MULTI_SYSTEM_MATRIX_SCHEMA,
  TOTAL_EPIC_SLICES,
  buildMultiSystemComparativeMatrix,
  readMultiSystemComparativeMatrix,
} from '../../test/distributed/harness/comparative-matrix-runner.js';
import {
  DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH,
  DEFAULT_POSTGRESQL_PROGRESS_MD_PATH,
  DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH,
  renderPostgresqlComparisonHtml,
  renderPostgresqlComparisonMarkdown,
  renderPostgresqlComparisonSvg,
} from '../../test/distributed/harness/postgresql-comparison-static-web.js';
import {
  DEFAULT_COMPARATIVE_LANDING_HTML_PATH,
  DEFAULT_COMPARATIVE_LANDING_MD_PATH,
  DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  renderComparativeLandingHtml,
  renderComparativeLandingMarkdown,
  renderComparativeOverviewSvg,
} from '../../test/distributed/harness/comparative-landing-page.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8';
const PASS_MESSAGE = 'comparative-benchmark-matrix-guard: PASS\n';
const NEWLINE = '\n';
const FLAG_METRIC = '--metric';
const PARENT_DIR = '..';

const TARGET_LAGRANGE = 'lagrange';
const TARGET_TIDB = 'tidb-tikv';
const TARGET_PG_SINGLE = 'pg-single-primary';
const TARGET_PG_PATRONI = 'pg-patroni-sync-ha-rf3';
const TARGET_PG_PLPGSQL_SINGLE = 'pg-plpgsql-single-primary';
const TARGET_PG_PLPGSQL_PATRONI = 'pg-plpgsql-sync-ha-rf3';
const REQUIRED_TARGET_IDS = Object.freeze([
  TARGET_LAGRANGE,
  TARGET_TIDB,
  TARGET_PG_SINGLE,
  TARGET_PG_PATRONI,
  TARGET_PG_PLPGSQL_SINGLE,
  TARGET_PG_PLPGSQL_PATRONI,
]);

const EXPECTED_COMPLETED_SLICES = 2;
const EXPECTED_REMAINING_SLICES = 3;
const MARKER_LOCALITY_CONTROL_MD = 'Three-way locality control';
const MARKER_LOCALITY_CONTROL_HTML = 'Three-Way Locality Control';

const SHAPE_LOCAL_ONLY = 'local-only';
const SHAPE_ONE_REMOTE = 'one-remote-stage';
const SHAPE_SEQUENTIAL = 'sequential';
const SHAPE_FAN_OUT = 'fan-out';
const REQUIRED_SHAPE_IDS = Object.freeze([
  SHAPE_LOCAL_ONLY,
  SHAPE_ONE_REMOTE,
  SHAPE_SEQUENTIAL,
  SHAPE_FAN_OUT,
]);

const LINK_SCENARIO_A = 'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline';
const LINK_SCENARIO_B = 'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision';
const LINK_TIDB_PROGRESS = 'tidb-comparison-progress.md';
const LINK_POSTGRES_PROGRESS = 'postgresql-comparison-progress.md';

const README_PATH = 'README.md';
const DOCS_README_PATH = 'docs/README.md';
const LINK_BENCHMARKS_README = 'benchmarks/README.md';
const LINK_BENCHMARKS_INDEX = 'benchmarks/index.html';

const ERR_TARGETS_MISSING = 'All required targets must be present';
const ERR_ROOT_README_MISSING = 'README.md must exist';
const ERR_DOCS_README_MISSING = 'docs/README.md must exist';

const NUM_ZERO = 0;
const NUM_ONE = 1;

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  PARENT_DIR,
  PARENT_DIR,
);

function verifyEpicDefinition(rootDir) {
  const epic = readEpic(rootDir, EPIC_ID);
  assert.ok(epic, `Epic ${EPIC_ID} must exist`);
  const problems = epicProblems(epic.front);
  assert.equal(problems.length, NUM_ZERO);
  assert.equal(epic.front.quests.length, TOTAL_EPIC_SLICES);
}

function verifyComparativeMatrix(matrix) {
  assert.equal(matrix.schema, MULTI_SYSTEM_MATRIX_SCHEMA);
  assert.equal(matrix.epicId, EPIC_ID);
  assert.equal(
    matrix.completedSlices.length + matrix.remainingSlicesCount,
    TOTAL_EPIC_SLICES,
  );
  assert.equal(matrix.completedSlices.length, EXPECTED_COMPLETED_SLICES);
  assert.equal(matrix.remainingSlicesCount, EXPECTED_REMAINING_SLICES);
  const targetIds = arrayMap(matrix.targets, (t) => t.targetId);
  const allTargetsValid = arrayEvery(REQUIRED_TARGET_IDS, (reqId) =>
    arrayIncludes(targetIds, reqId),
  );
  assert.equal(allTargetsValid, true, ERR_TARGETS_MISSING);

  for (const target of matrix.targets) {
    assert.ok(target.scenarioA, `Target ${target.targetId} must define scenarioA`);
    assert.ok(target.scenarioB, `Target ${target.targetId} must define scenarioB`);
    assert.ok(target.scenarioB.shapes, `Target ${target.targetId} must define scenarioB.shapes`);
    const allShapesPresent = arrayEvery(REQUIRED_SHAPE_IDS, (shapeId) =>
      Boolean(target.scenarioB.shapes[shapeId]),
    );
    assert.equal(
      allShapesPresent,
      true,
      `Target ${target.targetId} must define all required shapes`,
    );
  }
}

function verifyBenchmarkDocumentsAndLinks(rootDir) {
  const landingMdPath = path.resolve(rootDir, DEFAULT_COMPARATIVE_LANDING_MD_PATH);
  const landingHtmlPath = path.resolve(rootDir, DEFAULT_COMPARATIVE_LANDING_HTML_PATH);
  const landingSvgPath = path.resolve(rootDir, DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH);
  const pgMdPath = path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_MD_PATH);
  const pgHtmlPath = path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH);
  const pgSvgPath = path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH);

  const filePaths = [
    landingMdPath,
    landingHtmlPath,
    landingSvgPath,
    pgMdPath,
    pgHtmlPath,
    pgSvgPath,
  ];

  for (const filePath of filePaths) {
    assert.equal(fs.existsSync(filePath), true, `File must exist on disk: ${filePath}`);
    const rawContent = fs.readFileSync(filePath, UTF8);
    assert.equal(
      stringIncludes(rawContent, LINK_SCENARIO_A),
      true,
      `File ${filePath} must contain link to ${LINK_SCENARIO_A}`,
    );
    assert.equal(
      stringIncludes(rawContent, LINK_SCENARIO_B),
      true,
      `File ${filePath} must contain link to ${LINK_SCENARIO_B}`,
    );
  }

  const landingMd = fs.readFileSync(landingMdPath, UTF8);
  const landingHtml = fs.readFileSync(landingHtmlPath, UTF8);
  const pgMd = fs.readFileSync(pgMdPath, UTF8);
  const pgHtml = fs.readFileSync(pgHtmlPath, UTF8);

  assert.equal(stringIncludes(landingMd, LINK_TIDB_PROGRESS), true);
  assert.equal(stringIncludes(landingMd, LINK_POSTGRES_PROGRESS), true);
  assert.equal(stringIncludes(landingHtml, LINK_TIDB_PROGRESS), true);
  assert.equal(stringIncludes(landingHtml, LINK_POSTGRES_PROGRESS), true);
  assert.equal(stringIncludes(pgMd, LINK_TIDB_PROGRESS), true);

  assert.equal(stringIncludes(pgMd, MARKER_LOCALITY_CONTROL_MD), true);
  assert.equal(stringIncludes(pgMd, TARGET_PG_PLPGSQL_SINGLE), true);
  assert.equal(stringIncludes(pgMd, TARGET_PG_PLPGSQL_PATRONI), true);

  assert.equal(stringIncludes(pgHtml, MARKER_LOCALITY_CONTROL_HTML), true);
  assert.equal(stringIncludes(pgHtml, TARGET_PG_PLPGSQL_SINGLE), true);
  assert.equal(stringIncludes(pgHtml, TARGET_PG_PLPGSQL_PATRONI), true);

  const rootReadmePath = path.resolve(rootDir, README_PATH);
  const docsReadmePath = path.resolve(rootDir, DOCS_README_PATH);
  assert.equal(fs.existsSync(rootReadmePath), true, ERR_ROOT_README_MISSING);
  assert.equal(fs.existsSync(docsReadmePath), true, ERR_DOCS_README_MISSING);

  const rootReadme = fs.readFileSync(rootReadmePath, UTF8);
  const docsReadme = fs.readFileSync(docsReadmePath, UTF8);
  assert.equal(stringIncludes(rootReadme, LINK_BENCHMARKS_README), true);
  assert.equal(stringIncludes(rootReadme, LINK_BENCHMARKS_INDEX), true);
  assert.equal(stringIncludes(docsReadme, LINK_BENCHMARKS_README), true);
  assert.equal(stringIncludes(docsReadme, LINK_BENCHMARKS_INDEX), true);
}

function verifyHarnessRendererParity(rootDir, matrix) {
  const defaultMatrix = buildMultiSystemComparativeMatrix();
  assert.equal(defaultMatrix.schema, MULTI_SYSTEM_MATRIX_SCHEMA);
  assert.equal(defaultMatrix.epicId, EPIC_ID);
  assert.equal(defaultMatrix.totalSlices, TOTAL_EPIC_SLICES);

  const testMatrix = matrix || defaultMatrix;
  const landingMdPath = path.resolve(rootDir, DEFAULT_COMPARATIVE_LANDING_MD_PATH);
  const landingHtmlPath = path.resolve(rootDir, DEFAULT_COMPARATIVE_LANDING_HTML_PATH);
  const landingSvgPath = path.resolve(rootDir, DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH);
  const pgMdPath = path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_MD_PATH);
  const pgHtmlPath = path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH);
  const pgSvgPath = path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH);

  assert.equal(renderPostgresqlComparisonMarkdown(testMatrix), fs.readFileSync(pgMdPath, UTF8));
  assert.equal(renderPostgresqlComparisonHtml(testMatrix), fs.readFileSync(pgHtmlPath, UTF8));
  assert.equal(renderPostgresqlComparisonSvg(testMatrix), fs.readFileSync(pgSvgPath, UTF8));
  assert.equal(renderComparativeLandingMarkdown(testMatrix), fs.readFileSync(landingMdPath, UTF8));
  assert.equal(renderComparativeLandingHtml(testMatrix), fs.readFileSync(landingHtmlPath, UTF8));
  assert.equal(renderComparativeOverviewSvg(testMatrix), fs.readFileSync(landingSvgPath, UTF8));
}

export async function runComparativeBenchmarkMatrixGuard(rootDir = REPO_ROOT) {
  verifyEpicDefinition(rootDir);
  const matrixPath = path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  assert.equal(fs.existsSync(matrixPath), true, `Matrix file must exist: ${matrixPath}`);
  const matrix = await readMultiSystemComparativeMatrix({rootDir, matrixPath});
  verifyComparativeMatrix(matrix);
  verifyBenchmarkDocumentsAndLinks(rootDir);
  verifyHarnessRendererParity(rootDir, matrix);

  return {
    ok: true,
    remainingSlicesCount: matrix.remainingSlicesCount,
    completedSlicesCount: matrix.completedSlices.length,
  };
}

const isDirectCli = process.argv[NUM_ONE] &&
  path.resolve(process.argv[NUM_ONE]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  const isMetric = arrayIncludes(process.argv, FLAG_METRIC);
  const result = await runComparativeBenchmarkMatrixGuard();
  if (isMetric) {
    process.stdout.write(`${result.remainingSlicesCount}${NEWLINE}`);
    process.exitCode = result.remainingSlicesCount === NUM_ZERO ? NUM_ZERO : NUM_ONE;
  } else {
    process.stdout.write(PASS_MESSAGE);
  }
}
