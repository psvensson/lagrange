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
import { TIMEOUT_BUDGET_CLASSIFICATION, createTimeoutBudget, createTimeoutBudgetError } from '../../control-plane/timeout-budget.js';
import { NUM, TYPEOF } from '../../constants/index.js';
import { TRANSPORT_EVENT } from '../../constants/transport.js';
const STARTUP_CONVERGENCE_TIMEOUT_KIND = Object.freeze(stryMutAct_9fa48("30581") ? {} : (stryCov_9fa48("30581"), {
  NO_PROGRESS: stryMutAct_9fa48("30582") ? "" : (stryCov_9fa48("30582"), 'no_progress'),
  ABSOLUTE_DEADLINE_EXHAUSTED: stryMutAct_9fa48("30583") ? "" : (stryCov_9fa48("30583"), 'absolute_deadline_exhausted')
}));
const STARTUP_CONVERGENCE_SIGNAL = Object.freeze(stryMutAct_9fa48("30584") ? {} : (stryCov_9fa48("30584"), {
  POLL_TICK: stryMutAct_9fa48("30585") ? "" : (stryCov_9fa48("30585"), 'poll_tick')
}));
const DEFAULT_ROUTER_EVENTS = Object.freeze(stryMutAct_9fa48("30586") ? [] : (stryCov_9fa48("30586"), [TRANSPORT_EVENT.CONNECTION_ESTABLISHED, TRANSPORT_EVENT.CONNECTION_CLOSED, TRANSPORT_EVENT.NODE_CONNECTED, TRANSPORT_EVENT.NODE_IDENTIFIED]));
function subscribeToSystemTableCacheChanges(systemTableCache, notify, options = {}) {
  if (stryMutAct_9fa48("30587")) {
    {}
  } else {
    stryCov_9fa48("30587");
    if (stryMutAct_9fa48("30590") ? !systemTableCache && typeof systemTableCache.onCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("30589") ? false : stryMutAct_9fa48("30588") ? true : (stryCov_9fa48("30588", "30589", "30590"), (stryMutAct_9fa48("30591") ? systemTableCache : (stryCov_9fa48("30591"), !systemTableCache)) || (stryMutAct_9fa48("30593") ? typeof systemTableCache.onCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("30592") ? false : (stryCov_9fa48("30592", "30593"), typeof systemTableCache.onCacheChange !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("30594")) {
        {}
      } else {
        stryCov_9fa48("30594");
        return () => {};
      }
    }
    const tableNames = Array.isArray(options.tableNames) ? new Set(options.tableNames) : null;
    const listener = (tableName, operation, record, metadata) => {
      if (stryMutAct_9fa48("30595")) {
        {}
      } else {
        stryCov_9fa48("30595");
        if (stryMutAct_9fa48("30598") ? tableNames || !tableNames.has(tableName) : stryMutAct_9fa48("30597") ? false : stryMutAct_9fa48("30596") ? true : (stryCov_9fa48("30596", "30597", "30598"), tableNames && (stryMutAct_9fa48("30599") ? tableNames.has(tableName) : (stryCov_9fa48("30599"), !tableNames.has(tableName))))) {
          if (stryMutAct_9fa48("30600")) {
            {}
          } else {
            stryCov_9fa48("30600");
            return;
          }
        }
        notify(stryMutAct_9fa48("30601") ? {} : (stryCov_9fa48("30601"), {
          kind: stryMutAct_9fa48("30602") ? "" : (stryCov_9fa48("30602"), 'cache_change'),
          tableName,
          operation,
          record,
          metadata
        }));
      }
    };
    systemTableCache.onCacheChange(listener);
    return () => {
      if (stryMutAct_9fa48("30603")) {
        {}
      } else {
        stryCov_9fa48("30603");
        if (stryMutAct_9fa48("30606") ? typeof systemTableCache.offCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("30605") ? false : stryMutAct_9fa48("30604") ? true : (stryCov_9fa48("30604", "30605", "30606"), typeof systemTableCache.offCacheChange === TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("30607")) {
            {}
          } else {
            stryCov_9fa48("30607");
            systemTableCache.offCacheChange(listener);
          }
        }
      }
    };
  }
}
function subscribeToMessageRouterEvents(messageRouter, notify, options = {}) {
  if (stryMutAct_9fa48("30608")) {
    {}
  } else {
    stryCov_9fa48("30608");
    if (stryMutAct_9fa48("30611") ? !messageRouter && typeof messageRouter.on !== TYPEOF.FUNCTION : stryMutAct_9fa48("30610") ? false : stryMutAct_9fa48("30609") ? true : (stryCov_9fa48("30609", "30610", "30611"), (stryMutAct_9fa48("30612") ? messageRouter : (stryCov_9fa48("30612"), !messageRouter)) || (stryMutAct_9fa48("30614") ? typeof messageRouter.on === TYPEOF.FUNCTION : stryMutAct_9fa48("30613") ? false : (stryCov_9fa48("30613", "30614"), typeof messageRouter.on !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("30615")) {
        {}
      } else {
        stryCov_9fa48("30615");
        return () => {};
      }
    }
    const eventNames = (stryMutAct_9fa48("30618") ? Array.isArray(options.eventNames) || options.eventNames.length > NUM.ZERO : stryMutAct_9fa48("30617") ? false : stryMutAct_9fa48("30616") ? true : (stryCov_9fa48("30616", "30617", "30618"), Array.isArray(options.eventNames) && (stryMutAct_9fa48("30621") ? options.eventNames.length <= NUM.ZERO : stryMutAct_9fa48("30620") ? options.eventNames.length >= NUM.ZERO : stryMutAct_9fa48("30619") ? true : (stryCov_9fa48("30619", "30620", "30621"), options.eventNames.length > NUM.ZERO)))) ? options.eventNames : DEFAULT_ROUTER_EVENTS;
    const unbinders = stryMutAct_9fa48("30622") ? ["Stryker was here"] : (stryCov_9fa48("30622"), []);
    for (const eventName of eventNames) {
      if (stryMutAct_9fa48("30623")) {
        {}
      } else {
        stryCov_9fa48("30623");
        const listener = payload => {
          if (stryMutAct_9fa48("30624")) {
            {}
          } else {
            stryCov_9fa48("30624");
            notify(stryMutAct_9fa48("30625") ? {} : (stryCov_9fa48("30625"), {
              kind: stryMutAct_9fa48("30626") ? "" : (stryCov_9fa48("30626"), 'router_event'),
              eventName,
              payload
            }));
          }
        };
        messageRouter.on(eventName, listener);
        unbinders.push(() => {
          if (stryMutAct_9fa48("30627")) {
            {}
          } else {
            stryCov_9fa48("30627");
            if (stryMutAct_9fa48("30630") ? typeof messageRouter.off !== TYPEOF.FUNCTION : stryMutAct_9fa48("30629") ? false : stryMutAct_9fa48("30628") ? true : (stryCov_9fa48("30628", "30629", "30630"), typeof messageRouter.off === TYPEOF.FUNCTION)) {
              if (stryMutAct_9fa48("30631")) {
                {}
              } else {
                stryCov_9fa48("30631");
                messageRouter.off(eventName, listener);
                return;
              }
            }
            if (stryMutAct_9fa48("30634") ? typeof messageRouter.removeListener !== TYPEOF.FUNCTION : stryMutAct_9fa48("30633") ? false : stryMutAct_9fa48("30632") ? true : (stryCov_9fa48("30632", "30633", "30634"), typeof messageRouter.removeListener === TYPEOF.FUNCTION)) {
              if (stryMutAct_9fa48("30635")) {
                {}
              } else {
                stryCov_9fa48("30635");
                messageRouter.removeListener(eventName, listener);
              }
            }
          }
        });
      }
    }
    return () => {
      if (stryMutAct_9fa48("30636")) {
        {}
      } else {
        stryCov_9fa48("30636");
        for (const unbind of unbinders) {
          if (stryMutAct_9fa48("30637")) {
            {}
          } else {
            stryCov_9fa48("30637");
            unbind();
          }
        }
      }
    };
  }
}
async function waitForStartupConvergence(options = {}) {
  if (stryMutAct_9fa48("30638")) {
    {}
  } else {
    stryCov_9fa48("30638");
    if (stryMutAct_9fa48("30641") ? typeof options.evaluate === TYPEOF.FUNCTION : stryMutAct_9fa48("30640") ? false : stryMutAct_9fa48("30639") ? true : (stryCov_9fa48("30639", "30640", "30641"), typeof options.evaluate !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("30642")) {
        {}
      } else {
        stryCov_9fa48("30642");
        throw new Error(stryMutAct_9fa48("30643") ? "" : (stryCov_9fa48("30643"), 'waitForStartupConvergence requires evaluate'));
      }
    }
    const now = (stryMutAct_9fa48("30646") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("30645") ? false : stryMutAct_9fa48("30644") ? true : (stryCov_9fa48("30644", "30645", "30646"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("30647") ? () => undefined : (stryCov_9fa48("30647"), () => Date.now());
    const setTimeoutFn = (stryMutAct_9fa48("30650") ? typeof options.setTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("30649") ? false : stryMutAct_9fa48("30648") ? true : (stryCov_9fa48("30648", "30649", "30650"), typeof options.setTimeoutFn === TYPEOF.FUNCTION)) ? options.setTimeoutFn : setTimeout;
    const clearTimeoutFn = (stryMutAct_9fa48("30653") ? typeof options.clearTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("30652") ? false : stryMutAct_9fa48("30651") ? true : (stryCov_9fa48("30651", "30652", "30653"), typeof options.clearTimeoutFn === TYPEOF.FUNCTION)) ? options.clearTimeoutFn : clearTimeout;
    const timeoutMs = (stryMutAct_9fa48("30656") ? Number.isFinite(options.timeoutMs) || options.timeoutMs > NUM.ZERO : stryMutAct_9fa48("30655") ? false : stryMutAct_9fa48("30654") ? true : (stryCov_9fa48("30654", "30655", "30656"), Number.isFinite(options.timeoutMs) && (stryMutAct_9fa48("30659") ? options.timeoutMs <= NUM.ZERO : stryMutAct_9fa48("30658") ? options.timeoutMs >= NUM.ZERO : stryMutAct_9fa48("30657") ? true : (stryCov_9fa48("30657", "30658", "30659"), options.timeoutMs > NUM.ZERO)))) ? Math.floor(options.timeoutMs) : NUM.ZERO;
    const pollIntervalMs = (stryMutAct_9fa48("30662") ? Number.isFinite(options.pollIntervalMs) || options.pollIntervalMs > NUM.ZERO : stryMutAct_9fa48("30661") ? false : stryMutAct_9fa48("30660") ? true : (stryCov_9fa48("30660", "30661", "30662"), Number.isFinite(options.pollIntervalMs) && (stryMutAct_9fa48("30665") ? options.pollIntervalMs <= NUM.ZERO : stryMutAct_9fa48("30664") ? options.pollIntervalMs >= NUM.ZERO : stryMutAct_9fa48("30663") ? true : (stryCov_9fa48("30663", "30664", "30665"), options.pollIntervalMs > NUM.ZERO)))) ? Math.floor(options.pollIntervalMs) : null;
    const subscriptions = Array.isArray(options.subscriptions) ? options.subscriptions : stryMutAct_9fa48("30666") ? ["Stryker was here"] : (stryCov_9fa48("30666"), []);
    const buildProgressSignature = (stryMutAct_9fa48("30669") ? typeof options.buildProgressSignature !== TYPEOF.FUNCTION : stryMutAct_9fa48("30668") ? false : stryMutAct_9fa48("30667") ? true : (stryCov_9fa48("30667", "30668", "30669"), typeof options.buildProgressSignature === TYPEOF.FUNCTION)) ? options.buildProgressSignature : stryMutAct_9fa48("30670") ? () => undefined : (stryCov_9fa48("30670"), result => JSON.stringify(stryMutAct_9fa48("30671") ? {} : (stryCov_9fa48("30671"), {
      ready: stryMutAct_9fa48("30674") ? result?.ready !== true : stryMutAct_9fa48("30673") ? false : stryMutAct_9fa48("30672") ? true : (stryCov_9fa48("30672", "30673", "30674"), (stryMutAct_9fa48("30675") ? result.ready : (stryCov_9fa48("30675"), result?.ready)) === (stryMutAct_9fa48("30676") ? false : (stryCov_9fa48("30676"), true)))
    })));
    const timeoutClassification = stryMutAct_9fa48("30679") ? options.timeoutClassification && TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED : stryMutAct_9fa48("30678") ? false : stryMutAct_9fa48("30677") ? true : (stryCov_9fa48("30677", "30678", "30679"), options.timeoutClassification || TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED);
    const timeoutBudget = createTimeoutBudget(stryMutAct_9fa48("30680") ? {} : (stryCov_9fa48("30680"), {
      configuredBudgetMs: timeoutMs
    }));
    let settled = stryMutAct_9fa48("30681") ? true : (stryCov_9fa48("30681"), false);
    let pendingSignal = stryMutAct_9fa48("30684") ? options.initialSignal && null : stryMutAct_9fa48("30683") ? false : stryMutAct_9fa48("30682") ? true : (stryCov_9fa48("30682", "30683", "30684"), options.initialSignal || null);
    let waitResolver = null;
    const unsubscribeFns = stryMutAct_9fa48("30685") ? ["Stryker was here"] : (stryCov_9fa48("30685"), []);
    const notify = signal => {
      if (stryMutAct_9fa48("30686")) {
        {}
      } else {
        stryCov_9fa48("30686");
        if (stryMutAct_9fa48("30688") ? false : stryMutAct_9fa48("30687") ? true : (stryCov_9fa48("30687", "30688"), settled)) {
          if (stryMutAct_9fa48("30689")) {
            {}
          } else {
            stryCov_9fa48("30689");
            return;
          }
        }
        if (stryMutAct_9fa48("30691") ? false : stryMutAct_9fa48("30690") ? true : (stryCov_9fa48("30690", "30691"), waitResolver)) {
          if (stryMutAct_9fa48("30692")) {
            {}
          } else {
            stryCov_9fa48("30692");
            const resolver = waitResolver;
            waitResolver = null;
            resolver(stryMutAct_9fa48("30695") ? signal && true : stryMutAct_9fa48("30694") ? false : stryMutAct_9fa48("30693") ? true : (stryCov_9fa48("30693", "30694", "30695"), signal || (stryMutAct_9fa48("30696") ? false : (stryCov_9fa48("30696"), true))));
            return;
          }
        }
        pendingSignal = stryMutAct_9fa48("30699") ? signal && true : stryMutAct_9fa48("30698") ? false : stryMutAct_9fa48("30697") ? true : (stryCov_9fa48("30697", "30698", "30699"), signal || (stryMutAct_9fa48("30700") ? false : (stryCov_9fa48("30700"), true)));
      }
    };
    for (const subscribe of subscriptions) {
      if (stryMutAct_9fa48("30701")) {
        {}
      } else {
        stryCov_9fa48("30701");
        if (stryMutAct_9fa48("30704") ? typeof subscribe === TYPEOF.FUNCTION : stryMutAct_9fa48("30703") ? false : stryMutAct_9fa48("30702") ? true : (stryCov_9fa48("30702", "30703", "30704"), typeof subscribe !== TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("30705")) {
            {}
          } else {
            stryCov_9fa48("30705");
            continue;
          }
        }
        const unbind = subscribe(notify);
        if (stryMutAct_9fa48("30708") ? typeof unbind !== TYPEOF.FUNCTION : stryMutAct_9fa48("30707") ? false : stryMutAct_9fa48("30706") ? true : (stryCov_9fa48("30706", "30707", "30708"), typeof unbind === TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("30709")) {
            {}
          } else {
            stryCov_9fa48("30709");
            unsubscribeFns.push(unbind);
          }
        }
      }
    }
    const startMs = now();
    let attempt = NUM.ZERO;
    let lastResult = null;
    let lastProgressSignature = null;
    let lastProgressAtMs = startMs;
    let lastSignal = stryMutAct_9fa48("30712") ? options.initialSignal && null : stryMutAct_9fa48("30711") ? false : stryMutAct_9fa48("30710") ? true : (stryCov_9fa48("30710", "30711", "30712"), options.initialSignal || null);
    const waitForSignal = remainingMs => {
      if (stryMutAct_9fa48("30713")) {
        {}
      } else {
        stryCov_9fa48("30713");
        if (stryMutAct_9fa48("30715") ? false : stryMutAct_9fa48("30714") ? true : (stryCov_9fa48("30714", "30715"), pendingSignal)) {
          if (stryMutAct_9fa48("30716")) {
            {}
          } else {
            stryCov_9fa48("30716");
            const signal = pendingSignal;
            pendingSignal = null;
            return Promise.resolve(signal);
          }
        }
        const usingPollCadence = stryMutAct_9fa48("30719") ? pollIntervalMs === null : stryMutAct_9fa48("30718") ? false : stryMutAct_9fa48("30717") ? true : (stryCov_9fa48("30717", "30718", "30719"), pollIntervalMs !== null);
        const waitMs = usingPollCadence ? stryMutAct_9fa48("30720") ? Math.max(remainingMs, pollIntervalMs) : (stryCov_9fa48("30720"), Math.min(remainingMs, pollIntervalMs)) : remainingMs;
        return new Promise(resolve => {
          if (stryMutAct_9fa48("30721")) {
            {}
          } else {
            stryCov_9fa48("30721");
            const timer = setTimeoutFn(() => {
              if (stryMutAct_9fa48("30722")) {
                {}
              } else {
                stryCov_9fa48("30722");
                if (stryMutAct_9fa48("30725") ? waitResolver !== onSignal : stryMutAct_9fa48("30724") ? false : stryMutAct_9fa48("30723") ? true : (stryCov_9fa48("30723", "30724", "30725"), waitResolver === onSignal)) {
                  if (stryMutAct_9fa48("30726")) {
                    {}
                  } else {
                    stryCov_9fa48("30726");
                    waitResolver = null;
                  }
                }
                resolve(usingPollCadence ? stryMutAct_9fa48("30727") ? {} : (stryCov_9fa48("30727"), {
                  kind: STARTUP_CONVERGENCE_SIGNAL.POLL_TICK
                }) : null);
              }
            }, waitMs);
            const onSignal = signal => {
              if (stryMutAct_9fa48("30728")) {
                {}
              } else {
                stryCov_9fa48("30728");
                clearTimeoutFn(timer);
                resolve(signal);
              }
            };
            waitResolver = onSignal;
          }
        });
      }
    };
    try {
      if (stryMutAct_9fa48("30729")) {
        {}
      } else {
        stryCov_9fa48("30729");
        while (stryMutAct_9fa48("30731") ? false : stryMutAct_9fa48("30730") ? false : (stryCov_9fa48("30730", "30731"), true)) {
          if (stryMutAct_9fa48("30732")) {
            {}
          } else {
            stryCov_9fa48("30732");
            stryMutAct_9fa48("30733") ? attempt -= NUM.ONE : (stryCov_9fa48("30733"), attempt += NUM.ONE);
            const elapsedMs = stryMutAct_9fa48("30734") ? Math.min(NUM.ZERO, now() - startMs) : (stryCov_9fa48("30734"), Math.max(NUM.ZERO, stryMutAct_9fa48("30735") ? now() + startMs : (stryCov_9fa48("30735"), now() - startMs)));
            lastResult = await options.evaluate(stryMutAct_9fa48("30736") ? {} : (stryCov_9fa48("30736"), {
              attempt,
              elapsedMs,
              signal: lastSignal
            }));
            if (stryMutAct_9fa48("30739") ? lastResult?.ready !== true : stryMutAct_9fa48("30738") ? false : stryMutAct_9fa48("30737") ? true : (stryCov_9fa48("30737", "30738", "30739"), (stryMutAct_9fa48("30740") ? lastResult.ready : (stryCov_9fa48("30740"), lastResult?.ready)) === (stryMutAct_9fa48("30741") ? false : (stryCov_9fa48("30741"), true)))) {
              if (stryMutAct_9fa48("30742")) {
                {}
              } else {
                stryCov_9fa48("30742");
                return lastResult;
              }
            }
            const progressSignature = buildProgressSignature(lastResult);
            const progressChanged = stryMutAct_9fa48("30745") ? progressSignature === lastProgressSignature : stryMutAct_9fa48("30744") ? false : stryMutAct_9fa48("30743") ? true : (stryCov_9fa48("30743", "30744", "30745"), progressSignature !== lastProgressSignature);
            if (stryMutAct_9fa48("30747") ? false : stryMutAct_9fa48("30746") ? true : (stryCov_9fa48("30746", "30747"), progressChanged)) {
              if (stryMutAct_9fa48("30748")) {
                {}
              } else {
                stryCov_9fa48("30748");
                lastProgressSignature = progressSignature;
                lastProgressAtMs = now();
              }
            }
            let blockedOutcome = null;
            if (stryMutAct_9fa48("30751") ? typeof options.onBlocked !== TYPEOF.FUNCTION : stryMutAct_9fa48("30750") ? false : stryMutAct_9fa48("30749") ? true : (stryCov_9fa48("30749", "30750", "30751"), typeof options.onBlocked === TYPEOF.FUNCTION)) {
              if (stryMutAct_9fa48("30752")) {
                {}
              } else {
                stryCov_9fa48("30752");
                blockedOutcome = await options.onBlocked(lastResult, stryMutAct_9fa48("30753") ? {} : (stryCov_9fa48("30753"), {
                  attempt,
                  elapsedMs,
                  signal: lastSignal,
                  progressChanged
                }));
              }
            }
            const shouldWakeImmediately = stryMutAct_9fa48("30756") ? blockedOutcome === true && blockedOutcome?.wake === true : stryMutAct_9fa48("30755") ? false : stryMutAct_9fa48("30754") ? true : (stryCov_9fa48("30754", "30755", "30756"), (stryMutAct_9fa48("30758") ? blockedOutcome !== true : stryMutAct_9fa48("30757") ? false : (stryCov_9fa48("30757", "30758"), blockedOutcome === (stryMutAct_9fa48("30759") ? false : (stryCov_9fa48("30759"), true)))) || (stryMutAct_9fa48("30761") ? blockedOutcome?.wake !== true : stryMutAct_9fa48("30760") ? false : (stryCov_9fa48("30760", "30761"), (stryMutAct_9fa48("30762") ? blockedOutcome.wake : (stryCov_9fa48("30762"), blockedOutcome?.wake)) === (stryMutAct_9fa48("30763") ? false : (stryCov_9fa48("30763"), true)))));
            if (stryMutAct_9fa48("30765") ? false : stryMutAct_9fa48("30764") ? true : (stryCov_9fa48("30764", "30765"), shouldWakeImmediately)) {
              if (stryMutAct_9fa48("30766")) {
                {}
              } else {
                stryCov_9fa48("30766");
                lastSignal = stryMutAct_9fa48("30769") ? blockedOutcome?.signal && {
                  kind: 'internal_wake',
                  attempt
                } : stryMutAct_9fa48("30768") ? false : stryMutAct_9fa48("30767") ? true : (stryCov_9fa48("30767", "30768", "30769"), (stryMutAct_9fa48("30770") ? blockedOutcome.signal : (stryCov_9fa48("30770"), blockedOutcome?.signal)) || (stryMutAct_9fa48("30771") ? {} : (stryCov_9fa48("30771"), {
                  kind: stryMutAct_9fa48("30772") ? "" : (stryCov_9fa48("30772"), 'internal_wake'),
                  attempt
                })));
                continue;
              }
            }
            const remainingMs = stryMutAct_9fa48("30773") ? timeoutMs + Math.max(NUM.ZERO, now() - startMs) : (stryCov_9fa48("30773"), timeoutMs - (stryMutAct_9fa48("30774") ? Math.min(NUM.ZERO, now() - startMs) : (stryCov_9fa48("30774"), Math.max(NUM.ZERO, stryMutAct_9fa48("30775") ? now() + startMs : (stryCov_9fa48("30775"), now() - startMs)))));
            if (stryMutAct_9fa48("30779") ? remainingMs > NUM.ZERO : stryMutAct_9fa48("30778") ? remainingMs < NUM.ZERO : stryMutAct_9fa48("30777") ? false : stryMutAct_9fa48("30776") ? true : (stryCov_9fa48("30776", "30777", "30778", "30779"), remainingMs <= NUM.ZERO)) {
              if (stryMutAct_9fa48("30780")) {
                {}
              } else {
                stryCov_9fa48("30780");
                break;
              }
            }
            lastSignal = await waitForSignal(remainingMs);
            if (stryMutAct_9fa48("30783") ? lastSignal !== null : stryMutAct_9fa48("30782") ? false : stryMutAct_9fa48("30781") ? true : (stryCov_9fa48("30781", "30782", "30783"), lastSignal === null)) {
              if (stryMutAct_9fa48("30784")) {
                {}
              } else {
                stryCov_9fa48("30784");
                break;
              }
            }
          }
        }
      }
    } finally {
      if (stryMutAct_9fa48("30785")) {
        {}
      } else {
        stryCov_9fa48("30785");
        settled = stryMutAct_9fa48("30786") ? false : (stryCov_9fa48("30786"), true);
        if (stryMutAct_9fa48("30788") ? false : stryMutAct_9fa48("30787") ? true : (stryCov_9fa48("30787", "30788"), waitResolver)) {
          if (stryMutAct_9fa48("30789")) {
            {}
          } else {
            stryCov_9fa48("30789");
            waitResolver = null;
          }
        }
        for (const unsubscribe of unsubscribeFns) {
          if (stryMutAct_9fa48("30790")) {
            {}
          } else {
            stryCov_9fa48("30790");
            unsubscribe();
          }
        }
      }
    }
    const timeoutKind = (stryMutAct_9fa48("30793") ? lastProgressAtMs !== startMs : stryMutAct_9fa48("30792") ? false : stryMutAct_9fa48("30791") ? true : (stryCov_9fa48("30791", "30792", "30793"), lastProgressAtMs === startMs)) ? STARTUP_CONVERGENCE_TIMEOUT_KIND.NO_PROGRESS : STARTUP_CONVERGENCE_TIMEOUT_KIND.ABSOLUTE_DEADLINE_EXHAUSTED;
    const timeoutContext = stryMutAct_9fa48("30794") ? {} : (stryCov_9fa48("30794"), {
      attempt,
      timeoutMs,
      timeoutKind,
      lastProgressElapsedMs: stryMutAct_9fa48("30795") ? Math.min(NUM.ZERO, lastProgressAtMs - startMs) : (stryCov_9fa48("30795"), Math.max(NUM.ZERO, stryMutAct_9fa48("30796") ? lastProgressAtMs + startMs : (stryCov_9fa48("30796"), lastProgressAtMs - startMs))),
      elapsedMs: stryMutAct_9fa48("30797") ? Math.min(NUM.ZERO, now() - startMs) : (stryCov_9fa48("30797"), Math.max(NUM.ZERO, stryMutAct_9fa48("30798") ? now() + startMs : (stryCov_9fa48("30798"), now() - startMs)))
    });
    if (stryMutAct_9fa48("30801") ? typeof options.createTimeoutError !== TYPEOF.FUNCTION : stryMutAct_9fa48("30800") ? false : stryMutAct_9fa48("30799") ? true : (stryCov_9fa48("30799", "30800", "30801"), typeof options.createTimeoutError === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("30802")) {
        {}
      } else {
        stryCov_9fa48("30802");
        throw options.createTimeoutError(lastResult, timeoutContext);
      }
    }
    const error = createTimeoutBudgetError(stryMutAct_9fa48("30803") ? {} : (stryCov_9fa48("30803"), {
      message: stryMutAct_9fa48("30806") ? options.timeoutMessage && `startup convergence timed out after ${timeoutMs}ms` : stryMutAct_9fa48("30805") ? false : stryMutAct_9fa48("30804") ? true : (stryCov_9fa48("30804", "30805", "30806"), options.timeoutMessage || (stryMutAct_9fa48("30807") ? `` : (stryCov_9fa48("30807"), `startup convergence timed out after ${timeoutMs}ms`))),
      budget: timeoutBudget,
      classification: timeoutClassification,
      nestedOperation: stryMutAct_9fa48("30810") ? options.operationName && 'startup_convergence' : stryMutAct_9fa48("30809") ? false : stryMutAct_9fa48("30808") ? true : (stryCov_9fa48("30808", "30809", "30810"), options.operationName || (stryMutAct_9fa48("30811") ? "" : (stryCov_9fa48("30811"), 'startup_convergence')))
    }));
    error.timeoutMs = timeoutMs;
    error.timeoutKind = timeoutKind;
    error.lastProgressElapsedMs = timeoutContext.lastProgressElapsedMs;
    error.result = lastResult;
    throw error;
  }
}
export { STARTUP_CONVERGENCE_TIMEOUT_KIND, subscribeToMessageRouterEvents, subscribeToSystemTableCacheChanges, waitForStartupConvergence };