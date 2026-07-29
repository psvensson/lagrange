import {
  BENCHMARK_CAPACITY_PHASE,
} from '../../test/distributed/harness/benchmark-capacity-protocol-constants.js';
import {
  getBenchmarkCapacitySamplingWindow,
} from '../../test/distributed/harness/benchmark-capacity-preregistration.js';

const LOW_OFFERED_LOAD_PER_SECOND = 100;
const HIGH_OFFERED_LOAD_PER_SECOND = 160;
const WARMUP_MS = 100;
const MEASURED_MS = 1_000;

export function liveWindows() {
  return [
    {
      offeredLoadPerSecond: LOW_OFFERED_LOAD_PER_SECOND,
      warmupMs: WARMUP_MS,
      measuredMs: MEASURED_MS,
    },
    {
      offeredLoadPerSecond: HIGH_OFFERED_LOAD_PER_SECOND,
      warmupMs: WARMUP_MS,
      measuredMs: MEASURED_MS,
    },
  ];
}

export function liveDuration(sealed, offeredLoadPerSecond, phase) {
  const samplingWindow = getBenchmarkCapacitySamplingWindow(
    sealed,
    offeredLoadPerSecond,
  );
  return phase === BENCHMARK_CAPACITY_PHASE.WARMUP ?
    samplingWindow.warmupMs :
    samplingWindow.measuredMs;
}
