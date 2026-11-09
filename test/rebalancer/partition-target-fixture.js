import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {seedPartitionRow, seedTableRow} from '../../src/bootstrap/seed-foundation-rows.js';
import {SYSTEM_TABLE_SCHEMAS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {createTestRebalancer} from './test-helpers.js';

const FIXTURE_NOW = 1_000_000;

// Only external observations are controlled: seeded metadata, available nodes,
// healthy service rows and an empty operation inventory. All policy decoding,
// readiness target reading, assessment and move planning use production owners.
function partitionTargetFixture({table = 'replica_operations', target = 3,
  holders = target, nodeCount = target, colocated = false, tablePolicy = {}} = {}) {
  const schema = SYSTEM_TABLE_SCHEMAS.find((item) => item.tableName === table);
  const partition = {...seedPartitionRow(schema, 'node-1', FIXTURE_NOW),
    replica_count: target};
  const tableRow = {...seedTableRow(schema, FIXTURE_NOW),
    table_policies: JSON.stringify(tablePolicy)};
  const nodes = Array.from({length: nodeCount}, (_unused, index) => ({
    node_id: `node-${index + 1}`, status: 'active',
    ready_lease_expires_at: FIXTURE_NOW + 60_000,
  }));
  const replicas = Array.from({length: holders}, (_unused, index) => ({
    replica_id: `${partition.partition_id}-r${index + 1}`,
    service_id: `${partition.partition_id}-r${index + 1}`,
    partition_id: partition.partition_id,
    node_id: nodes[colocated ? 0 : index % nodes.length].node_id,
    status: 'active', raft_role: index === 0 ? 'leader' : 'follower',
    service_type: 'partition',
  }));
  const rows = {partitions: [partition], tables: [tableRow], services: replicas, nodes};
  const cache = {
    getAll: (name) => rows[name] || [],
    filter: (name, predicate) => (rows[name] || []).filter(predicate),
    get: (name, id) => (rows[name] || []).find((row) =>
      row.partition_id === id || row.table_id === id || row.node_id === id),
  };
  const policyService = new TablePolicyService({systemTableCache: cache});
  const provider = {
    systemTableCache: cache,
    getAvailableNodes: () => nodes,
    getCurrentReplicas: () => replicas,
    getHealthyReplicas: (all) => all.filter((row) => row.status === 'active'),
    getInFlightOperations: () => [],
    getTopologyBlockingInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
  const planner = new MovePlanner({entityId: partition.partition_id,
    entityType: 'partition', moveStateProvider: provider, sizeBytesResolver: () => 1});
  const rebalancer = createTestRebalancer({entityId: partition.partition_id,
    systemTableCache: cache, tablePolicyService: policyService});
  return {partition, tableRow, rows, cache, replicas, nodes, policyService,
    planner, rebalancer, shutdown() {
      rebalancer.shutdown();
      policyService.shutdown();
    }};
}

export {partitionTargetFixture};
