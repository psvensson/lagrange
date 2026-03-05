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
