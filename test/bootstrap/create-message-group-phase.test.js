import {test} from '../../src/test-helpers/tap.js';
import {CreateMessageGroupPhase} from '../../src/bootstrap/phases/create-message-group-phase.js';
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
  'CreateMessageGroupPhase - CREATE_SELF_HOSTED queues local-only replicas without global role publication',
  async (t) => {
    const queuedReplicas = [];
    const joinReplicas = [];
    const messageGroupServices = new Map();
    const phase = new CreateMessageGroupPhase({
      nodeId: 'join-node-self-hosted',
      delegates: {
        getLogger: () => silentLogger,
        getConfig: () => ({replicaStaggerDelayMs: 5}),
        getSleep: () => async () => {},
        getMessageRouter: () => ({}),
        resetJoinMessageGroupReplicas: () => {
          joinReplicas.length = 0;
        },
        assertReplicaStartupOwnership: () => {},
        queueJoinServiceReplica: (descriptor, options) => {
          queuedReplicas.push({descriptor, options});
        },
        createJoinServiceDescriptor: (serviceType, serviceId) => ({
          serviceType,
          serviceId,
        }),
        triggerJoinReconciler: async () => {
          for (let index = 0; index < 3; index += 1) {
            const replicaId = `mg-self-r${index}`;
            const replica = {startElection: () => {}};
            messageGroupServices.set(replicaId, {
              groupId: 'mg-self',
              replicaId,
            });
            joinReplicas.push(replica);
          }
        },
        getMessageGroupServices: () => messageGroupServices,
        getJoinMessageGroupReplicas: () => joinReplicas,
      },
    });

    await phase.phaseCreateSelfHostedMessageGroup({
      strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
      groupId: 'mg-self',
      replicaCount: 3,
    });

    t.equal(queuedReplicas.length, 3, 'should queue one descriptor per local replica');
    for (const queued of queuedReplicas) {
      t.equal(
        queued.options.deferElection,
        true,
        'self-hosted replicas should still defer election until staged startup finishes',
      );
      t.equal(
        queued.options.deferElectionUntilJoinConvergence,
        queued.options.replicaIndex > 0,
        'only the bootstrap leader should be allowed to start elections during join',
      );
      t.equal(
        queued.options.publishRoleMetadata,
        false,
        'self-hosted join replicas should suppress global role publication during startup',
      );
      t.equal(
        queued.options.publishLeaderNodeMetadata,
        false,
        'self-hosted join replicas should suppress global leader-node publication during startup',
      );
    }
  },
);

test(
  'CreateMessageGroupPhase - CREATE_SELF_HOSTED only releases the bootstrap leader election during join',
  async (t) => {
    const queuedReplicas = [];
    const joinReplicas = [];
    const messageGroupServices = new Map();
    const electionStarts = [];
    const sleepCalls = [];
    const phase = new CreateMessageGroupPhase({
      nodeId: 'join-node-self-hosted',
      delegates: {
        getLogger: () => silentLogger,
        getConfig: () => ({replicaStaggerDelayMs: 5}),
        getSleep: () => async (delayMs) => {
          sleepCalls.push(delayMs);
        },
        getMessageRouter: () => ({}),
        resetJoinMessageGroupReplicas: () => {
          joinReplicas.length = 0;
        },
        assertReplicaStartupOwnership: () => {},
        queueJoinServiceReplica: (descriptor, options) => {
          queuedReplicas.push({descriptor, options});
        },
        createJoinServiceDescriptor: (serviceType, serviceId) => ({
          serviceType,
          serviceId,
        }),
        triggerJoinReconciler: async () => {
          for (let index = 0; index < 3; index += 1) {
            const replicaId = `mg-self-r${index}`;
            const replica = {
              deferElectionUntilJoinConvergence: index > 0,
              raftTimingConfig: {
                electionMaxMs: 40,
                heartbeatMs: 10,
              },
              startElection: () => {
                electionStarts.push(replicaId);
              },
            };
            messageGroupServices.set(replicaId, {
              groupId: 'mg-self',
              replicaId,
            });
            joinReplicas.push(replica);
          }
        },
        getMessageGroupServices: () => messageGroupServices,
        getJoinMessageGroupReplicas: () => joinReplicas,
      },
    });

    await phase.phaseCreateSelfHostedMessageGroup({
      strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
      groupId: 'mg-self',
      replicaCount: 3,
    });

    t.same(
      electionStarts,
      ['mg-self-r0'],
      'only the bootstrap leader should start elections before join convergence',
    );
    t.same(
      sleepCalls,
      [],
      'no stagger delay is needed when follower elections stay suppressed until convergence',
    );
    t.equal(
      queuedReplicas.length,
      3,
      'staggered election release should not change replica creation count',
    );
  },
);

test(
  'CreateMessageGroupPhase - durable rejoin existing group only queues owned replicas',
  async (t) => {
    const queuedReplicas = [];
    const joinReplicas = [];
    const messageGroupServices = new Map();
    const phase = new CreateMessageGroupPhase({
      nodeId: 'join-node-r2',
      delegates: {
        getLogger: () => silentLogger,
        getConfig: () => ({replicaStaggerDelayMs: 5}),
        getSleep: () => async () => {},
        getMessageRouter: () => ({}),
        resetJoinMessageGroupReplicas: () => {
          joinReplicas.length = 0;
        },
        assertReplicaStartupOwnership: () => {},
        queueJoinServiceReplica: (descriptor, options) => {
          queuedReplicas.push({descriptor, options});
        },
        createJoinServiceDescriptor: (serviceType, serviceId) => ({
          serviceType,
          serviceId,
        }),
        triggerJoinReconciler: async () => {
          const replica = {
            deferElectionUntilJoinConvergence: true,
            startElection: () => {},
          };
          messageGroupServices.set('mg-1-r2', {
            groupId: 'mg-1',
            replicaId: 'mg-1-r2',
          });
          joinReplicas.push(replica);
        },
        getMessageGroupServices: () => messageGroupServices,
        getJoinMessageGroupReplicas: () => joinReplicas,
      },
    });

    await phase.phaseCreateSelfHostedMessageGroup({
      strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
      groupId: 'mg-1',
      replicaCount: 3,
      startupReplicaIds: ['mg-1-r2'],
      existingPeerIds: ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'],
      peerAddresses: [
        'seed-node/message-group/mg-1-r1',
        'join-node-r2/message-group/mg-1-r2',
        'node-3/message-group/mg-1-r3',
      ],
    });

    t.equal(queuedReplicas.length, 1, 'should only queue the locally owned replica');
    t.equal(queuedReplicas[0].descriptor.serviceId, 'mg-1-r2');
    t.same(
      queuedReplicas[0].options.replicaIds,
      ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'],
      'should preserve the full group replica ordering for raft startup',
    );
    t.equal(
      queuedReplicas[0].options.replicaIndex,
      1,
      'owned replica should retain its original index within the group',
    );
    t.equal(
      queuedReplicas[0].options.deferElectionUntilJoinConvergence,
      true,
      'non-leader durable rejoin replicas should keep elections suppressed',
    );
  },
);
