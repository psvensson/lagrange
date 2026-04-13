// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  evaluatePartitionReplicaTopology,
  evaluateSharedMetadataNodeCoverage,
} from
  '../../src/admin/admin-shared-metadata-consistency.js';

test('evaluateSharedMetadataNodeCoverage detects referenced nodes missing from nodes rows',
  async (t) => {
    const result = evaluateSharedMetadataNodeCoverage({
      nodeRows: [
        {node_id: 'node-seed'},
      ],
      serviceRows: [
        {node_id: 'node-seed', status: 'active'},
        {node_id: 'node-joiner', status: 'active'},
      ],
      partitionRows: [
        {leader_node_id: 'node-seed'},
      ],
      nodeEndpointRows: [
        {node_id: 'node-joiner', status: 'active'},
      ],
    });

    t.equal(result.hasCoverageGap, true);
    t.same(result.missingNodeIds, ['node-joiner']);
    t.same(
      result.referencedNodeIds,
      ['node-joiner', 'node-seed'],
    );
  });

test('evaluateSharedMetadataNodeCoverage ignores inactive service-only references',
  async (t) => {
    const result = evaluateSharedMetadataNodeCoverage({
      nodeRows: [
        {node_id: 'node-seed'},
      ],
      serviceRows: [
        {node_id: 'node-retired', status: 'inactive'},
      ],
      partitionRows: [],
      nodeEndpointRows: [],
    });

    t.equal(result.hasCoverageGap, false);
    t.same(result.missingNodeIds, []);
  });

test('evaluatePartitionReplicaTopology accepts canonical leader backed by an active replica',
  async (t) => {
    const result = evaluatePartitionReplicaTopology({
      partitionRow: {
        partition_id: 'nodes-p1',
        leader_node_id: 'node-2',
        replica_count: 3,
      },
      serviceRows: [
        {
          service_type: 'partition',
          partition_id: 'nodes-p1',
          node_id: 'node-2',
          status: 'active',
          raft_role: 'follower',
        },
      ],
      requireLeaderNodeId: true,
    });

    t.equal(result.leaderKnown, true);
    t.equal(result.canonicalLeaderReplica, true);
    t.equal(result.lastErrorCode, null);
    t.equal(result.topologyState, 'routable');
  });

test('evaluatePartitionReplicaTopology reports leader_service_missing when active replicas exist without leader evidence',
  async (t) => {
    const result = evaluatePartitionReplicaTopology({
      partitionRow: {
        partition_id: 'nodes-p1',
        leader_node_id: 'node-2',
        replica_count: 3,
      },
      serviceRows: [
        {
          service_type: 'partition',
          partition_id: 'nodes-p1',
          node_id: 'node-3',
          status: 'active',
          raft_role: 'follower',
        },
      ],
      requireLeaderNodeId: true,
    });

    t.equal(result.leaderKnown, false);
    t.equal(result.lastErrorCode, 'leader_service_missing');
    t.equal(result.topologyState, 'invalid');
  });

test('evaluatePartitionReplicaTopology reports leader_node_id_missing when leader metadata is required',
  async (t) => {
    const result = evaluatePartitionReplicaTopology({
      partitionRow: {
        partition_id: 'nodes-p1',
        replica_count: 3,
      },
      serviceRows: [
        {
          service_type: 'partition',
          partition_id: 'nodes-p1',
          node_id: 'node-3',
          status: 'active',
          raft_role: 'follower',
        },
      ],
      requireLeaderNodeId: true,
    });

    t.equal(result.leaderKnown, false);
    t.equal(result.lastErrorCode, 'leader_node_id_missing');
    t.equal(result.topologyState, 'invalid');
  });

test('evaluatePartitionReplicaTopology reports above-target active replicas as invalid',
  async (t) => {
    const result = evaluatePartitionReplicaTopology({
      partitionRow: {
        partition_id: 'bench-p1',
        leader_node_id: 'node-1',
        replica_count: 3,
      },
      serviceRows: [
        {
          service_type: 'partition',
          partition_id: 'bench-p1',
          node_id: 'node-1',
          status: 'active',
          raft_role: 'leader',
        },
        {
          service_type: 'partition',
          partition_id: 'bench-p1',
          node_id: 'node-2',
          status: 'active',
          raft_role: 'follower',
        },
        {
          service_type: 'partition',
          partition_id: 'bench-p1',
          node_id: 'node-3',
          status: 'active',
          raft_role: 'follower',
        },
        {
          service_type: 'partition',
          partition_id: 'bench-p1',
          node_id: 'node-4',
          status: 'active',
          raft_role: 'follower',
        },
      ],
      requireLeaderNodeId: false,
    });

    t.equal(result.overTargetReplicaCount, true);
    t.equal(result.topologyState, 'invalid');
  });
