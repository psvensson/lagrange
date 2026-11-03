/**
 * The test execution report: the one machine-readable account of what a proof
 * run executed, written by the runner side and validated by the proof
 * authority before any passing receipt is minted (proof-receipt-bound-to-
 * validated-execution).
 *
 * A report is assembled from runner SECTIONS. Every scripts/run-test-files.js
 * process whose environment names a sections file (EXECUTION_SECTIONS_ENV)
 * appends one `start` line before it runs anything - the checkout it runs in
 * and the files it was given - and one `end` line after its last attempt:
 * every file's result with its assertion count, every attempt of a retried
 * file, and the exit status. A start without its end is a truncated run.
 *
 * The producer (the release proof, the push gate, the local corpus) wraps the
 * sections with the candidate it set out to prove, the commands it ran with
 * their exit statuses, the planned corpus manifest and any durable proof it
 * lawfully reused. The authority recomputes every verdict from the per-file
 * results and the runs, never from a producer's summary. The ceiling: the
 * sections and the report are written by the producer's own processes and are
 * not signed, so the report is evidence the producer's run recorded, not an
 * attestation; the receipt's reportDigest is an audit pointer to it. The
 * planned manifest is the producer's (scripts/plan-test-lane.js
 * wholeCorpusFiles); the authority does not recompute it.
 *
 * This module is the one owner of the schema, the writer and the validator.
 * It imports only node built-ins and the git invocation helper, so the
 * runner, the producers and the authority can all hold it.
 */

import fs from 'node:fs';
import path from 'node:path';

import {spawnGit} from './checks/git-invocation.js';

const EXECUTION_REPORT_SCHEMA = 'lagrange-test-execution-report/v1';
const EXECUTION_SECTIONS_ENV = 'LAGRANGE_EXECUTION_REPORT';
const EXECUTION_SECTIONS_PATH = 'test-output/reports/execution-sections.ndjson';
const EXECUTION_REPORT_PATH = 'test-output/reports/execution-report.json';
const UTF8 = 'utf8';
const NEWLINE = '\n';
const FULL_SHA = /^[0-9a-f]{40}$/u;

const SECTION_KIND = Object.freeze({START: 'start', END: 'end'});
const GIT_REV_PARSE = 'rev-parse';
// The fields a report cannot be read without, and how a problem names them.
const REPORT_FIELD = Object.freeze({
  CANDIDATE: 'candidate', PRODUCER: 'producer', COMMANDS: 'commands', PLANNED: 'planned',
  RUNS: 'runs', REUSED_PROOFS: 'reusedProofs',
});
const DETAIL = Object.freeze({
  NO_REPORT: 'no execution report',
  NOT_AN_OBJECT: 'the report is not a JSON object',
  EMPTY_PLAN: 'empty planned manifest',
  FIELD_SEPARATOR: ',',
  NO_IDENTITY: 'none',
  UNNAMED_COMMAND: 'command',
  UNKNOWN_HEAD: 'unknown',
});

// How a proof contract treats a file that failed and then passed on its one
// standalone retry. REFUSE: no receipt. ADMIT_QUALIFIED: a receipt that
// carries the qualification and is never a clean pass.
const RETRY_POLICY = Object.freeze({
  REFUSE: 'refuse',
  ADMIT_QUALIFIED: 'admit-qualified',
});

// Typed refusals. Each is a reason a passing receipt may not be minted.
const EXECUTION_PROBLEM = Object.freeze({
  REPORT_ABSENT: 'execution-report-absent',
  REPORT_MALFORMED: 'execution-report-malformed',
  REPORT_SCHEMA: 'execution-report-schema-mismatch',
  REPORT_PARTIAL: 'execution-report-partial',
  CANDIDATE_SHA_MISMATCH: 'execution-report-candidate-sha-mismatch',
  CANDIDATE_TREE_MISMATCH: 'execution-report-candidate-tree-mismatch',
  CANDIDATE_NOT_CLEAN: 'execution-report-candidate-not-clean',
  IDENTITY_MISMATCH: 'execution-report-identity-mismatch',
  COMMAND_FAILED: 'execution-report-command-failed',
  RUN_FAILED: 'execution-report-run-failed',
  RUN_TRUNCATED: 'execution-report-run-truncated',
  RUN_OTHER_CHECKOUT: 'execution-report-run-other-checkout',
  PLANNED_FILE_FAILED: 'execution-report-planned-file-failed',
  PLANNED_FILE_NOT_EXECUTED: 'execution-report-planned-file-not-executed',
  ZERO_ASSERTION_PASS: 'execution-report-zero-assertion-pass',
  PASSED_ON_RETRY: 'execution-report-passed-on-retry',
  REUSED_PROOF_UNPROVEN: 'execution-report-reused-proof-unproven',
  REUSED_PROOF_NOT_CITABLE: 'execution-report-reused-proof-not-citable',
});

// --- writing (runner and producers) ----------------------------------------

function gitText(args, cwd) {
  const result = spawnGit(args, {cwd, encoding: UTF8,
    stdio: ['ignore', 'pipe', 'pipe']});
  return result.status === 0 ? String(result.stdout).trim() : null;
}

/**
 * The checkout at cwd as a run records it: HEAD, its tree, and whether the
 * tracked bytes outside Solver records are exactly that commit's. The same
 * cleanliness the proof authority's release identity requires.
 * @param {string} cwd
 * @return {{head: string|null, tree: string|null, clean: boolean, root: string|null}}
 */
function describeCheckout(cwd) {
  const head = gitText([GIT_REV_PARSE, 'HEAD'], cwd);
  const root = gitText([GIT_REV_PARSE, '--show-toplevel'], cwd);
  if (!FULL_SHA.test(String(head)) || root === null) {
    return {head: null, tree: null, clean: false, root: null};
  }
  const status = gitText(['status', '--porcelain', '--untracked-files=no', '--', '.',
    ':!solve/'], root);
  return {head, tree: gitText([GIT_REV_PARSE, `${head}^{tree}`], root),
    clean: status === '', root};
}

/**
 * Start an empty sections file, replacing any earlier run's.
 * @param {string} file
 * @return {string}
 */
function openExecutionSections(file) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, '', UTF8);
  return file;
}

/**
 * Append one runner section line.
 * @param {string} file
 * @param {Object} section
 */
function appendExecutionSection(file, section) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.appendFileSync(file, `${JSON.stringify(section)}${NEWLINE}`, UTF8);
}

function attemptRecord(result, attempt) {
  return {attempt, ok: result.ok === true, assertions: Number(result.assertions) || 0,
    reasons: Array.isArray(result.reasons) ? [...result.reasons] : []};
}

/**
 * One file's result as a section carries it: the decisive verdict and every
 * attempt, first attempt first. A retried file keeps its first failure.
 * @param {Object} first the first attempt's runner result
 * @param {Object|null} retry the standalone retry's result, if any
 * @return {Object}
 */
function fileResultRecord(first, retry = null) {
  const attempts = [attemptRecord(first, 1)];
  if (retry) attempts.push(attemptRecord(retry, 2));
  const decisive = attempts[attempts.length - 1];
  return {file: first.file, ok: decisive.ok, assertions: decisive.assertions, attempts};
}

function readSectionLines(file) {
  let text;
  try {
    text = fs.readFileSync(file, UTF8);
  } catch {
    return [];
  }
  const sections = [];
  for (const line of text.split(NEWLINE)) {
    if (line.trim() === '') continue;
    try {
      sections.push(JSON.parse(line));
    } catch {
      // A half-written line is not a section; its run then has no end.
    }
  }
  return sections;
}

/**
 * Pair every runner's start with its end. A start without an end stays,
 * marked incomplete: it is the evidence of a truncated run.
 * @param {string} file
 * @return {Object[]}
 */
function readExecutionRuns(file) {
  const runs = new Map();
  for (const section of readSectionLines(file)) {
    if (typeof section?.runId !== 'string') continue;
    const run = runs.get(section.runId) || {runId: section.runId, complete: false};
    if (section.kind === SECTION_KIND.START) {
      Object.assign(run, {checkout: section.checkout ?? null, argv: section.argv ?? [],
        planned: section.planned ?? []});
    } else if (section.kind === SECTION_KIND.END) {
      Object.assign(run, {results: section.results ?? [], exitStatus: section.exitStatus,
        complete: true});
    }
    runs.set(section.runId, run);
  }
  return [...runs.values()];
}

/**
 * The report a producer writes: its candidate, commands, planned manifest,
 * reused proofs and the runs its sections recorded.
 * @param {{candidate: Object, producer: Object, commands: Object[],
 *   planned: string[], runs: Object[], reusedProofs?: Object[]}} input
 * @return {Object}
 */
function buildExecutionReport({candidate, producer, commands, planned, runs,
  reusedProofs = []}) {
  return {
    schema: EXECUTION_REPORT_SCHEMA,
    candidate,
    producer,
    commands,
    planned: [...planned],
    reusedProofs: [...reusedProofs],
    runs,
  };
}

function writeExecutionReport(file, report) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}${NEWLINE}`, UTF8);
  return file;
}

/**
 * A report file that exists but cannot be read as JSON: named apart from an
 * absent one, so a corrupted report is never mistaken for a missing one.
 */
class MalformedExecutionReport {
  constructor(detail) {
    this.detail = detail;
  }
}

/**
 * Read a report file: null when there is no file, a MalformedExecutionReport
 * when it cannot be read or parsed.
 * @param {string} file
 * @return {Object|MalformedExecutionReport|null}
 */
function readExecutionReport(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, UTF8));
  } catch (error) {
    return new MalformedExecutionReport(error.message);
  }
}

// --- validation (the proof authority) --------------------------------------

function problem(code, detail) {
  return {code, detail};
}

function isList(value) {
  return Array.isArray(value);
}

function partialFields(report) {
  const missing = [];
  if (!report.candidate || typeof report.candidate !== 'object') missing.push(REPORT_FIELD.CANDIDATE);
  if (!report.producer?.kind || !report.producer?.id) missing.push(REPORT_FIELD.PRODUCER);
  if (!isList(report.commands) || report.commands.length === 0) missing.push(REPORT_FIELD.COMMANDS);
  if (!isList(report.planned)) missing.push(REPORT_FIELD.PLANNED);
  if (!isList(report.runs)) missing.push(REPORT_FIELD.RUNS);
  if (!isList(report.reusedProofs)) missing.push(REPORT_FIELD.REUSED_PROOFS);
  return missing;
}

function shapeProblems(report) {
  if (report === null || report === undefined) {
    return [problem(EXECUTION_PROBLEM.REPORT_ABSENT, DETAIL.NO_REPORT)];
  }
  if (report instanceof MalformedExecutionReport) {
    return [problem(EXECUTION_PROBLEM.REPORT_MALFORMED, report.detail)];
  }
  if (typeof report !== 'object' || Array.isArray(report)) {
    return [problem(EXECUTION_PROBLEM.REPORT_MALFORMED, DETAIL.NOT_AN_OBJECT)];
  }
  if (report.schema !== EXECUTION_REPORT_SCHEMA) {
    return [problem(EXECUTION_PROBLEM.REPORT_SCHEMA, String(report.schema))];
  }
  const missing = partialFields(report);
  if (missing.length > 0) {
    return [problem(EXECUTION_PROBLEM.REPORT_PARTIAL, missing.join(DETAIL.FIELD_SEPARATOR))];
  }
  if (report.planned.length === 0 && report.reusedProofs.length === 0) {
    return [problem(EXECUTION_PROBLEM.REPORT_PARTIAL, DETAIL.EMPTY_PLAN)];
  }
  return [];
}

function identityProblems(candidate, identity) {
  if (!identity) return [];
  const carried = candidate.identity;
  if (carried?.algorithm === identity.algorithm && carried?.digest === identity.digest) {
    return [];
  }
  return [problem(EXECUTION_PROBLEM.IDENTITY_MISMATCH,
    `${carried?.digest ?? DETAIL.NO_IDENTITY} != ${identity.digest}`)];
}

function candidateProblems(candidate, {sha, tree, identity}) {
  const problems = [];
  if (!FULL_SHA.test(String(candidate.sha)) || candidate.sha !== sha) {
    problems.push(problem(EXECUTION_PROBLEM.CANDIDATE_SHA_MISMATCH, `${candidate.sha} != ${sha}`));
  }
  if (!tree || candidate.tree !== tree) {
    problems.push(problem(EXECUTION_PROBLEM.CANDIDATE_TREE_MISMATCH,
      `${candidate.tree} != ${tree}`));
  }
  if (candidate.clean !== true) {
    problems.push(problem(EXECUTION_PROBLEM.CANDIDATE_NOT_CLEAN, String(candidate.clean)));
  }
  return [...problems, ...identityProblems(candidate, identity)];
}

function commandProblems(commands) {
  return commands
    .filter((command) => command?.exitStatus !== 0)
    .map((command) => problem(EXECUTION_PROBLEM.COMMAND_FAILED,
      `${command?.label ?? DETAIL.UNNAMED_COMMAND} exited ${command?.exitStatus}`));
}

function runCheckoutProblem(run, sha) {
  const checkout = run.checkout;
  if (checkout?.head === sha && checkout?.clean === true) return [];
  return [problem(EXECUTION_PROBLEM.RUN_OTHER_CHECKOUT,
    `${run.runId} ran in ${checkout?.head ?? DETAIL.UNKNOWN_HEAD} (clean=${checkout?.clean})`)];
}

function runProblems(runs, sha) {
  const problems = [];
  for (const run of runs) {
    if (run?.complete !== true) {
      problems.push(problem(EXECUTION_PROBLEM.RUN_TRUNCATED, String(run?.runId)));
      continue;
    }
    problems.push(...runCheckoutProblem(run, sha));
    if (run.exitStatus !== 0) {
      problems.push(problem(EXECUTION_PROBLEM.RUN_FAILED,
        `${run.runId} exited ${run.exitStatus}`));
    }
  }
  return problems;
}

// One file's verdict across every complete run that ran it, independent of
// the order the runs appear in: ok only when every run's result is ok, the
// fewest assertions any run counted, and every attempt of every run. A clean
// run never erases another run's failure, retry or empty pass.
function mergedResult(file, results) {
  const counts = results.map((result) => Number(result?.assertions) || 0);
  return {
    file,
    ok: results.every((result) => result?.ok === true),
    assertions: Math.min(...counts),
    attempts: results.flatMap((result) => (isList(result?.attempts) ?
      result.attempts : [{ok: result?.ok === true, assertions: Number(result?.assertions) || 0}])),
  };
}

function resultsByFile(runs) {
  const collected = new Map();
  for (const run of runs) {
    if (run?.complete !== true || !isList(run.results)) continue;
    for (const result of run.results) {
      const held = collected.get(result?.file) || [];
      collected.set(result?.file, [...held, result]);
    }
  }
  const byFile = new Map();
  for (const [file, results] of collected) byFile.set(file, mergedResult(file, results));
  return byFile;
}

function startedFiles(runs) {
  const files = new Set();
  for (const run of runs) {
    for (const file of isList(run?.planned) ? run.planned : []) files.add(file);
  }
  return files;
}

// Green, yet some attempt in some run was not: a pass that needed a retry.
function retriedPass(result) {
  return result.ok === true && result.attempts.some((attempt) => attempt?.ok !== true);
}

function qualificationOf(result) {
  return {file: result.file, attempts: result.attempts.map((attempt) => ({...attempt}))};
}

function fileProblems(result, file, policy, qualification) {
  if (!result) return [problem(EXECUTION_PROBLEM.PLANNED_FILE_NOT_EXECUTED, file)];
  if (result.ok !== true) return [problem(EXECUTION_PROBLEM.PLANNED_FILE_FAILED, file)];
  if (!(Number(result.assertions) > 0)) {
    return [problem(EXECUTION_PROBLEM.ZERO_ASSERTION_PASS, file)];
  }
  if (!retriedPass(result)) return [];
  if (policy === RETRY_POLICY.ADMIT_QUALIFIED) {
    qualification.push(qualificationOf(result));
    return [];
  }
  return [problem(EXECUTION_PROBLEM.PASSED_ON_RETRY, file)];
}

function corpusProblems(report, policy, requiredFiles = []) {
  const byFile = resultsByFile(report.runs);
  const planned = new Set(report.planned);
  const required = new Set(requiredFiles ?? []);
  const files = new Set([...planned, ...startedFiles(report.runs), ...required]);
  const problems = [];
  const qualification = [];
  for (const file of [...files].sort()) {
    const result = required.has(file) && !planned.has(file) ? undefined : byFile.get(file);
    problems.push(...fileProblems(result, file, policy, qualification));
  }
  return {problems, qualification};
}

function summaryOf(report, qualification) {
  const byFile = resultsByFile(report.runs);
  let assertions = 0;
  for (const result of byFile.values()) assertions += Number(result?.assertions) || 0;
  return {
    planned: report.planned.length,
    executed: byFile.size,
    assertions,
    runs: report.runs.length,
    commands: report.commands.map((command) => ({label: command.label,
      exitStatus: command.exitStatus})),
    reusedProofs: report.reusedProofs.map((proof) => ({...proof})),
    passedOnRetry: qualification.length,
  };
}

/**
 * Every reason this report cannot support a passing receipt for `sha`.
 * Reused proofs are listed, not resolved: the authority resolves them.
 * @param {Object|null} report
 * @param {{sha: string, tree: string|null, identity?: Object|null,
 *   retryPolicy?: string, requiredFiles?: Iterable<string>}} [expectation]
 * @return {{problems: {code: string, detail: string}[],
 *   qualification: Object[], summary: Object|null}}
 */
function executionReportProblems(report, {sha, tree, identity = null,
  retryPolicy = RETRY_POLICY.REFUSE, requiredFiles = []} = {}) {
  const shape = shapeProblems(report);
  if (shape.length > 0) return {problems: shape, qualification: [], summary: null};
  const corpus = corpusProblems(report, retryPolicy, requiredFiles);
  return {
    problems: [
      ...candidateProblems(report.candidate, {sha, tree, identity}),
      ...commandProblems(report.commands),
      ...runProblems(report.runs, sha),
      ...corpus.problems,
    ],
    qualification: corpus.qualification,
    summary: summaryOf(report, corpus.qualification),
  };
}

export {
  EXECUTION_PROBLEM,
  EXECUTION_REPORT_PATH,
  EXECUTION_REPORT_SCHEMA,
  EXECUTION_SECTIONS_ENV,
  EXECUTION_SECTIONS_PATH,
  RETRY_POLICY,
  SECTION_KIND,
  appendExecutionSection,
  buildExecutionReport,
  describeCheckout,
  executionReportProblems,
  fileResultRecord,
  openExecutionSections,
  readExecutionReport,
  readExecutionRuns,
  writeExecutionReport,
};
