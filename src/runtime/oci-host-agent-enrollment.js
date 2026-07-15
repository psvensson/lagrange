import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalizeOciHostAgentJson,
  parseExactOciHostAgentJson,
} from './oci-host-agent-json.js';
import {
  OCI_HOST_AGENT_DURABLE_ERROR,
  OciHostAgentDurableStateError,
  durableStateError,
} from './oci-host-agent-durable-errors.js';
import {
  LOCK_FILE,
  acquireDirectoryLock,
  appendDurable,
  canonicalJsonBytes,
  ensureDirectory,
  exactKeys,
  requireDirectoryStorage,
  requireFileStorage,
  safeInteger,
  validHex256,
  validOwnerId,
} from './oci-host-agent-durable-files.js';
import {
  initializeOciHostAgentReceiptLedger,
  readOciHostAgentReceiptLedgerHeader,
  verifyEmptyOciHostAgentReceiptLedger,
} from './oci-host-agent-receipt-ledger.js';

const ENROLLMENT_VERSION = 1;
const ENROLLMENT_LOG = 'enrollment.log';
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PARENT_PATH_SEGMENT = '..';
const LINE_ENDING = '\n';
const LINE_ENDING_BYTE = 0x0a;
const ENCODING_UTF8 = 'utf8';
const FILE_NOT_FOUND_ERROR = 'ENOENT';
const TEST_CRASH_PREFIX = 'crash-';
const ENROLLMENT_STATE = Object.freeze({
  AUTHORIZED: 'authorized',
  INITIALIZING: 'initializing',
  CONSUMED: 'consumed',
  RETIRED: 'retired',
});
const STATE_TRANSITION = Object.freeze({
  [ENROLLMENT_STATE.AUTHORIZED]: ENROLLMENT_STATE.INITIALIZING,
  [ENROLLMENT_STATE.INITIALIZING]: ENROLLMENT_STATE.CONSUMED,
  [ENROLLMENT_STATE.CONSUMED]: ENROLLMENT_STATE.RETIRED,
  [ENROLLMENT_STATE.RETIRED]: ENROLLMENT_STATE.AUTHORIZED,
});
const RECORD_FIELDS = Object.freeze([
  'version',
  'hostId',
  'clusterIncarnation',
  'engineDataRootId',
  'ledgerRootId',
  'enrollmentId',
  'predecessorCounter',
  'tpmCounter',
  'state',
]);
const RETIREMENT_PROOF_FIELDS = Object.freeze([
  'engineStopped',
  'runtimeStopped',
  'helpersStopped',
  'resourcesRemoved',
  'dataRootDiscarded',
]);

const OCI_HOST_AGENT_ENROLLMENT_POINT = Object.freeze({
  AFTER_TPM_INCREMENT: 'after_tpm_increment',
  AFTER_ENROLLMENT_APPEND: 'after_enrollment_append',
  AFTER_LEDGER_INITIALIZE: 'after_ledger_initialize',
});

function enrollmentUnavailable() {
  durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE);
}

function validateTpm(tpm) {
  if (!tpm || typeof tpm.read !== 'function' ||
      typeof tpm.increment !== 'function') enrollmentUnavailable();
  try {
    const current = tpm.read();
    if (!safeInteger(current)) enrollmentUnavailable();
    return current;
  } catch (error) {
    if (error instanceof OciHostAgentDurableStateError) throw error;
    enrollmentUnavailable();
  }
}

function rootsConfigured(options) {
  return [options?.authorityRoot, options?.ledgerRoot, options?.engineDataRoot]
    .every((root) => typeof root === 'string' && root.length > 0);
}

function idsConfigured(options) {
  return validOwnerId(options?.hostId) &&
    validOwnerId(options.clusterIncarnation) &&
    validHex256(options.engineDataRootId) &&
    validHex256(options.ledgerRootId) && validHex256(options.enrollmentId);
}

function limitsConfigured(options) {
  return safeInteger(options?.predecessorCounter) &&
    safeInteger(options.maximumReceipts, 1) &&
    safeInteger(options.maximumNoncesPerKey, 1);
}

function rootsOverlap(roots) {
  return roots.some((root, index) => roots.some((other, otherIndex) =>
    index !== otherIndex && (root === other ||
      path.relative(root, other).split(path.sep)[0] !== PARENT_PATH_SEGMENT)));
}

function validateConfiguration(options) {
  if (!rootsConfigured(options) || !idsConfigured(options) ||
      !limitsConfigured(options)) enrollmentUnavailable();
  validateTpm(options.tpm);
  const validated = {
    ...options,
    authorityRoot: path.resolve(options.authorityRoot),
    ledgerRoot: path.resolve(options.ledgerRoot),
    engineDataRoot: path.resolve(options.engineDataRoot),
  };
  const roots = [
    validated.authorityRoot,
    validated.ledgerRoot,
    validated.engineDataRoot,
  ];
  if (rootsOverlap(roots)) enrollmentUnavailable();
  return validated;
}

function ledgerOptions(options) {
  return {
    root: options.ledgerRoot,
    clusterIncarnation: options.clusterIncarnation,
    ledgerRootId: options.ledgerRootId,
    enrollmentId: options.enrollmentId,
    maximumReceipts: options.maximumReceipts,
    maximumNoncesPerKey: options.maximumNoncesPerKey,
  };
}

function recordIds(record) {
  return {
    hostId: record.hostId,
    clusterIncarnation: record.clusterIncarnation,
    engineDataRootId: record.engineDataRootId,
    ledgerRootId: record.ledgerRootId,
    enrollmentId: record.enrollmentId,
  };
}

function configuredIds(options) {
  return {
    hostId: options.hostId,
    clusterIncarnation: options.clusterIncarnation,
    engineDataRootId: options.engineDataRootId,
    ledgerRootId: options.ledgerRootId,
    enrollmentId: options.enrollmentId,
  };
}

function sameIds(left, right) {
  return canonicalizeOciHostAgentJson(recordIds(left)) ===
    canonicalizeOciHostAgentJson(recordIds(right));
}

function matchesConfiguration(record, options) {
  return canonicalizeOciHostAgentJson(recordIds(record)) ===
    canonicalizeOciHostAgentJson(configuredIds(options));
}

function distinctReplacement(record, options) {
  return record.hostId === options.hostId &&
    record.clusterIncarnation !== options.clusterIncarnation &&
    record.engineDataRootId !== options.engineDataRootId &&
    record.ledgerRootId !== options.ledgerRootId &&
    record.enrollmentId !== options.enrollmentId;
}

function recordIdentifiersValid(record) {
  return validOwnerId(record.hostId) && validOwnerId(record.clusterIncarnation) &&
    validHex256(record.engineDataRootId) && validHex256(record.ledgerRootId) &&
    validHex256(record.enrollmentId);
}

function recordCountersAndStateValid(record) {
  return safeInteger(record.predecessorCounter) &&
    safeInteger(record.tpmCounter, 1) &&
    Object.values(ENROLLMENT_STATE).includes(record.state);
}

function recordDigestValid(record) {
  return record.state !== ENROLLMENT_STATE.CONSUMED ||
    DIGEST_PATTERN.test(record.headerDigest);
}

function recordValid(record) {
  const optional = record?.state === ENROLLMENT_STATE.CONSUMED ?
    ['headerDigest'] : [];
  return exactKeys(record, RECORD_FIELDS, optional) &&
    record.version === ENROLLMENT_VERSION && recordIdentifiersValid(record) &&
    recordCountersAndStateValid(record) && recordDigestValid(record);
}

function parseRecordLine(line) {
  const record = parseExactOciHostAgentJson(line);
  if (canonicalizeOciHostAgentJson(record) !== line || !recordValid(record)) {
    enrollmentUnavailable();
  }
  return record;
}

function parseLogRecords(bytes) {
  if (bytes.length === 0 || bytes.at(-1) !== LINE_ENDING_BYTE) {
    enrollmentUnavailable();
  }
  return bytes.toString(ENCODING_UTF8).slice(0, -1).split(LINE_ENDING)
    .map(parseRecordLine);
}

function genesisRecordValid(record) {
  return record.state === ENROLLMENT_STATE.AUTHORIZED &&
    record.predecessorCounter === 0 && record.tpmCounter === 1;
}

function recordTransitionValid(previous, record) {
  const idsValid = previous.state === ENROLLMENT_STATE.RETIRED ?
    distinctReplacement(previous, record) : sameIds(previous, record);
  return record.tpmCounter === previous.tpmCounter + 1 &&
    record.predecessorCounter === previous.tpmCounter &&
    record.state === STATE_TRANSITION[previous.state] &&
    record.hostId === previous.hostId && idsValid;
}

function validateRecordChain(records) {
  for (const [index, record] of records.entries()) {
    const previous = records[index - 1];
    if ((!previous && !genesisRecordValid(record)) ||
        (previous && !recordTransitionValid(previous, record))) {
      enrollmentUnavailable();
    }
  }
}

function recordsFromLog(options) {
  const file = path.join(options.authorityRoot, ENROLLMENT_LOG);
  if (!fs.existsSync(file)) return [];
  try {
    const records = parseLogRecords(fs.readFileSync(file));
    validateRecordChain(records);
    return records;
  } catch (error) {
    if (error instanceof OciHostAgentDurableStateError) throw error;
    enrollmentUnavailable();
  }
}

function authorityEntriesValid(options, records) {
  const expected = records.length > 0 ? [LOCK_FILE, ENROLLMENT_LOG] : [LOCK_FILE];
  try {
    requireDirectoryStorage(
      options.authorityRoot,
      OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
    );
    if (fs.readdirSync(options.authorityRoot).sort().join(LINE_ENDING) !==
        expected.sort().join(LINE_ENDING)) return false;
    if (records.length > 0) {
      requireFileStorage(
        path.join(options.authorityRoot, ENROLLMENT_LOG),
        OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
      );
    }
    return true;
  } catch {
    return false;
  }
}

function recordsAtTpmTail(options) {
  const records = recordsFromLog(options);
  if (!authorityEntriesValid(options, records)) enrollmentUnavailable();
  const expectedCounter = records.at(-1)?.tpmCounter || 0;
  if (validateTpm(options.tpm) !== expectedCounter) enrollmentUnavailable();
  return records;
}

function appendRecord(options, records, state, extra = {}) {
  let counter;
  try {
    counter = options.tpm.increment();
  } catch {
    enrollmentUnavailable();
  }
  if (!safeInteger(counter, 1) ||
      counter !== (records.at(-1)?.tpmCounter || 0) + 1) {
    enrollmentUnavailable();
  }
  options.fault?.(OCI_HOST_AGENT_ENROLLMENT_POINT.AFTER_TPM_INCREMENT);
  const record = {
    version: ENROLLMENT_VERSION,
    ...configuredIds(options),
    predecessorCounter: records.at(-1)?.tpmCounter || 0,
    tpmCounter: counter,
    state,
    ...extra,
  };
  if (!recordValid(record)) enrollmentUnavailable();
  appendDurable(
    path.join(options.authorityRoot, ENROLLMENT_LOG),
    canonicalJsonBytes(record),
  );
  records.push(record);
  options.fault?.(OCI_HOST_AGENT_ENROLLMENT_POINT.AFTER_ENROLLMENT_APPEND);
  return record;
}

function ensureAuthorityRoot(options) {
  const parent = path.dirname(options.authorityRoot);
  ensureDirectory(parent);
  ensureDirectory(options.authorityRoot);
}

function verifyConsumedTail(options, records) {
  const tail = records.at(-1);
  if (!tail || tail.state !== ENROLLMENT_STATE.CONSUMED ||
      !matchesConfiguration(tail, options)) enrollmentUnavailable();
  const ledger = readOciHostAgentReceiptLedgerHeader(ledgerOptions(options));
  if (ledger.headerDigest !== tail.headerDigest) enrollmentUnavailable();
  return structuredClone(tail);
}

function prepareAuthorizedRecord(options, records) {
  const tail = records.at(-1);
  if (!tail) {
    if (options.predecessorCounter !== 0 || fs.existsSync(options.ledgerRoot)) {
      enrollmentUnavailable();
    }
    return appendRecord(options, records, ENROLLMENT_STATE.AUTHORIZED);
  }
  if (tail.state !== ENROLLMENT_STATE.RETIRED ||
      options.predecessorCounter !== tail.tpmCounter ||
      !distinctReplacement(tail, options) || fs.existsSync(options.ledgerRoot)) {
    enrollmentUnavailable();
  }
  return appendRecord(options, records, ENROLLMENT_STATE.AUTHORIZED);
}

function requireEngineDataRoot(options, empty = false) {
  try {
    if (!fs.lstatSync(options.engineDataRoot).isDirectory() ||
        (empty && fs.readdirSync(options.engineDataRoot).length !== 0)) {
      enrollmentUnavailable();
    }
  } catch (error) {
    if (error instanceof OciHostAgentDurableStateError) throw error;
    enrollmentUnavailable();
  }
}

function requireDiscardedEngineDataRoot(options) {
  try {
    fs.lstatSync(options.engineDataRoot);
    durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RETIREMENT_REQUIRED);
  } catch (error) {
    if (error instanceof OciHostAgentDurableStateError) throw error;
    if (error?.code !== FILE_NOT_FOUND_ERROR) enrollmentUnavailable();
  }
}

function ensureAuthorizedTail(options, records, tail) {
  if (!tail || tail.state === ENROLLMENT_STATE.RETIRED) {
    return prepareAuthorizedRecord(options, records);
  }
  return tail;
}

function ensureInitializingTail(options, records, tail) {
  let current = tail;
  if (current.state === ENROLLMENT_STATE.AUTHORIZED) {
    if (!matchesConfiguration(current, options)) enrollmentUnavailable();
    current = appendRecord(options, records, ENROLLMENT_STATE.INITIALIZING);
  }
  if (current.state !== ENROLLMENT_STATE.INITIALIZING ||
      !matchesConfiguration(current, options)) enrollmentUnavailable();
  return current;
}

function consumeInitializingTail(options, records) {
  const ledger = fs.existsSync(options.ledgerRoot) ?
    verifyEmptyOciHostAgentReceiptLedger(ledgerOptions(options)) :
    initializeOciHostAgentReceiptLedger(ledgerOptions(options));
  options.fault?.(OCI_HOST_AGENT_ENROLLMENT_POINT.AFTER_LEDGER_INITIALIZE);
  return appendRecord(
    options,
    records,
    ENROLLMENT_STATE.CONSUMED,
    {headerDigest: ledger.headerDigest},
  );
}

function advanceEnrollment(options, records) {
  const tail = records.at(-1);
  if (tail?.state === ENROLLMENT_STATE.CONSUMED) {
    return verifyConsumedTail(options, records);
  }
  requireEngineDataRoot(options, true);
  const authorized = ensureAuthorizedTail(options, records, tail);
  ensureInitializingTail(options, records, authorized);
  return consumeInitializingTail(options, records);
}

function initializeOciHostAgentEnrollment(rawOptions) {
  const options = validateConfiguration(rawOptions);
  requireEngineDataRoot(options);
  ensureAuthorityRoot(options);
  const lock = acquireDirectoryLock(options.authorityRoot, options.lockOptions);
  try {
    return advanceEnrollment(options, recordsAtTpmTail(options));
  } catch (error) {
    if (error instanceof OciHostAgentDurableStateError ||
        String(error?.message || '').startsWith(TEST_CRASH_PREFIX)) throw error;
    enrollmentUnavailable();
  } finally {
    lock.release();
  }
}

function verifyOciHostAgentEnrollment(rawOptions) {
  const options = validateConfiguration(rawOptions);
  requireEngineDataRoot(options);
  if (!fs.existsSync(options.authorityRoot)) enrollmentUnavailable();
  const lock = acquireDirectoryLock(options.authorityRoot, options.lockOptions);
  try {
    return verifyConsumedTail(options, recordsAtTpmTail(options));
  } finally {
    lock.release();
  }
}

function retirementProofValid(proof) {
  return exactKeys(proof, RETIREMENT_PROOF_FIELDS) &&
    RETIREMENT_PROOF_FIELDS.every((field) => proof[field] === true);
}

function retireOciHostAgentEnrollment(rawOptions) {
  const options = validateConfiguration(rawOptions);
  if (!retirementProofValid(options.retirementProof) ||
      !fs.existsSync(options.authorityRoot)) {
    durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RETIREMENT_REQUIRED);
  }
  requireDiscardedEngineDataRoot(options);
  const lock = acquireDirectoryLock(options.authorityRoot, options.lockOptions);
  try {
    const records = recordsAtTpmTail(options);
    verifyConsumedTail(options, records);
    return appendRecord(options, records, ENROLLMENT_STATE.RETIRED);
  } finally {
    lock.release();
  }
}

export {
  OCI_HOST_AGENT_ENROLLMENT_POINT,
  initializeOciHostAgentEnrollment,
  retireOciHostAgentEnrollment,
  verifyOciHostAgentEnrollment,
};
