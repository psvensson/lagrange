/**
 * Guard test for the WASM-first `lagrange service init` scaffold
 * (service-init-wasm-first-scaffold).
 *
 * The default scaffold is a code-first WASM project that goes green
 * through the real compiler pipeline: its handler unit-tests on the
 * host with fake call/emit collaborators (no WASM), `generate` compiles
 * its lagrange.service.js into the generated entry and the deterministic
 * .lagrange/deployment records through the real normalizer/validators,
 * and `build` componentizes the entry against the real toolchain into a
 * loadable component. `--oci` preserves the legacy OCI-container
 * scaffold byte-for-byte, and `dev-install` is demoted to a low-level
 * compatibility note in help without behavior change.
 */
import {mkdir, mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';

import {
  createWasmServiceProject,
} from '../../src/cli/service-wasm-scaffold.js';
import {
  createServiceProject,
} from '../../src/cli/service-project-scaffold.js';
import {
  runServiceCommand,
} from '../../src/cli/service-command-router.js';
import {
  normalizeServiceSource,
} from '../../src/service/service-source-contract.js';
import {
  buildDeploymentRecords,
} from '../../src/service/service-deployment-record-generator.js';
import {
  emitServiceEntry,
} from '../../src/service/service-entry-generator.js';
import {
  componentizeService,
} from '../../src/service/service-component-build.js';

const TOOLCHAIN_TIMEOUT_MS = 300000;
const SUCCESS_EXIT_CODE = 0;
const PLACEHOLDER_ARTIFACT = Object.freeze({
  digest: `sha256:${'0'.repeat(64)}`,
  ref: 'placeholder.invalid/pending-build:0',
  sizeBytes: 0,
});

async function makeTempRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'lagrange-wasm-init-'));
  t.teardown(() => rm(root, {recursive: true, force: true}));
  return root;
}

async function listFiles(root, prefix = '') {
  const entries = await readdir(path.join(root, prefix), {
    withFileTypes: true,
  });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? listFiles(root, relative) : [relative];
  }));
  return nested.flat().sort();
}

test('the WASM scaffold vendors the authoring library and authors a ' +
  'one-route, one-operation service', async (t) => {
  const root = await makeTempRoot(t);
  const target = path.join(root, 'amounts-service');
  const result = createWasmServiceProject(target);
  assert.equal(result.name, 'amounts-service');

  const files = await listFiles(target);
  for (const expected of [
    'authoring/define-service.js',
    'authoring/distributed-operation.js',
    'authoring/request-handler.js',
    'authoring/sql-template.js',
    'lagrange.service.js',
    'package.json',
    'README.md',
    'src/handler.js',
    'test/handler.test.js',
  ]) {
    assert.ok(files.includes(expected), `missing ${expected}`);
  }

  // The vendored authoring library is byte-identical to the repo source
  // apart from the scaffold's @ts-nocheck exemption header (vendored
  // infrastructure is not the developer's checkJs surface).
  for (const module of [
    'define-service.js',
    'distributed-operation.js',
    'request-handler.js',
    'sql-template.js',
  ]) {
    const vendored = await readFile(
      path.join(target, 'authoring', module), 'utf8');
    const source = await readFile(
      new URL(`../../src/authoring/${module}`, import.meta.url), 'utf8');
    assert.equal(vendored, `// @ts-nocheck\n${source}`,
      `authoring/${module} drifted`);
  }

  // The service module declares exactly one route and one operation via
  // the vendored library (the real normalizer proves the shape).
  const normalized = await normalizeServiceSource(
    path.join(target, 'lagrange.service.js'));
  assert.equal(normalized.status, 'accepted',
    JSON.stringify(normalized.errors));
  assert.deepEqual(
    normalized.ir.handlers.map((handler) => handler.id), ['amountSummary']);
  assert.deepEqual(
    normalized.ir.operations.map((operation) => operation.id),
    ['summarizeAmounts']);
});

test('the scaffolded handler unit-tests green with fake collaborators ' +
  '(no WASM toolchain)', async (t) => {
  const root = await makeTempRoot(t);
  const target = path.join(root, 'amounts-service');
  createWasmServiceProject(target);
  const run = spawnSync(process.execPath, ['--test'], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(run.status, SUCCESS_EXIT_CODE,
    `${run.stdout}\n${run.stderr}`);
});

test('the scaffold goes green through generate and build against the ' +
  'real compiler toolchain',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const root = await makeTempRoot(t);
  const target = path.join(root, 'amounts-service');
  createWasmServiceProject(target);

  // generate: real normalizer + entry emitter + record generator.
  const normalized = await normalizeServiceSource(
    path.join(target, 'lagrange.service.js'));
  assert.equal(normalized.status, 'accepted');
  const entry = await emitServiceEntry({
    moduleSpecifier: './lagrange.service.js',
    outputPath: path.join(target, 'generated-entry.js'),
  });
  assert.ok(entry.bytes > 0);
  const records = buildDeploymentRecords({
    artifact: {...PLACEHOLDER_ARTIFACT},
    ir: normalized.ir,
  });
  assert.equal(records.status, 'accepted', JSON.stringify(records.errors));
  const bindingNames = records.records.bindings
    .map((binding) => binding.name).sort();
  assert.deepEqual(bindingNames, [
    'amounts-service--call--summarize-amounts',
    'amounts-service--request--amount-summary',
  ]);

  // build: real ComponentizeJS over the generated entry (the vendored
  // authoring graph resolves inside the wizer sandbox).
  const {component} = await componentizeService({
    sourcePath: entry.outputPath,
  });
  assert.ok(component.byteLength > 0,
    'componentize must produce a non-empty component');
});

test('--oci preserves the legacy scaffold byte-for-byte and the router ' +
  'routes the flag', async (t) => {
  const root = await makeTempRoot(t);
  // Both projects use the SAME service name under different roots so the
  // name embedded in the generated files is identical and the byte
  // comparison isolates the scaffold path (not the name).
  const directRoot = path.join(root, 'direct');
  const flagRoot = path.join(root, 'flag');
  const wasmRoot = path.join(root, 'wasm');
  const ociDirect = path.join(directRoot, 'oci-service');
  const ociFlag = path.join(flagRoot, 'oci-service');
  const wasmDir = path.join(wasmRoot, 'wasm-service');

  // The scaffold is fail-closed on a missing parent (no silent mkdir -p),
  // so create the intermediate roots first.
  await mkdir(directRoot);
  await mkdir(flagRoot);
  await mkdir(wasmRoot);

  // Direct OCI scaffold output (unchanged owner).
  createServiceProject(ociDirect);

  // The router's --oci flag must produce the SAME bytes as the direct
  // legacy scaffold and must NOT create a WASM project.
  const flagExit = runInitThroughRouter(['init', ociFlag, '--oci']);
  assert.equal(flagExit.exitCode, SUCCESS_EXIT_CODE, flagExit.stderr);
  assert.match(flagExit.stdout, /OCI-container service project/);

  const directFiles = await listFiles(ociDirect);
  const flagFiles = await listFiles(ociFlag);
  assert.deepEqual(flagFiles, directFiles);
  for (const relative of directFiles) {
    const directBytes = await readFile(path.join(ociDirect, relative));
    const flagBytes = await readFile(path.join(ociFlag, relative));
    assert.deepEqual(flagBytes, directBytes, `${relative} drifted`);
  }
  // The OCI path carries no WASM-first artifacts.
  assert.ok(!flagFiles.includes('lagrange.service.js'));
  assert.ok(!flagFiles.some((file) => file.startsWith('authoring/')));

  // The default (no flag) routes to the WASM scaffold.
  const wasmExit = runInitThroughRouter(['init', wasmDir]);
  assert.equal(wasmExit.exitCode, SUCCESS_EXIT_CODE, wasmExit.stderr);
  assert.match(wasmExit.stdout, /WASM service project/);
  assert.ok((await listFiles(wasmDir)).includes('lagrange.service.js'));
});

test('help demotes dev-install to a low-level compatibility note and ' +
  'documents --oci', async () => {
  const help = captureHelp();
  assert.match(help, /init <directory> \[--oci\]/);
  assert.match(help, /code-first WASM service project/);
  assert.match(help, /--oci for the legacy OCI-container/);
  assert.match(help, /Low-level compatibility:/);
  assert.match(help, /dev-install.*low-level/s);
});

function runInitThroughRouter(args) {
  return captureRouterIo(() => runServiceCommand(args));
}

function captureHelp() {
  return captureRouterIo(() => runServiceCommand(['--help'])).stdout;
}

function captureRouterIo(fn) {
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
    const exitCode = fn();
    return {exitCode, stdout, stderr};
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}
