import fs from 'node:fs';
import path from 'node:path';

import {cruise} from 'dependency-cruiser';
import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';

const GUARD_IDS = Object.freeze([
  'admin-live-planner-replica-admission-projection',
  'admin-live-learner-reason-code-projection',
  'admin-dormant-context-absent-single-chain',
]);

function decisionSnapshots() {
  const dimensions = CONTROL_PLANE_READINESS_DIMENSION;
  return new AdminControlSnapshot().buildPriorityRecoveryDecisionSnapshots({
    capturedAt: 5000,
    publicationConvergence: {
      priorityPartitionSummary: {
        blockedPartitions: [{
          partitionId: 'partition-a',
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 1,
          spreadGap: 2,
        }],
        missingPartitionIds: ['partition-missing'],
        requiredDistinctNodeCount: 3,
      },
    },
    workflowAdmissionsByWorkflowId: {
      workflow: {
        workflowId: 'workflow-1',
        sourcePartitionId: 'partition-a',
        targetPartitionIds: ['partition-target'],
        admission: {eligibleNodeIds: ['node-repair']},
      },
    },
    serviceRows: [
      ['node-hold', 'partition-a'],
      ['node-repair', 'partition-a'],
      ['node-recovery', 'partition-a'],
      ['node-unknown', 'partition-a'],
    ].map(([nodeId, partitionId]) => ({
      node_id: nodeId,
      partition_id: partitionId,
      status: 'active',
      raft_role: 'learner',
    })),
    readinessByNodeId: {
      'node-hold': {
        dimensions: {
          [dimensions.REPAIR_ELIGIBLE]: false,
          [dimensions.CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
        },
        reasons: [
          {code: ' reason-b '}, {code: 'reason-a'}, {code: 'reason-b'},
          {code: ''}, {}, null,
        ],
      },
      'node-repair': {
        dimensions: {
          [dimensions.REPAIR_ELIGIBLE]: true,
          [dimensions.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
        },
      },
      'node-recovery': {
        dimensions: {
          [dimensions.REPAIR_ELIGIBLE]: false,
          [dimensions.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
        },
      },
    },
    replicaOperationRows: [{
      operation_id: 'operation-1',
      partition_id: 'partition-a',
      entity_type: 'partition',
      operation_type: 'ADD',
      status: 'active',
      workflow_step: 'ACTIVE',
      target_node_id: 'node-repair',
      replica_id: 'partition-a-r2',
      created_at: 1000,
      updated_at: 2000,
    }],
    replicaOperations: {
      operationTimelineById: {'operation-1': [
        {step: 'PENDING', status: 'active', enteredAtMs: 1000},
        {step: 'ACTIVE', status: 'active', enteredAtMs: 2000, inFlight: true},
      ]},
    },
  });
}

test('live Admin chain projects planner, operation, and admission owners', (t) => {
  const result = decisionSnapshots();
  const byPartition = Object.fromEntries(result.snapshots.map((snapshot) =>
    [snapshot.partitionId, snapshot]));
  t.same(byPartition['partition-a'].planner.reasons, ['priority_spread_gap']);
  t.same(byPartition['partition-missing'].planner.reasons,
    ['priority_partition_missing']);
  t.equal(byPartition['partition-a'].coordinator.operation.operationId,
    'operation-1');
  t.equal(byPartition['partition-a'].coordinator.operation.timelineLength, 2);
  t.equal(byPartition['partition-a'].coordinator.operation.latestTimelineStep,
    'ACTIVE');
  t.equal(byPartition['partition-a'].coordinator.operation.latestTimelineInFlight,
    true);
  t.equal(byPartition['partition-a'].admission.workflowId, 'workflow-1');
  t.equal(byPartition['partition-target'].admission.workflowId, 'workflow-1');
  t.end();
});

test('live Admin chain owns learner promotion and normalized holds', (t) => {
  const snapshot = decisionSnapshots().snapshots.find((item) =>
    item.partitionId === 'partition-a');
  const learner = snapshot.readiness.learnerPromotion;
  t.same(learner.promotableLearnerNodeIds, ['node-repair']);
  t.same(learner.learnerHoldByNodeId['node-hold'], {
    holdReason: 'not_control_plane_recovery_eligible',
    reasonCodes: ['reason-a', 'reason-b'],
  });
  t.equal(learner.learnerHoldByNodeId['node-recovery'].holdReason,
    'recovery_eligible_not_repair_eligible');
  t.equal(learner.learnerHoldByNodeId['node-unknown'].holdReason,
    'readiness_unknown');
  t.end();
});

function productionJavaScriptFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolute);
    }
  };
  visit(path.join(root, 'src'));
  return files;
}

test('dormant Admin context is absent and the live owner chain is acyclic',
  async (t) => {
    const removed =
      'src/admin/admin-control-snapshot-priority-recovery-context.js';
    t.notOk(fs.existsSync(removed));
    const production = productionJavaScriptFiles(process.cwd());
    t.notOk(production.some((file) =>
      fs.readFileSync(file, 'utf8').includes(
        'admin-control-snapshot-priority-recovery-context')));
    const admin = fs.readFileSync('src/admin/admin-control-snapshot.js', 'utf8');
    for (const symbol of [
      'PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION',
      'buildPriorityRecoveryLearnerPromotionByPartitionId',
      'buildPriorityRecoveryPlannerByPartitionId',
      'buildPriorityRecoveryReplicaOperationContexts',
      'inferPriorityRecoveryTableNameFromPartitionId',
      'resolvePriorityRecoveryReasonCodesFromReadiness',
    ]) t.notMatch(admin, new RegExp(`\\b${symbol}\\b`, 'u'));
    const diagnostics = fs.readFileSync(
      'src/admin/admin-control-snapshot-control-plane-diagnostics.js', 'utf8');
    const closure = fs.readFileSync(
      'src/control-plane/priority-recovery-snapshot-closure.js', 'utf8');
    t.match(diagnostics,
      /buildSharedPriorityRecoveryDecisionSnapshots[\s\S]*?priority-recovery-snapshot\.js/u);
    t.match(closure, /priority-recovery-snapshot-burndown\.js/u);
    t.match(closure, /priority-recovery-snapshot-ingress\.js/u);
    const graph = await cruise(['src/admin/admin-control-snapshot.js'], {
      baseDir: process.cwd(),
      exclude: 'node_modules',
      doNotFollow: {path: 'node_modules'},
    });
    t.equal(graph.output.summary.error, 0);
    t.notOk(graph.output.modules.some((module) =>
      module.dependencies.some((dependency) => dependency.circular)));
    t.same(GUARD_IDS, [
      'admin-live-planner-replica-admission-projection',
      'admin-live-learner-reason-code-projection',
      'admin-dormant-context-absent-single-chain',
    ]);
  });
