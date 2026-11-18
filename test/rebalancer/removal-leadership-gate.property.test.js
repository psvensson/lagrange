/**
 * The universal removal leadership rule (owner rule 2026-11-11): a replica
 * that is its group's current leader is never the subject of a removal
 * effect. Every removal reads the group's leader authority first; a leading
 * subject gets one named-target transfer and the removal waits, named,
 * until a survivor is corroborated as leader.
 *
 * Properties over partition class (user, non-priority system, priority
 * control plane) x operation type (REPLACE, plain REMOVE) x leader position
 * (the subject, a survivor, the REPLACE target, nobody) x transferee
 * availability (survivors past their participation gate or not) x leader
 * authority readability (readable, the subject's node dead, a majority
 * unreachable), driven through the real coordinator's executeOperation:
 *  P1 no REMOVE_REPLICA leaves while the group's true current leader is the
 *     subject (checked at the effect's own delivery);
 *  P2 every round that does not send the effect is a named wait
 *     (SAFETY_BLOCKED with a deferReason and a message), never a terminal
 *     failure;
 *  P3 once the world allows it (a survivor leads, or the subject leads and
 *     a live transferee exists, or the world heals) the removal proceeds;
 *  P4 a removal whose subject does not lead, with a readable authority, is
 *     sent in its first round with no leadership transfer.
 * The group is a double of the replica handlers' membership and STEP_DOWN
 * answers (removal-leadership-group-fixture.js); rows are routes only.
 */
import fc from 'fast-check';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {createMockPolicyService, createTestCoordinator} from './test-helpers.js';
import {
  createPublishedPlanningReadinessService,
} from './quorum-conditioned-remove-safety-tail-fixture-builders.js';
import {createLeadershipGroup} from './removal-leadership-group-fixture.js';

const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c', 'node-d']);
const SUBJECT_NODE = 'node-a';
const TARGET_NODE = 'node-d';
const OWNER_NODE = 'node-b';
const PARTITION_CLASSES = Object.freeze({
  USER: 'orders-p1',
  SYSTEM: 'config-p1',
  PRIORITY: 'schema_operations-p1',
});
const LEADER_POSITION = Object.freeze({
  SUBJECT: 'subject',
  SURVIVOR: 'survivor',
  TARGET: 'target',
  NONE: 'none',
});
const READABILITY = Object.freeze({
  READABLE: 'readable',
  SUBJECT_DEAD: 'subject_dead',
  MAJORITY_UNREACHABLE: 'majority_unreachable',
});
const ROUNDS = 7;
// The round at which a dead leader's survivors have elected.
const ELECTION_ROUND = 2;
// The round at which the world heals (members back, gates open, a leader).
const HEAL_ROUND = 4;
// Past the fixture's 1 s transfer window per round.
const ROUND_ADVANCE_MS = 2_000;
const READY_LEASE_MS = 60_000;
const NAMED_DEFER_REASONS = Object.freeze(new Set([
  REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED,
  REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED,
]));

function idsOf(partitionId) {
  return Object.freeze({
    subject: `${partitionId}-r1`,
    survivor: `${partitionId}-r2`,
    peer: `${partitionId}-r3`,
    fourth: `${partitionId}-r4`,
  });
}

function serviceRow(replicaId, nodeId, partitionId) {
  return {service_id: replicaId, replica_id: replicaId,
    partition_id: partitionId, node_id: nodeId, service_type: 'partition',
    status: 'active', raft_role: 'follower',
    address: `${nodeId}/partition/${replicaId}`};
}

function leaderOf(position, ids) {
  return {
    [LEADER_POSITION.SUBJECT]: ids.subject,
    [LEADER_POSITION.SURVIVOR]: ids.survivor,
    [LEADER_POSITION.TARGET]: ids.fourth,
    [LEADER_POSITION.NONE]: null,
  }[position];
}

// The repository's structural owner: a system REPLACE's target node, a user
// REPLACE's source node, a REMOVE's creating coordinator.
function ownerNodeOf(scenario) {
  if (scenario.type !== OperationType.REPLACE) {
    return OWNER_NODE;
  }
  return scenario.partitionId === PARTITION_CLASSES.USER ?
    SUBJECT_NODE : TARGET_NODE;
}

function buildGroup(scenario, ids) {
  const members = [ids.subject, ids.survivor, ids.peer, ids.fourth]
    .map((replicaId, index) => ({replicaId, nodeId: NODE_IDS[index],
      gateOpen: index === 0 || scenario.transfereesLive}));
  const down = {
    [READABILITY.READABLE]: [],
    [READABILITY.SUBJECT_DEAD]: [ids.subject],
    [READABILITY.MAJORITY_UNREACHABLE]: [ids.survivor, ids.peer, ids.fourth],
  }[scenario.readability];
  return createLeadershipGroup({partitionId: scenario.partitionId, members,
    leaderReplicaId: leaderOf(scenario.leaderPosition, ids),
    transferOnStepDown: true, downReplicaIds: down});
}

async function createWorld(scenario) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const ids = idsOf(scenario.partitionId);
  const group = buildGroup(scenario, ids);
  const record = {removals: [], stepDowns: 0, violations: []};
  const groupRouter = group.router();
  const coordinator = createTestCoordinator({
    nodeId: ownerNodeOf(scenario),
    enableTimeouts: false,
    replaceWitness: false,
    messageRouter: {
      deliver: async (target, payload) => {
        const type = payload?.[ReplicaOperationField.TYPE];
        if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
          // P1 at the effect's own delivery: the group's true leader.
          const subject = payload[ReplicaOperationField.REPLICA_ID];
          if (group.leaderReplicaId === subject) {
            record.violations.push({subject, leader: group.leaderReplicaId});
          }
          record.removals.push(subject);
          return buildDeliveryEnvelope({acknowledged: true},
            {status: ReplicaOperationResponseStatus.INITIATED});
        }
        if (type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
          record.stepDowns += 1;
        }
        return groupRouter.deliver(target, payload);
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    readinessFixture: {
      callbacks: createPublishedPlanningReadinessService({
        publicationStatus: 'PUBLISHED',
        activeNodeIds: NODE_IDS,
        membershipTargetNodeId: TARGET_NODE,
      }),
    },
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3,
        minReplicaCount: 3}),
    }),
    cacheData: {
      nodes: NODE_IDS.map((nodeId) => ({node_id: nodeId,
        status: NODE_STATE.ACTIVE, connection_state: NODE_STATE.READY,
        ready_lease_expires_at: Date.now() + READY_LEASE_MS})),
      services: group.members.map((member) =>
        serviceRow(member.replicaId, member.nodeId, scenario.partitionId)),
    },
  });
  coordinator.initialize();
  // The priority surplus-REMOVE placement fence is the creation admission
  // owner's (not under test); the operation exists before the gate runs.
  coordinator.ensurePrioritySurplusRemovePlacementFenceAllowed =
    async () => {};
  const operation = scenario.type === OperationType.REPLACE ?
    await createReplace(coordinator, scenario.partitionId, ids) :
    await coordinator.createOperation({type: OperationType.REMOVE,
      partitionId: scenario.partitionId, nodeId: SUBJECT_NODE,
      replicaId: ids.subject});
  const owner = coordinator.workflowOwner;
  let advancedMs = 0;
  const baseNow = owner.resolveTimeoutCheckNowMs.bind(owner);
  owner.resolveTimeoutCheckNowMs = () => baseNow() + advancedMs;
  return {coordinator, operation, group, record, ids,
    advance: () => {
      advancedMs += ROUND_ADVANCE_MS;
    },
    shutdown: async () => {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }};
}

async function createReplace(coordinator, partitionId, ids) {
  const operation = await coordinator.createOperation({
    type: OperationType.REPLACE, partitionId, nodeId: TARGET_NODE,
    sourceNodeId: SUBJECT_NODE, replicaId: ids.subject});
  operation.replicaId = ids.fourth;
  operation.workflowStep = WORKFLOW_STEP.ACTIVE;
  operation.status = 'active';
  return operation;
}

// The world moves the way raft would between owner rounds.
function evolveWorld(world, round) {
  const {group, ids} = world;
  if (round === ELECTION_ROUND &&
      (group.leaderReplicaId === null ||
        group.downReplicaIds.has(group.leaderReplicaId)) &&
      !group.downReplicaIds.has(ids.survivor)) {
    group.elect(ids.survivor);
  }
  if (round === HEAL_ROUND) {
    group.downReplicaIds.clear();
    group.members.forEach((member) => {
      member.gateOpen = true;
    });
    if (group.leaderReplicaId === null) {
      group.elect(ids.survivor);
    }
  }
}

function isNamedWait(result) {
  return result?.skipped === true &&
    result.reason === REBALANCER_SKIP_REASON.SAFETY_BLOCKED &&
    typeof result.deferReason === 'string' && result.deferReason.length > 0;
}

async function runScenario(scenario) {
  const world = await createWorld(scenario);
  const rounds = [];
  try {
    for (let round = 1; round <= ROUNDS; round += 1) {
      evolveWorld(world, round);
      const before = world.record.removals.length;
      const result = await world.coordinator.executeOperation(world.operation);
      rounds.push({round, sent: world.record.removals.length > before,
        result, leader: world.group.leaderReplicaId,
        step: world.operation.workflowStep,
        stepDowns: world.record.stepDowns});
      if (world.record.removals.length > 0) {
        break;
      }
      world.advance();
    }
  } finally {
    await world.shutdown();
  }
  return {world, rounds};
}

const scenarioArbitrary = fc.record({
  partitionId: fc.constantFrom(...Object.values(PARTITION_CLASSES)),
  type: fc.constantFrom(OperationType.REPLACE, OperationType.REMOVE),
  leaderPosition: fc.constantFrom(...Object.values(LEADER_POSITION)),
  transfereesLive: fc.boolean(),
  readability: fc.constantFrom(...Object.values(READABILITY)),
});

function firstRoundShouldSend(scenario) {
  // A REMOVE's fourth replica is a survivor; a REPLACE's is its target.
  const leaderSurvives = scenario.leaderPosition ===
    LEADER_POSITION.SURVIVOR ||
    (scenario.leaderPosition === LEADER_POSITION.TARGET &&
      scenario.type === OperationType.REMOVE);
  // A REPLACE retains a third leader only while its target follows past
  // its gate (the BR11 supersession); a target leading is safe outright.
  const targetFollows = scenario.type === OperationType.REMOVE ||
    scenario.transfereesLive;
  return scenario.readability === READABILITY.READABLE &&
    ((leaderSurvives && targetFollows) ||
      (scenario.type === OperationType.REPLACE &&
        scenario.leaderPosition === LEADER_POSITION.TARGET));
}

test('removal leadership gate: P1-P4 over class x type x leader x ' +
  'transferee x readability', async (t) => {
  const seen = {cases: 0, sent: 0, waits: 0, firstRoundSends: 0,
    transfers: 0};
  await fc.assert(fc.asyncProperty(scenarioArbitrary, async (scenario) => {
    const {world, rounds} = await runScenario(scenario);
    seen.cases += 1;
    const label = JSON.stringify(scenario);
    // P1: no effect to the true current leader.
    if (world.record.violations.length > 0) {
      throw new Error(`P1 ${label}: ${JSON.stringify(world.record.violations)}`);
    }
    // P2: every round before the effect is a named wait.
    for (const round of rounds.filter((entry) => !entry.sent)) {
      seen.waits += 1;
      if (!isNamedWait(round.result) ||
          !NAMED_DEFER_REASONS.has(round.result.deferReason)) {
        throw new Error(`P2 ${label} round ${round.round}: ` +
          JSON.stringify(round.result));
      }
    }
    // P3: the removal proceeds once the world allows it (it heals by
    // HEAL_ROUND at the latest).
    if (world.record.removals.length !== 1) {
      throw new Error(`P3 ${label}: ${world.record.removals.length} ` +
        `removals over ${JSON.stringify(rounds.map((r) => r.result))}`);
    }
    seen.sent += 1;
    seen.transfers += world.record.stepDowns;
    // P4: a non-leading subject with a readable authority is not delayed.
    if (firstRoundShouldSend(scenario)) {
      seen.firstRoundSends += 1;
      if (!rounds[0].sent || rounds[0].stepDowns !== 0) {
        throw new Error(`P4 ${label}: ${JSON.stringify(rounds[0])}`);
      }
    }
  }), {numRuns: 120, seed: 20261111});
  t.ok(seen.cases >= 120, `${seen.cases} scenarios`);
  t.ok(seen.waits > 0 && seen.firstRoundSends > 0 && seen.transfers > 0,
    `the enumeration covers waits (${seen.waits}), undelayed sends (${
      seen.firstRoundSends}) and transfers (${seen.transfers})`);
});

test('every class x type: a leading subject gets exactly one named ' +
  'transfer to a survivor, and the effect leaves only after it leads',
async (t) => {
  for (const partitionId of Object.values(PARTITION_CLASSES)) {
    for (const type of [OperationType.REPLACE, OperationType.REMOVE]) {
      const scenario = {partitionId, type,
        leaderPosition: LEADER_POSITION.SUBJECT, transfereesLive: true,
        readability: READABILITY.READABLE};
      const {world, rounds} = await runScenario(scenario);
      const label = `${partitionId} ${type}`;
      t.equal(world.record.stepDowns, 1, `${label}: one named transfer`);
      t.equal(world.record.violations.length, 0,
        `${label}: no effect while the subject leads`);
      t.equal(world.record.removals.length, 1, `${label}: removal proceeds`);
      t.not(rounds.at(-1).leader, world.ids.subject,
        `${label}: a survivor leads at the effect`);
      if (type === OperationType.REPLACE) {
        t.equal(rounds.at(-1).leader, world.ids.fourth,
          `${label}: the REPLACE transferee is its own target (BR9)`);
      }
    }
  }
});

test('plain REMOVE of a leader with no live transferee waits named ' +
  '(wait_no_transferee) and issues nothing until a voter passes its gate',
async (t) => {
  const scenario = {partitionId: PARTITION_CLASSES.USER,
    type: OperationType.REMOVE, leaderPosition: LEADER_POSITION.SUBJECT,
    transfereesLive: false, readability: READABILITY.READABLE};
  const {world, rounds} = await runScenario(scenario);
  const beforeHeal = rounds.filter((round) => round.round < HEAL_ROUND);
  t.ok(beforeHeal.length > 0 && beforeHeal.every((round) => !round.sent &&
    round.stepDowns === 0 && /wait_no_transferee/.test(round.result.error)),
  'every round before a transferee exists waits wait_no_transferee, ' +
    'with no transfer');
  t.equal(world.record.removals.length, 1,
    'once a voter passes its gate the transfer and the removal follow');
});

test('a dead leading subject: the gate waits until its survivors elect, ' +
  'then removes it', async (t) => {
  for (const type of [OperationType.REPLACE, OperationType.REMOVE]) {
    const scenario = {partitionId: PARTITION_CLASSES.PRIORITY, type,
      leaderPosition: LEADER_POSITION.SUBJECT, transfereesLive: true,
      readability: READABILITY.SUBJECT_DEAD};
    const {world, rounds} = await runScenario(scenario);
    t.notOk(rounds[0].sent, `${type}: no removal while the dead subject is ` +
      'the last corroborated leader');
    t.equal(world.record.removals.length, 1,
      `${type}: removed once a survivor is corroborated`);
    t.equal(rounds.find((round) => round.sent)?.round, ELECTION_ROUND,
      `${type}: in the round the survivors elected`);
  }
});
