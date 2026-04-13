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
import { READINESS_EVENT } from '../bootstrap/bootstrap-readiness-state-constants.js';
const LOGS_TABLE_PERSISTENCE_READY_DELAY_MS = 5000;
function normalizeDelayMs(value) {
  if (stryMutAct_9fa48("84000")) {
    {}
  } else {
    stryCov_9fa48("84000");
    if (stryMutAct_9fa48("84003") ? !Number.isFinite(value) && value < 0 : stryMutAct_9fa48("84002") ? false : stryMutAct_9fa48("84001") ? true : (stryCov_9fa48("84001", "84002", "84003"), (stryMutAct_9fa48("84004") ? Number.isFinite(value) : (stryCov_9fa48("84004"), !Number.isFinite(value))) || (stryMutAct_9fa48("84007") ? value >= 0 : stryMutAct_9fa48("84006") ? value <= 0 : stryMutAct_9fa48("84005") ? false : (stryCov_9fa48("84005", "84006", "84007"), value < 0)))) {
      if (stryMutAct_9fa48("84008")) {
        {}
      } else {
        stryCov_9fa48("84008");
        return LOGS_TABLE_PERSISTENCE_READY_DELAY_MS;
      }
    }
    return Math.floor(value);
  }
}
function removeReadinessTransitionListener(readinessState, listener) {
  if (stryMutAct_9fa48("84009")) {
    {}
  } else {
    stryCov_9fa48("84009");
    if (stryMutAct_9fa48("84012") ? !readinessState && typeof listener !== 'function' : stryMutAct_9fa48("84011") ? false : stryMutAct_9fa48("84010") ? true : (stryCov_9fa48("84010", "84011", "84012"), (stryMutAct_9fa48("84013") ? readinessState : (stryCov_9fa48("84013"), !readinessState)) || (stryMutAct_9fa48("84015") ? typeof listener === 'function' : stryMutAct_9fa48("84014") ? false : (stryCov_9fa48("84014", "84015"), typeof listener !== (stryMutAct_9fa48("84016") ? "" : (stryCov_9fa48("84016"), 'function')))))) {
      if (stryMutAct_9fa48("84017")) {
        {}
      } else {
        stryCov_9fa48("84017");
        return;
      }
    }
    if (stryMutAct_9fa48("84020") ? typeof readinessState.off !== 'function' : stryMutAct_9fa48("84019") ? false : stryMutAct_9fa48("84018") ? true : (stryCov_9fa48("84018", "84019", "84020"), typeof readinessState.off === (stryMutAct_9fa48("84021") ? "" : (stryCov_9fa48("84021"), 'function')))) {
      if (stryMutAct_9fa48("84022")) {
        {}
      } else {
        stryCov_9fa48("84022");
        readinessState.off(READINESS_EVENT.TRANSITION, listener);
        return;
      }
    }
    if (stryMutAct_9fa48("84025") ? typeof readinessState.removeListener !== 'function' : stryMutAct_9fa48("84024") ? false : stryMutAct_9fa48("84023") ? true : (stryCov_9fa48("84023", "84024", "84025"), typeof readinessState.removeListener === (stryMutAct_9fa48("84026") ? "" : (stryCov_9fa48("84026"), 'function')))) {
      if (stryMutAct_9fa48("84027")) {
        {}
      } else {
        stryCov_9fa48("84027");
        readinessState.removeListener(READINESS_EVENT.TRANSITION, listener);
      }
    }
  }
}
function startLogsTablePersistenceOnReadiness(options = {}) {
  if (stryMutAct_9fa48("84028")) {
    {}
  } else {
    stryCov_9fa48("84028");
    const readinessState = stryMutAct_9fa48("84031") ? options.readinessState && null : stryMutAct_9fa48("84030") ? false : stryMutAct_9fa48("84029") ? true : (stryCov_9fa48("84029", "84030", "84031"), options.readinessState || null);
    const start = (stryMutAct_9fa48("84034") ? typeof options.start !== 'function' : stryMutAct_9fa48("84033") ? false : stryMutAct_9fa48("84032") ? true : (stryCov_9fa48("84032", "84033", "84034"), typeof options.start === (stryMutAct_9fa48("84035") ? "" : (stryCov_9fa48("84035"), 'function')))) ? options.start : null;
    const logger = stryMutAct_9fa48("84038") ? options.logger && null : stryMutAct_9fa48("84037") ? false : stryMutAct_9fa48("84036") ? true : (stryCov_9fa48("84036", "84037", "84038"), options.logger || null);
    const delayMs = normalizeDelayMs(options.delayMs);
    let connectedService = null;
    let startPromise = null;
    let startTimer = null;
    let settled = stryMutAct_9fa48("84039") ? true : (stryCov_9fa48("84039"), false);
    let cancelled = stryMutAct_9fa48("84040") ? true : (stryCov_9fa48("84040"), false);
    let resolvePromise = null;
    const promise = new Promise(resolve => {
      if (stryMutAct_9fa48("84041")) {
        {}
      } else {
        stryCov_9fa48("84041");
        resolvePromise = resolve;
      }
    });
    const settle = service => {
      if (stryMutAct_9fa48("84042")) {
        {}
      } else {
        stryCov_9fa48("84042");
        connectedService = stryMutAct_9fa48("84045") ? service && null : stryMutAct_9fa48("84044") ? false : stryMutAct_9fa48("84043") ? true : (stryCov_9fa48("84043", "84044", "84045"), service || null);
        if (stryMutAct_9fa48("84048") ? false : stryMutAct_9fa48("84047") ? true : stryMutAct_9fa48("84046") ? settled : (stryCov_9fa48("84046", "84047", "84048"), !settled)) {
          if (stryMutAct_9fa48("84049")) {
            {}
          } else {
            stryCov_9fa48("84049");
            settled = stryMutAct_9fa48("84050") ? false : (stryCov_9fa48("84050"), true);
            resolvePromise(connectedService);
          }
        }
        return connectedService;
      }
    };
    const clearStartTimer = () => {
      if (stryMutAct_9fa48("84051")) {
        {}
      } else {
        stryCov_9fa48("84051");
        if (stryMutAct_9fa48("84054") ? false : stryMutAct_9fa48("84053") ? true : stryMutAct_9fa48("84052") ? startTimer : (stryCov_9fa48("84052", "84053", "84054"), !startTimer)) {
          if (stryMutAct_9fa48("84055")) {
            {}
          } else {
            stryCov_9fa48("84055");
            return;
          }
        }
        clearTimeout(startTimer);
        startTimer = null;
      }
    };
    const maybeStart = () => {
      if (stryMutAct_9fa48("84056")) {
        {}
      } else {
        stryCov_9fa48("84056");
        if (stryMutAct_9fa48("84059") ? (cancelled || startPromise) && !start : stryMutAct_9fa48("84058") ? false : stryMutAct_9fa48("84057") ? true : (stryCov_9fa48("84057", "84058", "84059"), (stryMutAct_9fa48("84061") ? cancelled && startPromise : stryMutAct_9fa48("84060") ? false : (stryCov_9fa48("84060", "84061"), cancelled || startPromise)) || (stryMutAct_9fa48("84062") ? start : (stryCov_9fa48("84062"), !start)))) {
          if (stryMutAct_9fa48("84063")) {
            {}
          } else {
            stryCov_9fa48("84063");
            if (stryMutAct_9fa48("84066") ? false : stryMutAct_9fa48("84065") ? true : stryMutAct_9fa48("84064") ? start : (stryCov_9fa48("84064", "84065", "84066"), !start)) {
              if (stryMutAct_9fa48("84067")) {
                {}
              } else {
                stryCov_9fa48("84067");
                settle(null);
              }
            }
            return;
          }
        }
        const snapshot = stryMutAct_9fa48("84070") ? readinessState?.getSnapshot?.() && null : stryMutAct_9fa48("84069") ? false : stryMutAct_9fa48("84068") ? true : (stryCov_9fa48("84068", "84069", "84070"), (stryMutAct_9fa48("84072") ? readinessState.getSnapshot?.() : stryMutAct_9fa48("84071") ? readinessState?.getSnapshot() : (stryCov_9fa48("84071", "84072"), readinessState?.getSnapshot?.())) || null);
        if (stryMutAct_9fa48("84075") ? snapshot || snapshot.ready !== true : stryMutAct_9fa48("84074") ? false : stryMutAct_9fa48("84073") ? true : (stryCov_9fa48("84073", "84074", "84075"), snapshot && (stryMutAct_9fa48("84077") ? snapshot.ready === true : stryMutAct_9fa48("84076") ? true : (stryCov_9fa48("84076", "84077"), snapshot.ready !== (stryMutAct_9fa48("84078") ? false : (stryCov_9fa48("84078"), true)))))) {
          if (stryMutAct_9fa48("84079")) {
            {}
          } else {
            stryCov_9fa48("84079");
            return;
          }
        }
        clearStartTimer();
        removeReadinessTransitionListener(readinessState, handleTransition);
        startPromise = Promise.resolve().then(stryMutAct_9fa48("84080") ? () => undefined : (stryCov_9fa48("84080"), () => start())).then(stryMutAct_9fa48("84081") ? () => undefined : (stryCov_9fa48("84081"), service => settle(service))).catch(error => {
          if (stryMutAct_9fa48("84082")) {
            {}
          } else {
            stryCov_9fa48("84082");
            if (stryMutAct_9fa48("84085") ? typeof logger?.warn !== 'function' : stryMutAct_9fa48("84084") ? false : stryMutAct_9fa48("84083") ? true : (stryCov_9fa48("84083", "84084", "84085"), typeof (stryMutAct_9fa48("84086") ? logger.warn : (stryCov_9fa48("84086"), logger?.warn)) === (stryMutAct_9fa48("84087") ? "" : (stryCov_9fa48("84087"), 'function')))) {
              if (stryMutAct_9fa48("84088")) {
                {}
              } else {
                stryCov_9fa48("84088");
                logger.warn(stryMutAct_9fa48("84089") ? "" : (stryCov_9fa48("84089"), 'Deferred logs table persistence startup failed'), stryMutAct_9fa48("84090") ? {} : (stryCov_9fa48("84090"), {
                  error: error.message
                }));
              }
            }
            return settle(null);
          }
        });
      }
    };
    const scheduleStart = () => {
      if (stryMutAct_9fa48("84091")) {
        {}
      } else {
        stryCov_9fa48("84091");
        if (stryMutAct_9fa48("84094") ? (cancelled || startPromise || startTimer) && !start : stryMutAct_9fa48("84093") ? false : stryMutAct_9fa48("84092") ? true : (stryCov_9fa48("84092", "84093", "84094"), (stryMutAct_9fa48("84096") ? (cancelled || startPromise) && startTimer : stryMutAct_9fa48("84095") ? false : (stryCov_9fa48("84095", "84096"), (stryMutAct_9fa48("84098") ? cancelled && startPromise : stryMutAct_9fa48("84097") ? false : (stryCov_9fa48("84097", "84098"), cancelled || startPromise)) || startTimer)) || (stryMutAct_9fa48("84099") ? start : (stryCov_9fa48("84099"), !start)))) {
          if (stryMutAct_9fa48("84100")) {
            {}
          } else {
            stryCov_9fa48("84100");
            return;
          }
        }
        const snapshot = stryMutAct_9fa48("84103") ? readinessState?.getSnapshot?.() && null : stryMutAct_9fa48("84102") ? false : stryMutAct_9fa48("84101") ? true : (stryCov_9fa48("84101", "84102", "84103"), (stryMutAct_9fa48("84105") ? readinessState.getSnapshot?.() : stryMutAct_9fa48("84104") ? readinessState?.getSnapshot() : (stryCov_9fa48("84104", "84105"), readinessState?.getSnapshot?.())) || null);
        if (stryMutAct_9fa48("84108") ? snapshot || snapshot.ready !== true : stryMutAct_9fa48("84107") ? false : stryMutAct_9fa48("84106") ? true : (stryCov_9fa48("84106", "84107", "84108"), snapshot && (stryMutAct_9fa48("84110") ? snapshot.ready === true : stryMutAct_9fa48("84109") ? true : (stryCov_9fa48("84109", "84110"), snapshot.ready !== (stryMutAct_9fa48("84111") ? false : (stryCov_9fa48("84111"), true)))))) {
          if (stryMutAct_9fa48("84112")) {
            {}
          } else {
            stryCov_9fa48("84112");
            return;
          }
        }
        startTimer = setTimeout(() => {
          if (stryMutAct_9fa48("84113")) {
            {}
          } else {
            stryCov_9fa48("84113");
            startTimer = null;
            maybeStart();
          }
        }, delayMs);
        if (stryMutAct_9fa48("84116") ? typeof startTimer.unref !== 'function' : stryMutAct_9fa48("84115") ? false : stryMutAct_9fa48("84114") ? true : (stryCov_9fa48("84114", "84115", "84116"), typeof startTimer.unref === (stryMutAct_9fa48("84117") ? "" : (stryCov_9fa48("84117"), 'function')))) {
          if (stryMutAct_9fa48("84118")) {
            {}
          } else {
            stryCov_9fa48("84118");
            startTimer.unref();
          }
        }
      }
    };
    function handleTransition(transition) {
      if (stryMutAct_9fa48("84119")) {
        {}
      } else {
        stryCov_9fa48("84119");
        if (stryMutAct_9fa48("84122") ? transition?.ready !== true : stryMutAct_9fa48("84121") ? false : stryMutAct_9fa48("84120") ? true : (stryCov_9fa48("84120", "84121", "84122"), (stryMutAct_9fa48("84123") ? transition.ready : (stryCov_9fa48("84123"), transition?.ready)) === (stryMutAct_9fa48("84124") ? false : (stryCov_9fa48("84124"), true)))) {
          if (stryMutAct_9fa48("84125")) {
            {}
          } else {
            stryCov_9fa48("84125");
            scheduleStart();
            return;
          }
        }
        if (stryMutAct_9fa48("84128") ? false : stryMutAct_9fa48("84127") ? true : stryMutAct_9fa48("84126") ? startPromise : (stryCov_9fa48("84126", "84127", "84128"), !startPromise)) {
          if (stryMutAct_9fa48("84129")) {
            {}
          } else {
            stryCov_9fa48("84129");
            clearStartTimer();
          }
        }
      }
    }
    if (stryMutAct_9fa48("84132") ? readinessState || typeof readinessState.on === 'function' : stryMutAct_9fa48("84131") ? false : stryMutAct_9fa48("84130") ? true : (stryCov_9fa48("84130", "84131", "84132"), readinessState && (stryMutAct_9fa48("84134") ? typeof readinessState.on !== 'function' : stryMutAct_9fa48("84133") ? true : (stryCov_9fa48("84133", "84134"), typeof readinessState.on === (stryMutAct_9fa48("84135") ? "" : (stryCov_9fa48("84135"), 'function')))))) {
      if (stryMutAct_9fa48("84136")) {
        {}
      } else {
        stryCov_9fa48("84136");
        readinessState.on(READINESS_EVENT.TRANSITION, handleTransition);
        scheduleStart();
      }
    } else {
      if (stryMutAct_9fa48("84137")) {
        {}
      } else {
        stryCov_9fa48("84137");
        maybeStart();
      }
    }
    return stryMutAct_9fa48("84138") ? {} : (stryCov_9fa48("84138"), {
      getService: stryMutAct_9fa48("84139") ? () => undefined : (stryCov_9fa48("84139"), () => connectedService),
      promise,
      cancel: () => {
        if (stryMutAct_9fa48("84140")) {
          {}
        } else {
          stryCov_9fa48("84140");
          cancelled = stryMutAct_9fa48("84141") ? false : (stryCov_9fa48("84141"), true);
          clearStartTimer();
          removeReadinessTransitionListener(readinessState, handleTransition);
          if (stryMutAct_9fa48("84144") ? false : stryMutAct_9fa48("84143") ? true : stryMutAct_9fa48("84142") ? startPromise : (stryCov_9fa48("84142", "84143", "84144"), !startPromise)) {
            if (stryMutAct_9fa48("84145")) {
              {}
            } else {
              stryCov_9fa48("84145");
              settle(null);
            }
          }
        }
      }
    });
  }
}
export { LOGS_TABLE_PERSISTENCE_READY_DELAY_MS, startLogsTablePersistenceOnReadiness };