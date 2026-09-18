#!/usr/bin/env node

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
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
const TOP_LEVEL_TIME_PREFIX = '# time=';
// A test's own output is read in chunks and never held whole. One file of
// 608,651,868 bytes (message-group-multi-join-formation under lane
// contention, 2026-09-17) passed V8's string cap, so readFileSync threw
// ERR_STRING_TOO_LONG inside finalizeTestRun and killed the runner - taking
// 220 of 262 already-green exclusive files with it. The parser is a streaming
// one, so feeding it chunks analyses every byte at constant memory; only a
// bounded excerpt is kept, because the only consumer of the text is the echo
// of a FAILED file, and echoing half a gigabyte helps nobody.
const OUTPUT_CHUNK_BYTES = 1024 * 1024;
const OUTPUT_EXCERPT_EDGE_BYTES = 64 * 1024;
const EXCERPT_ELISION_PREFIX = '\n# ... ';
const EXCERPT_ELISION_MIDDLE = ' byte(s) elided; full output in ';
const EXCERPT_ELISION_SUFFIX = ' ...\n';
const FILE_READ_FLAG = 'r';
const EMPTY_BUFFER = Buffer.alloc(0);
const OUTPUT_LINE_PREFIX_BYTES = 256;
// Measured 2026-09-18 over all 2,577 .tap and .stderr artifacts in this
// repository: the longest single line is 9,886 bytes, so this bound has about
// 106x headroom against what the corpus actually emits. A file that does
// exceed it is failed rather than analysed in part; if that ever bites a
// legitimate test, raise this number - narrowing the rule to "lines that look
// like TAP" would not be safe, because the verdict-changing shape begins
// with `ok `.
const OUTPUT_LINE_ANALYSIS_BYTES = 1024 * 1024;
const LINE_FEED_BYTE = 0x0a;
const CARRIAGE_RETURN_BYTE = 0x0d;
const NOT_FOUND = -1;
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
  '--enable-source-maps',
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
  // explicit caller TAP_TIMEOUT still wins outright; a caller that only
  // wants a minimum (for example the classified exclusive lane) passes
  // TAP_TIMEOUT_FLOOR instead, which raises undeclared files without
  // cutting a file below its own declaration — clobbering declarations
  // is exactly how a 480s formation test came to die at 120s while its
  // declared budget said otherwise. The per-file kill (--timeout-ms,
  // default 600s) still bounds the whole process.
  if (env.TAP_TIMEOUT === undefined) {
    const declaredTimeoutSeconds = largestDeclaredTimeoutSeconds(absoluteFile);
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

/**
 * Read one test's output file without ever holding it whole, in BYTES: every
 * line's bytes go to `consume` up to OUTPUT_LINE_ANALYSIS_BYTES, each line's
 * first OUTPUT_LINE_PREFIX_BYTES go to `onLinePrefix`, and only the first and
 * last OUTPUT_EXCERPT_EDGE_BYTES of the file are retained. A file no larger
 * than the two edges is returned verbatim.
 *
 * The cap is per LINE, not per file, because the consumer is a TAP parser
 * that accumulates until it sees a line end (`this.buffer += chunk`): a
 * newline-free 520 MiB output overflows inside the parser however carefully
 * the file itself is streamed. TAP semantics live at the start of a line -
 * `ok`, `not ok`, `1..N`, `#` - so a line's head is forwarded intact and only
 * the runaway tail of that same line is dropped, counted in `dropped`. Two
 * earlier shapes of this reader died on exactly this input: readFileSync
 * (2026-09-17, one 608,651,868-byte file killed a 262-file lane) and a
 * whole-line accumulator (verifier round 1).
 * @param {string} file
 * @param {{consume?: Function, onLinePrefix?: Function}} [handlers]
 * @return {{bytes: number, dropped: number, excerpt: string, truncated: boolean}}
 */
export function readBoundedOutput(file, handlers = {}) {
  const {consume = null, onLinePrefix = null} = handlers;
  const buffer = Buffer.alloc(OUTPUT_CHUNK_BYTES);
  const descriptor = openSync(file, FILE_READ_FLAG);
  const prefix = Buffer.alloc(OUTPUT_LINE_PREFIX_BYTES);
  let bytes = 0;
  let dropped = 0;
  let head = EMPTY_BUFFER;
  let tail = EMPTY_BUFFER;
  let prefixLength = 0;
  let lineBytes = 0;
  let lineOpen = false;
  const endLine = () => {
    if (onLinePrefix && lineOpen) {
      onLinePrefix(prefix.subarray(0, prefixLength).toString(TEXT_ENCODING));
    }
    prefixLength = 0;
    lineBytes = 0;
    lineOpen = false;
  };
  const takeSegment = (chunk, from, to) => {
    if (to > from) {
      lineOpen = true;
      const room = OUTPUT_LINE_PREFIX_BYTES - prefixLength;
      if (onLinePrefix && room > 0) {
        const take = to - from < room ? to - from : room;
        chunk.copy(prefix, prefixLength, from, from + take);
        prefixLength += take;
      }
      // The parser sees this line's head and nothing past the cap, so its
      // buffer can never grow without bound.
      const analysable = OUTPUT_LINE_ANALYSIS_BYTES - lineBytes;
      if (consume && analysable > 0) {
        const end = to - from < analysable ? to : from + analysable;
        consume(chunk.subarray(from, end));
        dropped += to - end;
      } else if (consume) {
        dropped += to - from;
      }
      lineBytes += to - from;
    }
  };
  const scanLines = (chunk) => {
    let index = 0;
    while (index < chunk.length) {
      const end = lineEndIndex(chunk, index);
      if (end === NOT_FOUND) {
        takeSegment(chunk, index, chunk.length);
        return;
      }
      takeSegment(chunk, index, end);
      // The line terminator always reaches the parser: it is what flushes it.
      lineOpen = true;
      if (consume) consume(chunk.subarray(end, end + 1));
      endLine();
      index = end + 1;
    }
  };
  try {
    let read = readSync(descriptor, buffer, 0, OUTPUT_CHUNK_BYTES, null);
    while (read > 0) {
      const chunk = buffer.subarray(0, read);
      bytes += read;
      scanLines(chunk);
      if (head.length < OUTPUT_EXCERPT_EDGE_BYTES) {
        head = Buffer.concat([head,
          chunk.subarray(0, OUTPUT_EXCERPT_EDGE_BYTES - head.length)]);
      }
      tail = Buffer.concat([tail, chunk]);
      if (tail.length > OUTPUT_EXCERPT_EDGE_BYTES) {
        tail = Buffer.from(tail.subarray(tail.length - OUTPUT_EXCERPT_EDGE_BYTES));
      }
      read = readSync(descriptor, buffer, 0, OUTPUT_CHUNK_BYTES, null);
    }
  } finally {
    closeSync(descriptor);
  }
  endLine();
  const elided = bytes - head.length - tail.length;
  if (elided <= 0) {
    // The edges overlap or meet: the bytes after the head are exactly the
    // last (bytes - head) of the tail.
    return {
      bytes,
      dropped,
      excerpt: Buffer.concat([head,
        tail.subarray(tail.length - (bytes - head.length))]).toString(TEXT_ENCODING),
      truncated: false,
    };
  }
  return {
    bytes,
    dropped,
    excerpt: `${head.toString(TEXT_ENCODING)}${EXCERPT_ELISION_PREFIX}` +
      `${elided}${EXCERPT_ELISION_MIDDLE}${displayPath(file)}` +
      `${EXCERPT_ELISION_SUFFIX}${tail.toString(TEXT_ENCODING)}`,
    truncated: true,
  };
}

// A line ends at the first LF or CR: the pattern this replaced was /^# time=/m,
// and JavaScript anchors a multiline ^ after either.
function lineEndIndex(chunk, from) {
  const lf = chunk.indexOf(LINE_FEED_BYTE, from);
  const cr = chunk.indexOf(CARRIAGE_RETURN_BYTE, from);
  if (lf === NOT_FOUND) return cr;
  if (cr === NOT_FOUND) return lf;
  return lf < cr ? lf : cr;
}

// A report that embeds an excerpt should not carry this machine's paths.
function displayPath(file) {
  const relative = path.relative(process.cwd(), file);
  return relative.length > 0 && !relative.startsWith(PARENT_DIRECTORY_PREFIX) ?
    relative : file;
}

function finalizeTestRun(run, processResult, elapsedMs) {
  closeSync(run.stdoutFd);
  closeSync(run.stderrFd);
  const parse = createTapAnalysis();
  let sawTopLevelTime = false;
  const read = readBoundedOutput(run.outputFile, {
    consume: (chunk) => parse.write(chunk),
    onLinePrefix: (line) => {
      if (line.startsWith(TOP_LEVEL_TIME_PREFIX)) sawTopLevelTime = true;
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
    outputBytes: read.bytes,
    outputDropped: read.dropped,
    outputFile: run.outputFile,
    outputTruncated: read.truncated,
    reasons,
    status: processResult.status,
    stderr,
    stderrBytes: stderrRead.bytes,
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
  return retryFailedOnce(summary, options);
}

// The policy above, as one exported unit so a witness can hold it: the
// rerun happens only under the declared environment and the cap, every
// rerun is written to `write`, and a standalone failure stays red.
async function retryFailedOnce(summary, options = {}, {
  env = process.env,
  runFile = runTestFile,
  write = (line) => process.stdout.write(line),
} = {}) {
  const retryOnce =
    env[RETRY_FAILED_ONCE_ENV] === RETRY_FAILED_ONCE_ENABLED &&
    summary.failed > 0 &&
    summary.failed <= RETRY_FAILED_ONCE_MAX_FILES &&
    summary.results.length > 0;
  if (!retryOnce) return FAILURE_EXIT_CODE;
  const failedFiles = summary.results
    .filter((result) => !result.ok)
    .map((result) => result.file);
  write(
    `# retry-failed-once: rerunning ${failedFiles.length}` +
    RETRY_FAILED_ONCE_BANNER_SUFFIX,
  );
  let retriedAllGreen = true;
  for (const file of failedFiles) {
    const retried = await runFile(file, options);
    const retriedOutcome = retried.ok ?
      RETRY_FAILED_ONCE_OUTCOME.PASS :
      RETRY_FAILED_ONCE_OUTCOME.FAIL;
    write(`# retried-once ${retriedOutcome} ${file}\n`);
    if (!retried.ok) retriedAllGreen = false;
  }
  return retriedAllGreen ? SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE;
}

const IS_MAIN = path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (IS_MAIN) process.exitCode = await main();

export {
  RETRY_FAILED_ONCE_ENABLED,
  RETRY_FAILED_ONCE_ENV,
  TEST_NODE_ARGS,
  analyzeTapOutput,
  filterTestFiles,
  parseOptions,
  retryFailedOnce,
  runTestFile,
  runTestFileSync,
  runTestFiles,
};
