import {COLUMN} from '../constants/columns.js';

// Placement pressure is interval evidence. Host tick share, thread time and
// aggregate process time have distinct denominators.
export const PLACEMENT_RESOURCE_COLUMNS = Object.freeze({
  sampleIntervalMs: 'resource_sample_interval_ms',
  mainThreadCpuPercent: 'main_thread_cpu_percent',
  processCpuCores: 'process_cpu_cores',
  effectiveCpuCores: 'effective_cpu_cores',
  hostCpuUtilizationPercent: COLUMN.HOST_CPU_UTILIZATION_PERCENT,
  eventLoopUtilizationPercent: 'event_loop_utilization_percent',
  eventLoopDelayMs: 'event_loop_delay_ms',
});

export function resourceSampleFields(source) {
  return Object.fromEntries(Object.keys(PLACEMENT_RESOURCE_COLUMNS).map((key) => [
    key, Number.isFinite(source?.[key]) ? source[key] : null,
  ]));
}

export function encodeResourceSample(sample) {
  return Object.fromEntries(Object.entries(PLACEMENT_RESOURCE_COLUMNS).map(([key, column]) => [
    column, sample?.[key] ?? null,
  ]));
}

export function decodeResourceSample(row) {
  return Object.fromEntries(Object.entries(PLACEMENT_RESOURCE_COLUMNS).map(([key, column]) => [
    key, Number.isFinite(row[column]) ? row[column] : null,
  ]));
}
