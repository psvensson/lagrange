#!/usr/bin/env node
// Admit the retained managed source run; never execute tests or synthesize originals.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {Parser} from 'tap-parser';
import {spawnGit} from '../checks/git-invocation.js';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {readExecutionRuns, buildExecutionReport, executionReportProblems, RETRY_POLICY} from
  '../test-execution-report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUEST = 'participant-release-caller-lifetimes';
const SOURCE = '5cc73e45e400e160e77687398f18e06059767eb1';
const TREE = '769ddc0fe4793ce6cc14146afd7ac68c7ef971cf';
const REQUEST = '3bce09eb-3cbe-4f32-b9c0-ad320cc926e3';
const HOST = 'tv-dator';
const GENERATION = '54457e5d-023f-4a8a-a7c7-97bd6b432e58';
const BRANCH = 'refs/heads/witness/participant-release-lifetimes-20261120';
const REPO = 'psvensson/lagrange';
const ENCODING = 'utf8';
const HASH = 'sha256';
const HEX = 'hex';
const MAX_BYTES = 134217728;
const INPUT_COUNT = 3;
const RECORD_FILE = Object.freeze({STATUS: 'status.json', MANIFEST: 'manifest.json',
  INVENTORY: 'artifacts-0.json', LOG: 'log.ndjson'});
const SLASH = '/';
const PARENT = '..';
const NEWLINE = '\n';
const MEASURED = 'measured';
const PROCESS_FIELDS = Object.freeze(['pid', 'ppid', 'argv', 'execArgv', 'execPath',
  'executableSha256', 'versions', 'hostname', 'bootId', 'cgroup', 'cwd']);
const SELF = 'scripts/quest-evidence/participant-release-caller-lifetimes.js';
const QUEST_HOME = `solve/quests/${QUEST}`;
const OUTPUT = path.join(ROOT, QUEST_HOME, 'evidence/receipt.json');
const SCHEMA = 'test-receipt/1';
const STATE = Object.freeze({PASS: 'pass', FAIL: 'fail', UNAVAILABLE: 'unavailable'});
const ANCHORS = Object.freeze({
  'status.json': '8bb6caf618e9f4ae940ecfb2af7e809596e58555878e3b96f9fc650642b53b2d',
  'manifest.json': '3047a46549695920d5442d436fe97e3f70d16a1cec9f3f3c0b6063019828db02',
  'artifacts-0.json': '717096fbe6cbeedf8fb6710d20d52b8de289482967ef26dbc269873b59beac81',
});
const FILES = Object.freeze([
  'test/partition/participant-release-caller-lifetimes.test.js',
  'test/partition/participant-release-protocol.test.js',
]);
const COUNTS = Object.freeze([4, 19]);
const CASES = Object.freeze([
  'RELEASE aggregate crosses leaf bound while every actual leaf stays within its own bound',
  'same-slot shorter joiner settles at its own deadline without retiring the original cutover',
  'ordinary registered client release completes with unchanged origin and no delayed replies',
  'expired aggregate request refuses before delivery and cannot create a native origin',
]);
const CLOCK_CASE = 'registered joins retain typed clock diagnostics when caller budget refuses';
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
const ARTIFACT = Object.freeze({
  SOURCE: 'source-before.json', AFTER: 'source-after.json', INVOCATION: 'invocation.json',
  COMMAND: 'command-result.json', SECTIONS: 'execution-sections.ndjson',
  REPORT: 'execution-report.json', NATIVE: 'native-before.json', NATIVE_AFTER: 'native-after.json',
  READINESS: 'candidate-readiness.json',
});
const SOURCE_BINDING = Object.freeze({
  glue: 'vendor/raft-rs-wasm/pkg/raft_wasm.js',
  wasm: 'vendor/raft-rs-wasm/pkg/raft_wasm_bg.wasm',
});
const KIND = Object.freeze({START: 'start', END: 'end', ASSERT: 'assert', COMPLETE: 'complete',
  VERIFY: 'verification', APPROVE: 'approve'});
const VERIFIER = 'subagent:/root';
const MANAGED_COMPLETE = 'COMPLETE';
const ARTIFACTS = 'artifacts';
const IDENTITY = 'process-identity/';
const START_SUFFIX = '.start.json';
const END_SUFFIX = '.end.json';
const STDIO = Object.freeze(['ignore', 'pipe', 'pipe']);
const GIT_SHOW = 'show';
const HEX_DIGEST = /^[0-9a-f]{64}$/u;
const CEILING = 'Local production-owner composition on registered tv-dator, inprocess transport ' +
  'and virtual-clock schedules. No physical formation, cross-host clock, task3823 causality or time-saved claim.';
const ARCHIVE_BASE = 'https://github.com/psvensson/lagrange/releases/download/solve-evidence/';
const RED_ARCHIVE = `${ARCHIVE_BASE}${QUEST}--${QUEST}-original-red-b0a51112.tar.gz`;
const GREEN_ARCHIVE = Object.freeze({
  url: `${ARCHIVE_BASE}${QUEST}--${QUEST}-source-green-3bce09eb.tar.gz`,
  sha256: '78a2b971e9ef722809f97882063a63c17087352a577ae4a07bcfcd3583f9faeb',
});
const REJECTED_POSTFLIGHT = Object.freeze({
  requestId: '6d7114de-3e27-4f81-958d-93eaddeaa24d',
  url: `${ARCHIVE_BASE}${QUEST}--${QUEST}-postflight-failure-6d7114de.tar.gz`,
  sha256: '10a15173e0b6d0e768ae5be0234d6166d2ec3d7049cb0b41a0d1eff3430b2c5b',
});
const PENDING_REVIEW = 'Independent source/proof review of this content and original run remains outstanding.';

function requireEvidence(condition, label) {
  if (!condition) throw new Error(`Release evidence refused: ${label}`);
}
function digest(bytes) {
  return createHash(HASH).update(bytes).digest(HEX);
}
function readBounded(file) {
  const stat = fs.lstatSync(file);
  requireEvidence(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_BYTES, file);
  return fs.readFileSync(file);
}
function sourceBlob(file) {
  const result = spawnGit([GIT_SHOW, `${SOURCE}:${file}`], {cwd: ROOT,
    env: gitProcessEnvironment(), stdio: STDIO});
  requireEvidence(result.status === 0 && result.stdout, file);
  return result.stdout;
}
function matchingSourceDigests(files) {
  return Object.fromEntries(files.map((file) => {
    const measured = digest(sourceBlob(file));
    requireEvidence(digest(readBounded(path.join(ROOT, file))) === measured, file);
    return [file, measured];
  }));
}
function readOriginals(directory) {
  const anchors = Object.fromEntries(Object.entries(ANCHORS).map(([name, expected]) => {
    const bytes = readBounded(path.join(directory, name));
    requireEvidence(digest(bytes) === expected, name);
    return [name, JSON.parse(bytes.toString(ENCODING))];
  }));
  const manifest = anchors[RECORD_FILE.MANIFEST];
  const inventory = anchors[RECORD_FILE.INVENTORY];
  requireEvidence(manifest.requestId === REQUEST && inventory.job_id === REQUEST &&
    inventory.next_cursor === null, REQUEST);
  const originals = new Map();
  for (const entry of manifest.entries) {
    const name = entry.name;
    requireEvidence(typeof name === 'string' && !path.isAbsolute(name) &&
      !name.split(SLASH).includes(PARENT) && !originals.has(name), name);
    const bytes = readBounded(path.join(directory, ARTIFACTS, name));
    requireEvidence(bytes.length === entry.bytes && digest(bytes) === entry.sha256, name);
    originals.set(name, bytes);
  }
  requireEvidence(isDeepStrictEqual([...originals.keys()].sort(), [...inventory.names].sort()),
    REQUEST);
  return {anchors, originals};
}
function json(originals, name) {
  requireEvidence(originals.has(name), name);
  return JSON.parse(originals.get(name).toString(ENCODING));
}
function verifyStatus(status) {
  requireEvidence(status.job_id === REQUEST && status.state === MANAGED_COMPLETE &&
    status.exit_code === 0 && status.execution_scope_closed === true, REQUEST);
  requireEvidence(status.workload_started === true && status.source_execution_started === true &&
    status.host === HOST && status.generation === GENERATION, HOST);
  requireEvidence(status.source.sha === SOURCE && status.source.ref === BRANCH &&
    status.source.repo === REPO, SOURCE);
}
function verifyExecution(directory, originals) {
  const candidate = json(originals, ARTIFACT.SOURCE);
  requireEvidence(candidate.sha === SOURCE && candidate.tree === TREE && candidate.clean === true,
    ARTIFACT.SOURCE);
  requireEvidence(isDeepStrictEqual(candidate, json(originals, ARTIFACT.AFTER)), ARTIFACT.AFTER);
  const invocation = json(originals, ARTIFACT.INVOCATION);
  requireEvidence(invocation.registeredHost === HOST &&
    isDeepStrictEqual(invocation.selected, FILES),
  ARTIFACT.INVOCATION);
  const command = json(originals, ARTIFACT.COMMAND);
  requireEvidence(command.status === 0 && command.signal === null && command.error === null,
    ARTIFACT.COMMAND);
  const report = json(originals, ARTIFACT.REPORT);
  const reconstructed = buildExecutionReport({candidate, producer: report.producer,
    commands: report.commands, planned: FILES,
    runs: readExecutionRuns(path.join(directory, ARTIFACTS, ARTIFACT.SECTIONS)), reusedProofs: []});
  requireEvidence(isDeepStrictEqual(report, reconstructed), ARTIFACT.SECTIONS);
  const validation = executionReportProblems(reconstructed, {sha: SOURCE, tree: TREE,
    retryPolicy: RETRY_POLICY.REFUSE, requiredFiles: FILES});
  requireEvidence(validation.problems.length === 0, ARTIFACT.REPORT);
  requireEvidence(report.runs.length === 1, ARTIFACT.REPORT);
  return {candidate, invocation, validation, sourceRoot: report.runs[0].checkout.root};
}
function parseTap(originals, file, count) {
  const parser = new Parser();
  const cases = [];
  let final;
  parser.on(KIND.ASSERT, (item) => cases.push(item));
  parser.on(KIND.COMPLETE, (item) => {
    final = item;
  });
  parser.end(originals.get(`raw-tap/${file}.tap`));
  requireEvidence(final?.ok === true && final.count === count && final.pass === count &&
    final.fail === 0 && !final.bailout, file);
  requireEvidence(cases.length === count &&
    new Set(cases.map((item) => item.name)).size === count, file);
  for (const item of cases) {
    requireEvidence(item.ok === true && !item.skip && !item.todo && !item.tapError, item.name);
  }
  return {file, count, cases: cases.map((item) => item.name)};
}
function verifyPair(start, end) {
  requireEvidence(start.kind === KIND.START && end.kind === KIND.END &&
    start.isMainThread === true && end.isMainThread === true, end.pid);
  requireEvidence(start.threadId === 0 && end.threadId === 0 && end.exitCode === 0, end.pid);
  for (const field of PROCESS_FIELDS) {
    requireEvidence(isDeepStrictEqual(start[field], end[field]), field);
  }
}
function verifyLoadedBinding(record, native, sourceRoot) {
  requireEvidence(record.executableSha256 === native.process.sha256 &&
    record.execPath === native.process.execPath && record.cwd === sourceRoot, record.pid);
  requireEvidence(record.raftBinding?.glue.loaded === true, record.pid);
  for (const [key, file] of Object.entries(SOURCE_BINDING)) {
    const expected = native.raft[key];
    requireEvidence(expected.sha256 === digest(sourceBlob(file)) &&
      expected.path === path.join(sourceRoot, file), file);
    requireEvidence(record.raftBinding[key].sha256 === expected.sha256 &&
      record.raftBinding[key].realpath === expected.path, file);
  }
}
function verifyProcesses(originals, execution) {
  const native = json(originals, ARTIFACT.NATIVE);
  requireEvidence(isDeepStrictEqual(native, json(originals, ARTIFACT.NATIVE_AFTER)),
    ARTIFACT.NATIVE);
  const readiness = json(originals, ARTIFACT.READINESS);
  requireEvidence(readiness.readiness.ready === true && readiness.capability.thermal === MEASURED,
    ARTIFACT.READINESS);
  const names = [...originals.keys()].filter((name) => name.startsWith(IDENTITY));
  const starts = names.filter((name) => name.endsWith(START_SUFFIX));
  const ends = names.filter((name) => name.endsWith(END_SUFFIX));
  requireEvidence(starts.length === ends.length && starts.length > FILES.length, IDENTITY);
  const records = ends.map((name) => {
    const end = json(originals, name);
    verifyPair(json(originals, name.replace(END_SUFFIX, START_SUFFIX)), end);
    return end;
  });
  const {sourceRoot} = execution;
  return FILES.map((file) => {
    const matches = records.filter((record) => record.argv[1] === path.join(sourceRoot, file));
    requireEvidence(matches.length === 1, file);
    const record = matches[0];
    requireEvidence(record.hostname === execution.invocation.hostname, HOST);
    verifyLoadedBinding(record, native, sourceRoot);
    return {file, pid: record.pid, executableSha256: record.executableSha256,
      raftBinding: record.raftBinding, native: record.native};
  });
}
function readReview() {
  const selfDigest = digest(readBounded(path.join(ROOT, SELF)));
  const subjects = [SOURCE, REQUEST, ANCHORS[RECORD_FILE.MANIFEST], selfDigest];
  const entries = fs.readFileSync(path.join(ROOT, QUEST_HOME, RECORD_FILE.LOG), ENCODING)
    .trim().split(NEWLINE).map((line) => JSON.parse(line));
  // Later general landing reviews cannot replace this measured subject. A
  // later rejection of this exact subject does replace its earlier approval.
  const entry = entries.filter((item) => item.type === KIND.VERIFY &&
    subjects.every((subject) => item.text.includes(subject))).at(-1);
  if (!entry || entry.verdict !== KIND.APPROVE || entry.verifier !== VERIFIER ||
      !HEX_DIGEST.test(entry.candidateDigest)) return null;
  return {entryDigest: digest(JSON.stringify(entry)), verifier: entry.verifier,
    at: entry.at, candidateDigest: entry.candidateDigest, text: entry.text};
}
function writeReceipt(receipt) {
  const temporary = `${OUTPUT}.tmp`;
  fs.mkdirSync(path.dirname(OUTPUT), {recursive: true});
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporary, OUTPUT);
}
function prospectiveRealpath(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  const parent = path.dirname(file);
  requireEvidence(parent !== file, file);
  return path.join(prospectiveRealpath(parent), path.basename(file));
}
const unavailable = {schema: SCHEMA, quest: QUEST, status: STATE.UNAVAILABLE, receipts: []};
try {
  requireEvidence(process.argv.length === INPUT_COUNT, QUEST);
  const directory = prospectiveRealpath(path.resolve(process.argv[2]));
  const relative = path.relative(directory, prospectiveRealpath(OUTPUT));
  requireEvidence(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), OUTPUT);
  writeReceipt(unavailable);
  const {anchors, originals} = readOriginals(directory);
  verifyStatus(anchors[RECORD_FILE.STATUS]);
  const execution = verifyExecution(directory, originals);
  const measured = FILES.map((file, index) => parseTap(originals, file, COUNTS[index]));
  requireEvidence(isDeepStrictEqual(measured[0].cases, CASES), FILES[0]);
  requireEvidence(measured[1].cases.includes(CLOCK_CASE), CLOCK_CASE);
  const processes = verifyProcesses(originals, execution);
  const review = readReview();
  const receipt = {...unavailable, status: review === null ? STATE.FAIL : STATE.PASS,
    generatedAt: new Date().toISOString(), sourceCommit: SOURCE,
    sourceTree: TREE, requestId: REQUEST,
    testFileDigests: matchingSourceDigests(FILES),
    productionFileDigests: matchingSourceDigests(PRODUCTION),
    originalDigests: ANCHORS, originalArtifacts: anchors[RECORD_FILE.MANIFEST].entries,
    originalRed: {archive: RED_ARCHIVE}, originalArchive: GREEN_ARCHIVE,
    rejectedPostflight: REJECTED_POSTFLIGHT,
    ceiling: CEILING, execution, measured, processes, review,
    receipts: REQUIRED.map((id, index) => ({id, passed: index < REQUIRED.length - 1 || review !== null,
      ...(index < REQUIRED.length - 1 ? {testFile: FILES[0]} :
        {failure: review === null ? PENDING_REVIEW : null})})),
  };
  writeReceipt(receipt);
  process.stdout.write(`${JSON.stringify({status: receipt.status, measured: measured.map(({file, count}) =>
    ({file, count})), review: review !== null, output: OUTPUT})}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
