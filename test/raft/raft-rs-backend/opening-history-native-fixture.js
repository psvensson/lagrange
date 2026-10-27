// Real operation port and SQLite; no substitute history or consensus owner.
import Database from 'better-sqlite3';
import {createRaftRsOperationPort} from '../../../src/raft/raft-rs-operation-port.js';
import {genesisStamp} from '../../../src/raft/raft-committed-membership-stamp.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';

export const HISTORY_ID = Object.freeze({groupId: 'native-history', peerId: 'history-r1'});
function historyRequest(db, overrides = {}) {
  return {groupId: HISTORY_ID.groupId, peerId: HISTORY_ID.peerId,
    peerAddress: 'history://r1', bootstrapPeerIds: [HISTORY_ID.peerId],
    bootstrapMembership: genesisStamp([HISTORY_ID.peerId]), durableStorage: db,
    timing: {heartbeatMs: 50, electionMinMs: 150, electionMaxMs: 300, tickIntervalMs: 10},
    substrate: {timeSource: new VirtualTimeSource({startMs: 1000})}, deferElection: true,
    sendToPeer: () => undefined, resolvePeerAddress: () => 'history://r1',
    applyCommittedEntry: ({command, index}) => {
      db.prepare('INSERT INTO history_witness VALUES (?, ?)').run(command, index);
    }, snapshotCatchupNeeded: () => undefined, ...overrides};
}
export function historyDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode=WAL'); db.pragma('synchronous=NORMAL');
  db.exec('CREATE TABLE IF NOT EXISTS history_witness (marker TEXT PRIMARY KEY, log_index INTEGER)');
  return db;
}
export function openHistory(db, overrides) {
  return createRaftRsOperationPort(historyRequest(db, overrides));
}
export function lifecycle(db) {
  return db.prepare('SELECT * FROM _raft_rs_replica_lifecycle').get();
}
export function applicationRows(db) {
  return db.prepare('SELECT marker FROM history_witness ORDER BY log_index').pluck().all();
}
