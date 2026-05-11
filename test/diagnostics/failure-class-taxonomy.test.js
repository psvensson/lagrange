import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyFailures} from '../../src/diagnostics/failure-class-taxonomy.js';
import {FAILURE_CLASS, RESOLUTION_STRATEGY} from '../../src/diagnostics/causal-analysis-schema.js';

const ACTIVE_REPORT_PATH = 'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json';
const ACTIVE_ARTIFACT_PATH = 'test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/failure-bundle.json';
const ACTIVE_GATE_NO_PROGRESS_REPORT_PATH =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json';
const PASSED_REPORT_PATH = 'test-output/reports/canary-rolling-restart-local-latest.report.json';
const JSON_ENCODING_UTF8 = 'utf8';
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;

function readActiveArtifact() {
  return JSON.parse(fs.readFileSync(ACTIVE_ARTIFACT_PATH, JSON_ENCODING_UTF8));
}

function readActiveReport() {
  return JSON.parse(fs.readFileSync(ACTIVE_REPORT_PATH, JSON_ENCODING_UTF8));
}

function readPassedReport() {
  return JSON.parse(fs.readFileSync(PASSED_REPORT_PATH, JSON_ENCODING_UTF8));
}

function readActiveGateNoProgressReport() {
  return JSON.parse(fs.readFileSync(ACTIVE_GATE_NO_PROGRESS_REPORT_PATH, JSON_ENCODING_UTF8));
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

describe('FailureClassTaxonomy', () => {
  it('normalizes observed evidence into causal failure classes', () => {
    const taxonomy = classifyFailures(readActiveArtifact());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.ok(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED));
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(taxonomy);
  });

  it('classifies report and failure-bundle readiness evidence consistently', () => {
    const reportTaxonomy = classifyFailures(readActiveReport());
    const artifactTaxonomy = classifyFailures(readActiveArtifact());
    const reportClasses = reportTaxonomy.classes.map((entry) => entry.failureClass);
    const artifactClasses = artifactTaxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(reportClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED));
    assert.ok(artifactClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED));
    assertNoNullOrUndefined(reportTaxonomy);
    assertNoNullOrUndefined(artifactTaxonomy);
  });

  it('migrates active-gate no-progress behind in-flight priority recovery', () => {
    const taxonomy = classifyFailures(readActiveGateNoProgressReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(
      failureClasses.includes(FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE),
      false,
    );
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(taxonomy);
  });

  it('classifies a passed rolling-restart report without blockers as healthy', () => {
    const taxonomy = classifyFailures(readPassedReport());

    assert.equal(taxonomy.dominantFailureClass, FAILURE_CLASS.HEALTHY);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.NO_ACTION);
    assertNoNullOrUndefined(taxonomy);
  });
});
