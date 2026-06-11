/**
 * CL-018 guards: committedIndex bookkeeping in the sqlite log adapter.
 *
 * Followers never persisted the committed watermark (only the leader-side
 * commandAck did), so every heartbeat saw committedIndex <
 * packet.last.committedIndex forever and re-scanned + JSON-parsed the
 * whole raft log — the top self-time frame (readEntryRow) in the seed
 * freeze windows blocking pre-restart quiescence. Also: commandAck used
 * to REGRESS the persisted watermark on catch-up acks at old indexes.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

function createAdapter() {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'node-1'});
  return adapter;
}

async function seed(adapter, fromIndex, toIndex) {
  for (let index = fromIndex; index <= toIndex; index += 1) {
    await adapter.saveCommand({type: 'cmd', index}, 2, index);
  }
}

test('CL-018: committedIndex watermark bookkeeping', async (t) => {
  await t.test('follower commit() advances the persisted watermark',
    async (t) => {
      const adapter = createAdapter();
      try {
        await seed(adapter, 1, 10);
        t.equal(adapter.getCommittedIndex(), 0, 'starts at zero');
        adapter.commit(1);
        adapter.commit(2);
        adapter.commit(3);
        t.equal(
          adapter.getCommittedIndex(),
          3,
          'watermark follows follower commits',
        );
      } finally {
        adapter.end();
      }
    });

  await t.test('setCommittedIndex never regresses (old catch-up acks)',
    async (t) => {
      const adapter = createAdapter();
      try {
        await seed(adapter, 1, 10);
        adapter.setCommittedIndex(8);
        t.equal(adapter.getCommittedIndex(), 8, 'advances to 8');
        adapter.setCommittedIndex(3);
        t.equal(
          adapter.getCommittedIndex(),
          8,
          'old-index ack cannot regress the watermark',
        );
        adapter.setCommittedIndex(9);
        t.equal(adapter.getCommittedIndex(), 9, 'still advances forward');
      } finally {
        adapter.end();
      }
    });

  await t.test(
    'getUncommittedEntriesUpToIndex scans only the uncommitted suffix',
    async (t) => {
      const adapter = createAdapter();
      try {
        await seed(adapter, 1, 100);
        for (let index = 1; index <= 90; index += 1) {
          adapter.commit(index);
        }
        const uncommitted = adapter.getUncommittedEntriesUpToIndex(100, 2);
        t.equal(uncommitted.length, 10, 'only the suffix is returned');
        t.equal(uncommitted[0].index, 91, 'suffix starts after watermark');
        // The bounded query must not parse committed rows: spy on
        // readEntryRow via a count.
        let parsed = 0;
        const original = adapter.readEntryRow.bind(adapter);
        adapter.readEntryRow = (...args) => {
          parsed += 1;
          return original(...args);
        };
        adapter.getUncommittedEntriesUpToIndex(100, 2);
        t.equal(parsed, 10, 'committed prefix is never parsed');
      } finally {
        adapter.end();
      }
    },
  );

  await t.test(
    'commandAck must NOT advance the watermark before commit ' +
      '(quorum-check fatal-skip regression)',
    async (t) => {
      const adapter = createAdapter();
      try {
        await seed(adapter, 1, 3);
        // Leader receives the quorum-completing ack for entry 3...
        await adapter.commandAck(3, 'node-2');
        t.equal(
          adapter.getCommittedIndex(),
          0,
          'ack alone does not move the watermark',
        );
        // ...and the very next quorum check must still SEE entry 3 as
        // uncommitted so commitEntries can apply it.
        const uncommitted = adapter.getUncommittedEntriesUpToIndex(3, 2);
        t.ok(
          uncommitted.some((entry) => entry.index === 3),
          'acked-but-uncommitted entry remains visible to the commit flow',
        );
        adapter.commit(3);
        t.equal(adapter.getCommittedIndex(), 3, 'commit moves the watermark');
      } finally {
        adapter.end();
      }
    },
  );

  await t.test('watermark cache survives reopen from persisted state',
    async (t) => {
      const db = new Database(':memory:');
      const adapter = new SQLiteLogAdapter(db, {address: 'node-1'});
      try {
        await seed(adapter, 1, 5);
        adapter.commit(1);
        adapter.commit(2);
        // A second adapter over the same db must read the persisted value
        // (fresh cache).
        const second = new SQLiteLogAdapter(db, {address: 'node-1'});
        t.equal(
          second.getCommittedIndex(),
          2,
          'persisted watermark visible to a fresh adapter',
        );
      } finally {
        adapter.end();
      }
    });
});
