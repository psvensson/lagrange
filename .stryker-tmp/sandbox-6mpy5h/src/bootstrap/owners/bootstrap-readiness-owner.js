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
import { HTTP_STATUS, NUM, TYPEOF } from '../../constants/index.js';
import { BOOTSTRAP_PHASE, BOOTSTRAP_PIPELINE_ERROR_CODE } from '../bootstrap-constants.js';
import { BOOTSTRAP_API_LIVENESS, BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_PROBE_REASON, BOOTSTRAP_API_PROBE_SCOPE, BOOTSTRAP_API_ROUTE } from '../bootstrap-api-constants.js';
import { READINESS_DEPENDENCY } from '../bootstrap-readiness-state-constants.js';
import { LIFECYCLE_DEPENDENCY_CLASS, LIFECYCLE_DEPENDENCY_DEMOTION_POLICY, LIFECYCLE_PHASE, LIFECYCLE_REASON } from '../lifecycle-controller-constants.js';
import { getLocalQueryTransportReadiness, isLocalQueryTransportReady } from '../shared/local-query-transport-readiness.js';
import { buildPublicationRecoveryProtocolSnapshot } from '../../control-plane/recovery-protocol-snapshot.js';
import { canBypassBootstrapInitPriorityReasons } from '../startup-recovery-coordinator.js';
const BOOTSTRAP_READINESS_OWNER_LITERAL = Object.freeze(stryMutAct_9fa48("19645") ? {} : (stryCov_9fa48("19645"), {
  STARTING: stryMutAct_9fa48("19646") ? "" : (stryCov_9fa48("19646"), "starting"),
  BOOTSTRAPPING: stryMutAct_9fa48("19647") ? "" : (stryCov_9fa48("19647"), "bootstrapping"),
  WARMING: stryMutAct_9fa48("19648") ? "" : (stryCov_9fa48("19648"), "warming"),
  JOIN_READY: stryMutAct_9fa48("19649") ? "" : (stryCov_9fa48("19649"), "join_ready"),
  DEGRADED: stryMutAct_9fa48("19650") ? "" : (stryCov_9fa48("19650"), "degraded"),
  READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING: stryMutAct_9fa48("19651") ? "" : (stryCov_9fa48("19651"), "Readiness probe async diagnostics timed out; using "),
  SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK: stryMutAct_9fa48("19652") ? "" : (stryCov_9fa48("19652"), "synchronous readiness snapshot fallback"),
  AUTHORITY_UNAVAILABLE: stryMutAct_9fa48("19653") ? "" : (stryCov_9fa48("19653"), "authority_unavailable"),
  NONE: stryMutAct_9fa48("19654") ? "" : (stryCov_9fa48("19654"), "none"),
  PRESENT: stryMutAct_9fa48("19655") ? "" : (stryCov_9fa48("19655"), "present"),
  OBSERVATION_UNAVAILABLE: stryMutAct_9fa48("19656") ? "" : (stryCov_9fa48("19656"), "observation_unavailable"),
  DEGRADED_2: stryMutAct_9fa48("19657") ? "" : (stryCov_9fa48("19657"), "DEGRADED"),
  MISSINGPARTITIONLEADERS: stryMutAct_9fa48("19658") ? "" : (stryCov_9fa48("19658"), "missingPartitionLeaders"),
  MISSINGPARTITIONLEADERNODES: stryMutAct_9fa48("19659") ? "" : (stryCov_9fa48("19659"), "missingPartitionLeaderNodes"),
  MISSINGPARTITIONLEADERADDRESSES: stryMutAct_9fa48("19660") ? "" : (stryCov_9fa48("19660"), "missingPartitionLeaderAddresses"),
  MISSINGMESSAGEGROUPLEADERS: stryMutAct_9fa48("19661") ? "" : (stryCov_9fa48("19661"), "missingMessageGroupLeaders"),
  MISSINGMESSAGEGROUPLEADERNODES: stryMutAct_9fa48("19662") ? "" : (stryCov_9fa48("19662"), "missingMessageGroupLeaderNodes"),
  MISSINGMESSAGEGROUPLEADERADDRESSES: stryMutAct_9fa48("19663") ? "" : (stryCov_9fa48("19663"), "missingMessageGroupLeaderAddresses")
}));
const BOOTSTRAP_READINESS_DEPENDENCY = Object.freeze(stryMutAct_9fa48("19664") ? {} : (stryCov_9fa48("19664"), {
  SQL_ENGINE_READY: stryMutAct_9fa48("19665") ? "" : (stryCov_9fa48("19665"), 'sql_engine_ready'),
  LEADER_METADATA_READY: stryMutAct_9fa48("19666") ? "" : (stryCov_9fa48("19666"), 'leader_metadata_ready'),
  RUNTIME_WIRING_READY: stryMutAct_9fa48("19667") ? "" : (stryCov_9fa48("19667"), 'runtime_wiring_ready'),
  LOCAL_QUERY_TRANSPORT_READY: stryMutAct_9fa48("19668") ? "" : (stryCov_9fa48("19668"), 'local_query_transport_ready'),
  CONTROL_PLANE_WRITE_HEALTH: stryMutAct_9fa48("19669") ? "" : (stryCov_9fa48("19669"), 'control_plane_write_health'),
  PRIORITY_CONTROL_PLANE_RECOVERY: stryMutAct_9fa48("19670") ? "" : (stryCov_9fa48("19670"), 'priority_control_plane_recovery')
}));
const BOOTSTRAP_JOIN_NON_BLOCKING_REASONS = Object.freeze(stryMutAct_9fa48("19671") ? [] : (stryCov_9fa48("19671"), [BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE, LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]));
const BOOTSTRAP_JOIN_NON_BLOCKING_REASON_SET = new Set(BOOTSTRAP_JOIN_NON_BLOCKING_REASONS);
const BOOTSTRAP_JOIN_PROJECTION_RULE = Object.freeze(stryMutAct_9fa48("19672") ? {} : (stryCov_9fa48("19672"), {
  ALREADY_READY: stryMutAct_9fa48("19673") ? "" : (stryCov_9fa48("19673"), 'already_ready'),
  JOIN_STABLE_WINDOW: stryMutAct_9fa48("19674") ? "" : (stryCov_9fa48("19674"), 'join_stable_window'),
  INIT_PRIORITY_BYPASS: stryMutAct_9fa48("19675") ? "" : (stryCov_9fa48("19675"), 'init_priority_bypass'),
  CONTROL_DEGRADED_NON_BLOCKING: stryMutAct_9fa48("19676") ? "" : (stryCov_9fa48("19676"), 'control_degraded_non_blocking')
}));
const BOOTSTRAP_JOIN_PROJECTION_BLOCKER = Object.freeze(stryMutAct_9fa48("19677") ? {} : (stryCov_9fa48("19677"), {
  DRAINING: stryMutAct_9fa48("19678") ? "" : (stryCov_9fa48("19678"), 'draining'),
  PHASE_NOT_ELIGIBLE: stryMutAct_9fa48("19679") ? "" : (stryCov_9fa48("19679"), 'phase_not_eligible'),
  CONTROL_SNAPSHOT_AUTHORITY_UNAVAILABLE: stryMutAct_9fa48("19680") ? "" : (stryCov_9fa48("19680"), 'control_snapshot_authority_unavailable'),
  JOIN_STABLE_WINDOW_REASONS: stryMutAct_9fa48("19681") ? "" : (stryCov_9fa48("19681"), 'join_stable_window_reasons'),
  INIT_PRIORITY_BYPASS_REJECTED: stryMutAct_9fa48("19682") ? "" : (stryCov_9fa48("19682"), 'init_priority_bypass_rejected'),
  CONTROL_DEGRADED_NO_REASONS: stryMutAct_9fa48("19683") ? "" : (stryCov_9fa48("19683"), 'control_degraded_no_reasons'),
  CONTROL_DEGRADED_BLOCKING_REASONS: stryMutAct_9fa48("19684") ? "" : (stryCov_9fa48("19684"), 'control_degraded_blocking_reasons')
}));
function normalizeReasonCode(reason) {
  if (stryMutAct_9fa48("19685")) {
    {}
  } else {
    stryCov_9fa48("19685");
    if (stryMutAct_9fa48("19688") ? typeof reason === TYPEOF.STRING : stryMutAct_9fa48("19687") ? false : stryMutAct_9fa48("19686") ? true : (stryCov_9fa48("19686", "19687", "19688"), typeof reason !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("19689")) {
        {}
      } else {
        stryCov_9fa48("19689");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("19690") ? reason : (stryCov_9fa48("19690"), reason.trim());
    return (stryMutAct_9fa48("19694") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("19693") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("19692") ? false : stryMutAct_9fa48("19691") ? true : (stryCov_9fa48("19691", "19692", "19693", "19694"), normalized.length > NUM.ZERO)) ? normalized : null;
  }
}
function normalizeReasonCodeArray(reasonCodes) {
  if (stryMutAct_9fa48("19695")) {
    {}
  } else {
    stryCov_9fa48("19695");
    if (stryMutAct_9fa48("19698") ? false : stryMutAct_9fa48("19697") ? true : stryMutAct_9fa48("19696") ? Array.isArray(reasonCodes) : (stryCov_9fa48("19696", "19697", "19698"), !Array.isArray(reasonCodes))) {
      if (stryMutAct_9fa48("19699")) {
        {}
      } else {
        stryCov_9fa48("19699");
        return stryMutAct_9fa48("19700") ? ["Stryker was here"] : (stryCov_9fa48("19700"), []);
      }
    }
    return stryMutAct_9fa48("19701") ? [] : (stryCov_9fa48("19701"), [...new Set(stryMutAct_9fa48("19702") ? reasonCodes.map(reason => normalizeReasonCode(reason)) : (stryCov_9fa48("19702"), reasonCodes.map(stryMutAct_9fa48("19703") ? () => undefined : (stryCov_9fa48("19703"), reason => normalizeReasonCode(reason))).filter(stryMutAct_9fa48("19704") ? () => undefined : (stryCov_9fa48("19704"), reason => stryMutAct_9fa48("19707") ? reason === null : stryMutAct_9fa48("19706") ? false : stryMutAct_9fa48("19705") ? true : (stryCov_9fa48("19705", "19706", "19707"), reason !== null)))))]);
  }
}
function normalizeLifecyclePhaseFromSnapshot(snapshot) {
  if (stryMutAct_9fa48("19708")) {
    {}
  } else {
    stryCov_9fa48("19708");
    const phase = (stryMutAct_9fa48("19711") ? typeof snapshot?.phase !== TYPEOF.STRING : stryMutAct_9fa48("19710") ? false : stryMutAct_9fa48("19709") ? true : (stryCov_9fa48("19709", "19710", "19711"), typeof (stryMutAct_9fa48("19712") ? snapshot.phase : (stryCov_9fa48("19712"), snapshot?.phase)) === TYPEOF.STRING)) ? stryMutAct_9fa48("19714") ? snapshot.phase.toUpperCase() : stryMutAct_9fa48("19713") ? snapshot.phase.trim().toLowerCase() : (stryCov_9fa48("19713", "19714"), snapshot.phase.trim().toUpperCase()) : stryMutAct_9fa48("19715") ? "Stryker was here!" : (stryCov_9fa48("19715"), '');
    if (stryMutAct_9fa48("19717") ? false : stryMutAct_9fa48("19716") ? true : (stryCov_9fa48("19716", "19717"), Object.values(LIFECYCLE_PHASE).includes(phase))) {
      if (stryMutAct_9fa48("19718")) {
        {}
      } else {
        stryCov_9fa48("19718");
        return phase;
      }
    }
    const legacyState = (stryMutAct_9fa48("19721") ? typeof snapshot?.state !== TYPEOF.STRING : stryMutAct_9fa48("19720") ? false : stryMutAct_9fa48("19719") ? true : (stryCov_9fa48("19719", "19720", "19721"), typeof (stryMutAct_9fa48("19722") ? snapshot.state : (stryCov_9fa48("19722"), snapshot?.state)) === TYPEOF.STRING)) ? stryMutAct_9fa48("19724") ? snapshot.state.toLowerCase() : stryMutAct_9fa48("19723") ? snapshot.state.trim().toUpperCase() : (stryCov_9fa48("19723", "19724"), snapshot.state.trim().toLowerCase()) : stryMutAct_9fa48("19725") ? "Stryker was here!" : (stryCov_9fa48("19725"), '');
    switch (legacyState) {
      case BOOTSTRAP_READINESS_OWNER_LITERAL.STARTING:
      case BOOTSTRAP_READINESS_OWNER_LITERAL.BOOTSTRAPPING:
        if (stryMutAct_9fa48("19726")) {} else {
          stryCov_9fa48("19726");
          return LIFECYCLE_PHASE.INIT;
        }
      case BOOTSTRAP_READINESS_OWNER_LITERAL.WARMING:
        if (stryMutAct_9fa48("19727")) {} else {
          stryCov_9fa48("19727");
          return LIFECYCLE_PHASE.CONTROL_READY;
        }
      case BOOTSTRAP_READINESS_OWNER_LITERAL.JOIN_READY:
        if (stryMutAct_9fa48("19728")) {} else {
          stryCov_9fa48("19728");
          return LIFECYCLE_PHASE.JOIN_READY;
        }
      case BOOTSTRAP_READINESS_OWNER_LITERAL.DEGRADED:
        if (stryMutAct_9fa48("19729")) {} else {
          stryCov_9fa48("19729");
          return LIFECYCLE_PHASE.DEGRADED;
        }
      default:
        if (stryMutAct_9fa48("19730")) {} else {
          stryCov_9fa48("19730");
          return null;
        }
    }
  }
}
function hasBootstrapJoinAuthority(priorityRecoveryHealth) {
  if (stryMutAct_9fa48("19731")) {
    {}
  } else {
    stryCov_9fa48("19731");
    if (stryMutAct_9fa48("19734") ? !priorityRecoveryHealth && typeof priorityRecoveryHealth !== TYPEOF.OBJECT : stryMutAct_9fa48("19733") ? false : stryMutAct_9fa48("19732") ? true : (stryCov_9fa48("19732", "19733", "19734"), (stryMutAct_9fa48("19735") ? priorityRecoveryHealth : (stryCov_9fa48("19735"), !priorityRecoveryHealth)) || (stryMutAct_9fa48("19737") ? typeof priorityRecoveryHealth === TYPEOF.OBJECT : stryMutAct_9fa48("19736") ? false : (stryCov_9fa48("19736", "19737"), typeof priorityRecoveryHealth !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("19738")) {
        {}
      } else {
        stryCov_9fa48("19738");
        return stryMutAct_9fa48("19739") ? true : (stryCov_9fa48("19739"), false);
      }
    }
    if (stryMutAct_9fa48("19742") ? priorityRecoveryHealth.healthy !== true : stryMutAct_9fa48("19741") ? false : stryMutAct_9fa48("19740") ? true : (stryCov_9fa48("19740", "19741", "19742"), priorityRecoveryHealth.healthy === (stryMutAct_9fa48("19743") ? false : (stryCov_9fa48("19743"), true)))) {
      if (stryMutAct_9fa48("19744")) {
        {}
      } else {
        stryCov_9fa48("19744");
        return stryMutAct_9fa48("19745") ? false : (stryCov_9fa48("19745"), true);
      }
    }
    return stryMutAct_9fa48("19748") ? (!priorityRecoveryHealth.details || typeof priorityRecoveryHealth.details !== TYPEOF.OBJECT || typeof priorityRecoveryHealth.details.failureReason !== TYPEOF.STRING) && priorityRecoveryHealth.details.failureReason.length === NUM.ZERO : stryMutAct_9fa48("19747") ? false : stryMutAct_9fa48("19746") ? true : (stryCov_9fa48("19746", "19747", "19748"), (stryMutAct_9fa48("19750") ? (!priorityRecoveryHealth.details || typeof priorityRecoveryHealth.details !== TYPEOF.OBJECT) && typeof priorityRecoveryHealth.details.failureReason !== TYPEOF.STRING : stryMutAct_9fa48("19749") ? false : (stryCov_9fa48("19749", "19750"), (stryMutAct_9fa48("19752") ? !priorityRecoveryHealth.details && typeof priorityRecoveryHealth.details !== TYPEOF.OBJECT : stryMutAct_9fa48("19751") ? false : (stryCov_9fa48("19751", "19752"), (stryMutAct_9fa48("19753") ? priorityRecoveryHealth.details : (stryCov_9fa48("19753"), !priorityRecoveryHealth.details)) || (stryMutAct_9fa48("19755") ? typeof priorityRecoveryHealth.details === TYPEOF.OBJECT : stryMutAct_9fa48("19754") ? false : (stryCov_9fa48("19754", "19755"), typeof priorityRecoveryHealth.details !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("19757") ? typeof priorityRecoveryHealth.details.failureReason === TYPEOF.STRING : stryMutAct_9fa48("19756") ? false : (stryCov_9fa48("19756", "19757"), typeof priorityRecoveryHealth.details.failureReason !== TYPEOF.STRING)))) || (stryMutAct_9fa48("19759") ? priorityRecoveryHealth.details.failureReason.length !== NUM.ZERO : stryMutAct_9fa48("19758") ? false : (stryCov_9fa48("19758", "19759"), priorityRecoveryHealth.details.failureReason.length === NUM.ZERO)));
  }
}
const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze(stryMutAct_9fa48("19760") ? {} : (stryCov_9fa48("19760"), {
  SERVICE_UNAVAILABLE: stryMutAct_9fa48("19761") ? "" : (stryCov_9fa48("19761"), 'control_plane_recovery_service_unavailable'),
  DIAGNOSTICS_PROVIDER_UNAVAILABLE: stryMutAct_9fa48("19762") ? "" : (stryCov_9fa48("19762"), 'control_plane_recovery_diagnostics_provider_unavailable'),
  DIAGNOSTICS_READ_FAILED: stryMutAct_9fa48("19763") ? "" : (stryCov_9fa48("19763"), 'control_plane_recovery_diagnostics_read_failed'),
  DIAGNOSTICS_UNAVAILABLE: stryMutAct_9fa48("19764") ? "" : (stryCov_9fa48("19764"), 'control_plane_recovery_diagnostics_unavailable'),
  DIAGNOSTICS_INCOMPLETE: stryMutAct_9fa48("19765") ? "" : (stryCov_9fa48("19765"), 'control_plane_recovery_diagnostics_incomplete')
}));
const READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE = stryMutAct_9fa48("19766") ? "" : (stryCov_9fa48("19766"), 'READINESS_PROBE_ASYNC_TIMEOUT');
const READINESS_PROBE_ASYNC_TIMEOUT_MS = 250;
function buildBootstrapJoinProjectionResult(options = {}) {
  if (stryMutAct_9fa48("19767")) {
    {}
  } else {
    stryCov_9fa48("19767");
    return stryMutAct_9fa48("19768") ? {} : (stryCov_9fa48("19768"), {
      canProjectReady: stryMutAct_9fa48("19771") ? options.canProjectReady !== true : stryMutAct_9fa48("19770") ? false : stryMutAct_9fa48("19769") ? true : (stryCov_9fa48("19769", "19770", "19771"), options.canProjectReady === (stryMutAct_9fa48("19772") ? false : (stryCov_9fa48("19772"), true))),
      projectionRule: stryMutAct_9fa48("19775") ? options.projectionRule && null : stryMutAct_9fa48("19774") ? false : stryMutAct_9fa48("19773") ? true : (stryCov_9fa48("19773", "19774", "19775"), options.projectionRule || null),
      blockerReason: stryMutAct_9fa48("19778") ? options.blockerReason && null : stryMutAct_9fa48("19777") ? false : stryMutAct_9fa48("19776") ? true : (stryCov_9fa48("19776", "19777", "19778"), options.blockerReason || null),
      normalizedPhase: stryMutAct_9fa48("19781") ? options.normalizedPhase && null : stryMutAct_9fa48("19780") ? false : stryMutAct_9fa48("19779") ? true : (stryCov_9fa48("19779", "19780", "19781"), options.normalizedPhase || null),
      reasons: Array.isArray(options.reasons) ? options.reasons : stryMutAct_9fa48("19782") ? ["Stryker was here"] : (stryCov_9fa48("19782"), []),
      blockingReasons: Array.isArray(options.blockingReasons) ? options.blockingReasons : stryMutAct_9fa48("19783") ? ["Stryker was here"] : (stryCov_9fa48("19783"), [])
    });
  }
}
function resolveControlPhaseBootstrapJoinProjection(normalizedReasons, blockingReasons) {
  if (stryMutAct_9fa48("19784")) {
    {}
  } else {
    stryCov_9fa48("19784");
    if (stryMutAct_9fa48("19787") ? normalizedReasons.length !== NUM.ZERO : stryMutAct_9fa48("19786") ? false : stryMutAct_9fa48("19785") ? true : (stryCov_9fa48("19785", "19786", "19787"), normalizedReasons.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("19788")) {
        {}
      } else {
        stryCov_9fa48("19788");
        return buildBootstrapJoinProjectionResult(stryMutAct_9fa48("19789") ? {} : (stryCov_9fa48("19789"), {
          blockerReason: BOOTSTRAP_JOIN_PROJECTION_BLOCKER.CONTROL_DEGRADED_NO_REASONS
        }));
      }
    }
    const canProjectFromControlPhase = stryMutAct_9fa48("19792") ? blockingReasons.length !== NUM.ZERO : stryMutAct_9fa48("19791") ? false : stryMutAct_9fa48("19790") ? true : (stryCov_9fa48("19790", "19791", "19792"), blockingReasons.length === NUM.ZERO);
    return buildBootstrapJoinProjectionResult(stryMutAct_9fa48("19793") ? {} : (stryCov_9fa48("19793"), {
      canProjectReady: canProjectFromControlPhase,
      projectionRule: canProjectFromControlPhase ? BOOTSTRAP_JOIN_PROJECTION_RULE.CONTROL_DEGRADED_NON_BLOCKING : null,
      blockerReason: canProjectFromControlPhase ? null : BOOTSTRAP_JOIN_PROJECTION_BLOCKER.CONTROL_DEGRADED_BLOCKING_REASONS
    }));
  }
}
class BootstrapReadinessOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("19794")) {
      {}
    } else {
      stryCov_9fa48("19794");
      this.delegates = stryMutAct_9fa48("19797") ? options.delegates && {} : stryMutAct_9fa48("19796") ? false : stryMutAct_9fa48("19795") ? true : (stryCov_9fa48("19795", "19796", "19797"), options.delegates || {});
      this.lastBootstrapJoinBlockedSignature = null;
      this.lastBootstrapJoinProjectionEvaluation = null;
    }
  }
  getSeedNodeId() {
    if (stryMutAct_9fa48("19798")) {
      {}
    } else {
      stryCov_9fa48("19798");
      return stryMutAct_9fa48("19801") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("19800") ? false : stryMutAct_9fa48("19799") ? true : (stryCov_9fa48("19799", "19800", "19801"), (stryMutAct_9fa48("19802") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("19802"), this.delegates.getSeedNodeId?.())) || null);
    }
  }
  getReadinessState() {
    if (stryMutAct_9fa48("19803")) {
      {}
    } else {
      stryCov_9fa48("19803");
      return stryMutAct_9fa48("19806") ? this.delegates.getReadinessState?.() && null : stryMutAct_9fa48("19805") ? false : stryMutAct_9fa48("19804") ? true : (stryCov_9fa48("19804", "19805", "19806"), (stryMutAct_9fa48("19807") ? this.delegates.getReadinessState() : (stryCov_9fa48("19807"), this.delegates.getReadinessState?.())) || null);
    }
  }
  getBootstrapService() {
    if (stryMutAct_9fa48("19808")) {
      {}
    } else {
      stryCov_9fa48("19808");
      return stryMutAct_9fa48("19811") ? this.delegates.getBootstrapService?.() && null : stryMutAct_9fa48("19810") ? false : stryMutAct_9fa48("19809") ? true : (stryCov_9fa48("19809", "19810", "19811"), (stryMutAct_9fa48("19812") ? this.delegates.getBootstrapService() : (stryCov_9fa48("19812"), this.delegates.getBootstrapService?.())) || null);
    }
  }
  getMessageRouter() {
    if (stryMutAct_9fa48("19813")) {
      {}
    } else {
      stryCov_9fa48("19813");
      return stryMutAct_9fa48("19816") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("19815") ? false : stryMutAct_9fa48("19814") ? true : (stryCov_9fa48("19814", "19815", "19816"), (stryMutAct_9fa48("19817") ? this.delegates.getMessageRouter() : (stryCov_9fa48("19817"), this.delegates.getMessageRouter?.())) || null);
    }
  }
  getSqlQueryEngine() {
    if (stryMutAct_9fa48("19818")) {
      {}
    } else {
      stryCov_9fa48("19818");
      return stryMutAct_9fa48("19821") ? this.delegates.getSqlQueryEngine?.() && null : stryMutAct_9fa48("19820") ? false : stryMutAct_9fa48("19819") ? true : (stryCov_9fa48("19819", "19820", "19821"), (stryMutAct_9fa48("19822") ? this.delegates.getSqlQueryEngine() : (stryCov_9fa48("19822"), this.delegates.getSqlQueryEngine?.())) || null);
    }
  }
  getControlPlaneReadinessService() {
    if (stryMutAct_9fa48("19823")) {
      {}
    } else {
      stryCov_9fa48("19823");
      return stryMutAct_9fa48("19826") ? this.delegates.getControlPlaneReadinessService?.() && null : stryMutAct_9fa48("19825") ? false : stryMutAct_9fa48("19824") ? true : (stryCov_9fa48("19824", "19825", "19826"), (stryMutAct_9fa48("19827") ? this.delegates.getControlPlaneReadinessService() : (stryCov_9fa48("19827"), this.delegates.getControlPlaneReadinessService?.())) || null);
    }
  }
  getControlPlaneWriteHealthProvider() {
    if (stryMutAct_9fa48("19828")) {
      {}
    } else {
      stryCov_9fa48("19828");
      return stryMutAct_9fa48("19831") ? this.delegates.getControlPlaneWriteHealthProvider?.() && null : stryMutAct_9fa48("19830") ? false : stryMutAct_9fa48("19829") ? true : (stryCov_9fa48("19829", "19830", "19831"), (stryMutAct_9fa48("19832") ? this.delegates.getControlPlaneWriteHealthProvider() : (stryCov_9fa48("19832"), this.delegates.getControlPlaneWriteHealthProvider?.())) || null);
    }
  }
  getLeaderReadinessStatusForProbe() {
    if (stryMutAct_9fa48("19833")) {
      {}
    } else {
      stryCov_9fa48("19833");
      return stryMutAct_9fa48("19836") ? this.delegates.getLeaderReadinessStatusForProbe?.() && {
        ready: false
      } : stryMutAct_9fa48("19835") ? false : stryMutAct_9fa48("19834") ? true : (stryCov_9fa48("19834", "19835", "19836"), (stryMutAct_9fa48("19837") ? this.delegates.getLeaderReadinessStatusForProbe() : (stryCov_9fa48("19837"), this.delegates.getLeaderReadinessStatusForProbe?.())) || (stryMutAct_9fa48("19838") ? {} : (stryCov_9fa48("19838"), {
        ready: stryMutAct_9fa48("19839") ? true : (stryCov_9fa48("19839"), false)
      })));
    }
  }
  getStartupRecoveryCoordinator() {
    if (stryMutAct_9fa48("19840")) {
      {}
    } else {
      stryCov_9fa48("19840");
      return stryMutAct_9fa48("19843") ? this.delegates.getStartupRecoveryCoordinator?.() && null : stryMutAct_9fa48("19842") ? false : stryMutAct_9fa48("19841") ? true : (stryCov_9fa48("19841", "19842", "19843"), (stryMutAct_9fa48("19844") ? this.delegates.getStartupRecoveryCoordinator() : (stryCov_9fa48("19844"), this.delegates.getStartupRecoveryCoordinator?.())) || null);
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("19845")) {
      {}
    } else {
      stryCov_9fa48("19845");
      return stryMutAct_9fa48("19848") ? this.delegates.getLogger?.() && null : stryMutAct_9fa48("19847") ? false : stryMutAct_9fa48("19846") ? true : (stryCov_9fa48("19846", "19847", "19848"), (stryMutAct_9fa48("19849") ? this.delegates.getLogger() : (stryCov_9fa48("19849"), this.delegates.getLogger?.())) || null);
    }
  }
  handleLivenessProbeRequest(reply) {
    if (stryMutAct_9fa48("19850")) {
      {}
    } else {
      stryCov_9fa48("19850");
      const statusCode = HTTP_STATUS.OK;
      const response = stryMutAct_9fa48("19851") ? {} : (stryCov_9fa48("19851"), {
        alive: BOOTSTRAP_API_LIVENESS.ALIVE,
        state: BOOTSTRAP_API_LIVENESS.STATE_RUNNING,
        nodeId: this.getSeedNodeId(),
        timestamp: Date.now()
      });
      this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.LIVEZ, statusCode);
      reply.code(statusCode);
      return response;
    }
  }
  handleStartupProbeRequest(reply) {
    if (stryMutAct_9fa48("19852")) {
      {}
    } else {
      stryCov_9fa48("19852");
      const snapshot = this.evaluateReadinessSnapshot();
      const started = this.isStartupComplete();
      const statusCode = started ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      const reasons = this.getStartupProbeReasons(snapshot, started);
      const response = stryMutAct_9fa48("19853") ? {} : (stryCov_9fa48("19853"), {
        started,
        phase: (stryMutAct_9fa48("19856") ? typeof snapshot.phase !== TYPEOF.STRING : stryMutAct_9fa48("19855") ? false : stryMutAct_9fa48("19854") ? true : (stryCov_9fa48("19854", "19855", "19856"), typeof snapshot.phase === TYPEOF.STRING)) ? snapshot.phase : LIFECYCLE_PHASE.INIT,
        state: snapshot.state,
        reasons,
        timestamp: snapshot.timestamp
      });
      if (stryMutAct_9fa48("19859") ? false : stryMutAct_9fa48("19858") ? true : stryMutAct_9fa48("19857") ? started : (stryCov_9fa48("19857", "19858", "19859"), !started)) {
        if (stryMutAct_9fa48("19860")) {
          {}
        } else {
          stryCov_9fa48("19860");
          response.retryAfterMs = snapshot.retryAfterMs;
        }
      }
      this.appendReadinessProgressFields(response, snapshot);
      this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.STARTUPZ, statusCode);
      reply.code(statusCode);
      return response;
    }
  }
  async handleReadinessProbeRequest(reply) {
    if (stryMutAct_9fa48("19861")) {
      {}
    } else {
      stryCov_9fa48("19861");
      const snapshot = await this.evaluateReadinessSnapshotForProbe();
      const statusCode = snapshot.ready ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      const response = this.buildReadinessProbeResponse(snapshot);
      this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.READYZ, statusCode);
      reply.code(statusCode);
      return response;
    }
  }
  async handleBootstrapReadinessProbeRequest(reply) {
    if (stryMutAct_9fa48("19862")) {
      {}
    } else {
      stryCov_9fa48("19862");
      const snapshot = this.resolveReadinessSnapshotForScope(await this.evaluateReadinessSnapshotForProbe(), BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN);
      const statusCode = snapshot.ready ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      const response = this.buildReadinessProbeResponse(snapshot, stryMutAct_9fa48("19863") ? {} : (stryCov_9fa48("19863"), {
        scope: BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN
      }));
      this.logBootstrapJoinReadinessProjection(snapshot, response);
      this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY, statusCode);
      reply.code(statusCode);
      return response;
    }
  }
  resolveReadinessSnapshotForScope(snapshot, scope) {
    if (stryMutAct_9fa48("19864")) {
      {}
    } else {
      stryCov_9fa48("19864");
      if (stryMutAct_9fa48("19867") ? !snapshot && typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("19866") ? false : stryMutAct_9fa48("19865") ? true : (stryCov_9fa48("19865", "19866", "19867"), (stryMutAct_9fa48("19868") ? snapshot : (stryCov_9fa48("19868"), !snapshot)) || (stryMutAct_9fa48("19870") ? typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("19869") ? false : (stryCov_9fa48("19869", "19870"), typeof snapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("19871")) {
          {}
        } else {
          stryCov_9fa48("19871");
          return snapshot;
        }
      }
      if (stryMutAct_9fa48("19874") ? scope !== BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN && snapshot.ready === true : stryMutAct_9fa48("19873") ? false : stryMutAct_9fa48("19872") ? true : (stryCov_9fa48("19872", "19873", "19874"), (stryMutAct_9fa48("19876") ? scope === BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN : stryMutAct_9fa48("19875") ? false : (stryCov_9fa48("19875", "19876"), scope !== BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN)) || (stryMutAct_9fa48("19878") ? snapshot.ready !== true : stryMutAct_9fa48("19877") ? false : (stryCov_9fa48("19877", "19878"), snapshot.ready === (stryMutAct_9fa48("19879") ? false : (stryCov_9fa48("19879"), true)))))) {
        if (stryMutAct_9fa48("19880")) {
          {}
        } else {
          stryCov_9fa48("19880");
          this.lastBootstrapJoinProjectionEvaluation = stryMutAct_9fa48("19881") ? {} : (stryCov_9fa48("19881"), {
            scope,
            canProjectReady: stryMutAct_9fa48("19882") ? true : (stryCov_9fa48("19882"), false),
            projectionRule: BOOTSTRAP_JOIN_PROJECTION_RULE.ALREADY_READY,
            blockerReason: (stryMutAct_9fa48("19885") ? snapshot.ready !== true : stryMutAct_9fa48("19884") ? false : stryMutAct_9fa48("19883") ? true : (stryCov_9fa48("19883", "19884", "19885"), snapshot.ready === (stryMutAct_9fa48("19886") ? false : (stryCov_9fa48("19886"), true)))) ? BOOTSTRAP_JOIN_PROJECTION_RULE.ALREADY_READY : BOOTSTRAP_JOIN_PROJECTION_BLOCKER.PHASE_NOT_ELIGIBLE,
            normalizedPhase: normalizeLifecyclePhaseFromSnapshot(snapshot),
            reasons: normalizeReasonCodeArray(stryMutAct_9fa48("19887") ? snapshot.reasons : (stryCov_9fa48("19887"), snapshot?.reasons)),
            blockingReasons: stryMutAct_9fa48("19888") ? ["Stryker was here"] : (stryCov_9fa48("19888"), [])
          });
          return snapshot;
        }
      }
      const projectionEvaluation = this.evaluateBootstrapJoinProjection(snapshot, stryMutAct_9fa48("19889") ? {} : (stryCov_9fa48("19889"), {
        bootstrapJoinAuthorityAvailable: stryMutAct_9fa48("19892") ? snapshot?.bootstrapJoinAuthorityAvailable === true && hasBootstrapJoinAuthority(this.getPriorityControlPlaneRecoveryHealth()) : stryMutAct_9fa48("19891") ? false : stryMutAct_9fa48("19890") ? true : (stryCov_9fa48("19890", "19891", "19892"), (stryMutAct_9fa48("19894") ? snapshot?.bootstrapJoinAuthorityAvailable !== true : stryMutAct_9fa48("19893") ? false : (stryCov_9fa48("19893", "19894"), (stryMutAct_9fa48("19895") ? snapshot.bootstrapJoinAuthorityAvailable : (stryCov_9fa48("19895"), snapshot?.bootstrapJoinAuthorityAvailable)) === (stryMutAct_9fa48("19896") ? false : (stryCov_9fa48("19896"), true)))) || hasBootstrapJoinAuthority(this.getPriorityControlPlaneRecoveryHealth()))
      }));
      this.lastBootstrapJoinProjectionEvaluation = projectionEvaluation;
      if (stryMutAct_9fa48("19899") ? projectionEvaluation.canProjectReady === true : stryMutAct_9fa48("19898") ? false : stryMutAct_9fa48("19897") ? true : (stryCov_9fa48("19897", "19898", "19899"), projectionEvaluation.canProjectReady !== (stryMutAct_9fa48("19900") ? false : (stryCov_9fa48("19900"), true)))) {
        if (stryMutAct_9fa48("19901")) {
          {}
        } else {
          stryCov_9fa48("19901");
          return snapshot;
        }
      }
      return stryMutAct_9fa48("19902") ? {} : (stryCov_9fa48("19902"), {
        ...snapshot,
        ready: stryMutAct_9fa48("19903") ? false : (stryCov_9fa48("19903"), true),
        reasons: stryMutAct_9fa48("19904") ? ["Stryker was here"] : (stryCov_9fa48("19904"), []),
        retryAfterMs: NUM.ZERO
      });
    }
  }
  evaluateBootstrapJoinProjection(snapshot, options = {}) {
    if (stryMutAct_9fa48("19905")) {
      {}
    } else {
      stryCov_9fa48("19905");
      const normalizedReasons = Array.isArray(options.reasons) ? normalizeReasonCodeArray(options.reasons) : normalizeReasonCodeArray(stryMutAct_9fa48("19906") ? snapshot.reasons : (stryCov_9fa48("19906"), snapshot?.reasons));
      const blockingReasons = Array.isArray(options.blockingReasons) ? normalizeReasonCodeArray(options.blockingReasons) : stryMutAct_9fa48("19907") ? normalizedReasons : (stryCov_9fa48("19907"), normalizedReasons.filter(stryMutAct_9fa48("19908") ? () => undefined : (stryCov_9fa48("19908"), reason => stryMutAct_9fa48("19909") ? BOOTSTRAP_JOIN_NON_BLOCKING_REASON_SET.has(reason) : (stryCov_9fa48("19909"), !BOOTSTRAP_JOIN_NON_BLOCKING_REASON_SET.has(reason)))));
      const normalizedPhase = normalizeLifecyclePhaseFromSnapshot(snapshot);
      const draining = stryMutAct_9fa48("19912") ? snapshot?.draining !== true : stryMutAct_9fa48("19911") ? false : stryMutAct_9fa48("19910") ? true : (stryCov_9fa48("19910", "19911", "19912"), (stryMutAct_9fa48("19913") ? snapshot.draining : (stryCov_9fa48("19913"), snapshot?.draining)) === (stryMutAct_9fa48("19914") ? false : (stryCov_9fa48("19914"), true)));
      const bootstrapJoinAuthorityAvailable = stryMutAct_9fa48("19917") ? options.bootstrapJoinAuthorityAvailable === true && snapshot?.bootstrapJoinAuthorityAvailable === true : stryMutAct_9fa48("19916") ? false : stryMutAct_9fa48("19915") ? true : (stryCov_9fa48("19915", "19916", "19917"), (stryMutAct_9fa48("19919") ? options.bootstrapJoinAuthorityAvailable !== true : stryMutAct_9fa48("19918") ? false : (stryCov_9fa48("19918", "19919"), options.bootstrapJoinAuthorityAvailable === (stryMutAct_9fa48("19920") ? false : (stryCov_9fa48("19920"), true)))) || (stryMutAct_9fa48("19922") ? snapshot?.bootstrapJoinAuthorityAvailable !== true : stryMutAct_9fa48("19921") ? false : (stryCov_9fa48("19921", "19922"), (stryMutAct_9fa48("19923") ? snapshot.bootstrapJoinAuthorityAvailable : (stryCov_9fa48("19923"), snapshot?.bootstrapJoinAuthorityAvailable)) === (stryMutAct_9fa48("19924") ? false : (stryCov_9fa48("19924"), true)))));
      let canProjectReady = stryMutAct_9fa48("19925") ? true : (stryCov_9fa48("19925"), false);
      let projectionRule = null;
      let blockerReason = BOOTSTRAP_JOIN_PROJECTION_BLOCKER.PHASE_NOT_ELIGIBLE;
      if (stryMutAct_9fa48("19927") ? false : stryMutAct_9fa48("19926") ? true : (stryCov_9fa48("19926", "19927"), draining)) {
        if (stryMutAct_9fa48("19928")) {
          {}
        } else {
          stryCov_9fa48("19928");
          blockerReason = BOOTSTRAP_JOIN_PROJECTION_BLOCKER.DRAINING;
        }
      } else if (stryMutAct_9fa48("19931") ? false : stryMutAct_9fa48("19930") ? true : stryMutAct_9fa48("19929") ? bootstrapJoinAuthorityAvailable : (stryCov_9fa48("19929", "19930", "19931"), !bootstrapJoinAuthorityAvailable)) {
        if (stryMutAct_9fa48("19932")) {
          {}
        } else {
          stryCov_9fa48("19932");
          blockerReason = BOOTSTRAP_JOIN_PROJECTION_BLOCKER.CONTROL_SNAPSHOT_AUTHORITY_UNAVAILABLE;
        }
      } else if (stryMutAct_9fa48("19935") ? normalizedPhase !== LIFECYCLE_PHASE.JOIN_READY : stryMutAct_9fa48("19934") ? false : stryMutAct_9fa48("19933") ? true : (stryCov_9fa48("19933", "19934", "19935"), normalizedPhase === LIFECYCLE_PHASE.JOIN_READY)) {
        if (stryMutAct_9fa48("19936")) {
          {}
        } else {
          stryCov_9fa48("19936");
          const joinStableWindowOnly = stryMutAct_9fa48("19939") ? normalizedReasons.length === NUM.ONE || normalizedReasons[NUM.ZERO] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING : stryMutAct_9fa48("19938") ? false : stryMutAct_9fa48("19937") ? true : (stryCov_9fa48("19937", "19938", "19939"), (stryMutAct_9fa48("19941") ? normalizedReasons.length !== NUM.ONE : stryMutAct_9fa48("19940") ? true : (stryCov_9fa48("19940", "19941"), normalizedReasons.length === NUM.ONE)) && (stryMutAct_9fa48("19943") ? normalizedReasons[NUM.ZERO] !== LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING : stryMutAct_9fa48("19942") ? true : (stryCov_9fa48("19942", "19943"), normalizedReasons[NUM.ZERO] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING)));
          canProjectReady = joinStableWindowOnly;
          projectionRule = joinStableWindowOnly ? BOOTSTRAP_JOIN_PROJECTION_RULE.JOIN_STABLE_WINDOW : null;
          blockerReason = joinStableWindowOnly ? null : BOOTSTRAP_JOIN_PROJECTION_BLOCKER.JOIN_STABLE_WINDOW_REASONS;
        }
      } else if (stryMutAct_9fa48("19946") ? normalizedPhase !== LIFECYCLE_PHASE.INIT : stryMutAct_9fa48("19945") ? false : stryMutAct_9fa48("19944") ? true : (stryCov_9fa48("19944", "19945", "19946"), normalizedPhase === LIFECYCLE_PHASE.INIT)) {
        if (stryMutAct_9fa48("19947")) {
          {}
        } else {
          stryCov_9fa48("19947");
          const bootstrapInitPriorityBypass = canBypassBootstrapInitPriorityReasons(normalizedReasons, stryMutAct_9fa48("19948") ? {} : (stryCov_9fa48("19948"), {
            ...snapshot,
            phase: normalizedPhase
          }));
          canProjectReady = bootstrapInitPriorityBypass;
          projectionRule = bootstrapInitPriorityBypass ? BOOTSTRAP_JOIN_PROJECTION_RULE.INIT_PRIORITY_BYPASS : null;
          blockerReason = bootstrapInitPriorityBypass ? null : BOOTSTRAP_JOIN_PROJECTION_BLOCKER.INIT_PRIORITY_BYPASS_REJECTED;
        }
      } else if (stryMutAct_9fa48("19951") ? normalizedPhase === LIFECYCLE_PHASE.CONTROL_READY && normalizedPhase === LIFECYCLE_PHASE.DEGRADED : stryMutAct_9fa48("19950") ? false : stryMutAct_9fa48("19949") ? true : (stryCov_9fa48("19949", "19950", "19951"), (stryMutAct_9fa48("19953") ? normalizedPhase !== LIFECYCLE_PHASE.CONTROL_READY : stryMutAct_9fa48("19952") ? false : (stryCov_9fa48("19952", "19953"), normalizedPhase === LIFECYCLE_PHASE.CONTROL_READY)) || (stryMutAct_9fa48("19955") ? normalizedPhase !== LIFECYCLE_PHASE.DEGRADED : stryMutAct_9fa48("19954") ? false : (stryCov_9fa48("19954", "19955"), normalizedPhase === LIFECYCLE_PHASE.DEGRADED)))) {
        if (stryMutAct_9fa48("19956")) {
          {}
        } else {
          stryCov_9fa48("19956");
          const controlPhaseProjection = resolveControlPhaseBootstrapJoinProjection(normalizedReasons, blockingReasons);
          canProjectReady = controlPhaseProjection.canProjectReady;
          projectionRule = controlPhaseProjection.projectionRule;
          blockerReason = controlPhaseProjection.blockerReason;
        }
      }
      return buildBootstrapJoinProjectionResult(stryMutAct_9fa48("19957") ? {} : (stryCov_9fa48("19957"), {
        canProjectReady,
        projectionRule,
        blockerReason,
        normalizedPhase,
        reasons: normalizedReasons,
        blockingReasons
      }));
    }
  }
  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    if (stryMutAct_9fa48("19958")) {
      {}
    } else {
      stryCov_9fa48("19958");
      return this.evaluateBootstrapJoinProjection(snapshot, stryMutAct_9fa48("19959") ? {} : (stryCov_9fa48("19959"), {
        reasons,
        blockingReasons
      })).canProjectReady;
    }
  }
  buildReadinessProbeResponse(snapshot, options = {}) {
    if (stryMutAct_9fa48("19960")) {
      {}
    } else {
      stryCov_9fa48("19960");
      const response = stryMutAct_9fa48("19961") ? {} : (stryCov_9fa48("19961"), {
        ready: stryMutAct_9fa48("19964") ? snapshot.ready !== true : stryMutAct_9fa48("19963") ? false : stryMutAct_9fa48("19962") ? true : (stryCov_9fa48("19962", "19963", "19964"), snapshot.ready === (stryMutAct_9fa48("19965") ? false : (stryCov_9fa48("19965"), true))),
        phase: (stryMutAct_9fa48("19968") ? typeof snapshot.phase !== TYPEOF.STRING : stryMutAct_9fa48("19967") ? false : stryMutAct_9fa48("19966") ? true : (stryCov_9fa48("19966", "19967", "19968"), typeof snapshot.phase === TYPEOF.STRING)) ? snapshot.phase : LIFECYCLE_PHASE.INIT,
        state: snapshot.state,
        reasons: Array.isArray(snapshot.reasons) ? snapshot.reasons : stryMutAct_9fa48("19969") ? ["Stryker was here"] : (stryCov_9fa48("19969"), []),
        timestamp: snapshot.timestamp
      });
      if (stryMutAct_9fa48("19972") ? snapshot.draining !== true : stryMutAct_9fa48("19971") ? false : stryMutAct_9fa48("19970") ? true : (stryCov_9fa48("19970", "19971", "19972"), snapshot.draining === (stryMutAct_9fa48("19973") ? false : (stryCov_9fa48("19973"), true)))) {
        if (stryMutAct_9fa48("19974")) {
          {}
        } else {
          stryCov_9fa48("19974");
          response.draining = stryMutAct_9fa48("19975") ? false : (stryCov_9fa48("19975"), true);
        }
      }
      if (stryMutAct_9fa48("19977") ? false : stryMutAct_9fa48("19976") ? true : (stryCov_9fa48("19976", "19977"), Number.isFinite(snapshot.drainDeadlineMs))) {
        if (stryMutAct_9fa48("19978")) {
          {}
        } else {
          stryCov_9fa48("19978");
          response.drainDeadlineMs = Math.floor(snapshot.drainDeadlineMs);
        }
      }
      if (stryMutAct_9fa48("19980") ? false : stryMutAct_9fa48("19979") ? true : (stryCov_9fa48("19979", "19980"), Number.isFinite(snapshot.retryAfterMs))) {
        if (stryMutAct_9fa48("19981")) {
          {}
        } else {
          stryCov_9fa48("19981");
          response.retryAfterMs = snapshot.retryAfterMs;
        }
      }
      this.appendReadinessProgressFields(response, snapshot);
      this.appendStartupRecoveryFields(response, snapshot);
      this.appendMembershipPublicationFields(response, snapshot);
      if (stryMutAct_9fa48("19984") ? typeof options.scope === TYPEOF.STRING || options.scope.length > NUM.ZERO : stryMutAct_9fa48("19983") ? false : stryMutAct_9fa48("19982") ? true : (stryCov_9fa48("19982", "19983", "19984"), (stryMutAct_9fa48("19986") ? typeof options.scope !== TYPEOF.STRING : stryMutAct_9fa48("19985") ? true : (stryCov_9fa48("19985", "19986"), typeof options.scope === TYPEOF.STRING)) && (stryMutAct_9fa48("19989") ? options.scope.length <= NUM.ZERO : stryMutAct_9fa48("19988") ? options.scope.length >= NUM.ZERO : stryMutAct_9fa48("19987") ? true : (stryCov_9fa48("19987", "19988", "19989"), options.scope.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("19990")) {
          {}
        } else {
          stryCov_9fa48("19990");
          response.scope = options.scope;
        }
      }
      return response;
    }
  }
  appendReadinessProgressFields(response, snapshot) {
    if (stryMutAct_9fa48("19991")) {
      {}
    } else {
      stryCov_9fa48("19991");
      if (stryMutAct_9fa48("19994") ? (!response || typeof response !== TYPEOF.OBJECT || !snapshot) && typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("19993") ? false : stryMutAct_9fa48("19992") ? true : (stryCov_9fa48("19992", "19993", "19994"), (stryMutAct_9fa48("19996") ? (!response || typeof response !== TYPEOF.OBJECT) && !snapshot : stryMutAct_9fa48("19995") ? false : (stryCov_9fa48("19995", "19996"), (stryMutAct_9fa48("19998") ? !response && typeof response !== TYPEOF.OBJECT : stryMutAct_9fa48("19997") ? false : (stryCov_9fa48("19997", "19998"), (stryMutAct_9fa48("19999") ? response : (stryCov_9fa48("19999"), !response)) || (stryMutAct_9fa48("20001") ? typeof response === TYPEOF.OBJECT : stryMutAct_9fa48("20000") ? false : (stryCov_9fa48("20000", "20001"), typeof response !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("20002") ? snapshot : (stryCov_9fa48("20002"), !snapshot)))) || (stryMutAct_9fa48("20004") ? typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("20003") ? false : (stryCov_9fa48("20003", "20004"), typeof snapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20005")) {
          {}
        } else {
          stryCov_9fa48("20005");
          return response;
        }
      }
      if (stryMutAct_9fa48("20007") ? false : stryMutAct_9fa48("20006") ? true : (stryCov_9fa48("20006", "20007"), Number.isFinite(snapshot.phaseRank))) {
        if (stryMutAct_9fa48("20008")) {
          {}
        } else {
          stryCov_9fa48("20008");
          response.phaseRank = stryMutAct_9fa48("20009") ? Math.min(NUM.ZERO, Math.floor(snapshot.phaseRank)) : (stryCov_9fa48("20009"), Math.max(NUM.ZERO, Math.floor(snapshot.phaseRank)));
        }
      }
      if (stryMutAct_9fa48("20011") ? false : stryMutAct_9fa48("20010") ? true : (stryCov_9fa48("20010", "20011"), Number.isFinite(snapshot.transitionCount))) {
        if (stryMutAct_9fa48("20012")) {
          {}
        } else {
          stryCov_9fa48("20012");
          response.readinessEpoch = stryMutAct_9fa48("20013") ? Math.min(NUM.ZERO, Math.floor(snapshot.transitionCount)) : (stryCov_9fa48("20013"), Math.max(NUM.ZERO, Math.floor(snapshot.transitionCount)));
        }
      }
      if (stryMutAct_9fa48("20015") ? false : stryMutAct_9fa48("20014") ? true : (stryCov_9fa48("20014", "20015"), Number.isFinite(snapshot.stableWindowMs))) {
        if (stryMutAct_9fa48("20016")) {
          {}
        } else {
          stryCov_9fa48("20016");
          response.stableWindowMs = stryMutAct_9fa48("20017") ? Math.min(NUM.ZERO, Math.floor(snapshot.stableWindowMs)) : (stryCov_9fa48("20017"), Math.max(NUM.ZERO, Math.floor(snapshot.stableWindowMs)));
        }
      }
      if (stryMutAct_9fa48("20019") ? false : stryMutAct_9fa48("20018") ? true : (stryCov_9fa48("20018", "20019"), Number.isFinite(snapshot.stableElapsedMs))) {
        if (stryMutAct_9fa48("20020")) {
          {}
        } else {
          stryCov_9fa48("20020");
          response.stableElapsedMs = stryMutAct_9fa48("20021") ? Math.min(NUM.ZERO, Math.floor(snapshot.stableElapsedMs)) : (stryCov_9fa48("20021"), Math.max(NUM.ZERO, Math.floor(snapshot.stableElapsedMs)));
        }
      }
      if (stryMutAct_9fa48("20023") ? false : stryMutAct_9fa48("20022") ? true : (stryCov_9fa48("20022", "20023"), Number.isFinite(snapshot.stableSinceMs))) {
        if (stryMutAct_9fa48("20024")) {
          {}
        } else {
          stryCov_9fa48("20024");
          response.stableSinceMs = Math.floor(snapshot.stableSinceMs);
        }
      }
      return response;
    }
  }
  appendStartupRecoveryFields(response, snapshot) {
    if (stryMutAct_9fa48("20025")) {
      {}
    } else {
      stryCov_9fa48("20025");
      if (stryMutAct_9fa48("20028") ? (!response || typeof response !== TYPEOF.OBJECT || !snapshot) && typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("20027") ? false : stryMutAct_9fa48("20026") ? true : (stryCov_9fa48("20026", "20027", "20028"), (stryMutAct_9fa48("20030") ? (!response || typeof response !== TYPEOF.OBJECT) && !snapshot : stryMutAct_9fa48("20029") ? false : (stryCov_9fa48("20029", "20030"), (stryMutAct_9fa48("20032") ? !response && typeof response !== TYPEOF.OBJECT : stryMutAct_9fa48("20031") ? false : (stryCov_9fa48("20031", "20032"), (stryMutAct_9fa48("20033") ? response : (stryCov_9fa48("20033"), !response)) || (stryMutAct_9fa48("20035") ? typeof response === TYPEOF.OBJECT : stryMutAct_9fa48("20034") ? false : (stryCov_9fa48("20034", "20035"), typeof response !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("20036") ? snapshot : (stryCov_9fa48("20036"), !snapshot)))) || (stryMutAct_9fa48("20038") ? typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("20037") ? false : (stryCov_9fa48("20037", "20038"), typeof snapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20039")) {
          {}
        } else {
          stryCov_9fa48("20039");
          return response;
        }
      }
      const startupAuthority = this.getStartupAuthoritySnapshot(stryMutAct_9fa48("20040") ? response.timestamp : (stryCov_9fa48("20040"), response?.timestamp));
      const priorityRecoveryHealth = this.getPriorityControlPlaneRecoveryHealth();
      const priorityRecoveryDetails = (stryMutAct_9fa48("20043") ? priorityRecoveryHealth?.details || typeof priorityRecoveryHealth.details === TYPEOF.OBJECT : stryMutAct_9fa48("20042") ? false : stryMutAct_9fa48("20041") ? true : (stryCov_9fa48("20041", "20042", "20043"), (stryMutAct_9fa48("20044") ? priorityRecoveryHealth.details : (stryCov_9fa48("20044"), priorityRecoveryHealth?.details)) && (stryMutAct_9fa48("20046") ? typeof priorityRecoveryHealth.details !== TYPEOF.OBJECT : stryMutAct_9fa48("20045") ? true : (stryCov_9fa48("20045", "20046"), typeof priorityRecoveryHealth.details === TYPEOF.OBJECT)))) ? priorityRecoveryHealth.details : null;
      const coordinator = this.getStartupRecoveryCoordinator();
      if (stryMutAct_9fa48("20049") ? !coordinator && typeof coordinator.evaluate !== TYPEOF.FUNCTION : stryMutAct_9fa48("20048") ? false : stryMutAct_9fa48("20047") ? true : (stryCov_9fa48("20047", "20048", "20049"), (stryMutAct_9fa48("20050") ? coordinator : (stryCov_9fa48("20050"), !coordinator)) || (stryMutAct_9fa48("20052") ? typeof coordinator.evaluate === TYPEOF.FUNCTION : stryMutAct_9fa48("20051") ? false : (stryCov_9fa48("20051", "20052"), typeof coordinator.evaluate !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("20053")) {
          {}
        } else {
          stryCov_9fa48("20053");
          this.appendPriorityRecoveryProtocolFields(response, priorityRecoveryDetails);
          return response;
        }
      }
      const startupRecovery = coordinator.evaluate(stryMutAct_9fa48("20054") ? {} : (stryCov_9fa48("20054"), {
        snapshot,
        priorityRecoveryHealth,
        startupAuthority
      }));
      if (stryMutAct_9fa48("20057") ? !startupRecovery && typeof startupRecovery !== TYPEOF.OBJECT : stryMutAct_9fa48("20056") ? false : stryMutAct_9fa48("20055") ? true : (stryCov_9fa48("20055", "20056", "20057"), (stryMutAct_9fa48("20058") ? startupRecovery : (stryCov_9fa48("20058"), !startupRecovery)) || (stryMutAct_9fa48("20060") ? typeof startupRecovery === TYPEOF.OBJECT : stryMutAct_9fa48("20059") ? false : (stryCov_9fa48("20059", "20060"), typeof startupRecovery !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20061")) {
          {}
        } else {
          stryCov_9fa48("20061");
          this.appendPriorityRecoveryProtocolFields(response, priorityRecoveryDetails);
          return response;
        }
      }
      if (stryMutAct_9fa48("20064") ? typeof startupRecovery.recoveryStage === TYPEOF.STRING || startupRecovery.recoveryStage.length > NUM.ZERO : stryMutAct_9fa48("20063") ? false : stryMutAct_9fa48("20062") ? true : (stryCov_9fa48("20062", "20063", "20064"), (stryMutAct_9fa48("20066") ? typeof startupRecovery.recoveryStage !== TYPEOF.STRING : stryMutAct_9fa48("20065") ? true : (stryCov_9fa48("20065", "20066"), typeof startupRecovery.recoveryStage === TYPEOF.STRING)) && (stryMutAct_9fa48("20069") ? startupRecovery.recoveryStage.length <= NUM.ZERO : stryMutAct_9fa48("20068") ? startupRecovery.recoveryStage.length >= NUM.ZERO : stryMutAct_9fa48("20067") ? true : (stryCov_9fa48("20067", "20068", "20069"), startupRecovery.recoveryStage.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20070")) {
          {}
        } else {
          stryCov_9fa48("20070");
          response.recoveryStage = startupRecovery.recoveryStage;
        }
      }
      if (stryMutAct_9fa48("20072") ? false : stryMutAct_9fa48("20071") ? true : (stryCov_9fa48("20071", "20072"), Number.isFinite(startupRecovery.recoveryStageRank))) {
        if (stryMutAct_9fa48("20073")) {
          {}
        } else {
          stryCov_9fa48("20073");
          response.recoveryStageRank = stryMutAct_9fa48("20074") ? Math.min(NUM.ZERO, Math.floor(startupRecovery.recoveryStageRank)) : (stryCov_9fa48("20074"), Math.max(NUM.ZERO, Math.floor(startupRecovery.recoveryStageRank)));
        }
      }
      if (stryMutAct_9fa48("20077") ? typeof startupRecovery.controlPlaneRecoveryReady !== TYPEOF.BOOLEAN : stryMutAct_9fa48("20076") ? false : stryMutAct_9fa48("20075") ? true : (stryCov_9fa48("20075", "20076", "20077"), typeof startupRecovery.controlPlaneRecoveryReady === TYPEOF.BOOLEAN)) {
        if (stryMutAct_9fa48("20078")) {
          {}
        } else {
          stryCov_9fa48("20078");
          response.controlPlaneRecoveryReady = startupRecovery.controlPlaneRecoveryReady;
        }
      }
      if (stryMutAct_9fa48("20081") ? typeof startupRecovery.metadataPublicationReady !== TYPEOF.BOOLEAN : stryMutAct_9fa48("20080") ? false : stryMutAct_9fa48("20079") ? true : (stryCov_9fa48("20079", "20080", "20081"), typeof startupRecovery.metadataPublicationReady === TYPEOF.BOOLEAN)) {
        if (stryMutAct_9fa48("20082")) {
          {}
        } else {
          stryCov_9fa48("20082");
          response.metadataPublicationReady = startupRecovery.metadataPublicationReady;
        }
      }
      if (stryMutAct_9fa48("20085") ? typeof startupRecovery.backgroundWorkReady !== TYPEOF.BOOLEAN : stryMutAct_9fa48("20084") ? false : stryMutAct_9fa48("20083") ? true : (stryCov_9fa48("20083", "20084", "20085"), typeof startupRecovery.backgroundWorkReady === TYPEOF.BOOLEAN)) {
        if (stryMutAct_9fa48("20086")) {
          {}
        } else {
          stryCov_9fa48("20086");
          response.backgroundWorkReady = startupRecovery.backgroundWorkReady;
        }
      }
      if (stryMutAct_9fa48("20089") ? typeof startupRecovery.recoveryBlocked !== TYPEOF.BOOLEAN : stryMutAct_9fa48("20088") ? false : stryMutAct_9fa48("20087") ? true : (stryCov_9fa48("20087", "20088", "20089"), typeof startupRecovery.recoveryBlocked === TYPEOF.BOOLEAN)) {
        if (stryMutAct_9fa48("20090")) {
          {}
        } else {
          stryCov_9fa48("20090");
          response.recoveryBlocked = startupRecovery.recoveryBlocked;
        }
      }
      if (stryMutAct_9fa48("20093") ? typeof startupRecovery.startupAuthorityState === TYPEOF.STRING || startupRecovery.startupAuthorityState.length > NUM.ZERO : stryMutAct_9fa48("20092") ? false : stryMutAct_9fa48("20091") ? true : (stryCov_9fa48("20091", "20092", "20093"), (stryMutAct_9fa48("20095") ? typeof startupRecovery.startupAuthorityState !== TYPEOF.STRING : stryMutAct_9fa48("20094") ? true : (stryCov_9fa48("20094", "20095"), typeof startupRecovery.startupAuthorityState === TYPEOF.STRING)) && (stryMutAct_9fa48("20098") ? startupRecovery.startupAuthorityState.length <= NUM.ZERO : stryMutAct_9fa48("20097") ? startupRecovery.startupAuthorityState.length >= NUM.ZERO : stryMutAct_9fa48("20096") ? true : (stryCov_9fa48("20096", "20097", "20098"), startupRecovery.startupAuthorityState.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20099")) {
          {}
        } else {
          stryCov_9fa48("20099");
          response.startupAuthorityState = startupRecovery.startupAuthorityState;
        }
      }
      if (stryMutAct_9fa48("20102") ? typeof startupRecovery.startupAuthorityAvailable !== TYPEOF.BOOLEAN : stryMutAct_9fa48("20101") ? false : stryMutAct_9fa48("20100") ? true : (stryCov_9fa48("20100", "20101", "20102"), typeof startupRecovery.startupAuthorityAvailable === TYPEOF.BOOLEAN)) {
        if (stryMutAct_9fa48("20103")) {
          {}
        } else {
          stryCov_9fa48("20103");
          response.startupAuthorityAvailable = startupRecovery.startupAuthorityAvailable;
        }
      }
      if (stryMutAct_9fa48("20106") ? startupRecovery.startupAuthorityFailure || typeof startupRecovery.startupAuthorityFailure === TYPEOF.OBJECT : stryMutAct_9fa48("20105") ? false : stryMutAct_9fa48("20104") ? true : (stryCov_9fa48("20104", "20105", "20106"), startupRecovery.startupAuthorityFailure && (stryMutAct_9fa48("20108") ? typeof startupRecovery.startupAuthorityFailure !== TYPEOF.OBJECT : stryMutAct_9fa48("20107") ? true : (stryCov_9fa48("20107", "20108"), typeof startupRecovery.startupAuthorityFailure === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20109")) {
          {}
        } else {
          stryCov_9fa48("20109");
          response.startupAuthorityFailure = startupRecovery.startupAuthorityFailure;
        }
      }
      if (stryMutAct_9fa48("20112") ? typeof startupRecovery.startupAuthorityFailureReason === TYPEOF.STRING || startupRecovery.startupAuthorityFailureReason.length > NUM.ZERO : stryMutAct_9fa48("20111") ? false : stryMutAct_9fa48("20110") ? true : (stryCov_9fa48("20110", "20111", "20112"), (stryMutAct_9fa48("20114") ? typeof startupRecovery.startupAuthorityFailureReason !== TYPEOF.STRING : stryMutAct_9fa48("20113") ? true : (stryCov_9fa48("20113", "20114"), typeof startupRecovery.startupAuthorityFailureReason === TYPEOF.STRING)) && (stryMutAct_9fa48("20117") ? startupRecovery.startupAuthorityFailureReason.length <= NUM.ZERO : stryMutAct_9fa48("20116") ? startupRecovery.startupAuthorityFailureReason.length >= NUM.ZERO : stryMutAct_9fa48("20115") ? true : (stryCov_9fa48("20115", "20116", "20117"), startupRecovery.startupAuthorityFailureReason.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20118")) {
          {}
        } else {
          stryCov_9fa48("20118");
          response.startupAuthorityFailureReason = startupRecovery.startupAuthorityFailureReason;
        }
      }
      if (stryMutAct_9fa48("20121") ? startupRecovery.startupAuthorityPublication || typeof startupRecovery.startupAuthorityPublication === TYPEOF.OBJECT : stryMutAct_9fa48("20120") ? false : stryMutAct_9fa48("20119") ? true : (stryCov_9fa48("20119", "20120", "20121"), startupRecovery.startupAuthorityPublication && (stryMutAct_9fa48("20123") ? typeof startupRecovery.startupAuthorityPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("20122") ? true : (stryCov_9fa48("20122", "20123"), typeof startupRecovery.startupAuthorityPublication === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20124")) {
          {}
        } else {
          stryCov_9fa48("20124");
          response.startupAuthorityPublication = startupRecovery.startupAuthorityPublication;
        }
      }
      if (stryMutAct_9fa48("20127") ? typeof startupRecovery.publicationObservationState === TYPEOF.STRING || startupRecovery.publicationObservationState.length > NUM.ZERO : stryMutAct_9fa48("20126") ? false : stryMutAct_9fa48("20125") ? true : (stryCov_9fa48("20125", "20126", "20127"), (stryMutAct_9fa48("20129") ? typeof startupRecovery.publicationObservationState !== TYPEOF.STRING : stryMutAct_9fa48("20128") ? true : (stryCov_9fa48("20128", "20129"), typeof startupRecovery.publicationObservationState === TYPEOF.STRING)) && (stryMutAct_9fa48("20132") ? startupRecovery.publicationObservationState.length <= NUM.ZERO : stryMutAct_9fa48("20131") ? startupRecovery.publicationObservationState.length >= NUM.ZERO : stryMutAct_9fa48("20130") ? true : (stryCov_9fa48("20130", "20131", "20132"), startupRecovery.publicationObservationState.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20133")) {
          {}
        } else {
          stryCov_9fa48("20133");
          response.startupAuthorityPublicationObservationState = startupRecovery.publicationObservationState;
        }
      }
      this.appendPriorityRecoveryProtocolFields(response, (stryMutAct_9fa48("20136") ? (startupRecovery.targetParticipation || startupRecovery.recoveryProtocolState) && Array.isArray(startupRecovery.priorityRecoveryReasonCodes) && startupRecovery.priorityRecoveryReasonCodes.length > NUM.ZERO : stryMutAct_9fa48("20135") ? false : stryMutAct_9fa48("20134") ? true : (stryCov_9fa48("20134", "20135", "20136"), (stryMutAct_9fa48("20138") ? startupRecovery.targetParticipation && startupRecovery.recoveryProtocolState : stryMutAct_9fa48("20137") ? false : (stryCov_9fa48("20137", "20138"), startupRecovery.targetParticipation || startupRecovery.recoveryProtocolState)) || (stryMutAct_9fa48("20140") ? Array.isArray(startupRecovery.priorityRecoveryReasonCodes) || startupRecovery.priorityRecoveryReasonCodes.length > NUM.ZERO : stryMutAct_9fa48("20139") ? false : (stryCov_9fa48("20139", "20140"), Array.isArray(startupRecovery.priorityRecoveryReasonCodes) && (stryMutAct_9fa48("20143") ? startupRecovery.priorityRecoveryReasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("20142") ? startupRecovery.priorityRecoveryReasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("20141") ? true : (stryCov_9fa48("20141", "20142", "20143"), startupRecovery.priorityRecoveryReasonCodes.length > NUM.ZERO)))))) ? stryMutAct_9fa48("20144") ? {} : (stryCov_9fa48("20144"), {
        recoveryProtocolState: stryMutAct_9fa48("20147") ? startupRecovery.recoveryProtocolState && null : stryMutAct_9fa48("20146") ? false : stryMutAct_9fa48("20145") ? true : (stryCov_9fa48("20145", "20146", "20147"), startupRecovery.recoveryProtocolState || null),
        priorityRecoveryReasonCodes: stryMutAct_9fa48("20150") ? startupRecovery.priorityRecoveryReasonCodes && [] : stryMutAct_9fa48("20149") ? false : stryMutAct_9fa48("20148") ? true : (stryCov_9fa48("20148", "20149", "20150"), startupRecovery.priorityRecoveryReasonCodes || (stryMutAct_9fa48("20151") ? ["Stryker was here"] : (stryCov_9fa48("20151"), []))),
        targetParticipation: stryMutAct_9fa48("20154") ? startupRecovery.targetParticipation && null : stryMutAct_9fa48("20153") ? false : stryMutAct_9fa48("20152") ? true : (stryCov_9fa48("20152", "20153", "20154"), startupRecovery.targetParticipation || null)
      }) : priorityRecoveryDetails);
      return response;
    }
  }
  getStartupAuthoritySnapshot(observedAt = Date.now()) {
    if (stryMutAct_9fa48("20155")) {
      {}
    } else {
      stryCov_9fa48("20155");
      const service = this.getControlPlaneReadinessService();
      if (stryMutAct_9fa48("20158") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("20157") ? false : stryMutAct_9fa48("20156") ? true : (stryCov_9fa48("20156", "20157", "20158"), (stryMutAct_9fa48("20159") ? service : (stryCov_9fa48("20159"), !service)) || (stryMutAct_9fa48("20161") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("20160") ? false : (stryCov_9fa48("20160", "20161"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20162")) {
          {}
        } else {
          stryCov_9fa48("20162");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("20163")) {
          {}
        } else {
          stryCov_9fa48("20163");
          if (stryMutAct_9fa48("20166") ? typeof service.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("20165") ? false : stryMutAct_9fa48("20164") ? true : (stryCov_9fa48("20164", "20165", "20166"), typeof service.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("20167")) {
              {}
            } else {
              stryCov_9fa48("20167");
              return service.getStartupAuthoritySnapshotSync(this.getSeedNodeId(), observedAt);
            }
          }
          if (stryMutAct_9fa48("20170") ? typeof service.getStartupAuthoritySnapshot === TYPEOF.FUNCTION : stryMutAct_9fa48("20169") ? false : stryMutAct_9fa48("20168") ? true : (stryCov_9fa48("20168", "20169", "20170"), typeof service.getStartupAuthoritySnapshot !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("20171")) {
              {}
            } else {
              stryCov_9fa48("20171");
              return null;
            }
          }
          const startupAuthority = service.getStartupAuthoritySnapshot(this.getSeedNodeId(), observedAt);
          if (stryMutAct_9fa48("20174") ? startupAuthority || typeof startupAuthority.then === TYPEOF.FUNCTION : stryMutAct_9fa48("20173") ? false : stryMutAct_9fa48("20172") ? true : (stryCov_9fa48("20172", "20173", "20174"), startupAuthority && (stryMutAct_9fa48("20176") ? typeof startupAuthority.then !== TYPEOF.FUNCTION : stryMutAct_9fa48("20175") ? true : (stryCov_9fa48("20175", "20176"), typeof startupAuthority.then === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("20177")) {
              {}
            } else {
              stryCov_9fa48("20177");
              return null;
            }
          }
          return startupAuthority;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("20178")) {
          {}
        } else {
          stryCov_9fa48("20178");
          return null;
        }
      }
    }
  }
  appendPriorityRecoveryProtocolFields(response, details) {
    if (stryMutAct_9fa48("20179")) {
      {}
    } else {
      stryCov_9fa48("20179");
      if (stryMutAct_9fa48("20182") ? (!response || typeof response !== TYPEOF.OBJECT || !details) && typeof details !== TYPEOF.OBJECT : stryMutAct_9fa48("20181") ? false : stryMutAct_9fa48("20180") ? true : (stryCov_9fa48("20180", "20181", "20182"), (stryMutAct_9fa48("20184") ? (!response || typeof response !== TYPEOF.OBJECT) && !details : stryMutAct_9fa48("20183") ? false : (stryCov_9fa48("20183", "20184"), (stryMutAct_9fa48("20186") ? !response && typeof response !== TYPEOF.OBJECT : stryMutAct_9fa48("20185") ? false : (stryCov_9fa48("20185", "20186"), (stryMutAct_9fa48("20187") ? response : (stryCov_9fa48("20187"), !response)) || (stryMutAct_9fa48("20189") ? typeof response === TYPEOF.OBJECT : stryMutAct_9fa48("20188") ? false : (stryCov_9fa48("20188", "20189"), typeof response !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("20190") ? details : (stryCov_9fa48("20190"), !details)))) || (stryMutAct_9fa48("20192") ? typeof details === TYPEOF.OBJECT : stryMutAct_9fa48("20191") ? false : (stryCov_9fa48("20191", "20192"), typeof details !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20193")) {
          {}
        } else {
          stryCov_9fa48("20193");
          return response;
        }
      }
      if (stryMutAct_9fa48("20196") ? typeof details.recoveryProtocolState === TYPEOF.STRING || details.recoveryProtocolState.length > NUM.ZERO : stryMutAct_9fa48("20195") ? false : stryMutAct_9fa48("20194") ? true : (stryCov_9fa48("20194", "20195", "20196"), (stryMutAct_9fa48("20198") ? typeof details.recoveryProtocolState !== TYPEOF.STRING : stryMutAct_9fa48("20197") ? true : (stryCov_9fa48("20197", "20198"), typeof details.recoveryProtocolState === TYPEOF.STRING)) && (stryMutAct_9fa48("20201") ? details.recoveryProtocolState.length <= NUM.ZERO : stryMutAct_9fa48("20200") ? details.recoveryProtocolState.length >= NUM.ZERO : stryMutAct_9fa48("20199") ? true : (stryCov_9fa48("20199", "20200", "20201"), details.recoveryProtocolState.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20202")) {
          {}
        } else {
          stryCov_9fa48("20202");
          response.recoveryProtocolState = details.recoveryProtocolState;
        }
      }
      if (stryMutAct_9fa48("20205") ? Array.isArray(details.priorityRecoveryReasonCodes) || details.priorityRecoveryReasonCodes.length > NUM.ZERO : stryMutAct_9fa48("20204") ? false : stryMutAct_9fa48("20203") ? true : (stryCov_9fa48("20203", "20204", "20205"), Array.isArray(details.priorityRecoveryReasonCodes) && (stryMutAct_9fa48("20208") ? details.priorityRecoveryReasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("20207") ? details.priorityRecoveryReasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("20206") ? true : (stryCov_9fa48("20206", "20207", "20208"), details.priorityRecoveryReasonCodes.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20209")) {
          {}
        } else {
          stryCov_9fa48("20209");
          response.priorityRecoveryReasonCodes = Object.freeze(stryMutAct_9fa48("20210") ? [] : (stryCov_9fa48("20210"), [...details.priorityRecoveryReasonCodes]));
        }
      }
      if (stryMutAct_9fa48("20213") ? details.targetParticipation || typeof details.targetParticipation === TYPEOF.OBJECT : stryMutAct_9fa48("20212") ? false : stryMutAct_9fa48("20211") ? true : (stryCov_9fa48("20211", "20212", "20213"), details.targetParticipation && (stryMutAct_9fa48("20215") ? typeof details.targetParticipation !== TYPEOF.OBJECT : stryMutAct_9fa48("20214") ? true : (stryCov_9fa48("20214", "20215"), typeof details.targetParticipation === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20216")) {
          {}
        } else {
          stryCov_9fa48("20216");
          response.targetParticipation = details.targetParticipation;
        }
      }
      return response;
    }
  }
  appendMembershipPublicationFields(response, snapshot) {
    if (stryMutAct_9fa48("20217")) {
      {}
    } else {
      stryCov_9fa48("20217");
      if (stryMutAct_9fa48("20220") ? !response && typeof response !== TYPEOF.OBJECT : stryMutAct_9fa48("20219") ? false : stryMutAct_9fa48("20218") ? true : (stryCov_9fa48("20218", "20219", "20220"), (stryMutAct_9fa48("20221") ? response : (stryCov_9fa48("20221"), !response)) || (stryMutAct_9fa48("20223") ? typeof response === TYPEOF.OBJECT : stryMutAct_9fa48("20222") ? false : (stryCov_9fa48("20222", "20223"), typeof response !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20224")) {
          {}
        } else {
          stryCov_9fa48("20224");
          return response;
        }
      }
      const membershipPublication = this.getMembershipPublicationDiagnostics(stryMutAct_9fa48("20225") ? snapshot.timestamp : (stryCov_9fa48("20225"), snapshot?.timestamp));
      if (stryMutAct_9fa48("20228") ? false : stryMutAct_9fa48("20227") ? true : stryMutAct_9fa48("20226") ? membershipPublication : (stryCov_9fa48("20226", "20227", "20228"), !membershipPublication)) {
        if (stryMutAct_9fa48("20229")) {
          {}
        } else {
          stryCov_9fa48("20229");
          return response;
        }
      }
      if (stryMutAct_9fa48("20231") ? false : stryMutAct_9fa48("20230") ? true : (stryCov_9fa48("20230", "20231"), Number.isFinite(membershipPublication.publicationEpoch))) {
        if (stryMutAct_9fa48("20232")) {
          {}
        } else {
          stryCov_9fa48("20232");
          response.publishedControlPlaneEpoch = stryMutAct_9fa48("20233") ? Math.min(NUM.ZERO, Math.floor(membershipPublication.publicationEpoch)) : (stryCov_9fa48("20233"), Math.max(NUM.ZERO, Math.floor(membershipPublication.publicationEpoch)));
        }
      }
      if (stryMutAct_9fa48("20236") ? typeof membershipPublication.status === TYPEOF.STRING || membershipPublication.status.length > NUM.ZERO : stryMutAct_9fa48("20235") ? false : stryMutAct_9fa48("20234") ? true : (stryCov_9fa48("20234", "20235", "20236"), (stryMutAct_9fa48("20238") ? typeof membershipPublication.status !== TYPEOF.STRING : stryMutAct_9fa48("20237") ? true : (stryCov_9fa48("20237", "20238"), typeof membershipPublication.status === TYPEOF.STRING)) && (stryMutAct_9fa48("20241") ? membershipPublication.status.length <= NUM.ZERO : stryMutAct_9fa48("20240") ? membershipPublication.status.length >= NUM.ZERO : stryMutAct_9fa48("20239") ? true : (stryCov_9fa48("20239", "20240", "20241"), membershipPublication.status.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20242")) {
          {}
        } else {
          stryCov_9fa48("20242");
          response.publishedControlPlaneStatus = membershipPublication.status;
        }
      }
      return response;
    }
  }
  getMembershipPublicationDiagnostics(observedAt) {
    if (stryMutAct_9fa48("20243")) {
      {}
    } else {
      stryCov_9fa48("20243");
      const service = this.getControlPlaneReadinessService();
      if (stryMutAct_9fa48("20246") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("20245") ? false : stryMutAct_9fa48("20244") ? true : (stryCov_9fa48("20244", "20245", "20246"), (stryMutAct_9fa48("20247") ? service : (stryCov_9fa48("20247"), !service)) || (stryMutAct_9fa48("20249") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("20248") ? false : (stryCov_9fa48("20248", "20249"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20250")) {
          {}
        } else {
          stryCov_9fa48("20250");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("20251")) {
          {}
        } else {
          stryCov_9fa48("20251");
          if (stryMutAct_9fa48("20254") ? typeof service.getMembershipPublicationDiagnosticsSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("20253") ? false : stryMutAct_9fa48("20252") ? true : (stryCov_9fa48("20252", "20253", "20254"), typeof service.getMembershipPublicationDiagnosticsSync === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("20255")) {
              {}
            } else {
              stryCov_9fa48("20255");
              return service.getMembershipPublicationDiagnosticsSync(this.getSeedNodeId(), observedAt);
            }
          }
          if (stryMutAct_9fa48("20258") ? typeof service.getMembershipPublicationDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("20257") ? false : stryMutAct_9fa48("20256") ? true : (stryCov_9fa48("20256", "20257", "20258"), typeof service.getMembershipPublicationDiagnostics !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("20259")) {
              {}
            } else {
              stryCov_9fa48("20259");
              return null;
            }
          }
          const diagnostics = service.getMembershipPublicationDiagnostics(this.getSeedNodeId(), observedAt);
          if (stryMutAct_9fa48("20262") ? diagnostics || typeof diagnostics.then === TYPEOF.FUNCTION : stryMutAct_9fa48("20261") ? false : stryMutAct_9fa48("20260") ? true : (stryCov_9fa48("20260", "20261", "20262"), diagnostics && (stryMutAct_9fa48("20264") ? typeof diagnostics.then !== TYPEOF.FUNCTION : stryMutAct_9fa48("20263") ? true : (stryCov_9fa48("20263", "20264"), typeof diagnostics.then === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("20265")) {
              {}
            } else {
              stryCov_9fa48("20265");
              return null;
            }
          }
          return diagnostics;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("20266")) {
          {}
        } else {
          stryCov_9fa48("20266");
          return null;
        }
      }
    }
  }
  buildMembershipPublicationPlanningSnapshot(membershipPublication, observedAt = Date.now()) {
    if (stryMutAct_9fa48("20267")) {
      {}
    } else {
      stryCov_9fa48("20267");
      const service = this.getControlPlaneReadinessService();
      if (stryMutAct_9fa48("20270") ? service || typeof service.buildMembershipPublicationPlanningSnapshot === TYPEOF.FUNCTION : stryMutAct_9fa48("20269") ? false : stryMutAct_9fa48("20268") ? true : (stryCov_9fa48("20268", "20269", "20270"), service && (stryMutAct_9fa48("20272") ? typeof service.buildMembershipPublicationPlanningSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("20271") ? true : (stryCov_9fa48("20271", "20272"), typeof service.buildMembershipPublicationPlanningSnapshot === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("20273")) {
          {}
        } else {
          stryCov_9fa48("20273");
          try {
            if (stryMutAct_9fa48("20274")) {
              {}
            } else {
              stryCov_9fa48("20274");
              return service.buildMembershipPublicationPlanningSnapshot(stryMutAct_9fa48("20275") ? {} : (stryCov_9fa48("20275"), {
                nodeId: this.getSeedNodeId(),
                observedAt,
                membershipPublication
              }));
            }
          } catch (_error) {
            // Fall back to local normalization when the readiness service does not
            // expose the shared helper contract cleanly.
          }
        }
      }
      return buildPublicationRecoveryProtocolSnapshot(membershipPublication, stryMutAct_9fa48("20276") ? {} : (stryCov_9fa48("20276"), {
        targetNodeId: this.getSeedNodeId()
      }));
    }
  }
  logBootstrapJoinReadinessProjection(snapshot, response) {
    if (stryMutAct_9fa48("20277")) {
      {}
    } else {
      stryCov_9fa48("20277");
      const logger = this.getLogger();
      if (stryMutAct_9fa48("20280") ? !logger && typeof logger.info !== TYPEOF.FUNCTION : stryMutAct_9fa48("20279") ? false : stryMutAct_9fa48("20278") ? true : (stryCov_9fa48("20278", "20279", "20280"), (stryMutAct_9fa48("20281") ? logger : (stryCov_9fa48("20281"), !logger)) || (stryMutAct_9fa48("20283") ? typeof logger.info === TYPEOF.FUNCTION : stryMutAct_9fa48("20282") ? false : (stryCov_9fa48("20282", "20283"), typeof logger.info !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("20284")) {
          {}
        } else {
          stryCov_9fa48("20284");
          return;
        }
      }
      if (stryMutAct_9fa48("20287") ? snapshot?.ready !== true : stryMutAct_9fa48("20286") ? false : stryMutAct_9fa48("20285") ? true : (stryCov_9fa48("20285", "20286", "20287"), (stryMutAct_9fa48("20288") ? snapshot.ready : (stryCov_9fa48("20288"), snapshot?.ready)) === (stryMutAct_9fa48("20289") ? false : (stryCov_9fa48("20289"), true)))) {
        if (stryMutAct_9fa48("20290")) {
          {}
        } else {
          stryCov_9fa48("20290");
          this.lastBootstrapJoinBlockedSignature = null;
          this.lastBootstrapJoinProjectionEvaluation = null;
          return;
        }
      }
      const bootstrapService = this.getBootstrapService();
      const leaderStatus = this.getLeaderReadinessStatusForProbe();
      const localQueryTransportReadiness = this.getLocalQueryTransportReadiness();
      const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
      const membershipPublication = this.getMembershipPublicationDiagnostics(stryMutAct_9fa48("20291") ? response.timestamp : (stryCov_9fa48("20291"), response?.timestamp));
      const projectionEvaluation = (stryMutAct_9fa48("20294") ? this.lastBootstrapJoinProjectionEvaluation || typeof this.lastBootstrapJoinProjectionEvaluation === TYPEOF.OBJECT : stryMutAct_9fa48("20293") ? false : stryMutAct_9fa48("20292") ? true : (stryCov_9fa48("20292", "20293", "20294"), this.lastBootstrapJoinProjectionEvaluation && (stryMutAct_9fa48("20296") ? typeof this.lastBootstrapJoinProjectionEvaluation !== TYPEOF.OBJECT : stryMutAct_9fa48("20295") ? true : (stryCov_9fa48("20295", "20296"), typeof this.lastBootstrapJoinProjectionEvaluation === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("20297") ? {} : (stryCov_9fa48("20297"), {
        canProjectReady: stryMutAct_9fa48("20300") ? this.lastBootstrapJoinProjectionEvaluation.canProjectReady !== true : stryMutAct_9fa48("20299") ? false : stryMutAct_9fa48("20298") ? true : (stryCov_9fa48("20298", "20299", "20300"), this.lastBootstrapJoinProjectionEvaluation.canProjectReady === (stryMutAct_9fa48("20301") ? false : (stryCov_9fa48("20301"), true))),
        projectionRule: stryMutAct_9fa48("20304") ? this.lastBootstrapJoinProjectionEvaluation.projectionRule && null : stryMutAct_9fa48("20303") ? false : stryMutAct_9fa48("20302") ? true : (stryCov_9fa48("20302", "20303", "20304"), this.lastBootstrapJoinProjectionEvaluation.projectionRule || null),
        blockerReason: stryMutAct_9fa48("20307") ? this.lastBootstrapJoinProjectionEvaluation.blockerReason && null : stryMutAct_9fa48("20306") ? false : stryMutAct_9fa48("20305") ? true : (stryCov_9fa48("20305", "20306", "20307"), this.lastBootstrapJoinProjectionEvaluation.blockerReason || null),
        normalizedPhase: stryMutAct_9fa48("20310") ? this.lastBootstrapJoinProjectionEvaluation.normalizedPhase && null : stryMutAct_9fa48("20309") ? false : stryMutAct_9fa48("20308") ? true : (stryCov_9fa48("20308", "20309", "20310"), this.lastBootstrapJoinProjectionEvaluation.normalizedPhase || null),
        reasons: Array.isArray(this.lastBootstrapJoinProjectionEvaluation.reasons) ? this.lastBootstrapJoinProjectionEvaluation.reasons : stryMutAct_9fa48("20311") ? ["Stryker was here"] : (stryCov_9fa48("20311"), []),
        blockingReasons: Array.isArray(this.lastBootstrapJoinProjectionEvaluation.blockingReasons) ? this.lastBootstrapJoinProjectionEvaluation.blockingReasons : stryMutAct_9fa48("20312") ? ["Stryker was here"] : (stryCov_9fa48("20312"), [])
      }) : null;
      const messageRouter = stryMutAct_9fa48("20315") ? (this.getMessageRouter() || bootstrapService?.messageRouter) && null : stryMutAct_9fa48("20314") ? false : stryMutAct_9fa48("20313") ? true : (stryCov_9fa48("20313", "20314", "20315"), (stryMutAct_9fa48("20317") ? this.getMessageRouter() && bootstrapService?.messageRouter : stryMutAct_9fa48("20316") ? false : (stryCov_9fa48("20316", "20317"), this.getMessageRouter() || (stryMutAct_9fa48("20318") ? bootstrapService.messageRouter : (stryCov_9fa48("20318"), bootstrapService?.messageRouter)))) || null);
      const logPayload = stryMutAct_9fa48("20319") ? {} : (stryCov_9fa48("20319"), {
        nodeId: this.getSeedNodeId(),
        phase: stryMutAct_9fa48("20322") ? response?.phase && null : stryMutAct_9fa48("20321") ? false : stryMutAct_9fa48("20320") ? true : (stryCov_9fa48("20320", "20321", "20322"), (stryMutAct_9fa48("20323") ? response.phase : (stryCov_9fa48("20323"), response?.phase)) || null),
        state: stryMutAct_9fa48("20326") ? response?.state && null : stryMutAct_9fa48("20325") ? false : stryMutAct_9fa48("20324") ? true : (stryCov_9fa48("20324", "20325", "20326"), (stryMutAct_9fa48("20327") ? response.state : (stryCov_9fa48("20327"), response?.state)) || null),
        reasons: Array.isArray(stryMutAct_9fa48("20328") ? response.reasons : (stryCov_9fa48("20328"), response?.reasons)) ? response.reasons : stryMutAct_9fa48("20329") ? ["Stryker was here"] : (stryCov_9fa48("20329"), []),
        bootstrapServicePhase: stryMutAct_9fa48("20332") ? bootstrapService?.phase && null : stryMutAct_9fa48("20331") ? false : stryMutAct_9fa48("20330") ? true : (stryCov_9fa48("20330", "20331", "20332"), (stryMutAct_9fa48("20333") ? bootstrapService.phase : (stryCov_9fa48("20333"), bootstrapService?.phase)) || null),
        hasSqlQueryEngine: Boolean(this.getSqlQueryEngine()),
        hasMessageRouter: Boolean(messageRouter),
        leaderStatus,
        localQueryTransportReadiness,
        controlPlaneWriteHealth,
        publishedControlPlaneEpoch: stryMutAct_9fa48("20334") ? membershipPublication?.publicationEpoch && null : (stryCov_9fa48("20334"), (stryMutAct_9fa48("20335") ? membershipPublication.publicationEpoch : (stryCov_9fa48("20335"), membershipPublication?.publicationEpoch)) ?? null),
        publishedControlPlaneStatus: stryMutAct_9fa48("20336") ? membershipPublication?.status && null : (stryCov_9fa48("20336"), (stryMutAct_9fa48("20337") ? membershipPublication.status : (stryCov_9fa48("20337"), membershipPublication?.status)) ?? null),
        projectionEvaluation
      });
      const signature = JSON.stringify(stryMutAct_9fa48("20338") ? {} : (stryCov_9fa48("20338"), {
        phase: logPayload.phase,
        state: logPayload.state,
        reasons: logPayload.reasons,
        bootstrapServicePhase: logPayload.bootstrapServicePhase,
        hasSqlQueryEngine: logPayload.hasSqlQueryEngine,
        hasMessageRouter: logPayload.hasMessageRouter,
        leaderReady: stryMutAct_9fa48("20341") ? leaderStatus?.ready !== true : stryMutAct_9fa48("20340") ? false : stryMutAct_9fa48("20339") ? true : (stryCov_9fa48("20339", "20340", "20341"), (stryMutAct_9fa48("20342") ? leaderStatus.ready : (stryCov_9fa48("20342"), leaderStatus?.ready)) === (stryMutAct_9fa48("20343") ? false : (stryCov_9fa48("20343"), true))),
        localQueryTransportReady: isLocalQueryTransportReady(localQueryTransportReadiness),
        controlPlaneWriteHealthy: stryMutAct_9fa48("20346") ? controlPlaneWriteHealth?.healthy !== true : stryMutAct_9fa48("20345") ? false : stryMutAct_9fa48("20344") ? true : (stryCov_9fa48("20344", "20345", "20346"), (stryMutAct_9fa48("20347") ? controlPlaneWriteHealth.healthy : (stryCov_9fa48("20347"), controlPlaneWriteHealth?.healthy)) === (stryMutAct_9fa48("20348") ? false : (stryCov_9fa48("20348"), true))),
        publishedControlPlaneEpoch: logPayload.publishedControlPlaneEpoch,
        publishedControlPlaneStatus: logPayload.publishedControlPlaneStatus,
        projectionEvaluation
      }));
      if (stryMutAct_9fa48("20351") ? signature !== this.lastBootstrapJoinBlockedSignature : stryMutAct_9fa48("20350") ? false : stryMutAct_9fa48("20349") ? true : (stryCov_9fa48("20349", "20350", "20351"), signature === this.lastBootstrapJoinBlockedSignature)) {
        if (stryMutAct_9fa48("20352")) {
          {}
        } else {
          stryCov_9fa48("20352");
          return;
        }
      }
      this.lastBootstrapJoinBlockedSignature = signature;
      logger.info(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_JOIN_READINESS_BLOCKED, logPayload);
    }
  }
  evaluateReadinessSnapshot() {
    if (stryMutAct_9fa48("20353")) {
      {}
    } else {
      stryCov_9fa48("20353");
      const readinessState = this.getReadinessState();
      if (stryMutAct_9fa48("20356") ? !readinessState && typeof readinessState.setDependency !== TYPEOF.FUNCTION : stryMutAct_9fa48("20355") ? false : stryMutAct_9fa48("20354") ? true : (stryCov_9fa48("20354", "20355", "20356"), (stryMutAct_9fa48("20357") ? readinessState : (stryCov_9fa48("20357"), !readinessState)) || (stryMutAct_9fa48("20359") ? typeof readinessState.setDependency === TYPEOF.FUNCTION : stryMutAct_9fa48("20358") ? false : (stryCov_9fa48("20358", "20359"), typeof readinessState.setDependency !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("20360")) {
          {}
        } else {
          stryCov_9fa48("20360");
          if (stryMutAct_9fa48("20363") ? typeof readinessState?.evaluate !== TYPEOF.FUNCTION : stryMutAct_9fa48("20362") ? false : stryMutAct_9fa48("20361") ? true : (stryCov_9fa48("20361", "20362", "20363"), typeof (stryMutAct_9fa48("20364") ? readinessState.evaluate : (stryCov_9fa48("20364"), readinessState?.evaluate)) === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("20365")) {
              {}
            } else {
              stryCov_9fa48("20365");
              return readinessState.evaluate();
            }
          }
          if (stryMutAct_9fa48("20368") ? typeof readinessState?.getSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("20367") ? false : stryMutAct_9fa48("20366") ? true : (stryCov_9fa48("20366", "20367", "20368"), typeof (stryMutAct_9fa48("20369") ? readinessState.getSnapshot : (stryCov_9fa48("20369"), readinessState?.getSnapshot)) === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("20370")) {
              {}
            } else {
              stryCov_9fa48("20370");
              return readinessState.getSnapshot();
            }
          }
          return stryMutAct_9fa48("20371") ? {} : (stryCov_9fa48("20371"), {
            ready: stryMutAct_9fa48("20372") ? true : (stryCov_9fa48("20372"), false),
            phase: LIFECYCLE_PHASE.INIT,
            state: BOOTSTRAP_PHASE.NOT_STARTED,
            reasons: stryMutAct_9fa48("20373") ? [] : (stryCov_9fa48("20373"), [BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE]),
            retryAfterMs: NUM.ZERO,
            timestamp: Date.now()
          });
        }
      }
      const priorityControlPlaneRecoveryHealth = this.getPriorityControlPlaneRecoveryHealth();
      return this.evaluateReadinessSnapshotWithPriorityRecoveryHealth(readinessState, priorityControlPlaneRecoveryHealth);
    }
  }
  async evaluateReadinessSnapshotAsync() {
    if (stryMutAct_9fa48("20374")) {
      {}
    } else {
      stryCov_9fa48("20374");
      const readinessState = this.getReadinessState();
      if (stryMutAct_9fa48("20377") ? !readinessState && typeof readinessState.setDependency !== TYPEOF.FUNCTION : stryMutAct_9fa48("20376") ? false : stryMutAct_9fa48("20375") ? true : (stryCov_9fa48("20375", "20376", "20377"), (stryMutAct_9fa48("20378") ? readinessState : (stryCov_9fa48("20378"), !readinessState)) || (stryMutAct_9fa48("20380") ? typeof readinessState.setDependency === TYPEOF.FUNCTION : stryMutAct_9fa48("20379") ? false : (stryCov_9fa48("20379", "20380"), typeof readinessState.setDependency !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("20381")) {
          {}
        } else {
          stryCov_9fa48("20381");
          return this.evaluateReadinessSnapshot();
        }
      }
      const priorityControlPlaneRecoveryHealth = await this.getPriorityControlPlaneRecoveryHealthAsync();
      return this.evaluateReadinessSnapshotWithPriorityRecoveryHealth(readinessState, priorityControlPlaneRecoveryHealth);
    }
  }

  /**
   * Evaluate readiness for HTTP probe handlers with a bounded async window.
   * Under sustained control-plane pressure, async diagnostics can stall long
   * enough to make probes time out; in that case probes should degrade to the
   * latest synchronous owner snapshot instead of hanging the endpoint.
   *
   * Non-timeout async failures remain fail-closed through the async owner path.
   *
   * @return {Promise<Object>}
   */
  async evaluateReadinessSnapshotForProbe() {
    if (stryMutAct_9fa48("20382")) {
      {}
    } else {
      stryCov_9fa48("20382");
      try {
        if (stryMutAct_9fa48("20383")) {
          {}
        } else {
          stryCov_9fa48("20383");
          return await this.evaluateReadinessSnapshotAsyncWithTimeout(READINESS_PROBE_ASYNC_TIMEOUT_MS);
        }
      } catch (error) {
        if (stryMutAct_9fa48("20384")) {
          {}
        } else {
          stryCov_9fa48("20384");
          if (stryMutAct_9fa48("20387") ? false : stryMutAct_9fa48("20386") ? true : stryMutAct_9fa48("20385") ? this.isReadinessProbeAsyncTimeout(error) : (stryCov_9fa48("20385", "20386", "20387"), !this.isReadinessProbeAsyncTimeout(error))) {
            if (stryMutAct_9fa48("20388")) {
              {}
            } else {
              stryCov_9fa48("20388");
              throw error;
            }
          }
          stryMutAct_9fa48("20390") ? this.getLogger().debug?.(BOOTSTRAP_READINESS_OWNER_LITERAL.READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING + BOOTSTRAP_READINESS_OWNER_LITERAL.SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK, {
            seedNodeId: this.getSeedNodeId(),
            timeoutMs: READINESS_PROBE_ASYNC_TIMEOUT_MS
          }) : stryMutAct_9fa48("20389") ? this.getLogger()?.debug(BOOTSTRAP_READINESS_OWNER_LITERAL.READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING + BOOTSTRAP_READINESS_OWNER_LITERAL.SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK, {
            seedNodeId: this.getSeedNodeId(),
            timeoutMs: READINESS_PROBE_ASYNC_TIMEOUT_MS
          }) : (stryCov_9fa48("20389", "20390"), this.getLogger()?.debug?.(stryMutAct_9fa48("20391") ? BOOTSTRAP_READINESS_OWNER_LITERAL.READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING - BOOTSTRAP_READINESS_OWNER_LITERAL.SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK : (stryCov_9fa48("20391"), BOOTSTRAP_READINESS_OWNER_LITERAL.READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING + BOOTSTRAP_READINESS_OWNER_LITERAL.SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK), stryMutAct_9fa48("20392") ? {} : (stryCov_9fa48("20392"), {
            seedNodeId: this.getSeedNodeId(),
            timeoutMs: READINESS_PROBE_ASYNC_TIMEOUT_MS
          })));
          return this.evaluateReadinessSnapshot();
        }
      }
    }
  }

  /**
   * @param {number} timeoutMs
   * @return {Promise<Object>}
   */
  async evaluateReadinessSnapshotAsyncWithTimeout(timeoutMs) {
    if (stryMutAct_9fa48("20393")) {
      {}
    } else {
      stryCov_9fa48("20393");
      let timeoutHandle = null;
      const timeoutPromise = new Promise((_, reject) => {
        if (stryMutAct_9fa48("20394")) {
          {}
        } else {
          stryCov_9fa48("20394");
          timeoutHandle = setTimeout(() => {
            if (stryMutAct_9fa48("20395")) {
              {}
            } else {
              stryCov_9fa48("20395");
              const timeoutError = new Error((stryMutAct_9fa48("20396") ? "" : (stryCov_9fa48("20396"), 'Readiness probe async diagnostics timed out after ')) + (stryMutAct_9fa48("20397") ? `` : (stryCov_9fa48("20397"), `${timeoutMs}ms`)));
              timeoutError.code = READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE;
              reject(timeoutError);
            }
          }, timeoutMs);
        }
      });
      try {
        if (stryMutAct_9fa48("20398")) {
          {}
        } else {
          stryCov_9fa48("20398");
          return await Promise.race(stryMutAct_9fa48("20399") ? [] : (stryCov_9fa48("20399"), [this.evaluateReadinessSnapshotAsync(), timeoutPromise]));
        }
      } finally {
        if (stryMutAct_9fa48("20400")) {
          {}
        } else {
          stryCov_9fa48("20400");
          if (stryMutAct_9fa48("20402") ? false : stryMutAct_9fa48("20401") ? true : (stryCov_9fa48("20401", "20402"), timeoutHandle)) {
            if (stryMutAct_9fa48("20403")) {
              {}
            } else {
              stryCov_9fa48("20403");
              clearTimeout(timeoutHandle);
            }
          }
        }
      }
    }
  }

  /**
   * @param {Error|Object|null} error
   * @return {boolean}
   */
  isReadinessProbeAsyncTimeout(error) {
    if (stryMutAct_9fa48("20404")) {
      {}
    } else {
      stryCov_9fa48("20404");
      return stryMutAct_9fa48("20407") ? error?.code !== READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE : stryMutAct_9fa48("20406") ? false : stryMutAct_9fa48("20405") ? true : (stryCov_9fa48("20405", "20406", "20407"), (stryMutAct_9fa48("20408") ? error.code : (stryCov_9fa48("20408"), error?.code)) === READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE);
    }
  }
  evaluateReadinessSnapshotWithPriorityRecoveryHealth(readinessState, priorityControlPlaneRecoveryHealth) {
    if (stryMutAct_9fa48("20409")) {
      {}
    } else {
      stryCov_9fa48("20409");
      const startupAuthority = this.getStartupAuthoritySnapshot(Date.now());
      const startupComplete = this.isStartupComplete();
      readinessState.setDependency(READINESS_DEPENDENCY.STARTUP_COMPLETE, startupComplete, stryMutAct_9fa48("20410") ? {} : (stryCov_9fa48("20410"), {
        reasonCode: BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
        details: stryMutAct_9fa48("20411") ? {} : (stryCov_9fa48("20411"), {
          phase: stryMutAct_9fa48("20414") ? this.getBootstrapService()?.phase && null : stryMutAct_9fa48("20413") ? false : stryMutAct_9fa48("20412") ? true : (stryCov_9fa48("20412", "20413", "20414"), (stryMutAct_9fa48("20415") ? this.getBootstrapService().phase : (stryCov_9fa48("20415"), this.getBootstrapService()?.phase)) || null)
        })
      }));
      readinessState.setDependency(BOOTSTRAP_READINESS_DEPENDENCY.SQL_ENGINE_READY, this.isSqlEngineDependencyReady(), stryMutAct_9fa48("20416") ? {} : (stryCov_9fa48("20416"), {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE
      }));
      const leaderStatus = this.getLeaderReadinessStatusForProbe();
      readinessState.setDependency(BOOTSTRAP_READINESS_DEPENDENCY.LEADER_METADATA_READY, stryMutAct_9fa48("20419") ? leaderStatus.ready !== true : stryMutAct_9fa48("20418") ? false : stryMutAct_9fa48("20417") ? true : (stryCov_9fa48("20417", "20418", "20419"), leaderStatus.ready === (stryMutAct_9fa48("20420") ? false : (stryCov_9fa48("20420"), true))), stryMutAct_9fa48("20421") ? {} : (stryCov_9fa48("20421"), {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
        details: leaderStatus
      }));
      readinessState.setDependency(BOOTSTRAP_READINESS_DEPENDENCY.RUNTIME_WIRING_READY, this.isRuntimeWiringReady(), stryMutAct_9fa48("20422") ? {} : (stryCov_9fa48("20422"), {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY
      }));
      const localQueryTransportReadiness = this.getLocalQueryTransportReadiness();
      const requiresLocalQueryTransport = this.shouldRequireLocalQueryTransportReadiness();
      readinessState.setDependency(BOOTSTRAP_READINESS_DEPENDENCY.LOCAL_QUERY_TRANSPORT_READY, stryMutAct_9fa48("20425") ? !requiresLocalQueryTransport && isLocalQueryTransportReady(localQueryTransportReadiness) : stryMutAct_9fa48("20424") ? false : stryMutAct_9fa48("20423") ? true : (stryCov_9fa48("20423", "20424", "20425"), (stryMutAct_9fa48("20426") ? requiresLocalQueryTransport : (stryCov_9fa48("20426"), !requiresLocalQueryTransport)) || isLocalQueryTransportReady(localQueryTransportReadiness)), stryMutAct_9fa48("20427") ? {} : (stryCov_9fa48("20427"), {
        reasonCode: LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
        details: localQueryTransportReadiness
      }));
      const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
      readinessState.setDependency(BOOTSTRAP_READINESS_DEPENDENCY.CONTROL_PLANE_WRITE_HEALTH, stryMutAct_9fa48("20430") ? controlPlaneWriteHealth.healthy !== true : stryMutAct_9fa48("20429") ? false : stryMutAct_9fa48("20428") ? true : (stryCov_9fa48("20428", "20429", "20430"), controlPlaneWriteHealth.healthy === (stryMutAct_9fa48("20431") ? false : (stryCov_9fa48("20431"), true))), stryMutAct_9fa48("20432") ? {} : (stryCov_9fa48("20432"), {
        reasonCode: controlPlaneWriteHealth.reasonCode,
        details: controlPlaneWriteHealth.details,
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD
      }));
      readinessState.setDependency(BOOTSTRAP_READINESS_DEPENDENCY.PRIORITY_CONTROL_PLANE_RECOVERY, stryMutAct_9fa48("20435") ? priorityControlPlaneRecoveryHealth.healthy !== true : stryMutAct_9fa48("20434") ? false : stryMutAct_9fa48("20433") ? true : (stryCov_9fa48("20433", "20434", "20435"), priorityControlPlaneRecoveryHealth.healthy === (stryMutAct_9fa48("20436") ? false : (stryCov_9fa48("20436"), true))), stryMutAct_9fa48("20437") ? {} : (stryCov_9fa48("20437"), {
        reasonCode: priorityControlPlaneRecoveryHealth.reasonCode,
        details: priorityControlPlaneRecoveryHealth.details,
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
        demotionPolicy: LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.IMMEDIATE
      }));
      const snapshot = readinessState.evaluate();
      return stryMutAct_9fa48("20438") ? {} : (stryCov_9fa48("20438"), {
        ...snapshot,
        startupAuthorityState: stryMutAct_9fa48("20441") ? startupAuthority?.state && BOOTSTRAP_READINESS_OWNER_LITERAL.AUTHORITY_UNAVAILABLE : stryMutAct_9fa48("20440") ? false : stryMutAct_9fa48("20439") ? true : (stryCov_9fa48("20439", "20440", "20441"), (stryMutAct_9fa48("20442") ? startupAuthority.state : (stryCov_9fa48("20442"), startupAuthority?.state)) || BOOTSTRAP_READINESS_OWNER_LITERAL.AUTHORITY_UNAVAILABLE),
        startupAuthorityAvailable: stryMutAct_9fa48("20445") ? startupAuthority?.authorityAvailable !== true : stryMutAct_9fa48("20444") ? false : stryMutAct_9fa48("20443") ? true : (stryCov_9fa48("20443", "20444", "20445"), (stryMutAct_9fa48("20446") ? startupAuthority.authorityAvailable : (stryCov_9fa48("20446"), startupAuthority?.authorityAvailable)) === (stryMutAct_9fa48("20447") ? false : (stryCov_9fa48("20447"), true))),
        startupAuthorityFailure: stryMutAct_9fa48("20450") ? startupAuthority?.failure && Object.freeze({
          state: BOOTSTRAP_READINESS_OWNER_LITERAL.NONE
        }) : stryMutAct_9fa48("20449") ? false : stryMutAct_9fa48("20448") ? true : (stryCov_9fa48("20448", "20449", "20450"), (stryMutAct_9fa48("20451") ? startupAuthority.failure : (stryCov_9fa48("20451"), startupAuthority?.failure)) || Object.freeze(stryMutAct_9fa48("20452") ? {} : (stryCov_9fa48("20452"), {
          state: BOOTSTRAP_READINESS_OWNER_LITERAL.NONE
        }))),
        ...((stryMutAct_9fa48("20455") ? startupAuthority?.failure?.state !== BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT : stryMutAct_9fa48("20454") ? false : stryMutAct_9fa48("20453") ? true : (stryCov_9fa48("20453", "20454", "20455"), (stryMutAct_9fa48("20457") ? startupAuthority.failure?.state : stryMutAct_9fa48("20456") ? startupAuthority?.failure.state : (stryCov_9fa48("20456", "20457"), startupAuthority?.failure?.state)) === BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT)) ? stryMutAct_9fa48("20458") ? {} : (stryCov_9fa48("20458"), {
          startupAuthorityFailureReason: startupAuthority.failure.reason
        }) : {}),
        startupAuthorityPublication: stryMutAct_9fa48("20461") ? startupAuthority?.publication && Object.freeze({
          observationState: BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE
        }) : stryMutAct_9fa48("20460") ? false : stryMutAct_9fa48("20459") ? true : (stryCov_9fa48("20459", "20460", "20461"), (stryMutAct_9fa48("20462") ? startupAuthority.publication : (stryCov_9fa48("20462"), startupAuthority?.publication)) || Object.freeze(stryMutAct_9fa48("20463") ? {} : (stryCov_9fa48("20463"), {
          observationState: BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE
        }))),
        startupAuthorityPublicationObservationState: stryMutAct_9fa48("20466") ? startupAuthority?.publication?.observationState && BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE : stryMutAct_9fa48("20465") ? false : stryMutAct_9fa48("20464") ? true : (stryCov_9fa48("20464", "20465", "20466"), (stryMutAct_9fa48("20468") ? startupAuthority.publication?.observationState : stryMutAct_9fa48("20467") ? startupAuthority?.publication.observationState : (stryCov_9fa48("20467", "20468"), startupAuthority?.publication?.observationState)) || BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE),
        bootstrapJoinAuthorityAvailable: stryMutAct_9fa48("20471") ? hasBootstrapJoinAuthority(priorityControlPlaneRecoveryHealth) && startupAuthority?.authorityAvailable === true : stryMutAct_9fa48("20470") ? false : stryMutAct_9fa48("20469") ? true : (stryCov_9fa48("20469", "20470", "20471"), hasBootstrapJoinAuthority(priorityControlPlaneRecoveryHealth) || (stryMutAct_9fa48("20473") ? startupAuthority?.authorityAvailable !== true : stryMutAct_9fa48("20472") ? false : (stryCov_9fa48("20472", "20473"), (stryMutAct_9fa48("20474") ? startupAuthority.authorityAvailable : (stryCov_9fa48("20474"), startupAuthority?.authorityAvailable)) === (stryMutAct_9fa48("20475") ? false : (stryCov_9fa48("20475"), true))))),
        ...((stryMutAct_9fa48("20478") ? startupAuthority?.failure?.state === BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT && typeof priorityControlPlaneRecoveryHealth?.details?.failureReason === TYPEOF.STRING : stryMutAct_9fa48("20477") ? false : stryMutAct_9fa48("20476") ? true : (stryCov_9fa48("20476", "20477", "20478"), (stryMutAct_9fa48("20480") ? startupAuthority?.failure?.state !== BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT : stryMutAct_9fa48("20479") ? false : (stryCov_9fa48("20479", "20480"), (stryMutAct_9fa48("20482") ? startupAuthority.failure?.state : stryMutAct_9fa48("20481") ? startupAuthority?.failure.state : (stryCov_9fa48("20481", "20482"), startupAuthority?.failure?.state)) === BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT)) || (stryMutAct_9fa48("20484") ? typeof priorityControlPlaneRecoveryHealth?.details?.failureReason !== TYPEOF.STRING : stryMutAct_9fa48("20483") ? false : (stryCov_9fa48("20483", "20484"), typeof (stryMutAct_9fa48("20486") ? priorityControlPlaneRecoveryHealth.details?.failureReason : stryMutAct_9fa48("20485") ? priorityControlPlaneRecoveryHealth?.details.failureReason : (stryCov_9fa48("20485", "20486"), priorityControlPlaneRecoveryHealth?.details?.failureReason)) === TYPEOF.STRING)))) ? stryMutAct_9fa48("20487") ? {} : (stryCov_9fa48("20487"), {
          bootstrapJoinAuthorityFailureReason: (stryMutAct_9fa48("20490") ? startupAuthority?.failure?.state !== BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT : stryMutAct_9fa48("20489") ? false : stryMutAct_9fa48("20488") ? true : (stryCov_9fa48("20488", "20489", "20490"), (stryMutAct_9fa48("20492") ? startupAuthority.failure?.state : stryMutAct_9fa48("20491") ? startupAuthority?.failure.state : (stryCov_9fa48("20491", "20492"), startupAuthority?.failure?.state)) === BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT)) ? startupAuthority.failure.reason : priorityControlPlaneRecoveryHealth.details.failureReason
        }) : {})
      });
    }
  }
  getPriorityControlPlaneRecoveryHealth() {
    if (stryMutAct_9fa48("20493")) {
      {}
    } else {
      stryCov_9fa48("20493");
      const service = this.getControlPlaneReadinessService();
      if (stryMutAct_9fa48("20496") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("20495") ? false : stryMutAct_9fa48("20494") ? true : (stryCov_9fa48("20494", "20495", "20496"), (stryMutAct_9fa48("20497") ? service : (stryCov_9fa48("20497"), !service)) || (stryMutAct_9fa48("20499") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("20498") ? false : (stryCov_9fa48("20498", "20499"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20500")) {
          {}
        } else {
          stryCov_9fa48("20500");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE);
        }
      }
      if (stryMutAct_9fa48("20503") ? typeof service.getPriorityControlPlaneRecoveryHealthSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("20502") ? false : stryMutAct_9fa48("20501") ? true : (stryCov_9fa48("20501", "20502", "20503"), typeof service.getPriorityControlPlaneRecoveryHealthSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("20504")) {
          {}
        } else {
          stryCov_9fa48("20504");
          try {
            if (stryMutAct_9fa48("20505")) {
              {}
            } else {
              stryCov_9fa48("20505");
              return service.getPriorityControlPlaneRecoveryHealthSync(this.getSeedNodeId(), Date.now());
            }
          } catch (error) {
            if (stryMutAct_9fa48("20506")) {
              {}
            } else {
              stryCov_9fa48("20506");
              return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED, error);
            }
          }
        }
      }
      if (stryMutAct_9fa48("20509") ? typeof service.getMembershipPublicationDiagnosticsSync === TYPEOF.FUNCTION : stryMutAct_9fa48("20508") ? false : stryMutAct_9fa48("20507") ? true : (stryCov_9fa48("20507", "20508", "20509"), typeof service.getMembershipPublicationDiagnosticsSync !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("20510")) {
          {}
        } else {
          stryCov_9fa48("20510");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_PROVIDER_UNAVAILABLE);
        }
      }
      try {
        if (stryMutAct_9fa48("20511")) {
          {}
        } else {
          stryCov_9fa48("20511");
          const membershipPublication = service.getMembershipPublicationDiagnosticsSync(this.getSeedNodeId(), Date.now());
          return this.buildPriorityControlPlaneRecoveryHealthFromDiagnostics(membershipPublication);
        }
      } catch (error) {
        if (stryMutAct_9fa48("20512")) {
          {}
        } else {
          stryCov_9fa48("20512");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED, error);
        }
      }
    }
  }
  async getPriorityControlPlaneRecoveryHealthAsync() {
    if (stryMutAct_9fa48("20513")) {
      {}
    } else {
      stryCov_9fa48("20513");
      const service = this.getControlPlaneReadinessService();
      if (stryMutAct_9fa48("20516") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("20515") ? false : stryMutAct_9fa48("20514") ? true : (stryCov_9fa48("20514", "20515", "20516"), (stryMutAct_9fa48("20517") ? service : (stryCov_9fa48("20517"), !service)) || (stryMutAct_9fa48("20519") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("20518") ? false : (stryCov_9fa48("20518", "20519"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20520")) {
          {}
        } else {
          stryCov_9fa48("20520");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE);
        }
      }
      if (stryMutAct_9fa48("20523") ? typeof service.getPriorityControlPlaneRecoveryHealth !== TYPEOF.FUNCTION : stryMutAct_9fa48("20522") ? false : stryMutAct_9fa48("20521") ? true : (stryCov_9fa48("20521", "20522", "20523"), typeof service.getPriorityControlPlaneRecoveryHealth === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("20524")) {
          {}
        } else {
          stryCov_9fa48("20524");
          try {
            if (stryMutAct_9fa48("20525")) {
              {}
            } else {
              stryCov_9fa48("20525");
              return await service.getPriorityControlPlaneRecoveryHealth(this.getSeedNodeId(), Date.now());
            }
          } catch (error) {
            if (stryMutAct_9fa48("20526")) {
              {}
            } else {
              stryCov_9fa48("20526");
              return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED, error);
            }
          }
        }
      }
      const observedAt = Date.now();
      const membershipPublicationReader = (stryMutAct_9fa48("20529") ? typeof service.getMembershipPublicationDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("20528") ? false : stryMutAct_9fa48("20527") ? true : (stryCov_9fa48("20527", "20528", "20529"), typeof service.getMembershipPublicationDiagnostics === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("20530") ? () => undefined : (stryCov_9fa48("20530"), () => service.getMembershipPublicationDiagnostics(this.getSeedNodeId(), observedAt)) : (stryMutAct_9fa48("20533") ? typeof service.getMembershipPublicationDiagnosticsSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("20532") ? false : stryMutAct_9fa48("20531") ? true : (stryCov_9fa48("20531", "20532", "20533"), typeof service.getMembershipPublicationDiagnosticsSync === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("20534") ? () => undefined : (stryCov_9fa48("20534"), () => Promise.resolve(service.getMembershipPublicationDiagnosticsSync(this.getSeedNodeId(), observedAt))) : null;
      if (stryMutAct_9fa48("20537") ? false : stryMutAct_9fa48("20536") ? true : stryMutAct_9fa48("20535") ? membershipPublicationReader : (stryCov_9fa48("20535", "20536", "20537"), !membershipPublicationReader)) {
        if (stryMutAct_9fa48("20538")) {
          {}
        } else {
          stryCov_9fa48("20538");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_PROVIDER_UNAVAILABLE);
        }
      }
      try {
        if (stryMutAct_9fa48("20539")) {
          {}
        } else {
          stryCov_9fa48("20539");
          const membershipPublication = await membershipPublicationReader();
          return this.buildPriorityControlPlaneRecoveryHealthFromDiagnostics(membershipPublication);
        }
      } catch (error) {
        if (stryMutAct_9fa48("20540")) {
          {}
        } else {
          stryCov_9fa48("20540");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED, error);
        }
      }
    }
  }
  buildPriorityControlPlaneRecoveryHealthFromDiagnostics(membershipPublication) {
    if (stryMutAct_9fa48("20541")) {
      {}
    } else {
      stryCov_9fa48("20541");
      if (stryMutAct_9fa48("20544") ? !membershipPublication && typeof membershipPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("20543") ? false : stryMutAct_9fa48("20542") ? true : (stryCov_9fa48("20542", "20543", "20544"), (stryMutAct_9fa48("20545") ? membershipPublication : (stryCov_9fa48("20545"), !membershipPublication)) || (stryMutAct_9fa48("20547") ? typeof membershipPublication === TYPEOF.OBJECT : stryMutAct_9fa48("20546") ? false : (stryCov_9fa48("20546", "20547"), typeof membershipPublication !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20548")) {
          {}
        } else {
          stryCov_9fa48("20548");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_UNAVAILABLE);
        }
      }
      const planningSnapshot = this.buildMembershipPublicationPlanningSnapshot(membershipPublication);
      const publicationStatus = stryMutAct_9fa48("20549") ? (planningSnapshot?.publicationStatus ?? membershipPublication?.status) && null : (stryCov_9fa48("20549"), (stryMutAct_9fa48("20550") ? planningSnapshot?.publicationStatus && membershipPublication?.status : (stryCov_9fa48("20550"), (stryMutAct_9fa48("20551") ? planningSnapshot.publicationStatus : (stryCov_9fa48("20551"), planningSnapshot?.publicationStatus)) ?? (stryMutAct_9fa48("20552") ? membershipPublication.status : (stryCov_9fa48("20552"), membershipPublication?.status)))) ?? null);
      if (stryMutAct_9fa48("20555") ? typeof publicationStatus !== TYPEOF.STRING && publicationStatus.length === NUM.ZERO : stryMutAct_9fa48("20554") ? false : stryMutAct_9fa48("20553") ? true : (stryCov_9fa48("20553", "20554", "20555"), (stryMutAct_9fa48("20557") ? typeof publicationStatus === TYPEOF.STRING : stryMutAct_9fa48("20556") ? false : (stryCov_9fa48("20556", "20557"), typeof publicationStatus !== TYPEOF.STRING)) || (stryMutAct_9fa48("20559") ? publicationStatus.length !== NUM.ZERO : stryMutAct_9fa48("20558") ? false : (stryCov_9fa48("20558", "20559"), publicationStatus.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("20560")) {
          {}
        } else {
          stryCov_9fa48("20560");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_INCOMPLETE, null, stryMutAct_9fa48("20561") ? {} : (stryCov_9fa48("20561"), {
            publicationEpoch: stryMutAct_9fa48("20562") ? membershipPublication?.publicationEpoch && null : (stryCov_9fa48("20562"), (stryMutAct_9fa48("20563") ? membershipPublication.publicationEpoch : (stryCov_9fa48("20563"), membershipPublication?.publicationEpoch)) ?? null),
            publicationStatus: stryMutAct_9fa48("20566") ? publicationStatus && null : stryMutAct_9fa48("20565") ? false : stryMutAct_9fa48("20564") ? true : (stryCov_9fa48("20564", "20565", "20566"), publicationStatus || null)
          }));
        }
      }
      const priorityPartitionSummary = stryMutAct_9fa48("20567") ? planningSnapshot?.priorityPartitionSummary && (membershipPublication?.priorityPartitionSummary && typeof membershipPublication.priorityPartitionSummary === TYPEOF.OBJECT ? membershipPublication.priorityPartitionSummary : null) : (stryCov_9fa48("20567"), (stryMutAct_9fa48("20568") ? planningSnapshot.priorityPartitionSummary : (stryCov_9fa48("20568"), planningSnapshot?.priorityPartitionSummary)) ?? ((stryMutAct_9fa48("20571") ? membershipPublication?.priorityPartitionSummary || typeof membershipPublication.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("20570") ? false : stryMutAct_9fa48("20569") ? true : (stryCov_9fa48("20569", "20570", "20571"), (stryMutAct_9fa48("20572") ? membershipPublication.priorityPartitionSummary : (stryCov_9fa48("20572"), membershipPublication?.priorityPartitionSummary)) && (stryMutAct_9fa48("20574") ? typeof membershipPublication.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("20573") ? true : (stryCov_9fa48("20573", "20574"), typeof membershipPublication.priorityPartitionSummary === TYPEOF.OBJECT)))) ? membershipPublication.priorityPartitionSummary : null));
      if (stryMutAct_9fa48("20577") ? !priorityPartitionSummary && typeof priorityPartitionSummary.satisfied !== TYPEOF.BOOLEAN : stryMutAct_9fa48("20576") ? false : stryMutAct_9fa48("20575") ? true : (stryCov_9fa48("20575", "20576", "20577"), (stryMutAct_9fa48("20578") ? priorityPartitionSummary : (stryCov_9fa48("20578"), !priorityPartitionSummary)) || (stryMutAct_9fa48("20580") ? typeof priorityPartitionSummary.satisfied === TYPEOF.BOOLEAN : stryMutAct_9fa48("20579") ? false : (stryCov_9fa48("20579", "20580"), typeof priorityPartitionSummary.satisfied !== TYPEOF.BOOLEAN)))) {
        if (stryMutAct_9fa48("20581")) {
          {}
        } else {
          stryCov_9fa48("20581");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_INCOMPLETE, null, stryMutAct_9fa48("20582") ? {} : (stryCov_9fa48("20582"), {
            publicationEpoch: stryMutAct_9fa48("20583") ? membershipPublication?.publicationEpoch && null : (stryCov_9fa48("20583"), (stryMutAct_9fa48("20584") ? membershipPublication.publicationEpoch : (stryCov_9fa48("20584"), membershipPublication?.publicationEpoch)) ?? null),
            publicationStatus,
            priorityPartitionSummary
          }));
        }
      }
      const reasonCodes = Array.isArray(stryMutAct_9fa48("20585") ? planningSnapshot.priorityRecoveryReasonCodes : (stryCov_9fa48("20585"), planningSnapshot?.priorityRecoveryReasonCodes)) ? stryMutAct_9fa48("20586") ? [] : (stryCov_9fa48("20586"), [...planningSnapshot.priorityRecoveryReasonCodes]) : stryMutAct_9fa48("20587") ? ["Stryker was here"] : (stryCov_9fa48("20587"), []);
      return stryMutAct_9fa48("20588") ? {} : (stryCov_9fa48("20588"), {
        healthy: stryMutAct_9fa48("20591") ? reasonCodes.length !== NUM.ZERO : stryMutAct_9fa48("20590") ? false : stryMutAct_9fa48("20589") ? true : (stryCov_9fa48("20589", "20590", "20591"), reasonCodes.length === NUM.ZERO),
        reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        details: (stryMutAct_9fa48("20595") ? reasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("20594") ? reasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("20593") ? false : stryMutAct_9fa48("20592") ? true : (stryCov_9fa48("20592", "20593", "20594", "20595"), reasonCodes.length > NUM.ZERO)) ? stryMutAct_9fa48("20596") ? {} : (stryCov_9fa48("20596"), {
          publicationEpoch: stryMutAct_9fa48("20597") ? (planningSnapshot?.publicationEpoch ?? membershipPublication?.publicationEpoch) && null : (stryCov_9fa48("20597"), (stryMutAct_9fa48("20598") ? planningSnapshot?.publicationEpoch && membershipPublication?.publicationEpoch : (stryCov_9fa48("20598"), (stryMutAct_9fa48("20599") ? planningSnapshot.publicationEpoch : (stryCov_9fa48("20599"), planningSnapshot?.publicationEpoch)) ?? (stryMutAct_9fa48("20600") ? membershipPublication.publicationEpoch : (stryCov_9fa48("20600"), membershipPublication?.publicationEpoch)))) ?? null),
          publicationStatus,
          priorityPartitionSummary,
          recoveryProtocolState: stryMutAct_9fa48("20601") ? planningSnapshot?.recoveryProtocolState && null : (stryCov_9fa48("20601"), (stryMutAct_9fa48("20602") ? planningSnapshot.recoveryProtocolState : (stryCov_9fa48("20602"), planningSnapshot?.recoveryProtocolState)) ?? null),
          targetParticipation: stryMutAct_9fa48("20603") ? planningSnapshot?.targetParticipation && null : (stryCov_9fa48("20603"), (stryMutAct_9fa48("20604") ? planningSnapshot.targetParticipation : (stryCov_9fa48("20604"), planningSnapshot?.targetParticipation)) ?? null),
          priorityRecoveryReasonCodes: Object.freeze(stryMutAct_9fa48("20605") ? [] : (stryCov_9fa48("20605"), [...reasonCodes]))
        }) : null
      });
    }
  }
  buildPriorityControlPlaneRecoveryUnavailableHealth(failureReason, error = null, context = null) {
    if (stryMutAct_9fa48("20606")) {
      {}
    } else {
      stryCov_9fa48("20606");
      const details = stryMutAct_9fa48("20607") ? {} : (stryCov_9fa48("20607"), {
        failureReason
      });
      if (stryMutAct_9fa48("20610") ? context || typeof context === TYPEOF.OBJECT : stryMutAct_9fa48("20609") ? false : stryMutAct_9fa48("20608") ? true : (stryCov_9fa48("20608", "20609", "20610"), context && (stryMutAct_9fa48("20612") ? typeof context !== TYPEOF.OBJECT : stryMutAct_9fa48("20611") ? true : (stryCov_9fa48("20611", "20612"), typeof context === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20613")) {
          {}
        } else {
          stryCov_9fa48("20613");
          Object.assign(details, context);
        }
      }
      if (stryMutAct_9fa48("20615") ? false : stryMutAct_9fa48("20614") ? true : (stryCov_9fa48("20614", "20615"), error)) {
        if (stryMutAct_9fa48("20616")) {
          {}
        } else {
          stryCov_9fa48("20616");
          details.error = stryMutAct_9fa48("20619") ? error?.message && String(error) : stryMutAct_9fa48("20618") ? false : stryMutAct_9fa48("20617") ? true : (stryCov_9fa48("20617", "20618", "20619"), (stryMutAct_9fa48("20620") ? error.message : (stryCov_9fa48("20620"), error?.message)) || String(error));
        }
      }
      return stryMutAct_9fa48("20621") ? {} : (stryCov_9fa48("20621"), {
        healthy: stryMutAct_9fa48("20622") ? true : (stryCov_9fa48("20622"), false),
        reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        details
      });
    }
  }
  getControlPlaneWriteHealth() {
    if (stryMutAct_9fa48("20623")) {
      {}
    } else {
      stryCov_9fa48("20623");
      const provider = this.getControlPlaneWriteHealthProvider();
      if (stryMutAct_9fa48("20626") ? typeof provider === TYPEOF.FUNCTION : stryMutAct_9fa48("20625") ? false : stryMutAct_9fa48("20624") ? true : (stryCov_9fa48("20624", "20625", "20626"), typeof provider !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("20627")) {
          {}
        } else {
          stryCov_9fa48("20627");
          return stryMutAct_9fa48("20628") ? {} : (stryCov_9fa48("20628"), {
            healthy: stryMutAct_9fa48("20629") ? false : (stryCov_9fa48("20629"), true),
            reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
            details: null
          });
        }
      }
      try {
        if (stryMutAct_9fa48("20630")) {
          {}
        } else {
          stryCov_9fa48("20630");
          const health = stryMutAct_9fa48("20633") ? provider() && {} : stryMutAct_9fa48("20632") ? false : stryMutAct_9fa48("20631") ? true : (stryCov_9fa48("20631", "20632", "20633"), provider() || {});
          const healthy = stryMutAct_9fa48("20636") ? health.healthy === false : stryMutAct_9fa48("20635") ? false : stryMutAct_9fa48("20634") ? true : (stryCov_9fa48("20634", "20635", "20636"), health.healthy !== (stryMutAct_9fa48("20637") ? true : (stryCov_9fa48("20637"), false)));
          return stryMutAct_9fa48("20638") ? {} : (stryCov_9fa48("20638"), {
            healthy,
            reasonCode: (stryMutAct_9fa48("20641") ? typeof health.reasonCode === TYPEOF.STRING || health.reasonCode.length > NUM.ZERO : stryMutAct_9fa48("20640") ? false : stryMutAct_9fa48("20639") ? true : (stryCov_9fa48("20639", "20640", "20641"), (stryMutAct_9fa48("20643") ? typeof health.reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("20642") ? true : (stryCov_9fa48("20642", "20643"), typeof health.reasonCode === TYPEOF.STRING)) && (stryMutAct_9fa48("20646") ? health.reasonCode.length <= NUM.ZERO : stryMutAct_9fa48("20645") ? health.reasonCode.length >= NUM.ZERO : stryMutAct_9fa48("20644") ? true : (stryCov_9fa48("20644", "20645", "20646"), health.reasonCode.length > NUM.ZERO)))) ? health.reasonCode : LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
            details: (stryMutAct_9fa48("20649") ? health.details || typeof health.details === TYPEOF.OBJECT : stryMutAct_9fa48("20648") ? false : stryMutAct_9fa48("20647") ? true : (stryCov_9fa48("20647", "20648", "20649"), health.details && (stryMutAct_9fa48("20651") ? typeof health.details !== TYPEOF.OBJECT : stryMutAct_9fa48("20650") ? true : (stryCov_9fa48("20650", "20651"), typeof health.details === TYPEOF.OBJECT)))) ? health.details : null
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("20652")) {
          {}
        } else {
          stryCov_9fa48("20652");
          return stryMutAct_9fa48("20653") ? {} : (stryCov_9fa48("20653"), {
            healthy: stryMutAct_9fa48("20654") ? true : (stryCov_9fa48("20654"), false),
            reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
            details: stryMutAct_9fa48("20655") ? {} : (stryCov_9fa48("20655"), {
              error: stryMutAct_9fa48("20658") ? error?.message && String(error) : stryMutAct_9fa48("20657") ? false : stryMutAct_9fa48("20656") ? true : (stryCov_9fa48("20656", "20657", "20658"), (stryMutAct_9fa48("20659") ? error.message : (stryCov_9fa48("20659"), error?.message)) || String(error))
            })
          });
        }
      }
    }
  }
  getStartupProbeReasons(snapshot, started) {
    if (stryMutAct_9fa48("20660")) {
      {}
    } else {
      stryCov_9fa48("20660");
      if (stryMutAct_9fa48("20662") ? false : stryMutAct_9fa48("20661") ? true : (stryCov_9fa48("20661", "20662"), started)) {
        if (stryMutAct_9fa48("20663")) {
          {}
        } else {
          stryCov_9fa48("20663");
          return stryMutAct_9fa48("20664") ? ["Stryker was here"] : (stryCov_9fa48("20664"), []);
        }
      }
      const reasons = Array.isArray(stryMutAct_9fa48("20665") ? snapshot.reasons : (stryCov_9fa48("20665"), snapshot?.reasons)) ? stryMutAct_9fa48("20666") ? [] : (stryCov_9fa48("20666"), [...snapshot.reasons]) : stryMutAct_9fa48("20667") ? ["Stryker was here"] : (stryCov_9fa48("20667"), []);
      if (stryMutAct_9fa48("20670") ? false : stryMutAct_9fa48("20669") ? true : stryMutAct_9fa48("20668") ? reasons.includes(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE) : (stryCov_9fa48("20668", "20669", "20670"), !reasons.includes(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE))) {
        if (stryMutAct_9fa48("20671")) {
          {}
        } else {
          stryCov_9fa48("20671");
          reasons.unshift(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE);
        }
      }
      return reasons;
    }
  }
  isStartupComplete() {
    if (stryMutAct_9fa48("20672")) {
      {}
    } else {
      stryCov_9fa48("20672");
      const bootstrapService = this.getBootstrapService();
      if (stryMutAct_9fa48("20675") ? false : stryMutAct_9fa48("20674") ? true : stryMutAct_9fa48("20673") ? bootstrapService : (stryCov_9fa48("20673", "20674", "20675"), !bootstrapService)) {
        if (stryMutAct_9fa48("20676")) {
          {}
        } else {
          stryCov_9fa48("20676");
          return stryMutAct_9fa48("20677") ? false : (stryCov_9fa48("20677"), true);
        }
      }
      return stryMutAct_9fa48("20680") ? bootstrapService.phase !== BOOTSTRAP_PHASE.COMPLETE : stryMutAct_9fa48("20679") ? false : stryMutAct_9fa48("20678") ? true : (stryCov_9fa48("20678", "20679", "20680"), bootstrapService.phase === BOOTSTRAP_PHASE.COMPLETE);
    }
  }
  isRuntimeWiringReady() {
    if (stryMutAct_9fa48("20681")) {
      {}
    } else {
      stryCov_9fa48("20681");
      const bootstrapService = this.getBootstrapService();
      if (stryMutAct_9fa48("20684") ? false : stryMutAct_9fa48("20683") ? true : stryMutAct_9fa48("20682") ? bootstrapService : (stryCov_9fa48("20682", "20683", "20684"), !bootstrapService)) {
        if (stryMutAct_9fa48("20685")) {
          {}
        } else {
          stryCov_9fa48("20685");
          return stryMutAct_9fa48("20686") ? false : (stryCov_9fa48("20686"), true);
        }
      }
      return Boolean(stryMutAct_9fa48("20689") ? this.getMessageRouter() && bootstrapService?.messageRouter : stryMutAct_9fa48("20688") ? false : stryMutAct_9fa48("20687") ? true : (stryCov_9fa48("20687", "20688", "20689"), this.getMessageRouter() || (stryMutAct_9fa48("20690") ? bootstrapService.messageRouter : (stryCov_9fa48("20690"), bootstrapService?.messageRouter))));
    }
  }
  shouldRequireLocalQueryTransportReadiness() {
    if (stryMutAct_9fa48("20691")) {
      {}
    } else {
      stryCov_9fa48("20691");
      const bootstrapService = this.getBootstrapService();
      const messageRouter = stryMutAct_9fa48("20694") ? (this.getMessageRouter() || bootstrapService?.messageRouter) && null : stryMutAct_9fa48("20693") ? false : stryMutAct_9fa48("20692") ? true : (stryCov_9fa48("20692", "20693", "20694"), (stryMutAct_9fa48("20696") ? this.getMessageRouter() && bootstrapService?.messageRouter : stryMutAct_9fa48("20695") ? false : (stryCov_9fa48("20695", "20696"), this.getMessageRouter() || (stryMutAct_9fa48("20697") ? bootstrapService.messageRouter : (stryCov_9fa48("20697"), bootstrapService?.messageRouter)))) || null);
      return stryMutAct_9fa48("20700") ? typeof messageRouter?.getQueryDataPlaneTransportReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("20699") ? false : stryMutAct_9fa48("20698") ? true : (stryCov_9fa48("20698", "20699", "20700"), typeof (stryMutAct_9fa48("20701") ? messageRouter.getQueryDataPlaneTransportReadiness : (stryCov_9fa48("20701"), messageRouter?.getQueryDataPlaneTransportReadiness)) === TYPEOF.FUNCTION);
    }
  }
  getLocalQueryTransportReadiness() {
    if (stryMutAct_9fa48("20702")) {
      {}
    } else {
      stryCov_9fa48("20702");
      const bootstrapService = this.getBootstrapService();
      return getLocalQueryTransportReadiness(stryMutAct_9fa48("20705") ? (this.getMessageRouter() || bootstrapService?.messageRouter) && null : stryMutAct_9fa48("20704") ? false : stryMutAct_9fa48("20703") ? true : (stryCov_9fa48("20703", "20704", "20705"), (stryMutAct_9fa48("20707") ? this.getMessageRouter() && bootstrapService?.messageRouter : stryMutAct_9fa48("20706") ? false : (stryCov_9fa48("20706", "20707"), this.getMessageRouter() || (stryMutAct_9fa48("20708") ? bootstrapService.messageRouter : (stryCov_9fa48("20708"), bootstrapService?.messageRouter)))) || null));
    }
  }
  isSqlEngineDependencyReady() {
    if (stryMutAct_9fa48("20709")) {
      {}
    } else {
      stryCov_9fa48("20709");
      if (stryMutAct_9fa48("20712") ? false : stryMutAct_9fa48("20711") ? true : stryMutAct_9fa48("20710") ? this.getBootstrapService() : (stryCov_9fa48("20710", "20711", "20712"), !this.getBootstrapService())) {
        if (stryMutAct_9fa48("20713")) {
          {}
        } else {
          stryCov_9fa48("20713");
          return stryMutAct_9fa48("20714") ? false : (stryCov_9fa48("20714"), true);
        }
      }
      return Boolean(this.getSqlQueryEngine());
    }
  }
  recordReadinessProbeResult(endpoint, statusCode) {
    if (stryMutAct_9fa48("20715")) {
      {}
    } else {
      stryCov_9fa48("20715");
      const readinessState = this.getReadinessState();
      if (stryMutAct_9fa48("20718") ? typeof readinessState?.recordProbeResult === TYPEOF.FUNCTION : stryMutAct_9fa48("20717") ? false : stryMutAct_9fa48("20716") ? true : (stryCov_9fa48("20716", "20717", "20718"), typeof (stryMutAct_9fa48("20719") ? readinessState.recordProbeResult : (stryCov_9fa48("20719"), readinessState?.recordProbeResult)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("20720")) {
          {}
        } else {
          stryCov_9fa48("20720");
          return;
        }
      }
      readinessState.recordProbeResult(endpoint, statusCode);
    }
  }
  markDraining(options = {}) {
    if (stryMutAct_9fa48("20721")) {
      {}
    } else {
      stryCov_9fa48("20721");
      const readinessState = this.getReadinessState();
      if (stryMutAct_9fa48("20724") ? typeof readinessState?.beginDrain !== TYPEOF.FUNCTION : stryMutAct_9fa48("20723") ? false : stryMutAct_9fa48("20722") ? true : (stryCov_9fa48("20722", "20723", "20724"), typeof (stryMutAct_9fa48("20725") ? readinessState.beginDrain : (stryCov_9fa48("20725"), readinessState?.beginDrain)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("20726")) {
          {}
        } else {
          stryCov_9fa48("20726");
          return readinessState.beginDrain(stryMutAct_9fa48("20727") ? {} : (stryCov_9fa48("20727"), {
            drainDeadlineMs: options.drainDeadlineMs,
            reasonCode: stryMutAct_9fa48("20730") ? options.reasonCode && LIFECYCLE_REASON.NODE_DRAINING : stryMutAct_9fa48("20729") ? false : stryMutAct_9fa48("20728") ? true : (stryCov_9fa48("20728", "20729", "20730"), options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING)
          }));
        }
      }
      if (stryMutAct_9fa48("20733") ? typeof readinessState?.transitionTo !== TYPEOF.FUNCTION : stryMutAct_9fa48("20732") ? false : stryMutAct_9fa48("20731") ? true : (stryCov_9fa48("20731", "20732", "20733"), typeof (stryMutAct_9fa48("20734") ? readinessState.transitionTo : (stryCov_9fa48("20734"), readinessState?.transitionTo)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("20735")) {
          {}
        } else {
          stryCov_9fa48("20735");
          return readinessState.transitionTo(BOOTSTRAP_READINESS_OWNER_LITERAL.DEGRADED_2, stryMutAct_9fa48("20736") ? {} : (stryCov_9fa48("20736"), {
            ready: stryMutAct_9fa48("20737") ? true : (stryCov_9fa48("20737"), false),
            reasons: stryMutAct_9fa48("20738") ? [] : (stryCov_9fa48("20738"), [stryMutAct_9fa48("20741") ? options.reasonCode && LIFECYCLE_REASON.NODE_DRAINING : stryMutAct_9fa48("20740") ? false : stryMutAct_9fa48("20739") ? true : (stryCov_9fa48("20739", "20740", "20741"), options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING)])
          }));
        }
      }
      return this.getReadinessSnapshotForDiagnostics();
    }
  }
  buildBootstrapNotReadyResponse(options = {}) {
    if (stryMutAct_9fa48("20742")) {
      {}
    } else {
      stryCov_9fa48("20742");
      const snapshot = this.getReadinessSnapshotForDiagnostics();
      const reasons = this.mergeReadinessReasons(snapshot.reasons, options.reasonCode);
      const response = stryMutAct_9fa48("20743") ? {} : (stryCov_9fa48("20743"), {
        success: stryMutAct_9fa48("20744") ? true : (stryCov_9fa48("20744"), false),
        error: options.error,
        code: options.code,
        reasons,
        retryAfterMs: Number.isFinite(options.retryAfterMs) ? stryMutAct_9fa48("20745") ? Math.min(NUM.ZERO, Math.floor(options.retryAfterMs)) : (stryCov_9fa48("20745"), Math.max(NUM.ZERO, Math.floor(options.retryAfterMs))) : Number.isFinite(snapshot.retryAfterMs) ? snapshot.retryAfterMs : NUM.ZERO
      });
      if (stryMutAct_9fa48("20748") ? typeof options.phase === TYPEOF.STRING || options.phase.length > NUM.ZERO : stryMutAct_9fa48("20747") ? false : stryMutAct_9fa48("20746") ? true : (stryCov_9fa48("20746", "20747", "20748"), (stryMutAct_9fa48("20750") ? typeof options.phase !== TYPEOF.STRING : stryMutAct_9fa48("20749") ? true : (stryCov_9fa48("20749", "20750"), typeof options.phase === TYPEOF.STRING)) && (stryMutAct_9fa48("20753") ? options.phase.length <= NUM.ZERO : stryMutAct_9fa48("20752") ? options.phase.length >= NUM.ZERO : stryMutAct_9fa48("20751") ? true : (stryCov_9fa48("20751", "20752", "20753"), options.phase.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20754")) {
          {}
        } else {
          stryCov_9fa48("20754");
          response.phase = options.phase;
        }
      }
      if (stryMutAct_9fa48("20757") ? typeof snapshot.state === TYPEOF.STRING || snapshot.state.length > NUM.ZERO : stryMutAct_9fa48("20756") ? false : stryMutAct_9fa48("20755") ? true : (stryCov_9fa48("20755", "20756", "20757"), (stryMutAct_9fa48("20759") ? typeof snapshot.state !== TYPEOF.STRING : stryMutAct_9fa48("20758") ? true : (stryCov_9fa48("20758", "20759"), typeof snapshot.state === TYPEOF.STRING)) && (stryMutAct_9fa48("20762") ? snapshot.state.length <= NUM.ZERO : stryMutAct_9fa48("20761") ? snapshot.state.length >= NUM.ZERO : stryMutAct_9fa48("20760") ? true : (stryCov_9fa48("20760", "20761", "20762"), snapshot.state.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20763")) {
          {}
        } else {
          stryCov_9fa48("20763");
          response.state = snapshot.state;
        }
      }
      if (stryMutAct_9fa48("20766") ? options.leaderReadiness || typeof options.leaderReadiness === TYPEOF.OBJECT : stryMutAct_9fa48("20765") ? false : stryMutAct_9fa48("20764") ? true : (stryCov_9fa48("20764", "20765", "20766"), options.leaderReadiness && (stryMutAct_9fa48("20768") ? typeof options.leaderReadiness !== TYPEOF.OBJECT : stryMutAct_9fa48("20767") ? true : (stryCov_9fa48("20767", "20768"), typeof options.leaderReadiness === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("20769")) {
          {}
        } else {
          stryCov_9fa48("20769");
          response.leaderReadiness = stryMutAct_9fa48("20770") ? {} : (stryCov_9fa48("20770"), {
            ...options.leaderReadiness
          });
          for (const field of stryMutAct_9fa48("20771") ? [] : (stryCov_9fa48("20771"), [BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERS, BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERNODES, BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERADDRESSES, BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERS, BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERNODES, BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERADDRESSES])) {
            if (stryMutAct_9fa48("20772")) {
              {}
            } else {
              stryCov_9fa48("20772");
              if (stryMutAct_9fa48("20775") ? false : stryMutAct_9fa48("20774") ? true : stryMutAct_9fa48("20773") ? Array.isArray(options.leaderReadiness[field]) : (stryCov_9fa48("20773", "20774", "20775"), !Array.isArray(options.leaderReadiness[field]))) {
                if (stryMutAct_9fa48("20776")) {
                  {}
                } else {
                  stryCov_9fa48("20776");
                  continue;
                }
              }
              response[field] = stryMutAct_9fa48("20777") ? [] : (stryCov_9fa48("20777"), [...options.leaderReadiness[field]]);
            }
          }
        }
      }
      return response;
    }
  }
  getReadinessSnapshotForDiagnostics() {
    if (stryMutAct_9fa48("20778")) {
      {}
    } else {
      stryCov_9fa48("20778");
      const readinessState = this.getReadinessState();
      try {
        if (stryMutAct_9fa48("20779")) {
          {}
        } else {
          stryCov_9fa48("20779");
          return this.evaluateReadinessSnapshot();
        }
      } catch (_error) {
        if (stryMutAct_9fa48("20780")) {
          {}
        } else {
          stryCov_9fa48("20780");
          const fallbackSnapshot = (stryMutAct_9fa48("20783") ? typeof readinessState?.getSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("20782") ? false : stryMutAct_9fa48("20781") ? true : (stryCov_9fa48("20781", "20782", "20783"), typeof (stryMutAct_9fa48("20784") ? readinessState.getSnapshot : (stryCov_9fa48("20784"), readinessState?.getSnapshot)) === TYPEOF.FUNCTION)) ? readinessState.getSnapshot() : null;
          if (stryMutAct_9fa48("20786") ? false : stryMutAct_9fa48("20785") ? true : (stryCov_9fa48("20785", "20786"), fallbackSnapshot)) {
            if (stryMutAct_9fa48("20787")) {
              {}
            } else {
              stryCov_9fa48("20787");
              return fallbackSnapshot;
            }
          }
          return stryMutAct_9fa48("20788") ? {} : (stryCov_9fa48("20788"), {
            ready: stryMutAct_9fa48("20789") ? true : (stryCov_9fa48("20789"), false),
            phase: LIFECYCLE_PHASE.INIT,
            state: BOOTSTRAP_PHASE.NOT_STARTED,
            reasons: stryMutAct_9fa48("20790") ? ["Stryker was here"] : (stryCov_9fa48("20790"), []),
            retryAfterMs: NUM.ZERO,
            timestamp: Date.now()
          });
        }
      }
    }
  }
  mergeReadinessReasons(reasons, reasonCode) {
    if (stryMutAct_9fa48("20791")) {
      {}
    } else {
      stryCov_9fa48("20791");
      const merged = Array.isArray(reasons) ? stryMutAct_9fa48("20792") ? [] : (stryCov_9fa48("20792"), [...reasons]) : stryMutAct_9fa48("20793") ? ["Stryker was here"] : (stryCov_9fa48("20793"), []);
      if (stryMutAct_9fa48("20796") ? typeof reasonCode !== TYPEOF.STRING && reasonCode.length === NUM.ZERO : stryMutAct_9fa48("20795") ? false : stryMutAct_9fa48("20794") ? true : (stryCov_9fa48("20794", "20795", "20796"), (stryMutAct_9fa48("20798") ? typeof reasonCode === TYPEOF.STRING : stryMutAct_9fa48("20797") ? false : (stryCov_9fa48("20797", "20798"), typeof reasonCode !== TYPEOF.STRING)) || (stryMutAct_9fa48("20800") ? reasonCode.length !== NUM.ZERO : stryMutAct_9fa48("20799") ? false : (stryCov_9fa48("20799", "20800"), reasonCode.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("20801")) {
          {}
        } else {
          stryCov_9fa48("20801");
          return merged;
        }
      }
      if (stryMutAct_9fa48("20804") ? false : stryMutAct_9fa48("20803") ? true : stryMutAct_9fa48("20802") ? merged.includes(reasonCode) : (stryCov_9fa48("20802", "20803", "20804"), !merged.includes(reasonCode))) {
        if (stryMutAct_9fa48("20805")) {
          {}
        } else {
          stryCov_9fa48("20805");
          merged.push(reasonCode);
        }
      }
      return merged;
    }
  }
}
export { BootstrapReadinessOwner };