// Scripted product answers for the deployer tests: what a healthy Lagrange,
// TiDB/TiKV or PostgreSQL deployment answers on the documented surfaces the
// deployers read (cited per surface in the deployer owners). Each builder
// returns rules for createScriptedSsh; a test prepends its own rules to make
// one surface fail. Substitutes the products only; see the ssh fixture for
// the evidence ceiling.

import {
  arrayFind,
  arrayFindIndex,
  arrayFlatMap,
  arrayJoin,
  arrayMap,
  stringIncludes,
  stringReplace,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';

const HEX = '0123456789abcdef';
const LAGRANGE_IMAGE = 'psvensson/lagrange:0.4.0';
const LAGRANGE_IMAGE_ID = `sha256:${'a'.repeat(64)}`;
const LAGRANGE_SRC_FINGERPRINT = 'sha256:feed';
const TIDB_IMAGE_ID = `sha256:${'b'.repeat(64)}`;
const POSTGRES_IMAGE_ID = `sha256:${'c'.repeat(64)}`;

function containerIdFor(index) {
  return Array.from({length: 64}, (_unused, at) => HEX[(index * 7 + at) % 16]).join('');
}

function imageOfRun(command) {
  const words = stringSplit(command, /\s+/u);
  return arrayFind(words, (word) =>
    /^((psvensson\/lagrange|pingcap\/(pd|tikv|tidb)|postgres|mysql)[:@]|sha256:[0-9a-f]{64}$)/u
      .test(word)) || 'unknown:0';
}

function entrypointOf(image) {
  if (image === LAGRANGE_IMAGE_ID) return ['/nodejs/bin/node'];
  if (stringStartsWith(image, 'psvensson/lagrange')) return ['/nodejs/bin/node'];
  if (stringStartsWith(image, 'pingcap/pd')) return ['/pd-server'];
  if (stringStartsWith(image, 'pingcap/tikv')) return ['/tikv-server'];
  if (stringStartsWith(image, 'pingcap/tidb')) return ['/tidb-server'];
  if (stringStartsWith(image, 'postgres')) return ['docker-entrypoint.sh'];
  return ['sleep'];
}

function imageIdOf(image) {
  if (stringStartsWith(image, 'sha256:')) return image;
  if (stringStartsWith(image, 'psvensson/lagrange')) return LAGRANGE_IMAGE_ID;
  if (stringStartsWith(image, 'pingcap/')) return TIDB_IMAGE_ID;
  return POSTGRES_IMAGE_ID;
}

function mountsOf(command) {
  return arrayMap([...command.matchAll(/-v (\/[^:\s]+):(\/[^\s:]+)/gu)], (match) => ({
    Type: 'bind', Source: match[1], Destination: match[2],
  }));
}

/**
 * Track every `docker run -d` so `docker inspect` of the returned id answers
 * with the image, entrypoint and mounts that run actually asked for. A test
 * can mark a container removed or stopped through `containers`.
 */
function createContainerLedger() {
  const containers = new Map();
  let next = 0;
  const run = (command, host) => {
    next += 1;
    const id = containerIdFor(next);
    const image = imageOfRun(command);
    const name = (command.match(/--name (\S+)/u) || [])[1] || `c${next}`;
    containers.set(id, {id, host, image, name, running: true, removed: false,
      mounts: mountsOf(command)});
    return `${id}\n`;
  };
  const inspect = (command) => {
    const id = stringSplit(stringTrim(command), /\s+/u).pop();
    const entry = containers.get(id);
    if (!entry || entry.removed) return new Error(`Error: No such container: ${id}`);
    return JSON.stringify({
      Id: entry.id, Name: `/${entry.name}`, Image: imageIdOf(entry.image),
      State: {Running: entry.running, Status: entry.running ? 'running' : 'exited',
        StartedAt: entry.startedAt || '2026-11-01T10:00:00.000Z'},
      Config: {Image: entry.image, Entrypoint: entrypointOf(entry.image), Cmd: ['serve']},
      Mounts: entry.mounts,
    });
  };
  const repoDigests = (command) => {
    const imageId = stringSplit(stringTrim(command), /\s+/u).pop();
    const digest = {[LAGRANGE_IMAGE_ID]: `psvensson/lagrange@sha256:${'1'.repeat(64)}`,
      [TIDB_IMAGE_ID]: `pingcap/tidb@sha256:${'2'.repeat(64)}`}[imageId] ||
      `postgres@sha256:${'3'.repeat(64)}`;
    return JSON.stringify({Id: imageId, RepoDigests: [digest], Created: '2026-10-30T10:00:00Z',
      RootFS: {Type: 'layers', Layers: [`sha256:${imageId.slice(-64)}`]},
      Config: {Labels: {'org.opencontainers.image.version': '0.4.0'}}});
  };
  // `docker start ID` / `docker stop -t 0 ID` flip the recorded state.
  const setRunning = (running) => (command) => {
    const entry = containers.get(stringSplit(stringTrim(command), /\s+/u).pop());
    if (!entry || entry.removed) return new Error('Error: No such container');
    entry.running = running;
    return `${entry.id}\n`;
  };
  return {containers, run, inspect, repoDigests, start: setRunning(true),
    stop: setRunning(false)};
}

function http(status, body) {
  return `${typeof body === 'string' ? body : JSON.stringify(body)}\nhttp_status=${status}`;
}

// Which product owns the listener on a port (the listener-ownership probe
// joins one container's pid namespace and answers owner=yes or owner=no).
const LISTENER_ROLE_OF_PORT = Object.freeze({4000: '-tidb-', 5432: '-postgres-primary-',
  5433: '-lagrange-node-'});

function listenerProbe(ledger) {
  return (command) => {
    const id = (/container:([0-9a-f]+)/u.exec(command) || [])[1];
    const port = stringTrim(stringSplit(stringTrim(command), /\s+/u).pop());
    const entry = ledger.containers.get(id);
    const role = LISTENER_ROLE_OF_PORT[stringReplace(port, /'/gu, '')];
    return entry && !entry.removed && role && stringIncludes(entry.name, role) ?
      'owner=yes' : 'owner=no';
  };
}

function dockerRules(ledger) {
  return [
    [/--pid container:/u, listenerProbe(ledger)],
    [/docker image inspect/u, (command) => ledger.repoDigests(command)],
    [/docker inspect --type container/u, (command) => ledger.inspect(command)],
    [/^docker run -d /u, (command, host) => ledger.run(command, host)],
    [/^docker start [0-9a-f]+$/u, (command) => ledger.start(command)],
    [/^docker stop -t 0 [0-9a-f]+$/u, (command) => ledger.stop(command)],
  ];
}

const LAGRANGE_NODE_IDS = ['00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];

const CANONICAL_TABLE_NAMES = Object.freeze(['warehouse', 'district', 'customer', 'item',
  'stock', 'orders', 'new_order', 'order_line', 'history']);

// The Lagrange system tables over the public PG wire (psql, header line +
// '|'-separated rows): every node active with a live lease and a ready
// connection, a healthy sys-postgres-wire endpoint, and every partition led
// and replicated on all nodes.
const PRIORITY_PARTITIONS = Object.freeze(['control_plane_publications-p1',
  'replica_operations-p1', 'schema_operations-p1', 'sql_transaction_participants-p1',
  'sql_transactions-p1', 'sql_write_operations-p1']);

function lagrangeSystemTableRules(nodeIds, hosts) {
  const partitionIds = [...PRIORITY_PARTITIONS,
    ...arrayMap(CANONICAL_TABLE_NAMES, (table) => `p-${table}`)];
  const tableOf = (id) => (stringStartsWith(id, 'p-') ? id.slice(2) : 'system');
  const partitions = arrayMap(partitionIds, (id) => `${id}|${tableOf(id)}|3|${nodeIds[0]}`);
  const services = arrayFlatMap(partitionIds, (id) => arrayMap(nodeIds,
    (nodeId, index) => `${id}|${nodeId}|active|${index === 0 ? 'leader' : 'follower'}`));
  const snapshotOf = (command) => {
    const index = arrayFindIndex(hosts, (host) => stringIncludes(command, `//${host}:`));
    const nodeId = nodeIds[index];
    return http(200, {nodeId, replicaOperations: {inFlightCount: 0},
      controlPlaneDiagnostics: {readinessByNodeId: {[nodeId]: {serveEligible: true,
        reasonCodes: []}}}});
  };
  return [
    [/FROM nodes'/u, () => arrayJoin(
      ['node_id|status|connection_state|ready_lease_expires_at|last_heartbeat',
        ...arrayMap(nodeIds, (nodeId) =>
          `${nodeId}|active|ready|${Date.now() + 3600000}|${Date.now() - 1000}`)], '\n')],
    [/FROM service_endpoints'/u, arrayJoin(['service_id|node_id|protocol|port|health_status',
      `sys-postgres-wire|${nodeIds[0]}|postgresql|5433|healthy`], '\n')],
    [/FROM partitions'/u, arrayJoin(['partition_id|table_name|replica_count|leader_node_id',
      ...partitions], '\n')],
    [/\/api\/admin\/control-snapshot/u, snapshotOf],
    [/SELECT COUNT\(\*\) AS row_count FROM/u, 'row_count\n0'],
    [/FROM services WHERE/u, arrayJoin(['partition_id|node_id|status|raft_role', ...services],
      '\n')],
    [/CREATE TABLE IF NOT EXISTS bench_readiness_probe/u, 'CREATE TABLE'],
    [/INSERT INTO bench_readiness_probe/u, 'INSERT 0 1'],
    [/SELECT token FROM bench_readiness_probe/u, (command) => {
      const campaign = (/lagrange\.bench\.campaign=(\S+)/u.exec(command) || [])[1];
      const id = (/WHERE id = (\d+)/u.exec(command) || [])[1];
      return `token\n${campaign}-${id}`;
    }],
    [/grep -m 1 bootedSrcFingerprint/u, '{"subsystem":"main","version":"0.4.0",' +
      '"bootedSrcFingerprint":"sha256:feed"}'],
  ];
}

function lagrangeHealthyRules(ledger, {hosts = ['10.0.0.1', '10.0.0.2', '10.0.0.3']} = {}) {
  const seedHost = hosts[0];
  return [
    ...lagrangeSystemTableRules(LAGRANGE_NODE_IDS.slice(0, hosts.length), hosts),
    ...dockerRules(ledger),
    [/\/readyz/u, (command) => {
      if (!stringIncludes(command, `//${seedHost}:8080/readyz`)) {
        let runningNodeCount = 0;
        for (const entry of ledger.containers.values()) {
          if (entry.running && stringIncludes(entry.name, '-lagrange-node-')) {
            runningNodeCount += 1;
          }
        }
        if (runningNodeCount < hosts.length) {
          return http(503, {
            ready: false,
            phase: 'DEGRADED',
            state: 'degraded',
            reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
            priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
          });
        }
      }
      return http(200, {ready: true, phase: 'ready', state: 'ready', reasons: []});
    }],
    [/\/health/u, '{"status":"healthy","ready":true}'],
    [/\/management\/v1\/facts/u, http(200, {facts: {release: {version: '0.4.0'},
      topology: {nodeCount: hosts.length, readyNodeCount: hosts.length}}})],
    [/sys-postgres-wire\/scale/u, http(200, {success: true, outcome: 'applied'})],
    [/\/api\/admin\/discovery\/services/u, http(200, {services: [{serviceIds: ['sys-postgres-wire'],
      replicas: [{serviceId: 'sys-postgres-wire', nodeId: LAGRANGE_NODE_IDS[0],
        address: hosts[0], port: 5433, healthStatus: 'healthy'}]}]})],
    // The product's partition diagnostics shape (admin-control-snapshot-local-
    // diagnostics-methods.js): leaders and partitionsById are always answered.
    [/\/api\/admin\/diagnostics\/partitions/u, http(200, {partitionCount: 1,
      leaders: {p1: LAGRANGE_NODE_IDS[0]},
      partitionsById: {p1: {partitionId: 'p1', tableName: 'stock',
        leaderNodeId: LAGRANGE_NODE_IDS[0],
        replicas: arrayMap(LAGRANGE_NODE_IDS.slice(0, hosts.length),
          (nodeId) => ({nodeId, status: 'active'}))}}})],
  ];
}


const PG_VERSION = 'PostgreSQL 17.6 on x86_64-pc-linux-musl, compiled by gcc';

function postgresHealthyRules(ledger, {standbys = ['s1', 's2']} = {}) {
  const replication = arrayMap(standbys, (name, index) =>
    `${name}|streaming|${index === 0 ? 'sync' : 'potential'}`).join('\n');
  return [
    ...dockerRules(ledger),
    [/pg_isready/u, '127.0.0.1:5432 - accepting connections'],
    [/SELECT version\(\)/u, PG_VERSION],
    [/FROM pg_stat_replication/u, replication],
    [/SHOW synchronous_standby_names/u, standbys.length > 0 ?
      `FIRST 1 (${standbys.join(', ')})` : ''],
    [/pg_is_in_recovery/u, (_command, host) => (host === '10.0.0.1' ? 'f' : 't')],
    [/pg_hba_file_rules/u, (command) => stringIncludes(command, 'replication') ?
      'host|{replication}|{replicator}|10.0.0.2|scram-sha-256' :
      'host|{bench}|{bench}|10.0.0.9|scram-sha-256'],
  ];
}

const TIDB_RELEASE = 'Release Version: v8.5.8\\nEdition: Community';

function tidbHealthyRules(ledger) {
  return [
    ...dockerRules(ledger),
    [/tidb_version\(\)/u, `${TIDB_RELEASE}\n__exit_code=0`],
    [/CLUSTER_INFO/u, () => {
      const lines = [];
      for (const entry of ledger.containers.values()) {
        const type = (/pingcap\/(pd|tikv|tidb):/u.exec(entry.image) || [])[1];
        const port = {pd: 2379, tikv: 20160, tidb: 4000}[type];
        if (type) lines.push(`${type}\t${entry.host}:${port}\t8.5.8`);
      }
      return `${arrayJoin(lines, '\n')}\n__exit_code=0`;
    }],
    [/^docker exec \S+ 'mysql'/u, '1\n__exit_code=0'],
    [/\/pd\/api\/v1\/health/u, http(200, [{name: 'pd1', health: true}])],
  ];
}

export {
  LAGRANGE_IMAGE,
  LAGRANGE_IMAGE_ID,
  LAGRANGE_SRC_FINGERPRINT,
  postgresHealthyRules,
  tidbHealthyRules,
  createContainerLedger,
  dockerRules,
  http,
  lagrangeHealthyRules,
};
