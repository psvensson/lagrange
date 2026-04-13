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
import { createHash } from 'node:crypto';
import { QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_OPERATION } from '../query-constants.js';
import { TIMEOUT_BUDGET_DEFAULT, createTopLevelOperationBudget, getRemainingBudgetMs } from '../../control-plane/timeout-budget.js';
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../../control-plane/control-plane-error-classification.js';
import { DurableWorkflowCoordinator } from '../../workflow/durable-workflow-coordinator.js';
const TRANSACTION_STATUS = Object.freeze(stryMutAct_9fa48("110811") ? {} : (stryCov_9fa48("110811"), {
  ACTIVE: stryMutAct_9fa48("110812") ? "" : (stryCov_9fa48("110812"), 'ACTIVE'),
  PREPARING: stryMutAct_9fa48("110813") ? "" : (stryCov_9fa48("110813"), 'PREPARING'),
  PREPARED: stryMutAct_9fa48("110814") ? "" : (stryCov_9fa48("110814"), 'PREPARED'),
  COMMITTING: stryMutAct_9fa48("110815") ? "" : (stryCov_9fa48("110815"), 'COMMITTING'),
  COMMITTED: stryMutAct_9fa48("110816") ? "" : (stryCov_9fa48("110816"), 'COMMITTED'),
  ROLLING_BACK: stryMutAct_9fa48("110817") ? "" : (stryCov_9fa48("110817"), 'ROLLING_BACK'),
  ROLLED_BACK: stryMutAct_9fa48("110818") ? "" : (stryCov_9fa48("110818"), 'ROLLED_BACK'),
  FAILED: stryMutAct_9fa48("110819") ? "" : (stryCov_9fa48("110819"), 'FAILED')
}));

// Participants share the same lifecycle status vocabulary as transactions.
const PARTICIPANT_STATUS = TRANSACTION_STATUS;
const WRITE_OPERATION_STATUS = Object.freeze(stryMutAct_9fa48("110820") ? {} : (stryCov_9fa48("110820"), {
  PENDING: stryMutAct_9fa48("110821") ? "" : (stryCov_9fa48("110821"), 'PENDING'),
  SUCCEEDED: stryMutAct_9fa48("110822") ? "" : (stryCov_9fa48("110822"), 'SUCCEEDED'),
  FAILED: stryMutAct_9fa48("110823") ? "" : (stryCov_9fa48("110823"), 'FAILED')
}));
const TERMINAL_TRANSACTION_STATUS = Object.freeze(new Set(stryMutAct_9fa48("110824") ? [] : (stryCov_9fa48("110824"), [TRANSACTION_STATUS.COMMITTED, TRANSACTION_STATUS.ROLLED_BACK])));
const RECOVERY_COMMIT_TRANSACTION_STATUS = Object.freeze(new Set(stryMutAct_9fa48("110825") ? [] : (stryCov_9fa48("110825"), [TRANSACTION_STATUS.PREPARED, TRANSACTION_STATUS.COMMITTING])));
const RECOVERY_ROLLBACK_TRANSACTION_STATUS = Object.freeze(new Set(stryMutAct_9fa48("110826") ? [] : (stryCov_9fa48("110826"), [TRANSACTION_STATUS.ACTIVE, TRANSACTION_STATUS.PREPARING, TRANSACTION_STATUS.ROLLING_BACK])));
const PARTICIPANT_RETRY_DEFAULT = Object.freeze(stryMutAct_9fa48("110827") ? {} : (stryCov_9fa48("110827"), {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 10,
  MAX_DELAY_MS: 250
}));
const PARTICIPANT_RETRY_LOG_MSG = stryMutAct_9fa48("110828") ? "" : (stryCov_9fa48("110828"), 'Distributed transaction participant retry');
const RECOVERY_SWEEP_LOG_MSG = stryMutAct_9fa48("110829") ? "" : (stryCov_9fa48("110829"), 'Distributed transaction recovery sweep failed');
const RECOVERY_SWEEP_DEFAULT_INTERVAL_MS = 1000;
const RECOVERY_SWEEP_DEFER_BASE_MS = 1000;
const RECOVERY_SWEEP_DEFER_MAX_MS = 30000;
const TIMEOUT_ERROR_MESSAGES = new Set(stryMutAct_9fa48("110830") ? [] : (stryCov_9fa48("110830"), [QUERY_ERROR_MSG.QUERY_TIMEOUT, QUERY_ERROR_MSG.QUERY_TIMED_OUT]));
const IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES = new Set(stryMutAct_9fa48("110831") ? [] : (stryCov_9fa48("110831"), [QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT]));

/**
 * Distributed transaction coordinator with participant state persistence hooks.
 */
class DistributedTransactionCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Function} options.beginParticipant - Begin callback.
   * @param {Function} [options.prepareParticipant] - Prepare callback.
   * @param {Function} options.commitParticipant - Commit callback.
   * @param {Function} options.rollbackParticipant - Rollback callback.
   * @param {Function} [options.persistTransaction] - Persist tx row callback.
   * @param {Function} [options.persistParticipant] - Persist participant callback.
   * @param {Function} [options.persistWriteOperation] - Persist write op callback.
   * @param {Function} [options.epochSource] - Monotonic transaction epoch source.
   * @param {number} [options.transactionBudgetMs] - Transaction timeout budget.
   * @param {number} [options.participantRetryMaxRetries] - Retry attempts.
   * @param {number} [options.participantRetryBaseDelayMs] - Retry base delay.
   * @param {number} [options.participantRetryMaxDelayMs] - Retry max delay.
   * @param {Function} [options.sleep] - Async sleep hook.
   * @param {Function} [options.onParticipantRetry] - Retry diagnostic hook.
   * @param {Function} [options.now] - Clock function.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("110832")) {
      {}
    } else {
      stryCov_9fa48("110832");
      this.beginParticipant = stryMutAct_9fa48("110835") ? options.beginParticipant && (async () => {}) : stryMutAct_9fa48("110834") ? false : stryMutAct_9fa48("110833") ? true : (stryCov_9fa48("110833", "110834", "110835"), options.beginParticipant || (async () => {}));
      this.prepareParticipant = stryMutAct_9fa48("110838") ? options.prepareParticipant && (async () => {}) : stryMutAct_9fa48("110837") ? false : stryMutAct_9fa48("110836") ? true : (stryCov_9fa48("110836", "110837", "110838"), options.prepareParticipant || (async () => {}));
      this.commitParticipant = stryMutAct_9fa48("110841") ? options.commitParticipant && (async () => {}) : stryMutAct_9fa48("110840") ? false : stryMutAct_9fa48("110839") ? true : (stryCov_9fa48("110839", "110840", "110841"), options.commitParticipant || (async () => {}));
      this.rollbackParticipant = stryMutAct_9fa48("110844") ? options.rollbackParticipant && (async () => {}) : stryMutAct_9fa48("110843") ? false : stryMutAct_9fa48("110842") ? true : (stryCov_9fa48("110842", "110843", "110844"), options.rollbackParticipant || (async () => {}));
      this.persistTransaction = stryMutAct_9fa48("110847") ? options.persistTransaction && (async () => {}) : stryMutAct_9fa48("110846") ? false : stryMutAct_9fa48("110845") ? true : (stryCov_9fa48("110845", "110846", "110847"), options.persistTransaction || (async () => {}));
      this.persistParticipant = stryMutAct_9fa48("110850") ? options.persistParticipant && (async () => {}) : stryMutAct_9fa48("110849") ? false : stryMutAct_9fa48("110848") ? true : (stryCov_9fa48("110848", "110849", "110850"), options.persistParticipant || (async () => {}));
      this.persistWriteOperation = stryMutAct_9fa48("110853") ? options.persistWriteOperation && (async () => {}) : stryMutAct_9fa48("110852") ? false : stryMutAct_9fa48("110851") ? true : (stryCov_9fa48("110851", "110852", "110853"), options.persistWriteOperation || (async () => {}));
      this.now = stryMutAct_9fa48("110856") ? options.now && (() => Date.now()) : stryMutAct_9fa48("110855") ? false : stryMutAct_9fa48("110854") ? true : (stryCov_9fa48("110854", "110855", "110856"), options.now || (stryMutAct_9fa48("110857") ? () => undefined : (stryCov_9fa48("110857"), () => Date.now())));
      this.nextEpoch = Number.isFinite(options.initialEpoch) ? Math.floor(options.initialEpoch) : this.now();
      this.epochSource = stryMutAct_9fa48("110860") ? options.epochSource && (() => {
        this.nextEpoch += 1;
        return this.nextEpoch;
      }) : stryMutAct_9fa48("110859") ? false : stryMutAct_9fa48("110858") ? true : (stryCov_9fa48("110858", "110859", "110860"), options.epochSource || (() => {
        if (stryMutAct_9fa48("110861")) {
          {}
        } else {
          stryCov_9fa48("110861");
          stryMutAct_9fa48("110862") ? this.nextEpoch -= 1 : (stryCov_9fa48("110862"), this.nextEpoch += 1);
          return this.nextEpoch;
        }
      }));
      this.transactionBudgetMs = (stryMutAct_9fa48("110865") ? Number.isFinite(options.transactionBudgetMs) || options.transactionBudgetMs > 0 : stryMutAct_9fa48("110864") ? false : stryMutAct_9fa48("110863") ? true : (stryCov_9fa48("110863", "110864", "110865"), Number.isFinite(options.transactionBudgetMs) && (stryMutAct_9fa48("110868") ? options.transactionBudgetMs <= 0 : stryMutAct_9fa48("110867") ? options.transactionBudgetMs >= 0 : stryMutAct_9fa48("110866") ? true : (stryCov_9fa48("110866", "110867", "110868"), options.transactionBudgetMs > 0)))) ? Math.floor(options.transactionBudgetMs) : TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS;
      this.participantRetryMaxRetries = (stryMutAct_9fa48("110871") ? Number.isFinite(options.participantRetryMaxRetries) || options.participantRetryMaxRetries >= 0 : stryMutAct_9fa48("110870") ? false : stryMutAct_9fa48("110869") ? true : (stryCov_9fa48("110869", "110870", "110871"), Number.isFinite(options.participantRetryMaxRetries) && (stryMutAct_9fa48("110874") ? options.participantRetryMaxRetries < 0 : stryMutAct_9fa48("110873") ? options.participantRetryMaxRetries > 0 : stryMutAct_9fa48("110872") ? true : (stryCov_9fa48("110872", "110873", "110874"), options.participantRetryMaxRetries >= 0)))) ? Math.floor(options.participantRetryMaxRetries) : PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES;
      this.participantRetryBaseDelayMs = (stryMutAct_9fa48("110877") ? Number.isFinite(options.participantRetryBaseDelayMs) || options.participantRetryBaseDelayMs > 0 : stryMutAct_9fa48("110876") ? false : stryMutAct_9fa48("110875") ? true : (stryCov_9fa48("110875", "110876", "110877"), Number.isFinite(options.participantRetryBaseDelayMs) && (stryMutAct_9fa48("110880") ? options.participantRetryBaseDelayMs <= 0 : stryMutAct_9fa48("110879") ? options.participantRetryBaseDelayMs >= 0 : stryMutAct_9fa48("110878") ? true : (stryCov_9fa48("110878", "110879", "110880"), options.participantRetryBaseDelayMs > 0)))) ? Math.floor(options.participantRetryBaseDelayMs) : PARTICIPANT_RETRY_DEFAULT.BASE_DELAY_MS;
      this.participantRetryMaxDelayMs = (stryMutAct_9fa48("110883") ? Number.isFinite(options.participantRetryMaxDelayMs) || options.participantRetryMaxDelayMs > 0 : stryMutAct_9fa48("110882") ? false : stryMutAct_9fa48("110881") ? true : (stryCov_9fa48("110881", "110882", "110883"), Number.isFinite(options.participantRetryMaxDelayMs) && (stryMutAct_9fa48("110886") ? options.participantRetryMaxDelayMs <= 0 : stryMutAct_9fa48("110885") ? options.participantRetryMaxDelayMs >= 0 : stryMutAct_9fa48("110884") ? true : (stryCov_9fa48("110884", "110885", "110886"), options.participantRetryMaxDelayMs > 0)))) ? Math.floor(options.participantRetryMaxDelayMs) : PARTICIPANT_RETRY_DEFAULT.MAX_DELAY_MS;
      this.sleep = stryMutAct_9fa48("110889") ? options.sleep && (delayMs => new Promise(resolve => setTimeout(resolve, delayMs))) : stryMutAct_9fa48("110888") ? false : stryMutAct_9fa48("110887") ? true : (stryCov_9fa48("110887", "110888", "110889"), options.sleep || (stryMutAct_9fa48("110890") ? () => undefined : (stryCov_9fa48("110890"), delayMs => new Promise(stryMutAct_9fa48("110891") ? () => undefined : (stryCov_9fa48("110891"), resolve => setTimeout(resolve, delayMs))))));
      this.onParticipantRetry = stryMutAct_9fa48("110894") ? options.onParticipantRetry && null : stryMutAct_9fa48("110893") ? false : stryMutAct_9fa48("110892") ? true : (stryCov_9fa48("110892", "110893", "110894"), options.onParticipantRetry || null);
      this.logger = stryMutAct_9fa48("110897") ? options.logger && console : stryMutAct_9fa48("110896") ? false : stryMutAct_9fa48("110895") ? true : (stryCov_9fa48("110895", "110896", "110897"), options.logger || console);
      this.loadRecoveryStateForSweep = stryMutAct_9fa48("110900") ? options.loadRecoveryStateForSweep && null : stryMutAct_9fa48("110899") ? false : stryMutAct_9fa48("110898") ? true : (stryCov_9fa48("110898", "110899", "110900"), options.loadRecoveryStateForSweep || null);
      this.recoverySweepIntervalMs = (stryMutAct_9fa48("110903") ? Number.isFinite(options.recoverySweepIntervalMs) || options.recoverySweepIntervalMs > 0 : stryMutAct_9fa48("110902") ? false : stryMutAct_9fa48("110901") ? true : (stryCov_9fa48("110901", "110902", "110903"), Number.isFinite(options.recoverySweepIntervalMs) && (stryMutAct_9fa48("110906") ? options.recoverySweepIntervalMs <= 0 : stryMutAct_9fa48("110905") ? options.recoverySweepIntervalMs >= 0 : stryMutAct_9fa48("110904") ? true : (stryCov_9fa48("110904", "110905", "110906"), options.recoverySweepIntervalMs > 0)))) ? Math.floor(options.recoverySweepIntervalMs) : RECOVERY_SWEEP_DEFAULT_INTERVAL_MS;
      this.recoverySweepTimer = null;
      this.recoverySweepInFlight = stryMutAct_9fa48("110907") ? true : (stryCov_9fa48("110907"), false);
      this.recoverySweepDeferredUntilMs = 0;
      this.recoverySweepDeferredAttempts = 0;
      this.workflowCoordinator = stryMutAct_9fa48("110910") ? options.workflowCoordinator && new DurableWorkflowCoordinator({
        persistWorkflow: async workflow => {
          await this.persistTransaction({
            transactionId: workflow.transactionId || workflow.workflowId,
            sessionId: workflow.sessionId || workflow.ownerKey,
            status: workflow.status,
            transactionEpoch: workflow.transactionEpoch,
            timeoutDeadline: workflow.timeoutDeadline,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt
          });
        },
        persistParticipant: async participant => {
          await this.persistParticipant({
            participantId: participant.participantId,
            transactionId: participant.transactionId || participant.workflowId,
            partitionId: participant.partitionId || participant.participantKey,
            status: participant.status,
            lastError: participant.lastError,
            createdAt: participant.createdAt,
            updatedAt: participant.updatedAt
          });
        },
        now: this.now
      }) : stryMutAct_9fa48("110909") ? false : stryMutAct_9fa48("110908") ? true : (stryCov_9fa48("110908", "110909", "110910"), options.workflowCoordinator || new DurableWorkflowCoordinator(stryMutAct_9fa48("110911") ? {} : (stryCov_9fa48("110911"), {
        persistWorkflow: async workflow => {
          if (stryMutAct_9fa48("110912")) {
            {}
          } else {
            stryCov_9fa48("110912");
            await this.persistTransaction(stryMutAct_9fa48("110913") ? {} : (stryCov_9fa48("110913"), {
              transactionId: stryMutAct_9fa48("110916") ? workflow.transactionId && workflow.workflowId : stryMutAct_9fa48("110915") ? false : stryMutAct_9fa48("110914") ? true : (stryCov_9fa48("110914", "110915", "110916"), workflow.transactionId || workflow.workflowId),
              sessionId: stryMutAct_9fa48("110919") ? workflow.sessionId && workflow.ownerKey : stryMutAct_9fa48("110918") ? false : stryMutAct_9fa48("110917") ? true : (stryCov_9fa48("110917", "110918", "110919"), workflow.sessionId || workflow.ownerKey),
              status: workflow.status,
              transactionEpoch: workflow.transactionEpoch,
              timeoutDeadline: workflow.timeoutDeadline,
              createdAt: workflow.createdAt,
              updatedAt: workflow.updatedAt
            }));
          }
        },
        persistParticipant: async participant => {
          if (stryMutAct_9fa48("110920")) {
            {}
          } else {
            stryCov_9fa48("110920");
            await this.persistParticipant(stryMutAct_9fa48("110921") ? {} : (stryCov_9fa48("110921"), {
              participantId: participant.participantId,
              transactionId: stryMutAct_9fa48("110924") ? participant.transactionId && participant.workflowId : stryMutAct_9fa48("110923") ? false : stryMutAct_9fa48("110922") ? true : (stryCov_9fa48("110922", "110923", "110924"), participant.transactionId || participant.workflowId),
              partitionId: stryMutAct_9fa48("110927") ? participant.partitionId && participant.participantKey : stryMutAct_9fa48("110926") ? false : stryMutAct_9fa48("110925") ? true : (stryCov_9fa48("110925", "110926", "110927"), participant.partitionId || participant.participantKey),
              status: participant.status,
              lastError: participant.lastError,
              createdAt: participant.createdAt,
              updatedAt: participant.updatedAt
            }));
          }
        },
        now: this.now
      })));
      this.transactionsBySession = this.workflowCoordinator.workflowsByOwnerKey;
      this.recoveredTransactionIds = new Set();
    }
  }

  /**
   * Begin a distributed transaction for a session.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Transaction begin result.
   */
  async begin(sessionId) {
    if (stryMutAct_9fa48("110928")) {
      {}
    } else {
      stryCov_9fa48("110928");
      if (stryMutAct_9fa48("110930") ? false : stryMutAct_9fa48("110929") ? true : (stryCov_9fa48("110929", "110930"), this.transactionsBySession.has(sessionId))) {
        if (stryMutAct_9fa48("110931")) {
          {}
        } else {
          stryCov_9fa48("110931");
          return stryMutAct_9fa48("110932") ? {} : (stryCov_9fa48("110932"), {
            success: stryMutAct_9fa48("110933") ? true : (stryCov_9fa48("110933"), false),
            error: QUERY_ERROR_MSG.TRANSACTION_ACTIVE,
            errorCode: QUERY_ERROR_CODE.TRANSACTION_ACTIVE
          });
        }
      }
      let transactionEpoch;
      try {
        if (stryMutAct_9fa48("110934")) {
          {}
        } else {
          stryCov_9fa48("110934");
          transactionEpoch = this.epochSource();
        }
      } catch (_err) {
        if (stryMutAct_9fa48("110935")) {
          {}
        } else {
          stryCov_9fa48("110935");
          return stryMutAct_9fa48("110936") ? {} : (stryCov_9fa48("110936"), {
            success: stryMutAct_9fa48("110937") ? true : (stryCov_9fa48("110937"), false),
            error: QUERY_ERROR_MSG.BEGIN_FAILED,
            errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR
          });
        }
      }
      if (stryMutAct_9fa48("110940") ? false : stryMutAct_9fa48("110939") ? true : stryMutAct_9fa48("110938") ? Number.isFinite(transactionEpoch) : (stryCov_9fa48("110938", "110939", "110940"), !Number.isFinite(transactionEpoch))) {
        if (stryMutAct_9fa48("110941")) {
          {}
        } else {
          stryCov_9fa48("110941");
          return stryMutAct_9fa48("110942") ? {} : (stryCov_9fa48("110942"), {
            success: stryMutAct_9fa48("110943") ? true : (stryCov_9fa48("110943"), false),
            error: QUERY_ERROR_MSG.BEGIN_FAILED,
            errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR
          });
        }
      }
      const timeoutBudget = createTopLevelOperationBudget(stryMutAct_9fa48("110944") ? {} : (stryCov_9fa48("110944"), {
        configuredBudgetMs: this.transactionBudgetMs,
        operationName: QUERY_OPERATION.TRANSACTION,
        now: this.now
      }));
      const now = this.now();
      const transactionId = this.createTransactionId(sessionId);
      const tx = stryMutAct_9fa48("110945") ? {} : (stryCov_9fa48("110945"), {
        sessionId,
        ownerKey: sessionId,
        transactionId,
        workflowId: transactionId,
        transactionEpoch,
        timeoutBudget,
        timeoutDeadline: timeoutBudget.deadlineMs,
        status: TRANSACTION_STATUS.ACTIVE,
        participants: new Map(),
        writeOperations: stryMutAct_9fa48("110946") ? ["Stryker was here"] : (stryCov_9fa48("110946"), []),
        createdAt: now,
        updatedAt: now
      });
      await this.workflowCoordinator.registerWorkflow(tx);
      return stryMutAct_9fa48("110947") ? {} : (stryCov_9fa48("110947"), {
        success: stryMutAct_9fa48("110948") ? false : (stryCov_9fa48("110948"), true),
        operation: QUERY_OPERATION.BEGIN_TRANSACTION,
        sessionId,
        transactionId,
        transactionEpoch
      });
    }
  }

  /**
   * Enlist partition participants and begin transaction on new participants.
   * @param {string} sessionId - Session ID.
   * @param {string[]} partitionIds - Target partition IDs.
   * @return {Promise<Object>} Enlistment result.
   */
  async enlistParticipants(sessionId, partitionIds) {
    if (stryMutAct_9fa48("110949")) {
      {}
    } else {
      stryCov_9fa48("110949");
      const tx = this.transactionsBySession.get(sessionId);
      if (stryMutAct_9fa48("110952") ? false : stryMutAct_9fa48("110951") ? true : stryMutAct_9fa48("110950") ? tx : (stryCov_9fa48("110950", "110951", "110952"), !tx)) {
        if (stryMutAct_9fa48("110953")) {
          {}
        } else {
          stryCov_9fa48("110953");
          return stryMutAct_9fa48("110954") ? {} : (stryCov_9fa48("110954"), {
            success: stryMutAct_9fa48("110955") ? true : (stryCov_9fa48("110955"), false),
            error: QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION,
            errorCode: QUERY_ERROR_CODE.NO_TRANSACTION
          });
        }
      }
      const uniquePartitionIds = Array.from(new Set(stryMutAct_9fa48("110958") ? partitionIds && [] : stryMutAct_9fa48("110957") ? false : stryMutAct_9fa48("110956") ? true : (stryCov_9fa48("110956", "110957", "110958"), partitionIds || (stryMutAct_9fa48("110959") ? ["Stryker was here"] : (stryCov_9fa48("110959"), [])))));
      const newlyEnlisted = stryMutAct_9fa48("110960") ? ["Stryker was here"] : (stryCov_9fa48("110960"), []);
      for (const partitionId of uniquePartitionIds) {
        if (stryMutAct_9fa48("110961")) {
          {}
        } else {
          stryCov_9fa48("110961");
          if (stryMutAct_9fa48("110963") ? false : stryMutAct_9fa48("110962") ? true : (stryCov_9fa48("110962", "110963"), tx.participants.has(partitionId))) {
            if (stryMutAct_9fa48("110964")) {
              {}
            } else {
              stryCov_9fa48("110964");
              continue;
            }
          }
          await this.beginParticipant(sessionId, partitionId, tx.transactionEpoch);
          const now = this.now();
          await this.workflowCoordinator.upsertParticipant(tx.workflowId, stryMutAct_9fa48("110965") ? {} : (stryCov_9fa48("110965"), {
            participantId: this.createParticipantId(tx.transactionId, partitionId),
            transactionId: tx.transactionId,
            partitionId,
            status: PARTICIPANT_STATUS.ACTIVE,
            lastError: null,
            createdAt: now,
            updatedAt: now
          }));
          newlyEnlisted.push(partitionId);
        }
      }
      tx.updatedAt = this.now();
      await this.persistTransactionRecord(tx);
      await this.persistParticipants(tx, newlyEnlisted);
      return stryMutAct_9fa48("110966") ? {} : (stryCov_9fa48("110966"), {
        success: stryMutAct_9fa48("110967") ? false : (stryCov_9fa48("110967"), true),
        participants: this.getOrderedParticipantIds(tx),
        newlyEnlisted
      });
    }
  }

  /**
   * Record distributed write operation metadata under a transaction.
   * @param {string} sessionId - Session ID.
   * @param {Object} operation - Operation metadata.
   * @return {Promise<void>}
   */
  async recordWriteOperation(sessionId, operation) {
    if (stryMutAct_9fa48("110968")) {
      {}
    } else {
      stryCov_9fa48("110968");
      const tx = this.transactionsBySession.get(sessionId);
      if (stryMutAct_9fa48("110971") ? false : stryMutAct_9fa48("110970") ? true : stryMutAct_9fa48("110969") ? tx : (stryCov_9fa48("110969", "110970", "110971"), !tx)) {
        if (stryMutAct_9fa48("110972")) {
          {}
        } else {
          stryCov_9fa48("110972");
          return;
        }
      }
      const now = this.now();
      const normalized = stryMutAct_9fa48("110973") ? {} : (stryCov_9fa48("110973"), {
        operationId: operation.operationId,
        statementType: stryMutAct_9fa48("110976") ? operation.statementType && QUERY_OPERATION.UPDATE : stryMutAct_9fa48("110975") ? false : stryMutAct_9fa48("110974") ? true : (stryCov_9fa48("110974", "110975", "110976"), operation.statementType || QUERY_OPERATION.UPDATE),
        partitionIds: Array.isArray(operation.partitionIds) ? stryMutAct_9fa48("110977") ? [] : (stryCov_9fa48("110977"), [...operation.partitionIds]) : stryMutAct_9fa48("110978") ? ["Stryker was here"] : (stryCov_9fa48("110978"), []),
        idempotencyKey: stryMutAct_9fa48("110981") ? operation.idempotencyKey && operation.operationId : stryMutAct_9fa48("110980") ? false : stryMutAct_9fa48("110979") ? true : (stryCov_9fa48("110979", "110980", "110981"), operation.idempotencyKey || operation.operationId),
        payloadHash: stryMutAct_9fa48("110984") ? operation.payloadHash && this.createWritePayloadHash(operation) : stryMutAct_9fa48("110983") ? false : stryMutAct_9fa48("110982") ? true : (stryCov_9fa48("110982", "110983", "110984"), operation.payloadHash || this.createWritePayloadHash(operation)),
        status: WRITE_OPERATION_STATUS.PENDING,
        retryCount: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now
      });
      tx.writeOperations.push(normalized);
      tx.updatedAt = now;
      await this.persistTransactionRecord(tx);
      await this.persistWriteOperationRecord(tx, normalized);
    }
  }

  /**
   * Mark one recorded write operation with execution outcome.
   * @param {string} sessionId - Session ID.
   * @param {string} operationId - Operation identifier.
   * @param {Object} result - Aggregated write result.
   * @return {Promise<void>}
   */
  async markWriteOperationResult(sessionId, operationId, result) {
    if (stryMutAct_9fa48("110985")) {
      {}
    } else {
      stryCov_9fa48("110985");
      const tx = this.transactionsBySession.get(sessionId);
      if (stryMutAct_9fa48("110988") ? false : stryMutAct_9fa48("110987") ? true : stryMutAct_9fa48("110986") ? tx : (stryCov_9fa48("110986", "110987", "110988"), !tx)) {
        if (stryMutAct_9fa48("110989")) {
          {}
        } else {
          stryCov_9fa48("110989");
          return;
        }
      }
      const operation = tx.writeOperations.find(stryMutAct_9fa48("110990") ? () => undefined : (stryCov_9fa48("110990"), entry => stryMutAct_9fa48("110993") ? entry.operationId !== operationId : stryMutAct_9fa48("110992") ? false : stryMutAct_9fa48("110991") ? true : (stryCov_9fa48("110991", "110992", "110993"), entry.operationId === operationId)));
      if (stryMutAct_9fa48("110996") ? false : stryMutAct_9fa48("110995") ? true : stryMutAct_9fa48("110994") ? operation : (stryCov_9fa48("110994", "110995", "110996"), !operation)) {
        if (stryMutAct_9fa48("110997")) {
          {}
        } else {
          stryCov_9fa48("110997");
          return;
        }
      }
      operation.status = (stryMutAct_9fa48("111000") ? result?.success !== true : stryMutAct_9fa48("110999") ? false : stryMutAct_9fa48("110998") ? true : (stryCov_9fa48("110998", "110999", "111000"), (stryMutAct_9fa48("111001") ? result.success : (stryCov_9fa48("111001"), result?.success)) === (stryMutAct_9fa48("111002") ? false : (stryCov_9fa48("111002"), true)))) ? WRITE_OPERATION_STATUS.SUCCEEDED : WRITE_OPERATION_STATUS.FAILED;
      operation.retryCount = Number.isInteger(stryMutAct_9fa48("111003") ? result.retryCount : (stryCov_9fa48("111003"), result?.retryCount)) ? result.retryCount : 0;
      operation.lastError = (stryMutAct_9fa48("111006") ? result?.success !== true : stryMutAct_9fa48("111005") ? false : stryMutAct_9fa48("111004") ? true : (stryCov_9fa48("111004", "111005", "111006"), (stryMutAct_9fa48("111007") ? result.success : (stryCov_9fa48("111007"), result?.success)) === (stryMutAct_9fa48("111008") ? false : (stryCov_9fa48("111008"), true)))) ? null : stryMutAct_9fa48("111011") ? result?.error && QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE : stryMutAct_9fa48("111010") ? false : stryMutAct_9fa48("111009") ? true : (stryCov_9fa48("111009", "111010", "111011"), (stryMutAct_9fa48("111012") ? result.error : (stryCov_9fa48("111012"), result?.error)) || QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE);
      operation.updatedAt = this.now();
      tx.updatedAt = operation.updatedAt;
      await this.persistTransactionRecord(tx);
      await this.persistWriteOperationRecord(tx, operation);
    }
  }

  /**
   * Commit a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   */
  async commit(sessionId) {
    if (stryMutAct_9fa48("111013")) {
      {}
    } else {
      stryCov_9fa48("111013");
      const tx = this.transactionsBySession.get(sessionId);
      if (stryMutAct_9fa48("111016") ? false : stryMutAct_9fa48("111015") ? true : stryMutAct_9fa48("111014") ? tx : (stryCov_9fa48("111014", "111015", "111016"), !tx)) {
        if (stryMutAct_9fa48("111017")) {
          {}
        } else {
          stryCov_9fa48("111017");
          return stryMutAct_9fa48("111018") ? {} : (stryCov_9fa48("111018"), {
            success: stryMutAct_9fa48("111019") ? true : (stryCov_9fa48("111019"), false),
            error: QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT,
            errorCode: QUERY_ERROR_CODE.NO_TRANSACTION
          });
        }
      }
      return this.runCommitProtocol(tx);
    }
  }

  /**
   * Roll back a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   */
  async rollback(sessionId) {
    if (stryMutAct_9fa48("111020")) {
      {}
    } else {
      stryCov_9fa48("111020");
      const tx = this.transactionsBySession.get(sessionId);
      if (stryMutAct_9fa48("111023") ? false : stryMutAct_9fa48("111022") ? true : stryMutAct_9fa48("111021") ? tx : (stryCov_9fa48("111021", "111022", "111023"), !tx)) {
        if (stryMutAct_9fa48("111024")) {
          {}
        } else {
          stryCov_9fa48("111024");
          return stryMutAct_9fa48("111025") ? {} : (stryCov_9fa48("111025"), {
            success: stryMutAct_9fa48("111026") ? true : (stryCov_9fa48("111026"), false),
            error: QUERY_ERROR_MSG.NO_TRANSACTION_ROLLBACK,
            errorCode: QUERY_ERROR_CODE.NO_TRANSACTION
          });
        }
      }
      return this.runRollbackProtocol(tx);
    }
  }

  /**
   * Return transaction metadata for one session.
   * @param {string} sessionId - Session ID.
   * @return {Object|null} Transaction metadata.
   */
  getTransaction(sessionId) {
    if (stryMutAct_9fa48("111027")) {
      {}
    } else {
      stryCov_9fa48("111027");
      const tx = this.transactionsBySession.get(sessionId);
      if (stryMutAct_9fa48("111030") ? false : stryMutAct_9fa48("111029") ? true : stryMutAct_9fa48("111028") ? tx : (stryCov_9fa48("111028", "111029", "111030"), !tx)) {
        if (stryMutAct_9fa48("111031")) {
          {}
        } else {
          stryCov_9fa48("111031");
          return null;
        }
      }
      return stryMutAct_9fa48("111032") ? {} : (stryCov_9fa48("111032"), {
        sessionId: tx.sessionId,
        transactionId: tx.transactionId,
        status: tx.status,
        transactionEpoch: tx.transactionEpoch,
        timeoutDeadline: tx.timeoutDeadline,
        participants: this.getOrderedParticipantIds(tx),
        participantDetails: this.getOrderedParticipantDetails(tx),
        writeOperations: tx.writeOperations.map(stryMutAct_9fa48("111033") ? () => undefined : (stryCov_9fa48("111033"), operation => stryMutAct_9fa48("111034") ? {} : (stryCov_9fa48("111034"), {
          ...operation
        }))),
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt
      });
    }
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} Active transaction state.
   */
  hasActiveTransaction(sessionId) {
    if (stryMutAct_9fa48("111035")) {
      {}
    } else {
      stryCov_9fa48("111035");
      return this.transactionsBySession.has(sessionId);
    }
  }

  /**
   * Recover in-flight transactions after restart.
   * Accepts canonical system-table row arrays.
   *
   * @param {Object[]|Object} rows - Transaction rows in
   *   canonical system-table shape.
   */
  recover(rows) {
    if (stryMutAct_9fa48("111036")) {
      {}
    } else {
      stryCov_9fa48("111036");
      if (stryMutAct_9fa48("111039") ? false : stryMutAct_9fa48("111038") ? true : stryMutAct_9fa48("111037") ? Array.isArray(rows) : (stryCov_9fa48("111037", "111038", "111039"), !Array.isArray(rows))) {
        if (stryMutAct_9fa48("111040")) {
          {}
        } else {
          stryCov_9fa48("111040");
          return;
        }
      }
      this.recoverFromSystemTables(stryMutAct_9fa48("111041") ? {} : (stryCov_9fa48("111041"), {
        transactions: rows,
        participants: rows.flatMap(row => {
          if (stryMutAct_9fa48("111042")) {
            {}
          } else {
            stryCov_9fa48("111042");
            const transactionId = stryMutAct_9fa48("111045") ? row.transaction_id && row.transactionId : stryMutAct_9fa48("111044") ? false : stryMutAct_9fa48("111043") ? true : (stryCov_9fa48("111043", "111044", "111045"), row.transaction_id || row.transactionId);
            const participants = Array.isArray(row.participants) ? row.participants : stryMutAct_9fa48("111046") ? ["Stryker was here"] : (stryCov_9fa48("111046"), []);
            return participants.map(stryMutAct_9fa48("111047") ? () => undefined : (stryCov_9fa48("111047"), partitionId => stryMutAct_9fa48("111048") ? {} : (stryCov_9fa48("111048"), {
              transaction_id: transactionId,
              partition_id: partitionId
            })));
          }
        }),
        writeOperations: rows.flatMap(row => {
          if (stryMutAct_9fa48("111049")) {
            {}
          } else {
            stryCov_9fa48("111049");
            const transactionId = stryMutAct_9fa48("111052") ? row.transaction_id && row.transactionId : stryMutAct_9fa48("111051") ? false : stryMutAct_9fa48("111050") ? true : (stryCov_9fa48("111050", "111051", "111052"), row.transaction_id || row.transactionId);
            const writeOperations = Array.isArray(row.writeOperations) ? row.writeOperations : stryMutAct_9fa48("111053") ? ["Stryker was here"] : (stryCov_9fa48("111053"), []);
            return writeOperations.map(stryMutAct_9fa48("111054") ? () => undefined : (stryCov_9fa48("111054"), operation => stryMutAct_9fa48("111055") ? {} : (stryCov_9fa48("111055"), {
              ...operation,
              transaction_id: transactionId
            })));
          }
        })
      }));
    }
  }

  /**
   * Resume all transactions recovered from system-table snapshots.
   * Transactions recovered in ACTIVE status are rolled back; transactions
   * recovered mid-commit are advanced to COMMITTED.
   *
   * @return {Promise<Object>} Replay summary.
   */
  async resumeRecoveredTransactions() {
    if (stryMutAct_9fa48("111056")) {
      {}
    } else {
      stryCov_9fa48("111056");
      const recoveredWorkflowIds = Array.from(this.recoveredTransactionIds);
      const results = stryMutAct_9fa48("111057") ? ["Stryker was here"] : (stryCov_9fa48("111057"), []);
      for (const workflowId of recoveredWorkflowIds) {
        if (stryMutAct_9fa48("111058")) {
          {}
        } else {
          stryCov_9fa48("111058");
          const tx = this.workflowCoordinator.getWorkflowById(workflowId);
          if (stryMutAct_9fa48("111061") ? false : stryMutAct_9fa48("111060") ? true : stryMutAct_9fa48("111059") ? tx : (stryCov_9fa48("111059", "111060", "111061"), !tx)) {
            if (stryMutAct_9fa48("111062")) {
              {}
            } else {
              stryCov_9fa48("111062");
              this.recoveredTransactionIds.delete(workflowId);
              continue;
            }
          }
          const statusBefore = tx.status;
          let protocolResult;
          let replayPath = null;
          let skipped = stryMutAct_9fa48("111063") ? true : (stryCov_9fa48("111063"), false);
          await this.workflowCoordinator.runExclusive(tx.ownerKey, async () => {
            if (stryMutAct_9fa48("111064")) {
              {}
            } else {
              stryCov_9fa48("111064");
              if (stryMutAct_9fa48("111066") ? false : stryMutAct_9fa48("111065") ? true : (stryCov_9fa48("111065", "111066"), TERMINAL_TRANSACTION_STATUS.has(tx.status))) {
                if (stryMutAct_9fa48("111067")) {
                  {}
                } else {
                  stryCov_9fa48("111067");
                  skipped = stryMutAct_9fa48("111068") ? false : (stryCov_9fa48("111068"), true);
                  protocolResult = stryMutAct_9fa48("111069") ? {} : (stryCov_9fa48("111069"), {
                    success: stryMutAct_9fa48("111070") ? false : (stryCov_9fa48("111070"), true),
                    operation: null,
                    transactionId: tx.transactionId,
                    participants: this.getOrderedParticipantIds(tx),
                    failedParticipants: stryMutAct_9fa48("111071") ? ["Stryker was here"] : (stryCov_9fa48("111071"), [])
                  });
                  return;
                }
              }
              if (stryMutAct_9fa48("111074") ? tx.status !== TRANSACTION_STATUS.FAILED : stryMutAct_9fa48("111073") ? false : stryMutAct_9fa48("111072") ? true : (stryCov_9fa48("111072", "111073", "111074"), tx.status === TRANSACTION_STATUS.FAILED)) {
                if (stryMutAct_9fa48("111075")) {
                  {}
                } else {
                  stryCov_9fa48("111075");
                  skipped = stryMutAct_9fa48("111076") ? false : (stryCov_9fa48("111076"), true);
                  protocolResult = stryMutAct_9fa48("111077") ? {} : (stryCov_9fa48("111077"), {
                    success: stryMutAct_9fa48("111078") ? true : (stryCov_9fa48("111078"), false),
                    operation: null,
                    transactionId: tx.transactionId,
                    participants: this.getOrderedParticipantIds(tx),
                    failedParticipants: stryMutAct_9fa48("111079") ? ["Stryker was here"] : (stryCov_9fa48("111079"), []),
                    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
                    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE
                  });
                  return;
                }
              }
              if (stryMutAct_9fa48("111081") ? false : stryMutAct_9fa48("111080") ? true : (stryCov_9fa48("111080", "111081"), RECOVERY_ROLLBACK_TRANSACTION_STATUS.has(tx.status))) {
                if (stryMutAct_9fa48("111082")) {
                  {}
                } else {
                  stryCov_9fa48("111082");
                  replayPath = QUERY_OPERATION.ROLLBACK;
                  protocolResult = await this.runRollbackProtocol(tx);
                  return;
                }
              }
              if (stryMutAct_9fa48("111084") ? false : stryMutAct_9fa48("111083") ? true : (stryCov_9fa48("111083", "111084"), RECOVERY_COMMIT_TRANSACTION_STATUS.has(tx.status))) {
                if (stryMutAct_9fa48("111085")) {
                  {}
                } else {
                  stryCov_9fa48("111085");
                  replayPath = QUERY_OPERATION.COMMIT;
                  protocolResult = await this.runCommitProtocol(tx, stryMutAct_9fa48("111086") ? {} : (stryCov_9fa48("111086"), {
                    allowTimedOutCommitStatuses: stryMutAct_9fa48("111087") ? false : (stryCov_9fa48("111087"), true)
                  }));
                  return;
                }
              }
              await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
              protocolResult = stryMutAct_9fa48("111088") ? {} : (stryCov_9fa48("111088"), {
                success: stryMutAct_9fa48("111089") ? true : (stryCov_9fa48("111089"), false),
                operation: QUERY_OPERATION.ROLLBACK,
                transactionId: tx.transactionId,
                participants: this.getOrderedParticipantIds(tx),
                failedParticipants: stryMutAct_9fa48("111090") ? ["Stryker was here"] : (stryCov_9fa48("111090"), []),
                errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
                error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE
              });
            }
          });
          results.push(stryMutAct_9fa48("111091") ? {} : (stryCov_9fa48("111091"), {
            transactionId: tx.transactionId,
            sessionId: tx.sessionId,
            statusBefore,
            statusAfter: tx.status,
            replayPath,
            skipped,
            success: stryMutAct_9fa48("111094") ? protocolResult?.success !== true : stryMutAct_9fa48("111093") ? false : stryMutAct_9fa48("111092") ? true : (stryCov_9fa48("111092", "111093", "111094"), (stryMutAct_9fa48("111095") ? protocolResult.success : (stryCov_9fa48("111095"), protocolResult?.success)) === (stryMutAct_9fa48("111096") ? false : (stryCov_9fa48("111096"), true))),
            error: stryMutAct_9fa48("111099") ? protocolResult?.error && null : stryMutAct_9fa48("111098") ? false : stryMutAct_9fa48("111097") ? true : (stryCov_9fa48("111097", "111098", "111099"), (stryMutAct_9fa48("111100") ? protocolResult.error : (stryCov_9fa48("111100"), protocolResult?.error)) || null),
            failedParticipants: stryMutAct_9fa48("111103") ? protocolResult?.failedParticipants && [] : stryMutAct_9fa48("111102") ? false : stryMutAct_9fa48("111101") ? true : (stryCov_9fa48("111101", "111102", "111103"), (stryMutAct_9fa48("111104") ? protocolResult.failedParticipants : (stryCov_9fa48("111104"), protocolResult?.failedParticipants)) || (stryMutAct_9fa48("111105") ? ["Stryker was here"] : (stryCov_9fa48("111105"), [])))
          }));
          this.recoveredTransactionIds.delete(workflowId);
        }
      }
      const resumed = stryMutAct_9fa48("111106") ? results.length : (stryCov_9fa48("111106"), results.filter(stryMutAct_9fa48("111107") ? () => undefined : (stryCov_9fa48("111107"), entry => stryMutAct_9fa48("111110") ? entry.success || !entry.skipped : stryMutAct_9fa48("111109") ? false : stryMutAct_9fa48("111108") ? true : (stryCov_9fa48("111108", "111109", "111110"), entry.success && (stryMutAct_9fa48("111111") ? entry.skipped : (stryCov_9fa48("111111"), !entry.skipped))))).length);
      const failed = stryMutAct_9fa48("111112") ? results.length : (stryCov_9fa48("111112"), results.filter(stryMutAct_9fa48("111113") ? () => undefined : (stryCov_9fa48("111113"), entry => stryMutAct_9fa48("111114") ? entry.success : (stryCov_9fa48("111114"), !entry.success))).length);
      return stryMutAct_9fa48("111115") ? {} : (stryCov_9fa48("111115"), {
        totalRecovered: recoveredWorkflowIds.length,
        resumed,
        failed,
        results
      });
    }
  }

  /**
   * Run one recovery sweep cycle for timed-out non-terminal transactions.
   * @return {Promise<Object>} Sweep summary.
   */
  async runRecoverySweep() {
    if (stryMutAct_9fa48("111116")) {
      {}
    } else {
      stryCov_9fa48("111116");
      if (stryMutAct_9fa48("111118") ? false : stryMutAct_9fa48("111117") ? true : (stryCov_9fa48("111117", "111118"), this.recoverySweepInFlight)) {
        if (stryMutAct_9fa48("111119")) {
          {}
        } else {
          stryCov_9fa48("111119");
          return stryMutAct_9fa48("111120") ? {} : (stryCov_9fa48("111120"), {
            swept: 0,
            resolved: 0,
            failed: 0,
            skipped: stryMutAct_9fa48("111121") ? false : (stryCov_9fa48("111121"), true),
            deferred: 0,
            results: stryMutAct_9fa48("111122") ? ["Stryker was here"] : (stryCov_9fa48("111122"), [])
          });
        }
      }
      if (stryMutAct_9fa48("111124") ? false : stryMutAct_9fa48("111123") ? true : (stryCov_9fa48("111123", "111124"), this.isRecoverySweepDeferred())) {
        if (stryMutAct_9fa48("111125")) {
          {}
        } else {
          stryCov_9fa48("111125");
          return stryMutAct_9fa48("111126") ? {} : (stryCov_9fa48("111126"), {
            swept: 0,
            resolved: 0,
            failed: 0,
            skipped: stryMutAct_9fa48("111127") ? true : (stryCov_9fa48("111127"), false),
            deferred: 1,
            deferredUntilMs: this.recoverySweepDeferredUntilMs,
            results: stryMutAct_9fa48("111128") ? ["Stryker was here"] : (stryCov_9fa48("111128"), [])
          });
        }
      }
      this.recoverySweepInFlight = stryMutAct_9fa48("111129") ? false : (stryCov_9fa48("111129"), true);
      try {
        if (stryMutAct_9fa48("111130")) {
          {}
        } else {
          stryCov_9fa48("111130");
          if (stryMutAct_9fa48("111133") ? typeof this.loadRecoveryStateForSweep !== 'function' : stryMutAct_9fa48("111132") ? false : stryMutAct_9fa48("111131") ? true : (stryCov_9fa48("111131", "111132", "111133"), typeof this.loadRecoveryStateForSweep === (stryMutAct_9fa48("111134") ? "" : (stryCov_9fa48("111134"), 'function')))) {
            if (stryMutAct_9fa48("111135")) {
              {}
            } else {
              stryCov_9fa48("111135");
              let payload;
              try {
                if (stryMutAct_9fa48("111136")) {
                  {}
                } else {
                  stryCov_9fa48("111136");
                  payload = await this.loadRecoveryStateForSweep();
                }
              } catch (error) {
                if (stryMutAct_9fa48("111137")) {
                  {}
                } else {
                  stryCov_9fa48("111137");
                  if (stryMutAct_9fa48("111139") ? false : stryMutAct_9fa48("111138") ? true : (stryCov_9fa48("111138", "111139"), this.shouldDeferRecoverySweepError(error))) {
                    if (stryMutAct_9fa48("111140")) {
                      {}
                    } else {
                      stryCov_9fa48("111140");
                      return this.buildDeferredRecoverySweepResult(error);
                    }
                  }
                  throw error;
                }
              }
              if (stryMutAct_9fa48("111143") ? payload || typeof payload === 'object' : stryMutAct_9fa48("111142") ? false : stryMutAct_9fa48("111141") ? true : (stryCov_9fa48("111141", "111142", "111143"), payload && (stryMutAct_9fa48("111145") ? typeof payload !== 'object' : stryMutAct_9fa48("111144") ? true : (stryCov_9fa48("111144", "111145"), typeof payload === (stryMutAct_9fa48("111146") ? "" : (stryCov_9fa48("111146"), 'object')))))) {
                if (stryMutAct_9fa48("111147")) {
                  {}
                } else {
                  stryCov_9fa48("111147");
                  this.recoverFromSystemTables(payload);
                }
              }
            }
          }
          const stuckTransactions = stryMutAct_9fa48("111148") ? Array.from(this.transactionsBySession.values()) : (stryCov_9fa48("111148"), Array.from(this.transactionsBySession.values()).filter(stryMutAct_9fa48("111149") ? () => undefined : (stryCov_9fa48("111149"), tx => stryMutAct_9fa48("111152") ? !TERMINAL_TRANSACTION_STATUS.has(tx.status) && tx.status !== TRANSACTION_STATUS.FAILED || this.isTransactionBudgetExceeded(tx) : stryMutAct_9fa48("111151") ? false : stryMutAct_9fa48("111150") ? true : (stryCov_9fa48("111150", "111151", "111152"), (stryMutAct_9fa48("111154") ? !TERMINAL_TRANSACTION_STATUS.has(tx.status) || tx.status !== TRANSACTION_STATUS.FAILED : stryMutAct_9fa48("111153") ? true : (stryCov_9fa48("111153", "111154"), (stryMutAct_9fa48("111155") ? TERMINAL_TRANSACTION_STATUS.has(tx.status) : (stryCov_9fa48("111155"), !TERMINAL_TRANSACTION_STATUS.has(tx.status))) && (stryMutAct_9fa48("111157") ? tx.status === TRANSACTION_STATUS.FAILED : stryMutAct_9fa48("111156") ? true : (stryCov_9fa48("111156", "111157"), tx.status !== TRANSACTION_STATUS.FAILED)))) && this.isTransactionBudgetExceeded(tx)))));
          const results = stryMutAct_9fa48("111158") ? ["Stryker was here"] : (stryCov_9fa48("111158"), []);
          let deferred = 0;
          for (const tx of stuckTransactions) {
            if (stryMutAct_9fa48("111159")) {
              {}
            } else {
              stryCov_9fa48("111159");
              let protocolResult = null;
              let sweepPath = null;
              try {
                if (stryMutAct_9fa48("111160")) {
                  {}
                } else {
                  stryCov_9fa48("111160");
                  await this.workflowCoordinator.runExclusive(tx.ownerKey, async () => {
                    if (stryMutAct_9fa48("111161")) {
                      {}
                    } else {
                      stryCov_9fa48("111161");
                      if (stryMutAct_9fa48("111163") ? false : stryMutAct_9fa48("111162") ? true : (stryCov_9fa48("111162", "111163"), RECOVERY_COMMIT_TRANSACTION_STATUS.has(tx.status))) {
                        if (stryMutAct_9fa48("111164")) {
                          {}
                        } else {
                          stryCov_9fa48("111164");
                          sweepPath = QUERY_OPERATION.COMMIT;
                          protocolResult = await this.runCommitProtocol(tx, stryMutAct_9fa48("111165") ? {} : (stryCov_9fa48("111165"), {
                            allowTimedOutCommitStatuses: stryMutAct_9fa48("111166") ? false : (stryCov_9fa48("111166"), true)
                          }));
                          return;
                        }
                      }
                      sweepPath = QUERY_OPERATION.ROLLBACK;
                      protocolResult = await this.runRollbackProtocol(tx);
                    }
                  });
                }
              } catch (error) {
                if (stryMutAct_9fa48("111167")) {
                  {}
                } else {
                  stryCov_9fa48("111167");
                  if (stryMutAct_9fa48("111169") ? false : stryMutAct_9fa48("111168") ? true : (stryCov_9fa48("111168", "111169"), this.shouldDeferRecoverySweepError(error))) {
                    if (stryMutAct_9fa48("111170")) {
                      {}
                    } else {
                      stryCov_9fa48("111170");
                      stryMutAct_9fa48("111171") ? deferred -= 1 : (stryCov_9fa48("111171"), deferred += 1);
                      const deferredResult = this.buildDeferredRecoverySweepResult(error, stryMutAct_9fa48("111172") ? {} : (stryCov_9fa48("111172"), {
                        swept: stuckTransactions.length,
                        results: stryMutAct_9fa48("111173") ? [] : (stryCov_9fa48("111173"), [stryMutAct_9fa48("111174") ? {} : (stryCov_9fa48("111174"), {
                          transactionId: tx.transactionId,
                          sessionId: tx.sessionId,
                          sweepPath,
                          statusAfter: tx.status,
                          success: stryMutAct_9fa48("111175") ? true : (stryCov_9fa48("111175"), false),
                          deferred: stryMutAct_9fa48("111176") ? false : (stryCov_9fa48("111176"), true),
                          error: stryMutAct_9fa48("111179") ? error?.message && String(error) : stryMutAct_9fa48("111178") ? false : stryMutAct_9fa48("111177") ? true : (stryCov_9fa48("111177", "111178", "111179"), (stryMutAct_9fa48("111180") ? error.message : (stryCov_9fa48("111180"), error?.message)) || String(error))
                        })])
                      }));
                      results.push(...deferredResult.results);
                      continue;
                    }
                  }
                  throw error;
                }
              }
              if (stryMutAct_9fa48("111183") ? protocolResult?.success !== true || this.shouldDeferRecoverySweepError(protocolResult) : stryMutAct_9fa48("111182") ? false : stryMutAct_9fa48("111181") ? true : (stryCov_9fa48("111181", "111182", "111183"), (stryMutAct_9fa48("111185") ? protocolResult?.success === true : stryMutAct_9fa48("111184") ? true : (stryCov_9fa48("111184", "111185"), (stryMutAct_9fa48("111186") ? protocolResult.success : (stryCov_9fa48("111186"), protocolResult?.success)) !== (stryMutAct_9fa48("111187") ? false : (stryCov_9fa48("111187"), true)))) && this.shouldDeferRecoverySweepError(protocolResult))) {
                if (stryMutAct_9fa48("111188")) {
                  {}
                } else {
                  stryCov_9fa48("111188");
                  stryMutAct_9fa48("111189") ? deferred -= 1 : (stryCov_9fa48("111189"), deferred += 1);
                  this.deferRecoverySweep(protocolResult);
                  results.push(stryMutAct_9fa48("111190") ? {} : (stryCov_9fa48("111190"), {
                    transactionId: tx.transactionId,
                    sessionId: tx.sessionId,
                    sweepPath,
                    statusAfter: tx.status,
                    success: stryMutAct_9fa48("111191") ? true : (stryCov_9fa48("111191"), false),
                    deferred: stryMutAct_9fa48("111192") ? false : (stryCov_9fa48("111192"), true),
                    error: stryMutAct_9fa48("111195") ? protocolResult?.error && null : stryMutAct_9fa48("111194") ? false : stryMutAct_9fa48("111193") ? true : (stryCov_9fa48("111193", "111194", "111195"), (stryMutAct_9fa48("111196") ? protocolResult.error : (stryCov_9fa48("111196"), protocolResult?.error)) || null)
                  }));
                  continue;
                }
              }
              results.push(stryMutAct_9fa48("111197") ? {} : (stryCov_9fa48("111197"), {
                transactionId: tx.transactionId,
                sessionId: tx.sessionId,
                sweepPath,
                statusAfter: tx.status,
                success: stryMutAct_9fa48("111200") ? protocolResult?.success !== true : stryMutAct_9fa48("111199") ? false : stryMutAct_9fa48("111198") ? true : (stryCov_9fa48("111198", "111199", "111200"), (stryMutAct_9fa48("111201") ? protocolResult.success : (stryCov_9fa48("111201"), protocolResult?.success)) === (stryMutAct_9fa48("111202") ? false : (stryCov_9fa48("111202"), true))),
                error: stryMutAct_9fa48("111205") ? protocolResult?.error && null : stryMutAct_9fa48("111204") ? false : stryMutAct_9fa48("111203") ? true : (stryCov_9fa48("111203", "111204", "111205"), (stryMutAct_9fa48("111206") ? protocolResult.error : (stryCov_9fa48("111206"), protocolResult?.error)) || null)
              }));
            }
          }
          const resolved = stryMutAct_9fa48("111207") ? results.length : (stryCov_9fa48("111207"), results.filter(stryMutAct_9fa48("111208") ? () => undefined : (stryCov_9fa48("111208"), entry => entry.success)).length);
          const failed = stryMutAct_9fa48("111209") ? results.length : (stryCov_9fa48("111209"), results.filter(stryMutAct_9fa48("111210") ? () => undefined : (stryCov_9fa48("111210"), entry => stryMutAct_9fa48("111213") ? entry.success !== true || entry.deferred !== true : stryMutAct_9fa48("111212") ? false : stryMutAct_9fa48("111211") ? true : (stryCov_9fa48("111211", "111212", "111213"), (stryMutAct_9fa48("111215") ? entry.success === true : stryMutAct_9fa48("111214") ? true : (stryCov_9fa48("111214", "111215"), entry.success !== (stryMutAct_9fa48("111216") ? false : (stryCov_9fa48("111216"), true)))) && (stryMutAct_9fa48("111218") ? entry.deferred === true : stryMutAct_9fa48("111217") ? true : (stryCov_9fa48("111217", "111218"), entry.deferred !== (stryMutAct_9fa48("111219") ? false : (stryCov_9fa48("111219"), true))))))).length);
          if (stryMutAct_9fa48("111222") ? deferred !== 0 : stryMutAct_9fa48("111221") ? false : stryMutAct_9fa48("111220") ? true : (stryCov_9fa48("111220", "111221", "111222"), deferred === 0)) {
            if (stryMutAct_9fa48("111223")) {
              {}
            } else {
              stryCov_9fa48("111223");
              this.clearRecoverySweepDeferState();
            }
          }
          return stryMutAct_9fa48("111224") ? {} : (stryCov_9fa48("111224"), {
            swept: stuckTransactions.length,
            resolved,
            failed,
            deferred,
            deferredUntilMs: (stryMutAct_9fa48("111228") ? deferred <= 0 : stryMutAct_9fa48("111227") ? deferred >= 0 : stryMutAct_9fa48("111226") ? false : stryMutAct_9fa48("111225") ? true : (stryCov_9fa48("111225", "111226", "111227", "111228"), deferred > 0)) ? this.recoverySweepDeferredUntilMs : 0,
            skipped: stryMutAct_9fa48("111229") ? true : (stryCov_9fa48("111229"), false),
            results
          });
        }
      } finally {
        if (stryMutAct_9fa48("111230")) {
          {}
        } else {
          stryCov_9fa48("111230");
          this.recoverySweepInFlight = stryMutAct_9fa48("111231") ? true : (stryCov_9fa48("111231"), false);
        }
      }
    }
  }

  /**
   * Start periodic transaction recovery sweep.
   */
  startRecoverySweep() {
    if (stryMutAct_9fa48("111232")) {
      {}
    } else {
      stryCov_9fa48("111232");
      if (stryMutAct_9fa48("111234") ? false : stryMutAct_9fa48("111233") ? true : (stryCov_9fa48("111233", "111234"), this.recoverySweepTimer)) {
        if (stryMutAct_9fa48("111235")) {
          {}
        } else {
          stryCov_9fa48("111235");
          return;
        }
      }
      this.recoverySweepTimer = setInterval(() => {
        if (stryMutAct_9fa48("111236")) {
          {}
        } else {
          stryCov_9fa48("111236");
          void this.runRecoverySweep().catch(error => {
            if (stryMutAct_9fa48("111237")) {
              {}
            } else {
              stryCov_9fa48("111237");
              stryMutAct_9fa48("111239") ? this.logger.error?.(RECOVERY_SWEEP_LOG_MSG, {
                error: error?.message || String(error)
              }) : stryMutAct_9fa48("111238") ? this.logger?.error(RECOVERY_SWEEP_LOG_MSG, {
                error: error?.message || String(error)
              }) : (stryCov_9fa48("111238", "111239"), this.logger?.error?.(RECOVERY_SWEEP_LOG_MSG, stryMutAct_9fa48("111240") ? {} : (stryCov_9fa48("111240"), {
                error: stryMutAct_9fa48("111243") ? error?.message && String(error) : stryMutAct_9fa48("111242") ? false : stryMutAct_9fa48("111241") ? true : (stryCov_9fa48("111241", "111242", "111243"), (stryMutAct_9fa48("111244") ? error.message : (stryCov_9fa48("111244"), error?.message)) || String(error))
              })));
            }
          });
        }
      }, this.recoverySweepIntervalMs);
      this.recoverySweepTimer.unref();
    }
  }

  /**
   * Stop periodic transaction recovery sweep.
   */
  stopRecoverySweep() {
    if (stryMutAct_9fa48("111245")) {
      {}
    } else {
      stryCov_9fa48("111245");
      if (stryMutAct_9fa48("111248") ? false : stryMutAct_9fa48("111247") ? true : stryMutAct_9fa48("111246") ? this.recoverySweepTimer : (stryCov_9fa48("111246", "111247", "111248"), !this.recoverySweepTimer)) {
        if (stryMutAct_9fa48("111249")) {
          {}
        } else {
          stryCov_9fa48("111249");
          return;
        }
      }
      clearInterval(this.recoverySweepTimer);
      this.recoverySweepTimer = null;
    }
  }

  /**
   * @return {boolean}
   * @private
   */
  isRecoverySweepDeferred() {
    if (stryMutAct_9fa48("111250")) {
      {}
    } else {
      stryCov_9fa48("111250");
      return stryMutAct_9fa48("111253") ? Number.isFinite(this.recoverySweepDeferredUntilMs) || this.recoverySweepDeferredUntilMs > this.now() : stryMutAct_9fa48("111252") ? false : stryMutAct_9fa48("111251") ? true : (stryCov_9fa48("111251", "111252", "111253"), Number.isFinite(this.recoverySweepDeferredUntilMs) && (stryMutAct_9fa48("111256") ? this.recoverySweepDeferredUntilMs <= this.now() : stryMutAct_9fa48("111255") ? this.recoverySweepDeferredUntilMs >= this.now() : stryMutAct_9fa48("111254") ? true : (stryCov_9fa48("111254", "111255", "111256"), this.recoverySweepDeferredUntilMs > this.now())));
    }
  }

  /**
   * @param {*} errorLike
   * @return {boolean}
   * @private
   */
  shouldDeferRecoverySweepError(errorLike) {
    if (stryMutAct_9fa48("111257")) {
      {}
    } else {
      stryCov_9fa48("111257");
      return isRetryableControlPlaneError(errorLike);
    }
  }

  /**
   * @param {*} errorLike
   * @return {{delayMs: number, deferredUntilMs: number}}
   * @private
   */
  deferRecoverySweep(errorLike) {
    if (stryMutAct_9fa48("111258")) {
      {}
    } else {
      stryCov_9fa48("111258");
      const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
      const backoffMs = (stryMutAct_9fa48("111262") ? retryAfterMs <= 0 : stryMutAct_9fa48("111261") ? retryAfterMs >= 0 : stryMutAct_9fa48("111260") ? false : stryMutAct_9fa48("111259") ? true : (stryCov_9fa48("111259", "111260", "111261", "111262"), retryAfterMs > 0)) ? retryAfterMs : stryMutAct_9fa48("111263") ? Math.max(RECOVERY_SWEEP_DEFER_MAX_MS, Math.max(this.recoverySweepIntervalMs, RECOVERY_SWEEP_DEFER_BASE_MS * 2 ** this.recoverySweepDeferredAttempts)) : (stryCov_9fa48("111263"), Math.min(RECOVERY_SWEEP_DEFER_MAX_MS, stryMutAct_9fa48("111264") ? Math.min(this.recoverySweepIntervalMs, RECOVERY_SWEEP_DEFER_BASE_MS * 2 ** this.recoverySweepDeferredAttempts) : (stryCov_9fa48("111264"), Math.max(this.recoverySweepIntervalMs, stryMutAct_9fa48("111265") ? RECOVERY_SWEEP_DEFER_BASE_MS / 2 ** this.recoverySweepDeferredAttempts : (stryCov_9fa48("111265"), RECOVERY_SWEEP_DEFER_BASE_MS * 2 ** this.recoverySweepDeferredAttempts)))));
      stryMutAct_9fa48("111266") ? this.recoverySweepDeferredAttempts -= 1 : (stryCov_9fa48("111266"), this.recoverySweepDeferredAttempts += 1);
      this.recoverySweepDeferredUntilMs = stryMutAct_9fa48("111267") ? this.now() - backoffMs : (stryCov_9fa48("111267"), this.now() + backoffMs);
      return stryMutAct_9fa48("111268") ? {} : (stryCov_9fa48("111268"), {
        delayMs: backoffMs,
        deferredUntilMs: this.recoverySweepDeferredUntilMs
      });
    }
  }

  /**
   * @return {void}
   * @private
   */
  clearRecoverySweepDeferState() {
    if (stryMutAct_9fa48("111269")) {
      {}
    } else {
      stryCov_9fa48("111269");
      this.recoverySweepDeferredUntilMs = 0;
      this.recoverySweepDeferredAttempts = 0;
    }
  }

  /**
   * @param {*} errorLike
   * @param {Object} [overrides={}]
   * @return {Object}
   * @private
   */
  buildDeferredRecoverySweepResult(errorLike, overrides = {}) {
    if (stryMutAct_9fa48("111270")) {
      {}
    } else {
      stryCov_9fa48("111270");
      this.deferRecoverySweep(errorLike);
      return stryMutAct_9fa48("111271") ? {} : (stryCov_9fa48("111271"), {
        swept: stryMutAct_9fa48("111274") ? overrides.swept && 0 : stryMutAct_9fa48("111273") ? false : stryMutAct_9fa48("111272") ? true : (stryCov_9fa48("111272", "111273", "111274"), overrides.swept || 0),
        resolved: 0,
        failed: 0,
        skipped: stryMutAct_9fa48("111275") ? true : (stryCov_9fa48("111275"), false),
        deferred: Number.isFinite(overrides.deferred) ? overrides.deferred : 1,
        deferredUntilMs: this.recoverySweepDeferredUntilMs,
        error: stryMutAct_9fa48("111278") ? errorLike?.message && String(errorLike) : stryMutAct_9fa48("111277") ? false : stryMutAct_9fa48("111276") ? true : (stryCov_9fa48("111276", "111277", "111278"), (stryMutAct_9fa48("111279") ? errorLike.message : (stryCov_9fa48("111279"), errorLike?.message)) || String(errorLike)),
        results: Array.isArray(overrides.results) ? overrides.results : stryMutAct_9fa48("111280") ? ["Stryker was here"] : (stryCov_9fa48("111280"), [])
      });
    }
  }

  /**
   * Recover coordinator state from canonical system-table rows.
   *
   * @param {Object} payload - Recovery payload.
   * @param {Object[]} [payload.transactions] - sql_transactions rows.
   * @param {Object[]} [payload.participants] - sql_transaction_participants rows.
   * @param {Object[]} [payload.writeOperations] - sql_write_operations rows.
   */
  recoverFromSystemTables(payload = {}) {
    if (stryMutAct_9fa48("111281")) {
      {}
    } else {
      stryCov_9fa48("111281");
      const transactionRows = Array.isArray(payload.transactions) ? payload.transactions : stryMutAct_9fa48("111282") ? ["Stryker was here"] : (stryCov_9fa48("111282"), []);
      const participantRows = Array.isArray(payload.participants) ? payload.participants : stryMutAct_9fa48("111283") ? ["Stryker was here"] : (stryCov_9fa48("111283"), []);
      const writeOperationRows = Array.isArray(payload.writeOperations) ? payload.writeOperations : stryMutAct_9fa48("111284") ? ["Stryker was here"] : (stryCov_9fa48("111284"), []);
      this.workflowCoordinator.recover(stryMutAct_9fa48("111285") ? {} : (stryCov_9fa48("111285"), {
        workflows: transactionRows,
        participants: participantRows,
        loadWorkflow: row => {
          if (stryMutAct_9fa48("111286")) {
            {}
          } else {
            stryCov_9fa48("111286");
            const sessionId = stryMutAct_9fa48("111289") ? row.session_id && row.sessionId : stryMutAct_9fa48("111288") ? false : stryMutAct_9fa48("111287") ? true : (stryCov_9fa48("111287", "111288", "111289"), row.session_id || row.sessionId);
            const transactionId = stryMutAct_9fa48("111292") ? row.transaction_id && row.transactionId : stryMutAct_9fa48("111291") ? false : stryMutAct_9fa48("111290") ? true : (stryCov_9fa48("111290", "111291", "111292"), row.transaction_id || row.transactionId);
            const status = stryMutAct_9fa48("111295") ? row.status && TRANSACTION_STATUS.FAILED : stryMutAct_9fa48("111294") ? false : stryMutAct_9fa48("111293") ? true : (stryCov_9fa48("111293", "111294", "111295"), row.status || TRANSACTION_STATUS.FAILED);
            if (stryMutAct_9fa48("111298") ? !sessionId && !transactionId : stryMutAct_9fa48("111297") ? false : stryMutAct_9fa48("111296") ? true : (stryCov_9fa48("111296", "111297", "111298"), (stryMutAct_9fa48("111299") ? sessionId : (stryCov_9fa48("111299"), !sessionId)) || (stryMutAct_9fa48("111300") ? transactionId : (stryCov_9fa48("111300"), !transactionId)))) {
              if (stryMutAct_9fa48("111301")) {
                {}
              } else {
                stryCov_9fa48("111301");
                return null;
              }
            }
            return stryMutAct_9fa48("111302") ? {} : (stryCov_9fa48("111302"), {
              sessionId,
              ownerKey: sessionId,
              transactionId,
              workflowId: transactionId,
              status,
              transactionEpoch: this.resolveFiniteNumberField(row, stryMutAct_9fa48("111303") ? "" : (stryCov_9fa48("111303"), 'transaction_epoch'), stryMutAct_9fa48("111304") ? "" : (stryCov_9fa48("111304"), 'transactionEpoch')),
              timeoutDeadline: this.resolveFiniteNumberField(row, stryMutAct_9fa48("111305") ? "" : (stryCov_9fa48("111305"), 'timeout_deadline'), stryMutAct_9fa48("111306") ? "" : (stryCov_9fa48("111306"), 'timeoutDeadline')),
              writeOperations: stryMutAct_9fa48("111307") ? ["Stryker was here"] : (stryCov_9fa48("111307"), []),
              createdAt: stryMutAct_9fa48("111310") ? (row.created_at || row.createdAt) && this.now() : stryMutAct_9fa48("111309") ? false : stryMutAct_9fa48("111308") ? true : (stryCov_9fa48("111308", "111309", "111310"), (stryMutAct_9fa48("111312") ? row.created_at && row.createdAt : stryMutAct_9fa48("111311") ? false : (stryCov_9fa48("111311", "111312"), row.created_at || row.createdAt)) || this.now()),
              updatedAt: stryMutAct_9fa48("111315") ? (row.updated_at || row.updatedAt) && this.now() : stryMutAct_9fa48("111314") ? false : stryMutAct_9fa48("111313") ? true : (stryCov_9fa48("111313", "111314", "111315"), (stryMutAct_9fa48("111317") ? row.updated_at && row.updatedAt : stryMutAct_9fa48("111316") ? false : (stryCov_9fa48("111316", "111317"), row.updated_at || row.updatedAt)) || this.now())
            });
          }
        },
        loadParticipant: row => {
          if (stryMutAct_9fa48("111318")) {
            {}
          } else {
            stryCov_9fa48("111318");
            const transactionId = stryMutAct_9fa48("111321") ? row.transaction_id && row.transactionId : stryMutAct_9fa48("111320") ? false : stryMutAct_9fa48("111319") ? true : (stryCov_9fa48("111319", "111320", "111321"), row.transaction_id || row.transactionId);
            const partitionId = stryMutAct_9fa48("111324") ? row.partition_id && row.partitionId : stryMutAct_9fa48("111323") ? false : stryMutAct_9fa48("111322") ? true : (stryCov_9fa48("111322", "111323", "111324"), row.partition_id || row.partitionId);
            if (stryMutAct_9fa48("111327") ? !transactionId && !partitionId : stryMutAct_9fa48("111326") ? false : stryMutAct_9fa48("111325") ? true : (stryCov_9fa48("111325", "111326", "111327"), (stryMutAct_9fa48("111328") ? transactionId : (stryCov_9fa48("111328"), !transactionId)) || (stryMutAct_9fa48("111329") ? partitionId : (stryCov_9fa48("111329"), !partitionId)))) {
              if (stryMutAct_9fa48("111330")) {
                {}
              } else {
                stryCov_9fa48("111330");
                return null;
              }
            }
            return stryMutAct_9fa48("111331") ? {} : (stryCov_9fa48("111331"), {
              workflowId: transactionId,
              transactionId,
              participantId: stryMutAct_9fa48("111334") ? (row.participant_id || row.participantId) && this.createParticipantId(transactionId, partitionId) : stryMutAct_9fa48("111333") ? false : stryMutAct_9fa48("111332") ? true : (stryCov_9fa48("111332", "111333", "111334"), (stryMutAct_9fa48("111336") ? row.participant_id && row.participantId : stryMutAct_9fa48("111335") ? false : (stryCov_9fa48("111335", "111336"), row.participant_id || row.participantId)) || this.createParticipantId(transactionId, partitionId)),
              participantKey: partitionId,
              partitionId,
              status: stryMutAct_9fa48("111339") ? row.status && PARTICIPANT_STATUS.FAILED : stryMutAct_9fa48("111338") ? false : stryMutAct_9fa48("111337") ? true : (stryCov_9fa48("111337", "111338", "111339"), row.status || PARTICIPANT_STATUS.FAILED),
              lastError: stryMutAct_9fa48("111342") ? (row.last_error || row.lastError) && null : stryMutAct_9fa48("111341") ? false : stryMutAct_9fa48("111340") ? true : (stryCov_9fa48("111340", "111341", "111342"), (stryMutAct_9fa48("111344") ? row.last_error && row.lastError : stryMutAct_9fa48("111343") ? false : (stryCov_9fa48("111343", "111344"), row.last_error || row.lastError)) || null),
              createdAt: stryMutAct_9fa48("111347") ? (row.created_at || row.createdAt) && this.now() : stryMutAct_9fa48("111346") ? false : stryMutAct_9fa48("111345") ? true : (stryCov_9fa48("111345", "111346", "111347"), (stryMutAct_9fa48("111349") ? row.created_at && row.createdAt : stryMutAct_9fa48("111348") ? false : (stryCov_9fa48("111348", "111349"), row.created_at || row.createdAt)) || this.now()),
              updatedAt: stryMutAct_9fa48("111352") ? (row.updated_at || row.updatedAt) && this.now() : stryMutAct_9fa48("111351") ? false : stryMutAct_9fa48("111350") ? true : (stryCov_9fa48("111350", "111351", "111352"), (stryMutAct_9fa48("111354") ? row.updated_at && row.updatedAt : stryMutAct_9fa48("111353") ? false : (stryCov_9fa48("111353", "111354"), row.updated_at || row.updatedAt)) || this.now())
            });
          }
        },
        isTerminalWorkflow: stryMutAct_9fa48("111355") ? () => undefined : (stryCov_9fa48("111355"), workflow => TERMINAL_TRANSACTION_STATUS.has(workflow.status))
      }));
      for (const row of transactionRows) {
        if (stryMutAct_9fa48("111356")) {
          {}
        } else {
          stryCov_9fa48("111356");
          const transactionId = stryMutAct_9fa48("111359") ? row.transaction_id && row.transactionId : stryMutAct_9fa48("111358") ? false : stryMutAct_9fa48("111357") ? true : (stryCov_9fa48("111357", "111358", "111359"), row.transaction_id || row.transactionId);
          if (stryMutAct_9fa48("111362") ? false : stryMutAct_9fa48("111361") ? true : stryMutAct_9fa48("111360") ? transactionId : (stryCov_9fa48("111360", "111361", "111362"), !transactionId)) {
            if (stryMutAct_9fa48("111363")) {
              {}
            } else {
              stryCov_9fa48("111363");
              continue;
            }
          }
          const tx = this.workflowCoordinator.getWorkflowById(transactionId);
          if (stryMutAct_9fa48("111366") ? false : stryMutAct_9fa48("111365") ? true : stryMutAct_9fa48("111364") ? tx : (stryCov_9fa48("111364", "111365", "111366"), !tx)) {
            if (stryMutAct_9fa48("111367")) {
              {}
            } else {
              stryCov_9fa48("111367");
              continue;
            }
          }
          this.recoveredTransactionIds.add(transactionId);
        }
      }
      for (const row of writeOperationRows) {
        if (stryMutAct_9fa48("111368")) {
          {}
        } else {
          stryCov_9fa48("111368");
          const transactionId = stryMutAct_9fa48("111371") ? row.transaction_id && row.transactionId : stryMutAct_9fa48("111370") ? false : stryMutAct_9fa48("111369") ? true : (stryCov_9fa48("111369", "111370", "111371"), row.transaction_id || row.transactionId);
          if (stryMutAct_9fa48("111374") ? false : stryMutAct_9fa48("111373") ? true : stryMutAct_9fa48("111372") ? transactionId : (stryCov_9fa48("111372", "111373", "111374"), !transactionId)) {
            if (stryMutAct_9fa48("111375")) {
              {}
            } else {
              stryCov_9fa48("111375");
              continue;
            }
          }
          const tx = this.workflowCoordinator.getWorkflowById(transactionId);
          if (stryMutAct_9fa48("111378") ? false : stryMutAct_9fa48("111377") ? true : stryMutAct_9fa48("111376") ? tx : (stryCov_9fa48("111376", "111377", "111378"), !tx)) {
            if (stryMutAct_9fa48("111379")) {
              {}
            } else {
              stryCov_9fa48("111379");
              continue;
            }
          }
          tx.writeOperations.push(stryMutAct_9fa48("111380") ? {} : (stryCov_9fa48("111380"), {
            operationId: stryMutAct_9fa48("111383") ? row.operation_id && row.operationId : stryMutAct_9fa48("111382") ? false : stryMutAct_9fa48("111381") ? true : (stryCov_9fa48("111381", "111382", "111383"), row.operation_id || row.operationId),
            statementType: stryMutAct_9fa48("111386") ? row.statement_type && row.statementType : stryMutAct_9fa48("111385") ? false : stryMutAct_9fa48("111384") ? true : (stryCov_9fa48("111384", "111385", "111386"), row.statement_type || row.statementType),
            partitionIds: this.parseJsonArrayField(stryMutAct_9fa48("111389") ? row.partition_ids && row.partitionIds : stryMutAct_9fa48("111388") ? false : stryMutAct_9fa48("111387") ? true : (stryCov_9fa48("111387", "111388", "111389"), row.partition_ids || row.partitionIds)),
            idempotencyKey: stryMutAct_9fa48("111392") ? row.idempotency_key && row.idempotencyKey : stryMutAct_9fa48("111391") ? false : stryMutAct_9fa48("111390") ? true : (stryCov_9fa48("111390", "111391", "111392"), row.idempotency_key || row.idempotencyKey),
            payloadHash: stryMutAct_9fa48("111395") ? row.payload_hash && row.payloadHash : stryMutAct_9fa48("111394") ? false : stryMutAct_9fa48("111393") ? true : (stryCov_9fa48("111393", "111394", "111395"), row.payload_hash || row.payloadHash),
            status: stryMutAct_9fa48("111398") ? row.status && WRITE_OPERATION_STATUS.PENDING : stryMutAct_9fa48("111397") ? false : stryMutAct_9fa48("111396") ? true : (stryCov_9fa48("111396", "111397", "111398"), row.status || WRITE_OPERATION_STATUS.PENDING),
            retryCount: stryMutAct_9fa48("111401") ? (row.retry_count || row.retryCount) && 0 : stryMutAct_9fa48("111400") ? false : stryMutAct_9fa48("111399") ? true : (stryCov_9fa48("111399", "111400", "111401"), (stryMutAct_9fa48("111403") ? row.retry_count && row.retryCount : stryMutAct_9fa48("111402") ? false : (stryCov_9fa48("111402", "111403"), row.retry_count || row.retryCount)) || 0),
            lastError: stryMutAct_9fa48("111406") ? (row.last_error || row.lastError) && null : stryMutAct_9fa48("111405") ? false : stryMutAct_9fa48("111404") ? true : (stryCov_9fa48("111404", "111405", "111406"), (stryMutAct_9fa48("111408") ? row.last_error && row.lastError : stryMutAct_9fa48("111407") ? false : (stryCov_9fa48("111407", "111408"), row.last_error || row.lastError)) || null),
            createdAt: stryMutAct_9fa48("111411") ? (row.created_at || row.createdAt) && tx.createdAt : stryMutAct_9fa48("111410") ? false : stryMutAct_9fa48("111409") ? true : (stryCov_9fa48("111409", "111410", "111411"), (stryMutAct_9fa48("111413") ? row.created_at && row.createdAt : stryMutAct_9fa48("111412") ? false : (stryCov_9fa48("111412", "111413"), row.created_at || row.createdAt)) || tx.createdAt),
            updatedAt: stryMutAct_9fa48("111416") ? (row.updated_at || row.updatedAt) && tx.updatedAt : stryMutAct_9fa48("111415") ? false : stryMutAct_9fa48("111414") ? true : (stryCov_9fa48("111414", "111415", "111416"), (stryMutAct_9fa48("111418") ? row.updated_at && row.updatedAt : stryMutAct_9fa48("111417") ? false : (stryCov_9fa48("111417", "111418"), row.updated_at || row.updatedAt)) || tx.updatedAt)
          }));
        }
      }
    }
  }

  /**
   * Persist one transaction status transition.
   * @param {Object} tx - Transaction state.
   * @param {string} status - Next status.
   * @return {Promise<void>}
   * @private
   */
  async setTransactionStatus(tx, status) {
    if (stryMutAct_9fa48("111419")) {
      {}
    } else {
      stryCov_9fa48("111419");
      tx.status = status;
      tx.updatedAt = this.now();
      await this.persistTransactionRecord(tx);
    }
  }

  /**
   * Resolve remaining timeout budget for one transaction.
   * @param {Object} tx - Transaction state.
   * @return {number} Remaining budget in milliseconds.
   * @private
   */
  getRemainingTransactionBudgetMs(tx) {
    if (stryMutAct_9fa48("111420")) {
      {}
    } else {
      stryCov_9fa48("111420");
      if (stryMutAct_9fa48("111423") ? tx?.timeoutBudget || Number.isFinite(tx.timeoutBudget.deadlineMs) : stryMutAct_9fa48("111422") ? false : stryMutAct_9fa48("111421") ? true : (stryCov_9fa48("111421", "111422", "111423"), (stryMutAct_9fa48("111424") ? tx.timeoutBudget : (stryCov_9fa48("111424"), tx?.timeoutBudget)) && Number.isFinite(tx.timeoutBudget.deadlineMs))) {
        if (stryMutAct_9fa48("111425")) {
          {}
        } else {
          stryCov_9fa48("111425");
          return getRemainingBudgetMs(tx.timeoutBudget, stryMutAct_9fa48("111426") ? {} : (stryCov_9fa48("111426"), {
            now: this.now
          }));
        }
      }
      if (stryMutAct_9fa48("111428") ? false : stryMutAct_9fa48("111427") ? true : (stryCov_9fa48("111427", "111428"), Number.isFinite(stryMutAct_9fa48("111429") ? tx.timeoutDeadline : (stryCov_9fa48("111429"), tx?.timeoutDeadline)))) {
        if (stryMutAct_9fa48("111430")) {
          {}
        } else {
          stryCov_9fa48("111430");
          return stryMutAct_9fa48("111431") ? Math.min(0, tx.timeoutDeadline - this.now()) : (stryCov_9fa48("111431"), Math.max(0, stryMutAct_9fa48("111432") ? tx.timeoutDeadline + this.now() : (stryCov_9fa48("111432"), tx.timeoutDeadline - this.now())));
        }
      }
      return Number.POSITIVE_INFINITY;
    }
  }

  /**
   * Determine whether one transaction exceeded its timeout budget.
   * @param {Object} tx - Transaction state.
   * @return {boolean} True when timeout budget is exhausted.
   * @private
   */
  isTransactionBudgetExceeded(tx) {
    if (stryMutAct_9fa48("111433")) {
      {}
    } else {
      stryCov_9fa48("111433");
      return stryMutAct_9fa48("111437") ? this.getRemainingTransactionBudgetMs(tx) > 0 : stryMutAct_9fa48("111436") ? this.getRemainingTransactionBudgetMs(tx) < 0 : stryMutAct_9fa48("111435") ? false : stryMutAct_9fa48("111434") ? true : (stryCov_9fa48("111434", "111435", "111436", "111437"), this.getRemainingTransactionBudgetMs(tx) <= 0);
    }
  }

  /**
   * Check whether participant failures include a timeout condition.
   * @param {Object[]} failedParticipants - Failed participants.
   * @return {boolean} True when at least one failure is timeout-related.
   * @private
   */
  hasTimeoutFailure(failedParticipants) {
    if (stryMutAct_9fa48("111438")) {
      {}
    } else {
      stryCov_9fa48("111438");
      return stryMutAct_9fa48("111439") ? failedParticipants.every(entry => TIMEOUT_ERROR_MESSAGES.has(entry.error)) : (stryCov_9fa48("111439"), failedParticipants.some(stryMutAct_9fa48("111440") ? () => undefined : (stryCov_9fa48("111440"), entry => TIMEOUT_ERROR_MESSAGES.has(entry.error))));
    }
  }

  /**
   * Abort one transaction due to timeout budget exhaustion.
   * @param {Object} tx - Transaction state.
   * @param {string} stage - Protocol stage where timeout happened.
   * @return {Promise<Object>} Timeout failure payload.
   * @private
   */
  async abortTimedOutTransaction(tx, stage) {
    if (stryMutAct_9fa48("111441")) {
      {}
    } else {
      stryCov_9fa48("111441");
      if (stryMutAct_9fa48("111444") ? tx.status === TRANSACTION_STATUS.ROLLING_BACK : stryMutAct_9fa48("111443") ? false : stryMutAct_9fa48("111442") ? true : (stryCov_9fa48("111442", "111443", "111444"), tx.status !== TRANSACTION_STATUS.ROLLING_BACK)) {
        if (stryMutAct_9fa48("111445")) {
          {}
        } else {
          stryCov_9fa48("111445");
          await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
        }
      }
      const rollbackResult = await this.runRollbackProtocol(tx);
      return stryMutAct_9fa48("111446") ? {} : (stryCov_9fa48("111446"), {
        success: stryMutAct_9fa48("111447") ? true : (stryCov_9fa48("111447"), false),
        operation: QUERY_OPERATION.COMMIT,
        transactionId: tx.transactionId,
        participants: this.getOrderedParticipantIds(tx),
        failedParticipants: stryMutAct_9fa48("111448") ? ["Stryker was here"] : (stryCov_9fa48("111448"), []),
        rollbackFailedParticipants: stryMutAct_9fa48("111451") ? rollbackResult.failedParticipants && [] : stryMutAct_9fa48("111450") ? false : stryMutAct_9fa48("111449") ? true : (stryCov_9fa48("111449", "111450", "111451"), rollbackResult.failedParticipants || (stryMutAct_9fa48("111452") ? ["Stryker was here"] : (stryCov_9fa48("111452"), []))),
        stage,
        errorCode: QUERY_ERROR_CODE.TIMEOUT,
        error: QUERY_ERROR_MSG.QUERY_TIMEOUT
      });
    }
  }

  /**
   * Drive one transaction through the commit protocol.
   * Supports replay from PREPARING/PREPARED/COMMITTING statuses.
   *
   * @param {Object} tx - Transaction state.
   * @param {Object} [options] - Commit options.
   * @param {boolean} [options.allowTimedOutCommitStatuses] - Allow commit
   *   continuation for PREPARED/COMMITTING transactions after timeout.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async runCommitProtocol(tx, options = {}) {
    if (stryMutAct_9fa48("111453")) {
      {}
    } else {
      stryCov_9fa48("111453");
      const commitStatusAllowsTimeout = stryMutAct_9fa48("111456") ? options.allowTimedOutCommitStatuses === true || tx.status === TRANSACTION_STATUS.PREPARED || tx.status === TRANSACTION_STATUS.COMMITTING : stryMutAct_9fa48("111455") ? false : stryMutAct_9fa48("111454") ? true : (stryCov_9fa48("111454", "111455", "111456"), (stryMutAct_9fa48("111458") ? options.allowTimedOutCommitStatuses !== true : stryMutAct_9fa48("111457") ? true : (stryCov_9fa48("111457", "111458"), options.allowTimedOutCommitStatuses === (stryMutAct_9fa48("111459") ? false : (stryCov_9fa48("111459"), true)))) && (stryMutAct_9fa48("111461") ? tx.status === TRANSACTION_STATUS.PREPARED && tx.status === TRANSACTION_STATUS.COMMITTING : stryMutAct_9fa48("111460") ? true : (stryCov_9fa48("111460", "111461"), (stryMutAct_9fa48("111463") ? tx.status !== TRANSACTION_STATUS.PREPARED : stryMutAct_9fa48("111462") ? false : (stryCov_9fa48("111462", "111463"), tx.status === TRANSACTION_STATUS.PREPARED)) || (stryMutAct_9fa48("111465") ? tx.status !== TRANSACTION_STATUS.COMMITTING : stryMutAct_9fa48("111464") ? false : (stryCov_9fa48("111464", "111465"), tx.status === TRANSACTION_STATUS.COMMITTING)))));
      if (stryMutAct_9fa48("111468") ? !commitStatusAllowsTimeout || this.isTransactionBudgetExceeded(tx) : stryMutAct_9fa48("111467") ? false : stryMutAct_9fa48("111466") ? true : (stryCov_9fa48("111466", "111467", "111468"), (stryMutAct_9fa48("111469") ? commitStatusAllowsTimeout : (stryCov_9fa48("111469"), !commitStatusAllowsTimeout)) && this.isTransactionBudgetExceeded(tx))) {
        if (stryMutAct_9fa48("111470")) {
          {}
        } else {
          stryCov_9fa48("111470");
          return this.abortTimedOutTransaction(tx, tx.status);
        }
      }
      if (stryMutAct_9fa48("111473") ? tx.status === TRANSACTION_STATUS.ACTIVE && tx.status === TRANSACTION_STATUS.FAILED : stryMutAct_9fa48("111472") ? false : stryMutAct_9fa48("111471") ? true : (stryCov_9fa48("111471", "111472", "111473"), (stryMutAct_9fa48("111475") ? tx.status !== TRANSACTION_STATUS.ACTIVE : stryMutAct_9fa48("111474") ? false : (stryCov_9fa48("111474", "111475"), tx.status === TRANSACTION_STATUS.ACTIVE)) || (stryMutAct_9fa48("111477") ? tx.status !== TRANSACTION_STATUS.FAILED : stryMutAct_9fa48("111476") ? false : (stryCov_9fa48("111476", "111477"), tx.status === TRANSACTION_STATUS.FAILED)))) {
        if (stryMutAct_9fa48("111478")) {
          {}
        } else {
          stryCov_9fa48("111478");
          await this.setTransactionStatus(tx, TRANSACTION_STATUS.PREPARING);
        }
      }
      if (stryMutAct_9fa48("111481") ? tx.status !== TRANSACTION_STATUS.PREPARING : stryMutAct_9fa48("111480") ? false : stryMutAct_9fa48("111479") ? true : (stryCov_9fa48("111479", "111480", "111481"), tx.status === TRANSACTION_STATUS.PREPARING)) {
        if (stryMutAct_9fa48("111482")) {
          {}
        } else {
          stryCov_9fa48("111482");
          if (stryMutAct_9fa48("111485") ? !commitStatusAllowsTimeout || this.isTransactionBudgetExceeded(tx) : stryMutAct_9fa48("111484") ? false : stryMutAct_9fa48("111483") ? true : (stryCov_9fa48("111483", "111484", "111485"), (stryMutAct_9fa48("111486") ? commitStatusAllowsTimeout : (stryCov_9fa48("111486"), !commitStatusAllowsTimeout)) && this.isTransactionBudgetExceeded(tx))) {
            if (stryMutAct_9fa48("111487")) {
              {}
            } else {
              stryCov_9fa48("111487");
              return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.PREPARING);
            }
          }
          const prepareFailures = await this.executeParticipantStage(tx, PARTICIPANT_STATUS.PREPARING, PARTICIPANT_STATUS.PREPARED, stryMutAct_9fa48("111488") ? () => undefined : (stryCov_9fa48("111488"), partitionId => this.prepareParticipant(tx.sessionId, partitionId)), stryMutAct_9fa48("111489") ? {} : (stryCov_9fa48("111489"), {
            participantKeys: this.getPrepareParticipantKeys(tx)
          }));
          if (stryMutAct_9fa48("111493") ? prepareFailures.length <= 0 : stryMutAct_9fa48("111492") ? prepareFailures.length >= 0 : stryMutAct_9fa48("111491") ? false : stryMutAct_9fa48("111490") ? true : (stryCov_9fa48("111490", "111491", "111492", "111493"), prepareFailures.length > 0)) {
            if (stryMutAct_9fa48("111494")) {
              {}
            } else {
              stryCov_9fa48("111494");
              if (stryMutAct_9fa48("111496") ? false : stryMutAct_9fa48("111495") ? true : (stryCov_9fa48("111495", "111496"), this.hasTimeoutFailure(prepareFailures))) {
                if (stryMutAct_9fa48("111497")) {
                  {}
                } else {
                  stryCov_9fa48("111497");
                  return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.PREPARING);
                }
              }
              await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
              const rollbackResult = await this.runRollbackProtocol(tx);
              return stryMutAct_9fa48("111498") ? {} : (stryCov_9fa48("111498"), {
                success: stryMutAct_9fa48("111499") ? true : (stryCov_9fa48("111499"), false),
                operation: QUERY_OPERATION.COMMIT,
                transactionId: tx.transactionId,
                participants: this.getOrderedParticipantIds(tx),
                failedParticipants: prepareFailures,
                rollbackFailedParticipants: stryMutAct_9fa48("111502") ? rollbackResult.failedParticipants && [] : stryMutAct_9fa48("111501") ? false : stryMutAct_9fa48("111500") ? true : (stryCov_9fa48("111500", "111501", "111502"), rollbackResult.failedParticipants || (stryMutAct_9fa48("111503") ? ["Stryker was here"] : (stryCov_9fa48("111503"), []))),
                stage: TRANSACTION_STATUS.PREPARING,
                errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
                error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE
              });
            }
          }
          if (stryMutAct_9fa48("111506") ? !commitStatusAllowsTimeout || this.isTransactionBudgetExceeded(tx) : stryMutAct_9fa48("111505") ? false : stryMutAct_9fa48("111504") ? true : (stryCov_9fa48("111504", "111505", "111506"), (stryMutAct_9fa48("111507") ? commitStatusAllowsTimeout : (stryCov_9fa48("111507"), !commitStatusAllowsTimeout)) && this.isTransactionBudgetExceeded(tx))) {
            if (stryMutAct_9fa48("111508")) {
              {}
            } else {
              stryCov_9fa48("111508");
              return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.PREPARING);
            }
          }
          await this.setTransactionStatus(tx, TRANSACTION_STATUS.PREPARED);
        }
      }
      if (stryMutAct_9fa48("111511") ? tx.status !== TRANSACTION_STATUS.PREPARED : stryMutAct_9fa48("111510") ? false : stryMutAct_9fa48("111509") ? true : (stryCov_9fa48("111509", "111510", "111511"), tx.status === TRANSACTION_STATUS.PREPARED)) {
        if (stryMutAct_9fa48("111512")) {
          {}
        } else {
          stryCov_9fa48("111512");
          if (stryMutAct_9fa48("111515") ? !commitStatusAllowsTimeout || this.isTransactionBudgetExceeded(tx) : stryMutAct_9fa48("111514") ? false : stryMutAct_9fa48("111513") ? true : (stryCov_9fa48("111513", "111514", "111515"), (stryMutAct_9fa48("111516") ? commitStatusAllowsTimeout : (stryCov_9fa48("111516"), !commitStatusAllowsTimeout)) && this.isTransactionBudgetExceeded(tx))) {
            if (stryMutAct_9fa48("111517")) {
              {}
            } else {
              stryCov_9fa48("111517");
              return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.PREPARED);
            }
          }
          await this.setTransactionStatus(tx, TRANSACTION_STATUS.COMMITTING);
        }
      }
      if (stryMutAct_9fa48("111520") ? tx.status === TRANSACTION_STATUS.COMMITTING : stryMutAct_9fa48("111519") ? false : stryMutAct_9fa48("111518") ? true : (stryCov_9fa48("111518", "111519", "111520"), tx.status !== TRANSACTION_STATUS.COMMITTING)) {
        if (stryMutAct_9fa48("111521")) {
          {}
        } else {
          stryCov_9fa48("111521");
          return this.buildParticipantFailureResult(tx, QUERY_OPERATION.COMMIT, tx.status, stryMutAct_9fa48("111522") ? ["Stryker was here"] : (stryCov_9fa48("111522"), []));
        }
      }
      if (stryMutAct_9fa48("111525") ? !commitStatusAllowsTimeout || this.isTransactionBudgetExceeded(tx) : stryMutAct_9fa48("111524") ? false : stryMutAct_9fa48("111523") ? true : (stryCov_9fa48("111523", "111524", "111525"), (stryMutAct_9fa48("111526") ? commitStatusAllowsTimeout : (stryCov_9fa48("111526"), !commitStatusAllowsTimeout)) && this.isTransactionBudgetExceeded(tx))) {
        if (stryMutAct_9fa48("111527")) {
          {}
        } else {
          stryCov_9fa48("111527");
          return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.COMMITTING);
        }
      }
      const commitFailures = await this.executeParticipantStage(tx, PARTICIPANT_STATUS.COMMITTING, PARTICIPANT_STATUS.COMMITTED, stryMutAct_9fa48("111528") ? () => undefined : (stryCov_9fa48("111528"), partitionId => this.commitParticipant(tx.sessionId, partitionId)), stryMutAct_9fa48("111529") ? {} : (stryCov_9fa48("111529"), {
        participantKeys: this.getCommitParticipantKeys(tx),
        skipBudgetEnforcement: commitStatusAllowsTimeout
      }));
      if (stryMutAct_9fa48("111533") ? commitFailures.length <= 0 : stryMutAct_9fa48("111532") ? commitFailures.length >= 0 : stryMutAct_9fa48("111531") ? false : stryMutAct_9fa48("111530") ? true : (stryCov_9fa48("111530", "111531", "111532", "111533"), commitFailures.length > 0)) {
        if (stryMutAct_9fa48("111534")) {
          {}
        } else {
          stryCov_9fa48("111534");
          if (stryMutAct_9fa48("111537") ? !commitStatusAllowsTimeout || this.hasTimeoutFailure(commitFailures) : stryMutAct_9fa48("111536") ? false : stryMutAct_9fa48("111535") ? true : (stryCov_9fa48("111535", "111536", "111537"), (stryMutAct_9fa48("111538") ? commitStatusAllowsTimeout : (stryCov_9fa48("111538"), !commitStatusAllowsTimeout)) && this.hasTimeoutFailure(commitFailures))) {
            if (stryMutAct_9fa48("111539")) {
              {}
            } else {
              stryCov_9fa48("111539");
              return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.COMMITTING);
            }
          }
          await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
          return this.buildParticipantFailureResult(tx, QUERY_OPERATION.COMMIT, TRANSACTION_STATUS.COMMITTING, commitFailures);
        }
      }
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.COMMITTED);
      this.transactionsBySession.delete(tx.sessionId);
      return stryMutAct_9fa48("111540") ? {} : (stryCov_9fa48("111540"), {
        success: stryMutAct_9fa48("111541") ? false : (stryCov_9fa48("111541"), true),
        operation: QUERY_OPERATION.COMMIT,
        transactionId: tx.transactionId,
        participants: this.getOrderedParticipantIds(tx)
      });
    }
  }

  /**
   * Drive one transaction through rollback.
   * Supports replay from ACTIVE/ROLLING_BACK statuses.
   *
   * @param {Object} tx - Transaction state.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async runRollbackProtocol(tx) {
    if (stryMutAct_9fa48("111542")) {
      {}
    } else {
      stryCov_9fa48("111542");
      if (stryMutAct_9fa48("111545") ? tx.status === TRANSACTION_STATUS.ROLLING_BACK : stryMutAct_9fa48("111544") ? false : stryMutAct_9fa48("111543") ? true : (stryCov_9fa48("111543", "111544", "111545"), tx.status !== TRANSACTION_STATUS.ROLLING_BACK)) {
        if (stryMutAct_9fa48("111546")) {
          {}
        } else {
          stryCov_9fa48("111546");
          await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
        }
      }
      const rollbackFailures = await this.executeParticipantStage(tx, PARTICIPANT_STATUS.ROLLING_BACK, PARTICIPANT_STATUS.ROLLED_BACK, stryMutAct_9fa48("111547") ? () => undefined : (stryCov_9fa48("111547"), partitionId => this.rollbackParticipant(tx.sessionId, partitionId)), stryMutAct_9fa48("111548") ? {} : (stryCov_9fa48("111548"), {
        participantKeys: this.getRollbackParticipantKeys(tx)
      }));
      if (stryMutAct_9fa48("111552") ? rollbackFailures.length <= 0 : stryMutAct_9fa48("111551") ? rollbackFailures.length >= 0 : stryMutAct_9fa48("111550") ? false : stryMutAct_9fa48("111549") ? true : (stryCov_9fa48("111549", "111550", "111551", "111552"), rollbackFailures.length > 0)) {
        if (stryMutAct_9fa48("111553")) {
          {}
        } else {
          stryCov_9fa48("111553");
          await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
        }
      } else {
        if (stryMutAct_9fa48("111554")) {
          {}
        } else {
          stryCov_9fa48("111554");
          await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLED_BACK);
          this.transactionsBySession.delete(tx.sessionId);
        }
      }
      return stryMutAct_9fa48("111555") ? {} : (stryCov_9fa48("111555"), {
        success: stryMutAct_9fa48("111558") ? rollbackFailures.length !== 0 : stryMutAct_9fa48("111557") ? false : stryMutAct_9fa48("111556") ? true : (stryCov_9fa48("111556", "111557", "111558"), rollbackFailures.length === 0),
        operation: QUERY_OPERATION.ROLLBACK,
        transactionId: tx.transactionId,
        participants: this.getOrderedParticipantIds(tx),
        failedParticipants: rollbackFailures,
        errorCode: (stryMutAct_9fa48("111562") ? rollbackFailures.length <= 0 : stryMutAct_9fa48("111561") ? rollbackFailures.length >= 0 : stryMutAct_9fa48("111560") ? false : stryMutAct_9fa48("111559") ? true : (stryCov_9fa48("111559", "111560", "111561", "111562"), rollbackFailures.length > 0)) ? QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE : undefined,
        error: (stryMutAct_9fa48("111566") ? rollbackFailures.length <= 0 : stryMutAct_9fa48("111565") ? rollbackFailures.length >= 0 : stryMutAct_9fa48("111564") ? false : stryMutAct_9fa48("111563") ? true : (stryCov_9fa48("111563", "111564", "111565", "111566"), rollbackFailures.length > 0)) ? QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE : undefined
      });
    }
  }

  /**
   * Build a consistent participant-failure result payload.
   *
   * @param {Object} tx - Transaction state.
   * @param {string} operation - Operation type.
   * @param {string} stage - Current stage.
   * @param {Object[]} failedParticipants - Failed participant entries.
   * @return {Object} Failure payload.
   * @private
   */
  buildParticipantFailureResult(tx, operation, stage, failedParticipants) {
    if (stryMutAct_9fa48("111567")) {
      {}
    } else {
      stryCov_9fa48("111567");
      return stryMutAct_9fa48("111568") ? {} : (stryCov_9fa48("111568"), {
        success: stryMutAct_9fa48("111569") ? true : (stryCov_9fa48("111569"), false),
        operation,
        transactionId: tx.transactionId,
        participants: this.getOrderedParticipantIds(tx),
        failedParticipants,
        stage,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE
      });
    }
  }

  /**
   * Resolve prepare-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getPrepareParticipantKeys(tx) {
    if (stryMutAct_9fa48("111570")) {
      {}
    } else {
      stryCov_9fa48("111570");
      return stryMutAct_9fa48("111572") ? Array.from(tx.participants.values()).map(participant => participant.partitionId).sort() : stryMutAct_9fa48("111571") ? Array.from(tx.participants.values()).filter(participant => participant.status !== PARTICIPANT_STATUS.PREPARED && participant.status !== PARTICIPANT_STATUS.COMMITTED).map(participant => participant.partitionId) : (stryCov_9fa48("111571", "111572"), Array.from(tx.participants.values()).filter(stryMutAct_9fa48("111573") ? () => undefined : (stryCov_9fa48("111573"), participant => stryMutAct_9fa48("111576") ? participant.status !== PARTICIPANT_STATUS.PREPARED || participant.status !== PARTICIPANT_STATUS.COMMITTED : stryMutAct_9fa48("111575") ? false : stryMutAct_9fa48("111574") ? true : (stryCov_9fa48("111574", "111575", "111576"), (stryMutAct_9fa48("111578") ? participant.status === PARTICIPANT_STATUS.PREPARED : stryMutAct_9fa48("111577") ? true : (stryCov_9fa48("111577", "111578"), participant.status !== PARTICIPANT_STATUS.PREPARED)) && (stryMutAct_9fa48("111580") ? participant.status === PARTICIPANT_STATUS.COMMITTED : stryMutAct_9fa48("111579") ? true : (stryCov_9fa48("111579", "111580"), participant.status !== PARTICIPANT_STATUS.COMMITTED))))).map(stryMutAct_9fa48("111581") ? () => undefined : (stryCov_9fa48("111581"), participant => participant.partitionId)).sort());
    }
  }

  /**
   * Resolve commit-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getCommitParticipantKeys(tx) {
    if (stryMutAct_9fa48("111582")) {
      {}
    } else {
      stryCov_9fa48("111582");
      return stryMutAct_9fa48("111584") ? Array.from(tx.participants.values()).map(participant => participant.partitionId).sort() : stryMutAct_9fa48("111583") ? Array.from(tx.participants.values()).filter(participant => participant.status !== PARTICIPANT_STATUS.COMMITTED).map(participant => participant.partitionId) : (stryCov_9fa48("111583", "111584"), Array.from(tx.participants.values()).filter(stryMutAct_9fa48("111585") ? () => undefined : (stryCov_9fa48("111585"), participant => stryMutAct_9fa48("111588") ? participant.status === PARTICIPANT_STATUS.COMMITTED : stryMutAct_9fa48("111587") ? false : stryMutAct_9fa48("111586") ? true : (stryCov_9fa48("111586", "111587", "111588"), participant.status !== PARTICIPANT_STATUS.COMMITTED))).map(stryMutAct_9fa48("111589") ? () => undefined : (stryCov_9fa48("111589"), participant => participant.partitionId)).sort());
    }
  }

  /**
   * Resolve rollback-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getRollbackParticipantKeys(tx) {
    if (stryMutAct_9fa48("111590")) {
      {}
    } else {
      stryCov_9fa48("111590");
      return stryMutAct_9fa48("111592") ? Array.from(tx.participants.values()).map(participant => participant.partitionId).sort() : stryMutAct_9fa48("111591") ? Array.from(tx.participants.values()).filter(participant => participant.status !== PARTICIPANT_STATUS.ROLLED_BACK).map(participant => participant.partitionId) : (stryCov_9fa48("111591", "111592"), Array.from(tx.participants.values()).filter(stryMutAct_9fa48("111593") ? () => undefined : (stryCov_9fa48("111593"), participant => stryMutAct_9fa48("111596") ? participant.status === PARTICIPANT_STATUS.ROLLED_BACK : stryMutAct_9fa48("111595") ? false : stryMutAct_9fa48("111594") ? true : (stryCov_9fa48("111594", "111595", "111596"), participant.status !== PARTICIPANT_STATUS.ROLLED_BACK))).map(stryMutAct_9fa48("111597") ? () => undefined : (stryCov_9fa48("111597"), participant => participant.partitionId)).sort());
    }
  }

  /**
   * Execute one participant stage and persist participant state updates.
   *
   * @param {Object} tx - Transaction state object.
   * @param {string} transientStatus - Status while stage is running.
   * @param {string} successStatus - Status on success.
   * @param {Function} operation - Async participant operation callback.
   * @param {Object} [options] - Stage options.
   * @param {string[]} [options.participantKeys] - Participant keys.
   * @param {boolean} [options.skipBudgetEnforcement] - Skip budget timeout
   *   checks during participant operation retries.
   * @return {Promise<Object[]>} Failed participant entries.
   * @private
   */
  async executeParticipantStage(tx, transientStatus, successStatus, operation, options = {}) {
    if (stryMutAct_9fa48("111598")) {
      {}
    } else {
      stryCov_9fa48("111598");
      const stageOptions = stryMutAct_9fa48("111599") ? {} : (stryCov_9fa48("111599"), {
        failureStatus: PARTICIPANT_STATUS.FAILED
      });
      if (stryMutAct_9fa48("111601") ? false : stryMutAct_9fa48("111600") ? true : (stryCov_9fa48("111600", "111601"), Array.isArray(options.participantKeys))) {
        if (stryMutAct_9fa48("111602")) {
          {}
        } else {
          stryCov_9fa48("111602");
          stageOptions.participantKeys = options.participantKeys;
        }
      }
      const failedParticipants = await this.workflowCoordinator.executeParticipantStage(tx.workflowId, transientStatus, successStatus, stryMutAct_9fa48("111603") ? () => undefined : (stryCov_9fa48("111603"), partitionId => this.executeParticipantOperationWithRetry(tx, transientStatus, partitionId, operation, stryMutAct_9fa48("111604") ? {} : (stryCov_9fa48("111604"), {
        skipBudgetEnforcement: stryMutAct_9fa48("111607") ? options.skipBudgetEnforcement !== true : stryMutAct_9fa48("111606") ? false : stryMutAct_9fa48("111605") ? true : (stryCov_9fa48("111605", "111606", "111607"), options.skipBudgetEnforcement === (stryMutAct_9fa48("111608") ? false : (stryCov_9fa48("111608"), true)))
      }))), stageOptions);
      return failedParticipants.map(stryMutAct_9fa48("111609") ? () => undefined : (stryCov_9fa48("111609"), entry => stryMutAct_9fa48("111610") ? {} : (stryCov_9fa48("111610"), {
        partitionId: entry.participantKey,
        error: entry.error
      })));
    }
  }

  /**
   * Execute one participant operation with bounded exponential retry.
   *
   * @param {Object} tx - Transaction state.
   * @param {string} stage - Participant stage.
   * @param {string} partitionId - Participant partition ID.
   * @param {Function} operation - Participant callback.
   * @param {Object} [options] - Retry options.
   * @param {boolean} [options.skipBudgetEnforcement] - Skip budget timeout
   *   checks before attempts and retries.
   * @return {Promise<void>}
   * @private
   */
  async executeParticipantOperationWithRetry(tx, stage, partitionId, operation, options = {}) {
    if (stryMutAct_9fa48("111611")) {
      {}
    } else {
      stryCov_9fa48("111611");
      let attempt = 0;
      const skipBudgetEnforcement = stryMutAct_9fa48("111614") ? options.skipBudgetEnforcement !== true : stryMutAct_9fa48("111613") ? false : stryMutAct_9fa48("111612") ? true : (stryCov_9fa48("111612", "111613", "111614"), options.skipBudgetEnforcement === (stryMutAct_9fa48("111615") ? false : (stryCov_9fa48("111615"), true)));
      while (stryMutAct_9fa48("111617") ? false : stryMutAct_9fa48("111616") ? false : (stryCov_9fa48("111616", "111617"), true)) {
        if (stryMutAct_9fa48("111618")) {
          {}
        } else {
          stryCov_9fa48("111618");
          if (stryMutAct_9fa48("111621") ? !skipBudgetEnforcement && stage !== PARTICIPANT_STATUS.ROLLING_BACK || this.isTransactionBudgetExceeded(tx) : stryMutAct_9fa48("111620") ? false : stryMutAct_9fa48("111619") ? true : (stryCov_9fa48("111619", "111620", "111621"), (stryMutAct_9fa48("111623") ? !skipBudgetEnforcement || stage !== PARTICIPANT_STATUS.ROLLING_BACK : stryMutAct_9fa48("111622") ? true : (stryCov_9fa48("111622", "111623"), (stryMutAct_9fa48("111624") ? skipBudgetEnforcement : (stryCov_9fa48("111624"), !skipBudgetEnforcement)) && (stryMutAct_9fa48("111626") ? stage === PARTICIPANT_STATUS.ROLLING_BACK : stryMutAct_9fa48("111625") ? true : (stryCov_9fa48("111625", "111626"), stage !== PARTICIPANT_STATUS.ROLLING_BACK)))) && this.isTransactionBudgetExceeded(tx))) {
            if (stryMutAct_9fa48("111627")) {
              {}
            } else {
              stryCov_9fa48("111627");
              throw this.createTransactionTimeoutError();
            }
          }
          try {
            if (stryMutAct_9fa48("111628")) {
              {}
            } else {
              stryCov_9fa48("111628");
              await operation(partitionId);
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("111629")) {
              {}
            } else {
              stryCov_9fa48("111629");
              if (stryMutAct_9fa48("111631") ? false : stryMutAct_9fa48("111630") ? true : (stryCov_9fa48("111630", "111631"), this.shouldTreatParticipantCommitMissAsSuccess(stage, error))) {
                if (stryMutAct_9fa48("111632")) {
                  {}
                } else {
                  stryCov_9fa48("111632");
                  return;
                }
              }
              if (stryMutAct_9fa48("111636") ? attempt < this.participantRetryMaxRetries : stryMutAct_9fa48("111635") ? attempt > this.participantRetryMaxRetries : stryMutAct_9fa48("111634") ? false : stryMutAct_9fa48("111633") ? true : (stryCov_9fa48("111633", "111634", "111635", "111636"), attempt >= this.participantRetryMaxRetries)) {
                if (stryMutAct_9fa48("111637")) {
                  {}
                } else {
                  stryCov_9fa48("111637");
                  throw error;
                }
              }
              stryMutAct_9fa48("111638") ? attempt -= 1 : (stryCov_9fa48("111638"), attempt += 1);
              const retryDelayMs = this.calculateParticipantRetryDelay(attempt);
              this.emitParticipantRetryDiagnostic(stryMutAct_9fa48("111639") ? {} : (stryCov_9fa48("111639"), {
                transactionId: tx.transactionId,
                sessionId: tx.sessionId,
                partitionId,
                stage,
                duringRecovery: this.recoveredTransactionIds.has(tx.workflowId),
                attempt,
                retryDelayMs,
                error: error.message
              }));
              if (stryMutAct_9fa48("111642") ? !skipBudgetEnforcement && stage !== PARTICIPANT_STATUS.ROLLING_BACK || this.isTransactionBudgetExceeded(tx) : stryMutAct_9fa48("111641") ? false : stryMutAct_9fa48("111640") ? true : (stryCov_9fa48("111640", "111641", "111642"), (stryMutAct_9fa48("111644") ? !skipBudgetEnforcement || stage !== PARTICIPANT_STATUS.ROLLING_BACK : stryMutAct_9fa48("111643") ? true : (stryCov_9fa48("111643", "111644"), (stryMutAct_9fa48("111645") ? skipBudgetEnforcement : (stryCov_9fa48("111645"), !skipBudgetEnforcement)) && (stryMutAct_9fa48("111647") ? stage === PARTICIPANT_STATUS.ROLLING_BACK : stryMutAct_9fa48("111646") ? true : (stryCov_9fa48("111646", "111647"), stage !== PARTICIPANT_STATUS.ROLLING_BACK)))) && this.isTransactionBudgetExceeded(tx))) {
                if (stryMutAct_9fa48("111648")) {
                  {}
                } else {
                  stryCov_9fa48("111648");
                  throw this.createTransactionTimeoutError();
                }
              }
              await this.sleep(retryDelayMs);
            }
          }
        }
      }
    }
  }

  /**
   * Build one timeout error for participant-stage execution.
   * @return {Error} Timeout error.
   * @private
   */
  createTransactionTimeoutError() {
    if (stryMutAct_9fa48("111649")) {
      {}
    } else {
      stryCov_9fa48("111649");
      const timeoutError = new Error(QUERY_ERROR_MSG.QUERY_TIMEOUT);
      timeoutError.errorCode = QUERY_ERROR_CODE.TIMEOUT;
      return timeoutError;
    }
  }

  /**
   * Treat replayed participant commits that already cleared local transaction
   * state as idempotent success so recovery can converge after ambiguous ACK
   * loss or duplicate commit delivery.
   * @param {string} stage
   * @param {Error|Object} error
   * @return {boolean}
   * @private
   */
  shouldTreatParticipantCommitMissAsSuccess(stage, error) {
    if (stryMutAct_9fa48("111650")) {
      {}
    } else {
      stryCov_9fa48("111650");
      if (stryMutAct_9fa48("111653") ? stage === PARTICIPANT_STATUS.COMMITTING : stryMutAct_9fa48("111652") ? false : stryMutAct_9fa48("111651") ? true : (stryCov_9fa48("111651", "111652", "111653"), stage !== PARTICIPANT_STATUS.COMMITTING)) {
        if (stryMutAct_9fa48("111654")) {
          {}
        } else {
          stryCov_9fa48("111654");
          return stryMutAct_9fa48("111655") ? true : (stryCov_9fa48("111655"), false);
        }
      }
      const errorCode = stryMutAct_9fa48("111658") ? (error?.errorCode || error?.code) && null : stryMutAct_9fa48("111657") ? false : stryMutAct_9fa48("111656") ? true : (stryCov_9fa48("111656", "111657", "111658"), (stryMutAct_9fa48("111660") ? error?.errorCode && error?.code : stryMutAct_9fa48("111659") ? false : (stryCov_9fa48("111659", "111660"), (stryMutAct_9fa48("111661") ? error.errorCode : (stryCov_9fa48("111661"), error?.errorCode)) || (stryMutAct_9fa48("111662") ? error.code : (stryCov_9fa48("111662"), error?.code)))) || null);
      if (stryMutAct_9fa48("111665") ? errorCode !== QUERY_ERROR_CODE.NO_TRANSACTION : stryMutAct_9fa48("111664") ? false : stryMutAct_9fa48("111663") ? true : (stryCov_9fa48("111663", "111664", "111665"), errorCode === QUERY_ERROR_CODE.NO_TRANSACTION)) {
        if (stryMutAct_9fa48("111666")) {
          {}
        } else {
          stryCov_9fa48("111666");
          return stryMutAct_9fa48("111667") ? false : (stryCov_9fa48("111667"), true);
        }
      }
      const errorMessage = String(stryMutAct_9fa48("111670") ? (error?.message || error?.error) && '' : stryMutAct_9fa48("111669") ? false : stryMutAct_9fa48("111668") ? true : (stryCov_9fa48("111668", "111669", "111670"), (stryMutAct_9fa48("111672") ? error?.message && error?.error : stryMutAct_9fa48("111671") ? false : (stryCov_9fa48("111671", "111672"), (stryMutAct_9fa48("111673") ? error.message : (stryCov_9fa48("111673"), error?.message)) || (stryMutAct_9fa48("111674") ? error.error : (stryCov_9fa48("111674"), error?.error)))) || (stryMutAct_9fa48("111675") ? "Stryker was here!" : (stryCov_9fa48("111675"), ''))));
      return IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES.has(errorMessage);
    }
  }

  /**
   * Emit one structured participant retry diagnostic.
   * @param {Object} diagnostic - Retry diagnostic payload.
   * @private
   */
  emitParticipantRetryDiagnostic(diagnostic) {
    if (stryMutAct_9fa48("111676")) {
      {}
    } else {
      stryCov_9fa48("111676");
      if (stryMutAct_9fa48("111679") ? typeof this.onParticipantRetry !== 'function' : stryMutAct_9fa48("111678") ? false : stryMutAct_9fa48("111677") ? true : (stryCov_9fa48("111677", "111678", "111679"), typeof this.onParticipantRetry === (stryMutAct_9fa48("111680") ? "" : (stryCov_9fa48("111680"), 'function')))) {
        if (stryMutAct_9fa48("111681")) {
          {}
        } else {
          stryCov_9fa48("111681");
          this.onParticipantRetry(diagnostic);
        }
      }
      if (stryMutAct_9fa48("111684") ? diagnostic?.duringRecovery === true : stryMutAct_9fa48("111683") ? false : stryMutAct_9fa48("111682") ? true : (stryCov_9fa48("111682", "111683", "111684"), (stryMutAct_9fa48("111685") ? diagnostic.duringRecovery : (stryCov_9fa48("111685"), diagnostic?.duringRecovery)) !== (stryMutAct_9fa48("111686") ? false : (stryCov_9fa48("111686"), true)))) {
        if (stryMutAct_9fa48("111687")) {
          {}
        } else {
          stryCov_9fa48("111687");
          return;
        }
      }
      if (stryMutAct_9fa48("111690") ? typeof this.logger?.warn !== 'function' : stryMutAct_9fa48("111689") ? false : stryMutAct_9fa48("111688") ? true : (stryCov_9fa48("111688", "111689", "111690"), typeof (stryMutAct_9fa48("111691") ? this.logger.warn : (stryCov_9fa48("111691"), this.logger?.warn)) === (stryMutAct_9fa48("111692") ? "" : (stryCov_9fa48("111692"), 'function')))) {
        if (stryMutAct_9fa48("111693")) {
          {}
        } else {
          stryCov_9fa48("111693");
          this.logger.warn(PARTICIPANT_RETRY_LOG_MSG, diagnostic);
        }
      }
    }
  }

  /**
   * Compute bounded exponential backoff delay for participant retries.
   * @param {number} attempt - Retry attempt index (1-based).
   * @return {number} Delay in milliseconds.
   * @private
   */
  calculateParticipantRetryDelay(attempt) {
    if (stryMutAct_9fa48("111694")) {
      {}
    } else {
      stryCov_9fa48("111694");
      const exponentialDelay = stryMutAct_9fa48("111695") ? this.participantRetryBaseDelayMs / 2 ** Math.max(attempt - 1, 0) : (stryCov_9fa48("111695"), this.participantRetryBaseDelayMs * 2 ** (stryMutAct_9fa48("111696") ? Math.min(attempt - 1, 0) : (stryCov_9fa48("111696"), Math.max(stryMutAct_9fa48("111697") ? attempt + 1 : (stryCov_9fa48("111697"), attempt - 1), 0))));
      return stryMutAct_9fa48("111698") ? Math.max(this.participantRetryMaxDelayMs, exponentialDelay) : (stryCov_9fa48("111698"), Math.min(this.participantRetryMaxDelayMs, exponentialDelay));
    }
  }

  /**
   * Persist transaction record through callback.
   * @param {Object} tx - Transaction state.
   * @return {Promise<void>}
   * @private
   */
  async persistTransactionRecord(tx) {
    if (stryMutAct_9fa48("111699")) {
      {}
    } else {
      stryCov_9fa48("111699");
      await this.workflowCoordinator.persistWorkflowState(tx.workflowId);
    }
  }

  /**
   * Persist selected participants for a transaction.
   * @param {Object} tx - Transaction state.
   * @param {string[]} partitionIds - Participant IDs to persist.
   * @return {Promise<void>}
   * @private
   */
  async persistParticipants(tx, partitionIds) {
    if (stryMutAct_9fa48("111700")) {
      {}
    } else {
      stryCov_9fa48("111700");
      for (const partitionId of partitionIds) {
        if (stryMutAct_9fa48("111701")) {
          {}
        } else {
          stryCov_9fa48("111701");
          const participant = tx.participants.get(partitionId);
          if (stryMutAct_9fa48("111704") ? false : stryMutAct_9fa48("111703") ? true : stryMutAct_9fa48("111702") ? participant : (stryCov_9fa48("111702", "111703", "111704"), !participant)) {
            if (stryMutAct_9fa48("111705")) {
              {}
            } else {
              stryCov_9fa48("111705");
              continue;
            }
          }
          await this.persistParticipantRecord(tx, participant);
        }
      }
    }
  }

  /**
   * Persist one participant record through callback.
   * @param {Object} tx - Transaction state.
   * @param {Object} participant - Participant state.
   * @return {Promise<void>}
   * @private
   */
  async persistParticipantRecord(tx, participant) {
    if (stryMutAct_9fa48("111706")) {
      {}
    } else {
      stryCov_9fa48("111706");
      await this.workflowCoordinator.persistParticipantState(tx.workflowId, participant.partitionId);
    }
  }

  /**
   * Persist one write-operation record through callback.
   * @param {Object} tx - Transaction state.
   * @param {Object} operation - Write operation metadata.
   * @return {Promise<void>}
   * @private
   */
  async persistWriteOperationRecord(tx, operation) {
    if (stryMutAct_9fa48("111707")) {
      {}
    } else {
      stryCov_9fa48("111707");
      await this.persistWriteOperation(stryMutAct_9fa48("111708") ? {} : (stryCov_9fa48("111708"), {
        operationId: operation.operationId,
        transactionId: tx.transactionId,
        statementType: operation.statementType,
        status: operation.status,
        idempotencyKey: operation.idempotencyKey,
        payloadHash: operation.payloadHash,
        partitionIds: operation.partitionIds,
        retryCount: operation.retryCount,
        lastError: operation.lastError,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt
      }));
    }
  }

  /**
   * Build transaction ID.
   * @param {string} sessionId - Session ID.
   * @return {string} Transaction ID.
   * @private
   */
  createTransactionId(sessionId) {
    if (stryMutAct_9fa48("111709")) {
      {}
    } else {
      stryCov_9fa48("111709");
      return stryMutAct_9fa48("111710") ? `` : (stryCov_9fa48("111710"), `tx-${sessionId}-${this.now()}`);
    }
  }

  /**
   * Build a deterministic participant ID.
   * @param {string} transactionId - Transaction ID.
   * @param {string} partitionId - Partition ID.
   * @return {string} Participant ID.
   * @private
   */
  createParticipantId(transactionId, partitionId) {
    if (stryMutAct_9fa48("111711")) {
      {}
    } else {
      stryCov_9fa48("111711");
      return stryMutAct_9fa48("111712") ? `` : (stryCov_9fa48("111712"), `${transactionId}:${partitionId}`);
    }
  }

  /**
   * Build payload hash for write operation persistence.
   * @param {Object} operation - Write operation metadata.
   * @return {string} Payload hash.
   * @private
   */
  createWritePayloadHash(operation) {
    if (stryMutAct_9fa48("111713")) {
      {}
    } else {
      stryCov_9fa48("111713");
      const payload = JSON.stringify(stryMutAct_9fa48("111714") ? {} : (stryCov_9fa48("111714"), {
        operationId: operation.operationId,
        statementType: operation.statementType,
        partitionIds: stryMutAct_9fa48("111717") ? operation.partitionIds && [] : stryMutAct_9fa48("111716") ? false : stryMutAct_9fa48("111715") ? true : (stryCov_9fa48("111715", "111716", "111717"), operation.partitionIds || (stryMutAct_9fa48("111718") ? ["Stryker was here"] : (stryCov_9fa48("111718"), [])))
      }));
      return createHash(stryMutAct_9fa48("111719") ? "" : (stryCov_9fa48("111719"), 'sha1')).update(payload).digest(stryMutAct_9fa48("111720") ? "" : (stryCov_9fa48("111720"), 'hex'));
    }
  }

  /**
   * Parse serialized JSON array payloads.
   * @param {*} value - Raw value.
   * @return {string[]} Parsed array.
   * @private
   */
  parseJsonArrayField(value) {
    if (stryMutAct_9fa48("111721")) {
      {}
    } else {
      stryCov_9fa48("111721");
      if (stryMutAct_9fa48("111723") ? false : stryMutAct_9fa48("111722") ? true : (stryCov_9fa48("111722", "111723"), Array.isArray(value))) {
        if (stryMutAct_9fa48("111724")) {
          {}
        } else {
          stryCov_9fa48("111724");
          return value.map(stryMutAct_9fa48("111725") ? () => undefined : (stryCov_9fa48("111725"), entry => String(entry)));
        }
      }
      if (stryMutAct_9fa48("111728") ? typeof value !== 'string' && !value.trim() : stryMutAct_9fa48("111727") ? false : stryMutAct_9fa48("111726") ? true : (stryCov_9fa48("111726", "111727", "111728"), (stryMutAct_9fa48("111730") ? typeof value === 'string' : stryMutAct_9fa48("111729") ? false : (stryCov_9fa48("111729", "111730"), typeof value !== (stryMutAct_9fa48("111731") ? "" : (stryCov_9fa48("111731"), 'string')))) || (stryMutAct_9fa48("111732") ? value.trim() : (stryCov_9fa48("111732"), !(stryMutAct_9fa48("111733") ? value : (stryCov_9fa48("111733"), value.trim())))))) {
        if (stryMutAct_9fa48("111734")) {
          {}
        } else {
          stryCov_9fa48("111734");
          return stryMutAct_9fa48("111735") ? ["Stryker was here"] : (stryCov_9fa48("111735"), []);
        }
      }
      try {
        if (stryMutAct_9fa48("111736")) {
          {}
        } else {
          stryCov_9fa48("111736");
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(stryMutAct_9fa48("111737") ? () => undefined : (stryCov_9fa48("111737"), entry => String(entry))) : stryMutAct_9fa48("111738") ? ["Stryker was here"] : (stryCov_9fa48("111738"), []);
        }
      } catch (_parseErr) {
        if (stryMutAct_9fa48("111739")) {
          {}
        } else {
          stryCov_9fa48("111739");
          return stryMutAct_9fa48("111740") ? ["Stryker was here"] : (stryCov_9fa48("111740"), []);
        }
      }
    }
  }

  /**
   * Resolve one numeric field from snake_case/camelCase row keys.
   * @param {Object} row - Source row.
   * @param {string} snakeKey - Snake-case key.
   * @param {string} camelKey - Camel-case key.
   * @return {number|null} Parsed numeric value.
   * @private
   */
  resolveFiniteNumberField(row, snakeKey, camelKey) {
    if (stryMutAct_9fa48("111741")) {
      {}
    } else {
      stryCov_9fa48("111741");
      if (stryMutAct_9fa48("111743") ? false : stryMutAct_9fa48("111742") ? true : (stryCov_9fa48("111742", "111743"), Number.isFinite(stryMutAct_9fa48("111744") ? row[snakeKey] : (stryCov_9fa48("111744"), row?.[snakeKey])))) {
        if (stryMutAct_9fa48("111745")) {
          {}
        } else {
          stryCov_9fa48("111745");
          return row[snakeKey];
        }
      }
      if (stryMutAct_9fa48("111747") ? false : stryMutAct_9fa48("111746") ? true : (stryCov_9fa48("111746", "111747"), Number.isFinite(stryMutAct_9fa48("111748") ? row[camelKey] : (stryCov_9fa48("111748"), row?.[camelKey])))) {
        if (stryMutAct_9fa48("111749")) {
          {}
        } else {
          stryCov_9fa48("111749");
          return row[camelKey];
        }
      }
      return null;
    }
  }

  /**
   * Return ordered participant IDs for API responses.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Ordered participant IDs.
   * @private
   */
  getOrderedParticipantIds(tx) {
    if (stryMutAct_9fa48("111750")) {
      {}
    } else {
      stryCov_9fa48("111750");
      return stryMutAct_9fa48("111751") ? Array.from(tx.participants.keys()) : (stryCov_9fa48("111751"), Array.from(tx.participants.keys()).sort());
    }
  }

  /**
   * Return ordered participant details for API responses.
   * @param {Object} tx - Transaction state.
   * @return {Object[]} Ordered participant records.
   * @private
   */
  getOrderedParticipantDetails(tx) {
    if (stryMutAct_9fa48("111752")) {
      {}
    } else {
      stryCov_9fa48("111752");
      return stryMutAct_9fa48("111753") ? Array.from(tx.participants.values()).map(participant => ({
        ...participant
      })) : (stryCov_9fa48("111753"), Array.from(tx.participants.values()).map(stryMutAct_9fa48("111754") ? () => undefined : (stryCov_9fa48("111754"), participant => stryMutAct_9fa48("111755") ? {} : (stryCov_9fa48("111755"), {
        ...participant
      }))).sort(stryMutAct_9fa48("111756") ? () => undefined : (stryCov_9fa48("111756"), (left, right) => left.partitionId.localeCompare(right.partitionId))));
    }
  }
}
export { DistributedTransactionCoordinator, PARTICIPANT_STATUS, TRANSACTION_STATUS, WRITE_OPERATION_STATUS };