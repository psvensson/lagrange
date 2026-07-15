import {tmpdir} from 'node:os';
import path from 'node:path';

import {RUNTIME_KIND} from '../constants/runtime.js';
import {validateExternalServiceManifest} from
  '../service/external-service-manifest.js';
import {ServiceLocalOciLayoutBuilder} from
  '../service/service-local-oci-layout-builder.js';
import {createServiceLifecycleSqlClient} from
  './service-lifecycle-sql-client.js';
import {
  createServiceProjectBuildInput,
  materializeFinalServiceManifest,
  readBoundedJsonFile,
  readServiceManifestTemplate,
  validateExistingFinalServiceManifest,
} from './service-project-build-input.js';

const SERVICE_COMMAND_EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});
const SERVICE_LIFECYCLE_COMMAND = Object.freeze({
  DEV_INSTALL: 'dev-install',
  INSTALL: 'install',
  LIST: 'list',
  REMOVE: 'remove',
  STATUS: 'status',
});
const SERVICE_LIFECYCLE_SQL = Object.freeze({
  INSTALL: 'INSTALL SERVICE $1',
  LIST: 'SHOW SERVICES',
  REMOVE: 'REMOVE SERVICE $1',
  STATUS: 'SHOW SERVICE $1',
});
const SERVICE_LIFECYCLE_FLAG = Object.freeze({
  CONFIG: '--config',
  IDEMPOTENCY_KEY: '--idempotency-key',
  OUTPUT_ROOT: '--output-root',
  PLATFORM: '--platform',
  SOURCE_DATE_EPOCH: '--source-date-epoch',
});
const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,127}$/u;
const PLATFORM_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?$/u;
const NONNEGATIVE_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const MAXIMUM_IDEMPOTENCY_KEY_LENGTH = 256;
const DEFAULT_OUTPUT_DIRECTORY = 'lagrange-service-oci-layouts';
const SERVICE_LIFECYCLE_USAGE_ERROR_NAME = 'ServiceLifecycleUsageError';
const SERVICE_LIFECYCLE_TOKEN = Object.freeze({
  MISSING_OPTION: '(missing)',
  OPTION_PREFIX: '-',
  VALUE_OPTION_PREFIX: '--',
});
const SERVICE_LIFECYCLE_USAGE_MESSAGE = Object.freeze({
  IDEMPOTENCY_KEY_LENGTH:
    '--idempotency-key must contain 1 to 256 characters',
  IDEMPOTENCY_KEY_REQUIRED: '--idempotency-key is required',
  LIFECYCLE_COMMAND_REQUIRED: 'one lifecycle command is required',
  LIST_ARGUMENTS_FORBIDDEN: 'list does not accept arguments',
  PLATFORM_INVALID:
    '--platform must be an explicit os/architecture[/variant] value',
  SERVICE_NAME_INVALID:
    'service name must match the external service manifest contract',
  SOURCE_DATE_EPOCH_INVALID:
    '--source-date-epoch must be a nonnegative integer',
  SOURCE_DATE_EPOCH_UNSAFE: '--source-date-epoch must be a safe integer',
  STATUS_ARGUMENT_INVALID: 'status accepts one service name',
});
const SERVICE_LIFECYCLE_RESULT_MESSAGE = Object.freeze({
  CONFIG_INVALID: 'service config must be a JSON object',
  RESULT_ROWS_INVALID: 'PostgreSQL lifecycle result must contain rows',
  ROW_FIELDS_INVALID: 'PostgreSQL lifecycle row has an invalid field set',
  ROW_INVALID: 'PostgreSQL lifecycle rows must be objects',
  ROW_SERVICE_NAME_INVALID:
    'PostgreSQL lifecycle row is missing service_name',
});
const MUTATION_ROW_FIELDS = Object.freeze(new Set([
  'action',
  'desired_state',
  'installation_id',
  'operation_id',
  'operation_status',
  'package_id',
  'revision_id',
  'rollout_state',
  'service_definition_id',
  'service_name',
]));
const STATUS_ROW_FIELDS = Object.freeze(new Set([
  'desired_state',
  'installation_id',
  'latest_failure_id',
  'operation_id',
  'revision_id',
  'rollout_state',
  'service_definition_id',
  'service_name',
  'version',
]));

class ServiceLifecycleUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = SERVICE_LIFECYCLE_USAGE_ERROR_NAME;
  }
}

function usage(message) {
  throw new ServiceLifecycleUsageError(message);
}

function requiredPositional(value, label) {
  if (typeof value !== 'string' || value.length === 0 ||
      value.startsWith(SERVICE_LIFECYCLE_TOKEN.OPTION_PREFIX)) {
    usage(`${label} is required`);
  }
  return value;
}

function parseOptions(tokens, allowedFlags) {
  const options = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!allowedFlags.has(flag)) {
      usage(`unknown option: ${flag || SERVICE_LIFECYCLE_TOKEN.MISSING_OPTION}`);
    }
    if (options.has(flag)) usage(`duplicate option: ${flag}`);
    if (typeof value !== 'string' || value.length === 0 ||
        value.startsWith(SERVICE_LIFECYCLE_TOKEN.VALUE_OPTION_PREFIX)) {
      usage(`${flag} requires one value`);
    }
    options.set(flag, value);
  }
  return options;
}

function idempotencyKey(options) {
  const value = options.get(SERVICE_LIFECYCLE_FLAG.IDEMPOTENCY_KEY);
  if (typeof value !== 'string') {
    usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.IDEMPOTENCY_KEY_REQUIRED);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > MAXIMUM_IDEMPOTENCY_KEY_LENGTH) {
    usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.IDEMPOTENCY_KEY_LENGTH);
  }
  return normalized;
}

function serviceName(value) {
  if (!SERVICE_NAME_PATTERN.test(value || '')) {
    usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.SERVICE_NAME_INVALID);
  }
  return value;
}

function sourceDateEpoch(value) {
  if (!NONNEGATIVE_INTEGER_PATTERN.test(value || '')) {
    usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.SOURCE_DATE_EPOCH_INVALID);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.SOURCE_DATE_EPOCH_UNSAFE);
  }
  return parsed;
}

function platform(value) {
  if (!PLATFORM_PATTERN.test(value || '')) {
    usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.PLATFORM_INVALID);
  }
  return value;
}

function parseLifecycleCommand(argv) {
  const command = argv[0];
  if (!Object.values(SERVICE_LIFECYCLE_COMMAND).includes(command)) {
    usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.LIFECYCLE_COMMAND_REQUIRED);
  }
  if (command === SERVICE_LIFECYCLE_COMMAND.LIST) {
    if (argv.length !== 1) {
      usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.LIST_ARGUMENTS_FORBIDDEN);
    }
    return {command};
  }
  const target = requiredPositional(argv[1],
    command === SERVICE_LIFECYCLE_COMMAND.INSTALL ? 'manifest file' :
      (command === SERVICE_LIFECYCLE_COMMAND.DEV_INSTALL ?
        'project directory' : 'service name'));
  const allowedFlags = new Set();
  if (command === SERVICE_LIFECYCLE_COMMAND.INSTALL) {
    allowedFlags.add(SERVICE_LIFECYCLE_FLAG.IDEMPOTENCY_KEY);
    allowedFlags.add(SERVICE_LIFECYCLE_FLAG.CONFIG);
  } else if (command === SERVICE_LIFECYCLE_COMMAND.DEV_INSTALL) {
    allowedFlags.add(SERVICE_LIFECYCLE_FLAG.IDEMPOTENCY_KEY);
    allowedFlags.add(SERVICE_LIFECYCLE_FLAG.PLATFORM);
    allowedFlags.add(SERVICE_LIFECYCLE_FLAG.SOURCE_DATE_EPOCH);
    allowedFlags.add(SERVICE_LIFECYCLE_FLAG.OUTPUT_ROOT);
  } else if (command === SERVICE_LIFECYCLE_COMMAND.REMOVE) {
    allowedFlags.add(SERVICE_LIFECYCLE_FLAG.IDEMPOTENCY_KEY);
  }
  const options = parseOptions(argv.slice(2), allowedFlags);
  if (command === SERVICE_LIFECYCLE_COMMAND.STATUS) {
    if (options.size > 0 || argv.length !== 2) {
      usage(SERVICE_LIFECYCLE_USAGE_MESSAGE.STATUS_ARGUMENT_INVALID);
    }
    return {command, serviceName: serviceName(target)};
  }
  if (command === SERVICE_LIFECYCLE_COMMAND.REMOVE) {
    return {
      command,
      idempotencyKey: idempotencyKey(options),
      serviceName: serviceName(target),
    };
  }
  if (command === SERVICE_LIFECYCLE_COMMAND.INSTALL) {
    return {
      command,
      configPath: options.get(SERVICE_LIFECYCLE_FLAG.CONFIG),
      idempotencyKey: idempotencyKey(options),
      manifestPath: target,
    };
  }
  const selectedPlatform = platform(options.get(SERVICE_LIFECYCLE_FLAG.PLATFORM));
  return {
    command,
    idempotencyKey: idempotencyKey(options),
    outputRoot: options.get(SERVICE_LIFECYCLE_FLAG.OUTPUT_ROOT) ||
      path.join(tmpdir(), DEFAULT_OUTPUT_DIRECTORY),
    platform: selectedPlatform,
    projectPath: target,
    sourceDateEpoch: sourceDateEpoch(
      options.get(SERVICE_LIFECYCLE_FLAG.SOURCE_DATE_EPOCH),
    ),
  };
}

function validateRows(result, command) {
  if (!result || !Array.isArray(result.rows)) {
    throw new Error(SERVICE_LIFECYCLE_RESULT_MESSAGE.RESULT_ROWS_INVALID);
  }
  if (command !== SERVICE_LIFECYCLE_COMMAND.LIST && result.rows.length !== 1) {
    const label = command === SERVICE_LIFECYCLE_COMMAND.STATUS ?
      'status returned no service' : 'mutation returned an invalid row count';
    throw new Error(label);
  }
  const expectedFields = command === SERVICE_LIFECYCLE_COMMAND.INSTALL ||
      command === SERVICE_LIFECYCLE_COMMAND.DEV_INSTALL ||
      command === SERVICE_LIFECYCLE_COMMAND.REMOVE ?
    MUTATION_ROW_FIELDS : STATUS_ROW_FIELDS;
  for (const row of result.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(SERVICE_LIFECYCLE_RESULT_MESSAGE.ROW_INVALID);
    }
    const rowFields = Object.keys(row);
    if (rowFields.length !== expectedFields.size ||
        [...expectedFields].some((field) => !Object.hasOwn(row, field))) {
      throw new Error(SERVICE_LIFECYCLE_RESULT_MESSAGE.ROW_FIELDS_INVALID);
    }
    for (const [field, value] of Object.entries(row)) {
      const nullableFailureId = expectedFields === STATUS_ROW_FIELDS &&
        field === 'latest_failure_id' && value === null;
      if (!expectedFields.has(field) ||
          (!nullableFailureId && typeof value !== 'string')) {
        throw new Error(`PostgreSQL lifecycle row field is invalid: ${field}`);
      }
    }
    if (!SERVICE_NAME_PATTERN.test(row.service_name || '')) {
      throw new Error(
        SERVICE_LIFECYCLE_RESULT_MESSAGE.ROW_SERVICE_NAME_INVALID,
      );
    }
  }
  return result.rows;
}

function writeProcessLine(stream, line) {
  return new Promise((resolve, reject) => {
    stream.write(`${line}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function dependenciesFor(overrides) {
  return {
    createLocalOciLayoutBuilder: overrides.createLocalOciLayoutBuilder ||
      (() => new ServiceLocalOciLayoutBuilder()),
    createSqlClient: overrides.createSqlClient ||
      (() => createServiceLifecycleSqlClient()),
    writeError: overrides.writeError ||
      ((line) => writeProcessLine(process.stderr, line)),
    writeOutput: overrides.writeOutput ||
      ((line) => writeProcessLine(process.stdout, line)),
  };
}

async function executeSql(command, payload, dependencies) {
  const sqlClient = dependencies.createSqlClient();
  let statement;
  let parameters;
  if (command === SERVICE_LIFECYCLE_COMMAND.LIST) {
    statement = SERVICE_LIFECYCLE_SQL.LIST;
    parameters = [];
  } else if (command === SERVICE_LIFECYCLE_COMMAND.STATUS) {
    statement = SERVICE_LIFECYCLE_SQL.STATUS;
    parameters = [JSON.stringify(payload)];
  } else if (command === SERVICE_LIFECYCLE_COMMAND.REMOVE) {
    statement = SERVICE_LIFECYCLE_SQL.REMOVE;
    parameters = [JSON.stringify(payload)];
  } else {
    statement = SERVICE_LIFECYCLE_SQL.INSTALL;
    parameters = [JSON.stringify(payload)];
  }
  const result = await sqlClient.execute(statement, parameters);
  return validateRows(result, command);
}

async function runInstall(command, dependencies) {
  const manifest = await readBoundedJsonFile(command.manifestPath);
  const validation = validateExternalServiceManifest(manifest);
  if (!validation.valid) {
    throw new Error(`external service manifest rejected: ${validation.errors[0].message}`);
  }
  let config;
  if (command.configPath) {
    config = await readBoundedJsonFile(command.configPath);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(SERVICE_LIFECYCLE_RESULT_MESSAGE.CONFIG_INVALID);
    }
  }
  const payload = {
    artifact_source: {kind: 'remote_oci'},
    ...(config === undefined ? {} : {config}),
    idempotency_key: command.idempotencyKey,
    manifest,
  };
  return {rows: await executeSql(command.command, payload, dependencies)};
}

async function runDevInstall(command, dependencies) {
  const templateInput = await readServiceManifestTemplate(command.projectPath);
  try {
    await validateExistingFinalServiceManifest(templateInput);
    const buildInput = await createServiceProjectBuildInput(
      command.projectPath,
      command.outputRoot,
      templateInput,
    );
    let buildReceipt;
    try {
      const builder = dependencies.createLocalOciLayoutBuilder();
      buildReceipt = await builder.build({
        container: {
          contextPath: buildInput.contextPath,
          dockerfilePath: buildInput.dockerfilePath,
          sourceFingerprint: buildInput.sourceFingerprint,
        },
        outputRoot: command.outputRoot,
        platform: command.platform,
        runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
        sourceDateEpoch: command.sourceDateEpoch,
      });
    } finally {
      await buildInput.cleanup();
    }
    const finalized = await materializeFinalServiceManifest(
      templateInput,
      buildReceipt.topManifestDescriptor.digest,
    );
    const payload = {
      artifact_source: {
        kind: 'local_oci_layout',
        location: buildReceipt.layoutPath,
      },
      idempotency_key: command.idempotencyKey,
      manifest: finalized.manifest,
    };
    const rows = await executeSql(command.command, payload, dependencies);
    return {
      buildReceipt,
      finalManifestPath: finalized.finalManifestPath,
      rows,
    };
  } finally {
    await templateInput.close();
  }
}

async function executeLifecycleCommand(command, dependencies) {
  if (command.command === SERVICE_LIFECYCLE_COMMAND.INSTALL) {
    return runInstall(command, dependencies);
  }
  if (command.command === SERVICE_LIFECYCLE_COMMAND.DEV_INSTALL) {
    return runDevInstall(command, dependencies);
  }
  if (command.command === SERVICE_LIFECYCLE_COMMAND.LIST) {
    return {rows: await executeSql(command.command, null, dependencies)};
  }
  const payload = command.command === SERVICE_LIFECYCLE_COMMAND.STATUS ?
    {service_name: command.serviceName} : {
      idempotency_key: command.idempotencyKey,
      service_name: command.serviceName,
    };
  return {rows: await executeSql(command.command, payload, dependencies)};
}

async function runServiceLifecycleCommand(argv, dependencyOverrides = {}) {
  let command;
  try {
    command = parseLifecycleCommand(argv);
  } catch (error) {
    if (!(error instanceof ServiceLifecycleUsageError)) throw error;
    const writeError = dependencyOverrides.writeError ||
      ((line) => writeProcessLine(process.stderr, line));
    await writeError(`lagrange service usage error: ${error.message}`);
    return SERVICE_COMMAND_EXIT_CODE.USAGE;
  }
  const dependencies = dependenciesFor(dependencyOverrides);
  try {
    const output = await executeLifecycleCommand(command, dependencies);
    await dependencies.writeOutput(JSON.stringify(output));
    return SERVICE_COMMAND_EXIT_CODE.SUCCESS;
  } catch (error) {
    await dependencies.writeError(
      `lagrange service ${command.command} failed: ${error.message}`,
    );
    return SERVICE_COMMAND_EXIT_CODE.FAILURE;
  }
}

export {runServiceLifecycleCommand};
