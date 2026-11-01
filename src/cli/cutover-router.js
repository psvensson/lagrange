import fs from 'node:fs';
import {
  createPilotCutoverWorkflowOwner,
} from '../control-plane/owners/pilot-cutover-workflow-owner.js';

const SQL_CLIENT_SPECIFIER = './service-lifecycle-sql-client.js';
const loadSqlClient = () => import(SQL_CLIENT_SPECIFIER);

const UTF8_ENCODING = 'utf8';
const NEWLINE = '\n';
const RADIX_DECIMAL = 10;
const CUTOVER_USAGE_ERROR_NAME = 'CutoverUsageError';

const CUTOVER_CLI_EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});

const CUTOVER_SUBCOMMAND = Object.freeze({
  SEAL: 'seal',
  LOAD: 'load',
  SYNC: 'sync',
  PARITY: 'parity',
  SWITCH: 'switch',
  ROLLBACK: 'rollback',
  STATUS: 'status',
});

const SUBCOMMAND_SET = Object.freeze(new Set([
  CUTOVER_SUBCOMMAND.SEAL,
  CUTOVER_SUBCOMMAND.LOAD,
  CUTOVER_SUBCOMMAND.SYNC,
  CUTOVER_SUBCOMMAND.PARITY,
  CUTOVER_SUBCOMMAND.SWITCH,
  CUTOVER_SUBCOMMAND.ROLLBACK,
  CUTOVER_SUBCOMMAND.STATUS,
]));

const CUTOVER_FLAG = Object.freeze({
  PLAN: '--plan',
  PLAN_ID: '--plan-id',
  OUTCOME: '--outcome',
  RECORDS: '--records',
  SLICE: '--slice',
  REASON: '--reason',
  TIMEOUT_MS: '--timeout-ms',
  OPTION_PREFIX: '-',
});

const ROUTER_USAGE_TEXT = Object.freeze({
  SUBCOMMAND_REQUIRED:
    'cutover requires one of: seal|load|sync|parity|switch|rollback|status',
  FLAG_VALUE_REQUIRED: 'requires a value',
  UNKNOWN_OPTION: 'unknown option',
  PLAN_FILE_REQUIRED: 'cutover seal requires --plan <path>',
  PLAN_ID_REQUIRED: 'cutover command requires --plan-id <id>',
  OUTCOME_REQUIRED: 'cutover load requires --outcome <path>',
  RECORDS_REQUIRED: 'cutover sync requires --records <path>',
  SLICE_REQUIRED: 'cutover switch requires --slice <sliceId>',
  POSITIVE_INT_REQUIRED: 'requires a positive integer',
});

class CutoverUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = CUTOVER_USAGE_ERROR_NAME;
  }
}

function writeLine(stream, line) {
  stream.write(`${line}${NEWLINE}`);
}

function readFlagValue(argv, index, flag) {
  const val = argv[index + 1];
  if (typeof val !== 'string' ||
      val.length === 0 ||
      val.startsWith(CUTOVER_FLAG.OPTION_PREFIX)) {
    throw new CutoverUsageError(
      `${flag} ${ROUTER_USAGE_TEXT.FLAG_VALUE_REQUIRED}`,
    );
  }
  return val;
}

function parsePositiveInt(rawVal, flag) {
  const parsed = Number.parseInt(rawVal, RADIX_DECIMAL);
  if (!Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      String(parsed) !== rawVal.trim()) {
    throw new CutoverUsageError(
      `${flag} ${ROUTER_USAGE_TEXT.POSITIVE_INT_REQUIRED}`,
    );
  }
  return parsed;
}

function applyCutoverFlag(token, val, parsed) {
  if (token === CUTOVER_FLAG.PLAN) {
    parsed.planPath = val;
  } else if (token === CUTOVER_FLAG.PLAN_ID) {
    parsed.planId = val;
  } else if (token === CUTOVER_FLAG.OUTCOME) {
    parsed.outcomePath = val;
  } else if (token === CUTOVER_FLAG.RECORDS) {
    parsed.recordsPath = val;
  } else if (token === CUTOVER_FLAG.SLICE) {
    parsed.sliceId = val;
  } else if (token === CUTOVER_FLAG.REASON) {
    parsed.rollbackReason = val;
  } else if (token === CUTOVER_FLAG.TIMEOUT_MS) {
    parsed.timeoutMs = parsePositiveInt(val, token);
  } else {
    throw new CutoverUsageError(`${ROUTER_USAGE_TEXT.UNKNOWN_OPTION}: ${token}`);
  }
}

function validateParsedSubcommandRequirements(parsed) {
  if (parsed.subcommand === CUTOVER_SUBCOMMAND.SEAL) {
    if (!parsed.planPath) {
      throw new CutoverUsageError(ROUTER_USAGE_TEXT.PLAN_FILE_REQUIRED);
    }
    return;
  }
  if (!parsed.planId) {
    throw new CutoverUsageError(ROUTER_USAGE_TEXT.PLAN_ID_REQUIRED);
  }
  if (parsed.subcommand === CUTOVER_SUBCOMMAND.LOAD && !parsed.outcomePath) {
    throw new CutoverUsageError(ROUTER_USAGE_TEXT.OUTCOME_REQUIRED);
  }
  if (parsed.subcommand === CUTOVER_SUBCOMMAND.SYNC && !parsed.recordsPath) {
    throw new CutoverUsageError(ROUTER_USAGE_TEXT.RECORDS_REQUIRED);
  }
  if (parsed.subcommand === CUTOVER_SUBCOMMAND.SWITCH && !parsed.sliceId) {
    throw new CutoverUsageError(ROUTER_USAGE_TEXT.SLICE_REQUIRED);
  }
}

function parseCutoverCommand(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new CutoverUsageError(ROUTER_USAGE_TEXT.SUBCOMMAND_REQUIRED);
  }
  const subcommand = argv[0];
  if (!SUBCOMMAND_SET.has(subcommand)) {
    throw new CutoverUsageError(
      `${ROUTER_USAGE_TEXT.SUBCOMMAND_REQUIRED}: ${String(subcommand)}`,
    );
  }
  const parsed = {
    subcommand,
    planPath: null,
    planId: null,
    outcomePath: null,
    recordsPath: null,
    sliceId: null,
    rollbackReason: null,
    timeoutMs: null,
  };

  for (let idx = 1; idx < argv.length; idx += 2) {
    const token = argv[idx];
    if (!token.startsWith(CUTOVER_FLAG.OPTION_PREFIX)) {
      throw new CutoverUsageError(
        `${ROUTER_USAGE_TEXT.UNKNOWN_OPTION}: ${token}`,
      );
    }
    const val = readFlagValue(argv, idx, token);
    applyCutoverFlag(token, val, parsed);
  }

  validateParsedSubcommandRequirements(parsed);
  return Object.freeze(parsed);
}

async function resolveCutoverDependencies(overrides) {
  const writeOutput = overrides.writeOutput ||
    ((line) => writeLine(process.stdout, line));
  const writeError = overrides.writeError ||
    ((line) => writeLine(process.stderr, line));
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
  const owner = overrides.owner || createPilotCutoverWorkflowOwner({
    sqlClient,
    maxTargetOutageAttempts: overrides.maxTargetOutageAttempts,
    disableReceiptDurability: overrides.disableReceiptDurability,
    disableParityChecks: overrides.disableParityChecks,
    disableDivergenceAccounting: overrides.disableDivergenceAccounting,
  });

  return {
    writeOutput,
    writeError,
    readFile,
    sqlClient,
    owner,
    sourceClient: overrides.sourceClient || sqlClient,
    targetClient: overrides.targetClient || sqlClient,
    switchTraffic: overrides.switchTraffic,
    reverseTraffic: overrides.reverseTraffic,
  };
}

async function dispatchCutoverSubcommand(command, deps) {
  const {owner, readFile} = deps;
  if (command.subcommand === CUTOVER_SUBCOMMAND.SEAL) {
    const plan = JSON.parse(await readFile(command.planPath));
    return owner.sealMigrationPlan(plan);
  }
  if (command.subcommand === CUTOVER_SUBCOMMAND.LOAD) {
    const outcome = JSON.parse(await readFile(command.outcomePath));
    return owner.completeInitialLoad(command.planId, outcome);
  }
  if (command.subcommand === CUTOVER_SUBCOMMAND.SYNC) {
    const records = JSON.parse(await readFile(command.recordsPath));
    return owner.ingestChangeFeedBatch(command.planId, records);
  }
  if (command.subcommand === CUTOVER_SUBCOMMAND.PARITY) {
    return owner.runParityVerification(command.planId, {
      sourceClient: deps.sourceClient,
      targetClient: deps.targetClient,
    });
  }
  if (command.subcommand === CUTOVER_SUBCOMMAND.SWITCH) {
    return owner.executeTrafficCutover(command.planId, {
      sliceId: command.sliceId,
      switchTraffic: deps.switchTraffic,
      timeoutMs: command.timeoutMs ?? undefined,
    });
  }
  if (command.subcommand === CUTOVER_SUBCOMMAND.ROLLBACK) {
    return owner.executeRollback(command.planId, {
      reason: command.rollbackReason ?? undefined,
      reverseTraffic: deps.reverseTraffic,
    });
  }
  return owner.recoverPlanStatus(command.planId);
}

async function runCutoverCommand(argv, dependencyOverrides = {}) {
  let command;
  try {
    command = parseCutoverCommand(argv);
  } catch (err) {
    if (!(err instanceof CutoverUsageError)) {
      throw err;
    }
    const writeError = dependencyOverrides.writeError ||
      ((line) => writeLine(process.stderr, line));
    await writeError(`lagrange cutover usage error: ${err.message}`);
    return CUTOVER_CLI_EXIT_CODE.USAGE;
  }

  const deps = await resolveCutoverDependencies(dependencyOverrides);
  try {
    const outputPayload = await dispatchCutoverSubcommand(command, deps);
    await deps.writeOutput(JSON.stringify(outputPayload));
    return CUTOVER_CLI_EXIT_CODE.SUCCESS;
  } catch (err) {
    await deps.writeError(
      `lagrange cutover ${command.subcommand} failed: ${err.message}`,
    );
    return CUTOVER_CLI_EXIT_CODE.FAILURE;
  }
}

export {
  CUTOVER_CLI_EXIT_CODE,
  CUTOVER_SUBCOMMAND,
  CutoverUsageError,
  parseCutoverCommand,
  runCutoverCommand,
};
