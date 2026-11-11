// The 2026-11-11 latch, from the production entry point: three OS processes,
// each entered through createEmbeddedLagrange, no HTTP readiness probe and no
// join request after formation.
//
// Before the repair the seed's lifecycle dependency
// priority_control_plane_recovery was written only while a join request or an
// HTTP probe was being answered. The last such request in an embedded
// formation is the second joiner's bootstrap, which arrives while priority
// recovery is pending, so the seed stayed DEGRADED
// [PRIORITY_CONTROL_PLANE_RECOVERY_PENDING] for ever, its rebalancer's
// traffic-readiness gate read that for ever, and no default system partition
// ever left the seed (0 of 39 in 18 recorded runs).
//
// Paired witness, one formation:
//   refused  - the seed projects the pending recovery (not ready);
//   resumed  - with no request of any kind, the seed's lifecycle returns to
//              traffic-ready when recovery completes, every node ends
//              traffic-ready, and default system partitions are planned and
//              reach three distinct voting nodes.
// The full spread of every system partition is measured inside the suite
// bound and reported; the lab scenario owns it as a requirement (predicate
// test/distributed/harness/system-partition-distinct-node-spread-predicate.js).
import {cpSync, mkdirSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {classifySystemPartition} from
  '../../src/bootstrap/system-partition-classification.js';
import {LIFECYCLE_REASON} from
  '../../src/bootstrap/lifecycle-controller-constants.js';
import {ENTRYPOINT_LOG_MSG} from '../../src/constants/entrypoint.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {
  evaluateSystemPartitionDistinctNodeSpread,
} from '../distributed/harness/system-partition-distinct-node-spread-predicate.js';
import {
  createEmbeddedCluster,
  fulfilledRows,
} from './helpers/embedded-cluster-harness.js';

const NODE_COUNT = 3;
const APPLICATION_ID = 'system-partition-spread-without-probe';
const RECORDER = new URL('./helpers/record-readiness-request-preload.js',
  import.meta.url);
const SUITE_BOUND_MS = 900_000;
// After formation: priority recovery completes (~60 s recorded), the
// background priority-spread release window (70 s, unchanged) passes, and
// the gate's own re-check (capped at 120 s, unchanged) reads the lifecycle.
const SEED_TRAFFIC_READY_BOUND_MS = 240_000;
const NODE_TRAFFIC_READY_BOUND_MS = 60_000;
const FIRST_DEFAULT_SPREAD_BOUND_MS = 420_000;
const FULL_SPREAD_MEASUREMENT_BOUND_MS = 180_000;
const POLL_MS = 2_000;
const PENDING = LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING;

// The lifecycle transitions a node logged, oldest first.
function readLifecycleTransitions(cluster, node) {
  return cluster.nodeLogLines(node, ENTRYPOINT_LOG_MSG.READINESS_TRANSITION)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry !== null &&
      entry.msg === ENTRYPOINT_LOG_MSG.READINESS_TRANSITION)
    .map((entry) => ({
      atMs: entry.timestamp,
      ready: entry.ready === true,
      state: entry.state,
      reasons: Array.isArray(entry.reasons) ? entry.reasons : [],
    }));
}

function readRecordedRequests(evidenceDir, node) {
  return JSON.parse(readFileSync(
    join(evidenceDir, `${node.nodeId}.json`), 'utf8'));
}

async function readAuthority(seed, session) {
  const read = async (sql) => {
    try {
      return {rows: fulfilledRows(await seed.query(session, sql)),
        complete: true};
    } catch (error) {
      return {error: error.message};
    }
  };
  const [services, partitions, controlPlanePublications] = await Promise.all([
    read('SELECT * FROM services'),
    read('SELECT * FROM partitions'),
    read('SELECT * FROM control_plane_publications'),
  ]);
  return {services, partitions, controlPlanePublications};
}

// The partitions the gate holds until the node is TRAFFIC_READY: neither a
// priority control-plane partition nor the formation liveness dependency.
function isDefaultSystemPartition(partitionId) {
  const classification = classifySystemPartition({partitionId});
  return classification.priorityControlPlane !== true &&
    classification.formationLivenessDependency !== true;
}

function spreadDefaultPartitionIds(spread) {
  return (spread.detail.placements || [])
    .filter((placement) => isDefaultSystemPartition(placement.partitionId) &&
      placement.distinctNodeCount >= NODE_COUNT)
    .map((placement) => placement.partitionId);
}

// The node logs and the recorder evidence, kept outside the harness's own
// temporary tree (which its teardown removes) so a result can be read back.
function retainEvidence(t, cluster, evidenceDir) {
  try {
    const retained = mkdtempSync(join(tmpdir(), 'lagrange-latch-proof-'));
    for (const node of cluster.nodes) {
      cpSync(node.logPath, join(retained, `${node.role}-${node.nodeId}.log`));
    }
    cpSync(evidenceDir, join(retained, 'recorder'), {recursive: true});
    t.comment(`formation evidence retained at ${retained}`);
  } catch (error) {
    t.fail(`formation evidence retention failed: ${error.message}`);
  }
}

async function pollUntil(t, boundMs, read, satisfied) {
  const deadline = Date.now() + scaleByMachineFactor(boundMs);
  let last = await read();
  while (!satisfied(last) && Date.now() < deadline) {
    await managedSleep(t, POLL_MS);
    last = await read();
  }
  return last;
}

test('a formed three-node cluster reaches traffic-ready on every node and ' +
  'spreads default system partitions with no external probe', {
  timeout: SUITE_BOUND_MS,
}, async (t) => {
  const cluster = createEmbeddedCluster(t);
  const evidenceDir = join(cluster.rootDir, 'readiness-request-evidence');
  mkdirSync(evidenceDir);
  try {
    const formation = await cluster.formCluster(NODE_COUNT, {env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${RECORDER.href}`,
      LAGRANGE_READINESS_REQUEST_EVIDENCE_DIR: evidenceDir,
      LOG_LEVEL: 'info',
    }});
    const formedAtMs = Date.now();
    t.comment(`formation: ${JSON.stringify(formation)}`);
    const [seed] = cluster.nodes;
    const session = await seed.openApplicationDatabase(APPLICATION_ID);

    // Refused: the pending recovery was projected by the seed's lifecycle.
    // Resumed: the lifecycle is traffic-ready again, and stays the last word.
    const seedTransitions = await pollUntil(t, SEED_TRAFFIC_READY_BOUND_MS,
      async () => readLifecycleTransitions(cluster, seed),
      (transitions) => {
        const pendingAt = transitions.findIndex((transition) =>
          !transition.ready && transition.reasons.includes(PENDING));
        return pendingAt >= 0 && transitions.at(-1).ready === true &&
          transitions.length - 1 > pendingAt;
      });
    t.comment(`seed lifecycle: ${JSON.stringify(seedTransitions.map(
      (transition) => [transition.atMs - formedAtMs, transition.state,
        transition.reasons]))}`);
    const pendingIndex = seedTransitions.findIndex((transition) =>
      !transition.ready && transition.reasons.includes(PENDING));
    t.ok(pendingIndex >= 0,
      'refused: the seed lifecycle projected the pending priority recovery');
    t.equal(seedTransitions.at(-1)?.ready, true,
      'resumed: the seed lifecycle returned to traffic-ready with no request');
    t.ok(seedTransitions.length - 1 > pendingIndex,
      'the traffic-ready transition follows the pending one');
    const seedResumed = pendingIndex >= 0 &&
      seedTransitions.at(-1)?.ready === true;

    // Default system partitions are planned and spread to three nodes. A
    // seed that never resumed keeps its gate closed: the placement is read
    // once, as the measurement of that, instead of waiting out the bounds.
    const spread = await pollUntil(t,
      seedResumed ? FIRST_DEFAULT_SPREAD_BOUND_MS : 0,
      async () => evaluateSystemPartitionDistinctNodeSpread({
        authority: await readAuthority(seed, session),
        requiredDistinctNodeCount: NODE_COUNT,
      }),
      (result) => spreadDefaultPartitionIds(result).length > 0);
    const spreadDefaults = spreadDefaultPartitionIds(spread);
    t.comment(`first default spread ${Date.now() - formedAtMs} ms after ` +
      `formation: ${JSON.stringify(spreadDefaults)}; concentration ` +
      JSON.stringify(spread.detail.partitionCountByDistinctNodeCount));
    t.ok(spreadDefaults.length > 0,
      'at least one default system partition has voters on three distinct ' +
        `nodes (unmet reasons: ${spread.reasonCodes.slice(0, 5).join(' ')})`);

    // Measured, not required here: the whole set inside the remaining bound.
    const full = await pollUntil(t,
      seedResumed ? FULL_SPREAD_MEASUREMENT_BOUND_MS : 0,
      async () => evaluateSystemPartitionDistinctNodeSpread({
        authority: await readAuthority(seed, session),
        requiredDistinctNodeCount: NODE_COUNT,
      }),
      (result) => result.met === true);
    t.comment(`system-partition spread ${Date.now() - formedAtMs} ms after ` +
      `formation: met=${full.met} concentration ` +
      `${JSON.stringify(full.detail.partitionCountByDistinctNodeCount)} ` +
      'default partitions on three nodes: ' +
      `${spreadDefaultPartitionIds(full).length}`);

    // Every node ends traffic-ready.
    for (const node of cluster.nodes) {
      const transitions = await pollUntil(t,
        seedResumed ? NODE_TRAFFIC_READY_BOUND_MS : 0,
        async () => readLifecycleTransitions(cluster, node),
        (entries) => entries.at(-1)?.ready === true);
      t.equal(transitions.at(-1)?.ready, true,
        `${node.role} ${node.nodeId} ends traffic-ready ` +
          `(last: ${JSON.stringify(transitions.at(-1))})`);
    }

    // Measured: which source event raised lifecycle transitions on each node
    // (a consumer's own read may observe a change before its event).
    for (const node of cluster.nodes) {
      const raised = cluster.nodeLogLines(node,
        'Lifecycle transition raised by a readiness source event');
      t.comment(`${node.role} transitions raised by source events: ` +
        `${raised.length} (recovery event: ${raised.filter((line) =>
          line.includes('priority_control_plane_recovery_event')).length}, ` +
        `stable-window deadline: ${raised.filter((line) =>
          line.includes('readiness_stable_window_deadline')).length}) of ` +
        `${readLifecycleTransitions(cluster, node).length} transitions`);
    }

    // No external poller: no node answered an HTTP readiness probe, and the
    // seed answered no join admission after the cluster had formed.
    for (const node of cluster.nodes) {
      const recorded = readRecordedRequests(evidenceDir, node);
      t.equal(recorded.installed, true, `recorder installed in ${node.nodeId}`);
      t.same(recorded.probes, [],
        `no HTTP readiness probe reached ${node.role} ${node.nodeId}`);
      t.same(recorded.joinAdmissionReads.filter((read) =>
        read.atMs > formedAtMs), [],
      `no join admission reached ${node.role} ${node.nodeId} after formation`);
    }
    const seedJoinReads = readRecordedRequests(evidenceDir, seed)
      .joinAdmissionReads;
    t.ok(seedJoinReads.length >= NODE_COUNT - 1,
      'the seed answered the joiners\' admission, the last request it saw');
    t.ok(seedTransitions.at(-1).atMs > seedJoinReads.at(-1).atMs,
      'the seed became traffic-ready after its last request');
  } finally {
    retainEvidence(t, cluster, evidenceDir);
  }
});
