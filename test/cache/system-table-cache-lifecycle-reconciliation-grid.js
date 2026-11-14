// Model grid for the services lifecycle reconciliation builder and its aligned
// predicate (quest service-lifecycle-reconciliation-row-integrity, record v2).
// Shared, unchanged, by the golden producer (run at the sealed base) and by
// the differential test, so both enumerate exactly the same inputs. Columns
// come from the owner's schema and field-name lists, never from literals.
import {createHash} from 'node:crypto';
import {SERVICES_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';
import {
  SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES,
} from '../../src/cache/cache-constants.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';

const UNDEFINED_MARK = '\u0000undefined';
const CELL_STATE = Object.freeze({
  MISSING: 'missing',
  NULL: 'null',
  UNDEFINED: 'undefined',
  EQUAL: 'equal',
  DIFFERENT: 'different',
  PRESENT: 'present',
});

const GRID_COLUMNS = Object.freeze([...new Set([
  ...SERVICES_SCHEMA.columns.map((column) => column.name),
  ...SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES,
])]);

const VERSION_COLUMNS = Object.freeze({
  STATE_ENTERED_AT: 'state_entered_at',
  UPDATED_AT: 'updated_at',
  CREATED_AT: 'created_at',
});

const ROLE_VALUES = Object.freeze(['learner', 'follower', 'leader']);

// [cached, authoritative] pairs for each version-relation axis value.
const UPDATED_AT_RELATIONS = Object.freeze({
  cachedOlder: [1000, 2000],
  equal: [2000, 2000],
  cachedNewer: [3000, 2000],
  cachedNonFinite: [null, 2000],
  authorityNonFinite: [2000, null],
});
const LIFECYCLE_RELATIONS = Object.freeze({
  cachedOlder: [1000, 2000],
  equal: [2000, 2000],
  cachedNewer: [3000, 2000],
  cachedUnresolvable: [null, 2000],
  authorityUnresolvable: [2000, null],
});
const INCARNATIONS = Object.freeze([
  'same',
  'differentToken',
  'differentCreatedAt',
  'tokensMissing',
]);
const ROW_KINDS = Object.freeze(['ordinary', 'cleanup']);
const STATUS_PAIRS = Object.freeze(['bothActive', 'cachedSyncing']);

function isIdentityColumn(column) {
  return SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES.includes(column);
}

function isLifecycleColumn(column) {
  return SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES.includes(column);
}

function isLocalHlcColumn(column) {
  return SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES.includes(column) &&
    /hlc/i.test(column);
}

function presentValue(column, side) {
  if (Object.values(VERSION_COLUMNS).includes(column)) {
    return side === 'authority' ? 2000 : 2500;
  }
  if (column === 'raft_role') {
    return side === 'authority' ? 'follower' : 'learner';
  }
  if (isLocalHlcColumn(column)) {
    return side === 'authority' ? '2000-0-services-p1-r1' :
      '2500-0-services-p1-r1';
  }
  return `${column}-${side}`;
}

function buildBaseRows(axes) {
  const cleanup = axes.rowKind === 'cleanup';
  const shared = {
    service_id: 'svc-p1-r4',
    service_type: cleanup ? SERVICE_TYPE.PARTITION_CLEANUP :
      SERVICE_TYPE.PARTITION,
    node_id: 'node-b',
    partition_id: 'svc-p1',
    group_id: 'group-1',
    replica_id: 'svc-p1-r4',
    raft_role: 'follower',
    previous_state: 'syncing',
    trigger_reason: 'trigger',
    error_message: 'error',
    cleanup_token: 'cleanup-1',
    create_attempt_token: 'attempt-1',
    address: 'node-b/partition/svc-p1-r4',
    created_at: 500,
  };
  const cached = {...shared};
  const authority = {...shared};
  const status = cleanup ? 'cleanup_owned' : 'active';
  authority.status = status;
  cached.status = axes.statusPair === 'bothActive' || cleanup ?
    status : 'syncing';
  [cached.updated_at, authority.updated_at] =
    UPDATED_AT_RELATIONS[axes.updatedAt];
  [cached.state_entered_at, authority.state_entered_at] =
    LIFECYCLE_RELATIONS[axes.lifecycle];
  cached.updated_at_hlc = '1500-0-services-p1-r1';
  if (axes.incarnation === 'differentToken') {
    cached.create_attempt_token = 'attempt-0';
  } else if (axes.incarnation === 'differentCreatedAt') {
    cached.created_at = 400;
  } else if (axes.incarnation === 'tokensMissing') {
    for (const row of [cached, authority]) {
      row.create_attempt_token = null;
      row.cleanup_token = null;
    }
  }
  return {cached, authority};
}

function applyCellState(row, column, state, value) {
  if (state === CELL_STATE.MISSING) {
    delete row[column];
  } else if (state === CELL_STATE.NULL) {
    row[column] = null;
  } else if (state === CELL_STATE.UNDEFINED) {
    row[column] = undefined;
  } else {
    row[column] = value;
  }
}

function cachedStatesFor(column) {
  const states = [
    CELL_STATE.MISSING,
    CELL_STATE.NULL,
    CELL_STATE.UNDEFINED,
    CELL_STATE.EQUAL,
  ];
  if (column === 'raft_role') {
    return [...states, ...ROLE_VALUES.map((role) => `role:${role}`)];
  }
  return [...states, CELL_STATE.DIFFERENT];
}

const AUTHORITY_STATES = Object.freeze([
  CELL_STATE.MISSING,
  CELL_STATE.NULL,
  CELL_STATE.PRESENT,
]);

function buildCell(axes, column, cachedState, authorityState) {
  const {cached, authority} = buildBaseRows(axes);
  const authorityValue = presentValue(column, 'authority');
  applyCellState(authority, column, authorityState, authorityValue);
  if (cachedState.startsWith('role:')) {
    cached[column] = cachedState.slice('role:'.length);
  } else {
    applyCellState(
      cached,
      column,
      cachedState,
      cachedState === CELL_STATE.EQUAL ?
        authorityValue : presentValue(column, 'cached'),
    );
  }
  return {cached, authority};
}

function* enumerateGridCombos() {
  for (const updatedAt of Object.keys(UPDATED_AT_RELATIONS)) {
    for (const lifecycle of Object.keys(LIFECYCLE_RELATIONS)) {
      for (const incarnation of INCARNATIONS) {
        for (const rowKind of ROW_KINDS) {
          for (const statusPair of STATUS_PAIRS) {
            yield {updatedAt, lifecycle, incarnation, rowKind, statusPair};
          }
        }
      }
    }
  }
}

function comboKey(axes) {
  return [
    axes.updatedAt,
    axes.lifecycle,
    axes.incarnation,
    axes.rowKind,
    axes.statusPair,
  ].join('|');
}

function* enumerateComboCells(axes) {
  for (const column of GRID_COLUMNS) {
    for (const cachedState of cachedStatesFor(column)) {
      for (const authorityState of AUTHORITY_STATES) {
        yield {
          column,
          cachedState,
          authorityState,
          ...buildCell(axes, column, cachedState, authorityState),
        };
      }
    }
  }
}

// Canonical serialization that keeps an own undefined distinct from a
// missing key and from null.
function serializeRow(row) {
  if (!row || typeof row !== 'object') {
    return JSON.stringify(row === undefined ? UNDEFINED_MARK : row);
  }
  const sorted = {};
  for (const key of Object.keys(row).sort()) {
    sorted[key] = row[key] === undefined ? UNDEFINED_MARK : row[key];
  }
  return JSON.stringify(sorted);
}

function digest(parts) {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update('\n');
  }
  return hash.digest('hex').slice(0, 32);
}

function bitsToHex(bits) {
  let hex = '';
  for (let index = 0; index < bits.length; index += 4) {
    let nibble = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      nibble = (nibble << 1) | (bits[index + offset] ? 1 : 0);
    }
    hex += nibble.toString(16);
  }
  return hex;
}

// Applies the builder and the predicate to every cell of one combo and
// summarizes them the way the golden stores them.
function summarizeCombo(cells, outputs, alignedBefore, alignedAfter) {
  return {
    cells: cells.length,
    outputs: digest(outputs.map(serializeRow)),
    alignedBefore: bitsToHex(alignedBefore),
    alignedAfter: bitsToHex(alignedAfter),
  };
}

export {
  CELL_STATE,
  GRID_COLUMNS,
  bitsToHex,
  comboKey,
  digest,
  enumerateComboCells,
  enumerateGridCombos,
  isIdentityColumn,
  isLifecycleColumn,
  isLocalHlcColumn,
  serializeRow,
  summarizeCombo,
};
