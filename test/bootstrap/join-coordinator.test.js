import {test} from '../../src/test-helpers/tap.js';
import {
  JOIN_CHECKPOINT,
  JoinSessionStore,
} from '../../src/bootstrap/join-session-store.js';
import {JoinCoordinator} from '../../src/bootstrap/join-coordinator.js';

test('JoinCoordinator - replays idempotently and skips completed checkpoints',
  async (t) => {
    const store = new JoinSessionStore({
      now: () => Date.now(),
    });
    const counters = {
      membership: 0,
      lease: 0,
      handshake: 0,
    };
    const coordinator = new JoinCoordinator({
      joinSessionStore: store,
    });

    const steps = [
      {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: 'seed',
        run: async () => {
          counters.membership += 1;
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: 'infrastructure',
        run: async () => {
          counters.lease += 1;
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: 'membership',
        run: async () => {
          counters.handshake += 1;
        },
      },
    ];

    await coordinator.run({
      nodeId: 'node-c',
      sessionId: 'session-3',
      steps,
    });
    await coordinator.run({
      nodeId: 'node-c',
      sessionId: 'session-3',
      steps,
    });

    t.same(counters, {
      membership: 1,
      lease: 1,
      handshake: 1,
    }, 're-running same session should not duplicate completed side-effects');
  });

test('JoinCoordinator - resumes from persisted checkpoint after mid-join failure',
  async (t) => {
    const store = new JoinSessionStore({
      now: () => Date.now(),
    });
    let leaseFail = true;
    const counters = {
      membership: 0,
      lease: 0,
      handshake: 0,
    };
    const coordinator = new JoinCoordinator({
      joinSessionStore: store,
    });

    const steps = [
      {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: 'seed',
        run: async () => {
          counters.membership += 1;
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: 'infrastructure',
        run: async () => {
          counters.lease += 1;
          if (leaseFail) {
            const error = new Error('lease failed');
            error.retryable = true;
            throw error;
          }
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: 'membership',
        run: async () => {
          counters.handshake += 1;
        },
      },
    ];

    await t.rejects(
      coordinator.run({
        nodeId: 'node-d',
        sessionId: 'session-4',
        steps,
      }),
      /lease failed/,
      'first run should fail in lease step',
    );

    leaseFail = false;
    await coordinator.run({
      nodeId: 'node-d',
      sessionId: 'session-4',
      steps,
    });

    t.same(counters, {
      membership: 1,
      lease: 2,
      handshake: 1,
    }, 'resume should continue from failed checkpoint without replaying completed membership');
  });

test('JoinCoordinator - reruns a completed checkpoint when local state is missing',
  async (t) => {
    const store = new JoinSessionStore({
      now: () => Date.now(),
    });
    let localInfrastructureReady = false;
    let rerunCount = 0;
    const coordinator = new JoinCoordinator({
      joinSessionStore: store,
    });

    await coordinator.run({
      nodeId: 'node-e',
      sessionId: 'session-5',
      steps: [
        {
          checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
          phase: 'infrastructure',
          run: async () => {
            rerunCount += 1;
            localInfrastructureReady = true;
          },
        },
      ],
    });

    localInfrastructureReady = false;
    await coordinator.run({
      nodeId: 'node-e',
      sessionId: 'session-5',
      steps: [
        {
          checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
          phase: 'infrastructure',
          shouldRerun: () => localInfrastructureReady === false,
          run: async () => {
            rerunCount += 1;
            localInfrastructureReady = true;
          },
        },
      ],
    });

    t.equal(rerunCount, 2,
      'completed checkpoint should rerun when explicit local-state guard requires it');
  });

test('JoinCoordinator - preserves highest checkpoint when rerunning an earlier satisfied step',
  async (t) => {
    const store = new JoinSessionStore({
      now: () => Date.now(),
    });
    const counters = {
      infrastructure: 0,
      membership: 0,
      readyLease: 0,
    };
    let localInfrastructureReady = false;
    const coordinator = new JoinCoordinator({
      joinSessionStore: store,
    });

    await coordinator.run({
      nodeId: 'node-f',
      sessionId: 'session-6',
      steps: [
        {
          checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
          phase: 'infrastructure',
          run: async () => {
            counters.infrastructure += 1;
            localInfrastructureReady = true;
          },
        },
        {
          checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
          phase: 'membership',
          run: async () => {
            counters.membership += 1;
          },
        },
      ],
    });

    const persistedMembership = await store.loadSession({
      nodeId: 'node-f',
      sessionId: 'session-6',
    });
    t.equal(
      persistedMembership?.checkpoint,
      JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
      'first run should persist membership as the highest satisfied checkpoint',
    );

    localInfrastructureReady = false;
    await coordinator.run({
      nodeId: 'node-f',
      sessionId: 'session-6',
      steps: [
        {
          checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
          phase: 'infrastructure',
          shouldRerun: () => localInfrastructureReady === false,
          run: async () => {
            counters.infrastructure += 1;
            localInfrastructureReady = true;
          },
        },
        {
          checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
          phase: 'membership',
          run: async () => {
            counters.membership += 1;
          },
        },
        {
          checkpoint: JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
          phase: 'ready',
          run: async () => {
            counters.readyLease += 1;
          },
        },
      ],
    });

    const resumed = await store.loadSession({
      nodeId: 'node-f',
      sessionId: 'session-6',
    });
    t.equal(
      resumed?.checkpoint,
      JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
      'rerunning an earlier satisfied step should preserve high-water progress ' +
      'and allow later steps to continue',
    );
    t.same(counters, {
      infrastructure: 2,
      membership: 1,
      readyLease: 1,
    }, 'only the earlier infrastructure step should rerun before later steps continue');
  });
