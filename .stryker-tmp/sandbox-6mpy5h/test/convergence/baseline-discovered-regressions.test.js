// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {STATE} from '../../src/constants/index.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {AuthoritativeRowMutationHelper} from '../../src/raft/authoritative-row-mutation-helper.js';
import {INVARIANT_ID} from '../../src/invariants/invariant-catalog.js';
import {INVARIANT_EVENT} from '../../src/invariants/invariant-emitter.js';
import {
  CONVERGENCE_EVENT_KIND,
  DeterministicConvergenceHarness,
} from './deterministic-convergence-harness.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function resetEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createNodeLeaseOwner(disconnectNodeDueToLeaseExpiry) {
  return {
    disconnectNodeDueToLeaseExpiry,
  };
}

test('Convergence regression - authoritative lease sweep ignores stale observed snapshots',
  async (t) => {
    initEnv();

    const harness = new DeterministicConvergenceHarness({
      startAtMs: 100,
    });
    const observedLeaseSnapshot = {
      node_id: 'node-renewed',
      ready_lease_expires_at: 90,
      last_heartbeat: 80,
      connection_state: STATE.READY,
    };
    const authoritativeNodeRow = {
      ...observedLeaseSnapshot,
    };
    const invariantEvents = [];
    let attemptedDisconnectWhereClause = null;
    let expiredIds = null;

    const service = new LeaseService({
      nodeId: 'control-node',
      now: () => harness.getCurrentTime(),
      nodeLeaseOwner: createNodeLeaseOwner(async (observedNode, nowArg) => {
          attemptedDisconnectWhereClause = {
            node_id: observedNode.node_id,
            ready_lease_expires_at: observedNode.ready_lease_expires_at,
            last_heartbeat: observedNode.last_heartbeat || nowArg,
          };
          if (attemptedDisconnectWhereClause.ready_lease_expires_at !==
              authoritativeNodeRow.ready_lease_expires_at ||
              attemptedDisconnectWhereClause.last_heartbeat !==
                authoritativeNodeRow.last_heartbeat) {
            return {
              success: true,
              partitionResult: {affectedRows: 0},
            };
          }
          authoritativeNodeRow.connection_state = STATE.DISCONNECTED;
          authoritativeNodeRow.ready_lease_expires_at = null;
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        }),
      systemTableCache: {
        getAll: () => [authoritativeNodeRow],
      },
      sqlQueryEngine: {
        executeQuery: async () => ({
          success: true,
          rows: [{...observedLeaseSnapshot}],
        }),
      },
      messageGroupServices: new Set([
        {isLeaderReplica: () => true},
      ]),
    });
    service.initialize();
    service.on(INVARIANT_EVENT.RUNTIME, (event) => {
      invariantEvents.push(event);
    });

    t.teardown(() => {
      service.stop();
      resetEnv();
    });

    harness.registerInvariant(
      INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
      () => ({
        passed: authoritativeNodeRow.connection_state === STATE.READY &&
          authoritativeNodeRow.ready_lease_expires_at === 200 &&
          authoritativeNodeRow.last_heartbeat === 150,
        connectionState: authoritativeNodeRow.connection_state,
        readyLeaseExpiresAt: authoritativeNodeRow.ready_lease_expires_at,
        lastHeartbeat: authoritativeNodeRow.last_heartbeat,
      }),
      {nodeId: authoritativeNodeRow.node_id},
    );

    harness.schedule(
      CONVERGENCE_EVENT_KIND.STALE_READ,
      0,
      async () => {
        observedLeaseSnapshot.ready_lease_expires_at =
          authoritativeNodeRow.ready_lease_expires_at;
        observedLeaseSnapshot.last_heartbeat =
          authoritativeNodeRow.last_heartbeat;
      },
      {nodeId: authoritativeNodeRow.node_id},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.HEARTBEAT,
      1,
      async () => {
        authoritativeNodeRow.ready_lease_expires_at = 200;
        authoritativeNodeRow.last_heartbeat = 150;
      },
      {nodeId: authoritativeNodeRow.node_id},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.CUSTOM,
      2,
      async () => {
        expiredIds = await service.sweepExpiredLeases();
      },
      {operation: 'lease-sweep'},
    );

    const result = await harness.runUntilIdle();

    t.same(expiredIds, [], 'renewed lease should not be expired by a stale sweep');
    t.equal(
      attemptedDisconnectWhereClause,
      null,
      'authoritative sweep should not attempt a disconnect from a stale observed snapshot',
    );
    t.equal(authoritativeNodeRow.connection_state, STATE.READY);
    t.equal(authoritativeNodeRow.ready_lease_expires_at, 200);
    t.equal(authoritativeNodeRow.last_heartbeat, 150);
    t.equal(
      invariantEvents.length,
      0,
      'no guarded-write invariant should emit when the authoritative sweep skips the stale candidate',
    );
    t.equal(result.invariantResults[0]?.passed, true);
  });

test('Convergence regression - candidate replica is rejected from benchmark readiness',
  async (t) => {
    initEnv();

    const harness = new DeterministicConvergenceHarness();
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: {
        onCacheChange() {},
      },
      sqlQueryEngine: {},
    });
    const readinessContext = {
      activeNodeIds: new Set(['node-1', 'node-2']),
      tableName: 'benchmark_events',
      tableFound: true,
      schemaReady: true,
      localTargetReplicaStateByNodeId: new Map(),
      replicaOpsInFlight: 0,
      leadershipStable: true,
      appliedSchemaVersion: '42',
    };
    const readinessByNodeId = new Map();

    t.teardown(() => {
      resetEnv();
    });

    harness.registerInvariant(
      INVARIANT_ID.REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS,
      () => {
        const leaderReadiness = readinessByNodeId.get('node-1');
        const candidateReadiness = readinessByNodeId.get('node-2');
        return {
          passed: leaderReadiness?.benchmarkReady === true &&
            candidateReadiness?.routingReady === true &&
            candidateReadiness?.schemaReady === true &&
            candidateReadiness?.topologyReady === false &&
            candidateReadiness?.benchmarkReady === false &&
            candidateReadiness?.reasons?.some((reason) =>
              reason.code === 'local_replica_not_voter_ready'),
          leaderBenchmarkReady: leaderReadiness?.benchmarkReady,
          candidateBenchmarkReady: candidateReadiness?.benchmarkReady,
          candidateReasons: candidateReadiness?.reasons?.map((reason) =>
            reason.code),
        };
      },
      {nodeId: 'node-2', partitionId: 'benchmark-p1'},
    );

    harness.schedule(
      CONVERGENCE_EVENT_KIND.HEARTBEAT,
      0,
      async () => {
        readinessContext.localTargetReplicaStateByNodeId = new Map([
          ['node-1', {
            nonVoterPartitionIds: new Set(),
          }],
          ['node-2', {
            nonVoterPartitionIds: new Set(['benchmark-p1']),
          }],
        ]);
      },
      {nodeId: 'node-2', localReplicaRole: 'candidate'},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.CUSTOM,
      1,
      async () => {
        readinessByNodeId.set(
          'node-1',
          api.buildServiceDiscoveryReplicaReadiness(
            {
              nodeId: 'node-1',
              healthStatus: 'healthy',
            },
            readinessContext,
          ),
        );
        readinessByNodeId.set(
          'node-2',
          api.buildServiceDiscoveryReplicaReadiness(
            {
              nodeId: 'node-2',
              healthStatus: 'healthy',
            },
            readinessContext,
          ),
        );
      },
      {operation: 'evaluate-service-discovery-readiness'},
    );

    const result = await harness.runUntilIdle();

    t.equal(readinessByNodeId.get('node-1')?.benchmarkReady, true);
    t.equal(readinessByNodeId.get('node-2')?.routingReady, true);
    t.equal(readinessByNodeId.get('node-2')?.schemaReady, true);
    t.equal(readinessByNodeId.get('node-2')?.topologyReady, false);
    t.equal(readinessByNodeId.get('node-2')?.benchmarkReady, false);
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_replica_not_voter_ready'),
      true,
    );
    t.equal(result.invariantResults[0]?.passed, true);
  });

test('Convergence regression - delayed owner-row convergence does not strand a newer leader update',
  async (t) => {
    initEnv();

    const harness = new DeterministicConvergenceHarness({
      startAtMs: 10,
    });
    const cachedOwnerRow = {
      partition_id: 'benchmark-p1',
      leader_node_id: 'node-a',
      updated_at: 7,
    };
    const authoritativeOwnerRow = {
      partition_id: 'benchmark-p1',
      leader_node_id: 'node-b',
      updated_at: 8,
    };
    const writes = [];
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'partitions',
      buildWhereClause: (_value, context = {}) => ({
        partition_id: 'benchmark-p1',
        leader_node_id: context.cachedRow?.leader_node_id,
        updated_at: context.cachedRow?.updated_at,
      }),
      buildUpdateData: (value, updatedAt) => ({
        leader_node_id: value,
        updated_at: updatedAt,
      }),
      readRowFromCache: () => cachedOwnerRow,
      readValueFromCache: () => cachedOwnerRow.leader_node_id,
      cdcIntegrationService: {
        updateSystemTableRow: async (_tableName, whereClause, data) => {
          writes.push({whereClause, data});
          if (whereClause.leader_node_id !== authoritativeOwnerRow.leader_node_id ||
              whereClause.updated_at !== authoritativeOwnerRow.updated_at) {
            return {
              success: true,
              partitionResult: {affectedRows: 0},
            };
          }
          authoritativeOwnerRow.leader_node_id = data.leader_node_id;
          authoritativeOwnerRow.updated_at = data.updated_at;
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
      },
      setTimeoutFn: (callback, delayMs) => harness.schedule(
        CONVERGENCE_EVENT_KIND.CUSTOM,
        delayMs,
        async () => {
          await callback();
        },
        {operation: 'owner-row-retry'},
      ),
      clearTimeoutFn: () => {},
      now: () => harness.getCurrentTime(),
    });
    helper.persistedValue = 'node-a';

    t.teardown(() => {
      helper.shutdown();
      resetEnv();
    });

    harness.registerInvariant(
      INVARIANT_ID.PARTITION_SINGLE_CANONICAL_LEADER,
      () => ({
        passed: cachedOwnerRow.leader_node_id === authoritativeOwnerRow.leader_node_id &&
          cachedOwnerRow.updated_at === authoritativeOwnerRow.updated_at &&
          cachedOwnerRow.leader_node_id === 'node-c',
        cachedLeaderNodeId: cachedOwnerRow.leader_node_id,
        authoritativeLeaderNodeId: authoritativeOwnerRow.leader_node_id,
        cachedUpdatedAt: cachedOwnerRow.updated_at,
        authoritativeUpdatedAt: authoritativeOwnerRow.updated_at,
      }),
      {partitionId: cachedOwnerRow.partition_id},
    );

    harness.schedule(
      CONVERGENCE_EVENT_KIND.STALE_READ,
      0,
      async () => {
        helper.pendingValue = 'node-b';
        await helper.flush();
      },
      {partitionId: cachedOwnerRow.partition_id, leaderNodeId: 'node-b'},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.CDC,
      1,
      async () => {
        cachedOwnerRow.leader_node_id = 'node-b';
        cachedOwnerRow.updated_at = 8;
      },
      {partitionId: cachedOwnerRow.partition_id, leaderNodeId: 'node-b'},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.HEARTBEAT,
      2,
      async () => {
        helper.queue('node-c');
        await Promise.resolve();
        await Promise.resolve();
      },
      {partitionId: cachedOwnerRow.partition_id, leaderNodeId: 'node-c'},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.CDC,
      3,
      async () => {
        cachedOwnerRow.leader_node_id = 'node-c';
        cachedOwnerRow.updated_at = authoritativeOwnerRow.updated_at;
      },
      {partitionId: cachedOwnerRow.partition_id, leaderNodeId: 'node-c'},
    );

    const result = await harness.runUntilIdle();

    t.same(
      writes,
      [{
        whereClause: {
          partition_id: 'benchmark-p1',
          leader_node_id: 'node-a',
          updated_at: 7,
        },
        data: {
          leader_node_id: 'node-b',
          updated_at: 10,
        },
      }, {
        whereClause: {
          partition_id: 'benchmark-p1',
          leader_node_id: 'node-b',
          updated_at: 8,
        },
        data: {
          leader_node_id: 'node-c',
          updated_at: 12,
        },
      }],
      'follow-up owner writes should converge to the latest queued leader',
    );
    t.equal(authoritativeOwnerRow.leader_node_id, 'node-c');
    t.equal(cachedOwnerRow.leader_node_id, 'node-c');
    t.equal(helper.persistedValue, 'node-c');
    t.equal(helper.pendingValue, null);
    t.equal(result.invariantResults[0]?.passed, true);
  });
