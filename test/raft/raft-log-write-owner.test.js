import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

import {PartitionRaftStorage} from
  '../../src/partition/partition-raft-storage.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {test} from '../../src/test-helpers/tap.js';

const SOURCE_ROOT = path.resolve('src');
const CANONICAL_WRITE_OWNER = path.resolve(
  'src',
  'raft',
  'sqlite-log-adapter.js',
);
const RAFT_LOG_MUTATION_PATTERN =
  /\b(?:INSERT(?:\s+OR\s+REPLACE)?\s+INTO|UPDATE|DELETE\s+FROM)\s+_raft_log\b/i;

function collectJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

test('SQLiteLogAdapter is the only _raft_log SQL mutation owner', async (t) => {
  const owners = collectJavaScriptFiles(SOURCE_ROOT)
    .filter((filePath) => RAFT_LOG_MUTATION_PATTERN.test(
      fs.readFileSync(filePath, 'utf8').replaceAll(/\s+/g, ' '),
    ));
  t.same(owners, [CANONICAL_WRITE_OWNER],
    'no partition or service facade can introduce a second SQL writer');
});

test('PartitionRaftStorage delegates append and truncate to the shared owner',
  async (t) => {
    const db = new Database(':memory:');
    const adapter = new SQLiteLogAdapter(db, {address: 'owner-node'});
    const storage = new PartitionRaftStorage(db, 'owner-partition', adapter);
    try {
      for (let index = 1; index <= 5; index += 1) {
        adapter.saveCommand({type: 'committed', value: index}, 7, index);
      }
      adapter.commit(5);
      const before = adapter.get(1);

      const appended = storage.appendEntry({type: 'delegated-write'});
      t.equal(storage.logAdapter, adapter, 'partition facade shares the canonical owner');
      t.equal(appended.index, 6, 'delegated append derives index from durable owner state');
      t.equal(adapter.get(1).term, before.term, 'committed term is preserved');
      t.same(adapter.get(1).command, before.command, 'committed command is preserved');

      storage.truncateFrom(1);
      t.equal(adapter.committedIndex, 5, 'delegated truncation keeps commit monotonic');
      t.ok(adapter.get(5), 'delegated truncation preserves committed boundary');
      t.equal(adapter.get(6), null, 'delegated truncation removes only uncommitted tail');
    } finally {
      db.close();
    }
  });

test('independent adapter facades refresh durable commit state before mutation',
  async (t) => {
    const db = new Database(':memory:');
    const storage = new PartitionRaftStorage(db, 'stale-facade-partition');
    const adapter = new SQLiteLogAdapter(db, {address: 'external-owner-node'});
    try {
      t.equal(storage.commitIndex, 0, 'partition facade initially observes empty state');
      for (let index = 1; index <= 5; index += 1) {
        adapter.saveCommand({type: 'external-commit', value: index}, 7, index);
      }
      adapter.commit(5);
      const before = adapter.get(1);

      const appended = storage.appendEntry({type: 'fresh-durable-index'});
      t.equal(appended.index, 6, 'stale facade derives the next durable index');
      t.same(adapter.get(1).command, before.command,
        'stale facade cannot overwrite committed identity');

      storage.truncateFrom(1);
      t.equal(adapter.committedIndex, 5, 'stale facade cannot regress durable commit');
      t.ok(adapter.get(5), 'stale facade cannot truncate committed boundary');
      t.equal(adapter.get(6), null, 'stale facade can truncate uncommitted tail');
    } finally {
      db.close();
    }
  });
