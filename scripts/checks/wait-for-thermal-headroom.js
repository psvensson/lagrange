#!/usr/bin/env node

/**
 * Thermal staging gate for heavy runs (the long test corpus, live demo
 * lanes): reads lm-sensors and WAITS until the CPU package and the NVMe
 * hot sensor are under their hold thresholds before letting the heavy
 * stage start, so back-to-back gate runs cannot cook the machine.
 *
 * Policy (session thermal policy, 2026-08-04): hold while CPU package
 * >= 75C (high 80, crit 100) OR NVMe Sensor 2 >= 78C - the NVMe is the
 * sensitive part. Polls every 30s for up to 10 minutes, then aborts
 * non-zero: a machine still hot after ten idle minutes has a problem a
 * test run should not pile onto.
 *
 * Fail-open by design when `sensors -j` is unavailable or unparseable
 * (CI runners without lm-sensors must not be blocked); skip explicitly
 * with LAGRANGE_SKIP_THERMAL_GATE=1.
 */

import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {setTimeout as sleep} from 'node:timers/promises';

// Module-load intrinsic captures (adversarial-js-intrinsics guideline).
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const SENSORS_BINARY = 'sensors';
const SENSORS_JSON_FLAG = '-j';
const CPU_HOLD_CELSIUS = 75;
const NVME_HOLD_CELSIUS = 78;
const POLL_INTERVAL_MS = 30000;
const MAX_POLL_ATTEMPTS = 20;
const SKIP_ENV = 'LAGRANGE_SKIP_THERMAL_GATE';
const CPU_LABEL_FRAGMENT = 'Package id';
const NVME_CHIP_FRAGMENT = 'nvme';
const NVME_LABEL_FRAGMENT = 'Sensor 2';
const INPUT_KEY_SUFFIX = '_input';
const TEXT_ENCODING = 'utf8';
const MSG_SENSORS_UNAVAILABLE =
  'thermal-gate: sensors unavailable - proceeding (fail-open)\n';
const MSG_ABORT =
  'thermal-gate: still over the hold threshold after 10 minutes - ' +
  'aborting the heavy stage (investigate cooling before rerunning; ' +
  `bypass: ${SKIP_ENV}=1)\n`;

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

function* sensorReadings(parsed) {
  for (const [chipName, chipEntries] of Object.entries(parsed)) {
    if (!chipEntries || typeof chipEntries !== 'object') {
      continue;
    }
    for (const [label, values] of Object.entries(chipEntries)) {
      if (!values || typeof values !== 'object') {
        continue;
      }
      for (const [key, value] of Object.entries(values)) {
        if (stringEndsWith(key, INPUT_KEY_SUFFIX) &&
            typeof value === 'number') {
          yield {chipName, label, value};
        }
      }
    }
  }
}

function maxCelsius(current, candidate) {
  return current === null || candidate > current ? candidate : current;
}

function readTemperatures() {
  const parsed = readSensorsJson();
  if (parsed === null) {
    return null;
  }
  let cpuCelsius = null;
  let nvmeCelsius = null;
  for (const reading of sensorReadings(parsed)) {
    if (stringStartsWith(reading.label, CPU_LABEL_FRAGMENT)) {
      cpuCelsius = maxCelsius(cpuCelsius, reading.value);
    }
    if (stringStartsWith(reading.chipName, NVME_CHIP_FRAGMENT) &&
        reading.label === NVME_LABEL_FRAGMENT) {
      nvmeCelsius = maxCelsius(nvmeCelsius, reading.value);
    }
  }
  if (cpuCelsius === null && nvmeCelsius === null) {
    return null;
  }
  return {cpuCelsius, nvmeCelsius};
}

// Headroom is a NAMED outcome (guidelines 4.5: raw null must not encode
// runtime state on a semantic decision boundary).
const HEADROOM_OK = null;

function holdReason(temperatures) {
  if (temperatures.cpuCelsius !== null &&
      temperatures.cpuCelsius >= CPU_HOLD_CELSIUS) {
    return `CPU package ${temperatures.cpuCelsius}C >= ${CPU_HOLD_CELSIUS}C`;
  }
  if (temperatures.nvmeCelsius !== null &&
      temperatures.nvmeCelsius >= NVME_HOLD_CELSIUS) {
    return `NVMe ${temperatures.nvmeCelsius}C >= ${NVME_HOLD_CELSIUS}C`;
  }
  return HEADROOM_OK;
}

async function main() {
  if (process.env[SKIP_ENV]) {
    process.stdout.write(
      `thermal-gate: ${SKIP_ENV} set - skipping\n`);
    return;
  }
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const temperatures = readTemperatures();
    if (temperatures === null) {
      process.stdout.write(MSG_SENSORS_UNAVAILABLE);
      return;
    }
    const reason = holdReason(temperatures);
    if (reason === HEADROOM_OK) {
      process.stdout.write(
        `thermal-gate: headroom OK (cpu ${temperatures.cpuCelsius}C, ` +
          `nvme ${temperatures.nvmeCelsius}C)\n`);
      return;
    }
    process.stdout.write(
      `thermal-gate: holding - ${reason} ` +
        `(poll ${attempt + 1}/${MAX_POLL_ATTEMPTS}, 30s)\n`);
    await sleep(POLL_INTERVAL_MS);
  }
  process.stdout.write(MSG_ABORT);
  process.exit(1);
}

await main();
