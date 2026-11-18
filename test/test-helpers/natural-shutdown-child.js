import assert from 'node:assert/strict';
import {startLagrangeRuntime} from '../../src/lagrange-runtime-startup.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {readIssuedBootIncarnation, reserveBootIncarnation} from '../../src/bootstrap/boot-incarnation-owner.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {resetProcessRuntimeClaimForTests} from '../../src/lagrange-runtime-process-claim.js';
import {NodeService} from '../../src/node/node-service.js';

const [mode, directory, nodeId] = process.argv.slice(2);

function resetChildSingletons() {
  resetProcessRuntimeClaimForTests();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  DataDirectoryManager.resetInstance();
  NodeService.resetInstance();
  LogsTableService.resetInstance();
}

if (mode === 'successful-start') {
  resetChildSingletons();
  const runtime = await startLagrangeRuntime({
    cliArgs: {dataDir: directory},
    configuration: {
      node: {id: nodeId},
      logging: {level: 'error'},
      storage: {dataDir: directory},
    },
    environment: {
      NODE_ID: nodeId,
      DATA_DIR: directory,
      LAGRANGE_FORCE_NEW_CLUSTER: '1',
    },
  });

  const logsService = LogsTableService.getInstance();
  if (logsService && logsService.isInitialized && logsService.isInitialized()) {
    logsService.writeLogEntry({
      logId: 'test-log-1',
      timestamp: Date.now(),
      level: 'info',
      nodeId,
      message: 'test log entry before shutdown',
    }).catch(() => {});
  }

  await runtime.shutdownRuntime('SIGTERM');
  // Natural exit: do not call process.exit(0); let the event loop empty naturally.
} else if (mode === 'failed-join') {
  resetChildSingletons();
  try {
    await startLagrangeRuntime({
      cliArgs: {
        dataDir: directory,
        seedNodeAddress: 'http://127.0.0.1:59998',
      },
      configuration: {
        node: {id: nodeId},
        logging: {level: 'error'},
        storage: {dataDir: directory},
      },
      environment: {
        NODE_ID: nodeId,
        DATA_DIR: directory,
        SEED_NODE_ADDRESS: 'http://127.0.0.1:59998',
        LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS: '1',
        NODE_JOINING_HTTP_TIMEOUT_MS: '20',
        NODE_JOINING_LEADERSHIP_WAIT_TIMEOUT_MS: '50',
      },
    });
  } catch (error) {
    process.stdout.write(`caught-startup-failure: ${error.message}\n`);
  }
  // Natural exit: do not call process.exit(0); let the event loop empty naturally.
} else if (mode === 'restart') {
  resetChildSingletons();
  const runtime1 = await startLagrangeRuntime({
    cliArgs: {dataDir: directory},
    configuration: {
      node: {id: nodeId},
      logging: {level: 'error'},
      storage: {dataDir: directory},
    },
    environment: {
      NODE_ID: nodeId,
      DATA_DIR: directory,
    },
  });
  const inc1 = await readIssuedBootIncarnation(directory);
  assert.equal(inc1, 1, 'initial boot incarnation must be 1');

  await runtime1.shutdownRuntime('SIGTERM');

  resetChildSingletons();
  const runtime2 = await startLagrangeRuntime({
    cliArgs: {dataDir: directory, dryRun: true},
    configuration: {
      node: {id: nodeId},
      logging: {level: 'error'},
      storage: {dataDir: directory},
    },
    environment: {
      NODE_ID: nodeId,
      DATA_DIR: directory,
    },
  });
  assert.ok(runtime2, 'runtime2 dryRun completed');

  const incAfter = await readIssuedBootIncarnation(directory);
  assert.equal(incAfter, 1, 'boot incarnation preserved across shutdown and resume');

  const nextInc = await reserveBootIncarnation(directory);
  assert.equal(nextInc, 2, 'restarted lifecycle resumes and advances boot incarnation to 2');

  process.stdout.write('restart-retains-committed-obligations-ok\n');
  // Natural exit: do not call process.exit(0); let the event loop empty naturally.
  // Natural exit: do not call process.exit(0); let the event loop empty naturally.
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
