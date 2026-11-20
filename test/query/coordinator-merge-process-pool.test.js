import {test} from '../../src/test-helpers/tap.js';
import {
  CoordinatorMergeProcessPool,
} from '../../src/query/distributed/coordinator-merge-process.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {encodeTypedRowSet} from '../../src/query/sql-value-codec.js';

const TABLE_NAME = 't';
const COL_ID = 'id';
const COL_TOTAL = 'total';
const COL_COUNT = 'n';
const COL_TYPE_INTEGER = 'INTEGER';
const SUM_SQL = 'SELECT SUM(id) AS total FROM t';
const STREAMING_HEAVY_JOIN_SQL =
  'SELECT a.id + (' +
  'SELECT COUNT(*) FROM t c JOIN t d ON 1 = 1 JOIN t e ON 1 = 1 ' +
  'WHERE c.id >= a.id + b.id' +
  ') AS n FROM t a JOIN t b ON 1 = 1';
const HEAVY_ROW_COUNT = 80;
const LONG_DEADLINE_OFFSET_MS = 10000;
const SAMPLE_ROW_A = 10n;
const SAMPLE_ROW_B = 20n;
const SAMPLE_SUM = 30n;
const INIT_SESSION_MSG_TYPE = 'INIT_SESSION';
const MERGE_EXECUTION_STARTED_MSG_TYPE = 'MERGE_EXECUTION_STARTED';
const SEND_FAIL_MESSAGE = 'IPC channel already closed';
const EARLY_SETTLE_ERROR_MSG =
  'Merge execution settled before MERGE_EXECUTION_STARTED observation';
const OBSERVATION_TIMEOUT_ERROR_MSG =
  'Timed out waiting for MERGE_EXECUTION_STARTED observation';

async function awaitMergeExecutionStarted(
  execPromise,
  startedPromise,
  timeoutMs = LONG_DEADLINE_OFFSET_MS,
) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(OBSERVATION_TIMEOUT_ERROR_MSG));
    }, timeoutMs);
  });
  const earlySettlePromise = execPromise.then(() => {
    throw new Error(EARLY_SETTLE_ERROR_MSG);
  });
  try {
    return await Promise.race([
      startedPromise,
      earlySettlePromise,
      timeoutPromise,
    ]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

function buildSimpleSumRequest(sessionOptions = {}) {
  return {
    tables: [{
      tableName: TABLE_NAME,
      schema: {columns: [{name: COL_ID, type: COL_TYPE_INTEGER}]},
      declaredColumns: [COL_ID],
      fragments: [{
        rowSet: encodeTypedRowSet([COL_ID], [[SAMPLE_ROW_A], [SAMPLE_ROW_B]]),
      }],
    }],
    sql: SUM_SQL,
    params: [],
    expectedColumns: [COL_TOTAL],
    sessionOptions,
  };
}

function buildHeavyJoinRequest(sessionOptions = {}) {
  const rows = Array.from(
    {length: HEAVY_ROW_COUNT},
    (_, idx) => [BigInt(idx + 1)],
  );
  return {
    tables: [{
      tableName: TABLE_NAME,
      schema: {columns: [{name: COL_ID, type: COL_TYPE_INTEGER}]},
      declaredColumns: [COL_ID],
      fragments: [{
        rowSet: encodeTypedRowSet([COL_ID], rows),
      }],
    }],
    sql: STREAMING_HEAVY_JOIN_SQL,
    params: [],
    expectedColumns: [COL_COUNT],
    sessionOptions,
  };
}

function createManualCancellationToken(initiallyCancelled = false) {
  let cancelled = initiallyCancelled;
  const listeners = new Set();
  return {
    isCancelled() {
      return cancelled;
    },
    onCancel(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel() {
      cancelled = true;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

test('CoordinatorMergeProcessPool - pre-start cancellation via AbortSignal and cancellationToken', async (t) => {
  const pool = new CoordinatorMergeProcessPool({maxWorkers: 1});
  try {
    const abortedController = new AbortController();
    abortedController.abort();
    await t.rejects(
      pool.execute(buildSimpleSumRequest({signal: abortedController.signal})),
      {code: QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED},
      'pre-aborted AbortSignal rejects before spawning a worker',
    );
    t.equal(pool.activeCount, 0, 'no active worker count on pre-aborted signal');
    t.equal(pool.idleWorkers.length, 0, 'no worker spawned on pre-aborted signal');

    const cancelledToken = createManualCancellationToken(true);
    await t.rejects(
      pool.execute(buildSimpleSumRequest({cancellationToken: cancelledToken})),
      {code: QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED},
      'pre-cancelled cancellationToken rejects before spawning a worker',
    );
    t.equal(pool.activeCount, 0, 'no active worker count on pre-cancelled token');
    t.equal(pool.idleWorkers.length, 0, 'no worker spawned on pre-cancelled token');
  } finally {
    pool.shutdown();
  }
});

test('CoordinatorMergeProcessPool - queued waiter cancellation under saturation cleans up and lets next waiter succeed', async (t) => {
  const pool = new CoordinatorMergeProcessPool({maxWorkers: 1});
  try {
    const activeWorker = await pool.acquireWorker(
      Date.now() + LONG_DEADLINE_OFFSET_MS,
    );
    t.equal(pool.activeCount, 1, 'pool is saturated by active worker');
    t.equal(pool.activeWorkers.has(activeWorker), true, 'activeWorkers tracks child');

    const waiterToken = createManualCancellationToken(false);
    const queuedCancelledPromise = pool.execute(
      buildSimpleSumRequest({
        deadlineMs: Date.now() + LONG_DEADLINE_OFFSET_MS,
        cancellationToken: waiterToken,
      }),
    );
    const queuedSurvivorPromise = pool.execute(
      buildSimpleSumRequest({
        deadlineMs: Date.now() + LONG_DEADLINE_OFFSET_MS,
      }),
    );

    t.equal(pool.waitQueue.length, 2, 'two requests are parked in waitQueue');
    t.equal(waiterToken.listenerCount(), 1, 'cancellation watcher is attached');

    waiterToken.cancel();
    await t.rejects(
      queuedCancelledPromise,
      {code: QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED},
      'cancelled queued waiter rejects immediately',
    );
    t.equal(
      waiterToken.listenerCount(),
      0,
      'cancelled waiter cleans up its cancellation watcher immediately',
    );
    t.equal(pool.waitQueue.length, 1, 'cancelled waiter is spliced from waitQueue');

    pool.releaseWorker(activeWorker, true);
    const survivorResult = await queuedSurvivorPromise;
    t.same(
      survivorResult.rows,
      [{total: SAMPLE_SUM}],
      'surviving queued request acquires the released worker and succeeds',
    );
    t.equal(pool.activeCount, 0, 'activeCount returns to 0 after survivor completes');
    t.equal(pool.idleWorkers.length, 1, 'worker returns to idleWorkers');
  } finally {
    pool.shutdown();
  }
});

test('CoordinatorMergeProcessPool - handoff-boundary cancellation skips cancelled waiter and preserves worker in idleWorkers', async (t) => {
  const pool = new CoordinatorMergeProcessPool({maxWorkers: 1});
  try {
    const activeWorker = await pool.acquireWorker(
      Date.now() + LONG_DEADLINE_OFFSET_MS,
    );
    const activePid = activeWorker.pid;

    let cancelledAtHandoff = false;
    const queuedPromise = pool.acquireWorker(
      Date.now() + LONG_DEADLINE_OFFSET_MS,
      {
        isCancelled: () => cancelledAtHandoff,
      },
    );
    t.equal(pool.waitQueue.length, 1, 'waiter is queued before handoff');

    // Flip cancellation in the exact synchronous turn before releaseWorker dequeues:
    cancelledAtHandoff = true;
    pool.releaseWorker(activeWorker, true);

    await t.rejects(
      queuedPromise,
      {code: QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED},
      'waiter cancelled at handoff boundary rejects with deadline exceeded',
    );
    t.equal(pool.waitQueue.length, 0, 'waitQueue is empty after skipping cancelled waiter');
    t.equal(pool.activeCount, 0, 'activeCount is decremented rather than leaked');
    t.equal(pool.idleWorkers.length, 1, 'worker is retained in idleWorkers');
    t.equal(pool.idleWorkers[0].pid, activePid, 'same live worker is preserved');

    const followUp = await pool.execute(buildSimpleSumRequest());
    t.same(
      followUp.rows,
      [{total: SAMPLE_SUM}],
      'subsequent request reuses the preserved idle worker and succeeds',
    );
    t.equal(pool.idleWorkers[0]?.pid, activePid, 'no unnecessary respawn occurred');
  } finally {
    pool.shutdown();
  }
});

test('CoordinatorMergeProcessPool - active execution cancellation kills busy worker via SIGKILL and respawns cleanly', async (t) => {
  const pool = new CoordinatorMergeProcessPool({maxWorkers: 1});
  try {
    // Complete a full warm-up merge first so the child worker has finished
    // spawning, loading Node/SQLite, and returning to idleWorkers:
    const warmResult = await pool.execute(buildSimpleSumRequest());
    t.same(warmResult.rows, [{total: SAMPLE_SUM}], 'warm-up merge succeeds');
    t.equal(pool.idleWorkers.length, 1, 'warm worker is in idleWorkers');
    const warmWorker = pool.idleWorkers[0];
    const initialPid = warmWorker.pid;

    let resolveExecutionStarted = null;
    const executionStartedPromise = new Promise((resolve) => {
      resolveExecutionStarted = resolve;
    });
    const controller = new AbortController();
    const heavyPromise = pool.execute(
      buildHeavyJoinRequest({
        signal: controller.signal,
        deadlineMs: Date.now() + LONG_DEADLINE_OFFSET_MS,
        onMergeExecutionStarted: (observation) => {
          resolveExecutionStarted(observation);
        },
      }),
    );

    // Wait for the bounded worker-originated observation emitted after the
    // real child worker process has begun executing the SQLite query and
    // retains an unfinished VDBE iterator (stmt.busy === true):
    const observation = await awaitMergeExecutionStarted(
      heavyPromise,
      executionStartedPromise,
    );
    t.equal(
      observation.type,
      MERGE_EXECUTION_STARTED_MSG_TYPE,
      'worker emitted MERGE_EXECUTION_STARTED observation',
    );
    t.equal(
      observation.pid,
      initialPid,
      'observation originated from the active child worker process',
    );
    t.equal(
      observation.sqliteBusy,
      true,
      'child worker retains an open unfinished SQLite VDBE iterator (stmt.busy)',
    );
    t.equal(
      observation.firstRowStepped,
      true,
      'child worker stepped the first SQLite result row before observation',
    );
    controller.abort();

    await t.rejects(
      heavyPromise,
      {code: QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED},
      'active merge execution rejects when aborted',
    );
    t.equal(warmWorker.killed, true, 'busy worker was terminated via SIGKILL');
    t.equal(pool.activeCount, 0, 'activeCount returns to 0 after SIGKILL');
    t.equal(pool.idleWorkers.length, 0, 'killed worker is never returned to idleWorkers');

    const nextResult = await pool.execute(buildSimpleSumRequest());
    t.same(
      nextResult.rows,
      [{total: SAMPLE_SUM}],
      'next request spawns a fresh worker and succeeds',
    );
    t.equal(pool.idleWorkers.length, 1, 'fresh worker is now in idleWorkers');
    t.not(pool.idleWorkers[0].pid, initialPid, 'fresh worker has a new PID');
  } finally {
    pool.shutdown();
  }
});

test('CoordinatorMergeProcessPool - sendAndWait handles synchronous and callback IPC send errors cleanly', async (t) => {
  const pool = new CoordinatorMergeProcessPool({maxWorkers: 1});
  try {
    const worker = await pool.acquireWorker(
      Date.now() + LONG_DEADLINE_OFFSET_MS,
    );
    const originalSend = worker.send.bind(worker);
    worker.send = (_payload, callback) => {
      callback(new Error(SEND_FAIL_MESSAGE));
      return false;
    };
    try {
      await t.rejects(
        pool.sendAndWait(
          worker,
          {type: INIT_SESSION_MSG_TYPE, sessionOptions: {}, tables: []},
          LONG_DEADLINE_OFFSET_MS,
        ),
        {message: SEND_FAIL_MESSAGE},
        'async child.send callback error settles sendAndWait and cleans up listeners',
      );
      t.equal(
        worker.listenerCount('message'),
        0,
        'message listener is detached after send error',
      );
    } finally {
      worker.send = originalSend;
      pool.releaseWorker(worker, false);
    }
  } finally {
    pool.shutdown();
  }
});

test('CoordinatorMergeProcessPool - shutdown() with active and queued work settles all waiters and kills all workers', async (t) => {
  const pool = new CoordinatorMergeProcessPool({maxWorkers: 1});
  try {
    await pool.execute(buildSimpleSumRequest());
    let resolveExecutionStarted = null;
    const executionStartedPromise = new Promise((resolve) => {
      resolveExecutionStarted = resolve;
    });
    const activePromise = pool.execute(
      buildHeavyJoinRequest({
        deadlineMs: Date.now() + LONG_DEADLINE_OFFSET_MS,
        onMergeExecutionStarted: (observation) => {
          resolveExecutionStarted(observation);
        },
      }),
    );

    const observation = await awaitMergeExecutionStarted(
      activePromise,
      executionStartedPromise,
    );
    t.equal(
      observation.sqliteBusy,
      true,
      'active worker has begun SQLite query execution with an unfinished VDBE iterator',
    );
    const [activeChild] = [...pool.activeWorkers];

    const queuedToken = createManualCancellationToken(false);
    const queuedPromise = pool.execute(
      buildSimpleSumRequest({
        deadlineMs: Date.now() + LONG_DEADLINE_OFFSET_MS,
        cancellationToken: queuedToken,
      }),
    );
    t.equal(pool.waitQueue.length, 1, 'second request is queued in waitQueue');

    pool.shutdown();

    const [activeOutcome, queuedOutcome] = await Promise.allSettled([
      activePromise,
      queuedPromise,
    ]);
    t.equal(activeOutcome.status, 'rejected', 'active execution rejects on shutdown');
    t.equal(queuedOutcome.status, 'rejected', 'queued waiter rejects on shutdown');
    t.equal(
      queuedOutcome.reason?.code,
      QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED,
      'queued waiter rejects with QUERY_EXECUTION_DEADLINE_EXCEEDED',
    );
    t.equal(
      queuedToken.listenerCount(),
      0,
      'queued waiter cancellation watcher is cleaned up on shutdown',
    );
    t.equal(activeChild.killed, true, 'active child process was killed on shutdown');
    t.equal(pool.activeCount, 0, 'pool activeCount is 0 after shutdown');
    t.equal(pool.activeWorkers.size, 0, 'pool activeWorkers is empty after shutdown');
    t.equal(pool.idleWorkers.length, 0, 'pool idleWorkers is empty after shutdown');
  } finally {
    pool.shutdown();
  }
});
