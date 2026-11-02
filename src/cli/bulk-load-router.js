import fs from 'node:fs';
import {
  runBulkLoad,
  verifyBulkLoadCompleteness,
} from './bulk-load-command.js';

const SQL_CLIENT_SPECIFIER = './service-lifecycle-sql-client.js';
const loadSqlClient = () => import(SQL_CLIENT_SPECIFIER);

const UTF8_ENCODING = 'utf8';
const NEWLINE = '\n';
const RADIX_DECIMAL = 10;
const BULK_LOAD_USAGE_ERROR_NAME = 'BulkLoadUsageError';

const BULK_LOAD_CLI_EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});

const BULK_LOAD_SUBCOMMAND = Object.freeze({
  RUN: 'run',
  VERIFY: 'verify',
});

const BULK_LOAD_FLAG = Object.freeze({
  MANIFEST: '--manifest',
  SOURCE: '--source',
  MAX_ROWS: '--max-rows',
  MAX_BYTES: '--max-bytes',
  TARGET_SCHEMA: '--target-schema',
  OPTION_PREFIX: '-',
});

const USAGE_ERROR_TEXT = Object.freeze({
  ARGS_REQUIRED: 'bulk-load requires --manifest <path> and --source <path>',
  FLAG_VALUE_REQUIRED: 'requires a value',
  INVALID_POSITIVE_INTEGER: 'requires a positive integer value',
  UNKNOWN_OPTION: 'unknown option',
  UNKNOWN_SUBCOMMAND: 'unknown bulk-load subcommand',
});

class BulkLoadUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = BULK_LOAD_USAGE_ERROR_NAME;
  }
}

function writeProcessLine(stream, line) {
  stream.write(`${line}${NEWLINE}`);
}

function readFlagValue(args, index, flag) {
  const value = args[index + 1];
  if (typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith(BULK_LOAD_FLAG.OPTION_PREFIX)) {
    throw new BulkLoadUsageError(
      `${flag} ${USAGE_ERROR_TEXT.FLAG_VALUE_REQUIRED}`,
    );
  }
  return value;
}

function parsePositiveIntFlag(rawValue, flag) {
  const parsed = Number.parseInt(rawValue, RADIX_DECIMAL);
  if (!Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      String(parsed) !== rawValue.trim()) {
    throw new BulkLoadUsageError(
      `${flag} ${USAGE_ERROR_TEXT.INVALID_POSITIVE_INTEGER}`,
    );
  }
  return parsed;
}

function resolveSubcommandAndStartIndex(argv) {
  const firstToken = argv[0];
  if (firstToken === BULK_LOAD_SUBCOMMAND.RUN ||
      firstToken === BULK_LOAD_SUBCOMMAND.VERIFY) {
    return {subcommand: firstToken, startIndex: 1};
  }
  if (firstToken.startsWith(BULK_LOAD_FLAG.OPTION_PREFIX)) {
    return {subcommand: BULK_LOAD_SUBCOMMAND.RUN, startIndex: 0};
  }
  throw new BulkLoadUsageError(
    `${USAGE_ERROR_TEXT.UNKNOWN_SUBCOMMAND}: ${firstToken}`,
  );
}

function applyFlagToken(token, value, parsed) {
  if (token === BULK_LOAD_FLAG.MANIFEST) {
    parsed.manifestPath = value;
  } else if (token === BULK_LOAD_FLAG.SOURCE) {
    parsed.sourcePath = value;
  } else if (token === BULK_LOAD_FLAG.TARGET_SCHEMA) {
    parsed.targetSchemaPath = value;
  } else if (token === BULK_LOAD_FLAG.MAX_ROWS) {
    parsed.maxRows = parsePositiveIntFlag(value, token);
  } else if (token === BULK_LOAD_FLAG.MAX_BYTES) {
    parsed.maxBytes = parsePositiveIntFlag(value, token);
  } else {
    throw new BulkLoadUsageError(
      `${USAGE_ERROR_TEXT.UNKNOWN_OPTION}: ${token}`,
    );
  }
}

function parseBulkLoadCommand(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new BulkLoadUsageError(USAGE_ERROR_TEXT.ARGS_REQUIRED);
  }
  const {subcommand, startIndex} = resolveSubcommandAndStartIndex(argv);
  const parsed = {
    subcommand,
    manifestPath: null,
    sourcePath: null,
    targetSchemaPath: null,
    maxRows: null,
    maxBytes: null,
  };

  for (let index = startIndex; index < argv.length; index += 2) {
    const token = argv[index];
    if (!token.startsWith(BULK_LOAD_FLAG.OPTION_PREFIX)) {
      throw new BulkLoadUsageError(
        `${USAGE_ERROR_TEXT.UNKNOWN_OPTION}: ${token}`,
      );
    }
    const value = readFlagValue(argv, index, token);
    applyFlagToken(token, value, parsed);
  }

  if (!parsed.manifestPath || !parsed.sourcePath) {
    throw new BulkLoadUsageError(USAGE_ERROR_TEXT.ARGS_REQUIRED);
  }
  return Object.freeze(parsed);
}

async function resolveDependencies(overrides) {
  const writeOutput = overrides.writeOutput ||
    ((line) => writeProcessLine(process.stdout, line));
  const writeError = overrides.writeError ||
    ((line) => writeProcessLine(process.stderr, line));
  const readFile = overrides.readFile ||
    ((filePath) => fs.readFileSync(filePath, UTF8_ENCODING));

  let sqlClient = overrides.sqlClient || null;
  if (!sqlClient) {
    if (typeof overrides.createSqlClient === 'function') {
      sqlClient = await overrides.createSqlClient();
    } else {
      const {createServiceLifecycleSqlClient} = await loadSqlClient();
      sqlClient = createServiceLifecycleSqlClient();
    }
  }
  const externalReadClient = overrides.externalReadClient || sqlClient;
  return {
    writeOutput,
    writeError,
    readFile,
    sqlClient,
    externalReadClient,
  };
}

function applyBatchBoundOverrides(manifest, command) {
  if (command.maxRows === null && command.maxBytes === null) {
    return manifest;
  }
  return {
    ...manifest,
    batchBounds: {
      ...manifest.batchBounds,
      ...(command.maxRows !== null ? {maxRows: command.maxRows} : {}),
      ...(command.maxBytes !== null ? {maxBytes: command.maxBytes} : {}),
    },
  };
}

async function runBulkLoadCommand(argv, dependencyOverrides = {}) {
  let command;
  try {
    command = parseBulkLoadCommand(argv);
  } catch (error) {
    if (!(error instanceof BulkLoadUsageError)) {
      throw error;
    }
    const writeError = dependencyOverrides.writeError ||
      ((line) => writeProcessLine(process.stderr, line));
    await writeError(`lagrange bulk-load usage error: ${error.message}`);
    return BULK_LOAD_CLI_EXIT_CODE.USAGE;
  }

  const deps = await resolveDependencies(dependencyOverrides);
  try {
    const rawManifest = await deps.readFile(command.manifestPath);
    const baseManifest = JSON.parse(rawManifest);
    const manifest = applyBatchBoundOverrides(baseManifest, command);
    const sourceText = await deps.readFile(command.sourcePath);
    const targetTableSchema = command.targetSchemaPath ?
      JSON.parse(await deps.readFile(command.targetSchemaPath)) :
      dependencyOverrides.targetTableSchema;

    if (command.subcommand === BULK_LOAD_SUBCOMMAND.VERIFY) {
      const report = await verifyBulkLoadCompleteness({
        manifest,
        sourceText,
        externalReadClient: deps.externalReadClient,
      });
      await deps.writeOutput(JSON.stringify(report));
    } else {
      const result = await runBulkLoad({
        manifest,
        sourceText,
        targetTableSchema,
        sqlClient: deps.sqlClient,
        externalReadClient: deps.externalReadClient,
        faultInjector: dependencyOverrides.faultInjector,
        skipIdempotentReplay: Boolean(dependencyOverrides.skipIdempotentReplay),
        skipCheckpointPersistence: Boolean(
          dependencyOverrides.skipCheckpointPersistence,
        ),
      });
      await deps.writeOutput(JSON.stringify(result));
    }
    return BULK_LOAD_CLI_EXIT_CODE.SUCCESS;
  } catch (error) {
    await deps.writeError(
      `lagrange bulk-load ${command.subcommand} failed: ${error.message}`,
    );
    return BULK_LOAD_CLI_EXIT_CODE.FAILURE;
  }
}

export {
  BULK_LOAD_CLI_EXIT_CODE,
  parseBulkLoadCommand,
  runBulkLoadCommand,
};
