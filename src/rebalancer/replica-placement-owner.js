import {promotedVoterReplicaIdsByPartition} from
  './replica-placement-owner-retained-repair-statement.js';
// Public entry: createReplicaPlacementOwner, attachReplicaPlacementOwner, REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID.
// Required collaborators: nodeId, ledgerPartitionService (replica_operations-p1), nodeAuthority, systemTableCache, now, logger; optional workflowOwner, storageAccountingService, timer functions.
// Durable authority / commit point: committed replica_operations rows via requestPlacementAdmission and requestPlacementHoldRelease on ledgerPartitionService.
// Permitted post-commit work: local pass scheduling, seen-row signature dedupe, and lastPassSnapshot diagnostic publication.
// Recovery / wake entry: setLeader(true) and PLACEMENT_TRIGGER notifications rebuild pass state from readPlacementCensus and committed node/table authorities.
// Representative production tests: test/rebalancer/replica-placement-owner-core.test.js, test/convergence/dt-placement-owner-formation-drain.test.js.
import {resolveDesiredReplicationFactor} from '../bootstrap/replication-target-authority.js';
import {COLUMN, TABLES, WORKFLOW_STEP} from '../constants/index.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {readLowerStateField} from '../utils/state-field-read.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-record-decision.js';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {PLACEMENT_RESULT_FIELD} from '../partition/partition-placement-admission-constants.js';
import {
  LEDGER_PARTITION_ID, isOccupyingCopy, readPlacementCensus,
} from '../partition/partition-placement-admission-decision.js';
import {
  requestPlacementAdmission, requestPlacementHoldRelease,
} from '../partition/partition-placement-admission.js';
import {isWriteOutcomeUnknown, resolveEntryId} from '../partition/partition-write-kernel.js';
import {
  REMOVE_SAFETY_PROJECTION_STATE, buildRemoveSafetyProjectionInput, resolveRemoveSafetySimpleFloor,
} from './operation-workflow-remove-safety-evaluator.js';
import {OperationType} from './replica-operation-progress.js';
import {PRESSURE_STATE} from './storage-capacity-constants.js';
import {
  buildPlacementAdmissionStatement, resolveSourceCapacityForClass,
} from './replica-placement-owner-admission-statement.js';
import {
  deleteUnresolvedPlacementAttempt, persistUnresolvedPlacementAttempt,
  reconcilePlacementAttempts,
} from './replica-placement-owner-attempts.js';
import {
  PLACEMENT_CLASS, PLACEMENT_CLEARING_TRIGGER, PLACEMENT_COPY_CAPACITY,
  PLACEMENT_DEFICIT_KIND, PLACEMENT_DISPATCH_HOLD, PLACEMENT_OUTCOME,
  PLACEMENT_TRIGGER, PLACEMENT_WAITING_REASON,
} from './replica-placement-owner-constants.js';
import {
  PLACEMENT_DEFICIT_STATE, buildPartitionReplicaRows, evaluatePartitionDeficit,
  readPlacementNodeInputs, repairSourceNodeIdsOf,
} from './replica-placement-owner-deficits.js';
import {formationWaitingReasonOf, orderPlacementCandidates} from './replica-placement-owner-order.js';

const PLACEMENT_RESYNC_INTERVAL_MS = 60_000;
const REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID =
  'REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID';
const ENTRY_KIND_RELEASE = 'release';
const ENTRY_KIND_ADMIT = 'admit';
const SKIPPED_PARTITION_STATUSES = Object.freeze(new Set(['splitting', 'merging']));
const COPY_MOVE_TYPES = Object.freeze(new Set([OperationType.ADD, OperationType.REPLACE]));
const COLLABORATOR = Object.freeze({
  OPTIONS: 'options',
  NODE_ID: 'nodeId',
  LEDGER: 'ledgerPartitionService',
  NODE_AUTHORITY: 'nodeAuthority',
  CACHE: 'systemTableCache',
  NOW: 'now',
  LOGGER: 'logger',
  WORKFLOW_OWNER: 'workflowOwner',
  STORAGE: 'storageAccountingService',
  ADMIT: 'admitPlacement',
  RELEASE: 'releasePlacementHold',
  RESYNC_TIMER: 'resyncTimer',
});
const REQUIRED_METHOD_MAP = Object.freeze({
  [COLLABORATOR.LEDGER]: Object.freeze(['on', 'off']),
  [COLLABORATOR.NODE_AUTHORITY]: Object.freeze([
    'answerCommittedNodes', 'scheduleRefresh', 'subscribe',
  ]),
  [COLLABORATOR.CACHE]: Object.freeze(['getAll', 'onCacheApplyChange', 'offCacheApplyChange']),
  [COLLABORATOR.LOGGER]: Object.freeze(['debug', 'info', 'warn', 'error']),
  [COLLABORATOR.WORKFLOW_OWNER]: Object.freeze([
    'getCriticalReplicaRowsForSafety',
    'isVoterReadyFloorCountableReplica',
    'isOperationReplicaRow',
    'getCriticalMinReplicaCount',
  ]),
  [COLLABORATOR.STORAGE]: Object.freeze([
    'getCapacitySemanticIdentity',
    'subscribeCapacitySemanticChanges',
  ]),
});
const isObject = (value) => value !== null && typeof value === 'object';
const isFunction = (value) => typeof value === 'function';

function invalidCollaborator(collaborator) {
  const error = new TypeError(
    `ReplicaPlacementOwner collaborator invalid: ${collaborator}`,
  );
  error.code = REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID;
  error.collaborator = collaborator;
  throw error;
}

function requireMethods(target, collaborator, methods = REQUIRED_METHOD_MAP[collaborator]) {
  if (!isObject(target)) invalidCollaborator(collaborator);
  for (const method of methods) {
    if (!isFunction(target[method])) invalidCollaborator(collaborator);
  }
}

function requireOptionalMethods(target, collaborator) {
  if (target !== undefined && target !== null) requireMethods(target, collaborator);
}

function requireOptionalFunction(fn, collaborator) {
  if (fn !== undefined && !isFunction(fn)) invalidCollaborator(collaborator);
}

function validateResyncTimerCollaborators(options, resyncIntervalMs) {
  const hasSet = options.setIntervalFn !== undefined && options.setIntervalFn !== null;
  const hasClear = options.clearIntervalFn !== undefined && options.clearIntervalFn !== null;
  if (!hasSet && !hasClear) return;
  if (!isFunction(options.setIntervalFn) || !isFunction(options.clearIntervalFn) ||
      !Number.isInteger(resyncIntervalMs) || resyncIntervalMs <= 0) {
    invalidCollaborator(COLLABORATOR.RESYNC_TIMER);
  }
}

function validateOptionalPlacementCollaborators(options, resyncIntervalMs) {
  requireOptionalMethods(options.workflowOwner, COLLABORATOR.WORKFLOW_OWNER);
  requireOptionalMethods(options.storageAccountingService, COLLABORATOR.STORAGE);
  requireOptionalFunction(options.admitPlacement, COLLABORATOR.ADMIT);
  requireOptionalFunction(options.releasePlacementHold, COLLABORATOR.RELEASE);
  validateResyncTimerCollaborators(options, resyncIntervalMs);
}

function validateLedgerPartitionCollaborator(ledger) {
  requireMethods(ledger, COLLABORATOR.LEDGER);
  if (ledger.partitionId !== LEDGER_PARTITION_ID || !isObject(ledger.db)) {
    invalidCollaborator(COLLABORATOR.LEDGER);
  }
}

function validateReplicaPlacementOwnerOptions(options, resyncIntervalMs) {
  if (!isObject(options)) invalidCollaborator(COLLABORATOR.OPTIONS);
  if (typeof options.nodeId !== 'string' || options.nodeId.trim().length === 0) {
    invalidCollaborator(COLLABORATOR.NODE_ID);
  }
  validateLedgerPartitionCollaborator(options.ledgerPartitionService);
  requireMethods(options.nodeAuthority, COLLABORATOR.NODE_AUTHORITY);
  requireMethods(options.systemTableCache, COLLABORATOR.CACHE);
  if (!isFunction(options.now)) invalidCollaborator(COLLABORATOR.NOW);
  requireMethods(options.logger, COLLABORATOR.LOGGER);
  validateOptionalPlacementCollaborators(options, resyncIntervalMs);
}

function rowSignatureOf(row) {
  return `${row.workflow_step}:${row.status}:${row.steps_history}`;
}

function summarizeCopyOccupancy(census) {
  const copies = census.filter(isOccupyingCopy);
  const bySource = new Map();
  const byTarget = new Map();
  let unrecordedSourceCopies = 0;
  for (const row of copies) {
    if (row.copySourceNodeId === null) {
      unrecordedSourceCopies += 1;
    } else {
      bySource.set(row.copySourceNodeId, (bySource.get(row.copySourceNodeId) ?? 0) + 1);
    }
    byTarget.set(row.targetNodeId, (byTarget.get(row.targetNodeId) ?? 0) + 1);
  }
  return {copies, bySource, byTarget, unrecordedSourceCopies};
}

function saturatedTargetsOf(byTarget) {
  const saturated = new Set();
  for (const [nodeId, count] of byTarget.entries()) {
    if (count >= PLACEMENT_COPY_CAPACITY.K_TGT) saturated.add(nodeId);
  }
  return saturated;
}

function isCopyWithinCapacity(candidate, repairWaitingSourceNodeIds, occupancy) {
  const kSrcForClass = resolveSourceCapacityForClass({
    placementClass: candidate.placementClass,
    repair: candidate.repair,
    copySourceNodeId: candidate.move.copySourceNodeId,
    repairWaitingSourceNodeIds,
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC,
  });
  const sourceOcc = occupancy.unrecordedSourceCopies +
    (occupancy.bySource.get(candidate.move.copySourceNodeId) ?? 0);
  const targetOcc = occupancy.byTarget.get(candidate.move.targetNodeId) ?? 0;
  return sourceOcc < kSrcForClass && targetOcc < PLACEMENT_COPY_CAPACITY.K_TGT;
}

function recordAdmittedCopyOccupancy(candidate, occupancy, saturatedTargets) {
  if (!COPY_MOVE_TYPES.has(candidate.move.type)) return 0;
  occupancy.bySource.set(
    candidate.move.copySourceNodeId,
    (occupancy.bySource.get(candidate.move.copySourceNodeId) ?? 0) + 1,
  );
  const nextTargetOcc = (occupancy.byTarget.get(candidate.move.targetNodeId) ?? 0) + 1;
  occupancy.byTarget.set(candidate.move.targetNodeId, nextTargetOcc);
  if (nextTargetOcc >= PLACEMENT_COPY_CAPACITY.K_TGT) {
    saturatedTargets.add(candidate.move.targetNodeId);
  }
  return 1;
}

function classifyNodeStorageExclusion(identity) {
  const capacity = identity?.projection?.capacity;
  if (!capacity || capacity.budgetBytes === null) {
    return PLACEMENT_WAITING_REASON.TARGET_STORAGE_UNKNOWN;
  }
  if (capacity.pressureState === PRESSURE_STATE.HARD ||
      capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
    return PLACEMENT_WAITING_REASON.TARGET_STORAGE_CONSTRAINED;
  }
  return null;
}

function shouldStopPlacementPass(isLeader, candidate, state) {
  if (!isLeader || state.ledgerIncomplete) return true;
  return candidate.placementClass === PLACEMENT_CLASS.LEDGER &&
    state.incompleteCount > 0;
}

function moveIntentKeyOf(partitionId, move) {
  return `${partitionId}:${move.type}:${move.targetNodeId}:` +
    `${move.sourceReplicaId ?? ''}:${move.replicaId ?? ''}:${move.copySourceNodeId ?? ''}`;
}


class ReplicaPlacementOwner {
  constructor(options = {}) {
    const resyncIntervalMs = options?.resyncIntervalMs ?? PLACEMENT_RESYNC_INTERVAL_MS;
    validateReplicaPlacementOwnerOptions(options, resyncIntervalMs);
    this.nodeId = options.nodeId;
    this.ledgerPartitionService = options.ledgerPartitionService;
    this.nodeAuthority = options.nodeAuthority;
    this.systemTableCache = options.systemTableCache;
    this.workflowOwner = options.workflowOwner;
    this.storageAccountingService = options.storageAccountingService;
    this.now = options.now;
    this.logger = options.logger;
    this.resyncIntervalMs = resyncIntervalMs;
    this.setIntervalFn = options.setIntervalFn;
    this.clearIntervalFn = options.clearIntervalFn;
    this.admitPlacement = options.admitPlacement ||
      ((payload) => requestPlacementAdmission(this.ledgerPartitionService, payload));
    this.releasePlacementHold = options.releasePlacementHold ||
      ((payload) => requestPlacementHoldRelease(this.ledgerPartitionService, payload));
    this.isLeader = false;
    this.pendingTriggers = new Set();
    this.runningPromise = null;
    this.unsubscribers = [];
    this.resyncHandle = null;
    this.uncertainEntryIds = new Map();
    this.ownEntryIds = new Set();
    this.seenRowSignatures = new Map();
    this.placementResyncAdmissions = 0;
    this.lastPassSnapshot = null;
  }

  nextEntryId(kind, targetId) {
    return `placement-owner:${this.nodeId}:${kind}:${targetId}:${resolveEntryId(null)}`;
  }

  resolveAttempt(kind, targetId, intentKey, buildBody) {
    const attemptKey = `${kind}:${targetId}`;
    const retained = this.uncertainEntryIds.get(attemptKey);
    if (retained && retained.intentKey === intentKey) return retained;
    const body = buildBody();
    const attempt = Object.freeze({
      attemptKey,
      intentKey,
      entryId: this.nextEntryId(kind, targetId),
      body,
      bodyText: JSON.stringify(body),
    });
    this.uncertainEntryIds.set(attemptKey, attempt);
    persistUnresolvedPlacementAttempt(this.ledgerPartitionService?.db, attempt);
    return attempt;
  }

  setLeader(isLeader) {
    const next = Boolean(isLeader);
    if (this.isLeader === next) return;
    this.isLeader = next;
    if (!next) {
      this.detachListeners();
      this.pendingTriggers.clear();
      return;
    }
    this.attachListeners();
    this.workflowOwner?.repository?.wakeRetainedPlacementRepairs?.((attempt) =>
      attempt.clearingTrigger === PLACEMENT_TRIGGER.LEADERSHIP_START);
    this.notify(PLACEMENT_TRIGGER.LEADERSHIP_START);
  }

  shutdown() {
    this.setLeader(false);
  }

  attachLedgerListeners() {
    const ledger = this.ledgerPartitionService;
    if (!ledger) return;
    const onCommitted = (event) => {
      const entryId = event?.command?.entryId;
      if (entryId && this.ownEntryIds.has(entryId)) return;
      this.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
    };
    const onWriteReleased = () => this.notify(PLACEMENT_TRIGGER.WRITE_PATH_RELEASED);
    ledger.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, onCommitted);
    ledger.on(PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED, onWriteReleased);
    this.unsubscribers.push(() => {
      ledger.off(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, onCommitted);
      ledger.off(PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED, onWriteReleased);
    });
  }

  attachListeners() {
    this.detachListeners();
    this.attachLedgerListeners();
    if (this.nodeAuthority) {
      this.unsubscribers.push(
        this.nodeAuthority.subscribe(() => this.notify(PLACEMENT_TRIGGER.NODES_OR_FORMATION)),
      );
    }
    const cache = this.systemTableCache;
    if (cache) {
      const onCache = (tableName, _op, row) => this.handleCacheChange(tableName, row);
      cache.onCacheApplyChange(onCache);
      this.unsubscribers.push(() => cache.offCacheApplyChange(onCache));
    }
    const storage = this.storageAccountingService;
    if (storage) {
      this.unsubscribers.push(
        storage.subscribeCapacitySemanticChanges(() =>
          this.notify(PLACEMENT_TRIGGER.TARGET_CAPACITY_CHANGED)),
      );
    }
    if (this.setIntervalFn && this.resyncIntervalMs > 0) {
      this.resyncHandle = this.setIntervalFn(
        () => this.notify(PLACEMENT_TRIGGER.RESYNC),
        this.resyncIntervalMs,
      );
    }
  }

  detachListeners() {
    while (this.unsubscribers.length > 0) {
      const unsub = this.unsubscribers.pop();
      unsub();
    }
    if (this.resyncHandle !== null && this.clearIntervalFn) {
      this.clearIntervalFn(this.resyncHandle);
    }
    this.resyncHandle = null;
  }

  handleCacheChange(tableName, row) {
    if (!this.isLeader) return;
    if (tableName === TABLES.SERVICES) {
      this.notify(PLACEMENT_TRIGGER.SERVICES_CHANGED);
    } else if (tableName === TABLES.PARTITIONS || tableName === TABLES.TABLES) {
      this.notify(PLACEMENT_TRIGGER.PARTITIONS_CHANGED);
    } else if (tableName === TABLES.REPLICA_OPERATIONS && row) {
      const opId = row[COLUMN.OPERATION_ID];
      if (typeof opId === 'string') {
        const sig = rowSignatureOf(row);
        if (this.seenRowSignatures.get(opId) === sig) return;
        this.seenRowSignatures.set(opId, sig);
      }
      this.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
    }
  }

  notify(trigger) {
    if (!this.isLeader) return;
    this.pendingTriggers.add(trigger);
    this.drainQueue();
  }

  drainQueue() {
    if (this.runningPromise !== null) return this.runningPromise;
    this.runningPromise = (async () => {
      try {
        while (this.isLeader && this.pendingTriggers.size > 0) {
          const triggers = new Set(this.pendingTriggers);
          this.pendingTriggers.clear();
          await this.runPass(triggers);
        }
      } finally {
        this.runningPromise = null;
        if (this.isLeader && this.pendingTriggers.size > 0) {
          this.drainQueue();
        }
      }
    })();
    return this.runningPromise;
  }

  awaitCurrentWorkIdle() {
    return this.runningPromise ?? Promise.resolve();
  }

  recordSeenOperationSignatures() {
    if (!this.systemTableCache) return;
    for (const row of this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS)) {
      const opId = row[COLUMN.OPERATION_ID];
      if (typeof opId === 'string') {
        this.seenRowSignatures.set(opId, rowSignatureOf(row));
      }
    }
  }

  async submitReleaseIfCopyIdle(census) {
    const held = census.find((row) =>
      row.incomplete &&
      row.entityType === UNIFIED_SERVICE_TYPE.PARTITION &&
      row.entityId === LEDGER_PARTITION_ID &&
      row.dispatchHold === PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE);
    if (!held) return census;
    const otherCopies = census.filter((row) =>
      row.operationId !== held.operationId && isOccupyingCopy(row));
    if (otherCopies.length > 0) return census;
    await this.submitHoldRelease(held.operationId);
    return readPlacementCensus(this.ledgerPartitionService.db);
  }

  async submitPlacementAttempt(attempt, submitFn) {
    const {attemptKey, entryId, body} = attempt;
    this.ownEntryIds.add(entryId);
    try {
      const answer = await submitFn({entryId, body});
      if (!isWriteOutcomeUnknown(answer) && answer?.committed === true) {
        this.uncertainEntryIds.delete(attemptKey);
        deleteUnresolvedPlacementAttempt(this.ledgerPartitionService?.db, attemptKey);
      }
      this.recordSeenOperationSignatures();
      return answer;
    } finally {
      this.ownEntryIds.delete(entryId);
    }
  }

  submitHoldRelease(operationId) {
    const attempt = this.resolveAttempt(
      ENTRY_KIND_RELEASE,
      operationId,
      operationId,
      () => Object.freeze({operationId}),
    );
    return this.submitPlacementAttempt(attempt, this.releasePlacementHold);
  }

  async submitCandidateAdmission(candidate, buildStatement) {
    const intentKey = moveIntentKeyOf(candidate.partitionId, candidate.move);
    const attemptKey = `${ENTRY_KIND_ADMIT}:${candidate.partitionId}`;
    const hadRetained = this.uncertainEntryIds.get(attemptKey)?.intentKey === intentKey;
    const attempt = this.resolveAttempt(
      ENTRY_KIND_ADMIT,
      candidate.partitionId,
      intentKey,
      buildStatement,
    );
    const answer = await this.submitPlacementAttempt(attempt, this.admitPlacement);
    if (hadRetained && answer?.committed === true &&
        answer?.[PLACEMENT_RESULT_FIELD]?.outcome === PLACEMENT_OUTCOME.REFUSED) {
      const fresh = this.resolveAttempt(
        ENTRY_KIND_ADMIT,
        candidate.partitionId,
        intentKey,
        buildStatement,
      );
      return this.submitPlacementAttempt(fresh, this.admitPlacement);
    }
    return answer;
  }

  submitAdmission(statement) {
    return this.submitCandidateAdmission(
      {partitionId: statement.partitionId, move: statement.moves[0]},
      () => statement,
    );
  }

  async reconcileUnresolvedAttemptsOnLeadershipStart(census) {
    const cdcDelivery = this.ledgerPartitionService.cdcDelivery;
    if (cdcDelivery) {
      await cdcDelivery.driveCdcObligations(PLACEMENT_TRIGGER.LEADERSHIP_START);
    }
    const refreshed = readPlacementCensus(this.ledgerPartitionService.db);
    reconcilePlacementAttempts(
      this.ledgerPartitionService.db,
      this.uncertainEntryIds,
      refreshed,
    );
    return refreshed.length > 0 || census.length > 0 ? refreshed : census;
  }

  async canAdmitRemove(candidate) {
    if (!this.workflowOwner) return false;
    const operation = {
      type: OperationType.REMOVE,
      partitionId: candidate.partitionId,
      entityType: UNIFIED_SERVICE_TYPE.PARTITION,
      entityId: candidate.partitionId,
      replicaId: candidate.move.replicaId,
      targetNodeId: candidate.move.targetNodeId,
    };
    const rows = await this.workflowOwner.getCriticalReplicaRowsForSafety(
      candidate.partitionId,
    );
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const projection = await buildRemoveSafetyProjectionInput(
      this.workflowOwner,
      operation,
      rows,
    );
    if (projection.state !== REMOVE_SAFETY_PROJECTION_STATE.READY) return false;
    const floor = await resolveRemoveSafetySimpleFloor(
      this.workflowOwner,
      operation,
      projection.projectedVoterReadyRows,
    );
    return floor.floorSatisfied === true;
  }

  readStorageExcludedTargets(nodeInput, nowMs) {
    const excluded = new Map();
    if (!this.storageAccountingService) return excluded;
    for (const nodeId of nodeInput.eligibility.eligibleNodeIds) {
      const reason = classifyNodeStorageExclusion(
        this.storageAccountingService.getCapacitySemanticIdentity(nodeId, nowMs),
      );
      if (reason !== null) {
        excluded.set(nodeId, reason);
      }
    }
    return excluded;
  }

  readPartitionPlacementRows() {
    const servicesByPartition = new Map();
    for (const row of this.systemTableCache.getAll(TABLES.SERVICES)) {
      const partitionId = row[COLUMN.PARTITION_ID];
      if (!partitionId) continue;
      const list = servicesByPartition.get(partitionId) || [];
      list.push(row);
      servicesByPartition.set(partitionId, list);
    }
    return {
      partitionRows: this.systemTableCache.getAll(TABLES.PARTITIONS),
      servicesByPartition,
    };
  }

  evaluateAllPartitions(
    nodeInput, busyPartitions, saturatedTargetNodeIds, storageExcludedTargets,
    promotedByPartition,
  ) {
    const {partitionRows, servicesByPartition} = this.readPartitionPlacementRows();
    const evaluations = [];
    const inputsByPartition = new Map();
    for (const partitionRow of partitionRows) {
      const partitionId = partitionRow[COLUMN.PARTITION_ID];
      const status = readLowerStateField(partitionRow[COLUMN.STATUS]);
      if (!partitionId || SKIPPED_PARTITION_STATUSES.has(status)) continue;
      const isBusy = busyPartitions.has(partitionId);
      const {replicationFactor} = resolveDesiredReplicationFactor(partitionRow);
      const replicaRows = buildPartitionReplicaRows(
        servicesByPartition.get(partitionId) || [],
        partitionRow[COLUMN.LEADER_NODE_ID],
        isBusy,
        promotedByPartition.get(partitionId),
      );
      inputsByPartition.set(partitionId, {replicationFactor, replicaRows});
      const evaluation = evaluatePartitionDeficit({
        partitionId, replicationFactor, replicaRows,
        eligibility: nodeInput.eligibility, saturatedTargetNodeIds, storageExcludedTargets,
      });
      evaluations.push({partitionId, isBusy, evaluation});
    }
    return {evaluations, inputsByPartition};
  }

  resolveStatementSourceNodeId(candidate, inputsByPartition) {
    if (candidate.move.type === OperationType.REMOVE) return this.nodeId;
    if (candidate.move.type === OperationType.REPLACE) {
      const {replicaRows} = inputsByPartition.get(candidate.partitionId);
      return replicaRows.find((r) => r.replicaId === candidate.move.sourceReplicaId).nodeId;
    }
    if (!COPY_MOVE_TYPES.has(candidate.move.type)) return candidate.move.targetNodeId;
    return candidate.move.copySourceNodeId;
  }

  reevaluateSaturatedTarget(
    candidate, inputsByPartition, nodeInput, saturatedTargets, storageExcludedTargets,
  ) {
    if (!COPY_MOVE_TYPES.has(candidate.move.type) ||
        !saturatedTargets.has(candidate.move.targetNodeId)) {
      return candidate;
    }
    const input = inputsByPartition.get(candidate.partitionId);
    const reevaluated = evaluatePartitionDeficit({
      partitionId: candidate.partitionId,
      replicationFactor: input.replicationFactor,
      replicaRows: input.replicaRows,
      eligibility: nodeInput.eligibility,
      saturatedTargetNodeIds: saturatedTargets,
      storageExcludedTargets,
    });
    return reevaluated.state === PLACEMENT_DEFICIT_STATE.CANDIDATE ?
      reevaluated.candidate : null;
  }

  async isCandidateAdmissibleNow(candidate, repairWaitingSourceNodeIds, occupancy) {
    if (candidate.move.type === OperationType.REMOVE) {
      if (candidate.deficitKind === PLACEMENT_DEFICIT_KIND.DEAD_LEARNER) return true;
      return this.canAdmitRemove(candidate);
    }
    if (!COPY_MOVE_TYPES.has(candidate.move.type)) return true;
    return isCopyWithinCapacity(candidate, repairWaitingSourceNodeIds, occupancy);
  }

  preparePassOrderedCandidates(
    nodeInput, busyPartitions, saturatedTargets, storageExcludedTargets,
    promotedByPartition,
  ) {
    const {evaluations, inputsByPartition} = this.evaluateAllPartitions(
      nodeInput, busyPartitions, saturatedTargets, storageExcludedTargets,
      promotedByPartition,
    );
    const repairWaitingSourceNodeIds = repairSourceNodeIdsOf(
      evaluations.filter((e) => !e.isBusy).map((e) => e.evaluation),
    );
    const admissible = [];
    for (const {evaluation} of evaluations) {
      if (evaluation.state !== PLACEMENT_DEFICIT_STATE.CANDIDATE) continue;
      const waitReason = formationWaitingReasonOf(
        evaluation.candidate.placementClass,
        nodeInput.formation,
      );
      if (waitReason === null) {
        admissible.push(evaluation.candidate);
      }
    }
    return {
      ordered: orderPlacementCandidates(admissible),
      inputsByPartition,
      repairWaitingSourceNodeIds,
    };
  }

  async proposeOrderedCandidate(rawCandidate, context) {
    const {inputsByPartition, repairWaitingSourceNodeIds, nodeInput,
      busyPartitions, occupancy, saturatedTargets, storageExcludedTargets} = context;
    if (busyPartitions.has(rawCandidate.partitionId)) return null;
    const candidate = this.reevaluateSaturatedTarget(
      rawCandidate,
      inputsByPartition,
      nodeInput,
      saturatedTargets,
      storageExcludedTargets,
    );
    if (candidate === null) return null;
    if (!(await this.isCandidateAdmissibleNow(
      candidate, repairWaitingSourceNodeIds, occupancy))) {
      return null;
    }
    const answer = await this.submitCandidateAdmission(candidate, () =>
      buildPlacementAdmissionStatement(candidate, {
        sourceNodeId: this.resolveStatementSourceNodeId(candidate, inputsByPartition),
        repairWaitingSourceNodeIds,
        formationLatchEpoch: nodeInput.formation.latchEpoch,
        membershipPublicationEpoch: null,
        positions: {nodesEpoch: nodeInput.epoch?.publicationEpoch ?? null},
      }));
    const result = answer?.[PLACEMENT_RESULT_FIELD];
    if (result?.outcome !== PLACEMENT_OUTCOME.ADMITTED) return null;
    const [operationId] = result.operationIds;
    return {candidate, operationId};
  }

  async admitOrderedCandidates(context) {
    const {ordered, busyPartitions, occupancy, saturatedTargets, resyncOnly} = context;
    const state = {
      incompleteCount: context.incompleteCount,
      copyCount: context.copyCount,
      ledgerIncomplete: context.ledgerIncomplete,
    };
    const operationIds = [];
    for (const rawCandidate of ordered) {
      if (shouldStopPlacementPass(this.isLeader, rawCandidate, state)) break;
      const proposal = await this.proposeOrderedCandidate(rawCandidate, context);
      if (proposal === null) continue;
      const {candidate, operationId} = proposal;
      if (resyncOnly) this.placementResyncAdmissions += 1;
      operationIds.push(operationId);
      busyPartitions.add(candidate.partitionId);
      state.incompleteCount += 1;
      state.copyCount += recordAdmittedCopyOccupancy(candidate, occupancy, saturatedTargets);
      if (candidate.placementClass === PLACEMENT_CLASS.LEDGER) {
        state.ledgerIncomplete = true;
        if (state.copyCount <= 1) await this.submitHoldRelease(operationId);
      }
    }
    return operationIds;
  }

  async runPass(triggers) {
    if (!this.isLeader || !this.ledgerPartitionService?.db) return;
    const resyncOnly = triggers.size === 1 && triggers.has(PLACEMENT_TRIGGER.RESYNC);
    this.recordSeenOperationSignatures();
    let initialCensus = readPlacementCensus(this.ledgerPartitionService.db);
    if (triggers.has(PLACEMENT_TRIGGER.LEADERSHIP_START)) {
      initialCensus = await this.reconcileUnresolvedAttemptsOnLeadershipStart(initialCensus);
    }
    const census = await this.submitReleaseIfCopyIdle(initialCensus);
    const nowMs = this.now();
    const nodeInput = readPlacementNodeInputs(this.nodeAuthority, nowMs);
    if (nodeInput.state !== SERVE_ELIGIBILITY_STATE.READY) {
      this.nodeAuthority.scheduleRefresh();
      this.lastPassSnapshot = Object.freeze({
        state: nodeInput.state,
        reason: nodeInput.reason,
        clearingTrigger: PLACEMENT_CLEARING_TRIGGER[nodeInput.reason],
        admitted: Object.freeze([]),
      });
      return;
    }
    const busyPartitions = new Set(
      census.filter((r) => r.incomplete && r.entityType === UNIFIED_SERVICE_TYPE.PARTITION)
        .map((r) => r.entityId),
    );
    const occupancy = summarizeCopyOccupancy(census);
    const saturatedTargets = saturatedTargetsOf(occupancy.byTarget);
    const storageExcludedTargets = this.readStorageExcludedTargets(nodeInput, nowMs);
    const promotedByPartition = promotedVoterReplicaIdsByPartition(census);
    const {ordered, inputsByPartition, repairWaitingSourceNodeIds} =
      this.preparePassOrderedCandidates(
        nodeInput, busyPartitions, saturatedTargets, storageExcludedTargets,
        promotedByPartition);
    const admitted = await this.admitOrderedCandidates({
      ordered, inputsByPartition, repairWaitingSourceNodeIds, nodeInput,
      busyPartitions, occupancy, saturatedTargets, storageExcludedTargets,
      resyncOnly,
      incompleteCount: census.filter((r) => r.incomplete).length,
      copyCount: occupancy.copies.length,
      ledgerIncomplete: census.some((r) =>
        r.incomplete && r.entityType === UNIFIED_SERVICE_TYPE.PARTITION &&
        r.entityId === LEDGER_PARTITION_ID),
    });
    this.lastPassSnapshot = Object.freeze({
      state: SERVE_ELIGIBILITY_STATE.READY, admitted: Object.freeze(admitted),
    });
  }
}

function createReplicaPlacementOwner(options) {
  return new ReplicaPlacementOwner(options);
}

function attachReplicaPlacementOwner(options = {}) {
  const owner = createReplicaPlacementOwner(options);
  const {ledgerPartitionService} = options;
  if (!isFunction(ledgerPartitionService?.setRebalancerLeadershipSink)) {
    invalidCollaborator(COLLABORATOR.LEDGER);
  }
  ledgerPartitionService.setRebalancerLeadershipSink(owner);
  return Object.freeze({
    owner, ledgerPartitionService,
    detach() {
      if (ledgerPartitionService.rebalancerLeadershipSink === owner) {
        ledgerPartitionService.setRebalancerLeadershipSink(null);
      }
      owner.setLeader(false);
    },
  });
}

export {
  REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID,
  attachReplicaPlacementOwner, createReplicaPlacementOwner,
};
