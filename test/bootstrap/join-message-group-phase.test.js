import {test} from '../../src/test-helpers/tap.js';
import {
  JoinMessageGroupRuntimeOwner,
} from '../../src/bootstrap/owners/join-message-group-runtime-owner.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {JOINING_LOG_MSG} from '../../src/bootstrap/node-joining-constants.js';

const JOINED_REPLICA_TERM = 7;

function recordingLogger() {
  const info = [];
  return {
    info,
    logger: {
      debug: () => {},
      info: (message, payload) => info.push({message, payload}),
      warn: () => {},
      error: () => {},
    },
  };
}

test(
  'JoinMessageGroupRuntimeOwner queues join replicas with deferred elections',
  async (t) => {
    const queuedReplicas = [];
    const messageGroupServices = new Map();
    const registerCalls = [];
    const log = recordingLogger();
    const owner = new JoinMessageGroupRuntimeOwner({
      nodeId: 'joining-node-1',
      delegates: {
        getBootstrapResponse: () => ({
          messageGroupAssignment: {
            strategy: AssignmentStrategy.MOVE_REPLICA,
            assignmentId: 'assignment-1',
          },
        }),
        getLogger: () => log.logger,
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
          // A message-group replica reports its term through its own
          // accessor; its consensus port exposes no legacy object fields.
          messageGroupServices.set('mg-1-r2', {
            role: 'follower',
            isLeader: false,
            leaderId: null,
            raft: Object.freeze({}),
            getCurrentTerm: () => JOINED_REPLICA_TERM,
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
    t.equal(registerCalls.length, 1,
      'initialized MOVE runtime should transfer canonical row ownership once');
    t.match(registerCalls[0], {
      groupId: 'mg-1',
      replicaId: 'mg-1-r2',
      options: {status: 'stopped'},
    }, 'handoff stages STOPPED before the separate exact activation CAS');
    const initialized = log.info.find((entry) =>
      entry.message === JOINING_LOG_MSG.JOIN_SERVICE_INITIALIZED);
    t.equal(initialized?.payload.raftTerm, JOINED_REPLICA_TERM,
      'the initialized replica\'s term is read through its own accessor');
    t.notOk('raftState' in (initialized?.payload ?? {}),
      'no legacy core-state field is read off the consensus port');
  },
);
