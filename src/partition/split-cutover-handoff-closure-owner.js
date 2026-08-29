import {
  copyDenseOwnDataArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from './split-ack-constants.js';
import {
  HANDOFF_CLOSURE_PHASE,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_RESPONSE_STATE,
} from './split-cutover-handoff-contract.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);
const booleanConstructor = Boolean;
const MapConstructor = Map;
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const numberIsSafeInteger = Number.isSafeInteger;
const numberConstructor = Number;
const objectFreeze = Object.freeze;
const promiseAll = Promise.all.bind(Promise);
const promiseResolve = Promise.resolve.bind(Promise);
const promiseFinally = Function.call.bind(Promise.prototype.finally);
const promiseThen = Function.call.bind(Promise.prototype.then);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const SetConstructor = Set;
const setImmediateFn = setImmediate;
const WeakMapConstructor = WeakMap;
const weakMapGet = Function.call.bind(WeakMap.prototype.get);
const weakMapSet = Function.call.bind(WeakMap.prototype.set);
const WeakSetConstructor = WeakSet;
const weakSetAdd = Function.call.bind(WeakSet.prototype.add);
const weakSetDelete = Function.call.bind(WeakSet.prototype.delete);
const weakSetHas = Function.call.bind(WeakSet.prototype.has);

const HANDOFF_QUERY_PARTICIPANT_PREFIX = 'query-plane:';
const HANDOFF_QUERY_PARTICIPANT_READY = 'handoff_ready';
const HANDOFF_COHORT_SIGNATURE_SEPARATOR = '|';
const HANDOFF_GENERATION_SEPARATOR = ':';
const HANDOFF_BARRIER_DEFERRED_LOG =
  'Split cutover query-plane barrier deferred';
const HANDOFF_RECONCILE_DEFERRED_LOG =
  'Split cutover handoff reconcile deferred';
const handoffDissolutionByWorkflow = new WeakMapConstructor();
const handoffReconcileScheduled = new WeakSetConstructor();

function readSourceParticipant(workflow) {
  return workflow?.participants instanceof MapConstructor ?
    mapGet(workflow.participants, SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION) :
    null;
}

function cloneMap(source) {
  const clone = new MapConstructor();
  if (!(source instanceof MapConstructor)) return clone;
  mapForEach(source, (value, key) => mapSet(clone, key, value));
  return clone;
}

function hasDrainedReplayCheckpoint(workflow) {
  const checkpoint = copyStrictOwnDataRecord(
    readSourceParticipant(workflow)?.checkpoint,
  );
  const snapshotBarrierIndex = checkpoint?.[
    SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_BARRIER_INDEX
  ];
  const replayWatermarkIndex = checkpoint?.[
    SPLIT_ACK_CHECKPOINT_FIELD.REPLAY_WATERMARK_INDEX
  ];
  return checkpoint?.[
    SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED
  ] === false &&
    numberIsSafeInteger(snapshotBarrierIndex) &&
    numberIsSafeInteger(replayWatermarkIndex) &&
    replayWatermarkIndex >= snapshotBarrierIndex;
}

function normalizeCohortNode(value, seen) {
  const node = copyStrictOwnDataRecord(value);
  if (!node || typeof node.nodeId !== 'string' || node.nodeId.length === 0 ||
      !numberIsSafeInteger(node.bootIncarnation) || node.bootIncarnation <= 0 ||
      setHas(seen, node.nodeId)) {
    return null;
  }
  setAdd(seen, node.nodeId);
  return objectFreeze({
    nodeId: node.nodeId,
    bootIncarnation: node.bootIncarnation,
  });
}

function normalizeCohort(value) {
  const cohort = copyStrictOwnDataRecord(value);
  if (!cohort) return null;
  const publicationEpoch = numberConstructor(cohort.publicationEpoch);
  const nodes = copyDenseOwnDataArray(cohort.nodes) || [];
  if (!numberIsSafeInteger(publicationEpoch) || publicationEpoch <= 0 ||
      nodes.length === 0) {
    return null;
  }
  const normalizedNodes = [];
  const seen = new SetConstructor();
  for (let index = 0; index < nodes.length; index++) {
    const node = normalizeCohortNode(nodes[index], seen);
    if (!node) return null;
    normalizedNodes[normalizedNodes.length] = node;
  }
  arraySort(normalizedNodes, (left, right) =>
    left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0);
  return objectFreeze({
    publicationEpoch,
    nodes: objectFreeze(normalizedNodes),
  });
}

function cohortSignature(cohort) {
  const parts = [cohort.publicationEpoch];
  for (let index = 0; index < cohort.nodes.length; index++) {
    const node = cohort.nodes[index];
    parts[parts.length] = `${node.nodeId}@${node.bootIncarnation}`;
  }
  return arrayJoin(parts, HANDOFF_COHORT_SIGNATURE_SEPARATOR);
}

function cohortsEqual(left, right) {
  return booleanConstructor(left && right) &&
    cohortSignature(left) === cohortSignature(right);
}

function preserveUnretiredRequiredNodes(owner, closure, cohort) {
  const previousNodes = copyDenseOwnDataArray(closure?.requiredNodes);
  if (!closure || !previousNodes) return cohort;
  const nodesById = new MapConstructor();
  for (let index = 0; index < cohort.nodes.length; index++) {
    const node = cohort.nodes[index];
    mapSet(nodesById, node.nodeId, node);
  }
  for (let index = 0; index < previousNodes.length; index++) {
    const requiredNode = copyStrictOwnDataRecord(previousNodes[index]);
    if (!requiredNode || mapHas(nodesById, requiredNode.nodeId)) continue;
    const retired = owner.topologyAdapter
      ?.isSplitQueryPlaneIncarnationRetired?.(requiredNode) === true;
    if (!retired) mapSet(nodesById, requiredNode.nodeId, requiredNode);
  }
  const nodes = [];
  mapForEach(nodesById, (node) => {
    nodes[nodes.length] = node;
  });
  return normalizeCohort({
    publicationEpoch: cohort.publicationEpoch,
    nodes,
  });
}

function captureEffectiveCohort(owner, closure) {
  const captured = normalizeCohort(
    owner.topologyAdapter?.captureSplitQueryPlaneCohort?.(),
  );
  return captured ? preserveUnretiredRequiredNodes(owner, closure, captured) :
    null;
}

function buildGeneration(workflow, cohort) {
  const targetVersion = numberConstructor(
    workflow.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION
    ],
  );
  return arrayJoin([
    workflow.workflowId,
    workflow.fenceToken,
    targetVersion,
    cohortSignature(cohort),
  ], HANDOFF_GENERATION_SEPARATOR);
}

function buildClosureRecord(owner, workflow, cohort) {
  const targetPartitionIds = copyDenseOwnDataArray(workflow.metadata?.[
    PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
  ]);
  const sourcePartitionId = workflow.metadata?.[
    PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID
  ];
  const targetPartitionVersion = numberConstructor(
    workflow.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION
    ],
  );
  if (
    !targetPartitionIds ||
    targetPartitionIds.length !== 2 ||
    !arrayEvery(targetPartitionIds, (value) =>
      typeof value === 'string' && value) ||
    typeof sourcePartitionId !== 'string' ||
    !sourcePartitionId ||
    !numberIsSafeInteger(targetPartitionVersion)
  ) return null;
  return objectFreeze({
    state: HANDOFF_CLOSURE_PHASE.CLOSING,
    generation: buildGeneration(workflow, cohort),
    workflowId: workflow.workflowId,
    ownerNodeId: owner.nodeId,
    workflowOwnerId: workflow.workflowOwnerId,
    tableId: workflow.tableId,
    sourcePartitionId,
    targetPartitionIds: objectFreeze(targetPartitionIds),
    targetPartitionVersion,
    membershipPublicationEpoch: cohort.publicationEpoch,
    requiredNodes: cohort.nodes,
  });
}

function closureMatchesCohort(closure, cohort) {
  return closure?.membershipPublicationEpoch === cohort?.publicationEpoch &&
    cohortSignature({
      publicationEpoch: closure.membershipPublicationEpoch,
      nodes: closure.requiredNodes || [],
    }) === cohortSignature(cohort);
}

function closureMatchesOwnerGeneration(closure, workflow, cohort) {
  return closureMatchesCohort(closure, cohort) &&
    closure?.generation === buildGeneration(workflow, cohort) &&
    closure?.workflowOwnerId === workflow.workflowOwnerId;
}

async function persistClosureRecord(owner, workflow, closure) {
  const ownership = await owner.renewSplitWorkflowOwnership(
    workflow.workflowId,
  );
  const updated = await owner.workflowCoordinator.transitionStep(
    workflow.workflowId,
    {
      nextStep: `split_handoff_closing:${closure.generation}`,
      reason: PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE,
      fenceToken: ownership.fenceToken,
      ownerId: ownership.ownerId,
    },
    {
      status: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      metadata: {
        ...(workflow.metadata || {}),
        [PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE]: closure,
      },
    },
  );
  owner.logger.info?.(MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSING, {
    workflowId: closure.workflowId,
    generation: closure.generation,
    sourcePartitionId: closure.sourcePartitionId,
    targetPartitionVersion: closure.targetPartitionVersion,
    membershipPublicationEpoch: closure.membershipPublicationEpoch,
    requiredNodeIds: arrayMap(closure.requiredNodes, (node) => node.nodeId),
  });
  return updated;
}

function buildPrepareMessage(closure, requiredNode) {
  return {
    type: HANDOFF_MESSAGE_TYPE.PREPARE,
    generation: closure.generation,
    workflowId: closure.workflowId,
    tableId: closure.tableId,
    sourcePartitionId: closure.sourcePartitionId,
    targetPartitionIds: copyDenseOwnDataArray(closure.targetPartitionIds),
    targetPartitionVersion: closure.targetPartitionVersion,
    membershipPublicationEpoch: closure.membershipPublicationEpoch,
    requiredNode: {...requiredNode},
  };
}

function normalizeMatchingBarrierAck(responseValue, closure, requiredNode) {
  const response = copyStrictOwnDataRecord(responseValue);
  if (
    !response ||
    response.acknowledged !== true ||
    response.state !== HANDOFF_RESPONSE_STATE.READY ||
    response.generation !== closure.generation ||
    response.workflowId !== closure.workflowId ||
    response.nodeId !== requiredNode.nodeId ||
    response.bootIncarnation !== requiredNode.bootIncarnation ||
    response.targetPartitionVersion !== closure.targetPartitionVersion
  ) return null;
  return objectFreeze({
    acknowledged: true,
    state: response.state,
    generation: response.generation,
    workflowId: response.workflowId,
    nodeId: response.nodeId,
    bootIncarnation: response.bootIncarnation,
    targetPartitionVersion: response.targetPartitionVersion,
  });
}

async function collectBarrierAcks(owner, closure) {
  const deliver = owner.topologyAdapter?.deliverSplitCutoverHandoff;
  if (typeof deliver !== 'function') return null;
  let responses;
  try {
    const deliveries = [];
    for (let index = 0; index < closure.requiredNodes.length; index++) {
      const requiredNode = closure.requiredNodes[index];
      deliveries[deliveries.length] = deliver.call(
        owner.topologyAdapter,
        requiredNode.nodeId,
        buildPrepareMessage(closure, requiredNode),
      );
    }
    responses = await promiseAll(deliveries);
  } catch (error) {
    owner.logger.warn?.(HANDOFF_BARRIER_DEFERRED_LOG, {
      workflowId: closure.workflowId,
      generation: closure.generation,
      error: error?.message || error,
    });
    return null;
  }
  const normalizedResponses = [];
  for (let index = 0; index < responses.length; index++) {
    const normalized = normalizeMatchingBarrierAck(
      responses[index],
      closure,
      closure.requiredNodes[index],
    );
    if (!normalized) return null;
    normalizedResponses[normalizedResponses.length] = normalized;
  }
  return normalizedResponses;
}

async function persistQueryPlaneAcks(owner, workflow, closure, responses) {
  const ownership = await owner.renewSplitWorkflowOwnership(
    workflow.workflowId,
  );
  const participants = cloneMap(workflow.participants);
  const acknowledgedNodes = [];
  for (let index = 0; index < responses.length; index++) {
    const response = responses[index];
    const requiredNode = closure.requiredNodes[index];
    const participantKey =
      HANDOFF_QUERY_PARTICIPANT_PREFIX + requiredNode.nodeId;
    const timestamp = owner.now();
    const participant = {
      ...(mapGet(participants, participantKey) || {}),
      workflowId: workflow.workflowId,
      participantKey,
      participantId: HANDOFF_QUERY_PARTICIPANT_PREFIX + requiredNode.nodeId,
      status: HANDOFF_QUERY_PARTICIPANT_READY,
      checkpoint: {
        generation: closure.generation,
        nodeId: response.nodeId,
        bootIncarnation: response.bootIncarnation,
        targetPartitionVersion: response.targetPartitionVersion,
      },
      acknowledgedAt: timestamp,
      createdAt: mapGet(participants, participantKey)?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    mapSet(participants, participantKey, participant);
    acknowledgedNodes[acknowledgedNodes.length] =
      objectFreeze({...participant.checkpoint});
  }
  const readyClosure = objectFreeze({
    ...closure,
    state: HANDOFF_CLOSURE_PHASE.QUERY_PLANE_READY,
    acknowledgedNodes: objectFreeze(acknowledgedNodes),
  });
  const updated = await owner.workflowCoordinator.transitionStep(
    workflow.workflowId,
    {
      nextStep: `split_handoff_query_plane_ready:${closure.generation}`,
      reason: PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE,
      fenceToken: ownership.fenceToken,
      ownerId: ownership.ownerId,
    },
    {
      participants,
      metadata: {
        ...(workflow.metadata || {}),
        [PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE]: readyClosure,
      },
    },
  );
  owner.logger.info?.(MANAGED_SPLIT_LOG_MSG.HANDOFF_QUERY_PLANE_READY, {
    workflowId: closure.workflowId,
    generation: closure.generation,
    sourcePartitionId: closure.sourcePartitionId,
    targetPartitionVersion: closure.targetPartitionVersion,
    acknowledgedNodeIds: arrayMap(responses, (response) => response.nodeId),
  });
  return updated;
}

async function persistHandoffClosed(owner, workflow, closure) {
  const source = readSourceParticipant(workflow);
  const checkpoint = copyStrictOwnDataRecord(source?.checkpoint);
  if (!checkpoint) return false;
  const ownership = await owner.renewSplitWorkflowOwnership(
    workflow.workflowId,
  );
  const timestamp = owner.now();
  const participants = cloneMap(workflow.participants);
  mapSet(participants, SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION, {
    ...source,
    fenceToken: ownership.fenceToken,
    status: SPLIT_ACK_STATUS.HANDOFF_CLOSED,
    checkpoint: {
      ...checkpoint,
      [SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: true,
      handoffGeneration: closure.generation,
      membershipPublicationEpoch: closure.membershipPublicationEpoch,
    },
    acknowledgedAt: timestamp,
    updatedAt: timestamp,
  });
  await owner.workflowCoordinator.transitionStep(
    workflow.workflowId,
    {
      nextStep: `split_handoff_closed:${closure.generation}`,
      reason: SPLIT_ACK_STATUS.HANDOFF_CLOSED,
      fenceToken: ownership.fenceToken,
      ownerId: ownership.ownerId,
    },
    {participants},
  );
  owner.logger.info?.(MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSED, {
    workflowId: closure.workflowId,
    generation: closure.generation,
    sourcePartitionId: closure.sourcePartitionId,
    targetPartitionIds: copyDenseOwnDataArray(closure.targetPartitionIds),
    targetPartitionVersion: closure.targetPartitionVersion,
    membershipPublicationEpoch: closure.membershipPublicationEpoch,
  });
  return true;
}

async function closeSplitCutoverHandoff(owner, workflowId) {
  const workflow = owner.resolveWorkflowState(workflowId);
  if (!workflow) return false;
  const status = owner.resolveSplitSourceParticipantStatus(workflow);
  if (
    status === SPLIT_ACK_STATUS.HANDOFF_CLOSED ||
    status === SPLIT_ACK_STATUS.SOURCE_DISSOLVED ||
    status === SPLIT_ACK_STATUS.DISSOLUTION_FAILED
  ) return true;
  if (
    status !== SPLIT_ACK_STATUS.CLEANUP_COMPLETED ||
    !hasDrainedReplayCheckpoint(workflow)
  ) return false;
  return owner.runSerializedOwnerStep(workflow.ownerKey, async () => {
    let current = owner.resolveWorkflowState(workflowId);
    if (!current || !hasDrainedReplayCheckpoint(current)) return false;
    const existingClosure = current.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE
    ];
    const cohort = captureEffectiveCohort(owner, existingClosure);
    if (!cohort) return false;
    let closure = existingClosure;
    if (!closureMatchesOwnerGeneration(closure, current, cohort)) {
      closure = buildClosureRecord(owner, current, cohort);
      if (!closure) return false;
      current = await persistClosureRecord(owner, current, closure);
    }
    const responses = await collectBarrierAcks(owner, closure);
    if (!responses) return false;
    const finalCohort = captureEffectiveCohort(owner, closure);
    if (!cohortsEqual(cohort, finalCohort)) return false;
    current = await persistQueryPlaneAcks(owner, current, closure, responses);
    const preAckCohort = captureEffectiveCohort(owner, closure);
    if (!cohortsEqual(cohort, preAckCohort)) return false;
    return persistHandoffClosed(owner, current, closure);
  });
}

function runDissolutionSingleFlight(owner, workflowId, operation) {
  let byWorkflow = weakMapGet(handoffDissolutionByWorkflow, owner);
  if (!byWorkflow) {
    byWorkflow = new MapConstructor();
    weakMapSet(handoffDissolutionByWorkflow, owner, byWorkflow);
  }
  const existing = mapGet(byWorkflow, workflowId);
  if (existing) return existing;
  const execution = promiseFinally(
    promiseThen(promiseResolve(), operation),
    () => {
      if (mapGet(byWorkflow, workflowId) === execution) {
        mapDelete(byWorkflow, workflowId);
      }
    },
  );
  mapSet(byWorkflow, workflowId, execution);
  return execution;
}

async function reconcileSplitCutoverHandoffs(owner) {
  const tableInfos = copyDenseOwnDataArray(owner.listTableInfos()) || [];
  for (let index = 0; index < tableInfos.length; index++) {
    const tableInfo = tableInfos[index];
    const transition = owner.parsePartitionTransition(tableInfo);
    if (
      transition?.state !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE ||
      !transition.metadata
    ) continue;
    const workflowId = transition.metadata[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID
    ];
    const sourcePartitionId = transition.metadata[
      PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID
    ];
    const partitionInfo = owner.getPartitionInfo(sourcePartitionId);
    if (
      !workflowId ||
      !partitionInfo ||
      owner.isLocalManagedSplitLeader(partitionInfo) !== true
    ) continue;
    const workflow = owner.resolveWorkflowState(workflowId);
    if (!workflow) continue;
    if (workflow.workflowOwnerId !== owner.workflowOwnerId) {
      const claim = await owner.claimSplitWorkflowOwnership(workflowId);
      if (claim.accepted !== true) continue;
    }
    await owner.finalizeSplitDissolutionIfReady(workflowId);
  }
}

function requestSplitCutoverHandoffReconcile(owner) {
  if (weakSetHas(handoffReconcileScheduled, owner)) return;
  weakSetAdd(handoffReconcileScheduled, owner);
  setImmediateFn(() => {
    weakSetDelete(handoffReconcileScheduled, owner);
    reconcileSplitCutoverHandoffs(owner).catch((error) =>
      owner.logger.warn?.(HANDOFF_RECONCILE_DEFERRED_LOG, {
        error: error?.message || error,
      }));
  });
}

export {
  closeSplitCutoverHandoff,
  requestSplitCutoverHandoffReconcile,
  runDissolutionSingleFlight,
};
