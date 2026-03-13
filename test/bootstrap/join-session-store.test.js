import {test} from '../../src/test-helpers/tap.js';
import {
  JOIN_CHECKPOINT,
  JoinSessionStore,
} from '../../src/bootstrap/join-session-store.js';

test('JoinSessionStore - persists and reloads join session state',
  async (t) => {
    const sharedStorage = new Map();
    const storeA = new JoinSessionStore({
      storage: sharedStorage,
      now: () => 1000,
    });
    const storeB = new JoinSessionStore({
      storage: sharedStorage,
      now: () => 2000,
    });

    const created = await storeA.createOrLoadSession({
      nodeId: 'node-a',
      sessionId: 'session-1',
    });
    t.equal(created.checkpoint, JOIN_CHECKPOINT.SESSION_CREATED,
      'new sessions should start at SESSION_CREATED');

    const advanced = await storeA.advanceCheckpoint({
      nodeId: 'node-a',
      sessionId: 'session-1',
      checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
      phase: 'membership',
    });
    t.equal(advanced.checkpoint, JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
      'should advance checkpoint after write');

    const reloaded = await storeB.loadSession({
      nodeId: 'node-a',
      sessionId: 'session-1',
    });
    t.equal(reloaded.checkpoint, JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
      'reloaded session should preserve checkpoint');
    t.equal(reloaded.phase, 'membership',
      'reloaded session should preserve phase');
  });

test('JoinSessionStore - rejects checkpoint regression and duplicate side-effects',
  async (t) => {
    const store = new JoinSessionStore({
      now: () => 1000,
    });

    await store.createOrLoadSession({
      nodeId: 'node-b',
      sessionId: 'session-2',
    });
    await store.advanceCheckpoint({
      nodeId: 'node-b',
      sessionId: 'session-2',
      checkpoint: JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
      phase: 'ready-lease',
    });

    await t.rejects(
      store.advanceCheckpoint({
        nodeId: 'node-b',
        sessionId: 'session-2',
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: 'membership',
      }),
      /checkpoint regression/i,
      'store should reject non-monotonic checkpoint updates',
    );

    const duplicate = await store.createOrLoadSession({
      nodeId: 'node-b',
      sessionId: 'session-2',
    });
    t.equal(duplicate.checkpoint, JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
      'duplicate create/load should keep latest checkpoint state');
  });
