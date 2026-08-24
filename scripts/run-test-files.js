#!/usr/bin/env node

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Parser} from 'tap-parser';

import {
  extractTimeoutDeclarations,
} from './checks/test-timeout-declarations.js';

const DEFAULT_JOBS = 4;
const DEFAULT_TIMEOUT_MS = 600000;
const FAILURE_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
// Lane-scoped retry-failed-once policy (owner decision 2026-08-23, recorded
// with the release-certificate policy): a CI lane may export
// LAGRANGE_RETRY_FAILED_ONCE=1 so each failed file is rerun standalone
// exactly once - a standalone pass classifies the failure as an intrinsic
// intermittent (census-quest scope) and is REPORTED, never hidden; a
// standalone failure is a regression and stays red. The cap keeps the
// policy honest: a run with many failed files is breakage, not a flake
// profile, and is never retried.
const RETRY_FAILED_ONCE_ENV = 'LAGRANGE_RETRY_FAILED_ONCE';
const RETRY_FAILED_ONCE_ENABLED = '1';
const RETRY_FAILED_ONCE_MAX_FILES = 5;
const RETRY_FAILED_ONCE_BANNER_SUFFIX =
  ' failed file(s) standalone (census-classified, never hidden)\n';
const RETRY_FAILED_ONCE_OUTCOME = Object.freeze({
  FAIL: 'fail',
  PASS: 'pass',
});
const PROCESS_KILL_SIGNAL = 'SIGKILL';
const TAP_RESULT_SUFFIX = '.tap';
const STDERR_RESULT_SUFFIX = '.stderr';
const TAP_RESULTS_DIRECTORY = '.tap/test-results';
const TOP_LEVEL_TIME_PATTERN = /^# time=/m;
const TEXT_ENCODING = 'utf8';
const PARENT_DIRECTORY_PREFIX = '..';
const REASON_SEPARATOR = '; ';
const NO_FAILURE_REASONS = Object.freeze([]);
const TEST_PROCESS_NOT_STARTED = 'not_started';

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
  STREAM_INCOMPLETE: 'TAP stream did not complete',
  TIMED_OUT: 'test process timed out',
});

const TEST_NODE_ARGS = Object.freeze([
  `--import=${import.meta.resolve('@tapjs/typescript/import')}`,
  `--import=${import.meta.resolve('@tapjs/mock/import')}`,
  '--enable-source-maps',
  `--import=${import.meta.resolve('@tapjs/processinfo/import')}`,
  '--no-compilation-cache',
  '--max-old-space-size=512',
]);

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

function analyzeTapOutput(output) {
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
  parser.end(output);

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
  const outputFile = path.join(resultsDirectory, `${relativeFile}${TAP_RESULT_SUFFIX}`);
  const stderrFile = `${outputFile}${STDERR_RESULT_SUFFIX}`;
  mkdirSync(path.dirname(outputFile), {recursive: true});
  const stdoutFd = openSync(outputFile, 'w');
  const stderrFd = openSync(stderrFile, 'w');
  const env = {
    ...process.env,
    ...options.env,
    TAP_ALLOW_INCOMPLETE_COVERAGE: '1',
    TAP_FAIL_SKIP: '1',
    TAP_FAIL_TODO: '1',
    _TAPJS_PROCESSINFO_COVERAGE_: '0',
  };
  // Honor per-test {timeout: N} options written in the file: this tap
  // version silently CAPS every test at the 30s default - neither the
  // test option nor t.setTimeout() can extend past it (verified
  // empirically 2026-08-04; ten test files carried inert 45s-360s
  // options and passed only while faster than 30s, then flaked on the
  // slower CI runner). Only the TAP_TIMEOUT env genuinely extends the
  // cap, so lift it to the LARGEST option declared in the file. An
  // explicit caller TAP_TIMEOUT (for example the classified exclusive lane)
  // still wins; the per-file kill (--timeout-ms, default 600s) still
  // bounds the whole process.
  if (env.TAP_TIMEOUT === undefined) {
    const declaredTimeoutSeconds = largestDeclaredTimeoutSeconds(absoluteFile);
    if (declaredTimeoutSeconds !== null) {
      env.TAP_TIMEOUT = String(declaredTimeoutSeconds);
    }
  }
  return {
    absoluteFile,
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
function largestDeclaredTimeoutSeconds(absoluteFile) {
  let source;
  try {
    source = readFileSync(absoluteFile, TEXT_ENCODING);
  } catch {
    return null;
  }
  const {milliseconds, problems} =
    extractTimeoutDeclarations(source, absoluteFile);
  if (problems.length > 0) {
    throw new Error(
      `${UNRESOLVED_TIMEOUT_ERROR}${PROBLEM_INDENT}` +
      `${problems.join(PROBLEM_INDENT)}`);
  }
  const seconds = Math.ceil(milliseconds / MILLISECONDS_PER_SECOND);
  return seconds > TAP_DEFAULT_TIMEOUT_SECONDS ? seconds : null;
}

function finalizeTestRun(run, processResult, elapsedMs) {
  closeSync(run.stdoutFd);
  closeSync(run.stderrFd);
  let output = readFileSync(run.outputFile, TEXT_ENCODING);
  const stderr = readFileSync(run.stderrFile, TEXT_ENCODING);
  const analysis = analyzeTapOutput(output);
  if (!TOP_LEVEL_TIME_PATTERN.test(output)) {
    const timingComment = `# time=${elapsedMs}ms\n`;
    appendFileSync(run.outputFile, timingComment);
    output += timingComment;
  }
  const reasons = [...analysis.reasons];
  if (processResult.timedOut) reasons.push(FAILURE_REASON.TIMED_OUT);
  if (processResult.error) reasons.push(processResult.error.message);
  if (processResult.signal) reasons.push(`test process received ${processResult.signal}`);
  if (processResult.status !== SUCCESS_EXIT_CODE) {
    reasons.push(`test process exited ${processResult.status ?? FAILURE_REASON.NO_STATUS}`);
  }
  return {
    ...analysis,
    elapsedMs,
    file: run.relativeFile,
    ok: reasons.length === 0,
    output,
    outputFile: run.outputFile,
    reasons,
    status: processResult.status,
    stderr,
    stderrFile: run.stderrFile,
  };
}

function preparationFailure(file, error) {
  return {
    assertions: 0,
    elapsedMs: 0,
    file,
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
    const result = preparationFailure(file, error);
    if (options.print !== false) printTestResult(result);
    return result;
  }
  const startedAt = Date.now();
  const processResult = spawnSync(
    process.execPath,
    [...TEST_NODE_ARGS, run.absoluteFile],
    {
      cwd: run.cwd,
      env: run.env,
      stdio: ['ignore', run.stdoutFd, run.stderrFd],
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      killSignal: PROCESS_KILL_SIGNAL,
    },
  );
  const result = finalizeTestRun(run, {
    error: processResult.error,
    signal: processResult.signal,
    status: processResult.status,
    timedOut: processResult.error?.code === 'ETIMEDOUT',
  }, Date.now() - startedAt);
  if (options.print !== false) printTestResult(result);
  return result;
}

function runTestFile(file, options = {}) {
  let run;
  try {
    run = prepareTestRun(file, options);
  } catch (error) {
    const result = preparationFailure(file, error);
    if (options.print !== false) printTestResult(result);
    return Promise.resolve(result);
  }
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...TEST_NODE_ARGS, run.absoluteFile], {
      cwd: run.cwd,
      env: run.env,
      stdio: ['ignore', run.stdoutFd, run.stderrFd],
    });
    let timedOut = false;
    let spawnError = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill(PROCESS_KILL_SIGNAL);
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
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
      if (options.print !== false) printTestResult(result);
      resolve(result);
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
  const jobs = Math.min(options.jobs ?? DEFAULT_JOBS, files.length);
  const results = new Array(files.length);
  let nextFileIndex = 0;
  const worker = async () => {
    while (nextFileIndex < files.length) {
      const index = nextFileIndex++;
      results[index] = await runTestFile(files[index], options);
    }
  };
  await Promise.all(Array.from({length: jobs}, worker));
  const failed = results.filter((result) => !result.ok).length;
  const assertions = results.reduce((total, result) => total + result.assertions, 0);
  return {
    assertions,
    failed,
    ok: failed === 0,
    passed: results.length - failed,
    reasons: NO_FAILURE_REASONS,
    results,
    total: results.length,
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
  const summary = await runTestFiles(files, options);
  if (summary.reasons.length > 0) {
    process.stderr.write(`${summary.reasons.join(REASON_SEPARATOR)}\n`);
  }
  process.stdout.write(
    `# test-files total=${summary.total} pass=${summary.passed} ` +
    `fail=${summary.failed} assertions=${summary.assertions}\n`,
  );
  if (summary.ok) return SUCCESS_EXIT_CODE;
  const retryOnce =
    process.env[RETRY_FAILED_ONCE_ENV] === RETRY_FAILED_ONCE_ENABLED &&
    summary.failed > 0 &&
    summary.failed <= RETRY_FAILED_ONCE_MAX_FILES &&
    summary.results.length > 0;
  if (!retryOnce) return FAILURE_EXIT_CODE;
  const failedFiles = summary.results
    .filter((result) => !result.ok)
    .map((result) => result.file);
  process.stdout.write(
    `# retry-failed-once: rerunning ${failedFiles.length}` +
    RETRY_FAILED_ONCE_BANNER_SUFFIX,
  );
  let retriedAllGreen = true;
  for (const file of failedFiles) {
    const retried = await runTestFile(file, options);
    const retriedOutcome = retried.ok ?
      RETRY_FAILED_ONCE_OUTCOME.PASS :
      RETRY_FAILED_ONCE_OUTCOME.FAIL;
    process.stdout.write(`# retried-once ${retriedOutcome} ${file}\n`);
    if (!retried.ok) retriedAllGreen = false;
  }
  return retriedAllGreen ? SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE;
}

const IS_MAIN = path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (IS_MAIN) process.exitCode = await main();

export {
  analyzeTapOutput,
  filterTestFiles,
  parseOptions,
  runTestFile,
  runTestFileSync,
  runTestFiles,
};
