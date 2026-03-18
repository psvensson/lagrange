import {test} from '../../src/test-helpers/tap.js';
import {
  activateMessageGroupServiceRows,
  MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR,
} from '../../src/bootstrap/shared/message-group-service-activation.js';

test('activateMessageGroupServiceRows requires endpoint publication',
  async (t) => {
    await t.rejects(
      activateMessageGroupServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => ({success: true}),
          upsertSystemTableRow: async () => ({success: true}),
        },
        messageRouter: {
          isRegistered: () => true,
        },
        handlerRegistered: true,
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
    await t.rejects(
      activateMessageGroupServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => ({success: true}),
          upsertSystemTableRow: async () => ({success: true}),
        },
        messageRouter: {
          isRegistered: (address) =>
            address === 'node-a/message-group/mg-1-r1',
        },
        handlerRegistered: true,
        endpointsPublished: true,
        messageGroupServices: new Map([
          ['mg-1-r1', {groupId: 'mg-1'}],
          ['mg-1-r2', {groupId: 'mg-1'}],
        ]),
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
        messageRouter: {
          isRegistered: () => true,
        },
        handlerRegistered: true,
        endpointsPublished: true,
        deferTransientFailures: true,
        onDeferredActivation: (details) => deferred.push(details),
        messageGroupServices: new Map([
          ['mg-1-r1', {groupId: 'mg-1'}],
        ]),
      }),
      'join-time activation should not fail hard on transient system-table pressure when deferral is enabled',
    );

    t.equal(deferred.length, 1, 'transient activation failure should be surfaced via deferred callback');
    t.equal(deferred[0]?.replicaId, 'mg-1-r1', 'callback should identify the deferred replica');
  });
