import {spawnSync} from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';

import {test} from '../../src/test-helpers/tap.js';

const PACKAGE_PATH = 'package.json';
const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml';
const TEST_CI_SCRIPT_PATH = 'scripts/run-test-ci.sh';
const COMMANDS = Object.freeze([
  'npm run test:static',
  'npm run model:contracts',
  'npm run test:all',
  'npm run test:chart:endpoint-sync',
]);
const MOVIELENS_DOWNLOAD_COMMAND =
  'node examples/service-data-affinity/download-movielens.js';
const FULL_RELEASE_GATE_COMMAND = 'run: npm run check:release';
const STUB_FAILURE_EXIT_CODE = 23;
const NPM_STUB = [
  '#!/usr/bin/env bash',
  'if [ "$*" = "$LAGRANGE_FAIL_COMMAND" ]; then',
  '  exit "$LAGRANGE_FAIL_EXIT_CODE"',
  'fi',
  'exit 0',
  '',
].join('\n');

function runWithFailingCommand(command) {
  const stubDirectory = mkdtempSync(join(tmpdir(), 'lagrange-ci-npm-stub-'));
  const stubPath = join(stubDirectory, 'npm');
  writeFileSync(stubPath, NPM_STUB);
  chmodSync(stubPath, 0o755);
  try {
    return spawnSync('bash', [TEST_CI_SCRIPT_PATH], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        LAGRANGE_FAIL_COMMAND: command.slice('npm '.length),
        LAGRANGE_FAIL_EXIT_CODE: String(STUB_FAILURE_EXIT_CODE),
        PATH: `${stubDirectory}${delimiter}${process.env.PATH}`,
      },
    });
  } finally {
    rmSync(stubDirectory, {recursive: true, force: true});
  }
}

test('complete CI has one serial owner and no alternate scheduling mode', (t) => {
  const scripts = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8')).scripts;
  const source = readFileSync(TEST_CI_SCRIPT_PATH, 'utf8');

  t.equal(scripts['test:ci'], `bash ${TEST_CI_SCRIPT_PATH}`);
  t.equal(scripts['test:sharded:serial'], undefined);
  t.equal(scripts['test:aggregate-sensitive-pregate'], undefined);
  for (let index = 0; index < COMMANDS.length; index += 1) {
    const command = COMMANDS[index];
    t.ok(source.includes(command));
    if (index > 0) {
      t.ok(source.indexOf(COMMANDS[index - 1]) < source.indexOf(command));
    }
  }
  t.notMatch(source, /analysis_pid|nice -n|CI_LEAN/u);
  t.notMatch(source, /&\s*$/mu);
  t.end();
});

test('complete CI fails closed at every owned phase', (t) => {
  for (const command of COMMANDS) {
    const result = runWithFailingCommand(command);
    t.equal(result.status, STUB_FAILURE_EXIT_CODE, command);
  }
  t.end();
});

test('all suite entry points use the classified execution owner', (t) => {
  const scripts = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8')).scripts;
  for (const scriptName of [
    'test:file',
    'test:fast',
    'test:safety-pregate',
    'test:unit',
    'test:all',
  ]) {
    t.match(scripts[scriptName], /run-classified-test-files\.js/u,
      scriptName);
  }
  t.notOk(Object.values(scripts).some((command) =>
    command.includes('run-sharded-lanes-concurrent.sh')));
  t.end();
});

test('tagged releases fetch MovieLens before the canonical full proof', (t) => {
  const workflow = readFileSync(RELEASE_WORKFLOW_PATH, 'utf8');

  t.ok(workflow.indexOf(MOVIELENS_DOWNLOAD_COMMAND) >= 0);
  t.ok(workflow.indexOf(MOVIELENS_DOWNLOAD_COMMAND) <
    workflow.indexOf(FULL_RELEASE_GATE_COMMAND));
  t.end();
});
