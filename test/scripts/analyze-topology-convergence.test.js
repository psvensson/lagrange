import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildTopologyConvergenceGraph} from '../../src/diagnostics/topology-convergence-graph.js';

const NODE_BIN = process.execPath;
const SCRIPT_PATH = 'scripts/analyze-topology-convergence.js';
const ARG_HELP = '--help';
const ARG_DECISION_TABLE = '--decision-table';
const ARG_GLOSSARY = '--glossary';
const ARG_EXPLAIN = '--explain';
const ARG_HANDOFF_PROBE = '--handoff-probe';
const ARG_REPLAY_FIXTURE = '--replay-fixture';
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
const PUBLICATION_OPERATION_ACTIVE_GATE_HANDOFF_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/publication-operation-active-gate-handoff.fixture.json`;
const PRIORITY_WORKFLOW_DISPATCH_PENDING_PLANNED_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json`;
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
const EDGE_STATE_DEFERRED = 'deferred';
const EDGE_STATE_RETRYABLE = 'retryable';
const BLOCKED_REASONS = ['priority_recovery_progress_blocked'];
const PRIORITY_RECOVERY_PROGRESS_CLASSES_PATH =
  'report.scenarios[0].publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses';
const HANDOFF_PROBE_SCHEMA =
  'topology-publication-active-gate-handoff-probe-v1';
const REPLAY_FIXTURE_SCHEMA = 'topology-convergence-replay-fixture-v1';
const OPERATION_WORKFLOW_HANDOFF_MISSING_EDGE_ID =
  'publication_operation_workflow_handoff_leg_missing';
const OPERATION_WORKFLOW_HANDOFF_MISSING_EDGE_NAME =
  'publication_operation_workflow_handoff';
const HANDOFF_CONTRACT_EDGE_ID =
  'publication_active_gate_handoff_contract';
const HANDOFF_CONTRACT_EDGE_NAME =
  'publication_active_gate_handoff_contract';
const OPERATION_WORKFLOW_HANDOFF_RESULT_CLASSIFICATION =
  'publication_operation_workflow_handoff_leg_missing';
const HANDOFF_CONTRACT_RESULT_CLASSIFICATION =
  'publication_active_gate_handoff_contract_pending';
const HANDOFF_REQUIRED_PROGRESS_MECHANISM = 'reconcile';
const HANDOFF_REQUIRED_PROGRESS_MECHANISM_ADVANCE = 'advance';
const PUBLICATION_EDGE_ID = 'publication_ack_convergence';
const ACTIVE_GATE_EDGE_ID = 'active_gate_snapshot_coverage';
const TOPOLOGY_PUBLICATION_OWNER = 'topology_publication_owner';
const STARTUP_ACTIVE_GATE_OWNER = 'startup_active_gate_owner';
const PUBLICATION_CONVERGENCE_BOUNDARY = 'publication_convergence';
const SNAPSHOT_COVERAGE_BOUNDARY = 'snapshot_coverage';
const ROLLING_RESTART_SCENARIO = 'rolling-restart';
const PUBLICATION_STATUS_UNKNOWN = 'unknown';
const RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION =
  'unpublished_observation';
const PUBLICATION_PENDING_REASON = 'publication_pending';
const ACTIVE_GATE_TIMED_OUT_REASON = 'active_gate_timed_out';
const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const OWNER_RECONCILE_PENDING_REASON = 'owner_reconcile_pending';
const SNAPSHOT_COVERAGE_INCOMPLETE_REASON = 'snapshot_coverage_incomplete';
const SNAPSHOT_REPAIR_DEFERRED_REASON = 'snapshot_repair_deferred';
const PRIORITY_RECOVERY_EVENT_DRIVEN_WAIT_REASON =
  'priority_recovery_event_driven_wait';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON =
  'selected_snapshot_source_timeout';
const SELECTED_SNAPSHOT_TRANSPORT_CLOSED_REASON =
  'selected_transport_closed';
const FORCED_REPAIR_SNAPSHOT_TIMEOUT_REASON =
  'forced_repair_snapshot_timeout';
const AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_TIMEOUT_REASON =
  'authoritative_control_snapshot_query_timeout';
const AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_PRESSURE_REASON =
  'authoritative_control_snapshot_query_pressure';
const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY =
  'authoritative_control_snapshot_query_pressure';
const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_SELECTED_SOURCE =
  'selected_snapshot_source_selection';
const SNAPSHOT_COVERAGE_ZERO_OF_FIVE = 0;
const SNAPSHOT_COVERAGE_TWO_OF_FIVE = 2;
const ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE =
  '11601fe0-72d6-5853-8590-ec2881853e72';
const ACTIVE_GATE_ALTERNATIVE_SNAPSHOT_SOURCE =
  '35a891b8-c1a0-5064-9c6e-2acfba61c2a7';
const ACTIVE_GATE_CONNECTION_CLOSED_PARTICIPANT_NODE =
  '7493b0ab-a054-5fad-a91b-5e331db29304';
const ACTIVE_GATE_CONNECTION_CLOSED_SELECTED_SNAPSHOT_ERROR =
  'Admin API query failed for node ' +
  `${ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE} on lane snapshot: ` +
  'Authoritative control snapshot repair failed: nodes:Connection to node ' +
  `${ACTIVE_GATE_CONNECTION_CLOSED_PARTICIPANT_NODE} closed`;
const ACTIVE_GATE_ADMIN_CONNECTION_CLOSED_SELECTED_SNAPSHOT_ERROR =
  'Admin API query connection closed before response for node ' +
  `${ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE} on lane snapshot; ` +
  'forced repair snapshot failed: ' +
  'Admin API query connection closed before response for node ' +
  `${ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE} on lane snapshot`;
const ACTIVE_GATE_SELECTED_SNAPSHOT_TIMEOUT_MS = 3349;
const EXPECTED_NODE_COUNT = 5;
const MISSING_PUBLISHED_COUNT = 4;
const RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const HANDOFF_DETECTED_TRUE = true;
const HANDOFF_DETECTED_FALSE = false;
const ACTIVE_GATE_OWNER_COHORT_STATE_PENDING = 'pending';
const HANDOFF_CONTRACT_STATE_PENDING = 'pending';
const ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_COUNT = 2;
const PUBLICATION_OPERATION_HANDOFF_PENDING_RECONCILE_COUNT = 3;
const ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_NODE_IDS =
  'node-2,node-3';
const PUBLICATION_OPERATION_HANDOFF_PENDING_RECONCILE_NODE_IDS = [
  'node-2',
  'node-3',
  'node-5',
];
const COMPACT_HANDOFF_PENDING_RECONCILE_COUNT = 0;
const COMPACT_HANDOFF_PENDING_RECONCILE_NODE_IDS = Object.freeze([]);
const HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const HANDOFF_CONTRACT_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const OWNER_QUEUE_DEPTH_STATE_UNKNOWN = 'unknown';
const OWNER_QUEUE_DEPTH_STATE_OBSERVED = 'observed';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_RETRY_AFTER_MS = 1000;
const OWNER_RECOVERY_PENDING_WRITE_COUNT = 1;
const TOPOLOGY_OPERATOR_CURRENT_STEP_ID_DISPATCH_PENDING =
  'dispatch_pending';
const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_PLANNED = 'planned';
const TOPOLOGY_OPERATOR_NEXT_ACTION_ADVANCE_EXISTING_OPERATION =
  'advance_existing_operation';
const PRIORITY_RECOVERY_UNRESOLVED_RECOVERING_IN_FLIGHT =
  'recovering_in_flight';
const PRIORITY_RECOVERY_BLOCKED_PARTITION_IDS_ABSENT = 'absent';
const HANDOFF_PROBE_TARGET_ACTION_BUILD_REPLAYABLE_FIXTURE =
  'build_replayable_handoff_fixture';
const SELECTED_SNAPSHOT_ADMIN_READY = true;
const SELECTED_SNAPSHOT_REACHABLE_BY_ADMIN_HEALTH = 'admin_health';
const SNAPSHOT_OBSERVATION_STATE_DEFERRED_REFRESH = 'deferred_refresh';
const SNAPSHOT_OBSERVATION_CONTRACT_STATE_DEFERRED = 'deferred';
const SNAPSHOT_OBSERVATION_REFRESH_STATE_DEFERRED = 'deferred';
const SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY = 'retry';
const SNAPSHOT_OBSERVATION_RETRY_AFTER_MS = 14976;
const READINESS_CAUSE_NONE = 'none';
const OPERATION_WORKFLOW_WITNESS_EVIDENCE_PATH =
  'report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.topologyOperatorWitness';
const FAILURE_BUNDLE_ACTIVE_GATE_PROGRESS_EVIDENCE_PATH =
  'failureBundle.publicationConvergence.activeGate.progress';
const TEMP_FIXTURE_PREFIX = 'topology-convergence-';
const TEMP_FIXTURE_SUFFIX = '.json';

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

  it('loads linked failure-bundle sidecars before explaining report evidence', () => {
    const {reportPath} = writeLinkedReportFixture();
    const output = runAnalyzerJson(
      reportPath,
      ARG_EXPLAIN,
      ACTIVE_GATE_EDGE_ID,
    );

    assert.equal(output.evidenceSnapshot.edgeId, ACTIVE_GATE_EDGE_ID);
    assert.equal(output.evidenceSnapshot.owner, STARTUP_ACTIVE_GATE_OWNER);
    assert.equal(output.evidenceSnapshot.boundary, SNAPSHOT_COVERAGE_BOUNDARY);
    assert.equal(
      output.evidenceSnapshot.evidencePath,
      FAILURE_BUNDLE_ACTIVE_GATE_PROGRESS_EVIDENCE_PATH,
    );
    assert.equal(output.decisionOutcome.state, EDGE_STATE_BLOCKED);
    assert.ok(output.evidenceSnapshot.reasons.includes(
      ACTIVE_GATE_TIMED_OUT_REASON,
    ));
    assert.ok(output.evidenceSnapshot.reasons.includes(
      SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
    ));
    assert.equal(
      output.evidenceSnapshot.source.snapshotCoverageNodeCount,
      SNAPSHOT_COVERAGE_TWO_OF_FIVE,
    );
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
    assert.equal(output.missingEdge, null);
    assert.deepEqual(output.contractEdge, {
      id: HANDOFF_CONTRACT_EDGE_ID,
      name: HANDOFF_CONTRACT_EDGE_NAME,
    });
    assert.equal(
      output.resultClassification,
      HANDOFF_CONTRACT_RESULT_CLASSIFICATION,
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
      OWNER_RECONCILE_PENDING_REASON,
      SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
      AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_PRESSURE_REASON,
    ]);
    assert.deepEqual(output.handoffContract, {
      state: HANDOFF_CONTRACT_STATE_PENDING,
      reasonCode: OWNER_RECONCILE_PENDING_REASON,
      nextAction: HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE,
      runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
      pendingRecoveryCount: 0,
      pendingRecoveryNodeIds: [],
      pendingReconcileCount: 0,
      pendingReconcileNodeIds: [],
    });
    assert.equal(
      output.consumer.source.snapshotCoverageNodeCount,
      SNAPSHOT_COVERAGE_ZERO_OF_FIVE,
    );
    assert.equal(output.consumer.source.expectedNodeCount, EXPECTED_NODE_COUNT);
  });

  it('prints publication operation workflow active-gate handoff probe', () => {
    const output = runAnalyzerJson(
      PUBLICATION_OPERATION_ACTIVE_GATE_HANDOFF_FIXTURE_PATH,
      ARG_HANDOFF_PROBE,
    );

    assert.equal(output.schemaVersion, HANDOFF_PROBE_SCHEMA);
    assert.equal(output.detected, HANDOFF_DETECTED_FALSE);
    assert.deepEqual(output.missingEdge, {
      id: OPERATION_WORKFLOW_HANDOFF_MISSING_EDGE_ID,
      name: OPERATION_WORKFLOW_HANDOFF_MISSING_EDGE_NAME,
    });
    assert.deepEqual(output.contractEdge, {
      id: HANDOFF_CONTRACT_EDGE_ID,
      name: HANDOFF_CONTRACT_EDGE_NAME,
    });
    assert.equal(
      output.resultClassification,
      OPERATION_WORKFLOW_HANDOFF_RESULT_CLASSIFICATION,
    );
    assert.equal(
      output.requiredProgressMechanism,
      HANDOFF_REQUIRED_PROGRESS_MECHANISM_ADVANCE,
    );
    assert.equal(
      output.runtimePromotionAllowed,
      RUNTIME_PROMOTION_ALLOWED_FALSE,
    );
    assert.equal(output.producer.edge, PUBLICATION_EDGE_ID);
    assert.equal(output.producer.owner, TOPOLOGY_PUBLICATION_OWNER);
    assert.equal(output.producer.boundary, PUBLICATION_CONVERGENCE_BOUNDARY);
    assert.equal(output.producer.state, EDGE_STATE_BLOCKED);
    assert.deepEqual(output.producer.reasons, [PUBLICATION_PENDING_REASON]);
    assert.equal(output.operationWorkflow.edge, PRIORITY_EDGE_ID);
    assert.equal(output.operationWorkflow.owner, OPERATION_WORKFLOW_OWNER);
    assert.equal(output.operationWorkflow.boundary, WORKFLOW_PROGRESS_BOUNDARY);
    assert.equal(output.operationWorkflow.state, EDGE_STATE_RETRYABLE);
    assert.deepEqual(output.operationWorkflow.reasons, [
      PRIORITY_RECOVERY_EVENT_DRIVEN_WAIT_REASON,
    ]);
    assert.equal(
      output.operationWorkflow.source.unresolvedSemanticStateIds,
      PRIORITY_RECOVERY_UNRESOLVED_RECOVERING_IN_FLIGHT,
    );
    assert.equal(
      output.operationWorkflow.source.blockedPartitionIds,
      PRIORITY_RECOVERY_BLOCKED_PARTITION_IDS_ABSENT,
    );
    assert.equal(
      output.operationWorkflow.source.topologyOperatorCurrentStepId,
      TOPOLOGY_OPERATOR_CURRENT_STEP_ID_DISPATCH_PENDING,
    );
    assert.equal(
      output.operationWorkflow.source.topologyOperatorCurrentStepState,
      TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_PLANNED,
    );
    assert.equal(
      output.operationWorkflow.source.topologyOperatorNextAction,
      TOPOLOGY_OPERATOR_NEXT_ACTION_ADVANCE_EXISTING_OPERATION,
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
    assert.deepEqual(output.handoffContract, {
      state: HANDOFF_CONTRACT_STATE_PENDING,
      reasonCode: OWNER_RECONCILE_PENDING_REASON,
      nextAction: HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE,
      runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
      pendingRecoveryCount: 0,
      pendingRecoveryNodeIds: [],
      pendingReconcileCount:
        PUBLICATION_OPERATION_HANDOFF_PENDING_RECONCILE_COUNT,
      pendingReconcileNodeIds:
        PUBLICATION_OPERATION_HANDOFF_PENDING_RECONCILE_NODE_IDS,
    });
    assert.deepEqual(output.nextOwnerPath, {
      edge: PRIORITY_EDGE_ID,
      owner: OPERATION_WORKFLOW_OWNER,
      boundary: WORKFLOW_PROGRESS_BOUNDARY,
      evidencePath: OPERATION_WORKFLOW_WITNESS_EVIDENCE_PATH,
      requiredAction: TOPOLOGY_OPERATOR_NEXT_ACTION_ADVANCE_EXISTING_OPERATION,
      runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
    });
  });

  it('advances compact dispatch-pending fixture through handoff probe', () => {
    const output = runAnalyzerJson(
      PRIORITY_WORKFLOW_DISPATCH_PENDING_PLANNED_FIXTURE_PATH,
      ARG_HANDOFF_PROBE,
    );

    assert.equal(output.schemaVersion, HANDOFF_PROBE_SCHEMA);
    assert.equal(output.detected, HANDOFF_DETECTED_FALSE);
    assert.deepEqual(output.missingEdge, {
      id: OPERATION_WORKFLOW_HANDOFF_MISSING_EDGE_ID,
      name: OPERATION_WORKFLOW_HANDOFF_MISSING_EDGE_NAME,
    });
    assert.deepEqual(output.contractEdge, {
      id: HANDOFF_CONTRACT_EDGE_ID,
      name: HANDOFF_CONTRACT_EDGE_NAME,
    });
    assert.equal(
      output.resultClassification,
      OPERATION_WORKFLOW_HANDOFF_RESULT_CLASSIFICATION,
    );
    assert.equal(
      output.requiredProgressMechanism,
      HANDOFF_REQUIRED_PROGRESS_MECHANISM_ADVANCE,
    );
    assert.equal(output.operationWorkflow.owner, OPERATION_WORKFLOW_OWNER);
    assert.equal(output.operationWorkflow.boundary, WORKFLOW_PROGRESS_BOUNDARY);
    assert.equal(
      output.operationWorkflow.source.topologyOperatorCurrentStepId,
      TOPOLOGY_OPERATOR_CURRENT_STEP_ID_DISPATCH_PENDING,
    );
    assert.equal(
      output.operationWorkflow.source.topologyOperatorCurrentStepState,
      TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_PLANNED,
    );
    assert.equal(
      output.operationWorkflow.source.topologyOperatorNextAction,
      TOPOLOGY_OPERATOR_NEXT_ACTION_ADVANCE_EXISTING_OPERATION,
    );
    assert.deepEqual(output.handoffContract, {
      state: HANDOFF_CONTRACT_STATE_PENDING,
      reasonCode: OWNER_RECONCILE_PENDING_REASON,
      nextAction: HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE,
      runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
      pendingRecoveryCount: 0,
      pendingRecoveryNodeIds: [],
      pendingReconcileCount: COMPACT_HANDOFF_PENDING_RECONCILE_COUNT,
      pendingReconcileNodeIds: COMPACT_HANDOFF_PENDING_RECONCILE_NODE_IDS,
    });
    assert.deepEqual(output.nextOwnerPath, {
      edge: PRIORITY_EDGE_ID,
      owner: OPERATION_WORKFLOW_OWNER,
      boundary: WORKFLOW_PROGRESS_BOUNDARY,
      evidencePath: OPERATION_WORKFLOW_WITNESS_EVIDENCE_PATH,
      requiredAction: TOPOLOGY_OPERATOR_NEXT_ACTION_ADVANCE_EXISTING_OPERATION,
      runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
    });
  });

  it('prints active-gate snapshot timeout owner-edge split in handoff probe',
    () => {
      const output = runAnalyzerJson(ACTIVE_GATE_FIXTURE_PATH, ARG_HANDOFF_PROBE);

      assert.equal(output.schemaVersion, HANDOFF_PROBE_SCHEMA);
      assert.equal(output.consumer.edge, ACTIVE_GATE_EDGE_ID);
      assert.equal(output.consumer.owner, STARTUP_ACTIVE_GATE_OWNER);
      assert.equal(output.consumer.boundary, SNAPSHOT_COVERAGE_BOUNDARY);
      assert.deepEqual(output.consumer.reasons, [
        ACTIVE_GATE_TIMED_OUT_REASON,
        SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        FORCED_REPAIR_SNAPSHOT_TIMEOUT_REASON,
        AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_TIMEOUT_REASON,
      ]);
      assert.equal(
        output.consumer.source.snapshotCoverageNodeCount,
        SNAPSHOT_COVERAGE_ZERO_OF_FIVE,
      );
      assert.equal(
        output.consumer.source.expectedNodeCount,
        EXPECTED_NODE_COUNT,
      );
      assert.equal(
        output.consumer.source.selectedSnapshotNodeId,
        ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE,
      );
      assert.equal(
        output.consumer.source.selectedSnapshotTimeoutMs,
        ACTIVE_GATE_SELECTED_SNAPSHOT_TIMEOUT_MS,
      );
      assert.equal(
        output.consumer.source.selectedSnapshotSourceCause,
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
      );
      assert.equal(
        output.consumer.source.forcedRepairSnapshotCause,
        FORCED_REPAIR_SNAPSHOT_TIMEOUT_REASON,
      );
      assert.equal(
        output.consumer.source.authoritativeControlSnapshotQueryCause,
        AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_TIMEOUT_REASON,
      );
      assert.equal(
        output.consumer.source.activeGateSnapshotOwnerEdge,
        ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
      );
    });

  it('replays connection-closed authoritative snapshot query pressure', () => {
    const output = runAnalyzerJsonForFixture(
      buildConnectionClosedActiveGateFixture(),
      ARG_HANDOFF_PROBE,
    );

    assert.equal(output.schemaVersion, HANDOFF_PROBE_SCHEMA);
    assert.equal(output.consumer.edge, ACTIVE_GATE_EDGE_ID);
    assert.equal(output.consumer.owner, STARTUP_ACTIVE_GATE_OWNER);
    assert.equal(output.consumer.boundary, SNAPSHOT_COVERAGE_BOUNDARY);
    assert.deepEqual(output.consumer.reasons, [
      ACTIVE_GATE_TIMED_OUT_REASON,
      SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
      AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_PRESSURE_REASON,
    ]);
    assert.equal(
      output.consumer.source.selectedSnapshotNodeId,
      ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE,
    );
    assert.equal(
      output.consumer.source.authoritativeControlSnapshotQueryCause,
      AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_PRESSURE_REASON,
    );
    assert.equal(
      output.consumer.source.activeGateSnapshotOwnerEdge,
      ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
    );
    assert.equal(
      output.nextOwnerPath.requiredAction,
      HANDOFF_PROBE_TARGET_ACTION_BUILD_REPLAYABLE_FIXTURE,
    );
  });

  it('replays selected snapshot source connection closure pressure', () => {
    const fixture = buildConnectionClosedActiveGateFixture();
    const progress =
      fixture.scenarios[0].publicationConvergence.activeGate.progress;
    Object.assign(progress, {
      selectedSnapshotError:
        ACTIVE_GATE_ADMIN_CONNECTION_CLOSED_SELECTED_SNAPSHOT_ERROR,
      selectedSnapshotAdminReady: SELECTED_SNAPSHOT_ADMIN_READY,
      selectedSnapshotReachableBy: SELECTED_SNAPSHOT_REACHABLE_BY_ADMIN_HEALTH,
      perNodePublicationDisagreementSet: {
        [ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE]: [],
        [ACTIVE_GATE_ALTERNATIVE_SNAPSHOT_SOURCE]: [],
      },
    });

    const output = runAnalyzerJsonForFixture(fixture, ARG_HANDOFF_PROBE);

    assert.deepEqual(output.consumer.reasons, [
      ACTIVE_GATE_TIMED_OUT_REASON,
      SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
      SELECTED_SNAPSHOT_TRANSPORT_CLOSED_REASON,
    ]);
    assert.equal(
      output.consumer.source.selectedSnapshotNodeId,
      ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE,
    );
    assert.equal(
      output.consumer.source.selectedSnapshotSourceCause,
      SELECTED_SNAPSHOT_TRANSPORT_CLOSED_REASON,
    );
    assert.equal(
      output.consumer.source.activeGateSnapshotOwnerEdge,
      ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_SELECTED_SOURCE,
    );
    assert.equal(
      output.nextOwnerPath.requiredAction,
      HANDOFF_PROBE_TARGET_ACTION_BUILD_REPLAYABLE_FIXTURE,
    );
  });

  it('surfaces selected snapshot observation retry contracts in the handoff probe',
    () => {
      const fixture = buildConnectionClosedActiveGateFixture();
      const progress =
        fixture.scenarios[0].publicationConvergence.activeGate.progress;
      Object.assign(progress, {
        selectedSnapshotError:
          ACTIVE_GATE_ADMIN_CONNECTION_CLOSED_SELECTED_SNAPSHOT_ERROR,
        selectedSnapshotObservationState:
          SNAPSHOT_OBSERVATION_STATE_DEFERRED_REFRESH,
        selectedSnapshotObservationContractState:
          SNAPSHOT_OBSERVATION_CONTRACT_STATE_DEFERRED,
        selectedSnapshotObservationRefreshState:
          SNAPSHOT_OBSERVATION_REFRESH_STATE_DEFERRED,
        selectedSnapshotObservationNextAction:
          SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY,
        selectedSnapshotObservationRetryAfterMs:
          SNAPSHOT_OBSERVATION_RETRY_AFTER_MS,
        selectedSnapshotObservationReasonCodes: [
          SELECTED_SNAPSHOT_TRANSPORT_CLOSED_REASON,
        ],
        selectedSnapshotRepairDeferred: true,
      });

      const output = runAnalyzerJsonForFixture(fixture, ARG_HANDOFF_PROBE);

      assert.deepEqual(output.contractEdge, {
        id: HANDOFF_CONTRACT_EDGE_ID,
        name: HANDOFF_CONTRACT_EDGE_NAME,
      });
      assert.deepEqual(output.handoffContract, {
        state: SNAPSHOT_OBSERVATION_CONTRACT_STATE_DEFERRED,
        reasonCode: SELECTED_SNAPSHOT_TRANSPORT_CLOSED_REASON,
        nextAction: SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY,
        runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
        pendingRecoveryCount: 0,
        pendingRecoveryNodeIds: [],
        pendingReconcileCount: 0,
        pendingReconcileNodeIds: [],
      });
      assert.equal(
        output.nextOwnerPath.requiredAction,
        SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY,
      );
      assert.equal(output.runtimePromotionAllowed, RUNTIME_PROMOTION_ALLOWED_FALSE);
    });

  it('keeps selected snapshot witness diagnostics in replay fixtures', () => {
    const fixture = buildConnectionClosedActiveGateFixture();
    const progress =
      fixture.scenarios[0].publicationConvergence.activeGate.progress;
    const perNodePublicationDisagreementSet = {
      [ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE]: [],
      [ACTIVE_GATE_ALTERNATIVE_SNAPSHOT_SOURCE]: [],
    };
    Object.assign(progress, {
      selectedSnapshotNodeId: ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE,
      selectedSnapshotAdminReady: SELECTED_SNAPSHOT_ADMIN_READY,
      selectedSnapshotReachableBy: SELECTED_SNAPSHOT_REACHABLE_BY_ADMIN_HEALTH,
      perNodePublicationDisagreementSet,
    });

    const replay = runAnalyzerJsonForFixture(fixture, ARG_REPLAY_FIXTURE);
    const replayProgress = replay.publicationConvergence.activeGate.progress;
    const replayProbe = runAnalyzerJsonForFixture(replay, ARG_HANDOFF_PROBE);

    assert.equal(replay.schemaVersion, REPLAY_FIXTURE_SCHEMA);
    assert.equal(
      replayProgress.selectedSnapshotAdminReady,
      SELECTED_SNAPSHOT_ADMIN_READY,
    );
    assert.equal(
      replayProgress.selectedSnapshotReachableBy,
      SELECTED_SNAPSHOT_REACHABLE_BY_ADMIN_HEALTH,
    );
    assert.equal(replayProgress.alternativeSnapshotWitnessAvailable, true);
    assert.deepEqual(
      replayProgress.perNodePublicationDisagreementSet,
      perNodePublicationDisagreementSet,
    );
    assert.equal(
      replayProbe.consumer.source.selectedSnapshotAdminReady,
      SELECTED_SNAPSHOT_ADMIN_READY,
    );
    assert.equal(
      replayProbe.consumer.source.selectedSnapshotReachableBy,
      SELECTED_SNAPSHOT_REACHABLE_BY_ADMIN_HEALTH,
    );
    assert.equal(
      replayProbe.consumer.source.alternativeSnapshotWitnessAvailable,
      true,
    );
    assert.equal(
      replayProbe.nextOwnerPath.requiredAction,
      HANDOFF_PROBE_TARGET_ACTION_BUILD_REPLAYABLE_FIXTURE,
    );
  });

  it('surfaces no-debt publication pending replay handoff in diagnostics',
    () => {
      const fixture = buildNoDebtPublicationPendingHandoffFixture();
      const probe = runAnalyzerJsonForFixture(fixture, ARG_HANDOFF_PROBE);
      const replay = runAnalyzerJsonForFixture(fixture, ARG_REPLAY_FIXTURE);

      assert.equal(probe.schemaVersion, HANDOFF_PROBE_SCHEMA);
      assert.equal(probe.detected, HANDOFF_DETECTED_TRUE);
      assert.equal(probe.missingEdge, null);
      assert.deepEqual(probe.contractEdge, {
        id: HANDOFF_CONTRACT_EDGE_ID,
        name: HANDOFF_CONTRACT_EDGE_NAME,
      });
      assert.deepEqual(probe.handoffContract, {
        state: HANDOFF_CONTRACT_STATE_PENDING,
        reasonCode: OWNER_RECONCILE_PENDING_REASON,
        nextAction: HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE,
        runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
        pendingRecoveryCount: 0,
        pendingRecoveryNodeIds: [],
        pendingReconcileCount: 0,
        pendingReconcileNodeIds: [],
      });
      assert.equal(
        probe.resultClassification,
        HANDOFF_CONTRACT_RESULT_CLASSIFICATION,
      );
      assert.equal(
        probe.nextOwnerPath.requiredAction,
        HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE,
      );
      assert.deepEqual(
        replay.publicationConvergence.publicationActiveGateHandoff,
        {
          state: HANDOFF_CONTRACT_STATE_PENDING,
          reasonCode: OWNER_RECONCILE_PENDING_REASON,
          nextAction: HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE,
          runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
          pendingRecoveryCount: 0,
          pendingRecoveryNodeIds: [],
          pendingReconcileCount: 0,
          pendingReconcileNodeIds: [],
        },
      );
    });

  it('keeps the active-gate consumer when it is the current handoff frontier',
    () => {
      const output = runAnalyzerJson(
        PUBLICATION_ACTIVE_GATE_REDUCED_HANDOFF_FIXTURE_PATH,
        ARG_HANDOFF_PROBE,
      );

      assert.equal(output.schemaVersion, HANDOFF_PROBE_SCHEMA);
      assert.equal(output.detected, HANDOFF_DETECTED_TRUE);
      assert.equal(output.missingEdge, null);
      assert.deepEqual(output.contractEdge, {
        id: HANDOFF_CONTRACT_EDGE_ID,
        name: HANDOFF_CONTRACT_EDGE_NAME,
      });
      assert.equal(
        output.resultClassification,
        HANDOFF_CONTRACT_RESULT_CLASSIFICATION,
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
      assert.equal(output.consumer.state, EDGE_STATE_BLOCKED);
      assert.deepEqual(output.handoffContract, {
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: OWNER_RECONCILE_PENDING_REASON,
        nextAction: HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE,
        runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
        pendingRecoveryCount: 0,
        pendingRecoveryNodeIds: [],
        pendingReconcileCount:
          ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_COUNT,
        pendingReconcileNodeIds: ['node-2', 'node-3'],
      });
      assert.deepEqual(output.consumer.reasons, [
        ACTIVE_GATE_TIMED_OUT_REASON,
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
        ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_COUNT,
      );
      assert.equal(
        output.consumer.source.activeGateOwnerCohortPendingReconcileNodeIds,
        ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_NODE_IDS,
      );
      assert.equal(
        output.consumer.source.selectedSnapshotObservationState,
        SNAPSHOT_OBSERVATION_STATE_DEFERRED_REFRESH,
      );
      assert.equal(
        output.consumer.source.selectedSnapshotObservationContractState,
        SNAPSHOT_OBSERVATION_CONTRACT_STATE_DEFERRED,
      );
      assert.equal(
        output.consumer.source.selectedSnapshotObservationRefreshState,
        SNAPSHOT_OBSERVATION_REFRESH_STATE_DEFERRED,
      );
      assert.equal(
        output.consumer.source.selectedSnapshotObservationNextAction,
        SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY,
      );
      assert.equal(
        output.consumer.source.selectedSnapshotObservationRetryAfterMs,
        SNAPSHOT_OBSERVATION_RETRY_AFTER_MS,
      );
      assert.deepEqual(output.nextOwnerPath, {
        edge: ACTIVE_GATE_EDGE_ID,
        owner: STARTUP_ACTIVE_GATE_OWNER,
        boundary: SNAPSHOT_COVERAGE_BOUNDARY,
        evidencePath:
          'report.scenarios[0].publicationConvergence.activeGate.progress',
        requiredAction: HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE,
        runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
      });
    });

  it('surfaces owner recovery queue drain evidence in the handoff probe', () => {
    const fixture = readJson(PUBLICATION_ACTIVE_GATE_REDUCED_HANDOFF_FIXTURE_PATH);
    const progress = fixture.scenarios[0]
      .publicationConvergence.activeGate.progress;
    progress.selectedControlPlaneOwnerQueueDepth = null;
    progress.membershipPublicationHandoffOutcomeState =
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED;
    progress.membershipPublicationHandoffOutcomeEnqueued = true;
    progress.membershipPublicationHandoffOutcomeRetryAfterMs =
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_RETRY_AFTER_MS;

    const output = runAnalyzerJsonForFixture(fixture, ARG_HANDOFF_PROBE);

    assert.deepEqual(output.ownerRecoveryQueue, {
      depth: {
        state: OWNER_QUEUE_DEPTH_STATE_UNKNOWN,
        pendingWrites: OWNER_QUEUE_DEPTH_STATE_UNKNOWN,
        pendingWriteGrowthCount: OWNER_QUEUE_DEPTH_STATE_UNKNOWN,
      },
      handoffOutcome: {
        state: MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
        reasonCode: ABSENT_VALUE,
        enqueued: true,
        retryAfterMs: MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_RETRY_AFTER_MS,
      },
      pendingReconcileCount: ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_COUNT,
      activeGateOwnerCohortMissingPublishedCount:
        ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_COUNT,
    });
  });

  it('surfaces owner recovery wait evidence in the handoff probe', () => {
    const fixture = readJson(PUBLICATION_ACTIVE_GATE_REDUCED_HANDOFF_FIXTURE_PATH);
    const publication = fixture.scenarios[0].publicationConvergence;
    const progress = publication.activeGate.progress;
    const recoveryNodeId = ACTIVE_GATE_OWNER_COHORT_PENDING_RECONCILE_NODE_IDS
      .split(',')[0];
    const waitHandoff = {
      ...publication.publicationActiveGateHandoff,
      missingPublishedNodeIds: [],
      missingPublishedCount: 0,
      pendingRecoveryNodeIds: [recoveryNodeId],
      pendingRecoveryCount: OWNER_RECOVERY_PENDING_WRITE_COUNT,
      pendingReconcileNodeIds: [],
      pendingReconcileCount: 0,
      nextAction: HANDOFF_CONTRACT_NEXT_ACTION_WAIT_OWNER_RECOVERY,
    };
    publication.missingPublishedNodeIds = [];
    publication.missingPublishedCount = 0;
    publication.publicationActiveGateHandoff = waitHandoff;
    progress.selectedControlPlaneOwnerQueueDepth = null;
    progress.publicationActiveGateHandoffNextAction =
      HANDOFF_CONTRACT_NEXT_ACTION_WAIT_OWNER_RECOVERY;
    progress.publicationActiveGateHandoffPendingReconcileNodeIds = [];
    progress.publicationActiveGateHandoffPendingReconcileCount = 0;
    progress.activeGateOwnerCohortMissingPublishedNodeIds = [];
    progress.activeGateOwnerCohortMissingPublishedCount = 0;
    progress.activeGateOwnerCohortPendingRecoveryNodeIds = [recoveryNodeId];
    progress.activeGateOwnerCohortPendingRecoveryCount =
      OWNER_RECOVERY_PENDING_WRITE_COUNT;
    progress.activeGateOwnerCohortPendingReconcileNodeIds = [];
    progress.activeGateOwnerCohortPendingReconcileCount = 0;

    const output = runAnalyzerJsonForFixture(fixture, ARG_HANDOFF_PROBE);

    assert.equal(output.detected, HANDOFF_DETECTED_TRUE);
    assert.equal(
      output.resultClassification,
      HANDOFF_CONTRACT_RESULT_CLASSIFICATION,
    );
    assert.deepEqual(output.handoffContract, {
      state: HANDOFF_CONTRACT_STATE_PENDING,
      reasonCode: OWNER_RECONCILE_PENDING_REASON,
      nextAction: HANDOFF_CONTRACT_NEXT_ACTION_WAIT_OWNER_RECOVERY,
      runtimePromotionAllowed: RUNTIME_PROMOTION_ALLOWED_FALSE,
      pendingRecoveryCount: OWNER_RECOVERY_PENDING_WRITE_COUNT,
      pendingRecoveryNodeIds: [recoveryNodeId],
      pendingReconcileCount: 0,
      pendingReconcileNodeIds: [],
    });
    assert.deepEqual(output.ownerRecoveryQueue, {
      depth: {
        state: OWNER_QUEUE_DEPTH_STATE_OBSERVED,
        pendingWrites: OWNER_RECOVERY_PENDING_WRITE_COUNT,
        pendingWriteGrowthCount: OWNER_QUEUE_DEPTH_STATE_UNKNOWN,
      },
      handoffOutcome: {
        state: MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
        reasonCode: OWNER_RECONCILE_PENDING_REASON,
        enqueued: false,
        retryAfterMs: 0,
      },
      pendingReconcileCount: 0,
      activeGateOwnerCohortMissingPublishedCount: 0,
    });
    assert.equal(
      output.nextOwnerPath.requiredAction,
      HANDOFF_CONTRACT_NEXT_ACTION_WAIT_OWNER_RECOVERY,
    );
    assert.equal(output.runtimePromotionAllowed, RUNTIME_PROMOTION_ALLOWED_FALSE);
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

function buildConnectionClosedActiveGateFixture() {
  return {
    scenarios: [
      {
        scenario: 'rolling-restart',
        publicationConvergence: {
          publicationStatus: 'UNKNOWN',
          pendingAckCount: 0,
          blockedNodeCount: 0,
          missingPublishedCount: 0,
          activeGate: {
            state: 'timed_out',
            ready: false,
            progress: {
              expectedNodeCount: EXPECTED_NODE_COUNT,
              snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_ZERO_OF_FIVE,
              snapshotCoverageComplete: false,
              selectedSnapshotError:
                ACTIVE_GATE_CONNECTION_CLOSED_SELECTED_SNAPSHOT_ERROR,
              readinessDelay: {
                cause: 'none',
              },
              blockers: [
                'inactive_nodes=1',
                'snapshot_coverage=0/5',
                'snapshot_error',
              ],
            },
          },
        },
        readinessFailure: {
          mode: 'startup',
          classCode: 'no_progress_terminal',
          recoverability: 'terminal',
          terminalReason: 'stalled_no_progress',
          cause: 'none',
          source: 'unknown',
        },
      },
    ],
  };
}

function buildNoDebtPublicationPendingHandoffFixture() {
  return {
    scenarios: [
      {
        scenario: ROLLING_RESTART_SCENARIO,
        publicationConvergence: {
          publicationEpoch: 0,
          publicationStatus: PUBLICATION_STATUS_UNKNOWN,
          pendingAckNodeIds: [],
          pendingAckCount: 0,
          blockedNodeCount: 0,
          publishedActiveNodeIds: [],
          missingPublishedNodeIds: [],
          missingPublishedCount: 0,
          publicationPending: true,
          recoveryProtocolState:
            RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION,
          prioritySpreadPending: false,
          activeGate: {
            state: ACTIVE_GATE_STATE_TIMED_OUT,
            progress: {
              snapshotCoverageComplete: false,
              snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_ZERO_OF_FIVE,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedSnapshotError:
                ACTIVE_GATE_CONNECTION_CLOSED_SELECTED_SNAPSHOT_ERROR,
              readinessDelay: {
                cause: READINESS_CAUSE_NONE,
              },
              blockers: [
                'inactive_nodes=1',
                'snapshot_coverage=0/5',
                'snapshot_error',
              ],
            },
          },
        },
      },
    ],
  };
}

function runAnalyzerJson(...args) {
  return JSON.parse(runAnalyzerText(...args));
}

function runAnalyzerJsonForFixture(fixture, ...args) {
  const fixturePath = writeTemporaryFixture(fixture);
  try {
    return runAnalyzerJson(fixturePath, ...args);
  } finally {
    fs.rmSync(fixturePath, {force: true});
  }
}

function writeTemporaryFixture(fixture) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX),
  );
  const fixturePath = path.join(directory, TEMP_FIXTURE_SUFFIX);
  fs.writeFileSync(fixturePath, JSON.stringify(fixture), ENCODING_UTF8);
  return fixturePath;
}

function writeLinkedReportFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX),
  );
  const bundlePath = path.join(directory, 'failure-bundle.json');
  const reportPath = path.join(directory, 'report.report.json');
  fs.writeFileSync(
    bundlePath,
    JSON.stringify(buildLinkedFailureBundleFixture()),
    ENCODING_UTF8,
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      scenarios: [{
        scenario: ROLLING_RESTART_SCENARIO,
        passed: false,
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_UNKNOWN,
          publicationPending: false,
          pendingAckCount: 0,
          blockedNodeCount: 0,
          missingPublishedCount: 0,
          prioritySpreadPending: false,
        },
        failureBundle: {
          jsonPath: bundlePath,
        },
      }],
    }),
    ENCODING_UTF8,
  );
  return {reportPath, bundlePath};
}

function buildLinkedFailureBundleFixture() {
  return {
    scenario: ROLLING_RESTART_SCENARIO,
    summary: {
      passed: false,
      dominantReason: 'admin_reachability_refused',
      failureClass: 'startup_recovery_blocked',
    },
    publicationConvergence: {
      publicationStatus: PUBLICATION_STATUS_UNKNOWN,
      publicationPending: false,
      pendingAckCount: 0,
      blockedNodeCount: 0,
      missingPublishedCount: 0,
      prioritySpreadPending: false,
      activeGate: {
        state: ACTIVE_GATE_STATE_TIMED_OUT,
        ready: false,
        progress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_TWO_OF_FIVE,
          snapshotCoverageComplete: false,
          blockers: ['snapshot_coverage=2/5'],
        },
      },
    },
  };
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
