/**
 * Run health vocabulary and thresholds: every verdict name, state,
 * unavailable reason and threshold the run-health unit uses, in one place.
 *
 * Run health is additive evidence about the machines and links a distributed
 * run executed on. It never changes a scenario's outcome, widens a bound or
 * repairs anything; it classifies what the run's own artefacts show.
 *
 * Each threshold names where its value comes from. `owner constant` values
 * are imported from the product owner that defines them; `run baseline`
 * values are ratios against what the same run measured; the two `judgment`
 * values are stated as such and are the only free numbers in the unit.
 */

import {TRANSPORT_DEFAULT, ROUTER_LOG_MSG} from '../../../../src/constants/transport.js';
import {WATCHDOG_DEFAULT} from '../../../../src/diagnostics/event-loop-gap-watchdog.js';
import {
  EVENT_LOOP_DELAY_SAMPLE_MESSAGE,
} from '../../../../src/diagnostics/event-loop-delay-sampler.js';
import {
  PEER_TRAFFIC_INTERVAL_MS,
} from '../../../../src/transport/message-router-peer-traffic-diagnostics.js';
import {WAIT_BOUND_SPENT_EVENT} from '../../../../src/logging/wait-bound-spent.js';
import {
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../../../../src/transport/transport-error-codes.js';
import {HOST_FACT_STATE} from '../../../../src/diagnostics/host-resource-facts.js';
import {
  arrayMap,
} from './captured-intrinsics.js';

const RUN_HEALTH_SCHEMA_VERSION = 1;

const NODE_VERDICT = Object.freeze({
  CPU_SATURATED: 'cpu_saturated',
  HOST_CPU_CONTENDED: 'host_cpu_contended',
  EVENT_LOOP_DELAYED: 'event_loop_delayed',
  MEMORY_PRESSURE: 'memory_pressure',
  THERMALLY_THROTTLED: 'thermally_throttled',
  LOSSY: 'lossy',
});

const LINK_VERDICT = Object.freeze({
  // Host-level TCP counters of the link's two ends; not specific to the link.
  LOSSY: 'lossy',
  BANDWIDTH_LIMITED: 'bandwidth_limited',
  LATENCY_DEGRADED: 'latency_degraded',
  STALLED: 'stalled',
});

// What one check concluded. `unknown` always carries the reason its input
// was unavailable; it is never folded into `clear`.
const VERDICT_STATE = Object.freeze({
  FLAGGED: 'flagged',
  CLEAR: 'clear',
  UNKNOWN: 'unknown',
});

// What a flagged condition is evidence of. `infrastructure`: the machine or
// the network, independent of what the product asked of them. `workload`:
// load the product itself placed on the node or link. `undetermined`: the
// inputs that would tell the two apart were unavailable.
const ATTRIBUTION = Object.freeze({
  INFRASTRUCTURE: 'infrastructure',
  WORKLOAD: 'workload',
  UNDETERMINED: 'undetermined',
});

const INFRASTRUCTURE_SUSPECT = Object.freeze({
  TRUE: 'true',
  FALSE: 'false',
  UNKNOWN: 'unknown',
});

const UNAVAILABLE_REASON = Object.freeze({
  NO_SAMPLES: 'no_resource_samples',
  NO_CONTAINER_CPU: 'no_container_cpu_samples',
  NO_CONTAINER_MEMORY: 'no_container_memory_samples',
  NO_HOST_FACTS: 'no_host_facts_in_samples',
  HOST_FACT_UNAVAILABLE: 'host_fact_unavailable',
  SINGLE_HOST_FACT_READING: 'fewer_than_two_host_fact_readings',
  NO_EVENT_LOOP_LINES: 'no_event_loop_lines_in_node_log',
  NO_NODE_LOG: 'node_log_unavailable',
  NO_PEER_TRAFFIC_LINES: 'no_peer_traffic_lines_in_node_log',
  NO_LATENCY_SAMPLES: 'no_one_way_latency_samples',
  NO_LINK_BASELINE: 'link_baseline_unavailable',
  LINK_BASELINE_PAIR_UNAVAILABLE: 'link_baseline_pair_unavailable',
  HOST_OF_NODE_UNKNOWN: 'host_of_node_unknown',
  ONLY_ACK_TIMEOUT_INSTANTS: 'inbound_silence_observed_only_at_ack_timeouts',
  WINDOW_NOT_COVERED: 'samples_do_not_cover_the_sustained_window',
});

const THRESHOLD_SOURCE = Object.freeze({
  OWNER_CONSTANT: 'owner constant',
  RUN_BASELINE: 'run baseline',
  KERNEL_COUNTER: 'kernel counter',
  JUDGMENT: 'judgment',
});

const SATURATION_RATIO = 0.9;
const PERCENT = 100;

const RUN_HEALTH_THRESHOLD_TABLE = Object.freeze([
  Object.freeze({
    name: 'saturationRatio',
    value: SATURATION_RATIO,
    unit: 'share of capacity',
    source: THRESHOLD_SOURCE.JUDGMENT,
    justification: 'One shared ratio for "at capacity": a node process is one event-loop ' +
      'thread, so 90 % of one core (container CPU), 0.9 event-loop utilisation and a ' +
      'working set at 90 % of the container memory limit all mean under 10 % headroom. ' +
      'No owner defines a saturation ratio; this is the unit\'s one capacity judgment.',
  }),
  Object.freeze({
    name: 'sustainedWindowMs',
    value: TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS,
    unit: 'ms',
    source: THRESHOLD_SOURCE.OWNER_CONSTANT,
    justification: 'TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS: the span ' +
      'the router itself tolerates a slow-not-dead peer. Saturation shorter than this is ' +
      'absorbed by the product\'s own tolerance; longer is "sustained".',
  }),
  Object.freeze({
    name: 'hostCpuContentionRatio',
    value: Number((1 - SATURATION_RATIO).toFixed(2)),
    unit: 'share of machine CPU time',
    source: THRESHOLD_SOURCE.JUDGMENT,
    justification: '1 - saturationRatio: steal plus iowait taking at least the headroom the ' +
      'saturation ratio leaves is enough for the machine, not the node, to push a node ' +
      'to saturation.',
  }),
  Object.freeze({
    name: 'eventLoopDelayMs',
    value: WATCHDOG_DEFAULT.THRESHOLD_MS,
    unit: 'ms',
    source: THRESHOLD_SOURCE.OWNER_CONSTANT,
    justification: 'WATCHDOG_DEFAULT.THRESHOLD_MS: the event-loop gap watchdog\'s own ' +
      'definition of a blocked loop, applied to its gap events and to the delay ' +
      'sampler\'s maximum.',
  }),
  Object.freeze({
    name: 'linkStallMs',
    value: TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS,
    unit: 'ms',
    source: THRESHOLD_SOURCE.OWNER_CONSTANT,
    justification: 'TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS: inbound silence for a whole default ' +
      'delivery bound means a message sent when the silence began can no longer be ' +
      'acknowledged in time.',
  }),
  Object.freeze({
    name: 'linkBacklogSustainedIntervals',
    value: Math.ceil(TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS / PEER_TRAFFIC_INTERVAL_MS),
    unit: 'consecutive peer-traffic intervals',
    source: THRESHOLD_SOURCE.OWNER_CONSTANT,
    justification: 'MESSAGE_TIMEOUT_MS / PEER_TRAFFIC_INTERVAL_MS: a socket backlog that ' +
      'does not drain for a whole delivery bound holds frames past their ACK deadline.',
  }),
  Object.freeze({
    name: 'latencyExcessBaselineRttMultiple',
    value: 1,
    unit: 'multiple of the baseline round-trip maximum',
    source: THRESHOLD_SOURCE.RUN_BASELINE,
    justification: 'One-way ACK/PONG latency above the link\'s own floor in this run (the ' +
      'floor absorbs clock skew between hosts) by more than a whole worst-case idle round ' +
      'trip measured by this run\'s link baseline.',
  }),
  Object.freeze({
    name: 'baselineCeilingMultiple',
    value: 1,
    unit: 'multiple of the baseline throughput',
    source: THRESHOLD_SOURCE.RUN_BASELINE,
    justification: 'A backlogged link is workload-limited when the product offered at least ' +
      'the larger of the pre- and post-run throughput estimates, and infrastructure-' +
      'limited when it offered less than the smaller one; in between is undetermined.',
  }),
  Object.freeze({
    name: 'tcpRetransmitRatio',
    value: 0.01,
    unit: 'retransmitted / sent segments',
    source: THRESHOLD_SOURCE.JUDGMENT,
    justification: 'Retransmitting 1 % of sent segments is the common operational line ' +
      'between a healthy and a lossy path. No owner or baseline defines one; when the ' +
      'link baseline measured a retransmit ratio, the run must also exceed that.',
  }),
  Object.freeze({
    name: 'thermalThrottleEvents',
    value: 1,
    unit: 'throttle events during the run',
    source: THRESHOLD_SOURCE.KERNEL_COUNTER,
    justification: 'Any increase of the kernel\'s thermal throttle counters during the run: ' +
      'the processor itself reports it reduced speed.',
  }),
  Object.freeze({
    name: 'pressureStallPercent',
    value: 0,
    unit: 'percent of the last 10 s all tasks were stalled (above)',
    source: THRESHOLD_SOURCE.KERNEL_COUNTER,
    justification: 'Any time in which the kernel reports every runnable task stalled on ' +
      'memory (PSI full): reclaim is costing the machine real time.',
  }),
]);

const RUN_HEALTH_THRESHOLD = Object.freeze(Object.fromEntries(
  arrayMap(RUN_HEALTH_THRESHOLD_TABLE, (entry) => [entry.name, entry.value])));

// The node log lines the classifier reads. Exported owner vocabulary is
// imported; the two messages their owners do not export are restated here
// and pinned to the owner source by the unit's vocabulary test.
const NODE_LOG_MESSAGE = Object.freeze({
  PEER_TRAFFIC: ROUTER_LOG_MSG.PEER_TRAFFIC,
  REMOTE_QUERY_SERVED: ROUTER_LOG_MSG.REMOTE_QUERY_SERVED,
  ACK_TIMEOUT_DETAIL: ROUTER_LOG_MSG.ACK_TIMEOUT_DETAIL,
  EVENT_LOOP_DELAY_SAMPLE: EVENT_LOOP_DELAY_SAMPLE_MESSAGE,
  EVENT_LOOP_GAP_DETECTED: 'Event loop gap detected',
  QUARANTINE_SKIPPED_PEER_ALIVE:
    'Skipping ACK-timeout quarantine: peer demonstrably alive (slow, not dead)',
});

const NODE_LOG_OWNER_SOURCE = Object.freeze({
  [NODE_LOG_MESSAGE.EVENT_LOOP_GAP_DETECTED]: 'src/diagnostics/event-loop-gap-watchdog.js',
  [NODE_LOG_MESSAGE.QUARANTINE_SKIPPED_PEER_ALIVE]:
    'src/transport/message-router-shared-vocabulary.js',
});

const NODE_LOG_FIELD = Object.freeze({
  WAIT_BOUND_SPENT_EVENT,
  ROUTER_MESSAGE_TIMEOUT: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
});

const RUN_HEALTH_ARTIFACT = Object.freeze({
  SAMPLES: 'samples.ndjson',
  LINK_BASELINE: 'link-baseline.json',
  JSON: 'run-health.json',
  MARKDOWN: 'run-health.md',
  FULL_LOG_DIRECTORY: '.full-logs',
  FULL_LOG_SUFFIX: '.log.gz',
  PLAYBACK_LOG_SUFFIX: '.log',
});

// The environment variable through which the lab adapter names the link
// baseline file of the run it starts.
const LINK_BASELINE_ENV = 'DISTRIBUTED_RUN_LINK_BASELINE';

export {
  ATTRIBUTION,
  HOST_FACT_STATE,
  INFRASTRUCTURE_SUSPECT,
  LINK_BASELINE_ENV,
  LINK_VERDICT,
  NODE_LOG_FIELD,
  NODE_LOG_MESSAGE,
  NODE_LOG_OWNER_SOURCE,
  NODE_VERDICT,
  PEER_TRAFFIC_INTERVAL_MS,
  PERCENT,
  RUN_HEALTH_ARTIFACT,
  RUN_HEALTH_SCHEMA_VERSION,
  RUN_HEALTH_THRESHOLD,
  RUN_HEALTH_THRESHOLD_TABLE,
  THRESHOLD_SOURCE,
  UNAVAILABLE_REASON,
  VERDICT_STATE,
};
