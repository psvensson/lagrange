const arrayIsArray = Array.isArray;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectCreate = Object.create;

function readOwnData(target, field) {
  if (!target || typeof target !== 'object') return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, 'value') ?
    descriptor.value : undefined;
}

function readOwnArrayItem(values, index) {
  if (!arrayIsArray(values)) return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(values, index);
  return descriptor && objectHasOwn(descriptor, 'value') ?
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
    readOwnData(handoff, 'authorityNodeId'),
    readOwnData(handoff, 'authorityBootIncarnation'),
  );
  const cohort = readOwnData(handoff, 'requiredCohort');
  if (!arrayIsArray(cohort)) return expected;
  for (let index = 0; index < cohort.length; index += 1) {
    const member = readOwnArrayItem(cohort, index);
    appendExpectedIdentity(
      expected,
      seen,
      readOwnData(member, 'nodeId'),
      readOwnData(member, 'bootIncarnation'),
    );
  }
  return expected;
}

function projectPhysicalEvidence(identity, nodeRows, connections) {
  const node = findByOwnNodeId(nodeRows, 'node_id', identity.nodeId);
  const connection = findByOwnNodeId(
    connections,
    'nodeId',
    identity.nodeId,
  );
  return {
    nodeId: identity.nodeId,
    expectedBootIncarnation: identity.bootIncarnation,
    nodePresent: node !== null,
    nodeBootIncarnation: readOwnData(node, 'boot_incarnation') ?? null,
    nodeStatus: readOwnData(node, 'status') ?? null,
    nodeConnectionState: readOwnData(node, 'connection_state') ?? null,
    currentPrimaryPresent: connection !== null,
    currentPrimaryBootIncarnation:
      readOwnData(connection, 'bootIncarnation') ?? null,
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
