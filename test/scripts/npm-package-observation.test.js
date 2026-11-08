import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {describe, it} from 'node:test';
import {basename, dirname, join} from 'node:path';
import {validatePackageObservation} from '../../scripts/npm-package-observation.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const FIXTURE_TIMEOUT_MS = 15000;
const COMMAND_COUNT = 11;

// Isolated builtin replacement exercises the actual owner without a production
// injection hook, npm network access, or a substitute packaging implementation.
async function packageFixture(configuration = {}) {
  const assert = (await import('node:assert/strict')).default;
  const childProcess = (await import('node:child_process')).default;
  const fs = (await import('node:fs')).default;
  const {syncBuiltinESMExports} = await import('node:module');
  const {tmpdir} = await import('node:os');
  const {join, basename} = await import('node:path');
  const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const root = fs.mkdtempSync(join(tmpdir(), 'package-observation-fixture-'));
  const gitHead = '0123456789012345678901234567890123456789';
  const calls = [];
  const records = [];
  const cleanupError = Object.assign(new Error('fixture cleanup failed'), {code: 'CLEANUP'});
  const originalRm = fs.promises.rm;
  fs.promises.rm = async (path, ...args) => {
    const result = await originalRm(path, ...args);
    if (configuration.cleanupFailure && String(path).includes('lagrange-npm-install-')) {
      throw cleanupError;
    }
    return result;
  };
  const temporaryRoots = new Set();
  const normalize = (value) => JSON.parse(JSON.stringify(value)
    .replace(/lagrange-npm-pack-[A-Za-z0-9]+/gu, 'lagrange-npm-pack-TEMP')
    .replace(/lagrange-npm-install-[A-Za-z0-9]+/gu, 'lagrange-npm-install-TEMP')
    .replace(/output-(?:baseline|observed)/gu, 'output'));
  childProcess.spawnSync = (command, args, options) => {
    assert.equal(options.env, process.env, 'the original env object reaches spawnSync');
    calls.push({command, args, options: {...options, env: 'process.env'}});
    const result = {status: 0, signal: null, stdout: '', stderr: ''};
    for (const path of [options.cwd, ...args]) {
      const match = String(path).match(/^(.*\/lagrange-npm-(?:pack|install)-[^/]+)/u);
      if (match) temporaryRoots.add(match[1]);
    }
    if (basename(command).startsWith('npm') && args[0] === 'pack') {
      result.stdout = JSON.stringify([{
        name: manifest.name,
        version: manifest.version,
        filename: 'candidate.tgz',
        integrity: 'sha512-fixture',
        files: [{path: 'package.json'}],
      }]);
      fs.writeFileSync(join(args[4], 'candidate.tgz'), 'fixture tarball');
    } else if (command === 'tar') {
      const stagedRoot = join(args[3], 'package');
      fs.mkdirSync(stagedRoot);
      fs.writeFileSync(join(stagedRoot, 'package.json'), JSON.stringify(manifest));
    } else if (basename(command).startsWith('npm') && args[0] === 'install') {
      const installed = join(options.cwd, 'node_modules', manifest.name);
      const bin = join(options.cwd, 'node_modules', '.bin');
      fs.mkdirSync(installed, {recursive: true});
      fs.mkdirSync(bin);
      fs.writeFileSync(join(installed, 'package.json'), JSON.stringify({...manifest, gitHead}));
      fs.writeFileSync(join(options.cwd, 'node_modules', '.package-lock.json'),
        JSON.stringify({lockfileVersion: 3, packages: {}}));
      for (const name of ['lagrange', 'lagrange-admin']) {
        fs.writeFileSync(join(installed, name), 'fixture bin');
        fs.symlinkSync(join(installed, name), join(bin, name));
      }
    } else if (args[0] === '--version') {
      result.stdout = basename(command) === 'lagrange' ?
        `lagrange v${manifest.version}\n` : `lagrange-admin version ${manifest.version}\n`;
    } else if (args[0] === '--dry-run') {
      result.stdout = 'Dry run completed';
    } else {
      assert.ok(command === process.execPath || args[0] === 'service',
        'the fixture refuses unexpected commands');
    }
    if (configuration.failure === 'install-timeout' && args[0] === 'install') {
      return {...result, status: null, signal: 'SIGTERM',
        error: Object.assign(new Error('fixture timeout'), {code: 'ETIMEDOUT'})};
    }
    if (configuration.failure === 'malformed-pack' && args[0] === 'pack') {
      return {...result, stdout: '{broken json'};
    }
    if (configuration.failure === 'bin-version' && args[0] === '--version') {
      return {...result, stdout: 'wrong version'};
    }
    return result;
  };
  syncBuiltinESMExports();
  const {buildAndVerifyNpmPackage} = await import('../../scripts/release-npm-package.js'
    .replace('../../', `${process.cwd()}/`));
  const {finishPackageObservation} = await import(
    `${process.cwd()}/scripts/npm-package-observation.js`);
  const {createPackageDiagnosticSink} = await import(
    `${process.cwd()}/scripts/npm-package-diagnostic-sink.js`);
  const diagnosticDirectory = join(root, 'diagnostic');
  const diskSink = createPackageDiagnosticSink(diagnosticDirectory);
  const observer = (record) => {
    assert.ok(Object.isFrozen(record));
    records.push(record);
    diskSink(record);
  };
  observer.setupOverheadMs = diskSink.setupOverheadMs;
  observer.snapshot = diskSink.snapshot;
  const execute = async (options) => {
    try {
      return await buildAndVerifyNpmPackage(options);
    } catch (error) {
      return {error: {name: error.name, code: error.code, message: error.message,
        sameCleanupError: error === cleanupError}};
    }
  };
  try {
    const baseline = await execute({
      gitHead, outputDirectory: join(root, 'output-baseline'),
    });
    const baselineCalls = calls.splice(0);
    const observed = await execute({
      gitHead, outputDirectory: join(root, 'output-observed'),
      observer,
    });
    const status = finishPackageObservation(observer);
    const artifacts = Object.fromEntries(fs.readdirSync(diagnosticDirectory).map((name) =>
      [name, fs.readFileSync(join(diagnosticDirectory, name), 'utf8')]));
    for (const path of temporaryRoots) {
      assert.equal(fs.existsSync(path), false, 'original owner cleanup completed');
    }
    process.stdout.write(JSON.stringify({
      baseline: normalize(baseline), observed: normalize(observed),
      baselineCalls: normalize(baselineCalls), calls: normalize(calls), records, status, artifacts,
    }));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
    for (const path of temporaryRoots) fs.rmSync(path, {recursive: true, force: true});
  }
}

function runPackageFixture(configuration = {}) {
  const child = spawnSync(process.execPath, [
    '--input-type=module', '--eval', `await (${packageFixture.toString()})(${JSON.stringify(configuration)});`,
  ], {cwd: ROOT, encoding: 'utf8', timeout: FIXTURE_TIMEOUT_MS});
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

function assertOriginalCommands(calls, packed) {
  const [preliminary, extraction, finalPack, install, imported, version, admin,
    dryRun, init, generate, build] = calls;
  const preliminaryDirectory = preliminary.args[4];
  const stagingDirectory = extraction.args[3];
  const consumer = install.options.cwd;
  const installRoot = dirname(consumer);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  assert.deepEqual(calls.map(({command}) => basename(command)),
    [npm, 'tar', npm, npm, basename(process.execPath), 'lagrange', 'lagrange-admin',
      'lagrange', 'lagrange', 'lagrange', 'lagrange']);
  assert.deepEqual(preliminary.args,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', preliminaryDirectory]);
  assert.deepEqual(extraction.args,
    ['-xzf', join(preliminaryDirectory, 'candidate.tgz'), '-C', stagingDirectory]);
  assert.deepEqual(finalPack.args,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', dirname(packed.tarballPath)]);
  assert.equal(finalPack.options.cwd, join(stagingDirectory, 'package'));
  assert.deepEqual(install.args, ['install', '--no-audit', '--no-fund', '--package-lock=false',
    '--cache', join(installRoot, 'npm-cache'), packed.tarballPath]);
  const originalImportScript = [
    'import {realpathSync} from \'node:fs\';',
    'import {sep} from \'node:path\';',
    'import {fileURLToPath, pathToFileURL} from \'node:url\';',
    'const root = realpathSync(\'node_modules/lagrange-server\');',
    'const resolved = realpathSync(fileURLToPath(import.meta.resolve(\'lagrange-server\')));',
    'if (resolved !== root && !resolved.startsWith(root + sep)) process.exit(10);',
    'const api = await import(\'lagrange-server\');',
    `if (api.VERSION !== '${packed.version}') process.exit(11);`,
    'const serviceUrl = pathToFileURL(root + \'/src/admin/admin-test-run-service.js\');',
    'const {AdminTestRunService} = await import(serviceUrl);',
    'const service = new AdminTestRunService();',
    'if (!(await service.readDashboardPage()).includes(\'<!doctype html>\')) process.exit(12);',
    'if (!(await service.readPlaybackViewer()).includes(\'<!doctype html>\')) process.exit(13);',
  ].join(' ');
  assert.deepEqual(imported.args, ['--input-type=module', '--eval', originalImportScript]);
  assert.deepEqual(version.args, ['--version']);
  assert.deepEqual(admin.args, ['--version']);
  assert.deepEqual(dryRun.args, ['--dry-run', '--data-dir', join(installRoot, 'data')]);
  for (const [call, subcommand] of [[init, 'init'], [generate, 'generate'], [build, 'build']]) {
    assert.deepEqual(call.args, ['service', subcommand, join(installRoot, 'service-smoke')]);
  }
  for (const call of [imported, version, admin, dryRun, init, generate, build]) {
    assert.equal(call.options.cwd, consumer);
  }
  assert.equal(preliminary.options.cwd, ROOT.replace(/\/$/u, ''));
  assert.equal(extraction.options.cwd, preliminary.options.cwd);
}

describe('package observation on the real packaging boundary', () => {
  it('retains the existing commands and reports enclosing stages and raw outcomes', () => {
    const {baseline, observed, baselineCalls, calls, records} = runPackageFixture();
    assert.deepEqual(observed, baseline);
    assert.deepEqual(calls, baselineCalls);
    assert.equal(calls.length, COMMAND_COUNT);
    assertOriginalCommands(calls, observed);
    for (const {options} of calls) {
      assert.equal(options.timeout, 120000);
      assert.equal(options.maxBuffer, 16 * 1024 * 1024);
      assert.equal(options.encoding, 'utf8');
      assert.equal(options.env, 'process.env');
    }
    assert.ok(records.some(({stage, event}) => stage === 'build-package' && event === 'end'),
      'actual build path must emit a completed enclosing observation');
    assert.ok(records.some(({stage, event}) => stage === 'verify-installed' && event === 'end'),
      'actual installed verification must emit a completed enclosing observation');
    const commands = records.filter(({kind, event}) => kind === 'command' && event === 'end');
    assert.equal(commands.length, COMMAND_COUNT);
    for (const record of commands) {
      assert.equal(record.status, 0);
      assert.equal(record.signal, null);
      assert.equal(record.errorCode, null);
      assert.equal(record.outcome, 'success');
    }
  });

  it('distinguishes raw timeout/signal from mapped install error and snapshots before cleanup', () => {
    const {baseline, observed, baselineCalls, calls, records, artifacts, status} =
      runPackageFixture({failure: 'install-timeout'});
    assert.deepEqual(observed, baseline);
    assert.deepEqual(calls, baselineCalls);
    assert.equal(observed.error.code, 'INSTALL_FAILED');
    const raw = records.find((record) => record.kind === 'command' && record.status === null);
    assert.equal(raw.signal, 'SIGTERM');
    assert.equal(raw.errorCode, 'ETIMEDOUT');
    assert.equal(raw.outcome, 'error');
    const mapped = records.find((record) => record.stage === 'install' && record.event === 'end');
    assert.equal(mapped.errorCode, 'INSTALL_FAILED');
    assert.ok(records.indexOf(raw) < records.indexOf(mapped));
    assert.equal(JSON.parse(artifacts['installed-package.json']).name, 'lagrange-server');
    assert.equal(JSON.parse(artifacts['installed-lock.json']).lockfileVersion, 3);
    assert.equal(status.complete, true);
    assert.equal(validatePackageObservation(artifacts['trace.ndjson']).complete, true);
  });

  it('keeps parse and assertion failures distinct from successful raw commands', () => {
    for (const failure of ['malformed-pack', 'bin-version']) {
      const {baseline, observed, baselineCalls, calls, records} = runPackageFixture({failure});
      assert.deepEqual(observed, baseline);
      assert.deepEqual(calls, baselineCalls);
      assert.equal(observed.error.code, failure === 'malformed-pack' ? 'PACK_FAILED' : 'BIN_FAILED');
      const raw = records.filter((record) => record.kind === 'command' && record.event === 'end');
      assert.ok(raw.length > 0);
      assert.ok(raw.every((record) => record.status === 0 && record.outcome === 'success'));
      assert.ok(records.some((record) => record.event === 'end' && record.outcome === 'error' &&
        record.errorCode === observed.error.code));
    }
  });

  it('retains the original cleanup error object over the failed install body', () => {
    const {baseline, observed, records, artifacts} = runPackageFixture({
      failure: 'install-timeout', cleanupFailure: true,
    });
    assert.deepEqual(observed, baseline);
    assert.equal(observed.error.sameCleanupError, true);
    assert.equal(observed.error.code, 'CLEANUP');
    const end = records.find((record) => record.stage === 'installed-cleanup' &&
      record.event === 'end');
    assert.equal(end.outcome, 'error');
    assert.equal(end.errorCode, 'CLEANUP');
    assert.ok(artifacts['installed-package.json']);
    assert.ok(artifacts['installed-lock.json']);
  });
});
