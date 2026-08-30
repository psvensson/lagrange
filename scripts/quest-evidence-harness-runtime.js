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
 *   timeout, so a hang is a failure) instead of a focused test file
 * @return {void} exits non-zero when any receipt command fails
 */
function runQuestEvidenceHarness(options) {
  const outputFile = resolveReceiptOutputFile(
    options.outputFile,
    process.argv.slice(ARGV_COMMAND_OFFSET),
  );
  const receipts = options.receipts.map((receipt) =>
    typeof receipt.command === 'string' ?
      runShellReceipt(receipt) :
      runReceipt(receipt));
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
