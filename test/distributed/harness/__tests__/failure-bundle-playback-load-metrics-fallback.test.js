import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  FAILURE_BUNDLE_SCENARIO_ASSEMBLY,
} from '../failure-bundle-scenario-assembly.js';

const {
  buildScenarioFailureBundle,
} = FAILURE_BUNDLE_SCENARIO_ASSEMBLY;

const SCENARIO = 'rolling-restart';
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const ROOT_CAUSE_LOAD = 'load';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
const REASON_NODE_SLOT_UNAVAILABLE = 'nodeSlotUnavailable';
const REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
const REASON_RETRYABLE_CONTROL_PLANE_PRESSURE =
  'retryableControlPlanePressure';
const REASON_TIMEOUT_WAITS = 'timeoutWaits';
const REASON_QUEUE_CAPACITY_REJECTED = 'queueCapacityRejected';
const MARKER_QUEUE_PRESSURE_ONSET = 'queuePressureOnset';
const FINAL_VISIBILITY_ERROR =
  'Could not complete acknowledged-write visibility query on node ' +
  NODE_A +
  ' within 30248ms: Admin API query failed for node ' +
  NODE_A +
  ' on lane default: ' +
  'Distributed operation failed due to participant failures';

function buildSatisfiedControlPlaneDiagnostics() {
  return {
    publicationConvergence: {
      publicationEpoch: 37,
      publicationStatus: PUBLICATION_STATUS_PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
      requiredAckNodeIds: [],
      acknowledgedNodeIds: [NODE_A, NODE_B],
      pendingAckNodeIds: [],
      publishedActiveNodeIds: [NODE_A, NODE_B],
      missingPublishedNodeIds: [],
      missingPublishedCount: 0,
      priorityRecoveryReasonCodes: [],
    },
  };
}

function buildScenarioEntry({loadMetrics = null} = {}) {
  return {
    scenario: SCENARIO,
    passed: false,
    error: FINAL_VISIBILITY_ERROR,
    loadMetrics,
    details: {
      diagnostics: {
        controlPlaneDiagnostics: buildSatisfiedControlPlaneDiagnostics(),
        failure: {
          rootCauseClass: ROOT_CAUSE_LOAD,
          dominantReason: REASON_NODE_SLOT_UNAVAILABLE,
          reasonCounts: {
            [REASON_NODE_SLOT_UNAVAILABLE]: 1,
          },
          affectedNodeIds: [],
        },
      },
    },
  };
}

function buildLoadMetrics(waitReasons) {
  return {
    total: 846,
    success: 846,
    failed: 0,
    errors: 0,
    attemptErrors: 59,
    waitReasons,
    perNode: {},
  };
}

function buildLogs(loadMetrics) {
  return {
    firstFaultTimeline: {
      orderedMarkers: [
        {
          marker: MARKER_QUEUE_PRESSURE_ONSET,
        },
      ],
    },
    playbackEventSummary: {
      load: {
        lastMetrics: loadMetrics,
      },
    },
  };
}

describe('failure bundle playback load-metrics fallback', () => {
  it('uses playback wait reasons when scenario loadMetrics are absent', () => {
    const bundle = buildScenarioFailureBundle({
      entry: buildScenarioEntry(),
      reportOutputPath: null,
      reportSummary: null,
      standardSummary: null,
      benchmarkRegressionGate: null,
      logs: buildLogs(buildLoadMetrics({
        [REASON_NODE_SLOT_UNAVAILABLE]: 0,
        [REASON_NODE_ADMISSION_BLOCKED]: 639,
        [REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]: 49,
        [REASON_TIMEOUT_WAITS]: 10,
        [REASON_QUEUE_CAPACITY_REJECTED]: 0,
      })),
    });

    assert.equal(
      bundle.summary.dominantReason,
      REASON_NODE_ADMISSION_BLOCKED,
    );
    assert.notEqual(
      bundle.summary.dominantReason,
      REASON_NODE_SLOT_UNAVAILABLE,
    );
    assert.equal(
      bundle.topFailures.reasonCounts[REASON_NODE_ADMISSION_BLOCKED],
      639,
    );
    assert.equal(
      bundle.topFailures.loadMetrics.waitReasons[
        REASON_NODE_SLOT_UNAVAILABLE
      ],
      0,
    );
    assert.equal(
      bundle.topFailures.topReasons[0].reason,
      REASON_NODE_ADMISSION_BLOCKED,
    );
    assert.equal(bundle.publicationConvergence.missingPublishedCount, 0);
    assert.equal(bundle.publicationConvergence.pendingAckCount, 0);
  });

  it('keeps nodeSlotUnavailable when it is the sole concrete load reason', () => {
    const bundle = buildScenarioFailureBundle({
      entry: buildScenarioEntry(),
      reportOutputPath: null,
      reportSummary: null,
      standardSummary: null,
      benchmarkRegressionGate: null,
      logs: buildLogs(buildLoadMetrics({
        [REASON_NODE_SLOT_UNAVAILABLE]: 3,
        [REASON_NODE_ADMISSION_BLOCKED]: 0,
        [REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]: 0,
        [REASON_TIMEOUT_WAITS]: 0,
        [REASON_QUEUE_CAPACITY_REJECTED]: 0,
      })),
    });

    assert.equal(
      bundle.summary.dominantReason,
      REASON_NODE_SLOT_UNAVAILABLE,
    );
    assert.equal(
      bundle.topFailures.reasonCounts[REASON_NODE_SLOT_UNAVAILABLE],
      4,
    );
  });

  it('keeps retained nodeSlotUnavailable when scenario loadMetrics exist', () => {
    const bundle = buildScenarioFailureBundle({
      entry: buildScenarioEntry({
        loadMetrics: buildLoadMetrics({
          [REASON_NODE_SLOT_UNAVAILABLE]: 0,
          [REASON_NODE_ADMISSION_BLOCKED]: 639,
          [REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]: 49,
          [REASON_TIMEOUT_WAITS]: 10,
          [REASON_QUEUE_CAPACITY_REJECTED]: 0,
        }),
      }),
      reportOutputPath: null,
      reportSummary: null,
      standardSummary: null,
      benchmarkRegressionGate: null,
      logs: buildLogs(buildLoadMetrics({
        [REASON_NODE_SLOT_UNAVAILABLE]: 0,
        [REASON_NODE_ADMISSION_BLOCKED]: 999,
        [REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]: 0,
        [REASON_TIMEOUT_WAITS]: 0,
        [REASON_QUEUE_CAPACITY_REJECTED]: 0,
      })),
    });

    assert.equal(
      bundle.summary.dominantReason,
      REASON_NODE_SLOT_UNAVAILABLE,
    );
    assert.equal(
      bundle.topFailures.loadMetrics.waitReasons[REASON_NODE_ADMISSION_BLOCKED],
      639,
    );
  });
});
