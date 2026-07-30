#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {basename, resolve} from 'node:path';
import {
  collectBenchmarkResourceSourceProvenance,
} from './benchmark-resource-source-provenance.js';
import {
  createBenchmarkResourceDurableResolver,
} from
  '../../test/distributed/harness/benchmark-resource-durable-resolver.js';
import {
  acceptBenchmarkResourceClaimEvidenceRoot,
} from
  '../../test/distributed/harness/benchmark-resource-evidence-root.js';
import {
  digestBenchmarkSemanticData,
} from '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  COMPARATIVE_EVIDENCE_CLASS,
} from
  '../../test/distributed/harness/comparative-efficiency-evidence-contract.js';
import {
  COMPARATIVE_CLAIM_CERTIFICATION_STATE,
  COMPARATIVE_CLAIM_METRIC,
} from '../../test/distributed/harness/comparative-efficiency-claim-projection-constants.js';
import {
  projectComparativeEfficiencyClaims,
} from '../../test/distributed/harness/comparative-efficiency-claim-projection.js';
import {
  renderComparativeEfficiencyClaimTable,
  validateComparativeEfficiencyClaimTable,
} from
  '../../test/distributed/harness/comparative-efficiency-claim-table.js';
import {
  SCALE_PROFILE_ID,
} from '../../test/distributed/harness/scale-evidence-contract.js';

const SCENARIO = 'comparative-efficiency-claim-projection';
const REPORT_DIRECTORY = 'test-output/reports';
const OUTPUT_DIRECTORY =
  'test-output/comparative-efficiency-claim-projection';
const localText = Object.freeze({
  CLASSIFICATION_MISMATCH:
    'claim_projection:expected_classification_mismatch:',
  CONTENT_SEPARATOR: '\u0000',
  HEX: 'hex',
  HUMAN_TABLE_DIGEST_MISSING:
    'claim_projection:human_table_digest_missing',
  SOURCE_REPORT_SEPARATOR: ', ',
  UTF8: 'utf8',
});
const SOURCE_PATHS = Object.freeze([
  'scripts/checks/benchmark-resource-source-provenance.js',
  'scripts/checks/run-comparative-efficiency-claim-projection-guard.js',
  'scripts/checks/run-comparative-efficiency-claim-projection-live.js',
  'src/diagnostics/comparative-efficiency-opportunity-calculator.js',
  'test/distributed/harness/__tests__/' +
    'benchmark-capacity-heterogeneous-evidence-test-fixture.js',
  'test/distributed/harness/__tests__/' +
    'benchmark-resource-evidence-test-fixture.js',
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-claim-projection.test.js',
  'test/distributed/harness/benchmark-resource-cost-and-effects.js',
  'test/distributed/harness/benchmark-resource-evidence-data.js',
  'test/distributed/harness/benchmark-resource-claim-evidence-view.js',
  'test/distributed/harness/benchmark-resource-evidence-root-constants.js',
  'test/distributed/harness/benchmark-resource-evidence-root.js',
  'test/distributed/harness/benchmark-semantic-integrity.js',
  'test/distributed/harness/comparative-efficiency-evidence-contract.js',
  'test/distributed/harness/comparative-efficiency-claim-projection-constants.js',
  'test/distributed/harness/comparative-efficiency-claim-projection.js',
  'test/distributed/harness/comparative-efficiency-claim-table.js',
  'test/distributed/harness/scale-certification-receipt-freshness.js',
  'test/distributed/harness/scale-evidence-contract.js',
]);
const ANALYTICAL_FIXTURES = Object.freeze([
  {
    workloadId: 'alternative-favored',
    path: 'test/fixtures/comparative-efficiency-opportunity/' +
      'alternative-favored.json',
  },
  {
    workloadId: 'movielens-grouped-reduce',
    path: 'test/fixtures/comparative-efficiency-opportunity/' +
      'grouped-reduce.json',
  },
  {
    workloadId: 'change-rate-invalidation',
    path: 'test/fixtures/comparative-efficiency-opportunity/' +
      'invalidation.json',
  },
  {
    workloadId: 'request-enrichment',
    path: 'test/fixtures/comparative-efficiency-opportunity/' +
      'request-enrichment.json',
  },
]);
const MEASURED_SOURCES = Object.freeze([
  {
    scenario: 'comparative-efficiency-negative-controls',
    workloadId: 'negative-controls',
    matrixId: 'comparative-negative-controls-p0-v1',
    artifactDirectory: 'test-output/comparative-negative-control-artifacts',
  },
  {
    scenario: 'comparative-efficiency-request-enrichment',
    workloadId: 'request-enrichment',
    matrixId: 'comparative-request-enrichment-p0-v1',
    artifactDirectory:
      'test-output/comparative-request-enrichment-artifacts',
  },
  {
    scenario: 'comparative-efficiency-movielens-grouped-reduce',
    workloadId: 'movielens-grouped-reduce',
    matrixId: 'comparative-movielens-grouped-reduce-p0-v1',
    artifactDirectory:
      'test-output/comparative-movielens-grouped-reduce-artifacts',
  },
  {
    scenario: 'comparative-efficiency-change-rate-crossover',
    workloadId: 'change-rate-crossover',
    matrixId: 'comparative-change-rate-crossover-p0-v1',
    artifactDirectory:
      'test-output/comparative-change-rate-crossover-artifacts',
  },
]);

function scenarioEntry(report, scenario) {
  const entries = report.standardSummary?.scenarios;
  return Array.isArray(entries) ?
    entries.find((entry) => entry.scenario === scenario) :
    undefined;
}

function reportPassedScenario(report, entry, source) {
  return report.scenario === source.scenario &&
    report.summary?.failed === 0 &&
    entry?.current?.passed === true;
}

function reportDetailValid(detail, source) {
  return detail?.matrixId === source.matrixId &&
    typeof detail.evidenceRootDigest === 'string' &&
    detail.durableReplayValid === true &&
    detail.freshProcessReplayValid === true;
}

function passingReport(source, candidate) {
  const report = JSON.parse(readFileSync(candidate.path, localText.UTF8));
  const entry = scenarioEntry(report, source.scenario);
  if (!reportPassedScenario(report, entry, source)) {
    return null;
  }
  const detail = entry.detail;
  if (!reportDetailValid(detail, source)) {
    throw new Error(`${source.scenario}:latest_pass_detail_invalid`);
  }
  return {
    path: candidate.path,
    timestamp: report.timestamp,
    detail,
  };
}

function latestPassingReport(source) {
  const prefix = `${source.scenario}-`;
  const candidates = readdirSync(REPORT_DIRECTORY)
    .filter((name) =>
      name.startsWith(prefix) && name.endsWith('.report.json'))
    .map((name) => {
      const path = resolve(REPORT_DIRECTORY, name);
      return {path, modifiedAt: statSync(path).mtimeMs};
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  for (let index = 0; index < candidates.length; index += 1) {
    const report = passingReport(source, candidates[index]);
    if (report !== null) return report;
  }
  throw new Error(`${source.scenario}:passing_live_report_required`);
}

function analyticalEvidence() {
  return ANALYTICAL_FIXTURES.map((fixture) => ({
    workloadId: fixture.workloadId,
    input: JSON.parse(readFileSync(fixture.path, localText.UTF8)),
  }));
}

function measuredEvidence(sourceReports) {
  return sourceReports.map(({source, report}) => ({
    workloadId: source.workloadId,
    expectedMatrixId: source.matrixId,
    profile: {
      id: SCALE_PROFILE_ID.DEVELOPMENT,
      identity: digestBenchmarkSemanticData({
        profileId: SCALE_PROFILE_ID.DEVELOPMENT,
        matrixId: source.matrixId,
      }),
    },
    rootAcceptance: acceptBenchmarkResourceClaimEvidenceRoot({
      rootDigest: report.detail.evidenceRootDigest,
      resolver: createBenchmarkResourceDurableResolver(
        resolve(source.artifactDirectory),
      ),
    }),
    certification: {
      state: COMPARATIVE_CLAIM_CERTIFICATION_STATE.ABSENT,
    },
  }));
}

function increment(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

function tableSummary(table) {
  const evidenceClasses = {};
  const outcomes = {};
  const metrics = {};
  for (let index = 0; index < table.rows.length; index += 1) {
    increment(evidenceClasses, table.rows[index].evidenceClass);
    increment(outcomes, table.rows[index].outcome);
    increment(metrics, table.rows[index].metric);
  }
  return {evidenceClasses, outcomes, metrics};
}

function sourceContentDigest() {
  const hash = createHash('sha256');
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    hash.update(SOURCE_PATHS[index]);
    hash.update(localText.CONTENT_SEPARATOR);
    hash.update(readFileSync(SOURCE_PATHS[index]));
    hash.update(localText.CONTENT_SEPARATOR);
  }
  return `sha256:${hash.digest(localText.HEX)}`;
}

function reportSource(source, report) {
  return {
    scenario: source.scenario,
    reportPath: report.path,
    reportTimestamp: report.timestamp,
    matrixId: source.matrixId,
    evidenceRootDigest: report.detail.evidenceRootDigest,
    claimDisposition: report.detail.claimDisposition,
    measuringCellCount: report.detail.measuringCellCount,
    nonMeasuringCellCount: report.detail.nonMeasuringCellCount,
    artifactDirectory: source.artifactDirectory,
  };
}

async function main() {
  const sourceReports = MEASURED_SOURCES.map((source) => ({
    source,
    report: latestPassingReport(source),
  }));
  const evaluatedAt = new Date().toISOString();
  const table = projectComparativeEfficiencyClaims({
    evaluatedAt,
    analyticalEvidence: analyticalEvidence(),
    measuredEvidence: measuredEvidence(sourceReports),
  });
  const validation = validateComparativeEfficiencyClaimTable(table);
  if (!validation.valid) {
    throw new Error(`machine_claim_table_invalid:${validation.reason}`);
  }
  const analyticalRows = table.rows.filter(
    (row) => row.metric === COMPARATIVE_CLAIM_METRIC.ANALYTICAL_OPPORTUNITY,
  );
  const measuredRows = table.rows.filter(
    (row) => row.metric !== COMPARATIVE_CLAIM_METRIC.ANALYTICAL_OPPORTUNITY,
  );
  if (
    analyticalRows.length !== ANALYTICAL_FIXTURES.length ||
    !analyticalRows.every(
      (row) =>
        row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.ANALYTICAL_BOUND,
    ) ||
    !measuredRows.every(
      (row) => row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
    )
  ) {
    throw new Error(
      localText.CLASSIFICATION_MISMATCH +
      JSON.stringify({
        analyticalRows: analyticalRows.length,
        measuredRows: measuredRows.length,
        summary: tableSummary(table),
      }),
    );
  }
  const markdown = renderComparativeEfficiencyClaimTable(table);
  if (!markdown.includes(table.tableDigest)) {
    throw new Error(localText.HUMAN_TABLE_DIGEST_MISSING);
  }
  mkdirSync(OUTPUT_DIRECTORY, {recursive: true});
  const stamp = evaluatedAt.replace(/[:.]/gu, '-');
  const machineTablePath = resolve(
    OUTPUT_DIRECTORY,
    `${SCENARIO}-${stamp}.table.json`,
  );
  const humanTablePath = resolve(
    OUTPUT_DIRECTORY,
    `${SCENARIO}-${stamp}.table.md`,
  );
  writeFileSync(machineTablePath, JSON.stringify(table, null, 2));
  writeFileSync(humanTablePath, markdown);

  const sourceProvenance =
    await collectBenchmarkResourceSourceProvenance(SOURCE_PATHS);
  sourceProvenance.sourceContentDigest = sourceContentDigest();
  const detail = {
    evaluatedAt,
    tableDigest: table.tableDigest,
    rowCount: table.rows.length,
    ...tableSummary(table),
    analyticalBoundCount: analyticalRows.length,
    measuredNoClaimCount: measuredRows.length,
    allMeasuredRowsFailClosed: true,
    machineTablePath,
    humanTablePath,
    sourceReports: sourceReports.map(({source, report}) =>
      reportSource(source, report)),
    sourceProvenance,
  };
  const timestamp = new Date().toISOString();
  const scenarioReport = {
    timestamp,
    scenario: SCENARIO,
    producer: 'comparative-efficiency-claim-projection-live',
    fidelity: 'current-durable-evidence-projection',
    summary: {total: 1, passed: 1, failed: 0},
    optimizationSummary: {totalPriorityItems: 0},
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
        passed: true,
        current: {passed: true, verdict: 'PASS'},
        detail,
      }],
    },
  };
  const reportStamp = timestamp.replace(/[:.]/gu, '-');
  const reportPath = resolve(
    REPORT_DIRECTORY,
    `${SCENARIO}-${reportStamp}.report.json`,
  );
  writeFileSync(reportPath, JSON.stringify(scenarioReport, null, 2));
  process.stdout.write(
    `${SCENARIO}: PASS\n` +
    `tableDigest: ${table.tableDigest}\n` +
    `rows: ${table.rows.length} ` +
      `(analytical_bound=${analyticalRows.length}, ` +
      `measured_no_claim=${measuredRows.length})\n` +
    `machineTable: ${machineTablePath}\n` +
    `humanTable: ${humanTablePath}\n` +
    `scenarioReport: ${reportPath}\n` +
    `sourceReports: ${sourceReports.map(({report}) =>
      basename(report.path)).join(localText.SOURCE_REPORT_SEPARATOR)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${SCENARIO}: FAIL\n${error.stack}\n`);
  process.exitCode = 1;
});
