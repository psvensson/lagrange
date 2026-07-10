import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';

import {
  RAFT_COMMITTED_ENTRY_CONFLICT_CODE,
} from '../../src/raft/committed-entry-guard.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

const TERM = 4;

function command(value) {
  return {type: 'sqlite-write-path', value};
}

function append(adapter, entries) {
  return new Promise((resolve, reject) => {
    adapter.append(entries, (error) => error ? reject(error) : resolve());
  });
}

async function seed(adapter, count = 5) {
  for (let index = 1; index <= count; index += 1) {
    adapter.saveCommand(command(index), TERM, index);
  }
  adapter.commit(3);
}

test('SQLite committed identity is guarded on put and bulk append', async (t) => {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-node'});
  try {
    await seed(adapter);
    t.throws(
      () => adapter.put({index: 2, term: TERM + 1, command: command(2)}),
      {code: RAFT_COMMITTED_ENTRY_CONFLICT_CODE},
      'put rejects committed replacement',
    );
    await t.rejects(
      append(adapter, [
        {index: 4, term: TERM + 1, command: command('safe-uncommitted')},
        {index: 2, term: TERM, command: command('conflict')},
      ]),
      {code: RAFT_COMMITTED_ENTRY_CONFLICT_CODE},
      'bulk append rejects the whole transaction on committed conflict',
    );
    t.same(adapter.get(2).command, command(2), 'committed row is unchanged');
    t.same(adapter.get(4).command, command(4),
      'earlier bulk item rolls back atomically');
  } finally {
    db.close();
  }
});

test('SQLite inclusive truncation APIs clamp above committed boundary', async (t) => {
  for (const method of ['removeFrom', 'truncateFrom']) {
    const db = new Database(':memory:');
    const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-node'});
    try {
      await seed(adapter);
      if (method === 'removeFrom') {
        adapter.removeFrom(2);
      } else {
        await new Promise((resolve, reject) => {
          adapter.truncateFrom(2, (error) => error ? reject(error) : resolve());
        });
      }
      t.ok(adapter.get(3), `${method} preserves committed boundary`);
      t.notOk(adapter.get(4), `${method} removes uncommitted suffix`);
      t.equal(adapter.committedIndex, 3, `${method} keeps commit monotonic`);
    } finally {
      db.close();
    }
  }
});

test('SQLite committed identity remains guarded after reopen', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-immutability-'));
  const dbPath = path.join(root, 'raft.db');
  let db = new Database(dbPath);
  let adapter = new SQLiteLogAdapter(db, {address: 'sqlite-node'});
  await seed(adapter, 3);
  db.close();

  db = new Database(dbPath);
  adapter = new SQLiteLogAdapter(db, {address: 'sqlite-node'});
  try {
    t.equal(adapter.committedIndex, 3, 'committed watermark survives reopen');
    t.throws(
      () => adapter.saveCommand(command('reopen-conflict'), TERM, 2),
      {code: RAFT_COMMITTED_ENTRY_CONFLICT_CODE},
      'reopened adapter rejects committed replacement',
    );
    t.same(adapter.get(2).command, command(2), 'durable committed row survives');
  } finally {
    db.close();
    fs.rmSync(root, {recursive: true, force: true});
  }
});
