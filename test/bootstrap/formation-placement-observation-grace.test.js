/**
 * Formation-barrier placement-observation grace.
 *
 * The joiner barrier's authoritative placement read rides the owner-RPC
 * lane; during the post-REPLACE raft leadership transition that read goes
 * transiently unavailable, and the barrier REGRESSED to
 * waiting_for_ledger_observation, discarding already-settled spread
 * evidence — an effectively unbounded tail that held all joiners inside
 * the barrier past every window (archived runs 23-32-47 at T+105 and the
 * 90s-window profiled run 06-11-02, where all three stuck joiners carried
 * the signature). A transient read failure is evidence-absent, not
 * evidence of regression: the last COMPLETE observation is retained for a
 * bounded grace window; any fresh available read replaces it immediately.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningOperationLedgerFormationReadiness,
} from '../../src/bootstrap/node-joining-operation-ledger-formation-readiness.js';
import {AuthoritativeControlPlaneView} from
  '../../src/control-plane/authoritative-control-plane-view.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_READ_PURPOSE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {executeAuthoritativeOwnerRpcRead} from
  '../../src/cdc/cdc-integration-service-owner-rpc-read-execution.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  COLUMN,
  NODE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const PARTITION_ID = 'replica_operations-p1';
const TARGET_REPLICAS = 3;

function serviceRow(nodeId, replicaId) {
  return {
    partition_id: PARTITION_ID,
    node_id: nodeId,
    replica_id: replicaId,
    service_type: 'partition',
    raft_role: 'follower',
    status: 'active',
    state: 'active',
  };
}

function buildHost({readResults, clock}) {
  let readIndex = 0;
  const host = Object.create(
    NodeJoiningOperationLedgerFormationReadiness.prototype,
  );
  host.now = () => clock.value;
  host.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      getAuthoritativeControlPlaneView: () => ({
        canRead: () => true,
        readReadinessOwnerRows: async () => {
          const result = readResults[
            Math.min(readIndex, readResults.length - 1)];
          readIndex += 1;
          return result;
        },
      }),
    },
  };
  return host;
}

test('a transient authoritative-read failure retains the last complete ' +
  'placement observation within the grace window', async (t) => {
  const clock = {value: 1000};
  const completeRows = [
    serviceRow('n1', 'r1'),
    serviceRow('n2', 'r2'),
    serviceRow('n3', 'r3'),
  ];
  const host = buildHost({
    clock,
    readResults: [
      {success: true, rows: completeRows, source: 'owner_rpc_lane'},
      {success: false, rows: []},
      {success: false, rows: []},
    ],
  });
  const first = await host.getOperationLedgerFormationPlacementObservation(
    PARTITION_ID, TARGET_REPLICAS);
  t.equal(first.complete, true, 'the settled read is complete');

  clock.value = 6000;
  const duringTransition =
    await host.getOperationLedgerFormationPlacementObservation(
      PARTITION_ID, TARGET_REPLICAS);
  t.equal(duringTransition.complete, true,
    'a transient read failure within the grace window keeps the settled ' +
      'observation instead of regressing the barrier');

  clock.value = 60000;
  const pastGrace =
    await host.getOperationLedgerFormationPlacementObservation(
      PARTITION_ID, TARGET_REPLICAS);
  t.equal(pastGrace.complete, false,
    'a read failure past the grace window honestly reports unavailable');
  t.end();
});

test('a fresh available read always replaces the retained observation', async (t) => {
  const clock = {value: 1000};
  const completeRows = [
    serviceRow('n1', 'r1'),
    serviceRow('n2', 'r2'),
    serviceRow('n3', 'r3'),
  ];
  const concentratedRows = [
    serviceRow('n1', 'r1'),
    serviceRow('n1', 'r2'),
    serviceRow('n1', 'r3'),
  ];
  const host = buildHost({
    clock,
    readResults: [
      {success: true, rows: completeRows, source: 'owner_rpc_lane'},
      {success: true, rows: concentratedRows, source: 'owner_rpc_lane'},
    ],
  });
  await host.getOperationLedgerFormationPlacementObservation(
    PARTITION_ID, TARGET_REPLICAS);
  clock.value = 2000;
  const fresh = await host.getOperationLedgerFormationPlacementObservation(
    PARTITION_ID, TARGET_REPLICAS);
  t.equal(fresh.distinctNodeCount, 1,
    'a fresh available read wins over the retained observation');
  t.end();
});

test('formation carries readiness-owner authority across the owner-RPC ' +
  'interaction while ordinary recovery reads remain readiness-gated',
async (t) => {
  const nodeId = 'services-owner';
  const ownerPartitionId = INITIAL_PARTITION_IDS[TABLES.SERVICES];
  const placementRows = [
    serviceRow('n1', 'r1'),
    serviceRow('n2', 'r2'),
    serviceRow('n3', 'r3'),
  ];
  const ownerServiceRow = {
    service_id: 'services-owner-replica',
    replica_id: 'services-owner-replica',
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: ownerPartitionId,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    address: `${nodeId}/partition/${ownerPartitionId}`,
    raft_role: 'leader',
  };
  const ownerPartitionRow = {
    partition_id: ownerPartitionId,
    table_name: TABLES.SERVICES,
    leader_node_id: nodeId,
  };
  const serviceRows = [ownerServiceRow];
  const nodeRow = {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: NODE_STATE.JOINING,
    [COLUMN.LAST_HEARTBEAT]: Date.now(),
    [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    connection_state: 'connected',
  };
  const cache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === ownerPartitionId) {
        return ownerPartitionRow;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.SERVICES) return serviceRows;
      if (tableName === TABLES.PARTITIONS) return [ownerPartitionRow];
      return [];
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
  };
  let ordinaryReadinessEvaluationCount = 0;
  const readiness = {
    getControlPlaneParticipationSync() {
      ordinaryReadinessEvaluationCount += 1;
      return {
        eligible: false,
        reasonCodes: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
        snapshot: null,
        summary: null,
      };
    },
    getNodeRow: () => nodeRow,
    getNodeTransportState: () => ({connected: true}),
  };
  let ownerReadDeliveryCount = 0;
  const ownerReadDeliveryAddresses = [];
  let ownerReadResponse = {
    acknowledged: true,
    success: true,
    rows: placementRows,
    readAuthorityWitness: {
      state: 'observed',
      partitionId: ownerPartitionId,
      servingNodeId: nodeId,
      servingReplicaId: ownerServiceRow.replica_id,
      term: 1,
      role: RAFT_ROLE.LEADER,
      observedAtMs: Date.now(),
    },
  };
  const messageRouter = {
    getConnectionState: () => 'connected',
    async deliver(address) {
      ownerReadDeliveryCount++;
      ownerReadDeliveryAddresses.push(address);
      return ownerReadResponse;
    },
  };
  const queryExecutor = new QueryExecutor({
    nodeId: 'joining-node',
    systemCache: cache,
    controlPlaneReadinessService: readiness,
    messageRouter,
  });
  queryExecutor.readRetryAttempts = 1;
  const ownerRpcService = {
    nodeId: 'joining-node',
    logger: {info: () => {}, warn: () => {}, error: () => {}},
    sqlQueryEngine: {queryExecutor},
  };
  const observedReadContracts = [];
  const cdcIntegrationService = {
    async executeAuthoritativeSystemTableRead(
      tableName,
      sql,
      params,
      options,
    ) {
      observedReadContracts.push({
        purpose: options.readAuthority?.purpose || null,
        mode: options.authoritativeReadMode,
        allowSqlFallback: options.allowSqlFallback,
        preferOwnerRpcReadLeader: options.preferOwnerRpcReadLeader,
        requireOwnerRpcReadLeader: options.requireOwnerRpcReadLeader,
        requireOwnerRpcRead: options.requireOwnerRpcRead,
      });
      return executeAuthoritativeOwnerRpcRead(
        ownerRpcService,
        tableName,
        sql,
        params,
        options,
        {},
      );
    },
  };
  const authoritativeView = new AuthoritativeControlPlaneView({
    nodeId: 'joining-node',
    cdcIntegrationService,
    pressureGovernor: {
      configure: () => {},
      admit: async () => ({action: 'admit'}),
    },
  });
  const host = Object.create(
    NodeJoiningOperationLedgerFormationReadiness.prototype,
  );
  host.now = () => Date.now();
  host.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      getAuthoritativeControlPlaneView: () => authoritativeView,
    },
  };

  const formationObservation =
    await host.getOperationLedgerFormationPlacementObservation(
      PARTITION_ID,
      TARGET_REPLICAS,
    );
  t.equal(formationObservation.complete, true,
    'the formation consumer reaches the pre-ready canonical services owner');
  t.equal(formationObservation.settledSpreadComplete, true,
    'the owner answer, not a downstream projection, releases spread');
  t.same(
    observedReadContracts.map((contract) => contract.purpose),
    [CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL],
    'formation preserves readiness-owner purpose through the view and CDC');
  t.equal(ordinaryReadinessEvaluationCount, 0,
    'the readiness-owned read does not re-enter readiness adjudication');

  const hostileReadAuthority = {
    purpose: 'ordinary',
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
    preferOwnerRpcReadLeader: false,
    requireOwnerRpcReadLeader: false,
  };
  await authoritativeView.readReadinessOwnerRows(
    TABLES.SERVICES,
    `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ?`,
    [PARTITION_ID],
    {
      allowSqlFallback: true,
      preferOwnerRpcReadLeader: false,
      requireOwnerRpcReadLeader: false,
      readPurpose: 'ordinary',
      readAuthority: hostileReadAuthority,
    },
  );
  t.same(
    observedReadContracts.map((contract) => contract.purpose),
    [
      CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
      CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
    ],
    'the named readiness-owner API cannot be weakened by caller options',
  );
  t.same(
    observedReadContracts[1],
    {
      purpose: CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
      mode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      allowSqlFallback: false,
      preferOwnerRpcReadLeader: true,
      requireOwnerRpcReadLeader: true,
      requireOwnerRpcRead: true,
    },
    'the named API owns the complete authority and fallback contract',
  );

  const ordinaryResult = await authoritativeView.readRows(
    TABLES.SERVICES,
    `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ?`,
    [PARTITION_ID],
    {
      allowSqlFallback: false,
      preferOwnerRpcReadLeader: true,
    },
  );
  t.equal(ordinaryResult.success, false,
    'the same route remains closed to an ordinary read during recovery');
  t.equal(ordinaryReadinessEvaluationCount > 0, true,
    'ordinary routing still consults the readiness owner');

  const followerServiceRow = {
    ...ownerServiceRow,
    service_id: 'services-follower-replica',
    replica_id: 'services-follower-replica',
    node_id: 'services-follower',
    address: `services-follower/partition/${ownerPartitionId}`,
    raft_role: RAFT_ROLE.FOLLOWER,
  };
  serviceRows.push(followerServiceRow);
  const pinnedFollowerSession = 'readiness-owner-pinned-follower';
  queryExecutor.setSessionPartitionAddress(
    pinnedFollowerSession,
    ownerPartitionId,
    followerServiceRow.address,
  );
  const pinnedFollowerResult =
    await authoritativeView.readReadinessOwnerRows(
      TABLES.SERVICES,
      `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ?`,
      [PARTITION_ID],
      {queryOptions: {sessionId: pinnedFollowerSession}},
    );
  t.equal(pinnedFollowerResult.success, true,
    'an old follower session pin cannot displace the canonical leader');
  t.equal(
    ownerReadDeliveryAddresses.at(-1),
    ownerServiceRow.address,
    'leader-required routing ignores follower session affinity',
  );

  const deliveriesBeforeMissingLeader = ownerReadDeliveryCount;
  ownerPartitionRow.leader_node_id = 'missing-leader';
  ownerServiceRow.raft_role = RAFT_ROLE.FOLLOWER;
  const missingLeaderResult = await authoritativeView.readReadinessOwnerRows(
    TABLES.SERVICES,
    `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ?`,
    [PARTITION_ID],
    {readAuthority: hostileReadAuthority},
  );
  t.equal(missingLeaderResult.success, false,
    'a live follower cannot replace missing canonical leader authority');
  t.equal(ownerReadDeliveryCount, deliveriesBeforeMissingLeader,
    'leader-required routing never sends the owner read to the follower');

  ownerPartitionRow.leader_node_id = nodeId;
  ownerServiceRow.raft_role = RAFT_ROLE.LEADER;
  ownerReadResponse = {
    acknowledged: true,
    success: true,
    rows: placementRows,
  };
  const missingWitnessResult = await authoritativeView.readReadinessOwnerRows(
    TABLES.SERVICES,
    `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ?`,
    [PARTITION_ID],
  );
  t.equal(missingWitnessResult.success, false,
    'an ACK without a current Raft leader witness cannot release formation');
  t.same(missingWitnessResult.rows, [],
    'unwitnessed owner rows are discarded instead of becoming evidence');
  t.end();
});
