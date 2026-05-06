import {MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL} from './membership-publication-coordinator-stage-1.js';
import {MembershipPublicationCoordinatorClassStage2} from './membership-publication-coordinator-class-stage-2.js';

class MembershipPublicationCoordinatorClassStage3 extends
  MembershipPublicationCoordinatorClassStage2 {
  enqueueClusterMembershipReconcile(
    reason = MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MANUAL,
    context = {},
    options = {},
  ) {
    return this.reconcileQueue.enqueue(this.buildOwnerKey(), reason, context, options);
  }
}

export {MembershipPublicationCoordinatorClassStage3 as MembershipPublicationCoordinator};
