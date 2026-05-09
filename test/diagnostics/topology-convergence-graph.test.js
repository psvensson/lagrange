import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EDGE_STATE,
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
const FIXTURE_PRIORITY_SEMANTIC_STATE = 'recovering_in_flight';
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
const ARTIFACT_PATH_20260507 =
  'test-output/reports/.playback/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z/rolling-restart/failure-bundle.json';
const REPORT_ARTIFACT_PATH_20260507 =
  'test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json';
const PUBLICATION_ACK_PENDING_STATUS = 'ACK_PENDING';
const PUBLICATION_PENDING_REASON = 'publication_pending';
const PENDING_ACKS_PRESENT_REASON = 'pending_acks_present';

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
    assert.equal(findEdge(graph.edges, EDGE_SNAPSHOT_COVERAGE).state, EDGE_STATE.BLOCKED);
    assert.equal(findEdge(graph.edges, EDGE_READINESS).state, EDGE_STATE.TERMINAL_FAILED);
    assert.deepEqual(
      graph.frontier.map((edge) => edge.id),
      [EDGE_PRIORITY_RECOVERY, EDGE_SNAPSHOT_COVERAGE],
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

    assert.equal(graph.scenario, SCENARIO_ROLLING_RESTART);
    assert.equal(graph.summary.firstFrontierEdgeId, EDGE_PRIORITY_RECOVERY);
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
