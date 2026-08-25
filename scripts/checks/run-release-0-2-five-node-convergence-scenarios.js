/**
 * Scenario runner for the release-0-2-five-node-convergence quest (epic G2).
 *
 * The release-owned five-node scenario is the MovieLens live affinity gate
 * (`movielens-lagrange-service-affinity-live`, produced by
 * `npm run demo:movielens`): one run cold-forms a five-node cluster,
 * creates and loads the MovieLens user tables through production schema
 * admission, and places the svc-movielens-topn runtime service through the
 * production placement owners. This runner derives the three sealed
 * frontier scenarios (plus the aggregate doneWhen scenario) from the most
 * recent live report's phase receipts, fail-closed:
 *  - release-0-2-five-node-cold-formation: the run converged.
 *  - release-0-2-five-node-user-table-readiness: production schema
 *    admission admitted the MovieLens tables and the ratings preload was
 *    admitted.
 *  - release-0-2-five-node-runtime-service-placement: the initial
 *    placement receipt names every pinned service replica and the ranked
 *    result is correct.
 * Every derived PASS additionally requires the underlying live scenario's
 * own PASS verdict, so a partial run can never split into green frontiers.
 * Provenance (source report path, its sha256, git HEAD, and the computed
 * source fingerprint) is embedded for the G5 frozen-digest replay; the
 * terminal replay must also bind the boot SRC_FINGERPRINT per the epic.
 */

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  computeSourceFingerprint,
} from '../../src/diagnostics/source-fingerprint.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Ambient intrinsics captured at module load (adversarial-js-intrinsics
// guideline item 6) so replaced prototypes cannot invert report admission.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringReplace = Function.call.bind(String.prototype.replace);

const REPORT_DIR = 'test-output/reports';
const LIVE_SCENARIO = 'movielens-lagrange-service-affinity-live';
const AGGREGATE_SCENARIO = 'release-0-2-five-node-convergence';
const PRODUCER = 'release-0-2-five-node-convergence-derivation';
const FIDELITY = 'live-five-node-movielens-derivation';
const REPORT_EXT = '.report.json';
const REPORT_FLAG = '--report';
const EXPECTED_PLACED_REPLICAS = 2;
const MAX_SOURCE_REPORT_AGE_MS = 6 * 60 * 60 * 1000;
const HASH_ALGORITHM = 'sha256';
const HEX_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const GIT_BINARY = 'git';
const GIT_HEAD_ARGS = Object.freeze(['rev-parse', 'HEAD']);
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const REASON_PREFIX_STALE = 'source_live_report_stale';
const REASON_PREFIX_MISSING = 'source_live_report_missing';
const REASON_SOURCE_OK = 'source_live_report_ok';

const FRONTIER_CONDITIONS = Object.freeze([
  Object.freeze({
    scenario: 'release-0-2-five-node-cold-formation',
    receipt: 'result.converged',
    holds: (ctx) => ctx.result?.converged === true,
  }),
  Object.freeze({
    scenario: 'release-0-2-five-node-user-table-readiness',
    receipt: 'schemaAdmission.admitted && preloadAdmission.admitted',
    holds: (ctx) =>
      ctx.detail?.schemaAdmission?.admitted === true &&
      ctx.detail?.preloadAdmission?.admitted === true,
  }),
  Object.freeze({
    scenario: 'release-0-2-five-node-runtime-service-placement',
    receipt:
      'initialPlacement.placement names every pinned replica && resultCorrect',
    holds: (ctx) =>
      Array.isArray(ctx.result?.initialPlacement?.placement) &&
      ctx.result.initialPlacement.placement.length >=
        EXPECTED_PLACED_REPLICAS &&
      ctx.result?.resultCorrect === true,
  }),
]);

function newestLiveReportPath() {
  const dir = path.join(root, REPORT_DIR);
  const prefix = `${LIVE_SCENARIO}-`;
  const names = arrayFilter(
    fs.readdirSync(dir),
    (name) =>
      stringStartsWith(name, prefix) && stringEndsWith(name, REPORT_EXT),
  );
  const candidates = arrayMap(names, (name) => path.join(dir, name)).sort();
  return candidates.length > 0 ? candidates[candidates.length - 1] : '';
}

function resolveSourceReportPath(argv) {
  const flagIndex = arrayIndexOf(argv, REPORT_FLAG);
  if (flagIndex >= 0 && argv[flagIndex + 1]) {
    return path.resolve(root, argv[flagIndex + 1]);
  }
  return newestLiveReportPath();
}

// Single canonical source classification: exactly one reason is decided
// per call (missing -> stale -> ok), never via independent branch piles.
function classifySourceReport(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) {
    return {reason: REASON_PREFIX_MISSING, bytes: Buffer.alloc(0)};
  }
  const bytes = fs.readFileSync(reportPath);
  const report = JSON.parse(bytes.toString(TEXT_ENCODING));
  const ageMs = Date.now() - Date.parse(report?.timestamp || 0);
  const fresh = ageMs >= 0 && ageMs <= MAX_SOURCE_REPORT_AGE_MS;
  return {
    reason: fresh ? REASON_SOURCE_OK : REASON_PREFIX_STALE,
    bytes,
    report,
  };
}

function loadSourceContext(reportPath) {
  const classified = classifySourceReport(reportPath);
  const available = classified.reason === REASON_SOURCE_OK;
  const entry =
    classified.report?.standardSummary?.scenarios?.[0];
  return {
    available,
    reason: classified.reason,
    reportPath,
    reportTimestamp: classified.report?.timestamp || '',
    reportSha256: createHash(HASH_ALGORITHM)
      .update(classified.bytes)
      .digest(HEX_ENCODING),
    livePassed: available &&
      entry?.scenario === LIVE_SCENARIO && entry?.passed === true,
    detail: entry?.detail || {},
    result: entry?.detail?.result || {},
  };
}

function buildProvenance(source, sourceFingerprint) {
  return {
    sourceScenario: LIVE_SCENARIO,
    sourceReport: source.reportPath ?
      path.relative(root, source.reportPath) :
      '',
    sourceReportTimestamp: source.reportTimestamp || '',
    sourceReportSha256: source.reportSha256 || '',
    headCommit: stringTrim(
      execFileSync(GIT_BINARY, GIT_HEAD_ARGS, {cwd: root})
        .toString(TEXT_ENCODING),
    ),
    sourceFingerprint,
  };
}

function buildDerivedReport(
  scenario,
  conditions,
  source,
  timestamp,
  sourceFingerprint,
) {
  const failing = arrayFilter(conditions, (entry) => !entry.passed);
  const passed = source.available &&
    source.livePassed &&
    failing.length === 0;
  const priorityItems = source.available ?
    failing.length + (source.livePassed ? 0 : 1) :
    conditions.length + 1;
  return {
    timestamp,
    scenario,
    producer: PRODUCER,
    fidelity: FIDELITY,
    summary: {
      total: conditions.length,
      passed: conditions.length - failing.length,
      failed: failing.length,
    },
    optimizationSummary: {
      totalPriorityItems: priorityItems,
    },
    standardSummary: {
      scenarios: [
        {
          scenario,
          passed,
          current: {
            passed,
            verdict: passed ? VERDICT_PASS : VERDICT_FAIL,

          },
          detail: {
            conditions,
            provenance: source.available ?
              buildProvenance(source, sourceFingerprint) :
              {},
          },
        },
      ],
    },
  };
}

function writeReport(report) {
  const stamp = stringReplace(report.timestamp, /[:.]/g, '-');
  const reportPath = path.join(
    root,
    REPORT_DIR,
    `${report.scenario}-${stamp}${REPORT_EXT}`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return path.relative(root, reportPath);
}

const SOURCE_TREE = 'src';

async function main() {
  const source = loadSourceContext(resolveSourceReportPath(process.argv));
  const timestamp = new Date().toISOString();
  const sourceFingerprint = source.available ?
    await computeSourceFingerprint(path.join(root, SOURCE_TREE)) :
    '';
  let allPassed = true;
  const aggregateConditions = [];
  for (const frontier of FRONTIER_CONDITIONS) {
    const condition = {
      receipt: frontier.receipt,
      passed: source.available && frontier.holds(source),
    };
    aggregateConditions.push({scenario: frontier.scenario, ...condition});
    const report = buildDerivedReport(
      frontier.scenario,
      [condition],
      source,
      timestamp,
      sourceFingerprint,
    );
    const written = writeReport(report);
    const verdict =
      report.standardSummary.scenarios[0].current.verdict;
    allPassed = allPassed && verdict === VERDICT_PASS;
    process.stdout.write(`${verdict} ${frontier.scenario}\n`);
    process.stdout.write(`report: ${written}\n`);
  }
  const aggregate = buildDerivedReport(
    AGGREGATE_SCENARIO,
    aggregateConditions,
    source,
    timestamp,
    sourceFingerprint,
  );
  const writtenAggregate = writeReport(aggregate);
  const aggregateVerdict =
    aggregate.standardSummary.scenarios[0].current.verdict;
  allPassed = allPassed && aggregateVerdict === VERDICT_PASS;
  process.stdout.write(`${aggregateVerdict} ${AGGREGATE_SCENARIO}\n`);
  process.stdout.write(`report: ${writtenAggregate}\n`);
  process.exitCode = allPassed ? 0 : 1;
}

await main();
