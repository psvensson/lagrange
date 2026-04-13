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
import { PRESSURE_GOVERNOR_ERROR_CODE } from './pressure-governor.js';
const RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS = Object.freeze(stryMutAct_9fa48("57433") ? [] : (stryCov_9fa48("57433"), [stryMutAct_9fa48("57434") ? "" : (stryCov_9fa48("57434"), 'Distributed operation failed due to participant failures'), stryMutAct_9fa48("57435") ? "" : (stryCov_9fa48("57435"), 'authoritative_row_source_unavailable'), stryMutAct_9fa48("57436") ? "" : (stryCov_9fa48("57436"), 'Outbound queue for node'), stryMutAct_9fa48("57437") ? "" : (stryCov_9fa48("57437"), 'No connection to node'), stryMutAct_9fa48("57438") ? "" : (stryCov_9fa48("57438"), 'Connection to node'), stryMutAct_9fa48("57439") ? "" : (stryCov_9fa48("57439"), 'Message timeout'), stryMutAct_9fa48("57440") ? "" : (stryCov_9fa48("57440"), 'Cache update not observed for'), stryMutAct_9fa48("57441") ? "" : (stryCov_9fa48("57441"), 'query_admission_deferred'), stryMutAct_9fa48("57442") ? "" : (stryCov_9fa48("57442"), 'closed'), stryMutAct_9fa48("57443") ? "" : (stryCov_9fa48("57443"), 'control_plane_pressure_degraded'), stryMutAct_9fa48("57444") ? "" : (stryCov_9fa48("57444"), 'Transaction already active on this partition'), stryMutAct_9fa48("57445") ? "" : (stryCov_9fa48("57445"), 'No active transaction to commit')]));
const MAX_LINKED_CONTROL_PLANE_FAILURES = NUM.EIGHT;
function getDirectControlPlaneErrorMessage(value) {
  if (stryMutAct_9fa48("57446")) {
    {}
  } else {
    stryCov_9fa48("57446");
    if (stryMutAct_9fa48("57449") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("57448") ? false : stryMutAct_9fa48("57447") ? true : (stryCov_9fa48("57447", "57448", "57449"), typeof value === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("57450")) {
        {}
      } else {
        stryCov_9fa48("57450");
        return value;
      }
    }
    if (stryMutAct_9fa48("57453") ? typeof value?.message !== TYPEOF.STRING : stryMutAct_9fa48("57452") ? false : stryMutAct_9fa48("57451") ? true : (stryCov_9fa48("57451", "57452", "57453"), typeof (stryMutAct_9fa48("57454") ? value.message : (stryCov_9fa48("57454"), value?.message)) === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("57455")) {
        {}
      } else {
        stryCov_9fa48("57455");
        return value.message;
      }
    }
    if (stryMutAct_9fa48("57458") ? typeof value?.error !== TYPEOF.STRING : stryMutAct_9fa48("57457") ? false : stryMutAct_9fa48("57456") ? true : (stryCov_9fa48("57456", "57457", "57458"), typeof (stryMutAct_9fa48("57459") ? value.error : (stryCov_9fa48("57459"), value?.error)) === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("57460")) {
        {}
      } else {
        stryCov_9fa48("57460");
        return value.error;
      }
    }
    return stryMutAct_9fa48("57461") ? "Stryker was here!" : (stryCov_9fa48("57461"), '');
  }
}
function getDirectControlPlaneErrorCode(value) {
  if (stryMutAct_9fa48("57462")) {
    {}
  } else {
    stryCov_9fa48("57462");
    if (stryMutAct_9fa48("57465") ? typeof value?.code !== TYPEOF.STRING : stryMutAct_9fa48("57464") ? false : stryMutAct_9fa48("57463") ? true : (stryCov_9fa48("57463", "57464", "57465"), typeof (stryMutAct_9fa48("57466") ? value.code : (stryCov_9fa48("57466"), value?.code)) === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("57467")) {
        {}
      } else {
        stryCov_9fa48("57467");
        return value.code;
      }
    }
    if (stryMutAct_9fa48("57470") ? typeof value?.errorCode !== TYPEOF.STRING : stryMutAct_9fa48("57469") ? false : stryMutAct_9fa48("57468") ? true : (stryCov_9fa48("57468", "57469", "57470"), typeof (stryMutAct_9fa48("57471") ? value.errorCode : (stryCov_9fa48("57471"), value?.errorCode)) === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("57472")) {
        {}
      } else {
        stryCov_9fa48("57472");
        return value.errorCode;
      }
    }
    return stryMutAct_9fa48("57473") ? "Stryker was here!" : (stryCov_9fa48("57473"), '');
  }
}
function getDirectControlPlaneRetryAfterMs(value) {
  if (stryMutAct_9fa48("57474")) {
    {}
  } else {
    stryCov_9fa48("57474");
    return Number.isFinite(stryMutAct_9fa48("57475") ? value.retryAfterMs : (stryCov_9fa48("57475"), value?.retryAfterMs)) ? stryMutAct_9fa48("57476") ? Math.min(NUM.ZERO, Math.floor(value.retryAfterMs)) : (stryCov_9fa48("57476"), Math.max(NUM.ZERO, Math.floor(value.retryAfterMs))) : NUM.ZERO;
  }
}
function collectLinkedControlPlaneFailures(value) {
  if (stryMutAct_9fa48("57477")) {
    {}
  } else {
    stryCov_9fa48("57477");
    const queue = stryMutAct_9fa48("57478") ? [] : (stryCov_9fa48("57478"), [value]);
    const visited = new Set();
    const collected = stryMutAct_9fa48("57479") ? ["Stryker was here"] : (stryCov_9fa48("57479"), []);
    while (stryMutAct_9fa48("57481") ? queue.length > NUM.ZERO || collected.length < MAX_LINKED_CONTROL_PLANE_FAILURES : stryMutAct_9fa48("57480") ? false : (stryCov_9fa48("57480", "57481"), (stryMutAct_9fa48("57484") ? queue.length <= NUM.ZERO : stryMutAct_9fa48("57483") ? queue.length >= NUM.ZERO : stryMutAct_9fa48("57482") ? true : (stryCov_9fa48("57482", "57483", "57484"), queue.length > NUM.ZERO)) && (stryMutAct_9fa48("57487") ? collected.length >= MAX_LINKED_CONTROL_PLANE_FAILURES : stryMutAct_9fa48("57486") ? collected.length <= MAX_LINKED_CONTROL_PLANE_FAILURES : stryMutAct_9fa48("57485") ? true : (stryCov_9fa48("57485", "57486", "57487"), collected.length < MAX_LINKED_CONTROL_PLANE_FAILURES)))) {
      if (stryMutAct_9fa48("57488")) {
        {}
      } else {
        stryCov_9fa48("57488");
        const candidate = queue.shift();
        if (stryMutAct_9fa48("57491") ? false : stryMutAct_9fa48("57490") ? true : stryMutAct_9fa48("57489") ? candidate : (stryCov_9fa48("57489", "57490", "57491"), !candidate)) {
          if (stryMutAct_9fa48("57492")) {
            {}
          } else {
            stryCov_9fa48("57492");
            continue;
          }
        }
        if (stryMutAct_9fa48("57495") ? typeof candidate !== TYPEOF.OBJECT : stryMutAct_9fa48("57494") ? false : stryMutAct_9fa48("57493") ? true : (stryCov_9fa48("57493", "57494", "57495"), typeof candidate === TYPEOF.OBJECT)) {
          if (stryMutAct_9fa48("57496")) {
            {}
          } else {
            stryCov_9fa48("57496");
            if (stryMutAct_9fa48("57498") ? false : stryMutAct_9fa48("57497") ? true : (stryCov_9fa48("57497", "57498"), visited.has(candidate))) {
              if (stryMutAct_9fa48("57499")) {
                {}
              } else {
                stryCov_9fa48("57499");
                continue;
              }
            }
            visited.add(candidate);
          }
        } else if (stryMutAct_9fa48("57502") ? typeof candidate === TYPEOF.STRING : stryMutAct_9fa48("57501") ? false : stryMutAct_9fa48("57500") ? true : (stryCov_9fa48("57500", "57501", "57502"), typeof candidate !== TYPEOF.STRING)) {
          if (stryMutAct_9fa48("57503")) {
            {}
          } else {
            stryCov_9fa48("57503");
            continue;
          }
        }
        collected.push(candidate);
        if (stryMutAct_9fa48("57506") ? typeof candidate === TYPEOF.OBJECT : stryMutAct_9fa48("57505") ? false : stryMutAct_9fa48("57504") ? true : (stryCov_9fa48("57504", "57505", "57506"), typeof candidate !== TYPEOF.OBJECT)) {
          if (stryMutAct_9fa48("57507")) {
            {}
          } else {
            stryCov_9fa48("57507");
            continue;
          }
        }
        if (stryMutAct_9fa48("57509") ? false : stryMutAct_9fa48("57508") ? true : (stryCov_9fa48("57508", "57509"), candidate.cause)) {
          if (stryMutAct_9fa48("57510")) {
            {}
          } else {
            stryCov_9fa48("57510");
            queue.push(candidate.cause);
          }
        }
        if (stryMutAct_9fa48("57513") ? candidate.firstFailedParticipant || typeof candidate.firstFailedParticipant === TYPEOF.OBJECT : stryMutAct_9fa48("57512") ? false : stryMutAct_9fa48("57511") ? true : (stryCov_9fa48("57511", "57512", "57513"), candidate.firstFailedParticipant && (stryMutAct_9fa48("57515") ? typeof candidate.firstFailedParticipant !== TYPEOF.OBJECT : stryMutAct_9fa48("57514") ? true : (stryCov_9fa48("57514", "57515"), typeof candidate.firstFailedParticipant === TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("57516")) {
            {}
          } else {
            stryCov_9fa48("57516");
            queue.push(candidate.firstFailedParticipant);
          }
        }
        if (stryMutAct_9fa48("57518") ? false : stryMutAct_9fa48("57517") ? true : (stryCov_9fa48("57517", "57518"), Array.isArray(candidate.participantFailures))) {
          if (stryMutAct_9fa48("57519")) {
            {}
          } else {
            stryCov_9fa48("57519");
            for (const participantFailure of candidate.participantFailures) {
              if (stryMutAct_9fa48("57520")) {
                {}
              } else {
                stryCov_9fa48("57520");
                queue.push(participantFailure);
              }
            }
          }
        }
      }
    }
    return collected;
  }
}
function getControlPlaneErrorMessage(value) {
  if (stryMutAct_9fa48("57521")) {
    {}
  } else {
    stryCov_9fa48("57521");
    return getDirectControlPlaneErrorMessage(value);
  }
}
function getControlPlaneErrorCode(value) {
  if (stryMutAct_9fa48("57522")) {
    {}
  } else {
    stryCov_9fa48("57522");
    return getDirectControlPlaneErrorCode(value);
  }
}
function getControlPlaneRetryAfterMs(value) {
  if (stryMutAct_9fa48("57523")) {
    {}
  } else {
    stryCov_9fa48("57523");
    let retryAfterMs = NUM.ZERO;
    for (const candidate of collectLinkedControlPlaneFailures(value)) {
      if (stryMutAct_9fa48("57524")) {
        {}
      } else {
        stryCov_9fa48("57524");
        retryAfterMs = stryMutAct_9fa48("57525") ? Math.min(retryAfterMs, getDirectControlPlaneRetryAfterMs(candidate)) : (stryCov_9fa48("57525"), Math.max(retryAfterMs, getDirectControlPlaneRetryAfterMs(candidate)));
      }
    }
    return retryAfterMs;
  }
}
function isRetryableControlPlaneError(value) {
  if (stryMutAct_9fa48("57526")) {
    {}
  } else {
    stryCov_9fa48("57526");
    if (stryMutAct_9fa48("57529") ? false : stryMutAct_9fa48("57528") ? true : stryMutAct_9fa48("57527") ? value : (stryCov_9fa48("57527", "57528", "57529"), !value)) {
      if (stryMutAct_9fa48("57530")) {
        {}
      } else {
        stryCov_9fa48("57530");
        return stryMutAct_9fa48("57531") ? true : (stryCov_9fa48("57531"), false);
      }
    }
    for (const candidate of collectLinkedControlPlaneFailures(value)) {
      if (stryMutAct_9fa48("57532")) {
        {}
      } else {
        stryCov_9fa48("57532");
        if (stryMutAct_9fa48("57535") ? candidate?.deferRetry !== true : stryMutAct_9fa48("57534") ? false : stryMutAct_9fa48("57533") ? true : (stryCov_9fa48("57533", "57534", "57535"), (stryMutAct_9fa48("57536") ? candidate.deferRetry : (stryCov_9fa48("57536"), candidate?.deferRetry)) === (stryMutAct_9fa48("57537") ? false : (stryCov_9fa48("57537"), true)))) {
          if (stryMutAct_9fa48("57538")) {
            {}
          } else {
            stryCov_9fa48("57538");
            return stryMutAct_9fa48("57539") ? false : (stryCov_9fa48("57539"), true);
          }
        }
        if (stryMutAct_9fa48("57542") ? getDirectControlPlaneErrorCode(candidate) !== PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED : stryMutAct_9fa48("57541") ? false : stryMutAct_9fa48("57540") ? true : (stryCov_9fa48("57540", "57541", "57542"), getDirectControlPlaneErrorCode(candidate) === PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED)) {
          if (stryMutAct_9fa48("57543")) {
            {}
          } else {
            stryCov_9fa48("57543");
            return stryMutAct_9fa48("57544") ? false : (stryCov_9fa48("57544"), true);
          }
        }
        if (stryMutAct_9fa48("57548") ? getDirectControlPlaneRetryAfterMs(candidate) <= NUM.ZERO : stryMutAct_9fa48("57547") ? getDirectControlPlaneRetryAfterMs(candidate) >= NUM.ZERO : stryMutAct_9fa48("57546") ? false : stryMutAct_9fa48("57545") ? true : (stryCov_9fa48("57545", "57546", "57547", "57548"), getDirectControlPlaneRetryAfterMs(candidate) > NUM.ZERO)) {
          if (stryMutAct_9fa48("57549")) {
            {}
          } else {
            stryCov_9fa48("57549");
            return stryMutAct_9fa48("57550") ? false : (stryCov_9fa48("57550"), true);
          }
        }
        const message = getDirectControlPlaneErrorMessage(candidate);
        if (stryMutAct_9fa48("57553") ? RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS.every(fragment => message.includes(fragment)) : stryMutAct_9fa48("57552") ? false : stryMutAct_9fa48("57551") ? true : (stryCov_9fa48("57551", "57552", "57553"), RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS.some(stryMutAct_9fa48("57554") ? () => undefined : (stryCov_9fa48("57554"), fragment => message.includes(fragment))))) {
          if (stryMutAct_9fa48("57555")) {
            {}
          } else {
            stryCov_9fa48("57555");
            return stryMutAct_9fa48("57556") ? false : (stryCov_9fa48("57556"), true);
          }
        }
      }
    }
    return stryMutAct_9fa48("57557") ? true : (stryCov_9fa48("57557"), false);
  }
}
export { getControlPlaneErrorCode, getControlPlaneErrorMessage, getControlPlaneRetryAfterMs, isRetryableControlPlaneError, RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS };