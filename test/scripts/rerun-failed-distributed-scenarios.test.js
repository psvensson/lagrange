import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from 'node:test';

const RERUN_SCRIPT = 'scripts/rerun-failed-distributed-scenarios.sh';
const DRY_RUN_FLAG = '--dry-run';
const REPORT_DIR_FLAG = '--report-dir';
const UTF8 = 'utf8';
const TEMP_PREFIX = 'lagrange-rerun-matrix-';
const REPORT_SUFFIX = '.report.json';
const LOCAL_TARGET = 'local';
const LAB_TARGET = 'lab';
const LOCAL_CONFIG = 'local.json';
const THREE_NODE_CONFIG = 'local-three-node.json';
const NODE_JOIN_SCENARIO = 'node-join-under-load';
const ROLLING_RESTART_SCENARIO = 'rolling-restart';
const SLOW_FOLLOWER_SCENARIO = 'slow-follower-under-load';
const OLDER_TIMESTAMP = '2026-09-24T10:00:00.000Z';
const NEWER_TIMESTAMP = '2026-09-24T11:00:00.000Z';
const EXPECTED_FOUND_LINE = 'Found 1 failed scenario(s) to re-run:';
const EXPECTED_NODE_JOIN_LINE =
  '  - node-join-under-load (local.json)';

function report({target, config, scenario, passed, timestamp}) {
  return JSON.stringify({
    timestamp,
    metadata: {
      executionTarget: target,
      matrixConfig: config,
    },
    scenarios: [
      {
        scenario,
        passed,
      },
    ],
  });
}

async function writeReport(root, directory, name, payload) {
  const path = join(root, directory);
  await mkdir(path, {recursive: true});
  await writeFile(
    join(path, name + REPORT_SUFFIX),
    payload,
    UTF8,
  );
}

test('failed scenario rerun reads nested local matrix reports and ignores lab',
  async () => {
    const root = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    try {
      await writeReport(
        root,
        'distributed-matrix/local/canonical/older',
        'rolling-failed',
        report({
          target: LOCAL_TARGET,
          config: THREE_NODE_CONFIG,
          scenario: ROLLING_RESTART_SCENARIO,
          passed: false,
          timestamp: OLDER_TIMESTAMP,
        }),
      );
      await writeReport(
        root,
        'distributed-matrix/local/canonical/newer',
        'rolling-passed',
        report({
          target: LOCAL_TARGET,
          config: THREE_NODE_CONFIG,
          scenario: ROLLING_RESTART_SCENARIO,
          passed: true,
          timestamp: NEWER_TIMESTAMP,
        }),
      );
      await writeReport(
        root,
        'distributed-matrix/local/topology/newer',
        'join-failed',
        report({
          target: LOCAL_TARGET,
          config: LOCAL_CONFIG,
          scenario: NODE_JOIN_SCENARIO,
          passed: false,
          timestamp: NEWER_TIMESTAMP,
        }),
      );
      await writeReport(
        root,
        'distributed-matrix/lab/topology/newer',
        'lab-failed',
        report({
          target: LAB_TARGET,
          config: LOCAL_CONFIG,
          scenario: SLOW_FOLLOWER_SCENARIO,
          passed: false,
          timestamp: NEWER_TIMESTAMP,
        }),
      );

      const result = spawnSync(
        'bash',
        [
          RERUN_SCRIPT,
          REPORT_DIR_FLAG,
          root,
          DRY_RUN_FLAG,
        ],
        {encoding: UTF8},
      );

      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(EXPECTED_FOUND_LINE));
      assert.ok(result.stdout.includes(EXPECTED_NODE_JOIN_LINE));
      assert.equal(
        result.stdout.includes(ROLLING_RESTART_SCENARIO),
        false,
      );
      assert.equal(
        result.stdout.includes(SLOW_FOLLOWER_SCENARIO),
        false,
      );
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });
