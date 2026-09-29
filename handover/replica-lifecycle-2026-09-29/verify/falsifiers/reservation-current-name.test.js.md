# Verifier scratch evidence: `reservation-current-name.test.js`

Original file `falsifiers/reservation-current-name.test.js`, preserved verbatim below (stored as Markdown so the change cone treats it as inert evidence). To re-run, copy the fenced block to a scratch file with the original name.

````js
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {raftRsMembershipAdministration, registerPeerIdentityReservationOwner} from '../../src/raft/raft-rs-membership-administration.js';
test('delayed G1 reservation (by logical name) lands in G2 identity registry', () => {
  const g1 = [], g2 = [];
  const un1 = registerPeerIdentityReservationOwner({groupId: 'p', localReplicaIdentity: 'r1', reserve: (j) => { g1.push(j); return '1'; }});
  un1();
  const un2 = registerPeerIdentityReservationOwner({groupId: 'p', localReplicaIdentity: 'r1', reserve: (j) => { g2.push(j); return '2'; }});
  // G1 PartitionService (captured, retired) runs a late admission: reservePartitionRaftPeerIdentity(service=G1,...)
  const out = raftRsMembershipAdministration.reservePeerIdentity({groupId: 'p', localReplicaIdentity: 'r1', joiningReplicaIdentity: 'joiner-from-g1-era'});
  un2();
  assert.deepEqual(g1, []);
  assert.deepEqual(g2, [], 'G2 registry must not receive G1-era reservation');
});
````
