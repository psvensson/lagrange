/**
 * Guard tests for the runtime-service affinity policy lift
 * (quest: runtime-service-affinity-policy-lift, epic:
 * solve/epics/service-data-affinity-placement.md).
 *
 * Proves getRuntimeServicePolicy assembles the affinity placement
 * policy coherently with the service's routing policy:
 *  1. The pure weights derivation: reads credit every group holding an
 *     ACTIVE replica of the accessed partition, writes credit only the
 *     leader's group, weights normalize to best-group=1, stale rows are
 *     ignored, no data yields {}.
 *  2. The policy lift: read_locality=same_group + fresh attribution →
 *     policy.dataAffinity.groupWeights + preferDataAffinity=true;
 *     read_locality=any, or no attribution, → policy unchanged.
 *  3. End-to-end: engine records → publisher publishes (fake gateway
 *     lands the row in a mock cache) → policy owner aggregates →
 *     the REAL placement kernel scores DATA_AFFINITY dimensions.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  SERVICE_PARTITION_ACCESS_COL as SPA_COL,
  SERVICE_PARTITION_ACCESS_KIND,
  SERVICE_READ_LOCALITY,
  TABLES,
} from '../../src/constants/index.js';
import {
  buildServiceDataAffinityGroupWeights,
} from '../../src/rebalancer/service-data-affinity-weights.js';
import {
  applyUnifiedRebalancerPolicySchedulerMethods,
} from '../../src/rebalancer/unified-rebalancer-policy-scheduler-methods.js';
import {
  ServicePartitionAccessMetrics,
} from '../../src/query/service-partition-access-metrics.js';
import {
  ServicePartitionAccessPublisher,
} from '../../src/query/service-partition-access-publisher.js';
import {
  buildPlacementOwnerDecision,
} from '../../src/rebalancer/placement-owner-decision.js';
import {
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_SCORE_DIMENSION,
  PLACEMENT_OWNER_SCORE_PROFILE,
} from '../../src/rebalancer/placement-owner-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const SVC_ID = 'svc-lift';
const NODE_A = 'node-a'; // group G1
const NODE_B = 'node-b'; // group G2
const NOW_MS = 1000000;

// Minimal cluster cache: two nodes in two groups, one partition with
// replicas in both groups and its leader on node-b (G2).
function buildClusterCache({accessRows = [], readLocality} = {}) {
  const rows = {
    [TABLES.NODES]: [
      {node_id: NODE_A, latency_group_id: 'G1'},
      {node_id: NODE_B, latency_group_id: 'G2'},
    ],
    [TABLES.PARTITIONS]: [
      {partition_id: 'orders-p1', leader_node_id: NODE_B},
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'orders-p1-r1',
        service_type: 'partition',
        partition_id: 'orders-p1',
        node_id: NODE_A,
        status: 'active',
      },
      {
        service_id: 'orders-p1-r2',
        service_type: 'partition',
        partition_id: 'orders-p1',
        node_id: NODE_B,
        status: 'active',
      },
    ],
    [TABLES.SERVICE_DEFINITIONS]: [
      {
        service_id: SVC_ID,
        service_name: 'lift-svc',
        replica_count: 1,
        read_locality: readLocality,
      },
    ],
    [TABLES.SERVICE_PARTITION_ACCESS]: [...accessRows],
  };
  return {
    rows,
    get(table, key) {
      const keyField = {
        [TABLES.NODES]: 'node_id',
        [TABLES.PARTITIONS]: 'partition_id',
        [TABLES.SERVICE_DEFINITIONS]: 'service_id',
        [TABLES.SERVICE_PARTITION_ACCESS]: SPA_COL.ACCESS_ID,
      }[table];
      return (this.rows[table] || [])
        .find((row) => row[keyField] === key) || null;
    },
    filter(table, predicate) {
      return (this.rows[table] || []).filter(predicate);
    },
  };
}

function accessRow({nodeId, serviceId, counts, publishedAt}) {
  return {
    [SPA_COL.ACCESS_ID]: `${nodeId}:${serviceId}`,
    [SPA_COL.NODE_ID]: nodeId,
    [SPA_COL.SERVICE_ID]: serviceId,
    [SPA_COL.ACCESS_JSON]: JSON.stringify(counts),
    [SPA_COL.WINDOW_STARTED_AT]: publishedAt - 30000,
    [SPA_COL.PUBLISHED_AT]: publishedAt,
  };
}

function buildPolicyHost(cache) {
  class PolicyHost {}
  applyUnifiedRebalancerPolicySchedulerMethods(PolicyHost);
  const host = new PolicyHost();
  host.entityId = SVC_ID;
  host.systemTableCache = cache;
  return host;
}

test('weights derivation: reads credit replica groups, writes credit ' +
  'the leader group, stale rows age out', (t) => {
  const freshReads = accessRow({
    nodeId: NODE_A,
    serviceId: SVC_ID,
    counts: {'orders-p1': {r: 4, w: 0}},
    publishedAt: NOW_MS - 1000,
  });
  const freshWrites = accessRow({
    nodeId: NODE_B,
    serviceId: SVC_ID,
    counts: {'orders-p1': {r: 0, w: 4}},
    publishedAt: NOW_MS - 1000,
  });
  const staleReads = accessRow({
    nodeId: 'node-gone',
    serviceId: SVC_ID,
    counts: {'orders-p1': {r: 100, w: 100}},
    publishedAt: NOW_MS - 999999,
  });
  const otherService = accessRow({
    nodeId: NODE_A,
    serviceId: 'svc-other',
    counts: {'orders-p1': {r: 50, w: 0}},
    publishedAt: NOW_MS - 1000,
  });

  const readsOnly = buildServiceDataAffinityGroupWeights({
    systemTableCache: buildClusterCache({
      accessRows: [freshReads, staleReads, otherService],
    }),
    serviceId: SVC_ID,
    nowMs: NOW_MS,
  });
  t.same(readsOnly, {G1: 1, G2: 1},
    'reads credit BOTH groups holding an active replica equally ' +
      '(locality routing can serve reads in either), stale and ' +
      'other-service rows ignored');

  const readsAndWrites = buildServiceDataAffinityGroupWeights({
    systemTableCache: buildClusterCache({
      accessRows: [freshReads, freshWrites],
    }),
    serviceId: SVC_ID,
    nowMs: NOW_MS,
  });
  t.same(readsAndWrites, {G1: 0.5, G2: 1},
    'writes credit only the leader group (G2), normalized best=1');

  t.same(
    buildServiceDataAffinityGroupWeights({
      systemTableCache: buildClusterCache({accessRows: []}),
      serviceId: SVC_ID,
      nowMs: NOW_MS,
    }),
    {},
    'no attribution rows yields empty weights',
  );
  t.end();
});

test('policy lift: same_group + fresh attribution enables the affinity ' +
  'policy; any / no attribution leaves the policy unchanged', (t) => {
  const freshRow = accessRow({
    nodeId: NODE_B,
    serviceId: SVC_ID,
    counts: {'orders-p1': {r: 0, w: 3}},
    publishedAt: Date.now(),
  });

  const lifted = buildPolicyHost(buildClusterCache({
    accessRows: [freshRow],
    readLocality: SERVICE_READ_LOCALITY.SAME_GROUP,
  })).getRuntimeServicePolicy();
  t.equal(lifted.targetReplicaCount, 1,
    'replica_count override still applies');
  t.same(lifted.dataAffinity,
    {nodeWeights: {[NODE_B]: 1}, groupWeights: {G2: 1}},
    'writes-only attribution lifts the leader NODE (primary nearness ' +
      'coordinate) and its group onto the policy');
  t.equal(lifted.placementConstraints.preferDataAffinity, true,
    'the DATA_AFFINITY dimension family is enabled');
  t.equal(lifted.placementConstraints.considerCpuLoad, true,
    'existing default constraints are preserved');

  const uniformRouting = buildPolicyHost(buildClusterCache({
    accessRows: [freshRow],
    readLocality: SERVICE_READ_LOCALITY.ANY,
  })).getRuntimeServicePolicy();
  t.equal(uniformRouting.dataAffinity, undefined,
    'uniform routing (any) never lifts affinity — planner and router ' +
      'stay coherent on the same read_locality field');
  t.equal(
    uniformRouting.placementConstraints.preferDataAffinity,
    undefined,
    'the dimension family stays off for uniform routing',
  );

  const noAttribution = buildPolicyHost(buildClusterCache({
    accessRows: [],
    readLocality: SERVICE_READ_LOCALITY.SAME_GROUP,
  })).getRuntimeServicePolicy();
  t.equal(noAttribution.dataAffinity, undefined,
    'same_group without fresh attribution leaves the policy unchanged');
  t.end();
});

test('end-to-end: record -> publish -> aggregate -> policy -> ' +
  'DATA_AFFINITY dimensions in the real kernel', async (t) => {
  // 1. RECORD: the engine-side accumulator counts the service's reads.
  const metrics = new ServicePartitionAccessMetrics();
  metrics.record(SVC_ID, ['orders-p1'], SERVICE_PARTITION_ACCESS_KIND.READ);
  metrics.record(SVC_ID, ['orders-p1'], SERVICE_PARTITION_ACCESS_KIND.WRITE);

  // 2. PUBLISH: the fake gateway lands the upserted row in the cluster
  //    cache, exactly where CDC propagation would put it.
  const cache = buildClusterCache({
    readLocality: SERVICE_READ_LOCALITY.SAME_GROUP,
  });
  const gateway = {
    upsertSystemTableRow: async (tableName, row) => {
      cache.rows[tableName].push(row);
      return {success: true};
    },
  };
  const publisher = new ServicePartitionAccessPublisher({
    nodeId: NODE_A,
    metrics,
    getGateway: () => gateway,
    getLogger: () => null,
    now: () => Date.now(),
  });
  const published = await publisher.publishOnce();
  t.same(published, {published: 1, failed: 0}, 'the delta row published');

  // 3. AGGREGATE + POLICY: the policy owner lifts the affinity policy.
  const policy = buildPolicyHost(cache).getRuntimeServicePolicy();
  t.equal(policy.placementConstraints.preferDataAffinity, true,
    'the lifted policy enables the dimension family');
  t.same(policy.dataAffinity.groupWeights, {G1: 0.5, G2: 1},
    'reads credit both replica groups, the write credits the leader ' +
      'group — G2 dominates');

  // 4. KERNEL: the real placement scorer consumes the lifted policy.
  const decision = buildPlacementOwnerDecision({
    candidateNodes: [
      {
        node_id: NODE_A,
        status: ReplicaStatus.ACTIVE,
        cpu_usage_percent: 30,
        memory_usage_percent: 0,
        disk_usage_percent: 0,
        latency_group_id: 'G1',
      },
      {
        node_id: NODE_B,
        status: ReplicaStatus.ACTIVE,
        cpu_usage_percent: 30,
        memory_usage_percent: 0,
        disk_usage_percent: 0,
        latency_group_id: 'G2',
      },
    ],
    currentReplicas: [],
    targetCount: 1,
    policy,
    placementPolicy: PLACEMENT_OWNER_POLICY.RUNTIME_SERVICE_SPREAD,
    scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
  });
  const affinityDims = decision.scoreResult.scoreVector.map((entry) => ({
    nodeId: entry.nodeId,
    value: entry.dimensions.find(
      (d) => d.dimension === PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY,
    )?.value,
  }));
  t.same(
    affinityDims.find((d) => d.nodeId === NODE_B),
    {nodeId: NODE_B, value: -10},
    'the kernel scores the dominant data group at full affinity weight',
  );
  t.same(
    affinityDims.find((d) => d.nodeId === NODE_A),
    {nodeId: NODE_A, value: -5},
    'the secondary group scores proportionally',
  );
  t.equal(decision.intent.targetNodeIds[0], NODE_B,
    'placement intent lands the service in its data-dominant group — ' +
      'the epic thesis, live end to end');
  t.end();
});
