// The critical-spread overflow REPLAY.
//
// The 2026-09-18 static reproduction produced the learner's refusal from a
// synthetic input (a joiner node status the live logs never show), so it was
// a candidate mechanism, not an explanation. This replaces the snapshot with
// a replay: a committed scenario fixture (one live run's own artifacts,
// every entry cited) is driven through the REAL production owners hosted per
// node on the virtual network.
//
// What decides here is never the harness:
//   - the seed's UnifiedRebalancer decides retention (planner);
//   - the seed's RebalanceCoordinator decides admission and writes the
//     terminal row for the outcome the scenario cites (createOperation,
//     completeOperation, failOperation);
//   - the learner node's PartitionService decides the count check.
// The replay applies only the effects live applied: the learner services row
// at the cited CREATE_REPLICA hop, and the voter/removal services row at the
// cited completion. Nothing sets a node status, a planning answer, a summary
// or an overflow budget.
//
// Declared seams (reported in report.seams, never silent):
//   - the SQL engine is the harness cache seam (registry pair
//     sql-engine-cache-membership);
//   - the seed hosts no partition service, so its authoritative row reads
//     are answered from its own cache;
//   - the learner's promotion PROOF is stubbed granted, because the count
//     check under test runs strictly before the proof gate;
//   - virtual time is anchored so the scenario's decision point coincides
//     with wall time: two production readers (PartitionService's planning
//     observedAt, and node liveness grace) read the ambient clock, so a
//     replay anchored at the live epoch would age every replayed lease out
//     and shrink the eligible-node cohort. Only the anchor moves; every
//     interval between cited events is the live one.

import {LifecycleController} from '../../src/bootstrap/lifecycle-controller.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS, LIFECYCLE_DEPENDENCY_DEMOTION_POLICY,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {PartitionService, RaftRole} from '../../src/partition/partition-service.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {TABLES} from '../../src/constants/index.js';
import {EntityType, ReplicaStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {runOnExecutionNode} from '../../src/diagnostics/formation-turn-attribution.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {
  createNodeEntry, initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';
import {
  stubGrantedLearnerPromotionProof,
} from '../partition/partition-service-test-support.js';
import {
  createPriorityPartitionRebalancer, createSimulatedNodeHosts, seedNodeRows,
} from './formation-sim-node-hosts.js';
import {PROMOTION_OUTCOME} from './critical-spread-scenario-extraction.js';

const REPLAY_SCHEMA = 'critical-spread-replay/1';
const MS_PER_SECOND = 1000;
const RANDOM_SEED_BASE = 1600;
const NETWORK_RANDOM_SEED = 16;
const NODE_ADDRESS_SUFFIX = ':9000';
const PARTITION_SUFFIX_PATTERN = /-p\d+$/u;
const INSERT = 'INSERT';
const UPDATE = 'UPDATE';
const DELETE = 'DELETE';
const OPERATION_TYPE_ADD = 'ADD';
const OPERATION_TYPE_REMOVE = 'REMOVE';
const OPERATION_TYPE_REPLACE = 'REPLACE';
const ADD_LIKE_TYPES = Object.freeze(new Set([
  OPERATION_TYPE_ADD, OPERATION_TYPE_REPLACE]));
const COUNT_REFUSAL_REASON = 'would_exceed_target_replica_count';
const EVEN_REFUSAL_REASON = 'would_cause_even_voter_count';
const REFUSAL_REASONS = Object.freeze(new Set([
  COUNT_REFUSAL_REASON, EVEN_REFUSAL_REASON]));
const PROMOTION_DEFERRED_MSG = 'Learner promotion deferred';
// Mirrors BOOTSTRAP_READINESS_DEPENDENCY.PRIORITY_CONTROL_PLANE_RECOVERY in
// src/bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js, which the
// production owner does not export. The replay feeds that one dependency from
// the node's own recovery health, exactly as the evaluator does.
const PRIORITY_RECOVERY_DEPENDENCY = 'priority_control_plane_recovery';
const MEMORY_DB_PATH = ':memory:';
const FLUSH_TURNS = 8;
const MAX_STEPS_PER_SLICE = 20000;
const RUN_SLICE_MS = 50;
const REPLAY_EVENT = Object.freeze({
  OPERATION_CREATED: 'operation-created',
  OPERATION_HANDLED: 'operation-handled',
  OPERATION_ENDED: 'operation-ended',
  PROMOTION_ATTEMPT: 'promotion-attempt',
});
const REPLAY_OUTCOME = Object.freeze({
  ADMITTED: 'admitted',
  REFUSED: 'refused',
});
const DIVERGENCE = Object.freeze({
  OPERATION_NOT_PLANNED:
    'the hosts planner did not create this live operation; the replay created ' +
    'it through the real coordinator',
  OPERATION_CREATE_REFUSED:
    'the real coordinator refused to create this live operation',
  TERMINAL_WRITE_REFUSED:
    'the real coordinator refused to write this live terminal outcome',
});
const SEAMS = Object.freeze([
  'sql-engine-cache-membership: the SQL engine is the harness cache seam',
  'the seed hosts no partition service; its authoritative row reads are ' +
    'answered from its own cache',
  'the learner promotion proof is stubbed granted; the count check under ' +
    'test runs before the proof gate',
  'virtual time is anchored so the scenario decision point coincides with ' +
    'wall time (two production readers use the ambient clock)',
]);

function tableIdOf(partitionId) {
  return String(partitionId || '').replace(PARTITION_SUFFIX_PATTERN, '');
}

function nodeIds(scenario) {
  return scenario.nodes.map((node) => node.nodeId);
}

function seedNodeIdOf(scenario) {
  const seed = scenario.nodes.find((node) => node.isSeed);
  return (seed || scenario.nodes[0]).nodeId;
}

// The decision point: the live moment this scenario exists to re-decide. For
// a run whose learner refused on the count, that is the first count refusal;
// otherwise it is the first promotion the live run granted.
function resolveDecisionAtSeconds(scenario) {
  const refusal = scenario.promotionAttempts
    .find((attempt) => attempt.countRefusal === true);
  if (refusal) return refusal.citation.atSeconds;
  const granted = scenario.promotionAttempts
    .find((attempt) => attempt.outcome === PROMOTION_OUTCOME.GRANTED);
  if (granted) return granted.citation.atSeconds;
  return scenario.operations[0].createdAtSeconds;
}

// The partition whose planner decision the scenario is about: the one whose
// live retention sat one voter above target on fewer nodes than required.
function resolveDecisionPartition(scenario) {
  const retention = scenario.plannerRetentions.find((entry) =>
    entry.prioritySpreadGapOpen === true &&
    entry.activeVoterCount === entry.targetReplicaCount + 1 &&
    entry.activeDistinctNodeCount < entry.targetDistinctNodeCount);
  return retention ? retention.partitionId : null;
}

function buildReplayPlan(scenario, nowMs) {
  const decisionAtSeconds = resolveDecisionAtSeconds(scenario);
  return {
    decisionAtSeconds,
    decisionPartitionId: resolveDecisionPartition(scenario),
    anchorStartMs: nowMs - (decisionAtSeconds * MS_PER_SECOND),
  };
}

function virtualMsOf(plan, atSeconds) {
  return plan.anchorStartMs + (atSeconds * MS_PER_SECOND);
}

function createReplayWorld(scenario, plan) {
  initializeTestEnvironment();
  const network = createVirtualNetwork({
    random: new SeededRandomSource({seed: NETWORK_RANDOM_SEED}),
    startMs: plan.anchorStartMs,
  });
  const ids = nodeIds(scenario);
  for (const nodeId of ids) network.registerNode(nodeId, () => {});
  const hosts = new Map();
  for (const [index, nodeId] of ids.entries()) {
    const host = runOnExecutionNode(nodeId, () => createSimulatedNodeHosts({
      network, nodeId,
      randomSource: new SeededRandomSource({seed: RANDOM_SEED_BASE + index}),
    }));
    runOnExecutionNode(nodeId, () => seedNodeRows(host, ids));
    hosts.set(nodeId, host);
  }
  return {network, hosts, seedNodeId: seedNodeIdOf(scenario), ids};
}

// The seed led every priority partition at the replayed moment, so its
// authoritative reads were answered by its own leader replicas. No partition
// service is hosted for the system tables here (declared seam).
function answerSeedAuthoritativeReadsFromOwnCache(seed) {
  seed.controlPlaneSystemTableGateway.readAuthoritativeRows =
    async (tableName, sql, params = []) => {
      const statement = sql || `SELECT * FROM ${tableName}`;
      const result = await seed.sqlQueryEngine.executeQuery(statement, params);
      return {success: true, rows: result.rows || []};
    };
}

function partitionRowOf(scenario, partition) {
  const leaderRow = scenario.initialPlacement.find((row) =>
    row.replicaId === partition.leaderReplicaId);
  return {
    partition_id: partition.partitionId,
    table_id: tableIdOf(partition.partitionId),
    replica_count: partition.targetReplicaCount,
    leader_node_id: leaderRow ? leaderRow.nodeId : null,
  };
}

function serviceRowOf(row, partition, nowMs) {
  return {
    service_id: row.replicaId,
    replica_id: row.replicaId,
    partition_id: row.partitionId,
    node_id: row.nodeId,
    service_type: EntityType.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: row.replicaId === partition.leaderReplicaId ?
      RaftRole.LEADER : RaftRole.FOLLOWER,
    address: `${row.nodeId}${NODE_ADDRESS_SUFFIX}`,
    created_at: nowMs,
  };
}

function publicationRowOf(scenario, nowMs) {
  const publication = scenario.publication;
  const all = JSON.stringify(publication.publishedActiveNodeIds);
  return {
    publication_id: `${publication.publicationKind}-${publication.publicationEpoch}`,
    publication_kind: publication.publicationKind,
    publication_epoch: publication.publicationEpoch,
    publisher_node_id: publication.publisherNodeId,
    source_topology_epoch: publication.publicationEpoch,
    source_snapshot_version: publication.publicationEpoch,
    published_active_node_ids: all,
    required_ack_node_ids: all,
    acknowledged_node_ids: all,
    priority_partition_summary: null,
    membership_lifecycle_summary: null,
    status: publication.status,
    reason_code: null,
    created_at: nowMs,
    updated_at: nowMs,
    published_at: nowMs,
    closed_at: null,
    transition_history: '[]',
  };
}

// Cross-node delivery is immediate and in write order: the scenario cites no
// lag, so every host sees the seeded rows at once (quest constraint
// "delivery-is-ordered-not-tuned").
function seedScenarioState(world, scenario) {
  for (const nodeId of world.ids) {
    const host = world.hosts.get(nodeId);
    runOnExecutionNode(nodeId, () => {
      const nowMs = host.now();
      for (const capacity of scenario.nodeCapacities) {
        const row = host.cache.get(TABLES.NODES, capacity.nodeId);
        host.cache.applySystemTableChange(TABLES.NODES, UPDATE,
          createNodeEntry(capacity.nodeId, {
            ...(row || {}),
            storage_budget_bytes: capacity.storageBudgetBytes,
            storage_budget_source: capacity.storageBudgetSource,
            storage_budget_updated_at: nowMs,
          }, nowMs));
      }
      for (const partition of scenario.partitions) {
        host.cache.applySystemTableChange(
          TABLES.PARTITIONS, INSERT, partitionRowOf(scenario, partition));
      }
      for (const row of scenario.initialPlacement) {
        const partition = scenario.partitions
          .find((entry) => entry.partitionId === row.partitionId);
        host.cache.applySystemTableChange(
          TABLES.SERVICES, INSERT, serviceRowOf(row, partition, nowMs));
      }
      host.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
        INSERT, publicationRowOf(scenario, nowMs));
    });
  }
  answerSeedAuthoritativeReadsFromOwnCache(world.hosts.get(world.seedNodeId));
}

// The real initiator of every node's own liveness row, started the way the
// node's process starts it (formation-sim-runner does the same). Without it
// no node row is ever refreshed, every ready lease in the replay ages out
// against the ambient clock, and the projected-active cohort collapses to the
// local node - which silently makes any spread "satisfied". Stats are a
// static snapshot: gathering them is host IO, not control-plane behaviour.
const HEARTBEAT_STATS = Object.freeze({
  cpuPercent: 0, memoryPercent: 0, diskPercent: 0});
const HEARTBEAT_CAPABILITIES = Object.freeze([]);

function startNodeHeartbeats(world) {
  for (const nodeId of world.ids) {
    const host = world.hosts.get(nodeId);
    runOnExecutionNode(nodeId, () => host.heartbeatService.start({
      stats: HEARTBEAT_STATS, capabilities: [...HEARTBEAT_CAPABILITIES]}));
  }
}

// Cross-node row delivery, the constraint's default: every row a host writes
// reaches every other host's cache immediately and in write order (on the
// cache's own deferred notification turn, which is production's hop). The
// live cluster had this through CDC; without it only a node's own heartbeat
// row stays fresh, every peer's ready lease ages out against the ambient
// clock, and the projected-active cohort collapses to the local node - which
// silently makes any spread "satisfied".
//
// Only the WRITER's own rows travel, which is what makes the fan-out
// terminate: a node writes its own `nodes` row, and the seed - the cited
// leader of every priority partition in this window - writes the rest. A
// blanket forward instead bounces every delivery back (the receiving cache
// merges the row, so the record it notifies with is no longer byte-identical
// to the one sent), and the resulting storm congests the seed's queue until
// row delivery lags seconds behind the write.
function ownsWrittenRow(world, originNodeId, tableName, record) {
  if (tableName === TABLES.NODES) {
    return record?.node_id === originNodeId;
  }
  return originNodeId === world.seedNodeId;
}

function deliverToPeers(world, originNodeId, tableName, operation, record) {
  if (!ownsWrittenRow(world, originNodeId, tableName, record)) return;
  world.deliveredRowCount += 1;
  for (const peerId of world.ids) {
    if (peerId === originNodeId) continue;
    const peer = world.hosts.get(peerId);
    runOnExecutionNode(peerId, () =>
      peer.cache.applySystemTableChange(tableName, operation, record));
  }
}

function wireImmediateCrossNodeDelivery(world) {
  for (const nodeId of world.ids) {
    const host = world.hosts.get(nodeId);
    host.cache.onCacheChange((tableName, operation, record) =>
      deliverToPeers(world, nodeId, tableName, operation, record));
  }
}

function buildTimeline(scenario) {
  const events = [];
  for (const operation of scenario.operations) {
    events.push({kind: REPLAY_EVENT.OPERATION_CREATED,
      atSeconds: operation.createdAtSeconds, operation});
    const handled = operation.citations.handled;
    if (handled && Number.isFinite(handled.atSeconds)) {
      events.push({kind: REPLAY_EVENT.OPERATION_HANDLED,
        atSeconds: handled.atSeconds, operation});
    }
    if (Number.isFinite(operation.endedAtSeconds)) {
      events.push({kind: REPLAY_EVENT.OPERATION_ENDED,
        atSeconds: operation.endedAtSeconds, operation});
    }
  }
  for (const attempt of scenario.promotionAttempts) {
    events.push({kind: REPLAY_EVENT.PROMOTION_ATTEMPT,
      atSeconds: attempt.citation.atSeconds, attempt});
  }
  return events.sort((left, right) => left.atSeconds - right.atSeconds);
}

async function flushMicrotasks() {
  for (let turn = 0; turn < FLUSH_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function advanceTo(world, untilMs) {
  while (world.network.now() < untilMs) {
    const sliceMs = Math.min(untilMs, world.network.now() + RUN_SLICE_MS);
    world.network.run({untilMs: sliceMs, maxSteps: MAX_STEPS_PER_SLICE});
    await flushMicrotasks();
  }
}

// The coordinator's admission and its persisted row are the owner's; its
// DISPATCH is not replayed, because live already dispatched this operation
// and the scenario cites what came of it. Left on, the coordinator re-sends
// CREATE_REPLICA to hosts that run no replica handler, retries, and rewrites
// the row - undoing the cited terminal outcome with a step nobody observed.
function moveOf(operation) {
  return {
    type: operation.type,
    partitionId: operation.partitionId,
    entityType: EntityType.PARTITION,
    entityId: operation.partitionId,
    nodeId: operation.targetNodeId,
    replicaId: operation.replicaId || undefined,
    emitOperationCreated: false,
  };
}

function findPlannerCreatedOperation(seed, operation) {
  const rows = seed.cache.getAll(TABLES.REPLICA_OPERATIONS) || [];
  return rows.find((row) => row.partition_id === operation.partitionId &&
    row.type === operation.type &&
    row.target_node_id === operation.targetNodeId) || null;
}

async function applyOperationCreated(world, report, operation) {
  const seed = world.hosts.get(world.seedNodeId);
  const planned = findPlannerCreatedOperation(seed, operation);
  if (planned) {
    report.appliedOperations.push({operationId: operation.operationId,
      type: operation.type, partitionId: operation.partitionId,
      replicaId: operation.replicaId, source: 'hosts-planner',
      createdOperationId: planned.operation_id});
    world.createdRecords.set(operation.operationId, planned);
    return;
  }
  try {
    const record = await runOnExecutionNode(world.seedNodeId, () =>
      seed.rebalanceCoordinator.createOperation(moveOf(operation)));
    world.createdRecords.set(operation.operationId, record);
    report.appliedOperations.push({operationId: operation.operationId,
      type: operation.type, partitionId: operation.partitionId,
      replicaId: operation.replicaId, source: 'replayed-coordinator',
      createdOperationId: record?.operationId ?? null});
    report.divergences.push({reason: DIVERGENCE.OPERATION_NOT_PLANNED,
      operationId: operation.operationId, partitionId: operation.partitionId,
      citation: operation.citations.created});
  } catch (error) {
    report.divergences.push({reason: DIVERGENCE.OPERATION_CREATE_REFUSED,
      operationId: operation.operationId, partitionId: operation.partitionId,
      error: error.message, citation: operation.citations.created});
  }
}

// The effect live applied at the cited CREATE_REPLICA hop: the target node
// holds a syncing learner row for the new replica.
function applyLearnerRow(world, operation) {
  if (!ADD_LIKE_TYPES.has(operation.type) || !operation.replicaId) return;
  const targetNodeId = operation.handledByNodeId || operation.targetNodeId;
  for (const nodeId of world.ids) {
    const host = world.hosts.get(nodeId);
    runOnExecutionNode(nodeId, () => {
      host.cache.applySystemTableChange(TABLES.SERVICES, INSERT, {
        service_id: operation.replicaId, replica_id: operation.replicaId,
        partition_id: operation.partitionId, node_id: targetNodeId,
        service_type: EntityType.PARTITION, status: ReplicaStatus.SYNCING,
        raft_role: RaftRole.LEARNER,
        address: `${targetNodeId}${NODE_ADDRESS_SUFFIX}`,
        created_at: host.now(),
      });
    });
  }
}

function applyCompletedAdd(world, operation) {
  const targetNodeId = operation.handledByNodeId || operation.targetNodeId;
  for (const nodeId of world.ids) {
    const host = world.hosts.get(nodeId);
    runOnExecutionNode(nodeId, () => {
      const existing = host.cache.get(TABLES.SERVICES, operation.replicaId);
      host.cache.applySystemTableChange(TABLES.SERVICES, UPDATE, {
        ...(existing || {}),
        service_id: operation.replicaId, replica_id: operation.replicaId,
        partition_id: operation.partitionId, node_id: targetNodeId,
        service_type: EntityType.PARTITION, status: ReplicaStatus.ACTIVE,
        raft_role: RaftRole.FOLLOWER,
        address: `${targetNodeId}${NODE_ADDRESS_SUFFIX}`,
      });
    });
  }
}

function applyCompletedRemove(world, operation) {
  for (const nodeId of world.ids) {
    const host = world.hosts.get(nodeId);
    runOnExecutionNode(nodeId, () => {
      const existing = host.cache.get(TABLES.SERVICES, operation.replicaId);
      if (!existing) return;
      host.cache.applySystemTableChange(TABLES.SERVICES, DELETE, existing);
    });
  }
}

async function writeTerminalOutcome(world, report, operation) {
  const record = world.createdRecords.get(operation.operationId);
  if (!record) return;
  const seed = world.hosts.get(world.seedNodeId);
  const coordinator = seed.rebalanceCoordinator;
  try {
    const outcome = await runOnExecutionNode(world.seedNodeId, () =>
      operation.outcome === 'completed' ?
        coordinator.completeOperation(record) :
        coordinator.failOperation(record, operation.errorMessage || ''));
    report.terminalOutcomes.push({operationId: operation.operationId,
      liveOutcome: operation.outcome, outcome});
  } catch (error) {
    report.divergences.push({reason: DIVERGENCE.TERMINAL_WRITE_REFUSED,
      operationId: operation.operationId, error: error.message,
      citation: operation.citations.ended});
  }
}

async function applyOperationEnded(world, report, operation) {
  if (operation.outcome === 'completed' && operation.replicaId) {
    if (ADD_LIKE_TYPES.has(operation.type)) applyCompletedAdd(world, operation);
    if (operation.type === OPERATION_TYPE_REMOVE) {
      applyCompletedRemove(world, operation);
    }
  }
  await writeTerminalOutcome(world, report, operation);
}

// The learner node's readiness state, built the way the bootstrap readiness
// evaluator builds it: a real LifecycleController fed by THIS node's own
// priority-recovery health for the seed. No reason is written by hand.
function buildLearnerReadinessState(host, seedNodeId) {
  const readinessState = new LifecycleController({now: host.now});
  const health = host.controlPlaneReadinessService
    .getPriorityControlPlaneRecoveryHealthSync(seedNodeId, host.now());
  readinessState.setDependency(
    PRIORITY_RECOVERY_DEPENDENCY, health?.healthy === true, {
      reasonCode: health?.reasonCode, details: health?.details,
      classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
      demotionPolicy: LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.IMMEDIATE,
    });
  return {readinessState, health};
}

function buildLearnerPartition(world, attempt) {
  const host = world.hosts.get(attempt.nodeId);
  const {readinessState, health} =
    buildLearnerReadinessState(host, world.seedNodeId);
  const partition = runOnExecutionNode(attempt.nodeId, () =>
    new PartitionService({
      partitionId: attempt.partitionId,
      tableId: tableIdOf(attempt.partitionId),
      tableName: tableIdOf(attempt.partitionId),
      replicaId: attempt.replicaId, replicaIds: [attempt.replicaId],
      nodeId: attempt.nodeId, dbPath: MEMORY_DB_PATH,
      isJoiningExistingGroup: true, systemTableCache: host.cache,
      rebalanceCoordinator: host.rebalanceCoordinator,
      metadataPublicationReadinessState: readinessState,
    }));
  const deferrals = [];
  partition.role = RaftRole.LEARNER;
  partition.leaderId = attempt.leaderReplicaId ||
    world.leaderReplicaIdByPartitionId.get(attempt.partitionId) || null;
  partition.logger = {
    info: (msg, fields) => deferrals.push({msg, fields}),
    warn() {}, error() {}, debug() {},
  };
  stubGrantedLearnerPromotionProof(partition);
  return {partition, deferrals, readinessState, health};
}

function learnerKeyOf(attempt) {
  return `${attempt.nodeId}|${attempt.partitionId}|${attempt.replicaId}`;
}

function resolveLearner(world, attempt) {
  const key = learnerKeyOf(attempt);
  if (!world.learners.has(key)) {
    world.learners.set(key, buildLearnerPartition(world, attempt));
  }
  return world.learners.get(key);
}

function readGuardInputs(deferrals) {
  const refusal = deferrals.find((entry) =>
    entry.msg === PROMOTION_DEFERRED_MSG &&
    REFUSAL_REASONS.has(entry.fields?.reason));
  if (!refusal) return null;
  return {
    reason: refusal.fields.reason,
    activeVoterCount: refusal.fields.activeVoterCount ?? null,
    learnerCount: refusal.fields.learnerCount ?? null,
    targetReplicaCount: refusal.fields.targetReplicaCount ?? null,
    maxAllowedVotersAfterPromotion:
      refusal.fields.maxAllowedVotersAfterPromotion ?? null,
  };
}

// The cohort evidence the projection admits nodes on: every node row this
// learner's cache holds, with the two ages the liveness projection reads
// against the ambient clock. requiredDistinctNodeCount is min(3, cohort), so
// a cohort of one makes any spread "satisfied" and zeroes the budget.
function describeNodeCohortEvidence(host, observedAt) {
  const rows = host.cache.getAll(TABLES.NODES) || [];
  return rows.map((row) => ({
    nodeId: row.node_id,
    status: row.status ?? null,
    connectionState: row.connection_state ?? null,
    leaseRemainingMs: Number.isFinite(row.ready_lease_expires_at) ?
      row.ready_lease_expires_at - observedAt : null,
    heartbeatAgeMs: Number.isFinite(row.last_heartbeat) ?
      observedAt - row.last_heartbeat : null,
  }));
}

// The rows the count check itself counted: this partition's services rows and
// its non-terminal operation rows in the learner node's own cache.
function describeLocalRows(host, partitionId) {
  const services = (host.cache.getAll(TABLES.SERVICES) || [])
    .filter((row) => row.partition_id === partitionId)
    .map((row) => ({replicaId: row.replica_id ?? row.service_id,
      nodeId: row.node_id, raftRole: row.raft_role, status: row.status}));
  const operations = (host.cache.getAll(TABLES.REPLICA_OPERATIONS) || [])
    .filter((row) => row.partition_id === partitionId)
    .map((row) => ({operationId: row.operation_id, type: row.type,
      replicaId: row.replica_id, targetNodeId: row.target_node_id,
      status: row.status, workflowStep: row.workflow_step}));
  return {services, operations};
}

function describeLearnerPlanning(partition, readinessState, host) {
  const planning =
    partition.getPriorityRecoveryPlanningSnapshotForLearnerPromotion();
  const snapshot = readinessState.evaluate();
  return {
    nodeCohortEvidence: describeNodeCohortEvidence(host, Date.now()),
    localRows: describeLocalRows(host, partition.partitionId),
    readinessPhase: snapshot?.phase ?? null,
    readinessReasons: Array.isArray(snapshot?.reasons) ?
      [...snapshot.reasons] : [],
    planningAnswerPresent: Boolean(planning),
    priorityPartitionSummary: planning?.priorityPartitionSummary ?? null,
    priorityRecoveryPending:
      partition.isPriorityRecoveryPendingForLearnerPromotion(),
    operationContexts:
      partition.getPriorityRecoveryOperationContextsForLearnerPromotion(),
  };
}

async function runPromotionAttempt(world, report, attempt) {
  if (!world.hosts.has(attempt.nodeId) || !attempt.replicaId) return;
  const learner = resolveLearner(world, attempt);
  learner.deferrals.length = 0;
  learner.partition.role = RaftRole.LEARNER;
  await runOnExecutionNode(attempt.nodeId, () =>
    learner.partition.checkLearnerPromotion());
  if (learner.partition.learnerPromotionTimer) {
    clearTimeout(learner.partition.learnerPromotionTimer);
    learner.partition.learnerPromotionTimer = null;
  }
  const guardInputs = readGuardInputs(learner.deferrals);
  const completion =
    learner.partition.resolvePriorityRecoveryCompletionForLearnerPromotion({
      targetReplicaCount: guardInputs?.targetReplicaCount ?? null,
      activeVoterCount: guardInputs?.activeVoterCount ?? null,
      learnerCount: guardInputs?.learnerCount ?? null,
    });
  report.promotionChecks.push({
    replicaId: attempt.replicaId, partitionId: attempt.partitionId,
    nodeId: attempt.nodeId, atSeconds: attempt.citation.atSeconds,
    liveOutcome: attempt.outcome, liveReason: attempt.reason,
    liveGuardInputs: attempt.guardInputs,
    replayOutcome: guardInputs ? REPLAY_OUTCOME.REFUSED :
      REPLAY_OUTCOME.ADMITTED,
    replayGuardInputs: guardInputs,
    completion,
    planning: describeLearnerPlanning(learner.partition, learner.readinessState,
      world.hosts.get(attempt.nodeId)),
    seedRows: describeLocalRows(world.hosts.get(world.seedNodeId),
      attempt.partitionId),
    deliveredRowCount: world.deliveredRowCount,
    citation: attempt.citation,
  });
}

function hostDecisionPartitionPlanner(world, report, plan) {
  if (!plan.decisionPartitionId) return;
  const seed = world.hosts.get(world.seedNodeId);
  const rebalancer = runOnExecutionNode(world.seedNodeId, () =>
    createPriorityPartitionRebalancer(seed, tableIdOf(plan.decisionPartitionId)));
  const record = (level) => (msg, fields) =>
    report.plannerLines.push({level, msg, fields});
  const logger = {info: record('info'), warn: record('warn'),
    error: record('error'), debug: record('debug')};
  rebalancer.logger = logger;
  if (rebalancer.movePlanner) rebalancer.movePlanner.logger = logger;
  runOnExecutionNode(world.seedNodeId, () => rebalancer.setLeader(true));
  world.plannerRebalancer = rebalancer;
}

function stopDecisionPartitionPlanner(world) {
  if (!world.plannerRebalancer) return;
  runOnExecutionNode(world.seedNodeId, () =>
    world.plannerRebalancer.setLeader(false));
}

function firstRetentionAtSeconds(scenario, partitionId) {
  const entry = scenario.plannerRetentions
    .find((row) => row.partitionId === partitionId);
  return entry ? entry.citation.atSeconds : null;
}

function collectPlannerDecisions(report) {
  for (const line of report.plannerLines) {
    const fields = line.fields || {};
    if (!fields.overTargetCapAddDecision) continue;
    report.plannerDecisions.push({
      partitionId: fields.entityId ?? null,
      decision: fields.overTargetCapAddDecision,
      targetReplicaCount: fields.targetReplicaCount ?? null,
      activeVoterCount: fields.activeVoterCount ?? null,
      activeDistinctNodeCount: fields.activeDistinctNodeCount ?? null,
      targetDistinctNodeCount: fields.targetDistinctNodeCount ?? null,
      prioritySpreadGapOpen: fields.prioritySpreadGapOpen === true,
      retainedSpreadCureAddCount: fields.retainedSpreadCureAddCount ?? null,
    });
  }
}

async function applyTimelineEvent(world, report, event) {
  if (event.kind === REPLAY_EVENT.OPERATION_CREATED) {
    await applyOperationCreated(world, report, event.operation);
    return;
  }
  if (event.kind === REPLAY_EVENT.OPERATION_HANDLED) {
    applyLearnerRow(world, event.operation);
    return;
  }
  if (event.kind === REPLAY_EVENT.OPERATION_ENDED) {
    await applyOperationEnded(world, report, event.operation);
    return;
  }
  await runPromotionAttempt(world, report, event.attempt);
}

async function driveTimeline(world, scenario, plan, report) {
  const plannerAtSeconds =
    firstRetentionAtSeconds(scenario, plan.decisionPartitionId);
  let plannerHosted = false;
  for (const event of buildTimeline(scenario)) {
    await advanceTo(world, virtualMsOf(plan, event.atSeconds));
    // The planner starts leading at the live instant it first retained a
    // spread-cure ADD, and keeps leading for the rest of the timeline: it
    // arms its own periodic check, so its rate stays the owner's. Jumping
    // virtual time forward to give it a window instead starved every other
    // node's queue - cache-change delivery included - for that span.
    if (!plannerHosted && plannerAtSeconds !== null &&
        event.atSeconds >= plannerAtSeconds) {
      hostDecisionPartitionPlanner(world, report, plan);
      plannerHosted = true;
    }
    await applyTimelineEvent(world, report, event);
  }
  stopDecisionPartitionPlanner(world);
  collectPlannerDecisions(report);
}

function newReport(scenario, plan) {
  return {
    schema: REPLAY_SCHEMA,
    runId: scenario.runId,
    liveVerdict: scenario.verdict,
    decisionAtSeconds: plan.decisionAtSeconds,
    decisionPartitionId: plan.decisionPartitionId,
    seams: [...SEAMS],
    appliedOperations: [],
    divergences: [],
    plannerLines: [],
    plannerDecisions: [],
    terminalOutcomes: [],
    promotionChecks: [],
  };
}

/**
 * Replay one committed scenario on the real per-node owners.
 * @param {object} options
 * @param {object} options.scenario a committed scenario fixture
 * @param {number} [options.nowMs] the wall instant the decision point is
 *   anchored to (the replay's only clock choice)
 * @return {Promise<object>} the replay report
 */
async function replayCriticalSpreadScenario({scenario, nowMs = Date.now()}) {
  const plan = buildReplayPlan(scenario, nowMs);
  const world = createReplayWorld(scenario, plan);
  world.createdRecords = new Map();
  world.learners = new Map();
  world.deliveredRowCount = 0;
  world.leaderReplicaIdByPartitionId = new Map(scenario.partitions
    .map((partition) => [partition.partitionId, partition.leaderReplicaId]));
  world.plannerRebalancer = null;
  seedScenarioState(world, scenario);
  wireImmediateCrossNodeDelivery(world);
  startNodeHeartbeats(world);
  const report = newReport(scenario, plan);
  await driveTimeline(world, scenario, plan, report);
  return {report, world};
}

/**
 * The planner decisions the replay observed for one partition.
 * @param {object} report a replay report
 * @param {string} partitionId
 * @return {Array<object>} the decisions, in order
 */
function plannerDecisionsFor(report, partitionId) {
  return report.plannerDecisions
    .filter((entry) => entry.partitionId === partitionId);
}

/**
 * The replay's count checks at the live attempts that the live run granted.
 * @param {object} report a replay report
 * @return {Array<object>} the checks
 */
function checksAtLiveGrants(report) {
  return report.promotionChecks
    .filter((check) => check.liveOutcome === PROMOTION_OUTCOME.GRANTED);
}

/**
 * The replay's count checks at the live attempts the live count gate refused.
 * @param {object} report a replay report
 * @return {Array<object>} the checks
 */
function checksAtLiveCountRefusals(report) {
  return report.promotionChecks
    .filter((check) => check.liveGuardInputs !== null &&
      check.liveGuardInputs !== undefined);
}

export {
  DIVERGENCE,
  REPLAY_OUTCOME,
  REPLAY_SCHEMA,
  checksAtLiveCountRefusals,
  checksAtLiveGrants,
  plannerDecisionsFor,
  replayCriticalSpreadScenario,
};
