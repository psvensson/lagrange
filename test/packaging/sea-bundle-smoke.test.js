import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {spawn} from 'child_process';
import {Worker} from 'worker_threads';
import os from 'os';
import fs from 'fs';
import {test} from '../../src/test-helpers/tap.js';
import {runEntrypoint} from '../../src/test-helpers/run-entrypoint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

const buildEntrypoint = join(projectRoot, 'scripts/build-sea.js');
const mainBundle = join(projectRoot, 'dist/index.bundle.cjs');
const cliBundle = join(projectRoot, 'dist/admin-cli.bundle.cjs');
const requestCellWorkerBundle =
  join(projectRoot, 'dist/request-cell-worker.bundle.mjs');
const mainEntrypoint = join(projectRoot, 'src/index.js');

function waitForWorkerStartup(worker) {
  return new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
}

function runSpawnedBundle(args, env, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mainBundle, ...args], {
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

test('SEA bundle smoke test', async (t) => {
  const build = await runEntrypoint(buildEntrypoint, {timeoutMs: 30000});
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

  const tempRoot = fs.mkdtempSync(join(os.tmpdir(), 'lagrange-sea-init-'));
  const serviceTarget = join(tempRoot, 'bundled-service');
  t.teardown(() => fs.rmSync(tempRoot, {recursive: true, force: true}));
  const bundleServiceInit = await runEntrypoint(mainBundle, {
    args: ['service', 'init', serviceTarget],
    timeoutMs: 15000,
  });
  t.equal(bundleServiceInit.exitCode, 0, 'bundle service init exits cleanly');
  t.equal(
    fs.existsSync(join(serviceTarget, 'lagrange-service.template.json')),
    true,
    'bundle service init creates the manifest template',
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
