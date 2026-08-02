import {isValidRaftLogIndex} from '../../../src/raft/log-index.js';

const ACKNOWLEDGED_WRITE_ALIAS = 'ack_id';
const ACKNOWLEDGED_WRITE_BATCH_SIZE = 100;
const DEFAULT_VISIBILITY_TIMEOUT_MS = 30000;
const DEFAULT_VISIBILITY_POLL_INTERVAL_MS = 500;
const ZERO = 0;
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringTrim = Function.call.bind(String.prototype.trim);

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function normalizeNonEmptyString(value, fallback) {
  return typeof value === 'string' && value.length > ZERO ? value : fallback;
}

function normalizeFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function isNonBlankString(value) {
  return typeof value === 'string' && stringTrim(value).length > ZERO;
}

function normalizeAcknowledgedWriteIds(acknowledgedWrites) {
  return Array.isArray(acknowledgedWrites?.ids) ?
    [...new Set(arrayFilter(acknowledgedWrites.ids,
      (id) => typeof id === 'string' && id.length > ZERO,
    ))] : [];
}

function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  return Array.isArray(result?.rows) ? result.rows : [];
}

function escapeSql(value) {
  return stringReplace(String(value), /'/g, '\'\'');
}

function buildAcknowledgedWriteVisibilityQuery(tableName, idColumn, ids) {
  return 'SELECT ' + idColumn + ' AS ' + ACKNOWLEDGED_WRITE_ALIAS +
    ' FROM ' + tableName + ' WHERE ' + idColumn + ' IN (' +
    arrayMap(ids, (id) => '\'' + escapeSql(id) + '\'').join(', ') + ')';
}

async function getReachableNodes(nodes) {
  const reachability = await Promise.all(arrayMap(nodes || [], async (node) => ({
    node,
    reachable: typeof node?.isReachable !== 'function' ||
      await node.isReachable(),
  })));
  return arrayMap(
    arrayFilter(reachability, (entry) => entry.reachable),
    (entry) => entry.node,
  );
}

function resolveVisibilityOptions(options) {
  return {
    visibilityTimeoutMs: Math.max(
      ZERO,
      Math.floor(normalizeFiniteNumber(
        options.visibilityTimeoutMs,
        DEFAULT_VISIBILITY_TIMEOUT_MS,
      )),
    ),
    visibilityPollIntervalMs: Math.max(
      1,
      Math.floor(normalizeFiniteNumber(
        options.visibilityPollIntervalMs,
        DEFAULT_VISIBILITY_POLL_INTERVAL_MS,
      )),
    ),
  };
}

async function queryAcknowledgedIds(node, queryContext) {
  const nextMissingIds = [];
  const observedVisibleIds = [];
  const readAuthorityWitnesses = [];
  for (let index = ZERO; index < queryContext.ids.length;
    index += ACKNOWLEDGED_WRITE_BATCH_SIZE) {
    const idBatch = queryContext.ids.slice(
      index,
      index + ACKNOWLEDGED_WRITE_BATCH_SIZE,
    );
    const result = await node.query(buildAcknowledgedWriteVisibilityQuery(
      queryContext.tableName,
      queryContext.idColumn,
      idBatch,
    ));
    const observedIds = arrayMap(
      rowsFromResult(result),
      (row) => row?.[ACKNOWLEDGED_WRITE_ALIAS],
    );
    const visibleIdSet = new Set(arrayFilter(
      observedIds,
      (id) => typeof id === 'string' && id.length > ZERO,
    ));
    nextMissingIds.push(...arrayFilter(
      idBatch,
      (id) => !visibleIdSet.has(id),
    ));
    for (const id of idBatch) {
      if (visibleIdSet.has(id)) {
        observedVisibleIds.push(id);
      }
    }
    if (Array.isArray(result?.readAuthorityWitnesses)) {
      readAuthorityWitnesses.push(...result.readAuthorityWitnesses);
    }
  }
  return {
    missingIds: nextMissingIds,
    visibleIds: observedVisibleIds,
    readAuthorityWitnesses,
  };
}

function buildNodeObservation(
  node,
  lastCleanRead,
  lastAttemptErrored,
  lastQueryError,
  attempts,
) {
  const nodeId = String(node?.id || 'unknown');
  const cleanRead = lastCleanRead || {
    visibleIds: [],
    missingIds: [],
    readAuthorityWitnesses: [],
  };
  const base = {
    nodeId,
    completedAtMs: Date.now(),
    visibleCount: cleanRead.visibleIds.length,
    visibleIds: [...cleanRead.visibleIds],
    missingIds: [...cleanRead.missingIds],
    readAuthorityWitnesses: arrayMap(
      cleanRead.readAuthorityWitnesses,
      (witness) => ({...witness}),
    ),
    attempts,
  };
  if (!lastCleanRead || lastAttemptErrored) {
    return {
      ...base,
      state: 'unreadable',
      queryError: lastQueryError?.message || String(lastQueryError),
      retryable: true,
    };
  }
  return {
    ...base,
    state: cleanRead.missingIds.length === ZERO ? 'visible' : 'missing',
    queryError: null,
    retryable: false,
  };
}

async function inspectNodeVisibility(node, queryContext, timing) {
  let lastCleanRead = null;
  let lastAttemptErrored = false;
  let lastQueryError = null;
  const attempts = [];
  const deadlineMs = Date.now() + timing.visibilityTimeoutMs;
  for (;;) {
    try {
      lastCleanRead = await queryAcknowledgedIds(node, queryContext);
      attempts.push({
        observedAtMs: Date.now(),
        state: lastCleanRead.missingIds.length === ZERO ?
          'visible' : 'missing',
        visibleIds: [...lastCleanRead.visibleIds],
        missingIds: [...lastCleanRead.missingIds],
        readAuthorityWitnesses: arrayMap(
          lastCleanRead.readAuthorityWitnesses,
          (witness) => ({...witness}),
        ),
        retryable: lastCleanRead.missingIds.length > ZERO,
      });
      lastAttemptErrored = false;
      lastQueryError = null;
    } catch (error) {
      lastAttemptErrored = true;
      lastQueryError = error;
      attempts.push({
        observedAtMs: Date.now(),
        state: 'unreadable',
        error: error?.message || String(error),
        retryable: true,
      });
    }
    if (
      (!lastAttemptErrored && lastCleanRead?.missingIds.length === ZERO) ||
      Date.now() >= deadlineMs
    ) {
      break;
    }
    await sleep(Math.min(
      timing.visibilityPollIntervalMs,
      Math.max(ZERO, deadlineMs - Date.now()),
    ));
  }
  return buildNodeObservation(
    node,
    lastCleanRead,
    lastAttemptErrored,
    lastQueryError,
    attempts,
  );
}

function isDurableCommitWitness(value) {
  const strings = [
    value?.partitionId,
    value?.leaderNodeId,
    value?.leaderReplicaId,
    value?.entryId,
  ];
  return arrayEvery(strings, isNonBlankString) &&
    Number.isSafeInteger(value?.term) && value.term >= ZERO &&
    isValidRaftLogIndex(value?.logIndex) && value.logIndex > ZERO;
}

function hasCompleteReceiptCounts(receipt) {
  const successfulParticipantCount = receipt?.successfulParticipantCount;
  const witnessedParticipantCount = receipt?.witnessedParticipantCount;
  const participantReceipts = receipt?.participantReceipts;
  return receipt?.commitWitnessComplete === true &&
    Number.isSafeInteger(successfulParticipantCount) &&
    successfulParticipantCount > ZERO &&
    witnessedParticipantCount === successfulParticipantCount &&
    Array.isArray(participantReceipts) &&
    participantReceipts.length === successfulParticipantCount;
}

function witnessMatchesReceiptIdentity(witness, receipt) {
  const operationMatches = typeof receipt.operationId !== 'string' ||
    witness.operationId === receipt.operationId;
  const idempotencyMatches = typeof receipt.idempotencyKey !== 'string' ||
    witness.idempotencyKey === receipt.idempotencyKey;
  return operationMatches && idempotencyMatches;
}

function hasValidAcceptance(participant) {
  return participant?.complete === true &&
    isNonBlankString(participant.partitionId) &&
    isNonBlankString(participant.acceptingNodeId) &&
    Number.isSafeInteger(participant.acknowledgedAtMs) &&
    participant.acknowledgedAtMs >= ZERO;
}

function isCompleteParticipantReceipt(participant, receipt) {
  const witness = participant?.durableCommitWitness;
  const witnessMatchesPartition = isDurableCommitWitness(witness) &&
    witness.partitionId === participant.partitionId &&
    witness.leaderNodeId === participant.acceptingNodeId;
  return hasValidAcceptance(participant) && witnessMatchesPartition &&
    witnessMatchesReceiptIdentity(witness, receipt);
}

function isCompleteReceipt(receipt) {
  if (!hasCompleteReceiptCounts(receipt)) return false;
  return arrayEvery(
    receipt.participantReceipts,
    (participant) => isCompleteParticipantReceipt(participant, receipt),
  );
}

function resolveUnwitnessedIds(acknowledgedWrites, ids) {
  if (!Array.isArray(acknowledgedWrites?.receipts)) {
    return [...ids];
  }
  const witnessedReceipts = arrayFilter(
    acknowledgedWrites.receipts,
    isCompleteReceipt,
  );
  const witnessedIds = new Set(arrayMap(
    witnessedReceipts,
    (receipt) => receipt.id,
  ));
  return arrayFilter(ids, (id) => !witnessedIds.has(id));
}

function resolveCommittedPartitionIds(acknowledgedWrites, ids) {
  if (!Array.isArray(acknowledgedWrites?.receipts)) return [];
  const acknowledgedIdSet = new Set(ids);
  const partitionIds = [];
  for (const receipt of acknowledgedWrites.receipts) {
    if (!acknowledgedIdSet.has(receipt?.id) || !isCompleteReceipt(receipt)) {
      continue;
    }
    for (const participant of receipt.participantReceipts) {
      partitionIds.push(participant.partitionId);
    }
  }
  return [...new Set(partitionIds)];
}

function hasValidReadAuthorityPosition(witness) {
  return Number.isSafeInteger(witness?.term) && witness.term >= ZERO &&
    Number.isSafeInteger(witness?.observedAtMs) &&
    witness.observedAtMs >= ZERO;
}

function isReadAuthorityWitness(witness) {
  return witness?.state === 'observed' &&
    isNonBlankString(witness.partitionId) &&
    isNonBlankString(witness.servingNodeId) &&
    isNonBlankString(witness.servingReplicaId) &&
    hasValidReadAuthorityPosition(witness);
}

function hasReadAuthorityWitness(observation, committedPartitionIds) {
  if (observation.readAuthorityWitnesses.length === ZERO ||
    !arrayEvery(observation.readAuthorityWitnesses, isReadAuthorityWitness)) {
    return false;
  }
  const witnessedPartitionIds = new Set(arrayMap(
    observation.readAuthorityWitnesses,
    (witness) => witness.partitionId,
  ));
  return arrayEvery(
    committedPartitionIds,
    (partitionId) => witnessedPartitionIds.has(partitionId),
  );
}

function classifyPartialVisibility(missing, committedPartitionIds) {
  const localReplicaReads = arrayEvery(missing, (observation) =>
    hasReadAuthorityWitness(observation, committedPartitionIds) &&
    arrayEvery(observation.readAuthorityWitnesses, (witness) =>
      witness.servingNodeId === observation.nodeId));
  return localReplicaReads ?
    'durable_replica_catchup_failure' :
    'durable_read_authority_visibility_failure';
}

function areAllIdsAbsentEverywhere(
  unreadable,
  missing,
  nodeObservations,
  idCount,
) {
  if (unreadable || missing.length === ZERO) return false;
  if (missing.length !== nodeObservations.length) return false;
  return arrayEvery(
    missing,
    (observation) => observation.missingIds.length === idCount,
  );
}

function hasAuthorityBlindObservation(nodeObservations, committedPartitionIds) {
  return arraySome(nodeObservations, (observation) =>
    observation.state !== 'unreadable' &&
    !hasReadAuthorityWitness(observation, committedPartitionIds));
}

function classifyVisibility(
  nodeObservations,
  unwitnessedIds,
  idCount,
  committedPartitionIds,
) {
  const unreadable = arraySome(nodeObservations,
    (observation) => observation.state === 'unreadable',
  );
  const missing = arrayFilter(nodeObservations,
    (observation) => observation.state === 'missing',
  );
  const absentEverywhere = areAllIdsAbsentEverywhere(
    unreadable,
    missing,
    nodeObservations,
    idCount,
  );
  if (absentEverywhere && unwitnessedIds.length > ZERO) {
    return 'acknowledged_before_durable_commit';
  }
  if (unwitnessedIds.length > ZERO) {
    return 'durable_commit_witness_missing';
  }
  if (unreadable && unwitnessedIds.length === ZERO) {
    return 'durable_read_authority_unavailable';
  }
  const authorityBlind = hasAuthorityBlindObservation(
    nodeObservations,
    committedPartitionIds,
  );
  if (authorityBlind) return 'read_authority_witness_missing';
  if (missing.length > ZERO && unwitnessedIds.length === ZERO) {
    return absentEverywhere ?
      'durable_absent_everywhere' :
      classifyPartialVisibility(missing, committedPartitionIds);
  }
  return 'visible_everywhere';
}

function buildPerKeyVisibility(ids, nodeObservations) {
  return arrayMap(ids, (id) => ({
    id,
    nodeStates: arrayMap(nodeObservations, (observation) => {
      const missingIds = new Set(observation.missingIds);
      return {
        nodeId: observation.nodeId,
        state: observation.state === 'unreadable' ?
          'unreadable' : (missingIds.has(id) ? 'missing' : 'visible'),
        servingNodeIds: arrayMap(
          observation.readAuthorityWitnesses,
          (witness) => witness.servingNodeId,
        ),
      };
    }),
  }));
}

function buildVisibilityResult(
  acknowledgedWrites,
  ids,
  reachableNodes,
  nodeObservations,
) {
  const receipts = Array.isArray(acknowledgedWrites?.receipts) ?
    acknowledgedWrites.receipts : [];
  const receiptEvidenceRequired = ids.length > ZERO;
  const unwitnessedIds = resolveUnwitnessedIds(acknowledgedWrites, ids);
  const committedPartitionIds = resolveCommittedPartitionIds(
    acknowledgedWrites,
    ids,
  );
  const oracleBlind = arraySome(nodeObservations,
    (observation) => observation.state === 'unreadable' ||
      !hasReadAuthorityWitness(observation, committedPartitionIds),
  );
  const lossDetected = arraySome(nodeObservations,
    (observation) => observation.state === 'missing',
  );
  const durableWitnessVerified = receiptEvidenceRequired &&
    unwitnessedIds.length === ZERO;
  const verified = !oracleBlind && !lossDetected &&
    (!receiptEvidenceRequired || durableWitnessVerified);
  return {
    acknowledgedWriteCount: ids.length,
    reachableNodeCount: reachableNodes.length,
    receiptEvidenceRequired,
    durableWitnessVerified,
    verified,
    lossDetected,
    oracleBlind,
    classification: classifyVisibility(
      nodeObservations,
      unwitnessedIds,
      ids.length,
      committedPartitionIds,
    ),
    unwitnessedIds,
    requiredReadAuthorityPartitionIds: committedPartitionIds,
    receipts: receiptEvidenceRequired ? arrayMap(receipts,
      (receipt) => ({
        ...receipt,
        durableCommitWitnesses:
          Array.isArray(receipt?.durableCommitWitnesses) ?
            arrayMap(
              receipt.durableCommitWitnesses,
              (witness) => ({...witness}),
            ) :
            [],
        participantReceipts:
          Array.isArray(receipt?.participantReceipts) ?
            arrayMap(receipt.participantReceipts, (participant) => ({
              ...participant,
              durableCommitWitness: participant?.durableCommitWitness ?
                {...participant.durableCommitWitness} : null,
            })) : [],
        missingCommitWitnessPartitions:
          Array.isArray(receipt?.missingCommitWitnessPartitions) ?
            [...receipt.missingCommitWitnessPartitions] : [],
      }),
    ) : [],
    nodeObservations,
    perKeyVisibility: buildPerKeyVisibility(ids, nodeObservations),
  };
}

function buildVisibilityFailure(result, timing) {
  const missing = arrayFind(result.nodeObservations,
    (observation) => observation.state === 'missing',
  );
  const unreadable = arrayFind(result.nodeObservations,
    (observation) => observation.state === 'unreadable',
  );
  let message = 'Acknowledged writes missing durable commit witness: ' +
    JSON.stringify(result.unwitnessedIds.slice(ZERO, 10));
  if (unreadable) {
    message = 'Could not complete acknowledged-write visibility query on ' +
      'node ' + unreadable.nodeId + ' within ' +
      timing.visibilityTimeoutMs + 'ms: ' + unreadable.queryError;
  } else if (missing) {
    message = 'Acknowledged writes missing after rolling restart on node ' +
      missing.nodeId + ': ' +
      JSON.stringify(missing.missingIds.slice(ZERO, 10));
  }
  const error = new Error(message);
  error.acknowledgedWriteVisibility = result;
  return error;
}

async function assertAcknowledgedWritesVisibleOnReachableNodes(
  acknowledgedWrites,
  nodes,
  options = {},
) {
  const ids = normalizeAcknowledgedWriteIds(acknowledgedWrites);
  const reachableNodes = await getReachableNodes(nodes);
  const timing = resolveVisibilityOptions(options);
  const queryContext = {
    ids,
    tableName: normalizeNonEmptyString(
      acknowledgedWrites?.tableName,
      'logs',
    ),
    idColumn: normalizeNonEmptyString(
      acknowledgedWrites?.idColumn,
      'log_id',
    ),
  };
  const nodeObservations = ids.length === ZERO ? [] : await Promise.all(
    arrayMap(reachableNodes, (node) =>
      inspectNodeVisibility(node, queryContext, timing)),
  );
  const result = buildVisibilityResult(
    acknowledgedWrites,
    ids,
    reachableNodes,
    nodeObservations,
  );
  if (ids.length > ZERO && reachableNodes.length === ZERO) {
    result.oracleBlind = true;
    result.verified = false;
    result.classification = 'no_reachable_nodes';
    const error = new Error(
      'No reachable nodes available for acknowledged-write visibility check',
    );
    error.acknowledgedWriteVisibility = result;
    throw error;
  }
  if (!result.verified) {
    throw buildVisibilityFailure(result, timing);
  }
  return result;
}

export {
  assertAcknowledgedWritesVisibleOnReachableNodes,
};
