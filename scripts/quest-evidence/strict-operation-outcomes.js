#!/usr/bin/env node
// Admit only the preserved initial RED for strict-operation-outcomes. This
// adapter never executes tests and has no green-admission branch. It consumes
// the original managed placement artifacts, not reconstructed runner sections.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Parser} from 'tap-parser';
import {spawnGit} from '../checks/git-invocation.js';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = '58a2080337b56b4e5f97bcb54da59f57b94e6611';
const REQUEST_ID = '3883b67b-2d12-459c-a08e-d8a5f64b4ebe';
const HOST = 'tv-dator';
const TEST_FILE = 'test/rebalancer/strict-operation-outcomes.test.js';
const TEST_DIGEST = '6339350d3c4e4c2658f5ecf1215b073c1bc2c7a287a98a5801780c57cd9ac3ad';
const LOG_FILE = 'outcome/58a2080337b5-mwpcsefx-3239844-tv-dator.log';
const ERROR_FILE = 'outcome/58a2080337b5-mwpcsefx-3239844-tv-dator.err';
const LOCK_DIGEST = 'b529c1d729f95683aa94049998b23508836a8fdcc5e5ec4d92f2284b9f4abdf1';
const ORIGINAL_ARCHIVE = Object.freeze({
  sha256: '4a7c9cf32d07c3612d138ea174f313d642cd84e8c3a2b589ccf804a4448ca4b7',
  bytes: 13962,
  url: 'https://github.com/psvensson/lagrange/releases/download/solve-evidence/' +
    'strict-operation-outcomes--strict-outcomes-and-support-original-red-3883b67b.tar.gz',
});
const ORIGINAL_DIGESTS = Object.freeze({
  'manifest.json': '570c36bd83803e38ee614afdad95e0a9749fe1be48b0d59055914d8673429eb6',
  'status.json': 'dbb3f3b7fdb897f4f971450281bb09bbd9d1bee2a7202c11e2ba236a7abd8072',
  'artifacts.json': '5c87b352f70da83e6c7819916fd1eeb029bdd0c9605c7c9a831718a09628b553',
  'discovery-inventory.json':
    '636b00c53bf9d3c7c899ea95c6f7e7c05eaa3822aa9dc4710b3edbce89383d73',
  [LOG_FILE]: 'b18852b15ffb462aa0b60451f7f9303a147d105de2aae160e0a01eb8bd5aa915',
  [ERROR_FILE]: '0536083c874c4c570966411dc4f15d5138873aa72211f03c07417ae48c2c2422',
  'outcome/selection.json':
    'bceb59c5160b8ef3df3706054443c7c41042ae1c489a042d5ecf0328990777c7',
  'outcome/test-results.ndjson':
    'a87d4fb62623d5f18c99f4995da6498b473931a59ba91c1ec27061d5cedde423',
});
const REQUIRED_RECEIPTS = [
  'strict-persistence-positive-and-malformed-negative',
  'terminal-dispositions-and-failure-meaning',
  'reconstruction-and-interrupted-release',
  'permissive-path-negative-controls',
  'classified-consumer-closure',
  'independent-verification',
];
const PRODUCTION_FILES = [
  'src/rebalancer/operation-workflow-transition-orchestration.js',
  'src/rebalancer/operation-workflow-transition-persistence.js',
  'src/rebalancer/operation-workflow-terminal-reservation-release.js',
  'src/rebalancer/replica-operation-repository-mutation-update-methods.js',
  'src/rebalancer/rebalance-coordinator-lifecycle.js',
  'src/rebalancer/rebalance-coordinator-reservation-lifecycle-methods.js',
];
const POSITIVES = [
  ['strict outcomes positive: real nonterminal update and terminal release', 12],
  ['strict outcomes thrown post-write reply: same-owner retry re-enters repository', 9],
  ['strict outcomes reopened SQLite: fresh owner recovers exact terminal and retained release', 12],
];
const MALFORMED_LABELS = [
  'undefined', 'null', 'bare true', 'bare false', 'missing fields',
  'missing operation', 'unknown disposition', 'contradictory updated',
];
const CONTRACT_FAILURE =
  'malformed repository answer is a contract error, never terminal success';
const ALLOWED_FAILURES = new Set([
  CONTRACT_FAILURE,
  'malformed answer does not report a committed transition',
  'malformed answer cannot commit the deferred workflow mirror',
  'malformed answer retains the real reservation',
  'same-step retry re-enters persistence instead of trusting the deferred mirror',
]);
const EXPECTED_PARENTS = 11;
const EXPECTED_LEAVES = 129;
const EXPECTED_LEAF_FAILURES = 33;
const EXPECTED_RUNNER_ASSERTIONS = 140;
const MALFORMED_ASSERTIONS = 12;
const DEFAULT_OUTPUT = 'solve/evidence/strict-operation-outcomes.receipt.json';
const ORIGINAL_FILE_MAX_BYTES = 256 * 1024;

const ENCODING = Object.freeze({
  TEXT: 'utf8',
  DIGEST: 'hex',
});
const CLI = Object.freeze({
  EVIDENCE: '--evidence-dir',
  OUTPUT: '--output',
  PREFIX: '--',
  EVIDENCE_KEY: 'evidenceDir',
  OUTPUT_KEY: 'output',
});
const ORIGINAL_FILE = Object.freeze({
  STATUS: 'status.json',
  ARTIFACTS: 'artifacts.json',
  MANIFEST: 'manifest.json',
  SELECTION: 'outcome/selection.json',
  LEDGER: 'outcome/test-results.ndjson',
  PREFLIGHT: 'discovery-inventory.json',
});
const TAP_EVENT = Object.freeze({
  ASSERT: 'assert',
  CHILD: 'child',
  COMPLETE: 'complete',
});
const TAP_FRAMING = Object.freeze({
  START: 'TAP version 14\n',
  FOOTER: '# test-files total=',
  MODE: 'mode:local retry:0 ',
  SUMMARY: '# test-files total=1 pass=0 fail=1 assertions=140\n',
  ROOT: 'root TAP',
});
const RECEIPT_STATUS = Object.freeze({
  UNAVAILABLE: 'unavailable',
  FAIL: 'fail',
});
const PROBLEM = Object.freeze({
  EVIDENCE_REQUIRED: '--evidence-dir is required',
  MANAGED_STATUS: 'managed request did not finish as the recorded test failure',
  ARTIFACT_INVENTORY: 'artifact inventory is incomplete or belongs to another request',
  MANIFEST_REQUEST: 'manifest request mismatch',
  SELECTION: 'selection is not the exact single-file source',
  LEDGER: 'ledger is not the original unretried named failure',
  PREFLIGHT: 'original host preflight metadata differs',
  FRAMING: 'placement framing/source/retry/complete single-file footer missing',
  PARENTS: 'expected eleven complete parent tests',
  LEAVES: 'leaf counts or assertion execution differ from original red',
  DUPLICATE_PARENTS: 'duplicate parent names',
  TEST_BLOB: 'pinned test blob differs',
  OUTPUT: 'output must be outside retained original evidence',
  NOT_VALIDATED: 'Original evidence validation has not completed; no measuring result admitted.',
});
const REAL_EFFECT_ASSERTION = Object.freeze({
  CALL: 'fault is delivered after one actual repository call',
  WRITE: 'the write happened: uncertainty must not be misreported as rollback',
});
const DIGEST_ALGORITHM = 'sha256';
const NEWLINE = '\n';
const MANAGED_FAILURE = 'FAILED';
const PREFLIGHT_NODE_VERSION = 'v22.23.2';
const GIT_SHOW = 'show';
const TEMPORARY_RECEIPT_PREFIX = '.strict-outcome-receipt-';
const STAGED_RECEIPT_FILE = 'receipt.json';
const RECEIPT_SCHEMA = 'test-receipt/1';
const QUEST_ID = 'strict-operation-outcomes';
const GIT_CAPTURE_STDIO = Object.freeze(['ignore', 'pipe', 'pipe']);
const EVIDENCE_CEILING =
  'Initial local SQLite composition red only. Host preflight records Node and lock ' +
  'identity; original native binary and SQLite build hashes were not captured. The managed ' +
  'controller reports source_execution_started:false; original placement source and TAP ' +
  'establish the child execution. No physical fleet, full repair, green admission or ' +
  'later-source applicability is certified. Original summaries are not an attestation.';
const MEASURED_FAILURE =
  'Measured baseline: eight malformed reply cases fail the strict outcome contract; ' +
  'ordinary, thrown-reply and reopened-owner positive controls pass.';
const OUTSTANDING_FAILURE = 'Outstanding; not measured or admitted by this red adapter.';

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`red evidence refused: ${message}`);
}

function digest(bytes) {
  return createHash(DIGEST_ALGORITHM).update(bytes).digest(ENCODING.DIGEST);
}

function parseOptions(argv) {
  const options = {output: DEFAULT_OUTPUT};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    requireEvidence(key === CLI.EVIDENCE || key === CLI.OUTPUT, `unknown argument ${key}`);
    const value = argv[index + 1];
    requireEvidence(typeof value === 'string' && !value.startsWith(CLI.PREFIX), `${key} needs a path`);
    const name = key === CLI.EVIDENCE ? CLI.EVIDENCE_KEY : CLI.OUTPUT_KEY;
    requireEvidence(!Object.hasOwn(options, `${name}Provided`), `duplicate argument ${key}`);
    options[name] = path.resolve(value);
    options[`${name}Provided`] = true;
  }
  requireEvidence(options.evidenceDirProvided, PROBLEM.EVIDENCE_REQUIRED);
  return options;
}

function readOriginals(directory) {
  const originals = new Map();
  for (const [name, expected] of Object.entries(ORIGINAL_DIGESTS)) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    requireEvidence(stat.isFile(), `${name} is not a regular original file`);
    requireEvidence(stat.size <= ORIGINAL_FILE_MAX_BYTES, `${name} exceeds the original byte bound`);
    const bytes = fs.readFileSync(file);
    requireEvidence(digest(bytes) === expected, `${name} hash mismatch`);
    originals.set(name, bytes);
  }
  return originals;
}

function readJson(originals, name) {
  return JSON.parse(originals.get(name).toString(ENCODING.TEXT));
}

function readManagedFailure(originals) {
  const status = readJson(originals, ORIGINAL_FILE.STATUS);
  requireEvidence(status.job_id === REQUEST_ID && status.state === MANAGED_FAILURE &&
    status.exit_code === 1 && status.execution_scope_closed === true &&
    status.workload_started === true, PROBLEM.MANAGED_STATUS);
  return status;
}

function validateArtifactCustody(originals) {
  const artifacts = readJson(originals, ORIGINAL_FILE.ARTIFACTS);
  requireEvidence(artifacts.job_id === REQUEST_ID && artifacts.next_cursor === null,
    PROBLEM.ARTIFACT_INVENTORY);
  const manifest = readJson(originals, ORIGINAL_FILE.MANIFEST);
  requireEvidence(manifest.requestId === REQUEST_ID, PROBLEM.MANIFEST_REQUEST);
  for (const name of [LOG_FILE, ERROR_FILE, ORIGINAL_FILE.SELECTION, ORIGINAL_FILE.LEDGER]) {
    const entries = manifest.entries.filter((entry) => entry.name === name);
    requireEvidence(entries.length === 1 && entries[0].sha256 === ORIGINAL_DIGESTS[name] &&
      entries[0].bytes === originals.get(name).length && artifacts.names.includes(name),
    `artifact custody mismatch for ${name}`);
  }
}

function readPinnedSelection(originals) {
  const selection = readJson(originals, ORIGINAL_FILE.SELECTION);
  requireEvidence(selection.sha === SOURCE && selection.host === HOST &&
    selection.files.length === 1 && selection.files[0] === TEST_FILE &&
    selection.plan.length === 1 && selection.plan[0].files.length === 1 &&
    selection.plan[0].files[0] === TEST_FILE, PROBLEM.SELECTION);
  return selection;
}

function readOriginalLedger(originals) {
  const ledger = originals.get(ORIGINAL_FILE.LEDGER).toString(ENCODING.TEXT).trim()
    .split(NEWLINE).map((line) => JSON.parse(line));
  requireEvidence(ledger.length === 1 && ledger[0].file === TEST_FILE &&
    ledger[0].attempt === 1 && ledger[0].retriedOnce === false && ledger[0].ok === false &&
    ledger[0].assertions === EXPECTED_RUNNER_ASSERTIONS &&
    ledger[0].firstFailureLine === `not ok 4 - ${CONTRACT_FAILURE}`,
  PROBLEM.LEDGER);
  return ledger[0];
}

function readOriginalPreflight(originals) {
  const preflight = readJson(originals, ORIGINAL_FILE.PREFLIGHT).nodes[HOST].testCapability;
  requireEvidence(preflight.nodeVersion === PREFLIGHT_NODE_VERSION &&
    preflight.repo.lockGraphSha256 === LOCK_DIGEST && preflight.repo.dependenciesCurrent === true,
  PROBLEM.PREFLIGHT);
  return preflight;
}

function validateProvenance(originals) {
  const status = readManagedFailure(originals);
  validateArtifactCustody(originals);
  const selection = readPinnedSelection(originals);
  const ledger = readOriginalLedger(originals);
  const preflight = readOriginalPreflight(originals);
  return {status, selection, ledger, preflight};
}

function checkParserCompletion(result, count, name) {
  requireEvidence(result && !result.bailout && result.skip === 0 && result.todo === 0 &&
    result.count === count && result.plan.start === 1 && result.plan.end === count &&
    !result.plan.skipAll && result.failures.every((failure) => !failure.tapError),
  `${name}: missing plan/completion, skip, todo, bailout or parser error`);
}

function extractOriginalTap(raw) {
  const start = raw.indexOf(TAP_FRAMING.START);
  const end = raw.indexOf(TAP_FRAMING.FOOTER);
  requireEvidence(start >= 0 && end > start &&
    raw.indexOf(TAP_FRAMING.START, start + 1) < 0 &&
    raw.includes(`placement-head=${SOURCE}\n`) && raw.includes(TAP_FRAMING.MODE) &&
    raw.includes(TAP_FRAMING.SUMMARY),
  PROBLEM.FRAMING);
  return raw.slice(start, end);
}

function readTapStructure(tap) {
  const parser = new Parser();
  const parents = [];
  const children = [];
  let final;
  parser.on(TAP_EVENT.ASSERT, (result) => parents.push(result));
  parser.on(TAP_EVENT.CHILD, (child) => {
    const record = {name: child.name, assertions: [], result: null, nested: false};
    children.push(record);
    child.on(TAP_EVENT.ASSERT, (result) => record.assertions.push(result));
    child.on(TAP_EVENT.CHILD, () => {
      record.nested = true;
    });
    child.on(TAP_EVENT.COMPLETE, (result) => {
      record.result = result;
    });
  });
  parser.on(TAP_EVENT.COMPLETE, (result) => {
    final = result;
  });
  parser.end(tap);
  return {final, parents, children};
}

function validateTapTotals({final, parents, children}) {
  checkParserCompletion(final, EXPECTED_PARENTS, TAP_FRAMING.ROOT);
  requireEvidence(final.ok === false && parents.length === EXPECTED_PARENTS &&
    children.length === EXPECTED_PARENTS, PROBLEM.PARENTS);
  const allLeaves = children.flatMap((child) => child.assertions);
  requireEvidence(allLeaves.length === EXPECTED_LEAVES &&
    allLeaves.filter((leaf) => !leaf.ok).length === EXPECTED_LEAF_FAILURES &&
    [...parents, ...allLeaves].every((result) => !result.skip && !result.todo && !result.tapError),
  PROBLEM.LEAVES);
  return allLeaves;
}

function validatePositiveControls(byName, parents) {
  for (const [name, count] of POSITIVES) {
    const child = byName.get(name);
    requireEvidence(child && !child.nested, `positive control missing: ${name}`);
    checkParserCompletion(child.result, count, name);
    requireEvidence(child.result.ok === true && child.assertions.every((result) => result.ok) &&
      parents.some((parent) => parent.name === name && parent.ok), `positive control failed: ${name}`);
  }
}

function validateMalformedControls(byName, parents) {
  for (const label of MALFORMED_LABELS) {
    const name = `strict outcomes malformed ${label}: no commit or release; same-owner retry`;
    const child = byName.get(name);
    requireEvidence(child && !child.nested, `malformed witness missing: ${label}`);
    checkParserCompletion(child.result, MALFORMED_ASSERTIONS, name);
    const failures = child.assertions.filter((result) => !result.ok);
    requireEvidence(child.result.ok === false &&
      parents.some((parent) => parent.name === name && !parent.ok) &&
      failures.some((result) => result.name === CONTRACT_FAILURE) &&
      failures.every((result) => ALLOWED_FAILURES.has(result.name) &&
        result.diag?.at?.fileName === TEST_FILE) &&
      child.assertions.some((result) => result.ok &&
        result.name === REAL_EFFECT_ASSERTION.CALL) &&
      child.assertions.some((result) => result.ok &&
        result.name === REAL_EFFECT_ASSERTION.WRITE),
    `not the intended real-producer contract failure: ${label}`);
  }
}

function parseOriginalTap(raw) {
  const tap = readTapStructure(extractOriginalTap(raw));
  const allLeaves = validateTapTotals(tap);
  const byName = new Map(tap.children.map((child) => [child.name, child]));
  requireEvidence(byName.size === EXPECTED_PARENTS, PROBLEM.DUPLICATE_PARENTS);
  validatePositiveControls(byName, tap.parents);
  validateMalformedControls(byName, tap.parents);
  return {parents: EXPECTED_PARENTS, leaves: allLeaves.length,
    passedLeaves: allLeaves.filter((result) => result.ok).length,
    failedLeaves: EXPECTED_LEAF_FAILURES, positiveControls: POSITIVES.map(([name]) => name),
    malformedCases: [...MALFORMED_LABELS]};
}

function sourceBlob(file) {
  const result = spawnGit([GIT_SHOW, `${SOURCE}:${file}`], {cwd: ROOT,
    env: gitProcessEnvironment(),
    stdio: GIT_CAPTURE_STDIO});
  requireEvidence(result.status === 0 && result.stdout, `source blob unavailable: ${file}`);
  return result.stdout;
}

function writeReceiptAtomically(output, receipt) {
  const directory = path.dirname(output);
  fs.mkdirSync(directory, {recursive: true});
  const temporary = fs.mkdtempSync(path.join(directory, TEMPORARY_RECEIPT_PREFIX));
  try {
    const staged = path.join(temporary, STAGED_RECEIPT_FILE);
    fs.writeFileSync(staged, `${JSON.stringify(receipt, null, 2)}\n`);
    fs.renameSync(staged, output);
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
}

function unavailableReceipt(reason) {
  return {schema: RECEIPT_SCHEMA, quest: QUEST_ID,
    status: RECEIPT_STATUS.UNAVAILABLE, receipts: [], generatedAt: new Date().toISOString(), reason};
}

function resolveExistingParent(file) {
  let directory = path.dirname(file);
  const suffix = [path.basename(file)];
  while (!fs.existsSync(directory)) {
    suffix.unshift(path.basename(directory));
    directory = path.dirname(directory);
  }
  return path.join(fs.realpathSync(directory), ...suffix);
}

function admitOriginalRed(options) {
  const originals = readOriginals(options.evidenceDir);
  const provenance = validateProvenance(originals);
  const measured = parseOriginalTap(originals.get(LOG_FILE).toString(ENCODING.TEXT));
  requireEvidence(digest(sourceBlob(TEST_FILE)) === TEST_DIGEST, PROBLEM.TEST_BLOB);
  const receipt = {
    schema: RECEIPT_SCHEMA, quest: QUEST_ID, status: RECEIPT_STATUS.FAIL,
    generatedAt: new Date().toISOString(),
    testFileDigests: {[TEST_FILE]: TEST_DIGEST},
    productionFileDigests: Object.fromEntries(PRODUCTION_FILES.map((file) =>
      [file, digest(sourceBlob(file))])),
    evidence: {
      requestId: REQUEST_ID, sourceCommit: SOURCE, executionHost: HOST,
      controllerStatus: provenance.status,
      originalArchive: ORIGINAL_ARCHIVE,
      originalDirectory: options.evidenceDir, originalDigests: ORIGINAL_DIGESTS,
      selection: provenance.selection, runnerResult: provenance.ledger, measured,
      preflight: {nodeVersion: provenance.preflight.nodeVersion,
        lockGraphSha256: provenance.preflight.repo.lockGraphSha256,
        observedAt: provenance.preflight.probedAt},
      ceiling: EVIDENCE_CEILING,
    },
    receipts: REQUIRED_RECEIPTS.map((id, index) => ({
      id, passed: false,
      ...(index === 0 ? {testFile: TEST_FILE,
        failure: MEASURED_FAILURE,
        evidence: LOG_FILE} : {failure: OUTSTANDING_FAILURE}),
    })),
  };
  writeReceiptAtomically(options.output, receipt);
  process.stdout.write(`${options.output}: fail (measured original red; no green admission)\n`);
  process.exitCode = 1;
}

function main() {
  // Parse the entire invocation before selecting an output. Invalid arguments
  // do not mutate an unrelated default/partial target. Once a valid target is
  // selected, invalidate only that current derived receipt BEFORE validation;
  // refusal or interruption must not leave an earlier pass available to probes.
  const options = parseOptions(process.argv.slice(2));
  const output = resolveExistingParent(path.resolve(options.output));
  const evidenceDirectory = fs.existsSync(options.evidenceDir) ?
    fs.realpathSync(options.evidenceDir) : resolveExistingParent(options.evidenceDir);
  const relative = path.relative(evidenceDirectory, output);
  requireEvidence(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    PROBLEM.OUTPUT);
  writeReceiptAtomically(output,
    unavailableReceipt(PROBLEM.NOT_VALIDATED));
  try {
    admitOriginalRed({...options, output});
  } catch (error) {
    writeReceiptAtomically(output, unavailableReceipt(error.message));
    throw error;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
