import {createHash, randomUUID} from 'node:crypto';
import {
  BACKUP_MANIFEST_CONSTANTS as BMC, L3_BACKUP_RESTORE_REASON_CODE as L3_CODE,
  MANAGEMENT_ERROR_CODE as ERR_CODE, MANAGEMENT_OPERATION_KIND as OP_KIND,
  MANAGEMENT_OPERATION_STATE as OP_STATE, MANAGEMENT_V1_CONTRACT as CONTRACT,
} from './management-v1-constants.js';

const UNSET = null;
const DIGEST_ENCODING_HEX = 'hex';
const BUFFER_ENCODING_UTF8 = 'utf8';
const DIGEST_ALGORITHM_SHA256 = 'sha256';
const URI_PATH_SEPARATOR = '/';
const NON_ENUMERABLE_PARAMETERS_KEY = 'parameters';
const DEFAULT_BACKUP_CLUSTER_ID = 'lagrange-cluster-default';
const DEFAULT_PARTITION_PAYLOAD_SUFFIX = '-data';
const SEGMENT_PATH_PREFIX = `${BMC.SEGMENTS_DIR}/${BMC.SEGMENT_PREFIX}`;
const DEFAULT_RAFT_LOG_INDEX = 1000;
const CORRUPTION_XOR_BYTE_MASK = 255;
const STORAGE_NOT_FOUND_CODE = 'ENOENT';
const OPERATION_CONFLICT_MESSAGE = 'Operation conflict';

const RX_UNREACHABLE = /unreachable|ENOTFOUND|ECONNREFUSED/i;
const RX_DENIED = /denied|EACCES|EPERM|403/i;
const RX_QUORUM = /quorum/i;
const RX_VERIFICATION = /verification/i;

const ERROR_CLASSIFIERS = Object.freeze([
  [RX_UNREACHABLE, L3_CODE.DESTINATION_UNREACHABLE], [RX_DENIED, L3_CODE.DESTINATION_WRITE_DENIED],
  [RX_QUORUM, L3_CODE.PARTITION_QUORUM_UNAVAILABLE],
  [RX_VERIFICATION, L3_CODE.BACKUP_VERIFICATION_FAILED],
]);

const makePart = (id) => Object.freeze({
  partitionId: id, raftLogIndex: DEFAULT_RAFT_LOG_INDEX, raftTerm: 1,
  payload: `partition-${id}${DEFAULT_PARTITION_PAYLOAD_SUFFIX}`,
});
const DEFAULT_PARTITIONS = Object.freeze([1, 2, 3].map(makePart));

const toBuffer = (d) => (Buffer.isBuffer(d) ? d : Buffer.from(String(d), BUFFER_ENCODING_UTF8));

const testUriMatch = (list, uri) =>
  Boolean(list && Array.from(Array.isArray(list) || list instanceof Set ? list : [list])
    .some((it) => typeof it === 'string' && it && uri.includes(it)));

const verifyFail = (list, uri, code) => {
  if (testUriMatch(list, uri)) throw Object.assign(new Error(code), {code});
};

const checkAdapterFailures = (f, uri) => {
  verifyFail(f.unreachableUris, uri, L3_CODE.DESTINATION_UNREACHABLE);
  verifyFail(f.writeDeniedUris, uri, L3_CODE.DESTINATION_WRITE_DENIED);
  verifyFail(f.streamInterruptUris, uri, L3_CODE.BACKUP_STREAM_INTERRUPTED);
};

function applyByteCorruption(f, uri, buf) {
  if (testUriMatch(f.corruptManifestUris, uri) || testUriMatch(f.corruptSegmentUris, uri)) {
    const cp = Buffer.from(buf);
    if (cp.length > 0) cp[0] ^= CORRUPTION_XOR_BYTE_MASK;
    return cp;
  }
  return buf;
}

class DefaultStorageAdapter {
  constructor(opts = {}) {
    this.storage = new Map();
    this.failures = opts;
  }
  async write(uri, data) {
    checkAdapterFailures(this.failures, uri);
    this.storage.set(uri, toBuffer(data));
  }
  async read(uri) {
    verifyFail(this.failures.unreachableUris, uri, L3_CODE.DESTINATION_UNREACHABLE);
    const buf = this.storage.get(uri);
    if (!buf) {
      throw Object.assign(new Error(STORAGE_NOT_FOUND_CODE), {code: STORAGE_NOT_FOUND_CODE});
    }
    return applyByteCorruption(this.failures, uri, buf);
  }
  has = (uri) => this.storage.has(uri);
}

const normalizeBaseUri = (uri) =>
  (typeof uri === 'string' && uri.endsWith(URI_PATH_SEPARATOR) ? uri.slice(0, -1) : (uri || ''));

function makeOp(owner, opId, lagrangeOpId, params, state, code, ts) {
  const op = {
    schemaVersion: 1, sourceContract: CONTRACT.SOURCE_CONTRACT,
    sourceContractVersion: CONTRACT.SOURCE_CONTRACT_VERSION,
    operationId: opId, lagrangeOperationId: lagrangeOpId, kind: OP_KIND.CREATE_BACKUP,
    state, reasonCode: code, updatedAtMs: ts,
  };
  Object.defineProperty(op, NON_ENUMERABLE_PARAMETERS_KEY, {value: params, writable: true});
  owner.operations.set(opId, op);
  return op;
}

function shapeOperationStatus(op) {
  if (!op) return UNSET;
  const res = {...op};
  if (op.parameters) {
    Object.defineProperty(res, NON_ENUMERABLE_PARAMETERS_KEY, {value: op.parameters});
  }
  return res;
}

const updateOperationState = (op, state, code, t) =>
  Object.assign(op, {state, reasonCode: code, updatedAtMs: t});

const isSameOpParams = (p1, p2) =>
  p1?.backupId === p2?.backupId && p1?.destinationUri === p2?.destinationUri;

function toPayloadBuffer(p) {
  if (Buffer.isBuffer(p?.payload)) return p.payload;
  const raw = p?.payload ?? `${BMC.SEGMENT_PREFIX}${p?.partitionId}${DEFAULT_PARTITION_PAYLOAD_SUFFIX}`;
  return Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw), BUFFER_ENCODING_UTF8);
}

function computeDigest(data) {
  const hex = createHash(DIGEST_ALGORITHM_SHA256).update(data).digest(DIGEST_ENCODING_HEX);
  return `${BMC.DIGEST_PREFIX}${hex}`;
}

const normDigest = (d) => (d?.startsWith(BMC.DIGEST_PREFIX) ? d : `${BMC.DIGEST_PREFIX}${d}`);
const digestsEqual = (a, b) => Boolean(a && b && normDigest(a) === normDigest(b));

function removeManifestDigest(m) {
  const {manifestDigest: _d, ...rest} = m;
  return rest;
}

const selectDistinctClusterId = (id, src) =>
  (id && id !== src ? id : `${CONTRACT.DEFAULT_CLUSTER_ID_PREFIX}${randomUUID()}`);

const isPreserveIdentity = (opts) =>
  opts.preserveClusterIdentityForDisasterRecovery === true ||
  (Array.isArray(opts.cliFlags) && opts.cliFlags.includes(BMC.PRESERVE_IDENTITY_FLAG));

function isInvalidDestinationUri(uri) {
  if (typeof uri !== 'string' || !uri || uri.length > CONTRACT.MAX_DESTINATION_URI_LENGTH) {
    return true;
  }
  try {
    const p = new URL(uri);
    return !BMC.ALLOWED_URI_SCHEMES.includes(p.protocol) || Boolean(p.username || p.password) ||
      BMC.FORBIDDEN_BYOC_HOST_PATTERNS.some((pat) => (p.hostname || p.host || '').includes(pat));
  } catch (_e) {
    return true;
  }
}
const PREFLIGHT_RULES = Object.freeze([
  [(o) => !o.capabilitySupported, L3_CODE.BACKUP_CAPABILITY_UNSUPPORTED],
  [(o, s) => s?.hasActiveOperation || o.hasActiveOperation(), L3_CODE.CONCURRENT_OPERATION_ACTIVE],
  [(_o, _s, p) => isInvalidDestinationUri(p?.destinationUri), L3_CODE.DESTINATION_URI_INVALID],
  [(_o, s) => s?.ready === false, L3_CODE.CLUSTER_NOT_READY],
  [(_o, s) => s?.hasPartitionQuorum === false, L3_CODE.PARTITION_QUORUM_UNAVAILABLE],
  [(o, _s, p) => o.isBackupIdConflicting(p?.backupId, p?.destinationUri),
    L3_CODE.BACKUP_ID_CONFLICT],
]);

function findPreflightViolationCode(owner, params, snapshot) {
  const match = PREFLIGHT_RULES.find(([fn]) => fn(owner, snapshot, params));
  return match ? match[1] : UNSET;
}

const classifyBackupError = (err) => {
  const t = `${err?.code || ''} ${err?.message || ''}`;
  const hit = ERROR_CLASSIFIERS.find(([rx]) => rx.test(t));
  return hit ? hit[1] : L3_CODE.BACKUP_STREAM_INTERRUPTED;
};

const failVerification = () => {
  throw Object.assign(new Error(L3_CODE.BACKUP_VERIFICATION_FAILED),
    {code: L3_CODE.BACKUP_VERIFICATION_FAILED});
};

function verifySegmentPayload(part, buf) {
  const exp = part.sizeBytes !== undefined ? part.sizeBytes : part.byteLength;
  if (buf.length !== exp || !digestsEqual(computeDigest(buf), part.sha256)) failVerification();
}

async function loadAndVerifyBackup(adapter, destinationUri) {
  const base = normalizeBaseUri(destinationUri);
  let manifest;
  try {
    const raw = await adapter.read(`${base}/${BMC.MANIFEST_FILENAME}`);
    manifest = JSON.parse(String(raw));
  } catch (err) {
    if (err?.code === L3_CODE.DESTINATION_UNREACHABLE) throw err;
    failVerification();
  }
  if (!digestsEqual(computeDigest(JSON.stringify(removeManifestDigest(manifest))),
    manifest?.manifestDigest)) failVerification();
  const parts = manifest?.partitions || [];
  if (parts.length === 0) failVerification();
  const loaded = [];
  for (const part of parts) {
    const data = await adapter.read(`${base}/${part.segmentPath}`);
    const buf = toBuffer(data);
    verifySegmentPayload(part, buf);
    loaded.push({
      partitionId: part.partitionId, raftLogIndex: part.raftLogIndex,
      raftTerm: part.raftTerm, payload: buf,
    });
  }
  return {manifest, partitions: loaded};
}

const OWNER_DEFAULTS = Object.freeze({
  capabilitySupported: true, clusterId: DEFAULT_BACKUP_CLUSTER_ID,
  releaseVersion: CONTRACT.DEFAULT_RELEASE_VERSION,
  restoreInProgress: false, restoreAborted: false,
  restoredFrom: UNSET, hydratedPartitions: UNSET, activeOperation: UNSET,
});

const genOpId = (id) => (id || `${CONTRACT.OPERATION_ID_PREFIX}${randomUUID()}`);

class BackupRestoreOwner {
  constructor(opts = {}) {
    Object.assign(this, OWNER_DEFAULTS, opts);
    this.getClusterIdOption = opts.getClusterId;
    this.getReleaseVersionOption = opts.getReleaseVersion;
    this.operations = new Map();
    this.completedBackups = new Map();
    this.storageAdapter = opts.storageAdapter || new DefaultStorageAdapter(opts);
    if (opts.storageAdapter) Object.assign(this.storageAdapter.failures, opts);
  }
  getClusterId = () => this.getClusterIdOption?.() || this.clusterId;
  setClusterId = (id) => ((this.clusterId = id), this.onSetClusterId?.(id));
  getReleaseVersion = () => this.getReleaseVersionOption?.() || this.releaseVersion;
  isRestoreInProgress = () => this.restoreInProgress === true;
  isRestoreAborted = () => this.restoreAborted === true;
  getRestoredFrom = () => this.restoredFrom;
  getHydratedPartitions = () => this.hydratedPartitions;
  getActiveOperation = () => this.activeOperation;
  hasActiveOperation = () => this.activeOperation !== UNSET;
  getOperation = (id) => shapeOperationStatus(this.operations.get(id));
  getBackupStatus = (id) => this.getOperation(id);
  getOperationStatus = (id) => this.getOperation(id);

  mergeSnapshot = (snap) => ({
    ready: true, hasPartitionQuorum: true, hasActiveOperation: false,
    epoch: 1, logicalTimestamp: Date.now(), partitions: DEFAULT_PARTITIONS,
    ...(this.getClusterSnapshot?.() || {}), ...snap,
  });
  isBackupIdConflicting(id, dest) {
    if (typeof id === 'string' && this.completedBackups.has(id)) return true;
    const m = `${normalizeBaseUri(dest)}/${BMC.MANIFEST_FILENAME}`;
    return Boolean(typeof dest === 'string' && dest && this.storageAdapter?.has?.(m));
  }
  evaluatePreflight(parameters, clusterSnapshot = {}) {
    const code = findPreflightViolationCode(this, parameters, this.mergeSnapshot(clusterSnapshot));
    return {valid: code === UNSET, ok: code === UNSET, reasonCode: code};
  }
  finishOp(op, state, code) {
    this.activeOperation = UNSET;
    return shapeOperationStatus(updateOperationState(op, state, code, Date.now()));
  }

  async createBackup(options = {}) {
    const nowMs = options.nowMs || Date.now();
    const parameters = options.parameters ||
      {backupId: options.backupId, destinationUri: options.destinationUri};
    const opId = genOpId(options.operationId);
    const lagrangeOpId = genOpId(options.lagrangeOperationId);
    const existing = this.operations.get(opId);
    if (existing) {
      if (isSameOpParams(existing.parameters, parameters)) return shapeOperationStatus(existing);
      throw Object.assign(new Error(OPERATION_CONFLICT_MESSAGE), {
        code: ERR_CODE.OPERATION_CONFLICT,
      });
    }

    const clusterSnapshot = this.mergeSnapshot(options.clusterSnapshot);
    const preflightCode = findPreflightViolationCode(this, parameters, clusterSnapshot);
    if (preflightCode !== UNSET) {
      return shapeOperationStatus(makeOp(
        this, opId, lagrangeOpId, parameters, OP_STATE.REJECTED, preflightCode, nowMs));
    }

    const activeOp = makeOp(
      this, opId, lagrangeOpId, parameters, OP_STATE.IN_PROGRESS, UNSET, nowMs);
    this.activeOperation = activeOp;

    try {
      const manifest = await this.streamBackup(parameters, clusterSnapshot, nowMs);
      this.completedBackups.set(parameters.backupId, {
        backupId: parameters.backupId, destinationUri: parameters.destinationUri,
        manifest, createdAtMs: nowMs,
      });
      return this.finishOp(activeOp, OP_STATE.SUCCEEDED, UNSET);
    } catch (err) {
      return this.finishOp(activeOp, OP_STATE.FAILED, classifyBackupError(err));
    }
  }

  async streamBackup(params, snap, nowMs) {
    if (snap.hasPartitionQuorum === false) {
      throw Object.assign(new Error(L3_CODE.PARTITION_QUORUM_UNAVAILABLE),
        {code: L3_CODE.PARTITION_QUORUM_UNAVAILABLE});
    }
    const base = normalizeBaseUri(params.destinationUri);
    const manifestParts = [];
    for (const p of (snap.partitions || DEFAULT_PARTITIONS)) {
      const segPath = `${SEGMENT_PATH_PREFIX}${p.partitionId}${BMC.SEGMENT_EXTENSION}`;
      const payloadBuf = toPayloadBuffer(p);
      await this.storageAdapter.write(`${base}/${segPath}`, payloadBuf);
      manifestParts.push({
        partitionId: p.partitionId, raftLogIndex: p.raftLogIndex ?? DEFAULT_RAFT_LOG_INDEX,
        raftTerm: p.raftTerm ?? 1, segmentPath: segPath, sizeBytes: payloadBuf.length,
        sha256: computeDigest(payloadBuf),
      });
    }
    const manifestData = {
      schemaVersion: 1, backupId: params.backupId, clusterIdentity: this.getClusterId(),
      lagrangeVersion: this.getReleaseVersion(), createdAtMs: nowMs,
      consistentCut: {epoch: snap.epoch ?? 1, logicalTimestamp: snap.logicalTimestamp ?? nowMs},
      partitions: manifestParts,
    };
    const full = {...manifestData, manifestDigest: computeDigest(JSON.stringify(manifestData))};
    await this.storageAdapter.write(
      `${base}/${BMC.MANIFEST_FILENAME}`, JSON.stringify(full, null, 2));
    await loadAndVerifyBackup(this.storageAdapter, params.destinationUri);
    return full;
  }

  async restoreFromBackup(options = {}) {
    const dest = options.destinationUri;
    const preserve = isPreserveIdentity(options);
    this.restoreInProgress = true;
    this.restoreAborted = false;

    try {
      const {manifest, partitions} = await loadAndVerifyBackup(this.storageAdapter, dest);
      this.hydratedPartitions = partitions;
      this.onHydratePartitions?.(partitions);
      const srcId = manifest.clusterIdentity;
      const targetId = preserve ? srcId :
        selectDistinctClusterId(options.newClusterIdentity, srcId);
      this.setClusterId(targetId);
      this.restoredFrom = {sourceClusterIdentity: srcId, backupId: manifest.backupId};
      this.restoreInProgress = false;
      return {success: true, clusterIdentity: this.getClusterId(), restoredFrom: this.restoredFrom};
    } catch (err) {
      this.restoreAborted = true;
      this.restoreInProgress = false;
      throw Object.assign(new Error(err?.message || L3_CODE.BACKUP_VERIFICATION_FAILED),
        {code: L3_CODE.BACKUP_VERIFICATION_FAILED});
    }
  }
}

export {BackupRestoreOwner};
