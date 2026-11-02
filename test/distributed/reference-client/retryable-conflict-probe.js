// The ONE retryable-conflict probe of the benchmark chain, wire-agnostic: two
// concurrent logical requests read one warehouse row and update it from that
// read; the loser's request runs through the retry owner (a retryable
// conflict is retried in a fresh transaction, nothing else is). The probe
// reports what happened - the mechanism, the loser's SQLSTATE, whether its
// retry committed and the row before and after - and the retryable-conflict
// case evaluates the semantic profile's observable contract on it
// (coordinator decision 5, 2026-11-02). Each wire (pg-wire for Lagrange and
// PostgreSQL, mysql for TiDB) supplies only its sessions and statement text.
import {
  classifyOltpAttemptError,
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';

const ONE = 1;
const MECHANISM = Object.freeze({
  BLOCKING_THEN_COMMIT: 'blocking-then-commit',
  SERIALIZATION_CONFLICT: 'serialization-conflict',
  OTHER_ERROR: 'other-error',
});

async function quietly(action) {
  try {
    await action();
  } catch {
    // Cleanup after the observation: its failure is not the conflict signal.
  }
}

// The loser's logical request: its first attempt is the open transaction; a
// retried attempt opens a fresh one.
async function runLoserRequest(session, statements, parameters, retrySleep) {
  let firstError = null;
  try {
    const outcome = await executePairedOltpTransactionWithRetry({
      sleep: retrySleep,
      executeAttempt: async ({attempts}) => {
        try {
          if (attempts > ONE) await session.begin();
          await session.query(statements.update, parameters);
          await session.commit();
        } catch (error) {
          if (!firstError) firstError = error;
          await quietly(() => session.rollback());
          throw error;
        }
      },
    });
    return {firstError, retry: outcome.evidence, retryCommitted: firstError ? true : null};
  } catch (error) {
    return {firstError, retry: error?.oltpRetryEvidence ?? null, retryCommitted: false};
  }
}

function mechanismOf(victim) {
  if (!victim) return MECHANISM.BLOCKING_THEN_COMMIT;
  return classifyOltpAttemptError({sqlState: victim.sqlState}).retryable ?
    MECHANISM.SERIALIZATION_CONFLICT : MECHANISM.OTHER_ERROR;
}

async function readYtd(session, statements, warehouseId) {
  const rows = await session.query(statements.read, [warehouseId]);
  return Number(rows[0].ytd_cents);
}

/**
 * @param {{openSession: Function, statements: {read: string, update: string},
 *   describeError: Function, warehouseId: number, delta: number,
 *   retrySleep?: Function}} input openSession() => {query(sql, params) =>
 *   rows, begin(), commit(), rollback(), end()}; describeError(error, side)
 *   => {sqlState, ...}
 * @return {Promise<{observation: Object, victim: Object|null, results: Array}>}
 */
async function runRetryableConflictProbe({openSession, statements, describeError, warehouseId,
  delta, retrySleep}) {
  const sessions = [];
  const open = async () => {
    const session = await openSession();
    sessions.push(session);
    return session;
  };
  try {
    const [left, right, observer] = [await open(), await open(), await open()];
    const baseline = await readYtd(observer, statements, warehouseId);
    await left.begin();
    await right.begin();
    await left.query(statements.read, [warehouseId]);
    await right.query(statements.read, [warehouseId]);
    await left.query(statements.update, [delta, warehouseId]);
    await left.commit();
    const loser = await runLoserRequest(right, statements, [delta, warehouseId], retrySleep);
    const final = await readYtd(observer, statements, warehouseId);
    const victim = loser.firstError ? describeError(loser.firstError, 'right') : null;
    const observation = Object.freeze({mechanism: mechanismOf(victim),
      victimSqlState: victim?.sqlState ?? null, retryCommitted: loser.retryCommitted,
      retry: loser.retry ? Object.freeze({attempts: loser.retry.attempts,
        retries: loser.retry.retries}) : null,
      effects: Object.freeze({baseline, final, delta})});
    const results = Object.freeze([
      Object.freeze({side: 'left', succeeded: true, error: null}),
      Object.freeze({side: 'right', succeeded: loser.retryCommitted !== false, error: victim}),
    ]);
    return Object.freeze({observation, victim, results});
  } finally {
    for (const session of sessions.slice(0, 2)) await quietly(() => session.rollback());
    for (const session of sessions) await quietly(() => session.end());
  }
}

export {runRetryableConflictProbe};
