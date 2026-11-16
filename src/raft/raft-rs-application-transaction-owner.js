import {RAFT_RS_ENTRY_TYPE} from './raft-rs-ready-loop-constants.js';

const MEMBERSHIP_CONTEXT_APPLIER_REQUIRED =
  'committed membership context requires a registry applier';
const ANSWERING_MEMBERSHIP_CONTEXT_APPLIER_ERROR =
  'a committed membership context applier must complete inside its SQLite ' +
  'transaction and answer nothing';
const MULTI_ENTRY_SLICE_BOUNDARY_ERROR =
  'multi-entry application slice must contain only normal un-admitted entries';
const COMMITTED_ENTRIES_ARRAY_ERROR = 'committed entries must be an array';
const START_INDEX_RANGE_ERROR =
  'startIndex must be a non-negative safe integer';
const MAX_NORMAL_SLICE_RANGE_ERROR =
  'maxNormalSlice must be a positive safe integer';
const COMMITTED_ENTRIES_SLICE_ARRAY_ERROR =
  'committed entries slice must be an array';
const MAX_NORMAL_APPLY_SLICE = 64;
const PAYLOAD_ENCODING = 'base64';

function isNormalCommittedEntry(entry) {
  return entry?.entryType === RAFT_RS_ENTRY_TYPE.NORMAL;
}

// Only a NORMAL entry that carries a payload is a proposed command. A
// configuration change stays with the runtime, and the empty entry a new
// leader appends carries no payload.
function carriesProposedCommand(entry) {
  return isNormalCommittedEntry(entry) &&
    typeof entry.data === 'string' && entry.data.length > 0;
}

function assertValidSliceInputs(entries, startIndex, maxNormalSlice) {
  if (!Array.isArray(entries)) {
    throw new TypeError(COMMITTED_ENTRIES_ARRAY_ERROR);
  }
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
    throw new RangeError(START_INDEX_RANGE_ERROR);
  }
  if (!Number.isSafeInteger(maxNormalSlice) || maxNormalSlice < 1) {
    throw new RangeError(MAX_NORMAL_SLICE_RANGE_ERROR);
  }
}

/**
 * Select the next contiguous application slice starting at `startIndex`.
 * Normal entries batch up to `maxNormalSlice`, stopping before any config,
 * membership, or other non-normal entry; a non-normal entry is always a
 * single-entry slice so configuration/gate transitions stay isolated.
 * @param {Array<Object>} entries - Committed entries in log order.
 * @param {number} [startIndex=0] - Starting offset in `entries`.
 * @param {number} [maxNormalSlice=64] - Maximum normal entries in one slice.
 * @return {Array<Object>} Contiguous entry slice (empty when exhausted).
 */
function nextCommittedEntrySlice(
  entries,
  startIndex = 0,
  maxNormalSlice = MAX_NORMAL_APPLY_SLICE,
) {
  assertValidSliceInputs(entries, startIndex, maxNormalSlice);
  if (startIndex >= entries.length) {
    return [];
  }
  const first = entries[startIndex];
  if (!isNormalCommittedEntry(first)) {
    return [first];
  }
  const endLimit = Math.min(entries.length, startIndex + maxNormalSlice);
  let endIndex = startIndex + 1;
  while (endIndex < endLimit && isNormalCommittedEntry(entries[endIndex])) {
    endIndex += 1;
  }
  return entries.slice(startIndex, endIndex);
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

function validateEntrySlice({entries, committedMembershipContext,
  applyCommittedMembershipContext, admitted}) {
  if (committedMembershipContext !== null &&
      typeof applyCommittedMembershipContext !== 'function') {
    throw new Error(MEMBERSHIP_CONTEXT_APPLIER_REQUIRED);
  }
  if (entries.length > 1 && (admitted ||
      committedMembershipContext !== null ||
      entries.some((entry) => !isNormalCommittedEntry(entry)))) {
    throw new Error(MULTI_ENTRY_SLICE_BOUNDARY_ERROR);
  }
}

function applySliceEntries(entries, applyCommittedEntry, effects) {
  if (typeof applyCommittedEntry !== 'function') {
    return;
  }
  for (const entry of entries) {
    if (carriesProposedCommand(entry)) {
      applyCommittedEntry(Buffer.from(entry.data, PAYLOAD_ENCODING),
        {index: entry.index, term: entry.term, effects});
    }
  }
}

function applyCommittedMembershipContextInTx(
  committedMembershipContext, applyCommittedMembershipContext, entry,
) {
  // The membership applier records its registry facts and answers nothing
  // (undefined on every path); any answer - a promise above all - would be
  // work this transaction cannot contain.
  if (committedMembershipContext !== null &&
      applyCommittedMembershipContext(committedMembershipContext,
        Object.freeze({index: entry.index, term: entry.term})) !== undefined) {
    throw new TypeError(ANSWERING_MEMBERSHIP_CONTEXT_APPLIER_ERROR);
  }
}

const DIRECT_APPLY_SLICE = (transact) => transact();

function runCommittedSliceTransaction(transact, runApplySlice, effects) {
  const executeSlice = runApplySlice === null ? DIRECT_APPLY_SLICE : runApplySlice;
  try {
    executeSlice(transact);
  } catch (error) {
    runIsolatedEffects(effects.afterRollback);
    throw error;
  }
}

/**
 * Apply a contiguous slice of committed entries and advance the durable
 * applied state in one SQLite transaction. Non-normal/admitting/membership
 * entries must pass as a 1-entry slice. Any failure rolls back the entire
 * SQLite transaction, runs every scheduled `afterRollback` effect, and
 * rethrows; on commit, scheduled `afterCommit` effects run in order outside
 * `runApplySlice`.
 * @param {Object} options - Slice transaction inputs.
 * @return {{escapedEffectFailures: number}} How many post-commit effects
 *   threw past the application's own reporting.
 */
function applyCommittedEntrySliceTransaction({store, groupId, entries,
  confState, membershipGenerationIndex, applyCommittedEntry, admitted = false,
  committedMembershipContext = null, applyCommittedMembershipContext = null,
  runApplySlice = null}) {
  if (!Array.isArray(entries)) {
    throw new TypeError(COMMITTED_ENTRIES_SLICE_ARRAY_ERROR);
  }
  if (entries.length === 0) {
    return Object.freeze({escapedEffectFailures: 0});
  }
  validateEntrySlice({entries, committedMembershipContext,
    applyCommittedMembershipContext, admitted});
  const effects = {afterCommit: [], afterRollback: []};
  const lastEntry = entries[entries.length - 1];
  const transact = () => store.transaction(() => {
    applySliceEntries(entries, applyCommittedEntry, effects);
    applyCommittedMembershipContextInTx(committedMembershipContext,
      applyCommittedMembershipContext, lastEntry);
    store.putAppliedState(groupId, lastEntry.index, confState, undefined,
      membershipGenerationIndex);
    // The entry that admitted this replica as a voter: its index is the
    // participation gate's admission index, durable with the entry itself.
    if (admitted) {
      store.putAdmissionIndex(groupId, lastEntry.index);
    }
  });
  runCommittedSliceTransaction(transact, runApplySlice, effects);
  return Object.freeze({
    escapedEffectFailures: runIsolatedEffects(effects.afterCommit),
  });
}

export {
  MAX_NORMAL_APPLY_SLICE,
  applyCommittedEntrySliceTransaction,
  nextCommittedEntrySlice,
};
