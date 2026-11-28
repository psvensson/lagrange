/**
 * The compared bytes of a split or merge workflow record: what a `tables`
 * row's transition columns hold exactly (the stored metadata string, the
 * state, the record GENERATION), the record they decode to, how two rows
 * compare, and the written row a compare-and-swap leaves. Pure;
 * managed-workflow-record-store.js owns every write of these columns.
 */
import {PARTITION_TRANSITION_METADATA_FIELD} from './partition-constants.js';
import {durableOwnershipClaimOf} from './managed-workflow-ownership-core.js';

const STRING_TYPE = 'string';
const OBJECT_TYPE = 'object';

// The record generation (round 7): strictly increased by every accepted
// change, the terminal clear included, and compared by every
// compare-and-swap; it survives the clear, so a record never repeats. A row
// that predates the column reads 0.
const GENERATION_COLUMN = 'partition_transition_generation';

/**
 * The exact stored transition metadata of one `tables` row: the string as
 * stored (a view that decoded it to an object re-encodes it), or null.
 * @param {*} raw
 * @return {string|null}
 */
function storedMetadataOf(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  return typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
}

/**
 * The record generation of one `tables` row: a non-negative integer, 0 for a
 * row (or a view of it) that predates the column.
 * @param {Object|null} row
 * @return {number}
 */
function generationOf(row) {
  const generation = Number(row?.[GENERATION_COLUMN] ?? 0);
  return Number.isSafeInteger(generation) && generation > 0 ? generation : 0;
}

/**
 * The compared record of one `tables` row as READ (absent: null/null/0):
 * what a change's precondition may compare a record against. Never written.
 * @param {Object|null} row
 * @return {{metadata: (string|null), state: (string|null),
 *   generation: number}}
 */
function recordBytesOf(row) {
  return {
    metadata: storedMetadataOf(row?.partition_transition_metadata),
    state: row?.partition_transition_state ?? null,
    generation: generationOf(row),
  };
}

function sameBytes(left, right) {
  const a = recordBytesOf(left);
  const b = recordBytesOf(right);
  return a.metadata === b.metadata && a.state === b.state &&
    a.generation === b.generation;
}

function parseMetadata(raw) {
  if (typeof raw !== STRING_TYPE || raw.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === OBJECT_TYPE ? parsed : null;
  } catch (_error) {
    return null;
  }
}

/**
 * The decoded record: which workflow it holds, its state, metadata and
 * ownership claim.
 * @param {Object|null} row
 * @return {Object}
 */
function storedRecordOf(row) {
  const bytes = recordBytesOf(row);
  const metadata = parseMetadata(bytes.metadata);
  return Object.freeze({
    bytes,
    generation: bytes.generation,
    row: row ?? null,
    exists: Boolean(row),
    workflowId: metadata ? String(metadata[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || '') || null : null,
    state: bytes.state,
    metadata,
    claim: durableOwnershipClaimOf(metadata),
  });
}

/**
 * The transition a `tables` row stores, decoded from its exact bytes (the
 * owners' record decoders start here): {state, metadata} or null when the row
 * holds no transition.
 * @param {Object|null} row
 * @return {{state: string, metadata: Object}|null}
 */
function storedTransitionOf(row) {
  const bytes = recordBytesOf(row);
  const metadata = parseMetadata(bytes.metadata);
  return bytes.state && metadata ? {state: bytes.state, metadata} : null;
}

/**
 * Whether the authoritative re-read lags the base: it holds the base's own
 * record, or a record of a LOWER generation (generations only grow, so it
 * is an older copy - a leader that has not applied the base yet). Anything
 * else - an absent row included (the table is gone) - moved past the base.
 * @param {Object|null} reread
 * @param {Object|null} base
 * @return {boolean}
 */
function rereadLagsBase(reread, base) {
  return sameBytes(reread, base) ||
    (reread !== null && generationOf(reread) < generationOf(base));
}

// Every accepted change advances the generation by one, in the same write
// (the clear included): stamped here, so no encoder can omit it.
function withNextGeneration(encoded, base) {
  return {...encoded, data: {...encoded.data,
    [GENERATION_COLUMN]: generationOf(base) + 1}};
}

function writtenRowOf(base, encoded, tableId) {
  return {
    ...(base || {table_id: tableId}),
    ...encoded.data,
    partition_transition_metadata:
      encoded.data.partition_transition_metadata ?? null,
    partition_transition_state: encoded.writtenState ?? null,
  };
}

export {
  GENERATION_COLUMN,
  generationOf,
  recordBytesOf,
  rereadLagsBase,
  sameBytes,
  storedRecordOf,
  storedTransitionOf,
  withNextGeneration,
  writtenRowOf,
};
