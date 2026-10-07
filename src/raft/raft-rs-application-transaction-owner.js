import {RAFT_RS_ENTRY_TYPE} from './raft-rs-ready-loop-constants.js';

const ASYNC_APPLICATION_CALLBACK_ERROR =
  'a committed-entry callback must complete inside its SQLite transaction';
const MEMBERSHIP_CONTEXT_APPLIER_REQUIRED =
  'committed membership context requires a registry applier';
const ASYNC_MEMBERSHIP_CONTEXT_APPLIER_ERROR =
  'a committed membership context applier must complete inside its SQLite ' +
  'transaction';

// Only a NORMAL entry that carries a payload is a proposed command. A
// configuration change stays with the runtime, and the empty entry a new
// leader appends carries no payload.
function carriesProposedCommand(entry) {
  return entry.entryType === RAFT_RS_ENTRY_TYPE.NORMAL &&
    typeof entry.data === 'string' && entry.data.length > 0;
}

// Each deferred effect is isolated: an effect cannot reverse the transaction
// it follows, and one failing effect must not starve the others. The
// application that scheduled an effect owns reporting its failure; the owner
// counts what escaped anyway.
function runIsolatedEffects(effects) {
  let escapedFailures = 0;
  for (const effect of effects) {
    try {
      effect();
    } catch {
      escapedFailures += 1;
    }
  }
  return escapedFailures;
}

/**
 * Apply one committed entry and advance the durable applied state in one
 * SQLite transaction. The application receives the entry's bytes and its
 * position `{index, term, effects}`; `effects.afterCommit` runs after the
 * transaction commits and `effects.afterRollback` runs when it rolls back,
 * before the failure is rethrown. The whole transaction (begin, application,
 * applied-state write, commit) runs inside `runApplySlice` when one is
 * supplied (the host's apply-slice charge, injected so this owner imports
 * no diagnostics); the deferred effects run outside it.
 * @param {Object} options - The store, group, entry, configuration, the
 *   application callback, whether the entry admits this replica (its
 *   participation gate's admission index is written with it), and the
 *   optional `runApplySlice(work)`.
 * @return {{escapedEffectFailures: number}} How many post-commit effects
 *   threw past the application's own reporting.
 */
function applyCommittedEntryTransaction({store, groupId, entry, confState,
  membershipGenerationIndex, applyCommittedEntry, admitted = false,
  committedMembershipContext = null, applyCommittedMembershipContext = null,
  runApplySlice = null}) {
  if (committedMembershipContext !== null &&
      typeof applyCommittedMembershipContext !== 'function') {
    throw new Error(MEMBERSHIP_CONTEXT_APPLIER_REQUIRED);
  }
  const effects = {afterCommit: [], afterRollback: []};
  const transact = () => store.transaction(() => {
    if (carriesProposedCommand(entry) &&
        typeof applyCommittedEntry === 'function') {
      const applied = applyCommittedEntry(Buffer.from(entry.data, 'base64'),
        {index: entry.index, term: entry.term, effects});
      if (applied && typeof applied.then === 'function') {
        throw new TypeError(ASYNC_APPLICATION_CALLBACK_ERROR);
      }
    }
    if (committedMembershipContext !== null) {
      const appliedMembership =
        applyCommittedMembershipContext(committedMembershipContext);
      if (appliedMembership && typeof appliedMembership.then === 'function') {
        throw new TypeError(ASYNC_MEMBERSHIP_CONTEXT_APPLIER_ERROR);
      }
    }
    store.putAppliedState(groupId, entry.index, confState, undefined,
      membershipGenerationIndex);
    // The entry that admitted this replica as a voter: its index is the
    // participation gate's admission index, durable with the entry itself.
    if (admitted) {
      store.putAdmissionIndex(groupId, entry.index);
    }
  });
  try {
    if (typeof runApplySlice === 'function') {
      runApplySlice(transact);
    } else {
      transact();
    }
  } catch (error) {
    runIsolatedEffects(effects.afterRollback);
    throw error;
  }
  return Object.freeze({
    escapedEffectFailures: runIsolatedEffects(effects.afterCommit),
  });
}

export {applyCommittedEntryTransaction};
