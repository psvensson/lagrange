/**
 * Owner contract:
 * Owner: whether a split's or merge's registration may still land on the
 * record it is compared against, as far as its inputs from OTHER rows go
 * (round 7, D2). The registration change compares the caller's read of the
 * `tables` row by its transition bytes and record generation, so every
 * input taken from that row (active and pending version, the existing
 * transition and its retry plan, the overlap guard) is covered by the
 * compare-and-swap. The inputs taken from the partitions rows are
 * re-validated here, at the change's turn, against the compared record's
 * own committed facts:
 *  - every source partition row exists, is at the record's
 *    active_partition_version, and holds the key range the registration
 *    persisted (topologySnapshot.sourcePartitionKeyRanges);
 *  - the sibling set (every same-table partition at the active epoch outside
 *    the workflow, carried forward at cutover) re-derived by the owner's own
 *    resolver against the compared record equals the registered one.
 * Inputs: the owner (getPartitionInfo, resolveActivePartitionVersion, the
 * family's sibling resolver), the registration and the compared row.
 * Output: null (every input holds) or the name of the first input that
 * moved (REGISTRATION_INPUT).
 * Not inputs of the record (advisory, re-checked by the step that acts on
 * them): desired replication factor, size, leader, routable/candidate nodes
 * and the topology snapshot's node sets.
 */
import {PARTITION_TRANSITION_METADATA_FIELD} from './partition-constants.js';
import {resolvePartitionRowKeyRange} from './partition-transition-overlap-guard.js';

const FIELD = PARTITION_TRANSITION_METADATA_FIELD;

// The input of a registration that moved since it was derived.
const REGISTRATION_INPUT = Object.freeze({
  SOURCE_EPOCH: 'source-partition-not-at-active-epoch',
  SOURCE_RANGE: 'source-partition-key-range-moved',
  SIBLINGS: 'sibling-partition-set-moved',
});

// A row's partition version; a row that does not spell it out holds the
// schema default 1 (the convention of the owners' own row resolvers).
function partitionVersionOf(row) {
  const version = Number(row?.partition_version ?? row?.partitionVersion);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function sameRange(left, right) {
  return String(left?.start ?? null) === String(right?.start ?? null) &&
    String(left?.end ?? null) === String(right?.end ?? null);
}

function sameIdSet(left, right) {
  const a = new Set((Array.isArray(left) ? left : []).map(String));
  const b = new Set((Array.isArray(right) ? right : []).map(String));
  return a.size === b.size && [...a].every((id) => b.has(id));
}

// The first source partition whose row no longer matches the registration.
function movedSourceOf(owner, metadata, sourceIds, activeVersion) {
  const ranges = metadata?.[FIELD.TOPOLOGY_SNAPSHOT]
    ?.sourcePartitionKeyRanges || {};
  for (const sourceId of sourceIds) {
    const row = owner.getPartitionInfo(sourceId);
    if (!row || partitionVersionOf(row) !== activeVersion) {
      return REGISTRATION_INPUT.SOURCE_EPOCH;
    }
    if (ranges[sourceId] &&
        !sameRange(ranges[sourceId], resolvePartitionRowKeyRange(row))) {
      return REGISTRATION_INPUT.SOURCE_RANGE;
    }
  }
  return null;
}

/**
 * The re-validation of one registration's partitions-row inputs at its
 * change's turn (see the owner contract).
 * @param {Object} owner - The split or merge owner.
 * @param {Object} input
 * @param {Object} input.registration - The registration being applied.
 * @param {Object|null} input.storedRow - The compared `tables` row.
 * @param {Array<string>} input.sourceIds - Its source partition ids.
 * @param {Function} input.deriveSiblings - (storedRow) => the sibling ids
 *   the owner's resolver derives against the compared record now.
 * @return {string|null} REGISTRATION_INPUT or null.
 */
function registrationInputsRefusalOf(owner, {registration, storedRow,
  sourceIds, deriveSiblings}) {
  const metadata = registration?.metadata || {};
  const activeVersion = owner.resolveActivePartitionVersion(storedRow);
  return movedSourceOf(owner, metadata, sourceIds, activeVersion) ??
    (sameIdSet(deriveSiblings(storedRow),
      metadata[FIELD.SIBLING_PARTITION_IDS]) ? null :
      REGISTRATION_INPUT.SIBLINGS);
}

export {registrationInputsRefusalOf};
