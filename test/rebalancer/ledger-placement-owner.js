// The replica placement owner of a fixture's ledger replica
// (replica_operations-p1): the production ReplicaPlacementOwner
// (createReplicaPlacementOwner), put into the ledger's leadership-sink slot
// through setRebalancerLeadershipSink, where the ledger drives it. A fixture
// ledger leads, so the owner leads: its custody, its listeners and its passes
// run as in production, and a coordinator on that node takes its copy limits
// from it (resolveActiveReplicaPlacementOwner -> resolveOwnerMoveCopyLimits).
//
// Production builds it with ControlPlaneSetup.createReplicaPlacementOwnerFactory
// -> ControlPlaneSetup.attachReplicaPlacementOwner -> attachReplicaPlacementOwner
// (src/bootstrap/shared/control-plane-setup.js, src/rebalancer/
// replica-placement-owner.js). This helper calls the owner's constructor
// itself with the collaborators below, because that factory reads
// readiness.getServeEligibilityOwner() and the coordinator's storage service,
// which these fixtures' doubles do not provide as production does.
//
// Collaborators:
// - nodeId: the coordinator's node; ledgerPartitionService: the ledger replica;
//   now and logger: the ledger's (its timeSource.now, its logger), as the
//   factory passes them; systemTableCache: the coordinator's cache (which must
//   carry the cache's apply-change port, as SystemTableCache and the
//   rebalancer fixtures' createMockCache do); workflowOwner: the coordinator's.
// - nodeAuthority: readiness.getServeEligibilityOwner() where the coordinator's
//   readiness is the real ControlPlaneReadinessService. Where it is a fixture
//   readiness double (createMockControlPlaneReadinessService, a
//   readinessServiceFake), which has no serve-eligibility owner, the owner's
//   port is answered by the same-named answers the real readiness delegates to
//   that owner (control-plane-readiness-serve-eligibility-methods.js):
//   answerCommittedNodes -> readiness.answerCommittedNodes() (the double's
//   committed answer: ready, its node rows, its formation), subscribe ->
//   readiness.subscribeServeEligibility(listener) (the double's never fires),
//   scheduleRefresh -> readiness.readServeEligibility() (the double's settles
//   with nothing).
//
// Evidence ceiling:
// - no storage collaborator (optional for the owner:
//   replica-placement-owner-collaborators.js validateOptionalPlacementCollaborators).
//   These fixtures' coordinators carry a storage port that only estimates
//   bytes; a storage service that does not know a node's capacity makes the
//   owner answer that target hard false TARGET_STORAGE_UNKNOWN
//   (replica-placement-owner-capacity.js classifyNodeStorageExclusion). So the
//   fixtures prove nothing about storage admission.
// - no resync timer pair (required by ControlPlaneSetup.attachReplicaPlacementOwner,
//   requireResyncTimerCollaborators): the owner has no RESYNC wake and passes
//   only on its other triggers.
// - the owner's adaptive budget controller is its default; with no node
//   observation source its copy windows stay at their initial limits.
//
// One owner per ledger replica: a coordinator that binds a ledger already
// holding the owner keeps it, with the collaborators of the coordinator that
// attached it (production keeps an attachment until the ledger quiesces:
// partition-service-rebalancer-methods.js ensureReplicaPlacementOwnerAttached);
// a slot that holds anything else is refused, as attachReplicaPlacementOwner
// refuses an occupied slot.
//
// Not yet on this helper (the next drift repairs): the plain-boolean sink of
// test/partition/placement-create-with-ledger-fixture.js
// (ensureLeaderPlacementOwnerSink) and the real owner over a hand-rolled cache
// in test/partition/placement-retained-row-repair-fixture.js
// (attachCurrentCopyOwner).
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';

const ATTACHED_OWNERS = new WeakMap();
const STR_FUNCTION = 'function';

function nodeAuthorityOf(readiness) {
  if (typeof readiness.getServeEligibilityOwner === STR_FUNCTION) {
    return readiness.getServeEligibilityOwner();
  }
  return Object.freeze({
    answerCommittedNodes: () => readiness.answerCommittedNodes(),
    subscribe: (listener) => readiness.subscribeServeEligibility(listener),
    scheduleRefresh: () => {
      void readiness.readServeEligibility();
    },
  });
}

/**
 * Attach the ledger replica's placement owner (once per ledger replica).
 * @param {Object} ledgerPartitionService - The replica_operations-p1 leader.
 * @param {Object} coordinator - The coordinator of the ledger's node.
 * @return {Object} The ReplicaPlacementOwner in the ledger's slot.
 */
function attachLedgerPlacementOwner(ledgerPartitionService, coordinator) {
  const attached = ATTACHED_OWNERS.get(ledgerPartitionService);
  if (attached) return attached;
  if (ledgerPartitionService.rebalancerLeadershipSink) {
    throw new Error('the ledger replica already holds another placement owner');
  }
  const owner = createReplicaPlacementOwner({
    nodeId: coordinator.nodeId,
    ledgerPartitionService,
    nodeAuthority: nodeAuthorityOf(coordinator.controlPlaneReadinessService),
    systemTableCache: coordinator.systemTableCache,
    workflowOwner: coordinator.workflowOwner,
    now: () => ledgerPartitionService.timeSource.now(),
    logger: ledgerPartitionService.logger,
  });
  ATTACHED_OWNERS.set(ledgerPartitionService, owner);
  ledgerPartitionService.setRebalancerLeadershipSink(owner);
  return owner;
}

export {attachLedgerPlacementOwner};
