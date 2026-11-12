/**
 * Vocabulary of a run's resource samples (samples.ndjson): the scope a
 * container's network counters describe and the typed reasons a sample field
 * has no reading. A field without a reading is never written as zero.
 *
 * This module imports nothing, so the Docker provider and the node handle
 * can name these states without loading the run-health classifier.
 */

// Typed reasons a resource sample field has no reading (samples.ndjson).
const SAMPLE_UNAVAILABLE_REASON = Object.freeze({
  // Docker reports no per-container network counters: the container has no
  // network namespace of its own (host networking, every multi-host run).
  CONTAINER_HAS_NO_NETWORK_NAMESPACE: 'container_has_no_network_namespace_of_its_own',
  PROVIDER_STATED_NO_COUNTER_SCOPE: 'provider_stated_no_network_counter_scope',
  CONTAINER_STATS_API_MISSING: 'container_stats_api_missing',
  CONTAINER_STATS_CAPTURE_FAILED: 'container_stats_capture_failed',
  PROCESS_DIAGNOSTICS_API_MISSING: 'process_diagnostics_api_missing',
  ADMIN_ENDPOINT_UNREACHABLE: 'admin_endpoint_unreachable',
  ADMIN_ENDPOINT_REFUSED_STATUS: 'admin_endpoint_refused_status',
  PROCESS_DIAGNOSTICS_INVALID: 'process_diagnostics_invalid',
  NODE_REPORTS_NO_HOST_FACTS: 'node_reports_no_host_facts',
  FIRST_READING: 'first_reading_has_no_delta',
  COUNTER_WENT_BACKWARDS: 'counter_went_backwards',
  NO_EXISTING_PROBE: 'no_existing_probe',
});

// The scope a container's Docker network counters describe.
const CONTAINER_NETWORK_COUNTER_SCOPE = Object.freeze({
  CONTAINER_NAMESPACE: 'container_network_namespace',
  NOT_REPORTED: 'not_reported_by_container_runtime',
});

export {CONTAINER_NETWORK_COUNTER_SCOPE, SAMPLE_UNAVAILABLE_REASON};
