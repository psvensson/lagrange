import {readFile, statfs} from 'node:fs/promises';
import os from 'node:os';

const DECIMAL_COUNTER = /^(?:0|[1-9][0-9]*)$/u;
const MILLISECONDS_PER_SECOND = 1_000;
const MINIMUM_HEADROOM_RATIO = 0.02;
const NETWORK_TRANSMIT_FIELD_INDEX = 8;
const SHARED_NETWORK_BYTES_PER_SECOND = 125_000_000;
const arraySplit = Function.call.bind(String.prototype.split);
const mathMax = Math.max;
const mathMin = Math.min;
const numberConstructor = Number;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringTrim = Function.call.bind(String.prototype.trim);
const localText = Object.freeze({
  HEADROOM_HOST_CPU: 'host CPU',
  HEADROOM_HOST_MEMORY: 'host memory',
  HEADROOM_OBSERVER_CPU: 'observer CPU',
  HEADROOM_SHARED_NETWORK: 'shared network',
  HEADROOM_SHARED_STORAGE: 'shared storage',
  NETWORK_COUNTER_INCOMPLETE: 'incomplete /proc/net/dev counters',
  NETWORK_COUNTER_MALFORMED: 'malformed /proc/net/dev counter',
  NETWORK_COUNTER_RANGE: 'out-of-range /proc/net/dev counter',
  NETWORK_COUNTER_TOTAL_RANGE:
    'out-of-range aggregate /proc/net/dev counter',
  NETWORK_DEVICE_FILE: '/proc/net/dev',
  NEWLINE: '\n',
  UTF8: 'utf8',
});

function fail(reason) {
  throw new Error(`benchmark comparator host observation failed: ${reason}`);
}

function networkCounter(value) {
  if (
    typeof value !== 'string' ||
    !regexpTest(DECIMAL_COUNTER, value)
  ) fail(localText.NETWORK_COUNTER_MALFORMED);
  const counter = numberConstructor(value);
  if (!numberIsSafeInteger(counter)) {
    fail(localText.NETWORK_COUNTER_RANGE);
  }
  return counter;
}

export function parseProcNetworkBytes(text) {
  let total = 0;
  const lines = arraySplit(text, localText.NEWLINE);
  for (let lineIndex = 2; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const separator = stringIndexOf(line, ':');
    if (separator < 0) continue;
    const fields = arraySplit(
      stringTrim(stringSlice(line, separator + 1)),
      /\s+/u,
    );
    if (fields.length <= NETWORK_TRANSMIT_FIELD_INDEX) {
      fail(localText.NETWORK_COUNTER_INCOMPLETE);
    }
    total +=
      networkCounter(fields[0]) +
      networkCounter(fields[NETWORK_TRANSMIT_FIELD_INDEX]);
    if (!numberIsSafeInteger(total)) {
      fail(localText.NETWORK_COUNTER_TOTAL_RANGE);
    }
  }
  return total;
}

async function networkBytes() {
  return parseProcNetworkBytes(
    await readFile(localText.NETWORK_DEVICE_FILE, localText.UTF8),
  );
}

export async function observeBenchmarkComparatorHost(directory) {
  const filesystem = await statfs(directory);
  return {
    cpu: process.cpuUsage(),
    load: os.loadavg()[0],
    freeMemory: os.freemem(),
    networkBytes: await networkBytes(),
    storageCapacity: filesystem.blocks * filesystem.bsize,
    storageAvailable: filesystem.bavail * filesystem.bsize,
  };
}

function boundedMeasurement(capacity, observedPeak, name) {
  if (
    !numberIsFinite(capacity) ||
    capacity <= 0 ||
    !numberIsFinite(observedPeak) ||
    observedPeak < 0 ||
    observedPeak > capacity
  ) {
    fail(
      `${name} capacity exceeded ` +
      `(capacity=${capacity}, observedPeak=${observedPeak})`,
    );
  }
  return {capacity, observedPeak};
}

export function benchmarkComparatorHostHeadroom(start, end, durationMs) {
  const cpuCount = os.cpus().length;
  const totalMemory = os.totalmem();
  const observerCpu =
    end.cpu.user + end.cpu.system - start.cpu.user - start.cpu.system;
  const networkDelta = end.networkBytes - start.networkBytes;
  return {
    minimumRequiredRatio: MINIMUM_HEADROOM_RATIO,
    observerCpu: boundedMeasurement(
      durationMs * MILLISECONDS_PER_SECOND * cpuCount,
      observerCpu,
      localText.HEADROOM_OBSERVER_CPU,
    ),
    hostCpu: boundedMeasurement(
      cpuCount,
      mathMax(start.load, end.load),
      localText.HEADROOM_HOST_CPU,
    ),
    hostMemory: boundedMeasurement(
      totalMemory,
      mathMax(
        totalMemory - start.freeMemory,
        totalMemory - end.freeMemory,
      ),
      localText.HEADROOM_HOST_MEMORY,
    ),
    sharedNetwork: boundedMeasurement(
      SHARED_NETWORK_BYTES_PER_SECOND *
        durationMs / MILLISECONDS_PER_SECOND,
      networkDelta,
      localText.HEADROOM_SHARED_NETWORK,
    ),
    sharedStorage: boundedMeasurement(
      mathMin(start.storageCapacity, end.storageCapacity),
      mathMax(
        start.storageCapacity - start.storageAvailable,
        end.storageCapacity - end.storageAvailable,
      ),
      localText.HEADROOM_SHARED_STORAGE,
    ),
  };
}
