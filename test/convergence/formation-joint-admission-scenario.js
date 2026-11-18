// Scenario runner of the joint-admission release-liveness reproducer: an
// arrival order is a list of events applied to a formation world; the world
// is then evaluated round by round to a fixpoint, and the report states what
// every owner said there. Observation only: nothing here decides.

import assert from 'node:assert/strict';

import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  STEPPED_CADENCE_NAMES,
  createRoundDriver,
} from './formation-joint-admission-rounds.js';
import {
  PRIORITY_PARTITION_IDS,
  SEED_NODE_ID,
  WORLD_START_MS,
  createFormationWorld,
} from './formation-joint-admission-world.js';

const EVENT = Object.freeze({
  ARRIVE: 'arrive',
  READ_AUTHORITY: 'read_authority',
  REVOKE: 'revoke',
  DERIVE: 'derive',
});
const ROUND_CAP = 60;
const MEMBERSHIP_KIND = 'cluster_membership';
const OUTCOME = Object.freeze({
  RELEASED: 'released',
  STUCK: 'stuck',
  ROUND_CAP: 'round_cap',
});
const VOTER_READY_FLOOR = 3;
const SPREAD_NODE_COUNT = 3;
// The admission reason of the ledger quorum hold
// (operation-ledger-hold-policy.js).
const LEDGER_QUORUM_HOLD_REASON = 'operation_ledger_quorum_concentrated';
const LIST_SEPARATOR = ',';
const SYNCING_STATUS = 'syncing';

const arrive = (nodeId) => Object.freeze({type: EVENT.ARRIVE, nodeId});
const readAuthority = () => Object.freeze({type: EVENT.READ_AUTHORITY});
const revoke = (nodeId) => Object.freeze({type: EVENT.REVOKE, nodeId});
const derive = () => Object.freeze({type: EVENT.DERIVE});

const J1 = 'j1';
const J2 = 'j2';
const J3 = 'j3';
const J4 = 'j4';
// The measured losing order (lab job 0bc41a40, run repeat-551bf264/run-1):
// one joiner arrives, the seed's authority is read, that joiner's connection
// is re-identified, and one membership derivation then admits both joiners.
const LOSING_ORDER = Object.freeze([
  arrive(J1), readAuthority(), revoke(J1), arrive(J2), derive(),
]);
// One joiner per derivation, the authority read between them.
const WINNING_ORDER = Object.freeze([
  arrive(J1), readAuthority(), revoke(J1), derive(), readAuthority(),
  arrive(J2), derive(),
]);
// The arrival orders every formation reproducer sweeps.
const SWEEP = Object.freeze([
  {name: 'two/same-derivation/after-revoke', order: LOSING_ORDER},
  {name: 'two/successive-derivations/after-revoke', order: WINNING_ORDER},
  {name: 'two/same-derivation/never-captured',
    order: [arrive(J1), arrive(J2), derive()]},
  {name: 'two/same-derivation/captured-not-revoked',
    order: [arrive(J1), readAuthority(), arrive(J2), derive()]},
  {name: 'two/same-derivation/read-between-revoke-and-derivation',
    order: [arrive(J1), readAuthority(), revoke(J1), arrive(J2),
      readAuthority(), derive()]},
  {name: 'two/successive-derivations/no-read-between',
    order: [arrive(J1), readAuthority(), revoke(J1), derive(), arrive(J2),
      derive()]},
  {name: 'four/same-derivation/after-revoke',
    order: [arrive(J1), readAuthority(), revoke(J1), arrive(J2), arrive(J3),
      arrive(J4), derive()]},
  {name: 'four/successive-derivations/after-revoke',
    order: [arrive(J1), readAuthority(), revoke(J1), derive(), readAuthority(),
      arrive(J2), derive(), readAuthority(), arrive(J3), derive(),
      readAuthority(), arrive(J4), derive()]},
  {name: 'four/same-derivation/captured-not-revoked',
    order: [arrive(J1), readAuthority(), arrive(J2), arrive(J3), arrive(J4),
      derive()]},
]);

function parseColumn(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function membershipRows(world) {
  return world.cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS)
    .filter((row) => row.publication_kind === MEMBERSHIP_KIND)
    .sort((left, right) => left.publication_epoch - right.publication_epoch)
    .map((row) => {
      const summary = parseColumn(row.priority_partition_summary);
      return {
        epoch: row.publication_epoch,
        status: row.status,
        members: parseColumn(row.published_active_node_ids),
        acknowledged: parseColumn(row.acknowledged_node_ids),
        spread: summary ? {
          satisfied: summary.satisfied,
          required: summary.requiredDistinctNodeCount,
          blocked: (summary.blockedPartitions || []).map((blocked) =>
            `${blocked.partitionId}:${blocked.readyDistinctNodeCount}/` +
            `${blocked.requiredDistinctNodeCount}`),
        } : null,
      };
    });
}

function nodeStates(world) {
  return world.cache.getAll(TABLES.NODES).map((row) => ({
    nodeId: row[COLUMN.NODE_ID],
    status: row[COLUMN.STATUS],
    connectionState: row[COLUMN.CONNECTION_STATE],
    readyLease: isNodeRecordReady(row, {now: world.clock.now()}),
  }));
}

function operationRows(world) {
  return world.cache.getAll(TABLES.REPLICA_OPERATIONS).map((row) => ({
    operationId: row.operation_id,
    terminal: row.completed_at !== null && row.completed_at !== undefined,
    type: row.type,
    partitionId: row.partition_id,
    sourceNodeId: row.source_node_id || null,
    targetNodeId: row.target_node_id || null,
    step: row.workflow_step,
    status: row.status,
  }));
}

// The voter-ready replicas of a priority partition on READY nodes: what the
// remove-safety floor counts (an ACTIVE or SYNCING voter row on a node whose
// committed row holds a current READY lease).
function voterReadyFloorCounts(world) {
  const readyNodeIds = new Set(nodeStates(world)
    .filter((node) => node.readyLease).map((node) => node.nodeId));
  const counts = {};
  for (const partitionId of PRIORITY_PARTITION_IDS) {
    counts[partitionId] = world.cache.filter(TABLES.SERVICES, (row) =>
      row[COLUMN.PARTITION_ID] === partitionId &&
      readyNodeIds.has(row[COLUMN.NODE_ID]) &&
      (row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE ||
        row[COLUMN.STATUS] === SYNCING_STATUS) &&
      (row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER ||
        row[COLUMN.RAFT_ROLE] === RAFT_ROLE.FOLLOWER)).length;
  }
  return counts;
}

function formatReadyzHealth(health) {
  const healthy = health?.healthy === true;
  return {
    priorityControlPlaneRecoveryHealthy: healthy,
    reasonCode: healthy ? null : health?.reasonCode || null,
  };
}

// The client-facing cluster gates as their owners answer them: the committed
// serve-eligibility decision per node, and the HARD priority-recovery
// dependency the /readyz evaluator consumes.
function clusterGates(driver) {
  const readiness = driver.world.seed.controlPlaneReadinessService;
  const now = driver.world.clock.now();
  const serve = {};
  for (const node of nodeStates(driver.world)) {
    if (!driver.world.upNodeIds.has(node.nodeId)) continue;
    const answer = readiness.answerServeEligibility(node.nodeId);
    serve[node.nodeId] = {
      decision: answer?.decision || null,
      reasons: answer?.reasons || [],
    };
  }
  const readyz = {};
  for (const [nodeId, hosts] of driver.world.hostsById) {
    if (!driver.world.upNodeIds.has(nodeId)) continue;
    const health = hosts.controlPlaneReadinessService
      .getPriorityControlPlaneRecoveryHealthSync(nodeId, now);
    readyz[nodeId] = formatReadyzHealth(health);
  }
  return {serve, readyz};
}

function joinerStates(driver) {
  return [...driver.joiners.values()].map((joiner) => {
    const barrier = joiner.barrier();
    return {
      nodeId: joiner.nodeId,
      readySignal: joiner.state,
      gate: joiner.service.infrastructureJoinProgress?.readySignalGate || null,
      readyLease: joiner.isReady(),
      barrier: barrier ? {
        state: barrier.state,
        candidateNodeCount: barrier.candidateNodeCount,
        preReadyCandidateNodeCount: barrier.preReadyCandidateNodeCount,
        startupAuthorityAvailable: barrier.startupAuthorityAvailable,
        startupAuthorityState: barrier.startupAuthorityState,
        startupAuthorityRecoveryReasonCodes:
          barrier.startupAuthorityRecoveryReasonCodes,
        formationReleaseHandoffState: barrier.formationReleaseHandoffState,
        formationReleaseHandoffReleaseAuthorized:
          barrier.formationReleaseHandoffReleaseAuthorized,
      } : null,
      armedSleeps: joiner.armedSleeps(),
      failure: joiner.failure ? joiner.failure.message : null,
    };
  });
}

function seedAuthorityState(driver) {
  const authority = driver.seedAuthority();
  const handoff = authority.formationReleaseHandoff;
  return {
    state: authority.state,
    ready: authority.ready,
    authorityAvailable: authority.authorityAvailable,
    reasonCodes: authority.priorityRecoveryReasonCodes,
    publicationEpoch: authority.publicationEpoch,
    canonicalStartupNodeIds: authority.canonicalStartupNodeIds,
    handoff: handoff ? {
      state: handoff.state,
      reason: handoff.reason,
      generation: handoff.generation,
      releaseAuthorized: handoff.releaseAuthorized,
      requiredCohort: (handoff.requiredCohort || [])
        .map((member) => member.nodeId),
    } : null,
  };
}

// Each planner's gate and the refusals of its own moves it stated in the
// LAST round (a refusal it did not repeat is not standing).
function plannerStates(driver) {
  const planners = {};
  for (const [partitionId, statement] of driver.plannerStatements) {
    planners[partitionId] = {
      gate: statement.gate,
      refusals: [...statement.refusals.values()]
        .filter((refusal) => refusal.round === driver.roundCounter.number)
        .map((refusal) => ({
          moveType: refusal.moveType,
          targetNodeId: refusal.targetNodeId,
          replicaId: refusal.replicaId,
          reason: refusal.reason,
          error: refusal.error,
        })),
    };
  }
  return planners;
}

// Where every replica of a priority partition is, and in what state.
function placement(world) {
  const holders = {};
  for (const partitionId of PRIORITY_PARTITION_IDS) {
    holders[partitionId] = world.cache.filter(TABLES.SERVICES, (row) =>
      row[COLUMN.PARTITION_ID] === partitionId).map((row) =>
      `${row[COLUMN.NODE_ID]}:${row[COLUMN.STATUS]}:${row[COLUMN.RAFT_ROLE]}`)
      .sort();
  }
  return holders;
}

// The fixpoint digest: the durable rows and the owner states. A round that
// leaves it unchanged changed nothing any owner decides on.
function worldDigest(driver) {
  return JSON.stringify({
    nodes: nodeStates(driver.world),
    membership: membershipRows(driver.world),
    operations: operationRows(driver.world),
    placement: placement(driver.world),
    authority: seedAuthorityState(driver),
    joiners: joinerStates(driver).map((joiner) => ({
      ...joiner, armedSleeps: joiner.armedSleeps.length})),
    planners: plannerStates(driver),
    handoffTransitions: driver.handoffTransitions.length,
  });
}

async function applyEvent(driver, event) {
  if (event.type === EVENT.ARRIVE) {
    await driver.joinerArrives(event.nodeId);
  } else if (event.type === EVENT.READ_AUTHORITY) {
    await driver.readSeedAuthority();
  } else if (event.type === EVENT.DERIVE) {
    await driver.membershipDerivation();
  } else {
    // The captured joiner's connection is re-identified on the seed: absent
    // at one authority read, bound again after it.
    await driver.seedLinkTo(event.nodeId, false);
    await driver.readSeedAuthority();
    await driver.seedLinkTo(event.nodeId, true);
  }
}

/**
 * Run one arrival order to its fixpoint.
 * @param {object[]} order the events, in order
 * @return {Promise<object>} the report
 */
// The spread half of the claim, read from the durable rows: every priority
// partition is held by voters on SPREAD_NODE_COUNT distinct READY nodes (or
// on every READY node when there are fewer), no surplus replica is left, and
// no operation is unfinished.
function spreadState(world) {
  const readyNodeIds = new Set(nodeStates(world)
    .filter((node) => node.readyLease).map((node) => node.nodeId));
  const required = Math.min(SPREAD_NODE_COUNT, readyNodeIds.size);
  const partitions = {};
  for (const partitionId of PRIORITY_PARTITION_IDS) {
    const rows = world.cache.filter(TABLES.SERVICES, (row) =>
      row[COLUMN.PARTITION_ID] === partitionId);
    const voterNodeIds = new Set(rows.filter((row) =>
      readyNodeIds.has(row[COLUMN.NODE_ID]) &&
      row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
      (row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER ||
        row[COLUMN.RAFT_ROLE] === RAFT_ROLE.FOLLOWER))
      .map((row) => row[COLUMN.NODE_ID]));
    partitions[partitionId] = {
      distinctReadyVoterNodes: voterNodeIds.size,
      replicas: rows.length,
    };
  }
  const unfinished = operationRows(world).filter((row) => !row.terminal);
  return {
    required,
    partitions,
    spreadOnDistinctNodes: Object.values(partitions).every((partition) =>
      partition.distinctReadyVoterNodes >= required),
    surplusRemoved: Object.values(partitions).every((partition) =>
      partition.replicas === SPREAD_NODE_COUNT),
    unfinishedOperations: unfinished.map((row) =>
      `${row.type} ${row.partitionId} ${row.sourceNodeId || ''}>` +
      `${row.targetNodeId} ${row.step}`),
  };
}

function latestMembership(world) {
  const membership = membershipRows(world);
  return membership[membership.length - 1] || null;
}

function isSpreadPublished(world) {
  const latest = latestMembership(world);
  return latest?.status === 'PUBLISHED' && latest.spread?.satisfied === true;
}

function openClientGateLabels(answers) {
  return [
    ...Object.entries(answers.serve).filter(([, answer]) =>
      answer.decision === 'eligible').map(([nodeId]) => `serve:${nodeId}`),
    ...Object.entries(answers.readyz).filter(([, answer]) =>
      answer.priorityControlPlaneRecoveryHealthy)
      .map(([nodeId]) => `readyz:${nodeId}`),
  ];
}

function recordSpreadSafety(world, safety, spreadPublished, open, label) {
  if (!spreadPublished) {
    for (const gate of open) {
      safety.openClusterGates.push({label, gate});
    }
    return;
  }
  const members = latestMembership(world).members.length;
  const required = Math.min(SPREAD_NODE_COUNT, members);
  for (const [partitionId, partition] of
    Object.entries(spreadState(world).partitions)) {
    if (partition.distinctReadyVoterNodes < required) {
      safety.summaryAheadOfRows.push({label, partitionId,
        distinctReadyVoterNodes: partition.distinctReadyVoterNodes});
    }
  }
}

function recordFloorSafety(world, baselineFloor, safety, label) {
  for (const [partitionId, count] of
    Object.entries(voterReadyFloorCounts(world))) {
    if (baselineFloor[partitionId] === undefined) {
      baselineFloor[partitionId] = count;
    }
    safety.lowestVoterReady[partitionId] = Math.min(
      safety.lowestVoterReady[partitionId] ?? count, count);
    if (count < Math.min(VOTER_READY_FLOOR, baselineFloor[partitionId])) {
      safety.floorViolations.push({label, partitionId, count});
    }
  }
  safety.admittedRemovals = world.replicaRuntime.retiredReplicaIds.size;
}

function recordOperationTimeline(world, seenOperations, timeline, label) {
  for (const row of operationRows(world)) {
    const name = `${row.type} ${row.partitionId} ` +
      `${row.sourceNodeId || ''}>${row.targetNodeId}`;
    const seen = seenOperations.get(row.operationId);
    if (!seen) {
      seenOperations.set(row.operationId, {terminal: row.terminal});
      timeline.push(`${label}: + ${name}`);
    }
    if (row.terminal && !(seen && seen.terminal)) {
      seenOperations.get(row.operationId).terminal = true;
      timeline.push(`${label}: = ${name} ${row.step}`);
    }
  }
}

function recordPlannerRefusals(driver, refusalReasons, ledgerHold, timeline,
  label) {
  const round = driver.roundCounter.number;
  let heldThisRound = false;
  for (const [partitionId, statement] of driver.plannerStatements) {
    for (const refusal of statement.refusals.values()) {
      if (refusal.round !== round || refusal.counted === true) continue;
      refusal.counted = true;
      const reason = refusal.reason || refusal.error || 'unstated';
      refusalReasons[reason] = (refusalReasons[reason] || 0) + 1;
      if (reason === LEDGER_QUORUM_HOLD_REASON) {
        heldThisRound = true;
        ledgerHold.refusedMoves += 1;
        timeline.push(`${label}: hold ${refusal.moveType} ${partitionId}` +
          ` >${refusal.targetNodeId}`);
      }
    }
  }
  if (heldThisRound) ledgerHold.engagedRounds.push(round);
}

// What the run observes at every observation point. Observation only.
function createObserver(world, driver) {
  const safety = {
    openClusterGates: [],
    floorViolations: [],
    // The published summary states the spread while the replica rows do not
    // hold it for the published members.
    summaryAheadOfRows: [],
    // Every replica removal that was admitted, dispatched and committed, and
    // the lowest voter-ready count each partition was ever observed at.
    admittedRemovals: 0,
    lowestVoterReady: {},
  };
  const baselineFloor = {};
  const timeline = [];
  const seenOperations = new Map();
  const ledgerHold = {engagedRounds: [], refusedMoves: 0};
  const refusalReasons = {};
  // Every change of (spread published, a client-facing gate open), in order.
  const gates = [];
  const observe = (label) => {
    const spreadPublished = isSpreadPublished(world);
    const open = openClientGateLabels(clusterGates(driver));
    const last = gates[gates.length - 1];
    if (!last || last.spreadPublished !== spreadPublished ||
        last.openGates !== open.length) {
      gates.push({label, spreadPublished, openGates: open.length});
    }
    recordSpreadSafety(world, safety, spreadPublished, open, label);
    recordFloorSafety(world, baselineFloor, safety, label);
    recordOperationTimeline(world, seenOperations, timeline, label);
    recordPlannerRefusals(driver, refusalReasons, ledgerHold, timeline, label);
  };
  return {safety, timeline, ledgerHold, refusalReasons, gates, observe};
}

async function runRoundsToFixpoint(driver, world, observeSafety, scripted) {
  let digest = worldDigest(driver);
  let rounds = 0;
  let fixpoint = false;
  while (rounds < ROUND_CAP && !fixpoint) {
    if (scripted[rounds + 1]) {
      await scripted[rounds + 1](driver, world);
      observeSafety(`before round ${rounds + 1}`);
    }
    await driver.round();
    rounds += 1;
    observeSafety(`round ${rounds}`);
    const next = worldDigest(driver);
    fixpoint = next === digest &&
      !Object.keys(scripted).some((round) => Number(round) > rounds);
    digest = next;
  }
  return {rounds, fixpoint};
}

function summarizeArmedBounds(armedBounds) {
  const armedBy = {};
  for (const timer of armedBounds) {
    const key = `${Math.round(timer.delayMs)} ms ${timer.armedBy}`;
    armedBy[key] = (armedBy[key] || 0) + 1;
  }
  return armedBy;
}

function resolveArrivalOutcome(fixpoint, stuckJoiners) {
  if (!fixpoint) return OUTCOME.ROUND_CAP;
  return stuckJoiners.length > 0 ? OUTCOME.STUCK : OUTCOME.RELEASED;
}

function buildArrivalOrderReport({world, driver, observer, rounds, fixpoint}) {
  const joiners = joinerStates(driver);
  const admitted = new Set(
    (membershipRows(world).at(-1)?.members || [])
      .filter((nodeId) => nodeId !== SEED_NODE_ID));
  const stuckJoiners = joiners.filter((joiner) =>
    world.upNodeIds.has(joiner.nodeId) &&
    admitted.has(joiner.nodeId) && !joiner.readyLease);
  const armedBounds = driver.armedBounds();
  const elapsedMs = world.clock.now() - WORLD_START_MS;
  const shortestArmedDelayMs = Math.min(
    ...armedBounds.map((timer) => timer.delayMs),
    ...joiners.flatMap((joiner) =>
      joiner.armedSleeps.map((sleep) => sleep.delayMs)),
  );
  // No bound was due inside the run: the run is shorter than the shortest
  // delay of any armed timer that is not a stepped cadence, and no owner
  // reported a bound spent.
  assert.ok(elapsedMs < shortestArmedDelayMs,
    `the run (${elapsedMs} ms) must stay below the shortest armed bound ` +
    `(${shortestArmedDelayMs} ms)`);
  assert.deepEqual(driver.spentBounds, [],
    'no owner reported a wait bound spent');
  return {
    outcome: resolveArrivalOutcome(fixpoint, stuckJoiners),
    fixpoint,
    rounds,
    elapsedMs,
    shortestArmedDelayMs,
    admittedJoiners: [...admitted].sort(),
    stuckJoiners: stuckJoiners.map((joiner) => joiner.nodeId),
    joiners,
    authority: seedAuthorityState(driver),
    handoffTransitions: driver.handoffTransitions.map((transition) => ({
      state: transition.state,
      reason: transition.reason,
      releaseAuthorized: transition.releaseAuthorized,
      observedPublicationEpoch: transition.observedPublicationEpoch,
      requiredCohort: (transition.requiredCohort || [])
        .map((member) => member.nodeId),
    })),
    membership: membershipRows(world),
    // Every publication row that is not a membership publication, by kind:
    // the removed formation-release handoff wrote such rows.
    otherPublicationKinds: world.cache
      .getAll(TABLES.CONTROL_PLANE_PUBLICATIONS)
      .filter((row) => row.publication_kind !== MEMBERSHIP_KIND)
      .map((row) => row.publication_kind),
    nodes: nodeStates(world),
    planners: plannerStates(driver),
    operations: operationRows(world),
    placement: placement(world),
    voterReadyFloor: voterReadyFloorCounts(world),
    clusterGates: clusterGates(driver),
    safety: observer.safety,
    spread: {
      ...spreadState(world),
      summarySatisfied: isSpreadPublished(world),
    },
    timeline: observer.timeline,
    ledgerHold: observer.ledgerHold,
    refusalReasons: observer.refusalReasons,
    gates: observer.gates,
    steppedCadences: driver.steppedCadences(),
    spentBounds: driver.spentBounds,
    timersThatWouldHaveToExpire: summarizeArmedBounds(armedBounds),
  };
}

/**
 * Run one arrival order to its fixpoint.
 * @param {object[]} order the events, in order
 * @param {object} [options]
 * @param {Function} [options.afterReadySignals] events applied once every
 *   joiner's ready signal has been started (a witness's own disturbance)
 * @return {Promise<object>} the report
 */
async function runArrivalOrder(order, options = {}) {
  const world = createFormationWorld();
  const driver = createRoundDriver(world);
  const observer = createObserver(world, driver);
  const observeSafety = observer.observe;
  try {
    await driver.formSeed();
    observeSafety('seed formed');
    for (const [index, event] of order.entries()) {
      await applyEvent(driver, event);
      observeSafety(`event ${index} ${event.type}`);
    }
    for (const joiner of driver.joiners.values()) {
      driver.startReadySignal(joiner.nodeId);
    }
    await driver.settle();
    observeSafety('ready signals started');
    let {rounds, fixpoint} = await runRoundsToFixpoint(
      driver, world, observeSafety, options.rounds || {});
    if (fixpoint && typeof options.afterFixpoint === 'function') {
      await options.afterFixpoint(driver, world, observeSafety);
      observeSafety('after fixpoint action');
      const next = await runRoundsToFixpoint(
        driver, world, observeSafety, options.afterFixpointRounds || {});
      rounds += next.rounds;
      fixpoint = next.fixpoint;
    }
    return buildArrivalOrderReport({world, driver, observer, rounds, fixpoint});
  } finally {
    driver.close();
  }
}

function describeOrder(order) {
  return order.map((event) =>
    (event.nodeId ? `${event.type}(${event.nodeId})` : event.type))
    .join(LIST_SEPARATOR);
}

// What a stuck fixpoint prints: every edge of the cycle that the composed
// owners state, and what they do not state.
function formatStuckReport(report) {
  const lines = [];
  lines.push(`fixpoint after ${report.rounds} rounds, ${report.elapsedMs} ms ` +
    'of evaluation instants (shortest armed delay ' +
    `${report.shortestArmedDelayMs} ms): no timer fired`);
  for (const joiner of report.joiners) {
    lines.push(`joiner ${joiner.nodeId}: readyLease=${joiner.readyLease} ` +
      `readySignal=${joiner.readySignal} gate=${joiner.gate} ` +
      `barrier=${JSON.stringify(joiner.barrier)}`);
  }
  lines.push(`seed startup authority: ${JSON.stringify(report.authority)}`);
  lines.push('handoff transitions: ' + report.handoffTransitions.map(
    (transition) => `${transition.state}/${transition.reason}` +
      `@e${transition.observedPublicationEpoch}` +
      `[${transition.requiredCohort.join(LIST_SEPARATOR)}]` +
      `${transition.releaseAuthorized ? ' authorized' : ''}`).join(' -> '));
  lines.push(`membership: ${JSON.stringify(report.membership)}`);
  for (const [partitionId, planner] of Object.entries(report.planners)) {
    lines.push(`planner ${partitionId}: ` +
      `gate=${JSON.stringify(planner.gate?.bypassState || null)} ` +
      `refusals=${JSON.stringify(planner.refusals)}`);
  }
  lines.push(`operations: ${JSON.stringify(report.operations)}`);
  lines.push(`placement: ${JSON.stringify(report.placement)}`);
  lines.push('voter-ready floor (replicas on READY nodes): ' +
    JSON.stringify(report.voterReadyFloor));
  lines.push(`cluster gates: ${JSON.stringify(report.clusterGates)}`);
  lines.push(`spread: ${JSON.stringify(report.spread)}`);
  lines.push(`safety: ${JSON.stringify(report.safety)}`);
  lines.push(`cadences stepped: ${JSON.stringify(report.steppedCadences)}`);
  lines.push('timers that would have to expire: ' +
    JSON.stringify(report.timersThatWouldHaveToExpire));
  return lines.join('\n');
}

export {
  LOSING_ORDER,
  OUTCOME,
  STEPPED_CADENCE_NAMES,
  SWEEP,
  VOTER_READY_FLOOR,
  WINNING_ORDER,
  applyEvent,
  arrive,
  createObserver,
  derive,
  describeOrder,
  formatStuckReport,
  isSpreadPublished,
  membershipRows,
  nodeStates,
  readAuthority,
  revoke,
  runArrivalOrder,
  worldDigest,
};
