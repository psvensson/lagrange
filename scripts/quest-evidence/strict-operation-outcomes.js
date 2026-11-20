#!/usr/bin/env node
// Admit the initial red or the bounded native SQLite execution from their
// original artifacts. This adapter never executes tests.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {Parser} from 'tap-parser';
import {spawnGit} from '../checks/git-invocation.js';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {
  compareHistoricalControls, HISTORICAL_RUNS, requireHistorical,
} from './strict-operation-outcomes-historical-controls.js';
import {
  readManagedCustody, HOST, MANAGED_FILE, TEST_FILE,
} from './strict-operation-outcomes-managed-custody.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = '58a2080337b56b4e5f97bcb54da59f57b94e6611';
const REQUEST_ID = '3883b67b-2d12-459c-a08e-d8a5f64b4ebe';
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
const TRANSITION_ADAPTER = 'src/rebalancer/operation-workflow-transition-orchestration.js';
const RELEASE_HELPER = 'src/rebalancer/operation-workflow-terminal-reservation-release.js';
const PRODUCTION_FILES = [
  TRANSITION_ADAPTER,
  'src/rebalancer/operation-workflow-transition-persistence.js',
  RELEASE_HELPER,
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
  MANAGED: '--managed-evidence-dir',
  HISTORICAL: '--historical-evidence-dir',
  OUTPUT: '--output',
  PREFIX: '--',
  EVIDENCE_KEY: 'evidenceDir',
  MANAGED_KEY: 'managedEvidenceDir',
  HISTORICAL_KEY: 'historicalEvidenceDir',
  OUTPUT_KEY: 'output',
});
const OPTION_KEYS = Object.freeze({
  [CLI.EVIDENCE]: CLI.EVIDENCE_KEY,
  [CLI.MANAGED]: CLI.MANAGED_KEY,
  [CLI.HISTORICAL]: CLI.HISTORICAL_KEY,
  [CLI.OUTPUT]: CLI.OUTPUT_KEY,
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
  MANAGED_TAP_START: 'missing or duplicated original TAP stream',
  MANAGED_TAP_INCOMPLETE: 'managed TAP did not complete all parent cases',
  MANAGED_TAP_DUPLICATE_CASE: 'duplicate managed TAP parent names',
  MANAGED_TAP_COUNTS: 'managed TAP counts differ from the original result',
  MANAGED_SOURCE_BLOB: 'managed source blob mismatch',
  HISTORICAL_HELPER_MISMATCH: 'the helper control does not restore the historical source',

  EVIDENCE_REQUIRED: 'specify one of --evidence-dir or --managed-evidence-dir',
  HISTORICAL_REQUIRES_MANAGED: '--historical-evidence-dir requires --managed-evidence-dir',
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
const GIT_REV_PARSE = 'rev-parse';
const GIT_DIFF = 'diff';
const GIT_NO_RENAMES = '--no-renames';
const GIT_NAME_ONLY = '--name-only';
const GIT_PATH_SEPARATOR = '--';
const GIT_ARGUMENT_SEPARATOR = ' ';
const REBALANCER_SOURCE = 'src/rebalancer';
const GRAPH_SEAL = 'test/shards/impact-graph-seal.json';
const HISTORICAL_SOURCE = '6c0bdff11f24e32459178e9d2c0d9f563e7cd790';
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

const MANAGED = Object.freeze({
  source: '8281e61d2b0a1c67583d7cd1790467268efa932e',
  tree: 'd602ead8be437bc51208a459efd5bd7a44cb70b9',
  requestId: '2378f3a8-3dc2-4ddf-982b-d8d13b6efe3a',
  generation: '51a47f3e-71ed-4429-a6c9-fff56f959d37',
  ref: 'refs/heads/wip/strict-operation-composition-20261120',
  repo: 'psvensson/lagrange',
  controllerState: 'COMPLETE',
  exitStatus: 0,
  leafFailures: 0,
  testDigest: '737871bfe14dabe95c72c4c1d3e5be94ff86590bdeceaea521d97de31aec53b1',
  assertions: 521,
  parents: 51,
  leaves: 470,
});
const MANAGED_ANCHORS = Object.freeze({
  'status.json': '0e63b826f125d9c50f3f61c86c5d787fae34a63b27682429ff80a2ead784819a',
  'manifest.json': '18a6c35bec8716eb6dbe4b53971c9f6881cd96acda2c8c8b1f6fbd1ebd47ace1',
  'artifacts-0.json': 'bf18daba99fdca19f6af0503e1770ab073b04a51df7ddea70a32924cc9078db8',
});
const MANAGED_CASES = Object.freeze([
  [POSITIVES[0][0], 'real terminal release updates only its reservation through the coordinator'],
  [POSITIVES[1][0], 'authoritative replay after a thrown reply performs no second write'],
  [POSITIVES[2][0], 'fresh terminal entry discharges the interrupted terminal release'],
  ['strict outcomes failed REPLACE repair releases before now-refused write admission',
    'STOPPING adapter cannot turn adopted failure into success'],
  ['strict outcomes real SQLite refusal and reinsertion retain obligations',
    'reinsertion cannot release a retained reservation'],
  ['strict outcomes queued terminal writers return the exact durable winner',
    'the losing caller manufactures no second terminal history entry'],
  ['strict outcomes interrupted release eventually wakes real terminal subscribers',
    'actual intent pruner receives the wake'],
  ['strict outcomes crash after release before notification resumes through owner rebind',
    'existing coordinator attachment wakes both dependent owners without a terminal event replay'],
  ['strict outcomes competing terminal writer between preimage and SQL cannot be overwritten',
    'the actual losing SQLite CAS changes no row'],
  ['strict outcomes known terminal preimage cannot become recovered progress after zero-effect reply loss',
    'preexisting settlement is never new recovered progress'],
  ['strict outcomes unreadable terminal preimage cannot earn recovered credit from a later row',
    'later visibility cannot manufacture recovered progress'],
]);
const MANAGED_MALFORMED_LABELS = Object.freeze([...MALFORMED_LABELS, 'missing history',
  'invalid timestamp', 'failed without completion', 'terminal on creating', 'wrong status',
  'wrong entity', 'wrong requested replica', 'adopted different replica', 'refusal with payload']);
const MANAGED_MALFORMED_ASSERTIONS = Object.freeze([REAL_EFFECT_ASSERTION.CALL, CONTRACT_FAILURE,
  'malformed answer cannot commit the deferred workflow mirror',
  'malformed answer retains the real reservation', REAL_EFFECT_ASSERTION.WRITE,
  'same-step retry reconsults the real authoritative repository']);
const MANAGED_PENDING = Object.freeze([
  'Historical placement retains engaged mutant failures but only an aggregate for the paired ' +
    'release-boundary positive, and no test-process native identity for the three controls.',
  'Classified consumer closure remains red outside this single-file run.',
  'Composed candidate and original-run admission require independent verification.',
]);
const HISTORICAL_CONTROLS = Object.freeze({
  archive: 'strict-operation-outcomes--strict-historical-outcome-controls-nov20.tar.gz',
  sha256: '9960f3250d659f28ec78d47cbeaa8ac8c12eba64edf37895a90b4108a4670d87',
  adapterRed: '0a00e855fba84d73af6a3b0939844aa7497f542a',
  helperRed: '6ef416aa65a9a652a876eebb0149b8a136f7a452',
  helperPositive: '0081b7dfa8620fcf242930db14430f80fb81cbe3',
});
const MANAGED_CEILING = 'Single-file native SQLite production-owner composition on tv-dator. ' +
  'Controller, nested runner and actual test-process records describe different scopes. ' +
  'The original records are unsigned. Classified consumers, physical fleet, and applicability ' +
  'to a later candidate remain outside this measurement.';
const LOCK_FILE = 'package-lock.json';
const MEASURED_MANAGED_RECEIPT_COUNT = 3;

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`red evidence refused: ${message}`);
}

function requireManaged(condition, message) {
  if (!condition) throw new Error(`managed evidence refused: ${message}`);
}

function digest(bytes) {
  return createHash(DIGEST_ALGORITHM).update(bytes).digest(ENCODING.DIGEST);
}

function parseOptions(argv) {
  const options = {output: DEFAULT_OUTPUT};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    requireEvidence(Object.hasOwn(OPTION_KEYS, key), `unknown argument ${key}`);
    const value = argv[index + 1];
    requireEvidence(typeof value === 'string' && !value.startsWith(CLI.PREFIX), `${key} needs a path`);
    const name = OPTION_KEYS[key];
    requireEvidence(!Object.hasOwn(options, `${name}Provided`), `duplicate argument ${key}`);
    options[name] = path.resolve(value);
    options[`${name}Provided`] = true;
  }
  requireEvidence(Boolean(options.evidenceDir) !== Boolean(options.managedEvidenceDir),
    PROBLEM.EVIDENCE_REQUIRED);
  requireEvidence(!options.historicalEvidenceDir || options.managedEvidenceDir,
    PROBLEM.HISTORICAL_REQUIRES_MANAGED);
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

function checkParserCompletion(result, count, name, require = requireEvidence) {
  require(result && !result.bailout && result.skip === 0 && result.todo === 0 &&
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

function sourceCommand(args) {
  const result = spawnGit(args, {cwd: ROOT,
    env: gitProcessEnvironment(),
    stdio: GIT_CAPTURE_STDIO});
  requireEvidence(result.status === 0 && result.stdout, `source unavailable: ${args.join(GIT_ARGUMENT_SEPARATOR)}`);
  return result.stdout;
}

function sourceBlob(file, source = SOURCE) {
  return sourceCommand([GIT_SHOW, `${source}:${file}`]);
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

function readCompleteManagedTap(raw, expected) {
  const start = raw.indexOf(TAP_FRAMING.START);
  requireManaged(start >= 0 && raw.indexOf(TAP_FRAMING.START, start + 1) === -1,
    PROBLEM.MANAGED_TAP_START);
  const {final, parents, children} = readTapStructure(raw.slice(start));
  checkParserCompletion(final, expected.parents, TAP_FRAMING.ROOT, requireManaged);
  requireManaged(final.ok === (expected.exitStatus === 0) && parents.length === expected.parents &&
    children.length === expected.parents, PROBLEM.MANAGED_TAP_INCOMPLETE);
  const byName = new Map(children.map((child) => [child.name, child]));
  const byParent = new Map(parents.map((parent) => [parent.name, parent]));
  requireManaged(byName.size === expected.parents && byParent.size === expected.parents,
    PROBLEM.MANAGED_TAP_DUPLICATE_CASE);
  let leaves = 0;
  let leafFailures = 0;
  for (const {name, result, assertions, nested} of children) {
    const parent = byParent.get(name);
    checkParserCompletion(result, assertions.length, name, requireManaged);
    requireManaged(!nested && parent && parent.ok === result.ok &&
      [parent, ...assertions].every((item) => !item.skip && !item.todo && !item.tapError),
    `unmeasured managed case: ${name}`);
    leaves += assertions.length;
    leafFailures += assertions.filter((item) => !item.ok).length;
  }
  requireManaged(leaves === expected.leaves && leaves + parents.length === expected.assertions &&
    leafFailures === expected.leafFailures, PROBLEM.MANAGED_TAP_COUNTS);
  return byName;
}

function validateManagedPositiveCases(byName) {
  const malformed = MANAGED_MALFORMED_LABELS.flatMap((label) =>
    MANAGED_MALFORMED_ASSERTIONS.map((assertion) =>
      [`strict outcomes malformed ${label}: no commit or release; same-owner retry`, assertion]));
  for (const [name, assertion] of [...MANAGED_CASES, ...malformed]) {
    requireManaged(byName.get(name)?.assertions.some((item) => item.name === assertion),
      `managed case missing assertion "${assertion}": ${name}`);
  }
  return {parents: MANAGED.parents, leaves: MANAGED.leaves, assertions: MANAGED.assertions,
    cases: [...byName.keys()]};
}

function managedSourceDigests() {
  const tree = sourceCommand([GIT_REV_PARSE, `${MANAGED.source}^{tree}`]).toString(ENCODING.TEXT).trim();
  const testDigest = digest(sourceBlob(TEST_FILE, MANAGED.source));
  requireManaged(tree === MANAGED.tree && testDigest === MANAGED.testDigest,
    PROBLEM.MANAGED_SOURCE_BLOB);
  // The strict producer/consumer delta is the same 37-file rebalancer census
  // reviewed under the existing Quest. This is not a later-candidate dependency proof.
  const changed = sourceCommand([GIT_DIFF, GIT_NAME_ONLY, SOURCE, MANAGED.source,
    GIT_PATH_SEPARATOR, REBALANCER_SOURCE]).toString(ENCODING.TEXT).trim().split(NEWLINE);
  const files = new Set([...PRODUCTION_FILES, ...changed, LOCK_FILE]);
  return Object.fromEntries([...files].map((file) =>
    [file, digest(sourceBlob(file, MANAGED.source))]));
}

function checkSourceDelta(before, after, changedFile) {
  const tree = sourceCommand([GIT_REV_PARSE, `${after.source}^{tree}`]).toString(ENCODING.TEXT).trim();
  const delta = sourceCommand([GIT_DIFF, GIT_NAME_ONLY, GIT_NO_RENAMES, before, after.source])
    .toString(ENCODING.TEXT).trim().split(NEWLINE).sort();
  const expectedDelta = [changedFile, GRAPH_SEAL].sort();
  requireHistorical(tree === after.tree && isDeepStrictEqual(delta, expectedDelta),
    `unexpected source delta for ${after.source}`);
}

function admitHistorical(directory, repaired) {
  const [positive, adapter, helper] = HISTORICAL_RUNS.map((expected) => {
    const original = path.join(directory, expected.requestId);
    const result = readManagedCustody(original, expected, sourceBlob);
    return {...result, expected, cases: readCompleteManagedTap(result.tap, expected)};
  });
  checkSourceDelta(MANAGED.source, positive.expected, TEST_FILE);
  checkSourceDelta(MANAGED.source, adapter.expected, TRANSITION_ADAPTER);
  checkSourceDelta(positive.expected.source, helper.expected, RELEASE_HELPER);
  requireHistorical(sourceBlob(RELEASE_HELPER, helper.expected.source)
    .equals(sourceBlob(RELEASE_HELPER, HISTORICAL_SOURCE)), PROBLEM.HISTORICAL_HELPER_MISMATCH);
  return compareHistoricalControls([positive, adapter, helper], repaired, REAL_EFFECT_ASSERTION);
}

function managedOutstandingRow(id, index, controls) {
  if (index === MEASURED_MANAGED_RECEIPT_COUNT && controls) {
    return {id, passed: true, testFile: TEST_FILE, evidence: controls.asset};
  }
  return {id, passed: false, failure: MANAGED_PENDING[index - MEASURED_MANAGED_RECEIPT_COUNT]};
}

function admitManagedPositive(directory, output, historicalDirectory) {
  const result = readManagedCustody(directory, {...MANAGED, anchors: MANAGED_ANCHORS}, sourceBlob);
  const {status, execution, native, manifest} = result;
  const cases = readCompleteManagedTap(result.tap, MANAGED);
  const measured = validateManagedPositiveCases(cases);
  const controls = historicalDirectory ?
    admitHistorical(historicalDirectory, {native, cases}) : null;
  const receipt = {
    schema: RECEIPT_SCHEMA, quest: QUEST_ID, status: RECEIPT_STATUS.FAIL,
    generatedAt: new Date().toISOString(), testFileDigests: {[TEST_FILE]: MANAGED.testDigest},
    productionFileDigests: managedSourceDigests(),
    evidence: {requestId: MANAGED.requestId, sourceCommit: MANAGED.source,
      sourceTree: MANAGED.tree, executionHost: HOST, controllerStatus: status,
      originalDirectory: directory, originalDigests: MANAGED_ANCHORS,
      originalArtifacts: manifest.entries, run: execution.run, native, measured,
      originalRed: {requestId: REQUEST_ID, sourceCommit: SOURCE, archive: ORIGINAL_ARCHIVE},
      historicalControls: HISTORICAL_CONTROLS,
      ...(controls ? {nativeHistoricalControls: controls} : {}), ceiling: MANAGED_CEILING},
    receipts: REQUIRED_RECEIPTS.map((id, index) => index < MEASURED_MANAGED_RECEIPT_COUNT ?
      {id, passed: true, testFile: TEST_FILE, evidence: MANAGED_FILE.TAP} :
      managedOutstandingRow(id, index, controls)),
  };
  writeReceiptAtomically(output, receipt);
  process.stdout.write(`${output}: fail (bounded native SQLite proof admitted, Quest remains open)\n`);
  process.exitCode = 1;
}

function resolveEvidenceDirectory(directory, output) {
  const evidenceDirectory = fs.existsSync(directory) ?
    fs.realpathSync(directory) : resolveExistingParent(directory);
  const relative = path.relative(evidenceDirectory, output);
  requireEvidence(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), PROBLEM.OUTPUT);
  return evidenceDirectory;
}

function main() {
  // Parse the entire invocation before selecting an output. Invalid arguments
  // do not mutate an unrelated default/partial target. Once a valid target is
  // selected, invalidate only that current derived receipt BEFORE validation;
  // refusal or interruption must not leave an earlier pass available to probes.
  const options = parseOptions(process.argv.slice(2));
  const output = resolveExistingParent(path.resolve(options.output));
  const directory = options.managedEvidenceDir ?? options.evidenceDir;
  const evidenceDirectory = resolveEvidenceDirectory(directory, output);
  const historicalDirectory = options.historicalEvidenceDir &&
    resolveEvidenceDirectory(options.historicalEvidenceDir, output);
  writeReceiptAtomically(output,
    unavailableReceipt(PROBLEM.NOT_VALIDATED));
  try {
    if (options.managedEvidenceDir) {
      admitManagedPositive(evidenceDirectory, output, historicalDirectory);
    } else admitOriginalRed({...options, output});
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
