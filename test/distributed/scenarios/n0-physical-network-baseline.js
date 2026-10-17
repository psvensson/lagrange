/**
 * N0 physical-host idle network observation; test harness only.
 * Multi-Docker-host Lagrange uses host networking, for which per-container
 * Docker network counters may be absent. Read /proc/net/dev in the host
 * networking namespace, choose the interface using /proc/net/route for the
 * published peer IPs, and measure routed HOST-interface bytes.
 *
 * These include unrelated host traffic. No app-exclusive, per-peer,
 * packet-size, RTT or overlay-bandwidth claim is permitted. The existing
 * distributed harness owns host identity, placement, Docker and locks.
 */
import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {SPREAD_UNIT} from '../harness/scenario-host-topology.js';

const MIN_DISTINCT_HOSTS = 3;
const BASELINE_WINDOW_MS = 12000;
const CONVERGENCE_TIMEOUT_MS = 120000;
const MAX_SAFE_DELTA = BigInt(Number.MAX_SAFE_INTEGER);
const IP_OCTET = /^[0-9]{1,3}$/u;
const IFACE_NAME = /^[A-Za-z0-9_.:-]{1,40}$/u;
const ROUTE_FIELD = /^[0-9A-Fa-f]{8}$/u;
const ROUTE_FLAGS = /^[0-9A-Fa-f]{4,8}$/u;
const INTEGER = /^[0-9]+$/u;

const SCENARIO_TOPOLOGY_REQUIREMENT = Object.freeze({
  minDistinctHosts: MIN_DISTINCT_HOSTS,
  spreadUnit: SPREAD_UNIT.HOST,
});

function ipv4LE(address) {
  assert.equal(typeof address, 'string', 'peer IP must be declared');
  const parts = address.split('.');
  assert.equal(parts.length, 4, 'N0 requires declared IPv4 host peers');
  let result = 0;
  for (let index = 0; index < parts.length; index++) {
    assert.match(parts[index], IP_OCTET);
    const octet = Number(parts[index]);
    assert.ok(Number.isInteger(octet) && octet >= 0 && octet <= 255);
    result = (result | (octet << (8 * index))) >>> 0;
  }
  return result >>> 0;
}

function parseRoutes(source) {
  assert.equal(typeof source, 'string');
  const rows = source.trim().split(/\r?\n/u).slice(1);
  const routes = [];
  for (const line of rows) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 8) continue;
    const [iface, dest, , flags, , , , mask] = fields;
    assert.match(iface, IFACE_NAME);
    assert.match(dest, ROUTE_FIELD);
    assert.match(flags, ROUTE_FLAGS);
    assert.match(mask, ROUTE_FIELD);
    if ((Number.parseInt(flags, 16) & 0x1) !== 0x1) continue;
    const maskN = Number.parseInt(mask, 16) >>> 0;
    routes.push({
      iface, destination: Number.parseInt(dest, 16) >>> 0,
      mask: maskN,
      bits: maskN.toString(2).replace(/0/gu, '').length,
    });
  }
  assert.ok(routes.length > 0, 'N0 requires an active peer route');
  return routes;
}

function ifaceForPeer(routes, ip) {
  const target = ipv4LE(ip);
  const matching = routes.filter((r) =>
    ((target & r.mask) >>> 0) === r.destination);
  assert.ok(matching.length > 0, 'no routable peer IP: ' + ip);
  const mostBits = Math.max(...matching.map((r) => r.bits));
  const interfaces = new Set(matching.filter((r) => r.bits === mostBits)
    .map((r) => r.iface));
  assert.equal(interfaces.size, 1, 'ambiguous peer interface: ' + ip);
  const [iface] = [...interfaces];
  assert.notEqual(iface, 'lo', 'inter-host peer cannot use loopback');
  return iface;
}

function parseCounterRow(source, wanted) {
  assert.equal(typeof source, 'string');
  for (const line of source.split(/\r?\n/u)) {
    const colon = line.indexOf(':');
    if (colon < 0 || line.slice(0, colon).trim() !== wanted) continue;
    const fields = line.slice(colon + 1).trim().split(/\s+/u);
    assert.ok(fields.length >= 16, 'N0 /proc/net/dev row incomplete');
    assert.match(fields[0], INTEGER);
    assert.match(fields[8], INTEGER);
    return {rx: BigInt(fields[0]), tx: BigInt(fields[8])};
  }
  assert.fail('N0 interface was not present in /proc/net/dev: ' + wanted);
}

function delta(before, after, name) {
  assert.ok(after >= before,
    'N0 interface ' + name + ' counter regressed');
  const value = after - before;
  assert.ok(value <= MAX_SAFE_DELTA, 'N0 counter delta exceeds safe Number');
  return Number(value);
}

async function readStaticPath(provider, containerId, filename) {
  const result = await provider.execInContainer(containerId, ['cat', filename]);
  assert.equal(result?.exitCode, 0,
    'N0 fixed read-only observation failed: ' + filename);
  assert.equal(typeof result.stdout, 'string');
  return result.stdout;
}

function collectTargets(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(Array.isArray(nodes) && nodes.length >= MIN_DISTINCT_HOSTS,
    'N0 requires three real running nodes');
  const hostIds = nodes.map((n) => n.hostIdentity);
  assert.ok(hostIds.every((id) => typeof id === 'string' && id.length > 0),
    'harness must have proved physical host identity');
  assert.ok(new Set(hostIds).size >= MIN_DISTINCT_HOSTS,
    'N0 host count derives ONLY from harness physical host identity');
  const assigned = cluster._hostAssignment;
  const providers = cluster._providers;
  const hostInfo = cluster._config?.docker?.hostInfo;
  assert.ok(Array.isArray(assigned) && Array.isArray(providers) &&
    Array.isArray(hostInfo), 'N0 requires existing harness provider facts');
  return nodes.map((node, index) => {
    const providerIndex = assigned[index];
    assert.ok(Number.isInteger(providerIndex) && providerIndex >= 0 &&
      providerIndex < providers.length, 'invalid provider assignment');
    const provider = providers[providerIndex];
    assert.equal(typeof provider?.inspectContainer, 'function');
    assert.equal(typeof provider?.execInContainer, 'function');
    const peerIps = hostInfo.filter((_, i) => i !== providerIndex)
      .map((entry) => entry?.internalIp);
    assert.ok(peerIps.length >= 2 &&
      peerIps.every((ip) => typeof ip === 'string'),
    'N0 requires at least two trusted peer host addresses');
    assert.ok(typeof node.containerId === 'string' &&
      node.containerId.length > 0, 'missing node container identity');
    return {
      nodeId: node.id, hostId: node.hostIdentity,
      provider, peerIps, containerId: node.containerId,
    };
  });
}

async function preflight(target) {
  const inspect = await target.provider.inspectContainer(target.containerId);
  assert.equal(inspect?.State?.Running, true, 'N0 node is not running');
  assert.equal(inspect?.HostConfig?.NetworkMode, 'host',
    'N0 requires the actual cross-machine host network namespace');
  const routes = parseRoutes(await readStaticPath(
    target.provider, target.containerId, '/proc/net/route'));
  const interfaces = new Set(target.peerIps.map((peer) =>
    ifaceForPeer(routes, peer)));
  assert.equal(interfaces.size, 1,
    'N0 peer routes span multiple interfaces; refuse partial measurement');
  const [iface] = [...interfaces];
  return {...target, iface};
}

async function sample(target, now) {
  const raw = await readStaticPath(
    target.provider, target.containerId, '/proc/net/dev');
  return {...parseCounterRow(raw, target.iface), atMs: now()};
}

function measurements(targets, before, after) {
  return targets.map((target, index) => {
    const start = before[index], end = after[index];
    const elapsedMs = end.atMs - start.atMs;
    assert.ok(Number.isFinite(elapsedMs) && elapsedMs > 0);
    const rxBytes = delta(start.rx, end.rx, 'rx');
    const txBytes = delta(start.tx, end.tx, 'tx');
    assert.ok(rxBytes > 0 && txBytes > 0,
      'N0 observed zero routed host bytes; no credible traffic baseline');
    return {nodeId: target.nodeId, hostId: target.hostId,
      interface: target.iface, elapsedMs, rxBytes, txBytes,
      rxBytesPerSecond: +(rxBytes * 1000 / elapsedMs).toFixed(2),
      txBytesPerSecond: +(txBytes * 1000 / elapsedMs).toFixed(2)};
  });
}

async function run(cluster, options = {}) {
  const targets = collectTargets(cluster);
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)));
  const requestedMs = options.intervalMs ?? BASELINE_WINDOW_MS;
  assert.ok(Number.isSafeInteger(requestedMs) &&
    requestedMs >= 1000 && requestedMs <= BASELINE_WINDOW_MS);
  const prepared = await Promise.all(targets.map(preflight));
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: CONVERGENCE_TIMEOUT_MS,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  const before = await Promise.all(prepared.map((target) =>
    sample(target, now)));
  await sleep(requestedMs);
  const after = await Promise.all(prepared.map((target) =>
    sample(target, now)));
  const perHost = measurements(prepared, before, after);
  return {
    schema: 'lagrange-n0-physical-host-wire/1',
    measurementKind: 'routed-host-interface-counters',
    networkModel: 'docker-host-network',
    spreadUnit: SPREAD_UNIT.HOST,
    distinctHosts: new Set(prepared.map((t) => t.hostId)).size,
    eligibility: 'idle-after-convergence',
    includesUnrelatedHostTraffic: true,
    appExclusiveBytes: false,
    interfaceCounterHeaderSemantics: 'kernel-and-driver-dependent',
    measuresPerPeerRtt: false,
    measuresRaftMessageKinds: false,
    convergence,
    sampleWindowTargetMs: requestedMs,
    perHost,
    aggregateHostTxBytes: perHost.reduce((sum, p) => sum + p.txBytes, 0),
    aggregateHostRxBytes: perHost.reduce((sum, p) => sum + p.rxBytes, 0),
  };
}

export {SCENARIO_TOPOLOGY_REQUIREMENT, run};
