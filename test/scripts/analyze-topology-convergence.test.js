import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {buildTopologyConvergenceGraph} from '../../src/diagnostics/topology-convergence-graph.js';

const NODE_BIN = process.execPath;
const SCRIPT_PATH = 'scripts/analyze-topology-convergence.js';
const ARG_HELP = '--help';
const ARG_DECISION_TABLE = '--decision-table';
const ARG_GLOSSARY = '--glossary';
const ARG_EXPLAIN = '--explain';
const ARG_HANDOFF_PROBE = '--handoff-probe';
const ARG_PACKAGE_EVIDENCE_BLOCK = '--package-evidence-block';
const ENCODING_UTF8 = 'utf8';
const HELP_USAGE_PATTERN = /Usage: node scripts\/analyze-topology-convergence\.js/u;
const FIXTURE_DIRECTORY = 'test/scripts/__fixtures__/topology-convergence';
const PRIORITY_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-progress.fixture.json`;
const PRIORITY_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-progress.expected.json`;
const ACTIVE_GATE_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/active-gate-snapshot.fixture.json`;
const ACTIVE_GATE_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/active-gate-snapshot.expected.json`;
const ACTIVE_GATE_REACHABILITY_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/active-gate-snapshot-reachability.fixture.json`;
const ACTIVE_GATE_REACHABILITY_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/active-gate-snapshot-reachability.expected.json`;
const ACTIVE_GATE_PARTIAL_RESIDUAL_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/active-gate-snapshot-partial-residual.fixture.json`;
const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/active-gate-snapshot-partial-residual.expected.json`;
const PUBLICATION_COUNT_ONLY_ACK_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/publication-count-only-ack.fixture.json`;
const PUBLICATION_COUNT_ONLY_ACK_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/publication-count-only-ack.expected.json`;
const PUBLICATION_ACTIVE_GATE_HANDOFF_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/publication-active-gate-handoff-oscillation.fixture.json`;
const PUBLICATION_ACTIVE_GATE_REDUCED_HANDOFF_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/publication-active-gate-reduced-handoff.fixture.json`;
const PRIORITY_DOMINANT_WITNESS_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-dominant-witness-owner-boundary.fixture.json`;
const PRIORITY_REBALANCER_HANDOFF_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-rebalancer-handoff.fixture.json`;
const PRIORITY_REBALANCER_HANDOFF_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/priority-rebalancer-handoff.expected.json`;
const PRIORITY_WORKFLOW_TIMEOUT_TRANSITION_DEFERRED_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-timeout-transition-deferred.fixture.json`;
const PRIORITY_WORKFLOW_TIMEOUT_TRANSITION_DEFERRED_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-timeout-transition-deferred.expected.json`;
const PRIORITY_WORKFLOW_PROGRESS_EVENT_DRIVEN_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-progress-event-driven.fixture.json`;
const PRIORITY_WORKFLOW_PROGRESS_EVENT_DRIVEN_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-progress-event-driven.expected.json`;
const PRIORITY_WORKFLOW_PROGRESS_RECOVERING_IN_FLIGHT_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-progress-recovering-in-flight.fixture.json`;
const PRIORITY_WORKFLOW_PROGRESS_RECOVERING_IN_FLIGHT_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-progress-recovering-in-flight.expected.json`;
const PRIORITY_PARTITION_WITNESS_ONLY_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-partition-witness-only.fixture.json`;
const PRIORITY_PARTITION_WITNESS_ONLY_EXPECTED_PATH =
  `${FIXTURE_DIRECTORY}/priority-partition-witness-only.expected.json`;
const ABSENT_VALUE = 'absent';
const PRIORITY_EDGE_ALIAS = 'priority';
const PRIORITY_EDGE_ID = 'priority_recovery_partition_progress';
const OPERATION_WORKFLOW_OWNER = 'operation_workflow_owner';
const WORKFLOW_PROGRESS_BOUNDARY = 'workflow_progress';
const REBALANCER_LEADER_OWNER = 'rebalancer_leader';
const OPERATION_SCHEDULING_BOUNDARY = 'operation_scheduling';
const GLOSSARY_REASON = 'priority_recovery_progress_blocked';
const GLOSSARY_SEMANTIC_STATE = 'recovering_in_flight';
const PACKAGE_EVIDENCE_HEADING = '## Generated Owner Evidence Block';
const OWNER_DOMINANT_REASON = 'priority_recovery_progress_blocked';
const EDGE_STATE_BLOCKED = 'blocked';
const BLOCKED_REASONS = ['priority_recovery_progress_blocked'];
const PRIORITY_RECOVERY_PROGRESS_CLASSES_PATH =
  'report.scenarios[0].publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses';
const HANDOFF_PROBE_SCHEMA =
  'topology-publication-active-gate-handoff-probe-v1';
const HANDOFF_MISSING_EDGE_ID =
  'publication_ack_to_active_gate_reconcile_missing';
const HANDOFF_MISSING_EDGE_NAME =
  'publication_ack_to_active_gate_reconcile';
const HANDOFF_RESULT_CLASSIFICATION =
  'publication_ack_to_active_gate_reconcile_missing';
const HANDOFF_REQUIRED_PROGRESS_MECHANISM = 'reconcile';
const PUBLICATION_EDGE_ID = 'publication_ack_convergence';
const ACTIVE_GATE_EDGE_ID = 'active_gate_snapshot_coverage';
const TOPOLOGY_PUBLICATION_OWNER = 'topology_publication_owner';
const STARTUP_ACTIVE_GATE_OWNER = 'startup_active_gate_owner';
const PUBLICATION_CONVERGENCE_BOUNDARY = 'publication_convergence';
const SNAPSHOT_COVERAGE_BOUNDARY = 'snapshot_coverage';
const PUBLICATION_PENDING_REASON = 'publication_pending';
const ACTIVE_GATE_TIMED_OUT_REASON = 'active_gate_timed_out';
const OWNER_RECONCILE_PENDING_REASON = 'owner_reconcile_pending';
const SNAPSHOT_COVERAGE_INCOMPLETE_REASON = 'snapshot_coverage_incomplete';
const SNAPSHOT_REPAIR_DEFERRED_REASON = 'snapshot_repair_deferred';
const SNAPSHOT_COVERAGE_ZERO_OF_FIVE = 0;
const SNAPSHOT_COVERAGE_TWO_OF_FIVE = 2;
const EXPECTED_NODE_COUNT = 5;
const MISSING_PUBLISHED_COUNT = 4;
const EDGE_STATE_DEFERRED = 'deferred';
const RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const HANDOFF_DETECTED_TRUE = true;
const ACTIVE_GATE_OWNER_COHORT_STATE_PENDING = 'pending';
const ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_NODE_IDS =
  'node-2,node-3,node-4,node-5';
const HANDOFF_NEXT_REQUIRED_ACTION_BUILD_REPLAYABLE_FIXTURE =
  'build_replayable_handoff_fixture';

describe('analyze-topology-convergence CLI', () => {
  it('prints help text', () => {
    const output = execFileSync(
      NODE_BIN,
      [SCRIPT_PATH, ARG_HELP],
      {encoding: ENCODING_UTF8},
    );

    assert.match(output, HELP_USAGE_PATTERN);
  });

  it('matches golden frontier fixture for priority workflow progress', () => {
    const output = runAnalyzerJson(PRIORITY_FIXTURE_PATH);
    const expected = readJson(PRIORITY_EXPECTED_PATH);

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for active-gate snapshot coverage', () => {
    const output = runAnalyzerJson(ACTIVE_GATE_FIXTURE_PATH);
    const expected = readJson(ACTIVE_GATE_EXPECTED_PATH);

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for active-gate reachability timeout', () => {
    const output = runAnalyzerJson(ACTIVE_GATE_REACHABILITY_FIXTURE_PATH);
    const expected = readJson(ACTIVE_GATE_REACHABILITY_EXPECTED_PATH);

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for active-gate partial residual', () => {
    const output = runAnalyzerJson(ACTIVE_GATE_PARTIAL_RESIDUAL_FIXTURE_PATH);
    const expected = readJson(ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_PATH);

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for count-only publication ACK debt', () => {
    const output = runAnalyzerJson(PUBLICATION_COUNT_ONLY_ACK_FIXTURE_PATH);
    const expected = readJson(PUBLICATION_COUNT_ONLY_ACK_EXPECTED_PATH);

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for retry-scheduled rebalancer handoff', () => {
    const output = runAnalyzerJson(PRIORITY_REBALANCER_HANDOFF_FIXTURE_PATH);
    const expected = readJson(PRIORITY_REBALANCER_HANDOFF_EXPECTED_PATH);

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for timeout transition-deferred workflow progress', () => {
    const output = runAnalyzerJson(
      PRIORITY_WORKFLOW_TIMEOUT_TRANSITION_DEFERRED_FIXTURE_PATH,
    );
    const expected = readJson(
      PRIORITY_WORKFLOW_TIMEOUT_TRANSITION_DEFERRED_EXPECTED_PATH,
    );

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for event-driven workflow progress', () => {
    const output = runAnalyzerJson(
      PRIORITY_WORKFLOW_PROGRESS_EVENT_DRIVEN_FIXTURE_PATH,
    );
    const expected = readJson(
      PRIORITY_WORKFLOW_PROGRESS_EVENT_DRIVEN_EXPECTED_PATH,
    );

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for in-flight workflow progress', () => {
    const output = runAnalyzerJson(
      PRIORITY_WORKFLOW_PROGRESS_RECOVERING_IN_FLIGHT_FIXTURE_PATH,
    );
    const expected = readJson(
      PRIORITY_WORKFLOW_PROGRESS_RECOVERING_IN_FLIGHT_EXPECTED_PATH,
    );

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('matches golden frontier fixture for partition-witness-only workflow progress', () => {
    const output = runAnalyzerJson(PRIORITY_PARTITION_WITNESS_ONLY_FIXTURE_PATH);
    const expected = readJson(PRIORITY_PARTITION_WITNESS_ONLY_EXPECTED_PATH);

    assert.deepEqual(projectGoldenFrontier(output), expected);
  });

  it('keeps dominant witness owner and boundary when report summary omits progress classes', () => {
    const output = runAnalyzerJson(PRIORITY_DOMINANT_WITNESS_FIXTURE_PATH);
    const graph = buildTopologyConvergenceGraph(
      readJson(PRIORITY_DOMINANT_WITNESS_FIXTURE_PATH),
    );
    const priorityNode = graph.nodes.find((node) => node.id === 'priority_recovery_progress');

    assert.equal(output.frontier[0].id, PRIORITY_EDGE_ID);
    assert.equal(output.frontier[0].owner, REBALANCER_LEADER_OWNER);
    assert.equal(output.frontier[0].boundary, OPERATION_SCHEDULING_BOUNDARY);
    assert.equal(output.frontier[0].state, EDGE_STATE_BLOCKED);
    assert.equal(
      output.frontier[0].evidencePath,
      PRIORITY_RECOVERY_PROGRESS_CLASSES_PATH,
    );
    assert.deepEqual(output.frontier[0].reasons, BLOCKED_REASONS);
    assert.equal(output.dominantWitness.owner, REBALANCER_LEADER_OWNER);
    assert.equal(output.dominantWitness.boundary, OPERATION_SCHEDULING_BOUNDARY);
    assert.equal(output.dominantWitness.dominantReason, OWNER_DOMINANT_REASON);
    assert.equal(
      output.dominantWitness.evidencePath,
      PRIORITY_RECOVERY_PROGRESS_CLASSES_PATH,
    );
    assert.equal(priorityNode?.owner, REBALANCER_LEADER_OWNER);
    assert.equal(priorityNode?.boundary, OPERATION_SCHEDULING_BOUNDARY);
  });

  it('prints explicit owner decision table and glossary indexes', () => {
    const decisionTable = runAnalyzerJson(ARG_DECISION_TABLE);
    const glossary = runAnalyzerJson(ARG_GLOSSARY);

    assert.equal(
      decisionTable.schemaVersion,
      'topology-convergence-owner-decision-table-v1',
    );
    assert.ok(
      decisionTable.transitions.some((row) =>
        row.edgeId === PRIORITY_EDGE_ID &&
        row.evidenceInputs.includes('unresolvedSemanticStateIds') &&
        row.evidenceInputs.includes('priorityBlockedPartitionCount')),
    );
    assert.ok(
      glossary.reasons.some((entry) => entry.value === GLOSSARY_REASON),
    );
    assert.ok(
      glossary.semanticStates.some((entry) =>
        entry.value === GLOSSARY_SEMANTIC_STATE),
    );
  });

  it('explains evidence snapshot to owner decision outcome', () => {
    const output = runAnalyzerJson(
      PRIORITY_FIXTURE_PATH,
      ARG_EXPLAIN,
      PRIORITY_EDGE_ALIAS,
    );

    assert.equal(output.schemaVersion, 'topology-owner-explain-v1');
    assert.equal(output.evidenceSnapshot.edgeId, PRIORITY_EDGE_ID);
    assert.equal(output.evidenceSnapshot.owner, OPERATION_WORKFLOW_OWNER);
    assert.equal(output.evidenceSnapshot.boundary, WORKFLOW_PROGRESS_BOUNDARY);
    assert.equal(output.decisionOutcome.state, 'blocked');
    assert.equal(output.decisionOutcome.frontier, true);
    assert.equal(
      output.decisionOutcome.dominantWitness.dominantReason,
      OWNER_DOMINANT_REASON,
    );
    assert.equal(output.decisionTable.edgeId, PRIORITY_EDGE_ID);
    assert.equal(output.decisionTable.owner, OPERATION_WORKFLOW_OWNER);
  });

  it('explains dominant witness owner with progress-class evidence path consistently', () => {
    const output = runAnalyzerJson(
      PRIORITY_DOMINANT_WITNESS_FIXTURE_PATH,
      ARG_EXPLAIN,
      PRIORITY_EDGE_ALIAS,
    );

    assert.equal(output.schemaVersion, 'topology-owner-explain-v1');
    assert.equal(output.evidenceSnapshot.edgeId, PRIORITY_EDGE_ID);
    assert.equal(output.evidenceSnapshot.owner, REBALANCER_LEADER_OWNER);
    assert.equal(output.evidenceSnapshot.boundary, OPERATION_SCHEDULING_BOUNDARY);
    assert.equal(
      output.evidenceSnapshot.evidencePath,
      PRIORITY_RECOVERY_PROGRESS_CLASSES_PATH,
    );
    assert.equal(output.decisionOutcome.state, EDGE_STATE_BLOCKED);
    assert.equal(output.decisionOutcome.frontier, true);
    assert.equal(
      output.decisionOutcome.dominantWitness.owner,
      REBALANCER_LEADER_OWNER,
    );
    assert.equal(
      output.decisionOutcome.dominantWitness.boundary,
      OPERATION_SCHEDULING_BOUNDARY,
    );
    assert.equal(
      output.decisionOutcome.dominantWitness.evidencePath,
      PRIORITY_RECOVERY_PROGRESS_CLASSES_PATH,
    );
    assert.equal(output.decisionTable.edgeId, PRIORITY_EDGE_ID);
    assert.equal(output.decisionTable.owner, REBALANCER_LEADER_OWNER);
    assert.equal(output.decisionTable.boundary, OPERATION_SCHEDULING_BOUNDARY);
  });

  it('prints a replayable publication-to-active-gate handoff probe', () => {
    const output = runAnalyzerJson(
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIXTURE_PATH,
      ARG_HANDOFF_PROBE,
    );

    assert.equal(output.schemaVersion, HANDOFF_PROBE_SCHEMA);
    assert.equal(output.detected, HANDOFF_DETECTED_TRUE);
    assert.deepEqual(output.missingEdge, {
      id: HANDOFF_MISSING_EDGE_ID,
      name: HANDOFF_MISSING_EDGE_NAME,
    });
    assert.equal(
      output.resultClassification,
      HANDOFF_RESULT_CLASSIFICATION,
    );
    assert.equal(
      output.requiredProgressMechanism,
      HANDOFF_REQUIRED_PROGRESS_MECHANISM,
    );
    assert.equal(
      output.runtimePromotionAllowed,
      RUNTIME_PROMOTION_ALLOWED_FALSE,
    );
    assert.equal(output.producer.edge, PUBLICATION_EDGE_ID);
    assert.equal(output.producer.owner, TOPOLOGY_PUBLICATION_OWNER);
    assert.equal(output.producer.boundary, PUBLICATION_CONVERGENCE_BOUNDARY);
    assert.deepEqual(output.producer.reasons, [PUBLICATION_PENDING_REASON]);
    assert.equal(output.consumer.edge, ACTIVE_GATE_EDGE_ID);
    assert.equal(output.consumer.owner, STARTUP_ACTIVE_GATE_OWNER);
    assert.equal(output.consumer.boundary, SNAPSHOT_COVERAGE_BOUNDARY);
    assert.deepEqual(output.consumer.reasons, [
      ACTIVE_GATE_TIMED_OUT_REASON,
      SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
    ]);
    assert.equal(
      output.consumer.source.snapshotCoverageNodeCount,
      SNAPSHOT_COVERAGE_ZERO_OF_FIVE,
    );
    assert.equal(output.consumer.source.expectedNodeCount, EXPECTED_NODE_COUNT);
  });

  it('keeps the active-gate consumer when it is the current handoff frontier',
    () => {
      const output = runAnalyzerJson(
        PUBLICATION_ACTIVE_GATE_REDUCED_HANDOFF_FIXTURE_PATH,
        ARG_HANDOFF_PROBE,
      );

      assert.equal(output.schemaVersion, HANDOFF_PROBE_SCHEMA);
      assert.equal(output.detected, HANDOFF_DETECTED_TRUE);
      assert.equal(
        output.resultClassification,
        HANDOFF_RESULT_CLASSIFICATION,
      );
      assert.equal(output.producer.edge, PUBLICATION_EDGE_ID);
      assert.equal(output.producer.owner, TOPOLOGY_PUBLICATION_OWNER);
      assert.equal(output.producer.boundary, PUBLICATION_CONVERGENCE_BOUNDARY);
      assert.equal(
        output.producer.source.missingPublishedCount,
        MISSING_PUBLISHED_COUNT,
      );
      assert.equal(output.consumer.edge, ACTIVE_GATE_EDGE_ID);
      assert.equal(output.consumer.owner, STARTUP_ACTIVE_GATE_OWNER);
      assert.equal(output.consumer.boundary, SNAPSHOT_COVERAGE_BOUNDARY);
      assert.equal(output.consumer.state, EDGE_STATE_DEFERRED);
      assert.deepEqual(output.consumer.reasons, [
        OWNER_RECONCILE_PENDING_REASON,
        SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        SNAPSHOT_REPAIR_DEFERRED_REASON,
      ]);
      assert.equal(
        output.consumer.source.snapshotCoverageNodeCount,
        SNAPSHOT_COVERAGE_TWO_OF_FIVE,
      );
      assert.equal(
        output.consumer.source.expectedNodeCount,
        EXPECTED_NODE_COUNT,
      );
      assert.equal(
        output.consumer.source.activeGateOwnerCohortState,
        ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
      );
      assert.equal(
        output.consumer.source.activeGateOwnerCohortReasonCode,
        OWNER_RECONCILE_PENDING_REASON,
      );
      assert.equal(
        output.consumer.source.activeGateOwnerCohortPendingReconcileCount,
        MISSING_PUBLISHED_COUNT,
      );
      assert.equal(
        output.consumer.source.activeGateOwnerCohortPendingReconcileNodeIds,
        ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_NODE_IDS,
      );
      assert.deepEqual(output.nextOwnerPath, {
        edge: ACTIVE_GATE_EDGE_ID,
        owner: STARTUP_ACTIVE_GATE_OWNER,
        boundary: SNAPSHOT_COVERAGE_BOUNDARY,
        evidencePath:
          'report.scenarios[0].publicationConvergence.activeGate.progress',
        requiredAction: HANDOFF_NEXT_REQUIRED_ACTION_BUILD_REPLAYABLE_FIXTURE,
        runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
      });
    });

  it('generates a package migration evidence block from analyzer output', () => {
    const output = runAnalyzerText(ARG_PACKAGE_EVIDENCE_BLOCK, PRIORITY_FIXTURE_PATH);

    assert.match(output, new RegExp(PACKAGE_EVIDENCE_HEADING, 'u'));
    assert.match(output, new RegExp(OPERATION_WORKFLOW_OWNER, 'u'));
    assert.match(output, new RegExp(WORKFLOW_PROGRESS_BOUNDARY, 'u'));
    assert.match(output, new RegExp(OWNER_DOMINANT_REASON, 'u'));
    assert.match(output, new RegExp(PRIORITY_EDGE_ID, 'u'));
  });
});

function runAnalyzerJson(...args) {
  return JSON.parse(runAnalyzerText(...args));
}

function runAnalyzerText(...args) {
  return execFileSync(NODE_BIN, [SCRIPT_PATH, ...args], {
    encoding: ENCODING_UTF8,
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, ENCODING_UTF8));
}

function projectGoldenFrontier(output) {
  return {
    summary: {
      frontierCount: output.summary.frontierCount,
      firstFrontierEdgeId: output.summary.firstFrontierEdgeId,
      firstFrontierState: output.summary.firstFrontierState,
      firstFrontierOwner: output.summary.firstFrontierOwner,
      firstFrontierBoundary: output.summary.firstFrontierBoundary,
      firstFrontierReason: output.summary.firstFrontierReason,
    },
    frontier: output.frontier.map(projectFrontierEdge),
    dominantWitness: output.dominantWitness,
  };
}

function projectFrontierEdge(edge) {
  return {
    id: edge.id,
    state: edge.state,
    owner: edge.owner,
    boundary: edge.boundary,
    dominantReason: edge.source.dominantReason || ABSENT_VALUE,
    evidencePath: edge.evidencePath,
    reasons: edge.reasons,
  };
}
