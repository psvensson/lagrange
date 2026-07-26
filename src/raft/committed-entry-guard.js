import {isDeepStrictEqual} from 'node:util';

import {RAFT_ERROR_CODE} from './constants.js';

const CONFLICT_ERROR_NAME = 'RaftCommittedEntryConflictError';
const CONFLICT_MESSAGE = 'Refused to replace committed Raft entry identity';
const RAFT_COMMITTED_ENTRY_CONFLICT_CODE =
  RAFT_ERROR_CODE.COMMITTED_ENTRY_CONFLICT;
const COMMITTED_ENTRY_WRITE_OUTCOME = Object.freeze({
  WRITE: 'write',
  IDEMPOTENT: 'idempotent',
  COMPACTED: 'compacted',
});

class RaftCommittedEntryConflictError extends Error {
  constructor(existing, incoming, committedIndex) {
    super(
      `${CONFLICT_MESSAGE}: index=${incoming?.index} committedIndex=${committedIndex}`,
    );
    this.name = CONFLICT_ERROR_NAME;
    this.code = RAFT_COMMITTED_ENTRY_CONFLICT_CODE;
    this.index = incoming?.index ?? null;
    this.committedIndex = committedIndex;
    this.existingTerm = existing?.term ?? null;
    this.incomingTerm = incoming?.term ?? null;
  }
}

function committedEntryIdentityMatches(existing, incoming) {
  return existing?.index === incoming?.index &&
    existing?.term === incoming?.term &&
    isDeepStrictEqual(existing?.command, incoming?.command);
}

function guardCommittedEntryWrite(
  existing, incoming, committedIndex, lastIncludedIndex = 0,
) {
  if (!Number.isFinite(incoming?.index) ||
    !Number.isFinite(committedIndex) ||
    incoming.index > committedIndex) {
    return {outcome: COMMITTED_ENTRY_WRITE_OUTCOME.WRITE};
  } else if (existing && committedEntryIdentityMatches(existing, incoming)) {
    return {
      outcome: COMMITTED_ENTRY_WRITE_OUTCOME.IDEMPOTENT,
      entry: existing,
    };
  } else if (!existing &&
    Number.isFinite(lastIncludedIndex) &&
    incoming.index <= lastIncludedIndex) {
    // Compacted by a snapshot install: the entry's effects are durably
    // inside the installed state-machine image, its bytes are legitimately
    // gone. Accepting as an idempotent no-op is the Raft-correct answer; a
    // MISSING entry above the boundary stays a conflict (that is real
    // committed-history loss).
    return {outcome: COMMITTED_ENTRY_WRITE_OUTCOME.COMPACTED};
  }
  throw new RaftCommittedEntryConflictError(existing, incoming, committedIndex);
}

function isRaftCommittedEntryConflict(error) {
  return error?.code === RAFT_COMMITTED_ENTRY_CONFLICT_CODE;
}

export {
  COMMITTED_ENTRY_WRITE_OUTCOME,
  RAFT_COMMITTED_ENTRY_CONFLICT_CODE,
  guardCommittedEntryWrite,
  isRaftCommittedEntryConflict,
};
