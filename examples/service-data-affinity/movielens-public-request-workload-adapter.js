import assert from 'node:assert/strict';

import {
  BENCHMARK_DURABILITY_CONTRACT,
} from '../../test/distributed/harness/benchmark-workload-semantics-constants.js';
import {
  hasExactOwnDataKeys,
  isMissingDataValue,
  isPlainDataRecord,
  ownDataValue,
} from '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  jsonStringify,
  reflectApply,
  utilIsProxy,
} from './evidence-exact-plain-data.js';
import {
  MOVIELENS_PUBLIC_REQUEST,
  MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY,
  MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER,
  MOVIELENS_PUBLIC_REQUEST_TABLE,
  MOVIELENS_PUBLIC_REQUEST_TOP_N,
  assertMovielensPublicRequestResult,
  buildMovielensPublicRequestAccessPayload,
  buildMovielensPublicRequestBinding,
  buildMovielensPublicRequestInstallPayload,
  buildMovielensPublicRequestManifest,
  buildMovielensPublicWorkloadManifest,
} from './movielens-public-request-workload-contract.js';

const INSERT_BATCH_SIZE = 500;
const HTTP_STATUS_OK = 200;
const INPUT_ROW_COUNT_KEY = 0;
const OUTPUT_RANK_OFFSET = 1;
const MAXIMUM_RESULT_KEY_OFFSET =
  2_147_483_647 - MOVIELENS_PUBLIC_REQUEST_TOP_N;
const MAXIMUM_OPERATION_ID_BYTES = 256;
const HTTP_STATUS_UNAUTHORIZED = 401;
const COMPLETED_JOURNAL_ERROR = '{}';
const COMPLETED_JOURNAL_RESULT = jsonStringify(jsonStringify({
  body: MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY,
  headers: [[
    MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER,
    MOVIELENS_PUBLIC_REQUEST.BINDING_NAME,
  ]],
  status: HTTP_STATUS_OK,
}));
const CanonicalDate = Date;
const dateGetTime = Date.prototype.getTime;
const dateToISOString = Date.prototype.toISOString;
const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const MINIMUM_EPOCH_MILLISECONDS = 1_000_000_000_000;
const MAXIMUM_DATE_EPOCH_MILLISECONDS = 8_640_000_000_000_000;
const JOURNAL_KEYS = objectFreeze([
  'command',
  'created_at',
  'error',
  'idempotency_key',
  'operation_id',
  'result',
  'state',
  'tenant_id',
  'updated_at',
]);
const OPERATION_KEYS = Object.freeze([
  'idempotencyKey',
  'operationId',
]);
const EMPTY_ROWS = Object.freeze([]);
const TABLE_DDL = Object.freeze({
  RATINGS:
    `CREATE TABLE "${MOVIELENS_PUBLIC_REQUEST_TABLE.RATINGS}" ` +
    '(key INTEGER PRIMARY KEY, value INTEGER)',
  RESULT_MOVIES:
    `CREATE TABLE "${MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_MOVIES}" ` +
    '(key INTEGER PRIMARY KEY, value INTEGER)',
  RESULT_SCORES:
    `CREATE TABLE "${MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_SCORES}" ` +
    '(key INTEGER PRIMARY KEY, value INTEGER)',
});

function assertPorts(ports) {
  for (const operation of [
    'authenticatedPrincipal',
    'cellWitness',
    'executeSql',
    'invokeRequest',
    'probeUnauthenticated',
    'readInvocationJournal',
    'waitForReadyCell',
  ]) {
    if (typeof ports?.[operation] !== 'function') {
      throw new TypeError(`MovieLens public workload port required: ${operation}`);
    }
  }
}

function assertSqlSucceeded(result, operation) {
  if (result?.success !== true) {
    throw new Error(
      `${operation} failed: ${JSON.stringify(result)}`,
    );
  }
  return result;
}

async function executeSql(ports, statement, parameters = []) {
  return assertSqlSucceeded(
    await ports.executeSql(statement, parameters),
    statement,
  );
}

async function createWorkloadTables(ports) {
  await executeSql(ports, TABLE_DDL.RATINGS);
  await executeSql(ports, TABLE_DDL.RESULT_MOVIES);
  await executeSql(ports, TABLE_DDL.RESULT_SCORES);
}

function insertStatement(table, rows) {
  const values = rows.map(
    (row) => `(${Number(row.key)}, ${Number(row.value)})`,
  ).join(',');
  return `INSERT INTO "${table}" (key, value) VALUES ${values}`;
}

async function loadPackedRatings(ports, dataset) {
  const rows = [
    {key: INPUT_ROW_COUNT_KEY, value: dataset.cardinality},
    ...dataset.packedRows,
  ];
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE);
    await executeSql(
      ports,
      insertStatement(MOVIELENS_PUBLIC_REQUEST_TABLE.RATINGS, batch),
    );
  }
  const result = await executeSql(
    ports,
    'SELECT COUNT(*) AS row_count FROM ' +
      `"${MOVIELENS_PUBLIC_REQUEST_TABLE.RATINGS}"`,
  );
  const observed = Number(result.rows?.[0]?.row_count);
  assert.equal(observed, dataset.cardinality + OUTPUT_RANK_OFFSET);
  return Object.freeze({expected: rows.length, observed});
}

async function deployWorkload(ports, artifactReceipt) {
  const manifest =
    buildMovielensPublicRequestManifest(artifactReceipt);
  const installed = await executeSql(
    ports,
    'INSTALL SERVICE $1',
    [JSON.stringify(buildMovielensPublicRequestInstallPayload(
      manifest,
      artifactReceipt,
    ))],
  );
  const packageId = installed.rows?.[0]?.package_id;
  assert.equal(typeof packageId, 'string');
  const binding =
    buildMovielensPublicRequestBinding(packageId, manifest);
  const created = await executeSql(
    ports,
    'CREATE BINDING $1',
    [JSON.stringify(binding)],
  );
  const access = await executeSql(
    ports,
    'CONFIGURE SERVICE ACCESS $1',
    [JSON.stringify(buildMovielensPublicRequestAccessPayload())],
  );
  const readyCell = await ports.waitForReadyCell(MOVIELENS_PUBLIC_REQUEST);
  return Object.freeze({
    accessReceipt: access.rows?.[0] || null,
    binding,
    bindingReceipt: created.rows?.[0] || null,
    installReceipt: installed.rows?.[0] || null,
    manifest,
    packageId,
    readyCell,
  });
}

async function resultRows(ports, table, resultKeyOffset) {
  const upperBound =
    resultKeyOffset + MOVIELENS_PUBLIC_REQUEST_TOP_N;
  const result = await executeSql(
    ports,
    `SELECT key - ${resultKeyOffset} AS key, value FROM "${table}" ` +
      `WHERE key > ${resultKeyOffset} AND key <= ${upperBound} ` +
      'ORDER BY key',
  );
  return result.rows || EMPTY_ROWS;
}

async function readDurableResult(ports, resultKeyOffset) {
  return {
    movieRows: await resultRows(
      ports,
      MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_MOVIES,
      resultKeyOffset,
    ),
    scoreRows: await resultRows(
      ports,
      MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_SCORES,
      resultKeyOffset,
    ),
  };
}

function assertPublicResponse(response) {
  assert.equal(
    response.status,
    HTTP_STATUS_OK,
    JSON.stringify(response),
  );
  assert.equal(response.body, MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY);
  assert.equal(
    response.headers[MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER],
    MOVIELENS_PUBLIC_REQUEST.BINDING_NAME,
  );
}

function resultRowsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildDurabilityReceipt(first, replay) {
  const expected = MOVIELENS_PUBLIC_REQUEST_TOP_N * 2;
  const observed = first.movieRows.length + first.scoreRows.length;
  const replayPreserved =
    resultRowsEqual(first.movieRows, replay.movieRows) &&
    resultRowsEqual(first.scoreRows, replay.scoreRows);
  if (observed !== expected || !replayPreserved) {
    throw new Error(
      `MovieLens durable result mismatch: expected=${expected} ` +
      `observed=${observed} replayPreserved=${replayPreserved}`,
    );
  }
  return Object.freeze({
    contract: BENCHMARK_DURABILITY_CONTRACT,
    expected,
    observed,
    replayPreserved,
    status: 'pass',
  });
}

function buildOperationRequest(
  dataset,
  idempotencyKey,
  resultKeyOffset,
) {
  return Object.freeze({
    body: Object.freeze({
      resultKeyOffset,
      datasetDigest: dataset.digest,
      workloadVersion: buildMovielensPublicWorkloadManifest(dataset).version,
    }),
    idempotencyKey,
  });
}

function assertOperation(operation) {
  const idempotencyKey = isPlainDataRecord(operation) ?
    ownDataValue(operation, 'idempotencyKey') :
    null;
  const operationId = isPlainDataRecord(operation) ?
    ownDataValue(operation, 'operationId') :
    null;
  if (
    !hasExactOwnDataKeys(operation, OPERATION_KEYS) ||
    typeof idempotencyKey !== 'string' ||
    idempotencyKey.length === 0 ||
    Buffer.byteLength(idempotencyKey) > MAXIMUM_OPERATION_ID_BYTES ||
    typeof operationId !== 'string' ||
    operationId.length === 0 ||
    Buffer.byteLength(operationId) > MAXIMUM_OPERATION_ID_BYTES
  ) {
    throw new TypeError('canonical MovieLens operation identity is required');
  }
  return {idempotencyKey, operationId};
}

function assertCellProgress(before, after, increment) {
  assert.equal(after.runtime.generation, before.runtime.generation);
  assert.equal(
    after.runtime.componentInvocationCount,
    before.runtime.componentInvocationCount + increment,
  );
}

function canonicalJournalTimestamp(value) {
  if (
    typeof value !== 'number' ||
    !numberIsSafeInteger(value) ||
    value < MINIMUM_EPOCH_MILLISECONDS ||
    value > MAXIMUM_DATE_EPOCH_MILLISECONDS
  ) {
    throw new TypeError('canonical journal timestamp is required');
  }
  try {
    const date = new CanonicalDate(value);
    const timestamp = reflectApply(dateGetTime, date, []);
    const canonical = reflectApply(dateToISOString, date, []);
    if (timestamp !== value) {
      throw new TypeError('canonical journal timestamp is required');
    }
    return canonical;
  } catch {
    throw new TypeError('canonical journal timestamp is required');
  }
}

function requiredJournalText(row, key) {
  const value = ownDataValue(row, key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('completed invocation journal row is required');
  }
  return value;
}

function projectCompletedJournalRow(row) {
  if (
    !row ||
    typeof row !== 'object' ||
    utilIsProxy(row) ||
    !hasExactOwnDataKeys(row, JOURNAL_KEYS)
  ) {
    throw new TypeError('exact invocation journal row is required');
  }
  const command = requiredJournalText(row, 'command');
  const error = ownDataValue(row, 'error');
  const idempotencyKey =
    requiredJournalText(row, 'idempotency_key');
  const operationId = requiredJournalText(row, 'operation_id');
  const result = requiredJournalText(row, 'result');
  const state = requiredJournalText(row, 'state');
  const tenantId = requiredJournalText(row, 'tenant_id');
  if (
    error !== COMPLETED_JOURNAL_ERROR ||
    result !== COMPLETED_JOURNAL_RESULT ||
    state !== 'completed'
  ) {
    throw new TypeError('completed invocation journal row is required');
  }
  return objectFreeze({
    command,
    created_at:
      canonicalJournalTimestamp(ownDataValue(row, 'created_at')),
    error,
    idempotency_key: idempotencyKey,
    operation_id: operationId,
    result,
    state,
    tenant_id: tenantId,
    updated_at:
      canonicalJournalTimestamp(ownDataValue(row, 'updated_at')),
  });
}

function assertCompletedJournal(rows) {
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length, 1);
  return projectCompletedJournalRow(rows[0]);
}

function assertJournalMatchesRequest(row, requestWitness) {
  assert.equal(row.tenant_id, requestWitness.tenantId);
  assert.equal(
    row.idempotency_key,
    requestWitness.invocationIdentity,
  );
  assert.equal(row.operation_id, requestWitness.journalOperationId);
  assert.equal(row.command, requestWitness.journalCommand);
  return row;
}

async function assertNoDurableResults(ports) {
  const tableRows = {};
  let totalRows = 0;
  for (const table of [
    MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_MOVIES,
    MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_SCORES,
  ]) {
    const result = await executeSql(
      ports,
      `SELECT COUNT(*) AS row_count FROM "${table}"`,
    );
    const rowCount = Number(result.rows?.[0]?.row_count);
    assert.equal(rowCount, 0);
    tableRows[table] = rowCount;
    totalRows += rowCount;
  }
  return Object.freeze({
    tableRows: Object.freeze(tableRows),
    totalRows,
  });
}

async function assertNoDurableInvocationJournal(ports) {
  const result = await executeSql(
    ports,
    'SELECT COUNT(*) AS row_count FROM wasm_operations',
  );
  const rowCount = Number(result.rows?.[0]?.row_count);
  assert.equal(rowCount, 0);
  return rowCount;
}

async function prepareMovielensPublicRequestWorkload({
  alternative,
  artifactReceipt,
  dataset,
  ports,
}) {
  assertPorts(ports);
  if (!artifactReceipt || !dataset || !alternative) {
    throw new TypeError(
      'MovieLens artifact, dataset, and named alternative are required',
    );
  }
  await createWorkloadTables(ports);
  const inputDurability = await loadPackedRatings(ports, dataset);
  const deployment = await deployWorkload(ports, artifactReceipt);
  const workloadManifest = buildMovielensPublicWorkloadManifest(dataset);
  const unauthenticated = await ports.probeUnauthenticated(
    MOVIELENS_PUBLIC_REQUEST,
    buildOperationRequest(dataset, 'unauthenticated-probe', 0).body,
  );
  assert.equal(unauthenticated.status, HTTP_STATUS_UNAUTHORIZED);
  assert.equal(unauthenticated.body.invoked, false);
  const deniedDurability = await assertNoDurableResults(ports);
  const deniedInvocationJournalRows =
    await assertNoDurableInvocationJournal(ports);
  const authentication = Object.freeze({
    deniedStatus: unauthenticated.status,
    durableInvocationJournalRowsAfterDenial:
      deniedInvocationJournalRows,
    durableResultRowsAfterDenial: deniedDurability.totalRows,
    durableTableRowsAfterDenial: deniedDurability.tableRows,
    principal: ports.authenticatedPrincipal(),
    unauthenticatedInvoked: unauthenticated.body.invoked,
  });
  let nextResultKeyOffset = 0;
  const inFlight = new Set();

  async function executeOperationInner(operation) {
    const identity = assertOperation(operation);
    const resultKeyOffset = nextResultKeyOffset;
    if (resultKeyOffset > MAXIMUM_RESULT_KEY_OFFSET) {
      throw new RangeError('MovieLens operation result key space exhausted');
    }
    nextResultKeyOffset += MOVIELENS_PUBLIC_REQUEST_TOP_N;
    const before = await readDurableResult(ports, resultKeyOffset);
    assert.equal(before.movieRows.length, 0);
    assert.equal(before.scoreRows.length, 0);
    const cellBefore =
      await ports.cellWitness(MOVIELENS_PUBLIC_REQUEST);
    const request = buildOperationRequest(
      dataset,
      identity.idempotencyKey,
      resultKeyOffset,
    );
    const response = await ports.invokeRequest(
      MOVIELENS_PUBLIC_REQUEST,
      request,
    );
    assertPublicResponse(response);
    const cellAfter =
      await ports.cellWitness(MOVIELENS_PUBLIC_REQUEST);
    assertCellProgress(cellBefore, cellAfter, 1);
    const invocationJournal = assertJournalMatchesRequest(
      assertCompletedJournal(
        await ports.readInvocationJournal(identity.idempotencyKey),
      ),
      response.requestWitness,
    );
    const result = await readDurableResult(ports, resultKeyOffset);
    const oracle = assertMovielensPublicRequestResult({
      alternative,
      ...result,
    });
    return Object.freeze({
      cellAfter,
      cellBefore,
      idempotencyKey: identity.idempotencyKey,
      invocationJournal,
      operationId: identity.operationId,
      oracle,
      request,
      response,
      result,
      resultKeyOffset,
      semanticStatus: 'equivalent',
    });
  }

  function executeOperation(operation) {
    const promise = executeOperationInner(operation)
      .finally(() => inFlight.delete(promise));
    inFlight.add(promise);
    return promise;
  }

  async function replayOperation(operation) {
    const request = isPlainDataRecord(operation) ?
      ownDataValue(operation, 'request') :
      null;
    const resultKeyOffset = isPlainDataRecord(operation) ?
      ownDataValue(operation, 'resultKeyOffset') :
      null;
    const idempotencyKey = isPlainDataRecord(operation) ?
      ownDataValue(operation, 'idempotencyKey') :
      null;
    if (
      isMissingDataValue(request) ||
      !Number.isSafeInteger(resultKeyOffset) ||
      typeof idempotencyKey !== 'string'
    ) {
      throw new TypeError('MovieLens completed operation is required');
    }
    const cellBefore =
      await ports.cellWitness(MOVIELENS_PUBLIC_REQUEST);
    const journalBefore = assertJournalMatchesRequest(
      assertCompletedJournal(
        await ports.readInvocationJournal(idempotencyKey),
      ),
      operation.response.requestWitness,
    );
    const response = await ports.invokeRequest(
      MOVIELENS_PUBLIC_REQUEST,
      request,
    );
    assertPublicResponse(response);
    const cellAfter =
      await ports.cellWitness(MOVIELENS_PUBLIC_REQUEST);
    assertCellProgress(cellBefore, cellAfter, 0);
    const journalAfter = assertJournalMatchesRequest(
      assertCompletedJournal(
        await ports.readInvocationJournal(idempotencyKey),
      ),
      response.requestWitness,
    );
    assert.deepEqual(journalAfter, journalBefore);
    const result = await readDurableResult(
      ports,
      resultKeyOffset,
    );
    return Object.freeze({
      cellAfter,
      cellBefore,
      durability: buildDurabilityReceipt(operation.result, result),
      journalAfter,
      journalBefore,
      journalReplayPreserved: true,
      oracle: assertMovielensPublicRequestResult({
        alternative,
        ...result,
      }),
      response,
      result,
      semanticStatus: 'equivalent',
    });
  }

  async function drainOperations() {
    await Promise.allSettled([...inFlight]);
    return Object.freeze({
      inFlight: inFlight.size,
      status: inFlight.size === 0 ? 'drained' : 'ambiguous',
    });
  }

  return Object.freeze({
    authentication,
    deployment,
    drainOperations,
    executeOperation,
    inputDurability,
    replayOperation,
    timeoutSemantics: 'ambiguous_until_drain_verified',
    workloadManifest,
  });
}

async function runMovielensPublicRequestWorkload(options) {
  const prepared = options.prepared ||
    await prepareMovielensPublicRequestWorkload(options);
  const first = await prepared.executeOperation({
    idempotencyKey: options.idempotencyKey,
    operationId: 'terminal-live-operation-first',
  });
  const distinct = await prepared.executeOperation({
    idempotencyKey: `${options.idempotencyKey}-distinct`,
    operationId: 'terminal-live-operation-distinct',
  });
  const replay = await prepared.replayOperation(first);
  const drainReceipt = await prepared.drainOperations();
  const deployment = Object.freeze({
    binding: prepared.deployment.binding,
    bindingReceipt: Object.freeze({
      manifest_digest:
        prepared.deployment.bindingReceipt.manifest_digest,
    }),
    manifest: prepared.deployment.manifest,
    packageId: prepared.deployment.packageId,
    readyCell: prepared.deployment.readyCell,
  });
  return Object.freeze({
    authentication: prepared.authentication,
    deployment,
    drainReceipt,
    durability: replay.durability,
    inputDurability: prepared.inputDurability,
    operationBoundary: Object.freeze({
      authenticatedHttp:
        prepared.authentication.unauthenticatedInvoked === false,
      componentHeader:
        first.response.headers[MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER],
      distinctIdempotencyKey: distinct.idempotencyKey,
      idempotencyKey: first.idempotencyKey,
      method: MOVIELENS_PUBLIC_REQUEST.METHOD,
      path: MOVIELENS_PUBLIC_REQUEST.PATH,
      journalReplayPreserved: replay.journalReplayPreserved,
      principal: prepared.authentication.principal,
      status: first.response.status,
    }),
    oracle: first.oracle,
    journalEvidence: Object.freeze({
      distinct: distinct.invocationJournal,
      first: first.invocationJournal,
      replayAfter: replay.journalAfter,
      replayBefore: replay.journalBefore,
    }),
    repeatedOperation: Object.freeze({
      distinctDurableKeyRange: Object.freeze({
        lowerInclusive: distinct.resultKeyOffset + OUTPUT_RANK_OFFSET,
        upperInclusive:
          distinct.resultKeyOffset + MOVIELENS_PUBLIC_REQUEST_TOP_N,
      }),
      distinctOperationOracle: distinct.oracle,
      distinctOperationResultKeyOffset: distinct.resultKeyOffset,
      firstOperationResultKeyOffset: first.resultKeyOffset,
      firstInvocationCount:
        first.cellAfter.runtime.componentInvocationCount,
      generation: first.cellAfter.runtime.generation,
      distinctGeneration: distinct.cellAfter.runtime.generation,
      distinctInvocationCount:
        distinct.cellAfter.runtime.componentInvocationCount,
      replayGeneration: replay.cellAfter.runtime.generation,
      replayInvocationCount:
        replay.cellAfter.runtime.componentInvocationCount,
      sameGenerationDistinctOperationsEquivalent:
        first.cellAfter.runtime.generation ===
          distinct.cellAfter.runtime.generation &&
        distinct.cellAfter.runtime.componentInvocationCount ===
          first.cellAfter.runtime.componentInvocationCount + 1,
      semanticStatus: distinct.semanticStatus,
    }),
    requestEvidence: Object.freeze({
      distinct: distinct.response.requestWitness,
      first: first.response.requestWitness,
      replay: replay.response.requestWitness,
    }),
    responseEvidence: Object.freeze({
      distinct: distinct.response,
      first: first.response,
      replay: replay.response,
    }),
    timeoutSemantics: prepared.timeoutSemantics,
    workloadManifest: prepared.workloadManifest,
  });
}

export {
  INSERT_BATCH_SIZE,
  TABLE_DDL,
  buildDurabilityReceipt,
  buildOperationRequest,
  assertJournalMatchesRequest,
  assertOperation,
  insertStatement,
  prepareMovielensPublicRequestWorkload,
  projectCompletedJournalRow,
  runMovielensPublicRequestWorkload,
};
