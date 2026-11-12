// Native hydration snapshot acquisitions in both supported storage envelopes.
// The source service fields are controlled; the image owner and both DBs are real.
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {SQLiteConnection, assertSQLiteConnection} from
  '../../src/storage/sqlite-prepared-statement-owner.js';
import {PartitionHydrationImages, PARTITION_HYDRATION_IMAGE_PAGE_STATE as PAGE_STATE} from
  '../../src/partition/partition-hydration-image-pages.js';
import {ensureCdcObligationLedger, readCdcLedgerIncarnation} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

for (const storage of ['memory', 'file']) {
  test(`hydration owns its ${storage} snapshot connection through final page`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'statement-hydration-'));
    const dbPath = storage === 'memory' ? ':memory:' : join(directory, 'source.db');
    const db = new SQLiteConnection(dbPath);
    const partition = {db, dbPath, partitionId: 'hydration-owner', isLeader: true,
      leadershipTenure: 'tenure', timeSource: new VirtualTimeSource({startMs: 1000})};
    const images = new PartitionHydrationImages(partition);
    t.after(() => {
      images.closeAll();
      db.close();
      rmSync(directory, {recursive: true, force: true});
    });
    db.pragma('journal_mode = WAL');
    new RaftRsDurableStore(db);
    ensureCdcObligationLedger(db, {index: 1, term: 1, entryId: 'hydration-entry'});
    db.exec('CREATE TABLE facts (id INTEGER PRIMARY KEY); INSERT INTO facts VALUES (1), (2)');
    const first = images.page('SELECT id FROM facts ORDER BY id', {imageId: null, page: 0},
      {maxRows: 1});
    assert.equal(first.state, PAGE_STATE.PAGE);
    assert.deepEqual(first.page.rows, [{id: 1}]);
    assert.equal(first.image.incarnation, readCdcLedgerIncarnation(db));
    const snapshot = images.images.get(first.image.imageId).db;
    assertSQLiteConnection(snapshot);
    assert.notEqual(snapshot, db);
    db.exec('INSERT INTO facts VALUES (3)');
    const last = images.page('SELECT id FROM facts ORDER BY id',
      {imageId: first.image.imageId, page: 1}, {maxRows: 1});
    assert.deepEqual(last.page.rows, [{id: 2}], 'the image retains its original native snapshot');
    assert.equal(last.page.last, true);
    assert.equal(snapshot.open, false);
    assert.equal(images.diagnostics().open, 0);
    assert.equal(db.open, true, 'the source retains its independent connection');
  });
}
