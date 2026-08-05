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

/**
 * Run every declared receipt's proof command and write the test-receipt
 * probe artifact for one quest.
 * @param {Object} options harness declaration
 * @param {string} options.questId the quest the receipt file belongs to
 * @param {string} options.outputFile solve/evidence/<quest>.receipt.json
 * @param {Array<Object>} options.receipts frozen receipt declarations
 *   ({id, testFile, detail})
 * @return {void} exits non-zero when any receipt command fails
 */
function runQuestEvidenceHarness(options) {
  const receipts = options.receipts.map(runReceipt);
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
  fs.mkdirSync(path.dirname(options.outputFile), {recursive: true});
  fs.writeFileSync(options.outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  const failed = receipts.filter((r) => !r.passed);
  for (const receipt of failed) {
    process.stderr.write(
      `FAIL ${receipt.id} (${receipt.command})\n${receipt.failure}\n`);
  }
  process.stdout.write(
    `${options.outputFile}: ${status} (${receipts.length - failed.length}/` +
    `${receipts.length} receipts passing)\n`);
  process.exit(failed.length === 0 ? EXIT_OK : EXIT_FAILED);
}

export {runQuestEvidenceHarness};
