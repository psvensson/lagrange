import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {AddressManager} from '../address/address-manager.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../constants/index.js';
import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';
import {PLACEMENT_RESULT_FIELD} from '../partition/partition-placement-admission-constants.js';
import {
  requestPlacementAdmission,
  routePlacementAdmission,
} from '../partition/partition-placement-admission.js';
import {
  isWriteOutcomeUnknown,
  resolveEntryId,
} from '../partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  PLACEMENT_FORMATION_STATE,
  PLACEMENT_OUTCOME,
} from './replica-placement-owner-constants.js';
import {
  buildRuntimeServiceAdmissionStatement,
} from './replica-placement-owner-admission-statement.js';
import {
  placementReplicaIdOf,
} from '../partition/partition-placement-admission-identity.js';
import {
  buildRuntimeServiceTargetClaimKey,
} from './runtime-service-replica-identity.js';
import {attachReplicaPlacementOwner} from './replica-placement-owner.js';
import {isBootstrapTopologyDispatchDeferred} from './replica-status.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';
import {buildDeliveryEnvelope} from '../transport/transport-semantic-outcome.js';

// ends-on: PLACEMENT_ADMIT response from replica_operations-p1 leader
const DEFAULT_PLACEMENT_ADMISSION_TIMEOUT_MS = 5000;
const DEFAULT_FORMATION_LATCH_EPOCH = 1;
const PLACEMENT_ENTRY_PREFIX = 'placement-admit';
const DEFAULT_NODE_ID = 'node-1';
const PLACEMENT_LEDGER_LEADER_UNAVAILABLE_CODE =
  'PLACEMENT_LEDGER_LEADER_UNAVAILABLE';
const PLACEMENT_ADMISSION_REFUSED_CODE = 'PLACEMENT_ADMISSION_REFUSED';
const SELECT_OPERATION_BY_ID_SQL =
  'SELECT * FROM replica_operations WHERE operation_id = ?';
const UPDATE_HELD_BOOTSTRAP_OPERATION_SQL =
  'UPDATE replica_operations SET steps_history = ?, updated_at = ? ' +
  'WHERE operation_id = ? AND workflow_step = ?';
const DEFINITE_PLACEMENT_OUTCOMES = Object.freeze(new Set([
  PLACEMENT_OUTCOME.ADMITTED,
  PLACEMENT_OUTCOME.REFUSED,
  PLACEMENT_OUTCOME.RELEASED,
]));

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER =
  'Failed to prime coordinator-created operation progress';
const OWNER_PROGRESS_STEP_METHOD = Object.freeze({
  ARM: 'armCoordinatorCreatedOperation',
  DISPATCH_AFTER_CREATE_BUDGET_TURN:
    'dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn',
});

const {
  OPERATION_METADATA_KEY,
  OperationType,
  REBALANCE_COORDINATOR_EVENT,
  STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
  WORKFLOW_STEP,
  createOperationRecord,
} = REBALANCE_COORDINATOR_SHARED;

// The founding-cohort stamp the hold releaser writes: each stamp field (named
// as the operation field the decoded row carries) and the steps-history
// metadata key the durable row stores it under.
const BOOTSTRAP_TOPOLOGY_STAMP_FIELDS = Object.freeze([
  [ReplicaOperationField.REPLICA_IDS, OPERATION_METADATA_KEY.REPLICA_IDS],
  [ReplicaOperationField.PEER_ADDRESSES, OPERATION_METADATA_KEY.PEER_ADDRESSES],
  [
    ReplicaOperationField.BOOTSTRAP_MEMBERSHIP,
    OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP,
  ],
  [
    ReplicaOperationField.BOOTSTRAP_TABLE_METADATA,
    OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA,
  ],
  [
    ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA,
    OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA,
  ],
]);

// The one state a hold release may start from: the durable row is PENDING,
// non-terminal, and still carries the bootstrap-topology dispatch hold. Any
// other row is held by another owner (a dispatch lane claimed it, a prior
// attempt released it, it finished).
function isHeldPendingBootstrapOperation(operation) {
  return Boolean(operation) &&
    operation.workflowStep === WORKFLOW_STEP.PENDING &&
    !Number.isFinite(operation.completedAt) &&
    isBootstrapTopologyDispatchDeferred(operation);
}

// Build the released row from the DURABLE row the releaser read, never from a
// caller's in-memory copy: the stamp lands on the creation step entry, the
// hold leaves every entry, and the decoded operation fields mirror the stamp.
function buildBootstrapTopologyReleasedOperation(durableOperation, stamp, now) {
  const released = structuredClone(durableOperation);
  const [creationEntry] = released.stepsHistory;
  for (const [operationField, metadataKey] of BOOTSTRAP_TOPOLOGY_STAMP_FIELDS) {
    const value = stamp[operationField];
    if (value === null || value === undefined) {
      continue;
    }
    creationEntry[metadataKey] = structuredClone(value);
    released[operationField] = structuredClone(value);
  }
  for (const entry of released.stepsHistory) {
    delete entry[OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED];
  }
  released.updatedAt = now;
  return released;
}

function buildBootstrapTopologyHoldReleaseOutcome(released, operation) {
  return Object.freeze({
    released,
    operation: operation ? structuredClone(operation) : null,
  });
}

function isLedgerServiceRow(row) {
  return row &&
    row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
    (row[COLUMN.PARTITION_ID] === LEDGER_PARTITION_ID ||
      row[COLUMN.ENTITY_ID] === LEDGER_PARTITION_ID);
}

function formatLedgerReplicaAddress(row) {
  if (!row) return null;
  if (typeof row.service_address === 'string' && row.service_address.length > 0) {
    return row.service_address;
  }
  const nodeId = row[COLUMN.NODE_ID];
  const replicaId = row[COLUMN.REPLICA_ID];
  if (typeof nodeId !== 'string' || typeof replicaId !== 'string') return null;
  return AddressManager.getInstance().format(
    nodeId,
    SERVICE_TYPE.PARTITION,
    replicaId,
  );
}

function wrapPlacementTransport(messageRouter) {
  if (!messageRouter) return null;
  if (messageRouter.deliver) return messageRouter;
  if (!messageRouter.sendToAddress) return null;
  return {
    deliver: async (address, message, options) => {
      const response = await messageRouter.sendToAddress(address, message, options);
      return response?.transport ? response :
        buildDeliveryEnvelope({acknowledged: true}, response);
    },
  };
}

function parseOperationStepsHistory(rawHistory) {
  return typeof rawHistory === 'string' ? JSON.parse(rawHistory) : [];
}

function applyCreationMetadataToOperation(operation, creationStep) {
  if (!creationStep) return;
  for (const [operationField, metadataKey] of BOOTSTRAP_TOPOLOGY_STAMP_FIELDS) {
    if (creationStep[metadataKey] !== undefined) {
      operation[operationField] = creationStep[metadataKey];
    }
  }
}

function mapLocalLedgerRowToOperation(row, repository) {
  if (repository?.mapRowToOperation) {
    return repository.mapRowToOperation(row);
  }
  const stepsHistory = parseOperationStepsHistory(row.steps_history);
  const operation = createOperationRecord({
    operationId: row.operation_id,
    type: row.type,
    partitionId: row.partition_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    replicaId: row.replica_id,
    sourceReplicaId: row.source_replica_id || null,
    membershipPublicationEpoch: row.membership_publication_epoch ?? null,
  });
  operation.entityType = row.entity_type;
  operation.entityId = row.entity_id;
  operation.targetClaimKey = row.target_claim_key || null;
  operation.workflowStep = row.workflow_step;
  operation.status = row.status;
  operation.stepsHistory = stepsHistory;
  operation.createdAt = row.created_at;
  operation.updatedAt = row.updated_at;
  operation.completedAt = row.completed_at ?? null;
  applyCreationMetadataToOperation(operation, stepsHistory[0]);
  return operation;
}

function buildSynthesizedPlacementOperation(
  operationId,
  descriptor,
  defaultSourceNodeId,
) {
  const sourceNodeId = descriptor.sourceNodeId ?
    descriptor.sourceNodeId : defaultSourceNodeId;
  const replicaId = descriptor.replicaId ?
    descriptor.replicaId : placementReplicaIdOf(operationId);
  const entityId = descriptor.entityId ?
    descriptor.entityId : descriptor.partitionId;
  const {
    type = OperationType.ADD,
    entityType = SERVICE_TYPE.PARTITION,
  } = descriptor;
  const operation = createOperationRecord({
    operationId,
    type,
    partitionId: descriptor.partitionId,
    sourceNodeId,
    targetNodeId: descriptor.targetNodeId,
    replicaId,
    sourceReplicaId: descriptor.sourceReplicaId || null,
    membershipPublicationEpoch: null,
  });
  operation.entityType = entityType;
  operation.entityId = entityId;
  operation.targetClaimKey = descriptor.targetClaimKey || null;
  if (descriptor.deferredBootstrap === true &&
      operation.stepsHistory.length > 0) {
    operation.stepsHistory[0][
      OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED
    ] = true;
  }
  return operation;
}

function resolveRuntimeServiceIntentKey(
  context,
  operationReplicaId,
) {
  const {
    move,
    criticalAddLikeIntentKey,
    dedupeKey,
    entityId,
    normalizedMoveType,
  } = context;
  if (move.operationIntentId) return move.operationIntentId;
  if (criticalAddLikeIntentKey) return criticalAddLikeIntentKey;
  if (dedupeKey) return dedupeKey;
  return `runtime_service:${entityId}:${normalizedMoveType}:${move.nodeId}:${operationReplicaId}`;
}

function throwRuntimeServicePlacementError(entityId, answer, result) {
  const failureCode = result?.reason || PLACEMENT_ADMISSION_REFUSED_CODE;
  const error = new Error(
    `Placement admission refused for ${entityId}: ${failureCode}`,
  );
  error.code = failureCode;
  error.failureCode = failureCode;
  error.entryId = answer?.entryId || null;
  error.placementResult = result || null;
  error.admissionAnswer = answer || null;
  throw error;
}

function isSingleOperationPlacementAccepted(result) {
  return result?.outcome === PLACEMENT_OUTCOME.ADMITTED &&
    Array.isArray(result.operationIds) &&
    result.operationIds.length > 0;
}

const operationCreationSupportMethods = {
  resolveActiveLocalLedgerLeaderService() {
    if (!(this.ledgerPartitionServices instanceof Set)) return null;
    for (const service of this.ledgerPartitionServices) {
      if (service &&
          service.partitionId === LEDGER_PARTITION_ID &&
          service.isLeader === true &&
          !service.isShutdown) {
        return service;
      }
    }
    return null;
  },

  resolveRemoteLedgerLeaderAddress() {
    const cache = this.systemTableCache;
    if (!cache?.getAll) return null;
    const rows = (cache.getAll(TABLES.SERVICES) || []).filter(isLedgerServiceRow);
    const roleLeader = rows.find((row) => row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER);
    if (roleLeader) return formatLedgerReplicaAddress(roleLeader);
    const partitions = cache.getAll(TABLES.PARTITIONS) || [];
    const ledgerPartition = partitions.find(
      (row) => row?.[COLUMN.PARTITION_ID] === LEDGER_PARTITION_ID,
    );
    const leaderNodeId = ledgerPartition?.leader_node_id;
    const nodeLeader = typeof leaderNodeId === 'string' ?
      rows.find((row) => row[COLUMN.NODE_ID] === leaderNodeId) : null;
    return formatLedgerReplicaAddress(nodeLeader || rows[0] || null);
  },

  resolveFormationLatchEpochForPlacement() {
    const owner = this.controlPlaneReadinessService?.serveEligibilityOwner;
    const formation = owner?.answerCommittedNodes ?
      owner.answerCommittedNodes()?.formation : null;
    if (formation?.state === PLACEMENT_FORMATION_STATE.FORMED &&
        Number.isSafeInteger(formation.latchEpoch)) {
      return formation.latchEpoch;
    }
    return DEFAULT_FORMATION_LATCH_EPOCH;
  },

  resolvePlacementAdmissionEntryId(intentKey, explicitEntryId) {
    if (!(this.placementAdmissionEntryIds instanceof Map)) {
      this.placementAdmissionEntryIds = new Map();
    }
    const key = intentKey || explicitEntryId || null;
    if (key && this.placementAdmissionEntryIds.has(key)) {
      return {key, entryId: this.placementAdmissionEntryIds.get(key)};
    }
    const nodePrefix = this.nodeId || DEFAULT_NODE_ID;
    const entryId = explicitEntryId ||
      `${PLACEMENT_ENTRY_PREFIX}:${nodePrefix}:${resolveEntryId(null)}`;
    if (key) {
      this.placementAdmissionEntryIds.set(key, entryId);
    }
    return {key, entryId};
  },

  async admitPlacementStatement({
    entryId,
    intentKey = null,
    statement,
    timeoutMs = DEFAULT_PLACEMENT_ADMISSION_TIMEOUT_MS,
  }) {
    const resolved = this.resolvePlacementAdmissionEntryId(intentKey, entryId);
    const payload = {entryId: resolved.entryId, body: statement};
    const localLeader = this.resolveActiveLocalLedgerLeaderService();
    let answer;
    if (localLeader) {
      answer = await requestPlacementAdmission(localLeader, payload);
    } else {
      const leaderAddress = this.resolveRemoteLedgerLeaderAddress();
      const transport = wrapPlacementTransport(this.messageRouter);
      if (!leaderAddress || !transport) {
        const error = new Error(
          `Cannot route PLACEMENT_ADMIT: ledger leader unreachable (${LEDGER_PARTITION_ID})`,
        );
        error.code = PLACEMENT_LEDGER_LEADER_UNAVAILABLE_CODE;
        throw error;
      }
      answer = await routePlacementAdmission(
        transport,
        leaderAddress,
        payload,
        {timeoutMs},
      );
    }
    const result = answer?.[PLACEMENT_RESULT_FIELD];
    if (resolved.key &&
        !isWriteOutcomeUnknown(answer) &&
        DEFINITE_PLACEMENT_OUTCOMES.has(result?.outcome)) {
      this.placementAdmissionEntryIds.delete(resolved.key);
    }
    return {...answer, entryId: resolved.entryId};
  },

  readOperationFromLocalLedgerDb(operationId) {
    if (!(this.ledgerPartitionServices instanceof Set)) return null;
    for (const service of this.ledgerPartitionServices) {
      if (!service?.db?.open) continue;
      const row = service.db
        .prepare(SELECT_OPERATION_BY_ID_SQL)
        .get(operationId);
      if (row) {
        return mapLocalLedgerRowToOperation(row, this.repository);
      }
    }
    return null;
  },

  persistHeldBootstrapOperationInLocalLedgerDb(released) {
    if (!(this.ledgerPartitionServices instanceof Set)) return false;
    let updated = false;
    const serializedSteps = JSON.stringify(released.stepsHistory);
    for (const service of this.ledgerPartitionServices) {
      if (!service?.db?.open) continue;
      const info = service.db
        .prepare(UPDATE_HELD_BOOTSTRAP_OPERATION_SQL)
        .run(
          serializedSteps,
          released.updatedAt,
          released.operationId,
          WORKFLOW_STEP.PENDING,
        );
      if (info?.changes > 0) {
        updated = true;
      }
    }
    return updated;
  },

  async materializePlacementOperationById(operationId, descriptor = {}) {
    if (this.repository?.queryAuthoritativeOperationById) {
      const authoritative =
        await this.repository.queryAuthoritativeOperationById(operationId);
      if (authoritative) return authoritative;
    }
    const localOperation = this.readOperationFromLocalLedgerDb(operationId);
    if (localOperation) return localOperation;
    return buildSynthesizedPlacementOperation(
      operationId,
      descriptor,
      this.nodeId || DEFAULT_NODE_ID,
    );
  },

  async materializePlacementAdmittedOperations({
    operationIds,
    partitionId,
    entityType = SERVICE_TYPE.PARTITION,
    entityId = partitionId,
    targetNodeIds = [],
    type = OperationType.ADD,
    sourceNodeId = this.nodeId || DEFAULT_NODE_ID,
    deferredBootstrap = false,
  }) {
    const operations = [];
    for (let idx = 0; idx < operationIds.length; idx += 1) {
      const operationId = operationIds[idx];
      const operation = await this.materializePlacementOperationById(operationId, {
        type,
        partitionId,
        entityType,
        entityId,
        targetNodeId: targetNodeIds[idx] || targetNodeIds[0] || null,
        sourceNodeId,
        deferredBootstrap,
      });
      operations.push(operation);
    }
    return operations;
  },

  async resolveRuntimeServicePlacementIds(context) {
    const {
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    } = context;
    if (normalizedMoveType === OperationType.REMOVE) {
      return {
        operationReplicaId: move.replicaId || null,
        sourceReplicaId: null,
      };
    }
    if (normalizedMoveType === OperationType.ADD) {
      const operationReplicaId = move.replicaId || move.replicaIntentId ||
        await this.allocateCanonicalReplicaId({
          partitionId, entityType, entityId, excludeReplicaIds: [],
        });
      return {operationReplicaId, sourceReplicaId: null};
    }
    const sourceReplicaId = move.sourceReplicaId || move.replicaId || null;
    const explicitTarget = move.replicaId && move.replicaId !== sourceReplicaId ?
      move.replicaId : move.replicaIntentId;
    const operationReplicaId = explicitTarget ||
      await this.allocateCanonicalReplicaId({
        partitionId,
        entityType,
        entityId,
        excludeReplicaIds: sourceReplicaId ? [sourceReplicaId] : [],
      });
    return {operationReplicaId, sourceReplicaId};
  },

  async announcePlacementCreatedOperation(operation, context) {
    if (this.stats) {
      this.stats.operationsCreated = (this.stats.operationsCreated || 0) + 1;
    }
    this.rememberOperationIntents?.(
      [context.dedupeKey, context.criticalAddLikeIntentKey],
      operation,
    );
    this.emit?.(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, {operation});
    await this.armCoordinatorCreatedOperationProgress(
      operation,
      context.createdOperationArmContext,
    );
  },

  async createRuntimeServiceOperationViaPlacementAdmission(context) {
    const {
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    } = context;
    const {operationReplicaId, sourceReplicaId} =
      await this.resolveRuntimeServicePlacementIds(context);
    this.assertRuntimeServiceTargetIdentity(
      operationReplicaId,
      entityType,
      entityId,
      normalizedMoveType,
    );
    const resolvedSourceNodeId = context.sourceNodeId ?
      context.sourceNodeId : (this.nodeId || DEFAULT_NODE_ID);
    const statement = buildRuntimeServiceAdmissionStatement({
      serviceId: entityId,
      sourceNodeId: resolvedSourceNodeId,
      formationLatchEpoch: this.resolveFormationLatchEpochForPlacement(),
      positions: move?.positions || {},
      move: {
        type: normalizedMoveType,
        targetNodeId: move.nodeId,
        replicaId: operationReplicaId,
        sourceReplicaId,
        copySourceNodeId: null,
      },
    });
    const answer = await this.admitPlacementStatement({
      entryId: move.entryId || null,
      intentKey: resolveRuntimeServiceIntentKey(context, operationReplicaId),
      statement,
    });
    const result = answer?.[PLACEMENT_RESULT_FIELD];
    if (!isSingleOperationPlacementAccepted(result)) {
      throwRuntimeServicePlacementError(entityId, answer, result);
    }
    const [operationId] = result.operationIds;
    const targetClaimKey = normalizedMoveType !== OperationType.REMOVE ?
      buildRuntimeServiceTargetClaimKey(operationReplicaId, entityId) : null;
    const operation = await this.materializePlacementOperationById(operationId, {
      type: normalizedMoveType,
      partitionId,
      entityType,
      entityId,
      sourceNodeId: resolvedSourceNodeId,
      targetNodeId: move.nodeId,
      replicaId: operationReplicaId,
      sourceReplicaId,
      targetClaimKey,
    });
    await this.announcePlacementCreatedOperation(operation, context);
    return operation;
  },
  bindReplicaPlacementOwnerFactory(factory) {
    if (typeof factory !== LOCAL_STR_FUNCTION) {
      return;
    }
    this.replicaPlacementOwnerFactory = factory;
    this.placementAdmissionEnabled = true;
  },

  registerLedgerPartitionService(partitionService) {
    if (!partitionService || partitionService.partitionId !== LEDGER_PARTITION_ID) {
      return;
    }
    if (!(this.ledgerPartitionServices instanceof Set)) {
      this.ledgerPartitionServices = new Set();
    }
    this.ledgerPartitionServices.add(partitionService);
    this.placementAdmissionEnabled = true;
  },

  unregisterLedgerPartitionService(partitionService) {
    if (this.ledgerPartitionServices instanceof Set) {
      this.ledgerPartitionServices.delete(partitionService);
    }
  },

  attachLedgerReplicaPlacementOwner(ledgerPartitionService) {
    if (!ledgerPartitionService ||
        ledgerPartitionService.partitionId !== LEDGER_PARTITION_ID) {
      return null;
    }
    const readiness = this.controlPlaneReadinessService;
    const nodeAuthority = readiness ? readiness.serveEligibilityOwner : null;
    if (!nodeAuthority || !this.systemTableCache) {
      return null;
    }
    this.registerLedgerPartitionService(ledgerPartitionService);
    if (this.replicaPlacementOwnerFactory) {
      return this.replicaPlacementOwnerFactory(ledgerPartitionService);
    }
    return attachReplicaPlacementOwner({
      nodeId: this.nodeId,
      ledgerPartitionService,
      nodeAuthority,
      systemTableCache: this.systemTableCache,
      workflowOwner: this.workflowOwner || null,
      storageAccountingService: this.storageAccountingService || null,
      now: () => ledgerPartitionService.timeSource.now(),
      logger: ledgerPartitionService.logger,
    });
  },

  /**
   * Release the bootstrap-topology dispatch hold of one deterministic
   * founding-cohort ADD and stamp its cohort topology, as ONE compare-and-set
   * on the durable row: it applies only while the row is still PENDING and
   * its steps history is exactly the held history this owner read. The hold
   * is the dispatch token: while it is present only the hold's releaser may
   * dispatch the row inline; once released, the coordinator's dispatch lanes
   * own it. A caller whose release is refused never stamps or executes the
   * row; it awaits the row's outcome.
   *
   * @param {string} operationId
   * @param {Object} stamp replicaIds, peerAddresses, bootstrapMembership and
   *   the optional bootstrapTableMetadata / bootstrapPartitionMetadata
   * @return {Promise<{released: boolean, operation: (Object|null)}>} the
   *   released row on success; the re-read durable row (a private copy) when
   *   another owner holds it
   */
  async releaseBootstrapTopologyDispatchHold(operationId, stamp) {
    return this.runReplicaOperationTransitionExclusive(
      () => this.releaseBootstrapTopologyDispatchHoldUnderLane(
        operationId,
        stamp,
      ),
      {operationId},
    );
  },

  async releaseBootstrapTopologyDispatchHoldUnderLane(operationId, stamp) {
    let durableOperation = null;
    let fromRepository = false;
    if (this.repository?.queryAuthoritativeOperationById) {
      durableOperation =
        await this.repository.queryAuthoritativeOperationById(operationId);
      fromRepository = Boolean(durableOperation);
    }
    if (!durableOperation) {
      durableOperation = this.readOperationFromLocalLedgerDb(operationId);
    }
    if (!isHeldPendingBootstrapOperation(durableOperation)) {
      return buildBootstrapTopologyHoldReleaseOutcome(false, durableOperation);
    }
    const released = buildBootstrapTopologyReleasedOperation(
      durableOperation,
      stamp,
      this.timeSource ? this.timeSource.now() : Date.now(),
    );
    if (!fromRepository || !this.repository?.persistOperationUpdate) {
      const updated =
        this.persistHeldBootstrapOperationInLocalLedgerDb(released);
      return buildBootstrapTopologyHoldReleaseOutcome(
        updated,
        updated ? released : this.readOperationFromLocalLedgerDb(operationId),
      );
    }
    const persistResult = await this.repository.persistOperationUpdate(
      released,
      {
        expectedWorkflowStep: WORKFLOW_STEP.PENDING,
        expectedStepsHistory: durableOperation.stepsHistory,
        returnDisposition: true,
      },
    );
    // Only a write that changed the held row is this caller's release. An
    // idempotent replay or a refused CAS means another writer moved the row
    // first; that writer, not this caller, owns its dispatch.
    if (
      persistResult?.disposition !== REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED
    ) {
      return buildBootstrapTopologyHoldReleaseOutcome(
        false,
        await this.repository.queryAuthoritativeOperationById(operationId),
      );
    }
    return buildBootstrapTopologyHoldReleaseOutcome(true, released);
  },


  async queryExistingOperationAfterInsertConflict(context) {
    const {
      operationIntentId,
      operationId,
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      normalizedMove,
    } = context;
    if (operationIntentId) {
      const existingByDeterministicId =
        await this.repository.queryAuthoritativeOperationById(operationId);
      if (existingByDeterministicId) return existingByDeterministicId;
    }
    return this.queryExistingInFlightOperation(
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      normalizedMove,
      STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
    );
  },

  async armCoordinatorCreatedOperationProgress(operation, armContext = {}) {
    return this.runCoordinatorCreatedOperationProgressStep(
      operation,
      OWNER_PROGRESS_STEP_METHOD.ARM,
      (workflowOwner) =>
        workflowOwner.armCoordinatorCreatedOperation(operation, armContext),
    );
  },

  async dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn(operation) {
    return this.runCoordinatorCreatedOperationProgressStep(
      operation,
      OWNER_PROGRESS_STEP_METHOD.DISPATCH_AFTER_CREATE_BUDGET_TURN,
      (workflowOwner) =>
        workflowOwner.dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn(
          operation.operationId,
        ),
    );
  },

  async runCoordinatorCreatedOperationProgressStep(
    operation,
    ownerMethodName,
    invokeStep,
  ) {
    if (
      !operation?.operationId ||
      typeof this.workflowOwner?.[ownerMethodName] !== LOCAL_STR_FUNCTION
    ) {
      return false;
    }
    try {
      return await invokeStep(this.workflowOwner);
    } catch (error) {
      this.logger.warn(
        LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId || null,
          workflowStep: operation.workflowStep,
          error: error?.message || String(error),
        },
      );
      return false;
    }
  },
};

function applyRebalanceCoordinatorOperationCreationSupportMethods(target) {
  Object.defineProperties(
    target.prototype,
    Object.getOwnPropertyDescriptors(operationCreationSupportMethods),
  );
}

export {applyRebalanceCoordinatorOperationCreationSupportMethods};
