// @ts-nocheck
import fs from 'fs';
import os from 'os';
import path from 'path';
import {test} from '../../src/test-helpers/tap.js';
import {
  resolvePackagedRuntimeFile,
} from '../../src/sea/runtime-file-resolution.js';

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
