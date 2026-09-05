import {TABLES} from '../constants/index.js';
import {copyDenseOwnDataArray} from '../utils/strict-own-data.js';
import {planningIdentitiesEqual} from
  './readiness-planning-semantic-generation.js';
import {types} from 'node:util';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const numberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const setAdd = Function.call.bind(Set.prototype.add);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const SetConstructor = Set;
const canonicalSetPrototype = Set.prototype;
const isProxy = types.isProxy.bind(types);
const stringConstructor = String;

const READINESS_PLANNING_TABLES = objectFreeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICES,
  TABLES.PARTITIONS,
  TABLES.REPLICA_OPERATIONS,
  TABLES.STORAGE_RESERVATIONS,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
]);
const STORAGE_ACCOUNTING_OWNER_DEPENDENCY = 'storageAccountingService';
const READINESS_PLANNING_OWNER_DEPENDENCIES = objectFreeze([
  'nodesOwner',
  'servicesOwner',
  'messageRouter',
  'nodeLifecycleStateMachine',
  STORAGE_ACCOUNTING_OWNER_DEPENDENCY,
  'cdcIntegrationService',
  'cacheMutationTarget',
  'cdcGroupPropagationService',
  'heartbeatService',
  'controlPlaneSystemTableGateway',
  'authoritativeControlPlaneView',
  'localClusterIncarnationFenceProvider',
]);
const READINESS_PLANNING_DEPENDENCY_REGISTRY = objectFreeze({
  versionedInputs: objectFreeze([
    'globalPlanningGeneration',
    'byNodePlanningGeneration',
    'classifiedSourceRevisions',
    'nodeLivenessSemanticIdentity',
    'storageCapacitySemanticIdentity',
    'cacheGeneration',
    'membershipOwnerGeneration',
    ...READINESS_PLANNING_OWNER_DEPENDENCIES.map(
      (ownerName) => `${ownerName}Generation`,
    ),
    ...READINESS_PLANNING_TABLES,
    'readinessSnapshotGeneration',
    'recoveryEpochRevision',
    'transportTopologyGeneration',
    'transportTopologyValid',
    'generationSaturated',
    'perOwnerBuildOptionsKey',
  ]),
  positiveDecisionLiveVetoes: objectFreeze([
    'snapshotCaptureAge',
    'nodeLivenessSemanticIdentity',
    'localQueryTransportDrift',
    'currentNodeTransportHealth',
    'nodeLifecycleState',
    'storageCapacityPolicy',
    'metadataPublicationMode',
    'heartbeatPublicationState',
  ]),
});
const READINESS_PLANNING_REASON = objectFreeze({
  SOURCE_CHANGED: 'readiness_planning_source_changed',
  LIVE_VETO: 'readiness_planning_live_veto',
  TOKEN_ADVANCED_DURING_BUILD: 'readiness_planning_token_advanced_during_build',
  BUILD_FAILED: 'readiness_planning_build_failed',
});
const TOKEN_STATUS = objectFreeze({CURRENT: 'current', STALE: 'stale'});
const NODE_TABLE_STABLE_TOKEN_FIELDS = objectFreeze([
  'cacheGeneration',
  'membershipOwnerGeneration',
  'readinessSnapshotGeneration',
  'recoveryEpochRevision',
  'transportTopologyGeneration',
  'transportTopologyValid',
  'generationSaturated',
]);
const AUTHORITATIVE_STABLE_TOKEN_FIELDS = objectFreeze([
  'cacheGeneration',
  'membershipOwnerGeneration',
  'transportTopologyGeneration',
  'transportTopologyValid',
  'generationSaturated',
]);
const READINESS_PLANNING_RETRY_AFTER_MS = 1000;
const MAX_PLATFORM_TIMER_DELAY_MS = 2_147_483_647;
const DATA_DESCRIPTOR_FIELD = 'value';

function appendArrayValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function freezeTokenRecord(values) {
  const record = objectCreate(null);
  const keys = objectKeys(values);
  for (let index = 0; index < keys.length; index++) {
    objectDefineProperty(record, keys[index], {
      configurable: true,
      enumerable: true,
      value: values[keys[index]],
      writable: true,
    });
  }
  return objectFreeze(record);
}

function readOwnDataValue(value, field) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined;
  }
  try {
    const descriptor = objectGetOwnPropertyDescriptor(value, field);
    return descriptor && objectHasOwn(descriptor, DATA_DESCRIPTOR_FIELD) ?
      descriptor.value :
      undefined;
  } catch {
    return undefined;
  }
}

function nextSemanticGeneration(owner, value) {
  if (!numberIsSafeInteger(value) || value < 0 ||
      value >= numberMaxSafeInteger) {
    owner.generationSaturated = true;
    return numberMaxSafeInteger;
  }
  return value + 1;
}

function defaultMacrotaskScheduler(callback) {
  return setImmediate(callback);
}

function isReadinessBuildFailureRetryable() {
  return true;
}

function getReadinessBuildRetryAfterMs(error) {
  const retryAfterMs = error?.retryAfterMs;
  return numberIsSafeInteger(retryAfterMs) &&
    retryAfterMs > 0 &&
    retryAfterMs <= MAX_PLATFORM_TIMER_DELAY_MS ?
    retryAfterMs :
    READINESS_PLANNING_RETRY_AFTER_MS;
}

function getReadinessBuildFailureReason() {
  return READINESS_PLANNING_REASON.BUILD_FAILED;
}

function shouldResetReadinessBuildAttempts(previousContext, nextContext) {
  if (previousContext?.planningIdentity || nextContext?.planningIdentity) {
    return !planningIdentitiesEqual(
      previousContext?.planningIdentity,
      nextContext?.planningIdentity,
    );
  }
  return previousContext?.token?.tokenKey !== nextContext?.token?.tokenKey;
}

function buildQueueOwnerKey(ownerKey, buildOptionsKey) {
  return `${ownerKey.length}:${ownerKey}${buildOptionsKey}`;
}

function readPrimitiveSignature(value) {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return numberIsFinite(value) ? value : '';
}

function encodeSignatureValue(value) {
  const normalized = readPrimitiveSignature(value);
  const valueType = value === null ? 'null' : typeof value;
  const normalizedType = normalized === '' && value !== '' ?
    'unavailable' :
    valueType;
  const typeText = stringConstructor(normalizedType);
  const valueText = stringConstructor(normalized);
  return `${typeText.length}:${typeText}${valueText.length}:${valueText}`;
}

function encodeSignatureValues(values) {
  return arrayJoin(arrayMap(values, encodeSignatureValue), '');
}

function freezeToken(state) {
  const tableRevisions = freezeTokenRecord(state.tableRevisions);
  const tokenParts = [state.cacheGeneration, state.membershipOwnerGeneration];
  for (let index = 0;
    index < READINESS_PLANNING_OWNER_DEPENDENCIES.length;
    index++) {
    appendArrayValue(
      tokenParts,
      state.ownerDependencyGenerations[
        READINESS_PLANNING_OWNER_DEPENDENCIES[index]
      ],
    );
  }
  for (let index = 0; index < READINESS_PLANNING_TABLES.length; index++) {
    appendArrayValue(tokenParts, tableRevisions[READINESS_PLANNING_TABLES[index]]);
  }
  appendArrayValue(tokenParts, state.readinessSnapshotGeneration);
  appendArrayValue(tokenParts, state.recoveryEpochRevision);
  appendArrayValue(tokenParts, state.transportTopologyGeneration);
  appendArrayValue(tokenParts, state.transportTopologyValid !== false);
  appendArrayValue(tokenParts, state.generationSaturated);
  return freezeTokenRecord({
    cacheGeneration: state.cacheGeneration,
    membershipOwnerGeneration: state.membershipOwnerGeneration,
    ownerDependencyGenerations: freezeTokenRecord({
      ...state.ownerDependencyGenerations,
    }),
    tableRevisions,
    readinessSnapshotGeneration: state.readinessSnapshotGeneration,
    recoveryEpochRevision: state.recoveryEpochRevision,
    transportTopologyGeneration: state.transportTopologyGeneration,
    transportTopologyValid: state.transportTopologyValid !== false,
    generationSaturated: state.generationSaturated,
    tokenKey: encodeSignatureValues(tokenParts),
  });
}

function hasStableTokenScalars(previous, current, fields) {
  return !arraySome(fields, (field) => previous[field] !== current[field]) &&
    !arraySome(READINESS_PLANNING_OWNER_DEPENDENCIES, (ownerName) =>
      previous.ownerDependencyGenerations?.[ownerName] !==
        current.ownerDependencyGenerations?.[ownerName],
    );
}

function isNodeTableOnlyTokenAdvance(previous, current) {
  if (!previous || !current) return false;
  if (!hasStableTokenScalars(
    previous,
    current,
    NODE_TABLE_STABLE_TOKEN_FIELDS,
  )) return false;
  return arrayEvery(READINESS_PLANNING_TABLES, (table) => {
    const before = previous.tableRevisions?.[table];
    const after = current.tableRevisions?.[table];
    return table === TABLES.NODES ? after > before : after === before;
  });
}

function isAuthoritativeSnapshotTokenAdvance(previous, current) {
  if (!previous || !current) return false;
  if (!hasStableTokenScalars(
    previous,
    current,
    AUTHORITATIVE_STABLE_TOKEN_FIELDS,
  )) return false;
  if (current.readinessSnapshotGeneration <=
      previous.readinessSnapshotGeneration ||
      current.recoveryEpochRevision < previous.recoveryEpochRevision) {
    return false;
  }
  const repairTables = new SetConstructor();
  setAdd(repairTables, TABLES.NODES);
  setAdd(repairTables, TABLES.SERVICES);
  return arrayEvery(READINESS_PLANNING_TABLES, (table) => {
    const before = previous.tableRevisions?.[table];
    const after = current.tableRevisions?.[table];
    return setHas(repairTables, table) ? after >= before : after === before;
  });
}

function canRebaseStoredSnapshot(previous, current) {
  return isNodeTableOnlyTokenAdvance(previous, current) ||
    isAuthoritativeSnapshotTokenAdvance(previous, current);
}

function readConnectedNodeFingerprint(messageRouter) {
  try {
    const readConnectedNodes = messageRouter?.getConnectedNodes;
    if (typeof readConnectedNodes !== 'function') {
      return objectFreeze({fingerprint: '', valid: true});
    }
    const connected = reflectApply(readConnectedNodes, messageRouter, []);
    const copiedArray = copyDenseOwnDataArray(connected);
    const nodeIds = [];
    const uniqueNodeIds = new SetConstructor();
    if (copiedArray !== null) {
      for (let index = 0; index < copiedArray.length; index++) {
        if (typeof copiedArray[index] !== 'string') throw new TypeError();
        setAdd(uniqueNodeIds, copiedArray[index]);
      }
    } else if (!isProxy(connected) &&
        objectGetPrototypeOf(connected) === canonicalSetPrototype) {
      setForEach(connected, (nodeId) => {
        if (typeof nodeId !== 'string') throw new TypeError();
        setAdd(uniqueNodeIds, nodeId);
      });
    } else {
      throw new TypeError();
    }
    setForEach(uniqueNodeIds, (nodeId) => appendArrayValue(nodeIds, nodeId));
    arraySort(nodeIds);
    return objectFreeze({
      fingerprint: encodeSignatureValues(nodeIds),
      valid: true,
    });
  } catch {
    return objectFreeze({fingerprint: null, valid: false});
  }
}

export {
  STORAGE_ACCOUNTING_OWNER_DEPENDENCY,
  READINESS_PLANNING_DEPENDENCY_REGISTRY,
  READINESS_PLANNING_OWNER_DEPENDENCIES,
  READINESS_PLANNING_REASON,
  READINESS_PLANNING_TABLES,
  TOKEN_STATUS,
  appendArrayValue,
  buildQueueOwnerKey,
  canRebaseStoredSnapshot,
  defaultMacrotaskScheduler,
  encodeSignatureValues,
  freezeToken,
  getReadinessBuildFailureReason,
  getReadinessBuildRetryAfterMs,
  isReadinessBuildFailureRetryable,
  nextSemanticGeneration,
  readConnectedNodeFingerprint,
  readOwnDataValue,
  shouldResetReadinessBuildAttempts,
};
