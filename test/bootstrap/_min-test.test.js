import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {EventEmitter} from 'events';

test('constructor works', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({node: {id: 'x'}, logging: {level: 'error'}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'error'});
  NodeService.resetInstance();

  const svc = new NodeJoiningService({
    nodeId: 'x',
    nodeAddress: 'ws://127.0.0.1:19092',
    seedNodeAddress: 'http://127.0.0.1:18081',
    config: {cdcPipelineReadinessTimeoutMs: 50},
  });
  const stub = new EventEmitter();
  stub.sqlQueryEngine = {
    setSystemCache: () => {},
    setMessageRouter: () => {},
  };
  svc.cdcIntegrationService = stub;
  svc.messageRouter = {deliver: async () => ({})};
  svc.systemCacheHydrated = true;
  svc.hydrateSystemCacheFromBootstrap = async () => {};
  svc.waitForSystemServiceLeaders = async () => {};
  svc.registerNodeInCluster = async () => {};
  svc.registerCreateSelfHostedMetadata = async () => {};
  svc.subscribeToCDCEvents = async () => {};
  svc.triggerJoinReconciler = async () => {};
  svc.stopJoiningLifecycleOwners = () => {};
  svc.ensureLatencyTopologyOwners = () => {};
  svc.partitionServices = new Map();
  svc.messageGroupServices = new Map();
  try {
    await svc.phaseQuerySystemState();
    t.fail('should throw');
  } catch (err) {
    t.ok(err.unmetConditions, 'has unmetConditions');
  }
});
