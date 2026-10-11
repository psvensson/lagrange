/** Canonical retained participant bytes, shared by query admission and committed settlement. */
import {participantIdOf} from
  '../../partition/partition-participant-transaction-bytes.js';

function participantSetTextOf(transactionId, partitionIds) {
  return JSON.stringify(Array.from(new Set(partitionIds)).sort().map((partitionId) =>
    [participantIdOf(transactionId, partitionId), partitionId]));
}

function readParticipantSet(transactionId, text) {
  if (typeof text !== 'string') return null;
  try {
    const pairs = JSON.parse(text);
    if (!Array.isArray(pairs) || pairs.some((pair) => !Array.isArray(pair) ||
      pair.length !== 2 || typeof pair[1] !== 'string' || pair[1].length === 0 ||
      pair[0] !== participantIdOf(transactionId, pair[1]))) return null;
    return participantSetTextOf(transactionId, pairs.map((pair) => pair[1])) === text ?
      Object.freeze(pairs.map((pair) => Object.freeze(pair))) : null;
  } catch {
    // Invalid owner bytes cannot authorize a partial or empty set.
    return null;
  }
}

export {participantSetTextOf, readParticipantSet};
