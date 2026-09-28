import {
  ServiceWasmScaffoldError,
  WASM_PROJECT_ERROR_CODE,
  createWasmServiceProject,
} from './service-wasm-scaffold.js';

const SERVICE_COMMAND_EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});

const SERVICE_COMMAND = Object.freeze({
  BUILD: 'build',
  DEPLOY: 'deploy',
  DEV_INSTALL: 'dev-install',
  GENERATE: 'generate',
  INIT: 'init',
  INSTALL: 'install',
  LIST: 'list',
  REMOVE: 'remove',
  STATUS: 'status',
});

const SERVICE_COMMAND_FLAG = Object.freeze({
  HELP_LONG: '--help',
  HELP_SHORT: '-h',
  OPTION_PREFIX: '-',
});

const SERVICE_COMMAND_ERROR_CODE = Object.freeze({
  UNKNOWN_COMMAND: 'unknown_command',
  UNKNOWN_OPTION: 'unknown_option',
  USAGE: 'usage',
});

const SERVICE_COMMAND_MESSAGE = Object.freeze({
  INIT_DIRECTORY_REQUIRED: 'init requires exactly one directory',
  PIPELINE_DIRECTORY_REQUIRED: 'requires exactly one project directory',
});

const SERVICE_HELP_FLAGS = Object.freeze(new Set([
  SERVICE_COMMAND_FLAG.HELP_LONG,
  SERVICE_COMMAND_FLAG.HELP_SHORT,
]));

const SERVICE_HELP = `Usage:
  lagrange service init <directory>
  lagrange service generate <project-directory>
  lagrange service build <project-directory>
  lagrange service deploy <project-directory> --idempotency-key <key>
  lagrange service install <manifest-file> --idempotency-key <key> [--config <json-file>]
  lagrange service list
  lagrange service status <service-name>
  lagrange service remove <service-name> --idempotency-key <key>

Commands:
  init <directory>                 Create a code-first service project (lagrange.service.js)
  generate <project-directory>     Compile the service into generated deployment records
  build <project-directory>        Build the generated service artifact
  deploy <project-directory>       Deploy the built project through the service lifecycle
  install <manifest-file>          Install a prebuilt artifact from a manifest
  list                             List installed service catalog rows
  status <service-name>            Show one service catalog row
  remove <service-name>            Record idempotent service removal intent
`;

const SERVICE_PIPELINE_OWNER_EXPORT = 'runServicePipelineCommand';
const SERVICE_LIFECYCLE_OWNER_EXPORT = 'runServiceLifecycleCommand';

const SERVICE_LIFECYCLE_COMMANDS = Object.freeze(new Set([
  SERVICE_COMMAND.DEV_INSTALL,
  SERVICE_COMMAND.INSTALL,
  SERVICE_COMMAND.LIST,
  SERVICE_COMMAND.REMOVE,
  SERVICE_COMMAND.STATUS,
]));
const SERVICE_PIPELINE_COMMANDS = Object.freeze(new Set([
  SERVICE_COMMAND.BUILD,
  SERVICE_COMMAND.DEPLOY,
  SERVICE_COMMAND.GENERATE,
]));
const loadServiceLifecycleCommand = () =>
  import('./service-lifecycle-command.js');
const loadServicePipelineCommand = () =>
  import('./service-pipeline-router.js');

function printHelp() {
  process.stdout.write(SERVICE_HELP);
}

function usageError(code, message) {
  process.stderr.write(`lagrange service error [${code}]: ${message}\n`);
  process.stderr.write(SERVICE_HELP);
  return SERVICE_COMMAND_EXIT_CODE.USAGE;
}

function initializationError(error) {
  const isInvalidName =
    error instanceof ServiceWasmScaffoldError &&
      error.code === WASM_PROJECT_ERROR_CODE.INVALID_NAME;
  const code = error instanceof ServiceWasmScaffoldError ?
    error.code : WASM_PROJECT_ERROR_CODE.WRITE_FAILED;
  process.stderr.write(`lagrange service init failed [${code}]: ${error.message}\n`);
  return isInvalidName ?
    SERVICE_COMMAND_EXIT_CODE.USAGE : SERVICE_COMMAND_EXIT_CODE.FAILURE;
}

function runInitCommand(args) {
  if (args.length !== 1) {
    return usageError(
      SERVICE_COMMAND_ERROR_CODE.USAGE,
      SERVICE_COMMAND_MESSAGE.INIT_DIRECTORY_REQUIRED,
    );
  }
  const targetArgument = args[0];
  if (targetArgument.startsWith(SERVICE_COMMAND_FLAG.OPTION_PREFIX)) {
    return usageError(
      SERVICE_COMMAND_ERROR_CODE.UNKNOWN_OPTION,
      `unknown option: ${targetArgument}`,
    );
  }
  try {
    const result = createWasmServiceProject(targetArgument);
    process.stdout.write(
      `Created service project at ${result.targetDirectory}\n`);
    return SERVICE_COMMAND_EXIT_CODE.SUCCESS;
  } catch (error) {
    return initializationError(error);
  }
}

// The pipeline and lifecycle owners load behind a dynamic import (the
// local-only import boundary the CLI tests pin); both share one dispatch
// shape — resolve the runner export, forward the args, and map any
// rejection to a generic failure line.
function dispatchToOwner(load, runnerExport, args) {
  return load()
    .then((module) => module[runnerExport](args))
    .catch((error) => {
      process.stderr.write(`lagrange service failed: ${error.message}\n`);
      return SERVICE_COMMAND_EXIT_CODE.FAILURE;
    });
}

function isHelpRequestFor(command, args) {
  return args.length === 2 && SERVICE_HELP_FLAGS.has(args[1]) &&
    (command === SERVICE_COMMAND.INIT ||
      SERVICE_LIFECYCLE_COMMANDS.has(command) ||
      SERVICE_PIPELINE_COMMANDS.has(command));
}

function runServiceCommand(args) {
  if (args.length === 0 ||
      (args.length === 1 && SERVICE_HELP_FLAGS.has(args[0]))) {
    printHelp();
    return SERVICE_COMMAND_EXIT_CODE.SUCCESS;
  }
  if (args[0].startsWith(SERVICE_COMMAND_FLAG.OPTION_PREFIX)) {
    return usageError(
      SERVICE_COMMAND_ERROR_CODE.UNKNOWN_OPTION,
      `unknown option: ${args[0]}`,
    );
  }
  if (isHelpRequestFor(args[0], args)) {
    printHelp();
    return SERVICE_COMMAND_EXIT_CODE.SUCCESS;
  }
  if (args[0] === SERVICE_COMMAND.INIT) {
    return runInitCommand(args.slice(1));
  }
  if (SERVICE_PIPELINE_COMMANDS.has(args[0])) {
    return dispatchToOwner(
      loadServicePipelineCommand, SERVICE_PIPELINE_OWNER_EXPORT, args);
  }
  if (!SERVICE_LIFECYCLE_COMMANDS.has(args[0])) {
    return usageError(
      SERVICE_COMMAND_ERROR_CODE.UNKNOWN_COMMAND,
      `unknown command: ${args[0]}`,
    );
  }
  return dispatchToOwner(
    loadServiceLifecycleCommand, SERVICE_LIFECYCLE_OWNER_EXPORT, args);
}

export {runServiceCommand};
