/**
 * TraceCollector manages trace stream subscribers and forwards
 * JSON-serialized events with optional scope filters.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { DEBUG_DEFAULT, DEBUG_ERROR_MSG } from './debug-constants.js';

/**
 * Node-local collector for Trace_Event forwarding.
 */
class TraceCollector {
  /**
   * @param {Object} [options]
   * @param {Function} [options.serialize] - Event serializer.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("75493")) {
      {}
    } else {
      stryCov_9fa48("75493");
      this.serialize = stryMutAct_9fa48("75496") ? options.serialize && JSON.stringify : stryMutAct_9fa48("75495") ? false : stryMutAct_9fa48("75494") ? true : (stryCov_9fa48("75494", "75495", "75496"), options.serialize || JSON.stringify);
      this.subscribers = new Map();
      this.nextSubscriberId = NUM.ONE;
    }
  }

  /**
   * Register one subscriber.
   *
   * subscriber may be:
   * 1) function(payload, event)
   * 2) socket-like object with send(payload)
   *
   * @param {Function|Object} subscriber
   * @param {Object} [filter]
   * @return {{subscriberId: string, unsubscribe: Function}}
   */
  subscribe(subscriber, filter = {}) {
    if (stryMutAct_9fa48("75497")) {
      {}
    } else {
      stryCov_9fa48("75497");
      const sender = normalizeSender(subscriber);
      const subscriberId = (stryMutAct_9fa48("75498") ? `` : (stryCov_9fa48("75498"), `${DEBUG_DEFAULT.SUBSCRIBER_ID_PREFIX}-`)) + (stryMutAct_9fa48("75499") ? `` : (stryCov_9fa48("75499"), `${stryMutAct_9fa48("75500") ? this.nextSubscriberId-- : (stryCov_9fa48("75500"), this.nextSubscriberId++)}`));
      this.subscribers.set(subscriberId, stryMutAct_9fa48("75501") ? {} : (stryCov_9fa48("75501"), {
        subscriberId,
        sender,
        filter: normalizeFilter(filter)
      }));
      return stryMutAct_9fa48("75502") ? {} : (stryCov_9fa48("75502"), {
        subscriberId,
        unsubscribe: stryMutAct_9fa48("75503") ? () => undefined : (stryCov_9fa48("75503"), () => this.unsubscribe(subscriberId))
      });
    }
  }

  /**
   * Unregister one subscriber by ID.
   * @param {string} subscriberId
   * @return {boolean}
   */
  unsubscribe(subscriberId) {
    if (stryMutAct_9fa48("75504")) {
      {}
    } else {
      stryCov_9fa48("75504");
      return this.subscribers.delete(subscriberId);
    }
  }

  /**
   * Emit one Trace_Event to matching subscribers.
   * Drop/no-buffer when there are no subscribers.
   *
   * @param {Object} event
   * @return {{delivered: number, dropped: boolean}}
   */
  emit(event) {
    if (stryMutAct_9fa48("75505")) {
      {}
    } else {
      stryCov_9fa48("75505");
      if (stryMutAct_9fa48("75508") ? this.subscribers.size !== NUM.ZERO : stryMutAct_9fa48("75507") ? false : stryMutAct_9fa48("75506") ? true : (stryCov_9fa48("75506", "75507", "75508"), this.subscribers.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("75509")) {
          {}
        } else {
          stryCov_9fa48("75509");
          return stryMutAct_9fa48("75510") ? {} : (stryCov_9fa48("75510"), {
            delivered: NUM.ZERO,
            dropped: stryMutAct_9fa48("75511") ? false : (stryCov_9fa48("75511"), true)
          });
        }
      }
      let serialized;
      let delivered = NUM.ZERO;
      for (const subscription of this.subscribers.values()) {
        if (stryMutAct_9fa48("75512")) {
          {}
        } else {
          stryCov_9fa48("75512");
          if (stryMutAct_9fa48("75515") ? false : stryMutAct_9fa48("75514") ? true : stryMutAct_9fa48("75513") ? matchesFilter(event, subscription.filter) : (stryCov_9fa48("75513", "75514", "75515"), !matchesFilter(event, subscription.filter))) {
            if (stryMutAct_9fa48("75516")) {
              {}
            } else {
              stryCov_9fa48("75516");
              continue;
            }
          }
          if (stryMutAct_9fa48("75519") ? serialized !== undefined : stryMutAct_9fa48("75518") ? false : stryMutAct_9fa48("75517") ? true : (stryCov_9fa48("75517", "75518", "75519"), serialized === undefined)) {
            if (stryMutAct_9fa48("75520")) {
              {}
            } else {
              stryCov_9fa48("75520");
              serialized = this.serialize(event);
            }
          }
          try {
            if (stryMutAct_9fa48("75521")) {
              {}
            } else {
              stryCov_9fa48("75521");
              subscription.sender(serialized, event);
              stryMutAct_9fa48("75522") ? delivered-- : (stryCov_9fa48("75522"), delivered++);
            }
          } catch {
            // Best-effort stream delivery only.
          }
        }
      }
      return stryMutAct_9fa48("75523") ? {} : (stryCov_9fa48("75523"), {
        delivered,
        dropped: stryMutAct_9fa48("75526") ? delivered !== NUM.ZERO : stryMutAct_9fa48("75525") ? false : stryMutAct_9fa48("75524") ? true : (stryCov_9fa48("75524", "75525", "75526"), delivered === NUM.ZERO)
      });
    }
  }

  /**
   * @return {number}
   */
  getSubscriberCount() {
    if (stryMutAct_9fa48("75527")) {
      {}
    } else {
      stryCov_9fa48("75527");
      return this.subscribers.size;
    }
  }
}

/**
 * @param {Function|Object} subscriber
 * @return {Function}
 */
function normalizeSender(subscriber) {
  if (stryMutAct_9fa48("75528")) {
    {}
  } else {
    stryCov_9fa48("75528");
    if (stryMutAct_9fa48("75531") ? typeof subscriber !== TYPEOF.FUNCTION : stryMutAct_9fa48("75530") ? false : stryMutAct_9fa48("75529") ? true : (stryCov_9fa48("75529", "75530", "75531"), typeof subscriber === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("75532")) {
        {}
      } else {
        stryCov_9fa48("75532");
        return subscriber;
      }
    }
    if (stryMutAct_9fa48("75535") ? subscriber || typeof subscriber.send === TYPEOF.FUNCTION : stryMutAct_9fa48("75534") ? false : stryMutAct_9fa48("75533") ? true : (stryCov_9fa48("75533", "75534", "75535"), subscriber && (stryMutAct_9fa48("75537") ? typeof subscriber.send !== TYPEOF.FUNCTION : stryMutAct_9fa48("75536") ? true : (stryCov_9fa48("75536", "75537"), typeof subscriber.send === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("75538")) {
        {}
      } else {
        stryCov_9fa48("75538");
        return stryMutAct_9fa48("75539") ? () => undefined : (stryCov_9fa48("75539"), payload => subscriber.send(payload));
      }
    }
    throw new Error(DEBUG_ERROR_MSG.TRACE_COLLECTOR_REQUIRED);
  }
}

/**
 * @param {Object} filter
 * @return {Object}
 */
function normalizeFilter(filter) {
  if (stryMutAct_9fa48("75540")) {
    {}
  } else {
    stryCov_9fa48("75540");
    const normalized = {};
    if (stryMutAct_9fa48("75543") ? typeof filter.lineagePrefix === TYPEOF.STRING || filter.lineagePrefix.length > NUM.ZERO : stryMutAct_9fa48("75542") ? false : stryMutAct_9fa48("75541") ? true : (stryCov_9fa48("75541", "75542", "75543"), (stryMutAct_9fa48("75545") ? typeof filter.lineagePrefix !== TYPEOF.STRING : stryMutAct_9fa48("75544") ? true : (stryCov_9fa48("75544", "75545"), typeof filter.lineagePrefix === TYPEOF.STRING)) && (stryMutAct_9fa48("75548") ? filter.lineagePrefix.length <= NUM.ZERO : stryMutAct_9fa48("75547") ? filter.lineagePrefix.length >= NUM.ZERO : stryMutAct_9fa48("75546") ? true : (stryCov_9fa48("75546", "75547", "75548"), filter.lineagePrefix.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("75549")) {
        {}
      } else {
        stryCov_9fa48("75549");
        normalized.lineagePrefix = filter.lineagePrefix;
      }
    }
    if (stryMutAct_9fa48("75552") ? typeof filter.level === TYPEOF.STRING || filter.level.length > NUM.ZERO : stryMutAct_9fa48("75551") ? false : stryMutAct_9fa48("75550") ? true : (stryCov_9fa48("75550", "75551", "75552"), (stryMutAct_9fa48("75554") ? typeof filter.level !== TYPEOF.STRING : stryMutAct_9fa48("75553") ? true : (stryCov_9fa48("75553", "75554"), typeof filter.level === TYPEOF.STRING)) && (stryMutAct_9fa48("75557") ? filter.level.length <= NUM.ZERO : stryMutAct_9fa48("75556") ? filter.level.length >= NUM.ZERO : stryMutAct_9fa48("75555") ? true : (stryCov_9fa48("75555", "75556", "75557"), filter.level.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("75558")) {
        {}
      } else {
        stryCov_9fa48("75558");
        normalized.level = filter.level;
      }
    }
    if (stryMutAct_9fa48("75560") ? false : stryMutAct_9fa48("75559") ? true : (stryCov_9fa48("75559", "75560"), Array.isArray(filter.levels))) {
      if (stryMutAct_9fa48("75561")) {
        {}
      } else {
        stryCov_9fa48("75561");
        const levels = stryMutAct_9fa48("75562") ? filter.levels : (stryCov_9fa48("75562"), filter.levels.filter(stryMutAct_9fa48("75563") ? () => undefined : (stryCov_9fa48("75563"), value => stryMutAct_9fa48("75566") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("75565") ? false : stryMutAct_9fa48("75564") ? true : (stryCov_9fa48("75564", "75565", "75566"), (stryMutAct_9fa48("75568") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("75567") ? true : (stryCov_9fa48("75567", "75568"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("75571") ? value.length <= NUM.ZERO : stryMutAct_9fa48("75570") ? value.length >= NUM.ZERO : stryMutAct_9fa48("75569") ? true : (stryCov_9fa48("75569", "75570", "75571"), value.length > NUM.ZERO))))));
        if (stryMutAct_9fa48("75575") ? levels.length <= NUM.ZERO : stryMutAct_9fa48("75574") ? levels.length >= NUM.ZERO : stryMutAct_9fa48("75573") ? false : stryMutAct_9fa48("75572") ? true : (stryCov_9fa48("75572", "75573", "75574", "75575"), levels.length > NUM.ZERO)) {
          if (stryMutAct_9fa48("75576")) {
            {}
          } else {
            stryCov_9fa48("75576");
            normalized.levels = new Set(levels);
          }
        }
      }
    }
    if (stryMutAct_9fa48("75579") ? typeof filter.nodeId === TYPEOF.STRING || filter.nodeId.length > NUM.ZERO : stryMutAct_9fa48("75578") ? false : stryMutAct_9fa48("75577") ? true : (stryCov_9fa48("75577", "75578", "75579"), (stryMutAct_9fa48("75581") ? typeof filter.nodeId !== TYPEOF.STRING : stryMutAct_9fa48("75580") ? true : (stryCov_9fa48("75580", "75581"), typeof filter.nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("75584") ? filter.nodeId.length <= NUM.ZERO : stryMutAct_9fa48("75583") ? filter.nodeId.length >= NUM.ZERO : stryMutAct_9fa48("75582") ? true : (stryCov_9fa48("75582", "75583", "75584"), filter.nodeId.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("75585")) {
        {}
      } else {
        stryCov_9fa48("75585");
        normalized.nodeId = filter.nodeId;
      }
    }
    if (stryMutAct_9fa48("75588") ? typeof filter.source === TYPEOF.STRING || filter.source.length > NUM.ZERO : stryMutAct_9fa48("75587") ? false : stryMutAct_9fa48("75586") ? true : (stryCov_9fa48("75586", "75587", "75588"), (stryMutAct_9fa48("75590") ? typeof filter.source !== TYPEOF.STRING : stryMutAct_9fa48("75589") ? true : (stryCov_9fa48("75589", "75590"), typeof filter.source === TYPEOF.STRING)) && (stryMutAct_9fa48("75593") ? filter.source.length <= NUM.ZERO : stryMutAct_9fa48("75592") ? filter.source.length >= NUM.ZERO : stryMutAct_9fa48("75591") ? true : (stryCov_9fa48("75591", "75592", "75593"), filter.source.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("75594")) {
        {}
      } else {
        stryCov_9fa48("75594");
        normalized.source = filter.source;
      }
    }
    return normalized;
  }
}

/**
 * @param {Object} event
 * @param {Object} filter
 * @return {boolean}
 */
function matchesFilter(event, filter) {
  if (stryMutAct_9fa48("75595")) {
    {}
  } else {
    stryCov_9fa48("75595");
    if (stryMutAct_9fa48("75598") ? !event && typeof event !== TYPEOF.OBJECT : stryMutAct_9fa48("75597") ? false : stryMutAct_9fa48("75596") ? true : (stryCov_9fa48("75596", "75597", "75598"), (stryMutAct_9fa48("75599") ? event : (stryCov_9fa48("75599"), !event)) || (stryMutAct_9fa48("75601") ? typeof event === TYPEOF.OBJECT : stryMutAct_9fa48("75600") ? false : (stryCov_9fa48("75600", "75601"), typeof event !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("75602")) {
        {}
      } else {
        stryCov_9fa48("75602");
        return stryMutAct_9fa48("75603") ? true : (stryCov_9fa48("75603"), false);
      }
    }
    if (stryMutAct_9fa48("75606") ? !filter && typeof filter !== TYPEOF.OBJECT : stryMutAct_9fa48("75605") ? false : stryMutAct_9fa48("75604") ? true : (stryCov_9fa48("75604", "75605", "75606"), (stryMutAct_9fa48("75607") ? filter : (stryCov_9fa48("75607"), !filter)) || (stryMutAct_9fa48("75609") ? typeof filter === TYPEOF.OBJECT : stryMutAct_9fa48("75608") ? false : (stryCov_9fa48("75608", "75609"), typeof filter !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("75610")) {
        {}
      } else {
        stryCov_9fa48("75610");
        return stryMutAct_9fa48("75611") ? false : (stryCov_9fa48("75611"), true);
      }
    }
    if (stryMutAct_9fa48("75614") ? filter.lineagePrefix || !String(event.lineageId || '').startsWith(filter.lineagePrefix) : stryMutAct_9fa48("75613") ? false : stryMutAct_9fa48("75612") ? true : (stryCov_9fa48("75612", "75613", "75614"), filter.lineagePrefix && (stryMutAct_9fa48("75615") ? String(event.lineageId || '').startsWith(filter.lineagePrefix) : (stryCov_9fa48("75615"), !(stryMutAct_9fa48("75616") ? String(event.lineageId || '').endsWith(filter.lineagePrefix) : (stryCov_9fa48("75616"), String(stryMutAct_9fa48("75619") ? event.lineageId && '' : stryMutAct_9fa48("75618") ? false : stryMutAct_9fa48("75617") ? true : (stryCov_9fa48("75617", "75618", "75619"), event.lineageId || (stryMutAct_9fa48("75620") ? "Stryker was here!" : (stryCov_9fa48("75620"), '')))).startsWith(filter.lineagePrefix))))))) {
      if (stryMutAct_9fa48("75621")) {
        {}
      } else {
        stryCov_9fa48("75621");
        return stryMutAct_9fa48("75622") ? true : (stryCov_9fa48("75622"), false);
      }
    }
    if (stryMutAct_9fa48("75625") ? filter.level || event.level !== filter.level : stryMutAct_9fa48("75624") ? false : stryMutAct_9fa48("75623") ? true : (stryCov_9fa48("75623", "75624", "75625"), filter.level && (stryMutAct_9fa48("75627") ? event.level === filter.level : stryMutAct_9fa48("75626") ? true : (stryCov_9fa48("75626", "75627"), event.level !== filter.level)))) {
      if (stryMutAct_9fa48("75628")) {
        {}
      } else {
        stryCov_9fa48("75628");
        return stryMutAct_9fa48("75629") ? true : (stryCov_9fa48("75629"), false);
      }
    }
    if (stryMutAct_9fa48("75632") ? filter.levels || !filter.levels.has(event.level) : stryMutAct_9fa48("75631") ? false : stryMutAct_9fa48("75630") ? true : (stryCov_9fa48("75630", "75631", "75632"), filter.levels && (stryMutAct_9fa48("75633") ? filter.levels.has(event.level) : (stryCov_9fa48("75633"), !filter.levels.has(event.level))))) {
      if (stryMutAct_9fa48("75634")) {
        {}
      } else {
        stryCov_9fa48("75634");
        return stryMutAct_9fa48("75635") ? true : (stryCov_9fa48("75635"), false);
      }
    }
    if (stryMutAct_9fa48("75638") ? filter.nodeId || event.nodeId !== filter.nodeId : stryMutAct_9fa48("75637") ? false : stryMutAct_9fa48("75636") ? true : (stryCov_9fa48("75636", "75637", "75638"), filter.nodeId && (stryMutAct_9fa48("75640") ? event.nodeId === filter.nodeId : stryMutAct_9fa48("75639") ? true : (stryCov_9fa48("75639", "75640"), event.nodeId !== filter.nodeId)))) {
      if (stryMutAct_9fa48("75641")) {
        {}
      } else {
        stryCov_9fa48("75641");
        return stryMutAct_9fa48("75642") ? true : (stryCov_9fa48("75642"), false);
      }
    }
    if (stryMutAct_9fa48("75645") ? filter.source || event.source !== filter.source : stryMutAct_9fa48("75644") ? false : stryMutAct_9fa48("75643") ? true : (stryCov_9fa48("75643", "75644", "75645"), filter.source && (stryMutAct_9fa48("75647") ? event.source === filter.source : stryMutAct_9fa48("75646") ? true : (stryCov_9fa48("75646", "75647"), event.source !== filter.source)))) {
      if (stryMutAct_9fa48("75648")) {
        {}
      } else {
        stryCov_9fa48("75648");
        return stryMutAct_9fa48("75649") ? true : (stryCov_9fa48("75649"), false);
      }
    }
    return stryMutAct_9fa48("75650") ? false : (stryCov_9fa48("75650"), true);
  }
}
export { TraceCollector, matchesFilter };