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
import { resolveAdvertisedWebSocketAddress } from '../../transport/node-address-resolution.js';
import { HTTP_STATUS, NUM } from '../../constants/index.js';
import { BOOTSTRAP_PHASE, BOOTSTRAP_PIPELINE_ERROR_CODE } from '../bootstrap-constants.js';
import { BOOTSTRAP_API_DEFAULT, BOOTSTRAP_API_ERROR, BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_PROBE_REASON } from '../bootstrap-api-constants.js';
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../../control-plane/control-plane-error-classification.js';
const RETRYABLE_BOOTSTRAP_DEPENDENCY_ERROR_FRAGMENTS = Object.freeze(stryMutAct_9fa48("20806") ? [] : (stryCov_9fa48("20806"), [stryMutAct_9fa48("20807") ? "" : (stryCov_9fa48("20807"), 'ControlPlaneSystemTableGateway requires cdcIntegrationService'), stryMutAct_9fa48("20808") ? "" : (stryCov_9fa48("20808"), 'ControlPlaneSystemTableGateway requires sqlQueryEngine')]));
class BootstrapRequestOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("20809")) {
      {}
    } else {
      stryCov_9fa48("20809");
      this.delegates = stryMutAct_9fa48("20812") ? options.delegates && {} : stryMutAct_9fa48("20811") ? false : stryMutAct_9fa48("20810") ? true : (stryCov_9fa48("20810", "20811", "20812"), options.delegates || {});
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("20813")) {
      {}
    } else {
      stryCov_9fa48("20813");
      return stryMutAct_9fa48("20816") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("20815") ? false : stryMutAct_9fa48("20814") ? true : (stryCov_9fa48("20814", "20815", "20816"), (stryMutAct_9fa48("20817") ? this.delegates.getLogger() : (stryCov_9fa48("20817"), this.delegates.getLogger?.())) || console);
    }
  }
  getSeedNodeId() {
    if (stryMutAct_9fa48("20818")) {
      {}
    } else {
      stryCov_9fa48("20818");
      return stryMutAct_9fa48("20821") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("20820") ? false : stryMutAct_9fa48("20819") ? true : (stryCov_9fa48("20819", "20820", "20821"), (stryMutAct_9fa48("20822") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("20822"), this.delegates.getSeedNodeId?.())) || null);
    }
  }
  getSeedNodeAddress() {
    if (stryMutAct_9fa48("20823")) {
      {}
    } else {
      stryCov_9fa48("20823");
      return stryMutAct_9fa48("20826") ? this.delegates.getSeedNodeAddress?.() && null : stryMutAct_9fa48("20825") ? false : stryMutAct_9fa48("20824") ? true : (stryCov_9fa48("20824", "20825", "20826"), (stryMutAct_9fa48("20827") ? this.delegates.getSeedNodeAddress() : (stryCov_9fa48("20827"), this.delegates.getSeedNodeAddress?.())) || null);
    }
  }
  getSeedNodeWsAddress() {
    if (stryMutAct_9fa48("20828")) {
      {}
    } else {
      stryCov_9fa48("20828");
      return stryMutAct_9fa48("20831") ? this.delegates.getSeedNodeWsAddress?.() && null : stryMutAct_9fa48("20830") ? false : stryMutAct_9fa48("20829") ? true : (stryCov_9fa48("20829", "20830", "20831"), (stryMutAct_9fa48("20832") ? this.delegates.getSeedNodeWsAddress() : (stryCov_9fa48("20832"), this.delegates.getSeedNodeWsAddress?.())) || null);
    }
  }
  getWsPort() {
    if (stryMutAct_9fa48("20833")) {
      {}
    } else {
      stryCov_9fa48("20833");
      return stryMutAct_9fa48("20836") ? this.delegates.getWsPort?.() && null : stryMutAct_9fa48("20835") ? false : stryMutAct_9fa48("20834") ? true : (stryCov_9fa48("20834", "20835", "20836"), (stryMutAct_9fa48("20837") ? this.delegates.getWsPort() : (stryCov_9fa48("20837"), this.delegates.getWsPort?.())) || null);
    }
  }
  getBootstrapService() {
    if (stryMutAct_9fa48("20838")) {
      {}
    } else {
      stryCov_9fa48("20838");
      return stryMutAct_9fa48("20841") ? this.delegates.getBootstrapService?.() && null : stryMutAct_9fa48("20840") ? false : stryMutAct_9fa48("20839") ? true : (stryCov_9fa48("20839", "20840", "20841"), (stryMutAct_9fa48("20842") ? this.delegates.getBootstrapService() : (stryCov_9fa48("20842"), this.delegates.getBootstrapService?.())) || null);
    }
  }
  getMaxConcurrentBootstrapRequests() {
    if (stryMutAct_9fa48("20843")) {
      {}
    } else {
      stryCov_9fa48("20843");
      return stryMutAct_9fa48("20846") ? this.delegates.getMaxConcurrentBootstrapRequests?.() && NUM.ZERO : stryMutAct_9fa48("20845") ? false : stryMutAct_9fa48("20844") ? true : (stryCov_9fa48("20844", "20845", "20846"), (stryMutAct_9fa48("20847") ? this.delegates.getMaxConcurrentBootstrapRequests() : (stryCov_9fa48("20847"), this.delegates.getMaxConcurrentBootstrapRequests?.())) || NUM.ZERO);
    }
  }
  getBootstrapAdmissionRetryAfterMs() {
    if (stryMutAct_9fa48("20848")) {
      {}
    } else {
      stryCov_9fa48("20848");
      return stryMutAct_9fa48("20851") ? this.delegates.getBootstrapAdmissionRetryAfterMs?.() && NUM.ZERO : stryMutAct_9fa48("20850") ? false : stryMutAct_9fa48("20849") ? true : (stryCov_9fa48("20849", "20850", "20851"), (stryMutAct_9fa48("20852") ? this.delegates.getBootstrapAdmissionRetryAfterMs() : (stryCov_9fa48("20852"), this.delegates.getBootstrapAdmissionRetryAfterMs?.())) || NUM.ZERO);
    }
  }
  getInFlightBootstrapRequestCount() {
    if (stryMutAct_9fa48("20853")) {
      {}
    } else {
      stryCov_9fa48("20853");
      return stryMutAct_9fa48("20856") ? this.delegates.getInFlightBootstrapRequestCount?.() && NUM.ZERO : stryMutAct_9fa48("20855") ? false : stryMutAct_9fa48("20854") ? true : (stryCov_9fa48("20854", "20855", "20856"), (stryMutAct_9fa48("20857") ? this.delegates.getInFlightBootstrapRequestCount() : (stryCov_9fa48("20857"), this.delegates.getInFlightBootstrapRequestCount?.())) || NUM.ZERO);
    }
  }
  setInFlightBootstrapRequestCount(count) {
    if (stryMutAct_9fa48("20858")) {
      {}
    } else {
      stryCov_9fa48("20858");
      stryMutAct_9fa48("20859") ? this.delegates.setInFlightBootstrapRequestCount(count) : (stryCov_9fa48("20859"), this.delegates.setInFlightBootstrapRequestCount?.(count));
    }
  }
  validateBootstrapRequest(nodeId, nodeAddress) {
    if (stryMutAct_9fa48("20860")) {
      {}
    } else {
      stryCov_9fa48("20860");
      return stryMutAct_9fa48("20861") ? this.delegates.validateBootstrapRequest(nodeId, nodeAddress) : (stryCov_9fa48("20861"), this.delegates.validateBootstrapRequest?.(nodeId, nodeAddress));
    }
  }
  async checkForConflicts(nodeId, nodeAddress) {
    if (stryMutAct_9fa48("20862")) {
      {}
    } else {
      stryCov_9fa48("20862");
      return stryMutAct_9fa48("20863") ? this.delegates.checkForConflicts(nodeId, nodeAddress) : (stryCov_9fa48("20863"), this.delegates.checkForConflicts?.(nodeId, nodeAddress));
    }
  }
  async getBlockingMoveReplicaBootstrapAdmissions(now) {
    if (stryMutAct_9fa48("20864")) {
      {}
    } else {
      stryCov_9fa48("20864");
      return stryMutAct_9fa48("20867") ? this.delegates.getBlockingMoveReplicaBootstrapAdmissions?.(now) && [] : stryMutAct_9fa48("20866") ? false : stryMutAct_9fa48("20865") ? true : (stryCov_9fa48("20865", "20866", "20867"), (stryMutAct_9fa48("20868") ? this.delegates.getBlockingMoveReplicaBootstrapAdmissions(now) : (stryCov_9fa48("20868"), this.delegates.getBlockingMoveReplicaBootstrapAdmissions?.(now))) || (stryMutAct_9fa48("20869") ? ["Stryker was here"] : (stryCov_9fa48("20869"), [])));
    }
  }
  resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now) {
    if (stryMutAct_9fa48("20870")) {
      {}
    } else {
      stryCov_9fa48("20870");
      return stryMutAct_9fa48("20873") ? this.delegates.resolveMoveReplicaBootstrapAdmissionRetryAfterMs?.(reservation, now) && NUM.ZERO : stryMutAct_9fa48("20872") ? false : stryMutAct_9fa48("20871") ? true : (stryCov_9fa48("20871", "20872", "20873"), (stryMutAct_9fa48("20874") ? this.delegates.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now) : (stryCov_9fa48("20874"), this.delegates.resolveMoveReplicaBootstrapAdmissionRetryAfterMs?.(reservation, now))) || NUM.ZERO);
    }
  }
  buildBootstrapNotReadyResponse(options) {
    if (stryMutAct_9fa48("20875")) {
      {}
    } else {
      stryCov_9fa48("20875");
      return stryMutAct_9fa48("20878") ? this.delegates.buildBootstrapNotReadyResponse?.(options) && {
        success: false,
        error: options?.error,
        code: options?.code
      } : stryMutAct_9fa48("20877") ? false : stryMutAct_9fa48("20876") ? true : (stryCov_9fa48("20876", "20877", "20878"), (stryMutAct_9fa48("20879") ? this.delegates.buildBootstrapNotReadyResponse(options) : (stryCov_9fa48("20879"), this.delegates.buildBootstrapNotReadyResponse?.(options))) || (stryMutAct_9fa48("20880") ? {} : (stryCov_9fa48("20880"), {
        success: stryMutAct_9fa48("20881") ? true : (stryCov_9fa48("20881"), false),
        error: stryMutAct_9fa48("20882") ? options.error : (stryCov_9fa48("20882"), options?.error),
        code: stryMutAct_9fa48("20883") ? options.code : (stryCov_9fa48("20883"), options?.code)
      })));
    }
  }
  async waitForServiceLeaders(options = {}) {
    if (stryMutAct_9fa48("20884")) {
      {}
    } else {
      stryCov_9fa48("20884");
      return stryMutAct_9fa48("20887") ? this.delegates.waitForServiceLeaders?.(options) && {
        ready: false
      } : stryMutAct_9fa48("20886") ? false : stryMutAct_9fa48("20885") ? true : (stryCov_9fa48("20885", "20886", "20887"), (stryMutAct_9fa48("20888") ? this.delegates.waitForServiceLeaders(options) : (stryCov_9fa48("20888"), this.delegates.waitForServiceLeaders?.(options))) || (stryMutAct_9fa48("20889") ? {} : (stryCov_9fa48("20889"), {
        ready: stryMutAct_9fa48("20890") ? true : (stryCov_9fa48("20890"), false)
      })));
    }
  }
  async determineAndReserveMessageGroupAssignment(nodeId, options = {}) {
    if (stryMutAct_9fa48("20891")) {
      {}
    } else {
      stryCov_9fa48("20891");
      return stryMutAct_9fa48("20892") ? this.delegates.determineAndReserveMessageGroupAssignment(nodeId, options) : (stryCov_9fa48("20892"), this.delegates.determineAndReserveMessageGroupAssignment?.(nodeId, options));
    }
  }
  getCurrentEpoch() {
    if (stryMutAct_9fa48("20893")) {
      {}
    } else {
      stryCov_9fa48("20893");
      return stryMutAct_9fa48("20896") ? this.delegates.getCurrentEpoch?.() && null : stryMutAct_9fa48("20895") ? false : stryMutAct_9fa48("20894") ? true : (stryCov_9fa48("20894", "20895", "20896"), (stryMutAct_9fa48("20897") ? this.delegates.getCurrentEpoch() : (stryCov_9fa48("20897"), this.delegates.getCurrentEpoch?.())) || null);
    }
  }
  buildBootstrapTopologySnapshotEnvelope(options) {
    if (stryMutAct_9fa48("20898")) {
      {}
    } else {
      stryCov_9fa48("20898");
      return stryMutAct_9fa48("20901") ? this.delegates.buildBootstrapTopologySnapshotEnvelope?.(options) && {
        systemTableSnapshots: {},
        topologySnapshotMeta: null
      } : stryMutAct_9fa48("20900") ? false : stryMutAct_9fa48("20899") ? true : (stryCov_9fa48("20899", "20900", "20901"), (stryMutAct_9fa48("20902") ? this.delegates.buildBootstrapTopologySnapshotEnvelope(options) : (stryCov_9fa48("20902"), this.delegates.buildBootstrapTopologySnapshotEnvelope?.(options))) || (stryMutAct_9fa48("20903") ? {} : (stryCov_9fa48("20903"), {
        systemTableSnapshots: {},
        topologySnapshotMeta: null
      })));
    }
  }
  getClusterConfiguration() {
    if (stryMutAct_9fa48("20904")) {
      {}
    } else {
      stryCov_9fa48("20904");
      return stryMutAct_9fa48("20907") ? this.delegates.getClusterConfiguration?.() && {} : stryMutAct_9fa48("20906") ? false : stryMutAct_9fa48("20905") ? true : (stryCov_9fa48("20905", "20906", "20907"), (stryMutAct_9fa48("20908") ? this.delegates.getClusterConfiguration() : (stryCov_9fa48("20908"), this.delegates.getClusterConfiguration?.())) || {});
    }
  }
  getReadyNodes(options = {}) {
    if (stryMutAct_9fa48("20909")) {
      {}
    } else {
      stryCov_9fa48("20909");
      return stryMutAct_9fa48("20912") ? this.delegates.getReadyNodes?.(options) && [] : stryMutAct_9fa48("20911") ? false : stryMutAct_9fa48("20910") ? true : (stryCov_9fa48("20910", "20911", "20912"), (stryMutAct_9fa48("20913") ? this.delegates.getReadyNodes(options) : (stryCov_9fa48("20913"), this.delegates.getReadyNodes?.(options))) || (stryMutAct_9fa48("20914") ? ["Stryker was here"] : (stryCov_9fa48("20914"), [])));
    }
  }
  getTablePolicies() {
    if (stryMutAct_9fa48("20915")) {
      {}
    } else {
      stryCov_9fa48("20915");
      return stryMutAct_9fa48("20918") ? this.delegates.getTablePolicies?.() && {} : stryMutAct_9fa48("20917") ? false : stryMutAct_9fa48("20916") ? true : (stryCov_9fa48("20916", "20917", "20918"), (stryMutAct_9fa48("20919") ? this.delegates.getTablePolicies() : (stryCov_9fa48("20919"), this.delegates.getTablePolicies?.())) || {});
    }
  }
  getLatencyTopologyHints(nodeId) {
    if (stryMutAct_9fa48("20920")) {
      {}
    } else {
      stryCov_9fa48("20920");
      return stryMutAct_9fa48("20923") ? this.delegates.getLatencyTopologyHints?.(nodeId) && null : stryMutAct_9fa48("20922") ? false : stryMutAct_9fa48("20921") ? true : (stryCov_9fa48("20921", "20922", "20923"), (stryMutAct_9fa48("20924") ? this.delegates.getLatencyTopologyHints(nodeId) : (stryCov_9fa48("20924"), this.delegates.getLatencyTopologyHints?.(nodeId))) || null);
    }
  }
  isRetryableBootstrapDependencyError(error) {
    if (stryMutAct_9fa48("20925")) {
      {}
    } else {
      stryCov_9fa48("20925");
      const message = (stryMutAct_9fa48("20928") ? typeof error?.message !== 'string' : stryMutAct_9fa48("20927") ? false : stryMutAct_9fa48("20926") ? true : (stryCov_9fa48("20926", "20927", "20928"), typeof (stryMutAct_9fa48("20929") ? error.message : (stryCov_9fa48("20929"), error?.message)) === (stryMutAct_9fa48("20930") ? "" : (stryCov_9fa48("20930"), 'string')))) ? error.message : stryMutAct_9fa48("20931") ? "Stryker was here!" : (stryCov_9fa48("20931"), '');
      return stryMutAct_9fa48("20932") ? RETRYABLE_BOOTSTRAP_DEPENDENCY_ERROR_FRAGMENTS.every(fragment => message.includes(fragment)) : (stryCov_9fa48("20932"), RETRYABLE_BOOTSTRAP_DEPENDENCY_ERROR_FRAGMENTS.some(stryMutAct_9fa48("20933") ? () => undefined : (stryCov_9fa48("20933"), fragment => message.includes(fragment))));
    }
  }
  isRetryableBootstrapRequestError(error) {
    if (stryMutAct_9fa48("20934")) {
      {}
    } else {
      stryCov_9fa48("20934");
      if (stryMutAct_9fa48("20937") ? false : stryMutAct_9fa48("20936") ? true : stryMutAct_9fa48("20935") ? error : (stryCov_9fa48("20935", "20936", "20937"), !error)) {
        if (stryMutAct_9fa48("20938")) {
          {}
        } else {
          stryCov_9fa48("20938");
          return stryMutAct_9fa48("20939") ? true : (stryCov_9fa48("20939"), false);
        }
      }
      if (stryMutAct_9fa48("20942") ? Number.isFinite(error?.statusCode) || Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("20941") ? false : stryMutAct_9fa48("20940") ? true : (stryCov_9fa48("20940", "20941", "20942"), Number.isFinite(stryMutAct_9fa48("20943") ? error.statusCode : (stryCov_9fa48("20943"), error?.statusCode)) && (stryMutAct_9fa48("20945") ? Math.floor(error.statusCode) !== HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("20944") ? true : (stryCov_9fa48("20944", "20945"), Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE)))) {
        if (stryMutAct_9fa48("20946")) {
          {}
        } else {
          stryCov_9fa48("20946");
          return stryMutAct_9fa48("20947") ? false : (stryCov_9fa48("20947"), true);
        }
      }
      if (stryMutAct_9fa48("20950") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("20949") ? false : stryMutAct_9fa48("20948") ? true : (stryCov_9fa48("20948", "20949", "20950"), Number.isFinite(stryMutAct_9fa48("20951") ? error.retryAfterMs : (stryCov_9fa48("20951"), error?.retryAfterMs)) && (stryMutAct_9fa48("20954") ? error.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("20953") ? error.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("20952") ? true : (stryCov_9fa48("20952", "20953", "20954"), error.retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("20955")) {
          {}
        } else {
          stryCov_9fa48("20955");
          return stryMutAct_9fa48("20956") ? false : (stryCov_9fa48("20956"), true);
        }
      }
      return stryMutAct_9fa48("20959") ? isRetryableControlPlaneError(error) && this.isRetryableBootstrapDependencyError(error) : stryMutAct_9fa48("20958") ? false : stryMutAct_9fa48("20957") ? true : (stryCov_9fa48("20957", "20958", "20959"), isRetryableControlPlaneError(error) || this.isRetryableBootstrapDependencyError(error));
    }
  }
  resolveBootstrapRequestRetryAfterMs(error) {
    if (stryMutAct_9fa48("20960")) {
      {}
    } else {
      stryCov_9fa48("20960");
      const retryAfterMs = getControlPlaneRetryAfterMs(error);
      if (stryMutAct_9fa48("20964") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("20963") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("20962") ? false : stryMutAct_9fa48("20961") ? true : (stryCov_9fa48("20961", "20962", "20963", "20964"), retryAfterMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("20965")) {
          {}
        } else {
          stryCov_9fa48("20965");
          return retryAfterMs;
        }
      }
      return stryMutAct_9fa48("20966") ? Math.min(NUM.ZERO, this.getBootstrapAdmissionRetryAfterMs()) : (stryCov_9fa48("20966"), Math.max(NUM.ZERO, this.getBootstrapAdmissionRetryAfterMs()));
    }
  }
  async handleBootstrapRequest(request, reply) {
    if (stryMutAct_9fa48("20967")) {
      {}
    } else {
      stryCov_9fa48("20967");
      const {
        nodeId,
        nodeAddress
      } = stryMutAct_9fa48("20970") ? request.body && {} : stryMutAct_9fa48("20969") ? false : stryMutAct_9fa48("20968") ? true : (stryCov_9fa48("20968", "20969", "20970"), request.body || {});
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RECEIVED_BOOTSTRAP_REQUEST, stryMutAct_9fa48("20971") ? {} : (stryCov_9fa48("20971"), {
        nodeId,
        nodeAddress,
        seedNodeId: this.getSeedNodeId()
      }));
      const validationError = this.validateBootstrapRequest(nodeId, nodeAddress);
      if (stryMutAct_9fa48("20973") ? false : stryMutAct_9fa48("20972") ? true : (stryCov_9fa48("20972", "20973"), validationError)) {
        if (stryMutAct_9fa48("20974")) {
          {}
        } else {
          stryCov_9fa48("20974");
          this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.VALIDATION_FAILED, stryMutAct_9fa48("20975") ? {} : (stryCov_9fa48("20975"), {
            nodeId,
            nodeAddress,
            error: validationError
          }));
          reply.code(HTTP_STATUS.BAD_REQUEST);
          return stryMutAct_9fa48("20976") ? {} : (stryCov_9fa48("20976"), {
            error: validationError
          });
        }
      }
      const bootstrapService = this.getBootstrapService();
      if (stryMutAct_9fa48("20979") ? bootstrapService || bootstrapService.phase !== BOOTSTRAP_PHASE.COMPLETE : stryMutAct_9fa48("20978") ? false : stryMutAct_9fa48("20977") ? true : (stryCov_9fa48("20977", "20978", "20979"), bootstrapService && (stryMutAct_9fa48("20981") ? bootstrapService.phase === BOOTSTRAP_PHASE.COMPLETE : stryMutAct_9fa48("20980") ? true : (stryCov_9fa48("20980", "20981"), bootstrapService.phase !== BOOTSTRAP_PHASE.COMPLETE)))) {
        if (stryMutAct_9fa48("20982")) {
          {}
        } else {
          stryCov_9fa48("20982");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
          return this.buildBootstrapNotReadyResponse(stryMutAct_9fa48("20983") ? {} : (stryCov_9fa48("20983"), {
            error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
            code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
            phase: bootstrapService.phase,
            reasonCode: BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE
          }));
        }
      }
      const conflictError = await this.checkForConflicts(nodeId, nodeAddress);
      if (stryMutAct_9fa48("20985") ? false : stryMutAct_9fa48("20984") ? true : (stryCov_9fa48("20984", "20985"), conflictError)) {
        if (stryMutAct_9fa48("20986")) {
          {}
        } else {
          stryCov_9fa48("20986");
          this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, stryMutAct_9fa48("20987") ? {} : (stryCov_9fa48("20987"), {
            nodeId,
            nodeAddress,
            error: conflictError
          }));
          reply.code(HTTP_STATUS.CONFLICT);
          return stryMutAct_9fa48("20988") ? {} : (stryCov_9fa48("20988"), {
            error: conflictError
          });
        }
      }
      const now = Date.now();
      const blockingMoveReplicaAdmissions = await this.getBlockingMoveReplicaBootstrapAdmissions(now);
      if (stryMutAct_9fa48("20992") ? blockingMoveReplicaAdmissions.length <= NUM.ZERO : stryMutAct_9fa48("20991") ? blockingMoveReplicaAdmissions.length >= NUM.ZERO : stryMutAct_9fa48("20990") ? false : stryMutAct_9fa48("20989") ? true : (stryCov_9fa48("20989", "20990", "20991", "20992"), blockingMoveReplicaAdmissions.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("20993")) {
          {}
        } else {
          stryCov_9fa48("20993");
          const blockingReservation = blockingMoveReplicaAdmissions[NUM.ZERO];
          const retryAfterMs = this.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(blockingReservation, now);
          this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, stryMutAct_9fa48("20994") ? {} : (stryCov_9fa48("20994"), {
            nodeId,
            nodeAddress,
            seedNodeId: this.getSeedNodeId(),
            admissionBlock: stryMutAct_9fa48("20995") ? "" : (stryCov_9fa48("20995"), 'move_replica_handoff_stabilizing'),
            assignmentId: blockingReservation.assignmentId,
            replicaId: blockingReservation.replicaId,
            groupId: stryMutAct_9fa48("20998") ? blockingReservation.groupId && null : stryMutAct_9fa48("20997") ? false : stryMutAct_9fa48("20996") ? true : (stryCov_9fa48("20996", "20997", "20998"), blockingReservation.groupId || null),
            sourceNodeId: stryMutAct_9fa48("21001") ? blockingReservation.sourceNodeId && null : stryMutAct_9fa48("21000") ? false : stryMutAct_9fa48("20999") ? true : (stryCov_9fa48("20999", "21000", "21001"), blockingReservation.sourceNodeId || null),
            targetNodeId: blockingReservation.targetNodeId,
            retryAfterMs
          }));
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
          return this.buildBootstrapNotReadyResponse(stryMutAct_9fa48("21002") ? {} : (stryCov_9fa48("21002"), {
            error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
            code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
            reasonCode: BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
            retryAfterMs
          }));
        }
      }
      if (stryMutAct_9fa48("21006") ? this.getInFlightBootstrapRequestCount() < this.getMaxConcurrentBootstrapRequests() : stryMutAct_9fa48("21005") ? this.getInFlightBootstrapRequestCount() > this.getMaxConcurrentBootstrapRequests() : stryMutAct_9fa48("21004") ? false : stryMutAct_9fa48("21003") ? true : (stryCov_9fa48("21003", "21004", "21005", "21006"), this.getInFlightBootstrapRequestCount() >= this.getMaxConcurrentBootstrapRequests())) {
        if (stryMutAct_9fa48("21007")) {
          {}
        } else {
          stryCov_9fa48("21007");
          this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, stryMutAct_9fa48("21008") ? {} : (stryCov_9fa48("21008"), {
            nodeId,
            nodeAddress,
            seedNodeId: this.getSeedNodeId(),
            inFlightBootstrapRequests: this.getInFlightBootstrapRequestCount(),
            maxConcurrentBootstrapRequests: this.getMaxConcurrentBootstrapRequests(),
            retryAfterMs: this.getBootstrapAdmissionRetryAfterMs()
          }));
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
          return this.buildBootstrapNotReadyResponse(stryMutAct_9fa48("21009") ? {} : (stryCov_9fa48("21009"), {
            error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
            code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
            reasonCode: BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
            retryAfterMs: this.getBootstrapAdmissionRetryAfterMs()
          }));
        }
      }
      this.setInFlightBootstrapRequestCount(stryMutAct_9fa48("21010") ? this.getInFlightBootstrapRequestCount() - NUM.ONE : (stryCov_9fa48("21010"), this.getInFlightBootstrapRequestCount() + NUM.ONE));
      try {
        if (stryMutAct_9fa48("21011")) {
          {}
        } else {
          stryCov_9fa48("21011");
          const leaderStatus = await this.waitForServiceLeaders(stryMutAct_9fa48("21012") ? {} : (stryCov_9fa48("21012"), {
            startupMode: stryMutAct_9fa48("21015") ? request.body?.startupMode && null : stryMutAct_9fa48("21014") ? false : stryMutAct_9fa48("21013") ? true : (stryCov_9fa48("21013", "21014", "21015"), (stryMutAct_9fa48("21016") ? request.body.startupMode : (stryCov_9fa48("21016"), request.body?.startupMode)) || null)
          }));
          if (stryMutAct_9fa48("21019") ? false : stryMutAct_9fa48("21018") ? true : stryMutAct_9fa48("21017") ? leaderStatus.ready : (stryCov_9fa48("21017", "21018", "21019"), !leaderStatus.ready)) {
            if (stryMutAct_9fa48("21020")) {
              {}
            } else {
              stryCov_9fa48("21020");
              this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, stryMutAct_9fa48("21021") ? {} : (stryCov_9fa48("21021"), {
                nodeId,
                missingPartitionLeaders: leaderStatus.missingPartitionLeaders,
                missingMessageGroupLeaders: leaderStatus.missingMessageGroupLeaders,
                missingPartitionLeaderNodes: leaderStatus.missingPartitionLeaderNodes,
                missingMessageGroupLeaderNodes: leaderStatus.missingMessageGroupLeaderNodes
              }));
              reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
              return this.buildBootstrapNotReadyResponse(stryMutAct_9fa48("21022") ? {} : (stryCov_9fa48("21022"), {
                error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
                code: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
                reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
                leaderReadiness: leaderStatus
              }));
            }
          }
          const assignment = await this.determineAndReserveMessageGroupAssignment(nodeId, stryMutAct_9fa48("21023") ? {} : (stryCov_9fa48("21023"), {
            startupMode: stryMutAct_9fa48("21026") ? request.body?.startupMode && null : stryMutAct_9fa48("21025") ? false : stryMutAct_9fa48("21024") ? true : (stryCov_9fa48("21024", "21025", "21026"), (stryMutAct_9fa48("21027") ? request.body.startupMode : (stryCov_9fa48("21027"), request.body?.startupMode)) || null)
          }));
          const currentEpoch = this.getCurrentEpoch();
          const {
            systemTableSnapshots,
            topologySnapshotMeta
          } = this.buildBootstrapTopologySnapshotEnvelope(stryMutAct_9fa48("21028") ? {} : (stryCov_9fa48("21028"), {
            currentEpoch
          }));
          const clusterConfig = this.getClusterConfiguration();
          const readyNodes = this.getReadyNodes(stryMutAct_9fa48("21029") ? {} : (stryCov_9fa48("21029"), {
            requirePublishedMembership: stryMutAct_9fa48("21030") ? false : (stryCov_9fa48("21030"), true)
          }));
          this.getLogger().info(BOOTSTRAP_API_LOG_MSG.READY_NODES_FOR_BOOTSTRAP, stryMutAct_9fa48("21031") ? {} : (stryCov_9fa48("21031"), {
            nodeId,
            readyNodesCount: readyNodes.length,
            readyNodes,
            seedNodeId: this.getSeedNodeId()
          }));
          const tablePolicies = this.getTablePolicies();
          const latencyTopologyHints = this.getLatencyTopologyHints(nodeId);
          const seedNodeWsAddress = resolveAdvertisedWebSocketAddress(stryMutAct_9fa48("21032") ? {} : (stryCov_9fa48("21032"), {
            advertisedAddress: this.getSeedNodeWsAddress(),
            nodeAddress: stryMutAct_9fa48("21035") ? this.getSeedNodeAddress() && BOOTSTRAP_API_DEFAULT.WS_HOST : stryMutAct_9fa48("21034") ? false : stryMutAct_9fa48("21033") ? true : (stryCov_9fa48("21033", "21034", "21035"), this.getSeedNodeAddress() || BOOTSTRAP_API_DEFAULT.WS_HOST),
            wsPort: stryMutAct_9fa48("21038") ? this.getWsPort() && null : stryMutAct_9fa48("21037") ? false : stryMutAct_9fa48("21036") ? true : (stryCov_9fa48("21036", "21037", "21038"), this.getWsPort() || null)
          }));
          const response = stryMutAct_9fa48("21039") ? {} : (stryCov_9fa48("21039"), {
            success: stryMutAct_9fa48("21040") ? false : (stryCov_9fa48("21040"), true),
            seedNodeId: this.getSeedNodeId(),
            seedNodeAddress: this.getSeedNodeAddress(),
            seedNodeWsAddress,
            messageGroupAssignment: assignment,
            systemTableSnapshots,
            topologySnapshotMeta,
            readyNodes,
            tablePolicies,
            currentEpoch,
            latencyTopologyHints,
            clusterConfig,
            leaderReadiness: stryMutAct_9fa48("21041") ? {} : (stryCov_9fa48("21041"), {
              ready: stryMutAct_9fa48("21044") ? leaderStatus.ready !== true : stryMutAct_9fa48("21043") ? false : stryMutAct_9fa48("21042") ? true : (stryCov_9fa48("21042", "21043", "21044"), leaderStatus.ready === (stryMutAct_9fa48("21045") ? false : (stryCov_9fa48("21045"), true))),
              missingPartitionLeaders: stryMutAct_9fa48("21048") ? leaderStatus.missingPartitionLeaders && [] : stryMutAct_9fa48("21047") ? false : stryMutAct_9fa48("21046") ? true : (stryCov_9fa48("21046", "21047", "21048"), leaderStatus.missingPartitionLeaders || (stryMutAct_9fa48("21049") ? ["Stryker was here"] : (stryCov_9fa48("21049"), []))),
              missingPartitionLeaderNodes: stryMutAct_9fa48("21052") ? leaderStatus.missingPartitionLeaderNodes && [] : stryMutAct_9fa48("21051") ? false : stryMutAct_9fa48("21050") ? true : (stryCov_9fa48("21050", "21051", "21052"), leaderStatus.missingPartitionLeaderNodes || (stryMutAct_9fa48("21053") ? ["Stryker was here"] : (stryCov_9fa48("21053"), []))),
              missingPartitionLeaderAddresses: stryMutAct_9fa48("21056") ? leaderStatus.missingPartitionLeaderAddresses && [] : stryMutAct_9fa48("21055") ? false : stryMutAct_9fa48("21054") ? true : (stryCov_9fa48("21054", "21055", "21056"), leaderStatus.missingPartitionLeaderAddresses || (stryMutAct_9fa48("21057") ? ["Stryker was here"] : (stryCov_9fa48("21057"), []))),
              missingMessageGroupLeaders: stryMutAct_9fa48("21060") ? leaderStatus.missingMessageGroupLeaders && [] : stryMutAct_9fa48("21059") ? false : stryMutAct_9fa48("21058") ? true : (stryCov_9fa48("21058", "21059", "21060"), leaderStatus.missingMessageGroupLeaders || (stryMutAct_9fa48("21061") ? ["Stryker was here"] : (stryCov_9fa48("21061"), []))),
              missingMessageGroupLeaderNodes: stryMutAct_9fa48("21064") ? leaderStatus.missingMessageGroupLeaderNodes && [] : stryMutAct_9fa48("21063") ? false : stryMutAct_9fa48("21062") ? true : (stryCov_9fa48("21062", "21063", "21064"), leaderStatus.missingMessageGroupLeaderNodes || (stryMutAct_9fa48("21065") ? ["Stryker was here"] : (stryCov_9fa48("21065"), []))),
              missingMessageGroupLeaderAddresses: stryMutAct_9fa48("21068") ? leaderStatus.missingMessageGroupLeaderAddresses && [] : stryMutAct_9fa48("21067") ? false : stryMutAct_9fa48("21066") ? true : (stryCov_9fa48("21066", "21067", "21068"), leaderStatus.missingMessageGroupLeaderAddresses || (stryMutAct_9fa48("21069") ? ["Stryker was here"] : (stryCov_9fa48("21069"), [])))
            }),
            timestamp: Date.now()
          });
          this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RESPONSE_PREPARED, stryMutAct_9fa48("21070") ? {} : (stryCov_9fa48("21070"), {
            nodeId,
            strategy: assignment.strategy,
            groupId: assignment.groupId
          }));
          return response;
        }
      } catch (error) {
        if (stryMutAct_9fa48("21071")) {
          {}
        } else {
          stryCov_9fa48("21071");
          if (stryMutAct_9fa48("21073") ? false : stryMutAct_9fa48("21072") ? true : (stryCov_9fa48("21072", "21073"), this.isRetryableBootstrapRequestError(error))) {
            if (stryMutAct_9fa48("21074")) {
              {}
            } else {
              stryCov_9fa48("21074");
              const retryAfterMs = this.resolveBootstrapRequestRetryAfterMs(error);
              this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, stryMutAct_9fa48("21075") ? {} : (stryCov_9fa48("21075"), {
                nodeId,
                nodeAddress,
                error: error.message,
                code: stryMutAct_9fa48("21078") ? (error?.errorCode || error?.code) && null : stryMutAct_9fa48("21077") ? false : stryMutAct_9fa48("21076") ? true : (stryCov_9fa48("21076", "21077", "21078"), (stryMutAct_9fa48("21080") ? error?.errorCode && error?.code : stryMutAct_9fa48("21079") ? false : (stryCov_9fa48("21079", "21080"), (stryMutAct_9fa48("21081") ? error.errorCode : (stryCov_9fa48("21081"), error?.errorCode)) || (stryMutAct_9fa48("21082") ? error.code : (stryCov_9fa48("21082"), error?.code)))) || null),
                retryAfterMs
              }));
              reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
              return this.buildBootstrapNotReadyResponse(stryMutAct_9fa48("21083") ? {} : (stryCov_9fa48("21083"), {
                error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
                code: (stryMutAct_9fa48("21086") ? typeof error?.errorCode === 'string' || error.errorCode.length > 0 : stryMutAct_9fa48("21085") ? false : stryMutAct_9fa48("21084") ? true : (stryCov_9fa48("21084", "21085", "21086"), (stryMutAct_9fa48("21088") ? typeof error?.errorCode !== 'string' : stryMutAct_9fa48("21087") ? true : (stryCov_9fa48("21087", "21088"), typeof (stryMutAct_9fa48("21089") ? error.errorCode : (stryCov_9fa48("21089"), error?.errorCode)) === (stryMutAct_9fa48("21090") ? "" : (stryCov_9fa48("21090"), 'string')))) && (stryMutAct_9fa48("21093") ? error.errorCode.length <= 0 : stryMutAct_9fa48("21092") ? error.errorCode.length >= 0 : stryMutAct_9fa48("21091") ? true : (stryCov_9fa48("21091", "21092", "21093"), error.errorCode.length > 0)))) ? error.errorCode : BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
                reasonCode: BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
                retryAfterMs
              }));
            }
          }
          this.getLogger().error(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, stryMutAct_9fa48("21094") ? {} : (stryCov_9fa48("21094"), {
            nodeId,
            nodeAddress,
            error: error.message,
            stack: error.stack
          }));
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("21095")) {
          {}
        } else {
          stryCov_9fa48("21095");
          this.setInFlightBootstrapRequestCount(stryMutAct_9fa48("21096") ? Math.min(NUM.ZERO, this.getInFlightBootstrapRequestCount() - NUM.ONE) : (stryCov_9fa48("21096"), Math.max(NUM.ZERO, stryMutAct_9fa48("21097") ? this.getInFlightBootstrapRequestCount() + NUM.ONE : (stryCov_9fa48("21097"), this.getInFlightBootstrapRequestCount() - NUM.ONE))));
        }
      }
    }
  }
}
export { BootstrapRequestOwner };