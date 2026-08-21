/**
 * Bind a cluster launch configuration to the exact source tree its image is
 * expected to contain. Image labels prove which commit a daemon received;
 * this process-level capability proves which bytes the node actually booted.
 * Every baked-image and bind-mounted launch path must use the same contract.
 */

import {resolve} from 'node:path';
import {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ALGORITHM,
} from '../../src/diagnostics/source-fingerprint.js';

const SOURCE_RELATIVE_PATH = 'src';

async function applySourceFingerprintConfig(
  config,
  cwd = process.cwd(),
) {
  const dockerConfig = config && typeof config.docker === 'object' ?
    config.docker :
    {};
  const srcFingerprint = await computeSourceFingerprint(
    resolve(cwd, SOURCE_RELATIVE_PATH),
  );
  return {
    ...config,
    docker: {
      ...dockerConfig,
      srcFingerprint,
      srcFingerprintAlgo: SOURCE_FINGERPRINT_ALGORITHM,
    },
  };
}

export {applySourceFingerprintConfig};
