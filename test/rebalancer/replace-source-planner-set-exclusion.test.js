/**
 * Checklist item (iv) of the owner directive (2026-09-25), amendment-1
 * step 4: the generic planner cannot independently remove an active
 * REPLACE's source - not by planning the source itself, and not by counting
 * it as a live voter and removing a bystander replica for the surplus the
 * REPLACE created and owns.
 *
 * The planner's per-node excess set-excludes each non-terminal REPLACE's
 * source from the replicas it counts. Set exclusion (not a subtraction) is
 * idempotent against row state: a source whose row already reads REMOVING or
 * is gone is not counted twice.
 *
 * Composition: the REPLACE's own two sides (the source and the target) as
 * removable surplus are witnessed by the D1 constraint-6 planner witness
 * (replace-temporary-extra-voter-planner.test.js, quest
 * replace-d1-bootstrap-membership). This witness ranges over the REPLACE's
 * BYSTANDERS - every member that is neither its source nor its target - and
 * over every non-terminal REPLACE workflow step, both taken from production
 * enumerations.
 *
 * Oracle: the voters left once the REPLACE finishes are the members minus
 * the source minus every replica the planner removes; a plan made while the
 * REPLACE is non-terminal must leave at least the replica count. The control
 * plans the same topology with no REPLACE and must remove the bystander, so
 * the witness can see a removal at all.
 */

import {test} from '../../src/test-helpers/tap.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE,
  OperationType,
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  getWorkflowSteps,
} from '../../src/rebalancer/replica-status.js';
import {REBALANCER_MOVE_TYPE} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createMockCache, createTestRebalancer} from './test-helpers.js';

const PARTITION_ID = 'iv-set-exclusion';
const REPLICA_COUNT = 3;
const MEMBERS = Object.freeze({
  a: ['iv-set-exclusion-r1', 'node-1'],
  source: ['iv-set-exclusion-r2', 'node-2'],
  b: ['iv-set-exclusion-r3', 'node-3'],
  target: ['iv-set-exclusion-r4', 'node-4'],
});
const [SOURCE_REPLICA_ID] = MEMBERS.source;
const [TARGET_REPLICA_ID, TARGET_NODE_ID] = MEMBERS.target;

const NON_TERMINAL_REPLACE_STEPS = Object.freeze(
  getWorkflowSteps(OperationType.REPLACE).filter((step) =>
    !OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE.get(OperationType.REPLACE)
      .has(step)));

const BYSTANDERS = Object.freeze(Object.values(MEMBERS).filter(
  ([replicaId]) =>
    replicaId !== SOURCE_REPLICA_ID && replicaId !== TARGET_REPLICA_ID));

function serviceRow([replicaId, nodeId], status = ReplicaStatus.ACTIVE) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: EntityType.PARTITION,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    status,
  };
}

function replaceAt(workflowStep) {
  return {
    operation_id: `iv-set-exclusion-replace-${workflowStep}`,
    type: OperationType.REPLACE,
    partition_id: PARTITION_ID,
    entity_type: EntityType.PARTITION,
    entity_id: PARTITION_ID,
    replica_id: TARGET_REPLICA_ID,
    sourceReplicaId: SOURCE_REPLICA_ID,
    target_node_id: TARGET_NODE_ID,
    status: WORKFLOW_STEP_TO_STATUS[workflowStep],
    workflow_step: workflowStep,
    stepsHistory: [{step: workflowStep, sourceReplicaId: SOURCE_REPLICA_ID}],
  };
}

// The replicas the production planner removes for a placement of
// REPLICA_COUNT nodes.
function plannedRemoves({services, replicaOperations, placementNodes}) {
  const rebalancer = createTestRebalancer({
    entityId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    systemTableCache: createMockCache({services, replicaOperations}),
    nodeId: 'planner-node',
  });
  rebalancer.initialize();
  try {
    return rebalancer.movePlanner.calculateMoves(
      rebalancer.getCurrentReplicas(), {
        targetReplicaCount: REPLICA_COUNT,
        targetNodes: placementNodes,
        degraded: false,
      }).filter((move) => move.type === REBALANCER_MOVE_TYPE.REMOVE)
      .map((move) => move.replicaId);
  } finally {
    rebalancer.shutdown();
  }
}

function survivorsAfterReplace(removes) {
  return Object.values(MEMBERS)
    .map(([replicaId]) => replicaId)
    .filter((replicaId) =>
      replicaId !== SOURCE_REPLICA_ID && !removes.includes(replicaId));
}

test('checklist (iv): the planner cannot remove a bystander for the ' +
  'surplus of a non-terminal REPLACE', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.ok(NON_TERMINAL_REPLACE_STEPS.length > 0 && BYSTANDERS.length > 0,
    'the enumerations are not empty');
  const services = Object.values(MEMBERS).map((member) => serviceRow(member));

  for (const [bystanderReplicaId, bystanderNodeId] of BYSTANDERS) {
    // The placement that leaves the bystander's node out: the source's node
    // is in it, so only the REPLACE's own surplus makes the partition look
    // over target.
    const placementNodes = Object.values(MEMBERS)
      .map(([, nodeId]) => nodeId)
      .filter((nodeId) => nodeId !== bystanderNodeId);

    await t.test(`placement without bystander ${bystanderReplicaId}`,
      async (t) => {
        const control = plannedRemoves({
          services, replicaOperations: [], placementNodes});
        t.ok(control.includes(bystanderReplicaId),
          'control: with no REPLACE the planner removes the bystander ' +
            `(${JSON.stringify(control)})`);

        for (const step of NON_TERMINAL_REPLACE_STEPS) {
          const removes = plannedRemoves({
            services,
            replicaOperations: [replaceAt(step)],
            placementNodes,
          });
          t.notOk(removes.includes(SOURCE_REPLICA_ID),
            `${step}: the planner never plans the REPLACE's source`);
          t.ok(survivorsAfterReplace(removes).length >= REPLICA_COUNT,
            `${step}: the plan leaves at least ${REPLICA_COUNT} voters ` +
              `once the source leaves (removes ${JSON.stringify(removes)})`);
        }
      });
  }

  await t.test('set exclusion is idempotent against a retiring source row',
    async (t) => {
      const [bystanderReplicaId, bystanderNodeId] = BYSTANDERS[0];
      const placementNodes = Object.values(MEMBERS)
        .map(([, nodeId]) => nodeId)
        .filter((nodeId) => nodeId !== bystanderNodeId);
      const retiringServices = Object.values(MEMBERS).map((member) =>
        serviceRow(member, member[0] === SOURCE_REPLICA_ID ?
          ReplicaStatus.REMOVING : ReplicaStatus.ACTIVE));
      const stoppingStep = NON_TERMINAL_REPLACE_STEPS.at(-1);
      const removes = plannedRemoves({
        services: retiringServices,
        replicaOperations: [replaceAt(stoppingStep)],
        placementNodes,
      });
      t.notOk(removes.includes(bystanderReplicaId),
        `${stoppingStep} with the source row REMOVING: the bystander stays`);
      t.ok(survivorsAfterReplace(removes).length >= REPLICA_COUNT,
        'the source is excluded once, not twice');
    });
});
