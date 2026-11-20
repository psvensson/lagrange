#!/usr/bin/env node
// Original-red admission only. No execution, summary-derived pass or green branch.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Parser} from 'tap-parser';
import {spawnGit} from '../checks/git-invocation.js';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUEST = 'participant-release-caller-lifetimes';
const SOURCE = '9a559d0cb0bb51580988165b8116f2d68b9713c7';
const REQUEST = 'b0a51112-53bb-4ac7-9d3b-b1a1af48a51b';
const TEST = 'test/partition/participant-release-caller-lifetimes.test.js';
const TEST_DIGEST = 'd5c241170c92ed9efa14504003ebc545af7eb52cd9d712c069a333c5636e1690';
const LOG = '9a559d0cb0bb-mwpdyjvl-3279229-adam-laptop.log';
const ENCODING = Object.freeze({TEXT: 'utf8', HASH: 'hex'});
const STATUS = Object.freeze({UNAVAILABLE: 'unavailable', FAILED: 'fail'});
const DIGESTS = Object.freeze({
  'status.json': 'd70c2fdfadfe8a3f0ee8beb5cd1af84045b968b6b26482b11faf424428da61d6',
  'artifacts-0.json': 'e0efd182267e90588d3565cd852b6fa9f63b12caf7a455525449e80b00e0cf51',
  [`artifacts/${LOG}`]: 'fbdc5cb5649f9bde4b0c97a02dc4817f4a19d665c99b42675f7e03c12ba20141',
  'artifacts/selection.json': 'f02366347311009ce2524fa4233556c5ba83f5ce85a952ddf72ba018ed275ead',
  'artifacts/test-results.ndjson': 'c809a5d9caf25361a5be37dab18df55255959fd112553c27b3fd257965311a21',
});
const CASES = Object.freeze([
  ['RELEASE aggregate crosses leaf bound while every actual leaf stays within its own bound',
    'a live aggregate caller must observe its completed cutover across individually bounded leaves'],
  ['same-slot shorter joiner settles at its own deadline without retiring the original cutover',
    'registered joining caller must settle independently at its own earlier deadline'],
  ['ordinary registered client release completes with unchanged origin and no delayed replies', null],
  ['expired aggregate request refuses before delivery and cannot create a native origin', null],
]);
const REQUIRED = Object.freeze([
  'aggregate-caller-and-bounded-leaf-composition',
  'shorter-joiner-and-retained-shared-attempt',
  'positive-and-negative-controls',
  'historic-contract-disposition-and-independent-review',
]);
const PRODUCTION = Object.freeze([
  'src/node/participant-release-client.js',
  'src/node/replica-handler-participant-cutover.js',
  'src/node/replica-handler-participant-release.js',
  'src/transport/message-router-delivery-lifetime.js',
]);

const DIGEST_ALGORITHM = 'sha256';
const GIT_SHOW = 'show';
const FILE_MAX_BYTES = 131072;
const ARGUMENT_COUNT = 3;
const HOST = 'adam-laptop';
const MANAGED_FAILURE = 'FAILED';
const STATUS_FILE = 'status.json';
const INVENTORY_FILE = 'artifacts-0.json';
const SELECTION_FILE = 'artifacts/selection.json';
const LEDGER_FILE = 'artifacts/test-results.ndjson';
const TAP_START = 'TAP version 13\n';
const TAP_FOOTER = '# test-files total=';
const PLACEMENT_MODE = 'mode:local retry:0 ';
const ASSERT_EVENT = 'assert';
const COMPLETE_EVENT = 'complete';
const ASSERTION_ERROR = 'ERR_ASSERTION';
const TERMINAL_PROBLEM = 'terminal execution';
const CUSTODY_PROBLEM = 'artifact custody';
const SELECTION_PROBLEM = 'source and selection';
const LEDGER_PROBLEM = 'unretried executed file';
const FRAMING_PROBLEM = 'complete source-bound TAP framing';
const TAP_PROBLEM = 'complete four-case TAP';
const PATH_PROBLEM = 'path has no existing parent';
const ARGUMENT_PROBLEM = 'one retained evidence directory required';
const OVERLAP_PROBLEM = 'output overlaps original evidence';
const DIRECTORY_PROBLEM = 'retained directory unavailable';
const SOURCE_PROBLEM = 'frozen witness source';
const OUTSTANDING = 'Original red retained; repaired behavior and complete interaction not yet proved.';
const GIT_STDIO = Object.freeze(['ignore', 'pipe', 'pipe']);
const EVIDENCE_CEILING = 'Original local native/inprocess virtual-clock red only. Native binary hashes were ' +
  'not captured. No green behavior, physical formation or task3823 causal admission.';

function requireOriginal(condition, reason) {
  if (!condition) throw new Error(`Original release evidence refused: ${reason}`);
}

function digest(bytes) {
  return createHash(DIGEST_ALGORITHM).update(bytes).digest(ENCODING.HASH);
}

function blob(file) {
  const result = spawnGit([GIT_SHOW, `${SOURCE}:${file}`], {cwd: ROOT,
    env: gitProcessEnvironment(), stdio: GIT_STDIO});
  requireOriginal(result.status === 0 && result.stdout, `missing source ${file}`);
  return result.stdout;
}

function readOriginals(directory) {
  const originals = new Map();
  for (const [name, expected] of Object.entries(DIGESTS)) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    requireOriginal(stat.isFile() && !stat.isSymbolicLink() && stat.size <= FILE_MAX_BYTES, name);
    const bytes = fs.readFileSync(file);
    requireOriginal(digest(bytes) === expected, `digest ${name}`);
    originals.set(name, bytes.toString(ENCODING.TEXT));
  }
  return originals;
}

function verifyTerminalStatus(status) {
  requireOriginal(status.job_id === REQUEST && status.state === MANAGED_FAILURE &&
    status.exit_code === 1 && status.execution_scope_closed === true &&
    status.workload_started === true, TERMINAL_PROBLEM);
}

function verifyInventory(inventory) {
  requireOriginal(inventory.job_id === REQUEST && inventory.next_cursor === null &&
    inventory.names.includes(LOG), CUSTODY_PROBLEM);
}

function verifySelection(selection) {
  requireOriginal(selection.sha === SOURCE && selection.host === HOST &&
    selection.files.length === 1 && selection.files[0] === TEST, SELECTION_PROBLEM);
}

function verifyExecutedFile(ledger) {
  requireOriginal(ledger.file === TEST && ledger.attempt === 1 && ledger.retriedOnce === false &&
    ledger.ok === false && ledger.assertions === CASES.length, LEDGER_PROBLEM);
}

function verifyOriginalRun(originals) {
  const status = JSON.parse(originals.get(STATUS_FILE));
  const inventory = JSON.parse(originals.get(INVENTORY_FILE));
  const selection = JSON.parse(originals.get(SELECTION_FILE));
  const ledger = JSON.parse(originals.get(LEDGER_FILE).trim());
  verifyTerminalStatus(status);
  verifyInventory(inventory);
  verifySelection(selection);
  verifyExecutedFile(ledger);
  return {status, selection, ledger};
}

function parseOriginalTap(raw) {
  const start = raw.indexOf(TAP_START);
  const end = raw.indexOf(TAP_FOOTER);
  requireOriginal(start >= 0 && end > start && raw.includes(`placement-head=${SOURCE}\n`) &&
    raw.includes(PLACEMENT_MODE), FRAMING_PROBLEM);
  const parser = new Parser();
  const assertions = [];
  let final;
  parser.on(ASSERT_EVENT, (result) => assertions.push(result));
  parser.on(COMPLETE_EVENT, (result) => {
    final = result;
  });
  parser.end(raw.slice(start, end));
  return {final, assertions};
}

function verifyTapSummary(final, assertions) {
  requireOriginal(final && final.ok === false && final.count === CASES.length &&
    final.pass === 2 && final.fail === 2 && !final.bailout &&
    assertions.length === CASES.length, TAP_PROBLEM);
}

function verifyTapCase(result, name, error) {
  requireOriginal(result.name === name && !result.skip && !result.todo && !result.tapError &&
    result.ok === (error === null), `case ${name}`);
  if (error !== null) verifyContractAssertion(result, name, error);
}

function verifyContractAssertion(result, name, error) {
  requireOriginal(result.diag?.code === ASSERTION_ERROR &&
    result.diag?.error?.includes(error) && result.diag?.stack?.includes(TEST),
  `intended contract assertion ${name}`);
}

function verifyTap(raw) {
  const {final, assertions} = parseOriginalTap(raw);
  verifyTapSummary(final, assertions);
  for (const [index, [name, error]] of CASES.entries()) {
    verifyTapCase(assertions[index], name, error);
  }
  return {tests: final.count, passed: final.pass, failed: final.fail};
}

function writeReceipt(file, receipt) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function resolveExistingParent(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  const parent = path.dirname(file);
  requireOriginal(parent !== file, PATH_PROBLEM);
  return path.join(resolveExistingParent(parent), path.basename(file));
}

const output = path.join(ROOT, 'solve/quests', QUEST, 'evidence/receipt.json');
const unavailable = {schema: 'test-receipt/1', quest: QUEST,
  status: STATUS.UNAVAILABLE, receipts: []};
try {
  requireOriginal(process.argv.length === ARGUMENT_COUNT, ARGUMENT_PROBLEM);
  const requested = path.resolve(process.argv[2]);
  const directory = resolveExistingParent(requested);
  const relative = path.relative(directory, resolveExistingParent(output));
  requireOriginal(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    OVERLAP_PROBLEM);
  writeReceipt(output, unavailable);
  requireOriginal(fs.statSync(directory).isDirectory(), DIRECTORY_PROBLEM);
  const originals = readOriginals(directory);
  const provenance = verifyOriginalRun(originals);
  const measured = verifyTap(originals.get(`artifacts/${LOG}`));
  requireOriginal(digest(blob(TEST)) === TEST_DIGEST, SOURCE_PROBLEM);
  const receipt = {...unavailable, status: STATUS.FAILED,
    generatedAt: new Date().toISOString(), sourceCommit: SOURCE, requestId: REQUEST,
    testFileDigests: {[TEST]: TEST_DIGEST},
    productionFileDigests: Object.fromEntries(PRODUCTION.map((file) => [file, digest(blob(file))])),
    originalDigests: DIGESTS, provenance, measured,
    ceiling: EVIDENCE_CEILING,
    receipts: REQUIRED.map((id) => ({id, passed: false,
      failure: OUTSTANDING})),
  };
  writeReceipt(output, receipt);
  process.stdout.write(`${JSON.stringify({status: receipt.status, measured, output})}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
