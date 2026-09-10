import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';

const coordinatorPrototype = MembershipPublicationCoordinatorReconcile.prototype;
const realDriveOwnerMembershipReconcile =
  coordinatorPrototype.driveOwnerMembershipReconcile;
const FORBIDDEN_METHOD_OVERRIDES = Object.freeze([
  'driveOwnerMembershipReconcile',
  'startOwnerMembershipDriver',
  'stopOwnerMembershipDriver',
]);

function createMembershipPublicationOwnerDriverHost(overrides = {}) {
  for (const methodName of FORBIDDEN_METHOD_OVERRIDES) {
    if (Object.prototype.hasOwnProperty.call(overrides, methodName)) {
      throw new TypeError(
        `owner-driver host must inherit ${methodName} from production`,
      );
    }
  }
  const rejectedTicks = [];
  const coordinator = Object.assign(
    Object.create(coordinatorPrototype),
    {ownerMembershipReconcileInFlight: false},
    overrides,
  );
  coordinator.ownerDriverRejectedTicks = rejectedTicks;
  coordinator.driveOwnerMembershipReconcile = async function observedDrive(
    ...args
  ) {
    try {
      return await realDriveOwnerMembershipReconcile.apply(this, args);
    } catch (error) {
      rejectedTicks.push(error);
      throw error;
    }
  };
  return coordinator;
}

function assertMembershipPublicationOwnerDriverHostsHealthy(coordinators) {
  const rejected = coordinators.flatMap((coordinator) =>
    coordinator.ownerDriverRejectedTicks || []);
  if (rejected.length > 0) {
    throw new AggregateError(
      rejected,
      `${rejected.length} membership-publication owner-driver tick(s) rejected`,
    );
  }
  const latchedNodeIds = coordinators
    .filter((coordinator) =>
      coordinator.ownerMembershipReconcileInFlight === true)
    .map((coordinator) => coordinator.nodeId || 'unknown');
  if (latchedNodeIds.length > 0) {
    throw new Error(
      'membership-publication owner-driver remained in flight for: ' +
      latchedNodeIds.join(', '),
    );
  }
}

export {
  assertMembershipPublicationOwnerDriverHostsHealthy,
  createMembershipPublicationOwnerDriverHost,
};
