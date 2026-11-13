#!/usr/bin/env node
import {resolveTestMachineFactor, scaleByMachineFactor} from './test-machine-factor.js';

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {gitProcessEnvironment} from './checks/git-process-environment.js';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Parser} from 'tap-parser';

import {
  extractTimeoutDeclarations,
} from './checks/test-timeout-declarations.js';
import {
  EXECUTION_SECTIONS_ENV, SECTION_KIND, appendExecutionSection, describeCheckout,
  fileResultRecord,
} from './test-execution-report.js';
import {THERMAL_REFUSAL, THERMAL_REFUSAL_EXIT, fileExecutionEnvironment}
  from './checks/wait-for-thermal-headroom.js';
import {BATCH_PREVIOUS_CLOSE_ENV, runAdmittedTestFiles} from './test-file-admission.js';
import {flushCoverageBeforeKill} from './checks/census-pre-kill-flush.js';
import {PARENT_DIRECTORY_PREFIX, TEXT_ENCODING, readBoundedOutput} from './test-output-reader.js';

export {readBoundedOutput};

export const BATCH_RESULT_ENV = 'LAGRANGE_TEST_BATCH_RESULT_FD';
export const BATCH_RESULT_FD = 3;
const DEFAULT_JOBS = 4;
const DEFAULT_TIMEOUT_MS = 600000;
const FAILURE_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
// One scheduled execution supplies one outcome. A later diagnostic run
// cannot replace this attempt's failure or turn it into successful proof.
const FIRST_ATTEMPT = 1;
const PROCESS_KILL_SIGNAL = 'SIGKILL';
const TAP_RESULT_SUFFIX = '.tap';
const STDERR_RESULT_SUFFIX = '.stderr';
const TAP_RESULTS_DIRECTORY = '.tap/test-results';
const TOP_LEVEL_TIME_PREFIX = '# time=';
const MISSING_FILE_CODE = 'ENOENT';
const REASON_SEPARATOR = '; ';
const NO_FAILURE_REASONS = Object.freeze([]);
const TEST_PROCESS_NOT_STARTED = 'not_started';
const FAILED_ASSERTION_PREFIX = 'not ok ';
// One per-file result ledger: every attempt of every file the CLI runs
// appends one JSON line here, the durable record of which files are slow,
// and which are red. It is git-ignored with the rest
// of test-output. A library caller names its own ledger or writes none.
// The runner owns this path whole: the gate executes the runner, so nothing
// it imports may live outside the modules that trip the full corpus.
const TEST_RESULTS_LEDGER_ROOT = 'test-output';
const TEST_RESULTS_LEDGER_DIRECTORY = 'reports';
const TEST_RESULTS_LEDGER_NAME = 'test-results.ndjson';
const TEST_RESULTS_LEDGER_FILE = path.join(TEST_RESULTS_LEDGER_ROOT,
  TEST_RESULTS_LEDGER_DIRECTORY, TEST_RESULTS_LEDGER_NAME);
// Bounded: past this size the ledger starts over and the full one is kept as
// the single previous generation, about 30 whole-corpus runs each.
const TEST_RESULTS_LEDGER_ROTATE_BYTES = 16 * 1024 * 1024;
const TEST_RESULTS_LEDGER_PREVIOUS_NAME = 'test-results.previous.ndjson';
const LEDGER_LINE_END = '\n';
// The host facts a timeout carries, sampled when the file is killed.
const BYTES_PER_MEBIBYTE = 1024 * 1024;
const LOAD_AVERAGE_ONE_MINUTE = 0;
const LOAD_DECIMALS = 2;
// Hardware-relative budget scaling (hardware-relative-convergence-budget
// epic): CI lanes and placed lab runs export LAGRANGE_TEST_MACHINE_FACTOR; the
// reference machine is 1, and non-numeric, absent or below 1 means 1. This is
// owner is scripts/test-machine-factor.js. The runner records it on a timeout
// and resolves that owner's scaling operation in timeout declarations.

const CLI_OPTION = Object.freeze({
  FILTER: '--filter',
  FILTER_PREFIX: '--filter=',
  JOBS: '--jobs',
  JOBS_PREFIX: '--jobs=',
  PREFIX: '-',
  TIMEOUT_MS: '--timeout-ms',
  TIMEOUT_MS_PREFIX: '--timeout-ms=',
});

const PARSER_EVENT = Object.freeze({
  ASSERT: 'assert',
  CHILD: 'child',
  COMPLETE: 'complete',
});

const PROCESS_EVENT = Object.freeze({
  CLOSE: 'close',
  ERROR: 'error',
});

const FAILURE_REASON = Object.freeze({
  ASSERTIONS_FAILED: 'TAP assertions failed',
  NO_ASSERTIONS: 'no assertions executed',
  NO_FILTER_MATCHES: 'no test files matched --filter',
  NO_STATUS: 'without a status',
  NO_TEST_FILES: 'no test files provided',
  OUTPUT_UNANALYSED: 'output line past the analysis bound: ',
  STREAM_INCOMPLETE: 'TAP stream did not complete',
  TIMED_OUT: 'test process timed out',
});

// The loaders every test process starts with. Only the mock plugin serves
// anything (t.mockImport, two files); @tapjs/typescript (+245 ms) and
// @tapjs/processinfo (+135 ms) were loaded into ~1700 processes per corpus
// for no .ts file, no coverage and no reader of .tap/processinfo - measured
// 2026-09-17: 530 ms -> 207 ms idle start-up per process without them.
// --no-compilation-cache stays: it was added for a V8 crash class
// (3bac105f1); NODE_COMPILE_CACHE is evaluated on the canary first.
const TEST_NODE_ARGS = Object.freeze([
  `--import=${import.meta.resolve('@tapjs/mock/import')}`,
  // Both TAP and node:test files reach this one runner. Node's implicit
  // node:test reporter may emit human-readable output, which the TAP parser
  // cannot certify. Pin the output contract for every test process.
  '--test-reporter=tap',
  '--enable-source-maps',
  '--no-compilation-cache',
  '--max-old-space-size=512',
]);
// The fallback-branch census (scripts/checks/fallback-branch-census.js
// collect) raises the heap limit: V8 block coverage parses each coverage
// write into the heap, which takes a 512 MB test process over its limit.
const TEST_HEAP_ENV = 'LAGRANGE_TEST_MAX_OLD_SPACE_MB';
const HEAP_FLAG_PREFIX = '--max-old-space-size=';

/**
 * The node arguments of a test process: TEST_NODE_ARGS, with the heap limit
 * TEST_HEAP_ENV names when it is a positive integer.
 * @param {Object} [env]
 * @return {ReadonlyArray<string>}
 */
function testNodeArgs(env = process.env) {
  const raised = Number(env[TEST_HEAP_ENV]);
  if (!Number.isInteger(raised) || raised < 1) return TEST_NODE_ARGS;
  return TEST_NODE_ARGS.map((argument) => (argument.startsWith(HEAP_FLAG_PREFIX) ?
    `${HEAP_FLAG_PREFIX}${raised}` : argument));
}

function parsePositiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

function requireOptionValue(value, option) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${option} requires a non-empty value`);
  }
  return value;
}

function parseOptions(argv) {
  const options = {
    files: [],
    filter: null,
    jobs: DEFAULT_JOBS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith(CLI_OPTION.FILTER_PREFIX)) {
      options.filter = requireOptionValue(
        argument.slice(CLI_OPTION.FILTER_PREFIX.length),
        CLI_OPTION.FILTER,
      );
    } else if (argument === CLI_OPTION.FILTER) {
      options.filter = requireOptionValue(argv[++index], CLI_OPTION.FILTER);
    } else if (argument.startsWith(CLI_OPTION.JOBS_PREFIX)) {
      options.jobs = parsePositiveInteger(
        argument.slice(CLI_OPTION.JOBS_PREFIX.length),
        CLI_OPTION.JOBS,
      );
    } else if (argument === CLI_OPTION.JOBS) {
      options.jobs = parsePositiveInteger(argv[++index], CLI_OPTION.JOBS);
    } else if (argument.startsWith(CLI_OPTION.TIMEOUT_MS_PREFIX)) {
      options.timeoutMs = parsePositiveInteger(
        argument.slice(CLI_OPTION.TIMEOUT_MS_PREFIX.length),
        CLI_OPTION.TIMEOUT_MS,
      );
    } else if (argument === CLI_OPTION.TIMEOUT_MS) {
      options.timeoutMs = parsePositiveInteger(argv[++index], CLI_OPTION.TIMEOUT_MS);
    } else if (argument.startsWith(CLI_OPTION.PREFIX)) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      options.files.push(argument);
    }
  }
  return options;
}

// The analysis, as a sink: the parser is a streaming one, so a caller with a
// 600 MB file feeds it chunk by chunk instead of one string it cannot hold.
function createTapAnalysis() {
  let assertions = 0;
  let skips = 0;
  let todos = 0;
  let finalResults = null;

  const observeParser = (parser) => {
    parser.on(PARSER_EVENT.ASSERT, (result) => {
      assertions += 1;
      if (result.skip || result.diag?.failedSkip) skips += 1;
      if (result.todo || result.diag?.failedTodo) todos += 1;
    });
    parser.on(PARSER_EVENT.CHILD, observeParser);
  };

  const parser = new Parser();
  observeParser(parser);
  parser.on(PARSER_EVENT.COMPLETE, (results) => {
    finalResults = results;
  });

  return {
    end: () => {
      parser.end();
      return summarizeAnalysis({assertions, finalResults, skips, todos});
    },
    write: (chunk) => parser.write(chunk),
  };
}

function summarizeAnalysis({assertions, finalResults, skips, todos}) {
  const reasonSet = new Set();
  if (!finalResults) reasonSet.add(FAILURE_REASON.STREAM_INCOMPLETE);
  if (finalResults && !finalResults.ok) {
    reasonSet.add(FAILURE_REASON.ASSERTIONS_FAILED);
  }
  if (assertions === 0) reasonSet.add(FAILURE_REASON.NO_ASSERTIONS);
  if (skips > 0) reasonSet.add(`${skips} skipped assertion(s)`);
  if (todos > 0) reasonSet.add(`${todos} todo assertion(s)`);

  return {
    assertions,
    skips,
    todos,
    parserOk: finalResults?.ok === true,
    reasons: [...reasonSet],
  };
}

function analyzeTapOutput(output) {
  const analysis = createTapAnalysis();
  analysis.write(output);
  return analysis.end();
}

function normalizeTestFile(cwd, file) {
  const absoluteFile = path.resolve(cwd, file);
  const relativeFile = path.relative(cwd, absoluteFile);
  if (relativeFile.startsWith(PARENT_DIRECTORY_PREFIX) || path.isAbsolute(relativeFile)) {
    throw new Error(`test file is outside the working directory: ${file}`);
  }
  if (!existsSync(absoluteFile) || !statSync(absoluteFile).isFile()) {
    throw new Error(`test file does not exist: ${file}`);
  }
  return {absoluteFile, relativeFile};
}

function prepareTestRun(file, options) {
  const cwd = options.cwd ?? process.cwd();
  const resultsDirectory = path.resolve(
    cwd,
    options.resultsDirectory ?? TAP_RESULTS_DIRECTORY,
  );
  const {absoluteFile, relativeFile} = normalizeTestFile(cwd, file);
  // No test process inherits a git repository pointer: a push from a linked
  // worktree runs the gate with git's GIT_DIR exported, and a fixture that
  // commits, configures or resets would reach the pusher's repository
  // (2026-09-13) - while a test that reads the repository must read the
  // checkout it runs in. One owner here, for every test file.
  const env = fileExecutionEnvironment({
    ...gitProcessEnvironment({...process.env, ...options.env}),
    TAP_ALLOW_INCOMPLETE_COVERAGE: '1',
    TAP_FAIL_SKIP: '1',
    TAP_FAIL_TODO: '1',
    _TAPJS_PROCESSINFO_COVERAGE_: '0',
  }, absoluteFile);
  const outputFile = path.join(resultsDirectory, `${relativeFile}${TAP_RESULT_SUFFIX}`);
  const stderrFile = `${outputFile}${STDERR_RESULT_SUFFIX}`;
  mkdirSync(path.dirname(outputFile), {recursive: true});
  const stdoutFd = openSync(outputFile, 'w');
  const stderrFd = openSync(stderrFile, 'w');
  // A node:test parent sets NODE_TEST_CONTEXT=child-v8. A separately spawned
  // file inheriting it emits binary test events even with the TAP reporter
  // selected. Each file belongs to this runner's TAP capture, not its caller's
  // internal test stream; establish that boundary for both launch methods.
  delete env.NODE_TEST_CONTEXT;
  // A test file is never part of the run that reports it: a runner it spawns
  // drives the test's own fixtures (deliberately failing files, throwaway
  // repositories), and its sections would be read as this proof's
  // (proof-receipt-bound-to-validated-execution).
  delete env[EXECUTION_SECTIONS_ENV];
  delete env[BATCH_RESULT_ENV];
  delete env[BATCH_PREVIOUS_CLOSE_ENV];
  // Honor per-test {timeout: N} options written in the file: this tap
  // version silently CAPS every test at the 30s default - neither the
  // test option nor t.setTimeout() can extend past it (verified
  // empirically 2026-08-04; ten test files carried inert 45s-360s
  // options and passed only while faster than 30s, then flaked on the
  // slower CI runner). Only the TAP_TIMEOUT env genuinely extends the
  // cap, so lift it to the LARGEST option declared in the file. An
  // explicit caller TAP_TIMEOUT still wins outright; a caller that only
  // wants a minimum (for example the classified exclusive lane) passes
  // TAP_TIMEOUT_FLOOR instead, which raises undeclared files without
  // cutting a file below its own declaration — clobbering declarations
  // is exactly how a 480s formation test came to die at 120s while its
  // declared budget said otherwise. The per-file kill (--timeout-ms,
  // default 600s) still bounds the whole process.
  if (env.TAP_TIMEOUT === undefined) {
    const declaredTimeoutSeconds = resolveFileTapTimeoutSeconds(absoluteFile, env);
    const resolvedTimeoutSeconds = Math.max(
      declaredTimeoutSeconds ?? 0,
      parsedTimeoutFloorSeconds(env.TAP_TIMEOUT_FLOOR),
    );
    if (resolvedTimeoutSeconds > 0) {
      env.TAP_TIMEOUT = String(resolvedTimeoutSeconds);
    }
  }
  return {
    absoluteFile,
    budgetMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    cwd,
    env,
    file,
    outputFile,
    relativeFile,
    stderrFd,
    stderrFile,
    stdoutFd,
  };
}

const MILLISECONDS_PER_SECOND = 1000;
const TAP_DEFAULT_TIMEOUT_SECONDS = 30;
const PROBLEM_INDENT = '\n  ';
const UNRESOLVED_TIMEOUT_ERROR =
  'run-test-files: unresolved timeout declaration — refusing to fall back to ' +
  `tap's ${TAP_DEFAULT_TIMEOUT_SECONDS}s default, which would silently cap ` +
  'the test:';

// Declarations are parsed, not pattern-matched, and an unresolvable one is a
// hard error. Falling back to the default cap is exactly how 18 files came to
// declare 45s-300s and run at 30s anyway; a refactor to
// `const T = BASE * MULTIPLIER;` must fail loudly instead of re-creating that.
// A floor is advice, not authority: it raises files with no usable
// declaration and never lowers one that declares more.
function parsedTimeoutFloorSeconds(value) {
  const seconds = Number.parseInt(value ?? '', 10);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : 0;
}

function resolveFileTapTimeoutSeconds(absoluteFile, env) {
  let source;
  try {
    source = readFileSync(absoluteFile, TEXT_ENCODING);
  } catch {
    return null;
  }
  const {milliseconds, hasDeclaration, problems} =
    extractTimeoutDeclarations(source, absoluteFile, {env});
  if (problems.length > 0) {
    throw new Error(
      `${UNRESOLVED_TIMEOUT_ERROR}${PROBLEM_INDENT}` +
      `${problems.join(PROBLEM_INDENT)}`);
  }
  // The implicit TAP root is a reference-machine work budget too. Scale it
  // through the same child-env owner, only when the parser saw no declaration.
  // Small/zero declarations retain their existing root behavior; positive
  // declarations were already resolved and must never be scaled twice.
  if (!hasDeclaration) {
    return Math.ceil(scaleByMachineFactor(
      TAP_DEFAULT_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,
      resolveTestMachineFactor(env),
    ) / MILLISECONDS_PER_SECOND);
  }
  const seconds = Math.ceil(milliseconds / MILLISECONDS_PER_SECOND);
  return seconds > TAP_DEFAULT_TIMEOUT_SECONDS ? seconds : null;
}

function finalizeTestRun(run, processResult, elapsedMs) {
  closeSync(run.stdoutFd);
  closeSync(run.stderrFd);
  const parse = createTapAnalysis();
  let sawTopLevelTime = false;
  let firstFailedAssertion = null;
  const read = readBoundedOutput(run.outputFile, {
    consume: (chunk) => parse.write(chunk),
    onLinePrefix: (line) => {
      if (line.startsWith(TOP_LEVEL_TIME_PREFIX)) sawTopLevelTime = true;
      const assertion = line.trimStart();
      if (firstFailedAssertion === null &&
          assertion.startsWith(FAILED_ASSERTION_PREFIX)) {
        firstFailedAssertion = assertion;
      }
    },
  });
  const analysis = parse.end();
  const stderrRead = readBoundedOutput(run.stderrFile);
  const stderr = stderrRead.excerpt;
  let output = read.excerpt;
  if (!sawTopLevelTime) {
    const timingComment = `# time=${elapsedMs}ms\n`;
    appendFileSync(run.outputFile, timingComment);
    output += timingComment;
  }
  const reasons = [...analysis.reasons];
  // A capped line is a line the parser did not see whole, and a cut can move
  // the verdict: `ok 1 - <runaway> # SKIP reason` loses its skip and reads as
  // a plain pass (verifier round 2). So an incomplete analysis fails the file
  // by construction - whatever the cut happened to remove - rather than
  // reporting a verdict it cannot stand behind.
  if (read.dropped > 0) {
    reasons.push(`${FAILURE_REASON.OUTPUT_UNANALYSED}` +
      `${read.dropped} byte(s) of ${read.bytes} were not analysed`);
  }
  const timeout = processResult.timedOut ?
    sampleTimeout(run.budgetMs, elapsedMs, run.env) : null;
  if (timeout) reasons.push(describeTimeout(timeout));
  if (processResult.error) reasons.push(processResult.error.message);
  if (processResult.signal) reasons.push(`test process received ${processResult.signal}`);
  if (processResult.status !== SUCCESS_EXIT_CODE) {
    reasons.push(`test process exited ${processResult.status ?? FAILURE_REASON.NO_STATUS}`);
  }
  return {
    ...analysis,
    elapsedMs,
    file: run.relativeFile,
    firstFailureLine: reasons.length === 0 ? null :
      firstFailedAssertion ?? reasons[0],
    ok: reasons.length === 0,
    output,
    outputBytes: read.bytes,
    outputDropped: read.dropped,
    outputFile: run.outputFile,
    outputTruncated: read.truncated,
    reasons,
    status: processResult.status,
    stderr,
    stderrBytes: stderrRead.bytes,
    stderrFile: run.stderrFile,
    timeout,
  };
}

// What the host was doing when a file ran out of budget, so a timeout on a
// loaded or slow machine reads as a budget question rather than a regression.
function sampleTimeout(budgetMs, elapsedMs, env) {
  return {
    budgetMs,
    elapsedMs,
    load1: Number(os.loadavg()[LOAD_AVERAGE_ONE_MINUTE].toFixed(LOAD_DECIMALS)),
    cores: os.availableParallelism(),
    freeMemMb: Math.round(os.freemem() / BYTES_PER_MEBIBYTE),
    machineFactor: resolveTestMachineFactor(env),
  };
}

function describeTimeout(timeout) {
  return `${FAILURE_REASON.TIMED_OUT} after ${timeout.elapsedMs}ms of a ` +
    `${timeout.budgetMs}ms budget; at the kill load1=${timeout.load1} ` +
    `cores=${timeout.cores} freeMemMb=${timeout.freeMemMb} ` +
    `machineFactor=${timeout.machineFactor}`;
}

// A ledger past its bound becomes the previous generation, replacing the one
// before it; an absent ledger has nothing to rotate.
function rotateLedger(ledgerFile) {
  let size;
  try {
    size = statSync(ledgerFile).size;
  } catch (error) {
    if (error.code === MISSING_FILE_CODE) return;
    throw error;
  }
  if (size <= TEST_RESULTS_LEDGER_ROTATE_BYTES) return;
  renameSync(ledgerFile,
    path.join(path.dirname(ledgerFile), TEST_RESULTS_LEDGER_PREVIOUS_NAME));
}

function recordAttempt(result, options) {
  if (!options.ledgerFile) return;
  const line = {
    file: result.file,
    attempt: FIRST_ATTEMPT,
    ok: result.ok,
    assertions: result.assertions,
    durationMs: result.elapsedMs,
    firstFailureLine: result.firstFailureLine,
  };
  if (result.timeout) line.timeout = result.timeout;
  mkdirSync(path.dirname(options.ledgerFile), {recursive: true});
  appendFileSync(options.ledgerFile, JSON.stringify(line) + LEDGER_LINE_END);
}

function settleResult(result, options) {
  recordAttempt(result, options);
  if (options.print !== false) printTestResult(result);
  return result;
}

function preparationFailure(file, error) {
  return {
    assertions: 0,
    elapsedMs: 0,
    file,
    firstFailureLine: error.message,
    ok: false,
    output: '',
    reasons: [error.message],
    status: TEST_PROCESS_NOT_STARTED,
    stderr: '',
  };
}

function printTestResult(result) {
  const summary = result.ok ? 'ok' : 'not ok';
  process.stdout.write(
    `${summary} ${result.file} (${result.assertions} assertions, ${result.elapsedMs}ms)\n`,
  );
  if (result.ok) return;
  process.stdout.write(`# ${result.reasons.join(REASON_SEPARATOR)}\n`);
  if (result.output) process.stdout.write(result.output);
  if (result.stderr) process.stderr.write(result.stderr);
}

function runTestFileSync(file, options = {}) {
  let run;
  try {
    run = prepareTestRun(file, options);
  } catch (error) {
    return settleResult(preparationFailure(file, error), options);
  }
  const startedAt = Date.now();
  const processResult = spawnSync(
    process.execPath,
    [...testNodeArgs(), run.absoluteFile],
    {
      cwd: run.cwd,
      env: run.env,
      stdio: ['ignore', run.stdoutFd, run.stderrFd],
      timeout: run.budgetMs,
      killSignal: PROCESS_KILL_SIGNAL,
    },
  );
  const result = finalizeTestRun(run, {
    error: processResult.error,
    signal: processResult.signal,
    status: processResult.status,
    timedOut: processResult.error?.code === 'ETIMEDOUT',
  }, Date.now() - startedAt);
  return settleResult(result, options);
}

function runTestFile(file, options = {}) {
  let run;
  try {
    run = prepareTestRun(file, options);
  } catch (error) {
    return Promise.resolve(settleResult(preparationFailure(file, error), options));
  }
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...testNodeArgs(), run.absoluteFile], {
      cwd: run.cwd,
      env: run.env,
      stdio: ['ignore', run.stdoutFd, run.stderrFd],
    });
    let timedOut = false;
    let spawnError = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      flushCoverageBeforeKill(child.pid, PROCESS_KILL_SIGNAL, {env: run.env});
      child.kill(PROCESS_KILL_SIGNAL);
    }, run.budgetMs);
    timeout.unref();
    child.on(PROCESS_EVENT.ERROR, (error) => {
      spawnError = error;
    });
    child.on(PROCESS_EVENT.CLOSE, (status, signal) => {
      clearTimeout(timeout);
      const result = finalizeTestRun(run, {
        error: spawnError,
        signal,
        status,
        timedOut,
      }, Date.now() - startedAt);
      resolve(settleResult(result, options));
    });
  });
}

async function runTestFiles(files, options = {}) {
  if (files.length === 0) {
    return {
      assertions: 0,
      failed: 1,
      ok: false,
      passed: 0,
      reasons: [FAILURE_REASON.NO_TEST_FILES],
      results: [],
      total: 0,
    };
  }
  if (options.ledgerFile) rotateLedger(options.ledgerFile);
  const {results, refusal, nextFileIndex, unresolved} = await runAdmittedTestFiles(files,
    {...options, jobs: options.jobs ?? DEFAULT_JOBS}, runTestFile);
  const write = options.write ?? ((text) => process.stdout.write(text));
  const failed = results.filter((result) => !result.ok).length;
  const notRun = files.slice(nextFileIndex);
  if (unresolved.length > 0) write(`# file outcomes unresolved: ${unresolved.join(' ')}\n`);
  if (refusal) {
    write(`thermal: ${THERMAL_REFUSAL} ${refusal.reason}\n`);
    write(`# ${THERMAL_REFUSAL}: ${notRun.length} file(s) not run: ${notRun.join(' ')}\n`);
  }
  const assertions = results.reduce((total, result) => total + result.assertions, 0);
  return {
    assertions,
    failed,
    ok: failed === 0 && refusal === null,
    passed: results.length - failed,
    reasons: refusal ? [THERMAL_REFUSAL] : NO_FAILURE_REASONS,
    results,
    total: results.length,
    notRun,
    admissionRefused: refusal !== null,
    exitStatus: failed > 0 ? FAILURE_EXIT_CODE : refusal ? THERMAL_REFUSAL_EXIT : SUCCESS_EXIT_CODE,
  };
}

// Substring filter over the provided test file paths (`--filter <substring>`).
// Filtering an explicit non-empty file list down to nothing fails closed —
// a typo in the filter must never look like a passing empty run.
function filterTestFiles(files, filter) {
  if (!filter) return files;
  return files.filter((file) => file.includes(filter));
}

async function main() {
  let options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return FAILURE_EXIT_CODE;
  }
  const files = filterTestFiles(options.files, options.filter);
  if (options.filter && options.files.length > 0 && files.length === 0) {
    process.stderr.write(`${FAILURE_REASON.NO_FILTER_MATCHES}\n`);
    return FAILURE_EXIT_CODE;
  }
  const runOptions = {
    ...options,
    ledgerFile: path.resolve(process.cwd(), TEST_RESULTS_LEDGER_FILE),
  };
  const report = executionSections(files);
  const summary = await runTestFiles(files, runOptions);
  if (summary.reasons.length > 0) {
    process.stderr.write(`${summary.reasons.join(REASON_SEPARATOR)}\n`);
  }
  process.stdout.write(`${formatTestFilesSummary(summary)}\n`);
  const status = summary.exitStatus ?? (summary.ok ? SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE);
  report.end(summary, status);
  if (process.env[BATCH_RESULT_ENV] !== undefined) {
    if (process.env[BATCH_RESULT_ENV] !== String(BATCH_RESULT_FD)) {
      throw new Error('invalid batch terminal channel');
    }
    writeFileSync(BATCH_RESULT_FD, JSON.stringify({
      refused: summary.admissionRefused === true, exitStatus: status,
    }));
  }
  return status;
}

// The execution report's runner sections (scripts/test-execution-report.js):
// when the environment names a sections file, this run appends where it ran
// and what it was given before running anything, and every file's result -
// the one attempt of every file - with its terminal exit status.
// A run killed in between leaves its start
// alone: a truncated run the proof authority refuses.
function executionSections(files, env = process.env) {
  const file = env[EXECUTION_SECTIONS_ENV];
  if (!file) return {end: () => {}};
  const runId = `${process.pid}-${Date.now()}`;
  appendExecutionSection(file, {kind: SECTION_KIND.START, runId,
    argv: process.argv.slice(2), checkout: describeCheckout(process.cwd()),
    planned: [...files]});
  return {
    end(summary, exitStatus) {
      appendExecutionSection(file, {kind: SECTION_KIND.END, runId, exitStatus,
        results: summary.results.map((result) => fileResultRecord(result))});
    },
  };
}

/**
 * The one summary line a run of test files ends with. A lab run that merges
 * several machines' verdicts prints the same line, from this owner.
 * @param {{total: number, passed: number, failed: number, assertions: number}} summary
 * @return {string}
 */
function formatTestFilesSummary(summary) {
  return `# test-files total=${summary.total} pass=${summary.passed} ` +
    `fail=${summary.failed} assertions=${summary.assertions}`;
}

// The runner's own stdout lines, as a reader of a finished run matches them -
// verdict (printTestResult), summary
// (formatTestFilesSummary) - and the classified runner's plan and signalled
// batch lines and a placed run's relay prefix, formatted below.
const TEST_FILE_LINE = Object.freeze({
  VERDICT: /^(ok|not ok) (\S+) \((\d+) assertions, \d+ms\)$/u,
  VERDICT_HEAD: /^(?:ok|not ok) [^\s\d]/u,
  SUMMARY: /^# test-files total=(\d+) pass=\d+ fail=\d+ assertions=\d+$/u,
  PLANNED: /^# test-files planned=(\d+)$/u,
  BATCH_SIGNAL: /^# test-files batch ended by (\S+):/u,
  RELAYED_PREFIX: /^\[[^\]]+\] /u,
});
const RED_VERDICT = 'not ok';
const READER_SHAPES = Object.freeze(['VERDICT', 'SUMMARY', 'PLANNED', 'BATCH_SIGNAL']);
const formatPlannedLine = (files) => `# test-files planned=${files}`;
const formatBatchSignalLine = (signal, files) =>
  `# test-files batch ended by ${signal}: ${files} file(s) may have no verdict`;
const relayedLine = (name, line) => `[${name}] ${line}`;

/**
 * What a run's stdout says about its files, fed one line at a time, relayed
 * lines read as the controller's own. A failure or zero-assertion outcome
 * cannot be erased by a later line. Memory is one entry per file, never output.
 * @return {{read: Function, result: Function}}
 */
function testFileVerdictReader() {
  const red = new Map();
  const seen = {summaries: 0, summarised: 0, planned: 0, unread: 0, signal: null};
  return {
    read(text, whole = true) {
      const line = text.replace(TEST_FILE_LINE.RELAYED_PREFIX, '');
      const [verdict, summary, planned, signal] =
        READER_SHAPES.map((shape) => TEST_FILE_LINE[shape].exec(line));
      if (!whole) {
        seen.unread += TEST_FILE_LINE.VERDICT_HEAD.test(line) ? 1 : 0;
      } else if (verdict) {
        red.set(verdict[2], red.get(verdict[2]) === true ||
          verdict[1] === RED_VERDICT || Number(verdict[3]) === 0);
      } else if (summary) {
        seen.summaries += 1;
        seen.summarised += Number(summary[1]);
      } else if (planned) {
        seen.planned += Number(planned[1]);
      } else if (signal) {
        seen.signal ??= signal[1];
      }
    },
    result: () => ({...seen,
      runner: red.size + seen.summaries + seen.planned + seen.unread > 0 || Boolean(seen.signal),
      failing: [...red].filter(([, isRed]) => isRed).map(([file]) => file)}),
  };
}

const IS_MAIN = path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (IS_MAIN) process.exitCode = await main();

export {
  TEST_FILE_LINE,
  TEST_HEAP_ENV,
  TEST_NODE_ARGS,
  TEST_RESULTS_LEDGER_ROTATE_BYTES,
  analyzeTapOutput,
  filterTestFiles,
  formatBatchSignalLine,
  formatPlannedLine,
  formatTestFilesSummary,
  parseOptions,
  relayedLine,
  runTestFile,
  runTestFileSync,
  runTestFiles,
  testFileVerdictReader,
  testNodeArgs,
};
