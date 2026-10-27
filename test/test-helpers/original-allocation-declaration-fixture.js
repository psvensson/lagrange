// The one owner-shaped complete original-allocation declaration for tests
// that do not run the preparation: the declaration owner's draft completed
// with stamps the lifecycle owner itself minted, exactly as the preparation
// forms it. A test never chooses an incarnation by hand.
import Database from 'better-sqlite3';
import {createSeedOriginalAllocation, completeSeedOriginalAllocation} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {prepareReplicaLifecycleForOriginalAllocation} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';

/**
 * @param {Object} identity {dataDir, nodeId, buildDigest}.
 * @param {number} now The declared allocation time.
 * @return {Object} Deep-frozen complete declaration.
 */
function ownerStampedSeedDeclaration(identity, now) {
  const draft = createSeedOriginalAllocation({...identity, now});
  const db = new Database(':memory:');
  try {
    const incarnations = new Map(db.transaction(() => draft.members.map((member) => {
      const born = prepareReplicaLifecycleForOriginalAllocation({db, groupId: member.groupId,
        peerId: member.peerId, replicaIdentity: member.replicaId});
      return [member.replicaId, born.detail.incarnation];
    }))());
    return completeSeedOriginalAllocation(draft, incarnations, identity);
  } finally {
    db.close();
  }
}

export {ownerStampedSeedDeclaration};
