import {promotedVoterReplicaIdsByPartition} from
  './replica-placement-owner-retained-repair-statement.js';
// Public entry: createReplicaPlacementOwner, attachReplicaPlacementOwner, REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID.
// Required collaborators: nodeId, ledgerPartitionService (replica_operations-p1, its leadershipTenure and consensus port), nodeAuthority, systemTableCache, now, logger; optional workflowOwner, storageAccountingService, timer functions.
// Durable authority / commit point: committed replica_operations rows via requestPlacementAdmission and requestPlacementHoldRelease on ledgerPartitionService, proposed only under the ledger's live leadership tenure.
// Permitted post-commit work: local pass scheduling, seen-row signature dedupe, and lastPassSnapshot diagnostic publication.
// Recovery / wake entry: setLeader(true) and a renewed tenure (TERM_CHANGE) start a custody whose LEADERSHIP_START waits for its term start (APPLIED_PROGRESS); PLACEMENT_TRIGGER notifications rebuild pass state from readPlacementCensus and committed node/table authorities.
// Representative production tests: test/rebalancer/replica-placement-owner-core.test.js, test/rebalancer/placement-owner-authority-tenure.test.js, test/convergence/dt-placement-owner-formation-drain.test.js.
import {resolveDesiredReplicationFactor} from '../bootstrap/replication-target-authority.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {readLowerStateField} from '../utils/state-field-read.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-record-decision.js';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {PLACEMENT_RESULT_FIELD} from '../partition/partition-placement-admission-constants.js';
import {
  LEDGER_PARTITION_ID, isOccupyingCopy, readPlacementCensus,
} from '../partition/partition-placement-admission-decision.js';
import {
  COPY_MOVE_TYPES, classifyNodeStorageExclusion, isCopyWithinCapacity,
  recordAdmittedCopyOccupancy, saturatedTargetsOf, summarizeCopyOccupancy,
} from './replica-placement-owner-capacity.js';
import {requestPlacementAdmission, requestPlacementHoldRelease} from '../partition/partition-placement-admission.js';
import {isWriteOutcomeUnknown, resolveEntryId} from '../partition/partition-write-kernel.js';
import {RAFT_EVENT} from '../raft/constants.js';
import {OperationType} from './replica-operation-progress.js';
import {buildPlacementAdmissionStatement} from './replica-placement-owner-admission-statement.js';
import {
  createBlockedPlacementAttempts, deleteUnresolvedPlacementAttempt,
  observePlacementAttemptAnswer, persistUnresolvedPlacementAttempt, reconcilePlacementAttempts,
  reconcileReleaseAttempts, redrivenReleaseAttempt,
} from './replica-placement-owner-attempts.js';
import {
  COLLABORATOR, REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID, invalidCollaborator, isFunction,
  validateReplicaPlacementOwnerOptions,
} from './replica-placement-owner-collaborators.js';
import {
  PLACEMENT_CLASS, PLACEMENT_CLEARING_TRIGGER, PLACEMENT_DEFICIT_KIND,
  PLACEMENT_DISPATCH_HOLD, PLACEMENT_OUTCOME, PLACEMENT_TRIGGER,
} from './replica-placement-owner-constants.js';
import {
  PLACEMENT_DEFICIT_STATE, buildPartitionReplicaRows, evaluatePartitionDeficit,
  readPlacementNodeInputs, repairSourceNodeIdsOf,
} from './replica-placement-owner-deficits.js';
import {formationWaitingReasonOf, orderPlacementCandidates} from './replica-placement-owner-order.js';
import {canAdmitRemoveUnderPass} from './replica-placement-owner-remove.js';
import {
  PLACEMENT_PASS_CHECKPOINT as CHECKPOINT, beginPlacementPass, completePass,
  createPlacementObservation, directSubmissionRecord, markPassStale, markPassWaiting,
  placementPassSnapshot, recordCapacityCheck, recordFenced,
  recordAdmittedOperation, recordNodeAuthorityWait, recordPassEvaluations,
  recordPassFailure, recordProposal, recordSubmissionAnswer, resyncAdmissionsOf,
} from './replica-placement-owner-pass-observation.js';
import {
  CANDIDATE_FAILED, classifyCandidateFailure, createProposalProgress, recordProposalAnswer,
  recordProposalHandover,
} from './replica-placement-owner-proposal-knowledge.js';
import {
  PLACEMENT_TERM_START, createTenureCustody, isTermStartApplied, requestLeadershipStartCdcDrive,
  tenureFenceRefusal,
} from './replica-placement-owner-tenure.js';

const PLACEMENT_RESYNC_INTERVAL_MS = 60_000;
const ENTRY_KIND_RELEASE = 'release';
const ENTRY_KIND_ADMIT = 'admit';
const CACHE_OP_DELETE = 'DELETE';
const SKIPPED_PARTITION_STATUSES = Object.freeze(new Set(['splitting', 'merging']));
const LOG_PASS_FAILED = 'Replica placement pass failed; its triggers wait for the next wake';
const LOG_CANDIDATE_FAILED = 'Replica placement candidate failed; the pass goes on';

function rowSignatureOf(row) {
  return `${row.workflow_step}:${row.status}:${row.steps_history}`;
}

function shouldStopPlacementPass(candidate, state) {
  if (state.ledgerIncomplete) return true;
  return candidate.placementClass === PLACEMENT_CLASS.LEDGER &&
    state.incompleteCount > 0;
}

function moveIntentKeyOf(partitionId, move) {
  return `${partitionId}:${move.type}:${move.targetNodeId}:` +
    `${move.sourceReplicaId ?? ''}:${move.replicaId ?? ''}:${move.copySourceNodeId ?? ''}`;
}

function isCommittedRefusal(answer) {
  return answer?.committed === true &&
    answer?.[PLACEMENT_RESULT_FIELD]?.outcome === PLACEMENT_OUTCOME.REFUSED;
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
    const admit = options.admitPlacement ||
      ((payload) => requestPlacementAdmission(this.ledgerPartitionService, payload));
    const release = options.releasePlacementHold ||
      ((payload) => requestPlacementHoldRelease(this.ledgerPartitionService, payload));
    // The two submitters, fenced at the boundary: {entryId, body, pass}.
    this.admitPlacement = (request) => this.proposeWithinTenure(request, admit);
    this.releasePlacementHold = (request) => this.proposeWithinTenure(request, release);
    this.custody = null;
    this.activeCustodies = new Set();
    this.leadershipStartDrive = null;
    this.observation = createPlacementObservation();
    this.pendingTriggers = new Set();
    this.unsubscribers = [];
    this.resyncHandle = null;
    this.uncertainEntryIds = new Map();
    this.blockedAttempts = createBlockedPlacementAttempts(this.logger);
    this.ownEntryIds = new Set();
    this.seenRowSignatures = new Map();
    this.placementResyncAdmissions = 0;
    this.lastPassSnapshot = null;
  }

  // Leading: a custody whose tenure is the ledger's live leadership tenure.
  get isLeader() {
    return this.isCustodyCurrent(this.custody);
  }

  // The current custody's drain: its running pass and those queued behind it.
  get runningPromise() {
    return this.custody?.running ?? null;
  }

  isCustodyCurrent(custody) {
    return custody !== null && custody === this.custody &&
      custody.tenure === this.ledgerPartitionService.leadershipTenure;
  }

  isPassCurrent(pass) {
    return this.isCustodyCurrent(pass.custody);
  }

  // A tenure checkpoint: whether the pass's tenure is still the live one; a
  // pass that fails one is stale from there on (counted) and stops.
  checkpoint(pass, at) {
    if (this.isPassCurrent(pass)) return true;
    markPassStale(pass, at);
    return false;
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
      attemptKey, intentKey, entryId: this.nextEntryId(kind, targetId),
      body, bodyText: JSON.stringify(body),
    });
    this.uncertainEntryIds.set(attemptKey, attempt);
    persistUnresolvedPlacementAttempt(this.ledgerPartitionService?.db, attempt);
    return attempt;
  }

  setLeader(isLeader) {
    const retained = this.workflowOwner ? this.workflowOwner.repository : null;
    if (!isLeader && retained) retained.retireEndedRetainedTenures(this.ledgerPartitionService);
    const tenure = isLeader ? this.ledgerPartitionService.leadershipTenure : null;
    if ((this.custody?.tenure ?? null) === tenure) return;
    this.endCustody();
    if (tenure !== null) this.beginCustody(tenure);
  }

  adoptRenewedTenure() {
    const tenure = this.ledgerPartitionService.leadershipTenure;
    if (this.custody === null || tenure === null || tenure === this.custody.tenure) return;
    this.endCustody();
    this.beginCustody(tenure);
  }

  beginCustody(tenure) {
    this.custody = createTenureCustody(tenure);
    this.attachListeners();
    if (this.workflowOwner) this.workflowOwner.repository.observeRetainedLedgerLeadershipStart();
    this.notify(PLACEMENT_TRIGGER.LEADERSHIP_START);
  }

  endCustody() {
    if (this.custody === null) return;
    this.custody = null;
    this.detachListeners();
    this.pendingTriggers.clear();
  }

  shutdown() {
    this.setLeader(false);
  }

  blockedPlacementAttempts() {
    return this.blockedAttempts.list();
  }

  attachLedgerListeners() {
    const ledger = this.ledgerPartitionService;
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
    }, ledger.raft.subscribe(RAFT_EVENT.TERM_CHANGE, () => this.adoptRenewedTenure()),
    ledger.raft.subscribe(RAFT_EVENT.APPLIED_PROGRESS, () => {
      if (this.custody?.termStart === PLACEMENT_TERM_START.PENDING) {
        this.notify(PLACEMENT_TRIGGER.TERM_START_APPLIED);
      }
    }));
  }

  attachListeners() {
    this.detachListeners();
    this.attachLedgerListeners();
    if (this.nodeAuthority) {
      this.unsubscribers.push(
        this.nodeAuthority.subscribe(() => this.notify(PLACEMENT_TRIGGER.NODES_OR_FORMATION)));
    }
    const cache = this.systemTableCache;
    if (cache) {
      const onCache = (tableName, op, row) => this.handleCacheChange(tableName, row, op);
      cache.onCacheApplyChange(onCache);
      this.unsubscribers.push(() => cache.offCacheApplyChange(onCache));
    }
    const storage = this.storageAccountingService;
    if (storage) {
      this.unsubscribers.push(storage.subscribeCapacitySemanticChanges(() =>
        this.notify(PLACEMENT_TRIGGER.TARGET_CAPACITY_CHANGED)));
    }
    if (this.setIntervalFn && this.resyncIntervalMs > 0) {
      this.resyncHandle = this.setIntervalFn(() => this.notify(PLACEMENT_TRIGGER.RESYNC),
        this.resyncIntervalMs);
    }
  }

  detachListeners() {
    while (this.unsubscribers.length > 0) this.unsubscribers.pop()();
    if (this.resyncHandle !== null && this.clearIntervalFn) this.clearIntervalFn(this.resyncHandle);
    this.resyncHandle = null;
  }

  handleCacheChange(tableName, row, op = null) {
    if (!this.isLeader) return;
    if (tableName === TABLES.SERVICES) {
      this.notify(PLACEMENT_TRIGGER.SERVICES_CHANGED);
    } else if (tableName === TABLES.PARTITIONS || tableName === TABLES.TABLES) {
      this.notify(PLACEMENT_TRIGGER.PARTITIONS_CHANGED);
    } else if (tableName === TABLES.REPLICA_OPERATIONS && row) {
      const opId = row[COLUMN.OPERATION_ID];
      if (typeof opId === 'string') {
        if (op === CACHE_OP_DELETE) this.seenRowSignatures.delete(opId);
        else {
          const sig = rowSignatureOf(row);
          if (this.seenRowSignatures.get(opId) === sig) return;
          this.seenRowSignatures.set(opId, sig);
        }
      }
      this.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
    }
  }
  notify(trigger) {
    if (!this.isLeader) return;
    this.pendingTriggers.add(trigger);
    this.drainQueue();
  }

  // One drain per custody: a new tenure never queues behind an obsolete pass.
  // Invariant: no foreign call between deciding to drain and marking the
  // drain; the custody's running promise exists before the first pass reads
  // the ledger's status (a read that may run a consensus turn and notify).
  drainQueue() {
    const custody = this.custody;
    if (!this.isCustodyCurrent(custody) || this.pendingTriggers.size === 0) {
      return custody?.running ?? Promise.resolve();
    }
    if (custody.running === null) {
      const drain = Promise.withResolvers();
      custody.running = drain.promise;
      this.drainCustody(custody).then(drain.resolve, drain.reject);
    }
    return custody.running;
  }

  // A pass that throws (it aborts: a failure outside the candidate loop, or a
  // candidate admitted or of unknown answer whose step then failed) keeps its
  // triggers in the custody for the next pass and ends the drain:
  // the next one starts only on the next wake (a trigger or the resync), so
  // repeated failures run at most one pass per wake. A failed CANDIDATE
  // retains nothing: planning re-derives it from the census on the next wake,
  // at the latest on the resync, whose pass then stays resync-only.
  async drainCustody(custody) {
    this.activeCustodies.add(custody);
    try {
      do {
        const triggers = new Set([...custody.retainedTriggers, ...this.pendingTriggers]);
        custody.retainedTriggers.clear();
        this.pendingTriggers.clear();
        try {
          await this.runPass(triggers);
        } catch (error) {
          for (const trigger of triggers) custody.retainedTriggers.add(trigger);
          this.logger.warn(LOG_PASS_FAILED, {nodeId: this.nodeId,
            triggers: [...triggers], error: error?.message ?? String(error)});
          break;
        }
      } while (this.isCustodyCurrent(custody) && this.pendingTriggers.size > 0);
    } finally {
      custody.running = null;
      this.activeCustodies.delete(custody);
      if (this.isCustodyCurrent(custody) && this.pendingTriggers.size > 0) {
        this.drainQueue();
      }
    }
  }

  // The current drain and every obsolete drain still running.
  awaitCurrentWorkIdle() {
    return Promise.all([...this.activeCustodies].map((custody) => custody.running));
  }

  recordSeenOperationSignatures() {
    if (!this.systemTableCache) return;
    const activeIds = new Set();
    for (const row of this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS)) {
      const opId = row[COLUMN.OPERATION_ID];
      if (typeof opId === 'string') {
        activeIds.add(opId);
        this.seenRowSignatures.set(opId, rowSignatureOf(row));
      }
    }
    for (const opId of this.seenRowSignatures.keys()) {
      if (!activeIds.has(opId)) {
        this.seenRowSignatures.delete(opId);
      }
    }
  }

  recordTouchedOperationSignature(operationId) {
    if (!this.systemTableCache || typeof operationId !== 'string') return;
    const row = this.systemTableCache
      .getAll(TABLES.REPLICA_OPERATIONS)
      .find((entry) => entry[COLUMN.OPERATION_ID] === operationId);
    if (row) {
      this.seenRowSignatures.set(operationId, rowSignatureOf(row));
    }
  }

  // A2: the census after an engaged ledger hold's release; null at stale.
  async submitReleaseIfCopyIdle(census, pass) {
    const held = census.find((row) =>
      row.incomplete &&
      row.entityType === UNIFIED_SERVICE_TYPE.PARTITION &&
      row.entityId === LEDGER_PARTITION_ID &&
      row.dispatchHold === PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE);
    if (!held) return census;
    const otherCopies = census.filter((row) =>
      row.operationId !== held.operationId && isOccupyingCopy(row));
    if (otherCopies.length > 0) return census;
    await this.submitHoldRelease(held.operationId, pass);
    if (!this.checkpoint(pass, CHECKPOINT.AFTER_HOLD_RELEASE)) return null;
    return readPlacementCensus(this.ledgerPartitionService.db);
  }

  // The fence at the admission boundary, in the synchronous turn that reaches
  // raft.propose; the tenure never travels into the command.
  proposeWithinTenure({entryId, body, pass}, propose) {
    if (!this.isPassCurrent(pass)) {
      recordFenced(pass);
      return tenureFenceRefusal(this.ledgerPartitionService.partitionId);
    }
    recordProposal(pass);
    return propose({entryId, body});
  }

  // `progress` records what is known of this proposal (handed over, answered).
  async submitPlacementAttempt(attempt, submitFn, pass, progress) {
    const {attemptKey, entryId, body} = attempt;
    this.ownEntryIds.add(entryId);
    try {
      recordProposalHandover(progress);
      const answer = await submitFn({entryId, body, pass});
      recordProposalAnswer(progress, answer);
      recordSubmissionAnswer(pass, answer);
      // An obsolete continuation leaves the retained attempt to the current
      // custody (its reconciliation and the settled outcome resolve it).
      if (!this.isPassCurrent(pass)) return answer;
      if (!isWriteOutcomeUnknown(answer) && answer?.committed === true) {
        this.uncertainEntryIds.delete(attemptKey);
        deleteUnresolvedPlacementAttempt(this.ledgerPartitionService?.db, attemptKey);
      }
      observePlacementAttemptAnswer(this.ledgerPartitionService?.db, this.blockedAttempts,
        attempt, answer);
      if (typeof body?.operationId === 'string') {
        this.recordTouchedOperationSignature(body.operationId);
      } else {
        this.recordSeenOperationSignatures();
      }
      return answer;
    } finally {
      this.ownEntryIds.delete(entryId);
    }
  }

  async submitHoldRelease(operationId, pass) {
    if (!this.checkpoint(pass, CHECKPOINT.BEFORE_HOLD_RELEASE)) return null;
    const attempt = this.resolveAttempt(ENTRY_KIND_RELEASE, operationId, operationId,
      () => Object.freeze({operationId}));
    const answer = await this.submitPlacementAttempt(attempt, this.releasePlacementHold, pass,
      createProposalProgress());
    if (!this.isPassCurrent(pass)) return answer;
    const fresh = redrivenReleaseAttempt(this.ledgerPartitionService?.db, this,
      attempt, answer, () => this.nextEntryId(ENTRY_KIND_RELEASE, operationId));
    return fresh === null ? answer : this.submitPlacementAttempt(fresh,
      this.releasePlacementHold, pass, createProposalProgress());
  }

  // A4, and A4' (a retained attempt the ledger refused is admitted afresh).
  async submitCandidateAdmission(candidate, buildStatement, pass, progress) {
    const intentKey = moveIntentKeyOf(candidate.partitionId, candidate.move);
    const attemptKey = `${ENTRY_KIND_ADMIT}:${candidate.partitionId}`;
    const hadRetained = this.uncertainEntryIds.get(attemptKey)?.intentKey === intentKey;
    const attempt = this.resolveAttempt(ENTRY_KIND_ADMIT, candidate.partitionId, intentKey,
      buildStatement);
    const answer = await this.submitPlacementAttempt(attempt, this.admitPlacement, pass, progress);
    if (!this.checkpoint(pass, CHECKPOINT.AFTER_ADMISSION) || !hadRetained ||
        !isCommittedRefusal(answer)) {
      return answer;
    }
    const fresh = this.resolveAttempt(ENTRY_KIND_ADMIT, candidate.partitionId, intentKey,
      buildStatement);
    const freshAnswer = await this.submitPlacementAttempt(fresh, this.admitPlacement, pass,
      progress);
    this.checkpoint(pass, CHECKPOINT.AFTER_READMISSION);
    return freshAnswer;
  }

  submitAdmission(statement) {
    return this.submitCandidateAdmission({partitionId: statement.partitionId,
      move: statement.moves[0]}, () => statement,
    directSubmissionRecord(this.observation, this.custody), createProposalProgress());
  }

  // The custody's one leadership-start reconciliation (synchronous).
  reconcileUnresolvedAttemptsOnLeadershipStart(census, pass) {
    requestLeadershipStartCdcDrive(this, pass);
    const refreshed = readPlacementCensus(this.ledgerPartitionService.db);
    reconcilePlacementAttempts(this.ledgerPartitionService.db, this.uncertainEntryIds,
      this.blockedAttempts);
    pass.custody.reconciled = true;
    return refreshed.length > 0 || census.length > 0 ? refreshed : census;
  }

  canAdmitRemove(candidate, pass) {
    return canAdmitRemoveUnderPass(this, candidate, pass);
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

  async isCandidateAdmissibleNow(candidate, repairWaitingSourceNodeIds, occupancy, pass) {
    if (candidate.move.type === OperationType.REMOVE) {
      if (candidate.deficitKind === PLACEMENT_DEFICIT_KIND.DEAD_LEARNER) return true;
      return this.canAdmitRemove(candidate, pass);
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
    const formationWaiting = [];
    for (const {partitionId, evaluation} of evaluations) {
      if (evaluation.state !== PLACEMENT_DEFICIT_STATE.CANDIDATE) continue;
      const waitReason = formationWaitingReasonOf(
        evaluation.candidate.placementClass,
        nodeInput.formation,
      );
      if (waitReason === null) {
        admissible.push(evaluation.candidate);
      } else {
        formationWaiting.push({partitionId, reason: waitReason});
      }
    }
    return {
      ordered: orderPlacementCandidates(admissible),
      inputsByPartition,
      repairWaitingSourceNodeIds,
      evaluations,
      formationWaiting,
    };
  }

  async proposeOrderedCandidate(rawCandidate, context, progress) {
    const {inputsByPartition, repairWaitingSourceNodeIds, nodeInput,
      busyPartitions, occupancy, saturatedTargets, storageExcludedTargets, pass} = context;
    if (busyPartitions.has(rawCandidate.partitionId)) return null;
    const candidate = this.reevaluateSaturatedTarget(
      rawCandidate,
      inputsByPartition,
      nodeInput,
      saturatedTargets,
      storageExcludedTargets,
    );
    if (candidate === null) return null;
    recordCapacityCheck(pass);
    if (!(await this.isCandidateAdmissibleNow(
      candidate, repairWaitingSourceNodeIds, occupancy, pass)) ||
        !this.checkpoint(pass, CHECKPOINT.AFTER_ADMISSIBILITY)) {
      return null;
    }
    const answer = await this.submitCandidateAdmission(candidate, () =>
      buildPlacementAdmissionStatement(candidate, {
        sourceNodeId: this.resolveStatementSourceNodeId(candidate, inputsByPartition),
        repairWaitingSourceNodeIds,
        formationLatchEpoch: nodeInput.formation.latchEpoch,
        membershipPublicationEpoch: null,
        positions: {nodesEpoch: nodeInput.epoch?.publicationEpoch ?? null},
      }), pass, progress);
    const result = answer?.[PLACEMENT_RESULT_FIELD];
    if (!this.isPassCurrent(pass) || result?.outcome !== PLACEMENT_OUTCOME.ADMITTED) return null;
    const [operationId] = result.operationIds;
    return {candidate, operationId};
  }

  // A candidate's failure is classified by what is known of its proposal
  // (replica-placement-owner-proposal-knowledge.js): not proposed or refused,
  // recorded for it (once per pass, so at most once per wake) and the pass
  // goes on; admitted or of unknown answer, the pass aborts (typed throw).
  async proposeCandidateIsolated(rawCandidate, context) {
    const progress = createProposalProgress();
    try {
      return await this.proposeOrderedCandidate(rawCandidate, context, progress);
    } catch (error) {
      const failed = classifyCandidateFailure(context.pass, rawCandidate.partitionId, progress,
        error);
      this.logger.warn(LOG_CANDIDATE_FAILED, {nodeId: this.nodeId,
        partitionId: rawCandidate.partitionId, error: error?.message ?? String(error)});
      return failed;
    }
  }

  // A5: an admitted ledger move's hold is released while no other copy runs;
  // false when the pass's tenure ended across it.
  async releaseAdmittedLedgerHold(operationId, state, pass) {
    state.ledgerIncomplete = true;
    if (state.copyCount > 1) return true;
    await this.submitHoldRelease(operationId, pass);
    return this.checkpoint(pass, CHECKPOINT.AFTER_LEDGER_HOLD_RELEASE);
  }

  async admitOrderedCandidates(context) {
    const {ordered, busyPartitions, occupancy, saturatedTargets, pass} = context;
    const state = {incompleteCount: context.incompleteCount, copyCount: context.copyCount,
      ledgerIncomplete: context.ledgerIncomplete};
    for (const rawCandidate of ordered) {
      if (!this.checkpoint(pass, CHECKPOINT.CANDIDATE) ||
          shouldStopPlacementPass(rawCandidate, state)) break;
      const proposal = await this.proposeCandidateIsolated(rawCandidate, context);
      if (proposal === null || proposal === CANDIDATE_FAILED) continue;
      const {candidate, operationId} = proposal;
      recordAdmittedOperation(pass, operationId);
      busyPartitions.add(candidate.partitionId);
      state.incompleteCount += 1;
      state.copyCount += recordAdmittedCopyOccupancy(candidate, occupancy, saturatedTargets);
      if (candidate.placementClass === PLACEMENT_CLASS.LEDGER &&
          !(await this.releaseAdmittedLedgerHold(operationId, state, pass))) break;
    }
  }

  // The census after the custody's one leadership-start reconciliation and an
  // idle ledger hold's release; null when the tenure ended across either.
  async readPassCensus(pass) {
    this.recordSeenOperationSignatures();
    let census = readPlacementCensus(this.ledgerPartitionService.db);
    if (!pass.custody.reconciled) {
      census = this.reconcileUnresolvedAttemptsOnLeadershipStart(census, pass);
    }
    // Every pass, behind passTermStartBarrier: a release whose hold was lifted retires.
    reconcileReleaseAttempts(this.ledgerPartitionService.db, this.uncertainEntryIds,
      this.blockedAttempts);
    return this.submitReleaseIfCopyIdle(census, pass);
  }

  // The barrier before a custody's first census: its own term start applied
  // here. Synchronous with the pass-start checkpoint and the census read.
  passTermStartBarrier(pass) {
    const custody = pass.custody;
    if (custody.termStart === PLACEMENT_TERM_START.APPLIED) return true;
    if (!isTermStartApplied(this.ledgerPartitionService, custody.tenure)) {
      markPassWaiting(pass, CHECKPOINT.TERM_START_BARRIER);
      return false;
    }
    custody.termStart = PLACEMENT_TERM_START.APPLIED;
    // The status read may have run a consensus turn: the custody, re-checked.
    return this.checkpoint(pass, CHECKPOINT.TERM_START_BARRIER);
  }

  async planAndAdmit(pass, census, nodeInput, nowMs) {
    const busyPartitions = new Set(census.filter((r) =>
      r.incomplete && r.entityType === UNIFIED_SERVICE_TYPE.PARTITION).map((r) => r.entityId));
    const occupancy = summarizeCopyOccupancy(census);
    const saturatedTargets = saturatedTargetsOf(occupancy.byTarget);
    recordCapacityCheck(pass);
    const storageExcludedTargets = this.readStorageExcludedTargets(nodeInput, nowMs);
    const promotedByPartition = promotedVoterReplicaIdsByPartition(census);
    const prepared = this.preparePassOrderedCandidates(nodeInput, busyPartitions,
      saturatedTargets, storageExcludedTargets, promotedByPartition);
    recordPassEvaluations(pass, prepared);
    return this.admitOrderedCandidates({
      ordered: prepared.ordered, inputsByPartition: prepared.inputsByPartition,
      repairWaitingSourceNodeIds: prepared.repairWaitingSourceNodeIds, nodeInput,
      busyPartitions, occupancy, saturatedTargets, storageExcludedTargets, pass,
      incompleteCount: census.filter((r) => r.incomplete).length,
      copyCount: occupancy.copies.length,
      ledgerIncomplete: census.some((r) => r.incomplete &&
        r.entityType === UNIFIED_SERVICE_TYPE.PARTITION && r.entityId === LEDGER_PARTITION_ID),
    });
  }

  async runPassSteps(pass) {
    if (!this.checkpoint(pass, CHECKPOINT.PASS_START) || !this.passTermStartBarrier(pass)) return;
    const census = await this.readPassCensus(pass);
    if (census === null || !this.checkpoint(pass, CHECKPOINT.AFTER_CENSUS)) return;
    const nowMs = this.now();
    const nodeInput = readPlacementNodeInputs(this.nodeAuthority, nowMs);
    if (nodeInput.state !== SERVE_ELIGIBILITY_STATE.READY) {
      this.nodeAuthority.scheduleRefresh();
      recordNodeAuthorityWait(pass, nodeInput);
      return;
    }
    await this.planAndAdmit(pass, census, nodeInput, nowMs);
    completePass(pass, SERVE_ELIGIBILITY_STATE.READY);
  }

  // One pass under the custody current at its start (the drain's own).
  async runPass(triggers) {
    const pass = beginPlacementPass(this.observation, this.custody, triggers);
    try {
      await this.runPassSteps(pass);
    } catch (error) {
      recordPassFailure(pass, error);
      throw error;
    } finally {
      if (pass.stoppedAt === CHECKPOINT.RUNNING) pass.stoppedAt = CHECKPOINT.ABORTED;
      this.placementResyncAdmissions += resyncAdmissionsOf(pass, triggers);
      if (pass.custody === this.custody || this.custody === null) {
        this.lastPassSnapshot = Object.freeze({...placementPassSnapshot(pass,
          PLACEMENT_CLEARING_TRIGGER), ...this.blockedAttempts.snapshot()});
      }
    }
    return pass;
  }
}

function createReplicaPlacementOwner(options) {
  return new ReplicaPlacementOwner(options);
}

// The ledger's leadership sink is the owner's slot (no other owner binds
// replica_operations-p1): an occupied slot is a second scheduler, refused.
function attachReplicaPlacementOwner(options = {}) {
  const owner = createReplicaPlacementOwner(options);
  const {ledgerPartitionService} = options;
  if (!isFunction(ledgerPartitionService?.setRebalancerLeadershipSink) ||
      ledgerPartitionService.rebalancerLeadershipSink) {
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
