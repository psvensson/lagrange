import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
const FIXTURE_READINESS_MODE = 'startup';
const FIXTURE_READINESS_CLASS = 'snapshot_reachability_timeout';
const FIXTURE_READINESS_RECOVERABILITY = 'terminal';
const FIXTURE_READINESS_CAUSE = 'snapshot_reachability_timeout';
const FIXTURE_READINESS_SOURCE = 'selectedSnapshotReachabilityError';
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
const ACTIVE_GATE_STATE_READY = 'ready';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING = 'priority_spread_pending';
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
const PUBLICATION_ACK_PENDING_STATUS = 'ACK_PENDING';
const PUBLICATION_UNKNOWN_STATUS = 'UNKNOWN';
const PUBLICATION_PENDING_REASON = 'publication_pending';
const PUBLICATION_PUBLISHED_REASON = 'publication_published';
const PENDING_ACKS_PRESENT_REASON = 'pending_acks_present';
const ACTIVE_GATE_TIMED_OUT_REASON = 'active_gate_timed_out';
const SNAPSHOT_COVERAGE_INCOMPLETE_REASON = 'snapshot_coverage_incomplete';
const PRIORITY_RECOVERY_BLOCKED_REASON = 'priority_recovery_progress_blocked';
const PRIORITY_RECOVERY_RETRYABLE_REASON =
  'priority_recovery_event_driven_wait';
const READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_REASON =
  'readiness_inherited_active_gate_no_progress';
const READINESS_SUPPORT_PATH_INHERITED_ACTIVE_GATE_NO_PROGRESS =
  'inherited_active_gate_no_progress';
const ARTIFACT_PRIORITY_RECOVERY_OWNER = 'artifact_priority_owner';
const ARTIFACT_PRIORITY_RECOVERY_BOUNDARY = 'artifact_priority_boundary';
const OWNER_STARTUP_ACTIVE_GATE = 'startup_active_gate_owner';
const PUBLICATION_ACK_FRONTIER_PENDING_NODE_ID =
  '11601fe0-72d6-5853-8590-ec2881853e72';
const PUBLICATION_ACK_FRONTIER_MISSING_NODE_IDS = Object.freeze([
  '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  '8be8d30f-4499-5eed-865c-71b4d529a67a',
  'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
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
        [ACTIVE_GATE_TIMED_OUT_REASON, SNAPSHOT_COVERAGE_INCOMPLETE_REASON],
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
