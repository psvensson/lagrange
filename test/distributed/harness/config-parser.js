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
} from './constants.js';

/**
 * Merge a partial configuration object with sensible defaults.
 * Missing fields are filled from constants.js.
 *
 * @param {Object} partial - Partial configuration object
 * @returns {Object} Complete configuration with all fields populated
 */
function mergeWithDefaults(partial = {}) {
  const docker = partial.docker || {};
  const mergedDocker = docker.hosts
    ? {hosts: docker.hosts}
    : {socketPath: docker.socketPath || DOCKER_DEFAULTS.socketPath};

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
