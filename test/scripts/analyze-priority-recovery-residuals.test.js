import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {
  buildPriorityRecoveryResiduals,
  renderMarkdown,
} from '../../scripts/analyze-priority-recovery-residuals.js';

const NODE_BIN = process.execPath;
const SCRIPT_PATH = 'scripts/analyze-priority-recovery-residuals.js';
const ENCODING_UTF8 = 'utf8';
const ARG_MARKDOWN = '--markdown';
const FIXTURE_PATH =
  'test/scripts/__fixtures__/priority-recovery-residual-low-confidence.fixture.json';
const SUMMARY_SCHEMA = 'priority-recovery-residuals-v1';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, ENCODING_UTF8));
}

function runResidualsJson(filePath) {
  return JSON.parse(execFileSync(
    NODE_BIN,
    [SCRIPT_PATH, filePath],
    {encoding: ENCODING_UTF8},
  ));
}

describe('analyze priority recovery residuals script', () => {
  it('extracts priority recovery residuals and detects low confidence ones', () => {
    const summary = buildPriorityRecoveryResiduals(
      FIXTURE_PATH,
      readJson(FIXTURE_PATH),
    );

    assert.equal(summary.schemaVersion, SUMMARY_SCHEMA);
    assert.equal(summary.witnessCount, 0);
    assert.ok(summary.lowConfidenceResiduals);
    assert.equal(summary.lowConfidenceResiduals.length, 1);
    assert.equal(summary.lowConfidenceResiduals[0].nodeId, '11601fe0-72d6-5853-8590-ec2881853e72');
    assert.equal(summary.lowConfidenceResiduals[0].confidence, 'low');
  });

  it('prints deterministic JSON from the CLI', () => {
    const output = runResidualsJson(FIXTURE_PATH);

    assert.equal(output.schemaVersion, SUMMARY_SCHEMA);
    assert.equal(output.sourceArtifact, FIXTURE_PATH);
    assert.equal(output.witnessCount, 0);
  });

  it('renders markdown output with low confidence residuals', () => {
    const markdown = execFileSync(
      NODE_BIN,
      [SCRIPT_PATH, FIXTURE_PATH, ARG_MARKDOWN],
      {encoding: ENCODING_UTF8},
    );
    const directMarkdown = renderMarkdown(runResidualsJson(FIXTURE_PATH));

    assert.match(markdown, /# Priority Recovery Residuals/u);
    assert.match(markdown, /## Low-Confidence Derived Residuals/u);
    assert.match(directMarkdown, /derived from `active_gate_cohort_recovery_pending`/u);
  });
});
