import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

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

test('independent adapter facades refresh durable commit state before mutation',
  async (t) => {
    const db = new Database(':memory:');
    const staleAdapter = new SQLiteLogAdapter(db, {address: 'stale-facade-node'});
    const externalAdapter = new SQLiteLogAdapter(db, {address: 'external-owner-node'});
    try {
      t.equal(staleAdapter.getCommittedIndex(), 0,
        'stale facade initially observes empty state');
      for (let index = 1; index <= 5; index += 1) {
        externalAdapter.saveCommand({type: 'external-commit', value: index}, 7, index);
      }
      externalAdapter.commit(5);
      const before = externalAdapter.get(1);

      const appended = staleAdapter.saveCommand({type: 'fresh-durable-index'}, 7);
      t.equal(appended.index, 6, 'stale facade derives the next durable index');
      t.same(externalAdapter.get(1).command, before.command,
        'stale facade cannot overwrite committed identity');

      staleAdapter.removeFrom(1);
      t.equal(externalAdapter.committedIndex, 5,
        'stale facade cannot regress durable commit');
      t.ok(externalAdapter.get(5), 'stale facade cannot truncate committed boundary');
      t.equal(externalAdapter.get(6), null,
        'stale facade can truncate uncommitted tail');
    } finally {
      db.close();
    }
  });
