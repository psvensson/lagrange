import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// The loader mutates process.env and resolves `.env` against the working
// directory, so every case runs in a child process with its own cwd — an
// in-process import would leak variables into sibling tests sharing this
// process.

const LOAD_ENV_URL = pathToFileURL(join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'src', 'boot', 'load-env.js',
)).href;

function runWithLoader({cwd, env, expression}) {
  return execFileSync(process.execPath, [
    '--input-type=module',
    '-e',
    `await import(${JSON.stringify(LOAD_ENV_URL)}); console.log(${expression});`,
  ], {cwd, env: {...env, PATH: process.env.PATH}, encoding: 'utf8'}).trim();
}

describe('boot/load-env', () => {
  it('fills unset variables from .env in the working directory', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'load-env-'));
    writeFileSync(join(cwd, '.env'), 'LOAD_ENV_TEST_VALUE=from-dotenv\n');
    const out = runWithLoader({
      cwd,
      env: {},
      expression: 'process.env.LOAD_ENV_TEST_VALUE',
    });
    assert.equal(out, 'from-dotenv');
  });

  it('never overrides a variable already set in the shell environment', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'load-env-'));
    writeFileSync(join(cwd, '.env'), 'LOAD_ENV_TEST_VALUE=from-dotenv\n');
    const out = runWithLoader({
      cwd,
      env: {LOAD_ENV_TEST_VALUE: 'from-shell'},
      expression: 'process.env.LOAD_ENV_TEST_VALUE',
    });
    assert.equal(out, 'from-shell');
  });

  it('is a no-op when the working directory has no .env', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'load-env-'));
    const out = runWithLoader({
      cwd,
      env: {},
      expression: 'typeof process.env.LOAD_ENV_TEST_VALUE',
    });
    assert.equal(out, 'undefined');
  });
});
