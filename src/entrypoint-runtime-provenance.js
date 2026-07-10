import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ENV_VAR,
} from './diagnostics/source-fingerprint.js';
import {resolveAutoRejoinStartupDecision} from './bootstrap/rejoin-hints.js';
import {ENTRYPOINT_REJOIN_DEFAULT} from './constants/entrypoint.js';

async function resolveLocalClusterIncarnationFence(options = {}) {
  const startupDecision = await resolveAutoRejoinStartupDecision({
    dataDir: options.dataDir,
    nodeId: options.nodeId,
    nodeAddress: options.nodeAddress,
  });
  const clusterIncarnationFence = startupDecision?.clusterIncarnationFence;
  return clusterIncarnationFence && typeof clusterIncarnationFence === 'object' ?
    clusterIncarnationFence :
    null;
}

async function resolveBootSourceProvenance(env = process.env) {
  const expectedSrcFingerprint = env[SOURCE_FINGERPRINT_ENV_VAR] || null;
  let bootedSrcFingerprint = null;
  try {
    const sourceDir = dirname(fileURLToPath(import.meta.url));
    bootedSrcFingerprint = await computeSourceFingerprint(sourceDir);
  } catch {
    bootedSrcFingerprint = null;
  }
  const srcFingerprintMatches =
    expectedSrcFingerprint && bootedSrcFingerprint ?
      expectedSrcFingerprint === bootedSrcFingerprint :
      null;
  return {expectedSrcFingerprint, bootedSrcFingerprint, srcFingerprintMatches};
}

function resolveJoinReattemptPolicy(env = process.env) {
  const configuredMaxAttempts = Number(env.LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS);
  return Object.freeze({
    maxAttempts:
      Number.isFinite(configuredMaxAttempts) && configuredMaxAttempts >= 1 ?
        Math.floor(configuredMaxAttempts) :
        ENTRYPOINT_REJOIN_DEFAULT.MAX_ATTEMPTS,
    baseDelayMs: ENTRYPOINT_REJOIN_DEFAULT.BASE_DELAY_MS,
    maxDelayMs: ENTRYPOINT_REJOIN_DEFAULT.MAX_DELAY_MS,
    backoffCapExponent: ENTRYPOINT_REJOIN_DEFAULT.BACKOFF_CAP_EXPONENT,
  });
}

export {
  resolveBootSourceProvenance,
  resolveJoinReattemptPolicy,
  resolveLocalClusterIncarnationFence,
};
