import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  OCI_HOST_AGENT_DURABLE_ERROR,
} from '../../src/runtime/oci-host-agent-durable-errors.js';
import {
  createOciHostAgentTpmNvCounter,
} from '../../src/runtime/oci-host-agent-tpm-counter.js';

const DEVICE_PATH = '/dev/tpmrm0';
const NV_READ_PATH = '/opt/oci-agent/bin/tpm2_nvread';
const NV_INCREMENT_PATH = '/opt/oci-agent/bin/tpm2_nvincrement';
const NV_INDEX = '0x01500016';

function counterBytes(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function characterDevice() {
  return {isCharacterDevice: () => true, isFile: () => false, mode: 0};
}

function executableFile() {
  return {isCharacterDevice: () => false, isFile: () => true, mode: 0o100};
}

function adapter(overrides = {}) {
  let value = 7;
  const calls = [];
  const execute = (command, argv, options) => {
    calls.push({command, argv, options});
    if (command === NV_INCREMENT_PATH) {
      value += 1;
      return {status: 0, signal: null, stdout: Buffer.alloc(0)};
    }
    return {status: 0, signal: null, stdout: counterBytes(value)};
  };
  const inspectPath = (target) => target === DEVICE_PATH ?
    characterDevice() : executableFile();
  return {
    calls,
    counter: createOciHostAgentTpmNvCounter({
      devicePath: DEVICE_PATH,
      nvReadPath: NV_READ_PATH,
      nvIncrementPath: NV_INCREMENT_PATH,
      nvIndex: NV_INDEX,
      execute,
      inspectPath,
      ...overrides,
    }),
  };
}

function enrollmentUnavailable(action) {
  assert.throws(
    action,
    (error) => error.code ===
      OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
  );
}

describe('OCI host-agent pinned TPM NV counter', () => {
  it('uses exact absolute tools, device TCTI, NV index, and scrubbed process state', () => {
    const {calls, counter} = adapter();
    assert.equal(counter.read(), 7);
    assert.equal(counter.increment(), 8);
    assert.deepEqual(
      calls.map(({command, argv}) => ({command, argv})),
      [
        {
          command: NV_READ_PATH,
          argv: ['-T', `device:${DEVICE_PATH}`, '-C', NV_INDEX, '-s', '8', NV_INDEX],
        },
        {
          command: NV_READ_PATH,
          argv: ['-T', `device:${DEVICE_PATH}`, '-C', NV_INDEX, '-s', '8', NV_INDEX],
        },
        {
          command: NV_INCREMENT_PATH,
          argv: ['-T', `device:${DEVICE_PATH}`, '-C', NV_INDEX, NV_INDEX],
        },
        {
          command: NV_READ_PATH,
          argv: ['-T', `device:${DEVICE_PATH}`, '-C', NV_INDEX, '-s', '8', NV_INDEX],
        },
      ],
    );
    for (const call of calls) {
      assert.deepEqual(call.options.env, {});
      assert.equal(call.options.shell, false);
      assert.equal(call.options.encoding, null);
      assert.equal(call.options.input, undefined);
    }
  });

  it('rejects non-canonical configuration and untrusted path types', () => {
    for (const overrides of [
      {devicePath: '/dev/tpm0'},
      {nvIndex: '0x1500016'},
      {nvIndex: '0X01500016'},
      {nvReadPath: 'tpm2_nvread'},
      {nvIncrementPath: '../tpm2_nvincrement'},
      {inspectPath: () => {
        throw Object.assign(new Error('missing'), {code: 'ENOENT'});
      }},
      {inspectPath: () => executableFile()},
      {inspectPath: (target) => target === DEVICE_PATH ?
        characterDevice() : {...executableFile(), mode: 0o600}},
    ]) {
      enrollmentUnavailable(() => adapter(overrides));
    }
  });

  it('fails closed on tool failure, malformed output, overflow, or increment drift', () => {
    const failures = [
      () => ({status: 1, signal: null, stdout: Buffer.alloc(0)}),
      () => ({status: 0, signal: 'SIGKILL', stdout: counterBytes(7)}),
      () => ({status: 0, signal: null, stdout: Buffer.alloc(7)}),
      () => ({status: 0, signal: null, stdout: Buffer.alloc(9)}),
      () => ({status: 0, signal: null, stdout: counterBytes(Number.MAX_SAFE_INTEGER + 1)}),
      () => {
        throw new Error('execute failed');
      },
    ];
    for (const execute of failures) {
      const {counter} = adapter({execute});
      enrollmentUnavailable(() => counter.read());
    }

    let reads = 0;
    const {counter} = adapter({
      execute(command) {
        if (command === NV_INCREMENT_PATH) {
          return {status: 0, signal: null, stdout: Buffer.alloc(0)};
        }
        reads += 1;
        return {status: 0, signal: null, stdout: counterBytes(reads === 1 ? 7 : 9)};
      },
    });
    enrollmentUnavailable(() => counter.increment());
  });

  it('defaults only to the pinned production device and binary paths', () => {
    const seen = [];
    const counter = createOciHostAgentTpmNvCounter({
      nvIndex: NV_INDEX,
      inspectPath(target) {
        seen.push(target);
        return target === DEVICE_PATH ? characterDevice() : executableFile();
      },
      execute(command, argv) {
        assert.equal(command, '/usr/bin/tpm2_nvread');
        assert.deepEqual(argv, [
          '-T',
          `device:${DEVICE_PATH}`,
          '-C',
          NV_INDEX,
          '-s',
          '8',
          NV_INDEX,
        ]);
        return {status: 0, signal: null, stdout: counterBytes(0)};
      },
    });
    assert.deepEqual(seen, [
      DEVICE_PATH,
      '/usr/bin/tpm2_nvread',
      '/usr/bin/tpm2_nvincrement',
    ]);
    assert.equal(counter.read(), 0);
  });
});
