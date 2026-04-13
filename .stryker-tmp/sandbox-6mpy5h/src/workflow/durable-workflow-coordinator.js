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
import { WORKFLOW_ERROR_MSG, WORKFLOW_TRANSITION_FIELD, PARTICIPANT_ACK_RESULT, PARTICIPANT_ACK_FIELD, ACK_REJECTION_DIAGNOSTIC_FIELD, buildTransitionIdempotencyKey } from './workflow-constants.js';

/**
 * Generic durable workflow runtime with optional participant persistence.
 */
class DurableWorkflowCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Function} [options.persistWorkflow] - Persist workflow callback.
   * @param {Function} [options.persistParticipant] - Persist participant callback.
   * @param {Function} [options.onAckRejection] - Diagnostic callback invoked
   *   when a participant acknowledgement is rejected (stale fence, duplicate,
   *   or participant not found). Receives a typed diagnostic record.
   * @param {Function} [options.now] - Clock function.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("166509")) {
      {}
    } else {
      stryCov_9fa48("166509");
      this.persistWorkflow = stryMutAct_9fa48("166512") ? options.persistWorkflow && (async () => {}) : stryMutAct_9fa48("166511") ? false : stryMutAct_9fa48("166510") ? true : (stryCov_9fa48("166510", "166511", "166512"), options.persistWorkflow || (async () => {}));
      this.persistParticipant = stryMutAct_9fa48("166515") ? options.persistParticipant && (async () => {}) : stryMutAct_9fa48("166514") ? false : stryMutAct_9fa48("166513") ? true : (stryCov_9fa48("166513", "166514", "166515"), options.persistParticipant || (async () => {}));
      this.onAckRejection = stryMutAct_9fa48("166518") ? options.onAckRejection && null : stryMutAct_9fa48("166517") ? false : stryMutAct_9fa48("166516") ? true : (stryCov_9fa48("166516", "166517", "166518"), options.onAckRejection || null);
      this.now = stryMutAct_9fa48("166521") ? options.now && (() => Date.now()) : stryMutAct_9fa48("166520") ? false : stryMutAct_9fa48("166519") ? true : (stryCov_9fa48("166519", "166520", "166521"), options.now || (stryMutAct_9fa48("166522") ? () => undefined : (stryCov_9fa48("166522"), () => Date.now())));
      this.workflowsById = new Map();
      this.workflowsByOwnerKey = new Map();
      this.inFlightExecutionsByOwnerKey = new Map();
      this.committedTransitions = new Set();
    }
  }

  /**
   * Register and persist one workflow state record.
   * @param {Object} record - Workflow record.
   * @return {Promise<Object>} Normalized workflow state.
   */
  async registerWorkflow(record) {
    if (stryMutAct_9fa48("166523")) {
      {}
    } else {
      stryCov_9fa48("166523");
      const workflow = this.createWorkflowRecord(record);
      this.setWorkflowState(workflow);
      await this.persistWorkflow(workflow);
      return workflow;
    }
  }

  /**
   * Update and persist one workflow state record.
   * @param {string} workflowId - Workflow ID.
   * @param {Object} updates - Workflow field updates.
   * @return {Promise<Object>} Updated workflow state.
   */
  async updateWorkflow(workflowId, updates = {}) {
    if (stryMutAct_9fa48("166524")) {
      {}
    } else {
      stryCov_9fa48("166524");
      const workflow = this.requireWorkflow(workflowId);
      Object.assign(workflow, updates);
      if (stryMutAct_9fa48("166526") ? false : stryMutAct_9fa48("166525") ? true : (stryCov_9fa48("166525", "166526"), updates.participants instanceof Map)) {
        if (stryMutAct_9fa48("166527")) {
          {}
        } else {
          stryCov_9fa48("166527");
          workflow.participants = new Map(updates.participants.entries());
        }
      }
      if (stryMutAct_9fa48("166530") ? false : stryMutAct_9fa48("166529") ? true : stryMutAct_9fa48("166528") ? Object.prototype.hasOwnProperty.call(updates, 'updatedAt') : (stryCov_9fa48("166528", "166529", "166530"), !Object.prototype.hasOwnProperty.call(updates, stryMutAct_9fa48("166531") ? "" : (stryCov_9fa48("166531"), 'updatedAt')))) {
        if (stryMutAct_9fa48("166532")) {
          {}
        } else {
          stryCov_9fa48("166532");
          workflow.updatedAt = this.now();
        }
      }
      await this.persistWorkflow(workflow);
      return workflow;
    }
  }

  /**
   * Record a durable monotonic step transition on a workflow.
   *
   * Each transition persists previousStep, nextStep, reason, timestamp,
   * and ownerKey as required by the durable workflow contract.
   *
   * @param {string} workflowId - Workflow ID.
   * @param {Object} transition - Transition descriptor.
   * @param {string} transition.nextStep - Target step.
   * @param {string} transition.reason - Human/machine-readable reason.
   * @param {Object} [transition.metadata] - Extra fields merged into the
   *   transition history entry.
   * @param {Object} [updates] - Additional workflow field updates applied
   *   alongside the transition.
   * @return {Promise<Object>} Updated workflow state.
   */
  /**
     * Record a durable monotonic step transition on a workflow.
     *
     * Each transition persists previousStep, nextStep, reason, timestamp,
     * ownerKey, and fenceToken as required by the durable workflow contract.
     *
     * When a fence token is provided in the transition, it is validated
     * against the workflow's current fence token. If the workflow already
     * has a fence token that is strictly greater than the provided one,
     * the transition is rejected as stale.
     *
     * @param {string} workflowId - Workflow ID.
     * @param {Object} transition - Transition descriptor.
     * @param {string} transition.nextStep - Target step.
     * @param {string} transition.reason - Human/machine-readable reason.
     * @param {number} [transition.fenceToken] - Owner epoch / lease token.
     * @param {Object} [transition.metadata] - Extra fields merged into the
     *   transition history entry.
     * @param {Object} [updates] - Additional workflow field updates applied
     *   alongside the transition.
     * @param {Object} [options] - Transition behavior options.
     * @param {boolean} [options.markCommitted=true] - Whether to mark the
     *   transition idempotency key as committed after persistence.
     * @return {Promise<Object>} Updated workflow state.
     */
  async transitionStep(workflowId, transition, updates = {}, options = {}) {
    if (stryMutAct_9fa48("166533")) {
      {}
    } else {
      stryCov_9fa48("166533");
      const nextStep = stryMutAct_9fa48("166534") ? transition.nextStep : (stryCov_9fa48("166534"), transition?.nextStep);
      if (stryMutAct_9fa48("166537") ? false : stryMutAct_9fa48("166536") ? true : stryMutAct_9fa48("166535") ? nextStep : (stryCov_9fa48("166535", "166536", "166537"), !nextStep)) {
        if (stryMutAct_9fa48("166538")) {
          {}
        } else {
          stryCov_9fa48("166538");
          throw new Error(WORKFLOW_ERROR_MSG.NEXT_STEP_REQUIRED);
        }
      }
      const reason = stryMutAct_9fa48("166539") ? transition.reason : (stryCov_9fa48("166539"), transition?.reason);
      if (stryMutAct_9fa48("166542") ? false : stryMutAct_9fa48("166541") ? true : stryMutAct_9fa48("166540") ? reason : (stryCov_9fa48("166540", "166541", "166542"), !reason)) {
        if (stryMutAct_9fa48("166543")) {
          {}
        } else {
          stryCov_9fa48("166543");
          throw new Error(WORKFLOW_ERROR_MSG.REASON_REQUIRED);
        }
      }
      const workflow = this.requireWorkflow(workflowId);
      if (stryMutAct_9fa48("166545") ? false : stryMutAct_9fa48("166544") ? true : (stryCov_9fa48("166544", "166545"), this.isTransitionIdempotent(workflowId, nextStep))) {
        if (stryMutAct_9fa48("166546")) {
          {}
        } else {
          stryCov_9fa48("166546");
          return workflow;
        }
      }
      const transitionFence = transition.fenceToken;
      if (stryMutAct_9fa48("166549") ? transitionFence !== undefined || transitionFence !== null : stryMutAct_9fa48("166548") ? false : stryMutAct_9fa48("166547") ? true : (stryCov_9fa48("166547", "166548", "166549"), (stryMutAct_9fa48("166551") ? transitionFence === undefined : stryMutAct_9fa48("166550") ? true : (stryCov_9fa48("166550", "166551"), transitionFence !== undefined)) && (stryMutAct_9fa48("166553") ? transitionFence === null : stryMutAct_9fa48("166552") ? true : (stryCov_9fa48("166552", "166553"), transitionFence !== null)))) {
        if (stryMutAct_9fa48("166554")) {
          {}
        } else {
          stryCov_9fa48("166554");
          const currentFence = workflow.fenceToken;
          if (stryMutAct_9fa48("166557") ? currentFence !== undefined && currentFence !== null || transitionFence < currentFence : stryMutAct_9fa48("166556") ? false : stryMutAct_9fa48("166555") ? true : (stryCov_9fa48("166555", "166556", "166557"), (stryMutAct_9fa48("166559") ? currentFence !== undefined || currentFence !== null : stryMutAct_9fa48("166558") ? true : (stryCov_9fa48("166558", "166559"), (stryMutAct_9fa48("166561") ? currentFence === undefined : stryMutAct_9fa48("166560") ? true : (stryCov_9fa48("166560", "166561"), currentFence !== undefined)) && (stryMutAct_9fa48("166563") ? currentFence === null : stryMutAct_9fa48("166562") ? true : (stryCov_9fa48("166562", "166563"), currentFence !== null)))) && (stryMutAct_9fa48("166566") ? transitionFence >= currentFence : stryMutAct_9fa48("166565") ? transitionFence <= currentFence : stryMutAct_9fa48("166564") ? true : (stryCov_9fa48("166564", "166565", "166566"), transitionFence < currentFence)))) {
            if (stryMutAct_9fa48("166567")) {
              {}
            } else {
              stryCov_9fa48("166567");
              throw new Error(WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN);
            }
          }
          workflow.fenceToken = transitionFence;
        }
      }
      const previousStep = stryMutAct_9fa48("166570") ? workflow.step && null : stryMutAct_9fa48("166569") ? false : stryMutAct_9fa48("166568") ? true : (stryCov_9fa48("166568", "166569", "166570"), workflow.step || null);
      const now = this.now();
      const historyEntry = stryMutAct_9fa48("166571") ? {} : (stryCov_9fa48("166571"), {
        [WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP]: previousStep,
        [WORKFLOW_TRANSITION_FIELD.NEXT_STEP]: nextStep,
        [WORKFLOW_TRANSITION_FIELD.REASON]: reason,
        [WORKFLOW_TRANSITION_FIELD.TIMESTAMP]: now,
        [WORKFLOW_TRANSITION_FIELD.OWNER_KEY]: workflow.ownerKey,
        [WORKFLOW_TRANSITION_FIELD.FENCE_TOKEN]: stryMutAct_9fa48("166572") ? workflow.fenceToken && null : (stryCov_9fa48("166572"), workflow.fenceToken ?? null)
      });
      if (stryMutAct_9fa48("166575") ? transition.metadata || typeof transition.metadata === 'object' : stryMutAct_9fa48("166574") ? false : stryMutAct_9fa48("166573") ? true : (stryCov_9fa48("166573", "166574", "166575"), transition.metadata && (stryMutAct_9fa48("166577") ? typeof transition.metadata !== 'object' : stryMutAct_9fa48("166576") ? true : (stryCov_9fa48("166576", "166577"), typeof transition.metadata === (stryMutAct_9fa48("166578") ? "" : (stryCov_9fa48("166578"), 'object')))))) {
        if (stryMutAct_9fa48("166579")) {
          {}
        } else {
          stryCov_9fa48("166579");
          Object.assign(historyEntry, transition.metadata);
        }
      }
      if (stryMutAct_9fa48("166582") ? false : stryMutAct_9fa48("166581") ? true : stryMutAct_9fa48("166580") ? Array.isArray(workflow.transitionHistory) : (stryCov_9fa48("166580", "166581", "166582"), !Array.isArray(workflow.transitionHistory))) {
        if (stryMutAct_9fa48("166583")) {
          {}
        } else {
          stryCov_9fa48("166583");
          workflow.transitionHistory = stryMutAct_9fa48("166584") ? ["Stryker was here"] : (stryCov_9fa48("166584"), []);
        }
      }
      workflow.transitionHistory.push(historyEntry);
      workflow.step = nextStep;
      workflow.updatedAt = now;
      Object.assign(workflow, updates);
      await this.persistWorkflow(workflow);
      if (stryMutAct_9fa48("166587") ? options.markCommitted === false : stryMutAct_9fa48("166586") ? false : stryMutAct_9fa48("166585") ? true : (stryCov_9fa48("166585", "166586", "166587"), options.markCommitted !== (stryMutAct_9fa48("166588") ? true : (stryCov_9fa48("166588"), false)))) {
        if (stryMutAct_9fa48("166589")) {
          {}
        } else {
          stryCov_9fa48("166589");
          this.markTransitionCommitted(workflowId, nextStep);
        }
      }
      return workflow;
    }
  }

  /**
   * Persist the current workflow state.
   * @param {string} workflowId - Workflow ID.
   * @return {Promise<Object>} Persisted workflow state.
   */
  async persistWorkflowState(workflowId) {
    if (stryMutAct_9fa48("166590")) {
      {}
    } else {
      stryCov_9fa48("166590");
      const workflow = this.requireWorkflow(workflowId);
      await this.persistWorkflow(workflow);
      return workflow;
    }
  }

  /**
   * Remove one workflow from the in-memory registry.
   * @param {string} workflowId - Workflow ID.
   * @return {Object|null} Removed workflow state.
   */
  removeWorkflow(workflowId) {
    if (stryMutAct_9fa48("166591")) {
      {}
    } else {
      stryCov_9fa48("166591");
      const workflow = this.getWorkflowById(workflowId);
      if (stryMutAct_9fa48("166594") ? false : stryMutAct_9fa48("166593") ? true : stryMutAct_9fa48("166592") ? workflow : (stryCov_9fa48("166592", "166593", "166594"), !workflow)) {
        if (stryMutAct_9fa48("166595")) {
          {}
        } else {
          stryCov_9fa48("166595");
          return null;
        }
      }
      this.workflowsById.delete(workflowId);
      if (stryMutAct_9fa48("166597") ? false : stryMutAct_9fa48("166596") ? true : (stryCov_9fa48("166596", "166597"), workflow.ownerKey)) {
        if (stryMutAct_9fa48("166598")) {
          {}
        } else {
          stryCov_9fa48("166598");
          this.workflowsByOwnerKey.delete(workflow.ownerKey);
        }
      }
      this.clearCommittedTransitions(workflowId);
      return workflow;
    }
  }

  /**
   * Remove all committed-transition idempotency keys for a workflow.
   * @param {string} workflowId - Workflow ID.
   * @private
   */
  clearCommittedTransitions(workflowId) {
    if (stryMutAct_9fa48("166599")) {
      {}
    } else {
      stryCov_9fa48("166599");
      const prefix = stryMutAct_9fa48("166600") ? `` : (stryCov_9fa48("166600"), `${workflowId}:`);
      for (const key of this.committedTransitions) {
        if (stryMutAct_9fa48("166601")) {
          {}
        } else {
          stryCov_9fa48("166601");
          if (stryMutAct_9fa48("166604") ? key.endsWith(prefix) : stryMutAct_9fa48("166603") ? false : stryMutAct_9fa48("166602") ? true : (stryCov_9fa48("166602", "166603", "166604"), key.startsWith(prefix))) {
            if (stryMutAct_9fa48("166605")) {
              {}
            } else {
              stryCov_9fa48("166605");
              this.committedTransitions.delete(key);
            }
          }
        }
      }
    }
  }

  /**
   * Get one workflow by workflow ID.
   * @param {string} workflowId - Workflow ID.
   * @return {Object|null} Workflow state.
   */
  getWorkflowById(workflowId) {
    if (stryMutAct_9fa48("166606")) {
      {}
    } else {
      stryCov_9fa48("166606");
      return stryMutAct_9fa48("166609") ? this.workflowsById.get(workflowId) && null : stryMutAct_9fa48("166608") ? false : stryMutAct_9fa48("166607") ? true : (stryCov_9fa48("166607", "166608", "166609"), this.workflowsById.get(workflowId) || null);
    }
  }

  /**
   * Get one workflow by owner key.
   * @param {string} ownerKey - Workflow owner key.
   * @return {Object|null} Workflow state.
   */
  getWorkflowByOwnerKey(ownerKey) {
    if (stryMutAct_9fa48("166610")) {
      {}
    } else {
      stryCov_9fa48("166610");
      return stryMutAct_9fa48("166613") ? this.workflowsByOwnerKey.get(ownerKey) && null : stryMutAct_9fa48("166612") ? false : stryMutAct_9fa48("166611") ? true : (stryCov_9fa48("166611", "166612", "166613"), this.workflowsByOwnerKey.get(ownerKey) || null);
    }
  }

  /**
   * Upsert and persist one workflow participant record.
   * @param {string} workflowId - Workflow ID.
   * @param {Object} record - Participant record.
   * @return {Promise<Object>} Normalized participant state.
   */
  async upsertParticipant(workflowId, record) {
    if (stryMutAct_9fa48("166614")) {
      {}
    } else {
      stryCov_9fa48("166614");
      const workflow = this.requireWorkflow(workflowId);
      const existingKey = this.resolveParticipantKey(record);
      const existing = existingKey ? workflow.participants.get(existingKey) : null;
      const participant = this.createParticipantRecord(workflowId, record, existing);
      workflow.participants.set(participant.participantKey, participant);
      await this.persistParticipant(participant);
      return participant;
    }
  }

  /**
   * Process a typed participant acknowledgement with fence validation.
   *
   * Validates workflow identity, participant identity, and fence token
   * before persisting the acknowledgement. Returns a typed result so the
   * caller can distinguish accepted, stale, duplicate, and not-found
   * outcomes without catching exceptions.
   *
   * @param {string} workflowId - Workflow ID.
   * @param {Object} ack - Acknowledgement payload.
   * @param {string} ack.participantKey - Participant key.
   * @param {string} ack.status - New participant status.
   * @param {number} [ack.fenceToken] - Epoch or lease token.
   * @param {Object} [ack.checkpoint] - Resumable checkpoint data.
   * @return {Promise<Object>} Typed acknowledgement result with
   *   `result` (PARTICIPANT_ACK_RESULT), `participantKey`, and
   *   optional `reason`.
   */
  async acknowledgeParticipant(workflowId, ack) {
    if (stryMutAct_9fa48("166615")) {
      {}
    } else {
      stryCov_9fa48("166615");
      const participantKey = stryMutAct_9fa48("166618") ? ack?.[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY] && '' : stryMutAct_9fa48("166617") ? false : stryMutAct_9fa48("166616") ? true : (stryCov_9fa48("166616", "166617", "166618"), (stryMutAct_9fa48("166619") ? ack[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY] : (stryCov_9fa48("166619"), ack?.[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY])) || (stryMutAct_9fa48("166620") ? "Stryker was here!" : (stryCov_9fa48("166620"), '')));
      if (stryMutAct_9fa48("166623") ? false : stryMutAct_9fa48("166622") ? true : stryMutAct_9fa48("166621") ? participantKey : (stryCov_9fa48("166621", "166622", "166623"), !participantKey)) {
        if (stryMutAct_9fa48("166624")) {
          {}
        } else {
          stryCov_9fa48("166624");
          throw new Error(WORKFLOW_ERROR_MSG.PARTICIPANT_KEY_REQUIRED);
        }
      }
      const ackStatus = stryMutAct_9fa48("166627") ? ack?.[PARTICIPANT_ACK_FIELD.STATUS] && '' : stryMutAct_9fa48("166626") ? false : stryMutAct_9fa48("166625") ? true : (stryCov_9fa48("166625", "166626", "166627"), (stryMutAct_9fa48("166628") ? ack[PARTICIPANT_ACK_FIELD.STATUS] : (stryCov_9fa48("166628"), ack?.[PARTICIPANT_ACK_FIELD.STATUS])) || (stryMutAct_9fa48("166629") ? "Stryker was here!" : (stryCov_9fa48("166629"), '')));
      if (stryMutAct_9fa48("166632") ? false : stryMutAct_9fa48("166631") ? true : stryMutAct_9fa48("166630") ? ackStatus : (stryCov_9fa48("166630", "166631", "166632"), !ackStatus)) {
        if (stryMutAct_9fa48("166633")) {
          {}
        } else {
          stryCov_9fa48("166633");
          throw new Error(WORKFLOW_ERROR_MSG.ACK_STATUS_REQUIRED);
        }
      }
      const workflow = this.requireWorkflow(workflowId);
      const participant = workflow.participants.get(participantKey);
      if (stryMutAct_9fa48("166636") ? false : stryMutAct_9fa48("166635") ? true : stryMutAct_9fa48("166634") ? participant : (stryCov_9fa48("166634", "166635", "166636"), !participant)) {
        if (stryMutAct_9fa48("166637")) {
          {}
        } else {
          stryCov_9fa48("166637");
          const notFoundResult = stryMutAct_9fa48("166638") ? {} : (stryCov_9fa48("166638"), {
            result: PARTICIPANT_ACK_RESULT.PARTICIPANT_NOT_FOUND,
            participantKey,
            reason: WORKFLOW_ERROR_MSG.participantNotFound(participantKey)
          });
          this.emitAckRejectionDiagnostic(workflowId, participantKey, stryMutAct_9fa48("166639") ? {} : (stryCov_9fa48("166639"), {
            rejectionResult: PARTICIPANT_ACK_RESULT.PARTICIPANT_NOT_FOUND,
            reason: notFoundResult.reason,
            receivedStatus: ackStatus
          }));
          return notFoundResult;
        }
      }

      // Fence token validation: reject stale acknowledgements.
      const ackFence = stryMutAct_9fa48("166640") ? ack[PARTICIPANT_ACK_FIELD.FENCE_TOKEN] : (stryCov_9fa48("166640"), ack?.[PARTICIPANT_ACK_FIELD.FENCE_TOKEN]);
      if (stryMutAct_9fa48("166643") ? ackFence !== undefined || ackFence !== null : stryMutAct_9fa48("166642") ? false : stryMutAct_9fa48("166641") ? true : (stryCov_9fa48("166641", "166642", "166643"), (stryMutAct_9fa48("166645") ? ackFence === undefined : stryMutAct_9fa48("166644") ? true : (stryCov_9fa48("166644", "166645"), ackFence !== undefined)) && (stryMutAct_9fa48("166647") ? ackFence === null : stryMutAct_9fa48("166646") ? true : (stryCov_9fa48("166646", "166647"), ackFence !== null)))) {
        if (stryMutAct_9fa48("166648")) {
          {}
        } else {
          stryCov_9fa48("166648");
          const currentFence = participant.fenceToken;
          if (stryMutAct_9fa48("166651") ? currentFence !== undefined && currentFence !== null || ackFence < currentFence : stryMutAct_9fa48("166650") ? false : stryMutAct_9fa48("166649") ? true : (stryCov_9fa48("166649", "166650", "166651"), (stryMutAct_9fa48("166653") ? currentFence !== undefined || currentFence !== null : stryMutAct_9fa48("166652") ? true : (stryCov_9fa48("166652", "166653"), (stryMutAct_9fa48("166655") ? currentFence === undefined : stryMutAct_9fa48("166654") ? true : (stryCov_9fa48("166654", "166655"), currentFence !== undefined)) && (stryMutAct_9fa48("166657") ? currentFence === null : stryMutAct_9fa48("166656") ? true : (stryCov_9fa48("166656", "166657"), currentFence !== null)))) && (stryMutAct_9fa48("166660") ? ackFence >= currentFence : stryMutAct_9fa48("166659") ? ackFence <= currentFence : stryMutAct_9fa48("166658") ? true : (stryCov_9fa48("166658", "166659", "166660"), ackFence < currentFence)))) {
            if (stryMutAct_9fa48("166661")) {
              {}
            } else {
              stryCov_9fa48("166661");
              const staleResult = stryMutAct_9fa48("166662") ? {} : (stryCov_9fa48("166662"), {
                result: PARTICIPANT_ACK_RESULT.STALE_FENCE,
                participantKey,
                reason: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN,
                currentFenceToken: currentFence,
                receivedFenceToken: ackFence
              });
              this.emitAckRejectionDiagnostic(workflowId, participantKey, stryMutAct_9fa48("166663") ? {} : (stryCov_9fa48("166663"), {
                rejectionResult: PARTICIPANT_ACK_RESULT.STALE_FENCE,
                reason: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN,
                receivedStatus: ackStatus,
                currentFenceToken: currentFence,
                receivedFenceToken: ackFence
              }));
              return staleResult;
            }
          }
          participant.fenceToken = ackFence;
        }
      }

      // Duplicate detection: same status already acknowledged.
      if (stryMutAct_9fa48("166666") ? participant.status === ackStatus || participant.acknowledgedAt !== undefined : stryMutAct_9fa48("166665") ? false : stryMutAct_9fa48("166664") ? true : (stryCov_9fa48("166664", "166665", "166666"), (stryMutAct_9fa48("166668") ? participant.status !== ackStatus : stryMutAct_9fa48("166667") ? true : (stryCov_9fa48("166667", "166668"), participant.status === ackStatus)) && (stryMutAct_9fa48("166670") ? participant.acknowledgedAt === undefined : stryMutAct_9fa48("166669") ? true : (stryCov_9fa48("166669", "166670"), participant.acknowledgedAt !== undefined)))) {
        if (stryMutAct_9fa48("166671")) {
          {}
        } else {
          stryCov_9fa48("166671");
          const duplicateResult = stryMutAct_9fa48("166672") ? {} : (stryCov_9fa48("166672"), {
            result: PARTICIPANT_ACK_RESULT.DUPLICATE,
            participantKey,
            reason: WORKFLOW_ERROR_MSG.DUPLICATE_TRANSITION
          });
          this.emitAckRejectionDiagnostic(workflowId, participantKey, stryMutAct_9fa48("166673") ? {} : (stryCov_9fa48("166673"), {
            rejectionResult: PARTICIPANT_ACK_RESULT.DUPLICATE,
            reason: WORKFLOW_ERROR_MSG.DUPLICATE_TRANSITION,
            receivedStatus: ackStatus,
            currentStatus: participant.status
          }));
          return duplicateResult;
        }
      }

      // Apply acknowledgement.
      const now = this.now();
      participant.status = ackStatus;
      participant.acknowledgedAt = now;
      participant.updatedAt = now;

      // Persist checkpoint data alongside participant state.
      const checkpoint = stryMutAct_9fa48("166674") ? ack[PARTICIPANT_ACK_FIELD.CHECKPOINT] : (stryCov_9fa48("166674"), ack?.[PARTICIPANT_ACK_FIELD.CHECKPOINT]);
      if (stryMutAct_9fa48("166677") ? checkpoint !== undefined || checkpoint !== null : stryMutAct_9fa48("166676") ? false : stryMutAct_9fa48("166675") ? true : (stryCov_9fa48("166675", "166676", "166677"), (stryMutAct_9fa48("166679") ? checkpoint === undefined : stryMutAct_9fa48("166678") ? true : (stryCov_9fa48("166678", "166679"), checkpoint !== undefined)) && (stryMutAct_9fa48("166681") ? checkpoint === null : stryMutAct_9fa48("166680") ? true : (stryCov_9fa48("166680", "166681"), checkpoint !== null)))) {
        if (stryMutAct_9fa48("166682")) {
          {}
        } else {
          stryCov_9fa48("166682");
          participant.checkpoint = checkpoint;
        }
      }
      await this.persistParticipant(participant);
      return stryMutAct_9fa48("166683") ? {} : (stryCov_9fa48("166683"), {
        result: PARTICIPANT_ACK_RESULT.ACCEPTED,
        participantKey,
        acknowledgedAt: now
      });
    }
  }

  /**
   * Persist the current participant state.
   * @param {string} workflowId - Workflow ID.
   * @param {string} participantKey - Participant key.
   * @return {Promise<Object>} Persisted participant state.
   */
  async persistParticipantState(workflowId, participantKey) {
    if (stryMutAct_9fa48("166684")) {
      {}
    } else {
      stryCov_9fa48("166684");
      const workflow = this.requireWorkflow(workflowId);
      const participant = workflow.participants.get(participantKey);
      if (stryMutAct_9fa48("166687") ? false : stryMutAct_9fa48("166686") ? true : stryMutAct_9fa48("166685") ? participant : (stryCov_9fa48("166685", "166686", "166687"), !participant)) {
        if (stryMutAct_9fa48("166688")) {
          {}
        } else {
          stryCov_9fa48("166688");
          throw new Error(WORKFLOW_ERROR_MSG.participantNotFound(participantKey));
        }
      }
      await this.persistParticipant(participant);
      return participant;
    }
  }

  /**
   * Persist a selected participant set.
   * @param {string} workflowId - Workflow ID.
   * @param {string[]} participantKeys - Participant keys to persist.
   * @return {Promise<void>}
   */
  async persistParticipants(workflowId, participantKeys) {
    if (stryMutAct_9fa48("166689")) {
      {}
    } else {
      stryCov_9fa48("166689");
      for (const participantKey of participantKeys) {
        if (stryMutAct_9fa48("166690")) {
          {}
        } else {
          stryCov_9fa48("166690");
          await this.persistParticipantState(workflowId, participantKey);
        }
      }
    }
  }

  /**
   * Execute one participant stage with durable participant updates.
   * @param {string} workflowId - Workflow ID.
   * @param {string} transientStatus - Status while the stage is running.
   * @param {string} successStatus - Status on success.
   * @param {Function} operation - Participant operation callback.
   * @param {Object} [options] - Stage options.
   * @param {string} [options.failureStatus] - Status on failure.
   * @param {string[]} [options.participantKeys] - Participant order.
   * @return {Promise<Object[]>} Failed participant records.
   */
  async executeParticipantStage(workflowId, transientStatus, successStatus, operation, options = {}) {
    if (stryMutAct_9fa48("166691")) {
      {}
    } else {
      stryCov_9fa48("166691");
      const workflow = this.requireWorkflow(workflowId);
      const participantKeys = (stryMutAct_9fa48("166694") ? Array.isArray(options.participantKeys) || options.participantKeys.length > 0 : stryMutAct_9fa48("166693") ? false : stryMutAct_9fa48("166692") ? true : (stryCov_9fa48("166692", "166693", "166694"), Array.isArray(options.participantKeys) && (stryMutAct_9fa48("166697") ? options.participantKeys.length <= 0 : stryMutAct_9fa48("166696") ? options.participantKeys.length >= 0 : stryMutAct_9fa48("166695") ? true : (stryCov_9fa48("166695", "166696", "166697"), options.participantKeys.length > 0)))) ? options.participantKeys : Array.from(workflow.participants.keys());
      const failureStatus = stryMutAct_9fa48("166700") ? options.failureStatus && 'FAILED' : stryMutAct_9fa48("166699") ? false : stryMutAct_9fa48("166698") ? true : (stryCov_9fa48("166698", "166699", "166700"), options.failureStatus || (stryMutAct_9fa48("166701") ? "" : (stryCov_9fa48("166701"), 'FAILED')));
      const failedParticipants = stryMutAct_9fa48("166702") ? ["Stryker was here"] : (stryCov_9fa48("166702"), []);
      for (const participantKey of participantKeys) {
        if (stryMutAct_9fa48("166703")) {
          {}
        } else {
          stryCov_9fa48("166703");
          const participant = workflow.participants.get(participantKey);
          if (stryMutAct_9fa48("166706") ? false : stryMutAct_9fa48("166705") ? true : stryMutAct_9fa48("166704") ? participant : (stryCov_9fa48("166704", "166705", "166706"), !participant)) {
            if (stryMutAct_9fa48("166707")) {
              {}
            } else {
              stryCov_9fa48("166707");
              continue;
            }
          }
          participant.status = transientStatus;
          participant.updatedAt = this.now();
          participant.lastError = null;
          await this.persistParticipant(participant);
          try {
            if (stryMutAct_9fa48("166708")) {
              {}
            } else {
              stryCov_9fa48("166708");
              await operation(participantKey, participant);
              participant.status = successStatus;
              participant.updatedAt = this.now();
              participant.lastError = null;
            }
          } catch (error) {
            if (stryMutAct_9fa48("166709")) {
              {}
            } else {
              stryCov_9fa48("166709");
              participant.status = failureStatus;
              participant.updatedAt = this.now();
              participant.lastError = error.message;
              failedParticipants.push(stryMutAct_9fa48("166710") ? {} : (stryCov_9fa48("166710"), {
                participantId: participant.participantId,
                participantKey,
                error: error.message
              }));
            }
          }
          await this.persistParticipant(participant);
        }
      }
      return failedParticipants;
    }
  }

  /**
   * Recover workflow and participant state from canonical row arrays.
   * @param {Object} payload - Recovery payload.
   * @param {Object[]} [payload.workflows] - Workflow rows.
   * @param {Object[]} [payload.participants] - Participant rows.
   * @param {Function} payload.loadWorkflow - Workflow row loader.
   * @param {Function} [payload.loadParticipant] - Participant row loader.
   * @param {Function} [payload.isTerminalWorkflow] - Terminal-state predicate.
   */
  recover(payload = {}) {
    if (stryMutAct_9fa48("166711")) {
      {}
    } else {
      stryCov_9fa48("166711");
      const workflowRows = Array.isArray(payload.workflows) ? payload.workflows : stryMutAct_9fa48("166712") ? ["Stryker was here"] : (stryCov_9fa48("166712"), []);
      const participantRows = Array.isArray(payload.participants) ? payload.participants : stryMutAct_9fa48("166713") ? ["Stryker was here"] : (stryCov_9fa48("166713"), []);
      const loadWorkflow = payload.loadWorkflow;
      const loadParticipant = payload.loadParticipant;
      const isTerminalWorkflow = payload.isTerminalWorkflow;
      for (const row of workflowRows) {
        if (stryMutAct_9fa48("166714")) {
          {}
        } else {
          stryCov_9fa48("166714");
          const workflowRecord = (stryMutAct_9fa48("166717") ? typeof loadWorkflow !== 'function' : stryMutAct_9fa48("166716") ? false : stryMutAct_9fa48("166715") ? true : (stryCov_9fa48("166715", "166716", "166717"), typeof loadWorkflow === (stryMutAct_9fa48("166718") ? "" : (stryCov_9fa48("166718"), 'function')))) ? loadWorkflow(row) : row;
          if (stryMutAct_9fa48("166721") ? false : stryMutAct_9fa48("166720") ? true : stryMutAct_9fa48("166719") ? workflowRecord : (stryCov_9fa48("166719", "166720", "166721"), !workflowRecord)) {
            if (stryMutAct_9fa48("166722")) {
              {}
            } else {
              stryCov_9fa48("166722");
              continue;
            }
          }
          if (stryMutAct_9fa48("166725") ? typeof isTerminalWorkflow === 'function' || isTerminalWorkflow(workflowRecord, row) : stryMutAct_9fa48("166724") ? false : stryMutAct_9fa48("166723") ? true : (stryCov_9fa48("166723", "166724", "166725"), (stryMutAct_9fa48("166727") ? typeof isTerminalWorkflow !== 'function' : stryMutAct_9fa48("166726") ? true : (stryCov_9fa48("166726", "166727"), typeof isTerminalWorkflow === (stryMutAct_9fa48("166728") ? "" : (stryCov_9fa48("166728"), 'function')))) && isTerminalWorkflow(workflowRecord, row))) {
            if (stryMutAct_9fa48("166729")) {
              {}
            } else {
              stryCov_9fa48("166729");
              continue;
            }
          }
          this.setWorkflowState(this.createWorkflowRecord(workflowRecord));
        }
      }
      for (const row of participantRows) {
        if (stryMutAct_9fa48("166730")) {
          {}
        } else {
          stryCov_9fa48("166730");
          const participantRecord = (stryMutAct_9fa48("166733") ? typeof loadParticipant !== 'function' : stryMutAct_9fa48("166732") ? false : stryMutAct_9fa48("166731") ? true : (stryCov_9fa48("166731", "166732", "166733"), typeof loadParticipant === (stryMutAct_9fa48("166734") ? "" : (stryCov_9fa48("166734"), 'function')))) ? loadParticipant(row) : row;
          if (stryMutAct_9fa48("166737") ? false : stryMutAct_9fa48("166736") ? true : stryMutAct_9fa48("166735") ? participantRecord : (stryCov_9fa48("166735", "166736", "166737"), !participantRecord)) {
            if (stryMutAct_9fa48("166738")) {
              {}
            } else {
              stryCov_9fa48("166738");
              continue;
            }
          }
          const workflowId = String(stryMutAct_9fa48("166741") ? participantRecord.workflowId && '' : stryMutAct_9fa48("166740") ? false : stryMutAct_9fa48("166739") ? true : (stryCov_9fa48("166739", "166740", "166741"), participantRecord.workflowId || (stryMutAct_9fa48("166742") ? "Stryker was here!" : (stryCov_9fa48("166742"), ''))));
          if (stryMutAct_9fa48("166745") ? false : stryMutAct_9fa48("166744") ? true : stryMutAct_9fa48("166743") ? workflowId : (stryCov_9fa48("166743", "166744", "166745"), !workflowId)) {
            if (stryMutAct_9fa48("166746")) {
              {}
            } else {
              stryCov_9fa48("166746");
              continue;
            }
          }
          const workflow = this.getWorkflowById(workflowId);
          if (stryMutAct_9fa48("166749") ? false : stryMutAct_9fa48("166748") ? true : stryMutAct_9fa48("166747") ? workflow : (stryCov_9fa48("166747", "166748", "166749"), !workflow)) {
            if (stryMutAct_9fa48("166750")) {
              {}
            } else {
              stryCov_9fa48("166750");
              continue;
            }
          }
          const participant = this.createParticipantRecord(workflowId, participantRecord);
          workflow.participants.set(participant.participantKey, participant);
        }
      }
    }
  }

  /**
   * Run one execution per owner key at a time.
   * @param {string} ownerKey - Workflow owner key.
   * @param {Function} executionFactory - Async execution factory.
   * @return {Promise<*>} Shared execution promise.
   */
  runExclusive(ownerKey, executionFactory) {
    if (stryMutAct_9fa48("166751")) {
      {}
    } else {
      stryCov_9fa48("166751");
      const normalizedOwnerKey = String(stryMutAct_9fa48("166754") ? ownerKey && '' : stryMutAct_9fa48("166753") ? false : stryMutAct_9fa48("166752") ? true : (stryCov_9fa48("166752", "166753", "166754"), ownerKey || (stryMutAct_9fa48("166755") ? "Stryker was here!" : (stryCov_9fa48("166755"), ''))));
      if (stryMutAct_9fa48("166758") ? false : stryMutAct_9fa48("166757") ? true : stryMutAct_9fa48("166756") ? normalizedOwnerKey : (stryCov_9fa48("166756", "166757", "166758"), !normalizedOwnerKey)) {
        if (stryMutAct_9fa48("166759")) {
          {}
        } else {
          stryCov_9fa48("166759");
          throw new Error(WORKFLOW_ERROR_MSG.OWNER_KEY_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("166761") ? false : stryMutAct_9fa48("166760") ? true : (stryCov_9fa48("166760", "166761"), this.inFlightExecutionsByOwnerKey.has(normalizedOwnerKey))) {
        if (stryMutAct_9fa48("166762")) {
          {}
        } else {
          stryCov_9fa48("166762");
          return this.inFlightExecutionsByOwnerKey.get(normalizedOwnerKey);
        }
      }
      let execution;
      try {
        if (stryMutAct_9fa48("166763")) {
          {}
        } else {
          stryCov_9fa48("166763");
          execution = Promise.resolve(executionFactory());
        }
      } catch (error) {
        if (stryMutAct_9fa48("166764")) {
          {}
        } else {
          stryCov_9fa48("166764");
          execution = Promise.reject(error);
        }
      }
      const trackedExecution = execution.finally(() => {
        if (stryMutAct_9fa48("166765")) {
          {}
        } else {
          stryCov_9fa48("166765");
          this.inFlightExecutionsByOwnerKey.delete(normalizedOwnerKey);
        }
      });
      this.inFlightExecutionsByOwnerKey.set(normalizedOwnerKey, trackedExecution);
      return trackedExecution;
    }
  }

  /**
   * Normalize one workflow record.
   * @param {Object} record - Raw workflow record.
   * @return {Object} Workflow state.
   * @private
   */
  createWorkflowRecord(record = {}) {
    if (stryMutAct_9fa48("166766")) {
      {}
    } else {
      stryCov_9fa48("166766");
      const workflowId = String(stryMutAct_9fa48("166769") ? record.workflowId && '' : stryMutAct_9fa48("166768") ? false : stryMutAct_9fa48("166767") ? true : (stryCov_9fa48("166767", "166768", "166769"), record.workflowId || (stryMutAct_9fa48("166770") ? "Stryker was here!" : (stryCov_9fa48("166770"), ''))));
      const ownerKey = String(stryMutAct_9fa48("166773") ? record.ownerKey && '' : stryMutAct_9fa48("166772") ? false : stryMutAct_9fa48("166771") ? true : (stryCov_9fa48("166771", "166772", "166773"), record.ownerKey || (stryMutAct_9fa48("166774") ? "Stryker was here!" : (stryCov_9fa48("166774"), ''))));
      if (stryMutAct_9fa48("166777") ? false : stryMutAct_9fa48("166776") ? true : stryMutAct_9fa48("166775") ? workflowId : (stryCov_9fa48("166775", "166776", "166777"), !workflowId)) {
        if (stryMutAct_9fa48("166778")) {
          {}
        } else {
          stryCov_9fa48("166778");
          throw new Error(WORKFLOW_ERROR_MSG.WORKFLOW_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("166781") ? false : stryMutAct_9fa48("166780") ? true : stryMutAct_9fa48("166779") ? ownerKey : (stryCov_9fa48("166779", "166780", "166781"), !ownerKey)) {
        if (stryMutAct_9fa48("166782")) {
          {}
        } else {
          stryCov_9fa48("166782");
          throw new Error(WORKFLOW_ERROR_MSG.OWNER_KEY_REQUIRED);
        }
      }
      const createdAt = Number.isFinite(record.createdAt) ? record.createdAt : this.now();
      const updatedAt = Number.isFinite(record.updatedAt) ? record.updatedAt : createdAt;
      return stryMutAct_9fa48("166783") ? {} : (stryCov_9fa48("166783"), {
        ...record,
        workflowId,
        ownerKey,
        metadata: Object.prototype.hasOwnProperty.call(record, stryMutAct_9fa48("166784") ? "" : (stryCov_9fa48("166784"), 'metadata')) ? record.metadata : null,
        participants: record.participants instanceof Map ? new Map(record.participants.entries()) : new Map(),
        createdAt,
        updatedAt
      });
    }
  }

  /**
   * Normalize one participant record.
   * @param {string} workflowId - Workflow ID.
   * @param {Object} record - Raw participant record.
   * @param {Object|null} [existing] - Existing participant state.
   * @return {Object} Participant state.
   * @private
   */
  createParticipantRecord(workflowId, record = {}, existing = null) {
    if (stryMutAct_9fa48("166785")) {
      {}
    } else {
      stryCov_9fa48("166785");
      const participantId = String(stryMutAct_9fa48("166788") ? (record.participantId || existing?.participantId) && '' : stryMutAct_9fa48("166787") ? false : stryMutAct_9fa48("166786") ? true : (stryCov_9fa48("166786", "166787", "166788"), (stryMutAct_9fa48("166790") ? record.participantId && existing?.participantId : stryMutAct_9fa48("166789") ? false : (stryCov_9fa48("166789", "166790"), record.participantId || (stryMutAct_9fa48("166791") ? existing.participantId : (stryCov_9fa48("166791"), existing?.participantId)))) || (stryMutAct_9fa48("166792") ? "Stryker was here!" : (stryCov_9fa48("166792"), ''))));
      if (stryMutAct_9fa48("166795") ? false : stryMutAct_9fa48("166794") ? true : stryMutAct_9fa48("166793") ? participantId : (stryCov_9fa48("166793", "166794", "166795"), !participantId)) {
        if (stryMutAct_9fa48("166796")) {
          {}
        } else {
          stryCov_9fa48("166796");
          throw new Error(WORKFLOW_ERROR_MSG.PARTICIPANT_ID_REQUIRED);
        }
      }
      const participantKey = stryMutAct_9fa48("166799") ? (this.resolveParticipantKey(record) || existing?.participantKey) && participantId : stryMutAct_9fa48("166798") ? false : stryMutAct_9fa48("166797") ? true : (stryCov_9fa48("166797", "166798", "166799"), (stryMutAct_9fa48("166801") ? this.resolveParticipantKey(record) && existing?.participantKey : stryMutAct_9fa48("166800") ? false : (stryCov_9fa48("166800", "166801"), this.resolveParticipantKey(record) || (stryMutAct_9fa48("166802") ? existing.participantKey : (stryCov_9fa48("166802"), existing?.participantKey)))) || participantId);
      const createdAt = Number.isFinite(record.createdAt) ? record.createdAt : stryMutAct_9fa48("166805") ? existing?.createdAt && this.now() : stryMutAct_9fa48("166804") ? false : stryMutAct_9fa48("166803") ? true : (stryCov_9fa48("166803", "166804", "166805"), (stryMutAct_9fa48("166806") ? existing.createdAt : (stryCov_9fa48("166806"), existing?.createdAt)) || this.now());
      const updatedAt = Number.isFinite(record.updatedAt) ? record.updatedAt : this.now();
      return stryMutAct_9fa48("166807") ? {} : (stryCov_9fa48("166807"), {
        ...existing,
        ...record,
        workflowId,
        participantId,
        participantKey,
        createdAt,
        updatedAt
      });
    }
  }

  /**
   * Store a workflow in both registries.
   * @param {Object} workflow - Workflow state.
   * @return {Object} Workflow state.
   * @private
   */
  setWorkflowState(workflow) {
    if (stryMutAct_9fa48("166808")) {
      {}
    } else {
      stryCov_9fa48("166808");
      this.workflowsById.set(workflow.workflowId, workflow);
      this.workflowsByOwnerKey.set(workflow.ownerKey, workflow);
      return workflow;
    }
  }

  /**
   * Resolve the canonical participant key.
   * @param {Object} record - Participant record.
   * @return {string} Participant key.
   * @private
   */
  resolveParticipantKey(record = {}) {
    if (stryMutAct_9fa48("166809")) {
      {}
    } else {
      stryCov_9fa48("166809");
      const participantKey = stryMutAct_9fa48("166812") ? (record.participantKey || record.partitionId || record.participantId) && '' : stryMutAct_9fa48("166811") ? false : stryMutAct_9fa48("166810") ? true : (stryCov_9fa48("166810", "166811", "166812"), (stryMutAct_9fa48("166814") ? (record.participantKey || record.partitionId) && record.participantId : stryMutAct_9fa48("166813") ? false : (stryCov_9fa48("166813", "166814"), (stryMutAct_9fa48("166816") ? record.participantKey && record.partitionId : stryMutAct_9fa48("166815") ? false : (stryCov_9fa48("166815", "166816"), record.participantKey || record.partitionId)) || record.participantId)) || (stryMutAct_9fa48("166817") ? "Stryker was here!" : (stryCov_9fa48("166817"), '')));
      return String(stryMutAct_9fa48("166820") ? participantKey && '' : stryMutAct_9fa48("166819") ? false : stryMutAct_9fa48("166818") ? true : (stryCov_9fa48("166818", "166819", "166820"), participantKey || (stryMutAct_9fa48("166821") ? "Stryker was here!" : (stryCov_9fa48("166821"), ''))));
    }
  }

  /**
   * Check whether a transition has already been committed.
   * @param {string} operationId - Operation or workflow ID.
   * @param {string} stepId - Target step of the transition.
   * @return {boolean} True if the transition was already committed.
   */
  isTransitionIdempotent(operationId, stepId) {
    if (stryMutAct_9fa48("166822")) {
      {}
    } else {
      stryCov_9fa48("166822");
      const key = buildTransitionIdempotencyKey(operationId, stepId);
      return this.committedTransitions.has(key);
    }
  }

  /**
   * Mark a transition as committed so replays are rejected.
   * @param {string} operationId - Operation or workflow ID.
   * @param {string} stepId - Target step of the transition.
   */
  markTransitionCommitted(operationId, stepId) {
    if (stryMutAct_9fa48("166823")) {
      {}
    } else {
      stryCov_9fa48("166823");
      const key = buildTransitionIdempotencyKey(operationId, stepId);
      this.committedTransitions.add(key);
    }
  }

  /**
   * Emit a typed diagnostic record for a rejected acknowledgement.
   *
   * Invokes the onAckRejection callback (if wired) with a frozen
   * diagnostic record containing workflow identity, participant key,
   * rejection result, reason, and fence/status context.
   *
   * @param {string} workflowId - Workflow ID.
   * @param {string} participantKey - Participant key.
   * @param {Object} context - Rejection context fields.
   * @return {Object|null} The emitted diagnostic record, or null.
   * @private
   */
  emitAckRejectionDiagnostic(workflowId, participantKey, context = {}) {
    if (stryMutAct_9fa48("166824")) {
      {}
    } else {
      stryCov_9fa48("166824");
      if (stryMutAct_9fa48("166827") ? typeof this.onAckRejection === 'function' : stryMutAct_9fa48("166826") ? false : stryMutAct_9fa48("166825") ? true : (stryCov_9fa48("166825", "166826", "166827"), typeof this.onAckRejection !== (stryMutAct_9fa48("166828") ? "" : (stryCov_9fa48("166828"), 'function')))) {
        if (stryMutAct_9fa48("166829")) {
          {}
        } else {
          stryCov_9fa48("166829");
          return null;
        }
      }
      const record = Object.freeze(stryMutAct_9fa48("166830") ? {} : (stryCov_9fa48("166830"), {
        [ACK_REJECTION_DIAGNOSTIC_FIELD.WORKFLOW_ID]: workflowId,
        [ACK_REJECTION_DIAGNOSTIC_FIELD.PARTICIPANT_KEY]: participantKey,
        [ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT]: stryMutAct_9fa48("166833") ? context.rejectionResult && null : stryMutAct_9fa48("166832") ? false : stryMutAct_9fa48("166831") ? true : (stryCov_9fa48("166831", "166832", "166833"), context.rejectionResult || null),
        [ACK_REJECTION_DIAGNOSTIC_FIELD.REASON]: stryMutAct_9fa48("166836") ? context.reason && null : stryMutAct_9fa48("166835") ? false : stryMutAct_9fa48("166834") ? true : (stryCov_9fa48("166834", "166835", "166836"), context.reason || null),
        [ACK_REJECTION_DIAGNOSTIC_FIELD.RECEIVED_STATUS]: stryMutAct_9fa48("166839") ? context.receivedStatus && null : stryMutAct_9fa48("166838") ? false : stryMutAct_9fa48("166837") ? true : (stryCov_9fa48("166837", "166838", "166839"), context.receivedStatus || null),
        [ACK_REJECTION_DIAGNOSTIC_FIELD.CURRENT_STATUS]: stryMutAct_9fa48("166842") ? context.currentStatus && null : stryMutAct_9fa48("166841") ? false : stryMutAct_9fa48("166840") ? true : (stryCov_9fa48("166840", "166841", "166842"), context.currentStatus || null),
        [ACK_REJECTION_DIAGNOSTIC_FIELD.RECEIVED_FENCE_TOKEN]: stryMutAct_9fa48("166843") ? context.receivedFenceToken && null : (stryCov_9fa48("166843"), context.receivedFenceToken ?? null),
        [ACK_REJECTION_DIAGNOSTIC_FIELD.CURRENT_FENCE_TOKEN]: stryMutAct_9fa48("166844") ? context.currentFenceToken && null : (stryCov_9fa48("166844"), context.currentFenceToken ?? null),
        [ACK_REJECTION_DIAGNOSTIC_FIELD.TIMESTAMP]: this.now()
      }));
      this.onAckRejection(record);
      return record;
    }
  }

  /**
   * Require one workflow to exist.
   * @param {string} workflowId - Workflow ID.
   * @return {Object} Workflow state.
   * @private
   */
  requireWorkflow(workflowId) {
    if (stryMutAct_9fa48("166845")) {
      {}
    } else {
      stryCov_9fa48("166845");
      const workflow = this.getWorkflowById(workflowId);
      if (stryMutAct_9fa48("166848") ? false : stryMutAct_9fa48("166847") ? true : stryMutAct_9fa48("166846") ? workflow : (stryCov_9fa48("166846", "166847", "166848"), !workflow)) {
        if (stryMutAct_9fa48("166849")) {
          {}
        } else {
          stryCov_9fa48("166849");
          throw new Error(WORKFLOW_ERROR_MSG.workflowNotFound(workflowId));
        }
      }
      return workflow;
    }
  }
}
export { DurableWorkflowCoordinator };