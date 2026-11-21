// Read-only validation of collected originals against independently retained
// expectations. Matching bytes are not a Solver receipt or review approval.
import path from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {
  buildExecutionReport, executionReportProblems, readExecutionRuns, RETRY_POLICY, SECTION_KIND,
} from '../test-execution-report.js';
import {
  CLASSIFIED_RUNNER, digest, LOCAL_PLACEMENT, MANAGED_FILE, MANAGED_RUNNER, NEWLINE, NO_RETRY,
  PROCESS_SUFFIX, readJson, readManagedCandidate, readManagedCommand, readManagedFile,
  readManagedOriginals, readManagedProcessPair, readManagedSubstrate, requireManaged,
  SQLITE_ADDON, TEST_FILE, verifyManagedProcessSubstrate,
} from './strict-operation-outcomes-managed-custody.js';

const CENSUS = {
  count: 85, sha256: '27887790f6254810558cc7ee01e8777b4bcd14fe21b777fdca54ef11cc8c0b1f',
};
const HOSTS = ['adam-laptop', 'adams-gamla'];
const REPO = 'psvensson/lagrange';
const PREPARED = 'prepared-manifest.json';
const METADATA = ['impact-graph-seal', 'primary-classes', 'resource-classes', 'subsystem-classes']
  .map((name) => `test/shards/${name}.json`);
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;
const SHA = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const TEST_PATH = /^test\/(?:[\w.-]+\/)*[\w.-]+\.test\.js$/u;
const ENCODING = 'utf8';
const STDIN = '--stdin';
const RUNNER_PRODUCER = 'managed-source-shell';
const RUNNER_COMMAND = 'canonical-classified-selected-shard';
const COMPLETE = 'COMPLETE';
const FILE = Object.freeze({
  PROCESS_LINKS: 'test-process-links.json',
  LEDGER: 'test-results.ndjson',
  COLLECTION_FAILURE: 'collection-or-setup-failure.json',
  PAYLOAD: 'payload.mjs',
  PRELOAD: 'process-identity.cjs',
  PREPARATION: 'preparation.json',
  METADATA: 'metadata-identities.json',
  RUNTIME: 'runtime-host.json',
});
const PROBLEM = Object.freeze({
  NO_DIGEST: 'missing independently reviewed digest',
  ANCHORS: 'missing or foreign classified collection anchors',
  SOURCE: 'missing reviewed classified source identity',
  TREE: 'reviewed classified source tree differs',
  PREPARED: 'prepared proof differs from reviewed source or census',
  HOSTS: 'classified proof requires two identified requests from distinct registered hosts',
  SELECTION_NAME: 'invalid retained shard selection name',
  SELECTION: 'invalid retained shard selection',
  SECTION_ORDER: 'classified execution contains a duplicate, malformed or out-of-order section',
  TRUNCATED: 'classified execution has truncated runner sections',
  INVOCATION: 'classified invocation and checkout differ from selected source',
  RUN_SCOPE: 'classified runner scope differs from its results',
  REPORT: 'classified report and complete unretried execution sections disagree',
  PROC_NAMES: 'invalid classified process pair names',
  MISSING_RESULTS: 'classified test links, raw runner outputs or result ledger are incomplete',
  SQLITE_WITNESS: 'classified strict witness did not load the measured SQLite addon',
  ASSERTION_SUM: 'classified runner scope or assertion sum differs',
  PREPARATION: 'classified producer bytes diverge or report setup/collection failure',
  METADATA: 'classified metadata differs from current source blobs',
  RUNTIME: 'classified runtime provenance disagrees with measured substrate',
  CENSUS: 'classified shard union omits, duplicates or substitutes census members',
  BOOTS: 'classified requests did not measure two distinct boot identities',
});
const sortFiles = (files) => [...files].sort();

function requireDigest(value) {
  requireManaged(typeof value === 'string' && SHA256.test(value), PROBLEM.NO_DIGEST);
}

function ndjson(bytes) {
  return bytes.toString(ENCODING).trimEnd().split(NEWLINE).map((line) => JSON.parse(line));
}

function reviewedPages(anchors) {
  const names = Object.keys(anchors);
  const pageCount = names.length - 2; // controller status and collection manifest
  const pages = Array.from({length: Math.max(pageCount, 0)}, (_, i) => `artifacts-${i}.json`);
  requireManaged(pages.length > 0 && [...pages, MANAGED_FILE.STATUS, MANAGED_FILE.MANIFEST]
    .every((name) => Object.hasOwn(anchors, name)), PROBLEM.ANCHORS);
  Object.values(anchors).forEach(requireDigest);
  return pages;
}

function readPrepared(directory, expected, sourceTree) {
  requireManaged(SHA.test(expected.source) && SHA.test(expected.tree) &&
    /^refs\/heads\//u.test(expected.ref), PROBLEM.SOURCE);
  requireManaged(sourceTree(expected.source) === expected.tree, PROBLEM.TREE);
  requireDigest(expected.preparedManifestSha256);
  const manifest = readManagedFile(directory, PREPARED, expected.preparedManifestSha256);
  const prepared = JSON.parse(manifest);
  requireManaged(prepared.source === expected.source && prepared.tree === expected.tree &&
    prepared.ref === expected.ref && prepared.fileCount === CENSUS.count &&
    prepared.fullSelectionSha256 === CENSUS.sha256, PROBLEM.PREPARED);
  requireDigest(prepared.payloadSha256);
  requireDigest(prepared.preloadSha256);
  requireManaged(equal(sortFiles(prepared.shards.map(({host}) => host)), HOSTS) &&
    equal(sortFiles(expected.shards.map(({host}) => host)), HOSTS) &&
    expected.shards.every(({requestId, generation}) =>
      UUID.test(requestId) && UUID.test(generation)) &&
    new Set(expected.shards.map(({requestId}) => requestId)).size === HOSTS.length,
  PROBLEM.HOSTS);
  return prepared;
}

function readPlan(directory, shard) {
  requireDigest(shard.selectionSha256);
  requireManaged(shard.selection === `${shard.host}.selected.txt`, PROBLEM.SELECTION_NAME);
  const bytes = readManagedFile(directory, shard.selection, shard.selectionSha256);
  const files = bytes.toString(ENCODING).trimEnd().split(NEWLINE);
  requireManaged(files.length === shard.fileCount && files.every((file) =>
    TEST_PATH.test(file) && path.normalize(file) === file) &&
    shard.strictSQLiteWitness === (files.includes(TEST_FILE) ? TEST_FILE : '') &&
    bytes.equals(Buffer.from(`${files.join(NEWLINE)}\n`)), PROBLEM.SELECTION);
  return {bytes, files, selectionSha256: shard.selectionSha256};
}

function validateSectionPairs(originals, runs) {
  const sections = ndjson(originals.get(MANAGED_FILE.SECTIONS));
  const starts = new Set();
  const ends = new Set();
  for (const {kind, runId} of sections) {
    const first = kind === SECTION_KIND.START && !starts.has(runId);
    const last = kind === SECTION_KIND.END && starts.has(runId) && !ends.has(runId);
    requireManaged(typeof runId === 'string' && (first || last),
      PROBLEM.SECTION_ORDER);
    (first ? starts : ends).add(runId);
  }
  requireManaged(starts.size === runs.length && ends.size === runs.length,
    PROBLEM.TRUNCATED);
}

function readClassifiedInvocation(originals, expected, candidate, plan) {
  const invocation = readJson(originals, MANAGED_FILE.INVOCATION);
  const checkout = readJson(originals, MANAGED_FILE.CHECKOUT);
  requireManaged(equal(invocation.candidate, candidate) &&
    invocation.registeredHost === expected.host && equal(invocation.selected, plan.files) &&
    plan.bytes.equals(originals.get(MANAGED_FILE.SELECTED)) &&
    invocation.env.LAGRANGE_PLACEMENT === LOCAL_PLACEMENT &&
    invocation.env.LAGRANGE_RETRY_FAILED_ONCE === NO_RETRY &&
    equal(invocation.argv.slice(1), [CLASSIFIED_RUNNER, STDIN]) &&
    equal({head: checkout.head, tree: checkout.tree, clean: checkout.clean},
      {head: candidate.sha, tree: candidate.tree, clean: true}) && path.isAbsolute(checkout.root),
  PROBLEM.INVOCATION);
  return {invocation, checkout};
}

function resultIndex(runs, checkout) {
  const results = new Map();
  for (const run of runs) {
    requireManaged(equal(run.checkout, checkout) &&
      equal(sortFiles(run.planned), sortFiles(run.results.map(({file}) => file))),
    PROBLEM.RUN_SCOPE);
    for (const row of run.results) {
      requireManaged(!results.has(row.file) && row.ok === true &&
        equal(row.attempts, [{attempt: 1, ok: true, assertions: row.assertions, reasons: []}]),
      `unmeasured or repeated runner result: ${row.file}`);
      results.set(row.file, {row, run});
    }
  }
  return results;
}

function readExecution(directory, originals, expected, plan) {
  const candidate = readManagedCandidate(originals, expected);
  const {invocation, checkout} = readClassifiedInvocation(originals, expected, candidate, plan);
  const command = readManagedCommand(originals, expected);
  const original = readJson(originals, MANAGED_FILE.REPORT);
  const sections = path.join(directory, MANAGED_FILE.DIRECTORY, MANAGED_FILE.SECTIONS);
  const runs = readExecutionRuns(sections);
  validateSectionPairs(originals, runs);
  const report = buildExecutionReport({candidate,
    producer: {kind: RUNNER_PRODUCER, id: path.dirname(invocation.env.LAGRANGE_EXECUTION_REPORT),
      host: expected.host},
    commands: [{label: RUNNER_COMMAND, exitStatus: command.status}],
    planned: plan.files, runs});
  const validation = executionReportProblems(report, {sha: expected.source, tree: expected.tree,
    retryPolicy: RETRY_POLICY.REFUSE, requiredFiles: plan.files});
  const results = resultIndex(runs, checkout);
  const originalValidation = readJson(originals, MANAGED_FILE.VALIDATION);
  requireManaged(equal(original, report) && equal(validation, originalValidation) &&
    validation.problems.length === 0 && validation.qualification.length === 0 &&
    equal(sortFiles(results.keys()), sortFiles(plan.files)),
  PROBLEM.REPORT);
  return {invocation, checkout, results, assertions: validation.summary.assertions};
}

function processRecord(originals, status, root, runtime, node, link) {
  requireManaged(typeof link?.end === 'string' && /^[\w-]+\.end\.json$/u.test(link.end) &&
    link.start === link.end.replace(/\.end\.json$/u, PROCESS_SUFFIX.START),
  PROBLEM.PROC_NAMES);
  const record = readManagedProcessPair(originals, MANAGED_FILE.IDENTITY + link.end, 0);
  requireManaged(Number.isSafeInteger(record.pid) && record.pid > 0 && record.pid === link.pid &&
    record.cgroup === runtime.parentCgroup, `classified process is outside its scope: ${link.pid}`);
  verifyManagedProcessSubstrate(record, status, {...runtime, sourceRoot: root, node});
  return record;
}

function verifyProcessLinks(originals, status, execution, {link, run, file, runtime, node}) {
  const {root} = execution.checkout;
  const [test, runner, classified] = [link.test, link.runner, link.classified]
    .map((role) => processRecord(originals, status, root, runtime, node, role));
  requireManaged(test.ppid === runner.pid && runner.ppid === classified.pid &&
    test.argv[1] === path.join(root, file) && runner.argv[1] === path.join(root, MANAGED_RUNNER) &&
    classified.argv[1] === path.join(root, CLASSIFIED_RUNNER) &&
    run.runId.startsWith(`${runner.pid}-`) && equal(run.argv, runner.argv.slice(2)) &&
    equal(classified.argv.slice(2), execution.invocation.argv.slice(2)),
  `classified test lacks its recorded runner ancestry: ${file}`);
  return [test, classified];
}

function verifyMeasuredTap(originals, row, recorded, validateTap) {
  const {file} = row;
  const tapFile = `raw-tap/${file}.tap`;
  requireManaged(row.ok === true && row.attempt === 1 && row.retriedOnce === false &&
    row.firstFailureLine === null && Number.isSafeInteger(row.assertions) && row.assertions > 0 &&
    row.assertions === recorded.assertions && originals.has(tapFile) &&
    originals.has(`${tapFile}.stderr`) &&
    validateTap(originals.get(tapFile), file) === row.assertions,
  `classified ledger, runner and raw TAP disagree: ${file}`);
}

function readMeasuredFiles(originals, status, execution, native, runtime, validateTap) {
  const links = readJson(originals, FILE.PROCESS_LINKS).witnesses;
  const ledger = ndjson(originals.get(FILE.LEDGER));
  const files = sortFiles(execution.results.keys());
  requireManaged(equal(sortFiles(links.map(({file}) => file)), files) &&
    equal(sortFiles(ledger.map(({file}) => file)), files) &&
    originals.has(MANAGED_FILE.STDOUT) && originals.has(MANAGED_FILE.STDERR),
  PROBLEM.MISSING_RESULTS);
  const linkByFile = new Map(links.map((link) => [link.file, link]));
  const tests = new Set();
  const classifiedPids = new Set();
  const addon = native.native.find(({path: name}) => path.basename(name) === SQLITE_ADDON);
  let assertions = 0;
  for (const row of ledger) {
    const {file} = row;
    const link = linkByFile.get(file);
    const {row: recorded, run} = execution.results.get(file);
    const [test, classified] = verifyProcessLinks(originals, status, execution,
      {link, run, file, runtime, node: native.process});
    requireManaged(!tests.has(test.pid), `classified test process reused: ${file}`);
    tests.add(test.pid);
    classifiedPids.add(classified.pid);
    if (file === TEST_FILE) {
      requireManaged(addon && link.sqliteLoaded === true && test.native.some((loaded) =>
        loaded.realpath === addon.path && loaded.sha256 === addon.sha256),
      PROBLEM.SQLITE_WITNESS);
    }
    verifyMeasuredTap(originals, row, recorded, validateTap);
    assertions += row.assertions;
  }
  requireManaged(classifiedPids.size === 1 && assertions === execution.assertions,
    PROBLEM.ASSERTION_SUM);
  return assertions;
}

function readShard(directory, expected, prepared, plan, sourceBlob, validateTap) {
  const original = path.join(directory, expected.requestId);
  const {status, originals} = readManagedOriginals(original, expected,
    {pages: reviewedPages(expected.anchors), artifactMaxBytes: MAX_ARTIFACT_BYTES});
  requireManaged(!originals.has(FILE.COLLECTION_FAILURE) &&
    digest(originals.get(FILE.PAYLOAD)) === prepared.payloadSha256 &&
    digest(originals.get(FILE.PRELOAD)) === prepared.preloadSha256 &&
    readJson(originals, FILE.PREPARATION).ok === true,
  PROBLEM.PREPARATION);
  const metadata = readJson(originals, FILE.METADATA);
  requireManaged(equal(Object.keys(metadata).sort(), METADATA) &&
    METADATA.every((name) => metadata[name] === digest(sourceBlob(name, expected.source))),
  PROBLEM.METADATA);
  const runtime = readJson(originals, FILE.RUNTIME);
  const {native, readiness} = readManagedSubstrate(originals, expected, sourceBlob);
  const execution = readExecution(original, originals, expected, plan);
  requireDigest(native.process.sha256);
  requireManaged(UUID.test(runtime.bootId) && runtime.hostname &&
    equal(runtime, {...runtime, registeredHost: expected.host,
      hostname: execution.invocation.hostname, bootId: readiness.capability.bootId,
      nodePath: native.process.execPath, nodeSha256: native.process.sha256,
      nodeVersion: `v${native.process.versions.node}`}), PROBLEM.RUNTIME);
  const assertions = readMeasuredFiles(originals, status, execution, native, runtime, validateTap);
  return {host: expected.host, requestId: expected.requestId, generation: expected.generation,
    manifestSha256: expected.anchors[MANAGED_FILE.MANIFEST], selectionSha256: plan.selectionSha256,
    hostname: runtime.hostname, bootId: runtime.bootId,
    selectedFiles: plan.files.length, assertions};
}

function validateClassifiedOriginals(directory, reviewInput, context) {
  const {sourceTree, sourceBlob, validateTap} = context;
  const bytes = readManagedFile(path.dirname(reviewInput), path.basename(reviewInput));
  const expected = JSON.parse(bytes);
  const prepared = readPrepared(directory, expected, sourceTree);
  const plans = prepared.shards.map((shard) => readPlan(directory, shard));
  const files = plans.flatMap((plan) => plan.files).sort();
  requireManaged(files.length === CENSUS.count && files.includes(TEST_FILE) &&
    new Set(files).size === CENSUS.count && digest(`${files.join(NEWLINE)}\n`) === CENSUS.sha256,
  PROBLEM.CENSUS);
  const shards = prepared.shards.map((shard, index) => {
    const review = expected.shards.find(({host}) => host === shard.host);
    return readShard(directory, {...review, source: prepared.source, tree: prepared.tree,
      ref: prepared.ref, repo: REPO, controllerState: COMPLETE, exitStatus: 0},
    prepared, plans[index], sourceBlob, validateTap);
  });
  requireManaged(new Set(shards.map(({bootId}) => bootId)).size === HOSTS.length,
    PROBLEM.BOOTS);
  return {source: expected.source, tree: expected.tree, selectedFiles: files.length, shards,
    requiresIndependentCandidateReview: true};
}

export {validateClassifiedOriginals};
