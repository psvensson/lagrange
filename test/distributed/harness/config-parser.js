/**
 * Configuration parser for the distributed testing framework.
 * Parses JSON configuration files and merges partial configs with defaults.
 *
 * All defaults come from constants.js — no magic literals.
 */

import {readFile} from 'node:fs/promises';
import {
  DEFAULT_CLUSTER_SIZE,
  DOCKER_DEFAULTS,
  TIMEOUTS,
  CONVERGENCE_DEFAULTS,
  RESOURCE_DEFAULTS,
  LOAD_DEFAULTS,
  DEBUG_TRACE_DEFAULTS,
  LEAK_DEFAULTS,
  BENCHMARK_GATE_DEFAULTS,
  RAFT_PROVIDER_DEFAULTS,
  DETERMINISTIC_DEBUG_DEFAULTS,
} from './constants.js';
import {
  resolvePostgresBaselineBenchmarkConfig,
  shouldValidatePostgresBaselineBenchmarkBudgets,
} from './postgres-baseline-config.js';

/**
 * Merge a partial configuration object with sensible defaults.
 * Missing fields are filled from constants.js.
 *
 * @param {Object} partial - Partial configuration object
 * @returns {Object} Complete configuration with all fields populated
 */
function mergeWithDefaults(partial = {}) {
  const docker = partial.docker || {};
  const parsedDockerBinds = Array.isArray(docker.binds) ?
    docker.binds.filter((entry) =>
      typeof entry === 'string' && entry.length > 0) :
    [];
  const mergedDockerBase = docker.hosts ?
    {hosts: docker.hosts} :
    {socketPath: docker.socketPath || DOCKER_DEFAULTS.socketPath};
  const mergedDocker = {
    ...mergedDockerBase,
    ...(parsedDockerBinds.length > 0 ?
      {binds: parsedDockerBinds} :
      {}),
    ...(docker.skipBuildOnDirty === true ?
      {skipBuildOnDirty: true} :
      {}),
    ...(docker.reuseContainers === true ?
      {reuseContainers: true} :
      {}),
    ...(docker.keepRunningContainers === true ?
      {keepRunningContainers: true} :
      {}),
  };

  return {
    size: partial.size || DEFAULT_CLUSTER_SIZE,
    docker: mergedDocker,
    nodesPerHost: partial.nodesPerHost || undefined,
    image: partial.image || DOCKER_DEFAULTS.imageTag,
    timeouts: {
      nodeStartup: TIMEOUTS.NODE_STARTUP,
      convergence: TIMEOUTS.CONVERGENCE,
      quietWindow: TIMEOUTS.QUIET_WINDOW,
      scenarioDefault: TIMEOUTS.SCENARIO_DEFAULT,
      ...partial.timeouts,
    },
    convergence: {
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
      settleTimeoutMs: CONVERGENCE_DEFAULTS.settleTimeoutMs,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      maxSustainedOverTargetMs: CONVERGENCE_DEFAULTS.maxSustainedOverTargetMs,
      sampleIntervalMs: CONVERGENCE_DEFAULTS.sampleIntervalMs,
      ...partial.convergence,
    },
    resourceLimits: {
      memory: RESOURCE_DEFAULTS.memory,
      cpus: RESOURCE_DEFAULTS.cpus,
      ...partial.resourceLimits,
    },
    load: {
      defaultOpsPerSec: LOAD_DEFAULTS.defaultOpsPerSec,
      defaultDuration: LOAD_DEFAULTS.defaultDuration,
      ...partial.load,
    },
    debugTrace: {
      enabled: DEBUG_TRACE_DEFAULTS.enabled,
      required: DEBUG_TRACE_DEFAULTS.required,
      serviceName: DEBUG_TRACE_DEFAULTS.serviceName,
      lineagePrefix: DEBUG_TRACE_DEFAULTS.lineagePrefix,
      requiredLineagePrefix: DEBUG_TRACE_DEFAULTS.requiredLineagePrefix,
      levels: DEBUG_TRACE_DEFAULTS.levels,
      tenantId: DEBUG_TRACE_DEFAULTS.tenantId,
      principal: DEBUG_TRACE_DEFAULTS.principal,
      roles: DEBUG_TRACE_DEFAULTS.roles,
      connectTimeoutMs: DEBUG_TRACE_DEFAULTS.connectTimeoutMs,
      requestTimeoutMs: DEBUG_TRACE_DEFAULTS.requestTimeoutMs,
      ...(partial.debugTrace || {}),
    },
    memoryLeak: {
      enabled: LEAK_DEFAULTS.enabled,
      failOnDetection: LEAK_DEFAULTS.failOnDetection,
      requireSamples: LEAK_DEFAULTS.requireSamples,
      minSamplesPerNode: LEAK_DEFAULTS.minSamplesPerNode,
      warmupFraction: LEAK_DEFAULTS.warmupFraction,
      minWarmupMs: LEAK_DEFAULTS.minWarmupMs,
      minAnalysisWindowMs: LEAK_DEFAULTS.minAnalysisWindowMs,
      maxPositiveSlopeBytesPerMin: LEAK_DEFAULTS.maxPositiveSlopeBytesPerMin,
      minGrowthBytes: LEAK_DEFAULTS.minGrowthBytes,
      minPositiveDeltaRatio: LEAK_DEFAULTS.minPositiveDeltaRatio,
      captureHeapArtifacts: LEAK_DEFAULTS.captureHeapArtifacts,
      heapSnapshotNearLimitCount: LEAK_DEFAULTS.heapSnapshotNearLimitCount,
      ...(partial.memoryLeak || {}),
    },
    benchmark: resolvePostgresBaselineBenchmarkConfig(
      partial.benchmark || {},
      {
        validateBudgets: shouldValidatePostgresBaselineBenchmarkBudgets(
          partial.benchmark || {},
        ),
      },
    ),
    benchmarkGate: {
      enabled: BENCHMARK_GATE_DEFAULTS.enabled,
      maxThroughputRegressionRatio:
        BENCHMARK_GATE_DEFAULTS.maxThroughputRegressionRatio,
      baselineProvider: BENCHMARK_GATE_DEFAULTS.baselineProvider,
      failIfBaselineMissing: BENCHMARK_GATE_DEFAULTS.failIfBaselineMissing,
      approvedMitigationId: BENCHMARK_GATE_DEFAULTS.approvedMitigationId,
      ...(partial.benchmarkGate || {}),
    },
    deterministicDebug: {
      enabled: DETERMINISTIC_DEBUG_DEFAULTS.enabled,
      seed: DETERMINISTIC_DEBUG_DEFAULTS.seed,
      convergenceSampleIntervalMs:
        DETERMINISTIC_DEBUG_DEFAULTS.convergenceSampleIntervalMs,
      preflightSampleIntervalMs:
        DETERMINISTIC_DEBUG_DEFAULTS.preflightSampleIntervalMs,
      ...(partial.deterministicDebug || {}),
    },
    raftProvider:
      partial.raftProvider || RAFT_PROVIDER_DEFAULTS.provider,
    ...(partial.outputDir ? {outputDir: partial.outputDir} : {}),
    ...(partial.gcp ? {gcp: partial.gcp} : {}),
  };
}

/**
 * Parse a JSON configuration file and merge with defaults.
 *
 * @param {string} filePath - Path to the JSON configuration file
 * @returns {Promise<Object>} Validated and complete configuration object
 * @throws {Error} If the file cannot be read or contains invalid JSON
 */
async function parseConfig(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  const partial = JSON.parse(raw);
  return mergeWithDefaults(partial);
}

export {parseConfig, mergeWithDefaults};
