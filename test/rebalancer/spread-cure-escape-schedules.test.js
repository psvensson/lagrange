// Evidence for the lead's ruling on the sealed spread-cure escape (quest
// spread-cure-union-escape-and-monotone-gate, 494c71ec1): the schedules in
// which the topology guard's SERVICES read is unavailable while a priority
// control-plane partition needs its spread cure, executed on a real
// services-p1 group. The same file runs at the integration base (escapes
// present, default-mode read) and at the branch head (owner-fact read,
// escapes deleted); its assertions state the head's claim (nothing is granted
// from the cache; the cure is admitted within one cycle of the services owner
// being reachable), and each case prints what the commit under test did.
//
// Composition: the planner stack of the sealed reproduction
// (critical-spread-terminal-stall-repro.test.js: the real UnifiedRebalancer
// planning the priority partition, the real RebalanceCoordinator, the same
// non-subject substitutions: readiness repair-eligible, storage admission
// allow-all, rebalancer leader and stabilized, budget 5, no global in-flight
// count), with its failing read stub replaced by the guard fixture's world
// (topology-guard-inventory-authority-fixture.js): services-p1 is a real
// three-replica rs-raft group, the planner node hosts a follower, and the
// gateway, CDC read flow, query executor, routers and receivers are
// production objects. The priority partition's SERVICES rows are table
// content of every services-p1 replica and of the planner's projection.
// "No leader" is real: every raft message of services-p1 is held until no
// replica leads, and released to let one be elected; the query transport
// keeps answering. One evaluation cycle is one rebalance() call.
import {test} from '../../src/test-helpers/tap.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_OPERATION, NODE_STATE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {ENTITY_SERVICE_ROW_READ_SQL} from
  '../../src/rebalancer/entity-service-row-read.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {isNonLedgerPriorityPlacementCurePartition} from
  '../../src/rebalancer/replica-placement-cure-policy.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
  TriggerType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  NODE,
  initializeGuardEnvironment,
  openPlannerHost,
  openServicesWorld,
  resetGuardEnvironment,
} from './topology-guard-inventory-authority-fixture.js';
import {COMMITTED_FORMATION} from './placement-bound-coordinator-fixture.js';
import {
  createMockControlPlaneReadinessService,
  createTestRebalancer,
} from './test-helpers.js';

const PORTS = createPortAllocator(import.meta.url);
const CASE_TIMEOUT_MS = 240000;
const CURE_PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS];
const CURE_TABLE_ID = SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS;
const SERVICES_PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
const FREE_NODE_C = 'free-node-c';
const FREE_NODE_D = 'free-node-d';
const FIXTURE_NODE_IDS = Object.freeze([NODE.PLANNER, NODE.PEER_A, NODE.PEER_B]);
const READY_LEASE_MS = 3600000;
const REBALANCE_BUDGET = 5;
const NO_GLOBAL_IN_FLIGHT_OPERATIONS = 0;
// Real time: raft elections and check_quorum run on the host clock.
const LEADERSHIP_BUDGET_MS = 30000;
const POLL_MS = 50;
const QUORUM_LOSS_OBSERVE_MS = 5000;
const CYCLES_WITHOUT_LEADER = 3;
const CYCLES_AFTER_LEADER_LIMIT = 5;
const PARTITION_SERVICE_TYPE = 'partition';
const ADDRESS_PREFIX = 'local/partition/';
const LEDGER_SQL = 'SELECT * FROM replica_operations WHERE entity_id = ? ' +
  'ORDER BY operation_id';
const RESERVATION_SQL = 'SELECT * FROM storage_reservations';
const ERROR_TEXT_LIMIT = 200;
// A target node's registration write, as E6 makes it through the leader.
const E6_PROBE_PARTITION_ID = 'e6-registration-probe-p1';
const E6_PROBE_REPLICA_ID = `${E6_PROBE_PARTITION_ID}-r1`;
const E6_PROBE_ENTRY_ID = 'e6-registration-probe-entry';

function observe(t, name, value) {
  t.comment(`OBSERVATION ${name} ${JSON.stringify(value)}`);
}

async function settle(run) {
  try {
    return {value: await run(), error: null};
  } catch (error) {
    return {value: null, error};
  }
}

async function waitUntil(predicate, budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
  return predicate();
}

function cureReplicaRow(partitionId, index, nodeId) {
  const replicaId = `${partitionId}-r${index}`;
  const nowMs = Date.now();
  return {
    service_id: replicaId,
    service_type: PARTITION_SERVICE_TYPE,
    node_id: nodeId,
    partition_id: partitionId,
    replica_id: replicaId,
    address: ADDRESS_PREFIX + replicaId,
    raft_role: index === 1 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
    status: ReplicaStatus.ACTIVE,
    created_at: nowMs,
    updated_at: nowMs,
  };
}

// As the sealed reproduction: both result shapes, so storage capacity never
// interferes.
function createAllowAllStorageAdmissionService() {
  const allow = async () => ({decision: 'allow', allowed: true, decisionType: 'admitted'});
  return {checkAdd: allow, checkReplace: allow, checkSplit: allow};
}

function seedFreeNodesAndPartition(cache, partitionId, tableId) {
  for (const nodeId of [FREE_NODE_C, FREE_NODE_D]) {
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {node_id: nodeId,
      status: NODE_STATE.ACTIVE, connection_state: NODE_STATE.READY,
      ready_lease_expires_at: Date.now() + READY_LEASE_MS});
  }
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT,
    {partition_id: partitionId, table_id: tableId});
}

// The escape at the base, observed: every call and its answer. Null at a
// commit without it.
function tapEscape(coordinator) {
  const original = coordinator.isEngagedPrioritySpreadCureMove;
  if (typeof original !== 'function') return null;
  const calls = [];
  coordinator.isEngagedPrioritySpreadCureMove = function tapped(...args) {
    const value = original.apply(this, args);
    calls.push({partitionId: args[0]?.partitionId ?? null,
      moveType: args[0]?.normalizedMoveType ?? null,
      targetNodeId: args[0]?.move?.nodeId ?? null,
      authoritativeAvailable: args[2]?.available ?? null, engaged: value});
    return value;
  };
  return calls;
}

// The over-target hold, observed: resolved (open) or its refusal.
function tapHold(coordinator) {
  const original = coordinator.holdCriticalPartitionCreateLaneIfOverTarget;
  const calls = [];
  coordinator.holdCriticalPartitionCreateLaneIfOverTarget = async function tapped(...args) {
    try {
      const value = await original.apply(this, args);
      calls.push({targetNodeId: args[0]?.move?.nodeId ?? null, held: false});
      return value;
    } catch (error) {
      calls.push({targetNodeId: args[0]?.move?.nodeId ?? null, held: true,
        reason: error?.admissionResult?.reason ?? error?.message ?? null});
      throw error;
    }
  };
  return calls;
}

function openCurePlanner(t, host, partitionId, readiness, storage) {
  const rebalancer = createTestRebalancer({entityId: partitionId,
    entityType: EntityType.PARTITION, nodeId: NODE.PLANNER, systemTableCache: host.cache,
    rebalanceCoordinator: host.coordinator, controlPlaneReadinessService: readiness,
    storageAdmissionService: storage, storageAccountingService: {estimateReplicaBytes: () => 1}});
  // Each evaluation cycle in this suite is an explicit rebalance() call;
  // setting isLeader without setLeader(true)'s autonomous checkRebalance()
  // enqueue prevents a background cycle from racing scenario outage setup
  // (e.g., E4(c)'s holdServicesLeaderless while PEER_A is stepping down).
  rebalancer.isLeader = true;
  rebalancer.clusterReadinessConfirmed = true;
  rebalancer.isStabilized = () => true;
  rebalancer.getConfiguredRebalanceBudget = async () => REBALANCE_BUDGET;
  rebalancer.getGlobalInFlightOperationCount = async () => NO_GLOBAL_IN_FLIGHT_OPERATIONS;
  t.teardown(() => rebalancer.shutdown());
  return rebalancer;
}

/**
 * The July world: services-p1 on the three fixture nodes (PEER_A leads, the
 * planner follows), the priority partition's replicas on `cureNodeIds`, two
 * further free active nodes.
 * @param {Object} t - The case's tap test.
 * @param {Object} options - {cureNodeIds, partitionId, tableId}.
 * @return {Promise<Object>} {world, host, rebalancer, escape, hold, partitionId}.
 */
async function openCureScene(t, {cureNodeIds, partitionId = CURE_PARTITION_ID,
  tableId = CURE_TABLE_ID}) {
  initializeGuardEnvironment();
  let world = null;
  try {
    world = await openServicesWorld({leaderNodeId: NODE.PEER_A, ports: PORTS});
  } finally {
    t.teardown(async () => {
      await world?.close();
      resetGuardEnvironment();
    });
  }
  const cureRows = cureNodeIds.map((nodeId, index) =>
    cureReplicaRow(partitionId, index + 1, nodeId));
  cureRows.forEach((row) => world.seedRowOnAll(row));
  const storage = createAllowAllStorageAdmissionService();
  let readiness = null;
  const host = await openPlannerHost(t, world, {readyNodes: true, publishedRows: cureRows,
    coordinatorOptionsOf: (cache) => {
      readiness = createMockControlPlaneReadinessService({systemTableCache: cache,
        defaultRepairEligible: true, formation: COMMITTED_FORMATION});
      return {controlPlaneReadinessService: readiness, storageAdmissionService: storage};
    }});
  seedFreeNodesAndPartition(host.cache, partitionId, tableId);
  // Drain the SystemTableCache setImmediate notifications queued by setup
  // seeding before constructing the planner, so setup inserts do not fire
  // priorityRecoveryVisibilityCacheListener during outage setup.
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  const rebalancer = openCurePlanner(t, host, partitionId, readiness, storage);
  t.equal(world.replicaOn(NODE.PLANNER).getRole(), RAFT_ROLE.FOLLOWER,
    'setup: the planner node hosts a services-p1 replica that follows');
  t.equal(rebalancer.getCurrentReplicas().length, cureNodeIds.length,
    'setup: the planner observes the partition\'s replicas');
  return {world, host, rebalancer, partitionId, cureNodeIds,
    escape: tapEscape(host.coordinator), hold: tapHold(host.coordinator)};
}

function isAddLike(moveResult) {
  return moveResult?.operation === MoveType.ADD || moveResult?.operation === MoveType.REPLACE;
}

function isAdmittedAddLike(moveResult) {
  return isAddLike(moveResult) && moveResult.skipped !== true && moveResult.success !== false;
}

function summarizeMove(moveResult) {
  const admission = moveResult?.admission;
  const snapshot = admission?.topologySnapshot;
  return {operation: moveResult?.operation ?? null, nodeId: moveResult?.nodeId ?? null,
    skipped: moveResult?.skipped === true, reason: moveResult?.reason ?? null,
    admissionReason: admission?.reason ?? null, decisionType: admission?.decisionType ?? null,
    authoritativeAvailable: snapshot?.authoritativeAvailable ?? null,
    authoritativeReasonCode: snapshot?.authoritativeReasonCode ?? null,
    operationId: moveResult?.operationId ?? null};
}

function summarizeRead(read) {
  const result = read.result || {};
  const witness = result.readAuthorityWitness || null;
  return {mode: read.options?.authoritativeReadMode ?? null,
    leaderMode: read.options?.leaderMode ?? null, success: result.success ?? null,
    rowSetComplete: result.rowSetComplete ?? null,
    rows: Array.isArray(result.rows) ? result.rows.length : null,
    servingNodeId: witness?.servingNodeId ?? null, witnessRole: witness?.role ?? null,
    reasonCode: result.reasonCode ?? result.errorCode ?? null,
    error: result.error ? String(result.error).slice(0, ERROR_TEXT_LIMIT) : null};
}

function ledgerOf(scene) {
  return (scene.host.store.execute(LEDGER_SQL, [scene.partitionId]).rows || []).map((row) =>
    ({type: row.type, status: row.status, target_node_id: row.target_node_id,
      replica_id: row.replica_id, source_replica_id: row.source_replica_id ?? null}));
}

function reservationsOf(scene) {
  const result = scene.host.store.execute(RESERVATION_SQL, []);
  return result.success === true ?
    (result.rows || []).map((row) => ({state: row.state ?? row.status ?? null,
      partition_id: row.partition_id ?? null, node_id: row.node_id ?? null,
      operation_id: row.operation_id ?? null})) :
    {unreadable: result.error ?? true};
}

function spreadRestoringRows(scene) {
  return ledgerOf(scene).filter((row) =>
    [MoveType.ADD, MoveType.REPLACE].includes(String(row.type).toLowerCase()) &&
    !scene.cureNodeIds.includes(row.target_node_id));
}

function isCureServicesRead(scene, read) {
  return read?.sql === ENTITY_SERVICE_ROW_READ_SQL.PARTITION &&
    read.params?.[1] === scene.partitionId;
}

async function runCycle(scene, label) {
  const marked = scene.host.observed.servicesReads.length;
  const escapeMarked = scene.escape?.length ?? 0;
  const holdMarked = scene.hold.length;
  const outcome = await settle(() => scene.rebalancer.rebalance(TriggerType.PERIODIC));
  const moves = outcome.value?.moves || [];
  return {label, success: outcome.value?.success ?? null,
    thrown: outcome.error ? String(outcome.error.message).slice(0, ERROR_TEXT_LIMIT) : null,
    moves: moves.map(summarizeMove), admitted: moves.filter(isAdmittedAddLike).length,
    reads: scene.host.observed.servicesReads.slice(marked)
      .filter((read) => isCureServicesRead(scene, read)).map(summarizeRead),
    escape: scene.escape ? scene.escape.slice(escapeMarked) : 'absent at this commit',
    hold: scene.hold.slice(holdMarked), ledger: ledgerOf(scene)};
}

function rolesOf(world) {
  return world.replicas.map((replica) => ({nodeId: replica.nodeId,
    core: replica.raft.readStatus().role, service: replica.getRole(),
    leaderId: replica.raft.readStatus().leaderId ?? null}));
}

function leadingReplica(world) {
  return world.replicas.find((replica) =>
    replica.raft.readStatus().role === RAFT_ROLE.LEADER &&
    replica.getRole() === RAFT_ROLE.LEADER) ?? null;
}

// Every raft message of services-p1 held; wait until no replica leads.
async function holdServicesLeaderless(world) {
  FIXTURE_NODE_IDS.forEach((nodeId) => world.cutOffFromConsensus(nodeId));
  const startedAt = Date.now();
  const leaderless = await waitUntil(() => world.replicas.every((replica) =>
    replica.raft.readStatus().role !== RAFT_ROLE.LEADER &&
    replica.getRole() !== RAFT_ROLE.LEADER), LEADERSHIP_BUDGET_MS);
  return {leaderless, afterMs: Date.now() - startedAt, roles: rolesOf(world)};
}

// Release the holds; wait until one replica leads, every replica knows it
// and it has applied its election log.
async function letServicesLeaderAppear(world) {
  const startedAt = Date.now();
  world.releaseRaftHolds();
  const elected = await waitUntil(() => {
    const leader = leadingReplica(world);
    return leader !== null && world.replicas.every((replica) =>
      replica.raft.readStatus().leaderId === leader.replicaId);
  }, LEADERSHIP_BUDGET_MS);
  const leader = leadingReplica(world);
  if (elected && leader) await world.settleLeader(leader.nodeId);
  return {elected, leaderNodeId: leader?.nodeId ?? null, afterMs: Date.now() - startedAt};
}

async function cyclesUntilAdmitted(scene, label) {
  const cycles = [];
  for (let index = 0; index < CYCLES_AFTER_LEADER_LIMIT; index += 1) {
    const cycle = await runCycle(scene, `${label}-${index + 1}`);
    cycles.push(cycle);
    if (cycle.admitted > 0 || spreadRestoringRows(scene).length > 0) break;
  }
  return cycles;
}

test('E2 July world, services-p1 leader alive and reachable, planner on a follower: ' +
  'the spread cure of [A,A,B] is admitted within one evaluation cycle',
{timeout: CASE_TIMEOUT_MS}, async (t) => {
  const scene = await openCureScene(t, {cureNodeIds: [NODE.PEER_A, NODE.PEER_A, NODE.PEER_B]});
  const cycle = await runCycle(scene, 'e2-cycle-1');
  observe(t, 'E2', {escapePresent: scene.escape !== null, cycle});
  t.ok(cycle.admitted >= 1, 'a spread-restoring add-like move is admitted in the first cycle');
  t.ok(spreadRestoringRows(scene).length >= 1,
    `a spread-restoring operation row targets a free node: ${JSON.stringify(cycle.ledger)}`);
});

test('E2 control (only where the escape exists): the same cycle with the escape answering ' +
  'false gives the July signature', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const scene = await openCureScene(t, {cureNodeIds: [NODE.PEER_A, NODE.PEER_A, NODE.PEER_B]});
  if (scene.escape === null) {
    t.pass('not applicable: this commit has no escape (the E2 case above is its whole answer)');
    return;
  }
  scene.host.coordinator.isEngagedPrioritySpreadCureMove = () => false;
  const cycle = await runCycle(scene, 'e2-control-cycle-1');
  observe(t, 'E2-control', {cycle});
  t.equal(cycle.admitted, 0, 'without the escape nothing is admitted');
  t.ok(cycle.moves.filter(isAddLike).some((move) =>
    move.admissionReason === 'replica_inventory_unusable'),
  'the cure is denied replica_inventory_unusable (the July 17-40-24 signature)');
});

test('E3 services-p1 without a leader, then a leader: nothing is admitted while no replica ' +
  'leads, and the cure is admitted within one cycle of the leader appearing',
{timeout: CASE_TIMEOUT_MS}, async (t) => {
  const scene = await openCureScene(t, {cureNodeIds: [NODE.PEER_A, NODE.PEER_A, NODE.PEER_B]});
  const outage = await holdServicesLeaderless(scene.world);
  t.ok(outage.leaderless, `setup: no services-p1 replica leads: ${JSON.stringify(outage)}`);
  const withoutLeader = [];
  for (let index = 0; index < CYCLES_WITHOUT_LEADER; index += 1) {
    withoutLeader.push(await runCycle(scene, `e3-no-leader-${index + 1}`));
  }
  const firstTarget = ledgerOf(scene)[0]?.target_node_id ?? null;
  const otherFreeNode = [NODE.PLANNER, FREE_NODE_C, FREE_NODE_D]
    .find((nodeId) => nodeId !== firstTarget);
  // A second create on the partition while the leaderless window lasts: what
  // an operation admitted from the cache leaves occupying.
  const slotProbe = await settle(() => scene.host.coordinator.createOperation({
    type: OperationType.ADD, partitionId: scene.partitionId,
    entityType: EntityType.PARTITION, entityId: scene.partitionId, nodeId: otherFreeNode,
    replicaId: null, moveReason: MOVE_REASON.SPREAD_REPLICAS,
    enforceConcurrentOperationBudget: true}));
  const leftBehind = {ledger: ledgerOf(scene), reservations: reservationsOf(scene),
    slotProbe: {admitted: slotProbe.error === null,
      reason: slotProbe.error?.admissionResult?.reason ?? null,
      skip: slotProbe.error?.rebalanceSkipReason ?? null,
      message: slotProbe.error ? String(slotProbe.error.message).slice(0, ERROR_TEXT_LIMIT) :
        null}};
  const recovery = await letServicesLeaderAppear(scene.world);
  t.ok(recovery.elected, `setup: a services-p1 leader appears: ${JSON.stringify(recovery)}`);
  const afterLeader = await cyclesUntilAdmitted(scene, 'e3-leader');
  observe(t, 'E3', {escapePresent: scene.escape !== null, outage, withoutLeader, leftBehind,
    recovery, afterLeader, finalLedger: ledgerOf(scene)});

  t.ok(withoutLeader.every((cycle) => cycle.admitted === 0),
    'no cycle admits an add-like move while services-p1 has no leader');
  t.same(leftBehind.ledger, [], 'no operation exists while services-p1 has no leader');
  t.equal(afterLeader.length, 1,
    'the first cycle after the leader appears ends the wait (admits, or finds the cure made)');
  t.equal(spreadRestoringRows(scene).length, 1, 'exactly one spread-restoring operation');
  t.equal(afterLeader[0]?.admitted, 1,
    'that first cycle is the one that admits the cure');
});

test('E5 over-target [A,A,A,B]: the hold fails open and the guard behind it; across a ' +
  'bounded services-p1 gap the surplus drain\'s cure waits for the gap and no longer',
{timeout: CASE_TIMEOUT_MS}, async (t) => {
  const scene = await openCureScene(t,
    {cureNodeIds: [NODE.PEER_A, NODE.PEER_A, NODE.PEER_A, NODE.PEER_B]});
  const outage = await holdServicesLeaderless(scene.world);
  t.ok(outage.leaderless, `setup: no services-p1 replica leads: ${JSON.stringify(outage)}`);
  const duringGap = [];
  for (let index = 0; index < CYCLES_WITHOUT_LEADER; index += 1) {
    duringGap.push(await runCycle(scene, `e5-gap-${index + 1}`));
  }
  const ledgerAtGapEnd = ledgerOf(scene);
  const recovery = await letServicesLeaderAppear(scene.world);
  t.ok(recovery.elected, `setup: the gap ends: ${JSON.stringify(recovery)}`);
  const afterGap = await cyclesUntilAdmitted(scene, 'e5-after-gap');
  observe(t, 'E5', {escapePresent: scene.escape !== null, outage, duringGap, ledgerAtGapEnd,
    recovery, afterGap, finalLedger: ledgerOf(scene)});

  t.ok(duringGap.flatMap((cycle) => cycle.hold).every((call) => call.held === false),
    'the over-target hold never holds on the gap (its sealed fail-open)');
  t.ok(duringGap.every((cycle) => cycle.moves.every((move) =>
    move.operation !== MoveType.REMOVE || move.skipped === true)),
  'no surplus REMOVE executes during the gap');
  t.ok(duringGap.every((cycle) => cycle.admitted === 0),
    'no add-like move is admitted during the gap');
  t.same(ledgerAtGapEnd, [],
    'the gap ended with the drain unmoved: its end does not depend on the drain');
  t.equal(afterGap.length, 1, 'the first cycle after the gap ends the wait');
  t.equal(afterGap[0]?.admitted, 1, 'and admits the spread cure');
  t.equal(spreadRestoringRows(scene).length, 1, 'exactly one spread-restoring operation');
});

test('E6 the planner cannot reach the services-p1 leader while services-p1 is healthy: ' +
  'nothing is admitted while the route is down, and the cure is admitted within one cycle ' +
  'of the route returning', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const scene = await openCureScene(t, {cureNodeIds: [NODE.PEER_A, NODE.PEER_A, NODE.PEER_B]});
  const {world, host} = scene;
  // The planner's connection to the leader's node is down (a transport
  // failure, as a production router answers it: no "no handler", so no
  // address quarantine); raft between the services-p1 replicas keeps flowing.
  host.setConnected(NODE.PEER_A, false);
  const routeDown = [];
  for (let index = 0; index < CYCLES_WITHOUT_LEADER; index += 1) {
    routeDown.push(await runCycle(scene, `e6-route-down-${index + 1}`));
  }
  const ledgerWhileDown = ledgerOf(scene);
  // services-p1 stays writable meanwhile: the registration write a target
  // node's new replica makes (a CREATING SERVICES row) commits through the
  // leader, which the planner cannot reach.
  const registration = await settle(() => world.writeRowThroughLeader(NODE.PEER_A,
    {service_id: E6_PROBE_REPLICA_ID, service_type: PARTITION_SERVICE_TYPE,
      node_id: FREE_NODE_C, partition_id: E6_PROBE_PARTITION_ID,
      replica_id: E6_PROBE_REPLICA_ID, status: ReplicaStatus.CREATING,
      created_at: Date.now(), updated_at: Date.now()},
    E6_PROBE_ENTRY_ID));
  const leaderWhileDown = leadingReplica(world)?.nodeId ?? null;
  const hopsWhileDown = host.observed.hops.filter((hop) => hop.transportCut).length;
  host.setConnected(NODE.PEER_A, true);
  const afterRoute = await cyclesUntilAdmitted(scene, 'e6-route-back');
  observe(t, 'E6', {escapePresent: scene.escape !== null, routeDown, ledgerWhileDown,
    registration: {committed: registration.error === null,
      appliedIndex: registration.value ?? null,
      error: registration.error ? String(registration.error.message).slice(0,
        ERROR_TEXT_LIMIT) : null},
    leaderWhileDown, hopsWhileDown, afterRoute, finalLedger: ledgerOf(scene)});

  t.equal(leaderWhileDown, NODE.PEER_A, 'setup: services-p1 keeps its leader throughout');
  t.equal(registration.error, null,
    'setup: services-p1 commits a SERVICES write through that leader while the route is down');
  t.ok(routeDown.every((cycle) => cycle.admitted === 0),
    'no cycle admits an add-like move while the planner cannot reach the leader');
  t.ok(routeDown.every((cycle) => cycle.moves.filter(isAddLike).every((move) =>
    move.skipped === true &&
    move.admissionReason === 'replica_inventory_unavailable' &&
    move.decisionType === 'deferred' &&
    move.authoritativeReasonCode === 'owner_fact_read_failed')),
  'each cycle while the route is down is a typed deferral replica_inventory_unavailable with reason owner_fact_read_failed');
  t.same(ledgerWhileDown, [], 'no operation exists while the route is down');
  t.equal(afterRoute.length, 1, 'the first cycle after the route returns ends the wait');
  t.equal(afterRoute[0]?.admitted, 1, 'and admits the spread cure');
  t.equal(spreadRestoringRows(scene).length, 1, 'exactly one spread-restoring operation');
});

test('E4(c) the operation ledger concentrated [A,A,B] (the July-11 schedule): what each ' +
  'commit does for the ledger\'s own cure with the services-p1 leader reachable, then ' +
  'without a leader', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const ledgerPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
  const scene = await openCureScene(t, {cureNodeIds: [NODE.PEER_A, NODE.PEER_A, NODE.PEER_B],
    partitionId: ledgerPartitionId, tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS});
  const outage = await holdServicesLeaderless(scene.world);
  t.ok(outage.leaderless, `setup: no services-p1 replica leads: ${JSON.stringify(outage)}`);
  const withoutLeader = [];
  for (let index = 0; index < CYCLES_WITHOUT_LEADER; index += 1) {
    withoutLeader.push(await runCycle(scene, `e4c-no-leader-${index + 1}`));
  }
  const ledgerWithoutLeader = ledgerOf(scene);
  const recovery = await letServicesLeaderAppear(scene.world);
  t.ok(recovery.elected, `setup: a services-p1 leader appears: ${JSON.stringify(recovery)}`);
  const afterLeader = await cyclesUntilAdmitted(scene, 'e4c-leader');
  observe(t, 'E4c', {escapePresent: scene.escape !== null, outage, withoutLeader,
    ledgerWithoutLeader, recovery, afterLeader, finalLedger: ledgerOf(scene)});

  t.ok(withoutLeader.every((cycle) => cycle.admitted === 0),
    'nothing is admitted for the ledger while services-p1 has no leader');
  t.ok(withoutLeader.every((cycle) => cycle.moves.filter(isAddLike).every((move) =>
    move.skipped === true &&
    move.admissionReason === 'replica_inventory_unavailable' &&
    move.decisionType === 'deferred')),
  'each leaderless cycle defers the ledger cure with replica_inventory_unavailable');
  t.same(ledgerWithoutLeader, [], 'no ledger operation is written meanwhile');
  t.equal(afterLeader.length, 1,
    'the first cycle after the services-p1 leader appears admits the ledger cure');
  t.equal(afterLeader[0]?.admitted, 1,
    'that first cycle after the leader appears admits the ledger spread-restoring move');
  t.equal(spreadRestoringRows(scene).length, 1,
    'exactly one spread-restoring operation is written for the ledger');
});

test('E4(a) services-p1 loses two of its three replicas: no leader is ever elected, and ' +
  'the guard grants nothing for a services-p1 cure, with or without the escape',
{timeout: CASE_TIMEOUT_MS}, async (t) => {
  const scene = await openCureScene(t, {cureNodeIds: [NODE.PEER_A, NODE.PEER_A, NODE.PEER_B]});
  const {world, host} = scene;
  // Quorum-equivalent to losing node A of [A,A,B]: two replicas gone, the
  // planner's replica survives.
  world.cutOffFromConsensus(NODE.PEER_A);
  world.cutOffFromConsensus(NODE.PEER_B);
  const stepDown = await waitUntil(() => leadingReplica(world) === null, LEADERSHIP_BUDGET_MS);
  t.ok(stepDown, `setup: the old leader stepped down: ${JSON.stringify(rolesOf(world))}`);
  const samples = [];
  const observeUntil = Date.now() + QUORUM_LOSS_OBSERVE_MS;
  while (Date.now() < observeUntil) {
    samples.push(leadingReplica(world)?.nodeId ?? null);
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
  const attempt = await settle(() => host.coordinator.createOperation({
    type: OperationType.ADD, partitionId: SERVICES_PARTITION_ID,
    entityType: EntityType.PARTITION, entityId: SERVICES_PARTITION_ID, nodeId: FREE_NODE_C,
    replicaId: null, moveReason: MOVE_REASON.SPREAD_REPLICAS,
    enforceConcurrentOperationBudget: true}));
  const servicesLedger = (host.store.execute(LEDGER_SQL, [SERVICES_PARTITION_ID]).rows || [])
    .map((row) => ({type: row.type, target_node_id: row.target_node_id}));
  observe(t, 'E4a', {escapePresent: scene.escape !== null, roles: rolesOf(world),
    leaderSamples: samples.filter((nodeId) => nodeId !== null).length,
    sampleCount: samples.length, escape: scene.escape,
    attempt: {admitted: attempt.error === null,
      reason: attempt.error?.admissionResult?.reason ?? null,
      decisionType: attempt.error?.admissionResult?.decisionType ?? null,
      skip: attempt.error?.rebalanceSkipReason ?? null,
      message: attempt.error ? String(attempt.error.message).slice(0, ERROR_TEXT_LIMIT) : null},
    servicesLedger});

  t.ok(samples.every((nodeId) => nodeId === null),
    'no services-p1 replica leads while two of three are gone (no quorum, no conf change)');
  t.equal(isNonLedgerPriorityPlacementCurePartition(SERVICES_PARTITION_ID), false,
    'services-p1 is outside the escape\'s partition scope at every commit');
  t.ok((scene.escape ?? []).every((call) => call.engaged === false),
    'where the escape exists it does not engage for services-p1');
  t.not(attempt.error, null, 'the services-p1 cure is not admitted');
  t.same(servicesLedger, [], 'no operation is written for services-p1');
});
