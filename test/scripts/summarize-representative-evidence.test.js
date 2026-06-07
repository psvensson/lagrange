import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
const ACTIVE_GATE_SNAPSHOT_EDGE = 'active_gate_snapshot_coverage';
const OPERATION_WORKFLOW_OWNER = 'operation_workflow_owner';
const STARTUP_ACTIVE_GATE_OWNER = 'startup_active_gate_owner';
const WORKFLOW_PROGRESS_BOUNDARY = 'workflow_progress';
const SNAPSHOT_COVERAGE_BOUNDARY = 'snapshot_coverage';
const CLASSIFIED_BACKPRESSURE_OUTCOME = 'accept_classified_backpressure';
const PRIORITY_RECOVERY_FAILURE_CLASS = 'priority_recovery_event_wait';
const EVIDENCE_PATH_FAILURE_BUNDLE_ACTIVE_GATE_PROGRESS =
  'failureBundle.publicationConvergence.activeGate.progress';
const ACTIVE_GATE_TIMED_OUT_REASON = 'active_gate_timed_out';
const SNAPSHOT_COVERAGE_INCOMPLETE_REASON = 'snapshot_coverage_incomplete';
const SNAPSHOT_COVERAGE_COUNT = 2;
const EXPECTED_NODE_COUNT = 5;

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
    assert.equal(summary.topology.dominantWitness.boundary, WORKFLOW_PROGRESS_BOUNDARY);
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

  it('loads linked failure-bundle sidecars for report summaries', () => {
    const {reportPath} = writeLinkedReportFixture();
    const summary = buildRepresentativeEvidenceSummary(
      reportPath,
      readJson(reportPath),
    );

    assert.equal(summary.topology.firstFrontierEdgeId, ACTIVE_GATE_SNAPSHOT_EDGE);
    assert.equal(summary.topology.dominantWitness.owner, STARTUP_ACTIVE_GATE_OWNER);
    assert.equal(summary.topology.dominantWitness.boundary, SNAPSHOT_COVERAGE_BOUNDARY);
    assert.equal(
      summary.topology.dominantWitness.evidencePath,
      EVIDENCE_PATH_FAILURE_BUNDLE_ACTIVE_GATE_PROGRESS,
    );
    assert.ok(
      summary.topology.dominantWitness.reasons.includes(
        ACTIVE_GATE_TIMED_OUT_REASON,
      ),
    );
    assert.ok(
      summary.topology.dominantWitness.reasons.includes(
        SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
      ),
    );
    assert.equal(
      summary.causal.criticalPath[0].edgeId,
      ACTIVE_GATE_SNAPSHOT_EDGE,
    );
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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), ENCODING_UTF8);
}

function writeLinkedReportFixture() {
  const fixtureDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'representative-evidence-sidecar-'),
  );
  const bundlePath = path.join(fixtureDir, 'failure-bundle.json');
  const reportPath = path.join(fixtureDir, 'report.report.json');
  writeJson(bundlePath, buildSidecarFailureBundle());
  writeJson(reportPath, {
    scenarios: [{
      scenario: 'rolling-restart',
      passed: false,
      publicationConvergence: {
        publicationStatus: 'UNKNOWN',
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
  });
  return {reportPath, bundlePath};
}

function buildSidecarFailureBundle() {
  return {
    scenario: 'rolling-restart',
    summary: {
      passed: false,
      dominantReason: 'admin_reachability_refused',
      failureClass: 'startup_recovery_blocked',
    },
    publicationConvergence: {
      publicationStatus: 'UNKNOWN',
      publicationPending: false,
      pendingAckCount: 0,
      blockedNodeCount: 0,
      missingPublishedCount: 0,
      prioritySpreadPending: false,
      activeGate: {
        state: 'timed_out',
        ready: false,
        progress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
          snapshotCoverageComplete: false,
          blockers: ['snapshot_coverage=2/5'],
        },
      },
    },
  };
}
