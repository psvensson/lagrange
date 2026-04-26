import {assertCritical} from '../../utils/assert.js';
import {CDCIntegrationSetup} from '../shared/cdc-integration-setup.js';
import {LatencyTopologySetup} from '../shared/latency-topology-setup.js';
import {
  CDCPipelineReadinessGate,
} from '../../cdc/cdc-pipeline-readiness-gate.js';
import {
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
} from '../bootstrap-constants.js';
import {EPOCH_CONFIG_KEY} from '../../cdc/cdc-integration-service.js';
import {
  COLUMN,
  CDC_OPERATION,
  TABLES,
} from '../../constants/index.js';
import {
  CDC_PROPAGATED_TABLES,
} from '../../cache/cache-constants.js';

const LOG_CDC_INITIALIZED = 'CDC integration initialized by owner';
const CDC_INTEGRATION_OWNER = 'CDCIntegrationSetup';
const CDC_INTEGRATION_MODE_BOOTSTRAP = 'bootstrap';
const LATENCY_TOPOLOGY_OWNER = 'LatencyTopologySetup';

class SeedRuntimeBridgeOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.compatibilityPhase = options.compatibilityPhase || null;
  }

  getCompatibilityOverride(methodName) {
    if (!this.compatibilityPhase ||
        !Object.prototype.hasOwnProperty.call(this.compatibilityPhase, methodName)) {
      return null;
    }

    const override = this.compatibilityPhase[methodName];
    return typeof override === 'function' ?
      override.bind(this.compatibilityPhase) :
      null;
  }

  applyCurrentEpochFromCache() {
    const override = this.getCompatibilityOverride('applyCurrentEpochFromCache');
    if (override) {
      return override();
    }

    const d = this.delegates;
    const cdcIntegrationService = d.getCdcIntegrationService();
    const epochManager = d.getEpochManager();
    if (!cdcIntegrationService || !epochManager) {
      return;
    }

    const systemTableCache = d.getSystemTableCache();
    const epochRow = systemTableCache?.get(TABLES.CONFIG, EPOCH_CONFIG_KEY);
    if (!epochRow) {
      return;
    }

    cdcIntegrationService.handleEpochChangeCDC({
      tableName: TABLES.CONFIG,
      operation: CDC_OPERATION.UPSERT,
      data: {
        ...epochRow,
        [COLUMN.CONFIG_KEY]:
          epochRow[COLUMN.CONFIG_KEY] || EPOCH_CONFIG_KEY,
      },
    });
  }

  ensureBootstrapCdcIntegrationService() {
    const override = this.getCompatibilityOverride(
      'ensureBootstrapCdcIntegrationService',
    );
    if (override) {
      return override();
    }

    const d = this.delegates;
    const logger = d.getLogger();
    let cdcIntegrationService = d.getCdcIntegrationService();
    if (cdcIntegrationService) {
      return cdcIntegrationService;
    }

    cdcIntegrationService = CDCIntegrationSetup.createForBootstrap({
      nodeId: d.getNodeId(),
      messageRouter: d.getMessageRouter(),
    });
    d.setCdcIntegrationService(cdcIntegrationService);

    logger.debug(LOG_CDC_INITIALIZED, {
      nodeId: d.getNodeId(),
      owner: CDC_INTEGRATION_OWNER,
      mode: CDC_INTEGRATION_MODE_BOOTSTRAP,
    });

    return cdcIntegrationService;
  }

  ensureLatencyTopologyOwners() {
    const override = this.getCompatibilityOverride('ensureLatencyTopologyOwners');
    if (override) {
      return override();
    }

    const d = this.delegates;
    const logger = d.getLogger();

    let latencyTopology = d.getLatencyTopology();
    if (latencyTopology) {
      return latencyTopology;
    }

    latencyTopology = LatencyTopologySetup.create({
      nodeId: d.getNodeId(),
      systemTableCache: d.getSystemTableCache(),
      cdcIntegrationService: d.getCdcIntegrationService(),
      messageRouter: d.getMessageRouter(),
    });
    latencyTopology.latencyTreeService.start({
      recomputeImmediately: true,
    });
    latencyTopology.cdcGroupPropagationService.start();
    d.setLatencyTopology(latencyTopology);

    logger.info(BOOTSTRAP_LOG_MSG.LATENCY_TOPOLOGY_READY, {
      nodeId: d.getNodeId(),
      owner: LATENCY_TOPOLOGY_OWNER,
    });
    return latencyTopology;
  }

  startLatencyTopologyLifecycle() {
    const override = this.getCompatibilityOverride('startLatencyTopologyLifecycle');
    if (override) {
      return override();
    }

    const d = this.delegates;
    const logger = d.getLogger();
    const topologyOwners = assertCritical(
      d.getLatencyTopology(),
      BOOTSTRAP_ERROR.LATENCY_TOPOLOGY_MISSING,
    );
    LatencyTopologySetup.start(topologyOwners);
    logger.info(BOOTSTRAP_LOG_MSG.LATENCY_TOPOLOGY_STARTED, {
      nodeId: d.getNodeId(),
      owner: LATENCY_TOPOLOGY_OWNER,
    });
  }

  async propagatePartitionCDCEvent(messageGroupService, cdcEvent) {
    const override = this.getCompatibilityOverride('propagatePartitionCDCEvent');
    if (override) {
      return override(messageGroupService, cdcEvent);
    }

    const d = this.delegates;
    const topologyOwners = assertCritical(
      d.getLatencyTopology(),
      BOOTSTRAP_ERROR.LATENCY_TOPOLOGY_MISSING,
    );
    return topologyOwners.cdcGroupPropagationService.propagateCDCEvent({
      tableName: cdcEvent.tableName,
      operation: cdcEvent.operation,
      data: cdcEvent.data,
      sourceMessageGroupService: messageGroupService,
    });
  }

  createCdcPipelineReadinessGate(systemTableCache) {
    const override = this.getCompatibilityOverride('createCdcPipelineReadinessGate');
    if (override) {
      return override(systemTableCache);
    }

    const d = this.delegates;
    return new CDCPipelineReadinessGate({
      systemTableCache,
      cdcPropagatedTables: CDC_PROPAGATED_TABLES,
      now: () => Date.now(),
      sleep: (delayMs) => d.sleep(delayMs),
    });
  }
}

export {SeedRuntimeBridgeOwner};
