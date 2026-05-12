import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {
  buildRepresentativeEvidenceSummary,
  renderMarkdown,
} from '../../scripts/summarize-representative-evidence.js';

const NODE_BIN = process.execPath;
const SCRIPT_PATH = 'scripts/summarize-representative-evidence.js';
const ENCODING_UTF8 = 'utf8';
const ARG_MARKDOWN = '--markdown';
const FIXTURE_PATH =
  'test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json';
const SUMMARY_SCHEMA = 'representative-evidence-summary-v1';
const PRIORITY_RECOVERY_EDGE = 'priority_recovery_partition_progress';
const OPERATION_WORKFLOW_OWNER = 'operation_workflow_owner';
const REBALANCER_HANDOFF_BOUNDARY = 'rebalancer_handoff';
const CLASSIFIED_BACKPRESSURE_OUTCOME = 'accept_classified_backpressure';
const PRIORITY_RECOVERY_FAILURE_CLASS = 'priority_recovery_event_wait';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, ENCODING_UTF8));
}

function runSummaryJson(filePath) {
  return JSON.parse(execFileSync(
    NODE_BIN,
    [SCRIPT_PATH, filePath],
    {encoding: ENCODING_UTF8},
  ));
}

describe('representative evidence summary', () => {
  it('combines topology frontier and causal-model summaries', () => {
    const summary = buildRepresentativeEvidenceSummary(
      FIXTURE_PATH,
      readJson(FIXTURE_PATH),
    );

    assert.equal(summary.schemaVersion, SUMMARY_SCHEMA);
    assert.equal(summary.topology.firstFrontierEdgeId, PRIORITY_RECOVERY_EDGE);
    assert.equal(summary.topology.dominantWitness.owner, OPERATION_WORKFLOW_OWNER);
    assert.equal(summary.topology.dominantWitness.boundary, REBALANCER_HANDOFF_BOUNDARY);
    assert.equal(summary.causal.outcome, CLASSIFIED_BACKPRESSURE_OUTCOME);
    assert.equal(summary.causal.dominantFailureClass, PRIORITY_RECOVERY_FAILURE_CLASS);
    assert.equal(summary.causal.criticalPath[0].edgeId, PRIORITY_RECOVERY_EDGE);
  });

  it('prints deterministic JSON from the CLI', () => {
    const output = runSummaryJson(FIXTURE_PATH);

    assert.equal(output.schemaVersion, SUMMARY_SCHEMA);
    assert.equal(output.sourceArtifact, FIXTURE_PATH);
    assert.equal(output.topology.firstFrontierEdgeId, PRIORITY_RECOVERY_EDGE);
  });

  it('renders a compact markdown handoff', () => {
    const markdown = execFileSync(
      NODE_BIN,
      [SCRIPT_PATH, FIXTURE_PATH, ARG_MARKDOWN],
      {encoding: ENCODING_UTF8},
    );
    const directMarkdown = renderMarkdown(runSummaryJson(FIXTURE_PATH));

    assert.match(markdown, /# Representative Evidence Summary/u);
    assert.match(markdown, /Topology owner: `operation_workflow_owner`/u);
    assert.match(directMarkdown, /Critical Path Preview/u);
  });
});
