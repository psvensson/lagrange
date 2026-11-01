// Scripted product answers for the deployer tests: what a healthy Lagrange,
// TiDB/TiKV or PostgreSQL deployment answers on the documented surfaces the
// deployers read (cited per surface in the deployer owners). Each builder
// returns rules for createScriptedSsh; a test prepends its own rules to make
// one surface fail. Substitutes the products only; see the ssh fixture for
// the evidence ceiling.

import {
  arrayFind,
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
const TIDB_IMAGE_ID = `sha256:${'b'.repeat(64)}`;
const POSTGRES_IMAGE_ID = `sha256:${'c'.repeat(64)}`;

function containerIdFor(index) {
  return Array.from({length: 64}, (_unused, at) => HEX[(index * 7 + at) % 16]).join('');
}

function imageOfRun(command) {
  const words = stringSplit(command, /\s+/u);
  return arrayFind(words, (word) => /^(psvensson\/lagrange|pingcap\/(pd|tikv|tidb)|postgres|mysql):/u
    .test(word)) || 'unknown:0';
}

function entrypointOf(image) {
  if (stringStartsWith(image, 'psvensson/lagrange')) return ['/nodejs/bin/node'];
  if (stringStartsWith(image, 'pingcap/pd')) return ['/pd-server'];
  if (stringStartsWith(image, 'pingcap/tikv')) return ['/tikv-server'];
  if (stringStartsWith(image, 'pingcap/tidb')) return ['/tidb-server'];
  if (stringStartsWith(image, 'postgres')) return ['docker-entrypoint.sh'];
  return ['sleep'];
}

function imageIdOf(image) {
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
      State: {Running: entry.running, Status: entry.running ? 'running' : 'exited'},
      Config: {Image: entry.image, Entrypoint: entrypointOf(entry.image), Cmd: ['serve']},
      Mounts: entry.mounts,
    });
  };
  const repoDigests = (command) => {
    const imageId = stringSplit(stringTrim(command), /\s+/u).pop();
    if (imageId === LAGRANGE_IMAGE_ID) return `["psvensson/lagrange@sha256:${'1'.repeat(64)}"]`;
    if (imageId === TIDB_IMAGE_ID) return `["pingcap/tidb@sha256:${'2'.repeat(64)}"]`;
    return `["postgres@sha256:${'3'.repeat(64)}"]`;
  };
  return {containers, run, inspect, repoDigests};
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
  ];
}

const LAGRANGE_NODE_IDS = ['00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];

function lagrangeHealthyRules(ledger, {hosts = ['10.0.0.1', '10.0.0.2', '10.0.0.3']} = {}) {
  return [
    ...dockerRules(ledger),
    [/\/readyz/u, http(200, {ready: true, phase: 'ready', state: 'ready', reasons: []})],
    [/\/health/u, '{"status":"healthy","ready":true}'],
    [/\/management\/v1\/facts/u, http(200, {release: {version: '0.4.0'},
      topology: {nodeCount: hosts.length, readyNodeCount: hosts.length}})],
    [/sys-postgres-wire\/scale/u, http(200, {success: true, outcome: 'applied'})],
    [/\/api\/admin\/discovery\/services/u, http(200, {services: [{serviceIds: ['sys-postgres-wire'],
      replicas: [{serviceId: 'sys-postgres-wire', nodeId: LAGRANGE_NODE_IDS[0],
        address: hosts[0], port: 5433, healthStatus: 'healthy'}]}]})],
    [/\/api\/admin\/diagnostics\/partitions/u, http(200, {partitionCount: 1,
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
  PG_VERSION,
  TIDB_RELEASE,
  postgresHealthyRules,
  tidbHealthyRules,
  LAGRANGE_NODE_IDS,
  createContainerLedger,
  dockerRules,
  http,
  lagrangeHealthyRules,
};
