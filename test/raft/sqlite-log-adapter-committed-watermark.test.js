/**
 * CL-018 guard: SQLiteLogAdapter committedIndex is durable and monotonic.
 *
 * commit() advances the durable watermark, stale lower observations cannot
 * regress it, and a second adapter over the same database sees the committed
 * state. Consensus acknowledgement/quorum bookkeeping belongs to raft-rs and
 * is deliberately absent from this storage adapter.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

function createAdapter() {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'node-1'});
  return {adapter, db};
}

async function seed(adapter, fromIndex, toIndex) {
  for (let index = fromIndex; index <= toIndex; index += 1) {
    await adapter.saveCommand({type: 'cmd', index}, 2, index);
  }
}

test('CL-018: committedIndex watermark bookkeeping', async (t) => {
  await t.test('follower commit() advances the persisted watermark',
    async (t) => {
      const {adapter, db} = createAdapter();
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
        db.close();
      }
    });

  await t.test('setCommittedIndex never regresses stale lower observations',
    async (t) => {
      const {adapter, db} = createAdapter();
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
        db.close();
      }
    });

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
        db.close();
      }
    });
});
