import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {buildCausalGraph} from '../../src/diagnostics/causal-graph-builder.js';
import {DEPENDENCY_KIND} from '../../src/diagnostics/causal-analysis-schema.js';
import {
  buildPassedRollingRestartReport,
  readActiveGateLocalBlockerReport,
  readActivePriorityBackpressureArtifact,
  readActivePriorityBackpressureReport,
} from './causal-analysis-fixtures.js';

const SCENARIO_ROLLING_RESTART = 'rolling-restart';
const EXPECTED_NODE_COUNT = 5;
const SNAPSHOT_EDGE = 'topology:active_gate_snapshot_coverage';
const MEMBER_PREFIX = 'member:';
const NODE_ROLE_READINESS_BLOCKED = 'readiness_blocked';
const MIN_SUSPECT_COUNT = 1;
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;
const EDGE_TYPE_TOPOLOGY = 'topology_dependency';
const EDGE_PUBLICATION_ACK_CONVERGENCE = 'publication_ack_convergence';
const EDGE_PRIORITY_RECOVERY = 'priority_recovery_partition_progress';
const EDGE_ACTIVE_GATE_SNAPSHOT_COVERAGE = 'active_gate_snapshot_coverage';
const EDGE_READINESS_STARTUP_SUPPORT = 'readiness_startup_support';
const EDGE_TOP_FAILURE_REASONS = 'top_failure_reasons';
const SOURCE_REPORT = 'report';
const SOURCE_FAILURE_BUNDLE = 'failure_bundle';
const SOURCE_ABSENT = 'absent';

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

function topologyDependencyEdgeId(dependencyId, edgeId) {
  return `${EDGE_TYPE_TOPOLOGY}:${dependencyId}:${edgeId}`;
}

function findTopologyDependency(graph, dependencyId, edgeId) {
  const expectedId = topologyDependencyEdgeId(dependencyId, edgeId);
  return graph.edges.find((edge) => edge.id === expectedId);
}

describe('CausalGraphBuilder', () => {
  it('builds a cross-node graph from the active rolling-restart artifact', () => {
    const graph = buildCausalGraph(readActivePriorityBackpressureArtifact());

    assert.equal(graph.scenario, SCENARIO_ROLLING_RESTART);
    assert.equal(graph.phaseModel.length, EXPECTED_NODE_COUNT + EXPECTED_NODE_COUNT);
    assert.ok(graph.nodes.some((node) => node.id === SNAPSHOT_EDGE));
    assert.ok(graph.nodes.some((node) =>
      node.id.startsWith(MEMBER_PREFIX) && node.role === NODE_ROLE_READINESS_BLOCKED,
    ));
    assert.ok(graph.suspectNodes.length >= MIN_SUSPECT_COUNT);
    assertNoNullOrUndefined(graph);
  });

  it('normalizes report readiness failure evidence into blocked member nodes', () => {
    const graph = buildCausalGraph(readActiveGateLocalBlockerReport());

    assert.ok(graph.nodes.some((node) =>
      node.id.startsWith(MEMBER_PREFIX) && node.role === NODE_ROLE_READINESS_BLOCKED,
    ));
    assert.ok(graph.suspectNodes.length >= MIN_SUSPECT_COUNT);
    assertNoNullOrUndefined(graph);
  });

  it('does not claim failure-bundle provenance for report-only passed canary input', () => {
    const graph = buildCausalGraph(buildPassedRollingRestartReport());

    assert.equal(graph.generatedFrom.report, SOURCE_REPORT);
    assert.equal(graph.generatedFrom.failureBundle, SOURCE_ABSENT);
    assertNoNullOrUndefined(graph);
  });

  it('preserves failure-bundle provenance for direct failure-bundle input', () => {
    const graph = buildCausalGraph(readActivePriorityBackpressureArtifact());

    assert.equal(graph.generatedFrom.report, SOURCE_ABSENT);
    assert.equal(graph.generatedFrom.failureBundle, SOURCE_FAILURE_BUNDLE);
    assert.ok(graph.suspectNodes.length >= MIN_SUSPECT_COUNT);
    assertNoNullOrUndefined(graph);
  });

  it('preserves active failed report causal output provenance and blockers', () => {
    const graph = buildCausalGraph(readActivePriorityBackpressureReport());

    assert.equal(graph.generatedFrom.report, SOURCE_REPORT);
    assert.equal(graph.generatedFrom.failureBundle, SOURCE_ABSENT);
    assert.ok(graph.nodes.some((node) =>
      node.id.startsWith(MEMBER_PREFIX) && node.role === NODE_ROLE_READINESS_BLOCKED,
    ));
    assert.ok(graph.suspectNodes.length >= MIN_SUSPECT_COUNT);
    assertNoNullOrUndefined(graph);
  });

  it('emits semantic topology dependency kinds for the causal chain', () => {
    const graph = buildCausalGraph(readActivePriorityBackpressureArtifact());

    assert.equal(
      findTopologyDependency(
        graph,
        EDGE_PUBLICATION_ACK_CONVERGENCE,
        EDGE_PRIORITY_RECOVERY,
      ).dependencyKind,
      DEPENDENCY_KIND.PRIORITY_RECOVERY,
    );
    assert.equal(
      findTopologyDependency(
        graph,
        EDGE_PUBLICATION_ACK_CONVERGENCE,
        EDGE_ACTIVE_GATE_SNAPSHOT_COVERAGE,
      ).dependencyKind,
      DEPENDENCY_KIND.PUBLICATION_ACK,
    );
    assert.equal(
      findTopologyDependency(
        graph,
        EDGE_ACTIVE_GATE_SNAPSHOT_COVERAGE,
        EDGE_READINESS_STARTUP_SUPPORT,
      ).dependencyKind,
      DEPENDENCY_KIND.SNAPSHOT_COVERAGE,
    );
    assert.equal(
      findTopologyDependency(
        graph,
        EDGE_READINESS_STARTUP_SUPPORT,
        EDGE_TOP_FAILURE_REASONS,
      ).dependencyKind,
      DEPENDENCY_KIND.READINESS,
    );
  });
});
