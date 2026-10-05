/**
 * The harness's HOST authority, and the topology capability a scenario
 * declares before anything starts.
 *
 * A HOST is a MACHINE, named only by an explicit declared or observed
 * topology fact of the Docker provider the harness places a node on
 * (`config.docker.hostInfo[providerIndex]`):
 * - `machineId`: the machine identity the lab fleet itself uses to say
 *   "same machine as" (the kernel boot id the lab harness observes on each
 *   node over ssh), else
 * - `internalIp`: the provider's resolved machine address.
 * Owner constraint (2026-10-04): "Do not infer host identity from node ID,
 * provider ID, or missing topology." So a provider with neither fact has NO
 * host identity (host_topology_undeclared), a config mixing machine ids and
 * bare addresses has none either (host_identity_sources_mixed: one machine
 * could be counted once by id and again by address), and every consumer
 * fails closed on an unknown host. A node id, a provider index, a Docker
 * endpoint or the local socket is never a host. Two nodes on one provider,
 * and two providers on one machine, are ONE host.
 *
 * A scenario whose claim needs distinct hosts declares
 * `SCENARIO_TOPOLOGY_REQUIREMENT = {minDistinctHosts, spreadUnit}`; the
 * runner compares it with the config's host topology BEFORE the cluster
 * starts, and an unmet requirement is the terminal outcome REFUSED
 * (refused_insufficient_host_topology) - never a pass, never a failure,
 * never certification evidence.
 */

import {CLUSTER_STARTUP_GATE_LAYER} from './cluster-startup-gate-layer.js';

// The cluster's own node -> provider assignment (createCluster uses it).
const {distributeNodes} = CLUSTER_STARTUP_GATE_LAYER;

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const arrayFilter = Function.call.bind(Array.prototype.filter);

const ZERO = 0;
const ONE = 1;

const HOST_IDENTITY_PREFIX = 'host:';

const HOST_IDENTITY_SOURCE = Object.freeze({
  DECLARED_MACHINE_ID: 'declared_machine_id',
  PROVIDER_INTERNAL_ADDRESS: 'provider_internal_address',
});

const HOST_TOPOLOGY_MISSING = Object.freeze({
  SOURCES_MIXED: 'host_identity_sources_mixed',
  UNDECLARED: 'host_topology_undeclared',
});

// What a spread claim counts. Every spread claim, gate record and report
// field carries one; an absent or unknown unit is invalid evidence.
const SPREAD_UNIT = Object.freeze({
  HOST: 'host',
  NODE: 'node',
});

const SPREAD_UNIT_FAILURE = Object.freeze({
  ABSENT: 'spread_unit_absent',
  MISMATCH: 'spread_unit_mismatch',
});

// The terminal scenario outcome for a topology that cannot carry the
// scenario's claim: distinct from passed and from failed everywhere.
const SCENARIO_REFUSAL = Object.freeze({
  INSUFFICIENT_HOST_TOPOLOGY: 'refused_insufficient_host_topology',
  INVALID_REQUIREMENT: 'refused_invalid_topology_requirement',
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > ZERO ? value : null;
}

function hostInfoList(config) {
  const info = config?.docker?.hostInfo;
  return Array.isArray(info) ? info : [];
}

function providerCountOf(config) {
  const hosts = config?.docker?.hosts;
  return Array.isArray(hosts) && hosts.length > ZERO ? hosts.length : ONE;
}

// A config either names every provider's machine by a declared machine id
// or by its address; a mix could count one machine twice.
function configUsesMixedSources(config) {
  const entries = hostInfoList(config);
  const declared = arraySome(entries, (entry) =>
    nonEmptyString(entry?.machineId) !== null);
  const undeclared = arraySome(entries, (entry) =>
    nonEmptyString(entry?.machineId) === null);
  return declared && undeclared;
}

/**
 * The machine behind one Docker provider of a cluster config.
 * @param {Object} config The cluster config.
 * @param {number} providerIndex
 * @return {Object} {hostId|null, source|null, missingReason|null, label,
 *   providerIndex}
 */
function describeProviderMachine(config, providerIndex) {
  const info = hostInfoList(config)[providerIndex] || null;
  const dockerHosts = config?.docker?.hosts;
  const endpoint = Array.isArray(dockerHosts) ?
    nonEmptyString(dockerHosts[providerIndex]) :
    null;
  const machineId = nonEmptyString(info?.machineId);
  const address = nonEmptyString(info?.internalIp);
  // The label is for people only; it never decides a host.
  const label = address || endpoint || null;
  if (configUsesMixedSources(config)) {
    return Object.freeze({hostId: null, label,
      missingReason: HOST_TOPOLOGY_MISSING.SOURCES_MIXED, providerIndex,
      source: null});
  }
  if (machineId !== null) {
    return Object.freeze({hostId: HOST_IDENTITY_PREFIX + machineId, label,
      missingReason: null, providerIndex,
      source: HOST_IDENTITY_SOURCE.DECLARED_MACHINE_ID});
  }
  if (address !== null) {
    return Object.freeze({hostId: HOST_IDENTITY_PREFIX + address, label,
      missingReason: null, providerIndex,
      source: HOST_IDENTITY_SOURCE.PROVIDER_INTERNAL_ADDRESS});
  }
  return Object.freeze({hostId: null, label,
    missingReason: HOST_TOPOLOGY_MISSING.UNDECLARED, providerIndex,
    source: null});
}

/**
 * The host topology a config will place its nodes on, decided before any
 * container starts, by the same assignment and the same authority the
 * cluster uses.
 * @param {Object} config
 * @return {Object} {distinctHosts|null, hostIds, nodes, missingReasons}
 *   (distinctHosts is null when any placed node's host is unknown).
 */
function resolveConfigHostTopology(config) {
  const size = Number(config?.size);
  const nodeCount = Number.isSafeInteger(size) && size > ZERO ? size : ZERO;
  const providerCount = providerCountOf(config);
  const nodesPerHost = Number(config?.nodesPerHost) || nodeCount;
  const assignment = providerCount > ONE ?
    distributeNodes(nodeCount, new Array(providerCount), nodesPerHost) :
    new Array(nodeCount).fill(ZERO);
  const nodes = arrayMap(assignment, (providerIndex, nodeIndex) => {
    const machine = describeProviderMachine(config, providerIndex);
    return {hostId: machine.hostId, missingReason: machine.missingReason,
      nodeIndex, providerIndex};
  });
  const unknown = arrayFilter(nodes, (node) => node.hostId === null);
  const hostIds = arraySort([...new Set(arrayMap(
    arrayFilter(nodes, (node) => node.hostId !== null),
    (node) => node.hostId))]);
  return {
    distinctHosts: unknown.length > ZERO || nodes.length === ZERO ?
      null :
      hostIds.length,
    hostIds,
    missingReasons: arraySort([...new Set(arrayMap(unknown,
      (node) => node.missingReason))]),
    nodes,
  };
}

function isSpreadUnit(value) {
  return value === SPREAD_UNIT.HOST || value === SPREAD_UNIT.NODE;
}

/**
 * Compare a scenario's declared topology requirement with a config's host
 * topology. Returns null when the scenario may run, else the REFUSED
 * outcome with its named reason, the required and the available hosts.
 * @param {Object|null|undefined} requirement {minDistinctHosts, spreadUnit}
 * @param {Object} config
 * @return {Object|null}
 */
function evaluateScenarioTopologyRequirement(requirement, config) {
  if (requirement === null || requirement === undefined) {
    return null;
  }
  const required = requirement.minDistinctHosts;
  if (!isSpreadUnit(requirement.spreadUnit) ||
      !(Number.isSafeInteger(required) && required >= ZERO)) {
    return {available: null, reason: SCENARIO_REFUSAL.INVALID_REQUIREMENT,
      required: required ?? null, spreadUnit: requirement.spreadUnit ?? null};
  }
  if (required <= ONE) {
    return null;
  }
  const topology = resolveConfigHostTopology(config);
  if (topology.distinctHosts !== null && topology.distinctHosts >= required) {
    return null;
  }
  return {
    available: topology.distinctHosts,
    hostIds: topology.hostIds,
    missingReasons: topology.missingReasons,
    reason: SCENARIO_REFUSAL.INSUFFICIENT_HOST_TOPOLOGY,
    required,
    spreadUnit: requirement.spreadUnit,
  };
}

/**
 * Evidence that states a spread count must state its unit; absent or
 * different = invalid evidence, a named failure, never a default.
 * @param {Object} evidence Carries `spreadUnit`.
 * @param {string} expectedUnit One of SPREAD_UNIT.
 * @param {string} label Who is reading it.
 * @return {Object} The evidence.
 */
function requireSpreadUnit(evidence, expectedUnit, label) {
  const unit = evidence?.spreadUnit;
  if (!isSpreadUnit(unit)) {
    throw new Error(`${label}: ${SPREAD_UNIT_FAILURE.ABSENT}: spread ` +
      `evidence has no unit (${JSON.stringify(unit ?? null)}); a count ` +
      'without its unit is invalid evidence');
  }
  if (unit !== expectedUnit) {
    throw new Error(`${label}: ${SPREAD_UNIT_FAILURE.MISMATCH}: spread ` +
      `evidence counts ${unit}s, the claim is in ${expectedUnit}s`);
  }
  return evidence;
}

export {
  SCENARIO_REFUSAL,
  SPREAD_UNIT,
  describeProviderMachine,
  evaluateScenarioTopologyRequirement,
  isSpreadUnit,
  requireSpreadUnit,
  resolveConfigHostTopology,
};
