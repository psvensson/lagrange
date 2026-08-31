import {performance} from 'node:perf_hooks';
import {
  trackRaftFollowerCommitApplySlice,
} from '../diagnostics/raft-churn-sync-sections.js';

const COMMIT_APPLY_SLICE_MAX_ENTRIES = 16;
const COMMIT_APPLY_SLICE_BUDGET_MS = 50;
const RAFT_COMMIT_EVENT = 'commit';
const RAFT_COMMIT_APPLY_ROLLBACK_EVENT = 'commit apply rollback';
const RAFT_COMMIT_APPLY_EFFECT_FAILURE_EVENT =
  'commit apply effect failure';
const NO_DURABLE_PROGRESS_MESSAGE =
  'Raft commit/apply slice made no durable progress';
const SUPPRESSED_OBSERVER_ERROR_COUNT =
  '_commitApplySuppressedObserverErrorCount';
const performanceNow = performance.now.bind(performance);

function createCommitApplyEffects() {
  return {afterCommit: [], afterRollback: []};
}

function recordSuppressedObserverError(raft) {
  const count = raft[SUPPRESSED_OBSERVER_ERROR_COUNT];
  raft[SUPPRESSED_OBSERVER_ERROR_COUNT] =
    Number.isSafeInteger(count) && count >= 0 ? count + 1 : 1;
}

function runDeferredEffects(raft, effects) {
  for (const effect of effects) {
    try {
      effect();
    } catch (error) {
      try {
        raft.emit(RAFT_COMMIT_APPLY_EFFECT_FAILURE_EVENT, error);
      } catch {
        // An observer cannot reverse the already-durable apply transaction.
        recordSuppressedObserverError(raft);
      }
    }
  }
}

function applyCommitCommand(raft, command, effects) {
  if (typeof raft.prepareCommitApply === 'function') {
    return raft.prepareCommitApply(command, effects);
  }
  return raft.emit(RAFT_COMMIT_EVENT, command);
}

function yieldEventLoopTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

// `commitAndApplySlice` answers an empty slice for a CLOSED log (its
// single-writer contract: a closed adapter owns no transaction to commit in).
// That is node teardown, not a stalled apply loop, so the scheduler must stop
// rather than raise NO_DURABLE_PROGRESS - the raised rejection escapes as a
// detached unhandledRejection whenever a caller ignores the returned promise.
function isClosedCommitLog(log) {
  return typeof log?.isOpen === 'function' && log.isOpen() === false;
}

function readCommittedIndex(log) {
  if (typeof log?.getCommittedIndex === 'function') {
    return Number(log.getCommittedIndex()) || 0;
  }
  return Number(log?.committedIndex) || 0;
}

function pendingCommittedEntries(log, entries) {
  const committedIndex = readCommittedIndex(log);
  return entries.filter((entry) => entry.index > committedIndex);
}

function emitCommitApplyRollback(raft, error) {
  try {
    raft.emit(RAFT_COMMIT_APPLY_ROLLBACK_EVENT, error);
  } catch {
    // Preserve the apply error that caused the SQLite transaction rollback.
    recordSuppressedObserverError(raft);
  }
}

async function commitAndApplyEntries(raft, entries) {
  let pending = pendingCommittedEntries(raft.log, entries);
  while (pending.length > 0) {
    let applied;
    const effects = createCommitApplyEffects();
    try {
      applied = trackRaftFollowerCommitApplySlice(() =>
        raft.log.commitAndApplySlice(pending, {
          apply: (command) => applyCommitCommand(raft, command, effects),
          budgetMs: COMMIT_APPLY_SLICE_BUDGET_MS,
          maxEntries: COMMIT_APPLY_SLICE_MAX_ENTRIES,
          now: performanceNow,
        }),
      );
    } catch (error) {
      emitCommitApplyRollback(raft, error);
      runDeferredEffects(raft, effects.afterRollback);
      throw error;
    }
    if (!Array.isArray(applied) || applied.length === 0) {
      if (isClosedCommitLog(raft.log)) {
        return;
      }
      throw new Error(NO_DURABLE_PROGRESS_MESSAGE);
    }
    runDeferredEffects(raft, effects.afterCommit);
    pending = pendingCommittedEntries(raft.log, pending);
    if (pending.length > 0) {
      await yieldEventLoopTurn();
    }
  }
}

function enqueueCommitApply(raft, entries) {
  const apply = () => commitAndApplyEntries(raft, entries);
  const prior = raft._commitApplyTail || Promise.resolve();
  const current = prior.then(apply, apply);
  raft._commitApplyTail = current.catch(() => undefined);
  return current;
}

/**
 * Serialize SQLite commit/application, drop already-committed overlap, and
 * atomically commit+apply bounded wall-time slices. A thrown apply rolls back
 * the whole slice and emits a cache-refresh hook before the rejection escapes.
 * @param {Object} raft
 * @param {Array} entries
 * @param {Function} fallback
 * @return {Promise<void>|*}
 */
function commitEntriesCooperatively(raft, entries, fallback) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return Promise.resolve();
  }
  if (typeof raft.log?.commitAndApplySlice !== 'function') {
    return fallback(entries);
  }
  return enqueueCommitApply(raft, entries);
}

export {
  COMMIT_APPLY_SLICE_BUDGET_MS,
  RAFT_COMMIT_APPLY_ROLLBACK_EVENT,
  commitEntriesCooperatively,
};
