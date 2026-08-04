import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'espree';

import {test} from '../../src/test-helpers/tap.js';
import {runEntrypoint} from '../../src/test-helpers/run-entrypoint.js';
import {
  EXTERNAL_SERVICE_MANIFEST_ERROR_CODE,
  validateExternalServiceManifest,
} from '../../src/service/external-service-manifest.js';
import {
  SERVICE_PROJECT_SCAFFOLD_ERROR_CODE,
  createServiceProject,
} from '../../src/cli/service-project-scaffold.js';
import {runServiceCommand} from '../../src/cli/service-command-router.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRYPOINT = path.join(PROJECT_ROOT, 'src/sea-entry.js');
const PACKAGE_PATH = path.join(PROJECT_ROOT, 'package.json');
const PACKAGE_LOCK_PATH = path.join(PROJECT_ROOT, 'package-lock.json');
const PROJECT_NAME = 'weather-service';
const VALID_DIGEST = `sha256:${'a'.repeat(64)}`;
const EXPECTED_PROJECT_FILES = Object.freeze([
  '.dockerignore',
  'Dockerfile',
  'README.md',
  'lagrange-service.template.json',
  'package.json',
  'src/server.js',
  'test/server.test.js',
]);
const FORBIDDEN_S5B_PATHS = Object.freeze([
  'blobs',
  'index.json',
  'lagrange-service.json',
  'oci-layout',
]);
const PROJECT_DIRECTORY_MODE = 0o755;
const PROJECT_FILE_MODE = 0o644;
const RESTRICTIVE_UMASK = 0o077;
const SERVICE_OWNER_IMPORTS = Object.freeze({
  'src/cli/service-command-router.js': [
    './service-project-scaffold.js',
    './service-wasm-scaffold.js',
  ],
  'src/cli/service-project-scaffold.js': [
    '../service/external-service-manifest.js',
    'node:fs',
    'node:path',
  ],
  'src/sea-entry.js': [
    './cli/service-command-router.js',
    './constants/entrypoint.js',
  ],
});

function makeTempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-service-init-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

function projectPath(root) {
  return path.join(root, PROJECT_NAME);
}

function listProjectFiles(root, prefix = '') {
  const entries = fs.readdirSync(path.join(root, prefix), {withFileTypes: true});
  return entries.flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? listProjectFiles(root, relative) : [relative];
  }).sort();
}

function projectSnapshot(root) {
  return Object.fromEntries(listProjectFiles(root).map((relative) => [
    relative,
    fs.readFileSync(path.join(root, relative), 'utf8'),
  ]));
}

function projectModeSnapshot(root) {
  const directories = ['.', 'src', 'test'];
  return Object.fromEntries([
    ...directories.map((relative) => [
      relative,
      fs.statSync(path.join(root, relative)).mode & 0o777,
    ]),
    ...listProjectFiles(root).map((relative) => [
      relative,
      fs.statSync(path.join(root, relative)).mode & 0o777,
    ]),
  ]);
}

function staticImports(relativePath) {
  const source = fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
  const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
  return ast.body
    .filter((node) => node.type === 'ImportDeclaration')
    .map((node) => node.source.value)
    .sort();
}

async function runServiceEntrypoint(args) {
  return runEntrypoint(ENTRYPOINT, {args, timeoutMs: 15000});
}

// This suite guards the OCI-container scaffold; since init's default is
// now the WASM-first project, every OCI assertion drives the legacy path
// explicitly through --oci.
async function initializeProject(target) {
  return runServiceEntrypoint(['service', 'init', target, '--oci']);
}

function runServiceRouter(args) {
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  let stdout = '';
  let stderr = '';
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  try {
    return {exitCode: runServiceCommand(args), stdout, stderr};
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

test('package entrypoint exposes service help without starting the server', async (t) => {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(PACKAGE_LOCK_PATH, 'utf8'));
  t.equal(packageJson.bin.lagrange, './src/sea-entry.js');
  t.equal(packageLock.packages[''].bin.lagrange, 'src/sea-entry.js');

  const result = await runServiceEntrypoint(['service', '--help']);
  t.equal(result.exitCode, 0);
  t.match(result.stdout, /lagrange service init <directory>/);
  t.notMatch(result.stdout, /Bootstrap API started/);
  t.equal(result.stderr, '');
});

test('init creates deterministic source and a truthful digest-less template', async (t) => {
  const firstRoot = makeTempRoot(t);
  const secondRoot = makeTempRoot(t);
  const restrictiveRoot = makeTempRoot(t);
  const firstTarget = projectPath(firstRoot);
  const secondTarget = projectPath(secondRoot);
  const restrictiveTarget = projectPath(restrictiveRoot);

  const [first, second] = await Promise.all([
    initializeProject(firstTarget),
    initializeProject(secondTarget),
  ]);
  t.equal(first.exitCode, 0, first.stderr);
  t.equal(second.exitCode, 0, second.stderr);
  t.same(listProjectFiles(firstTarget), EXPECTED_PROJECT_FILES);
  t.same(projectSnapshot(firstTarget), projectSnapshot(secondTarget));

  const originalUmask = process.umask(RESTRICTIVE_UMASK);
  try {
    createServiceProject(restrictiveTarget);
  } finally {
    process.umask(originalUmask);
  }
  t.same(projectSnapshot(firstTarget), projectSnapshot(restrictiveTarget));
  t.same(projectModeSnapshot(firstTarget), projectModeSnapshot(restrictiveTarget));
  const modes = projectModeSnapshot(restrictiveTarget);
  t.equal(modes['.'], PROJECT_DIRECTORY_MODE);
  t.equal(modes.src, PROJECT_DIRECTORY_MODE);
  t.equal(modes.test, PROJECT_DIRECTORY_MODE);
  for (const relative of EXPECTED_PROJECT_FILES) {
    t.equal(modes[relative], PROJECT_FILE_MODE, relative);
  }

  const manifestPath = path.join(firstTarget, 'lagrange-service.template.json');
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  t.equal(manifest.schema_version, 3);
  t.equal(manifest.name, PROJECT_NAME);
  t.equal(manifest.artifact.type, 'oci');
  t.equal(manifest.runtime.kind, 'oci_container');
  t.same(manifest.exports, [{
    name: 'serve',
    interface: 'request_v1',
  }]);
  t.equal(Object.hasOwn(manifest.artifact, 'digest'), false);
  t.notMatch(manifestText, /sha256:/);

  const rejected = validateExternalServiceManifest(manifest);
  t.equal(rejected.valid, false);
  t.same(rejected.errors.map(({code, path: errorPath}) => ({
    code,
    path: errorPath,
  })), [{
    code: EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.REQUIRED_FIELD,
    path: '/artifact/digest',
  }]);

  const finalManifest = structuredClone(manifest);
  finalManifest.artifact.digest = VALID_DIGEST;
  t.equal(validateExternalServiceManifest(finalManifest).valid, true);
  for (const forbidden of FORBIDDEN_S5B_PATHS) {
    t.equal(fs.existsSync(path.join(firstTarget, forbidden)), false, forbidden);
  }

  const generatedTests = spawnSync(process.execPath, ['--test'], {
    cwd: firstTarget,
    encoding: 'utf8',
  });
  t.equal(
    generatedTests.status,
    0,
    `${generatedTests.stdout}\n${generatedTests.stderr}`,
  );

  const serverModule = await import(
    `${pathToFileURL(path.join(firstTarget, 'src/server.js')).href}?probe=health`
  );
  const server = serverModule.createServiceServer();
  t.teardown(() => server.close());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  t.equal(response.status, 200);
  t.same(await response.json(), {status: 'ready'});
});

test('init never clobbers an existing directory or symlink target', async (t) => {
  const root = makeTempRoot(t);
  const existingTarget = projectPath(root);
  const sentinelPath = path.join(existingTarget, 'keep.txt');
  fs.mkdirSync(existingTarget);
  fs.writeFileSync(sentinelPath, 'keep-me\n');

  const existingPromise = initializeProject(existingTarget);

  const victim = path.join(root, 'victim');
  const symlinkTarget = path.join(root, 'linked-service');
  const victimSentinel = path.join(victim, 'victim.txt');
  fs.mkdirSync(victim);
  fs.writeFileSync(victimSentinel, 'untouched\n');
  fs.symlinkSync(victim, symlinkTarget, 'dir');
  const linkedPromise = initializeProject(symlinkTarget);
  const [existing, linked] = await Promise.all([
    existingPromise,
    linkedPromise,
  ]);

  t.equal(existing.exitCode, 1);
  t.match(existing.stderr, /target_exists/);
  t.equal(fs.readFileSync(sentinelPath, 'utf8'), 'keep-me\n');
  t.same(listProjectFiles(existingTarget), ['keep.txt']);

  t.equal(linked.exitCode, 1);
  t.match(linked.stderr, /target_exists/);
  t.equal(fs.readFileSync(victimSentinel, 'utf8'), 'untouched\n');
  t.same(listProjectFiles(victim), ['victim.txt']);
});

test('service router rejects ambiguous commands and invalid project names', async (t) => {
  const root = makeTempRoot(t);
  const cases = [
    {args: ['service', 'init'], error: /usage/},
    {args: ['service', 'init', projectPath(root), 'extra'], error: /unknown_option/},
    {args: ['service', 'unknown'], error: /unknown_command/},
    {args: ['service', 'init', '--output'], error: /unknown_option/},
    {args: ['service', 'init', path.join(root, 'Bad_Name'), '--oci'], error: /invalid_name/},
  ];

  const results = cases.map((attack) => runServiceRouter(attack.args.slice(1)));
  for (const [index, attack] of cases.entries()) {
    const result = results[index];
    t.equal(result.exitCode, 2, attack.args.join(' '));
    t.match(result.stderr, attack.error);
  }
  t.same(fs.readdirSync(root), []);
});

test('init removes only its new target when a project write fails', (t) => {
  const root = makeTempRoot(t);
  const target = projectPath(root);
  const originalWriteFileSync = fs.writeFileSync;
  const injectedError = new Error('injected write failure');
  injectedError.code = 'EIO';
  let writes = 0;

  fs.writeFileSync = (...args) => {
    writes += 1;
    if (writes === 3) throw injectedError;
    return originalWriteFileSync(...args);
  };
  try {
    t.throws(
      () => createServiceProject(target),
      {code: SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.WRITE_FAILED},
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  t.equal(writes, 3);
  t.equal(fs.existsSync(target), false);
  t.same(fs.readdirSync(root), []);
  t.end();
});

test('service command owners retain the local-only import boundary', (t) => {
  for (const [relativePath, expectedImports] of Object.entries(SERVICE_OWNER_IMPORTS)) {
    t.same(staticImports(relativePath), [...expectedImports].sort(), relativePath);
  }
  t.end();
});
