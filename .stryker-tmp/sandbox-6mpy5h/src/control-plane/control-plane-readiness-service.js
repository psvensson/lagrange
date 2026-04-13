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
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { COLUMN, NUM, STATE, SERVICE_STATUS, SERVICE_TYPE, TABLES, TIME_MS, TYPEOF } from '../constants/index.js';
import { compareNodeHeartbeatWatermarks, isNodeRecordReady, isNodeReadyLeaseExplicitlyCleared, wasNodeRecordReadyWhenWritten } from '../node/node-readiness-policy.js';
import { PRESSURE_STATE } from '../rebalancer/storage-capacity-constants.js';
import { AuthoritativeControlPlaneView } from './authoritative-control-plane-view.js';
import { LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY } from '../cdc/cdc-integration-service.js';
import { createControlPlaneRuntimeBundle } from './control-plane-runtime-bundle.js';
import { CONTROL_PLANE_PARTICIPATION_DECISION, CONTROL_PLANE_PARTICIPATION_KIND, CONTROL_PLANE_PRIORITY_RECOVERY_REASON, CONTROL_PLANE_PUBLICATION_MODE, CONTROL_PLANE_READINESS_DEFAULT, CONTROL_PLANE_READINESS_DIMENSION, CONTROL_PLANE_READINESS_OWNER, CONTROL_PLANE_READINESS_REASON, CONTROL_PLANE_READINESS_SUBSYSTEM } from './control-plane-readiness-constants.js';
import { compactEligibilitySnapshot, createEligibilitySnapshot, evaluateEligibilityDecision } from './eligibility-snapshot.js';
import { CONTROL_PLANE_PUBLICATION_STATUS } from './control-plane-publication-merge.js';
import { resolvePriorityRecoveryActiveNodeCohort, hasPriorityRecoverySpreadGap } from './priority-recovery-snapshot.js';
import { unwrapRowReadResult } from './owners/system-metadata-owner-base.js';
import { buildPublicationRecoveryProtocolSnapshot } from './recovery-protocol-snapshot.js';
import { ControlPlaneDiagnosticsLedger } from './control-plane-diagnostics-ledger.js';
import { DurableWorkflowCoordinator } from '../workflow/durable-workflow-coordinator.js';
import { OperationLane } from '../workflow/operation-lane.js';
import { AuthoritativeNodeEvidenceReconciler } from './authoritative-node-evidence-reconciler.js';
const PUBLICATION_REASON_CONFIG_SAFE_MODE = stryMutAct_9fa48("58525") ? "" : (stryCov_9fa48("58525"), 'config_safe_mode');
const AUTHORITATIVE_READINESS_REPAIR = Object.freeze(stryMutAct_9fa48("58526") ? {} : (stryCov_9fa48("58526"), {
  COOLDOWN_MS: 5000,
  FAILURE_COOLDOWN_MS: 30000,
  NO_CHANGE_COOLDOWN_MS: 15000,
  QUERY_TIMEOUT_MS: 1500,
  STALE_HEARTBEAT_MAX_AGE_MS: 10000
}));
const MEMBERSHIP_PUBLICATION_PLANNING = Object.freeze(stryMutAct_9fa48("58527") ? {} : (stryCov_9fa48("58527"), {
  REFRESH_TIMEOUT_MS: TIME_MS.SECOND
}));
const MEMBERSHIP_PUBLICATION_READ_LANE = Object.freeze(stryMutAct_9fa48("58528") ? {} : (stryCov_9fa48("58528"), {
  DIAGNOSTICS: stryMutAct_9fa48("58529") ? "" : (stryCov_9fa48("58529"), 'diagnostics'),
  PLANNING: stryMutAct_9fa48("58530") ? "" : (stryCov_9fa48("58530"), 'planning')
}));
const MEMBERSHIP_PUBLICATION_READ_SCOPE = Object.freeze(stryMutAct_9fa48("58531") ? {} : (stryCov_9fa48("58531"), {
  CLUSTER: stryMutAct_9fa48("58532") ? "" : (stryCov_9fa48("58532"), 'cluster'),
  TARGET_NODE: stryMutAct_9fa48("58533") ? "" : (stryCov_9fa48("58533"), 'target_node')
}));
const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze(stryMutAct_9fa48("58534") ? {} : (stryCov_9fa48("58534"), {
  SERVICE_UNAVAILABLE: stryMutAct_9fa48("58535") ? "" : (stryCov_9fa48("58535"), 'control_plane_recovery_service_unavailable'),
  PLANNING_PROVIDER_UNAVAILABLE: stryMutAct_9fa48("58536") ? "" : (stryCov_9fa48("58536"), 'control_plane_recovery_planning_provider_unavailable'),
  PLANNING_READ_FAILED: stryMutAct_9fa48("58537") ? "" : (stryCov_9fa48("58537"), 'control_plane_recovery_planning_read_failed'),
  PLANNING_UNAVAILABLE: stryMutAct_9fa48("58538") ? "" : (stryCov_9fa48("58538"), 'control_plane_recovery_planning_unavailable'),
  PLANNING_INCOMPLETE: stryMutAct_9fa48("58539") ? "" : (stryCov_9fa48("58539"), 'control_plane_recovery_planning_incomplete')
}));
const STARTUP_AUTHORITY_STATE = Object.freeze(stryMutAct_9fa48("58540") ? {} : (stryCov_9fa48("58540"), {
  READY: stryMutAct_9fa48("58541") ? "" : (stryCov_9fa48("58541"), 'ready'),
  RECOVERY_PENDING: stryMutAct_9fa48("58542") ? "" : (stryCov_9fa48("58542"), 'recovery_pending'),
  SEED_LOCALLY_READY_UNPUBLISHED: stryMutAct_9fa48("58543") ? "" : (stryCov_9fa48("58543"), 'seed_locally_ready_unpublished'),
  AUTHORITY_UNAVAILABLE: stryMutAct_9fa48("58544") ? "" : (stryCov_9fa48("58544"), 'authority_unavailable'),
  BLOCKED: stryMutAct_9fa48("58545") ? "" : (stryCov_9fa48("58545"), 'blocked')
}));
const READINESS_TRANSITION_HISTORY_LIMIT = 32;
const READINESS_DIAGNOSTICS_LEDGER_LIMIT = 128;
const RECOVERY_EPOCH_HISTORY_LIMIT = 8;
const RECOVERY_EPOCH_EVENT_LIMIT = 32;
const RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES = Object.freeze(stryMutAct_9fa48("58546") ? [] : (stryCov_9fa48("58546"), [stryMutAct_9fa48("58547") ? "" : (stryCov_9fa48("58547"), 'starting'), stryMutAct_9fa48("58548") ? "" : (stryCov_9fa48("58548"), 'syncing')]));
const READINESS_ERROR_MSG = Object.freeze(stryMutAct_9fa48("58549") ? {} : (stryCov_9fa48("58549"), {
  STORAGE_ACCOUNTING_OWNER_REQUIRED: (stryMutAct_9fa48("58550") ? "" : (stryCov_9fa48("58550"), 'ControlPlaneReadinessService requires ')) + (stryMutAct_9fa48("58551") ? "" : (stryCov_9fa48("58551"), 'storageAccountingService for strict readiness evaluation')),
  PUBLICATION_OWNER_REQUIRED: (stryMutAct_9fa48("58552") ? "" : (stryCov_9fa48("58552"), 'ControlPlaneReadinessService requires ')) + (stryMutAct_9fa48("58553") ? "" : (stryCov_9fa48("58553"), 'cdcGroupPropagationService for strict readiness evaluation'))
}));
const MEMBERSHIP_PUBLICATION_READ_OPTIONS = Object.freeze(stryMutAct_9fa48("58554") ? {} : (stryCov_9fa48("58554"), {
  preferAuthoritativeRead: stryMutAct_9fa48("58555") ? false : (stryCov_9fa48("58555"), true),
  preferOwnerRpcRead: stryMutAct_9fa48("58556") ? false : (stryCov_9fa48("58556"), true),
  requireOwnerRpcRead: stryMutAct_9fa48("58557") ? false : (stryCov_9fa48("58557"), true),
  readProfile: stryMutAct_9fa48("58558") ? "" : (stryCov_9fa48("58558"), 'diagnostics'),
  localReadConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
  replicaFallbackConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
  workClass: stryMutAct_9fa48("58559") ? "" : (stryCov_9fa48("58559"), 'control-plane-readiness')
}));
const MEMBERSHIP_PUBLICATION_PLANNING_READ_OPTIONS = Object.freeze(stryMutAct_9fa48("58560") ? {} : (stryCov_9fa48("58560"), {
  preferAuthoritativeRead: stryMutAct_9fa48("58561") ? false : (stryCov_9fa48("58561"), true),
  preferOwnerRpcRead: stryMutAct_9fa48("58562") ? false : (stryCov_9fa48("58562"), true),
  requireOwnerRpcRead: stryMutAct_9fa48("58563") ? true : (stryCov_9fa48("58563"), false),
  readProfile: stryMutAct_9fa48("58564") ? "" : (stryCov_9fa48("58564"), 'planning'),
  localReadConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
  replicaFallbackConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
  workClass: stryMutAct_9fa48("58565") ? "" : (stryCov_9fa48("58565"), 'control-plane-planning')
}));
function resolveMembershipPublicationReadOptions({
  lane = MEMBERSHIP_PUBLICATION_READ_LANE.DIAGNOSTICS,
  queryTimeoutMs = null
} = {}) {
  if (stryMutAct_9fa48("58566")) {
    {}
  } else {
    stryCov_9fa48("58566");
    const normalizedLane = (stryMutAct_9fa48("58569") ? lane !== MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING : stryMutAct_9fa48("58568") ? false : stryMutAct_9fa48("58567") ? true : (stryCov_9fa48("58567", "58568", "58569"), lane === MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING)) ? MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING : MEMBERSHIP_PUBLICATION_READ_LANE.DIAGNOSTICS;
    const baseOptions = (stryMutAct_9fa48("58572") ? normalizedLane !== MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING : stryMutAct_9fa48("58571") ? false : stryMutAct_9fa48("58570") ? true : (stryCov_9fa48("58570", "58571", "58572"), normalizedLane === MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING)) ? MEMBERSHIP_PUBLICATION_PLANNING_READ_OPTIONS : MEMBERSHIP_PUBLICATION_READ_OPTIONS;
    const normalizedQueryTimeoutMs = (stryMutAct_9fa48("58575") ? Number.isFinite(queryTimeoutMs) || queryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("58574") ? false : stryMutAct_9fa48("58573") ? true : (stryCov_9fa48("58573", "58574", "58575"), Number.isFinite(queryTimeoutMs) && (stryMutAct_9fa48("58578") ? queryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("58577") ? queryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("58576") ? true : (stryCov_9fa48("58576", "58577", "58578"), queryTimeoutMs > NUM.ZERO)))) ? Math.floor(queryTimeoutMs) : null;
    return Object.freeze(stryMutAct_9fa48("58579") ? {} : (stryCov_9fa48("58579"), {
      ...baseOptions,
      queryTimeoutMs: normalizedQueryTimeoutMs
    }));
  }
}
function resolveMembershipPublicationReadLane(lane = null) {
  if (stryMutAct_9fa48("58580")) {
    {}
  } else {
    stryCov_9fa48("58580");
    if (stryMutAct_9fa48("58583") ? lane !== MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING : stryMutAct_9fa48("58582") ? false : stryMutAct_9fa48("58581") ? true : (stryCov_9fa48("58581", "58582", "58583"), lane === MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING)) {
      if (stryMutAct_9fa48("58584")) {
        {}
      } else {
        stryCov_9fa48("58584");
        return MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING;
      }
    }
    return MEMBERSHIP_PUBLICATION_READ_LANE.DIAGNOSTICS;
  }
}
function resolveMembershipPublicationReadScope(scope = null) {
  if (stryMutAct_9fa48("58585")) {
    {}
  } else {
    stryCov_9fa48("58585");
    if (stryMutAct_9fa48("58588") ? scope !== MEMBERSHIP_PUBLICATION_READ_SCOPE.TARGET_NODE : stryMutAct_9fa48("58587") ? false : stryMutAct_9fa48("58586") ? true : (stryCov_9fa48("58586", "58587", "58588"), scope === MEMBERSHIP_PUBLICATION_READ_SCOPE.TARGET_NODE)) {
      if (stryMutAct_9fa48("58589")) {
        {}
      } else {
        stryCov_9fa48("58589");
        return MEMBERSHIP_PUBLICATION_READ_SCOPE.TARGET_NODE;
      }
    }
    return MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER;
  }
}
function buildReason(code, dimension, sourceOwner, observedAt, details = null) {
  if (stryMutAct_9fa48("58590")) {
    {}
  } else {
    stryCov_9fa48("58590");
    const reason = stryMutAct_9fa48("58591") ? {} : (stryCov_9fa48("58591"), {
      code,
      dimension,
      sourceOwner,
      observedAt
    });
    if (stryMutAct_9fa48("58594") ? details || typeof details === 'object' : stryMutAct_9fa48("58593") ? false : stryMutAct_9fa48("58592") ? true : (stryCov_9fa48("58592", "58593", "58594"), details && (stryMutAct_9fa48("58596") ? typeof details !== 'object' : stryMutAct_9fa48("58595") ? true : (stryCov_9fa48("58595", "58596"), typeof details === (stryMutAct_9fa48("58597") ? "" : (stryCov_9fa48("58597"), 'object')))))) {
      if (stryMutAct_9fa48("58598")) {
        {}
      } else {
        stryCov_9fa48("58598");
        reason.details = details;
      }
    }
    return Object.freeze(reason);
  }
}
function normalizeIsoTimestamp(nowValue) {
  if (stryMutAct_9fa48("58599")) {
    {}
  } else {
    stryCov_9fa48("58599");
    return new Date(nowValue).toISOString();
  }
}
function normalizePositiveInteger(value, fallback = NUM.ZERO) {
  if (stryMutAct_9fa48("58600")) {
    {}
  } else {
    stryCov_9fa48("58600");
    return (stryMutAct_9fa48("58603") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("58602") ? false : stryMutAct_9fa48("58601") ? true : (stryCov_9fa48("58601", "58602", "58603"), Number.isFinite(value) && (stryMutAct_9fa48("58606") ? value <= NUM.ZERO : stryMutAct_9fa48("58605") ? value >= NUM.ZERO : stryMutAct_9fa48("58604") ? true : (stryCov_9fa48("58604", "58605", "58606"), value > NUM.ZERO)))) ? Math.floor(value) : fallback;
  }
}
function normalizeDiagnosticTimestampMs(value) {
  if (stryMutAct_9fa48("58607")) {
    {}
  } else {
    stryCov_9fa48("58607");
    if (stryMutAct_9fa48("58609") ? false : stryMutAct_9fa48("58608") ? true : (stryCov_9fa48("58608", "58609"), Number.isFinite(value))) {
      if (stryMutAct_9fa48("58610")) {
        {}
      } else {
        stryCov_9fa48("58610");
        return value;
      }
    }
    if (stryMutAct_9fa48("58613") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("58612") ? false : stryMutAct_9fa48("58611") ? true : (stryCov_9fa48("58611", "58612", "58613"), (stryMutAct_9fa48("58615") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("58614") ? true : (stryCov_9fa48("58614", "58615"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("58618") ? value.length <= NUM.ZERO : stryMutAct_9fa48("58617") ? value.length >= NUM.ZERO : stryMutAct_9fa48("58616") ? true : (stryCov_9fa48("58616", "58617", "58618"), value.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("58619")) {
        {}
      } else {
        stryCov_9fa48("58619");
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
    return null;
  }
}
function normalizeNodeIdList(values = stryMutAct_9fa48("58620") ? ["Stryker was here"] : (stryCov_9fa48("58620"), [])) {
  if (stryMutAct_9fa48("58621")) {
    {}
  } else {
    stryCov_9fa48("58621");
    return stryMutAct_9fa48("58622") ? [] : (stryCov_9fa48("58622"), [...new Set(stryMutAct_9fa48("58623") ? (Array.isArray(values) ? values : []).map(value => String(value || '').trim()) : (stryCov_9fa48("58623"), (Array.isArray(values) ? values : stryMutAct_9fa48("58624") ? ["Stryker was here"] : (stryCov_9fa48("58624"), [])).map(stryMutAct_9fa48("58625") ? () => undefined : (stryCov_9fa48("58625"), value => stryMutAct_9fa48("58626") ? String(value || '') : (stryCov_9fa48("58626"), String(stryMutAct_9fa48("58629") ? value && '' : stryMutAct_9fa48("58628") ? false : stryMutAct_9fa48("58627") ? true : (stryCov_9fa48("58627", "58628", "58629"), value || (stryMutAct_9fa48("58630") ? "Stryker was here!" : (stryCov_9fa48("58630"), '')))).trim()))).filter(stryMutAct_9fa48("58631") ? () => undefined : (stryCov_9fa48("58631"), value => stryMutAct_9fa48("58635") ? value.length <= NUM.ZERO : stryMutAct_9fa48("58634") ? value.length >= NUM.ZERO : stryMutAct_9fa48("58633") ? false : stryMutAct_9fa48("58632") ? true : (stryCov_9fa48("58632", "58633", "58634", "58635"), value.length > NUM.ZERO)))))]);
  }
}
function normalizeLocalQueryTransportEvidence(readiness) {
  if (stryMutAct_9fa48("58636")) {
    {}
  } else {
    stryCov_9fa48("58636");
    if (stryMutAct_9fa48("58639") ? !readiness && typeof readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("58638") ? false : stryMutAct_9fa48("58637") ? true : (stryCov_9fa48("58637", "58638", "58639"), (stryMutAct_9fa48("58640") ? readiness : (stryCov_9fa48("58640"), !readiness)) || (stryMutAct_9fa48("58642") ? typeof readiness === TYPEOF.OBJECT : stryMutAct_9fa48("58641") ? false : (stryCov_9fa48("58641", "58642"), typeof readiness !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("58643")) {
        {}
      } else {
        stryCov_9fa48("58643");
        return Object.freeze(stryMutAct_9fa48("58644") ? {} : (stryCov_9fa48("58644"), {
          state: stryMutAct_9fa48("58645") ? "" : (stryCov_9fa48("58645"), 'unknown'),
          ready: null,
          reason: null,
          retryAfterMs: null
        }));
      }
    }
    const ready = (stryMutAct_9fa48("58648") ? typeof readiness.ready !== 'boolean' : stryMutAct_9fa48("58647") ? false : stryMutAct_9fa48("58646") ? true : (stryCov_9fa48("58646", "58647", "58648"), typeof readiness.ready === (stryMutAct_9fa48("58649") ? "" : (stryCov_9fa48("58649"), 'boolean')))) ? readiness.ready : null;
    return Object.freeze(stryMutAct_9fa48("58650") ? {} : (stryCov_9fa48("58650"), {
      state: (stryMutAct_9fa48("58653") ? ready !== true : stryMutAct_9fa48("58652") ? false : stryMutAct_9fa48("58651") ? true : (stryCov_9fa48("58651", "58652", "58653"), ready === (stryMutAct_9fa48("58654") ? false : (stryCov_9fa48("58654"), true)))) ? stryMutAct_9fa48("58655") ? "" : (stryCov_9fa48("58655"), 'ready') : (stryMutAct_9fa48("58658") ? ready !== false : stryMutAct_9fa48("58657") ? false : stryMutAct_9fa48("58656") ? true : (stryCov_9fa48("58656", "58657", "58658"), ready === (stryMutAct_9fa48("58659") ? true : (stryCov_9fa48("58659"), false)))) ? stryMutAct_9fa48("58660") ? "" : (stryCov_9fa48("58660"), 'deferred') : stryMutAct_9fa48("58661") ? "" : (stryCov_9fa48("58661"), 'unknown'),
      ready,
      reason: (stryMutAct_9fa48("58664") ? typeof readiness.reason === TYPEOF.STRING || readiness.reason.length > NUM.ZERO : stryMutAct_9fa48("58663") ? false : stryMutAct_9fa48("58662") ? true : (stryCov_9fa48("58662", "58663", "58664"), (stryMutAct_9fa48("58666") ? typeof readiness.reason !== TYPEOF.STRING : stryMutAct_9fa48("58665") ? true : (stryCov_9fa48("58665", "58666"), typeof readiness.reason === TYPEOF.STRING)) && (stryMutAct_9fa48("58669") ? readiness.reason.length <= NUM.ZERO : stryMutAct_9fa48("58668") ? readiness.reason.length >= NUM.ZERO : stryMutAct_9fa48("58667") ? true : (stryCov_9fa48("58667", "58668", "58669"), readiness.reason.length > NUM.ZERO)))) ? readiness.reason : null,
      retryAfterMs: (stryMutAct_9fa48("58672") ? Number.isFinite(readiness.retryAfterMs) || readiness.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("58671") ? false : stryMutAct_9fa48("58670") ? true : (stryCov_9fa48("58670", "58671", "58672"), Number.isFinite(readiness.retryAfterMs) && (stryMutAct_9fa48("58675") ? readiness.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("58674") ? readiness.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("58673") ? true : (stryCov_9fa48("58673", "58674", "58675"), readiness.retryAfterMs > NUM.ZERO)))) ? Math.floor(readiness.retryAfterMs) : null
    }));
  }
}
function normalizeControlPlaneParticipationKind(value) {
  if (stryMutAct_9fa48("58676")) {
    {}
  } else {
    stryCov_9fa48("58676");
    if (stryMutAct_9fa48("58679") ? value !== CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ : stryMutAct_9fa48("58678") ? false : stryMutAct_9fa48("58677") ? true : (stryCov_9fa48("58677", "58678", "58679"), value === CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ)) {
      if (stryMutAct_9fa48("58680")) {
        {}
      } else {
        stryCov_9fa48("58680");
        return CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ;
      }
    }
    if (stryMutAct_9fa48("58683") ? value !== CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY : stryMutAct_9fa48("58682") ? false : stryMutAct_9fa48("58681") ? true : (stryCov_9fa48("58681", "58682", "58683"), value === CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY)) {
      if (stryMutAct_9fa48("58684")) {
        {}
      } else {
        stryCov_9fa48("58684");
        return CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY;
      }
    }
    return CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ;
  }
}
function resolveParticipationDecisionDimension(participationKind, decisionDimension) {
  if (stryMutAct_9fa48("58685")) {
    {}
  } else {
    stryCov_9fa48("58685");
    if (stryMutAct_9fa48("58688") ? typeof decisionDimension === TYPEOF.STRING || decisionDimension.length > NUM.ZERO : stryMutAct_9fa48("58687") ? false : stryMutAct_9fa48("58686") ? true : (stryCov_9fa48("58686", "58687", "58688"), (stryMutAct_9fa48("58690") ? typeof decisionDimension !== TYPEOF.STRING : stryMutAct_9fa48("58689") ? true : (stryCov_9fa48("58689", "58690"), typeof decisionDimension === TYPEOF.STRING)) && (stryMutAct_9fa48("58693") ? decisionDimension.length <= NUM.ZERO : stryMutAct_9fa48("58692") ? decisionDimension.length >= NUM.ZERO : stryMutAct_9fa48("58691") ? true : (stryCov_9fa48("58691", "58692", "58693"), decisionDimension.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("58694")) {
        {}
      } else {
        stryCov_9fa48("58694");
        return decisionDimension;
      }
    }
    switch (participationKind) {
      case CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY:
        if (stryMutAct_9fa48("58695")) {} else {
          stryCov_9fa48("58695");
          return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
        }
      case CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ:
      case CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ:
      default:
        if (stryMutAct_9fa48("58696")) {} else {
          stryCov_9fa48("58696");
          return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
        }
    }
  }
}
function buildParticipationErrorCode(participation) {
  if (stryMutAct_9fa48("58697")) {
    {}
  } else {
    stryCov_9fa48("58697");
    if (stryMutAct_9fa48("58700") ? participation?.reasonCode !== CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY : stryMutAct_9fa48("58699") ? false : stryMutAct_9fa48("58698") ? true : (stryCov_9fa48("58698", "58699", "58700"), (stryMutAct_9fa48("58701") ? participation.reasonCode : (stryCov_9fa48("58701"), participation?.reasonCode)) === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY)) {
      if (stryMutAct_9fa48("58702")) {
        {}
      } else {
        stryCov_9fa48("58702");
        return stryMutAct_9fa48("58703") ? "" : (stryCov_9fa48("58703"), 'ROUTER_QUERY_TRANSPORT_NOT_READY');
      }
    }
    return (stryMutAct_9fa48("58706") ? participation?.decision !== CONTROL_PLANE_PARTICIPATION_DECISION.DEFER : stryMutAct_9fa48("58705") ? false : stryMutAct_9fa48("58704") ? true : (stryCov_9fa48("58704", "58705", "58706"), (stryMutAct_9fa48("58707") ? participation.decision : (stryCov_9fa48("58707"), participation?.decision)) === CONTROL_PLANE_PARTICIPATION_DECISION.DEFER)) ? stryMutAct_9fa48("58708") ? "" : (stryCov_9fa48("58708"), 'CONTROL_PLANE_PARTICIPATION_DEFERRED') : stryMutAct_9fa48("58709") ? "" : (stryCov_9fa48("58709"), 'CONTROL_PLANE_PARTICIPATION_BLOCKED');
  }
}
function buildParticipationErrorMessage(participation) {
  if (stryMutAct_9fa48("58710")) {
    {}
  } else {
    stryCov_9fa48("58710");
    if (stryMutAct_9fa48("58713") ? participation?.reasonCode === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY && typeof participation?.localQueryTransport?.reason === TYPEOF.STRING || participation.localQueryTransport.reason.length > NUM.ZERO : stryMutAct_9fa48("58712") ? false : stryMutAct_9fa48("58711") ? true : (stryCov_9fa48("58711", "58712", "58713"), (stryMutAct_9fa48("58715") ? participation?.reasonCode === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY || typeof participation?.localQueryTransport?.reason === TYPEOF.STRING : stryMutAct_9fa48("58714") ? true : (stryCov_9fa48("58714", "58715"), (stryMutAct_9fa48("58717") ? participation?.reasonCode !== CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY : stryMutAct_9fa48("58716") ? true : (stryCov_9fa48("58716", "58717"), (stryMutAct_9fa48("58718") ? participation.reasonCode : (stryCov_9fa48("58718"), participation?.reasonCode)) === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY)) && (stryMutAct_9fa48("58720") ? typeof participation?.localQueryTransport?.reason !== TYPEOF.STRING : stryMutAct_9fa48("58719") ? true : (stryCov_9fa48("58719", "58720"), typeof (stryMutAct_9fa48("58722") ? participation.localQueryTransport?.reason : stryMutAct_9fa48("58721") ? participation?.localQueryTransport.reason : (stryCov_9fa48("58721", "58722"), participation?.localQueryTransport?.reason)) === TYPEOF.STRING)))) && (stryMutAct_9fa48("58725") ? participation.localQueryTransport.reason.length <= NUM.ZERO : stryMutAct_9fa48("58724") ? participation.localQueryTransport.reason.length >= NUM.ZERO : stryMutAct_9fa48("58723") ? true : (stryCov_9fa48("58723", "58724", "58725"), participation.localQueryTransport.reason.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("58726")) {
        {}
      } else {
        stryCov_9fa48("58726");
        return participation.localQueryTransport.reason;
      }
    }
    return (stryMutAct_9fa48("58729") ? participation?.decision !== CONTROL_PLANE_PARTICIPATION_DECISION.DEFER : stryMutAct_9fa48("58728") ? false : stryMutAct_9fa48("58727") ? true : (stryCov_9fa48("58727", "58728", "58729"), (stryMutAct_9fa48("58730") ? participation.decision : (stryCov_9fa48("58730"), participation?.decision)) === CONTROL_PLANE_PARTICIPATION_DECISION.DEFER)) ? stryMutAct_9fa48("58731") ? "" : (stryCov_9fa48("58731"), 'Control-plane participation deferred by canonical readiness') : stryMutAct_9fa48("58732") ? "" : (stryCov_9fa48("58732"), 'Control-plane participation blocked by canonical readiness');
  }
}
function shouldAllowLocalExecutionForParticipation({
  localNodeId = null,
  targetNodeId = null,
  participationKind = null,
  localQueryTransport = null
} = {}) {
  if (stryMutAct_9fa48("58733")) {
    {}
  } else {
    stryCov_9fa48("58733");
    if (stryMutAct_9fa48("58736") ? localNodeId === targetNodeId : stryMutAct_9fa48("58735") ? false : stryMutAct_9fa48("58734") ? true : (stryCov_9fa48("58734", "58735", "58736"), localNodeId !== targetNodeId)) {
      if (stryMutAct_9fa48("58737")) {
        {}
      } else {
        stryCov_9fa48("58737");
        return stryMutAct_9fa48("58738") ? true : (stryCov_9fa48("58738"), false);
      }
    }
    if (stryMutAct_9fa48("58741") ? participationKind !== CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ || participationKind !== CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY : stryMutAct_9fa48("58740") ? false : stryMutAct_9fa48("58739") ? true : (stryCov_9fa48("58739", "58740", "58741"), (stryMutAct_9fa48("58743") ? participationKind === CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ : stryMutAct_9fa48("58742") ? true : (stryCov_9fa48("58742", "58743"), participationKind !== CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ)) && (stryMutAct_9fa48("58745") ? participationKind === CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY : stryMutAct_9fa48("58744") ? true : (stryCov_9fa48("58744", "58745"), participationKind !== CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY)))) {
      if (stryMutAct_9fa48("58746")) {
        {}
      } else {
        stryCov_9fa48("58746");
        return stryMutAct_9fa48("58747") ? true : (stryCov_9fa48("58747"), false);
      }
    }
    if (stryMutAct_9fa48("58750") ? localQueryTransport?.ready === false : stryMutAct_9fa48("58749") ? false : stryMutAct_9fa48("58748") ? true : (stryCov_9fa48("58748", "58749", "58750"), (stryMutAct_9fa48("58751") ? localQueryTransport.ready : (stryCov_9fa48("58751"), localQueryTransport?.ready)) !== (stryMutAct_9fa48("58752") ? true : (stryCov_9fa48("58752"), false)))) {
      if (stryMutAct_9fa48("58753")) {
        {}
      } else {
        stryCov_9fa48("58753");
        return stryMutAct_9fa48("58754") ? true : (stryCov_9fa48("58754"), false);
      }
    }
    return stryMutAct_9fa48("58755") ? false : (stryCov_9fa48("58755"), true);
  }
}
class ControlPlaneReadinessService {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("58756")) {
      {}
    } else {
      stryCov_9fa48("58756");
      this.nodeId = stryMutAct_9fa48("58759") ? options.nodeId && null : stryMutAct_9fa48("58758") ? false : stryMutAct_9fa48("58757") ? true : (stryCov_9fa48("58757", "58758", "58759"), options.nodeId || null);
      this.systemTableCache = stryMutAct_9fa48("58762") ? options.systemTableCache && null : stryMutAct_9fa48("58761") ? false : stryMutAct_9fa48("58760") ? true : (stryCov_9fa48("58760", "58761", "58762"), options.systemTableCache || null);
      this.nodesOwner = stryMutAct_9fa48("58765") ? options.nodesOwner && null : stryMutAct_9fa48("58764") ? false : stryMutAct_9fa48("58763") ? true : (stryCov_9fa48("58763", "58764", "58765"), options.nodesOwner || null);
      this.servicesOwner = stryMutAct_9fa48("58768") ? options.servicesOwner && null : stryMutAct_9fa48("58767") ? false : stryMutAct_9fa48("58766") ? true : (stryCov_9fa48("58766", "58767", "58768"), options.servicesOwner || null);
      this.messageRouter = stryMutAct_9fa48("58771") ? options.messageRouter && null : stryMutAct_9fa48("58770") ? false : stryMutAct_9fa48("58769") ? true : (stryCov_9fa48("58769", "58770", "58771"), options.messageRouter || null);
      this.nodeLifecycleStateMachine = stryMutAct_9fa48("58774") ? options.nodeLifecycleStateMachine && null : stryMutAct_9fa48("58773") ? false : stryMutAct_9fa48("58772") ? true : (stryCov_9fa48("58772", "58773", "58774"), options.nodeLifecycleStateMachine || null);
      this.storageAccountingService = stryMutAct_9fa48("58777") ? options.storageAccountingService && null : stryMutAct_9fa48("58776") ? false : stryMutAct_9fa48("58775") ? true : (stryCov_9fa48("58775", "58776", "58777"), options.storageAccountingService || null);
      this.cdcIntegrationService = stryMutAct_9fa48("58780") ? options.cdcIntegrationService && null : stryMutAct_9fa48("58779") ? false : stryMutAct_9fa48("58778") ? true : (stryCov_9fa48("58778", "58779", "58780"), options.cdcIntegrationService || null);
      this.cacheMutationTarget = stryMutAct_9fa48("58783") ? (options.cacheMutationTarget || options.systemTableCache) && null : stryMutAct_9fa48("58782") ? false : stryMutAct_9fa48("58781") ? true : (stryCov_9fa48("58781", "58782", "58783"), (stryMutAct_9fa48("58785") ? options.cacheMutationTarget && options.systemTableCache : stryMutAct_9fa48("58784") ? false : (stryCov_9fa48("58784", "58785"), options.cacheMutationTarget || options.systemTableCache)) || null);
      this.cdcGroupPropagationService = stryMutAct_9fa48("58788") ? options.cdcGroupPropagationService && null : stryMutAct_9fa48("58787") ? false : stryMutAct_9fa48("58786") ? true : (stryCov_9fa48("58786", "58787", "58788"), options.cdcGroupPropagationService || null);
      this.heartbeatService = stryMutAct_9fa48("58791") ? options.heartbeatService && null : stryMutAct_9fa48("58790") ? false : stryMutAct_9fa48("58789") ? true : (stryCov_9fa48("58789", "58790", "58791"), options.heartbeatService || null);
      this.membershipPublicationService = stryMutAct_9fa48("58794") ? options.membershipPublicationService && null : stryMutAct_9fa48("58793") ? false : stryMutAct_9fa48("58792") ? true : (stryCov_9fa48("58792", "58793", "58794"), options.membershipPublicationService || null);
      this.strictOwnerDependencies = stryMutAct_9fa48("58797") ? options.strictOwnerDependencies !== true : stryMutAct_9fa48("58796") ? false : stryMutAct_9fa48("58795") ? true : (stryCov_9fa48("58795", "58796", "58797"), options.strictOwnerDependencies === (stryMutAct_9fa48("58798") ? false : (stryCov_9fa48("58798"), true)));
      this.clusterMemberStaleHeartbeatMaxAgeMs = (stryMutAct_9fa48("58801") ? Number.isFinite(options.clusterMemberStaleHeartbeatMaxAgeMs) || options.clusterMemberStaleHeartbeatMaxAgeMs > NUM.ZERO : stryMutAct_9fa48("58800") ? false : stryMutAct_9fa48("58799") ? true : (stryCov_9fa48("58799", "58800", "58801"), Number.isFinite(options.clusterMemberStaleHeartbeatMaxAgeMs) && (stryMutAct_9fa48("58804") ? options.clusterMemberStaleHeartbeatMaxAgeMs <= NUM.ZERO : stryMutAct_9fa48("58803") ? options.clusterMemberStaleHeartbeatMaxAgeMs >= NUM.ZERO : stryMutAct_9fa48("58802") ? true : (stryCov_9fa48("58802", "58803", "58804"), options.clusterMemberStaleHeartbeatMaxAgeMs > NUM.ZERO)))) ? Math.floor(options.clusterMemberStaleHeartbeatMaxAgeMs) : CONTROL_PLANE_READINESS_DEFAULT.CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS;
      this.authoritativeReadinessRepairCooldownMs = (stryMutAct_9fa48("58807") ? Number.isFinite(options.authoritativeReadinessRepairCooldownMs) || options.authoritativeReadinessRepairCooldownMs > NUM.ZERO : stryMutAct_9fa48("58806") ? false : stryMutAct_9fa48("58805") ? true : (stryCov_9fa48("58805", "58806", "58807"), Number.isFinite(options.authoritativeReadinessRepairCooldownMs) && (stryMutAct_9fa48("58810") ? options.authoritativeReadinessRepairCooldownMs <= NUM.ZERO : stryMutAct_9fa48("58809") ? options.authoritativeReadinessRepairCooldownMs >= NUM.ZERO : stryMutAct_9fa48("58808") ? true : (stryCov_9fa48("58808", "58809", "58810"), options.authoritativeReadinessRepairCooldownMs > NUM.ZERO)))) ? Math.floor(options.authoritativeReadinessRepairCooldownMs) : AUTHORITATIVE_READINESS_REPAIR.COOLDOWN_MS;
      this.authoritativeReadinessRepairFailureCooldownMs = (stryMutAct_9fa48("58813") ? Number.isFinite(options.authoritativeReadinessRepairFailureCooldownMs) || options.authoritativeReadinessRepairFailureCooldownMs > NUM.ZERO : stryMutAct_9fa48("58812") ? false : stryMutAct_9fa48("58811") ? true : (stryCov_9fa48("58811", "58812", "58813"), Number.isFinite(options.authoritativeReadinessRepairFailureCooldownMs) && (stryMutAct_9fa48("58816") ? options.authoritativeReadinessRepairFailureCooldownMs <= NUM.ZERO : stryMutAct_9fa48("58815") ? options.authoritativeReadinessRepairFailureCooldownMs >= NUM.ZERO : stryMutAct_9fa48("58814") ? true : (stryCov_9fa48("58814", "58815", "58816"), options.authoritativeReadinessRepairFailureCooldownMs > NUM.ZERO)))) ? Math.floor(options.authoritativeReadinessRepairFailureCooldownMs) : AUTHORITATIVE_READINESS_REPAIR.FAILURE_COOLDOWN_MS;
      this.authoritativeReadinessRepairNoChangeCooldownMs = (stryMutAct_9fa48("58819") ? Number.isFinite(options.authoritativeReadinessRepairNoChangeCooldownMs) || options.authoritativeReadinessRepairNoChangeCooldownMs > NUM.ZERO : stryMutAct_9fa48("58818") ? false : stryMutAct_9fa48("58817") ? true : (stryCov_9fa48("58817", "58818", "58819"), Number.isFinite(options.authoritativeReadinessRepairNoChangeCooldownMs) && (stryMutAct_9fa48("58822") ? options.authoritativeReadinessRepairNoChangeCooldownMs <= NUM.ZERO : stryMutAct_9fa48("58821") ? options.authoritativeReadinessRepairNoChangeCooldownMs >= NUM.ZERO : stryMutAct_9fa48("58820") ? true : (stryCov_9fa48("58820", "58821", "58822"), options.authoritativeReadinessRepairNoChangeCooldownMs > NUM.ZERO)))) ? Math.floor(options.authoritativeReadinessRepairNoChangeCooldownMs) : AUTHORITATIVE_READINESS_REPAIR.NO_CHANGE_COOLDOWN_MS;
      this.authoritativeReadinessRepairQueryTimeoutMs = (stryMutAct_9fa48("58825") ? Number.isFinite(options.authoritativeReadinessRepairQueryTimeoutMs) || options.authoritativeReadinessRepairQueryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("58824") ? false : stryMutAct_9fa48("58823") ? true : (stryCov_9fa48("58823", "58824", "58825"), Number.isFinite(options.authoritativeReadinessRepairQueryTimeoutMs) && (stryMutAct_9fa48("58828") ? options.authoritativeReadinessRepairQueryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("58827") ? options.authoritativeReadinessRepairQueryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("58826") ? true : (stryCov_9fa48("58826", "58827", "58828"), options.authoritativeReadinessRepairQueryTimeoutMs > NUM.ZERO)))) ? Math.floor(options.authoritativeReadinessRepairQueryTimeoutMs) : AUTHORITATIVE_READINESS_REPAIR.QUERY_TIMEOUT_MS;
      this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs = (stryMutAct_9fa48("58831") ? Number.isFinite(options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs) || options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs > NUM.ZERO : stryMutAct_9fa48("58830") ? false : stryMutAct_9fa48("58829") ? true : (stryCov_9fa48("58829", "58830", "58831"), Number.isFinite(options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs) && (stryMutAct_9fa48("58834") ? options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs <= NUM.ZERO : stryMutAct_9fa48("58833") ? options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs >= NUM.ZERO : stryMutAct_9fa48("58832") ? true : (stryCov_9fa48("58832", "58833", "58834"), options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs > NUM.ZERO)))) ? Math.floor(options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs) : AUTHORITATIVE_READINESS_REPAIR.STALE_HEARTBEAT_MAX_AGE_MS;
      this.membershipPublicationDiagnosticsQueryTimeoutMs = (stryMutAct_9fa48("58837") ? Number.isFinite(options.membershipPublicationDiagnosticsQueryTimeoutMs) || options.membershipPublicationDiagnosticsQueryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("58836") ? false : stryMutAct_9fa48("58835") ? true : (stryCov_9fa48("58835", "58836", "58837"), Number.isFinite(options.membershipPublicationDiagnosticsQueryTimeoutMs) && (stryMutAct_9fa48("58840") ? options.membershipPublicationDiagnosticsQueryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("58839") ? options.membershipPublicationDiagnosticsQueryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("58838") ? true : (stryCov_9fa48("58838", "58839", "58840"), options.membershipPublicationDiagnosticsQueryTimeoutMs > NUM.ZERO)))) ? Math.floor(options.membershipPublicationDiagnosticsQueryTimeoutMs) : CONTROL_PLANE_READINESS_DEFAULT.MEMBERSHIP_PUBLICATION_DIAGNOSTICS_QUERY_TIMEOUT_MS;
      this.membershipPublicationPlanningSnapshotRefreshTimeoutMs = (stryMutAct_9fa48("58843") ? Number.isFinite(options.membershipPublicationPlanningSnapshotRefreshTimeoutMs) || options.membershipPublicationPlanningSnapshotRefreshTimeoutMs > NUM.ZERO : stryMutAct_9fa48("58842") ? false : stryMutAct_9fa48("58841") ? true : (stryCov_9fa48("58841", "58842", "58843"), Number.isFinite(options.membershipPublicationPlanningSnapshotRefreshTimeoutMs) && (stryMutAct_9fa48("58846") ? options.membershipPublicationPlanningSnapshotRefreshTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("58845") ? options.membershipPublicationPlanningSnapshotRefreshTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("58844") ? true : (stryCov_9fa48("58844", "58845", "58846"), options.membershipPublicationPlanningSnapshotRefreshTimeoutMs > NUM.ZERO)))) ? Math.floor(options.membershipPublicationPlanningSnapshotRefreshTimeoutMs) : MEMBERSHIP_PUBLICATION_PLANNING.REFRESH_TIMEOUT_MS;
      this.membershipPublicationReadOptions = Object.freeze(stryMutAct_9fa48("58847") ? {} : (stryCov_9fa48("58847"), {
        ...MEMBERSHIP_PUBLICATION_READ_OPTIONS,
        queryTimeoutMs: this.membershipPublicationDiagnosticsQueryTimeoutMs
      }));
      this.setTimeoutFn = (stryMutAct_9fa48("58850") ? typeof options.setTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("58849") ? false : stryMutAct_9fa48("58848") ? true : (stryCov_9fa48("58848", "58849", "58850"), typeof options.setTimeoutFn === TYPEOF.FUNCTION)) ? options.setTimeoutFn : setTimeout;
      this.clearTimeoutFn = (stryMutAct_9fa48("58853") ? typeof options.clearTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("58852") ? false : stryMutAct_9fa48("58851") ? true : (stryCov_9fa48("58851", "58852", "58853"), typeof options.clearTimeoutFn === TYPEOF.FUNCTION)) ? options.clearTimeoutFn : clearTimeout;
      this.loggedMissingStorageAccountingOwner = stryMutAct_9fa48("58854") ? true : (stryCov_9fa48("58854"), false);
      this.loggedMissingPublicationOwner = stryMutAct_9fa48("58855") ? true : (stryCov_9fa48("58855"), false);
      this.readinessTransitionHistoryLimit = (stryMutAct_9fa48("58858") ? Number.isInteger(options.readinessTransitionHistoryLimit) || options.readinessTransitionHistoryLimit > NUM.ZERO : stryMutAct_9fa48("58857") ? false : stryMutAct_9fa48("58856") ? true : (stryCov_9fa48("58856", "58857", "58858"), Number.isInteger(options.readinessTransitionHistoryLimit) && (stryMutAct_9fa48("58861") ? options.readinessTransitionHistoryLimit <= NUM.ZERO : stryMutAct_9fa48("58860") ? options.readinessTransitionHistoryLimit >= NUM.ZERO : stryMutAct_9fa48("58859") ? true : (stryCov_9fa48("58859", "58860", "58861"), options.readinessTransitionHistoryLimit > NUM.ZERO)))) ? Math.floor(options.readinessTransitionHistoryLimit) : READINESS_TRANSITION_HISTORY_LIMIT;
      this.readinessTransitionHistoryByNodeId = new Map();
      this.lastReadinessEvaluationByNodeId = new Map();
      this.lastReadinessSnapshotByNodeId = new Map();
      this.lastReadinessSnapshotAtMsByNodeId = new Map();
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId = new Map();
      this.recoveryEpochHistoryLimit = (stryMutAct_9fa48("58864") ? Number.isInteger(options.recoveryEpochHistoryLimit) || options.recoveryEpochHistoryLimit > NUM.ZERO : stryMutAct_9fa48("58863") ? false : stryMutAct_9fa48("58862") ? true : (stryCov_9fa48("58862", "58863", "58864"), Number.isInteger(options.recoveryEpochHistoryLimit) && (stryMutAct_9fa48("58867") ? options.recoveryEpochHistoryLimit <= NUM.ZERO : stryMutAct_9fa48("58866") ? options.recoveryEpochHistoryLimit >= NUM.ZERO : stryMutAct_9fa48("58865") ? true : (stryCov_9fa48("58865", "58866", "58867"), options.recoveryEpochHistoryLimit > NUM.ZERO)))) ? Math.floor(options.recoveryEpochHistoryLimit) : RECOVERY_EPOCH_HISTORY_LIMIT;
      this.recoveryEpochEventLimit = (stryMutAct_9fa48("58870") ? Number.isInteger(options.recoveryEpochEventLimit) || options.recoveryEpochEventLimit > NUM.ZERO : stryMutAct_9fa48("58869") ? false : stryMutAct_9fa48("58868") ? true : (stryCov_9fa48("58868", "58869", "58870"), Number.isInteger(options.recoveryEpochEventLimit) && (stryMutAct_9fa48("58873") ? options.recoveryEpochEventLimit <= NUM.ZERO : stryMutAct_9fa48("58872") ? options.recoveryEpochEventLimit >= NUM.ZERO : stryMutAct_9fa48("58871") ? true : (stryCov_9fa48("58871", "58872", "58873"), options.recoveryEpochEventLimit > NUM.ZERO)))) ? Math.floor(options.recoveryEpochEventLimit) : RECOVERY_EPOCH_EVENT_LIMIT;
      this.currentRecoveryEpochByNodeId = new Map();
      this.recoveryEpochHistoryByNodeId = new Map();
      this.authoritativeControlPlaneView = stryMutAct_9fa48("58876") ? options.authoritativeControlPlaneView && null : stryMutAct_9fa48("58875") ? false : stryMutAct_9fa48("58874") ? true : (stryCov_9fa48("58874", "58875", "58876"), options.authoritativeControlPlaneView || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("58879") ? options.controlPlaneSystemTableGateway && (this.cdcIntegrationService || this.systemTableCache || this.messageRouter ? createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache: this.systemTableCache,
        messageRouter: this.messageRouter,
        now: options.now
      }).controlPlaneSystemTableGateway : null) : stryMutAct_9fa48("58878") ? false : stryMutAct_9fa48("58877") ? true : (stryCov_9fa48("58877", "58878", "58879"), options.controlPlaneSystemTableGateway || ((stryMutAct_9fa48("58882") ? (this.cdcIntegrationService || this.systemTableCache) && this.messageRouter : stryMutAct_9fa48("58881") ? false : stryMutAct_9fa48("58880") ? true : (stryCov_9fa48("58880", "58881", "58882"), (stryMutAct_9fa48("58884") ? this.cdcIntegrationService && this.systemTableCache : stryMutAct_9fa48("58883") ? false : (stryCov_9fa48("58883", "58884"), this.cdcIntegrationService || this.systemTableCache)) || this.messageRouter)) ? createControlPlaneRuntimeBundle(stryMutAct_9fa48("58885") ? {} : (stryCov_9fa48("58885"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache: this.systemTableCache,
        messageRouter: this.messageRouter,
        now: options.now
      })).controlPlaneSystemTableGateway : null));
      this.now = (stryMutAct_9fa48("58888") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("58887") ? false : stryMutAct_9fa48("58886") ? true : (stryCov_9fa48("58886", "58887", "58888"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("58889") ? () => undefined : (stryCov_9fa48("58889"), () => Date.now());
      this.participationDecisionLedger = stryMutAct_9fa48("58892") ? options.participationDecisionLedger && new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(options.participationDecisionLedgerMaxEntries, READINESS_DIAGNOSTICS_LEDGER_LIMIT),
        now: this.now
      }) : stryMutAct_9fa48("58891") ? false : stryMutAct_9fa48("58890") ? true : (stryCov_9fa48("58890", "58891", "58892"), options.participationDecisionLedger || new ControlPlaneDiagnosticsLedger(stryMutAct_9fa48("58893") ? {} : (stryCov_9fa48("58893"), {
        maxEntries: normalizePositiveInteger(options.participationDecisionLedgerMaxEntries, READINESS_DIAGNOSTICS_LEDGER_LIMIT),
        now: this.now
      })));
      this.authoritativeReadinessRepairLedger = stryMutAct_9fa48("58896") ? options.authoritativeReadinessRepairLedger && new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(options.authoritativeReadinessRepairLedgerMaxEntries, READINESS_DIAGNOSTICS_LEDGER_LIMIT),
        now: this.now
      }) : stryMutAct_9fa48("58895") ? false : stryMutAct_9fa48("58894") ? true : (stryCov_9fa48("58894", "58895", "58896"), options.authoritativeReadinessRepairLedger || new ControlPlaneDiagnosticsLedger(stryMutAct_9fa48("58897") ? {} : (stryCov_9fa48("58897"), {
        maxEntries: normalizePositiveInteger(options.authoritativeReadinessRepairLedgerMaxEntries, READINESS_DIAGNOSTICS_LEDGER_LIMIT),
        now: this.now
      })));
      this.readinessOperationWorkflowCoordinator = stryMutAct_9fa48("58900") ? options.readinessOperationWorkflowCoordinator && new DurableWorkflowCoordinator({
        now: this.now
      }) : stryMutAct_9fa48("58899") ? false : stryMutAct_9fa48("58898") ? true : (stryCov_9fa48("58898", "58899", "58900"), options.readinessOperationWorkflowCoordinator || new DurableWorkflowCoordinator(stryMutAct_9fa48("58901") ? {} : (stryCov_9fa48("58901"), {
        now: this.now
      })));
      this.readinessEvaluationLane = stryMutAct_9fa48("58904") ? options.readinessEvaluationLane && new OperationLane({
        name: 'control-plane-readiness-evaluation',
        workflowCoordinator: this.readinessOperationWorkflowCoordinator
      }) : stryMutAct_9fa48("58903") ? false : stryMutAct_9fa48("58902") ? true : (stryCov_9fa48("58902", "58903", "58904"), options.readinessEvaluationLane || new OperationLane(stryMutAct_9fa48("58905") ? {} : (stryCov_9fa48("58905"), {
        name: stryMutAct_9fa48("58906") ? "" : (stryCov_9fa48("58906"), 'control-plane-readiness-evaluation'),
        workflowCoordinator: this.readinessOperationWorkflowCoordinator
      })));
      this.cacheChangeListener = null;
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(CONTROL_PLANE_READINESS_SUBSYSTEM) : console;
      this.authoritativeNodeEvidenceReconciler = stryMutAct_9fa48("58909") ? options.authoritativeNodeEvidenceReconciler && new AuthoritativeNodeEvidenceReconciler({
        nodeId: this.nodeId,
        now: this.now,
        logger: this.logger,
        cdcIntegrationService: this.cdcIntegrationService,
        cacheMutationTarget: this.cacheMutationTarget,
        systemTableCache: this.systemTableCache,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        getAuthoritativeControlPlaneView: () => this.getAuthoritativeControlPlaneView(),
        readNodeRow: nodeId => this.readNodeRow(nodeId),
        readNodeServiceRows: nodeId => this.readNodeServiceRows(nodeId),
        resolveDecisionDimension: repairOptions => this.resolveReadinessDecisionDimension(repairOptions),
        getNodeTransportState: (nodeId, nodeRow) => this.getNodeTransportState(nodeId, nodeRow),
        shouldPreferLocalSelfNodeEvidence: context => this.shouldPreferLocalSelfNodeEvidence(context),
        hasFreshLocalReporterSuccess: nodeId => this.hasFreshLocalReporterSuccess(nodeId),
        buildNodeEvidence: (nodeId, nodeRow) => this.buildNodeEvidence(nodeId, nodeRow),
        isClusterMemberHealthy: (nodeId, nodeRow) => this.isClusterMemberHealthy(nodeId, nodeRow),
        hasRoutableService: serviceRows => this.hasRoutableService(serviceRows),
        hasWritableControlPlaneService: serviceRows => this.hasWritableControlPlaneService(serviceRows),
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
        authoritativeReadinessRepairLedger: options.authoritativeReadinessRepairLedger,
        authoritativeReadinessRepairLedgerMaxEntries: options.authoritativeReadinessRepairLedgerMaxEntries,
        authoritativeReadinessRepairLane: options.authoritativeReadinessRepairLane,
        authoritativeReadinessRepairCooldownMs: this.authoritativeReadinessRepairCooldownMs,
        authoritativeReadinessRepairFailureCooldownMs: this.authoritativeReadinessRepairFailureCooldownMs,
        authoritativeReadinessRepairNoChangeCooldownMs: this.authoritativeReadinessRepairNoChangeCooldownMs,
        authoritativeReadinessRepairQueryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
        authoritativeReadinessRepairStaleHeartbeatMaxAgeMs: this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs
      }) : stryMutAct_9fa48("58908") ? false : stryMutAct_9fa48("58907") ? true : (stryCov_9fa48("58907", "58908", "58909"), options.authoritativeNodeEvidenceReconciler || new AuthoritativeNodeEvidenceReconciler(stryMutAct_9fa48("58910") ? {} : (stryCov_9fa48("58910"), {
        nodeId: this.nodeId,
        now: this.now,
        logger: this.logger,
        cdcIntegrationService: this.cdcIntegrationService,
        cacheMutationTarget: this.cacheMutationTarget,
        systemTableCache: this.systemTableCache,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        getAuthoritativeControlPlaneView: stryMutAct_9fa48("58911") ? () => undefined : (stryCov_9fa48("58911"), () => this.getAuthoritativeControlPlaneView()),
        readNodeRow: stryMutAct_9fa48("58912") ? () => undefined : (stryCov_9fa48("58912"), nodeId => this.readNodeRow(nodeId)),
        readNodeServiceRows: stryMutAct_9fa48("58913") ? () => undefined : (stryCov_9fa48("58913"), nodeId => this.readNodeServiceRows(nodeId)),
        resolveDecisionDimension: stryMutAct_9fa48("58914") ? () => undefined : (stryCov_9fa48("58914"), repairOptions => this.resolveReadinessDecisionDimension(repairOptions)),
        getNodeTransportState: stryMutAct_9fa48("58915") ? () => undefined : (stryCov_9fa48("58915"), (nodeId, nodeRow) => this.getNodeTransportState(nodeId, nodeRow)),
        shouldPreferLocalSelfNodeEvidence: stryMutAct_9fa48("58916") ? () => undefined : (stryCov_9fa48("58916"), context => this.shouldPreferLocalSelfNodeEvidence(context)),
        hasFreshLocalReporterSuccess: stryMutAct_9fa48("58917") ? () => undefined : (stryCov_9fa48("58917"), nodeId => this.hasFreshLocalReporterSuccess(nodeId)),
        buildNodeEvidence: stryMutAct_9fa48("58918") ? () => undefined : (stryCov_9fa48("58918"), (nodeId, nodeRow) => this.buildNodeEvidence(nodeId, nodeRow)),
        isClusterMemberHealthy: stryMutAct_9fa48("58919") ? () => undefined : (stryCov_9fa48("58919"), (nodeId, nodeRow) => this.isClusterMemberHealthy(nodeId, nodeRow)),
        hasRoutableService: stryMutAct_9fa48("58920") ? () => undefined : (stryCov_9fa48("58920"), serviceRows => this.hasRoutableService(serviceRows)),
        hasWritableControlPlaneService: stryMutAct_9fa48("58921") ? () => undefined : (stryCov_9fa48("58921"), serviceRows => this.hasWritableControlPlaneService(serviceRows)),
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
        authoritativeReadinessRepairLedger: options.authoritativeReadinessRepairLedger,
        authoritativeReadinessRepairLedgerMaxEntries: options.authoritativeReadinessRepairLedgerMaxEntries,
        authoritativeReadinessRepairLane: options.authoritativeReadinessRepairLane,
        authoritativeReadinessRepairCooldownMs: this.authoritativeReadinessRepairCooldownMs,
        authoritativeReadinessRepairFailureCooldownMs: this.authoritativeReadinessRepairFailureCooldownMs,
        authoritativeReadinessRepairNoChangeCooldownMs: this.authoritativeReadinessRepairNoChangeCooldownMs,
        authoritativeReadinessRepairQueryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
        authoritativeReadinessRepairStaleHeartbeatMaxAgeMs: this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs
      })));
      this.subscribeToCacheChanges();
    }
  }

  /**
   * Log one-time diagnostics for missing readiness owners.
   * In non-strict mode the service degrades intentionally, so warn instead
   * of emitting a hard-error signal.
   * @param {string} message
   * @param {string} owner
   * @private
   */
  logMissingOwner(message, owner) {
    if (stryMutAct_9fa48("58922")) {
      {}
    } else {
      stryCov_9fa48("58922");
      const level = this.strictOwnerDependencies ? stryMutAct_9fa48("58923") ? "" : (stryCov_9fa48("58923"), 'error') : stryMutAct_9fa48("58924") ? "" : (stryCov_9fa48("58924"), 'warn');
      const logFn = (stryMutAct_9fa48("58927") ? typeof this.logger?.[level] !== TYPEOF.FUNCTION : stryMutAct_9fa48("58926") ? false : stryMutAct_9fa48("58925") ? true : (stryCov_9fa48("58925", "58926", "58927"), typeof (stryMutAct_9fa48("58928") ? this.logger[level] : (stryCov_9fa48("58928"), this.logger?.[level])) === TYPEOF.FUNCTION)) ? this.logger[level].bind(this.logger) : null;
      if (stryMutAct_9fa48("58931") ? false : stryMutAct_9fa48("58930") ? true : stryMutAct_9fa48("58929") ? logFn : (stryCov_9fa48("58929", "58930", "58931"), !logFn)) {
        if (stryMutAct_9fa48("58932")) {
          {}
        } else {
          stryCov_9fa48("58932");
          return;
        }
      }
      logFn(message, stryMutAct_9fa48("58933") ? {} : (stryCov_9fa48("58933"), {
        nodeId: this.nodeId,
        owner,
        strictOwnerDependencies: this.strictOwnerDependencies
      }));
    }
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    if (stryMutAct_9fa48("58934")) {
      {}
    } else {
      stryCov_9fa48("58934");
      const previousSystemTableCache = this.systemTableCache;
      const systemTableCacheProvided = Object.hasOwn(options, stryMutAct_9fa48("58935") ? "" : (stryCov_9fa48("58935"), 'systemTableCache'));
      const cacheMutationTargetProvided = Object.hasOwn(options, stryMutAct_9fa48("58936") ? "" : (stryCov_9fa48("58936"), 'cacheMutationTarget'));
      if (stryMutAct_9fa48("58938") ? false : stryMutAct_9fa48("58937") ? true : (stryCov_9fa48("58937", "58938"), systemTableCacheProvided)) {
        if (stryMutAct_9fa48("58939")) {
          {}
        } else {
          stryCov_9fa48("58939");
          this.systemTableCache = stryMutAct_9fa48("58942") ? options.systemTableCache && null : stryMutAct_9fa48("58941") ? false : stryMutAct_9fa48("58940") ? true : (stryCov_9fa48("58940", "58941", "58942"), options.systemTableCache || null);
        }
      }
      if (stryMutAct_9fa48("58944") ? false : stryMutAct_9fa48("58943") ? true : (stryCov_9fa48("58943", "58944"), cacheMutationTargetProvided)) {
        if (stryMutAct_9fa48("58945")) {
          {}
        } else {
          stryCov_9fa48("58945");
          this.cacheMutationTarget = stryMutAct_9fa48("58948") ? options.cacheMutationTarget && null : stryMutAct_9fa48("58947") ? false : stryMutAct_9fa48("58946") ? true : (stryCov_9fa48("58946", "58947", "58948"), options.cacheMutationTarget || null);
        }
      } else if (stryMutAct_9fa48("58950") ? false : stryMutAct_9fa48("58949") ? true : (stryCov_9fa48("58949", "58950"), systemTableCacheProvided)) {
        if (stryMutAct_9fa48("58951")) {
          {}
        } else {
          stryCov_9fa48("58951");
          this.cacheMutationTarget = this.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("58953") ? false : stryMutAct_9fa48("58952") ? true : (stryCov_9fa48("58952", "58953"), Object.hasOwn(options, stryMutAct_9fa48("58954") ? "" : (stryCov_9fa48("58954"), 'messageRouter')))) {
        if (stryMutAct_9fa48("58955")) {
          {}
        } else {
          stryCov_9fa48("58955");
          this.messageRouter = stryMutAct_9fa48("58958") ? options.messageRouter && null : stryMutAct_9fa48("58957") ? false : stryMutAct_9fa48("58956") ? true : (stryCov_9fa48("58956", "58957", "58958"), options.messageRouter || null);
        }
      }
      if (stryMutAct_9fa48("58960") ? false : stryMutAct_9fa48("58959") ? true : (stryCov_9fa48("58959", "58960"), Object.hasOwn(options, stryMutAct_9fa48("58961") ? "" : (stryCov_9fa48("58961"), 'cdcIntegrationService')))) {
        if (stryMutAct_9fa48("58962")) {
          {}
        } else {
          stryCov_9fa48("58962");
          this.cdcIntegrationService = stryMutAct_9fa48("58965") ? options.cdcIntegrationService && null : stryMutAct_9fa48("58964") ? false : stryMutAct_9fa48("58963") ? true : (stryCov_9fa48("58963", "58964", "58965"), options.cdcIntegrationService || null);
        }
      }
      if (stryMutAct_9fa48("58967") ? false : stryMutAct_9fa48("58966") ? true : (stryCov_9fa48("58966", "58967"), Object.hasOwn(options, stryMutAct_9fa48("58968") ? "" : (stryCov_9fa48("58968"), 'storageAccountingService')))) {
        if (stryMutAct_9fa48("58969")) {
          {}
        } else {
          stryCov_9fa48("58969");
          this.storageAccountingService = stryMutAct_9fa48("58972") ? options.storageAccountingService && null : stryMutAct_9fa48("58971") ? false : stryMutAct_9fa48("58970") ? true : (stryCov_9fa48("58970", "58971", "58972"), options.storageAccountingService || null);
        }
      }
      if (stryMutAct_9fa48("58974") ? false : stryMutAct_9fa48("58973") ? true : (stryCov_9fa48("58973", "58974"), Object.hasOwn(options, stryMutAct_9fa48("58975") ? "" : (stryCov_9fa48("58975"), 'cdcGroupPropagationService')))) {
        if (stryMutAct_9fa48("58976")) {
          {}
        } else {
          stryCov_9fa48("58976");
          this.cdcGroupPropagationService = stryMutAct_9fa48("58979") ? options.cdcGroupPropagationService && null : stryMutAct_9fa48("58978") ? false : stryMutAct_9fa48("58977") ? true : (stryCov_9fa48("58977", "58978", "58979"), options.cdcGroupPropagationService || null);
        }
      }
      if (stryMutAct_9fa48("58981") ? false : stryMutAct_9fa48("58980") ? true : (stryCov_9fa48("58980", "58981"), Object.hasOwn(options, stryMutAct_9fa48("58982") ? "" : (stryCov_9fa48("58982"), 'membershipPublicationService')))) {
        if (stryMutAct_9fa48("58983")) {
          {}
        } else {
          stryCov_9fa48("58983");
          this.membershipPublicationService = stryMutAct_9fa48("58986") ? options.membershipPublicationService && null : stryMutAct_9fa48("58985") ? false : stryMutAct_9fa48("58984") ? true : (stryCov_9fa48("58984", "58985", "58986"), options.membershipPublicationService || null);
        }
      }
      if (stryMutAct_9fa48("58989") ? this.authoritativeControlPlaneView || typeof this.authoritativeControlPlaneView.syncOwnerDependencies === TYPEOF.FUNCTION : stryMutAct_9fa48("58988") ? false : stryMutAct_9fa48("58987") ? true : (stryCov_9fa48("58987", "58988", "58989"), this.authoritativeControlPlaneView && (stryMutAct_9fa48("58991") ? typeof this.authoritativeControlPlaneView.syncOwnerDependencies !== TYPEOF.FUNCTION : stryMutAct_9fa48("58990") ? true : (stryCov_9fa48("58990", "58991"), typeof this.authoritativeControlPlaneView.syncOwnerDependencies === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("58992")) {
          {}
        } else {
          stryCov_9fa48("58992");
          this.authoritativeControlPlaneView.syncOwnerDependencies(stryMutAct_9fa48("58993") ? {} : (stryCov_9fa48("58993"), {
            cdcIntegrationService: this.cdcIntegrationService,
            messageRouter: this.messageRouter
          }));
        }
      }
      if (stryMutAct_9fa48("58996") ? systemTableCacheProvided || previousSystemTableCache !== this.systemTableCache : stryMutAct_9fa48("58995") ? false : stryMutAct_9fa48("58994") ? true : (stryCov_9fa48("58994", "58995", "58996"), systemTableCacheProvided && (stryMutAct_9fa48("58998") ? previousSystemTableCache === this.systemTableCache : stryMutAct_9fa48("58997") ? true : (stryCov_9fa48("58997", "58998"), previousSystemTableCache !== this.systemTableCache)))) {
        if (stryMutAct_9fa48("58999")) {
          {}
        } else {
          stryCov_9fa48("58999");
          if (stryMutAct_9fa48("59002") ? this.cacheChangeListener || typeof previousSystemTableCache?.offCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("59001") ? false : stryMutAct_9fa48("59000") ? true : (stryCov_9fa48("59000", "59001", "59002"), this.cacheChangeListener && (stryMutAct_9fa48("59004") ? typeof previousSystemTableCache?.offCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("59003") ? true : (stryCov_9fa48("59003", "59004"), typeof (stryMutAct_9fa48("59005") ? previousSystemTableCache.offCacheChange : (stryCov_9fa48("59005"), previousSystemTableCache?.offCacheChange)) === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("59006")) {
              {}
            } else {
              stryCov_9fa48("59006");
              previousSystemTableCache.offCacheChange(this.cacheChangeListener);
            }
          }
          this.cacheChangeListener = null;
          this.subscribeToCacheChanges();
        }
      }
    }
  }

  /**
   * Build readiness for every known node.
   * @return {Promise<Object[]>}
   */
  async getAllNodeReadiness(options = {}) {
    if (stryMutAct_9fa48("59007")) {
      {}
    } else {
      stryCov_9fa48("59007");
      const nodeRows = await this.readNodeRows(options);
      const serviceRows = await this.readAllNodeServiceRows(options);
      const bulkNodeRowsAreAuthoritative = stryMutAct_9fa48("59010") ? options.allowAuthoritativeRefresh === true && this.nodesOwner || typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION : stryMutAct_9fa48("59009") ? false : stryMutAct_9fa48("59008") ? true : (stryCov_9fa48("59008", "59009", "59010"), (stryMutAct_9fa48("59012") ? options.allowAuthoritativeRefresh === true || this.nodesOwner : stryMutAct_9fa48("59011") ? true : (stryCov_9fa48("59011", "59012"), (stryMutAct_9fa48("59014") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("59013") ? true : (stryCov_9fa48("59013", "59014"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("59015") ? false : (stryCov_9fa48("59015"), true)))) && this.nodesOwner)) && (stryMutAct_9fa48("59017") ? typeof this.nodesOwner.listNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("59016") ? true : (stryCov_9fa48("59016", "59017"), typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION)));
      const bulkServiceRowsAreAuthoritative = stryMutAct_9fa48("59020") ? options.allowAuthoritativeRefresh === true && this.servicesOwner || typeof this.servicesOwner.listServices === TYPEOF.FUNCTION : stryMutAct_9fa48("59019") ? false : stryMutAct_9fa48("59018") ? true : (stryCov_9fa48("59018", "59019", "59020"), (stryMutAct_9fa48("59022") ? options.allowAuthoritativeRefresh === true || this.servicesOwner : stryMutAct_9fa48("59021") ? true : (stryCov_9fa48("59021", "59022"), (stryMutAct_9fa48("59024") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("59023") ? true : (stryCov_9fa48("59023", "59024"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("59025") ? false : (stryCov_9fa48("59025"), true)))) && this.servicesOwner)) && (stryMutAct_9fa48("59027") ? typeof this.servicesOwner.listServices !== TYPEOF.FUNCTION : stryMutAct_9fa48("59026") ? true : (stryCov_9fa48("59026", "59027"), typeof this.servicesOwner.listServices === TYPEOF.FUNCTION)));
      const nodeIds = new Set();
      for (const nodeRow of nodeRows) {
        if (stryMutAct_9fa48("59028")) {
          {}
        } else {
          stryCov_9fa48("59028");
          const nodeId = stryMutAct_9fa48("59031") ? nodeRow?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("59030") ? false : stryMutAct_9fa48("59029") ? true : (stryCov_9fa48("59029", "59030", "59031"), (stryMutAct_9fa48("59032") ? nodeRow[COLUMN.NODE_ID] : (stryCov_9fa48("59032"), nodeRow?.[COLUMN.NODE_ID])) || null);
          if (stryMutAct_9fa48("59034") ? false : stryMutAct_9fa48("59033") ? true : (stryCov_9fa48("59033", "59034"), nodeId)) {
            if (stryMutAct_9fa48("59035")) {
              {}
            } else {
              stryCov_9fa48("59035");
              nodeIds.add(nodeId);
            }
          }
        }
      }
      if (stryMutAct_9fa48("59038") ? serviceRows.length > NUM.ZERO && typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("59037") ? false : stryMutAct_9fa48("59036") ? true : (stryCov_9fa48("59036", "59037", "59038"), (stryMutAct_9fa48("59041") ? serviceRows.length <= NUM.ZERO : stryMutAct_9fa48("59040") ? serviceRows.length >= NUM.ZERO : stryMutAct_9fa48("59039") ? false : (stryCov_9fa48("59039", "59040", "59041"), serviceRows.length > NUM.ZERO)) || (stryMutAct_9fa48("59043") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("59042") ? false : (stryCov_9fa48("59042", "59043"), typeof (stryMutAct_9fa48("59044") ? this.systemTableCache.getAll : (stryCov_9fa48("59044"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("59045")) {
          {}
        } else {
          stryCov_9fa48("59045");
          const nodeEndpointRows = stryMutAct_9fa48("59048") ? this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) && [] : stryMutAct_9fa48("59047") ? false : stryMutAct_9fa48("59046") ? true : (stryCov_9fa48("59046", "59047", "59048"), this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || (stryMutAct_9fa48("59049") ? ["Stryker was here"] : (stryCov_9fa48("59049"), [])));
          for (const serviceRow of serviceRows) {
            if (stryMutAct_9fa48("59050")) {
              {}
            } else {
              stryCov_9fa48("59050");
              const nodeId = stryMutAct_9fa48("59053") ? serviceRow?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("59052") ? false : stryMutAct_9fa48("59051") ? true : (stryCov_9fa48("59051", "59052", "59053"), (stryMutAct_9fa48("59054") ? serviceRow[COLUMN.NODE_ID] : (stryCov_9fa48("59054"), serviceRow?.[COLUMN.NODE_ID])) || null);
              if (stryMutAct_9fa48("59056") ? false : stryMutAct_9fa48("59055") ? true : (stryCov_9fa48("59055", "59056"), nodeId)) {
                if (stryMutAct_9fa48("59057")) {
                  {}
                } else {
                  stryCov_9fa48("59057");
                  nodeIds.add(nodeId);
                }
              }
            }
          }
          for (const endpointRow of nodeEndpointRows) {
            if (stryMutAct_9fa48("59058")) {
              {}
            } else {
              stryCov_9fa48("59058");
              const nodeId = stryMutAct_9fa48("59061") ? endpointRow?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("59060") ? false : stryMutAct_9fa48("59059") ? true : (stryCov_9fa48("59059", "59060", "59061"), (stryMutAct_9fa48("59062") ? endpointRow[COLUMN.NODE_ID] : (stryCov_9fa48("59062"), endpointRow?.[COLUMN.NODE_ID])) || null);
              if (stryMutAct_9fa48("59064") ? false : stryMutAct_9fa48("59063") ? true : (stryCov_9fa48("59063", "59064"), nodeId)) {
                if (stryMutAct_9fa48("59065")) {
                  {}
                } else {
                  stryCov_9fa48("59065");
                  nodeIds.add(nodeId);
                }
              }
            }
          }
        }
      }
      for (const nodeId of this.lastReadinessSnapshotByNodeId.keys()) {
        if (stryMutAct_9fa48("59066")) {
          {}
        } else {
          stryCov_9fa48("59066");
          if (stryMutAct_9fa48("59068") ? false : stryMutAct_9fa48("59067") ? true : (stryCov_9fa48("59067", "59068"), nodeId)) {
            if (stryMutAct_9fa48("59069")) {
              {}
            } else {
              stryCov_9fa48("59069");
              nodeIds.add(nodeId);
            }
          }
        }
      }
      const readiness = stryMutAct_9fa48("59070") ? ["Stryker was here"] : (stryCov_9fa48("59070"), []);
      for (const nodeId of stryMutAct_9fa48("59071") ? [...nodeIds] : (stryCov_9fa48("59071"), (stryMutAct_9fa48("59072") ? [] : (stryCov_9fa48("59072"), [...nodeIds])).sort())) {
        if (stryMutAct_9fa48("59073")) {
          {}
        } else {
          stryCov_9fa48("59073");
          readiness.push(await this.getNodeReadiness(nodeId, stryMutAct_9fa48("59074") ? {} : (stryCov_9fa48("59074"), {
            ...options,
            allNodeRows: bulkNodeRowsAreAuthoritative ? nodeRows : null,
            allServiceRows: bulkServiceRowsAreAuthoritative ? serviceRows : null
          })));
        }
      }
      return readiness;
    }
  }

  /**
   * Build readiness for one node.
   * @readModel READINESS_NODE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_SERVICE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_CAPACITY — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async getNodeReadiness(nodeId, options = {}) {
    if (stryMutAct_9fa48("59075")) {
      {}
    } else {
      stryCov_9fa48("59075");
      const maxCachedAgeMs = normalizePositiveInteger(options.maxCachedAgeMs);
      const cachedSnapshot = this.getCachedReadinessSnapshot(nodeId, maxCachedAgeMs, options);
      if (stryMutAct_9fa48("59077") ? false : stryMutAct_9fa48("59076") ? true : (stryCov_9fa48("59076", "59077"), cachedSnapshot)) {
        if (stryMutAct_9fa48("59078")) {
          {}
        } else {
          stryCov_9fa48("59078");
          const snapshotInvalidated = this.isReadinessSnapshotInvalidated(nodeId);
          if (stryMutAct_9fa48("59080") ? false : stryMutAct_9fa48("59079") ? true : (stryCov_9fa48("59079", "59080"), this.shouldPreferBackgroundRefreshOnIneligible(cachedSnapshot, options))) {
            if (stryMutAct_9fa48("59081")) {
              {}
            } else {
              stryCov_9fa48("59081");
              this.maybeStartBackgroundReadinessRefresh(nodeId, options);
              return cachedSnapshot;
            }
          }
          if (stryMutAct_9fa48("59083") ? false : stryMutAct_9fa48("59082") ? true : (stryCov_9fa48("59082", "59083"), this.shouldBypassCachedSnapshot(cachedSnapshot, options))) {
            // Fall through to a fresh owner-path evaluation when cached readiness
            // is currently ineligible for the requested decision.
          } else if (stryMutAct_9fa48("59086") ? options.allowStaleOnCacheChange === true || snapshotInvalidated : stryMutAct_9fa48("59085") ? false : stryMutAct_9fa48("59084") ? true : (stryCov_9fa48("59084", "59085", "59086"), (stryMutAct_9fa48("59088") ? options.allowStaleOnCacheChange !== true : stryMutAct_9fa48("59087") ? true : (stryCov_9fa48("59087", "59088"), options.allowStaleOnCacheChange === (stryMutAct_9fa48("59089") ? false : (stryCov_9fa48("59089"), true)))) && snapshotInvalidated)) {
            if (stryMutAct_9fa48("59090")) {
              {}
            } else {
              stryCov_9fa48("59090");
              this.maybeStartBackgroundReadinessRefresh(nodeId, options);
              return cachedSnapshot;
            }
          } else {
            if (stryMutAct_9fa48("59091")) {
              {}
            } else {
              stryCov_9fa48("59091");
              return cachedSnapshot;
            }
          }
        }
      }
      const evaluationKey = this.buildReadinessEvaluationKey(nodeId, options);
      return this.readinessEvaluationLane.run(stryMutAct_9fa48("59092") ? {} : (stryCov_9fa48("59092"), {
        ownerKey: evaluationKey
      }), stryMutAct_9fa48("59093") ? () => undefined : (stryCov_9fa48("59093"), async () => this.evaluateNodeReadiness(nodeId, options)));
    }
  }

  /**
   * Build readiness for one node without consulting the short-lived snapshot
   * cache. Callers that need hot-path deduplication should use
   * `getNodeReadiness`.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   * @private
   */
  async evaluateNodeReadiness(nodeId, options = {}) {
    if (stryMutAct_9fa48("59094")) {
      {}
    } else {
      stryCov_9fa48("59094");
      const observedAt = normalizeIsoTimestamp(this.now());
      const publication = this.getPublicationDiagnostics(observedAt);
      const membershipPublication = await this.getMembershipPublicationDiagnostics(nodeId, observedAt);
      let nodeRow = await this.readNodeRow(nodeId, options);
      let serviceRows = await this.readNodeServiceRows(nodeId, options);
      if (stryMutAct_9fa48("59097") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("59096") ? false : stryMutAct_9fa48("59095") ? true : (stryCov_9fa48("59095", "59096", "59097"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("59098") ? false : (stryCov_9fa48("59098"), true)))) {
        if (stryMutAct_9fa48("59099")) {
          {}
        } else {
          stryCov_9fa48("59099");
          const repaired = await this.authoritativeNodeEvidenceReconciler.maybeRepairNodeEvidence(stryMutAct_9fa48("59100") ? {} : (stryCov_9fa48("59100"), {
            nodeId,
            nodeRow,
            serviceRows
          }), options);
          if (stryMutAct_9fa48("59102") ? false : stryMutAct_9fa48("59101") ? true : (stryCov_9fa48("59101", "59102"), repaired)) {
            if (stryMutAct_9fa48("59103")) {
              {}
            } else {
              stryCov_9fa48("59103");
              nodeRow = await this.readNodeRow(nodeId, options);
              serviceRows = await this.readNodeServiceRows(nodeId, options);
            }
          }
        }
      }
      if (stryMutAct_9fa48("59106") ? false : stryMutAct_9fa48("59105") ? true : stryMutAct_9fa48("59104") ? nodeRow : (stryCov_9fa48("59104", "59105", "59106"), !nodeRow)) {
        if (stryMutAct_9fa48("59107")) {
          {}
        } else {
          stryCov_9fa48("59107");
          const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(nodeId, null, publication, membershipPublication);
          if (stryMutAct_9fa48("59109") ? false : stryMutAct_9fa48("59108") ? true : (stryCov_9fa48("59108", "59109"), fresherStoredSnapshot)) {
            if (stryMutAct_9fa48("59110")) {
              {}
            } else {
              stryCov_9fa48("59110");
              return fresherStoredSnapshot;
            }
          }
          const missingReadiness = this.buildMissingNodeReadiness(nodeId, observedAt, publication, membershipPublication);
          this.recordReadinessTransition(stryMutAct_9fa48("59111") ? {} : (stryCov_9fa48("59111"), {
            nodeId,
            observedAt,
            publication,
            membershipPublication,
            nodeEvidence: null,
            dimensions: missingReadiness.dimensions,
            reasons: missingReadiness.reasons,
            priorityControlPlaneRecovery: missingReadiness.priorityControlPlaneRecovery
          }));
          const snapshot = Object.freeze(stryMutAct_9fa48("59112") ? {} : (stryCov_9fa48("59112"), {
            ...missingReadiness,
            recentTransitions: this.getReadinessTransitionHistory(nodeId)
          }));
          this.storeReadinessSnapshot(nodeId, snapshot);
          return snapshot;
        }
      }
      const lifecycleState = this.getLifecycleState(nodeId, nodeRow);
      const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
      const capacity = await this.getCapacitySnapshot(nodeId, nodeRow);
      const dimensions = this.buildDimensions(stryMutAct_9fa48("59113") ? {} : (stryCov_9fa48("59113"), {
        nodeId,
        nodeRow,
        nodeEvidence,
        lifecycleState,
        serviceRows,
        capacity,
        publication,
        membershipPublication
      }));
      const priorityControlPlaneRecovery = this.getPriorityControlPlaneRecoveryState(stryMutAct_9fa48("59114") ? {} : (stryCov_9fa48("59114"), {
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        dimensions
      }));
      const reasons = this.buildReasons(stryMutAct_9fa48("59115") ? {} : (stryCov_9fa48("59115"), {
        nodeId,
        nodeRow,
        nodeEvidence,
        dimensions,
        lifecycleState,
        serviceRows,
        capacity,
        publication,
        membershipPublication,
        priorityControlPlaneRecovery,
        observedAt
      }));
      const snapshot = Object.freeze(stryMutAct_9fa48("59116") ? {} : (stryCov_9fa48("59116"), {
        ...createEligibilitySnapshot(stryMutAct_9fa48("59117") ? {} : (stryCov_9fa48("59117"), {
          nodeId,
          lifecycleState,
          publication,
          membershipPublication,
          priorityControlPlaneRecovery,
          capacity,
          nodeEvidence,
          observedAt,
          dimensions,
          reasons
        })),
        recentTransitions: this.recordReadinessTransition(stryMutAct_9fa48("59118") ? {} : (stryCov_9fa48("59118"), {
          nodeId,
          observedAt,
          publication,
          membershipPublication,
          nodeEvidence,
          dimensions,
          reasons,
          priorityControlPlaneRecovery
        }))
      }));
      this.storeReadinessSnapshot(nodeId, snapshot);
      return snapshot;
    }
  }

  /**
   * Synchronous readiness snapshot for a single node.
   * Computes all dimensions that do not require async capacity lookup.
   * `placementEligible` is conservatively false when capacity is
   * unavailable synchronously, but `serveEligible` remains a pure
   * traffic-admission signal so routing does not fail closed on
   * unavailable placement accounting alone.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Object|null} Frozen readiness snapshot or null.
   */
  getNodeReadinessSync(nodeId, options = {}) {
    if (stryMutAct_9fa48("59119")) {
      {}
    } else {
      stryCov_9fa48("59119");
      const observedAt = normalizeIsoTimestamp(this.now());
      const nodeRow = this.getNodeRow(nodeId);
      const publication = this.getPublicationDiagnostics(observedAt);
      const membershipPublication = this.getMembershipPublicationDiagnosticsSync(nodeId, observedAt);
      const serviceRows = this.getNodeServiceRows(nodeId);
      const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(nodeId, nodeRow, publication, membershipPublication);
      if (stryMutAct_9fa48("59121") ? false : stryMutAct_9fa48("59120") ? true : (stryCov_9fa48("59120", "59121"), fresherStoredSnapshot)) {
        if (stryMutAct_9fa48("59122")) {
          {}
        } else {
          stryCov_9fa48("59122");
          this.maybeStartBackgroundSyncReadinessRefresh(stryMutAct_9fa48("59123") ? {} : (stryCov_9fa48("59123"), {
            nodeId,
            nodeRow,
            serviceRows,
            snapshot: fresherStoredSnapshot
          }), options);
          return fresherStoredSnapshot;
        }
      }
      if (stryMutAct_9fa48("59126") ? false : stryMutAct_9fa48("59125") ? true : stryMutAct_9fa48("59124") ? nodeRow : (stryCov_9fa48("59124", "59125", "59126"), !nodeRow)) {
        if (stryMutAct_9fa48("59127")) {
          {}
        } else {
          stryCov_9fa48("59127");
          const missingReadiness = this.buildMissingNodeReadiness(nodeId, observedAt, publication, membershipPublication);
          this.recordReadinessTransition(stryMutAct_9fa48("59128") ? {} : (stryCov_9fa48("59128"), {
            nodeId,
            observedAt,
            publication,
            membershipPublication,
            nodeEvidence: null,
            dimensions: missingReadiness.dimensions,
            reasons: missingReadiness.reasons,
            priorityControlPlaneRecovery: missingReadiness.priorityControlPlaneRecovery
          }));
          const snapshot = Object.freeze(stryMutAct_9fa48("59129") ? {} : (stryCov_9fa48("59129"), {
            ...missingReadiness,
            recentTransitions: this.getReadinessTransitionHistory(nodeId)
          }));
          this.storeReadinessSnapshot(nodeId, snapshot);
          this.maybeStartBackgroundSyncReadinessRefresh(stryMutAct_9fa48("59130") ? {} : (stryCov_9fa48("59130"), {
            nodeId,
            nodeRow,
            serviceRows,
            snapshot
          }), options);
          return snapshot;
        }
      }
      const lifecycleState = this.getLifecycleState(nodeId, nodeRow);
      const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
      const capacity = this.getCapacitySnapshotSync(nodeId, nodeRow);
      const dimensions = this.buildDimensions(stryMutAct_9fa48("59131") ? {} : (stryCov_9fa48("59131"), {
        nodeId,
        nodeRow,
        nodeEvidence,
        lifecycleState,
        serviceRows,
        capacity,
        publication,
        membershipPublication
      }));
      const priorityControlPlaneRecovery = this.getPriorityControlPlaneRecoveryState(stryMutAct_9fa48("59132") ? {} : (stryCov_9fa48("59132"), {
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        dimensions
      }));
      const reasons = this.buildReasons(stryMutAct_9fa48("59133") ? {} : (stryCov_9fa48("59133"), {
        nodeId,
        nodeRow,
        nodeEvidence,
        dimensions,
        lifecycleState,
        serviceRows,
        capacity,
        publication,
        membershipPublication,
        priorityControlPlaneRecovery,
        observedAt
      }));
      const snapshot = Object.freeze(stryMutAct_9fa48("59134") ? {} : (stryCov_9fa48("59134"), {
        ...createEligibilitySnapshot(stryMutAct_9fa48("59135") ? {} : (stryCov_9fa48("59135"), {
          nodeId,
          lifecycleState,
          publication,
          membershipPublication,
          priorityControlPlaneRecovery,
          capacity,
          nodeEvidence,
          observedAt,
          dimensions,
          reasons
        })),
        recentTransitions: this.recordReadinessTransition(stryMutAct_9fa48("59136") ? {} : (stryCov_9fa48("59136"), {
          nodeId,
          observedAt,
          publication,
          membershipPublication,
          nodeEvidence,
          dimensions,
          reasons,
          priorityControlPlaneRecovery
        }))
      }));
      this.storeReadinessSnapshot(nodeId, snapshot);
      this.maybeStartBackgroundSyncReadinessRefresh(stryMutAct_9fa48("59137") ? {} : (stryCov_9fa48("59137"), {
        nodeId,
        nodeRow,
        serviceRows,
        snapshot
      }), options);
      return snapshot;
    }
  }

  /**
   * Return one canonical control-plane participation decision for the
   * requested node and work kind.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async getControlPlaneParticipation(nodeId, options = {}) {
    if (stryMutAct_9fa48("59138")) {
      {}
    } else {
      stryCov_9fa48("59138");
      const participationKind = normalizeControlPlaneParticipationKind(stryMutAct_9fa48("59139") ? options.participationKind : (stryCov_9fa48("59139"), options?.participationKind));
      const decisionDimension = resolveParticipationDecisionDimension(participationKind, stryMutAct_9fa48("59140") ? options.decisionDimension : (stryCov_9fa48("59140"), options?.decisionDimension));
      const readiness = await this.getNodeReadiness(nodeId, stryMutAct_9fa48("59141") ? {} : (stryCov_9fa48("59141"), {
        ...options,
        decisionDimension
      }));
      return this.buildControlPlaneParticipation(stryMutAct_9fa48("59142") ? {} : (stryCov_9fa48("59142"), {
        nodeId,
        readiness,
        participationKind,
        decisionDimension,
        tableName: stryMutAct_9fa48("59145") ? options?.tableName && null : stryMutAct_9fa48("59144") ? false : stryMutAct_9fa48("59143") ? true : (stryCov_9fa48("59143", "59144", "59145"), (stryMutAct_9fa48("59146") ? options.tableName : (stryCov_9fa48("59146"), options?.tableName)) || null),
        partitionId: stryMutAct_9fa48("59149") ? options?.partitionId && null : stryMutAct_9fa48("59148") ? false : stryMutAct_9fa48("59147") ? true : (stryCov_9fa48("59147", "59148", "59149"), (stryMutAct_9fa48("59150") ? options.partitionId : (stryCov_9fa48("59150"), options?.partitionId)) || null)
      }));
    }
  }

  /**
   * Return one synchronous canonical control-plane participation decision.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Object}
   */
  getControlPlaneParticipationSync(nodeId, options = {}) {
    if (stryMutAct_9fa48("59151")) {
      {}
    } else {
      stryCov_9fa48("59151");
      const participationKind = normalizeControlPlaneParticipationKind(stryMutAct_9fa48("59152") ? options.participationKind : (stryCov_9fa48("59152"), options?.participationKind));
      const decisionDimension = resolveParticipationDecisionDimension(participationKind, stryMutAct_9fa48("59153") ? options.decisionDimension : (stryCov_9fa48("59153"), options?.decisionDimension));
      const readiness = this.getNodeReadinessSync(nodeId, stryMutAct_9fa48("59154") ? {} : (stryCov_9fa48("59154"), {
        ...options,
        decisionDimension
      }));
      return this.buildControlPlaneParticipation(stryMutAct_9fa48("59155") ? {} : (stryCov_9fa48("59155"), {
        nodeId,
        readiness,
        participationKind,
        decisionDimension,
        tableName: stryMutAct_9fa48("59158") ? options?.tableName && null : stryMutAct_9fa48("59157") ? false : stryMutAct_9fa48("59156") ? true : (stryCov_9fa48("59156", "59157", "59158"), (stryMutAct_9fa48("59159") ? options.tableName : (stryCov_9fa48("59159"), options?.tableName)) || null),
        partitionId: stryMutAct_9fa48("59162") ? options?.partitionId && null : stryMutAct_9fa48("59161") ? false : stryMutAct_9fa48("59160") ? true : (stryCov_9fa48("59160", "59161", "59162"), (stryMutAct_9fa48("59163") ? options.partitionId : (stryCov_9fa48("59163"), options?.partitionId)) || null)
      }));
    }
  }

  /**
   * Build one bounded participation decision from the canonical readiness
   * snapshot.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildControlPlaneParticipation(context) {
    if (stryMutAct_9fa48("59164")) {
      {}
    } else {
      stryCov_9fa48("59164");
      const snapshot = (stryMutAct_9fa48("59167") ? context?.readiness || typeof context.readiness === TYPEOF.OBJECT : stryMutAct_9fa48("59166") ? false : stryMutAct_9fa48("59165") ? true : (stryCov_9fa48("59165", "59166", "59167"), (stryMutAct_9fa48("59168") ? context.readiness : (stryCov_9fa48("59168"), context?.readiness)) && (stryMutAct_9fa48("59170") ? typeof context.readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("59169") ? true : (stryCov_9fa48("59169", "59170"), typeof context.readiness === TYPEOF.OBJECT)))) ? context.readiness : null;
      const decisionDimension = resolveParticipationDecisionDimension(normalizeControlPlaneParticipationKind(stryMutAct_9fa48("59171") ? context.participationKind : (stryCov_9fa48("59171"), context?.participationKind)), stryMutAct_9fa48("59172") ? context.decisionDimension : (stryCov_9fa48("59172"), context?.decisionDimension));
      const decision = (stryMutAct_9fa48("59175") ? snapshot?.dimensions || typeof snapshot.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("59174") ? false : stryMutAct_9fa48("59173") ? true : (stryCov_9fa48("59173", "59174", "59175"), (stryMutAct_9fa48("59176") ? snapshot.dimensions : (stryCov_9fa48("59176"), snapshot?.dimensions)) && (stryMutAct_9fa48("59178") ? typeof snapshot.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("59177") ? true : (stryCov_9fa48("59177", "59178"), typeof snapshot.dimensions === TYPEOF.OBJECT)))) ? evaluateEligibilityDecision(snapshot, decisionDimension) : Object.freeze(stryMutAct_9fa48("59179") ? {} : (stryCov_9fa48("59179"), {
        nodeId: stryMutAct_9fa48("59182") ? context?.nodeId && null : stryMutAct_9fa48("59181") ? false : stryMutAct_9fa48("59180") ? true : (stryCov_9fa48("59180", "59181", "59182"), (stryMutAct_9fa48("59183") ? context.nodeId : (stryCov_9fa48("59183"), context?.nodeId)) || null),
        decisionDimension,
        eligible: stryMutAct_9fa48("59184") ? true : (stryCov_9fa48("59184"), false),
        failedDimensions: Object.freeze(stryMutAct_9fa48("59185") ? [] : (stryCov_9fa48("59185"), [decisionDimension])),
        reasonCodes: Object.freeze(stryMutAct_9fa48("59186") ? ["Stryker was here"] : (stryCov_9fa48("59186"), []))
      }));
      const summary = compactEligibilitySnapshot(snapshot, decisionDimension);
      const cacheWatermark = this.buildStoredReadinessSnapshotWatermark(snapshot);
      const localQueryTransport = (stryMutAct_9fa48("59187") ? snapshot.nodeEvidence : (stryCov_9fa48("59187"), snapshot?.nodeEvidence)) ? Object.freeze(stryMutAct_9fa48("59188") ? {} : (stryCov_9fa48("59188"), {
        state: stryMutAct_9fa48("59191") ? snapshot.nodeEvidence.localQueryTransportState && null : stryMutAct_9fa48("59190") ? false : stryMutAct_9fa48("59189") ? true : (stryCov_9fa48("59189", "59190", "59191"), snapshot.nodeEvidence.localQueryTransportState || null),
        ready: (stryMutAct_9fa48("59194") ? typeof snapshot.nodeEvidence.localQueryTransportReady !== 'boolean' : stryMutAct_9fa48("59193") ? false : stryMutAct_9fa48("59192") ? true : (stryCov_9fa48("59192", "59193", "59194"), typeof snapshot.nodeEvidence.localQueryTransportReady === (stryMutAct_9fa48("59195") ? "" : (stryCov_9fa48("59195"), 'boolean')))) ? snapshot.nodeEvidence.localQueryTransportReady : null,
        reason: stryMutAct_9fa48("59198") ? snapshot.nodeEvidence.localQueryTransportReason && null : stryMutAct_9fa48("59197") ? false : stryMutAct_9fa48("59196") ? true : (stryCov_9fa48("59196", "59197", "59198"), snapshot.nodeEvidence.localQueryTransportReason || null),
        retryAfterMs: Number.isFinite(snapshot.nodeEvidence.localQueryTransportRetryAfterMs) ? snapshot.nodeEvidence.localQueryTransportRetryAfterMs : null
      })) : null;
      const transportState = (stryMutAct_9fa48("59199") ? snapshot.nodeEvidence : (stryCov_9fa48("59199"), snapshot?.nodeEvidence)) ? Object.freeze(stryMutAct_9fa48("59200") ? {} : (stryCov_9fa48("59200"), {
        connected: stryMutAct_9fa48("59203") ? snapshot.nodeEvidence.transportConnected !== true : stryMutAct_9fa48("59202") ? false : stryMutAct_9fa48("59201") ? true : (stryCov_9fa48("59201", "59202", "59203"), snapshot.nodeEvidence.transportConnected === (stryMutAct_9fa48("59204") ? false : (stryCov_9fa48("59204"), true))),
        rowState: stryMutAct_9fa48("59207") ? snapshot.nodeEvidence.rowConnectionState && null : stryMutAct_9fa48("59206") ? false : stryMutAct_9fa48("59205") ? true : (stryCov_9fa48("59205", "59206", "59207"), snapshot.nodeEvidence.rowConnectionState || null),
        routerState: stryMutAct_9fa48("59210") ? snapshot.nodeEvidence.routerConnectionState && null : stryMutAct_9fa48("59209") ? false : stryMutAct_9fa48("59208") ? true : (stryCov_9fa48("59208", "59209", "59210"), snapshot.nodeEvidence.routerConnectionState || null),
        localQueryTransportState: stryMutAct_9fa48("59213") ? snapshot.nodeEvidence.localQueryTransportState && null : stryMutAct_9fa48("59212") ? false : stryMutAct_9fa48("59211") ? true : (stryCov_9fa48("59211", "59212", "59213"), snapshot.nodeEvidence.localQueryTransportState || null),
        localQueryTransportReady: (stryMutAct_9fa48("59216") ? typeof snapshot.nodeEvidence.localQueryTransportReady !== 'boolean' : stryMutAct_9fa48("59215") ? false : stryMutAct_9fa48("59214") ? true : (stryCov_9fa48("59214", "59215", "59216"), typeof snapshot.nodeEvidence.localQueryTransportReady === (stryMutAct_9fa48("59217") ? "" : (stryCov_9fa48("59217"), 'boolean')))) ? snapshot.nodeEvidence.localQueryTransportReady : null,
        localQueryTransportReason: stryMutAct_9fa48("59220") ? snapshot.nodeEvidence.localQueryTransportReason && null : stryMutAct_9fa48("59219") ? false : stryMutAct_9fa48("59218") ? true : (stryCov_9fa48("59218", "59219", "59220"), snapshot.nodeEvidence.localQueryTransportReason || null),
        localQueryTransportRetryAfterMs: Number.isFinite(snapshot.nodeEvidence.localQueryTransportRetryAfterMs) ? snapshot.nodeEvidence.localQueryTransportRetryAfterMs : null
      })) : null;
      const authoritativeRepair = this.getLatestAuthoritativeReadinessRepair(stryMutAct_9fa48("59223") ? context?.nodeId && null : stryMutAct_9fa48("59222") ? false : stryMutAct_9fa48("59221") ? true : (stryCov_9fa48("59221", "59222", "59223"), (stryMutAct_9fa48("59224") ? context.nodeId : (stryCov_9fa48("59224"), context?.nodeId)) || null));
      const reasonCodes = Array.isArray(stryMutAct_9fa48("59225") ? decision.reasonCodes : (stryCov_9fa48("59225"), decision?.reasonCodes)) ? decision.reasonCodes : Object.freeze(stryMutAct_9fa48("59226") ? ["Stryker was here"] : (stryCov_9fa48("59226"), []));
      const localExecutionAllowed = shouldAllowLocalExecutionForParticipation(stryMutAct_9fa48("59227") ? {} : (stryCov_9fa48("59227"), {
        localNodeId: this.nodeId,
        targetNodeId: stryMutAct_9fa48("59230") ? context?.nodeId && null : stryMutAct_9fa48("59229") ? false : stryMutAct_9fa48("59228") ? true : (stryCov_9fa48("59228", "59229", "59230"), (stryMutAct_9fa48("59231") ? context.nodeId : (stryCov_9fa48("59231"), context?.nodeId)) || null),
        participationKind: normalizeControlPlaneParticipationKind(stryMutAct_9fa48("59232") ? context.participationKind : (stryCov_9fa48("59232"), context?.participationKind)),
        localQueryTransport
      }));
      const reasonCode = (stryMutAct_9fa48("59236") ? reasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("59235") ? reasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("59234") ? false : stryMutAct_9fa48("59233") ? true : (stryCov_9fa48("59233", "59234", "59235", "59236"), reasonCodes.length > NUM.ZERO)) ? reasonCodes[NUM.ZERO] : null;
      const deferRetry = stryMutAct_9fa48("59239") ? reasonCode === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY && Number.isFinite(localQueryTransport?.retryAfterMs) || localQueryTransport.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("59238") ? false : stryMutAct_9fa48("59237") ? true : (stryCov_9fa48("59237", "59238", "59239"), (stryMutAct_9fa48("59241") ? reasonCode === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY || Number.isFinite(localQueryTransport?.retryAfterMs) : stryMutAct_9fa48("59240") ? true : (stryCov_9fa48("59240", "59241"), (stryMutAct_9fa48("59243") ? reasonCode !== CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY : stryMutAct_9fa48("59242") ? true : (stryCov_9fa48("59242", "59243"), reasonCode === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY)) && Number.isFinite(stryMutAct_9fa48("59244") ? localQueryTransport.retryAfterMs : (stryCov_9fa48("59244"), localQueryTransport?.retryAfterMs)))) && (stryMutAct_9fa48("59247") ? localQueryTransport.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("59246") ? localQueryTransport.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("59245") ? true : (stryCov_9fa48("59245", "59246", "59247"), localQueryTransport.retryAfterMs > NUM.ZERO)));
      const participation = stryMutAct_9fa48("59248") ? {} : (stryCov_9fa48("59248"), {
        nodeId: stryMutAct_9fa48("59251") ? context?.nodeId && null : stryMutAct_9fa48("59250") ? false : stryMutAct_9fa48("59249") ? true : (stryCov_9fa48("59249", "59250", "59251"), (stryMutAct_9fa48("59252") ? context.nodeId : (stryCov_9fa48("59252"), context?.nodeId)) || null),
        tableName: (stryMutAct_9fa48("59255") ? typeof context?.tableName === TYPEOF.STRING || context.tableName.length > NUM.ZERO : stryMutAct_9fa48("59254") ? false : stryMutAct_9fa48("59253") ? true : (stryCov_9fa48("59253", "59254", "59255"), (stryMutAct_9fa48("59257") ? typeof context?.tableName !== TYPEOF.STRING : stryMutAct_9fa48("59256") ? true : (stryCov_9fa48("59256", "59257"), typeof (stryMutAct_9fa48("59258") ? context.tableName : (stryCov_9fa48("59258"), context?.tableName)) === TYPEOF.STRING)) && (stryMutAct_9fa48("59261") ? context.tableName.length <= NUM.ZERO : stryMutAct_9fa48("59260") ? context.tableName.length >= NUM.ZERO : stryMutAct_9fa48("59259") ? true : (stryCov_9fa48("59259", "59260", "59261"), context.tableName.length > NUM.ZERO)))) ? context.tableName : null,
        partitionId: (stryMutAct_9fa48("59264") ? typeof context?.partitionId === TYPEOF.STRING || context.partitionId.length > NUM.ZERO : stryMutAct_9fa48("59263") ? false : stryMutAct_9fa48("59262") ? true : (stryCov_9fa48("59262", "59263", "59264"), (stryMutAct_9fa48("59266") ? typeof context?.partitionId !== TYPEOF.STRING : stryMutAct_9fa48("59265") ? true : (stryCov_9fa48("59265", "59266"), typeof (stryMutAct_9fa48("59267") ? context.partitionId : (stryCov_9fa48("59267"), context?.partitionId)) === TYPEOF.STRING)) && (stryMutAct_9fa48("59270") ? context.partitionId.length <= NUM.ZERO : stryMutAct_9fa48("59269") ? context.partitionId.length >= NUM.ZERO : stryMutAct_9fa48("59268") ? true : (stryCov_9fa48("59268", "59269", "59270"), context.partitionId.length > NUM.ZERO)))) ? context.partitionId : null,
        participationKind: normalizeControlPlaneParticipationKind(stryMutAct_9fa48("59271") ? context.participationKind : (stryCov_9fa48("59271"), context?.participationKind)),
        decisionDimension,
        eligible: stryMutAct_9fa48("59274") ? decision?.eligible !== true : stryMutAct_9fa48("59273") ? false : stryMutAct_9fa48("59272") ? true : (stryCov_9fa48("59272", "59273", "59274"), (stryMutAct_9fa48("59275") ? decision.eligible : (stryCov_9fa48("59275"), decision?.eligible)) === (stryMutAct_9fa48("59276") ? false : (stryCov_9fa48("59276"), true))),
        decision: (stryMutAct_9fa48("59279") ? decision?.eligible !== true : stryMutAct_9fa48("59278") ? false : stryMutAct_9fa48("59277") ? true : (stryCov_9fa48("59277", "59278", "59279"), (stryMutAct_9fa48("59280") ? decision.eligible : (stryCov_9fa48("59280"), decision?.eligible)) === (stryMutAct_9fa48("59281") ? false : (stryCov_9fa48("59281"), true)))) ? CONTROL_PLANE_PARTICIPATION_DECISION.READY : deferRetry ? CONTROL_PLANE_PARTICIPATION_DECISION.DEFER : CONTROL_PLANE_PARTICIPATION_DECISION.BLOCKED,
        reasonCode,
        reasonCodes,
        retryAfterMs: (stryMutAct_9fa48("59284") ? Number.isFinite(localQueryTransport?.retryAfterMs) || localQueryTransport.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("59283") ? false : stryMutAct_9fa48("59282") ? true : (stryCov_9fa48("59282", "59283", "59284"), Number.isFinite(stryMutAct_9fa48("59285") ? localQueryTransport.retryAfterMs : (stryCov_9fa48("59285"), localQueryTransport?.retryAfterMs)) && (stryMutAct_9fa48("59288") ? localQueryTransport.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("59287") ? localQueryTransport.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("59286") ? true : (stryCov_9fa48("59286", "59287", "59288"), localQueryTransport.retryAfterMs > NUM.ZERO)))) ? localQueryTransport.retryAfterMs : null,
        deferRetry,
        localExecutionAllowed,
        errorCode: null,
        error: null,
        cacheWatermark,
        transportState,
        lifecyclePhase: (stryMutAct_9fa48("59291") ? typeof snapshot?.lifecycleState === TYPEOF.STRING || snapshot.lifecycleState.length > NUM.ZERO : stryMutAct_9fa48("59290") ? false : stryMutAct_9fa48("59289") ? true : (stryCov_9fa48("59289", "59290", "59291"), (stryMutAct_9fa48("59293") ? typeof snapshot?.lifecycleState !== TYPEOF.STRING : stryMutAct_9fa48("59292") ? true : (stryCov_9fa48("59292", "59293"), typeof (stryMutAct_9fa48("59294") ? snapshot.lifecycleState : (stryCov_9fa48("59294"), snapshot?.lifecycleState)) === TYPEOF.STRING)) && (stryMutAct_9fa48("59297") ? snapshot.lifecycleState.length <= NUM.ZERO : stryMutAct_9fa48("59296") ? snapshot.lifecycleState.length >= NUM.ZERO : stryMutAct_9fa48("59295") ? true : (stryCov_9fa48("59295", "59296", "59297"), snapshot.lifecycleState.length > NUM.ZERO)))) ? snapshot.lifecycleState : stryMutAct_9fa48("59300") ? summary?.lifecycleState && null : stryMutAct_9fa48("59299") ? false : stryMutAct_9fa48("59298") ? true : (stryCov_9fa48("59298", "59299", "59300"), (stryMutAct_9fa48("59301") ? summary.lifecycleState : (stryCov_9fa48("59301"), summary?.lifecycleState)) || null),
        authoritativeRepair,
        localQueryTransport,
        snapshot,
        failedDimensions: Array.isArray(stryMutAct_9fa48("59302") ? decision.failedDimensions : (stryCov_9fa48("59302"), decision?.failedDimensions)) ? decision.failedDimensions : Object.freeze(stryMutAct_9fa48("59303") ? ["Stryker was here"] : (stryCov_9fa48("59303"), [])),
        summary: summary ? Object.freeze(stryMutAct_9fa48("59304") ? {} : (stryCov_9fa48("59304"), {
          decisionDimension: stryMutAct_9fa48("59307") ? summary.decisionDimension && decisionDimension : stryMutAct_9fa48("59306") ? false : stryMutAct_9fa48("59305") ? true : (stryCov_9fa48("59305", "59306", "59307"), summary.decisionDimension || decisionDimension),
          observedAt: stryMutAct_9fa48("59310") ? summary.observedAt && null : stryMutAct_9fa48("59309") ? false : stryMutAct_9fa48("59308") ? true : (stryCov_9fa48("59308", "59309", "59310"), summary.observedAt || null),
          lifecycleState: stryMutAct_9fa48("59313") ? summary.lifecycleState && null : stryMutAct_9fa48("59312") ? false : stryMutAct_9fa48("59311") ? true : (stryCov_9fa48("59311", "59312", "59313"), summary.lifecycleState || null),
          reasonCodes: stryMutAct_9fa48("59316") ? summary.reasonCodes && Object.freeze([]) : stryMutAct_9fa48("59315") ? false : stryMutAct_9fa48("59314") ? true : (stryCov_9fa48("59314", "59315", "59316"), summary.reasonCodes || Object.freeze(stryMutAct_9fa48("59317") ? ["Stryker was here"] : (stryCov_9fa48("59317"), []))),
          failedDimensions: Array.isArray(stryMutAct_9fa48("59318") ? decision.failedDimensions : (stryCov_9fa48("59318"), decision?.failedDimensions)) ? decision.failedDimensions : Object.freeze(stryMutAct_9fa48("59319") ? ["Stryker was here"] : (stryCov_9fa48("59319"), []))
        })) : null
      });
      if (stryMutAct_9fa48("59322") ? participation.decision === CONTROL_PLANE_PARTICIPATION_DECISION.READY : stryMutAct_9fa48("59321") ? false : stryMutAct_9fa48("59320") ? true : (stryCov_9fa48("59320", "59321", "59322"), participation.decision !== CONTROL_PLANE_PARTICIPATION_DECISION.READY)) {
        if (stryMutAct_9fa48("59323")) {
          {}
        } else {
          stryCov_9fa48("59323");
          participation.errorCode = buildParticipationErrorCode(participation);
          participation.error = buildParticipationErrorMessage(participation);
        }
      }
      const frozenParticipation = Object.freeze(participation);
      this.recordParticipationDecision(frozenParticipation);
      return frozenParticipation;
    }
  }

  /**
   * Persist one bounded participation-decision record for diagnostics.
   * @param {Object|null} participation
   * @return {void}
   * @private
   */
  recordParticipationDecision(participation) {
    if (stryMutAct_9fa48("59324")) {
      {}
    } else {
      stryCov_9fa48("59324");
      if (stryMutAct_9fa48("59327") ? !participation && !this.participationDecisionLedger : stryMutAct_9fa48("59326") ? false : stryMutAct_9fa48("59325") ? true : (stryCov_9fa48("59325", "59326", "59327"), (stryMutAct_9fa48("59328") ? participation : (stryCov_9fa48("59328"), !participation)) || (stryMutAct_9fa48("59329") ? this.participationDecisionLedger : (stryCov_9fa48("59329"), !this.participationDecisionLedger)))) {
        if (stryMutAct_9fa48("59330")) {
          {}
        } else {
          stryCov_9fa48("59330");
          return;
        }
      }
      this.participationDecisionLedger.append(stryMutAct_9fa48("59331") ? {} : (stryCov_9fa48("59331"), {
        nodeId: stryMutAct_9fa48("59334") ? participation.nodeId && null : stryMutAct_9fa48("59333") ? false : stryMutAct_9fa48("59332") ? true : (stryCov_9fa48("59332", "59333", "59334"), participation.nodeId || null),
        tableName: stryMutAct_9fa48("59337") ? participation.tableName && null : stryMutAct_9fa48("59336") ? false : stryMutAct_9fa48("59335") ? true : (stryCov_9fa48("59335", "59336", "59337"), participation.tableName || null),
        partitionId: stryMutAct_9fa48("59340") ? participation.partitionId && null : stryMutAct_9fa48("59339") ? false : stryMutAct_9fa48("59338") ? true : (stryCov_9fa48("59338", "59339", "59340"), participation.partitionId || null),
        participationKind: stryMutAct_9fa48("59343") ? participation.participationKind && null : stryMutAct_9fa48("59342") ? false : stryMutAct_9fa48("59341") ? true : (stryCov_9fa48("59341", "59342", "59343"), participation.participationKind || null),
        decisionDimension: stryMutAct_9fa48("59346") ? participation.decisionDimension && null : stryMutAct_9fa48("59345") ? false : stryMutAct_9fa48("59344") ? true : (stryCov_9fa48("59344", "59345", "59346"), participation.decisionDimension || null),
        decision: stryMutAct_9fa48("59349") ? participation.decision && null : stryMutAct_9fa48("59348") ? false : stryMutAct_9fa48("59347") ? true : (stryCov_9fa48("59347", "59348", "59349"), participation.decision || null),
        eligible: stryMutAct_9fa48("59352") ? participation.eligible !== true : stryMutAct_9fa48("59351") ? false : stryMutAct_9fa48("59350") ? true : (stryCov_9fa48("59350", "59351", "59352"), participation.eligible === (stryMutAct_9fa48("59353") ? false : (stryCov_9fa48("59353"), true))),
        reasonCode: stryMutAct_9fa48("59356") ? participation.reasonCode && null : stryMutAct_9fa48("59355") ? false : stryMutAct_9fa48("59354") ? true : (stryCov_9fa48("59354", "59355", "59356"), participation.reasonCode || null),
        reasonCodes: Array.isArray(participation.reasonCodes) ? stryMutAct_9fa48("59357") ? [] : (stryCov_9fa48("59357"), [...participation.reasonCodes]) : stryMutAct_9fa48("59358") ? ["Stryker was here"] : (stryCov_9fa48("59358"), []),
        failedDimensions: Array.isArray(participation.failedDimensions) ? stryMutAct_9fa48("59359") ? [] : (stryCov_9fa48("59359"), [...participation.failedDimensions]) : stryMutAct_9fa48("59360") ? ["Stryker was here"] : (stryCov_9fa48("59360"), []),
        localExecutionAllowed: stryMutAct_9fa48("59363") ? participation.localExecutionAllowed !== true : stryMutAct_9fa48("59362") ? false : stryMutAct_9fa48("59361") ? true : (stryCov_9fa48("59361", "59362", "59363"), participation.localExecutionAllowed === (stryMutAct_9fa48("59364") ? false : (stryCov_9fa48("59364"), true))),
        cacheWatermark: (stryMutAct_9fa48("59367") ? participation.cacheWatermark || typeof participation.cacheWatermark === TYPEOF.OBJECT : stryMutAct_9fa48("59366") ? false : stryMutAct_9fa48("59365") ? true : (stryCov_9fa48("59365", "59366", "59367"), participation.cacheWatermark && (stryMutAct_9fa48("59369") ? typeof participation.cacheWatermark !== TYPEOF.OBJECT : stryMutAct_9fa48("59368") ? true : (stryCov_9fa48("59368", "59369"), typeof participation.cacheWatermark === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("59370") ? {} : (stryCov_9fa48("59370"), {
          ...participation.cacheWatermark
        }) : null,
        transportState: (stryMutAct_9fa48("59373") ? participation.transportState || typeof participation.transportState === TYPEOF.OBJECT : stryMutAct_9fa48("59372") ? false : stryMutAct_9fa48("59371") ? true : (stryCov_9fa48("59371", "59372", "59373"), participation.transportState && (stryMutAct_9fa48("59375") ? typeof participation.transportState !== TYPEOF.OBJECT : stryMutAct_9fa48("59374") ? true : (stryCov_9fa48("59374", "59375"), typeof participation.transportState === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("59376") ? {} : (stryCov_9fa48("59376"), {
          ...participation.transportState
        }) : null,
        authoritativeRepair: (stryMutAct_9fa48("59379") ? participation.authoritativeRepair || typeof participation.authoritativeRepair === TYPEOF.OBJECT : stryMutAct_9fa48("59378") ? false : stryMutAct_9fa48("59377") ? true : (stryCov_9fa48("59377", "59378", "59379"), participation.authoritativeRepair && (stryMutAct_9fa48("59381") ? typeof participation.authoritativeRepair !== TYPEOF.OBJECT : stryMutAct_9fa48("59380") ? true : (stryCov_9fa48("59380", "59381"), typeof participation.authoritativeRepair === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("59382") ? {} : (stryCov_9fa48("59382"), {
          ...participation.authoritativeRepair
        }) : null,
        lifecyclePhase: stryMutAct_9fa48("59385") ? participation.lifecyclePhase && null : stryMutAct_9fa48("59384") ? false : stryMutAct_9fa48("59383") ? true : (stryCov_9fa48("59383", "59384", "59385"), participation.lifecyclePhase || null),
        lifecycleState: stryMutAct_9fa48("59388") ? participation.summary?.lifecycleState && null : stryMutAct_9fa48("59387") ? false : stryMutAct_9fa48("59386") ? true : (stryCov_9fa48("59386", "59387", "59388"), (stryMutAct_9fa48("59389") ? participation.summary.lifecycleState : (stryCov_9fa48("59389"), participation.summary?.lifecycleState)) || null),
        observedAt: stryMutAct_9fa48("59392") ? participation.summary?.observedAt && null : stryMutAct_9fa48("59391") ? false : stryMutAct_9fa48("59390") ? true : (stryCov_9fa48("59390", "59391", "59392"), (stryMutAct_9fa48("59393") ? participation.summary.observedAt : (stryCov_9fa48("59393"), participation.summary?.observedAt)) || null)
      }));
    }
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getParticipationDecisionLedgerEntries(options = {}) {
    if (stryMutAct_9fa48("59394")) {
      {}
    } else {
      stryCov_9fa48("59394");
      return this.participationDecisionLedger ? this.participationDecisionLedger.getEntries(options) : Object.freeze(stryMutAct_9fa48("59395") ? ["Stryker was here"] : (stryCov_9fa48("59395"), []));
    }
  }

  /**
   * @param {Object} entry
   * @return {void}
   * @private
   */
  recordAuthoritativeReadinessRepair(entry = {}) {
    if (stryMutAct_9fa48("59396")) {
      {}
    } else {
      stryCov_9fa48("59396");
      this.authoritativeNodeEvidenceReconciler.recordRepair(entry);
    }
  }

  /**
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getLatestAuthoritativeReadinessRepair(nodeId) {
    if (stryMutAct_9fa48("59397")) {
      {}
    } else {
      stryCov_9fa48("59397");
      return this.authoritativeNodeEvidenceReconciler.getLatestRepair(nodeId);
    }
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getAuthoritativeReadinessRepairLedgerEntries(options = {}) {
    if (stryMutAct_9fa48("59398")) {
      {}
    } else {
      stryCov_9fa48("59398");
      return this.authoritativeNodeEvidenceReconciler.getLedgerEntries(options);
    }
  }

  /**
   * Reuse one previously-computed readiness snapshot when it is fresher than
   * the currently visible cache row. This bridges short read-cache lag after a
   * canonical owner-path refresh without reopening the sync call path to I/O.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @param {Object|null} publication
   * @param {Object|null} membershipPublication
   * @return {Object|null}
   * @private
   */
  getFresherStoredReadinessSnapshot(nodeId, nodeRow, publication, membershipPublication) {
    if (stryMutAct_9fa48("59399")) {
      {}
    } else {
      stryCov_9fa48("59399");
      const storedSnapshot = stryMutAct_9fa48("59402") ? this.lastReadinessSnapshotByNodeId.get(nodeId) && null : stryMutAct_9fa48("59401") ? false : stryMutAct_9fa48("59400") ? true : (stryCov_9fa48("59400", "59401", "59402"), this.lastReadinessSnapshotByNodeId.get(nodeId) || null);
      const capturedAtMs = stryMutAct_9fa48("59405") ? this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) && null : stryMutAct_9fa48("59404") ? false : stryMutAct_9fa48("59403") ? true : (stryCov_9fa48("59403", "59404", "59405"), this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null);
      if (stryMutAct_9fa48("59408") ? !storedSnapshot && !this.isStoredReadinessSnapshotFresh(storedSnapshot, capturedAtMs) : stryMutAct_9fa48("59407") ? false : stryMutAct_9fa48("59406") ? true : (stryCov_9fa48("59406", "59407", "59408"), (stryMutAct_9fa48("59409") ? storedSnapshot : (stryCov_9fa48("59409"), !storedSnapshot)) || (stryMutAct_9fa48("59410") ? this.isStoredReadinessSnapshotFresh(storedSnapshot, capturedAtMs) : (stryCov_9fa48("59410"), !this.isStoredReadinessSnapshotFresh(storedSnapshot, capturedAtMs))))) {
        if (stryMutAct_9fa48("59411")) {
          {}
        } else {
          stryCov_9fa48("59411");
          return null;
        }
      }
      const storedWatermark = this.buildStoredReadinessSnapshotWatermark(storedSnapshot);
      if (stryMutAct_9fa48("59414") ? false : stryMutAct_9fa48("59413") ? true : stryMutAct_9fa48("59412") ? storedWatermark : (stryCov_9fa48("59412", "59413", "59414"), !storedWatermark)) {
        if (stryMutAct_9fa48("59415")) {
          {}
        } else {
          stryCov_9fa48("59415");
          return null;
        }
      }
      if (stryMutAct_9fa48("59418") ? nodeRow || compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) <= NUM.ZERO : stryMutAct_9fa48("59417") ? false : stryMutAct_9fa48("59416") ? true : (stryCov_9fa48("59416", "59417", "59418"), nodeRow && (stryMutAct_9fa48("59421") ? compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) > NUM.ZERO : stryMutAct_9fa48("59420") ? compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) < NUM.ZERO : stryMutAct_9fa48("59419") ? true : (stryCov_9fa48("59419", "59420", "59421"), compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("59422")) {
          {}
        } else {
          stryCov_9fa48("59422");
          return null;
        }
      }
      return Object.freeze(stryMutAct_9fa48("59423") ? {} : (stryCov_9fa48("59423"), {
        ...storedSnapshot,
        publication: (stryMutAct_9fa48("59426") ? publication || typeof publication === TYPEOF.OBJECT : stryMutAct_9fa48("59425") ? false : stryMutAct_9fa48("59424") ? true : (stryCov_9fa48("59424", "59425", "59426"), publication && (stryMutAct_9fa48("59428") ? typeof publication !== TYPEOF.OBJECT : stryMutAct_9fa48("59427") ? true : (stryCov_9fa48("59427", "59428"), typeof publication === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("59429") ? {} : (stryCov_9fa48("59429"), {
          ...publication
        })) : null,
        membershipPublication: (stryMutAct_9fa48("59432") ? membershipPublication || typeof membershipPublication === TYPEOF.OBJECT : stryMutAct_9fa48("59431") ? false : stryMutAct_9fa48("59430") ? true : (stryCov_9fa48("59430", "59431", "59432"), membershipPublication && (stryMutAct_9fa48("59434") ? typeof membershipPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("59433") ? true : (stryCov_9fa48("59433", "59434"), typeof membershipPublication === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("59435") ? {} : (stryCov_9fa48("59435"), {
          ...membershipPublication
        })) : null,
        recentTransitions: this.getReadinessTransitionHistory(nodeId)
      }));
    }
  }

  /**
   * Return true when one stored readiness snapshot is still safe to reuse for
   * hot-path sync consumers.
   * @param {Object|null} snapshot
   * @param {number|null} capturedAtMs
   * @return {boolean}
   * @private
   */
  isStoredReadinessSnapshotFresh(snapshot, capturedAtMs) {
    if (stryMutAct_9fa48("59436")) {
      {}
    } else {
      stryCov_9fa48("59436");
      if (stryMutAct_9fa48("59439") ? !snapshot && !Number.isFinite(capturedAtMs) : stryMutAct_9fa48("59438") ? false : stryMutAct_9fa48("59437") ? true : (stryCov_9fa48("59437", "59438", "59439"), (stryMutAct_9fa48("59440") ? snapshot : (stryCov_9fa48("59440"), !snapshot)) || (stryMutAct_9fa48("59441") ? Number.isFinite(capturedAtMs) : (stryCov_9fa48("59441"), !Number.isFinite(capturedAtMs))))) {
        if (stryMutAct_9fa48("59442")) {
          {}
        } else {
          stryCov_9fa48("59442");
          return stryMutAct_9fa48("59443") ? true : (stryCov_9fa48("59443"), false);
        }
      }
      const now = this.now();
      if (stryMutAct_9fa48("59447") ? now - capturedAtMs <= this.clusterMemberStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("59446") ? now - capturedAtMs >= this.clusterMemberStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("59445") ? false : stryMutAct_9fa48("59444") ? true : (stryCov_9fa48("59444", "59445", "59446", "59447"), (stryMutAct_9fa48("59448") ? now + capturedAtMs : (stryCov_9fa48("59448"), now - capturedAtMs)) > this.clusterMemberStaleHeartbeatMaxAgeMs)) {
        if (stryMutAct_9fa48("59449")) {
          {}
        } else {
          stryCov_9fa48("59449");
          return stryMutAct_9fa48("59450") ? true : (stryCov_9fa48("59450"), false);
        }
      }
      const readyLeaseExpiresAt = Number(stryMutAct_9fa48("59452") ? snapshot.nodeEvidence?.readyLeaseExpiresAt : stryMutAct_9fa48("59451") ? snapshot?.nodeEvidence.readyLeaseExpiresAt : (stryCov_9fa48("59451", "59452"), snapshot?.nodeEvidence?.readyLeaseExpiresAt));
      if (stryMutAct_9fa48("59455") ? Number.isFinite(readyLeaseExpiresAt) || readyLeaseExpiresAt <= now : stryMutAct_9fa48("59454") ? false : stryMutAct_9fa48("59453") ? true : (stryCov_9fa48("59453", "59454", "59455"), Number.isFinite(readyLeaseExpiresAt) && (stryMutAct_9fa48("59458") ? readyLeaseExpiresAt > now : stryMutAct_9fa48("59457") ? readyLeaseExpiresAt < now : stryMutAct_9fa48("59456") ? true : (stryCov_9fa48("59456", "59457", "59458"), readyLeaseExpiresAt <= now)))) {
        if (stryMutAct_9fa48("59459")) {
          {}
        } else {
          stryCov_9fa48("59459");
          return stryMutAct_9fa48("59460") ? true : (stryCov_9fa48("59460"), false);
        }
      }
      return stryMutAct_9fa48("59461") ? false : (stryCov_9fa48("59461"), true);
    }
  }

  /**
   * Build a comparable node watermark from one stored readiness snapshot.
   * @param {Object|null} snapshot
   * @return {Object|null}
   * @private
   */
  buildStoredReadinessSnapshotWatermark(snapshot) {
    if (stryMutAct_9fa48("59462")) {
      {}
    } else {
      stryCov_9fa48("59462");
      const nodeEvidence = stryMutAct_9fa48("59463") ? snapshot.nodeEvidence : (stryCov_9fa48("59463"), snapshot?.nodeEvidence);
      if (stryMutAct_9fa48("59466") ? !nodeEvidence && typeof nodeEvidence !== TYPEOF.OBJECT : stryMutAct_9fa48("59465") ? false : stryMutAct_9fa48("59464") ? true : (stryCov_9fa48("59464", "59465", "59466"), (stryMutAct_9fa48("59467") ? nodeEvidence : (stryCov_9fa48("59467"), !nodeEvidence)) || (stryMutAct_9fa48("59469") ? typeof nodeEvidence === TYPEOF.OBJECT : stryMutAct_9fa48("59468") ? false : (stryCov_9fa48("59468", "59469"), typeof nodeEvidence !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("59470")) {
          {}
        } else {
          stryCov_9fa48("59470");
          return null;
        }
      }
      const watermark = {};
      const lastHeartbeat = Number(nodeEvidence.lastHeartbeat);
      if (stryMutAct_9fa48("59472") ? false : stryMutAct_9fa48("59471") ? true : (stryCov_9fa48("59471", "59472"), Number.isFinite(lastHeartbeat))) {
        if (stryMutAct_9fa48("59473")) {
          {}
        } else {
          stryCov_9fa48("59473");
          watermark.lastHeartbeat = lastHeartbeat;
        }
      }
      const readyLeaseExpiresAt = Number(nodeEvidence.readyLeaseExpiresAt);
      if (stryMutAct_9fa48("59475") ? false : stryMutAct_9fa48("59474") ? true : (stryCov_9fa48("59474", "59475"), Number.isFinite(readyLeaseExpiresAt))) {
        if (stryMutAct_9fa48("59476")) {
          {}
        } else {
          stryCov_9fa48("59476");
          watermark.readyLeaseExpiresAt = readyLeaseExpiresAt;
        }
      }
      if (stryMutAct_9fa48("59479") ? typeof nodeEvidence.rowConnectionState === TYPEOF.STRING || nodeEvidence.rowConnectionState.length > NUM.ZERO : stryMutAct_9fa48("59478") ? false : stryMutAct_9fa48("59477") ? true : (stryCov_9fa48("59477", "59478", "59479"), (stryMutAct_9fa48("59481") ? typeof nodeEvidence.rowConnectionState !== TYPEOF.STRING : stryMutAct_9fa48("59480") ? true : (stryCov_9fa48("59480", "59481"), typeof nodeEvidence.rowConnectionState === TYPEOF.STRING)) && (stryMutAct_9fa48("59484") ? nodeEvidence.rowConnectionState.length <= NUM.ZERO : stryMutAct_9fa48("59483") ? nodeEvidence.rowConnectionState.length >= NUM.ZERO : stryMutAct_9fa48("59482") ? true : (stryCov_9fa48("59482", "59483", "59484"), nodeEvidence.rowConnectionState.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("59485")) {
          {}
        } else {
          stryCov_9fa48("59485");
          watermark.connectionState = nodeEvidence.rowConnectionState;
        }
      }
      return (stryMutAct_9fa48("59489") ? Object.keys(watermark).length <= NUM.ZERO : stryMutAct_9fa48("59488") ? Object.keys(watermark).length >= NUM.ZERO : stryMutAct_9fa48("59487") ? false : stryMutAct_9fa48("59486") ? true : (stryCov_9fa48("59486", "59487", "59488", "59489"), Object.keys(watermark).length > NUM.ZERO)) ? Object.freeze(watermark) : null;
    }
  }

  /**
   * Return one recent readiness snapshot when available.
   * @param {string} nodeId
   * @param {number} maxCachedAgeMs
   * @return {Object|null}
   * @private
   */
  getCachedReadinessSnapshot(nodeId, maxCachedAgeMs, options = {}) {
    if (stryMutAct_9fa48("59490")) {
      {}
    } else {
      stryCov_9fa48("59490");
      if (stryMutAct_9fa48("59493") ? !nodeId && maxCachedAgeMs <= NUM.ZERO : stryMutAct_9fa48("59492") ? false : stryMutAct_9fa48("59491") ? true : (stryCov_9fa48("59491", "59492", "59493"), (stryMutAct_9fa48("59494") ? nodeId : (stryCov_9fa48("59494"), !nodeId)) || (stryMutAct_9fa48("59497") ? maxCachedAgeMs > NUM.ZERO : stryMutAct_9fa48("59496") ? maxCachedAgeMs < NUM.ZERO : stryMutAct_9fa48("59495") ? false : (stryCov_9fa48("59495", "59496", "59497"), maxCachedAgeMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("59498")) {
          {}
        } else {
          stryCov_9fa48("59498");
          return null;
        }
      }
      const snapshot = stryMutAct_9fa48("59501") ? this.lastReadinessSnapshotByNodeId.get(nodeId) && null : stryMutAct_9fa48("59500") ? false : stryMutAct_9fa48("59499") ? true : (stryCov_9fa48("59499", "59500", "59501"), this.lastReadinessSnapshotByNodeId.get(nodeId) || null);
      const capturedAtMs = stryMutAct_9fa48("59504") ? this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) && null : stryMutAct_9fa48("59503") ? false : stryMutAct_9fa48("59502") ? true : (stryCov_9fa48("59502", "59503", "59504"), this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null);
      if (stryMutAct_9fa48("59507") ? !snapshot && !Number.isFinite(capturedAtMs) : stryMutAct_9fa48("59506") ? false : stryMutAct_9fa48("59505") ? true : (stryCov_9fa48("59505", "59506", "59507"), (stryMutAct_9fa48("59508") ? snapshot : (stryCov_9fa48("59508"), !snapshot)) || (stryMutAct_9fa48("59509") ? Number.isFinite(capturedAtMs) : (stryCov_9fa48("59509"), !Number.isFinite(capturedAtMs))))) {
        if (stryMutAct_9fa48("59510")) {
          {}
        } else {
          stryCov_9fa48("59510");
          return null;
        }
      }
      if (stryMutAct_9fa48("59514") ? this.now() - capturedAtMs <= maxCachedAgeMs : stryMutAct_9fa48("59513") ? this.now() - capturedAtMs >= maxCachedAgeMs : stryMutAct_9fa48("59512") ? false : stryMutAct_9fa48("59511") ? true : (stryCov_9fa48("59511", "59512", "59513", "59514"), (stryMutAct_9fa48("59515") ? this.now() + capturedAtMs : (stryCov_9fa48("59515"), this.now() - capturedAtMs)) > maxCachedAgeMs)) {
        if (stryMutAct_9fa48("59516")) {
          {}
        } else {
          stryCov_9fa48("59516");
          return null;
        }
      }
      if (stryMutAct_9fa48("59519") ? this.isReadinessSnapshotInvalidated(nodeId, capturedAtMs) || options.allowStaleOnCacheChange !== true : stryMutAct_9fa48("59518") ? false : stryMutAct_9fa48("59517") ? true : (stryCov_9fa48("59517", "59518", "59519"), this.isReadinessSnapshotInvalidated(nodeId, capturedAtMs) && (stryMutAct_9fa48("59521") ? options.allowStaleOnCacheChange === true : stryMutAct_9fa48("59520") ? true : (stryCov_9fa48("59520", "59521"), options.allowStaleOnCacheChange !== (stryMutAct_9fa48("59522") ? false : (stryCov_9fa48("59522"), true)))))) {
        if (stryMutAct_9fa48("59523")) {
          {}
        } else {
          stryCov_9fa48("59523");
          return null;
        }
      }
      return snapshot;
    }
  }

  /**
   * Return true when callers should bypass cached readiness and refresh
   * synchronously before making a gating decision.
   * @param {Object|null} snapshot
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  shouldBypassCachedSnapshot(snapshot, options = {}) {
    if (stryMutAct_9fa48("59524")) {
      {}
    } else {
      stryCov_9fa48("59524");
      if (stryMutAct_9fa48("59527") ? options.requireFreshOnIneligible === true : stryMutAct_9fa48("59526") ? false : stryMutAct_9fa48("59525") ? true : (stryCov_9fa48("59525", "59526", "59527"), options.requireFreshOnIneligible !== (stryMutAct_9fa48("59528") ? false : (stryCov_9fa48("59528"), true)))) {
        if (stryMutAct_9fa48("59529")) {
          {}
        } else {
          stryCov_9fa48("59529");
          return stryMutAct_9fa48("59530") ? true : (stryCov_9fa48("59530"), false);
        }
      }
      const decisionDimension = this.resolveReadinessDecisionDimension(options);
      const dimensions = stryMutAct_9fa48("59531") ? snapshot.dimensions : (stryCov_9fa48("59531"), snapshot?.dimensions);
      if (stryMutAct_9fa48("59534") ? !dimensions && typeof dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("59533") ? false : stryMutAct_9fa48("59532") ? true : (stryCov_9fa48("59532", "59533", "59534"), (stryMutAct_9fa48("59535") ? dimensions : (stryCov_9fa48("59535"), !dimensions)) || (stryMutAct_9fa48("59537") ? typeof dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("59536") ? false : (stryCov_9fa48("59536", "59537"), typeof dimensions !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("59538")) {
          {}
        } else {
          stryCov_9fa48("59538");
          return stryMutAct_9fa48("59539") ? false : (stryCov_9fa48("59539"), true);
        }
      }
      return stryMutAct_9fa48("59542") ? dimensions[decisionDimension] === true : stryMutAct_9fa48("59541") ? false : stryMutAct_9fa48("59540") ? true : (stryCov_9fa48("59540", "59541", "59542"), dimensions[decisionDimension] !== (stryMutAct_9fa48("59543") ? false : (stryCov_9fa48("59543"), true)));
    }
  }

  /**
   * Return true when callers should reuse a recent cached ineligible snapshot
   * immediately and refresh the canonical readiness owner in the background.
   * @param {Object|null} snapshot
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  shouldPreferBackgroundRefreshOnIneligible(snapshot, options = {}) {
    if (stryMutAct_9fa48("59544")) {
      {}
    } else {
      stryCov_9fa48("59544");
      if (stryMutAct_9fa48("59547") ? options.allowAuthoritativeRefresh !== true && options.preferBackgroundRefreshOnIneligible !== true : stryMutAct_9fa48("59546") ? false : stryMutAct_9fa48("59545") ? true : (stryCov_9fa48("59545", "59546", "59547"), (stryMutAct_9fa48("59549") ? options.allowAuthoritativeRefresh === true : stryMutAct_9fa48("59548") ? false : (stryCov_9fa48("59548", "59549"), options.allowAuthoritativeRefresh !== (stryMutAct_9fa48("59550") ? false : (stryCov_9fa48("59550"), true)))) || (stryMutAct_9fa48("59552") ? options.preferBackgroundRefreshOnIneligible === true : stryMutAct_9fa48("59551") ? false : (stryCov_9fa48("59551", "59552"), options.preferBackgroundRefreshOnIneligible !== (stryMutAct_9fa48("59553") ? false : (stryCov_9fa48("59553"), true)))))) {
        if (stryMutAct_9fa48("59554")) {
          {}
        } else {
          stryCov_9fa48("59554");
          return stryMutAct_9fa48("59555") ? true : (stryCov_9fa48("59555"), false);
        }
      }
      const dimensions = stryMutAct_9fa48("59556") ? snapshot.dimensions : (stryCov_9fa48("59556"), snapshot?.dimensions);
      if (stryMutAct_9fa48("59559") ? !dimensions && typeof dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("59558") ? false : stryMutAct_9fa48("59557") ? true : (stryCov_9fa48("59557", "59558", "59559"), (stryMutAct_9fa48("59560") ? dimensions : (stryCov_9fa48("59560"), !dimensions)) || (stryMutAct_9fa48("59562") ? typeof dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("59561") ? false : (stryCov_9fa48("59561", "59562"), typeof dimensions !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("59563")) {
          {}
        } else {
          stryCov_9fa48("59563");
          return stryMutAct_9fa48("59564") ? true : (stryCov_9fa48("59564"), false);
        }
      }
      const decisionDimension = this.resolveReadinessDecisionDimension(options);
      return stryMutAct_9fa48("59567") ? dimensions[decisionDimension] === true : stryMutAct_9fa48("59566") ? false : stryMutAct_9fa48("59565") ? true : (stryCov_9fa48("59565", "59566", "59567"), dimensions[decisionDimension] !== (stryMutAct_9fa48("59568") ? false : (stryCov_9fa48("59568"), true)));
    }
  }

  /**
   * Resolve the caller's gating dimension with a stable serve default.
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  resolveReadinessDecisionDimension(options = {}) {
    if (stryMutAct_9fa48("59569")) {
      {}
    } else {
      stryCov_9fa48("59569");
      return (stryMutAct_9fa48("59572") ? typeof options.decisionDimension === TYPEOF.STRING || options.decisionDimension.length > NUM.ZERO : stryMutAct_9fa48("59571") ? false : stryMutAct_9fa48("59570") ? true : (stryCov_9fa48("59570", "59571", "59572"), (stryMutAct_9fa48("59574") ? typeof options.decisionDimension !== TYPEOF.STRING : stryMutAct_9fa48("59573") ? true : (stryCov_9fa48("59573", "59574"), typeof options.decisionDimension === TYPEOF.STRING)) && (stryMutAct_9fa48("59577") ? options.decisionDimension.length <= NUM.ZERO : stryMutAct_9fa48("59576") ? options.decisionDimension.length >= NUM.ZERO : stryMutAct_9fa48("59575") ? true : (stryCov_9fa48("59575", "59576", "59577"), options.decisionDimension.length > NUM.ZERO)))) ? options.decisionDimension : CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    }
  }

  /**
   * Persist one recent readiness snapshot for hot-path reuse.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @private
   */
  storeReadinessSnapshot(nodeId, snapshot) {
    if (stryMutAct_9fa48("59578")) {
      {}
    } else {
      stryCov_9fa48("59578");
      if (stryMutAct_9fa48("59581") ? !nodeId && !snapshot : stryMutAct_9fa48("59580") ? false : stryMutAct_9fa48("59579") ? true : (stryCov_9fa48("59579", "59580", "59581"), (stryMutAct_9fa48("59582") ? nodeId : (stryCov_9fa48("59582"), !nodeId)) || (stryMutAct_9fa48("59583") ? snapshot : (stryCov_9fa48("59583"), !snapshot)))) {
        if (stryMutAct_9fa48("59584")) {
          {}
        } else {
          stryCov_9fa48("59584");
          return;
        }
      }
      const capturedAtMs = this.now();
      this.lastReadinessSnapshotByNodeId.set(nodeId, snapshot);
      this.lastReadinessSnapshotAtMsByNodeId.set(nodeId, capturedAtMs);
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.delete(nodeId);
      this.recordRecoveryEpochObservation(nodeId, snapshot, capturedAtMs);
    }
  }

  /**
   * Track restart/recovery epochs as bounded per-node timelines keyed by the
   * canonical readiness owner, so harness diagnostics can inspect progress
   * directly instead of inferring it from raw logs.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @param {number} observedAtMs
   * @return {void}
   * @private
   */
  recordRecoveryEpochObservation(nodeId, snapshot, observedAtMs) {
    if (stryMutAct_9fa48("59585")) {
      {}
    } else {
      stryCov_9fa48("59585");
      const summary = this.buildRecoveryEpochSummary(nodeId, snapshot, observedAtMs);
      const recoveryActive = stryMutAct_9fa48("59588") ? summary.recoveryActive !== true : stryMutAct_9fa48("59587") ? false : stryMutAct_9fa48("59586") ? true : (stryCov_9fa48("59586", "59587", "59588"), summary.recoveryActive === (stryMutAct_9fa48("59589") ? false : (stryCov_9fa48("59589"), true)));
      const currentEpoch = stryMutAct_9fa48("59592") ? this.currentRecoveryEpochByNodeId.get(nodeId) && null : stryMutAct_9fa48("59591") ? false : stryMutAct_9fa48("59590") ? true : (stryCov_9fa48("59590", "59591", "59592"), this.currentRecoveryEpochByNodeId.get(nodeId) || null);
      if (stryMutAct_9fa48("59595") ? !currentEpoch || !recoveryActive : stryMutAct_9fa48("59594") ? false : stryMutAct_9fa48("59593") ? true : (stryCov_9fa48("59593", "59594", "59595"), (stryMutAct_9fa48("59596") ? currentEpoch : (stryCov_9fa48("59596"), !currentEpoch)) && (stryMutAct_9fa48("59597") ? recoveryActive : (stryCov_9fa48("59597"), !recoveryActive)))) {
        if (stryMutAct_9fa48("59598")) {
          {}
        } else {
          stryCov_9fa48("59598");
          return;
        }
      }
      if (stryMutAct_9fa48("59601") ? !currentEpoch || recoveryActive : stryMutAct_9fa48("59600") ? false : stryMutAct_9fa48("59599") ? true : (stryCov_9fa48("59599", "59600", "59601"), (stryMutAct_9fa48("59602") ? currentEpoch : (stryCov_9fa48("59602"), !currentEpoch)) && recoveryActive)) {
        if (stryMutAct_9fa48("59603")) {
          {}
        } else {
          stryCov_9fa48("59603");
          const history = stryMutAct_9fa48("59606") ? this.recoveryEpochHistoryByNodeId.get(nodeId) && [] : stryMutAct_9fa48("59605") ? false : stryMutAct_9fa48("59604") ? true : (stryCov_9fa48("59604", "59605", "59606"), this.recoveryEpochHistoryByNodeId.get(nodeId) || (stryMutAct_9fa48("59607") ? ["Stryker was here"] : (stryCov_9fa48("59607"), [])));
          const epoch = stryMutAct_9fa48("59608") ? {} : (stryCov_9fa48("59608"), {
            epochId: stryMutAct_9fa48("59609") ? `` : (stryCov_9fa48("59609"), `${nodeId}:${stryMutAct_9fa48("59610") ? history.length + this.currentRecoveryEpochByNodeId.size - 1 : (stryCov_9fa48("59610"), (stryMutAct_9fa48("59611") ? history.length - this.currentRecoveryEpochByNodeId.size : (stryCov_9fa48("59611"), history.length + this.currentRecoveryEpochByNodeId.size)) + 1)}`),
            nodeId,
            startedAt: summary.observedAt,
            startedAtMs: observedAtMs,
            open: stryMutAct_9fa48("59612") ? false : (stryCov_9fa48("59612"), true),
            events: stryMutAct_9fa48("59613") ? [] : (stryCov_9fa48("59613"), [summary])
          });
          this.currentRecoveryEpochByNodeId.set(nodeId, epoch);
          return;
        }
      }
      if (stryMutAct_9fa48("59616") ? false : stryMutAct_9fa48("59615") ? true : stryMutAct_9fa48("59614") ? currentEpoch : (stryCov_9fa48("59614", "59615", "59616"), !currentEpoch)) {
        if (stryMutAct_9fa48("59617")) {
          {}
        } else {
          stryCov_9fa48("59617");
          return;
        }
      }
      const lastEvent = stryMutAct_9fa48("59620") ? currentEpoch.events[currentEpoch.events.length - 1] && null : stryMutAct_9fa48("59619") ? false : stryMutAct_9fa48("59618") ? true : (stryCov_9fa48("59618", "59619", "59620"), currentEpoch.events[stryMutAct_9fa48("59621") ? currentEpoch.events.length + 1 : (stryCov_9fa48("59621"), currentEpoch.events.length - 1)] || null);
      if (stryMutAct_9fa48("59624") ? !lastEvent && JSON.stringify(lastEvent) !== JSON.stringify(summary) : stryMutAct_9fa48("59623") ? false : stryMutAct_9fa48("59622") ? true : (stryCov_9fa48("59622", "59623", "59624"), (stryMutAct_9fa48("59625") ? lastEvent : (stryCov_9fa48("59625"), !lastEvent)) || (stryMutAct_9fa48("59627") ? JSON.stringify(lastEvent) === JSON.stringify(summary) : stryMutAct_9fa48("59626") ? false : (stryCov_9fa48("59626", "59627"), JSON.stringify(lastEvent) !== JSON.stringify(summary))))) {
        if (stryMutAct_9fa48("59628")) {
          {}
        } else {
          stryCov_9fa48("59628");
          currentEpoch.events.push(summary);
          if (stryMutAct_9fa48("59632") ? currentEpoch.events.length <= this.recoveryEpochEventLimit : stryMutAct_9fa48("59631") ? currentEpoch.events.length >= this.recoveryEpochEventLimit : stryMutAct_9fa48("59630") ? false : stryMutAct_9fa48("59629") ? true : (stryCov_9fa48("59629", "59630", "59631", "59632"), currentEpoch.events.length > this.recoveryEpochEventLimit)) {
            if (stryMutAct_9fa48("59633")) {
              {}
            } else {
              stryCov_9fa48("59633");
              currentEpoch.events.splice(0, stryMutAct_9fa48("59634") ? currentEpoch.events.length + this.recoveryEpochEventLimit : (stryCov_9fa48("59634"), currentEpoch.events.length - this.recoveryEpochEventLimit));
            }
          }
        }
      }
      if (stryMutAct_9fa48("59637") ? false : stryMutAct_9fa48("59636") ? true : stryMutAct_9fa48("59635") ? recoveryActive : (stryCov_9fa48("59635", "59636", "59637"), !recoveryActive)) {
        if (stryMutAct_9fa48("59638")) {
          {}
        } else {
          stryCov_9fa48("59638");
          currentEpoch.open = stryMutAct_9fa48("59639") ? true : (stryCov_9fa48("59639"), false);
          currentEpoch.endedAt = summary.observedAt;
          currentEpoch.endedAtMs = observedAtMs;
          this.currentRecoveryEpochByNodeId.delete(nodeId);
          const history = stryMutAct_9fa48("59642") ? this.recoveryEpochHistoryByNodeId.get(nodeId) && [] : stryMutAct_9fa48("59641") ? false : stryMutAct_9fa48("59640") ? true : (stryCov_9fa48("59640", "59641", "59642"), this.recoveryEpochHistoryByNodeId.get(nodeId) || (stryMutAct_9fa48("59643") ? ["Stryker was here"] : (stryCov_9fa48("59643"), [])));
          history.push(Object.freeze(stryMutAct_9fa48("59644") ? {} : (stryCov_9fa48("59644"), {
            ...currentEpoch,
            events: Object.freeze(currentEpoch.events.map(stryMutAct_9fa48("59645") ? () => undefined : (stryCov_9fa48("59645"), event => Object.freeze(stryMutAct_9fa48("59646") ? {} : (stryCov_9fa48("59646"), {
              ...event
            })))))
          })));
          while (stryMutAct_9fa48("59649") ? history.length <= this.recoveryEpochHistoryLimit : stryMutAct_9fa48("59648") ? history.length >= this.recoveryEpochHistoryLimit : stryMutAct_9fa48("59647") ? false : (stryCov_9fa48("59647", "59648", "59649"), history.length > this.recoveryEpochHistoryLimit)) {
            if (stryMutAct_9fa48("59650")) {
              {}
            } else {
              stryCov_9fa48("59650");
              history.shift();
            }
          }
          this.recoveryEpochHistoryByNodeId.set(nodeId, history);
        }
      }
    }
  }

  /**
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @param {number} observedAtMs
   * @return {Object}
   * @private
   */
  buildRecoveryEpochSummary(nodeId, snapshot, observedAtMs) {
    if (stryMutAct_9fa48("59651")) {
      {}
    } else {
      stryCov_9fa48("59651");
      const dimensions = (stryMutAct_9fa48("59654") ? snapshot?.dimensions || typeof snapshot.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("59653") ? false : stryMutAct_9fa48("59652") ? true : (stryCov_9fa48("59652", "59653", "59654"), (stryMutAct_9fa48("59655") ? snapshot.dimensions : (stryCov_9fa48("59655"), snapshot?.dimensions)) && (stryMutAct_9fa48("59657") ? typeof snapshot.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("59656") ? true : (stryCov_9fa48("59656", "59657"), typeof snapshot.dimensions === TYPEOF.OBJECT)))) ? snapshot.dimensions : {};
      const reasonCodes = Array.isArray(stryMutAct_9fa48("59658") ? snapshot.reasons : (stryCov_9fa48("59658"), snapshot?.reasons)) ? stryMutAct_9fa48("59659") ? [] : (stryCov_9fa48("59659"), [...new Set(stryMutAct_9fa48("59660") ? snapshot.reasons.map(reason => String(reason?.code || '')) : (stryCov_9fa48("59660"), snapshot.reasons.map(stryMutAct_9fa48("59661") ? () => undefined : (stryCov_9fa48("59661"), reason => String(stryMutAct_9fa48("59664") ? reason?.code && '' : stryMutAct_9fa48("59663") ? false : stryMutAct_9fa48("59662") ? true : (stryCov_9fa48("59662", "59663", "59664"), (stryMutAct_9fa48("59665") ? reason.code : (stryCov_9fa48("59665"), reason?.code)) || (stryMutAct_9fa48("59666") ? "Stryker was here!" : (stryCov_9fa48("59666"), '')))))).filter(Boolean)))]) : stryMutAct_9fa48("59667") ? ["Stryker was here"] : (stryCov_9fa48("59667"), []);
      return Object.freeze(stryMutAct_9fa48("59668") ? {} : (stryCov_9fa48("59668"), {
        nodeId,
        observedAt: stryMutAct_9fa48("59671") ? snapshot?.observedAt && normalizeIsoTimestamp(observedAtMs) : stryMutAct_9fa48("59670") ? false : stryMutAct_9fa48("59669") ? true : (stryCov_9fa48("59669", "59670", "59671"), (stryMutAct_9fa48("59672") ? snapshot.observedAt : (stryCov_9fa48("59672"), snapshot?.observedAt)) || normalizeIsoTimestamp(observedAtMs)),
        observedAtMs,
        lifecycleState: stryMutAct_9fa48("59675") ? snapshot?.lifecycleState && null : stryMutAct_9fa48("59674") ? false : stryMutAct_9fa48("59673") ? true : (stryCov_9fa48("59673", "59674", "59675"), (stryMutAct_9fa48("59676") ? snapshot.lifecycleState : (stryCov_9fa48("59676"), snapshot?.lifecycleState)) || null),
        processAlive: stryMutAct_9fa48("59679") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true : stryMutAct_9fa48("59678") ? false : stryMutAct_9fa48("59677") ? true : (stryCov_9fa48("59677", "59678", "59679"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === (stryMutAct_9fa48("59680") ? false : (stryCov_9fa48("59680"), true))),
        clusterMemberHealthy: stryMutAct_9fa48("59683") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] !== true : stryMutAct_9fa48("59682") ? false : stryMutAct_9fa48("59681") ? true : (stryCov_9fa48("59681", "59682", "59683"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === (stryMutAct_9fa48("59684") ? false : (stryCov_9fa48("59684"), true))),
        controlPlaneWritable: stryMutAct_9fa48("59687") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== true : stryMutAct_9fa48("59686") ? false : stryMutAct_9fa48("59685") ? true : (stryCov_9fa48("59685", "59686", "59687"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === (stryMutAct_9fa48("59688") ? false : (stryCov_9fa48("59688"), true))),
        controlPlanePublished: stryMutAct_9fa48("59691") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] !== true : stryMutAct_9fa48("59690") ? false : stryMutAct_9fa48("59689") ? true : (stryCov_9fa48("59689", "59690", "59691"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === (stryMutAct_9fa48("59692") ? false : (stryCov_9fa48("59692"), true))),
        controlPlaneRecoveryEligible: stryMutAct_9fa48("59695") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true : stryMutAct_9fa48("59694") ? false : stryMutAct_9fa48("59693") ? true : (stryCov_9fa48("59693", "59694", "59695"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === (stryMutAct_9fa48("59696") ? false : (stryCov_9fa48("59696"), true))),
        repairEligible: stryMutAct_9fa48("59699") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true : stryMutAct_9fa48("59698") ? false : stryMutAct_9fa48("59697") ? true : (stryCov_9fa48("59697", "59698", "59699"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === (stryMutAct_9fa48("59700") ? false : (stryCov_9fa48("59700"), true))),
        serveEligible: stryMutAct_9fa48("59703") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== true : stryMutAct_9fa48("59702") ? false : stryMutAct_9fa48("59701") ? true : (stryCov_9fa48("59701", "59702", "59703"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === (stryMutAct_9fa48("59704") ? false : (stryCov_9fa48("59704"), true))),
        priorityControlPlaneRecoveryActive: stryMutAct_9fa48("59707") ? snapshot?.priorityControlPlaneRecovery?.active !== true : stryMutAct_9fa48("59706") ? false : stryMutAct_9fa48("59705") ? true : (stryCov_9fa48("59705", "59706", "59707"), (stryMutAct_9fa48("59709") ? snapshot.priorityControlPlaneRecovery?.active : stryMutAct_9fa48("59708") ? snapshot?.priorityControlPlaneRecovery.active : (stryCov_9fa48("59708", "59709"), snapshot?.priorityControlPlaneRecovery?.active)) === (stryMutAct_9fa48("59710") ? false : (stryCov_9fa48("59710"), true))),
        priorityControlPlaneRecoveryReasonCodes: Array.isArray(stryMutAct_9fa48("59712") ? snapshot.priorityControlPlaneRecovery?.reasonCodes : stryMutAct_9fa48("59711") ? snapshot?.priorityControlPlaneRecovery.reasonCodes : (stryCov_9fa48("59711", "59712"), snapshot?.priorityControlPlaneRecovery?.reasonCodes)) ? Object.freeze(stryMutAct_9fa48("59713") ? [] : (stryCov_9fa48("59713"), [...snapshot.priorityControlPlaneRecovery.reasonCodes])) : Object.freeze(stryMutAct_9fa48("59714") ? ["Stryker was here"] : (stryCov_9fa48("59714"), [])),
        reasonCodes: Object.freeze(reasonCodes),
        recoveryActive: stryMutAct_9fa48("59715") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true : (stryCov_9fa48("59715"), !(stryMutAct_9fa48("59718") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true : stryMutAct_9fa48("59717") ? false : stryMutAct_9fa48("59716") ? true : (stryCov_9fa48("59716", "59717", "59718"), (stryMutAct_9fa48("59720") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true : stryMutAct_9fa48("59719") ? true : (stryCov_9fa48("59719", "59720"), (stryMutAct_9fa48("59722") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === true : stryMutAct_9fa48("59721") ? true : (stryCov_9fa48("59721", "59722"), (stryMutAct_9fa48("59724") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === true : stryMutAct_9fa48("59723") ? true : (stryCov_9fa48("59723", "59724"), (stryMutAct_9fa48("59726") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true : stryMutAct_9fa48("59725") ? true : (stryCov_9fa48("59725", "59726"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === (stryMutAct_9fa48("59727") ? false : (stryCov_9fa48("59727"), true)))) && (stryMutAct_9fa48("59729") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== true : stryMutAct_9fa48("59728") ? true : (stryCov_9fa48("59728", "59729"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === (stryMutAct_9fa48("59730") ? false : (stryCov_9fa48("59730"), true)))))) && (stryMutAct_9fa48("59732") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] !== true : stryMutAct_9fa48("59731") ? true : (stryCov_9fa48("59731", "59732"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === (stryMutAct_9fa48("59733") ? false : (stryCov_9fa48("59733"), true)))))) && (stryMutAct_9fa48("59735") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] !== true : stryMutAct_9fa48("59734") ? true : (stryCov_9fa48("59734", "59735"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === (stryMutAct_9fa48("59736") ? false : (stryCov_9fa48("59736"), true)))))) && (stryMutAct_9fa48("59738") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true : stryMutAct_9fa48("59737") ? true : (stryCov_9fa48("59737", "59738"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === (stryMutAct_9fa48("59739") ? false : (stryCov_9fa48("59739"), true)))))))
      }));
    }
  }

  /**
   * @return {Object}
   */
  getRecoveryEpochHistoryByNodeId() {
    if (stryMutAct_9fa48("59740")) {
      {}
    } else {
      stryCov_9fa48("59740");
      const entries = {};
      for (const [nodeId, history] of this.recoveryEpochHistoryByNodeId.entries()) {
        if (stryMutAct_9fa48("59741")) {
          {}
        } else {
          stryCov_9fa48("59741");
          entries[nodeId] = Array.isArray(history) ? history.map(stryMutAct_9fa48("59742") ? () => undefined : (stryCov_9fa48("59742"), epoch => Object.freeze(stryMutAct_9fa48("59743") ? {} : (stryCov_9fa48("59743"), {
            ...epoch,
            events: Object.freeze((Array.isArray(epoch.events) ? epoch.events : stryMutAct_9fa48("59744") ? ["Stryker was here"] : (stryCov_9fa48("59744"), [])).map(stryMutAct_9fa48("59745") ? () => undefined : (stryCov_9fa48("59745"), event => Object.freeze(stryMutAct_9fa48("59746") ? {} : (stryCov_9fa48("59746"), {
              ...event
            })))))
          })))) : stryMutAct_9fa48("59747") ? ["Stryker was here"] : (stryCov_9fa48("59747"), []);
        }
      }
      for (const [nodeId, epoch] of this.currentRecoveryEpochByNodeId.entries()) {
        if (stryMutAct_9fa48("59748")) {
          {}
        } else {
          stryCov_9fa48("59748");
          entries[nodeId] = Object.freeze(stryMutAct_9fa48("59749") ? [] : (stryCov_9fa48("59749"), [...(Array.isArray(entries[nodeId]) ? entries[nodeId] : stryMutAct_9fa48("59750") ? ["Stryker was here"] : (stryCov_9fa48("59750"), [])), Object.freeze(stryMutAct_9fa48("59751") ? {} : (stryCov_9fa48("59751"), {
            ...epoch,
            events: Object.freeze((Array.isArray(epoch.events) ? epoch.events : stryMutAct_9fa48("59752") ? ["Stryker was here"] : (stryCov_9fa48("59752"), [])).map(stryMutAct_9fa48("59753") ? () => undefined : (stryCov_9fa48("59753"), event => Object.freeze(stryMutAct_9fa48("59754") ? {} : (stryCov_9fa48("59754"), {
              ...event
            })))))
          }))]));
        }
      }
      return Object.freeze(entries);
    }
  }

  /**
   * Build one stable single-flight key for readiness evaluations.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  buildReadinessEvaluationKey(nodeId, options = {}) {
    if (stryMutAct_9fa48("59755")) {
      {}
    } else {
      stryCov_9fa48("59755");
      return String(stryMutAct_9fa48("59758") ? nodeId && '' : stryMutAct_9fa48("59757") ? false : stryMutAct_9fa48("59756") ? true : (stryCov_9fa48("59756", "59757", "59758"), nodeId || (stryMutAct_9fa48("59759") ? "Stryker was here!" : (stryCov_9fa48("59759"), '')))) + (stryMutAct_9fa48("59760") ? "" : (stryCov_9fa48("59760"), '::refresh=')) + String(stryMutAct_9fa48("59763") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("59762") ? false : stryMutAct_9fa48("59761") ? true : (stryCov_9fa48("59761", "59762", "59763"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("59764") ? false : (stryCov_9fa48("59764"), true)))) + (stryMutAct_9fa48("59765") ? "" : (stryCov_9fa48("59765"), '::stale=')) + String(stryMutAct_9fa48("59768") ? options.allowStaleOnCacheChange !== true : stryMutAct_9fa48("59767") ? false : stryMutAct_9fa48("59766") ? true : (stryCov_9fa48("59766", "59767", "59768"), options.allowStaleOnCacheChange === (stryMutAct_9fa48("59769") ? false : (stryCov_9fa48("59769"), true))));
    }
  }

  /**
   * Subscribe to node/service cache changes so hot-path readiness reuse does
   * not outlive fresh cluster evidence.
   * @private
   */
  subscribeToCacheChanges() {
    if (stryMutAct_9fa48("59770")) {
      {}
    } else {
      stryCov_9fa48("59770");
      if (stryMutAct_9fa48("59773") ? !this.systemTableCache && typeof this.systemTableCache.onCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("59772") ? false : stryMutAct_9fa48("59771") ? true : (stryCov_9fa48("59771", "59772", "59773"), (stryMutAct_9fa48("59774") ? this.systemTableCache : (stryCov_9fa48("59774"), !this.systemTableCache)) || (stryMutAct_9fa48("59776") ? typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("59775") ? false : (stryCov_9fa48("59775", "59776"), typeof this.systemTableCache.onCacheChange !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("59777")) {
          {}
        } else {
          stryCov_9fa48("59777");
          return;
        }
      }
      this.cacheChangeListener = (tableName, _operation, record) => {
        if (stryMutAct_9fa48("59778")) {
          {}
        } else {
          stryCov_9fa48("59778");
          this.handleCacheChange(tableName, record);
        }
      };
      this.systemTableCache.onCacheChange(this.cacheChangeListener);
    }
  }

  /**
   * Invalidate cached readiness snapshots affected by one cache change.
   * @param {string} tableName
   * @param {Object|null} record
   * @private
   */
  handleCacheChange(tableName, record) {
    if (stryMutAct_9fa48("59779")) {
      {}
    } else {
      stryCov_9fa48("59779");
      if (stryMutAct_9fa48("59782") ? tableName !== TABLES.NODES || tableName !== TABLES.SERVICES : stryMutAct_9fa48("59781") ? false : stryMutAct_9fa48("59780") ? true : (stryCov_9fa48("59780", "59781", "59782"), (stryMutAct_9fa48("59784") ? tableName === TABLES.NODES : stryMutAct_9fa48("59783") ? true : (stryCov_9fa48("59783", "59784"), tableName !== TABLES.NODES)) && (stryMutAct_9fa48("59786") ? tableName === TABLES.SERVICES : stryMutAct_9fa48("59785") ? true : (stryCov_9fa48("59785", "59786"), tableName !== TABLES.SERVICES)))) {
        if (stryMutAct_9fa48("59787")) {
          {}
        } else {
          stryCov_9fa48("59787");
          return;
        }
      }
      const nodeId = String(stryMutAct_9fa48("59788") ? (record?.[COLUMN.NODE_ID] ?? record?.node_id) && '' : (stryCov_9fa48("59788"), (stryMutAct_9fa48("59789") ? record?.[COLUMN.NODE_ID] && record?.node_id : (stryCov_9fa48("59789"), (stryMutAct_9fa48("59790") ? record[COLUMN.NODE_ID] : (stryCov_9fa48("59790"), record?.[COLUMN.NODE_ID])) ?? (stryMutAct_9fa48("59791") ? record.node_id : (stryCov_9fa48("59791"), record?.node_id)))) ?? (stryMutAct_9fa48("59792") ? "Stryker was here!" : (stryCov_9fa48("59792"), ''))));
      if (stryMutAct_9fa48("59795") ? false : stryMutAct_9fa48("59794") ? true : stryMutAct_9fa48("59793") ? nodeId : (stryCov_9fa48("59793", "59794", "59795"), !nodeId)) {
        if (stryMutAct_9fa48("59796")) {
          {}
        } else {
          stryCov_9fa48("59796");
          return;
        }
      }
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.set(nodeId, this.now());
    }
  }

  /**
   * Determine whether one cached readiness snapshot was invalidated by a
   * subsequent node/service cache mutation.
   * @param {string} nodeId
   * @param {number|null} [capturedAtMs]
   * @return {boolean}
   * @private
   */
  isReadinessSnapshotInvalidated(nodeId, capturedAtMs = null) {
    if (stryMutAct_9fa48("59797")) {
      {}
    } else {
      stryCov_9fa48("59797");
      if (stryMutAct_9fa48("59800") ? false : stryMutAct_9fa48("59799") ? true : stryMutAct_9fa48("59798") ? nodeId : (stryCov_9fa48("59798", "59799", "59800"), !nodeId)) {
        if (stryMutAct_9fa48("59801")) {
          {}
        } else {
          stryCov_9fa48("59801");
          return stryMutAct_9fa48("59802") ? true : (stryCov_9fa48("59802"), false);
        }
      }
      const invalidatedAtMs = Number(this.lastReadinessSnapshotInvalidatedAtMsByNodeId.get(nodeId));
      if (stryMutAct_9fa48("59805") ? !Number.isFinite(invalidatedAtMs) && invalidatedAtMs <= NUM.ZERO : stryMutAct_9fa48("59804") ? false : stryMutAct_9fa48("59803") ? true : (stryCov_9fa48("59803", "59804", "59805"), (stryMutAct_9fa48("59806") ? Number.isFinite(invalidatedAtMs) : (stryCov_9fa48("59806"), !Number.isFinite(invalidatedAtMs))) || (stryMutAct_9fa48("59809") ? invalidatedAtMs > NUM.ZERO : stryMutAct_9fa48("59808") ? invalidatedAtMs < NUM.ZERO : stryMutAct_9fa48("59807") ? false : (stryCov_9fa48("59807", "59808", "59809"), invalidatedAtMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("59810")) {
          {}
        } else {
          stryCov_9fa48("59810");
          return stryMutAct_9fa48("59811") ? true : (stryCov_9fa48("59811"), false);
        }
      }
      const snapshotAtMs = Number.isFinite(capturedAtMs) ? capturedAtMs : Number(this.lastReadinessSnapshotAtMsByNodeId.get(nodeId));
      if (stryMutAct_9fa48("59814") ? !Number.isFinite(snapshotAtMs) && snapshotAtMs <= NUM.ZERO : stryMutAct_9fa48("59813") ? false : stryMutAct_9fa48("59812") ? true : (stryCov_9fa48("59812", "59813", "59814"), (stryMutAct_9fa48("59815") ? Number.isFinite(snapshotAtMs) : (stryCov_9fa48("59815"), !Number.isFinite(snapshotAtMs))) || (stryMutAct_9fa48("59818") ? snapshotAtMs > NUM.ZERO : stryMutAct_9fa48("59817") ? snapshotAtMs < NUM.ZERO : stryMutAct_9fa48("59816") ? false : (stryCov_9fa48("59816", "59817", "59818"), snapshotAtMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("59819")) {
          {}
        } else {
          stryCov_9fa48("59819");
          return stryMutAct_9fa48("59820") ? false : (stryCov_9fa48("59820"), true);
        }
      }
      return stryMutAct_9fa48("59824") ? invalidatedAtMs < snapshotAtMs : stryMutAct_9fa48("59823") ? invalidatedAtMs > snapshotAtMs : stryMutAct_9fa48("59822") ? false : stryMutAct_9fa48("59821") ? true : (stryCov_9fa48("59821", "59822", "59823", "59824"), invalidatedAtMs >= snapshotAtMs);
    }
  }

  /**
   * Start one deduped asynchronous readiness refresh when a hot-path caller is
   * allowed to reuse a recently invalidated snapshot.
   * @param {string} nodeId
   * @param {Object} [options]
   * @private
   */
  maybeStartBackgroundReadinessRefresh(nodeId, options = {}) {
    if (stryMutAct_9fa48("59825")) {
      {}
    } else {
      stryCov_9fa48("59825");
      if (stryMutAct_9fa48("59828") ? false : stryMutAct_9fa48("59827") ? true : stryMutAct_9fa48("59826") ? nodeId : (stryCov_9fa48("59826", "59827", "59828"), !nodeId)) {
        if (stryMutAct_9fa48("59829")) {
          {}
        } else {
          stryCov_9fa48("59829");
          return;
        }
      }
      const evaluationKey = this.buildReadinessEvaluationKey(nodeId, options);
      this.readinessEvaluationLane.run(stryMutAct_9fa48("59830") ? {} : (stryCov_9fa48("59830"), {
        ownerKey: evaluationKey
      }), stryMutAct_9fa48("59831") ? () => undefined : (stryCov_9fa48("59831"), async () => this.evaluateNodeReadiness(nodeId, options))).catch(stryMutAct_9fa48("59832") ? () => undefined : (stryCov_9fa48("59832"), _error => null));
    }
  }

  /**
   * Start one background owner-path refresh for sync callers when the visible
   * snapshot is ineligible for the requested decision and connected evidence
   * suggests the cache may be stale.
   * @param {Object} context
   * @param {Object} [options]
   * @private
   */
  maybeStartBackgroundSyncReadinessRefresh(context = {}, options = {}) {
    if (stryMutAct_9fa48("59833")) {
      {}
    } else {
      stryCov_9fa48("59833");
      if (stryMutAct_9fa48("59836") ? options.allowAuthoritativeRefresh === true : stryMutAct_9fa48("59835") ? false : stryMutAct_9fa48("59834") ? true : (stryCov_9fa48("59834", "59835", "59836"), options.allowAuthoritativeRefresh !== (stryMutAct_9fa48("59837") ? false : (stryCov_9fa48("59837"), true)))) {
        if (stryMutAct_9fa48("59838")) {
          {}
        } else {
          stryCov_9fa48("59838");
          return;
        }
      }
      if (stryMutAct_9fa48("59841") ? false : stryMutAct_9fa48("59840") ? true : stryMutAct_9fa48("59839") ? this.shouldBypassCachedSnapshot(context.snapshot, options) : (stryCov_9fa48("59839", "59840", "59841"), !this.shouldBypassCachedSnapshot(context.snapshot, options))) {
        if (stryMutAct_9fa48("59842")) {
          {}
        } else {
          stryCov_9fa48("59842");
          return;
        }
      }
      this.authoritativeNodeEvidenceReconciler.maybeRepairNodeEvidence(context, options).catch(stryMutAct_9fa48("59843") ? () => undefined : (stryCov_9fa48("59843"), _error => null));
    }
  }

  /**
   * Resolve local heartbeat publication diagnostics when available.
   * @return {Object|null}
   * @private
   */
  getHeartbeatPublicationDiagnostics() {
    if (stryMutAct_9fa48("59844")) {
      {}
    } else {
      stryCov_9fa48("59844");
      if (stryMutAct_9fa48("59847") ? !this.heartbeatService && typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("59846") ? false : stryMutAct_9fa48("59845") ? true : (stryCov_9fa48("59845", "59846", "59847"), (stryMutAct_9fa48("59848") ? this.heartbeatService : (stryCov_9fa48("59848"), !this.heartbeatService)) || (stryMutAct_9fa48("59850") ? typeof this.heartbeatService.getHeartbeatPublicationDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("59849") ? false : (stryCov_9fa48("59849", "59850"), typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("59851")) {
          {}
        } else {
          stryCov_9fa48("59851");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("59852")) {
          {}
        } else {
          stryCov_9fa48("59852");
          const diagnostics = this.heartbeatService.getHeartbeatPublicationDiagnostics();
          return (stryMutAct_9fa48("59855") ? diagnostics || typeof diagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("59854") ? false : stryMutAct_9fa48("59853") ? true : (stryCov_9fa48("59853", "59854", "59855"), diagnostics && (stryMutAct_9fa48("59857") ? typeof diagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("59856") ? true : (stryCov_9fa48("59856", "59857"), typeof diagnostics === TYPEOF.OBJECT)))) ? diagnostics : null;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("59858")) {
          {}
        } else {
          stryCov_9fa48("59858");
          return null;
        }
      }
    }
  }

  /**
   * Treat fresh local node_state_reporter success as self-liveness evidence
   * when the local cache lags the control-plane round-trip for this node.
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  hasFreshLocalReporterSuccess(nodeId) {
    if (stryMutAct_9fa48("59859")) {
      {}
    } else {
      stryCov_9fa48("59859");
      if (stryMutAct_9fa48("59862") ? nodeId === this.nodeId : stryMutAct_9fa48("59861") ? false : stryMutAct_9fa48("59860") ? true : (stryCov_9fa48("59860", "59861", "59862"), nodeId !== this.nodeId)) {
        if (stryMutAct_9fa48("59863")) {
          {}
        } else {
          stryCov_9fa48("59863");
          return stryMutAct_9fa48("59864") ? true : (stryCov_9fa48("59864"), false);
        }
      }
      const diagnostics = this.getHeartbeatPublicationDiagnostics();
      if (stryMutAct_9fa48("59867") ? !diagnostics && diagnostics.publicationPath !== 'node_state_reporter' : stryMutAct_9fa48("59866") ? false : stryMutAct_9fa48("59865") ? true : (stryCov_9fa48("59865", "59866", "59867"), (stryMutAct_9fa48("59868") ? diagnostics : (stryCov_9fa48("59868"), !diagnostics)) || (stryMutAct_9fa48("59870") ? diagnostics.publicationPath === 'node_state_reporter' : stryMutAct_9fa48("59869") ? false : (stryCov_9fa48("59869", "59870"), diagnostics.publicationPath !== (stryMutAct_9fa48("59871") ? "" : (stryCov_9fa48("59871"), 'node_state_reporter')))))) {
        if (stryMutAct_9fa48("59872")) {
          {}
        } else {
          stryCov_9fa48("59872");
          return stryMutAct_9fa48("59873") ? true : (stryCov_9fa48("59873"), false);
        }
      }
      const lastSuccessAtMs = normalizeDiagnosticTimestampMs(diagnostics.lastSuccessAt);
      if (stryMutAct_9fa48("59876") ? false : stryMutAct_9fa48("59875") ? true : stryMutAct_9fa48("59874") ? Number.isFinite(lastSuccessAtMs) : (stryCov_9fa48("59874", "59875", "59876"), !Number.isFinite(lastSuccessAtMs))) {
        if (stryMutAct_9fa48("59877")) {
          {}
        } else {
          stryCov_9fa48("59877");
          return stryMutAct_9fa48("59878") ? true : (stryCov_9fa48("59878"), false);
        }
      }
      const lastFailureAtMs = normalizeDiagnosticTimestampMs(diagnostics.lastFailureAt);
      if (stryMutAct_9fa48("59881") ? Number(diagnostics.consecutiveFailures) > NUM.ZERO && Number.isFinite(lastFailureAtMs) && lastFailureAtMs > lastSuccessAtMs : stryMutAct_9fa48("59880") ? false : stryMutAct_9fa48("59879") ? true : (stryCov_9fa48("59879", "59880", "59881"), (stryMutAct_9fa48("59884") ? Number(diagnostics.consecutiveFailures) <= NUM.ZERO : stryMutAct_9fa48("59883") ? Number(diagnostics.consecutiveFailures) >= NUM.ZERO : stryMutAct_9fa48("59882") ? false : (stryCov_9fa48("59882", "59883", "59884"), Number(diagnostics.consecutiveFailures) > NUM.ZERO)) || (stryMutAct_9fa48("59886") ? Number.isFinite(lastFailureAtMs) || lastFailureAtMs > lastSuccessAtMs : stryMutAct_9fa48("59885") ? false : (stryCov_9fa48("59885", "59886"), Number.isFinite(lastFailureAtMs) && (stryMutAct_9fa48("59889") ? lastFailureAtMs <= lastSuccessAtMs : stryMutAct_9fa48("59888") ? lastFailureAtMs >= lastSuccessAtMs : stryMutAct_9fa48("59887") ? true : (stryCov_9fa48("59887", "59888", "59889"), lastFailureAtMs > lastSuccessAtMs)))))) {
        if (stryMutAct_9fa48("59890")) {
          {}
        } else {
          stryCov_9fa48("59890");
          return this.shouldGraceTimedOutLocalReporterFailure(stryMutAct_9fa48("59891") ? {} : (stryCov_9fa48("59891"), {
            diagnostics,
            lastSuccessAtMs,
            lastFailureAtMs
          }));
        }
      }
      return stryMutAct_9fa48("59895") ? this.now() - lastSuccessAtMs > this.clusterMemberStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("59894") ? this.now() - lastSuccessAtMs < this.clusterMemberStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("59893") ? false : stryMutAct_9fa48("59892") ? true : (stryCov_9fa48("59892", "59893", "59894", "59895"), (stryMutAct_9fa48("59896") ? this.now() + lastSuccessAtMs : (stryCov_9fa48("59896"), this.now() - lastSuccessAtMs)) <= this.clusterMemberStaleHeartbeatMaxAgeMs);
    }
  }

  /**
   * Keep self-readiness open through one timed-out reporter attempt when the
   * last canonically visible reporter heartbeat is still fresh. This prevents
   * load-lane self denial while the bounded authoritative repair path is
   * timing out under transient control-plane pressure.
   * @param {Object} context
   * @param {Object} context.diagnostics
   * @param {number} context.lastSuccessAtMs
   * @param {number} context.lastFailureAtMs
   * @return {boolean}
   * @private
   */
  shouldGraceTimedOutLocalReporterFailure(context = {}) {
    if (stryMutAct_9fa48("59897")) {
      {}
    } else {
      stryCov_9fa48("59897");
      const diagnostics = stryMutAct_9fa48("59900") ? context?.diagnostics && {} : stryMutAct_9fa48("59899") ? false : stryMutAct_9fa48("59898") ? true : (stryCov_9fa48("59898", "59899", "59900"), (stryMutAct_9fa48("59901") ? context.diagnostics : (stryCov_9fa48("59901"), context?.diagnostics)) || {});
      const lastSuccessAtMs = Number(stryMutAct_9fa48("59902") ? context.lastSuccessAtMs : (stryCov_9fa48("59902"), context?.lastSuccessAtMs));
      const lastFailureAtMs = Number(stryMutAct_9fa48("59903") ? context.lastFailureAtMs : (stryCov_9fa48("59903"), context?.lastFailureAtMs));
      if (stryMutAct_9fa48("59906") ? false : stryMutAct_9fa48("59905") ? true : stryMutAct_9fa48("59904") ? Number.isFinite(lastSuccessAtMs) : (stryCov_9fa48("59904", "59905", "59906"), !Number.isFinite(lastSuccessAtMs))) {
        if (stryMutAct_9fa48("59907")) {
          {}
        } else {
          stryCov_9fa48("59907");
          return stryMutAct_9fa48("59908") ? true : (stryCov_9fa48("59908"), false);
        }
      }
      if (stryMutAct_9fa48("59912") ? this.now() - lastSuccessAtMs <= this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("59911") ? this.now() - lastSuccessAtMs >= this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("59910") ? false : stryMutAct_9fa48("59909") ? true : (stryCov_9fa48("59909", "59910", "59911", "59912"), (stryMutAct_9fa48("59913") ? this.now() + lastSuccessAtMs : (stryCov_9fa48("59913"), this.now() - lastSuccessAtMs)) > this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs)) {
        if (stryMutAct_9fa48("59914")) {
          {}
        } else {
          stryCov_9fa48("59914");
          return stryMutAct_9fa48("59915") ? true : (stryCov_9fa48("59915"), false);
        }
      }
      if (stryMutAct_9fa48("59918") ? !Number.isFinite(lastFailureAtMs) && lastFailureAtMs <= lastSuccessAtMs : stryMutAct_9fa48("59917") ? false : stryMutAct_9fa48("59916") ? true : (stryCov_9fa48("59916", "59917", "59918"), (stryMutAct_9fa48("59919") ? Number.isFinite(lastFailureAtMs) : (stryCov_9fa48("59919"), !Number.isFinite(lastFailureAtMs))) || (stryMutAct_9fa48("59922") ? lastFailureAtMs > lastSuccessAtMs : stryMutAct_9fa48("59921") ? lastFailureAtMs < lastSuccessAtMs : stryMutAct_9fa48("59920") ? false : (stryCov_9fa48("59920", "59921", "59922"), lastFailureAtMs <= lastSuccessAtMs)))) {
        if (stryMutAct_9fa48("59923")) {
          {}
        } else {
          stryCov_9fa48("59923");
          return stryMutAct_9fa48("59924") ? true : (stryCov_9fa48("59924"), false);
        }
      }
      if (stryMutAct_9fa48("59927") ? String(diagnostics?.lastFailureStage || '') === 'attempt_timeout' : stryMutAct_9fa48("59926") ? false : stryMutAct_9fa48("59925") ? true : (stryCov_9fa48("59925", "59926", "59927"), String(stryMutAct_9fa48("59930") ? diagnostics?.lastFailureStage && '' : stryMutAct_9fa48("59929") ? false : stryMutAct_9fa48("59928") ? true : (stryCov_9fa48("59928", "59929", "59930"), (stryMutAct_9fa48("59931") ? diagnostics.lastFailureStage : (stryCov_9fa48("59931"), diagnostics?.lastFailureStage)) || (stryMutAct_9fa48("59932") ? "Stryker was here!" : (stryCov_9fa48("59932"), '')))) !== (stryMutAct_9fa48("59933") ? "" : (stryCov_9fa48("59933"), 'attempt_timeout')))) {
        if (stryMutAct_9fa48("59934")) {
          {}
        } else {
          stryCov_9fa48("59934");
          return stryMutAct_9fa48("59935") ? true : (stryCov_9fa48("59935"), false);
        }
      }
      return stryMutAct_9fa48("59939") ? Number(diagnostics?.consecutiveFailures) > NUM.ONE : stryMutAct_9fa48("59938") ? Number(diagnostics?.consecutiveFailures) < NUM.ONE : stryMutAct_9fa48("59937") ? false : stryMutAct_9fa48("59936") ? true : (stryCov_9fa48("59936", "59937", "59938", "59939"), Number(stryMutAct_9fa48("59940") ? diagnostics.consecutiveFailures : (stryCov_9fa48("59940"), diagnostics?.consecutiveFailures)) <= NUM.ONE);
    }
  }

  /**
   * Resolve publication diagnostics from the canonical publication owner.
   * @param {string} observedAt
   * @return {Object}
   * @private
   */
  getPublicationDiagnostics(observedAt) {
    if (stryMutAct_9fa48("59941")) {
      {}
    } else {
      stryCov_9fa48("59941");
      if (stryMutAct_9fa48("59944") ? this.cdcGroupPropagationService || typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("59943") ? false : stryMutAct_9fa48("59942") ? true : (stryCov_9fa48("59942", "59943", "59944"), this.cdcGroupPropagationService && (stryMutAct_9fa48("59946") ? typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("59945") ? true : (stryCov_9fa48("59945", "59946"), typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("59947")) {
          {}
        } else {
          stryCov_9fa48("59947");
          return this.cdcGroupPropagationService.getPublicationModeDiagnostics();
        }
      }
      if (stryMutAct_9fa48("59950") ? false : stryMutAct_9fa48("59949") ? true : stryMutAct_9fa48("59948") ? this.loggedMissingPublicationOwner : (stryCov_9fa48("59948", "59949", "59950"), !this.loggedMissingPublicationOwner)) {
        if (stryMutAct_9fa48("59951")) {
          {}
        } else {
          stryCov_9fa48("59951");
          this.loggedMissingPublicationOwner = stryMutAct_9fa48("59952") ? false : (stryCov_9fa48("59952"), true);
          this.logMissingOwner(stryMutAct_9fa48("59953") ? "" : (stryCov_9fa48("59953"), 'ControlPlaneReadinessService missing CDC publication owner'), CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION);
        }
      }
      if (stryMutAct_9fa48("59955") ? false : stryMutAct_9fa48("59954") ? true : (stryCov_9fa48("59954", "59955"), this.strictOwnerDependencies)) {
        if (stryMutAct_9fa48("59956")) {
          {}
        } else {
          stryCov_9fa48("59956");
          throw new Error(READINESS_ERROR_MSG.PUBLICATION_OWNER_REQUIRED);
        }
      }
      return Object.freeze(stryMutAct_9fa48("59957") ? {} : (stryCov_9fa48("59957"), {
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
        reasonCode: stryMutAct_9fa48("59958") ? "" : (stryCov_9fa48("59958"), 'publication_owner_unavailable'),
        enteredAt: observedAt,
        recentTransitions: Object.freeze(stryMutAct_9fa48("59959") ? ["Stryker was here"] : (stryCov_9fa48("59959"), []))
      }));
    }
  }

  /**
   * Build the readiness dimensions.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildDimensions(context) {
    if (stryMutAct_9fa48("59960")) {
      {}
    } else {
      stryCov_9fa48("59960");
      const localQueryTransportRoutable = this.isLocalQueryTransportRoutableForNode(context.nodeId, context.nodeEvidence);
      const publicationHealthy = this.isPublicationHealthy(context.publication);
      const processAlive = stryMutAct_9fa48("59961") ? CONTROL_PLANE_READINESS_DEFAULT.NON_RUNNING_PROCESS_STATES.includes(String(context.lifecycleState || '')) : (stryCov_9fa48("59961"), !CONTROL_PLANE_READINESS_DEFAULT.NON_RUNNING_PROCESS_STATES.includes(String(stryMutAct_9fa48("59964") ? context.lifecycleState && '' : stryMutAct_9fa48("59963") ? false : stryMutAct_9fa48("59962") ? true : (stryCov_9fa48("59962", "59963", "59964"), context.lifecycleState || (stryMutAct_9fa48("59965") ? "Stryker was here!" : (stryCov_9fa48("59965"), ''))))));
      const clusterMemberHealthy = this.isClusterMemberHealthy(context.nodeId, context.nodeRow);
      const writableControlPlaneService = this.hasWritableControlPlaneService(context.serviceRows);
      const serveEligibleControlPlaneService = this.hasServeEligibleControlPlaneService(context.serviceRows);
      const routingReady = stryMutAct_9fa48("59968") ? this.hasRoutableService(context.serviceRows) || localQueryTransportRoutable : stryMutAct_9fa48("59967") ? false : stryMutAct_9fa48("59966") ? true : (stryCov_9fa48("59966", "59967", "59968"), this.hasRoutableService(context.serviceRows) && localQueryTransportRoutable);
      const loadReady = this.isLoadReady(context.nodeRow);
      const controlPlanePublished = this.isControlPlanePublished(context.membershipPublication);
      const recoveryEligible = this.isControlPlaneRecoveryEligible(stryMutAct_9fa48("59969") ? {} : (stryCov_9fa48("59969"), {
        ...context,
        routingReady,
        writableControlPlaneService,
        publicationHealthy,
        controlPlanePublished,
        clusterMemberHealthy
      }));
      const controlPlaneWritable = stryMutAct_9fa48("59972") ? clusterMemberHealthy && routingReady && writableControlPlaneService || publicationHealthy : stryMutAct_9fa48("59971") ? false : stryMutAct_9fa48("59970") ? true : (stryCov_9fa48("59970", "59971", "59972"), (stryMutAct_9fa48("59974") ? clusterMemberHealthy && routingReady || writableControlPlaneService : stryMutAct_9fa48("59973") ? true : (stryCov_9fa48("59973", "59974"), (stryMutAct_9fa48("59976") ? clusterMemberHealthy || routingReady : stryMutAct_9fa48("59975") ? true : (stryCov_9fa48("59975", "59976"), clusterMemberHealthy && routingReady)) && writableControlPlaneService)) && publicationHealthy);
      const placementEligible = stryMutAct_9fa48("59979") ? processAlive && clusterMemberHealthy && routingReady && loadReady && controlPlaneWritable && publicationHealthy || this.isCapacityPlacementEligible(context.capacity) : stryMutAct_9fa48("59978") ? false : stryMutAct_9fa48("59977") ? true : (stryCov_9fa48("59977", "59978", "59979"), (stryMutAct_9fa48("59981") ? processAlive && clusterMemberHealthy && routingReady && loadReady && controlPlaneWritable || publicationHealthy : stryMutAct_9fa48("59980") ? true : (stryCov_9fa48("59980", "59981"), (stryMutAct_9fa48("59983") ? processAlive && clusterMemberHealthy && routingReady && loadReady || controlPlaneWritable : stryMutAct_9fa48("59982") ? true : (stryCov_9fa48("59982", "59983"), (stryMutAct_9fa48("59985") ? processAlive && clusterMemberHealthy && routingReady || loadReady : stryMutAct_9fa48("59984") ? true : (stryCov_9fa48("59984", "59985"), (stryMutAct_9fa48("59987") ? processAlive && clusterMemberHealthy || routingReady : stryMutAct_9fa48("59986") ? true : (stryCov_9fa48("59986", "59987"), (stryMutAct_9fa48("59989") ? processAlive || clusterMemberHealthy : stryMutAct_9fa48("59988") ? true : (stryCov_9fa48("59988", "59989"), processAlive && clusterMemberHealthy)) && routingReady)) && loadReady)) && controlPlaneWritable)) && publicationHealthy)) && this.isCapacityPlacementEligible(context.capacity));
      const repairEligible = stryMutAct_9fa48("59992") ? processAlive && clusterMemberHealthy && routingReady && controlPlaneWritable || publicationHealthy : stryMutAct_9fa48("59991") ? false : stryMutAct_9fa48("59990") ? true : (stryCov_9fa48("59990", "59991", "59992"), (stryMutAct_9fa48("59994") ? processAlive && clusterMemberHealthy && routingReady || controlPlaneWritable : stryMutAct_9fa48("59993") ? true : (stryCov_9fa48("59993", "59994"), (stryMutAct_9fa48("59996") ? processAlive && clusterMemberHealthy || routingReady : stryMutAct_9fa48("59995") ? true : (stryCov_9fa48("59995", "59996"), (stryMutAct_9fa48("59998") ? processAlive || clusterMemberHealthy : stryMutAct_9fa48("59997") ? true : (stryCov_9fa48("59997", "59998"), processAlive && clusterMemberHealthy)) && routingReady)) && controlPlaneWritable)) && publicationHealthy);
      const transportState = this.getNodeTransportState(context.nodeId, context.nodeRow);
      const transportNotExplicitlyNegative = stryMutAct_9fa48("60001") ? transportState.routerState === STATE.DISCONNECTED : stryMutAct_9fa48("60000") ? false : stryMutAct_9fa48("59999") ? true : (stryCov_9fa48("59999", "60000", "60001"), transportState.routerState !== STATE.DISCONNECTED);
      const serveEligible = stryMutAct_9fa48("60004") ? repairEligible && loadReady && transportNotExplicitlyNegative || serveEligibleControlPlaneService : stryMutAct_9fa48("60003") ? false : stryMutAct_9fa48("60002") ? true : (stryCov_9fa48("60002", "60003", "60004"), (stryMutAct_9fa48("60006") ? repairEligible && loadReady || transportNotExplicitlyNegative : stryMutAct_9fa48("60005") ? true : (stryCov_9fa48("60005", "60006"), (stryMutAct_9fa48("60008") ? repairEligible || loadReady : stryMutAct_9fa48("60007") ? true : (stryCov_9fa48("60007", "60008"), repairEligible && loadReady)) && transportNotExplicitlyNegative)) && serveEligibleControlPlaneService);
      return Object.freeze(stryMutAct_9fa48("60009") ? {} : (stryCov_9fa48("60009"), {
        [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: processAlive,
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: clusterMemberHealthy,
        [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: routingReady,
        [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: loadReady,
        [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: placementEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: controlPlaneWritable,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: controlPlanePublished,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: recoveryEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: publicationHealthy,
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: repairEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: serveEligible
      }));
    }
  }

  /**
   * Recovery admission is broader than ordinary routed traffic: internal
   * control-plane repair must stay possible while cached lifecycle or lease
   * evidence is still converging, as long as transport and service evidence
   * show a reachable control-plane path.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  isControlPlaneRecoveryEligible(context = {}) {
    if (stryMutAct_9fa48("60010")) {
      {}
    } else {
      stryCov_9fa48("60010");
      const priorityRecoveryActive = this.isPriorityControlPlaneRecoveryActive(context.membershipPublication);
      if (stryMutAct_9fa48("60013") ? (context.routingReady !== true || context.publicationHealthy !== true) && context.controlPlanePublished !== true && !priorityRecoveryActive : stryMutAct_9fa48("60012") ? false : stryMutAct_9fa48("60011") ? true : (stryCov_9fa48("60011", "60012", "60013"), (stryMutAct_9fa48("60015") ? context.routingReady !== true && context.publicationHealthy !== true : stryMutAct_9fa48("60014") ? false : (stryCov_9fa48("60014", "60015"), (stryMutAct_9fa48("60017") ? context.routingReady === true : stryMutAct_9fa48("60016") ? false : (stryCov_9fa48("60016", "60017"), context.routingReady !== (stryMutAct_9fa48("60018") ? false : (stryCov_9fa48("60018"), true)))) || (stryMutAct_9fa48("60020") ? context.publicationHealthy === true : stryMutAct_9fa48("60019") ? false : (stryCov_9fa48("60019", "60020"), context.publicationHealthy !== (stryMutAct_9fa48("60021") ? false : (stryCov_9fa48("60021"), true)))))) || (stryMutAct_9fa48("60023") ? context.controlPlanePublished !== true || !priorityRecoveryActive : stryMutAct_9fa48("60022") ? false : (stryCov_9fa48("60022", "60023"), (stryMutAct_9fa48("60025") ? context.controlPlanePublished === true : stryMutAct_9fa48("60024") ? true : (stryCov_9fa48("60024", "60025"), context.controlPlanePublished !== (stryMutAct_9fa48("60026") ? false : (stryCov_9fa48("60026"), true)))) && (stryMutAct_9fa48("60027") ? priorityRecoveryActive : (stryCov_9fa48("60027"), !priorityRecoveryActive)))))) {
        if (stryMutAct_9fa48("60028")) {
          {}
        } else {
          stryCov_9fa48("60028");
          return stryMutAct_9fa48("60029") ? true : (stryCov_9fa48("60029"), false);
        }
      }
      if (stryMutAct_9fa48("60032") ? context.clusterMemberHealthy !== true : stryMutAct_9fa48("60031") ? false : stryMutAct_9fa48("60030") ? true : (stryCov_9fa48("60030", "60031", "60032"), context.clusterMemberHealthy === (stryMutAct_9fa48("60033") ? false : (stryCov_9fa48("60033"), true)))) {
        if (stryMutAct_9fa48("60034")) {
          {}
        } else {
          stryCov_9fa48("60034");
          return stryMutAct_9fa48("60037") ? context.writableControlPlaneService !== true : stryMutAct_9fa48("60036") ? false : stryMutAct_9fa48("60035") ? true : (stryCov_9fa48("60035", "60036", "60037"), context.writableControlPlaneService === (stryMutAct_9fa48("60038") ? false : (stryCov_9fa48("60038"), true)));
        }
      }
      return this.shouldAllowTransportBackedRecoveryGrace(context);
    }
  }
  isPriorityControlPlaneRecoveryActive(membershipPublication = null) {
    if (stryMutAct_9fa48("60039")) {
      {}
    } else {
      stryCov_9fa48("60039");
      if (stryMutAct_9fa48("60042") ? !membershipPublication && typeof membershipPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("60041") ? false : stryMutAct_9fa48("60040") ? true : (stryCov_9fa48("60040", "60041", "60042"), (stryMutAct_9fa48("60043") ? membershipPublication : (stryCov_9fa48("60043"), !membershipPublication)) || (stryMutAct_9fa48("60045") ? typeof membershipPublication === TYPEOF.OBJECT : stryMutAct_9fa48("60044") ? false : (stryCov_9fa48("60044", "60045"), typeof membershipPublication !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60046")) {
          {}
        } else {
          stryCov_9fa48("60046");
          return stryMutAct_9fa48("60047") ? true : (stryCov_9fa48("60047"), false);
        }
      }
      const publicationPending = stryMutAct_9fa48("60050") ? membershipPublication.status || String(membershipPublication.status).toUpperCase() !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("60049") ? false : stryMutAct_9fa48("60048") ? true : (stryCov_9fa48("60048", "60049", "60050"), membershipPublication.status && (stryMutAct_9fa48("60052") ? String(membershipPublication.status).toUpperCase() === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("60051") ? true : (stryCov_9fa48("60051", "60052"), (stryMutAct_9fa48("60053") ? String(membershipPublication.status).toLowerCase() : (stryCov_9fa48("60053"), String(membershipPublication.status).toUpperCase())) !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)));
      if (stryMutAct_9fa48("60055") ? false : stryMutAct_9fa48("60054") ? true : (stryCov_9fa48("60054", "60055"), publicationPending)) {
        if (stryMutAct_9fa48("60056")) {
          {}
        } else {
          stryCov_9fa48("60056");
          return stryMutAct_9fa48("60057") ? false : (stryCov_9fa48("60057"), true);
        }
      }
      const priorityPartitionSummary = membershipPublication.priorityPartitionSummary;
      return hasPriorityRecoverySpreadGap(priorityPartitionSummary);
    }
  }

  /**
   * Bound recovery-only grace to nodes that still present live transport and
   * active control-plane service evidence, even if lifecycle or lease rows lag.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  shouldAllowTransportBackedRecoveryGrace(context = {}) {
    if (stryMutAct_9fa48("60058")) {
      {}
    } else {
      stryCov_9fa48("60058");
      const nodeEvidence = (stryMutAct_9fa48("60061") ? context.nodeEvidence || typeof context.nodeEvidence === TYPEOF.OBJECT : stryMutAct_9fa48("60060") ? false : stryMutAct_9fa48("60059") ? true : (stryCov_9fa48("60059", "60060", "60061"), context.nodeEvidence && (stryMutAct_9fa48("60063") ? typeof context.nodeEvidence !== TYPEOF.OBJECT : stryMutAct_9fa48("60062") ? true : (stryCov_9fa48("60062", "60063"), typeof context.nodeEvidence === TYPEOF.OBJECT)))) ? context.nodeEvidence : null;
      const serviceRows = Array.isArray(context.serviceRows) ? context.serviceRows : stryMutAct_9fa48("60064") ? ["Stryker was here"] : (stryCov_9fa48("60064"), []);
      if (stryMutAct_9fa48("60067") ? nodeEvidence?.transportConnected === true : stryMutAct_9fa48("60066") ? false : stryMutAct_9fa48("60065") ? true : (stryCov_9fa48("60065", "60066", "60067"), (stryMutAct_9fa48("60068") ? nodeEvidence.transportConnected : (stryCov_9fa48("60068"), nodeEvidence?.transportConnected)) !== (stryMutAct_9fa48("60069") ? false : (stryCov_9fa48("60069"), true)))) {
        if (stryMutAct_9fa48("60070")) {
          {}
        } else {
          stryCov_9fa48("60070");
          return stryMutAct_9fa48("60071") ? true : (stryCov_9fa48("60071"), false);
        }
      }
      return stryMutAct_9fa48("60074") ? this.hasRoutableService(serviceRows) || this.hasRecoveryGraceControlPlaneService(serviceRows) : stryMutAct_9fa48("60073") ? false : stryMutAct_9fa48("60072") ? true : (stryCov_9fa48("60072", "60073", "60074"), this.hasRoutableService(serviceRows) && this.hasRecoveryGraceControlPlaneService(serviceRows));
    }
  }

  /**
   * Determine whether metadata publication mode supports control-plane writes.
   * Grouped mode is healthy, and explicit config-safe-mode repair-only remains
   * healthy because it is a canonical direct-fanout mode rather than runtime
   * degradation.
   * @param {Object} publication
   * @return {boolean}
   * @private
   */
  isPublicationHealthy(publication) {
    if (stryMutAct_9fa48("60075")) {
      {}
    } else {
      stryCov_9fa48("60075");
      const currentMode = stryMutAct_9fa48("60078") ? publication?.currentMode && null : stryMutAct_9fa48("60077") ? false : stryMutAct_9fa48("60076") ? true : (stryCov_9fa48("60076", "60077", "60078"), (stryMutAct_9fa48("60079") ? publication.currentMode : (stryCov_9fa48("60079"), publication?.currentMode)) || null);
      if (stryMutAct_9fa48("60082") ? currentMode !== CONTROL_PLANE_PUBLICATION_MODE.GROUPED : stryMutAct_9fa48("60081") ? false : stryMutAct_9fa48("60080") ? true : (stryCov_9fa48("60080", "60081", "60082"), currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED)) {
        if (stryMutAct_9fa48("60083")) {
          {}
        } else {
          stryCov_9fa48("60083");
          return stryMutAct_9fa48("60084") ? false : (stryCov_9fa48("60084"), true);
        }
      }
      if (stryMutAct_9fa48("60087") ? currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY || publication?.reasonCode === PUBLICATION_REASON_CONFIG_SAFE_MODE : stryMutAct_9fa48("60086") ? false : stryMutAct_9fa48("60085") ? true : (stryCov_9fa48("60085", "60086", "60087"), (stryMutAct_9fa48("60089") ? currentMode !== CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY : stryMutAct_9fa48("60088") ? true : (stryCov_9fa48("60088", "60089"), currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY)) && (stryMutAct_9fa48("60091") ? publication?.reasonCode !== PUBLICATION_REASON_CONFIG_SAFE_MODE : stryMutAct_9fa48("60090") ? true : (stryCov_9fa48("60090", "60091"), (stryMutAct_9fa48("60092") ? publication.reasonCode : (stryCov_9fa48("60092"), publication?.reasonCode)) === PUBLICATION_REASON_CONFIG_SAFE_MODE)))) {
        if (stryMutAct_9fa48("60093")) {
          {}
        } else {
          stryCov_9fa48("60093");
          return stryMutAct_9fa48("60094") ? false : (stryCov_9fa48("60094"), true);
        }
      }
      return stryMutAct_9fa48("60095") ? true : (stryCov_9fa48("60095"), false);
    }
  }
  isControlPlanePublished(membershipPublication) {
    if (stryMutAct_9fa48("60096")) {
      {}
    } else {
      stryCov_9fa48("60096");
      if (stryMutAct_9fa48("60099") ? !membershipPublication && typeof membershipPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("60098") ? false : stryMutAct_9fa48("60097") ? true : (stryCov_9fa48("60097", "60098", "60099"), (stryMutAct_9fa48("60100") ? membershipPublication : (stryCov_9fa48("60100"), !membershipPublication)) || (stryMutAct_9fa48("60102") ? typeof membershipPublication === TYPEOF.OBJECT : stryMutAct_9fa48("60101") ? false : (stryCov_9fa48("60101", "60102"), typeof membershipPublication !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60103")) {
          {}
        } else {
          stryCov_9fa48("60103");
          return stryMutAct_9fa48("60104") ? false : (stryCov_9fa48("60104"), true);
        }
      }
      return stryMutAct_9fa48("60107") ? String(membershipPublication.status || '').toUpperCase() !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("60106") ? false : stryMutAct_9fa48("60105") ? true : (stryCov_9fa48("60105", "60106", "60107"), (stryMutAct_9fa48("60108") ? String(membershipPublication.status || '').toLowerCase() : (stryCov_9fa48("60108"), String(stryMutAct_9fa48("60111") ? membershipPublication.status && '' : stryMutAct_9fa48("60110") ? false : stryMutAct_9fa48("60109") ? true : (stryCov_9fa48("60109", "60110", "60111"), membershipPublication.status || (stryMutAct_9fa48("60112") ? "Stryker was here!" : (stryCov_9fa48("60112"), '')))).toUpperCase())) === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED);
    }
  }

  /**
   * Build structured reasons for non-ready dimensions.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  buildReasons(context) {
    if (stryMutAct_9fa48("60113")) {
      {}
    } else {
      stryCov_9fa48("60113");
      const reasons = stryMutAct_9fa48("60114") ? ["Stryker was here"] : (stryCov_9fa48("60114"), []);
      const dimensions = context.dimensions;
      const localQueryTransportBlocked = this.isLocalQueryTransportBlockedForNode(context.nodeId, context.nodeEvidence);
      if (stryMutAct_9fa48("60117") ? false : stryMutAct_9fa48("60116") ? true : stryMutAct_9fa48("60115") ? dimensions.processAlive : (stryCov_9fa48("60115", "60116", "60117"), !dimensions.processAlive)) {
        if (stryMutAct_9fa48("60118")) {
          {}
        } else {
          stryCov_9fa48("60118");
          reasons.push(buildReason(CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE, CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE, CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE, context.observedAt));
        }
      }
      if (stryMutAct_9fa48("60121") ? false : stryMutAct_9fa48("60120") ? true : stryMutAct_9fa48("60119") ? dimensions.clusterMemberHealthy : (stryCov_9fa48("60119", "60120", "60121"), !dimensions.clusterMemberHealthy)) {
        if (stryMutAct_9fa48("60122")) {
          {}
        } else {
          stryCov_9fa48("60122");
          reasons.push(buildReason(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY, CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY, CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE, context.observedAt, stryMutAct_9fa48("60125") ? context.nodeEvidence && this.buildNodeEvidence(context.nodeId, context.nodeRow) : stryMutAct_9fa48("60124") ? false : stryMutAct_9fa48("60123") ? true : (stryCov_9fa48("60123", "60124", "60125"), context.nodeEvidence || this.buildNodeEvidence(context.nodeId, context.nodeRow))));
        }
      }
      if (stryMutAct_9fa48("60128") ? false : stryMutAct_9fa48("60127") ? true : stryMutAct_9fa48("60126") ? dimensions.routingReady : (stryCov_9fa48("60126", "60127", "60128"), !dimensions.routingReady)) {
        if (stryMutAct_9fa48("60129")) {
          {}
        } else {
          stryCov_9fa48("60129");
          if (stryMutAct_9fa48("60131") ? false : stryMutAct_9fa48("60130") ? true : (stryCov_9fa48("60130", "60131"), localQueryTransportBlocked)) {
            if (stryMutAct_9fa48("60132")) {
              {}
            } else {
              stryCov_9fa48("60132");
              reasons.push(buildReason(CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY, CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY, CONTROL_PLANE_READINESS_OWNER.MESSAGE_ROUTER, context.observedAt, stryMutAct_9fa48("60133") ? {} : (stryCov_9fa48("60133"), {
                localQueryTransportState: stryMutAct_9fa48("60136") ? context.nodeEvidence?.localQueryTransportState && null : stryMutAct_9fa48("60135") ? false : stryMutAct_9fa48("60134") ? true : (stryCov_9fa48("60134", "60135", "60136"), (stryMutAct_9fa48("60137") ? context.nodeEvidence.localQueryTransportState : (stryCov_9fa48("60137"), context.nodeEvidence?.localQueryTransportState)) || null),
                localQueryTransportReason: stryMutAct_9fa48("60140") ? context.nodeEvidence?.localQueryTransportReason && null : stryMutAct_9fa48("60139") ? false : stryMutAct_9fa48("60138") ? true : (stryCov_9fa48("60138", "60139", "60140"), (stryMutAct_9fa48("60141") ? context.nodeEvidence.localQueryTransportReason : (stryCov_9fa48("60141"), context.nodeEvidence?.localQueryTransportReason)) || null),
                localQueryTransportRetryAfterMs: Number.isFinite(stryMutAct_9fa48("60142") ? context.nodeEvidence.localQueryTransportRetryAfterMs : (stryCov_9fa48("60142"), context.nodeEvidence?.localQueryTransportRetryAfterMs)) ? context.nodeEvidence.localQueryTransportRetryAfterMs : null
              })));
            }
          } else {
            if (stryMutAct_9fa48("60143")) {
              {}
            } else {
              stryCov_9fa48("60143");
              reasons.push(buildReason(CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY, CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY, CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE, context.observedAt));
            }
          }
        }
      }
      if (stryMutAct_9fa48("60146") ? false : stryMutAct_9fa48("60145") ? true : stryMutAct_9fa48("60144") ? dimensions.loadReady : (stryCov_9fa48("60144", "60145", "60146"), !dimensions.loadReady)) {
        if (stryMutAct_9fa48("60147")) {
          {}
        } else {
          stryCov_9fa48("60147");
          reasons.push(buildReason(CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY, CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY, CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE, context.observedAt));
        }
      }
      if (stryMutAct_9fa48("60150") ? false : stryMutAct_9fa48("60149") ? true : stryMutAct_9fa48("60148") ? dimensions.metadataPublicationHealthy : (stryCov_9fa48("60148", "60149", "60150"), !dimensions.metadataPublicationHealthy)) {
        if (stryMutAct_9fa48("60151")) {
          {}
        } else {
          stryCov_9fa48("60151");
          reasons.push(buildReason((stryMutAct_9fa48("60154") ? context.publication.currentMode !== CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY : stryMutAct_9fa48("60153") ? false : stryMutAct_9fa48("60152") ? true : (stryCov_9fa48("60152", "60153", "60154"), context.publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY)) ? CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY : CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED, CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY, CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION, context.observedAt));
        }
      }
      if (stryMutAct_9fa48("60157") ? false : stryMutAct_9fa48("60156") ? true : stryMutAct_9fa48("60155") ? dimensions.controlPlaneWritable : (stryCov_9fa48("60155", "60156", "60157"), !dimensions.controlPlaneWritable)) {
        if (stryMutAct_9fa48("60158")) {
          {}
        } else {
          stryCov_9fa48("60158");
          reasons.push(buildReason(CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE, CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE, context.observedAt));
        }
      }
      if (stryMutAct_9fa48("60161") ? false : stryMutAct_9fa48("60160") ? true : stryMutAct_9fa48("60159") ? dimensions.controlPlanePublished : (stryCov_9fa48("60159", "60160", "60161"), !dimensions.controlPlanePublished)) {
        if (stryMutAct_9fa48("60162")) {
          {}
        } else {
          stryCov_9fa48("60162");
          reasons.push(buildReason(CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED, CONTROL_PLANE_READINESS_OWNER.MEMBERSHIP_PUBLICATION, context.observedAt, stryMutAct_9fa48("60165") ? context.membershipPublication && null : stryMutAct_9fa48("60164") ? false : stryMutAct_9fa48("60163") ? true : (stryCov_9fa48("60163", "60164", "60165"), context.membershipPublication || null)));
        }
      }
      if (stryMutAct_9fa48("60168") ? false : stryMutAct_9fa48("60167") ? true : stryMutAct_9fa48("60166") ? this.isCapacityPlacementEligible(context.capacity) : (stryCov_9fa48("60166", "60167", "60168"), !this.isCapacityPlacementEligible(context.capacity))) {
        if (stryMutAct_9fa48("60169")) {
          {}
        } else {
          stryCov_9fa48("60169");
          const code = this.getCapacityReasonCode(context.capacity);
          if (stryMutAct_9fa48("60171") ? false : stryMutAct_9fa48("60170") ? true : (stryCov_9fa48("60170", "60171"), code)) {
            if (stryMutAct_9fa48("60172")) {
              {}
            } else {
              stryCov_9fa48("60172");
              reasons.push(buildReason(code, CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE, CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING, context.observedAt));
            }
          }
        }
      }
      return Object.freeze(reasons);
    }
  }

  /**
   * Return whether one node remains eligible for routed control-plane reads
   * given locally observable query/data-plane transport evidence.
   * Only the self node has direct local transport evidence.
   * @param {string} nodeId
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  isLocalQueryTransportRoutableForNode(nodeId, nodeEvidence = null) {
    if (stryMutAct_9fa48("60173")) {
      {}
    } else {
      stryCov_9fa48("60173");
      if (stryMutAct_9fa48("60176") ? nodeId === this.nodeId : stryMutAct_9fa48("60175") ? false : stryMutAct_9fa48("60174") ? true : (stryCov_9fa48("60174", "60175", "60176"), nodeId !== this.nodeId)) {
        if (stryMutAct_9fa48("60177")) {
          {}
        } else {
          stryCov_9fa48("60177");
          return stryMutAct_9fa48("60178") ? false : (stryCov_9fa48("60178"), true);
        }
      }
      return stryMutAct_9fa48("60181") ? nodeEvidence?.localQueryTransportReady === false : stryMutAct_9fa48("60180") ? false : stryMutAct_9fa48("60179") ? true : (stryCov_9fa48("60179", "60180", "60181"), (stryMutAct_9fa48("60182") ? nodeEvidence.localQueryTransportReady : (stryCov_9fa48("60182"), nodeEvidence?.localQueryTransportReady)) !== (stryMutAct_9fa48("60183") ? true : (stryCov_9fa48("60183"), false)));
    }
  }

  /**
   * Return true when one node's routed-read eligibility is blocked by the
   * canonical local query/data-plane transport owner.
   * @param {string} nodeId
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  isLocalQueryTransportBlockedForNode(nodeId, nodeEvidence = null) {
    if (stryMutAct_9fa48("60184")) {
      {}
    } else {
      stryCov_9fa48("60184");
      return stryMutAct_9fa48("60187") ? nodeId === this.nodeId || nodeEvidence?.localQueryTransportReady === false : stryMutAct_9fa48("60186") ? false : stryMutAct_9fa48("60185") ? true : (stryCov_9fa48("60185", "60186", "60187"), (stryMutAct_9fa48("60189") ? nodeId !== this.nodeId : stryMutAct_9fa48("60188") ? true : (stryCov_9fa48("60188", "60189"), nodeId === this.nodeId)) && (stryMutAct_9fa48("60191") ? nodeEvidence?.localQueryTransportReady !== false : stryMutAct_9fa48("60190") ? true : (stryCov_9fa48("60190", "60191"), (stryMutAct_9fa48("60192") ? nodeEvidence.localQueryTransportReady : (stryCov_9fa48("60192"), nodeEvidence?.localQueryTransportReady)) === (stryMutAct_9fa48("60193") ? true : (stryCov_9fa48("60193"), false)))));
    }
  }

  /**
   * Build readiness for a missing node row.
   * @param {string} nodeId
   * @param {string} observedAt
   * @param {Object} publication
   * @return {Object}
   * @private
   */
  buildMissingNodeReadiness(nodeId, observedAt, publication, membershipPublication = null) {
    if (stryMutAct_9fa48("60194")) {
      {}
    } else {
      stryCov_9fa48("60194");
      const dimensions = Object.freeze(stryMutAct_9fa48("60195") ? {} : (stryCov_9fa48("60195"), {
        [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: stryMutAct_9fa48("60196") ? true : (stryCov_9fa48("60196"), false),
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: stryMutAct_9fa48("60197") ? true : (stryCov_9fa48("60197"), false),
        [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: stryMutAct_9fa48("60198") ? true : (stryCov_9fa48("60198"), false),
        [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: stryMutAct_9fa48("60199") ? true : (stryCov_9fa48("60199"), false),
        [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: stryMutAct_9fa48("60200") ? true : (stryCov_9fa48("60200"), false),
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: stryMutAct_9fa48("60201") ? true : (stryCov_9fa48("60201"), false),
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: this.isControlPlanePublished(membershipPublication),
        [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: stryMutAct_9fa48("60204") ? publication.currentMode !== CONTROL_PLANE_PUBLICATION_MODE.GROUPED : stryMutAct_9fa48("60203") ? false : stryMutAct_9fa48("60202") ? true : (stryCov_9fa48("60202", "60203", "60204"), publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED),
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: stryMutAct_9fa48("60205") ? true : (stryCov_9fa48("60205"), false),
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: stryMutAct_9fa48("60206") ? true : (stryCov_9fa48("60206"), false)
      }));
      const reasons = Object.freeze(stryMutAct_9fa48("60207") ? [] : (stryCov_9fa48("60207"), [buildReason(CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING, CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE, CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE, observedAt)]));
      return createEligibilitySnapshot(stryMutAct_9fa48("60208") ? {} : (stryCov_9fa48("60208"), {
        nodeId,
        lifecycleState: null,
        publication,
        membershipPublication,
        capacity: null,
        nodeEvidence: null,
        observedAt,
        dimensions,
        reasons
      }));
    }
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (stryMutAct_9fa48("60209")) {
      {}
    } else {
      stryCov_9fa48("60209");
      if (stryMutAct_9fa48("60211") ? false : stryMutAct_9fa48("60210") ? true : (stryCov_9fa48("60210", "60211"), this.authoritativeControlPlaneView)) {
        if (stryMutAct_9fa48("60212")) {
          {}
        } else {
          stryCov_9fa48("60212");
          return this.authoritativeControlPlaneView;
        }
      }
      if (stryMutAct_9fa48("60215") ? false : stryMutAct_9fa48("60214") ? true : stryMutAct_9fa48("60213") ? this.cdcIntegrationService : (stryCov_9fa48("60213", "60214", "60215"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("60216")) {
          {}
        } else {
          stryCov_9fa48("60216");
          return null;
        }
      }
      this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView(stryMutAct_9fa48("60217") ? {} : (stryCov_9fa48("60217"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        messageRouter: this.messageRouter,
        now: this.now,
        queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs
      }));
      return this.authoritativeControlPlaneView;
    }
  }

  /**
   * Build node-row liveness evidence used by readiness diagnostics.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @return {Object|null}
   * @private
   */
  buildNodeEvidence(nodeId, nodeRow) {
    if (stryMutAct_9fa48("60218")) {
      {}
    } else {
      stryCov_9fa48("60218");
      if (stryMutAct_9fa48("60221") ? !nodeRow && typeof nodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("60220") ? false : stryMutAct_9fa48("60219") ? true : (stryCov_9fa48("60219", "60220", "60221"), (stryMutAct_9fa48("60222") ? nodeRow : (stryCov_9fa48("60222"), !nodeRow)) || (stryMutAct_9fa48("60224") ? typeof nodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("60223") ? false : (stryCov_9fa48("60223", "60224"), typeof nodeRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60225")) {
          {}
        } else {
          stryCov_9fa48("60225");
          return null;
        }
      }
      return this.buildClusterMemberHealthDetails(nodeId, nodeRow);
    }
  }

  /**
   * Record one readiness transition when repair/serve eligibility flips.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  recordReadinessTransition(context) {
    if (stryMutAct_9fa48("60226")) {
      {}
    } else {
      stryCov_9fa48("60226");
      const currentState = this.buildReadinessTransitionState(context);
      const previousState = stryMutAct_9fa48("60229") ? this.lastReadinessEvaluationByNodeId.get(context.nodeId) && null : stryMutAct_9fa48("60228") ? false : stryMutAct_9fa48("60227") ? true : (stryCov_9fa48("60227", "60228", "60229"), this.lastReadinessEvaluationByNodeId.get(context.nodeId) || null);
      this.lastReadinessEvaluationByNodeId.set(context.nodeId, currentState);
      if (stryMutAct_9fa48("60232") ? false : stryMutAct_9fa48("60231") ? true : stryMutAct_9fa48("60230") ? previousState : (stryCov_9fa48("60230", "60231", "60232"), !previousState)) {
        if (stryMutAct_9fa48("60233")) {
          {}
        } else {
          stryCov_9fa48("60233");
          return this.getReadinessTransitionHistory(context.nodeId);
        }
      }
      const flippedDimensions = stryMutAct_9fa48("60234") ? ["Stryker was here"] : (stryCov_9fa48("60234"), []);
      if (stryMutAct_9fa48("60237") ? previousState.serveEligible === currentState.serveEligible : stryMutAct_9fa48("60236") ? false : stryMutAct_9fa48("60235") ? true : (stryCov_9fa48("60235", "60236", "60237"), previousState.serveEligible !== currentState.serveEligible)) {
        if (stryMutAct_9fa48("60238")) {
          {}
        } else {
          stryCov_9fa48("60238");
          flippedDimensions.push(CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE);
        }
      }
      if (stryMutAct_9fa48("60241") ? previousState.repairEligible === currentState.repairEligible : stryMutAct_9fa48("60240") ? false : stryMutAct_9fa48("60239") ? true : (stryCov_9fa48("60239", "60240", "60241"), previousState.repairEligible !== currentState.repairEligible)) {
        if (stryMutAct_9fa48("60242")) {
          {}
        } else {
          stryCov_9fa48("60242");
          flippedDimensions.push(CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE);
        }
      }
      if (stryMutAct_9fa48("60245") ? flippedDimensions.length !== NUM.ZERO : stryMutAct_9fa48("60244") ? false : stryMutAct_9fa48("60243") ? true : (stryCov_9fa48("60243", "60244", "60245"), flippedDimensions.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("60246")) {
          {}
        } else {
          stryCov_9fa48("60246");
          return this.getReadinessTransitionHistory(context.nodeId);
        }
      }
      const entry = Object.freeze(stryMutAct_9fa48("60247") ? {} : (stryCov_9fa48("60247"), {
        nodeId: context.nodeId,
        observedAt: currentState.observedAt,
        observedAtMs: currentState.observedAtMs,
        previousServeEligible: previousState.serveEligible,
        serveEligible: currentState.serveEligible,
        previousRepairEligible: previousState.repairEligible,
        repairEligible: currentState.repairEligible,
        previousReasonCodes: Object.freeze(stryMutAct_9fa48("60248") ? [] : (stryCov_9fa48("60248"), [...previousState.reasonCodes])),
        reasonCodes: Object.freeze(stryMutAct_9fa48("60249") ? [] : (stryCov_9fa48("60249"), [...currentState.reasonCodes])),
        flippedDimensions: Object.freeze(flippedDimensions),
        rawInputs: Object.freeze(stryMutAct_9fa48("60250") ? {} : (stryCov_9fa48("60250"), {
          ...currentState.rawInputs
        }))
      }));
      const history = stryMutAct_9fa48("60253") ? this.readinessTransitionHistoryByNodeId.get(context.nodeId) && [] : stryMutAct_9fa48("60252") ? false : stryMutAct_9fa48("60251") ? true : (stryCov_9fa48("60251", "60252", "60253"), this.readinessTransitionHistoryByNodeId.get(context.nodeId) || (stryMutAct_9fa48("60254") ? ["Stryker was here"] : (stryCov_9fa48("60254"), [])));
      const nextHistory = stryMutAct_9fa48("60255") ? [] : (stryCov_9fa48("60255"), [...history, entry]);
      while (stryMutAct_9fa48("60258") ? nextHistory.length <= this.readinessTransitionHistoryLimit : stryMutAct_9fa48("60257") ? nextHistory.length >= this.readinessTransitionHistoryLimit : stryMutAct_9fa48("60256") ? false : (stryCov_9fa48("60256", "60257", "60258"), nextHistory.length > this.readinessTransitionHistoryLimit)) {
        if (stryMutAct_9fa48("60259")) {
          {}
        } else {
          stryCov_9fa48("60259");
          nextHistory.shift();
        }
      }
      this.readinessTransitionHistoryByNodeId.set(context.nodeId, nextHistory);
      return this.getReadinessTransitionHistory(context.nodeId);
    }
  }

  /**
   * Return one defensive copy of readiness transition history.
   * @param {string} nodeId
   * @return {Object[]}
   */
  getReadinessTransitionHistory(nodeId) {
    if (stryMutAct_9fa48("60260")) {
      {}
    } else {
      stryCov_9fa48("60260");
      const history = this.readinessTransitionHistoryByNodeId.get(nodeId);
      if (stryMutAct_9fa48("60263") ? !Array.isArray(history) && history.length === NUM.ZERO : stryMutAct_9fa48("60262") ? false : stryMutAct_9fa48("60261") ? true : (stryCov_9fa48("60261", "60262", "60263"), (stryMutAct_9fa48("60264") ? Array.isArray(history) : (stryCov_9fa48("60264"), !Array.isArray(history))) || (stryMutAct_9fa48("60266") ? history.length !== NUM.ZERO : stryMutAct_9fa48("60265") ? false : (stryCov_9fa48("60265", "60266"), history.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("60267")) {
          {}
        } else {
          stryCov_9fa48("60267");
          return Object.freeze(stryMutAct_9fa48("60268") ? ["Stryker was here"] : (stryCov_9fa48("60268"), []));
        }
      }
      return Object.freeze(history.map(stryMutAct_9fa48("60269") ? () => undefined : (stryCov_9fa48("60269"), entry => Object.freeze(stryMutAct_9fa48("60270") ? {} : (stryCov_9fa48("60270"), {
        ...entry,
        previousReasonCodes: Array.isArray(entry.previousReasonCodes) ? Object.freeze(stryMutAct_9fa48("60271") ? [] : (stryCov_9fa48("60271"), [...entry.previousReasonCodes])) : Object.freeze(stryMutAct_9fa48("60272") ? ["Stryker was here"] : (stryCov_9fa48("60272"), [])),
        reasonCodes: Array.isArray(entry.reasonCodes) ? Object.freeze(stryMutAct_9fa48("60273") ? [] : (stryCov_9fa48("60273"), [...entry.reasonCodes])) : Object.freeze(stryMutAct_9fa48("60274") ? ["Stryker was here"] : (stryCov_9fa48("60274"), [])),
        flippedDimensions: Array.isArray(entry.flippedDimensions) ? Object.freeze(stryMutAct_9fa48("60275") ? [] : (stryCov_9fa48("60275"), [...entry.flippedDimensions])) : Object.freeze(stryMutAct_9fa48("60276") ? ["Stryker was here"] : (stryCov_9fa48("60276"), [])),
        rawInputs: (stryMutAct_9fa48("60279") ? entry.rawInputs || typeof entry.rawInputs === TYPEOF.OBJECT : stryMutAct_9fa48("60278") ? false : stryMutAct_9fa48("60277") ? true : (stryCov_9fa48("60277", "60278", "60279"), entry.rawInputs && (stryMutAct_9fa48("60281") ? typeof entry.rawInputs !== TYPEOF.OBJECT : stryMutAct_9fa48("60280") ? true : (stryCov_9fa48("60280", "60281"), typeof entry.rawInputs === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("60282") ? {} : (stryCov_9fa48("60282"), {
          ...entry.rawInputs
        })) : Object.freeze({})
      })))));
    }
  }

  /**
   * Return transition history for every tracked node.
   * @return {Object}
   */
  getReadinessTransitionHistoryByNodeId() {
    if (stryMutAct_9fa48("60283")) {
      {}
    } else {
      stryCov_9fa48("60283");
      const entries = {};
      for (const nodeId of this.readinessTransitionHistoryByNodeId.keys()) {
        if (stryMutAct_9fa48("60284")) {
          {}
        } else {
          stryCov_9fa48("60284");
          entries[nodeId] = this.getReadinessTransitionHistory(nodeId);
        }
      }
      return Object.freeze(entries);
    }
  }

  /**
   * Normalize one readiness state for transition tracking.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildReadinessTransitionState(context) {
    if (stryMutAct_9fa48("60285")) {
      {}
    } else {
      stryCov_9fa48("60285");
      const observedAtMs = this.now();
      const observedAt = (stryMutAct_9fa48("60288") ? typeof context.observedAt === TYPEOF.STRING || context.observedAt.length > NUM.ZERO : stryMutAct_9fa48("60287") ? false : stryMutAct_9fa48("60286") ? true : (stryCov_9fa48("60286", "60287", "60288"), (stryMutAct_9fa48("60290") ? typeof context.observedAt !== TYPEOF.STRING : stryMutAct_9fa48("60289") ? true : (stryCov_9fa48("60289", "60290"), typeof context.observedAt === TYPEOF.STRING)) && (stryMutAct_9fa48("60293") ? context.observedAt.length <= NUM.ZERO : stryMutAct_9fa48("60292") ? context.observedAt.length >= NUM.ZERO : stryMutAct_9fa48("60291") ? true : (stryCov_9fa48("60291", "60292", "60293"), context.observedAt.length > NUM.ZERO)))) ? context.observedAt : normalizeIsoTimestamp(observedAtMs);
      const reasonCodes = Array.isArray(context.reasons) ? stryMutAct_9fa48("60294") ? [...new Set(context.reasons.map(reason => String(reason?.code || '')).filter(Boolean))] : (stryCov_9fa48("60294"), (stryMutAct_9fa48("60295") ? [] : (stryCov_9fa48("60295"), [...new Set(stryMutAct_9fa48("60296") ? context.reasons.map(reason => String(reason?.code || '')) : (stryCov_9fa48("60296"), context.reasons.map(stryMutAct_9fa48("60297") ? () => undefined : (stryCov_9fa48("60297"), reason => String(stryMutAct_9fa48("60300") ? reason?.code && '' : stryMutAct_9fa48("60299") ? false : stryMutAct_9fa48("60298") ? true : (stryCov_9fa48("60298", "60299", "60300"), (stryMutAct_9fa48("60301") ? reason.code : (stryCov_9fa48("60301"), reason?.code)) || (stryMutAct_9fa48("60302") ? "Stryker was here!" : (stryCov_9fa48("60302"), '')))))).filter(Boolean)))])).sort()) : stryMutAct_9fa48("60303") ? ["Stryker was here"] : (stryCov_9fa48("60303"), []);
      const nodeEvidence = (stryMutAct_9fa48("60306") ? context.nodeEvidence || typeof context.nodeEvidence === TYPEOF.OBJECT : stryMutAct_9fa48("60305") ? false : stryMutAct_9fa48("60304") ? true : (stryCov_9fa48("60304", "60305", "60306"), context.nodeEvidence && (stryMutAct_9fa48("60308") ? typeof context.nodeEvidence !== TYPEOF.OBJECT : stryMutAct_9fa48("60307") ? true : (stryCov_9fa48("60307", "60308"), typeof context.nodeEvidence === TYPEOF.OBJECT)))) ? context.nodeEvidence : {};
      const dimensions = (stryMutAct_9fa48("60311") ? context.dimensions || typeof context.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("60310") ? false : stryMutAct_9fa48("60309") ? true : (stryCov_9fa48("60309", "60310", "60311"), context.dimensions && (stryMutAct_9fa48("60313") ? typeof context.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("60312") ? true : (stryCov_9fa48("60312", "60313"), typeof context.dimensions === TYPEOF.OBJECT)))) ? context.dimensions : {};
      const publication = (stryMutAct_9fa48("60316") ? context.publication || typeof context.publication === TYPEOF.OBJECT : stryMutAct_9fa48("60315") ? false : stryMutAct_9fa48("60314") ? true : (stryCov_9fa48("60314", "60315", "60316"), context.publication && (stryMutAct_9fa48("60318") ? typeof context.publication !== TYPEOF.OBJECT : stryMutAct_9fa48("60317") ? true : (stryCov_9fa48("60317", "60318"), typeof context.publication === TYPEOF.OBJECT)))) ? context.publication : {};
      const priorityControlPlaneRecovery = (stryMutAct_9fa48("60321") ? context.priorityControlPlaneRecovery || typeof context.priorityControlPlaneRecovery === TYPEOF.OBJECT : stryMutAct_9fa48("60320") ? false : stryMutAct_9fa48("60319") ? true : (stryCov_9fa48("60319", "60320", "60321"), context.priorityControlPlaneRecovery && (stryMutAct_9fa48("60323") ? typeof context.priorityControlPlaneRecovery !== TYPEOF.OBJECT : stryMutAct_9fa48("60322") ? true : (stryCov_9fa48("60322", "60323"), typeof context.priorityControlPlaneRecovery === TYPEOF.OBJECT)))) ? context.priorityControlPlaneRecovery : {};
      return Object.freeze(stryMutAct_9fa48("60324") ? {} : (stryCov_9fa48("60324"), {
        observedAt,
        observedAtMs,
        serveEligible: stryMutAct_9fa48("60327") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== true : stryMutAct_9fa48("60326") ? false : stryMutAct_9fa48("60325") ? true : (stryCov_9fa48("60325", "60326", "60327"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === (stryMutAct_9fa48("60328") ? false : (stryCov_9fa48("60328"), true))),
        repairEligible: stryMutAct_9fa48("60331") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true : stryMutAct_9fa48("60330") ? false : stryMutAct_9fa48("60329") ? true : (stryCov_9fa48("60329", "60330", "60331"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === (stryMutAct_9fa48("60332") ? false : (stryCov_9fa48("60332"), true))),
        reasonCodes: Object.freeze(reasonCodes),
        rawInputs: Object.freeze(stryMutAct_9fa48("60333") ? {} : (stryCov_9fa48("60333"), {
          lastHeartbeat: Number.isFinite(nodeEvidence.lastHeartbeat) ? nodeEvidence.lastHeartbeat : null,
          heartbeatAgeMs: Number.isFinite(nodeEvidence.heartbeatAgeMs) ? nodeEvidence.heartbeatAgeMs : null,
          readyLeaseExpiresAt: Number.isFinite(nodeEvidence.readyLeaseExpiresAt) ? nodeEvidence.readyLeaseExpiresAt : null,
          readyLeaseLagMs: Number.isFinite(nodeEvidence.readyLeaseAgeMs) ? nodeEvidence.readyLeaseAgeMs : null,
          staleHeartbeatLimitMs: Number.isFinite(nodeEvidence.staleHeartbeatLimitMs) ? nodeEvidence.staleHeartbeatLimitMs : null,
          controlPlaneWritable: stryMutAct_9fa48("60336") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== true : stryMutAct_9fa48("60335") ? false : stryMutAct_9fa48("60334") ? true : (stryCov_9fa48("60334", "60335", "60336"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === (stryMutAct_9fa48("60337") ? false : (stryCov_9fa48("60337"), true))),
          controlPlanePublished: stryMutAct_9fa48("60340") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] !== true : stryMutAct_9fa48("60339") ? false : stryMutAct_9fa48("60338") ? true : (stryCov_9fa48("60338", "60339", "60340"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === (stryMutAct_9fa48("60341") ? false : (stryCov_9fa48("60341"), true))),
          routingReady: stryMutAct_9fa48("60344") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true : stryMutAct_9fa48("60343") ? false : stryMutAct_9fa48("60342") ? true : (stryCov_9fa48("60342", "60343", "60344"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] === (stryMutAct_9fa48("60345") ? false : (stryCov_9fa48("60345"), true))),
          loadReady: stryMutAct_9fa48("60348") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== true : stryMutAct_9fa48("60347") ? false : stryMutAct_9fa48("60346") ? true : (stryCov_9fa48("60346", "60347", "60348"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] === (stryMutAct_9fa48("60349") ? false : (stryCov_9fa48("60349"), true))),
          clusterMemberHealthy: stryMutAct_9fa48("60352") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] !== true : stryMutAct_9fa48("60351") ? false : stryMutAct_9fa48("60350") ? true : (stryCov_9fa48("60350", "60351", "60352"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === (stryMutAct_9fa48("60353") ? false : (stryCov_9fa48("60353"), true))),
          metadataPublicationHealthy: stryMutAct_9fa48("60356") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] !== true : stryMutAct_9fa48("60355") ? false : stryMutAct_9fa48("60354") ? true : (stryCov_9fa48("60354", "60355", "60356"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] === (stryMutAct_9fa48("60357") ? false : (stryCov_9fa48("60357"), true))),
          localQueryTransportState: (stryMutAct_9fa48("60360") ? typeof nodeEvidence.localQueryTransportState !== TYPEOF.STRING : stryMutAct_9fa48("60359") ? false : stryMutAct_9fa48("60358") ? true : (stryCov_9fa48("60358", "60359", "60360"), typeof nodeEvidence.localQueryTransportState === TYPEOF.STRING)) ? nodeEvidence.localQueryTransportState : null,
          localQueryTransportReady: (stryMutAct_9fa48("60363") ? typeof nodeEvidence.localQueryTransportReady !== 'boolean' : stryMutAct_9fa48("60362") ? false : stryMutAct_9fa48("60361") ? true : (stryCov_9fa48("60361", "60362", "60363"), typeof nodeEvidence.localQueryTransportReady === (stryMutAct_9fa48("60364") ? "" : (stryCov_9fa48("60364"), 'boolean')))) ? nodeEvidence.localQueryTransportReady : null,
          localQueryTransportReason: (stryMutAct_9fa48("60367") ? typeof nodeEvidence.localQueryTransportReason !== TYPEOF.STRING : stryMutAct_9fa48("60366") ? false : stryMutAct_9fa48("60365") ? true : (stryCov_9fa48("60365", "60366", "60367"), typeof nodeEvidence.localQueryTransportReason === TYPEOF.STRING)) ? nodeEvidence.localQueryTransportReason : null,
          localQueryTransportRetryAfterMs: Number.isFinite(nodeEvidence.localQueryTransportRetryAfterMs) ? nodeEvidence.localQueryTransportRetryAfterMs : null,
          publicationMode: (stryMutAct_9fa48("60370") ? typeof publication.currentMode !== TYPEOF.STRING : stryMutAct_9fa48("60369") ? false : stryMutAct_9fa48("60368") ? true : (stryCov_9fa48("60368", "60369", "60370"), typeof publication.currentMode === TYPEOF.STRING)) ? publication.currentMode : null,
          publicationReasonCode: (stryMutAct_9fa48("60373") ? typeof publication.reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("60372") ? false : stryMutAct_9fa48("60371") ? true : (stryCov_9fa48("60371", "60372", "60373"), typeof publication.reasonCode === TYPEOF.STRING)) ? publication.reasonCode : null,
          membershipPublicationStatus: (stryMutAct_9fa48("60376") ? typeof context.membershipPublication?.status !== TYPEOF.STRING : stryMutAct_9fa48("60375") ? false : stryMutAct_9fa48("60374") ? true : (stryCov_9fa48("60374", "60375", "60376"), typeof (stryMutAct_9fa48("60377") ? context.membershipPublication.status : (stryCov_9fa48("60377"), context.membershipPublication?.status)) === TYPEOF.STRING)) ? context.membershipPublication.status : null,
          priorityControlPlaneRecoveryActive: stryMutAct_9fa48("60380") ? priorityControlPlaneRecovery.active !== true : stryMutAct_9fa48("60379") ? false : stryMutAct_9fa48("60378") ? true : (stryCov_9fa48("60378", "60379", "60380"), priorityControlPlaneRecovery.active === (stryMutAct_9fa48("60381") ? false : (stryCov_9fa48("60381"), true))),
          priorityControlPlaneRecoveryReasonCodes: Array.isArray(priorityControlPlaneRecovery.reasonCodes) ? Object.freeze(stryMutAct_9fa48("60382") ? [] : (stryCov_9fa48("60382"), [...priorityControlPlaneRecovery.reasonCodes])) : Object.freeze(stryMutAct_9fa48("60383") ? ["Stryker was here"] : (stryCov_9fa48("60383"), []))
        }))
      }));
    }
  }
  async getMembershipPublicationDiagnostics(nodeId, observedAt, readOptions = {}) {
    if (stryMutAct_9fa48("60384")) {
      {}
    } else {
      stryCov_9fa48("60384");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("60387") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("60386") ? false : stryMutAct_9fa48("60385") ? true : (stryCov_9fa48("60385", "60386", "60387"), (stryMutAct_9fa48("60388") ? service : (stryCov_9fa48("60388"), !service)) || (stryMutAct_9fa48("60390") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("60389") ? false : (stryCov_9fa48("60389", "60390"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60391")) {
          {}
        } else {
          stryCov_9fa48("60391");
          return null;
        }
      }
      const normalizedReadOptions = resolveMembershipPublicationReadOptions(stryMutAct_9fa48("60392") ? {} : (stryCov_9fa48("60392"), {
        lane: resolveMembershipPublicationReadLane(stryMutAct_9fa48("60393") ? readOptions.lane : (stryCov_9fa48("60393"), readOptions?.lane)),
        queryTimeoutMs: (stryMutAct_9fa48("60396") ? Number.isFinite(readOptions?.queryTimeoutMs) || readOptions.queryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("60395") ? false : stryMutAct_9fa48("60394") ? true : (stryCov_9fa48("60394", "60395", "60396"), Number.isFinite(stryMutAct_9fa48("60397") ? readOptions.queryTimeoutMs : (stryCov_9fa48("60397"), readOptions?.queryTimeoutMs)) && (stryMutAct_9fa48("60400") ? readOptions.queryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("60399") ? readOptions.queryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("60398") ? true : (stryCov_9fa48("60398", "60399", "60400"), readOptions.queryTimeoutMs > NUM.ZERO)))) ? readOptions.queryTimeoutMs : this.membershipPublicationDiagnosticsQueryTimeoutMs
      }));
      let row = null;
      if (stryMutAct_9fa48("60403") ? typeof service.getLatestPublicationForNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("60402") ? false : stryMutAct_9fa48("60401") ? true : (stryCov_9fa48("60401", "60402", "60403"), typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("60404")) {
          {}
        } else {
          stryCov_9fa48("60404");
          row = await service.getLatestPublicationForNode(nodeId, normalizedReadOptions);
        }
      } else if (stryMutAct_9fa48("60407") ? typeof service.getLatestClusterPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("60406") ? false : stryMutAct_9fa48("60405") ? true : (stryCov_9fa48("60405", "60406", "60407"), typeof service.getLatestClusterPublication === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("60408")) {
          {}
        } else {
          stryCov_9fa48("60408");
          row = await service.getLatestClusterPublication(normalizedReadOptions);
        }
      }
      return this.buildMembershipPublicationDiagnostics(row, observedAt);
    }
  }
  getMembershipPublicationDiagnosticsSync(nodeId, observedAt, readOptions = {}) {
    if (stryMutAct_9fa48("60409")) {
      {}
    } else {
      stryCov_9fa48("60409");
      const row = this.getLatestMembershipPublicationRowSync(nodeId, readOptions);
      return this.buildMembershipPublicationDiagnostics(row, observedAt);
    }
  }
  async getMembershipPublicationPlanningSnapshot(nodeId, observedAt) {
    if (stryMutAct_9fa48("60410")) {
      {}
    } else {
      stryCov_9fa48("60410");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("60413") ? service || typeof service.deriveClusterMembershipCandidate === TYPEOF.FUNCTION : stryMutAct_9fa48("60412") ? false : stryMutAct_9fa48("60411") ? true : (stryCov_9fa48("60411", "60412", "60413"), service && (stryMutAct_9fa48("60415") ? typeof service.deriveClusterMembershipCandidate !== TYPEOF.FUNCTION : stryMutAct_9fa48("60414") ? true : (stryCov_9fa48("60414", "60415"), typeof service.deriveClusterMembershipCandidate === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("60416")) {
          {}
        } else {
          stryCov_9fa48("60416");
          const candidate = await service.deriveClusterMembershipCandidate(stryMutAct_9fa48("60417") ? {} : (stryCov_9fa48("60417"), {
            disableNestedPriorityRecoveryPlanning: stryMutAct_9fa48("60418") ? false : (stryCov_9fa48("60418"), true),
            publisherNodeId: stryMutAct_9fa48("60421") ? nodeId && this.nodeId : stryMutAct_9fa48("60420") ? false : stryMutAct_9fa48("60419") ? true : (stryCov_9fa48("60419", "60420", "60421"), nodeId || this.nodeId),
            nowMs: observedAt
          }));
          if (stryMutAct_9fa48("60424") ? candidate || typeof candidate === TYPEOF.OBJECT : stryMutAct_9fa48("60423") ? false : stryMutAct_9fa48("60422") ? true : (stryCov_9fa48("60422", "60423", "60424"), candidate && (stryMutAct_9fa48("60426") ? typeof candidate !== TYPEOF.OBJECT : stryMutAct_9fa48("60425") ? true : (stryCov_9fa48("60425", "60426"), typeof candidate === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("60427")) {
              {}
            } else {
              stryCov_9fa48("60427");
              return candidate;
            }
          }
        }
      }
      const membershipPublication = await this.getMembershipPublicationDiagnostics(nodeId, observedAt, stryMutAct_9fa48("60428") ? {} : (stryCov_9fa48("60428"), {
        lane: MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING,
        scope: MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER
      }));
      return this.buildMembershipPublicationPlanningSnapshot(stryMutAct_9fa48("60429") ? {} : (stryCov_9fa48("60429"), {
        nodeId,
        observedAt,
        membershipPublication
      }));
    }
  }
  getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt) {
    if (stryMutAct_9fa48("60430")) {
      {}
    } else {
      stryCov_9fa48("60430");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("60433") ? service || typeof service.deriveClusterMembershipCandidateSync === TYPEOF.FUNCTION : stryMutAct_9fa48("60432") ? false : stryMutAct_9fa48("60431") ? true : (stryCov_9fa48("60431", "60432", "60433"), service && (stryMutAct_9fa48("60435") ? typeof service.deriveClusterMembershipCandidateSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("60434") ? true : (stryCov_9fa48("60434", "60435"), typeof service.deriveClusterMembershipCandidateSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("60436")) {
          {}
        } else {
          stryCov_9fa48("60436");
          const candidate = service.deriveClusterMembershipCandidateSync(stryMutAct_9fa48("60437") ? {} : (stryCov_9fa48("60437"), {
            disableNestedPriorityRecoveryPlanning: stryMutAct_9fa48("60438") ? false : (stryCov_9fa48("60438"), true),
            publisherNodeId: stryMutAct_9fa48("60441") ? nodeId && this.nodeId : stryMutAct_9fa48("60440") ? false : stryMutAct_9fa48("60439") ? true : (stryCov_9fa48("60439", "60440", "60441"), nodeId || this.nodeId),
            nowMs: observedAt
          }));
          if (stryMutAct_9fa48("60444") ? candidate || typeof candidate === TYPEOF.OBJECT : stryMutAct_9fa48("60443") ? false : stryMutAct_9fa48("60442") ? true : (stryCov_9fa48("60442", "60443", "60444"), candidate && (stryMutAct_9fa48("60446") ? typeof candidate !== TYPEOF.OBJECT : stryMutAct_9fa48("60445") ? true : (stryCov_9fa48("60445", "60446"), typeof candidate === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("60447")) {
              {}
            } else {
              stryCov_9fa48("60447");
              return candidate;
            }
          }
        }
      }
      const membershipPublication = this.getMembershipPublicationDiagnosticsSync(nodeId, observedAt, stryMutAct_9fa48("60448") ? {} : (stryCov_9fa48("60448"), {
        lane: MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING,
        scope: MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER
      }));
      return this.buildMembershipPublicationPlanningSnapshot(stryMutAct_9fa48("60449") ? {} : (stryCov_9fa48("60449"), {
        nodeId,
        observedAt,
        membershipPublication
      }));
    }
  }

  /**
   * Canonical synchronous priority-recovery planning snapshot.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Object|null}
   */
  getPriorityRecoveryPlanningSnapshotSync(nodeId, observedAt) {
    if (stryMutAct_9fa48("60450")) {
      {}
    } else {
      stryCov_9fa48("60450");
      return this.getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt);
    }
  }

  /**
   * Return one synchronous owner answer for membership-publication planning.
   * This remains distinct from the async/best-effort surface so sync callers
   * never reconstruct planning state from diagnostics locally.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Object|null}
   */
  getMembershipPublicationPlanningAnswerSync(nodeId, observedAt) {
    if (stryMutAct_9fa48("60451")) {
      {}
    } else {
      stryCov_9fa48("60451");
      return this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt);
    }
  }

  /**
   * Canonical synchronous priority-recovery planning answer.
   * Sync callers must use this surface and must not locally reconstruct
   * planning truth from fallback diagnostics.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Object|null}
   */
  getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt) {
    if (stryMutAct_9fa48("60452")) {
      {}
    } else {
      stryCov_9fa48("60452");
      return this.getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt);
    }
  }

  /**
   * Return the best current planning snapshot for callers that may benefit from
   * one bounded async freshness attempt but still need a deterministic fallback.
   *
   * The sync/async split remains explicit because the async diagnostics lane
   * may request best-effort freshness while sync callers preserve deterministic,
   * non-repairing behavior.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Promise<Object|null>}
   */
  async getMembershipPublicationPlanningSnapshotBestEffort(nodeId, observedAt) {
    if (stryMutAct_9fa48("60453")) {
      {}
    } else {
      stryCov_9fa48("60453");
      const syncSnapshot = this.getMembershipPublicationPlanningAnswerSync(nodeId, observedAt);
      const timeoutMs = this.membershipPublicationPlanningSnapshotRefreshTimeoutMs;
      if (stryMutAct_9fa48("60456") ? !Number.isFinite(timeoutMs) && timeoutMs <= NUM.ZERO : stryMutAct_9fa48("60455") ? false : stryMutAct_9fa48("60454") ? true : (stryCov_9fa48("60454", "60455", "60456"), (stryMutAct_9fa48("60457") ? Number.isFinite(timeoutMs) : (stryCov_9fa48("60457"), !Number.isFinite(timeoutMs))) || (stryMutAct_9fa48("60460") ? timeoutMs > NUM.ZERO : stryMutAct_9fa48("60459") ? timeoutMs < NUM.ZERO : stryMutAct_9fa48("60458") ? false : (stryCov_9fa48("60458", "60459", "60460"), timeoutMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("60461")) {
          {}
        } else {
          stryCov_9fa48("60461");
          const asyncSnapshot = await this.getMembershipPublicationPlanningSnapshot(nodeId, observedAt);
          return stryMutAct_9fa48("60464") ? asyncSnapshot && syncSnapshot : stryMutAct_9fa48("60463") ? false : stryMutAct_9fa48("60462") ? true : (stryCov_9fa48("60462", "60463", "60464"), asyncSnapshot || syncSnapshot);
        }
      }
      let timeoutHandle = null;
      try {
        if (stryMutAct_9fa48("60465")) {
          {}
        } else {
          stryCov_9fa48("60465");
          const asyncSnapshot = await Promise.race(stryMutAct_9fa48("60466") ? [] : (stryCov_9fa48("60466"), [this.getMembershipPublicationPlanningSnapshot(nodeId, observedAt), new Promise((_resolve, reject) => {
            if (stryMutAct_9fa48("60467")) {
              {}
            } else {
              stryCov_9fa48("60467");
              timeoutHandle = this.setTimeoutFn(() => {
                if (stryMutAct_9fa48("60468")) {
                  {}
                } else {
                  stryCov_9fa48("60468");
                  reject(new Error((stryMutAct_9fa48("60469") ? "" : (stryCov_9fa48("60469"), 'Timed out refreshing membership publication planning snapshot ')) + (stryMutAct_9fa48("60470") ? `` : (stryCov_9fa48("60470"), `for ${stryMutAct_9fa48("60473") ? nodeId && 'unknown' : stryMutAct_9fa48("60472") ? false : stryMutAct_9fa48("60471") ? true : (stryCov_9fa48("60471", "60472", "60473"), nodeId || (stryMutAct_9fa48("60474") ? "" : (stryCov_9fa48("60474"), 'unknown')))} after ${timeoutMs}ms`))));
                }
              }, timeoutMs);
            }
          })]));
          return stryMutAct_9fa48("60477") ? asyncSnapshot && syncSnapshot : stryMutAct_9fa48("60476") ? false : stryMutAct_9fa48("60475") ? true : (stryCov_9fa48("60475", "60476", "60477"), asyncSnapshot || syncSnapshot);
        }
      } catch {
        if (stryMutAct_9fa48("60478")) {
          {}
        } else {
          stryCov_9fa48("60478");
          return syncSnapshot;
        }
      } finally {
        if (stryMutAct_9fa48("60479")) {
          {}
        } else {
          stryCov_9fa48("60479");
          if (stryMutAct_9fa48("60481") ? false : stryMutAct_9fa48("60480") ? true : (stryCov_9fa48("60480", "60481"), timeoutHandle)) {
            if (stryMutAct_9fa48("60482")) {
              {}
            } else {
              stryCov_9fa48("60482");
              this.clearTimeoutFn(timeoutHandle);
            }
          }
        }
      }
    }
  }

  /**
   * Return one best-effort owner answer for membership-publication planning.
   * Callers should prefer this surface over sequencing sync/async reads
   * themselves so planning degradation policy stays owner-owned.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Promise<Object|null>}
   */
  async getMembershipPublicationPlanningAnswerBestEffort(nodeId, observedAt) {
    if (stryMutAct_9fa48("60483")) {
      {}
    } else {
      stryCov_9fa48("60483");
      return this.getPriorityRecoveryPlanningAnswerBestEffort(nodeId, observedAt);
    }
  }

  /**
   * Canonical best-effort priority-recovery planning answer.
   * Async refresh and deterministic fallback belong only in this
   * owner-owned surface.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryPlanningAnswerBestEffort(nodeId, observedAt) {
    if (stryMutAct_9fa48("60484")) {
      {}
    } else {
      stryCov_9fa48("60484");
      return this.getMembershipPublicationPlanningSnapshotBestEffort(nodeId, observedAt);
    }
  }

  /**
   * Canonical best-effort priority-recovery planning snapshot.
   * Async best-effort refresh remains owner-owned.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId, observedAt) {
    if (stryMutAct_9fa48("60485")) {
      {}
    } else {
      stryCov_9fa48("60485");
      return this.getMembershipPublicationPlanningSnapshotBestEffort(nodeId, observedAt);
    }
  }

  /**
   * Return the current published membership epoch using readiness-owned
   * degradation policy instead of caller-local reconstruction.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {number|null}
   */
  getCurrentPublishedMembershipEpochSync(nodeId, observedAt) {
    if (stryMutAct_9fa48("60486")) {
      {}
    } else {
      stryCov_9fa48("60486");
      const planningSnapshot = this.getMembershipPublicationPlanningAnswerSync(nodeId, observedAt);
      const publishedPlanningEpoch = Number(stryMutAct_9fa48("60487") ? planningSnapshot.publishedPlanningEpoch : (stryCov_9fa48("60487"), planningSnapshot?.publishedPlanningEpoch));
      if (stryMutAct_9fa48("60490") ? Number.isInteger(publishedPlanningEpoch) || publishedPlanningEpoch >= NUM.ZERO : stryMutAct_9fa48("60489") ? false : stryMutAct_9fa48("60488") ? true : (stryCov_9fa48("60488", "60489", "60490"), Number.isInteger(publishedPlanningEpoch) && (stryMutAct_9fa48("60493") ? publishedPlanningEpoch < NUM.ZERO : stryMutAct_9fa48("60492") ? publishedPlanningEpoch > NUM.ZERO : stryMutAct_9fa48("60491") ? true : (stryCov_9fa48("60491", "60492", "60493"), publishedPlanningEpoch >= NUM.ZERO)))) {
        if (stryMutAct_9fa48("60494")) {
          {}
        } else {
          stryCov_9fa48("60494");
          return publishedPlanningEpoch;
        }
      }
      return null;
    }
  }
  buildMembershipPublicationDiagnostics(row, observedAt) {
    if (stryMutAct_9fa48("60495")) {
      {}
    } else {
      stryCov_9fa48("60495");
      const protocolSnapshot = buildPublicationRecoveryProtocolSnapshot(row);
      if (stryMutAct_9fa48("60498") ? false : stryMutAct_9fa48("60497") ? true : stryMutAct_9fa48("60496") ? protocolSnapshot : (stryCov_9fa48("60496", "60497", "60498"), !protocolSnapshot)) {
        if (stryMutAct_9fa48("60499")) {
          {}
        } else {
          stryCov_9fa48("60499");
          return null;
        }
      }
      const publicationEpoch = Number(stryMutAct_9fa48("60500") ? row.publicationEpoch && row.publication_epoch : (stryCov_9fa48("60500"), row.publicationEpoch ?? row.publication_epoch));
      const sourceSnapshotVersion = Number(stryMutAct_9fa48("60501") ? row.sourceSnapshotVersion && row.source_snapshot_version : (stryCov_9fa48("60501"), row.sourceSnapshotVersion ?? row.source_snapshot_version));
      const createdAt = normalizeDiagnosticTimestampMs(stryMutAct_9fa48("60502") ? (row.createdAt ?? row.created_at) && observedAt : (stryCov_9fa48("60502"), (stryMutAct_9fa48("60503") ? row.createdAt && row.created_at : (stryCov_9fa48("60503"), row.createdAt ?? row.created_at)) ?? observedAt));
      const updatedAt = normalizeDiagnosticTimestampMs(stryMutAct_9fa48("60504") ? (row.updatedAt ?? row.updated_at) && createdAt : (stryCov_9fa48("60504"), (stryMutAct_9fa48("60505") ? row.updatedAt && row.updated_at : (stryCov_9fa48("60505"), row.updatedAt ?? row.updated_at)) ?? createdAt));
      return Object.freeze(stryMutAct_9fa48("60506") ? {} : (stryCov_9fa48("60506"), {
        publicationEpoch: Number.isFinite(publicationEpoch) ? publicationEpoch : protocolSnapshot.publicationEpoch,
        sourceSnapshotVersion: Number.isFinite(sourceSnapshotVersion) ? sourceSnapshotVersion : protocolSnapshot.sourceSnapshotVersion,
        status: protocolSnapshot.publicationStatus,
        publicationObservationState: protocolSnapshot.publicationObservationState,
        publishedActiveNodeIdsPresent: protocolSnapshot.publishedActiveNodeIdsPresent,
        publishedActiveNodeIds: protocolSnapshot.publishedActiveNodeIds,
        requiredAckNodeIds: protocolSnapshot.requiredAckNodeIds,
        acknowledgedNodeIds: protocolSnapshot.acknowledgedNodeIds,
        priorityPartitionSummary: protocolSnapshot.priorityPartitionSummary,
        membershipLifecycleSummary: protocolSnapshot.membershipLifecycleSummary,
        projectedServingNodeIds: protocolSnapshot.projectedServingNodeIds,
        locallyEligibleNodeIds: protocolSnapshot.locallyEligibleNodeIds,
        recoveryEligibleIncludedNodeIds: protocolSnapshot.recoveryEligibleIncludedNodeIds,
        recoveryActiveNodeIds: protocolSnapshot.recoveryActiveNodeIds,
        recoveryActiveNodeSource: protocolSnapshot.recoveryActiveNodeSource,
        missingPublishedRecoveryActiveNodeIds: protocolSnapshot.missingPublishedRecoveryActiveNodeIds,
        participationByNodeId: protocolSnapshot.participationByNodeId,
        participationStateCounts: protocolSnapshot.participationStateCounts,
        recoveryProtocolState: protocolSnapshot.recoveryProtocolState,
        priorityRecoveryReasonCodes: protocolSnapshot.priorityRecoveryReasonCodes,
        createdAt,
        updatedAt
      }));
    }
  }
  buildMembershipPublicationPlanningSnapshot(context = {}) {
    if (stryMutAct_9fa48("60507")) {
      {}
    } else {
      stryCov_9fa48("60507");
      const protocolSnapshot = buildPublicationRecoveryProtocolSnapshot(context.membershipPublication, stryMutAct_9fa48("60508") ? {} : (stryCov_9fa48("60508"), {
        targetNodeId: context.nodeId
      }));
      if (stryMutAct_9fa48("60511") ? false : stryMutAct_9fa48("60510") ? true : stryMutAct_9fa48("60509") ? protocolSnapshot : (stryCov_9fa48("60509", "60510", "60511"), !protocolSnapshot)) {
        if (stryMutAct_9fa48("60512")) {
          {}
        } else {
          stryCov_9fa48("60512");
          return null;
        }
      }
      return Object.freeze(stryMutAct_9fa48("60513") ? {} : (stryCov_9fa48("60513"), {
        ...protocolSnapshot,
        publicationObservationState: protocolSnapshot.publicationObservationState,
        priorityRecoveryActive: stryMutAct_9fa48("60517") ? protocolSnapshot.priorityRecoveryReasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("60516") ? protocolSnapshot.priorityRecoveryReasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("60515") ? false : stryMutAct_9fa48("60514") ? true : (stryCov_9fa48("60514", "60515", "60516", "60517"), protocolSnapshot.priorityRecoveryReasonCodes.length > NUM.ZERO)
      }));
    }
  }
  buildMembershipPublicationReadOptions(readOptions = {}) {
    if (stryMutAct_9fa48("60518")) {
      {}
    } else {
      stryCov_9fa48("60518");
      return resolveMembershipPublicationReadOptions(stryMutAct_9fa48("60519") ? {} : (stryCov_9fa48("60519"), {
        lane: resolveMembershipPublicationReadLane(stryMutAct_9fa48("60520") ? readOptions.lane : (stryCov_9fa48("60520"), readOptions?.lane)),
        queryTimeoutMs: (stryMutAct_9fa48("60523") ? Number.isFinite(readOptions?.queryTimeoutMs) || readOptions.queryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("60522") ? false : stryMutAct_9fa48("60521") ? true : (stryCov_9fa48("60521", "60522", "60523"), Number.isFinite(stryMutAct_9fa48("60524") ? readOptions.queryTimeoutMs : (stryCov_9fa48("60524"), readOptions?.queryTimeoutMs)) && (stryMutAct_9fa48("60527") ? readOptions.queryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("60526") ? readOptions.queryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("60525") ? true : (stryCov_9fa48("60525", "60526", "60527"), readOptions.queryTimeoutMs > NUM.ZERO)))) ? readOptions.queryTimeoutMs : this.membershipPublicationDiagnosticsQueryTimeoutMs
      }));
    }
  }
  getLatestMembershipPublicationRowSync(nodeId, readOptions = {}) {
    if (stryMutAct_9fa48("60528")) {
      {}
    } else {
      stryCov_9fa48("60528");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("60531") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("60530") ? false : stryMutAct_9fa48("60529") ? true : (stryCov_9fa48("60529", "60530", "60531"), (stryMutAct_9fa48("60532") ? service : (stryCov_9fa48("60532"), !service)) || (stryMutAct_9fa48("60534") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("60533") ? false : (stryCov_9fa48("60533", "60534"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60535")) {
          {}
        } else {
          stryCov_9fa48("60535");
          return null;
        }
      }
      const normalizedReadOptions = this.buildMembershipPublicationReadOptions(readOptions);
      const normalizedScope = resolveMembershipPublicationReadScope(stryMutAct_9fa48("60536") ? readOptions.scope : (stryCov_9fa48("60536"), readOptions?.scope));
      if (stryMutAct_9fa48("60539") ? normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER || typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION : stryMutAct_9fa48("60538") ? false : stryMutAct_9fa48("60537") ? true : (stryCov_9fa48("60537", "60538", "60539"), (stryMutAct_9fa48("60541") ? normalizedScope !== MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER : stryMutAct_9fa48("60540") ? true : (stryCov_9fa48("60540", "60541"), normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER)) && (stryMutAct_9fa48("60543") ? typeof service.getLatestClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("60542") ? true : (stryCov_9fa48("60542", "60543"), typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("60544")) {
          {}
        } else {
          stryCov_9fa48("60544");
          return service.getLatestClusterPublicationSync(normalizedReadOptions);
        }
      }
      if (stryMutAct_9fa48("60547") ? typeof service.getLatestPublicationForNodeSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("60546") ? false : stryMutAct_9fa48("60545") ? true : (stryCov_9fa48("60545", "60546", "60547"), typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("60548")) {
          {}
        } else {
          stryCov_9fa48("60548");
          return service.getLatestPublicationForNodeSync(nodeId, normalizedReadOptions);
        }
      }
      if (stryMutAct_9fa48("60551") ? typeof service.getLatestClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("60550") ? false : stryMutAct_9fa48("60549") ? true : (stryCov_9fa48("60549", "60550", "60551"), typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("60552")) {
          {}
        } else {
          stryCov_9fa48("60552");
          return service.getLatestClusterPublicationSync(normalizedReadOptions);
        }
      }
      return null;
    }
  }
  async getLatestMembershipPublicationRow(nodeId, readOptions = {}) {
    if (stryMutAct_9fa48("60553")) {
      {}
    } else {
      stryCov_9fa48("60553");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("60556") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("60555") ? false : stryMutAct_9fa48("60554") ? true : (stryCov_9fa48("60554", "60555", "60556"), (stryMutAct_9fa48("60557") ? service : (stryCov_9fa48("60557"), !service)) || (stryMutAct_9fa48("60559") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("60558") ? false : (stryCov_9fa48("60558", "60559"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60560")) {
          {}
        } else {
          stryCov_9fa48("60560");
          return null;
        }
      }
      const normalizedReadOptions = this.buildMembershipPublicationReadOptions(readOptions);
      const normalizedScope = resolveMembershipPublicationReadScope(stryMutAct_9fa48("60561") ? readOptions.scope : (stryCov_9fa48("60561"), readOptions?.scope));
      if (stryMutAct_9fa48("60564") ? normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER || typeof service.getLatestClusterPublication === TYPEOF.FUNCTION : stryMutAct_9fa48("60563") ? false : stryMutAct_9fa48("60562") ? true : (stryCov_9fa48("60562", "60563", "60564"), (stryMutAct_9fa48("60566") ? normalizedScope !== MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER : stryMutAct_9fa48("60565") ? true : (stryCov_9fa48("60565", "60566"), normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER)) && (stryMutAct_9fa48("60568") ? typeof service.getLatestClusterPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("60567") ? true : (stryCov_9fa48("60567", "60568"), typeof service.getLatestClusterPublication === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("60569")) {
          {}
        } else {
          stryCov_9fa48("60569");
          return service.getLatestClusterPublication(normalizedReadOptions);
        }
      }
      if (stryMutAct_9fa48("60572") ? typeof service.getLatestPublicationForNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("60571") ? false : stryMutAct_9fa48("60570") ? true : (stryCov_9fa48("60570", "60571", "60572"), typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("60573")) {
          {}
        } else {
          stryCov_9fa48("60573");
          return service.getLatestPublicationForNode(nodeId, normalizedReadOptions);
        }
      }
      if (stryMutAct_9fa48("60576") ? typeof service.getLatestClusterPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("60575") ? false : stryMutAct_9fa48("60574") ? true : (stryCov_9fa48("60574", "60575", "60576"), typeof service.getLatestClusterPublication === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("60577")) {
          {}
        } else {
          stryCov_9fa48("60577");
          return service.getLatestClusterPublication(normalizedReadOptions);
        }
      }
      return null;
    }
  }
  getLatestPublishedMembershipPublicationRowSync(readOptions = {}) {
    if (stryMutAct_9fa48("60578")) {
      {}
    } else {
      stryCov_9fa48("60578");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("60581") ? (!service || typeof service !== TYPEOF.OBJECT) && typeof service.getLatestPublishedClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("60580") ? false : stryMutAct_9fa48("60579") ? true : (stryCov_9fa48("60579", "60580", "60581"), (stryMutAct_9fa48("60583") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("60582") ? false : (stryCov_9fa48("60582", "60583"), (stryMutAct_9fa48("60584") ? service : (stryCov_9fa48("60584"), !service)) || (stryMutAct_9fa48("60586") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("60585") ? false : (stryCov_9fa48("60585", "60586"), typeof service !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("60588") ? typeof service.getLatestPublishedClusterPublicationSync === TYPEOF.FUNCTION : stryMutAct_9fa48("60587") ? false : (stryCov_9fa48("60587", "60588"), typeof service.getLatestPublishedClusterPublicationSync !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("60589")) {
          {}
        } else {
          stryCov_9fa48("60589");
          return null;
        }
      }
      return service.getLatestPublishedClusterPublicationSync(this.buildMembershipPublicationReadOptions(readOptions));
    }
  }
  async getLatestPublishedMembershipPublicationRow(readOptions = {}) {
    if (stryMutAct_9fa48("60590")) {
      {}
    } else {
      stryCov_9fa48("60590");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("60593") ? (!service || typeof service !== TYPEOF.OBJECT) && typeof service.getLatestPublishedClusterPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("60592") ? false : stryMutAct_9fa48("60591") ? true : (stryCov_9fa48("60591", "60592", "60593"), (stryMutAct_9fa48("60595") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("60594") ? false : (stryCov_9fa48("60594", "60595"), (stryMutAct_9fa48("60596") ? service : (stryCov_9fa48("60596"), !service)) || (stryMutAct_9fa48("60598") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("60597") ? false : (stryCov_9fa48("60597", "60598"), typeof service !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("60600") ? typeof service.getLatestPublishedClusterPublication === TYPEOF.FUNCTION : stryMutAct_9fa48("60599") ? false : (stryCov_9fa48("60599", "60600"), typeof service.getLatestPublishedClusterPublication !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("60601")) {
          {}
        } else {
          stryCov_9fa48("60601");
          return null;
        }
      }
      return service.getLatestPublishedClusterPublication(this.buildMembershipPublicationReadOptions(readOptions));
    }
  }
  buildPriorityControlPlaneRecoveryUnavailableHealth(failureReason, error = null, context = null) {
    if (stryMutAct_9fa48("60602")) {
      {}
    } else {
      stryCov_9fa48("60602");
      const details = stryMutAct_9fa48("60603") ? {} : (stryCov_9fa48("60603"), {
        failureReason
      });
      if (stryMutAct_9fa48("60606") ? context || typeof context === TYPEOF.OBJECT : stryMutAct_9fa48("60605") ? false : stryMutAct_9fa48("60604") ? true : (stryCov_9fa48("60604", "60605", "60606"), context && (stryMutAct_9fa48("60608") ? typeof context !== TYPEOF.OBJECT : stryMutAct_9fa48("60607") ? true : (stryCov_9fa48("60607", "60608"), typeof context === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60609")) {
          {}
        } else {
          stryCov_9fa48("60609");
          Object.assign(details, context);
        }
      }
      if (stryMutAct_9fa48("60611") ? false : stryMutAct_9fa48("60610") ? true : (stryCov_9fa48("60610", "60611"), error)) {
        if (stryMutAct_9fa48("60612")) {
          {}
        } else {
          stryCov_9fa48("60612");
          details.error = stryMutAct_9fa48("60615") ? error?.message && String(error) : stryMutAct_9fa48("60614") ? false : stryMutAct_9fa48("60613") ? true : (stryCov_9fa48("60613", "60614", "60615"), (stryMutAct_9fa48("60616") ? error.message : (stryCov_9fa48("60616"), error?.message)) || String(error));
        }
      }
      return Object.freeze(stryMutAct_9fa48("60617") ? {} : (stryCov_9fa48("60617"), {
        healthy: stryMutAct_9fa48("60618") ? true : (stryCov_9fa48("60618"), false),
        reasonCode: CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        details
      }));
    }
  }
  buildStartupAuthorityFailureDescriptor(failureReason) {
    if (stryMutAct_9fa48("60619")) {
      {}
    } else {
      stryCov_9fa48("60619");
      return (stryMutAct_9fa48("60622") ? typeof failureReason === TYPEOF.STRING || failureReason.length > NUM.ZERO : stryMutAct_9fa48("60621") ? false : stryMutAct_9fa48("60620") ? true : (stryCov_9fa48("60620", "60621", "60622"), (stryMutAct_9fa48("60624") ? typeof failureReason !== TYPEOF.STRING : stryMutAct_9fa48("60623") ? true : (stryCov_9fa48("60623", "60624"), typeof failureReason === TYPEOF.STRING)) && (stryMutAct_9fa48("60627") ? failureReason.length <= NUM.ZERO : stryMutAct_9fa48("60626") ? failureReason.length >= NUM.ZERO : stryMutAct_9fa48("60625") ? true : (stryCov_9fa48("60625", "60626", "60627"), failureReason.length > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("60628") ? {} : (stryCov_9fa48("60628"), {
        state: stryMutAct_9fa48("60629") ? "" : (stryCov_9fa48("60629"), 'present'),
        reason: failureReason
      })) : Object.freeze(stryMutAct_9fa48("60630") ? {} : (stryCov_9fa48("60630"), {
        state: stryMutAct_9fa48("60631") ? "" : (stryCov_9fa48("60631"), 'none')
      }));
    }
  }
  buildStartupAuthorityPublicationDescriptor(details = {}) {
    if (stryMutAct_9fa48("60632")) {
      {}
    } else {
      stryCov_9fa48("60632");
      const observationState = (stryMutAct_9fa48("60635") ? typeof details.publicationObservationState === TYPEOF.STRING || details.publicationObservationState.length > NUM.ZERO : stryMutAct_9fa48("60634") ? false : stryMutAct_9fa48("60633") ? true : (stryCov_9fa48("60633", "60634", "60635"), (stryMutAct_9fa48("60637") ? typeof details.publicationObservationState !== TYPEOF.STRING : stryMutAct_9fa48("60636") ? true : (stryCov_9fa48("60636", "60637"), typeof details.publicationObservationState === TYPEOF.STRING)) && (stryMutAct_9fa48("60640") ? details.publicationObservationState.length <= NUM.ZERO : stryMutAct_9fa48("60639") ? details.publicationObservationState.length >= NUM.ZERO : stryMutAct_9fa48("60638") ? true : (stryCov_9fa48("60638", "60639", "60640"), details.publicationObservationState.length > NUM.ZERO)))) ? details.publicationObservationState : stryMutAct_9fa48("60641") ? "" : (stryCov_9fa48("60641"), 'observation_unavailable');
      const epoch = Number.isFinite(details.publicationEpoch) ? Object.freeze(stryMutAct_9fa48("60642") ? {} : (stryCov_9fa48("60642"), {
        state: stryMutAct_9fa48("60643") ? "" : (stryCov_9fa48("60643"), 'known'),
        value: Math.floor(details.publicationEpoch)
      })) : Object.freeze(stryMutAct_9fa48("60644") ? {} : (stryCov_9fa48("60644"), {
        state: (stryMutAct_9fa48("60647") ? observationState !== 'unpublished' : stryMutAct_9fa48("60646") ? false : stryMutAct_9fa48("60645") ? true : (stryCov_9fa48("60645", "60646", "60647"), observationState === (stryMutAct_9fa48("60648") ? "" : (stryCov_9fa48("60648"), 'unpublished')))) ? stryMutAct_9fa48("60649") ? "" : (stryCov_9fa48("60649"), 'unpublished') : stryMutAct_9fa48("60650") ? "" : (stryCov_9fa48("60650"), 'unavailable')
      }));
      const status = (stryMutAct_9fa48("60653") ? typeof details.publicationStatus === TYPEOF.STRING || details.publicationStatus.length > NUM.ZERO : stryMutAct_9fa48("60652") ? false : stryMutAct_9fa48("60651") ? true : (stryCov_9fa48("60651", "60652", "60653"), (stryMutAct_9fa48("60655") ? typeof details.publicationStatus !== TYPEOF.STRING : stryMutAct_9fa48("60654") ? true : (stryCov_9fa48("60654", "60655"), typeof details.publicationStatus === TYPEOF.STRING)) && (stryMutAct_9fa48("60658") ? details.publicationStatus.length <= NUM.ZERO : stryMutAct_9fa48("60657") ? details.publicationStatus.length >= NUM.ZERO : stryMutAct_9fa48("60656") ? true : (stryCov_9fa48("60656", "60657", "60658"), details.publicationStatus.length > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("60659") ? {} : (stryCov_9fa48("60659"), {
        state: stryMutAct_9fa48("60660") ? "" : (stryCov_9fa48("60660"), 'known'),
        value: details.publicationStatus
      })) : Object.freeze(stryMutAct_9fa48("60661") ? {} : (stryCov_9fa48("60661"), {
        state: (stryMutAct_9fa48("60664") ? observationState !== 'unpublished' : stryMutAct_9fa48("60663") ? false : stryMutAct_9fa48("60662") ? true : (stryCov_9fa48("60662", "60663", "60664"), observationState === (stryMutAct_9fa48("60665") ? "" : (stryCov_9fa48("60665"), 'unpublished')))) ? stryMutAct_9fa48("60666") ? "" : (stryCov_9fa48("60666"), 'unpublished') : stryMutAct_9fa48("60667") ? "" : (stryCov_9fa48("60667"), 'unavailable')
      }));
      return Object.freeze(stryMutAct_9fa48("60668") ? {} : (stryCov_9fa48("60668"), {
        observationState,
        epoch,
        status
      }));
    }
  }
  buildStartupAuthorityPriorityPartitionDescriptor(priorityPartitionSummary) {
    if (stryMutAct_9fa48("60669")) {
      {}
    } else {
      stryCov_9fa48("60669");
      return (stryMutAct_9fa48("60672") ? priorityPartitionSummary || typeof priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("60671") ? false : stryMutAct_9fa48("60670") ? true : (stryCov_9fa48("60670", "60671", "60672"), priorityPartitionSummary && (stryMutAct_9fa48("60674") ? typeof priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("60673") ? true : (stryCov_9fa48("60673", "60674"), typeof priorityPartitionSummary === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("60675") ? {} : (stryCov_9fa48("60675"), {
        state: stryMutAct_9fa48("60676") ? "" : (stryCov_9fa48("60676"), 'available'),
        summary: priorityPartitionSummary
      })) : Object.freeze(stryMutAct_9fa48("60677") ? {} : (stryCov_9fa48("60677"), {
        state: stryMutAct_9fa48("60678") ? "" : (stryCov_9fa48("60678"), 'unavailable')
      }));
    }
  }
  buildStartupAuthorityRecoveryProtocolDescriptor(recoveryProtocolState) {
    if (stryMutAct_9fa48("60679")) {
      {}
    } else {
      stryCov_9fa48("60679");
      return (stryMutAct_9fa48("60682") ? typeof recoveryProtocolState === TYPEOF.STRING || recoveryProtocolState.length > NUM.ZERO : stryMutAct_9fa48("60681") ? false : stryMutAct_9fa48("60680") ? true : (stryCov_9fa48("60680", "60681", "60682"), (stryMutAct_9fa48("60684") ? typeof recoveryProtocolState !== TYPEOF.STRING : stryMutAct_9fa48("60683") ? true : (stryCov_9fa48("60683", "60684"), typeof recoveryProtocolState === TYPEOF.STRING)) && (stryMutAct_9fa48("60687") ? recoveryProtocolState.length <= NUM.ZERO : stryMutAct_9fa48("60686") ? recoveryProtocolState.length >= NUM.ZERO : stryMutAct_9fa48("60685") ? true : (stryCov_9fa48("60685", "60686", "60687"), recoveryProtocolState.length > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("60688") ? {} : (stryCov_9fa48("60688"), {
        state: stryMutAct_9fa48("60689") ? "" : (stryCov_9fa48("60689"), 'known'),
        value: recoveryProtocolState
      })) : Object.freeze(stryMutAct_9fa48("60690") ? {} : (stryCov_9fa48("60690"), {
        state: stryMutAct_9fa48("60691") ? "" : (stryCov_9fa48("60691"), 'unavailable')
      }));
    }
  }
  buildStartupAuthorityTargetParticipationDescriptor(targetParticipation) {
    if (stryMutAct_9fa48("60692")) {
      {}
    } else {
      stryCov_9fa48("60692");
      return (stryMutAct_9fa48("60695") ? targetParticipation || typeof targetParticipation === TYPEOF.OBJECT : stryMutAct_9fa48("60694") ? false : stryMutAct_9fa48("60693") ? true : (stryCov_9fa48("60693", "60694", "60695"), targetParticipation && (stryMutAct_9fa48("60697") ? typeof targetParticipation !== TYPEOF.OBJECT : stryMutAct_9fa48("60696") ? true : (stryCov_9fa48("60696", "60697"), typeof targetParticipation === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("60698") ? {} : (stryCov_9fa48("60698"), {
        state: stryMutAct_9fa48("60699") ? "" : (stryCov_9fa48("60699"), 'available'),
        participation: targetParticipation
      })) : Object.freeze(stryMutAct_9fa48("60700") ? {} : (stryCov_9fa48("60700"), {
        state: stryMutAct_9fa48("60701") ? "" : (stryCov_9fa48("60701"), 'unavailable')
      }));
    }
  }
  buildStartupAuthoritySnapshotContract(options = {}) {
    if (stryMutAct_9fa48("60702")) {
      {}
    } else {
      stryCov_9fa48("60702");
      const publication = this.buildStartupAuthorityPublicationDescriptor(stryMutAct_9fa48("60703") ? {} : (stryCov_9fa48("60703"), {
        publicationEpoch: options.publicationEpoch,
        publicationStatus: options.publicationStatus,
        publicationObservationState: options.publicationObservationState
      }));
      const priorityPartition = this.buildStartupAuthorityPriorityPartitionDescriptor(options.priorityPartitionSummary);
      const recoveryProtocol = this.buildStartupAuthorityRecoveryProtocolDescriptor(options.recoveryProtocolState);
      const targetParticipationDetail = this.buildStartupAuthorityTargetParticipationDescriptor(options.targetParticipation);
      const failure = this.buildStartupAuthorityFailureDescriptor(options.failureReason);
      return Object.freeze(stryMutAct_9fa48("60704") ? {} : (stryCov_9fa48("60704"), {
        state: options.state,
        ready: stryMutAct_9fa48("60707") ? options.ready !== true : stryMutAct_9fa48("60706") ? false : stryMutAct_9fa48("60705") ? true : (stryCov_9fa48("60705", "60706", "60707"), options.ready === (stryMutAct_9fa48("60708") ? false : (stryCov_9fa48("60708"), true))),
        authorityAvailable: stryMutAct_9fa48("60711") ? options.authorityAvailable !== true : stryMutAct_9fa48("60710") ? false : stryMutAct_9fa48("60709") ? true : (stryCov_9fa48("60709", "60710", "60711"), options.authorityAvailable === (stryMutAct_9fa48("60712") ? false : (stryCov_9fa48("60712"), true))),
        publication,
        priorityPartition,
        recoveryProtocol,
        targetParticipationDetail,
        priorityRecoveryReasonCodes: Object.freeze(Array.isArray(options.priorityRecoveryReasonCodes) ? stryMutAct_9fa48("60713") ? [] : (stryCov_9fa48("60713"), [...options.priorityRecoveryReasonCodes]) : stryMutAct_9fa48("60714") ? ["Stryker was here"] : (stryCov_9fa48("60714"), [])),
        canonicalStartupNodeIds: Object.freeze(Array.isArray(options.canonicalStartupNodeIds) ? stryMutAct_9fa48("60715") ? [] : (stryCov_9fa48("60715"), [...options.canonicalStartupNodeIds]) : stryMutAct_9fa48("60716") ? ["Stryker was here"] : (stryCov_9fa48("60716"), [])),
        failure,
        publicationObservationState: publication.observationState,
        ...((stryMutAct_9fa48("60719") ? publication.epoch.state !== 'known' : stryMutAct_9fa48("60718") ? false : stryMutAct_9fa48("60717") ? true : (stryCov_9fa48("60717", "60718", "60719"), publication.epoch.state === (stryMutAct_9fa48("60720") ? "" : (stryCov_9fa48("60720"), 'known')))) ? stryMutAct_9fa48("60721") ? {} : (stryCov_9fa48("60721"), {
          publicationEpoch: publication.epoch.value
        }) : {}),
        ...((stryMutAct_9fa48("60724") ? publication.status.state !== 'known' : stryMutAct_9fa48("60723") ? false : stryMutAct_9fa48("60722") ? true : (stryCov_9fa48("60722", "60723", "60724"), publication.status.state === (stryMutAct_9fa48("60725") ? "" : (stryCov_9fa48("60725"), 'known')))) ? stryMutAct_9fa48("60726") ? {} : (stryCov_9fa48("60726"), {
          publicationStatus: publication.status.value
        }) : {}),
        ...((stryMutAct_9fa48("60729") ? priorityPartition.state !== 'available' : stryMutAct_9fa48("60728") ? false : stryMutAct_9fa48("60727") ? true : (stryCov_9fa48("60727", "60728", "60729"), priorityPartition.state === (stryMutAct_9fa48("60730") ? "" : (stryCov_9fa48("60730"), 'available')))) ? stryMutAct_9fa48("60731") ? {} : (stryCov_9fa48("60731"), {
          priorityPartitionSummary: priorityPartition.summary
        }) : {}),
        ...((stryMutAct_9fa48("60734") ? recoveryProtocol.state !== 'known' : stryMutAct_9fa48("60733") ? false : stryMutAct_9fa48("60732") ? true : (stryCov_9fa48("60732", "60733", "60734"), recoveryProtocol.state === (stryMutAct_9fa48("60735") ? "" : (stryCov_9fa48("60735"), 'known')))) ? stryMutAct_9fa48("60736") ? {} : (stryCov_9fa48("60736"), {
          recoveryProtocolState: recoveryProtocol.value
        }) : {}),
        ...((stryMutAct_9fa48("60739") ? targetParticipationDetail.state !== 'available' : stryMutAct_9fa48("60738") ? false : stryMutAct_9fa48("60737") ? true : (stryCov_9fa48("60737", "60738", "60739"), targetParticipationDetail.state === (stryMutAct_9fa48("60740") ? "" : (stryCov_9fa48("60740"), 'available')))) ? stryMutAct_9fa48("60741") ? {} : (stryCov_9fa48("60741"), {
          targetParticipation: targetParticipationDetail.participation
        }) : {}),
        ...((stryMutAct_9fa48("60744") ? failure.state !== 'present' : stryMutAct_9fa48("60743") ? false : stryMutAct_9fa48("60742") ? true : (stryCov_9fa48("60742", "60743", "60744"), failure.state === (stryMutAct_9fa48("60745") ? "" : (stryCov_9fa48("60745"), 'present')))) ? stryMutAct_9fa48("60746") ? {} : (stryCov_9fa48("60746"), {
          failureReason: failure.reason
        }) : {})
      }));
    }
  }
  buildPriorityRecoveryHealthDetailsFromStartupAuthority(startupAuthority, reasonCodes = stryMutAct_9fa48("60747") ? ["Stryker was here"] : (stryCov_9fa48("60747"), [])) {
    if (stryMutAct_9fa48("60748")) {
      {}
    } else {
      stryCov_9fa48("60748");
      return Object.freeze(stryMutAct_9fa48("60749") ? {} : (stryCov_9fa48("60749"), {
        publication: startupAuthority.publication,
        priorityPartition: startupAuthority.priorityPartition,
        recoveryProtocol: startupAuthority.recoveryProtocol,
        targetParticipationDetail: startupAuthority.targetParticipationDetail,
        priorityRecoveryReasonCodes: Object.freeze(Array.isArray(reasonCodes) ? stryMutAct_9fa48("60750") ? [] : (stryCov_9fa48("60750"), [...reasonCodes]) : stryMutAct_9fa48("60751") ? ["Stryker was here"] : (stryCov_9fa48("60751"), [])),
        startupAuthorityState: startupAuthority.state,
        canonicalStartupNodeIds: startupAuthority.canonicalStartupNodeIds,
        failure: startupAuthority.failure,
        publicationObservationState: startupAuthority.publication.observationState,
        ...((stryMutAct_9fa48("60754") ? startupAuthority.publication.epoch.state !== 'known' : stryMutAct_9fa48("60753") ? false : stryMutAct_9fa48("60752") ? true : (stryCov_9fa48("60752", "60753", "60754"), startupAuthority.publication.epoch.state === (stryMutAct_9fa48("60755") ? "" : (stryCov_9fa48("60755"), 'known')))) ? stryMutAct_9fa48("60756") ? {} : (stryCov_9fa48("60756"), {
          publicationEpoch: startupAuthority.publication.epoch.value
        }) : {}),
        ...((stryMutAct_9fa48("60759") ? startupAuthority.publication.status.state !== 'known' : stryMutAct_9fa48("60758") ? false : stryMutAct_9fa48("60757") ? true : (stryCov_9fa48("60757", "60758", "60759"), startupAuthority.publication.status.state === (stryMutAct_9fa48("60760") ? "" : (stryCov_9fa48("60760"), 'known')))) ? stryMutAct_9fa48("60761") ? {} : (stryCov_9fa48("60761"), {
          publicationStatus: startupAuthority.publication.status.value
        }) : {}),
        ...((stryMutAct_9fa48("60764") ? startupAuthority.priorityPartition.state !== 'available' : stryMutAct_9fa48("60763") ? false : stryMutAct_9fa48("60762") ? true : (stryCov_9fa48("60762", "60763", "60764"), startupAuthority.priorityPartition.state === (stryMutAct_9fa48("60765") ? "" : (stryCov_9fa48("60765"), 'available')))) ? stryMutAct_9fa48("60766") ? {} : (stryCov_9fa48("60766"), {
          priorityPartitionSummary: startupAuthority.priorityPartition.summary
        }) : {}),
        ...((stryMutAct_9fa48("60769") ? startupAuthority.recoveryProtocol.state !== 'known' : stryMutAct_9fa48("60768") ? false : stryMutAct_9fa48("60767") ? true : (stryCov_9fa48("60767", "60768", "60769"), startupAuthority.recoveryProtocol.state === (stryMutAct_9fa48("60770") ? "" : (stryCov_9fa48("60770"), 'known')))) ? stryMutAct_9fa48("60771") ? {} : (stryCov_9fa48("60771"), {
          recoveryProtocolState: startupAuthority.recoveryProtocol.value
        }) : {}),
        ...((stryMutAct_9fa48("60774") ? startupAuthority.targetParticipationDetail.state !== 'available' : stryMutAct_9fa48("60773") ? false : stryMutAct_9fa48("60772") ? true : (stryCov_9fa48("60772", "60773", "60774"), startupAuthority.targetParticipationDetail.state === (stryMutAct_9fa48("60775") ? "" : (stryCov_9fa48("60775"), 'available')))) ? stryMutAct_9fa48("60776") ? {} : (stryCov_9fa48("60776"), {
          targetParticipation: startupAuthority.targetParticipationDetail.participation
        }) : {}),
        ...((stryMutAct_9fa48("60779") ? startupAuthority.failure.state !== 'present' : stryMutAct_9fa48("60778") ? false : stryMutAct_9fa48("60777") ? true : (stryCov_9fa48("60777", "60778", "60779"), startupAuthority.failure.state === (stryMutAct_9fa48("60780") ? "" : (stryCov_9fa48("60780"), 'present')))) ? stryMutAct_9fa48("60781") ? {} : (stryCov_9fa48("60781"), {
          failureReason: startupAuthority.failure.reason
        }) : {})
      }));
    }
  }
  buildStartupAuthorityUnavailableSnapshot(failureReason, error = null, context = null) {
    if (stryMutAct_9fa48("60782")) {
      {}
    } else {
      stryCov_9fa48("60782");
      const details = stryMutAct_9fa48("60783") ? {} : (stryCov_9fa48("60783"), {
        failureReason
      });
      if (stryMutAct_9fa48("60786") ? context || typeof context === TYPEOF.OBJECT : stryMutAct_9fa48("60785") ? false : stryMutAct_9fa48("60784") ? true : (stryCov_9fa48("60784", "60785", "60786"), context && (stryMutAct_9fa48("60788") ? typeof context !== TYPEOF.OBJECT : stryMutAct_9fa48("60787") ? true : (stryCov_9fa48("60787", "60788"), typeof context === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60789")) {
          {}
        } else {
          stryCov_9fa48("60789");
          Object.assign(details, context);
        }
      }
      if (stryMutAct_9fa48("60791") ? false : stryMutAct_9fa48("60790") ? true : (stryCov_9fa48("60790", "60791"), error)) {
        if (stryMutAct_9fa48("60792")) {
          {}
        } else {
          stryCov_9fa48("60792");
          details.error = stryMutAct_9fa48("60795") ? error?.message && String(error) : stryMutAct_9fa48("60794") ? false : stryMutAct_9fa48("60793") ? true : (stryCov_9fa48("60793", "60794", "60795"), (stryMutAct_9fa48("60796") ? error.message : (stryCov_9fa48("60796"), error?.message)) || String(error));
        }
      }
      return this.buildStartupAuthoritySnapshotContract(stryMutAct_9fa48("60797") ? {} : (stryCov_9fa48("60797"), {
        state: STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE,
        ready: stryMutAct_9fa48("60798") ? true : (stryCov_9fa48("60798"), false),
        authorityAvailable: stryMutAct_9fa48("60799") ? true : (stryCov_9fa48("60799"), false),
        publicationEpoch: Number.isFinite(details.publicationEpoch) ? details.publicationEpoch : undefined,
        publicationStatus: (stryMutAct_9fa48("60802") ? typeof details.publicationStatus === TYPEOF.STRING || details.publicationStatus.length > NUM.ZERO : stryMutAct_9fa48("60801") ? false : stryMutAct_9fa48("60800") ? true : (stryCov_9fa48("60800", "60801", "60802"), (stryMutAct_9fa48("60804") ? typeof details.publicationStatus !== TYPEOF.STRING : stryMutAct_9fa48("60803") ? true : (stryCov_9fa48("60803", "60804"), typeof details.publicationStatus === TYPEOF.STRING)) && (stryMutAct_9fa48("60807") ? details.publicationStatus.length <= NUM.ZERO : stryMutAct_9fa48("60806") ? details.publicationStatus.length >= NUM.ZERO : stryMutAct_9fa48("60805") ? true : (stryCov_9fa48("60805", "60806", "60807"), details.publicationStatus.length > NUM.ZERO)))) ? details.publicationStatus : undefined,
        publicationObservationState: (stryMutAct_9fa48("60810") ? typeof details.publicationObservationState === TYPEOF.STRING || details.publicationObservationState.length > NUM.ZERO : stryMutAct_9fa48("60809") ? false : stryMutAct_9fa48("60808") ? true : (stryCov_9fa48("60808", "60809", "60810"), (stryMutAct_9fa48("60812") ? typeof details.publicationObservationState !== TYPEOF.STRING : stryMutAct_9fa48("60811") ? true : (stryCov_9fa48("60811", "60812"), typeof details.publicationObservationState === TYPEOF.STRING)) && (stryMutAct_9fa48("60815") ? details.publicationObservationState.length <= NUM.ZERO : stryMutAct_9fa48("60814") ? details.publicationObservationState.length >= NUM.ZERO : stryMutAct_9fa48("60813") ? true : (stryCov_9fa48("60813", "60814", "60815"), details.publicationObservationState.length > NUM.ZERO)))) ? details.publicationObservationState : stryMutAct_9fa48("60816") ? "" : (stryCov_9fa48("60816"), 'observation_unavailable'),
        priorityPartitionSummary: (stryMutAct_9fa48("60819") ? details.priorityPartitionSummary || typeof details.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("60818") ? false : stryMutAct_9fa48("60817") ? true : (stryCov_9fa48("60817", "60818", "60819"), details.priorityPartitionSummary && (stryMutAct_9fa48("60821") ? typeof details.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("60820") ? true : (stryCov_9fa48("60820", "60821"), typeof details.priorityPartitionSummary === TYPEOF.OBJECT)))) ? details.priorityPartitionSummary : undefined,
        recoveryProtocolState: (stryMutAct_9fa48("60824") ? typeof details.recoveryProtocolState === TYPEOF.STRING || details.recoveryProtocolState.length > NUM.ZERO : stryMutAct_9fa48("60823") ? false : stryMutAct_9fa48("60822") ? true : (stryCov_9fa48("60822", "60823", "60824"), (stryMutAct_9fa48("60826") ? typeof details.recoveryProtocolState !== TYPEOF.STRING : stryMutAct_9fa48("60825") ? true : (stryCov_9fa48("60825", "60826"), typeof details.recoveryProtocolState === TYPEOF.STRING)) && (stryMutAct_9fa48("60829") ? details.recoveryProtocolState.length <= NUM.ZERO : stryMutAct_9fa48("60828") ? details.recoveryProtocolState.length >= NUM.ZERO : stryMutAct_9fa48("60827") ? true : (stryCov_9fa48("60827", "60828", "60829"), details.recoveryProtocolState.length > NUM.ZERO)))) ? details.recoveryProtocolState : undefined,
        targetParticipation: (stryMutAct_9fa48("60832") ? details.targetParticipation || typeof details.targetParticipation === TYPEOF.OBJECT : stryMutAct_9fa48("60831") ? false : stryMutAct_9fa48("60830") ? true : (stryCov_9fa48("60830", "60831", "60832"), details.targetParticipation && (stryMutAct_9fa48("60834") ? typeof details.targetParticipation !== TYPEOF.OBJECT : stryMutAct_9fa48("60833") ? true : (stryCov_9fa48("60833", "60834"), typeof details.targetParticipation === TYPEOF.OBJECT)))) ? details.targetParticipation : undefined,
        priorityRecoveryReasonCodes: stryMutAct_9fa48("60835") ? ["Stryker was here"] : (stryCov_9fa48("60835"), []),
        canonicalStartupNodeIds: Array.isArray(details.canonicalStartupNodeIds) ? stryMutAct_9fa48("60836") ? [...new Set(details.canonicalStartupNodeIds.filter(nodeId => typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO))] : (stryCov_9fa48("60836"), (stryMutAct_9fa48("60837") ? [] : (stryCov_9fa48("60837"), [...new Set(stryMutAct_9fa48("60838") ? details.canonicalStartupNodeIds : (stryCov_9fa48("60838"), details.canonicalStartupNodeIds.filter(stryMutAct_9fa48("60839") ? () => undefined : (stryCov_9fa48("60839"), nodeId => stryMutAct_9fa48("60842") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("60841") ? false : stryMutAct_9fa48("60840") ? true : (stryCov_9fa48("60840", "60841", "60842"), (stryMutAct_9fa48("60844") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("60843") ? true : (stryCov_9fa48("60843", "60844"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("60847") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("60846") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("60845") ? true : (stryCov_9fa48("60845", "60846", "60847"), nodeId.length > NUM.ZERO)))))))])).sort()) : stryMutAct_9fa48("60848") ? ["Stryker was here"] : (stryCov_9fa48("60848"), []),
        failureReason
      }));
    }
  }
  buildStartupAuthoritySnapshotFromPlanningAnswer(planningSnapshot) {
    if (stryMutAct_9fa48("60849")) {
      {}
    } else {
      stryCov_9fa48("60849");
      if (stryMutAct_9fa48("60852") ? !planningSnapshot && typeof planningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("60851") ? false : stryMutAct_9fa48("60850") ? true : (stryCov_9fa48("60850", "60851", "60852"), (stryMutAct_9fa48("60853") ? planningSnapshot : (stryCov_9fa48("60853"), !planningSnapshot)) || (stryMutAct_9fa48("60855") ? typeof planningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("60854") ? false : (stryCov_9fa48("60854", "60855"), typeof planningSnapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60856")) {
          {}
        } else {
          stryCov_9fa48("60856");
          return this.buildStartupAuthorityUnavailableSnapshot(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_UNAVAILABLE);
        }
      }
      const publicationStatus = stryMutAct_9fa48("60859") ? planningSnapshot.publicationStatus && null : stryMutAct_9fa48("60858") ? false : stryMutAct_9fa48("60857") ? true : (stryCov_9fa48("60857", "60858", "60859"), planningSnapshot.publicationStatus || null);
      const priorityPartitionSummary = stryMutAct_9fa48("60862") ? planningSnapshot.priorityPartitionSummary && null : stryMutAct_9fa48("60861") ? false : stryMutAct_9fa48("60860") ? true : (stryCov_9fa48("60860", "60861", "60862"), planningSnapshot.priorityPartitionSummary || null);
      const canonicalStartupNodeIds = Array.isArray(resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds) ? resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds : stryMutAct_9fa48("60863") ? ["Stryker was here"] : (stryCov_9fa48("60863"), []);
      const publicationObservationState = (stryMutAct_9fa48("60866") ? typeof planningSnapshot.publicationObservationState === TYPEOF.STRING || planningSnapshot.publicationObservationState.length > NUM.ZERO : stryMutAct_9fa48("60865") ? false : stryMutAct_9fa48("60864") ? true : (stryCov_9fa48("60864", "60865", "60866"), (stryMutAct_9fa48("60868") ? typeof planningSnapshot.publicationObservationState !== TYPEOF.STRING : stryMutAct_9fa48("60867") ? true : (stryCov_9fa48("60867", "60868"), typeof planningSnapshot.publicationObservationState === TYPEOF.STRING)) && (stryMutAct_9fa48("60871") ? planningSnapshot.publicationObservationState.length <= NUM.ZERO : stryMutAct_9fa48("60870") ? planningSnapshot.publicationObservationState.length >= NUM.ZERO : stryMutAct_9fa48("60869") ? true : (stryCov_9fa48("60869", "60870", "60871"), planningSnapshot.publicationObservationState.length > NUM.ZERO)))) ? planningSnapshot.publicationObservationState : null;
      if (stryMutAct_9fa48("60874") ? publicationObservationState !== 'unpublished' : stryMutAct_9fa48("60873") ? false : stryMutAct_9fa48("60872") ? true : (stryCov_9fa48("60872", "60873", "60874"), publicationObservationState === (stryMutAct_9fa48("60875") ? "" : (stryCov_9fa48("60875"), 'unpublished')))) {
        if (stryMutAct_9fa48("60876")) {
          {}
        } else {
          stryCov_9fa48("60876");
          const priorityRecoveryReasonCodes = stryMutAct_9fa48("60877") ? [] : (stryCov_9fa48("60877"), [...new Set((Array.isArray(planningSnapshot.priorityRecoveryReasonCodes) ? planningSnapshot.priorityRecoveryReasonCodes : stryMutAct_9fa48("60878") ? ["Stryker was here"] : (stryCov_9fa48("60878"), [])).concat(CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING))]);
          return this.buildStartupAuthoritySnapshotContract(stryMutAct_9fa48("60879") ? {} : (stryCov_9fa48("60879"), {
            state: STARTUP_AUTHORITY_STATE.SEED_LOCALLY_READY_UNPUBLISHED,
            ready: stryMutAct_9fa48("60880") ? true : (stryCov_9fa48("60880"), false),
            authorityAvailable: stryMutAct_9fa48("60881") ? false : (stryCov_9fa48("60881"), true),
            publicationObservationState,
            priorityPartitionSummary: stryMutAct_9fa48("60884") ? priorityPartitionSummary && undefined : stryMutAct_9fa48("60883") ? false : stryMutAct_9fa48("60882") ? true : (stryCov_9fa48("60882", "60883", "60884"), priorityPartitionSummary || undefined),
            recoveryProtocolState: (stryMutAct_9fa48("60887") ? typeof planningSnapshot.recoveryProtocolState !== TYPEOF.STRING : stryMutAct_9fa48("60886") ? false : stryMutAct_9fa48("60885") ? true : (stryCov_9fa48("60885", "60886", "60887"), typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING)) ? planningSnapshot.recoveryProtocolState : undefined,
            targetParticipation: (stryMutAct_9fa48("60890") ? planningSnapshot.targetParticipation || typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT : stryMutAct_9fa48("60889") ? false : stryMutAct_9fa48("60888") ? true : (stryCov_9fa48("60888", "60889", "60890"), planningSnapshot.targetParticipation && (stryMutAct_9fa48("60892") ? typeof planningSnapshot.targetParticipation !== TYPEOF.OBJECT : stryMutAct_9fa48("60891") ? true : (stryCov_9fa48("60891", "60892"), typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT)))) ? planningSnapshot.targetParticipation : undefined,
            priorityRecoveryReasonCodes,
            canonicalStartupNodeIds
          }));
        }
      }
      if (stryMutAct_9fa48("60895") ? typeof publicationStatus !== TYPEOF.STRING && publicationStatus.length === NUM.ZERO : stryMutAct_9fa48("60894") ? false : stryMutAct_9fa48("60893") ? true : (stryCov_9fa48("60893", "60894", "60895"), (stryMutAct_9fa48("60897") ? typeof publicationStatus === TYPEOF.STRING : stryMutAct_9fa48("60896") ? false : (stryCov_9fa48("60896", "60897"), typeof publicationStatus !== TYPEOF.STRING)) || (stryMutAct_9fa48("60899") ? publicationStatus.length !== NUM.ZERO : stryMutAct_9fa48("60898") ? false : (stryCov_9fa48("60898", "60899"), publicationStatus.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("60900")) {
          {}
        } else {
          stryCov_9fa48("60900");
          return this.buildStartupAuthorityUnavailableSnapshot(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_INCOMPLETE, null, stryMutAct_9fa48("60901") ? {} : (stryCov_9fa48("60901"), {
            publicationEpoch: Number.isFinite(planningSnapshot.publicationEpoch) ? planningSnapshot.publicationEpoch : undefined,
            publicationStatus: stryMutAct_9fa48("60904") ? publicationStatus && undefined : stryMutAct_9fa48("60903") ? false : stryMutAct_9fa48("60902") ? true : (stryCov_9fa48("60902", "60903", "60904"), publicationStatus || undefined),
            publicationObservationState,
            canonicalStartupNodeIds
          }));
        }
      }
      if (stryMutAct_9fa48("60907") ? !priorityPartitionSummary && typeof priorityPartitionSummary.satisfied !== TYPEOF.BOOLEAN : stryMutAct_9fa48("60906") ? false : stryMutAct_9fa48("60905") ? true : (stryCov_9fa48("60905", "60906", "60907"), (stryMutAct_9fa48("60908") ? priorityPartitionSummary : (stryCov_9fa48("60908"), !priorityPartitionSummary)) || (stryMutAct_9fa48("60910") ? typeof priorityPartitionSummary.satisfied === TYPEOF.BOOLEAN : stryMutAct_9fa48("60909") ? false : (stryCov_9fa48("60909", "60910"), typeof priorityPartitionSummary.satisfied !== TYPEOF.BOOLEAN)))) {
        if (stryMutAct_9fa48("60911")) {
          {}
        } else {
          stryCov_9fa48("60911");
          return this.buildStartupAuthorityUnavailableSnapshot(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_INCOMPLETE, null, stryMutAct_9fa48("60912") ? {} : (stryCov_9fa48("60912"), {
            publicationEpoch: Number.isFinite(planningSnapshot.publicationEpoch) ? planningSnapshot.publicationEpoch : undefined,
            publicationStatus,
            priorityPartitionSummary,
            recoveryProtocolState: (stryMutAct_9fa48("60915") ? typeof planningSnapshot.recoveryProtocolState !== TYPEOF.STRING : stryMutAct_9fa48("60914") ? false : stryMutAct_9fa48("60913") ? true : (stryCov_9fa48("60913", "60914", "60915"), typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING)) ? planningSnapshot.recoveryProtocolState : undefined,
            targetParticipation: (stryMutAct_9fa48("60918") ? planningSnapshot.targetParticipation || typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT : stryMutAct_9fa48("60917") ? false : stryMutAct_9fa48("60916") ? true : (stryCov_9fa48("60916", "60917", "60918"), planningSnapshot.targetParticipation && (stryMutAct_9fa48("60920") ? typeof planningSnapshot.targetParticipation !== TYPEOF.OBJECT : stryMutAct_9fa48("60919") ? true : (stryCov_9fa48("60919", "60920"), typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT)))) ? planningSnapshot.targetParticipation : undefined,
            canonicalStartupNodeIds
          }));
        }
      }
      const targetParticipation = (stryMutAct_9fa48("60923") ? planningSnapshot.targetParticipation || typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT : stryMutAct_9fa48("60922") ? false : stryMutAct_9fa48("60921") ? true : (stryCov_9fa48("60921", "60922", "60923"), planningSnapshot.targetParticipation && (stryMutAct_9fa48("60925") ? typeof planningSnapshot.targetParticipation !== TYPEOF.OBJECT : stryMutAct_9fa48("60924") ? true : (stryCov_9fa48("60924", "60925"), typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT)))) ? planningSnapshot.targetParticipation : null;
      const targetParticipationReasons = Array.isArray(stryMutAct_9fa48("60926") ? targetParticipation.reasons : (stryCov_9fa48("60926"), targetParticipation?.reasons)) ? stryMutAct_9fa48("60927") ? [] : (stryCov_9fa48("60927"), [...targetParticipation.reasons]) : stryMutAct_9fa48("60928") ? ["Stryker was here"] : (stryCov_9fa48("60928"), []);
      const priorityRecoveryReasonCodes = stryMutAct_9fa48("60929") ? [] : (stryCov_9fa48("60929"), [...new Set(stryMutAct_9fa48("60930") ? [] : (stryCov_9fa48("60930"), [...(Array.isArray(planningSnapshot.priorityRecoveryReasonCodes) ? planningSnapshot.priorityRecoveryReasonCodes : stryMutAct_9fa48("60931") ? ["Stryker was here"] : (stryCov_9fa48("60931"), [])), ...targetParticipationReasons]))]);
      const blocked = stryMutAct_9fa48("60934") ? targetParticipationReasons.length > NUM.ZERO || canonicalStartupNodeIds.length === NUM.ZERO : stryMutAct_9fa48("60933") ? false : stryMutAct_9fa48("60932") ? true : (stryCov_9fa48("60932", "60933", "60934"), (stryMutAct_9fa48("60937") ? targetParticipationReasons.length <= NUM.ZERO : stryMutAct_9fa48("60936") ? targetParticipationReasons.length >= NUM.ZERO : stryMutAct_9fa48("60935") ? true : (stryCov_9fa48("60935", "60936", "60937"), targetParticipationReasons.length > NUM.ZERO)) && (stryMutAct_9fa48("60939") ? canonicalStartupNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("60938") ? true : (stryCov_9fa48("60938", "60939"), canonicalStartupNodeIds.length === NUM.ZERO)));
      const state = blocked ? STARTUP_AUTHORITY_STATE.BLOCKED : (stryMutAct_9fa48("60943") ? priorityRecoveryReasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("60942") ? priorityRecoveryReasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("60941") ? false : stryMutAct_9fa48("60940") ? true : (stryCov_9fa48("60940", "60941", "60942", "60943"), priorityRecoveryReasonCodes.length > NUM.ZERO)) ? STARTUP_AUTHORITY_STATE.RECOVERY_PENDING : STARTUP_AUTHORITY_STATE.READY;
      return this.buildStartupAuthoritySnapshotContract(stryMutAct_9fa48("60944") ? {} : (stryCov_9fa48("60944"), {
        state,
        ready: stryMutAct_9fa48("60947") ? state !== STARTUP_AUTHORITY_STATE.READY : stryMutAct_9fa48("60946") ? false : stryMutAct_9fa48("60945") ? true : (stryCov_9fa48("60945", "60946", "60947"), state === STARTUP_AUTHORITY_STATE.READY),
        authorityAvailable: stryMutAct_9fa48("60948") ? false : (stryCov_9fa48("60948"), true),
        publicationEpoch: Number.isFinite(planningSnapshot.publicationEpoch) ? planningSnapshot.publicationEpoch : undefined,
        publicationStatus,
        publicationObservationState: stryMutAct_9fa48("60951") ? publicationObservationState && (state === STARTUP_AUTHORITY_STATE.READY ? 'authoritative' : 'establishing') : stryMutAct_9fa48("60950") ? false : stryMutAct_9fa48("60949") ? true : (stryCov_9fa48("60949", "60950", "60951"), publicationObservationState || ((stryMutAct_9fa48("60954") ? state !== STARTUP_AUTHORITY_STATE.READY : stryMutAct_9fa48("60953") ? false : stryMutAct_9fa48("60952") ? true : (stryCov_9fa48("60952", "60953", "60954"), state === STARTUP_AUTHORITY_STATE.READY)) ? stryMutAct_9fa48("60955") ? "" : (stryCov_9fa48("60955"), 'authoritative') : stryMutAct_9fa48("60956") ? "" : (stryCov_9fa48("60956"), 'establishing'))),
        priorityPartitionSummary,
        recoveryProtocolState: (stryMutAct_9fa48("60959") ? typeof planningSnapshot.recoveryProtocolState !== TYPEOF.STRING : stryMutAct_9fa48("60958") ? false : stryMutAct_9fa48("60957") ? true : (stryCov_9fa48("60957", "60958", "60959"), typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING)) ? planningSnapshot.recoveryProtocolState : undefined,
        targetParticipation: stryMutAct_9fa48("60962") ? targetParticipation && undefined : stryMutAct_9fa48("60961") ? false : stryMutAct_9fa48("60960") ? true : (stryCov_9fa48("60960", "60961", "60962"), targetParticipation || undefined),
        priorityRecoveryReasonCodes,
        canonicalStartupNodeIds
      }));
    }
  }
  getStartupAuthoritySnapshotSync(nodeId = this.nodeId, observedAt = this.now()) {
    if (stryMutAct_9fa48("60963")) {
      {}
    } else {
      stryCov_9fa48("60963");
      try {
        if (stryMutAct_9fa48("60964")) {
          {}
        } else {
          stryCov_9fa48("60964");
          return this.buildStartupAuthoritySnapshotFromPlanningAnswer(this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt));
        }
      } catch (error) {
        if (stryMutAct_9fa48("60965")) {
          {}
        } else {
          stryCov_9fa48("60965");
          return this.buildStartupAuthorityUnavailableSnapshot(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED, error);
        }
      }
    }
  }
  async getStartupAuthoritySnapshot(nodeId = this.nodeId, observedAt = this.now()) {
    if (stryMutAct_9fa48("60966")) {
      {}
    } else {
      stryCov_9fa48("60966");
      try {
        if (stryMutAct_9fa48("60967")) {
          {}
        } else {
          stryCov_9fa48("60967");
          return this.buildStartupAuthoritySnapshotFromPlanningAnswer(await this.getPriorityRecoveryPlanningAnswerBestEffort(nodeId, observedAt));
        }
      } catch (error) {
        if (stryMutAct_9fa48("60968")) {
          {}
        } else {
          stryCov_9fa48("60968");
          return this.buildStartupAuthorityUnavailableSnapshot(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED, error);
        }
      }
    }
  }
  buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(planningSnapshot) {
    if (stryMutAct_9fa48("60969")) {
      {}
    } else {
      stryCov_9fa48("60969");
      const startupAuthority = this.buildStartupAuthoritySnapshotFromPlanningAnswer(planningSnapshot);
      if (stryMutAct_9fa48("60972") ? startupAuthority.authorityAvailable === true : stryMutAct_9fa48("60971") ? false : stryMutAct_9fa48("60970") ? true : (stryCov_9fa48("60970", "60971", "60972"), startupAuthority.authorityAvailable !== (stryMutAct_9fa48("60973") ? false : (stryCov_9fa48("60973"), true)))) {
        if (stryMutAct_9fa48("60974")) {
          {}
        } else {
          stryCov_9fa48("60974");
          const details = this.buildPriorityRecoveryHealthDetailsFromStartupAuthority(startupAuthority);
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth((stryMutAct_9fa48("60977") ? startupAuthority.failure.state !== 'present' : stryMutAct_9fa48("60976") ? false : stryMutAct_9fa48("60975") ? true : (stryCov_9fa48("60975", "60976", "60977"), startupAuthority.failure.state === (stryMutAct_9fa48("60978") ? "" : (stryCov_9fa48("60978"), 'present')))) ? startupAuthority.failure.reason : PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_UNAVAILABLE, null, details);
        }
      }
      const reasonCodes = Array.isArray(startupAuthority.priorityRecoveryReasonCodes) ? stryMutAct_9fa48("60979") ? [] : (stryCov_9fa48("60979"), [...startupAuthority.priorityRecoveryReasonCodes]) : stryMutAct_9fa48("60980") ? ["Stryker was here"] : (stryCov_9fa48("60980"), []);
      return Object.freeze(stryMutAct_9fa48("60981") ? {} : (stryCov_9fa48("60981"), {
        healthy: stryMutAct_9fa48("60984") ? startupAuthority.state !== STARTUP_AUTHORITY_STATE.READY : stryMutAct_9fa48("60983") ? false : stryMutAct_9fa48("60982") ? true : (stryCov_9fa48("60982", "60983", "60984"), startupAuthority.state === STARTUP_AUTHORITY_STATE.READY),
        reasonCode: CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        ...((stryMutAct_9fa48("60987") ? startupAuthority.state === STARTUP_AUTHORITY_STATE.READY : stryMutAct_9fa48("60986") ? false : stryMutAct_9fa48("60985") ? true : (stryCov_9fa48("60985", "60986", "60987"), startupAuthority.state !== STARTUP_AUTHORITY_STATE.READY)) ? stryMutAct_9fa48("60988") ? {} : (stryCov_9fa48("60988"), {
          details: this.buildPriorityRecoveryHealthDetailsFromStartupAuthority(startupAuthority, reasonCodes)
        }) : {})
      }));
    }
  }
  getPriorityControlPlaneRecoveryHealthSync(nodeId = this.nodeId, observedAt = this.now()) {
    if (stryMutAct_9fa48("60989")) {
      {}
    } else {
      stryCov_9fa48("60989");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("60992") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("60991") ? false : stryMutAct_9fa48("60990") ? true : (stryCov_9fa48("60990", "60991", "60992"), (stryMutAct_9fa48("60993") ? service : (stryCov_9fa48("60993"), !service)) || (stryMutAct_9fa48("60995") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("60994") ? false : (stryCov_9fa48("60994", "60995"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("60996")) {
          {}
        } else {
          stryCov_9fa48("60996");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE);
        }
      }
      const hasPlanningProvider = stryMutAct_9fa48("60999") ? typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION && typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION : stryMutAct_9fa48("60998") ? false : stryMutAct_9fa48("60997") ? true : (stryCov_9fa48("60997", "60998", "60999"), (stryMutAct_9fa48("61001") ? typeof service.getLatestClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("61000") ? false : (stryCov_9fa48("61000", "61001"), typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION)) || (stryMutAct_9fa48("61003") ? typeof service.getLatestPublicationForNodeSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("61002") ? false : (stryCov_9fa48("61002", "61003"), typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION)));
      if (stryMutAct_9fa48("61006") ? false : stryMutAct_9fa48("61005") ? true : stryMutAct_9fa48("61004") ? hasPlanningProvider : (stryCov_9fa48("61004", "61005", "61006"), !hasPlanningProvider)) {
        if (stryMutAct_9fa48("61007")) {
          {}
        } else {
          stryCov_9fa48("61007");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_PROVIDER_UNAVAILABLE);
        }
      }
      try {
        if (stryMutAct_9fa48("61008")) {
          {}
        } else {
          stryCov_9fa48("61008");
          return this.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt));
        }
      } catch (error) {
        if (stryMutAct_9fa48("61009")) {
          {}
        } else {
          stryCov_9fa48("61009");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED, error);
        }
      }
    }
  }
  async getPriorityControlPlaneRecoveryHealth(nodeId = this.nodeId, observedAt = this.now()) {
    if (stryMutAct_9fa48("61010")) {
      {}
    } else {
      stryCov_9fa48("61010");
      const service = this.membershipPublicationService;
      if (stryMutAct_9fa48("61013") ? !service && typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("61012") ? false : stryMutAct_9fa48("61011") ? true : (stryCov_9fa48("61011", "61012", "61013"), (stryMutAct_9fa48("61014") ? service : (stryCov_9fa48("61014"), !service)) || (stryMutAct_9fa48("61016") ? typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("61015") ? false : (stryCov_9fa48("61015", "61016"), typeof service !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("61017")) {
          {}
        } else {
          stryCov_9fa48("61017");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE);
        }
      }
      const hasPlanningProvider = stryMutAct_9fa48("61020") ? (typeof service.getLatestClusterPublication === TYPEOF.FUNCTION || typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION || typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION) && typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION : stryMutAct_9fa48("61019") ? false : stryMutAct_9fa48("61018") ? true : (stryCov_9fa48("61018", "61019", "61020"), (stryMutAct_9fa48("61022") ? (typeof service.getLatestClusterPublication === TYPEOF.FUNCTION || typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION) && typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION : stryMutAct_9fa48("61021") ? false : (stryCov_9fa48("61021", "61022"), (stryMutAct_9fa48("61024") ? typeof service.getLatestClusterPublication === TYPEOF.FUNCTION && typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION : stryMutAct_9fa48("61023") ? false : (stryCov_9fa48("61023", "61024"), (stryMutAct_9fa48("61026") ? typeof service.getLatestClusterPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("61025") ? false : (stryCov_9fa48("61025", "61026"), typeof service.getLatestClusterPublication === TYPEOF.FUNCTION)) || (stryMutAct_9fa48("61028") ? typeof service.getLatestPublicationForNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("61027") ? false : (stryCov_9fa48("61027", "61028"), typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("61030") ? typeof service.getLatestClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("61029") ? false : (stryCov_9fa48("61029", "61030"), typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("61032") ? typeof service.getLatestPublicationForNodeSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("61031") ? false : (stryCov_9fa48("61031", "61032"), typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION)));
      if (stryMutAct_9fa48("61035") ? false : stryMutAct_9fa48("61034") ? true : stryMutAct_9fa48("61033") ? hasPlanningProvider : (stryCov_9fa48("61033", "61034", "61035"), !hasPlanningProvider)) {
        if (stryMutAct_9fa48("61036")) {
          {}
        } else {
          stryCov_9fa48("61036");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_PROVIDER_UNAVAILABLE);
        }
      }
      try {
        if (stryMutAct_9fa48("61037")) {
          {}
        } else {
          stryCov_9fa48("61037");
          return this.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(await this.getPriorityRecoveryPlanningAnswerBestEffort(nodeId, observedAt));
        }
      } catch (error) {
        if (stryMutAct_9fa48("61038")) {
          {}
        } else {
          stryCov_9fa48("61038");
          return this.buildPriorityControlPlaneRecoveryUnavailableHealth(PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED, error);
        }
      }
    }
  }
  getCapacitySnapshotSync(nodeId, _nodeRow) {
    if (stryMutAct_9fa48("61039")) {
      {}
    } else {
      stryCov_9fa48("61039");
      if (stryMutAct_9fa48("61042") ? this.storageAccountingService || typeof this.storageAccountingService.getCapacitySnapshotForNodeSync === TYPEOF.FUNCTION : stryMutAct_9fa48("61041") ? false : stryMutAct_9fa48("61040") ? true : (stryCov_9fa48("61040", "61041", "61042"), this.storageAccountingService && (stryMutAct_9fa48("61044") ? typeof this.storageAccountingService.getCapacitySnapshotForNodeSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("61043") ? true : (stryCov_9fa48("61043", "61044"), typeof this.storageAccountingService.getCapacitySnapshotForNodeSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61045")) {
          {}
        } else {
          stryCov_9fa48("61045");
          return this.storageAccountingService.getCapacitySnapshotForNodeSync(nodeId);
        }
      }
      return null;
    }
  }
  getPriorityControlPlaneRecoveryState(context = {}) {
    if (stryMutAct_9fa48("61046")) {
      {}
    } else {
      stryCov_9fa48("61046");
      const dimensions = (stryMutAct_9fa48("61049") ? context.dimensions || typeof context.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("61048") ? false : stryMutAct_9fa48("61047") ? true : (stryCov_9fa48("61047", "61048", "61049"), context.dimensions && (stryMutAct_9fa48("61051") ? typeof context.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("61050") ? true : (stryCov_9fa48("61050", "61051"), typeof context.dimensions === TYPEOF.OBJECT)))) ? context.dimensions : {};
      const membershipPublication = (stryMutAct_9fa48("61054") ? context.membershipPublication || typeof context.membershipPublication === TYPEOF.OBJECT : stryMutAct_9fa48("61053") ? false : stryMutAct_9fa48("61052") ? true : (stryCov_9fa48("61052", "61053", "61054"), context.membershipPublication && (stryMutAct_9fa48("61056") ? typeof context.membershipPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("61055") ? true : (stryCov_9fa48("61055", "61056"), typeof context.membershipPublication === TYPEOF.OBJECT)))) ? context.membershipPublication : null;
      const planningSnapshot = this.buildMembershipPublicationPlanningSnapshot(stryMutAct_9fa48("61057") ? {} : (stryCov_9fa48("61057"), {
        nodeId: context.nodeId,
        observedAt: context.observedAt,
        membershipPublication
      }));
      const priorityPartitionSummary = stryMutAct_9fa48("61060") ? planningSnapshot?.priorityPartitionSummary && null : stryMutAct_9fa48("61059") ? false : stryMutAct_9fa48("61058") ? true : (stryCov_9fa48("61058", "61059", "61060"), (stryMutAct_9fa48("61061") ? planningSnapshot.priorityPartitionSummary : (stryCov_9fa48("61061"), planningSnapshot?.priorityPartitionSummary)) || null);
      const reasonCodes = Array.isArray(stryMutAct_9fa48("61062") ? planningSnapshot.priorityRecoveryReasonCodes : (stryCov_9fa48("61062"), planningSnapshot?.priorityRecoveryReasonCodes)) ? stryMutAct_9fa48("61063") ? [] : (stryCov_9fa48("61063"), [...planningSnapshot.priorityRecoveryReasonCodes]) : stryMutAct_9fa48("61064") ? ["Stryker was here"] : (stryCov_9fa48("61064"), []);
      if (stryMutAct_9fa48("61067") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === true : stryMutAct_9fa48("61066") ? false : stryMutAct_9fa48("61065") ? true : (stryCov_9fa48("61065", "61066", "61067"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== (stryMutAct_9fa48("61068") ? false : (stryCov_9fa48("61068"), true)))) {
        if (stryMutAct_9fa48("61069")) {
          {}
        } else {
          stryCov_9fa48("61069");
          reasonCodes.push(CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE);
        }
      }
      const publicationPendingReasonCodePresent = reasonCodes.includes(CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING);
      const controlPlaneNotWritable = reasonCodes.includes(CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE);
      if (stryMutAct_9fa48("61072") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true && !publicationPendingReasonCodePresent || !controlPlaneNotWritable : stryMutAct_9fa48("61071") ? false : stryMutAct_9fa48("61070") ? true : (stryCov_9fa48("61070", "61071", "61072"), (stryMutAct_9fa48("61074") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true || !publicationPendingReasonCodePresent : stryMutAct_9fa48("61073") ? true : (stryCov_9fa48("61073", "61074"), (stryMutAct_9fa48("61076") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true : stryMutAct_9fa48("61075") ? true : (stryCov_9fa48("61075", "61076"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== (stryMutAct_9fa48("61077") ? false : (stryCov_9fa48("61077"), true)))) && (stryMutAct_9fa48("61078") ? publicationPendingReasonCodePresent : (stryCov_9fa48("61078"), !publicationPendingReasonCodePresent)))) && (stryMutAct_9fa48("61079") ? controlPlaneNotWritable : (stryCov_9fa48("61079"), !controlPlaneNotWritable)))) {
        if (stryMutAct_9fa48("61080")) {
          {}
        } else {
          stryCov_9fa48("61080");
          reasonCodes.push(CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING);
        }
      }
      const dedupedReasonCodes = Object.freeze(stryMutAct_9fa48("61081") ? [] : (stryCov_9fa48("61081"), [...new Set(reasonCodes)]));
      const enteredAt = stryMutAct_9fa48("61084") ? (membershipPublication?.createdAt || membershipPublication?.updatedAt || normalizeDiagnosticTimestampMs(context.observedAt)) && this.now() : stryMutAct_9fa48("61083") ? false : stryMutAct_9fa48("61082") ? true : (stryCov_9fa48("61082", "61083", "61084"), (stryMutAct_9fa48("61086") ? (membershipPublication?.createdAt || membershipPublication?.updatedAt) && normalizeDiagnosticTimestampMs(context.observedAt) : stryMutAct_9fa48("61085") ? false : (stryCov_9fa48("61085", "61086"), (stryMutAct_9fa48("61088") ? membershipPublication?.createdAt && membershipPublication?.updatedAt : stryMutAct_9fa48("61087") ? false : (stryCov_9fa48("61087", "61088"), (stryMutAct_9fa48("61089") ? membershipPublication.createdAt : (stryCov_9fa48("61089"), membershipPublication?.createdAt)) || (stryMutAct_9fa48("61090") ? membershipPublication.updatedAt : (stryCov_9fa48("61090"), membershipPublication?.updatedAt)))) || normalizeDiagnosticTimestampMs(context.observedAt))) || this.now());
      return Object.freeze(stryMutAct_9fa48("61091") ? {} : (stryCov_9fa48("61091"), {
        active: stryMutAct_9fa48("61095") ? dedupedReasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("61094") ? dedupedReasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("61093") ? false : stryMutAct_9fa48("61092") ? true : (stryCov_9fa48("61092", "61093", "61094", "61095"), dedupedReasonCodes.length > NUM.ZERO),
        reasonCodes: dedupedReasonCodes,
        publicationEpoch: stryMutAct_9fa48("61096") ? (planningSnapshot?.publicationEpoch ?? membershipPublication?.publicationEpoch) && null : (stryCov_9fa48("61096"), (stryMutAct_9fa48("61097") ? planningSnapshot?.publicationEpoch && membershipPublication?.publicationEpoch : (stryCov_9fa48("61097"), (stryMutAct_9fa48("61098") ? planningSnapshot.publicationEpoch : (stryCov_9fa48("61098"), planningSnapshot?.publicationEpoch)) ?? (stryMutAct_9fa48("61099") ? membershipPublication.publicationEpoch : (stryCov_9fa48("61099"), membershipPublication?.publicationEpoch)))) ?? null),
        publicationStatus: stryMutAct_9fa48("61100") ? planningSnapshot?.publicationStatus && (membershipPublication?.status || null) : (stryCov_9fa48("61100"), (stryMutAct_9fa48("61101") ? planningSnapshot.publicationStatus : (stryCov_9fa48("61101"), planningSnapshot?.publicationStatus)) ?? (stryMutAct_9fa48("61104") ? membershipPublication?.status && null : stryMutAct_9fa48("61103") ? false : stryMutAct_9fa48("61102") ? true : (stryCov_9fa48("61102", "61103", "61104"), (stryMutAct_9fa48("61105") ? membershipPublication.status : (stryCov_9fa48("61105"), membershipPublication?.status)) || null))),
        priorityPartitionSummary,
        enteredAt
      }));
    }
  }

  /**
   * Return true when the local node already has stronger self-owned readiness
   * evidence than an immediate authoritative repair would provide.
   *
   * The local node's active status plus locally hosted control-plane services
   * are sufficient to keep self admission open while CDC catches up. Forcing a
   * synchronous read-your-own-write round-trip to the seed on every stale local
   * heartbeat only recreates the chokepoint we are trying to avoid.
   *
   * @param {Object} context
   * @param {string|null} context.nodeId
   * @param {Object|null} context.nodeRow
   * @param {Object[]} context.serviceRows
   * @return {boolean}
   * @private
   */
  shouldPreferLocalSelfNodeEvidence(context = {}) {
    if (stryMutAct_9fa48("61106")) {
      {}
    } else {
      stryCov_9fa48("61106");
      const nodeId = stryMutAct_9fa48("61109") ? context?.nodeId && null : stryMutAct_9fa48("61108") ? false : stryMutAct_9fa48("61107") ? true : (stryCov_9fa48("61107", "61108", "61109"), (stryMutAct_9fa48("61110") ? context.nodeId : (stryCov_9fa48("61110"), context?.nodeId)) || null);
      if (stryMutAct_9fa48("61113") ? !nodeId && nodeId !== this.nodeId : stryMutAct_9fa48("61112") ? false : stryMutAct_9fa48("61111") ? true : (stryCov_9fa48("61111", "61112", "61113"), (stryMutAct_9fa48("61114") ? nodeId : (stryCov_9fa48("61114"), !nodeId)) || (stryMutAct_9fa48("61116") ? nodeId === this.nodeId : stryMutAct_9fa48("61115") ? false : (stryCov_9fa48("61115", "61116"), nodeId !== this.nodeId)))) {
        if (stryMutAct_9fa48("61117")) {
          {}
        } else {
          stryCov_9fa48("61117");
          return stryMutAct_9fa48("61118") ? true : (stryCov_9fa48("61118"), false);
        }
      }
      const nodeRow = stryMutAct_9fa48("61121") ? context?.nodeRow && null : stryMutAct_9fa48("61120") ? false : stryMutAct_9fa48("61119") ? true : (stryCov_9fa48("61119", "61120", "61121"), (stryMutAct_9fa48("61122") ? context.nodeRow : (stryCov_9fa48("61122"), context?.nodeRow)) || null);
      if (stryMutAct_9fa48("61125") ? !nodeRow && typeof nodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("61124") ? false : stryMutAct_9fa48("61123") ? true : (stryCov_9fa48("61123", "61124", "61125"), (stryMutAct_9fa48("61126") ? nodeRow : (stryCov_9fa48("61126"), !nodeRow)) || (stryMutAct_9fa48("61128") ? typeof nodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("61127") ? false : (stryCov_9fa48("61127", "61128"), typeof nodeRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("61129")) {
          {}
        } else {
          stryCov_9fa48("61129");
          return stryMutAct_9fa48("61130") ? true : (stryCov_9fa48("61130"), false);
        }
      }
      const status = stryMutAct_9fa48("61131") ? String(nodeRow?.[COLUMN.STATUS] || '').toUpperCase() : (stryCov_9fa48("61131"), String(stryMutAct_9fa48("61134") ? nodeRow?.[COLUMN.STATUS] && '' : stryMutAct_9fa48("61133") ? false : stryMutAct_9fa48("61132") ? true : (stryCov_9fa48("61132", "61133", "61134"), (stryMutAct_9fa48("61135") ? nodeRow[COLUMN.STATUS] : (stryCov_9fa48("61135"), nodeRow?.[COLUMN.STATUS])) || (stryMutAct_9fa48("61136") ? "Stryker was here!" : (stryCov_9fa48("61136"), '')))).toLowerCase());
      if (stryMutAct_9fa48("61139") ? status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("61138") ? false : stryMutAct_9fa48("61137") ? true : (stryCov_9fa48("61137", "61138", "61139"), status !== SERVICE_STATUS.ACTIVE)) {
        if (stryMutAct_9fa48("61140")) {
          {}
        } else {
          stryCov_9fa48("61140");
          return stryMutAct_9fa48("61141") ? true : (stryCov_9fa48("61141"), false);
        }
      }
      const serviceRows = Array.isArray(stryMutAct_9fa48("61142") ? context.serviceRows : (stryCov_9fa48("61142"), context?.serviceRows)) ? context.serviceRows : stryMutAct_9fa48("61143") ? ["Stryker was here"] : (stryCov_9fa48("61143"), []);
      return stryMutAct_9fa48("61146") ? this.hasRoutableService(serviceRows) || this.hasWritableControlPlaneService(serviceRows) : stryMutAct_9fa48("61145") ? false : stryMutAct_9fa48("61144") ? true : (stryCov_9fa48("61144", "61145", "61146"), this.hasRoutableService(serviceRows) && this.hasWritableControlPlaneService(serviceRows));
    }
  }
  async readNodeRow(nodeId, options = {}) {
    if (stryMutAct_9fa48("61147")) {
      {}
    } else {
      stryCov_9fa48("61147");
      if (stryMutAct_9fa48("61149") ? false : stryMutAct_9fa48("61148") ? true : (stryCov_9fa48("61148", "61149"), Array.isArray(options.allNodeRows))) {
        if (stryMutAct_9fa48("61150")) {
          {}
        } else {
          stryCov_9fa48("61150");
          return stryMutAct_9fa48("61153") ? options.allNodeRows.find(row => row?.[COLUMN.NODE_ID] === nodeId) && null : stryMutAct_9fa48("61152") ? false : stryMutAct_9fa48("61151") ? true : (stryCov_9fa48("61151", "61152", "61153"), options.allNodeRows.find(stryMutAct_9fa48("61154") ? () => undefined : (stryCov_9fa48("61154"), row => stryMutAct_9fa48("61157") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("61156") ? false : stryMutAct_9fa48("61155") ? true : (stryCov_9fa48("61155", "61156", "61157"), (stryMutAct_9fa48("61158") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("61158"), row?.[COLUMN.NODE_ID])) === nodeId))) || null);
        }
      }
      if (stryMutAct_9fa48("61161") ? options.allowAuthoritativeRefresh === true && this.nodesOwner || typeof this.nodesOwner.getNode === TYPEOF.FUNCTION : stryMutAct_9fa48("61160") ? false : stryMutAct_9fa48("61159") ? true : (stryCov_9fa48("61159", "61160", "61161"), (stryMutAct_9fa48("61163") ? options.allowAuthoritativeRefresh === true || this.nodesOwner : stryMutAct_9fa48("61162") ? true : (stryCov_9fa48("61162", "61163"), (stryMutAct_9fa48("61165") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("61164") ? true : (stryCov_9fa48("61164", "61165"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("61166") ? false : (stryCov_9fa48("61166"), true)))) && this.nodesOwner)) && (stryMutAct_9fa48("61168") ? typeof this.nodesOwner.getNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("61167") ? true : (stryCov_9fa48("61167", "61168"), typeof this.nodesOwner.getNode === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61169")) {
          {}
        } else {
          stryCov_9fa48("61169");
          const result = await this.nodesOwner.getNode(nodeId, options);
          return unwrapRowReadResult(result);
        }
      }
      if (stryMutAct_9fa48("61172") ? this.nodesOwner || typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("61171") ? false : stryMutAct_9fa48("61170") ? true : (stryCov_9fa48("61170", "61171", "61172"), this.nodesOwner && (stryMutAct_9fa48("61174") ? typeof this.nodesOwner.getNodeFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("61173") ? true : (stryCov_9fa48("61173", "61174"), typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61175")) {
          {}
        } else {
          stryCov_9fa48("61175");
          const result = await this.nodesOwner.getNodeFromCache(nodeId, options);
          return unwrapRowReadResult(result);
        }
      }
      return this.getNodeRow(nodeId);
    }
  }
  async readNodeRows(options = {}) {
    if (stryMutAct_9fa48("61176")) {
      {}
    } else {
      stryCov_9fa48("61176");
      if (stryMutAct_9fa48("61179") ? options.allowAuthoritativeRefresh === true && this.nodesOwner || typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION : stryMutAct_9fa48("61178") ? false : stryMutAct_9fa48("61177") ? true : (stryCov_9fa48("61177", "61178", "61179"), (stryMutAct_9fa48("61181") ? options.allowAuthoritativeRefresh === true || this.nodesOwner : stryMutAct_9fa48("61180") ? true : (stryCov_9fa48("61180", "61181"), (stryMutAct_9fa48("61183") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("61182") ? true : (stryCov_9fa48("61182", "61183"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("61184") ? false : (stryCov_9fa48("61184"), true)))) && this.nodesOwner)) && (stryMutAct_9fa48("61186") ? typeof this.nodesOwner.listNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("61185") ? true : (stryCov_9fa48("61185", "61186"), typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61187")) {
          {}
        } else {
          stryCov_9fa48("61187");
          const result = await this.nodesOwner.listNodes(options);
          return Array.isArray(stryMutAct_9fa48("61188") ? result.rows : (stryCov_9fa48("61188"), result?.rows)) ? result.rows : stryMutAct_9fa48("61189") ? ["Stryker was here"] : (stryCov_9fa48("61189"), []);
        }
      }
      if (stryMutAct_9fa48("61192") ? this.nodesOwner || typeof this.nodesOwner.listNodesFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("61191") ? false : stryMutAct_9fa48("61190") ? true : (stryCov_9fa48("61190", "61191", "61192"), this.nodesOwner && (stryMutAct_9fa48("61194") ? typeof this.nodesOwner.listNodesFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("61193") ? true : (stryCov_9fa48("61193", "61194"), typeof this.nodesOwner.listNodesFromCache === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61195")) {
          {}
        } else {
          stryCov_9fa48("61195");
          const result = await this.nodesOwner.listNodesFromCache(options);
          return Array.isArray(stryMutAct_9fa48("61196") ? result.rows : (stryCov_9fa48("61196"), result?.rows)) ? result.rows : stryMutAct_9fa48("61197") ? ["Stryker was here"] : (stryCov_9fa48("61197"), []);
        }
      }
      return this.getNodeRows();
    }
  }
  async readNodeServiceRows(nodeId, options = {}) {
    if (stryMutAct_9fa48("61198")) {
      {}
    } else {
      stryCov_9fa48("61198");
      if (stryMutAct_9fa48("61200") ? false : stryMutAct_9fa48("61199") ? true : (stryCov_9fa48("61199", "61200"), Array.isArray(options.allServiceRows))) {
        if (stryMutAct_9fa48("61201")) {
          {}
        } else {
          stryCov_9fa48("61201");
          return stryMutAct_9fa48("61202") ? options.allServiceRows : (stryCov_9fa48("61202"), options.allServiceRows.filter(stryMutAct_9fa48("61203") ? () => undefined : (stryCov_9fa48("61203"), row => stryMutAct_9fa48("61206") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("61205") ? false : stryMutAct_9fa48("61204") ? true : (stryCov_9fa48("61204", "61205", "61206"), (stryMutAct_9fa48("61207") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("61207"), row?.[COLUMN.NODE_ID])) === nodeId))));
        }
      }
      if (stryMutAct_9fa48("61210") ? options.allowAuthoritativeRefresh === true && this.servicesOwner || typeof this.servicesOwner.listServices === TYPEOF.FUNCTION : stryMutAct_9fa48("61209") ? false : stryMutAct_9fa48("61208") ? true : (stryCov_9fa48("61208", "61209", "61210"), (stryMutAct_9fa48("61212") ? options.allowAuthoritativeRefresh === true || this.servicesOwner : stryMutAct_9fa48("61211") ? true : (stryCov_9fa48("61211", "61212"), (stryMutAct_9fa48("61214") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("61213") ? true : (stryCov_9fa48("61213", "61214"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("61215") ? false : (stryCov_9fa48("61215"), true)))) && this.servicesOwner)) && (stryMutAct_9fa48("61217") ? typeof this.servicesOwner.listServices !== TYPEOF.FUNCTION : stryMutAct_9fa48("61216") ? true : (stryCov_9fa48("61216", "61217"), typeof this.servicesOwner.listServices === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61218")) {
          {}
        } else {
          stryCov_9fa48("61218");
          const result = await this.servicesOwner.listServices(options);
          return Array.isArray(stryMutAct_9fa48("61219") ? result.rows : (stryCov_9fa48("61219"), result?.rows)) ? stryMutAct_9fa48("61220") ? result.rows : (stryCov_9fa48("61220"), result.rows.filter(stryMutAct_9fa48("61221") ? () => undefined : (stryCov_9fa48("61221"), row => stryMutAct_9fa48("61224") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("61223") ? false : stryMutAct_9fa48("61222") ? true : (stryCov_9fa48("61222", "61223", "61224"), (stryMutAct_9fa48("61225") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("61225"), row?.[COLUMN.NODE_ID])) === nodeId)))) : stryMutAct_9fa48("61226") ? ["Stryker was here"] : (stryCov_9fa48("61226"), []);
        }
      }
      if (stryMutAct_9fa48("61229") ? this.servicesOwner || typeof this.servicesOwner.listServicesForNodeFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("61228") ? false : stryMutAct_9fa48("61227") ? true : (stryCov_9fa48("61227", "61228", "61229"), this.servicesOwner && (stryMutAct_9fa48("61231") ? typeof this.servicesOwner.listServicesForNodeFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("61230") ? true : (stryCov_9fa48("61230", "61231"), typeof this.servicesOwner.listServicesForNodeFromCache === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61232")) {
          {}
        } else {
          stryCov_9fa48("61232");
          const result = await this.servicesOwner.listServicesForNodeFromCache(nodeId, options);
          return Array.isArray(stryMutAct_9fa48("61233") ? result.rows : (stryCov_9fa48("61233"), result?.rows)) ? result.rows : stryMutAct_9fa48("61234") ? ["Stryker was here"] : (stryCov_9fa48("61234"), []);
        }
      }
      return this.getNodeServiceRows(nodeId);
    }
  }
  async readAllNodeServiceRows(options = {}) {
    if (stryMutAct_9fa48("61235")) {
      {}
    } else {
      stryCov_9fa48("61235");
      if (stryMutAct_9fa48("61238") ? options.allowAuthoritativeRefresh === true && this.servicesOwner || typeof this.servicesOwner.listServices === TYPEOF.FUNCTION : stryMutAct_9fa48("61237") ? false : stryMutAct_9fa48("61236") ? true : (stryCov_9fa48("61236", "61237", "61238"), (stryMutAct_9fa48("61240") ? options.allowAuthoritativeRefresh === true || this.servicesOwner : stryMutAct_9fa48("61239") ? true : (stryCov_9fa48("61239", "61240"), (stryMutAct_9fa48("61242") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("61241") ? true : (stryCov_9fa48("61241", "61242"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("61243") ? false : (stryCov_9fa48("61243"), true)))) && this.servicesOwner)) && (stryMutAct_9fa48("61245") ? typeof this.servicesOwner.listServices !== TYPEOF.FUNCTION : stryMutAct_9fa48("61244") ? true : (stryCov_9fa48("61244", "61245"), typeof this.servicesOwner.listServices === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61246")) {
          {}
        } else {
          stryCov_9fa48("61246");
          const result = await this.servicesOwner.listServices(options);
          return Array.isArray(stryMutAct_9fa48("61247") ? result.rows : (stryCov_9fa48("61247"), result?.rows)) ? result.rows : stryMutAct_9fa48("61248") ? ["Stryker was here"] : (stryCov_9fa48("61248"), []);
        }
      }
      if (stryMutAct_9fa48("61251") ? this.servicesOwner || typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("61250") ? false : stryMutAct_9fa48("61249") ? true : (stryCov_9fa48("61249", "61250", "61251"), this.servicesOwner && (stryMutAct_9fa48("61253") ? typeof this.servicesOwner.listServicesFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("61252") ? true : (stryCov_9fa48("61252", "61253"), typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61254")) {
          {}
        } else {
          stryCov_9fa48("61254");
          const result = await this.servicesOwner.listServicesFromCache(options);
          return Array.isArray(stryMutAct_9fa48("61255") ? result.rows : (stryCov_9fa48("61255"), result?.rows)) ? result.rows : stryMutAct_9fa48("61256") ? ["Stryker was here"] : (stryCov_9fa48("61256"), []);
        }
      }
      if (stryMutAct_9fa48("61259") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("61258") ? false : stryMutAct_9fa48("61257") ? true : (stryCov_9fa48("61257", "61258", "61259"), (stryMutAct_9fa48("61260") ? this.systemTableCache : (stryCov_9fa48("61260"), !this.systemTableCache)) || (stryMutAct_9fa48("61262") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("61261") ? false : (stryCov_9fa48("61261", "61262"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61263")) {
          {}
        } else {
          stryCov_9fa48("61263");
          return stryMutAct_9fa48("61264") ? ["Stryker was here"] : (stryCov_9fa48("61264"), []);
        }
      }
      return stryMutAct_9fa48("61267") ? this.systemTableCache.getAll(TABLES.SERVICES) && [] : stryMutAct_9fa48("61266") ? false : stryMutAct_9fa48("61265") ? true : (stryCov_9fa48("61265", "61266", "61267"), this.systemTableCache.getAll(TABLES.SERVICES) || (stryMutAct_9fa48("61268") ? ["Stryker was here"] : (stryCov_9fa48("61268"), [])));
    }
  }

  /**
   * Resolve one node row from cache.
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getNodeRow(nodeId) {
    if (stryMutAct_9fa48("61269")) {
      {}
    } else {
      stryCov_9fa48("61269");
      if (stryMutAct_9fa48("61272") ? false : stryMutAct_9fa48("61271") ? true : stryMutAct_9fa48("61270") ? this.systemTableCache : (stryCov_9fa48("61270", "61271", "61272"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("61273")) {
          {}
        } else {
          stryCov_9fa48("61273");
          return null;
        }
      }
      if (stryMutAct_9fa48("61276") ? typeof this.systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("61275") ? false : stryMutAct_9fa48("61274") ? true : (stryCov_9fa48("61274", "61275", "61276"), typeof this.systemTableCache.get === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("61277")) {
          {}
        } else {
          stryCov_9fa48("61277");
          return stryMutAct_9fa48("61280") ? this.systemTableCache.get(TABLES.NODES, nodeId) && null : stryMutAct_9fa48("61279") ? false : stryMutAct_9fa48("61278") ? true : (stryCov_9fa48("61278", "61279", "61280"), this.systemTableCache.get(TABLES.NODES, nodeId) || null);
        }
      }
      return stryMutAct_9fa48("61283") ? this.getNodeRows().find(row => row?.[COLUMN.NODE_ID] === nodeId) && null : stryMutAct_9fa48("61282") ? false : stryMutAct_9fa48("61281") ? true : (stryCov_9fa48("61281", "61282", "61283"), this.getNodeRows().find(stryMutAct_9fa48("61284") ? () => undefined : (stryCov_9fa48("61284"), row => stryMutAct_9fa48("61287") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("61286") ? false : stryMutAct_9fa48("61285") ? true : (stryCov_9fa48("61285", "61286", "61287"), (stryMutAct_9fa48("61288") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("61288"), row?.[COLUMN.NODE_ID])) === nodeId))) || null);
    }
  }

  /**
   * Resolve all node rows from cache.
   * @return {Object[]}
   * @private
   */
  getNodeRows() {
    if (stryMutAct_9fa48("61289")) {
      {}
    } else {
      stryCov_9fa48("61289");
      if (stryMutAct_9fa48("61292") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("61291") ? false : stryMutAct_9fa48("61290") ? true : (stryCov_9fa48("61290", "61291", "61292"), (stryMutAct_9fa48("61293") ? this.systemTableCache : (stryCov_9fa48("61293"), !this.systemTableCache)) || (stryMutAct_9fa48("61295") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("61294") ? false : (stryCov_9fa48("61294", "61295"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61296")) {
          {}
        } else {
          stryCov_9fa48("61296");
          return stryMutAct_9fa48("61297") ? ["Stryker was here"] : (stryCov_9fa48("61297"), []);
        }
      }
      return this.systemTableCache.getAll(TABLES.NODES);
    }
  }

  /**
   * Resolve service rows for one node.
   * @param {string} nodeId
   * @return {Object[]}
   * @private
   */
  getNodeServiceRows(nodeId) {
    if (stryMutAct_9fa48("61298")) {
      {}
    } else {
      stryCov_9fa48("61298");
      if (stryMutAct_9fa48("61301") ? false : stryMutAct_9fa48("61300") ? true : stryMutAct_9fa48("61299") ? this.systemTableCache : (stryCov_9fa48("61299", "61300", "61301"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("61302")) {
          {}
        } else {
          stryCov_9fa48("61302");
          return stryMutAct_9fa48("61303") ? ["Stryker was here"] : (stryCov_9fa48("61303"), []);
        }
      }
      if (stryMutAct_9fa48("61306") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("61305") ? false : stryMutAct_9fa48("61304") ? true : (stryCov_9fa48("61304", "61305", "61306"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("61307")) {
          {}
        } else {
          stryCov_9fa48("61307");
          return stryMutAct_9fa48("61308") ? this.systemTableCache : (stryCov_9fa48("61308"), this.systemTableCache.filter(TABLES.SERVICES, row => {
            if (stryMutAct_9fa48("61309")) {
              {}
            } else {
              stryCov_9fa48("61309");
              return stryMutAct_9fa48("61312") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("61311") ? false : stryMutAct_9fa48("61310") ? true : (stryCov_9fa48("61310", "61311", "61312"), (stryMutAct_9fa48("61313") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("61313"), row?.[COLUMN.NODE_ID])) === nodeId);
            }
          }));
        }
      }
      if (stryMutAct_9fa48("61316") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("61315") ? false : stryMutAct_9fa48("61314") ? true : (stryCov_9fa48("61314", "61315", "61316"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("61317")) {
          {}
        } else {
          stryCov_9fa48("61317");
          return stryMutAct_9fa48("61318") ? ["Stryker was here"] : (stryCov_9fa48("61318"), []);
        }
      }
      return stryMutAct_9fa48("61319") ? this.systemTableCache.getAll(TABLES.SERVICES) : (stryCov_9fa48("61319"), this.systemTableCache.getAll(TABLES.SERVICES).filter(row => {
        if (stryMutAct_9fa48("61320")) {
          {}
        } else {
          stryCov_9fa48("61320");
          return stryMutAct_9fa48("61323") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("61322") ? false : stryMutAct_9fa48("61321") ? true : (stryCov_9fa48("61321", "61322", "61323"), (stryMutAct_9fa48("61324") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("61324"), row?.[COLUMN.NODE_ID])) === nodeId);
        }
      }));
    }
  }

  /**
   * Resolve the canonical lifecycle state for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {string|null}
   * @private
   */
  getLifecycleState(nodeId, nodeRow) {
    if (stryMutAct_9fa48("61325")) {
      {}
    } else {
      stryCov_9fa48("61325");
      if (stryMutAct_9fa48("61328") ? nodeId === this.nodeId && this.nodeLifecycleStateMachine || typeof this.nodeLifecycleStateMachine.getState === TYPEOF.FUNCTION : stryMutAct_9fa48("61327") ? false : stryMutAct_9fa48("61326") ? true : (stryCov_9fa48("61326", "61327", "61328"), (stryMutAct_9fa48("61330") ? nodeId === this.nodeId || this.nodeLifecycleStateMachine : stryMutAct_9fa48("61329") ? true : (stryCov_9fa48("61329", "61330"), (stryMutAct_9fa48("61332") ? nodeId !== this.nodeId : stryMutAct_9fa48("61331") ? true : (stryCov_9fa48("61331", "61332"), nodeId === this.nodeId)) && this.nodeLifecycleStateMachine)) && (stryMutAct_9fa48("61334") ? typeof this.nodeLifecycleStateMachine.getState !== TYPEOF.FUNCTION : stryMutAct_9fa48("61333") ? true : (stryCov_9fa48("61333", "61334"), typeof this.nodeLifecycleStateMachine.getState === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61335")) {
          {}
        } else {
          stryCov_9fa48("61335");
          return this.nodeLifecycleStateMachine.getState();
        }
      }
      return stryMutAct_9fa48("61338") ? nodeRow?.[COLUMN.STATUS] && null : stryMutAct_9fa48("61337") ? false : stryMutAct_9fa48("61336") ? true : (stryCov_9fa48("61336", "61337", "61338"), (stryMutAct_9fa48("61339") ? nodeRow[COLUMN.STATUS] : (stryCov_9fa48("61339"), nodeRow?.[COLUMN.STATUS])) || null);
    }
  }

  /**
   * Resolve the storage snapshot for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Promise<Object|null>}
   * @private
   */
  async getCapacitySnapshot(nodeId, _nodeRow) {
    if (stryMutAct_9fa48("61340")) {
      {}
    } else {
      stryCov_9fa48("61340");
      if (stryMutAct_9fa48("61343") ? this.storageAccountingService || typeof this.storageAccountingService.getCapacitySnapshotForNode === TYPEOF.FUNCTION : stryMutAct_9fa48("61342") ? false : stryMutAct_9fa48("61341") ? true : (stryCov_9fa48("61341", "61342", "61343"), this.storageAccountingService && (stryMutAct_9fa48("61345") ? typeof this.storageAccountingService.getCapacitySnapshotForNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("61344") ? true : (stryCov_9fa48("61344", "61345"), typeof this.storageAccountingService.getCapacitySnapshotForNode === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61346")) {
          {}
        } else {
          stryCov_9fa48("61346");
          return this.storageAccountingService.getCapacitySnapshotForNode(nodeId);
        }
      }
      if (stryMutAct_9fa48("61349") ? false : stryMutAct_9fa48("61348") ? true : stryMutAct_9fa48("61347") ? this.loggedMissingStorageAccountingOwner : (stryCov_9fa48("61347", "61348", "61349"), !this.loggedMissingStorageAccountingOwner)) {
        if (stryMutAct_9fa48("61350")) {
          {}
        } else {
          stryCov_9fa48("61350");
          this.loggedMissingStorageAccountingOwner = stryMutAct_9fa48("61351") ? false : (stryCov_9fa48("61351"), true);
          this.logMissingOwner(stryMutAct_9fa48("61352") ? "" : (stryCov_9fa48("61352"), 'ControlPlaneReadinessService missing storage accounting owner'), CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING);
        }
      }
      if (stryMutAct_9fa48("61354") ? false : stryMutAct_9fa48("61353") ? true : (stryCov_9fa48("61353", "61354"), this.strictOwnerDependencies)) {
        if (stryMutAct_9fa48("61355")) {
          {}
        } else {
          stryCov_9fa48("61355");
          throw new Error(READINESS_ERROR_MSG.STORAGE_ACCOUNTING_OWNER_REQUIRED);
        }
      }
      return null;
    }
  }

  /**
   * Return true when the node has at least one active addressed service.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasRoutableService(serviceRows) {
    if (stryMutAct_9fa48("61356")) {
      {}
    } else {
      stryCov_9fa48("61356");
      if (stryMutAct_9fa48("61359") ? serviceRows.length !== NUM.ZERO : stryMutAct_9fa48("61358") ? false : stryMutAct_9fa48("61357") ? true : (stryCov_9fa48("61357", "61358", "61359"), serviceRows.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("61360")) {
          {}
        } else {
          stryCov_9fa48("61360");
          return stryMutAct_9fa48("61361") ? false : (stryCov_9fa48("61361"), true);
        }
      }
      if (stryMutAct_9fa48("61364") ? false : stryMutAct_9fa48("61363") ? true : stryMutAct_9fa48("61362") ? serviceRows.some(serviceRow => {
        return this.hasAddressedService(serviceRow);
      }) : (stryCov_9fa48("61362", "61363", "61364"), !(stryMutAct_9fa48("61365") ? serviceRows.every(serviceRow => {
        return this.hasAddressedService(serviceRow);
      }) : (stryCov_9fa48("61365"), serviceRows.some(serviceRow => {
        if (stryMutAct_9fa48("61366")) {
          {}
        } else {
          stryCov_9fa48("61366");
          return this.hasAddressedService(serviceRow);
        }
      }))))) {
        if (stryMutAct_9fa48("61367")) {
          {}
        } else {
          stryCov_9fa48("61367");
          return stryMutAct_9fa48("61368") ? false : (stryCov_9fa48("61368"), true);
        }
      }
      return stryMutAct_9fa48("61369") ? serviceRows.every(serviceRow => {
        return String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() === SERVICE_STATUS.ACTIVE && this.hasAddressedService(serviceRow);
      }) : (stryCov_9fa48("61369"), serviceRows.some(serviceRow => {
        if (stryMutAct_9fa48("61370")) {
          {}
        } else {
          stryCov_9fa48("61370");
          return stryMutAct_9fa48("61373") ? String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() === SERVICE_STATUS.ACTIVE || this.hasAddressedService(serviceRow) : stryMutAct_9fa48("61372") ? false : stryMutAct_9fa48("61371") ? true : (stryCov_9fa48("61371", "61372", "61373"), (stryMutAct_9fa48("61375") ? String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("61374") ? true : (stryCov_9fa48("61374", "61375"), (stryMutAct_9fa48("61376") ? String(serviceRow?.[COLUMN.STATUS] || '').toUpperCase() : (stryCov_9fa48("61376"), String(stryMutAct_9fa48("61379") ? serviceRow?.[COLUMN.STATUS] && '' : stryMutAct_9fa48("61378") ? false : stryMutAct_9fa48("61377") ? true : (stryCov_9fa48("61377", "61378", "61379"), (stryMutAct_9fa48("61380") ? serviceRow[COLUMN.STATUS] : (stryCov_9fa48("61380"), serviceRow?.[COLUMN.STATUS])) || (stryMutAct_9fa48("61381") ? "Stryker was here!" : (stryCov_9fa48("61381"), '')))).toLowerCase())) === SERVICE_STATUS.ACTIVE)) && this.hasAddressedService(serviceRow));
        }
      }));
    }
  }

  /**
   * Return true when the node has an active message-group control-plane path.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasWritableControlPlaneService(serviceRows) {
    if (stryMutAct_9fa48("61382")) {
      {}
    } else {
      stryCov_9fa48("61382");
      if (stryMutAct_9fa48("61385") ? serviceRows.length !== NUM.ZERO : stryMutAct_9fa48("61384") ? false : stryMutAct_9fa48("61383") ? true : (stryCov_9fa48("61383", "61384", "61385"), serviceRows.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("61386")) {
          {}
        } else {
          stryCov_9fa48("61386");
          return stryMutAct_9fa48("61387") ? false : (stryCov_9fa48("61387"), true);
        }
      }
      const hasMessageGroupRows = stryMutAct_9fa48("61388") ? serviceRows.every(serviceRow => {
        return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
      }) : (stryCov_9fa48("61388"), serviceRows.some(serviceRow => {
        if (stryMutAct_9fa48("61389")) {
          {}
        } else {
          stryCov_9fa48("61389");
          return stryMutAct_9fa48("61392") ? serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("61391") ? false : stryMutAct_9fa48("61390") ? true : (stryCov_9fa48("61390", "61391", "61392"), (stryMutAct_9fa48("61393") ? serviceRow[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("61393"), serviceRow?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP);
        }
      }));
      if (stryMutAct_9fa48("61396") ? false : stryMutAct_9fa48("61395") ? true : stryMutAct_9fa48("61394") ? hasMessageGroupRows : (stryCov_9fa48("61394", "61395", "61396"), !hasMessageGroupRows)) {
        if (stryMutAct_9fa48("61397")) {
          {}
        } else {
          stryCov_9fa48("61397");
          return stryMutAct_9fa48("61398") ? false : (stryCov_9fa48("61398"), true);
        }
      }
      if (stryMutAct_9fa48("61400") ? false : stryMutAct_9fa48("61399") ? true : (stryCov_9fa48("61399", "61400"), this.hasActiveAddressedMessageGroupService(serviceRows))) {
        if (stryMutAct_9fa48("61401")) {
          {}
        } else {
          stryCov_9fa48("61401");
          return stryMutAct_9fa48("61402") ? false : (stryCov_9fa48("61402"), true);
        }
      }
      return this.hasStartupControlPlaneWriteGrace(serviceRows);
    }
  }
  hasServeEligibleControlPlaneService(serviceRows) {
    if (stryMutAct_9fa48("61403")) {
      {}
    } else {
      stryCov_9fa48("61403");
      if (stryMutAct_9fa48("61406") ? serviceRows.length !== NUM.ZERO : stryMutAct_9fa48("61405") ? false : stryMutAct_9fa48("61404") ? true : (stryCov_9fa48("61404", "61405", "61406"), serviceRows.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("61407")) {
          {}
        } else {
          stryCov_9fa48("61407");
          return stryMutAct_9fa48("61408") ? false : (stryCov_9fa48("61408"), true);
        }
      }
      const hasMessageGroupRows = stryMutAct_9fa48("61409") ? serviceRows.every(serviceRow => {
        return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
      }) : (stryCov_9fa48("61409"), serviceRows.some(serviceRow => {
        if (stryMutAct_9fa48("61410")) {
          {}
        } else {
          stryCov_9fa48("61410");
          return stryMutAct_9fa48("61413") ? serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("61412") ? false : stryMutAct_9fa48("61411") ? true : (stryCov_9fa48("61411", "61412", "61413"), (stryMutAct_9fa48("61414") ? serviceRow[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("61414"), serviceRow?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP);
        }
      }));
      if (stryMutAct_9fa48("61417") ? false : stryMutAct_9fa48("61416") ? true : stryMutAct_9fa48("61415") ? hasMessageGroupRows : (stryCov_9fa48("61415", "61416", "61417"), !hasMessageGroupRows)) {
        if (stryMutAct_9fa48("61418")) {
          {}
        } else {
          stryCov_9fa48("61418");
          return stryMutAct_9fa48("61419") ? false : (stryCov_9fa48("61419"), true);
        }
      }
      return this.hasActiveAddressedMessageGroupService(serviceRows);
    }
  }
  hasActiveAddressedMessageGroupService(serviceRows) {
    if (stryMutAct_9fa48("61420")) {
      {}
    } else {
      stryCov_9fa48("61420");
      return stryMutAct_9fa48("61421") ? serviceRows.every(serviceRow => {
        return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() === SERVICE_STATUS.ACTIVE && this.hasAddressedService(serviceRow);
      }) : (stryCov_9fa48("61421"), serviceRows.some(serviceRow => {
        if (stryMutAct_9fa48("61422")) {
          {}
        } else {
          stryCov_9fa48("61422");
          return stryMutAct_9fa48("61425") ? serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() === SERVICE_STATUS.ACTIVE || this.hasAddressedService(serviceRow) : stryMutAct_9fa48("61424") ? false : stryMutAct_9fa48("61423") ? true : (stryCov_9fa48("61423", "61424", "61425"), (stryMutAct_9fa48("61427") ? serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP || String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("61426") ? true : (stryCov_9fa48("61426", "61427"), (stryMutAct_9fa48("61429") ? serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("61428") ? true : (stryCov_9fa48("61428", "61429"), (stryMutAct_9fa48("61430") ? serviceRow[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("61430"), serviceRow?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("61432") ? String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("61431") ? true : (stryCov_9fa48("61431", "61432"), (stryMutAct_9fa48("61433") ? String(serviceRow?.[COLUMN.STATUS] || '').toUpperCase() : (stryCov_9fa48("61433"), String(stryMutAct_9fa48("61436") ? serviceRow?.[COLUMN.STATUS] && '' : stryMutAct_9fa48("61435") ? false : stryMutAct_9fa48("61434") ? true : (stryCov_9fa48("61434", "61435", "61436"), (stryMutAct_9fa48("61437") ? serviceRow[COLUMN.STATUS] : (stryCov_9fa48("61437"), serviceRow?.[COLUMN.STATUS])) || (stryMutAct_9fa48("61438") ? "Stryker was here!" : (stryCov_9fa48("61438"), '')))).toLowerCase())) === SERVICE_STATUS.ACTIVE)))) && this.hasAddressedService(serviceRow));
        }
      }));
    }
  }
  hasRecoveryGraceControlPlaneService(serviceRows) {
    if (stryMutAct_9fa48("61439")) {
      {}
    } else {
      stryCov_9fa48("61439");
      if (stryMutAct_9fa48("61441") ? false : stryMutAct_9fa48("61440") ? true : (stryCov_9fa48("61440", "61441"), this.hasWritableControlPlaneService(serviceRows))) {
        if (stryMutAct_9fa48("61442")) {
          {}
        } else {
          stryCov_9fa48("61442");
          return stryMutAct_9fa48("61443") ? false : (stryCov_9fa48("61443"), true);
        }
      }
      // A restarted joiner can expose addressed but still-converging message-group
      // service rows before the local replica flips ACTIVE again. Keep recovery
      // admission open so it can finish re-registering through the owner path.
      if (stryMutAct_9fa48("61446") ? false : stryMutAct_9fa48("61445") ? true : stryMutAct_9fa48("61444") ? this.hasAddressedMessageGroupServiceWithStatuses(serviceRows, RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES) : (stryCov_9fa48("61444", "61445", "61446"), !this.hasAddressedMessageGroupServiceWithStatuses(serviceRows, RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES))) {
        if (stryMutAct_9fa48("61447")) {
          {}
        } else {
          stryCov_9fa48("61447");
          return stryMutAct_9fa48("61448") ? true : (stryCov_9fa48("61448"), false);
        }
      }
      return this.hasActiveAddressedNonMessageGroupService(serviceRows);
    }
  }
  hasStartupControlPlaneWriteGrace(serviceRows) {
    if (stryMutAct_9fa48("61449")) {
      {}
    } else {
      stryCov_9fa48("61449");
      if (stryMutAct_9fa48("61452") ? false : stryMutAct_9fa48("61451") ? true : stryMutAct_9fa48("61450") ? this.hasAddressedMessageGroupServiceWithStatuses(serviceRows, [SERVICE_STATUS.STOPPED]) : (stryCov_9fa48("61450", "61451", "61452"), !this.hasAddressedMessageGroupServiceWithStatuses(serviceRows, stryMutAct_9fa48("61453") ? [] : (stryCov_9fa48("61453"), [SERVICE_STATUS.STOPPED])))) {
        if (stryMutAct_9fa48("61454")) {
          {}
        } else {
          stryCov_9fa48("61454");
          return stryMutAct_9fa48("61455") ? true : (stryCov_9fa48("61455"), false);
        }
      }
      return this.hasActiveAddressedNonMessageGroupService(serviceRows);
    }
  }
  hasAddressedService(serviceRow) {
    if (stryMutAct_9fa48("61456")) {
      {}
    } else {
      stryCov_9fa48("61456");
      return stryMutAct_9fa48("61459") ? typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING || serviceRow[COLUMN.ADDRESS].length > NUM.ZERO : stryMutAct_9fa48("61458") ? false : stryMutAct_9fa48("61457") ? true : (stryCov_9fa48("61457", "61458", "61459"), (stryMutAct_9fa48("61461") ? typeof serviceRow?.[COLUMN.ADDRESS] !== TYPEOF.STRING : stryMutAct_9fa48("61460") ? true : (stryCov_9fa48("61460", "61461"), typeof (stryMutAct_9fa48("61462") ? serviceRow[COLUMN.ADDRESS] : (stryCov_9fa48("61462"), serviceRow?.[COLUMN.ADDRESS])) === TYPEOF.STRING)) && (stryMutAct_9fa48("61465") ? serviceRow[COLUMN.ADDRESS].length <= NUM.ZERO : stryMutAct_9fa48("61464") ? serviceRow[COLUMN.ADDRESS].length >= NUM.ZERO : stryMutAct_9fa48("61463") ? true : (stryCov_9fa48("61463", "61464", "61465"), serviceRow[COLUMN.ADDRESS].length > NUM.ZERO)));
    }
  }
  hasAddressedMessageGroupServiceWithStatuses(serviceRows, allowedStatuses) {
    if (stryMutAct_9fa48("61466")) {
      {}
    } else {
      stryCov_9fa48("61466");
      if (stryMutAct_9fa48("61469") ? !Array.isArray(allowedStatuses) && allowedStatuses.length === NUM.ZERO : stryMutAct_9fa48("61468") ? false : stryMutAct_9fa48("61467") ? true : (stryCov_9fa48("61467", "61468", "61469"), (stryMutAct_9fa48("61470") ? Array.isArray(allowedStatuses) : (stryCov_9fa48("61470"), !Array.isArray(allowedStatuses))) || (stryMutAct_9fa48("61472") ? allowedStatuses.length !== NUM.ZERO : stryMutAct_9fa48("61471") ? false : (stryCov_9fa48("61471", "61472"), allowedStatuses.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("61473")) {
          {}
        } else {
          stryCov_9fa48("61473");
          return stryMutAct_9fa48("61474") ? true : (stryCov_9fa48("61474"), false);
        }
      }
      return stryMutAct_9fa48("61475") ? serviceRows.every(serviceRow => {
        return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && allowedStatuses.includes(String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase()) && this.hasAddressedService(serviceRow);
      }) : (stryCov_9fa48("61475"), serviceRows.some(serviceRow => {
        if (stryMutAct_9fa48("61476")) {
          {}
        } else {
          stryCov_9fa48("61476");
          return stryMutAct_9fa48("61479") ? serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && allowedStatuses.includes(String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase()) || this.hasAddressedService(serviceRow) : stryMutAct_9fa48("61478") ? false : stryMutAct_9fa48("61477") ? true : (stryCov_9fa48("61477", "61478", "61479"), (stryMutAct_9fa48("61481") ? serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP || allowedStatuses.includes(String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase()) : stryMutAct_9fa48("61480") ? true : (stryCov_9fa48("61480", "61481"), (stryMutAct_9fa48("61483") ? serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("61482") ? true : (stryCov_9fa48("61482", "61483"), (stryMutAct_9fa48("61484") ? serviceRow[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("61484"), serviceRow?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP)) && allowedStatuses.includes(stryMutAct_9fa48("61485") ? String(serviceRow?.[COLUMN.STATUS] || '').toUpperCase() : (stryCov_9fa48("61485"), String(stryMutAct_9fa48("61488") ? serviceRow?.[COLUMN.STATUS] && '' : stryMutAct_9fa48("61487") ? false : stryMutAct_9fa48("61486") ? true : (stryCov_9fa48("61486", "61487", "61488"), (stryMutAct_9fa48("61489") ? serviceRow[COLUMN.STATUS] : (stryCov_9fa48("61489"), serviceRow?.[COLUMN.STATUS])) || (stryMutAct_9fa48("61490") ? "Stryker was here!" : (stryCov_9fa48("61490"), '')))).toLowerCase())))) && this.hasAddressedService(serviceRow));
        }
      }));
    }
  }
  hasActiveAddressedNonMessageGroupService(serviceRows) {
    if (stryMutAct_9fa48("61491")) {
      {}
    } else {
      stryCov_9fa48("61491");
      return stryMutAct_9fa48("61492") ? serviceRows.every(serviceRow => {
        return serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP && String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() === SERVICE_STATUS.ACTIVE && this.hasAddressedService(serviceRow);
      }) : (stryCov_9fa48("61492"), serviceRows.some(serviceRow => {
        if (stryMutAct_9fa48("61493")) {
          {}
        } else {
          stryCov_9fa48("61493");
          return stryMutAct_9fa48("61496") ? serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP && String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() === SERVICE_STATUS.ACTIVE || this.hasAddressedService(serviceRow) : stryMutAct_9fa48("61495") ? false : stryMutAct_9fa48("61494") ? true : (stryCov_9fa48("61494", "61495", "61496"), (stryMutAct_9fa48("61498") ? serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP || String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("61497") ? true : (stryCov_9fa48("61497", "61498"), (stryMutAct_9fa48("61500") ? serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("61499") ? true : (stryCov_9fa48("61499", "61500"), (stryMutAct_9fa48("61501") ? serviceRow[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("61501"), serviceRow?.[COLUMN.SERVICE_TYPE])) !== SERVICE_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("61503") ? String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("61502") ? true : (stryCov_9fa48("61502", "61503"), (stryMutAct_9fa48("61504") ? String(serviceRow?.[COLUMN.STATUS] || '').toUpperCase() : (stryCov_9fa48("61504"), String(stryMutAct_9fa48("61507") ? serviceRow?.[COLUMN.STATUS] && '' : stryMutAct_9fa48("61506") ? false : stryMutAct_9fa48("61505") ? true : (stryCov_9fa48("61505", "61506", "61507"), (stryMutAct_9fa48("61508") ? serviceRow[COLUMN.STATUS] : (stryCov_9fa48("61508"), serviceRow?.[COLUMN.STATUS])) || (stryMutAct_9fa48("61509") ? "Stryker was here!" : (stryCov_9fa48("61509"), '')))).toLowerCase())) === SERVICE_STATUS.ACTIVE)))) && this.hasAddressedService(serviceRow));
        }
      }));
    }
  }

  /**
   * Return true when node resource usage is below the blocking threshold.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isLoadReady(nodeRow) {
    if (stryMutAct_9fa48("61510")) {
      {}
    } else {
      stryCov_9fa48("61510");
      const loadValues = stryMutAct_9fa48("61511") ? [] : (stryCov_9fa48("61511"), [Number(stryMutAct_9fa48("61512") ? nodeRow[COLUMN.CPU_USAGE_PERCENT] : (stryCov_9fa48("61512"), nodeRow?.[COLUMN.CPU_USAGE_PERCENT])), Number(stryMutAct_9fa48("61513") ? nodeRow[COLUMN.MEMORY_USAGE_PERCENT] : (stryCov_9fa48("61513"), nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT])), Number(stryMutAct_9fa48("61514") ? nodeRow[COLUMN.DISK_USAGE_PERCENT] : (stryCov_9fa48("61514"), nodeRow?.[COLUMN.DISK_USAGE_PERCENT]))]);
      return stryMutAct_9fa48("61515") ? loadValues.some(value => {
        return !Number.isFinite(value) || value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT;
      }) : (stryCov_9fa48("61515"), loadValues.every(value => {
        if (stryMutAct_9fa48("61516")) {
          {}
        } else {
          stryCov_9fa48("61516");
          return stryMutAct_9fa48("61519") ? !Number.isFinite(value) && value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT : stryMutAct_9fa48("61518") ? false : stryMutAct_9fa48("61517") ? true : (stryCov_9fa48("61517", "61518", "61519"), (stryMutAct_9fa48("61520") ? Number.isFinite(value) : (stryCov_9fa48("61520"), !Number.isFinite(value))) || (stryMutAct_9fa48("61523") ? value >= CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT : stryMutAct_9fa48("61522") ? value <= CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT : stryMutAct_9fa48("61521") ? false : (stryCov_9fa48("61521", "61522", "61523"), value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT)));
        }
      }));
    }
  }

  /**
   * Return true when storage state permits placement.
   * @param {Object|null} capacity
   * @return {boolean}
   * @private
   */
  isCapacityPlacementEligible(capacity) {
    if (stryMutAct_9fa48("61524")) {
      {}
    } else {
      stryCov_9fa48("61524");
      if (stryMutAct_9fa48("61527") ? false : stryMutAct_9fa48("61526") ? true : stryMutAct_9fa48("61525") ? capacity : (stryCov_9fa48("61525", "61526", "61527"), !capacity)) {
        if (stryMutAct_9fa48("61528")) {
          {}
        } else {
          stryCov_9fa48("61528");
          return stryMutAct_9fa48("61529") ? true : (stryCov_9fa48("61529"), false);
        }
      }
      if (stryMutAct_9fa48("61532") ? !Number.isFinite(Number(capacity.budgetBytes)) && Number(capacity.budgetBytes) <= NUM.ZERO : stryMutAct_9fa48("61531") ? false : stryMutAct_9fa48("61530") ? true : (stryCov_9fa48("61530", "61531", "61532"), (stryMutAct_9fa48("61533") ? Number.isFinite(Number(capacity.budgetBytes)) : (stryCov_9fa48("61533"), !Number.isFinite(Number(capacity.budgetBytes)))) || (stryMutAct_9fa48("61536") ? Number(capacity.budgetBytes) > NUM.ZERO : stryMutAct_9fa48("61535") ? Number(capacity.budgetBytes) < NUM.ZERO : stryMutAct_9fa48("61534") ? false : (stryCov_9fa48("61534", "61535", "61536"), Number(capacity.budgetBytes) <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("61537")) {
          {}
        } else {
          stryCov_9fa48("61537");
          return stryMutAct_9fa48("61538") ? true : (stryCov_9fa48("61538"), false);
        }
      }
      return stryMutAct_9fa48("61539") ? CONTROL_PLANE_READINESS_DEFAULT.PLACEMENT_BLOCKING_PRESSURE_STATES.includes(String(capacity.pressureState || '')) : (stryCov_9fa48("61539"), !CONTROL_PLANE_READINESS_DEFAULT.PLACEMENT_BLOCKING_PRESSURE_STATES.includes(String(stryMutAct_9fa48("61542") ? capacity.pressureState && '' : stryMutAct_9fa48("61541") ? false : stryMutAct_9fa48("61540") ? true : (stryCov_9fa48("61540", "61541", "61542"), capacity.pressureState || (stryMutAct_9fa48("61543") ? "Stryker was here!" : (stryCov_9fa48("61543"), ''))))));
    }
  }

  /**
   * Map storage state to a stable readiness reason code.
   * @param {Object|null} capacity
   * @return {string|null}
   * @private
   */
  getCapacityReasonCode(capacity) {
    if (stryMutAct_9fa48("61544")) {
      {}
    } else {
      stryCov_9fa48("61544");
      if (stryMutAct_9fa48("61547") ? false : stryMutAct_9fa48("61546") ? true : stryMutAct_9fa48("61545") ? capacity : (stryCov_9fa48("61545", "61546", "61547"), !capacity)) {
        if (stryMutAct_9fa48("61548")) {
          {}
        } else {
          stryCov_9fa48("61548");
          return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
        }
      }
      if (stryMutAct_9fa48("61551") ? !Number.isFinite(Number(capacity.budgetBytes)) && Number(capacity.budgetBytes) <= NUM.ZERO : stryMutAct_9fa48("61550") ? false : stryMutAct_9fa48("61549") ? true : (stryCov_9fa48("61549", "61550", "61551"), (stryMutAct_9fa48("61552") ? Number.isFinite(Number(capacity.budgetBytes)) : (stryCov_9fa48("61552"), !Number.isFinite(Number(capacity.budgetBytes)))) || (stryMutAct_9fa48("61555") ? Number(capacity.budgetBytes) > NUM.ZERO : stryMutAct_9fa48("61554") ? Number(capacity.budgetBytes) < NUM.ZERO : stryMutAct_9fa48("61553") ? false : (stryCov_9fa48("61553", "61554", "61555"), Number(capacity.budgetBytes) <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("61556")) {
          {}
        } else {
          stryCov_9fa48("61556");
          return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
        }
      }
      if (stryMutAct_9fa48("61559") ? capacity.pressureState !== PRESSURE_STATE.HARD : stryMutAct_9fa48("61558") ? false : stryMutAct_9fa48("61557") ? true : (stryCov_9fa48("61557", "61558", "61559"), capacity.pressureState === PRESSURE_STATE.HARD)) {
        if (stryMutAct_9fa48("61560")) {
          {}
        } else {
          stryCov_9fa48("61560");
          return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD;
        }
      }
      if (stryMutAct_9fa48("61563") ? capacity.pressureState !== PRESSURE_STATE.EXHAUSTED : stryMutAct_9fa48("61562") ? false : stryMutAct_9fa48("61561") ? true : (stryCov_9fa48("61561", "61562", "61563"), capacity.pressureState === PRESSURE_STATE.EXHAUSTED)) {
        if (stryMutAct_9fa48("61564")) {
          {}
        } else {
          stryCov_9fa48("61564");
          return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED;
        }
      }
      return null;
    }
  }

  /**
   * Build structured diagnostics for one cluster-member-health miss.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Object}
   * @private
   */
  buildClusterMemberHealthDetails(nodeId, nodeRow) {
    if (stryMutAct_9fa48("61565")) {
      {}
    } else {
      stryCov_9fa48("61565");
      const now = this.now();
      const transportState = this.getNodeTransportState(nodeId, nodeRow);
      const localQueryTransport = this.getLocalQueryTransportEvidence(nodeId);
      const lastHeartbeat = Number(stryMutAct_9fa48("61566") ? nodeRow[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("61566"), nodeRow?.[COLUMN.LAST_HEARTBEAT]));
      const readyLeaseExpiresAt = Number(stryMutAct_9fa48("61567") ? nodeRow[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("61567"), nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]));
      const heartbeatAgeMs = Number.isFinite(lastHeartbeat) ? stryMutAct_9fa48("61568") ? now + lastHeartbeat : (stryCov_9fa48("61568"), now - lastHeartbeat) : null;
      const readyLeaseAgeMs = Number.isFinite(readyLeaseExpiresAt) ? stryMutAct_9fa48("61569") ? now + readyLeaseExpiresAt : (stryCov_9fa48("61569"), now - readyLeaseExpiresAt) : null;
      const status = stryMutAct_9fa48("61570") ? String(nodeRow?.[COLUMN.STATUS] || '').toUpperCase() : (stryCov_9fa48("61570"), String(stryMutAct_9fa48("61573") ? nodeRow?.[COLUMN.STATUS] && '' : stryMutAct_9fa48("61572") ? false : stryMutAct_9fa48("61571") ? true : (stryCov_9fa48("61571", "61572", "61573"), (stryMutAct_9fa48("61574") ? nodeRow[COLUMN.STATUS] : (stryCov_9fa48("61574"), nodeRow?.[COLUMN.STATUS])) || (stryMutAct_9fa48("61575") ? "Stryker was here!" : (stryCov_9fa48("61575"), '')))).toLowerCase());
      return Object.freeze(stryMutAct_9fa48("61576") ? {} : (stryCov_9fa48("61576"), {
        status: (stryMutAct_9fa48("61580") ? status.length <= NUM.ZERO : stryMutAct_9fa48("61579") ? status.length >= NUM.ZERO : stryMutAct_9fa48("61578") ? false : stryMutAct_9fa48("61577") ? true : (stryCov_9fa48("61577", "61578", "61579", "61580"), status.length > NUM.ZERO)) ? status : null,
        rowConnectionState: transportState.rowState,
        routerConnectionState: transportState.routerState,
        transportConnected: transportState.connected,
        localQueryTransportState: stryMutAct_9fa48("61583") ? localQueryTransport?.state && null : stryMutAct_9fa48("61582") ? false : stryMutAct_9fa48("61581") ? true : (stryCov_9fa48("61581", "61582", "61583"), (stryMutAct_9fa48("61584") ? localQueryTransport.state : (stryCov_9fa48("61584"), localQueryTransport?.state)) || null),
        localQueryTransportReady: (stryMutAct_9fa48("61587") ? typeof localQueryTransport?.ready !== 'boolean' : stryMutAct_9fa48("61586") ? false : stryMutAct_9fa48("61585") ? true : (stryCov_9fa48("61585", "61586", "61587"), typeof (stryMutAct_9fa48("61588") ? localQueryTransport.ready : (stryCov_9fa48("61588"), localQueryTransport?.ready)) === (stryMutAct_9fa48("61589") ? "" : (stryCov_9fa48("61589"), 'boolean')))) ? localQueryTransport.ready : null,
        localQueryTransportReason: stryMutAct_9fa48("61592") ? localQueryTransport?.reason && null : stryMutAct_9fa48("61591") ? false : stryMutAct_9fa48("61590") ? true : (stryCov_9fa48("61590", "61591", "61592"), (stryMutAct_9fa48("61593") ? localQueryTransport.reason : (stryCov_9fa48("61593"), localQueryTransport?.reason)) || null),
        localQueryTransportRetryAfterMs: Number.isFinite(stryMutAct_9fa48("61594") ? localQueryTransport.retryAfterMs : (stryCov_9fa48("61594"), localQueryTransport?.retryAfterMs)) ? localQueryTransport.retryAfterMs : null,
        lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
        heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
        readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt) ? readyLeaseExpiresAt : null,
        readyLeaseAgeMs: Number.isFinite(readyLeaseAgeMs) ? readyLeaseAgeMs : null,
        staleHeartbeatLimitMs: this.clusterMemberStaleHeartbeatMaxAgeMs,
        readyNow: isNodeRecordReady(nodeRow, stryMutAct_9fa48("61595") ? {} : (stryCov_9fa48("61595"), {
          now
        })),
        readyWhenWritten: wasNodeRecordReadyWhenWritten(nodeRow, stryMutAct_9fa48("61596") ? {} : (stryCov_9fa48("61596"), {
          now
        }))
      }));
    }
  }

  /**
   * Resolve bounded local query/data-plane transport evidence for self-node
   * readiness diagnostics.
   * @param {string} nodeId
   * @return {{state:string,ready:boolean|null,reason:string|null,retryAfterMs:number|null}|null}
   * @private
   */
  getLocalQueryTransportEvidence(nodeId) {
    if (stryMutAct_9fa48("61597")) {
      {}
    } else {
      stryCov_9fa48("61597");
      if (stryMutAct_9fa48("61600") ? nodeId === this.nodeId : stryMutAct_9fa48("61599") ? false : stryMutAct_9fa48("61598") ? true : (stryCov_9fa48("61598", "61599", "61600"), nodeId !== this.nodeId)) {
        if (stryMutAct_9fa48("61601")) {
          {}
        } else {
          stryCov_9fa48("61601");
          return null;
        }
      }
      if (stryMutAct_9fa48("61604") ? !this.messageRouter && typeof this.messageRouter.getQueryDataPlaneTransportReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("61603") ? false : stryMutAct_9fa48("61602") ? true : (stryCov_9fa48("61602", "61603", "61604"), (stryMutAct_9fa48("61605") ? this.messageRouter : (stryCov_9fa48("61605"), !this.messageRouter)) || (stryMutAct_9fa48("61607") ? typeof this.messageRouter.getQueryDataPlaneTransportReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("61606") ? false : (stryCov_9fa48("61606", "61607"), typeof this.messageRouter.getQueryDataPlaneTransportReadiness !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61608")) {
          {}
        } else {
          stryCov_9fa48("61608");
          return normalizeLocalQueryTransportEvidence(null);
        }
      }
      return normalizeLocalQueryTransportEvidence(this.messageRouter.getQueryDataPlaneTransportReadiness());
    }
  }

  /**
   * Resolve transport connectivity evidence from row and live router state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {{connected:boolean,rowState:string|null,routerState:string|null}}
   * @private
   */
  getNodeTransportState(nodeId, nodeRow) {
    if (stryMutAct_9fa48("61609")) {
      {}
    } else {
      stryCov_9fa48("61609");
      let routerState = null;
      if (stryMutAct_9fa48("61612") ? nodeId && this.messageRouter || typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("61611") ? false : stryMutAct_9fa48("61610") ? true : (stryCov_9fa48("61610", "61611", "61612"), (stryMutAct_9fa48("61614") ? nodeId || this.messageRouter : stryMutAct_9fa48("61613") ? true : (stryCov_9fa48("61613", "61614"), nodeId && this.messageRouter)) && (stryMutAct_9fa48("61616") ? typeof this.messageRouter.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("61615") ? true : (stryCov_9fa48("61615", "61616"), typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("61617")) {
          {}
        } else {
          stryCov_9fa48("61617");
          routerState = stryMutAct_9fa48("61618") ? String(this.messageRouter.getConnectionState(nodeId) || '').toUpperCase() : (stryCov_9fa48("61618"), String(stryMutAct_9fa48("61621") ? this.messageRouter.getConnectionState(nodeId) && '' : stryMutAct_9fa48("61620") ? false : stryMutAct_9fa48("61619") ? true : (stryCov_9fa48("61619", "61620", "61621"), this.messageRouter.getConnectionState(nodeId) || (stryMutAct_9fa48("61622") ? "Stryker was here!" : (stryCov_9fa48("61622"), '')))).toLowerCase());
        }
      }
      const rowStateRaw = stryMutAct_9fa48("61623") ? String(nodeRow?.[COLUMN.CONNECTION_STATE] || '').toUpperCase() : (stryCov_9fa48("61623"), String(stryMutAct_9fa48("61626") ? nodeRow?.[COLUMN.CONNECTION_STATE] && '' : stryMutAct_9fa48("61625") ? false : stryMutAct_9fa48("61624") ? true : (stryCov_9fa48("61624", "61625", "61626"), (stryMutAct_9fa48("61627") ? nodeRow[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("61627"), nodeRow?.[COLUMN.CONNECTION_STATE])) || (stryMutAct_9fa48("61628") ? "Stryker was here!" : (stryCov_9fa48("61628"), '')))).toLowerCase());
      const normalizedRowState = (stryMutAct_9fa48("61632") ? rowStateRaw.length <= NUM.ZERO : stryMutAct_9fa48("61631") ? rowStateRaw.length >= NUM.ZERO : stryMutAct_9fa48("61630") ? false : stryMutAct_9fa48("61629") ? true : (stryCov_9fa48("61629", "61630", "61631", "61632"), rowStateRaw.length > NUM.ZERO)) ? rowStateRaw : null;
      const normalizedRouterState = (stryMutAct_9fa48("61635") ? typeof routerState === TYPEOF.STRING || routerState.length > NUM.ZERO : stryMutAct_9fa48("61634") ? false : stryMutAct_9fa48("61633") ? true : (stryCov_9fa48("61633", "61634", "61635"), (stryMutAct_9fa48("61637") ? typeof routerState !== TYPEOF.STRING : stryMutAct_9fa48("61636") ? true : (stryCov_9fa48("61636", "61637"), typeof routerState === TYPEOF.STRING)) && (stryMutAct_9fa48("61640") ? routerState.length <= NUM.ZERO : stryMutAct_9fa48("61639") ? routerState.length >= NUM.ZERO : stryMutAct_9fa48("61638") ? true : (stryCov_9fa48("61638", "61639", "61640"), routerState.length > NUM.ZERO)))) ? routerState : null;
      let connected = stryMutAct_9fa48("61641") ? true : (stryCov_9fa48("61641"), false);
      if (stryMutAct_9fa48("61644") ? normalizedRouterState !== STATE.DISCONNECTED : stryMutAct_9fa48("61643") ? false : stryMutAct_9fa48("61642") ? true : (stryCov_9fa48("61642", "61643", "61644"), normalizedRouterState === STATE.DISCONNECTED)) {
        if (stryMutAct_9fa48("61645")) {
          {}
        } else {
          stryCov_9fa48("61645");
          connected = stryMutAct_9fa48("61646") ? true : (stryCov_9fa48("61646"), false);
        }
      } else if (stryMutAct_9fa48("61649") ? normalizedRouterState === STATE.CONNECTED && normalizedRouterState === STATE.READY : stryMutAct_9fa48("61648") ? false : stryMutAct_9fa48("61647") ? true : (stryCov_9fa48("61647", "61648", "61649"), (stryMutAct_9fa48("61651") ? normalizedRouterState !== STATE.CONNECTED : stryMutAct_9fa48("61650") ? false : (stryCov_9fa48("61650", "61651"), normalizedRouterState === STATE.CONNECTED)) || (stryMutAct_9fa48("61653") ? normalizedRouterState !== STATE.READY : stryMutAct_9fa48("61652") ? false : (stryCov_9fa48("61652", "61653"), normalizedRouterState === STATE.READY)))) {
        if (stryMutAct_9fa48("61654")) {
          {}
        } else {
          stryCov_9fa48("61654");
          connected = stryMutAct_9fa48("61655") ? false : (stryCov_9fa48("61655"), true);
        }
      } else {
        if (stryMutAct_9fa48("61656")) {
          {}
        } else {
          stryCov_9fa48("61656");
          connected = stryMutAct_9fa48("61659") ? normalizedRowState === STATE.CONNECTED && normalizedRowState === STATE.READY : stryMutAct_9fa48("61658") ? false : stryMutAct_9fa48("61657") ? true : (stryCov_9fa48("61657", "61658", "61659"), (stryMutAct_9fa48("61661") ? normalizedRowState !== STATE.CONNECTED : stryMutAct_9fa48("61660") ? false : (stryCov_9fa48("61660", "61661"), normalizedRowState === STATE.CONNECTED)) || (stryMutAct_9fa48("61663") ? normalizedRowState !== STATE.READY : stryMutAct_9fa48("61662") ? false : (stryCov_9fa48("61662", "61663"), normalizedRowState === STATE.READY)));
        }
      }
      return Object.freeze(stryMutAct_9fa48("61664") ? {} : (stryCov_9fa48("61664"), {
        connected,
        rowState: normalizedRowState,
        routerState: normalizedRouterState
      }));
    }
  }

  /**
   * Return true when a node row encodes a transport-connected state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isNodeTransportConnected(nodeId, nodeRow) {
    if (stryMutAct_9fa48("61665")) {
      {}
    } else {
      stryCov_9fa48("61665");
      return this.getNodeTransportState(nodeId, nodeRow).connected;
    }
  }

  /**
   * Return true when heartbeat evidence is recent enough for stale-lease grace.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isRecentHeartbeat(nodeRow) {
    if (stryMutAct_9fa48("61666")) {
      {}
    } else {
      stryCov_9fa48("61666");
      const lastHeartbeat = Number(stryMutAct_9fa48("61667") ? nodeRow[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("61667"), nodeRow?.[COLUMN.LAST_HEARTBEAT]));
      if (stryMutAct_9fa48("61670") ? false : stryMutAct_9fa48("61669") ? true : stryMutAct_9fa48("61668") ? Number.isFinite(lastHeartbeat) : (stryCov_9fa48("61668", "61669", "61670"), !Number.isFinite(lastHeartbeat))) {
        if (stryMutAct_9fa48("61671")) {
          {}
        } else {
          stryCov_9fa48("61671");
          return stryMutAct_9fa48("61672") ? true : (stryCov_9fa48("61672"), false);
        }
      }
      return stryMutAct_9fa48("61676") ? this.now() - lastHeartbeat > this.clusterMemberStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("61675") ? this.now() - lastHeartbeat < this.clusterMemberStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("61674") ? false : stryMutAct_9fa48("61673") ? true : (stryCov_9fa48("61673", "61674", "61675", "61676"), (stryMutAct_9fa48("61677") ? this.now() + lastHeartbeat : (stryCov_9fa48("61677"), this.now() - lastHeartbeat)) <= this.clusterMemberStaleHeartbeatMaxAgeMs);
    }
  }

  /**
   * Evaluate cluster membership health using canonical readiness row data and
   * live transport connectivity when available.
   *
   * Node rows with valid leases are healthy. Rows that were ready when written
   * remain healthy through short cache-propagation lag as long as transport is
   * connected and heartbeat evidence is still fresh.
   *
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isClusterMemberHealthy(nodeId, nodeRow) {
    if (stryMutAct_9fa48("61678")) {
      {}
    } else {
      stryCov_9fa48("61678");
      const hasLeaseField = Number.isFinite(Number(stryMutAct_9fa48("61679") ? nodeRow[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("61679"), nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT])));
      const hasStatusField = stryMutAct_9fa48("61682") ? typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING || nodeRow[COLUMN.STATUS].length > NUM.ZERO : stryMutAct_9fa48("61681") ? false : stryMutAct_9fa48("61680") ? true : (stryCov_9fa48("61680", "61681", "61682"), (stryMutAct_9fa48("61684") ? typeof nodeRow?.[COLUMN.STATUS] !== TYPEOF.STRING : stryMutAct_9fa48("61683") ? true : (stryCov_9fa48("61683", "61684"), typeof (stryMutAct_9fa48("61685") ? nodeRow[COLUMN.STATUS] : (stryCov_9fa48("61685"), nodeRow?.[COLUMN.STATUS])) === TYPEOF.STRING)) && (stryMutAct_9fa48("61688") ? nodeRow[COLUMN.STATUS].length <= NUM.ZERO : stryMutAct_9fa48("61687") ? nodeRow[COLUMN.STATUS].length >= NUM.ZERO : stryMutAct_9fa48("61686") ? true : (stryCov_9fa48("61686", "61687", "61688"), nodeRow[COLUMN.STATUS].length > NUM.ZERO)));
      if (stryMutAct_9fa48("61691") ? !hasLeaseField || !hasStatusField : stryMutAct_9fa48("61690") ? false : stryMutAct_9fa48("61689") ? true : (stryCov_9fa48("61689", "61690", "61691"), (stryMutAct_9fa48("61692") ? hasLeaseField : (stryCov_9fa48("61692"), !hasLeaseField)) && (stryMutAct_9fa48("61693") ? hasStatusField : (stryCov_9fa48("61693"), !hasStatusField)))) {
        if (stryMutAct_9fa48("61694")) {
          {}
        } else {
          stryCov_9fa48("61694");
          return stryMutAct_9fa48("61695") ? !nodeRow : (stryCov_9fa48("61695"), !(stryMutAct_9fa48("61696") ? nodeRow : (stryCov_9fa48("61696"), !nodeRow)));
        }
      }
      const now = this.now();
      if (stryMutAct_9fa48("61698") ? false : stryMutAct_9fa48("61697") ? true : (stryCov_9fa48("61697", "61698"), isNodeRecordReady(nodeRow, stryMutAct_9fa48("61699") ? {} : (stryCov_9fa48("61699"), {
        now
      })))) {
        if (stryMutAct_9fa48("61700")) {
          {}
        } else {
          stryCov_9fa48("61700");
          return stryMutAct_9fa48("61701") ? false : (stryCov_9fa48("61701"), true);
        }
      }
      const statusActive = stryMutAct_9fa48("61704") ? String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase() !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("61703") ? false : stryMutAct_9fa48("61702") ? true : (stryCov_9fa48("61702", "61703", "61704"), (stryMutAct_9fa48("61705") ? String(nodeRow?.[COLUMN.STATUS] || '').toUpperCase() : (stryCov_9fa48("61705"), String(stryMutAct_9fa48("61708") ? nodeRow?.[COLUMN.STATUS] && '' : stryMutAct_9fa48("61707") ? false : stryMutAct_9fa48("61706") ? true : (stryCov_9fa48("61706", "61707", "61708"), (stryMutAct_9fa48("61709") ? nodeRow[COLUMN.STATUS] : (stryCov_9fa48("61709"), nodeRow?.[COLUMN.STATUS])) || (stryMutAct_9fa48("61710") ? "Stryker was here!" : (stryCov_9fa48("61710"), '')))).toLowerCase())) === SERVICE_STATUS.ACTIVE);
      if (stryMutAct_9fa48("61713") ? false : stryMutAct_9fa48("61712") ? true : stryMutAct_9fa48("61711") ? statusActive : (stryCov_9fa48("61711", "61712", "61713"), !statusActive)) {
        if (stryMutAct_9fa48("61714")) {
          {}
        } else {
          stryCov_9fa48("61714");
          return stryMutAct_9fa48("61715") ? true : (stryCov_9fa48("61715"), false);
        }
      }
      if (stryMutAct_9fa48("61718") ? nodeId !== this.nodeId || isNodeReadyLeaseExplicitlyCleared(nodeRow) : stryMutAct_9fa48("61717") ? false : stryMutAct_9fa48("61716") ? true : (stryCov_9fa48("61716", "61717", "61718"), (stryMutAct_9fa48("61720") ? nodeId === this.nodeId : stryMutAct_9fa48("61719") ? true : (stryCov_9fa48("61719", "61720"), nodeId !== this.nodeId)) && isNodeReadyLeaseExplicitlyCleared(nodeRow))) {
        if (stryMutAct_9fa48("61721")) {
          {}
        } else {
          stryCov_9fa48("61721");
          return stryMutAct_9fa48("61722") ? true : (stryCov_9fa48("61722"), false);
        }
      }

      // §1.4.12 self-node fast path: a running node evaluating its own
      // cluster membership is trivially healthy — it is alive and
      // executing this check. This is the strongest possible signal,
      // stronger than any cache lease or transport evidence. Without
      // this, CDC propagation delays during topology changes (splits,
      // rebalance) cause the local cache lease to expire before the
      // heartbeat CDC event propagates back, leading to self-denial
      // of load-lane admission.
      if (stryMutAct_9fa48("61725") ? nodeId !== this.nodeId : stryMutAct_9fa48("61724") ? false : stryMutAct_9fa48("61723") ? true : (stryCov_9fa48("61723", "61724", "61725"), nodeId === this.nodeId)) {
        if (stryMutAct_9fa48("61726")) {
          {}
        } else {
          stryCov_9fa48("61726");
          return stryMutAct_9fa48("61727") ? false : (stryCov_9fa48("61727"), true);
        }
      }
      if (stryMutAct_9fa48("61730") ? false : stryMutAct_9fa48("61729") ? true : stryMutAct_9fa48("61728") ? this.isNodeTransportConnected(nodeId, nodeRow) : (stryCov_9fa48("61728", "61729", "61730"), !this.isNodeTransportConnected(nodeId, nodeRow))) {
        if (stryMutAct_9fa48("61731")) {
          {}
        } else {
          stryCov_9fa48("61731");
          return stryMutAct_9fa48("61732") ? true : (stryCov_9fa48("61732"), false);
        }
      }
      const connectionState = stryMutAct_9fa48("61733") ? String(nodeRow?.[COLUMN.CONNECTION_STATE] || '').toUpperCase() : (stryCov_9fa48("61733"), String(stryMutAct_9fa48("61736") ? nodeRow?.[COLUMN.CONNECTION_STATE] && '' : stryMutAct_9fa48("61735") ? false : stryMutAct_9fa48("61734") ? true : (stryCov_9fa48("61734", "61735", "61736"), (stryMutAct_9fa48("61737") ? nodeRow[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("61737"), nodeRow?.[COLUMN.CONNECTION_STATE])) || (stryMutAct_9fa48("61738") ? "Stryker was here!" : (stryCov_9fa48("61738"), '')))).toLowerCase());
      if (stryMutAct_9fa48("61741") ? connectionState === STATE.READY : stryMutAct_9fa48("61740") ? false : stryMutAct_9fa48("61739") ? true : (stryCov_9fa48("61739", "61740", "61741"), connectionState !== STATE.READY)) {
        if (stryMutAct_9fa48("61742")) {
          {}
        } else {
          stryCov_9fa48("61742");
          return stryMutAct_9fa48("61743") ? true : (stryCov_9fa48("61743"), false);
        }
      }
      return this.isRecentHeartbeat(nodeRow);
    }
  }

  /**
   * Build a compact snapshot summary suitable for persistence
   * alongside admission, dispatch, and progression decisions.
   *
   * Extracts only the key fields needed for diagnostics linkage
   * without the full verbose snapshot (publication details, capacity
   * breakdown, etc.).
   *
   * @param {Object|null} snapshot - Frozen readiness snapshot from
   *   getNodeReadiness / getNodeReadinessSync.
   * @param {string|null} [decisionDimension] - Canonical dimension used by
   *   the caller when evaluating this snapshot.
   * @return {Object|null} Compact frozen summary or null.
   */
  static compactSnapshotSummary(snapshot, decisionDimension = null) {
    if (stryMutAct_9fa48("61744")) {
      {}
    } else {
      stryCov_9fa48("61744");
      return compactEligibilitySnapshot(snapshot, decisionDimension);
    }
  }
}
export { ControlPlaneReadinessService };