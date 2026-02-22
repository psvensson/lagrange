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
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: 'membership',
        run: async () => {
          counters.membership += 1;
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.LEASE_ASSIGNED,
        phase: 'lease',
        run: async () => {
          counters.lease += 1;
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.HANDSHAKE_COMPLETED,
        phase: 'handshake',
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
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: 'membership',
        run: async () => {
          counters.membership += 1;
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.LEASE_ASSIGNED,
        phase: 'lease',
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
        checkpoint: JOIN_CHECKPOINT.HANDSHAKE_COMPLETED,
        phase: 'handshake',
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
