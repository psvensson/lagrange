// Actual lease/lifecycle and placement owners over conditional SQLite NODES
// writes and the existing native Raft + committed placement-ledger fixture.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {NODES_SCHEMA} from '../../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from '../../../src/bootstrap/system-table-schema-sql.js';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {CDC_OPERATION, NODE_STATE, SERVICE_STATUS, STATE, TABLES, WORKFLOW_STEP} from
  '../../../src/constants/index.js';
import {DEFAULT_READY_LEASE_MS} from '../../../src/control-plane/control-plane-constants.js';
import {HeartbeatService} from '../../../src/control-plane/heartbeat-service.js';
import {LeaseService} from '../../../src/control-plane/lease-service.js';
import {NodeLifecyclePublication, NODE_LIFECYCLE_PUBLICATION_OUTCOME} from
  '../../../src/control-plane/node-lifecycle-publication.js';
import {NodeReadyLeaseAuthority} from '../../../src/control-plane/node-ready-lease-authority.js';
import {SERVE_ELIGIBILITY_STATE, ServeEligibilityOwner} from
  '../../../src/control-plane/serve-eligibility-owner.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {attachReplicaPlacementOwner} from '../../../src/rebalancer/replica-placement-owner.js';
import {OperationType, ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {TEST_BOOT_INCARNATION as BOOT} from '../../test-helpers/boot-incarnation-fixture.js';
import {commitLedgerStatement, ledgerRows, onLedgerLeader, watchEntryCommitted} from
  '../../partition/placement-admission-fixture.js';
import {applyCommitted} from '../../test-helpers/participant-transaction-fixture.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME, RAFT_MEMBERSHIP_OPERATION,
  addLearnerReplicaToCluster, appliedStateOf, createFoundingCluster, leaderOf,
  peerIdOf, reserveAndAdmitGroupLearner, settleCluster, turnChainValue,
} from './founding-growth-test-support.js';

const PARTITION = 'contexts-p1';
const SEED = 'node-seed';
const TARGET = 'node-target';
const SEED_REPLICA = `${PARTITION}-r1`;
const START_MS = 1_000_000;
const EPOCH = 7;
const STAGGER_MS = Math.floor(DEFAULT_READY_LEASE_MS / 2);
const TARGET_DEADLINE = START_MS + DEFAULT_READY_LEASE_MS - STAGGER_MS;
const OWNER_OBSERVATION_BOUND_MS = 5000;
const FORMATION = Object.freeze({
  publication_id: 'cluster_formation', publication_kind: 'cluster_formation',
  publication_epoch: EPOCH, publisher_node_id: SEED, status: 'FORMED',
  updated_at: START_MS, created_at: START_MS,
  formation_record: JSON.stringify({
    version: 1, status: 'FORMED', clusterId: 'formation-placement-lease-authority',
    declaredHostCount: 3, declaredByNodeId: SEED, declaredAt: START_MS - 1,
    formedAt: START_MS, formedByNodeId: SEED, formedPublicationEpoch: EPOCH,
    formedHostIds: [`host-${SEED}`, `host-${TARGET}`, 'host-former'],
    formedReadyNodeIds: [SEED, TARGET, 'node-former'], priorityPartitionVoters: {},
  }),
});
const MEMBERSHIP = Object.freeze({
  publication_id: `cluster_membership-${EPOCH}`, publication_kind: 'cluster_membership',
  publication_epoch: EPOCH, publisher_node_id: SEED, status: 'PUBLISHED',
  created_at: START_MS, updated_at: START_MS,
  published_active_node_ids: JSON.stringify([SEED, TARGET]),
  required_ack_node_ids: JSON.stringify([SEED, TARGET]),
  acknowledged_node_ids: JSON.stringify([SEED, TARGET]),
  priority_partition_summary: null,
});

function initializeRuntimeFixture() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function seedCommittedRows(db) {
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  const insert = db.prepare(
    'INSERT INTO nodes (node_id, node_address, host_id, cpu_cores, memory_mb, disk_gb, ' +
    'status, connection_state, boot_incarnation, created_at, last_heartbeat, ' +
    'ready_lease_expires_at) VALUES (?, ?, ?, 1, 1024, 1, ?, ?, ?, ?, ?, ?)',
  );
  for (const [node, heartbeat] of [[SEED, START_MS], [TARGET, START_MS - STAGGER_MS]]) {
    insert.run(node, `${node}:8080`, `host-${node}`, NODE_STATE.ACTIVE, STATE.READY,
      BOOT, heartbeat, heartbeat, heartbeat + DEFAULT_READY_LEASE_MS);
  }
}

function prepareCommittedNodeUpdate(db, predicate, updates) {
  const fields = Object.keys(updates);
  const conditions = Object.entries(predicate);
  // The owner supplies the exact CAS. This persistence fixture applies it
  // to real SQLite and reports the actual changes, without changing scope.
  const sql = 'UPDATE nodes SET ' + fields.map((field) => `${field} = ?`).join(', ') +
    ' WHERE ' + conditions.map(([field]) => `${field} IS ?`).join(' AND ');
  return db.prepare(sql).run(...fields.map((field) => updates[field]),
    ...conditions.map(([, value]) => value));
}

async function waitForCommittedNode(authority, applicable) {
  const arrived = Promise.withResolvers();
  function inspect() {
    const answer = authority.answerCommittedNodes();
    if (answer.state === SERVE_ELIGIBILITY_STATE.READY &&
      answer.nodeRows.some((row) => row.node_id === TARGET && applicable(row))) {
      arrived.resolve();
    }
  }
  const detach = authority.subscribe(inspect);
  const timer = setTimeout(() => arrived.reject(new Error(
    'committed node notification did not reach the existing owner')), OWNER_OBSERVATION_BOUND_MS);
  try {
    inspect();
    await arrived.promise;
  } finally {
    clearTimeout(timer);
    detach();
  }
}

function openPlacementNodes(clock, cache, cluster) {
  const db = new Database(':memory:');
  seedCommittedRows(db);
  const now = clock.now.bind(clock);
  const leaseAuthority = NodeReadyLeaseAuthority.fromConfiguration();
  const readCommitted = async (table, sql, params) => ({
    success: true,
    rows: table === TABLES.NODES ? db.prepare(sql).all(...params) : [MEMBERSHIP, FORMATION],
    rowSetComplete: true,
  });
  const authority = new ServeEligibilityOwner({
    now,
    readTimeoutMs: DEFAULT_READY_LEASE_MS,
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    isNodeLoadReady: () => true,
    readCommittedRows: readCommitted,
  });
  let gate = null;
  let targetTransport = STATE.CONNECTED;
  const mutations = [];
  const nodeRow = () => db.prepare('SELECT * FROM nodes WHERE node_id = ?').get(TARGET);
  function notifyCommittedTarget() {
    authority.noteSourceChange(TABLES.NODES, nodeRow());
  }
  const gateway = {
    readRows: readCommitted,
    async updateSystemTableRow(table, predicate, updates) {
      assert.equal(table, TABLES.NODES);
      const disconnect = updates.connection_state === STATE.DISCONNECTED;
      if (disconnect && gate) {
        gate.entered.resolve();
        await gate.release.promise;
      }
      const result = prepareCommittedNodeUpdate(db, predicate, updates);
      mutations.push({predicate, updates, affectedRows: result.changes});
      if (result.changes > 0 && predicate.node_id === TARGET) notifyCommittedTarget();
      return {success: true, partitionResult: {affectedRows: result.changes}};
    },
  };
  const lifecycle = new NodeLifecyclePublication({gateway, leaseAuthority, now});
  const heartbeat = new HeartbeatService({
    nodeId: SEED, bootIncarnation: BOOT, controlPlaneSystemTableGateway: gateway,
    systemTableCache: cache, now,
  });
  const sweeper = new LeaseService({
    nodeId: SEED, nodeLeaseOwner: heartbeat, readyLeaseAuthority: leaseAuthority,
    systemTableCache: cache, controlPlaneSystemTableGateway: gateway, timeSource: clock,
    messageGroupServices: new Set([{isLeaderReplica: () => leaderOf(cluster) === SEED_REPLICA}]),
    messageRouter: {
      getConnectionState(nodeId) {
        return nodeId === TARGET ? targetTransport : STATE.CONNECTED;
      },
    },
  });
  sweeper.initialize();
  return {
    authority, nodeRow, mutations,
    readAuthoritativeNodes: (sql, params) => readCommitted(TABLES.NODES, sql, params),
    waitForCommittedTarget: (applicable) => waitForCommittedNode(authority, applicable),
    goPastExpiry() {
      clock.advance(TARGET_DEADLINE - now() + 1);
    },
    sweep(state) {
      targetTransport = state;
      sweeper.start();
      return sweeper.sweepExpiredLeases();
    },
    holdDisconnect() {
      gate = {entered: Promise.withResolvers(), release: Promise.withResolvers()};
      return gate;
    },
    async renew(bootIncarnation = BOOT) {
      const result = await lifecycle.publish({
        nodeId: TARGET, bootIncarnation, state: STATE.READY, heartbeatAt: now(),
      });
      assert.equal(result.outcome,
        NODE_LIFECYCLE_PUBLICATION_OUTCOME.APPLIED, JSON.stringify(result));
    },
    publishNewBootAtSameWatermark() {
      // Adversarial input at the committed storage boundary. Preserve the
      // old two timestamps so only the boot identity can fence the old CAS.
      const changed = db.prepare('UPDATE nodes SET boot_incarnation = ? WHERE node_id = ?')
        .run(BOOT + 1, TARGET);
      assert.equal(changed.changes, 1);
      notifyCommittedTarget();
    },
    close() {
      gate?.release.resolve();
      sweeper.stop();
      authority.shutdown();
      db.close();
    },
  };
}

function serviceRow(replicaId, nodeId, role, createdAt = START_MS) {
  return {service_id: replicaId, replica_id: replicaId, partition_id: PARTITION,
    node_id: nodeId, status: SERVICE_STATUS.ACTIVE, raft_role: role, service_type: 'partition',
    created_at: createdAt, state_entered_at: createdAt, updated_at: createdAt,
    cleanup_token: null};
}

function addLearner(cluster, row) {
  addLearnerReplicaToCluster(cluster, SEED_REPLICA, row.replica_id);
  const admitted = reserveAndAdmitGroupLearner(
    cluster.node(SEED_REPLICA),
    {groupId: PARTITION, localReplicaIdentity: SEED_REPLICA},
    {replicaIdentity: row.replica_id, nodeId: row.target_node_id, operationId: row.operation_id},
  );
  assert.equal(admitted.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED);
  const peer = peerIdOf(cluster, SEED_REPLICA, row.replica_id);
  assert.ok(settleCluster(cluster, () =>
    appliedStateOf(cluster, SEED_REPLICA).learners.includes(peer)));
}

function finishLedger(ledger, row, step, status, now) {
  const history = [...JSON.parse(row.steps_history), {
    step, timestamp: now, previousStep: row.workflow_step,
  }];
  assert.equal(commitLedgerStatement(ledger, `finish:${row.operation_id}`,
    'UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?, ' +
    'completed_at = ?, steps_history = ? WHERE operation_id = ? AND completed_at IS NULL',
    [step, status, now, now, JSON.stringify(history), row.operation_id]), null);
}

async function withPlacementLeaseAuthority(measure, {
  createCluster = createFoundingCluster,
} = {}) {
  initializeRuntimeFixture();
  const clock = new VirtualTimeSource({startMs: START_MS});
  const cluster = createCluster([SEED_REPLICA], {partitionId: PARTITION});
  const cache = new SystemTableCache({
    timeSource: clock, scheduleCacheChangeNotification: queueMicrotask,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    partition_id: PARTITION, status: SERVICE_STATUS.ACTIVE,
    leader_node_id: SEED, replica_count: 3,
  });
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT,
    serviceRow(SEED_REPLICA, SEED, RAFT_ROLE.LEADER));
  const nodes = openPlacementNodes(clock, cache, cluster);
  try {
    assert.ok(settleCluster(cluster, () => leaderOf(cluster) === SEED_REPLICA));
    await nodes.authority.readServeEligibility();
    assert.equal(nodes.authority.answerCommittedNodes().state, SERVE_ELIGIBILITY_STATE.READY);
    await onLedgerLeader(async (ledger) => {
      ledger.controllablePort.setProposeHandler(async (entry) => {
        assert.equal(applyCommitted(ledger, entry), null);
      });
      const actions = watchEntryCommitted(ledger);
      const attachment = attachReplicaPlacementOwner({
        nodeId: SEED, ledgerPartitionService: ledger, nodeAuthority: nodes.authority,
        systemTableCache: cache, logger: ledger.logger, now: clock.now.bind(clock),
      });
      const {owner} = attachment;
      function finishAdd(row) {
        addLearner(cluster, row);
        cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT,
          serviceRow(row.replica_id, TARGET, RAFT_ROLE.LEARNER, row.created_at));
        finishLedger(ledger, row, WORKFLOW_STEP.ACTIVE, SERVICE_STATUS.ACTIVE, clock.now());
      }
      function finishRemove(row) {
        const peer = peerIdOf(cluster, SEED_REPLICA, row.replica_id);
        turnChainValue(cluster.node(SEED_REPLICA).proposeConfChange({
          type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, operationId: row.operation_id,
          replicaIdentity: row.replica_id, nodeId: TARGET,
        }));
        assert.ok(settleCluster(cluster, () =>
          !appliedStateOf(cluster, SEED_REPLICA).learners.includes(peer)));
        const incumbent = cache.get(TABLES.SERVICES, row.replica_id);
        assert.ok(incumbent);
        cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.DELETE, incumbent);
        assert.equal(cache.get(TABLES.SERVICES, row.replica_id), undefined);
        finishLedger(ledger, row, WORKFLOW_STEP.REMOVED, ReplicaStatus.REMOVED, clock.now());
      }
      try {
        await owner.awaitCurrentWorkIdle();
        const [initial] = ledgerRows(ledger);
        assert.equal(initial.type, OperationType.ADD);
        assert.equal(initial.target_node_id, TARGET);
        finishAdd(initial);
        await owner.awaitCurrentWorkIdle();
        await measure({
          owner, ledger, nodes, cluster, initial, actions, clock, finishAdd, finishRemove, cache,
          async observeCommittedPlacement() {
            await nodes.authority.readServeEligibility();
            await owner.awaitCurrentWorkIdle();
          },
        });
      } finally {
        actions.stop();
        attachment.detach();
      }
    });
  } finally {
    nodes.close();
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

export {BOOT, SEED, SEED_REPLICA, TARGET, withPlacementLeaseAuthority};
