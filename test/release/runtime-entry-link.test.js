/**
 * Runtime-entry link witness.
 *
 * Every published entry point must link and evaluate in a fresh Node
 * process. A named import of an export that no longer exists is a link-time
 * SyntaxError that no static gate reports; it surfaces only when a process
 * actually loads the entry. This witness loads each one:
 *
 * - the package library entries (`exports`, `main`) are imported - they are
 *   side-effect free, so the process must exit cleanly on its own;
 * - the executable entries (`bin`, and the container image's daemon entry
 *   named by the Dockerfile CMD) run with `--version`, which links and
 *   evaluates the whole entry graph and returns before any runtime starts.
 *
 * The entry lists are read from their authorities, so a new or renamed entry
 * is witnessed without editing this file.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UTF8 = 'utf8';
const VERSION_FLAG = '--version';
// Generous bound for one cold load of the full runtime graph on a slow host;
// a link failure exits immediately, so the bound only guards a hang.
const ENTRY_TIMEOUT_MS = 120000;
const DOCKERFILE = 'Dockerfile';
const DOCKERFILE_CMD_PATTERN = /^CMD\s+(\[.*\])\s*$/mu;
const SCRIPT_ENTRY_PATTERN = /\.(?:m?js)$/u;
const LINK_FAILURE_PATTERN =
  /SyntaxError|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED|does not provide an export named/u;

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), UTF8));
}

function exportTargets(exportsField) {
  if (typeof exportsField === 'string') return [exportsField];
  if (!exportsField || typeof exportsField !== 'object') return [];
  return Object.values(exportsField).flatMap((value) => exportTargets(value));
}

function libraryEntries(packageJson) {
  return [...new Set([
    ...exportTargets(packageJson.exports),
    ...(typeof packageJson.main === 'string' ? [packageJson.main] : []),
  ].filter((entry) => SCRIPT_ENTRY_PATTERN.test(entry))
    .map((entry) => path.normalize(entry)))].sort();
}

function binEntries(packageJson) {
  const bin = typeof packageJson.bin === 'string' ?
    {[packageJson.name]: packageJson.bin} :
    packageJson.bin || {};
  return [...new Set(Object.values(bin).map((entry) => path.normalize(entry)))]
    .sort();
}

function imageDaemonEntries() {
  const dockerfile = readFileSync(path.join(ROOT, DOCKERFILE), UTF8);
  const match = DOCKERFILE_CMD_PATTERN.exec(dockerfile);
  if (!match) return [];
  return JSON.parse(match[1])
    .filter((argument) => SCRIPT_ENTRY_PATTERN.test(argument))
    .map((entry) => path.normalize(entry));
}

function runEntry(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: UTF8,
    timeout: ENTRY_TIMEOUT_MS,
    env: {...process.env, NODE_OPTIONS: ''},
  });
  return {
    status: result.status,
    signal: result.signal,
    output: `${result.stdout || ''}${result.stderr || ''}`,
    error: result.error ? String(result.error) : null,
  };
}

function assertLinked(t, entry, run) {
  t.equal(run.error, null, `${entry}: process spawned and finished`);
  t.notMatch(run.output, LINK_FAILURE_PATTERN,
    `${entry}: links without a missing module or export`);
  t.equal(run.status, 0,
    `${entry}: exits 0 (signal=${run.signal})\n${run.output.slice(-2000)}`);
}

const packageJson = readJson('package.json');
const libraries = libraryEntries(packageJson);
const executables = [...new Set([...binEntries(packageJson),
  ...imageDaemonEntries()])].sort();

test('the entry authorities name entries that exist', async (t) => {
  t.ok(libraries.length > 0, 'package.json names a library entry');
  t.ok(executables.length > 0, 'package.json / Dockerfile name an executable');
  t.ok(imageDaemonEntries().length > 0,
    'the Dockerfile CMD names the daemon entry');
  for (const entry of [...libraries, ...executables]) {
    t.ok(existsSync(path.join(ROOT, entry)), `${entry} exists`);
  }
});

for (const entry of libraries) {
  test(`library entry ${entry} links in a fresh process`, async (t) => {
    const href = pathToFileURL(path.join(ROOT, entry)).href;
    const run = runEntry(['--input-type=module', '-e',
      `await import(${JSON.stringify(href)});`]);
    assertLinked(t, entry, run);
  });
}

for (const entry of executables) {
  test(`executable entry ${entry} links in a fresh process`, async (t) => {
    const run = runEntry([entry, VERSION_FLAG]);
    assertLinked(t, entry, run);
  });
}
