// @ts-nocheck
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
          isMetadataIngressReady: () => true,
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

test('ControlPlaneKernelIngress - skips non-leader local ingress during join convergence',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-2b',
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
          unifiedAddress: 'joining-node-2b/message-group/mg-1-r2',
          isLeaderReplica: () => false,
          isMetadataIngressReady: () => false,
        }],
      ]),
    });

    t.same(
      ingress.resolveTargetCandidates({
        allowBootstrapHints: true,
        allowSelfTarget: true,
      }),
      [
        'seed-node-1/message-group/mg-1-r3',
      ],
      'non-leader local ingress should not be treated as authoritative',
    );
  });

test('ControlPlaneKernelIngress - can prefer ingress-ready non-leader local ingress for any-replica control paths',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-2c',
      getBootstrapResponse: () => ({
        seedNodeId: 'seed-node-1',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.MOVE_REPLICA,
          groupId: 'mg-1',
          peerAddresses: [
            'seed-node-1/message-group/mg-1-r1',
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
          unifiedAddress: 'joining-node-2c/message-group/mg-1-r2',
          isLeaderReplica: () => false,
          isMetadataIngressReady: () => true,
        }],
      ]),
    });

    t.same(
      ingress.resolveTargetCandidates({
        allowBootstrapHints: true,
        allowSelfTarget: true,
        localTargetMode: 'any_replica',
      }),
      [
        'joining-node-2c/message-group/mg-1-r2',
        'seed-node-1/message-group/mg-1-r1',
      ],
      'any-replica control-plane paths should prefer the local ingress replica before remote hints',
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

test('ControlPlaneKernelIngress - prefers live local ingress over a stale confirmed remote lease',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-4b',
      getBootstrapResponse: () => ({
        seedNodeId: 'seed-node-1',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.MOVE_REPLICA,
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
          unifiedAddress: 'joining-node-4b/message-group/mg-1-r2',
          isLeaderReplica: () => true,
          isMetadataIngressReady: () => true,
        }],
      ]),
    });

    ingress.noteSuccessfulTarget('seed-node-1/message-group/mg-1-r3');

    t.same(
      ingress.resolveTargetCandidates({
        allowBootstrapHints: true,
        allowSelfTarget: true,
      }),
      [
        'joining-node-4b/message-group/mg-1-r2',
        'seed-node-1/message-group/mg-1-r3',
      ],
      'a live local ingress should outrank the stale remote lease',
    );
  });

test('ControlPlaneKernelIngress - does not reuse a stale confirmed local lease ' +
  'when metadata ingress is no longer ready', async (t) => {
  let localIngressReady = true;
  const ingress = new ControlPlaneKernelIngress({
    nodeId: 'joining-node-4c',
    getBootstrapResponse: () => ({
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
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
        unifiedAddress: 'joining-node-4c/message-group/mg-1-r2',
        isLeaderReplica: () => false,
        isMetadataIngressReady: () => localIngressReady,
      }],
    ]),
  });

  ingress.noteSuccessfulTarget('joining-node-4c/message-group/mg-1-r2');

  t.same(
    ingress.resolveTargetCandidates({
      allowBootstrapHints: true,
      allowSelfTarget: true,
      localTargetMode: 'any_replica',
    }),
    [
      'joining-node-4c/message-group/mg-1-r2',
      'seed-node-1/message-group/mg-1-r3',
    ],
    'a confirmed local lease may be reused while the ingress stays ready',
  );

  localIngressReady = false;

  t.same(
    ingress.resolveTargetCandidates({
      allowBootstrapHints: true,
      allowSelfTarget: true,
      localTargetMode: 'any_replica',
    }),
    [
      'seed-node-1/message-group/mg-1-r3',
    ],
    'a stale local lease must be dropped once the local ingress is no longer ready',
  );
});

test('ControlPlaneKernelIngress - excludes disconnected bootstrap ingress candidates',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-5',
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
          return nodeId === 'seed-node-2' ? 'connected' : 'disconnected';
        },
      }),
    });

    t.same(
      ingress.resolveTargetCandidates({allowBootstrapHints: true}),
      [
        'seed-node-2/message-group/mg-1-r4',
      ],
      'disconnected ingress should not be returned as a runtime delivery candidate',
    );
  });

test('ControlPlaneKernelIngress - can retain disconnected bootstrap ingress ' +
  'candidates when optimistic delivery is allowed', async (t) => {
  const ingress = new ControlPlaneKernelIngress({
    nodeId: 'joining-node-5b',
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
        return nodeId === 'seed-node-2' ? 'connected' : 'disconnected';
      },
    }),
  });

  t.same(
    ingress.resolveTargetCandidates({
      allowBootstrapHints: true,
      allowDisconnectedTargets: true,
    }),
    [
      'seed-node-1/message-group/mg-1-r3',
      'seed-node-2/message-group/mg-1-r4',
    ],
    'optimistic delivery should keep disconnected remote ingress candidates ' +
      'available ahead of local fallback',
  );
});

test('ControlPlaneKernelIngress - READY heartbeats prefer remote ingress before local self target',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-ready-1',
      getBootstrapResponse: () => ({
        seedNodeId: 'seed-node-1',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.MOVE_REPLICA,
          groupId: 'mg-1',
          peerAddresses: [
            'seed-node-1/message-group/mg-1-r1',
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
          unifiedAddress: 'joining-node-ready-1/message-group/mg-1-r2',
          isLeaderReplica: () => false,
          isMetadataIngressReady: () => true,
        }],
      ]),
    });

    t.same(
      ingress.resolveNodeStateUpdateTargetCandidates({
        state: 'ready',
        heartbeatAt: Date.now(),
        allowBootstrapHints: true,
        localTargetMode: 'any_replica',
      }),
      [
        'seed-node-1/message-group/mg-1-r1',
        'joining-node-ready-1/message-group/mg-1-r2',
      ],
      'READY heartbeat routing should prioritize remote authoritative ingress before the local self target',
    );
  });

test('ControlPlaneKernelIngress - READY heartbeats can keep optimistic remote ingress ahead of local fallback',
  async (t) => {
    const ingress = new ControlPlaneKernelIngress({
      nodeId: 'joining-node-ready-2',
      getBootstrapResponse: () => ({
        seedNodeId: 'seed-node-1',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.MOVE_REPLICA,
          groupId: 'mg-1',
          peerAddresses: [
            'seed-node-1/message-group/mg-1-r1',
          ],
        },
      }),
      getMessageRouter: () => ({
        getConnectionState(nodeId) {
          return nodeId === 'joining-node-ready-2' ?
            'connected' :
            'disconnected';
        },
      }),
      getMessageGroupServices: () => new Map([
        ['mg-1-r2', {
          groupId: 'mg-1',
          unifiedAddress: 'joining-node-ready-2/message-group/mg-1-r2',
          isLeaderReplica: () => false,
          isMetadataIngressReady: () => true,
        }],
      ]),
    });

    t.same(
      ingress.resolveNodeStateUpdateTargetCandidates({
        state: 'ready',
        heartbeatAt: Date.now(),
        allowBootstrapHints: true,
        localTargetMode: 'any_replica',
      }),
      [
        'seed-node-1/message-group/mg-1-r1',
        'joining-node-ready-2/message-group/mg-1-r2',
      ],
      'READY heartbeat routing should still expose optimistic remote ingress before falling back to local self delivery',
    );
  });
