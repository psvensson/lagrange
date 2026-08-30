/**
 * Record one local release-gate receipt honestly.
 *
 *   node scripts/checks/record-release-gate-receipt.js <name> \
 *     [--receipt-dir <dir>] -- <command...>
 *
 * Runs <command...> (argv, no shell) with inherited stdio in the repository
 * root and writes test-output/reports/release-gate-receipts/<name>.json:
 * {schema, name, command, exitCode, signal, startedAt, finishedAt, headSha,
 * treeClean, treeCleanAtFinish, sourceFingerprint,
 * sourceFingerprintAtFinish, version}. The receipt records the REAL exit
 * code of the command it ran and the release-candidate identity (HEAD,
 * porcelain-clean tree, src fingerprint, version) before and after the run;
 * it never decides whether the gate passed. The verdict is owned by run-release-0-2-verification-scenarios.js,
 * which requires exit 0 on the current HEAD and source fingerprint. The
 * helper exits with the command's own exit code so a chained operator
 * sequence stops on the first red gate.
 */

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {
  REPO_ROOT,
  resolveReleaseCandidateIdentity,
} from './release-candidate-identity.js';
import {
  GATE_RECEIPT_EXIT_SIGNAL,
  GATE_RECEIPT_EXIT_SPAWN_FAILED,
  GATE_RECEIPT_NAME_PATTERN,
  GATE_RECEIPT_SCHEMA,
  RECEIPT_FILE_EXTENSION,
  RELEASE_GATE_RECEIPT_DIR,
  VERIFICATION_ARG,
} from './release-0-2-verification-constants.js';

const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);

const ARGV_COMMAND_OFFSET = 2;
const NOT_FOUND = -1;
const STDIO_INHERIT = 'inherit';
const NEWLINE = '\n';
const NO_SIGNAL = '';
const NO_ERROR = '';
const EXIT_USAGE = 2;
const USAGE =
  'usage: record-release-gate-receipt <name> [--receipt-dir <dir>] ' +
  '-- <command...>' + NEWLINE;
const RECEIPT_LINE_PREFIX = 'receipt: ';

function parseArgs(argv) {
  const separator = arrayIndexOf(argv, VERIFICATION_ARG.COMMAND_SEPARATOR);
  const head = separator === NOT_FOUND ? argv : argv.slice(0, separator);
  const command = separator === NOT_FOUND ? [] : argv.slice(separator + 1);
  const dirFlag = arrayIndexOf(head, VERIFICATION_ARG.RECEIPT_DIR);
  const receiptDir = dirFlag !== NOT_FOUND && head[dirFlag + 1] ?
    head[dirFlag + 1] :
    RELEASE_GATE_RECEIPT_DIR;
  const name = head[0] === VERIFICATION_ARG.RECEIPT_DIR ? head[2] : head[0];
  const valid = typeof name === 'string' &&
    GATE_RECEIPT_NAME_PATTERN.test(name) && command.length > 0;
  return {valid, name, receiptDir, command};
}

// The exit code is the child's real status; a signal-terminated child has
// none, so the sentinel plus signal name is recorded instead. A spawn
// failure (command not found) records the conventional 127.
function exitFacts(result) {
  const spawnFailed = result.error !== undefined;
  const signalled = typeof result.signal === 'string';
  const exitCode = spawnFailed ?
    GATE_RECEIPT_EXIT_SPAWN_FAILED :
    signalled ? GATE_RECEIPT_EXIT_SIGNAL : result.status;
  return {
    exitCode,
    signal: signalled ? result.signal : NO_SIGNAL,
    spawnError: spawnFailed ? String(result.error.message) : NO_ERROR,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(ARGV_COMMAND_OFFSET));
  if (!args.valid) {
    process.stderr.write(USAGE);
    return EXIT_USAGE;
  }
  const before = await resolveReleaseCandidateIdentity(REPO_ROOT);
  const startedAt = new Date().toISOString();
  const result = spawnSync(args.command[0], args.command.slice(1), {
    cwd: REPO_ROOT,
    stdio: STDIO_INHERIT,
  });
  const finishedAt = new Date().toISOString();
  const after = await resolveReleaseCandidateIdentity(REPO_ROOT);
  const receipt = {
    schema: GATE_RECEIPT_SCHEMA,
    name: args.name,
    command: args.command,
    ...exitFacts(result),
    startedAt,
    finishedAt,
    headSha: before.headSha,
    treeClean: before.treeClean,
    treeCleanAtFinish: after.treeClean,
    sourceFingerprint: before.sourceFingerprint,
    sourceFingerprintAtFinish: after.sourceFingerprint,
    version: before.versionSources.packageJson,
  };
  const dir = path.resolve(REPO_ROOT, args.receiptDir);
  fs.mkdirSync(dir, {recursive: true});
  const receiptPath = path.join(dir, args.name + RECEIPT_FILE_EXTENSION);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + NEWLINE);
  process.stdout.write(
    RECEIPT_LINE_PREFIX + path.relative(REPO_ROOT, receiptPath) + NEWLINE,
  );
  return receipt.exitCode;
}

process.exitCode = await main();
