import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {test} from 'node:test';

const MATRIX_SCRIPT = 'scripts/run-distributed-matrix.js';
const MATRIX_TARGET_FLAG = '--target';
const MATRIX_TARGET_LOCAL = 'local';
const MATRIX_PROFILE_FLAG = '--profile';
const MATRIX_PROFILE_TOPOLOGY = 'topology';
const MATRIX_DRY_RUN_FLAG = '--dry-run';
const MATRIX_RAFT_SELECTOR_TEXT = '--raft-provider';
const MATRIX_EXPECTED_TOPOLOGY_COUNT = 8;
const MATRIX_UTF8 = 'utf8';
const DISTRIBUTED_CONFIG_DIR = 'test/distributed/config';
const JSON_SUFFIX = '.json';
const RAFT_PROVIDER_FIELD = 'raftProvider';

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
    assert.equal(result.stdout.includes(MATRIX_RAFT_SELECTOR_TEXT), false);

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

test('distributed configs do not select a runtime raft provider', async () => {
  const files = (await readdir(DISTRIBUTED_CONFIG_DIR))
    .filter((name) => name.endsWith(JSON_SUFFIX));

  for (const name of files) {
    const config = JSON.parse(
      await readFile(join(DISTRIBUTED_CONFIG_DIR, name), MATRIX_UTF8),
    );
    assert.equal(
      Object.hasOwn(config, RAFT_PROVIDER_FIELD),
      false,
      `${name} must not select a consensus implementation`,
    );
  }
});
