/**
 * Periodic event-loop delay and utilisation sample.
 *
 * The gap watchdog reports single heartbeats that arrive late by more than
 * its threshold. This sampler describes the loop between those events: the
 * p50/p99/max scheduling delay measured by perf_hooks.monitorEventLoopDelay
 * and the event-loop utilisation, one console-only line per interval. It is
 * carried by the watchdog's periodic diagnostics tick and arms no timer of
 * its own beyond the histogram's internal, unreferenced sampling timer.
 */

import {monitorEventLoopDelay, performance} from 'node:perf_hooks';
import {
  registerPeriodicDiagnosticsReporter,
} from './periodic-diagnostics-reporters.js';
import {sharedNodeHealthBuffer} from './node-health-buffer.js';

const EVENT_LOOP_DELAY_SAMPLE_MESSAGE = 'Event loop delay sample';
const EVENT_LOOP_DELAY_SAMPLE_INTERVAL_MS = 10000;
const EVENT_LOOP_DELAY_RESOLUTION_MS = 20;
const NANOSECONDS_PER_MILLISECOND = 1e6;
const MEDIAN_PERCENTILE = 50;
const TAIL_PERCENTILE = 99;
const UTILIZATION_DECIMALS = 4;
const DELAY_DECIMALS = 2;

function toMilliseconds(nanoseconds) {
  return Number((nanoseconds / NANOSECONDS_PER_MILLISECOND).toFixed(DELAY_DECIMALS));
}

/**
 * Build one sample from the histogram and the utilisation delta.
 * @param {Object} histogram - A monitorEventLoopDelay histogram (or a stand-in
 *   with the same percentile/max/mean/count readers).
 * @param {Object} utilization - performance.eventLoopUtilization delta.
 * @param {number} intervalMs - Wall time the sample covers.
 * @return {Object} The line's context.
 */
function buildEventLoopDelaySample(histogram, utilization, intervalMs) {
  return {
    intervalMs,
    delayP50Ms: toMilliseconds(histogram.percentile(MEDIAN_PERCENTILE)),
    delayP99Ms: toMilliseconds(histogram.percentile(TAIL_PERCENTILE)),
    delayMaxMs: toMilliseconds(histogram.max),
    delayMeanMs: toMilliseconds(histogram.mean),
    delaySamples: histogram.count,
    resolutionMs: EVENT_LOOP_DELAY_RESOLUTION_MS,
    eventLoopUtilization:
      Number(utilization.utilization.toFixed(UTILIZATION_DECIMALS)),
  };
}

/**
 * Start sampling. Each interval's line is handed to `log`, the histogram is
 * reset, and the next interval starts.
 * The process's node health buffer rides the same start: it takes its tick
 * from the periodic diagnostics reporters for as long as sampling runs, and
 * keeps each delay sample this sampler builds.
 * @param {Function} log - (message, context) => void, a console-only sink.
 * @param {Object} [healthBuffer] - The node health buffer to feed.
 * @return {Function} Stop: disables the histogram and unregisters.
 */
function startEventLoopDelaySampling(log, healthBuffer = sharedNodeHealthBuffer) {
  const histogram = monitorEventLoopDelay({
    resolution: EVENT_LOOP_DELAY_RESOLUTION_MS,
  });
  histogram.enable();
  let lastSampleAtMs = null;
  let lastUtilization = performance.eventLoopUtilization();
  const unregisterHealthTick =
    registerPeriodicDiagnosticsReporter((nowMs) => healthBuffer.tick(nowMs));
  const unregister = registerPeriodicDiagnosticsReporter((nowMs) => {
    if (lastSampleAtMs === null) {
      lastSampleAtMs = nowMs;
      return;
    }
    const intervalMs = nowMs - lastSampleAtMs;
    if (intervalMs < EVENT_LOOP_DELAY_SAMPLE_INTERVAL_MS) {
      return;
    }
    lastSampleAtMs = nowMs;
    const utilization = performance.eventLoopUtilization(lastUtilization);
    lastUtilization = performance.eventLoopUtilization();
    const sample = buildEventLoopDelaySample(histogram, utilization, intervalMs);
    healthBuffer.recordEventLoopDelay(nowMs, sample);
    log(EVENT_LOOP_DELAY_SAMPLE_MESSAGE, sample);
    histogram.reset();
  });
  return () => {
    unregister();
    unregisterHealthTick();
    histogram.disable();
  };
}

export {
  EVENT_LOOP_DELAY_SAMPLE_MESSAGE,
  startEventLoopDelaySampling,
};
