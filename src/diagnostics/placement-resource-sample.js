import {COLUMN} from '../constants/columns.js';

// Placement pressure is interval evidence. Host tick share, thread time and
// aggregate process time have distinct denominators.
export const PLACEMENT_RESOURCE_COLUMNS = Object.freeze({
  sampleIntervalMs: COLUMN.RESOURCE_SAMPLE_INTERVAL_MS,
  mainThreadCpuPercent: COLUMN.MAIN_THREAD_CPU_PERCENT,
  processCpuCores: COLUMN.PROCESS_CPU_CORES,
  effectiveCpuCores: COLUMN.EFFECTIVE_CPU_CORES,
  hostCpuUtilizationPercent: COLUMN.HOST_CPU_UTILIZATION_PERCENT,
  eventLoopUtilizationPercent: COLUMN.EVENT_LOOP_UTILIZATION_PERCENT,
  eventLoopDelayMs: COLUMN.EVENT_LOOP_DELAY_MS,
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
