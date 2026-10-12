// Volatile capacity and lifetime owner for CDC coverage row transfers. It is
// deliberately not a progress ledger: restart or lifecycle retirement drops
// every session and the caller recaptures the row from its durable source.

import {Buffer} from 'node:buffer';
import {isIssuedBootIncarnation} from
  '../bootstrap/boot-incarnation-contract.js';
import {PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor} from
  '../control-plane/pressure-governor.js';

const CDC_COVERAGE_TRANSFER_DEFAULT = Object.freeze({
  CHUNK_BYTES: 512 * 1024,
  LISTENER_BASE_BYTES: 16 * 1024 * 1024,
  LISTENER_TERMINAL_BYTES: 16 * 1024,
  MAX_RETAINED_BYTES: 128 * 1024 * 1024,
  MAX_SESSIONS: 8,
  SESSION_TTL_MS: 30000,
});
const CDC_COVERAGE_LISTENER_STATE = Object.freeze({
  ACTIVE: 'active',
  TRANSFERRING: 'transferring',
  TERMINAL_TRANSFERRED: 'terminal-transferred',
});
const CDC_COVERAGE_LISTENER_CATEGORY = Object.freeze({
  LISTENER: 'coverage-listener',
  TERMINAL: 'coverage-listener-terminal',
});
const CDC_COVERAGE_TERMINAL_LIMIT = Object.freeze({
  IMMEDIATE_COUNT: 2,
  IMMEDIATE_BYTES: 4 * 1024,
  COMPLETION_COUNT: 2,
  COMPLETION_BYTES: 8 * 1024,
  ALIAS_SET_COUNT: 1,
  ALIAS_BYTES: 4 * 1024,
  DESTROY_ID_COUNT: 2,
  LISTENER_GENERATION_BYTES: 128,
});
const owners = new WeakMap();
const nodePools = new Map();
const listenerClaimStates = new WeakMap();
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const CDC_COVERAGE_TRANSFER_RESOURCE =
  Object.freeze(['snapshot-transfer:cdc-coverage']);
const TERMINAL_DESCRIPTOR_FIELDS = Object.freeze([
  'listenerGenerationId',
  'immediateCount',
  'immediateBytes',
  'completionCount',
  'completionBytes',
  'aliasSetCount',
  'aliasBytes',
  'destroyIdCount',
]);
const TERMINAL_DESCRIPTOR_NUMBER_FIELDS = Object.freeze(
  TERMINAL_DESCRIPTOR_FIELDS.slice(1),
);
const TERMINAL_TRANSFER_OPTION_FIELDS = Object.freeze([
  'shutdownRecord',
  'terminalize',
  'descriptor',
]);

function positiveSafeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function validListenerGenerationId(value) {
  return typeof value === 'string' && value.length > 0 &&
    Buffer.byteLength(value) <=
      CDC_COVERAGE_TERMINAL_LIMIT.LISTENER_GENERATION_BYTES;
}

function hasNodePoolIdentity(service) {
  return typeof service?.nodeId === 'string' && service.nodeId.length > 0;
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
      wakeCallbacks: new Set(), activeListenerClaim: null,
      terminalRetained: false, terminalDescriptor: null,
      listenerGenerations: 0, wakeFailures: 0};
    nodePools.set(key, pool);
  }
  return pool;
}

function addCategoryBytes(pool, category, bytes) {
  pool.liveBytesByCategory.set(category,
    (pool.liveBytesByCategory.get(category) ?? 0) + bytes);
}

function subtractCategoryBytes(pool, category, bytes) {
  const current = pool.liveBytesByCategory.get(category) ?? 0;
  if (current <= bytes) {
    pool.liveBytesByCategory.delete(category);
  } else {
    pool.liveBytesByCategory.set(category, current - bytes);
  }
}

function captureTerminalDescriptor(descriptor, expectedGenerationId) {
  if (!descriptor || typeof descriptor !== 'object') return null;
  const captured = Object.create(null);
  try {
    for (const field of TERMINAL_DESCRIPTOR_FIELDS) {
      const property = objectGetOwnPropertyDescriptor(descriptor, field);
      if (!property || !objectHasOwn(property, 'value')) return null;
      captured[field] = property.value;
    }
  } catch {
    return null;
  }
  if (captured.listenerGenerationId !== expectedGenerationId ||
      !validListenerGenerationId(captured.listenerGenerationId)) {
    return null;
  }
  if (!TERMINAL_DESCRIPTOR_NUMBER_FIELDS.every((field) => {
    const value = captured[field];
    return Number.isSafeInteger(value) && value >= 0 &&
      !Object.is(value, -0);
  })) {
    return null;
  }
  if (!(captured.immediateCount <=
      CDC_COVERAGE_TERMINAL_LIMIT.IMMEDIATE_COUNT &&
    captured.immediateBytes <=
      CDC_COVERAGE_TERMINAL_LIMIT.IMMEDIATE_BYTES &&
    captured.completionCount <=
      CDC_COVERAGE_TERMINAL_LIMIT.COMPLETION_COUNT &&
    captured.completionBytes <=
      CDC_COVERAGE_TERMINAL_LIMIT.COMPLETION_BYTES &&
    captured.aliasSetCount <=
      CDC_COVERAGE_TERMINAL_LIMIT.ALIAS_SET_COUNT &&
    captured.aliasBytes <= CDC_COVERAGE_TERMINAL_LIMIT.ALIAS_BYTES &&
    captured.destroyIdCount <=
      CDC_COVERAGE_TERMINAL_LIMIT.DESTROY_ID_COUNT &&
    captured.immediateBytes + captured.completionBytes +
      captured.aliasBytes <=
      CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_TERMINAL_BYTES)) {
    return null;
  }
  return Object.freeze(captured);
}

function captureTerminalTransferOptions(options) {
  if (!options || typeof options !== 'object') return null;
  const captured = Object.create(null);
  try {
    for (const field of TERMINAL_TRANSFER_OPTION_FIELDS) {
      const property = objectGetOwnPropertyDescriptor(options, field);
      if (!property || !objectHasOwn(property, 'value')) return null;
      captured[field] = property.value;
    }
  } catch {
    return null;
  }
  if (!captured.shutdownRecord ||
      typeof captured.shutdownRecord !== 'object' ||
      typeof captured.terminalize !== 'function') {
    return null;
  }
  return captured;
}

function dispatchWakeCallbacks(pool) {
  let failures = 0;
  for (const wake of [...pool.wakeCallbacks]) {
    try {
      wake();
    } catch {
      failures += 1;
    }
  }
  pool.wakeFailures += failures;
  return failures;
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
  subtractCategoryBytes(owner.pool, session.category, session.retainedBytes);
  owner.pool.releases += 1;
  if (session.timer !== null) owner.clock.clearTimeout(session.timer);
  session.timer = null;
  session.released = true;
  if (Array.isArray(session.value?.chunks)) session.value.chunks.length = 0;
  session.value = null;
  dispatchWakeCallbacks(owner.pool);
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
  addCategoryBytes(owner.pool, category, retainedBytes);
  session.timer = owner.clock.setTimeout(
    () => releaseSession(owner, transferId), ttlMs);
  session.timer?.unref?.();
  return session;
}

/**
 * Reserve the fixed CDC listener population without consuming a root transfer
 * session. The first generation atomically retains the complete 16 MiB base;
 * later generations reuse the standing terminal subreserve and acquire only
 * listener capacity.
 * @param {Object} service node-scoped transfer owner endpoint
 * @param {Object} options exact boot/listener/shutdown identities
 * @return {Object|null} opaque exact-once listener claim
 */
function reserveCdcCoverageListenerBase(service, options = {}) {
  const owner = ownerFor(service);
  const pool = owner.pool;
  const bootIncarnation = options.bootIncarnation;
  const listenerGenerationId = options.listenerGenerationId;
  const shutdownRecord = options.shutdownRecord;
  const validIdentity = hasNodePoolIdentity(service) &&
    isIssuedBootIncarnation(bootIncarnation) &&
    validListenerGenerationId(listenerGenerationId) && shutdownRecord &&
    typeof shutdownRecord === 'object';
  const retainedBytes = pool.terminalRetained ?
    CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_BASE_BYTES -
      CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_TERMINAL_BYTES :
    CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_BASE_BYTES;
  if (owner.retired || !validIdentity || pool.activeListenerClaim ||
      retainedBytes > pool.maxRetainedBytes - pool.retainedBytes) {
    pool.refusals += 1;
    return null;
  }
  const claim = Object.freeze({bootIncarnation, listenerGenerationId});
  const state = {owner, pool, shutdownRecord, firstCheckEntered: false,
    releaseCapability: {}, state: CDC_COVERAGE_LISTENER_STATE.ACTIVE};
  listenerClaimStates.set(claim, state);
  pool.activeListenerClaim = claim;
  pool.listenerGenerations += 1;
  pool.retainedBytes += retainedBytes;
  pool.highWaterBytes = Math.max(pool.highWaterBytes, pool.retainedBytes);
  if (!pool.terminalRetained) {
    pool.terminalRetained = true;
    addCategoryBytes(pool, CDC_COVERAGE_LISTENER_CATEGORY.TERMINAL,
      CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_TERMINAL_BYTES);
  }
  addCategoryBytes(pool, CDC_COVERAGE_LISTENER_CATEGORY.LISTENER,
    CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_BASE_BYTES -
      CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_TERMINAL_BYTES);
  return claim;
}

function enterCdcCoverageListenerTerminalCheck(service, claim) {
  const owner = owners.get(service);
  const state = listenerClaimStates.get(claim);
  if (!owner || owner.retired || !state || state.owner !== owner ||
      state.pool.activeListenerClaim !== claim ||
      state.state !== CDC_COVERAGE_LISTENER_STATE.ACTIVE) {
    return false;
  }
  // Reaching the successor's first check proves the prior generation's
  // processImmediate stack/list aliases are gone. Replace that conservative
  // descriptor without returning bytes or notifying a waiter.
  state.pool.terminalDescriptor = null;
  state.firstCheckEntered = true;
  return true;
}

/**
 * Transfer one drained listener generation to the standing terminal reserve.
 * The MessageRouter callback must synchronously install its fixed terminal
 * result and strip transport pointers. Only then is the exact release token
 * consumed, Wlistener returned and existing wake callbacks invoked.
 * @param {Object} service node-scoped transfer owner endpoint
 * @param {Object} claim opaque result of reserveCdcCoverageListenerBase
 * @param {Object} options terminal descriptor and MessageRouter mutation
 * @return {boolean} whether the exact generation transferred once
 */
function transferCdcCoverageListenerToTerminal(service, claim, options = {}) {
  const initialOwner = owners.get(service);
  const initialState = listenerClaimStates.get(claim);
  if (!initialOwner || initialOwner.retired || !initialState ||
      initialState.owner !== initialOwner ||
      initialState.pool.activeListenerClaim !== claim ||
      initialState.state !== CDC_COVERAGE_LISTENER_STATE.ACTIVE ||
      initialState.firstCheckEntered !== true ||
      initialState.releaseCapability === null) {
    return false;
  }
  const capturedOptions = captureTerminalTransferOptions(options);
  if (!capturedOptions) return false;
  const descriptor = captureTerminalDescriptor(
    capturedOptions.descriptor, claim.listenerGenerationId);
  if (!descriptor) return false;
  // Both option capture and own-data descriptor capture can invoke Proxy
  // getOwnPropertyDescriptor traps. Reacquire the exact claim only after all
  // such callouts; no caller-controlled value is read again after this point.
  const owner = owners.get(service);
  const state = listenerClaimStates.get(claim);
  if (!owner || owner.retired || !state || state.owner !== owner ||
      state.pool.activeListenerClaim !== claim ||
      state.state !== CDC_COVERAGE_LISTENER_STATE.ACTIVE ||
      state.shutdownRecord !== capturedOptions.shutdownRecord ||
      state.firstCheckEntered !== true ||
      state.releaseCapability === null) {
    return false;
  }
  const terminalResult = Object.freeze({
    state: CDC_COVERAGE_LISTENER_STATE.TERMINAL_TRANSFERRED,
    bootIncarnation: claim.bootIncarnation,
    listenerGenerationId: claim.listenerGenerationId,
  });
  const releaseCapability = state.releaseCapability;
  state.state = CDC_COVERAGE_LISTENER_STATE.TRANSFERRING;
  state.releaseCapability = null;
  let installedResult;
  try {
    installedResult = capturedOptions.terminalize(terminalResult);
  } catch {
    state.state = CDC_COVERAGE_LISTENER_STATE.ACTIVE;
    state.releaseCapability = releaseCapability;
    return false;
  }
  if (installedResult !== terminalResult) {
    state.state = CDC_COVERAGE_LISTENER_STATE.ACTIVE;
    state.releaseCapability = releaseCapability;
    return false;
  }
  const pool = state.pool;
  state.state = CDC_COVERAGE_LISTENER_STATE.TERMINAL_TRANSFERRED;
  state.shutdownRecord = null;
  pool.terminalDescriptor = descriptor;
  pool.activeListenerClaim = null;
  const listenerBytes =
    CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_BASE_BYTES -
    CDC_COVERAGE_TRANSFER_DEFAULT.LISTENER_TERMINAL_BYTES;
  pool.retainedBytes -= listenerBytes;
  subtractCategoryBytes(pool, CDC_COVERAGE_LISTENER_CATEGORY.LISTENER,
    listenerBytes);
  pool.releases += 1;
  // The WeakMap tombstone lets stale callers receive false while retaining no
  // owner, service, transport or pool graph after the exact transfer.
  state.owner = null;
  state.pool = null;
  dispatchWakeCallbacks(pool);
  return true;
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
  const activeState = listenerClaimStates.get(owner.pool.activeListenerClaim);
  if (activeState?.owner === owner &&
      activeState.state !==
        CDC_COVERAGE_LISTENER_STATE.TERMINAL_TRANSFERRED) {
    return false;
  }
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
  if (owner.pool.endpointCount === 0 && owner.pool.sessionCount === 0 &&
      !owner.pool.terminalRetained) {
    nodePools.delete(owner.pool.key);
  }
  return true;
}

function readCdcCoverageTransferDiagnostics(service) {
  const owner = owners.get(service);
  const pool = owner?.pool ?? nodePools.get(nodePoolKey(service));
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
    wakeFailures: pool?.wakeFailures ?? 0,
    held: Object.freeze(held),
    liveBytesByCategory: Object.freeze(Object.fromEntries(
      pool?.liveBytesByCategory ?? [])),
    listenerActive: pool?.activeListenerClaim !== null &&
      pool?.activeListenerClaim !== undefined,
    listenerGenerations: pool?.listenerGenerations ?? 0,
    terminalRetained: pool?.terminalRetained === true,
    terminalDescriptor: pool?.terminalDescriptor ?? null,
    maxSessions: pool?.maxSessions ?? positiveSafeInteger(
      service?.cdcCoverageTransferMaxSessions,
      CDC_COVERAGE_TRANSFER_DEFAULT.MAX_SESSIONS),
    maxRetainedBytes: pool?.maxRetainedBytes ?? positiveSafeInteger(
      service?.cdcCoverageTransferCapacityBytes,
      CDC_COVERAGE_TRANSFER_DEFAULT.MAX_RETAINED_BYTES)});
}

export {
  CDC_COVERAGE_LISTENER_STATE,
  CDC_COVERAGE_TERMINAL_LIMIT,
  CDC_COVERAGE_TRANSFER_DEFAULT,
  enterCdcCoverageListenerTerminalCheck,
  readCdcCoverageTransfer,
  readCdcCoverageTransferDiagnostics,
  registerCdcCoverageTransferWake,
  reserveCdcCoverageListenerBase,
  releaseCdcCoverageTransfer,
  releaseCdcCoverageTransferSession,
  resizeCdcCoverageTransfer,
  reserveCdcCoverageTransfer,
  retireCdcCoverageTransferOwner,
  setCdcCoverageTransferValue,
  transferCdcCoverageListenerToTerminal,
};
