import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {PriorityRecoverySupersededTarget} from '../../src/rebalancer/priority-recovery-superseded-target.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {renderMarkdown} from '../../scripts/analyze-replace-safety-blocks.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  createCommittedVoterGroup,
  withCommittedVoterGroup,
} from './committed-voter-group-fixture.js';
import {
  buildMockPolicyAuthorityWitness,
  createMockControlPlaneReadinessService,
  createMockPolicyService,
  createTestCoordinator,
} from './test-helpers.js';

const {REMOVE_SAFETY_EVALUATION_CLASSIFICATION} =
  OPERATION_WORKFLOW_OWNER_SHARED;

const PARTITION_ID = 'replica_operations-p1';

function rowsOnNodes(nodeIds) {
  return nodeIds.map((nodeId, index) => ({
    service_id: `${PARTITION_ID}-r${index + 1}`,
    replica_id: `${PARTITION_ID}-r${index + 1}`,
    partition_id: PARTITION_ID,
    service_type: 'partition',
    node_id: nodeId,
    status: 'active',
    raft_role: index === 0 ? 'leader' : 'follower',
  }));
}

function makeRemoveSafetyOwner() {
  const owner = Object.create(PriorityRecoverySupersededTarget.prototype);
  owner.repository = {
    isReplaceRemovePhase: () => true,
    isReplaceRemoveDispatchPhase: () => true,
  };
  owner.readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety = async () => ({
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: ['node-seed', 'node-target'],
    recoveryActiveNodeIds: ['node-seed', 'node-target'],
    projectedServingNodeIds: ['node-seed', 'node-target'],
    locallyEligibleNodeIds: ['node-seed', 'node-target'],
  });
  owner.buildPriorityRecoveryAssessmentContextForOperation = () => ({
    completion: {state: 'spread_pending'},
    priorityPartitionSummary: {
      satisfied: false,
      requiredDistinctNodeCount: 3,
    },
  });
  owner.isPriorityRecoveryRemoveSafetySatisfied = () => false;
  owner.getPriorityRecoverySupersededTargetErrorFromContext = () => null;
  owner.resolvePriorityRemoveSafetyMembershipSnapshot = (
    _planningSnapshot,
    _priorityRecoveryContext,
    projectedVoterReadyRows,
  ) => ({
    publishedActiveNodeIdsPresent: true,
    recoveryProjectionNodeIds: ['node-seed', 'node-target'],
    projectedVoterReadyNodeIds: [
      ...new Set(projectedVoterReadyRows.map((row) => row.node_id)),
    ],
    membershipSource: 'recovery projection membership',
    missingMembershipNodeIds: [],
    useRecoveryProjectionMembership: true,
  });
  return owner;
}

function replaceOperation() {
  return {
    operationId: 'replace-spread-1-to-2',
    type: 'REPLACE',
    partitionId: PARTITION_ID,
    sourceNodeId: 'node-seed',
    targetNodeId: 'node-target',
  };
}

test('priority remove-safety owner releases a 2 -> 2 intermediate REPLACE ' +
  'while the final published spread target remains 3', async (t) => {
  const owner = makeRemoveSafetyOwner();
  const currentVoterReadyRows = rowsOnNodes([
    'node-seed',
    'node-seed',
    'node-seed',
    'node-target',
  ]);
  const projectedVoterReadyRows = rowsOnNodes([
    'node-seed',
    'node-seed',
    'node-target',
  ]);

  const evaluation =
    await owner.evaluatePriorityPublishedMembershipRemoveSafety(
      replaceOperation(),
      projectedVoterReadyRows,
      currentVoterReadyRows,
    );

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
    'the current and projected authoritative row sets prove spread is preserved, so the serialized next move retains an owner',
  );
  t.equal(evaluation.error, null);
  t.end();
});

test('priority remove-safety owner still blocks 2 -> 1 spread regression',
  async (t) => {
    const owner = makeRemoveSafetyOwner();
    const evaluation =
      await owner.evaluatePriorityPublishedMembershipRemoveSafety(
        replaceOperation(),
        rowsOnNodes(['node-seed', 'node-seed', 'node-seed']),
        rowsOnNodes([
          'node-seed',
          'node-seed',
          'node-seed',
          'node-target',
        ]),
      );

    t.equal(
      evaluation.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    );
    t.match(
      evaluation.error,
      /protected per-operation requirement \(1\/2\)$/,
      'the diagnostic exposes the protected local floor, not the final target',
    );
    t.end();
  });

test('missing current-row evidence fails closed on the final published target',
  async (t) => {
    const owner = makeRemoveSafetyOwner();
    const evaluation =
      await owner.evaluatePriorityPublishedMembershipRemoveSafety(
        replaceOperation(),
        rowsOnNodes(['node-seed', 'node-seed', 'node-target']),
        null,
      );

    t.equal(
      evaluation.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    );
    t.match(evaluation.error, /\(2\/3\)$/);
    t.end();
  });

test('spread-floor analyzer prose follows the protected local floor semantics',
  async (t) => {
    const markdown = renderMarkdown([]);
    t.match(
      markdown,
      /spread_floor.*protected per-operation floor/u,
      'operator prose follows the local safety-floor semantics',
    );
    t.notMatch(
      markdown,
      /spread_floor.*below 2\/3/u,
      'operator prose does not misstate the final target as the per-step floor',
    );
    t.end();
  });

// Witness (k) (owner decision 2026-10-04): the blanket "priority spread has
// not converged" defer for a blocked partition with an EMPTY recovery
// projection is deleted. A count-neutral removal that keeps the spread floor
// is SAFE; the spread floor alone still refuses a removal that would lose
// spread. Before the deletion both shapes deferred on retry until the step
// timeout (a timer-only unblock).
function makeEmptyProjectionRemoveSafetyOwner() {
  const owner = makeRemoveSafetyOwner();
  owner.buildPriorityRecoveryAssessmentContextForOperation = () => ({
    completion: {state: 'spread_pending'},
    priorityPartitionSummary: {
      satisfied: false,
      requiredDistinctNodeCount: 3,
      missingPartitionIds: [PARTITION_ID],
      blockedPartitions: [{
        partitionId: PARTITION_ID,
        requiredDistinctNodeCount: 3,
        readyDistinctNodeCount: 2,
        spreadGap: 1,
      }],
    },
  });
  owner.resolvePriorityRemoveSafetyMembershipSnapshot = (
    _planningSnapshot,
    _priorityRecoveryContext,
    projectedVoterReadyRows,
  ) => ({
    publishedActiveNodeIdsPresent: true,
    recoveryProjectionNodeIds: [],
    projectedVoterReadyNodeIds: [
      ...new Set(projectedVoterReadyRows.map((row) => row.node_id)),
    ],
    membershipSource: 'published membership',
    missingMembershipNodeIds: [],
    useRecoveryProjectionMembership: false,
  });
  return owner;
}

test('(k) empty recovery projection: a count-neutral removal of a blocked ' +
  'partition keeping the spread floor is SAFE', async (t) => {
  const owner = makeEmptyProjectionRemoveSafetyOwner();
  const evaluation =
    await owner.evaluatePriorityPublishedMembershipRemoveSafety(
      replaceOperation(),
      rowsOnNodes(['node-seed', 'node-seed', 'node-target']),
      rowsOnNodes(['node-seed', 'node-seed', 'node-seed', 'node-target']),
    );
  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
    'no blanket "priority spread has not converged" defer',
  );
  t.equal(evaluation.error, null);
  t.end();
});

test('(k) empty recovery projection: the spread floor still refuses a ' +
  'removal that loses spread', async (t) => {
  const owner = makeEmptyProjectionRemoveSafetyOwner();
  const evaluation =
    await owner.evaluatePriorityPublishedMembershipRemoveSafety(
      replaceOperation(),
      rowsOnNodes(['node-seed', 'node-seed', 'node-seed']),
      rowsOnNodes(['node-seed', 'node-seed', 'node-seed', 'node-target']),
    );
  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
  );
  t.match(evaluation.error, /protected per-operation requirement \(1\/2\)$/);
  t.notMatch(evaluation.error || '', /priority spread has not converged/);
  t.end();
});

// ---------------------------------------------------------------------------
// The remove-safety floor's committed-voter credit (cold formation and its
// failure cases). The floor protects the remaining committed voters' live
// majority and replication minimum; a remaining voter whose node holds no
// ready lease is credited only by the group's own committed evidence: it is
// a voter of the leader's current configuration and its own port answered at
// the leader's term, past its participation gate. A services row alone never
// credits, and an unreadable group waits with a typed reason.
// ---------------------------------------------------------------------------

const SEED_NODE = 'seed-node';
const JOINER_B = 'joiner-node-b';
const JOINER_C = 'joiner-node-c';
const SEED_LEADER = `${PARTITION_ID}-r1`;
const SEED_SECOND = `${PARTITION_ID}-r2`;
const SEED_THIRD = `${PARTITION_ID}-r3`;
const FIRST_STEP_REPLICA = 'replace-replica-first-step';
const SECOND_STEP_REPLICA = 'replace-replica-second-step';

// The two shapes a barrier-held joiner's committed node row takes: the
// registration row before its ACTIVE flip, and an ACTIVE row whose READY
// lease the formation barrier still withholds. Neither is ready, both are
// known (not UNKNOWN/INVALID) to the committed-node owner.
const BARRIER_HELD_NODE_SHAPES = Object.freeze({
  joining_lease_never_granted: Object.freeze({
    status: NODE_STATE.JOINING,
    connection_state: NODE_STATE.CONNECTED,
    ready_lease_expires_at: null,
  }),
  active_lease_withheld: Object.freeze({
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.CONNECTED,
    ready_lease_expires_at: 0,
  }),
});
const DEAD_NODE_SHAPE = Object.freeze({
  status: NODE_STATE.ACTIVE,
  connection_state: NODE_STATE.DISCONNECTED,
  ready_lease_expires_at: null,
});

function readyNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + 60000,
  };
}

function voterRow(replicaId, nodeId, raftRole = 'follower') {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

// 3-0-0 -> 2-1-0: the seed holds r1 (leader), r2 (the source) and r3; the
// replacement is on joiner B.
function firstStepScenario(joinerShape, overrides = {}) {
  return {
    nodeRows: [
      readyNodeRow(SEED_NODE),
      {node_id: JOINER_B, ...joinerShape},
      {node_id: JOINER_C, ...joinerShape},
    ],
    serviceRows: [
      voterRow(SEED_LEADER, SEED_NODE, 'leader'),
      voterRow(SEED_SECOND, SEED_NODE),
      voterRow(SEED_THIRD, SEED_NODE),
      voterRow(FIRST_STEP_REPLICA, JOINER_B),
    ],
    voterReplicaIds: [
      SEED_LEADER, SEED_SECOND, SEED_THIRD, FIRST_STEP_REPLICA,
    ],
    sourceReplicaId: SEED_SECOND,
    targetReplicaId: FIRST_STEP_REPLICA,
    targetNodeId: JOINER_B,
    readyReplicaCountByNodeId: {[SEED_NODE]: 3, [JOINER_B]: 1},
    minReplicaCount: 3,
    ...overrides,
  };
}

// 2-1-0 -> 1-1-1: the first step is done (its replica on joiner B is an
// ordinary remaining voter now, B still behind its barrier); the seed's r3
// is the source and the replacement is on joiner C.
function secondStepScenario(joinerShape, overrides = {}) {
  return {
    nodeRows: [
      readyNodeRow(SEED_NODE),
      {node_id: JOINER_B, ...joinerShape},
      {node_id: JOINER_C, ...joinerShape},
    ],
    serviceRows: [
      voterRow(SEED_LEADER, SEED_NODE, 'leader'),
      voterRow(SEED_THIRD, SEED_NODE),
      voterRow(FIRST_STEP_REPLICA, JOINER_B),
      voterRow(SECOND_STEP_REPLICA, JOINER_C),
    ],
    voterReplicaIds: [
      SEED_LEADER, SEED_THIRD, FIRST_STEP_REPLICA, SECOND_STEP_REPLICA,
    ],
    sourceReplicaId: SEED_THIRD,
    targetReplicaId: SECOND_STEP_REPLICA,
    targetNodeId: JOINER_C,
    // The planning answer still reports the spread pending (the replacement
    // on C is not serving), so this evaluation runs the voter floor rather
    // than the priority-recovery completion contract.
    readyReplicaCountByNodeId: {[SEED_NODE]: 2, [JOINER_B]: 1},
    minReplicaCount: 3,
    ...overrides,
  };
}

function createFormationReplaceCoordinator(scenario) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const cohortNodeIds = Object.freeze(scenario.nodeRows.map((row) => row.node_id));
  const partitionId = scenario.partitionId || PARTITION_ID;
  const {nodeRows} = scenario;
  const serviceRows = scenario.serviceRows.map((row) =>
    ({...row, partition_id: partitionId}));
  const silentReplicaIds = new Set(scenario.silentReplicaIds || []);
  const group = createCommittedVoterGroup({
    voterReplicaIds: scenario.voterReplicaIds,
    leaderReplicaId: SEED_LEADER,
    isSilent: (replicaId) => silentReplicaIds.has(replicaId),
    gateClosedReplicaIds: scenario.gateClosedReplicaIds,
    votersOutgoingReplicaIds: scenario.votersOutgoingReplicaIds,
  });
  const removals = [];
  const messageRouter = withCommittedVoterGroup({
    async deliver(_target, payload) {
      removals.push(payload);
      return buildDeliveryEnvelope({acknowledged: true}, {
        status: ReplicaOperationResponseStatus.INITIATED,
      });
    },
    async pingNode() {
      return true;
    },
  }, group);
  const readyDistinctNodeCount =
    Object.keys(scenario.readyReplicaCountByNodeId).length;
  const buildPlanningSnapshot = (nodeId) => ({
    publicationStatus: 'PUBLISHED',
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: cohortNodeIds,
    recoveryActiveNodeIds: cohortNodeIds,
    projectedServingNodeIds: cohortNodeIds,
    publishedMembershipIncludesTargetNode: cohortNodeIds.includes(nodeId),
    priorityPartitionSummary: Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: 3,
      missingPartitionIds: [partitionId],
      blockedPartitions: [
        Object.freeze({
          partitionId,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount,
          readyReplicaCount: 4,
          readyReplicaCountByNodeId:
            Object.freeze({...scenario.readyReplicaCountByNodeId}),
          spreadGap: 3 - readyDistinctNodeCount,
        }),
      ],
    }),
  });
  const coordinator = createTestCoordinator({
    nodeId: SEED_NODE,
    enableTimeouts: false,
    messageRouter,
    // The group's replicas answer for themselves; the fixture-world witness
    // (a leader naming itself alone) is not the subject here.
    replaceWitness: false,
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      readNodeRows: () => nodeRows,
      callbacks: {
        async getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId) {
          return buildPlanningSnapshot(nodeId);
        },
        async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId) {
          return buildPlanningSnapshot(nodeId);
        },
        getPriorityRecoveryPlanningAnswerSync(nodeId) {
          return buildPlanningSnapshot(nodeId);
        },
      },
    }),
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({
        minReplicaCount: scenario.minReplicaCount,
        targetReplicaCount: scenario.minReplicaCount,
      }),
    }),
    cacheData: {
      nodes: nodeRows,
      services: serviceRows,
      partitions: [
        {
          partition_id: partitionId,
          leader_node_id: SEED_NODE,
          replica_count: scenario.minReplicaCount,
        },
      ],
    },
  });
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const originalRead = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (tableName, sql, params = [], options = {}) => {
    if (
      tableName === 'services' &&
      String(sql).includes('WHERE service_type = ? AND partition_id = ?')
    ) {
      return {
        success: true,
        source: 'owner_rpc_lane',
        rows: serviceRows.map((row) => ({...row})),
        rowSetComplete: true,
        readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1'),
      };
    }
    return originalRead(tableName, sql, params, options);
  };
  return {coordinator, group, removals, silentReplicaIds};
}

async function withFormationReplace(scenario, body) {
  const world = createFormationReplaceCoordinator(scenario);
  world.coordinator.initialize();
  try {
    const operation = await world.coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: scenario.partitionId || PARTITION_ID,
      nodeId: scenario.targetNodeId,
      sourceNodeId: SEED_NODE,
      replicaId: scenario.sourceReplicaId,
    });
    operation.replicaId = scenario.targetReplicaId;
    return await body({...world, operation});
  } finally {
    await world.coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

function atRemoveDispatchStep(operation, step, sourceReplicaId) {
  operation.workflowStep = step;
  operation.status = step === WORKFLOW_STEP.ACTIVE ? 'active' : 'stopping';
  operation.stateHistory = step === WORKFLOW_STEP.STOPPING ? [{
    state: WORKFLOW_STEP.STOPPING,
    timestamp: Date.now(),
    reason: 'replace_remove_intent_recorded',
    sourceReplicaId,
  }] : [];
  return operation;
}

const REMOVE_DISPATCH_STEPS = Object.freeze([
  WORKFLOW_STEP.ACTIVE,
  WORKFLOW_STEP.STOPPING,
]);

async function evaluateAtEveryRemoveDispatchStep(world, scenario) {
  const evaluations = [];
  for (const step of REMOVE_DISPATCH_STEPS) {
    evaluations.push({
      step,
      evaluation: await world.coordinator.workflowOwner.evaluateRemoveSafety(
        atRemoveDispatchStep(world.operation, step, scenario.sourceReplicaId)),
    });
  }
  return evaluations;
}

for (const [shapeName, joinerShape] of
  Object.entries(BARRIER_HELD_NODE_SHAPES)) {
  for (const [stepName, buildScenario] of [
    ['first step 3-0-0 -> 2-1-0', firstStepScenario],
    ['second step 2-1-0 -> 1-1-1', secondStepScenario],
  ]) {
    test(`cold formation ${stepName} (joiners ${shapeName}): the source ` +
      'removal is SAFE at ACTIVE and STOPPING while every joiner is still ' +
      'behind its barrier, on committed-voter evidence', async (t) => {
      const scenario = buildScenario(joinerShape);
      await withFormationReplace(scenario, async (world) => {
        for (const {step, evaluation} of
          await evaluateAtEveryRemoveDispatchStep(world, scenario)) {
          t.same(
            {
              classification: evaluation?.classification,
              error: evaluation?.error ?? null,
            },
            {
              classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
              error: null,
            },
            `step=${step}: no floor, spread or replacement deferral`,
          );
        }
        t.ok(world.group.reads.includes(scenario.targetReplicaId),
          'the replacement answered for itself (non-vacuity: the credit ' +
          'came from the group, not from a row)');
      });
    });
  }
}

const HELD = BARRIER_HELD_NODE_SHAPES.active_lease_withheld;

// Every case below is the same 3-0-0 -> 2-1-0 step with one fact changed,
// and each must withhold the removal at ACTIVE and at STOPPING.
const UNSAFE_REMOVAL_CASES = Object.freeze([
  {
    name: 'the replacement\'s node died after promotion (stale ACTIVE voter ' +
      'row, silent replica)',
    scenario: () => {
      const scenario = firstStepScenario(HELD, {
        silentReplicaIds: [FIRST_STEP_REPLICA],
      });
      scenario.nodeRows[1] = {node_id: JOINER_B, ...DEAD_NODE_SHAPE};
      return scenario;
    },
    error: /replacement replica replace-replica-first-step is not voter-ready/,
  },
  {
    name: 'the replacement is not a committed voter yet (its row says ' +
      'voter, the leader\'s configuration does not)',
    scenario: () => firstStepScenario(HELD, {
      voterReplicaIds: [SEED_LEADER, SEED_SECOND, SEED_THIRD],
    }),
    error: /replacement replica replace-replica-first-step is not voter-ready$/,
  },
  {
    name: 'the replacement is a voter below its participation gate (not ' +
      'caught up)',
    scenario: () => firstStepScenario(HELD, {
      gateClosedReplicaIds: [FIRST_STEP_REPLICA],
    }),
    error: /replacement replica replace-replica-first-step is not voter-ready$/,
  },
  {
    name: 'the leader\'s configuration has no confirming majority (two of ' +
      'four voters silent)',
    scenario: () => firstStepScenario(HELD, {
      silentReplicaIds: [SEED_SECOND, SEED_THIRD],
    }),
    error: /is not voter-ready; committed voter evidence unavailable: completion_authority_not_corroborated$/,
  },
  {
    name: 'the leader\'s configuration is joint (the remaining voter set is ' +
      'not one set yet)',
    scenario: () => firstStepScenario(HELD, {
      votersOutgoingReplicaIds: [SEED_LEADER, SEED_SECOND, SEED_THIRD],
    }),
    error: /is not voter-ready; committed voter evidence unavailable: committed_voter_configuration_joint$/,
  },
  {
    name: 'another remaining voter is on a dead node behind a stale row ' +
      '(second step; the replacement itself is live)',
    scenario: () => {
      const scenario = secondStepScenario(HELD, {
        silentReplicaIds: [FIRST_STEP_REPLICA],
      });
      scenario.nodeRows[1] = {node_id: JOINER_B, ...DEAD_NODE_SHAPE};
      return scenario;
    },
    error: /would drop voter-ready replicas below minimum \(2\/3\)$/,
  },
]);

for (const unsafeCase of UNSAFE_REMOVAL_CASES) {
  test(`unsafe source removal is withheld: ${unsafeCase.name}`, async (t) => {
    const scenario = unsafeCase.scenario();
    await withFormationReplace(scenario, async (world) => {
      for (const {step, evaluation} of
        await evaluateAtEveryRemoveDispatchStep(world, scenario)) {
        t.equal(evaluation?.classification,
          REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
          `step=${step}: the removal waits`);
        t.match(String(evaluation?.error), unsafeCase.error,
          `step=${step}: the deferral names the missing fact`);
      }
    });
  });
}

// A priority control-plane partition whose REPLACE has no leadership
// handoff decision (schema_operations): nothing after the floor reads the
// replacement, and the node still answers pings. The floor alone must
// withhold the removal of a source whose replacement is a stale row.
const NO_HANDOFF_PARTITION_ID = 'schema_operations-p1';

for (const [caseName, overrides] of [
  ['silent replacement behind a stale ACTIVE voter row',
    {silentReplicaIds: [FIRST_STEP_REPLICA]}],
  ['replacement that is not a committed voter',
    {voterReplicaIds: [SEED_LEADER, SEED_SECOND, SEED_THIRD]}],
]) {
  test('unsafe source removal is withheld on a partition without a ' +
    `leadership handoff decision: ${caseName}`, async (t) => {
    const scenario = firstStepScenario(HELD, {
      partitionId: NO_HANDOFF_PARTITION_ID,
      ...overrides,
    });
    await withFormationReplace(scenario, async (world) => {
      for (const {step, evaluation} of
        await evaluateAtEveryRemoveDispatchStep(world, scenario)) {
        t.equal(evaluation?.classification,
          REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
          `step=${step}: the removal waits`);
        t.match(String(evaluation?.error), /is not voter-ready/,
          `step=${step}: the replacement is the missing fact`);
      }
    });
  });
}

test('cold formation first step on a partition without a leadership ' +
  'handoff decision: SAFE on committed-voter evidence', async (t) => {
  const scenario = firstStepScenario(HELD, {
    partitionId: NO_HANDOFF_PARTITION_ID,
  });
  await withFormationReplace(scenario, async (world) => {
    for (const {step, evaluation} of
      await evaluateAtEveryRemoveDispatchStep(world, scenario)) {
      t.equal(evaluation?.classification,
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE, `step=${step}`);
    }
  });
});

test('unsafe source removal is withheld: no router (the group cannot be ' +
  'read) never credits by default', async (t) => {
  const scenario = firstStepScenario(HELD);
  await withFormationReplace(scenario, async (world) => {
    world.coordinator.workflowOwner.messageRouter = null;
    for (const {step, evaluation} of
      await evaluateAtEveryRemoveDispatchStep(world, scenario)) {
      t.equal(evaluation?.classification,
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
        `step=${step}: an absent dependency waits`);
      t.match(String(evaluation?.error),
        /is not voter-ready; committed voter evidence unavailable: \S+$/,
        `step=${step}: the wait is typed`);
    }
  });
});

test('a withheld removal recovers when the missing fact returns: the same ' +
  'evaluation turns SAFE once the silent replacement answers', async (t) => {
  const scenario = firstStepScenario(HELD, {
    silentReplicaIds: [FIRST_STEP_REPLICA],
  });
  await withFormationReplace(scenario, async (world) => {
    const owner = world.coordinator.workflowOwner;
    const operation = atRemoveDispatchStep(
      world.operation, WORKFLOW_STEP.ACTIVE, scenario.sourceReplicaId);
    t.equal((await owner.evaluateRemoveSafety(operation))?.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      'silent replacement: deferred');
    world.silentReplicaIds.clear();
    t.equal((await owner.evaluateRemoveSafety(operation))?.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      'the replacement answers at the leader\'s term: SAFE, no row changed');
  });
});

for (const targetSilent of [false, true]) {
  test('replication minimum 1 (source and replacement only): the removal ' +
    `is ${targetSilent ? 'withheld while the replacement is silent' :
      'SAFE on the live committed replacement'}`, async (t) => {
    const scenario = {
      nodeRows: [
        readyNodeRow(SEED_NODE),
        {node_id: JOINER_B, ...HELD},
      ],
      serviceRows: [
        voterRow(SEED_LEADER, SEED_NODE, 'leader'),
        voterRow(FIRST_STEP_REPLICA, JOINER_B),
      ],
      voterReplicaIds: [SEED_LEADER, FIRST_STEP_REPLICA],
      silentReplicaIds: targetSilent ? [FIRST_STEP_REPLICA] : [],
      sourceReplicaId: SEED_LEADER,
      targetReplicaId: FIRST_STEP_REPLICA,
      targetNodeId: JOINER_B,
      readyReplicaCountByNodeId: {[SEED_NODE]: 1, [JOINER_B]: 1},
      minReplicaCount: 1,
    };
    await withFormationReplace(scenario, async (world) => {
      const evaluation =
        await world.coordinator.workflowOwner.evaluateRemoveSafety(
          atRemoveDispatchStep(
            world.operation, WORKFLOW_STEP.ACTIVE, scenario.sourceReplicaId));
      if (targetSilent) {
        t.equal(evaluation?.classification,
          REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER);
        t.match(String(evaluation?.error), /is not voter-ready/);
        return;
      }
      // The voter floor (1/1) and the replacement guard pass on the
      // committed evidence. Whatever this single-replica move still waits
      // for (its spread and leadership owners) is not the voter floor.
      t.notMatch(String(evaluation?.error || ''),
        /below minimum|is not voter-ready/);
    });
  });
}

test('timeout lifecycle reconcile treats an armed ACTIVE REPLACE safety ' +
  'retry as handled', async (t) => {
  const scenario = firstStepScenario(HELD);
  await withFormationReplace(scenario, async (world) => {
    const {coordinator, operation} = world;
    let executeReconcileCalls = 0;
    coordinator.workflowOwner.executeOperationFromReconcilePath = async () => {
      executeReconcileCalls += 1;
      return {skipped: true};
    };
    operation.workflowStep = WORKFLOW_STEP.ACTIVE;
    operation.status = 'active';
    operation.stateHistory = [];
    coordinator.workflowOwner.safetyDeferredRetryTimerByOperationId.set(
      operation.operationId,
      'armed-retry-timer',
    );
    const progressedWhileArmed =
      await coordinator.workflowOwner.reconcileOperationLifecycle(operation, {
        cause: 'timeout',
        priorityRecoveryDrainSnapshot: {
          action: 'noop',
          ownerAction: 'allow_reconcile',
        },
      });
    t.equal(progressedWhileArmed, true,
      'timeout lifecycle reconcile treats armed ACTIVE REPLACE retry as handled');
    t.equal(executeReconcileCalls, 0,
      'timeout lifecycle reconcile does not hammer executeOperationFromReconcilePath while retry timer is armed');
    coordinator.workflowOwner.safetyDeferredRetryTimerByOperationId.delete(
      operation.operationId,
    );
  });
});
