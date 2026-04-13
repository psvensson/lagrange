/**
 * CDC Pipeline Readiness Gate — composite readiness evaluator for the
 * CDC pipeline.
 *
 * Evaluates three conditions before declaring the pipeline ready:
 *   1. Subscriptions active on all CDC-propagated tables
 *   2. Propagation message group has an elected leader
 *   3. Pipeline has delivered at least one event to SystemTableCache
 *
 * The gate is a stateless evaluator — it reads from existing state
 * (partition subscriber counts, message group leader status, cache
 * change notifications). It does not maintain its own state or cache.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 *
 * @module cdc/cdc-pipeline-readiness-gate
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
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { NUM, TYPEOF } from '../constants/index.js';
import { emitInvariant } from '../invariants/invariant-emitter.js';
import { INVARIANT_ID } from '../invariants/invariant-catalog.js';
import { CDC_LIFECYCLE_LOG_MSG, CDC_PIPELINE_READINESS_CONDITION, CDC_PIPELINE_READINESS_GATE, CDC_PIPELINE_READINESS_NOW, CDC_PIPELINE_READINESS_POLL_INTERVAL_MS, CDC_PIPELINE_READINESS_SLEEP, CDC_PIPELINE_READINESS_TIMEOUT_MS } from '../constants/cdc-lifecycle-constants.js';
function normalizeUnmetConditions(unmetConditions) {
  if (stryMutAct_9fa48("39120")) {
    {}
  } else {
    stryCov_9fa48("39120");
    return Array.isArray(unmetConditions) ? stryMutAct_9fa48("39121") ? [...unmetConditions] : (stryCov_9fa48("39121"), (stryMutAct_9fa48("39122") ? [] : (stryCov_9fa48("39122"), [...unmetConditions])).sort()) : stryMutAct_9fa48("39123") ? ["Stryker was here"] : (stryCov_9fa48("39123"), []);
  }
}
function buildUnmetSignature(result) {
  if (stryMutAct_9fa48("39124")) {
    {}
  } else {
    stryCov_9fa48("39124");
    return JSON.stringify(normalizeUnmetConditions(stryMutAct_9fa48("39125") ? result.unmetConditions : (stryCov_9fa48("39125"), result?.unmetConditions)));
  }
}

/**
 * CDCPipelineReadinessGate evaluates whether the CDC pipeline is fully
 * wired and capable of propagating events from partition leaders to the
 * SystemTableCache.
 */
class CDCPipelineReadinessGate extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.systemTableCache — SystemTableCache instance
   * @param {string[]} options.cdcPropagatedTables — from CDC_PROPAGATED_TABLES
   */
  constructor(options = CDC_PIPELINE_READINESS_GATE.DEFAULT_OPTIONS) {
    if (stryMutAct_9fa48("39126")) {
      {}
    } else {
      stryCov_9fa48("39126");
      super();
      this.systemTableCache = options.systemTableCache;
      this.cdcPropagatedTables = stryMutAct_9fa48("39129") ? options.cdcPropagatedTables && CDC_PIPELINE_READINESS_GATE.EMPTY_PROPAGATED_TABLES : stryMutAct_9fa48("39128") ? false : stryMutAct_9fa48("39127") ? true : (stryCov_9fa48("39127", "39128", "39129"), options.cdcPropagatedTables || CDC_PIPELINE_READINESS_GATE.EMPTY_PROPAGATED_TABLES);
      this._pipelineProven = stryMutAct_9fa48("39130") ? true : (stryCov_9fa48("39130"), false);
      this._now = (stryMutAct_9fa48("39133") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("39132") ? false : stryMutAct_9fa48("39131") ? true : (stryCov_9fa48("39131", "39132", "39133"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : CDC_PIPELINE_READINESS_NOW;
      this._sleep = (stryMutAct_9fa48("39136") ? typeof options.sleep !== TYPEOF.FUNCTION : stryMutAct_9fa48("39135") ? false : stryMutAct_9fa48("39134") ? true : (stryCov_9fa48("39134", "39135", "39136"), typeof options.sleep === TYPEOF.FUNCTION)) ? options.sleep : CDC_PIPELINE_READINESS_SLEEP;
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(CDC_PIPELINE_READINESS_GATE.SUBSYSTEM);

      // If the cache already has data for any CDC-propagated table, the
      // pipeline is already proven (cache was hydrated before the gate
      // was created — seed bootstrap or join-time snapshot hydration).
      if (stryMutAct_9fa48("39139") ? this.systemTableCache || this._cacheAlreadyHydrated() : stryMutAct_9fa48("39138") ? false : stryMutAct_9fa48("39137") ? true : (stryCov_9fa48("39137", "39138", "39139"), this.systemTableCache && this._cacheAlreadyHydrated())) {
        if (stryMutAct_9fa48("39140")) {
          {}
        } else {
          stryCov_9fa48("39140");
          this._pipelineProven = stryMutAct_9fa48("39141") ? false : (stryCov_9fa48("39141"), true);
        }
      }

      // One-shot listener: once the cache receives any change, the
      // pipeline is proven to work end-to-end.
      this._cacheListener = () => {
        if (stryMutAct_9fa48("39142")) {
          {}
        } else {
          stryCov_9fa48("39142");
          this._pipelineProven = stryMutAct_9fa48("39143") ? false : (stryCov_9fa48("39143"), true);
          if (stryMutAct_9fa48("39145") ? false : stryMutAct_9fa48("39144") ? true : (stryCov_9fa48("39144", "39145"), this.systemTableCache)) {
            if (stryMutAct_9fa48("39146")) {
              {}
            } else {
              stryCov_9fa48("39146");
              this.systemTableCache.offCacheChange(this._cacheListener);
            }
          }
        }
      };
      if (stryMutAct_9fa48("39149") ? this.systemTableCache || !this._pipelineProven : stryMutAct_9fa48("39148") ? false : stryMutAct_9fa48("39147") ? true : (stryCov_9fa48("39147", "39148", "39149"), this.systemTableCache && (stryMutAct_9fa48("39150") ? this._pipelineProven : (stryCov_9fa48("39150"), !this._pipelineProven)))) {
        if (stryMutAct_9fa48("39151")) {
          {}
        } else {
          stryCov_9fa48("39151");
          this.systemTableCache.onCacheChange(this._cacheListener);
        }
      }
    }
  }

  /**
   * Evaluate pipeline readiness.
   *
   * @param {Object} context
   * @param {Map} context.partitionServices — partition replicas
   * @param {Map} context.messageGroupServices — message group replicas
   * @param {boolean} [context.requirePropagationLeader=true] - When false,
   * propagation-leader status is treated as non-blocking.
   * @return {{ready: boolean, unmetConditions: string[]}}
   */
  evaluate(context) {
    if (stryMutAct_9fa48("39152")) {
      {}
    } else {
      stryCov_9fa48("39152");
      const requirePropagationLeader = stryMutAct_9fa48("39155") ? context?.requirePropagationLeader === false : stryMutAct_9fa48("39154") ? false : stryMutAct_9fa48("39153") ? true : (stryCov_9fa48("39153", "39154", "39155"), (stryMutAct_9fa48("39156") ? context.requirePropagationLeader : (stryCov_9fa48("39156"), context?.requirePropagationLeader)) !== (stryMutAct_9fa48("39157") ? true : (stryCov_9fa48("39157"), false)));
      const unmetConditions = stryMutAct_9fa48("39158") ? ["Stryker was here"] : (stryCov_9fa48("39158"), []);
      if (stryMutAct_9fa48("39161") ? false : stryMutAct_9fa48("39160") ? true : stryMutAct_9fa48("39159") ? this._checkSubscriptionsActive(context) : (stryCov_9fa48("39159", "39160", "39161"), !this._checkSubscriptionsActive(context))) {
        if (stryMutAct_9fa48("39162")) {
          {}
        } else {
          stryCov_9fa48("39162");
          unmetConditions.push(CDC_PIPELINE_READINESS_CONDITION.SUBSCRIPTIONS_ACTIVE);
        }
      }
      if (stryMutAct_9fa48("39165") ? requirePropagationLeader || !this._checkPropagationLeader(context) : stryMutAct_9fa48("39164") ? false : stryMutAct_9fa48("39163") ? true : (stryCov_9fa48("39163", "39164", "39165"), requirePropagationLeader && (stryMutAct_9fa48("39166") ? this._checkPropagationLeader(context) : (stryCov_9fa48("39166"), !this._checkPropagationLeader(context))))) {
        if (stryMutAct_9fa48("39167")) {
          {}
        } else {
          stryCov_9fa48("39167");
          unmetConditions.push(CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER);
        }
      }
      if (stryMutAct_9fa48("39170") ? false : stryMutAct_9fa48("39169") ? true : stryMutAct_9fa48("39168") ? this._pipelineProven : (stryCov_9fa48("39168", "39169", "39170"), !this._pipelineProven)) {
        if (stryMutAct_9fa48("39171")) {
          {}
        } else {
          stryCov_9fa48("39171");
          unmetConditions.push(CDC_PIPELINE_READINESS_CONDITION.PIPELINE_PROVEN);
        }
      }
      const ready = stryMutAct_9fa48("39174") ? unmetConditions.length !== NUM.ZERO : stryMutAct_9fa48("39173") ? false : stryMutAct_9fa48("39172") ? true : (stryCov_9fa48("39172", "39173", "39174"), unmetConditions.length === NUM.ZERO);
      return stryMutAct_9fa48("39175") ? {} : (stryCov_9fa48("39175"), {
        ready,
        unmetConditions
      });
    }
  }

  /**
   * Wait for pipeline readiness with timeout.
   *
   * Polls evaluate() at pollIntervalMs intervals using setTimeout-based
   * polling to avoid timer leaks. Rejects on timeout with unmet
   * conditions in the error.
   *
   * @param {Object} context
   * @param {number} [timeoutMs]
   * @param {number} [pollIntervalMs]
   * @return {Promise<{ready: boolean, unmetConditions: string[]}>}
   */
  async waitForReady(context, timeoutMs, pollIntervalMs) {
    if (stryMutAct_9fa48("39176")) {
      {}
    } else {
      stryCov_9fa48("39176");
      const timeout = stryMutAct_9fa48("39179") ? timeoutMs && CDC_PIPELINE_READINESS_TIMEOUT_MS : stryMutAct_9fa48("39178") ? false : stryMutAct_9fa48("39177") ? true : (stryCov_9fa48("39177", "39178", "39179"), timeoutMs || CDC_PIPELINE_READINESS_TIMEOUT_MS);
      const interval = stryMutAct_9fa48("39182") ? pollIntervalMs && CDC_PIPELINE_READINESS_POLL_INTERVAL_MS : stryMutAct_9fa48("39181") ? false : stryMutAct_9fa48("39180") ? true : (stryCov_9fa48("39180", "39181", "39182"), pollIntervalMs || CDC_PIPELINE_READINESS_POLL_INTERVAL_MS);
      const startMs = this._now();
      const deadline = stryMutAct_9fa48("39183") ? startMs - timeout : (stryCov_9fa48("39183"), startMs + timeout);
      let lastProgressAtMs = startMs;
      let lastSignature = null;
      while (stryMutAct_9fa48("39185") ? false : stryMutAct_9fa48("39184") ? false : (stryCov_9fa48("39184", "39185"), true)) {
        if (stryMutAct_9fa48("39186")) {
          {}
        } else {
          stryCov_9fa48("39186");
          const result = this.evaluate(context);
          if (stryMutAct_9fa48("39188") ? false : stryMutAct_9fa48("39187") ? true : (stryCov_9fa48("39187", "39188"), result.ready)) {
            if (stryMutAct_9fa48("39189")) {
              {}
            } else {
              stryCov_9fa48("39189");
              emitInvariant(this, stryMutAct_9fa48("39190") ? {} : (stryCov_9fa48("39190"), {
                invariantId: INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE,
                passed: stryMutAct_9fa48("39191") ? false : (stryCov_9fa48("39191"), true),
                entityId: CDC_PIPELINE_READINESS_GATE.ENTITY_ID,
                owningSubsystem: CDC_PIPELINE_READINESS_GATE.SUBSYSTEM,
                observed: stryMutAct_9fa48("39192") ? {} : (stryCov_9fa48("39192"), {
                  unmetConditions: stryMutAct_9fa48("39193") ? ["Stryker was here"] : (stryCov_9fa48("39193"), [])
                })
              }));
              this.logger.info(CDC_LIFECYCLE_LOG_MSG.PIPELINE_READY);
              return result;
            }
          }
          const signature = buildUnmetSignature(result);
          if (stryMutAct_9fa48("39196") ? signature === lastSignature : stryMutAct_9fa48("39195") ? false : stryMutAct_9fa48("39194") ? true : (stryCov_9fa48("39194", "39195", "39196"), signature !== lastSignature)) {
            if (stryMutAct_9fa48("39197")) {
              {}
            } else {
              stryCov_9fa48("39197");
              lastSignature = signature;
              lastProgressAtMs = this._now();
            }
          }
          if (stryMutAct_9fa48("39201") ? this._now() < deadline : stryMutAct_9fa48("39200") ? this._now() > deadline : stryMutAct_9fa48("39199") ? false : stryMutAct_9fa48("39198") ? true : (stryCov_9fa48("39198", "39199", "39200", "39201"), this._now() >= deadline)) {
            if (stryMutAct_9fa48("39202")) {
              {}
            } else {
              stryCov_9fa48("39202");
              const timeoutKind = (stryMutAct_9fa48("39205") ? lastProgressAtMs !== startMs : stryMutAct_9fa48("39204") ? false : stryMutAct_9fa48("39203") ? true : (stryCov_9fa48("39203", "39204", "39205"), lastProgressAtMs === startMs)) ? CDC_PIPELINE_READINESS_GATE.TIMEOUT_KIND.NO_PROGRESS : CDC_PIPELINE_READINESS_GATE.TIMEOUT_KIND.ABSOLUTE_DEADLINE_EXHAUSTED;
              this.logger.warn(CDC_LIFECYCLE_LOG_MSG.PIPELINE_READINESS_TIMEOUT, stryMutAct_9fa48("39206") ? {} : (stryCov_9fa48("39206"), {
                unmetConditions: result.unmetConditions,
                timeoutMs: timeout,
                timeoutKind,
                lastProgressElapsedMs: stryMutAct_9fa48("39207") ? Math.min(NUM.ZERO, lastProgressAtMs - startMs) : (stryCov_9fa48("39207"), Math.max(NUM.ZERO, stryMutAct_9fa48("39208") ? lastProgressAtMs + startMs : (stryCov_9fa48("39208"), lastProgressAtMs - startMs)))
              }));
              emitInvariant(this, stryMutAct_9fa48("39209") ? {} : (stryCov_9fa48("39209"), {
                invariantId: INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE,
                passed: stryMutAct_9fa48("39210") ? true : (stryCov_9fa48("39210"), false),
                entityId: CDC_PIPELINE_READINESS_GATE.ENTITY_ID,
                owningSubsystem: CDC_PIPELINE_READINESS_GATE.SUBSYSTEM,
                observed: stryMutAct_9fa48("39211") ? {} : (stryCov_9fa48("39211"), {
                  unmetConditions: result.unmetConditions,
                  timeoutMs: timeout,
                  timeoutKind,
                  lastProgressElapsedMs: stryMutAct_9fa48("39212") ? Math.min(NUM.ZERO, lastProgressAtMs - startMs) : (stryCov_9fa48("39212"), Math.max(NUM.ZERO, stryMutAct_9fa48("39213") ? lastProgressAtMs + startMs : (stryCov_9fa48("39213"), lastProgressAtMs - startMs)))
                })
              }));
              const error = new Error((stryMutAct_9fa48("39214") ? `` : (stryCov_9fa48("39214"), `${CDC_LIFECYCLE_LOG_MSG.PIPELINE_READINESS_TIMEOUT}: `)) + (stryMutAct_9fa48("39215") ? `` : (stryCov_9fa48("39215"), `unmet=[${result.unmetConditions.join(stryMutAct_9fa48("39216") ? "" : (stryCov_9fa48("39216"), ', '))}] `)) + (stryMutAct_9fa48("39217") ? `` : (stryCov_9fa48("39217"), `timeout=${timeout}ms `)) + (stryMutAct_9fa48("39218") ? `` : (stryCov_9fa48("39218"), `kind=${timeoutKind}`)));
              error.unmetConditions = result.unmetConditions;
              error.timeoutMs = timeout;
              error.timeoutKind = timeoutKind;
              error.lastProgressElapsedMs = stryMutAct_9fa48("39219") ? Math.min(NUM.ZERO, lastProgressAtMs - startMs) : (stryCov_9fa48("39219"), Math.max(NUM.ZERO, stryMutAct_9fa48("39220") ? lastProgressAtMs + startMs : (stryCov_9fa48("39220"), lastProgressAtMs - startMs)));
              throw error;
            }
          }
          await this._sleep(interval);
        }
      }
    }
  }

  /**
   * Check that CDC subscriptions are active.
   *
   * On a seed node this verifies every CDC-propagated table has at
   * least one partition replica with a registered CDC subscriber.
   *
   * On a joining node the per-partition check is not applicable
   * because CDC events arrive through message group propagation, not
   * local partition subscribers. In that case the caller sets
   * `context.cdcSubscriptionsActive = true` after its CDC integration
   * service subscriptions are established, which satisfies this check.
   *
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  _checkSubscriptionsActive(context) {
    if (stryMutAct_9fa48("39221")) {
      {}
    } else {
      stryCov_9fa48("39221");
      // Joining-node path: CDC events arrive via message group
      // propagation. The caller signals readiness explicitly.
      if (stryMutAct_9fa48("39224") ? context.cdcSubscriptionsActive !== true : stryMutAct_9fa48("39223") ? false : stryMutAct_9fa48("39222") ? true : (stryCov_9fa48("39222", "39223", "39224"), context.cdcSubscriptionsActive === (stryMutAct_9fa48("39225") ? false : (stryCov_9fa48("39225"), true)))) {
        if (stryMutAct_9fa48("39226")) {
          {}
        } else {
          stryCov_9fa48("39226");
          return stryMutAct_9fa48("39227") ? false : (stryCov_9fa48("39227"), true);
        }
      }

      // Seed-node path: verify per-partition subscribers.
      const partitionServices = context.partitionServices;
      if (stryMutAct_9fa48("39230") ? this.cdcPropagatedTables.length !== NUM.ZERO : stryMutAct_9fa48("39229") ? false : stryMutAct_9fa48("39228") ? true : (stryCov_9fa48("39228", "39229", "39230"), this.cdcPropagatedTables.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("39231")) {
          {}
        } else {
          stryCov_9fa48("39231");
          return stryMutAct_9fa48("39232") ? false : (stryCov_9fa48("39232"), true);
        }
      }
      if (stryMutAct_9fa48("39235") ? !partitionServices && partitionServices.size === NUM.ZERO : stryMutAct_9fa48("39234") ? false : stryMutAct_9fa48("39233") ? true : (stryCov_9fa48("39233", "39234", "39235"), (stryMutAct_9fa48("39236") ? partitionServices : (stryCov_9fa48("39236"), !partitionServices)) || (stryMutAct_9fa48("39238") ? partitionServices.size !== NUM.ZERO : stryMutAct_9fa48("39237") ? false : (stryCov_9fa48("39237", "39238"), partitionServices.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("39239")) {
          {}
        } else {
          stryCov_9fa48("39239");
          return stryMutAct_9fa48("39240") ? true : (stryCov_9fa48("39240"), false);
        }
      }
      for (const tableName of this.cdcPropagatedTables) {
        if (stryMutAct_9fa48("39241")) {
          {}
        } else {
          stryCov_9fa48("39241");
          let hasSubscriber = stryMutAct_9fa48("39242") ? true : (stryCov_9fa48("39242"), false);
          for (const partition of partitionServices.values()) {
            if (stryMutAct_9fa48("39243")) {
              {}
            } else {
              stryCov_9fa48("39243");
              if (stryMutAct_9fa48("39246") ? partition.tableName === tableName && partition.cdcSubscribers || partition.cdcSubscribers.size > NUM.ZERO : stryMutAct_9fa48("39245") ? false : stryMutAct_9fa48("39244") ? true : (stryCov_9fa48("39244", "39245", "39246"), (stryMutAct_9fa48("39248") ? partition.tableName === tableName || partition.cdcSubscribers : stryMutAct_9fa48("39247") ? true : (stryCov_9fa48("39247", "39248"), (stryMutAct_9fa48("39250") ? partition.tableName !== tableName : stryMutAct_9fa48("39249") ? true : (stryCov_9fa48("39249", "39250"), partition.tableName === tableName)) && partition.cdcSubscribers)) && (stryMutAct_9fa48("39253") ? partition.cdcSubscribers.size <= NUM.ZERO : stryMutAct_9fa48("39252") ? partition.cdcSubscribers.size >= NUM.ZERO : stryMutAct_9fa48("39251") ? true : (stryCov_9fa48("39251", "39252", "39253"), partition.cdcSubscribers.size > NUM.ZERO)))) {
                if (stryMutAct_9fa48("39254")) {
                  {}
                } else {
                  stryCov_9fa48("39254");
                  hasSubscriber = stryMutAct_9fa48("39255") ? false : (stryCov_9fa48("39255"), true);
                  break;
                }
              }
            }
          }
          if (stryMutAct_9fa48("39258") ? false : stryMutAct_9fa48("39257") ? true : stryMutAct_9fa48("39256") ? hasSubscriber : (stryCov_9fa48("39256", "39257", "39258"), !hasSubscriber)) {
            if (stryMutAct_9fa48("39259")) {
              {}
            } else {
              stryCov_9fa48("39259");
              return stryMutAct_9fa48("39260") ? true : (stryCov_9fa48("39260"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("39261") ? false : (stryCov_9fa48("39261"), true);
    }
  }

  /**
   * Check that at least one message group service reports as leader.
   *
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  _checkPropagationLeader(context) {
    if (stryMutAct_9fa48("39262")) {
      {}
    } else {
      stryCov_9fa48("39262");
      const messageGroupServices = context.messageGroupServices;
      if (stryMutAct_9fa48("39265") ? !messageGroupServices && messageGroupServices.size === NUM.ZERO : stryMutAct_9fa48("39264") ? false : stryMutAct_9fa48("39263") ? true : (stryCov_9fa48("39263", "39264", "39265"), (stryMutAct_9fa48("39266") ? messageGroupServices : (stryCov_9fa48("39266"), !messageGroupServices)) || (stryMutAct_9fa48("39268") ? messageGroupServices.size !== NUM.ZERO : stryMutAct_9fa48("39267") ? false : (stryCov_9fa48("39267", "39268"), messageGroupServices.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("39269")) {
          {}
        } else {
          stryCov_9fa48("39269");
          return stryMutAct_9fa48("39270") ? true : (stryCov_9fa48("39270"), false);
        }
      }
      for (const mg of messageGroupServices.values()) {
        if (stryMutAct_9fa48("39271")) {
          {}
        } else {
          stryCov_9fa48("39271");
          if (stryMutAct_9fa48("39274") ? typeof mg.isLeaderReplica === TYPEOF.FUNCTION || mg.isLeaderReplica() : stryMutAct_9fa48("39273") ? false : stryMutAct_9fa48("39272") ? true : (stryCov_9fa48("39272", "39273", "39274"), (stryMutAct_9fa48("39276") ? typeof mg.isLeaderReplica !== TYPEOF.FUNCTION : stryMutAct_9fa48("39275") ? true : (stryCov_9fa48("39275", "39276"), typeof mg.isLeaderReplica === TYPEOF.FUNCTION)) && mg.isLeaderReplica())) {
            if (stryMutAct_9fa48("39277")) {
              {}
            } else {
              stryCov_9fa48("39277");
              return stryMutAct_9fa48("39278") ? false : (stryCov_9fa48("39278"), true);
            }
          }
          if (stryMutAct_9fa48("39281") ? typeof mg.getLeaderId !== TYPEOF.FUNCTION : stryMutAct_9fa48("39280") ? false : stryMutAct_9fa48("39279") ? true : (stryCov_9fa48("39279", "39280", "39281"), typeof mg.getLeaderId === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("39282")) {
              {}
            } else {
              stryCov_9fa48("39282");
              const leaderId = mg.getLeaderId();
              if (stryMutAct_9fa48("39285") ? typeof leaderId === TYPEOF.STRING || leaderId.length > NUM.ZERO : stryMutAct_9fa48("39284") ? false : stryMutAct_9fa48("39283") ? true : (stryCov_9fa48("39283", "39284", "39285"), (stryMutAct_9fa48("39287") ? typeof leaderId !== TYPEOF.STRING : stryMutAct_9fa48("39286") ? true : (stryCov_9fa48("39286", "39287"), typeof leaderId === TYPEOF.STRING)) && (stryMutAct_9fa48("39290") ? leaderId.length <= NUM.ZERO : stryMutAct_9fa48("39289") ? leaderId.length >= NUM.ZERO : stryMutAct_9fa48("39288") ? true : (stryCov_9fa48("39288", "39289", "39290"), leaderId.length > NUM.ZERO)))) {
                if (stryMutAct_9fa48("39291")) {
                  {}
                } else {
                  stryCov_9fa48("39291");
                  return stryMutAct_9fa48("39292") ? false : (stryCov_9fa48("39292"), true);
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("39293") ? true : (stryCov_9fa48("39293"), false);
    }
  }
  /**
   * Check whether the cache already contains data for at least one
   * CDC-propagated table. When true, the pipeline is considered
   * proven because data has already reached the cache (via bootstrap
   * hydration or snapshot replay) before the gate was created.
   *
   * @return {boolean}
   * @private
   */
  _cacheAlreadyHydrated() {
    if (stryMutAct_9fa48("39294")) {
      {}
    } else {
      stryCov_9fa48("39294");
      for (const tableName of this.cdcPropagatedTables) {
        if (stryMutAct_9fa48("39295")) {
          {}
        } else {
          stryCov_9fa48("39295");
          try {
            if (stryMutAct_9fa48("39296")) {
              {}
            } else {
              stryCov_9fa48("39296");
              const records = this.systemTableCache.getAll(tableName);
              if (stryMutAct_9fa48("39299") ? records || records.length > NUM.ZERO : stryMutAct_9fa48("39298") ? false : stryMutAct_9fa48("39297") ? true : (stryCov_9fa48("39297", "39298", "39299"), records && (stryMutAct_9fa48("39302") ? records.length <= NUM.ZERO : stryMutAct_9fa48("39301") ? records.length >= NUM.ZERO : stryMutAct_9fa48("39300") ? true : (stryCov_9fa48("39300", "39301", "39302"), records.length > NUM.ZERO)))) {
                if (stryMutAct_9fa48("39303")) {
                  {}
                } else {
                  stryCov_9fa48("39303");
                  return stryMutAct_9fa48("39304") ? false : (stryCov_9fa48("39304"), true);
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("39305")) {
              {}
            } else {
              stryCov_9fa48("39305");
              this.logger.debug(CDC_LIFECYCLE_LOG_MSG.PIPELINE_CACHE_PROBE_FAILED, stryMutAct_9fa48("39306") ? {} : (stryCov_9fa48("39306"), {
                tableName,
                error: error.message
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("39307") ? true : (stryCov_9fa48("39307"), false);
    }
  }
}
export { CDCPipelineReadinessGate };