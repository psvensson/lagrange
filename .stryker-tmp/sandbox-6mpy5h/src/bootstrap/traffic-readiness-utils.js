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
import { NUM, TIME_MS, TYPEOF } from '../constants/index.js';
import { LIFECYCLE_EVENT, LIFECYCLE_PHASE } from './lifecycle-controller-constants.js';
import { LIFECYCLE_REASON } from './lifecycle-controller-constants.js';
import { isPriorityControlPlanePartition } from './system-partition-classification.js';
const METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS = Object.freeze(stryMutAct_9fa48("33425") ? [] : (stryCov_9fa48("33425"), [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE, LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]));
const TRAFFIC_READINESS_WAIT_DEFAULT = Object.freeze(stryMutAct_9fa48("33426") ? {} : (stryCov_9fa48("33426"), {
  MAX_ATTEMPTS: NUM.SIX,
  INITIAL_DELAY_MS: TIME_MS.SECOND,
  MAX_DELAY_MS: stryMutAct_9fa48("33427") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("33427"), TIME_MS.SECOND * NUM.FIVE),
  BACKOFF_MULTIPLIER: NUM.TWO
}));
function normalizePositiveInteger(value, fallback) {
  if (stryMutAct_9fa48("33428")) {
    {}
  } else {
    stryCov_9fa48("33428");
    return (stryMutAct_9fa48("33431") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("33430") ? false : stryMutAct_9fa48("33429") ? true : (stryCov_9fa48("33429", "33430", "33431"), Number.isFinite(value) && (stryMutAct_9fa48("33434") ? value <= NUM.ZERO : stryMutAct_9fa48("33433") ? value >= NUM.ZERO : stryMutAct_9fa48("33432") ? true : (stryCov_9fa48("33432", "33433", "33434"), value > NUM.ZERO)))) ? Math.floor(value) : fallback;
  }
}
function normalizeBackoffMultiplier(value) {
  if (stryMutAct_9fa48("33435")) {
    {}
  } else {
    stryCov_9fa48("33435");
    return (stryMutAct_9fa48("33438") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("33437") ? false : stryMutAct_9fa48("33436") ? true : (stryCov_9fa48("33436", "33437", "33438"), Number.isFinite(value) && (stryMutAct_9fa48("33441") ? value <= NUM.ZERO : stryMutAct_9fa48("33440") ? value >= NUM.ZERO : stryMutAct_9fa48("33439") ? true : (stryCov_9fa48("33439", "33440", "33441"), value > NUM.ZERO)))) ? value : TRAFFIC_READINESS_WAIT_DEFAULT.BACKOFF_MULTIPLIER;
  }
}
function getTrafficReadinessSnapshot(readinessState) {
  if (stryMutAct_9fa48("33442")) {
    {}
  } else {
    stryCov_9fa48("33442");
    if (stryMutAct_9fa48("33445") ? !readinessState && typeof readinessState !== 'object' : stryMutAct_9fa48("33444") ? false : stryMutAct_9fa48("33443") ? true : (stryCov_9fa48("33443", "33444", "33445"), (stryMutAct_9fa48("33446") ? readinessState : (stryCov_9fa48("33446"), !readinessState)) || (stryMutAct_9fa48("33448") ? typeof readinessState === 'object' : stryMutAct_9fa48("33447") ? false : (stryCov_9fa48("33447", "33448"), typeof readinessState !== (stryMutAct_9fa48("33449") ? "" : (stryCov_9fa48("33449"), 'object')))))) {
      if (stryMutAct_9fa48("33450")) {
        {}
      } else {
        stryCov_9fa48("33450");
        return null;
      }
    }
    if (stryMutAct_9fa48("33453") ? typeof readinessState.evaluate !== 'function' : stryMutAct_9fa48("33452") ? false : stryMutAct_9fa48("33451") ? true : (stryCov_9fa48("33451", "33452", "33453"), typeof readinessState.evaluate === (stryMutAct_9fa48("33454") ? "" : (stryCov_9fa48("33454"), 'function')))) {
      if (stryMutAct_9fa48("33455")) {
        {}
      } else {
        stryCov_9fa48("33455");
        return readinessState.evaluate();
      }
    }
    if (stryMutAct_9fa48("33458") ? typeof readinessState.getSnapshot !== 'function' : stryMutAct_9fa48("33457") ? false : stryMutAct_9fa48("33456") ? true : (stryCov_9fa48("33456", "33457", "33458"), typeof readinessState.getSnapshot === (stryMutAct_9fa48("33459") ? "" : (stryCov_9fa48("33459"), 'function')))) {
      if (stryMutAct_9fa48("33460")) {
        {}
      } else {
        stryCov_9fa48("33460");
        return readinessState.getSnapshot();
      }
    }
    return null;
  }
}
function isTrafficReadySnapshot(snapshot) {
  if (stryMutAct_9fa48("33461")) {
    {}
  } else {
    stryCov_9fa48("33461");
    return Boolean(stryMutAct_9fa48("33464") ? snapshot && snapshot.ready === true || snapshot.phase === LIFECYCLE_PHASE.TRAFFIC_READY : stryMutAct_9fa48("33463") ? false : stryMutAct_9fa48("33462") ? true : (stryCov_9fa48("33462", "33463", "33464"), (stryMutAct_9fa48("33466") ? snapshot || snapshot.ready === true : stryMutAct_9fa48("33465") ? true : (stryCov_9fa48("33465", "33466"), snapshot && (stryMutAct_9fa48("33468") ? snapshot.ready !== true : stryMutAct_9fa48("33467") ? true : (stryCov_9fa48("33467", "33468"), snapshot.ready === (stryMutAct_9fa48("33469") ? false : (stryCov_9fa48("33469"), true)))))) && (stryMutAct_9fa48("33471") ? snapshot.phase !== LIFECYCLE_PHASE.TRAFFIC_READY : stryMutAct_9fa48("33470") ? true : (stryCov_9fa48("33470", "33471"), snapshot.phase === LIFECYCLE_PHASE.TRAFFIC_READY))));
  }
}
function isTrafficReady(readinessState) {
  if (stryMutAct_9fa48("33472")) {
    {}
  } else {
    stryCov_9fa48("33472");
    return isTrafficReadySnapshot(getTrafficReadinessSnapshot(readinessState));
  }
}
function isBackgroundWorkReady(readinessState, options = {}) {
  if (stryMutAct_9fa48("33473")) {
    {}
  } else {
    stryCov_9fa48("33473");
    if (stryMutAct_9fa48("33476") ? !readinessState && typeof readinessState !== 'object' : stryMutAct_9fa48("33475") ? false : stryMutAct_9fa48("33474") ? true : (stryCov_9fa48("33474", "33475", "33476"), (stryMutAct_9fa48("33477") ? readinessState : (stryCov_9fa48("33477"), !readinessState)) || (stryMutAct_9fa48("33479") ? typeof readinessState === 'object' : stryMutAct_9fa48("33478") ? false : (stryCov_9fa48("33478", "33479"), typeof readinessState !== (stryMutAct_9fa48("33480") ? "" : (stryCov_9fa48("33480"), 'object')))))) {
      if (stryMutAct_9fa48("33481")) {
        {}
      } else {
        stryCov_9fa48("33481");
        return stryMutAct_9fa48("33482") ? false : (stryCov_9fa48("33482"), true);
      }
    }
    return isBackgroundWorkReadySnapshot(getTrafficReadinessSnapshot(readinessState), options);
  }
}
function isBackgroundWorkReadySnapshot(snapshot, options = {}) {
  if (stryMutAct_9fa48("33483")) {
    {}
  } else {
    stryCov_9fa48("33483");
    if (stryMutAct_9fa48("33485") ? false : stryMutAct_9fa48("33484") ? true : (stryCov_9fa48("33484", "33485"), isTrafficReadySnapshot(snapshot))) {
      if (stryMutAct_9fa48("33486")) {
        {}
      } else {
        stryCov_9fa48("33486");
        return stryMutAct_9fa48("33487") ? false : (stryCov_9fa48("33487"), true);
      }
    }
    const partitionId = (stryMutAct_9fa48("33490") ? typeof options?.partitionId !== TYPEOF.STRING : stryMutAct_9fa48("33489") ? false : stryMutAct_9fa48("33488") ? true : (stryCov_9fa48("33488", "33489", "33490"), typeof (stryMutAct_9fa48("33491") ? options.partitionId : (stryCov_9fa48("33491"), options?.partitionId)) === TYPEOF.STRING)) ? options.partitionId : null;
    if (stryMutAct_9fa48("33494") ? partitionId || isPriorityControlPlanePartition({
      partitionId
    }) : stryMutAct_9fa48("33493") ? false : stryMutAct_9fa48("33492") ? true : (stryCov_9fa48("33492", "33493", "33494"), partitionId && isPriorityControlPlanePartition(stryMutAct_9fa48("33495") ? {} : (stryCov_9fa48("33495"), {
      partitionId
    })))) {
      if (stryMutAct_9fa48("33496")) {
        {}
      } else {
        stryCov_9fa48("33496");
        return isMetadataPublicationReadySnapshot(snapshot);
      }
    }
    return stryMutAct_9fa48("33497") ? true : (stryCov_9fa48("33497"), false);
  }
}
function isMetadataPublicationReadySnapshot(snapshot) {
  if (stryMutAct_9fa48("33498")) {
    {}
  } else {
    stryCov_9fa48("33498");
    if (stryMutAct_9fa48("33501") ? !snapshot && snapshot.draining === true : stryMutAct_9fa48("33500") ? false : stryMutAct_9fa48("33499") ? true : (stryCov_9fa48("33499", "33500", "33501"), (stryMutAct_9fa48("33502") ? snapshot : (stryCov_9fa48("33502"), !snapshot)) || (stryMutAct_9fa48("33504") ? snapshot.draining !== true : stryMutAct_9fa48("33503") ? false : (stryCov_9fa48("33503", "33504"), snapshot.draining === (stryMutAct_9fa48("33505") ? false : (stryCov_9fa48("33505"), true)))))) {
      if (stryMutAct_9fa48("33506")) {
        {}
      } else {
        stryCov_9fa48("33506");
        return stryMutAct_9fa48("33507") ? true : (stryCov_9fa48("33507"), false);
      }
    }
    const reasons = Array.isArray(snapshot.reasons) ? stryMutAct_9fa48("33508") ? snapshot.reasons : (stryCov_9fa48("33508"), snapshot.reasons.filter(stryMutAct_9fa48("33509") ? () => undefined : (stryCov_9fa48("33509"), reason => stryMutAct_9fa48("33512") ? typeof reason === 'string' || reason.length > 0 : stryMutAct_9fa48("33511") ? false : stryMutAct_9fa48("33510") ? true : (stryCov_9fa48("33510", "33511", "33512"), (stryMutAct_9fa48("33514") ? typeof reason !== 'string' : stryMutAct_9fa48("33513") ? true : (stryCov_9fa48("33513", "33514"), typeof reason === (stryMutAct_9fa48("33515") ? "" : (stryCov_9fa48("33515"), 'string')))) && (stryMutAct_9fa48("33518") ? reason.length <= 0 : stryMutAct_9fa48("33517") ? reason.length >= 0 : stryMutAct_9fa48("33516") ? true : (stryCov_9fa48("33516", "33517", "33518"), reason.length > 0)))))) : stryMutAct_9fa48("33519") ? ["Stryker was here"] : (stryCov_9fa48("33519"), []);
    if (stryMutAct_9fa48("33521") ? false : stryMutAct_9fa48("33520") ? true : (stryCov_9fa48("33520", "33521"), isTrafficReadySnapshot(snapshot))) {
      if (stryMutAct_9fa48("33522")) {
        {}
      } else {
        stryCov_9fa48("33522");
        return stryMutAct_9fa48("33523") ? false : (stryCov_9fa48("33523"), true);
      }
    }
    if (stryMutAct_9fa48("33526") ? snapshot.phase === LIFECYCLE_PHASE.CONTROL_READY && snapshot.phase === LIFECYCLE_PHASE.DEGRADED : stryMutAct_9fa48("33525") ? false : stryMutAct_9fa48("33524") ? true : (stryCov_9fa48("33524", "33525", "33526"), (stryMutAct_9fa48("33528") ? snapshot.phase !== LIFECYCLE_PHASE.CONTROL_READY : stryMutAct_9fa48("33527") ? false : (stryCov_9fa48("33527", "33528"), snapshot.phase === LIFECYCLE_PHASE.CONTROL_READY)) || (stryMutAct_9fa48("33530") ? snapshot.phase !== LIFECYCLE_PHASE.DEGRADED : stryMutAct_9fa48("33529") ? false : (stryCov_9fa48("33529", "33530"), snapshot.phase === LIFECYCLE_PHASE.DEGRADED)))) {
      if (stryMutAct_9fa48("33531")) {
        {}
      } else {
        stryCov_9fa48("33531");
        return stryMutAct_9fa48("33534") ? reasons.length > 0 || reasons.every(reason => METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS.includes(reason)) : stryMutAct_9fa48("33533") ? false : stryMutAct_9fa48("33532") ? true : (stryCov_9fa48("33532", "33533", "33534"), (stryMutAct_9fa48("33537") ? reasons.length <= 0 : stryMutAct_9fa48("33536") ? reasons.length >= 0 : stryMutAct_9fa48("33535") ? true : (stryCov_9fa48("33535", "33536", "33537"), reasons.length > 0)) && (stryMutAct_9fa48("33538") ? reasons.some(reason => METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS.includes(reason)) : (stryCov_9fa48("33538"), reasons.every(stryMutAct_9fa48("33539") ? () => undefined : (stryCov_9fa48("33539"), reason => METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS.includes(reason))))));
      }
    }
    if (stryMutAct_9fa48("33542") ? snapshot.phase !== LIFECYCLE_PHASE.JOIN_READY : stryMutAct_9fa48("33541") ? false : stryMutAct_9fa48("33540") ? true : (stryCov_9fa48("33540", "33541", "33542"), snapshot.phase === LIFECYCLE_PHASE.JOIN_READY)) {
      if (stryMutAct_9fa48("33543")) {
        {}
      } else {
        stryCov_9fa48("33543");
        return stryMutAct_9fa48("33546") ? reasons.length === 1 || reasons[0] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING : stryMutAct_9fa48("33545") ? false : stryMutAct_9fa48("33544") ? true : (stryCov_9fa48("33544", "33545", "33546"), (stryMutAct_9fa48("33548") ? reasons.length !== 1 : stryMutAct_9fa48("33547") ? true : (stryCov_9fa48("33547", "33548"), reasons.length === 1)) && (stryMutAct_9fa48("33550") ? reasons[0] !== LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING : stryMutAct_9fa48("33549") ? true : (stryCov_9fa48("33549", "33550"), reasons[0] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING)));
      }
    }
    return stryMutAct_9fa48("33551") ? true : (stryCov_9fa48("33551"), false);
  }
}
function isMetadataPublicationReady(readinessState) {
  if (stryMutAct_9fa48("33552")) {
    {}
  } else {
    stryCov_9fa48("33552");
    return isMetadataPublicationReadySnapshot(getTrafficReadinessSnapshot(readinessState));
  }
}
function buildLifecycleReadinessNotReadyError(snapshot, options = {}) {
  if (stryMutAct_9fa48("33553")) {
    {}
  } else {
    stryCov_9fa48("33553");
    const phase = (stryMutAct_9fa48("33556") ? typeof snapshot?.phase !== TYPEOF.STRING : stryMutAct_9fa48("33555") ? false : stryMutAct_9fa48("33554") ? true : (stryCov_9fa48("33554", "33555", "33556"), typeof (stryMutAct_9fa48("33557") ? snapshot.phase : (stryCov_9fa48("33557"), snapshot?.phase)) === TYPEOF.STRING)) ? snapshot.phase : null;
    const label = (stryMutAct_9fa48("33560") ? typeof options.label === TYPEOF.STRING || options.label.length > NUM.ZERO : stryMutAct_9fa48("33559") ? false : stryMutAct_9fa48("33558") ? true : (stryCov_9fa48("33558", "33559", "33560"), (stryMutAct_9fa48("33562") ? typeof options.label !== TYPEOF.STRING : stryMutAct_9fa48("33561") ? true : (stryCov_9fa48("33561", "33562"), typeof options.label === TYPEOF.STRING)) && (stryMutAct_9fa48("33565") ? options.label.length <= NUM.ZERO : stryMutAct_9fa48("33564") ? options.label.length >= NUM.ZERO : stryMutAct_9fa48("33563") ? true : (stryCov_9fa48("33563", "33564", "33565"), options.label.length > NUM.ZERO)))) ? options.label : stryMutAct_9fa48("33566") ? "" : (stryCov_9fa48("33566"), 'Lifecycle traffic readiness');
    const error = new Error(phase ? stryMutAct_9fa48("33567") ? `` : (stryCov_9fa48("33567"), `${label} is not satisfied (${phase})`) : stryMutAct_9fa48("33568") ? `` : (stryCov_9fa48("33568"), `${label} is not satisfied`));
    error.code = (stryMutAct_9fa48("33571") ? typeof options.code === TYPEOF.STRING || options.code.length > NUM.ZERO : stryMutAct_9fa48("33570") ? false : stryMutAct_9fa48("33569") ? true : (stryCov_9fa48("33569", "33570", "33571"), (stryMutAct_9fa48("33573") ? typeof options.code !== TYPEOF.STRING : stryMutAct_9fa48("33572") ? true : (stryCov_9fa48("33572", "33573"), typeof options.code === TYPEOF.STRING)) && (stryMutAct_9fa48("33576") ? options.code.length <= NUM.ZERO : stryMutAct_9fa48("33575") ? options.code.length >= NUM.ZERO : stryMutAct_9fa48("33574") ? true : (stryCov_9fa48("33574", "33575", "33576"), options.code.length > NUM.ZERO)))) ? options.code : stryMutAct_9fa48("33577") ? "" : (stryCov_9fa48("33577"), 'BOOTSTRAP_TRAFFIC_NOT_READY');
    error.retryAfterMs = normalizePositiveInteger(stryMutAct_9fa48("33578") ? snapshot.retryAfterMs : (stryCov_9fa48("33578"), snapshot?.retryAfterMs), null);
    error.lifecycleReadiness = stryMutAct_9fa48("33581") ? snapshot && null : stryMutAct_9fa48("33580") ? false : stryMutAct_9fa48("33579") ? true : (stryCov_9fa48("33579", "33580", "33581"), snapshot || null);
    return error;
  }
}
function resolveTrafficReadinessDelayMs(snapshot, delayMs, maxDelayMs) {
  if (stryMutAct_9fa48("33582")) {
    {}
  } else {
    stryCov_9fa48("33582");
    const stableWindowPending = stryMutAct_9fa48("33585") ? Array.isArray(snapshot?.reasons) && snapshot.reasons.length === NUM.ONE || snapshot.reasons[NUM.ZERO] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING : stryMutAct_9fa48("33584") ? false : stryMutAct_9fa48("33583") ? true : (stryCov_9fa48("33583", "33584", "33585"), (stryMutAct_9fa48("33587") ? Array.isArray(snapshot?.reasons) || snapshot.reasons.length === NUM.ONE : stryMutAct_9fa48("33586") ? true : (stryCov_9fa48("33586", "33587"), Array.isArray(stryMutAct_9fa48("33588") ? snapshot.reasons : (stryCov_9fa48("33588"), snapshot?.reasons)) && (stryMutAct_9fa48("33590") ? snapshot.reasons.length !== NUM.ONE : stryMutAct_9fa48("33589") ? true : (stryCov_9fa48("33589", "33590"), snapshot.reasons.length === NUM.ONE)))) && (stryMutAct_9fa48("33592") ? snapshot.reasons[NUM.ZERO] !== LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING : stryMutAct_9fa48("33591") ? true : (stryCov_9fa48("33591", "33592"), snapshot.reasons[NUM.ZERO] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING)));
    if (stryMutAct_9fa48("33595") ? stableWindowPending && Number.isFinite(snapshot?.stableWindowMs) || Number.isFinite(snapshot?.stableElapsedMs) : stryMutAct_9fa48("33594") ? false : stryMutAct_9fa48("33593") ? true : (stryCov_9fa48("33593", "33594", "33595"), (stryMutAct_9fa48("33597") ? stableWindowPending || Number.isFinite(snapshot?.stableWindowMs) : stryMutAct_9fa48("33596") ? true : (stryCov_9fa48("33596", "33597"), stableWindowPending && Number.isFinite(stryMutAct_9fa48("33598") ? snapshot.stableWindowMs : (stryCov_9fa48("33598"), snapshot?.stableWindowMs)))) && Number.isFinite(stryMutAct_9fa48("33599") ? snapshot.stableElapsedMs : (stryCov_9fa48("33599"), snapshot?.stableElapsedMs)))) {
      if (stryMutAct_9fa48("33600")) {
        {}
      } else {
        stryCov_9fa48("33600");
        const remainingMs = stryMutAct_9fa48("33601") ? Math.min(NUM.ONE, Math.ceil(snapshot.stableWindowMs - snapshot.stableElapsedMs)) : (stryCov_9fa48("33601"), Math.max(NUM.ONE, Math.ceil(stryMutAct_9fa48("33602") ? snapshot.stableWindowMs + snapshot.stableElapsedMs : (stryCov_9fa48("33602"), snapshot.stableWindowMs - snapshot.stableElapsedMs))));
        return stryMutAct_9fa48("33603") ? Math.max(remainingMs, maxDelayMs) : (stryCov_9fa48("33603"), Math.min(remainingMs, maxDelayMs));
      }
    }
    const hintedDelayMs = normalizePositiveInteger(stryMutAct_9fa48("33604") ? snapshot.retryAfterMs : (stryCov_9fa48("33604"), snapshot?.retryAfterMs), null);
    if (stryMutAct_9fa48("33607") ? hintedDelayMs === null : stryMutAct_9fa48("33606") ? false : stryMutAct_9fa48("33605") ? true : (stryCov_9fa48("33605", "33606", "33607"), hintedDelayMs !== null)) {
      if (stryMutAct_9fa48("33608")) {
        {}
      } else {
        stryCov_9fa48("33608");
        return stryMutAct_9fa48("33609") ? Math.max(hintedDelayMs, maxDelayMs) : (stryCov_9fa48("33609"), Math.min(hintedDelayMs, maxDelayMs));
      }
    }
    return delayMs;
  }
}
async function waitForTrafficReadiness(options = {}) {
  if (stryMutAct_9fa48("33610")) {
    {}
  } else {
    stryCov_9fa48("33610");
    return waitForLifecycleReadiness(stryMutAct_9fa48("33611") ? {} : (stryCov_9fa48("33611"), {
      ...options,
      isSatisfied: isTrafficReadySnapshot,
      buildError: stryMutAct_9fa48("33612") ? () => undefined : (stryCov_9fa48("33612"), snapshot => buildLifecycleReadinessNotReadyError(snapshot, stryMutAct_9fa48("33613") ? {} : (stryCov_9fa48("33613"), {
        label: stryMutAct_9fa48("33614") ? "" : (stryCov_9fa48("33614"), 'Lifecycle traffic readiness'),
        code: stryMutAct_9fa48("33615") ? "" : (stryCov_9fa48("33615"), 'BOOTSTRAP_TRAFFIC_NOT_READY')
      })))
    }));
  }
}
async function waitForMetadataPublicationReadiness(options = {}) {
  if (stryMutAct_9fa48("33616")) {
    {}
  } else {
    stryCov_9fa48("33616");
    return waitForLifecycleReadiness(stryMutAct_9fa48("33617") ? {} : (stryCov_9fa48("33617"), {
      ...options,
      isSatisfied: isMetadataPublicationReadySnapshot,
      buildError: stryMutAct_9fa48("33618") ? () => undefined : (stryCov_9fa48("33618"), snapshot => buildLifecycleReadinessNotReadyError(snapshot, stryMutAct_9fa48("33619") ? {} : (stryCov_9fa48("33619"), {
        label: stryMutAct_9fa48("33620") ? "" : (stryCov_9fa48("33620"), 'Lifecycle metadata publication readiness'),
        code: stryMutAct_9fa48("33621") ? "" : (stryCov_9fa48("33621"), 'BOOTSTRAP_METADATA_PUBLICATION_NOT_READY')
      })))
    }));
  }
}
async function waitForLifecycleReadiness(options = {}) {
  if (stryMutAct_9fa48("33622")) {
    {}
  } else {
    stryCov_9fa48("33622");
    const getSnapshot = (stryMutAct_9fa48("33625") ? typeof options.readinessSnapshotProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("33624") ? false : stryMutAct_9fa48("33623") ? true : (stryCov_9fa48("33623", "33624", "33625"), typeof options.readinessSnapshotProvider === TYPEOF.FUNCTION)) ? options.readinessSnapshotProvider : stryMutAct_9fa48("33626") ? () => undefined : (stryCov_9fa48("33626"), () => getTrafficReadinessSnapshot(stryMutAct_9fa48("33629") ? options.readinessState && null : stryMutAct_9fa48("33628") ? false : stryMutAct_9fa48("33627") ? true : (stryCov_9fa48("33627", "33628", "33629"), options.readinessState || null)));
    const isSatisfied = (stryMutAct_9fa48("33632") ? typeof options.isSatisfied !== TYPEOF.FUNCTION : stryMutAct_9fa48("33631") ? false : stryMutAct_9fa48("33630") ? true : (stryCov_9fa48("33630", "33631", "33632"), typeof options.isSatisfied === TYPEOF.FUNCTION)) ? options.isSatisfied : stryMutAct_9fa48("33633") ? () => undefined : (stryCov_9fa48("33633"), () => stryMutAct_9fa48("33634") ? true : (stryCov_9fa48("33634"), false));
    const buildError = (stryMutAct_9fa48("33637") ? typeof options.buildError !== TYPEOF.FUNCTION : stryMutAct_9fa48("33636") ? false : stryMutAct_9fa48("33635") ? true : (stryCov_9fa48("33635", "33636", "33637"), typeof options.buildError === TYPEOF.FUNCTION)) ? options.buildError : stryMutAct_9fa48("33638") ? () => undefined : (stryCov_9fa48("33638"), snapshot => buildLifecycleReadinessNotReadyError(snapshot));
    const initialSnapshot = getSnapshot();
    if (stryMutAct_9fa48("33641") ? false : stryMutAct_9fa48("33640") ? true : stryMutAct_9fa48("33639") ? initialSnapshot : (stryCov_9fa48("33639", "33640", "33641"), !initialSnapshot)) {
      if (stryMutAct_9fa48("33642")) {
        {}
      } else {
        stryCov_9fa48("33642");
        return null;
      }
    }
    if (stryMutAct_9fa48("33644") ? false : stryMutAct_9fa48("33643") ? true : (stryCov_9fa48("33643", "33644"), isSatisfied(initialSnapshot))) {
      if (stryMutAct_9fa48("33645")) {
        {}
      } else {
        stryCov_9fa48("33645");
        return initialSnapshot;
      }
    }
    const maxAttempts = normalizePositiveInteger(options.maxAttempts, TRAFFIC_READINESS_WAIT_DEFAULT.MAX_ATTEMPTS);
    const maxDelayMs = normalizePositiveInteger(options.maxDelayMs, TRAFFIC_READINESS_WAIT_DEFAULT.MAX_DELAY_MS);
    let delayMs = normalizePositiveInteger(options.initialDelayMs, TRAFFIC_READINESS_WAIT_DEFAULT.INITIAL_DELAY_MS);
    const backoffMultiplier = normalizeBackoffMultiplier(options.backoffMultiplier);
    const sleep = (stryMutAct_9fa48("33648") ? typeof options.sleep !== TYPEOF.FUNCTION : stryMutAct_9fa48("33647") ? false : stryMutAct_9fa48("33646") ? true : (stryCov_9fa48("33646", "33647", "33648"), typeof options.sleep === TYPEOF.FUNCTION)) ? options.sleep : stryMutAct_9fa48("33649") ? () => undefined : (stryCov_9fa48("33649"), waitMs => new Promise(stryMutAct_9fa48("33650") ? () => undefined : (stryCov_9fa48("33650"), resolve => setTimeout(resolve, waitMs))));
    let lastSnapshot = initialSnapshot;
    for (let attempt = NUM.ONE; stryMutAct_9fa48("33653") ? attempt > maxAttempts : stryMutAct_9fa48("33652") ? attempt < maxAttempts : stryMutAct_9fa48("33651") ? false : (stryCov_9fa48("33651", "33652", "33653"), attempt <= maxAttempts); stryMutAct_9fa48("33654") ? attempt -= NUM.ONE : (stryCov_9fa48("33654"), attempt += NUM.ONE)) {
      if (stryMutAct_9fa48("33655")) {
        {}
      } else {
        stryCov_9fa48("33655");
        lastSnapshot = getSnapshot();
        if (stryMutAct_9fa48("33658") ? false : stryMutAct_9fa48("33657") ? true : stryMutAct_9fa48("33656") ? lastSnapshot : (stryCov_9fa48("33656", "33657", "33658"), !lastSnapshot)) {
          if (stryMutAct_9fa48("33659")) {
            {}
          } else {
            stryCov_9fa48("33659");
            return null;
          }
        }
        if (stryMutAct_9fa48("33661") ? false : stryMutAct_9fa48("33660") ? true : (stryCov_9fa48("33660", "33661"), isSatisfied(lastSnapshot))) {
          if (stryMutAct_9fa48("33662")) {
            {}
          } else {
            stryCov_9fa48("33662");
            return lastSnapshot;
          }
        }
        const effectiveDelayMs = resolveTrafficReadinessDelayMs(lastSnapshot, delayMs, maxDelayMs);
        if (stryMutAct_9fa48("33666") ? attempt < maxAttempts : stryMutAct_9fa48("33665") ? attempt > maxAttempts : stryMutAct_9fa48("33664") ? false : stryMutAct_9fa48("33663") ? true : (stryCov_9fa48("33663", "33664", "33665", "33666"), attempt >= maxAttempts)) {
          if (stryMutAct_9fa48("33667")) {
            {}
          } else {
            stryCov_9fa48("33667");
            throw buildError(stryMutAct_9fa48("33668") ? {} : (stryCov_9fa48("33668"), {
              ...lastSnapshot,
              retryAfterMs: effectiveDelayMs
            }));
          }
        }
        if (stryMutAct_9fa48("33671") ? typeof options.onRetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("33670") ? false : stryMutAct_9fa48("33669") ? true : (stryCov_9fa48("33669", "33670", "33671"), typeof options.onRetry === TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("33672")) {
            {}
          } else {
            stryCov_9fa48("33672");
            options.onRetry(stryMutAct_9fa48("33673") ? {} : (stryCov_9fa48("33673"), {
              attempt,
              maxAttempts,
              delayMs: effectiveDelayMs,
              snapshot: lastSnapshot
            }));
          }
        }
        await sleep(effectiveDelayMs);
        delayMs = stryMutAct_9fa48("33674") ? Math.max(Math.max(NUM.ONE, Math.floor(delayMs * backoffMultiplier)), maxDelayMs) : (stryCov_9fa48("33674"), Math.min(stryMutAct_9fa48("33675") ? Math.min(NUM.ONE, Math.floor(delayMs * backoffMultiplier)) : (stryCov_9fa48("33675"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("33676") ? delayMs / backoffMultiplier : (stryCov_9fa48("33676"), delayMs * backoffMultiplier)))), maxDelayMs));
      }
    }
    throw buildError(lastSnapshot);
  }
}
function attachTrafficReadinessListener(readinessState, listener) {
  if (stryMutAct_9fa48("33677")) {
    {}
  } else {
    stryCov_9fa48("33677");
    if (stryMutAct_9fa48("33680") ? !readinessState && typeof listener !== 'function' : stryMutAct_9fa48("33679") ? false : stryMutAct_9fa48("33678") ? true : (stryCov_9fa48("33678", "33679", "33680"), (stryMutAct_9fa48("33681") ? readinessState : (stryCov_9fa48("33681"), !readinessState)) || (stryMutAct_9fa48("33683") ? typeof listener === 'function' : stryMutAct_9fa48("33682") ? false : (stryCov_9fa48("33682", "33683"), typeof listener !== (stryMutAct_9fa48("33684") ? "" : (stryCov_9fa48("33684"), 'function')))))) {
      if (stryMutAct_9fa48("33685")) {
        {}
      } else {
        stryCov_9fa48("33685");
        return () => {};
      }
    }
    if (stryMutAct_9fa48("33688") ? typeof readinessState.on === 'function' : stryMutAct_9fa48("33687") ? false : stryMutAct_9fa48("33686") ? true : (stryCov_9fa48("33686", "33687", "33688"), typeof readinessState.on !== (stryMutAct_9fa48("33689") ? "" : (stryCov_9fa48("33689"), 'function')))) {
      if (stryMutAct_9fa48("33690")) {
        {}
      } else {
        stryCov_9fa48("33690");
        return () => {};
      }
    }
    const removeListener = (stryMutAct_9fa48("33693") ? typeof readinessState.off !== 'function' : stryMutAct_9fa48("33692") ? false : stryMutAct_9fa48("33691") ? true : (stryCov_9fa48("33691", "33692", "33693"), typeof readinessState.off === (stryMutAct_9fa48("33694") ? "" : (stryCov_9fa48("33694"), 'function')))) ? readinessState.off.bind(readinessState) : (stryMutAct_9fa48("33697") ? typeof readinessState.removeListener !== 'function' : stryMutAct_9fa48("33696") ? false : stryMutAct_9fa48("33695") ? true : (stryCov_9fa48("33695", "33696", "33697"), typeof readinessState.removeListener === (stryMutAct_9fa48("33698") ? "" : (stryCov_9fa48("33698"), 'function')))) ? readinessState.removeListener.bind(readinessState) : null;
    if (stryMutAct_9fa48("33701") ? false : stryMutAct_9fa48("33700") ? true : stryMutAct_9fa48("33699") ? removeListener : (stryCov_9fa48("33699", "33700", "33701"), !removeListener)) {
      if (stryMutAct_9fa48("33702")) {
        {}
      } else {
        stryCov_9fa48("33702");
        return () => {};
      }
    }
    readinessState.on(LIFECYCLE_EVENT.TRANSITION, listener);
    return () => {
      if (stryMutAct_9fa48("33703")) {
        {}
      } else {
        stryCov_9fa48("33703");
        removeListener(LIFECYCLE_EVENT.TRANSITION, listener);
      }
    };
  }
}
export { attachTrafficReadinessListener, isBackgroundWorkReady, isBackgroundWorkReadySnapshot, getTrafficReadinessSnapshot, isMetadataPublicationReady, isMetadataPublicationReadySnapshot, isTrafficReady, TRAFFIC_READINESS_WAIT_DEFAULT, waitForMetadataPublicationReadiness, waitForTrafficReadiness };