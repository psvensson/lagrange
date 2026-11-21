/**
 * Diagnostic witness of the reversal in physical run 57e4db30. It combines
 * the production NODES answer and placement ledger apply with the native
 * Raft membership owner. The fixture controls the renewal's arrival and the
 * workflow's terminal and SERVICES publications, not placement decisions.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {NODES_SCHEMA} from '../../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from '../../../src/bootstrap/system-table-schema-sql.js';
import {CDC_OPERATION, NODE_STATE, SERVICE_STATUS, TABLES, WORKFLOW_STEP} from
  '../../../src/constants/index.js';
import {DEFAULT_READY_LEASE_MS} from '../../../src/control-plane/control-plane-constants.js';
import {SERVE_ELIGIBILITY_STATE, ServeEligibilityOwner} from
  '../../../src/control-plane/serve-eligibility-owner.js';
import {isOccupyingCopy, readPlacementCensus} from
  '../../../src/partition/partition-placement-admission-decision.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {attachReplicaPlacementOwner} from '../../../src/rebalancer/replica-placement-owner.js';
import {PLACEMENT_COPY_CAPACITY, PLACEMENT_DEFICIT_KIND, PLACEMENT_TRIGGER} from
  '../../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType, ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
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
const BOOT = 1;
const EPOCH = 7;
const STAGGER_MS = Math.floor(DEFAULT_READY_LEASE_MS / 2);
const TARGET_DEADLINE = START_MS + DEFAULT_READY_LEASE_MS - STAGGER_MS;
const CASE = Object.freeze({STABLE: 'no-dip', DIP: 'delayed-renewal', LOSS: 'failed-host'});
const FORMATION = Object.freeze({
  publication_id: 'cluster_formation',
  publication_kind: 'cluster_formation',
  publication_epoch: EPOCH,
  publisher_node_id: SEED,
  status: 'FORMED',
  updated_at: START_MS,
  created_at: START_MS,
  formation_record: JSON.stringify({
    version: 1, status: 'FORMED', clusterId: 'placement-reversal-witness',
    declaredHostCount: 3, declaredByNodeId: SEED, declaredAt: START_MS - 1,
    formedAt: START_MS, formedByNodeId: SEED, formedPublicationEpoch: EPOCH,
    formedHostIds: [`host-${SEED}`, `host-${TARGET}`, 'host-former'],
    formedReadyNodeIds: [SEED, TARGET, 'node-former'], priorityPartitionVoters: {},
  }),
});
const MEMBERSHIP = Object.freeze({
  publication_id: `cluster_membership-${EPOCH}`,
  publication_kind: 'cluster_membership',
  publication_epoch: EPOCH,
  publisher_node_id: SEED,
  status: 'PUBLISHED',
  created_at: START_MS,
  updated_at: START_MS,
  published_active_node_ids: JSON.stringify([SEED, TARGET]),
  required_ack_node_ids: JSON.stringify([SEED, TARGET]),
  acknowledged_node_ids: JSON.stringify([SEED, TARGET]),
  priority_partition_summary: null,
});

function openNodes(clock) {
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  const insert = db.prepare(
    'INSERT INTO nodes (node_id, node_address, host_id, cpu_cores, memory_mb, disk_gb, ' +
    'status, connection_state, boot_incarnation, created_at, last_heartbeat, ' +
    'ready_lease_expires_at) VALUES (?, ?, ?, 1, 1024, 1, ?, ?, ?, ?, ?, ?)',
  );
  for (const [node, heartbeat] of [[SEED, START_MS], [TARGET, START_MS - STAGGER_MS]]) {
    insert.run(node, `${node}:8080`, `host-${node}`, NODE_STATE.ACTIVE,
      'connected', BOOT, heartbeat, heartbeat, heartbeat + DEFAULT_READY_LEASE_MS);
  }
  const authority = new ServeEligibilityOwner({
    now: clock.now.bind(clock),
    readTimeoutMs: DEFAULT_READY_LEASE_MS,
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    isNodeLoadReady: () => true,
    readCommittedRows: async (table, sql, params) => ({
      success: true,
      rows: table === TABLES.NODES ? db.prepare(sql).all(...params) : [MEMBERSHIP, FORMATION],
      rowSetComplete: true,
    }),
  });
  const nodeRow = () => db.prepare('SELECT * FROM nodes WHERE node_id = ?').get(TARGET);
  function commitTarget(status, expiresAt) {
    const changed = db.prepare('UPDATE nodes SET status = ?, last_heartbeat = ?, ' +
      'ready_lease_expires_at = ? WHERE node_id = ? AND boot_incarnation = ?')
      .run(status, clock.now(), expiresAt, TARGET, BOOT);
    assert.equal(changed.changes, 1);
    authority.noteSourceChange(TABLES.NODES, nodeRow());
  }
  return {authority, nodeRow, commitTarget, close() {
    authority.shutdown();
    db.close();
  }};
}

function serviceRow(replicaId, nodeId, role) {
  return {service_id: replicaId, replica_id: replicaId, partition_id: PARTITION,
    node_id: nodeId, status: SERVICE_STATUS.ACTIVE, raft_role: role, service_type: 'partition'};
}

function addLearner(cluster, row) {
  addLearnerReplicaToCluster(cluster, SEED_REPLICA, row.replica_id);
  const admitted = reserveAndAdmitGroupLearner(
    cluster.node(SEED_REPLICA),
    {groupId: PARTITION, localReplicaIdentity: SEED_REPLICA},
    {replicaIdentity: row.replica_id, nodeId: row.target_node_id,
      operationId: row.operation_id},
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

function traceOwner(owner) {
  const wakes = [];
  const considered = [];
  const notify = owner.notify.bind(owner);
  owner.notify = (trigger) => {
    wakes.push(trigger);
    return notify(trigger);
  };
  const prepare = owner.preparePassOrderedCandidates.bind(owner);
  owner.preparePassOrderedCandidates = (...args) => {
    const actual = prepare(...args);
    considered.push(...actual.ordered.map((candidate) => ({
      kind: candidate.deficitKind, type: candidate.move.type,
      target: candidate.move.targetNodeId, replicaId: candidate.move.replicaId,
    })));
    return actual;
  };
  return {wakes, considered};
}

function traceSample(label, {nodes, ledger, cluster, clock, learnerId, actions, trace}) {
  const row = nodes.nodeRow();
  const state = appliedStateOf(cluster, SEED_REPLICA);
  const census = readPlacementCensus(ledger.db);
  const copies = census.filter(isOccupyingCopy);
  const sourceCopies = copies.filter((copy) => copy.copySourceNodeId === SEED).length;
  const targetCopies = copies.filter((copy) => copy.targetNodeId === TARGET).length;
  assert.ok(sourceCopies <= PLACEMENT_COPY_CAPACITY.K_SRC);
  assert.ok(targetCopies <= PLACEMENT_COPY_CAPACITY.K_TGT);
  assert.deepEqual(state.voters, [cluster.raftPeerIdOf(SEED_REPLICA)]);
  const sample = {
    label, now: clock.now(), nodeStatus: row.status, bootIncarnation: row.boot_incarnation,
    leaseExpiresAt: row.ready_lease_expires_at,
    committedLearner: learnerId !== null &&
      state.learners.includes(peerIdOf(cluster, SEED_REPLICA, learnerId)),
    voterCount: state.voters.length, sourceCopies, targetCopies,
    dispatchHolds: census.filter((entry) => entry.dispatchHold != null).length,
    ledger: ledgerRows(ledger).map((entry) => ({
      operationId: entry.operation_id, type: entry.type, step: entry.workflow_step,
      replicaId: entry.replica_id, target: entry.target_node_id,
    })),
    committedActions: actions.commands.map((command) => command.type),
    diagnostics: trace.considered.slice(), wakes: trace.wakes.slice(),
  };
  process.stdout.write(`FORMATION_PLACEMENT_REVERSAL ${JSON.stringify(sample)}\n`);
  return sample;
}

async function runCase(mode) {
  const clock = new VirtualTimeSource({startMs: START_MS});
  const nodes = openNodes(clock);
  const cluster = createFoundingCluster([SEED_REPLICA], {partitionId: PARTITION});
  const cache = new SystemTableCache({
    timeSource: clock,
    scheduleCacheChangeNotification: queueMicrotask,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    partition_id: PARTITION, status: SERVICE_STATUS.ACTIVE,
    leader_node_id: SEED, replica_count: 3,
  });
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT,
    serviceRow(SEED_REPLICA, SEED, RAFT_ROLE.LEADER));
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
      const trace = traceOwner(owner);
      const context = {ledger, nodes, cluster, clock, actions, trace, learnerId: null};
      const sample = (label) => traceSample(`${mode}:${label}`, context);
      const refresh = async () => {
        await nodes.authority.readServeEligibility();
        await owner.awaitCurrentWorkIdle();
      };
      try {
        await owner.awaitCurrentWorkIdle();
        const [initial] = ledgerRows(ledger);
        assert.equal(initial.type, OperationType.ADD);
        assert.equal(initial.target_node_id, TARGET);
        assert.equal(sample('copy-admitted').targetCopies, 1);

        context.learnerId = initial.replica_id;
        addLearner(cluster, initial);
        assert.equal(sample('raft-admitted-before-service-publication').committedLearner, true);
        cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT,
          serviceRow(initial.replica_id, TARGET, RAFT_ROLE.LEARNER));
        finishLedger(ledger, initial, WORKFLOW_STEP.ACTIVE, SERVICE_STATUS.ACTIVE, clock.now());
        await owner.awaitCurrentWorkIdle();
        const completed = sample('learner-add-complete');
        assert.equal(completed.targetCopies, 0);
        assert.equal(completed.dispatchHolds, 0);
        assert.equal(completed.ledger.length, 1);
        assert.equal(completed.ledger[0].step, WORKFLOW_STEP.ACTIVE);

        const renew = () => nodes.commitTarget(NODE_STATE.ACTIVE,
          clock.now() + DEFAULT_READY_LEASE_MS);
        clock.advance(TARGET_DEADLINE - START_MS - 1);
        if (mode === CASE.STABLE) {
          renew();
          await refresh();
        }
        if (mode === CASE.LOSS) {
          cluster.isolate(initial.replica_id);
          nodes.commitTarget(NODE_STATE.FAILED, TARGET_DEADLINE);
        }
        clock.advance(2);
        await refresh();
        const dip = sample('past-original-lease');
        assert.equal(dip.bootIncarnation, BOOT);
        assert.equal(dip.committedLearner, true);
        if (mode === CASE.STABLE) {
          assert.ok(dip.leaseExpiresAt > dip.now);
          assert.equal(dip.ledger.length, 1);
          assert.equal(owner.placementResyncAdmissions, 0);
          return;
        }
        assert.ok(dip.leaseExpiresAt < dip.now);
        if (mode === CASE.DIP) {
          assert.equal(dip.nodeStatus, NODE_STATE.ACTIVE);
          assert.equal(dip.ledger.length, 1);
          renew();
          await refresh();
          const renewed = sample('renewal-preserved-original-learner');
          assert.equal(renewed.bootIncarnation, BOOT);
          assert.ok(renewed.leaseExpiresAt > renewed.now);
          assert.equal(renewed.ledger.length, 1);
          assert.equal(renewed.committedLearner, true);
          assert.equal(owner.placementResyncAdmissions, 0);
          return;
        }
        assert.equal(dip.nodeStatus, NODE_STATE.FAILED);
        assert.equal(dip.ledger.length, 2);
        const removal = ledgerRows(ledger).find((row) => row.type === OperationType.REMOVE);
        assert.equal(removal.replica_id, initial.replica_id);
        assert.equal(dip.targetCopies, 0);
        assert.ok(trace.considered.some((record) =>
          record.kind === PLACEMENT_DEFICIT_KIND.DEAD_LEARNER &&
          record.replicaId === initial.replica_id));
        assert.ok(dip.wakes.includes(PLACEMENT_TRIGGER.NODES_OR_FORMATION));

        const learnerPeer = peerIdOf(cluster, SEED_REPLICA, initial.replica_id);
        turnChainValue(cluster.node(SEED_REPLICA).proposeConfChange({
          type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
          operationId: removal.operation_id,
          replicaIdentity: initial.replica_id, nodeId: TARGET,
        }));
        assert.ok(settleCluster(cluster, () =>
          !appliedStateOf(cluster, SEED_REPLICA).learners.includes(learnerPeer)));
        cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.DELETE,
          serviceRow(initial.replica_id, TARGET, RAFT_ROLE.LEARNER));
        finishLedger(ledger, removal, WORKFLOW_STEP.REMOVED, ReplicaStatus.REMOVED, clock.now());
        await owner.awaitCurrentWorkIdle();
        const terminal = sample('remove-terminal');
        assert.equal(terminal.committedLearner, false);
        assert.equal(terminal.dispatchHolds, 0);
        const replacements = terminal.ledger.filter((row) =>
          row.type === OperationType.ADD && row.operationId !== initial.operation_id);
        assert.equal(replacements.length, 0);
        assert.equal(owner.placementResyncAdmissions, 0);
      } finally {
        actions.stop();
        attachment.detach();
      }
    });
  } finally {
    nodes.close();
    cluster.dispose();
  }
}

for (const mode of Object.values(CASE)) {
  test(`formation learner placement reversal: ${mode}`, async () => runCase(mode));
}
