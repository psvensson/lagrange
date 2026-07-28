import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {
  isDenseDataArray,
  isMissingDataValue,
  isPlainDataRecord,
  ownDataValue,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceDigest,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceText,
} from './benchmark-resource-evidence-data.js';
import {
  COMPARATIVE_CLAIM_EFFECT_OUTCOME,
  COMPARATIVE_CLAIM_METRIC,
  COMPARATIVE_CLAIM_PROJECTION_SCHEMA_VERSION,
  COMPARATIVE_CLAIM_PROFILE_STATE,
  COMPARATIVE_CLAIM_SOURCE_STATE,
  COMPARATIVE_CLAIM_SUBJECT_KIND,
} from './comparative-efficiency-claim-projection-constants.js';
import {
  COMPARATIVE_EVIDENCE_CLASS,
} from './comparative-efficiency-evidence-contract.js';
import {
  inspectBenchmarkResourceMeasurementOutcome,
} from './benchmark-resource-measurement-outcome.js';

const arrayIsArray = Array.isArray;
const arrayJoinMethod = Array.prototype.join;
const isProxy = types.isProxy;
const jsonStringify = JSON.stringify;
const mathAbs = Math.abs;
const numberIsFinite = Number.isFinite;
const objectIs = Object.is;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectIsFrozen = Object.isFrozen;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const setAdd = Function.call.bind(Set.prototype.add);
const setDelete = Function.call.bind(Set.prototype.delete);
const setHas = Function.call.bind(Set.prototype.has);
const stringReplaceMethod = String.prototype.replace;
const structuredCloneValue = globalThis.structuredClone;
const maximumSafeMagnitude = Number.MAX_SAFE_INTEGER;
const maximumClaimDataDepth = 64;
const maximumClaimDataNodes = 100_000;
const maximumReasonCodes = 64;
const sha256 = 'sha256';
const sha256Encoding = 'hex';
const sha256Prefix = 'sha256:';
const pipePattern = /\|/gu;
const tableBodyKeys = Object.freeze([
  'schemaVersion',
  'evaluatedAt',
  'rows',
]);
const tableKeys = Object.freeze([...tableBodyKeys, 'tableDigest']);
const rowKeys = Object.freeze([
  'rowId',
  'workloadId',
  'metric',
  'profile',
  'subject',
  'evidenceClass',
  'outcome',
  'evidence',
  'source',
  'reasonCodes',
  'statement',
]);
const rowBodyKeys = Object.freeze(rowKeys.filter((key) => key !== 'rowId'));
const dataValueKey = 'value';
const evidenceClasses = new Set(Object.values(COMPARATIVE_EVIDENCE_CLASS));
const outcomes = new Set(Object.values(COMPARATIVE_CLAIM_EFFECT_OUTCOME));
const metrics = new Set(Object.values(COMPARATIVE_CLAIM_METRIC));
const profileStates = new Set(Object.values(COMPARATIVE_CLAIM_PROFILE_STATE));
const sourceStates = new Set(Object.values(COMPARATIVE_CLAIM_SOURCE_STATE));
const subjectKinds = new Set(Object.values(COMPARATIVE_CLAIM_SUBJECT_KIND));
const localText = Object.freeze({
  CLAIM_DATA_CYCLE: 'claimData:cycle',
  CLAIM_DATA_DENSE_ARRAY_REQUIRED: 'claimData:dense_array_required',
  CLAIM_DATA_DEPTH_LIMIT: 'claimData:depth_limit',
  CLAIM_DATA_NODE_LIMIT: 'claimData:node_limit',
  CLAIM_DATA_OWN_DATA_REQUIRED: 'claimData:own_data_required',
  CLAIM_DATA_PLAIN_DATA_REQUIRED: 'claimData:plain_data_required',
  CLAIM_DATA_PLAIN_RECORD_REQUIRED: 'claimData:plain_record_required',
  CLAIM_TABLE: 'claimTable',
  CLAIM_TABLE_DIGEST_MISMATCH: 'claimTable:digest_mismatch',
  CLAIM_TABLE_ROW: 'claimTable.row',
  CLAIM_TABLE_ROW_DIGEST_MISMATCH: 'claimTable.row:digest_mismatch',
  CLAIM_TABLE_ROW_ENUM_INVALID: 'claimTable.row:enum_invalid',
  MEASUREMENT_OUTCOME: 'measurementOutcome',
  CLAIM_TABLE_ROW_PROFILE: 'claimTable.row.profile',
  CLAIM_TABLE_ROW_PROFILE_ID: 'claimTable.row.profile.id',
  CLAIM_TABLE_ROW_PROFILE_IDENTITY: 'claimTable.row.profile.identity',
  CLAIM_TABLE_ROW_PROFILE_STATE_INVALID:
    'claimTable.row.profile:state_invalid',
  CLAIM_TABLE_ROW_REASON_CODES: 'claimTable.row.reasonCodes',
  CLAIM_TABLE_ROW_ROW_ID: 'claimTable.row.rowId',
  CLAIM_TABLE_ROW_STATEMENT: 'claimTable.row.statement',
  CLAIM_TABLE_ROW_WORKLOAD_ID: 'claimTable.row.workloadId',
  CLAIM_TABLE_SCHEMA_INVALID: 'claimTable:schema_invalid',
  CLAIM_TABLE_TABLE_DIGEST: 'claimTable.tableDigest',
  CLAIM_TABLE_VALIDATION_FAILED_CLOSED:
    'claimTable:validation_failed_closed',
  LINE_FEED: '\n',
  MARKDOWN_PIPE_ESCAPE: '\\|',
  VALID: 'valid',
});
const serializationText = Object.freeze({
  COMMA: ',',
  FALSE: 'false',
  NULL: 'null',
  TRUE: 'true',
});

function appendOwnArrayValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function joinArray(values, separator) {
  return reflectApply(arrayJoinMethod, values, [separator]);
}

function claimScalar(value) {
  return value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (
      typeof value === 'number' &&
      numberIsFinite(value) &&
      mathAbs(value) <= maximumSafeMagnitude &&
      !objectIs(value, -0)
    );
}

function assertClaimChild(item, state, depth) {
  if (isMissingDataValue(item)) {
    throw new TypeError(localText.CLAIM_DATA_OWN_DATA_REQUIRED);
  }
  assertClaimCanonicalNode(item, state, depth);
}

function assertClaimChildren(value, state, depth) {
  if (arrayIsArray(value)) {
    if (!isDenseDataArray(value)) {
      throw new TypeError(localText.CLAIM_DATA_DENSE_ARRAY_REQUIRED);
    }
    for (let index = 0; index < value.length; index += 1) {
      assertClaimChild(ownDataValue(value, `${index}`), state, depth);
    }
    return;
  }
  if (!isPlainDataRecord(value)) {
    throw new TypeError(localText.CLAIM_DATA_PLAIN_RECORD_REQUIRED);
  }
  const keys = objectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    assertClaimChild(ownDataValue(value, keys[index]), state, depth);
  }
}

function assertClaimCanonicalNode(value, state, depth) {
  if (depth > maximumClaimDataDepth) {
    throw new TypeError(localText.CLAIM_DATA_DEPTH_LIMIT);
  }
  state.nodes += 1;
  if (state.nodes > maximumClaimDataNodes) {
    throw new TypeError(localText.CLAIM_DATA_NODE_LIMIT);
  }
  if (claimScalar(value)) return;
  if (!value || typeof value !== 'object' || isProxy(value)) {
    throw new TypeError(localText.CLAIM_DATA_PLAIN_DATA_REQUIRED);
  }
  if (setHas(state.ancestors, value)) {
    throw new TypeError(localText.CLAIM_DATA_CYCLE);
  }
  setAdd(state.ancestors, value);
  assertClaimChildren(value, state, depth + 1);
  setDelete(state.ancestors, value);
}

function assertClaimCanonicalData(value) {
  assertClaimCanonicalNode(value, {ancestors: new Set(), nodes: 0}, 0);
}

function sortedKeys(value) {
  const keys = objectKeys(value);
  for (let index = 1; index < keys.length; index += 1) {
    const current = keys[index];
    let insertionIndex = index;
    while (
      insertionIndex > 0 &&
      keys[insertionIndex - 1] > current
    ) {
      keys[insertionIndex] = keys[insertionIndex - 1];
      insertionIndex -= 1;
    }
    keys[insertionIndex] = current;
  }
  return keys;
}

function serializeClaimData(value) {
  if (value === null) return serializationText.NULL;
  if (typeof value === 'string') return jsonStringify(value);
  if (typeof value === 'boolean') {
    return value ? serializationText.TRUE : serializationText.FALSE;
  }
  if (typeof value === 'number') return `${value}`;
  if (arrayIsArray(value)) {
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      appendOwnArrayValue(items, serializeClaimData(value[index]));
    }
    return `[${joinArray(items, serializationText.COMMA)}]`;
  }
  const fields = [];
  const keys = sortedKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    appendOwnArrayValue(
      fields,
      `${jsonStringify(keys[index])}:` +
      serializeClaimData(value[keys[index]]),
    );
  }
  return `{${joinArray(fields, serializationText.COMMA)}}`;
}

function digestClaimData(value) {
  assertClaimCanonicalData(value);
  return sha256Prefix +
    createHash(sha256)
      .update(serializeClaimData(value))
      .digest(sha256Encoding);
}

function safeValidationError(error) {
  try {
    if (!error || typeof error !== 'object') {
      return localText.CLAIM_TABLE_VALIDATION_FAILED_CLOSED;
    }
    const descriptor = objectGetOwnPropertyDescriptor(error, 'message');
    return descriptor && objectHasOwn(descriptor, dataValueKey) &&
      typeof descriptor.value === 'string' ?
      descriptor.value :
      localText.CLAIM_TABLE_VALIDATION_FAILED_CLOSED;
  } catch {
    return localText.CLAIM_TABLE_VALIDATION_FAILED_CLOSED;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || objectIsFrozen(value)) {
    return value;
  }
  objectFreeze(value);
  const keys = objectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    deepFreeze(value[keys[index]]);
  }
  return value;
}

export function createComparativeEfficiencyClaimRow(input) {
  assertClaimCanonicalData(input);
  const body = structuredCloneValue(input);
  return deepFreeze({
    rowId: digestClaimData(body),
    ...body,
  });
}

export function createComparativeEfficiencyClaimTable(evaluatedAt, rows) {
  const body = {
    schemaVersion: COMPARATIVE_CLAIM_PROJECTION_SCHEMA_VERSION,
    evaluatedAt,
    rows: structuredCloneValue(rows),
  };
  assertClaimCanonicalData(body);
  return deepFreeze({
    ...body,
    tableDigest: digestClaimData(body),
  });
}

function rowDigestMatches(row) {
  if (!row || typeof row !== 'object') return false;
  const body = {};
  for (let index = 0; index < rowBodyKeys.length; index += 1) {
    const key = rowBodyKeys[index];
    body[key] = row[key];
  }
  return row.rowId === digestClaimData(body);
}

function validateProfile(profile) {
  const state = ownDataValue(profile, 'state');
  if (!setHas(profileStates, state)) {
    throw new TypeError(localText.CLAIM_TABLE_ROW_PROFILE_STATE_INVALID);
  }
  const keys = state === COMPARATIVE_CLAIM_PROFILE_STATE.IDENTIFIED ?
    ['state', 'id', 'identity'] :
    ['state'];
  assertBenchmarkResourceExactRecord(
    profile,
    keys,
    localText.CLAIM_TABLE_ROW_PROFILE,
  );
  if (state === COMPARATIVE_CLAIM_PROFILE_STATE.IDENTIFIED) {
    assertBenchmarkResourceText(
      profile.id,
      localText.CLAIM_TABLE_ROW_PROFILE_ID,
    );
    assertBenchmarkResourceDigest(
      profile.identity,
      localText.CLAIM_TABLE_ROW_PROFILE_IDENTITY,
    );
  }
}

function validateRow(row) {
  assertBenchmarkResourceExactRecord(row, rowKeys, localText.CLAIM_TABLE_ROW);
  assertBenchmarkResourceDigest(
    row.rowId,
    localText.CLAIM_TABLE_ROW_ROW_ID,
  );
  assertBenchmarkResourceText(
    row.workloadId,
    localText.CLAIM_TABLE_ROW_WORKLOAD_ID,
  );
  assertBenchmarkResourceText(
    row.statement,
    localText.CLAIM_TABLE_ROW_STATEMENT,
  );
  validateProfile(row.profile);
  if (
    !setHas(metrics, row.metric) ||
    !setHas(evidenceClasses, row.evidenceClass) ||
    !setHas(outcomes, row.outcome) ||
    !setHas(subjectKinds, row.subject.kind) ||
    !setHas(sourceStates, row.source.state)
  ) {
    throw new TypeError(localText.CLAIM_TABLE_ROW_ENUM_INVALID);
  }
  if (
    objectHasOwn(row.source, localText.MEASUREMENT_OUTCOME) &&
    !inspectBenchmarkResourceMeasurementOutcome(
      row.source.measurementOutcome,
    ).valid
  ) {
    throw new TypeError(localText.CLAIM_TABLE_ROW_ENUM_INVALID);
  }
  assertBenchmarkResourceArray(
    row.reasonCodes,
    localText.CLAIM_TABLE_ROW_REASON_CODES,
    maximumReasonCodes,
  );
  for (let index = 0; index < row.reasonCodes.length; index += 1) {
    assertBenchmarkResourceText(
      row.reasonCodes[index],
      `${localText.CLAIM_TABLE_ROW_REASON_CODES}.${index}`,
    );
  }
  if (!rowDigestMatches(row)) {
    throw new TypeError(localText.CLAIM_TABLE_ROW_DIGEST_MISMATCH);
  }
}

export function validateComparativeEfficiencyClaimTable(table) {
  try {
    assertClaimCanonicalData(table);
    assertBenchmarkResourceExactRecord(table, tableKeys, localText.CLAIM_TABLE);
    assertBenchmarkResourceDigest(
      table.tableDigest,
      localText.CLAIM_TABLE_TABLE_DIGEST,
    );
    if (
      table.schemaVersion !== COMPARATIVE_CLAIM_PROJECTION_SCHEMA_VERSION ||
      !arrayIsArray(table.rows)
    ) {
      throw new TypeError(localText.CLAIM_TABLE_SCHEMA_INVALID);
    }
    for (let index = 0; index < table.rows.length; index += 1) {
      validateRow(table.rows[index]);
    }
    const body = {};
    for (let index = 0; index < tableBodyKeys.length; index += 1) {
      const key = tableBodyKeys[index];
      body[key] = table[key];
    }
    if (table.tableDigest !== digestClaimData(body)) {
      throw new TypeError(localText.CLAIM_TABLE_DIGEST_MISMATCH);
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {
      valid: false,
      reason: safeValidationError(error),
    };
  }
}

function markdownCell(value) {
  return reflectApply(stringReplaceMethod, String(value), [
    pipePattern,
    localText.MARKDOWN_PIPE_ESCAPE,
  ]);
}

function profileText(profile) {
  return profile.state === COMPARATIVE_CLAIM_PROFILE_STATE.IDENTIFIED ?
    profile.id :
    profile.state;
}

export function renderComparativeEfficiencyClaimTable(table) {
  const validation = validateComparativeEfficiencyClaimTable(table);
  if (!validation.valid) throw new TypeError(validation.reason);
  const lines = [
    '# Comparative efficiency claims',
    '',
    `Machine table digest: \`${table.tableDigest}\``,
    '',
    '| Row | Workload | Metric | Profile | Class | Outcome | Statement |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (let index = 0; index < table.rows.length; index += 1) {
    const row = table.rows[index];
    appendOwnArrayValue(
      lines,
      `| ${markdownCell(row.rowId)} | ${markdownCell(row.workloadId)} | ` +
      `${markdownCell(row.metric)} | ${markdownCell(profileText(row.profile))} | ` +
      `${markdownCell(row.evidenceClass)} | ${markdownCell(row.outcome)} | ` +
      `${markdownCell(row.statement)} |`,
    );
  }
  appendOwnArrayValue(lines, '');
  return joinArray(lines, localText.LINE_FEED);
}
