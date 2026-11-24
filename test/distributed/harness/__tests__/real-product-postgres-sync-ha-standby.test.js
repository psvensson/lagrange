// PostgreSQL synchronous-HA comparator (`pg-patroni-sync-ha-rf3`) standby
// startup contract: postgres:17-alpine ships `gosu` (not `su-exec`), host
// bind-mount volumes need both DATA_ROOT and PGDATA owned by `postgres` with
// mode 0700 on PGDATA, and container restarts via `docker restart -t 1` must
// not re-run `pg_basebackup` over an already initialized PGDATA.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {test} from 'node:test';
import {promisify} from 'node:util';

import {
  POSTGRES_TARGET,
  deployPostgresCluster,
} from '../real-product-deployer-postgres.js';
import {
  arrayEvery,
  arrayFilter,
  arrayMap,
  stringIncludes,
  stringReplace,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {
  createPsqlQueryReader,
  createPsqlStatementRunner,
} from '../real-product-sql-clients.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  createContainerLedger,
  postgresHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';

const execFileAsync = promisify(execFile);

const HOSTS = Object.freeze(['10.0.0.1', '10.0.0.2', '10.0.0.3']);
const BASE_OPTS = Object.freeze({
  readiness: {stablePolls: 1, attempts: 2, intervalMs: 0, timeoutMs: 50, pollIntervalMs: 1},
});

function deploySyncHa(sshRun, extraOpts = {}) {
  return deployPostgresCluster({
    targetId: POSTGRES_TARGET.SYNC_HA,
    hosts: [...HOSTS],
    clientIp: '10.0.0.9',
    sshRun,
    opts: {...BASE_OPTS, ...extraOpts},
    campaignId: 'camp-pg-sync-ha',
    sleep: async () => {},
  });
}

test('pg-patroni-sync-ha-rf3 standby startup resolves gosu/su-exec dynamically, owns DATA_ROOT ' +
  'and PGDATA, and guards pg_basebackup for restart idempotency', async () => {
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh(postgresHealthyRules(ledger));

  const deployment = await deploySyncHa(sshRun, {storageRoot: '/var/tmp/pg-bench'});

  assert.equal(deployment.targetId, POSTGRES_TARGET.SYNC_HA);
  assert.equal(deployment.readiness.state, 'ready');
  assert.equal(deployment.runClass, 'publishable');
  assert.deepEqual(
    arrayMap(deployment.roles, (role) => [role.role, role.host]),
    [
      ['postgres-primary', '10.0.0.1'],
      ['postgres-standby', '10.0.0.2'],
      ['postgres-standby', '10.0.0.3'],
    ],
  );

  const standbyRuns = arrayFilter(
    calls,
    (call) => /^docker run -d .*postgres-standby-/u.test(call.command),
  );
  assert.equal(standbyRuns.length, 2, 'must start two synchronous streaming standbys');

  for (let index = 0; index < standbyRuns.length; index += 1) {
    const command = standbyRuns[index].command;
    const expectedName = `s${index + 1}`;
    assert.match(command, /SU_BIN="\$\(command -v gosu \|\| command -v su-exec\)"/u,
      'standby script must resolve privilege-drop binary via command -v gosu || command -v su-exec');
    assert.equal(/\bsu-exec postgres\b/u.test(command), false,
      'standby script must never invoke bare su-exec postgres');
    assert.equal(
      stringIncludes(command, 'mkdir -p /var/lib/postgresql/data /var/lib/postgresql/data/pgdata'),
      true,
      'standby script must ensure DATA_ROOT and PGDATA exist',
    );
    assert.equal(
      stringIncludes(command, 'chown postgres /var/lib/postgresql/data /var/lib/postgresql/data/pgdata'),
      true,
      'standby script must own both DATA_ROOT and PGDATA as postgres',
    );
    assert.equal(
      stringIncludes(command, 'chmod 0700 /var/lib/postgresql/data/pgdata'),
      true,
      'standby script must enforce 0700 permissions on PGDATA',
    );
    assert.match(
      command,
      /if \[ ! -s "?\/var\/lib\/postgresql\/data\/pgdata\/PG_VERSION"? \]; then[\s\S]*?"\$SU_BIN" postgres pg_basebackup[\s\S]*?-D \/var\/lib\/postgresql\/data\/pgdata -Fp -Xs -R -c fast[\s\S]*?fi/u,
      'pg_basebackup must be guarded by PG_VERSION existence and use fast checkpoint',
    );
    assert.equal(
      stringIncludes(command, 'wal_keep_size=256MB'),
      true,
      'PostgreSQL servers must retain WAL segments for concurrent pg_basebackup and restart recovery',
    );
    assert.equal(
      stringIncludes(command, `application_name=${expectedName}`),
      true,
      `standby ${expectedName} must identify itself in replication conninfo`,
    );
    assert.match(
      command,
      /exec "\$SU_BIN" postgres postgres -D \/var\/lib\/postgresql\/data\/pgdata /u,
      'standby script must exec postgres under resolved privilege-drop binary',
    );
    assert.equal(
      stringIncludes(
        command,
        `-v /var/tmp/pg-bench/camp-pg-sync-ha/postgres-standby-${index + 1}:/var/lib/postgresql/data`,
      ),
      true,
      'standby container must mount its host volume at DATA_ROOT',
    );
    assert.equal(
      stringIncludes(command, 'find /var/lib/postgresql/data/pgdata -mindepth 1 -delete'),
      true,
      'standby script must clean partial PGDATA contents when PG_VERSION is absent',
    );
  }

  const readyAgain = await deployment.operations.awaitReady();
  assert.equal(readyAgain.servers.length, 3);
  assert.equal(readyAgain.streaming.state, 'ready');
});

async function runLocalShell(command, timeoutMs = 60_000) {
  const {stdout} = await execFileAsync('sh', ['-c', command], {timeout: timeoutMs});
  return stringTrim(String(stdout ?? ''));
}

async function hasLocalPostgres17Image() {
  try {
    const id = await runLocalShell('docker image inspect --format "{{.Id}}" postgres:17-alpine',
      5000);
    return id !== '';
  } catch {
    return false;
  }
}

function translateLocalBridgeDockerCommand(host, networkName, command) {
  const pidMatch = /--pid\s+'?container:([0-9a-f]{12,64})'?/u.exec(command);
  if (pidMatch) {
    return stringReplace(command, '--network host', `--network container:${pidMatch[1]}`);
  }
  if (stringIncludes(command, 'docker run') && stringIncludes(command, '--network host')) {
    return stringReplace(command, '--network host', `--network ${networkName} --ip ${host}`);
  }
  return command;
}

async function cleanupLivePostgresWitness({campaignId, networkName, storageRoot}) {
  try {
    const ids = await runLocalShell(
      `docker ps -aq --filter label=lagrange.bench.campaign=${campaignId}`, 15_000);
    if (ids !== '') {
      await runLocalShell(`docker rm -f ${stringReplace(ids, /\s+/gu, ' ')}`, 20_000);
    }
  } catch {
    // Best-effort container cleanup in finally.
  }
  if (storageRoot) {
    try {
      await runLocalShell(
        `docker run --rm --pull=never -v ${storageRoot}:/cleanup --entrypoint sh ` +
          'postgres:17-alpine -c "rm -rf /cleanup/*"',
        15_000,
      );
    } catch {
      // Fall through to host rm.
    }
    await rm(storageRoot, {recursive: true, force: true});
  }
  if (networkName) {
    try {
      await runLocalShell(`docker network rm ${networkName}`, 10_000);
    } catch {
      // Best-effort network cleanup in finally.
    }
  }
}

test('live postgres:17-alpine deployPostgresCluster witness forms primary + 2 sync standbys, ' +
  'recovers interrupted partial PGDATA, replicates sentinel rows, preserves PGDATA across ' +
  'standby restart, and fails closed on reverted su-exec command', async (t) => {
  if (!(await hasLocalPostgres17Image())) {
    t.skip('postgres:17-alpine local Docker image not available on this host');
    return;
  }
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  const campaignId = `camp-pg-live-${suffix}`;
  const networkName = `bench-pg-ha-net-${suffix}`;
  const subnetPrefix = `172.29.${(process.pid % 200) + 20}`;
  const liveHosts = [`${subnetPrefix}.2`, `${subnetPrefix}.3`, `${subnetPrefix}.4`];
  const clientIp = `${subnetPrefix}.9`;
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'pg-sync-ha-live-'));

  try {
    await runLocalShell(
      `docker network create --subnet=${subnetPrefix}.0/28 ${networkName}`, 15_000);

    // 1. Reverted su-exec-only startup command must fail closed against real postgres:17-alpine.
    await assert.rejects(
      runLocalShell(
        'docker run --rm --pull=never --entrypoint sh postgres:17-alpine ' +
          '-c "set -e; su-exec postgres pg_isready"',
        15_000,
      ),
      (err) => err.code === 127 || stringIncludes(String(err.stderr || err.message), 'su-exec'),
    );

    // 2. Simulate interrupted standby-1 initialization: partial file in PGDATA without PG_VERSION.
    const standby1PgData = path.join(storageRoot, campaignId, 'postgres-standby-1', 'pgdata');
    const partialFile = path.join(standby1PgData, 'partial-uninitialized.tmp');
    await mkdir(standby1PgData, {recursive: true});
    await writeFile(partialFile, 'interrupted-partial-bytes', 'utf8');

    const sshRun = async (host, _opts, command, timeoutMs = 45_000) =>
      runLocalShell(translateLocalBridgeDockerCommand(host, networkName, command), timeoutMs);

    // 3. Invoke actual deployPostgresCluster (pg-patroni-sync-ha-rf3) against postgres:17-alpine.
    const deployment = await deployPostgresCluster({
      targetId: POSTGRES_TARGET.SYNC_HA,
      hosts: liveHosts,
      clientIp,
      sshRun,
      opts: {
        storageRoot,
        readiness: {stablePolls: 1, attempts: 60, intervalMs: 250},
      },
      campaignId,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });

    assert.equal(deployment.targetId, POSTGRES_TARGET.SYNC_HA);
    assert.equal(deployment.readiness.state, 'ready');
    assert.equal(deployment.runClass, 'publishable');
    assert.equal(
      deployment.readiness.evidence.synchronous.evidence.synchronousStandbyNames,
      'FIRST 1 (s1, s2)',
    );
    assert.deepEqual(
      arrayMap(deployment.placement.servers, (s) => [s.role, s.inRecovery]),
      [
        ['postgres-primary', 'f'],
        ['postgres-standby', 't'],
        ['postgres-standby', 't'],
      ],
    );
    assert.equal(
      arrayEvery(deployment.placement.replication, (r) => r.state === 'streaming'),
      true,
    );

    // Interrupted partial file was cleared and replaced by clean basebackup PG_VERSION.
    const standby1 = deployment.roles[1];
    const basebackupVerify = await runLocalShell(
      `docker exec ${standby1.containerId} sh -c "` +
        'test ! -e /var/lib/postgresql/data/pgdata/partial-uninitialized.tmp && ' +
        'test -s /var/lib/postgresql/data/pgdata/PG_VERSION && echo clean-basebackup"',
    );
    assert.equal(basebackupVerify, 'clean-basebackup');

    // 4. Commit a sentinel row on primary and read it back across primary and both standbys.
    const primaryTarget = {
      sshRun,
      opts: {},
      from: clientIp,
      campaignId,
      endpoint: {host: deployment.endpoint.host, port: deployment.endpoint.port},
      connection: deployment.access.connection,
    };
    const primaryStatement = createPsqlStatementRunner(primaryTarget);
    await primaryStatement('CREATE TABLE ha_live_witness (id INT PRIMARY KEY, note TEXT)');
    const inserted1 = await primaryStatement(
      'INSERT INTO ha_live_witness (id, note) VALUES (1, \'committed-before-restart\')');
    assert.equal(inserted1.rowCount, 1);

    for (const host of liveHosts) {
      const reader = createPsqlQueryReader({...primaryTarget, endpoint: {host, port: 5432}});
      const rows = await reader('SELECT id, note FROM ha_live_witness ORDER BY id');
      assert.deepEqual(rows, [{id: '1', note: 'committed-before-restart'}]);
    }

    // 5. Place retained-storage sentinel in standby-1 PGDATA, restart standby-1, and verify
    //    it rejoins without re-running pg_basebackup and replicates post-restart commits.
    const retainedMarker = '/var/lib/postgresql/data/pgdata/retained_after_basebackup.marker';
    await runLocalShell(
      `docker exec ${standby1.containerId} sh -c "echo retained > ${retainedMarker}"`,
    );
    const startedBefore = await runLocalShell(
      `docker inspect --format "{{.State.StartedAt}}" ${standby1.containerId}`,
    );
    await runLocalShell(`docker restart -t 1 ${standby1.containerId}`);
    const readyAfterRestart = await deployment.operations.awaitReady();
    assert.equal(readyAfterRestart.streaming.state, 'ready');
    const startedAfter = await runLocalShell(
      `docker inspect --format "{{.State.StartedAt}}" ${standby1.containerId}`,
    );
    assert.notEqual(startedAfter, startedBefore);
    const markerContent = await runLocalShell(
      `docker exec ${standby1.containerId} cat ${retainedMarker}`,
    );
    assert.equal(markerContent, 'retained',
      'standby restart against retained PG_VERSION must not re-run pg_basebackup');

    const inserted2 = await primaryStatement(
      'INSERT INTO ha_live_witness (id, note) VALUES (2, \'committed-after-restart\')');
    assert.equal(inserted2.rowCount, 1);
    const standby1Reader = createPsqlQueryReader({
      ...primaryTarget,
      endpoint: {host: standby1.host, port: 5432},
    });
    const rowsAfter = await standby1Reader('SELECT id, note FROM ha_live_witness ORDER BY id');
    assert.deepEqual(rowsAfter, [
      {id: '1', note: 'committed-before-restart'},
      {id: '2', note: 'committed-after-restart'},
    ]);
  } finally {
    await cleanupLivePostgresWitness({campaignId, networkName, storageRoot});
  }
});
