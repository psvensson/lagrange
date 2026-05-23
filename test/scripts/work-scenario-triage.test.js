import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {
  buildScenarioTriageSummary,
  renderMarkdown,
} from '../../scripts/work-scenario-triage.js';

const NODE_BIN = process.execPath;
const SCRIPT_PATH = 'scripts/work-scenario-triage.js';
const ENCODING_UTF8 = 'utf8';
const ARG_MARKDOWN = '--markdown';
const FIXTURE_PATH = 'test-output/reports/rolling-restart-rerun-2.report.json';
const SUMMARY_SCHEMA = 'scenario-triage-v1';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, ENCODING_UTF8));
}

function runTriageJson(filePath) {
  return JSON.parse(execFileSync(
    NODE_BIN,
    [SCRIPT_PATH, filePath],
    {encoding: ENCODING_UTF8},
  ));
}

describe('work scenario triage script', () => {
  it('combines representative evidence and priority recovery residuals', () => {
    const summary = buildScenarioTriageSummary(
      FIXTURE_PATH,
      readJson(FIXTURE_PATH),
    );

    assert.equal(summary.schemaVersion, SUMMARY_SCHEMA);
    assert.equal(summary.scenario, 'rolling-restart');
    assert.ok(summary.signalConflict);
    assert.equal(summary.signalConflict.conflictDetected, true);
    assert.equal(summary.signalConflict.pendingRecoveryCount, 1);
    assert.deepEqual(summary.signalConflict.pendingRecoveryNodeIds, ['11601fe0-72d6-5853-8590-ec2881853e72']);
  });

  it('prints deterministic JSON from the CLI', () => {
    const output = runTriageJson(FIXTURE_PATH);

    assert.equal(output.schemaVersion, SUMMARY_SCHEMA);
    assert.equal(output.sourceArtifact, FIXTURE_PATH);
    assert.ok(output.signalConflict);
    assert.equal(output.signalConflict.conflictDetected, true);
  });

  it('renders a compact markdown handoff', () => {
    const markdown = execFileSync(
      NODE_BIN,
      [SCRIPT_PATH, FIXTURE_PATH, ARG_MARKDOWN],
      {encoding: ENCODING_UTF8},
    );
    const directMarkdown = renderMarkdown(runTriageJson(FIXTURE_PATH));

    assert.match(markdown, /# Scenario Triage/u);
    assert.match(markdown, /## Signal Conflict Detected/u);
    assert.match(directMarkdown, /## Priority Recovery Residuals/u);
    assert.match(directMarkdown, /Low-Confidence Derived Residuals/u);
  });
});
