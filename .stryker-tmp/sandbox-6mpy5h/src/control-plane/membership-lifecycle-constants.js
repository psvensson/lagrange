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
const MEMBERSHIP_LIFECYCLE_STATE = Object.freeze(stryMutAct_9fa48("66919") ? {} : (stryCov_9fa48("66919"), {
  ABSENT: stryMutAct_9fa48("66920") ? "" : (stryCov_9fa48("66920"), 'absent'),
  ADMITTED: stryMutAct_9fa48("66921") ? "" : (stryCov_9fa48("66921"), 'admitted'),
  PROVISIONING: stryMutAct_9fa48("66922") ? "" : (stryCov_9fa48("66922"), 'provisioning'),
  CAUGHT_UP: stryMutAct_9fa48("66923") ? "" : (stryCov_9fa48("66923"), 'caught_up'),
  PUBLISH_PENDING: stryMutAct_9fa48("66924") ? "" : (stryCov_9fa48("66924"), 'publish_pending'),
  PUBLISHED_ACTIVE: stryMutAct_9fa48("66925") ? "" : (stryCov_9fa48("66925"), 'published_active'),
  DRAINING: stryMutAct_9fa48("66926") ? "" : (stryCov_9fa48("66926"), 'draining'),
  REMOVED: stryMutAct_9fa48("66927") ? "" : (stryCov_9fa48("66927"), 'removed')
}));
const MEMBERSHIP_MEMBER_STATE = Object.freeze(stryMutAct_9fa48("66928") ? {} : (stryCov_9fa48("66928"), {
  JOINING: stryMutAct_9fa48("66929") ? "" : (stryCov_9fa48("66929"), 'joining'),
  CATCHING_UP: stryMutAct_9fa48("66930") ? "" : (stryCov_9fa48("66930"), 'catching_up'),
  SERVING: stryMutAct_9fa48("66931") ? "" : (stryCov_9fa48("66931"), 'serving'),
  DRAINING: stryMutAct_9fa48("66932") ? "" : (stryCov_9fa48("66932"), 'draining'),
  UNREACHABLE: stryMutAct_9fa48("66933") ? "" : (stryCov_9fa48("66933"), 'unreachable'),
  RETIRED: stryMutAct_9fa48("66934") ? "" : (stryCov_9fa48("66934"), 'retired')
}));
const NODE_PARTICIPATION_STATE = Object.freeze(stryMutAct_9fa48("66935") ? {} : (stryCov_9fa48("66935"), {
  INACTIVE: stryMutAct_9fa48("66936") ? "" : (stryCov_9fa48("66936"), 'inactive'),
  JOINING: stryMutAct_9fa48("66937") ? "" : (stryCov_9fa48("66937"), 'joining'),
  CATCHING_UP: stryMutAct_9fa48("66938") ? "" : (stryCov_9fa48("66938"), 'catching_up'),
  OBSERVED_PENDING_PUBLISH: stryMutAct_9fa48("66939") ? "" : (stryCov_9fa48("66939"), 'observed_pending_publish'),
  RECOVERY_PENDING_PUBLISH: stryMutAct_9fa48("66940") ? "" : (stryCov_9fa48("66940"), 'recovery_pending_publish'),
  PUBLISHED_ACTIVE: stryMutAct_9fa48("66941") ? "" : (stryCov_9fa48("66941"), 'published_active'),
  SUSPECTED: stryMutAct_9fa48("66942") ? "" : (stryCov_9fa48("66942"), 'suspected'),
  DRAINING: stryMutAct_9fa48("66943") ? "" : (stryCov_9fa48("66943"), 'draining'),
  RETIRED: stryMutAct_9fa48("66944") ? "" : (stryCov_9fa48("66944"), 'retired')
}));
const RECOVERY_PROTOCOL_STATE = Object.freeze(stryMutAct_9fa48("66945") ? {} : (stryCov_9fa48("66945"), {
  UNPUBLISHED_OBSERVATION: stryMutAct_9fa48("66946") ? "" : (stryCov_9fa48("66946"), 'unpublished_observation'),
  PUBLICATION_PENDING: stryMutAct_9fa48("66947") ? "" : (stryCov_9fa48("66947"), 'publication_pending'),
  PRIORITY_SPREAD_PENDING: stryMutAct_9fa48("66948") ? "" : (stryCov_9fa48("66948"), 'priority_spread_pending'),
  STEADY_PUBLISHED: stryMutAct_9fa48("66949") ? "" : (stryCov_9fa48("66949"), 'steady_published')
}));
const MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS = Object.freeze(stryMutAct_9fa48("66950") ? {} : (stryCov_9fa48("66950"), {
  [MEMBERSHIP_LIFECYCLE_STATE.ABSENT]: Object.freeze(stryMutAct_9fa48("66951") ? [] : (stryCov_9fa48("66951"), [MEMBERSHIP_LIFECYCLE_STATE.ADMITTED])),
  [MEMBERSHIP_LIFECYCLE_STATE.ADMITTED]: Object.freeze(stryMutAct_9fa48("66952") ? [] : (stryCov_9fa48("66952"), [MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING, MEMBERSHIP_LIFECYCLE_STATE.REMOVED])),
  [MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING]: Object.freeze(stryMutAct_9fa48("66953") ? [] : (stryCov_9fa48("66953"), [MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP, MEMBERSHIP_LIFECYCLE_STATE.REMOVED])),
  [MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP]: Object.freeze(stryMutAct_9fa48("66954") ? [] : (stryCov_9fa48("66954"), [MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING, MEMBERSHIP_LIFECYCLE_STATE.REMOVED])),
  [MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING]: Object.freeze(stryMutAct_9fa48("66955") ? [] : (stryCov_9fa48("66955"), [MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE, MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING, MEMBERSHIP_LIFECYCLE_STATE.REMOVED])),
  [MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE]: Object.freeze(stryMutAct_9fa48("66956") ? [] : (stryCov_9fa48("66956"), [MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING, MEMBERSHIP_LIFECYCLE_STATE.DRAINING])),
  [MEMBERSHIP_LIFECYCLE_STATE.DRAINING]: Object.freeze(stryMutAct_9fa48("66957") ? [] : (stryCov_9fa48("66957"), [MEMBERSHIP_LIFECYCLE_STATE.REMOVED, MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING])),
  [MEMBERSHIP_LIFECYCLE_STATE.REMOVED]: Object.freeze(stryMutAct_9fa48("66958") ? ["Stryker was here"] : (stryCov_9fa48("66958"), []))
}));
const MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY = Object.freeze(stryMutAct_9fa48("66959") ? {} : (stryCov_9fa48("66959"), {
  NONE: stryMutAct_9fa48("66960") ? "" : (stryCov_9fa48("66960"), 'none'),
  PUBLICATION_PENDING: stryMutAct_9fa48("66961") ? "" : (stryCov_9fa48("66961"), 'publication_pending'),
  PUBLISHED_MEMBERSHIP: stryMutAct_9fa48("66962") ? "" : (stryCov_9fa48("66962"), 'published_membership')
}));
function normalizeMembershipLifecycleState(value) {
  if (stryMutAct_9fa48("66963")) {
    {}
  } else {
    stryCov_9fa48("66963");
    const normalized = stryMutAct_9fa48("66965") ? String(value || '').toLowerCase() : stryMutAct_9fa48("66964") ? String(value || '').trim().toUpperCase() : (stryCov_9fa48("66964", "66965"), String(stryMutAct_9fa48("66968") ? value && '' : stryMutAct_9fa48("66967") ? false : stryMutAct_9fa48("66966") ? true : (stryCov_9fa48("66966", "66967", "66968"), value || (stryMutAct_9fa48("66969") ? "Stryker was here!" : (stryCov_9fa48("66969"), '')))).trim().toLowerCase());
    return Object.values(MEMBERSHIP_LIFECYCLE_STATE).includes(normalized) ? normalized : null;
  }
}
function normalizeMembershipLifecycleEpochBoundary(value) {
  if (stryMutAct_9fa48("66970")) {
    {}
  } else {
    stryCov_9fa48("66970");
    const normalized = stryMutAct_9fa48("66972") ? String(value || '').toLowerCase() : stryMutAct_9fa48("66971") ? String(value || '').trim().toUpperCase() : (stryCov_9fa48("66971", "66972"), String(stryMutAct_9fa48("66975") ? value && '' : stryMutAct_9fa48("66974") ? false : stryMutAct_9fa48("66973") ? true : (stryCov_9fa48("66973", "66974", "66975"), value || (stryMutAct_9fa48("66976") ? "Stryker was here!" : (stryCov_9fa48("66976"), '')))).trim().toLowerCase());
    return Object.values(MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY).includes(normalized) ? normalized : null;
  }
}
function normalizeMembershipMemberState(value) {
  if (stryMutAct_9fa48("66977")) {
    {}
  } else {
    stryCov_9fa48("66977");
    const normalized = stryMutAct_9fa48("66979") ? String(value || '').toLowerCase() : stryMutAct_9fa48("66978") ? String(value || '').trim().toUpperCase() : (stryCov_9fa48("66978", "66979"), String(stryMutAct_9fa48("66982") ? value && '' : stryMutAct_9fa48("66981") ? false : stryMutAct_9fa48("66980") ? true : (stryCov_9fa48("66980", "66981", "66982"), value || (stryMutAct_9fa48("66983") ? "Stryker was here!" : (stryCov_9fa48("66983"), '')))).trim().toLowerCase());
    return Object.values(MEMBERSHIP_MEMBER_STATE).includes(normalized) ? normalized : null;
  }
}
function normalizeNodeParticipationState(value) {
  if (stryMutAct_9fa48("66984")) {
    {}
  } else {
    stryCov_9fa48("66984");
    const normalized = stryMutAct_9fa48("66986") ? String(value || '').toLowerCase() : stryMutAct_9fa48("66985") ? String(value || '').trim().toUpperCase() : (stryCov_9fa48("66985", "66986"), String(stryMutAct_9fa48("66989") ? value && '' : stryMutAct_9fa48("66988") ? false : stryMutAct_9fa48("66987") ? true : (stryCov_9fa48("66987", "66988", "66989"), value || (stryMutAct_9fa48("66990") ? "Stryker was here!" : (stryCov_9fa48("66990"), '')))).trim().toLowerCase());
    return Object.values(NODE_PARTICIPATION_STATE).includes(normalized) ? normalized : null;
  }
}
function normalizeRecoveryProtocolState(value) {
  if (stryMutAct_9fa48("66991")) {
    {}
  } else {
    stryCov_9fa48("66991");
    const normalized = stryMutAct_9fa48("66993") ? String(value || '').toLowerCase() : stryMutAct_9fa48("66992") ? String(value || '').trim().toUpperCase() : (stryCov_9fa48("66992", "66993"), String(stryMutAct_9fa48("66996") ? value && '' : stryMutAct_9fa48("66995") ? false : stryMutAct_9fa48("66994") ? true : (stryCov_9fa48("66994", "66995", "66996"), value || (stryMutAct_9fa48("66997") ? "Stryker was here!" : (stryCov_9fa48("66997"), '')))).trim().toLowerCase());
    return Object.values(RECOVERY_PROTOCOL_STATE).includes(normalized) ? normalized : null;
  }
}
function normalizeNodeIdList(values = stryMutAct_9fa48("66998") ? ["Stryker was here"] : (stryCov_9fa48("66998"), [])) {
  if (stryMutAct_9fa48("66999")) {
    {}
  } else {
    stryCov_9fa48("66999");
    return normalizeStringList(values);
  }
}
function normalizeStringList(values = stryMutAct_9fa48("67000") ? ["Stryker was here"] : (stryCov_9fa48("67000"), [])) {
  if (stryMutAct_9fa48("67001")) {
    {}
  } else {
    stryCov_9fa48("67001");
    return stryMutAct_9fa48("67002") ? [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))] : (stryCov_9fa48("67002"), (stryMutAct_9fa48("67003") ? [] : (stryCov_9fa48("67003"), [...new Set(stryMutAct_9fa48("67004") ? (Array.isArray(values) ? values : []).map(value => String(value || '').trim()) : (stryCov_9fa48("67004"), (Array.isArray(values) ? values : stryMutAct_9fa48("67005") ? ["Stryker was here"] : (stryCov_9fa48("67005"), [])).map(stryMutAct_9fa48("67006") ? () => undefined : (stryCov_9fa48("67006"), value => stryMutAct_9fa48("67007") ? String(value || '') : (stryCov_9fa48("67007"), String(stryMutAct_9fa48("67010") ? value && '' : stryMutAct_9fa48("67009") ? false : stryMutAct_9fa48("67008") ? true : (stryCov_9fa48("67008", "67009", "67010"), value || (stryMutAct_9fa48("67011") ? "Stryker was here!" : (stryCov_9fa48("67011"), '')))).trim()))).filter(Boolean)))])).sort());
  }
}
function normalizeStringMap(values = {}) {
  if (stryMutAct_9fa48("67012")) {
    {}
  } else {
    stryCov_9fa48("67012");
    if (stryMutAct_9fa48("67015") ? !values && typeof values !== 'object' : stryMutAct_9fa48("67014") ? false : stryMutAct_9fa48("67013") ? true : (stryCov_9fa48("67013", "67014", "67015"), (stryMutAct_9fa48("67016") ? values : (stryCov_9fa48("67016"), !values)) || (stryMutAct_9fa48("67018") ? typeof values === 'object' : stryMutAct_9fa48("67017") ? false : (stryCov_9fa48("67017", "67018"), typeof values !== (stryMutAct_9fa48("67019") ? "" : (stryCov_9fa48("67019"), 'object')))))) {
      if (stryMutAct_9fa48("67020")) {
        {}
      } else {
        stryCov_9fa48("67020");
        return {};
      }
    }
    return stryMutAct_9fa48("67021") ? Object.keys(values).reduce((accumulator, key) => {
      const normalizedValue = String(values[key] || '').trim();
      if (normalizedValue) {
        accumulator[key] = normalizedValue;
      }
      return accumulator;
    }, {}) : (stryCov_9fa48("67021"), Object.keys(values).sort().reduce((accumulator, key) => {
      if (stryMutAct_9fa48("67022")) {
        {}
      } else {
        stryCov_9fa48("67022");
        const normalizedValue = stryMutAct_9fa48("67023") ? String(values[key] || '') : (stryCov_9fa48("67023"), String(stryMutAct_9fa48("67026") ? values[key] && '' : stryMutAct_9fa48("67025") ? false : stryMutAct_9fa48("67024") ? true : (stryCov_9fa48("67024", "67025", "67026"), values[key] || (stryMutAct_9fa48("67027") ? "Stryker was here!" : (stryCov_9fa48("67027"), '')))).trim());
        if (stryMutAct_9fa48("67029") ? false : stryMutAct_9fa48("67028") ? true : (stryCov_9fa48("67028", "67029"), normalizedValue)) {
          if (stryMutAct_9fa48("67030")) {
            {}
          } else {
            stryCov_9fa48("67030");
            accumulator[key] = normalizedValue;
          }
        }
        return accumulator;
      }
    }, {}));
  }
}
function normalizeParticipationByNodeId(values = {}) {
  if (stryMutAct_9fa48("67031")) {
    {}
  } else {
    stryCov_9fa48("67031");
    if (stryMutAct_9fa48("67034") ? !values && typeof values !== 'object' : stryMutAct_9fa48("67033") ? false : stryMutAct_9fa48("67032") ? true : (stryCov_9fa48("67032", "67033", "67034"), (stryMutAct_9fa48("67035") ? values : (stryCov_9fa48("67035"), !values)) || (stryMutAct_9fa48("67037") ? typeof values === 'object' : stryMutAct_9fa48("67036") ? false : (stryCov_9fa48("67036", "67037"), typeof values !== (stryMutAct_9fa48("67038") ? "" : (stryCov_9fa48("67038"), 'object')))))) {
      if (stryMutAct_9fa48("67039")) {
        {}
      } else {
        stryCov_9fa48("67039");
        return {};
      }
    }
    return stryMutAct_9fa48("67040") ? Object.keys(values).reduce((accumulator, nodeId) => {
      const participation = values[nodeId];
      const state = normalizeNodeParticipationState(participation?.state || participation);
      if (!state) {
        return accumulator;
      }
      const memberState = normalizeMembershipMemberState(participation?.memberState);
      const reasons = normalizeStringList(participation?.reasons);
      accumulator[nodeId] = Object.freeze({
        nodeId,
        state,
        memberState,
        durable: participation?.durable === true,
        publishedActive: participation?.publishedActive === true,
        recoveryActive: participation?.recoveryActive === true,
        projectedServing: participation?.projectedServing === true,
        locallyEligible: participation?.locallyEligible === true,
        suspectedOrTransitioning: participation?.suspectedOrTransitioning === true,
        recoverySource: typeof participation?.recoverySource === 'string' && participation.recoverySource.trim().length > 0 ? participation.recoverySource.trim() : null,
        recoveryEpoch: typeof participation?.recoveryEpoch === 'string' && participation.recoveryEpoch.trim().length > 0 ? participation.recoveryEpoch.trim() : null,
        reasons: Object.freeze(reasons)
      });
      return accumulator;
    }, {}) : (stryCov_9fa48("67040"), Object.keys(values).sort().reduce((accumulator, nodeId) => {
      if (stryMutAct_9fa48("67041")) {
        {}
      } else {
        stryCov_9fa48("67041");
        const participation = values[nodeId];
        const state = normalizeNodeParticipationState(stryMutAct_9fa48("67044") ? participation?.state && participation : stryMutAct_9fa48("67043") ? false : stryMutAct_9fa48("67042") ? true : (stryCov_9fa48("67042", "67043", "67044"), (stryMutAct_9fa48("67045") ? participation.state : (stryCov_9fa48("67045"), participation?.state)) || participation));
        if (stryMutAct_9fa48("67048") ? false : stryMutAct_9fa48("67047") ? true : stryMutAct_9fa48("67046") ? state : (stryCov_9fa48("67046", "67047", "67048"), !state)) {
          if (stryMutAct_9fa48("67049")) {
            {}
          } else {
            stryCov_9fa48("67049");
            return accumulator;
          }
        }
        const memberState = normalizeMembershipMemberState(stryMutAct_9fa48("67050") ? participation.memberState : (stryCov_9fa48("67050"), participation?.memberState));
        const reasons = normalizeStringList(stryMutAct_9fa48("67051") ? participation.reasons : (stryCov_9fa48("67051"), participation?.reasons));
        accumulator[nodeId] = Object.freeze(stryMutAct_9fa48("67052") ? {} : (stryCov_9fa48("67052"), {
          nodeId,
          state,
          memberState,
          durable: stryMutAct_9fa48("67055") ? participation?.durable !== true : stryMutAct_9fa48("67054") ? false : stryMutAct_9fa48("67053") ? true : (stryCov_9fa48("67053", "67054", "67055"), (stryMutAct_9fa48("67056") ? participation.durable : (stryCov_9fa48("67056"), participation?.durable)) === (stryMutAct_9fa48("67057") ? false : (stryCov_9fa48("67057"), true))),
          publishedActive: stryMutAct_9fa48("67060") ? participation?.publishedActive !== true : stryMutAct_9fa48("67059") ? false : stryMutAct_9fa48("67058") ? true : (stryCov_9fa48("67058", "67059", "67060"), (stryMutAct_9fa48("67061") ? participation.publishedActive : (stryCov_9fa48("67061"), participation?.publishedActive)) === (stryMutAct_9fa48("67062") ? false : (stryCov_9fa48("67062"), true))),
          recoveryActive: stryMutAct_9fa48("67065") ? participation?.recoveryActive !== true : stryMutAct_9fa48("67064") ? false : stryMutAct_9fa48("67063") ? true : (stryCov_9fa48("67063", "67064", "67065"), (stryMutAct_9fa48("67066") ? participation.recoveryActive : (stryCov_9fa48("67066"), participation?.recoveryActive)) === (stryMutAct_9fa48("67067") ? false : (stryCov_9fa48("67067"), true))),
          projectedServing: stryMutAct_9fa48("67070") ? participation?.projectedServing !== true : stryMutAct_9fa48("67069") ? false : stryMutAct_9fa48("67068") ? true : (stryCov_9fa48("67068", "67069", "67070"), (stryMutAct_9fa48("67071") ? participation.projectedServing : (stryCov_9fa48("67071"), participation?.projectedServing)) === (stryMutAct_9fa48("67072") ? false : (stryCov_9fa48("67072"), true))),
          locallyEligible: stryMutAct_9fa48("67075") ? participation?.locallyEligible !== true : stryMutAct_9fa48("67074") ? false : stryMutAct_9fa48("67073") ? true : (stryCov_9fa48("67073", "67074", "67075"), (stryMutAct_9fa48("67076") ? participation.locallyEligible : (stryCov_9fa48("67076"), participation?.locallyEligible)) === (stryMutAct_9fa48("67077") ? false : (stryCov_9fa48("67077"), true))),
          suspectedOrTransitioning: stryMutAct_9fa48("67080") ? participation?.suspectedOrTransitioning !== true : stryMutAct_9fa48("67079") ? false : stryMutAct_9fa48("67078") ? true : (stryCov_9fa48("67078", "67079", "67080"), (stryMutAct_9fa48("67081") ? participation.suspectedOrTransitioning : (stryCov_9fa48("67081"), participation?.suspectedOrTransitioning)) === (stryMutAct_9fa48("67082") ? false : (stryCov_9fa48("67082"), true))),
          recoverySource: (stryMutAct_9fa48("67085") ? typeof participation?.recoverySource === 'string' || participation.recoverySource.trim().length > 0 : stryMutAct_9fa48("67084") ? false : stryMutAct_9fa48("67083") ? true : (stryCov_9fa48("67083", "67084", "67085"), (stryMutAct_9fa48("67087") ? typeof participation?.recoverySource !== 'string' : stryMutAct_9fa48("67086") ? true : (stryCov_9fa48("67086", "67087"), typeof (stryMutAct_9fa48("67088") ? participation.recoverySource : (stryCov_9fa48("67088"), participation?.recoverySource)) === (stryMutAct_9fa48("67089") ? "" : (stryCov_9fa48("67089"), 'string')))) && (stryMutAct_9fa48("67092") ? participation.recoverySource.trim().length <= 0 : stryMutAct_9fa48("67091") ? participation.recoverySource.trim().length >= 0 : stryMutAct_9fa48("67090") ? true : (stryCov_9fa48("67090", "67091", "67092"), (stryMutAct_9fa48("67093") ? participation.recoverySource.length : (stryCov_9fa48("67093"), participation.recoverySource.trim().length)) > 0)))) ? stryMutAct_9fa48("67094") ? participation.recoverySource : (stryCov_9fa48("67094"), participation.recoverySource.trim()) : null,
          recoveryEpoch: (stryMutAct_9fa48("67097") ? typeof participation?.recoveryEpoch === 'string' || participation.recoveryEpoch.trim().length > 0 : stryMutAct_9fa48("67096") ? false : stryMutAct_9fa48("67095") ? true : (stryCov_9fa48("67095", "67096", "67097"), (stryMutAct_9fa48("67099") ? typeof participation?.recoveryEpoch !== 'string' : stryMutAct_9fa48("67098") ? true : (stryCov_9fa48("67098", "67099"), typeof (stryMutAct_9fa48("67100") ? participation.recoveryEpoch : (stryCov_9fa48("67100"), participation?.recoveryEpoch)) === (stryMutAct_9fa48("67101") ? "" : (stryCov_9fa48("67101"), 'string')))) && (stryMutAct_9fa48("67104") ? participation.recoveryEpoch.trim().length <= 0 : stryMutAct_9fa48("67103") ? participation.recoveryEpoch.trim().length >= 0 : stryMutAct_9fa48("67102") ? true : (stryCov_9fa48("67102", "67103", "67104"), (stryMutAct_9fa48("67105") ? participation.recoveryEpoch.length : (stryCov_9fa48("67105"), participation.recoveryEpoch.trim().length)) > 0)))) ? stryMutAct_9fa48("67106") ? participation.recoveryEpoch : (stryCov_9fa48("67106"), participation.recoveryEpoch.trim()) : null,
          reasons: Object.freeze(reasons)
        }));
        return accumulator;
      }
    }, {}));
  }
}
function normalizeParticipationStateCounts(values = {}) {
  if (stryMutAct_9fa48("67107")) {
    {}
  } else {
    stryCov_9fa48("67107");
    if (stryMutAct_9fa48("67110") ? !values && typeof values !== 'object' : stryMutAct_9fa48("67109") ? false : stryMutAct_9fa48("67108") ? true : (stryCov_9fa48("67108", "67109", "67110"), (stryMutAct_9fa48("67111") ? values : (stryCov_9fa48("67111"), !values)) || (stryMutAct_9fa48("67113") ? typeof values === 'object' : stryMutAct_9fa48("67112") ? false : (stryCov_9fa48("67112", "67113"), typeof values !== (stryMutAct_9fa48("67114") ? "" : (stryCov_9fa48("67114"), 'object')))))) {
      if (stryMutAct_9fa48("67115")) {
        {}
      } else {
        stryCov_9fa48("67115");
        return {};
      }
    }
    return Object.keys(values).reduce((accumulator, state) => {
      if (stryMutAct_9fa48("67116")) {
        {}
      } else {
        stryCov_9fa48("67116");
        const normalizedState = normalizeNodeParticipationState(state);
        const count = Number(values[state]);
        if (stryMutAct_9fa48("67119") ? (!normalizedState || !Number.isFinite(count)) && count <= 0 : stryMutAct_9fa48("67118") ? false : stryMutAct_9fa48("67117") ? true : (stryCov_9fa48("67117", "67118", "67119"), (stryMutAct_9fa48("67121") ? !normalizedState && !Number.isFinite(count) : stryMutAct_9fa48("67120") ? false : (stryCov_9fa48("67120", "67121"), (stryMutAct_9fa48("67122") ? normalizedState : (stryCov_9fa48("67122"), !normalizedState)) || (stryMutAct_9fa48("67123") ? Number.isFinite(count) : (stryCov_9fa48("67123"), !Number.isFinite(count))))) || (stryMutAct_9fa48("67126") ? count > 0 : stryMutAct_9fa48("67125") ? count < 0 : stryMutAct_9fa48("67124") ? false : (stryCov_9fa48("67124", "67125", "67126"), count <= 0)))) {
          if (stryMutAct_9fa48("67127")) {
            {}
          } else {
            stryCov_9fa48("67127");
            return accumulator;
          }
        }
        accumulator[normalizedState] = Math.trunc(count);
        return accumulator;
      }
    }, {});
  }
}
function resolveDefaultMemberState(lifecycleState) {
  if (stryMutAct_9fa48("67128")) {
    {}
  } else {
    stryCov_9fa48("67128");
    switch (lifecycleState) {
      case MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE:
        if (stryMutAct_9fa48("67129")) {} else {
          stryCov_9fa48("67129");
          return MEMBERSHIP_MEMBER_STATE.SERVING;
        }
      case MEMBERSHIP_LIFECYCLE_STATE.DRAINING:
        if (stryMutAct_9fa48("67130")) {} else {
          stryCov_9fa48("67130");
          return MEMBERSHIP_MEMBER_STATE.DRAINING;
        }
      case MEMBERSHIP_LIFECYCLE_STATE.REMOVED:
        if (stryMutAct_9fa48("67131")) {} else {
          stryCov_9fa48("67131");
          return MEMBERSHIP_MEMBER_STATE.RETIRED;
        }
      case MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP:
        if (stryMutAct_9fa48("67132")) {} else {
          stryCov_9fa48("67132");
          return MEMBERSHIP_MEMBER_STATE.CATCHING_UP;
        }
      case MEMBERSHIP_LIFECYCLE_STATE.ADMITTED:
      case MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING:
      case MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING:
      default:
        if (stryMutAct_9fa48("67133")) {} else {
          stryCov_9fa48("67133");
          return MEMBERSHIP_MEMBER_STATE.JOINING;
        }
    }
  }
}
function isValidMembershipLifecycleTransition(fromState, toState) {
  if (stryMutAct_9fa48("67134")) {
    {}
  } else {
    stryCov_9fa48("67134");
    const normalizedFromState = normalizeMembershipLifecycleState(fromState);
    const normalizedToState = normalizeMembershipLifecycleState(toState);
    if (stryMutAct_9fa48("67137") ? !normalizedFromState && !normalizedToState : stryMutAct_9fa48("67136") ? false : stryMutAct_9fa48("67135") ? true : (stryCov_9fa48("67135", "67136", "67137"), (stryMutAct_9fa48("67138") ? normalizedFromState : (stryCov_9fa48("67138"), !normalizedFromState)) || (stryMutAct_9fa48("67139") ? normalizedToState : (stryCov_9fa48("67139"), !normalizedToState)))) {
      if (stryMutAct_9fa48("67140")) {
        {}
      } else {
        stryCov_9fa48("67140");
        return stryMutAct_9fa48("67141") ? true : (stryCov_9fa48("67141"), false);
      }
    }
    const validTransitions = stryMutAct_9fa48("67144") ? MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS[normalizedFromState] && [] : stryMutAct_9fa48("67143") ? false : stryMutAct_9fa48("67142") ? true : (stryCov_9fa48("67142", "67143", "67144"), MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS[normalizedFromState] || (stryMutAct_9fa48("67145") ? ["Stryker was here"] : (stryCov_9fa48("67145"), [])));
    return validTransitions.includes(normalizedToState);
  }
}
function buildMembershipLifecycleSummary(options = {}) {
  if (stryMutAct_9fa48("67146")) {
    {}
  } else {
    stryCov_9fa48("67146");
    const lifecycleState = stryMutAct_9fa48("67149") ? normalizeMembershipLifecycleState(options.lifecycleState) && MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING : stryMutAct_9fa48("67148") ? false : stryMutAct_9fa48("67147") ? true : (stryCov_9fa48("67147", "67148", "67149"), normalizeMembershipLifecycleState(options.lifecycleState) || MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING);
    const publishedActiveNodeIds = normalizeNodeIdList(options.publishedActiveNodeIds);
    const projectedServingNodeIds = normalizeNodeIdList(options.projectedServingNodeIds);
    const locallyEligibleNodeIds = normalizeNodeIdList((stryMutAct_9fa48("67150") ? options.locallyEligibleNodeIds.length : (stryCov_9fa48("67150"), options.locallyEligibleNodeIds?.length)) ? options.locallyEligibleNodeIds : projectedServingNodeIds);
    const recoveryActiveNodeIds = normalizeNodeIdList((stryMutAct_9fa48("67151") ? options.recoveryActiveNodeIds.length : (stryCov_9fa48("67151"), options.recoveryActiveNodeIds?.length)) ? options.recoveryActiveNodeIds : (stryMutAct_9fa48("67155") ? locallyEligibleNodeIds.length <= 0 : stryMutAct_9fa48("67154") ? locallyEligibleNodeIds.length >= 0 : stryMutAct_9fa48("67153") ? false : stryMutAct_9fa48("67152") ? true : (stryCov_9fa48("67152", "67153", "67154", "67155"), locallyEligibleNodeIds.length > 0)) ? locallyEligibleNodeIds : projectedServingNodeIds);
    const recoveryActiveNodeSource = (stryMutAct_9fa48("67158") ? typeof options.recoveryActiveNodeSource === 'string' || options.recoveryActiveNodeSource.trim().length > 0 : stryMutAct_9fa48("67157") ? false : stryMutAct_9fa48("67156") ? true : (stryCov_9fa48("67156", "67157", "67158"), (stryMutAct_9fa48("67160") ? typeof options.recoveryActiveNodeSource !== 'string' : stryMutAct_9fa48("67159") ? true : (stryCov_9fa48("67159", "67160"), typeof options.recoveryActiveNodeSource === (stryMutAct_9fa48("67161") ? "" : (stryCov_9fa48("67161"), 'string')))) && (stryMutAct_9fa48("67164") ? options.recoveryActiveNodeSource.trim().length <= 0 : stryMutAct_9fa48("67163") ? options.recoveryActiveNodeSource.trim().length >= 0 : stryMutAct_9fa48("67162") ? true : (stryCov_9fa48("67162", "67163", "67164"), (stryMutAct_9fa48("67165") ? options.recoveryActiveNodeSource.length : (stryCov_9fa48("67165"), options.recoveryActiveNodeSource.trim().length)) > 0)))) ? stryMutAct_9fa48("67166") ? options.recoveryActiveNodeSource : (stryCov_9fa48("67166"), options.recoveryActiveNodeSource.trim()) : null;
    const missingPublishedRecoveryActiveNodeIds = normalizeNodeIdList((stryMutAct_9fa48("67167") ? options.missingPublishedRecoveryActiveNodeIds.length : (stryCov_9fa48("67167"), options.missingPublishedRecoveryActiveNodeIds?.length)) ? options.missingPublishedRecoveryActiveNodeIds : stryMutAct_9fa48("67168") ? recoveryActiveNodeIds : (stryCov_9fa48("67168"), recoveryActiveNodeIds.filter(stryMutAct_9fa48("67169") ? () => undefined : (stryCov_9fa48("67169"), nodeId => stryMutAct_9fa48("67170") ? publishedActiveNodeIds.includes(nodeId) : (stryCov_9fa48("67170"), !publishedActiveNodeIds.includes(nodeId))))));
    const suspectedOrTransitioningNodeIds = normalizeNodeIdList(options.suspectedOrTransitioningNodeIds);
    const recoveryEpochByNodeId = normalizeStringMap(options.recoveryEpochByNodeId);
    const defaultMemberState = resolveDefaultMemberState(lifecycleState);
    const memberStatesByNodeId = (stryMutAct_9fa48("67173") ? options.memberStatesByNodeId || typeof options.memberStatesByNodeId === 'object' : stryMutAct_9fa48("67172") ? false : stryMutAct_9fa48("67171") ? true : (stryCov_9fa48("67171", "67172", "67173"), options.memberStatesByNodeId && (stryMutAct_9fa48("67175") ? typeof options.memberStatesByNodeId !== 'object' : stryMutAct_9fa48("67174") ? true : (stryCov_9fa48("67174", "67175"), typeof options.memberStatesByNodeId === (stryMutAct_9fa48("67176") ? "" : (stryCov_9fa48("67176"), 'object')))))) ? stryMutAct_9fa48("67177") ? Object.keys(options.memberStatesByNodeId).reduce((accumulator, nodeId) => {
      const normalizedState = normalizeMembershipMemberState(options.memberStatesByNodeId[nodeId]);
      if (normalizedState) {
        accumulator[nodeId] = normalizedState;
      }
      return accumulator;
    }, {}) : (stryCov_9fa48("67177"), Object.keys(options.memberStatesByNodeId).sort().reduce((accumulator, nodeId) => {
      if (stryMutAct_9fa48("67178")) {
        {}
      } else {
        stryCov_9fa48("67178");
        const normalizedState = normalizeMembershipMemberState(options.memberStatesByNodeId[nodeId]);
        if (stryMutAct_9fa48("67180") ? false : stryMutAct_9fa48("67179") ? true : (stryCov_9fa48("67179", "67180"), normalizedState)) {
          if (stryMutAct_9fa48("67181")) {
            {}
          } else {
            stryCov_9fa48("67181");
            accumulator[nodeId] = normalizedState;
          }
        }
        return accumulator;
      }
    }, {})) : normalizeNodeIdList(stryMutAct_9fa48("67182") ? [] : (stryCov_9fa48("67182"), [...publishedActiveNodeIds, ...projectedServingNodeIds, ...suspectedOrTransitioningNodeIds])).reduce((accumulator, nodeId) => {
      if (stryMutAct_9fa48("67183")) {
        {}
      } else {
        stryCov_9fa48("67183");
        accumulator[nodeId] = defaultMemberState;
        return accumulator;
      }
    }, {});
    const epochBoundary = stryMutAct_9fa48("67186") ? normalizeMembershipLifecycleEpochBoundary(options.epochBoundary) && (lifecycleState === MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE ? MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY.PUBLISHED_MEMBERSHIP : MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY.PUBLICATION_PENDING) : stryMutAct_9fa48("67185") ? false : stryMutAct_9fa48("67184") ? true : (stryCov_9fa48("67184", "67185", "67186"), normalizeMembershipLifecycleEpochBoundary(options.epochBoundary) || ((stryMutAct_9fa48("67189") ? lifecycleState !== MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE : stryMutAct_9fa48("67188") ? false : stryMutAct_9fa48("67187") ? true : (stryCov_9fa48("67187", "67188", "67189"), lifecycleState === MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE)) ? MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY.PUBLISHED_MEMBERSHIP : MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY.PUBLICATION_PENDING));
    const membershipFreeze = (stryMutAct_9fa48("67192") ? options.membershipFreeze || typeof options.membershipFreeze === 'object' : stryMutAct_9fa48("67191") ? false : stryMutAct_9fa48("67190") ? true : (stryCov_9fa48("67190", "67191", "67192"), options.membershipFreeze && (stryMutAct_9fa48("67194") ? typeof options.membershipFreeze !== 'object' : stryMutAct_9fa48("67193") ? true : (stryCov_9fa48("67193", "67194"), typeof options.membershipFreeze === (stryMutAct_9fa48("67195") ? "" : (stryCov_9fa48("67195"), 'object')))))) ? Object.freeze(stryMutAct_9fa48("67196") ? {} : (stryCov_9fa48("67196"), {
      active: stryMutAct_9fa48("67199") ? options.membershipFreeze.active !== true : stryMutAct_9fa48("67198") ? false : stryMutAct_9fa48("67197") ? true : (stryCov_9fa48("67197", "67198", "67199"), options.membershipFreeze.active === (stryMutAct_9fa48("67200") ? false : (stryCov_9fa48("67200"), true))),
      reasonCode: stryMutAct_9fa48("67203") ? String(options.membershipFreeze.reasonCode || '') && null : stryMutAct_9fa48("67202") ? false : stryMutAct_9fa48("67201") ? true : (stryCov_9fa48("67201", "67202", "67203"), String(stryMutAct_9fa48("67206") ? options.membershipFreeze.reasonCode && '' : stryMutAct_9fa48("67205") ? false : stryMutAct_9fa48("67204") ? true : (stryCov_9fa48("67204", "67205", "67206"), options.membershipFreeze.reasonCode || (stryMutAct_9fa48("67207") ? "Stryker was here!" : (stryCov_9fa48("67207"), '')))) || null),
      retainedPublishedNodeIds: Object.freeze(normalizeNodeIdList(options.membershipFreeze.retainedPublishedNodeIds)),
      missingProjectedNodeIds: Object.freeze(normalizeNodeIdList(options.membershipFreeze.missingProjectedNodeIds)),
      unconfirmedProjectedNodeIds: Object.freeze(normalizeNodeIdList(options.membershipFreeze.unconfirmedProjectedNodeIds))
    })) : Object.freeze(stryMutAct_9fa48("67208") ? {} : (stryCov_9fa48("67208"), {
      active: stryMutAct_9fa48("67209") ? true : (stryCov_9fa48("67209"), false),
      reasonCode: null,
      retainedPublishedNodeIds: Object.freeze(stryMutAct_9fa48("67210") ? [] : (stryCov_9fa48("67210"), [...publishedActiveNodeIds])),
      missingProjectedNodeIds: Object.freeze(stryMutAct_9fa48("67211") ? ["Stryker was here"] : (stryCov_9fa48("67211"), [])),
      unconfirmedProjectedNodeIds: Object.freeze(stryMutAct_9fa48("67212") ? ["Stryker was here"] : (stryCov_9fa48("67212"), []))
    }));
    const projectionDiagnostics = (stryMutAct_9fa48("67215") ? options.projectionDiagnostics || typeof options.projectionDiagnostics === 'object' : stryMutAct_9fa48("67214") ? false : stryMutAct_9fa48("67213") ? true : (stryCov_9fa48("67213", "67214", "67215"), options.projectionDiagnostics && (stryMutAct_9fa48("67217") ? typeof options.projectionDiagnostics !== 'object' : stryMutAct_9fa48("67216") ? true : (stryCov_9fa48("67216", "67217"), typeof options.projectionDiagnostics === (stryMutAct_9fa48("67218") ? "" : (stryCov_9fa48("67218"), 'object')))))) ? Object.freeze(stryMutAct_9fa48("67219") ? {} : (stryCov_9fa48("67219"), {
      readinessDecisionMode: stryMutAct_9fa48("67222") ? String(options.projectionDiagnostics.readinessDecisionMode || '').trim() && null : stryMutAct_9fa48("67221") ? false : stryMutAct_9fa48("67220") ? true : (stryCov_9fa48("67220", "67221", "67222"), (stryMutAct_9fa48("67223") ? String(options.projectionDiagnostics.readinessDecisionMode || '') : (stryCov_9fa48("67223"), String(stryMutAct_9fa48("67226") ? options.projectionDiagnostics.readinessDecisionMode && '' : stryMutAct_9fa48("67225") ? false : stryMutAct_9fa48("67224") ? true : (stryCov_9fa48("67224", "67225", "67226"), options.projectionDiagnostics.readinessDecisionMode || (stryMutAct_9fa48("67227") ? "Stryker was here!" : (stryCov_9fa48("67227"), '')))).trim())) || null),
      readinessDecisionDimensions: Object.freeze(normalizeStringList(options.projectionDiagnostics.readinessDecisionDimensions)),
      recoveryEligibleProjectionEnabled: stryMutAct_9fa48("67230") ? options.projectionDiagnostics.recoveryEligibleProjectionEnabled !== true : stryMutAct_9fa48("67229") ? false : stryMutAct_9fa48("67228") ? true : (stryCov_9fa48("67228", "67229", "67230"), options.projectionDiagnostics.recoveryEligibleProjectionEnabled === (stryMutAct_9fa48("67231") ? false : (stryCov_9fa48("67231"), true))),
      recoveryEligibleIncludedNodeIds: Object.freeze(normalizeNodeIdList(options.projectionDiagnostics.recoveryEligibleIncludedNodeIds)),
      livenessFallbackIncludedNodeIds: Object.freeze(normalizeNodeIdList(options.projectionDiagnostics.livenessFallbackIncludedNodeIds)),
      readinessExcludedNodeIds: Object.freeze(normalizeNodeIdList(options.projectionDiagnostics.readinessExcludedNodeIds)),
      clusterMemberUnhealthyExcludedNodeIds: Object.freeze(normalizeNodeIdList(options.projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds))
    })) : null;
    const participationByNodeId = Object.freeze(normalizeParticipationByNodeId(options.participationByNodeId));
    const participationStateCounts = Object.freeze(normalizeParticipationStateCounts(options.participationStateCounts));
    const recoveryProtocolState = normalizeRecoveryProtocolState(options.recoveryProtocolState);
    const recoveryProtocolReasonCodes = Object.freeze(normalizeStringList(options.recoveryProtocolReasonCodes));
    return Object.freeze(stryMutAct_9fa48("67232") ? {} : (stryCov_9fa48("67232"), {
      lifecycleState,
      epochBoundary,
      publishedActiveNodeIds,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      recoveryActiveNodeIds,
      recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds,
      suspectedOrTransitioningNodeIds,
      memberStatesByNodeId: Object.freeze(stryMutAct_9fa48("67233") ? {} : (stryCov_9fa48("67233"), {
        ...memberStatesByNodeId
      })),
      recoveryEpochByNodeId: Object.freeze(stryMutAct_9fa48("67234") ? {} : (stryCov_9fa48("67234"), {
        ...recoveryEpochByNodeId
      })),
      membershipFreeze,
      projectionDiagnostics,
      participationByNodeId,
      participationStateCounts,
      recoveryProtocolState,
      recoveryProtocolReasonCodes
    }));
  }
}
export { MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY, MEMBERSHIP_MEMBER_STATE, MEMBERSHIP_LIFECYCLE_STATE, MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS, NODE_PARTICIPATION_STATE, RECOVERY_PROTOCOL_STATE, buildMembershipLifecycleSummary, isValidMembershipLifecycleTransition, normalizeMembershipLifecycleEpochBoundary, normalizeMembershipMemberState, normalizeMembershipLifecycleState, normalizeNodeParticipationState, normalizeRecoveryProtocolState };