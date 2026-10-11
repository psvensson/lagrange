// Volatile capacity and lifetime owner for CDC coverage row transfers. It is
// deliberately not a progress ledger: restart or lifecycle retirement drops
// every session and the caller recaptures the row from its durable source.

import {PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor} from
  '../control-plane/pressure-governor.js';

const CDC_COVERAGE_TRANSFER_DEFAULT = Object.freeze({
  CHUNK_BYTES: 512 * 1024,
  MAX_RETAINED_BYTES: 128 * 1024 * 1024,
  MAX_SESSIONS: 8,
  SESSION_TTL_MS: 30000,
});
const owners = new WeakMap();
const nodePools = new Map();
const CDC_COVERAGE_TRANSFER_RESOURCE =
  Object.freeze(['snapshot-transfer:cdc-coverage']);

function positiveSafeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function clockOf(service) {
  return service?.timeSource && typeof service.timeSource.now === 'function' ?
    service.timeSource : {
      now: () => Date.now(),
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (timer) => clearTimeout(timer),
    };
}

function nodePoolKey(service) {
  return typeof service?.nodeId === 'string' && service.nodeId.length > 0 ?
    `node:${service.nodeId}` : service;
}

function poolFor(service) {
  const key = nodePoolKey(service);
  let pool = nodePools.get(key);
  if (!pool) {
    pool = {key, endpointCount: 0, sessionCount: 0, retainedBytes: 0,
      maxRetainedBytes: CDC_COVERAGE_TRANSFER_DEFAULT.MAX_RETAINED_BYTES,
      maxSessions: CDC_COVERAGE_TRANSFER_DEFAULT.MAX_SESSIONS,
      highWaterBytes: 0, refusals: 0, releases: 0,
      liveBytesByCategory: new Map(), limitsByOwner: new Map(),
      wakeCallbacks: new Set()};
    nodePools.set(key, pool);
  }
  return pool;
}

function refreshPoolLimits(pool) {
  const limits = [...pool.limitsByOwner.values()];
  pool.maxRetainedBytes = limits.length === 0 ?
    CDC_COVERAGE_TRANSFER_DEFAULT.MAX_RETAINED_BYTES :
    Math.min(...limits.map((value) => value.maxRetainedBytes));
  pool.maxSessions = limits.length === 0 ?
    CDC_COVERAGE_TRANSFER_DEFAULT.MAX_SESSIONS :
    Math.min(...limits.map((value) => value.maxSessions));
}

function releaseSession(owner, transferId) {
  const session = owner.sessions.get(transferId);
  if (!session) return false;
  owner.sessions.delete(transferId);
  owner.pool.sessionCount -= 1;
  owner.pool.retainedBytes -= session.retainedBytes;
  const categoryBytes = owner.pool.liveBytesByCategory.get(session.category) ?? 0;
  if (categoryBytes <= session.retainedBytes) {
    owner.pool.liveBytesByCategory.delete(session.category);
  } else {
    owner.pool.liveBytesByCategory.set(
      session.category, categoryBytes - session.retainedBytes);
  }
  owner.pool.releases += 1;
  if (session.timer !== null) owner.clock.clearTimeout(session.timer);
  session.timer = null;
  session.released = true;
  if (Array.isArray(session.value?.chunks)) session.value.chunks.length = 0;
  session.value = null;
  for (const wake of owner.pool.wakeCallbacks) wake();
  return true;
}

function ownerFor(service) {
  let owner = owners.get(service);
  if (owner && !owner.retired) return owner;
  const clock = clockOf(service);
  const maxRetainedBytes = positiveSafeInteger(
    service?.cdcCoverageTransferCapacityBytes,
    CDC_COVERAGE_TRANSFER_DEFAULT.MAX_RETAINED_BYTES);
  const maxSessions = positiveSafeInteger(service?.cdcCoverageTransferMaxSessions,
    CDC_COVERAGE_TRANSFER_DEFAULT.MAX_SESSIONS);
  const pool = poolFor(service);
  pool.endpointCount += 1;
  owner = {service, clock, sessions: new Map(), pool, retired: false,
    wakeCallbacks: new Set()};
  pool.limitsByOwner.set(owner, {maxRetainedBytes, maxSessions});
  refreshPoolLimits(pool);
  owners.set(service, owner);
  return owner;
}

function pressureAllowsTransfer(service) {
  const router = service?.messageRouter ?? service?.transport;
  const options = {nodeId: service?.nodeId,
    now: service?.timeSource?.now ? () => service.timeSource.now() : undefined,
    logger: service?.logger ?? null};
  if (router) options.messageRouter = router;
  const decision = PressureGovernor.getShared(options).evaluate({
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    resourceKeys: CDC_COVERAGE_TRANSFER_RESOURCE,
  });
  return decision.action === PRESSURE_GOVERNOR_ACTION.ALLOW;
}

function reserveCdcCoverageTransfer(service, options = {}) {
  const owner = ownerFor(service);
  const transferId = options.transferId;
  const retainedBytes = options.retainedBytes;
  const category = typeof options.category === 'string' &&
    options.category.length > 0 ? options.category : 'unspecified';
  if (owner.retired || !pressureAllowsTransfer(service) ||
      typeof transferId !== 'string' || transferId.length === 0 ||
      !Number.isSafeInteger(retainedBytes) || retainedBytes <= 0 ||
      owner.sessions.has(transferId) ||
      owner.pool.sessionCount >= owner.pool.maxSessions ||
      retainedBytes > owner.pool.maxRetainedBytes - owner.pool.retainedBytes) {
    owner.pool.refusals += 1;
    return null;
  }
  const ttlMs = positiveSafeInteger(options.ttlMs,
    CDC_COVERAGE_TRANSFER_DEFAULT.SESSION_TTL_MS);
  const session = {transferId, retainedBytes, category,
    value: options.value ?? null, released: false, timer: null};
  owner.sessions.set(transferId, session);
  owner.pool.sessionCount += 1;
  owner.pool.retainedBytes += retainedBytes;
  owner.pool.highWaterBytes = Math.max(
    owner.pool.highWaterBytes, owner.pool.retainedBytes);
  owner.pool.liveBytesByCategory.set(category,
    (owner.pool.liveBytesByCategory.get(category) ?? 0) + retainedBytes);
  session.timer = owner.clock.setTimeout(
    () => releaseSession(owner, transferId), ttlMs);
  session.timer?.unref?.();
  return session;
}

function registerCdcCoverageTransferWake(service, wake) {
  if (typeof wake !== 'function') return () => {};
  const owner = ownerFor(service);
  owner.wakeCallbacks.add(wake);
  owner.pool.wakeCallbacks.add(wake);
  return () => {
    owner.wakeCallbacks.delete(wake);
    owner.pool.wakeCallbacks.delete(wake);
  };
}

function resizeCdcCoverageTransfer(service, transferId, expected,
  retainedBytes) {
  const owner = owners.get(service);
  const session = owner?.sessions.get(transferId);
  if (!owner || owner.retired || session !== expected || session.released ||
      !Number.isSafeInteger(retainedBytes) || retainedBytes <= 0) return false;
  const delta = retainedBytes - session.retainedBytes;
  if (delta > owner.pool.maxRetainedBytes - owner.pool.retainedBytes) {
    owner.pool.refusals += 1;
    return false;
  }
  if (delta === 0) return true;
  owner.pool.retainedBytes += delta;
  owner.pool.highWaterBytes = Math.max(
    owner.pool.highWaterBytes, owner.pool.retainedBytes);
  const categoryBytes = owner.pool.liveBytesByCategory.get(session.category) ?? 0;
  const nextCategoryBytes = categoryBytes + delta;
  if (nextCategoryBytes <= 0) {
    owner.pool.liveBytesByCategory.delete(session.category);
  } else {
    owner.pool.liveBytesByCategory.set(session.category, nextCategoryBytes);
  }
  session.retainedBytes = retainedBytes;
  return true;
}

function readCdcCoverageTransfer(service, transferId) {
  const owner = owners.get(service);
  return owner && !owner.retired ? owner.sessions.get(transferId) ?? null : null;
}

function setCdcCoverageTransferValue(service, transferId, value) {
  const session = readCdcCoverageTransfer(service, transferId);
  if (!session || session.released) return false;
  session.value = value;
  return true;
}

function releaseCdcCoverageTransfer(service, transferId) {
  const owner = owners.get(service);
  return owner ? releaseSession(owner, transferId) : false;
}

function releaseCdcCoverageTransferSession(service, transferId, expected) {
  const owner = owners.get(service);
  if (!owner || owner.sessions.get(transferId) !== expected) return false;
  return releaseSession(owner, transferId);
}

function retireCdcCoverageTransferOwner(service) {
  const owner = owners.get(service);
  if (!owner || owner.retired) return false;
  owner.retired = true;
  for (const transferId of [...owner.sessions.keys()]) {
    releaseSession(owner, transferId);
  }
  owners.delete(service);
  owner.pool.endpointCount -= 1;
  owner.pool.limitsByOwner.delete(owner);
  for (const wake of owner.wakeCallbacks) owner.pool.wakeCallbacks.delete(wake);
  owner.wakeCallbacks.clear();
  refreshPoolLimits(owner.pool);
  if (owner.pool.endpointCount === 0 && owner.pool.sessionCount === 0) {
    nodePools.delete(owner.pool.key);
  }
  return true;
}

function readCdcCoverageTransferDiagnostics(service) {
  const owner = owners.get(service);
  const pool = owner?.pool;
  const held = [];
  for (const endpointOwner of pool?.limitsByOwner.keys() ?? []) {
    for (const session of endpointOwner.sessions.values()) {
      const sourceScope = session.value?.sourceScope ??
        session.value?.offer?.sourceScope;
      const binding = session.value?.binding ?? session.value?.offer?.binding;
      held.push(Object.freeze({transferId: session.transferId,
        category: session.category, retainedBytes: session.retainedBytes,
        endpointNodeId: endpointOwner.service?.nodeId ?? null,
        partitionId: sourceScope?.partitionId ?? null,
        tableName: sourceScope?.tableName ?? null,
        targetNodeId: binding?.targetNodeId ?? null,
        targetLifecycleId: binding?.targetLifecycleId ?? null,
        reconcileGenerationId:
          binding?.reconcileGenerationId ?? null}));
    }
  }
  return Object.freeze({sessions: pool?.sessionCount ?? 0,
    retainedBytes: pool?.retainedBytes ?? 0,
    highWaterBytes: pool?.highWaterBytes ?? 0,
    refusals: pool?.refusals ?? 0,
    releases: pool?.releases ?? 0,
    held: Object.freeze(held),
    liveBytesByCategory: Object.freeze(Object.fromEntries(
      pool?.liveBytesByCategory ?? [])),
    maxSessions: pool?.maxSessions ?? positiveSafeInteger(
      service?.cdcCoverageTransferMaxSessions,
      CDC_COVERAGE_TRANSFER_DEFAULT.MAX_SESSIONS),
    maxRetainedBytes: pool?.maxRetainedBytes ?? positiveSafeInteger(
      service?.cdcCoverageTransferCapacityBytes,
      CDC_COVERAGE_TRANSFER_DEFAULT.MAX_RETAINED_BYTES)});
}

export {
  CDC_COVERAGE_TRANSFER_DEFAULT,
  readCdcCoverageTransfer,
  readCdcCoverageTransferDiagnostics,
  registerCdcCoverageTransferWake,
  releaseCdcCoverageTransfer,
  releaseCdcCoverageTransferSession,
  resizeCdcCoverageTransfer,
  reserveCdcCoverageTransfer,
  retireCdcCoverageTransferOwner,
  setCdcCoverageTransferValue,
};
