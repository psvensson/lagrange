import {
  MESSAGE_GROUPS_SCHEMA,
  PARTITIONS_SCHEMA,
} from './system-table-core-schema-definitions.js';

const LOCAL_STR_OBJECT = 'object';
const REPLICA_COUNT_COLUMN = 'replica_count';
const DESCRIPTOR_VALUE_FIELD = 'value';
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const numberIsSafeInteger = Number.isSafeInteger;

// The single authority for desired replication factor.
//
//   desired RF        = a valid persisted partition policy row
//   creation default  = the schema's declared replica_count
//   replica identities = mutable runtime state, never a factor
//
// A replacement replica is a new IDENTITY. It does not restate policy, and no
// count of identities determines the target.
const DECLARED_REPLICA_COUNT_DEFAULT = (() => {
  const column = PARTITIONS_SCHEMA.columns.find(
    (candidate) => candidate.name === REPLICA_COUNT_COLUMN,
  );
  return numberIsSafeInteger(column?.defaultValue) ? column.defaultValue : 0;
})();

// The authority model:
//
//   runtime desired RF        = partitions-row replica_count
//   default when CREATING it  = PARTITIONS_SCHEMA replica_count default
//   replica identities        = INITIAL_REPLICA_IDS / mutable peer state
//
// The schema default seeds a NEW row; it is not a reading of a row that failed
// to declare one. A row present but carrying no usable replica_count is an
// incomplete policy row and fails closed, which also removes the ambiguity of a
// garbage value being indistinguishable from an omitted column.
const REPLICATION_TARGET_SOURCE = Object.freeze({
  PARTITION_ROW: 'partition_row_replica_count',
  UNDECLARED: 'undeclared',
});
const UNDECLARED_TARGET = Object.freeze({
  replicationFactor: 0,
  source: REPLICATION_TARGET_SOURCE.UNDECLARED,
});
// Both persisted spellings are accepted: the column is snake_case and the
// normalized in-memory row carries the camel alias. Everything else about the
// value is strict.
const REPLICA_COUNT_COLUMNS = Object.freeze([
  'replica_count', 'replicaCount',
]);

function readOwnReplicaCount(partitionRow) {
  for (let index = 0; index < REPLICA_COUNT_COLUMNS.length; index += 1) {
    // An own DATA property only: an inherited value is not this row's policy,
    // and an accessor must never be executed while validating a row.
    const descriptor = objectGetOwnPropertyDescriptor(
      partitionRow,
      REPLICA_COUNT_COLUMNS[index],
    );
    if (!descriptor || !objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD)) {
      continue;
    }
    // The FIRST spelling that is actually present decides. Continuing past a
    // present-but-invalid value let the alias overrule a rejection:
    // {replica_count: '9', replicaCount: 4} decoded to 4, and
    // {replica_count: 0, replicaCount: 9} decoded to 9, so a row whose two
    // spellings disagree took the second opinion instead of failing closed.
    const value = descriptor.value;
    return numberIsSafeInteger(value) && value > 0 ? value : null;
  }
  return null;
}

/**
 * The desired replication factor for one partition, decoded from that
 * partition's PERSISTED policy row and from nothing else.
 *
 * The runtime input is the row itself, passed positionally. It was an options
 * object, and that shape was the problem: an options bag is an open channel,
 * so every later reader had to be argued about rather than read off the
 * signature. One positional row makes the authority boundary structural — the
 * only runtime value the decoder is handed IS the persisted policy.
 *
 * There is deliberately NO bootstrap fallback here. A formation consumer may
 * separately consult the bootstrap expected RF in order to stay BLOCKED while
 * persisted policy is not yet observable; that is the consumer's decision
 * about its own barrier and must never become a value this decoder can return.
 *
 * @param {Object|null} partitionRow the persisted partitions policy row
 * @return {Object} frozen {replicationFactor, source}
 */
function resolveDesiredReplicationFactor(partitionRow) {
  // NO partitions row means no declared policy for this partition, which is an
  // unreadable requirement and must fail closed. The schema default is the
  // policy for a row that omits the column — it is not a policy for a
  // partition that has no row at all.
  // An array is not a policy row: it satisfies typeof 'object' and would
  // fall through to the schema default, inventing a requirement from a
  // shape that declares nothing.
  if (!partitionRow || typeof partitionRow !== LOCAL_STR_OBJECT ||
    Array.isArray(partitionRow)) {
    return UNDECLARED_TARGET;
  }
  const declared = readOwnReplicaCount(partitionRow);
  if (declared === null) {
    return UNDECLARED_TARGET;
  }
  return Object.freeze({
    replicationFactor: declared,
    source: REPLICATION_TARGET_SOURCE.PARTITION_ROW,
  });
}

// Each table declares its own creation default; a MESSAGE_GROUPS row must not
// be seeded from the PARTITIONS declaration, or that schema's own default is
// read by nothing while its rows silently follow another table's policy.
const DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT = (() => {
  const column = MESSAGE_GROUPS_SCHEMA.columns.find(
    (candidate) => candidate.name === REPLICA_COUNT_COLUMN,
  );
  return numberIsSafeInteger(column?.defaultValue) ? column.defaultValue : 0;
})();

export {
  DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
  DECLARED_REPLICA_COUNT_DEFAULT,
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
};
