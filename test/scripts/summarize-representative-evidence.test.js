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
const ACTIVE_GATE_EDGE = 'active_gate_snapshot_coverage';
const STARTUP_ACTIVE_GATE_OWNER = 'startup_active_gate_owner';
const SNAPSHOT_COVERAGE_BOUNDARY = 'snapshot_coverage';
const ARCHITECTURE_OUTCOME = 'widen_architecture_work';
const ACTIVE_GATE_FAILURE_CLASS = 'active_gate_snapshot_coverage_incomplete';

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
    assert.equal(summary.topology.firstFrontierEdgeId, ACTIVE_GATE_EDGE);
    assert.equal(summary.topology.dominantWitness.owner, STARTUP_ACTIVE_GATE_OWNER);
    assert.equal(summary.topology.dominantWitness.boundary, SNAPSHOT_COVERAGE_BOUNDARY);
    assert.equal(summary.causal.outcome, ARCHITECTURE_OUTCOME);
    assert.equal(summary.causal.dominantFailureClass, ACTIVE_GATE_FAILURE_CLASS);
    assert.equal(summary.causal.criticalPath[0].edgeId, ACTIVE_GATE_EDGE);
  });

  it('prints deterministic JSON from the CLI', () => {
    const output = runSummaryJson(FIXTURE_PATH);

    assert.equal(output.schemaVersion, SUMMARY_SCHEMA);
    assert.equal(output.sourceArtifact, FIXTURE_PATH);
    assert.equal(output.topology.firstFrontierEdgeId, ACTIVE_GATE_EDGE);
  });

  it('renders a compact markdown handoff', () => {
    const markdown = execFileSync(
      NODE_BIN,
      [SCRIPT_PATH, FIXTURE_PATH, ARG_MARKDOWN],
      {encoding: ENCODING_UTF8},
    );
    const directMarkdown = renderMarkdown(runSummaryJson(FIXTURE_PATH));

    assert.match(markdown, /# Representative Evidence Summary/u);
    assert.match(markdown, /Topology owner: `startup_active_gate_owner`/u);
    assert.match(directMarkdown, /Critical Path Preview/u);
  });
});
