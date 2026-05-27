import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  EDGE_STATE,
  buildTopologyConvergenceDecisionTable,
  buildTopologyConvergenceOwnerPresentation,
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceGraphFromArtifacts,
  selectTopologyConvergenceDominantWitness,
} from '../../src/diagnostics/topology-convergence-graph.js';

const FIXTURE_SCENARIO = 'fixture-rolling-restart';
const FIXTURE_PUBLICATION_EPOCH = 4;
const FIXTURE_EXPECTED_NODE_COUNT = 5;
const FIXTURE_SNAPSHOT_COVERAGE_COUNT = 2;
const FIXTURE_PRIORITY_GAP = 2;
const FIXTURE_ATTEMPTS = 7;
const FIXTURE_ELAPSED_MS = 123292;
const FIXTURE_DOMINANT_REASON = 'priority_recovery_workflow_progress_event_driven';
const FIXTURE_FAILURE_CLASS = 'priority_recovery_progress_blocked';
const FIXTURE_PARTITION_ID = 'sql_write_operations-p1';
const FIXTURE_PRIORITY_SEMANTIC_STATE = 'operation_stalled';
const FIXTURE_PRIORITY_RECOVERING_STATE = 'recovering_in_flight';
const FIXTURE_PRIORITY_SPREAD_SATISFIED_STATE =
  'spread_satisfied_in_flight';
const FIXTURE_READINESS_MODE = 'startup';
const FIXTURE_READINESS_CLASS = 'snapshot_reachability_timeout';
const FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CLASS = 'snapshot_timeout';
const FIXTURE_READINESS_RECOVERABILITY = 'terminal';
const FIXTURE_READINESS_RECOVERABILITY_RECOVERABLE = 'recoverable';
const FIXTURE_READINESS_TERMINAL_REASON = 'stalled_no_progress';
const FIXTURE_READINESS_CAUSE = 'snapshot_reachability_timeout';
const FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CAUSE = 'snapshot_timeout';
const FIXTURE_READINESS_SOURCE = 'selectedSnapshotReachabilityError';
const FIXTURE_READINESS_SELECTED_SNAPSHOT_SOURCE = 'selectedSnapshotError';
const FIXTURE_TOP_REASON = 'priority_partitions_not_spread';
const FIXTURE_TOP_REASON_COUNT = 2;
const ZERO_COUNT = 0;
const ONE_COUNT = 1;
const EXPECTED_EDGE_COUNT = 5;
const EXPECTED_EMPTY_FRONTIER_COUNT = 0;
const MIN_FRONTIER_COUNT = 1;
const JSON_ENCODING_UTF8 = 'utf8';
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;
const SCENARIO_ROLLING_RESTART = 'rolling-restart';
const OWNER_OPERATION_WORKFLOW = 'operation_workflow_owner';
const SOURCE_PATH_ABSENT = 'absent';
const SOURCE_PATH_FAILURE_BUNDLE = 'failureBundle';
const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const ACTIVE_GATE_STATE_STALLED = 'stalled';
const ACTIVE_GATE_STATE_READY = 'ready';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING = 'priority_spread_pending';
const PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED = 'acknowledged';
const PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG = 'consumer_lag';
const PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER =
  'waiting_for_consumer';
const PUBLICATION_OWNER_REVISION_STATE_CURRENT = 'current';
const PUBLICATION_OWNER_STREAM_OUTCOME_STALE = 'stale';
const PUBLICATION_OWNER_SEMANTIC_OWNER = 'publication_owner';
const EDGE_PRIORITY_RECOVERY = 'priority_recovery_partition_progress';
const EDGE_PUBLICATION_ACK_CONVERGENCE = 'publication_ack_convergence';
const EDGE_SNAPSHOT_COVERAGE = 'active_gate_snapshot_coverage';
const EDGE_READINESS = 'readiness_startup_support';
const EDGE_TOP_FAILURE_REASONS = 'top_failure_reasons';
const OWNER_TOPOLOGY_PUBLICATION = 'topology_publication_owner';
const BOUNDARY_WORKFLOW_PROGRESS = 'workflow_progress';
const ARTIFACT_PATH_20260507 =
  'test-output/reports/.playback/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z/rolling-restart/failure-bundle.json';
const REPORT_ARTIFACT_PATH_20260507 =
  'test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json';
const REPORT_ARTIFACT_PATH_PUBLICATION_ACK_FRONTIER =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json';
const REPORT_ARTIFACT_PATH_PUBLICATION_ACK_REDUCED =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json';
const REPORT_ARTIFACT_PATH_PUBLICATION_COUNT_ONLY_ACK =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json';
const REPORT_ARTIFACT_PATH_PUBLICATION_LAG =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json';
const REPORT_ARTIFACT_PATH_CURRENT_READINESS_SUPPORT =
  'test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json';
const REPORT_ARTIFACT_PATH_ACTIVE_GATE_OWNER_TRUTH =
  'test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json';
const REPORT_ARTIFACT_PATH_PUBLICATION_PROJECTION_RECONCILIATION =
  'test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json';
const REPORT_ARTIFACT_PATH_NETWORK_PARTITION = 'test-output/report.json';
const PUBLICATION_ACK_PENDING_STATUS = 'ACK_PENDING';
const PUBLICATION_UNKNOWN_STATUS = 'UNKNOWN';
const PUBLICATION_PENDING_REASON = 'publication_pending';
const PUBLICATION_PUBLISHED_REASON = 'publication_published';
const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
const MISSING_PUBLISHED_NODES_PRESENT_REASON =
  'missing_published_nodes_present';
const PENDING_ACKS_PRESENT_REASON = 'pending_acks_present';
const ACTIVE_GATE_TIMED_OUT_REASON = 'active_gate_timed_out';
const SNAPSHOT_COVERAGE_INCOMPLETE_REASON = 'snapshot_coverage_incomplete';
const SNAPSHOT_REPAIR_DEFERRED_REASON = 'snapshot_repair_deferred';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON =
  'selected_snapshot_source_timeout';
const FORCED_REPAIR_SNAPSHOT_TIMEOUT_REASON =
  'forced_repair_snapshot_timeout';
const AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_TIMEOUT_REASON =
  'authoritative_control_snapshot_query_timeout';
const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY =
  'authoritative_control_snapshot_query_pressure';
const PRIORITY_RECOVERY_BLOCKED_REASON = 'priority_recovery_progress_blocked';
const PRIORITY_RECOVERY_RETRYABLE_REASON =
  'priority_recovery_event_driven_wait';
const PRIORITY_RECOVERY_SATISFIED_REASON = 'priority_recovery_satisfied';
const READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_REASON =
  'readiness_inherited_active_gate_no_progress';
const READINESS_SUPPORT_PATH_INHERITED_ACTIVE_GATE_NO_PROGRESS =
  'inherited_active_gate_no_progress';
const ARTIFACT_PRIORITY_RECOVERY_OWNER = 'artifact_priority_owner';
const ARTIFACT_PRIORITY_RECOVERY_BOUNDARY = 'artifact_priority_boundary';
const OWNER_STARTUP_ACTIVE_GATE = 'startup_active_gate_owner';
const BOUNDARY_PUBLICATION_CONVERGENCE = 'publication_convergence';
const PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN = 'event_driven';
const PRIORITY_RECOVERY_ACTION_WAIT_FOR_OPERATION_PROGRESS =
  'wait_for_operation_progress';
const PRIORITY_RECOVERY_ACTUATION_DISPATCHED_WAITING_PROGRESS =
  'dispatched_waiting_progress';
const TOPOLOGY_OPERATOR_TEST_ID = 'topology-operator-test';
const TOPOLOGY_OPERATOR_TEST_KIND = 'replace';
const TOPOLOGY_OPERATOR_TEST_TARGET_NODE_ID = 'node-target';
const TOPOLOGY_OPERATOR_TEST_CURRENT_STEP_ID = 'dispatch_pending';
const TOPOLOGY_OPERATOR_TEST_CURRENT_STEP_STATE = 'planned';
const TOPOLOGY_OPERATOR_TEST_DEADLINE_MS = 1234;
const TOPOLOGY_OPERATOR_TEST_LAST_OBSERVED_AT_MS = 1000;
const PRIORITY_RECOVERY_PARTITION_WITNESS_EVIDENCE_PATH =
  'failureBundle.publicationConvergence.priorityRecoveryPartitionWitnesses';
const PRIORITY_RECOVERY_PROGRESS_CLASS_EVIDENCE_PATH =
  'failureBundle.publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses';
const CONTROL_PLANE_SNAPSHOT_COVERAGE_EVIDENCE_PATH =
  'failureBundle.controlPlane.activeGateSnapshotCoverage';
const PUBLICATION_ACK_FRONTIER_PENDING_NODE_ID =
  '11601fe0-72d6-5853-8590-ec2881853e72';
const ACTIVE_GATE_COVERAGE_SELECTED_NODE_ID =
  '8be8d30f-4499-5eed-865c-71b4d529a67a';
const PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS = Object.freeze([
  '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  '8be8d30f-4499-5eed-865c-71b4d529a67a',
  'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
]);
const SNAPSHOT_COVERAGE_TWO_OF_FIVE_BLOCKER = 'snapshot_coverage=2/5';
const CURRENT_ARTIFACT_MISSING_PUBLISHED_COUNT = 4;
const CURRENT_ARTIFACT_PUBLISHED_ACTIVE_COUNT = 1;
const SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED = 'repair_deferred';
const SELECTED_SNAPSHOT_OBSERVATION_STATE_STALE = 'stale_usable';
const SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_PENDING = 'pending';
const SELECTED_SNAPSHOT_OBSERVATION_REFRESH_IDLE = 'idle';
const SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_WAIT = 'wait';
const SELECTED_SNAPSHOT_OBSERVATION_REASON_COVERAGE_GAP =
  'discovery_node_coverage_gap';
const ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_SOURCE =
  '11601fe0-72d6-5853-8590-ec2881853e72';
const ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_TIMEOUT_MS = 3349;
const ACTIVE_GATE_TIMEOUT_AUTHORITATIVE_QUERY_TIMEOUT_MS = 1500;
const ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_SOURCE +
  ' on lane snapshot after ' +
  String(ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_TIMEOUT_MS) +
  'ms';
const ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_ERROR =
  ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR +
  '; forced repair snapshot failed: Admin API query failed for node ' +
  ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_SOURCE +
  ' on lane snapshot: Authoritative control snapshot repair failed: ' +
  'nodes:Query timeout after ' +
  String(ACTIVE_GATE_TIMEOUT_AUTHORITATIVE_QUERY_TIMEOUT_MS) +
  'ms';
const ARG_HANDOFF_PROBE = '--handoff-probe';
const ANALYZER_SCRIPT_PATH = 'scripts/analyze-topology-convergence.js';
const ACTIVE_GATE_TIMEOUT_BLOCKERS = Object.freeze([
  'inactive_nodes=1',
  'snapshot_coverage=0/5',
  'snapshot_error',
]);

function buildFixtureFailureBundle() {
  return {
    scenario: FIXTURE_SCENARIO,
    summary: {
      dominantReason: FIXTURE_DOMINANT_REASON,
      failureClass: FIXTURE_FAILURE_CLASS,
      readinessFailure: {
        mode: FIXTURE_READINESS_MODE,
        classCode: FIXTURE_READINESS_CLASS,
        recoverability: FIXTURE_READINESS_RECOVERABILITY,
        cause: FIXTURE_READINESS_CAUSE,
        source: FIXTURE_READINESS_SOURCE,
      },
      topReasons: [
        {
          reason: FIXTURE_TOP_REASON,
          count: FIXTURE_TOP_REASON_COUNT,
        },
      ],
    },
    publicationConvergence: {
      publicationEpoch: FIXTURE_PUBLICATION_EPOCH,
      publicationStatus: PUBLICATION_STATUS_PUBLISHED,
      pendingAckCount: ZERO_COUNT,
      blockedNodeCount: ZERO_COUNT,
      missingPublishedCount: ZERO_COUNT,
      recoveryProtocolState: RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
      prioritySpreadPending: true,
      activeGate: {
        state: ACTIVE_GATE_STATE_TIMED_OUT,
        ready: false,
        attempts: FIXTURE_ATTEMPTS,
        elapsedMs: FIXTURE_ELAPSED_MS,
        progress: {
          expectedNodeCount: FIXTURE_EXPECTED_NODE_COUNT,
          snapshotCoverageNodeCount: FIXTURE_SNAPSHOT_COVERAGE_COUNT,
          snapshotCoverageComplete: false,
          prioritySpreadGap: FIXTURE_PRIORITY_GAP,
          priorityBlockedPartitionCount: ONE_COUNT,
          priorityRecoveryProgressClasses: {
            unresolvedSemanticStateIds: [FIXTURE_PRIORITY_SEMANTIC_STATE],
            blockedPartitionIds: [FIXTURE_PARTITION_ID],
          },
          blockers: ['snapshot_coverage=2/5'],
        },
      },
    },
  };
}

function buildHealthyFixtureFailureBundle() {
  const fixture = buildFixtureFailureBundle();

  return {
    ...fixture,
    publicationConvergence: {
      ...fixture.publicationConvergence,
      activeGate: {
        ...fixture.publicationConvergence.activeGate,
        state: ACTIVE_GATE_STATE_READY,
        ready: true,
        progress: {
          ...fixture.publicationConvergence.activeGate.progress,
          snapshotCoverageNodeCount: FIXTURE_EXPECTED_NODE_COUNT,
          snapshotCoverageComplete: true,
          prioritySpreadGap: ZERO_COUNT,
          priorityBlockedPartitionCount: ZERO_COUNT,
          priorityRecoveryProgressClasses: {
            unresolvedSemanticStateIds: [],
            blockedPartitionIds: [],
          },
          blockers: [],
        },
      },
    },
  };
}

function buildAckPendingPublicationFixtureFailureBundle() {
  const fixture = buildHealthyFixtureFailureBundle();

  return {
    ...fixture,
    publicationConvergence: {
      ...fixture.publicationConvergence,
      publicationStatus: PUBLICATION_ACK_PENDING_STATUS,
      pendingAckCount: ONE_COUNT,
      activeGate: {
        ...fixture.publicationConvergence.activeGate,
        ready: false,
      },
    },
  };
}

function findEdge(edges, edgeId) {
  return edges.find((edge) => edge.id === edgeId);
}

function runHandoffProbe(artifactPath) {
  const output = execFileSync(process.execPath, [
    ANALYZER_SCRIPT_PATH,
    artifactPath,
    ARG_HANDOFF_PROBE,
  ], {
    encoding: JSON_ENCODING_UTF8,
  });
  return JSON.parse(output);
}

function selectArtifactSnapshotProgress(artifactPath, scenarioName) {
  const report = JSON.parse(
    fs.readFileSync(artifactPath, JSON_ENCODING_UTF8),
  );
  const scenario = Array.isArray(report.scenarios) ?
    report.scenarios.find((entry) => entry.scenario === scenarioName) ||
      report.scenarios[0] :
    report;
  const publicationConvergence = scenario?.publicationConvergence ||
    report.publicationConvergence ||
    {};
  return (
    publicationConvergence.activeGateProgress ||
    publicationConvergence.activeGate?.progress
  );
}

function hasAlternativeSnapshotWitness(progress) {
  const perNodePublicationDisagreementSet =
    progress?.perNodePublicationDisagreementSet;
  if (!perNodePublicationDisagreementSet || typeof perNodePublicationDisagreementSet !== 'object') {
    return 'unknown';
  }
  return Object.keys(perNodePublicationDisagreementSet).some(
    (snapshotNodeId) =>
      snapshotNodeId !== progress?.selectedSnapshotNodeId,
  );
}

function assertNoNullOrUndefined(value) {
  assert.notEqual(value, NULL_VALUE);
  assert.notEqual(value, UNDEFINED_VALUE);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoNullOrUndefined(item);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const childValue of Object.values(value)) {
      assertNoNullOrUndefined(childValue);
    }
  }
}

describe('TopologyConvergenceGraph', () => {
  it('ranks the minimal unsatisfied frontier and projects the next frontier', () => {
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: buildFixtureFailureBundle(),
    });

    assert.equal(graph.scenario, FIXTURE_SCENARIO);
    assert.equal(graph.summary.firstFrontierEdgeId, EDGE_PRIORITY_RECOVERY);
    assert.equal(findEdge(graph.edges, EDGE_PRIORITY_RECOVERY).state, EDGE_STATE.BLOCKED);
    assert.equal(
      graph.summary.firstFrontierReason,
      PRIORITY_RECOVERY_BLOCKED_REASON,
    );
    assert.equal(findEdge(graph.edges, EDGE_SNAPSHOT_COVERAGE).state, EDGE_STATE.BLOCKED);
    assert.equal(findEdge(graph.edges, EDGE_READINESS).state, EDGE_STATE.TERMINAL_FAILED);
    assert.deepEqual(
      graph.frontier.map((edge) => edge.id),
      [EDGE_PRIORITY_RECOVERY],
    );
    assert.deepEqual(
      graph.nextExpectedFrontier.map((edge) => edge.id),
      [EDGE_SNAPSHOT_COVERAGE],
    );
    assertNoNullOrUndefined(graph);
  });

  it('accepts direct failure-bundle input and records provenance', () => {
    const graph = buildTopologyConvergenceGraph(buildFixtureFailureBundle());

    assert.equal(graph.scenario, FIXTURE_SCENARIO);
    assert.equal(graph.summary.edgeCount, EXPECTED_EDGE_COUNT);
    assert.equal(graph.frontier[ZERO_COUNT].owner, OWNER_OPERATION_WORKFLOW);
    assert.deepEqual(graph.generatedFrom, {
      failureBundle: SOURCE_PATH_FAILURE_BUNDLE,
      triageSummary: SOURCE_PATH_ABSENT,
      report: SOURCE_PATH_ABSENT,
    });
  });

  it('uses control-plane snapshot coverage as active-gate progress evidence', () => {
    const fixture = buildHealthyFixtureFailureBundle();
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: {
        ...fixture,
        publicationConvergence: {
          ...fixture.publicationConvergence,
          activeGate: {},
        },
        controlPlane: {
          activeGateSnapshotCoverage: {
            completeCoverage: true,
            expectedNodeCount: FIXTURE_EXPECTED_NODE_COUNT,
            bestCoverageNodeCount: FIXTURE_EXPECTED_NODE_COUNT,
            selectedSnapshotNodeId: ACTIVE_GATE_COVERAGE_SELECTED_NODE_ID,
            selectedSnapshotObservationMode:
              SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED,
            selectedSnapshotObservationState:
              SELECTED_SNAPSHOT_OBSERVATION_STATE_STALE,
            selectedSnapshotObservationContractState:
              SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_PENDING,
            selectedSnapshotObservationRefreshState:
              SELECTED_SNAPSHOT_OBSERVATION_REFRESH_IDLE,
            selectedSnapshotObservationNextAction:
              SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_WAIT,
            selectedSnapshotObservationReasonCodes: [
              SELECTED_SNAPSHOT_OBSERVATION_REASON_COVERAGE_GAP,
            ],
            selectedSnapshotRepairDeferred: true,
          },
        },
      },
    });
    const snapshotEdge = findEdge(graph.edges, EDGE_SNAPSHOT_COVERAGE);

    assert.equal(snapshotEdge.state, EDGE_STATE.SATISFIED);
    assert.equal(
      snapshotEdge.evidencePath,
      CONTROL_PLANE_SNAPSHOT_COVERAGE_EVIDENCE_PATH,
    );
    assert.equal(snapshotEdge.source.snapshotCoverageComplete, 'true');
    assert.equal(
      snapshotEdge.source.snapshotCoverageNodeCount,
      FIXTURE_EXPECTED_NODE_COUNT,
    );
    assert.deepEqual(snapshotEdge.reasons, ['active_gate_ready']);
    assert.notEqual(graph.summary.firstFrontierEdgeId, EDGE_SNAPSHOT_COVERAGE);
    assertNoNullOrUndefined(graph);
  });

  it('normalizes active-gate no-progress readiness evidence as inherited support evidence', () => {
    const report = JSON.parse(
      fs.readFileSync(REPORT_ARTIFACT_PATH_PUBLICATION_LAG, JSON_ENCODING_UTF8),
    );
    const graph = buildTopologyConvergenceGraph(report);
    const readinessEdge = findEdge(graph.edges, EDGE_READINESS);

    assert.equal(readinessEdge.state, EDGE_STATE.DEFERRED);
    assert.equal(readinessEdge.source.recoverability, FIXTURE_READINESS_RECOVERABILITY);
    assert.equal(
      readinessEdge.source.supportPath,
      READINESS_SUPPORT_PATH_INHERITED_ACTIVE_GATE_NO_PROGRESS,
    );
    assert.deepEqual(readinessEdge.reasons, [
      READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_REASON,
    ]);
    assertNoNullOrUndefined(graph);
  });

  it('contracts current zero-attempt startup readiness no-progress to inherited support evidence', () => {
    const report = JSON.parse(
      fs.readFileSync(REPORT_ARTIFACT_PATH_CURRENT_READINESS_SUPPORT, JSON_ENCODING_UTF8),
    );
    const graph = buildTopologyConvergenceGraph(report);
    const readinessEdge = findEdge(graph.edges, EDGE_READINESS);

    assert.equal(readinessEdge.state, EDGE_STATE.DEFERRED);
    assert.equal(
      readinessEdge.source.supportPath,
      READINESS_SUPPORT_PATH_INHERITED_ACTIVE_GATE_NO_PROGRESS,
    );
    assert.deepEqual(readinessEdge.reasons, [
      READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_REASON,
    ]);
    assertNoNullOrUndefined(graph);
  });

  it('contracts stalled active-gate no-progress readiness to inherited support evidence', () => {
    const report = JSON.parse(
      fs.readFileSync(
        REPORT_ARTIFACT_PATH_ACTIVE_GATE_OWNER_TRUTH,
        JSON_ENCODING_UTF8,
      ),
    );
    const graph = buildTopologyConvergenceGraph(report);
    const readinessEdge = findEdge(graph.edges, EDGE_READINESS);

    assert.equal(readinessEdge.state, EDGE_STATE.DEFERRED);
    assert.equal(
      readinessEdge.source.supportPath,
      READINESS_SUPPORT_PATH_INHERITED_ACTIVE_GATE_NO_PROGRESS,
    );
    assert.deepEqual(readinessEdge.reasons, [
      READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_REASON,
    ]);
    assertNoNullOrUndefined(graph);
  });

  it('contracts selected snapshot timeout to inherited active-gate support evidence', () => {
    const failureBundle = buildFixtureFailureBundle();
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: {
        ...failureBundle,
        summary: {
          ...failureBundle.summary,
          readinessFailure: {
            ...failureBundle.summary.readinessFailure,
            classCode: FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CLASS,
            terminalReason: FIXTURE_READINESS_TERMINAL_REASON,
            cause: FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CAUSE,
            source: FIXTURE_READINESS_SELECTED_SNAPSHOT_SOURCE,
          },
        },
      },
    });
    const readinessEdge = findEdge(graph.edges, EDGE_READINESS);

    assert.equal(readinessEdge.state, EDGE_STATE.DEFERRED);
    assert.equal(
      readinessEdge.source.supportPath,
      READINESS_SUPPORT_PATH_INHERITED_ACTIVE_GATE_NO_PROGRESS,
    );
    assert.deepEqual(readinessEdge.reasons, [
      READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_REASON,
    ]);
    assertNoNullOrUndefined(graph);
  });

  it('presents publication ACK debt as owner reason before raw status text', () => {
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: buildAckPendingPublicationFixtureFailureBundle(),
    });
    const presentation = buildTopologyConvergenceOwnerPresentation(graph);
    const dominantWitness = selectTopologyConvergenceDominantWitness(
      presentation,
    );

    assert.equal(
      graph.summary.firstFrontierEdgeId,
      EDGE_PUBLICATION_ACK_CONVERGENCE,
    );
    assert.equal(graph.summary.firstFrontierOwner, OWNER_TOPOLOGY_PUBLICATION);
    assert.equal(dominantWitness.edgeId, EDGE_PUBLICATION_ACK_CONVERGENCE);
    assert.equal(dominantWitness.owner, OWNER_TOPOLOGY_PUBLICATION);
    assert.equal(dominantWitness.state, EDGE_STATE.BLOCKED);
    assert.equal(dominantWitness.dominantReason, PENDING_ACKS_PRESENT_REASON);
    assert.deepEqual(
      dominantWitness.reasons,
      [PUBLICATION_PENDING_REASON, PENDING_ACKS_PRESENT_REASON],
    );
    assert.equal(
      dominantWitness.source.publicationStatus,
      PUBLICATION_ACK_PENDING_STATUS,
    );
    assert.equal(dominantWitness.source.pendingAckCount, ONE_COUNT);
    assertNoNullOrUndefined(graph);
  });

  it('keeps report-derived publication ACK debt ahead of startup and missing-publication evidence',
    () => {
      const artifact = JSON.parse(
        fs.readFileSync(
          REPORT_ARTIFACT_PATH_PUBLICATION_ACK_FRONTIER,
          JSON_ENCODING_UTF8,
        ),
      );
      const graph = buildTopologyConvergenceGraph(artifact);
      const presentation = buildTopologyConvergenceOwnerPresentation(graph);
      const dominantWitness = selectTopologyConvergenceDominantWitness(
        presentation,
      );

      assert.equal(
        graph.summary.firstFrontierEdgeId,
        EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      assert.equal(graph.summary.firstFrontierOwner, OWNER_TOPOLOGY_PUBLICATION);
      assert.equal(dominantWitness.edgeId, EDGE_PUBLICATION_ACK_CONVERGENCE);
      assert.equal(dominantWitness.owner, OWNER_TOPOLOGY_PUBLICATION);
      assert.equal(dominantWitness.state, EDGE_STATE.BLOCKED);
      assert.equal(dominantWitness.dominantReason, PENDING_ACKS_PRESENT_REASON);
      assert.deepEqual(
        dominantWitness.reasons,
        [PUBLICATION_PENDING_REASON, PENDING_ACKS_PRESENT_REASON],
      );
      assert.equal(
        dominantWitness.source.publicationStatus,
        PUBLICATION_ACK_PENDING_STATUS,
      );
      assert.deepEqual(
        dominantWitness.source.pendingAckNodeIds,
        [PUBLICATION_ACK_FRONTIER_PENDING_NODE_ID],
      );
      assert.deepEqual(
        dominantWitness.source.missingPublishedNodeIds,
        [...PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS],
      );
      assert.equal(dominantWitness.source.pendingAckCount, ONE_COUNT);
      assert.equal(
        dominantWitness.source.missingPublishedCount,
        PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS.length,
      );
      assertNoNullOrUndefined(graph);
    });

  it('keeps count-only publication ACK debt ahead of missing-publication evidence',
    () => {
      const artifact = JSON.parse(
        fs.readFileSync(
          REPORT_ARTIFACT_PATH_PUBLICATION_COUNT_ONLY_ACK,
          JSON_ENCODING_UTF8,
        ),
      );
      const graph = buildTopologyConvergenceGraph(artifact);
      const presentation = buildTopologyConvergenceOwnerPresentation(graph);
      const dominantWitness = selectTopologyConvergenceDominantWitness(
        presentation,
      );

      assert.equal(
        graph.summary.firstFrontierEdgeId,
        EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      assert.equal(graph.summary.firstFrontierOwner, OWNER_TOPOLOGY_PUBLICATION);
      assert.equal(dominantWitness.edgeId, EDGE_PUBLICATION_ACK_CONVERGENCE);
      assert.equal(dominantWitness.owner, OWNER_TOPOLOGY_PUBLICATION);
      assert.equal(dominantWitness.state, EDGE_STATE.BLOCKED);
      assert.equal(dominantWitness.dominantReason, PENDING_ACKS_PRESENT_REASON);
      assert.deepEqual(
        dominantWitness.reasons,
        [PUBLICATION_PENDING_REASON, PENDING_ACKS_PRESENT_REASON],
      );
      assert.deepEqual(dominantWitness.source.pendingAckNodeIds, []);
      assert.equal(dominantWitness.source.pendingAckCount, ONE_COUNT);
      assert.equal(
        dominantWitness.source.missingPublishedCount,
        PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS.length,
      );
      assertNoNullOrUndefined(graph);
    });

  it('moves the frontier to snapshot coverage when publication ACK debt is reduced',
    () => {
      const artifact = JSON.parse(
        fs.readFileSync(
          REPORT_ARTIFACT_PATH_PUBLICATION_ACK_REDUCED,
          JSON_ENCODING_UTF8,
        ),
      );
      const graph = buildTopologyConvergenceGraph(artifact);
      const publicationWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      const presentation = buildTopologyConvergenceOwnerPresentation(graph);
      const dominantWitness = selectTopologyConvergenceDominantWitness(
        presentation,
      );

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_STARTUP_ACTIVE_GATE);
      assert.equal(dominantWitness.edgeId, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(dominantWitness.owner, OWNER_STARTUP_ACTIVE_GATE);
      assert.equal(dominantWitness.state, EDGE_STATE.BLOCKED);
      assert.equal(
        dominantWitness.dominantReason,
        ACTIVE_GATE_TIMED_OUT_REASON,
      );
      assert.deepEqual(
        dominantWitness.reasons,
        [
          ACTIVE_GATE_TIMED_OUT_REASON,
          SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        ],
      );
      assert.equal(publicationWitness.state, EDGE_STATE.SATISFIED);
      assert.deepEqual(publicationWitness.reasons, [
        PUBLICATION_PUBLISHED_REASON,
      ]);
      assert.equal(
        publicationWitness.source.publicationStatus,
        PUBLICATION_UNKNOWN_STATUS,
      );
      assert.equal(publicationWitness.source.pendingAckCount, ZERO_COUNT);
      assert.equal(publicationWitness.source.missingPublishedCount, ZERO_COUNT);
      assertNoNullOrUndefined(graph);
    });

  it('separates selected snapshot timeout causes from inherited readiness support',
    () => {
      const graph = buildTopologyConvergenceGraph({
        report: {
          scenarios: [
            {
              scenario: SCENARIO_ROLLING_RESTART,
              publicationConvergence: {
                publicationStatus: PUBLICATION_UNKNOWN_STATUS,
                pendingAckCount: ZERO_COUNT,
                blockedNodeCount: ZERO_COUNT,
                missingPublishedCount: ZERO_COUNT,
                activeGate: {
                  mode: FIXTURE_READINESS_MODE,
                  state: ACTIVE_GATE_STATE_TIMED_OUT,
                  ready: false,
                  progress: {
                    expectedNodeCount: FIXTURE_EXPECTED_NODE_COUNT,
                    snapshotCoverageNodeCount: ZERO_COUNT,
                    snapshotCoverageComplete: false,
                    selectedSnapshotNodeId:
                      ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_SOURCE,
                    selectedSnapshotTimeoutMs:
                      ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_TIMEOUT_MS,
                    selectedSnapshotError:
                      ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_ERROR,
                    readinessDelay: {
                      timedOut: true,
                      cause: FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CAUSE,
                      source: FIXTURE_READINESS_SELECTED_SNAPSHOT_SOURCE,
                      recoverability: FIXTURE_READINESS_RECOVERABILITY,
                      error: ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_ERROR,
                    },
                    priorityRecoveryProgressClasses: {
                      unresolvedSemanticStateIds: [],
                      blockedPartitionIds: [],
                    },
                    blockers: [...ACTIVE_GATE_TIMEOUT_BLOCKERS],
                  },
                },
              },
              readinessFailure: {
                mode: FIXTURE_READINESS_MODE,
                classCode: FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CLASS,
                recoverability: FIXTURE_READINESS_RECOVERABILITY,
                terminalReason: FIXTURE_READINESS_TERMINAL_REASON,
                cause: FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CAUSE,
                source: FIXTURE_READINESS_SELECTED_SNAPSHOT_SOURCE,
              },
            },
          ],
        },
      });
      const activeGateWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_SNAPSHOT_COVERAGE,
      );
      const readinessWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_READINESS,
      );

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_STARTUP_ACTIVE_GATE);
      assert.deepEqual(activeGateWitness.reasons, [
        ACTIVE_GATE_TIMED_OUT_REASON,
        SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        FORCED_REPAIR_SNAPSHOT_TIMEOUT_REASON,
        AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_TIMEOUT_REASON,
      ]);
      assert.equal(
        activeGateWitness.source.selectedSnapshotNodeId,
        ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_SOURCE,
      );
      assert.equal(
        activeGateWitness.source.selectedSnapshotTimeoutMs,
        ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_TIMEOUT_MS,
      );
      assert.equal(
        activeGateWitness.source.selectedSnapshotSourceCause,
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
      );
      assert.equal(
        activeGateWitness.source.forcedRepairSnapshotCause,
        FORCED_REPAIR_SNAPSHOT_TIMEOUT_REASON,
      );
      assert.equal(
        activeGateWitness.source.authoritativeControlSnapshotQueryCause,
        AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_TIMEOUT_REASON,
      );
      assert.equal(
        activeGateWitness.source.activeGateSnapshotOwnerEdge,
        ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
      );
      assert.equal(readinessWitness.state, EDGE_STATE.DEFERRED);
      assert.deepEqual(readinessWitness.reasons, [
        READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_REASON,
      ]);
      assert.equal(
        readinessWitness.source.supportPath,
        READINESS_SUPPORT_PATH_INHERITED_ACTIVE_GATE_NO_PROGRESS,
      );
      assertNoNullOrUndefined(graph);
    });

  it('contracts recoverable selected snapshot timeout to inherited active-gate support',
    () => {
      const graph = buildTopologyConvergenceGraph({
        report: {
          scenarios: [
            {
              scenario: SCENARIO_ROLLING_RESTART,
              publicationConvergence: {
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckCount: ZERO_COUNT,
                blockedNodeCount: ZERO_COUNT,
                missingPublishedCount: ZERO_COUNT,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                activeGate: {
                  mode: FIXTURE_READINESS_MODE,
                  state: ACTIVE_GATE_STATE_STALLED,
                  ready: false,
                  progress: {
                    expectedNodeCount: FIXTURE_EXPECTED_NODE_COUNT,
                    snapshotCoverageNodeCount: ZERO_COUNT,
                    snapshotCoverageComplete: false,
                    selectedSnapshotNodeId:
                      ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_SOURCE,
                    selectedSnapshotTimeoutMs:
                      ACTIVE_GATE_TIMEOUT_SELECTED_SNAPSHOT_TIMEOUT_MS,
                    selectedSnapshotError:
                      ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR,
                    readinessDelay: {
                      timedOut: true,
                      cause: FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CAUSE,
                      source: FIXTURE_READINESS_SELECTED_SNAPSHOT_SOURCE,
                      recoverability:
                        FIXTURE_READINESS_RECOVERABILITY_RECOVERABLE,
                      error: ACTIVE_GATE_SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR,
                    },
                    priorityRecoveryProgressClasses: {
                      unresolvedSemanticStateIds: [],
                      blockedPartitionIds: [],
                    },
                    blockers: [...ACTIVE_GATE_TIMEOUT_BLOCKERS],
                  },
                },
              },
              readinessFailure: {
                mode: FIXTURE_READINESS_MODE,
                classCode: FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CLASS,
                recoverability: FIXTURE_READINESS_RECOVERABILITY_RECOVERABLE,
                cause: FIXTURE_READINESS_SNAPSHOT_TIMEOUT_CAUSE,
                source: FIXTURE_READINESS_SELECTED_SNAPSHOT_SOURCE,
              },
            },
          ],
        },
      });
      const activeGateWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_SNAPSHOT_COVERAGE,
      );
      const readinessWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_READINESS,
      );

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_STARTUP_ACTIVE_GATE);
      assert.equal(activeGateWitness.state, EDGE_STATE.DEFERRED);
      assert.deepEqual(activeGateWitness.reasons, [
        SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
      ]);
      assert.equal(readinessWitness.state, EDGE_STATE.DEFERRED);
      assert.deepEqual(readinessWitness.reasons, [
        READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_REASON,
      ]);
      assert.equal(
        readinessWitness.source.supportPath,
        READINESS_SUPPORT_PATH_INHERITED_ACTIVE_GATE_NO_PROGRESS,
      );
      assertNoNullOrUndefined(graph);
    });

  it('surfaces steady published missing nodes as publication owner evidence',
    () => {
      const fixture = buildHealthyFixtureFailureBundle();
      const graph = buildTopologyConvergenceGraphFromArtifacts({
        failureBundle: {
          ...fixture,
          publicationConvergence: {
            ...fixture.publicationConvergence,
            publicationPending: true,
            recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
            prioritySpreadPending: false,
            missingPublishedCount:
              PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS.length,
            missingPublishedNodeIds: [
              ...PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS,
            ],
            activeGate: {
              ...fixture.publicationConvergence.activeGate,
              state: ACTIVE_GATE_STATE_TIMED_OUT,
              ready: false,
              progress: {
                ...fixture.publicationConvergence.activeGate.progress,
                snapshotCoverageNodeCount: FIXTURE_SNAPSHOT_COVERAGE_COUNT,
                snapshotCoverageComplete: false,
                blockers: [SNAPSHOT_COVERAGE_TWO_OF_FIVE_BLOCKER],
              },
            },
          },
        },
      });
      const publicationWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      const presentation = buildTopologyConvergenceOwnerPresentation(graph);
      const dominantWitness = selectTopologyConvergenceDominantWitness(
        presentation,
      );

      assert.equal(
        graph.summary.firstFrontierEdgeId,
        EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      assert.equal(graph.summary.firstFrontierOwner, OWNER_TOPOLOGY_PUBLICATION);
      assert.equal(dominantWitness.edgeId, EDGE_PUBLICATION_ACK_CONVERGENCE);
      assert.equal(dominantWitness.owner, OWNER_TOPOLOGY_PUBLICATION);
      assert.equal(
        dominantWitness.dominantReason,
        MISSING_PUBLISHED_NODES_PRESENT_REASON,
      );
      assert.equal(publicationWitness.state, EDGE_STATE.DEFERRED);
      assert.deepEqual(publicationWitness.reasons, [
        PUBLICATION_PUBLISHED_REASON,
        MISSING_PUBLISHED_NODES_PRESENT_REASON,
      ]);
      assert.equal(
        publicationWitness.source.recoveryProtocolState,
        RECOVERY_PROTOCOL_STEADY_PUBLISHED,
      );
      assert.equal(
        publicationWitness.source.missingPublishedCount,
        PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS.length,
      );
      assertNoNullOrUndefined(graph);
    });

  it('moves consumer-lag missing published evidence to snapshot coverage',
    () => {
      const fixture = buildHealthyFixtureFailureBundle();
      const graph = buildTopologyConvergenceGraphFromArtifacts({
        failureBundle: {
          ...fixture,
          publicationConvergence: {
            ...fixture.publicationConvergence,
            publicationPending: true,
            recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
            prioritySpreadPending: false,
            missingPublishedCount:
              PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS.length,
            missingPublishedNodeIds: [
              ...PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS,
            ],
            publicationOwnerStream: {
              semanticOwner: PUBLICATION_OWNER_SEMANTIC_OWNER,
              revision: {
                state: PUBLICATION_OWNER_REVISION_STATE_CURRENT,
              },
              ackState: PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED,
              freshnessFence: PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG,
              recoveryOutcome:
                PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER,
              streamOutcome: PUBLICATION_OWNER_STREAM_OUTCOME_STALE,
            },
            activeGate: {
              ...fixture.publicationConvergence.activeGate,
              state: ACTIVE_GATE_STATE_TIMED_OUT,
              ready: false,
              progress: {
                ...fixture.publicationConvergence.activeGate.progress,
                snapshotCoverageNodeCount: FIXTURE_SNAPSHOT_COVERAGE_COUNT,
                snapshotCoverageComplete: false,
                selectedSnapshotObservationMode:
                  SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED,
                selectedSnapshotObservationState:
                  SELECTED_SNAPSHOT_OBSERVATION_STATE_STALE,
                selectedSnapshotObservationContractState:
                  SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_PENDING,
                selectedSnapshotObservationRefreshState:
                  SELECTED_SNAPSHOT_OBSERVATION_REFRESH_IDLE,
                selectedSnapshotObservationNextAction:
                  SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_WAIT,
                selectedSnapshotObservationReasonCodes: [
                  SELECTED_SNAPSHOT_OBSERVATION_REASON_COVERAGE_GAP,
                ],
                selectedSnapshotRepairDeferred: true,
                blockers: [SNAPSHOT_COVERAGE_TWO_OF_FIVE_BLOCKER],
              },
            },
          },
        },
      });
      const publicationWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      const presentation = buildTopologyConvergenceOwnerPresentation(graph);
      const dominantWitness = selectTopologyConvergenceDominantWitness(
        presentation,
      );

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_STARTUP_ACTIVE_GATE);
      assert.equal(dominantWitness.edgeId, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(dominantWitness.owner, OWNER_STARTUP_ACTIVE_GATE);
      assert.equal(publicationWitness.state, EDGE_STATE.SATISFIED);
      assert.deepEqual(dominantWitness.reasons, [
        ACTIVE_GATE_TIMED_OUT_REASON,
        SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        SNAPSHOT_REPAIR_DEFERRED_REASON,
      ]);
      assert.equal(
        dominantWitness.source.selectedSnapshotObservationMode,
        SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED,
      );
      assert.equal(
        dominantWitness.source.selectedSnapshotObservationReasonCodes,
        SELECTED_SNAPSHOT_OBSERVATION_REASON_COVERAGE_GAP,
      );
      assert.equal(
        dominantWitness.source.selectedSnapshotRepairDeferred,
        'true',
      );
      assert.deepEqual(publicationWitness.reasons, [
        PUBLICATION_PUBLISHED_REASON,
      ]);
      assert.equal(
        publicationWitness.source.publicationOwnerFreshnessFence,
        PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG,
      );
      assert.equal(
        publicationWitness.source.publicationOwnerStreamOutcome,
        PUBLICATION_OWNER_STREAM_OUTCOME_STALE,
      );
      assert.equal(
        publicationWitness.source.missingPublishedCount,
        PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS.length,
      );
      assertNoNullOrUndefined(graph);
    });

  it('surfaces selected snapshot admin readiness and alternative witness state in handoff probe',
    () => {
      const output = runHandoffProbe(REPORT_ARTIFACT_PATH_NETWORK_PARTITION);
      const progress = selectArtifactSnapshotProgress(
        REPORT_ARTIFACT_PATH_NETWORK_PARTITION,
        output.scenario,
      );

      assert.equal(output.schemaVersion, 'topology-publication-active-gate-handoff-probe-v1');
      assert.equal(output.consumer.edge, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(
        output.consumer.source.selectedSnapshotAdminReady,
        progress?.selectedSnapshotAdminReady ?? 'unknown',
      );
      assert.equal(
        output.consumer.source.selectedSnapshotReachableBy,
        progress?.selectedSnapshotReachableBy || 'unknown',
      );
      assert.equal(
        output.consumer.source.alternativeSnapshotWitnessAvailable,
        hasAlternativeSnapshotWitness(progress),
      );
      assertNoNullOrUndefined(output.consumer.source);
    });

  it('projects current steady-published missing active nodes under the publication owner',
    () => {
      const artifact = JSON.parse(
        fs.readFileSync(
          REPORT_ARTIFACT_PATH_PUBLICATION_PROJECTION_RECONCILIATION,
          JSON_ENCODING_UTF8,
        ),
      );
      const graph = buildTopologyConvergenceGraph(artifact);
      const publicationWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      const presentation = buildTopologyConvergenceOwnerPresentation(graph);
      const dominantWitness = selectTopologyConvergenceDominantWitness(
        presentation,
      );

      assert.equal(
        graph.summary.firstFrontierEdgeId,
        EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      assert.equal(graph.summary.firstFrontierOwner, OWNER_TOPOLOGY_PUBLICATION);
      assert.equal(dominantWitness.edgeId, EDGE_PUBLICATION_ACK_CONVERGENCE);
      assert.equal(dominantWitness.owner, OWNER_TOPOLOGY_PUBLICATION);
      assert.equal(dominantWitness.boundary, BOUNDARY_PUBLICATION_CONVERGENCE);
      assert.equal(dominantWitness.state, EDGE_STATE.DEFERRED);
      assert.equal(
        dominantWitness.dominantReason,
        MISSING_PUBLISHED_NODES_PRESENT_REASON,
      );
      assert.deepEqual(dominantWitness.reasons, [
        PUBLICATION_PUBLISHED_REASON,
        MISSING_PUBLISHED_NODES_PRESENT_REASON,
      ]);
      assert.equal(
        publicationWitness.source.publicationStatus,
        PUBLICATION_STATUS_PUBLISHED,
      );
      assert.equal(
        publicationWitness.source.recoveryProtocolState,
        RECOVERY_PROTOCOL_STEADY_PUBLISHED,
      );
      assert.equal(
        publicationWitness.source.publishedActiveNodeIds.length,
        CURRENT_ARTIFACT_PUBLISHED_ACTIVE_COUNT,
      );
      assert.equal(
        publicationWitness.source.missingPublishedNodeIds.length,
        CURRENT_ARTIFACT_MISSING_PUBLISHED_COUNT,
      );
      assert.equal(
        publicationWitness.source.missingPublishedCount,
        CURRENT_ARTIFACT_MISSING_PUBLISHED_COUNT,
      );
      assertNoNullOrUndefined(graph);
    });

  it('keeps priority-spread missing publication subordinate to priority recovery',
    () => {
      const fixture = buildFixtureFailureBundle();
      const graph = buildTopologyConvergenceGraphFromArtifacts({
        failureBundle: {
          ...fixture,
          publicationConvergence: {
            ...fixture.publicationConvergence,
            publicationPending: true,
            missingPublishedCount:
              PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS.length,
            missingPublishedNodeIds: [
              ...PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS,
            ],
          },
        },
      });
      const publicationWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === EDGE_PUBLICATION_ACK_CONVERGENCE,
      );

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_PRIORITY_RECOVERY);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_OPERATION_WORKFLOW);
      assert.equal(publicationWitness.state, EDGE_STATE.SATISFIED);
      assert.deepEqual(publicationWitness.reasons, [
        PUBLICATION_PUBLISHED_REASON,
      ]);
      assert.equal(
        publicationWitness.source.missingPublishedCount,
        PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS.length,
      );
      assertNoNullOrUndefined(graph);
    });

  it('keeps active-gate coverage behind retryable in-flight priority recovery',
    () => {
      const fixture = buildFixtureFailureBundle();
      const graph = buildTopologyConvergenceGraphFromArtifacts({
        failureBundle: {
          ...fixture,
          publicationConvergence: {
            ...fixture.publicationConvergence,
            activeGate: {
              ...fixture.publicationConvergence.activeGate,
              progress: {
                ...fixture.publicationConvergence.activeGate.progress,
                priorityRecoveryProgressClasses: {
                  unresolvedSemanticStateIds: [
                    FIXTURE_PRIORITY_RECOVERING_STATE,
                  ],
                  blockedPartitionIds: [FIXTURE_PARTITION_ID],
                },
              },
            },
          },
        },
      });
      const priorityEdge = findEdge(graph.edges, EDGE_PRIORITY_RECOVERY);

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_PRIORITY_RECOVERY);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_OPERATION_WORKFLOW);
      assert.equal(priorityEdge.state, EDGE_STATE.RETRYABLE);
      assert.deepEqual(priorityEdge.reasons, [
        PRIORITY_RECOVERY_RETRYABLE_REASON,
      ]);
      assert.deepEqual(
        graph.frontier.map((edge) => edge.id),
        [EDGE_PRIORITY_RECOVERY],
      );
      assert.deepEqual(
        graph.nextExpectedFrontier.map((edge) => edge.id),
        [EDGE_SNAPSHOT_COVERAGE],
      );
      assertNoNullOrUndefined(graph);
    });

  it('uses partition witnesses when priority class contracts are absent',
    () => {
      const fixture = buildFixtureFailureBundle();
      const partitionWitness = {
        partitionId: FIXTURE_PARTITION_ID,
        semanticStateId: FIXTURE_PRIORITY_RECOVERING_STATE,
        currentOwner: OWNER_OPERATION_WORKFLOW,
        blockingBoundary: BOUNDARY_WORKFLOW_PROGRESS,
        waitMode: PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN,
        nextRequiredAction:
          PRIORITY_RECOVERY_ACTION_WAIT_FOR_OPERATION_PROGRESS,
        actuationState:
          PRIORITY_RECOVERY_ACTUATION_DISPATCHED_WAITING_PROGRESS,
      };
      const graph = buildTopologyConvergenceGraphFromArtifacts({
        failureBundle: {
          ...fixture,
          publicationConvergence: {
            ...fixture.publicationConvergence,
            activeGate: {
              ...fixture.publicationConvergence.activeGate,
              progress: {
                expectedNodeCount: FIXTURE_EXPECTED_NODE_COUNT,
                snapshotCoverageNodeCount: FIXTURE_SNAPSHOT_COVERAGE_COUNT,
                snapshotCoverageComplete: false,
                priorityBlockedPartitionCount: ZERO_COUNT,
                blockers: [SNAPSHOT_COVERAGE_TWO_OF_FIVE_BLOCKER],
              },
            },
            priorityRecoveryPartitionWitnesses: [partitionWitness],
            priorityRecoveryProgressSummary: {
              dominantWitness: partitionWitness,
              priorityBlockedPartitionCount: ZERO_COUNT,
            },
          },
        },
      });
      const priorityEdge = findEdge(graph.edges, EDGE_PRIORITY_RECOVERY);

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_PRIORITY_RECOVERY);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_OPERATION_WORKFLOW);
      assert.equal(priorityEdge.state, EDGE_STATE.RETRYABLE);
      assert.equal(
        priorityEdge.evidencePath,
        PRIORITY_RECOVERY_PARTITION_WITNESS_EVIDENCE_PATH,
      );
      assert.deepEqual(priorityEdge.reasons, [
        PRIORITY_RECOVERY_RETRYABLE_REASON,
      ]);
      assert.equal(
        priorityEdge.source.unresolvedSemanticStateIds,
        FIXTURE_PRIORITY_RECOVERING_STATE,
      );
      assert.equal(priorityEdge.source.blockedPartitionIds, FIXTURE_PARTITION_ID);
      assert.equal(
        priorityEdge.source.waitModes,
        PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN,
      );
      assert.deepEqual(
        graph.nextExpectedFrontier.map((edge) => edge.id),
        [EDGE_SNAPSHOT_COVERAGE],
      );
      assertNoNullOrUndefined(graph);
    });

  it('ignores spread-satisfied partition witnesses when class contracts are absent',
    () => {
      const fixture = buildFixtureFailureBundle();
      const partitionWitness = {
        partitionId: FIXTURE_PARTITION_ID,
        semanticStateId: FIXTURE_PRIORITY_SPREAD_SATISFIED_STATE,
        currentOwner: OWNER_OPERATION_WORKFLOW,
        blockingBoundary: BOUNDARY_WORKFLOW_PROGRESS,
        waitMode: PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN,
        nextRequiredAction:
          PRIORITY_RECOVERY_ACTION_WAIT_FOR_OPERATION_PROGRESS,
        actuationState:
          PRIORITY_RECOVERY_ACTUATION_DISPATCHED_WAITING_PROGRESS,
      };
      const graph = buildTopologyConvergenceGraphFromArtifacts({
        failureBundle: {
          ...fixture,
          publicationConvergence: {
            ...fixture.publicationConvergence,
            activeGate: {
              ...fixture.publicationConvergence.activeGate,
              progress: {
                expectedNodeCount: FIXTURE_EXPECTED_NODE_COUNT,
                snapshotCoverageNodeCount: FIXTURE_SNAPSHOT_COVERAGE_COUNT,
                snapshotCoverageComplete: false,
                priorityBlockedPartitionCount: ZERO_COUNT,
                blockers: [SNAPSHOT_COVERAGE_TWO_OF_FIVE_BLOCKER],
              },
            },
            priorityRecoveryPartitionWitnesses: [partitionWitness],
            priorityRecoveryProgressSummary: {
              dominantWitness: partitionWitness,
              priorityBlockedPartitionCount: ZERO_COUNT,
            },
          },
        },
      });
      const priorityEdge = findEdge(graph.edges, EDGE_PRIORITY_RECOVERY);

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_STARTUP_ACTIVE_GATE);
      assert.equal(priorityEdge.state, EDGE_STATE.SATISFIED);
      assert.deepEqual(priorityEdge.reasons, [
        PRIORITY_RECOVERY_SATISFIED_REASON,
      ]);
      assert.equal(priorityEdge.source.unresolvedSemanticStateIds, SOURCE_PATH_ABSENT);
      assert.equal(priorityEdge.source.blockedPartitionIds, SOURCE_PATH_ABSENT);
      assert.deepEqual(
        graph.frontier.map((edge) => edge.id),
        [EDGE_SNAPSHOT_COVERAGE],
      );
      assertNoNullOrUndefined(graph);
    });

  it('prefers topology operator witness records carried by partition witnesses',
    () => {
      const fixture = buildFixtureFailureBundle();
      const topologyOperatorWitness = {
        operatorId: TOPOLOGY_OPERATOR_TEST_ID,
        owner: OWNER_OPERATION_WORKFLOW,
        boundary: BOUNDARY_WORKFLOW_PROGRESS,
        kind: TOPOLOGY_OPERATOR_TEST_KIND,
        partitionId: FIXTURE_PARTITION_ID,
        targetNodeId: TOPOLOGY_OPERATOR_TEST_TARGET_NODE_ID,
        steps: [{
          stepId: TOPOLOGY_OPERATOR_TEST_CURRENT_STEP_ID,
          state: TOPOLOGY_OPERATOR_TEST_CURRENT_STEP_STATE,
          current: true,
        }],
        currentStepId: TOPOLOGY_OPERATOR_TEST_CURRENT_STEP_ID,
        currentStepState: TOPOLOGY_OPERATOR_TEST_CURRENT_STEP_STATE,
        nextAction: PRIORITY_RECOVERY_ACTION_WAIT_FOR_OPERATION_PROGRESS,
        deadlineMs: TOPOLOGY_OPERATOR_TEST_DEADLINE_MS,
        lastObservedAtMs: TOPOLOGY_OPERATOR_TEST_LAST_OBSERVED_AT_MS,
      };
      const partitionWitness = {
        partitionId: FIXTURE_PARTITION_ID,
        semanticStateId: FIXTURE_PRIORITY_SEMANTIC_STATE,
        currentOwner: ARTIFACT_PRIORITY_RECOVERY_OWNER,
        blockingBoundary: ARTIFACT_PRIORITY_RECOVERY_BOUNDARY,
        topologyOperatorWitness,
      };
      const graph = buildTopologyConvergenceGraphFromArtifacts({
        failureBundle: {
          ...fixture,
          publicationConvergence: {
            ...fixture.publicationConvergence,
            activeGate: {
              ...fixture.publicationConvergence.activeGate,
              progress: {
                ...fixture.publicationConvergence.activeGate.progress,
                priorityRecoveryProgressClasses: {},
              },
            },
            priorityRecoveryPartitionWitnesses: [partitionWitness],
            priorityRecoveryProgressSummary: {
              dominantWitness: partitionWitness,
              priorityBlockedPartitionCount: ZERO_COUNT,
            },
          },
        },
      });
      const priorityEdge = findEdge(graph.edges, EDGE_PRIORITY_RECOVERY);

      assert.equal(priorityEdge.state, EDGE_STATE.RETRYABLE);
      assert.equal(priorityEdge.owner, OWNER_OPERATION_WORKFLOW);
      assert.equal(priorityEdge.boundary, BOUNDARY_WORKFLOW_PROGRESS);
      assert.equal(priorityEdge.source.topologyOperatorId, TOPOLOGY_OPERATOR_TEST_ID);
      assert.equal(
        priorityEdge.source.topologyOperatorCurrentStepId,
        TOPOLOGY_OPERATOR_TEST_CURRENT_STEP_ID,
      );
      assert.equal(
        priorityEdge.source.topologyOperatorCurrentStepState,
        TOPOLOGY_OPERATOR_TEST_CURRENT_STEP_STATE,
      );
      assert.deepEqual(priorityEdge.reasons, [
        PRIORITY_RECOVERY_RETRYABLE_REASON,
      ]);
      assertNoNullOrUndefined(graph);
    });

  it('treats an explicit empty priority class contract as satisfied before retained witnesses',
    () => {
      const fixture = buildFixtureFailureBundle();
      const partitionWitness = {
        partitionId: FIXTURE_PARTITION_ID,
        semanticStateId: FIXTURE_PRIORITY_SPREAD_SATISFIED_STATE,
        currentOwner: OWNER_OPERATION_WORKFLOW,
        blockingBoundary: BOUNDARY_WORKFLOW_PROGRESS,
        waitMode: PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN,
        nextRequiredAction:
          PRIORITY_RECOVERY_ACTION_WAIT_FOR_OPERATION_PROGRESS,
        actuationState:
          PRIORITY_RECOVERY_ACTUATION_DISPATCHED_WAITING_PROGRESS,
      };
      const graph = buildTopologyConvergenceGraphFromArtifacts({
        failureBundle: {
          ...fixture,
          publicationConvergence: {
            ...fixture.publicationConvergence,
            activeGate: {
              ...fixture.publicationConvergence.activeGate,
              progress: {
                ...fixture.publicationConvergence.activeGate.progress,
                priorityBlockedPartitionCount: ZERO_COUNT,
                priorityRecoveryProgressClasses: {
                  unresolvedSemanticStateIds: [],
                  blockedPartitionIds: [],
                },
              },
            },
            priorityRecoveryPartitionWitnesses: [partitionWitness],
            priorityRecoveryProgressSummary: {
              dominantWitness: partitionWitness,
              priorityRecoveryProgressClasses: {
                unresolvedSemanticStateIds: [],
                blockedPartitionIds: [],
              },
              priorityBlockedPartitionCount: ZERO_COUNT,
            },
          },
        },
      });
      const priorityEdge = findEdge(graph.edges, EDGE_PRIORITY_RECOVERY);

      assert.equal(graph.summary.firstFrontierEdgeId, EDGE_SNAPSHOT_COVERAGE);
      assert.equal(graph.summary.firstFrontierOwner, OWNER_STARTUP_ACTIVE_GATE);
      assert.equal(priorityEdge.state, EDGE_STATE.SATISFIED);
      assert.equal(
        priorityEdge.evidencePath,
        PRIORITY_RECOVERY_PROGRESS_CLASS_EVIDENCE_PATH,
      );
      assert.deepEqual(priorityEdge.reasons, [
        PRIORITY_RECOVERY_SATISFIED_REASON,
      ]);
      assert.equal(priorityEdge.source.unresolvedSemanticStateIds, SOURCE_PATH_ABSENT);
      assert.equal(priorityEdge.source.blockedPartitionIds, SOURCE_PATH_ABSENT);
      assert.deepEqual(
        graph.frontier.map((edge) => edge.id),
        [EDGE_SNAPSHOT_COVERAGE],
      );
      assertNoNullOrUndefined(graph);
    });

  it('keeps the decision table deterministic after artifact-specific owner evidence', () => {
    const fixture = buildFixtureFailureBundle();
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: {
        ...fixture,
        publicationConvergence: {
          ...fixture.publicationConvergence,
          priorityRecoveryProgressSummary: {
            dominantWitness: {
              currentOwner: ARTIFACT_PRIORITY_RECOVERY_OWNER,
              blockingBoundary: ARTIFACT_PRIORITY_RECOVERY_BOUNDARY,
            },
            priorityRecoveryProgressClasses:
              fixture.publicationConvergence.activeGate.progress
                .priorityRecoveryProgressClasses,
            priorityBlockedPartitionCount: ONE_COUNT,
          },
        },
      },
    });
    const decisionTable = buildTopologyConvergenceDecisionTable();
    const priorityRecoveryRow = decisionTable.transitions.find((row) =>
      row.edgeId === EDGE_PRIORITY_RECOVERY,
    );

    assert.equal(
      findEdge(graph.edges, EDGE_PRIORITY_RECOVERY).owner,
      ARTIFACT_PRIORITY_RECOVERY_OWNER,
    );
    assert.equal(priorityRecoveryRow.owner, OWNER_OPERATION_WORKFLOW);
    assert.equal(priorityRecoveryRow.boundary, BOUNDARY_WORKFLOW_PROGRESS);
  });

  it('converges to an empty frontier when all blocker edges are satisfied', () => {
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: buildHealthyFixtureFailureBundle(),
    });

    assert.equal(findEdge(graph.edges, EDGE_TOP_FAILURE_REASONS).state, EDGE_STATE.SATISFIED);
    assert.equal(graph.frontier.length, EXPECTED_EMPTY_FRONTIER_COUNT);
    assert.equal(graph.summary.frontierCount, EXPECTED_EMPTY_FRONTIER_COUNT);
    assert.equal(graph.summary.firstFrontierEdgeId, SOURCE_PATH_ABSENT);
    assert.equal(graph.summary.firstFrontierState, SOURCE_PATH_ABSENT);
    assert.deepEqual(graph.nextExpectedFrontier, []);
    assertNoNullOrUndefined(graph);
  });

  it('builds a graph for the 20260507 playback failure bundle artifact', () => {
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH_20260507, JSON_ENCODING_UTF8));
    const graph = buildTopologyConvergenceGraphFromArtifacts({failureBundle: artifact});
    const priorityEdge = findEdge(graph.edges, EDGE_PRIORITY_RECOVERY);

    assert.equal(graph.scenario, SCENARIO_ROLLING_RESTART);
    assert.equal(graph.summary.firstFrontierEdgeId, EDGE_PRIORITY_RECOVERY);
    assert.equal(priorityEdge.state, EDGE_STATE.RETRYABLE);
    assert.ok(graph.frontier.length >= MIN_FRONTIER_COUNT);
    assert.ok(graph.nextExpectedFrontier.length >= MIN_FRONTIER_COUNT);
    assertNoNullOrUndefined(graph);
  });

  it('uses scenario evidence from the direct 20260507 report artifact', () => {
    const artifact = JSON.parse(
      fs.readFileSync(REPORT_ARTIFACT_PATH_20260507, JSON_ENCODING_UTF8),
    );
    const graph = buildTopologyConvergenceGraph(artifact);

    assert.equal(graph.scenario, SCENARIO_ROLLING_RESTART);
    assert.equal(graph.summary.firstFrontierEdgeId, EDGE_PRIORITY_RECOVERY);
    assert.deepEqual(
      graph.nextExpectedFrontier.map((edge) => edge.id),
      [EDGE_SNAPSHOT_COVERAGE],
    );
    assertNoNullOrUndefined(graph);
  });
});
