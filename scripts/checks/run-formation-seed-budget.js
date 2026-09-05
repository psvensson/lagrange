/**
 * Local seed-starvation gate (`npm run check:formation`).
 *
 *   node scripts/checks/run-formation-seed-budget.js [--report <path>]
 *
 * Runs the MovieLens demo's formation-only phase with five local node
 * processes (or reads an existing formation-only report with --report),
 * then fails unless the report's formation verdict is PASS and the seed was
 * not starved: unexplained event-loop blocked time inside the formation
 * window within the hardware-relative budget the verdict carries. The
 * verdict itself is owned by examples/service-data-affinity/
 * formation-verdict.js; this gate only decides exit status and prints the
 * causal chain so a red run explains itself without log forensics.
 */

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  FORMATION_VERDICT,
} from '../../examples/service-data-affinity/formation-verdict.js';
import {
  FORMATION_ONLY_SCENARIO,
} from '../../examples/service-data-affinity/affinity-demo-live-report.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..',
);
const REPORT_DIR = 'test-output/reports';
const REPORT_SUFFIX = '.report.json';
const REPORT_ARG = '--report';
const DEMO_SCRIPT = 'examples/service-data-affinity/run-affinity-demo.js';
const FORMATION_ONLY_FLAG = '--formation-only';
const THERMAL_GATE_SCRIPT = 'scripts/checks/wait-for-thermal-headroom.js';
const TEXT_ENCODING = 'utf8';
const ARGV_OFFSET = 2;
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const CHAIN_INDENT = '    ';
const BROKEN_MARK = 'x';
const INTACT_MARK = '-';
const LINE_SEPARATOR = '\n';
const STDIO_INHERIT = 'inherit';

const NO_REPORT_PATH = null;
const NO_VERDICT = null;
const GATE_OUTCOME = Object.freeze({
  PASS: 'pass',
  THERMAL_GATE_REFUSED: 'thermal_gate_refused',
  FORMATION_RUN_PRODUCED_NO_REPORT: 'formation_run_produced_no_report',
  VERDICT_NOT_PASS: 'formation_verdict_not_pass',
  SEED_STARVED: 'seed_starved',
  REPORT_MISSING: 'formation_report_missing',
  VERDICT_MISSING: 'formation_verdict_missing',
});

function parseArguments(argv) {
  const options = {report: null};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === REPORT_ARG) {
      options.report = argv[index + 1] || null;
      index += 1;
    }
  }
  return options;
}

function newestFormationOnlyReport(root) {
  const dir = path.join(root, REPORT_DIR);
  if (!fs.existsSync(dir)) return null;
  const candidates = arrayFilter(fs.readdirSync(dir), (name) =>
    stringStartsWith(name, FORMATION_ONLY_SCENARIO) &&
    stringEndsWith(name, REPORT_SUFFIX)).sort();
  return candidates.length > 0 ?
    path.join(dir, candidates[candidates.length - 1]) : null;
}

// Ordered decision table: the first row whose predicate holds names the
// outcome, so a missing report or verdict can never fall through to PASS.
// Typed result of running the formation-only demo: only REPORT carries a
// path; the other two kinds ARE the gate outcome.
const RUN_RESULT = Object.freeze({
  REPORT: 'report',
  THERMAL_GATE_REFUSED: 'thermal_gate_refused',
  NO_NEW_REPORT: 'formation_run_produced_no_report',
});

const GATE_DECISIONS = Object.freeze([
  Object.freeze({
    outcome: GATE_OUTCOME.REPORT_MISSING, ok: false,
    when: ({report}) => !report,
  }),
  Object.freeze({
    outcome: GATE_OUTCOME.VERDICT_MISSING, ok: false,
    when: ({verdictKnown}) => !verdictKnown,
  }),
  Object.freeze({
    outcome: GATE_OUTCOME.VERDICT_NOT_PASS, ok: false,
    when: ({verdict}) => verdict.verdict !== FORMATION_VERDICT.PASS,
  }),
  Object.freeze({
    outcome: GATE_OUTCOME.SEED_STARVED, ok: false,
    when: ({verdict}) => verdict.seedStarved === true,
  }),
  Object.freeze({outcome: GATE_OUTCOME.PASS, ok: true, when: () => true}),
]);

/**
 * Decide the gate outcome from a live report. Pure.
 * @param {Object|null} report
 * @return {{outcome: string, ok: boolean, verdict: Object|null}}
 */
function decideSeedBudgetGate(report) {
  const verdict = report?.formationVerdict || null;
  const verdictKnown = Boolean(verdict) && typeof verdict.verdict === 'string';
  const decision = arrayFind(GATE_DECISIONS, (row) =>
    row.when({report, verdict, verdictKnown}));
  return {
    outcome: decision.outcome,
    ok: decision.ok,
    verdict: verdictKnown ? verdict : null,
  };
}

function renderCausalChain(verdict) {
  const chain = Array.isArray(verdict?.causalChain) ? verdict.causalChain : [];
  return arrayMap(chain, (stage) =>
    `${CHAIN_INDENT}${stage.broken ? BROKEN_MARK : INTACT_MARK} ` +
    `${stage.stage}: ${stage.detail}`).join(LINE_SEPARATOR);
}

function renderDecision(decision, reportPath) {
  const verdict = decision.verdict;
  const lines = [
    `formation seed budget: ${decision.ok ? 'PASS' : 'FAIL'} ` +
    `(${decision.outcome})`,
    `  report: ${reportPath || 'none'}`,
  ];
  if (verdict) {
    lines.push(
      `  verdict: ${verdict.verdict} (${verdict.reason}); seed starved: ` +
      `${verdict.seedStarved}; budget ${verdict.budget?.maxBlockedMs} ms / ` +
      `${verdict.budget?.maxBlockedPercent}% (machine factor ` +
      `${verdict.budget?.machineFactor})`,
      renderCausalChain(verdict),
    );
  }
  return lines.join(LINE_SEPARATOR);
}

// The run's own exit status is not the verdict (a red formation writes a
// FAIL report and exits 1), but a run that never produced a NEW report is:
// a refused thermal gate or a killed demo must not fall back to the newest
// report already on disk.
function runFormationOnlyDemo(root, run) {
  const before = newestFormationOnlyReport(root);
  const gateOpen =
    run(process.execPath, [THERMAL_GATE_SCRIPT], {cwd: root}).status === EXIT_OK;
  if (gateOpen) {
    run(process.execPath, [DEMO_SCRIPT, FORMATION_ONLY_FLAG], {cwd: root});
  }
  const after = gateOpen ? newestFormationOnlyReport(root) : before;
  const producedNewReport = Boolean(after) && after !== before;
  const kind = !gateOpen ? RUN_RESULT.THERMAL_GATE_REFUSED :
    (producedNewReport ? RUN_RESULT.REPORT : RUN_RESULT.NO_NEW_REPORT);
  return {
    kind,
    reportPath: kind === RUN_RESULT.REPORT ? after : NO_REPORT_PATH,
  };
}

function resolveGateDecision(root, report, run) {
  if (report) {
    const reportPath = path.resolve(root, report);
    return {reportPath, decision: decideSeedBudgetGate(readReport(reportPath))};
  }
  const produced = runFormationOnlyDemo(root, run);
  return produced.kind === RUN_RESULT.REPORT ?
    {
      reportPath: produced.reportPath,
      decision: decideSeedBudgetGate(readReport(produced.reportPath)),
    } :
    {
      reportPath: NO_REPORT_PATH,
      decision: {outcome: produced.kind, ok: false, verdict: NO_VERDICT},
    };
}

function readReport(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) return null;
  return JSON.parse(fs.readFileSync(reportPath, TEXT_ENCODING));
}

/**
 * Run (or read) and decide. Injectable for the witness.
 * @param {Object} options
 * @param {string} [options.root]
 * @param {string|null} [options.report]
 * @param {Function} [options.run] spawnSync-shaped runner
 * @param {Function} [options.log]
 * @return {{exitCode: number, decision: Object, reportPath: string|null}}
 */
function runFormationSeedBudgetGate({
  root = REPO_ROOT,
  report = null,
  run = (command, args, options) =>
    spawnSync(command, args, {...options, stdio: STDIO_INHERIT}),
  log = (line) => process.stdout.write(`${line}${LINE_SEPARATOR}`),
} = {}) {
  const {reportPath, decision} = resolveGateDecision(root, report, run);
  log(renderDecision(decision, reportPath));
  return {exitCode: decision.ok ? EXIT_OK : EXIT_FAIL, decision, reportPath};
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  const options = parseArguments(process.argv.slice(ARGV_OFFSET));
  process.exitCode = runFormationSeedBudgetGate(options).exitCode;
}

export {
  GATE_OUTCOME,
  decideSeedBudgetGate,
  newestFormationOnlyReport,
  runFormationSeedBudgetGate,
};
