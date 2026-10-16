// ServiceDefinitionsOwner's private row adapter and one-shot durable mutation
// interaction. Transport retries reuse the exact predicate; no semantic CAS loop.
import {TABLES} from '../../constants/index.js';
import {SERVICE_INSTANCE_ACTION as ACTION, SERVICE_INSTANCE_LIMIT as LIMIT,
  SERVICE_INSTANCE_OUTCOME as OUTCOME, SERVICE_INSTANCE_PHASE as PHASE, SERVICE_INSTANCE_DECISION as DECISION} from
  '../../constants/service-instance.js';
import {SERVICE_INSTALL_CATALOG_ERROR_CODE} from './service-install-catalog-contract.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';
import {ServiceInstanceContractError, requireInstance, instanceIdentifier,
  captureInstanceJson, captureSelectionRequest, encodeInstanceJson, instanceFailure} from
  './service-instance-contract.js';
import {emptyInstanceState, decodeInstanceState, selectionHistory, selectionAdmission,
  validCreationLineage, selectInstanceState, validSlotRequest, reserveResourceState,
  resolveResourceState, changeResourceState, validResourceToken} from './service-instance-state.js';

const ROWS = new WeakMap();
class InstanceRowOwner extends SystemMetadataOwnerBase {
  static TABLE_NAME = TABLES.SERVICE_INSTANCES;
  constructor(owner, options) {
    super(options);
    this.owner = owner;
  }
  getOwnerName() {
    return this.owner.getOwnerName();
  }
}
function registerInstanceRows(owner, options) {
  ROWS.set(owner, new InstanceRowOwner(owner, options));
}
async function readState(owner, id, options) {
  const result = await ROWS.get(owner).readByPrimaryKeyObservation(id, options);
  requireInstance(result?.success !== false, OUTCOME.UNAVAILABLE);
  const rows = Array.isArray(result) ? result : result?.rows;
  requireInstance(Array.isArray(rows) && rows.length <= 1, OUTCOME.CORRUPT_STATE);
  if (rows.length === 0) return {outcome: OUTCOME.NEVER_CREATED, row: null};
  try {
    return {outcome: OUTCOME.CURRENT, row: rows[0], state: decodeInstanceState(rows[0], id)};
  } catch {
    throw new ServiceInstanceContractError(OUTCOME.CORRUPT_STATE);
  }
}
function affectedRows(result) {
  return result?.partitionResult?.affectedRows ?? result?.affectedRows;
}
async function commitState(owner, id, observation, change, options, resolve) {
  let state;
  try {
    state = encodeInstanceJson(change.next, LIMIT.STATE_BYTES);
  } catch {
    return {outcome: OUTCOME.CAPACITY_EXHAUSTED};
  }
  const rows = ROWS.get(owner);
  let submitted;
  try {
    submitted = observation.row === null ?
      await rows.insertRow({service_id: id, format: LIMIT.FORMAT, state}, options) :
      await rows.updateWhere({service_id: id, format: LIMIT.FORMAT},
        {state}, options);
  } catch {
    submitted = null;
  }
  if (affectedRows(submitted) === 1) return change.result;
  // One authoritative resolution, never another rewritten mutation. A successful
  // gateway envelope with zero changes is not a successful conditional mutation.
  const fallback = affectedRows(submitted) === 0 ? OUTCOME.STATE_CHANGED : OUTCOME.UNKNOWN;
  try {
    const current = await readState(owner, id, options);
    return resolve(current) ?? {outcome: fallback};
  } catch (error) {
    return {outcome: OUTCOME.UNKNOWN, reason: instanceFailure(error).outcome};
  }
}
async function creationRevision(owner, request) {
  if (request.action === ACTION.RETIRE) return null;
  try {
    return await owner.catalogOwner.getCreationRevision(request.revisionId, request.tenantId);
  } catch (error) {
    if (error.code === SERVICE_INSTALL_CATALOG_ERROR_CODE.PACKAGE_NOT_ELIGIBLE) {
      throw new ServiceInstanceContractError(OUTCOME.INVALID_LINEAGE);
    }
    throw error;
  }
}
async function selectConsensusInstance(owner, value, options = {}) {
  try {
    const request = captureSelectionRequest(value);
    const id = request.requestId.serviceDefinitionId;
    const observation = await readState(owner, id, options);
    const state = observation.state ?? emptyInstanceState(request.tenantId);
    requireInstance(state.tenantId === request.tenantId, OUTCOME.INVALID_LINEAGE);
    const admission = selectionAdmission(state, request);
    if (admission.outcome !== DECISION.PROPOSE) return admission;
    // RETIRE cannot invent a never-created subject without immutable lineage.
    if (request.action === ACTION.RETIRE && observation.row === null) {
      return {outcome: OUTCOME.INVALID_LINEAGE};
    }
    const revision = await creationRevision(owner, request);
    requireInstance(validCreationLineage(request, revision), OUTCOME.INVALID_LINEAGE);
    const change = selectInstanceState(state, request, revision);
    return await commitState(owner, id, observation, change, options,
      (current) => {
        if (current.outcome === OUTCOME.NEVER_CREATED) return null;
        const history = selectionHistory(current.state, request);
        return history.outcome === DECISION.UNDECIDED ? null : history;
      });
  } catch (error) {
    return instanceFailure(error);
  }
}
async function getCurrentInstance(owner, id, options = {}) {
  try {
    requireInstance(instanceIdentifier(id));
    const observation = await readState(owner, id, options);
    const state = observation.state;
    if (observation.outcome === OUTCOME.NEVER_CREATED) {
      return {outcome: OUTCOME.NEVER_CREATED, version: 0, selected: null};
    }
    return {outcome: OUTCOME.CURRENT, version: state.version,
      selected: state.selected?.binding ?? null, retiring: state.retiring?.binding ?? null};
  } catch (error) {
    return instanceFailure(error);
  }
}
function captureResourceInput(binding, value, validator) {
  const capturedBinding = captureInstanceJson(binding, LIMIT.BINDING_BYTES);
  requireInstance(instanceIdentifier(capturedBinding.serviceDefinitionId));
  const input = captureInstanceJson(value, LIMIT.SLOT_BYTES);
  requireInstance(validator(input));
  return {binding: capturedBinding, input};
}
async function mutateResource(owner, binding, input, options, decide) {
  const id = binding.serviceDefinitionId;
  const observation = await readState(owner, id, options);
  if (observation.outcome === OUTCOME.NEVER_CREATED) return {outcome: OUTCOME.STALE_BINDING};
  const change = decide(observation.state, binding, input);
  if (!change.next) return change.result;
  return commitState(owner, id, observation, change, options, (current) => {
    if (current.outcome === OUTCOME.NEVER_CREATED) return null;
    const resolved = decide(current.state, binding, input);
    return resolved.next ? null : resolved.result;
  });
}
async function reserveInstanceResource(owner, value, request, options = {}) {
  try {
    const captured = captureResourceInput(value, request, validSlotRequest);
    return await mutateResource(owner, captured.binding, captured.input,
      options, reserveResourceState);
  } catch (error) {
    return instanceFailure(error);
  }
}
async function resolveInstanceResource(owner, value, token, options = {}) {
  try {
    const captured = captureResourceInput(value, token, validResourceToken);
    const observation = await readState(owner, captured.binding.serviceDefinitionId, options);
    return observation.outcome === OUTCOME.NEVER_CREATED ?
      {outcome: OUTCOME.HISTORY_UNAVAILABLE} :
      resolveResourceState(observation.state, captured.binding, captured.input);
  } catch (error) {
    return instanceFailure(error);
  }
}
async function transitionInstanceResource(owner, value, token, phase, options = {}) {
  try {
    const captured = captureResourceInput(value, token, validResourceToken);
    return await mutateResource(owner, captured.binding, captured.input, options,
      (state, binding, input) => changeResourceState(state, binding, input, phase));
  } catch (error) {
    return instanceFailure(error);
  }
}
// These are internal metadata transitions. Their lifecycle callers must own
// genesis admission / actual local retirement; a token alone proves neither.
const grantInstanceResource = (owner, binding, token, options) =>
  transitionInstanceResource(owner, binding, token, PHASE.PUBLISHED, options);
const closeInstanceResource = (owner, binding, token, options) =>
  transitionInstanceResource(owner, binding, token, PHASE.CLOSED, options);
export {registerInstanceRows, selectConsensusInstance, getCurrentInstance,
  reserveInstanceResource, resolveInstanceResource, grantInstanceResource, closeInstanceResource};
