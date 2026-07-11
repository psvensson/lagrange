/**
 * Guard tests for the formation + schema-provisioning probe wiring
 * (examples/service-data-affinity/run-formation-probe.js).
 *
 * The probe is the cheap single-axis live validation for formation
 * quests: cluster bring-up + CREATE TABLE ratings (partition
 * provisioning — where the ledger-interlock admission deferrals fire),
 * WITHOUT the 100k-row load and callback example that abort the full
 * demo on axes unrelated to the measured signal. These tests assert
 * exports and wiring only; no cluster is started.
 */

import {test} from '../../src/test-helpers/tap.js';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {
  queryRows,
  startCluster,
  startDockerCluster,
  startLocalCluster,
  waitForAdmin,
  waitForClusterSize,
} from '../../examples/service-data-affinity/cluster-harness.js';
import {
  DEFERRAL_COUNTER_STRINGS,
  PROBE_RESULT,
  countOccurrences,
  harvestDeferralCounters,
  parseProbeArgs,
  pollRatingsPartitionsReady,
  resolveProbeResult,
  runFormationProbe,
  summarizeRatingsPartitions,
} from '../../examples/service-data-affinity/run-formation-probe.js';

const require = createRequire(import.meta.url);

const PROBE_PATH = 'examples/service-data-affinity/run-formation-probe.js';
const QUORUM_CONCENTRATED_REASON_CODE = 'operation_ledger_quorum_concentrated';
const QUORUM_CONCENTRATED_EMITTER_PATHS = [
  'src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js',
  'src/query/sql-query-engine-provisioning-admission-methods.js',
];

test('demo module exports the cluster-start helpers the probe reuses ' +
  '(and importing it starts nothing)', (t) => {
  const helpers = {
    queryRows,
    startCluster,
    startDockerCluster,
    startLocalCluster,
    waitForAdmin,
    waitForClusterSize,
  };
  for (const [name, helper] of Object.entries(helpers)) {
    t.type(helper, 'function', `${name} is exported as a function`);
  }
  t.end();
});

test('probe arg parsing matches the demo mode selection (--local, ' +
  'plus the --mode local|docker alias)', (t) => {
  t.same(parseProbeArgs([]), {local: false, nodeCount: null},
    'default is docker (same as the demo)');
  t.equal(parseProbeArgs(['--local']).local, true, '--local (demo flag)');
  t.equal(parseProbeArgs(['--mode', 'local']).local, true, '--mode local');
  t.equal(parseProbeArgs(['--mode', 'docker']).local, false, '--mode docker');
  t.equal(parseProbeArgs(['--nodes', '3']).nodeCount, 3, '--nodes N');
  t.end();
});

test('harvested counter strings are the REAL emitted source strings ' +
  '(drift guard against the emitting modules)', async (t) => {
  const {PARTITION_SERVICE_SHARED} =
    await import('../../src/partition/partition-service-shared.js');
  const {OPERATION_WORKFLOW_OWNER_SHARED} =
    await import('../../src/rebalancer/operation-workflow-owner-shared.js');

  t.equal(
    DEFERRAL_COUNTER_STRINGS.would_exceed_target_replica_count,
    PARTITION_SERVICE_SHARED.PARTITION_SERVICE_LITERAL
      .WOULD_EXCEED_TARGET_REPLICA_COUNT,
    'would_exceed_target_replica_count matches partition-service-shared',
  );
  t.equal(
    DEFERRAL_COUNTER_STRINGS.would_drop_voter_ready_below_minimum,
    OPERATION_WORKFLOW_OWNER_SHARED.OPERATION_WORKFLOW_OWNER_LITERAL
      .WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2,
    'would-drop-voter-ready matches operation-workflow-owner-shared',
  );
  t.equal(
    DEFERRAL_COUNTER_STRINGS.operation_ledger_quorum_concentrated,
    QUORUM_CONCENTRATED_REASON_CODE,
  );
  for (const sourcePath of QUORUM_CONCENTRATED_EMITTER_PATHS) {
    const source = await readFile(sourcePath, 'utf8');
    t.ok(
      source.includes(`'${QUORUM_CONCENTRATED_REASON_CODE}'`),
      `${sourcePath} still emits the quorum-concentrated reason code`,
    );
  }
  t.end();
});

test('counter harvest counts every counter per node via the cluster ' +
  'handle log accessor', async (t) => {
  const quorum = DEFERRAL_COUNTER_STRINGS.operation_ledger_quorum_concentrated;
  const wouldDrop =
    DEFERRAL_COUNTER_STRINGS.would_drop_voter_ready_below_minimum;
  const handle = {
    getNodeLogs: async () => [
      {nodeId: 'node-0', text: `x ${quorum} y ${quorum} z ${wouldDrop}`},
      {nodeId: 'node-1', text: 'no signals here'},
    ],
  };
  const harvest = await harvestDeferralCounters(handle);
  t.equal(harvest.available, true);
  t.equal(harvest.error, null);
  const counters = harvest.counters;
  t.equal(counters.operation_ledger_quorum_concentrated.total, 2);
  t.same(counters.operation_ledger_quorum_concentrated.perNode,
    {'node-0': 2, 'node-1': 0});
  t.equal(counters.would_drop_voter_ready_below_minimum.total, 1);
  t.equal(counters.would_exceed_target_replica_count.total, 0);

  const noAccessor = await harvestDeferralCounters({mode: 'external'});
  t.equal(noAccessor.available, false,
    'a mode without log access reports unavailable, never hard zeros');
  t.equal(noAccessor.counters, null);
  t.match(noAccessor.error, /external/);

  const failing = await harvestDeferralCounters({
    getNodeLogs: async () => {
      throw new Error('docker logs unreachable');
    },
  });
  t.equal(failing.available, false,
    'a harvest failure degrades to unavailable instead of aborting the run');
  t.match(failing.error, /docker logs unreachable/);

  const partial = await harvestDeferralCounters({
    getNodeLogs: async () => [
      {nodeId: 'node-0', text: quorum},
      {nodeId: 'node-1', text: '', readError: 'ENOENT node-1.log'},
    ],
  });
  t.equal(partial.available, true);
  t.match(partial.error, /node-1: ENOENT/,
    'per-node read errors are surfaced, not silently counted as zero');
  t.equal(partial.counters.operation_ledger_quorum_concentrated.total, 1);

  t.equal(countOccurrences('aXbXc', 'X'), 2);
  t.end();
});

test('partition readiness summary: only tbl- partitions count, and ' +
  'NORMAL-with-leader is READY', (t) => {
  const rows = [
    {partition_id: 'replica_operations-p0', leader_node_id: 'n1',
      state: 'NORMAL'},
    {partition_id: 'tbl-ratings-p0', leader_node_id: 'n1', state: 'NORMAL'},
    {partition_id: 'tbl-ratings-p1', leader_node_id: null, state: 'NORMAL'},
    {partition_id: 'tbl-ratings-p2', leader_node_id: 'n2',
      state: 'SPLITTING'},
  ];
  const summary = summarizeRatingsPartitions(rows);
  t.equal(summary.total, 3, 'system partitions are excluded');
  t.equal(summary.ready, 1);
  t.same(summary.pending.map((p) => p.partitionId),
    ['tbl-ratings-p1', 'tbl-ratings-p2'],
    'leaderless and non-NORMAL partitions are pending');
  t.type(pollRatingsPartitionsReady, 'function');
  t.type(runFormationProbe, 'function');
  t.same(Object.keys(PROBE_RESULT).sort(),
    ['CREATE_TABLE_FAILED', 'READY', 'TIMEOUT']);
  t.end();
});

test('probe result folding: readiness wins over a client-side CREATE ' +
  'timeout (IF NOT EXISTS may land server-side)', (t) => {
  t.equal(resolveProbeResult({ok: false}, {ready: true}),
    PROBE_RESULT.READY,
    'partitions READY after a create timeout is still READY');
  t.equal(resolveProbeResult({ok: true}, {ready: true}),
    PROBE_RESULT.READY);
  t.equal(resolveProbeResult({ok: true}, {ready: false}),
    PROBE_RESULT.TIMEOUT);
  t.equal(resolveProbeResult({ok: false}, {ready: false}),
    PROBE_RESULT.CREATE_TABLE_FAILED);
  t.end();
});

test('probe stays single-axis: no ratings load, no callback example, ' +
  'and the npm script is wired', async (t) => {
  const probeSource = await readFile(PROBE_PATH, 'utf8');
  t.notMatch(probeSource, /lagrange-loader/,
    'the 100k-row loader (admin-timeout abort axis) is not imported');
  t.notMatch(probeSource, /runExamplesCatalog|build-upload-run/,
    'the callback example (second abort axis) is not imported');
  t.match(probeSource, /CREATE_RATINGS_SQL/,
    'the demo CREATE TABLE (provisioning trigger) IS issued');
  t.match(probeSource, /formation-probe-runs\.ndjson/,
    'runs are archived to the ndjson trend corpus');

  const packageJson = require('../../package.json');
  t.equal(packageJson.scripts['demo:formation-probe'],
    `node ${PROBE_PATH}`,
    'npm run demo:formation-probe points at the probe');
  t.end();
});
