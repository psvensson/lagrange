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
const PRIORITY_DOMINANT_WITNESS_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/priority-dominant-witness-owner-boundary.fixture.json`;
const ABSENT_VALUE = 'absent';
const PRIORITY_EDGE_ALIAS = 'priority';
const PRIORITY_EDGE_ID = 'priority_recovery_partition_progress';
const ACTIVE_GATE_EDGE_ID = 'active_gate_snapshot_coverage';
const OPERATION_WORKFLOW_OWNER = 'operation_workflow_owner';
const WORKFLOW_PROGRESS_BOUNDARY = 'workflow_progress';
const REBALANCER_LEADER_OWNER = 'rebalancer_leader';
const OPERATION_SCHEDULING_BOUNDARY = 'operation_scheduling';
const GLOSSARY_REASON = 'priority_recovery_progress_blocked';
const GLOSSARY_SEMANTIC_STATE = 'recovering_in_flight';
const PACKAGE_EVIDENCE_HEADING = '## Generated Owner Evidence Block';
const DOMINANT_REASON =
  'priority_recovery_operation_scheduling_event_driven';
const EDGE_STATE_BLOCKED = 'blocked';
const BLOCKED_REASONS = ['priority_recovery_progress_blocked'];
const PRIORITY_RECOVERY_DOMINANT_WITNESS_PATH =
  'report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness';

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
      PRIORITY_RECOVERY_DOMINANT_WITNESS_PATH,
    );
    assert.deepEqual(output.frontier[0].reasons, BLOCKED_REASONS);
    assert.equal(output.dominantWitness.owner, REBALANCER_LEADER_OWNER);
    assert.equal(output.dominantWitness.boundary, OPERATION_SCHEDULING_BOUNDARY);
    assert.equal(output.dominantWitness.dominantReason, DOMINANT_REASON);
    assert.equal(
      output.dominantWitness.evidencePath,
      PRIORITY_RECOVERY_DOMINANT_WITNESS_PATH,
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
      DOMINANT_REASON,
    );
    assert.equal(output.decisionTable.edgeId, PRIORITY_EDGE_ID);
  });

  it('explains dominant witness owner and evidence path consistently', () => {
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
      PRIORITY_RECOVERY_DOMINANT_WITNESS_PATH,
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
      PRIORITY_RECOVERY_DOMINANT_WITNESS_PATH,
    );
    assert.equal(output.decisionTable.edgeId, PRIORITY_EDGE_ID);
    assert.equal(output.decisionTable.owner, REBALANCER_LEADER_OWNER);
    assert.equal(output.decisionTable.boundary, OPERATION_SCHEDULING_BOUNDARY);
  });

  it('generates a package migration evidence block from analyzer output', () => {
    const output = runAnalyzerText(ARG_PACKAGE_EVIDENCE_BLOCK, PRIORITY_FIXTURE_PATH);

    assert.match(output, new RegExp(PACKAGE_EVIDENCE_HEADING, 'u'));
    assert.match(output, new RegExp(OPERATION_WORKFLOW_OWNER, 'u'));
    assert.match(output, new RegExp(WORKFLOW_PROGRESS_BOUNDARY, 'u'));
    assert.match(output, new RegExp(DOMINANT_REASON, 'u'));
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
