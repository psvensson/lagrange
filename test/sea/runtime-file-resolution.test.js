import fs from 'fs';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {test} from '../../src/test-helpers/tap.js';
import {
  resolveModuleDirectory,
  resolvePackagedRuntimeFile,
} from '../../src/sea/runtime-file-resolution.js';

// This file is an ES module: its stack frames name it by URL, which is the
// shape every source-run consumer of the resolver sees.
const THIS_MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

test('resolveModuleDirectory names an ES module caller\'s directory as a path',
  async (t) => {
    const moduleDir = resolveModuleDirectory(resolveModuleDirectory);
    t.equal(moduleDir, THIS_MODULE_DIRECTORY,
      'the calling module\'s directory is a filesystem path, not a file: URL');
    t.equal(
      resolvePackagedRuntimeFile({
        execDir: path.join(os.tmpdir(), 'ddb-runtime-path-missing-exec'),
        moduleDir,
        sourceFileName: path.basename(fileURLToPath(import.meta.url)),
        bundledFileName: 'no-such.bundle.cjs',
      }),
      fileURLToPath(import.meta.url),
      'so the source sibling it names exists and is found');
  });

test('resolvePackagedRuntimeFile prefers SEA executable sibling bundle', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ddb-runtime-path-'));
  const execDir = path.join(tempRoot, 'exec');
  const moduleDir = path.join(tempRoot, 'module');

  fs.mkdirSync(execDir, {recursive: true});
  fs.mkdirSync(moduleDir, {recursive: true});
  fs.writeFileSync(path.join(execDir, 'service-worker.bundle.cjs'), '// bundle');
  fs.writeFileSync(path.join(moduleDir, 'service-worker.js'), '// source');

  const resolved = resolvePackagedRuntimeFile({
    execDir,
    moduleDir,
    sourceFileName: 'service-worker.js',
    bundledFileName: 'service-worker.bundle.cjs',
  });

  t.equal(
    resolved,
    path.join(execDir, 'service-worker.bundle.cjs'),
    'should prefer executable-adjacent bundle',
  );

  fs.rmSync(tempRoot, {recursive: true, force: true});
});

test('resolvePackagedRuntimeFile falls back to source sibling when no bundle exists', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ddb-runtime-path-'));
  const moduleDir = path.join(tempRoot, 'module');

  fs.mkdirSync(moduleDir, {recursive: true});
  fs.writeFileSync(path.join(moduleDir, 'replica-worker.js'), '// source');

  const resolved = resolvePackagedRuntimeFile({
    execDir: path.join(tempRoot, 'missing-exec'),
    moduleDir,
    sourceFileName: 'replica-worker.js',
    bundledFileName: 'replica-worker.bundle.cjs',
  });

  t.equal(
    resolved,
    path.join(moduleDir, 'replica-worker.js'),
    'should fall back to source sibling',
  );

  fs.rmSync(tempRoot, {recursive: true, force: true});
});
