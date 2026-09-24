import {join} from 'node:path';

import {
  DISTRIBUTED_EXECUTION_TARGET,
  DISTRIBUTED_MATRIX_PROFILE,
} from './constants.js';
import {
  CANONICAL_SCENARIO_MATRIX,
  TOPOLOGY_FAILURE_GATE_MATRIX,
} from './scenario-registry.js';

const DISTRIBUTED_MATRIX_CONFIG_DIRECTORY = 'test/distributed/config';
const DISTRIBUTED_MATRIX_REPORT_ROOT =
  'test-output/reports/distributed-matrix';
const DISTRIBUTED_MATRIX_REPORT_SUFFIX = '.report.json';
const DISTRIBUTED_MATRIX_CONFIG_SUFFIX = '.json';
const DISTRIBUTED_MATRIX_NAME_SEPARATOR = '--';
const DISTRIBUTED_MATRIX_PAIR_SEPARATOR = '|';
const DISTRIBUTED_MATRIX_INDEX_WIDTH = 2;
const DISTRIBUTED_MATRIX_INDEX_FILL = '0';
const DISTRIBUTED_MATRIX_FIRST_INDEX = 1;
const DISTRIBUTED_MATRIX_MIN_SIZE = 1;
const DISTRIBUTED_MATRIX_GCP_NODES_PER_HOST = 1;

function normalizeProfile(profile) {
  const normalized = profile || DISTRIBUTED_MATRIX_PROFILE.CANONICAL;
  if (!Object.values(DISTRIBUTED_MATRIX_PROFILE).includes(normalized)) {
    throw new Error(`Unknown distributed matrix profile: ${normalized}`);
  }
  return normalized;
}

function normalizeTarget(target) {
  const normalized = target || DISTRIBUTED_EXECUTION_TARGET.LOCAL;
  if (!Object.values(DISTRIBUTED_EXECUTION_TARGET).includes(normalized)) {
    throw new Error(`Unknown distributed matrix target: ${normalized}`);
  }
  return normalized;
}

function scenarioPairKey(config, scenario) {
  return `${config}${DISTRIBUTED_MATRIX_PAIR_SEPARATOR}${scenario}`;
}

function listTopologyScenarioEntries() {
  const seen = new Set();
  const entries = [];
  for (const gate of TOPOLOGY_FAILURE_GATE_MATRIX) {
    const key = scenarioPairKey(gate.config, gate.scenario);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push(Object.freeze({
      config: gate.config,
      name: gate.scenario,
    }));
  }
  return entries;
}

function listDistributedMatrixEntries(profile = DISTRIBUTED_MATRIX_PROFILE.CANONICAL) {
  const normalizedProfile = normalizeProfile(profile);
  if (normalizedProfile === DISTRIBUTED_MATRIX_PROFILE.TOPOLOGY) {
    return listTopologyScenarioEntries();
  }
  return CANONICAL_SCENARIO_MATRIX.map((entry) => Object.freeze({...entry}));
}

function configStem(configName) {
  return configName.endsWith(DISTRIBUTED_MATRIX_CONFIG_SUFFIX) ?
    configName.slice(0, -DISTRIBUTED_MATRIX_CONFIG_SUFFIX.length) :
    configName;
}

function buildDistributedMatrixExecutionPlan({
  target = DISTRIBUTED_EXECUTION_TARGET.LOCAL,
  profile = DISTRIBUTED_MATRIX_PROFILE.CANONICAL,
  runId,
  reportRoot = DISTRIBUTED_MATRIX_REPORT_ROOT,
} = {}) {
  const normalizedTarget = normalizeTarget(target);
  const normalizedProfile = normalizeProfile(profile);
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new Error('Distributed matrix execution plan requires runId');
  }

  const entries = listDistributedMatrixEntries(normalizedProfile);
  const total = entries.length;
  return entries.map((entry, index) => {
    const ordinal = String(index + DISTRIBUTED_MATRIX_FIRST_INDEX)
      .padStart(
        DISTRIBUTED_MATRIX_INDEX_WIDTH,
        DISTRIBUTED_MATRIX_INDEX_FILL,
      );
    const reportName = [
      ordinal,
      configStem(entry.config),
      entry.name,
    ].join(DISTRIBUTED_MATRIX_NAME_SEPARATOR) +
      DISTRIBUTED_MATRIX_REPORT_SUFFIX;
    return Object.freeze({
      target: normalizedTarget,
      profile: normalizedProfile,
      index: index + DISTRIBUTED_MATRIX_FIRST_INDEX,
      total,
      config: entry.config,
      configPath: join(DISTRIBUTED_MATRIX_CONFIG_DIRECTORY, entry.config),
      scenario: entry.name,
      outputPath: join(
        reportRoot,
        normalizedTarget,
        normalizedProfile,
        runId,
        reportName,
      ),
    });
  });
}

function buildGcpTargetConfig(baseConfig, gcpTemplate) {
  const size = Number(baseConfig?.size);
  if (!Number.isSafeInteger(size) || size < DISTRIBUTED_MATRIX_MIN_SIZE) {
    throw new Error('Distributed matrix GCP target requires a valid cluster size');
  }
  if (!gcpTemplate?.gcp || typeof gcpTemplate.gcp !== 'object') {
    throw new Error('Distributed matrix GCP target requires template.gcp');
  }

  const docker = {
    ...(baseConfig?.docker || {}),
    ...(gcpTemplate?.docker || {}),
  };
  delete docker.socketPath;
  delete docker.hosts;
  delete docker.hostInfo;
  delete docker.tls;

  return {
    ...baseConfig,
    docker,
    nodesPerHost: DISTRIBUTED_MATRIX_GCP_NODES_PER_HOST,
    gcp: {
      ...gcpTemplate.gcp,
      vmCount: size,
    },
  };
}

export {
  DISTRIBUTED_MATRIX_REPORT_ROOT,
  buildDistributedMatrixExecutionPlan,
  buildGcpTargetConfig,
  listDistributedMatrixEntries,
  normalizeProfile,
  normalizeTarget,
};
