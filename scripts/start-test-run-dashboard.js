#!/usr/bin/env node
/**
 * Standalone dashboard launcher for distributed test runs.
 *
 * Usage:
 *   node scripts/start-test-run-dashboard.js
 *   node scripts/start-test-run-dashboard.js --port 8181
 *   node scripts/start-test-run-dashboard.js --host 127.0.0.1 --workspace /path/to/repo
 */

import {resolve} from 'node:path';
import {ConfigurationManager} from '../src/config/configuration-manager.js';
import {LoggingService} from '../src/logging/logging-service.js';
import {
  createStandaloneTestRunServer,
} from '../src/admin/standalone-test-run-server.js';
import {ADMIN_STANDALONE_DEFAULT} from '../src/admin/admin-constants.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_2BCWL = 'Standalone test dashboard started\n';

const ARG = Object.freeze({
  HOST: '--host',
  PORT: '--port',
  WORKSPACE: '--workspace',
  HELP_LONG: '--help',
  HELP_SHORT: '-h',
});

const SIGNAL = Object.freeze({
  SIGINT: 'SIGINT',
  SIGTERM: 'SIGTERM',
});

const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
});

const USAGE_LINES = Object.freeze([
  'Standalone Test Dashboard',
  '',
  'Usage:',
  '  node scripts/start-test-run-dashboard.js [options]',
  '',
  'Options:',
  `  ${ARG.HOST} <host>         Host to bind (default: ${ADMIN_STANDALONE_DEFAULT.HOST})`,
  `  ${ARG.PORT} <port>         Port to bind (default: ${ADMIN_STANDALONE_DEFAULT.PORT})`,
  `  ${ARG.WORKSPACE} <path>    Workspace root to operate on (default: cwd)`,
  `  ${ARG.HELP_LONG}, ${ARG.HELP_SHORT}         Show this help`,
]);

/**
 * Parse CLI arguments.
 * @param {Array<string>} argv
 * @return {{host: string, port: string|undefined, workspaceRoot: string|undefined, help: boolean}}
 */
function parseArgs(argv) {
  const parsed = {
    host: ADMIN_STANDALONE_DEFAULT.HOST,
    port: undefined,
    workspaceRoot: undefined,
    help: false,
  };

  for (let index = LOCAL_NUM_ZERO; index < argv.length; index++) {
    const token = argv[index];
    if (token === ARG.HELP_LONG || token === ARG.HELP_SHORT) {
      parsed.help = true;
      continue;
    }
    if (token === ARG.HOST && index + LOCAL_NUM_ONE < argv.length) {
      parsed.host = argv[index + LOCAL_NUM_ONE];
      index++;
      continue;
    }
    if (token === ARG.PORT && index + LOCAL_NUM_ONE < argv.length) {
      parsed.port = argv[index + LOCAL_NUM_ONE];
      index++;
      continue;
    }
    if (token === ARG.WORKSPACE && index + LOCAL_NUM_ONE < argv.length) {
      parsed.workspaceRoot = argv[index + LOCAL_NUM_ONE];
      index++;
      continue;
    }
  }

  return parsed;
}

/**
 * Ensure shared singletons are initialized for logger behavior consistency.
 */
function initializeCoreServices() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize();
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE_LINES.join(LOCAL_STR_NEWLINE)}\n`);
    process.exit(EXIT_CODE.SUCCESS);
    return;
  }

  initializeCoreServices();

  const server = createStandaloneTestRunServer({
    host: args.host,
    port: args.port,
    workspaceRoot: resolve(args.workspaceRoot || process.cwd()),
  });
  const info = await server.start();

  process.stdout.write(LOCAL_STR_2BCWL);
  process.stdout.write(`  URL: ${info.url}\n`);
  process.stdout.write(`  Dashboard: ${info.dashboardUrl}\n`);
  process.stdout.write(`  Workspace: ${info.workspaceRoot}\n`);

  let shuttingDown = false;
  const handleSignal = async (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.stdout.write(`Received ${signal}, shutting down...\n`);
    try {
      await server.stop();
      process.exit(EXIT_CODE.SUCCESS);
    } catch (error) {
      process.stderr.write(`Failed shutdown: ${error.message}\n`);
      process.exit(EXIT_CODE.FAILURE);
    }
  };

  process.on(SIGNAL.SIGINT, () => {
    void handleSignal(SIGNAL.SIGINT);
  });
  process.on(SIGNAL.SIGTERM, () => {
    void handleSignal(SIGNAL.SIGTERM);
  });
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error.message}\n`);
  process.exit(EXIT_CODE.FAILURE);
});
