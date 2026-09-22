#!/usr/bin/env node
import {PartitionNodeCluster} from
  '../../test/raft/raft-rs-backend/partition-node-cluster.js';

const MAX_DEPTH = 6;
const MAX_PROTOTYPE_DEPTH = 4;
const VALUE_DESCRIPTOR_KEY = 'value';
const DATABASE_TYPE_NAME = 'Database';
const CAPABILITY_REPLICA_ID = 'capability-replica';
const OBJECT_VALUE_TYPES = Object.freeze(['object', 'function']);
const CONTROL_PATTERN =
  /(?:control|retire|groupParts|runtimeHost|handleOf)/iu;
const CORE_PRIMITIVES = Object.freeze([
  'create_node', 'free', 'tick', 'step', 'propose', 'has_ready',
  'take_ready', 'persist_ready', 'advance_append', 'advance_apply',
  'campaign', 'status', 'export_persisted_state', 'conf_state',
  'set_conf_state', 'persist_commit_index', 'apply_conf_change',
  'decode_conf_change_entry', 'propose_conf_change_v2',
]);

function isObject(value) {
  return value !== null && OBJECT_VALUE_TYPES.includes(typeof value);
}

function isCoreFacade(value) {
  return isObject(value) && CORE_PRIMITIVES.every((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return descriptor && Object.hasOwn(descriptor, VALUE_DESCRIPTOR_KEY) &&
      typeof descriptor.value === 'function';
  });
}

function constructorName(value) {
  const prototype = Object.getPrototypeOf(value);
  const descriptor = prototype &&
    Object.getOwnPropertyDescriptor(prototype, 'constructor');
  return descriptor && Object.hasOwn(descriptor, VALUE_DESCRIPTOR_KEY) ?
    descriptor.value.name : null;
}

function generateLedger(roots) {
  const seen = new Set();
  const methods = new Set();
  const data = new Set();
  const mutable = new Set();
  const corePaths = new Set();
  const sqlitePaths = new Set();
  const controlPaths = new Set();
  const runtimeTypes = new Set();

  function inspect(value, valuePath, depth) {
    if (!isObject(value) || seen.has(value) || depth > MAX_DEPTH) {
      return;
    }
    seen.add(value);
    if (!Object.isFrozen(value)) {
      mutable.add(valuePath);
    }
    if (isCoreFacade(value)) {
      corePaths.add(valuePath);
    }
    const typeName = constructorName(value);
    if (typeof typeName === 'string' &&
      (/^RaftRs(?:Runtime|Hosted|Group|Node|PartitionControl)/u.test(typeName) ||
        typeName === DATABASE_TYPE_NAME)) {
      runtimeTypes.add(typeName);
    }
    if (typeName === DATABASE_TYPE_NAME) {
      sqlitePaths.add(valuePath);
    }
    const inspectDescriptors = (owner, ownerPath) => {
      for (const key of Reflect.ownKeys(owner)) {
        if (key === 'constructor') {
          continue;
        }
        const keyName = String(key);
        const memberPath = `${ownerPath}.${keyName}`;
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (!descriptor ||
            !Object.hasOwn(descriptor, VALUE_DESCRIPTOR_KEY)) {
          data.add(memberPath);
          continue;
        }
        if (typeof descriptor.value === 'function') {
          methods.add(memberPath);
          if (CONTROL_PATTERN.test(keyName)) {
            controlPaths.add(memberPath);
          }
        } else {
          data.add(memberPath);
        }
        inspect(descriptor.value, memberPath, depth + 1);
      }
    };
    inspectDescriptors(value, valuePath);
    let prototype = Object.getPrototypeOf(value);
    let prototypeDepth = 0;
    while (prototype && prototype !== Object.prototype &&
      prototypeDepth < MAX_PROTOTYPE_DEPTH) {
      inspectDescriptors(prototype, `${valuePath}::<prototype>`);
      prototype = Object.getPrototypeOf(prototype);
      prototypeDepth += 1;
    }
  }

  for (const [name, value] of Object.entries(roots)) {
    inspect(value, name, 0);
  }
  return Object.freeze({
    publicMethods: methods.size,
    publicDataProperties: data.size,
    mutablePublicValues: mutable.size,
    coreAccessPaths: corePaths.size,
    lifecycleStateMutationPaths: [...controlPaths]
      .filter((entry) => /retire/iu.test(entry)).length,
    sqliteHandlesExposed: sqlitePaths.size,
    providerControlAccessors: controlPaths.size,
    runtimeObjectTypesExposed: runtimeTypes.size,
    evidence: Object.freeze({
      coreAccessPaths: Object.freeze([...corePaths].sort()),
      sqliteHandlesExposed: Object.freeze([...sqlitePaths].sort()),
      providerControlAccessors: Object.freeze([...controlPaths].sort()),
      runtimeObjectTypesExposed: Object.freeze([...runtimeTypes].sort()),
    }),
  });
}

function generateCurrentLedger() {
  const cluster = new PartitionNodeCluster({
    partitionId: 'capability-ledger',
    replicaIds: [CAPABILITY_REPLICA_ID],
  });
  try {
    return generateLedger({
      partitionValue: cluster.node(CAPABILITY_REPLICA_ID),
      provider: cluster.provider,
    });
  } finally {
    cluster.dispose();
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.stdout.write(`${JSON.stringify(generateCurrentLedger(), null, 2)}\n`);
}

export {generateCurrentLedger, generateLedger};
