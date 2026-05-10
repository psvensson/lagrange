import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reviewInvariants} from '../../src/diagnostics/invariant-review.js';
import {
  ZERO_COUNT,
  INVARIANT_KIND,
  INVARIANT_STATE,
} from '../../src/diagnostics/causal-analysis-schema.js';

const ACTIVE_REPORT_PATH = 'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json';
const ACTIVE_ARTIFACT_PATH = 'test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/failure-bundle.json';
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

function findInvariant(review, kind) {
  return review.invariants.find((invariant) => invariant.kind === kind);
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

describe('InvariantReview', () => {
  it('keeps structural invariants separate from unresolved budget accounting', () => {
    const review = reviewInvariants(readActiveArtifact());

    assert.equal(
      findInvariant(review, INVARIANT_KIND.NODE_COUNT_BOUNDS).state,
      INVARIANT_STATE.PASSED,
    );
    assert.equal(
      findInvariant(review, INVARIANT_KIND.BUDGET_ACCOUNTED).state,
      INVARIANT_STATE.FAILED,
    );
    assertNoNullOrUndefined(review);
  });

  it('keeps report and failure-bundle readiness invariant summaries consistent', () => {
    const reportReview = reviewInvariants(readActiveReport());
    const artifactReview = reviewInvariants(readActiveArtifact());

    assert.deepEqual(reportReview.summary, artifactReview.summary);
    assert.equal(
      findInvariant(reportReview, INVARIANT_KIND.READINESS_BLOCKERS_EXPLAINED).state,
      INVARIANT_STATE.PASSED,
    );
    assertNoNullOrUndefined(reportReview);
    assertNoNullOrUndefined(artifactReview);
  });

  it('treats absent readiness blockers as passed evidence for a passed report', () => {
    const review = reviewInvariants(readPassedReport());

    assert.equal(review.summary.failedCount, ZERO_COUNT);
    assert.equal(review.summary.unknownCount, ZERO_COUNT);
    assert.equal(
      findInvariant(review, INVARIANT_KIND.READINESS_BLOCKERS_EXPLAINED).state,
      INVARIANT_STATE.PASSED,
    );
    assertNoNullOrUndefined(review);
  });
});
