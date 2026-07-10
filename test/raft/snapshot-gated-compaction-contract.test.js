import Database from 'better-sqlite3';

import {RAFT_COMPACTION_OUTCOME} from '../../src/raft/compaction-policy.js';
import {PartitionRaftStorage} from
  '../../src/partition/partition-raft-storage.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {test} from '../../src/test-helpers/tap.js';

const ENTRY_COUNT = 1005;
const TERM = 11;
const UNSUPPORTED_COMPACTION = Object.freeze({
  outcome: RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROTOCOL_UNAVAILABLE,
  changed: false,
});
const INVALID_TRUNCATION_INDEXES = Object.freeze([
  '1',
  null,
  undefined,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  -1,
  1.5,
]);

function memoryFixture() {
  const adapter = new InMemoryLogAdapter({address: 'memory-compaction', term: TERM});
  return {adapter, close: () => adapter.end()};
}

function sqliteFixture() {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-compaction', term: TERM});
  return {adapter, close: () => db.close()};
}

async function seedCommittedPrefix(adapter) {
  for (let index = 1; index <= ENTRY_COUNT; index += 1) {
    await adapter.saveCommand({type: 'snapshot-gate', index}, TERM, index);
  }
  await adapter.commit(ENTRY_COUNT);
}

function registerCompactionContract(name, createFixture) {
  test(`${name} retains committed prefix and rejects compaction`, async (t) => {
    const fixture = createFixture();
    const {adapter} = fixture;
    try {
      await seedCommittedPrefix(adapter);
      const firstBefore = await adapter.get(1);
      const countBefore = (await adapter.getEntriesAfter(0)).length;

      t.ok(firstBefore, 'oldest committed entry survives commit');
      t.equal(countBefore, ENTRY_COUNT, 'full committed prefix remains readable');
      t.equal(adapter.committedIndex, ENTRY_COUNT, 'commit watermark reaches the head');

      const outcome = await adapter.compactCommittedEntries();
      t.same(outcome, UNSUPPORTED_COMPACTION,
        'explicit compaction returns the shared typed unsupported result');
      t.same((await adapter.get(1))?.command, firstBefore.command,
        'explicit compaction preserves oldest committed identity');
      t.equal((await adapter.getEntriesAfter(0)).length, ENTRY_COUNT,
        'explicit compaction removes no entries');

      let compactionCalls = 0;
      const originalCompaction = adapter.compactCommittedEntries.bind(adapter);
      adapter.compactCommittedEntries = () => {
        compactionCalls += 1;
        return originalCompaction();
      };
      await adapter.removeEntriesAfter(1);
      t.equal(compactionCalls, 0, 'conflict-tail truncation cannot invoke compaction');
      t.ok(await adapter.get(1), 'conflict truncation preserves oldest committed entry');
      t.equal(adapter.committedIndex, ENTRY_COUNT, 'truncation cannot regress commit');
    } finally {
      fixture.close();
    }
  });
}

function callbackCall(target, method, ...args) {
  return new Promise((resolve, reject) => {
    target[method](...args, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

test('SQLite commit-index callback aliases preserve the monotonic owner', async (t) => {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'commit-state-owner'});
  try {
    for (let index = 1; index <= 3; index += 1) {
      adapter.saveCommand({type: 'commit-state', index}, TERM, index);
    }
    adapter.commit(3);

    await callbackCall(adapter, 'setState', 'committedIndex', '1');
    await callbackCall(adapter, 'setState', 'commitIndex', '1');
    await callbackCall(adapter, 'setCommitIndex', 1);

    t.equal(adapter.refreshCommittedIndexCacheFromStore(), 3,
      'generic and legacy callback setters cannot regress durable commit');
    t.equal(await callbackCall(adapter, 'getCommitIndex'), 3,
      'legacy callback getter projects the canonical committed index');
  } finally {
    db.close();
  }
});

function registerInvalidTruncationContract(name, createFixture) {
  test(`${name} rejects non-index truncation inputs without coercion`, async (t) => {
    const fixture = createFixture();
    const {adapter} = fixture;
    try {
      for (let index = 1; index <= 4; index += 1) {
        await adapter.saveCommand({type: 'invalid-truncation', index}, TERM, index);
      }
      await adapter.commit(3);
      for (const invalidIndex of INVALID_TRUNCATION_INDEXES) {
        await adapter.removeEntriesAfter(invalidIndex);
        t.equal((await adapter.getEntriesAfter(0)).length, 4,
          `removeEntriesAfter preserves log for ${String(invalidIndex)}`);
        t.equal(adapter.committedIndex, 3,
          `removeEntriesAfter preserves commit for ${String(invalidIndex)}`);
      }
    } finally {
      fixture.close();
    }
  });
}

test('SQLite inclusive and partition truncation reject non-index inputs', async (t) => {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'inclusive-truncation'});
  const storage = new PartitionRaftStorage(db, 'invalid-truncation', adapter);
  try {
    for (let index = 1; index <= 4; index += 1) {
      adapter.saveCommand({type: 'inclusive-truncation', index}, TERM, index);
    }
    adapter.commit(3);
    for (const invalidIndex of INVALID_TRUNCATION_INDEXES) {
      adapter.removeFrom(invalidIndex);
      await callbackCall(adapter, 'truncateFrom', invalidIndex);
      storage.truncateFrom(invalidIndex);
      t.equal(adapter.getEntriesAfter(0).length, 4,
        `all inclusive APIs preserve log for ${String(invalidIndex)}`);
      t.equal(adapter.committedIndex, 3,
        `all inclusive APIs preserve commit for ${String(invalidIndex)}`);
    }
  } finally {
    db.close();
  }
});

registerCompactionContract('in-memory adapter', memoryFixture);
registerCompactionContract('SQLite adapter', sqliteFixture);
registerInvalidTruncationContract('in-memory adapter', memoryFixture);
registerInvalidTruncationContract('SQLite adapter', sqliteFixture);
