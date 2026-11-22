// S0 witness (fallback-read closure, lead ruling Q3). Owner path:
// readOwnerFact -> executeAuthoritativeSystemTableRead -> the in-process arm,
// which reads the replicas this node hosts from their one owner, the replica
// handler's registry (ReplicaHandler.hostedPartitionReplicas), never from the
// CDC service's bootstrap/join provider map.
// Real: the fixture's raft-rs ledger group and read surfaces, a real
// ReplicaHandler per surface. Substituted: the replica is placed in the
// handler's registry by the same registry write the handler's CREATE makes
// (replica-handler-create-methods.js, localServices.set), after the node's
// read surface was composed; the CREATE admission and registration steps
// themselves are not run.
import {
  OWNER_FACT_STATE as STATE,
  ownerFactRows,
  readOwnerFact,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {test} from '../../src/test-helpers/tap.js';
import {openLedgerGroupSurface, ownerFactDraft} from './cdc-owner-fact-group-fixture.js';

const OPERATION = 'hosted-replica-operation';
const TEST_TIMEOUT_MS = 120000;

function requestFor(operationId) {
  return ownerFactDraft([operationId]);
}

test('readOwnerFact: a replica the handler hosts after the node joined, once elected, is ' +
  'read in process', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [first, , later] = group.services;
  await group.settleLeader(first);
  group.seedRow(later, OPERATION);
  // The node's read surface exists before the handler hosts the replica, and
  // its CDC provider map never holds it.
  const surface = await group.surfaceOf(later.nodeId,
    {leaderNodeId: null, hostedBy: 'handler-only'});
  surface.handler.localServices.set(later.replicaId, later);
  await group.transferLeadership(first, later);
  await group.settleLeader(later);
  for (const nodeId of group.nodes) group.setReachable(nodeId, false);
  const sentBefore = group.transit.length;
  const answer = await readOwnerFact(surface.readLeaderRequired, requestFor(OPERATION));
  t.equal(answer.state, STATE.READY, 'found through the handler\'s registry');
  t.equal(answer.witness?.servingReplicaId, later.replicaId);
  t.same(ownerFactRows(answer), [{operation_id: OPERATION, workflow_step: later.replicaId}]);
  t.equal(group.transit.length, sentBefore, 'no query transit was used');
});
