/**
 * Raft-safety invariant (CL-040/041/042 class): committed entries are permanent
 * and MUST NEVER be truncated. Base liferaft's conflict truncation calls
 * removeEntriesAfter UNGUARDED; a truncation whose floor falls below
 * committedIndex therefore deleted committed entries and produced the
 * replica_operations-p1 log HOLE observed live (durable committedIndex advanced
 * to 228 on a quorum while entries 192-228 were deleted), which froze the
 * durable watermark at the first gap (commit() short-circuits on the missing
 * row) and wedged the ledger leader forever.
 *
 * This DT reproduces the exact live genesis shape (committed 1-228, then an
 * unguarded removeEntriesAfter(191)) and asserts the committed prefix survives.
 * Red-on-revert: without the guard in removeEntriesAfter, entries 192-228 are
 * deleted -> getLastInfo().index regresses to 191 while getCommittedIndex()
 * stays 228 -> the poisoned, non-contiguous log the freeze is built on.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

function createAdapter() {
  const db = new Database(':memory:');
  return new SQLiteLogAdapter(db, {address: 'node-1'});
}

async function seed(adapter, fromIndex, toIndex, term = 2) {
  for (let index = fromIndex; index <= toIndex; index += 1) {
    await adapter.saveCommand({type: 'cmd', index}, term, index);
  }
}

test('removeEntriesAfter committed-prefix truncation guard', async (t) => {
  await t.test(
    'refuses to delete committed entries (the live genesis shape)',
    async (t) => {
      const adapter = createAdapter();
      try {
        await seed(adapter, 1, 228);
        adapter.setCommittedIndex(228);
        t.equal(adapter.getCommittedIndex(), 228, 'committed watermark at 228');
        t.equal(adapter.getLastInfo().index, 228, 'log head at 228 before');

        // The exact live call: base liferaft asked to truncate after 191,
        // 37 entries below the committed watermark.
        adapter.removeEntriesAfter(191);

        t.equal(
          adapter.getLastInfo().index,
          228,
          'committed entries 192-228 are PRESERVED (no hole)',
        );
        t.ok(adapter.get(200), 'a committed entry inside the range survives');
        t.equal(
          adapter.getCommittedIndex(),
          228,
          'watermark and physical head stay consistent',
        );
        t.equal(
          adapter.committedTruncationBlockedCount,
          1,
          'the committed-prefix truncation attempt is recorded',
        );
        t.equal(
          adapter.lastCommittedTruncationBlocked.requestedIndex,
          191,
          'the blocked request is surfaced for pinning the genesis',
        );
      } finally {
        adapter.end();
      }
    },
  );

  await t.test(
    'still truncates the UNCOMMITTED conflicting suffix (no-op on the safe path)',
    async (t) => {
      const adapter = createAdapter();
      try {
        await seed(adapter, 1, 10);
        adapter.setCommittedIndex(5);
        // A legitimate conflict truncation is always above the committed
        // prefix: remove the uncommitted suffix after 7.
        adapter.removeEntriesAfter(7);
        t.equal(adapter.getLastInfo().index, 7, 'uncommitted suffix removed');
        t.equal(adapter.getCommittedIndex(), 5, 'committed prefix intact');
        t.equal(
          adapter.committedTruncationBlockedCount,
          0,
          'no block recorded on the safe path (inert)',
        );
        t.notOk(adapter.get(8), 'entry 8 (uncommitted) is gone');
        t.ok(adapter.get(5), 'entry 5 (committed) remains');
      } finally {
        adapter.end();
      }
    },
  );
});
