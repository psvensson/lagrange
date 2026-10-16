// The existing WASM opening owns the common root and receiver-local bootstrap
// record. Writer apply reads ONLY the common root, never local permission.
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_PHASE as PHASE,
  SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../constants/service-instance.js';
import {captureInstanceJson, encodeInstanceJson, instanceDigest, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {captureConsensusBootstrap, consensusBootstrapDescriptor} from
  '../service/service-consensus-bootstrap.js';
import {runtimeServiceConsensusIdentity} from '../rebalancer/runtime-service-replica-identity.js';
import {CONSENSUS_CREATION_OPENING as OPENING} from '../service/service-consensus-creation-intent.js';
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
  ROOT: `SELECT binding FROM ${ROOT} WHERE id=1`,
  LOCAL: `SELECT record FROM ${LOCAL} WHERE id=1`,
});
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
  requireInstance(result.phase === PHASE.ADMITTED, OUTCOME.RESOURCE_CLOSED);
  requireInstance(instanceDigest(result.token) === instanceDigest(creation.token),
    OUTCOME.CONTENT_CONFLICT);
  requireInstance(typeof replica.consensusOpeningOwner?.claimConsensusCreationOpening === 'function',
    OUTCOME.UNAVAILABLE);
  const opening = await replica.consensusOpeningOwner.claimConsensusCreationOpening(creation);
  requireInstance(opening?.outcome === OPENING.FRESH || opening?.outcome === OPENING.RETAINED,
    opening?.outcome ?? OUTCOME.UNKNOWN);
  replica.creationOpening = opening;
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
function openWasmCreationRecords(replica) {
  const creation = replica.consensusCreation;
  if (creation === null) return;
  const db = replica.db;
  const binding = creation.intent.consensusBinding;
  const local = {format: LIMIT.FORMAT, groupId: creation.identity.groupId,
    replicaId: replica.replicaId, nodeId: replica.nodeId, token: creation.token,
    phase: PHASE.ADMITTED, opening: replica.creationOpening.record,
    storage: replica.dataDirectoryManager.getWasmServiceFileIdentity(
      creation.identity.groupId, replica.replicaId)};
  const encodedLocal = encodeInstanceJson(local, LOCAL_BYTES);
  const tables = db.prepare(SQL.TABLES).all().map((row) => row.name);
  if (replica.creationOpening.outcome === OPENING.FRESH) {
    requireInstance(tables.length === 0, OUTCOME.CONTENT_CONFLICT);
    db.exec(SQL.CREATE);
    db.prepare(SQL.INSERT_ROOT).run(encodeInstanceJson(binding, LIMIT.BINDING_BYTES));
    db.prepare(SQL.INSERT_LOCAL).run(encodedLocal);
  } else {
    requireInstance(tables.length > 0, OPENING.STORAGE_MISSING);
    requireInstance(tables.includes(ROOT) && tables.includes(LOCAL), OUTCOME.CORRUPT_STATE);
  }
  requireInstance(instanceDigest(readWasmCreationBinding(db)) === instanceDigest(binding),
    OUTCOME.CONTENT_CONFLICT);
  requireInstance(db.prepare(SQL.LOCAL).get()?.record === encodedLocal, OUTCOME.CONTENT_CONFLICT);
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
  openWasmCreationRecords,
  isCreationOnlyDatabase, readWasmCreationBinding, boundWasmInitialization};
