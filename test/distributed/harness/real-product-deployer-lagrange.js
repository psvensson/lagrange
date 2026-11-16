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
  DateConstructor,
  arrayFilter,
  arrayFind,
  arrayFlatMap,
  arrayIsArray,
  arrayMap,
  arraySome,
  dateNow,
  dateToISOString,
  numberIsFinite,
  stringIndexOf,
  stringLastIndexOf,
  stringPadStart,
  stringReplace,
  stringStartsWith,
  stringTrim,
  toStringValue as stringOf,
} from './real-product-captured-intrinsics.js';
import {removeCampaignContainers} from './real-product-campaign-cleanup.js';
import {
  DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS,
  DEPLOYMENT_FAILURE,
  LAGRANGE_IMAGE_DEFAULT,
  POSTGRES_IMAGE_DEFAULT,
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
  describeExhaustedDeployment,
  describingReadinessExhaustion,
} from './real-product-exhausted-deployment.js';
import {
  clusterReady,
  leadersReady,
  membershipReady,
  nodeReady,
  observedLeaders,
  placementOf,
  probeVisibility,
  probeWriteReadback,
  publicPgWireReady,
  readPartitions,
  readSystemTables,
  reportedVersions,
} from './real-product-lagrange-observations.js';
import {
  createTrackedSshRun,
  dockerRunDetached,
  dockerRunOnceCommand,
  execWithStatus,
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
// The Dockerfile's runtime USER, the owner of DATA_DIR in the image; a test
// holds the two equal.
const RUNTIME_USER = '10001:10001';
// Where the throwaway container that prepares a node's storage directory
// mounts <storage-root>/<campaign>.
const STORAGE_MOUNT = '/campaign';
const NODE_ROLE = 'lagrange-node';
const LISTENER_ROLE = 'sys-postgres-wire';
const PG_WIRE_SERVICE_ID = 'sys-postgres-wire';
const NODE_ID_PREFIX = '00000000-0000-4000-8000-';
const NODE_ID_WIDTH = 12;
const SEMVER_TAG = /:(\d+\.\d+\.\d+)$/u;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const REVISION_LABEL = 'org.opencontainers.image.revision';
// The canonical tables' routability after CREATE TABLE: on the 2026-11-01 lab
// a 5-node cluster needed 2 min 41 s for its first table and 3-/4-node
// clusters none within 13-21 min (live-diagnosis-2026-11-01.md). The bound is
// 15 polls a minute for 15 minutes (5.6x the one routable observation); it is
// recorded with the outcome, and exhaustion is the arm's product failure.
const ROUTABLE_ATTEMPTS = 900;
const ROUTABLE_DEADLINE_MS = 900000;
// Cold 3-node formation requires all 6 priority control-plane partitions to
// spread across 3 distinct nodes before joiners' /readyz opens; matches
// FORMATION_BOUND_MS = 420_000 (420 polls at 1000 ms) in
// test/distributed/scenarios/fresh-formation-user-table-routability.js.
const FORMATION_ATTEMPTS = 420;
// Cross-VM (--network host) transport ACK and join timeouts, matching
// cluster-class-lifecycle-base.js (commit 5ff58af0c, CL-007).
const HOST_NETWORK_TRANSPORT_MESSAGE_TIMEOUT_MS = 30000;
const JOINING_HTTP_TIMEOUT_MS = 60000;
const JOINING_LEADERSHIP_WAIT_TIMEOUT_MS = 240000;
const mathMax = Math.max;

function nodeIdOf(index) {
  return `${NODE_ID_PREFIX}${stringPadStart(stringOf(index + 1), NODE_ID_WIDTH, '0')}`;
}

function nodeEnv({nodeId, host, seedHost, connection}) {
  const env = {
    NODE_ID: nodeId, DATA_DIR, NODE_ADDRESS: `${host}:${PORT.REST}`,
    REST_API_PORT: PORT.REST, ADMIN_WS_PORT: PORT.ADMIN, TRANSPORT_WS_PORT: PORT.TRANSPORT,
    TRANSPORT_WS_HOST: '0.0.0.0', ADMIN_WS_HOST: '0.0.0.0',
    ADMIN_ALLOW_INSECURE_EXTERNAL_BIND: 'true',
    LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS: HOST_NETWORK_TRANSPORT_MESSAGE_TIMEOUT_MS,
    NODE_JOINING_HTTP_TIMEOUT_MS: JOINING_HTTP_TIMEOUT_MS,
    NODE_JOINING_LEADERSHIP_WAIT_TIMEOUT_MS: JOINING_LEADERSHIP_WAIT_TIMEOUT_MS,
    PGWIRE_AUTH_USER: connection.user, PGWIRE_AUTH_PASSWORD: connection.password,
    PGWIRE_AUTH_DATABASE: connection.database,
  };
  if (seedHost !== host) {
    env.SEED_NODE_ADDRESS = `${seedHost}:${PORT.REST}`;
  }
  return arrayFlatMap(Object.entries(env), ([key, value]) => ['-e', `${key}=${value}`]);
}

function storageLabel(index) {
  return `lagrange-${index + 1}`;
}

function storageArgs(opts, campaignId, index) {
  return opts.storageRoot ?
    ['-v', `${opts.storageRoot}/${campaignId}/${storageLabel(index)}:${DATA_DIR}`] : [];
}

// With --storage-root, dockerd would create a node's missing bind-mount source
// as 0:0 755, which the image's runtime user cannot write (lab experiment
// 16dce80a, tv-dator 2026-11-14: EACCES at uid 10001). The directory is made
// beforehand, owned by that user, through a throwaway container of the
// PostgreSQL image every data host holds (campaignImagesByRole); the product
// never runs as root and nothing is made world-writable. Re-owning is limited
// to what carries no one else's data: an absent directory, an empty one (as
// dockerd leaves behind) or one the runtime user owns (an earlier run of the
// same campaign). A non-empty directory of another owner is foreign data: the
// node is refused, typed, and the directory is left as it is.
const FOREIGN_STORAGE_EXIT = 3;

// The shell script the throwaway container runs for one node directory.
function storagePreparationScript(dir) {
  return `if [ -d ${dir} ] && [ -n "$(ls -A ${dir})" ] && ` +
    `[ "$(stat -c %u:%g ${dir})" != "${RUNTIME_USER}" ]; then ` +
    `echo "foreign $(stat -c %u:%g ${dir})"; exit ${FOREIGN_STORAGE_EXIT}; fi; ` +
    `mkdir -p ${dir} && chown ${RUNTIME_USER} ${dir}`;
}

async function prepareNodeStorage({sshRun, opts, host, campaignId, index}) {
  if (!opts.storageRoot) return;
  const storagePath = `${opts.storageRoot}/${campaignId}/${storageLabel(index)}`;
  const result = await execWithStatus(sshRun, host, opts, `${dockerRunOnceCommand({campaignId,
    image: POSTGRES_IMAGE_DEFAULT,
    dockerArgs: ['-v', `${opts.storageRoot}/${campaignId}:${STORAGE_MOUNT}`],
    commandArgs: ['sh', '-c',
      storagePreparationScript(`${STORAGE_MOUNT}/${storageLabel(index)}`)]})} 2>&1`);
  if (result.exitCode === 0) return;
  const output = stringTrim(result.stdout);
  if (result.exitCode === FOREIGN_STORAGE_EXIT && stringStartsWith(output, 'foreign ')) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED, `${storagePath} on ${host} ` +
      `already holds data owned by ${output.slice('foreign '.length)}, not the runtime user ` +
      `${RUNTIME_USER}; it is never re-owned`, {host, reason: 'storage_foreign_owner', path: storagePath,
      owner: output.slice('foreign '.length)});
  }
  throw deploymentFailure(DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED, 'could not prepare ' +
    `${storagePath} on ${host} for the runtime user ${RUNTIME_USER} (exit ${result.exitCode}): ` +
    output, {host, reason: 'storage_owner_unprepared', path: storagePath, output});
}

function normalizeImageDigest(digest, image) {
  const text = stringTrim(stringOf(digest ?? ''));
  const normalized = stringStartsWith(text, '@') ? text.slice(1) : text;
  if (!SHA256_DIGEST_PATTERN.test(normalized)) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `Lagrange image digest must be sha256:<64 hex>, got ${digest}`, {image, digest});
  }
  return normalized;
}

function imageRepositoryOf(imageRef) {
  const text = stringTrim(stringOf(imageRef || ''));
  const digestAt = stringIndexOf(text, '@');
  const name = digestAt === -1 ? text : text.slice(0, digestAt);
  const tagAt = stringLastIndexOf(name, ':');
  return tagAt > stringLastIndexOf(name, '/') ? name.slice(0, tagAt) : name;
}

function semverTagOf(imageRef) {
  const text = stringTrim(stringOf(imageRef || ''));
  const digestAt = stringIndexOf(text, '@');
  const name = digestAt === -1 ? text : text.slice(0, digestAt);
  const match = SEMVER_TAG.exec(name);
  return match ? match[1] : null;
}

function rawImageOf(opts) {
  return stringTrim(stringOf(opts.lagrangeImage || opts.image || LAGRANGE_IMAGE_DEFAULT));
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

function resolveFormationClock(inputNow, inputNowFn, opts) {
  if (typeof inputNowFn === 'function') return inputNowFn;
  if (typeof inputNow === 'function') return inputNow;
  if (typeof opts?.nowFn === 'function') return opts.nowFn;
  if (typeof opts?.now === 'function') return opts.now;
  return dateNow;
}

function resolveFormationDeadlineMs(opts) {
  if (numberIsFinite(opts?.formationDeadlineMs)) return opts.formationDeadlineMs;
  if (numberIsFinite(opts?.readiness?.formationDeadlineMs)) {
    return opts.readiness.formationDeadlineMs;
  }
  return DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS;
}

function resolveAwaitReadyWindow(postFormationCtx, {
  signal: readySignal,
  deadlineAtMs: readyDeadlineAtMs,
  deadlineMs: readyDeadlineMs,
} = {}) {
  const signal = readySignal !== undefined ? readySignal : postFormationCtx.signal;
  const clock = typeof postFormationCtx.now === 'function' ? postFormationCtx.now : dateNow;
  const requestedDeadlineMs = numberIsFinite(readyDeadlineMs) ?
    readyDeadlineMs : postFormationCtx.formationDeadlineMs;
  if (numberIsFinite(readyDeadlineAtMs)) {
    const remainingMs = mathMax(0, readyDeadlineAtMs - clock());
    if (numberIsFinite(requestedDeadlineMs) && requestedDeadlineMs < remainingMs) {
      return {
        signal,
        deadlineAtMs: clock() + requestedDeadlineMs,
        deadlineMs: requestedDeadlineMs,
      };
    }
    return {
      signal,
      deadlineAtMs: readyDeadlineAtMs,
      deadlineMs: remainingMs,
    };
  }
  const deadlineMs = numberIsFinite(requestedDeadlineMs) ? requestedDeadlineMs : null;
  return {
    signal,
    deadlineAtMs: deadlineMs !== null ? clock() + deadlineMs : null,
    deadlineMs,
  };
}

/**
 * @param {{hosts: Array<string>, clientIp: string, sshRun: Function,
 *   opts: Object, campaignId: string, sleep: Function, signal?: AbortSignal|null,
 *   now?: Function, nowFn?: Function}} input
 * @return {Promise<Object>} the deployment (record fields + `access` and
 *   `operations`, which the record never carries)
 */
async function deployLagrangeCluster({hosts, clientIp, sshRun, opts = {}, campaignId, sleep,
  signal = null, now, nowFn}) {
  requireCampaignId(campaignId);
  const rawImage = opts.lagrangeImage || opts.image || LAGRANGE_IMAGE_DEFAULT;
  const image = resolveLagrangeContainerImage(opts);
  const expectedVersion = opts.lagrangeVersion || semverTagOf(rawImage);
  const connection = {user: REQUEST_CELL_AUTH.USER, password: REQUEST_CELL_AUTH.PASSWORD,
    database: REQUEST_CELL_AUTH.DATABASE};
  const clock = resolveFormationClock(now, nowFn, opts);
  const abortSignal = signal ?? opts.signal ?? null;
  const formationDeadlineMs = resolveFormationDeadlineMs(opts);
  const budget = Object.freeze({...resolveReadinessBudget(opts),
    attempts: opts.readiness?.attempts ?? FORMATION_ATTEMPTS});
  const {trackedSshRun, settleInFlight} = createTrackedSshRun(sshRun, abortSignal);
  const ctx = {sshRun: trackedSshRun, settleInFlight, opts, clientIp, sleep, now: clock,
    signal: abortSignal, formationDeadlineMs, deadlineAtMs: null,
    deadlineMs: formationDeadlineMs, budget, connection, expectedVersion};
  const postFailureOpts = {...opts, signal: null, deadlineAtMs: null, deadlineMs: null};
  const postFailureCtx = {...ctx, sshRun, opts: postFailureOpts, signal: null,
    deadlineAtMs: null, deadlineMs: null};
  const roles = [];
  const nodeReadiness = [];
  const formed = {listener: null};
  try {
    return await describingReadinessExhaustion(
      async () => {
        try {
          return await formLagrangeCluster({ctx, hosts, image, connection,
            roles, nodeReadiness, formed, campaignId});
        } finally {
          await settleInFlight();
        }
      },
      (failure) => describeExhaustedDeployment({
        targetId: 'lagrange', topology: lagrangeTopology(hosts), sshRun, opts: postFailureOpts,
        roles: [...roles], endpoint: exhaustedEndpoint(formed.listener, roles), dataDir: DATA_DIR,
        readVersions: (products) => reportedVersions(postFailureCtx, products), failure}),
    );
  } catch (error) {
    await settleInFlight();
    if (error && typeof error === 'object' && !arrayIsArray(error.roles)) {
      error.roles = [...roles];
    }
    if (opts.cleanupOnFailure) {
      error.cleanup = await removeCampaignContainers({
        hosts,
        campaignId,
        sshRun,
        opts: postFailureOpts,
      });
    }
    throw error;
  }
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

async function startLagrangeNode({sshRun, opts, host, seedHost, image, connection, campaignId,
  index}) {
  const nodeId = nodeIdOf(index);
  const started = await dockerRunDetached({sshRun, opts, host, campaignId, role: NODE_ROLE,
    ordinal: index + 1, image: imageForHost(opts, host, image),
    dockerArgs: [...storageArgs(opts, campaignId, index),
      ...nodeEnv({nodeId, host, seedHost, connection})]});
  return {role: NODE_ROLE, host, containerId: started.containerId, nodeId};
}

async function formLagrangeCluster({ctx, hosts, image, connection, roles, nodeReadiness,
  formed, campaignId}) {
  const {sshRun, opts} = ctx;
  const seedHost = hosts[0];
  await prepareNodeStorage({sshRun, opts, host: seedHost, campaignId, index: 0});
  roles.push(await startLagrangeNode({sshRun, opts, host: seedHost, seedHost, image, connection,
    campaignId, index: 0}));
  const joinerIndices = [];
  for (let index = 1; index < hosts.length; index += 1) joinerIndices.push(index);
  let cancelled = false;
  const settledJoiners = await Promise.allSettled(arrayMap(joinerIndices, async (index) => {
    const host = hosts[index];
    try {
      await prepareNodeStorage({sshRun, opts, host, campaignId, index});
    } catch (error) {
      cancelled = true;
      throw error;
    }
    if (cancelled) return null;
    try {
      const role = await startLagrangeNode({sshRun, opts, host, seedHost, image, connection,
        campaignId, index});
      roles.push(role);
      return role;
    } catch (error) {
      cancelled = true;
      throw error;
    }
  }));
  const rejectedJoiner = arrayFind(settledJoiners, (entry) => entry.status === 'rejected');
  if (rejectedJoiner) {
    const reason = rejectedJoiner.reason;
    if (reason && typeof reason === 'object') {
      reason.roles = [...roles];
      if (reason.diagnostic && typeof reason.diagnostic === 'object') {
        reason.diagnostic = {...reason.diagnostic, roles: [...roles]};
      }
    }
    throw reason;
  }
  ctx.watchedRoles = [...roles];
  const formationDeadlineAtMs = numberIsFinite(ctx.formationDeadlineMs) ?
    ctx.now() + ctx.formationDeadlineMs : null;
  ctx.deadlineAtMs = formationDeadlineAtMs;
  for (let index = 0; index < hosts.length; index += 1) {
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
  const observedAt = dateToISOString(new DateConstructor(ctx.now()));
  const postFormationCtx = {...ctx, deadlineAtMs: null, deadlineMs: null, watchedRoles: nodeRoles};
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
        const clock = typeof ctx.now === 'function' ? ctx.now : dateNow;
        const routableCtx = {
          ...postFormationCtx,
          deadlineAtMs: clock() + ROUTABLE_DEADLINE_MS,
          deadlineMs: ROUTABLE_DEADLINE_MS,
          budget: {...ctx.budget, attempts: ROUTABLE_ATTEMPTS},
        };
        const routable = await clusterReady(
          routableCtx,
          'lagrange-canonical-tables-routable',
          query,
          nodeRoles,
          arrayMap(CANONICAL_TABLES, (table) => table.name),
        );
        return {...placementOf(await readPartitions(ctx, seedHost), roles,
          dateToISOString(new DateConstructor(clock()))), routable};
      },
      // The arm's readiness contract again (after a product restart).
      awaitReady: async ({signal: readySignal, deadlineAtMs: readyDeadlineAtMs,
        deadlineMs: readyDeadlineMs} = {}) => {
        const window = resolveAwaitReadyWindow(postFormationCtx, {
          signal: readySignal,
          deadlineAtMs: readyDeadlineAtMs,
          deadlineMs: readyDeadlineMs,
        });
        const readyCtx = {
          ...postFormationCtx,
          ...window,
          watchedRoles: nodeRoles,
        };
        try {
          const systemReady = await clusterReady(
            readyCtx,
            'lagrange-system-tables',
            query,
            nodeRoles,
          );
          const tables = await readSystemTables(query, readyCtx);
          const presentCanonical = arrayFilter(
            arrayMap(CANONICAL_TABLES, (table) => table.name),
            (name) => arraySome(tables.partitions, (row) => row.table_name === name),
          );
          const cluster = presentCanonical.length > 0 ?
            await clusterReady(
              readyCtx,
              'lagrange-canonical-tables-routable',
              query,
              nodeRoles,
              presentCanonical,
            ) :
            systemReady;
          return {
            cluster,
            probe: await probeWriteReadback(readyCtx, sql, campaignId, visibility),
          };
        } finally {
          await ctx.settleInFlight();
        }
      },
      observeRoles: async () => ({leaders: await observedLeaders(ctx, seedHost)}),
    },
  };
}

export {
  DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS,
  deployLagrangeCluster,
  resolveLagrangeContainerImage,
};
