import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {reviewInvariants} from '../../src/diagnostics/invariant-review.js';
import {
  ZERO_COUNT,
  INVARIANT_KIND,
  INVARIANT_STATE,
} from '../../src/diagnostics/causal-analysis-schema.js';
import {
  buildPassedRollingRestartReport,
  readActivePriorityBackpressureArtifact,
  readActivePriorityBackpressureReport,
} from './causal-analysis-fixtures.js';

const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;

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
  it('keeps structural invariants separate from classified budget ownership', () => {
    const review = reviewInvariants(readActivePriorityBackpressureArtifact());

    assert.equal(
      findInvariant(review, INVARIANT_KIND.NODE_COUNT_BOUNDS).state,
      INVARIANT_STATE.PASSED,
    );
    assert.equal(
      findInvariant(review, INVARIANT_KIND.BUDGET_ACCOUNTED).state,
      INVARIANT_STATE.PASSED,
    );
    assertNoNullOrUndefined(review);
  });

  it('keeps report and failure-bundle readiness invariant summaries consistent', () => {
    const reportReview = reviewInvariants(readActivePriorityBackpressureReport());
    const artifactReview = reviewInvariants(readActivePriorityBackpressureArtifact());

    assert.deepEqual(reportReview.summary, artifactReview.summary);
    assert.equal(
      findInvariant(reportReview, INVARIANT_KIND.READINESS_BLOCKERS_EXPLAINED).state,
      INVARIANT_STATE.PASSED,
    );
    assertNoNullOrUndefined(reportReview);
    assertNoNullOrUndefined(artifactReview);
  });

  it('treats absent readiness blockers as passed evidence for a passed report', () => {
    const review = reviewInvariants(buildPassedRollingRestartReport());

    assert.equal(review.summary.failedCount, ZERO_COUNT);
    assert.equal(review.summary.unknownCount, ZERO_COUNT);
    assert.equal(
      findInvariant(review, INVARIANT_KIND.READINESS_BLOCKERS_EXPLAINED).state,
      INVARIANT_STATE.PASSED,
    );
    assertNoNullOrUndefined(review);
  });
});
