import {basename, dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {spawn} from 'child_process';
import {Worker} from 'worker_threads';
import os from 'os';
import fs from 'fs';
import {test} from '../../src/test-helpers/tap.js';
import {runEntrypoint} from '../../src/test-helpers/run-entrypoint.js';
import {
  ENTRYPOINT_DRY_RUN_OUTCOME,
  ENTRYPOINT_LOG_MSG,
} from '../../src/constants/entrypoint.js';
import {
  RAFT_RS_BINDING_LAYOUT,
  RAFT_RS_BINDING_STATE,
} from '../../src/raft/raft-rs-core-constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

const buildEntrypoint = join(projectRoot, 'scripts/build-sea.js');
const mainBundle = join(projectRoot, 'dist/index.bundle.cjs');
const cliBundle = join(projectRoot, 'dist/admin-cli.bundle.cjs');
const distNodeModules = join(projectRoot, 'dist/node_modules');
const requestCellWorkerBundle =
  join(projectRoot, 'dist/request-cell-worker.bundle.mjs');
const mainEntrypoint = join(projectRoot, 'src/index.js');
const stagedBindingDigest =
  join(projectRoot, 'dist', ...RAFT_RS_BINDING_LAYOUT.DIGEST_FROM_ROOT);
const JSON_LINE_PREFIX = '{';
const SEA_BUNDLE_SMOKE_TIMEOUT_MS = 120000;

function waitForWorkerStartup(worker) {
  return new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
}

/**
 * The dry run's own completion report, read from a finished process's log.
 * @param {string} stdout - the process's standard output.
 * @return {Object|undefined} the report, when the dry run completed.
 */
function dryRunCompletion(stdout) {
  return stdout.split('\n')
    .filter((line) => line.startsWith(JSON_LINE_PREFIX))
    .map((line) => JSON.parse(line))
    .find((entry) => entry.msg === ENTRYPOINT_LOG_MSG.DRY_RUN_COMPLETED);
}

/**
 * The main bundle laid out WITHOUT its staged binding: the bundle file and the
 * runtime packages it loads, and nothing else beside them.
 * @param {string} root - an empty directory to lay it out in.
 * @return {string} the bundle file in that layout.
 */
function layOutBundleWithoutBinding(root) {
  const bundle = join(root, basename(mainBundle));
  fs.copyFileSync(mainBundle, bundle);
  fs.symlinkSync(distNodeModules, join(root, 'node_modules'), 'dir');
  return bundle;
}

function runSpawnedBundle(args, env,
  {timeoutMs = 15000, bundle = mainBundle} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], {
      cwd: projectRoot,
      env: {...process.env, ...env},
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let spawnError;
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => {
      spawnError = error;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (spawnError) reject(spawnError);
      else if (signal) reject(new Error(`bundle terminated by ${signal}`));
      else resolve({exitCode, stderr, stdout});
    });
  });
}

test('SEA bundle smoke test', {timeout: SEA_BUNDLE_SMOKE_TIMEOUT_MS}, async (t) => {
  // The bundle build is CPU-bound and shares the machine with parallel test
  // jobs (and 2-vCPU CI runners): 30s flakes under contention while a real
  // hang still fails fast enough at 120s.
  const build = await runEntrypoint(buildEntrypoint, {
    timeoutMs: SEA_BUNDLE_SMOKE_TIMEOUT_MS,
  });
  t.equal(build.exitCode, 0, 'build script exits cleanly');
  t.equal(fs.existsSync(mainBundle), true, 'main bundle exists after build');
  t.equal(fs.existsSync(cliBundle), true, 'CLI bundle exists after build');
  t.equal(
    fs.existsSync(requestCellWorkerBundle),
    true,
    'request Cell worker bundle exists after build',
  );

  const requestCellWorker = new Worker(requestCellWorkerBundle, {
    workerData: {
      bytes: new Uint8Array([0]),
      capabilities: [],
      exportName: 'run',
      tables: [],
    },
  });
  t.teardown(() => requestCellWorker.terminate());
  const workerStartup = await waitForWorkerStartup(requestCellWorker);
  t.equal(
    workerStartup.type,
    'start_failed',
    'bundled request Cell worker loads and rejects corrupt component bytes',
  );

  const cliHelp = await runEntrypoint(cliBundle, {
    args: ['--help'],
    timeoutMs: 15000,
  });
  t.equal(cliHelp.exitCode, 0, 'CLI bundle help exits cleanly');

  const sourceDryRun = await runEntrypoint(mainEntrypoint, {
    args: ['--dry-run'],
    env: {LOG_LEVEL: 'error'},
    timeoutMs: 15000,
  });
  t.equal(sourceDryRun.exitCode, 0, 'source entrypoint dry-run exits cleanly');
  t.notMatch(
    sourceDryRun.stdout,
    /Bootstrap API started/,
    'source dry-run does not start services',
  );

  const bundleDryRun = await runEntrypoint(mainBundle, {
    args: ['--dry-run'],
    env: {LOG_LEVEL: 'error'},
    timeoutMs: 15000,
  });
  t.equal(bundleDryRun.exitCode, 0, 'bundle dry-run exits cleanly');
  t.notMatch(
    bundleDryRun.stdout,
    /Bootstrap API started/,
    'bundle dry-run does not start services',
  );

  // The vendored rs-raft binding, staged beside the bundle and loaded from
  // it by its own runtime owner: the dry run reports that owner's verdict. A
  // real process, so the report is read after the dry run has finished.
  const bundleBinding = await runSpawnedBundle(['--dry-run'],
    {LOG_LEVEL: 'info'});
  const bindingCompletion = dryRunCompletion(bundleBinding.stdout);
  const bindingReport = bindingCompletion?.raftRsBinding;
  t.equal(bundleBinding.exitCode, 0, 'bundle binding dry-run exits cleanly');
  t.equal(bindingReport?.state, RAFT_RS_BINDING_STATE.VERIFIED,
    'bundle dry-run verifies the staged rs-raft binding and loads it');
  t.equal(bindingReport?.digestFile, stagedBindingDigest,
    'the binding the bundle verified is the one staged beside it');
  t.equal(bindingCompletion?.dryRunOutcome, ENTRYPOINT_DRY_RUN_OUTCOME.COMPLETED,
    'with its binding staged the bundle dry run completes');

  // The same bundle with no binding staged beside it is a packaging defect
  // the dry run must refuse, at the quietest ordinary log level.
  const unstagedRoot = fs.mkdtempSync(join(os.tmpdir(), 'lagrange-sea-unstaged-'));
  t.teardown(() => fs.rmSync(unstagedRoot, {recursive: true, force: true}));
  const unstagedRun = await runSpawnedBundle(['--dry-run'], {LOG_LEVEL: 'error'},
    {bundle: layOutBundleWithoutBinding(unstagedRoot)});
  const unstagedCompletion = dryRunCompletion(unstagedRun.stdout);
  t.not(unstagedRun.exitCode, 0,
    'a bundle without its staged binding fails its dry run');
  t.equal(unstagedCompletion?.dryRunOutcome,
    ENTRYPOINT_DRY_RUN_OUTCOME.BINDING_UNAVAILABLE,
    'and the dry run names why: the binding is unavailable');
  t.equal(unstagedCompletion?.raftRsBinding?.state,
    RAFT_RS_BINDING_STATE.UNAVAILABLE,
    'as the runtime owner\'s own verdict on that layout');

  const tempRoot = fs.mkdtempSync(join(os.tmpdir(), 'lagrange-sea-init-'));
  const serviceTarget = join(tempRoot, 'bundled-service');
  t.teardown(() => fs.rmSync(tempRoot, {recursive: true, force: true}));
  const bundleServiceInit = await runEntrypoint(mainBundle, {
    args: ['service', 'init', serviceTarget],
    timeoutMs: 15000,
  });
  t.equal(bundleServiceInit.exitCode, 0, 'bundle service init exits cleanly');
  t.equal(
    fs.existsSync(join(serviceTarget, 'lagrange.service.js')),
    true,
    'bundle service init creates the WASM-first service source',
  );
  t.equal(
    fs.existsSync(join(serviceTarget, 'authoring', 'define-service.js')),
    true,
    'bundle service init vendors the staged authoring library',
  );

  const bundleSecret = 'BUNDLE_SECRET_MUST_NOT_LEAK';
  const bundleLifecycle = await runSpawnedBundle(
    ['service', 'list'],
    {
      PGCONNECT_TIMEOUT: '1',
      PGDATABASE: 'service_cli',
      PGHOST: '127.0.0.1',
      PGPASSWORD: bundleSecret,
      PGPORT: '1',
      PGSSLMODE: 'disable',
      PGUSER: 'service_cli',
    },
  );
  t.equal(bundleLifecycle.exitCode, 1,
    'bundled lifecycle command fails closed when PG is unreachable');
  t.equal(bundleLifecycle.stdout, '',
    'bundled lifecycle failure emits no success output');
  t.match(bundleLifecycle.stderr, /PostgreSQL connection failed/u,
    'bundled lifecycle route loads its production pg client');
  t.notMatch(bundleLifecycle.stderr, new RegExp(bundleSecret, 'u'),
    'bundled lifecycle failure does not print its password');
  t.notMatch(
    bundleLifecycle.stderr,
    /unknown_command|ERR_MODULE_NOT_FOUND|Cannot find module/iu,
    'bundled lifecycle route contains its command owner and pg closure',
  );
});
