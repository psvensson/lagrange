import fs from 'node:fs';

import {cruise} from 'dependency-cruiser';
import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';

const GUARD_IDS = Object.freeze([
  'admin-live-admission-source-target-fanout',
  'admin-live-publication-direct-nested-projection',
  'admin-shared-snapshot-single-engaged-authority',
]);

function workflowAdmissions() {
  return {
    malformed: {workflowId: '   ', sourcePartitionId: 'ignored'},
    valid: {
      workflowId: 'workflow-1',
      workflowType: 'split',
      transitionState: 'ready',
      sourcePartitionId: ' partition-a ',
      targetPartitionIds: ['partition-b', 'partition-c', 'partition-a', ''],
      admissionDecisionAt: 42,
      admission: {
        decisionType: 'allow',
        decisionDimension: 'placement',
        eligibleNodeIds: [' node-b ', 'node-a', 'node-b'],
        ineligibleNodes: [
          {nodeId: 'node-c', reasonCodes: [' reason-b ', 'reason-a', 'reason-b']},
          {nodeId: '', reasonCodes: ['ignored']},
        ],
      },
      blockingReasons: [' reason-z ', 'reason-y', 'reason-z'],
    },
  };
}

function buildThroughAdmin(publicationConvergence) {
  return new AdminControlSnapshot().buildPriorityRecoveryDecisionSnapshots({
    capturedAt: 100,
    publicationConvergence,
    readinessByNodeId: {},
    workflowAdmissionsByWorkflowId: workflowAdmissions(),
    replicaOperationRows: [],
  });
}

test('live Admin seam projects normalized admission across source and targets', (t) => {
  const result = buildThroughAdmin({});
  t.same(result.snapshots.map((snapshot) => snapshot.partitionId),
    ['partition-a', 'partition-b', 'partition-c']);
  t.notOk(result.snapshots.some((snapshot) => snapshot.partitionId === 'ignored'));
  for (const snapshot of result.snapshots) {
    t.same(snapshot.admission.eligibleNodeIds, ['node-a', 'node-b']);
    t.same(snapshot.admission.ineligibleNodes,
      [{nodeId: 'node-c', reasonCodes: ['reason-a', 'reason-b']}]);
    t.same(snapshot.admission.blockingReasons, ['reason-y', 'reason-z']);
  }
  t.end();
});

test('live Admin seam preserves direct and nested publication projections', (t) => {
  const projectionDiagnostics = {
    recoveryEligibleIncludedNodeIds: ['node-b', 'node-a', 'node-b'],
    readinessExcludedNodeIds: ['node-c'],
    clusterMemberUnhealthyExcludedNodeIds: ['node-c', 'node-d'],
  };
  const direct = buildThroughAdmin({projectionDiagnostics});
  const nested = buildThroughAdmin({
    membershipLifecycleSummary: {projectionDiagnostics},
  });
  for (const partitionId of ['partition-a', 'partition-b', 'partition-c']) {
    const directPublication = direct.snapshots.find((snapshot) =>
      snapshot.partitionId === partitionId).publication;
    const nestedPublication = nested.snapshots.find((snapshot) =>
      snapshot.partitionId === partitionId).publication;
    t.same(nestedPublication.inclusionReasonsByNodeId,
      directPublication.inclusionReasonsByNodeId);
    t.same(nestedPublication.exclusionReasonsByNodeId,
      directPublication.exclusionReasonsByNodeId);
    t.equal(directPublication.exclusionReasonsByNodeId['node-c'].length, 2);
  }
  t.end();
});

test('one live shared-snapshot chain remains without dormant Admin wiring', async (t) => {
  const admin = fs.readFileSync('src/admin/admin-control-snapshot.js', 'utf8');
  const context = fs.readFileSync(
    'src/admin/admin-control-snapshot-priority-recovery-context.js', 'utf8');
  const diagnostics = fs.readFileSync(
    'src/admin/admin-control-snapshot-control-plane-diagnostics.js', 'utf8');
  const snapshot = fs.readFileSync(
    'src/control-plane/priority-recovery-snapshot.js', 'utf8');
  const closure = fs.readFileSync(
    'src/control-plane/priority-recovery-snapshot-closure.js', 'utf8');
  const burndown = fs.readFileSync(
    'src/control-plane/priority-recovery-snapshot-burndown.js', 'utf8');
  for (const name of [
    'buildPriorityRecoveryAdmissionByPartitionId',
    'buildPriorityRecoveryPublicationNodeDecisions',
  ]) {
    t.notMatch(admin, new RegExp(`\\b${name}\\b`, 'u'));
    t.notMatch(context, new RegExp(`\\b${name}\\b`, 'u'));
    t.equal([...`${context}\n${burndown}`.matchAll(
      new RegExp(`function\\s+${name}\\b`, 'gu'))].length, 1);
    t.match(closure, new RegExp(`\\b${name}\\b[\\s\\S]*?from ` +
      '\'\\./priority-recovery-snapshot-burndown\\.js\'', 'u'));
  }
  t.notMatch(admin, /buildSharedPriorityRecoveryDecisionSnapshots/u);
  t.match(diagnostics,
    /buildSharedPriorityRecoveryDecisionSnapshots[\s\S]*?priority-recovery-snapshot\.js/u);
  t.match(diagnostics, /return buildSharedPriorityRecoveryDecisionSnapshots/u);
  t.match(snapshot,
    /buildPriorityRecoveryDecisionSnapshots[\s\S]*?priority-recovery-snapshot-closure\.js/u);
  const graph = await cruise(['src/admin/admin-control-snapshot.js'], {
    baseDir: process.cwd(),
    exclude: 'node_modules',
    doNotFollow: {path: 'node_modules'},
  });
  t.equal(graph.output.summary.error, 0);
  t.notOk(graph.output.modules.some((module) =>
    module.dependencies.some((dependency) => dependency.circular)));
  t.same(GUARD_IDS, [
    'admin-live-admission-source-target-fanout',
    'admin-live-publication-direct-nested-projection',
    'admin-shared-snapshot-single-engaged-authority',
  ]);
});
