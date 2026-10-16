// Application opening's common root and receiver-local admission. Writer apply
// reads only the common root. Local lifecycle state is not a replicated command
// or a serving grant; image import remains a separate, held contract.
import fs from 'node:fs';
import {deepFreeze} from '../utils/deep-freeze.js';
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_OUTCOME as OUTCOME} from
  '../constants/service-instance.js';
import {captureInstanceJson, encodeInstanceJson, requireInstance, instanceDigest} from
  '../control-plane/owners/service-instance-contract.js';
import {validateBinding} from '../control-plane/owners/service-instance-state.js';

const WASM_CREATION_LOCAL_PHASE = Object.freeze({ADMITTED: 'ADMITTED', RETIRED: 'RETIRED'});
const WASM_CREATION_HELD = 'BOOTSTRAPPED_HELD';
const LOCAL_BYTES = 8192;
const OPENING_BYTES = 16384;
const CONSENSUS_OPENING_FIELD = 'consensusOpening';
const WASM_CREATION_OPENING = Object.freeze({BOUND: 'BOUND', UNBOUND: 'UNBOUND'});
const TABLE = Object.freeze({ROOT: '_wasm_creation_root', LOCAL: '_wasm_local_lifecycle'});
const SQL = Object.freeze({
  TABLES: 'SELECT name FROM sqlite_schema WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'',
  CREATE: `CREATE TABLE ${TABLE.ROOT} (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL);
    CREATE TABLE ${TABLE.LOCAL} (id INTEGER PRIMARY KEY CHECK(id=1), record TEXT NOT NULL);`,
  ROOT: `SELECT binding FROM ${TABLE.ROOT} WHERE id=1`,
  LOCAL: `SELECT record FROM ${TABLE.LOCAL} WHERE id=1`,
  PUT_ROOT: `INSERT INTO ${TABLE.ROOT}(id,binding) VALUES(1,?)`,
  PUT_LOCAL: `INSERT INTO ${TABLE.LOCAL}(id,record) VALUES(1,?)`,
  RETIRE: `UPDATE ${TABLE.LOCAL} SET record=? WHERE id=1 AND record=?`,
});
function captureWasmCreationOpening(value) {
  return deepFreeze(captureInstanceJson(value, OPENING_BYTES));
}
function readWasmCreationRoot(db) {
  const raw = db.prepare(SQL.ROOT).get()?.binding;
  requireInstance(typeof raw === 'string' && Buffer.byteLength(raw) <= LIMIT.BINDING_BYTES,
    OUTCOME.CORRUPT_STATE);
  const binding = JSON.parse(raw);
  validateBinding(binding, binding);
  requireInstance(encodeInstanceJson(binding, LIMIT.BINDING_BYTES) === raw, OUTCOME.CORRUPT_STATE);
  return binding;
}
function localIdentity(replica) {
  const {binding, request, token, identity} = replica.consensusOpening;
  return {format: LIMIT.FORMAT, bindingDigest: instanceDigest(binding), request, token,
    groupId: identity.groupId, replicaId: replica.replicaId, nodeId: replica.nodeId,
    path: fs.realpathSync(replica.dbPath), phase: WASM_CREATION_LOCAL_PHASE.ADMITTED};
}
function readLocal(replica) {
  const raw = replica.db.prepare(SQL.LOCAL).get()?.record;
  requireInstance(typeof raw === 'string' && Buffer.byteLength(raw) <= LOCAL_BYTES,
    OUTCOME.CORRUPT_STATE);
  const record = JSON.parse(raw);
  requireInstance(encodeInstanceJson(record, LOCAL_BYTES) === raw, OUTCOME.CORRUPT_STATE);
  return {raw, record};
}
function openWasmCreationState(replica) {
  const {db} = replica;
  const tables = db.prepare(SQL.TABLES).all();
  if (!replica.consensusOpening) {
    requireInstance(!tables.some((row) => row.name === TABLE.ROOT ||
      row.name === TABLE.LOCAL), OUTCOME.INVALID_LINEAGE);
    return {kind: WASM_CREATION_OPENING.UNBOUND};
  }
  const fresh = tables.length === 0;
  const binding = replica.consensusOpening.binding;
  const expected = encodeInstanceJson(localIdentity(replica), LOCAL_BYTES);
  if (fresh) {
    db.exec(SQL.CREATE);
    db.prepare(SQL.PUT_ROOT).run(encodeInstanceJson(binding, LIMIT.BINDING_BYTES));
    db.prepare(SQL.PUT_LOCAL).run(expected);
  } else {
    requireInstance(instanceDigest(readWasmCreationRoot(db)) === instanceDigest(binding),
      OUTCOME.CONTENT_CONFLICT);
    const local = readLocal(replica);
    requireInstance(local.record.phase !== WASM_CREATION_LOCAL_PHASE.RETIRED,
      OUTCOME.RESOURCE_CLOSED);
    requireInstance(local.raw === expected, OUTCOME.CONTENT_CONFLICT);
  }
  return {kind: WASM_CREATION_OPENING.BOUND, fresh, binding};
}
function retireWasmCreationState(replica) {
  if (!replica.creationOpened) return;
  const local = readLocal(replica);
  const expected = encodeInstanceJson(localIdentity(replica), LOCAL_BYTES);
  const retired = encodeInstanceJson({...localIdentity(replica),
    phase: WASM_CREATION_LOCAL_PHASE.RETIRED}, LOCAL_BYTES);
  requireInstance(local.raw === expected || local.raw === retired, OUTCOME.CORRUPT_STATE);
  if (local.raw === retired) return;
  requireInstance(replica.db.prepare(SQL.RETIRE).run(retired, expected).changes === 1,
    OUTCOME.STATE_CHANGED);
}
export {CONSENSUS_OPENING_FIELD, captureWasmCreationOpening,
  WASM_CREATION_HELD, WASM_CREATION_OPENING, openWasmCreationState, readWasmCreationRoot,
  retireWasmCreationState};
