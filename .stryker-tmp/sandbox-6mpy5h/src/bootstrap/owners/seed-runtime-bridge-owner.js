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
import { assertCritical } from '../../utils/assert.js';
import { CDCIntegrationSetup } from '../shared/cdc-integration-setup.js';
import { LatencyTopologySetup } from '../shared/latency-topology-setup.js';
import { CDCPipelineReadinessGate } from '../../cdc/cdc-pipeline-readiness-gate.js';
import { BOOTSTRAP_ERROR, BOOTSTRAP_LOG_MSG } from '../bootstrap-constants.js';
import { EPOCH_CONFIG_KEY } from '../../cdc/cdc-integration-service.js';
import { COLUMN, CDC_OPERATION, TABLES } from '../../constants/index.js';
import { CDC_PROPAGATED_TABLES } from '../../cache/cache-constants.js';
const LOG_CDC_INITIALIZED = stryMutAct_9fa48("23231") ? "" : (stryCov_9fa48("23231"), 'CDC integration initialized by owner');
const CDC_INTEGRATION_OWNER = stryMutAct_9fa48("23232") ? "" : (stryCov_9fa48("23232"), 'CDCIntegrationSetup');
const CDC_INTEGRATION_MODE_BOOTSTRAP = stryMutAct_9fa48("23233") ? "" : (stryCov_9fa48("23233"), 'bootstrap');
const LATENCY_TOPOLOGY_OWNER = stryMutAct_9fa48("23234") ? "" : (stryCov_9fa48("23234"), 'LatencyTopologySetup');
class SeedRuntimeBridgeOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("23235")) {
      {}
    } else {
      stryCov_9fa48("23235");
      this.delegates = stryMutAct_9fa48("23238") ? options.delegates && {} : stryMutAct_9fa48("23237") ? false : stryMutAct_9fa48("23236") ? true : (stryCov_9fa48("23236", "23237", "23238"), options.delegates || {});
      this.compatibilityPhase = stryMutAct_9fa48("23241") ? options.compatibilityPhase && null : stryMutAct_9fa48("23240") ? false : stryMutAct_9fa48("23239") ? true : (stryCov_9fa48("23239", "23240", "23241"), options.compatibilityPhase || null);
    }
  }
  getCompatibilityOverride(methodName) {
    if (stryMutAct_9fa48("23242")) {
      {}
    } else {
      stryCov_9fa48("23242");
      if (stryMutAct_9fa48("23245") ? !this.compatibilityPhase && !Object.prototype.hasOwnProperty.call(this.compatibilityPhase, methodName) : stryMutAct_9fa48("23244") ? false : stryMutAct_9fa48("23243") ? true : (stryCov_9fa48("23243", "23244", "23245"), (stryMutAct_9fa48("23246") ? this.compatibilityPhase : (stryCov_9fa48("23246"), !this.compatibilityPhase)) || (stryMutAct_9fa48("23247") ? Object.prototype.hasOwnProperty.call(this.compatibilityPhase, methodName) : (stryCov_9fa48("23247"), !Object.prototype.hasOwnProperty.call(this.compatibilityPhase, methodName))))) {
        if (stryMutAct_9fa48("23248")) {
          {}
        } else {
          stryCov_9fa48("23248");
          return null;
        }
      }
      const override = this.compatibilityPhase[methodName];
      return (stryMutAct_9fa48("23251") ? typeof override !== 'function' : stryMutAct_9fa48("23250") ? false : stryMutAct_9fa48("23249") ? true : (stryCov_9fa48("23249", "23250", "23251"), typeof override === (stryMutAct_9fa48("23252") ? "" : (stryCov_9fa48("23252"), 'function')))) ? override.bind(this.compatibilityPhase) : null;
    }
  }
  applyCurrentEpochFromCache() {
    if (stryMutAct_9fa48("23253")) {
      {}
    } else {
      stryCov_9fa48("23253");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("23254") ? "" : (stryCov_9fa48("23254"), 'applyCurrentEpochFromCache'));
      if (stryMutAct_9fa48("23256") ? false : stryMutAct_9fa48("23255") ? true : (stryCov_9fa48("23255", "23256"), override)) {
        if (stryMutAct_9fa48("23257")) {
          {}
        } else {
          stryCov_9fa48("23257");
          return override();
        }
      }
      const d = this.delegates;
      const cdcIntegrationService = d.getCdcIntegrationService();
      const epochManager = d.getEpochManager();
      if (stryMutAct_9fa48("23260") ? !cdcIntegrationService && !epochManager : stryMutAct_9fa48("23259") ? false : stryMutAct_9fa48("23258") ? true : (stryCov_9fa48("23258", "23259", "23260"), (stryMutAct_9fa48("23261") ? cdcIntegrationService : (stryCov_9fa48("23261"), !cdcIntegrationService)) || (stryMutAct_9fa48("23262") ? epochManager : (stryCov_9fa48("23262"), !epochManager)))) {
        if (stryMutAct_9fa48("23263")) {
          {}
        } else {
          stryCov_9fa48("23263");
          return;
        }
      }
      const systemTableCache = d.getSystemTableCache();
      const epochRow = stryMutAct_9fa48("23264") ? systemTableCache.get(TABLES.CONFIG, EPOCH_CONFIG_KEY) : (stryCov_9fa48("23264"), systemTableCache?.get(TABLES.CONFIG, EPOCH_CONFIG_KEY));
      if (stryMutAct_9fa48("23267") ? false : stryMutAct_9fa48("23266") ? true : stryMutAct_9fa48("23265") ? epochRow : (stryCov_9fa48("23265", "23266", "23267"), !epochRow)) {
        if (stryMutAct_9fa48("23268")) {
          {}
        } else {
          stryCov_9fa48("23268");
          return;
        }
      }
      cdcIntegrationService.handleEpochChangeCDC(stryMutAct_9fa48("23269") ? {} : (stryCov_9fa48("23269"), {
        tableName: TABLES.CONFIG,
        operation: CDC_OPERATION.UPSERT,
        data: stryMutAct_9fa48("23270") ? {} : (stryCov_9fa48("23270"), {
          ...epochRow,
          [COLUMN.CONFIG_KEY]: stryMutAct_9fa48("23273") ? epochRow[COLUMN.CONFIG_KEY] && EPOCH_CONFIG_KEY : stryMutAct_9fa48("23272") ? false : stryMutAct_9fa48("23271") ? true : (stryCov_9fa48("23271", "23272", "23273"), epochRow[COLUMN.CONFIG_KEY] || EPOCH_CONFIG_KEY)
        })
      }));
    }
  }
  ensureBootstrapCdcIntegrationService() {
    if (stryMutAct_9fa48("23274")) {
      {}
    } else {
      stryCov_9fa48("23274");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("23275") ? "" : (stryCov_9fa48("23275"), 'ensureBootstrapCdcIntegrationService'));
      if (stryMutAct_9fa48("23277") ? false : stryMutAct_9fa48("23276") ? true : (stryCov_9fa48("23276", "23277"), override)) {
        if (stryMutAct_9fa48("23278")) {
          {}
        } else {
          stryCov_9fa48("23278");
          return override();
        }
      }
      const d = this.delegates;
      const logger = d.getLogger();
      let cdcIntegrationService = d.getCdcIntegrationService();
      if (stryMutAct_9fa48("23280") ? false : stryMutAct_9fa48("23279") ? true : (stryCov_9fa48("23279", "23280"), cdcIntegrationService)) {
        if (stryMutAct_9fa48("23281")) {
          {}
        } else {
          stryCov_9fa48("23281");
          return cdcIntegrationService;
        }
      }
      cdcIntegrationService = CDCIntegrationSetup.createForBootstrap(stryMutAct_9fa48("23282") ? {} : (stryCov_9fa48("23282"), {
        nodeId: d.getNodeId(),
        messageRouter: d.getMessageRouter()
      }));
      d.setCdcIntegrationService(cdcIntegrationService);
      logger.debug(LOG_CDC_INITIALIZED, stryMutAct_9fa48("23283") ? {} : (stryCov_9fa48("23283"), {
        nodeId: d.getNodeId(),
        owner: CDC_INTEGRATION_OWNER,
        mode: CDC_INTEGRATION_MODE_BOOTSTRAP
      }));
      return cdcIntegrationService;
    }
  }
  ensureLatencyTopologyOwners() {
    if (stryMutAct_9fa48("23284")) {
      {}
    } else {
      stryCov_9fa48("23284");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("23285") ? "" : (stryCov_9fa48("23285"), 'ensureLatencyTopologyOwners'));
      if (stryMutAct_9fa48("23287") ? false : stryMutAct_9fa48("23286") ? true : (stryCov_9fa48("23286", "23287"), override)) {
        if (stryMutAct_9fa48("23288")) {
          {}
        } else {
          stryCov_9fa48("23288");
          return override();
        }
      }
      const d = this.delegates;
      const logger = d.getLogger();
      let latencyTopology = d.getLatencyTopology();
      if (stryMutAct_9fa48("23290") ? false : stryMutAct_9fa48("23289") ? true : (stryCov_9fa48("23289", "23290"), latencyTopology)) {
        if (stryMutAct_9fa48("23291")) {
          {}
        } else {
          stryCov_9fa48("23291");
          return latencyTopology;
        }
      }
      latencyTopology = LatencyTopologySetup.create(stryMutAct_9fa48("23292") ? {} : (stryCov_9fa48("23292"), {
        nodeId: d.getNodeId(),
        systemTableCache: d.getSystemTableCache(),
        cdcIntegrationService: d.getCdcIntegrationService(),
        messageRouter: d.getMessageRouter()
      }));
      latencyTopology.latencyTreeService.start(stryMutAct_9fa48("23293") ? {} : (stryCov_9fa48("23293"), {
        recomputeImmediately: stryMutAct_9fa48("23294") ? false : (stryCov_9fa48("23294"), true)
      }));
      latencyTopology.cdcGroupPropagationService.start();
      d.setLatencyTopology(latencyTopology);
      logger.info(BOOTSTRAP_LOG_MSG.LATENCY_TOPOLOGY_READY, stryMutAct_9fa48("23295") ? {} : (stryCov_9fa48("23295"), {
        nodeId: d.getNodeId(),
        owner: LATENCY_TOPOLOGY_OWNER
      }));
      return latencyTopology;
    }
  }
  startLatencyTopologyLifecycle() {
    if (stryMutAct_9fa48("23296")) {
      {}
    } else {
      stryCov_9fa48("23296");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("23297") ? "" : (stryCov_9fa48("23297"), 'startLatencyTopologyLifecycle'));
      if (stryMutAct_9fa48("23299") ? false : stryMutAct_9fa48("23298") ? true : (stryCov_9fa48("23298", "23299"), override)) {
        if (stryMutAct_9fa48("23300")) {
          {}
        } else {
          stryCov_9fa48("23300");
          return override();
        }
      }
      const d = this.delegates;
      const logger = d.getLogger();
      const topologyOwners = assertCritical(d.getLatencyTopology(), BOOTSTRAP_ERROR.LATENCY_TOPOLOGY_MISSING);
      LatencyTopologySetup.start(topologyOwners);
      logger.info(BOOTSTRAP_LOG_MSG.LATENCY_TOPOLOGY_STARTED, stryMutAct_9fa48("23301") ? {} : (stryCov_9fa48("23301"), {
        nodeId: d.getNodeId(),
        owner: LATENCY_TOPOLOGY_OWNER
      }));
    }
  }
  async propagatePartitionCDCEvent(messageGroupService, cdcEvent) {
    if (stryMutAct_9fa48("23302")) {
      {}
    } else {
      stryCov_9fa48("23302");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("23303") ? "" : (stryCov_9fa48("23303"), 'propagatePartitionCDCEvent'));
      if (stryMutAct_9fa48("23305") ? false : stryMutAct_9fa48("23304") ? true : (stryCov_9fa48("23304", "23305"), override)) {
        if (stryMutAct_9fa48("23306")) {
          {}
        } else {
          stryCov_9fa48("23306");
          return override(messageGroupService, cdcEvent);
        }
      }
      const d = this.delegates;
      const topologyOwners = assertCritical(d.getLatencyTopology(), BOOTSTRAP_ERROR.LATENCY_TOPOLOGY_MISSING);
      return topologyOwners.cdcGroupPropagationService.propagateCDCEvent(stryMutAct_9fa48("23307") ? {} : (stryCov_9fa48("23307"), {
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        data: cdcEvent.data,
        sourceMessageGroupService: messageGroupService
      }));
    }
  }
  createCdcPipelineReadinessGate(systemTableCache) {
    if (stryMutAct_9fa48("23308")) {
      {}
    } else {
      stryCov_9fa48("23308");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("23309") ? "" : (stryCov_9fa48("23309"), 'createCdcPipelineReadinessGate'));
      if (stryMutAct_9fa48("23311") ? false : stryMutAct_9fa48("23310") ? true : (stryCov_9fa48("23310", "23311"), override)) {
        if (stryMutAct_9fa48("23312")) {
          {}
        } else {
          stryCov_9fa48("23312");
          return override(systemTableCache);
        }
      }
      const d = this.delegates;
      return new CDCPipelineReadinessGate(stryMutAct_9fa48("23313") ? {} : (stryCov_9fa48("23313"), {
        systemTableCache,
        cdcPropagatedTables: CDC_PROPAGATED_TABLES,
        now: stryMutAct_9fa48("23314") ? () => undefined : (stryCov_9fa48("23314"), () => Date.now()),
        sleep: stryMutAct_9fa48("23315") ? () => undefined : (stryCov_9fa48("23315"), delayMs => d.sleep(delayMs))
      }));
    }
  }
}
export { SeedRuntimeBridgeOwner };