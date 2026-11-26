import {createHash} from 'node:crypto';

const HASH_ALGORITHM = 'sha1';
const DIGEST_ENCODING = 'hex';
const DIGEST_PREFIX_LENGTH = 16;
const PARTICIPANT_ENTRY_ID_PREFIX = 'dwrite-participant-';

/**
 * The entryId one logical write is proposed under on one partition: derived
 * from the write's idempotency key and the partition, so every attempt of
 * the write - an engine retry, a caller's re-drive under the same key, a
 * local-leader leg - is the same committed entry (the one derivation of a
 * write's entry identity).
 * @param {string} idempotencyKey - The logical write's key.
 * @param {string} partitionId - The participant partition.
 * @return {string} The participant entryId.
 */
function deriveParticipantEntryId(idempotencyKey, partitionId) {
  const entryIdentityDigest = createHash(HASH_ALGORITHM)
    .update(JSON.stringify({idempotencyKey, partitionId}))
    .digest(DIGEST_ENCODING)
    .slice(0, DIGEST_PREFIX_LENGTH);
  return `${PARTICIPANT_ENTRY_ID_PREFIX}${entryIdentityDigest}`;
}

export {deriveParticipantEntryId};
