import {
  SERVICE_PROJECT_SCAFFOLD_ERROR_CODE,
  ServiceProjectScaffoldError,
  createServiceProject,
} from './service-project-scaffold.js';
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
  OCI: '--oci',
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
  lagrange service init <directory> [--oci]
  lagrange service generate <project-directory>
  lagrange service build <project-directory>
  lagrange service deploy <project-directory> --layout <oci-layout-path> --idempotency-key <key>
  lagrange service install <manifest-file> --idempotency-key <key> [--config <json-file>]
  lagrange service list
  lagrange service status <service-name>
  lagrange service remove <service-name> --idempotency-key <key>

Commands:
  init <directory>                 Create a code-first WASM service project (lagrange.service.js);
                                   pass --oci for the legacy OCI-container Node scaffold
  generate <project-directory>     Compile lagrange.service.js into the generated entry and .lagrange deployment records
  build <project-directory>        Componentize the generated entry into .lagrange/component.wasm and its OCI layout
  deploy <project-directory>       Replay the generated records over the service-lifecycle SQL grammar
  install <manifest-file>          Submit a pinned remote OCI service manifest
  list                             List installed service catalog rows
  status <service-name>            Show one service catalog row
  remove <service-name>            Record idempotent service removal intent

Low-level compatibility:
  dev-install <project-directory>  Build local OCI layout and submit its pinned manifest
                                   (low-level; prefer init + generate + build + deploy)
`;

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
    error instanceof ServiceProjectScaffoldError &&
      error.code === SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.INVALID_NAME ||
    error instanceof ServiceWasmScaffoldError &&
      error.code === WASM_PROJECT_ERROR_CODE.INVALID_NAME;
  const code = error instanceof ServiceProjectScaffoldError ||
    error instanceof ServiceWasmScaffoldError ?
    error.code : SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.WRITE_FAILED;
  process.stderr.write(`lagrange service init failed [${code}]: ${error.message}\n`);
  return isInvalidName ?
    SERVICE_COMMAND_EXIT_CODE.USAGE : SERVICE_COMMAND_EXIT_CODE.FAILURE;
}

function runInitCommand(args) {
  if (args.length < 1 || args.length > 2) {
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
  const flags = args.slice(1);
  for (const flag of flags) {
    if (flag !== SERVICE_COMMAND_FLAG.OCI) {
      return usageError(
        SERVICE_COMMAND_ERROR_CODE.UNKNOWN_OPTION,
        `unknown option: ${flag}`,
      );
    }
  }
  const oci = flags.includes(SERVICE_COMMAND_FLAG.OCI);
  try {
    const result = oci ?
      createServiceProject(targetArgument) :
      createWasmServiceProject(targetArgument);
    const kind = oci ? 'OCI-container' : 'WASM';
    process.stdout.write(
      `Created ${kind} service project at ${result.targetDirectory}\n`);
    return SERVICE_COMMAND_EXIT_CODE.SUCCESS;
  } catch (error) {
    return initializationError(error);
  }
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
  if (args.length === 2 && SERVICE_HELP_FLAGS.has(args[1]) &&
      (args[0] === SERVICE_COMMAND.INIT ||
        SERVICE_LIFECYCLE_COMMANDS.has(args[0]) ||
        SERVICE_PIPELINE_COMMANDS.has(args[0]))) {
    printHelp();
    return SERVICE_COMMAND_EXIT_CODE.SUCCESS;
  }
  if (args[0] === SERVICE_COMMAND.INIT) {
    return runInitCommand(args.slice(1));
  }
  if (SERVICE_PIPELINE_COMMANDS.has(args[0])) {
    return loadServicePipelineCommand()
      .then(({runServicePipelineCommand}) => runServicePipelineCommand(args))
      .catch((error) => {
        process.stderr.write(`lagrange service failed: ${error.message}\n`);
        return SERVICE_COMMAND_EXIT_CODE.FAILURE;
      });
  }
  if (!SERVICE_LIFECYCLE_COMMANDS.has(args[0])) {
    return usageError(
      SERVICE_COMMAND_ERROR_CODE.UNKNOWN_COMMAND,
      `unknown command: ${args[0]}`,
    );
  }
  return loadServiceLifecycleCommand()
    .then(({runServiceLifecycleCommand}) => runServiceLifecycleCommand(args))
    .catch((error) => {
      process.stderr.write(`lagrange service failed: ${error.message}\n`);
      return SERVICE_COMMAND_EXIT_CODE.FAILURE;
    });
}

export {runServiceCommand};
