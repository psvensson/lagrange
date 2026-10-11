import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';

const LOCAL_STR_FUNCTION = 'function';

const {
  MigrationCoordinator,
  MigrationPipeline,
  QUERY_LOG_MSG,
} = SQL_QUERY_ENGINE_SHARED;

function resumeDurableProvisioningWork(engine) {
  void engine.tableCreationService.resumeDurableProvisioningJobs?.()
    .catch((error) => engine.logger.warn(
      QUERY_LOG_MSG.SCHEMA_PROVISIONING_RECOVERY_DEFERRED,
      {error: error.message},
    ));
}

function setSqlQueryEngineSystemCache(engine, cache) {
  engine.systemCache = cache;
  engine.partitionResolver.setSystemCache(cache);
  engine.tableCreationService.setSystemCache(cache);
  engine.queryExecutor.setSystemCache(cache);
  if (engine.migrationCoordinator) {
    engine.migrationCoordinator.systemTableCache = cache;
  } else if (cache && engine.migrationAutoWireEnabled) {
    engine.migrationCoordinator = new MigrationCoordinator({
      sqlCore: engine,
      systemTableCache: cache,
      transactionCoordinator: engine.transactionCoordinator,
      logger: engine.logger,
      now: engine.nowFn,
    });
    if (!engine.migrationPipeline) {
      engine.migrationPipeline = new MigrationPipeline({
        migrationCoordinator: engine.migrationCoordinator,
        logger: engine.logger,
      });
    }
  }
  if (engine.distributedTransactionRecoveryActivated) {
    void engine.activateDistributedTransactionRecovery({
      resetRecoveryState: true,
    });
  }
}

function activateSqlQueryEngineTransactionRecovery(engine, options = {}) {
  engine.distributedTransactionRecoveryActivated = true;
  if (options.resetRecoveryState !== false) {
    engine.transactionStateRecovered = false;
  }
  engine.recoverDistributedTransactionStateFromCache();
  const replayPromise = engine.resumeRecoveredDistributedTransactions();
  resumeDurableProvisioningWork(engine);
  if (typeof engine.transactionCoordinator.startRecoverySweep ===
      LOCAL_STR_FUNCTION) {
    engine.transactionCoordinator.startRecoverySweep();
  }
  return replayPromise;
}

function setSqlQueryEngineMigrationPipeline(engine, pipeline) {
  engine.migrationPipeline = pipeline || null;
}

function setSqlQueryEngineMigrationCoordinator(engine, coordinator) {
  engine.migrationCoordinator = coordinator || null;
  if (!engine.migrationPipeline && engine.migrationAutoWireEnabled &&
      engine.migrationCoordinator) {
    engine.migrationPipeline = new MigrationPipeline({
      migrationCoordinator: engine.migrationCoordinator,
      logger: engine.logger,
    });
  }
}

function callLifecycleMethod(target, method) {
  if (target && typeof target[method] === LOCAL_STR_FUNCTION) {
    return target[method]();
  }
  return undefined;
}

async function shutdownSqlQueryEngineLifecycle(engine) {
  callLifecycleMethod(engine.queryExecutor, 'markShuttingDown');
  callLifecycleMethod(engine.servicePartitionAccessPublisher, 'stop');
  callLifecycleMethod(engine.transactionCoordinator, 'stopRecoverySweep');
  callLifecycleMethod(
    engine.transactionCoordinator,
    'retireUncertainCreationsForProcessShutdown',
  );
  await callLifecycleMethod(engine.tableCreationService, 'shutdown');
  callLifecycleMethod(engine.runtimeReplicaStateProjectionOwner, 'shutdown');
}

export {
  activateSqlQueryEngineTransactionRecovery,
  setSqlQueryEngineMigrationCoordinator,
  setSqlQueryEngineMigrationPipeline,
  setSqlQueryEngineSystemCache,
  shutdownSqlQueryEngineLifecycle,
};
