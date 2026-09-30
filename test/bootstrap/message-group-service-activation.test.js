import {test} from '../../src/test-helpers/tap.js';
import {
  activateMessageGroupServiceRows,
  MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR,
} from '../../src/bootstrap/shared/message-group-service-activation.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {createIdentityTransport} from
  '../test-helpers/replica-handler-identity-fixture.js';

// A router holding the exact handler of each listed replica (identity, not
// presence: activation fails closed on a router without the identity API).
function routerWithHandlers(services, registeredReplicaIds) {
  const router = createIdentityTransport();
  for (const replicaId of registeredReplicaIds) {
    router.register(`node-a/message-group/${replicaId}`,
      services.get(replicaId).transportHandler);
  }
  return router;
}

function messageGroupReplicas(replicaIds) {
  return new Map(replicaIds.map((replicaId) => [replicaId,
    {groupId: 'mg-1', transportHandler: () => replicaId}]));
}

function createLifecycleOwner() {
  return new ReplicaStateMachine({nodeId: 'node-a',
    controlPlaneSystemTableGateway: {}});
}

test('activateMessageGroupServiceRows requires endpoint publication',
  async (t) => {
    await t.rejects(
      activateMessageGroupServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => ({success: true}),
          upsertSystemTableRow: async () => ({success: true}),
        },
        replicaStateMachine: createLifecycleOwner(),
        messageRouter: {
          isRegistered: () => true,
        },
        messageGroupServiceHandler: {},
        endpointsPublished: false,
        messageGroupServices: new Map([
          ['mg-1-r1', {groupId: 'mg-1'}],
        ]),
      }),
      new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.ENDPOINTS_REQUIRED),
      'activation should fail closed until endpoint publication completes',
    );
  });

test('activateMessageGroupServiceRows requires per-replica handler registration',
  async (t) => {
    const twoReplicas = messageGroupReplicas(['mg-1-r1', 'mg-1-r2']);
    await t.rejects(
      activateMessageGroupServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => ({success: true}),
          upsertSystemTableRow: async () => ({success: true}),
        },
        replicaStateMachine: createLifecycleOwner(),
        messageRouter: routerWithHandlers(twoReplicas, ['mg-1-r1']),
        messageGroupServiceHandler: {},
        endpointsPublished: true,
        messageGroupServices: twoReplicas,
      }),
      new Error(
        MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR
          .replicaHandlerRequired('mg-1-r2'),
      ),
      'activation should fail closed until every replica handler is routable',
    );
  });

test('activateMessageGroupServiceRows can defer transient writer failures',
  async (t) => {
    const deferred = [];
    const oneReplica = messageGroupReplicas(['mg-1-r1']);

    await t.resolves(
      activateMessageGroupServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => {
            throw new Error(
              'Distributed operation failed due to participant failures',
            );
          },
          upsertSystemTableRow: async () => {
            throw new Error(
              'Distributed operation failed due to participant failures',
            );
          },
        },
        replicaStateMachine: createLifecycleOwner(),
        messageRouter: routerWithHandlers(oneReplica, ['mg-1-r1']),
        messageGroupServiceHandler: {},
        endpointsPublished: true,
        deferTransientFailures: true,
        onDeferredActivation: (details) => deferred.push(details),
        messageGroupServices: oneReplica,
      }),
      'join-time activation should not fail hard on transient system-table pressure when deferral is enabled',
    );

    t.equal(deferred.length, 1, 'transient activation failure should be surfaced via deferred callback');
    t.equal(deferred[0]?.replicaId, 'mg-1-r1', 'callback should identify the deferred replica');
  });

test('activateMessageGroupServiceRows requires the replica lifecycle owner',
  async (t) => {
    let writes = 0;
    await t.rejects(
      activateMessageGroupServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => {
            writes += 1;
            return {success: true};
          },
        },
        messageRouter: {
          isRegistered: () => true,
        },
        messageGroupServiceHandler: {},
        endpointsPublished: true,
        messageGroupServices: new Map([
          ['mg-1-r1', {groupId: 'mg-1'}],
        ]),
      }),
      new Error(
        MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.LIFECYCLE_OWNER_REQUIRED,
      ),
      'activation has no path outside the replica lifecycle owner',
    );
    t.equal(writes, 0, 'no ACTIVE write without the lifecycle owner');
  });
