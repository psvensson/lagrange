import {mkdtemp, rm} from 'node:fs/promises';
import {join as joinPath} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  JOIN_CHECKPOINT,
  JoinSessionStore,
} from '../../src/bootstrap/join-session-store.js';

const JOIN_SESSION_STORE_TEMP_PREFIX = 'join-session-store-';

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

test('JoinSessionStore - persists retryable resume state across store instances',
  async (t) => {
    const dataDir = await mkdtemp(
      joinPath(tmpdir(), JOIN_SESSION_STORE_TEMP_PREFIX),
    );
    t.teardown(async () => {
      await rm(dataDir, {recursive: true, force: true});
    });

    const storeA = new JoinSessionStore({
      dataDir,
      now: () => 1000,
    });
    await storeA.createOrLoadSession({
      nodeId: 'node-c',
      sessionId: 'session-3',
    });
    await storeA.advanceCheckpoint({
      nodeId: 'node-c',
      sessionId: 'session-3',
      checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
      phase: 'membership',
    });
    await storeA.recordFailure({
      nodeId: 'node-c',
      sessionId: 'session-3',
      phase: 'membership',
      errorCode: 'membership_retry',
      retryAfterMs: 250,
      retryable: true,
    });

    const storeB = new JoinSessionStore({
      dataDir,
      now: () => 2000,
    });
    const reloaded = await storeB.loadSession({
      nodeId: 'node-c',
      sessionId: 'session-3',
    });

    t.equal(
      reloaded?.checkpoint,
      JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
      'file-backed store should preserve the highest completed checkpoint',
    );
    t.equal(
      reloaded?.lastErrorCode,
      'membership_retry',
      'file-backed store should preserve the canonical failure code',
    );
    t.equal(
      await storeB.resolveSessionId({
        nodeId: 'node-c',
        allowResumeLatest: true,
      }),
      'session-3',
      'retryable join failures should resume the persisted session identity',
    );
  });
