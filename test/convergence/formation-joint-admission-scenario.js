// Scenario runner of the joint-admission release-liveness reproducer: an
// arrival order is a list of events applied to a formation world; the world
// is then evaluated round by round to a fixpoint, and the report states what
// every owner said there. Observation only: nothing here decides.

import assert from 'node:assert/strict';

import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  READY_SIGNAL_STATE,
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
const ROUND_CAP = 10;
const MEMBERSHIP_KIND = 'cluster_membership';
const OUTCOME = Object.freeze({
  RELEASED: 'released',
  STUCK: 'stuck',
  ROUND_CAP: 'round_cap',
});
const VOTER_READY_FLOOR = 3;
const LIST_SEPARATOR = ',';
const SYNCING_STATUS = 'syncing';

const arrive = (nodeId) => Object.freeze({type: EVENT.ARRIVE, nodeId});
const readAuthority = () => Object.freeze({type: EVENT.READ_AUTHORITY});
const revoke = (nodeId) => Object.freeze({type: EVENT.REVOKE, nodeId});
const derive = () => Object.freeze({type: EVENT.DERIVE});

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

// The client-facing cluster gates as their owners answer them: the committed
// serve-eligibility decision per node, and the HARD priority-recovery
// dependency the /readyz evaluator consumes.
function clusterGates(driver) {
  const readiness = driver.world.seed.controlPlaneReadinessService;
  const now = driver.world.clock.now();
  const serve = {};
  for (const node of nodeStates(driver.world)) {
    const answer = readiness.answerServeEligibility(node.nodeId);
    serve[node.nodeId] = {
      decision: answer?.decision || null,
      reasons: answer?.reasons || [],
    };
  }
  const readyz = {};
  for (const [nodeId, hosts] of driver.world.hostsById) {
    const health = hosts.controlPlaneReadinessService
      .getPriorityControlPlaneRecoveryHealthSync(nodeId, now);
    readyz[nodeId] = {
      priorityControlPlaneRecoveryHealthy: health?.healthy === true,
      reasonCode: health?.healthy === true ? null : health?.reasonCode || null,
    };
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
async function runArrivalOrder(order) {
  const world = createFormationWorld();
  const driver = createRoundDriver(world);
  const safety = {
    openClusterGates: [],
    floorViolations: [],
  };
  const baselineFloor = {};
  const observeSafety = (label) => {
    const membership = membershipRows(world);
    const latest = membership[membership.length - 1] || null;
    const spreadPublished = latest?.status === 'PUBLISHED' &&
      latest.spread?.satisfied === true;
    const gates = clusterGates(driver);
    if (!spreadPublished) {
      for (const [nodeId, answer] of Object.entries(gates.serve)) {
        if (answer.decision === 'eligible') {
          safety.openClusterGates.push({label, gate: 'serve', nodeId});
        }
      }
      for (const [nodeId, answer] of Object.entries(gates.readyz)) {
        if (answer.priorityControlPlaneRecoveryHealthy) {
          safety.openClusterGates.push({label, gate: 'readyz', nodeId});
        }
      }
    }
    for (const [partitionId, count] of
      Object.entries(voterReadyFloorCounts(world))) {
      if (baselineFloor[partitionId] === undefined) {
        baselineFloor[partitionId] = count;
      }
      if (count < Math.min(VOTER_READY_FLOOR, baselineFloor[partitionId])) {
        safety.floorViolations.push({label, partitionId, count});
      }
    }
  };
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
    let digest = worldDigest(driver);
    let rounds = 0;
    let fixpoint = false;
    while (rounds < ROUND_CAP && !fixpoint) {
      await driver.round();
      rounds += 1;
      observeSafety(`round ${rounds}`);
      const next = worldDigest(driver);
      fixpoint = next === digest;
      digest = next;
    }
    const joiners = joinerStates(driver);
    const admitted = new Set(
      (membershipRows(world).at(-1)?.members || [])
        .filter((nodeId) => nodeId !== SEED_NODE_ID));
    const stuckJoiners = joiners.filter((joiner) =>
      admitted.has(joiner.nodeId) && !joiner.readyLease);
    const armedTimers = world.frozen.armedTimers();
    const elapsedMs = world.clock.now() - WORLD_START_MS;
    const shortestArmedDelayMs = Math.min(
      ...armedTimers.map((timer) => timer.delayMs),
      ...joiners.flatMap((joiner) =>
        joiner.armedSleeps.map((sleep) => sleep.delayMs)),
    );
    // No timer was due inside the run: the run is shorter than the shortest
    // delay any owner armed.
    assert.ok(elapsedMs < shortestArmedDelayMs,
      `the run (${elapsedMs} ms) must stay below the shortest armed delay ` +
      `(${shortestArmedDelayMs} ms)`);
    const armedBy = {};
    for (const timer of armedTimers) {
      const key = `${Math.round(timer.delayMs)} ms ${timer.armedBy}`;
      armedBy[key] = (armedBy[key] || 0) + 1;
    }
    return {
      outcome: !fixpoint ? OUTCOME.ROUND_CAP :
        stuckJoiners.length > 0 ? OUTCOME.STUCK : OUTCOME.RELEASED,
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
      nodes: nodeStates(world),
      planners: plannerStates(driver),
      operations: operationRows(world),
      placement: placement(world),
      voterReadyFloor: voterReadyFloorCounts(world),
      clusterGates: clusterGates(driver),
      safety,
      timersThatWouldHaveToExpire: armedBy,
    };
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
  lines.push('timers that would have to expire: ' +
    JSON.stringify(report.timersThatWouldHaveToExpire));
  return lines.join('\n');
}

export {
  OUTCOME,
  READY_SIGNAL_STATE,
  arrive,
  derive,
  describeOrder,
  formatStuckReport,
  readAuthority,
  revoke,
  runArrivalOrder,
};
