#!/usr/bin/env node

// Thermal decisions belong to the commissioned native worker. This client
// verifies that owner's identity; it has no sensor discovery or temperature policy.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

export const THERMAL_ENDPOINT_ENV = 'LAGRANGE_NATIVE_THERMAL_ENDPOINT';
export const THERMAL_DEADLINE_ENV = 'LAGRANGE_THERMAL_DEADLINE_MS';
export const TEST_EXECUTION_CONTEXT_ENV = 'LAGRANGE_TEST_EXECUTION_CONTEXT';
export const THERMAL_REFUSAL = 'thermal-headroom-exhausted';
export const THERMAL_REFUSAL_EXIT = 75;
export const THERMAL_REFUSAL_LINE = /^thermal: thermal-headroom-exhausted\b/u;
export const HEADROOM = Object.freeze({
  READY: 'READY', HOLD: 'HOLD', UNAVAILABLE: 'UNAVAILABLE',
  OPERATOR_PACED: 'OPERATOR_PACED', EXHAUSTED: 'EXHAUSTED',
});
const ENDPOINT_SCHEMA = 'native-thermal-endpoint/v1';
const OBSERVATION_SCHEMA = 'lab3-thermal-observation/v1';
const SENSOR_REQUIRED = 'sensor-required';
const OPERATOR_PACED = 'operator-paced';
const OBSERVER_TIMEOUT_MS = 5000;
const OBSERVER_OUTPUT_BYTES = 65536;
const POLL_MS = 5000;
const DIGEST = /^[a-f0-9]{64}$/u;
const FILE_BODY = 'file-body';

function unavailable(reason) {
  return {outcome: HEADROOM.UNAVAILABLE, reason, execution_policy: null};
}

export function executionContext(env) {
  const text = env[TEST_EXECUTION_CONTEXT_ENV];
  if (text === undefined) return null;
  const value = JSON.parse(text);
  if (value?.version !== 1 || value.phase !== FILE_BODY ||
      typeof value.file !== 'string' || !path.isAbsolute(value.file)) {
    throw new Error('invalid test execution context');
  }
  return value;
}

export function fileExecutionEnvironment(env, file) {
  const enclosing = executionContext(env);
  return {...env, [TEST_EXECUTION_CONTEXT_ENV]: JSON.stringify(
    enclosing ?? {version: 1, phase: FILE_BODY, file})};
}

export function parseThermalEndpoint(text) {
  const value = JSON.parse(text);
  if (value?.schema !== ENDPOINT_SCHEMA ||
      !['python', 'entry', 'config'].every((key) =>
        typeof value[key] === 'string' && path.isAbsolute(value[key])) ||
      !DIGEST.test(value.sourceSha256) || !DIGEST.test(value.configSha256) ||
      typeof value.bootId !== 'string' || value.bootId.length === 0) {
    throw new Error('invalid native thermal endpoint');
  }
  return value;
}

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function policyValid(policy) {
  return policy !== null && typeof policy === 'object' &&
    [SENSOR_REQUIRED, OPERATOR_PACED].includes(policy.mode) &&
    Number.isSafeInteger(policy.cadence_ms) && policy.cadence_ms >= 0 &&
    Number.isSafeInteger(policy.max_concurrency) && policy.max_concurrency > 0 &&
    Object.keys(policy).length === 3 &&
    (policy.mode !== OPERATOR_PACED ||
      (policy.cadence_ms === POLL_MS && policy.max_concurrency === 1));
}

export function thermalPermits(result) {
  return result.outcome === HEADROOM.READY || result.outcome === HEADROOM.OPERATOR_PACED;
}

function observationShape(value) {
  const textOrNull = (entry) => entry === null || typeof entry === 'string';
  if (!Number.isSafeInteger(value.observed_at) || value.observed_at < 0 ||
      !['cooling_reason', 'abort_reason', 'reason'].every((key) => textOrNull(value[key]))) {
    return false;
  }
  if (value.outcome === HEADROOM.UNAVAILABLE) {
    return value.observations === null && typeof value.reason === 'string' &&
      value.reason.length > 0 && value.cooling_reason === null && value.abort_reason === null;
  }
  const observations = value.observations;
  if (!observations || !['cpu', 'ssd'].every((name) => {
    const row = observations[name];
    return row && Number.isSafeInteger(row.millidegrees) &&
      typeof row.path === 'string' && path.isAbsolute(row.path);
  })) return false;
  return value.reason === null && (value.outcome === HEADROOM.READY ?
    value.cooling_reason === null && value.abort_reason === null :
    typeof value.cooling_reason === 'string' && value.cooling_reason.length > 0);
}

export function checkedThermalObservation(value, endpoint, status) {
  if (value?.schema !== OBSERVATION_SCHEMA ||
      value.source_sha256 !== endpoint.sourceSha256 ||
      value.config_sha256 !== endpoint.configSha256 || value.boot_id !== endpoint.bootId ||
      !observationShape(value) || !policyValid(value.execution_policy) ||
      ![HEADROOM.READY, HEADROOM.HOLD, HEADROOM.UNAVAILABLE].includes(value.outcome) ||
      status !== (value.outcome === HEADROOM.UNAVAILABLE ? 2 : 0)) {
    return unavailable('native observation identity or contract refused');
  }
  // Operator authorization is a distinct disposition. Missing sensors remain
  // visible in the original observation, never rewritten as measured READY.
  if (value.execution_policy.mode === OPERATOR_PACED) {
    return {...value, outcome: HEADROOM.OPERATOR_PACED, observation_outcome: value.outcome};
  }
  return value;
}

function invoke(endpoint, timeout, signal) {
  return new Promise((resolve) => {
    let stdout = '';
    let bytes = 0;
    let problem = null;
    const child = spawn(endpoint.python,
      ['-E', '-s', '-B', endpoint.entry, 'thermal-observe', '--config', endpoint.config],
      {stdio: ['ignore', 'pipe', 'pipe'], signal});
    const timer = setTimeout(() => {
      problem = 'native thermal observation timed out';
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > OBSERVER_OUTPUT_BYTES) {
        problem = 'native thermal observation output exceeded bound';
        child.kill('SIGKILL');
      } else stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > OBSERVER_OUTPUT_BYTES) {
        problem = 'native thermal observation output exceeded bound';
        child.kill('SIGKILL');
      }
    });
    child.on('error', (error) => { problem = error.message; });
    child.on('close', (status, killedBy) => {
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

export function thermalDeadline(env) {
  const value = Number(env[THERMAL_DEADLINE_ENV]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('missing or invalid owned thermal deadline');
  }
  return performance.now() + value - Date.now();
}

export async function readThermalHeadroom({env = process.env, signal,
  deadline = performance.now() + OBSERVER_TIMEOUT_MS} = {}) {
  try {
    if (signal?.aborted) return unavailable('thermal admission cancelled');
    const remaining = deadline - performance.now();
    if (remaining <= 0) return unavailable('owned execution deadline expired');
    const endpoint = parseThermalEndpoint(env[THERMAL_ENDPOINT_ENV]);
    if (digest(endpoint.entry) !== endpoint.sourceSha256 ||
        digest(endpoint.config) !== endpoint.configSha256) {
      return unavailable('native thermal endpoint bytes changed');
    }
    return await invoke(endpoint, Math.min(remaining, OBSERVER_TIMEOUT_MS), signal);
  } catch (error) {
    return unavailable(error.message);
  }
}

export async function waitForThermalHeadroom({env = process.env, signal,
  deadline = thermalDeadline(env), read = () => readThermalHeadroom({env, signal, deadline}),
  sleep = delay, log = () => {}} = {}) {
  while (true) {
    if (signal?.aborted || performance.now() >= deadline) {
      return {outcome: HEADROOM.EXHAUSTED, reason: 'cancelled or owned deadline expired'};
    }
    const result = await read();
    log(formatThermalOutcome(result));
    if (result.outcome !== HEADROOM.HOLD) return result;
    try {
      await sleep(Math.min(POLL_MS, deadline - performance.now()), undefined, {signal});
    } catch (error) {
      return {outcome: HEADROOM.EXHAUSTED, reason: error.message};
    }
  }
}

export function formatThermalOutcome(result) {
  const state = thermalPermits(result) || result.outcome === HEADROOM.HOLD ?
    result.outcome : THERMAL_REFUSAL;
  return `thermal: ${state} ${JSON.stringify(result)}`;
}

async function main() {
  if (process.argv.length > 2) {
    process.stderr.write(`unknown argument ${process.argv[2]}\n` +
      'usage: node scripts/checks/wait-for-thermal-headroom.js (no arguments)\n');
    return 2;
  }
  try {
    const result = await waitForThermalHeadroom({log: (line) => process.stdout.write(`${line}\n`)});
    return thermalPermits(result) ? 0 : THERMAL_REFUSAL_EXIT;
  } catch (error) {
    process.stderr.write(`${THERMAL_REFUSAL}: ${error.message}\n`);
    return THERMAL_REFUSAL_EXIT;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
