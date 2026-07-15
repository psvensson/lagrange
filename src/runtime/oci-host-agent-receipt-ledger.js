import fs from 'node:fs';
import path from 'node:path';

import {canonicalizeOciHostAgentJson} from './oci-host-agent-json.js';
import {
  OCI_HOST_AGENT_DURABLE_ERROR,
  OciHostAgentDurableStateError,
  durableStateError,
} from './oci-host-agent-durable-errors.js';
import {
  LOCK_FILE,
  acquireDirectoryLock,
  canonicalJsonBytes,
  ensureDirectory,
  exactKeys,
  fsyncDirectory,
  readCanonicalJson,
  requireDirectoryStorage,
  requireFileStorage,
  safeInteger,
  sha256Digest,
  validHex256,
  validOwnerId,
  writeAtomicDurable,
  writeExclusiveDurable,
} from './oci-host-agent-durable-files.js';
import {
  LEDGER_OUTCOME,
  LEDGER_VERSION,
  MUTATING_OPERATIONS,
  RECEIPT_STATE,
  TRANSACTION_KIND,
  applyTransaction,
  clone,
  emptyProjection,
  nonDispatchResultAllowed,
  receiptIntentMatches,
  resourceKey,
  terminalResultMatches,
  validDigest,
  validNonce,
  validateGeneration,
  validateOperation,
} from './oci-host-agent-receipt-projection.js';

const HEADER_FILE = 'header.json';
const INCARNATION_FILE = 'incarnation.json';
const MANIFEST_FILE = 'manifest.json';
const GENERATION_DIRECTORY = 'generations';
const GENERATION_DIGITS = 12;
const GENERATION_PATTERN = /^([0-9]{12})\.json$/u;
const DIRECTORY_MODE = 0o700;
const LINE_ENDING = '\n';
const GENERATION_PADDING = '0';
const NONCE_KEY_SEPARATOR = '\n';
const LOCK_RELEASE_FAILURE_KIND = 'lock_release_failed';
const NONCE_ADMISSION_DECISION = Object.freeze({
  ACCEPT: 'accept',
  LATCH_SATURATED: 'latch_saturated',
  REPLAYED: 'replayed',
  SATURATED: 'saturated',
});
const HEADER_FIELDS = Object.freeze([
  'version',
  'clusterIncarnation',
  'ledgerRootId',
  'enrollmentId',
  'maximumReceipts',
  'maximumNoncesPerKey',
]);
const INCARNATION_FIELDS = Object.freeze([
  'version',
  'clusterIncarnation',
  'ledgerRootId',
  'enrollmentId',
  'headerDigest',
]);
const MANIFEST_FIELDS = Object.freeze([
  'version',
  'ledgerRootId',
  'sequence',
  'tailDigest',
]);

const OCI_HOST_AGENT_DURABILITY_POINT = Object.freeze({
  AFTER_GENERATION_FILE_SYNC: 'after_generation_file_sync',
  AFTER_GENERATION_DIRECTORY_SYNC: 'after_generation_directory_sync',
  AFTER_MANIFEST_FILE_SYNC: 'after_manifest_file_sync',
  AFTER_MANIFEST_DIRECTORY_SYNC: 'after_manifest_directory_sync',
});

function receiptUnavailable() {
  durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE);
}

function validateConfiguration(options) {
  if (!options || typeof options !== 'object' ||
      typeof options.root !== 'string' || options.root.length === 0 ||
      !validOwnerId(options.clusterIncarnation) ||
      !validHex256(options.ledgerRootId) ||
      !validHex256(options.enrollmentId) ||
      !safeInteger(options.maximumReceipts, 1) ||
      !safeInteger(options.maximumNoncesPerKey, 1)) {
    durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.INVALID_CONFIGURATION);
  }
  return {...options, root: path.resolve(options.root)};
}

function headerFor(options) {
  return {
    version: LEDGER_VERSION,
    clusterIncarnation: options.clusterIncarnation,
    ledgerRootId: options.ledgerRootId,
    enrollmentId: options.enrollmentId,
    maximumReceipts: options.maximumReceipts,
    maximumNoncesPerKey: options.maximumNoncesPerKey,
  };
}

function incarnationFor(header, headerDigest) {
  return {
    version: LEDGER_VERSION,
    clusterIncarnation: header.clusterIncarnation,
    ledgerRootId: header.ledgerRootId,
    enrollmentId: header.enrollmentId,
    headerDigest,
  };
}

function manifestFor(header, sequence, tailDigest) {
  return {
    version: LEDGER_VERSION,
    ledgerRootId: header.ledgerRootId,
    sequence,
    tailDigest,
  };
}

function headerMatches(header, expected) {
  return exactKeys(header, HEADER_FIELDS) &&
    canonicalizeOciHostAgentJson(header) ===
    canonicalizeOciHostAgentJson(expected);
}

function readOciHostAgentReceiptLedgerHeader(rawOptions) {
  const options = validateConfiguration(rawOptions);
  try {
    const header = readCanonicalJson(
      path.join(options.root, HEADER_FILE),
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    if (!headerMatches(header, headerFor(options))) receiptUnavailable();
    const headerDigest = sha256Digest(canonicalJsonBytes(header));
    const incarnation = readCanonicalJson(
      path.join(options.root, INCARNATION_FILE),
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    if (!exactKeys(incarnation, INCARNATION_FIELDS) ||
        canonicalizeOciHostAgentJson(incarnation) !==
      canonicalizeOciHostAgentJson(incarnationFor(header, headerDigest))) {
      receiptUnavailable();
    }
    return {header, headerDigest};
  } catch (error) {
    if (error?.code === OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE) {
      throw error;
    }
    receiptUnavailable();
  }
}

function initializeOciHostAgentReceiptLedger(rawOptions) {
  const options = validateConfiguration(rawOptions);
  const parent = path.dirname(options.root);
  ensureDirectory(parent);
  try {
    if (fs.existsSync(options.root)) {
      requireDirectoryStorage(
        options.root,
        OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
      );
      if (fs.readdirSync(options.root).length !== 0) receiptUnavailable();
    } else {
      fs.mkdirSync(options.root, {recursive: false, mode: DIRECTORY_MODE});
      fsyncDirectory(parent);
    }
    const generations = path.join(options.root, GENERATION_DIRECTORY);
    fs.mkdirSync(generations, {recursive: false, mode: DIRECTORY_MODE});
    requireDirectoryStorage(
      generations,
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    fsyncDirectory(options.root);
    const header = headerFor(options);
    const headerDigest = sha256Digest(canonicalJsonBytes(header));
    writeExclusiveDurable(
      path.join(options.root, HEADER_FILE),
      canonicalJsonBytes(header),
    );
    fsyncDirectory(options.root);
    writeExclusiveDurable(
      path.join(options.root, INCARNATION_FILE),
      canonicalJsonBytes(incarnationFor(header, headerDigest)),
    );
    fsyncDirectory(options.root);
    writeExclusiveDurable(
      path.join(options.root, MANIFEST_FILE),
      canonicalJsonBytes(manifestFor(header, 0, headerDigest)),
    );
    fsyncDirectory(options.root);
    return {header, headerDigest};
  } catch (error) {
    if (error instanceof OciHostAgentDurableStateError) throw error;
    receiptUnavailable();
  }
}

function verifyEmptyOciHostAgentReceiptLedger(rawOptions) {
  const options = validateConfiguration(rawOptions);
  const {header, headerDigest} = readOciHostAgentReceiptLedgerHeader(options);
  try {
    const expectedEntries = [
      GENERATION_DIRECTORY,
      HEADER_FILE,
      INCARNATION_FILE,
      MANIFEST_FILE,
    ].sort();
    if (fs.readdirSync(options.root).sort().join(LINE_ENDING) !==
        expectedEntries.join(LINE_ENDING) ||
        fs.readdirSync(path.join(options.root, GENERATION_DIRECTORY)).length !== 0) {
      receiptUnavailable();
    }
    requireDirectoryStorage(
      options.root,
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    requireDirectoryStorage(
      path.join(options.root, GENERATION_DIRECTORY),
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    const manifest = readCanonicalJson(
      path.join(options.root, MANIFEST_FILE),
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    if (canonicalizeOciHostAgentJson(manifest) !==
        canonicalizeOciHostAgentJson(manifestFor(header, 0, headerDigest))) {
      receiptUnavailable();
    }
    return {header, headerDigest};
  } catch (error) {
    if (error?.code === OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE) {
      throw error;
    }
    receiptUnavailable();
  }
}

function generationFile(sequence) {
  return `${String(sequence).padStart(GENERATION_DIGITS, GENERATION_PADDING)}.json`;
}

function validateRootEntries(root) {
  const expected = [
    LOCK_FILE,
    GENERATION_DIRECTORY,
    HEADER_FILE,
    INCARNATION_FILE,
    MANIFEST_FILE,
  ].sort();
  if (fs.readdirSync(root).sort().join(LINE_ENDING) !==
      expected.join(LINE_ENDING)) {
    receiptUnavailable();
  }
  requireDirectoryStorage(
    root,
    OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
  );
  requireDirectoryStorage(
    path.join(root, GENERATION_DIRECTORY),
    OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
  );
  for (const file of [LOCK_FILE, HEADER_FILE, INCARNATION_FILE, MANIFEST_FILE]) {
    requireFileStorage(
      path.join(root, file),
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
  }
}

function recoverProjection(options) {
  validateRootEntries(options.root);
  const {header, headerDigest} = readOciHostAgentReceiptLedgerHeader(options);
  const manifest = readCanonicalJson(
    path.join(options.root, MANIFEST_FILE),
    OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
  );
  if (!exactKeys(manifest, MANIFEST_FIELDS) ||
      manifest.version !== LEDGER_VERSION ||
      manifest.ledgerRootId !== header.ledgerRootId ||
      !safeInteger(manifest.sequence) || !validDigest(manifest.tailDigest)) {
    receiptUnavailable();
  }
  const directory = path.join(options.root, GENERATION_DIRECTORY);
  const names = fs.readdirSync(directory).sort();
  if (names.length !== manifest.sequence || names.some((name, index) => {
    const match = GENERATION_PATTERN.exec(name);
    return !match || Number(match[1]) !== index + 1;
  })) receiptUnavailable();
  for (const name of names) {
    requireFileStorage(
      path.join(directory, name),
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
  }
  const projection = emptyProjection(header, headerDigest);
  for (let sequence = 1; sequence <= names.length; sequence += 1) {
    validateGeneration(readCanonicalJson(
      path.join(directory, generationFile(sequence)),
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    ), projection, sequence);
  }
  if (projection.sequence !== manifest.sequence ||
      projection.tailDigest !== manifest.tailDigest) receiptUnavailable();
  return projection;
}

function appendTransaction(options, projection, transaction) {
  const sequence = projection.sequence + 1;
  const body = {
    version: LEDGER_VERSION,
    ledgerRootId: projection.header.ledgerRootId,
    sequence,
    previousDigest: projection.tailDigest,
    transaction,
  };
  const record = {body, digest: sha256Digest(canonicalJsonBytes(body))};
  const generationPath = path.join(
    options.root,
    GENERATION_DIRECTORY,
    generationFile(sequence),
  );
  writeExclusiveDurable(generationPath, canonicalJsonBytes(record));
  options.fault?.(
    OCI_HOST_AGENT_DURABILITY_POINT.AFTER_GENERATION_FILE_SYNC,
  );
  fsyncDirectory(path.dirname(generationPath));
  options.fault?.(
    OCI_HOST_AGENT_DURABILITY_POINT.AFTER_GENERATION_DIRECTORY_SYNC,
  );
  writeAtomicDurable(
    path.join(options.root, MANIFEST_FILE),
    manifestFor(projection.header, sequence, record.digest),
    {
      afterFileSync: () => options.fault?.(
        OCI_HOST_AGENT_DURABILITY_POINT.AFTER_MANIFEST_FILE_SYNC,
      ),
      afterDirectorySync: () => options.fault?.(
        OCI_HOST_AGENT_DURABILITY_POINT.AFTER_MANIFEST_DIRECTORY_SYNC,
      ),
    },
  );
  applyTransaction(projection, transaction, sequence);
  projection.sequence = sequence;
  projection.tailDigest = record.digest;
}

function nonceAdmissionDecision(projection, keyId, nonce, nowMs) {
  if (projection.saturatedKeys.has(keyId)) {
    return NONCE_ADMISSION_DECISION.SATURATED;
  }
  const current = projection.nonces.get(
    `${keyId}${NONCE_KEY_SEPARATOR}${nonce}`,
  );
  if (current && current.expiresAtMs > nowMs) {
    return NONCE_ADMISSION_DECISION.REPLAYED;
  }
  const active = [...projection.nonces.values()].filter(
    (entry) => entry.keyId === keyId && entry.expiresAtMs > nowMs,
  ).length;
  return active >= projection.header.maximumNoncesPerKey ?
    NONCE_ADMISSION_DECISION.LATCH_SATURATED :
    NONCE_ADMISSION_DECISION.ACCEPT;
}

class OciHostAgentReceiptLedger {
  #closed = false;
  #lock;
  #options;
  #projection;
  #poisoned = false;
  #settleableFenceTokens = new Set();

  constructor(options, lock, projection) {
    this.#options = options;
    this.#lock = lock;
    this.#projection = projection;
  }

  #usable() {
    if (this.#closed) durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.CLOSED);
    if (this.#poisoned) receiptUnavailable();
  }

  #append(transaction) {
    this.#usable();
    try {
      appendTransaction(this.#options, this.#projection, transaction);
    } catch (error) {
      this.#poisoned = true;
      throw error;
    }
  }

  admitNonce({keyId, nonce, expiresAtMs, nowMs}) {
    this.#usable();
    if (!validOwnerId(keyId) || !validNonce(nonce) ||
        !safeInteger(expiresAtMs, 1) || !safeInteger(nowMs) ||
        expiresAtMs <= nowMs) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.INVALID_CONFIGURATION);
    }
    const decision = nonceAdmissionDecision(
      this.#projection,
      keyId,
      nonce,
      nowMs,
    );
    switch (decision) {
    case NONCE_ADMISSION_DECISION.SATURATED:
    case NONCE_ADMISSION_DECISION.LATCH_SATURATED:
      if (decision === NONCE_ADMISSION_DECISION.LATCH_SATURATED) {
        this.#append({kind: TRANSACTION_KIND.NONCE_SATURATED, keyId});
      }
      return {status: LEDGER_OUTCOME.SATURATED};
    case NONCE_ADMISSION_DECISION.REPLAYED:
      return {status: LEDGER_OUTCOME.REPLAYED};
    case NONCE_ADMISSION_DECISION.ACCEPT:
      this.#append({
        kind: TRANSACTION_KIND.NONCE_ADMITTED,
        keyId,
        nonce,
        expiresAtMs,
      });
      return {status: LEDGER_OUTCOME.ACCEPTED};
    default:
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.INVALID_CONFIGURATION);
    }
  }

  acceptOperation(candidate) {
    this.#usable();
    validateOperation(candidate, this.#projection.header.clusterIncarnation);
    const existing = this.#projection.receipts.get(candidate.operationId);
    if (existing) {
      if (!receiptIntentMatches(existing, candidate)) {
        durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.INTENT_CONFLICT);
      }
      return {status: LEDGER_OUTCOME.EXISTING, receipt: clone(existing)};
    }
    if (this.#projection.fences.has(resourceKey(candidate.identity))) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RESOURCE_FENCED);
    }
    if (this.#projection.receipts.size >=
        this.#projection.header.maximumReceipts) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_CAPACITY_EXHAUSTED);
    }
    const receipt = {
      operationId: candidate.operationId,
      intentDigest: candidate.intentDigest,
      operation: candidate.operation,
      identity: clone(candidate.identity),
      state: RECEIPT_STATE.ACCEPTED,
      generation: this.#projection.sequence + 1,
    };
    this.#append({kind: TRANSACTION_KIND.RECEIPT_ACCEPTED, receipt});
    return {status: LEDGER_OUTCOME.ACCEPTED, receipt: clone(receipt)};
  }

  beginMutation({operationId, expectedGeneration}) {
    this.#usable();
    const previous = this.#projection.receipts.get(operationId);
    if (previous?.state === RECEIPT_STATE.MUTATION_UNRESOLVED &&
        this.#projection.fences.has(resourceKey(previous.identity))) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RESOURCE_FENCED);
    }
    if (!previous || previous.state !== RECEIPT_STATE.ACCEPTED ||
        previous.generation !== expectedGeneration ||
        !MUTATING_OPERATIONS.has(previous.operation)) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.GENERATION_CONFLICT);
    }
    const key = resourceKey(previous.identity);
    if (this.#projection.fences.has(key)) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RESOURCE_FENCED);
    }
    const generation = this.#projection.sequence + 1;
    const receipt = {...clone(previous),
      state: RECEIPT_STATE.MUTATION_UNRESOLVED, generation};
    const fence = {
      token: sha256Digest(canonicalJsonBytes({
        operationId,
        intentDigest: previous.intentDigest,
        identity: previous.identity,
        generation,
      })),
      operationId,
      intentDigest: previous.intentDigest,
      identity: clone(previous.identity),
      generation,
    };
    this.#append({kind: TRANSACTION_KIND.MUTATION_STARTED, receipt, fence});
    this.#settleableFenceTokens.add(fence.token);
    return {receipt: clone(receipt), fence: clone(fence)};
  }

  completeOperation({operationId, expectedGeneration, fenceToken, result}) {
    this.#usable();
    const previous = this.#projection.receipts.get(operationId);
    const fence = previous ?
      this.#projection.fences.get(resourceKey(previous.identity)) : undefined;
    if (previous?.state === RECEIPT_STATE.MUTATION_UNRESOLVED &&
        (!fence || fenceToken !== fence.token ||
          !this.#settleableFenceTokens.has(fenceToken))) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RESOURCE_FENCED);
    }
    if (!previous || previous.state !== RECEIPT_STATE.MUTATION_UNRESOLVED ||
        previous.generation !== expectedGeneration ||
        !terminalResultMatches(result, previous)) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.GENERATION_CONFLICT);
    }
    const receipt = {...clone(previous),
      state: RECEIPT_STATE.TERMINAL,
      generation: this.#projection.sequence + 1,
      result: clone(result)};
    this.#append({
      kind: TRANSACTION_KIND.RECEIPT_COMPLETED,
      receipt,
      fenceToken,
    });
    this.#settleableFenceTokens.delete(fenceToken);
    return clone(receipt);
  }

  completeWithoutMutation({operationId, expectedGeneration, result}) {
    this.#usable();
    const previous = this.#projection.receipts.get(operationId);
    if (!previous || previous.state !== RECEIPT_STATE.ACCEPTED ||
        previous.generation !== expectedGeneration ||
        !terminalResultMatches(result, previous) ||
        !nonDispatchResultAllowed(previous, result) ||
        this.#projection.fences.has(resourceKey(previous.identity))) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.GENERATION_CONFLICT);
    }
    const receipt = {...clone(previous),
      state: RECEIPT_STATE.TERMINAL,
      generation: this.#projection.sequence + 1,
      result: clone(result)};
    this.#append({kind: TRANSACTION_KIND.RECEIPT_COMPLETED, receipt});
    return clone(receipt);
  }

  readOperation(operationId) {
    this.#usable();
    const receipt = this.#projection.receipts.get(operationId);
    return receipt ? clone(receipt) : undefined;
  }

  readFence(identity) {
    this.#usable();
    const fence = this.#projection.fences.get(resourceKey(identity));
    return fence ? clone(fence) : undefined;
  }

  close() {
    if (this.#closed) return;
    this.#lock.release();
    this.#closed = true;
  }
}

function openOciHostAgentReceiptLedger(rawOptions) {
  const options = validateConfiguration(rawOptions);
  let lock;
  try {
    if (!fs.existsSync(options.root)) receiptUnavailable();
    requireDirectoryStorage(
      options.root,
      OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    lock = acquireDirectoryLock(options.root, options.lockOptions);
    const projection = recoverProjection(options);
    return new OciHostAgentReceiptLedger(options, lock, projection);
  } catch (error) {
    try {
      lock?.release();
    } catch (cleanupError) {
      const authoritativeError =
        error instanceof OciHostAgentDurableStateError ?
          error :
          new OciHostAgentDurableStateError(
            OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
          );
      authoritativeError.cleanupFailure = Object.freeze({
        kind: LOCK_RELEASE_FAILURE_KIND,
        error: cleanupError,
      });
      throw authoritativeError;
    }
    if (error instanceof OciHostAgentDurableStateError) throw error;
    receiptUnavailable();
  }
}

export {
  OCI_HOST_AGENT_DURABILITY_POINT,
  OCI_HOST_AGENT_DURABLE_ERROR,
  initializeOciHostAgentReceiptLedger,
  openOciHostAgentReceiptLedger,
  readOciHostAgentReceiptLedgerHeader,
  verifyEmptyOciHostAgentReceiptLedger,
};
