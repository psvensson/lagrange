// Test lifetime adapter only: all allocation and refusal decisions are production's.
import {openRaftRsReplicaDatabase} from '../../src/raft/raft-rs-operation-port.js';

export function openReplicaDatabaseFixture(request) {
  let owned = null;
  try {
    return openRaftRsReplicaDatabase({...request, takeDatabaseCustody: (db) => {
      owned = db;
    }});
  } catch (error) {
    if (owned?.open) owned.close();
    throw error;
  }
}
