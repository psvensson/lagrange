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
import { assertCritical } from '../utils/assert.js';
import { NUM, TABLES, TYPEOF } from '../constants/index.js';
import { ControlPlaneDiagnosticsLedger } from './control-plane-diagnostics-ledger.js';
import { OperationLane } from '../workflow/operation-lane.js';
const READINESS_DIAGNOSTICS_LEDGER_LIMIT = 128;
const EMPTY_STRING = stryMutAct_9fa48("56900") ? "Stryker was here!" : (stryCov_9fa48("56900"), '');
const EMPTY_LEDGER_ENTRIES = Object.freeze(stryMutAct_9fa48("56901") ? ["Stryker was here"] : (stryCov_9fa48("56901"), []));
const EMPTY_REPAIR_ROWS = Object.freeze(stryMutAct_9fa48("56902") ? ["Stryker was here"] : (stryCov_9fa48("56902"), []));
const DEFAULT_REPAIR_COOLDOWN_MS = 5000;
const DEFAULT_REPAIR_FAILURE_COOLDOWN_MS = 30000;
const DEFAULT_REPAIR_NO_CHANGE_COOLDOWN_MS = 15000;
const DEFAULT_REPAIR_QUERY_TIMEOUT_MS = 1500;
const DEFAULT_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS = 30000;
const REPAIR_STAGE = Object.freeze(stryMutAct_9fa48("56903") ? {} : (stryCov_9fa48("56903"), {
  SCHEDULED: stryMutAct_9fa48("56904") ? "" : (stryCov_9fa48("56904"), 'scheduled'),
  COOLDOWN_SKIPPED: stryMutAct_9fa48("56905") ? "" : (stryCov_9fa48("56905"), 'cooldown_skipped'),
  COMPLETED: stryMutAct_9fa48("56906") ? "" : (stryCov_9fa48("56906"), 'completed'),
  FAILED: stryMutAct_9fa48("56907") ? "" : (stryCov_9fa48("56907"), 'failed')
}));
const REPAIR_LANE_NAME = stryMutAct_9fa48("56908") ? "" : (stryCov_9fa48("56908"), 'control-plane-readiness-repair');
const REPAIR_CAUSE_PREFIX = stryMutAct_9fa48("56909") ? "" : (stryCov_9fa48("56909"), 'readiness-authoritative-cache-repair:');
const AUTHORITATIVE_REPAIR_STATE = Object.freeze(stryMutAct_9fa48("56910") ? {} : (stryCov_9fa48("56910"), {
  VIEW_UNAVAILABLE: stryMutAct_9fa48("56911") ? "" : (stryCov_9fa48("56911"), 'view_unavailable'),
  SNAPSHOT_UNAVAILABLE: stryMutAct_9fa48("56912") ? "" : (stryCov_9fa48("56912"), 'snapshot_unavailable'),
  REPAIRED: stryMutAct_9fa48("56913") ? "" : (stryCov_9fa48("56913"), 'repaired'),
  UNCHANGED: stryMutAct_9fa48("56914") ? "" : (stryCov_9fa48("56914"), 'unchanged')
}));
const AUTHORITATIVE_ROW_OBSERVATION = Object.freeze(stryMutAct_9fa48("56915") ? {} : (stryCov_9fa48("56915"), {
  OBSERVED: stryMutAct_9fa48("56916") ? "" : (stryCov_9fa48("56916"), 'observed'),
  UNAVAILABLE: stryMutAct_9fa48("56917") ? "" : (stryCov_9fa48("56917"), 'unavailable')
}));
const REPAIR_OUTCOME_FAILED = stryMutAct_9fa48("56918") ? "" : (stryCov_9fa48("56918"), 'failed');
const REPAIR_OUTCOME_REPAIRED = stryMutAct_9fa48("56919") ? "" : (stryCov_9fa48("56919"), 'repaired');
const REPAIR_OUTCOME_UNCHANGED = stryMutAct_9fa48("56920") ? "" : (stryCov_9fa48("56920"), 'unchanged');
const REPAIR_FAILED_LOG_MESSAGE = stryMutAct_9fa48("56921") ? "" : (stryCov_9fa48("56921"), 'Authoritative readiness repair failed');
const REPAIR_APPLIED_LOG_MESSAGE = stryMutAct_9fa48("56922") ? "" : (stryCov_9fa48("56922"), 'Repaired readiness cache from authoritative node/service rows');
const REPAIR_REQUIRED_DEPENDENCY_ERROR_PREFIX = stryMutAct_9fa48("56923") ? "" : (stryCov_9fa48("56923"), 'AuthoritativeNodeEvidenceReconciler requires ');
const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_DEPENDENCY = stryMutAct_9fa48("56924") ? "" : (stryCov_9fa48("56924"), 'controlPlaneSystemTableGateway');
const UNKNOWN_AUTHORITATIVE_REPAIR_STATE_ERROR_PREFIX = stryMutAct_9fa48("56925") ? "" : (stryCov_9fa48("56925"), 'Unknown authoritative node repair state: ');
function normalizePositiveInteger(value, fallback = NUM.ZERO) {
  if (stryMutAct_9fa48("56926")) {
    {}
  } else {
    stryCov_9fa48("56926");
    return (stryMutAct_9fa48("56929") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("56928") ? false : stryMutAct_9fa48("56927") ? true : (stryCov_9fa48("56927", "56928", "56929"), Number.isFinite(value) && (stryMutAct_9fa48("56932") ? value <= NUM.ZERO : stryMutAct_9fa48("56931") ? value >= NUM.ZERO : stryMutAct_9fa48("56930") ? true : (stryCov_9fa48("56930", "56931", "56932"), value > NUM.ZERO)))) ? Math.floor(value) : fallback;
  }
}
function buildRepairOutcome(options = {}) {
  if (stryMutAct_9fa48("56933")) {
    {}
  } else {
    stryCov_9fa48("56933");
    return stryMutAct_9fa48("56934") ? {} : (stryCov_9fa48("56934"), {
      repaired: stryMutAct_9fa48("56937") ? options.repaired !== true : stryMutAct_9fa48("56936") ? false : stryMutAct_9fa48("56935") ? true : (stryCov_9fa48("56935", "56936", "56937"), options.repaired === (stryMutAct_9fa48("56938") ? false : (stryCov_9fa48("56938"), true))),
      outcome: stryMutAct_9fa48("56941") ? options.outcome && REPAIR_OUTCOME_UNCHANGED : stryMutAct_9fa48("56940") ? false : stryMutAct_9fa48("56939") ? true : (stryCov_9fa48("56939", "56940", "56941"), options.outcome || REPAIR_OUTCOME_UNCHANGED),
      nodeRowCount: Number.isFinite(options.nodeRowCount) ? options.nodeRowCount : NUM.ZERO,
      serviceRowCount: Number.isFinite(options.serviceRowCount) ? options.serviceRowCount : NUM.ZERO
    });
  }
}
class AuthoritativeNodeEvidenceReconciler {
  constructor(options = {}) {
    if (stryMutAct_9fa48("56942")) {
      {}
    } else {
      stryCov_9fa48("56942");
      this.nodeId = stryMutAct_9fa48("56945") ? options.nodeId && null : stryMutAct_9fa48("56944") ? false : stryMutAct_9fa48("56943") ? true : (stryCov_9fa48("56943", "56944", "56945"), options.nodeId || null);
      this.now = (stryMutAct_9fa48("56948") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("56947") ? false : stryMutAct_9fa48("56946") ? true : (stryCov_9fa48("56946", "56947", "56948"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("56949") ? () => undefined : (stryCov_9fa48("56949"), () => Date.now());
      this.logger = stryMutAct_9fa48("56952") ? options.logger && console : stryMutAct_9fa48("56951") ? false : stryMutAct_9fa48("56950") ? true : (stryCov_9fa48("56950", "56951", "56952"), options.logger || console);
      this.cdcIntegrationService = stryMutAct_9fa48("56955") ? options.cdcIntegrationService && null : stryMutAct_9fa48("56954") ? false : stryMutAct_9fa48("56953") ? true : (stryCov_9fa48("56953", "56954", "56955"), options.cdcIntegrationService || null);
      this.cacheMutationTarget = stryMutAct_9fa48("56958") ? options.cacheMutationTarget && null : stryMutAct_9fa48("56957") ? false : stryMutAct_9fa48("56956") ? true : (stryCov_9fa48("56956", "56957", "56958"), options.cacheMutationTarget || null);
      this.systemTableCache = stryMutAct_9fa48("56961") ? options.systemTableCache && null : stryMutAct_9fa48("56960") ? false : stryMutAct_9fa48("56959") ? true : (stryCov_9fa48("56959", "56960", "56961"), options.systemTableCache || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("56964") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("56963") ? false : stryMutAct_9fa48("56962") ? true : (stryCov_9fa48("56962", "56963", "56964"), options.controlPlaneSystemTableGateway || null);
      this.getAuthoritativeControlPlaneView = (stryMutAct_9fa48("56967") ? typeof options.getAuthoritativeControlPlaneView !== TYPEOF.FUNCTION : stryMutAct_9fa48("56966") ? false : stryMutAct_9fa48("56965") ? true : (stryCov_9fa48("56965", "56966", "56967"), typeof options.getAuthoritativeControlPlaneView === TYPEOF.FUNCTION)) ? options.getAuthoritativeControlPlaneView : stryMutAct_9fa48("56968") ? () => undefined : (stryCov_9fa48("56968"), () => null);
      this.readNodeRow = (stryMutAct_9fa48("56971") ? typeof options.readNodeRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("56970") ? false : stryMutAct_9fa48("56969") ? true : (stryCov_9fa48("56969", "56970", "56971"), typeof options.readNodeRow === TYPEOF.FUNCTION)) ? options.readNodeRow : stryMutAct_9fa48("56972") ? () => undefined : (stryCov_9fa48("56972"), async () => null);
      this.readNodeServiceRows = (stryMutAct_9fa48("56975") ? typeof options.readNodeServiceRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("56974") ? false : stryMutAct_9fa48("56973") ? true : (stryCov_9fa48("56973", "56974", "56975"), typeof options.readNodeServiceRows === TYPEOF.FUNCTION)) ? options.readNodeServiceRows : stryMutAct_9fa48("56976") ? () => undefined : (stryCov_9fa48("56976"), async () => stryMutAct_9fa48("56977") ? ["Stryker was here"] : (stryCov_9fa48("56977"), []));
      this.resolveDecisionDimension = (stryMutAct_9fa48("56980") ? typeof options.resolveDecisionDimension !== TYPEOF.FUNCTION : stryMutAct_9fa48("56979") ? false : stryMutAct_9fa48("56978") ? true : (stryCov_9fa48("56978", "56979", "56980"), typeof options.resolveDecisionDimension === TYPEOF.FUNCTION)) ? options.resolveDecisionDimension : stryMutAct_9fa48("56981") ? () => undefined : (stryCov_9fa48("56981"), () => null);
      this.getNodeTransportState = (stryMutAct_9fa48("56984") ? typeof options.getNodeTransportState !== TYPEOF.FUNCTION : stryMutAct_9fa48("56983") ? false : stryMutAct_9fa48("56982") ? true : (stryCov_9fa48("56982", "56983", "56984"), typeof options.getNodeTransportState === TYPEOF.FUNCTION)) ? options.getNodeTransportState : stryMutAct_9fa48("56985") ? () => undefined : (stryCov_9fa48("56985"), () => stryMutAct_9fa48("56986") ? {} : (stryCov_9fa48("56986"), {
        connected: stryMutAct_9fa48("56987") ? true : (stryCov_9fa48("56987"), false)
      }));
      this.shouldPreferLocalSelfNodeEvidence = (stryMutAct_9fa48("56990") ? typeof options.shouldPreferLocalSelfNodeEvidence !== TYPEOF.FUNCTION : stryMutAct_9fa48("56989") ? false : stryMutAct_9fa48("56988") ? true : (stryCov_9fa48("56988", "56989", "56990"), typeof options.shouldPreferLocalSelfNodeEvidence === TYPEOF.FUNCTION)) ? options.shouldPreferLocalSelfNodeEvidence : stryMutAct_9fa48("56991") ? () => undefined : (stryCov_9fa48("56991"), () => stryMutAct_9fa48("56992") ? true : (stryCov_9fa48("56992"), false));
      this.hasFreshLocalReporterSuccess = (stryMutAct_9fa48("56995") ? typeof options.hasFreshLocalReporterSuccess !== TYPEOF.FUNCTION : stryMutAct_9fa48("56994") ? false : stryMutAct_9fa48("56993") ? true : (stryCov_9fa48("56993", "56994", "56995"), typeof options.hasFreshLocalReporterSuccess === TYPEOF.FUNCTION)) ? options.hasFreshLocalReporterSuccess : stryMutAct_9fa48("56996") ? () => undefined : (stryCov_9fa48("56996"), () => stryMutAct_9fa48("56997") ? true : (stryCov_9fa48("56997"), false));
      this.buildNodeEvidence = (stryMutAct_9fa48("57000") ? typeof options.buildNodeEvidence !== TYPEOF.FUNCTION : stryMutAct_9fa48("56999") ? false : stryMutAct_9fa48("56998") ? true : (stryCov_9fa48("56998", "56999", "57000"), typeof options.buildNodeEvidence === TYPEOF.FUNCTION)) ? options.buildNodeEvidence : stryMutAct_9fa48("57001") ? () => undefined : (stryCov_9fa48("57001"), () => null);
      this.isClusterMemberHealthy = (stryMutAct_9fa48("57004") ? typeof options.isClusterMemberHealthy !== TYPEOF.FUNCTION : stryMutAct_9fa48("57003") ? false : stryMutAct_9fa48("57002") ? true : (stryCov_9fa48("57002", "57003", "57004"), typeof options.isClusterMemberHealthy === TYPEOF.FUNCTION)) ? options.isClusterMemberHealthy : stryMutAct_9fa48("57005") ? () => undefined : (stryCov_9fa48("57005"), () => stryMutAct_9fa48("57006") ? true : (stryCov_9fa48("57006"), false));
      this.hasRoutableService = (stryMutAct_9fa48("57009") ? typeof options.hasRoutableService !== TYPEOF.FUNCTION : stryMutAct_9fa48("57008") ? false : stryMutAct_9fa48("57007") ? true : (stryCov_9fa48("57007", "57008", "57009"), typeof options.hasRoutableService === TYPEOF.FUNCTION)) ? options.hasRoutableService : stryMutAct_9fa48("57010") ? () => undefined : (stryCov_9fa48("57010"), () => stryMutAct_9fa48("57011") ? true : (stryCov_9fa48("57011"), false));
      this.hasWritableControlPlaneService = (stryMutAct_9fa48("57014") ? typeof options.hasWritableControlPlaneService !== TYPEOF.FUNCTION : stryMutAct_9fa48("57013") ? false : stryMutAct_9fa48("57012") ? true : (stryCov_9fa48("57012", "57013", "57014"), typeof options.hasWritableControlPlaneService === TYPEOF.FUNCTION)) ? options.hasWritableControlPlaneService : stryMutAct_9fa48("57015") ? () => undefined : (stryCov_9fa48("57015"), () => stryMutAct_9fa48("57016") ? true : (stryCov_9fa48("57016"), false));
      this.authoritativeReadinessRepairCooldownMs = normalizePositiveInteger(options.authoritativeReadinessRepairCooldownMs, DEFAULT_REPAIR_COOLDOWN_MS);
      this.authoritativeReadinessRepairFailureCooldownMs = normalizePositiveInteger(options.authoritativeReadinessRepairFailureCooldownMs, DEFAULT_REPAIR_FAILURE_COOLDOWN_MS);
      this.authoritativeReadinessRepairNoChangeCooldownMs = normalizePositiveInteger(options.authoritativeReadinessRepairNoChangeCooldownMs, DEFAULT_REPAIR_NO_CHANGE_COOLDOWN_MS);
      this.authoritativeReadinessRepairQueryTimeoutMs = normalizePositiveInteger(options.authoritativeReadinessRepairQueryTimeoutMs, DEFAULT_REPAIR_QUERY_TIMEOUT_MS);
      this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs = normalizePositiveInteger(options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs, DEFAULT_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS);
      this.lastRepairAtMsByKey = new Map();
      this.lastRepairCooldownMsByKey = new Map();
      this.lastRepairByNodeId = new Map();
      this.repairLedger = stryMutAct_9fa48("57019") ? options.authoritativeReadinessRepairLedger && new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(options.authoritativeReadinessRepairLedgerMaxEntries, READINESS_DIAGNOSTICS_LEDGER_LIMIT),
        now: this.now
      }) : stryMutAct_9fa48("57018") ? false : stryMutAct_9fa48("57017") ? true : (stryCov_9fa48("57017", "57018", "57019"), options.authoritativeReadinessRepairLedger || new ControlPlaneDiagnosticsLedger(stryMutAct_9fa48("57020") ? {} : (stryCov_9fa48("57020"), {
        maxEntries: normalizePositiveInteger(options.authoritativeReadinessRepairLedgerMaxEntries, READINESS_DIAGNOSTICS_LEDGER_LIMIT),
        now: this.now
      })));
      this.repairLane = stryMutAct_9fa48("57023") ? options.authoritativeReadinessRepairLane && new OperationLane({
        name: REPAIR_LANE_NAME,
        workflowCoordinator: options.workflowCoordinator
      }) : stryMutAct_9fa48("57022") ? false : stryMutAct_9fa48("57021") ? true : (stryCov_9fa48("57021", "57022", "57023"), options.authoritativeReadinessRepairLane || new OperationLane(stryMutAct_9fa48("57024") ? {} : (stryCov_9fa48("57024"), {
        name: REPAIR_LANE_NAME,
        workflowCoordinator: options.workflowCoordinator
      })));
    }
  }
  canRepairNodeEvidence() {
    if (stryMutAct_9fa48("57025")) {
      {}
    } else {
      stryCov_9fa48("57025");
      return Boolean(stryMutAct_9fa48("57028") ? this.cdcIntegrationService && typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION && this.cacheMutationTarget || typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("57027") ? false : stryMutAct_9fa48("57026") ? true : (stryCov_9fa48("57026", "57027", "57028"), (stryMutAct_9fa48("57030") ? this.cdcIntegrationService && typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION || this.cacheMutationTarget : stryMutAct_9fa48("57029") ? true : (stryCov_9fa48("57029", "57030"), (stryMutAct_9fa48("57032") ? this.cdcIntegrationService || typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION : stryMutAct_9fa48("57031") ? true : (stryCov_9fa48("57031", "57032"), this.cdcIntegrationService && (stryMutAct_9fa48("57034") ? typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("57033") ? true : (stryCov_9fa48("57033", "57034"), typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION)))) && this.cacheMutationTarget)) && (stryMutAct_9fa48("57036") ? typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("57035") ? true : (stryCov_9fa48("57035", "57036"), typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION))));
    }
  }
  getLatestRepair(nodeId) {
    if (stryMutAct_9fa48("57037")) {
      {}
    } else {
      stryCov_9fa48("57037");
      return stryMutAct_9fa48("57040") ? this.lastRepairByNodeId.get(nodeId || null) && null : stryMutAct_9fa48("57039") ? false : stryMutAct_9fa48("57038") ? true : (stryCov_9fa48("57038", "57039", "57040"), this.lastRepairByNodeId.get(stryMutAct_9fa48("57043") ? nodeId && null : stryMutAct_9fa48("57042") ? false : stryMutAct_9fa48("57041") ? true : (stryCov_9fa48("57041", "57042", "57043"), nodeId || null)) || null);
    }
  }
  recordRepair(entry = {}) {
    if (stryMutAct_9fa48("57044")) {
      {}
    } else {
      stryCov_9fa48("57044");
      if (stryMutAct_9fa48("57047") ? false : stryMutAct_9fa48("57046") ? true : stryMutAct_9fa48("57045") ? this.repairLedger : (stryCov_9fa48("57045", "57046", "57047"), !this.repairLedger)) {
        if (stryMutAct_9fa48("57048")) {
          {}
        } else {
          stryCov_9fa48("57048");
          return;
        }
      }
      const recordedEntry = this.repairLedger.append(entry);
      const nodeId = (stryMutAct_9fa48("57051") ? typeof recordedEntry?.nodeId === TYPEOF.STRING || recordedEntry.nodeId.length > NUM.ZERO : stryMutAct_9fa48("57050") ? false : stryMutAct_9fa48("57049") ? true : (stryCov_9fa48("57049", "57050", "57051"), (stryMutAct_9fa48("57053") ? typeof recordedEntry?.nodeId !== TYPEOF.STRING : stryMutAct_9fa48("57052") ? true : (stryCov_9fa48("57052", "57053"), typeof (stryMutAct_9fa48("57054") ? recordedEntry.nodeId : (stryCov_9fa48("57054"), recordedEntry?.nodeId)) === TYPEOF.STRING)) && (stryMutAct_9fa48("57057") ? recordedEntry.nodeId.length <= NUM.ZERO : stryMutAct_9fa48("57056") ? recordedEntry.nodeId.length >= NUM.ZERO : stryMutAct_9fa48("57055") ? true : (stryCov_9fa48("57055", "57056", "57057"), recordedEntry.nodeId.length > NUM.ZERO)))) ? recordedEntry.nodeId : null;
      if (stryMutAct_9fa48("57059") ? false : stryMutAct_9fa48("57058") ? true : (stryCov_9fa48("57058", "57059"), nodeId)) {
        if (stryMutAct_9fa48("57060")) {
          {}
        } else {
          stryCov_9fa48("57060");
          this.lastRepairByNodeId.set(nodeId, Object.freeze(stryMutAct_9fa48("57061") ? {} : (stryCov_9fa48("57061"), {
            repairKey: stryMutAct_9fa48("57064") ? recordedEntry.repairKey && null : stryMutAct_9fa48("57063") ? false : stryMutAct_9fa48("57062") ? true : (stryCov_9fa48("57062", "57063", "57064"), recordedEntry.repairKey || null),
            stage: stryMutAct_9fa48("57067") ? recordedEntry.stage && null : stryMutAct_9fa48("57066") ? false : stryMutAct_9fa48("57065") ? true : (stryCov_9fa48("57065", "57066", "57067"), recordedEntry.stage || null),
            outcome: stryMutAct_9fa48("57070") ? recordedEntry.outcome && null : stryMutAct_9fa48("57069") ? false : stryMutAct_9fa48("57068") ? true : (stryCov_9fa48("57068", "57069", "57070"), recordedEntry.outcome || null),
            repaired: stryMutAct_9fa48("57073") ? recordedEntry.repaired !== true : stryMutAct_9fa48("57072") ? false : stryMutAct_9fa48("57071") ? true : (stryCov_9fa48("57071", "57072", "57073"), recordedEntry.repaired === (stryMutAct_9fa48("57074") ? false : (stryCov_9fa48("57074"), true))),
            nodeRowCount: Number.isFinite(recordedEntry.nodeRowCount) ? recordedEntry.nodeRowCount : null,
            serviceRowCount: Number.isFinite(recordedEntry.serviceRowCount) ? recordedEntry.serviceRowCount : null,
            decisionDimension: stryMutAct_9fa48("57077") ? recordedEntry.decisionDimension && null : stryMutAct_9fa48("57076") ? false : stryMutAct_9fa48("57075") ? true : (stryCov_9fa48("57075", "57076", "57077"), recordedEntry.decisionDimension || null),
            error: stryMutAct_9fa48("57080") ? recordedEntry.error && null : stryMutAct_9fa48("57079") ? false : stryMutAct_9fa48("57078") ? true : (stryCov_9fa48("57078", "57079", "57080"), recordedEntry.error || null),
            recordedAt: stryMutAct_9fa48("57083") ? recordedEntry.recordedAt && null : stryMutAct_9fa48("57082") ? false : stryMutAct_9fa48("57081") ? true : (stryCov_9fa48("57081", "57082", "57083"), recordedEntry.recordedAt || null),
            recordedAtMs: Number.isFinite(recordedEntry.recordedAtMs) ? recordedEntry.recordedAtMs : null
          })));
        }
      }
    }
  }
  getLedgerEntries(options = {}) {
    if (stryMutAct_9fa48("57084")) {
      {}
    } else {
      stryCov_9fa48("57084");
      return this.repairLedger ? this.repairLedger.getEntries(options) : EMPTY_LEDGER_ENTRIES;
    }
  }
  buildRepairKey(nodeId, _options = {}) {
    if (stryMutAct_9fa48("57085")) {
      {}
    } else {
      stryCov_9fa48("57085");
      return String(stryMutAct_9fa48("57088") ? nodeId && EMPTY_STRING : stryMutAct_9fa48("57087") ? false : stryMutAct_9fa48("57086") ? true : (stryCov_9fa48("57086", "57087", "57088"), nodeId || EMPTY_STRING));
    }
  }
  shouldBypassCooldown(options = {}) {
    if (stryMutAct_9fa48("57089")) {
      {}
    } else {
      stryCov_9fa48("57089");
      if (stryMutAct_9fa48("57092") ? options.allowAuthoritativeRefresh !== true && options.requireFreshOnIneligible !== true : stryMutAct_9fa48("57091") ? false : stryMutAct_9fa48("57090") ? true : (stryCov_9fa48("57090", "57091", "57092"), (stryMutAct_9fa48("57094") ? options.allowAuthoritativeRefresh === true : stryMutAct_9fa48("57093") ? false : (stryCov_9fa48("57093", "57094"), options.allowAuthoritativeRefresh !== (stryMutAct_9fa48("57095") ? false : (stryCov_9fa48("57095"), true)))) || (stryMutAct_9fa48("57097") ? options.requireFreshOnIneligible === true : stryMutAct_9fa48("57096") ? false : (stryCov_9fa48("57096", "57097"), options.requireFreshOnIneligible !== (stryMutAct_9fa48("57098") ? false : (stryCov_9fa48("57098"), true)))))) {
        if (stryMutAct_9fa48("57099")) {
          {}
        } else {
          stryCov_9fa48("57099");
          return stryMutAct_9fa48("57100") ? true : (stryCov_9fa48("57100"), false);
        }
      }
      return stryMutAct_9fa48("57101") ? false : (stryCov_9fa48("57101"), true);
    }
  }
  shouldRepairStaleHeartbeat(nodeEvidence) {
    if (stryMutAct_9fa48("57102")) {
      {}
    } else {
      stryCov_9fa48("57102");
      const heartbeatAgeMs = Number(stryMutAct_9fa48("57103") ? nodeEvidence.heartbeatAgeMs : (stryCov_9fa48("57103"), nodeEvidence?.heartbeatAgeMs));
      return stryMutAct_9fa48("57106") ? Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("57105") ? false : stryMutAct_9fa48("57104") ? true : (stryCov_9fa48("57104", "57105", "57106"), Number.isFinite(heartbeatAgeMs) && (stryMutAct_9fa48("57109") ? heartbeatAgeMs <= this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("57108") ? heartbeatAgeMs >= this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs : stryMutAct_9fa48("57107") ? true : (stryCov_9fa48("57107", "57108", "57109"), heartbeatAgeMs > this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs)));
    }
  }
  shouldRepairNodeEvidence(context = {}, options = {}) {
    if (stryMutAct_9fa48("57110")) {
      {}
    } else {
      stryCov_9fa48("57110");
      if (stryMutAct_9fa48("57113") ? false : stryMutAct_9fa48("57112") ? true : stryMutAct_9fa48("57111") ? this.canRepairNodeEvidence() : (stryCov_9fa48("57111", "57112", "57113"), !this.canRepairNodeEvidence())) {
        if (stryMutAct_9fa48("57114")) {
          {}
        } else {
          stryCov_9fa48("57114");
          return stryMutAct_9fa48("57115") ? true : (stryCov_9fa48("57115"), false);
        }
      }
      const nodeId = stryMutAct_9fa48("57118") ? context?.nodeId && null : stryMutAct_9fa48("57117") ? false : stryMutAct_9fa48("57116") ? true : (stryCov_9fa48("57116", "57117", "57118"), (stryMutAct_9fa48("57119") ? context.nodeId : (stryCov_9fa48("57119"), context?.nodeId)) || null);
      const nodeRow = stryMutAct_9fa48("57122") ? context?.nodeRow && null : stryMutAct_9fa48("57121") ? false : stryMutAct_9fa48("57120") ? true : (stryCov_9fa48("57120", "57121", "57122"), (stryMutAct_9fa48("57123") ? context.nodeRow : (stryCov_9fa48("57123"), context?.nodeRow)) || null);
      const serviceRows = Array.isArray(stryMutAct_9fa48("57124") ? context.serviceRows : (stryCov_9fa48("57124"), context?.serviceRows)) ? context.serviceRows : stryMutAct_9fa48("57125") ? ["Stryker was here"] : (stryCov_9fa48("57125"), []);
      if (stryMutAct_9fa48("57127") ? false : stryMutAct_9fa48("57126") ? true : (stryCov_9fa48("57126", "57127"), this.shouldPreferLocalSelfNodeEvidence(stryMutAct_9fa48("57128") ? {} : (stryCov_9fa48("57128"), {
        nodeId,
        nodeRow,
        serviceRows
      })))) {
        if (stryMutAct_9fa48("57129")) {
          {}
        } else {
          stryCov_9fa48("57129");
          return stryMutAct_9fa48("57130") ? true : (stryCov_9fa48("57130"), false);
        }
      }
      if (stryMutAct_9fa48("57133") ? options.forceAuthoritativeRefresh !== true : stryMutAct_9fa48("57132") ? false : stryMutAct_9fa48("57131") ? true : (stryCov_9fa48("57131", "57132", "57133"), options.forceAuthoritativeRefresh === (stryMutAct_9fa48("57134") ? false : (stryCov_9fa48("57134"), true)))) {
        if (stryMutAct_9fa48("57135")) {
          {}
        } else {
          stryCov_9fa48("57135");
          return stryMutAct_9fa48("57136") ? false : (stryCov_9fa48("57136"), true);
        }
      }
      if (stryMutAct_9fa48("57139") ? false : stryMutAct_9fa48("57138") ? true : stryMutAct_9fa48("57137") ? nodeRow : (stryCov_9fa48("57137", "57138", "57139"), !nodeRow)) {
        if (stryMutAct_9fa48("57140")) {
          {}
        } else {
          stryCov_9fa48("57140");
          return stryMutAct_9fa48("57141") ? false : (stryCov_9fa48("57141"), true);
        }
      }
      const transportState = this.getNodeTransportState(nodeId, nodeRow);
      if (stryMutAct_9fa48("57144") ? false : stryMutAct_9fa48("57143") ? true : stryMutAct_9fa48("57142") ? transportState?.connected : (stryCov_9fa48("57142", "57143", "57144"), !(stryMutAct_9fa48("57145") ? transportState.connected : (stryCov_9fa48("57145"), transportState?.connected)))) {
        if (stryMutAct_9fa48("57146")) {
          {}
        } else {
          stryCov_9fa48("57146");
          return stryMutAct_9fa48("57147") ? true : (stryCov_9fa48("57147"), false);
        }
      }
      const hasFreshLocalReporterSuccess = this.hasFreshLocalReporterSuccess(nodeId);
      const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
      if (stryMutAct_9fa48("57149") ? false : stryMutAct_9fa48("57148") ? true : (stryCov_9fa48("57148", "57149"), this.shouldRepairStaleHeartbeat(nodeEvidence))) {
        if (stryMutAct_9fa48("57150")) {
          {}
        } else {
          stryCov_9fa48("57150");
          return stryMutAct_9fa48("57151") ? hasFreshLocalReporterSuccess : (stryCov_9fa48("57151"), !hasFreshLocalReporterSuccess);
        }
      }
      if (stryMutAct_9fa48("57154") ? false : stryMutAct_9fa48("57153") ? true : stryMutAct_9fa48("57152") ? this.isClusterMemberHealthy(nodeId, nodeRow) : (stryCov_9fa48("57152", "57153", "57154"), !this.isClusterMemberHealthy(nodeId, nodeRow))) {
        if (stryMutAct_9fa48("57155")) {
          {}
        } else {
          stryCov_9fa48("57155");
          return stryMutAct_9fa48("57156") ? hasFreshLocalReporterSuccess : (stryCov_9fa48("57156"), !hasFreshLocalReporterSuccess);
        }
      }
      return stryMutAct_9fa48("57159") ? !this.hasRoutableService(serviceRows) && !this.hasWritableControlPlaneService(serviceRows) : stryMutAct_9fa48("57158") ? false : stryMutAct_9fa48("57157") ? true : (stryCov_9fa48("57157", "57158", "57159"), (stryMutAct_9fa48("57160") ? this.hasRoutableService(serviceRows) : (stryCov_9fa48("57160"), !this.hasRoutableService(serviceRows))) || (stryMutAct_9fa48("57161") ? this.hasWritableControlPlaneService(serviceRows) : (stryCov_9fa48("57161"), !this.hasWritableControlPlaneService(serviceRows))));
    }
  }
  async maybeRepairNodeEvidence(context = {}, options = {}) {
    if (stryMutAct_9fa48("57162")) {
      {}
    } else {
      stryCov_9fa48("57162");
      if (stryMutAct_9fa48("57165") ? false : stryMutAct_9fa48("57164") ? true : stryMutAct_9fa48("57163") ? this.shouldRepairNodeEvidence(context, options) : (stryCov_9fa48("57163", "57164", "57165"), !this.shouldRepairNodeEvidence(context, options))) {
        if (stryMutAct_9fa48("57166")) {
          {}
        } else {
          stryCov_9fa48("57166");
          return stryMutAct_9fa48("57167") ? true : (stryCov_9fa48("57167"), false);
        }
      }
      return this.ensureNodeEvidence(context.nodeId, options);
    }
  }
  async ensureNodeEvidence(nodeId, options = {}) {
    if (stryMutAct_9fa48("57168")) {
      {}
    } else {
      stryCov_9fa48("57168");
      if (stryMutAct_9fa48("57171") ? !nodeId && !this.canRepairNodeEvidence() : stryMutAct_9fa48("57170") ? false : stryMutAct_9fa48("57169") ? true : (stryCov_9fa48("57169", "57170", "57171"), (stryMutAct_9fa48("57172") ? nodeId : (stryCov_9fa48("57172"), !nodeId)) || (stryMutAct_9fa48("57173") ? this.canRepairNodeEvidence() : (stryCov_9fa48("57173"), !this.canRepairNodeEvidence())))) {
        if (stryMutAct_9fa48("57174")) {
          {}
        } else {
          stryCov_9fa48("57174");
          return stryMutAct_9fa48("57175") ? true : (stryCov_9fa48("57175"), false);
        }
      }
      const repairKey = this.buildRepairKey(nodeId, options);
      this.recordRepair(stryMutAct_9fa48("57176") ? {} : (stryCov_9fa48("57176"), {
        nodeId,
        repairKey,
        stage: REPAIR_STAGE.SCHEDULED,
        allowAuthoritativeRefresh: stryMutAct_9fa48("57179") ? options.allowAuthoritativeRefresh !== true : stryMutAct_9fa48("57178") ? false : stryMutAct_9fa48("57177") ? true : (stryCov_9fa48("57177", "57178", "57179"), options.allowAuthoritativeRefresh === (stryMutAct_9fa48("57180") ? false : (stryCov_9fa48("57180"), true))),
        requireFreshOnIneligible: stryMutAct_9fa48("57183") ? options.requireFreshOnIneligible !== true : stryMutAct_9fa48("57182") ? false : stryMutAct_9fa48("57181") ? true : (stryCov_9fa48("57181", "57182", "57183"), options.requireFreshOnIneligible === (stryMutAct_9fa48("57184") ? false : (stryCov_9fa48("57184"), true))),
        decisionDimension: this.resolveDecisionDimension(options)
      }));
      return this.repairLane.run(stryMutAct_9fa48("57185") ? {} : (stryCov_9fa48("57185"), {
        ownerKey: repairKey
      }), async () => {
        if (stryMutAct_9fa48("57186")) {
          {}
        } else {
          stryCov_9fa48("57186");
          const now = this.now();
          const lastRepairAt = stryMutAct_9fa48("57189") ? this.lastRepairAtMsByKey.get(repairKey) && NUM.ZERO : stryMutAct_9fa48("57188") ? false : stryMutAct_9fa48("57187") ? true : (stryCov_9fa48("57187", "57188", "57189"), this.lastRepairAtMsByKey.get(repairKey) || NUM.ZERO);
          const cooldownMs = stryMutAct_9fa48("57192") ? this.lastRepairCooldownMsByKey.get(repairKey) && this.authoritativeReadinessRepairCooldownMs : stryMutAct_9fa48("57191") ? false : stryMutAct_9fa48("57190") ? true : (stryCov_9fa48("57190", "57191", "57192"), this.lastRepairCooldownMsByKey.get(repairKey) || this.authoritativeReadinessRepairCooldownMs);
          const bypassCooldown = this.shouldBypassCooldown(options);
          if (stryMutAct_9fa48("57195") ? !bypassCooldown || now - lastRepairAt < cooldownMs : stryMutAct_9fa48("57194") ? false : stryMutAct_9fa48("57193") ? true : (stryCov_9fa48("57193", "57194", "57195"), (stryMutAct_9fa48("57196") ? bypassCooldown : (stryCov_9fa48("57196"), !bypassCooldown)) && (stryMutAct_9fa48("57199") ? now - lastRepairAt >= cooldownMs : stryMutAct_9fa48("57198") ? now - lastRepairAt <= cooldownMs : stryMutAct_9fa48("57197") ? true : (stryCov_9fa48("57197", "57198", "57199"), (stryMutAct_9fa48("57200") ? now + lastRepairAt : (stryCov_9fa48("57200"), now - lastRepairAt)) < cooldownMs)))) {
            if (stryMutAct_9fa48("57201")) {
              {}
            } else {
              stryCov_9fa48("57201");
              this.recordRepair(stryMutAct_9fa48("57202") ? {} : (stryCov_9fa48("57202"), {
                nodeId,
                repairKey,
                stage: REPAIR_STAGE.COOLDOWN_SKIPPED,
                decisionDimension: this.resolveDecisionDimension(options),
                cooldownMs,
                lastRepairAtMs: lastRepairAt
              }));
              return stryMutAct_9fa48("57203") ? true : (stryCov_9fa48("57203"), false);
            }
          }
          try {
            if (stryMutAct_9fa48("57204")) {
              {}
            } else {
              stryCov_9fa48("57204");
              const repairResult = await this.repairNodeEvidence(nodeId, options);
              const normalizedRepairResult = this.normalizeRepairResult(repairResult);
              this.lastRepairCooldownMsByKey.set(repairKey, this.resolveCooldownMs(normalizedRepairResult));
              this.recordRepair(stryMutAct_9fa48("57205") ? {} : (stryCov_9fa48("57205"), {
                nodeId,
                repairKey,
                stage: REPAIR_STAGE.COMPLETED,
                decisionDimension: this.resolveDecisionDimension(options),
                outcome: normalizedRepairResult.outcome,
                repaired: stryMutAct_9fa48("57208") ? normalizedRepairResult.repaired !== true : stryMutAct_9fa48("57207") ? false : stryMutAct_9fa48("57206") ? true : (stryCov_9fa48("57206", "57207", "57208"), normalizedRepairResult.repaired === (stryMutAct_9fa48("57209") ? false : (stryCov_9fa48("57209"), true))),
                nodeRowCount: normalizedRepairResult.nodeRowCount,
                serviceRowCount: normalizedRepairResult.serviceRowCount
              }));
              return stryMutAct_9fa48("57212") ? normalizedRepairResult.repaired !== true : stryMutAct_9fa48("57211") ? false : stryMutAct_9fa48("57210") ? true : (stryCov_9fa48("57210", "57211", "57212"), normalizedRepairResult.repaired === (stryMutAct_9fa48("57213") ? false : (stryCov_9fa48("57213"), true)));
            }
          } catch (error) {
            if (stryMutAct_9fa48("57214")) {
              {}
            } else {
              stryCov_9fa48("57214");
              this.lastRepairCooldownMsByKey.set(repairKey, this.authoritativeReadinessRepairFailureCooldownMs);
              this.recordRepair(stryMutAct_9fa48("57215") ? {} : (stryCov_9fa48("57215"), {
                nodeId,
                repairKey,
                stage: REPAIR_STAGE.FAILED,
                decisionDimension: this.resolveDecisionDimension(options),
                repaired: stryMutAct_9fa48("57216") ? true : (stryCov_9fa48("57216"), false),
                outcome: REPAIR_OUTCOME_FAILED,
                error: stryMutAct_9fa48("57219") ? error?.message && String(error) : stryMutAct_9fa48("57218") ? false : stryMutAct_9fa48("57217") ? true : (stryCov_9fa48("57217", "57218", "57219"), (stryMutAct_9fa48("57220") ? error.message : (stryCov_9fa48("57220"), error?.message)) || String(error))
              }));
              this.logger.warn(REPAIR_FAILED_LOG_MESSAGE, stryMutAct_9fa48("57221") ? {} : (stryCov_9fa48("57221"), {
                nodeId,
                error: stryMutAct_9fa48("57224") ? error?.message && String(error) : stryMutAct_9fa48("57223") ? false : stryMutAct_9fa48("57222") ? true : (stryCov_9fa48("57222", "57223", "57224"), (stryMutAct_9fa48("57225") ? error.message : (stryCov_9fa48("57225"), error?.message)) || String(error))
              }));
              return stryMutAct_9fa48("57226") ? true : (stryCov_9fa48("57226"), false);
            }
          } finally {
            if (stryMutAct_9fa48("57227")) {
              {}
            } else {
              stryCov_9fa48("57227");
              this.lastRepairAtMsByKey.set(repairKey, this.now());
            }
          }
        }
      });
    }
  }
  async repairNodeEvidence(nodeId, _options = {}) {
    if (stryMutAct_9fa48("57228")) {
      {}
    } else {
      stryCov_9fa48("57228");
      const repairContext = await this.collectRepairNodeEvidenceContext(nodeId);
      return this.buildRepairNodeEvidenceOutcome(nodeId, repairContext);
    }
  }
  async collectRepairNodeEvidenceContext(nodeId) {
    if (stryMutAct_9fa48("57229")) {
      {}
    } else {
      stryCov_9fa48("57229");
      const causeId = stryMutAct_9fa48("57230") ? `` : (stryCov_9fa48("57230"), `${REPAIR_CAUSE_PREFIX}${nodeId}:${Date.now()}`);
      const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
      if (stryMutAct_9fa48("57233") ? false : stryMutAct_9fa48("57232") ? true : stryMutAct_9fa48("57231") ? authoritativeControlPlaneView : (stryCov_9fa48("57231", "57232", "57233"), !authoritativeControlPlaneView)) {
        if (stryMutAct_9fa48("57234")) {
          {}
        } else {
          stryCov_9fa48("57234");
          return stryMutAct_9fa48("57235") ? {} : (stryCov_9fa48("57235"), {
            state: AUTHORITATIVE_REPAIR_STATE.VIEW_UNAVAILABLE,
            repairedRowCount: NUM.ZERO,
            nodeRowCount: NUM.ZERO,
            serviceRowCount: NUM.ZERO
          });
        }
      }
      const snapshot = await authoritativeControlPlaneView.readNodeSnapshot(nodeId, stryMutAct_9fa48("57236") ? {} : (stryCov_9fa48("57236"), {
        queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs
      }));
      const nodeRowObservation = (stryMutAct_9fa48("57239") ? snapshot?.tables?.nodes?.success !== true : stryMutAct_9fa48("57238") ? false : stryMutAct_9fa48("57237") ? true : (stryCov_9fa48("57237", "57238", "57239"), (stryMutAct_9fa48("57242") ? snapshot.tables?.nodes?.success : stryMutAct_9fa48("57241") ? snapshot?.tables.nodes?.success : stryMutAct_9fa48("57240") ? snapshot?.tables?.nodes.success : (stryCov_9fa48("57240", "57241", "57242"), snapshot?.tables?.nodes?.success)) === (stryMutAct_9fa48("57243") ? false : (stryCov_9fa48("57243"), true)))) ? AUTHORITATIVE_ROW_OBSERVATION.OBSERVED : AUTHORITATIVE_ROW_OBSERVATION.UNAVAILABLE;
      const serviceRowObservation = (stryMutAct_9fa48("57246") ? snapshot?.tables?.services?.success !== true : stryMutAct_9fa48("57245") ? false : stryMutAct_9fa48("57244") ? true : (stryCov_9fa48("57244", "57245", "57246"), (stryMutAct_9fa48("57249") ? snapshot.tables?.services?.success : stryMutAct_9fa48("57248") ? snapshot?.tables.services?.success : stryMutAct_9fa48("57247") ? snapshot?.tables?.services.success : (stryCov_9fa48("57247", "57248", "57249"), snapshot?.tables?.services?.success)) === (stryMutAct_9fa48("57250") ? false : (stryCov_9fa48("57250"), true)))) ? AUTHORITATIVE_ROW_OBSERVATION.OBSERVED : AUTHORITATIVE_ROW_OBSERVATION.UNAVAILABLE;
      const nodeRows = (stryMutAct_9fa48("57253") ? nodeRowObservation === AUTHORITATIVE_ROW_OBSERVATION.OBSERVED || Array.isArray(snapshot?.nodeRows) : stryMutAct_9fa48("57252") ? false : stryMutAct_9fa48("57251") ? true : (stryCov_9fa48("57251", "57252", "57253"), (stryMutAct_9fa48("57255") ? nodeRowObservation !== AUTHORITATIVE_ROW_OBSERVATION.OBSERVED : stryMutAct_9fa48("57254") ? true : (stryCov_9fa48("57254", "57255"), nodeRowObservation === AUTHORITATIVE_ROW_OBSERVATION.OBSERVED)) && Array.isArray(stryMutAct_9fa48("57256") ? snapshot.nodeRows : (stryCov_9fa48("57256"), snapshot?.nodeRows)))) ? snapshot.nodeRows : EMPTY_REPAIR_ROWS;
      const serviceRows = (stryMutAct_9fa48("57259") ? serviceRowObservation === AUTHORITATIVE_ROW_OBSERVATION.OBSERVED || Array.isArray(snapshot?.serviceRows) : stryMutAct_9fa48("57258") ? false : stryMutAct_9fa48("57257") ? true : (stryCov_9fa48("57257", "57258", "57259"), (stryMutAct_9fa48("57261") ? serviceRowObservation !== AUTHORITATIVE_ROW_OBSERVATION.OBSERVED : stryMutAct_9fa48("57260") ? true : (stryCov_9fa48("57260", "57261"), serviceRowObservation === AUTHORITATIVE_ROW_OBSERVATION.OBSERVED)) && Array.isArray(stryMutAct_9fa48("57262") ? snapshot.serviceRows : (stryCov_9fa48("57262"), snapshot?.serviceRows)))) ? snapshot.serviceRows : EMPTY_REPAIR_ROWS;
      const nodeRowCount = nodeRows.length;
      const serviceRowCount = serviceRows.length;
      const snapshotUnavailable = stryMutAct_9fa48("57265") ? nodeRowObservation === AUTHORITATIVE_ROW_OBSERVATION.UNAVAILABLE || serviceRowObservation === AUTHORITATIVE_ROW_OBSERVATION.UNAVAILABLE : stryMutAct_9fa48("57264") ? false : stryMutAct_9fa48("57263") ? true : (stryCov_9fa48("57263", "57264", "57265"), (stryMutAct_9fa48("57267") ? nodeRowObservation !== AUTHORITATIVE_ROW_OBSERVATION.UNAVAILABLE : stryMutAct_9fa48("57266") ? true : (stryCov_9fa48("57266", "57267"), nodeRowObservation === AUTHORITATIVE_ROW_OBSERVATION.UNAVAILABLE)) && (stryMutAct_9fa48("57269") ? serviceRowObservation !== AUTHORITATIVE_ROW_OBSERVATION.UNAVAILABLE : stryMutAct_9fa48("57268") ? true : (stryCov_9fa48("57268", "57269"), serviceRowObservation === AUTHORITATIVE_ROW_OBSERVATION.UNAVAILABLE)));
      let repairedRowCount = NUM.ZERO;
      if (stryMutAct_9fa48("57272") ? false : stryMutAct_9fa48("57271") ? true : stryMutAct_9fa48("57270") ? snapshotUnavailable : (stryCov_9fa48("57270", "57271", "57272"), !snapshotUnavailable)) {
        if (stryMutAct_9fa48("57273")) {
          {}
        } else {
          stryCov_9fa48("57273");
          const cachedNodeRow = await this.readNodeRow(nodeId);
          const cachedServiceRows = await this.readNodeServiceRows(nodeId);
          if (stryMutAct_9fa48("57276") ? nodeRowObservation !== AUTHORITATIVE_ROW_OBSERVATION.OBSERVED : stryMutAct_9fa48("57275") ? false : stryMutAct_9fa48("57274") ? true : (stryCov_9fa48("57274", "57275", "57276"), nodeRowObservation === AUTHORITATIVE_ROW_OBSERVATION.OBSERVED)) {
            if (stryMutAct_9fa48("57277")) {
              {}
            } else {
              stryCov_9fa48("57277");
              stryMutAct_9fa48("57278") ? repairedRowCount -= await this.applyAuthoritativeRows(TABLES.NODES, nodeRows, cachedNodeRow ? [cachedNodeRow] : EMPTY_REPAIR_ROWS, causeId) : (stryCov_9fa48("57278"), repairedRowCount += await this.applyAuthoritativeRows(TABLES.NODES, nodeRows, cachedNodeRow ? stryMutAct_9fa48("57279") ? [] : (stryCov_9fa48("57279"), [cachedNodeRow]) : EMPTY_REPAIR_ROWS, causeId));
            }
          }
          if (stryMutAct_9fa48("57282") ? serviceRowObservation !== AUTHORITATIVE_ROW_OBSERVATION.OBSERVED : stryMutAct_9fa48("57281") ? false : stryMutAct_9fa48("57280") ? true : (stryCov_9fa48("57280", "57281", "57282"), serviceRowObservation === AUTHORITATIVE_ROW_OBSERVATION.OBSERVED)) {
            if (stryMutAct_9fa48("57283")) {
              {}
            } else {
              stryCov_9fa48("57283");
              stryMutAct_9fa48("57284") ? repairedRowCount -= await this.applyAuthoritativeRows(TABLES.SERVICES, serviceRows, cachedServiceRows, causeId) : (stryCov_9fa48("57284"), repairedRowCount += await this.applyAuthoritativeRows(TABLES.SERVICES, serviceRows, cachedServiceRows, causeId));
            }
          }
        }
      }
      const repairState = snapshotUnavailable ? AUTHORITATIVE_REPAIR_STATE.SNAPSHOT_UNAVAILABLE : (stryMutAct_9fa48("57288") ? repairedRowCount <= NUM.ZERO : stryMutAct_9fa48("57287") ? repairedRowCount >= NUM.ZERO : stryMutAct_9fa48("57286") ? false : stryMutAct_9fa48("57285") ? true : (stryCov_9fa48("57285", "57286", "57287", "57288"), repairedRowCount > NUM.ZERO)) ? AUTHORITATIVE_REPAIR_STATE.REPAIRED : AUTHORITATIVE_REPAIR_STATE.UNCHANGED;
      return stryMutAct_9fa48("57289") ? {} : (stryCov_9fa48("57289"), {
        state: repairState,
        repairedRowCount,
        nodeRowCount,
        serviceRowCount
      });
    }
  }
  buildRepairNodeEvidenceOutcome(nodeId, repairContext = {}) {
    if (stryMutAct_9fa48("57290")) {
      {}
    } else {
      stryCov_9fa48("57290");
      switch (repairContext.state) {
        case AUTHORITATIVE_REPAIR_STATE.VIEW_UNAVAILABLE:
        case AUTHORITATIVE_REPAIR_STATE.SNAPSHOT_UNAVAILABLE:
          if (stryMutAct_9fa48("57291")) {} else {
            stryCov_9fa48("57291");
            return buildRepairOutcome(stryMutAct_9fa48("57292") ? {} : (stryCov_9fa48("57292"), {
              outcome: REPAIR_OUTCOME_FAILED
            }));
          }
        case AUTHORITATIVE_REPAIR_STATE.REPAIRED:
          if (stryMutAct_9fa48("57293")) {} else {
            stryCov_9fa48("57293");
            this.logger.warn(REPAIR_APPLIED_LOG_MESSAGE, stryMutAct_9fa48("57294") ? {} : (stryCov_9fa48("57294"), {
              nodeId,
              repairedRowCount: repairContext.repairedRowCount,
              repairedNodeRowCount: repairContext.nodeRowCount,
              repairedServiceRowCount: repairContext.serviceRowCount
            }));
            return buildRepairOutcome(stryMutAct_9fa48("57295") ? {} : (stryCov_9fa48("57295"), {
              repaired: stryMutAct_9fa48("57296") ? false : (stryCov_9fa48("57296"), true),
              outcome: REPAIR_OUTCOME_REPAIRED,
              nodeRowCount: repairContext.nodeRowCount,
              serviceRowCount: repairContext.serviceRowCount
            }));
          }
        case AUTHORITATIVE_REPAIR_STATE.UNCHANGED:
          if (stryMutAct_9fa48("57297")) {} else {
            stryCov_9fa48("57297");
            return buildRepairOutcome(stryMutAct_9fa48("57298") ? {} : (stryCov_9fa48("57298"), {
              outcome: REPAIR_OUTCOME_UNCHANGED,
              nodeRowCount: repairContext.nodeRowCount,
              serviceRowCount: repairContext.serviceRowCount
            }));
          }
        default:
          if (stryMutAct_9fa48("57299")) {} else {
            stryCov_9fa48("57299");
            throw new Error(stryMutAct_9fa48("57300") ? UNKNOWN_AUTHORITATIVE_REPAIR_STATE_ERROR_PREFIX - String(repairContext.state) : (stryCov_9fa48("57300"), UNKNOWN_AUTHORITATIVE_REPAIR_STATE_ERROR_PREFIX + String(repairContext.state)));
          }
      }
    }
  }
  normalizeRepairResult(repairResult) {
    if (stryMutAct_9fa48("57301")) {
      {}
    } else {
      stryCov_9fa48("57301");
      if (stryMutAct_9fa48("57304") ? repairResult || typeof repairResult === TYPEOF.OBJECT : stryMutAct_9fa48("57303") ? false : stryMutAct_9fa48("57302") ? true : (stryCov_9fa48("57302", "57303", "57304"), repairResult && (stryMutAct_9fa48("57306") ? typeof repairResult !== TYPEOF.OBJECT : stryMutAct_9fa48("57305") ? true : (stryCov_9fa48("57305", "57306"), typeof repairResult === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("57307")) {
          {}
        } else {
          stryCov_9fa48("57307");
          return buildRepairOutcome(stryMutAct_9fa48("57308") ? {} : (stryCov_9fa48("57308"), {
            repaired: stryMutAct_9fa48("57311") ? repairResult.repaired !== true : stryMutAct_9fa48("57310") ? false : stryMutAct_9fa48("57309") ? true : (stryCov_9fa48("57309", "57310", "57311"), repairResult.repaired === (stryMutAct_9fa48("57312") ? false : (stryCov_9fa48("57312"), true))),
            outcome: String(stryMutAct_9fa48("57315") ? repairResult.outcome && REPAIR_OUTCOME_UNCHANGED : stryMutAct_9fa48("57314") ? false : stryMutAct_9fa48("57313") ? true : (stryCov_9fa48("57313", "57314", "57315"), repairResult.outcome || REPAIR_OUTCOME_UNCHANGED)),
            nodeRowCount: Number.isFinite(repairResult.nodeRowCount) ? repairResult.nodeRowCount : NUM.ZERO,
            serviceRowCount: Number.isFinite(repairResult.serviceRowCount) ? repairResult.serviceRowCount : NUM.ZERO
          }));
        }
      }
      return buildRepairOutcome(stryMutAct_9fa48("57316") ? {} : (stryCov_9fa48("57316"), {
        repaired: stryMutAct_9fa48("57319") ? repairResult !== true : stryMutAct_9fa48("57318") ? false : stryMutAct_9fa48("57317") ? true : (stryCov_9fa48("57317", "57318", "57319"), repairResult === (stryMutAct_9fa48("57320") ? false : (stryCov_9fa48("57320"), true))),
        outcome: (stryMutAct_9fa48("57323") ? repairResult !== true : stryMutAct_9fa48("57322") ? false : stryMutAct_9fa48("57321") ? true : (stryCov_9fa48("57321", "57322", "57323"), repairResult === (stryMutAct_9fa48("57324") ? false : (stryCov_9fa48("57324"), true)))) ? REPAIR_OUTCOME_REPAIRED : REPAIR_OUTCOME_UNCHANGED
      }));
    }
  }
  resolveCooldownMs(repairResult) {
    if (stryMutAct_9fa48("57325")) {
      {}
    } else {
      stryCov_9fa48("57325");
      if (stryMutAct_9fa48("57328") ? repairResult?.repaired === true && repairResult?.outcome === REPAIR_OUTCOME_REPAIRED : stryMutAct_9fa48("57327") ? false : stryMutAct_9fa48("57326") ? true : (stryCov_9fa48("57326", "57327", "57328"), (stryMutAct_9fa48("57330") ? repairResult?.repaired !== true : stryMutAct_9fa48("57329") ? false : (stryCov_9fa48("57329", "57330"), (stryMutAct_9fa48("57331") ? repairResult.repaired : (stryCov_9fa48("57331"), repairResult?.repaired)) === (stryMutAct_9fa48("57332") ? false : (stryCov_9fa48("57332"), true)))) || (stryMutAct_9fa48("57334") ? repairResult?.outcome !== REPAIR_OUTCOME_REPAIRED : stryMutAct_9fa48("57333") ? false : (stryCov_9fa48("57333", "57334"), (stryMutAct_9fa48("57335") ? repairResult.outcome : (stryCov_9fa48("57335"), repairResult?.outcome)) === REPAIR_OUTCOME_REPAIRED)))) {
        if (stryMutAct_9fa48("57336")) {
          {}
        } else {
          stryCov_9fa48("57336");
          return this.authoritativeReadinessRepairCooldownMs;
        }
      }
      if (stryMutAct_9fa48("57339") ? repairResult?.outcome !== REPAIR_OUTCOME_FAILED : stryMutAct_9fa48("57338") ? false : stryMutAct_9fa48("57337") ? true : (stryCov_9fa48("57337", "57338", "57339"), (stryMutAct_9fa48("57340") ? repairResult.outcome : (stryCov_9fa48("57340"), repairResult?.outcome)) === REPAIR_OUTCOME_FAILED)) {
        if (stryMutAct_9fa48("57341")) {
          {}
        } else {
          stryCov_9fa48("57341");
          return this.authoritativeReadinessRepairFailureCooldownMs;
        }
      }
      return this.authoritativeReadinessRepairNoChangeCooldownMs;
    }
  }
  async applyAuthoritativeRows(tableName, rows, cachedRows, causeId) {
    if (stryMutAct_9fa48("57342")) {
      {}
    } else {
      stryCov_9fa48("57342");
      const gateway = this.getControlPlaneSystemTableGateway();
      const result = await gateway.reconcileAuthoritativeCacheRows(tableName, rows, stryMutAct_9fa48("57343") ? {} : (stryCov_9fa48("57343"), {
        causeId,
        cachedRows,
        cacheMutationTarget: this.cacheMutationTarget,
        systemTableCache: this.systemTableCache
      }));
      return stryMutAct_9fa48("57346") ? result?.mutationCount && NUM.ZERO : stryMutAct_9fa48("57345") ? false : stryMutAct_9fa48("57344") ? true : (stryCov_9fa48("57344", "57345", "57346"), (stryMutAct_9fa48("57347") ? result.mutationCount : (stryCov_9fa48("57347"), result?.mutationCount)) || NUM.ZERO);
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("57348")) {
      {}
    } else {
      stryCov_9fa48("57348");
      return assertCritical(this.controlPlaneSystemTableGateway, stryMutAct_9fa48("57349") ? REPAIR_REQUIRED_DEPENDENCY_ERROR_PREFIX - CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_DEPENDENCY : (stryCov_9fa48("57349"), REPAIR_REQUIRED_DEPENDENCY_ERROR_PREFIX + CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_DEPENDENCY));
    }
  }
}
export { AuthoritativeNodeEvidenceReconciler };