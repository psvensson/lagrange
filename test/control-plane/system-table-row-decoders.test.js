// The three system-table row decoders (quest system-table-row-decoders):
// services-row-decoder.js, nodes-row-decoder.js and
// replica-operations-row-decoder.js over system-table-row-decoding.js.
// Each is pinned on every stored column, every named state of each closed
// domain, the frozen result with its projection marker, the named
// ROW_UNRECOGNISED state of every stored value outside its column's
// decoding (an unknown or differently-cased state, a wrong stored type, a
// JSON text holding no array; round 5: kept as stored, never refused), SQL
// NULL as ROW_ABSENT, and every typed refusal: a missing, extra or camelCase
// column, a non-row, a foreign projection and a malformed steps_history (the
// one refusing JSON column). The decoder never defaults a value the row
// lacks.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD,
} from '../../src/cache/cache-constants.js';
import {
  NODES_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  SERVICES_SCHEMA,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  NODES_ROW_CONNECTION_STATE,
  NODES_ROW_STATUS,
  decodeNodesRow,
  defineNodesProjection,
} from '../../src/control-plane/nodes-row-decoder.js';
import {
  SERVICES_ROW_RAFT_ROLE,
  SERVICES_ROW_STATUS,
  decodeServicesRow,
  defineServicesProjection,
} from '../../src/control-plane/services-row-decoder.js';
import {
  FULL_ROW_PROJECTION_NAME,
  ROW_ABSENT,
  ROW_UNRECOGNISED,
  SYSTEM_TABLE_ROW_DECODE_ERROR_CODE,
  SYSTEM_TABLE_ROW_DECODE_REFUSAL,
  SystemTableRowDecodeError,
} from '../../src/control-plane/system-table-row-decoding.js';
import {
  REPLICA_OPERATIONS_ROW_STATUS,
  REPLICA_OPERATIONS_ROW_TYPE,
  decodeReplicaOperationsRow,
  defineReplicaOperationsProjection,
} from '../../src/rebalancer/replica-operations-row-decoder.js';
import {
  nodesRow,
  replicaOperationsRow,
  servicesRow,
} from '../test-helpers/system-table-row-fixture.js';

const TABLES = Object.freeze([
  {table: 'services', schema: SERVICES_SCHEMA, decode: decodeServicesRow,
    row: servicesRow, define: defineServicesProjection,
    states: {status: SERVICES_ROW_STATUS, raft_role: SERVICES_ROW_RAFT_ROLE},
    json: []},
  {table: 'nodes', schema: NODES_SCHEMA, decode: decodeNodesRow, row: nodesRow,
    define: defineNodesProjection,
    states: {status: NODES_ROW_STATUS, connection_state: NODES_ROW_CONNECTION_STATE},
    json: ['capabilities']},
  {table: 'replica_operations', schema: REPLICA_OPERATIONS_SCHEMA,
    decode: decodeReplicaOperationsRow, row: replicaOperationsRow,
    define: defineReplicaOperationsProjection,
    states: {type: REPLICA_OPERATIONS_ROW_TYPE, status: REPLICA_OPERATIONS_ROW_STATUS,
      workflow_step: WORKFLOW_STEP},
    json: ['steps_history'], refusingJson: ['steps_history']},
]);

function camel(column) {
  return column.replace(/_([a-z0-9])/gu, (_match, letter) => letter.toUpperCase());
}

// A distinct stored value for every column, in its stored type and domain.
function distinctValue(spec, column) {
  if (spec.json.includes(column.name)) return '[{"step":"x"}]';
  if (Object.hasOwn(spec.states, column.name)) {
    const values = Object.values(spec.states[column.name]);
    return values[values.length - 1];
  }
  return column.type === 'TEXT' ? `${column.name}-value` : 7;
}

// The named state of a stored value outside its column's decoding: the
// frozen {state: ROW_UNRECOGNISED, raw} carrying the stored value as stored.
function unrecognised(spec, column, raw) {
  const value = spec.decode(spec.row({[column]: raw}))[camel(column)];
  assert.deepEqual(value, {state: ROW_UNRECOGNISED, raw},
    `${spec.table}.${column} ${String(raw)} decodes to ROW_UNRECOGNISED carrying it`);
  assert.ok(Object.isFrozen(value));
}

function refusal(spec, run, reason, column) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof SystemTableRowDecodeError, `${spec.table}: typed refusal`);
    assert.equal(error.code, SYSTEM_TABLE_ROW_DECODE_ERROR_CODE);
    assert.equal(error.table, spec.table);
    assert.equal(error.reason, reason);
    assert.equal(error.column, column);
    return true;
  });
}

for (const spec of TABLES) {
  test(`${spec.table}: every stored column decodes to its camelCase field, frozen`, () => {
    const stored = {};
    for (const column of spec.schema.columns) stored[column.name] = distinctValue(spec, column);
    const decoded = spec.decode(spec.row(stored));
    assert.ok(Object.isFrozen(decoded));
    assert.equal(decoded.projection, FULL_ROW_PROJECTION_NAME);
    assert.deepEqual(Object.keys(decoded).sort(),
      [...spec.schema.columns.map((column) => camel(column.name)), 'projection'].sort(),
      'exactly one field per stored column plus the projection marker');
    for (const column of spec.schema.columns) {
      const field = camel(column.name);
      if (spec.json.includes(column.name)) {
        assert.deepEqual(decoded[field], [{step: 'x'}]);
        assert.ok(Object.isFrozen(decoded[field]), `${column.name} decodes to a frozen array`);
      } else {
        assert.equal(decoded[field], stored[column.name], `${column.name} keeps its value`);
      }
    }
  });

  test(`${spec.table}: every named state decodes; any other stored value is unrecognised`,
    () => {
      for (const [column, domain] of Object.entries(spec.states)) {
        for (const state of Object.values(domain)) {
          assert.equal(spec.decode(spec.row({[column]: state}))[camel(column)], state);
          // No canonicalisation: a differently-cased value is kept as stored.
          unrecognised(spec, column,
            state === state.toLowerCase() ? state.toUpperCase() : state.toLowerCase());
        }
        unrecognised(spec, column, 'not-a-stored-state');
        unrecognised(spec, column, '');
      }
    });

  test(`${spec.table}: SQL NULL is ROW_ABSENT in every column`, () => {
    for (const column of spec.schema.columns) {
      assert.equal(spec.decode(spec.row({[column.name]: null}))[camel(column.name)], ROW_ABSENT,
        `${column.name} NULL is ROW_ABSENT`);
    }
  });

  test(`${spec.table}: a missing, extra or camelCase column is refused, never defaulted`, () => {
    for (const column of spec.schema.columns) {
      const row = spec.row();
      delete row[column.name];
      refusal(spec, () => spec.decode(row), SYSTEM_TABLE_ROW_DECODE_REFUSAL.MISSING_COLUMN,
        column.name);
      if (camel(column.name) !== column.name) {
        const respelled = spec.row();
        respelled[camel(column.name)] = respelled[column.name];
        delete respelled[column.name];
        refusal(spec, () => spec.decode(respelled),
          SYSTEM_TABLE_ROW_DECODE_REFUSAL.UNEXPECTED_COLUMN, camel(column.name));
      }
    }
    refusal(spec, () => spec.decode({...spec.row(), extra_column: 1}),
      SYSTEM_TABLE_ROW_DECODE_REFUSAL.UNEXPECTED_COLUMN, 'extra_column');
    for (const notARow of [null, undefined, 'row', 7, []]) {
      refusal(spec, () => spec.decode(notARow), SYSTEM_TABLE_ROW_DECODE_REFUSAL.NOT_A_ROW,
        undefined);
    }
  });

  test(`${spec.table}: a value of the wrong stored type is unrecognised, kept as stored`,
    () => {
      for (const column of spec.schema.columns) {
        if (spec.refusingJson?.includes(column.name)) continue;
        unrecognised(spec, column.name, column.type === 'TEXT' ? 7 : 'seven');
        unrecognised(spec, column.name, undefined);
        if (column.type !== 'TEXT') unrecognised(spec, column.name, Number.NaN);
      }
      for (const column of spec.json) {
        for (const malformed of ['{not json', '{"a":1}']) {
          if (spec.refusingJson?.includes(column)) {
            refusal(spec, () => spec.decode(spec.row({[column]: malformed})),
              SYSTEM_TABLE_ROW_DECODE_REFUSAL.MALFORMED_JSON, column);
          } else {
            unrecognised(spec, column, malformed);
          }
        }
      }
    });

  test(`${spec.table}: a projection decodes exactly its columns and carries its marker`, () => {
    const [first, second] = spec.schema.columns.map((column) => column.name);
    const projection = spec.define('witness', [first, second]);
    const full = spec.row();
    const decoded = spec.decode({[first]: full[first], [second]: full[second]}, projection);
    assert.ok(Object.isFrozen(decoded));
    assert.deepEqual(decoded, {[camel(first)]: full[first], [camel(second)]: full[second],
      projection: 'witness'});
    refusal(spec, () => spec.decode({[first]: full[first]}, projection),
      SYSTEM_TABLE_ROW_DECODE_REFUSAL.MISSING_COLUMN, second);
    refusal(spec, () => spec.decode(full, projection),
      SYSTEM_TABLE_ROW_DECODE_REFUSAL.UNEXPECTED_COLUMN, spec.schema.columns[2].name);
    assert.throws(() => spec.define('bad', ['not_a_stored_column']), /not a stored column/u);
    assert.throws(() => spec.define('dup', [first, first]), /duplicate column/u);
  });
}

test('a cache row is a stored row plus the cache\'s declared local provenance', () => {
  for (const spec of TABLES) {
    const cacheRow = {...spec.row(), updated_at_hlc: '0000000000001-0000-node-1',
      updatedAtHlc: '0000000000001-0000-node-1'};
    const decoded = spec.decode(cacheRow);
    assert.deepEqual(decoded, spec.decode(spec.row()),
      `${spec.table}: provenance is neither a column nor refused, and not decoded`);
  }
});

// Lead ruling 3: the decoders ignore exactly the cache's own declared local
// fields; SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES stays the single declaration.
test('the decoders ignore exactly SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES', () => {
  assert.deepEqual([...SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES].sort(), [
    'leader_claim_minted_against_updated_at', 'leader_claim_node_id',
    'leader_claim_raft_term', 'seed_projection', 'updatedAtHlc', 'updated_at_hlc']);
  for (const spec of TABLES) {
    // The seed projection is the one local field the decoders read
    // (system-table-seed-projection.test.js).
    for (const fieldName of SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES.filter(
      (name) => name !== SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD)) {
      assert.deepEqual(spec.decode({...spec.row(), [fieldName]: 'local'}),
        spec.decode(spec.row()), `${spec.table}: ${fieldName} is ignored`);
    }
    assert.throws(() => spec.decode({...spec.row(), leader_claim_epoch: 1}),
      (error) => error instanceof SystemTableRowDecodeError &&
        error.reason === SYSTEM_TABLE_ROW_DECODE_REFUSAL.UNEXPECTED_COLUMN,
      `${spec.table}: an undeclared non-column field is refused`);
  }
});

test('the closed domains are the writer census, nothing wider', () => {
  assert.deepEqual(Object.values(SERVICES_ROW_STATUS).sort(), ['active', 'cleanup_complete',
    'cleanup_owned', 'created', 'creating', 'failed', 'pending', 'removed', 'removing',
    'starting', 'stopped', 'syncing']);
  assert.deepEqual(Object.values(SERVICES_ROW_RAFT_ROLE).sort(),
    ['candidate', 'follower', 'leader', 'learner']);
  assert.deepEqual(Object.values(NODES_ROW_STATUS).sort(),
    ['active', 'failed', 'joining', 'recovering', 'stopped', 'suspected']);
  assert.deepEqual(Object.values(NODES_ROW_CONNECTION_STATE).sort(),
    ['connected', 'connecting', 'disconnected', 'ready']);
  assert.deepEqual(Object.values(REPLICA_OPERATIONS_ROW_TYPE).sort(),
    ['ADD', 'MOVE_ASSIGNMENT', 'REMOVE', 'REPLACE']);
  assert.deepEqual(Object.values(REPLICA_OPERATIONS_ROW_STATUS).sort(),
    ['active', 'creating', 'failed', 'pending', 'removed', 'removing', 'syncing']);
  for (const [decode, row, column, value] of [
    [decodeServicesRow, servicesRow, 'status', 'held'],
    [decodeNodesRow, nodesRow, 'status', 'draining'],
    [decodeNodesRow, nodesRow, 'connection_state', 'draining'],
    [decodeServicesRow, servicesRow, 'raft_role', 'voter'],
    [decodeReplicaOperationsRow, replicaOperationsRow, 'status', 'held'],
  ]) {
    assert.deepEqual(decode(row({[column]: value}))[camel(column)],
      {state: ROW_UNRECOGNISED, raw: value}, `${column} ${value} is outside the domain`);
  }
});

test('a row is never decoded through another table\'s projection', () => {
  const nodeProjection = defineNodesProjection('liveness', ['node_id', 'status']);
  assert.throws(() => decodeServicesRow({node_id: 'n', status: 'active'}, nodeProjection),
    /foreign or absent projection/u);
});
