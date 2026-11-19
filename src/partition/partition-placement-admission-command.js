// The pinned committed form of the placement owner's two commands (quest
// replica-placement-admission-owner, design section 2.5): PLACEMENT_ADMIT
// carries the canonical admission statement, PLACEMENT_RELEASE_HOLD the one
// held operation it releases. The entryId names one proposal attempt and is
// the proposer's (reused only to re-propose that attempt after an unknown
// outcome). Every replica re-validates the exact bytes before it applies.
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {PLACEMENT_STATEMENT_VALIDITY as VALIDITY, canonicalPlacementStatement} from
  '../rebalancer/replica-placement-owner-admission-statement.js';
import {PLACEMENT_ADMIT_TYPE, PLACEMENT_RELEASE_HOLD_TYPE} from
  './partition-placement-admission-constants.js';

const FIELDS = Object.freeze(['type', 'entryId', 'partitionId', 'body',
  'bodyText', 'timestamp', 'proposedBy', 'proposedAt']);
const RELEASE_FIELDS = Object.freeze(['operationId']);
// The rows a command adds to the partition's CDC owed ledger.
const RELEASE_ROW_COUNT = 1;

function isText(value) {
  return typeof value === 'string' && value.length > 0;
}

const INVALID_BODY = Object.freeze({validity: VALIDITY.INVALID});

function canonicalHoldRelease(input) {
  const release = copyStrictOwnDataRecord(input);
  return release !== null &&
    Object.keys(release).length === RELEASE_FIELDS.length &&
    isText(release.operationId) ?
    Object.freeze({validity: VALIDITY.VALID,
      statement: Object.freeze({operationId: release.operationId})}) : INVALID_BODY;
}

/**
 * The canonical body of a placement command.
 * @param {string} type - PLACEMENT_ADMIT_TYPE or PLACEMENT_RELEASE_HOLD_TYPE.
 * @param {*} body - The proposed body.
 * @return {Object} Frozen {validity: VALID, statement: the canonical body}
 *   or {validity: INVALID}.
 */
function canonicalPlacementBody(type, body) {
  if (type === PLACEMENT_ADMIT_TYPE) return canonicalPlacementStatement(body);
  return type === PLACEMENT_RELEASE_HOLD_TYPE ? canonicalHoldRelease(body) :
    INVALID_BODY;
}

/**
 * Build one placement command on the partition that proposes it.
 * @param {Object} service - The replica_operations partition.
 * @param {Object} input - {type, entryId, body}.
 * @return {Object|null} The frozen command, or null for invalid input.
 */
function buildPlacementCommand(service, {type, entryId, body}) {
  const canonical = canonicalPlacementBody(type, body);
  if (canonical.validity !== VALIDITY.VALID || !isText(entryId)) return null;
  return Object.freeze({type, entryId, partitionId: service.partitionId,
    body: canonical.statement, bodyText: JSON.stringify(canonical.statement),
    timestamp: service.hlcClock.now().toString(),
    proposedBy: service.replicaId, proposedAt: service.timeSource.now()});
}

/**
 * Whether a committed command is a placement command in its pinned form:
 * exactly its fields, a canonical body whose bytes are the carried text.
 * @param {*} input - The committed command.
 * @return {boolean} Whether it is pinned.
 */
function isPinnedPlacementCommand(input) {
  const command = copyStrictOwnDataRecord(input);
  if (command === null || Object.keys(command).length !== FIELDS.length ||
      !FIELDS.every((field) => Object.hasOwn(command, field)) ||
      !isText(command.entryId) || !isText(command.partitionId) ||
      typeof command.timestamp !== 'string' || !isText(command.proposedBy) ||
      !Number.isFinite(command.proposedAt)) {
    return false;
  }
  const canonical = canonicalPlacementBody(command.type, command.body);
  return canonical.validity === VALIDITY.VALID &&
    JSON.stringify(canonical.statement) === command.bodyText;
}

/**
 * The rows a placement command would insert or change, counted against the
 * CDC owed bound at request and at apply (design section 2.5, R3): one per
 * admitted move (the whole founding set for FOUND), one for a hold release.
 * @param {Object} command - A pinned placement command.
 * @return {number} The CDC slots it needs.
 */
function placementCommandRowCount(command) {
  return command.type === PLACEMENT_ADMIT_TYPE ? command.body.moves.length :
    RELEASE_ROW_COUNT;
}

export {buildPlacementCommand, isPinnedPlacementCommand, placementCommandRowCount};
