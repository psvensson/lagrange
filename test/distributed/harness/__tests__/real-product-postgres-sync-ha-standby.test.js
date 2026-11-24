// PostgreSQL synchronous-HA comparator (`pg-patroni-sync-ha-rf3`) standby
// startup contract: postgres:17-alpine ships `gosu` (not `su-exec`), host
// bind-mount volumes need both DATA_ROOT and PGDATA owned by `postgres` with
// mode 0700 on PGDATA, and container restarts via `docker restart -t 1` must
// not re-run `pg_basebackup` over an already initialized PGDATA.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  POSTGRES_TARGET,
  deployPostgresCluster,
} from '../real-product-deployer-postgres.js';
import {
  arrayFilter,
  arrayMap,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  createContainerLedger,
  postgresHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';

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
  }

  const readyAgain = await deployment.operations.awaitReady();
  assert.equal(readyAgain.servers.length, 3);
  assert.equal(readyAgain.streaming.state, 'ready');
});
