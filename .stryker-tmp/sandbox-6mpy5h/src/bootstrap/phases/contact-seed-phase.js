/**
 * Contact Seed Phase — handles the initial HTTP contact with the seed node
 * during the join process, including retry logic and error classification.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
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
import { assertCritical } from '../../utils/assert.js';
import { BOOTSTRAP_PIPELINE_ERROR_CODE } from '../bootstrap-constants.js';
import { JOINING_DEFAULT, JOINING_ERROR_MSG, JOINING_HTTP, JOINING_LOG_MSG } from '../node-joining-constants.js';
import { HTTP_STATUS, NUM, STRING, TYPEOF } from '../../constants/index.js';
const SEED_READINESS_TIMEOUT_MSG = stryMutAct_9fa48("24859") ? () => undefined : (stryCov_9fa48("24859"), (() => {
  const SEED_READINESS_TIMEOUT_MSG = ms => stryMutAct_9fa48("24860") ? `` : (stryCov_9fa48("24860"), `seed readiness timeout after ${ms}ms`);
  return SEED_READINESS_TIMEOUT_MSG;
})());
const HTTP_ERROR_MESSAGE_PATTERN = stryMutAct_9fa48("24867") ? /^HTTP (\d+):\s*(.)$/s : stryMutAct_9fa48("24866") ? /^HTTP (\d+):\S*(.*)$/s : stryMutAct_9fa48("24865") ? /^HTTP (\d+):\s(.*)$/s : stryMutAct_9fa48("24864") ? /^HTTP (\D+):\s*(.*)$/s : stryMutAct_9fa48("24863") ? /^HTTP (\d):\s*(.*)$/s : stryMutAct_9fa48("24862") ? /^HTTP (\d+):\s*(.*)/s : stryMutAct_9fa48("24861") ? /HTTP (\d+):\s*(.*)$/s : (stryCov_9fa48("24861", "24862", "24863", "24864", "24865", "24866", "24867"), /^HTTP (\d+):\s*(.*)$/s);

/**
 * Handles the contact-seed phase of the join process.
 */
class ContactSeedPhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("24868")) {
      {}
    } else {
      stryCov_9fa48("24868");
      this.nodeId = options.nodeId;
      this.delegates = stryMutAct_9fa48("24871") ? options.delegates && {} : stryMutAct_9fa48("24870") ? false : stryMutAct_9fa48("24869") ? true : (stryCov_9fa48("24869", "24870", "24871"), options.delegates || {});
    }
  }

  /**
   * Contact the seed node via HTTP to get bootstrap response.
   * Retries with exponential backoff on transient failures.
   * @return {Promise<void>}
   */
  async phaseContactSeed() {
    if (stryMutAct_9fa48("24872")) {
      {}
    } else {
      stryCov_9fa48("24872");
      const seedNodeAddress = this.delegates.getSeedNodeAddress();
      if (stryMutAct_9fa48("24875") ? false : stryMutAct_9fa48("24874") ? true : stryMutAct_9fa48("24873") ? seedNodeAddress : (stryCov_9fa48("24873", "24874", "24875"), !seedNodeAddress)) {
        if (stryMutAct_9fa48("24876")) {
          {}
        } else {
          stryCov_9fa48("24876");
          throw new Error(JOINING_ERROR_MSG.SEED_NODE_ADDRESS_REQUIRED);
        }
      }
      const nodeAddress = this.delegates.getNodeAddress();
      assertCritical(nodeAddress, JOINING_ERROR_MSG.NODE_ADDRESS_REQUIRED);
      const startupMode = stryMutAct_9fa48("24877") ? this.delegates.getJoinStartupMode() : (stryCov_9fa48("24877"), this.delegates.getJoinStartupMode?.());
      const bootstrapUrl = stryMutAct_9fa48("24878") ? `` : (stryCov_9fa48("24878"), `${seedNodeAddress}${JOINING_HTTP.BOOTSTRAP_PATH}`);
      const logger = this.delegates.getLogger();
      logger.debug(JOINING_LOG_MSG.SEED_CONTACTING, stryMutAct_9fa48("24879") ? {} : (stryCov_9fa48("24879"), {
        nodeId: this.nodeId,
        bootstrapUrl
      }));
      const retryPolicy = this.resolveJoinRetryPolicy();
      const retryTimeoutMs = retryPolicy.retryTimeoutMs;
      let delayMs = retryPolicy.initialDelayMs;
      const maxDelayMs = retryPolicy.maxDelayMs;
      const backoffMultiplier = retryPolicy.backoffMultiplier;
      const now = this.delegates.getNow();
      const startTime = now();
      let attempt = 0;
      let lastBootstrapError = null;
      let lastRetryableSeedContactError = null;
      let lastRetryAfterMs = null;
      const config = this.delegates.getConfig();
      const retryableTimeoutErrorMessage = JOINING_ERROR_MSG.httpTimeout(config.httpTimeoutMs);
      const buildRetryableSeedContactError = (message, options = {}) => {
        if (stryMutAct_9fa48("24880")) {
          {}
        } else {
          stryCov_9fa48("24880");
          const retryableError = new Error(message);
          retryableError.deferRetry = stryMutAct_9fa48("24881") ? false : (stryCov_9fa48("24881"), true);
          if (stryMutAct_9fa48("24884") ? Number.isFinite(options.retryAfterMs) || options.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("24883") ? false : stryMutAct_9fa48("24882") ? true : (stryCov_9fa48("24882", "24883", "24884"), Number.isFinite(options.retryAfterMs) && (stryMutAct_9fa48("24887") ? options.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("24886") ? options.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("24885") ? true : (stryCov_9fa48("24885", "24886", "24887"), options.retryAfterMs > NUM.ZERO)))) {
            if (stryMutAct_9fa48("24888")) {
              {}
            } else {
              stryCov_9fa48("24888");
              retryableError.retryAfterMs = Math.floor(options.retryAfterMs);
            }
          }
          if (stryMutAct_9fa48("24890") ? false : stryMutAct_9fa48("24889") ? true : (stryCov_9fa48("24889", "24890"), options.parsedError)) {
            if (stryMutAct_9fa48("24891")) {
              {}
            } else {
              stryCov_9fa48("24891");
              retryableError.bootstrapResponse = options.parsedError;
            }
          }
          if (stryMutAct_9fa48("24894") ? typeof options.code === TYPEOF.STRING || options.code.length > NUM.ZERO : stryMutAct_9fa48("24893") ? false : stryMutAct_9fa48("24892") ? true : (stryCov_9fa48("24892", "24893", "24894"), (stryMutAct_9fa48("24896") ? typeof options.code !== TYPEOF.STRING : stryMutAct_9fa48("24895") ? true : (stryCov_9fa48("24895", "24896"), typeof options.code === TYPEOF.STRING)) && (stryMutAct_9fa48("24899") ? options.code.length <= NUM.ZERO : stryMutAct_9fa48("24898") ? options.code.length >= NUM.ZERO : stryMutAct_9fa48("24897") ? true : (stryCov_9fa48("24897", "24898", "24899"), options.code.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("24900")) {
              {}
            } else {
              stryCov_9fa48("24900");
              retryableError.code = options.code;
            }
          }
          return retryableError;
        }
      };
      while (stryMutAct_9fa48("24903") ? now() - startTime >= retryTimeoutMs : stryMutAct_9fa48("24902") ? now() - startTime <= retryTimeoutMs : stryMutAct_9fa48("24901") ? false : (stryCov_9fa48("24901", "24902", "24903"), (stryMutAct_9fa48("24904") ? now() + startTime : (stryCov_9fa48("24904"), now() - startTime)) < retryTimeoutMs)) {
        if (stryMutAct_9fa48("24905")) {
          {}
        } else {
          stryCov_9fa48("24905");
          stryMutAct_9fa48("24906") ? attempt -= 1 : (stryCov_9fa48("24906"), attempt += 1);
          try {
            if (stryMutAct_9fa48("24907")) {
              {}
            } else {
              stryCov_9fa48("24907");
              const httpPostImpl = this.delegates.getHttpPostImpl();
              const bootstrapRequest = stryMutAct_9fa48("24908") ? {} : (stryCov_9fa48("24908"), {
                nodeId: this.nodeId,
                nodeAddress
              });
              if (stryMutAct_9fa48("24911") ? typeof startupMode === TYPEOF.STRING || startupMode.length > NUM.ZERO : stryMutAct_9fa48("24910") ? false : stryMutAct_9fa48("24909") ? true : (stryCov_9fa48("24909", "24910", "24911"), (stryMutAct_9fa48("24913") ? typeof startupMode !== TYPEOF.STRING : stryMutAct_9fa48("24912") ? true : (stryCov_9fa48("24912", "24913"), typeof startupMode === TYPEOF.STRING)) && (stryMutAct_9fa48("24916") ? startupMode.length <= NUM.ZERO : stryMutAct_9fa48("24915") ? startupMode.length >= NUM.ZERO : stryMutAct_9fa48("24914") ? true : (stryCov_9fa48("24914", "24915", "24916"), startupMode.length > NUM.ZERO)))) {
                if (stryMutAct_9fa48("24917")) {
                  {}
                } else {
                  stryCov_9fa48("24917");
                  bootstrapRequest.startupMode = startupMode;
                }
              }
              const response = await httpPostImpl(bootstrapUrl, bootstrapRequest);
              if (stryMutAct_9fa48("24920") ? false : stryMutAct_9fa48("24919") ? true : stryMutAct_9fa48("24918") ? response.success : (stryCov_9fa48("24918", "24919", "24920"), !response.success)) {
                if (stryMutAct_9fa48("24921")) {
                  {}
                } else {
                  stryCov_9fa48("24921");
                  const bootstrapError = new Error(this.buildBootstrapFailureError(response));
                  bootstrapError.bootstrapResponse = response;
                  throw bootstrapError;
                }
              }
              this.delegates.setBootstrapResponse(response);
              this.delegates.setSeedNodeId(stryMutAct_9fa48("24924") ? response.seedNodeId && null : stryMutAct_9fa48("24923") ? false : stryMutAct_9fa48("24922") ? true : (stryCov_9fa48("24922", "24923", "24924"), response.seedNodeId || null));
              if (stryMutAct_9fa48("24927") ? !this.delegates.getSeedNodeWsAddress() || response.seedNodeWsAddress : stryMutAct_9fa48("24926") ? false : stryMutAct_9fa48("24925") ? true : (stryCov_9fa48("24925", "24926", "24927"), (stryMutAct_9fa48("24928") ? this.delegates.getSeedNodeWsAddress() : (stryCov_9fa48("24928"), !this.delegates.getSeedNodeWsAddress())) && response.seedNodeWsAddress)) {
                if (stryMutAct_9fa48("24929")) {
                  {}
                } else {
                  stryCov_9fa48("24929");
                  this.delegates.setSeedNodeWsAddress(response.seedNodeWsAddress);
                }
              }
              logger.debug(JOINING_LOG_MSG.BOOTSTRAP_RESPONSE_RECEIVED, stryMutAct_9fa48("24930") ? {} : (stryCov_9fa48("24930"), {
                nodeId: this.nodeId,
                seedNodeId: response.seedNodeId,
                strategy: stryMutAct_9fa48("24931") ? response.messageGroupAssignment.strategy : (stryCov_9fa48("24931"), response.messageGroupAssignment?.strategy)
              }));
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("24932")) {
              {}
            } else {
              stryCov_9fa48("24932");
              const classification = this.classifySeedContactFailure(error, retryableTimeoutErrorMessage);
              const parsedError = classification.parsedError;
              const elapsedMs = stryMutAct_9fa48("24933") ? now() + startTime : (stryCov_9fa48("24933"), now() - startTime);
              if (stryMutAct_9fa48("24936") ? classification.retryable || elapsedMs < retryTimeoutMs : stryMutAct_9fa48("24935") ? false : stryMutAct_9fa48("24934") ? true : (stryCov_9fa48("24934", "24935", "24936"), classification.retryable && (stryMutAct_9fa48("24939") ? elapsedMs >= retryTimeoutMs : stryMutAct_9fa48("24938") ? elapsedMs <= retryTimeoutMs : stryMutAct_9fa48("24937") ? true : (stryCov_9fa48("24937", "24938", "24939"), elapsedMs < retryTimeoutMs)))) {
                if (stryMutAct_9fa48("24940")) {
                  {}
                } else {
                  stryCov_9fa48("24940");
                  if (stryMutAct_9fa48("24942") ? false : stryMutAct_9fa48("24941") ? true : (stryCov_9fa48("24941", "24942"), classification.retryableCode)) {
                    if (stryMutAct_9fa48("24943")) {
                      {}
                    } else {
                      stryCov_9fa48("24943");
                      lastBootstrapError = parsedError;
                    }
                  }
                  if (stryMutAct_9fa48("24945") ? false : stryMutAct_9fa48("24944") ? true : (stryCov_9fa48("24944", "24945"), classification.retryableTimeout)) {
                    if (stryMutAct_9fa48("24946")) {
                      {}
                    } else {
                      stryCov_9fa48("24946");
                      lastRetryableSeedContactError = error.message;
                    }
                  }
                  const nextDelayMs = this.computeSeedContactRetryDelayMs(stryMutAct_9fa48("24947") ? {} : (stryCov_9fa48("24947"), {
                    baseDelayMs: delayMs,
                    maxDelayMs,
                    retryAfterMs: classification.retryAfterMs
                  }));
                  lastRetryAfterMs = nextDelayMs;
                  logger.debug(JOINING_LOG_MSG.SEED_CONTACT_RETRYING, stryMutAct_9fa48("24948") ? {} : (stryCov_9fa48("24948"), {
                    nodeId: this.nodeId,
                    bootstrapUrl,
                    attempt,
                    elapsedMs,
                    lastCode: classification.code,
                    lastStatusCode: classification.statusCode,
                    retryAfterMs: classification.retryAfterMs,
                    nextDelayMs,
                    retryTimeoutMs
                  }));
                  const sleep = this.delegates.getSleep();
                  await sleep(nextDelayMs);
                  delayMs = stryMutAct_9fa48("24949") ? Math.max(Math.floor(delayMs * backoffMultiplier), maxDelayMs) : (stryCov_9fa48("24949"), Math.min(Math.floor(stryMutAct_9fa48("24950") ? delayMs / backoffMultiplier : (stryCov_9fa48("24950"), delayMs * backoffMultiplier)), maxDelayMs));
                  continue;
                }
              }
              if (stryMutAct_9fa48("24952") ? false : stryMutAct_9fa48("24951") ? true : (stryCov_9fa48("24951", "24952"), classification.retryable)) {
                if (stryMutAct_9fa48("24953")) {
                  {}
                } else {
                  stryCov_9fa48("24953");
                  if (stryMutAct_9fa48("24956") ? parsedError?.code !== BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE : stryMutAct_9fa48("24955") ? false : stryMutAct_9fa48("24954") ? true : (stryCov_9fa48("24954", "24955", "24956"), (stryMutAct_9fa48("24957") ? parsedError.code : (stryCov_9fa48("24957"), parsedError?.code)) === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE)) {
                    if (stryMutAct_9fa48("24958")) {
                      {}
                    } else {
                      stryCov_9fa48("24958");
                      throw buildRetryableSeedContactError(JOINING_ERROR_MSG.leaderMetadataIncomplete(formatLeaderMetadataDetails(parsedError)), stryMutAct_9fa48("24959") ? {} : (stryCov_9fa48("24959"), {
                        retryAfterMs: lastRetryAfterMs,
                        parsedError,
                        code: classification.code
                      }));
                    }
                  }
                  if (stryMutAct_9fa48("24962") ? parsedError?.code !== BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY : stryMutAct_9fa48("24961") ? false : stryMutAct_9fa48("24960") ? true : (stryCov_9fa48("24960", "24961", "24962"), (stryMutAct_9fa48("24963") ? parsedError.code : (stryCov_9fa48("24963"), parsedError?.code)) === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY)) {
                    if (stryMutAct_9fa48("24964")) {
                      {}
                    } else {
                      stryCov_9fa48("24964");
                      throw buildRetryableSeedContactError(JOINING_ERROR_MSG.bootstrapNotReady(parsedError.phase), stryMutAct_9fa48("24965") ? {} : (stryCov_9fa48("24965"), {
                        retryAfterMs: lastRetryAfterMs,
                        parsedError,
                        code: classification.code
                      }));
                    }
                  }
                  throw buildRetryableSeedContactError(JOINING_ERROR_MSG.contactSeedFailed(error.message), stryMutAct_9fa48("24966") ? {} : (stryCov_9fa48("24966"), {
                    retryAfterMs: lastRetryAfterMs,
                    parsedError
                  }));
                }
              }
              if (stryMutAct_9fa48("24968") ? false : stryMutAct_9fa48("24967") ? true : (stryCov_9fa48("24967", "24968"), classification.terminalValidationOrConflict)) {
                if (stryMutAct_9fa48("24969")) {
                  {}
                } else {
                  stryCov_9fa48("24969");
                  logger.warn(JOINING_LOG_MSG.SEED_CONTACT_TERMINAL, stryMutAct_9fa48("24970") ? {} : (stryCov_9fa48("24970"), {
                    nodeId: this.nodeId,
                    bootstrapUrl,
                    attempt,
                    elapsedMs,
                    statusCode: classification.statusCode,
                    code: classification.code,
                    error: error.message
                  }));
                }
              }
              if (stryMutAct_9fa48("24972") ? false : stryMutAct_9fa48("24971") ? true : (stryCov_9fa48("24971", "24972"), parsedError)) {
                if (stryMutAct_9fa48("24973")) {
                  {}
                } else {
                  stryCov_9fa48("24973");
                  if (stryMutAct_9fa48("24976") ? parsedError.code !== BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE : stryMutAct_9fa48("24975") ? false : stryMutAct_9fa48("24974") ? true : (stryCov_9fa48("24974", "24975", "24976"), parsedError.code === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE)) {
                    if (stryMutAct_9fa48("24977")) {
                      {}
                    } else {
                      stryCov_9fa48("24977");
                      throw new Error(JOINING_ERROR_MSG.leaderMetadataIncomplete(formatLeaderMetadataDetails(parsedError)));
                    }
                  }
                  if (stryMutAct_9fa48("24980") ? parsedError.code !== BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY : stryMutAct_9fa48("24979") ? false : stryMutAct_9fa48("24978") ? true : (stryCov_9fa48("24978", "24979", "24980"), parsedError.code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY)) {
                    if (stryMutAct_9fa48("24981")) {
                      {}
                    } else {
                      stryCov_9fa48("24981");
                      throw new Error(JOINING_ERROR_MSG.bootstrapNotReady(parsedError.phase));
                    }
                  }
                }
              }
              logger.error(JOINING_LOG_MSG.SEED_CONTACT_FAILED, stryMutAct_9fa48("24982") ? {} : (stryCov_9fa48("24982"), {
                nodeId: this.nodeId,
                bootstrapUrl,
                error: error.message
              }));
              throw new Error(JOINING_ERROR_MSG.contactSeedFailed(error.message));
            }
          }
        }
      }
      if (stryMutAct_9fa48("24985") ? lastBootstrapError?.code !== BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE : stryMutAct_9fa48("24984") ? false : stryMutAct_9fa48("24983") ? true : (stryCov_9fa48("24983", "24984", "24985"), (stryMutAct_9fa48("24986") ? lastBootstrapError.code : (stryCov_9fa48("24986"), lastBootstrapError?.code)) === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE)) {
        if (stryMutAct_9fa48("24987")) {
          {}
        } else {
          stryCov_9fa48("24987");
          throw buildRetryableSeedContactError(JOINING_ERROR_MSG.leaderMetadataIncomplete(formatLeaderMetadataDetails(lastBootstrapError)), stryMutAct_9fa48("24988") ? {} : (stryCov_9fa48("24988"), {
            retryAfterMs: lastRetryAfterMs,
            parsedError: lastBootstrapError,
            code: lastBootstrapError.code
          }));
        }
      }
      if (stryMutAct_9fa48("24991") ? lastBootstrapError?.code !== BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY : stryMutAct_9fa48("24990") ? false : stryMutAct_9fa48("24989") ? true : (stryCov_9fa48("24989", "24990", "24991"), (stryMutAct_9fa48("24992") ? lastBootstrapError.code : (stryCov_9fa48("24992"), lastBootstrapError?.code)) === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY)) {
        if (stryMutAct_9fa48("24993")) {
          {}
        } else {
          stryCov_9fa48("24993");
          throw buildRetryableSeedContactError(JOINING_ERROR_MSG.bootstrapNotReady(lastBootstrapError.phase), stryMutAct_9fa48("24994") ? {} : (stryCov_9fa48("24994"), {
            retryAfterMs: lastRetryAfterMs,
            parsedError: lastBootstrapError,
            code: lastBootstrapError.code
          }));
        }
      }
      if (stryMutAct_9fa48("24996") ? false : stryMutAct_9fa48("24995") ? true : (stryCov_9fa48("24995", "24996"), lastRetryableSeedContactError)) {
        if (stryMutAct_9fa48("24997")) {
          {}
        } else {
          stryCov_9fa48("24997");
          throw buildRetryableSeedContactError(JOINING_ERROR_MSG.contactSeedFailed(lastRetryableSeedContactError), stryMutAct_9fa48("24998") ? {} : (stryCov_9fa48("24998"), {
            retryAfterMs: lastRetryAfterMs
          }));
        }
      }
      throw new Error(JOINING_ERROR_MSG.contactSeedFailed(SEED_READINESS_TIMEOUT_MSG(retryTimeoutMs)));
    }
  }

  /**
   * Resolve bounded retry policy for join-time HTTP operations.
   * @return {Object}
   */
  resolveJoinRetryPolicy() {
    if (stryMutAct_9fa48("24999")) {
      {}
    } else {
      stryCov_9fa48("24999");
      const config = this.delegates.getConfig();
      const retryTimeoutMs = Number.isFinite(config.leadershipWaitTimeoutMs) ? stryMutAct_9fa48("25000") ? Math.min(config.leadershipWaitTimeoutMs, config.httpTimeoutMs) : (stryCov_9fa48("25000"), Math.max(config.leadershipWaitTimeoutMs, config.httpTimeoutMs)) : config.httpTimeoutMs;
      const initialDelayMs = Number.isFinite(config.leadershipWaitInitialDelayMs) ? stryMutAct_9fa48("25001") ? Math.min(NUM.TEN, config.leadershipWaitInitialDelayMs) : (stryCov_9fa48("25001"), Math.max(NUM.TEN, config.leadershipWaitInitialDelayMs)) : NUM.HUNDRED;
      const maxDelayMs = Number.isFinite(config.leadershipWaitMaxDelayMs) ? stryMutAct_9fa48("25002") ? Math.min(initialDelayMs, config.leadershipWaitMaxDelayMs) : (stryCov_9fa48("25002"), Math.max(initialDelayMs, config.leadershipWaitMaxDelayMs)) : initialDelayMs;
      const backoffMultiplier = (stryMutAct_9fa48("25005") ? Number.isFinite(config.leadershipWaitBackoffMultiplier) || config.leadershipWaitBackoffMultiplier > NUM.ONE : stryMutAct_9fa48("25004") ? false : stryMutAct_9fa48("25003") ? true : (stryCov_9fa48("25003", "25004", "25005"), Number.isFinite(config.leadershipWaitBackoffMultiplier) && (stryMutAct_9fa48("25008") ? config.leadershipWaitBackoffMultiplier <= NUM.ONE : stryMutAct_9fa48("25007") ? config.leadershipWaitBackoffMultiplier >= NUM.ONE : stryMutAct_9fa48("25006") ? true : (stryCov_9fa48("25006", "25007", "25008"), config.leadershipWaitBackoffMultiplier > NUM.ONE)))) ? config.leadershipWaitBackoffMultiplier : NUM.TWO;
      return stryMutAct_9fa48("25009") ? {} : (stryCov_9fa48("25009"), {
        retryTimeoutMs,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier
      });
    }
  }

  /**
   * Classify one seed contact failure for retry/backoff behavior.
   * @param {Error} error
   * @param {string} retryableTimeoutErrorMessage
   * @return {Object}
   */
  classifySeedContactFailure(error, retryableTimeoutErrorMessage) {
    if (stryMutAct_9fa48("25010")) {
      {}
    } else {
      stryCov_9fa48("25010");
      const parsedError = stryMutAct_9fa48("25013") ? error.bootstrapResponse && parseBootstrapError(error) : stryMutAct_9fa48("25012") ? false : stryMutAct_9fa48("25011") ? true : (stryCov_9fa48("25011", "25012", "25013"), error.bootstrapResponse || parseBootstrapError(error));
      const statusCode = Number.isFinite(stryMutAct_9fa48("25014") ? error.statusCode : (stryCov_9fa48("25014"), error?.statusCode)) ? Math.floor(error.statusCode) : Number.isFinite(stryMutAct_9fa48("25015") ? parsedError.statusCode : (stryCov_9fa48("25015"), parsedError?.statusCode)) ? Math.floor(parsedError.statusCode) : null;
      const code = (stryMutAct_9fa48("25018") ? typeof parsedError?.code !== TYPEOF.STRING : stryMutAct_9fa48("25017") ? false : stryMutAct_9fa48("25016") ? true : (stryCov_9fa48("25016", "25017", "25018"), typeof (stryMutAct_9fa48("25019") ? parsedError.code : (stryCov_9fa48("25019"), parsedError?.code)) === TYPEOF.STRING)) ? parsedError.code : null;
      const retryableCode = stryMutAct_9fa48("25022") ? (code === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE || code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) && code === BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT : stryMutAct_9fa48("25021") ? false : stryMutAct_9fa48("25020") ? true : (stryCov_9fa48("25020", "25021", "25022"), (stryMutAct_9fa48("25024") ? code === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE && code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY : stryMutAct_9fa48("25023") ? false : (stryCov_9fa48("25023", "25024"), (stryMutAct_9fa48("25026") ? code !== BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE : stryMutAct_9fa48("25025") ? false : (stryCov_9fa48("25025", "25026"), code === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE)) || (stryMutAct_9fa48("25028") ? code !== BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY : stryMutAct_9fa48("25027") ? false : (stryCov_9fa48("25027", "25028"), code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY)))) || (stryMutAct_9fa48("25030") ? code !== BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT : stryMutAct_9fa48("25029") ? false : (stryCov_9fa48("25029", "25030"), code === BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT)));
      const retryableTimeout = stryMutAct_9fa48("25033") ? error?.message !== retryableTimeoutErrorMessage : stryMutAct_9fa48("25032") ? false : stryMutAct_9fa48("25031") ? true : (stryCov_9fa48("25031", "25032", "25033"), (stryMutAct_9fa48("25034") ? error.message : (stryCov_9fa48("25034"), error?.message)) === retryableTimeoutErrorMessage);
      const retryableStatus = stryMutAct_9fa48("25037") ? statusCode !== HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("25036") ? false : stryMutAct_9fa48("25035") ? true : (stryCov_9fa48("25035", "25036", "25037"), statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE);
      const terminalValidationOrConflict = stryMutAct_9fa48("25040") ? statusCode === HTTP_STATUS.BAD_REQUEST && statusCode === HTTP_STATUS.CONFLICT : stryMutAct_9fa48("25039") ? false : stryMutAct_9fa48("25038") ? true : (stryCov_9fa48("25038", "25039", "25040"), (stryMutAct_9fa48("25042") ? statusCode !== HTTP_STATUS.BAD_REQUEST : stryMutAct_9fa48("25041") ? false : (stryCov_9fa48("25041", "25042"), statusCode === HTTP_STATUS.BAD_REQUEST)) || (stryMutAct_9fa48("25044") ? statusCode !== HTTP_STATUS.CONFLICT : stryMutAct_9fa48("25043") ? false : (stryCov_9fa48("25043", "25044"), statusCode === HTTP_STATUS.CONFLICT)));
      return stryMutAct_9fa48("25045") ? {} : (stryCov_9fa48("25045"), {
        parsedError,
        statusCode,
        code,
        retryAfterMs: resolveSeedContactRetryAfterMs(error, parsedError),
        retryableCode,
        retryableTimeout,
        retryableStatus,
        retryable: stryMutAct_9fa48("25048") ? (retryableCode || retryableTimeout) && retryableStatus : stryMutAct_9fa48("25047") ? false : stryMutAct_9fa48("25046") ? true : (stryCov_9fa48("25046", "25047", "25048"), (stryMutAct_9fa48("25050") ? retryableCode && retryableTimeout : stryMutAct_9fa48("25049") ? false : (stryCov_9fa48("25049", "25050"), retryableCode || retryableTimeout)) || retryableStatus),
        terminalValidationOrConflict
      });
    }
  }

  /**
   * Compute retry delay using bootstrap hints + bounded jitter.
   * @param {Object} options
   * @param {number} options.baseDelayMs
   * @param {number} options.maxDelayMs
   * @param {number|null} options.retryAfterMs
   * @return {number}
   */
  computeSeedContactRetryDelayMs(options = {}) {
    if (stryMutAct_9fa48("25051")) {
      {}
    } else {
      stryCov_9fa48("25051");
      const baseDelayMs = stryMutAct_9fa48("25052") ? Math.min(NUM.ONE, Number(options.baseDelayMs) || NUM.ZERO) : (stryCov_9fa48("25052"), Math.max(NUM.ONE, stryMutAct_9fa48("25055") ? Number(options.baseDelayMs) && NUM.ZERO : stryMutAct_9fa48("25054") ? false : stryMutAct_9fa48("25053") ? true : (stryCov_9fa48("25053", "25054", "25055"), Number(options.baseDelayMs) || NUM.ZERO)));
      const maxDelayMs = stryMutAct_9fa48("25056") ? Math.min(baseDelayMs, Number(options.maxDelayMs) || baseDelayMs) : (stryCov_9fa48("25056"), Math.max(baseDelayMs, stryMutAct_9fa48("25059") ? Number(options.maxDelayMs) && baseDelayMs : stryMutAct_9fa48("25058") ? false : stryMutAct_9fa48("25057") ? true : (stryCov_9fa48("25057", "25058", "25059"), Number(options.maxDelayMs) || baseDelayMs)));
      const retryAfterMs = Number.isFinite(options.retryAfterMs) ? stryMutAct_9fa48("25060") ? Math.min(NUM.ZERO, Math.floor(options.retryAfterMs)) : (stryCov_9fa48("25060"), Math.max(NUM.ZERO, Math.floor(options.retryAfterMs))) : null;
      const candidateDelayMs = (stryMutAct_9fa48("25063") ? retryAfterMs !== null : stryMutAct_9fa48("25062") ? false : stryMutAct_9fa48("25061") ? true : (stryCov_9fa48("25061", "25062", "25063"), retryAfterMs === null)) ? baseDelayMs : stryMutAct_9fa48("25064") ? Math.max(maxDelayMs, Math.max(baseDelayMs, retryAfterMs)) : (stryCov_9fa48("25064"), Math.min(maxDelayMs, stryMutAct_9fa48("25065") ? Math.min(baseDelayMs, retryAfterMs) : (stryCov_9fa48("25065"), Math.max(baseDelayMs, retryAfterMs))));
      const jitteredDelayMs = this.applySeedContactRetryJitter(candidateDelayMs, maxDelayMs);
      if (stryMutAct_9fa48("25068") ? retryAfterMs !== null : stryMutAct_9fa48("25067") ? false : stryMutAct_9fa48("25066") ? true : (stryCov_9fa48("25066", "25067", "25068"), retryAfterMs === null)) {
        if (stryMutAct_9fa48("25069")) {
          {}
        } else {
          stryCov_9fa48("25069");
          return jitteredDelayMs;
        }
      }
      return stryMutAct_9fa48("25070") ? Math.min(retryAfterMs, jitteredDelayMs) : (stryCov_9fa48("25070"), Math.max(retryAfterMs, jitteredDelayMs));
    }
  }

  /**
   * Apply bounded symmetric jitter to one retry delay.
   * @param {number} delayMs
   * @param {number} maxDelayMs
   * @return {number}
   */
  applySeedContactRetryJitter(delayMs, maxDelayMs) {
    if (stryMutAct_9fa48("25071")) {
      {}
    } else {
      stryCov_9fa48("25071");
      const config = this.delegates.getConfig();
      const random = this.delegates.getRandom();
      const jitterRatio = Number.isFinite(config.leadershipWaitJitterRatio) ? config.leadershipWaitJitterRatio : JOINING_DEFAULT.leadershipWaitJitterRatio;
      if (stryMutAct_9fa48("25075") ? jitterRatio > NUM.ZERO : stryMutAct_9fa48("25074") ? jitterRatio < NUM.ZERO : stryMutAct_9fa48("25073") ? false : stryMutAct_9fa48("25072") ? true : (stryCov_9fa48("25072", "25073", "25074", "25075"), jitterRatio <= NUM.ZERO)) {
        if (stryMutAct_9fa48("25076")) {
          {}
        } else {
          stryCov_9fa48("25076");
          return stryMutAct_9fa48("25077") ? Math.max(maxDelayMs, Math.max(NUM.ONE, Math.floor(delayMs))) : (stryCov_9fa48("25077"), Math.min(maxDelayMs, stryMutAct_9fa48("25078") ? Math.min(NUM.ONE, Math.floor(delayMs)) : (stryCov_9fa48("25078"), Math.max(NUM.ONE, Math.floor(delayMs)))));
        }
      }
      const jitterRangeMs = stryMutAct_9fa48("25079") ? delayMs / jitterRatio : (stryCov_9fa48("25079"), delayMs * jitterRatio);
      const centeredRandom = stryMutAct_9fa48("25080") ? random() * NUM.TWO + NUM.ONE : (stryCov_9fa48("25080"), (stryMutAct_9fa48("25081") ? random() / NUM.TWO : (stryCov_9fa48("25081"), random() * NUM.TWO)) - NUM.ONE);
      const jitterOffsetMs = Math.round(stryMutAct_9fa48("25082") ? centeredRandom / jitterRangeMs : (stryCov_9fa48("25082"), centeredRandom * jitterRangeMs));
      return stryMutAct_9fa48("25083") ? Math.max(maxDelayMs, Math.max(NUM.ONE, Math.floor(delayMs + jitterOffsetMs))) : (stryCov_9fa48("25083"), Math.min(maxDelayMs, stryMutAct_9fa48("25084") ? Math.min(NUM.ONE, Math.floor(delayMs + jitterOffsetMs)) : (stryCov_9fa48("25084"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("25085") ? delayMs - jitterOffsetMs : (stryCov_9fa48("25085"), delayMs + jitterOffsetMs))))));
    }
  }

  /**
   * Build a consistent error message for bootstrap failures.
   * @param {Object} response
   * @return {string}
   */
  buildBootstrapFailureError(response) {
    if (stryMutAct_9fa48("25086")) {
      {}
    } else {
      stryCov_9fa48("25086");
      if (stryMutAct_9fa48("25089") ? response?.code !== BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE : stryMutAct_9fa48("25088") ? false : stryMutAct_9fa48("25087") ? true : (stryCov_9fa48("25087", "25088", "25089"), (stryMutAct_9fa48("25090") ? response.code : (stryCov_9fa48("25090"), response?.code)) === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE)) {
        if (stryMutAct_9fa48("25091")) {
          {}
        } else {
          stryCov_9fa48("25091");
          return JOINING_ERROR_MSG.leaderMetadataIncomplete(formatLeaderMetadataDetails(response));
        }
      }
      if (stryMutAct_9fa48("25094") ? response?.code !== BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY : stryMutAct_9fa48("25093") ? false : stryMutAct_9fa48("25092") ? true : (stryCov_9fa48("25092", "25093", "25094"), (stryMutAct_9fa48("25095") ? response.code : (stryCov_9fa48("25095"), response?.code)) === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY)) {
        if (stryMutAct_9fa48("25096")) {
          {}
        } else {
          stryCov_9fa48("25096");
          return JOINING_ERROR_MSG.bootstrapNotReady(response.phase);
        }
      }
      return stryMutAct_9fa48("25099") ? response?.error && JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED : stryMutAct_9fa48("25098") ? false : stryMutAct_9fa48("25097") ? true : (stryCov_9fa48("25097", "25098", "25099"), (stryMutAct_9fa48("25100") ? response.error : (stryCov_9fa48("25100"), response?.error)) || JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED);
    }
  }
}

/**
 * Resolve retry hint (ms) from parsed body and transport metadata.
 * Pure function — no instance state needed.
 * @param {Error} error
 * @param {Object|null} parsedError
 * @return {number|null}
 */
function resolveSeedContactRetryAfterMs(error, parsedError) {
  if (stryMutAct_9fa48("25101")) {
    {}
  } else {
    stryCov_9fa48("25101");
    const hintCandidates = stryMutAct_9fa48("25102") ? [] : (stryCov_9fa48("25102"), [stryMutAct_9fa48("25103") ? error.retryAfterMs : (stryCov_9fa48("25103"), error?.retryAfterMs), stryMutAct_9fa48("25104") ? parsedError.retryAfterMs : (stryCov_9fa48("25104"), parsedError?.retryAfterMs), stryMutAct_9fa48("25105") ? parsedError.retry_after_ms : (stryCov_9fa48("25105"), parsedError?.retry_after_ms)]);
    for (const hint of hintCandidates) {
      if (stryMutAct_9fa48("25106")) {
        {}
      } else {
        stryCov_9fa48("25106");
        if (stryMutAct_9fa48("25109") ? false : stryMutAct_9fa48("25108") ? true : stryMutAct_9fa48("25107") ? Number.isFinite(hint) : (stryCov_9fa48("25107", "25108", "25109"), !Number.isFinite(hint))) {
          if (stryMutAct_9fa48("25110")) {
            {}
          } else {
            stryCov_9fa48("25110");
            continue;
          }
        }
        return stryMutAct_9fa48("25111") ? Math.min(NUM.ZERO, Math.floor(hint)) : (stryCov_9fa48("25111"), Math.max(NUM.ZERO, Math.floor(hint)));
      }
    }
    return null;
  }
}

/**
 * Parse bootstrap HTTP error bodies from the default HTTP client.
 * Pure function — no instance state needed.
 * @param {Error} error
 * @return {Object|null}
 */
function parseBootstrapError(error) {
  if (stryMutAct_9fa48("25112")) {
    {}
  } else {
    stryCov_9fa48("25112");
    if (stryMutAct_9fa48("25115") ? false : stryMutAct_9fa48("25114") ? true : stryMutAct_9fa48("25113") ? error : (stryCov_9fa48("25113", "25114", "25115"), !error)) {
      if (stryMutAct_9fa48("25116")) {
        {}
      } else {
        stryCov_9fa48("25116");
        return null;
      }
    }
    if (stryMutAct_9fa48("25119") ? error.responseJson || typeof error.responseJson === TYPEOF.OBJECT : stryMutAct_9fa48("25118") ? false : stryMutAct_9fa48("25117") ? true : (stryCov_9fa48("25117", "25118", "25119"), error.responseJson && (stryMutAct_9fa48("25121") ? typeof error.responseJson !== TYPEOF.OBJECT : stryMutAct_9fa48("25120") ? true : (stryCov_9fa48("25120", "25121"), typeof error.responseJson === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("25122")) {
        {}
      } else {
        stryCov_9fa48("25122");
        const parsedFromJson = stryMutAct_9fa48("25123") ? {} : (stryCov_9fa48("25123"), {
          ...error.responseJson
        });
        if (stryMutAct_9fa48("25126") ? Number.isFinite(error.statusCode) || !Number.isFinite(parsedFromJson.statusCode) : stryMutAct_9fa48("25125") ? false : stryMutAct_9fa48("25124") ? true : (stryCov_9fa48("25124", "25125", "25126"), Number.isFinite(error.statusCode) && (stryMutAct_9fa48("25127") ? Number.isFinite(parsedFromJson.statusCode) : (stryCov_9fa48("25127"), !Number.isFinite(parsedFromJson.statusCode))))) {
          if (stryMutAct_9fa48("25128")) {
            {}
          } else {
            stryCov_9fa48("25128");
            parsedFromJson.statusCode = Math.floor(error.statusCode);
          }
        }
        if (stryMutAct_9fa48("25131") ? Number.isFinite(error.retryAfterMs) || !Number.isFinite(parsedFromJson.retryAfterMs) : stryMutAct_9fa48("25130") ? false : stryMutAct_9fa48("25129") ? true : (stryCov_9fa48("25129", "25130", "25131"), Number.isFinite(error.retryAfterMs) && (stryMutAct_9fa48("25132") ? Number.isFinite(parsedFromJson.retryAfterMs) : (stryCov_9fa48("25132"), !Number.isFinite(parsedFromJson.retryAfterMs))))) {
          if (stryMutAct_9fa48("25133")) {
            {}
          } else {
            stryCov_9fa48("25133");
            parsedFromJson.retryAfterMs = Math.floor(error.retryAfterMs);
          }
        }
        return parsedFromJson;
      }
    }
    if (stryMutAct_9fa48("25136") ? typeof error.message === TYPEOF.STRING : stryMutAct_9fa48("25135") ? false : stryMutAct_9fa48("25134") ? true : (stryCov_9fa48("25134", "25135", "25136"), typeof error.message !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("25137")) {
        {}
      } else {
        stryCov_9fa48("25137");
        return null;
      }
    }
    const match = error.message.match(HTTP_ERROR_MESSAGE_PATTERN);
    if (stryMutAct_9fa48("25140") ? false : stryMutAct_9fa48("25139") ? true : stryMutAct_9fa48("25138") ? match : (stryCov_9fa48("25138", "25139", "25140"), !match)) {
      if (stryMutAct_9fa48("25141")) {
        {}
      } else {
        stryCov_9fa48("25141");
        return null;
      }
    }
    const statusCode = Number.parseInt(match[1], 10);
    try {
      if (stryMutAct_9fa48("25142")) {
        {}
      } else {
        stryCov_9fa48("25142");
        const parsed = JSON.parse(match[2]);
        if (stryMutAct_9fa48("25145") ? Number.isFinite(statusCode) || !Number.isFinite(parsed.statusCode) : stryMutAct_9fa48("25144") ? false : stryMutAct_9fa48("25143") ? true : (stryCov_9fa48("25143", "25144", "25145"), Number.isFinite(statusCode) && (stryMutAct_9fa48("25146") ? Number.isFinite(parsed.statusCode) : (stryCov_9fa48("25146"), !Number.isFinite(parsed.statusCode))))) {
          if (stryMutAct_9fa48("25147")) {
            {}
          } else {
            stryCov_9fa48("25147");
            parsed.statusCode = statusCode;
          }
        }
        return parsed;
      }
    } catch (_parseError) {
      if (stryMutAct_9fa48("25148")) {
        {}
      } else {
        stryCov_9fa48("25148");
        if (stryMutAct_9fa48("25151") ? false : stryMutAct_9fa48("25150") ? true : stryMutAct_9fa48("25149") ? Number.isFinite(statusCode) : (stryCov_9fa48("25149", "25150", "25151"), !Number.isFinite(statusCode))) {
          if (stryMutAct_9fa48("25152")) {
            {}
          } else {
            stryCov_9fa48("25152");
            return null;
          }
        }
        return stryMutAct_9fa48("25153") ? {} : (stryCov_9fa48("25153"), {
          statusCode
        });
      }
    }
  }
}

/**
 * Format leader metadata details for error reporting.
 * Pure function — no instance state needed.
 * @param {Object} details
 * @return {string}
 */
function formatLeaderMetadataDetails(details) {
  if (stryMutAct_9fa48("25154")) {
    {}
  } else {
    stryCov_9fa48("25154");
    const parts = stryMutAct_9fa48("25155") ? ["Stryker was here"] : (stryCov_9fa48("25155"), []);
    if (stryMutAct_9fa48("25158") ? Array.isArray(details.missingPartitionLeaders) || details.missingPartitionLeaders.length > NUM.ZERO : stryMutAct_9fa48("25157") ? false : stryMutAct_9fa48("25156") ? true : (stryCov_9fa48("25156", "25157", "25158"), Array.isArray(details.missingPartitionLeaders) && (stryMutAct_9fa48("25161") ? details.missingPartitionLeaders.length <= NUM.ZERO : stryMutAct_9fa48("25160") ? details.missingPartitionLeaders.length >= NUM.ZERO : stryMutAct_9fa48("25159") ? true : (stryCov_9fa48("25159", "25160", "25161"), details.missingPartitionLeaders.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("25162")) {
        {}
      } else {
        stryCov_9fa48("25162");
        parts.push((stryMutAct_9fa48("25163") ? "" : (stryCov_9fa48("25163"), 'missingPartitionLeaders=')) + details.missingPartitionLeaders.join(stryMutAct_9fa48("25164") ? "" : (stryCov_9fa48("25164"), ',')));
      }
    }
    if (stryMutAct_9fa48("25167") ? Array.isArray(details.missingMessageGroupLeaders) || details.missingMessageGroupLeaders.length > NUM.ZERO : stryMutAct_9fa48("25166") ? false : stryMutAct_9fa48("25165") ? true : (stryCov_9fa48("25165", "25166", "25167"), Array.isArray(details.missingMessageGroupLeaders) && (stryMutAct_9fa48("25170") ? details.missingMessageGroupLeaders.length <= NUM.ZERO : stryMutAct_9fa48("25169") ? details.missingMessageGroupLeaders.length >= NUM.ZERO : stryMutAct_9fa48("25168") ? true : (stryCov_9fa48("25168", "25169", "25170"), details.missingMessageGroupLeaders.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("25171")) {
        {}
      } else {
        stryCov_9fa48("25171");
        parts.push((stryMutAct_9fa48("25172") ? "" : (stryCov_9fa48("25172"), 'missingMessageGroupLeaders=')) + details.missingMessageGroupLeaders.join(stryMutAct_9fa48("25173") ? "" : (stryCov_9fa48("25173"), ',')));
      }
    }
    if (stryMutAct_9fa48("25176") ? Array.isArray(details.missingPartitionLeaderNodes) || details.missingPartitionLeaderNodes.length > NUM.ZERO : stryMutAct_9fa48("25175") ? false : stryMutAct_9fa48("25174") ? true : (stryCov_9fa48("25174", "25175", "25176"), Array.isArray(details.missingPartitionLeaderNodes) && (stryMutAct_9fa48("25179") ? details.missingPartitionLeaderNodes.length <= NUM.ZERO : stryMutAct_9fa48("25178") ? details.missingPartitionLeaderNodes.length >= NUM.ZERO : stryMutAct_9fa48("25177") ? true : (stryCov_9fa48("25177", "25178", "25179"), details.missingPartitionLeaderNodes.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("25180")) {
        {}
      } else {
        stryCov_9fa48("25180");
        parts.push((stryMutAct_9fa48("25181") ? "" : (stryCov_9fa48("25181"), 'missingPartitionLeaderNodes=')) + details.missingPartitionLeaderNodes.join(stryMutAct_9fa48("25182") ? "" : (stryCov_9fa48("25182"), ',')));
      }
    }
    if (stryMutAct_9fa48("25185") ? Array.isArray(details.missingMessageGroupLeaderNodes) || details.missingMessageGroupLeaderNodes.length > NUM.ZERO : stryMutAct_9fa48("25184") ? false : stryMutAct_9fa48("25183") ? true : (stryCov_9fa48("25183", "25184", "25185"), Array.isArray(details.missingMessageGroupLeaderNodes) && (stryMutAct_9fa48("25188") ? details.missingMessageGroupLeaderNodes.length <= NUM.ZERO : stryMutAct_9fa48("25187") ? details.missingMessageGroupLeaderNodes.length >= NUM.ZERO : stryMutAct_9fa48("25186") ? true : (stryCov_9fa48("25186", "25187", "25188"), details.missingMessageGroupLeaderNodes.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("25189")) {
        {}
      } else {
        stryCov_9fa48("25189");
        parts.push((stryMutAct_9fa48("25190") ? "" : (stryCov_9fa48("25190"), 'missingMessageGroupLeaderNodes=')) + details.missingMessageGroupLeaderNodes.join(stryMutAct_9fa48("25191") ? "" : (stryCov_9fa48("25191"), ',')));
      }
    }
    return (stryMutAct_9fa48("25195") ? parts.length <= NUM.ZERO : stryMutAct_9fa48("25194") ? parts.length >= NUM.ZERO : stryMutAct_9fa48("25193") ? false : stryMutAct_9fa48("25192") ? true : (stryCov_9fa48("25192", "25193", "25194", "25195"), parts.length > NUM.ZERO)) ? parts.join(stryMutAct_9fa48("25196") ? "" : (stryCov_9fa48("25196"), ' ')) : STRING.UNKNOWN;
  }
}
export { ContactSeedPhase, parseBootstrapError, formatLeaderMetadataDetails, resolveSeedContactRetryAfterMs };