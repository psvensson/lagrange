import {test} from '../../src/test-helpers/tap.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {
  ControlPlaneKernelIngress,
} from '../../src/control-plane/control-plane-kernel-ingress.js';

test('ControlPlaneKernelIngress - resolves bootstrap ingress without cache metadata',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-1',
      getBootstrapResponse: () => ({
        seedNodeId: 'seed-node-1',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.MOVE_REPLICA,
          groupId: 'mg-1',
          replicaToMove: 'mg-1-r1',
          peerAddresses: [
            'seed-node-1/message-group/mg-1-r1',
            'seed-node-1/message-group/mg-1-r2',
          ],
        },
      }),
      getMessageRouter: () => ({
        getConnectionState(nodeId) {
          return nodeId === 'seed-node-1' ? 'connected' : 'disconnected';
        },
      }),
    });

    t.equal(
      ingress.resolveTargetAddress(),
      'seed-node-1/message-group/mg-1-r2',
      'bootstrap ingress should exclude the moved replica and use the seed path',
    );
  });

test('ControlPlaneKernelIngress - prefers local ingress before remote ingress',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-2',
      getBootstrapResponse: () => ({
        seedNodeId: 'seed-node-1',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          groupId: 'mg-1',
          peerAddresses: [
            'seed-node-1/message-group/mg-1-r3',
          ],
        },
      }),
      getMessageRouter: () => ({
        getConnectionState() {
          return 'connected';
        },
      }),
      getMessageGroupServices: () => new Map([
        ['mg-1-r2', {
          groupId: 'mg-1',
          unifiedAddress: 'joining-node-2/message-group/mg-1-r2',
          isLeaderReplica: () => true,
        }],
      ]),
    });

    t.same(
      ingress.resolveTargetCandidates({
        allowBootstrapHints: true,
        allowSelfTarget: true,
      }),
      [
        'joining-node-2/message-group/mg-1-r2',
        'seed-node-1/message-group/mg-1-r3',
      ],
      'local ingress should be first when the joiner has a live local replica',
    );
  });

test('ControlPlaneKernelIngress - prefers seed ingress before other remote ingress',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-3',
      getBootstrapResponse: () => ({
        seedNodeId: 'seed-node-1',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.MOVE_REPLICA,
          groupId: 'mg-1',
          replicaToMove: 'mg-1-r1',
          peerAddresses: [
            'seed-node-2/message-group/mg-1-r4',
            'seed-node-1/message-group/mg-1-r3',
            'joining-node-3/message-group/mg-1-r5',
          ],
        },
      }),
      getMessageRouter: () => ({
        getConnectionState(nodeId) {
          return nodeId === 'seed-node-1' || nodeId === 'seed-node-2' ?
            'connected' :
            'disconnected';
        },
      }),
    });

    t.same(
      ingress.resolveBootstrapTargetAddresses(
        ingress.getBootstrapResponse().messageGroupAssignment,
      ),
      [
        'seed-node-1/message-group/mg-1-r3',
        'seed-node-2/message-group/mg-1-r4',
      ],
      'seed ingress should be preferred and local/self candidates excluded',
    );
  });

test('ControlPlaneKernelIngress - prefers confirmed ingress lease and suppresses stale targets',
  async (t) => {
    let nowMs = 1000;
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-4',
      now: () => nowMs,
      ingressLeaseMs: 5000,
      targetSuppressionMs: 1000,
      getBootstrapResponse: () => ({
        seedNodeId: 'seed-node-1',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.MOVE_REPLICA,
          groupId: 'mg-1',
          peerAddresses: [
            'seed-node-1/message-group/mg-1-r3',
            'seed-node-2/message-group/mg-1-r4',
          ],
        },
      }),
      getMessageRouter: () => ({
        getConnectionState(nodeId) {
          return nodeId === 'seed-node-1' || nodeId === 'seed-node-2' ?
            'connected' :
            'disconnected';
        },
      }),
    });

    ingress.noteSuccessfulTarget('seed-node-2/message-group/mg-1-r4');
    t.same(
      ingress.resolveTargetCandidates({allowBootstrapHints: true}),
      [
        'seed-node-2/message-group/mg-1-r4',
        'seed-node-1/message-group/mg-1-r3',
      ],
      'confirmed ingress lease should outrank bootstrap hint ordering',
    );

    ingress.invalidateTarget('seed-node-2/message-group/mg-1-r4');
    t.same(
      ingress.resolveTargetCandidates({allowBootstrapHints: true}),
      ['seed-node-1/message-group/mg-1-r3'],
      'invalidated target should be suppressed from immediate retry selection',
    );

    nowMs += 1001;
    t.same(
      ingress.resolveTargetCandidates({allowBootstrapHints: true}),
      [
        'seed-node-1/message-group/mg-1-r3',
        'seed-node-2/message-group/mg-1-r4',
      ],
      'suppressed targets should become eligible again after the local cooldown',
    );
  });
