/**
 * CDC delivery logic extracted from PartitionService.
 * Manages CDC subscriber registration, event delivery, buffering, and replay.
 *
 * This is a helper class that operates on the owning PartitionService's state.
 * It receives the owner via constructor and reads/writes CDC-related fields
 * directly on it, keeping the mutable state in one place.
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
import { NUM, TABLES, TYPEOF } from '../constants/index.js';
import { CDC_PIPELINE_METRIC, CDC_LIFECYCLE_LOG_MSG } from '../constants/cdc-lifecycle-constants.js';
import { getTableCdcPolicy } from '../cache/cdc-table-policy.js';
import { buildEventIdentity } from './cdc-event-buffer.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { PARTITION_SERVICE_CDC, PARTITION_SERVICE_DEFAULT, PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_EVENT, PARTITION_SERVICE_LOG_MSG, PARTITION_SERVICE_TYPE } from './partition-service-constants.js';
const PARTITION_CDC_DELIVERY_LITERAL = Object.freeze(stryMutAct_9fa48("99533") ? {} : (stryCov_9fa48("99533"), {
  OBJECT: stryMutAct_9fa48("99534") ? "" : (stryCov_9fa48("99534"), 'object'),
  BOOLEAN: stryMutAct_9fa48("99535") ? "" : (stryCov_9fa48("99535"), 'boolean'),
  CDCREPLAYBUFFERGROWTHCOUNT: stryMutAct_9fa48("99536") ? "" : (stryCov_9fa48("99536"), 'cdcReplayBufferGrowthCount'),
  CDCBUFFERREPLAYTIMER: stryMutAct_9fa48("99537") ? "" : (stryCov_9fa48("99537"), 'cdcBufferReplayTimer'),
  CDCREPLAYRETRYDEPTH: stryMutAct_9fa48("99538") ? "" : (stryCov_9fa48("99538"), 'cdcReplayRetryDepth'),
  HANDSHAKE_CATCHUP_REPLAY_FAILED: stryMutAct_9fa48("99539") ? "" : (stryCov_9fa48("99539"), 'handshake_catchup_replay_failed'),
  POST_SUBSCRIPTION_HANDSHAKE: stryMutAct_9fa48("99540") ? "" : (stryCov_9fa48("99540"), 'post_subscription_handshake')
}));
const CDC_NO_SUBSCRIBER_BUFFER_SUPPRESSED_TABLES = new Set(stryMutAct_9fa48("99541") ? [] : (stryCov_9fa48("99541"), [SYSTEM_TABLE_NAME.LOGS]));
const CDC_SUBSCRIBER_NOT_READY_MSG = stryMutAct_9fa48("99542") ? "" : (stryCov_9fa48("99542"), 'CDC subscriber not ready for delivery');
function incrementBoundedOwnerCounter(owner, fieldName, delta = NUM.ONE) {
  if (stryMutAct_9fa48("99543")) {
    {}
  } else {
    stryCov_9fa48("99543");
    if (stryMutAct_9fa48("99546") ? (!owner || typeof fieldName !== TYPEOF.STRING) && fieldName.length === NUM.ZERO : stryMutAct_9fa48("99545") ? false : stryMutAct_9fa48("99544") ? true : (stryCov_9fa48("99544", "99545", "99546"), (stryMutAct_9fa48("99548") ? !owner && typeof fieldName !== TYPEOF.STRING : stryMutAct_9fa48("99547") ? false : (stryCov_9fa48("99547", "99548"), (stryMutAct_9fa48("99549") ? owner : (stryCov_9fa48("99549"), !owner)) || (stryMutAct_9fa48("99551") ? typeof fieldName === TYPEOF.STRING : stryMutAct_9fa48("99550") ? false : (stryCov_9fa48("99550", "99551"), typeof fieldName !== TYPEOF.STRING)))) || (stryMutAct_9fa48("99553") ? fieldName.length !== NUM.ZERO : stryMutAct_9fa48("99552") ? false : (stryCov_9fa48("99552", "99553"), fieldName.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("99554")) {
        {}
      } else {
        stryCov_9fa48("99554");
        return;
      }
    }
    if (stryMutAct_9fa48("99557") ? !Number.isFinite(delta) && delta <= NUM.ZERO : stryMutAct_9fa48("99556") ? false : stryMutAct_9fa48("99555") ? true : (stryCov_9fa48("99555", "99556", "99557"), (stryMutAct_9fa48("99558") ? Number.isFinite(delta) : (stryCov_9fa48("99558"), !Number.isFinite(delta))) || (stryMutAct_9fa48("99561") ? delta > NUM.ZERO : stryMutAct_9fa48("99560") ? delta < NUM.ZERO : stryMutAct_9fa48("99559") ? false : (stryCov_9fa48("99559", "99560", "99561"), delta <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("99562")) {
        {}
      } else {
        stryCov_9fa48("99562");
        return;
      }
    }
    const currentValue = Number.isFinite(owner[fieldName]) ? owner[fieldName] : NUM.ZERO;
    owner[fieldName] = stryMutAct_9fa48("99563") ? Math.max(Number.MAX_SAFE_INTEGER, currentValue + Math.max(NUM.ONE, Math.floor(delta))) : (stryCov_9fa48("99563"), Math.min(Number.MAX_SAFE_INTEGER, stryMutAct_9fa48("99564") ? currentValue - Math.max(NUM.ONE, Math.floor(delta)) : (stryCov_9fa48("99564"), currentValue + (stryMutAct_9fa48("99565") ? Math.min(NUM.ONE, Math.floor(delta)) : (stryCov_9fa48("99565"), Math.max(NUM.ONE, Math.floor(delta)))))));
  }
}
function markReplayOnlyCdcEvent(cdcEvent) {
  if (stryMutAct_9fa48("99566")) {
    {}
  } else {
    stryCov_9fa48("99566");
    if (stryMutAct_9fa48("99569") ? !cdcEvent && typeof cdcEvent !== PARTITION_CDC_DELIVERY_LITERAL.OBJECT : stryMutAct_9fa48("99568") ? false : stryMutAct_9fa48("99567") ? true : (stryCov_9fa48("99567", "99568", "99569"), (stryMutAct_9fa48("99570") ? cdcEvent : (stryCov_9fa48("99570"), !cdcEvent)) || (stryMutAct_9fa48("99572") ? typeof cdcEvent === PARTITION_CDC_DELIVERY_LITERAL.OBJECT : stryMutAct_9fa48("99571") ? false : (stryCov_9fa48("99571", "99572"), typeof cdcEvent !== PARTITION_CDC_DELIVERY_LITERAL.OBJECT)))) {
      if (stryMutAct_9fa48("99573")) {
        {}
      } else {
        stryCov_9fa48("99573");
        return cdcEvent;
      }
    }
    return stryMutAct_9fa48("99574") ? {} : (stryCov_9fa48("99574"), {
      ...cdcEvent,
      replayOnly: stryMutAct_9fa48("99575") ? false : (stryCov_9fa48("99575"), true)
    });
  }
} /**
  * Parse external CDC allowed override from table policy JSON.
  * @param {string|Object|null} rawPolicy - Raw table_policies value.
  * @return {boolean|null} Override value or null when absent.
  */
function parseExternalCdcAllowedOverride(rawPolicy) {
  if (stryMutAct_9fa48("99576")) {
    {}
  } else {
    stryCov_9fa48("99576");
    if (stryMutAct_9fa48("99579") ? false : stryMutAct_9fa48("99578") ? true : stryMutAct_9fa48("99577") ? rawPolicy : (stryCov_9fa48("99577", "99578", "99579"), !rawPolicy)) {
      if (stryMutAct_9fa48("99580")) {
        {}
      } else {
        stryCov_9fa48("99580");
        return null;
      }
    }
    let policy = rawPolicy;
    if (stryMutAct_9fa48("99583") ? typeof policy !== TYPEOF.STRING : stryMutAct_9fa48("99582") ? false : stryMutAct_9fa48("99581") ? true : (stryCov_9fa48("99581", "99582", "99583"), typeof policy === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("99584")) {
        {}
      } else {
        stryCov_9fa48("99584");
        try {
          if (stryMutAct_9fa48("99585")) {
            {}
          } else {
            stryCov_9fa48("99585");
            policy = JSON.parse(policy);
          }
        } catch (_parseErr) {
          if (stryMutAct_9fa48("99586")) {
            {}
          } else {
            stryCov_9fa48("99586");
            return null;
          }
        }
      }
    }
    if (stryMutAct_9fa48("99589") ? !policy && typeof policy !== PARTITION_CDC_DELIVERY_LITERAL.OBJECT : stryMutAct_9fa48("99588") ? false : stryMutAct_9fa48("99587") ? true : (stryCov_9fa48("99587", "99588", "99589"), (stryMutAct_9fa48("99590") ? policy : (stryCov_9fa48("99590"), !policy)) || (stryMutAct_9fa48("99592") ? typeof policy === PARTITION_CDC_DELIVERY_LITERAL.OBJECT : stryMutAct_9fa48("99591") ? false : (stryCov_9fa48("99591", "99592"), typeof policy !== PARTITION_CDC_DELIVERY_LITERAL.OBJECT)))) {
      if (stryMutAct_9fa48("99593")) {
        {}
      } else {
        stryCov_9fa48("99593");
        return null;
      }
    }
    if (stryMutAct_9fa48("99596") ? typeof policy.externalCdcAllowed !== PARTITION_CDC_DELIVERY_LITERAL.BOOLEAN : stryMutAct_9fa48("99595") ? false : stryMutAct_9fa48("99594") ? true : (stryCov_9fa48("99594", "99595", "99596"), typeof policy.externalCdcAllowed === PARTITION_CDC_DELIVERY_LITERAL.BOOLEAN)) {
      if (stryMutAct_9fa48("99597")) {
        {}
      } else {
        stryCov_9fa48("99597");
        return policy.externalCdcAllowed;
      }
    }
    if (stryMutAct_9fa48("99600") ? typeof policy.changeDataCapture?.externalCdcAllowed !== PARTITION_CDC_DELIVERY_LITERAL.BOOLEAN : stryMutAct_9fa48("99599") ? false : stryMutAct_9fa48("99598") ? true : (stryCov_9fa48("99598", "99599", "99600"), typeof (stryMutAct_9fa48("99601") ? policy.changeDataCapture.externalCdcAllowed : (stryCov_9fa48("99601"), policy.changeDataCapture?.externalCdcAllowed)) === PARTITION_CDC_DELIVERY_LITERAL.BOOLEAN)) {
      if (stryMutAct_9fa48("99602")) {
        {}
      } else {
        stryCov_9fa48("99602");
        return policy.changeDataCapture.externalCdcAllowed;
      }
    }
    return null;
  }
} /**
  * Check whether a value is a valid CDC subscriber.
  * @param {*} subscriber - Candidate subscriber.
  * @return {boolean} True when subscriber is valid.
  */
function isCDCSubscriber(subscriber) {
  if (stryMutAct_9fa48("99603")) {
    {}
  } else {
    stryCov_9fa48("99603");
    if (stryMutAct_9fa48("99606") ? typeof subscriber !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("99605") ? false : stryMutAct_9fa48("99604") ? true : (stryCov_9fa48("99604", "99605", "99606"), typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION)) {
      if (stryMutAct_9fa48("99607")) {
        {}
      } else {
        stryCov_9fa48("99607");
        return stryMutAct_9fa48("99608") ? false : (stryCov_9fa48("99608"), true);
      }
    }
    return Boolean(stryMutAct_9fa48("99611") ? subscriber || typeof subscriber.handleCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("99610") ? false : stryMutAct_9fa48("99609") ? true : (stryCov_9fa48("99609", "99610", "99611"), subscriber && (stryMutAct_9fa48("99613") ? typeof subscriber.handleCDCEvent !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("99612") ? true : (stryCov_9fa48("99612", "99613"), typeof subscriber.handleCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION))));
  }
} /**
  * Helper class encapsulating CDC delivery, subscription, and buffering logic.
  *
  * Operates directly on the owning PartitionService instance's mutable state
  * so that the single source of truth for CDC fields remains on the owner.
  */
class PartitionCDCDelivery {
  /**
  * @param {Object} owner - The PartitionService instance that owns CDC state.
  */
  constructor(owner) {
    if (stryMutAct_9fa48("99614")) {
      {}
    } else {
      stryCov_9fa48("99614");
      this.owner = owner;
    }
  } /**
    * Resolve the underlying subscriber object from a wrapper.
    * @param {Function|Object} subscriber
    * @return {Function|Object}
    * @private
    */
  getCDCSubscriberSource(subscriber) {
    if (stryMutAct_9fa48("99615")) {
      {}
    } else {
      stryCov_9fa48("99615");
      return stryMutAct_9fa48("99618") ? subscriber?.cdcSourceSubscriber && subscriber : stryMutAct_9fa48("99617") ? false : stryMutAct_9fa48("99616") ? true : (stryCov_9fa48("99616", "99617", "99618"), (stryMutAct_9fa48("99619") ? subscriber.cdcSourceSubscriber : (stryCov_9fa48("99619"), subscriber?.cdcSourceSubscriber)) || subscriber);
    }
  }
  buildCDCSubscriberReadiness(ready, retryAfterMs, reason) {
    if (stryMutAct_9fa48("99620")) {
      {}
    } else {
      stryCov_9fa48("99620");
      return stryMutAct_9fa48("99621") ? {} : (stryCov_9fa48("99621"), {
        ready,
        retryAfterMs,
        reason
      });
    }
  } /**
    * Normalize optional subscriber readiness metadata.
    * @param {*} readiness
    * @return {{ready:boolean,retryAfterMs:number,reason:string|null}}
    * @private
    */
  normalizeCDCSubscriberReadiness(readiness) {
    if (stryMutAct_9fa48("99622")) {
      {}
    } else {
      stryCov_9fa48("99622");
      let ready = stryMutAct_9fa48("99623") ? false : (stryCov_9fa48("99623"), true);
      let retryAfterMs = NUM.ZERO;
      let reason = null;
      if (stryMutAct_9fa48("99626") ? readiness !== false : stryMutAct_9fa48("99625") ? false : stryMutAct_9fa48("99624") ? true : (stryCov_9fa48("99624", "99625", "99626"), readiness === (stryMutAct_9fa48("99627") ? true : (stryCov_9fa48("99627"), false)))) {
        if (stryMutAct_9fa48("99628")) {
          {}
        } else {
          stryCov_9fa48("99628");
          ready = stryMutAct_9fa48("99629") ? true : (stryCov_9fa48("99629"), false);
        }
      } else if (stryMutAct_9fa48("99632") ? readiness !== true && readiness != null || typeof readiness === PARTITION_CDC_DELIVERY_LITERAL.OBJECT : stryMutAct_9fa48("99631") ? false : stryMutAct_9fa48("99630") ? true : (stryCov_9fa48("99630", "99631", "99632"), (stryMutAct_9fa48("99634") ? readiness !== true || readiness != null : stryMutAct_9fa48("99633") ? true : (stryCov_9fa48("99633", "99634"), (stryMutAct_9fa48("99636") ? readiness === true : stryMutAct_9fa48("99635") ? true : (stryCov_9fa48("99635", "99636"), readiness !== (stryMutAct_9fa48("99637") ? false : (stryCov_9fa48("99637"), true)))) && (stryMutAct_9fa48("99639") ? readiness == null : stryMutAct_9fa48("99638") ? true : (stryCov_9fa48("99638", "99639"), readiness != null)))) && (stryMutAct_9fa48("99641") ? typeof readiness !== PARTITION_CDC_DELIVERY_LITERAL.OBJECT : stryMutAct_9fa48("99640") ? true : (stryCov_9fa48("99640", "99641"), typeof readiness === PARTITION_CDC_DELIVERY_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("99642")) {
          {}
        } else {
          stryCov_9fa48("99642");
          ready = stryMutAct_9fa48("99645") ? readiness.ready === false : stryMutAct_9fa48("99644") ? false : stryMutAct_9fa48("99643") ? true : (stryCov_9fa48("99643", "99644", "99645"), readiness.ready !== (stryMutAct_9fa48("99646") ? true : (stryCov_9fa48("99646"), false)));
          retryAfterMs = (stryMutAct_9fa48("99649") ? Number.isFinite(readiness.retryAfterMs) || readiness.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("99648") ? false : stryMutAct_9fa48("99647") ? true : (stryCov_9fa48("99647", "99648", "99649"), Number.isFinite(readiness.retryAfterMs) && (stryMutAct_9fa48("99652") ? readiness.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("99651") ? readiness.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("99650") ? true : (stryCov_9fa48("99650", "99651", "99652"), readiness.retryAfterMs > NUM.ZERO)))) ? Math.floor(readiness.retryAfterMs) : NUM.ZERO;
          reason = (stryMutAct_9fa48("99655") ? typeof readiness.reason === TYPEOF.STRING || readiness.reason.length > NUM.ZERO : stryMutAct_9fa48("99654") ? false : stryMutAct_9fa48("99653") ? true : (stryCov_9fa48("99653", "99654", "99655"), (stryMutAct_9fa48("99657") ? typeof readiness.reason !== TYPEOF.STRING : stryMutAct_9fa48("99656") ? true : (stryCov_9fa48("99656", "99657"), typeof readiness.reason === TYPEOF.STRING)) && (stryMutAct_9fa48("99660") ? readiness.reason.length <= NUM.ZERO : stryMutAct_9fa48("99659") ? readiness.reason.length >= NUM.ZERO : stryMutAct_9fa48("99658") ? true : (stryCov_9fa48("99658", "99659", "99660"), readiness.reason.length > NUM.ZERO)))) ? readiness.reason : null;
        }
      }
      return this.buildCDCSubscriberReadiness(ready, retryAfterMs, reason);
    }
  } /**
    * Resolve whether a subscriber-owner is ready to accept this CDC event.
    * @param {Function|Object} subscriber
    * @param {Object} cdcEvent
    * @return {{ready:boolean,retryAfterMs:number,reason:string|null}}
    * @private
    */
  resolveCDCSubscriberReadiness(subscriber, cdcEvent) {
    if (stryMutAct_9fa48("99661")) {
      {}
    } else {
      stryCov_9fa48("99661");
      const sourceSubscriber = this.getCDCSubscriberSource(subscriber);
      if (stryMutAct_9fa48("99664") ? sourceSubscriber || typeof sourceSubscriber.canAcceptCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("99663") ? false : stryMutAct_9fa48("99662") ? true : (stryCov_9fa48("99662", "99663", "99664"), sourceSubscriber && (stryMutAct_9fa48("99666") ? typeof sourceSubscriber.canAcceptCDCEvent !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("99665") ? true : (stryCov_9fa48("99665", "99666"), typeof sourceSubscriber.canAcceptCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION)))) {
        if (stryMutAct_9fa48("99667")) {
          {}
        } else {
          stryCov_9fa48("99667");
          return this.normalizeCDCSubscriberReadiness(sourceSubscriber.canAcceptCDCEvent(cdcEvent));
        }
      }
      return stryMutAct_9fa48("99668") ? {} : (stryCov_9fa48("99668"), {
        ready: stryMutAct_9fa48("99669") ? false : (stryCov_9fa48("99669"), true),
        retryAfterMs: NUM.ZERO,
        reason: null
      });
    }
  } /**
    * Resolve the next buffered replay delay after a subscriber miss.
    * Honors typed retryAfter hints from downstream owners when present.
    * @param {*} error
    * @return {number}
    * @private
    */
  resolveBufferedReplayDelayAfterError(error) {
    if (stryMutAct_9fa48("99670")) {
      {}
    } else {
      stryCov_9fa48("99670");
      if (stryMutAct_9fa48("99673") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("99672") ? false : stryMutAct_9fa48("99671") ? true : (stryCov_9fa48("99671", "99672", "99673"), Number.isFinite(stryMutAct_9fa48("99674") ? error.retryAfterMs : (stryCov_9fa48("99674"), error?.retryAfterMs)) && (stryMutAct_9fa48("99677") ? error.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("99676") ? error.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("99675") ? true : (stryCov_9fa48("99675", "99676", "99677"), error.retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("99678")) {
          {}
        } else {
          stryCov_9fa48("99678");
          return stryMutAct_9fa48("99679") ? Math.max(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS, Math.floor(error.retryAfterMs)) : (stryCov_9fa48("99679"), Math.min(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS, Math.floor(error.retryAfterMs)));
        }
      }
      return stryMutAct_9fa48("99680") ? Math.max(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS, this.owner.cdcBufferReplayDelayMs * NUM.TWO) : (stryCov_9fa48("99680"), Math.min(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS, stryMutAct_9fa48("99681") ? this.owner.cdcBufferReplayDelayMs / NUM.TWO : (stryCov_9fa48("99681"), this.owner.cdcBufferReplayDelayMs * NUM.TWO)));
    }
  } /**
    * Resolve whether late-subscriber external CDC is enabled for a table.
    * @param {string} tableName - Table name.
    * @return {boolean} True when external CDC buffering should remain enabled.
    */
  isExternalCdcAllowedForTable(tableName) {
    if (stryMutAct_9fa48("99682")) {
      {}
    } else {
      stryCov_9fa48("99682");
      if (stryMutAct_9fa48("99685") ? !tableName && tableName !== this.owner.tableName : stryMutAct_9fa48("99684") ? false : stryMutAct_9fa48("99683") ? true : (stryCov_9fa48("99683", "99684", "99685"), (stryMutAct_9fa48("99686") ? tableName : (stryCov_9fa48("99686"), !tableName)) || (stryMutAct_9fa48("99688") ? tableName === this.owner.tableName : stryMutAct_9fa48("99687") ? false : (stryCov_9fa48("99687", "99688"), tableName !== this.owner.tableName)))) {
        if (stryMutAct_9fa48("99689")) {
          {}
        } else {
          stryCov_9fa48("99689");
          return stryMutAct_9fa48("99692") ? getTableCdcPolicy(tableName)?.externalCdcAllowed !== true : stryMutAct_9fa48("99691") ? false : stryMutAct_9fa48("99690") ? true : (stryCov_9fa48("99690", "99691", "99692"), (stryMutAct_9fa48("99693") ? getTableCdcPolicy(tableName).externalCdcAllowed : (stryCov_9fa48("99693"), getTableCdcPolicy(tableName)?.externalCdcAllowed)) === (stryMutAct_9fa48("99694") ? false : (stryCov_9fa48("99694"), true)));
        }
      }
      if (stryMutAct_9fa48("99697") ? typeof this.owner.externalCdcAllowed !== PARTITION_CDC_DELIVERY_LITERAL.BOOLEAN : stryMutAct_9fa48("99696") ? false : stryMutAct_9fa48("99695") ? true : (stryCov_9fa48("99695", "99696", "99697"), typeof this.owner.externalCdcAllowed === PARTITION_CDC_DELIVERY_LITERAL.BOOLEAN)) {
        if (stryMutAct_9fa48("99698")) {
          {}
        } else {
          stryCov_9fa48("99698");
          return this.owner.externalCdcAllowed;
        }
      }
      const tableRow = stryMutAct_9fa48("99701") ? this.owner.systemTableCache?.get?.(TABLES.TABLES, this.owner.tableId) && null : stryMutAct_9fa48("99700") ? false : stryMutAct_9fa48("99699") ? true : (stryCov_9fa48("99699", "99700", "99701"), (stryMutAct_9fa48("99703") ? this.owner.systemTableCache.get?.(TABLES.TABLES, this.owner.tableId) : stryMutAct_9fa48("99702") ? this.owner.systemTableCache?.get(TABLES.TABLES, this.owner.tableId) : (stryCov_9fa48("99702", "99703"), this.owner.systemTableCache?.get?.(TABLES.TABLES, this.owner.tableId))) || null);
      const policyOverride = parseExternalCdcAllowedOverride(stryMutAct_9fa48("99706") ? tableRow?.table_policies && null : stryMutAct_9fa48("99705") ? false : stryMutAct_9fa48("99704") ? true : (stryCov_9fa48("99704", "99705", "99706"), (stryMutAct_9fa48("99707") ? tableRow.table_policies : (stryCov_9fa48("99707"), tableRow?.table_policies)) || null));
      if (stryMutAct_9fa48("99710") ? typeof policyOverride !== PARTITION_CDC_DELIVERY_LITERAL.BOOLEAN : stryMutAct_9fa48("99709") ? false : stryMutAct_9fa48("99708") ? true : (stryCov_9fa48("99708", "99709", "99710"), typeof policyOverride === PARTITION_CDC_DELIVERY_LITERAL.BOOLEAN)) {
        if (stryMutAct_9fa48("99711")) {
          {}
        } else {
          stryCov_9fa48("99711");
          return policyOverride;
        }
      }
      return stryMutAct_9fa48("99714") ? getTableCdcPolicy(tableName)?.externalCdcAllowed !== true : stryMutAct_9fa48("99713") ? false : stryMutAct_9fa48("99712") ? true : (stryCov_9fa48("99712", "99713", "99714"), (stryMutAct_9fa48("99715") ? getTableCdcPolicy(tableName).externalCdcAllowed : (stryCov_9fa48("99715"), getTableCdcPolicy(tableName)?.externalCdcAllowed)) === (stryMutAct_9fa48("99716") ? false : (stryCov_9fa48("99716"), true)));
    }
  } /**
    * Determine whether CDC events should be buffered when there are no
    * subscribers yet.
    * @param {string} tableName - Table name.
    * @return {boolean} True when buffering should stay enabled.
    */
  shouldBufferCdcWithoutSubscribers(tableName) {
    if (stryMutAct_9fa48("99717")) {
      {}
    } else {
      stryCov_9fa48("99717");
      if (stryMutAct_9fa48("99719") ? false : stryMutAct_9fa48("99718") ? true : (stryCov_9fa48("99718", "99719"), CDC_NO_SUBSCRIBER_BUFFER_SUPPRESSED_TABLES.has(tableName))) {
        if (stryMutAct_9fa48("99720")) {
          {}
        } else {
          stryCov_9fa48("99720");
          return stryMutAct_9fa48("99721") ? true : (stryCov_9fa48("99721"), false);
        }
      }
      const policy = getTableCdcPolicy(tableName, stryMutAct_9fa48("99722") ? {} : (stryCov_9fa48("99722"), {
        externalCdcAllowed: this.isExternalCdcAllowedForTable(tableName)
      }));
      return stryMutAct_9fa48("99725") ? policy.internalCachePropagation === true && policy.externalCdcAllowed === true : stryMutAct_9fa48("99724") ? false : stryMutAct_9fa48("99723") ? true : (stryCov_9fa48("99723", "99724", "99725"), (stryMutAct_9fa48("99727") ? policy.internalCachePropagation !== true : stryMutAct_9fa48("99726") ? false : (stryCov_9fa48("99726", "99727"), policy.internalCachePropagation === (stryMutAct_9fa48("99728") ? false : (stryCov_9fa48("99728"), true)))) || (stryMutAct_9fa48("99730") ? policy.externalCdcAllowed !== true : stryMutAct_9fa48("99729") ? false : (stryCov_9fa48("99729", "99730"), policy.externalCdcAllowed === (stryMutAct_9fa48("99731") ? false : (stryCov_9fa48("99731"), true)))));
    }
  } /**
    * Allocate next CDC event sequence number.
    * @return {number} Monotonic sequence number.
    */
  nextCDCEventSequenceNumber() {
    if (stryMutAct_9fa48("99732")) {
      {}
    } else {
      stryCov_9fa48("99732");
      stryMutAct_9fa48("99733") ? this.owner.cdcEventSequenceNumber -= NUM.ONE : (stryCov_9fa48("99733"), this.owner.cdcEventSequenceNumber += NUM.ONE);
      return this.owner.cdcEventSequenceNumber;
    }
  } /**
    * Buffer one CDC event for retry and schedule replay when possible.
    * @param {Object} cdcEvent - Event payload.
    * @param {string} reason - Buffering reason.
    * @return {boolean} True when buffered, false when dropped.
    */
  bufferCDCEventForRetry(cdcEvent, reason) {
    if (stryMutAct_9fa48("99734")) {
      {}
    } else {
      stryCov_9fa48("99734");
      if (stryMutAct_9fa48("99737") ? false : stryMutAct_9fa48("99736") ? true : stryMutAct_9fa48("99735") ? this.shouldBufferCdcWithoutSubscribers(cdcEvent.tableName) : (stryCov_9fa48("99735", "99736", "99737"), !this.shouldBufferCdcWithoutSubscribers(cdcEvent.tableName))) {
        if (stryMutAct_9fa48("99738")) {
          {}
        } else {
          stryCov_9fa48("99738");
          return stryMutAct_9fa48("99739") ? true : (stryCov_9fa48("99739"), false);
        }
      }
      const buffered = this.owner.cdcEventBuffer.buffer(cdcEvent);
      if (stryMutAct_9fa48("99741") ? false : stryMutAct_9fa48("99740") ? true : (stryCov_9fa48("99740", "99741"), buffered)) {
        if (stryMutAct_9fa48("99742")) {
          {}
        } else {
          stryCov_9fa48("99742");
          incrementBoundedOwnerCounter(this.owner, PARTITION_CDC_DELIVERY_LITERAL.CDCREPLAYBUFFERGROWTHCOUNT);
          this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_BUFFERED);
          this.owner.logger.warn(PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_BUFFERED_FOR_RETRY, stryMutAct_9fa48("99743") ? {} : (stryCov_9fa48("99743"), {
            partitionId: this.owner.partitionId,
            tableName: cdcEvent.tableName,
            operation: cdcEvent.operation,
            reason,
            bufferedEvents: this.owner.cdcEventBuffer.size(),
            replayBufferGrowthCount: stryMutAct_9fa48("99746") ? this.owner.cdcReplayBufferGrowthCount && NUM.ZERO : stryMutAct_9fa48("99745") ? false : stryMutAct_9fa48("99744") ? true : (stryCov_9fa48("99744", "99745", "99746"), this.owner.cdcReplayBufferGrowthCount || NUM.ZERO)
          }));
          this.scheduleBufferedCDCReplay(reason);
          return stryMutAct_9fa48("99747") ? false : (stryCov_9fa48("99747"), true);
        }
      }
      this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DROPPED);
      this.owner.logger.warn(CDC_LIFECYCLE_LOG_MSG.EVENT_DROPPED_OVERFLOW, stryMutAct_9fa48("99748") ? {} : (stryCov_9fa48("99748"), {
        partitionId: this.owner.partitionId,
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        reason,
        bufferedEvents: this.owner.cdcEventBuffer.size(),
        bufferCapacity: this.owner.cdcEventBuffer.capacity
      }));
      return stryMutAct_9fa48("99749") ? true : (stryCov_9fa48("99749"), false);
    }
  } /**
    * Schedule buffered CDC replay with bounded backoff.
    * @param {string} reason - Trigger reason.
    */
  scheduleBufferedCDCReplay(reason) {
    if (stryMutAct_9fa48("99750")) {
      {}
    } else {
      stryCov_9fa48("99750");
      if (stryMutAct_9fa48("99753") ? this.owner.cdcBufferReplayTimer && this.owner.cdcBufferReplayInFlight : stryMutAct_9fa48("99752") ? false : stryMutAct_9fa48("99751") ? true : (stryCov_9fa48("99751", "99752", "99753"), this.owner.cdcBufferReplayTimer || this.owner.cdcBufferReplayInFlight)) {
        if (stryMutAct_9fa48("99754")) {
          {}
        } else {
          stryCov_9fa48("99754");
          return;
        }
      }
      if (stryMutAct_9fa48("99756") ? false : stryMutAct_9fa48("99755") ? true : (stryCov_9fa48("99755", "99756"), this.owner.isShutdown)) {
        if (stryMutAct_9fa48("99757")) {
          {}
        } else {
          stryCov_9fa48("99757");
          this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, stryMutAct_9fa48("99758") ? {} : (stryCov_9fa48("99758"), {
            partitionId: this.owner.partitionId,
            timer: PARTITION_CDC_DELIVERY_LITERAL.CDCBUFFERREPLAYTIMER
          }));
          return;
        }
      }
      if (stryMutAct_9fa48("99761") ? this.owner.cdcSubscribers.size === NUM.ZERO && !this.owner.cdcEventBuffer.hasEvents() : stryMutAct_9fa48("99760") ? false : stryMutAct_9fa48("99759") ? true : (stryCov_9fa48("99759", "99760", "99761"), (stryMutAct_9fa48("99763") ? this.owner.cdcSubscribers.size !== NUM.ZERO : stryMutAct_9fa48("99762") ? false : (stryCov_9fa48("99762", "99763"), this.owner.cdcSubscribers.size === NUM.ZERO)) || (stryMutAct_9fa48("99764") ? this.owner.cdcEventBuffer.hasEvents() : (stryCov_9fa48("99764"), !this.owner.cdcEventBuffer.hasEvents())))) {
        if (stryMutAct_9fa48("99765")) {
          {}
        } else {
          stryCov_9fa48("99765");
          return;
        }
      }
      const retryDelayMs = stryMutAct_9fa48("99766") ? Math.min(NUM.ONE, Math.floor(this.owner.cdcBufferReplayDelayMs)) : (stryCov_9fa48("99766"), Math.max(NUM.ONE, Math.floor(this.owner.cdcBufferReplayDelayMs)));
      this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_SCHEDULED, stryMutAct_9fa48("99767") ? {} : (stryCov_9fa48("99767"), {
        partitionId: this.owner.partitionId,
        reason,
        retryDelayMs,
        bufferedEvents: this.owner.cdcEventBuffer.size(),
        subscriberCount: this.owner.cdcSubscribers.size
      }));
      this.owner.cdcBufferReplayTimer = setTimeout(() => {
        if (stryMutAct_9fa48("99768")) {
          {}
        } else {
          stryCov_9fa48("99768");
          this.owner.cdcBufferReplayTimer = null;
          this.flushBufferedCDCEvents(reason).catch(error => {
            if (stryMutAct_9fa48("99769")) {
              {}
            } else {
              stryCov_9fa48("99769");
              incrementBoundedOwnerCounter(this.owner, PARTITION_CDC_DELIVERY_LITERAL.CDCREPLAYRETRYDEPTH);
              this.owner.logger.warn(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_FAILED, stryMutAct_9fa48("99770") ? {} : (stryCov_9fa48("99770"), {
                partitionId: this.owner.partitionId,
                reason,
                error: error.message,
                replayRetryDepth: stryMutAct_9fa48("99773") ? this.owner.cdcReplayRetryDepth && NUM.ZERO : stryMutAct_9fa48("99772") ? false : stryMutAct_9fa48("99771") ? true : (stryCov_9fa48("99771", "99772", "99773"), this.owner.cdcReplayRetryDepth || NUM.ZERO),
                replayBufferGrowthCount: stryMutAct_9fa48("99776") ? this.owner.cdcReplayBufferGrowthCount && NUM.ZERO : stryMutAct_9fa48("99775") ? false : stryMutAct_9fa48("99774") ? true : (stryCov_9fa48("99774", "99775", "99776"), this.owner.cdcReplayBufferGrowthCount || NUM.ZERO)
              }));
            }
          });
        }
      }, retryDelayMs);
    }
  } /**
    * Replay buffered CDC events to current subscribers.
    * @param {string} reason - Trigger reason.
    * @return {Promise<void>}
    */
  async flushBufferedCDCEvents(reason) {
    if (stryMutAct_9fa48("99777")) {
      {}
    } else {
      stryCov_9fa48("99777");
      if (stryMutAct_9fa48("99779") ? false : stryMutAct_9fa48("99778") ? true : (stryCov_9fa48("99778", "99779"), this.owner.cdcBufferReplayInFlight)) {
        if (stryMutAct_9fa48("99780")) {
          {}
        } else {
          stryCov_9fa48("99780");
          return;
        }
      }
      if (stryMutAct_9fa48("99783") ? this.owner.cdcSubscribers.size === NUM.ZERO && !this.owner.cdcEventBuffer.hasEvents() : stryMutAct_9fa48("99782") ? false : stryMutAct_9fa48("99781") ? true : (stryCov_9fa48("99781", "99782", "99783"), (stryMutAct_9fa48("99785") ? this.owner.cdcSubscribers.size !== NUM.ZERO : stryMutAct_9fa48("99784") ? false : (stryCov_9fa48("99784", "99785"), this.owner.cdcSubscribers.size === NUM.ZERO)) || (stryMutAct_9fa48("99786") ? this.owner.cdcEventBuffer.hasEvents() : (stryCov_9fa48("99786"), !this.owner.cdcEventBuffer.hasEvents())))) {
        if (stryMutAct_9fa48("99787")) {
          {}
        } else {
          stryCov_9fa48("99787");
          return;
        }
      }
      this.owner.cdcBufferReplayInFlight = stryMutAct_9fa48("99788") ? false : (stryCov_9fa48("99788"), true);
      let replayedEvents = NUM.ZERO;
      try {
        if (stryMutAct_9fa48("99789")) {
          {}
        } else {
          stryCov_9fa48("99789");
          while (stryMutAct_9fa48("99791") ? this.owner.cdcSubscribers.size > NUM.ZERO || this.owner.cdcEventBuffer.hasEvents() : stryMutAct_9fa48("99790") ? false : (stryCov_9fa48("99790", "99791"), (stryMutAct_9fa48("99794") ? this.owner.cdcSubscribers.size <= NUM.ZERO : stryMutAct_9fa48("99793") ? this.owner.cdcSubscribers.size >= NUM.ZERO : stryMutAct_9fa48("99792") ? true : (stryCov_9fa48("99792", "99793", "99794"), this.owner.cdcSubscribers.size > NUM.ZERO)) && this.owner.cdcEventBuffer.hasEvents())) {
            if (stryMutAct_9fa48("99795")) {
              {}
            } else {
              stryCov_9fa48("99795");
              const replayedCount = await this.owner.cdcEventBuffer.replay(async cdcEvent => {
                if (stryMutAct_9fa48("99796")) {
                  {}
                } else {
                  stryCov_9fa48("99796");
                  const subscribers = stryMutAct_9fa48("99797") ? [] : (stryCov_9fa48("99797"), [...this.owner.cdcSubscribers]);
                  for (const subscriber of subscribers) {
                    if (stryMutAct_9fa48("99798")) {
                      {}
                    } else {
                      stryCov_9fa48("99798");
                      await this.deliverCDCEventToSubscriber(subscriber, markReplayOnlyCdcEvent(cdcEvent));
                    }
                  }
                  this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
                  this.owner.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
                }
              });
              stryMutAct_9fa48("99799") ? replayedEvents -= replayedCount : (stryCov_9fa48("99799"), replayedEvents += replayedCount);
              if (stryMutAct_9fa48("99802") ? replayedCount !== NUM.ZERO : stryMutAct_9fa48("99801") ? false : stryMutAct_9fa48("99800") ? true : (stryCov_9fa48("99800", "99801", "99802"), replayedCount === NUM.ZERO)) {
                if (stryMutAct_9fa48("99803")) {
                  {}
                } else {
                  stryCov_9fa48("99803");
                  break;
                }
              }
            }
          }
          this.owner.cdcBufferReplayDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
          this.owner.cdcReplayRetryDepth = NUM.ZERO;
          this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_COMPLETE, stryMutAct_9fa48("99804") ? {} : (stryCov_9fa48("99804"), {
            partitionId: this.owner.partitionId,
            reason,
            replayedEvents,
            bufferedEvents: this.owner.cdcEventBuffer.size()
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("99805")) {
          {}
        } else {
          stryCov_9fa48("99805");
          this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
          this.owner.cdcBufferReplayDelayMs = this.resolveBufferedReplayDelayAfterError(error);
          incrementBoundedOwnerCounter(this.owner, PARTITION_CDC_DELIVERY_LITERAL.CDCREPLAYRETRYDEPTH);
          this.owner.logger.warn(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_FAILED, stryMutAct_9fa48("99806") ? {} : (stryCov_9fa48("99806"), {
            partitionId: this.owner.partitionId,
            reason,
            error: error.message,
            retryDelayMs: this.owner.cdcBufferReplayDelayMs,
            bufferedEvents: this.owner.cdcEventBuffer.size(),
            replayRetryDepth: stryMutAct_9fa48("99809") ? this.owner.cdcReplayRetryDepth && NUM.ZERO : stryMutAct_9fa48("99808") ? false : stryMutAct_9fa48("99807") ? true : (stryCov_9fa48("99807", "99808", "99809"), this.owner.cdcReplayRetryDepth || NUM.ZERO),
            replayBufferGrowthCount: stryMutAct_9fa48("99812") ? this.owner.cdcReplayBufferGrowthCount && NUM.ZERO : stryMutAct_9fa48("99811") ? false : stryMutAct_9fa48("99810") ? true : (stryCov_9fa48("99810", "99811", "99812"), this.owner.cdcReplayBufferGrowthCount || NUM.ZERO)
          }));
        }
      } finally {
        if (stryMutAct_9fa48("99813")) {
          {}
        } else {
          stryCov_9fa48("99813");
          this.owner.cdcBufferReplayInFlight = stryMutAct_9fa48("99814") ? true : (stryCov_9fa48("99814"), false);
        }
      }
      if (stryMutAct_9fa48("99817") ? this.owner.cdcSubscribers.size > NUM.ZERO || this.owner.cdcEventBuffer.hasEvents() : stryMutAct_9fa48("99816") ? false : stryMutAct_9fa48("99815") ? true : (stryCov_9fa48("99815", "99816", "99817"), (stryMutAct_9fa48("99820") ? this.owner.cdcSubscribers.size <= NUM.ZERO : stryMutAct_9fa48("99819") ? this.owner.cdcSubscribers.size >= NUM.ZERO : stryMutAct_9fa48("99818") ? true : (stryCov_9fa48("99818", "99819", "99820"), this.owner.cdcSubscribers.size > NUM.ZERO)) && this.owner.cdcEventBuffer.hasEvents())) {
        if (stryMutAct_9fa48("99821")) {
          {}
        } else {
          stryCov_9fa48("99821");
          this.scheduleBufferedCDCReplay(PARTITION_SERVICE_CDC.REPLAY_REASON_BUFFERED_REMAINING);
        }
      }
    }
  } /**
    * Resolve a stable subscriber identifier.
    * @param {Function|Object} subscriber - Subscriber.
    * @param {Object} options - Subscription options.
    * @return {string} Stable subscriber identifier.
    */
  resolveCDCSubscriberId(subscriber, options = {}) {
    if (stryMutAct_9fa48("99822")) {
      {}
    } else {
      stryCov_9fa48("99822");
      const candidateId = options.subscriberId;
      if (stryMutAct_9fa48("99825") ? typeof candidateId === TYPEOF.STRING || candidateId.length > NUM.ZERO : stryMutAct_9fa48("99824") ? false : stryMutAct_9fa48("99823") ? true : (stryCov_9fa48("99823", "99824", "99825"), (stryMutAct_9fa48("99827") ? typeof candidateId !== TYPEOF.STRING : stryMutAct_9fa48("99826") ? true : (stryCov_9fa48("99826", "99827"), typeof candidateId === TYPEOF.STRING)) && (stryMutAct_9fa48("99830") ? candidateId.length <= NUM.ZERO : stryMutAct_9fa48("99829") ? candidateId.length >= NUM.ZERO : stryMutAct_9fa48("99828") ? true : (stryCov_9fa48("99828", "99829", "99830"), candidateId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("99831")) {
          {}
        } else {
          stryCov_9fa48("99831");
          return candidateId;
        }
      }
      const existingState = this.owner.cdcSubscriberStates.get(subscriber);
      if (stryMutAct_9fa48("99834") ? existingState.subscriberId : stryMutAct_9fa48("99833") ? false : stryMutAct_9fa48("99832") ? true : (stryCov_9fa48("99832", "99833", "99834"), existingState?.subscriberId)) {
        if (stryMutAct_9fa48("99835")) {
          {}
        } else {
          stryCov_9fa48("99835");
          return existingState.subscriberId;
        }
      }
      const fallbackOrdinal = stryMutAct_9fa48("99836") ? this.owner.cdcSubscriberStates.size - NUM.ONE : (stryCov_9fa48("99836"), this.owner.cdcSubscriberStates.size + NUM.ONE);
      return stryMutAct_9fa48("99837") ? `` : (stryCov_9fa48("99837"), `${PARTITION_SERVICE_CDC.SUBSCRIBER_ID_PREFIX}-${fallbackOrdinal}`);
    }
  } /**
    * Deliver one CDC event to a subscriber callback/object.
    * @param {Function|Object} subscriber - Subscriber callback/object.
    * @param {Object} cdcEvent - Event payload.
    * @return {Promise<void>}
    */
  async deliverCDCEventToSubscriber(subscriber, cdcEvent) {
    if (stryMutAct_9fa48("99838")) {
      {}
    } else {
      stryCov_9fa48("99838");
      const readiness = this.resolveCDCSubscriberReadiness(subscriber, cdcEvent);
      if (stryMutAct_9fa48("99841") ? readiness.ready === true : stryMutAct_9fa48("99840") ? false : stryMutAct_9fa48("99839") ? true : (stryCov_9fa48("99839", "99840", "99841"), readiness.ready !== (stryMutAct_9fa48("99842") ? false : (stryCov_9fa48("99842"), true)))) {
        if (stryMutAct_9fa48("99843")) {
          {}
        } else {
          stryCov_9fa48("99843");
          const error = new Error(stryMutAct_9fa48("99846") ? readiness.reason && CDC_SUBSCRIBER_NOT_READY_MSG : stryMutAct_9fa48("99845") ? false : stryMutAct_9fa48("99844") ? true : (stryCov_9fa48("99844", "99845", "99846"), readiness.reason || CDC_SUBSCRIBER_NOT_READY_MSG));
          error.ownerNotReady = stryMutAct_9fa48("99847") ? false : (stryCov_9fa48("99847"), true);
          if (stryMutAct_9fa48("99851") ? readiness.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("99850") ? readiness.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("99849") ? false : stryMutAct_9fa48("99848") ? true : (stryCov_9fa48("99848", "99849", "99850", "99851"), readiness.retryAfterMs > NUM.ZERO)) {
            if (stryMutAct_9fa48("99852")) {
              {}
            } else {
              stryCov_9fa48("99852");
              error.retryAfterMs = readiness.retryAfterMs;
            }
          }
          throw error;
        }
      }
      if (stryMutAct_9fa48("99855") ? typeof subscriber !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("99854") ? false : stryMutAct_9fa48("99853") ? true : (stryCov_9fa48("99853", "99854", "99855"), typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("99856")) {
          {}
        } else {
          stryCov_9fa48("99856");
          await subscriber(cdcEvent);
          return;
        }
      }
      await subscriber.handleCDCEvent(cdcEvent);
    }
  } /**
    * Create a wrapper that enriches stream metadata for one subscriber.
    * @param {Function|Object} subscriber - Target subscriber.
    * @param {Object} subscriptionState - Mutable state for this subscriber.
    * @return {Function} Wrapper callback.
    */
  buildCDCSubscriberWrapper(subscriber, subscriptionState) {
    if (stryMutAct_9fa48("99857")) {
      {}
    } else {
      stryCov_9fa48("99857");
      return async cdcEvent => {
        if (stryMutAct_9fa48("99858")) {
          {}
        } else {
          stryCov_9fa48("99858");
          const sequencedEvent = Number.isFinite(cdcEvent.sequenceNumber) ? cdcEvent : stryMutAct_9fa48("99859") ? {} : (stryCov_9fa48("99859"), {
            ...cdcEvent,
            sequenceNumber: this.nextCDCEventSequenceNumber()
          });
          const decoratedEvent = stryMutAct_9fa48("99860") ? {} : (stryCov_9fa48("99860"), {
            ...sequencedEvent,
            streamMode: subscriptionState.streamMode,
            subscriberId: subscriptionState.subscriberId,
            subscriptionEpoch: subscriptionState.subscriptionEpoch
          });
          await this.deliverCDCEventToSubscriber(subscriber, decoratedEvent);
          this.owner.cdcEventBuffer.recordDelivered(cdcEvent);
          subscriptionState.lastDeliveredSequenceNumber = decoratedEvent.sequenceNumber;
          subscriptionState.lastDeliveredAt = Date.now();
        }
      };
    }
  } /**
    * Subscribe to CDC with explicit handshake acknowledgment and catch-up.
    * @param {Function|Object} subscriber - Subscriber function or object.
    * @param {Object} [options] - Handshake options.
    * @param {string} [options.subscriberId] - Stable subscriber identifier.
    * @return {Promise<Object>} Handshake acknowledgment.
    */
  async subscribeToCDCWithHandshake(subscriber, options = {}) {
    if (stryMutAct_9fa48("99861")) {
      {}
    } else {
      stryCov_9fa48("99861");
      if (stryMutAct_9fa48("99864") ? false : stryMutAct_9fa48("99863") ? true : stryMutAct_9fa48("99862") ? isCDCSubscriber(subscriber) : (stryCov_9fa48("99862", "99863", "99864"), !isCDCSubscriber(subscriber))) {
        if (stryMutAct_9fa48("99865")) {
          {}
        } else {
          stryCov_9fa48("99865");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.CDC_INVALID_SUBSCRIBER);
        }
      }
      const existingWrapper = this.owner.cdcSubscriberWrappers.get(subscriber);
      const status = existingWrapper ? PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_ALREADY_SUBSCRIBED : PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK;
      const subscriptionEpoch = stryMutAct_9fa48("99866") ? this.owner.cdcSubscriptionEpoch - NUM.ONE : (stryCov_9fa48("99866"), this.owner.cdcSubscriptionEpoch + NUM.ONE);
      this.owner.cdcSubscriptionEpoch = subscriptionEpoch;
      const handshakeStartSequence = this.owner.cdcEventSequenceNumber;
      const subscriberId = this.resolveCDCSubscriberId(subscriber, options);
      let subscriptionState = this.owner.cdcSubscriberStates.get(subscriber);
      let nextCatchupCompletedAt = null;
      if (stryMutAct_9fa48("99869") ? false : stryMutAct_9fa48("99868") ? true : stryMutAct_9fa48("99867") ? subscriptionState : (stryCov_9fa48("99867", "99868", "99869"), !subscriptionState)) {
        if (stryMutAct_9fa48("99870")) {
          {}
        } else {
          stryCov_9fa48("99870");
          subscriptionState = stryMutAct_9fa48("99871") ? {} : (stryCov_9fa48("99871"), {
            subscriberId,
            subscriptionEpoch,
            streamMode: PARTITION_SERVICE_CDC.STREAM_MODE_STEADY,
            lastDeliveredSequenceNumber: null,
            lastDeliveredAt: null,
            catchupCompletedAt: nextCatchupCompletedAt
          });
          this.owner.cdcSubscriberStates.set(subscriber, subscriptionState);
        }
      } else {
        if (stryMutAct_9fa48("99872")) {
          {}
        } else {
          stryCov_9fa48("99872");
          subscriptionState.subscriberId = subscriberId;
          subscriptionState.subscriptionEpoch = subscriptionEpoch;
        }
      }
      let wrapper = existingWrapper;
      if (stryMutAct_9fa48("99875") ? false : stryMutAct_9fa48("99874") ? true : stryMutAct_9fa48("99873") ? wrapper : (stryCov_9fa48("99873", "99874", "99875"), !wrapper)) {
        if (stryMutAct_9fa48("99876")) {
          {}
        } else {
          stryCov_9fa48("99876");
          wrapper = this.buildCDCSubscriberWrapper(subscriber, subscriptionState);
          wrapper.cdcSourceSubscriber = subscriber;
          this.owner.cdcSubscriberWrappers.set(subscriber, wrapper);
          this.owner.cdcSubscribers.add(wrapper);
          this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_ADDED, stryMutAct_9fa48("99877") ? {} : (stryCov_9fa48("99877"), {
            partitionId: this.owner.partitionId,
            subscriberId,
            subscriberCount: this.owner.cdcSubscribers.size
          }));
        }
      }
      const bufferedEventsAtHandshake = this.owner.cdcEventBuffer.size();
      let catchupMode = (stryMutAct_9fa48("99881") ? bufferedEventsAtHandshake <= NUM.ZERO : stryMutAct_9fa48("99880") ? bufferedEventsAtHandshake >= NUM.ZERO : stryMutAct_9fa48("99879") ? false : stryMutAct_9fa48("99878") ? true : (stryCov_9fa48("99878", "99879", "99880", "99881"), bufferedEventsAtHandshake > NUM.ZERO)) ? PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL : PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE;
      let bufferedEventsReplayed = NUM.ZERO;
      let catchupCompletedAt = Date.now();
      let preserveReplayDelayAfterHandshake = stryMutAct_9fa48("99882") ? true : (stryCov_9fa48("99882"), false);
      const deliveredIdentities = new Set();
      if (stryMutAct_9fa48("99885") ? catchupMode !== PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL : stryMutAct_9fa48("99884") ? false : stryMutAct_9fa48("99883") ? true : (stryCov_9fa48("99883", "99884", "99885"), catchupMode === PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL)) {
        if (stryMutAct_9fa48("99886")) {
          {}
        } else {
          stryCov_9fa48("99886");
          subscriptionState.streamMode = PARTITION_SERVICE_CDC.STREAM_MODE_CATCHUP;
          this.owner.emit(PARTITION_SERVICE_EVENT.CDC_CATCHUP_STARTED, stryMutAct_9fa48("99887") ? {} : (stryCov_9fa48("99887"), {
            partitionId: this.owner.partitionId,
            subscriberId,
            subscriptionEpoch,
            bufferedEventsAtHandshake
          }));
          this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_CATCHUP_STARTED, stryMutAct_9fa48("99888") ? {} : (stryCov_9fa48("99888"), {
            partitionId: this.owner.partitionId,
            subscriberId,
            subscriptionEpoch,
            bufferedEventsAtHandshake
          }));
          const trackingWrapper = async cdcEvent => {
            if (stryMutAct_9fa48("99889")) {
              {}
            } else {
              stryCov_9fa48("99889");
              deliveredIdentities.add(buildEventIdentity(cdcEvent));
              await wrapper(markReplayOnlyCdcEvent(cdcEvent));
            }
          };
          try {
            if (stryMutAct_9fa48("99890")) {
              {}
            } else {
              stryCov_9fa48("99890");
              bufferedEventsReplayed = await this.owner.cdcEventBuffer.replay(trackingWrapper);
              this.owner.cdcReplayRetryDepth = NUM.ZERO;
            }
          } catch (error) {
            if (stryMutAct_9fa48("99891")) {
              {}
            } else {
              stryCov_9fa48("99891");
              this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
              this.owner.cdcBufferReplayDelayMs = this.resolveBufferedReplayDelayAfterError(error);
              incrementBoundedOwnerCounter(this.owner, PARTITION_CDC_DELIVERY_LITERAL.CDCREPLAYRETRYDEPTH);
              preserveReplayDelayAfterHandshake = stryMutAct_9fa48("99894") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("99893") ? false : stryMutAct_9fa48("99892") ? true : (stryCov_9fa48("99892", "99893", "99894"), Number.isFinite(stryMutAct_9fa48("99895") ? error.retryAfterMs : (stryCov_9fa48("99895"), error?.retryAfterMs)) && (stryMutAct_9fa48("99898") ? error.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("99897") ? error.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("99896") ? true : (stryCov_9fa48("99896", "99897", "99898"), error.retryAfterMs > NUM.ZERO)));
              this.owner.logger.warn(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_FAILED, stryMutAct_9fa48("99899") ? {} : (stryCov_9fa48("99899"), {
                partitionId: this.owner.partitionId,
                subscriberId,
                reason: PARTITION_CDC_DELIVERY_LITERAL.HANDSHAKE_CATCHUP_REPLAY_FAILED,
                error: error.message,
                retryDelayMs: this.owner.cdcBufferReplayDelayMs,
                bufferedEvents: this.owner.cdcEventBuffer.size(),
                replayRetryDepth: stryMutAct_9fa48("99902") ? this.owner.cdcReplayRetryDepth && NUM.ZERO : stryMutAct_9fa48("99901") ? false : stryMutAct_9fa48("99900") ? true : (stryCov_9fa48("99900", "99901", "99902"), this.owner.cdcReplayRetryDepth || NUM.ZERO),
                replayBufferGrowthCount: stryMutAct_9fa48("99905") ? this.owner.cdcReplayBufferGrowthCount && NUM.ZERO : stryMutAct_9fa48("99904") ? false : stryMutAct_9fa48("99903") ? true : (stryCov_9fa48("99903", "99904", "99905"), this.owner.cdcReplayBufferGrowthCount || NUM.ZERO)
              }));
            }
          }
          catchupCompletedAt = Date.now();
          nextCatchupCompletedAt = catchupCompletedAt;
          this.owner.emit(PARTITION_SERVICE_EVENT.CDC_CATCHUP_COMPLETED, stryMutAct_9fa48("99906") ? {} : (stryCov_9fa48("99906"), {
            partitionId: this.owner.partitionId,
            subscriberId,
            subscriptionEpoch,
            bufferedEventsReplayed,
            bufferedEventsRemaining: this.owner.cdcEventBuffer.size()
          }));
          this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_CATCHUP_COMPLETED, stryMutAct_9fa48("99907") ? {} : (stryCov_9fa48("99907"), {
            partitionId: this.owner.partitionId,
            subscriberId,
            subscriptionEpoch,
            bufferedEventsReplayed,
            bufferedEventsRemaining: this.owner.cdcEventBuffer.size()
          }));
        }
      } // Sliding window replay: deliver recent events that the new
      // subscriber missed, deduplicating against buffer-replayed events.
      // Skip for already-subscribed subscribers — they already received
      // these events during their prior subscription.
      // Delivers directly to subscriber (not through wrapper) to avoid
      // re-recording events that are already in the sliding window.
      let slidingWindowEventsReplayed = NUM.ZERO;
      if (stryMutAct_9fa48("99910") ? false : stryMutAct_9fa48("99909") ? true : stryMutAct_9fa48("99908") ? existingWrapper : (stryCov_9fa48("99908", "99909", "99910"), !existingWrapper)) {
        if (stryMutAct_9fa48("99911")) {
          {}
        } else {
          stryCov_9fa48("99911");
          const recentEvents = this.owner.cdcEventBuffer.getRecentEvents();
          for (const cdcEvent of recentEvents) {
            if (stryMutAct_9fa48("99912")) {
              {}
            } else {
              stryCov_9fa48("99912");
              const identity = buildEventIdentity(cdcEvent);
              if (stryMutAct_9fa48("99914") ? false : stryMutAct_9fa48("99913") ? true : (stryCov_9fa48("99913", "99914"), deliveredIdentities.has(identity))) {
                if (stryMutAct_9fa48("99915")) {
                  {}
                } else {
                  stryCov_9fa48("99915");
                  continue;
                }
              }
              deliveredIdentities.add(identity);
              const replayEvent = stryMutAct_9fa48("99916") ? {} : (stryCov_9fa48("99916"), {
                ...markReplayOnlyCdcEvent(cdcEvent),
                sequenceNumber: Number.isFinite(cdcEvent.sequenceNumber) ? cdcEvent.sequenceNumber : this.nextCDCEventSequenceNumber(),
                streamMode: subscriptionState.streamMode,
                subscriberId: subscriptionState.subscriberId,
                subscriptionEpoch: subscriptionState.subscriptionEpoch
              });
              await this.deliverCDCEventToSubscriber(subscriber, replayEvent);
              subscriptionState.lastDeliveredSequenceNumber = replayEvent.sequenceNumber;
              subscriptionState.lastDeliveredAt = Date.now();
              stryMutAct_9fa48("99917") ? slidingWindowEventsReplayed-- : (stryCov_9fa48("99917"), slidingWindowEventsReplayed++);
            }
          }
          if (stryMutAct_9fa48("99920") ? catchupMode === PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE || slidingWindowEventsReplayed > NUM.ZERO : stryMutAct_9fa48("99919") ? false : stryMutAct_9fa48("99918") ? true : (stryCov_9fa48("99918", "99919", "99920"), (stryMutAct_9fa48("99922") ? catchupMode !== PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE : stryMutAct_9fa48("99921") ? true : (stryCov_9fa48("99921", "99922"), catchupMode === PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE)) && (stryMutAct_9fa48("99925") ? slidingWindowEventsReplayed <= NUM.ZERO : stryMutAct_9fa48("99924") ? slidingWindowEventsReplayed >= NUM.ZERO : stryMutAct_9fa48("99923") ? true : (stryCov_9fa48("99923", "99924", "99925"), slidingWindowEventsReplayed > NUM.ZERO)))) {
            if (stryMutAct_9fa48("99926")) {
              {}
            } else {
              stryCov_9fa48("99926");
              catchupMode = PARTITION_SERVICE_CDC.CATCHUP_MODE_SLIDING_WINDOW;
            }
          }
        }
      }
      subscriptionState.streamMode = PARTITION_SERVICE_CDC.STREAM_MODE_STEADY;
      subscriptionState.subscriptionEpoch = subscriptionEpoch;
      subscriptionState.catchupCompletedAt = nextCatchupCompletedAt;
      const handshake = stryMutAct_9fa48("99927") ? {} : (stryCov_9fa48("99927"), {
        status,
        subscriberId,
        subscriptionEpoch,
        versionContext: stryMutAct_9fa48("99928") ? {} : (stryCov_9fa48("99928"), {
          streamVersion: this.owner.cdcEventSequenceNumber,
          handshakeStartSequence
        }),
        catchup: stryMutAct_9fa48("99929") ? {} : (stryCov_9fa48("99929"), {
          mode: catchupMode,
          bufferedEventsAtHandshake,
          bufferedEventsReplayed,
          slidingWindowEventsReplayed,
          completed: stryMutAct_9fa48("99932") ? this.owner.cdcEventBuffer.size() !== NUM.ZERO : stryMutAct_9fa48("99931") ? false : stryMutAct_9fa48("99930") ? true : (stryCov_9fa48("99930", "99931", "99932"), this.owner.cdcEventBuffer.size() === NUM.ZERO),
          completedAt: catchupCompletedAt
        }),
        streamMode: subscriptionState.streamMode
      });
      this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIPTION_HANDSHAKE_ACK, stryMutAct_9fa48("99933") ? {} : (stryCov_9fa48("99933"), {
        partitionId: this.owner.partitionId,
        subscriberId,
        subscriptionEpoch,
        status: handshake.status,
        catchupMode: handshake.catchup.mode,
        bufferedEventsAtHandshake,
        bufferedEventsReplayed,
        streamVersion: handshake.versionContext.streamVersion
      }));
      if (stryMutAct_9fa48("99936") ? false : stryMutAct_9fa48("99935") ? true : stryMutAct_9fa48("99934") ? preserveReplayDelayAfterHandshake : (stryCov_9fa48("99934", "99935", "99936"), !preserveReplayDelayAfterHandshake)) {
        if (stryMutAct_9fa48("99937")) {
          {}
        } else {
          stryCov_9fa48("99937");
          this.owner.cdcBufferReplayDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
        }
      }
      this.scheduleBufferedCDCReplay(PARTITION_CDC_DELIVERY_LITERAL.POST_SUBSCRIPTION_HANDSHAKE);
      return handshake;
    }
  } /**
    * Subscribe to CDC events from this partition.
    * @param {Function|Object} subscriber - Subscriber function or object.
    */
  subscribeToCDC(subscriber) {
    if (stryMutAct_9fa48("99938")) {
      {}
    } else {
      stryCov_9fa48("99938");
      this.subscribeToCDCWithHandshake(subscriber).catch(error => {
        if (stryMutAct_9fa48("99939")) {
          {}
        } else {
          stryCov_9fa48("99939");
          this.owner.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_SUBSCRIPTION_FAILED, stryMutAct_9fa48("99940") ? {} : (stryCov_9fa48("99940"), {
            partitionId: this.owner.partitionId,
            error: error.message
          }));
        }
      });
    }
  } /**
    * Unsubscribe from CDC events.
    * @param {Function|Object} subscriber - Subscriber to remove.
    */
  unsubscribeFromCDC(subscriber) {
    if (stryMutAct_9fa48("99941")) {
      {}
    } else {
      stryCov_9fa48("99941");
      const wrapper = this.owner.cdcSubscriberWrappers.get(subscriber);
      const subscriberToDelete = stryMutAct_9fa48("99944") ? wrapper && subscriber : stryMutAct_9fa48("99943") ? false : stryMutAct_9fa48("99942") ? true : (stryCov_9fa48("99942", "99943", "99944"), wrapper || subscriber);
      this.owner.cdcSubscribers.delete(subscriberToDelete);
      this.owner.cdcSubscriberWrappers.delete(subscriber);
      this.owner.cdcSubscriberStates.delete(subscriber);
      if (stryMutAct_9fa48("99947") ? this.owner.cdcSubscribers.size === NUM.ZERO || this.owner.cdcBufferReplayTimer : stryMutAct_9fa48("99946") ? false : stryMutAct_9fa48("99945") ? true : (stryCov_9fa48("99945", "99946", "99947"), (stryMutAct_9fa48("99949") ? this.owner.cdcSubscribers.size !== NUM.ZERO : stryMutAct_9fa48("99948") ? true : (stryCov_9fa48("99948", "99949"), this.owner.cdcSubscribers.size === NUM.ZERO)) && this.owner.cdcBufferReplayTimer)) {
        if (stryMutAct_9fa48("99950")) {
          {}
        } else {
          stryCov_9fa48("99950");
          clearTimeout(this.owner.cdcBufferReplayTimer);
          this.owner.cdcBufferReplayTimer = null;
        }
      }
      this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_REMOVED, stryMutAct_9fa48("99951") ? {} : (stryCov_9fa48("99951"), {
        partitionId: this.owner.partitionId,
        subscriberCount: this.owner.cdcSubscribers.size
      }));
    }
  } /**
    * Get CDC subscription diagnostics for this partition.
    * @return {Object} CDC subscription diagnostics.
    */
  getCDCSubscriptionDiagnostics() {
    if (stryMutAct_9fa48("99952")) {
      {}
    } else {
      stryCov_9fa48("99952");
      const subscriptions = stryMutAct_9fa48("99953") ? ["Stryker was here"] : (stryCov_9fa48("99953"), []);
      for (const state of this.owner.cdcSubscriberStates.values()) {
        if (stryMutAct_9fa48("99954")) {
          {}
        } else {
          stryCov_9fa48("99954");
          subscriptions.push(stryMutAct_9fa48("99955") ? {} : (stryCov_9fa48("99955"), {
            subscriberId: state.subscriberId,
            subscriptionEpoch: state.subscriptionEpoch,
            streamMode: state.streamMode,
            lastDeliveredSequenceNumber: state.lastDeliveredSequenceNumber,
            lastDeliveredAt: state.lastDeliveredAt,
            catchupCompletedAt: state.catchupCompletedAt
          }));
        }
      }
      return stryMutAct_9fa48("99956") ? {} : (stryCov_9fa48("99956"), {
        partitionId: this.owner.partitionId,
        subscriptionEpoch: this.owner.cdcSubscriptionEpoch,
        streamVersion: this.owner.cdcEventSequenceNumber,
        subscriberCount: this.owner.cdcSubscribers.size,
        bufferedEvents: this.owner.cdcEventBuffer.size(),
        bufferReplayInFlight: this.owner.cdcBufferReplayInFlight,
        bufferReplayDelayMs: this.owner.cdcBufferReplayDelayMs,
        subscriptions
      });
    }
  }
}
export { PartitionCDCDelivery };