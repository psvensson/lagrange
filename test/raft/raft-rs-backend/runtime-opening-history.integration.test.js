// Native opening-history proof: exact local identity and commit ordering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {historyDb, openHistory, lifecycle, applicationRows, HISTORY_ID} from './opening-history-native-fixture.js';
import {setCoreFaultInjector, setActualCoreEntryObserver} from '../../../src/raft/raft-rs-runtime-owner.js';
import {RAFT_RS_TABLE} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from '../../../src/raft/raft-operation-port-constants.js';
import {CORE_REFUSAL_KIND} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {prepareReplicaLifecycleForSnapshot} from '../../../src/raft/raft-rs-replica-lifecycle-owner.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-opening-history-'));
  const file = path.join(dir, 'replica.sqlite'); const db = historyDb(file);
  const ports = []; const entries = [];
  setActualCoreEntryObserver((entry) => entries.push(entry));
  t.after(() => {
    setCoreFaultInjector(null); setActualCoreEntryObserver(null);
    for (const port of ports) port.close();
    if (db.open) db.close(); fs.rmSync(dir, {recursive: true, force: true});
  });
  return {db, file, ports, entries, open(overrides, connection = db) {
    const port = openHistory(connection, overrides); ports.push(port); return port;
  }};
}
function loseRows(db) {
  db.transaction(() => {
    for (const table of Object.values(RAFT_RS_TABLE)) {
      db.prepare(`DELETE FROM ${table} WHERE group_id = ?`).run(HISTORY_ID.groupId);
    }
  })();
}
function makeLegacy(db) {
  const columns = db.prepare('PRAGMA table_info(_raft_rs_replica_lifecycle)').all();
  if (columns.some((column) => column.name === 'native_history_state')) {
    db.exec('ALTER TABLE _raft_rs_replica_lifecycle DROP COLUMN native_history_state');
  }
}
function assertLost(f, open = () => f.open()) {
  const before = f.entries.length;
  assert.throws(open, (error) => error.consensus?.reason === 'reseed-required',
    'established or unknown history is never permission for fresh genesis');
  assert.equal(f.entries.length, before, 'lost-history refusal precedes every native entry');
  assert.equal(lifecycle(f.db).state, 'retired', 'the existing reseed owner retains the refusal');
}

test('a rejected pre-native constructor retains a genuinely never-opened retry', (t) => {
  const f = fixture(t); let faults = 0;
  setCoreFaultInjector((_gid, op) => {
    if (op === 'create_node') {
      setCoreFaultInjector(null); faults++;
      throw Object.assign(new Error('opening refused before creation'), {kind: CORE_REFUSAL_KIND});
    }
  });
  assert.throws(() => f.open()); assert.equal(faults, 1);
  const first = lifecycle(f.db);
  assert.equal(first.native_history_state, 'never-opened');
  const port = f.open();
  assert.equal(port.readStatus().outcome, OUTCOME.CORE_OK);
  assert.equal(lifecycle(f.db).incarnation, first.incarnation);
  assert.equal(lifecycle(f.db).native_history_state, 'established');
});

for (const failAfterWrite of [false, true]) {
  test(`bootstrap and establishment roll back together when history write fails ${failAfterWrite ? 'after SQL execution' : 'before SQL execution'}`, async (t) => {
    const f = fixture(t); let failing = true; let observed = 0;
    const connection = new Proxy(f.db, {get(target, key) {
      if (key === 'prepare') return (sql) => {
        const statement = target.prepare(sql);
        if (!/UPDATE\s+_raft_rs_replica_lifecycle\s+SET native_history_state/u.test(sql)) return statement;
        return new Proxy(statement, {get(stmt, property) {
          if (property === 'run') return (...args) => {
            if (failing) {
              observed++;
              assert.equal(target.inTransaction, true, 'both writes share a real SQLite transaction');
              assert.equal(target.pragma('synchronous', {simple: true}), 2, 'establishment commit is FULL-synced');
              if (failAfterWrite) stmt.run(...args);
              throw new Error('injected establishment write failure');
            }
            return stmt.run(...args);
          };
          const value = Reflect.get(stmt, property, stmt);
          return typeof value === 'function' ? value.bind(stmt) : value;
        }});
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }});
    let unexpectedPort;
    try {
      assert.throws(() => { unexpectedPort = f.open(undefined, connection); },
        (error) => error.consensus?.outcome === OUTCOME.HOST_FAILURE,
        'failed atomic establishment must refuse construction');
    } finally { unexpectedPort?.close(); }
    assert.equal(observed, 1, 'the lifecycle write fault actually engaged');
    assert.equal(lifecycle(f.db).native_history_state, 'never-opened');
    assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${RAFT_RS_TABLE.APPLIED_STATE}`).get().n, 0,
      'a failed marker cannot leave an independently committed bootstrap');
    assert.equal(f.entries.filter((entry) => entry.operation === 'free').length, 1,
      'the failed unpublished native node is released exactly once');
    assert.equal(f.db.pragma('synchronous', {simple: true}), 1, 'the connection setting is restored');
    failing = false;
    const port = f.open(); await port.campaign();
    assert.equal((await port.propose('after-rollback')).outcome, OUTCOME.CORE_OK);
    assert.deepEqual(applicationRows(f.db), ['after-rollback']);
  });
}

for (const lose of [false, true]) {
  test(`legacy lifecycle with ${lose ? 'lost' : 'intact'} native record`, async (t) => {
    const f = fixture(t); const port = f.open(); await port.campaign(); await port.propose('legacy-committed');
    const before = lifecycle(f.db); port.close(); makeLegacy(f.db);
    if (lose) { loseRows(f.db); assertLost(f); }
    else {
      assert.equal(f.open().readStatus().outcome, OUTCOME.CORE_OK);
      assert.equal(lifecycle(f.db).native_history_state, 'established');
      assert.equal(lifecycle(f.db).incarnation, before.incarnation);
      assert.deepEqual(applicationRows(f.db), ['legacy-committed']);
    }
  });
}

test('established lifecycle with all native tables lost refuses before native entry', async (t) => {
  const f = fixture(t); const port = f.open(); await port.campaign(); await port.propose('before-table-loss'); port.close();
  for (const table of Object.values(RAFT_RS_TABLE)) f.db.exec(`DROP TABLE ${table}`);
  assertLost(f); assert.deepEqual(applicationRows(f.db), ['before-table-loss']);
});

test('a surviving host prior-existence fact cannot be overruled by NEVER_OPENED', (t) => {
  const f = fixture(t); assertLost(f, () => f.open({identityExisted: true}));
});

test('identity-record acknowledgement still gates participation after local establishment', async (t) => {
  const f = fixture(t); let acknowledge;
  const pending = new Promise((resolve) => { acknowledge = resolve; });
  const port = f.open({identityRecorded: pending});
  assert.equal(lifecycle(f.db).native_history_state, 'established');
  const before = f.entries.length;
  const refused = await port.campaign();
  assert.equal(refused.outcome, OUTCOME.CORE_REFUSED);
  assert.equal(f.entries.length, before, 'local durable establishment does not grant missing host permission');
  acknowledge(); await Promise.resolve(); await Promise.resolve();
  assert.equal((await port.campaign()).outcome, OUTCOME.CORE_OK);
});

test('unreadable exact lifecycle history is typed and cannot open native genesis', (t) => {
  const f = fixture(t); const port = f.open(); port.close(); const before = f.entries.length;
  const connection = new Proxy(f.db, {get(target, key) {
    if (key === 'prepare') return (sql) => {
      if (/SELECT native_history_state FROM/u.test(sql)) throw Object.assign(new Error('history IOERR'), {code: 'SQLITE_IOERR'});
      return target.prepare(sql);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const held = f.open(undefined, connection).readStatus();
  assert.equal(held.outcome, OUTCOME.HOST_FAILURE);
  assert.equal(f.entries.length, before);
});

test('an imported staging history can never act as a never-opened allocation', (t) => {
  const f = fixture(t);
  const request = {db: f.db, groupId: HISTORY_ID.groupId, peerId: '7', replicaIdentity: 'receiver'};
  const result = prepareReplicaLifecycleForSnapshot(request);
  assert.equal(result.outcome, OUTCOME.CORE_OK);
  assert.equal(lifecycle(f.db).native_history_state, 'established', 'snapshot staging establishes imported history before it can be published');
});

const CHILD = fileURLToPath(new URL('./opening-history-process-child.js', import.meta.url));
function processRun(file, marker) {
  const result = spawnSync(process.execPath, [CHILD, file, marker], {encoding: 'utf8', timeout: 20000});
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split('\n').find((row) => row.startsWith('OPENING_HISTORY '));
  assert.ok(line, 'separate process completed the production opening path');
  return JSON.parse(line.slice('OPENING_HISTORY '.length));
}
for (const lose of [false, true]) {
  test(`separate-process restart: ${lose ? 'native loss refuses' : 'intact data restores'}`, (t) => {
    const f = fixture(t); f.db.close();
    const first = processRun(f.file, 'first-process'); assert.equal(first.error, undefined);
    assert.equal(first.proposal.outcome, OUTCOME.CORE_OK); assert.deepEqual(first.rows, ['first-process']);
    if (lose) { const db = historyDb(f.file); loseRows(db); db.close(); }
    const second = processRun(f.file, 'second-process'); assert.notEqual(second.pid, first.pid);
    assert.notEqual(second.pid, process.pid);
    if (lose) {
      assert.equal(second.error?.consensus?.reason, 'reseed-required', 'cold-process loss must refuse fresh genesis');
      assert.equal(second.entries.length, 0); assert.deepEqual(second.rows, ['first-process']);
    } else {
      assert.equal(second.error, undefined); assert.deepEqual(second.rows, ['first-process', 'second-process']);
      assert.equal(second.lifecycle.incarnation, first.lifecycle.incarnation);
    }
    t.diagnostic(JSON.stringify({first, second}));
  });
}

for (const at of ['before-bootstrap', 'after-bootstrap']) {
  test(`process killed ${at}: persisted state determines the only legal reopen`, (t) => {
    const f = fixture(t); f.db.close();
    const result = spawnSync(process.execPath, [CHILD, f.file, 'not-proposed', at],
      {encoding: 'utf8', timeout: 20000});
    assert.equal(result.error, undefined); assert.equal(result.signal, 'SIGKILL');
    assert.match(result.stdout, new RegExp(`HISTORY_CRASH ${at}`), 'the intended crash boundary engaged');
    const db = historyDb(f.file);
    const row = lifecycle(db);
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${RAFT_RS_TABLE.APPLIED_STATE}`).get().n;
    if (at === 'before-bootstrap') {
      assert.equal(row.native_history_state, 'never-opened'); assert.equal(n, 0);
      db.close();
      const retry = processRun(f.file, 'after-never-opened-crash');
      assert.equal(retry.error, undefined);
      assert.deepEqual(retry.rows, ['after-never-opened-crash']);
    } else {
      assert.equal(row.native_history_state, 'established'); assert.equal(n, 1);
      loseRows(db); db.close();
      const refusal = processRun(f.file, 'must-not-propose-after-loss');
      assert.equal(refusal.error?.consensus?.reason, 'reseed-required');
      assert.equal(refusal.entries.length, 0);
    }
  });
}

test('an incarnation change during opening cannot inherit the old grant', (t) => {
  const f = fixture(t); let changed = 0;
  setCoreFaultInjector((_gid, operation) => {
    if (operation === 'create_node') {
      setCoreFaultInjector(null); changed++;
      f.db.prepare("UPDATE _raft_rs_replica_lifecycle SET incarnation = 'different-incarnation'").run();
    }
  });
  assert.throws(() => f.open(), (error) => error.consensus?.outcome === OUTCOME.HOST_FAILURE);
  assert.equal(changed, 1);
  assert.equal(lifecycle(f.db).incarnation, 'different-incarnation');
  assert.equal(lifecycle(f.db).native_history_state, 'never-opened');
  assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${RAFT_RS_TABLE.APPLIED_STATE}`).get().n, 0);
});

test('invalid persisted history is unavailable, not an inferred fresh allocation', (t) => {
  const f = fixture(t); const port = f.open(); port.close();
  if (!f.db.prepare('PRAGMA table_info(_raft_rs_replica_lifecycle)').all().some((c) => c.name === 'native_history_state')) {
    f.db.exec('ALTER TABLE _raft_rs_replica_lifecycle ADD COLUMN native_history_state TEXT');
  }
  f.db.prepare("UPDATE _raft_rs_replica_lifecycle SET native_history_state = 'corrupt-state'").run();
  const before = f.entries.length;
  const status = f.open().readStatus();
  assert.equal(status.outcome, OUTCOME.HOST_FAILURE);
  assert.equal(f.entries.length, before);
  assert.equal(lifecycle(f.db).native_history_state, 'corrupt-state');
});
