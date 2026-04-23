import {mkdtemp, rm} from 'node:fs/promises';
import {join as joinPath} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  SEED_STARTUP_CHECKPOINT,
  SEED_STARTUP_SESSION_ID,
  SEED_STARTUP_SESSION_PHASE,
  SeedStartupSessionStore,
} from '../../src/bootstrap/seed-startup-session-store.js';

const SEED_SESSION_STORE_TEMP_PREFIX = 'seed-session-store-';

test('SeedStartupSessionStore - persists resumable startup progress across restart',
  async (t) => {
    const dataDir = await mkdtemp(
      joinPath(tmpdir(), SEED_SESSION_STORE_TEMP_PREFIX),
    );
    t.teardown(async () => {
      await rm(dataDir, {recursive: true, force: true});
    });

    const storeA = new SeedStartupSessionStore({
      dataDir,
      now: () => 1000,
    });
    await storeA.createOrLoadSession({
      nodeId: 'seed-node-a',
    });
    await storeA.advanceCheckpoint({
      nodeId: 'seed-node-a',
      sessionId: SEED_STARTUP_SESSION_ID.DEFAULT,
      checkpoint: SEED_STARTUP_CHECKPOINT.RUNTIME_READY,
      phase: SEED_STARTUP_SESSION_PHASE.RUNTIME_READY,
    });

    const storeB = new SeedStartupSessionStore({
      dataDir,
      now: () => 2000,
    });
    const reloaded = await storeB.loadLatestSession({
      nodeId: 'seed-node-a',
    });

    t.equal(
      reloaded?.checkpoint,
      SEED_STARTUP_CHECKPOINT.RUNTIME_READY,
      'seed progress should survive restart on the durable workflow record',
    );
    t.equal(
      reloaded?.sessionId,
      SEED_STARTUP_SESSION_ID.DEFAULT,
      'seed startup should retain the canonical fixed workflow identity',
    );
    t.equal(
      await storeB.resolveSessionId({
        nodeId: 'seed-node-a',
        allowResumeLatest: true,
      }),
      SEED_STARTUP_SESSION_ID.DEFAULT,
      'active seed startup should resume the persisted workflow identity',
    );
  });

test('SeedStartupSessionStore - restarts a fresh session after terminal completion',
  async (t) => {
    const dataDir = await mkdtemp(
      joinPath(tmpdir(), SEED_SESSION_STORE_TEMP_PREFIX),
    );
    t.teardown(async () => {
      await rm(dataDir, {recursive: true, force: true});
    });

    const storeA = new SeedStartupSessionStore({
      dataDir,
      now: () => 1000,
    });
    await storeA.createOrLoadSession({
      nodeId: 'seed-node-b',
    });
    await storeA.advanceCheckpoint({
      nodeId: 'seed-node-b',
      sessionId: SEED_STARTUP_SESSION_ID.DEFAULT,
      checkpoint: SEED_STARTUP_CHECKPOINT.FINALIZED,
      phase: SEED_STARTUP_SESSION_PHASE.FINALIZED,
      terminal: true,
    });

    const storeB = new SeedStartupSessionStore({
      dataDir,
      now: () => 2000,
    });
    const restarted = await storeB.createOrLoadSession({
      nodeId: 'seed-node-b',
    });

    t.equal(
      restarted.checkpoint,
      SEED_STARTUP_CHECKPOINT.SESSION_CREATED,
      'completed seed startup should reopen from the initial checkpoint',
    );
    t.equal(
      restarted.attemptCount,
      1,
      'a new seed startup run should begin a fresh attempt budget',
    );
    t.equal(
      restarted.sessionId,
      SEED_STARTUP_SESSION_ID.DEFAULT,
      'the fresh seed run should keep the canonical fixed workflow identity',
    );
    t.equal(
      restarted.terminal,
      false,
      'a restarted seed session should return to an active non-terminal state',
    );
  });
