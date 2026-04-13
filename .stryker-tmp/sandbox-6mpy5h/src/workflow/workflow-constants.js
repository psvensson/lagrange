/**
 * Canonical field names for durable workflow step transitions.
 *
 * @enum {string}
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
const WORKFLOW_TRANSITION_FIELD = Object.freeze(stryMutAct_9fa48("167239") ? {} : (stryCov_9fa48("167239"), {
  PREVIOUS_STEP: stryMutAct_9fa48("167240") ? "" : (stryCov_9fa48("167240"), 'previousStep'),
  NEXT_STEP: stryMutAct_9fa48("167241") ? "" : (stryCov_9fa48("167241"), 'nextStep'),
  REASON: stryMutAct_9fa48("167242") ? "" : (stryCov_9fa48("167242"), 'reason'),
  TIMESTAMP: stryMutAct_9fa48("167243") ? "" : (stryCov_9fa48("167243"), 'timestamp'),
  OWNER_KEY: stryMutAct_9fa48("167244") ? "" : (stryCov_9fa48("167244"), 'ownerKey'),
  FENCE_TOKEN: stryMutAct_9fa48("167245") ? "" : (stryCov_9fa48("167245"), 'fenceToken')
}));

/**
 * Participant acknowledgement result outcomes.
 *
 * Every call to acknowledgeParticipant returns one of these to let the
 * caller know whether the acknowledgement was accepted, and if not, why.
 *
 * @enum {string}
 */
const PARTICIPANT_ACK_RESULT = Object.freeze(stryMutAct_9fa48("167246") ? {} : (stryCov_9fa48("167246"), {
  ACCEPTED: stryMutAct_9fa48("167247") ? "" : (stryCov_9fa48("167247"), 'accepted'),
  STALE_FENCE: stryMutAct_9fa48("167248") ? "" : (stryCov_9fa48("167248"), 'stale_fence'),
  DUPLICATE: stryMutAct_9fa48("167249") ? "" : (stryCov_9fa48("167249"), 'duplicate'),
  PARTICIPANT_NOT_FOUND: stryMutAct_9fa48("167250") ? "" : (stryCov_9fa48("167250"), 'participant_not_found')
}));

/**
 * Canonical field names for participant acknowledgement payloads.
 *
 * @enum {string}
 */
const PARTICIPANT_ACK_FIELD = Object.freeze(stryMutAct_9fa48("167251") ? {} : (stryCov_9fa48("167251"), {
  WORKFLOW_ID: stryMutAct_9fa48("167252") ? "" : (stryCov_9fa48("167252"), 'workflowId'),
  PARTICIPANT_KEY: stryMutAct_9fa48("167253") ? "" : (stryCov_9fa48("167253"), 'participantKey'),
  FENCE_TOKEN: stryMutAct_9fa48("167254") ? "" : (stryCov_9fa48("167254"), 'fenceToken'),
  STATUS: stryMutAct_9fa48("167255") ? "" : (stryCov_9fa48("167255"), 'status'),
  CHECKPOINT: stryMutAct_9fa48("167256") ? "" : (stryCov_9fa48("167256"), 'checkpoint'),
  ACKNOWLEDGED_AT: stryMutAct_9fa48("167257") ? "" : (stryCov_9fa48("167257"), 'acknowledgedAt')
}));
const WORKFLOW_ERROR_MSG = Object.freeze(stryMutAct_9fa48("167258") ? {} : (stryCov_9fa48("167258"), {
  WORKFLOW_ID_REQUIRED: stryMutAct_9fa48("167259") ? "" : (stryCov_9fa48("167259"), 'Workflow ID is required'),
  OWNER_KEY_REQUIRED: stryMutAct_9fa48("167260") ? "" : (stryCov_9fa48("167260"), 'Workflow owner key is required'),
  WORKFLOW_COORDINATOR_REQUIRED: stryMutAct_9fa48("167261") ? "" : (stryCov_9fa48("167261"), 'Workflow step runner requires a workflow coordinator'),
  PARTICIPANT_ID_REQUIRED: stryMutAct_9fa48("167262") ? "" : (stryCov_9fa48("167262"), 'Workflow participant ID is required'),
  NEXT_STEP_REQUIRED: stryMutAct_9fa48("167263") ? "" : (stryCov_9fa48("167263"), 'Workflow transition requires nextStep'),
  REASON_REQUIRED: stryMutAct_9fa48("167264") ? "" : (stryCov_9fa48("167264"), 'Workflow transition requires reason'),
  DUPLICATE_TRANSITION: stryMutAct_9fa48("167265") ? "" : (stryCov_9fa48("167265"), 'Duplicate transition rejected by idempotency check'),
  STALE_FENCE_TOKEN: stryMutAct_9fa48("167266") ? "" : (stryCov_9fa48("167266"), 'Transition rejected: stale fence token'),
  PARTICIPANT_KEY_REQUIRED: stryMutAct_9fa48("167267") ? "" : (stryCov_9fa48("167267"), 'Participant acknowledgement requires participantKey'),
  ACK_STATUS_REQUIRED: stryMutAct_9fa48("167268") ? "" : (stryCov_9fa48("167268"), 'Participant acknowledgement requires status'),
  workflowNotFound: stryMutAct_9fa48("167269") ? () => undefined : (stryCov_9fa48("167269"), workflowId => stryMutAct_9fa48("167270") ? `` : (stryCov_9fa48("167270"), `Workflow ${workflowId} not found`)),
  participantNotFound: stryMutAct_9fa48("167271") ? () => undefined : (stryCov_9fa48("167271"), participantKey => stryMutAct_9fa48("167272") ? `` : (stryCov_9fa48("167272"), `Workflow participant ${participantKey} not found`))
}));

/**
 * Typed diagnostic record field names for acknowledgement rejections.
 *
 * Every rejection diagnostic carries these fields so callers and
 * invariant consumers can inspect rejection context without parsing
 * free-form strings.
 *
 * @enum {string}
 */
const ACK_REJECTION_DIAGNOSTIC_FIELD = Object.freeze(stryMutAct_9fa48("167273") ? {} : (stryCov_9fa48("167273"), {
  WORKFLOW_ID: stryMutAct_9fa48("167274") ? "" : (stryCov_9fa48("167274"), 'workflowId'),
  PARTICIPANT_KEY: stryMutAct_9fa48("167275") ? "" : (stryCov_9fa48("167275"), 'participantKey'),
  REJECTION_RESULT: stryMutAct_9fa48("167276") ? "" : (stryCov_9fa48("167276"), 'rejectionResult'),
  REASON: stryMutAct_9fa48("167277") ? "" : (stryCov_9fa48("167277"), 'reason'),
  RECEIVED_STATUS: stryMutAct_9fa48("167278") ? "" : (stryCov_9fa48("167278"), 'receivedStatus'),
  CURRENT_STATUS: stryMutAct_9fa48("167279") ? "" : (stryCov_9fa48("167279"), 'currentStatus'),
  RECEIVED_FENCE_TOKEN: stryMutAct_9fa48("167280") ? "" : (stryCov_9fa48("167280"), 'receivedFenceToken'),
  CURRENT_FENCE_TOKEN: stryMutAct_9fa48("167281") ? "" : (stryCov_9fa48("167281"), 'currentFenceToken'),
  TIMESTAMP: stryMutAct_9fa48("167282") ? "" : (stryCov_9fa48("167282"), 'timestamp')
}));

/**
 * Builds a canonical idempotency key for a workflow step transition.
 * Used to prevent duplicate transitions on recovery replay.
 *
 * @param {string} operationId - The operation or workflow ID.
 * @param {string} stepId - The target step of the transition.
 * @return {string} Idempotency key.
 */
const buildTransitionIdempotencyKey = stryMutAct_9fa48("167283") ? () => undefined : (stryCov_9fa48("167283"), (() => {
  const buildTransitionIdempotencyKey = (operationId, stepId) => stryMutAct_9fa48("167284") ? `` : (stryCov_9fa48("167284"), `${operationId}:${stepId}`);
  return buildTransitionIdempotencyKey;
})());
export { WORKFLOW_TRANSITION_FIELD, WORKFLOW_ERROR_MSG, PARTICIPANT_ACK_RESULT, PARTICIPANT_ACK_FIELD, ACK_REJECTION_DIAGNOSTIC_FIELD, buildTransitionIdempotencyKey };