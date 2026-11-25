import {basename, dirname, join} from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {createRequire} from 'module';
import {spawn} from 'child_process';
import {Worker} from 'worker_threads';
import os from 'os';
import fs from 'fs';
import {test} from '../../src/test-helpers/tap.js';
import {isolatedCensusNodeOptions} from '../test-helpers/census-pre-kill-flush.js';

function runEntrypoint(entryPath, opts = {}) {
  const {args = [], env = {}, timeoutMs = 15000} = opts;
  return runSpawnedBundle(args, env, {bundle: entryPath, timeoutMs});
}
import {
  ENTRYPOINT_DRY_RUN_OUTCOME,
  ENTRYPOINT_LOG_MSG,
} from '../../src/constants/entrypoint.js';
import {
  RAFT_RS_BINDING_LAYOUT,
  RAFT_RS_BINDING_STATE,
} from '../../src/raft/raft-rs-core-constants.js';
import {measureRuntimeContent} from '../../src/diagnostics/runtime-content-fingerprint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

const buildEntrypoint = join(projectRoot, 'scripts/build-sea.js');
const mainBundle = join(projectRoot, 'dist/index.bundle.cjs');
const cliBundle = join(projectRoot, 'dist/admin-cli.bundle.cjs');
const distNodeModules = join(projectRoot, 'dist/node_modules');
const requestCellWorkerBundle =
  join(projectRoot, 'dist/request-cell-worker.bundle.mjs');
const componentDerivationWorkerBundle =
  join(projectRoot, 'dist/component-derivation-worker.bundle.mjs');
const WORKER_PHASE_MESSAGE = 'phase';
const mainEntrypoint = join(projectRoot, 'src/index.js');
const stagedBindingDigest =
  join(projectRoot, 'dist', ...RAFT_RS_BINDING_LAYOUT.DIGEST_FROM_ROOT);
const JSON_LINE_PREFIX = '{';
const SEA_BUNDLE_SMOKE_TIMEOUT_MS = 120000;

// The first non-progress message: a Cell worker reports its start phase
// before its outcome.
function waitForWorkerStartup(worker) {
  return new Promise((resolve, reject) => {
    worker.on('message', (message) => {
      if (message.type !== WORKER_PHASE_MESSAGE) resolve(message);
    });
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
    const childEnv = {...process.env, ...env};
    const nodeOptions = isolatedCensusNodeOptions(process.env);
    if (nodeOptions) childEnv.NODE_OPTIONS = nodeOptions;
    else delete childEnv.NODE_OPTIONS;
    const child = spawn(process.execPath, [bundle, ...args], {
      cwd: projectRoot,
      env: childEnv,
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
    'bundled request Cell worker loads and rejects a start without a ' +
      'derived component',
  );

  const derivationWorker = new Worker(componentDerivationWorkerBundle, {
    workerData: {
      bytes: new Uint8Array([0]),
      instantiation: 'async',
      name: 'request-cell',
    },
  });
  t.teardown(() => derivationWorker.terminate());
  const derivationOutcome = await waitForWorkerStartup(derivationWorker);
  t.equal(
    derivationOutcome.type,
    'derivation_failed',
    'bundled component derivation worker loads jco and refuses corrupt ' +
      'component bytes',
  );

  const cliHelp = await runEntrypoint(cliBundle, {
    args: ['--help'],
    timeoutMs: 15000,
  });
  t.equal(cliHelp.exitCode, 0, 'CLI bundle help exits cleanly');

  const sourceDryRun = await runEntrypoint(mainEntrypoint, {
    args: ['--dry-run'],
    env: {LOG_LEVEL: 'error', NODE_HOST_ID: os.hostname()},
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
    env: {LOG_LEVEL: 'error', NODE_HOST_ID: os.hostname()},
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
    {LOG_LEVEL: 'info', NODE_HOST_ID: os.hostname()});
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
  const unstagedRun = await runSpawnedBundle(['--dry-run'],
    {LOG_LEVEL: 'error', NODE_HOST_ID: os.hostname()},
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

  const bundleServiceGenerate = await runEntrypoint(mainBundle, {
    args: ['service', 'generate', serviceTarget],
    timeoutMs: 30000,
  });
  t.equal(bundleServiceGenerate.exitCode, 0, 'bundle service generate exits cleanly');

  const bundleServiceBuild = await runEntrypoint(mainBundle, {
    args: ['service', 'build', serviceTarget],
    timeoutMs: 60000,
  });
  t.equal(bundleServiceBuild.exitCode, 0, 'bundle service build exits cleanly');
  t.equal(
    fs.existsSync(join(serviceTarget, 'dist/component.wasm')),
    true,
    'bundle service build creates dist/component.wasm',
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

const MERGE_WITNESS_TIMEOUT_MS = 30000;
const MERGE_WORKER_RUNTIME_PACKAGES = Object.freeze([
  'better-sqlite3',
  'bindings',
  'file-uri-to-path',
  'piscina',
]);
const coordinatorMergeProcessPath =
  join(projectRoot, 'src/query/distributed/coordinator-merge-process.js');
const sqlValueCodecPath = join(projectRoot, 'src/query/sql-value-codec.js');

function layOutIsolatedMergeBundle(root, {omitPackages = []} = {}) {
  const omitted = new Set(omitPackages);
  const bundle = join(root, basename(mainBundle));
  fs.copyFileSync(mainBundle, bundle);
  const targetNodeModules = join(root, 'node_modules');
  fs.mkdirSync(targetNodeModules, {recursive: true});
  for (const packageName of MERGE_WORKER_RUNTIME_PACKAGES) {
    if (omitted.has(packageName)) continue;
    fs.cpSync(
      join(distNodeModules, packageName),
      join(targetNodeModules, packageName),
      {recursive: true, dereference: true},
    );
  }
  return bundle;
}

function runNodeScript(args, {cwd = projectRoot, env = {}, timeoutMs = 15000} = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = {...process.env, ...env};
    const nodeOptions = isolatedCensusNodeOptions(process.env);
    if (nodeOptions) childEnv.NODE_OPTIONS = nodeOptions;
    else delete childEnv.NODE_OPTIONS;
    const child = spawn(process.execPath, args, {
      cwd,
      env: childEnv,
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
      else if (signal) reject(new Error(`process terminated by ${signal}`));
      else resolve({exitCode, stderr, stdout});
    });
  });
}

test(
  'CoordinatorMergeProcessPool executes in SEA_BUILD=true against isolated bundle',
  {timeout: SEA_BUNDLE_SMOKE_TIMEOUT_MS},
  async (t) => {
    if (!fs.existsSync(mainBundle) || !fs.existsSync(distNodeModules)) {
      const build = await runEntrypoint(buildEntrypoint, {
        timeoutMs: SEA_BUNDLE_SMOKE_TIMEOUT_MS,
      });
      t.equal(build.exitCode, 0, 'build script exits cleanly before merge witness');
    }

    const tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'lagrange-sea-merge-worker-'));
    t.teardown(() => fs.rmSync(tmpDir, {recursive: true, force: true}));
    const isolatedBundle = layOutIsolatedMergeBundle(tmpDir);
    t.equal(
      fs.lstatSync(join(tmpDir, 'node_modules')).isSymbolicLink(),
      false,
      'isolated merge bundle node_modules is a real directory, not a symlink',
    );

    const req = createRequire(isolatedBundle);
    const Database = req('better-sqlite3');
    const fragmentFixtures = [
      {file: join(tmpDir, 'frag-0.sqlite'), id: 1, name: 'alpha'},
      {file: join(tmpDir, 'frag-1.sqlite'), id: 2, name: 'beta'},
    ];
    for (const fixture of fragmentFixtures) {
      const db = new Database(fixture.file);
      db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)');
      db.prepare('INSERT INTO items (id, name) VALUES (?, ?)').run(fixture.id, fixture.name);
      db.close();
    }

    const witnessPath = join(tmpDir, 'witness.mjs');
    const witnessScript = [
      'import {createRequire} from "node:module";',
      'const [, , bundlePath, workDir, poolUrl, codecUrl, ...fragPaths] = process.argv;',
      'process.argv[1] = bundlePath;',
      'globalThis.__filename = bundlePath;',
      'globalThis.__dirname = workDir;',
      'const {CoordinatorMergeProcessPool} = await import(poolUrl);',
      'const {encodeTypedRowSet} = await import(codecUrl);',
      'const Database = createRequire(poolUrl)("better-sqlite3");',
      'const fragments = fragPaths.map((fragPath) => {',
      '  const db = new Database(fragPath, {readonly: true});',
      '  const rows = db.prepare("SELECT id, name FROM items ORDER BY id")',
      '    .safeIntegers(true).raw(true).all();',
      '  db.close();',
      '  return {rowSet: encodeTypedRowSet(["id", "name"], rows)};',
      '});',
      'const pool = new CoordinatorMergeProcessPool({maxWorkers: 1});',
      'let workerScript = null;',
      'try {',
      '  const merged = await pool.execute({',
      '    tables: [{',
      '      tableName: "items",',
      '      schema: {columns: [{name: "id", type: "INTEGER"}, {name: "name", type: "TEXT"}]},',
      '      declaredColumns: ["id", "name"],',
      '      fragments,',
      '    }],',
      '    sql: "SELECT id, name FROM items ORDER BY id",',
      '    params: [],',
      '    expectedColumns: ["id", "name"],',
      '  });',
      '  workerScript = pool.idleWorkers[0]?.spawnargs?.[1] ?? null;',
      '  const rows = merged.rows.map((row) => ({id: String(row.id), name: row.name}));',
      '  process.stdout.write(JSON.stringify({',
      '    seaBuild: process.env.SEA_BUILD,',
      '    workerScript,',
      '    rows,',
      '  }));',
      '} finally {',
      '  pool.shutdown();',
      '}',
    ].join('\n');
    fs.writeFileSync(witnessPath, witnessScript, 'utf8');

    const result = await runNodeScript(
      [
        witnessPath,
        isolatedBundle,
        tmpDir,
        pathToFileURL(coordinatorMergeProcessPath).href,
        pathToFileURL(sqlValueCodecPath).href,
        ...fragmentFixtures.map((fixture) => fixture.file),
      ],
      {
        cwd: tmpDir,
        env: {SEA_BUILD: 'true'},
        timeoutMs: MERGE_WITNESS_TIMEOUT_MS,
      },
    );

    t.equal(result.exitCode, 0, `merge witness exits cleanly: ${result.stderr}`);
    const outcome = JSON.parse(result.stdout.trim());
    t.equal(outcome.seaBuild, 'true', 'witness ran under SEA_BUILD=true');
    t.equal(
      outcome.workerScript,
      isolatedBundle,
      'CoordinatorMergeProcessPool resolves worker script to isolated index.bundle.cjs',
    );
    t.same(
      outcome.rows,
      [
        {id: '1', name: 'alpha'},
        {id: '2', name: 'beta'},
      ],
      'isolated SEA merge worker returns merged rows from real SQLite fragments',
    );

    // Negative control: omit `bindings` from the isolated directory while it remains
    // present in <projectRoot>/node_modules and <projectRoot>/dist/node_modules.
    // Because node_modules is copied rather than symlinked, the isolated merge worker
    // must fail closed rather than borrowing `bindings` from the checkout.
    const negDir = fs.mkdtempSync(join(os.tmpdir(), 'lagrange-sea-merge-neg-'));
    t.teardown(() => fs.rmSync(negDir, {recursive: true, force: true}));
    const negBundle = layOutIsolatedMergeBundle(negDir, {omitPackages: ['bindings']});
    const negWitnessPath = join(negDir, 'witness.mjs');
    fs.writeFileSync(negWitnessPath, witnessScript, 'utf8');

    const negResult = await runNodeScript(
      [
        negWitnessPath,
        negBundle,
        negDir,
        pathToFileURL(coordinatorMergeProcessPath).href,
        pathToFileURL(sqlValueCodecPath).href,
        ...fragmentFixtures.map((fixture) => fixture.file),
      ],
      {
        cwd: negDir,
        env: {SEA_BUILD: 'true'},
        timeoutMs: MERGE_WITNESS_TIMEOUT_MS,
      },
    );
    t.not(
      negResult.exitCode,
      0,
      'isolated merge worker fails closed when a required staged package is omitted',
    );
    t.match(
      negResult.stderr,
      /Cannot find module 'bindings'/u,
      'isolated merge worker does not borrow bindings from checkout node_modules',
    );
  },
);

test(
  'measureRuntimeContent measures installed-package layout without package-lock.json',
  async (t) => {
    const installedRoot = fs.mkdtempSync(join(os.tmpdir(), 'lagrange-installed-pkg-'));
    t.teardown(() => fs.rmSync(installedRoot, {recursive: true, force: true}));
    fs.mkdirSync(join(installedRoot, 'src'), {recursive: true});
    fs.mkdirSync(join(installedRoot, 'node_modules', 'dep-a'), {recursive: true});
    fs.writeFileSync(
      join(installedRoot, 'package.json'),
      JSON.stringify({
        name: 'lagrange-server',
        version: '0.4.2',
        dependencies: {'dep-a': '1.0.0'},
      }),
      'utf8',
    );
    fs.writeFileSync(join(installedRoot, 'src', 'index.js'), 'export const ok = 1;\n', 'utf8');
    fs.writeFileSync(
      join(installedRoot, 'node_modules', 'dep-a', 'package.json'),
      JSON.stringify({name: 'dep-a', version: '1.0.0'}),
      'utf8',
    );
    const depFile = join(installedRoot, 'node_modules', 'dep-a', 'index.js');
    fs.writeFileSync(depFile, 'module.exports = 1;\n', 'utf8');

    const first = await measureRuntimeContent(installedRoot);
    t.match(first.sourceDigest, /^[a-f0-9]{64}$/u, 'computes sourceDigest');
    t.match(first.dependencyDigest, /^[a-f0-9]{64}$/u, 'computes dependencyDigest without lockfile');
    t.match(first.manifestDigest, /^[a-f0-9]{64}$/u, 'computes manifestDigest from package.json');
    t.ok(first.dependencyFileCount >= 2, 'counts installed node_modules package files and edges');

    fs.writeFileSync(depFile, 'module.exports = 2;\n', 'utf8');
    const second = await measureRuntimeContent(installedRoot);
    t.equal(second.sourceDigest, first.sourceDigest, 'sourceDigest unchanged');
    t.equal(second.manifestDigest, first.manifestDigest, 'manifestDigest unchanged');
    t.not(
      second.dependencyDigest,
      first.dependencyDigest,
      'dependencyDigest changes when installed node_modules file changes',
    );
  },
);
