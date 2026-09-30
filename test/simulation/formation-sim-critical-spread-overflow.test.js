// Prototype: the 2026-09-16 pre-ADD state on the real node hosts; does the
// seed's real planner retain the spread-cure ADD at 4 voters on 2 nodes?
import assert from 'node:assert/strict';
import process from 'node:process';
import fs from 'node:fs';
const trace = (line) => fs.appendFileSync(process.env.SIM_TRACE || '/dev/null', `${line}\n`);
import {test} from 'node:test';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {TABLES} from '../../src/constants/index.js';
import {EntityType, ReplicaStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {runOnExecutionNode} from '../../src/diagnostics/formation-turn-attribution.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {
  createNodeEntry, initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';
import {
  createPriorityPartitionRebalancer, createSimulatedNodeHosts, seedNodeRows,
} from './formation-sim-node-hosts.js';
import {PartitionService, RaftRole} from '../../src/partition/partition-service.js';
import {LifecycleController} from '../../src/bootstrap/lifecycle-controller.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS, LIFECYCLE_DEPENDENCY_DEMOTION_POLICY,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {hasPriorityRecoverySpreadGap} from '../../src/control-plane/priority-recovery-planning-intent.js';
import {stubGrantedLearnerPromotionProof} from '../partition/partition-service-test-support.js';

const START_MS = Date.UTC(2026, 8, 16, 3, 40, 0);
const NODE_IDS = Object.freeze(['node-0', 'node-1', 'node-2', 'node-3', 'node-4']);
const SEED = 'node-0';

// Placement at +304 s of the 09-16 run (run 35052200699), reconstructed from
// its coordinator operation log: every ADD/REPLACE completed and every REMOVE
// completed by then is applied; the ADD of sql_write_operations-p1 r5 had
// completed (+303.0) and its REMOVE of r2 had not (+304.7).
const PLACEMENT = Object.freeze({
  'control_plane_publications': [['r1', SEED, 'leader'], ['r4', 'node-3', 'follower'],
    ['r5', 'node-2', 'follower']],
  'replica_operations': [['r1', SEED, 'leader'],
    ['replace-replica-804a44382c8f7676e0f5d04aed17f26e', 'node-1', 'follower'],
    ['r4', 'node-3', 'follower']],
  'schema_operations': [['r1', SEED, 'leader'], ['r2', SEED, 'follower'],
    ['r3', SEED, 'follower'], ['r4', 'node-3', 'follower']],
  'sql_transaction_participants': [['r1', SEED, 'leader'], ['r2', SEED, 'follower'],
    ['r3', SEED, 'follower'], ['r4', 'node-3', 'follower'], ['r5', 'node-2', 'follower']],
  'sql_transactions': [['r1', SEED, 'leader'], ['r2', SEED, 'follower'],
    ['r3', SEED, 'follower'], ['r4', 'node-3', 'follower']],
  'sql_write_operations': [['r1', SEED, 'leader'], ['r2', SEED, 'follower'],
    ['r3', SEED, 'follower'], ['r4', 'node-3', 'follower'], ['r5', 'node-2', 'follower']],
});

// Every live node registered a storage budget; the admission filter refuses a
// node without one.
function seedNodeBudgets(hosts, nowMs) {
  for (const nodeId of NODE_IDS) {
    hosts.cache.applySystemTableChange(TABLES.NODES, 'UPDATE', createNodeEntry(nodeId, {
      last_heartbeat: nowMs, ready_lease_expires_at: nowMs + 30000, created_at: nowMs,
      storage_budget_bytes: 10 * 1024 * 1024 * 1024,
    }, nowMs));
  }
}

// The committed membership publication the live seed reported at +285 s
// (epoch 2, all five nodes published active, none missing).
function seedPublication(hosts, nowMs) {
  const all = JSON.stringify(NODE_IDS);
  hosts.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'INSERT', {
    publication_id: 'cluster_membership-2', publication_kind: 'cluster_membership',
    publication_epoch: 2, publisher_node_id: SEED, source_topology_epoch: 2,
    source_snapshot_version: 2, published_active_node_ids: all, required_ack_node_ids: all,
    acknowledged_node_ids: all, priority_partition_summary: null,
    membership_lifecycle_summary: null, status: 'PUBLISHED', reason_code: null,
    created_at: nowMs - 60000, updated_at: nowMs - 30000, published_at: nowMs - 30000,
    closed_at: null, transition_history: '[]',
  });
}

function seedPlacement(hosts, nowMs) {
  for (const [tableId, replicas] of Object.entries(PLACEMENT)) {
    const partitionId = `${tableId}-p1`;
    hosts.cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: partitionId, table_id: tableId, replica_count: 3,
      leader_node_id: SEED, created_at: nowMs,
    });
    for (const [suffix, nodeId, role] of replicas) {
      hosts.cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        service_id: suffix.startsWith('replace-') ? suffix : `${partitionId}-${suffix}`,
        replica_id: suffix.startsWith('replace-') ? suffix : `${partitionId}-${suffix}`,
        partition_id: partitionId, node_id: nodeId, service_type: EntityType.PARTITION,
        status: ReplicaStatus.ACTIVE, raft_role: role, address: `${nodeId}:9000`,
        created_at: nowMs,
      });
    }
  }
}

test('prototype: the seed planner on the 09-16 pre-ADD placement', async () => {
  trace('phase: start');
  initializeTestEnvironment();
  const network = createVirtualNetwork({random: new SeededRandomSource({seed: 16}),
    startMs: START_MS});
  for (const nodeId of NODE_IDS) network.registerNode(nodeId, () => {});
  const hosts = new Map();
  for (const [index, nodeId] of NODE_IDS.entries()) {
    const node = runOnExecutionNode(nodeId, () => createSimulatedNodeHosts({network, nodeId,
      randomSource: new SeededRandomSource({seed: 1600 + index})}));
    runOnExecutionNode(nodeId, () => seedNodeRows(node, NODE_IDS));
    runOnExecutionNode(nodeId, () => seedNodeBudgets(node, node.now()));
    runOnExecutionNode(nodeId, () => seedPlacement(node, node.now()));
    if (process.env.SIM_PUBLICATION) runOnExecutionNode(nodeId, () => seedPublication(node, node.now()));
    hosts.set(nodeId, node);
  }
  const seed = hosts.get(SEED);
  // At +304 s the seed led every system partition, so its authoritative reads
  // were answered by its own leader replicas. No partition service is hosted
  // here, so the seed's own rows answer them (a stated harness seam).
  seed.controlPlaneSystemTableGateway.readAuthoritativeRows = async (tableName, sql, params = []) => {
    const result = await seed.sqlQueryEngine.executeQuery(sql || `SELECT * FROM ${tableName}`, params);
    return {success: true, source: 'owner_rpc_lane', rows: result.rows || []};
  };
  const rebalancer = runOnExecutionNode(SEED, () =>
    createPriorityPartitionRebalancer(seed, 'schema_operations'));
  const lines = [];
  const recorder = (level) => (msg, fields) => lines.push({level, msg, fields});
  const logger = {info: recorder('info'), warn: recorder('warn'), error: recorder('error'),
    debug: recorder('debug')};
  rebalancer.logger = logger;
  if (rebalancer.movePlanner) rebalancer.movePlanner.logger = logger;
  trace('phase: hosts seeded');
  runOnExecutionNode(SEED, () => rebalancer.setLeader(true));
  trace('phase: leader set');
  const flush = async () => {
    for (let turn = 0; turn < 8; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  const wallStart = process.hrtime.bigint();
  for (let step = 0; step < Number(process.env.SIM_STEPS || 200); step += 1) {
    if (step < 3) trace(`phase: step ${step} begin`);
    let ran;
    try {
      ran = network.run({untilMs: network.now() + 50, maxSteps: 20000});
    } catch (error) {
      console.log(`step ${step} run failed: ${error.message}`);
      const recent = network.getRecords().slice(-12);
      for (const record of recent) console.log('  recent', JSON.stringify(record).slice(0, 300));
      break;
    }
    if (step < 3) trace(`phase: step ${step} ran ${ran.steps}`);
    await flush();
    if (step < 3) trace(`phase: step ${step} flushed`);
    if (step % 20 === 0) {
      trace(`step ${step} virt=${network.now() - START_MS} events=${ran.steps} ` +
        `pending=${network.pendingEventCount()} wallMs=${Number(process.hrtime.bigint() - wallStart) / 1e6}`);
    }
  }
  const seen = new Map();
  for (const line of lines) {
    const key = `${line.level} ${line.msg}`;
    if (!seen.has(key)) seen.set(key, {count: 0, first: line.fields});
    seen.get(key).count += 1;
  }
  for (const [key, value] of seen) {
    console.log(`x${value.count} ${key} ${JSON.stringify(value.first).slice(0, 600)}`);
  }
  const ops = [...seed.rebalanceCoordinator.operations?.values?.() ?? []];
  console.log('operations', ops.length, JSON.stringify(ops.map((op) => [op.type, op.partitionId,
    op.targetNodeId, op.status])).slice(0, 800));
  runOnExecutionNode(SEED, () => rebalancer.setLeader(false));
  const addRow = (seed.cache.getAll('replica_operations') || [])
    .find((row) => row.type === 'ADD' && row.partition_id === 'schema_operations-p1');
  trace(`add row ${JSON.stringify(addRow && [addRow.operation_id, addRow.replica_id, addRow.target_node_id, addRow.status, addRow.workflow_step])}`);
  if (addRow) {
    const targetId = addRow.target_node_id;
    const target = hosts.get(targetId);
    // Cross-node delivery is CDC's; the virtual network hosts no cache
    // replication, so the coordinator's row and the learner's own services row
    // reach the target node's cache as scenario data (a stated seam).
    // SIM_LEARNER_VIEW: what the learner node's own cache holds of the priority
    // placement - 'full' (every row, as the seed has), 'no-services' (none of
    // the other replicas' services rows), 'no-partitions' (no partitions rows).
    const view = process.env.SIM_LEARNER_VIEW || 'full';
    runOnExecutionNode(targetId, () => {
      for (const [tableId, replicas] of Object.entries(PLACEMENT)) {
        const partitionId = `${tableId}-p1`;
        if (view === 'no-partitions' || view === 'none') {
          target.cache.applySystemTableChange(TABLES.PARTITIONS, 'DELETE', {partition_id: partitionId});
        }
        if (view === 'no-services' || view === 'none') {
          for (const [suffix] of replicas) {
            const id = suffix.startsWith('replace-') ? suffix : `${partitionId}-${suffix}`;
            target.cache.applySystemTableChange(TABLES.SERVICES, 'DELETE', {service_id: id});
          }
        }
      }
    });
    trace(`learner view ${view}`);
    // SIM_JOINER_STATUS: the node status the learner node's cache holds for the
    // joiners that host no priority replica yet (node-1, node-2, node-4).
    const joinerStatus = process.env.SIM_JOINER_STATUS || '';
    if (joinerStatus) {
      runOnExecutionNode(targetId, () => {
        const affected = process.env.SIM_STATUS_NODES === 'all' ? NODE_IDS : ['node-1', 'node-2', 'node-4'];
        for (const nodeId of affected) {
          const row = target.cache.get(TABLES.NODES, nodeId);
          target.cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {...row, status: joinerStatus});
        }
      });
      trace(`joiner status ${joinerStatus}`);
    }
    runOnExecutionNode(targetId, () => {
      target.cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {...addRow});
      target.cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        service_id: addRow.replica_id, replica_id: addRow.replica_id,
        partition_id: 'schema_operations-p1', node_id: targetId,
        service_type: EntityType.PARTITION, status: 'syncing', raft_role: 'learner',
        address: `${targetId}:9000`, created_at: target.now(),
      });
    });
    const readinessState = new LifecycleController({now: target.now});
    const health = target.controlPlaneReadinessService
      .getPriorityControlPlaneRecoveryHealthSync(SEED, target.now());
    readinessState.setDependency('priority_control_plane_recovery', health?.healthy === true, {
      reasonCode: health?.reasonCode, details: health?.details,
      classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
      demotionPolicy: LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.IMMEDIATE,
    });
    const snapshot = readinessState.evaluate();
    const seedProjected = target.controlPlaneReadinessService.getPriorityRecoveryPlanningAnswerSync(SEED, target.now());
    trace(`seed-projected summary ${JSON.stringify(seedProjected?.priorityPartitionSummary || null).slice(0, 500)}`);
    trace(`health detail ${JSON.stringify(health).slice(0, 700)}`);
    trace(`learner node ${targetId} readiness ${JSON.stringify({phase: snapshot.phase, reasons: snapshot.reasons, healthy: health?.healthy, reasonCode: health?.reasonCode})}`);
    const deferrals = [];
    const partition = runOnExecutionNode(targetId, () => new PartitionService({
      partitionId: 'schema_operations-p1', tableId: 'schema_operations', tableName: 'schema_operations',
      replicaId: addRow.replica_id, replicaIds: [addRow.replica_id], nodeId: targetId,
      dbPath: ':memory:', isJoiningExistingGroup: true, systemTableCache: target.cache,
      rebalanceCoordinator: target.rebalanceCoordinator,
      metadataPublicationReadinessState: readinessState,
    }));
    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'schema_operations-p1-r1';
    partition.logger = {info: (msg, fields) => deferrals.push({msg, fields}), warn() {}, error() {}, debug() {}};
    stubGrantedLearnerPromotionProof(partition);
    await runOnExecutionNode(targetId, () => partition.checkLearnerPromotion());
    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
    for (const entry of deferrals) trace(`learner ${entry.msg} ${JSON.stringify(entry.fields).slice(0, 300)}`);
    trace(`learner role after check: ${partition.role}`);
    // The guard rechecks every second; with the view unchanged it answers the same.
    let refusals = 0;
    for (let recheck = 0; recheck < 10 && partition.role === RaftRole.LEARNER; recheck += 1) {
      deferrals.length = 0;
      network.run({untilMs: network.now() + 1000});
      await flush();
      await runOnExecutionNode(targetId, () => partition.checkLearnerPromotion());
      if (partition.learnerPromotionTimer) {
        clearTimeout(partition.learnerPromotionTimer);
        partition.learnerPromotionTimer = null;
      }
      if (deferrals.some((entry) => entry.fields?.reason === 'would_exceed_target_replica_count')) refusals += 1;
    }
    trace(`rechecks refused ${refusals} role ${partition.role}`);
    const planning = partition.getPriorityRecoveryPlanningSnapshotForLearnerPromotion();
    const summary = planning?.priorityPartitionSummary || null;
    trace(`learner planning present=${Boolean(planning)} summaryPresent=${Boolean(summary)} spreadGap=${hasPriorityRecoverySpreadGap(summary)} pendingReason=${partition.isPriorityRecoveryPendingForLearnerPromotion()}`);
    trace(`learner summary ${JSON.stringify(summary).slice(0, 1200)}`);
    const completion = partition.resolvePriorityRecoveryCompletionForLearnerPromotion({
      targetReplicaCount: 3, activeVoterCount: 4, learnerCount: 1});
    trace(`learner completion ${JSON.stringify(completion)}`);
    trace(`learner opContexts ${JSON.stringify(partition.getPriorityRecoveryOperationContextsForLearnerPromotion()).slice(0, 600)}`);
    // Variant: the learner node's cache sees every node's ready lease as
    // incomplete (the live rebalancer reported all five unready throughout).
    const leaseMode = process.env.SIM_LEASE_MODE || 'expired';
    runOnExecutionNode(targetId, () => {
      for (const nodeId of NODE_IDS) {
        const row = target.cache.get(TABLES.NODES, nodeId);
        const lease = leaseMode === 'missing' ? null : target.now() - 1000;
        target.cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {...row, ready_lease_expires_at: lease});
      }
    });
    for (let turn = 0; turn < 3; turn += 1) {
      network.run({untilMs: network.now() + 300});
      await flush();
    }
    partition.role = RaftRole.LEARNER;
    deferrals.length = 0;
    await runOnExecutionNode(targetId, () => partition.checkLearnerPromotion());
    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
    for (const entry of deferrals) trace(`variant learner ${entry.msg} ${JSON.stringify(entry.fields).slice(0, 300)}`);
    trace(`variant role after check: ${partition.role}`);
    const planning2 = partition.getPriorityRecoveryPlanningSnapshotForLearnerPromotion();
    const summary2 = planning2?.priorityPartitionSummary || null;
    trace(`variant planning present=${Boolean(planning2)} summaryPresent=${Boolean(summary2)} spreadGap=${hasPriorityRecoverySpreadGap(summary2)} pendingReason=${partition.isPriorityRecoveryPendingForLearnerPromotion()}`);
    trace(`variant summary ${JSON.stringify(summary2).slice(0, 900)}`);
    trace(`variant completion ${JSON.stringify(partition.resolvePriorityRecoveryCompletionForLearnerPromotion({
      targetReplicaCount: 3, activeVoterCount: 4, learnerCount: 1}))}`);
  }
  for (const line of lines) {
    if (line.level === 'error' || line.level === 'warn' || /operation|Executing/u.test(line.msg)) {
      trace(`${line.level} ${line.msg} ${JSON.stringify(line.fields).slice(0, 300)}`);
    }
  }
  trace(`operations ${JSON.stringify(ops.map((op) => [op.type, op.partitionId, op.targetNodeId, op.status, op.workflowStep]))}`);
  trace(`seed replica_operations ${JSON.stringify(seed.cache.getAll('replica_operations')).slice(0, 1500)}`);
  trace(`seed storage_reservations ${JSON.stringify(seed.cache.getAll('storage_reservations')).slice(0, 400)}`);
  trace(`resources ${JSON.stringify(process.getActiveResourcesInfo())}`);
  for (const handle of process._getActiveHandles()) {
    trace(`handle ${handle.constructor?.name} ${handle._idleTimeout ?? ''} ${String(handle._onTimeout ?? '').slice(0, 160).replace(/\n/gu, ' ')}`);
  }
  assert.ok(true);
});
