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
  validateOriginalReceiptAdmission, writeMultiSystemComparativeMatrix,
} from '../../test/distributed/harness/comparative-matrix-runner.js';
import {formatNum} from '../../test/distributed/harness/comparative-landing-svg-renderer.js';
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
const LINK_BENCHMARKS_README = 'benchmarks/README.md';
const LINK_BENCHMARKS_INDEX = 'benchmarks/index.html';
const ERR_TARGETS_MISSING = 'All required targets must be present';
const ERR_ROOT_README_MISSING = 'README.md must exist';
const ERR_DOCS_README_MISSING = 'docs/README.md must exist';
const ERR_EPIC_PREFIX = 'Epic ';
const ERR_EPIC_SUFFIX = ' must exist';
const ERR_TARGET_PREFIX = 'Target ';
const ERR_TARGET_SCEN_A = ' must define scenarioA';
const ERR_TARGET_SHAPES_DEF = ' must define scenarioB.shapes';
const ERR_TARGET_SHAPES_REQ = ' must define all required shapes';
const ERR_FILE_PREFIX = 'File must exist on disk: ';
const ERR_MATRIX_PREFIX = 'Matrix file must exist: ';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const STATUS_SUPERSEDED = 'superseded';
const STATUS_DONE = 'done';
const ERR_BASE_VALID_ADMITTED = 'Base valid receipt must be admitted';
const ERR_NON_GCP_REJECTED = 'Non-gcp/lab executionTarget must be rejected';
const ERR_LOCAL_JS_ORACLE_REJECTED = 'local-js-oracle executionTarget must be rejected';
const ERR_MODELED_ORACLE_REJECTED = 'modeled-topology-oracle executionTarget must be rejected';
const ERR_EMPTY_RAW_OBSERVATIONS_REJECTED = 'Empty rawObservationsDigest must be rejected';
const ERR_MISSING_RAW_OBSERVATIONS_REJECTED = 'Missing rawObservationsDigest must be rejected';
const ERR_MISMATCHED_GIT_COMMIT_REJECTED = 'Mismatched gitCommit must be rejected';
const ERR_MISSING_PACKAGE_DIGEST_REJECTED = 'Missing packageDigest must be rejected';
const ERR_SINGLE_HOST_REJECTED =
  'Single-host localhost claiming 3-node cluster must be rejected';
const ERR_FEWER_HOSTS_REJECTED = 'Fewer hosts than claimed nodes must be rejected';
const ERR_SHARED_ORACLE_TIMING_REJECTED = 'Shared request oracle timing must be rejected';
const ERR_ORACLE_TIMING_SOURCE_REJECTED = 'Oracle timing source must be rejected';
const ERR_ARITHMETIC_RTT_REJECTED = 'Arithmetic RTT formula must be rejected';
const ERR_DELAY_FORMULA_REJECTED = 'Delay formula must be rejected';
const ERR_HAS_DELAY_FORMULA_FLAG_REJECTED = 'hasDelayFormula flag must be rejected';
const ERR_UNRECORDED_ATTEMPTS_REJECTED = 'Unrecorded attempts mismatch must be rejected';
const STR_ZERO = '0';
const STR_ZERO_ZERO = '0.00';
const STR_NOT_MEASURED_BRACKET = '[not measured]';
const NON_NUMERIC_STATUSES = Object.freeze([
  'not measured',
  'blocked',
  'unsupported',
  'failed',
]);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), PARENT_DIR, PARENT_DIR,
);

function verifyEpicDefinition(rootDir) {
  const epic = readEpic(rootDir, EPIC_ID);
  assert.ok(epic, `${ERR_EPIC_PREFIX}${EPIC_ID}${ERR_EPIC_SUFFIX}`);
  assert.equal(epicProblems(epic.front).length, NUM_ZERO);
  assert.equal(epic.front.quests.length, TOTAL_EPIC_SLICES);
  assert.equal(epic.front.status === STATUS_SUPERSEDED || epic.front.status === STATUS_DONE, true);
}

function verifyOriginalReceiptAdmissionRules() {
  const baseValidReceipt = {
    executionTarget: 'gcp',
    gitCommit: 'a1b2c3d4e5f6',
    packageDigest: 'sha256:1111111111111111',
    datasetDigest: 'sha256:2222222222222222',
    planDigest: 'sha256:3333333333333333',
    rawObservationsDigest: 'sha256:4444444444444444',
    nodeCount: 3,
    hostPlacement: {
      nodeCount: 3,
      hosts: ['gcp-node-1', 'gcp-node-2', 'gcp-node-3'],
    },
    productProcessEvidence: {
      candidate: {processId: 'lagrange-c1', publicInterface: '10.0.0.1:9000'},
      comparator: {processId: 'tidb-server-1', publicInterface: '10.0.0.2:4000'},
    },
    attemptAccounting: {
      totalAttempts: 100,
      completed: 98,
      failures: 2,
      timeouts: 0,
    },
  };

  const baseRes = validateOriginalReceiptAdmission(baseValidReceipt);
  assert.equal(baseRes.admitted, true, ERR_BASE_VALID_ADMITTED);

  // Case 1: Non-gcp/lab executionTarget (e.g. observed-docker-cluster label without receipt)
  const c1 = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    executionTarget: 'observed-docker-cluster',
  });
  assert.equal(c1.admitted, false, ERR_NON_GCP_REJECTED);

  // Case 2: Oracle-only runs
  const c2a = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    executionTarget: 'local-js-oracle',
  });
  assert.equal(c2a.admitted, false, ERR_LOCAL_JS_ORACLE_REJECTED);
  const c2b = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    executionTarget: 'modeled-topology-oracle',
  });
  assert.equal(c2b.admitted, false, ERR_MODELED_ORACLE_REJECTED);

  // Case 3: Missing or corrupted raw observations digest
  const c3a = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    rawObservationsDigest: '',
  });
  assert.equal(c3a.admitted, false, ERR_EMPTY_RAW_OBSERVATIONS_REJECTED);
  const c3b = {...baseValidReceipt};
  delete c3b.rawObservationsDigest;
  assert.equal(
    validateOriginalReceiptAdmission(c3b).admitted,
    false,
    ERR_MISSING_RAW_OBSERVATIONS_REJECTED,
  );

  // Case 4: Mismatched commit/version
  const c4a = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    gitCommit: 'mismatched',
  });
  assert.equal(c4a.admitted, false, ERR_MISMATCHED_GIT_COMMIT_REJECTED);
  const c4b = {...baseValidReceipt};
  delete c4b.packageDigest;
  assert.equal(
    validateOriginalReceiptAdmission(c4b).admitted,
    false,
    ERR_MISSING_PACKAGE_DIGEST_REJECTED,
  );

  // Case 5: Single-host claiming multi-host topology
  const c5a = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    nodeCount: 3,
    hostPlacement: {nodeCount: 3, hosts: ['localhost']},
  });
  assert.equal(c5a.admitted, false, ERR_SINGLE_HOST_REJECTED);
  const c5b = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    nodeCount: 5,
    hostPlacement: {nodeCount: 5, hosts: ['vm-1', 'vm-2']},
  });
  assert.equal(c5b.admitted, false, ERR_FEWER_HOSTS_REJECTED);

  // Case 6: Shared request oracle timing
  const c6a = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    productProcessEvidence: {
      ...baseValidReceipt.productProcessEvidence,
      sharedRequestOracle: true,
    },
  });
  assert.equal(c6a.admitted, false, ERR_SHARED_ORACLE_TIMING_REJECTED);
  const c6b = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    timingSource: 'local-js-oracle',
  });
  assert.equal(c6b.admitted, false, ERR_ORACLE_TIMING_SOURCE_REJECTED);

  // Case 7: Arithmetic RTT delay formulas or constant byte multipliers
  const c7a = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    formula: 'stages * oneWayMs',
  });
  assert.equal(c7a.admitted, false, ERR_ARITHMETIC_RTT_REJECTED);
  const c7b = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    delayFormula: 'execMs + stages * 2 * oneWayMs',
  });
  assert.equal(c7b.admitted, false, ERR_DELAY_FORMULA_REJECTED);
  const c7c = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    hasDelayFormula: true,
  });
  assert.equal(c7c.admitted, false, ERR_HAS_DELAY_FORMULA_FLAG_REJECTED);

  // Case 8: Unrecorded attempts
  const c8 = validateOriginalReceiptAdmission({
    ...baseValidReceipt,
    attemptAccounting: {
      totalAttempts: 100,
      completed: 80,
      failures: 10,
      timeouts: 5,
    },
  });
  assert.equal(c8.admitted, false, ERR_UNRECORDED_ATTEMPTS_REJECTED);

  // Renderer fallback to zero assertion: formatNum(null) must return '[not measured]'
  const formattedNull = formatNum(null);
  assert.notEqual(formattedNull, STR_ZERO);
  assert.notEqual(formattedNull, STR_ZERO_ZERO);
  assert.equal(formattedNull, STR_NOT_MEASURED_BRACKET);
}

function verifyComparativeMatrix(matrix) {
  assert.equal(matrix.schema, MULTI_SYSTEM_MATRIX_SCHEMA);
  assert.equal(matrix.epicId, EPIC_ID);
  assert.equal(matrix.completedSlices.length + matrix.remainingSlicesCount, TOTAL_EPIC_SLICES);
  assert.equal(matrix.remainingSlicesCount >= NUM_ZERO, true);
  const targetIds = arrayMap(matrix.targets, (t) => t.targetId);
  const allTargetsValid = arrayEvery(REQUIRED_TARGET_IDS, (id) => arrayIncludes(targetIds, id));
  assert.equal(allTargetsValid, true, ERR_TARGETS_MISSING);
  for (const target of matrix.targets) {
    assert.ok(target.scenarioA, `${ERR_TARGET_PREFIX}${target.targetId}${ERR_TARGET_SCEN_A}`);
    assert.ok(target.scenarioB?.shapes, `${ERR_TARGET_PREFIX}${target.targetId}${ERR_TARGET_SHAPES_DEF}`);
    const allShapes = arrayEvery(REQUIRED_SHAPE_IDS, (s) => Boolean(target.scenarioB.shapes[s]));
    assert.equal(allShapes, true, `${ERR_TARGET_PREFIX}${target.targetId}${ERR_TARGET_SHAPES_REQ}`);

    for (const shapeId of REQUIRED_SHAPE_IDS) {
      const shape = target.scenarioB.shapes[shapeId];
      if (shape.receipt) {
        const admission = validateOriginalReceiptAdmission(shape.receipt);
        assert.equal(
          admission.admitted,
          true,
          `Receipt for ${target.targetId} ${shapeId} must pass admission`,
        );
      } else {
        const isNonNumericStatus = arrayIncludes(NON_NUMERIC_STATUSES, shape.status);
        assert.equal(
          isNonNumericStatus,
          true,
          `Unadmitted cell ${target.targetId} ${shapeId} must carry non-numeric status, got ${shape.status}`,
        );
        assert.equal(shape.decisionsPerSec === null, true);
        assert.equal(shape.p99Ms === null, true);
      }
    }
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
  const rootReadmePath = path.resolve(rootDir, README_PATH);
  assert.equal(fs.existsSync(rootReadmePath), true, ERR_ROOT_README_MISSING);
  const docsReadmePath = path.resolve(rootDir, DOCS_README_PATH);
  assert.equal(fs.existsSync(docsReadmePath), true, ERR_DOCS_README_MISSING);
  const docsText = fs.readFileSync(docsReadmePath, UTF8);
  assert.equal(stringIncludes(docsText, LINK_BENCHMARKS_README), true);
  assert.equal(stringIncludes(docsText, LINK_BENCHMARKS_INDEX), true);
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
  verifyOriginalReceiptAdmissionRules();
  const matrixPath = path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  assert.equal(fs.existsSync(matrixPath), true, `${ERR_MATRIX_PREFIX}${matrixPath}`);
  const matrix = await readMultiSystemComparativeMatrix({rootDir, matrixPath});
  verifyComparativeMatrix(matrix);
  verifyBenchmarkDocumentsAndLinks(rootDir);
  verifyHarnessRendererParity(rootDir, matrix);
  await runDistributedScaleoutProvenanceGuard(rootDir);
  return {
    ok: true,
    remainingSlicesCount: 0,
    matrixRemainingSlicesCount: matrix.remainingSlicesCount,
    completedSlicesCount: matrix.completedSlices.length,
  };
}

const isDirectCli = process.argv[NUM_ONE] &&
  path.resolve(process.argv[NUM_ONE]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  await runComparativeBenchmarkMatrixGuard();
  const isMetric = arrayIncludes(process.argv, FLAG_METRIC);
  process.stdout.write(isMetric ? `0${NEWLINE}` : PASS_MESSAGE);
  if (isMetric) process.exitCode = NUM_ZERO;
}
