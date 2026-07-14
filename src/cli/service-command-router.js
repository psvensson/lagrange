import {
  SERVICE_PROJECT_SCAFFOLD_ERROR_CODE,
  ServiceProjectScaffoldError,
  createServiceProject,
} from './service-project-scaffold.js';

const SERVICE_COMMAND_EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});

const SERVICE_COMMAND = Object.freeze({
  INIT: 'init',
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
});

const SERVICE_HELP_FLAGS = Object.freeze(new Set([
  SERVICE_COMMAND_FLAG.HELP_LONG,
  SERVICE_COMMAND_FLAG.HELP_SHORT,
]));

const SERVICE_HELP = `Usage:
  lagrange service init <directory>

Commands:
  init <directory>  Create an OCI-container Node service source project
`;

function printHelp() {
  process.stdout.write(SERVICE_HELP);
}

function usageError(code, message) {
  process.stderr.write(`lagrange service error [${code}]: ${message}\n`);
  process.stderr.write(SERVICE_HELP);
  return SERVICE_COMMAND_EXIT_CODE.USAGE;
}

function initializationError(error) {
  const code = error instanceof ServiceProjectScaffoldError ?
    error.code : SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.WRITE_FAILED;
  process.stderr.write(`lagrange service init failed [${code}]: ${error.message}\n`);
  return code === SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.INVALID_NAME ?
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
    const result = createServiceProject(targetArgument);
    process.stdout.write(`Created OCI-container service project at ${result.targetDirectory}\n`);
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
  if (args[0] !== SERVICE_COMMAND.INIT) {
    return usageError(
      SERVICE_COMMAND_ERROR_CODE.UNKNOWN_COMMAND,
      `unknown command: ${args[0]}`,
    );
  }
  if (args.length === 2 && SERVICE_HELP_FLAGS.has(args[1])) {
    printHelp();
    return SERVICE_COMMAND_EXIT_CODE.SUCCESS;
  }
  return runInitCommand(args.slice(1));
}

export {SERVICE_COMMAND_EXIT_CODE, runServiceCommand};
