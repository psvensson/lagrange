import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  DISTRIBUTED_EXECUTION_TARGET,
  DISTRIBUTED_MATRIX_PROFILE,
} from '../constants.js';
import {
  buildDistributedMatrixExecutionPlan,
  buildGcpTargetConfig,
  listDistributedMatrixEntries,
  normalizeProfile,
  normalizeTarget,
} from '../distributed-matrix-plan.js';

const RUN_ID = '20260924T151500Z';
const REPORT_ROOT = 'test-output/reports/distributed-matrix';
const EXPECTED_CANONICAL_COUNT = 24;
const EXPECTED_TOPOLOGY_ENTRIES = [
  'local-three-node.json|rolling-restart',
  'local.json|partition-kill-heal-under-load',
  'local.json|node-join-under-load',
  'local.json|seed-restart-under-load',
  'local-benchmark-7node.json|' +
    'seven-node-read-write-load-transaction-recovery',
  'local-three-node.json|write-ack-visibility',
  'local.json|slow-follower-under-load',
  'local-benchmark-7node.json|seven-node-load-during-partitioning',
];

function entryKey(entry) {
  return `${entry.config}|${entry.name}`;
}

test('distributed matrix canonical profile reuses all canonical entries', (t) => {
  const entries = listDistributedMatrixEntries(
    DISTRIBUTED_MATRIX_PROFILE.CANONICAL,
  );
  assert.equal(entries.length, EXPECTED_CANONICAL_COUNT);
  assert.equal(
    entryKey(entries[0]),
    'local-three-node.json|admin-query-smoke',
  );
  assert.equal(
    entryKey(entries[entries.length - 1]),
    'local-partition-merge.json|partition-merge-under-load',
  );
  t.end();
});

test('distributed matrix topology profile derives unique real scenarios', (t) => {
  const entries = listDistributedMatrixEntries(
    DISTRIBUTED_MATRIX_PROFILE.TOPOLOGY,
  );
  assert.deepEqual(entries.map(entryKey), EXPECTED_TOPOLOGY_ENTRIES);
  t.end();
});

test('distributed matrix plan changes target without changing scenarios', (t) => {
  const local = buildDistributedMatrixExecutionPlan({
    target: DISTRIBUTED_EXECUTION_TARGET.LOCAL,
    profile: DISTRIBUTED_MATRIX_PROFILE.TOPOLOGY,
    runId: RUN_ID,
    reportRoot: REPORT_ROOT,
  });
  const lab = buildDistributedMatrixExecutionPlan({
    target: DISTRIBUTED_EXECUTION_TARGET.LAB,
    profile: DISTRIBUTED_MATRIX_PROFILE.TOPOLOGY,
    runId: RUN_ID,
    reportRoot: REPORT_ROOT,
  });

  assert.deepEqual(
    local.map((entry) => [entry.config, entry.scenario]),
    lab.map((entry) => [entry.config, entry.scenario]),
  );
  assert.equal(local[0].target, DISTRIBUTED_EXECUTION_TARGET.LOCAL);
  assert.equal(lab[0].target, DISTRIBUTED_EXECUTION_TARGET.LAB);
  assert.equal(
    lab[0].outputPath,
    REPORT_ROOT + '/lab/topology/' + RUN_ID +
      '/01--local-three-node--rolling-restart.report.json',
  );
  t.end();
});

test('distributed matrix GCP target preserves scenario config semantics', (t) => {
  const base = {
    size: 3,
    docker: {
      socketPath: '/var/run/docker.sock',
    },
    image: 'distributed-db:test',
    timeouts: {
      convergence: 12345,
    },
  };
  const template = {
    docker: {},
    gcp: {
      project: 'example-project',
      zone: 'europe-north1-a',
      machineType: 'e2-standard-4',
      vmCount: 5,
    },
  };
  const configured = buildGcpTargetConfig(base, template);

  assert.equal(configured.size, base.size);
  assert.deepEqual(configured.timeouts, base.timeouts);
  assert.equal(configured.nodesPerHost, 1);
  assert.equal(configured.gcp.vmCount, base.size);
  assert.equal(configured.gcp.project, template.gcp.project);
  assert.equal(configured.docker.socketPath, undefined);
  t.end();
});

test('distributed matrix rejects unknown targets and profiles', (t) => {
  assert.throws(
    () => normalizeTarget('not-a-target'),
    /Unknown distributed matrix target/,
  );
  assert.throws(
    () => normalizeProfile('not-a-profile'),
    /Unknown distributed matrix profile/,
  );
  t.end();
});
