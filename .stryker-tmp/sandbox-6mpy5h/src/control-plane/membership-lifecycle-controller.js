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
import { STARTUP_JOIN_MODE } from '../bootstrap/rejoin-hints-constants.js';
import { TYPEOF } from '../constants/index.js';
import { buildMembershipLifecycleSummary, MEMBERSHIP_MEMBER_STATE, MEMBERSHIP_LIFECYCLE_STATE } from './membership-lifecycle-constants.js';
export const MEMBERSHIP_LIFECYCLE_INTENT = Object.freeze(stryMutAct_9fa48("67235") ? {} : (stryCov_9fa48("67235"), {
  JOIN_ADMISSION: stryMutAct_9fa48("67236") ? "" : (stryCov_9fa48("67236"), 'join_admission'),
  RESTART_REENTRY: stryMutAct_9fa48("67237") ? "" : (stryCov_9fa48("67237"), 'restart_reentry'),
  DRAIN: stryMutAct_9fa48("67238") ? "" : (stryCov_9fa48("67238"), 'drain'),
  REMOVAL: stryMutAct_9fa48("67239") ? "" : (stryCov_9fa48("67239"), 'removal')
}));
function normalizeString(value, fallback = stryMutAct_9fa48("67240") ? "Stryker was here!" : (stryCov_9fa48("67240"), '')) {
  if (stryMutAct_9fa48("67241")) {
    {}
  } else {
    stryCov_9fa48("67241");
    return (stryMutAct_9fa48("67244") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("67243") ? false : stryMutAct_9fa48("67242") ? true : (stryCov_9fa48("67242", "67243", "67244"), typeof value === TYPEOF.STRING)) ? stryMutAct_9fa48("67247") ? value.trim() && fallback : stryMutAct_9fa48("67246") ? false : stryMutAct_9fa48("67245") ? true : (stryCov_9fa48("67245", "67246", "67247"), (stryMutAct_9fa48("67248") ? value : (stryCov_9fa48("67248"), value.trim())) || fallback) : fallback;
  }
}
function normalizeTimestamp(value, fallback) {
  if (stryMutAct_9fa48("67249")) {
    {}
  } else {
    stryCov_9fa48("67249");
    if (stryMutAct_9fa48("67251") ? false : stryMutAct_9fa48("67250") ? true : (stryCov_9fa48("67250", "67251"), Number.isFinite(value))) {
      if (stryMutAct_9fa48("67252")) {
        {}
      } else {
        stryCov_9fa48("67252");
        return Math.floor(value);
      }
    }
    return fallback;
  }
}
function normalizeJoinStartupMode(startupMode) {
  if (stryMutAct_9fa48("67253")) {
    {}
  } else {
    stryCov_9fa48("67253");
    return normalizeString(startupMode, STARTUP_JOIN_MODE.FRESH_JOIN);
  }
}
export function resolveMembershipJoinIntentType(startupMode) {
  if (stryMutAct_9fa48("67254")) {
    {}
  } else {
    stryCov_9fa48("67254");
    return (stryMutAct_9fa48("67257") ? normalizeJoinStartupMode(startupMode) !== STARTUP_JOIN_MODE.DURABLE_REJOIN : stryMutAct_9fa48("67256") ? false : stryMutAct_9fa48("67255") ? true : (stryCov_9fa48("67255", "67256", "67257"), normalizeJoinStartupMode(startupMode) === STARTUP_JOIN_MODE.DURABLE_REJOIN)) ? MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY : MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION;
  }
}
function buildJoinIntent(options = {}) {
  if (stryMutAct_9fa48("67258")) {
    {}
  } else {
    stryCov_9fa48("67258");
    const startupMode = normalizeJoinStartupMode(options.startupMode);
    const intentType = resolveMembershipJoinIntentType(startupMode);
    return stryMutAct_9fa48("67259") ? {} : (stryCov_9fa48("67259"), {
      intentType,
      nodeId: normalizeString(options.nodeId),
      startupMode,
      joinSessionId: normalizeString(options.joinSessionId),
      nodeAddress: normalizeString(options.nodeAddress),
      seedNodeAddress: normalizeString(options.seedNodeAddress),
      requestedAt: normalizeTimestamp(options.requestedAt, Date.now()),
      reasonCode: normalizeString(options.reasonCode, (stryMutAct_9fa48("67262") ? intentType !== MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY : stryMutAct_9fa48("67261") ? false : stryMutAct_9fa48("67260") ? true : (stryCov_9fa48("67260", "67261", "67262"), intentType === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY)) ? stryMutAct_9fa48("67263") ? "" : (stryCov_9fa48("67263"), 'restart_reentry_requested') : stryMutAct_9fa48("67264") ? "" : (stryCov_9fa48("67264"), 'join_admission_requested')),
      membershipLifecycleSummary: buildMembershipLifecycleSummary(stryMutAct_9fa48("67265") ? {} : (stryCov_9fa48("67265"), {
        lifecycleState: (stryMutAct_9fa48("67268") ? intentType !== MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY : stryMutAct_9fa48("67267") ? false : stryMutAct_9fa48("67266") ? true : (stryCov_9fa48("67266", "67267", "67268"), intentType === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY)) ? MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP : MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
        publishedActiveNodeIds: options.publishedActiveNodeIds,
        memberStatesByNodeId: normalizeString(options.nodeId) ? stryMutAct_9fa48("67269") ? {} : (stryCov_9fa48("67269"), {
          [normalizeString(options.nodeId)]: (stryMutAct_9fa48("67272") ? intentType !== MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY : stryMutAct_9fa48("67271") ? false : stryMutAct_9fa48("67270") ? true : (stryCov_9fa48("67270", "67271", "67272"), intentType === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY)) ? MEMBERSHIP_MEMBER_STATE.CATCHING_UP : MEMBERSHIP_MEMBER_STATE.JOINING
        }) : undefined,
        recoveryEpochByNodeId: (stryMutAct_9fa48("67275") ? normalizeString(options.nodeId) || normalizeString(options.recoveryEpoch) : stryMutAct_9fa48("67274") ? false : stryMutAct_9fa48("67273") ? true : (stryCov_9fa48("67273", "67274", "67275"), normalizeString(options.nodeId) && normalizeString(options.recoveryEpoch))) ? stryMutAct_9fa48("67276") ? {} : (stryCov_9fa48("67276"), {
          [normalizeString(options.nodeId)]: normalizeString(options.recoveryEpoch)
        }) : undefined
      }))
    });
  }
}
function buildDrainIntent(options = {}) {
  if (stryMutAct_9fa48("67277")) {
    {}
  } else {
    stryCov_9fa48("67277");
    const reasonCode = normalizeString(options.reasonCode, stryMutAct_9fa48("67278") ? "" : (stryCov_9fa48("67278"), 'node_draining'));
    return stryMutAct_9fa48("67279") ? {} : (stryCov_9fa48("67279"), {
      intentType: MEMBERSHIP_LIFECYCLE_INTENT.DRAIN,
      nodeId: normalizeString(options.nodeId),
      requestedAt: normalizeTimestamp(options.requestedAt, Date.now()),
      drainDeadlineMs: Number.isFinite(options.drainDeadlineMs) ? Math.floor(options.drainDeadlineMs) : null,
      signal: normalizeString(options.signal),
      reasonCode,
      membershipLifecycleSummary: buildMembershipLifecycleSummary(stryMutAct_9fa48("67280") ? {} : (stryCov_9fa48("67280"), {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.DRAINING,
        publishedActiveNodeIds: options.publishedActiveNodeIds,
        memberStatesByNodeId: normalizeString(options.nodeId) ? stryMutAct_9fa48("67281") ? {} : (stryCov_9fa48("67281"), {
          [normalizeString(options.nodeId)]: MEMBERSHIP_MEMBER_STATE.DRAINING
        }) : undefined
      }))
    });
  }
}
function buildRemovalIntent(options = {}) {
  if (stryMutAct_9fa48("67282")) {
    {}
  } else {
    stryCov_9fa48("67282");
    return stryMutAct_9fa48("67283") ? {} : (stryCov_9fa48("67283"), {
      intentType: MEMBERSHIP_LIFECYCLE_INTENT.REMOVAL,
      nodeId: normalizeString(options.nodeId),
      requestedAt: normalizeTimestamp(options.requestedAt, Date.now()),
      reasonCode: normalizeString(options.reasonCode, stryMutAct_9fa48("67284") ? "" : (stryCov_9fa48("67284"), 'membership_removal_requested')),
      membershipLifecycleSummary: buildMembershipLifecycleSummary(stryMutAct_9fa48("67285") ? {} : (stryCov_9fa48("67285"), {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.REMOVED,
        publishedActiveNodeIds: options.publishedActiveNodeIds,
        memberStatesByNodeId: normalizeString(options.nodeId) ? stryMutAct_9fa48("67286") ? {} : (stryCov_9fa48("67286"), {
          [normalizeString(options.nodeId)]: MEMBERSHIP_MEMBER_STATE.RETIRED
        }) : undefined
      }))
    });
  }
}
export class MembershipLifecycleController {
  constructor(options = {}) {
    if (stryMutAct_9fa48("67287")) {
      {}
    } else {
      stryCov_9fa48("67287");
      this.nodeId = normalizeString(options.nodeId);
      this.startupMode = normalizeJoinStartupMode(options.startupMode);
      this.now = (stryMutAct_9fa48("67290") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("67289") ? false : stryMutAct_9fa48("67288") ? true : (stryCov_9fa48("67288", "67289", "67290"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("67291") ? () => undefined : (stryCov_9fa48("67291"), () => Date.now());
      this.delegates = stryMutAct_9fa48("67292") ? {} : (stryCov_9fa48("67292"), {
        onJoinIntent: (stryMutAct_9fa48("67295") ? typeof options.delegates?.onJoinIntent !== TYPEOF.FUNCTION : stryMutAct_9fa48("67294") ? false : stryMutAct_9fa48("67293") ? true : (stryCov_9fa48("67293", "67294", "67295"), typeof (stryMutAct_9fa48("67296") ? options.delegates.onJoinIntent : (stryCov_9fa48("67296"), options.delegates?.onJoinIntent)) === TYPEOF.FUNCTION)) ? options.delegates.onJoinIntent : null,
        onDrainIntent: (stryMutAct_9fa48("67299") ? typeof options.delegates?.onDrainIntent !== TYPEOF.FUNCTION : stryMutAct_9fa48("67298") ? false : stryMutAct_9fa48("67297") ? true : (stryCov_9fa48("67297", "67298", "67299"), typeof (stryMutAct_9fa48("67300") ? options.delegates.onDrainIntent : (stryCov_9fa48("67300"), options.delegates?.onDrainIntent)) === TYPEOF.FUNCTION)) ? options.delegates.onDrainIntent : null,
        onRemovalIntent: (stryMutAct_9fa48("67303") ? typeof options.delegates?.onRemovalIntent !== TYPEOF.FUNCTION : stryMutAct_9fa48("67302") ? false : stryMutAct_9fa48("67301") ? true : (stryCov_9fa48("67301", "67302", "67303"), typeof (stryMutAct_9fa48("67304") ? options.delegates.onRemovalIntent : (stryCov_9fa48("67304"), options.delegates?.onRemovalIntent)) === TYPEOF.FUNCTION)) ? options.delegates.onRemovalIntent : null
      });
      this.intentHistory = stryMutAct_9fa48("67305") ? ["Stryker was here"] : (stryCov_9fa48("67305"), []);
    }
  }
  async submitJoinIntent(options = {}) {
    if (stryMutAct_9fa48("67306")) {
      {}
    } else {
      stryCov_9fa48("67306");
      const intent = buildJoinIntent(stryMutAct_9fa48("67307") ? {} : (stryCov_9fa48("67307"), {
        ...options,
        nodeId: stryMutAct_9fa48("67310") ? options.nodeId && this.nodeId : stryMutAct_9fa48("67309") ? false : stryMutAct_9fa48("67308") ? true : (stryCov_9fa48("67308", "67309", "67310"), options.nodeId || this.nodeId),
        startupMode: stryMutAct_9fa48("67313") ? options.startupMode && this.startupMode : stryMutAct_9fa48("67312") ? false : stryMutAct_9fa48("67311") ? true : (stryCov_9fa48("67311", "67312", "67313"), options.startupMode || this.startupMode),
        requestedAt: stryMutAct_9fa48("67314") ? options.requestedAt && this.now() : (stryCov_9fa48("67314"), options.requestedAt ?? this.now())
      }));
      this.intentHistory.push(intent);
      if (stryMutAct_9fa48("67316") ? false : stryMutAct_9fa48("67315") ? true : (stryCov_9fa48("67315", "67316"), this.delegates.onJoinIntent)) {
        if (stryMutAct_9fa48("67317")) {
          {}
        } else {
          stryCov_9fa48("67317");
          return this.delegates.onJoinIntent(stryMutAct_9fa48("67318") ? {} : (stryCov_9fa48("67318"), {
            intent,
            controller: this
          }));
        }
      }
      return intent;
    }
  }
  async submitDrainIntent(options = {}) {
    if (stryMutAct_9fa48("67319")) {
      {}
    } else {
      stryCov_9fa48("67319");
      const intent = buildDrainIntent(stryMutAct_9fa48("67320") ? {} : (stryCov_9fa48("67320"), {
        ...options,
        nodeId: stryMutAct_9fa48("67323") ? options.nodeId && this.nodeId : stryMutAct_9fa48("67322") ? false : stryMutAct_9fa48("67321") ? true : (stryCov_9fa48("67321", "67322", "67323"), options.nodeId || this.nodeId),
        requestedAt: stryMutAct_9fa48("67324") ? options.requestedAt && this.now() : (stryCov_9fa48("67324"), options.requestedAt ?? this.now())
      }));
      this.intentHistory.push(intent);
      if (stryMutAct_9fa48("67326") ? false : stryMutAct_9fa48("67325") ? true : (stryCov_9fa48("67325", "67326"), this.delegates.onDrainIntent)) {
        if (stryMutAct_9fa48("67327")) {
          {}
        } else {
          stryCov_9fa48("67327");
          return this.delegates.onDrainIntent(stryMutAct_9fa48("67328") ? {} : (stryCov_9fa48("67328"), {
            intent,
            controller: this
          }));
        }
      }
      return intent;
    }
  }
  async submitRemovalIntent(options = {}) {
    if (stryMutAct_9fa48("67329")) {
      {}
    } else {
      stryCov_9fa48("67329");
      const intent = buildRemovalIntent(stryMutAct_9fa48("67330") ? {} : (stryCov_9fa48("67330"), {
        ...options,
        nodeId: stryMutAct_9fa48("67333") ? options.nodeId && this.nodeId : stryMutAct_9fa48("67332") ? false : stryMutAct_9fa48("67331") ? true : (stryCov_9fa48("67331", "67332", "67333"), options.nodeId || this.nodeId),
        requestedAt: stryMutAct_9fa48("67334") ? options.requestedAt && this.now() : (stryCov_9fa48("67334"), options.requestedAt ?? this.now())
      }));
      this.intentHistory.push(intent);
      if (stryMutAct_9fa48("67336") ? false : stryMutAct_9fa48("67335") ? true : (stryCov_9fa48("67335", "67336"), this.delegates.onRemovalIntent)) {
        if (stryMutAct_9fa48("67337")) {
          {}
        } else {
          stryCov_9fa48("67337");
          return this.delegates.onRemovalIntent(stryMutAct_9fa48("67338") ? {} : (stryCov_9fa48("67338"), {
            intent,
            controller: this
          }));
        }
      }
      return intent;
    }
  }
}