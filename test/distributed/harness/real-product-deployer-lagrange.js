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
  DEFAULT_LAGRANGE_OBSERVE_ROLES_DEADLINE_MS,
  DEFAULT_LAGRANGE_ROUTABLE_DEADLINE_MS,
  DEFAULT_POST_FAILURE_DIAGNOSTIC_DEADLINE_MS,
  DEPLOYMENT_FAILURE,
  LAGRANGE_IMAGE_DEFAULT,
  POSTGRES_IMAGE_DEFAULT,
  READINESS_STATE,
  attachRemoteCommandAttribution,
  deploymentFailure,
  isDeploymentFailure,
  requireCampaignId,
  resolveOperationWindow,
  resolveReadinessBudget,
  stripTransientExecutionOptions,
  withExplicitSignalOption,
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
  classifyRemoteCommandError,
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

function isFormationTerminalError(error) {
  return error?.code === DEPLOYMENT_FAILURE.READINESS_EXHAUSTED ||
    error?.code === DEPLOYMENT_FAILURE.WATCHDOG_STOPPED;
}

function hasAbortedFlag(error, classified, opCtx) {
  return Boolean(error?.aborted || classified.aborted || opCtx?.signal?.aborted);
}

function hasDeadlineExpiredFlag(error, classified, opCtx) {
  return Boolean(error?.deadlineExpired || classified.deadlineExpired ||
    (numberIsFinite(opCtx?.deadlineAtMs) && opCtx.now() >= opCtx.deadlineAtMs));
}

function toReadinessExhausted(component, error, opCtx) {
  const classified = classifyRemoteCommandError(error);
  const aborted = hasAbortedFlag(error, classified, opCtx);
  const deadlineExpired = hasDeadlineExpiredFlag(error, classified, opCtx);
  const timedOut = !aborted && Boolean(error?.timedOut || classified.timedOut);
  const observerInfrastructure = !aborted && !deadlineExpired &&
    Boolean(error?.observerInfrastructure || classified.observerInfrastructure);
  const lastProbeError = {
    error: classified.message, aborted, deadlineExpired, timedOut,
    transportError: Boolean(error?.transportError || classified.transportError),
    observerInfrastructure,
  };
  const diagnostic = {
    component, aborted, deadlineExpired, timedOut, observerInfrastructure,
    last: lastProbeError, lastObservation: lastProbeError, lastProbeError,
  };
  const failure = deploymentFailure(DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
    `${component} did not complete: ${classified.message}`, diagnostic);
  attachRemoteCommandAttribution(failure, classified, error);
  return Object.assign(failure, {
    aborted, deadlineExpired, timedOut, observerInfrastructure,
    lastProbeError, lastObservation: lastProbeError,
  });
}

function wrapFormationFailure(ctx, component, error) {
  if (isFormationTerminalError(error)) return error;
  const classified = classifyRemoteCommandError(error);
  if (!hasAbortedFlag(error, classified, ctx) &&
      !hasDeadlineExpiredFlag(error, classified, ctx)) {
    return error;
  }
  return toReadinessExhausted(component, error, ctx);
}

function remainingFormationMs(ctx) {
  if (!numberIsFinite(ctx.deadlineAtMs)) return null;
  return ctx.deadlineAtMs - ctx.now();
}

function resolveLagrangeImageAndVersion(opts) {
  const rawImage = opts.lagrangeImage || opts.image || LAGRANGE_IMAGE_DEFAULT;
  return {
    image: resolveLagrangeContainerImage(opts),
    expectedVersion: opts.lagrangeVersion || semverTagOf(rawImage),
  };
}

function buildLagrangeFormationBudget(opts) {
  return Object.freeze({
    ...resolveReadinessBudget(opts),
    attempts: opts.readiness?.attempts ?? FORMATION_ATTEMPTS,
  });
}

async function attachFormationCleanupAndRolesOnError({
  error,
  formationTracker,
  roles,
  opts,
  clientIp,
  hosts,
  campaignId,
  sshRun,
  cleanOpts,
}) {
  await formationTracker.settleInFlight();
  if (error && typeof error === 'object' && !arrayIsArray(error.roles)) {
    error.roles = [...roles];
  }
  if (opts.cleanupOnFailure) {
    error.cleanup = await removeCampaignContainers({
      hosts: clientIp ? [...hosts, clientIp] : hosts,
      campaignId,
      sshRun,
      opts: cleanOpts,
    });
  }
}

/**
 * @param {{hosts: Array<string>, clientIp: string, sshRun: Function,
 *   opts: Object, campaignId: string, sleep: Function, signal?: AbortSignal|null,
 *   deadlineAtMs?: number|null, deadlineMs?: number|null,
 *   now?: Function, nowFn?: Function}} input
 * @return {Promise<Object>} the deployment (record fields + `access` and
 *   `operations`, which the record never carries)
 */
async function deployLagrangeCluster({hosts, clientIp, sshRun, opts = {}, campaignId, sleep,
  signal = null, deadlineAtMs = null, deadlineMs = null, now, nowFn}) {
  requireCampaignId(campaignId);
  const {image, expectedVersion} = resolveLagrangeImageAndVersion(opts);
  const connection = {user: REQUEST_CELL_AUTH.USER, password: REQUEST_CELL_AUTH.PASSWORD,
    database: REQUEST_CELL_AUTH.DATABASE};
  const clock = resolveFormationClock(now, nowFn, opts);
  const abortSignal = signal ?? opts.signal ?? null;
  const cleanOpts = stripTransientExecutionOptions(opts);
  const formationDeadlineMs = resolveFormationDeadlineMs(opts);
  const formationWindow = resolveOperationWindow({
    clock,
    defaultDeadlineMs: formationDeadlineMs,
    callerDeadlineAtMs: deadlineAtMs ?? opts.deadlineAtMs,
    callerDeadlineMs: deadlineMs ?? opts.deadlineMs,
    callerSignal: abortSignal,
  });
  const budget = buildLagrangeFormationBudget(opts);
  const formationTracker = createTrackedSshRun(sshRun, formationWindow.signal);
  const ctx = {
    sshRun: formationTracker.trackedSshRun,
    settleInFlight: formationTracker.settleInFlight,
    opts: cleanOpts,
    clientIp,
    sleep,
    now: clock,
    signal: formationWindow.signal,
    formationDeadlineMs,
    deadlineAtMs: formationWindow.deadlineAtMs,
    deadlineMs: formationWindow.deadlineMs,
    budget,
    connection,
    expectedVersion,
  };
  const postFailureTracker = createTrackedSshRun(sshRun, null);
  const roles = [];
  const nodeReadiness = [];
  const formed = {listener: null};
  try {
    return await describingReadinessExhaustion(
      async () => {
        try {
          return await formLagrangeCluster({ctx, rawSshRun: sshRun, hosts, image, connection,
            roles, nodeReadiness, formed, campaignId});
        } catch (error) {
          throw wrapFormationFailure(ctx, 'lagrange-formation', error);
        } finally {
          await formationTracker.settleInFlight();
        }
      },
      (failure) => {
        const diagWindow = resolveOperationWindow({
          clock,
          defaultDeadlineMs: DEFAULT_POST_FAILURE_DIAGNOSTIC_DEADLINE_MS,
          callerSignal: null,
        });
        const postFailureOpts = withExplicitSignalOption(cleanOpts, null);
        const postFailureCtx = {
          ...ctx,
          sshRun: postFailureTracker.trackedSshRun,
          settleInFlight: postFailureTracker.settleInFlight,
          opts: postFailureOpts,
          signal: null,
          deadlineAtMs: diagWindow.deadlineAtMs,
          deadlineMs: diagWindow.deadlineMs,
        };
        return describeExhaustedDeployment({
          targetId: 'lagrange',
          topology: lagrangeTopology(hosts),
          sshRun: postFailureTracker.trackedSshRun,
          opts: postFailureOpts,
          deadlineAtMs: diagWindow.deadlineAtMs,
          now: clock,
          roles: [...roles],
          endpoint: exhaustedEndpoint(formed.listener, roles),
          dataDir: DATA_DIR,
          readVersions: async (products) => {
            try {
              return await reportedVersions(postFailureCtx, products);
            } finally {
              await postFailureTracker.settleInFlight();
            }
          },
          failure,
        });
      },
    );
  } catch (error) {
    await attachFormationCleanupAndRolesOnError({
      error,
      formationTracker,
      roles,
      opts,
      clientIp,
      hosts,
      campaignId,
      sshRun,
      cleanOpts,
    });
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

async function startJoinerNodes({sshRun, opts, hosts, seedHost, image, connection, campaignId,
  roles}) {
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
}

function assertExpectedLagrangeRevision(products, expectedRevision) {
  if (!expectedRevision) return;
  const wrong = arrayFilter(products, (product) =>
    revisionLabelOf(product) !== expectedRevision);
  if (wrong.length > 0) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `image revision label differs from ${expectedRevision}`,
      {hosts: arrayMap(wrong, (one) => [one.host, revisionLabelOf(one)])});
  }
}

async function readSystemTablesForReady(postQuery, readyCtx) {
  try {
    return await readSystemTables(postQuery, readyCtx);
  } catch (error) {
    if (isDeploymentFailure(error)) throw error;
    const classified = classifyRemoteCommandError(error);
    if (error?.aborted === true || error?.deadlineExpired === true ||
        classified.aborted || classified.deadlineExpired ||
        readyCtx.signal?.aborted) {
      throw toReadinessExhausted('lagrange-system-tables', error, readyCtx);
    }
    throw error;
  }
}

async function formLagrangeCluster({ctx, rawSshRun, hosts, image, connection, roles, nodeReadiness,
  formed, campaignId}) {
  const {sshRun, opts} = ctx;
  const seedHost = hosts[0];
  await prepareNodeStorage({sshRun, opts, host: seedHost, campaignId, index: 0});
  roles.push(await startLagrangeNode({sshRun, opts, host: seedHost, seedHost, image, connection,
    campaignId, index: 0}));
  await startJoinerNodes({sshRun, opts, hosts, seedHost, image, connection, campaignId, roles});
  ctx.watchedRoles = [...roles];
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
  const inspectedProducts = await inspectProducts({
    sshRun,
    opts,
    roles,
    signal: ctx.signal,
    deadlineAtMs: ctx.deadlineAtMs,
    now: ctx.now,
  });
  const products = verifyProductIdentity(
    await reportedVersions(ctx, inspectedProducts),
    {[NODE_ROLE]: {imageRef: image, contentIdentity: opts.lagrangeImageContent ?? null,
      versionPattern: versionPatternOf(image, ctx.expectedVersion),
      expectedSrcFingerprint: opts.lagrangeSrcFingerprint || opts.expectedSrcFingerprint || null,
      expectedGitCommit: opts.expectedGitCommit || null}});
  assertExpectedLagrangeRevision(products, opts.lagrangeRevision);
  const bindRemainingMs = remainingFormationMs(ctx);
  if (bindRemainingMs !== null && bindRemainingMs <= 0) {
    throw toReadinessExhausted(
      'lagrange-endpoint-bind',
      Object.assign(new Error('readiness probe formation deadline expired'),
        {deadlineExpired: true}),
      ctx,
    );
  }
  const binding = await bindEndpointToContainer({
    sshRun,
    opts,
    campaignId,
    endpoint: {host: listener.host, port: listener.port},
    candidates: arrayFilter(roles, (role) => role.host === listener.host),
    signal: ctx.signal,
    timeoutMs: bindRemainingMs ?? undefined,
  });
  roles.push({role: LISTENER_ROLE, host: listener.host, containerId: binding.containerId,
    nodeId: listener.nodeId});
  const storage = arrayMap(products, (product) => classifyStorage(product, DATA_DIR));
  const endpoint = {protocol: 'postgresql', serviceId: PG_WIRE_SERVICE_ID,
    host: listener.host, port: listener.port, containerId: binding.containerId,
    binding};
  const observedAt = dateToISOString(new DateConstructor(ctx.now()));
  const placement = placementOf(await readPartitions(ctx, seedHost), roles, observedAt);
  const postTracker = createTrackedSshRun(rawSshRun, null);
  const postSqlTarget = {
    sshRun: postTracker.trackedSshRun,
    opts,
    from: ctx.clientIp,
    campaignId,
    endpoint: {host: listener.host, port: listener.port},
    connection,
  };
  const postQuery = createPsqlQueryReader(postSqlTarget);
  const postSql = {query: postQuery, statement: createPsqlStatementRunner(postSqlTarget)};
  const basePostFormationCtx = {
    sshRun: postTracker.trackedSshRun,
    settleInFlight: postTracker.settleInFlight,
    opts,
    clientIp: ctx.clientIp,
    sleep: ctx.sleep,
    now: ctx.now,
    signal: null,
    formationDeadlineMs: ctx.formationDeadlineMs,
    deadlineAtMs: null,
    deadlineMs: null,
    budget: ctx.budget,
    connection: ctx.connection,
    expectedVersion: ctx.expectedVersion,
    watchedRoles: nodeRoles,
  };
  return {
    targetId: 'lagrange',
    topology: lagrangeTopology(hosts),
    roles, storage, runClass: runClassOf(storage),
    readiness: {state: READINESS_STATE.READY, observedAt,
      evidence: {nodes: nodeReadiness, membership, publicPgWire: listener, leaders, cluster,
        probe}},
    identity: {products},
    placement,
    endpoint,
    access: {connection},
    operations: {
      // After the canonical load: every partition of every canonical table
      // routable and replicated, or a typed readiness exhaustion.
      observePlacement: async ({signal: callSignal, deadlineAtMs: callDeadlineAtMs,
        deadlineMs: callDeadlineMs} = {}) => {
        const win = resolveOperationWindow({
          clock: ctx.now,
          defaultDeadlineMs: DEFAULT_LAGRANGE_ROUTABLE_DEADLINE_MS,
          callerDeadlineAtMs: callDeadlineAtMs,
          callerDeadlineMs: callDeadlineMs,
          callerSignal: callSignal,
        });
        const routableCtx = {
          ...basePostFormationCtx,
          signal: win.signal,
          deadlineAtMs: win.deadlineAtMs,
          deadlineMs: win.deadlineMs,
          budget: {...ctx.budget, attempts: ROUTABLE_ATTEMPTS},
        };
        try {
          const routable = await clusterReady(
            routableCtx,
            'lagrange-canonical-tables-routable',
            postQuery,
            nodeRoles,
            arrayMap(CANONICAL_TABLES, (table) => table.name),
          );
          const partitionsAnswer = await readPartitions(routableCtx, seedHost);
          return {
            ...placementOf(partitionsAnswer, roles,
              dateToISOString(new DateConstructor(ctx.now()))),
            routable,
          };
        } finally {
          await postTracker.settleInFlight();
        }
      },
      // The arm's readiness contract again (after a product restart).
      awaitReady: async ({signal: readySignal, deadlineAtMs: readyDeadlineAtMs,
        deadlineMs: readyDeadlineMs} = {}) => {
        const win = resolveOperationWindow({
          clock: ctx.now,
          defaultDeadlineMs: ctx.formationDeadlineMs,
          callerDeadlineAtMs: readyDeadlineAtMs,
          callerDeadlineMs: readyDeadlineMs,
          callerSignal: readySignal,
        });
        const readyCtx = {
          ...basePostFormationCtx,
          signal: win.signal,
          deadlineAtMs: win.deadlineAtMs,
          deadlineMs: win.deadlineMs,
          watchedRoles: nodeRoles,
        };
        try {
          const systemReady = await clusterReady(
            readyCtx,
            'lagrange-system-tables',
            postQuery,
            nodeRoles,
          );
          const tables = await readSystemTablesForReady(postQuery, readyCtx);
          const presentCanonical = arrayFilter(
            arrayMap(CANONICAL_TABLES, (table) => table.name),
            (name) => arraySome(tables.partitions, (row) => row.table_name === name),
          );
          const cluster = presentCanonical.length > 0 ?
            await clusterReady(
              readyCtx,
              'lagrange-canonical-tables-routable',
              postQuery,
              nodeRoles,
              presentCanonical,
            ) :
            systemReady;
          return {
            cluster,
            probe: await probeWriteReadback(readyCtx, postSql, campaignId, visibility),
          };
        } finally {
          await postTracker.settleInFlight();
        }
      },
      observeRoles: async ({signal: callSignal, deadlineAtMs: callDeadlineAtMs,
        deadlineMs: callDeadlineMs} = {}) => {
        const win = resolveOperationWindow({
          clock: ctx.now,
          defaultDeadlineMs: DEFAULT_LAGRANGE_OBSERVE_ROLES_DEADLINE_MS,
          callerDeadlineAtMs: callDeadlineAtMs,
          callerDeadlineMs: callDeadlineMs,
          callerSignal: callSignal,
        });
        const rolesCtx = {
          ...basePostFormationCtx,
          signal: win.signal,
          deadlineAtMs: win.deadlineAtMs,
          deadlineMs: win.deadlineMs,
        };
        try {
          return {leaders: await observedLeaders(rolesCtx, seedHost)};
        } finally {
          await postTracker.settleInFlight();
        }
      },
    },
  };
}

export {
  deployLagrangeCluster,
  resolveLagrangeContainerImage,
};
