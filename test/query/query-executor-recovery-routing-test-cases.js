import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {ERRORS} from '../../src/constants/index.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
  CANONICAL_LEADER_IDENTITY_STATE,
  CANONICAL_LEADER_ROUTING_GAP_STATE,
} from '../../src/query/canonical-leader-routing.js';
import {createMockMessageRouter} from './query-executor-mock-message-router.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

// Partition rows by id and service/partition rows by predicate, shared by
// the fixtures that keep their rows on the cache object.
const PARTITION_CACHE_ACCESSORS = Object.freeze({
  get(type, key) {
    if (type === TABLES.PARTITIONS) {
      return this.partitions.find(
        (partition) => partition.partition_id === key,
      ) || null;
    }
    return null;
  },
  filter(type, predicate) {
    if (type === TABLES.SERVICES) {
      return this.services.filter(predicate);
    }
    if (type === TABLES.PARTITIONS) {
      return this.partitions.filter(predicate);
    }
    return [];
  },
});

// A nodes-table partition with no owner row and two replicas: node-a a
// follower, node-b in the stated raft role at the stated address.
function ownerlessNodesPartitionCache(partitionId, nodeBRole, nodeBAddress) {
  const partitionRow = {partition_id: partitionId, table_name: TABLES.NODES};
  const replica = (nodeId, serviceId, raftRole, address) => ({
    service_id: serviceId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: raftRole,
    address,
    status: SERVICE_STATUS.ACTIVE,
  });
  return {
    get(tableName, key) {
      return tableName === TABLES.PARTITIONS && key === partitionId ?
        {...partitionRow} :
        null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{...partitionRow}].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return [
          replica('node-a', 'nodes-p1-r1', 'follower',
            'node-a/partition/nodes-p1-r1'),
          replica('node-b', 'nodes-p1-r2', nodeBRole, nodeBAddress),
        ].filter(predicate);
      }
      return [];
    },
  };
}


// Removed with quest serve-eligibility-committed-epoch-read (lead decision
// D2): the priority-recovery bootstrap write/read grace, readiness-filtered
// system-table reads and writes, and the widening and overlay refresh that
// followed an all-readiness-filtered system partition. System-table routing
// decides on raft leadership and live transport (witness:
// query-executor-serve-eligibility-routing.test.js).
export function registerQueryExecutorRecoveryRoutingTests() {
  test('QueryExecutor - priority recovery write defers cold reconnect and ' +
    'widens to a live peer', async (t) => {
    const partitionId = 'replica_operations-p1';
    const disconnectedNodeId = 'node-disconnected';
    const peerNodeId = 'node-peer';
    const disconnectedAddress =
      `${disconnectedNodeId}/partition/${partitionId}-r1`;
    const peerAddress = `${peerNodeId}/partition/${partitionId}-r2`;
    const queryTimeoutMs = 6000;
    const reconnectDeferTimeoutMs = 1;
    const deliveries = [];
    const systemCache = {
      partitions: [
        {
          partition_id: partitionId,
          table_name: TABLES.REPLICA_OPERATIONS,
          leader_node_id: disconnectedNodeId,
        },
      ],
      services: [
        {
          service_id: `${partitionId}-r1`,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: disconnectedNodeId,
          raft_role: 'leader',
          address: disconnectedAddress,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: `${partitionId}-r2`,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: peerNodeId,
          raft_role: 'follower',
          address: peerAddress,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
      ...PARTITION_CACHE_ACCESSORS,
    };
    const messageRouter = {
      getConnectionState: (nodeId) =>
        nodeId === disconnectedNodeId ? 'disconnected' : 'connected',
      deliver: async (address, _message, options) => {
        deliveries.push({address, timeoutMs: options?.timeoutMs});
        if (address === disconnectedAddress) {
          return buildDeliveryEnvelope(
            {
              acknowledged: false,
              error: `Connection to node ${disconnectedNodeId} closed`,
              errorCode: 'ROUTER_CONNECTION_CLOSED',
              retryAfterMs: 50,
              deferRetry: true,
            });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [],
          changes: 1,
        });
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner({
        projectedDimensions: {controlPlaneRecoveryEligible: true, repairEligible: true},
      }),
      messageRouter,
      systemCache,
    });
    executor.queryTimeoutMs = 5;
    executor.leaderRetryDelayMs = 1;

    const result = await executor.executeOnPartition(
      partitionId,
      'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
      ['completed', 'operation-1'],
      false,
      false,
      false,
      {
        timeoutMs: queryTimeoutMs,
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      },
    );

    t.equal(result.success, true,
      'priority recovery write should succeed through the live peer');
    t.same(
      deliveries.map((delivery) => delivery.address),
      [disconnectedAddress, peerAddress],
      'write should widen from the disconnected leader to the live peer',
    );
    t.equal(
      deliveries[0].timeoutMs,
      reconnectDeferTimeoutMs,
      'disconnected leader write should receive a reconnect-defer budget',
    );
    t.ok(
      deliveries[1].timeoutMs > reconnectDeferTimeoutMs &&
        deliveries[1].timeoutMs <= queryTimeoutMs,
      'live peer write should keep the remaining query budget',
    );
  });

  test('QueryExecutor - inactive participant routing falls through to live ' +
    'participant for authoritative nodes read', async (t) => {
    const inactiveNodeId = '7493b0ab-a054-5fad-a91b-5e331db29304';
    const liveNodeId = '11601fe0-72d6-5853-8590-ec2881853e72';
    const partitionId = 'nodes-p1';
    const inactiveServiceId = `${partitionId}-r1`;
    const liveServiceId = `${partitionId}-r2`;
    const inactiveParticipantAddress =
      `${inactiveNodeId}/partition/${inactiveServiceId}`;
    const liveParticipantAddress = `${liveNodeId}/partition/${liveServiceId}`;
    const selectNodesSql = 'SELECT * FROM nodes';
    const routerConnectionClosedCode = 'ROUTER_CONNECTION_CLOSED';
    const leaderRole = 'leader';
    const followerRole = 'follower';
    const starColumnType = 'star';
    const queryTimeoutMs = 3000;
    const connectionClosedError =
      `Connection to node ${inactiveNodeId} closed`;
    const liveRows = [{node_id: liveNodeId}];
    const deliveries = [];
    const systemCache = {
      partitions: [
        {
          partition_id: partitionId,
          table_name: TABLES.NODES,
          leader_node_id: inactiveNodeId,
        },
      ],
      services: [
        {
          service_id: inactiveServiceId,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: inactiveNodeId,
          raft_role: leaderRole,
          address: inactiveParticipantAddress,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: liveServiceId,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: liveNodeId,
          raft_role: followerRole,
          address: liveParticipantAddress,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
      ...PARTITION_CACHE_ACCESSORS,
    };
    const messageRouter = {
      deliver: async (address, message) => {
        deliveries.push({address, sql: message.sql});
        if (address === inactiveParticipantAddress) {
          return buildDeliveryEnvelope(
            {
              acknowledged: false,
              error: connectionClosedError,
              errorCode: routerConnectionClosedCode,
            });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: liveRows});
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter,
      systemCache,
    });
    executor.queryTimeoutMs = 5;
    executor.leaderRetryDelayMs = 1;

    const routingSnapshot = executor.getPartitionRoutingSnapshot(partitionId);
    t.equal(
      routingSnapshot.routableServiceCount,
      2,
      'without readiness owner evidence both active service rows remain eligible',
    );

    const result = await executor.executeSelect(
      {
        columns: [{type: starColumnType}],
        from: {name: TABLES.NODES},
        joins: [],
      },
      [partitionId],
      [],
      {timeoutMs: queryTimeoutMs},
    );

    t.equal(result.success, true,
      'authoritative nodes read should fall through to the live participant');
    t.same(
      deliveries,
      [
        {address: inactiveParticipantAddress, sql: selectNodesSql},
        {address: liveParticipantAddress, sql: selectNodesSql},
      ],
      'the fixture should route first to the inactive row, then to the live peer',
    );
    t.same(result.rows, liveRows,
      'read should return rows from the live participant');
  });

  test('QueryExecutor - executeOnPartition returns last error when ' +
    'all read candidates fail with transient errors (§1.12)', async (t) => {
    // Proves: when every candidate fails, the read returns the last
    // transient error rather than failing on the first one.
    const systemCache = {
      partitions: [
        {partition_id: 'p1', leader_node_id: 'node1'},
      ],
      services: [
        {
          service_id: 'svc-n1',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node1',
          raft_role: 'leader',
          address: 'node1/partition/p1',
          status: 'active',
        },
        {
          service_id: 'svc-n2',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node2',
          raft_role: 'follower',
          address: 'node2/partition/p1',
          status: 'active',
        },
      ],
      get: function(type, key) {
        if (type === 'partitions') {
          return this.partitions.find(
            (p) => p.partition_id === key,
          ) || null;
        }
        return null;
      },
      filter: function(type, predicate) {
        if (type === 'services') return this.services.filter(predicate);
        if (type === 'partitions') {
          return this.partitions.filter(predicate);
        }
        return [];
      },
    };

    const messageRouter = {
      deliver: async (_address, _message) => {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false,
          error: 'Message timeout',
        });
      },
    };

    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter,
      systemCache,
    });
    executor.queryTimeoutMs = 5;
    executor.leaderRetryDelayMs = 1;

    const result = await executor.executeOnPartition(
      'p1',
      'SELECT * FROM users',
      [],
      true, // forRead
      false,
      false,
    );

    t.equal(result.success, false);
    t.equal(
      result.error,
      'Message timeout',
      'should return last transient error after exhausting candidates',
    );
    t.end();
  });

  test('QueryExecutor - denied routing repair refreshes authoritative overlay ' +
    'for canonical leader service gaps', async (t) => {
    const partitionId = 'nodes-p1';
    const leaderNodeId = 'seed-node';
    const overlayServices = [];
    const refreshCalls = [];
    const systemCache = {
      get(tableName, key) {
        if (tableName === TABLES.PARTITIONS && key === partitionId) {
          return {
            partition_id: partitionId,
            table_name: TABLES.NODES,
            leader_node_id: leaderNodeId,
          };
        }
        return null;
      },
      filter(tableName, predicate) {
        if (tableName === TABLES.SERVICES) {
          return overlayServices.filter(predicate);
        }
        if (tableName === TABLES.PARTITIONS) {
          const rows = [
            {
              partition_id: partitionId,
              table_name: TABLES.NODES,
              leader_node_id: leaderNodeId,
            },
          ];
          return rows.filter(predicate);
        }
        return [];
      },
    };

    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter: createMockMessageRouter(),
      systemCache,
      routingMetadataOverlay: {
        getServicesForPartition(requestedPartitionId) {
          return requestedPartitionId === partitionId ? overlayServices : [];
        },
        async refreshPartitionRouting(requestedPartitionId, options = {}) {
          const refreshCall = {
            partitionId: requestedPartitionId,
            reasonCode: options.routingSnapshot?.reasonCode || null,
          };
          if (typeof options.routingSnapshot?.canonicalLeaderNodeId === 'string') {
            refreshCall.leaderNodeId =
              options.routingSnapshot.canonicalLeaderNodeId;
          }
          refreshCalls.push(refreshCall);
          overlayServices.splice(0, overlayServices.length, {
            service_id: 'nodes-p1-r1',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: leaderNodeId,
            raft_role: 'leader',
            address: `${leaderNodeId}/partition/${partitionId}-r1`,
            status: SERVICE_STATUS.ACTIVE,
          });
          return true;
        },
      },
    });

    const staleSnapshot =
      executor.getPartitionRoutingSnapshot(partitionId);
    t.equal(
      staleSnapshot.reasonCode,
      QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
      'routing snapshot should surface the canonical leader service gap',
    );
    t.equal(staleSnapshot.serviceRowCount, 0);
    t.equal(staleSnapshot.canonicalLeaderNodeId, leaderNodeId);
    t.equal(staleSnapshot.leaderKnown, true);

    const repaired =
      await executor.maybeAwaitDeniedPartitionRoutingRepair(staleSnapshot);

    t.equal(repaired, true,
      'denied routing repair should retry after authoritative overlay refresh');
    t.same(
      refreshCalls,
      [
        {
          partitionId,
          reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
          leaderNodeId,
        },
      ],
      'denied repair should reuse the authoritative overlay refresh path',
    );

    const refreshedSnapshot =
      executor.getPartitionRoutingSnapshot(partitionId);
    t.equal(
      refreshedSnapshot.reasonCode,
      QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
      'routing snapshot should recover once overlay service rows arrive',
    );
    t.equal(refreshedSnapshot.serviceRowCount, 1);
    t.equal(
      executor.getPartitionServiceCandidates(
        partitionId,
        true,
      ).length,
      1,
      'read candidates should recover after the overlay refresh',
    );
    t.end();
  });

  test('QueryExecutor - recovery-owned system-table writes fail closed when ' +
    'only service-role leader witnesses exist',
  async (t) => {
    const partitionId = 'nodes-p1';
    const leaderAddress = 'node-b/partition/nodes-p1-r2';
    const OWNER_MISSING_REASON = 'owner_row_missing';
    const OBSERVATION_DEFERRED = 'deferred';
    const systemCache = ownerlessNodesPartitionCache(
      partitionId, 'leader', leaderAddress);

    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner({
        projectedDimensions: {controlPlaneRecoveryEligible: true, repairEligible: true},
      }),
      messageRouter: createMockMessageRouter(),
      systemCache,
    });

    const resolution = executor.resolvePartitionServiceCandidates(
      partitionId,
      false,
      false,
      false,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    );

    t.equal(
      resolution.routingSnapshot.canonicalLeaderIdentityState,
      CANONICAL_LEADER_IDENTITY_STATE.SERVICE_ROLE_DERIVED,
      'routing snapshot should surface the derived leader-identity state',
    );
    t.equal(
      resolution.routingSnapshot.canonicalLeaderObservationState,
      OBSERVATION_DEFERRED,
      'service-role leader witnesses should remain a deferred owner-row observation',
    );
    t.equal(
      resolution.routingSnapshot.canonicalLeaderObservationReasonCode,
      OWNER_MISSING_REASON,
      'routing snapshot should classify the missing owner row explicitly',
    );
    t.equal(
      resolution.routingSnapshot.canonicalLeaderRoutingGapState,
      CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING,
      'service-role leader witnesses should not close the owner gap',
    );
    t.same(
      resolution.candidates,
      [],
      'recovery-owned writes should fail closed instead of targeting a service-role-derived leader',
    );
    t.equal(
      executor.findPartitionLeaderAddress(
        partitionId,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      ),
      null,
      'strict leader lookup should fail closed without owner-row leader truth',
    );
  });

  test('QueryExecutor - recovery-owned system-table writes fail closed when ' +
    'canonical leader identity remains completely unresolved', async (t) => {
    const partitionId = 'nodes-p1';
    const systemCache = ownerlessNodesPartitionCache(
      partitionId, 'follower', 'node-b/partition/nodes-p1-r2');

    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner({
        projectedDimensions: {controlPlaneRecoveryEligible: true, repairEligible: true},
      }),
      messageRouter: createMockMessageRouter(),
      systemCache,
    });

    const resolution = executor.resolvePartitionServiceCandidates(
      partitionId,
      false,
      false,
      false,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    );

    t.equal(
      resolution.routingSnapshot.canonicalLeaderIdentityState,
      CANONICAL_LEADER_IDENTITY_STATE.MISSING,
      'routing snapshot should preserve the unresolved leader-identity state',
    );
    t.equal(
      resolution.routingSnapshot.canonicalLeaderRoutingGapState,
      CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING,
      'routing snapshot should surface the canonical leader owner gap',
    );
    t.same(
      resolution.candidates,
      [],
      'recovery-owned system-table writes should defer instead of widening across follower-only candidates when leader identity remains unproven',
    );
  });

  test('QueryExecutor - executeOnPartition defers recovery-owned system-table ' +
    'writes when canonical leader identity remains completely unresolved',
  async (t) => {
    const deliveries = [];
    const partitionId = 'nodes-p1';
    const systemCache = ownerlessNodesPartitionCache(
      partitionId, 'follower', 'node-b/partition/nodes-p1-r2');
    const messageRouter = {
      deliver: async (address) => {
        deliveries.push(address);
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [],
          changes: 1,
        });
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner({
        projectedDimensions: {controlPlaneRecoveryEligible: true, repairEligible: true},
      }),
      messageRouter,
      systemCache,
    });
    executor.queryTimeoutMs = 5;
    executor.leaderRetryDelayMs = 1;

    const result = await executor.executeOnPartition(
      partitionId,
      'INSERT INTO nodes (node_id) VALUES (?)',
      ['node-c'],
      false,
      false,
      false,
      {
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      },
    );

    t.equal(
      result.success,
      false,
      'recovery-owned system-table writes should fail closed when leader identity is still missing',
    );
    t.equal(
      result.error,
      ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      'the caller should receive the canonical no-leader outcome instead of a speculative follower dispatch',
    );
    t.same(
      deliveries,
      [],
      'no speculative follower delivery should be attempted while canonical leader identity is missing',
    );
  });

  test('QueryExecutor - steady-state system-table writes fail closed when ' +
    'canonical leader identity is only service-role-derived', async (t) => {
    const partitionId = 'nodes-p1';
    const leaderAddress = 'node-b/partition/nodes-p1-r2';
    const systemCache = ownerlessNodesPartitionCache(
      partitionId, 'leader', leaderAddress);
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter: createMockMessageRouter(),
      systemCache,
    });

    const resolution = executor.resolvePartitionServiceCandidates(
      partitionId,
      false,
      false,
      false,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    );

    t.equal(
      resolution.routingSnapshot.canonicalLeaderIdentityState,
      CANONICAL_LEADER_IDENTITY_STATE.SERVICE_ROLE_DERIVED,
      'routing snapshot should still expose the underlying service-role-derived witness',
    );
    t.equal(
      resolution.routingSnapshot.canonicalLeaderObservationReasonCode,
      'owner_row_missing',
      'steady-state diagnostics should classify the missing owner row explicitly',
    );
    t.equal(
      resolution.routingSnapshot.canonicalLeaderRoutingGapState,
      CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING,
      'steady-state writes should normalize the derived witness back into an owner gap',
    );
    t.same(
      resolution.candidates,
      [],
      'steady-state writes should fail closed instead of trusting service-role-derived owner metadata',
    );
    t.equal(
      executor.findPartitionLeaderAddress(partitionId),
      null,
      'strict steady-state leader lookup should fail closed when only service-role-derived evidence exists',
    );
  });
}
