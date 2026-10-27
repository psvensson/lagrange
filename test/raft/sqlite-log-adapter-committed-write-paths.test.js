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

async function seed(adapter, count = 5) {
  for (let index = 1; index <= count; index += 1) {
    adapter.saveCommand(command(index), TERM, index);
  }
  adapter.commit(3);
}

test('SQLite committed identity is guarded on canonical writes', async (t) => {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-node'});
  try {
    await seed(adapter);
    t.throws(
      () => adapter.put({index: 2, term: TERM + 1, command: command(2)}),
      {code: RAFT_COMMITTED_ENTRY_CONFLICT_CODE},
      'put rejects committed replacement',
    );
    t.throws(
      () => adapter.saveCommand(command('conflict'), TERM + 1, 2),
      {code: RAFT_COMMITTED_ENTRY_CONFLICT_CODE},
      'saveCommand rejects committed replacement',
    );
    t.same(adapter.get(2).command, command(2), 'committed row is unchanged');
  } finally {
    db.close();
  }
});

test('SQLite canonical truncation clamps above committed boundary', async (t) => {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-node'});
  try {
    await seed(adapter);
    adapter.removeFrom(2);
    t.ok(adapter.get(3), 'removeFrom preserves committed boundary');
    t.notOk(adapter.get(4), 'removeFrom removes uncommitted suffix');
    t.equal(adapter.committedIndex, 3, 'removeFrom keeps commit monotonic');
  } finally {
    db.close();
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
