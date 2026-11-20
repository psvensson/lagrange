import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {
  buildExecutionReport, EXECUTION_PROBLEM, executionReportProblems, readExecutionRuns, RETRY_POLICY,
} from '../test-execution-report.js';

const HOST = 'tv-dator';
const TEST_FILE = 'test/rebalancer/strict-operation-outcomes.test.js';
const ORIGINAL_FILE_MAX_BYTES = 256 * 1024;
const DIGEST_ALGORITHM = 'sha256';
const TAP_STDERR_SUFFIX = '.stderr';
const TEST_PASS = 'ok';
const TEST_FAIL = 'not ok';
const ENCODING = Object.freeze({TEXT: 'utf8', DIGEST: 'hex'});
const NEWLINE = '\n';
const RUN_ID_SEPARATOR = '-';
const LOCAL_PLACEMENT = 'local';
const NO_RETRY = '0';
const THERMAL_MEASURED = 'measured';
const PROCESS_KIND = Object.freeze({START: 'start', END: 'end'});
const EXPECTED_PROCESS_COUNT = 3;
const PROBLEM = Object.freeze({
  MISMATCH: 'original manifest and inventory request mismatch',
  INCOMPLETE: 'original artifact inventory incomplete',
  CONTROLLER: 'controller did not complete the identified managed source execution',
  CANDIDATE: 'source changed or differs from the measured candidate',
  INVOCATION: 'managed invocation does not select the exact unretried witness',
  COMMAND: 'managed command result differs from the measured treatment',
  REPORT: 'original sections and complete unretried execution report disagree',
  RUN_SCOPE: 'nested runner scope differs from selected scope',
  RUN_OUTPUT: 'managed runner output disagrees with report',
  SUBSTRATE: 'native SQLite identity or candidate readiness changed',
  PROCESS_TREE: 'selected test process is not a child of the recorded classified runner',
  SQLITE_LOAD: 'selected test process did not load the measured SQLite addon',
});
const EXPECTED_FAILURE_PROBLEMS = Object.freeze([
  EXECUTION_PROBLEM.COMMAND_FAILED,
  EXECUTION_PROBLEM.RUN_FAILED,
  EXECUTION_PROBLEM.PLANNED_FILE_FAILED,
]);

function requireManaged(condition, message) {
  if (!condition) throw new Error(`managed evidence refused: ${message}`);
}
function digest(bytes) {
  return createHash(DIGEST_ALGORITHM).update(bytes).digest(ENCODING.DIGEST);
}
function readJson(originals, name) {
  return JSON.parse(originals.get(name).toString(ENCODING.TEXT));
}

const MANAGED_FILE = Object.freeze({
  STATUS: 'status.json', MANIFEST: 'manifest.json', INVENTORY: 'artifacts-0.json',
  DIRECTORY: 'artifacts', SOURCE: 'source-before.json', AFTER: 'source-after.json',
  CHECKOUT: 'checkout.json', INVOCATION: 'invocation.json', SELECTED: 'selected-files.txt',
  COMMAND: 'command-result.json', SECTIONS: 'execution-sections.ndjson',
  REPORT: 'execution-report.json', VALIDATION: 'execution-validation.json',
  STDOUT: 'runner.stdout', STDERR: 'runner.stderr', TAP: `raw-tap/${TEST_FILE}.tap`,
  NATIVE: 'native-before.json', NATIVE_AFTER: 'native-after.json',
  READINESS: 'candidate-readiness.json', IDENTITY: 'process-identity/',
});
const PROCESS_FIELDS = Object.freeze(['pid', 'ppid', 'argv', 'execArgv', 'execPath', 'hostname',
  'executableSha256', 'versions', 'bootId', 'cgroup', 'cwd']);
const PROCESS_SUFFIX = Object.freeze({START: '.start.json', END: '.end.json'});
const LOCK_FILE = 'package-lock.json';
const BETTER_SQLITE3 = 'node_modules/better-sqlite3';
const SQLITE_ADDON = 'better_sqlite3.node';
const MANAGED_RUNNER = 'scripts/run-test-files.js';
const CLASSIFIED_RUNNER = 'scripts/run-classified-test-files.js';

function readManagedFile(directory, name, expected) {
  const file = path.join(directory, name);
  const stat = fs.lstatSync(file);
  requireManaged(stat.isFile() && fs.realpathSync(file) === file &&
    stat.size <= ORIGINAL_FILE_MAX_BYTES, `invalid original file: ${name}`);
  const bytes = fs.readFileSync(file);
  requireManaged(digest(bytes) === expected, `${name} hash mismatch`);
  return bytes;
}

function readManagedOriginals(directory, expected) {
  const anchors = new Map(Object.entries(expected.anchors).map(([name, expected]) =>
    [name, readManagedFile(directory, name, expected)]));
  const manifest = readJson(anchors, MANAGED_FILE.MANIFEST);
  const inventory = readJson(anchors, MANAGED_FILE.INVENTORY);
  requireManaged(manifest.requestId === expected.requestId &&
    inventory.job_id === expected.requestId && inventory.host === HOST &&
    inventory.next_cursor === null, PROBLEM.MISMATCH);
  const originals = new Map();
  for (const {name, sha256, bytes} of manifest.entries) {
    requireManaged(!path.isAbsolute(name) && path.normalize(name) === name &&
      !name.startsWith(`..${path.sep}`) && !originals.has(name), `invalid artifact name: ${name}`);
    const original = readManagedFile(directory, path.join(MANAGED_FILE.DIRECTORY, name), sha256);
    requireManaged(original.length === bytes, `artifact size mismatch: ${name}`);
    originals.set(name, original);
  }
  requireManaged(isDeepStrictEqual([...originals.keys()].sort(), [...inventory.names].sort()),
    PROBLEM.INCOMPLETE);
  const status = readJson(anchors, MANAGED_FILE.STATUS);
  const expectedSource = {sha: expected.source, ref: expected.ref, repo: expected.repo};
  requireManaged(status.job_id === expected.requestId &&
    status.generation === expected.generation &&
    status.host === HOST && status.state === expected.controllerState &&
    status.exit_code === expected.exitStatus &&
    status.execution_scope_closed === true && status.source_execution_started === true &&
    status.workload_started === true && status.reason === null &&
    isDeepStrictEqual(status.source, expectedSource),
  PROBLEM.CONTROLLER);
  return {status, originals, manifest};
}

function readManagedExecution(directory, originals, expected) {
  const candidate = readJson(originals, MANAGED_FILE.SOURCE);
  requireManaged(candidate.sha === expected.source && candidate.tree === expected.tree &&
    candidate.clean === true && candidate.status === '' &&
    isDeepStrictEqual(candidate, readJson(originals, MANAGED_FILE.AFTER)),
  PROBLEM.CANDIDATE);
  const invocation = readJson(originals, MANAGED_FILE.INVOCATION);
  requireManaged(invocation.registeredHost === HOST &&
    invocation.env.LAGRANGE_PLACEMENT === LOCAL_PLACEMENT &&
    invocation.env.LAGRANGE_RETRY_FAILED_ONCE === NO_RETRY &&
    isDeepStrictEqual(invocation.candidate, candidate) &&
    isDeepStrictEqual(invocation.selected, [TEST_FILE]) &&
    originals.get(MANAGED_FILE.SELECTED).toString(ENCODING.TEXT) === `${TEST_FILE}\n`,
  PROBLEM.INVOCATION);
  const command = readJson(originals, MANAGED_FILE.COMMAND);
  requireManaged(command.status === expected.exitStatus &&
    command.signal === null && command.error === null,
  PROBLEM.COMMAND);
  const report = readJson(originals, MANAGED_FILE.REPORT);
  const sections = path.join(directory, MANAGED_FILE.DIRECTORY, MANAGED_FILE.SECTIONS);
  const runs = readExecutionRuns(sections);
  const reconstructed = buildExecutionReport({candidate, producer: report.producer,
    commands: report.commands, planned: [TEST_FILE], runs, reusedProofs: []});
  const validation = executionReportProblems(reconstructed, {
    sha: expected.source,
    tree: expected.tree,
    retryPolicy: RETRY_POLICY.REFUSE,
    requiredFiles: [TEST_FILE],
  });
  requireManaged(isDeepStrictEqual(report, reconstructed) &&
    isDeepStrictEqual(validation, readJson(originals, MANAGED_FILE.VALIDATION)) &&
    isDeepStrictEqual(validation.problems.map(({code}) => code),
      expected.exitStatus === 0 ? [] : EXPECTED_FAILURE_PROBLEMS) &&
    validation.qualification.length === 0 &&
    runs.length === 1 && validation.summary.assertions === expected.assertions,
  PROBLEM.REPORT);
  const [run] = runs;
  const passed = expected.exitStatus === 0;
  requireManaged(isDeepStrictEqual(run.checkout, readJson(originals, MANAGED_FILE.CHECKOUT)) &&
    run.results.length === 1 && run.results[0].attempts.length === 1 &&
    isDeepStrictEqual(run.planned, [TEST_FILE]) && run.exitStatus === expected.exitStatus &&
    run.results[0].ok === passed && run.results[0].attempts[0].ok === passed,
  PROBLEM.RUN_SCOPE);
  const stdout = originals.get(MANAGED_FILE.STDOUT).toString(ENCODING.TEXT);
  const stderr = originals.get(MANAGED_FILE.STDERR);
  const tapStderr = originals.get(MANAGED_FILE.TAP + TAP_STDERR_SUFFIX);
  const passCount = Number(passed);
  const failCount = Number(!passed);
  const fileResult = passed ? TEST_PASS : TEST_FAIL;
  const footer = `# test-files total=1 pass=${passCount} fail=${failCount}`;
  requireManaged(stdout.endsWith(`${footer} assertions=${expected.assertions}\n`) &&
    stdout.split(NEWLINE).some((line) =>
      line.startsWith(`${fileResult} ${TEST_FILE} (${expected.assertions} assertions, `)) &&
    (passed ? stderr.length === 0 : stderr.equals(tapStderr)),
  PROBLEM.RUN_OUTPUT);
  return {invocation, run, validation};
}

function managedProcessPairs(originals, exitStatus) {
  const names = [...originals.keys()].filter((name) => name.startsWith(MANAGED_FILE.IDENTITY));
  return names.filter((name) => name.endsWith(PROCESS_SUFFIX.END)).map((name) => {
    const end = readJson(originals, name);
    const startName = name.slice(0, -PROCESS_SUFFIX.END.length) + PROCESS_SUFFIX.START;
    const start = readJson(originals, startName);
    requireManaged(start.kind === PROCESS_KIND.START && end.kind === PROCESS_KIND.END &&
      start.isMainThread === true && end.isMainThread === true &&
      start.threadId === 0 && end.threadId === 0 && end.exitCode === exitStatus &&
      PROCESS_FIELDS.every((field) => isDeepStrictEqual(start[field], end[field])),
    `process identity disagreement: ${name}`);
    return end;
  });
}

function readManagedNative(originals, status, {invocation, run}, expected, sourceBlob) {
  const native = readJson(originals, MANAGED_FILE.NATIVE);
  const readiness = readJson(originals, MANAGED_FILE.READINESS);
  const lock = sourceBlob(LOCK_FILE, expected.source);
  requireManaged(isDeepStrictEqual(native, readJson(originals, MANAGED_FILE.NATIVE_AFTER)) &&
    native.lockfile === digest(lock) &&
    native.package === JSON.parse(lock).packages[BETTER_SQLITE3].version &&
    native.sqlite.sourceId && native.compileOptions.length > 0 &&
    readiness.readiness.ready === true && readiness.capability.thermal === THERMAL_MEASURED &&
    readiness.requirement.source === expected.source &&
    readiness.capability.repo.lockGraphSha256 === readiness.requirement.lockGraphSha256,
  PROBLEM.SUBSTRATE);
  const sourceRoot = run.checkout.root;
  const records = managedProcessPairs(originals, expected.exitStatus);
  const [classified] = records.filter(({argv}) =>
    argv[1] === path.join(sourceRoot, CLASSIFIED_RUNNER));
  const [runner] = records.filter(({argv}) => argv[1] === path.join(sourceRoot, MANAGED_RUNNER));
  const [test] = records.filter(({argv}) => argv[1] === path.join(sourceRoot, TEST_FILE));
  requireManaged(records.length === EXPECTED_PROCESS_COUNT && classified && runner && test &&
    runner.ppid === classified.pid && test.ppid === runner.pid &&
    String(runner.pid) === run.runId.split(RUN_ID_SEPARATOR)[0] &&
    isDeepStrictEqual(runner.argv.slice(2), run.argv) &&
    isDeepStrictEqual(classified.argv.slice(2), invocation.argv.slice(2)),
  PROBLEM.PROCESS_TREE);
  for (const record of records) {
    requireManaged(record.cwd === sourceRoot && record.hostname === invocation.hostname &&
      record.bootId === readiness.capability.bootId && record.cgroup.endsWith(`/${status.unit}\n`) &&
      record.execPath === native.process.execPath &&
      record.executableSha256 === native.process.sha256 &&
      isDeepStrictEqual(record.versions, native.process.versions),
    `recorded process is outside the measured substrate: ${record.pid}`);
  }
  const addon = native.native.find(({path: file}) => path.basename(file) === SQLITE_ADDON);
  requireManaged(addon && test.native.some((loaded) =>
    loaded.realpath === addon.path && loaded.sha256 === addon.sha256),
  PROBLEM.SQLITE_LOAD);
  return {testPid: test.pid, runnerPid: runner.pid, classifiedPid: classified.pid,
    node: native.process, addon, package: native.package, sqlite: native.sqlite,
    bootId: test.bootId, hostname: test.hostname,
    compileOptions: native.compileOptions, lockfile: native.lockfile,
    installedLockfile: native.installedLockfile};
}

function readManagedCustody(directory, expected, sourceBlob) {
  const {status, originals, manifest} = readManagedOriginals(directory, expected);
  const execution = readManagedExecution(directory, originals, expected);
  const native = readManagedNative(originals, status, execution, expected, sourceBlob);
  return {status, manifest, execution, native,
    tap: originals.get(MANAGED_FILE.TAP).toString(ENCODING.TEXT)};
}

export {readManagedCustody, MANAGED_FILE, HOST, TEST_FILE};
