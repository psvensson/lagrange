/**
 * Directed below-gate proof for the spread stall un-mask
 * (Quest operation-workflow-drain-redrive; epic
 * control-plane-write-wedge-leader-local-establishment.md, "ROOT REFRAMED").
 *
 * The priority-recovery spread view OPTIMISTICALLY certifies a partition as
 * spread-satisfied the moment a REPLACE op reaches its REMOVE-dispatch phase
 * (workflowStep ACTIVE/STOPPING) on an eligible target — regardless of whether the
 * new target replica is actually voter-ready in the OBSERVED projection
 * (`targetVisibilityState === ACTIVE_OPERATIONAL`). That optimism produces
 * `spread_satisfied_in_flight` for a partition the strict active gate still sees as
 * under-spread, MASKING the real PASS blocker: the REPLACE-created learner failing
 * voter-ready promotion under load (CL-003 / CL-009 / CL-021).
 *
 * The un-mask is unconditional (no flag) and STALL-SCOPED: a REPLACE-remove-dispatch
 * op keeps its optimistic certification only while it is still progressing; once it
 * has sat in the remove-dispatch phase past the stall budget without its target
 * becoming voter-ready, it stops certifying so the honest under-spread blocker is
 * surfaced. These tests pin:
 *  - a still-progressing (or untimed) un-voter-ready remove-dispatch op still
 *    certifies (transient promotion is not penalized);
 *  - a STALLED un-voter-ready remove-dispatch op no longer certifies, so
 *    buildPriorityRecoverySpreadCompletion flips satisfied:true → false;
 *  - a voter-ready (ACTIVE_OPERATIONAL) target certifies regardless of stall;
 *  - non-dispatch-phase ops never certify (owner decision 2026-10-04: the
 *    census alone answers "is it spread?"; superseded the earlier "certify iff
 *    voter-ready" row, which double-counted a target the census already holds);
 *  - the kept remove-dispatch grace is narrowed by the census's holder
 *    identity: no credit when the source's only counted replica is the one
 *    being replaced, and no double count of an already-counted target at a
 *    gap of two or more;
 *  - the strict `plannerReady === true` path stays satisfied regardless.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildPriorityRecoverySpreadCompletion,
  isPriorityRecoverySpreadSatisfyingOperationContext,
} from '../../src/control-plane/priority-recovery-snapshot-ingress.js';
import {buildPriorityRecoveryReplicaOperationContext} from '../../src/control-plane/priority-recovery-snapshot-rebalancer.js';
import {
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryOperationAssessment,
  shouldPriorityRecoveryOperationBlockPlanning,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {
  buildDerivedPriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';

const ELIGIBLE = ['nodeB'];
// Mirrors PRIORITY_RECOVERY_REPLACE_REMOVE_DISPATCH_SPREAD_STALL_BUDGET_MS (60s).
const STALLED_STEP_AGE_MS = 600000;
const PROGRESSING_STEP_AGE_MS = 1000;
const CLOSURE_NOW_MS = 1000000;

// A REPLACE whose op-level workflowStep is in the REMOVE-dispatch phase
// (ACTIVE/STOPPING) but whose OBSERVED target replica is not yet voter-ready.
function dispatchPhaseOpUnverified(overrides = {}) {
  return {
    operationId: 'replace-dispatch-op',
    type: 'REPLACE',
    workflowStep: 'ACTIVE',
    targetNodeId: 'nodeB',
    targetVisibilityState: 'non_active',
    stepAgeMs: PROGRESSING_STEP_AGE_MS,
    ...overrides,
  };
}

test('a still-progressing un-voter-ready remove-dispatch op certifies spread (optimistic grace)', (t) => {
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: PROGRESSING_STEP_AGE_MS}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'recently-entered REMOVE-dispatch op still certifies (grace window)',
  );
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: undefined}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'an untimed REMOVE-dispatch op certifies (no stall evidence => optimistic)',
  );
  t.end();
});

test('a STALLED un-voter-ready remove-dispatch op does NOT certify spread (un-masked)', (t) => {
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: STALLED_STEP_AGE_MS}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    false,
    'a remove-dispatch op stalled past the budget without a voter-ready target no longer certifies',
  );
  t.end();
});

test('stall detection is robust to a stepTimeoutMs of 0 (no per-step deadline)', (t) => {
  // The stall predicate anchors on stepAgeMs, never on stepTimeoutMs, so a step
  // with no deadline still un-masks once it is stalled.
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: STALLED_STEP_AGE_MS, stepTimeoutMs: 0}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    false,
    'a no-deadline (stepTimeoutMs=0) stalled op is still un-masked',
  );
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: PROGRESSING_STEP_AGE_MS, stepTimeoutMs: 0}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'a no-deadline progressing op still certifies (stall is stepAgeMs-driven)',
  );
  t.end();
});

test('a voter-ready (ACTIVE_OPERATIONAL) remove-dispatch op certifies even when stalled', (t) => {
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({
        targetVisibilityState: 'active_operational',
        stepAgeMs: STALLED_STEP_AGE_MS,
      }),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'an actually voter-ready target certifies regardless of stall',
  );
  t.end();
});

// SUPERSEDED (owner decision 2026-10-04, "delete the second authority"):
// this test asserted that a non-dispatch op with an ACTIVE_OPERATIONAL target
// certifies spread. That credit double-counted a target the census already
// counts (the run-1 would_exceed_target_replica_count refusals). It now
// asserts that no non-dispatch op certifies, in any visibility state.
test('a non-dispatch-phase op never certifies spread, whatever its target visibility', (t) => {
  for (const operationContext of [
    {operationId: 'add', type: 'ADD', workflowStep: 'SYNCING', targetNodeId: 'nodeB', targetVisibilityState: 'active_operational', stepAgeMs: STALLED_STEP_AGE_MS},
    {operationId: 'add-done', type: 'ADD', workflowStep: 'COMPLETED', status: 'completed', targetNodeId: 'nodeB', targetVisibilityState: 'active_operational'},
    {operationId: 'replace-sync', type: 'REPLACE', workflowStep: 'SYNCING', targetNodeId: 'nodeB', targetVisibilityState: 'active_operational'},
    {operationId: 'replace-done', type: 'REPLACE', workflowStep: 'COMPLETED', status: 'completed', targetNodeId: 'nodeB', targetVisibilityState: 'active_operational'},
    {operationId: 'replace-failed', type: 'REPLACE', workflowStep: 'FAILED', status: 'failed', targetNodeId: 'nodeB', targetVisibilityState: 'active_operational'},
  ]) {
    t.equal(
      isPriorityRecoverySpreadSatisfyingOperationContext(
        operationContext,
        {eligibleTargetNodeIds: ELIGIBLE},
      ),
      false,
      `${operationContext.operationId} contributes nothing to spread`,
    );
  }
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      {operationId: 'add', type: 'ADD', workflowStep: 'SYNCING', targetNodeId: 'nodeB', targetVisibilityState: 'non_active', stepAgeMs: PROGRESSING_STEP_AGE_MS},
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    false,
    'non-active non-dispatch target does not certify',
  );
  t.end();
});

test('buildPriorityRecoverySpreadCompletion flips satisfied true->false for a STALLED un-voter-ready REPLACE', (t) => {
  const progressing = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [dispatchPhaseOpUnverified({stepAgeMs: PROGRESSING_STEP_AGE_MS})],
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(progressing.satisfied, true, 'progressing: optimistic spread_satisfied_in_flight');
  t.ok(progressing.satisfyingOperationIds.includes('replace-dispatch-op'), 'progressing: op counted as satisfier');

  const stalled = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [dispatchPhaseOpUnverified({stepAgeMs: STALLED_STEP_AGE_MS})],
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(stalled.satisfied, false, 'stalled: honest under-spread (not satisfied)');
  t.equal(stalled.satisfyingOperationCount, 0, 'stalled: op is no longer a satisfier');
  t.ok(stalled.blockingOperationIds.includes('replace-dispatch-op'), 'stalled: op now blocks spread');
  t.end();
});

// Closure / serve-eligibility path: buildPriorityRecoveryReplicaOperationContext
// (the full-cluster builder, distinct from the per-partition decision-snapshot
// builder) must ALSO populate stepAgeMs from the raw steps_history so the un-mask
// fires consistently — else the cluster closure view would re-mask a stalled op
// the per-partition view un-masks.
function closureContextFor(stepAgeMs) {
  const row = {
    operation_id: 'closure-replace-op',
    type: 'REPLACE',
    workflow_step: 'ACTIVE',
    status: 'active',
    entity_type: 'partition',
    partition_id: 'sql_write_operations-p1',
    entity_id: 'sql_write_operations-p1',
    replica_id: 'sql_write_operations-p1-r4',
    source_node_id: 'nodeA',
    target_node_id: 'nodeB',
    updated_at: CLOSURE_NOW_MS,
    steps_history: JSON.stringify([
      {step: 'ACTIVE', timestamp: CLOSURE_NOW_MS - stepAgeMs},
    ]),
  };
  const serviceRows = [{
    service_id: 'sql_write_operations-p1-r4',
    replica_id: 'sql_write_operations-p1-r4',
    service_type: 'partition',
    partition_id: 'sql_write_operations-p1',
    node_id: 'nodeB',
    raft_role: 'learner', // not voter-ready => ACTIVE_NON_OPERATIONAL
    status: 'active',
    address: 'nodeB/partition/sql_write_operations-p1-r4',
  }];
  const built = buildPriorityRecoveryReplicaOperationContext(
    row, {}, serviceRows, {nowMs: CLOSURE_NOW_MS},
  );
  return built?.context;
}

test('closure builder populates stepAgeMs and un-masks a STALLED remove-dispatch op (serve-eligibility path)', (t) => {
  const stalled = closureContextFor(STALLED_STEP_AGE_MS);
  t.equal(stalled?.stepAgeMs, STALLED_STEP_AGE_MS,
    'closure context carries stepAgeMs from raw steps_history (not undefined)');
  const stalledCompletion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [stalled],
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(stalledCompletion.satisfied, false,
    'closure path: stalled un-voter-ready op no longer certifies spread (un-masked)');

  const progressing = closureContextFor(PROGRESSING_STEP_AGE_MS);
  const progressingCompletion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [progressing],
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(progressingCompletion.satisfied, true,
    'closure path: progressing op keeps optimistic certification (grace window)');
  t.end();
});

test('strict plannerReady path stays satisfied regardless of stall (un-mask governs only in-flight optimism)', (t) => {
  const completion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [dispatchPhaseOpUnverified({stepAgeMs: STALLED_STEP_AGE_MS})],
    eligibleTargetNodeIds: ELIGIBLE,
    plannerReady: true,
  });
  t.equal(completion.satisfied, true, 'plannerReady=true => satisfied even when the in-flight op is stalled');
  t.equal(completion.reasonCode, 'planner_ready', 'reason is planner_ready (strict spread), not in-flight');
  t.end();
});

test('spread completion covers the numeric gap with distinct eligible targets', (t) => {
  const operationOnNodeB = dispatchPhaseOpUnverified({
    operationId: 'replace-node-b-1',
    targetVisibilityState: 'active_operational',
  });
  const retryOnNodeB = dispatchPhaseOpUnverified({
    operationId: 'replace-node-b-2',
    targetVisibilityState: 'active_operational',
  });
  const operationOnNodeC = dispatchPhaseOpUnverified({
    operationId: 'replace-node-c',
    targetNodeId: 'nodeC',
    targetVisibilityState: 'active_operational',
  });
  const duplicateTargetCoverage = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [operationOnNodeB, retryOnNodeB],
    eligibleTargetNodeIds: ['nodeB', 'nodeC'],
    plannerSpreadGap: 2,
  });
  t.equal(
    duplicateTargetCoverage.satisfied,
    false,
    'two operations on one node cover only one unit of a two-node spread gap',
  );
  t.same(
    duplicateTargetCoverage.satisfyingOperationIds,
    ['replace-node-b-1', 'replace-node-b-2'],
    'partial qualifying evidence stays inspectable without certifying closure',
  );

  const distinctTargetCoverage = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [operationOnNodeB, operationOnNodeC],
    eligibleTargetNodeIds: ['nodeB', 'nodeC'],
    plannerSpreadGap: 2,
  });
  t.equal(
    distinctTargetCoverage.satisfied,
    true,
    'two distinct eligible targets cover the two-node spread gap',
  );
  t.end();
});

// Narrowed M2 (owner decision 2026-10-04, decision 3). The census's holder
// identity is the planner entry's readyReplicaCountByNodeId.
test('narrowed grace: no credit when the REPLACE source is the census holder it would remove', (t) => {
  const replaceFromSoleHolder = dispatchPhaseOpUnverified({
    sourceNodeId: 'nodeA',
    targetNodeId: 'nodeB',
    targetVisibilityState: 'active_operational',
  });
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(replaceFromSoleHolder, {
      eligibleTargetNodeIds: ['nodeA', 'nodeB'],
      readyReplicaCountByNodeId: {nodeA: 1, nodeC: 1},
      spreadGap: 1,
    }),
    false,
    'a source whose only counted replica is replaced turns {A,C} into {B,C}: no credit',
  );
  const completion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [replaceFromSoleHolder],
    eligibleTargetNodeIds: ['nodeA', 'nodeB'],
    readyReplicaCountByNodeId: {nodeA: 1, nodeC: 1},
    plannerSpreadGap: 1,
  });
  t.equal(completion.satisfied, false, 'the gap stays open');
  t.same(completion.blockingOperationIds, ['replace-dispatch-op'],
    'the REPLACE is an honest blocking operation');
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(replaceFromSoleHolder, {
      eligibleTargetNodeIds: ['nodeA', 'nodeB'],
      readyReplicaCountByNodeId: {nodeA: 3},
      spreadGap: 2,
    }),
    true,
    'a source node that keeps another counted replica can still gain a holder',
  );
  t.end();
});

test('narrowed grace: at a gap of two an already-counted target is not counted again', (t) => {
  const countedTarget = dispatchPhaseOpUnverified({
    operationId: 'replace-counted',
    sourceNodeId: 'nodeD',
    targetNodeId: 'nodeB',
    targetVisibilityState: 'active_operational',
  });
  const newTarget = dispatchPhaseOpUnverified({
    operationId: 'replace-new',
    sourceNodeId: 'nodeD',
    targetNodeId: 'nodeC',
    targetVisibilityState: 'active_operational',
  });
  const completion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [countedTarget, newTarget],
    eligibleTargetNodeIds: ['nodeA', 'nodeB', 'nodeC'],
    readyReplicaCountByNodeId: {nodeB: 1},
    plannerSpreadGap: 2,
  });
  t.equal(completion.satisfied, false,
    'one counted target plus one new target never covers a gap of two');
  t.same(completion.satisfyingOperationIds, ['replace-new'],
    'only the target the census does not already count is credited');
  t.end();
});

test('narrowed grace: a progressing un-voter-ready REPLACE target keeps its grace', (t) => {
  const progressing = dispatchPhaseOpUnverified({
    sourceNodeId: 'nodeD',
    stepAgeMs: PROGRESSING_STEP_AGE_MS,
  });
  const completion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [progressing],
    eligibleTargetNodeIds: ELIGIBLE,
    readyReplicaCountByNodeId: {nodeA: 1, nodeC: 1},
    plannerSpreadGap: 1,
  });
  t.equal(completion.satisfied, true,
    'a non-holder source and an uncounted progressing target keep the grace');
  t.equal(completion.reasonCode, 'replace_remove_dispatch_phase_on_eligible_target');
  t.end();
});

// Formation-shape witnesses (owner decision 2026-10-04, "delete the second
// authority"; diagnosis ../diag-satisfied-summary, run-1 rows): five nodes,
// schema_operations-p1 held by r1-r3 on A and r4 on B (ACTIVE follower),
// r5 joining C (SYNCING learner); ADD r4->B done, ADD r5->C in flight. The
// census shows two holders and a gap of one; no operation may close it.
const FORMATION_NODES = ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'];
const FORMATION_PARTITION = 'schema_operations-p1';
const FORMATION_OTHER_TABLES = [
  'control_plane_publications',
  'replica_operations',
  'sql_transaction_participants',
  'sql_transactions',
  'sql_write_operations',
];

function formationServiceRow(replica, nodeId, status, role) {
  return {
    service_id: `${FORMATION_PARTITION}-${replica}`,
    service_type: 'partition',
    partition_id: FORMATION_PARTITION,
    node_id: nodeId,
    status,
    raft_role: role,
    address: `${nodeId}:1`,
  };
}

function formationAddRow(id, replica, nodeId, status, step, completedAt) {
  return {
    operation_id: id,
    type: 'ADD',
    partition_id: FORMATION_PARTITION,
    entity_type: 'partition',
    entity_id: FORMATION_PARTITION,
    replica_id: `${FORMATION_PARTITION}-${replica}`,
    source_node_id: 'node-a',
    target_node_id: nodeId,
    status,
    workflow_step: step,
    created_at: 1000,
    updated_at: 2000,
    completed_at: completedAt,
    steps_history: '[]',
  };
}

function formationRows({
  r4OpStatus = 'active',
  r4Step = 'ACTIVE',
  r4CompletedAt = 2000,
  withR4Op = true,
  withR5 = true,
} = {}) {
  const serviceRows = [
    formationServiceRow('r1', 'node-a', 'active', 'leader'),
    formationServiceRow('r2', 'node-a', 'active', 'follower'),
    formationServiceRow('r3', 'node-a', 'active', 'follower'),
    formationServiceRow('r4', 'node-b', 'active', 'follower'),
  ];
  if (withR5) {
    serviceRows.push(formationServiceRow('r5', 'node-c', 'syncing', 'learner'));
  }
  for (const tableId of FORMATION_OTHER_TABLES) {
    ['node-a', 'node-b', 'node-c'].forEach((nodeId, index) => {
      serviceRows.push({
        service_id: `${tableId}-p1-r${index + 1}`,
        service_type: 'partition',
        partition_id: `${tableId}-p1`,
        node_id: nodeId,
        status: 'active',
        raft_role: index === 0 ? 'leader' : 'follower',
        address: `${nodeId}:1`,
      });
    });
  }
  const partitionRows = [FORMATION_PARTITION, ...FORMATION_OTHER_TABLES.map(
    (tableId) => `${tableId}-p1`,
  )].map((partitionId) => ({
    partition_id: partitionId,
    table_id: partitionId.replace(/-p1$/, ''),
    replica_count: 3,
  }));
  const replicaOperationRows = [];
  if (withR4Op) {
    replicaOperationRows.push(formationAddRow(
      'op-r4', 'r4', 'node-b', r4OpStatus, r4Step, r4CompletedAt,
    ));
  }
  if (withR5) {
    replicaOperationRows.push(formationAddRow(
      'op-r5', 'r5', 'node-c', 'syncing', 'SYNCING', null,
    ));
  }
  return {serviceRows, partitionRows, replicaOperationRows};
}

function runFormationShape(options = {}) {
  const rows = formationRows(options);
  const census = buildDerivedPriorityPartitionSummary({
    serviceRows: rows.serviceRows,
    partitionRows: rows.partitionRows,
    readinessByNodeId: {},
    projectedServingNodeIds: FORMATION_NODES,
    locallyEligibleNodeIds: FORMATION_NODES,
    publishedActiveNodeIds: FORMATION_NODES,
  });
  const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
    capturedAt: 3000,
    publicationConvergence: {
      publicationEpoch: 8,
      publicationStatus: 'PUBLISHED',
      publishedActiveNodeIds: FORMATION_NODES,
      pendingAckNodeIds: [],
      priorityPartitionSummary: census,
      recoveryActiveNodeIds: FORMATION_NODES,
    },
    readinessByNodeId: {},
    workflowAdmissionsByWorkflowId: {},
    replicaOperationRows: rows.replicaOperationRows,
    serviceRows: rows.serviceRows,
  });
  const snapshot = decisionSnapshots.snapshots.find(
    (entry) => entry.partitionId === FORMATION_PARTITION,
  );
  const r5Assessment = buildPriorityRecoveryOperationAssessment({
    operation: {
      operationId: 'op-r5',
      type: 'ADD',
      partitionId: FORMATION_PARTITION,
      targetNodeId: 'node-c',
      status: 'syncing',
      workflowStep: 'SYNCING',
      replicaId: `${FORMATION_PARTITION}-r5`,
    },
    priorityPartitionSummary: census,
    effectiveEligibleNodeIds: FORMATION_NODES,
    nowMs: 3000,
  });
  return {census, decisionSnapshots, snapshot, r5Assessment};
}

test('(a)-(c),(g) run-1 shape: the census gap stands, nothing credits it, the in-flight ADD holds planning', (t) => {
  const {census, decisionSnapshots, snapshot, r5Assessment} =
    runFormationShape();
  const blocked = census.blockedPartitions.find(
    (entry) => entry.partitionId === FORMATION_PARTITION,
  );
  t.equal(blocked.readyDistinctNodeCount, 2, '(a) two ready holders');
  t.equal(blocked.spreadGap, 1, '(a) gap one');
  t.same(blocked.readyReplicaCountByNodeId, {'node-a': 3, 'node-b': 1},
    '(a) the census names its holders');
  t.equal(snapshot.spreadCompletion.satisfied, false,
    '(b) the completed ADD r4 does not satisfy spread');
  t.same(snapshot.spreadCompletion.satisfyingOperationIds, [],
    '(b) no satisfying operation');
  t.equal(snapshot.semanticState, 'recovering_in_flight', '(b)');
  t.equal(decisionSnapshots.closureWitness.state, 'closure_pending',
    '(c) the closure stays pending');
  t.notOk(
    decisionSnapshots.closureWitness.refreshedPriorityPartitionSummary
      ?.satisfied,
    '(c) the closure never synthesizes a satisfied summary',
  );
  t.equal(shouldPriorityRecoveryOperationBlockPlanning(r5Assessment), true,
    '(g) the in-flight ADD r5 blocks planning for its partition');
  t.end();
});

test('(d) run-3 shape: r4 still SYNCING as an operation keeps the gap honest', (t) => {
  const {snapshot, decisionSnapshots} = runFormationShape({
    r4OpStatus: 'syncing',
    r4Step: 'SYNCING',
    r4CompletedAt: null,
  });
  t.equal(snapshot.spreadCompletion.satisfied, false);
  t.equal(decisionSnapshots.closureWitness.state, 'closure_pending');
  t.end();
});

test('(e) control without op-r4 reads the same as the run-1 shape', (t) => {
  const {snapshot, decisionSnapshots} = runFormationShape({withR4Op: false});
  t.equal(snapshot.semanticState, 'recovering_in_flight');
  t.equal(decisionSnapshots.closureWitness.state, 'closure_pending');
  t.end();
});

test('H5: a completed follow-up ADD with spread really reached reads converged', (t) => {
  const rows = formationRows({withR5: false});
  rows.serviceRows.push(formationServiceRow('r5', 'node-c', 'active', 'follower'));
  rows.replicaOperationRows.push(formationAddRow(
    'op-r5', 'r5', 'node-c', 'active', 'ACTIVE', 2500,
  ));
  const census = buildDerivedPriorityPartitionSummary({
    serviceRows: rows.serviceRows,
    partitionRows: rows.partitionRows,
    readinessByNodeId: {},
    projectedServingNodeIds: FORMATION_NODES,
    locallyEligibleNodeIds: FORMATION_NODES,
    publishedActiveNodeIds: FORMATION_NODES,
  });
  t.equal(census.satisfied, true, 'three distinct voter holders');
  const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
    capturedAt: 3000,
    publicationConvergence: {
      publicationEpoch: 8,
      publicationStatus: 'PUBLISHED',
      publishedActiveNodeIds: FORMATION_NODES,
      pendingAckNodeIds: [],
      priorityPartitionSummary: census,
      recoveryActiveNodeIds: FORMATION_NODES,
    },
    readinessByNodeId: {},
    workflowAdmissionsByWorkflowId: {},
    replicaOperationRows: rows.replicaOperationRows,
    serviceRows: rows.serviceRows,
  });
  const snapshot = decisionSnapshots.snapshots.find(
    (entry) => entry.partitionId === FORMATION_PARTITION,
  );
  t.equal(snapshot.semanticState, 'converged',
    'not blocked_unclassified: the census itself is satisfied');
  t.not(decisionSnapshots.closureWitness.state, 'closure_pending');
  t.end();
});

test('H5b classification: a completed ADD with a census gap LEFT requests a follow-up', (t) => {
  const {snapshot, decisionSnapshots} = runFormationShape({withR5: false});
  t.equal(snapshot.semanticState, 'blocked_unclassified',
    'a follow-up-requiring state, not converged');
  t.ok(
    decisionSnapshots.unresolvedSemanticStateIds.includes('blocked_unclassified'),
    'the gap stays unresolved for the follow-up owner',
  );
  t.end();
});
