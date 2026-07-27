import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify, types} from 'node:util';
import {
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isSha256Digest,
  parseBenchmarkSemanticJson,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER,
  BENCHMARK_CAPACITY_LIVE_PROVENANCE_VERSION,
  BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES,
  BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES,
  BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER,
  BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
  BENCHMARK_CAPACITY_RESET_PHASE,
} from './benchmark-capacity-protocol-constants.js';

const SCENARIO = 'benchmark-statistical-capacity-protocol';
const DOCKER_BINARY = '/usr/bin/docker';
const RECEIPT_VERSION =
  'benchmark-capacity-live-observation-receipt-v1';
const OBSERVATION_VERSION =
  'benchmark-capacity-live-observation-payload-v1';
const RECEIPT_ISSUER =
  'benchmark-capacity-managed-postgresql-observer-v1';
const OUTCOME_MARKER_PREFIX = 'LAGRANGE_CAPACITY_OUTCOME:';
const BEGIN_KEYS = [
  'runId',
  'containerId',
  'networkId',
  'networkName',
  'liveEnvironmentContractDigest',
];
const CAPTURE_KEYS = ['windowEngagements', 'resetEngagements'];
const OUTCOME_MARKER_KEYS = [
  'kind',
  'runId',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'operationIndex',
  'command',
  'rowCount',
];
const OBSERVED_SQL_KEYS = [
  'sql',
  'outcomeMarker',
  'expectedRowCount',
  'sleepSeconds',
];
const RECEIPT_KEYS = [
  'version',
  'issuer',
  'observationByteLength',
  'observationByteDigest',
  'observationText',
];
const OBSERVATION_KEYS = [
  'version',
  'liveObservation',
  'cleanupObservation',
  'containerLogText',
  'windowOperationLogs',
  'resetOperationLogs',
];
const LIVE_REQUEST_KEYS = [
  'runId',
  'containerId',
  'networkId',
  'networkName',
];
const CLEANUP_REQUEST_KEYS = [...LIVE_REQUEST_KEYS];
const WINDOW_REQUEST_KEYS = [
  'runId',
  'liveEngagementDigest',
  'capacitySampleDigest',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
];
const RESET_REQUEST_KEYS = [
  'runId',
  'liveEngagementDigest',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
];
const OPERATION_RECORD_KEYS = ['request', 'text'];
const WINDOW_ENGAGEMENT_KEYS = [
  'matrixId',
  'cellId',
  'cellManifestDigest',
  'profileIdentity',
  'pairIdentity',
  'runId',
  'liveEnvironmentContractDigest',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'startedAt',
  'endedAt',
  'observationStartedAtMs',
  'observationEndedAtMs',
  'observationDurationMs',
  'capacitySampleDigest',
  'operationLogText',
  'liveEngagementDigest',
];
const RESET_ENGAGEMENT_KEYS = [
  'matrixId',
  'cellId',
  'cellManifestDigest',
  'profileIdentity',
  'pairIdentity',
  'runId',
  'liveEnvironmentContractDigest',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'startedAt',
  'endedAt',
  'operationLogText',
  'liveEngagementDigest',
];
const WINDOW_LOG_KEYS = [
  'version',
  'issuer',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'entries',
];
const WINDOW_LOG_ENTRY_KEYS = [
  'operationIndex',
  'sql',
  'command',
  'rowCount',
];
const RESET_LOG_KEYS = [
  'version',
  'issuer',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'sql',
  'command',
  'rowCount',
];
const LIVE_OBSERVATION_KEYS = [
  'runId',
  'provider',
  'observedAt',
  'containerId',
  'containerImageId',
  'containerRunning',
  'containerLabelsDigest',
  'networkId',
  'networkName',
  'networkObservedId',
  'networkObservedName',
];
const CLEANUP_OBSERVATION_KEYS = [
  'runId',
  'liveEnvironmentContractDigest',
  'provenanceReceiptDigest',
  'provider',
  'containerId',
  'containerLookup',
  'networkId',
  'networkName',
  'networkLookup',
  'containerAbsent',
  'networkAbsent',
  'completedAt',
];
const CONTAINER_LABEL_KEYS = [
  'lagrange.proof.run',
  'lagrange.proof.scenario',
];
const sessions = new WeakMap();
const artifactAuthorizations = new WeakMap();
const MapConstructor = Map;
const SetConstructor = Set;
const mapHas = Function.call.bind(Map.prototype.has);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const arrayPush = Function.call.bind(Array.prototype.push);
const arrayJoin = Function.call.bind(Array.prototype.join);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const weakMapDelete = Function.call.bind(WeakMap.prototype.delete);
const weakMapGet = Function.call.bind(WeakMap.prototype.get);
const weakMapSet = Function.call.bind(WeakMap.prototype.set);
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const execFileAsync = promisify(execFile);
const isProxy = types.isProxy.bind(types);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const numberIsFinite = Number.isFinite;
const POSTGRESQL_MAX_SLEEP_SECONDS = 86_400;
const POSTGRESQL_SLEEP_DECIMAL_PATTERN =
  /^(?:[1-9][0-9]*|0\.[0-9]*[1-9][0-9]*)$/u;

function fail(reason) {
  throw new TypeError(
    `invalid benchmark capacity live observation receipt: ${reason}`,
  );
}

function isExactRecord(value, keys) {
  return !isProxy(value) && hasExactOwnDataKeys(value, keys);
}

function isExactArray(value) {
  return !isProxy(value) && isDenseDataArray(value);
}

function createOpaqueHandle() {
  return objectFreeze(objectCreate(null));
}

function byteDigest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assertBeginOptions(options) {
  if (
    !isExactRecord(options, BEGIN_KEYS) ||
    typeof options.runId !== 'string' ||
    options.runId.length === 0 ||
    typeof options.containerId !== 'string' ||
    options.containerId.length === 0 ||
    typeof options.networkId !== 'string' ||
    options.networkId.length === 0 ||
    typeof options.networkName !== 'string' ||
    options.networkName.length === 0 ||
    !isSha256Digest(options.liveEnvironmentContractDigest)
  ) {
    fail('exact externally backed begin options required');
  }
}

async function runDocker(args) {
  return execFileAsync(DOCKER_BINARY, args, {
    encoding: 'utf8',
    maxBuffer: BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES,
  });
}

async function inspectDockerObject(type, identity) {
  const {stdout} = await runDocker(['inspect', '--type', type, identity]);
  const parsed = jsonParse(stdout);
  if (!isExactArray(parsed) || parsed.length !== 1) {
    fail(`exact external Docker ${type} observation required`);
  }
  return parsed[0];
}

function buildLiveObservation(options, container, network) {
  const labels = container.Config?.Labels;
  if (
    !isExactRecord(labels, CONTAINER_LABEL_KEYS) ||
    labels['lagrange.proof.run'] !== options.runId ||
    labels['lagrange.proof.scenario'] !== SCENARIO ||
    container.Id !== options.containerId ||
    container.State?.Running !== true ||
    network?.Id !== options.networkId ||
    network.Name !== options.networkName
  ) {
    fail('external container or network identity mismatch');
  }
  return {
    runId: options.runId,
    provider: BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER,
    observedAt: Date.now(),
    containerId: options.containerId,
    containerImageId: container.Image,
    containerRunning: true,
    containerLabelsDigest: digestBenchmarkSemanticData(labels),
    networkId: options.networkId,
    networkName: options.networkName,
    networkObservedId: network.Id,
    networkObservedName: network.Name,
  };
}

export async function beginBenchmarkCapacityLiveObservation(options) {
  assertBeginOptions(options);
  const container = await inspectDockerObject(
    'container',
    options.containerId,
  );
  const network = await inspectDockerObject(
    'network',
    options.networkName,
  );
  const liveObservation = buildLiveObservation(options, container, network);
  const session = createOpaqueHandle();
  weakMapSet(sessions, session, {
    ...options,
    liveObservation,
    captured: false,
    finalizing: false,
    containerLogText: null,
    windowLogs: new MapConstructor(),
    resetLogs: new MapConstructor(),
  });
  return session;
}

function parseExternallyLoggedOperation(text, keys) {
  const parsed = parseBenchmarkSemanticJson(text);
  if (
    !isExactRecord(parsed, keys) ||
    parsed.version !== BENCHMARK_CAPACITY_OPERATION_LOG_VERSION ||
    parsed.issuer !==
      BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.MANAGED_POSTGRESQL ||
    jsonStringify(parsed) !== text
  ) {
    fail('exact managed PostgreSQL operation log required');
  }
  return parsed;
}

function coordinatesMatch(log, engagement) {
  return log.blockIndex === engagement.blockIndex &&
    log.blockedOrderIndex === engagement.blockedOrderIndex &&
    log.sideId === engagement.sideId &&
    log.phase === engagement.phase &&
    log.offeredLoad === engagement.offeredLoad;
}

function outcomeMarkerFieldsAreValid(input) {
  return (input.kind === 'window' || input.kind === 'reset') &&
    typeof input.runId === 'string' &&
    typeof input.sideId === 'string' &&
    typeof input.phase === 'string' &&
    typeof input.command === 'string' &&
    isNonNegativeSafeInteger(input.blockIndex) &&
    isNonNegativeSafeInteger(input.blockedOrderIndex) &&
    isNonNegativeSafeInteger(input.offeredLoad) &&
    (
      input.operationIndex === null ||
      isNonNegativeSafeInteger(input.operationIndex)
    ) &&
    isNonNegativeSafeInteger(input.rowCount);
}

export function createBenchmarkCapacityPostgresqlOutcomeMarker(input) {
  if (
    !isExactRecord(input, OUTCOME_MARKER_KEYS) ||
    !outcomeMarkerFieldsAreValid(input)
  ) {
    fail('exact PostgreSQL outcome marker input required');
  }
  return `${OUTCOME_MARKER_PREFIX}${jsonStringify(input)}`;
}

function observedSqlStringsAreValid(input) {
  return typeof input.sql === 'string' &&
    input.sql.length > 0 &&
    input.sql.length <= BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES &&
    stringIndexOf(input.sql, '\n', 0) === -1 &&
    stringIndexOf(input.sql, '\r', 0) === -1 &&
    typeof input.outcomeMarker === 'string' &&
    stringIndexOf(input.outcomeMarker, '\n', 0) === -1 &&
    stringIndexOf(input.outcomeMarker, '\r', 0) === -1 &&
    stringIndexOf(
      input.outcomeMarker,
      OUTCOME_MARKER_PREFIX,
      0,
    ) === 0;
}

function canonicalSleepSecondsText(value) {
  if (value === null) return '';
  if (
    typeof value !== 'number' ||
    !numberIsFinite(value) ||
    value <= 0 ||
    value > POSTGRESQL_MAX_SLEEP_SECONDS
  ) return null;
  const text = `${value}`;
  return regexpExec(POSTGRESQL_SLEEP_DECIMAL_PATTERN, text) === null ?
    null :
    text;
}

export function createBenchmarkCapacityPostgresqlObservedSql(input) {
  const sleepSecondsText = isExactRecord(input, OBSERVED_SQL_KEYS) ?
    canonicalSleepSecondsText(input.sleepSeconds) :
    null;
  if (
    sleepSecondsText === null ||
    !observedSqlStringsAreValid(input) ||
    !isNonNegativeSafeInteger(input.expectedRowCount)
  ) {
    fail('exact PostgreSQL observed SQL input required');
  }
  const sleepStatement = input.sleepSeconds === null ?
    '' :
    `  PERFORM pg_sleep(${sleepSecondsText});\n`;
  return 'DO $lagrange_operation$\n' +
    'DECLARE affected BIGINT;\n' +
    'BEGIN\n' +
    `  ${input.sql};\n` +
    '  GET DIAGNOSTICS affected = ROW_COUNT;\n' +
    `  IF affected <> ${input.expectedRowCount} THEN\n` +
    '    RAISE EXCEPTION \'unexpected affected row count: %\', affected;\n' +
    '  END IF;\n' +
    sleepStatement +
    `  RAISE LOG '%', $lagrange_outcome$${input.outcomeMarker}` +
      '$lagrange_outcome$;\n' +
    'END;\n' +
    '$lagrange_operation$;';
}

function outcomeMarker(kind, engagement, entry) {
  return createBenchmarkCapacityPostgresqlOutcomeMarker({
    kind,
    runId: engagement.runId,
    blockIndex: engagement.blockIndex,
    blockedOrderIndex: engagement.blockedOrderIndex,
    sideId: engagement.sideId,
    phase: engagement.phase,
    offeredLoad: engagement.offeredLoad,
    operationIndex: entry.operationIndex,
    command: entry.command,
    rowCount: entry.rowCount,
  });
}

function postgresqlLogRecordStarts(text) {
  const starts = [];
  const expression =
    /(?:^|\n)(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.[0-9]{3} UTC \[[1-9][0-9]*\] ([A-Z]+): {2})/gu;
  let match = regexpExec(expression, text);
  while (match !== null) {
    arrayPush(starts, {
      prefixStart: match.index + (match[0][0] === '\n' ? 1 : 0),
      payloadStart: match.index + match[0].length,
      level: match[2],
    });
    match = regexpExec(expression, text);
  }
  return starts;
}

function parsePostgresqlLogRecords(text) {
  if (
    typeof text !== 'string' ||
    text.length === 0 ||
    text[text.length - 1] !== '\n' ||
    bufferByteLength(text, 'utf8') > BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES
  ) {
    fail('bounded newline-terminated PostgreSQL log required');
  }
  const starts = postgresqlLogRecordStarts(text);
  const records = [];
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ?
      starts[index + 1].prefixStart - 1 :
      text.length - 1;
    if (end < starts[index].payloadStart) {
      fail('ambiguous PostgreSQL log record boundary');
    }
    arrayPush(records, {
      index,
      level: starts[index].level,
      payload: stringSlice(text, starts[index].payloadStart, end),
    });
  }
  return records;
}

function canonicalizePostgresqlStatementText(text) {
  if (
    typeof text !== 'string' ||
    stringIndexOf(text, '\r', 0) !== -1
  ) return null;
  const lines = stringSplit(text, '\n');
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index][0] === '\t') {
      lines[index] = stringSlice(lines[index], 1);
    }
  }
  return arrayJoin(lines, '\n');
}

function observedSqlInspection(text) {
  const canonical = canonicalizePostgresqlStatementText(text);
  if (canonical === null) return null;
  const match = regexpExec(
    /^DO \$lagrange_operation\$\nDECLARE affected BIGINT;\nBEGIN\n {2}([^\r\n]+);\n {2}GET DIAGNOSTICS affected = ROW_COUNT;\n {2}IF affected <> (0|[1-9][0-9]*) THEN\n {4}RAISE EXCEPTION 'unexpected affected row count: %', affected;\n {2}END IF;\n(?: {2}PERFORM pg_sleep\(([0-9]+(?:\.[0-9]+)?)\);\n)? {2}RAISE LOG '%', \$lagrange_outcome\$(LAGRANGE_CAPACITY_OUTCOME:\{[^\r\n]+\})\$lagrange_outcome\$;\nEND;\n\$lagrange_operation\$;$/u,
    canonical,
  );
  if (match === null) return null;
  const markerText = match[4];
  const marker = parseBenchmarkSemanticJson(
    stringSlice(markerText, OUTCOME_MARKER_PREFIX.length),
  );
  const expectedRowCount = Number(match[2]);
  const sleepSeconds = match[3] === undefined ? null : Number(match[3]);
  if (
    !isExactRecord(marker, OUTCOME_MARKER_KEYS) ||
    !outcomeMarkerFieldsAreValid(marker) ||
    marker.rowCount !== expectedRowCount
  ) return null;
  const regenerated = createBenchmarkCapacityPostgresqlObservedSql({
    sql: match[1],
    outcomeMarker: markerText,
    expectedRowCount,
    sleepSeconds,
  });
  return regenerated === canonical ?
    {canonical, marker, markerText} :
    null;
}

function statementPayload(record) {
  const prefixes = ['statement: ', 'execute <unnamed>: '];
  if (record.level !== 'LOG') return null;
  for (let index = 0; index < prefixes.length; index += 1) {
    if (stringIndexOf(record.payload, prefixes[index], 0) === 0) {
      return stringSlice(record.payload, prefixes[index].length);
    }
  }
  return null;
}

function addIndexedRecord(index, key, record) {
  if (!mapHas(index, key)) {
    mapSet(index, key, [record]);
    return;
  }
  arrayPush(mapGet(index, key), record);
}

function indexPostgresqlRecords(records) {
  const statements = new MapConstructor();
  const outcomes = new MapConstructor();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const payload = statementPayload(record);
    if (payload !== null) {
      const inspection = observedSqlInspection(payload);
      if (inspection !== null) {
        addIndexedRecord(statements, inspection.canonical, {
          index,
          markerText: inspection.markerText,
        });
      }
    }
    if (
      record.level === 'LOG' &&
      stringIndexOf(record.payload, OUTCOME_MARKER_PREFIX, 0) === 0
    ) {
      addIndexedRecord(outcomes, record.payload, {index});
    }
  }
  return {statements, outcomes};
}

function consumeUniqueIndexedRecord(index, key, consumed, reason) {
  if (!mapHas(index, key)) fail(reason);
  const matches = mapGet(index, key);
  if (matches.length !== 1) fail(`${reason}:duplicate`);
  const record = matches[0];
  if (setHas(consumed, record.index)) fail(reason);
  setAdd(consumed, record.index);
  return record;
}

function consumeExternalSqlOutcome(
  recordIndex,
  engagement,
  entry,
  consumed,
  kind,
) {
  if (typeof entry.sql !== 'string' || entry.sql.length === 0) {
    fail('operation SQL text required');
  }
  const expectedMarker = outcomeMarker(kind, engagement, entry);
  const statement = consumeUniqueIndexedRecord(
    recordIndex.statements,
    entry.sql,
    consumed,
    'operation SQL lacks distinct PostgreSQL statement record',
  );
  if (statement.markerText !== expectedMarker) {
    fail('operation PostgreSQL statement marker mismatch');
  }
  const outcome = consumeUniqueIndexedRecord(
    recordIndex.outcomes,
    expectedMarker,
    consumed,
    'operation lacks distinct PostgreSQL outcome record',
  );
  if (outcome.index <= statement.index) {
    fail('PostgreSQL outcome record precedes its statement');
  }
}

function assertWindowEntry(entry, seenIndexes) {
  if (
    !isExactRecord(entry, WINDOW_LOG_ENTRY_KEYS) ||
    !isNonNegativeSafeInteger(entry.operationIndex) ||
    setHas(seenIndexes, entry.operationIndex) ||
    entry.command !== 'INSERT' ||
    entry.rowCount !== 1
  ) {
    fail('exact distinct successful window operation required');
  }
  setAdd(seenIndexes, entry.operationIndex);
}

function windowLogRecord(engagement, recordIndex, consumed) {
  if (!isExactRecord(engagement, WINDOW_ENGAGEMENT_KEYS)) {
    fail('exact window engagement required');
  }
  const log = parseExternallyLoggedOperation(
    engagement.operationLogText,
    WINDOW_LOG_KEYS,
  );
  if (
    !coordinatesMatch(log, engagement) ||
    !isExactArray(log.entries)
  ) {
    fail('window operation coordinates or entries invalid');
  }
  const seenIndexes = new SetConstructor();
  for (let index = 0; index < log.entries.length; index += 1) {
    const entry = log.entries[index];
    assertWindowEntry(entry, seenIndexes);
    consumeExternalSqlOutcome(
      recordIndex,
      engagement,
      entry,
      consumed,
      'window',
    );
  }
  return {
    request: {
      runId: engagement.runId,
      liveEngagementDigest: engagement.liveEngagementDigest,
      capacitySampleDigest: engagement.capacitySampleDigest,
      blockIndex: engagement.blockIndex,
      blockedOrderIndex: engagement.blockedOrderIndex,
      sideId: engagement.sideId,
      phase: engagement.phase,
      offeredLoad: engagement.offeredLoad,
    },
    text: engagement.operationLogText,
  };
}

function resetLogRecord(engagement, recordIndex, consumed) {
  if (!isExactRecord(engagement, RESET_ENGAGEMENT_KEYS)) {
    fail('exact reset engagement required');
  }
  const log = parseExternallyLoggedOperation(
    engagement.operationLogText,
    RESET_LOG_KEYS,
  );
  if (
    log.phase !== BENCHMARK_CAPACITY_RESET_PHASE ||
    !coordinatesMatch(log, engagement) ||
    log.command !== 'TRUNCATE' ||
    log.rowCount !== 0
  ) {
    fail('exact successful reset outcome required');
  }
  consumeExternalSqlOutcome(
    recordIndex,
    engagement,
    {...log, operationIndex: null},
    consumed,
    'reset',
  );
  return {
    request: {
      runId: engagement.runId,
      liveEngagementDigest: engagement.liveEngagementDigest,
      blockIndex: engagement.blockIndex,
      blockedOrderIndex: engagement.blockedOrderIndex,
      sideId: engagement.sideId,
      phase: engagement.phase,
      offeredLoad: engagement.offeredLoad,
    },
    text: engagement.operationLogText,
  };
}

function captureRecords(
  engagements,
  recordBuilder,
  recordIndex,
  consumed,
) {
  if (!isExactArray(engagements)) {
    fail('dense engagement collection required');
  }
  const digests = new SetConstructor();
  const records = [];
  for (let index = 0; index < engagements.length; index += 1) {
    const record = recordBuilder(
      engagements[index],
      recordIndex,
      consumed,
    );
    const digest = record.request.liveEngagementDigest;
    if (setHas(digests, digest)) fail('duplicate live engagement digest');
    setAdd(digests, digest);
    arrayPush(records, record);
  }
  return records;
}

function captureObservedOperationCollections(options, containerLogText) {
  if (
    !isExactRecord(options, CAPTURE_KEYS) ||
    typeof containerLogText !== 'string' ||
    bufferByteLength(containerLogText, 'utf8') >
      BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES
  ) {
    fail('exact bounded operation capture input required');
  }
  const records = parsePostgresqlLogRecords(containerLogText);
  const recordIndex = indexPostgresqlRecords(records);
  const consumedRecords = new SetConstructor();
  const windowLogs = captureRecords(
    options.windowEngagements,
    windowLogRecord,
    recordIndex,
    consumedRecords,
  );
  const resetLogs = captureRecords(
    options.resetEngagements,
    resetLogRecord,
    recordIndex,
    consumedRecords,
  );
  return {windowLogs, resetLogs};
}

export function inspectBenchmarkCapacityExternalOperationOccurrences(
  options,
  containerLogText,
) {
  try {
    captureObservedOperationCollections(options, containerLogText);
    return {valid: true, reason: 'valid'};
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : 'invalid_observation',
    };
  }
}

export async function captureBenchmarkCapacityLiveOperations(
  session,
  options,
) {
  const state = weakMapGet(sessions, session);
  if (
    state === undefined ||
    state.captured ||
    !isExactRecord(options, CAPTURE_KEYS)
  ) {
    fail('active session and exact capture options required');
  }
  const logs = await runDocker(['logs', state.containerId]);
  const containerLogText = `${logs.stdout}${logs.stderr}`;
  const captured =
    captureObservedOperationCollections(options, containerLogText);
  state.windowLogs = captured.windowLogs;
  state.resetLogs = captured.resetLogs;
  state.containerLogText = containerLogText;
  state.captured = true;
  return containerLogText;
}

async function containerIsExternallyAbsent(containerId) {
  const {stdout} = await runDocker([
    'ps',
    '-a',
    '--no-trunc',
    '--filter',
    `id=${containerId}`,
    '--format',
    '{{.ID}}',
  ]);
  return stringTrim(stdout).length === 0;
}

async function networkIsExternallyAbsent(networkName) {
  const {stdout} = await runDocker([
    'network',
    'ls',
    '--no-trunc',
    '--filter',
    `name=^${networkName}$`,
    '--format',
    '{{.ID}} {{.Name}}',
  ]);
  return stringTrim(stdout).length === 0;
}

function provenanceReceiptDigest(liveObservation) {
  return digestBenchmarkSemanticData({
    version: BENCHMARK_CAPACITY_LIVE_PROVENANCE_VERSION,
    ...liveObservation,
  });
}

function createObservationReceipt(observation) {
  const observationText = jsonStringify(observation);
  const bytes = bufferFrom(observationText, 'utf8');
  if (bytes.byteLength > BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES) {
    fail('durable observation payload exceeds artifact byte bound');
  }
  return objectFreeze({
    version: RECEIPT_VERSION,
    issuer: RECEIPT_ISSUER,
    observationByteLength: bytes.byteLength,
    observationByteDigest: byteDigest(bytes),
    observationText,
  });
}

export function claimBenchmarkCapacityLiveObservationFinalization(state) {
  if (
    !state ||
    state.captured !== true ||
    state.finalizing === true
  ) return false;
  state.finalizing = true;
  return true;
}

export async function finalizeBenchmarkCapacityLiveObservation(session) {
  const state = weakMapGet(sessions, session);
  if (
    state === undefined ||
    !claimBenchmarkCapacityLiveObservationFinalization(state)
  ) {
    fail('captured active session required');
  }
  try {
    const containerAbsent =
      await containerIsExternallyAbsent(state.containerId);
    const networkAbsent =
      await networkIsExternallyAbsent(state.networkName);
    if (!containerAbsent || !networkAbsent) {
      fail('external cleanup absence required');
    }
    const receipt = createObservationReceipt({
      version: OBSERVATION_VERSION,
      liveObservation: state.liveObservation,
      cleanupObservation: {
        runId: state.runId,
        liveEnvironmentContractDigest: state.liveEnvironmentContractDigest,
        provenanceReceiptDigest:
          provenanceReceiptDigest(state.liveObservation),
        provider: BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER,
        containerId: state.containerId,
        containerLookup: 'absent',
        networkId: state.networkId,
        networkName: state.networkName,
        networkLookup: 'absent',
        containerAbsent: true,
        networkAbsent: true,
        completedAt: Date.now(),
      },
      containerLogText: state.containerLogText,
      windowOperationLogs: state.windowLogs,
      resetOperationLogs: state.resetLogs,
    });
    const authorization = createOpaqueHandle();
    weakMapSet(artifactAuthorizations, authorization, {
      receiptDigest: digestBenchmarkSemanticData(receipt),
    });
    weakMapDelete(sessions, session);
    return objectFreeze({authorization, receipt});
  } catch (error) {
    state.finalizing = false;
    throw error;
  }
}

function exactOperationRecords(records, requestKeys) {
  if (!isExactArray(records)) return false;
  const digests = new SetConstructor();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (
      !isExactRecord(record, OPERATION_RECORD_KEYS) ||
      !isExactRecord(record.request, requestKeys) ||
      typeof record.text !== 'string' ||
      setHas(digests, record.request.liveEngagementDigest)
    ) return false;
    setAdd(digests, record.request.liveEngagementDigest);
  }
  return true;
}

function observationLogBytesAreBounded(observation) {
  let total = bufferByteLength(observation.containerLogText, 'utf8');
  const collections = [
    observation.windowOperationLogs,
    observation.resetOperationLogs,
  ];
  for (let collectionIndex = 0;
    collectionIndex < collections.length;
    collectionIndex += 1) {
    const records = collections[collectionIndex];
    for (let index = 0; index < records.length; index += 1) {
      total += bufferByteLength(records[index].text, 'utf8');
      if (total > BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES) return false;
    }
  }
  return true;
}

function observationShapeIsValid(observation) {
  return isExactRecord(observation, OBSERVATION_KEYS) &&
    isExactRecord(observation.liveObservation, LIVE_OBSERVATION_KEYS) &&
    isExactRecord(observation.cleanupObservation, CLEANUP_OBSERVATION_KEYS) &&
    typeof observation.containerLogText === 'string' &&
    bufferByteLength(observation.containerLogText, 'utf8') <=
      BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES &&
    exactOperationRecords(
      observation.windowOperationLogs,
      WINDOW_REQUEST_KEYS,
    ) &&
    exactOperationRecords(
      observation.resetOperationLogs,
      RESET_REQUEST_KEYS,
    ) &&
    observationLogBytesAreBounded(observation);
}

function receiptMetadataIsValid(receipt) {
  return receipt.version === RECEIPT_VERSION &&
    receipt.issuer === RECEIPT_ISSUER &&
    isNonNegativeSafeInteger(receipt.observationByteLength) &&
    receipt.observationByteLength > 0 &&
    receipt.observationByteLength <= BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES &&
    isSha256Digest(receipt.observationByteDigest) &&
    typeof receipt.observationText === 'string';
}

function receiptBytesAreValid(receipt, bytes) {
  return bytes.byteLength === receipt.observationByteLength &&
    byteDigest(bytes) === receipt.observationByteDigest;
}

function receiptState(receipt) {
  if (!isExactRecord(receipt, RECEIPT_KEYS)) {
    fail('exact durable receipt required');
  }
  if (!receiptMetadataIsValid(receipt)) {
    fail('durable receipt metadata invalid');
  }
  const text = receipt.observationText;
  const bytes = bufferFrom(text, 'utf8');
  if (!receiptBytesAreValid(receipt, bytes)) {
    fail('durable receipt byte binding invalid');
  }
  const observation = parseBenchmarkSemanticJson(text);
  if (
    jsonStringify(observation) !== text ||
    !observationShapeIsValid(observation) ||
    observation.version !== OBSERVATION_VERSION
  ) {
    fail('canonical durable observation payload required');
  }
  return observation;
}

export function consumeBenchmarkCapacityLiveArtifactAuthorization(
  authorization,
  receipt,
) {
  const authorizationState =
    weakMapGet(artifactAuthorizations, authorization);
  if (authorizationState === undefined) {
    fail('unused live artifact authorization required');
  }
  receiptState(receipt);
  if (
    digestBenchmarkSemanticData(receipt) !==
      authorizationState.receiptDigest
  ) {
    fail('live artifact authorization receipt mismatch');
  }
  weakMapDelete(artifactAuthorizations, authorization);
}

export function resolveBenchmarkCapacityLiveObservationPayload(receipt) {
  return receiptState(receipt);
}

function assertExactRequest(request, keys) {
  if (!isExactRecord(request, keys)) {
    fail('exact receipt resolution request required');
  }
}

function requestMatches(expected, actual, keys) {
  for (let index = 0; index < keys.length; index += 1) {
    if (expected[keys[index]] !== actual[keys[index]]) return false;
  }
  return true;
}

export function resolveBenchmarkCapacityLiveObservation(receipt, request) {
  assertExactRequest(request, LIVE_REQUEST_KEYS);
  const observation = receiptState(receipt).liveObservation;
  if (!requestMatches(observation, request, LIVE_REQUEST_KEYS)) {
    fail('live observation request identity mismatch');
  }
  return {...observation};
}

export function resolveBenchmarkCapacityCleanupObservation(
  receipt,
  request,
) {
  assertExactRequest(request, CLEANUP_REQUEST_KEYS);
  const observation = receiptState(receipt).cleanupObservation;
  if (!requestMatches(observation, request, CLEANUP_REQUEST_KEYS)) {
    fail('cleanup observation request identity mismatch');
  }
  return {...observation};
}

export function resolveBenchmarkCapacityContainerLogText(receipt) {
  return receiptState(receipt).containerLogText;
}
