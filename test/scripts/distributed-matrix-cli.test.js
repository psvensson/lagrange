import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test} from 'node:test';

const MATRIX_SCRIPT = 'scripts/run-distributed-matrix.js';
const MATRIX_TARGET_FLAG = '--target';
const MATRIX_TARGET_LOCAL = 'local';
const MATRIX_PROFILE_FLAG = '--profile';
const MATRIX_PROFILE_TOPOLOGY = 'topology';
const MATRIX_DRY_RUN_FLAG = '--dry-run';
const MATRIX_RETIRED_SELECTOR_TEXT = ['--raft', 'provider'].join('-');
const MATRIX_EXPECTED_TOPOLOGY_COUNT = 8;
const MATRIX_UTF8 = 'utf8';

test('distributed matrix CLI dry-runs topology profile without raft selection',
  () => {
    const result = spawnSync(
      process.execPath,
      [
        MATRIX_SCRIPT,
        MATRIX_TARGET_FLAG,
        MATRIX_TARGET_LOCAL,
        MATRIX_PROFILE_FLAG,
        MATRIX_PROFILE_TOPOLOGY,
        MATRIX_DRY_RUN_FLAG,
      ],
      {encoding: MATRIX_UTF8},
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.includes(MATRIX_RETIRED_SELECTOR_TEXT), false);

    const planned = result.stdout
      .split('\n')
      .filter((line) => line.startsWith(process.execPath));
    assert.equal(planned.length, MATRIX_EXPECTED_TOPOLOGY_COUNT);
    assert.ok(
      result.stdout.includes(
        'local/topology rolling-restart (local-three-node.json)',
      ),
    );
    assert.ok(
      result.stdout.includes(
        'local/topology seven-node-load-during-partitioning ' +
        '(local-benchmark-7node.json)',
      ),
    );
  });

// The matrix's REFUSED branch, driven end to end: the matrix runs from a
// scratch cwd whose `test/distributed/run.js` is a stub runner that exits 3
// (REFUSED: not run) for one scenario, 1 (failed) for another when asked,
// and 0 otherwise. A refused scenario lands in the refused bucket, never in
// passed; the matrix exits 3 when only refusals, 1 when anything failed.
const MATRIX_REFUSED_SCENARIO = 'rolling-restart';
const MATRIX_FAILED_SCENARIO_ENV = 'MATRIX_STUB_FAILED_SCENARIO';
const MATRIX_FAILED_SCENARIO = 'seven-node-load-during-partitioning';
const MATRIX_EXIT_REFUSED = 3;
const MATRIX_EXIT_FAILED = 1;
const MATRIX_STUB_RUNNER = [
  'const at = process.argv.indexOf(\'--scenario\');',
  'const scenario = process.argv[at + 1];',
  `if (scenario === '${MATRIX_REFUSED_SCENARIO}') process.exit(3);`,
  `if (scenario === process.env.${MATRIX_FAILED_SCENARIO_ENV}) ` +
    'process.exit(1);',
  'process.exit(0);',
].join('\n') + '\n';

async function runMatrixWithStubRunner(extraEnvironment) {
  const scratch = await mkdtemp(join(tmpdir(), 'matrix-refused-'));
  try {
    await mkdir(join(scratch, 'test', 'distributed'), {recursive: true});
    await writeFile(join(scratch, 'test', 'distributed', 'run.js'),
      MATRIX_STUB_RUNNER);
    return spawnSync(process.execPath, [
      resolve(MATRIX_SCRIPT),
      MATRIX_TARGET_FLAG, MATRIX_TARGET_LOCAL,
      MATRIX_PROFILE_FLAG, MATRIX_PROFILE_TOPOLOGY,
      '--report-root', join(scratch, 'reports'),
    ], {
      cwd: scratch,
      encoding: MATRIX_UTF8,
      env: {...process.env, ...extraEnvironment},
    });
  } finally {
    await rm(scratch, {force: true, recursive: true});
  }
}

function refusedLineFollows(stdout, scenario) {
  const lines = stdout.split('\n');
  const at = lines.findIndex((line) => line.includes(` ${scenario} (`));
  return at >= 0 && lines[at + 1] === '  -> REFUSED (not run)';
}

test('distributed matrix: a refused scenario is bucketed REFUSED and the ' +
  'matrix exits 3', async () => {
  const result = await runMatrixWithStubRunner({});
  assert.equal(result.status, MATRIX_EXIT_REFUSED, result.stderr);
  assert.ok(refusedLineFollows(result.stdout, MATRIX_REFUSED_SCENARIO),
    result.stdout);
  assert.match(result.stdout, new RegExp(
    `Distributed matrix: ${MATRIX_EXPECTED_TOPOLOGY_COUNT - 1} passed, ` +
    '0 failed, 1 refused \\(not run\\), ' +
    `${MATRIX_EXPECTED_TOPOLOGY_COUNT} total`, 'u'));
});

test('distributed matrix: a refusal never masks a failure (exit 1)',
  async () => {
    const result = await runMatrixWithStubRunner(
      {[MATRIX_FAILED_SCENARIO_ENV]: MATRIX_FAILED_SCENARIO});
    assert.equal(result.status, MATRIX_EXIT_FAILED, result.stderr);
    assert.ok(refusedLineFollows(result.stdout, MATRIX_REFUSED_SCENARIO),
      result.stdout);
    assert.match(result.stdout, new RegExp(
      `Distributed matrix: ${MATRIX_EXPECTED_TOPOLOGY_COUNT - 2} passed, ` +
      '1 failed, 1 refused \\(not run\\)', 'u'));
  });
