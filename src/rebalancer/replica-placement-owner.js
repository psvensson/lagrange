// The one replica placement owner (quest replica-placement-admission-owner,
// design sections 2.3-2.9): runs on the Raft leader of replica_operations-p1,
// recomputes every partition's placement deficit from committed inputs on
// committed changes to the ledger, the committed node/formation answer,
// SERVICES, PARTITIONS or target capacity, and admits in one priority order
// (ledger, priority control-plane, then after FORMED nodes-p1, system, user)
// through the conditional ledger INSERT (requestPlacementAdmission) and hold
// release (requestPlacementHoldRelease).
import {resolveDesiredReplicationFactor} from
  '../bootstrap/replication-target-authority.js';
import {COLUMN, SERVICE_STATUS, TABLES} from '../constants/index.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {readLowerStateField} from '../utils/state-field-read.js';
import {SERVE_ELIGIBILITY_STATE} from
  '../control-plane/serve-eligibility-record-decision.js';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {PLACEMENT_RESULT_FIELD} from
  '../partition/partition-placement-admission-constants.js';
import {
  LEDGER_PARTITION_ID,
  isOccupyingCopy,
  readPlacementCensus,
} from '../partition/partition-placement-admission-decision.js';
import {
  requestPlacementAdmission,
  requestPlacementHoldRelease,
} from '../partition/partition-placement-admission.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  REMOVE_SAFETY_PROJECTION_STATE,
  buildRemoveSafetyProjectionInput,
  resolveRemoveSafetySimpleFloor,
} from './operation-workflow-remove-safety-evaluator.js';
import {OperationType} from './replica-operation-progress.js';
import {ReplicaStatus} from './replica-status.js';
import {
  buildPlacementAdmissionStatement,
  resolveSourceCapacityForClass,
} from './replica-placement-owner-admission-statement.js';
import {
  PLACEMENT_CLASS,
  PLACEMENT_CLEARING_TRIGGER,
  PLACEMENT_COPY_CAPACITY,
  PLACEMENT_DISPATCH_HOLD,
  PLACEMENT_OUTCOME,
  PLACEMENT_TRIGGER,
} from './replica-placement-owner-constants.js';
import {
  PLACEMENT_DEFICIT_STATE,
  evaluatePartitionDeficit,
  readPlacementNodeInputs,
  repairSourceNodeIdsOf,
} from './replica-placement-owner-deficits.js';
import {
  formationWaitingReasonOf,
  orderPlacementCandidates,
} from './replica-placement-owner-order.js';

const PLACEMENT_RESYNC_INTERVAL_MS = 60_000;
const ENTRY_KIND_RELEASE = 'release';
const ENTRY_KIND_ADMIT = 'admit';
const SKIPPED_PARTITION_STATUSES = Object.freeze(new Set(['splitting', 'merging']));
const COPY_MOVE_TYPES = Object.freeze(new Set([OperationType.ADD, OperationType.REPLACE]));
const IN_FLIGHT_LEARNER_STATUSES = Object.freeze(new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
]));

function rowSignatureOf(row) {
  return `${row.workflow_step}:${row.status}:${row.steps_history}`;
}

function isVoterRole(role) {
  return role === RAFT_ROLE.LEADER || role === RAFT_ROLE.FOLLOWER;
}

function shouldSkipServiceRow(row, isBusy) {
  const status = row[COLUMN.STATUS];
  if (status === ReplicaStatus.REMOVING || status === ReplicaStatus.REMOVED) {
    return true;
  }
  const role = row[COLUMN.RAFT_ROLE];
  return isBusy && (role === RAFT_ROLE.LEARNER || IN_FLIGHT_LEARNER_STATUSES.has(status));
}

function buildPartitionReplicaRows(serviceRows, leaderNodeId, isBusy) {
  const filtered = [];
  for (const row of serviceRows) {
    if (shouldSkipServiceRow(row, isBusy)) continue;
    const replicaId = row[COLUMN.REPLICA_ID];
    const nodeId = row[COLUMN.NODE_ID];
    if (typeof replicaId !== 'string' || typeof nodeId !== 'string') continue;
    const role = row[COLUMN.RAFT_ROLE];
    const activeVoter = row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE && isVoterRole(role);
    filtered.push({
      replicaId,
      nodeId,
      failed: !activeVoter,
      isLeader: activeVoter && role === RAFT_ROLE.LEADER,
    });
  }
  if (!filtered.some((r) => r.isLeader) && typeof leaderNodeId === 'string') {
    const leaderRow = filtered.find((r) => !r.failed && r.nodeId === leaderNodeId);
    if (leaderRow) leaderRow.isLeader = true;
  }
  return filtered;
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

class ReplicaPlacementOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.ledgerPartitionService = options.ledgerPartitionService;
    this.nodeAuthority = options.nodeAuthority;
    this.systemTableCache = options.systemTableCache;
    this.workflowOwner = options.workflowOwner;
    this.storageAccountingService = options.storageAccountingService;
    this.now = options.now;
    this.logger = options.logger;
    this.resyncIntervalMs = options.resyncIntervalMs ?? PLACEMENT_RESYNC_INTERVAL_MS;
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
    this.entrySeq = 0;
    this.ownEntryIds = new Set();
    this.seenRowSignatures = new Map();
    this.placementResyncAdmissions = 0;
    this.lastPassSnapshot = null;
  }

  nextEntryId(kind, partitionId) {
    this.entrySeq += 1;
    return `placement-owner:${this.nodeId}:${kind}:${partitionId}:${this.entrySeq}`;
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

  recordCachedOperationSignatures() {
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

  async submitHoldRelease(operationId) {
    const entryId = this.nextEntryId('release', operationId);
    this.ownEntryIds.add(entryId);
    try {
      const answer = await this.releasePlacementHold({
        entryId,
        body: {operationId},
      });
      this.recordCachedOperationSignatures();
      return answer;
    } finally {
      this.ownEntryIds.delete(entryId);
    }
  }

  async submitAdmission(statement) {
    const entryId = this.nextEntryId('admit', statement.partitionId);
    this.ownEntryIds.add(entryId);
    try {
      const answer = await this.admitPlacement({
        entryId,
        body: statement,
      });
      this.recordCachedOperationSignatures();
      return answer;
    } finally {
      this.ownEntryIds.delete(entryId);
    }
  }

  async canAdmitRemove(candidate) {
    if (!this.workflowOwner) return true;
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

  evaluateAllPartitions(nodeInput, busyPartitions, saturatedTargetNodeIds) {
    const servicesByPartition = new Map();
    for (const row of this.systemTableCache.getAll(TABLES.SERVICES)) {
      const partitionId = row[COLUMN.PARTITION_ID];
      if (!partitionId) continue;
      const list = servicesByPartition.get(partitionId) || [];
      list.push(row);
      servicesByPartition.set(partitionId, list);
    }
    const evaluations = [];
    const inputsByPartition = new Map();
    for (const partitionRow of this.systemTableCache.getAll(TABLES.PARTITIONS)) {
      const partitionId = partitionRow[COLUMN.PARTITION_ID];
      const status = readLowerStateField(partitionRow[COLUMN.STATUS]);
      if (!partitionId || TRANSITIONAL_PARTITION_STATUSES.has(status)) continue;
      const isBusy = busyPartitions.has(partitionId);
      const replicationFactor =
        resolveDesiredReplicationFactor(partitionRow).replicationFactor;
      const replicaRows = buildPartitionReplicaRows(
        servicesByPartition.get(partitionId) || [],
        partitionRow[COLUMN.LEADER_NODE_ID],
        isBusy,
      );
      inputsByPartition.set(partitionId, {replicationFactor, replicaRows});
      const evaluation = evaluatePartitionDeficit({
        partitionId,
        replicationFactor,
        replicaRows,
        eligibility: nodeInput.eligibility,
        saturatedTargetNodeIds,
      });
      evaluations.push({partitionId, isBusy, evaluation});
    }
    return {evaluations, inputsByPartition};
  }

  resolveStatementSourceNodeId(candidate, inputsByPartition) {
    if (candidate.move.type === OperationType.REPLACE) {
      const rows = inputsByPartition.get(candidate.partitionId)?.replicaRows || [];
      const source = rows.find((r) => r.replicaId === candidate.move.sourceReplicaId);
      return source?.nodeId || candidate.move.copySourceNodeId || this.nodeId;
    }
    return candidate.move.copySourceNodeId || this.nodeId;
  }

  reevaluateSaturatedTarget(candidate, inputsByPartition, nodeInput, saturatedTargets) {
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
    });
    return reevaluated.state === PLACEMENT_DEFICIT_STATE.CANDIDATE ?
      reevaluated.candidate : null;
  }

  async isCandidateAdmissibleNow(candidate, repairWaitingSourceNodeIds, occupancy) {
    if (candidate.move.type === OperationType.REMOVE) {
      return this.canAdmitRemove(candidate);
    }
    return isCopyWithinCapacity(candidate, repairWaitingSourceNodeIds, occupancy);
  }

  preparePassOrderedCandidates(nodeInput, busyPartitions, saturatedTargets) {
    const {evaluations, inputsByPartition} = this.evaluateAllPartitions(
      nodeInput,
      busyPartitions,
      saturatedTargets,
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

  async admitOrderedCandidates(context) {
    const {ordered, inputsByPartition, repairWaitingSourceNodeIds, nodeInput,
      busyPartitions, occupancy, saturatedTargets, resyncOnly} = context;
    let {incompleteCount, copyCount, ledgerIncomplete} = context;
    const admitted = [];
    for (let candidate of ordered) {
      if (!this.isLeader || ledgerIncomplete) break;
      if (candidate.placementClass === PLACEMENT_CLASS.LEDGER && incompleteCount > 0) break;
      if (busyPartitions.has(candidate.partitionId)) continue;
      candidate = this.reevaluateSaturatedTarget(
        candidate, inputsByPartition, nodeInput, saturatedTargets);
      if (candidate === null) continue;
      if (!(await this.isCandidateAdmissibleNow(
        candidate, repairWaitingSourceNodeIds, occupancy))) {
        continue;
      }
      const statement = buildPlacementAdmissionStatement(candidate, {
        sourceNodeId: this.resolveStatementSourceNodeId(candidate, inputsByPartition),
        repairWaitingSourceNodeIds,
        formationLatchEpoch: nodeInput.formation.latchEpoch,
        membershipPublicationEpoch: null,
        positions: {nodesEpoch: nodeInput.epoch?.publicationEpoch ?? null},
      });
      const answer = await this.submitAdmission(statement);
      const result = answer?.[PLACEMENT_RESULT_FIELD];
      if (result?.outcome !== PLACEMENT_OUTCOME.ADMITTED) continue;
      if (resyncOnly) this.placementResyncAdmissions += 1;
      const [operationId] = result.operationIds;
      admitted.push(operationId);
      busyPartitions.add(candidate.partitionId);
      incompleteCount += 1;
      copyCount += recordAdmittedCopyOccupancy(candidate, occupancy, saturatedTargets);
      if (candidate.placementClass === PLACEMENT_CLASS.LEDGER) {
        ledgerIncomplete = true;
        if (copyCount <= 1) await this.submitHoldRelease(operationId);
      }
    }
    return admitted;
  }

  async runPass(triggers) {
    if (!this.isLeader || !this.ledgerPartitionService?.db) return;
    const resyncOnly = triggers.size === 1 && triggers.has(PLACEMENT_TRIGGER.RESYNC);
    this.recordCachedOperationSignatures();
    const census = await this.submitReleaseIfCopyIdle(
      readPlacementCensus(this.ledgerPartitionService.db),
    );
    const nodeInput = readPlacementNodeInputs(this.nodeAuthority, this.now());
    if (nodeInput.state !== SERVE_ELIGIBILITY_STATE.READY) {
      if (this.nodeAuthority && typeof this.nodeAuthority.scheduleRefresh === 'function') {
        this.nodeAuthority.scheduleRefresh();
      }
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
    const {ordered, inputsByPartition, repairWaitingSourceNodeIds} =
      this.preparePassOrderedCandidates(nodeInput, busyPartitions, saturatedTargets);
    const admitted = await this.admitOrderedCandidates({
      ordered,
      inputsByPartition,
      repairWaitingSourceNodeIds,
      nodeInput,
      busyPartitions,
      occupancy,
      saturatedTargets,
      resyncOnly,
      incompleteCount: census.filter((r) => r.incomplete).length,
      copyCount: occupancy.copies.length,
      ledgerIncomplete: census.some((r) =>
        r.incomplete &&
        r.entityType === UNIFIED_SERVICE_TYPE.PARTITION &&
        r.entityId === LEDGER_PARTITION_ID),
    });
    this.lastPassSnapshot = Object.freeze({
      state: SERVE_ELIGIBILITY_STATE.READY,
      admitted: Object.freeze(admitted),
    });
  }
}

export {
  PLACEMENT_RESYNC_INTERVAL_MS,
  ReplicaPlacementOwner,
};
