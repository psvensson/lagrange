// Whether a replica database file holds a durable rs-raft record for a
// group, asked from outside the replica: the file is opened read-only, no
// table is created and nothing is written (the store's own predicate on a
// read view). A file that does not exist holds no record; a file that cannot
// be read is the caller's failure, never "no record".

import fs from 'node:fs';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from './raft-rs-durable-store.js';

/**
 * @param {string} dbPath - The replica's database file.
 * @param {string} groupId - The group.
 * @return {boolean} Whether a durable record exists.
 */
function durableRecordPresentAt(dbPath, groupId) {
  if (!fs.existsSync(dbPath)) {
    return false;
  }
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return RaftRsDurableStore.hasDurableRecordIn(db, groupId);
  } finally {
    db.close();
  }
}

export {durableRecordPresentAt};
