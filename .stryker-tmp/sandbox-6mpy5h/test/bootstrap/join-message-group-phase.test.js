// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  JoinMessageGroupRuntimeOwner,
} from '../../src/bootstrap/owners/join-message-group-runtime-owner.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

test(
  'JoinMessageGroupRuntimeOwner queues join replicas with deferred elections',
  async (t) => {
    const queuedReplicas = [];
    const messageGroupServices = new Map();
    const registerCalls = [];
    const owner = new JoinMessageGroupRuntimeOwner({
      nodeId: 'joining-node-1',
      delegates: {
        getBootstrapResponse: () => ({
          messageGroupAssignment: {
            strategy: AssignmentStrategy.MOVE_REPLICA,
            assignmentId: 'assignment-1',
          },
        }),
        getLogger: () => silentLogger,
        getMessageRouter: () => ({}),
        getMessageGroupServices: () => messageGroupServices,
        queueJoinServiceReplica: (descriptor, options) => {
          queuedReplicas.push({descriptor, options});
        },
        createJoinServiceDescriptor: (serviceType, serviceId) => ({
          serviceType,
          serviceId,
        }),
        triggerJoinReconciler: async () => {
          messageGroupServices.set('mg-1-r2', {
            role: 'follower',
            isLeader: false,
            raft: {state: 'follower', term: 1},
          });
        },
        registerMessageGroupService: async (groupId, replicaId, service, options) => {
          registerCalls.push({groupId, replicaId, service, options});
        },
      },
    });

    await owner.phaseJoinExistingMessageGroup({
      groupId: 'mg-1',
      strategy: AssignmentStrategy.MOVE_REPLICA,
      replicaToMove: 'mg-1-r2',
      existingPeerIds: ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'],
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
        'seed-node-2/message-group/mg-1-r3',
      ],
    });

    t.equal(queuedReplicas.length, 1, 'phase should queue exactly one join replica');
    t.equal(
      queuedReplicas[0].options.deferElection,
      true,
      'join-time message-group replicas should defer elections',
    );
    t.equal(
      queuedReplicas[0].options.isJoiningExistingGroup,
      true,
      'join-time message-group replicas should be marked as joining existing groups',
    );
    t.equal(
      registerCalls.length,
      0,
      'phase should not publish a service row before canonical membership is written',
    );
  },
);
