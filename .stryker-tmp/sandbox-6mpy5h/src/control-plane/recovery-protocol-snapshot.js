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
import { CONTROL_PLANE_PRIORITY_RECOVERY_REASON } from './control-plane-readiness-constants.js';
import { CONTROL_PLANE_PUBLICATION_STATUS } from './control-plane-publication-merge.js';
import { MEMBERSHIP_MEMBER_STATE, NODE_PARTICIPATION_STATE, RECOVERY_PROTOCOL_STATE } from './membership-lifecycle-constants.js';
import { hasPriorityRecoverySpreadGap } from './priority-recovery-snapshot.js';
import { buildMembershipPublicationActiveSnapshot } from './active-node-projection.js';
const PARTICIPATION_REASON = Object.freeze(stryMutAct_9fa48("71959") ? {} : (stryCov_9fa48("71959"), {
  PUBLISHED_MEMBERSHIP: stryMutAct_9fa48("71960") ? "" : (stryCov_9fa48("71960"), 'published_membership'),
  RECOVERY_ACTIVE: stryMutAct_9fa48("71961") ? "" : (stryCov_9fa48("71961"), 'recovery_active'),
  PROJECTED_SERVING: stryMutAct_9fa48("71962") ? "" : (stryCov_9fa48("71962"), 'projected_serving'),
  LOCALLY_ELIGIBLE: stryMutAct_9fa48("71963") ? "" : (stryCov_9fa48("71963"), 'locally_eligible'),
  SUSPECTED_OR_TRANSITIONING: stryMutAct_9fa48("71964") ? "" : (stryCov_9fa48("71964"), 'suspected_or_transitioning'),
  RECOVERY_ELIGIBLE_PROJECTION: stryMutAct_9fa48("71965") ? "" : (stryCov_9fa48("71965"), 'recovery_eligible_projection'),
  LIVENESS_FALLBACK_PROJECTION: stryMutAct_9fa48("71966") ? "" : (stryCov_9fa48("71966"), 'liveness_fallback_projection'),
  READINESS_EXCLUDED: stryMutAct_9fa48("71967") ? "" : (stryCov_9fa48("71967"), 'readiness_excluded'),
  CLUSTER_MEMBER_UNHEALTHY: stryMutAct_9fa48("71968") ? "" : (stryCov_9fa48("71968"), 'cluster_member_unhealthy'),
  MEMBERSHIP_FREEZE_RETAINED: stryMutAct_9fa48("71969") ? "" : (stryCov_9fa48("71969"), 'membership_freeze_retained')
}));
function normalizeOptionalString(value) {
  if (stryMutAct_9fa48("71970")) {
    {}
  } else {
    stryCov_9fa48("71970");
    return (stryMutAct_9fa48("71973") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("71972") ? false : stryMutAct_9fa48("71971") ? true : (stryCov_9fa48("71971", "71972", "71973"), (stryMutAct_9fa48("71975") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("71974") ? true : (stryCov_9fa48("71974", "71975"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("71978") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("71977") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("71976") ? true : (stryCov_9fa48("71976", "71977", "71978"), (stryMutAct_9fa48("71979") ? value.length : (stryCov_9fa48("71979"), value.trim().length)) > NUM.ZERO)))) ? stryMutAct_9fa48("71980") ? value : (stryCov_9fa48("71980"), value.trim()) : null;
  }
}
function normalizeNodeIdList(values = stryMutAct_9fa48("71981") ? ["Stryker was here"] : (stryCov_9fa48("71981"), [])) {
  if (stryMutAct_9fa48("71982")) {
    {}
  } else {
    stryCov_9fa48("71982");
    return stryMutAct_9fa48("71983") ? [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(value => value.length > NUM.ZERO))] : (stryCov_9fa48("71983"), (stryMutAct_9fa48("71984") ? [] : (stryCov_9fa48("71984"), [...new Set(stryMutAct_9fa48("71985") ? (Array.isArray(values) ? values : []).map(value => String(value || '').trim()) : (stryCov_9fa48("71985"), (Array.isArray(values) ? values : stryMutAct_9fa48("71986") ? ["Stryker was here"] : (stryCov_9fa48("71986"), [])).map(stryMutAct_9fa48("71987") ? () => undefined : (stryCov_9fa48("71987"), value => stryMutAct_9fa48("71988") ? String(value || '') : (stryCov_9fa48("71988"), String(stryMutAct_9fa48("71991") ? value && '' : stryMutAct_9fa48("71990") ? false : stryMutAct_9fa48("71989") ? true : (stryCov_9fa48("71989", "71990", "71991"), value || (stryMutAct_9fa48("71992") ? "Stryker was here!" : (stryCov_9fa48("71992"), '')))).trim()))).filter(stryMutAct_9fa48("71993") ? () => undefined : (stryCov_9fa48("71993"), value => stryMutAct_9fa48("71997") ? value.length <= NUM.ZERO : stryMutAct_9fa48("71996") ? value.length >= NUM.ZERO : stryMutAct_9fa48("71995") ? false : stryMutAct_9fa48("71994") ? true : (stryCov_9fa48("71994", "71995", "71996", "71997"), value.length > NUM.ZERO)))))])).sort());
  }
}
function normalizeStringList(values = stryMutAct_9fa48("71998") ? ["Stryker was here"] : (stryCov_9fa48("71998"), [])) {
  if (stryMutAct_9fa48("71999")) {
    {}
  } else {
    stryCov_9fa48("71999");
    return stryMutAct_9fa48("72000") ? [] : (stryCov_9fa48("72000"), [...new Set(stryMutAct_9fa48("72001") ? (Array.isArray(values) ? values : []).map(value => String(value || '').trim()) : (stryCov_9fa48("72001"), (Array.isArray(values) ? values : stryMutAct_9fa48("72002") ? ["Stryker was here"] : (stryCov_9fa48("72002"), [])).map(stryMutAct_9fa48("72003") ? () => undefined : (stryCov_9fa48("72003"), value => stryMutAct_9fa48("72004") ? String(value || '') : (stryCov_9fa48("72004"), String(stryMutAct_9fa48("72007") ? value && '' : stryMutAct_9fa48("72006") ? false : stryMutAct_9fa48("72005") ? true : (stryCov_9fa48("72005", "72006", "72007"), value || (stryMutAct_9fa48("72008") ? "Stryker was here!" : (stryCov_9fa48("72008"), '')))).trim()))).filter(stryMutAct_9fa48("72009") ? () => undefined : (stryCov_9fa48("72009"), value => stryMutAct_9fa48("72013") ? value.length <= NUM.ZERO : stryMutAct_9fa48("72012") ? value.length >= NUM.ZERO : stryMutAct_9fa48("72011") ? false : stryMutAct_9fa48("72010") ? true : (stryCov_9fa48("72010", "72011", "72012", "72013"), value.length > NUM.ZERO)))))]);
  }
}
function normalizeStringMap(values = {}) {
  if (stryMutAct_9fa48("72014")) {
    {}
  } else {
    stryCov_9fa48("72014");
    if (stryMutAct_9fa48("72017") ? !values && typeof values !== TYPEOF.OBJECT : stryMutAct_9fa48("72016") ? false : stryMutAct_9fa48("72015") ? true : (stryCov_9fa48("72015", "72016", "72017"), (stryMutAct_9fa48("72018") ? values : (stryCov_9fa48("72018"), !values)) || (stryMutAct_9fa48("72020") ? typeof values === TYPEOF.OBJECT : stryMutAct_9fa48("72019") ? false : (stryCov_9fa48("72019", "72020"), typeof values !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("72021")) {
        {}
      } else {
        stryCov_9fa48("72021");
        return {};
      }
    }
    return stryMutAct_9fa48("72022") ? Object.keys(values).reduce((accumulator, key) => {
      const normalizedValue = normalizeOptionalString(values[key]);
      if (normalizedValue) {
        accumulator[key] = normalizedValue;
      }
      return accumulator;
    }, {}) : (stryCov_9fa48("72022"), Object.keys(values).sort().reduce((accumulator, key) => {
      if (stryMutAct_9fa48("72023")) {
        {}
      } else {
        stryCov_9fa48("72023");
        const normalizedValue = normalizeOptionalString(values[key]);
        if (stryMutAct_9fa48("72025") ? false : stryMutAct_9fa48("72024") ? true : (stryCov_9fa48("72024", "72025"), normalizedValue)) {
          if (stryMutAct_9fa48("72026")) {
            {}
          } else {
            stryCov_9fa48("72026");
            accumulator[key] = normalizedValue;
          }
        }
        return accumulator;
      }
    }, {}));
  }
}
function freezeRecord(record) {
  if (stryMutAct_9fa48("72027")) {
    {}
  } else {
    stryCov_9fa48("72027");
    return (stryMutAct_9fa48("72030") ? record || typeof record === TYPEOF.OBJECT : stryMutAct_9fa48("72029") ? false : stryMutAct_9fa48("72028") ? true : (stryCov_9fa48("72028", "72029", "72030"), record && (stryMutAct_9fa48("72032") ? typeof record !== TYPEOF.OBJECT : stryMutAct_9fa48("72031") ? true : (stryCov_9fa48("72031", "72032"), typeof record === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("72033") ? {} : (stryCov_9fa48("72033"), {
      ...record
    })) : null;
  }
}
function buildContext(options = {}) {
  if (stryMutAct_9fa48("72034")) {
    {}
  } else {
    stryCov_9fa48("72034");
    const membershipLifecycleSummary = (stryMutAct_9fa48("72037") ? options.membershipLifecycleSummary || typeof options.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("72036") ? false : stryMutAct_9fa48("72035") ? true : (stryCov_9fa48("72035", "72036", "72037"), options.membershipLifecycleSummary && (stryMutAct_9fa48("72039") ? typeof options.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("72038") ? true : (stryCov_9fa48("72038", "72039"), typeof options.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? options.membershipLifecycleSummary : null;
    const projectionDiagnostics = (stryMutAct_9fa48("72042") ? options.projectionDiagnostics || typeof options.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("72041") ? false : stryMutAct_9fa48("72040") ? true : (stryCov_9fa48("72040", "72041", "72042"), options.projectionDiagnostics && (stryMutAct_9fa48("72044") ? typeof options.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("72043") ? true : (stryCov_9fa48("72043", "72044"), typeof options.projectionDiagnostics === TYPEOF.OBJECT)))) ? options.projectionDiagnostics : (stryMutAct_9fa48("72047") ? membershipLifecycleSummary?.projectionDiagnostics || typeof membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("72046") ? false : stryMutAct_9fa48("72045") ? true : (stryCov_9fa48("72045", "72046", "72047"), (stryMutAct_9fa48("72048") ? membershipLifecycleSummary.projectionDiagnostics : (stryCov_9fa48("72048"), membershipLifecycleSummary?.projectionDiagnostics)) && (stryMutAct_9fa48("72050") ? typeof membershipLifecycleSummary.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("72049") ? true : (stryCov_9fa48("72049", "72050"), typeof membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT)))) ? membershipLifecycleSummary.projectionDiagnostics : null;
    const publishedActiveNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72051") ? options.publishedActiveNodeIds && membershipLifecycleSummary?.publishedActiveNodeIds : (stryCov_9fa48("72051"), options.publishedActiveNodeIds ?? (stryMutAct_9fa48("72052") ? membershipLifecycleSummary.publishedActiveNodeIds : (stryCov_9fa48("72052"), membershipLifecycleSummary?.publishedActiveNodeIds))));
    const publicationStatus = normalizeOptionalString(stryMutAct_9fa48("72053") ? (options.publicationStatus ?? options.status) && options.publicationStatusNormalized : (stryCov_9fa48("72053"), (stryMutAct_9fa48("72054") ? options.publicationStatus && options.status : (stryCov_9fa48("72054"), options.publicationStatus ?? options.status)) ?? options.publicationStatusNormalized));
    const publicationStatusNormalized = publicationStatus ? stryMutAct_9fa48("72055") ? publicationStatus.toLowerCase() : (stryCov_9fa48("72055"), publicationStatus.toUpperCase()) : stryMutAct_9fa48("72056") ? "Stryker was here!" : (stryCov_9fa48("72056"), '');
    const publishedActiveNodeIdsPresent = stryMutAct_9fa48("72059") ? options.publishedActiveNodeIdsPresent === true && options.publishedActiveNodeIdsPresent !== false && Array.isArray(options.publishedActiveNodeIds) && options.publishedActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("72058") ? false : stryMutAct_9fa48("72057") ? true : (stryCov_9fa48("72057", "72058", "72059"), (stryMutAct_9fa48("72061") ? options.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("72060") ? false : (stryCov_9fa48("72060", "72061"), options.publishedActiveNodeIdsPresent === (stryMutAct_9fa48("72062") ? false : (stryCov_9fa48("72062"), true)))) || (stryMutAct_9fa48("72064") ? options.publishedActiveNodeIdsPresent !== false && Array.isArray(options.publishedActiveNodeIds) || options.publishedActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("72063") ? false : (stryCov_9fa48("72063", "72064"), (stryMutAct_9fa48("72066") ? options.publishedActiveNodeIdsPresent !== false || Array.isArray(options.publishedActiveNodeIds) : stryMutAct_9fa48("72065") ? true : (stryCov_9fa48("72065", "72066"), (stryMutAct_9fa48("72068") ? options.publishedActiveNodeIdsPresent === false : stryMutAct_9fa48("72067") ? true : (stryCov_9fa48("72067", "72068"), options.publishedActiveNodeIdsPresent !== (stryMutAct_9fa48("72069") ? true : (stryCov_9fa48("72069"), false)))) && Array.isArray(options.publishedActiveNodeIds))) && (stryMutAct_9fa48("72072") ? options.publishedActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72071") ? options.publishedActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72070") ? true : (stryCov_9fa48("72070", "72071", "72072"), options.publishedActiveNodeIds.length > NUM.ZERO)))));
    const durablePublishedActiveNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72073") ? options.durablePublishedActiveNodeIds && (publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ? publishedActiveNodeIds : []) : (stryCov_9fa48("72073"), options.durablePublishedActiveNodeIds ?? ((stryMutAct_9fa48("72076") ? publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72075") ? false : stryMutAct_9fa48("72074") ? true : (stryCov_9fa48("72074", "72075", "72076"), publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) ? publishedActiveNodeIds : stryMutAct_9fa48("72077") ? ["Stryker was here"] : (stryCov_9fa48("72077"), []))));
    const projectedServingNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72078") ? options.projectedServingNodeIds && membershipLifecycleSummary?.projectedServingNodeIds : (stryCov_9fa48("72078"), options.projectedServingNodeIds ?? (stryMutAct_9fa48("72079") ? membershipLifecycleSummary.projectedServingNodeIds : (stryCov_9fa48("72079"), membershipLifecycleSummary?.projectedServingNodeIds))));
    const locallyEligibleNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72080") ? (options.locallyEligibleNodeIds ?? membershipLifecycleSummary?.locallyEligibleNodeIds) && projectedServingNodeIds : (stryCov_9fa48("72080"), (stryMutAct_9fa48("72081") ? options.locallyEligibleNodeIds && membershipLifecycleSummary?.locallyEligibleNodeIds : (stryCov_9fa48("72081"), options.locallyEligibleNodeIds ?? (stryMutAct_9fa48("72082") ? membershipLifecycleSummary.locallyEligibleNodeIds : (stryCov_9fa48("72082"), membershipLifecycleSummary?.locallyEligibleNodeIds)))) ?? projectedServingNodeIds));
    const recoveryEligibleIncludedNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72083") ? options.recoveryEligibleIncludedNodeIds && projectionDiagnostics?.recoveryEligibleIncludedNodeIds : (stryCov_9fa48("72083"), options.recoveryEligibleIncludedNodeIds ?? (stryMutAct_9fa48("72084") ? projectionDiagnostics.recoveryEligibleIncludedNodeIds : (stryCov_9fa48("72084"), projectionDiagnostics?.recoveryEligibleIncludedNodeIds))));
    const livenessFallbackIncludedNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72085") ? options.livenessFallbackIncludedNodeIds && projectionDiagnostics?.livenessFallbackIncludedNodeIds : (stryCov_9fa48("72085"), options.livenessFallbackIncludedNodeIds ?? (stryMutAct_9fa48("72086") ? projectionDiagnostics.livenessFallbackIncludedNodeIds : (stryCov_9fa48("72086"), projectionDiagnostics?.livenessFallbackIncludedNodeIds))));
    const explicitRecoveryActiveNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72087") ? options.recoveryActiveNodeIds && membershipLifecycleSummary?.recoveryActiveNodeIds : (stryCov_9fa48("72087"), options.recoveryActiveNodeIds ?? (stryMutAct_9fa48("72088") ? membershipLifecycleSummary.recoveryActiveNodeIds : (stryCov_9fa48("72088"), membershipLifecycleSummary?.recoveryActiveNodeIds))));
    const recoveryActiveNodeIds = (stryMutAct_9fa48("72092") ? explicitRecoveryActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72091") ? explicitRecoveryActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72090") ? false : stryMutAct_9fa48("72089") ? true : (stryCov_9fa48("72089", "72090", "72091", "72092"), explicitRecoveryActiveNodeIds.length > NUM.ZERO)) ? explicitRecoveryActiveNodeIds : normalizeNodeIdList((stryMutAct_9fa48("72096") ? locallyEligibleNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72095") ? locallyEligibleNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72094") ? false : stryMutAct_9fa48("72093") ? true : (stryCov_9fa48("72093", "72094", "72095", "72096"), locallyEligibleNodeIds.length > NUM.ZERO)) ? locallyEligibleNodeIds : projectedServingNodeIds);
    const recoveryActiveNodeSource = stryMutAct_9fa48("72099") ? normalizeOptionalString(options.recoveryActiveNodeSource ?? membershipLifecycleSummary?.recoveryActiveNodeSource) && (recoveryActiveNodeIds.length > NUM.ZERO && recoveryActiveNodeIds.every(nodeId => durablePublishedActiveNodeIds.includes(nodeId)) ? 'published_membership' : null) : stryMutAct_9fa48("72098") ? false : stryMutAct_9fa48("72097") ? true : (stryCov_9fa48("72097", "72098", "72099"), normalizeOptionalString(stryMutAct_9fa48("72100") ? options.recoveryActiveNodeSource && membershipLifecycleSummary?.recoveryActiveNodeSource : (stryCov_9fa48("72100"), options.recoveryActiveNodeSource ?? (stryMutAct_9fa48("72101") ? membershipLifecycleSummary.recoveryActiveNodeSource : (stryCov_9fa48("72101"), membershipLifecycleSummary?.recoveryActiveNodeSource)))) || ((stryMutAct_9fa48("72104") ? recoveryActiveNodeIds.length > NUM.ZERO || recoveryActiveNodeIds.every(nodeId => durablePublishedActiveNodeIds.includes(nodeId)) : stryMutAct_9fa48("72103") ? false : stryMutAct_9fa48("72102") ? true : (stryCov_9fa48("72102", "72103", "72104"), (stryMutAct_9fa48("72107") ? recoveryActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72106") ? recoveryActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72105") ? true : (stryCov_9fa48("72105", "72106", "72107"), recoveryActiveNodeIds.length > NUM.ZERO)) && (stryMutAct_9fa48("72108") ? recoveryActiveNodeIds.some(nodeId => durablePublishedActiveNodeIds.includes(nodeId)) : (stryCov_9fa48("72108"), recoveryActiveNodeIds.every(stryMutAct_9fa48("72109") ? () => undefined : (stryCov_9fa48("72109"), nodeId => durablePublishedActiveNodeIds.includes(nodeId))))))) ? stryMutAct_9fa48("72110") ? "" : (stryCov_9fa48("72110"), 'published_membership') : null));
    const missingPublishedRecoveryActiveNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72111") ? (options.missingPublishedRecoveryActiveNodeIds ?? membershipLifecycleSummary?.missingPublishedRecoveryActiveNodeIds) && recoveryActiveNodeIds.filter(nodeId => !durablePublishedActiveNodeIds.includes(nodeId)) : (stryCov_9fa48("72111"), (stryMutAct_9fa48("72112") ? options.missingPublishedRecoveryActiveNodeIds && membershipLifecycleSummary?.missingPublishedRecoveryActiveNodeIds : (stryCov_9fa48("72112"), options.missingPublishedRecoveryActiveNodeIds ?? (stryMutAct_9fa48("72113") ? membershipLifecycleSummary.missingPublishedRecoveryActiveNodeIds : (stryCov_9fa48("72113"), membershipLifecycleSummary?.missingPublishedRecoveryActiveNodeIds)))) ?? (stryMutAct_9fa48("72114") ? recoveryActiveNodeIds : (stryCov_9fa48("72114"), recoveryActiveNodeIds.filter(stryMutAct_9fa48("72115") ? () => undefined : (stryCov_9fa48("72115"), nodeId => stryMutAct_9fa48("72116") ? durablePublishedActiveNodeIds.includes(nodeId) : (stryCov_9fa48("72116"), !durablePublishedActiveNodeIds.includes(nodeId))))))));
    const suspectedOrTransitioningNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72117") ? options.suspectedOrTransitioningNodeIds && membershipLifecycleSummary?.suspectedOrTransitioningNodeIds : (stryCov_9fa48("72117"), options.suspectedOrTransitioningNodeIds ?? (stryMutAct_9fa48("72118") ? membershipLifecycleSummary.suspectedOrTransitioningNodeIds : (stryCov_9fa48("72118"), membershipLifecycleSummary?.suspectedOrTransitioningNodeIds))));
    const memberStatesByNodeId = (stryMutAct_9fa48("72121") ? membershipLifecycleSummary?.memberStatesByNodeId || typeof membershipLifecycleSummary.memberStatesByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("72120") ? false : stryMutAct_9fa48("72119") ? true : (stryCov_9fa48("72119", "72120", "72121"), (stryMutAct_9fa48("72122") ? membershipLifecycleSummary.memberStatesByNodeId : (stryCov_9fa48("72122"), membershipLifecycleSummary?.memberStatesByNodeId)) && (stryMutAct_9fa48("72124") ? typeof membershipLifecycleSummary.memberStatesByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("72123") ? true : (stryCov_9fa48("72123", "72124"), typeof membershipLifecycleSummary.memberStatesByNodeId === TYPEOF.OBJECT)))) ? membershipLifecycleSummary.memberStatesByNodeId : (stryMutAct_9fa48("72127") ? options.memberStatesByNodeId || typeof options.memberStatesByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("72126") ? false : stryMutAct_9fa48("72125") ? true : (stryCov_9fa48("72125", "72126", "72127"), options.memberStatesByNodeId && (stryMutAct_9fa48("72129") ? typeof options.memberStatesByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("72128") ? true : (stryCov_9fa48("72128", "72129"), typeof options.memberStatesByNodeId === TYPEOF.OBJECT)))) ? options.memberStatesByNodeId : {};
    const recoveryEpochByNodeId = normalizeStringMap(stryMutAct_9fa48("72130") ? membershipLifecycleSummary?.recoveryEpochByNodeId && options.recoveryEpochByNodeId : (stryCov_9fa48("72130"), (stryMutAct_9fa48("72131") ? membershipLifecycleSummary.recoveryEpochByNodeId : (stryCov_9fa48("72131"), membershipLifecycleSummary?.recoveryEpochByNodeId)) ?? options.recoveryEpochByNodeId));
    const membershipFreeze = (stryMutAct_9fa48("72134") ? membershipLifecycleSummary?.membershipFreeze || typeof membershipLifecycleSummary.membershipFreeze === TYPEOF.OBJECT : stryMutAct_9fa48("72133") ? false : stryMutAct_9fa48("72132") ? true : (stryCov_9fa48("72132", "72133", "72134"), (stryMutAct_9fa48("72135") ? membershipLifecycleSummary.membershipFreeze : (stryCov_9fa48("72135"), membershipLifecycleSummary?.membershipFreeze)) && (stryMutAct_9fa48("72137") ? typeof membershipLifecycleSummary.membershipFreeze !== TYPEOF.OBJECT : stryMutAct_9fa48("72136") ? true : (stryCov_9fa48("72136", "72137"), typeof membershipLifecycleSummary.membershipFreeze === TYPEOF.OBJECT)))) ? membershipLifecycleSummary.membershipFreeze : (stryMutAct_9fa48("72140") ? options.membershipFreeze || typeof options.membershipFreeze === TYPEOF.OBJECT : stryMutAct_9fa48("72139") ? false : stryMutAct_9fa48("72138") ? true : (stryCov_9fa48("72138", "72139", "72140"), options.membershipFreeze && (stryMutAct_9fa48("72142") ? typeof options.membershipFreeze !== TYPEOF.OBJECT : stryMutAct_9fa48("72141") ? true : (stryCov_9fa48("72141", "72142"), typeof options.membershipFreeze === TYPEOF.OBJECT)))) ? options.membershipFreeze : null;
    return stryMutAct_9fa48("72143") ? {} : (stryCov_9fa48("72143"), {
      publicationEpoch: Number.isFinite(options.publicationEpoch) ? Math.trunc(options.publicationEpoch) : null,
      publicationStatus,
      publicationStatusNormalized,
      sourceTopologyEpoch: Number.isFinite(options.sourceTopologyEpoch) ? Math.trunc(options.sourceTopologyEpoch) : null,
      sourceSnapshotVersion: Number.isFinite(options.sourceSnapshotVersion) ? Math.trunc(options.sourceSnapshotVersion) : null,
      publishedActiveNodeIdsPresent,
      durablePublishedActiveNodeIds,
      publishedActiveNodeIds,
      requiredAckNodeIds: normalizeNodeIdList(options.requiredAckNodeIds),
      acknowledgedNodeIds: normalizeNodeIdList(options.acknowledgedNodeIds),
      priorityPartitionSummary: (stryMutAct_9fa48("72146") ? options.priorityPartitionSummary || typeof options.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("72145") ? false : stryMutAct_9fa48("72144") ? true : (stryCov_9fa48("72144", "72145", "72146"), options.priorityPartitionSummary && (stryMutAct_9fa48("72148") ? typeof options.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("72147") ? true : (stryCov_9fa48("72147", "72148"), typeof options.priorityPartitionSummary === TYPEOF.OBJECT)))) ? options.priorityPartitionSummary : null,
      membershipLifecycleSummary,
      projectionDiagnostics,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      recoveryEligibleIncludedNodeIds,
      livenessFallbackIncludedNodeIds,
      recoveryActiveNodeIds,
      recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds,
      suspectedOrTransitioningNodeIds,
      memberStatesByNodeId,
      recoveryEpochByNodeId,
      membershipFreeze,
      targetNodeId: normalizeOptionalString(options.targetNodeId)
    });
  }
}
function buildPriorityRecoveryReasonCodes(context) {
  if (stryMutAct_9fa48("72149")) {
    {}
  } else {
    stryCov_9fa48("72149");
    const publicationExcludesTargetNode = stryMutAct_9fa48("72152") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED && context.publishedActiveNodeIdsPresent === true && context.targetNodeId || !context.durablePublishedActiveNodeIds.includes(context.targetNodeId) : stryMutAct_9fa48("72151") ? false : stryMutAct_9fa48("72150") ? true : (stryCov_9fa48("72150", "72151", "72152"), (stryMutAct_9fa48("72154") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED && context.publishedActiveNodeIdsPresent === true || context.targetNodeId : stryMutAct_9fa48("72153") ? true : (stryCov_9fa48("72153", "72154"), (stryMutAct_9fa48("72156") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED || context.publishedActiveNodeIdsPresent === true : stryMutAct_9fa48("72155") ? true : (stryCov_9fa48("72155", "72156"), (stryMutAct_9fa48("72158") ? context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72157") ? true : (stryCov_9fa48("72157", "72158"), context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) && (stryMutAct_9fa48("72160") ? context.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("72159") ? true : (stryCov_9fa48("72159", "72160"), context.publishedActiveNodeIdsPresent === (stryMutAct_9fa48("72161") ? false : (stryCov_9fa48("72161"), true)))))) && context.targetNodeId)) && (stryMutAct_9fa48("72162") ? context.durablePublishedActiveNodeIds.includes(context.targetNodeId) : (stryCov_9fa48("72162"), !context.durablePublishedActiveNodeIds.includes(context.targetNodeId))));
    const unpublishedObservation = stryMutAct_9fa48("72165") ? context.publicationStatusNormalized.length === NUM.ZERO || context.targetNodeId !== null || context.recoveryActiveNodeIds.length > NUM.ZERO || context.projectedServingNodeIds.length > NUM.ZERO || context.locallyEligibleNodeIds.length > NUM.ZERO : stryMutAct_9fa48("72164") ? false : stryMutAct_9fa48("72163") ? true : (stryCov_9fa48("72163", "72164", "72165"), (stryMutAct_9fa48("72167") ? context.publicationStatusNormalized.length !== NUM.ZERO : stryMutAct_9fa48("72166") ? true : (stryCov_9fa48("72166", "72167"), context.publicationStatusNormalized.length === NUM.ZERO)) && (stryMutAct_9fa48("72169") ? (context.targetNodeId !== null || context.recoveryActiveNodeIds.length > NUM.ZERO || context.projectedServingNodeIds.length > NUM.ZERO) && context.locallyEligibleNodeIds.length > NUM.ZERO : stryMutAct_9fa48("72168") ? true : (stryCov_9fa48("72168", "72169"), (stryMutAct_9fa48("72171") ? (context.targetNodeId !== null || context.recoveryActiveNodeIds.length > NUM.ZERO) && context.projectedServingNodeIds.length > NUM.ZERO : stryMutAct_9fa48("72170") ? false : (stryCov_9fa48("72170", "72171"), (stryMutAct_9fa48("72173") ? context.targetNodeId !== null && context.recoveryActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("72172") ? false : (stryCov_9fa48("72172", "72173"), (stryMutAct_9fa48("72175") ? context.targetNodeId === null : stryMutAct_9fa48("72174") ? false : (stryCov_9fa48("72174", "72175"), context.targetNodeId !== null)) || (stryMutAct_9fa48("72178") ? context.recoveryActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72177") ? context.recoveryActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72176") ? false : (stryCov_9fa48("72176", "72177", "72178"), context.recoveryActiveNodeIds.length > NUM.ZERO)))) || (stryMutAct_9fa48("72181") ? context.projectedServingNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72180") ? context.projectedServingNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72179") ? false : (stryCov_9fa48("72179", "72180", "72181"), context.projectedServingNodeIds.length > NUM.ZERO)))) || (stryMutAct_9fa48("72184") ? context.locallyEligibleNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72183") ? context.locallyEligibleNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72182") ? false : (stryCov_9fa48("72182", "72183", "72184"), context.locallyEligibleNodeIds.length > NUM.ZERO)))));
    const reasonCodes = stryMutAct_9fa48("72185") ? ["Stryker was here"] : (stryCov_9fa48("72185"), []);
    const publicationPending = stryMutAct_9fa48("72188") ? context.publicationStatusNormalized.length > NUM.ZERO || context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72187") ? false : stryMutAct_9fa48("72186") ? true : (stryCov_9fa48("72186", "72187", "72188"), (stryMutAct_9fa48("72191") ? context.publicationStatusNormalized.length <= NUM.ZERO : stryMutAct_9fa48("72190") ? context.publicationStatusNormalized.length >= NUM.ZERO : stryMutAct_9fa48("72189") ? true : (stryCov_9fa48("72189", "72190", "72191"), context.publicationStatusNormalized.length > NUM.ZERO)) && (stryMutAct_9fa48("72193") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72192") ? true : (stryCov_9fa48("72192", "72193"), context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)));
    if (stryMutAct_9fa48("72196") ? (publicationPending || publicationExcludesTargetNode) && unpublishedObservation : stryMutAct_9fa48("72195") ? false : stryMutAct_9fa48("72194") ? true : (stryCov_9fa48("72194", "72195", "72196"), (stryMutAct_9fa48("72198") ? publicationPending && publicationExcludesTargetNode : stryMutAct_9fa48("72197") ? false : (stryCov_9fa48("72197", "72198"), publicationPending || publicationExcludesTargetNode)) || unpublishedObservation)) {
      if (stryMutAct_9fa48("72199")) {
        {}
      } else {
        stryCov_9fa48("72199");
        reasonCodes.push(CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING);
      }
    }
    if (stryMutAct_9fa48("72201") ? false : stryMutAct_9fa48("72200") ? true : (stryCov_9fa48("72200", "72201"), hasPriorityRecoverySpreadGap(context.priorityPartitionSummary))) {
      if (stryMutAct_9fa48("72202")) {
        {}
      } else {
        stryCov_9fa48("72202");
        reasonCodes.push(CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD);
      }
    }
    return Object.freeze(stryMutAct_9fa48("72203") ? [] : (stryCov_9fa48("72203"), [...new Set(reasonCodes)]));
  }
}
function resolveRecoveryProtocolState(context) {
  if (stryMutAct_9fa48("72204")) {
    {}
  } else {
    stryCov_9fa48("72204");
    if (stryMutAct_9fa48("72207") ? context.publicationStatusNormalized.length === NUM.ZERO && context.publishedActiveNodeIdsPresent !== true || context.publishedActiveNodeIds.length === NUM.ZERO : stryMutAct_9fa48("72206") ? false : stryMutAct_9fa48("72205") ? true : (stryCov_9fa48("72205", "72206", "72207"), (stryMutAct_9fa48("72209") ? context.publicationStatusNormalized.length === NUM.ZERO || context.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("72208") ? true : (stryCov_9fa48("72208", "72209"), (stryMutAct_9fa48("72211") ? context.publicationStatusNormalized.length !== NUM.ZERO : stryMutAct_9fa48("72210") ? true : (stryCov_9fa48("72210", "72211"), context.publicationStatusNormalized.length === NUM.ZERO)) && (stryMutAct_9fa48("72213") ? context.publishedActiveNodeIdsPresent === true : stryMutAct_9fa48("72212") ? true : (stryCov_9fa48("72212", "72213"), context.publishedActiveNodeIdsPresent !== (stryMutAct_9fa48("72214") ? false : (stryCov_9fa48("72214"), true)))))) && (stryMutAct_9fa48("72216") ? context.publishedActiveNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("72215") ? true : (stryCov_9fa48("72215", "72216"), context.publishedActiveNodeIds.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("72217")) {
        {}
      } else {
        stryCov_9fa48("72217");
        return RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION;
      }
    }
    if (stryMutAct_9fa48("72220") ? context.publicationStatusNormalized.length > NUM.ZERO || context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72219") ? false : stryMutAct_9fa48("72218") ? true : (stryCov_9fa48("72218", "72219", "72220"), (stryMutAct_9fa48("72223") ? context.publicationStatusNormalized.length <= NUM.ZERO : stryMutAct_9fa48("72222") ? context.publicationStatusNormalized.length >= NUM.ZERO : stryMutAct_9fa48("72221") ? true : (stryCov_9fa48("72221", "72222", "72223"), context.publicationStatusNormalized.length > NUM.ZERO)) && (stryMutAct_9fa48("72225") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72224") ? true : (stryCov_9fa48("72224", "72225"), context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)))) {
      if (stryMutAct_9fa48("72226")) {
        {}
      } else {
        stryCov_9fa48("72226");
        return RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING;
      }
    }
    if (stryMutAct_9fa48("72229") ? hasPriorityRecoverySpreadGap(context.priorityPartitionSummary) && context.missingPublishedRecoveryActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("72228") ? false : stryMutAct_9fa48("72227") ? true : (stryCov_9fa48("72227", "72228", "72229"), hasPriorityRecoverySpreadGap(context.priorityPartitionSummary) || (stryMutAct_9fa48("72232") ? context.missingPublishedRecoveryActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72231") ? context.missingPublishedRecoveryActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72230") ? false : (stryCov_9fa48("72230", "72231", "72232"), context.missingPublishedRecoveryActiveNodeIds.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("72233")) {
        {}
      } else {
        stryCov_9fa48("72233");
        return RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING;
      }
    }
    if (stryMutAct_9fa48("72236") ? context.publishedActiveNodeIdsPresent === true && context.publishedActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("72235") ? false : stryMutAct_9fa48("72234") ? true : (stryCov_9fa48("72234", "72235", "72236"), (stryMutAct_9fa48("72238") ? context.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("72237") ? false : (stryCov_9fa48("72237", "72238"), context.publishedActiveNodeIdsPresent === (stryMutAct_9fa48("72239") ? false : (stryCov_9fa48("72239"), true)))) || (stryMutAct_9fa48("72242") ? context.publishedActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("72241") ? context.publishedActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("72240") ? false : (stryCov_9fa48("72240", "72241", "72242"), context.publishedActiveNodeIds.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("72243")) {
        {}
      } else {
        stryCov_9fa48("72243");
        return RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED;
      }
    }
    return RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION;
  }
}
function buildParticipationReasons(context, nodeId, flags) {
  if (stryMutAct_9fa48("72244")) {
    {}
  } else {
    stryCov_9fa48("72244");
    const reasons = stryMutAct_9fa48("72245") ? ["Stryker was here"] : (stryCov_9fa48("72245"), []);
    if (stryMutAct_9fa48("72247") ? false : stryMutAct_9fa48("72246") ? true : (stryCov_9fa48("72246", "72247"), flags.publishedActive)) {
      if (stryMutAct_9fa48("72248")) {
        {}
      } else {
        stryCov_9fa48("72248");
        reasons.push(PARTICIPATION_REASON.PUBLISHED_MEMBERSHIP);
      }
    }
    if (stryMutAct_9fa48("72251") ? flags.recoveryActive || !flags.publishedActive : stryMutAct_9fa48("72250") ? false : stryMutAct_9fa48("72249") ? true : (stryCov_9fa48("72249", "72250", "72251"), flags.recoveryActive && (stryMutAct_9fa48("72252") ? flags.publishedActive : (stryCov_9fa48("72252"), !flags.publishedActive)))) {
      if (stryMutAct_9fa48("72253")) {
        {}
      } else {
        stryCov_9fa48("72253");
        reasons.push(PARTICIPATION_REASON.RECOVERY_ACTIVE);
      }
    }
    if (stryMutAct_9fa48("72255") ? false : stryMutAct_9fa48("72254") ? true : (stryCov_9fa48("72254", "72255"), flags.projectedServing)) {
      if (stryMutAct_9fa48("72256")) {
        {}
      } else {
        stryCov_9fa48("72256");
        reasons.push(PARTICIPATION_REASON.PROJECTED_SERVING);
      }
    }
    if (stryMutAct_9fa48("72258") ? false : stryMutAct_9fa48("72257") ? true : (stryCov_9fa48("72257", "72258"), flags.locallyEligible)) {
      if (stryMutAct_9fa48("72259")) {
        {}
      } else {
        stryCov_9fa48("72259");
        reasons.push(PARTICIPATION_REASON.LOCALLY_ELIGIBLE);
      }
    }
    if (stryMutAct_9fa48("72261") ? false : stryMutAct_9fa48("72260") ? true : (stryCov_9fa48("72260", "72261"), flags.suspectedOrTransitioning)) {
      if (stryMutAct_9fa48("72262")) {
        {}
      } else {
        stryCov_9fa48("72262");
        reasons.push(PARTICIPATION_REASON.SUSPECTED_OR_TRANSITIONING);
      }
    }
    if (stryMutAct_9fa48("72264") ? false : stryMutAct_9fa48("72263") ? true : (stryCov_9fa48("72263", "72264"), context.recoveryEligibleIncludedNodeIds.includes(nodeId))) {
      if (stryMutAct_9fa48("72265")) {
        {}
      } else {
        stryCov_9fa48("72265");
        reasons.push(PARTICIPATION_REASON.RECOVERY_ELIGIBLE_PROJECTION);
      }
    }
    if (stryMutAct_9fa48("72267") ? false : stryMutAct_9fa48("72266") ? true : (stryCov_9fa48("72266", "72267"), context.livenessFallbackIncludedNodeIds.includes(nodeId))) {
      if (stryMutAct_9fa48("72268")) {
        {}
      } else {
        stryCov_9fa48("72268");
        reasons.push(PARTICIPATION_REASON.LIVENESS_FALLBACK_PROJECTION);
      }
    }
    if (stryMutAct_9fa48("72272") ? context.projectionDiagnostics.readinessExcludedNodeIds?.includes(nodeId) : stryMutAct_9fa48("72271") ? context.projectionDiagnostics?.readinessExcludedNodeIds.includes(nodeId) : stryMutAct_9fa48("72270") ? false : stryMutAct_9fa48("72269") ? true : (stryCov_9fa48("72269", "72270", "72271", "72272"), context.projectionDiagnostics?.readinessExcludedNodeIds?.includes(nodeId))) {
      if (stryMutAct_9fa48("72273")) {
        {}
      } else {
        stryCov_9fa48("72273");
        reasons.push(PARTICIPATION_REASON.READINESS_EXCLUDED);
      }
    }
    if (stryMutAct_9fa48("72277") ? context.projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds?.includes(nodeId) : stryMutAct_9fa48("72276") ? context.projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds.includes(nodeId) : stryMutAct_9fa48("72275") ? false : stryMutAct_9fa48("72274") ? true : (stryCov_9fa48("72274", "72275", "72276", "72277"), context.projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds?.includes(nodeId))) {
      if (stryMutAct_9fa48("72278")) {
        {}
      } else {
        stryCov_9fa48("72278");
        reasons.push(PARTICIPATION_REASON.CLUSTER_MEMBER_UNHEALTHY);
      }
    }
    if (stryMutAct_9fa48("72281") ? context.membershipFreeze?.active === true || context.membershipFreeze?.retainedPublishedNodeIds?.includes(nodeId) : stryMutAct_9fa48("72280") ? false : stryMutAct_9fa48("72279") ? true : (stryCov_9fa48("72279", "72280", "72281"), (stryMutAct_9fa48("72283") ? context.membershipFreeze?.active !== true : stryMutAct_9fa48("72282") ? true : (stryCov_9fa48("72282", "72283"), (stryMutAct_9fa48("72284") ? context.membershipFreeze.active : (stryCov_9fa48("72284"), context.membershipFreeze?.active)) === (stryMutAct_9fa48("72285") ? false : (stryCov_9fa48("72285"), true)))) && (stryMutAct_9fa48("72287") ? context.membershipFreeze.retainedPublishedNodeIds?.includes(nodeId) : stryMutAct_9fa48("72286") ? context.membershipFreeze?.retainedPublishedNodeIds.includes(nodeId) : (stryCov_9fa48("72286", "72287"), context.membershipFreeze?.retainedPublishedNodeIds?.includes(nodeId))))) {
      if (stryMutAct_9fa48("72288")) {
        {}
      } else {
        stryCov_9fa48("72288");
        reasons.push(PARTICIPATION_REASON.MEMBERSHIP_FREEZE_RETAINED);
      }
    }
    return Object.freeze(normalizeStringList(reasons));
  }
}
function resolveParticipationState(memberState, flags) {
  if (stryMutAct_9fa48("72289")) {
    {}
  } else {
    stryCov_9fa48("72289");
    if (stryMutAct_9fa48("72292") ? memberState !== MEMBERSHIP_MEMBER_STATE.RETIRED : stryMutAct_9fa48("72291") ? false : stryMutAct_9fa48("72290") ? true : (stryCov_9fa48("72290", "72291", "72292"), memberState === MEMBERSHIP_MEMBER_STATE.RETIRED)) {
      if (stryMutAct_9fa48("72293")) {
        {}
      } else {
        stryCov_9fa48("72293");
        return NODE_PARTICIPATION_STATE.RETIRED;
      }
    }
    if (stryMutAct_9fa48("72296") ? memberState !== MEMBERSHIP_MEMBER_STATE.DRAINING : stryMutAct_9fa48("72295") ? false : stryMutAct_9fa48("72294") ? true : (stryCov_9fa48("72294", "72295", "72296"), memberState === MEMBERSHIP_MEMBER_STATE.DRAINING)) {
      if (stryMutAct_9fa48("72297")) {
        {}
      } else {
        stryCov_9fa48("72297");
        return NODE_PARTICIPATION_STATE.DRAINING;
      }
    }
    if (stryMutAct_9fa48("72299") ? false : stryMutAct_9fa48("72298") ? true : (stryCov_9fa48("72298", "72299"), flags.publishedActive)) {
      if (stryMutAct_9fa48("72300")) {
        {}
      } else {
        stryCov_9fa48("72300");
        return NODE_PARTICIPATION_STATE.PUBLISHED_ACTIVE;
      }
    }
    if (stryMutAct_9fa48("72302") ? false : stryMutAct_9fa48("72301") ? true : (stryCov_9fa48("72301", "72302"), flags.recoveryActive)) {
      if (stryMutAct_9fa48("72303")) {
        {}
      } else {
        stryCov_9fa48("72303");
        return NODE_PARTICIPATION_STATE.RECOVERY_PENDING_PUBLISH;
      }
    }
    if (stryMutAct_9fa48("72306") ? flags.suspectedOrTransitioning && memberState === MEMBERSHIP_MEMBER_STATE.UNREACHABLE : stryMutAct_9fa48("72305") ? false : stryMutAct_9fa48("72304") ? true : (stryCov_9fa48("72304", "72305", "72306"), flags.suspectedOrTransitioning || (stryMutAct_9fa48("72308") ? memberState !== MEMBERSHIP_MEMBER_STATE.UNREACHABLE : stryMutAct_9fa48("72307") ? false : (stryCov_9fa48("72307", "72308"), memberState === MEMBERSHIP_MEMBER_STATE.UNREACHABLE)))) {
      if (stryMutAct_9fa48("72309")) {
        {}
      } else {
        stryCov_9fa48("72309");
        return NODE_PARTICIPATION_STATE.SUSPECTED;
      }
    }
    if (stryMutAct_9fa48("72312") ? flags.locallyEligible && flags.projectedServing : stryMutAct_9fa48("72311") ? false : stryMutAct_9fa48("72310") ? true : (stryCov_9fa48("72310", "72311", "72312"), flags.locallyEligible || flags.projectedServing)) {
      if (stryMutAct_9fa48("72313")) {
        {}
      } else {
        stryCov_9fa48("72313");
        return NODE_PARTICIPATION_STATE.OBSERVED_PENDING_PUBLISH;
      }
    }
    if (stryMutAct_9fa48("72316") ? memberState !== MEMBERSHIP_MEMBER_STATE.CATCHING_UP : stryMutAct_9fa48("72315") ? false : stryMutAct_9fa48("72314") ? true : (stryCov_9fa48("72314", "72315", "72316"), memberState === MEMBERSHIP_MEMBER_STATE.CATCHING_UP)) {
      if (stryMutAct_9fa48("72317")) {
        {}
      } else {
        stryCov_9fa48("72317");
        return NODE_PARTICIPATION_STATE.CATCHING_UP;
      }
    }
    if (stryMutAct_9fa48("72320") ? memberState !== MEMBERSHIP_MEMBER_STATE.JOINING : stryMutAct_9fa48("72319") ? false : stryMutAct_9fa48("72318") ? true : (stryCov_9fa48("72318", "72319", "72320"), memberState === MEMBERSHIP_MEMBER_STATE.JOINING)) {
      if (stryMutAct_9fa48("72321")) {
        {}
      } else {
        stryCov_9fa48("72321");
        return NODE_PARTICIPATION_STATE.JOINING;
      }
    }
    return NODE_PARTICIPATION_STATE.INACTIVE;
  }
}
function buildParticipationByNodeId(context) {
  if (stryMutAct_9fa48("72322")) {
    {}
  } else {
    stryCov_9fa48("72322");
    const allNodeIds = normalizeNodeIdList(stryMutAct_9fa48("72323") ? [] : (stryCov_9fa48("72323"), [...context.publishedActiveNodeIds, ...context.projectedServingNodeIds, ...context.locallyEligibleNodeIds, ...context.recoveryEligibleIncludedNodeIds, ...context.livenessFallbackIncludedNodeIds, ...context.recoveryActiveNodeIds, ...context.missingPublishedRecoveryActiveNodeIds, ...context.suspectedOrTransitioningNodeIds, ...Object.keys(stryMutAct_9fa48("72326") ? context.memberStatesByNodeId && {} : stryMutAct_9fa48("72325") ? false : stryMutAct_9fa48("72324") ? true : (stryCov_9fa48("72324", "72325", "72326"), context.memberStatesByNodeId || {})), ...Object.keys(stryMutAct_9fa48("72329") ? context.recoveryEpochByNodeId && {} : stryMutAct_9fa48("72328") ? false : stryMutAct_9fa48("72327") ? true : (stryCov_9fa48("72327", "72328", "72329"), context.recoveryEpochByNodeId || {})), ...(Array.isArray(stryMutAct_9fa48("72330") ? context.membershipFreeze.retainedPublishedNodeIds : (stryCov_9fa48("72330"), context.membershipFreeze?.retainedPublishedNodeIds)) ? context.membershipFreeze.retainedPublishedNodeIds : stryMutAct_9fa48("72331") ? ["Stryker was here"] : (stryCov_9fa48("72331"), []))]));
    const participationByNodeId = {};
    for (const nodeId of allNodeIds) {
      if (stryMutAct_9fa48("72332")) {
        {}
      } else {
        stryCov_9fa48("72332");
        const memberState = normalizeOptionalString(stryMutAct_9fa48("72333") ? context.memberStatesByNodeId[nodeId] : (stryCov_9fa48("72333"), context.memberStatesByNodeId?.[nodeId]));
        const flags = stryMutAct_9fa48("72334") ? {} : (stryCov_9fa48("72334"), {
          publishedActive: context.durablePublishedActiveNodeIds.includes(nodeId),
          recoveryActive: context.recoveryActiveNodeIds.includes(nodeId),
          projectedServing: context.projectedServingNodeIds.includes(nodeId),
          locallyEligible: context.locallyEligibleNodeIds.includes(nodeId),
          suspectedOrTransitioning: context.suspectedOrTransitioningNodeIds.includes(nodeId)
        });
        const state = resolveParticipationState(memberState, flags);
        const recoverySource = (stryMutAct_9fa48("72335") ? flags.recoveryActive : (stryCov_9fa48("72335"), !flags.recoveryActive)) ? null : context.recoveryEligibleIncludedNodeIds.includes(nodeId) ? stryMutAct_9fa48("72336") ? "" : (stryCov_9fa48("72336"), 'recovery_eligible_projection') : context.livenessFallbackIncludedNodeIds.includes(nodeId) ? stryMutAct_9fa48("72337") ? "" : (stryCov_9fa48("72337"), 'liveness_fallback_projection') : context.recoveryActiveNodeSource;
        participationByNodeId[nodeId] = Object.freeze(stryMutAct_9fa48("72338") ? {} : (stryCov_9fa48("72338"), {
          nodeId,
          state,
          memberState,
          durable: stryMutAct_9fa48("72341") ? state !== NODE_PARTICIPATION_STATE.PUBLISHED_ACTIVE : stryMutAct_9fa48("72340") ? false : stryMutAct_9fa48("72339") ? true : (stryCov_9fa48("72339", "72340", "72341"), state === NODE_PARTICIPATION_STATE.PUBLISHED_ACTIVE),
          publishedActive: flags.publishedActive,
          recoveryActive: flags.recoveryActive,
          projectedServing: flags.projectedServing,
          locallyEligible: flags.locallyEligible,
          suspectedOrTransitioning: flags.suspectedOrTransitioning,
          recoverySource,
          recoveryEpoch: stryMutAct_9fa48("72344") ? context.recoveryEpochByNodeId?.[nodeId] && null : stryMutAct_9fa48("72343") ? false : stryMutAct_9fa48("72342") ? true : (stryCov_9fa48("72342", "72343", "72344"), (stryMutAct_9fa48("72345") ? context.recoveryEpochByNodeId[nodeId] : (stryCov_9fa48("72345"), context.recoveryEpochByNodeId?.[nodeId])) || null),
          reasons: buildParticipationReasons(context, nodeId, flags)
        }));
      }
    }
    return Object.freeze(participationByNodeId);
  }
}
function buildParticipationStateCounts(participationByNodeId = {}) {
  if (stryMutAct_9fa48("72346")) {
    {}
  } else {
    stryCov_9fa48("72346");
    return Object.freeze(Object.values(participationByNodeId).reduce((accumulator, participation) => {
      if (stryMutAct_9fa48("72347")) {
        {}
      } else {
        stryCov_9fa48("72347");
        const state = stryMutAct_9fa48("72348") ? participation.state : (stryCov_9fa48("72348"), participation?.state);
        if (stryMutAct_9fa48("72351") ? typeof state !== TYPEOF.STRING && state.length === NUM.ZERO : stryMutAct_9fa48("72350") ? false : stryMutAct_9fa48("72349") ? true : (stryCov_9fa48("72349", "72350", "72351"), (stryMutAct_9fa48("72353") ? typeof state === TYPEOF.STRING : stryMutAct_9fa48("72352") ? false : (stryCov_9fa48("72352", "72353"), typeof state !== TYPEOF.STRING)) || (stryMutAct_9fa48("72355") ? state.length !== NUM.ZERO : stryMutAct_9fa48("72354") ? false : (stryCov_9fa48("72354", "72355"), state.length === NUM.ZERO)))) {
          if (stryMutAct_9fa48("72356")) {
            {}
          } else {
            stryCov_9fa48("72356");
            return accumulator;
          }
        }
        accumulator[state] = stryMutAct_9fa48("72357") ? (accumulator[state] || NUM.ZERO) - 1 : (stryCov_9fa48("72357"), (stryMutAct_9fa48("72360") ? accumulator[state] && NUM.ZERO : stryMutAct_9fa48("72359") ? false : stryMutAct_9fa48("72358") ? true : (stryCov_9fa48("72358", "72359", "72360"), accumulator[state] || NUM.ZERO)) + 1);
        return accumulator;
      }
    }, {}));
  }
}
function buildRecoveryProtocolSnapshot(options = {}) {
  if (stryMutAct_9fa48("72361")) {
    {}
  } else {
    stryCov_9fa48("72361");
    const context = buildContext(options);
    const participationByNodeId = buildParticipationByNodeId(context);
    const publishedMembershipIncludesTargetNode = context.targetNodeId ? context.durablePublishedActiveNodeIds.includes(context.targetNodeId) : null;
    const publicationPending = stryMutAct_9fa48("72364") ? context.publicationStatusNormalized.length > NUM.ZERO || context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72363") ? false : stryMutAct_9fa48("72362") ? true : (stryCov_9fa48("72362", "72363", "72364"), (stryMutAct_9fa48("72367") ? context.publicationStatusNormalized.length <= NUM.ZERO : stryMutAct_9fa48("72366") ? context.publicationStatusNormalized.length >= NUM.ZERO : stryMutAct_9fa48("72365") ? true : (stryCov_9fa48("72365", "72366", "72367"), context.publicationStatusNormalized.length > NUM.ZERO)) && (stryMutAct_9fa48("72369") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72368") ? true : (stryCov_9fa48("72368", "72369"), context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)));
    const publicationObservationState = (stryMutAct_9fa48("72372") ? context.publicationStatusNormalized.length !== NUM.ZERO : stryMutAct_9fa48("72371") ? false : stryMutAct_9fa48("72370") ? true : (stryCov_9fa48("72370", "72371", "72372"), context.publicationStatusNormalized.length === NUM.ZERO)) ? stryMutAct_9fa48("72373") ? "" : (stryCov_9fa48("72373"), 'unpublished') : (stryMutAct_9fa48("72376") ? context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72375") ? false : stryMutAct_9fa48("72374") ? true : (stryCov_9fa48("72374", "72375", "72376"), context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) ? stryMutAct_9fa48("72377") ? "" : (stryCov_9fa48("72377"), 'authoritative') : stryMutAct_9fa48("72378") ? "" : (stryCov_9fa48("72378"), 'establishing');
    const publicationExcludesTargetNode = (stryMutAct_9fa48("72381") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED && context.publishedActiveNodeIdsPresent === true || context.targetNodeId : stryMutAct_9fa48("72380") ? false : stryMutAct_9fa48("72379") ? true : (stryCov_9fa48("72379", "72380", "72381"), (stryMutAct_9fa48("72383") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED || context.publishedActiveNodeIdsPresent === true : stryMutAct_9fa48("72382") ? true : (stryCov_9fa48("72382", "72383"), (stryMutAct_9fa48("72385") ? context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72384") ? true : (stryCov_9fa48("72384", "72385"), context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) && (stryMutAct_9fa48("72387") ? context.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("72386") ? true : (stryCov_9fa48("72386", "72387"), context.publishedActiveNodeIdsPresent === (stryMutAct_9fa48("72388") ? false : (stryCov_9fa48("72388"), true)))))) && context.targetNodeId)) ? stryMutAct_9fa48("72391") ? publishedMembershipIncludesTargetNode !== false : stryMutAct_9fa48("72390") ? false : stryMutAct_9fa48("72389") ? true : (stryCov_9fa48("72389", "72390", "72391"), publishedMembershipIncludesTargetNode === (stryMutAct_9fa48("72392") ? true : (stryCov_9fa48("72392"), false))) : stryMutAct_9fa48("72393") ? true : (stryCov_9fa48("72393"), false);
    return Object.freeze(stryMutAct_9fa48("72394") ? {} : (stryCov_9fa48("72394"), {
      publicationEpoch: context.publicationEpoch,
      publicationStatus: context.publicationStatus,
      publicationStatusNormalized: context.publicationStatusNormalized,
      sourceTopologyEpoch: context.sourceTopologyEpoch,
      sourceSnapshotVersion: context.sourceSnapshotVersion,
      publishedActiveNodeIdsPresent: context.publishedActiveNodeIdsPresent,
      publishedActiveNodeIds: Object.freeze(stryMutAct_9fa48("72395") ? [] : (stryCov_9fa48("72395"), [...context.publishedActiveNodeIds])),
      requiredAckNodeIds: Object.freeze(stryMutAct_9fa48("72396") ? [] : (stryCov_9fa48("72396"), [...context.requiredAckNodeIds])),
      acknowledgedNodeIds: Object.freeze(stryMutAct_9fa48("72397") ? [] : (stryCov_9fa48("72397"), [...context.acknowledgedNodeIds])),
      priorityPartitionSummary: freezeRecord(context.priorityPartitionSummary),
      membershipLifecycleSummary: freezeRecord(context.membershipLifecycleSummary),
      projectionDiagnostics: freezeRecord(context.projectionDiagnostics),
      projectedServingNodeIds: Object.freeze(stryMutAct_9fa48("72398") ? [] : (stryCov_9fa48("72398"), [...context.projectedServingNodeIds])),
      locallyEligibleNodeIds: Object.freeze(stryMutAct_9fa48("72399") ? [] : (stryCov_9fa48("72399"), [...context.locallyEligibleNodeIds])),
      recoveryEligibleIncludedNodeIds: Object.freeze(stryMutAct_9fa48("72400") ? [] : (stryCov_9fa48("72400"), [...context.recoveryEligibleIncludedNodeIds])),
      recoveryActiveNodeIds: Object.freeze(stryMutAct_9fa48("72401") ? [] : (stryCov_9fa48("72401"), [...context.recoveryActiveNodeIds])),
      recoveryActiveNodeSource: context.recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds: Object.freeze(stryMutAct_9fa48("72402") ? [] : (stryCov_9fa48("72402"), [...context.missingPublishedRecoveryActiveNodeIds])),
      participationByNodeId,
      participationStateCounts: buildParticipationStateCounts(participationByNodeId),
      recoveryProtocolState: resolveRecoveryProtocolState(context),
      targetNodeId: context.targetNodeId,
      targetParticipation: context.targetNodeId ? stryMutAct_9fa48("72405") ? participationByNodeId[context.targetNodeId] && null : stryMutAct_9fa48("72404") ? false : stryMutAct_9fa48("72403") ? true : (stryCov_9fa48("72403", "72404", "72405"), participationByNodeId[context.targetNodeId] || null) : null,
      publicationObservationState,
      publicationPending,
      publicationExcludesTargetNode,
      publishedMembershipIncludesTargetNode,
      publishedPlanningEpoch: (stryMutAct_9fa48("72408") ? context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED || Number.isInteger(context.publicationEpoch) : stryMutAct_9fa48("72407") ? false : stryMutAct_9fa48("72406") ? true : (stryCov_9fa48("72406", "72407", "72408"), (stryMutAct_9fa48("72410") ? context.publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("72409") ? true : (stryCov_9fa48("72409", "72410"), context.publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) && Number.isInteger(context.publicationEpoch))) ? context.publicationEpoch : null,
      priorityRecoveryReasonCodes: buildPriorityRecoveryReasonCodes(context)
    }));
  }
}
function buildPublicationRecoveryProtocolSnapshot(membershipPublication = null, options = {}) {
  if (stryMutAct_9fa48("72411")) {
    {}
  } else {
    stryCov_9fa48("72411");
    const publicationSnapshot = buildMembershipPublicationActiveSnapshot(membershipPublication);
    if (stryMutAct_9fa48("72414") ? false : stryMutAct_9fa48("72413") ? true : stryMutAct_9fa48("72412") ? publicationSnapshot : (stryCov_9fa48("72412", "72413", "72414"), !publicationSnapshot)) {
      if (stryMutAct_9fa48("72415")) {
        {}
      } else {
        stryCov_9fa48("72415");
        return null;
      }
    }
    return buildRecoveryProtocolSnapshot(stryMutAct_9fa48("72416") ? {} : (stryCov_9fa48("72416"), {
      ...publicationSnapshot,
      publicationStatus: publicationSnapshot.publicationStatus,
      targetNodeId: options.targetNodeId
    }));
  }
}
export { buildPublicationRecoveryProtocolSnapshot, buildRecoveryProtocolSnapshot, NODE_PARTICIPATION_STATE, RECOVERY_PROTOCOL_STATE };