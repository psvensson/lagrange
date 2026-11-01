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
  arrayEvery,
  arrayFilter,
  arrayFlatMap,
  arrayJoin,
  arrayMap,
  arraySome,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  POSTGRES_IMAGE_DEFAULT,
  READINESS_STATE,
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
import {pollReadiness} from './real-product-readiness.js';
import {
  dockerRunDetached,
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
function versionPatternOfMajor(major) {
  return new RegExp(`^PostgreSQL ${major}[.\\s]`, 'u');
}
const MAJOR_TAG = /:(\d+)(?:[.-]|$)/u;
const SERVER_SETTINGS = Object.freeze(['listen_addresses=*', 'max_connections=300',
  'wal_level=replica', 'max_wal_senders=10', 'hot_standby=on',
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

function adminSql(cid, sql) {
  return `docker exec ${shellWord(cid)} psql -U postgres -d ${DATABASE} -v ON_ERROR_STOP=1 ` +
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
  return arrayJoin(['set -e', `mkdir -p ${PGDATA}`, `chown postgres ${PGDATA}`,
    `chmod 0700 ${PGDATA}`,
    `su-exec postgres pg_basebackup -d ${shellQuote(conninfo)} -D ${PGDATA} -Fp -Xs -R`,
    `exec su-exec postgres postgres -D ${PGDATA} ${arrayJoin(arrayMap(SERVER_SETTINGS,
      (setting) => `-c ${setting}`), ' ')}`], '\n');
}

function serverReady(ctx, role) {
  return pollReadiness({component: `${role.role}@${role.host}`,
    attempts: ctx.budget.attempts, intervalMs: ctx.budget.intervalMs, sleep: ctx.sleep,
    probe: async () => ({ready: true, diagnostic: await ctx.sshRun(role.host, ctx.opts,
      `docker exec ${shellWord(role.containerId)} pg_isready -h 127.0.0.1 -p ${PORT} ` +
      '-U postgres')})});
}

async function query(ctx, role, sql) {
  return stringTrim(String(await ctx.sshRun(role.host, ctx.opts,
    adminSql(role.containerId, sql)) ?? ''));
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
  await ctx.sshRun(primary.host, ctx.opts, `docker exec ${shellWord(primary.containerId)} ` +
    `sh -c ${shellQuote(`echo ${encoded} | base64 -d > "$PGDATA/pg_hba.conf"`)}`);
  await query(ctx, primary, 'SELECT pg_reload_conf()');
  return stringSplit(await query(ctx, primary, 'SELECT type, database, user_name, address, ' +
    'auth_method FROM pg_hba_file_rules WHERE error IS NULL ORDER BY line_number'), '\n');
}

function streamingReady(ctx, primary, expected) {
  return pollReadiness({component: 'postgres-streaming-standbys',
    attempts: ctx.budget.attempts, intervalMs: ctx.budget.intervalMs, sleep: ctx.sleep,
    probe: async () => {
      const rows = replicationRows(await query(ctx, primary,
        'SELECT application_name, state, sync_state FROM pg_stat_replication ' +
        'ORDER BY application_name'));
      return {ready: rows.length === expected &&
        arrayEvery(rows, (row) => row.state === 'streaming'), diagnostic: rows};
    }});
}

function synchronousReady(ctx, primary, setting) {
  return pollReadiness({component: 'postgres-synchronous-standby',
    attempts: ctx.budget.attempts, intervalMs: ctx.budget.intervalMs, sleep: ctx.sleep,
    probe: async () => {
      const readBack = await query(ctx, primary, 'SHOW synchronous_standby_names');
      const rows = replicationRows(await query(ctx, primary,
        'SELECT application_name, state, sync_state FROM pg_stat_replication ' +
        'ORDER BY application_name'));
      return {ready: readBack === setting && arraySome(rows, (row) => row.syncState === 'sync'),
        diagnostic: {synchronousStandbyNames: readBack, replication: rows}};
    }});
}

async function startStandbys(ctx, primary, {hosts, campaignId, image, passwords}) {
  const standbys = [];
  for (let index = 0; index < STANDBY_NAMES.length; index += 1) {
    const started = await dockerRunDetached({sshRun: ctx.sshRun, opts: ctx.opts,
      host: hosts[index + 1], campaignId, role: ROLE.STANDBY, ordinal: index + 1, image,
      dockerArgs: [...storageArgs(ctx.opts, campaignId, `postgres-standby-${index + 1}`),
        '-e', `PGDATA=${PGDATA}`, '--entrypoint', 'sh'],
      commandArgs: ['-c', standbyScript({primaryHost: primary.host,
        name: STANDBY_NAMES[index], password: passwords.replication})]});
    standbys.push({role: ROLE.STANDBY, host: started.host, containerId: started.containerId,
      standbyName: STANDBY_NAMES[index]});
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

/**
 * @param {{targetId: string, hosts: Array<string>, clientIp: string,
 *   sshRun: Function, opts: Object, campaignId: string, sleep: Function}} input
 * @return {Promise<Object>}
 */
async function deployPostgresCluster({targetId, hosts, clientIp, sshRun, opts, campaignId,
  sleep}) {
  requireCampaignId(campaignId);
  if (targetId !== TARGET.SINGLE && targetId !== TARGET.SYNC_HA) {
    throw new Error(`unknown PostgreSQL comparative target ${targetId}`);
  }
  const image = opts.postgresImage || POSTGRES_IMAGE_DEFAULT;
  const ctx = {sshRun, opts, sleep, budget: resolveReadinessBudget(opts)};
  const passwords = {superuser: generatedPassword(), app: generatedPassword(),
    replication: generatedPassword()};
  const standbyHosts = targetId === TARGET.SYNC_HA ? hosts.slice(1, 1 + STANDBY_NAMES.length) :
    [];
  const started = await dockerRunDetached({sshRun, opts, host: hosts[0], campaignId,
    role: ROLE.PRIMARY, image,
    dockerArgs: [...storageArgs(opts, campaignId, 'postgres-primary'),
      '-e', `POSTGRES_PASSWORD=${passwords.superuser}`, '-e', `POSTGRES_DB=${DATABASE}`,
      '-e', `PGDATA=${PGDATA}`],
    commandArgs: ['postgres', ...settingArgs()]});
  const primary = {role: ROLE.PRIMARY, host: started.host, containerId: started.containerId};
  const readiness = {servers: [await serverReady(ctx, primary)]};
  // The load generator, plus the controller when it runs the semantic proof
  // journey in process (opts.proofClientIps): each one /32, scram, read back.
  const clientIps = [...new Set([clientIp, ...(opts.proofClientIps || [])])];
  const hbaRules = await configureAccess(ctx, primary, {clientIps, standbyHosts, passwords});
  const roles = [primary];
  if (targetId === TARGET.SYNC_HA) {
    const standbys = await startStandbys(ctx, primary, {hosts, campaignId, image, passwords});
    for (const standby of standbys) readiness.servers.push(await serverReady(ctx, standby));
    roles.push(...standbys);
    readiness.streaming = await streamingReady(ctx, primary, standbys.length);
    const setting = `FIRST 1 (${arrayJoin(STANDBY_NAMES, ', ')})`;
    await query(ctx, primary, `ALTER SYSTEM SET synchronous_standby_names = '${setting}'`);
    await query(ctx, primary, 'ALTER SYSTEM SET synchronous_commit = \'on\'');
    await query(ctx, primary, 'SELECT pg_reload_conf()');
    readiness.synchronous = await synchronousReady(ctx, primary, setting);
  }
  const products = await inspectProducts({sshRun, opts, roles});
  for (const product of products) {
    product.reportedVersion = await query(ctx, product, 'SELECT version()');
  }
  const expectation = {imageRef: image,
    versionPattern: pinnedVersionPattern(image, MAJOR_TAG, versionPatternOfMajor)};
  verifyProductIdentity(products, {[ROLE.PRIMARY]: expectation, [ROLE.STANDBY]: expectation});
  const binding = await bindEndpointToContainer({sshRun, opts, campaignId,
    endpoint: {host: primary.host, port: PORT}, candidates: [primary]});
  const storage = arrayMap(products, (product) => classifyStorage(product, DATA_ROOT));
  const connection = {user: APP_USER, password: passwords.app, database: DATABASE};
  const endpoint = {protocol: 'postgresql', host: primary.host, port: PORT,
    containerId: binding.containerId, binding};
  return {
    targetId,
    topology: {description: targetId === TARGET.SYNC_HA ?
      `primary + ${STANDBY_NAMES.length} synchronous streaming standbys` : 'single primary',
    clientPath: 'direct-to-primary', haManager: null},
    roles, storage, runClass: runClassOf(storage),
    readiness: {state: READINESS_STATE.READY, observedAt: new Date().toISOString(),
      evidence: readiness},
    access: {connection, hbaRules},
    accessEvidence: {authMethod: 'scram-sha-256', hbaRules},
    identity: {products},
    placement: {observedAt: new Date().toISOString(),
      source: 'pg_is_in_recovery + pg_stat_replication', ...(await observeRoles(ctx, roles))},
    endpoint,
    operations: {
      observePlacement: async () => observeRoles(ctx, roles),
      observeRoles: async () => observeRoles(ctx, roles),
      // The arm's readiness contract again (after a product restart).
      awaitReady: async () => {
        const again = {servers: []};
        for (const role of roles) again.servers.push(await serverReady(ctx, role));
        if (roles.length > 1) {
          again.streaming = await streamingReady(ctx, primary, roles.length - 1);
        }
        return again;
      },
    },
  };
}

export {TARGET as POSTGRES_TARGET, deployPostgresCluster};
