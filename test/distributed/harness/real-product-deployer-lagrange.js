/**
 * Lagrange arm of the comparative benchmark: N product nodes from the
 * campaign's image, ready only by the product's own contracts, with the
 * public PostgreSQL wire listener the canonical adapter connects to.
 *
 * Product contracts read (owners cited):
 * - per-node readiness `GET :8080/readyz` -> 200 `{ready: true}`
 *   (src/bootstrap/owners/bootstrap-readiness-owner.js handleReadinessProbeRequest);
 * - membership and release `GET :8080/management/v1/facts` ->
 *   `topology.readyNodeCount`, `release.version`
 *   (src/bootstrap/owners/management-v1-owner.js buildFacts);
 * - public PG wire `POST :8081/api/admin/services/sys-postgres-wire/scale`
 *   (src/admin/admin-owner-operations.js; the same desired state as
 *   oltp-scenario-a-lagrange-public-pg-context.js) and its healthy endpoint
 *   `GET :8081/api/admin/discovery/services?serviceId=sys-postgres-wire`
 *   (src/admin/admin-websocket-diagnostics-route-methods.js);
 * - partition leaders and replica placement
 *   `GET :8081/api/admin/diagnostics/partitions`
 *   (src/admin/admin-control-snapshot-local-diagnostics-methods.js);
 * - cluster readiness from the system tables over the public PG wire
 *   (real-product-lagrange-readiness-evaluation.js): live ready leases and
 *   connection_state for every node, healthy service endpoints, a routable,
 *   fully replicated leader for every partition - and, after the dataset is
 *   loaded, for every partition of every canonical table - then a probe write
 *   and read-back through the same public wire. `/health` is never readiness.
 * Boot provenance is the product's own startup log line
 * (`version`, `bootedSrcFingerprint`).
 */
import {REQUEST_CELL_AUTH} from './constants.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayFlatMap,
  arrayMap,
  stringIndexOf,
  stringReplace,
  stringPadStart,
} from './real-product-captured-intrinsics.js';
import {
  LAGRANGE_IMAGE_DEFAULT,
  READINESS_STATE,
  requireCampaignId,
  resolveReadinessBudget,
} from './real-product-deployment-contract.js';
import {
  classifyStorage,
  inspectProducts,
  runClassOf,
  verifyProductIdentity,
} from './real-product-identity.js';
import {TABLES as CANONICAL_TABLES} from '../reference-client/oltp-state-snapshot-shared.js';
import {evaluateLagrangeClusterReadiness} from './real-product-lagrange-readiness-evaluation.js';
import {pollReadiness} from './real-product-readiness.js';
import {
  dockerRunDetached,
  errorText,
  httpFromHost,
  shellWord,
} from './real-product-remote-shell.js';
import {
  bindEndpointToContainer,
  createPsqlQueryReader,
} from './real-product-sql-clients.js';

const PORT = Object.freeze({REST: 8080, ADMIN: 8081, TRANSPORT: 8082});
const DATA_DIR = '/var/lib/lagrange-data';
const NODE_ROLE = 'lagrange-node';
const LISTENER_ROLE = 'sys-postgres-wire';
const PG_WIRE_SERVICE_ID = 'sys-postgres-wire';
const HTTP_OK = 200;
const HEALTHY = 'healthy';
const PG_WIRE_DESIRED_STATE = Object.freeze({replicaCount: 1,
  runtimeConfig: Object.freeze({host: '0.0.0.0', authMode: 'password', tlsMode: 'disable'})});
const NODE_ID_PREFIX = '00000000-0000-4000-8000-';
const NODE_ID_WIDTH = 12;
const SEMVER_TAG = /:(\d+\.\d+\.\d+)$/u;
const SYSTEM_TABLE_QUERIES = Object.freeze({
  nodes: 'SELECT * FROM nodes',
  endpoints: 'SELECT * FROM service_endpoints',
  partitions: 'SELECT * FROM partitions',
  services: 'SELECT * FROM services WHERE service_type = \'partition\'',
});
const PROBE_TABLE = 'bench_readiness_probe';
const BOOT_PROVENANCE_MARKER = 'bootedSrcFingerprint';

function nodeIdOf(index) {
  return `${NODE_ID_PREFIX}${stringPadStart(String(index + 1), NODE_ID_WIDTH, '0')}`;
}

function nodeEnv({nodeId, host, seedHost, connection}) {
  const env = {
    NODE_ID: nodeId, DATA_DIR, NODE_ADDRESS: `${host}:${PORT.REST}`,
    REST_API_PORT: PORT.REST, ADMIN_WS_PORT: PORT.ADMIN, TRANSPORT_WS_PORT: PORT.TRANSPORT,
    TRANSPORT_WS_HOST: '0.0.0.0', ADMIN_WS_HOST: '0.0.0.0',
    ADMIN_ALLOW_INSECURE_EXTERNAL_BIND: 'true',
    PGWIRE_AUTH_USER: connection.user, PGWIRE_AUTH_PASSWORD: connection.password,
    PGWIRE_AUTH_DATABASE: connection.database,
  };
  if (seedHost !== host) env.SEED_NODE_ADDRESS = `${seedHost}:${PORT.REST}`;
  return arrayFlatMap(Object.entries(env), ([key, value]) => ['-e', `${key}=${value}`]);
}

function storageArgs(opts, campaignId, index) {
  return opts.storageRoot ?
    ['-v', `${opts.storageRoot}/${campaignId}/lagrange-${index + 1}:${DATA_DIR}`] : [];
}

function versionPatternOf(imageRef) {
  const match = SEMVER_TAG.exec(String(imageRef));
  return match ? new RegExp(`^${stringReplace(match[1], /\./gu, '\\.')}$`, 'u') : /\S/u;
}

async function getJson(ctx, url) {
  return httpFromHost({sshRun: ctx.sshRun, opts: ctx.opts, from: ctx.clientIp, url});
}

function readinessOf(ctx, component, probe) {
  return pollReadiness({component, probe, attempts: ctx.budget.attempts,
    intervalMs: ctx.budget.intervalMs, sleep: ctx.sleep});
}

function nodeReady(ctx, host) {
  return readinessOf(ctx, `${NODE_ROLE}@${host}`, async () => {
    const answer = await getJson(ctx, `http://${host}:${PORT.REST}/readyz`);
    return {ready: answer.status === HTTP_OK && answer.json?.ready === true,
      diagnostic: answer.json ?? answer.body ?? answer.error};
  });
}

function membershipReady(ctx, seedHost, nodeCount) {
  return readinessOf(ctx, 'lagrange-membership', async () => {
    const answer = await getJson(ctx, `http://${seedHost}:${PORT.REST}/management/v1/facts`);
    return {ready: answer.json?.topology?.readyNodeCount === nodeCount,
      diagnostic: answer.json?.topology ?? answer.body ?? answer.error};
  });
}

function healthyListener(services, roles) {
  const replicas = arrayFlatMap(Array.isArray(services) ? services : [],
    (service) => (Array.isArray(service?.replicas) ? service.replicas : []));
  const replica = arrayFind(replicas, (one) => one?.serviceId === PG_WIRE_SERVICE_ID &&
    one?.healthStatus === HEALTHY && Number.isInteger(Number(one?.port)) && one?.port > 0);
  const node = replica && arrayFind(roles, (role) => role.nodeId === replica.nodeId);
  return node ? {host: node.host, port: Number(replica.port), nodeId: replica.nodeId,
    advertisedAddress: replica.address ?? null} : null;
}

async function publicPgWireReady(ctx, seedHost, roles) {
  const admin = `http://${seedHost}:${PORT.ADMIN}`;
  let listener = null;
  await readinessOf(ctx, 'lagrange-public-pg-wire', async () => {
    const scale = await httpFromHost({sshRun: ctx.sshRun, opts: ctx.opts, from: ctx.clientIp,
      url: `${admin}/api/admin/services/${PG_WIRE_SERVICE_ID}/scale`, method: 'POST',
      body: PG_WIRE_DESIRED_STATE});
    if (scale.json?.success !== true || scale.json?.outcome !== 'applied') {
      return {ready: false, diagnostic: {scale: scale.json ?? scale.body ?? scale.error}};
    }
    const found = await getJson(ctx,
      `${admin}/api/admin/discovery/services?serviceId=${PG_WIRE_SERVICE_ID}`);
    listener = healthyListener(found.json?.services, roles);
    return {ready: listener !== null, diagnostic: {discovery: found.json ?? found.error}};
  });
  return listener;
}

function placementOf(diagnostics, roles, observedAt) {
  const partitions = Object.values(diagnostics?.partitionsById || {});
  const hostOf = (nodeId) => arrayFind(roles, (role) => role.nodeId === nodeId)?.host ?? null;
  return {observedAt, source: '/api/admin/diagnostics/partitions',
    replicasByPartition: arrayMap(partitions, (partition) => ({
      partitionId: partition.partitionId, tableName: partition.tableName ?? null,
      leaderNodeId: partition.leaderNodeId ?? null, leaderHost: hostOf(partition.leaderNodeId),
      replicas: arrayMap(partition.replicas || [], (replica) => ({nodeId: replica.nodeId,
        host: hostOf(replica.nodeId), status: replica.status ?? null}))}))};
}

async function readPartitions(ctx, seedHost) {
  const answer = await getJson(ctx,
    `http://${seedHost}:${PORT.ADMIN}/api/admin/diagnostics/partitions`);
  return answer.status === HTTP_OK ? answer.json : null;
}

function leadersReady(ctx, seedHost) {
  return readinessOf(ctx, 'lagrange-partition-leaders', async () => {
    const diagnostics = await readPartitions(ctx, seedHost);
    const partitions = Object.values(diagnostics?.partitionsById || {});
    return {ready: partitions.length > 0 &&
      arrayEvery(partitions, (partition) => Boolean(partition.leaderNodeId)),
    diagnostic: diagnostics ? {partitionCount: partitions.length,
      leaders: diagnostics.leaders ?? null} : 'partition diagnostics unavailable'};
  });
}

async function readSystemTables(query) {
  const tables = {};
  for (const [name, sql] of Object.entries(SYSTEM_TABLE_QUERIES)) tables[name] = await query(sql);
  return tables;
}

function clusterReady(ctx, component, query, expectedNodeIds, requiredTables = null) {
  return readinessOf(ctx, component, async () => {
    const tables = await readSystemTables(query);
    const verdict = evaluateLagrangeClusterReadiness({...tables, expectedNodeIds,
      requiredServiceIds: [PG_WIRE_SERVICE_ID], requiredTables, now: Date.now()});
    return {ready: verdict.ready, diagnostic: {denials: verdict.denials,
      nodes: tables.nodes.length, partitions: tables.partitions.length}};
  });
}

function probeWriteReadback(ctx, query, campaignId) {
  return readinessOf(ctx, 'lagrange-probe-write-readback', async () => {
    const id = Date.now();
    const token = `${campaignId}-${id}`;
    await query(`CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (id BIGINT PRIMARY KEY, token TEXT)`);
    await query(`INSERT INTO ${PROBE_TABLE} (id, token) VALUES (${id}, '${token}')`);
    const rows = await query(`SELECT token FROM ${PROBE_TABLE} WHERE id = ${id}`);
    return {ready: rows.length === 1 && rows[0].token === token,
      diagnostic: {written: token, readBack: rows}};
  });
}

async function bootProvenance(ctx, product) {
  try {
    const line = String(await ctx.sshRun(product.host, ctx.opts,
      `docker logs ${shellWord(product.containerId)} 2>&1 | grep -m 1 ${BOOT_PROVENANCE_MARKER}`));
    const parsed = JSON.parse(line.slice(stringIndexOf(line, '{')));
    return {version: parsed.version ?? null,
      bootedSrcFingerprint: parsed.bootedSrcFingerprint ?? null,
      subsystem: parsed.subsystem ?? null};
  } catch (error) {
    return {unavailable: errorText(error)};
  }
}

async function reportedVersions(ctx, products) {
  for (const product of products) {
    const facts = await getJson(ctx, `http://${product.host}:${PORT.REST}/management/v1/facts`);
    product.reportedVersion = facts.json?.release?.version ?? null;
    product.bootProvenance = await bootProvenance(ctx, product);
  }
  return products;
}

/**
 * @param {{hosts: Array<string>, clientIp: string, sshRun: Function,
 *   opts: Object, campaignId: string, sleep: Function}} input
 * @return {Promise<Object>} the deployment (record fields + `access` and
 *   `operations`, which the record never carries)
 */
async function deployLagrangeCluster({hosts, clientIp, sshRun, opts, campaignId, sleep}) {
  requireCampaignId(campaignId);
  const image = opts.lagrangeImage || LAGRANGE_IMAGE_DEFAULT;
  const ctx = {sshRun, opts, clientIp, sleep, budget: resolveReadinessBudget(opts)};
  const connection = {user: REQUEST_CELL_AUTH.USER, password: REQUEST_CELL_AUTH.PASSWORD,
    database: REQUEST_CELL_AUTH.DATABASE};
  const seedHost = hosts[0];
  const roles = [];
  const nodeReadiness = [];
  for (let index = 0; index < hosts.length; index += 1) {
    const host = hosts[index];
    const nodeId = nodeIdOf(index);
    const started = await dockerRunDetached({sshRun, opts, host, campaignId, role: NODE_ROLE,
      ordinal: index + 1, image,
      dockerArgs: [...storageArgs(opts, campaignId, index),
        ...nodeEnv({nodeId, host, seedHost, connection})]});
    roles.push({role: NODE_ROLE, host, containerId: started.containerId, nodeId});
    nodeReadiness.push(await nodeReady(ctx, host));
  }
  const membership = await membershipReady(ctx, seedHost, hosts.length);
  const listener = await publicPgWireReady(ctx, seedHost, roles);
  const leaders = await leadersReady(ctx, seedHost);
  const query = createPsqlQueryReader({sshRun, opts, from: clientIp, campaignId,
    endpoint: {host: listener.host, port: listener.port}, connection});
  const expectedNodeIds = arrayMap(roles, (role) => role.nodeId);
  const cluster = await clusterReady(ctx, 'lagrange-system-tables', query, expectedNodeIds);
  const probe = await probeWriteReadback(ctx, query, campaignId);
  const products = verifyProductIdentity(
    await reportedVersions(ctx, await inspectProducts({sshRun, opts, roles})),
    {[NODE_ROLE]: {imageRef: image, versionPattern: versionPatternOf(image)}});
  const binding = await bindEndpointToContainer({sshRun, opts, campaignId,
    endpoint: {host: listener.host, port: listener.port},
    candidates: arrayFilter(roles, (role) => role.host === listener.host)});
  roles.push({role: LISTENER_ROLE, host: listener.host, containerId: binding.containerId,
    nodeId: listener.nodeId});
  const storage = arrayMap(products, (product) => classifyStorage(product, DATA_DIR));
  const endpoint = {protocol: 'postgresql', serviceId: PG_WIRE_SERVICE_ID,
    host: listener.host, port: listener.port, containerId: binding.containerId,
    binding};
  const observedAt = new Date().toISOString();
  return {
    targetId: 'lagrange',
    topology: {description: `${hosts.length} Lagrange nodes; clients use the public ` +
      'PostgreSQL wire listener directly', clientPath: 'public-pg-wire'},
    roles, storage, runClass: runClassOf(storage),
    readiness: {state: READINESS_STATE.READY, observedAt,
      evidence: {nodes: nodeReadiness, membership, publicPgWire: listener, leaders, cluster,
        probe}},
    identity: {products},
    placement: placementOf(await readPartitions(ctx, seedHost), roles, observedAt),
    endpoint,
    access: {connection},
    operations: {
      // After the canonical load: every partition of every canonical table
      // routable and replicated, or a typed readiness exhaustion.
      observePlacement: async () => {
        const routable = await clusterReady(ctx, 'lagrange-canonical-tables-routable', query,
          expectedNodeIds, arrayMap(CANONICAL_TABLES, (table) => table.name));
        return {...placementOf(await readPartitions(ctx, seedHost), roles,
          new Date().toISOString()), routable};
      },
      // The arm's readiness contract again (after a product restart).
      awaitReady: async () => ({cluster: await clusterReady(ctx, 'lagrange-system-tables', query,
        expectedNodeIds), probe: await probeWriteReadback(ctx, query, campaignId)}),
      observeRoles: async () => ({leaders: (await readPartitions(ctx, seedHost))?.leaders ??
        null}),
    },
  };
}

export {deployLagrangeCluster};
