#!/usr/bin/env node

/**
 * The one thermal owner for heavy runs: reads the CPU package and the NVMe
 * hot sensor and WAITS until both are under their hold thresholds, so
 * back-to-back runs cannot cook a machine. The classified test runner asks it
 * before every lane batch on every host it runs on, lab hosts included; the
 * CLI below serves the callers that are not runner runs (a formation, the
 * push hook's staging). When a commissioned native thermal endpoint is bound
 * in the environment (`LAGRANGE_NATIVE_THERMAL_ENDPOINT`), observation and
 * policy verification delegate to that endpoint's observer contract.
 *
 * Policy (session thermal policy, 2026-08-04): hold while CPU package
 * >= 75C (high 80, crit 100) OR NVMe Sensor 2 >= 78C - the NVMe is the
 * sensitive part. Polls every 30s up to 20 times, then reports the headroom
 * exhausted: a machine still hot after ten idle minutes has a problem a test
 * run should not pile onto.
 *
 * Every temperature comes from one ordered table of named sources, whatever
 * the vendor: lm-sensors (`sensors -j`) first, then the Linux sysfs, so a lab
 * host without lm-sensors installed is still measured. The reading names the
 * source that answered. A host that measures one of the two gates on that one;
 * a host with neither is unmeasurable - a typed outcome, printed, never silent
 * - and proceeds (CI runners must not be blocked). Skip explicitly with
 * LAGRANGE_SKIP_THERMAL_GATE=1.
 */

import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import process from 'node:process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

// Module-load intrinsic captures (adversarial-js-intrinsics guideline).
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const regExpExec = Function.call.bind(RegExp.prototype.exec);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const mathMin = Math.min;
const mathRound = Math.round;
const numberParseInt = Number.parseInt;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const dateNow = Date.now;
const atomicsWait = Atomics.wait;

const SENSORS_BINARY = 'sensors';
const SENSORS_JSON_FLAG = '-j';
const CPU_HOLD_CELSIUS = 75;
const NVME_HOLD_CELSIUS = 78;
const POLL_INTERVAL_MS = 30000;
const MS_PER_SECOND = 1000;
const MAX_POLL_ATTEMPTS = 20;
const SKIP_ENV = 'LAGRANGE_SKIP_THERMAL_GATE';
const THERMAL_ENDPOINT_ENV = 'LAGRANGE_NATIVE_THERMAL_ENDPOINT';
const THERMAL_DEADLINE_ENV = 'LAGRANGE_THERMAL_DEADLINE_MS';
const TEST_EXECUTION_CONTEXT_ENV = 'LAGRANGE_TEST_EXECUTION_CONTEXT';
const TEXT_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const SYS_ROOT = '/sys';
const SYSFS_THERMAL = 'class/thermal';
const SYSFS_ZONE_PREFIX = 'thermal_zone';
const SYSFS_ZONE_TYPE = 'type';
const SYSFS_ZONE_TEMP = 'temp';
const SYSFS_HWMON = 'class/hwmon';
const SYSFS_HWMON_NAME = 'name';
const SYSFS_TEMP_INPUT = /^temp(\d+)_input$/u;
const SYSFS_TEMP_PREFIX = 'temp';
const SYSFS_LABEL_SUFFIX = '_label';
const SYSFS_MILLIDEGREES = 1000;
// `sensors -j` names a chip `<driver>-<bus>-<address>`; its temperature
// inputs are `temp<N>_input` under a feature named by the chip's label.
const SENSORS_DRIVER = /^[^-]+/u;
const SENSORS_TEMP_INPUT = /^temp\d+_input$/u;
const SOURCE_SEPARATOR = '/';
const DECIMAL_RADIX = 10;
const INT32_BYTES = 4;
const THERMAL_REFUSAL_EXIT = 75;
const CLI_EXHAUSTED_EXIT = 1;
const NEWLINE = '\n';
const ENDPOINT_SCHEMA = 'native-thermal-endpoint/v1';
const OBSERVATION_SCHEMA = 'lab3-thermal-observation/v1';
const SENSOR_REQUIRED = 'sensor-required';
const OPERATOR_PACED = 'operator-paced';
const NATIVE_OBSERVER_TIMEOUT_MS = 5000;
const NATIVE_OBSERVER_OUTPUT_BYTES = 65536;
const NATIVE_POLL_MS = 5000;
const NATIVE_POLICY_KEY_COUNT = 3;
const NATIVE_OPERATOR_MAX_CONCURRENCY = 1;
const NATIVE_UNAVAILABLE_EXIT = 2;
const NATIVE_OK_EXIT = 0;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const ENDPOINT_PATH_KEYS = objectFreeze(['python', 'entry', 'config']);
const OBSERVATION_REASON_KEYS = objectFreeze(['cooling_reason', 'abort_reason', 'reason']);
const OBSERVATION_SENSOR_KEYS = objectFreeze(['cpu', 'ssd']);
const POLICY_MODES = objectFreeze([SENSOR_REQUIRED, OPERATOR_PACED]);
const PYTHON_ISOLATED_FLAGS = objectFreeze(['-E', '-s', '-B']);
const THERMAL_OBSERVE_COMMAND = 'thermal-observe';
const CONFIG_FLAG = '--config';
const SIGKILL = 'SIGKILL';
const STDIO_IGNORE_PIPE = objectFreeze(['ignore', 'pipe', 'pipe']);
const EVENT_DATA = 'data';
const EVENT_ERROR = 'error';
const EVENT_CLOSE = 'close';
const NATIVE_REASON = objectFreeze({
  INVALID_ENDPOINT: 'invalid native thermal endpoint',
  CONTRACT_REFUSED: 'native observation identity or contract refused',
  TIMED_OUT: 'native thermal observation timed out',
  OUTPUT_EXCEEDED: 'native thermal observation output exceeded bound',
  INVALID_DEADLINE: 'missing or invalid owned thermal deadline',
  ADMISSION_CANCELLED: 'thermal admission cancelled',
  DEADLINE_EXPIRED: 'owned execution deadline expired',
  ENDPOINT_BYTES_CHANGED: 'native thermal endpoint bytes changed',
  EXHAUSTED_DEADLINE: 'cancelled or owned deadline expired',
});

// Where a reading comes from.
const ORIGIN = objectFreeze({
  SENSORS: 'sensors', THERMAL_ZONE: 'thermal_zone', HWMON: 'hwmon',
});
// Which driver (lm-sensors chip, hwmon name or thermal zone) a source reads.
const DRIVER = objectFreeze({
  CORETEMP: 'coretemp', K10TEMP: 'k10temp', NVME: 'nvme', THERMAL_ZONE: 'thermal_zone',
});
// A device without its preferred input answers with nothing, or with the
// hottest of its temperature inputs.
const FALLBACK = objectFreeze({NONE: 'none', HOTTEST: 'hottest'});
const PACKAGE_LABEL = /^Package id \d+$/u;
const AMD_PACKAGE_LABEL = /^(?:Tctl|Tdie)$/u;
// The CPU package zone on x86, and the SoC zone on ARM boards.
const CPU_ZONE_TYPE = /^(?:x86_pkg_temp|cpu-thermal)$/u;
// What the NVMe threshold was set against.
const NVME_LABEL = /^Sensor 2$/u;
// Every place a temperature is read, in the order asked: the first source
// that answers is the reading, and it is named in the line. Within a source,
// each device answers with its preferred input (or, where the source falls
// back, its hottest input) and the hottest device answers for the source.
const CPU_SOURCES = objectFreeze([
  objectFreeze({origin: ORIGIN.SENSORS, driver: DRIVER.CORETEMP, label: PACKAGE_LABEL,
    fallback: FALLBACK.NONE}),
  objectFreeze({origin: ORIGIN.SENSORS, driver: DRIVER.K10TEMP, label: AMD_PACKAGE_LABEL,
    fallback: FALLBACK.NONE}),
  objectFreeze({origin: ORIGIN.THERMAL_ZONE, driver: DRIVER.THERMAL_ZONE, label: CPU_ZONE_TYPE,
    fallback: FALLBACK.NONE}),
  objectFreeze({origin: ORIGIN.HWMON, driver: DRIVER.K10TEMP, label: AMD_PACKAGE_LABEL,
    fallback: FALLBACK.HOTTEST}),
  objectFreeze({origin: ORIGIN.HWMON, driver: DRIVER.CORETEMP, label: PACKAGE_LABEL,
    fallback: FALLBACK.HOTTEST}),
]);
const NVME_SOURCES = objectFreeze([
  objectFreeze({origin: ORIGIN.SENSORS, driver: DRIVER.NVME, label: NVME_LABEL,
    fallback: FALLBACK.HOTTEST}),
  objectFreeze({origin: ORIGIN.HWMON, driver: DRIVER.NVME, label: NVME_LABEL,
    fallback: FALLBACK.HOTTEST}),
]);

// What a reading is. `skipped` is never read: it stands for the one skip.
const THERMAL_STATE = objectFreeze({
  OK: 'ok', HOLD: 'hold', UNMEASURABLE: 'unmeasurable', SKIPPED: 'skipped',
});
const HEADROOM = objectFreeze({
  OK: 'headroom-ok',
  UNMEASURABLE: 'headroom-unmeasurable',
  EXHAUSTED: 'headroom-exhausted',
  SKIPPED: 'headroom-skipped',
  READY: 'READY',
  HOLD: 'HOLD',
  UNAVAILABLE: 'UNAVAILABLE',
  OPERATOR_PACED: 'OPERATOR_PACED',
});
const NATIVE_OUTCOMES = objectFreeze([
  HEADROOM.READY, HEADROOM.HOLD, HEADROOM.UNAVAILABLE,
]);
// The outcome the last reading of a wait decides: a hold still standing once
// every poll is spent is exhausted headroom.
const HEADROOM_OF_STATE = objectFreeze({
  [THERMAL_STATE.OK]: HEADROOM.OK,
  [THERMAL_STATE.UNMEASURABLE]: HEADROOM.UNMEASURABLE,
  [THERMAL_STATE.HOLD]: HEADROOM.EXHAUSTED,
  [THERMAL_STATE.SKIPPED]: HEADROOM.SKIPPED,
});
// The runner's typed refusal when the headroom is exhausted, and the one
// line that names it in any stream a placed run relays.
const THERMAL_REFUSAL = 'thermal-headroom-exhausted';
const THERMAL_REFUSAL_LINE = /^thermal: thermal-headroom-exhausted\b/u;
const REASON = objectFreeze({
  OK: 'under the hold thresholds',
  UNMEASURABLE: 'no sensors',
  SKIPPED: `${SKIP_ENV} set`,
});
const LINE = objectFreeze({
  PREFIX: 'thermal: ',
});
// A temperature no source answered for.
const UNMEASURED = 'unmeasured';
const NOT_MEASURED = objectFreeze({celsius: null, source: UNMEASURED});
const SKIPPED_READING = objectFreeze({state: THERMAL_STATE.SKIPPED,
  cpuCelsius: null, cpuSource: UNMEASURED, nvmeCelsius: null, nvmeSource: UNMEASURED,
  reason: REASON.SKIPPED});

function readSensorsJson() {
  const result = spawnSync(
    SENSORS_BINARY, [SENSORS_JSON_FLAG], {encoding: TEXT_ENCODING});
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object';
}

function appendReading(readings, reading) {
  readings[readings.length] = reading;
}

// Every temperature input of a `sensors -j` document, in one shape.
function sensorsReadings(parsed) {
  const readings = [];
  if (!isRecord(parsed)) return readings;
  const chips = objectKeys(parsed);
  for (let chipIndex = 0; chipIndex < chips.length; chipIndex += 1) {
    const device = chips[chipIndex];
    const features = parsed[device];
    if (!isRecord(features)) continue;
    const driver = regExpExec(SENSORS_DRIVER, device)?.[0] ?? device;
    const labels = objectKeys(features);
    for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      const label = labels[labelIndex];
      const values = isRecord(features[label]) ? features[label] : {};
      const keys = objectKeys(values);
      for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const celsius = values[keys[keyIndex]];
        if (regExpExec(SENSORS_TEMP_INPUT, keys[keyIndex]) && typeof celsius === 'number') {
          appendReading(readings, {device, driver, label, celsius});
        }
      }
    }
  }
  return readings;
}

// A sysfs file's text, or null when it cannot be read (absent, or a sensor
// that answers ENODATA).
function readSysText(file) {
  try {
    return stringTrim(fs.readFileSync(file, TEXT_ENCODING));
  } catch {
    return null;
  }
}

function sysEntries(directory) {
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

function millidegrees(text) {
  const value = numberParseInt(text ?? '', DECIMAL_RADIX);
  return numberIsFinite(value) ? value / SYSFS_MILLIDEGREES : null;
}

// Every thermal zone, labelled by its type.
function thermalZoneReadings(sysRoot) {
  const readings = [];
  const base = path.join(sysRoot, SYSFS_THERMAL);
  const zones = sysEntries(base);
  for (let index = 0; index < zones.length; index += 1) {
    const device = zones[index];
    if (!stringStartsWith(device, SYSFS_ZONE_PREFIX)) continue;
    const celsius = millidegrees(readSysText(path.join(base, device, SYSFS_ZONE_TEMP)));
    const label = readSysText(path.join(base, device, SYSFS_ZONE_TYPE));
    if (celsius !== null && label !== null) {
      appendReading(readings, {device, driver: DRIVER.THERMAL_ZONE, label, celsius});
    }
  }
  return readings;
}

// Every hwmon temperature input, labelled as lm-sensors labels it, or by its
// own name where the driver gives no label.
function hwmonReadings(sysRoot) {
  const readings = [];
  const base = path.join(sysRoot, SYSFS_HWMON);
  const devices = sysEntries(base);
  for (let deviceIndex = 0; deviceIndex < devices.length; deviceIndex += 1) {
    const device = devices[deviceIndex];
    const directory = path.join(base, device);
    const driver = readSysText(path.join(directory, SYSFS_HWMON_NAME));
    const entries = sysEntries(directory);
    for (let index = 0; index < entries.length; index += 1) {
      const input = regExpExec(SYSFS_TEMP_INPUT, entries[index]);
      const celsius = input ? millidegrees(readSysText(path.join(directory, entries[index]))) :
        null;
      if (driver === null || celsius === null) continue;
      const name = `${SYSFS_TEMP_PREFIX}${input[1]}`;
      const label = readSysText(path.join(directory, `${name}${SYSFS_LABEL_SUFFIX}`)) ?? name;
      appendReading(readings, {device, driver, label, celsius});
    }
  }
  return readings;
}

// Each origin's readings, collected once per reading and only when asked.
function readingCollector(sensors, sysRoot) {
  const collected = objectCreate(null);
  const collectors = {
    [ORIGIN.SENSORS]: () => sensorsReadings(sensors()),
    [ORIGIN.THERMAL_ZONE]: () => thermalZoneReadings(sysRoot),
    [ORIGIN.HWMON]: () => hwmonReadings(sysRoot),
  };
  return (origin) => {
    if (!objectHasOwn(collected, origin)) collected[origin] = collectors[origin]();
    return collected[origin];
  };
}

function hotter(current, candidate) {
  return candidate.celsius !== null &&
    (current.celsius === null || candidate.celsius > current.celsius) ? candidate : current;
}

// One source's answer over its readings: per device the preferred input or,
// where the source falls back, the hottest; then the hottest device.
function sourceAnswer(source, readings) {
  const devices = objectCreate(null);
  const order = [];
  for (let index = 0; index < readings.length; index += 1) {
    const reading = readings[index];
    if (reading.driver !== source.driver) continue;
    if (!objectHasOwn(devices, reading.device)) {
      devices[reading.device] = {preferred: NOT_MEASURED, hottest: NOT_MEASURED};
      order[order.length] = reading.device;
    }
    const device = devices[reading.device];
    const named = {celsius: reading.celsius,
      source: `${reading.driver}${SOURCE_SEPARATOR}${reading.label}`};
    if (regExpExec(source.label, reading.label)) device.preferred = hotter(device.preferred, named);
    device.hottest = hotter(device.hottest, named);
  }
  let answer = NOT_MEASURED;
  for (let index = 0; index < order.length; index += 1) {
    const device = devices[order[index]];
    const fallsBack = device.preferred.celsius === null && source.fallback === FALLBACK.HOTTEST;
    answer = hotter(answer, fallsBack ? device.hottest : device.preferred);
  }
  return answer;
}

function firstAnswer(sources, readingsOf) {
  for (let index = 0; index < sources.length; index += 1) {
    const answer = sourceAnswer(sources[index], readingsOf(sources[index].origin));
    if (answer.celsius !== null) return answer;
  }
  return NOT_MEASURED;
}

function degrees(celsius) {
  return `${mathRound(celsius)}C`;
}

function holdReason({cpuCelsius, nvmeCelsius}) {
  if (cpuCelsius !== null && cpuCelsius >= CPU_HOLD_CELSIUS) {
    return `CPU package ${degrees(cpuCelsius)} >= ${CPU_HOLD_CELSIUS}C`;
  }
  if (nvmeCelsius !== null && nvmeCelsius >= NVME_HOLD_CELSIUS) {
    return `NVMe ${degrees(nvmeCelsius)} >= ${NVME_HOLD_CELSIUS}C`;
  }
  return REASON.OK;
}

function unavailable(reason) {
  return {outcome: HEADROOM.UNAVAILABLE, reason, execution_policy: null};
}

export function parseThermalEndpoint(text) {
  const value = JSON.parse(text);
  const validPaths = arrayEvery(ENDPOINT_PATH_KEYS, (key) =>
    typeof value?.[key] === 'string' && path.isAbsolute(value[key]));
  if (value?.schema !== ENDPOINT_SCHEMA || !validPaths ||
      !regExpTest(DIGEST_PATTERN, value.sourceSha256) ||
      !regExpTest(DIGEST_PATTERN, value.configSha256) ||
      typeof value.bootId !== 'string' || value.bootId.length === 0) {
    throw new Error(NATIVE_REASON.INVALID_ENDPOINT);
  }
  return value;
}

function fileDigest(file) {
  return createHash(HASH_ALGORITHM).update(fs.readFileSync(file)).digest(HASH_ENCODING);
}

function policyValid(policy) {
  if (!isRecord(policy) || !arrayIncludes(POLICY_MODES, policy.mode)) return false;
  if (!numberIsSafeInteger(policy.cadence_ms) || policy.cadence_ms < 0) return false;
  if (!numberIsSafeInteger(policy.max_concurrency) || policy.max_concurrency <= 0) return false;
  if (objectKeys(policy).length !== NATIVE_POLICY_KEY_COUNT) return false;
  return policy.mode !== OPERATOR_PACED ||
    (policy.cadence_ms === NATIVE_POLL_MS &&
      policy.max_concurrency === NATIVE_OPERATOR_MAX_CONCURRENCY);
}

export function thermalPermits(result) {
  return result?.outcome === HEADROOM.READY || result?.outcome === HEADROOM.OPERATOR_PACED;
}

function observationSensorRowValid(row) {
  return isRecord(row) && numberIsSafeInteger(row.millidegrees) &&
    typeof row.path === 'string' && path.isAbsolute(row.path);
}

function observationShape(value) {
  if (!numberIsSafeInteger(value.observed_at) || value.observed_at < 0) return false;
  const reasonsValid = arrayEvery(OBSERVATION_REASON_KEYS, (key) =>
    value[key] === null || typeof value[key] === 'string');
  if (!reasonsValid) return false;
  if (value.outcome === HEADROOM.UNAVAILABLE) {
    return value.observations === null && typeof value.reason === 'string' &&
      value.reason.length > 0 && value.cooling_reason === null && value.abort_reason === null;
  }
  const observations = value.observations;
  if (!isRecord(observations) || !arrayEvery(OBSERVATION_SENSOR_KEYS, (name) =>
    observationSensorRowValid(observations[name]))) {
    return false;
  }
  return value.reason === null && (value.outcome === HEADROOM.READY ?
    value.cooling_reason === null && value.abort_reason === null :
    typeof value.cooling_reason === 'string' && value.cooling_reason.length > 0);
}

export function checkedThermalObservation(value, endpoint, status) {
  const expectedStatus = value?.outcome === HEADROOM.UNAVAILABLE ?
    NATIVE_UNAVAILABLE_EXIT : NATIVE_OK_EXIT;
  if (value?.schema !== OBSERVATION_SCHEMA ||
      value.source_sha256 !== endpoint.sourceSha256 ||
      value.config_sha256 !== endpoint.configSha256 || value.boot_id !== endpoint.bootId ||
      !observationShape(value) || !policyValid(value.execution_policy) ||
      !arrayIncludes(NATIVE_OUTCOMES, value.outcome) || status !== expectedStatus) {
    return unavailable(NATIVE_REASON.CONTRACT_REFUSED);
  }
  if (value.execution_policy.mode === OPERATOR_PACED) {
    return {...value, outcome: HEADROOM.OPERATOR_PACED, observation_outcome: value.outcome};
  }
  return value;
}

function invokeNativeObserver(endpoint, timeout, signal) {
  return new Promise((resolve) => {
    let stdout = '';
    let bytes = 0;
    let problem = null;
    const args = [...PYTHON_ISOLATED_FLAGS, endpoint.entry, THERMAL_OBSERVE_COMMAND,
      CONFIG_FLAG, endpoint.config];
    const child = spawn(endpoint.python, args, {stdio: STDIO_IGNORE_PIPE, signal});
    const timer = setTimeout(() => {
      problem = NATIVE_REASON.TIMED_OUT;
      child.kill(SIGKILL);
    }, timeout);
    child.stdout.on(EVENT_DATA, (chunk) => {
      bytes += chunk.length;
      if (bytes > NATIVE_OBSERVER_OUTPUT_BYTES) {
        problem = NATIVE_REASON.OUTPUT_EXCEEDED;
        child.kill(SIGKILL);
      } else stdout += String(chunk);
    });
    child.stderr.on(EVENT_DATA, (chunk) => {
      bytes += chunk.length;
      if (bytes > NATIVE_OBSERVER_OUTPUT_BYTES) {
        problem = NATIVE_REASON.OUTPUT_EXCEEDED;
        child.kill(SIGKILL);
      }
    });
    child.on(EVENT_ERROR, (error) => {
      problem = error.message;
    });
    child.on(EVENT_CLOSE, (status, killedBy) => {
      clearTimeout(timer);
      if (problem || killedBy) resolve(unavailable(problem ?? `observer signal ${killedBy}`));
      else {
        try {
          resolve(checkedThermalObservation(JSON.parse(stdout), endpoint, status));
        } catch (error) {
          resolve(unavailable(`invalid native observation: ${error.message}`));
        }
      }
    });
  });
}

function nativeThermalDeadline(env) {
  const value = Number(env[THERMAL_DEADLINE_ENV]);
  if (!numberIsSafeInteger(value) || value <= 0) {
    throw new Error(NATIVE_REASON.INVALID_DEADLINE);
  }
  return performance.now() + value - dateNow();
}

async function readNativeThermalHeadroom({env = process.env, signal,
  deadline = performance.now() + NATIVE_OBSERVER_TIMEOUT_MS} = {}) {
  try {
    if (signal?.aborted) return unavailable(NATIVE_REASON.ADMISSION_CANCELLED);
    const remaining = deadline - performance.now();
    if (remaining <= 0) return unavailable(NATIVE_REASON.DEADLINE_EXPIRED);
    const endpoint = parseThermalEndpoint(env[THERMAL_ENDPOINT_ENV]);
    if (fileDigest(endpoint.entry) !== endpoint.sourceSha256 ||
        fileDigest(endpoint.config) !== endpoint.configSha256) {
      return unavailable(NATIVE_REASON.ENDPOINT_BYTES_CHANGED);
    }
    return await invokeNativeObserver(
      endpoint, mathMin(remaining, NATIVE_OBSERVER_TIMEOUT_MS), signal);
  } catch (error) {
    return unavailable(error.message);
  }
}

async function waitForNativeThermalHeadroom({env = process.env, signal,
  deadline = nativeThermalDeadline(env),
  read = () => readNativeThermalHeadroom({env, signal, deadline}),
  sleep = delay} = {}) {
  while (true) {
    if (signal?.aborted || performance.now() >= deadline) {
      return {outcome: HEADROOM.EXHAUSTED, reason: NATIVE_REASON.EXHAUSTED_DEADLINE};
    }
    const result = await read();
    if (result.outcome !== HEADROOM.HOLD) return result;
    try {
      await sleep(mathMin(NATIVE_POLL_MS, deadline - performance.now()), undefined, {signal});
    } catch (error) {
      return {outcome: HEADROOM.EXHAUSTED, reason: error.message};
    }
  }
}

/**
 * One reading of this host's thermal headroom, each temperature from the
 * first source in its table that answers, and named by it.
 * @param {{sensors?: Function, sysRoot?: string}} [sources] where readings
 *   come from: `sensors` returns the parsed `sensors -j` document or null
 * @return {{state: string, cpuCelsius: number|null, cpuSource: string,
 *   nvmeCelsius: number|null, nvmeSource: string, reason: string}}
 */
export function readThermalHeadroom({sensors = readSensorsJson, sysRoot = SYS_ROOT} = {}) {
  const readingsOf = readingCollector(sensors, sysRoot);
  const cpu = firstAnswer(CPU_SOURCES, readingsOf);
  const nvme = firstAnswer(NVME_SOURCES, readingsOf);
  const temperatures = {cpuCelsius: cpu.celsius, cpuSource: cpu.source,
    nvmeCelsius: nvme.celsius, nvmeSource: nvme.source};
  if (cpu.celsius === null && nvme.celsius === null) {
    return {state: THERMAL_STATE.UNMEASURABLE, ...temperatures, reason: REASON.UNMEASURABLE};
  }
  const reason = holdReason(temperatures);
  return {state: reason === REASON.OK ? THERMAL_STATE.OK : THERMAL_STATE.HOLD,
    ...temperatures, reason};
}

// Synchronous: the runner's lanes block, and a wait between them blocks too.
function sleepSync(ms) {
  atomicsWait(new Int32Array(new SharedArrayBuffer(INT32_BYTES)), 0, 0, ms);
}

function measuredText(celsius, source) {
  return celsius === null ? UNMEASURED : `${degrees(celsius)} (${source})`;
}

function readingText(reading) {
  return `cpu ${measuredText(reading.cpuCelsius, reading.cpuSource)} ` +
    `nvme ${measuredText(reading.nvmeCelsius, reading.nvmeSource)}`;
}

/**
 * Wait, bounded, for thermal headroom. A hold is logged and waited out with
 * the poll; the result is a named outcome, never an inference. When
 * `env[THERMAL_ENDPOINT_ENV]` is defined, runs the commissioned native thermal
 * endpoint wait loop and returns a Promise resolving to its observation.
 * @param {{poll?: number, attempts?: number, log?: Function, read?: Function,
 *   sleep?: Function, env?: Object, signal?: AbortSignal, deadline?: number}} [options]
 * @return {Object|Promise<Object>}
 */
export function waitForThermalHeadroom(options = {}) {
  const {poll = POLL_INTERVAL_MS, attempts = MAX_POLL_ATTEMPTS,
    log = () => {}, read = readThermalHeadroom, sleep = sleepSync,
    env = process.env} = options;
  if (env[THERMAL_ENDPOINT_ENV] !== undefined) {
    return waitForNativeThermalHeadroom(options);
  }
  let reading = env[SKIP_ENV] ? SKIPPED_READING : read();
  let polls = 0;
  while (reading.state === THERMAL_STATE.HOLD && polls < attempts) {
    polls += 1;
    log(`${LINE.PREFIX}${THERMAL_STATE.HOLD} ${readingText(reading)} - ${reading.reason}, ` +
      `waiting ${poll / MS_PER_SECOND}s (poll ${polls}/${attempts})`);
    sleep(poll);
    if (polls < attempts) reading = read();
  }
  return {outcome: HEADROOM_OF_STATE[reading.state], reading, attempts, poll};
}

/**
 * The one line a gate decision is reported with, for any stream.
 * @param {{outcome: string, reading: Object, attempts: number, poll: number}} result
 * @return {string}
 */
export function formatThermalOutcome({outcome, reading, attempts, poll}) {
  if (outcome === HEADROOM.OK) return `${LINE.PREFIX}${THERMAL_STATE.OK} ${readingText(reading)}`;
  if (outcome === HEADROOM.EXHAUSTED) {
    return `${LINE.PREFIX}${THERMAL_REFUSAL} - still over the hold threshold after ` +
      `${attempts} polls of ${poll / MS_PER_SECOND}s: ${reading.reason}`;
  }
  return `${LINE.PREFIX}${reading.state} (${reading.reason})`;
}

export {
  HEADROOM,
  SKIP_ENV as THERMAL_SKIP_ENV,
  TEST_EXECUTION_CONTEXT_ENV,
  THERMAL_DEADLINE_ENV,
  THERMAL_ENDPOINT_ENV,
  THERMAL_REFUSAL,
  THERMAL_REFUSAL_EXIT,
  THERMAL_REFUSAL_LINE,
};

// It takes no argument: anything given is refused, never waited on.
const USAGE_LINE = 'usage: node scripts/checks/wait-for-thermal-headroom.js ' +
  `(no arguments; ${SKIP_ENV}=1 skips)`;
const CLI_USAGE_EXIT = 2;

function main() {
  if (process.argv.length > 2) {
    process.stderr.write(`unknown argument ${process.argv[2]}${NEWLINE}${USAGE_LINE}${NEWLINE}`);
    process.exitCode = CLI_USAGE_EXIT;
    return;
  }
  const result = waitForThermalHeadroom({
    log: (line) => process.stdout.write(`${line}${NEWLINE}`),
  });
  process.stdout.write(`${formatThermalOutcome(result)}${NEWLINE}`);
  if (result.outcome === HEADROOM.EXHAUSTED) process.exitCode = CLI_EXHAUSTED_EXIT;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
