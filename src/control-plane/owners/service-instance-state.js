// R2 deterministic state decisions. Only the enclosing metadata row CAS commits
// these transitions. No clock, cache, local lock, or physical completion inference.
import {SERVICE_INSTANCE_ACTION as ACTION, SERVICE_INSTANCE_LIMIT as LIMIT,
  SERVICE_INSTANCE_OUTCOME as OUTCOME, SERVICE_INSTANCE_PHASE as PHASE,
  SERVICE_INSTANCE_DECISION as DECISION, SERVICE_INSTANCE_RESERVATION_REFUSAL as REFUSAL} from
  '../../constants/service-instance.js';
import {WASM_WRITER_PROFILE} from '../../wasm-service/wasm-writer-profile.js';
import {deriveServiceDefinitionId} from '../../service/service-lifecycle-command-identity.js';
import {HEX, requireInstance, instanceCounter, instanceIdentifier, exactFields,
  encodeInstanceJson, instanceDigest, instanceIncarnation, validRequestId,
  validFoundingPeers} from './service-instance-contract.js';

const SLOT_IDENTIFIERS = ['operationId', 'replicaId', 'nodeId'];
const BINDING_DIGEST_FIELDS = ['incarnation', 'requestDigest', 'revisionDigest',
  'definitionDigest', 'profileDigest'];
const RESOURCE_FIELDS = ['ordinal', 'phase', 'request', 'token'];
const INSTANCE_FIELDS = ['binding', 'resources'];
const DECISION_FIELDS = ['expectedV', 'winnerK', 'requestDigest', 'originalResult'];
const RESULT_FIELDS = ['outcome', 'binding'];
const NEVER_CREATED_STATE = Object.freeze({version: 0, selected: null, retiring: null,
  decisions: Object.freeze([])});
const BINDING_FIELDS = ['format', 'tenantId', 'serviceDefinitionId', 'requestId', 'selectionVersion',
  'incarnation', 'requestDigest', 'revisionId', 'revisionDigest', 'definitionDigest',
  'profileDigest', 'foundingPeers'];
const TOKEN_FIELDS = ['bindingDigest', 'slot', 'ordinal', 'operationId', 'bodyDigest'];
const SLOT_REQUEST_FIELDS = ['slot', 'expectedOrdinal', 'operationId', 'replicaId', 'nodeId'];
const STATE_FIELDS = ['version', 'tenantId', 'selected', 'retiring', 'decisions'];
const RETIRE_FIELDS = ['revisionId', 'definition', 'profile', 'foundingPeers'];
const WASM_RUNTIME = 'wasm_component';
const isHex = (value) => typeof value === 'string' && HEX.test(value);
const same = (left, right) => instanceDigest(left) === instanceDigest(right);

function emptyInstanceState(tenantId) {
  return {...NEVER_CREATED_STATE, tenantId};
}
function emptyResource() {
  return {ordinal: 0, phase: PHASE.CLOSED, request: null, token: null};
}
function outstanding(instance) {
  return instance !== null &&
    instance.resources.some((resource) => resource.phase !== PHASE.CLOSED);
}
function validSlotRequest(request) {
  return exactFields(request, SLOT_REQUEST_FIELDS) && instanceCounter(request.slot) &&
    request.slot < LIMIT.RESOURCES && instanceCounter(request.expectedOrdinal) &&
    SLOT_IDENTIFIERS.every((field) => instanceIdentifier(request[field]));
}
function resourceToken(binding, request) {
  return {bindingDigest: instanceDigest(binding), slot: request.slot,
    ordinal: request.expectedOrdinal + 1, operationId: request.operationId,
    bodyDigest: instanceDigest(request)};
}
function validateBinding(binding, subject) {
  requireInstance(exactFields(binding, BINDING_FIELDS));
  requireInstance(binding.format === LIMIT.FORMAT && binding.tenantId === subject.tenantId &&
    binding.serviceDefinitionId === subject.serviceDefinitionId);
  requireInstance(validRequestId(binding.requestId) &&
    binding.requestId.serviceDefinitionId === subject.serviceDefinitionId &&
    instanceCounter(binding.selectionVersion) && binding.selectionVersion > 0 &&
    binding.requestId.expectedVersion === binding.selectionVersion - 1);
  requireInstance(instanceIdentifier(binding.revisionId) &&
    validFoundingPeers(binding.foundingPeers));
  requireInstance(BINDING_DIGEST_FIELDS
    .every((field) => isHex(binding[field])));
  requireInstance(binding.incarnation === instanceIncarnation(binding.requestDigest));
  encodeInstanceJson(binding, LIMIT.BINDING_BYTES);
}
function validateResource(resource, index, binding) {
  requireInstance(exactFields(resource, RESOURCE_FIELDS) &&
    instanceCounter(resource.ordinal) && Object.values(PHASE).includes(resource.phase));
  if (resource.ordinal === 0) {
    requireInstance(resource.phase === PHASE.CLOSED && resource.request === null &&
      resource.token === null);
  } else {
    requireInstance(validSlotRequest(resource.request) && resource.request.slot === index &&
      resource.request.expectedOrdinal === resource.ordinal - 1);
    requireInstance(exactFields(resource.token, TOKEN_FIELDS) &&
      same(resource.token, resourceToken(binding, resource.request)));
  }
  encodeInstanceJson(resource, LIMIT.SLOT_BYTES);
}
function validateInstance(instance, subject) {
  requireInstance(exactFields(instance, INSTANCE_FIELDS));
  validateBinding(instance.binding, subject);
  requireInstance(Array.isArray(instance.resources) &&
    instance.resources.length === LIMIT.RESOURCES);
  instance.resources.forEach((resource, index) =>
    validateResource(resource, index, instance.binding));
  const occupied = instance.resources.filter((resource) => resource.phase !== PHASE.CLOSED);
  requireInstance(new Set(occupied.map((resource) => resource.request.replicaId)).size ===
    occupied.length);
}
function validateDecision(decision, expectedV, subject) {
  requireInstance(exactFields(decision, DECISION_FIELDS) &&
    decision.expectedV === expectedV && validRequestId(decision.winnerK) &&
    decision.winnerK.expectedVersion === expectedV &&
    decision.winnerK.serviceDefinitionId === subject.serviceDefinitionId &&
    isHex(decision.requestDigest));
  const result = decision.originalResult;
  requireInstance(exactFields(result, RESULT_FIELDS));
  if (result.outcome === OUTCOME.RETIRED) requireInstance(result.binding === null);
  else {
    requireInstance(result.outcome === OUTCOME.SELECTED);
    validateBinding(result.binding, subject);
    requireInstance(result.binding.selectionVersion === expectedV + 1 &&
      result.binding.requestDigest === decision.requestDigest &&
      same(result.binding.requestId, decision.winnerK));
  }
  encodeInstanceJson(decision, LIMIT.DECISION_BYTES);
}
function decodeInstanceState(row, serviceDefinitionId) {
  requireInstance(row.format === LIMIT.FORMAT && row.service_id === serviceDefinitionId &&
    typeof row.state === 'string' && Buffer.byteLength(row.state) <= LIMIT.STATE_BYTES);
  const state = JSON.parse(row.state);
  requireInstance(exactFields(state, STATE_FIELDS) && instanceCounter(state.version) &&
    state.version > 0 && instanceIdentifier(state.tenantId));
  requireInstance(encodeInstanceJson(state, LIMIT.STATE_BYTES) === row.state);
  const subject = {tenantId: state.tenantId, serviceDefinitionId};
  requireInstance(Array.isArray(state.decisions) &&
    state.decisions.length === Math.min(state.version, LIMIT.DECISIONS));
  state.decisions.forEach((decision, index) =>
    validateDecision(decision, state.version - state.decisions.length + index, subject));
  const last = state.decisions.at(-1).originalResult;
  requireInstance(same(state.selected?.binding ?? null, last.binding));
  if (state.selected !== null) validateInstance(state.selected, subject);
  if (state.retiring !== null) {
    validateInstance(state.retiring, subject);
    requireInstance(state.retiring.binding.selectionVersion < state.version);
  }
  return state;
}
function chooseInstanceOutcome(rules) {
  return rules.find(([matches]) => matches)[1];
}
function selectionHistory(state, request) {
  const expectedV = request.requestId.expectedVersion;
  const decided = expectedV < state.version;
  const decision = state.decisions.find((entry) => entry.expectedV === expectedV);
  const winnerMatches = decision !== undefined && same(decision.winnerK, request.requestId);
  const contentMatches = winnerMatches && decision.requestDigest === instanceDigest(request);
  const outcome = chooseInstanceOutcome([
    [!decided, DECISION.UNDECIDED],
    [decision === undefined, OUTCOME.HISTORY_UNAVAILABLE],
    [!winnerMatches, OUTCOME.CONFLICT],
    [!contentMatches, OUTCOME.CONTENT_CONFLICT],
    [true, DECISION.RECORDED],
  ]);
  switch (outcome) {
  case DECISION.RECORDED: return decision.originalResult;
  case OUTCOME.CONFLICT: return {outcome, winnerRequestId: decision.winnerK};
  default: return {outcome};
  }
}
function selectionAdmission(state, request) {
  const history = selectionHistory(state, request);
  if (history.outcome !== DECISION.UNDECIDED) return history;
  const versionMatches = request.requestId.expectedVersion === state.version;
  const incarnationMatches = request.expectedIncarnation ===
    (state.selected?.binding.incarnation ?? null);
  const outcome = chooseInstanceOutcome([
    [!versionMatches || !incarnationMatches, OUTCOME.INVALID_EXPECTED_STATE],
    [outstanding(state.retiring), OUTCOME.TRANSITION_HELD],
    [state.version === Number.MAX_SAFE_INTEGER, OUTCOME.CAPACITY_EXHAUSTED],
    [true, DECISION.PROPOSE],
  ]);
  return {outcome};
}
function validCreationLineage(request, revision) {
  if (request.action === ACTION.RETIRE) {
    return RETIRE_FIELDS.every((field) => request[field] === null);
  }
  return revision !== null && request.revisionId === revision.revisionId &&
    request.profile === WASM_WRITER_PROFILE.id && validFoundingPeers(request.foundingPeers) &&
    revision.manifest.runtime.kind === WASM_RUNTIME &&
    request.requestId.serviceDefinitionId ===
      deriveServiceDefinitionId(request.tenantId, revision.manifest.name) &&
    same(request.definition, revision.config.definition ?? null);
}
function selectInstanceState(state, request, revision) {
  const requestDigest = instanceDigest(request);
  const version = state.version + 1;
  const binding = request.action === ACTION.RETIRE ? null : {
    format: LIMIT.FORMAT, tenantId: request.tenantId,
    serviceDefinitionId: request.requestId.serviceDefinitionId,
    requestId: request.requestId, selectionVersion: version,
    incarnation: instanceIncarnation(requestDigest), requestDigest, revisionId: request.revisionId,
    revisionDigest: instanceDigest({revisionId: revision.revisionId,
      packageId: revision.packageId, artifactDigest: revision.artifactDigest,
      configDigest: revision.configDigest}),
    definitionDigest: instanceDigest(request.definition),
    profileDigest: instanceDigest(request.profile),
    foundingPeers: request.foundingPeers,
  };
  if (binding) encodeInstanceJson(binding, LIMIT.BINDING_BYTES);
  const result = {outcome: binding ? OUTCOME.SELECTED : OUTCOME.RETIRED, binding};
  const decision = {expectedV: state.version, winnerK: request.requestId,
    requestDigest, originalResult: result};
  encodeInstanceJson(decision, LIMIT.DECISION_BYTES);
  const next = {version, tenantId: request.tenantId,
    selected: binding ?
      {binding, resources: Array.from({length: LIMIT.RESOURCES}, emptyResource)} : null,
    retiring: outstanding(state.selected) ? state.selected : null,
    decisions: [...state.decisions, decision].slice(-LIMIT.DECISIONS)};
  return {result, next};
}
function findInstance(state, binding) {
  return [state.selected, state.retiring]
    .find((value) => value && same(value.binding, binding)) ?? null;
}
function resourceResult(resource) {
  return {outcome: OUTCOME.ADMITTED, phase: resource.phase, token: resource.token};
}
function resourceRefusal(outcome, finality, details = {}) {
  return {result: {...details, outcome, reservationRefusal: finality}};
}
function reserveResourceState(state, binding, request) {
  const instance = findInstance(state, binding);
  if (!instance) {
    // Retained selection versions never decrease; a future binding has not
    // been excluded just because its selection has not happened yet.
    return resourceRefusal(OUTCOME.STALE_BINDING, binding.selectionVersion <= state.version ?
      REFUSAL.SEALED : REFUSAL.UNRESOLVED);
  }
  const resource = instance.resources[request.slot];
  const ordinal = request.expectedOrdinal + 1;
  if (ordinal < resource.ordinal) {
    return resourceRefusal(OUTCOME.HISTORY_UNAVAILABLE, REFUSAL.SEALED);
  }
  if (ordinal === resource.ordinal) {
    if (request.operationId !== resource.token.operationId) {
      return resourceRefusal(OUTCOME.CONFLICT, REFUSAL.SEALED, {winnerToken: resource.token});
    }
    return same(resource.request, request) ? {result: resourceResult(resource)} :
      resourceRefusal(OUTCOME.CONTENT_CONFLICT, REFUSAL.SEALED);
  }
  if (instance !== state.selected) return resourceRefusal(OUTCOME.STALE_BINDING, REFUSAL.SEALED);
  if (!instanceCounter(ordinal)) return resourceRefusal(OUTCOME.CAPACITY_EXHAUSTED, REFUSAL.SEALED);
  if (request.expectedOrdinal !== resource.ordinal || resource.phase !== PHASE.CLOSED) {
    return resourceRefusal(OUTCOME.INVALID_EXPECTED_STATE, REFUSAL.UNRESOLVED);
  }
  if (instance.resources.some((slot) => slot.phase !== PHASE.CLOSED &&
      slot.request.replicaId === request.replicaId)) {
    return resourceRefusal(OUTCOME.TARGET_ALREADY_OWNED, REFUSAL.UNRESOLVED);
  }
  const admitted = {ordinal, phase: PHASE.ADMITTED,
    request, token: resourceToken(binding, request)};
  encodeInstanceJson(admitted, LIMIT.SLOT_BYTES);
  instance.resources[request.slot] = admitted;
  return {result: resourceResult(admitted), next: state};
}
function resolveResourceState(state, binding, token) {
  const instance = findInstance(state, binding);
  const resource = instance?.resources[token.slot];
  const outcome = chooseInstanceOutcome([
    [instance === null, OUTCOME.HISTORY_UNAVAILABLE],
    [token.ordinal < resource?.ordinal, OUTCOME.HISTORY_UNAVAILABLE],
    [!same(resource?.token ?? null, token), OUTCOME.CONTENT_CONFLICT],
    [true, OUTCOME.ADMITTED],
  ]);
  return outcome === OUTCOME.ADMITTED ? resourceResult(resource) : {outcome};
}
// The resource phase machine's explicit allowed-from table (R07; design
// SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 Revision 3 N3). A slot is
// monotonic once CLOSED: a later RELEASING or CLOSED answers CLOSED without a
// mutation, so a repeated or racing retirement can never reopen what closed.
const RESOURCE_PHASE_FROM = Object.freeze({
  [PHASE.PUBLISHED]: Object.freeze([PHASE.ADMITTED]),
  [PHASE.RELEASING]: Object.freeze([PHASE.ADMITTED, PHASE.PUBLISHED]),
  [PHASE.CLOSED]: Object.freeze([PHASE.ADMITTED, PHASE.PUBLISHED, PHASE.RELEASING]),
});
const TRANSITION = Object.freeze({APPLY: 'APPLY', SAME: 'SAME'});
function publicationRefusal(state, instance, resource) {
  return chooseInstanceOutcome([
    [instance !== state.selected, OUTCOME.STALE_BINDING],
    [resource.phase === PHASE.CLOSED || resource.phase === PHASE.RELEASING,
      OUTCOME.RESOURCE_CLOSED],
    [outstanding(state.retiring), OUTCOME.PREDECESSOR_OUTSTANDING],
    [true, null],
  ]);
}
function resourceTransition(state, instance, resource, phase) {
  const allowed = RESOURCE_PHASE_FROM[phase];
  const refusal = phase === PHASE.PUBLISHED ? publicationRefusal(state, instance, resource) : null;
  return chooseInstanceOutcome([
    [allowed === undefined, OUTCOME.INVALID_REQUEST],
    [refusal !== null, refusal],
    [resource.phase === phase, TRANSITION.SAME],
    [resource.phase === PHASE.CLOSED, OUTCOME.CLOSED],
    [!allowed.includes(resource.phase), OUTCOME.INVALID_EXPECTED_STATE],
    [true, TRANSITION.APPLY],
  ]);
}
function changeResourceState(state, binding, token, phase) {
  const resolution = resolveResourceState(state, binding, token);
  if (resolution.outcome !== OUTCOME.ADMITTED) return {result: resolution};
  const instance = findInstance(state, binding);
  const resource = instance.resources[token.slot];
  const transition = resourceTransition(state, instance, resource, phase);
  switch (transition) {
  case TRANSITION.APPLY:
    resource.phase = phase;
    return {result: {outcome: phase, phase, token: resource.token}, next: state};
  case TRANSITION.SAME:
    return {result: {outcome: phase, phase, token: resource.token}};
  case OUTCOME.CLOSED:
    return {result: {outcome: OUTCOME.CLOSED, phase: PHASE.CLOSED, token: resource.token}};
  default:
    return {result: {outcome: transition}};
  }
}
function validResourceToken(token) {
  return exactFields(token, TOKEN_FIELDS) &&
    isHex(token.bindingDigest) && isHex(token.bodyDigest) &&
    instanceCounter(token.slot) && token.slot < LIMIT.RESOURCES &&
    instanceCounter(token.ordinal) && token.ordinal > 0 && instanceIdentifier(token.operationId);
}
function matchesInstanceResourceToken(binding, request, token) {
  return validResourceToken(token) && same(token, resourceToken(binding, request));
}
export {validateBinding, matchesInstanceResourceToken,
  emptyInstanceState, decodeInstanceState, selectionHistory, selectionAdmission,
  validCreationLineage, selectInstanceState, validSlotRequest, reserveResourceState,
  resolveResourceState, changeResourceState, validResourceToken};
