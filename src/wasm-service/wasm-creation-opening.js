// The existing WASM opening owns the common root and the receiver-local
// creation record. Writer apply reads ONLY the common root, never local
// permission. The local record is a named phase machine (design
// SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D2'): ADMITTED -> PUBLISHED
// -> RETIRED, or ADMITTED -> RETIRED; RETIRED is terminal. Its identity is the
// seven non-phase fields; only the phase and its detail ever change.
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_PHASE as PHASE,
  SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../constants/service-instance.js';
import {captureInstanceJson, encodeInstanceJson, exactFields, instanceCounter,
  instanceDigest, instanceFailure, instanceIdentifier, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {commitDurably} from '../raft/raft-rs-durable-store.js';
import {WASM_SERVICE_LIFECYCLE_REFUSAL as REFUSAL} from './wasm-service-constants.js';
import {captureConsensusBootstrap, consensusBootstrapDescriptor} from
  '../service/service-consensus-bootstrap.js';
import {runtimeServiceConsensusIdentity} from '../rebalancer/runtime-service-replica-identity.js';
import {CONSENSUS_CREATION_OPENING as OPENING, captureConsensusCreationIntent} from
  '../service/service-consensus-creation-intent.js';
import {validateBinding} from '../control-plane/owners/service-instance-state.js';
import {WASM_WRITER_PROFILE, WRITER_ACTION} from './wasm-writer-profile.js';
import {canonicalWriterCommand} from './wasm-writer-codec.js';

const ROOT = '_wasm_creation_root';
const LOCAL = '_wasm_creation_local';
const LOCAL_BYTES = 8192;
const SQL = Object.freeze({
  TABLES: 'SELECT name FROM sqlite_schema WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'',
  ROOT_EXISTS: 'SELECT name FROM sqlite_schema WHERE type=\'table\' AND name=?',
  CREATE: `CREATE TABLE ${ROOT} (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL);
    CREATE TABLE ${LOCAL} (id INTEGER PRIMARY KEY CHECK(id=1), record TEXT NOT NULL);`,
  INSERT_ROOT: `INSERT INTO ${ROOT} (id,binding) VALUES (1,?)`,
  INSERT_LOCAL: `INSERT INTO ${LOCAL} (id,record) VALUES (1,?)`,
  UPDATE_LOCAL: `UPDATE ${LOCAL} SET record=? WHERE id=1`,
  ROOT: `SELECT binding FROM ${ROOT} WHERE id=1`,
  LOCAL: `SELECT record FROM ${LOCAL} WHERE id=1`,
});
/** The receiver-local record's phases. */
const WASM_CREATION_LOCAL_PHASE = Object.freeze({
  ADMITTED: PHASE.ADMITTED, PUBLISHED: PHASE.PUBLISHED, RETIRED: 'RETIRED',
});
/** The answer of a local phase CAS that wrote, or found the phase already recorded. */
const WASM_CREATION_LOCAL_RECORD = Object.freeze({RECORDED: 'RECORDED', ALREADY: 'ALREADY'});
/** Retirement outcomes owned beside the phase machine (Revision 3 N14). */
const WASM_CREATION_RETIREMENT = Object.freeze({
  RETIRED: WASM_CREATION_LOCAL_PHASE.RETIRED, ALREADY: WASM_CREATION_LOCAL_RECORD.ALREADY,
  CLOSE_UNRESOLVED: 'CLOSE_UNRESOLVED', CREATION_STORAGE_MISSING: OPENING.STORAGE_MISSING,
});
const LOCAL_PHASE = WASM_CREATION_LOCAL_PHASE;
const OPENABLE_PHASES = new Set([PHASE.ADMITTED, PHASE.PUBLISHED]);
const LOCAL_FIELDS = ['format', 'groupId', 'replicaId', 'nodeId', 'token', 'phase', 'opening',
  'storage', 'grant', 'retirement'];
const IDENTITY_FIELDS = ['format', 'groupId', 'replicaId', 'nodeId', 'token', 'opening',
  'storage'];
// What a retirement can derive from the retained creation alone (no live
// replica): it never matches a different physical replica or resource token.
const DERIVED_IDENTITY_FIELDS = ['format', 'groupId', 'replicaId', 'nodeId', 'token'];
const GRANT_FIELDS = ['token', 'at'];
const RETIREMENT_FIELDS = ['reason', 'at'];
// Allowed-from table of the local phase CAS and the detail each phase records.
const LOCAL_PHASE_FROM = Object.freeze({
  [LOCAL_PHASE.PUBLISHED]: Object.freeze([LOCAL_PHASE.ADMITTED]),
  [LOCAL_PHASE.RETIRED]: Object.freeze([LOCAL_PHASE.ADMITTED, LOCAL_PHASE.PUBLISHED]),
});
const LOCAL_PHASE_DETAIL = Object.freeze({
  [LOCAL_PHASE.PUBLISHED]: 'grant', [LOCAL_PHASE.RETIRED]: 'retirement',
});
function chooseLocalOutcome(rules) {
  return rules.find(([matches]) => matches)[1];
}
function validDetail(value, fields) {
  return exactFields(value, fields) && instanceCounter(value.at);
}
function validLocalDetail(record) {
  const grant = record.grant === null || (validDetail(record.grant, GRANT_FIELDS) &&
    instanceDigest(record.grant.token) === instanceDigest(record.token));
  const retirement = record.retirement === null ||
    (validDetail(record.retirement, RETIREMENT_FIELDS) &&
      instanceIdentifier(record.retirement.reason));
  return grant && retirement && chooseLocalOutcome([
    [record.phase === LOCAL_PHASE.ADMITTED, record.grant === null && record.retirement === null],
    [record.phase === LOCAL_PHASE.PUBLISHED, record.grant !== null && record.retirement === null],
    [record.phase === LOCAL_PHASE.RETIRED, record.retirement !== null],
    [true, false],
  ]);
}
function encodeLocal(record) {
  requireInstance(exactFields(record, LOCAL_FIELDS) && validLocalDetail(record));
  return encodeInstanceJson(record, LOCAL_BYTES);
}
/**
 * The receiver-local record, validated exactly; null when the file never held one.
 * @param {Object} db - The replica database connection.
 * @return {{record: Object, encoded: string}|null}
 */
function readWasmCreationLocal(db) {
  if (!db.prepare(SQL.ROOT_EXISTS).get(LOCAL)) return null;
  const encoded = db.prepare(SQL.LOCAL).get()?.record;
  requireInstance(typeof encoded === 'string' && Buffer.byteLength(encoded) <= LOCAL_BYTES,
    OUTCOME.CORRUPT_STATE);
  let record;
  try {
    record = JSON.parse(encoded);
    requireInstance(encodeLocal(record) === encoded);
  } catch {
    requireInstance(false, OUTCOME.CORRUPT_STATE);
  }
  return {record, encoded};
}
function identityMatches(record, identity) {
  const fields = Object.keys(identity);
  return fields.every((field) => IDENTITY_FIELDS.includes(field)) &&
    DERIVED_IDENTITY_FIELDS.every((field) => fields.includes(field)) &&
    fields.every((field) => instanceDigest(record[field]) === instanceDigest(identity[field]));
}
function localTransition(stored, from, to) {
  return chooseLocalOutcome([
    [stored === to, WASM_CREATION_LOCAL_RECORD.ALREADY],
    [stored === LOCAL_PHASE.RETIRED, REFUSAL.CREATION_RETIRED],
    [stored !== from || !LOCAL_PHASE_FROM[to]?.includes(from), OUTCOME.INVALID_EXPECTED_STATE],
    [true, WASM_CREATION_LOCAL_RECORD.RECORDED],
  ]);
}
function writeLocalPhase(db, local, to, detail) {
  const field = LOCAL_PHASE_DETAIL[to];
  const record = {...local.record, phase: to, [field]: detail[field]};
  db.prepare(SQL.UPDATE_LOCAL).run(encodeLocal(record));
  return record;
}
/**
 * The local phase CAS, committed durably (synchronous=FULL around one
 * transaction) on the given connection.
 * @param {Object} db - An open replica database connection.
 * @param {{from: string, to: string, detail: Object}} change - Expected
 *   stored phase, next phase and its detail ({grant} or {retirement}).
 * @return {{outcome: string, record?: Object}} RECORDED, ALREADY, or the
 *   typed refusal (CREATION_RETIRED, INVALID_EXPECTED_STATE).
 */
function recordWasmCreationLocalPhase(db, {from, to, detail}) {
  return commitDurably(db, () => {
    const local = readWasmCreationLocal(db);
    requireInstance(local !== null, OUTCOME.CORRUPT_STATE);
    const outcome = localTransition(local.record.phase, from, to);
    if (outcome !== WASM_CREATION_LOCAL_RECORD.RECORDED) return {outcome};
    return {outcome, record: writeLocalPhase(db, local, to, detail)};
  });
}
function tombstoneOn(db, identity, retirement) {
  return commitDurably(db, () => {
    const local = readWasmCreationLocal(db);
    const outcome = chooseLocalOutcome([
      [local === null, WASM_CREATION_RETIREMENT.CREATION_STORAGE_MISSING],
      [local !== null && !identityMatches(local.record, identity), OUTCOME.CONTENT_CONFLICT],
      [local?.record.phase === LOCAL_PHASE.RETIRED, WASM_CREATION_RETIREMENT.ALREADY],
      [true, WASM_CREATION_RETIREMENT.RETIRED],
    ]);
    if (outcome === WASM_CREATION_RETIREMENT.RETIRED) {
      writeLocalPhase(db, local, LOCAL_PHASE.RETIRED, {retirement});
    }
    return {outcome};
  });
}
/**
 * The one tombstone function: ADMITTED|PUBLISHED -> RETIRED, durably, on the
 * live replica's own connection ({db}) or, with no live replica, by opening
 * the file ({dbPath}) on a connection of this node's process. A missing file
 * is never created (nothing local exists to retire). A file without a local
 * record cannot reopen either (a retained opening requires it), so it is the
 * same typed absence. A tombstone is a fail-closed effect, so a by-path
 * identity may carry only the fields derivable from the retained creation,
 * plus the present file's own storage identity (RECOVERY-DESIGN-20261017 R1-B).
 * @param {{db?: Object, dbPath?: string}} target
 * @param {Object} identity - Identity projection to match (see IDENTITY_FIELDS).
 * @param {{reason: string, at: number}} retirement
 * @return {{outcome: string}} RETIRED, ALREADY, CREATION_STORAGE_MISSING or
 *   CONTENT_CONFLICT.
 */
function tombstoneWasmCreationLocal(target, identity, retirement) {
  if (target.db) return tombstoneOn(target.db, identity, retirement);
  if (!fs.existsSync(target.dbPath)) {
    return {outcome: WASM_CREATION_RETIREMENT.CREATION_STORAGE_MISSING};
  }
  const db = new Database(target.dbPath, {fileMustExist: true});
  try {
    return tombstoneOn(db, identity, retirement);
  } finally {
    db.close();
  }
}
/**
 * The identity projection of a live bound replica's local record.
 * @param {Object} replica - The bound WasmServiceReplica.
 * @return {Object} The seven identity fields.
 */
function wasmCreationLocalIdentity(replica) {
  const creation = replica.consensusCreation;
  return {format: LIMIT.FORMAT, groupId: creation.identity.groupId,
    replicaId: replica.replicaId, nodeId: replica.nodeId, token: creation.token,
    opening: replica.creationOpening.record,
    storage: replica.dataDirectoryManager.getWasmServiceFileIdentity(
      creation.identity.groupId, replica.replicaId)};
}
function captureWasmCreation(definition, replicaConfig, nodeId) {
  const value = replicaConfig.consensusCreation;
  if (value === undefined) return null;
  const descriptor = consensusBootstrapDescriptor(value);
  const {origin} = captureConsensusBootstrap(descriptor, {consensusCreation: value});
  const app = JSON.parse(origin.intent.descriptor.runtimeConfig).definition;
  requireInstance(instanceDigest(definition) ===
    instanceDigest({...app, serviceId: descriptor.serviceId}), OUTCOME.INVALID_LINEAGE);
  const identity = runtimeServiceConsensusIdentity(origin.intent.consensusBinding,
    origin.intent.consensusSlotRequest);
  requireInstance(identity.nodeId === nodeId, OUTCOME.INVALID_LINEAGE);
  return {...origin, identity};
}
async function resolveWasmCreationAdmission(replica) {
  const creation = replica.consensusCreation;
  if (creation === null) return;
  const owner = replica.serviceDefinitionsOwner;
  requireInstance(typeof owner?.resolveInstanceResource === 'function', OUTCOME.UNAVAILABLE);
  const result = await owner.resolveInstanceResource(creation.intent.consensusBinding,
    creation.token);
  requireInstance(result?.outcome === OUTCOME.ADMITTED, result?.outcome ?? OUTCOME.UNKNOWN);
  // An admitted or already granted resource may open; CLOSED/RELEASING never.
  requireInstance(OPENABLE_PHASES.has(result.phase), OUTCOME.RESOURCE_CLOSED);
  requireInstance(instanceDigest(result.token) === instanceDigest(creation.token),
    OUTCOME.CONTENT_CONFLICT);
  requireInstance(typeof replica.consensusOpeningOwner?.claimConsensusCreationOpening === 'function',
    OUTCOME.UNAVAILABLE);
  const opening = await replica.consensusOpeningOwner.claimConsensusCreationOpening(creation);
  requireInstance(opening?.outcome === OPENING.FRESH || opening?.outcome === OPENING.RETAINED,
    opening?.outcome ?? OUTCOME.UNKNOWN);
  replica.creationOpening = opening;
  // The metadata phase this open observed, consumed once by the open-time
  // serving decision (D2'); it is never retained as a later authority.
  return result.phase;
}
/** One deterministic INIT from the immutable common root, never a new caller nonce. */
function boundWasmInitialization(binding) {
  requireInstance(binding !== null &&
    binding.profileDigest === instanceDigest(WASM_WRITER_PROFILE.id), OUTCOME.INVALID_LINEAGE);
  return canonicalWriterCommand({type: WASM_WRITER_PROFILE.type,
    profile: WASM_WRITER_PROFILE.id, action: WRITER_ACTION.INIT,
    serviceId: binding.serviceDefinitionId, incarnation: binding.incarnation,
    nonce: binding.requestId.nonce});
}
function isCreationOnlyDatabase(tables) {
  return tables.length === 2 && tables.includes(ROOT) && tables.includes(LOCAL);
}
function readWasmCreationBinding(db) {
  if (!db.prepare(SQL.ROOT_EXISTS).get(ROOT)) return null;
  const row = db.prepare(SQL.ROOT).get();
  requireInstance(typeof row?.binding === 'string' &&
    Buffer.byteLength(row.binding) <= LIMIT.BINDING_BYTES, OUTCOME.CORRUPT_STATE);
  const binding = captureInstanceJson(JSON.parse(row.binding), LIMIT.BINDING_BYTES);
  validateBinding(binding, {tenantId: binding.tenantId,
    serviceDefinitionId: binding.serviceDefinitionId});
  requireInstance(encodeInstanceJson(binding, LIMIT.BINDING_BYTES) === row.binding,
    OUTCOME.CORRUPT_STATE);
  return binding;
}
/**
 * Write (FRESH) or verify (RETAINED) the common root and the local record.
 * A retained record must match the identity projection exactly and be
 * ADMITTED or PUBLISHED; RETIRED refuses typed before any native handle opens.
 * @param {Object} replica - The bound WasmServiceReplica with replica.db open.
 * @return {string|undefined} The local phase, for the open-time serving decision.
 */
function openWasmCreationRecords(replica) {
  const creation = replica.consensusCreation;
  if (creation === null) return undefined;
  const db = replica.db;
  const binding = creation.intent.consensusBinding;
  const identity = wasmCreationLocalIdentity(replica);
  const tables = db.prepare(SQL.TABLES).all().map((row) => row.name);
  if (replica.creationOpening.outcome === OPENING.FRESH) {
    requireInstance(tables.length === 0, OUTCOME.CONTENT_CONFLICT);
    db.exec(SQL.CREATE);
    db.prepare(SQL.INSERT_ROOT).run(encodeInstanceJson(binding, LIMIT.BINDING_BYTES));
    db.prepare(SQL.INSERT_LOCAL).run(encodeLocal({...identity, phase: LOCAL_PHASE.ADMITTED,
      grant: null, retirement: null}));
  } else {
    requireInstance(tables.length > 0, OPENING.STORAGE_MISSING);
    requireInstance(tables.includes(ROOT) && tables.includes(LOCAL), OUTCOME.CORRUPT_STATE);
  }
  requireInstance(instanceDigest(readWasmCreationBinding(db)) === instanceDigest(binding),
    OUTCOME.CONTENT_CONFLICT);
  const local = readWasmCreationLocal(db);
  requireInstance(local !== null, OUTCOME.CORRUPT_STATE);
  requireInstance(identityMatches(local.record, identity), OUTCOME.CONTENT_CONFLICT);
  requireInstance(local.record.phase !== LOCAL_PHASE.RETIRED, REFUSAL.CREATION_RETIRED);
  return local.record.phase;
}
/**
 * The by-path local reader's answers (design RECOVERY-DESIGN-20261017 R1-A,
 * R2-C N13): the record's phase, the two absences, or the two refusals.
 */
const WASM_CREATION_LOCAL_INSPECTION = Object.freeze({
  ABSENT_UNCLAIMED: 'ABSENT_UNCLAIMED', ABSENT_CLAIMED: 'ABSENT_CLAIMED',
  ADMITTED: LOCAL_PHASE.ADMITTED, PUBLISHED: LOCAL_PHASE.PUBLISHED,
  RETIRED: LOCAL_PHASE.RETIRED, CORRUPT_STATE: OUTCOME.CORRUPT_STATE,
  CONTENT_CONFLICT: OUTCOME.CONTENT_CONFLICT,
});
const INSPECTION = WASM_CREATION_LOCAL_INSPECTION;
// The (opening, file) classification of one open read-only file (N13).
function inspectOpenFile(db, identity, binding) {
  const tables = db.prepare(SQL.TABLES).all().map((row) => row.name);
  const claimed = identity.opening !== null;
  if (tables.length === 0) return claimed ? INSPECTION.ABSENT_CLAIMED : INSPECTION.ABSENT_UNCLAIMED;
  requireInstance(claimed, OUTCOME.CONTENT_CONFLICT);
  requireInstance(tables.includes(ROOT) && tables.includes(LOCAL), OUTCOME.CORRUPT_STATE);
  requireInstance(instanceDigest(readWasmCreationBinding(db)) === instanceDigest(binding),
    OUTCOME.CONTENT_CONFLICT);
  const local = readWasmCreationLocal(db);
  requireInstance(local !== null, OUTCOME.CORRUPT_STATE);
  requireInstance(identityMatches(local.record, identity), OUTCOME.CONTENT_CONFLICT);
  return local.record.phase;
}
/**
 * Read one creation's local file by path, read-only (design
 * RECOVERY-DESIGN-20261017 R1-A, R2-F): no schema creation, no checkpoint, no
 * write; the connection closes before any open of the same file. Compares all
 * seven identity fields (storage and opening included) and the root binding.
 * Precondition: the data directory is writable (the read-only connection of
 * a WAL file needs an existing or creatable -shm).
 * @param {string} dbPath - The creation's database path on this node.
 * @param {Object} identity - The seven identity fields (opening/storage may be null).
 * @param {Object} binding - The retained creation's consensus binding.
 * @return {{outcome: string}} A WASM_CREATION_LOCAL_INSPECTION answer.
 */
function inspectWasmCreationLocal(dbPath, identity, binding) {
  if (!fs.existsSync(dbPath)) {
    return {outcome: identity.opening === null ? INSPECTION.ABSENT_UNCLAIMED :
      INSPECTION.ABSENT_CLAIMED};
  }
  let db = null;
  try {
    db = new Database(dbPath, {readonly: true, fileMustExist: true});
    return {outcome: inspectOpenFile(db, identity, binding)};
  } catch (error) {
    const refusal = instanceFailure(error, OUTCOME.CORRUPT_STATE).outcome;
    return {outcome: refusal === OUTCOME.CONTENT_CONFLICT ? INSPECTION.CONTENT_CONFLICT :
      INSPECTION.CORRUPT_STATE};
  } finally {
    db?.close();
  }
}
/**
 * The lifecycle side of the by-path reader: this node's path and the identity
 * derived from the retained creation ({intent, token|null, opening|null}).
 * @param {Object} lifecycle - The WasmServiceLifecycle of this node.
 * @param {Object} creation - The inventoried creation.
 * @return {{outcome: string}} A WASM_CREATION_LOCAL_INSPECTION answer or a
 *   typed refusal of the creation itself.
 */
function inspectRetainedWasmCreation(lifecycle, creation) {
  try {
    const intent = captureConsensusCreationIntent(creation?.intent);
    const physical = runtimeServiceConsensusIdentity(intent.consensusBinding,
      intent.consensusSlotRequest);
    requireInstance(physical.nodeId === lifecycle.nodeId, OUTCOME.INVALID_LINEAGE);
    const directory = lifecycle.dataDirectoryManager;
    const dbPath = directory.getWasmServiceDbPath(physical.groupId, physical.replicaId);
    const storage = fs.existsSync(dbPath) ?
      directory.getWasmServiceFileIdentity(physical.groupId, physical.replicaId) : null;
    return inspectWasmCreationLocal(dbPath, {format: LIMIT.FORMAT, groupId: physical.groupId,
      replicaId: physical.replicaId, nodeId: physical.nodeId, token: creation.token ?? null,
      opening: creation.opening ?? null, storage}, intent.consensusBinding);
  } catch (error) {
    return instanceFailure(error);
  }
}
/** Attach opening context before native construction; nullable defaults are owned here. */
function initializeWasmCreationContext(replica, options) {
  replica.consensusCreation = options.consensusCreation ?? null;
  replica.consensusOpeningOwner = options.consensusOpeningOwner ?? null;
  replica.serviceDefinitionsOwner = options.serviceDefinitionsOwner ?? null;
  replica.dataDirectoryManager = options.dataDirectoryManager ?? null;
  replica.creationOpening = null;
}
export {initializeWasmCreationContext, captureWasmCreation, resolveWasmCreationAdmission,
  openWasmCreationRecords, readWasmCreationLocal, recordWasmCreationLocalPhase,
  tombstoneWasmCreationLocal, wasmCreationLocalIdentity,
  WASM_CREATION_LOCAL_PHASE, WASM_CREATION_LOCAL_RECORD, WASM_CREATION_RETIREMENT,
  WASM_CREATION_LOCAL_INSPECTION, inspectWasmCreationLocal, inspectRetainedWasmCreation,
  isCreationOnlyDatabase, readWasmCreationBinding, boundWasmInitialization};
