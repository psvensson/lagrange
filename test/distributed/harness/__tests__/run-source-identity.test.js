import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ALGORITHM,
} from '../../../../src/diagnostics/source-fingerprint.js';
import {applySourceFingerprintConfig} from '../../source-fingerprint-config.js';

describe('cluster source identity', () => {
  it('authenticates the exact boot source without mutating launch config', async () => {
    const input = Object.freeze({
      image: 'lagrange:test',
      docker: Object.freeze({socketPath: '/var/run/docker.sock'}),
    });
    const configured = await applySourceFingerprintConfig(input);
    const expected = await computeSourceFingerprint('src');

    assert.equal(configured.docker.srcFingerprint, expected);
    assert.equal(configured.docker.srcFingerprintAlgo, SOURCE_FINGERPRINT_ALGORITHM);
    assert.equal(configured.docker.socketPath, input.docker.socketPath);
    assert.equal(input.docker.srcFingerprint, undefined);
  });
});
