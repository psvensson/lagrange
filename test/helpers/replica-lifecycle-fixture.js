// Lifecycle unit fixtures use the explicit original-allocation writer. They
// never ask ordinary runtime construction to invent an unrecorded generation.
import assert from 'node:assert/strict';
import {prepareReplicaLifecycleForOriginalAllocation} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';

export function allocateLifecycleFixture(request) {
  const result = request.db.transaction(() =>
    prepareReplicaLifecycleForOriginalAllocation(request))();
  assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  return result;
}
