// Quest evidence-harness runtime — the single owner of the receipt-running
// loop shared by every deterministic quest evidence harness
// (scripts/quest-evidence-*.js). A harness declares its quest id, output
// file, and receipt list; this module re-runs each receipt's recorded proof
// command (the focused test file) and writes the test-receipt probe artifact.
// A receipt whose command fails flips the file to status "fail" and the
// quest's doneWhen cannot close on it — the probe trusts the file only
// because this loop re-executes the commands rather than trusting claims.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RECEIPT_SCHEMA = 'test-receipt/1';
const TEST_RUNNER = Object.freeze(['run', 'test:file', '--']);
const NPM_EXECUTABLE = 'npm';
const CHILD_STDIO_PIPE = 'pipe';
const UTF8_ENCODING = 'utf8';
const STATUS_PASS = 'pass';
const STATUS_FAIL = 'fail';
const EXIT_OK = 0;
const EXIT_FAILED = 1;
const SHELL_EXECUTABLE = '/bin/sh';
const SHELL_COMMAND_FLAG = '-c';
const DEFAULT_SHELL_TIMEOUT_MS = 600_000;
const TEST_NAME_PATTERN_FLAG = '--test-name-pattern';
// Forced: a harness run from inside node:test inherits NODE_TEST_CONTEXT and
// the nested runner would otherwise emit the binary v8 reporter, not TAP.
const TEST_REPORTER_ARGUMENT = '--test-reporter=tap';
const NODE_TEST_CONTEXT_ENV = 'NODE_TEST_CONTEXT';
const TAP_TESTS_LINE = /^# tests (\d+)$/mu;
const TAP_FAIL_LINE = /^# fail (\d+)$/mu;
const TAP_SKIPPED_LINE = /^# skipped (\d+)$/mu;
const TAP_TODO_LINE = /^# todo (\d+)$/mu;
const SKIPPED_OR_TODO_FAILURE =
  'the selected test was skipped or marked todo (never counts as proof)';
const ANCHORED_PATTERN = /^\^.*\$$/u;
const UNANCHORED_PATTERN_ERROR_PREFIX =
  'subtest receipt testNamePattern must be anchored ^...$: ';
const ZERO_TESTS_FAILURE = 'the pattern selected zero tests';
const TESTS_FAILED_SUFFIX = ' test(s) failed';
const PASSED_REASON = 'passed';
const MULTIPLE_TESTS_FAILURE_PREFIX = 'the pattern selected ';
const MULTIPLE_TESTS_FAILURE_SUFFIX =
  ' tests; anchor it to one or set allowMultiple';
const OUTPUT_FLAG = '--output';
const OUTPUT_FLAG_ASSIGNMENT_PREFIX = `${OUTPUT_FLAG}=`;
const ARGV_COMMAND_OFFSET = 2;
const OUTPUT_FLAG_VALUE_REQUIRED_ERROR =
  `${OUTPUT_FLAG} requires a receipt file path`;

// `--output <path>` (or `--output=<path>`) redirects the receipt to a scratch
// path so a verifier can regenerate a receipt without dirtying the tracked
// solve/evidence/ artifact; without it the harness writes its declared file.
function resolveReceiptOutputFile(declaredOutputFile, argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === OUTPUT_FLAG) {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(OUTPUT_FLAG_VALUE_REQUIRED_ERROR);
      }
      return value;
    }
    if (argument.startsWith(OUTPUT_FLAG_ASSIGNMENT_PREFIX)) {
      const value = argument.slice(OUTPUT_FLAG_ASSIGNMENT_PREFIX.length);
      if (value.length === 0) throw new Error(OUTPUT_FLAG_VALUE_REQUIRED_ERROR);
      return value;
    }
  }
  return declaredOutputFile;
}

function runReceipt(receipt) {
  const command = `${NPM_EXECUTABLE} ${TEST_RUNNER.join(' ')} ` +
    receipt.testFile;
  try {
    execFileSync(NPM_EXECUTABLE, [...TEST_RUNNER, receipt.testFile], {
      stdio: CHILD_STDIO_PIPE,
      encoding: UTF8_ENCODING,
    });
    return {id: receipt.id, passed: true, command, detail: receipt.detail};
  } catch (error) {
    return {
      id: receipt.id,
      passed: false,
      command,
      detail: receipt.detail,
      failure: String(error?.stderr || error?.message || error),
    };
  }
}

// A subtest receipt runs exactly one named test of a node:test file
// in-process (`node --test-name-pattern=... <file>`, no `--test`): the
// `--test` runner counts the FILE as one passing test when the pattern
// selects nothing, so only the in-process summary is honest about zero
// selected tests. It bypasses the classified lanes (unit/witness files that
// import node:test only). The honesty hole this closes: a pattern matching
// nothing exits 0, so a typo would go green. The TAP summary is parsed and
// the receipt fails on zero selected tests (and on more than one unless the
// receipt sets allowMultiple), on any failing test, and on a non-zero exit.
function subtestCommand(receipt) {
  return `${process.execPath} ${TEST_REPORTER_ARGUMENT} ` +
    `${TEST_NAME_PATTERN_FLAG}=${JSON.stringify(receipt.testNamePattern)} ` +
    receipt.testFile;
}

// The TAP summary verdict: {passed, reason}. A summary that selected zero
// tests, more than one (unless allowed), or any failing test is a failure
// with a named reason; a clean summary is a pass with an empty reason.
function classifySubtestSummary(receipt, stdout) {
  const count = (pattern) => Number.parseInt((pattern.exec(stdout) || [])[1], 10);
  const tests = count(TAP_TESTS_LINE);
  const failed = count(TAP_FAIL_LINE);
  const zeroSelected = !Number.isInteger(tests) || tests === 0;
  const tooMany = tests > 1 && receipt.allowMultiple !== true;
  const anyFailed = !Number.isInteger(failed) || failed > 0;
  // A skipped or todo test ran nothing: the classified runner fails closed
  // on those, and this lane must not be weaker than it.
  const skippedOrTodo = count(TAP_SKIPPED_LINE) > 0 || count(TAP_TODO_LINE) > 0;
  const reason = zeroSelected ? ZERO_TESTS_FAILURE :
    tooMany ? `${MULTIPLE_TESTS_FAILURE_PREFIX}${tests}${MULTIPLE_TESTS_FAILURE_SUFFIX}` :
      anyFailed ? `${failed}${TESTS_FAILED_SUFFIX}` :
        skippedOrTodo ? SKIPPED_OR_TODO_FAILURE : PASSED_REASON;
  return {passed: reason === PASSED_REASON, reason};
}

function runSubtestProcess(receipt) {
  try {
    const env = {...process.env};
    delete env[NODE_TEST_CONTEXT_ENV];
    const stdout = execFileSync(process.execPath, [
      TEST_REPORTER_ARGUMENT,
      `${TEST_NAME_PATTERN_FLAG}=${receipt.testNamePattern}`,
      receipt.testFile,
    ], {stdio: CHILD_STDIO_PIPE, encoding: UTF8_ENCODING, env});
    return {stdout, exited: true, reason: PASSED_REASON};
  } catch (error) {
    return {
      stdout: String(error?.stdout || ''),
      exited: false,
      reason: String(error?.stderr || error?.message || error),
    };
  }
}

function runSubtestReceipt(receipt) {
  const command = subtestCommand(receipt);
  if (!ANCHORED_PATTERN.test(String(receipt.testNamePattern))) {
    throw new Error(
      `${UNANCHORED_PATTERN_ERROR_PREFIX}${receipt.testNamePattern}`);
  }
  const run = runSubtestProcess(receipt);
  const summary = classifySubtestSummary(receipt, run.stdout);
  if (run.exited && summary.passed) {
    return {id: receipt.id, passed: true, command, detail: receipt.detail};
  }
  return {
    id: receipt.id,
    passed: false,
    command,
    detail: receipt.detail,
    failure: summary.passed ? run.reason : summary.reason,
  };
}

// A shell receipt re-runs one recorded proof command verbatim (used when
// the proof is not a focused test file — e.g. an example runner that must
// exit naturally). A hang is a failure: the timeout kills the child and
// execFileSync throws, flipping the receipt to failed.
function runShellReceipt(receipt) {
  try {
    execFileSync(
      SHELL_EXECUTABLE,
      [SHELL_COMMAND_FLAG, receipt.command],
      {
        stdio: CHILD_STDIO_PIPE,
        encoding: UTF8_ENCODING,
        timeout: receipt.timeoutMs || DEFAULT_SHELL_TIMEOUT_MS,
      },
    );
    return {id: receipt.id, passed: true, command: receipt.command,
      detail: receipt.detail};
  } catch (error) {
    return {
      id: receipt.id,
      passed: false,
      command: receipt.command,
      detail: receipt.detail,
      failure: String(error?.stderr || error?.message || error),
    };
  }
}

/**
 * Run every declared receipt's proof command and write the test-receipt
 * probe artifact for one quest.
 * @param {Object} options harness declaration
 * @param {string} options.questId the quest the receipt file belongs to
 * @param {string} options.outputFile solve/evidence/<quest>.receipt.json
 *   (overridden by a `--output <path>` process argument)
 * @param {Array<Object>} options.receipts frozen receipt declarations
 *   ({id, testFile, detail}); a receipt with a verbatim `command`
 *   string instead of `testFile` re-runs that shell command (with a
 *   timeout, so a hang is a failure) instead of a focused test file; a
 *   receipt with `testNamePattern` (anchored ^...$) runs exactly one named
 *   test of `testFile` through node:test and fails on zero selected tests
 * @return {void} exits non-zero when any receipt command fails
 */
function runQuestEvidenceHarness(options) {
  const outputFile = resolveReceiptOutputFile(
    options.outputFile,
    process.argv.slice(ARGV_COMMAND_OFFSET),
  );
  const receipts = options.receipts.map((receipt) => {
    if (typeof receipt.command === 'string') return runShellReceipt(receipt);
    if (typeof receipt.testNamePattern === 'string') {
      return runSubtestReceipt(receipt);
    }
    return runReceipt(receipt);
  });
  const status = receipts.every((r) => r.passed) ?
    STATUS_PASS :
    STATUS_FAIL;
  const payload = {
    schema: RECEIPT_SCHEMA,
    quest: options.questId,
    status,
    generatedAt: new Date().toISOString(),
    receipts,
  };
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  const failed = receipts.filter((r) => !r.passed);
  for (const receipt of failed) {
    process.stderr.write(
      `FAIL ${receipt.id} (${receipt.command})\n${receipt.failure}\n`);
  }
  process.stdout.write(
    `${outputFile}: ${status} (${receipts.length - failed.length}/` +
    `${receipts.length} receipts passing)\n`);
  process.exit(failed.length === 0 ? EXIT_OK : EXIT_FAILED);
}

export {runQuestEvidenceHarness};
