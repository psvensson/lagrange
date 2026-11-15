/**
 * TiDB + TiKV arm of the comparative benchmark on remote hosts: one PD, one
 * TiKV store per data host (three failure domains), one TiDB SQL server and
 * the pinned mysql readiness client the TiDB lifecycle owner reads with. The
 * readiness client is a lifecycle tool, never part of the measured topology:
 * it runs on the TiDB SQL host (never the load generator), is recorded as the
 * role `tidb-readiness-client`, and is stopped before measurement; a later
 * observation (stores, placement) starts it, reads, and stops it again.
 *
 * Readiness and placement are the existing owners', over ssh through the
 * remote docker provider: waitForTiDbReferenceSqlReady with the N-Up-stores
 * readiness SQL (tidb-reference-lifecycle.js) and, once the canonical tables
 * exist, waitForPhysicalTablePlacement (tidb-reference-physical-placement-
 * proof.js). Versions are TiDB's own report: tidb_version() and
 * INFORMATION_SCHEMA.CLUSTER_INFO per instance.
 */
import {
  TIDB_REFERENCE_DEFAULTS,
  buildTiDbReferenceReadinessSql,
  waitForTiDbReferenceSqlReady,
} from './tidb-reference-lifecycle.js';
import {
  buildTiDbPhysicalMysqlCommand,
  waitForPhysicalTablePlacement,
} from './tidb-reference-physical-placement-proof.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayMap,
  dateNow,
  numberIsFinite,
  objectHasOwn,
  stringSplit,
  stringToLowerCase,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  PD_IMAGE_DEFAULT,
  READINESS_STATE,
  TIDB_IMAGE_DEFAULT,
  TIDB_SQL_CLIENT_IMAGE,
  TIKV_IMAGE_DEFAULT,
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
import {
  describeExhaustedDeployment,
  describingReadinessExhaustion,
} from './real-product-exhausted-deployment.js';
import {pollReadiness, typedReadiness} from './real-product-readiness.js';
import {
  createRemoteDockerProvider,
  createTrackedSshRun,
  dockerRunDetached,
  httpFromHost,
} from './real-product-remote-shell.js';
import {
  bindEndpointToContainer,
} from './real-product-sql-clients.js';

const ROLE = Object.freeze({PD: 'pd', TIKV: 'tikv', TIDB: 'tidb',
  READINESS_CLIENT: 'tidb-readiness-client'});
const EXITED = 'exited';
const DATA_DIR = '/data';
const STORE_COUNT = 3;
const TOPOLOGY = Object.freeze({description: `1 PD + ${STORE_COUNT} TiKV stores + 1 TiDB server`,
  clientPath: 'direct-to-tidb'});
const DEFAULT_DATABASE = 'lagrange_tidb_oltp';
const PLACEMENT_TABLE = 'stock';
const TAG = /:v?(\d+\.\d+\.\d+)$/u;
// Bounded lifetime of the client container (R13): the campaign's own budget.
const SQL_CLIENT_LIFETIME_SECONDS = 6 * 60 * 60;
const P = TIDB_REFERENCE_DEFAULTS;
const TIKV_STATUS_PORT = 20180;

function storageArgs(opts, campaignId, label) {
  return opts.storageRoot ? ['-v', `${opts.storageRoot}/${campaignId}/${label}:${DATA_DIR}`] :
    [];
}

function versionPatternOf(image) {
  return pinnedVersionPattern(image, TAG, (version) =>
    new RegExp(`(^|[^\\d])${stringSplit(version, '.').join('\\.')}([^\\d]|$)`, 'u'));
}

async function start(ctx, role, host, ordinal, image, dockerArgs, commandArgs) {
  const started = await dockerRunDetached({sshRun: ctx.sshRun, opts: ctx.opts, host,
    campaignId: ctx.campaignId, role, ordinal, image, dockerArgs, commandArgs});
  ctx.hostByContainer.set(started.containerId, host);
  return {role, host, containerId: started.containerId};
}

function pdReady(ctx, pdHost) {
  return pollReadiness({
    component: 'tidb-pd',
    attempts: ctx.budget.attempts,
    intervalMs: ctx.budget.intervalMs,
    sleep: ctx.sleep,
    now: ctx.now,
    signal: ctx.signal ?? null,
    deadlineAtMs: ctx.deadlineAtMs ?? null,
    probe: async (pollContext) => {
      const hasPollSignal = Boolean(pollContext && objectHasOwn(pollContext, 'signal'));
      const signal = hasPollSignal ? pollContext.signal : ctx.signal;
      const timeoutMs = numberIsFinite(pollContext?.remainingMs) ?
        Math.max(1, pollContext.remainingMs) : undefined;
      const answer = await httpFromHost({
        sshRun: ctx.sshRun,
        opts: ctx.opts,
        from: ctx.clientIp,
        url: `http://${pdHost}:${P.pdClientPort}/pd/api/v1/health`,
        signal,
        timeoutMs,
      });
      return {
        ready: Array.isArray(answer.json) && answer.json.length > 0 &&
          arrayEvery(answer.json, (member) => member.health === true),
        diagnostic: answer,
      };
    },
  });
}

function readinessClientCommand(ctx, verb, callOpts = ctx.opts) {
  return ctx.sshRun(ctx.sqlClient.host, callOpts, `${verb} ${ctx.sqlClient.containerId}`);
}

// Stop the readiness client and observe that it exited: the record says so
// from the container's own state, never by assumption.
async function stopReadinessClient(ctx) {
  const stopOpts = {...(ctx.opts || {}), signal: null, deadlineAtMs: null, deadlineMs: null};
  await readinessClientCommand(ctx, 'docker stop -t 0', stopOpts);
  const inspected = await ctx.provider.inspectContainer(ctx.sqlClient.containerId, {signal: null});
  if (inspected?.State?.Status !== EXITED) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED,
      `TiDB readiness client ${ctx.sqlClient.containerId} did not exit ` +
      `(${inspected?.State?.Status})`, {containerId: ctx.sqlClient.containerId});
  }
  return {imageId: inspected.Image ?? null, observedAt: new Date().toISOString()};
}

// A read after deployment: the readiness client runs only for its duration.
async function withReadinessClient(ctx, read) {
  const startOpts = ctx.signal ? {...(ctx.opts || {}), signal: ctx.signal} : ctx.opts;
  await readinessClientCommand(ctx, 'docker start', startOpts);
  try {
    return await read();
  } finally {
    await ctx.settleInFlight?.();
    await stopReadinessClient(ctx);
  }
}

async function sql(ctx, endpoint, statement) {
  const result = await ctx.provider.execInContainer(ctx.sqlClient.containerId,
    buildTiDbPhysicalMysqlCommand(endpoint, statement));
  if (result.exitCode !== 0) throw new Error(`mysql exited ${result.exitCode}`);
  return result.stdout;
}

// A version the product answered; an empty answer is no version (null with why).
function reportedVersionOf(answer, source) {
  const version = stringTrim(String(answer));
  return version === '' ?
    {reportedVersion: null, reportedVersionError: `${source} answered no version`} :
    {reportedVersion: version, reportedVersionError: null};
}

async function reportedVersions(ctx, endpoint, products) {
  const release = await sql(ctx, endpoint, 'SELECT tidb_version()');
  const rows = arrayMap(arrayFilter(stringSplit(await sql(ctx, endpoint,
    'SELECT TYPE, INSTANCE, VERSION FROM INFORMATION_SCHEMA.CLUSTER_INFO'), '\n'), Boolean),
  (line) => stringSplit(line, '\t'));
  for (const product of products) {
    if (product.role === ROLE.TIDB) {
      Object.assign(product, reportedVersionOf(release, 'SELECT tidb_version()'));
      continue;
    }
    const row = arrayFind(rows, ([type, instance]) => stringToLowerCase(type) ===
      product.role && stringSplit(instance, ':')[0] === product.host);
    Object.assign(product, row === undefined ?
      {reportedVersion: null, reportedVersionError: 'CLUSTER_INFO lists no such instance'} :
      reportedVersionOf(row[2], 'CLUSTER_INFO.VERSION'));
  }
  return products;
}

async function observeStores(ctx, endpoint) {
  return sql(ctx, endpoint, 'SELECT STORE_ID, ADDRESS, STORE_STATE_NAME FROM ' +
    'INFORMATION_SCHEMA.TIKV_STORE_STATUS ORDER BY STORE_ID');
}

function resolveTiDbClock(now, nowFn, opts) {
  if (typeof nowFn === 'function') return nowFn;
  if (typeof now === 'function') return now;
  if (typeof opts?.nowFn === 'function') return opts.nowFn;
  if (typeof opts?.now === 'function') return opts.now;
  return dateNow;
}

/**
 * @param {{hosts: Array<string>, clientIp: string, sshRun: Function,
 *   opts: Object, campaignId: string, sleep: Function, signal?: AbortSignal|null,
 *   now?: Function, nowFn?: Function}} input
 * @return {Promise<Object>}
 */
async function deployTiDbCluster({hosts, clientIp, sshRun, opts = {}, campaignId, sleep,
  signal = null, now, nowFn}) {
  requireCampaignId(campaignId);
  if (hosts.length < STORE_COUNT) {
    throw new Error(`TiDB arm needs ${STORE_COUNT} data hosts, got ${hosts.length}`);
  }
  const hostByContainer = new Map();
  const budget = resolveReadinessBudget(opts);
  const clock = resolveTiDbClock(now, nowFn, opts);
  const abortSignal = signal ?? opts?.signal ?? null;
  const deadlineAtMs = numberIsFinite(opts?.deadlineAtMs) ? opts.deadlineAtMs : null;
  const {trackedSshRun, settleInFlight} = createTrackedSshRun(sshRun, abortSignal);
  const postFailureOpts = {...(opts || {}), signal: null, deadlineAtMs: null, deadlineMs: null};
  const ctx = {sshRun: trackedSshRun, settleInFlight, opts, clientIp, sleep, now: clock,
    signal: abortSignal, deadlineAtMs, campaignId, budget, hostByContainer,
    provider: createRemoteDockerProvider({sshRun: trackedSshRun, opts,
      hostOf: (containerId) => hostByContainer.get(containerId)})};
  const images = {pd: opts.pdImage || PD_IMAGE_DEFAULT, tikv: opts.tikvImage || TIKV_IMAGE_DEFAULT,
    tidb: opts.tidbImage || TIDB_IMAGE_DEFAULT};
  const formed = {roles: [], endpoint: null};
  try {
    return await describingReadinessExhaustion(
      async () => {
        try {
          return await formTiDbCluster({ctx, hosts, images, formed});
        } finally {
          await settleInFlight();
        }
      },
      (failure) => {
        const postFailureCtx = {...ctx, sshRun, opts: postFailureOpts, signal: null,
          deadlineAtMs: null, provider: createRemoteDockerProvider({sshRun, opts: postFailureOpts,
            hostOf: (containerId) => hostByContainer.get(containerId)})};
        return describeExhaustedDeployment({targetId: 'tidb-tikv', topology: TOPOLOGY,
          sshRun, opts: postFailureOpts, roles: [...formed.roles], endpoint: formed.endpoint,
          dataDir: DATA_DIR,
          readVersions: (products) => reportedVersions(postFailureCtx, formed.endpoint, products),
          failure});
      },
    );
  } finally {
    await settleInFlight();
  }
}

async function formTiDbCluster({ctx, hosts, images, formed}) {
  const {sshRun, opts, campaignId, budget} = ctx;
  const roles = formed.roles;
  const pdHost = hosts[0];
  const pd = await start(ctx, ROLE.PD, pdHost, 1, images.pd,
    storageArgs(opts, campaignId, 'pd'),
    ['--name=pd', `--data-dir=${DATA_DIR}`, `--client-urls=http://0.0.0.0:${P.pdClientPort}`,
      `--peer-urls=http://0.0.0.0:${P.pdPeerPort}`,
      `--advertise-client-urls=http://${pdHost}:${P.pdClientPort}`,
      `--advertise-peer-urls=http://${pdHost}:${P.pdPeerPort}`,
      `--initial-cluster=pd=http://${pdHost}:${P.pdPeerPort}`]);
  roles.push(pd);
  const pdReadiness = await pdReady(ctx, pdHost);
  for (let index = 0; index < STORE_COUNT; index += 1) {
    roles.push(await start(ctx, ROLE.TIKV, hosts[index], index + 1, images.tikv,
      [...storageArgs(opts, campaignId, `tikv-${index + 1}`),
        '--ulimit', `nofile=${P.tikvNofileLimit}:${P.tikvNofileLimit}`],
      [`--addr=0.0.0.0:${P.tikvPort}`, `--advertise-addr=${hosts[index]}:${P.tikvPort}`,
        `--status-addr=0.0.0.0:${TIKV_STATUS_PORT}`, `--pd=${pdHost}:${P.pdClientPort}`,
        `--data-dir=${DATA_DIR}`]));
  }
  const tidb = await start(ctx, ROLE.TIDB, pdHost, 1, images.tidb, [],
    ['--store=tikv', `--path=${pdHost}:${P.pdClientPort}`, '--host=0.0.0.0',
      `-P=${P.tidbPort}`, `--status=${P.tidbStatusPort}`]);
  roles.push(tidb);
  formed.endpoint = {protocol: 'mysql', host: tidb.host, port: P.tidbPort,
    containerId: tidb.containerId, binding: null};
  ctx.sqlClient = await start(ctx, ROLE.READINESS_CLIENT, tidb.host, 1, TIDB_SQL_CLIENT_IMAGE,
    ['--entrypoint', 'sleep'], [String(SQL_CLIENT_LIFETIME_SECONDS)]);
  const endpoint = {host: tidb.host, port: P.tidbPort};
  const sqlReady = (readyCtx = ctx) => typedReadiness('tidb-sql-3-up-stores', () =>
    waitForTiDbReferenceSqlReady(readyCtx.provider, readyCtx.sqlClient.containerId, endpoint, {
      timeoutMs: budget.timeoutMs,
      pollIntervalMs: budget.pollIntervalMs,
      signal: readyCtx.signal ?? null,
      deadlineAtMs: readyCtx.deadlineAtMs ?? null,
      now: readyCtx.now,
      readinessSql: buildTiDbReferenceReadinessSql(STORE_COUNT),
      watchedContainers: arrayMap(roles, (role) => ({role: role.role,
        containerId: role.containerId})),
    }));
  const sqlReadiness = await sqlReady(ctx);
  const products = await reportedVersions(ctx, endpoint,
    await inspectProducts({sshRun, opts, roles}));
  verifyProductIdentity(products, {
    [ROLE.PD]: {imageRef: images.pd, versionPattern: versionPatternOf(images.pd)},
    [ROLE.TIKV]: {imageRef: images.tikv, versionPattern: versionPatternOf(images.tikv)},
    [ROLE.TIDB]: {imageRef: images.tidb, versionPattern: versionPatternOf(images.tidb)},
  });
  const binding = await bindEndpointToContainer({sshRun, opts, campaignId, endpoint,
    candidates: arrayFilter(roles, (role) => role.host === endpoint.host)});
  const storage = arrayMap(arrayFilter(products, (product) => product.role !== ROLE.TIDB),
    (product) => classifyStorage(product, DATA_DIR));
  const databaseName = opts.tidbDatabase || DEFAULT_DATABASE;
  const placement = () => typedReadiness('tidb-physical-placement', () =>
    waitForPhysicalTablePlacement({provider: ctx.provider,
      clientContainerId: ctx.sqlClient.containerId, endpoint, replicaTarget: STORE_COUNT,
      expectedAddresses: arrayMap(hosts.slice(0, STORE_COUNT),
        (host) => `${host}:${P.tikvPort}`),
      databaseName, tableName: PLACEMENT_TABLE, timeoutMs: budget.timeoutMs,
      pollIntervalMs: budget.pollIntervalMs}));
  const stopped = await stopReadinessClient(ctx);
  const readinessClient = {...ctx.sqlClient, imageRef: TIDB_SQL_CLIENT_IMAGE,
    imageId: stopped.imageId, measured: false, stateBeforeMeasurement: EXITED,
    stoppedAt: stopped.observedAt};
  return {
    targetId: 'tidb-tikv',
    topology: TOPOLOGY,
    roles: [...roles, readinessClient], storage, runClass: runClassOf(storage),
    readiness: {state: READINESS_STATE.READY, observedAt: new Date().toISOString(),
      evidence: {pd: pdReadiness, sql: sqlReadiness}},
    identity: {products},
    placement: null,
    endpoint: {protocol: 'mysql', ...endpoint, containerId: binding.containerId, binding},
    access: {connection: {user: 'root', database: databaseName}},
    operations: {
      awaitReady: async ({signal: readySignal, deadlineAtMs: readyDeadlineAtMs} = {}) => {
        const readyCtx = {
          ...ctx,
          signal: readySignal !== undefined ? readySignal : ctx.signal,
          deadlineAtMs: readyDeadlineAtMs !== undefined ? readyDeadlineAtMs : ctx.deadlineAtMs,
        };
        try {
          return await withReadinessClient(readyCtx, async () => ({
            pd: await pdReady(readyCtx, pdHost),
            sql: await sqlReady(readyCtx),
          }));
        } finally {
          await ctx.settleInFlight();
        }
      },
      observePlacement: () => withReadinessClient(ctx, async () => ({
        observedAt: new Date().toISOString(),
        source: 'tidb-reference-physical-placement-proof', ...(await placement())})),
      observeRoles: () => withReadinessClient(ctx, async () => ({
        stores: await observeStores(ctx, endpoint)})),
    },
  };
}

export {deployTiDbCluster};
