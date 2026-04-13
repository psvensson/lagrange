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
import LifeRaft from './liferaft.js';
import { NUM, TYPEOF } from '../constants/index.js';
const LIFERAFT_PROVIDER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("127286") ? {} : (stryCov_9fa48("127286"), {
  MISSING_COMMAND_API: stryMutAct_9fa48("127287") ? "" : (stryCov_9fa48("127287"), 'raft node does not support command()'),
  MISSING_FORWARD_HANDLER: stryMutAct_9fa48("127288") ? "" : (stryCov_9fa48("127288"), 'proposeWithLeaderRouting requires forwardToLeader() when not leader'),
  PROPOSE_TIMEOUT: stryMutAct_9fa48("127289") ? "" : (stryCov_9fa48("127289"), 'raft command timed out')
}));
const LIFERAFT_ROUTE_MODE = Object.freeze(stryMutAct_9fa48("127290") ? {} : (stryCov_9fa48("127290"), {
  PROPOSE: stryMutAct_9fa48("127291") ? "" : (stryCov_9fa48("127291"), 'propose'),
  FORWARD: stryMutAct_9fa48("127292") ? "" : (stryCov_9fa48("127292"), 'forward')
}));
const LIFERAFT_PROPOSE_TIMEOUT_DEFAULT_MS = 1200;
function resolveProposeTimeoutMs(options = {}) {
  if (stryMutAct_9fa48("127293")) {
    {}
  } else {
    stryCov_9fa48("127293");
    const timeoutMs = (stryMutAct_9fa48("127296") ? Number.isFinite(options.proposeTimeoutMs) || options.proposeTimeoutMs > NUM.ZERO : stryMutAct_9fa48("127295") ? false : stryMutAct_9fa48("127294") ? true : (stryCov_9fa48("127294", "127295", "127296"), Number.isFinite(options.proposeTimeoutMs) && (stryMutAct_9fa48("127299") ? options.proposeTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("127298") ? options.proposeTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("127297") ? true : (stryCov_9fa48("127297", "127298", "127299"), options.proposeTimeoutMs > NUM.ZERO)))) ? Math.floor(options.proposeTimeoutMs) : LIFERAFT_PROPOSE_TIMEOUT_DEFAULT_MS;
    return timeoutMs;
  }
}
function awaitWithTimeout(promise, timeoutMs, timeoutMessage) {
  if (stryMutAct_9fa48("127300")) {
    {}
  } else {
    stryCov_9fa48("127300");
    if (stryMutAct_9fa48("127303") ? !Number.isFinite(timeoutMs) && timeoutMs <= NUM.ZERO : stryMutAct_9fa48("127302") ? false : stryMutAct_9fa48("127301") ? true : (stryCov_9fa48("127301", "127302", "127303"), (stryMutAct_9fa48("127304") ? Number.isFinite(timeoutMs) : (stryCov_9fa48("127304"), !Number.isFinite(timeoutMs))) || (stryMutAct_9fa48("127307") ? timeoutMs > NUM.ZERO : stryMutAct_9fa48("127306") ? timeoutMs < NUM.ZERO : stryMutAct_9fa48("127305") ? false : (stryCov_9fa48("127305", "127306", "127307"), timeoutMs <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("127308")) {
        {}
      } else {
        stryCov_9fa48("127308");
        return Promise.resolve(promise);
      }
    }
    return new Promise((resolve, reject) => {
      if (stryMutAct_9fa48("127309")) {
        {}
      } else {
        stryCov_9fa48("127309");
        const timeoutHandle = setTimeout(() => {
          if (stryMutAct_9fa48("127310")) {
            {}
          } else {
            stryCov_9fa48("127310");
            reject(new Error(timeoutMessage));
          }
        }, timeoutMs);
        Promise.resolve(promise).then(value => {
          if (stryMutAct_9fa48("127311")) {
            {}
          } else {
            stryCov_9fa48("127311");
            clearTimeout(timeoutHandle);
            resolve(value);
          }
        }).catch(error => {
          if (stryMutAct_9fa48("127312")) {
            {}
          } else {
            stryCov_9fa48("127312");
            clearTimeout(timeoutHandle);
            reject(error);
          }
        });
      }
    });
  }
}

/**
 * Liferaft-backed provider implementation for Raft node creation.
 */
class LiferaftProvider {
  /**
   * @param {Object} context
   * @param {boolean} context.deferElection
   * @param {Object} context.logger
   * @param {string} context.replicaId
   * @param {Function} context.resolvePeerAddress
   * @param {Function} context.deliverPacket
   * @return {Function}
   */
  createNodeClass(context) {
    if (stryMutAct_9fa48("127313")) {
      {}
    } else {
      stryCov_9fa48("127313");
      const resolvePeerAddress = context.resolvePeerAddress;
      const deliverPacket = context.deliverPacket;
      class ProviderRaftNode extends LifeRaft {
        /**
         * @param {*} _options
         * @param {Function} callback
         */
        initialize(_options, callback) {
          if (stryMutAct_9fa48("127314")) {
            {}
          } else {
            stryCov_9fa48("127314");
            if (stryMutAct_9fa48("127316") ? false : stryMutAct_9fa48("127315") ? true : (stryCov_9fa48("127315", "127316"), callback)) {
              if (stryMutAct_9fa48("127317")) {
                {}
              } else {
                stryCov_9fa48("127317");
                callback();
              }
            }
          }
        }

        /**
         * @param {Object} packet
         * @param {Function} callback
         */
        write(packet, callback) {
          if (stryMutAct_9fa48("127318")) {
            {}
          } else {
            stryCov_9fa48("127318");
            const peerAddress = resolvePeerAddress(this.address);
            deliverPacket(peerAddress, packet).then(stryMutAct_9fa48("127319") ? () => undefined : (stryCov_9fa48("127319"), result => callback(null, result))).catch(stryMutAct_9fa48("127320") ? () => undefined : (stryCov_9fa48("127320"), error => callback(error)));
          }
        }
      }
      return ProviderRaftNode;
    }
  }

  /**
   * Propose a command on the raft node.
   * @param {Object} raftNode
   * @param {*} command
   * @param {Function} callback
   */
  propose(raftNode, command, callback) {
    if (stryMutAct_9fa48("127321")) {
      {}
    } else {
      stryCov_9fa48("127321");
      if (stryMutAct_9fa48("127324") ? !raftNode && typeof raftNode.command !== TYPEOF.FUNCTION : stryMutAct_9fa48("127323") ? false : stryMutAct_9fa48("127322") ? true : (stryCov_9fa48("127322", "127323", "127324"), (stryMutAct_9fa48("127325") ? raftNode : (stryCov_9fa48("127325"), !raftNode)) || (stryMutAct_9fa48("127327") ? typeof raftNode.command === TYPEOF.FUNCTION : stryMutAct_9fa48("127326") ? false : (stryCov_9fa48("127326", "127327"), typeof raftNode.command !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("127328")) {
          {}
        } else {
          stryCov_9fa48("127328");
          throw new Error(LIFERAFT_PROVIDER_ERROR_MSG.MISSING_COMMAND_API);
        }
      }
      try {
        if (stryMutAct_9fa48("127329")) {
          {}
        } else {
          stryCov_9fa48("127329");
          const proposalPromise = Promise.resolve(raftNode.command(command));
          if (stryMutAct_9fa48("127332") ? typeof callback !== TYPEOF.FUNCTION : stryMutAct_9fa48("127331") ? false : stryMutAct_9fa48("127330") ? true : (stryCov_9fa48("127330", "127331", "127332"), typeof callback === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("127333")) {
              {}
            } else {
              stryCov_9fa48("127333");
              proposalPromise.then(stryMutAct_9fa48("127334") ? () => undefined : (stryCov_9fa48("127334"), () => callback(null))).catch(stryMutAct_9fa48("127335") ? () => undefined : (stryCov_9fa48("127335"), error => callback(error)));
            }
          }
          return proposalPromise;
        }
      } catch (error) {
        if (stryMutAct_9fa48("127336")) {
          {}
        } else {
          stryCov_9fa48("127336");
          if (stryMutAct_9fa48("127339") ? typeof callback !== TYPEOF.FUNCTION : stryMutAct_9fa48("127338") ? false : stryMutAct_9fa48("127337") ? true : (stryCov_9fa48("127337", "127338", "127339"), typeof callback === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("127340")) {
              {}
            } else {
              stryCov_9fa48("127340");
              callback(error);
            }
          }
          throw error;
        }
      }
    }
  }

  /**
   * Propose one command with built-in leader routing and bounded retries.
   * When the local raft node is leader, command() is used directly.
   * Otherwise, command forwarding is delegated through forwardToLeader().
   * @param {Object} raftNode
   * @param {*} command
   * @param {Object} [options]
   * @param {Function} [options.forwardToLeader] - async (command, meta) => void
   * @param {number} [options.maxAttempts=1]
   * @param {Function} [options.computeRetryDelayMs] - (attempt) => ms
   * @param {Function} [options.onRetry] - ({attempt, mode, retryDelayMs, error}) => void
   * @param {number} [options.proposeTimeoutMs] - Max time for one command() call.
   * @return {Promise<{attempt:number, mode:string}>}
   */
  async proposeWithLeaderRouting(raftNode, command, options = {}) {
    if (stryMutAct_9fa48("127341")) {
      {}
    } else {
      stryCov_9fa48("127341");
      const maxAttempts = (stryMutAct_9fa48("127344") ? Number.isInteger(options.maxAttempts) || options.maxAttempts > NUM.ZERO : stryMutAct_9fa48("127343") ? false : stryMutAct_9fa48("127342") ? true : (stryCov_9fa48("127342", "127343", "127344"), Number.isInteger(options.maxAttempts) && (stryMutAct_9fa48("127347") ? options.maxAttempts <= NUM.ZERO : stryMutAct_9fa48("127346") ? options.maxAttempts >= NUM.ZERO : stryMutAct_9fa48("127345") ? true : (stryCov_9fa48("127345", "127346", "127347"), options.maxAttempts > NUM.ZERO)))) ? options.maxAttempts : NUM.ONE;
      const proposeTimeoutMs = resolveProposeTimeoutMs(options);
      let attempt = NUM.ONE;
      let lastError = null;
      let lastMode = LIFERAFT_ROUTE_MODE.PROPOSE;
      while (stryMutAct_9fa48("127350") ? attempt > maxAttempts : stryMutAct_9fa48("127349") ? attempt < maxAttempts : stryMutAct_9fa48("127348") ? false : (stryCov_9fa48("127348", "127349", "127350"), attempt <= maxAttempts)) {
        if (stryMutAct_9fa48("127351")) {
          {}
        } else {
          stryCov_9fa48("127351");
          const isLeader = stryMutAct_9fa48("127354") ? raftNode || raftNode.state === LifeRaft.LEADER : stryMutAct_9fa48("127353") ? false : stryMutAct_9fa48("127352") ? true : (stryCov_9fa48("127352", "127353", "127354"), raftNode && (stryMutAct_9fa48("127356") ? raftNode.state !== LifeRaft.LEADER : stryMutAct_9fa48("127355") ? true : (stryCov_9fa48("127355", "127356"), raftNode.state === LifeRaft.LEADER)));
          const mode = isLeader ? LIFERAFT_ROUTE_MODE.PROPOSE : LIFERAFT_ROUTE_MODE.FORWARD;
          lastMode = mode;
          try {
            if (stryMutAct_9fa48("127357")) {
              {}
            } else {
              stryCov_9fa48("127357");
              if (stryMutAct_9fa48("127360") ? mode !== LIFERAFT_ROUTE_MODE.PROPOSE : stryMutAct_9fa48("127359") ? false : stryMutAct_9fa48("127358") ? true : (stryCov_9fa48("127358", "127359", "127360"), mode === LIFERAFT_ROUTE_MODE.PROPOSE)) {
                if (stryMutAct_9fa48("127361")) {
                  {}
                } else {
                  stryCov_9fa48("127361");
                  const timeoutMessage = stryMutAct_9fa48("127362") ? `` : (stryCov_9fa48("127362"), `${LIFERAFT_PROVIDER_ERROR_MSG.PROPOSE_TIMEOUT} after ${proposeTimeoutMs}ms`);
                  await awaitWithTimeout(this.propose(raftNode, command), proposeTimeoutMs, timeoutMessage);
                }
              } else {
                if (stryMutAct_9fa48("127363")) {
                  {}
                } else {
                  stryCov_9fa48("127363");
                  if (stryMutAct_9fa48("127366") ? typeof options.forwardToLeader === TYPEOF.FUNCTION : stryMutAct_9fa48("127365") ? false : stryMutAct_9fa48("127364") ? true : (stryCov_9fa48("127364", "127365", "127366"), typeof options.forwardToLeader !== TYPEOF.FUNCTION)) {
                    if (stryMutAct_9fa48("127367")) {
                      {}
                    } else {
                      stryCov_9fa48("127367");
                      throw new Error(LIFERAFT_PROVIDER_ERROR_MSG.MISSING_FORWARD_HANDLER);
                    }
                  }
                  await options.forwardToLeader(command, stryMutAct_9fa48("127368") ? {} : (stryCov_9fa48("127368"), {
                    attempt,
                    mode
                  }));
                }
              }
              return stryMutAct_9fa48("127369") ? {} : (stryCov_9fa48("127369"), {
                attempt,
                mode
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("127370")) {
              {}
            } else {
              stryCov_9fa48("127370");
              lastError = error;
              if (stryMutAct_9fa48("127373") ? error?.retryable !== false : stryMutAct_9fa48("127372") ? false : stryMutAct_9fa48("127371") ? true : (stryCov_9fa48("127371", "127372", "127373"), (stryMutAct_9fa48("127374") ? error.retryable : (stryCov_9fa48("127374"), error?.retryable)) === (stryMutAct_9fa48("127375") ? true : (stryCov_9fa48("127375"), false)))) {
                if (stryMutAct_9fa48("127376")) {
                  {}
                } else {
                  stryCov_9fa48("127376");
                  throw error;
                }
              }
            }
          }
          if (stryMutAct_9fa48("127380") ? attempt < maxAttempts : stryMutAct_9fa48("127379") ? attempt > maxAttempts : stryMutAct_9fa48("127378") ? false : stryMutAct_9fa48("127377") ? true : (stryCov_9fa48("127377", "127378", "127379", "127380"), attempt >= maxAttempts)) {
            if (stryMutAct_9fa48("127381")) {
              {}
            } else {
              stryCov_9fa48("127381");
              break;
            }
          }
          const retryDelayMsRaw = (stryMutAct_9fa48("127384") ? typeof options.computeRetryDelayMs !== TYPEOF.FUNCTION : stryMutAct_9fa48("127383") ? false : stryMutAct_9fa48("127382") ? true : (stryCov_9fa48("127382", "127383", "127384"), typeof options.computeRetryDelayMs === TYPEOF.FUNCTION)) ? options.computeRetryDelayMs(attempt) : NUM.ZERO;
          const retryDelayMs = (stryMutAct_9fa48("127387") ? Number.isFinite(retryDelayMsRaw) || retryDelayMsRaw > NUM.ZERO : stryMutAct_9fa48("127386") ? false : stryMutAct_9fa48("127385") ? true : (stryCov_9fa48("127385", "127386", "127387"), Number.isFinite(retryDelayMsRaw) && (stryMutAct_9fa48("127390") ? retryDelayMsRaw <= NUM.ZERO : stryMutAct_9fa48("127389") ? retryDelayMsRaw >= NUM.ZERO : stryMutAct_9fa48("127388") ? true : (stryCov_9fa48("127388", "127389", "127390"), retryDelayMsRaw > NUM.ZERO)))) ? Math.floor(retryDelayMsRaw) : NUM.ZERO;
          if (stryMutAct_9fa48("127393") ? typeof options.onRetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("127392") ? false : stryMutAct_9fa48("127391") ? true : (stryCov_9fa48("127391", "127392", "127393"), typeof options.onRetry === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("127394")) {
              {}
            } else {
              stryCov_9fa48("127394");
              options.onRetry(stryMutAct_9fa48("127395") ? {} : (stryCov_9fa48("127395"), {
                attempt,
                mode: lastMode,
                retryDelayMs,
                error: lastError
              }));
            }
          }
          if (stryMutAct_9fa48("127399") ? retryDelayMs <= NUM.ZERO : stryMutAct_9fa48("127398") ? retryDelayMs >= NUM.ZERO : stryMutAct_9fa48("127397") ? false : stryMutAct_9fa48("127396") ? true : (stryCov_9fa48("127396", "127397", "127398", "127399"), retryDelayMs > NUM.ZERO)) {
            if (stryMutAct_9fa48("127400")) {
              {}
            } else {
              stryCov_9fa48("127400");
              await new Promise(stryMutAct_9fa48("127401") ? () => undefined : (stryCov_9fa48("127401"), resolve => setTimeout(resolve, retryDelayMs)));
            }
          }
          stryMutAct_9fa48("127402") ? attempt -= NUM.ONE : (stryCov_9fa48("127402"), attempt += NUM.ONE);
        }
      }
      if (stryMutAct_9fa48("127404") ? false : stryMutAct_9fa48("127403") ? true : (stryCov_9fa48("127403", "127404"), lastError)) {
        if (stryMutAct_9fa48("127405")) {
          {}
        } else {
          stryCov_9fa48("127405");
          throw lastError;
        }
      }
      throw new Error(LIFERAFT_PROVIDER_ERROR_MSG.MISSING_COMMAND_API);
    }
  }

  /**
   * Join one peer address to the raft node.
   * @param {Object} raftNode
   * @param {string} peerAddress
   */
  joinPeer(raftNode, peerAddress) {
    if (stryMutAct_9fa48("127406")) {
      {}
    } else {
      stryCov_9fa48("127406");
      if (stryMutAct_9fa48("127409") ? !raftNode && typeof raftNode.join !== TYPEOF.FUNCTION : stryMutAct_9fa48("127408") ? false : stryMutAct_9fa48("127407") ? true : (stryCov_9fa48("127407", "127408", "127409"), (stryMutAct_9fa48("127410") ? raftNode : (stryCov_9fa48("127410"), !raftNode)) || (stryMutAct_9fa48("127412") ? typeof raftNode.join === TYPEOF.FUNCTION : stryMutAct_9fa48("127411") ? false : (stryCov_9fa48("127411", "127412"), typeof raftNode.join !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("127413")) {
          {}
        } else {
          stryCov_9fa48("127413");
          return;
        }
      }
      raftNode.join(peerAddress);
    }
  }

  /**
   * Start election timer for multi-replica groups.
   * @param {Object} raftNode
   */
  startElectionTimer(raftNode) {
    if (stryMutAct_9fa48("127414")) {
      {}
    } else {
      stryCov_9fa48("127414");
      if (stryMutAct_9fa48("127417") ? (!raftNode || typeof raftNode.heartbeat !== TYPEOF.FUNCTION) && typeof raftNode.timeout !== TYPEOF.FUNCTION : stryMutAct_9fa48("127416") ? false : stryMutAct_9fa48("127415") ? true : (stryCov_9fa48("127415", "127416", "127417"), (stryMutAct_9fa48("127419") ? !raftNode && typeof raftNode.heartbeat !== TYPEOF.FUNCTION : stryMutAct_9fa48("127418") ? false : (stryCov_9fa48("127418", "127419"), (stryMutAct_9fa48("127420") ? raftNode : (stryCov_9fa48("127420"), !raftNode)) || (stryMutAct_9fa48("127422") ? typeof raftNode.heartbeat === TYPEOF.FUNCTION : stryMutAct_9fa48("127421") ? false : (stryCov_9fa48("127421", "127422"), typeof raftNode.heartbeat !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("127424") ? typeof raftNode.timeout === TYPEOF.FUNCTION : stryMutAct_9fa48("127423") ? false : (stryCov_9fa48("127423", "127424"), typeof raftNode.timeout !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("127425")) {
          {}
        } else {
          stryCov_9fa48("127425");
          return;
        }
      }
      raftNode.heartbeat(raftNode.timeout());
    }
  }

  /**
   * Clear liferaft timers.
   * @param {Object} raftNode
   * @param {string} [timerName]
   */
  clearTimers(raftNode, timerName) {
    if (stryMutAct_9fa48("127426")) {
      {}
    } else {
      stryCov_9fa48("127426");
      if (stryMutAct_9fa48("127429") ? (!raftNode || !raftNode.timers) && typeof raftNode.timers.clear !== TYPEOF.FUNCTION : stryMutAct_9fa48("127428") ? false : stryMutAct_9fa48("127427") ? true : (stryCov_9fa48("127427", "127428", "127429"), (stryMutAct_9fa48("127431") ? !raftNode && !raftNode.timers : stryMutAct_9fa48("127430") ? false : (stryCov_9fa48("127430", "127431"), (stryMutAct_9fa48("127432") ? raftNode : (stryCov_9fa48("127432"), !raftNode)) || (stryMutAct_9fa48("127433") ? raftNode.timers : (stryCov_9fa48("127433"), !raftNode.timers)))) || (stryMutAct_9fa48("127435") ? typeof raftNode.timers.clear === TYPEOF.FUNCTION : stryMutAct_9fa48("127434") ? false : (stryCov_9fa48("127434", "127435"), typeof raftNode.timers.clear !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("127436")) {
          {}
        } else {
          stryCov_9fa48("127436");
          return;
        }
      }
      if (stryMutAct_9fa48("127439") ? typeof timerName !== TYPEOF.STRING : stryMutAct_9fa48("127438") ? false : stryMutAct_9fa48("127437") ? true : (stryCov_9fa48("127437", "127438", "127439"), typeof timerName === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("127440")) {
          {}
        } else {
          stryCov_9fa48("127440");
          raftNode.timers.clear(timerName);
          return;
        }
      }
      raftNode.timers.clear();
    }
  }

  /**
   * Shutdown raft node and clear timers.
   * @param {Object} raftNode
   */
  shutdownNode(raftNode) {
    if (stryMutAct_9fa48("127441")) {
      {}
    } else {
      stryCov_9fa48("127441");
      this.clearTimers(raftNode);
      if (stryMutAct_9fa48("127444") ? raftNode || typeof raftNode.end === TYPEOF.FUNCTION : stryMutAct_9fa48("127443") ? false : stryMutAct_9fa48("127442") ? true : (stryCov_9fa48("127442", "127443", "127444"), raftNode && (stryMutAct_9fa48("127446") ? typeof raftNode.end !== TYPEOF.FUNCTION : stryMutAct_9fa48("127445") ? true : (stryCov_9fa48("127445", "127446"), typeof raftNode.end === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("127447")) {
          {}
        } else {
          stryCov_9fa48("127447");
          raftNode.end();
        }
      }
    }
  }

  /**
   * Get current raft term from node.
   * @param {Object} raftNode
   * @return {number}
   */
  getCurrentTerm(raftNode) {
    if (stryMutAct_9fa48("127448")) {
      {}
    } else {
      stryCov_9fa48("127448");
      const term = raftNode ? raftNode.term : null;
      return Number.isFinite(term) ? term : NUM.ZERO;
    }
  }

  /**
   * Get committed index from raft node log.
   * @param {Object} raftNode
   * @return {number}
   */
  getCommittedIndex(raftNode) {
    if (stryMutAct_9fa48("127449")) {
      {}
    } else {
      stryCov_9fa48("127449");
      const committedIndex = stryMutAct_9fa48("127451") ? raftNode.log?.committedIndex : stryMutAct_9fa48("127450") ? raftNode?.log.committedIndex : (stryCov_9fa48("127450", "127451"), raftNode?.log?.committedIndex);
      return Number.isFinite(committedIndex) ? committedIndex : NUM.ZERO;
    }
  }
}
export { LiferaftProvider };