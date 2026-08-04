/**
 * Argument routing for `lagrange service generate|build|deploy`: parses
 * argv into a typed pipeline command and invokes the pipeline owner
 * (service-pipeline-command.js) with injectable dependencies, mirroring
 * the lifecycle command's dependency-override shape so tests drive the
 * real router with fake SQL/build seams.
 */

import {
  runBuild,
  runDeploy,
  runGenerate,
} from './service-pipeline-command.js';

// The build/deploy dependencies load behind one literal dynamic import
// each (the house rule the lifecycle router is pinned to): the OCI
// layout builder pulls Docker exporters and the SQL client pulls `pg`,
// so neither is a static dependency of argument routing.
const LOCAL_OCI_LAYOUT_BUILDER_SPECIFIER =
  '../service/service-local-oci-layout-builder.js';
const SQL_CLIENT_SPECIFIER = './service-lifecycle-sql-client.js';
const loadLocalOciLayoutBuilder = () =>
  import(LOCAL_OCI_LAYOUT_BUILDER_SPECIFIER);
const loadSqlClient = () => import(SQL_CLIENT_SPECIFIER);

const SERVICE_COMMAND_EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});
const PIPELINE_COMMAND = Object.freeze({
  BUILD: 'build',
  DEPLOY: 'deploy',
  GENERATE: 'generate',
});
const PIPELINE_FLAG = Object.freeze({
  IDEMPOTENCY_KEY: '--idempotency-key',
  LAYOUT: '--layout',
  OPTION_PREFIX: '-',
});
const MAXIMUM_IDEMPOTENCY_KEY_LENGTH = 256;
const PIPELINE_USAGE_MESSAGE = Object.freeze({
  DEPLOY_LAYOUT_REQUIRED: 'deploy requires --layout <oci-layout-path>',
  DIRECTORY_REQUIRED: 'requires exactly one project directory',
  IDEMPOTENCY_KEY_INVALID:
    '--idempotency-key must contain 1 to 256 characters',
  IDEMPOTENCY_KEY_REQUIRED: 'deploy requires --idempotency-key <key>',
  UNKNOWN_OPTION: 'unknown option',
});

const PIPELINE_USAGE_ERROR_NAME = 'ServicePipelineUsageError';

class ServicePipelineUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = PIPELINE_USAGE_ERROR_NAME;
  }
}

function writeProcessLine(stream, line) {
  stream.write(`${line}\n`);
}

async function dependenciesFor(overrides) {
  const dependencies = {
    writeError: overrides.writeError ||
      ((line) => writeProcessLine(process.stderr, line)),
    writeOutput: overrides.writeOutput ||
      ((line) => writeProcessLine(process.stdout, line)),
  };
  if (overrides.createLocalOciLayoutBuilder) {
    dependencies.createLocalOciLayoutBuilder =
      overrides.createLocalOciLayoutBuilder;
  } else {
    const {ServiceLocalOciLayoutBuilder} =
      await loadLocalOciLayoutBuilder();
    dependencies.createLocalOciLayoutBuilder =
      () => new ServiceLocalOciLayoutBuilder();
  }
  if (overrides.createSqlClient) {
    dependencies.createSqlClient = overrides.createSqlClient;
  } else {
    const {createServiceLifecycleSqlClient} = await loadSqlClient();
    dependencies.createSqlClient = () => createServiceLifecycleSqlClient();
  }
  return dependencies;
}

function parseFlagValue(command, args, flag, startIndex) {
  const value = args[startIndex + 1];
  if (typeof value !== 'string' ||
      value.startsWith(PIPELINE_FLAG.OPTION_PREFIX)) {
    throw new ServicePipelineUsageError(
      `${command} requires ${flag} <value>`);
  }
  return value;
}

function parseDeployFlags(command, args, parsed) {
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (token === PIPELINE_FLAG.LAYOUT) {
      parsed.layoutPath = parseFlagValue(command, args, token, index);
      index += 1;
    } else if (token === PIPELINE_FLAG.IDEMPOTENCY_KEY) {
      parsed.idempotencyKey = parseFlagValue(command, args, token, index);
      index += 1;
    } else {
      throw new ServicePipelineUsageError(
        `${PIPELINE_USAGE_MESSAGE.UNKNOWN_OPTION}: ${token}`);
    }
  }
  if (typeof parsed.layoutPath !== 'string') {
    throw new ServicePipelineUsageError(
      PIPELINE_USAGE_MESSAGE.DEPLOY_LAYOUT_REQUIRED);
  }
  if (typeof parsed.idempotencyKey !== 'string' ||
      parsed.idempotencyKey.trim().length === 0 ||
      parsed.idempotencyKey.length > MAXIMUM_IDEMPOTENCY_KEY_LENGTH) {
    throw new ServicePipelineUsageError(
      PIPELINE_USAGE_MESSAGE.IDEMPOTENCY_KEY_REQUIRED);
  }
}

function parsePipelineCommand(argv) {
  const [command, ...args] = argv;
  if (args.length === 0 ||
      args[0].startsWith(PIPELINE_FLAG.OPTION_PREFIX)) {
    throw new ServicePipelineUsageError(
      `${command} ${PIPELINE_USAGE_MESSAGE.DIRECTORY_REQUIRED}`);
  }
  const projectDirectory = args[0];
  const parsed = {command, projectDirectory};
  if (command === PIPELINE_COMMAND.DEPLOY) {
    parseDeployFlags(command, args, parsed);
    return parsed;
  }
  if (args.length !== 1) {
    throw new ServicePipelineUsageError(
      args[1]?.startsWith(PIPELINE_FLAG.OPTION_PREFIX) ?
        `${PIPELINE_USAGE_MESSAGE.UNKNOWN_OPTION}: ${args[1]}` :
        `${command} ${PIPELINE_USAGE_MESSAGE.DIRECTORY_REQUIRED}`,
    );
  }
  return parsed;
}

async function runServicePipelineCommand(argv, dependencyOverrides = {}) {
  let command;
  try {
    command = parsePipelineCommand(argv);
  } catch (error) {
    if (!(error instanceof ServicePipelineUsageError)) throw error;
    const writeError = dependencyOverrides.writeError ||
      ((line) => writeProcessLine(process.stderr, line));
    await writeError(`lagrange service usage error: ${error.message}`);
    return SERVICE_COMMAND_EXIT_CODE.USAGE;
  }
  const dependencies = await dependenciesFor(dependencyOverrides);
  try {
    if (command.command === PIPELINE_COMMAND.GENERATE) {
      await runGenerate({
        projectDirectory: command.projectDirectory,
        writeOutput: dependencies.writeOutput,
      });
    } else if (command.command === PIPELINE_COMMAND.BUILD) {
      await runBuild({
        createLocalOciLayoutBuilder:
          dependencies.createLocalOciLayoutBuilder,
        projectDirectory: command.projectDirectory,
        writeOutput: dependencies.writeOutput,
      });
    } else {
      await runDeploy({
        createSqlClient: dependencies.createSqlClient,
        idempotencyKey: command.idempotencyKey,
        layoutPath: command.layoutPath,
        projectDirectory: command.projectDirectory,
        writeOutput: dependencies.writeOutput,
      });
    }
    return SERVICE_COMMAND_EXIT_CODE.SUCCESS;
  } catch (error) {
    await dependencies.writeError(
      `lagrange service ${command.command} failed: ${error.message}`);
    return SERVICE_COMMAND_EXIT_CODE.FAILURE;
  }
}

export {runServicePipelineCommand};
