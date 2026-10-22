import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ENV_VAR,
} from './diagnostics/source-fingerprint.js';
import {resolveAutoRejoinStartupDecision} from './bootstrap/rejoin-hints.js';
import {
  ENTRYPOINT_DRY_RUN_EXIT_CODE,
  ENTRYPOINT_DRY_RUN_OUTCOME,
  ENTRYPOINT_LOG_MSG,
  ENTRYPOINT_REJOIN_DEFAULT,
} from './constants/entrypoint.js';
import {RAFT_RS_BINDING_STATE} from './raft/raft-rs-core-constants.js';
import {verifyRaftRsBinding} from './raft/raft-rs-operation-port.js';

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

/**
 * Decide and report a dry run: the node and data directory it validated and
 * the raft-rs binding's own verdict on the binding this artifact carries
 * (present, matching its digests and loadable). A dry run validates the
 * deployment layout, so an unavailable binding is its named failure: it is
 * logged at error level and ends the process non-zero.
 * @param {Object} options
 * @param {Object} options.logger
 * @param {string} options.nodeId
 * @param {string} options.dataDir
 * @return {{dryRun: boolean, dryRunOutcome: string, exitCode: number}}
 */
function reportDryRunCompletion({logger, nodeId, dataDir}) {
  const raftRsBinding = verifyRaftRsBinding();
  const dryRunOutcome = raftRsBinding.state === RAFT_RS_BINDING_STATE.VERIFIED ?
    ENTRYPOINT_DRY_RUN_OUTCOME.COMPLETED :
    ENTRYPOINT_DRY_RUN_OUTCOME.BINDING_UNAVAILABLE;
  const report = {nodeId, dataDir, raftRsBinding, dryRunOutcome};
  if (dryRunOutcome === ENTRYPOINT_DRY_RUN_OUTCOME.COMPLETED) {
    logger.info(ENTRYPOINT_LOG_MSG.DRY_RUN_COMPLETED, report);
  } else {
    logger.error(ENTRYPOINT_LOG_MSG.DRY_RUN_COMPLETED, report);
  }
  return Object.freeze({dryRun: true, dryRunOutcome,
    exitCode: ENTRYPOINT_DRY_RUN_EXIT_CODE[dryRunOutcome]});
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
  reportDryRunCompletion,
  resolveBootSourceProvenance,
  resolveJoinReattemptPolicy,
  resolveLocalClusterIncarnationFence,
};
