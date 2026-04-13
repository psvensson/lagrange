// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

function createAdapter(node = {term: 7}) {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, node);
  return {adapter, db};
}

test('SQLiteLogAdapter.getEntryBefore handles null entry safely', async (t) => {
  const {adapter, db} = createAdapter({term: 11});

  const entry = adapter.getEntryBefore(null);

  t.same(entry, {
    index: 0,
    term: 11,
  });

  db.close();
});

test('SQLiteLogAdapter.getEntryInfoBefore handles null entry safely', async (t) => {
  const {adapter, db} = createAdapter({term: 13});

  const info = adapter.getEntryInfoBefore(null);

  t.same(info, {
    index: 0,
    term: 13,
    committedIndex: 0,
  });

  db.close();
});

test('SQLiteLogAdapter.put/get preserves canonical full entry shape', async (t) => {
  const {adapter, db} = createAdapter({term: 7, address: 'node-1'});
  const entry = {
    index: 4,
    term: 3,
    committed: false,
    responses: [
      {address: 'node-1', ack: true},
      {address: 'node-2', ack: true},
    ],
    command: {type: 'TEST', value: 42},
  };

  adapter.put(entry);
  const retrieved = adapter.get(entry.index);

  t.same(
    retrieved,
    entry,
    'put/get should round-trip one canonical raft entry shape',
  );

  db.close();
});

test('SQLiteLogAdapter.saveCommand/get preserves canonical full entry shape', async (t) => {
  const {adapter, db} = createAdapter({term: 5, address: 'node-1'});

  const saved = adapter.saveCommand({type: 'TEST', value: 7}, 5, 2);
  const retrieved = adapter.get(2);

  t.same(
    retrieved,
    saved,
    'saveCommand/get should return the same canonical raft entry shape',
  );

  db.close();
});

test('SQLiteLogAdapter.commandAck keeps canonical full entry shape', async (t) => {
  const {adapter, db} = createAdapter({term: 5, address: 'node-1'});

  adapter.saveCommand({type: 'TEST', value: 8}, 5, 3);
  const acked = adapter.commandAck(3, 'node-2');
  const retrieved = adapter.get(3);

  t.same(
    retrieved,
    acked,
    'commandAck/get should preserve the canonical raft entry shape',
  );

  db.close();
});
