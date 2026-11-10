import {TABLES} from '../constants/index.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../bootstrap/replication-target-authority.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_READ_STRATEGY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  POLICY_AUTHORITY_STATE,
  POLICY_ERROR_CODE,
  POLICY_READ_REASON,
} from './policy-constants.js';
import {
  assertValidMessageGroupPolicy,
  assertValidTablePolicy,
  buildPolicyAuthorityDecision,
  buildPolicyRefusal,
  evaluateMessageGroupTargetDeclaration,
  hasOwnRawReplicaCount,
  mergeStoredTablePolicyOverrides,
  resolveConfiguredTablePolicyDefaults,
} from './table-policy-validation.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_SELECT_TABLE_BY_ID = 'SELECT * FROM tables WHERE table_id = ?';
const LOCAL_STR_SELECT_PARTITION_BY_ID =
  'SELECT * FROM partitions WHERE partition_id = ?';
const LOCAL_STR_SELECT_MESSAGE_GROUP_BY_ID =
  'SELECT * FROM message_groups WHERE group_id = ?';

const AUTHORITATIVE_POLICY_READ_OPTIONS = Object.freeze({
  strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  preferLeader: true,
  localReadConsistency: CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  replicaFallbackConsistency: CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
});

function policyReadUnavailable(reason, context = {}) {
  if (context.cause?.code === POLICY_ERROR_CODE.READ_UNAVAILABLE) {
    return context.cause;
  }
  const error = new Error(`Table policy unavailable: ${reason}`, {
    cause: context.cause,
  });
  error.code = POLICY_ERROR_CODE.READ_UNAVAILABLE;
  error.reason = reason;
  error.deferRetry = true;
  error.tableId = context.tableId ?? null;
  error.partitionId = context.partitionId ?? null;
  error.groupId = context.groupId ?? null;
  error.authorityState = context.authorityState ?? null;
  return error;
}

function isValidPolicyReadAuthorityWitness(witness, expectedPartitionId) {
  return Boolean(expectedPartitionId) &&
    isValidLeaderReadAuthorityWitness(witness, expectedPartitionId) &&
    Number.isSafeInteger(witness?.term) && witness.term >= 1 &&
    Number.isSafeInteger(witness?.appliedIndex) && witness.appliedIndex >= 0 &&
    Number.isSafeInteger(witness?.commitIndex) && witness.commitIndex >= 0;
}

function isCompleteAuthoritativePolicyReadResult(result, tableName) {
  const expectedPartitionId = INITIAL_PARTITION_IDS[tableName] || null;
  return result?.success === true &&
    result?.rowSetComplete === true &&
    result?.partial !== true &&
    Array.isArray(result?.rows) &&
    isValidPolicyReadAuthorityWitness(
      result?.readAuthorityWitness,
      expectedPartitionId,
    );
}

const AUTHORITATIVE_ABSENT_POLICY_ROW_OBSERVATION = Object.freeze({
  state: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
  row: null,
  rowSetComplete: true,
});

const UNAVAILABLE_OR_STALE_POLICY_ROW_OBSERVATION = Object.freeze({
  state: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
  row: null,
});

async function observeAuthoritativeGatewayRow(service, id, spec) {
  try {
    const gateway = service.getControlPlaneSystemTableGateway();
    const result = await gateway.readAuthoritativeRows(
      spec.tableName,
      spec.sql,
      [id],
      AUTHORITATIVE_POLICY_READ_OPTIONS,
    );
    const rawRow = result?.rows?.[0] || null;
    if (
      !isCompleteAuthoritativePolicyReadResult(result, spec.tableName) ||
      spec.isStaleRow?.(rawRow) === true
    ) {
      return UNAVAILABLE_OR_STALE_POLICY_ROW_OBSERVATION;
    }
    const row = spec.transformRow ? spec.transformRow(rawRow) : rawRow;
    return {
      state: row ?
        POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY :
        POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
      row: row || null,
      rowSetComplete: true,
      readAuthorityWitness: result.readAuthorityWitness,
    };
  } catch (cause) {
    return {
      ...UNAVAILABLE_OR_STALE_POLICY_ROW_OBSERVATION,
      cause,
    };
  }
}

async function observeAuthoritativePolicyRow(service, id, spec) {
  if (!id) {
    return AUTHORITATIVE_ABSENT_POLICY_ROW_OBSERVATION;
  } else if (!service?.hasAuthoritativeSystemTableReadSource?.()) {
    return UNAVAILABLE_OR_STALE_POLICY_ROW_OBSERVATION;
  }
  return observeAuthoritativeGatewayRow(service, id, spec);
}

function observeTablePolicyRow(service, tableId) {
  return observeAuthoritativePolicyRow(service, tableId, {
    tableName: TABLES.TABLES,
    sql: LOCAL_STR_SELECT_TABLE_BY_ID,
    isStaleRow: (row) =>
      service?.isStaleAgainstCommittedPolicyFence?.(tableId, row) === true,
  });
}

function observePartitionPolicyRow(service, partitionId) {
  return observeAuthoritativePolicyRow(service, partitionId, {
    tableName: TABLES.PARTITIONS,
    sql: LOCAL_STR_SELECT_PARTITION_BY_ID,
  });
}

function observeMessageGroupPolicyRow(service, groupId) {
  return observeAuthoritativePolicyRow(service, groupId, {
    tableName: TABLES.MESSAGE_GROUPS,
    sql: LOCAL_STR_SELECT_MESSAGE_GROUP_BY_ID,
  });
}

function parseAndCacheTablePolicyDecision(service, tableId, table, prov = {}) {
  try {
    const storedPolicy = service.parseStoredTablePolicy(table, tableId);
    const mergedPolicy = assertValidTablePolicy(
      service.mergeWithDefaults(storedPolicy),
    );
    const minReplicaCount = requirePolicyMinimumReplicaCount(mergedPolicy);
    service.policyCache.set(tableId, {
      policy: mergedPolicy,
      rawTablePolicies: table.table_policies ?? null,
      timestamp: service.now(),
    });
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY,
      {
        policy: mergedPolicy,
        minReplicaCount,
        rowSetComplete: prov.rowSetComplete === true,
        readAuthorityWitness: prov.readAuthorityWitness ?? null,
        tableReadAuthorityWitness: prov.readAuthorityWitness ?? null,
      },
    );
  } catch (cause) {
    if (tableId) {
      service.policyCache.delete(tableId);
    }
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {reason: cause?.reason || POLICY_READ_REASON.POLICY_INVALID, cause},
    );
  }
}

async function resolveServiceTablePolicyFact(service, tableId) {
  const observation = await observeTablePolicyRow(service, tableId);
  if (observation.state === POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE) {
    const hasStale = Boolean(
      (tableId && service.policyCache.has(tableId)) ||
      (tableId && service.committedPolicyFences?.has(tableId)) ||
      service.lookupCachedTable(tableId),
    );
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {
        reason: hasStale ?
          POLICY_READ_REASON.STALE_EVIDENCE :
          POLICY_READ_REASON.TABLE_UNAVAILABLE,
        cause: observation.cause,
      },
    );
  }
  const table = observation.row;
  if (!table) {
    if (tableId) {
      service.policyCache.delete(tableId);
      service.committedPolicyFences?.delete(tableId);
      service.supersededSnapshots?.delete(tableId);
    }
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
      {
        reason: POLICY_READ_REASON.TABLE_ABSENT,
        rowSetComplete: observation.rowSetComplete === true,
        readAuthorityWitness: observation.readAuthorityWitness ?? null,
        tableReadAuthorityWitness: observation.readAuthorityWitness ?? null,
      },
    );
  }
  return parseAndCacheTablePolicyDecision(service, tableId, table, observation);
}

function buildMissingPartitionRowDecision(service, partitionId, partitionObs) {
  if (partitionObs.state === POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE) {
    const hasStale = Boolean(service.lookupCachedPartition(partitionId));
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {
        reason: hasStale ?
          POLICY_READ_REASON.STALE_EVIDENCE :
          POLICY_READ_REASON.PARTITION_UNAVAILABLE,
        cause: partitionObs.cause,
      },
    );
  }
  const witness = partitionObs.readAuthorityWitness ?? null;
  return buildPolicyAuthorityDecision(
    POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    {
      reason: POLICY_READ_REASON.PARTITION_ABSENT,
      rowSetComplete: partitionObs.rowSetComplete === true,
      readAuthorityWitness: witness,
      partitionReadAuthorityWitness: witness,
    },
  );
}

function buildUndeclaredPartitionTargetDecision(partition, partitionObs) {
  const hasRawTarget = hasOwnRawReplicaCount(partition);
  const witness = partitionObs.readAuthorityWitness ?? null;
  return buildPolicyAuthorityDecision(
    hasRawTarget ?
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE :
      POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    {
      reason: hasRawTarget ?
        POLICY_READ_REASON.TARGET_INVALID :
        POLICY_READ_REASON.TARGET_UNDECLARED,
      rowSetComplete: !hasRawTarget && partitionObs.rowSetComplete === true,
      readAuthorityWitness: witness,
      partitionReadAuthorityWitness: witness,
    },
  );
}

async function resolveServicePartitionPolicyFact(
  service,
  partitionId,
  options = {},
) {
  const partitionObs = await observePartitionPolicyRow(service, partitionId);
  if (!partitionObs.row) {
    return buildMissingPartitionRowDecision(service, partitionId, partitionObs);
  }
  const partition = partitionObs.row;
  const target = resolveDesiredReplicationFactor(partition);
  if (target.source !== REPLICATION_TARGET_SOURCE.PARTITION_ROW) {
    return buildUndeclaredPartitionTargetDecision(partition, partitionObs);
  }
  const tableDecision = await service.resolveTablePolicyFact(
    partition.table_id,
    options,
  );
  if (tableDecision.state !== POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY) {
    return tableDecision;
  }
  return buildPolicyAuthorityDecision(
    POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY,
    {
      policy: {
        ...tableDecision.policy,
        targetReplicaCount: target.replicationFactor,
      },
      minReplicaCount: tableDecision.minReplicaCount,
      targetReplicaCount: target.replicationFactor,
      rowSetComplete:
        partitionObs.rowSetComplete === true &&
        tableDecision.rowSetComplete === true,
      readAuthorityWitness: tableDecision.readAuthorityWitness,
      partitionReadAuthorityWitness: partitionObs.readAuthorityWitness,
      tableReadAuthorityWitness: tableDecision.tableReadAuthorityWitness,
    },
  );
}

function buildInvalidMessageGroupPolicyDecision(service, cacheKey, cause) {
  service.policyCache.delete(cacheKey);
  return buildPolicyAuthorityDecision(
    POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    {reason: cause?.reason || POLICY_READ_REASON.POLICY_INVALID, cause},
  );
}

function parseAndCacheMessageGroupPolicyDecision(
  service,
  cacheKey,
  groupId,
  group,
  prov = {},
) {
  let storedPolicy;
  try {
    storedPolicy = service.parseStoredMessageGroupPolicy(group, groupId);
  } catch (cause) {
    return buildInvalidMessageGroupPolicyDecision(service, cacheKey, cause);
  }
  const targetEval = evaluateMessageGroupTargetDeclaration(
    group,
    storedPolicy,
    prov,
  );
  if (targetEval.decision) {
    service.policyCache.delete(cacheKey);
    return targetEval.decision;
  }
  const declaredTarget = targetEval.declaredTarget;
  const minReplicaCount = storedPolicy.minReplicaCount ?? declaredTarget;
  try {
    const mergedPolicy = assertValidMessageGroupPolicy(
      service.mergeMessageGroupWithDefaults({
        ...storedPolicy,
        targetReplicaCount: declaredTarget,
      }),
    );
    if (storedPolicy.minReplicaCount !== undefined) {
      mergedPolicy.minReplicaCount = storedPolicy.minReplicaCount;
    }
    service.policyCache.set(cacheKey, {
      policy: mergedPolicy,
      rawPolicy: group.policy ?? null,
      rawReplicaCount: group.replica_count ?? group.replicaCount ?? null,
      timestamp: service.now(),
    });
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY,
      {
        policy: mergedPolicy,
        minReplicaCount,
        targetReplicaCount: declaredTarget,
        rowSetComplete: prov.rowSetComplete === true,
        readAuthorityWitness: prov.readAuthorityWitness ?? null,
      },
    );
  } catch (cause) {
    return buildInvalidMessageGroupPolicyDecision(service, cacheKey, cause);
  }
}

async function resolveServiceMessageGroupPolicyFact(service, groupId) {
  const cacheKey = groupId ? `mg:${groupId}` : null;
  if (!groupId) {
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
      {reason: POLICY_READ_REASON.MESSAGE_GROUP_ABSENT, rowSetComplete: true},
    );
  }
  const observation = await observeMessageGroupPolicyRow(service, groupId);
  if (observation.state === POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE) {
    const hasStale = Boolean(
      service.policyCache.has(cacheKey) ||
      service.lookupCachedMessageGroup(groupId),
    );
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {
        reason: hasStale ?
          POLICY_READ_REASON.STALE_EVIDENCE :
          POLICY_READ_REASON.MESSAGE_GROUP_UNAVAILABLE,
        cause: observation.cause,
      },
    );
  }
  const group = observation.row;
  if (!group) {
    service.policyCache.delete(cacheKey);
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
      {
        reason: POLICY_READ_REASON.MESSAGE_GROUP_ABSENT,
        rowSetComplete: observation.rowSetComplete === true,
        readAuthorityWitness: observation.readAuthorityWitness ?? null,
      },
    );
  }
  return parseAndCacheMessageGroupPolicyDecision(
    service,
    cacheKey,
    groupId,
    group,
    observation,
  );
}

async function readConfiguredTablePolicy(service, tableId) {
  const table = tableId ? await service.readTableRow(tableId) : null;
  if (!table) {
    if (tableId) {
      service.policyCache.delete(tableId);
      service.committedPolicyFences?.delete(tableId);
      service.supersededSnapshots?.delete(tableId);
    }
    throw policyReadUnavailable(POLICY_READ_REASON.TABLE_ABSENT, {
      tableId,
      authorityState: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    });
  }
  const cached = service.policyCache.get(tableId);
  if (
    cached &&
    service.now() - cached.timestamp < service.cacheTTLMs &&
    (table.table_policies ?? null) === cached.rawTablePolicies
  ) {
    return cached.policy;
  }
  const decision = parseAndCacheTablePolicyDecision(service, tableId, table);
  if (decision.state !== POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY) {
    throw policyReadUnavailable(
      decision.reason || POLICY_READ_REASON.POLICY_INVALID,
      {cause: decision.cause, tableId, authorityState: decision.state},
    );
  }
  return decision.policy;
}

async function readConfiguredPartitionPolicy(service, partitionId) {
  const partition = partitionId ?
    await service.readPartitionRow(partitionId) :
    null;
  if (!partition) {
    throw policyReadUnavailable(POLICY_READ_REASON.PARTITION_ABSENT, {
      partitionId,
      authorityState: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    });
  }
  const target = resolveDesiredReplicationFactor(partition);
  if (target.source !== REPLICATION_TARGET_SOURCE.PARTITION_ROW) {
    const hasRawTarget = hasOwnRawReplicaCount(partition);
    throw policyReadUnavailable(
      hasRawTarget ?
        POLICY_READ_REASON.TARGET_INVALID :
        POLICY_READ_REASON.TARGET_UNDECLARED,
      {
        partitionId,
        authorityState: hasRawTarget ?
          POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE :
          POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
      },
    );
  }
  const tablePolicy = await service.getTablePolicy(partition.table_id);
  return {...tablePolicy, targetReplicaCount: target.replicationFactor};
}

function isFreshCachedMessageGroupPolicy(service, cached, group) {
  if (!cached || service.now() - cached.timestamp >= service.cacheTTLMs) {
    return false;
  }
  const rawPolicy = group.policy ?? null;
  const rawReplicaCount = group.replica_count ?? group.replicaCount ?? null;
  return rawPolicy === cached.rawPolicy &&
    rawReplicaCount === cached.rawReplicaCount;
}

async function readConfiguredMessageGroupPolicy(service, groupId) {
  const cacheKey = groupId ? `mg:${groupId}` : null;
  const group = groupId ? await service.readMessageGroupRow(groupId) : null;
  if (!group) {
    if (cacheKey) service.policyCache.delete(cacheKey);
    throw policyReadUnavailable(POLICY_READ_REASON.MESSAGE_GROUP_ABSENT, {
      groupId,
      authorityState: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    });
  }
  const cached = service.policyCache.get(cacheKey);
  if (isFreshCachedMessageGroupPolicy(service, cached, group)) {
    return cached.policy;
  }
  const decision = parseAndCacheMessageGroupPolicyDecision(
    service,
    cacheKey,
    groupId,
    group,
  );
  if (decision.state !== POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY) {
    throw policyReadUnavailable(
      decision.reason || POLICY_READ_REASON.POLICY_INVALID,
      {cause: decision.cause, groupId, authorityState: decision.state},
    );
  }
  return decision.policy;
}

function hasValidPartitionPolicyFactWitnesses(decision) {
  const partitionWitness =
    decision?.partitionReadAuthorityWitness ?? decision?.readAuthorityWitness;
  const tableWitness =
    decision?.tableReadAuthorityWitness ?? decision?.readAuthorityWitness;
  return decision?.rowSetComplete === true &&
    isValidPolicyReadAuthorityWitness(
      partitionWitness,
      INITIAL_PARTITION_IDS[TABLES.PARTITIONS],
    ) &&
    isValidPolicyReadAuthorityWitness(
      tableWitness,
      INITIAL_PARTITION_IDS[TABLES.TABLES],
    );
}

function isAuthoritativePolicyDecisionCandidate(decision) {
  return Boolean(
    decision &&
    typeof decision === LOCAL_STR_OBJECT &&
    decision.state === POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY,
  );
}

function buildRejectedOwnerPolicyDecision(decision, context) {
  if (
    decision?.state === POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE &&
    decision.rowSetComplete === true
  ) {
    return decision;
  }
  return buildPolicyAuthorityDecision(
    POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    {
      reason: decision?.reason || POLICY_READ_REASON.READ_FAILED,
      cause: decision?.cause,
      ...context,
    },
  );
}

function normalizeOwnerPartitionPolicyDecision(decision, partitionId) {
  if (!isAuthoritativePolicyDecisionCandidate(decision)) {
    return buildRejectedOwnerPolicyDecision(decision, {partitionId});
  }
  if (!hasValidPartitionPolicyFactWitnesses(decision)) {
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {reason: POLICY_READ_REASON.STALE_EVIDENCE, partitionId},
    );
  }
  try {
    const target = requirePolicyTargetReplicaCount(decision.policy);
    const minimum = requirePolicyMinimumReplicaCount(decision.policy);
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY,
      {...decision, minReplicaCount: minimum, targetReplicaCount: target},
    );
  } catch (cause) {
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {reason: cause?.reason || POLICY_READ_REASON.POLICY_INVALID, cause, partitionId},
    );
  }
}

function normalizeOwnerMessageGroupPolicyDecision(decision, groupId) {
  if (!isAuthoritativePolicyDecisionCandidate(decision)) {
    return buildRejectedOwnerPolicyDecision(decision, {groupId});
  }
  if (
    decision.rowSetComplete !== true ||
    !isValidPolicyReadAuthorityWitness(
      decision.readAuthorityWitness,
      INITIAL_PARTITION_IDS[TABLES.MESSAGE_GROUPS],
    )
  ) {
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {reason: POLICY_READ_REASON.STALE_EVIDENCE, groupId},
    );
  }
  try {
    const target = requirePolicyTargetReplicaCount(decision.policy);
    const minimum = decision.policy?.minReplicaCount !== undefined ?
      requirePolicyMinimumReplicaCount(decision.policy) :
      target;
    if (target % 2 === 0 || minimum % 2 === 0) {
      return buildPolicyAuthorityDecision(
        POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
        {reason: POLICY_READ_REASON.TARGET_INVALID, groupId},
      );
    }
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY,
      {...decision, minReplicaCount: minimum, targetReplicaCount: target},
    );
  } catch (cause) {
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {reason: cause?.reason || POLICY_READ_REASON.POLICY_INVALID, cause, groupId},
    );
  }
}

async function resolvePartitionPolicyFactFromOwner(
  owner,
  partitionId,
  options = {},
) {
  if (typeof owner?.resolvePartitionPolicyFact !== LOCAL_STR_FUNCTION) {
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {reason: POLICY_READ_REASON.OWNER_UNAVAILABLE},
    );
  }
  try {
    const decision = await owner.resolvePartitionPolicyFact(partitionId, options);
    return normalizeOwnerPartitionPolicyDecision(decision, partitionId);
  } catch (cause) {
    const state =
      cause?.authorityState === POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE ?
        POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE :
        POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE;
    return buildPolicyAuthorityDecision(state, {
      reason: cause?.reason || POLICY_READ_REASON.READ_FAILED,
      cause,
    });
  }
}

async function resolveMessageGroupPolicyFactFromOwner(
  owner,
  groupId,
  options = {},
) {
  if (typeof owner?.resolveMessageGroupPolicyFact !== LOCAL_STR_FUNCTION) {
    return buildPolicyAuthorityDecision(
      POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
      {reason: POLICY_READ_REASON.OWNER_UNAVAILABLE},
    );
  }
  try {
    const decision = await owner.resolveMessageGroupPolicyFact(groupId, options);
    return normalizeOwnerMessageGroupPolicyDecision(decision, groupId);
  } catch (cause) {
    const state =
      cause?.authorityState === POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE ?
        POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE :
        POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE;
    return buildPolicyAuthorityDecision(state, {
      reason: cause?.reason || POLICY_READ_REASON.READ_FAILED,
      cause,
    });
  }
}

async function readAuthoritativePolicyForPartition(
  owner,
  partitionId,
  options = {},
) {
  const decision = await resolvePartitionPolicyFactFromOwner(
    owner,
    partitionId,
    options,
  );
  if (decision.state !== POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY) {
    throw policyReadUnavailable(
      decision.reason || POLICY_READ_REASON.READ_FAILED,
      {cause: decision.cause, partitionId, authorityState: decision.state},
    );
  }
  return decision.policy;
}

async function readPolicyForPartition(owner, partitionId, options = {}) {
  if (options?.requireAuthoritative === true) {
    return readAuthoritativePolicyForPartition(owner, partitionId, options);
  }
  if (typeof owner?.getPolicyForPartition !== LOCAL_STR_FUNCTION) {
    throw policyReadUnavailable(POLICY_READ_REASON.OWNER_UNAVAILABLE, {
      partitionId,
    });
  }
  try {
    const policy = await owner.getPolicyForPartition(partitionId);
    if (!policy || typeof policy !== LOCAL_STR_OBJECT || Array.isArray(policy)) {
      throw policyReadUnavailable(POLICY_READ_REASON.POLICY_INVALID, {
        partitionId,
      });
    }
    requirePolicyTargetReplicaCount(policy);
    requirePolicyMinimumReplicaCount(policy);
    return policy;
  } catch (cause) {
    throw policyReadUnavailable(cause?.reason || POLICY_READ_REASON.READ_FAILED, {
      cause,
      partitionId,
    });
  }
}

async function readPolicyForMessageGroup(owner, groupId, options = {}) {
  const decision = await resolveMessageGroupPolicyFactFromOwner(
    owner,
    groupId,
    options,
  );
  if (decision.state !== POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY) {
    throw policyReadUnavailable(
      decision.reason || POLICY_READ_REASON.READ_FAILED,
      {cause: decision.cause, groupId, authorityState: decision.state},
    );
  }
  return decision.policy;
}

function requirePolicyTargetReplicaCount(policy, allowZero = false) {
  const target = policy?.targetReplicaCount;
  if (!Number.isSafeInteger(target) || target < (allowZero ? 0 : 1)) {
    throw policyReadUnavailable(POLICY_READ_REASON.TARGET_INVALID);
  }
  return target;
}

function requirePolicyMinimumReplicaCount(policy) {
  const minimum = policy?.minReplicaCount;
  if (!Number.isSafeInteger(minimum) || minimum < 1) {
    throw policyReadUnavailable(POLICY_READ_REASON.MINIMUM_INVALID);
  }
  return minimum;
}

export {
  buildPolicyAuthorityDecision,
  buildPolicyRefusal,
  isValidPolicyReadAuthorityWitness,
  mergeStoredTablePolicyOverrides,
  policyReadUnavailable,
  readConfiguredMessageGroupPolicy,
  readConfiguredPartitionPolicy,
  readConfiguredTablePolicy,
  readPolicyForMessageGroup,
  readPolicyForPartition,
  requirePolicyMinimumReplicaCount,
  requirePolicyTargetReplicaCount,
  resolveConfiguredTablePolicyDefaults,
  resolveMessageGroupPolicyFactFromOwner,
  resolvePartitionPolicyFactFromOwner,
  resolveServiceMessageGroupPolicyFact,
  resolveServicePartitionPolicyFact,
  resolveServiceTablePolicyFact,
};
