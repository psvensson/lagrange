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
import { isPriorityControlPlanePartition as isPriorityControlPlanePartitionId } from './system-partition-classification.js';
import { getTrafficReadinessSnapshot, isBackgroundWorkReadySnapshot, isMetadataPublicationReadySnapshot } from './traffic-readiness-utils.js';
import { LIFECYCLE_PHASE, LIFECYCLE_REASON } from './lifecycle-controller-constants.js';
const STARTUP_RECOVERY_OPTIONAL_STATE = Object.freeze(stryMutAct_9fa48("31070") ? {} : (stryCov_9fa48("31070"), {
  PRESENT: stryMutAct_9fa48("31071") ? "" : (stryCov_9fa48("31071"), 'present'),
  NONE: stryMutAct_9fa48("31072") ? "" : (stryCov_9fa48("31072"), 'none')
}));
const STARTUP_RECOVERY_SNAPSHOT_STATE = Object.freeze(stryMutAct_9fa48("31073") ? {} : (stryCov_9fa48("31073"), {
  MANAGED: stryMutAct_9fa48("31074") ? "" : (stryCov_9fa48("31074"), 'managed'),
  UNMANAGED: stryMutAct_9fa48("31075") ? "" : (stryCov_9fa48("31075"), 'unmanaged')
}));
const STARTUP_AUTHORITY_FAILURE_STATE = Object.freeze(stryMutAct_9fa48("31076") ? {} : (stryCov_9fa48("31076"), {
  PRESENT: stryMutAct_9fa48("31077") ? "" : (stryCov_9fa48("31077"), 'present'),
  NONE: stryMutAct_9fa48("31078") ? "" : (stryCov_9fa48("31078"), 'none')
}));
const STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE = stryMutAct_9fa48("31079") ? "" : (stryCov_9fa48("31079"), 'observation_unavailable');
const STARTUP_RECOVERY_READINESS_STATE_OPTION = stryMutAct_9fa48("31080") ? "" : (stryCov_9fa48("31080"), 'readinessState');
function normalizePartitionId(value) {
  if (stryMutAct_9fa48("31081")) {
    {}
  } else {
    stryCov_9fa48("31081");
    return (stryMutAct_9fa48("31084") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("31083") ? false : stryMutAct_9fa48("31082") ? true : (stryCov_9fa48("31082", "31083", "31084"), (stryMutAct_9fa48("31086") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("31085") ? true : (stryCov_9fa48("31085", "31086"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("31089") ? value.length <= NUM.ZERO : stryMutAct_9fa48("31088") ? value.length >= NUM.ZERO : stryMutAct_9fa48("31087") ? true : (stryCov_9fa48("31087", "31088", "31089"), value.length > NUM.ZERO)))) ? value : null;
  }
}
function normalizeReasonCode(reason) {
  if (stryMutAct_9fa48("31090")) {
    {}
  } else {
    stryCov_9fa48("31090");
    if (stryMutAct_9fa48("31093") ? typeof reason === TYPEOF.STRING : stryMutAct_9fa48("31092") ? false : stryMutAct_9fa48("31091") ? true : (stryCov_9fa48("31091", "31092", "31093"), typeof reason !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("31094")) {
        {}
      } else {
        stryCov_9fa48("31094");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("31095") ? reason : (stryCov_9fa48("31095"), reason.trim());
    return (stryMutAct_9fa48("31099") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("31098") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("31097") ? false : stryMutAct_9fa48("31096") ? true : (stryCov_9fa48("31096", "31097", "31098", "31099"), normalized.length > NUM.ZERO)) ? normalized : null;
  }
}
function normalizeReasonCodeArray(reasonCodes) {
  if (stryMutAct_9fa48("31100")) {
    {}
  } else {
    stryCov_9fa48("31100");
    if (stryMutAct_9fa48("31103") ? false : stryMutAct_9fa48("31102") ? true : stryMutAct_9fa48("31101") ? Array.isArray(reasonCodes) : (stryCov_9fa48("31101", "31102", "31103"), !Array.isArray(reasonCodes))) {
      if (stryMutAct_9fa48("31104")) {
        {}
      } else {
        stryCov_9fa48("31104");
        return stryMutAct_9fa48("31105") ? ["Stryker was here"] : (stryCov_9fa48("31105"), []);
      }
    }
    return stryMutAct_9fa48("31106") ? [] : (stryCov_9fa48("31106"), [...new Set(stryMutAct_9fa48("31107") ? reasonCodes.map(reason => normalizeReasonCode(reason)) : (stryCov_9fa48("31107"), reasonCodes.map(stryMutAct_9fa48("31108") ? () => undefined : (stryCov_9fa48("31108"), reason => normalizeReasonCode(reason))).filter(stryMutAct_9fa48("31109") ? () => undefined : (stryCov_9fa48("31109"), reason => stryMutAct_9fa48("31112") ? reason === null : stryMutAct_9fa48("31111") ? false : stryMutAct_9fa48("31110") ? true : (stryCov_9fa48("31110", "31111", "31112"), reason !== null)))))]);
  }
}
function normalizeLifecyclePhase(phase) {
  if (stryMutAct_9fa48("31113")) {
    {}
  } else {
    stryCov_9fa48("31113");
    if (stryMutAct_9fa48("31116") ? typeof phase === TYPEOF.STRING : stryMutAct_9fa48("31115") ? false : stryMutAct_9fa48("31114") ? true : (stryCov_9fa48("31114", "31115", "31116"), typeof phase !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("31117")) {
        {}
      } else {
        stryCov_9fa48("31117");
        return null;
      }
    }
    const normalizedPhase = stryMutAct_9fa48("31119") ? phase.toUpperCase() : stryMutAct_9fa48("31118") ? phase.trim().toLowerCase() : (stryCov_9fa48("31118", "31119"), phase.trim().toUpperCase());
    return Object.values(LIFECYCLE_PHASE).includes(normalizedPhase) ? normalizedPhase : null;
  }
}
function normalizeReasonCodes(snapshot) {
  if (stryMutAct_9fa48("31120")) {
    {}
  } else {
    stryCov_9fa48("31120");
    return normalizeReasonCodeArray(stryMutAct_9fa48("31121") ? snapshot.reasons : (stryCov_9fa48("31121"), snapshot?.reasons));
  }
}
function normalizePriorityRecoveryTargetParticipation(value) {
  if (stryMutAct_9fa48("31122")) {
    {}
  } else {
    stryCov_9fa48("31122");
    if (stryMutAct_9fa48("31125") ? !value && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("31124") ? false : stryMutAct_9fa48("31123") ? true : (stryCov_9fa48("31123", "31124", "31125"), (stryMutAct_9fa48("31126") ? value : (stryCov_9fa48("31126"), !value)) || (stryMutAct_9fa48("31128") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("31127") ? false : (stryCov_9fa48("31127", "31128"), typeof value !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("31129")) {
        {}
      } else {
        stryCov_9fa48("31129");
        return null;
      }
    }
    const nodeId = normalizePartitionId(value.nodeId);
    const state = normalizeReasonCode(value.state);
    if (stryMutAct_9fa48("31132") ? nodeId === null || state === null : stryMutAct_9fa48("31131") ? false : stryMutAct_9fa48("31130") ? true : (stryCov_9fa48("31130", "31131", "31132"), (stryMutAct_9fa48("31134") ? nodeId !== null : stryMutAct_9fa48("31133") ? true : (stryCov_9fa48("31133", "31134"), nodeId === null)) && (stryMutAct_9fa48("31136") ? state !== null : stryMutAct_9fa48("31135") ? true : (stryCov_9fa48("31135", "31136"), state === null)))) {
      if (stryMutAct_9fa48("31137")) {
        {}
      } else {
        stryCov_9fa48("31137");
        return null;
      }
    }
    return Object.freeze(stryMutAct_9fa48("31138") ? {} : (stryCov_9fa48("31138"), {
      nodeId,
      state,
      recoverySource: normalizeReasonCode(value.recoverySource),
      durable: stryMutAct_9fa48("31141") ? value.durable !== true : stryMutAct_9fa48("31140") ? false : stryMutAct_9fa48("31139") ? true : (stryCov_9fa48("31139", "31140", "31141"), value.durable === (stryMutAct_9fa48("31142") ? false : (stryCov_9fa48("31142"), true))),
      publishedActive: stryMutAct_9fa48("31145") ? value.publishedActive !== true : stryMutAct_9fa48("31144") ? false : stryMutAct_9fa48("31143") ? true : (stryCov_9fa48("31143", "31144", "31145"), value.publishedActive === (stryMutAct_9fa48("31146") ? false : (stryCov_9fa48("31146"), true))),
      recoveryActive: stryMutAct_9fa48("31149") ? value.recoveryActive !== true : stryMutAct_9fa48("31148") ? false : stryMutAct_9fa48("31147") ? true : (stryCov_9fa48("31147", "31148", "31149"), value.recoveryActive === (stryMutAct_9fa48("31150") ? false : (stryCov_9fa48("31150"), true))),
      projectedServing: stryMutAct_9fa48("31153") ? value.projectedServing !== true : stryMutAct_9fa48("31152") ? false : stryMutAct_9fa48("31151") ? true : (stryCov_9fa48("31151", "31152", "31153"), value.projectedServing === (stryMutAct_9fa48("31154") ? false : (stryCov_9fa48("31154"), true))),
      locallyEligible: stryMutAct_9fa48("31157") ? value.locallyEligible !== true : stryMutAct_9fa48("31156") ? false : stryMutAct_9fa48("31155") ? true : (stryCov_9fa48("31155", "31156", "31157"), value.locallyEligible === (stryMutAct_9fa48("31158") ? false : (stryCov_9fa48("31158"), true))),
      suspectedOrTransitioning: stryMutAct_9fa48("31161") ? value.suspectedOrTransitioning !== true : stryMutAct_9fa48("31160") ? false : stryMutAct_9fa48("31159") ? true : (stryCov_9fa48("31159", "31160", "31161"), value.suspectedOrTransitioning === (stryMutAct_9fa48("31162") ? false : (stryCov_9fa48("31162"), true))),
      reasons: normalizeReasonCodeArray(value.reasons)
    }));
  }
}
function normalizePriorityRecoveryHealthDetails(details) {
  if (stryMutAct_9fa48("31163")) {
    {}
  } else {
    stryCov_9fa48("31163");
    const recoveryProtocolState = normalizeReasonCode(stryMutAct_9fa48("31164") ? details.recoveryProtocolState : (stryCov_9fa48("31164"), details?.recoveryProtocolState));
    const targetParticipation = normalizePriorityRecoveryTargetParticipation(stryMutAct_9fa48("31165") ? details.targetParticipation : (stryCov_9fa48("31165"), details?.targetParticipation));
    return Object.freeze(stryMutAct_9fa48("31166") ? {} : (stryCov_9fa48("31166"), {
      recoveryProtocol: buildRecoveryProtocolDetail(recoveryProtocolState),
      targetParticipation: buildTargetParticipationDetail(targetParticipation),
      priorityRecoveryReasonCodes: normalizeReasonCodeArray(stryMutAct_9fa48("31167") ? details.priorityRecoveryReasonCodes : (stryCov_9fa48("31167"), details?.priorityRecoveryReasonCodes))
    }));
  }
}
function isTrafficReadySnapshot(snapshot) {
  if (stryMutAct_9fa48("31168")) {
    {}
  } else {
    stryCov_9fa48("31168");
    return Boolean(stryMutAct_9fa48("31171") ? snapshot && snapshot.ready === true || snapshot.phase === LIFECYCLE_PHASE.TRAFFIC_READY : stryMutAct_9fa48("31170") ? false : stryMutAct_9fa48("31169") ? true : (stryCov_9fa48("31169", "31170", "31171"), (stryMutAct_9fa48("31173") ? snapshot || snapshot.ready === true : stryMutAct_9fa48("31172") ? true : (stryCov_9fa48("31172", "31173"), snapshot && (stryMutAct_9fa48("31175") ? snapshot.ready !== true : stryMutAct_9fa48("31174") ? true : (stryCov_9fa48("31174", "31175"), snapshot.ready === (stryMutAct_9fa48("31176") ? false : (stryCov_9fa48("31176"), true)))))) && (stryMutAct_9fa48("31178") ? snapshot.phase !== LIFECYCLE_PHASE.TRAFFIC_READY : stryMutAct_9fa48("31177") ? true : (stryCov_9fa48("31177", "31178"), snapshot.phase === LIFECYCLE_PHASE.TRAFFIC_READY))));
  }
}
const STARTUP_RECOVERY_STAGE = Object.freeze(stryMutAct_9fa48("31179") ? {} : (stryCov_9fa48("31179"), {
  UNMANAGED: stryMutAct_9fa48("31180") ? "" : (stryCov_9fa48("31180"), 'unmanaged'),
  BLOCKED: stryMutAct_9fa48("31181") ? "" : (stryCov_9fa48("31181"), 'blocked'),
  CONTROL_PLANE_RECOVERY_READY: stryMutAct_9fa48("31182") ? "" : (stryCov_9fa48("31182"), 'control_plane_recovery_ready'),
  BACKGROUND_WORK_READY: stryMutAct_9fa48("31183") ? "" : (stryCov_9fa48("31183"), 'background_work_ready'),
  TRAFFIC_READY: stryMutAct_9fa48("31184") ? "" : (stryCov_9fa48("31184"), 'traffic_ready')
}));
const STARTUP_AUTHORITY_STATE = Object.freeze(stryMutAct_9fa48("31185") ? {} : (stryCov_9fa48("31185"), {
  READY: stryMutAct_9fa48("31186") ? "" : (stryCov_9fa48("31186"), 'ready'),
  RECOVERY_PENDING: stryMutAct_9fa48("31187") ? "" : (stryCov_9fa48("31187"), 'recovery_pending'),
  SEED_LOCALLY_READY_UNPUBLISHED: stryMutAct_9fa48("31188") ? "" : (stryCov_9fa48("31188"), 'seed_locally_ready_unpublished'),
  OBSERVATION_UNAVAILABLE: stryMutAct_9fa48("31189") ? "" : (stryCov_9fa48("31189"), 'observation_unavailable'),
  AUTHORITY_UNAVAILABLE: stryMutAct_9fa48("31190") ? "" : (stryCov_9fa48("31190"), 'authority_unavailable'),
  BLOCKED: stryMutAct_9fa48("31191") ? "" : (stryCov_9fa48("31191"), 'blocked')
}));
const STARTUP_RECOVERY_STAGE_RANK = Object.freeze(stryMutAct_9fa48("31192") ? {} : (stryCov_9fa48("31192"), {
  [STARTUP_RECOVERY_STAGE.UNMANAGED]: NUM.ZERO,
  [STARTUP_RECOVERY_STAGE.BLOCKED]: NUM.ONE,
  [STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY]: NUM.TWO,
  [STARTUP_RECOVERY_STAGE.BACKGROUND_WORK_READY]: NUM.THREE,
  [STARTUP_RECOVERY_STAGE.TRAFFIC_READY]: NUM.FOUR
}));
const BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS = Object.freeze(stryMutAct_9fa48("31193") ? [] : (stryCov_9fa48("31193"), [LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE, LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE, LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE, LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING, LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY]));
const BOOTSTRAP_INIT_PRIORITY_BYPASS_REASON_SET = new Set(BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS);
function canBypassBootstrapInitPriorityReasons(reasonCodes, snapshot) {
  if (stryMutAct_9fa48("31194")) {
    {}
  } else {
    stryCov_9fa48("31194");
    if (stryMutAct_9fa48("31197") ? !snapshot && snapshot.draining === true : stryMutAct_9fa48("31196") ? false : stryMutAct_9fa48("31195") ? true : (stryCov_9fa48("31195", "31196", "31197"), (stryMutAct_9fa48("31198") ? snapshot : (stryCov_9fa48("31198"), !snapshot)) || (stryMutAct_9fa48("31200") ? snapshot.draining !== true : stryMutAct_9fa48("31199") ? false : (stryCov_9fa48("31199", "31200"), snapshot.draining === (stryMutAct_9fa48("31201") ? false : (stryCov_9fa48("31201"), true)))))) {
      if (stryMutAct_9fa48("31202")) {
        {}
      } else {
        stryCov_9fa48("31202");
        return stryMutAct_9fa48("31203") ? true : (stryCov_9fa48("31203"), false);
      }
    }
    const normalizedPhase = normalizeLifecyclePhase(snapshot.phase);
    if (stryMutAct_9fa48("31206") ? normalizedPhase === LIFECYCLE_PHASE.INIT : stryMutAct_9fa48("31205") ? false : stryMutAct_9fa48("31204") ? true : (stryCov_9fa48("31204", "31205", "31206"), normalizedPhase !== LIFECYCLE_PHASE.INIT)) {
      if (stryMutAct_9fa48("31207")) {
        {}
      } else {
        stryCov_9fa48("31207");
        return stryMutAct_9fa48("31208") ? true : (stryCov_9fa48("31208"), false);
      }
    }
    const normalizedReasonCodes = normalizeReasonCodeArray(reasonCodes);
    if (stryMutAct_9fa48("31211") ? normalizedReasonCodes.length !== NUM.ZERO : stryMutAct_9fa48("31210") ? false : stryMutAct_9fa48("31209") ? true : (stryCov_9fa48("31209", "31210", "31211"), normalizedReasonCodes.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("31212")) {
        {}
      } else {
        stryCov_9fa48("31212");
        return stryMutAct_9fa48("31213") ? true : (stryCov_9fa48("31213"), false);
      }
    }
    if (stryMutAct_9fa48("31216") ? false : stryMutAct_9fa48("31215") ? true : stryMutAct_9fa48("31214") ? normalizedReasonCodes.includes(LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING) : (stryCov_9fa48("31214", "31215", "31216"), !normalizedReasonCodes.includes(LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING))) {
      if (stryMutAct_9fa48("31217")) {
        {}
      } else {
        stryCov_9fa48("31217");
        return stryMutAct_9fa48("31218") ? true : (stryCov_9fa48("31218"), false);
      }
    }
    return stryMutAct_9fa48("31219") ? normalizedReasonCodes.some(reason => BOOTSTRAP_INIT_PRIORITY_BYPASS_REASON_SET.has(reason)) : (stryCov_9fa48("31219"), normalizedReasonCodes.every(stryMutAct_9fa48("31220") ? () => undefined : (stryCov_9fa48("31220"), reason => BOOTSTRAP_INIT_PRIORITY_BYPASS_REASON_SET.has(reason))));
  }
}
function resolveStartupRecoveryStage(options = {}) {
  if (stryMutAct_9fa48("31221")) {
    {}
  } else {
    stryCov_9fa48("31221");
    if (stryMutAct_9fa48("31224") ? options.managed === true : stryMutAct_9fa48("31223") ? false : stryMutAct_9fa48("31222") ? true : (stryCov_9fa48("31222", "31223", "31224"), options.managed !== (stryMutAct_9fa48("31225") ? false : (stryCov_9fa48("31225"), true)))) {
      if (stryMutAct_9fa48("31226")) {
        {}
      } else {
        stryCov_9fa48("31226");
        return STARTUP_RECOVERY_STAGE.UNMANAGED;
      }
    }
    if (stryMutAct_9fa48("31229") ? options.trafficReady !== true : stryMutAct_9fa48("31228") ? false : stryMutAct_9fa48("31227") ? true : (stryCov_9fa48("31227", "31228", "31229"), options.trafficReady === (stryMutAct_9fa48("31230") ? false : (stryCov_9fa48("31230"), true)))) {
      if (stryMutAct_9fa48("31231")) {
        {}
      } else {
        stryCov_9fa48("31231");
        return STARTUP_RECOVERY_STAGE.TRAFFIC_READY;
      }
    }
    if (stryMutAct_9fa48("31234") ? options.backgroundWorkReady !== true : stryMutAct_9fa48("31233") ? false : stryMutAct_9fa48("31232") ? true : (stryCov_9fa48("31232", "31233", "31234"), options.backgroundWorkReady === (stryMutAct_9fa48("31235") ? false : (stryCov_9fa48("31235"), true)))) {
      if (stryMutAct_9fa48("31236")) {
        {}
      } else {
        stryCov_9fa48("31236");
        return STARTUP_RECOVERY_STAGE.BACKGROUND_WORK_READY;
      }
    }
    if (stryMutAct_9fa48("31239") ? options.controlPlaneRecoveryReady !== true : stryMutAct_9fa48("31238") ? false : stryMutAct_9fa48("31237") ? true : (stryCov_9fa48("31237", "31238", "31239"), options.controlPlaneRecoveryReady === (stryMutAct_9fa48("31240") ? false : (stryCov_9fa48("31240"), true)))) {
      if (stryMutAct_9fa48("31241")) {
        {}
      } else {
        stryCov_9fa48("31241");
        return STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY;
      }
    }
    return STARTUP_RECOVERY_STAGE.BLOCKED;
  }
}
function buildOptionalPhaseDetail(phase) {
  if (stryMutAct_9fa48("31242")) {
    {}
  } else {
    stryCov_9fa48("31242");
    if (stryMutAct_9fa48("31245") ? typeof phase !== TYPEOF.STRING && phase.length === NUM.ZERO : stryMutAct_9fa48("31244") ? false : stryMutAct_9fa48("31243") ? true : (stryCov_9fa48("31243", "31244", "31245"), (stryMutAct_9fa48("31247") ? typeof phase === TYPEOF.STRING : stryMutAct_9fa48("31246") ? false : (stryCov_9fa48("31246", "31247"), typeof phase !== TYPEOF.STRING)) || (stryMutAct_9fa48("31249") ? phase.length !== NUM.ZERO : stryMutAct_9fa48("31248") ? false : (stryCov_9fa48("31248", "31249"), phase.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("31250")) {
        {}
      } else {
        stryCov_9fa48("31250");
        return Object.freeze(stryMutAct_9fa48("31251") ? {} : (stryCov_9fa48("31251"), {
          state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("31252") ? {} : (stryCov_9fa48("31252"), {
      state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
      phase
    }));
  }
}
function buildOptionalRetryAfterDetail(retryAfterMs) {
  if (stryMutAct_9fa48("31253")) {
    {}
  } else {
    stryCov_9fa48("31253");
    if (stryMutAct_9fa48("31256") ? false : stryMutAct_9fa48("31255") ? true : stryMutAct_9fa48("31254") ? Number.isFinite(retryAfterMs) : (stryCov_9fa48("31254", "31255", "31256"), !Number.isFinite(retryAfterMs))) {
      if (stryMutAct_9fa48("31257")) {
        {}
      } else {
        stryCov_9fa48("31257");
        return Object.freeze(stryMutAct_9fa48("31258") ? {} : (stryCov_9fa48("31258"), {
          state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("31259") ? {} : (stryCov_9fa48("31259"), {
      state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
      retryAfterMs
    }));
  }
}
function buildOptionalStableWindowDetail(stableWindowMs) {
  if (stryMutAct_9fa48("31260")) {
    {}
  } else {
    stryCov_9fa48("31260");
    if (stryMutAct_9fa48("31263") ? false : stryMutAct_9fa48("31262") ? true : stryMutAct_9fa48("31261") ? Number.isFinite(stableWindowMs) : (stryCov_9fa48("31261", "31262", "31263"), !Number.isFinite(stableWindowMs))) {
      if (stryMutAct_9fa48("31264")) {
        {}
      } else {
        stryCov_9fa48("31264");
        return Object.freeze(stryMutAct_9fa48("31265") ? {} : (stryCov_9fa48("31265"), {
          state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("31266") ? {} : (stryCov_9fa48("31266"), {
      state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
      stableWindowMs
    }));
  }
}
function buildOptionalStableElapsedDetail(stableElapsedMs) {
  if (stryMutAct_9fa48("31267")) {
    {}
  } else {
    stryCov_9fa48("31267");
    if (stryMutAct_9fa48("31270") ? false : stryMutAct_9fa48("31269") ? true : stryMutAct_9fa48("31268") ? Number.isFinite(stableElapsedMs) : (stryCov_9fa48("31268", "31269", "31270"), !Number.isFinite(stableElapsedMs))) {
      if (stryMutAct_9fa48("31271")) {
        {}
      } else {
        stryCov_9fa48("31271");
        return Object.freeze(stryMutAct_9fa48("31272") ? {} : (stryCov_9fa48("31272"), {
          state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("31273") ? {} : (stryCov_9fa48("31273"), {
      state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
      stableElapsedMs
    }));
  }
}
function buildRecoveryProtocolDetail(recoveryProtocolState) {
  if (stryMutAct_9fa48("31274")) {
    {}
  } else {
    stryCov_9fa48("31274");
    if (stryMutAct_9fa48("31277") ? typeof recoveryProtocolState !== TYPEOF.STRING && recoveryProtocolState.length === NUM.ZERO : stryMutAct_9fa48("31276") ? false : stryMutAct_9fa48("31275") ? true : (stryCov_9fa48("31275", "31276", "31277"), (stryMutAct_9fa48("31279") ? typeof recoveryProtocolState === TYPEOF.STRING : stryMutAct_9fa48("31278") ? false : (stryCov_9fa48("31278", "31279"), typeof recoveryProtocolState !== TYPEOF.STRING)) || (stryMutAct_9fa48("31281") ? recoveryProtocolState.length !== NUM.ZERO : stryMutAct_9fa48("31280") ? false : (stryCov_9fa48("31280", "31281"), recoveryProtocolState.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("31282")) {
        {}
      } else {
        stryCov_9fa48("31282");
        return Object.freeze(stryMutAct_9fa48("31283") ? {} : (stryCov_9fa48("31283"), {
          state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("31284") ? {} : (stryCov_9fa48("31284"), {
      state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
      recoveryProtocolState
    }));
  }
}
function buildTargetParticipationDetail(targetParticipation) {
  if (stryMutAct_9fa48("31285")) {
    {}
  } else {
    stryCov_9fa48("31285");
    if (stryMutAct_9fa48("31288") ? !targetParticipation && typeof targetParticipation !== TYPEOF.OBJECT : stryMutAct_9fa48("31287") ? false : stryMutAct_9fa48("31286") ? true : (stryCov_9fa48("31286", "31287", "31288"), (stryMutAct_9fa48("31289") ? targetParticipation : (stryCov_9fa48("31289"), !targetParticipation)) || (stryMutAct_9fa48("31291") ? typeof targetParticipation === TYPEOF.OBJECT : stryMutAct_9fa48("31290") ? false : (stryCov_9fa48("31290", "31291"), typeof targetParticipation !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("31292")) {
        {}
      } else {
        stryCov_9fa48("31292");
        return Object.freeze(stryMutAct_9fa48("31293") ? {} : (stryCov_9fa48("31293"), {
          state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("31294") ? {} : (stryCov_9fa48("31294"), {
      state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
      targetParticipation
    }));
  }
}
function buildReadinessSnapshotDetail(snapshot) {
  if (stryMutAct_9fa48("31295")) {
    {}
  } else {
    stryCov_9fa48("31295");
    if (stryMutAct_9fa48("31298") ? !snapshot && typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("31297") ? false : stryMutAct_9fa48("31296") ? true : (stryCov_9fa48("31296", "31297", "31298"), (stryMutAct_9fa48("31299") ? snapshot : (stryCov_9fa48("31299"), !snapshot)) || (stryMutAct_9fa48("31301") ? typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("31300") ? false : (stryCov_9fa48("31300", "31301"), typeof snapshot !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("31302")) {
        {}
      } else {
        stryCov_9fa48("31302");
        return Object.freeze(stryMutAct_9fa48("31303") ? {} : (stryCov_9fa48("31303"), {
          state: STARTUP_RECOVERY_SNAPSHOT_STATE.UNMANAGED
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("31304") ? {} : (stryCov_9fa48("31304"), {
      state: STARTUP_RECOVERY_SNAPSHOT_STATE.MANAGED,
      snapshot
    }));
  }
}
function buildStartupAuthorityFailureDetail(failureReason) {
  if (stryMutAct_9fa48("31305")) {
    {}
  } else {
    stryCov_9fa48("31305");
    if (stryMutAct_9fa48("31308") ? typeof failureReason !== TYPEOF.STRING && failureReason.length === NUM.ZERO : stryMutAct_9fa48("31307") ? false : stryMutAct_9fa48("31306") ? true : (stryCov_9fa48("31306", "31307", "31308"), (stryMutAct_9fa48("31310") ? typeof failureReason === TYPEOF.STRING : stryMutAct_9fa48("31309") ? false : (stryCov_9fa48("31309", "31310"), typeof failureReason !== TYPEOF.STRING)) || (stryMutAct_9fa48("31312") ? failureReason.length !== NUM.ZERO : stryMutAct_9fa48("31311") ? false : (stryCov_9fa48("31311", "31312"), failureReason.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("31313")) {
        {}
      } else {
        stryCov_9fa48("31313");
        return Object.freeze(stryMutAct_9fa48("31314") ? {} : (stryCov_9fa48("31314"), {
          state: STARTUP_AUTHORITY_FAILURE_STATE.NONE
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("31315") ? {} : (stryCov_9fa48("31315"), {
      state: STARTUP_AUTHORITY_FAILURE_STATE.PRESENT,
      reason: failureReason
    }));
  }
}
function buildStartupAuthorityPublicationDetail(publicationObservationState) {
  if (stryMutAct_9fa48("31316")) {
    {}
  } else {
    stryCov_9fa48("31316");
    return Object.freeze(stryMutAct_9fa48("31317") ? {} : (stryCov_9fa48("31317"), {
      observationState: stryMutAct_9fa48("31320") ? publicationObservationState && STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE : stryMutAct_9fa48("31319") ? false : stryMutAct_9fa48("31318") ? true : (stryCov_9fa48("31318", "31319", "31320"), publicationObservationState || STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE)
    }));
  }
}
function normalizeStartupAuthoritySnapshot(value) {
  if (stryMutAct_9fa48("31321")) {
    {}
  } else {
    stryCov_9fa48("31321");
    if (stryMutAct_9fa48("31324") ? !value && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("31323") ? false : stryMutAct_9fa48("31322") ? true : (stryCov_9fa48("31322", "31323", "31324"), (stryMutAct_9fa48("31325") ? value : (stryCov_9fa48("31325"), !value)) || (stryMutAct_9fa48("31327") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("31326") ? false : (stryCov_9fa48("31326", "31327"), typeof value !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("31328")) {
        {}
      } else {
        stryCov_9fa48("31328");
        return Object.freeze(stryMutAct_9fa48("31329") ? {} : (stryCov_9fa48("31329"), {
          state: STARTUP_AUTHORITY_STATE.OBSERVATION_UNAVAILABLE,
          authorityAvailable: stryMutAct_9fa48("31330") ? true : (stryCov_9fa48("31330"), false),
          failure: Object.freeze(stryMutAct_9fa48("31331") ? {} : (stryCov_9fa48("31331"), {
            state: STARTUP_AUTHORITY_FAILURE_STATE.NONE
          })),
          publication: Object.freeze(stryMutAct_9fa48("31332") ? {} : (stryCov_9fa48("31332"), {
            observationState: STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE
          })),
          publicationObservationState: STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE
        }));
      }
    }
    const state = normalizeReasonCode(value.state);
    const failureReason = normalizeReasonCode(stryMutAct_9fa48("31335") ? value.failure?.reason && value.failureReason : stryMutAct_9fa48("31334") ? false : stryMutAct_9fa48("31333") ? true : (stryCov_9fa48("31333", "31334", "31335"), (stryMutAct_9fa48("31336") ? value.failure.reason : (stryCov_9fa48("31336"), value.failure?.reason)) || value.failureReason));
    const publicationObservationState = normalizeReasonCode(stryMutAct_9fa48("31339") ? value.publication?.observationState && value.publicationObservationState : stryMutAct_9fa48("31338") ? false : stryMutAct_9fa48("31337") ? true : (stryCov_9fa48("31337", "31338", "31339"), (stryMutAct_9fa48("31340") ? value.publication.observationState : (stryCov_9fa48("31340"), value.publication?.observationState)) || value.publicationObservationState));
    const failure = buildStartupAuthorityFailureDetail(failureReason);
    const publication = buildStartupAuthorityPublicationDetail(publicationObservationState);
    return Object.freeze(stryMutAct_9fa48("31341") ? {} : (stryCov_9fa48("31341"), {
      state: stryMutAct_9fa48("31344") ? state && STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE : stryMutAct_9fa48("31343") ? false : stryMutAct_9fa48("31342") ? true : (stryCov_9fa48("31342", "31343", "31344"), state || STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE),
      authorityAvailable: stryMutAct_9fa48("31347") ? value.authorityAvailable !== true : stryMutAct_9fa48("31346") ? false : stryMutAct_9fa48("31345") ? true : (stryCov_9fa48("31345", "31346", "31347"), value.authorityAvailable === (stryMutAct_9fa48("31348") ? false : (stryCov_9fa48("31348"), true))),
      failure,
      publication,
      ...((stryMutAct_9fa48("31351") ? failure.state !== STARTUP_AUTHORITY_FAILURE_STATE.PRESENT : stryMutAct_9fa48("31350") ? false : stryMutAct_9fa48("31349") ? true : (stryCov_9fa48("31349", "31350", "31351"), failure.state === STARTUP_AUTHORITY_FAILURE_STATE.PRESENT)) ? stryMutAct_9fa48("31352") ? {} : (stryCov_9fa48("31352"), {
        failureReason
      }) : {}),
      publicationObservationState: publication.observationState
    }));
  }
}
class StartupRecoveryCoordinator {
  /**
   * @param {Object} [options={}]
   * @param {Object|null} [options.readinessState]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("31353")) {
      {}
    } else {
      stryCov_9fa48("31353");
      this.readinessState = stryMutAct_9fa48("31356") ? options.readinessState && null : stryMutAct_9fa48("31355") ? false : stryMutAct_9fa48("31354") ? true : (stryCov_9fa48("31354", "31355", "31356"), options.readinessState || null);
      this.now = (stryMutAct_9fa48("31359") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("31358") ? false : stryMutAct_9fa48("31357") ? true : (stryCov_9fa48("31357", "31358", "31359"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("31360") ? () => undefined : (stryCov_9fa48("31360"), () => Date.now());
    }
  }

  /**
   * @param {Object} [options={}]
   * @return {void}
   */
  syncOwnerDependencies(options = {}) {
    if (stryMutAct_9fa48("31361")) {
      {}
    } else {
      stryCov_9fa48("31361");
      if (stryMutAct_9fa48("31363") ? false : stryMutAct_9fa48("31362") ? true : (stryCov_9fa48("31362", "31363"), Object.hasOwn(options, STARTUP_RECOVERY_READINESS_STATE_OPTION))) {
        if (stryMutAct_9fa48("31364")) {
          {}
        } else {
          stryCov_9fa48("31364");
          this.readinessState = stryMutAct_9fa48("31367") ? options.readinessState && null : stryMutAct_9fa48("31366") ? false : stryMutAct_9fa48("31365") ? true : (stryCov_9fa48("31365", "31366", "31367"), options.readinessState || null);
        }
      }
    }
  }

  /**
   * @return {Object|null}
   */
  getSnapshot() {
    if (stryMutAct_9fa48("31368")) {
      {}
    } else {
      stryCov_9fa48("31368");
      return getTrafficReadinessSnapshot(this.readinessState);
    }
  }

  /**
   * @param {Object} [options={}]
   * @param {string|null} [options.partitionId]
   * @param {Object|null} [options.snapshot]
   * @return {Object}
   */
  evaluate(options = {}) {
    if (stryMutAct_9fa48("31369")) {
      {}
    } else {
      stryCov_9fa48("31369");
      const partitionId = normalizePartitionId(options.partitionId);
      const snapshot = stryMutAct_9fa48("31372") ? options.snapshot && this.getSnapshot() : stryMutAct_9fa48("31371") ? false : stryMutAct_9fa48("31370") ? true : (stryCov_9fa48("31370", "31371", "31372"), options.snapshot || this.getSnapshot());
      const capturedAtMs = this.now();
      const capturedAt = new Date(capturedAtMs).toISOString();
      const priorityRecoveryDetails = normalizePriorityRecoveryHealthDetails(stryMutAct_9fa48("31375") ? options.priorityRecoveryHealth?.details && options.priorityRecoveryDetails : stryMutAct_9fa48("31374") ? false : stryMutAct_9fa48("31373") ? true : (stryCov_9fa48("31373", "31374", "31375"), (stryMutAct_9fa48("31376") ? options.priorityRecoveryHealth.details : (stryCov_9fa48("31376"), options.priorityRecoveryHealth?.details)) || options.priorityRecoveryDetails));
      const startupAuthority = normalizeStartupAuthoritySnapshot(stryMutAct_9fa48("31379") ? (options.startupAuthority || options.priorityRecoveryHealth?.details?.startupAuthority) && null : stryMutAct_9fa48("31378") ? false : stryMutAct_9fa48("31377") ? true : (stryCov_9fa48("31377", "31378", "31379"), (stryMutAct_9fa48("31381") ? options.startupAuthority && options.priorityRecoveryHealth?.details?.startupAuthority : stryMutAct_9fa48("31380") ? false : (stryCov_9fa48("31380", "31381"), options.startupAuthority || (stryMutAct_9fa48("31383") ? options.priorityRecoveryHealth.details?.startupAuthority : stryMutAct_9fa48("31382") ? options.priorityRecoveryHealth?.details.startupAuthority : (stryCov_9fa48("31382", "31383"), options.priorityRecoveryHealth?.details?.startupAuthority)))) || null));
      const managed = Boolean(stryMutAct_9fa48("31386") ? snapshot || typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("31385") ? false : stryMutAct_9fa48("31384") ? true : (stryCov_9fa48("31384", "31385", "31386"), snapshot && (stryMutAct_9fa48("31388") ? typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("31387") ? true : (stryCov_9fa48("31387", "31388"), typeof snapshot === TYPEOF.OBJECT))));
      const readinessSnapshot = buildReadinessSnapshotDetail(managed ? snapshot : null);
      const phaseDetail = buildOptionalPhaseDetail((stryMutAct_9fa48("31391") ? typeof snapshot?.phase === TYPEOF.STRING || snapshot.phase.length > NUM.ZERO : stryMutAct_9fa48("31390") ? false : stryMutAct_9fa48("31389") ? true : (stryCov_9fa48("31389", "31390", "31391"), (stryMutAct_9fa48("31393") ? typeof snapshot?.phase !== TYPEOF.STRING : stryMutAct_9fa48("31392") ? true : (stryCov_9fa48("31392", "31393"), typeof (stryMutAct_9fa48("31394") ? snapshot.phase : (stryCov_9fa48("31394"), snapshot?.phase)) === TYPEOF.STRING)) && (stryMutAct_9fa48("31397") ? snapshot.phase.length <= NUM.ZERO : stryMutAct_9fa48("31396") ? snapshot.phase.length >= NUM.ZERO : stryMutAct_9fa48("31395") ? true : (stryCov_9fa48("31395", "31396", "31397"), snapshot.phase.length > NUM.ZERO)))) ? snapshot.phase : null);
      const retryAfter = buildOptionalRetryAfterDetail((stryMutAct_9fa48("31400") ? Number.isFinite(snapshot?.retryAfterMs) || snapshot.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("31399") ? false : stryMutAct_9fa48("31398") ? true : (stryCov_9fa48("31398", "31399", "31400"), Number.isFinite(stryMutAct_9fa48("31401") ? snapshot.retryAfterMs : (stryCov_9fa48("31401"), snapshot?.retryAfterMs)) && (stryMutAct_9fa48("31404") ? snapshot.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("31403") ? snapshot.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("31402") ? true : (stryCov_9fa48("31402", "31403", "31404"), snapshot.retryAfterMs > NUM.ZERO)))) ? Math.floor(snapshot.retryAfterMs) : null);
      const stableWindow = buildOptionalStableWindowDetail((stryMutAct_9fa48("31407") ? Number.isFinite(snapshot?.stableWindowMs) || snapshot.stableWindowMs >= NUM.ZERO : stryMutAct_9fa48("31406") ? false : stryMutAct_9fa48("31405") ? true : (stryCov_9fa48("31405", "31406", "31407"), Number.isFinite(stryMutAct_9fa48("31408") ? snapshot.stableWindowMs : (stryCov_9fa48("31408"), snapshot?.stableWindowMs)) && (stryMutAct_9fa48("31411") ? snapshot.stableWindowMs < NUM.ZERO : stryMutAct_9fa48("31410") ? snapshot.stableWindowMs > NUM.ZERO : stryMutAct_9fa48("31409") ? true : (stryCov_9fa48("31409", "31410", "31411"), snapshot.stableWindowMs >= NUM.ZERO)))) ? Math.floor(snapshot.stableWindowMs) : null);
      const stableElapsed = buildOptionalStableElapsedDetail((stryMutAct_9fa48("31414") ? Number.isFinite(snapshot?.stableElapsedMs) || snapshot.stableElapsedMs >= NUM.ZERO : stryMutAct_9fa48("31413") ? false : stryMutAct_9fa48("31412") ? true : (stryCov_9fa48("31412", "31413", "31414"), Number.isFinite(stryMutAct_9fa48("31415") ? snapshot.stableElapsedMs : (stryCov_9fa48("31415"), snapshot?.stableElapsedMs)) && (stryMutAct_9fa48("31418") ? snapshot.stableElapsedMs < NUM.ZERO : stryMutAct_9fa48("31417") ? snapshot.stableElapsedMs > NUM.ZERO : stryMutAct_9fa48("31416") ? true : (stryCov_9fa48("31416", "31417", "31418"), snapshot.stableElapsedMs >= NUM.ZERO)))) ? Math.floor(snapshot.stableElapsedMs) : null);
      const isPriorityControlPlanePartition = stryMutAct_9fa48("31421") ? partitionId !== null || isPriorityControlPlanePartitionId({
        partitionId
      }) : stryMutAct_9fa48("31420") ? false : stryMutAct_9fa48("31419") ? true : (stryCov_9fa48("31419", "31420", "31421"), (stryMutAct_9fa48("31423") ? partitionId === null : stryMutAct_9fa48("31422") ? true : (stryCov_9fa48("31422", "31423"), partitionId !== null)) && isPriorityControlPlanePartitionId(stryMutAct_9fa48("31424") ? {} : (stryCov_9fa48("31424"), {
        partitionId
      })));
      const trafficReady = managed ? isTrafficReadySnapshot(snapshot) : stryMutAct_9fa48("31425") ? false : (stryCov_9fa48("31425"), true);
      const metadataPublicationReady = managed ? isMetadataPublicationReadySnapshot(snapshot) : stryMutAct_9fa48("31426") ? false : (stryCov_9fa48("31426"), true);
      const reasonCodes = managed ? normalizeReasonCodes(snapshot) : stryMutAct_9fa48("31427") ? ["Stryker was here"] : (stryCov_9fa48("31427"), []);
      const startupAuthorityUnavailable = stryMutAct_9fa48("31430") ? startupAuthority?.state !== STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE : stryMutAct_9fa48("31429") ? false : stryMutAct_9fa48("31428") ? true : (stryCov_9fa48("31428", "31429", "31430"), (stryMutAct_9fa48("31431") ? startupAuthority.state : (stryCov_9fa48("31431"), startupAuthority?.state)) === STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE);
      const startupAuthorityBlocked = stryMutAct_9fa48("31434") ? startupAuthority?.state !== STARTUP_AUTHORITY_STATE.BLOCKED : stryMutAct_9fa48("31433") ? false : stryMutAct_9fa48("31432") ? true : (stryCov_9fa48("31432", "31433", "31434"), (stryMutAct_9fa48("31435") ? startupAuthority.state : (stryCov_9fa48("31435"), startupAuthority?.state)) === STARTUP_AUTHORITY_STATE.BLOCKED);
      const backgroundWorkReady = managed ? isBackgroundWorkReadySnapshot(snapshot, stryMutAct_9fa48("31436") ? {} : (stryCov_9fa48("31436"), {
        partitionId
      })) : stryMutAct_9fa48("31437") ? false : (stryCov_9fa48("31437"), true);
      const controlPlaneRecoveryReady = stryMutAct_9fa48("31440") ? (trafficReady || metadataPublicationReady) && !startupAuthorityUnavailable || !startupAuthorityBlocked : stryMutAct_9fa48("31439") ? false : stryMutAct_9fa48("31438") ? true : (stryCov_9fa48("31438", "31439", "31440"), (stryMutAct_9fa48("31442") ? trafficReady || metadataPublicationReady || !startupAuthorityUnavailable : stryMutAct_9fa48("31441") ? true : (stryCov_9fa48("31441", "31442"), (stryMutAct_9fa48("31444") ? trafficReady && metadataPublicationReady : stryMutAct_9fa48("31443") ? true : (stryCov_9fa48("31443", "31444"), trafficReady || metadataPublicationReady)) && (stryMutAct_9fa48("31445") ? startupAuthorityUnavailable : (stryCov_9fa48("31445"), !startupAuthorityUnavailable)))) && (stryMutAct_9fa48("31446") ? startupAuthorityBlocked : (stryCov_9fa48("31446"), !startupAuthorityBlocked)));
      const priorityControlPlaneRecoveryReady = stryMutAct_9fa48("31449") ? isPriorityControlPlanePartition || controlPlaneRecoveryReady : stryMutAct_9fa48("31448") ? false : stryMutAct_9fa48("31447") ? true : (stryCov_9fa48("31447", "31448", "31449"), isPriorityControlPlanePartition && controlPlaneRecoveryReady);
      const bootstrapInitPriorityBypassReady = stryMutAct_9fa48("31452") ? isPriorityControlPlanePartition && !startupAuthorityUnavailable && !startupAuthorityBlocked && options.allowBootstrapInitPriorityBypass === true || this.canBypassPriorityPartitionDuringBootstrapInit(reasonCodes, snapshot) : stryMutAct_9fa48("31451") ? false : stryMutAct_9fa48("31450") ? true : (stryCov_9fa48("31450", "31451", "31452"), (stryMutAct_9fa48("31454") ? isPriorityControlPlanePartition && !startupAuthorityUnavailable && !startupAuthorityBlocked || options.allowBootstrapInitPriorityBypass === true : stryMutAct_9fa48("31453") ? true : (stryCov_9fa48("31453", "31454"), (stryMutAct_9fa48("31456") ? isPriorityControlPlanePartition && !startupAuthorityUnavailable || !startupAuthorityBlocked : stryMutAct_9fa48("31455") ? true : (stryCov_9fa48("31455", "31456"), (stryMutAct_9fa48("31458") ? isPriorityControlPlanePartition || !startupAuthorityUnavailable : stryMutAct_9fa48("31457") ? true : (stryCov_9fa48("31457", "31458"), isPriorityControlPlanePartition && (stryMutAct_9fa48("31459") ? startupAuthorityUnavailable : (stryCov_9fa48("31459"), !startupAuthorityUnavailable)))) && (stryMutAct_9fa48("31460") ? startupAuthorityBlocked : (stryCov_9fa48("31460"), !startupAuthorityBlocked)))) && (stryMutAct_9fa48("31462") ? options.allowBootstrapInitPriorityBypass !== true : stryMutAct_9fa48("31461") ? true : (stryCov_9fa48("31461", "31462"), options.allowBootstrapInitPriorityBypass === (stryMutAct_9fa48("31463") ? false : (stryCov_9fa48("31463"), true)))))) && this.canBypassPriorityPartitionDuringBootstrapInit(reasonCodes, snapshot));
      const shouldBypassLocalPriorityControlPlaneStartupReadiness = Boolean(stryMutAct_9fa48("31466") ? priorityControlPlaneRecoveryReady && !trafficReady && bootstrapInitPriorityBypassReady : stryMutAct_9fa48("31465") ? false : stryMutAct_9fa48("31464") ? true : (stryCov_9fa48("31464", "31465", "31466"), (stryMutAct_9fa48("31468") ? priorityControlPlaneRecoveryReady || !trafficReady : stryMutAct_9fa48("31467") ? false : (stryCov_9fa48("31467", "31468"), priorityControlPlaneRecoveryReady && (stryMutAct_9fa48("31469") ? trafficReady : (stryCov_9fa48("31469"), !trafficReady)))) || bootstrapInitPriorityBypassReady));
      const recoveryStage = resolveStartupRecoveryStage(stryMutAct_9fa48("31470") ? {} : (stryCov_9fa48("31470"), {
        managed,
        trafficReady,
        backgroundWorkReady,
        controlPlaneRecoveryReady
      }));
      const recoveryStageRank = stryMutAct_9fa48("31473") ? STARTUP_RECOVERY_STAGE_RANK[recoveryStage] && NUM.ZERO : stryMutAct_9fa48("31472") ? false : stryMutAct_9fa48("31471") ? true : (stryCov_9fa48("31471", "31472", "31473"), STARTUP_RECOVERY_STAGE_RANK[recoveryStage] || NUM.ZERO);
      return Object.freeze(stryMutAct_9fa48("31474") ? {} : (stryCov_9fa48("31474"), {
        schemaVersion: NUM.ONE,
        capturedAt,
        capturedAtMs,
        managed,
        readinessSnapshot,
        partitionId,
        phaseDetail,
        ready: stryMutAct_9fa48("31477") ? snapshot?.ready !== true : stryMutAct_9fa48("31476") ? false : stryMutAct_9fa48("31475") ? true : (stryCov_9fa48("31475", "31476", "31477"), (stryMutAct_9fa48("31478") ? snapshot.ready : (stryCov_9fa48("31478"), snapshot?.ready)) === (stryMutAct_9fa48("31479") ? false : (stryCov_9fa48("31479"), true))),
        draining: stryMutAct_9fa48("31482") ? snapshot?.draining !== true : stryMutAct_9fa48("31481") ? false : stryMutAct_9fa48("31480") ? true : (stryCov_9fa48("31480", "31481", "31482"), (stryMutAct_9fa48("31483") ? snapshot.draining : (stryCov_9fa48("31483"), snapshot?.draining)) === (stryMutAct_9fa48("31484") ? false : (stryCov_9fa48("31484"), true))),
        reasonCodes,
        retryAfter,
        stableWindow,
        stableElapsed,
        isPriorityControlPlanePartition,
        trafficReady,
        metadataPublicationReady,
        backgroundWorkReady,
        controlPlaneRecoveryReady,
        priorityControlPlaneRecoveryReady,
        recoveryProtocolDetail: priorityRecoveryDetails.recoveryProtocol,
        targetParticipationDetail: priorityRecoveryDetails.targetParticipation,
        priorityRecoveryReasonCodes: priorityRecoveryDetails.priorityRecoveryReasonCodes,
        startupAuthorityState: startupAuthority.state,
        startupAuthorityAvailable: stryMutAct_9fa48("31487") ? startupAuthority.authorityAvailable !== true : stryMutAct_9fa48("31486") ? false : stryMutAct_9fa48("31485") ? true : (stryCov_9fa48("31485", "31486", "31487"), startupAuthority.authorityAvailable === (stryMutAct_9fa48("31488") ? false : (stryCov_9fa48("31488"), true))),
        startupAuthorityFailure: startupAuthority.failure,
        startupAuthorityPublication: startupAuthority.publication,
        ...((stryMutAct_9fa48("31491") ? startupAuthority.failure.state !== STARTUP_AUTHORITY_FAILURE_STATE.PRESENT : stryMutAct_9fa48("31490") ? false : stryMutAct_9fa48("31489") ? true : (stryCov_9fa48("31489", "31490", "31491"), startupAuthority.failure.state === STARTUP_AUTHORITY_FAILURE_STATE.PRESENT)) ? stryMutAct_9fa48("31492") ? {} : (stryCov_9fa48("31492"), {
          startupAuthorityFailureReason: startupAuthority.failure.reason
        }) : {}),
        publicationObservationState: startupAuthority.publication.observationState,
        bootstrapInitPriorityBypassReady,
        recoveryStage,
        recoveryStageRank,
        recoveryBlocked: stryMutAct_9fa48("31495") ? managed === true || controlPlaneRecoveryReady !== true : stryMutAct_9fa48("31494") ? false : stryMutAct_9fa48("31493") ? true : (stryCov_9fa48("31493", "31494", "31495"), (stryMutAct_9fa48("31497") ? managed !== true : stryMutAct_9fa48("31496") ? true : (stryCov_9fa48("31496", "31497"), managed === (stryMutAct_9fa48("31498") ? false : (stryCov_9fa48("31498"), true)))) && (stryMutAct_9fa48("31500") ? controlPlaneRecoveryReady === true : stryMutAct_9fa48("31499") ? true : (stryCov_9fa48("31499", "31500"), controlPlaneRecoveryReady !== (stryMutAct_9fa48("31501") ? false : (stryCov_9fa48("31501"), true))))),
        shouldBypassLocalPriorityControlPlaneStartupReadiness,
        ...((stryMutAct_9fa48("31504") ? phaseDetail.state !== STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT : stryMutAct_9fa48("31503") ? false : stryMutAct_9fa48("31502") ? true : (stryCov_9fa48("31502", "31503", "31504"), phaseDetail.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT)) ? stryMutAct_9fa48("31505") ? {} : (stryCov_9fa48("31505"), {
          phase: phaseDetail.phase
        }) : {}),
        ...((stryMutAct_9fa48("31508") ? retryAfter.state !== STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT : stryMutAct_9fa48("31507") ? false : stryMutAct_9fa48("31506") ? true : (stryCov_9fa48("31506", "31507", "31508"), retryAfter.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT)) ? stryMutAct_9fa48("31509") ? {} : (stryCov_9fa48("31509"), {
          retryAfterMs: retryAfter.retryAfterMs
        }) : {}),
        ...((stryMutAct_9fa48("31512") ? stableWindow.state !== STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT : stryMutAct_9fa48("31511") ? false : stryMutAct_9fa48("31510") ? true : (stryCov_9fa48("31510", "31511", "31512"), stableWindow.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT)) ? stryMutAct_9fa48("31513") ? {} : (stryCov_9fa48("31513"), {
          stableWindowMs: stableWindow.stableWindowMs
        }) : {}),
        ...((stryMutAct_9fa48("31516") ? stableElapsed.state !== STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT : stryMutAct_9fa48("31515") ? false : stryMutAct_9fa48("31514") ? true : (stryCov_9fa48("31514", "31515", "31516"), stableElapsed.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT)) ? stryMutAct_9fa48("31517") ? {} : (stryCov_9fa48("31517"), {
          stableElapsedMs: stableElapsed.stableElapsedMs
        }) : {}),
        ...((stryMutAct_9fa48("31520") ? priorityRecoveryDetails.recoveryProtocol.state !== STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT : stryMutAct_9fa48("31519") ? false : stryMutAct_9fa48("31518") ? true : (stryCov_9fa48("31518", "31519", "31520"), priorityRecoveryDetails.recoveryProtocol.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT)) ? stryMutAct_9fa48("31521") ? {} : (stryCov_9fa48("31521"), {
          recoveryProtocolState: priorityRecoveryDetails.recoveryProtocol.recoveryProtocolState
        }) : {}),
        ...((stryMutAct_9fa48("31524") ? priorityRecoveryDetails.targetParticipation.state !== STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT : stryMutAct_9fa48("31523") ? false : stryMutAct_9fa48("31522") ? true : (stryCov_9fa48("31522", "31523", "31524"), priorityRecoveryDetails.targetParticipation.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT)) ? stryMutAct_9fa48("31525") ? {} : (stryCov_9fa48("31525"), {
          targetParticipation: priorityRecoveryDetails.targetParticipation.targetParticipation
        }) : {}),
        ...((stryMutAct_9fa48("31528") ? readinessSnapshot.state !== STARTUP_RECOVERY_SNAPSHOT_STATE.MANAGED : stryMutAct_9fa48("31527") ? false : stryMutAct_9fa48("31526") ? true : (stryCov_9fa48("31526", "31527", "31528"), readinessSnapshot.state === STARTUP_RECOVERY_SNAPSHOT_STATE.MANAGED)) ? stryMutAct_9fa48("31529") ? {} : (stryCov_9fa48("31529"), {
          snapshot
        }) : {})
      }));
    }
  }
  canBypassPriorityPartitionDuringBootstrapInit(reasonCodes, snapshot) {
    if (stryMutAct_9fa48("31530")) {
      {}
    } else {
      stryCov_9fa48("31530");
      return canBypassBootstrapInitPriorityReasons(reasonCodes, snapshot);
    }
  }
}
export { BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS, STARTUP_RECOVERY_STAGE, StartupRecoveryCoordinator, canBypassBootstrapInitPriorityReasons };