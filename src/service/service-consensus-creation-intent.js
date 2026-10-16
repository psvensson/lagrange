// ServiceLifecycleManager's original-intent handoff. This is not a second
// execution orchestrator: it ends at retained admission and starts no resource.
import {RUNTIME_KIND, UNIFIED_SERVICE_TYPE, SERVICE_LIFECYCLE_OPERATION,
  SERVICE_OPERATION_STATE as OP_STATE} from '../constants/index.js';
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_OUTCOME as OUTCOME,
  SERVICE_INSTANCE_PHASE as PHASE} from '../constants/service-instance.js';
import {WASM_OPERATION_COL as COL} from '../wasm-service/wasm-meta-models-constants.js';
import {buildGetOperationSQL, buildRetainedCreationOperationSQL,
  buildRetainedCreationAdmissionSQL} from '../wasm-service/operation-lifecycle.js';
import {captureInstanceJson, encodeInstanceJson, exactFields, instanceIdentifier,
  instanceDigest, requireInstance, instanceFailure, ServiceInstanceContractError} from
  '../control-plane/owners/service-instance-contract.js';
import {validateBinding, validSlotRequest, matchesInstanceResourceToken} from
  '../control-plane/owners/service-instance-state.js';
import {validateServiceDescriptor} from './service-descriptor.js';

const COMMAND_PREFIX = 'consensus-create:';
const BOUND_DESCRIPTOR_FIELDS = [
  'consensusBinding', 'consensusSlotRequest', 'consensusResourceToken',
];
const INTENT_FIELDS = ['format', 'descriptor', 'consensusBinding', 'consensusSlotRequest'];
const INTENT_BYTES = LIMIT.REQUEST_BYTES + LIMIT.BINDING_BYTES + LIMIT.SLOT_BYTES;
const RESULT = Object.freeze({
  ADMISSION_RETAINED: 'ADMISSION_RETAINED', INTENT_NOT_FOUND: 'INTENT_NOT_FOUND',
  TERMINAL_OPERATION: 'TERMINAL_OPERATION', HELD: 'held',
});
const TERMINAL = new Set([OP_STATE.COMPLETED, OP_STATE.FAILED, OP_STATE.CANCELLED]);
const LIVE_PHASES = new Set([PHASE.ADMITTED, PHASE.PUBLISHED]);
function commandOf(intent) {
  return `${COMMAND_PREFIX}${intent.descriptor.serviceId}`;
}
function captureIntent(value) {
  const intent = captureInstanceJson(value, INTENT_BYTES);
  requireInstance(exactFields(intent, INTENT_FIELDS) && intent.format === LIMIT.FORMAT);
  const descriptor = intent.descriptor;
  requireInstance(validateServiceDescriptor(descriptor).valid);
  requireInstance(descriptor.serviceType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
    descriptor.runtimeKind === RUNTIME_KIND.WASM_COMPONENT);
  validateBinding(intent.consensusBinding,
    {tenantId: descriptor.tenantId, serviceDefinitionId: descriptor.serviceId});
  requireInstance(validSlotRequest(intent.consensusSlotRequest));
  requireInstance(descriptor.replicaId === intent.consensusSlotRequest.replicaId &&
    instanceDigest(captureInstanceJson(JSON.parse(descriptor.runtimeConfig))
      ?.definition ?? null) ===
      intent.consensusBinding.definitionDigest, OUTCOME.INVALID_LINEAGE);
  encodeInstanceJson(descriptor, LIMIT.REQUEST_BYTES);
  encodeInstanceJson(intent.consensusSlotRequest, LIMIT.SLOT_BYTES);
  return intent;
}
function requireDependencies(manager) {
  requireInstance(typeof manager._operationWriter === 'function' &&
    typeof manager._idempotencyReader === 'function' &&
    typeof manager._serviceDefinitionsOwner?.reserveInstanceResource === 'function' &&
    typeof manager._serviceDefinitionsOwner?.resolveInstanceResource === 'function',
  OUTCOME.UNAVAILABLE);
}
async function readJournal(manager, operationId) {
  const query = buildGetOperationSQL(operationId);
  const rows = await manager._idempotencyReader(query.sql, query.params);
  requireInstance(Array.isArray(rows) && rows.length <= 1, OUTCOME.CORRUPT_STATE);
  return rows[0] ?? null;
}
function journalIdentity(intent) {
  return {operationId: intent.consensusSlotRequest.operationId,
    tenantId: intent.descriptor.tenantId, command: commandOf(intent),
    intentJson: encodeInstanceJson(intent, INTENT_BYTES)};
}
function confirmIntentRow(row, identity) {
  requireInstance(row !== null, OUTCOME.UNKNOWN);
  requireInstance(row[COL.OPERATION_ID] === identity.operationId &&
    row[COL.TENANT_ID] === identity.tenantId && row[COL.COMMAND] === identity.command &&
    row[COL.INTENT_JSON] === identity.intentJson && row[COL.IDEMPOTENCY_KEY] === null,
  OUTCOME.CONTENT_CONFLICT);
  requireInstance(TERMINAL.has(row[COL.STATE]) ||
    row[COL.STATE] === OP_STATE.PENDING || row[COL.STATE] === OP_STATE.IN_PROGRESS,
  OUTCOME.CORRUPT_STATE);
}
async function writeAndObserve(manager, query, operationId) {
  // Neither an acknowledged callback nor a thrown callback proves persisted
  // state. Exactly one authoritative reread follows; no rewritten SQL retry.
  try {
    await manager._operationWriter(query.sql, query.params);
  } catch {
    // Resolve the exact original row, including an applied/lost-answer write.
  }
  try {
    return await readJournal(manager, operationId);
  } catch {
    throw new ServiceInstanceContractError(OUTCOME.UNKNOWN);
  }
}
function requireObserved(row) {
  requireInstance(row !== null, OUTCOME.UNKNOWN);
}
function retainedToken(row, intent) {
  const encoded = row[COL.ADMISSION_JSON];
  if (encoded === null) {
    requireInstance(row[COL.STATE] === OP_STATE.PENDING, OUTCOME.CORRUPT_STATE);
    return null;
  }
  try {
    requireInstance(typeof encoded === 'string' && Buffer.byteLength(encoded) <= LIMIT.SLOT_BYTES);
    const token = JSON.parse(encoded);
    requireInstance(encodeInstanceJson(token, LIMIT.SLOT_BYTES) === encoded &&
      row[COL.STATE] === OP_STATE.IN_PROGRESS &&
      matchesInstanceResourceToken(intent.consensusBinding, intent.consensusSlotRequest, token));
    return token;
  } catch {
    requireInstance(false, OUTCOME.CORRUPT_STATE);
  }
}
function unresolvedResult(result) {
  if (result?.outcome === OUTCOME.UNAVAILABLE) {
    return {outcome: OUTCOME.UNKNOWN, reason: OUTCOME.UNAVAILABLE};
  }
  return result ?? {outcome: OUTCOME.UNKNOWN};
}
async function reserveAndRetain(manager, intent, identity) {
  let reservation;
  try {
    reservation = await manager._serviceDefinitionsOwner.reserveInstanceResource(
      intent.consensusBinding, intent.consensusSlotRequest);
  } catch {
    return {outcome: OUTCOME.UNKNOWN};
  }
  if (reservation?.outcome !== OUTCOME.ADMITTED) return unresolvedResult(reservation);
  const token = captureInstanceJson(reservation.token, LIMIT.SLOT_BYTES);
  requireInstance(matchesInstanceResourceToken(intent.consensusBinding,
    intent.consensusSlotRequest, token), OUTCOME.CORRUPT_STATE);
  const query = buildRetainedCreationAdmissionSQL({...identity,
    admissionJson: encodeInstanceJson(token, LIMIT.SLOT_BYTES), now: manager._timeSource.now()});
  const row = await writeAndObserve(manager, query, identity.operationId);
  requireObserved(row);
  confirmIntentRow(row, identity);
  if (TERMINAL.has(row[COL.STATE])) return {outcome: RESULT.TERMINAL_OPERATION};
  const stored = retainedToken(row, intent);
  requireInstance(stored !== null, OUTCOME.UNKNOWN);
  return {outcome: OUTCOME.ADMITTED, token: stored};
}
async function resolveRetainedAdmission(manager, intent, identity, token) {
  let resource;
  try {
    resource = await manager._serviceDefinitionsOwner.resolveInstanceResource(
      intent.consensusBinding, token);
  } catch {
    return {outcome: OUTCOME.UNKNOWN, operationId: identity.operationId};
  }
  if (resource?.outcome !== OUTCOME.ADMITTED) return unresolvedResult(resource);
  requireInstance(matchesInstanceResourceToken(intent.consensusBinding,
    intent.consensusSlotRequest, resource.token), OUTCOME.CORRUPT_STATE);
  if (!LIVE_PHASES.has(resource.phase)) return {outcome: OUTCOME.RESOURCE_CLOSED};
  return {outcome: RESULT.ADMISSION_RETAINED, operationId: identity.operationId,
    intent, token, phase: resource.phase};
}
async function continueIntent(manager, intent, row) {
  const identity = journalIdentity(intent);
  confirmIntentRow(row, identity);
  if (TERMINAL.has(row[COL.STATE])) return {outcome: RESULT.TERMINAL_OPERATION};
  let token = retainedToken(row, intent);
  if (token === null) {
    const admission = await reserveAndRetain(manager, intent, identity);
    if (admission.outcome !== OUTCOME.ADMITTED) return admission;
    token = admission.token;
  }
  return resolveRetainedAdmission(manager, intent, identity, token);
}
async function prepareConsensusCreation(manager, value, context = {}) {
  try {
    const intent = captureIntent(value);
    requireDependencies(manager);
    await manager._enforceRuntimePolicy(
      SERVICE_LIFECYCLE_OPERATION.CREATE, intent.descriptor, context);
    const identity = journalIdentity(intent);
    let row = await readJournal(manager, identity.operationId);
    if (row === null) {
      const query = buildRetainedCreationOperationSQL(
        {...identity, now: manager._timeSource.now()});
      row = await writeAndObserve(manager, query, identity.operationId);
      requireObserved(row);
    }
    return await continueIntent(manager, intent, row);
  } catch (error) {
    return instanceFailure(error);
  }
}
async function recoverConsensusCreation(manager, operationId, context = {}) {
  try {
    requireInstance(instanceIdentifier(operationId));
    requireDependencies(manager);
    const row = await readJournal(manager, operationId);
    if (row === null) return {outcome: RESULT.INTENT_NOT_FOUND};
    const encoded = row[COL.INTENT_JSON];
    requireInstance(typeof encoded === 'string' && Buffer.byteLength(encoded) <= INTENT_BYTES,
      OUTCOME.CORRUPT_STATE);
    let intent;
    try {
      intent = captureIntent(JSON.parse(encoded));
    } catch {
      requireInstance(false, OUTCOME.CORRUPT_STATE);
    }
    requireInstance(intent.consensusSlotRequest.operationId === operationId,
      OUTCOME.CONTENT_CONFLICT);
    await manager._enforceRuntimePolicy(
      SERVICE_LIFECYCLE_OPERATION.CREATE, intent.descriptor, context);
    return await continueIntent(manager, intent, row);
  } catch (error) {
    return instanceFailure(error);
  }
}
function isConsensusCreationRow(row) {
  return (typeof row[COL.COMMAND] === 'string' && row[COL.COMMAND].startsWith(COMMAND_PREFIX)) ||
    row[COL.INTENT_JSON] != null || row[COL.ADMISSION_JSON] != null;
}
async function recoverConsensusCreationRow(manager, row, context) {
  const operationId = row[COL.OPERATION_ID];
  const result = await recoverConsensusCreation(manager, operationId, context);
  return {status: RESULT.HELD, operationId, ...result};
}
function isBoundConsensusDescriptor(value) {
  return value !== null && typeof value === 'object' &&
    BOUND_DESCRIPTOR_FIELDS.some((field) => Object.hasOwn(value, field));
}
export {isBoundConsensusDescriptor, prepareConsensusCreation, recoverConsensusCreation,
  isConsensusCreationRow, recoverConsensusCreationRow};
