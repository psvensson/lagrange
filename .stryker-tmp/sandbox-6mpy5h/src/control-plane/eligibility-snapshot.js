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
import { READINESS_SNAPSHOT_KEY } from './control-plane-readiness-constants.js';
function freezeObject(value) {
  if (stryMutAct_9fa48("64505")) {
    {}
  } else {
    stryCov_9fa48("64505");
    return (stryMutAct_9fa48("64508") ? value || typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("64507") ? false : stryMutAct_9fa48("64506") ? true : (stryCov_9fa48("64506", "64507", "64508"), value && (stryMutAct_9fa48("64510") ? typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("64509") ? true : (stryCov_9fa48("64509", "64510"), typeof value === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("64511") ? {} : (stryCov_9fa48("64511"), {
      ...value
    })) : null;
  }
}
function normalizeReasons(reasons) {
  if (stryMutAct_9fa48("64512")) {
    {}
  } else {
    stryCov_9fa48("64512");
    if (stryMutAct_9fa48("64515") ? !Array.isArray(reasons) && reasons.length === NUM.ZERO : stryMutAct_9fa48("64514") ? false : stryMutAct_9fa48("64513") ? true : (stryCov_9fa48("64513", "64514", "64515"), (stryMutAct_9fa48("64516") ? Array.isArray(reasons) : (stryCov_9fa48("64516"), !Array.isArray(reasons))) || (stryMutAct_9fa48("64518") ? reasons.length !== NUM.ZERO : stryMutAct_9fa48("64517") ? false : (stryCov_9fa48("64517", "64518"), reasons.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("64519")) {
        {}
      } else {
        stryCov_9fa48("64519");
        return Object.freeze(stryMutAct_9fa48("64520") ? ["Stryker was here"] : (stryCov_9fa48("64520"), []));
      }
    }
    return Object.freeze(reasons.map(reason => {
      if (stryMutAct_9fa48("64521")) {
        {}
      } else {
        stryCov_9fa48("64521");
        return (stryMutAct_9fa48("64524") ? reason || typeof reason === TYPEOF.OBJECT : stryMutAct_9fa48("64523") ? false : stryMutAct_9fa48("64522") ? true : (stryCov_9fa48("64522", "64523", "64524"), reason && (stryMutAct_9fa48("64526") ? typeof reason !== TYPEOF.OBJECT : stryMutAct_9fa48("64525") ? true : (stryCov_9fa48("64525", "64526"), typeof reason === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("64527") ? {} : (stryCov_9fa48("64527"), {
          ...reason
        })) : reason;
      }
    }));
  }
}
function collectReasonCodes(snapshot) {
  if (stryMutAct_9fa48("64528")) {
    {}
  } else {
    stryCov_9fa48("64528");
    const reasonCodes = stryMutAct_9fa48("64529") ? ["Stryker was here"] : (stryCov_9fa48("64529"), []);
    const seen = new Set();
    for (const reason of Array.isArray(stryMutAct_9fa48("64530") ? snapshot.reasons : (stryCov_9fa48("64530"), snapshot?.reasons)) ? snapshot.reasons : stryMutAct_9fa48("64531") ? ["Stryker was here"] : (stryCov_9fa48("64531"), [])) {
      if (stryMutAct_9fa48("64532")) {
        {}
      } else {
        stryCov_9fa48("64532");
        const code = String(stryMutAct_9fa48("64535") ? reason?.code && '' : stryMutAct_9fa48("64534") ? false : stryMutAct_9fa48("64533") ? true : (stryCov_9fa48("64533", "64534", "64535"), (stryMutAct_9fa48("64536") ? reason.code : (stryCov_9fa48("64536"), reason?.code)) || (stryMutAct_9fa48("64537") ? "Stryker was here!" : (stryCov_9fa48("64537"), ''))));
        if (stryMutAct_9fa48("64540") ? code.length === NUM.ZERO && seen.has(code) : stryMutAct_9fa48("64539") ? false : stryMutAct_9fa48("64538") ? true : (stryCov_9fa48("64538", "64539", "64540"), (stryMutAct_9fa48("64542") ? code.length !== NUM.ZERO : stryMutAct_9fa48("64541") ? false : (stryCov_9fa48("64541", "64542"), code.length === NUM.ZERO)) || seen.has(code))) {
          if (stryMutAct_9fa48("64543")) {
            {}
          } else {
            stryCov_9fa48("64543");
            continue;
          }
        }
        seen.add(code);
        reasonCodes.push(code);
      }
    }
    return Object.freeze(reasonCodes);
  }
}
function createEligibilitySnapshot(snapshot = {}) {
  if (stryMutAct_9fa48("64544")) {
    {}
  } else {
    stryCov_9fa48("64544");
    return Object.freeze(stryMutAct_9fa48("64545") ? {} : (stryCov_9fa48("64545"), {
      nodeId: stryMutAct_9fa48("64548") ? snapshot.nodeId && null : stryMutAct_9fa48("64547") ? false : stryMutAct_9fa48("64546") ? true : (stryCov_9fa48("64546", "64547", "64548"), snapshot.nodeId || null),
      lifecycleState: stryMutAct_9fa48("64551") ? snapshot.lifecycleState && null : stryMutAct_9fa48("64550") ? false : stryMutAct_9fa48("64549") ? true : (stryCov_9fa48("64549", "64550", "64551"), snapshot.lifecycleState || null),
      publication: freezeObject(snapshot.publication),
      membershipPublication: freezeObject(snapshot.membershipPublication),
      priorityControlPlaneRecovery: freezeObject(snapshot.priorityControlPlaneRecovery),
      capacity: freezeObject(snapshot.capacity),
      nodeEvidence: freezeObject(snapshot.nodeEvidence),
      observedAt: stryMutAct_9fa48("64554") ? snapshot.observedAt && null : stryMutAct_9fa48("64553") ? false : stryMutAct_9fa48("64552") ? true : (stryCov_9fa48("64552", "64553", "64554"), snapshot.observedAt || null),
      dimensions: (stryMutAct_9fa48("64557") ? snapshot.dimensions || typeof snapshot.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("64556") ? false : stryMutAct_9fa48("64555") ? true : (stryCov_9fa48("64555", "64556", "64557"), snapshot.dimensions && (stryMutAct_9fa48("64559") ? typeof snapshot.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("64558") ? true : (stryCov_9fa48("64558", "64559"), typeof snapshot.dimensions === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("64560") ? {} : (stryCov_9fa48("64560"), {
        ...snapshot.dimensions
      })) : Object.freeze({}),
      reasons: normalizeReasons(snapshot.reasons)
    }));
  }
}
function evaluateEligibilityDecision(snapshot, decisionDimension) {
  if (stryMutAct_9fa48("64561")) {
    {}
  } else {
    stryCov_9fa48("64561");
    const normalizedSnapshot = createEligibilitySnapshot(snapshot);
    const dimensions = normalizedSnapshot.dimensions;
    const eligible = stryMutAct_9fa48("64564") ? dimensions[decisionDimension] !== true : stryMutAct_9fa48("64563") ? false : stryMutAct_9fa48("64562") ? true : (stryCov_9fa48("64562", "64563", "64564"), dimensions[decisionDimension] === (stryMutAct_9fa48("64565") ? false : (stryCov_9fa48("64565"), true)));
    return Object.freeze(stryMutAct_9fa48("64566") ? {} : (stryCov_9fa48("64566"), {
      nodeId: normalizedSnapshot.nodeId,
      decisionDimension,
      eligible,
      failedDimensions: Object.freeze(eligible ? stryMutAct_9fa48("64567") ? ["Stryker was here"] : (stryCov_9fa48("64567"), []) : stryMutAct_9fa48("64568") ? Object.keys(dimensions) : (stryCov_9fa48("64568"), Object.keys(dimensions).filter(dimension => {
        if (stryMutAct_9fa48("64569")) {
          {}
        } else {
          stryCov_9fa48("64569");
          return stryMutAct_9fa48("64572") ? dimensions[dimension] === true : stryMutAct_9fa48("64571") ? false : stryMutAct_9fa48("64570") ? true : (stryCov_9fa48("64570", "64571", "64572"), dimensions[dimension] !== (stryMutAct_9fa48("64573") ? false : (stryCov_9fa48("64573"), true)));
        }
      }))),
      reasonCodes: collectReasonCodes(normalizedSnapshot)
    }));
  }
}
function compactEligibilitySnapshot(snapshot, decisionDimension = null) {
  if (stryMutAct_9fa48("64574")) {
    {}
  } else {
    stryCov_9fa48("64574");
    if (stryMutAct_9fa48("64577") ? false : stryMutAct_9fa48("64576") ? true : stryMutAct_9fa48("64575") ? snapshot : (stryCov_9fa48("64575", "64576", "64577"), !snapshot)) {
      if (stryMutAct_9fa48("64578")) {
        {}
      } else {
        stryCov_9fa48("64578");
        return null;
      }
    }
    const normalizedSnapshot = createEligibilitySnapshot(snapshot);
    return Object.freeze(stryMutAct_9fa48("64579") ? {} : (stryCov_9fa48("64579"), {
      [READINESS_SNAPSHOT_KEY.NODE_ID]: stryMutAct_9fa48("64582") ? normalizedSnapshot.nodeId && null : stryMutAct_9fa48("64581") ? false : stryMutAct_9fa48("64580") ? true : (stryCov_9fa48("64580", "64581", "64582"), normalizedSnapshot.nodeId || null),
      [READINESS_SNAPSHOT_KEY.DIMENSIONS]: Object.freeze(stryMutAct_9fa48("64583") ? {} : (stryCov_9fa48("64583"), {
        ...normalizedSnapshot.dimensions
      })),
      [READINESS_SNAPSHOT_KEY.REASON_CODES]: collectReasonCodes(normalizedSnapshot),
      [READINESS_SNAPSHOT_KEY.LIFECYCLE_STATE]: stryMutAct_9fa48("64586") ? normalizedSnapshot.lifecycleState && null : stryMutAct_9fa48("64585") ? false : stryMutAct_9fa48("64584") ? true : (stryCov_9fa48("64584", "64585", "64586"), normalizedSnapshot.lifecycleState || null),
      [READINESS_SNAPSHOT_KEY.OBSERVED_AT]: stryMutAct_9fa48("64589") ? normalizedSnapshot.observedAt && null : stryMutAct_9fa48("64588") ? false : stryMutAct_9fa48("64587") ? true : (stryCov_9fa48("64587", "64588", "64589"), normalizedSnapshot.observedAt || null),
      [READINESS_SNAPSHOT_KEY.DECISION_DIMENSION]: stryMutAct_9fa48("64592") ? decisionDimension && null : stryMutAct_9fa48("64591") ? false : stryMutAct_9fa48("64590") ? true : (stryCov_9fa48("64590", "64591", "64592"), decisionDimension || null)
    }));
  }
}
export { compactEligibilitySnapshot, createEligibilitySnapshot, evaluateEligibilityDecision };