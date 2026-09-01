// Runs ONE anchored node:test scenario and fails closed unless that exact
// scenario actually executed and passed.
//
// `node --test --test-name-pattern=<p>` exits 0 when the pattern matches
// NOTHING, and its TAP summary is then indistinguishable from a real pass: a
// bogus pattern reports `# tests 1 / # pass 1`, because the file-level subtest
// is what ran. A receipt whose command is a bare pattern run therefore proves
// only that the FILE loaded — a renamed, deleted, or accidentally filtered
// scenario passes as loudly as a green one.
//
// The discriminator is the named TAP line. A real match emits
// `ok <n> - <scenario>` at top level; a zero-match run emits `1..0` and only
// the file path. This runner requires the named line, so a receipt built on it
// cannot pass while its scenario is absent.

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const NODE_EXECUTABLE = process.execPath;
const TEST_FLAG = '--test';
const NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern=';
const CHILD_STDIO = ['ignore', 'pipe', 'pipe'];
const UTF8_ENCODING = 'utf8';
const EXIT_OK = 0;
const EXIT_FAILED = 1;
const ARGV_TEST_FILE_INDEX = 2;
const ARGV_SCENARIO_INDEX = 3;
const ARGV_ENTRY_INDEX = 1;
const REGEXP_METACHARACTERS = /[.*+?^${}()|[\]\\]/gu;
const REGEXP_ESCAPE_REPLACEMENT = '\\$&';
const USAGE =
  'usage: node test/bootstrap/run-anchored-scenario-helper.js ' +
  '<testFile> <scenarioName>';
const NEWLINE = '\n';
const RESULT_SEPARATOR = ' - ';
const PASS_LINE_PREFIX = 'ok ';
const FAIL_LINE_PREFIX = 'not ok ';
const PATTERN_ANCHOR_START = '^';
const PATTERN_ANCHOR_END = '$';
const ENV_TEST_CONTEXT = 'NODE_TEST_CONTEXT';
const ENV_NODE_OPTIONS = 'NODE_OPTIONS';
const REASON_PREFIX = 'run-anchored-scenario: ';
const SCENARIO_FAILED_REASON = 'scenario FAILED: ';
const SCENARIO_ABSENT_REASON = 'scenario DID NOT RUN: ';
const SCENARIO_ABSENT_DETAIL =
  'no top-level `ok <n> - <scenario>` line. A zero-match ' +
  '--test-name-pattern run exits 0 and reports `# pass 1`, so an ' +
  'absent scenario must be caught here';
const IN_FILE_JOINER = ' in ';
const DETAIL_SEPARATOR = ' — ';
const EXIT_REASON_PREFIX = 'test process exited ';

function escapeForRegExp(value) {
  return value.replace(REGEXP_METACHARACTERS, REGEXP_ESCAPE_REPLACEMENT);
}

// Top level only: an indented `ok 1 - name` belongs to a nested subtest and
// must not satisfy the anchor.
function hasTopLevelResultLine(output, prefix, scenarioName) {
  const suffix = `${RESULT_SEPARATOR}${scenarioName}`;
  return output.split(NEWLINE).some((line) => {
    if (!line.startsWith(prefix)) return false;
    return line.trimEnd().endsWith(suffix);
  });
}

// One explicit state model for the run, rather than several independent ifs
// each returning its own outcome object.
const RUN_OUTCOME = Object.freeze({
  RAN_AND_PASSED: 'ran_and_passed',
  SCENARIO_FAILED: 'scenario_failed',
  SCENARIO_ABSENT: 'scenario_absent',
  PROCESS_ERROR: 'process_error',
});

function classifyRun(output, scenarioName, status) {
  if (hasTopLevelResultLine(output, FAIL_LINE_PREFIX, scenarioName)) {
    return RUN_OUTCOME.SCENARIO_FAILED;
  }
  if (!hasTopLevelResultLine(output, PASS_LINE_PREFIX, scenarioName)) {
    return RUN_OUTCOME.SCENARIO_ABSENT;
  }
  return status === EXIT_OK ?
    RUN_OUTCOME.RAN_AND_PASSED :
    RUN_OUTCOME.PROCESS_ERROR;
}

function describeOutcome(outcome, {scenarioName, testFile, status}) {
  const reasons = {
    [RUN_OUTCOME.SCENARIO_FAILED]:
      () => SCENARIO_FAILED_REASON + scenarioName,
    [RUN_OUTCOME.SCENARIO_ABSENT]:
      () => SCENARIO_ABSENT_REASON + scenarioName + IN_FILE_JOINER +
        testFile + DETAIL_SEPARATOR + SCENARIO_ABSENT_DETAIL,
    [RUN_OUTCOME.PROCESS_ERROR]:
      () => EXIT_REASON_PREFIX + String(status),
  };
  return reasons[outcome]?.();
}

function runAnchoredScenario(testFile, scenarioName) {
  const pattern =
    NAME_PATTERN_FLAG_PREFIX + PATTERN_ANCHOR_START +
    escapeForRegExp(scenarioName) + PATTERN_ANCHOR_END;
  // NODE_TEST_CONTEXT switches the runner's reporter away from TAP, and an
  // inherited --test-name-pattern in NODE_OPTIONS would filter the child a
  // second time. Either one makes the named result line disappear and would
  // report a present scenario as absent, so the child gets a clean env.
  const childEnv = {...process.env};
  delete childEnv[ENV_TEST_CONTEXT];
  delete childEnv[ENV_NODE_OPTIONS];
  const child = spawnSync(
    NODE_EXECUTABLE,
    [TEST_FLAG, pattern, testFile],
    {stdio: CHILD_STDIO, encoding: UTF8_ENCODING, env: childEnv},
  );
  const output = [child.stdout, child.stderr].filter(Boolean).join(NEWLINE);
  const outcome = classifyRun(output, scenarioName, child.status);
  return {
    outcome,
    output,
    reason: describeOutcome(outcome, {
      scenarioName, testFile, status: child.status,
    }),
  };
}

// Runs as a CLI for the receipts, and is imported by the witness so the
// classifier can be asserted directly rather than only through a subprocess.
function main() {
  const testFile = process.argv[ARGV_TEST_FILE_INDEX];
  const scenarioName = process.argv[ARGV_SCENARIO_INDEX];
  if (!testFile || !scenarioName) {
    process.stderr.write(`${USAGE}${NEWLINE}`);
    process.exit(EXIT_FAILED);
  }
  const result = runAnchoredScenario(testFile, scenarioName);
  if (result.outcome !== RUN_OUTCOME.RAN_AND_PASSED) {
    process.stdout.write(result.output);
    process.stderr.write(
      `${REASON_PREFIX}${result.reason}${NEWLINE}`);
    process.exit(EXIT_FAILED);
  }
  process.stdout.write(result.output);
  process.exit(EXIT_OK);
}

if (process.argv[ARGV_ENTRY_INDEX] &&
  path.resolve(process.argv[ARGV_ENTRY_INDEX]) ===
    fileURLToPath(import.meta.url)) {
  main();
}

// Only what the witness actually asserts on: an exported-but-unused symbol
// is dead surface and the unused-export ratchet counts it.
export {RUN_OUTCOME, classifyRun};
