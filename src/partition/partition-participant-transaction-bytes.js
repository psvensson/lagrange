// The pinned bytes of a participant transaction (TX1 design revision 10,
// sections 2.1, 2.3, 2.4 and 0.0.13): the one owner of how its identity is
// checked, how its digests, validation text and entryIds are formed, when a
// decision is bound to the decision record it names, and the byte form of the
// three committed commands. Pure functions of their inputs: the leader builds a
// command with them, the admission owner refuses one not in the pinned form
// before it is proposed, and every replica applying a committed command
// computes the same answer from the same bytes.
//
// Trust boundary (owner decision): a digest computed here establishes content
// identity, not authentication. A decision is authoritative because it comes
// through the trusted coordinator route after its insert-once decision record;
// the participant never adds a second decision lookup during committed apply.

import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {
  PARTICIPANT_TRANSACTION_BYTES as BYTES,
  PARTICIPANT_TRANSACTION_COMMAND as COMMAND,
  PARTICIPANT_TRANSACTION_DECISION as DECISION,
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
} from './partition-participant-transaction-constants.js';

import {isExecutionEnvelope} from './partition-transaction-execution-envelope.js';

const DECISIONS = Object.freeze(Object.values(DECISION));
const INVALID_DECISION_RECORD = null;
const numberIsSafeInteger = Number.isSafeInteger;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function sha256Hex(text) {
  return createHash(BYTES.DIGEST_ALGORITHM).update(text)
    .digest(BYTES.DIGEST_ENCODING);
}

function preparedDigestOf(operationsText, validationText) {
  return sha256Hex(
    `${operationsText}${BYTES.PREPARED_DIGEST_SEPARATOR}${validationText}`);
}

/**
 * The conflict evidence a PREPARE carries: the partition, the digest of the
 * write generation the transaction's base was read at, and the log index of
 * the generation origin that g counts from (design 0.0.13).
 * @param {number} generation - The write generation g.
 * @param {string} partitionId - The partition.
 * @param {number} originIndex - The generation origin's log index.
 * @return {string} The validation text.
 */
function validationTextOf(generation, partitionId, originIndex) {
  return JSON.stringify([[BYTES.VALIDATION_SCOPE, partitionId,
    sha256Hex(`${BYTES.GENERATION_DIGEST_PREFIX}${generation}`), originIndex]]);
}

function generationOriginEntryIdOf(partitionId) {
  return `${partitionId}${BYTES.IDENTITY_SEPARATOR}` +
    BYTES.GENERATION_ORIGIN_ENTRY_SUFFIX;
}

function participantIdOf(transactionId, partitionId) {
  return `${transactionId}${BYTES.IDENTITY_SEPARATOR}${partitionId}`;
}

function prepareEntryIdOf(participantId) {
  return `${participantId}${BYTES.IDENTITY_SEPARATOR}` +
    BYTES.PREPARE_ENTRY_SUFFIX;
}

function decisionEntryIdOf(participantId, decisionDigest) {
  return [participantId, BYTES.DECISION_ENTRY_SUFFIX, decisionDigest]
    .join(BYTES.IDENTITY_SEPARATOR);
}

function operationOutcomeKeyOf(participantId, ordinal) {
  return [BYTES.OPERATION_OUTCOME_PREFIX, participantId, ordinal]
    .join(BYTES.IDENTITY_SEPARATOR);
}

/**
 * Whether a request or command names this partition's participant exactly
 * (design 2.1): null when it does, else the typed code.
 * @param {Object} carrier - A request or a committed command.
 * @param {string} partitionId - This partition.
 * @return {string|null} IDENTITY_REQUIRED, IDENTITY_MISMATCH or null.
 */
function identityRefusalOf(carrier, partitionId) {
  if (!isNonEmptyString(carrier?.transactionId) ||
      !isNonEmptyString(carrier?.participantId) ||
      !isNonEmptyString(carrier?.commitMode) ||
      !numberIsSafeInteger(carrier?.transactionEpoch)) {
    return CODE.IDENTITY_REQUIRED;
  }
  return carrier.participantId ===
    participantIdOf(carrier.transactionId, partitionId) ?
    null : CODE.IDENTITY_MISMATCH;
}

function parsedJsonOf(text) {
  if (typeof text !== 'string') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_unparsable) {
    // Malformed text is an answer (the caller's typed refusal), not a throw.
    return null;
  }
}

function isOperation(value) {
  return value !== null && typeof value === 'object' &&
    typeof value.sql === 'string' && Array.isArray(value.params);
}

/**
 * The generation origin a PREPARE's validation text names: the log index its
 * write generation counts from, or null when the text names none.
 * @param {*} validationText - The carried text.
 * @return {number|null} The origin's log index.
 */
function carriedOriginIndexOf(validationText) {
  const parsed = parsedJsonOf(validationText);
  const originIndex = Array.isArray(parsed) && Array.isArray(parsed[0]) ?
    parsed[0][3] : null;
  return Number.isSafeInteger(originIndex) ? originIndex : null;
}

/**
 * The operations a PREPARE carries, read from its text: an array of
 * {entryId, sql, params}, or null when the text is not that.
 * @param {*} operationsText - The carried text.
 * @return {Array<Object>|null} The operations.
 */
function operationsOf(operationsText) {
  const parsed = parsedJsonOf(operationsText);
  return Array.isArray(parsed) && parsed.every(isOperation) ? parsed : null;
}

function validDecisionParticipants(record) {
  if (!Array.isArray(record.participants)) return false;
  const prefix = `${record.transactionId}${BYTES.IDENTITY_SEPARATOR}`;
  return record.participants.every((entry, index, entries) =>
    Array.isArray(entry) && entry.length === 2 &&
    isNonEmptyString(entry[0]) && entry[0].startsWith(prefix) &&
    entry[0].length > prefix.length &&
    (index === 0 || entries[index - 1][0] < entry[0]) &&
    (isNonEmptyString(entry[1]) ||
      (record.decision === DECISION.ROLLBACK && entry[1] === null)));
}

/**
 * Consume the exact canonical immutable decision bytes, validating the
 * complete participant set, not just the local binding. Missing, malformed,
 * duplicate, unsorted or mismatched content returns null (never a decision).
 * @param {Object} binding - Text/digest and optional expected transaction/decision.
 * @return {Object|null} Deeply frozen record, including text and digest.
 */
function canonicalDecisionRecord(binding) {
  const record = parsedJsonOf(binding?.decisionText);
  if (!isNonEmptyString(record?.transactionId) ||
      !DECISIONS.includes(record.decision) ||
      !validDecisionParticipants(record) ||
      (binding.transactionId !== undefined &&
        binding.transactionId !== record.transactionId) ||
      (binding.decision !== undefined && binding.decision !== record.decision)) {
    return INVALID_DECISION_RECORD;
  }
  const {transactionId, decision, participants} = record;
  const decisionText = JSON.stringify({transactionId, decision, participants});
  if (decisionText !== binding.decisionText ||
      sha256Hex(decisionText) !== binding.decisionDigest) {
    return INVALID_DECISION_RECORD;
  }
  return Object.freeze({transactionId, decision,
    participants: Object.freeze(participants.map((entry) => Object.freeze(entry))),
    decisionText, decisionDigest: binding.decisionDigest});
}

/**
 * Produce exactly the decision bytes the canonical reader accepts.
 * @param {string} transactionId
 * @param {string} decision
 * @param {Iterable<Array>} participants - [participantId, preparedDigest|null].
 * @return {Object|null} Frozen record, or null for invalid input.
 */
function buildDecisionRecord(transactionId, decision, participants) {
  if (!participants || typeof participants[Symbol.iterator] !== 'function') {
    return INVALID_DECISION_RECORD;
  }
  const entries = Array.from(participants, (entry) =>
    Array.isArray(entry) ? [...entry] : entry)
    .sort((left, right) =>
      left?.[0] < right?.[0] ? -1 : left?.[0] > right?.[0] ? 1 : 0);
  const decisionText = JSON.stringify({transactionId, decision,
    participants: entries});
  return canonicalDecisionRecord({decisionText,
    decisionDigest: sha256Hex(decisionText)});
}

// Exactly one entry for this participant, whose digest is the one the
// decision carries; only a ROLLBACK may carry none.
function namesPreparedContent(record, binding) {
  const preparedDigest = binding.preparedDigest ?? null;
  const entries = record?.participants.filter((entry) =>
    entry[0] === binding.participantId) || [];
  return entries.length === 1 && (entries[0][1] ?? null) === preparedDigest &&
    (binding.decision === DECISION.ROLLBACK || isNonEmptyString(preparedDigest));
}

/**
 * Whether a decision is bound to the decision record it carries (design
 * 2.4): its text hashes to its digest and names this transaction, the same
 * decision and exactly one entry for this participant, whose digest is the
 * prepared digest the decision carries (null only on a ROLLBACK). Whether that
 * digest is the PREPARED row's is the row's question, asked by the caller.
 * @param {Object} binding - {transactionId, participantId, decision,
 *   preparedDigest, decisionText, decisionDigest}.
 * @return {string|null} DECISION_BINDING_REQUIRED, DECISION_DIGEST_MISMATCH
 *   or null.
 */
function decisionBindingRefusalOf(binding) {
  if (!isNonEmptyString(binding?.decisionDigest)) {
    return CODE.DECISION_BINDING_REQUIRED;
  }
  const record = canonicalDecisionRecord(binding);
  return record &&
    namesPreparedContent(record, binding) ?
    null : CODE.DECISION_DIGEST_MISMATCH;
}

/**
 * Whether a bound decision names the PREPARED row's content (design 2.4): a
 * COMMIT carries exactly the row's prepared digest; a ROLLBACK carries it or
 * none.
 * @param {Object} decision - {decision, preparedDigest}.
 * @param {Object} row - The PREPARED row ({preparedDigest}).
 * @return {boolean} Whether the decision binds this row.
 */
function decisionMatchesPreparedRow(decision, row) {
  const preparedDigest = decision.preparedDigest ?? null;
  return preparedDigest === row.preparedDigest ||
    (decision.decision === DECISION.ROLLBACK && preparedDigest === null);
}

function identityFieldsOf(identity) {
  return {
    sessionId: identity.sessionId ?? null,
    transactionId: identity.transactionId,
    participantId: identity.participantId,
    commitMode: identity.commitMode,
    transactionEpoch: identity.transactionEpoch,
  };
}

/**
 * The PARTICIPANT_PREPARE command the leader proposes (design 2.3).
 * @param {Object} identity - The request's identity fields.
 * @param {Object} carried - {operationsText, validationText}.
 * @param {Object} stamp - {timestamp, proposedBy, proposedAt}.
 * @return {Object} The command.
 */
function buildPrepareCommand(identity, {operationsText, validationText},
  stamp) {
  return {
    type: COMMAND.PREPARE,
    entryId: prepareEntryIdOf(identity.participantId),
    ...identityFieldsOf(identity),
    operationsText,
    validationText,
    preparedDigest: preparedDigestOf(operationsText, validationText),
    ...stamp,
  };
}

/**
 * The PARTICIPANT_DECISION command the leader proposes (design 2.3): the
 * binding and no operations.
 * @param {Object} identity - The request's identity fields.
 * @param {Object} binding - {decision, preparedDigest, decisionText,
 *   decisionDigest}.
 * @param {Object} stamp - {timestamp, proposedBy, proposedAt}.
 * @return {Object} The command.
 */
function buildDecisionCommand(identity, binding, stamp) {
  return {
    type: COMMAND.DECISION,
    entryId: decisionEntryIdOf(identity.participantId, binding.decisionDigest),
    ...identityFieldsOf(identity),
    decision: binding.decision,
    preparedDigest: binding.preparedDigest ?? null,
    decisionText: binding.decisionText,
    decisionDigest: binding.decisionDigest,
    ...stamp,
  };
}

/**
 * The PARTICIPANT_GENERATION_ORIGIN command the leader proposes once, when
 * transaction admission is enabled on the partition (design 0.0.13).
 * @param {string} partitionId - The partition.
 * @param {Object} stamp - {timestamp, proposedBy, proposedAt}.
 * @return {Object} The command.
 */
function buildGenerationOriginCommand(partitionId, stamp) {
  return {
    type: COMMAND.GENERATION_ORIGIN,
    entryId: generationOriginEntryIdOf(partitionId),
    partitionId,
    ...stamp,
  };
}

// The identity half of the pinned form, without a partition to compare with
// (the admission owner knows none): every identity field present and typed,
// and a participantId that names the transaction and some partition.
function carriesPinnedIdentity(command) {
  const prefix = `${command?.transactionId}${BYTES.IDENTITY_SEPARATOR}`;
  return isNonEmptyString(command?.transactionId) &&
    isNonEmptyString(command.participantId) &&
    command.participantId.startsWith(prefix) &&
    command.participantId.length > prefix.length &&
    isNonEmptyString(command.commitMode) &&
    Number.isSafeInteger(command.transactionEpoch);
}

function isPinnedPrepare(command) {
  return typeof command.operationsText === 'string' &&
    typeof command.validationText === 'string' &&
    command.preparedDigest ===
      preparedDigestOf(command.operationsText, command.validationText) &&
    command.entryId === prepareEntryIdOf(command.participantId);
}

// A decision carries its binding and no operations.
function isPinnedDecision(command) {
  return decisionBindingRefusalOf(command) === null &&
    command.entryId ===
      decisionEntryIdOf(command.participantId, command.decisionDigest) &&
    command.operationsText === undefined && command.operations === undefined;
}

// An origin names its partition, under its deterministic entryId, and
// carries nothing else of a transaction.
function isPinnedGenerationOrigin(command) {
  return isNonEmptyString(command.partitionId) &&
    command.entryId === generationOriginEntryIdOf(command.partitionId) &&
    command.transactionId === undefined && command.sql === undefined;
}

// Cold observation asks a stricter question than ordinary admission: these
// exact bytes must be producible by this partition's ENABLE owner. Retained
// stamps are checked, never regenerated from today's clock or replica.
function isCanonicalRetainedGenerationOrigin(command, partitionId) {
  if (command?.type !== COMMAND.GENERATION_ORIGIN ||
      command.partitionId !== partitionId || !isPinnedGenerationOrigin(command)) return false;
  const {timestamp, proposedBy, proposedAt} = command;
  const clock = HLCTimestamp.tryFromString(timestamp);
  if (clock === null || clock.toString() !== timestamp ||
      !isNonEmptyString(proposedBy) || !Number.isFinite(proposedAt) || proposedAt < 0) {
    return false;
  }
  return isDeepStrictEqual(command,
    buildGenerationOriginCommand(partitionId, {timestamp, proposedBy, proposedAt}));
}

/**
 * Whether a participant transaction command is in the pinned byte form the
 * leader builds (the admission owner asks before it is proposed).
 * @param {Object} command - A participant transaction command.
 * @return {boolean} Whether its bytes are pinned.
 */
function isPinnedParticipantCommand(command) {
  if (command.type === COMMAND.GENERATION_ORIGIN) {
    return isPinnedGenerationOrigin(command);
  }
  // Only preproposal admission asks this predicate. Already-committed apply
  // retains diagnostic-only envelope handling, including historical records.
  if (!carriesPinnedIdentity(command) ||
      !isExecutionEnvelope(command.executionEnvelope)) {
    return false;
  }
  return command.type === COMMAND.PREPARE ?
    isPinnedPrepare(command) : isPinnedDecision(command);
}

export {
  buildDecisionRecord,
  buildDecisionCommand,
  buildGenerationOriginCommand,
  buildPrepareCommand,
  canonicalDecisionRecord,
  carriedOriginIndexOf,
  decisionBindingRefusalOf,
  decisionEntryIdOf,
  decisionMatchesPreparedRow,
  identityRefusalOf,
  isCanonicalRetainedGenerationOrigin,
  isPinnedParticipantCommand,
  operationOutcomeKeyOf,
  operationsOf,
  participantIdOf,
  preparedDigestOf,
  prepareEntryIdOf,
  validationTextOf,
};
