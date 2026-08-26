const arrayIsArray = Array.isArray;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectCreate = Object.create;
const OWN_DATA_VALUE_FIELD = 'value';
const FIELD = Object.freeze({
  AUTHORITY_BOOT_INCARNATION: 'authorityBootIncarnation',
  AUTHORITY_NODE_ID: 'authorityNodeId',
  BOOT_INCARNATION: 'bootIncarnation',
  CONNECTION_BOOT_INCARNATION: 'bootIncarnation',
  CONNECTION_NODE_ID: 'nodeId',
  NODE_BOOT_INCARNATION: 'boot_incarnation',
  NODE_CONNECTION_STATE: 'connection_state',
  NODE_ID: 'nodeId',
  NODE_ID_COLUMN: 'node_id',
  NODE_STATUS: 'status',
  REQUIRED_COHORT: 'requiredCohort',
});

function readOwnData(target, field) {
  if (!target || typeof target !== 'object') return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value : undefined;
}

function readOwnArrayItem(values, index) {
  if (!arrayIsArray(values)) return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(values, index);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value : undefined;
}

function findByOwnNodeId(values, field, nodeId) {
  if (!arrayIsArray(values)) return null;
  for (let index = 0; index < values.length; index += 1) {
    const value = readOwnArrayItem(values, index);
    if (readOwnData(value, field) === nodeId) return value;
  }
  return null;
}

function appendExpectedIdentity(result, seen, nodeId, bootIncarnation) {
  if (
    typeof nodeId !== 'string' || nodeId.length === 0 ||
    seen[nodeId] === true
  ) return;
  seen[nodeId] = true;
  result[result.length] = {nodeId, bootIncarnation};
}

function buildExpectedIdentities(handoff) {
  const expected = [];
  const seen = objectCreate(null);
  appendExpectedIdentity(
    expected,
    seen,
    readOwnData(handoff, FIELD.AUTHORITY_NODE_ID),
    readOwnData(handoff, FIELD.AUTHORITY_BOOT_INCARNATION),
  );
  const cohort = readOwnData(handoff, FIELD.REQUIRED_COHORT);
  if (!arrayIsArray(cohort)) return expected;
  for (let index = 0; index < cohort.length; index += 1) {
    const member = readOwnArrayItem(cohort, index);
    appendExpectedIdentity(
      expected,
      seen,
      readOwnData(member, FIELD.NODE_ID),
      readOwnData(member, FIELD.BOOT_INCARNATION),
    );
  }
  return expected;
}

function projectPhysicalEvidence(identity, nodeRows, connections) {
  const node = findByOwnNodeId(
    nodeRows,
    FIELD.NODE_ID_COLUMN,
    identity.nodeId,
  );
  const connection = findByOwnNodeId(
    connections,
    FIELD.CONNECTION_NODE_ID,
    identity.nodeId,
  );
  return {
    nodeId: identity.nodeId,
    expectedBootIncarnation: identity.bootIncarnation,
    nodePresent: node !== null,
    nodeBootIncarnation:
      readOwnData(node, FIELD.NODE_BOOT_INCARNATION) ?? null,
    nodeStatus: readOwnData(node, FIELD.NODE_STATUS) ?? null,
    nodeConnectionState:
      readOwnData(node, FIELD.NODE_CONNECTION_STATE) ?? null,
    currentPrimaryPresent: connection !== null,
    currentPrimaryBootIncarnation:
      readOwnData(connection, FIELD.CONNECTION_BOOT_INCARNATION) ?? null,
  };
}

function buildFormationReleasePhysicalEvidence(
  handoff,
  nodeRows,
  connections,
) {
  const result = [];
  const expected = buildExpectedIdentities(handoff);
  for (let index = 0; index < expected.length; index += 1) {
    result[result.length] = projectPhysicalEvidence(
      expected[index],
      nodeRows,
      connections,
    );
  }
  return result;
}

export {buildFormationReleasePhysicalEvidence};
