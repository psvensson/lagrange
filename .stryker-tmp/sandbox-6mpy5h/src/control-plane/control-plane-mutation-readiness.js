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
import { CONTROL_PLANE_READINESS_DIMENSION, CONTROL_PLANE_READINESS_REASON } from './control-plane-readiness-constants.js';
import { ControlPlaneReadinessService } from './control-plane-readiness-service.js';
const CONTROL_PLANE_MUTATION_WORK_CLASS = Object.freeze(stryMutAct_9fa48("57979") ? {} : (stryCov_9fa48("57979"), {
  BACKGROUND: stryMutAct_9fa48("57980") ? "" : (stryCov_9fa48("57980"), 'background'),
  INTERACTIVE: stryMutAct_9fa48("57981") ? "" : (stryCov_9fa48("57981"), 'interactive'),
  CRITICAL: stryMutAct_9fa48("57982") ? "" : (stryCov_9fa48("57982"), 'critical')
}));
const DEFAULT_REQUIRED_DIMENSIONS = Object.freeze(stryMutAct_9fa48("57983") ? [] : (stryCov_9fa48("57983"), [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE, CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]));
const CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING = stryMutAct_9fa48("57984") ? "" : (stryCov_9fa48("57984"), 'publishedConvergencePending');
const REASON_BY_DIMENSION = Object.freeze(stryMutAct_9fa48("57985") ? {} : (stryCov_9fa48("57985"), {
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
  [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED
}));
function normalizeControlPlaneMutationWorkClass(workClass, defaultWorkClass = CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE) {
  if (stryMutAct_9fa48("57986")) {
    {}
  } else {
    stryCov_9fa48("57986");
    if (stryMutAct_9fa48("57989") ? typeof workClass !== TYPEOF.STRING && workClass.length === NUM.ZERO : stryMutAct_9fa48("57988") ? false : stryMutAct_9fa48("57987") ? true : (stryCov_9fa48("57987", "57988", "57989"), (stryMutAct_9fa48("57991") ? typeof workClass === TYPEOF.STRING : stryMutAct_9fa48("57990") ? false : (stryCov_9fa48("57990", "57991"), typeof workClass !== TYPEOF.STRING)) || (stryMutAct_9fa48("57993") ? workClass.length !== NUM.ZERO : stryMutAct_9fa48("57992") ? false : (stryCov_9fa48("57992", "57993"), workClass.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("57994")) {
        {}
      } else {
        stryCov_9fa48("57994");
        return defaultWorkClass;
      }
    }
    const normalized = stryMutAct_9fa48("57995") ? workClass.toUpperCase() : (stryCov_9fa48("57995"), workClass.toLowerCase());
    if (stryMutAct_9fa48("57998") ? normalized !== CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND : stryMutAct_9fa48("57997") ? false : stryMutAct_9fa48("57996") ? true : (stryCov_9fa48("57996", "57997", "57998"), normalized === CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND)) {
      if (stryMutAct_9fa48("57999")) {
        {}
      } else {
        stryCov_9fa48("57999");
        return CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND;
      }
    }
    if (stryMutAct_9fa48("58002") ? normalized !== CONTROL_PLANE_MUTATION_WORK_CLASS.CRITICAL : stryMutAct_9fa48("58001") ? false : stryMutAct_9fa48("58000") ? true : (stryCov_9fa48("58000", "58001", "58002"), normalized === CONTROL_PLANE_MUTATION_WORK_CLASS.CRITICAL)) {
      if (stryMutAct_9fa48("58003")) {
        {}
      } else {
        stryCov_9fa48("58003");
        return CONTROL_PLANE_MUTATION_WORK_CLASS.CRITICAL;
      }
    }
    return CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE;
  }
}
function requiresStableLocalControlPlaneMutationReadiness(workClass) {
  if (stryMutAct_9fa48("58004")) {
    {}
  } else {
    stryCov_9fa48("58004");
    return stryMutAct_9fa48("58007") ? normalizeControlPlaneMutationWorkClass(workClass) !== CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND : stryMutAct_9fa48("58006") ? false : stryMutAct_9fa48("58005") ? true : (stryCov_9fa48("58005", "58006", "58007"), normalizeControlPlaneMutationWorkClass(workClass) === CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND);
  }
}
function normalizeReasonCodes(readiness, failedDimensions) {
  if (stryMutAct_9fa48("58008")) {
    {}
  } else {
    stryCov_9fa48("58008");
    const seen = new Set();
    const codes = stryMutAct_9fa48("58009") ? ["Stryker was here"] : (stryCov_9fa48("58009"), []);
    for (const reason of Array.isArray(stryMutAct_9fa48("58010") ? readiness.reasons : (stryCov_9fa48("58010"), readiness?.reasons)) ? readiness.reasons : stryMutAct_9fa48("58011") ? ["Stryker was here"] : (stryCov_9fa48("58011"), [])) {
      if (stryMutAct_9fa48("58012")) {
        {}
      } else {
        stryCov_9fa48("58012");
        const code = String(stryMutAct_9fa48("58015") ? (reason?.code || reason?.reason || reason) && '' : stryMutAct_9fa48("58014") ? false : stryMutAct_9fa48("58013") ? true : (stryCov_9fa48("58013", "58014", "58015"), (stryMutAct_9fa48("58017") ? (reason?.code || reason?.reason) && reason : stryMutAct_9fa48("58016") ? false : (stryCov_9fa48("58016", "58017"), (stryMutAct_9fa48("58019") ? reason?.code && reason?.reason : stryMutAct_9fa48("58018") ? false : (stryCov_9fa48("58018", "58019"), (stryMutAct_9fa48("58020") ? reason.code : (stryCov_9fa48("58020"), reason?.code)) || (stryMutAct_9fa48("58021") ? reason.reason : (stryCov_9fa48("58021"), reason?.reason)))) || reason)) || (stryMutAct_9fa48("58022") ? "Stryker was here!" : (stryCov_9fa48("58022"), ''))));
        if (stryMutAct_9fa48("58025") ? code.length === NUM.ZERO && seen.has(code) : stryMutAct_9fa48("58024") ? false : stryMutAct_9fa48("58023") ? true : (stryCov_9fa48("58023", "58024", "58025"), (stryMutAct_9fa48("58027") ? code.length !== NUM.ZERO : stryMutAct_9fa48("58026") ? false : (stryCov_9fa48("58026", "58027"), code.length === NUM.ZERO)) || seen.has(code))) {
          if (stryMutAct_9fa48("58028")) {
            {}
          } else {
            stryCov_9fa48("58028");
            continue;
          }
        }
        seen.add(code);
        codes.push(code);
      }
    }
    for (const dimension of Array.isArray(failedDimensions) ? failedDimensions : stryMutAct_9fa48("58029") ? ["Stryker was here"] : (stryCov_9fa48("58029"), [])) {
      if (stryMutAct_9fa48("58030")) {
        {}
      } else {
        stryCov_9fa48("58030");
        const mappedCode = stryMutAct_9fa48("58033") ? REASON_BY_DIMENSION[dimension] && '' : stryMutAct_9fa48("58032") ? false : stryMutAct_9fa48("58031") ? true : (stryCov_9fa48("58031", "58032", "58033"), REASON_BY_DIMENSION[dimension] || (stryMutAct_9fa48("58034") ? "Stryker was here!" : (stryCov_9fa48("58034"), '')));
        if (stryMutAct_9fa48("58037") ? mappedCode.length === NUM.ZERO && seen.has(mappedCode) : stryMutAct_9fa48("58036") ? false : stryMutAct_9fa48("58035") ? true : (stryCov_9fa48("58035", "58036", "58037"), (stryMutAct_9fa48("58039") ? mappedCode.length !== NUM.ZERO : stryMutAct_9fa48("58038") ? false : (stryCov_9fa48("58038", "58039"), mappedCode.length === NUM.ZERO)) || seen.has(mappedCode))) {
          if (stryMutAct_9fa48("58040")) {
            {}
          } else {
            stryCov_9fa48("58040");
            continue;
          }
        }
        seen.add(mappedCode);
        codes.push(mappedCode);
      }
    }
    for (const code of Array.isArray(stryMutAct_9fa48("58042") ? readiness.priorityControlPlaneRecovery?.reasonCodes : stryMutAct_9fa48("58041") ? readiness?.priorityControlPlaneRecovery.reasonCodes : (stryCov_9fa48("58041", "58042"), readiness?.priorityControlPlaneRecovery?.reasonCodes)) ? readiness.priorityControlPlaneRecovery.reasonCodes : stryMutAct_9fa48("58043") ? ["Stryker was here"] : (stryCov_9fa48("58043"), [])) {
      if (stryMutAct_9fa48("58044")) {
        {}
      } else {
        stryCov_9fa48("58044");
        const normalizedCode = String(stryMutAct_9fa48("58047") ? code && '' : stryMutAct_9fa48("58046") ? false : stryMutAct_9fa48("58045") ? true : (stryCov_9fa48("58045", "58046", "58047"), code || (stryMutAct_9fa48("58048") ? "Stryker was here!" : (stryCov_9fa48("58048"), ''))));
        if (stryMutAct_9fa48("58051") ? normalizedCode.length === NUM.ZERO && seen.has(normalizedCode) : stryMutAct_9fa48("58050") ? false : stryMutAct_9fa48("58049") ? true : (stryCov_9fa48("58049", "58050", "58051"), (stryMutAct_9fa48("58053") ? normalizedCode.length !== NUM.ZERO : stryMutAct_9fa48("58052") ? false : (stryCov_9fa48("58052", "58053"), normalizedCode.length === NUM.ZERO)) || seen.has(normalizedCode))) {
          if (stryMutAct_9fa48("58054")) {
            {}
          } else {
            stryCov_9fa48("58054");
            continue;
          }
        }
        seen.add(normalizedCode);
        codes.push(normalizedCode);
      }
    }
    return Object.freeze(codes);
  }
}
function getLocalControlPlaneMutationReadinessBlocker(options = {}) {
  if (stryMutAct_9fa48("58055")) {
    {}
  } else {
    stryCov_9fa48("58055");
    const nodeId = String(stryMutAct_9fa48("58058") ? options.nodeId && '' : stryMutAct_9fa48("58057") ? false : stryMutAct_9fa48("58056") ? true : (stryCov_9fa48("58056", "58057", "58058"), options.nodeId || (stryMutAct_9fa48("58059") ? "Stryker was here!" : (stryCov_9fa48("58059"), ''))));
    const controlPlaneReadinessService = stryMutAct_9fa48("58062") ? options.controlPlaneReadinessService && null : stryMutAct_9fa48("58061") ? false : stryMutAct_9fa48("58060") ? true : (stryCov_9fa48("58060", "58061", "58062"), options.controlPlaneReadinessService || null);
    if (stryMutAct_9fa48("58065") ? (!nodeId || !controlPlaneReadinessService) && typeof controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("58064") ? false : stryMutAct_9fa48("58063") ? true : (stryCov_9fa48("58063", "58064", "58065"), (stryMutAct_9fa48("58067") ? !nodeId && !controlPlaneReadinessService : stryMutAct_9fa48("58066") ? false : (stryCov_9fa48("58066", "58067"), (stryMutAct_9fa48("58068") ? nodeId : (stryCov_9fa48("58068"), !nodeId)) || (stryMutAct_9fa48("58069") ? controlPlaneReadinessService : (stryCov_9fa48("58069"), !controlPlaneReadinessService)))) || (stryMutAct_9fa48("58071") ? typeof controlPlaneReadinessService.getNodeReadinessSync === TYPEOF.FUNCTION : stryMutAct_9fa48("58070") ? false : (stryCov_9fa48("58070", "58071"), typeof controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("58072")) {
        {}
      } else {
        stryCov_9fa48("58072");
        return null;
      }
    }
    const requiredDimensions = (stryMutAct_9fa48("58075") ? Array.isArray(options.requiredDimensions) || options.requiredDimensions.length > NUM.ZERO : stryMutAct_9fa48("58074") ? false : stryMutAct_9fa48("58073") ? true : (stryCov_9fa48("58073", "58074", "58075"), Array.isArray(options.requiredDimensions) && (stryMutAct_9fa48("58078") ? options.requiredDimensions.length <= NUM.ZERO : stryMutAct_9fa48("58077") ? options.requiredDimensions.length >= NUM.ZERO : stryMutAct_9fa48("58076") ? true : (stryCov_9fa48("58076", "58077", "58078"), options.requiredDimensions.length > NUM.ZERO)))) ? options.requiredDimensions : DEFAULT_REQUIRED_DIMENSIONS;
    const readiness = controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("58079") ? {} : (stryCov_9fa48("58079"), {
      allowStaleOnCacheChange: stryMutAct_9fa48("58080") ? true : (stryCov_9fa48("58080"), false)
    }));
    const failedDimensions = stryMutAct_9fa48("58081") ? requiredDimensions : (stryCov_9fa48("58081"), requiredDimensions.filter(dimension => {
      if (stryMutAct_9fa48("58082")) {
        {}
      } else {
        stryCov_9fa48("58082");
        return stryMutAct_9fa48("58085") ? readiness?.dimensions?.[dimension] === true : stryMutAct_9fa48("58084") ? false : stryMutAct_9fa48("58083") ? true : (stryCov_9fa48("58083", "58084", "58085"), (stryMutAct_9fa48("58087") ? readiness.dimensions?.[dimension] : stryMutAct_9fa48("58086") ? readiness?.dimensions[dimension] : (stryCov_9fa48("58086", "58087"), readiness?.dimensions?.[dimension])) !== (stryMutAct_9fa48("58088") ? false : (stryCov_9fa48("58088"), true)));
      }
    }));
    const requirePublishedConvergence = stryMutAct_9fa48("58091") ? options.requirePublishedConvergence !== true : stryMutAct_9fa48("58090") ? false : stryMutAct_9fa48("58089") ? true : (stryCov_9fa48("58089", "58090", "58091"), options.requirePublishedConvergence === (stryMutAct_9fa48("58092") ? false : (stryCov_9fa48("58092"), true)));
    const priorityRecoveryActive = stryMutAct_9fa48("58095") ? readiness?.priorityControlPlaneRecovery?.active !== true : stryMutAct_9fa48("58094") ? false : stryMutAct_9fa48("58093") ? true : (stryCov_9fa48("58093", "58094", "58095"), (stryMutAct_9fa48("58097") ? readiness.priorityControlPlaneRecovery?.active : stryMutAct_9fa48("58096") ? readiness?.priorityControlPlaneRecovery.active : (stryCov_9fa48("58096", "58097"), readiness?.priorityControlPlaneRecovery?.active)) === (stryMutAct_9fa48("58098") ? false : (stryCov_9fa48("58098"), true)));
    if (stryMutAct_9fa48("58101") ? requirePublishedConvergence || priorityRecoveryActive : stryMutAct_9fa48("58100") ? false : stryMutAct_9fa48("58099") ? true : (stryCov_9fa48("58099", "58100", "58101"), requirePublishedConvergence && priorityRecoveryActive)) {
      if (stryMutAct_9fa48("58102")) {
        {}
      } else {
        stryCov_9fa48("58102");
        failedDimensions.push(CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING);
      }
    }
    if (stryMutAct_9fa48("58105") ? failedDimensions.length !== NUM.ZERO : stryMutAct_9fa48("58104") ? false : stryMutAct_9fa48("58103") ? true : (stryCov_9fa48("58103", "58104", "58105"), failedDimensions.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("58106")) {
        {}
      } else {
        stryCov_9fa48("58106");
        return null;
      }
    }
    return Object.freeze(stryMutAct_9fa48("58107") ? {} : (stryCov_9fa48("58107"), {
      nodeId,
      readiness: stryMutAct_9fa48("58110") ? readiness && null : stryMutAct_9fa48("58109") ? false : stryMutAct_9fa48("58108") ? true : (stryCov_9fa48("58108", "58109", "58110"), readiness || null),
      failedDimensions: Object.freeze(stryMutAct_9fa48("58111") ? [] : (stryCov_9fa48("58111"), [...failedDimensions])),
      reasonCodes: normalizeReasonCodes(readiness, failedDimensions),
      readinessSnapshot: readiness ? ControlPlaneReadinessService.compactSnapshotSummary(readiness, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE) : null
    }));
  }
}
export { CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING, CONTROL_PLANE_MUTATION_WORK_CLASS, getLocalControlPlaneMutationReadinessBlocker, normalizeControlPlaneMutationWorkClass, requiresStableLocalControlPlaneMutationReadiness };