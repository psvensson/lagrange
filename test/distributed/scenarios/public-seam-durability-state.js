/**
 * Object state, write, and binding helpers of the public-seam durability
 * scenario. Everything here goes through a node's observed public client
 * (public-seam-durability-client.js createObservedClient).
 */

import {
  classifyPublicOutcome,
  describePublicError,
} from './public-seam-durability-client.js';
import {
  PUBLIC_SEAM_BINDING,
  PUBLIC_SEAM_OBJECT,
  PUBLIC_SEAM_OUTCOME_CLASS,
  PUBLIC_SEAM_SQL,
  PUBLIC_SEAM_WRITE_OUTCOME,
} from './public-seam-durability-constants.js';

const ZERO = 0;
const ONE = 1;
const BYTE_MODULUS = 256;
const HEX_ENCODING = 'hex';
const BODY_SHAPE_SAMPLE_LENGTH = 64;
const ROW_PAD_TEXT = '';

/**
 * Deterministic body bytes for a version; covers 0x00 and 0xff so a text
 * or UTF-8 re-encoding cannot round-trip them by accident.
 * @param {number} version
 * @return {Buffer}
 */
function buildObjectBody(version) {
  const bytes = [];
  for (let index = ZERO; index < PUBLIC_SEAM_OBJECT.BODY_BYTE_COUNT;
    index += ONE) {
    bytes.push((index * PUBLIC_SEAM_OBJECT.BODY_SEED + version) %
      BYTE_MODULUS);
  }
  bytes[ZERO] = ZERO;
  bytes[bytes.length - ONE] = BYTE_MODULUS - ONE;
  return Buffer.from(bytes);
}

function historyId(objectId, version) {
  return `${objectId}${PUBLIC_SEAM_OBJECT.HISTORY_ID_SEPARATOR}${version}`;
}

/**
 * Canonical, comparable form of a BLOB value as the client received it:
 * bytes become hex; anything else keeps its observed shape.
 * @param {*} value
 * @return {{hex: string}|{shape: string, sample: string}}
 */
function canonicalBody(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return {hex: Buffer.from(value).toString(HEX_ENCODING)};
  }
  return {
    sample: String(value).slice(ZERO, BODY_SHAPE_SAMPLE_LENGTH),
    shape: value === null ? 'null' : typeof value,
  };
}

/**
 * Read one object's state through a public client.
 * @param {Object} client
 * @param {string} objectId
 * @return {Promise<Object>}
 */
async function readObjectState(client, objectId) {
  const objectRows = await client.query(PUBLIC_SEAM_SQL.SELECT_OBJECT,
    [objectId]);
  const historyRows = await client.query(PUBLIC_SEAM_SQL.SELECT_HISTORY,
    [objectId]);
  const countRows = await client.query(PUBLIC_SEAM_SQL.COUNT_HISTORY,
    [objectId]);
  const objectRow = objectRows[ZERO] || null;
  return {
    body: objectRow ? canonicalBody(objectRow.body) : null,
    history: historyRows.map((row) => ({
      id: String(row.id),
      version: Number(row.version),
    })),
    historyCount: Number(countRows[ZERO]?.history_count),
    objectRowCount: objectRows.length,
    version: objectRow ? Number(objectRow.version) : null,
  };
}

function expectedHistory(objectId, finalVersion) {
  const history = [];
  for (let version = PUBLIC_SEAM_OBJECT.INITIAL_VERSION;
    version <= finalVersion; version += ONE) {
    history.push({id: historyId(objectId, version), version});
  }
  return history;
}

/**
 * Exactly one history row per version 1..version, no phantom rows, one
 * object row, and a COUNT(*) that agrees.
 * @param {Object} state - From readObjectState.
 * @param {string} objectId
 * @return {Array<string>} Violations (empty when exactly-once holds).
 */
function exactlyOnceViolations(state, objectId) {
  const violations = [];
  if (state.objectRowCount !== ONE) {
    violations.push(`object rows: ${state.objectRowCount}, expected 1`);
  }
  const expected = expectedHistory(objectId, state.version);
  if (JSON.stringify(state.history) !== JSON.stringify(expected)) {
    violations.push(
      `history ${JSON.stringify(state.history)} is not exactly one row ` +
      `per version 1..${state.version}`);
  }
  if (state.historyCount !== state.version) {
    violations.push(
      `COUNT(*) history ${state.historyCount} != version ${state.version}`);
  }
  return violations;
}

async function rollbackAfterFailure(client, rollbackFailures) {
  try {
    await client.query(PUBLIC_SEAM_SQL.ROLLBACK);
  } catch (error) {
    rollbackFailures.push({message: error.message, nodeId: client.nodeId});
  }
}

async function runTransaction(client, statements, rollbackFailures) {
  await client.query(PUBLIC_SEAM_SQL.BEGIN);
  try {
    for (const statement of statements) {
      await client.query(statement.sql, statement.params);
    }
    await client.query(PUBLIC_SEAM_SQL.COMMIT);
  } catch (error) {
    await rollbackAfterFailure(client, rollbackFailures);
    throw error;
  }
}

/**
 * The statements that move an object to `version` in one transaction.
 * @param {string} objectId
 * @param {number} version
 * @return {Array<{sql: string, params: Array}>}
 */
function objectVersionStatements(objectId, version) {
  const body = buildObjectBody(version);
  const objectStatement = version === PUBLIC_SEAM_OBJECT.INITIAL_VERSION ?
    {params: [objectId, body, version], sql: PUBLIC_SEAM_SQL.INSERT_OBJECT} :
    {
      params: [body, version, objectId, version - ONE],
      sql: PUBLIC_SEAM_SQL.UPDATE_OBJECT,
    };
  return [
    objectStatement,
    {
      params: [historyId(objectId, version), objectId, version],
      sql: PUBLIC_SEAM_SQL.INSERT_HISTORY,
    },
  ];
}

async function versionAlreadyApplied(client, objectId, version) {
  try {
    const state = await readObjectState(client, objectId);
    return state.version !== null && state.version >= version;
  } catch (_error) {
    // An unreadable state is "not known applied"; the next attempt decides.
    return false;
  }
}

/**
 * Move the object to `version` in one transaction, retrying only outcomes
 * the retry policy marks retry-safe. Before a retry the state is read back
 * so an attempt that did commit is never applied twice.
 * @param {Object} ctx - Scenario context.
 * @param {Object} client - Observed public client.
 * @param {number} version
 * @param {string} stepName
 * @return {Promise<{outcome: string, attempts: number, last: Object|null}>}
 */
async function writeObjectVersion(ctx, client, version, stepName) {
  const policy = ctx.deps.retryPolicy;
  let last = null;
  for (let attempt = ONE; attempt <= policy.maxAttempts; attempt += ONE) {
    if (attempt > ONE &&
        await versionAlreadyApplied(client, ctx.objectId, version)) {
      return {
        attempts: attempt - ONE,
        last,
        outcome: PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED_BY_PRIOR_ATTEMPT,
      };
    }
    try {
      await runTransaction(client,
        objectVersionStatements(ctx.objectId, version), ctx.rollbackFailures);
      return {attempts: attempt, last, outcome: PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED};
    } catch (error) {
      last = error.publicOutcome || describePublicError(error, policy);
      const classification = classifyPublicOutcome(last, policy);
      ctx.typedOutcomes.push({
        ...last, attempt, classification, nodeId: client.nodeId,
        step: stepName,
      });
      if (classification === PUBLIC_SEAM_OUTCOME_CLASS.TERMINAL) {
        return {attempts: attempt, last, outcome: PUBLIC_SEAM_WRITE_OUTCOME.TERMINAL};
      }
      await ctx.deps.sleep(policy.delayMs);
    }
  }
  return {
    attempts: policy.maxAttempts,
    last,
    outcome: PUBLIC_SEAM_WRITE_OUTCOME.UNAVAILABLE_TYPED,
  };
}

/**
 * The deterministic account_activity rows the binding summarizes.
 * @return {Array<Array>} Parameter tuples for PUBLIC_SEAM_BINDING_SQL.INSERT_ROW.
 */
function bindingDatasetRows() {
  const rows = [];
  const accountIds = PUBLIC_SEAM_BINDING.ACCOUNT_IDS;
  for (let index = ZERO; index < PUBLIC_SEAM_BINDING.ROW_COUNT;
    index += ONE) {
    rows.push([
      PUBLIC_SEAM_BINDING.ROW_ID_BASE + index,
      accountIds[index % accountIds.length],
      (index + ONE) * PUBLIC_SEAM_BINDING.ROW_AMOUNT_STEP_CENTS,
      index % PUBLIC_SEAM_BINDING.ROW_FLAG_MODULUS === ZERO ? ONE : ZERO,
      ROW_PAD_TEXT,
    ]);
  }
  return rows;
}

/**
 * Independent oracle for the account summary over bindingDatasetRows.
 * Value fields only; a leaked key such as `contributingShards` is judged
 * separately by the binding step's leak check, never hidden by the oracle.
 * @param {number} accountId
 * @return {Object}
 */
function bindingSummaryOracle(accountId) {
  const amounts = bindingDatasetRows()
    .filter((row) => row[ONE] === accountId);
  const totalCents = amounts.reduce((sum, row) => sum + row[2], ZERO);
  return {
    accountId,
    flagged: amounts.filter((row) => row[3] === ONE).length,
    largestCents: Math.max(...amounts.map((row) => row[2])),
    meanCents: Math.round(totalCents / amounts.length),
    totalCents,
    transactions: amounts.length,
  };
}

function projectOracleFields(summary, oracle) {
  const projected = {};
  for (const key of Object.keys(oracle)) {
    projected[key] = summary?.[key];
  }
  return projected;
}

export {
  bindingDatasetRows,
  bindingSummaryOracle,
  buildObjectBody,
  canonicalBody,
  exactlyOnceViolations,
  expectedHistory,
  projectOracleFields,
  readObjectState,
  writeObjectVersion,
};
