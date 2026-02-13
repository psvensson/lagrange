/**
 * Constants for LatencyMeasurementService.
 */

import {NUM} from '../constants/index.js';

const LATENCY_MEASUREMENT_SUBSYSTEM = 'latency-measurement';

const LATENCY_MEASUREMENT_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const LATENCY_MEASUREMENT_EVENT = Object.freeze({
  SAMPLE_RECORDED: 'sampleRecorded',
  SAMPLE_IGNORED: 'sampleIgnored',
  MEASUREMENT_FAILED: 'measurementFailed',
});

const LATENCY_MEASUREMENT_SAMPLE_QUALITY = Object.freeze({
  GOOD: 'good',
  RETRY: 'retry',
});

const LATENCY_MEASUREMENT_DEFAULT = Object.freeze({
  STALE_SAMPLE_AGE_MULTIPLIER: NUM.TWO,
  MIN_RTT_MS: NUM.ONE,
  MIN_SAMPLE_COUNT: NUM.ONE,
  EDGE_ID_SEPARATOR: '->',
});

const LATENCY_MEASUREMENT_LOG_MSG = Object.freeze({
  INITIALIZED: 'LatencyMeasurementService initialized',
  STARTED: 'LatencyMeasurementService started',
  STOPPED: 'LatencyMeasurementService stopped',
  SAMPLE_RECORDED: 'Inter-group latency sample recorded',
  SAMPLE_IGNORED: 'Ignored inter-group latency sample',
  MEASUREMENT_FAILED: 'Latency measurement failed',
});

const LATENCY_MEASUREMENT_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'LatencyMeasurementService requires nodeId',
  MISSING_MESSAGE_ROUTER: 'LatencyMeasurementService requires messageRouter',
  MISSING_CDC: 'LatencyMeasurementService requires cdcIntegrationService',
  NOT_INITIALIZED: 'LatencyMeasurementService must be initialized first',
  MISSING_SOURCE_GROUP_ID: 'Latency sample requires sourceGroupId',
  MISSING_TARGET_GROUP_ID: 'Latency sample requires targetGroupId',
  MISSING_TARGET_NODE_ID:
    'Latency measurement requires targetRepresentativeNodeId',
});

const LATENCY_MEASUREMENT_REASON = Object.freeze({
  INVALID_SHAPE: 'invalid_shape',
  INVALID_RTT: 'invalid_rtt',
  STALE_SAMPLE: 'stale_sample',
});

export {
  LATENCY_MEASUREMENT_DEFAULT,
  LATENCY_MEASUREMENT_ERROR_MSG,
  LATENCY_MEASUREMENT_EVENT,
  LATENCY_MEASUREMENT_LOG_MSG,
  LATENCY_MEASUREMENT_REASON,
  LATENCY_MEASUREMENT_SAMPLE_QUALITY,
  LATENCY_MEASUREMENT_STATE,
  LATENCY_MEASUREMENT_SUBSYSTEM,
};
