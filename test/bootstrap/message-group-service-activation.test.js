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
