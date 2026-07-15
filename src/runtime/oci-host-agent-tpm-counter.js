import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  OCI_HOST_AGENT_DURABLE_ERROR,
  OciHostAgentDurableStateError,
  durableStateError,
} from './oci-host-agent-durable-errors.js';

const TPM_DEVICE_PATH = '/dev/tpmrm0';
const TPM_NV_READ_PATH = '/usr/bin/tpm2_nvread';
const TPM_NV_INCREMENT_PATH = '/usr/bin/tpm2_nvincrement';
const NV_INDEX_PATTERN = /^0x[0-9a-f]{8}$/u;
const COUNTER_BYTES = 8;
const MAX_COUNTER = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_OUTPUT_BYTES = 64 * 1024;
const EXECUTABLE_PERMISSION_MASK = 0o111;
const TCTI_FLAG = '-T';
const AUTHORIZATION_FLAG = '-C';
const READ_SIZE_FLAG = '-s';

function enrollmentUnavailable() {
  durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE);
}

function canonicalAbsolutePath(value) {
  return typeof value === 'string' && path.isAbsolute(value) &&
    path.resolve(value) === value;
}

function inspectTrustedPaths(options) {
  try {
    const device = options.inspectPath(options.devicePath);
    if (!device.isCharacterDevice()) enrollmentUnavailable();
    for (const executable of [options.nvReadPath, options.nvIncrementPath]) {
      const metadata = options.inspectPath(executable);
      if (!metadata.isFile() ||
          (metadata.mode & EXECUTABLE_PERMISSION_MASK) === 0) {
        enrollmentUnavailable();
      }
    }
  } catch (error) {
    if (error instanceof OciHostAgentDurableStateError) throw error;
    enrollmentUnavailable();
  }
}

function validateOptions(rawOptions) {
  const options = {
    devicePath: TPM_DEVICE_PATH,
    nvReadPath: TPM_NV_READ_PATH,
    nvIncrementPath: TPM_NV_INCREMENT_PATH,
    execute: spawnSync,
    inspectPath: fs.statSync,
    ...rawOptions,
  };
  if (options.devicePath !== TPM_DEVICE_PATH ||
      !canonicalAbsolutePath(options.nvReadPath) ||
      !canonicalAbsolutePath(options.nvIncrementPath) ||
      options.nvReadPath === options.nvIncrementPath ||
      !NV_INDEX_PATTERN.test(options.nvIndex) ||
      typeof options.execute !== 'function' ||
      typeof options.inspectPath !== 'function') enrollmentUnavailable();
  inspectTrustedPaths(options);
  return options;
}

function executeTool(options, executable, argv) {
  try {
    const result = options.execute(executable, argv, {
      encoding: null,
      env: {},
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: false,
    });
    if (result?.status !== 0 || result.signal) enrollmentUnavailable();
    return result;
  } catch (error) {
    if (error instanceof OciHostAgentDurableStateError) throw error;
    enrollmentUnavailable();
  }
}

function tctiArguments(options) {
  return [TCTI_FLAG, `device:${options.devicePath}`];
}

function readCounter(options) {
  const result = executeTool(options, options.nvReadPath, [
    ...tctiArguments(options),
    AUTHORIZATION_FLAG,
    options.nvIndex,
    READ_SIZE_FLAG,
    String(COUNTER_BYTES),
    options.nvIndex,
  ]);
  if (!Buffer.isBuffer(result.stdout) || result.stdout.length !== COUNTER_BYTES) {
    enrollmentUnavailable();
  }
  const counter = result.stdout.readBigUInt64BE();
  if (counter > MAX_COUNTER) enrollmentUnavailable();
  return Number(counter);
}

function incrementCounter(options) {
  const previous = readCounter(options);
  if (previous === Number.MAX_SAFE_INTEGER) enrollmentUnavailable();
  executeTool(options, options.nvIncrementPath, [
    ...tctiArguments(options),
    AUTHORIZATION_FLAG,
    options.nvIndex,
    options.nvIndex,
  ]);
  const current = readCounter(options);
  if (current !== previous + 1) enrollmentUnavailable();
  return current;
}

function createOciHostAgentTpmNvCounter(rawOptions) {
  const options = validateOptions(rawOptions);
  return Object.freeze({
    read: () => readCounter(options),
    increment: () => incrementCounter(options),
  });
}

export {
  createOciHostAgentTpmNvCounter,
};
