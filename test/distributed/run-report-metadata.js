/**
 * Report metadata owner for the distributed runner (test/distributed/run.js):
 * the raft provider a run resolves, the source-fingerprint stamp, and the
 * execution target/profile/hosts a distributed matrix run records.
 */

import {
  CLI,
  RAFT_PROVIDER_DEFAULTS,
  DISTRIBUTED_EXECUTION_TARGET,
  DISTRIBUTED_MATRIX_PROFILE,
  DISTRIBUTED_EXECUTION_ENV,
} from './harness/constants.js';

const SCENARIO_FILTER_ALL = 'all';
const DISTRIBUTED_EXECUTION_TYPEOF_STRING = 'string';
const DISTRIBUTED_EXECUTION_HOST_SEPARATOR = ',';
const DISTRIBUTED_EXECUTION_EMPTY_LENGTH = 0;
// Stamped on every written report so a release verification (the
// release-0-2-verification-v3 memory-soak oracle) can bind the report to the
// exact source bytes the run booted; empty when no fingerprinted launch
// config reached the report (the oracle reads that as fingerprint_missing).
const REPORT_SOURCE_FINGERPRINT_ABSENT = '';

function resolveRunRaftProvider(config, env = process.env) {
  const configuredProvider = config?.raftProvider;
  if (typeof configuredProvider === 'string' &&
    configuredProvider.trim().length > 0) {
    return configuredProvider.trim().toLowerCase();
  }

  const envValue = env?.[RAFT_PROVIDER_DEFAULTS.envKey];
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return envValue.trim().toLowerCase();
  }

  return RAFT_PROVIDER_DEFAULTS.provider;
}

// The source-fingerprint stamp: the fingerprint the run computed for its
// docker config (the value the nodes boot with as SRC_FINGERPRINT), or the
// typed absent sentinel when no fingerprinted config exists.
function buildReportSourceFingerprintMetadata(runConfig) {
  const docker = runConfig?.docker;
  return {
    srcFingerprint: String(
      docker?.srcFingerprint || REPORT_SOURCE_FINGERPRINT_ABSENT,
    ),
    srcFingerprintAlgo: String(
      docker?.srcFingerprintAlgo || REPORT_SOURCE_FINGERPRINT_ABSENT,
    ),
  };
}

function isDistributedExecutionEnumValue(value, table) {
  return typeof value === DISTRIBUTED_EXECUTION_TYPEOF_STRING &&
    Object.values(table).includes(value);
}

function isNonBlankDistributedExecutionString(value) {
  return typeof value === DISTRIBUTED_EXECUTION_TYPEOF_STRING &&
    value.trim().length > DISTRIBUTED_EXECUTION_EMPTY_LENGTH;
}

function buildDistributedExecutionMetadata(env = process.env) {
  const metadata = {};
  const target = env?.[DISTRIBUTED_EXECUTION_ENV.TARGET];
  const profile = env?.[DISTRIBUTED_EXECUTION_ENV.PROFILE];
  const hosts = env?.[DISTRIBUTED_EXECUTION_ENV.HOSTS];
  const matrixConfig = env?.[DISTRIBUTED_EXECUTION_ENV.CONFIG];

  if (isDistributedExecutionEnumValue(target, DISTRIBUTED_EXECUTION_TARGET)) {
    metadata.executionTarget = target;
  }
  if (isDistributedExecutionEnumValue(profile, DISTRIBUTED_MATRIX_PROFILE)) {
    metadata.matrixProfile = profile;
  }
  if (isNonBlankDistributedExecutionString(hosts)) {
    metadata.executionHosts = hosts
      .split(DISTRIBUTED_EXECUTION_HOST_SEPARATOR)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (isNonBlankDistributedExecutionString(matrixConfig)) {
    metadata.matrixConfig = matrixConfig.trim();
  }
  return metadata;
}

function buildReportMetadata(
  args,
  runConfig,
  deterministicDebug,
  env = process.env,
) {
  const metadata = {
    raftProvider: resolveRunRaftProvider(runConfig),
    configPath: String(args?.config || CLI.DEFAULT_CONFIG),
    scenarioFilter: String(args?.scenario || SCENARIO_FILTER_ALL),
    ...buildReportSourceFingerprintMetadata(runConfig),
    ...buildDistributedExecutionMetadata(env),
  };
  if (deterministicDebug?.enabled === true) {
    metadata.deterministicDebug = {
      enabled: true,
      seed: deterministicDebug.seed,
      convergenceSampleIntervalMs:
        deterministicDebug.convergenceSampleIntervalMs,
      preflightSampleIntervalMs:
        deterministicDebug.preflightSampleIntervalMs,
    };
  }
  return metadata;
}

export {
  SCENARIO_FILTER_ALL,
  buildDistributedExecutionMetadata,
  buildReportMetadata,
  resolveRunRaftProvider,
};
