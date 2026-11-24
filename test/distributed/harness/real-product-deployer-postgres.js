/**
 * PostgreSQL arms of the comparative benchmark: a single primary
 * (`pg-single-primary`) or a primary with two synchronous streaming standbys
 * (target id `pg-patroni-sync-ha-rf3`; no Patroni runs, and the record says so).
 * Clients connect to the primary directly - there is no forwarder.
 *
 * Access is password (scram-sha-256) and scoped: pg_hba admits the bench
 * user only from the load-generator host and replication only from the
 * standby hosts; the rules are read back from pg_hba_file_rules. Readiness
 * is pg_isready on every server, the streaming standby count from
 * pg_stat_replication and the synchronous_standby_names read back.
 */
import {randomBytes} from 'node:crypto';

import {
  DateConstructor,
  arrayEvery,
  arrayFilter,
  arrayFlatMap,
  arrayJoin,
  arrayMap,
  arraySome,
  dateNow,
  dateToISOString,
  numberIsFinite,
  objectHasOwn,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEFAULT_POSTGRES_OBSERVATION_DEADLINE_MS,
  DEFAULT_POST_FAILURE_DIAGNOSTIC_DEADLINE_MS,
  POSTGRES_IMAGE_DEFAULT,
  READINESS_STATE,
  attachRemoteCommandAttribution,
  requireCampaignId,
  resolveFormationWindow,
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
import {
  describeExhaustedDeployment,
  describingReadinessExhaustion,
} from './real-product-exhausted-deployment.js';
import {pollReadiness} from './real-product-readiness.js';
import {
  classifyRemoteCommandError,
  createTrackedSshRun,
  dockerRunDetached,
  errorText,
  shellQuote,
  shellWord,
} from './real-product-remote-shell.js';
import {
  bindEndpointToContainer,
} from './real-product-sql-clients.js';

// Target ids are stream A's coverage-manifest ids; the HA id predates this
// layer and names no Patroni deployment - topology.description says what runs.
const TARGET = Object.freeze({SINGLE: 'pg-single-primary', SYNC_HA: 'pg-patroni-sync-ha-rf3'});
const ROLE = Object.freeze({PRIMARY: 'postgres-primary', STANDBY: 'postgres-standby'});
const PORT = 5432;
const DATA_ROOT = '/var/lib/postgresql/data';
const PGDATA = `${DATA_ROOT}/pgdata`;
const DATABASE = 'bench';
const APP_USER = 'bench';
const REPLICATION_USER = 'replicator';
const STANDBY_NAMES = Object.freeze(['s1', 's2']);
const PASSWORD_BYTES = 18;
const DEFAULT_POSTGRES_PROBE_TIMEOUT_MS = 10000;
const MAX_PG_ISREADY_TIMEOUT_SECONDS = 4;
const PG_STATEMENT_TIMEOUT_MARGIN_MS = 2000;
const PG_STATEMENT_THRESHOLD_MS = 3000;
const PG_STATEMENT_SHORT_RATIO = 0.6;
const MIN_PG_STATEMENT_TIMEOUT_MS = 250;
function versionPatternOfMajor(major) {
  return new RegExp(`^PostgreSQL ${major}[.\\s]`, 'u');
}
const MAJOR_TAG = /:(\d+)(?:[.-]|$)/u;
const SERVER_SETTINGS = Object.freeze(['listen_addresses=*', 'max_connections=300',
  'wal_level=replica', 'max_wal_senders=10', 'wal_keep_size=256MB', 'hot_standby=on',
  'password_encryption=scram-sha-256']);

function generatedPassword() {
  return randomBytes(PASSWORD_BYTES).toString('base64url');
}

function settingArgs() {
  return arrayFlatMap(SERVER_SETTINGS, (setting) => ['-c', setting]);
}

function storageArgs(opts, campaignId, label) {
  return opts.storageRoot ? ['-v', `${opts.storageRoot}/${campaignId}/${label}:${DATA_ROOT}`] :
    [];
}

function adminSql(cid, sql, statementTimeoutMs = DEFAULT_POSTGRES_PROBE_TIMEOUT_MS) {
  return `docker exec -e PGOPTIONS=${shellQuote(`-c statement_timeout=${statementTimeoutMs}`)} ` +
    `${shellWord(cid)} psql -X -U postgres -d ${DATABASE} -v ON_ERROR_STOP=1 ` +
    `-At -F '|' -c ${shellQuote(sql)}`;
}

function hbaFile({clientIps, standbyHosts}) {
  return arrayJoin(['local all all trust',
    ...arrayMap(clientIps, (ip) => `host ${DATABASE} ${APP_USER} ${ip}/32 scram-sha-256`),
    ...arrayMap(standbyHosts,
      (host) => `host replication ${REPLICATION_USER} ${host}/32 scram-sha-256`), ''], '\n');
}

function standbyScript({primaryHost, name, password}) {
  const conninfo = `host=${primaryHost} port=${PORT} user=${REPLICATION_USER} ` +
    `password=${password} application_name=${name}`;
  const serverFlags = arrayJoin(
    arrayMap(SERVER_SETTINGS, (setting) => `-c ${shellQuote(setting)}`),
    ' ',
  );
  return arrayJoin([
    'set -e',
    'SU_BIN="$(command -v gosu || command -v su-exec)"',
    `mkdir -p ${DATA_ROOT} ${PGDATA}`,
    `chown postgres ${DATA_ROOT} ${PGDATA}`,
    `chmod 0700 ${PGDATA}`,
    `if [ ! -s "${PGDATA}/PG_VERSION" ]; then`,
    `  "$SU_BIN" postgres pg_basebackup -d ${shellQuote(conninfo)} ` +
      `-D ${PGDATA} -Fp -Xs -R -c fast`,
    'fi',
    `exec "$SU_BIN" postgres postgres -D ${PGDATA} ${serverFlags}`,
  ], '\n');
}

function resolveCallSignal(ctx, pollContext) {
  const hasPollSignal = Boolean(pollContext && objectHasOwn(pollContext, 'signal'));
  const signal = hasPollSignal ? pollContext.signal :
    (objectHasOwn(ctx, 'signal') ? ctx.signal : undefined);
  if (signal?.aborted) {
    const err = new Error('PostgreSQL operation aborted');
    err.aborted = true;
    throw err;
  }
  return signal;
}

function resolveRemainingTimeoutMs(ctx, pollContext, maxTimeoutMs) {
  const clock = typeof ctx.now === 'function' ? ctx.now : dateNow;
  const deadlineAtMs = numberIsFinite(pollContext?.deadlineAtMs) ? pollContext.deadlineAtMs :
    (numberIsFinite(ctx.deadlineAtMs) ? ctx.deadlineAtMs : null);
  const remainingMs = numberIsFinite(pollContext?.remainingMs) ? pollContext.remainingMs :
    (deadlineAtMs !== null ? deadlineAtMs - clock() : null);
  if (remainingMs !== null && remainingMs <= 0) {
    const err = new Error('PostgreSQL operation deadline expired');
    err.deadlineExpired = true;
    throw err;
  }
  return remainingMs !== null ?
    Math.max(1, Math.min(maxTimeoutMs, Math.floor(remainingMs))) : maxTimeoutMs;
}

function callOptsFor(
  ctx,
  pollContext = null,
  maxTimeoutMs = DEFAULT_POSTGRES_PROBE_TIMEOUT_MS,
) {
  const signal = resolveCallSignal(ctx, pollContext);
  const timeoutMs = resolveRemainingTimeoutMs(ctx, pollContext, maxTimeoutMs);
  return withExplicitSignalOption({...stripTransientExecutionOptions(ctx.opts), timeoutMs}, signal);
}

function rethrowClassifiedPostgresError(error) {
  const classified = classifyRemoteCommandError(error);
  const err = error instanceof Error ? error : new Error(errorText(error));
  throw attachRemoteCommandAttribution(err, classified);
}

function serverReady(ctx, role) {
  return pollReadiness({
    component: `${role.role}@${role.host}`,
    attempts: ctx.budget.attempts,
    intervalMs: ctx.budget.intervalMs,
    sleep: ctx.sleep,
    now: ctx.now,
    signal: ctx.signal ?? null,
    deadlineAtMs: ctx.deadlineAtMs ?? null,
    probe: async (pollContext) => {
      const callOpts = callOptsFor(ctx, pollContext);
      const pgReadyTimeoutSeconds = Math.max(
        1,
        Math.min(MAX_PG_ISREADY_TIMEOUT_SECONDS, Math.floor(callOpts.timeoutMs / 2000)),
      );
      try {
        return {
          ready: true,
          diagnostic: await ctx.sshRun(
            role.host,
            callOpts,
            `docker exec ${shellWord(role.containerId)} pg_isready -t ${pgReadyTimeoutSeconds} ` +
              `-h 127.0.0.1 -p ${PORT} -U postgres`,
            callOpts.timeoutMs,
          ),
        };
      } catch (error) {
        return rethrowClassifiedPostgresError(error);
      }
    },
  });
}

async function query(ctx, role, sql, pollContext = null) {
  const callOpts = callOptsFor(ctx, pollContext);
  const timeoutMs = callOpts.timeoutMs;
  const statementTimeoutMs = timeoutMs > PG_STATEMENT_THRESHOLD_MS ?
    timeoutMs - PG_STATEMENT_TIMEOUT_MARGIN_MS :
    Math.max(MIN_PG_STATEMENT_TIMEOUT_MS, Math.floor(timeoutMs * PG_STATEMENT_SHORT_RATIO));
  try {
    const out = stringTrim(String(await ctx.sshRun(role.host, callOpts,
      adminSql(role.containerId, sql, statementTimeoutMs), timeoutMs)));
    const activeSignal = objectHasOwn(callOpts, 'signal') ? callOpts.signal : ctx.signal;
    if (activeSignal?.aborted) {
      const err = new Error('PostgreSQL operation aborted');
      err.aborted = true;
      throw err;
    }
    const clock = typeof ctx.now === 'function' ? ctx.now : dateNow;
    if (pollContext === null && numberIsFinite(ctx.deadlineAtMs) && clock() >= ctx.deadlineAtMs) {
      const err = new Error('PostgreSQL operation deadline expired');
      err.deadlineExpired = true;
      throw err;
    }
    return out;
  } catch (error) {
    return rethrowClassifiedPostgresError(error);
  }
}

function replicationRows(text) {
  return arrayMap(arrayFilter(stringSplit(text, '\n'), Boolean), (line) => {
    const [name, state, syncState] = stringSplit(line, '|');
    return {name, state, syncState};
  });
}

async function configureAccess(ctx, primary, {clientIps, standbyHosts, passwords}) {
  await query(ctx, primary, `CREATE ROLE ${APP_USER} LOGIN PASSWORD '${passwords.app}'`);
  await query(ctx, primary, `ALTER DATABASE ${DATABASE} OWNER TO ${APP_USER}`);
  await query(ctx, primary,
    `CREATE ROLE ${REPLICATION_USER} REPLICATION LOGIN PASSWORD '${passwords.replication}'`);
  const encoded = Buffer.from(hbaFile({clientIps, standbyHosts}), 'utf8').toString('base64');
  const hbaOpts = callOptsFor(ctx);
  try {
    await ctx.sshRun(
      primary.host,
      hbaOpts,
      `docker exec ${shellWord(primary.containerId)} ` +
        `sh -c ${shellQuote(`echo ${encoded} | base64 -d > "$PGDATA/pg_hba.conf"`)}`,
      hbaOpts.timeoutMs,
    );
  } catch (error) {
    return rethrowClassifiedPostgresError(error);
  }
  await query(ctx, primary, 'SELECT pg_reload_conf()');
  return stringSplit(await query(ctx, primary, 'SELECT type, database, user_name, address, ' +
    'auth_method FROM pg_hba_file_rules WHERE error IS NULL ORDER BY line_number'), '\n');
}

function streamingReady(ctx, primary, expected) {
  return pollReadiness({
    component: 'postgres-streaming-standbys',
    attempts: ctx.budget.attempts,
    intervalMs: ctx.budget.intervalMs,
    sleep: ctx.sleep,
    now: ctx.now,
    signal: ctx.signal ?? null,
    deadlineAtMs: ctx.deadlineAtMs ?? null,
    probe: async (pollContext) => {
      const rows = replicationRows(await query(ctx, primary,
        'SELECT application_name, state, sync_state FROM pg_stat_replication ' +
        'ORDER BY application_name', pollContext));
      return {ready: rows.length === expected &&
        arrayEvery(rows, (row) => row.state === 'streaming'), diagnostic: rows};
    },
  });
}

function synchronousReady(ctx, primary, setting) {
  return pollReadiness({
    component: 'postgres-synchronous-standby',
    attempts: ctx.budget.attempts,
    intervalMs: ctx.budget.intervalMs,
    sleep: ctx.sleep,
    now: ctx.now,
    signal: ctx.signal ?? null,
    deadlineAtMs: ctx.deadlineAtMs ?? null,
    probe: async (pollContext) => {
      const readBack = await query(ctx, primary, 'SHOW synchronous_standby_names', pollContext);
      const rows = replicationRows(await query(ctx, primary,
        'SELECT application_name, state, sync_state FROM pg_stat_replication ' +
        'ORDER BY application_name', pollContext));
      return {ready: readBack === setting && arraySome(rows, (row) => row.syncState === 'sync'),
        diagnostic: {synchronousStandbyNames: readBack, replication: rows}};
    },
  });
}

async function startStandbys(ctx, primary, {hosts, campaignId, image, passwords, roles}) {
  const standbys = [];
  for (let index = 0; index < STANDBY_NAMES.length; index += 1) {
    const started = await dockerRunDetached({sshRun: ctx.sshRun, opts: ctx.opts,
      host: hosts[index + 1], campaignId, role: ROLE.STANDBY, ordinal: index + 1, image,
      dockerArgs: [...storageArgs(ctx.opts, campaignId, `postgres-standby-${index + 1}`),
        '-e', `PGDATA=${PGDATA}`, '--entrypoint', 'sh'],
      commandArgs: ['-c', standbyScript({primaryHost: primary.host,
        name: STANDBY_NAMES[index], password: passwords.replication})]});
    const standby = {role: ROLE.STANDBY, host: started.host, containerId: started.containerId,
      standbyName: STANDBY_NAMES[index]};
    roles.push(standby);
    standbys.push(standby);
  }
  return standbys;
}

async function observeRoles(ctx, roles) {
  const servers = [];
  for (const role of roles) {
    servers.push({role: role.role, host: role.host, containerId: role.containerId,
      inRecovery: await query(ctx, role, 'SELECT pg_is_in_recovery()')});
  }
  return {servers, replication: replicationRows(await query(ctx, roles[0],
    'SELECT application_name, state, sync_state FROM pg_stat_replication ' +
    'ORDER BY application_name'))};
}

function resolvePostgresClock(now, nowFn, opts) {
  if (typeof nowFn === 'function') return nowFn;
  if (typeof now === 'function') return now;
  if (typeof opts?.nowFn === 'function') return opts.nowFn;
  if (typeof opts?.now === 'function') return opts.now;
  return dateNow;
}

function buildPostgresFormationCtx({sshRun, opts, sleep, clock, signal, deadlineAtMs,
  deadlineMs}) {
  const budget = resolveReadinessBudget(opts);
  const window = resolveFormationWindow({clock, budget, opts, signal, deadlineAtMs,
    deadlineMs});
  const {trackedSshRun, settleInFlight} = createTrackedSshRun(sshRun, window.signal);
  return {sshRun: trackedSshRun, settleInFlight, opts, sleep, now: clock,
    signal: window.signal, deadlineAtMs: window.deadlineAtMs, budget};
}

function describePostgresFailure({targetId, sshRun, clock, ctx, postFailureOpts, formed,
  failure}) {
  const postFailureWindow = resolveOperationWindow({
    clock,
    defaultDeadlineMs: DEFAULT_POST_FAILURE_DIAGNOSTIC_DEADLINE_MS,
    callerSignal: null,
  });
  const postFailureCtx = {...ctx, sshRun, opts: postFailureOpts, signal: null,
    deadlineAtMs: postFailureWindow.deadlineAtMs};
  return describeExhaustedDeployment({
    targetId, topology: postgresTopology(targetId), sshRun, opts: postFailureOpts,
    roles: [...formed.roles], endpoint: formed.endpoint, dataDir: DATA_ROOT,
    deadlineAtMs: postFailureWindow.deadlineAtMs, now: clock,
    readVersions: (products) => reportedVersions(postFailureCtx, products), failure});
}

/**
 * @param {{targetId: string, hosts: Array<string>, clientIp: string,
 *   sshRun: Function, opts: Object, campaignId: string, sleep: Function,
 *   signal?: AbortSignal|null, deadlineAtMs?: number|null,
 *   deadlineMs?: number|null, now?: Function, nowFn?: Function}} input
 * @return {Promise<Object>}
 */
async function deployPostgresCluster({targetId, hosts, clientIp, sshRun, opts = {}, campaignId,
  sleep, signal = null, deadlineAtMs = null, deadlineMs = null, now, nowFn}) {
  requireCampaignId(campaignId);
  if (targetId !== TARGET.SINGLE && targetId !== TARGET.SYNC_HA) {
    throw new Error(`unknown PostgreSQL comparative target ${targetId}`);
  }
  const image = opts.postgresImage || POSTGRES_IMAGE_DEFAULT;
  const clock = resolvePostgresClock(now, nowFn, opts);
  const ctx = buildPostgresFormationCtx({sshRun, opts, sleep, clock, signal, deadlineAtMs,
    deadlineMs});
  const postFailureOpts = withExplicitSignalOption(stripTransientExecutionOptions(opts), null);
  const passwords = {superuser: generatedPassword(), app: generatedPassword(),
    replication: generatedPassword()};
  const formed = {roles: [], endpoint: null};
  try {
    return await describingReadinessExhaustion(
      async () => {
        try {
          return await formPostgresCluster({ctx, rawSshRun: sshRun, targetId, hosts,
            clientIp, campaignId, image, passwords, formed});
        } finally {
          await ctx.settleInFlight();
        }
      },
      (failure) => describePostgresFailure({targetId, sshRun, clock, ctx, postFailureOpts,
        formed, failure}),
    );
  } finally {
    await ctx.settleInFlight();
  }
}

function postgresTopology(targetId) {
  return {description: targetId === TARGET.SYNC_HA ?
    `primary + ${STANDBY_NAMES.length} synchronous streaming standbys` : 'single primary',
  clientPath: 'direct-to-primary', haManager: null};
}

async function reportedVersions(ctx, products) {
  for (const product of products) {
    const version = await query(ctx, product, 'SELECT version()');
    // An empty answer is no version: null with why, never ''.
    Object.assign(product, version === '' ?
      {reportedVersion: null, reportedVersionError: 'SELECT version() answered nothing'} :
      {reportedVersion: version, reportedVersionError: null});
  }
  return products;
}

async function formPostgresCluster({ctx, rawSshRun, targetId, hosts, clientIp, campaignId, image,
  passwords, formed}) {
  const {sshRun, opts} = ctx;
  const standbyHosts = targetId === TARGET.SYNC_HA ? hosts.slice(1, 1 + STANDBY_NAMES.length) :
    [];
  const started = await dockerRunDetached({sshRun, opts, host: hosts[0], campaignId,
    role: ROLE.PRIMARY, image,
    dockerArgs: [...storageArgs(opts, campaignId, 'postgres-primary'),
      '-e', `POSTGRES_PASSWORD=${passwords.superuser}`, '-e', `POSTGRES_DB=${DATABASE}`,
      '-e', `PGDATA=${PGDATA}`],
    commandArgs: ['postgres', ...settingArgs()]});
  const primary = {role: ROLE.PRIMARY, host: started.host, containerId: started.containerId};
  const roles = formed.roles;
  roles.push(primary);
  formed.endpoint = {protocol: 'postgresql', host: primary.host, port: PORT,
    containerId: primary.containerId, binding: null};
  const readiness = {servers: [await serverReady(ctx, primary)]};
  // The load generator, plus the controller when it runs the semantic proof
  // journey in process (opts.proofClientIps): each one /32, scram, read back.
  const clientIps = [...new Set([clientIp, ...(opts.proofClientIps || [])])];
  const hbaRules = await configureAccess(ctx, primary, {clientIps, standbyHosts, passwords});
  if (targetId === TARGET.SYNC_HA) {
    const standbys = await startStandbys(ctx, primary, {hosts, campaignId, image, passwords,
      roles});
    for (const standby of standbys) readiness.servers.push(await serverReady(ctx, standby));
    readiness.streaming = await streamingReady(ctx, primary, standbys.length);
    const setting = `FIRST 1 (${arrayJoin(STANDBY_NAMES, ', ')})`;
    await query(ctx, primary, `ALTER SYSTEM SET synchronous_standby_names = '${setting}'`);
    await query(ctx, primary, 'ALTER SYSTEM SET synchronous_commit = \'on\'');
    await query(ctx, primary, 'SELECT pg_reload_conf()');
    readiness.synchronous = await synchronousReady(ctx, primary, setting);
  }
  const products = await reportedVersions(ctx, await inspectProducts({
    sshRun,
    opts,
    roles,
    signal: ctx.signal,
    deadlineAtMs: ctx.deadlineAtMs,
    now: ctx.now,
  }));
  const expectation = {imageRef: image,
    versionPattern: pinnedVersionPattern(image, MAJOR_TAG, versionPatternOfMajor)};
  verifyProductIdentity(products, {[ROLE.PRIMARY]: expectation, [ROLE.STANDBY]: expectation});
  const bindRemainingMs = numberIsFinite(ctx.deadlineAtMs) ?
    Math.max(0, ctx.deadlineAtMs - ctx.now()) : undefined;
  const binding = await bindEndpointToContainer({
    sshRun,
    opts,
    campaignId,
    endpoint: {host: primary.host, port: PORT},
    candidates: [primary],
    signal: ctx.signal,
    timeoutMs: bindRemainingMs,
    settleInFlight: ctx.settleInFlight,
  });
  const storage = arrayMap(products, (product) => classifyStorage(product, DATA_ROOT));
  const connection = {user: APP_USER, password: passwords.app, database: DATABASE};
  const endpoint = {protocol: 'postgresql', host: primary.host, port: PORT,
    containerId: binding.containerId, binding};
  const cleanOpts = stripTransientExecutionOptions(opts);
  const postTracker = createTrackedSshRun(rawSshRun, null);
  const basePostFormationCtx = {
    sshRun: postTracker.trackedSshRun,
    settleInFlight: postTracker.settleInFlight,
    opts: cleanOpts,
    sleep: ctx.sleep,
    now: ctx.now,
    signal: null,
    deadlineAtMs: null,
    budget: ctx.budget,
  };
  const formationObservedAt = dateToISOString(new DateConstructor(ctx.now()));
  const observeWithWindow = async ({signal: opSignal, deadlineAtMs: opDeadlineAtMs,
    deadlineMs: opDeadlineMs} = {}) => {
    const window = resolveOperationWindow({
      clock: basePostFormationCtx.now,
      defaultDeadlineMs: DEFAULT_POSTGRES_OBSERVATION_DEADLINE_MS,
      callerDeadlineAtMs: opDeadlineAtMs,
      callerDeadlineMs: opDeadlineMs,
      callerSignal: opSignal,
    });
    const opCtx = {
      ...basePostFormationCtx,
      signal: window.signal ?? null,
      deadlineAtMs: window.deadlineAtMs,
    };
    try {
      return await observeRoles(opCtx, roles);
    } finally {
      await basePostFormationCtx.settleInFlight();
    }
  };
  return {
    targetId,
    topology: postgresTopology(targetId),
    roles, storage, runClass: runClassOf(storage),
    readiness: {state: READINESS_STATE.READY, observedAt: formationObservedAt,
      evidence: readiness},
    access: {connection, hbaRules},
    accessEvidence: {authMethod: 'scram-sha-256', hbaRules},
    identity: {products},
    placement: {observedAt: formationObservedAt,
      source: 'pg_is_in_recovery + pg_stat_replication', ...(await observeRoles(ctx, roles))},
    endpoint,
    operations: {
      observePlacement: observeWithWindow,
      observeRoles: observeWithWindow,
      // The arm's readiness contract again (after a product restart).
      awaitReady: async ({signal: readySignal, deadlineAtMs: readyDeadlineAtMs,
        deadlineMs: readyDeadlineMs} = {}) => {
        const window = resolveOperationWindow({
          clock: basePostFormationCtx.now,
          defaultDeadlineMs: basePostFormationCtx.budget.formationDeadlineMs,
          callerDeadlineAtMs: readyDeadlineAtMs,
          callerDeadlineMs: readyDeadlineMs,
          callerSignal: readySignal,
        });
        const readyCtx = {
          ...basePostFormationCtx,
          signal: window.signal ?? null,
          deadlineAtMs: window.deadlineAtMs,
        };
        try {
          const again = {servers: []};
          for (const role of roles) again.servers.push(await serverReady(readyCtx, role));
          if (roles.length > 1) {
            again.streaming = await streamingReady(readyCtx, primary, roles.length - 1);
          }
          return again;
        } finally {
          await basePostFormationCtx.settleInFlight();
        }
      },
    },
  };
}

export {TARGET as POSTGRES_TARGET, deployPostgresCluster};
