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
  stringLastIndexOf,
  stringPadStart,
  stringReplace,
  stringStartsWith,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  LAGRANGE_IMAGE_DEFAULT,
  READINESS_STATE,
  deploymentFailure,
  requireCampaignId,
  resolveReadinessBudget,
} from './real-product-deployment-contract.js';
import {
  classifyStorage,
  inspectProducts,
  pinnedVersionPattern,
  runClassOf,
  verifyProductIdentity,
} from './real-product-identity.js';
import {TABLES as CANONICAL_TABLES} from '../reference-client/oltp-state-snapshot-shared.js';
import {
  evaluateLagrangeClusterReadiness,
  evaluateLagrangeServeLane,
} from './real-product-lagrange-readiness-evaluation.js';
import {
  describeExhaustedDeployment,
  describingReadinessExhaustion,
} from './real-product-exhausted-deployment.js';
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
  createPsqlStatementRunner,
} from './real-product-sql-clients.js';

const PORT = Object.freeze({REST: 8080, ADMIN: 8081, TRANSPORT: 8082});
// The image's data directory: the one its Dockerfile hands to the non-root
// runtime USER (`chown 10001:10001 /data`); a path outside it fails with
// EACCES at startup.
const DATA_DIR = '/data';
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
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SYSTEM_TABLE_QUERIES = Object.freeze({
  nodes: 'SELECT * FROM nodes',
  endpoints: 'SELECT * FROM service_endpoints',
  partitions: 'SELECT * FROM partitions',
  services: 'SELECT * FROM services WHERE service_type = \'partition\'',
});
const PROBE_TABLE = 'bench_readiness_probe';
const PROBE_VISIBILITY_SINGLE_LISTENER = 'single-listener';
const REVISION_LABEL = 'org.opencontainers.image.revision';
// The canonical tables' routability after CREATE TABLE: on the 2026-11-01 lab
// a 5-node cluster needed 2 min 41 s for its first table and 3-/4-node
// clusters none within 13-21 min (live-diagnosis-2026-11-01.md). The bound is
// 15 polls a minute for 15 minutes (5.6x the one routable observation); it is
// recorded with the outcome, and exhaustion is the arm's product failure.
const ROUTABLE_ATTEMPTS = 900;
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

function normalizeImageDigest(digest, image) {
  const text = stringTrim(String(digest ?? ''));
  const normalized = stringStartsWith(text, '@') ? text.slice(1) : text;
  if (!SHA256_DIGEST_PATTERN.test(normalized)) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `Lagrange image digest must be sha256:<64 hex>, got ${digest}`, {image, digest});
  }
  return normalized;
}

function imageRepositoryOf(imageRef) {
  const text = stringTrim(String(imageRef || ''));
  const digestAt = stringIndexOf(text, '@');
  const name = digestAt === -1 ? text : text.slice(0, digestAt);
  const tagAt = stringLastIndexOf(name, ':');
  return tagAt > stringLastIndexOf(name, '/') ? name.slice(0, tagAt) : name;
}

function semverTagOf(imageRef) {
  const text = stringTrim(String(imageRef || ''));
  const digestAt = stringIndexOf(text, '@');
  const name = digestAt === -1 ? text : text.slice(0, digestAt);
  const match = SEMVER_TAG.exec(name);
  return match ? match[1] : null;
}

function rawImageOf(opts) {
  return stringTrim(String(opts.lagrangeImage || opts.image || LAGRANGE_IMAGE_DEFAULT));
}

function digestOptionOf(opts) {
  return opts.lagrangeImageDigest || opts.imageDigest || null;
}

function requiresImagePin(opts) {
  const targetNeedsPin = Boolean(opts.storageRoot || opts.requireImagePin ||
    opts.remoteComparative || opts.executionTarget === 'gcp');
  return targetNeedsPin && !opts.localBuild && !opts.lagrangeImageContent &&
    !opts.lagrangeImageByHost;
}

function resolveInlineDigestImage(rawImage, digestAt, digestOpt) {
  const inlineDigest = normalizeImageDigest(rawImage.slice(digestAt + 1), rawImage);
  if (digestOpt !== null && normalizeImageDigest(digestOpt, rawImage) !== inlineDigest) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `Lagrange image digest ${inlineDigest} conflicts with pinned ${digestOpt}`,
      {image: rawImage, digest: digestOpt});
  }
  return `${imageRepositoryOf(rawImage)}@${inlineDigest}`;
}

function resolveLagrangeContainerImage(opts = {}) {
  const rawImage = rawImageOf(opts);
  const digestOpt = digestOptionOf(opts);
  const digestAt = stringIndexOf(rawImage, '@');
  if (digestAt !== -1) return resolveInlineDigestImage(rawImage, digestAt, digestOpt);
  if (digestOpt !== null) {
    return `${imageRepositoryOf(rawImage)}@${normalizeImageDigest(digestOpt, rawImage)}`;
  }
  if (requiresImagePin(opts)) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `Lagrange image must be pinned by @sha256 digest or content identity, got ${rawImage}`,
      {image: rawImage});
  }
  return rawImage;
}

// A digest reference pins the artifact but not a version string: the expected
// product version then comes from the campaign (opts.lagrangeVersion).
function versionPatternOf(imageRef, expectedVersion) {
  if (expectedVersion) return new RegExp(`^${stringReplace(expectedVersion, /\./gu, '\\.')}$`, 'u');
  return pinnedVersionPattern(imageRef, SEMVER_TAG,
    (version) => new RegExp(`^${stringReplace(version, /\./gu, '\\.')}$`, 'u'));
}

async function getJson(ctx, url) {
  return httpFromHost({sshRun: ctx.sshRun, opts: ctx.opts, from: ctx.clientIp, url});
}

function getFacts(ctx, host) {
  return httpFromHost({sshRun: ctx.sshRun, opts: ctx.opts, from: ctx.clientIp,
    url: `http://${host}:${PORT.REST}/management/v1/facts`, basicAuth: ctx.connection});
}

function readinessOf(ctx, component, probe, stablePolls = 1) {
  return pollReadiness({component, probe, attempts: ctx.budget.attempts,
    intervalMs: ctx.budget.intervalMs, sleep: ctx.sleep, stablePolls});
}

function nodeReady(ctx, host) {
  return readinessOf(ctx, `${NODE_ROLE}@${host}`, async () => {
    const answer = await getJson(ctx, `http://${host}:${PORT.REST}/readyz`);
    return {ready: answer.status === HTTP_OK && answer.json?.ready === true,
      diagnostic: answer};
  });
}

function membershipReady(ctx, seedHost, nodeCount) {
  return readinessOf(ctx, 'lagrange-membership', async () => {
    const answer = await getFacts(ctx, seedHost);
    return {ready: answer.json?.facts?.topology?.readyNodeCount === nodeCount,
      diagnostic: answer};
  });
}

function healthyListener(services, roles) {
  const replicas = arrayFlatMap(Array.isArray(services) ? services : [],
    (service) => (Array.isArray(service?.replicas) ? service.replicas : []));
  const replica = arrayFind(replicas, (one) => one?.serviceId === PG_WIRE_SERVICE_ID &&
    one?.healthStatus === HEALTHY && Number.isInteger(Number(one?.port)) && one?.port > 0);
  const node = replica && arrayFind(roles, (role) => role.nodeId === replica.nodeId);
  return node ? {host: node.host, port: Number(replica.port), nodeId: replica.nodeId} : null;
}

async function publicPgWireReady(ctx, seedHost, roles) {
  const admin = `http://${seedHost}:${PORT.ADMIN}`;
  let listener = null;
  await readinessOf(ctx, 'lagrange-public-pg-wire', async () => {
    const scale = await httpFromHost({sshRun: ctx.sshRun, opts: ctx.opts, from: ctx.clientIp,
      url: `${admin}/api/admin/services/${PG_WIRE_SERVICE_ID}/scale`, method: 'POST',
      body: PG_WIRE_DESIRED_STATE});
    if (scale.json?.success !== true || scale.json?.outcome !== 'applied') {
      return {ready: false, diagnostic: {scale}};
    }
    const found = await getJson(ctx,
      `${admin}/api/admin/discovery/services?serviceId=${PG_WIRE_SERVICE_ID}`);
    listener = healthyListener(found.json?.services, roles);
    return {ready: listener !== null, diagnostic: {discovery: found}};
  });
  return listener;
}

// A field of the product's partition diagnostics: the product answers it (its
// value may be null, e.g. a partition without a leader); a missing field is
// an unreadable answer, never a default.
function partitionField(record, key) {
  if (!record || typeof record !== 'object' || !Object.hasOwn(record, key)) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `partition diagnostics answered without ${key}`, {record});
  }
  return record[key];
}

// The host of a node of this deployment, or null: the node is not one of its
// recorded roles (a foreign node named by the product).
function deploymentHostOf(roles, nodeId) {
  const role = arrayFind(roles, (one) => one.nodeId === nodeId);
  return role === undefined ? null : role.host;
}

// Placement as the product reports it; null when the product did not answer
// its partition diagnostics (the record's explicit "not observed").
function placementOf(answer, roles, observedAt) {
  if (answer.status !== HTTP_OK) return null;
  const partitions = Object.values(partitionField(answer.json, 'partitionsById'));
  return {observedAt, source: '/api/admin/diagnostics/partitions',
    replicasByPartition: arrayMap(partitions, (partition) => ({
      partitionId: partitionField(partition, 'partitionId'),
      tableName: partitionField(partition, 'tableName'),
      leaderNodeId: partitionField(partition, 'leaderNodeId'),
      leaderHost: deploymentHostOf(roles, partitionField(partition, 'leaderNodeId')),
      replicas: arrayMap(partitionField(partition, 'replicas'), (replica) => ({
        nodeId: partitionField(replica, 'nodeId'),
        host: deploymentHostOf(roles, partitionField(replica, 'nodeId')),
        status: partitionField(replica, 'status')}))}))};
}

// The leaders the product reports; an unanswered diagnostics read is a typed
// failure the campaign records as a role-observation failure.
async function observedLeaders(ctx, seedHost) {
  const answer = await readPartitions(ctx, seedHost);
  if (answer.status !== HTTP_OK) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      'partition diagnostics did not answer', {answer});
  }
  return partitionField(answer.json, 'leaders');
}

// The image a host runs: its content-pinned reference when the campaign pinned
// one per host (every data host must have it), else the campaign's reference.
function imageForHost(opts, host, image) {
  if (!opts.lagrangeImageByHost) return image;
  if (!Object.hasOwn(opts.lagrangeImageByHost, host)) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `the pinned Lagrange image names no reference for host ${host}`, {host});
  }
  return opts.lagrangeImageByHost[host];
}

// The image's revision label, or null: Docker answered no labels, or the image
// carries none (the explicit unlabelled state the revision pin refuses).
function revisionLabelOf(product) {
  if (product.imageLabels === null || !Object.hasOwn(product.imageLabels, REVISION_LABEL)) {
    return null;
  }
  return product.imageLabels[REVISION_LABEL];
}

function readPartitions(ctx, seedHost) {
  return getJson(ctx, `http://${seedHost}:${PORT.ADMIN}/api/admin/diagnostics/partitions`);
}

function leadersReady(ctx, seedHost) {
  return readinessOf(ctx, 'lagrange-partition-leaders', async () => {
    const answer = await readPartitions(ctx, seedHost);
    if (answer.status !== HTTP_OK) return {ready: false, diagnostic: answer};
    const partitions = Object.values(partitionField(answer.json, 'partitionsById'));
    return {ready: partitions.length > 0 &&
      arrayEvery(partitions, (partition) => Boolean(partitionField(partition, 'leaderNodeId'))),
    diagnostic: {partitionCount: partitions.length,
      leaders: partitionField(answer.json, 'leaders')}};
  });
}

async function readSystemTables(query) {
  const tables = {};
  for (const [name, sql] of Object.entries(SYSTEM_TABLE_QUERIES)) tables[name] = await query(sql);
  return tables;
}

async function controlSnapshots(ctx, roles) {
  const snapshots = [];
  for (const role of roles) {
    const answer = await getJson(ctx,
      `http://${role.host}:${PORT.ADMIN}/api/admin/control-snapshot`);
    snapshots.push({nodeId: role.nodeId,
      snapshot: answer.status === HTTP_OK && answer.json ? answer.json : null});
  }
  return snapshots;
}

// Every canonical table answers a COUNT(*) through the public wire (a result,
// not a participant failure).
async function tableRoutingDenials(query, requiredTables) {
  const denials = [];
  // null: system-table readiness, no user-table scope (the evaluation owner's state).
  if (requiredTables === null) return denials;
  for (const table of requiredTables) {
    try {
      await query(`SELECT COUNT(*) AS row_count FROM ${table}`);
    } catch (error) {
      denials.push(`table_not_routable:${table}:${errorText(error)}`);
    }
  }
  return denials;
}

// Per required table, the time from the first poll until the table first
// showed no denial of its own (time-to-routable).
function recordTableRoutability(tableReadyAt, tables, context) {
  if (context.requiredTables === null) return;
  for (const table of context.requiredTables) {
    if (tableReadyAt[table] !== undefined) continue;
    const own = evaluateLagrangeClusterReadiness({...tables,
      expectedNodeIds: context.expectedNodeIds, requiredServiceIds: [],
      requiredTables: [table], now: context.now});
    if (own.ready) tableReadyAt[table] = context.now - context.startedAt;
  }
}

async function clusterReady(ctx, component, query, nodeRoles, requiredTables = null) {
  const expectedNodeIds = arrayMap(nodeRoles, (role) => role.nodeId);
  const startedAt = Date.now();
  const tableReadyAt = {};
  const readiness = await readinessOf(ctx, component, async () => {
    const tables = await readSystemTables(query);
    const now = Date.now();
    recordTableRoutability(tableReadyAt, tables, {requiredTables, expectedNodeIds, now,
      startedAt});
    const verdict = evaluateLagrangeClusterReadiness({...tables, expectedNodeIds,
      requiredServiceIds: [PG_WIRE_SERVICE_ID], requiredTables, now});
    const lane = evaluateLagrangeServeLane({snapshots: await controlSnapshots(ctx, nodeRoles)});
    const routing = verdict.ready && lane.ready ?
      await tableRoutingDenials(query, requiredTables) : [];
    const denials = [...verdict.denials, ...lane.denials, ...routing];
    return {ready: denials.length === 0, diagnostic: {denials,
      nodes: tables.nodes.length, partitions: tables.partitions.length,
      tableTimeToRoutableMs: {...tableReadyAt}}};
  }, ctx.budget.stablePolls);
  return requiredTables ? {...readiness, tableTimeToRoutableMs: {...tableReadyAt}} : readiness;
}

// The public PG wire is one listener (replicaCount 1): the row is read back
// through it only, which is recorded as a typed limitation, never as
// visibility from every node.
function probeVisibility(listenerNodeId, nodeRoles) {
  return {status: PROBE_VISIBILITY_SINGLE_LISTENER, readFrom: [listenerNodeId],
    notReadFrom: arrayFilter(arrayMap(nodeRoles, (role) => role.nodeId),
      (nodeId) => nodeId !== listenerNodeId)};
}

function probeWriteReadback(ctx, sql, campaignId, visibility) {
  return readinessOf(ctx, 'lagrange-probe-write-readback', async () => {
    const id = Date.now();
    const token = `${campaignId}-${id}`;
    await sql.statement(
      `CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (id BIGINT PRIMARY KEY, token TEXT)`);
    const insert = await sql.statement(
      `INSERT INTO ${PROBE_TABLE} (id, token) VALUES (${id}, '${token}')`);
    const rows = await sql.query(`SELECT token FROM ${PROBE_TABLE} WHERE id = ${id}`);
    return {ready: insert.rowCount === 1 && rows.length === 1 && rows[0].token === token,
      diagnostic: {written: token, insertTag: insert.tag, insertRowCount: insert.rowCount,
        readBack: rows, visibility}};
  });
}

// A field of the product's boot-provenance log line; a line without it is an
// unavailable provenance (the caller records why), never a filled-in null.
function bootLogField(parsed, key) {
  if (!Object.hasOwn(parsed, key)) throw new Error(`boot provenance line without ${key}`);
  return parsed[key];
}

// The boot provenance the node logged, or {unavailable: why}: the explicit
// state of a node whose log does not carry it.
async function bootProvenance(ctx, product, facts = null) {
  try {
    const line = String(await ctx.sshRun(product.host, ctx.opts,
      `docker logs ${shellWord(product.containerId)} 2>&1 | grep -m 1 ${BOOT_PROVENANCE_MARKER}`));
    const parsed = JSON.parse(line.slice(stringIndexOf(line, '{')));
    const release = facts?.status === HTTP_OK ? facts.json?.facts?.release : null;
    const gitCommit = parsed.gitCommit ?? release?.gitCommit ?? null;
    return {version: bootLogField(parsed, 'version'),
      bootedSrcFingerprint: bootLogField(parsed, 'bootedSrcFingerprint'),
      subsystem: bootLogField(parsed, 'subsystem'),
      ...(typeof gitCommit === 'string' && gitCommit !== '' ? {gitCommit} : {})};
  } catch (error) {
    return {unavailable: errorText(error)};
  }
}

// The version the node reports in its facts, or null with the reason: a node
// that did not answer it has no reported version (an empty string is none).
function reportedVersionOf(facts) {
  const version = facts.status === HTTP_OK ? facts.json?.facts?.release?.version : undefined;
  if (typeof version === 'string' && version !== '') {
    return {reportedVersion: version, reportedVersionError: null};
  }
  return {reportedVersion: null, reportedVersionError: `facts answered ${JSON.stringify(
    {status: facts.status, error: facts.error, version: version === undefined ? 'absent' :
      version})}`};
}

async function reportedVersions(ctx, products) {
  for (const product of products) {
    const facts = await getFacts(ctx, product.host);
    Object.assign(product, reportedVersionOf(facts));
    product.bootProvenance = await bootProvenance(ctx, product, facts);
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
  const rawImage = opts.lagrangeImage || opts.image || LAGRANGE_IMAGE_DEFAULT;
  const image = resolveLagrangeContainerImage(opts);
  const expectedVersion = opts.lagrangeVersion || semverTagOf(rawImage);
  const connection = {user: REQUEST_CELL_AUTH.USER, password: REQUEST_CELL_AUTH.PASSWORD,
    database: REQUEST_CELL_AUTH.DATABASE};
  const ctx = {sshRun, opts, clientIp, sleep, budget: resolveReadinessBudget(opts), connection,
    expectedVersion};
  const roles = [];
  const nodeReadiness = [];
  const formed = {listener: null};
  return describingReadinessExhaustion(() => formLagrangeCluster({ctx, hosts, image, connection,
    roles, nodeReadiness, formed, campaignId}), (failure) => describeExhaustedDeployment({
    targetId: 'lagrange', topology: lagrangeTopology(hosts), sshRun, opts,
    roles: [...roles], endpoint: exhaustedEndpoint(formed.listener, roles), dataDir: DATA_DIR,
    readVersions: (products) => reportedVersions(ctx, products), failure}));
}

function lagrangeTopology(hosts) {
  return {description: `${hosts.length} Lagrange nodes; clients use the public ` +
    'PostgreSQL wire listener directly', clientPath: 'public-pg-wire'};
}

// The client endpoint an exhausted formation had named: the public PG-wire
// listener on its node's container, or none when readiness ran out first.
function exhaustedEndpoint(listener, roles) {
  if (!listener) return null;
  const node = arrayFind(roles, (role) => role.nodeId === listener.nodeId);
  return {protocol: 'postgresql', serviceId: PG_WIRE_SERVICE_ID, host: listener.host,
    port: listener.port, containerId: node.containerId, binding: null};
}

async function formLagrangeCluster({ctx, hosts, image, connection, roles, nodeReadiness,
  formed, campaignId}) {
  const {sshRun, opts} = ctx;
  const seedHost = hosts[0];
  for (let index = 0; index < hosts.length; index += 1) {
    const host = hosts[index];
    const nodeId = nodeIdOf(index);
    const started = await dockerRunDetached({sshRun, opts, host, campaignId, role: NODE_ROLE,
      ordinal: index + 1, image: imageForHost(opts, host, image),
      dockerArgs: [...storageArgs(opts, campaignId, index),
        ...nodeEnv({nodeId, host, seedHost, connection})]});
    roles.push({role: NODE_ROLE, host, containerId: started.containerId, nodeId});
    if (index === 0) nodeReadiness.push(await nodeReady(ctx, host));
  }
  for (let index = 1; index < hosts.length; index += 1) {
    nodeReadiness.push(await nodeReady(ctx, hosts[index]));
  }
  const membership = await membershipReady(ctx, seedHost, hosts.length);
  const listener = await publicPgWireReady(ctx, seedHost, roles);
  formed.listener = listener;
  const leaders = await leadersReady(ctx, seedHost);
  const target = {sshRun, opts, from: ctx.clientIp, campaignId,
    endpoint: {host: listener.host, port: listener.port}, connection};
  const query = createPsqlQueryReader(target);
  const sql = {query, statement: createPsqlStatementRunner(target)};
  const nodeRoles = [...roles];
  const cluster = await clusterReady(ctx, 'lagrange-system-tables', query, nodeRoles);
  const visibility = probeVisibility(listener.nodeId, roles);
  const probe = await probeWriteReadback(ctx, sql, campaignId, visibility);
  const products = verifyProductIdentity(
    await reportedVersions(ctx, await inspectProducts({sshRun, opts, roles})),
    {[NODE_ROLE]: {imageRef: image, contentIdentity: opts.lagrangeImageContent ?? null,
      versionPattern: versionPatternOf(image, ctx.expectedVersion),
      expectedSrcFingerprint: opts.lagrangeSrcFingerprint || opts.expectedSrcFingerprint || null,
      expectedGitCommit: opts.expectedGitCommit || null}});
  if (opts.lagrangeRevision) {
    const wrong = arrayFilter(products, (product) =>
      revisionLabelOf(product) !== opts.lagrangeRevision);
    if (wrong.length > 0) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
        `image revision label differs from ${opts.lagrangeRevision}`,
        {hosts: arrayMap(wrong, (one) => [one.host, revisionLabelOf(one)])});
    }
  }
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
    topology: lagrangeTopology(hosts),
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
        const routable = await clusterReady({...ctx, budget: {...ctx.budget,
          attempts: ROUTABLE_ATTEMPTS}},
        'lagrange-canonical-tables-routable', query, nodeRoles,
        arrayMap(CANONICAL_TABLES, (table) => table.name));
        return {...placementOf(await readPartitions(ctx, seedHost), roles,
          new Date().toISOString()), routable};
      },
      // The arm's readiness contract again (after a product restart).
      awaitReady: async () => ({cluster: await clusterReady(ctx, 'lagrange-system-tables', query,
        nodeRoles), probe: await probeWriteReadback(ctx, sql, campaignId, visibility)}),
      observeRoles: async () => ({leaders: await observedLeaders(ctx, seedHost)}),
    },
  };
}

export {deployLagrangeCluster, resolveLagrangeContainerImage};
