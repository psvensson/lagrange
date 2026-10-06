import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  ReplicaState,
  ReplicaStateMachine,
} from '../../src/node/replica-state-machine.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  createLifecycleControlPlaneGatewayForCache,
  createLifecycleServiceRow,
  createPartitionRow,
} from '../test-helpers/lifecycle-state-store.js';

const NODE_ID = 'seed-node';
const PARTITION_ID = 'control_plane_publications-p1';
const LEADER_REPLICA_ID = `${PARTITION_ID}-r1`;
const RETIRING_REPLICA_ID = `${PARTITION_ID}-r3`;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function livePartitionService(replicaId, role) {
  return {
    replicaId,
    partitionId: PARTITION_ID,
    role,
    getRole() {
      return role;
    },
    isLeaderReplica() {
      return role === 'leader';
    },
  };
}

function seedCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT',
    createPartitionRow({
      partitionId: PARTITION_ID,
      nodeId: NODE_ID,
      leaderNodeId: NODE_ID,
      updatedAt: 100,
    }));
  const rows = [
    createLifecycleServiceRow({
      replicaId: LEADER_REPLICA_ID,
      partitionId: PARTITION_ID,
      nodeId: NODE_ID,
      status: ReplicaState.ACTIVE,
      raftRole: 'follower',
      version: 100,
    }),
    createLifecycleServiceRow({
      replicaId: RETIRING_REPLICA_ID,
      partitionId: PARTITION_ID,
      nodeId: NODE_ID,
      status: ReplicaState.ACTIVE,
      raftRole: 'follower',
      version: 100,
    }),
  ];
  for (const row of rows) {
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', row);
  }
  return {cache, rows};
}

function installAuthoritativeSnapshot(stateMachine, row) {
  return stateMachine.registerReplicaSnapshot(row.service_id, {
    partitionId: row.partition_id,
    nodeId: row.node_id,
    state: row.status,
    serviceId: row.service_id,
    serviceType: row.service_type || SERVICE_TYPE.PARTITION,
    serviceAddress: row.address,
    replicaIdentity: row.replica_id,
    groupId: row.group_id,
    createdAt: row.created_at,
    durableVersionColumn: 'state_entered_at',
    durableVersion: row.state_entered_at,
    authoritativeSnapshot: true,
  });
}

function createWorld({retiringRole, siblingRole}) {
  initializeEnvironment();
  const {cache, rows} = seedCache();
  const mutations = [];
  const gateway = createLifecycleControlPlaneGatewayForCache(cache, {
    beforeMutation(mutation) {
      mutations.push(structuredClone(mutation));
    },
  });
  const stateMachine = new ReplicaStateMachine({
    nodeId: NODE_ID,
    systemTableCache: cache,
    controlPlaneSystemTableGateway: gateway,
    now: () => 200,
  });
  const retiringRow = rows.find((row) =>
    row.service_id === RETIRING_REPLICA_ID);
  if (!installAuthoritativeSnapshot(stateMachine, retiringRow)) {
    throw new Error('fixture could not install retiring lifecycle snapshot');
  }
  const handler = new ReplicaHandler({
    nodeId: NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: gateway,
    controlPlaneSystemTableGateway: gateway,
    replicaStateMachine: stateMachine,
    createPartitionService: async () => null,
  });
  handler.localServices.set(
    RETIRING_REPLICA_ID,
    livePartitionService(RETIRING_REPLICA_ID, retiringRole),
  );
  handler.localServices.set(
    LEADER_REPLICA_ID,
    livePartitionService(LEADER_REPLICA_ID, siblingRole),
  );
  return {cache, handler, mutations};
}

function leaderClearMutations(mutations) {
  return mutations.filter((mutation) =>
    mutation.tableName === TABLES.PARTITIONS &&
    mutation.data?.leader_node_id === null);
}

test('removing an explicit co-located follower preserves the live sibling ' +
  'leader node', async (t) => {
  const {cache, handler, mutations} = createWorld({
    retiringRole: 'follower',
    siblingRole: 'leader',
  });

  await handler.updateReplicaStatus(
    RETIRING_REPLICA_ID,
    ReplicaStatus.REMOVING,
    {partitionId: PARTITION_ID},
  );

  t.equal(
    cache.get(TABLES.PARTITIONS, PARTITION_ID)?.leader_node_id,
    NODE_ID,
    'RED-ON-CURRENT: follower retirement cannot erase a live sibling leader',
  );
  t.equal(
    leaderClearMutations(mutations).length,
    0,
    'no canonical leader clear is submitted for a proven follower',
  );
});

test('removing the actual local leader still clears canonical ownership',
  async (t) => {
    const {cache, handler, mutations} = createWorld({
      retiringRole: 'leader',
      siblingRole: 'follower',
    });

    await handler.updateReplicaStatus(
      RETIRING_REPLICA_ID,
      ReplicaStatus.REMOVING,
      {partitionId: PARTITION_ID},
    );

    t.equal(
      cache.get(TABLES.PARTITIONS, PARTITION_ID)?.leader_node_id,
      null,
      'leader retirement still clears the node-level ownership pointer',
    );
    t.equal(
      leaderClearMutations(mutations).length,
      1,
      'the conservative leader clear still executes once',
    );
  });

test('unknown retiring runtime role remains conservative', async (t) => {
  const {cache, handler, mutations} = createWorld({
    retiringRole: null,
    siblingRole: 'leader',
  });

  await handler.updateReplicaStatus(
    RETIRING_REPLICA_ID,
    ReplicaStatus.REMOVING,
    {partitionId: PARTITION_ID},
  );

  t.equal(
    cache.get(TABLES.PARTITIONS, PARTITION_ID)?.leader_node_id,
    null,
    'absence of positive follower evidence cannot preserve ownership',
  );
  t.equal(leaderClearMutations(mutations).length, 1);
});
