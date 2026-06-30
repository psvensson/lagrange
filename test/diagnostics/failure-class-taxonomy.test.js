import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {classifyFailures} from '../../src/diagnostics/failure-class-taxonomy.js';
import {FAILURE_CLASS, RESOLUTION_STRATEGY} from '../../src/diagnostics/causal-analysis-schema.js';
import {
  buildPassedRollingRestartReport,
  buildPostRebalanceClosureBlockedReport,
  buildSelectedSnapshotTimeoutReport,
  readActivePriorityBackpressureReport,
  readPriorityBackpressureReport,
  readPublicationAckReport,
} from './causal-analysis-fixtures.js';

const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;

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
  it('normalizes weak active-gate no-progress evidence into causal failure classes', () => {
    const taxonomy = classifyFailures(readActivePriorityBackpressureReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(taxonomy);
  });

  it('contracts report and failure-bundle weak readiness evidence consistently', () => {
    const reportTaxonomy = classifyFailures(readActivePriorityBackpressureReport());
    const artifactTaxonomy = classifyFailures(readPriorityBackpressureReport());
    const reportClasses = reportTaxonomy.classes.map((entry) => entry.failureClass);
    const artifactClasses = artifactTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(reportClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(artifactClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assertNoNullOrUndefined(reportTaxonomy);
    assertNoNullOrUndefined(artifactTaxonomy);
  });

  it('migrates active-gate no-progress behind in-flight priority recovery', () => {
    const taxonomy = classifyFailures(readActivePriorityBackpressureReport());
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

  it('treats weak zero-attempt startup readiness no-progress as inherited active-gate evidence', () => {
    const taxonomy = classifyFailures(readPriorityBackpressureReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(taxonomy);
  });

  it('treats selected snapshot timeout as inherited active-gate evidence', () => {
    const taxonomy = classifyFailures(buildSelectedSnapshotTimeoutReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(
      failureClasses.includes(
        FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
      ),
    );
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.LOCAL_RUNTIME_OWNER_FIX);
    assertNoNullOrUndefined(taxonomy);
  });

  it('classifies deferred publication ACK frontier as a local publication blocker', () => {
    const taxonomy = classifyFailures(readPublicationAckReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(failureClasses.includes(FAILURE_CLASS.PUBLICATION_ACK_BLOCKED));
    assert.equal(taxonomy.dominantFailureClass, FAILURE_CLASS.PUBLICATION_ACK_BLOCKED);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.LOCAL_RUNTIME_OWNER_FIX);
    assertNoNullOrUndefined(taxonomy);
  });

  it('classifies post-rebalance closure blockers before evidence incompleteness', () => {
    const taxonomy = classifyFailures(buildPostRebalanceClosureBlockedReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(
      typeof FAILURE_CLASS.POST_REBALANCE_CLOSURE_BLOCKED,
      'string',
    );
    assert.ok(
      failureClasses.includes(FAILURE_CLASS.POST_REBALANCE_CLOSURE_BLOCKED),
    );
    assert.equal(
      taxonomy.dominantFailureClass,
      FAILURE_CLASS.POST_REBALANCE_CLOSURE_BLOCKED,
    );
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.LOCAL_RUNTIME_OWNER_FIX);
    assert.equal(failureClasses.includes(FAILURE_CLASS.EVIDENCE_INCOMPLETE), false);
    assertNoNullOrUndefined(taxonomy);
  });

  it('classifies a passed rolling-restart report without blockers as healthy', () => {
    const taxonomy = classifyFailures(buildPassedRollingRestartReport());

    assert.equal(taxonomy.dominantFailureClass, FAILURE_CLASS.HEALTHY);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.NO_ACTION);
    assertNoNullOrUndefined(taxonomy);
  });
});
