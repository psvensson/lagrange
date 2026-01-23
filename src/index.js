/**
 * Distributed Database System - Main Entry Point
 */

import {ConfigurationManager} from './config/configuration-manager.js';
import {LoggingService} from './logging/logging-service.js';
import {HLCClockService} from './hlc/hlc-clock-service.js';
import {DataDirectoryManager} from './storage/data-directory-manager.js';
import {BootstrapService} from './bootstrap/bootstrap-service.js';
import {BootstrapAPI} from './bootstrap/bootstrap-api.js';
import {AdminWebSocketAPI} from './admin/admin-websocket-api.js';
import {NodeJoiningService} from './bootstrap/node-joining-service.js';

// Re-export modules for external use
export * from './query/index.js';
export * from './partition/index.js';
export * from './config/configuration-manager.js';
export * from './logging/logging-service.js';
export * from './hlc/index.js';
export * from './cache/index.js';
export * from './address/index.js';
export * from './bootstrap/index.js';
export * from './cdc/index.js';
export * from './message-group/index.js';
export * from './node/index.js';
export * from './rebalancer/index.js';
export * from './threading/index.js';
export * from './transport/index.js';
export * from './storage/index.js';

/**
 * System version.
 */
export const VERSION = '1.0.0';

/**
 * Check for version flag.
 * @return {boolean} True if version was printed
 */
function checkVersionFlag() {
  const args = process.argv.slice(2);
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`distributed-database-system v${VERSION}`);
    return true;
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Distributed Database System v${VERSION}`);
    console.log('');
    console.log('Usage: distributed-db [options]');
    console.log('');
    console.log('Options:');
    console.log('  --version, -v    Show version number');
    console.log('  --help, -h       Show this help message');
    console.log('  --seed <url>     Seed node URL to join existing cluster');
    console.log('  --config <path>  Path to configuration file');
    console.log('  --data-dir <path>  Base directory for partition storage');
    console.log('  --dry-run        Validate configuration without starting');
    return true;
  }
  return false;
}

/**
 * Parse command-line arguments.
 * @return {Object} Parsed arguments
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-dir' && i + 1 < args.length) {
      result.dataDir = args[i + 1];
      i++;
    } else if (args[i] === '--seed' && i + 1 < args.length) {
      result.seedNodeAddress = args[i + 1];
      i++;
    } else if (args[i] === '--config' && i + 1 < args.length) {
      result.configPath = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    }
  }

  return result;
}

/**
 * Main application entry point.
 */
async function main() {
  // Handle version/help flags early
  if (checkVersionFlag()) {
    process.exit(0);
  }

  // Parse command-line arguments
  const cliArgs = parseCommandLineArgs();

  // Build configuration overrides
  // CLI args take precedence over environment variables
  const overrides = {};
  if (cliArgs.dataDir) {
    overrides.storage = {dataDir: cliArgs.dataDir};
  }

  // Initialize configuration
  const config = ConfigurationManager.getInstance();
  config.initialize(overrides);

  // Initialize logging
  const loggingService = LoggingService.getInstance();
  loggingService.initialize({
    nodeId: config.get('node.id'),
    level: config.get('logging.level'),
    prettyPrint: config.get('logging.prettyPrint'),
  });

  // Create subsystem-specific loggers
  const mainLogger = loggingService.forSubsystem('main');
  const configLogger = loggingService.forSubsystem('config');

  configLogger.debug('Configuration loaded', {
    categories: config.getCategories(),
  });

  // Initialize data directory manager
  const dataDirectoryManager = DataDirectoryManager.getInstance();
  dataDirectoryManager.initialize();

  // Initialize HLC clock (it will create its own subsystem logger)
  const hlcClock = new HLCClockService(config.get('node.id'), {
    maxDrift: config.get('hlc.maxDriftMs'),
    maxLogicalCounter: config.get('hlc.maxLogicalCounter'),
  });

  mainLogger.info('Distributed Database System starting', {
    nodeId: config.get('node.id'),
    version: VERSION,
    dataDir: dataDirectoryManager.getDataDir(),
    hlcTimestamp: hlcClock.now().toString(),
  });

  // Check if we're joining an existing cluster or starting as seed node
  const seedNodeAddress = cliArgs.seedNodeAddress ||
    process.env.SEED_NODE_ADDRESS;

  if (seedNodeAddress) {
    // Join existing cluster
    mainLogger.info('Joining existing cluster', {
      seedNodeAddress,
    });

    // Ensure seed node address has protocol
    const seedUrl = seedNodeAddress.startsWith('http') ?
      seedNodeAddress :
      `http://${seedNodeAddress}`;

    // Determine WebSocket port for this joining node
    const restApiPort = config.get('node.restApiPort') || 8080;
    const wsPort = config.get('node.wsPort') || (restApiPort + 1000);

    const nodeJoiningService = new NodeJoiningService({
      nodeId: config.get('node.id'),
      nodeAddress: config.get('node.address') ||
        `localhost:${config.get('node.restApiPort')}`,
      seedNodeAddress: seedUrl,
      wsPort: wsPort,
    });

    const joinResult = await nodeJoiningService.join();

    if (!joinResult.success) {
      mainLogger.error('Failed to join cluster', {
        error: joinResult.error,
        phase: joinResult.phase,
      });
      process.exit(1);
    }

    mainLogger.info('Successfully joined cluster', {
      messageGroupCount: joinResult.messageGroupServices.size,
      duration: joinResult.duration,
    });

    // Get system table cache from first message group service
    let systemTableCache = null;
    for (const mgService of joinResult.messageGroupServices.values()) {
      if (mgService.getReadOnlyCache) {
        systemTableCache = mgService.getReadOnlyCache();
      } else if (mgService.systemTableCache) {
        systemTableCache = mgService.systemTableCache;
      }
      break;
    }

    // Create SQL query engine with partition registry (if available)
    let sqlQueryEngine = null;
    if (joinResult.partitionServices && joinResult.partitionServices.size > 0) {
      // Build partition registry keyed by partitionId (not replicaId)
      const partitionRegistry = new Map();
      for (const [_replicaId, partition] of joinResult.partitionServices) {
        const partitionId = partition.partitionId;
        if (!partitionRegistry.has(partitionId) || partition.isLeader) {
          partitionRegistry.set(partitionId, partition);
        }
      }

      const {SQLQueryEngine} = await import('./query/sql-query-engine.js');
      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        partitionRegistry,
        nodeId: config.get('node.id'),
      });
    }

    // Start Admin WebSocket API for this node
    const adminAPI = new AdminWebSocketAPI({
      nodeId: config.get('node.id'),
      systemTableCache,
      sqlQueryEngine,
    });

    const adminPort = config.get('admin.websocketPort') || 8081;
    await adminAPI.initialize(adminPort);

    mainLogger.info('Node fully operational', {
      nodeId: config.get('node.id'),
      adminWebSocketPort: adminPort,
      dataDir: dataDirectoryManager.getDataDir(),
    });

    // Keep the process running
    process.on('SIGINT', async () => {
      mainLogger.info('Shutting down...');
      await nodeJoiningService.cleanup();
      await adminAPI.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      mainLogger.info('Shutting down...');
      await nodeJoiningService.cleanup();
      await adminAPI.shutdown();
      process.exit(0);
    });
  } else {
    // Start as seed node - bootstrap the system
    mainLogger.info('Starting as seed node');

    // Determine WebSocket port for cross-node communication
    // Use REST API port + 1000 as default (e.g., 8080 -> 9080)
    const restApiPort = config.get('node.restApiPort') || 8080;
    const wsPort = config.get('node.wsPort') || (restApiPort + 1000);

    const bootstrapService = new BootstrapService({
      nodeId: config.get('node.id'),
      nodeAddress: config.get('node.address') || `localhost:${restApiPort}`,
      dataDirectoryManager,
      wsPort: wsPort,
    });

    const bootstrapResult = await bootstrapService.bootstrap();

    if (!bootstrapResult.success) {
      mainLogger.error('Bootstrap failed', {
        error: bootstrapResult.error,
      });
      process.exit(1);
    }

    mainLogger.info('Bootstrap completed', {
      servicesCreated: bootstrapResult.servicesCreated,
      partitionsCreated: bootstrapResult.partitionsCreated,
      messageGroupsCreated: bootstrapResult.messageGroupsCreated,
    });

    // Start Bootstrap API for node discovery
    const bootstrapAPI = new BootstrapAPI({
      seedNodeId: config.get('node.id'),
      seedNodeAddress: config.get('node.address'),
      wsPort: wsPort,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      replicaLifecycleManager: bootstrapResult.replicaLifecycleManager,
    });

    await bootstrapAPI.initialize();

    // Start WebSocket server for cross-node communication
    // This allows joining nodes to connect and receive lifecycle messages
    try {
      await bootstrapService.startWebSocketServer();
      mainLogger.info('WebSocket server started for cross-node communication');
    } catch (wsError) {
      mainLogger.warn('Failed to start WebSocket server', {
        error: wsError.message,
      });
    }

    // Get system table cache from first message group service
    let systemTableCache = null;
    for (const mgService of bootstrapResult.messageGroupServices.values()) {
      systemTableCache = mgService.getReadOnlyCache();
      break;
    }

    // Build partition registry keyed by partitionId (not replicaId)
    // The query executor expects partitionId -> partition service mapping
    const partitionRegistry = new Map();
    for (const [_replicaId, partition] of bootstrapResult.partitionServices) {
      const partitionId = partition.partitionId;
      // Only add if not already present, or if this one is the leader
      if (!partitionRegistry.has(partitionId) || partition.isLeader) {
        partitionRegistry.set(partitionId, partition);
      }
    }

    // Create SQL query engine with partition registry
    const {SQLQueryEngine} = await import('./query/sql-query-engine.js');
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      partitionRegistry,
      nodeId: config.get('node.id'),
    });

    // Start Admin WebSocket API
    const adminAPI = new AdminWebSocketAPI({
      nodeId: config.get('node.id'),
      systemTableCache,
      sqlQueryEngine,
    });

    const adminPort = config.get('admin.websocketPort') || 8081;
    await adminAPI.initialize(adminPort);

    mainLogger.info('Node fully operational', {
      nodeId: config.get('node.id'),
      restApiPort: config.get('node.restApiPort'),
      adminWebSocketPort: adminPort,
      dataDir: dataDirectoryManager.getDataDir(),
    });

    // Keep the process running
    process.on('SIGINT', async () => {
      mainLogger.info('Shutting down...');
      await bootstrapService.shutdown();
      await bootstrapAPI.shutdown();
      await adminAPI.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      mainLogger.info('Shutting down...');
      await bootstrapService.shutdown();
      await bootstrapAPI.shutdown();
      await adminAPI.shutdown();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
