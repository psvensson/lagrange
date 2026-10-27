// ServiceDefinitionsOwner's private row adapter and durable mutation interaction.
// Superseded for slot transitions by design SERVING-PUBLICATION-RETIREMENT-
// DESIGN-20261017 amendment A2 as revised by A2' (A2'.0, A2'.3): "Transport
// retries reuse the exact predicate; no semantic CAS loop." now reads: no
// resubmission after an UNKNOWN answer; a definitive zero-row answer to a slot
// transition is re-decided from a fresh observation, bounded by RESOURCES
// submissions in total. Selection stays single-shot (it never re-decides).
import {TABLES} from '../../constants/index.js';
import {SERVICE_INSTANCE_ACTION as ACTION, SERVICE_INSTANCE_LIMIT as LIMIT,
  SERVICE_INSTANCE_OUTCOME as OUTCOME, SERVICE_INSTANCE_PHASE as PHASE,
  SERVICE_INSTANCE_DECISION as DECISION, SERVICE_INSTANCE_RESERVATION_REFUSAL as REFUSAL} from
  '../../constants/service-instance.js';
import {SERVICE_INSTALL_CATALOG_ERROR_CODE} from './service-install-catalog-contract.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';
import {ServiceInstanceContractError, requireInstance, instanceIdentifier,
  captureInstanceJson, captureSelectionRequest, encodeInstanceJson, instanceFailure} from
  './service-instance-contract.js';
import {validateBinding, emptyInstanceState, decodeInstanceState, selectionHistory, selectionAdmission,
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
// What one exact-predicate submission proved (A2'.1): a numeric count of one
// applied, a numeric zero definitively did not apply at the apply point; an
// absent count or a thrown/failed envelope is UNKNOWN (it may have applied).
const SUBMISSION = Object.freeze({APPLIED: 'APPLIED', NOT_APPLIED: 'NOT_APPLIED',
  UNKNOWN: 'UNKNOWN', CAPACITY_EXHAUSTED: 'CAPACITY_EXHAUSTED'});
async function submitState(owner, id, observation, change, options) {
  let state;
  try {
    state = encodeInstanceJson(change.next, LIMIT.STATE_BYTES);
  } catch {
    return SUBMISSION.CAPACITY_EXHAUSTED;
  }
  const rows = ROWS.get(owner);
  let submitted;
  try {
    submitted = observation.row === null ?
      await rows.insertRow({service_id: id, format: LIMIT.FORMAT, state}, options) :
      await rows.updateWhere({service_id: id, format: LIMIT.FORMAT, state: observation.row.state},
        {state}, options);
  } catch {
    submitted = null;
  }
  switch (affectedRows(submitted)) {
  case 1: return SUBMISSION.APPLIED;
  case 0: return SUBMISSION.NOT_APPLIED;
  default: return SUBMISSION.UNKNOWN;
  }
}
// One authoritative resolution, never another rewritten mutation, after an
// UNKNOWN answer (and, for selection only, after a zero-row answer). Superseded
// for slot transitions by amendment A2' (A2'.0): the sentence "never another
// rewritten mutation" no longer covers a definitive zero-row slot answer,
// which mutateResource re-decides. A successful gateway envelope with zero
// changes is still not a successful conditional mutation.
async function settleSubmission(owner, id, change, submission, options, resolve) {
  switch (submission) {
  case SUBMISSION.APPLIED: return change.result;
  case SUBMISSION.CAPACITY_EXHAUSTED: return {outcome: OUTCOME.CAPACITY_EXHAUSTED};
  default: break;
  }
  const fallback = submission === SUBMISSION.NOT_APPLIED ? OUTCOME.STATE_CHANGED : OUTCOME.UNKNOWN;
  try {
    const current = await readState(owner, id, options);
    return resolve(current) ?? {outcome: fallback};
  } catch (error) {
    return {outcome: OUTCOME.UNKNOWN, reason: instanceFailure(error).outcome};
  }
}
async function commitState(owner, id, observation, change, options, resolve) {
  const submission = await submitState(owner, id, observation, change, options);
  return settleSubmission(owner, id, change, submission, options, resolve);
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
// The re-observation after a definitive zero is the same authoritative read as
// the first. Its failure is typed UNAVAILABLE / CORRUPT_STATE by the caller's
// instanceFailure, never UNKNOWN: nothing about the mutation is unknown. Rows
// are never deleted, so a NEVER_CREATED answer here is CORRUPT_STATE (A2'.3).
async function observeAgain(owner, id, options) {
  const observation = await readState(owner, id, options);
  requireInstance(observation.outcome !== OUTCOME.NEVER_CREATED, OUTCOME.CORRUPT_STATE);
  return observation;
}
// One attempt's decision under the bound (A2'.0): a change that still needs a
// mutation after RESOURCES submissions in total answers STATE_CHANGED.
function boundedChange(change, submissions) {
  return change.next && submissions === LIMIT.RESOURCES ?
    {result: {outcome: OUTCOME.STATE_CHANGED}} : change;
}
// Slot transitions (reserve, PUBLISHED, RELEASING, CLOSED): amendment A2' bounded
// re-decide. Every attempt decides on the state object of its own fresh
// observation (decide mutates its argument) and submits that observation's row
// bytes as the exact predicate; at most RESOURCES submissions in total, then
// STATE_CHANGED. Selection never reaches this loop.
async function mutateResource(owner, binding, input, options, decide) {
  const id = binding.serviceDefinitionId;
  let observation = await readState(owner, id, options);
  if (observation.outcome === OUTCOME.NEVER_CREATED) return {outcome: OUTCOME.STALE_BINDING};
  for (let submissions = 0; ; submissions += 1) {
    const change = boundedChange(decide(observation.state, binding, input), submissions);
    if (!change.next) return change.result;
    const submission = await submitState(owner, id, observation, change, options);
    if (submission !== SUBMISSION.NOT_APPLIED) {
      return settleSubmission(owner, id, change, submission, options, (current) => {
        if (current.outcome === OUTCOME.NEVER_CREATED) return null;
        const resolved = decide(current.state, binding, input);
        return resolved.next ? null : resolved.result;
      });
    }
    observation = await observeAgain(owner, id, options);
  }
}
async function reserveInstanceResource(owner, value, request, options = {}) {
  let result;
  try {
    const captured = captureResourceInput(value, request, validSlotRequest);
    requireInstance(instanceIdentifier(captured.binding.tenantId));
    validateBinding(captured.binding, {tenantId: captured.binding.tenantId,
      serviceDefinitionId: captured.binding.serviceDefinitionId});
    result = await mutateResource(owner, captured.binding, captured.input,
      options, reserveResourceState);
  } catch (error) {
    result = instanceFailure(error);
  }
  // Only reserveResourceState supplies SEALED. Every other negative public
  // result explicitly retains uncertainty, including failed capture/encoding.
  return result.outcome === OUTCOME.ADMITTED ? result : {...result,
    reservationRefusal: result.reservationRefusal ?? REFUSAL.UNRESOLVED};
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
// Retirement visibility: the local owner is releasing this exact resource.
// Never a precondition of the local stop; CLOSED may follow from any live phase.
const releaseInstanceResource = (owner, binding, token, options) =>
  transitionInstanceResource(owner, binding, token, PHASE.RELEASING, options);
export {registerInstanceRows, selectConsensusInstance, getCurrentInstance,
  reserveInstanceResource, resolveInstanceResource, grantInstanceResource, closeInstanceResource,
  releaseInstanceResource};
