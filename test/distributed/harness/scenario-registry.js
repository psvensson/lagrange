import {basename} from 'node:path';
import {
  TOPOLOGY_FAILURE_GATE_MATRIX,
  buildTopologyFailureGateExecutionPlan,
  formatTopologyFailureGateExecutionLines,
  formatTopologyFailureGateMatrixLines,
  listTopologyFailureGateEntries,
  listUniqueTopologyFailureGateScenarioNames,
} from './topology-failure-gate-matrix.js';

const SCENARIO_REGISTRY_TYPEOF_STRING = 'string';
const SCENARIO_REGISTRY_ZERO = 0;

const CANONICAL_SCENARIO_MATRIX = Object.freeze([
  Object.freeze({
    config: 'local-three-node.json',
    name: 'admin-query-smoke',
  }),
  Object.freeze({
    config: 'local-three-node.json',
    name: 'examples-catalog',
  }),
  Object.freeze({
    config: 'local-three-node.json',
    name: 'network-partition-split-brain',
  }),
  Object.freeze({
    config: 'local-three-node.json',
    name: 'node-failure-rebalance',
  }),
  Object.freeze({
    config: 'local-three-node.json',
    name: 'rolling-restart',
  }),
  Object.freeze({
    config: 'local-three-node.json',
    name: 'three-node-seed-rebalance',
  }),
  Object.freeze({
    config: 'local-three-node.json',
    name: 'wasm-service-failover',
  }),
  Object.freeze({
    config: 'local-three-node.json',
    name: 'write-ack-visibility',
  }),
  Object.freeze({
    config: 'local.json',
    name: 'node-join-under-load',
  }),
  Object.freeze({
    config: 'local.json',
    name: 'partition-kill-heal-under-load',
  }),
  Object.freeze({
    config: 'local.json',
    name: 'rolling-restart',
  }),
  Object.freeze({
    config: 'local.json',
    name: 'seed-restart-under-load',
  }),
  Object.freeze({
    config: 'local.json',
    name: 'slow-follower-under-load',
  }),
  Object.freeze({
    config: 'local.json',
    name: 'sustained-write-throughput',
  }),
  Object.freeze({
    config: 'local-benchmark-5node.json',
    name: 'postgres-baseline-comparison',
  }),
  Object.freeze({
    config: 'local-benchmark-7node.json',
    name: 'diag-admin-discovery',
  }),
  Object.freeze({
    config: 'local-benchmark-7node.json',
    name: 'seven-node-load-during-partitioning',
  }),
  Object.freeze({
    config: 'local-benchmark-7node.json',
    name: 'seven-node-read-write-load-distribution',
  }),
  Object.freeze({
    config: 'local-benchmark-7node.json',
    name: 'seven-node-read-write-load-transaction-recovery',
  }),
  Object.freeze({
    config: 'local-benchmark-7node.json',
    name: 'seven-node-table-partition-distribution',
  }),
  Object.freeze({
    config: 'local-benchmark-7node-partition-split.json',
    name: 'seven-node-postgres-baseline-partition-split',
  }),
]);

function normalizeScenarioConfigName(configPathOrName) {
  if (typeof configPathOrName !== SCENARIO_REGISTRY_TYPEOF_STRING) {
    return null;
  }
  const normalized = basename(configPathOrName).trim();
  return normalized.length > SCENARIO_REGISTRY_ZERO ? normalized : null;
}

function listCanonicalScenarioEntries(configPathOrName = null) {
  const configName = normalizeScenarioConfigName(configPathOrName);
  if (!configName) {
    return [...CANONICAL_SCENARIO_MATRIX];
  }
  return CANONICAL_SCENARIO_MATRIX.filter((entry) => entry.config === configName);
}

function selectCanonicalScenariosForConfig(scenarios, configPathOrName) {
  if (!Array.isArray(scenarios) || scenarios.length === SCENARIO_REGISTRY_ZERO) {
    return [];
  }

  const canonicalEntries = listCanonicalScenarioEntries(configPathOrName);
  if (canonicalEntries.length === SCENARIO_REGISTRY_ZERO) {
    return [...scenarios];
  }

  const byName = new Map(
    scenarios.map((scenario) => [scenario?.name, scenario]),
  );
  return canonicalEntries
    .map((entry) => byName.get(entry.name) || null)
    .filter((scenario) => Boolean(scenario));
}

function listCanonicalTopologyFailureGateEntries(configPathOrName = null) {
  return listTopologyFailureGateEntries(configPathOrName);
}

function listCanonicalTopologyFailureGateExecutionPlan(
  runId,
  configPathOrName = null,
) {
  return buildTopologyFailureGateExecutionPlan(runId, configPathOrName);
}

function selectCanonicalTopologyFailureGateScenariosForConfig(
  scenarios,
  configPathOrName,
) {
  if (!Array.isArray(scenarios) || scenarios.length === SCENARIO_REGISTRY_ZERO) {
    return [];
  }

  const gateScenarioNames = listUniqueTopologyFailureGateScenarioNames(
    listCanonicalTopologyFailureGateEntries(configPathOrName),
  );
  const byName = new Map(
    scenarios.map((scenario) => [scenario?.name, scenario]),
  );
  return gateScenarioNames
    .map((scenarioName) => byName.get(scenarioName) || null)
    .filter((scenario) => Boolean(scenario));
}

function formatCanonicalTopologyFailureGateMatrixLines() {
  return formatTopologyFailureGateMatrixLines();
}

function formatCanonicalTopologyFailureGateExecutionLines(runId) {
  return formatTopologyFailureGateExecutionLines(runId);
}

function formatCanonicalScenarioMatrixLines() {
  return CANONICAL_SCENARIO_MATRIX.map((entry) => {
    return `${entry.config}|${entry.name}`;
  });
}

export {
  CANONICAL_SCENARIO_MATRIX,
  TOPOLOGY_FAILURE_GATE_MATRIX,
  formatCanonicalScenarioMatrixLines,
  formatCanonicalTopologyFailureGateExecutionLines,
  formatCanonicalTopologyFailureGateMatrixLines,
  listCanonicalScenarioEntries,
  listCanonicalTopologyFailureGateExecutionPlan,
  listCanonicalTopologyFailureGateEntries,
  normalizeScenarioConfigName,
  selectCanonicalScenariosForConfig,
  selectCanonicalTopologyFailureGateScenariosForConfig,
};
