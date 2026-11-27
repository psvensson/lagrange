import {isDeepStrictEqual} from 'node:util';
import {promotedVoterReplicaIdsByPartition} from './replica-placement-owner-retained-repair-statement.js';
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
import {LEDGER_PARTITION_ID, isOccupyingCopy, readPlacementCensus} from
  '../partition/partition-placement-admission-decision.js';
import {COPY_MOVE_TYPES, buildPassOrderedCandidates, buildTargetCapacityRanker,
  classifyNodeStorageExclusion, computeCopyWaitingDemand, createPlacementDecisionDiagnostics,
  decideCopyCapacity, recordAdmittedCopyOccupancy, resolveOwnerMoveCopyLimits, saturatedTargetsOf,
  sourceLimitOf, summarizeCopyOccupancy, targetLimitOf} from './replica-placement-owner-capacity.js';
import {createAdaptivePlacementBudgetController} from
  './replica-placement-adaptive-budget.js';
import {COPY_PHASE_WORKFLOW_STEPS} from './replica-operation-step-policy.js';
import {requestPlacementAdmission, requestPlacementHoldRelease} from '../partition/partition-placement-admission.js';
import {isWriteOutcomeUnknown, resolveEntryId} from '../partition/partition-write-kernel.js';
import {RAFT_EVENT} from '../raft/constants.js';
import {OperationType} from './replica-operation-progress.js';
import {buildPlacementAdmissionStatement} from './replica-placement-owner-admission-statement.js';
import {createBlockedPlacementAttempts, deleteUnresolvedPlacementAttempt,
  observePlacementAttemptAnswer, persistUnresolvedPlacementAttempt, reconcilePlacementAttempts,
  reconcileReleaseAttempts, redrivenReleaseAttempt} from './replica-placement-owner-attempts.js';
import {COLLABORATOR, REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID, invalidCollaborator, isFunction,
  validateReplicaPlacementOwnerOptions} from './replica-placement-owner-collaborators.js';
import {PLACEMENT_CLASS, PLACEMENT_CLEARING_TRIGGER, PLACEMENT_COPY_CAPACITY,
  PLACEMENT_DEFICIT_KIND, PLACEMENT_DISPATCH_HOLD, PLACEMENT_OUTCOME, PLACEMENT_TRIGGER} from
  './replica-placement-owner-constants.js';
import {PLACEMENT_DEFICIT_STATE, buildDeficitContext, buildPartitionReplicaRows, evaluateDeficitContext,
  evaluatePartitionDeficit, readPlacementNodeInputs} from './replica-placement-owner-deficits.js';
import {canAdmitRemoveUnderPass} from './replica-placement-owner-remove.js';
import {PLACEMENT_PASS_CHECKPOINT as CHECKPOINT, beginPlacementPass, completePass,
  createPlacementObservation, directSubmissionRecord, markPassStale, markPassWaiting,
  placementPassSnapshot, recordCapacityCheck, recordFenced, recordAdmittedOperation,
  recordNodeAuthorityWait, recordPassEvaluations, recordPassFailure, recordProposal,
  recordSubmissionAnswer, resyncAdmissionsOf} from './replica-placement-owner-pass-observation.js';
import {CANDIDATE_FAILED, classifyCandidateFailure, createProposalProgress, recordProposalAnswer,
  recordProposalHandover} from './replica-placement-owner-proposal-knowledge.js';
import {PLACEMENT_TERM_START, createTenureCustody, isTermStartApplied, requestLeadershipStartCdcDrive,
  tenureFenceRefusal} from './replica-placement-owner-tenure.js';

const PLACEMENT_RESYNC_INTERVAL_MS = 60_000;
const ENTRY_KIND_RELEASE = 'release';
const ENTRY_KIND_ADMIT = 'admit';
const CACHE_OP_DELETE = 'DELETE';
const SIGNATURE_SEPARATOR = ':';
const SKIPPED_PARTITION_STATUSES = Object.freeze(new Set(['splitting', 'merging']));
const LOG_PASS_FAILED = 'Replica placement pass failed; its triggers wait for the next wake';
const LOG_CANDIDATE_FAILED = 'Replica placement candidate failed; the pass goes on';
const OPERATION_SIGNATURE_SQL = Object.freeze({
  BY_ID: 'SELECT workflow_step, status, steps_history FROM replica_operations WHERE operation_id = ?',
});

const CACHE_TABLE_TRIGGER = Object.freeze({
  [TABLES.SERVICES]: PLACEMENT_TRIGGER.SERVICES_CHANGED,
  [TABLES.PARTITIONS]: PLACEMENT_TRIGGER.PARTITIONS_CHANGED,
  [TABLES.TABLES]: PLACEMENT_TRIGGER.PARTITIONS_CHANGED,
});

function readLedgerOperationRowById(ledgerService, operationId) {
  const store = ledgerService?.db;
  if (!store || store.open === false || !isFunction(store.prepare)) return null;
  return store.prepare(OPERATION_SIGNATURE_SQL.BY_ID).get(operationId) ?? null;
}

function rowSignatureOf(row) {
  return `${row.workflow_step}:${row.status}:${row.steps_history}`;
}

function isInFlightCopyStepRow(row) {
  return Boolean(row && COPY_PHASE_WORKFLOW_STEPS.has(row.workflow_step)) &&
    !(typeof row.steps_history === 'string' &&
      row.steps_history.includes(PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE));
}

function isOwnInFlightOperationRow(ownEntryIds, row) {
  if (ownEntryIds.size === 0 || typeof row?.steps_history !== 'string') return false;
  for (const entryId of ownEntryIds) if (row.steps_history.includes(entryId)) return true;
  return false;
}

function isInFlightCopyStepTransition(prevSig, row) {
  if (prevSig === undefined || !isInFlightCopyStepRow(row)) return false;
  return COPY_PHASE_WORKFLOW_STEPS.has(prevSig.split(SIGNATURE_SEPARATOR)[0]) &&
    !prevSig.includes(PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE);
}

function shouldWakeOnOperationRowChange(seenSigs, ownIds, row, op) {
  if (!row) return false;
  const opId = row[COLUMN.OPERATION_ID];
  if (typeof opId !== 'string') return true;
  if (op === CACHE_OP_DELETE) return seenSigs.delete(opId), true;
  const sig = rowSignatureOf(row);
  const prevSig = seenSigs.get(opId);
  if (prevSig === sig) return false;
  seenSigs.set(opId, sig);
  return !isOwnInFlightOperationRow(ownIds, row) && !isInFlightCopyStepTransition(prevSig, row);
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
    this.lastPlacementDecision = null;
    this.adaptiveBudgetController = options.adaptiveBudgetController ||
      createAdaptivePlacementBudgetController(options.adaptiveBudgetOptions || {});
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
    this.custody.serviceWakes = {previousUpdate: null, pendingUpdates: 0, pendingRepeats: 0,
      totals: {adjacentRepeatedUpdates: 0, serviceOnlyPasses: 0, serviceOnlyEvaluations: 0,
        repeatOnlyPasses: 0, repeatOnlyEvaluations: 0, repeatOnlyProposals: 0, repeatOnlyAdmissions: 0}};
    this.adaptiveBudgetController?.resetForNewLeadership?.();
    this.attachListeners();
    if (this.workflowOwner) this.workflowOwner.repository.observeRetainedLedgerLeadershipStart();
    this.notify(PLACEMENT_TRIGGER.LEADERSHIP_START);
  }

  endCustody() {
    if (this.custody === null) return;
    this.custody = null;
    this.lastPlacementDecision = null;
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
    const onWriteReleased = () => {
      if (this.ownEntryIds.size === 0) this.notify(PLACEMENT_TRIGGER.WRITE_PATH_RELEASED);
    };
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
    if (this.systemTableCache) {
      const onCache = (tableName, op, row) => this.handleCacheChange(tableName, row, op);
      this.systemTableCache.onCacheApplyChange(onCache);
      this.unsubscribers.push(() => this.systemTableCache.offCacheApplyChange(onCache));
    }
    if (this.storageAccountingService) {
      this.unsubscribers.push(this.storageAccountingService.subscribeCapacitySemanticChanges(() =>
        this.notify(PLACEMENT_TRIGGER.TARGET_CAPACITY_CHANGED)));
    }
    if (isFunction(this.adaptiveBudgetController?.subscribe)) {
      this.unsubscribers.push(this.adaptiveBudgetController.subscribe(() =>
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
    const directTrigger = CACHE_TABLE_TRIGGER[tableName];
    if (directTrigger) return void this.notify(directTrigger, op === 'UPDATE' ? row : null);
    if (tableName === TABLES.NODES && row && op !== CACHE_OP_DELETE) {
      this.adaptiveBudgetController?.observeNodeRow(row[COLUMN.NODE_ID], row, this.now());
    } else if (tableName === TABLES.REPLICA_OPERATIONS &&
        shouldWakeOnOperationRowChange(this.seenRowSignatures, this.ownEntryIds, row, op)) {
      this.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
    }
  }
  notify(trigger, updatedRow = null) {
    if (!this.isLeader) return;
    if (Object.hasOwn(PLACEMENT_TRIGGER, trigger)) {
      this.observation.triggerNotifications[trigger]++;
    }
    if (trigger === PLACEMENT_TRIGGER.SERVICES_CHANGED) {
      const wakes = this.custody.serviceWakes;
      wakes.pendingUpdates++;
      // One previous apply-time image per tenure. Interleaved keys undercount repeats.
      if (updatedRow?.[COLUMN.SERVICE_ID] && wakes.previousUpdate?.[COLUMN.SERVICE_ID] ===
          updatedRow[COLUMN.SERVICE_ID] && isDeepStrictEqual(wakes.previousUpdate, updatedRow)) {
        wakes.totals.adjacentRepeatedUpdates++;
        wakes.pendingRepeats++;
      }
      wakes.previousUpdate = updatedRow;
    }
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

  // A pass that throws (abort outside candidate loop, or admitted/unknown candidate
  // whose step failed) keeps its triggers and ends the drain until next wake/resync;
  // a failed CANDIDATE retains nothing (re-derived from census on next wake/resync).
  async drainCustody(custody) {
    this.activeCustodies.add(custody);
    try {
      do {
        const triggers = new Set([...custody.retainedTriggers, ...this.pendingTriggers]);
        const wakes = custody.serviceWakes;
        const repeatOnly = custody.retainedTriggers.size === 0 && wakes.pendingUpdates > 0 &&
          wakes.pendingRepeats === wakes.pendingUpdates;
        wakes.pendingUpdates = 0;
        wakes.pendingRepeats = 0;
        custody.retainedTriggers.clear();
        this.pendingTriggers.clear();
        try {
          await this.runPass(triggers, repeatOnly);
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
      if (!activeIds.has(opId)) this.seenRowSignatures.delete(opId);
    }
  }

  recordTouchedOperationSignature(operationId) {
    if (typeof operationId !== 'string' || operationId.length === 0) return;
    const cache = this.systemTableCache;
    const row = (isFunction(cache?.getShared) ?
      cache.getShared(TABLES.REPLICA_OPERATIONS, operationId) : null) ??
      readLedgerOperationRowById(this.ledgerPartitionService, operationId);
    if (row) this.seenRowSignatures.set(operationId, rowSignatureOf(row));
  }

  // A2: the census after an engaged ledger hold's release; null at stale.
  async submitReleaseIfCopyIdle(census, pass) {
    const held = census.find((row) => row.incomplete &&
      row.entityType === UNIFIED_SERVICE_TYPE.PARTITION &&
      row.entityId === LEDGER_PARTITION_ID &&
      row.dispatchHold === PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE);
    if (!held) return census;
    if (census.some((row) => row.operationId !== held.operationId && isOccupyingCopy(row))) {
      return census;
    }
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
    const move = body.moves?.[0];
    if (pass.decisionDiagnostics && COPY_MOVE_TYPES.has(move?.type)) {
      pass.decisionDiagnostics.recordProposal(entryId, body, move);
    }
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
      const result = answer?.[PLACEMENT_RESULT_FIELD];
      const touchedOperationIds = new Set(
        [body?.operationId, result?.operationId, ...(Array.isArray(result?.operationIds) ?
          result.operationIds : [])].filter((id) => typeof id === 'string' && id.length > 0),
      );
      for (const opId of touchedOperationIds) this.recordTouchedOperationSignature(opId);
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
    this.recordSeenOperationSignatures();
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
        this.storageAccountingService.getCapacitySemanticIdentity(nodeId, nowMs));
      if (reason !== null) excluded.set(nodeId, reason);
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
    return {partitionRows: this.systemTableCache.getAll(TABLES.PARTITIONS), servicesByPartition};
  }

  readPassPartitionInputs(busyPartitions, promotedByPartition, diagnostics) {
    const {partitionRows, servicesByPartition} = this.readPartitionPlacementRows();
    const inputsByPartition = new Map();
    for (const partitionRow of partitionRows) {
      const partitionId = partitionRow[COLUMN.PARTITION_ID];
      const status = readLowerStateField(partitionRow[COLUMN.STATUS]);
      if (!partitionId) continue;
      if (SKIPPED_PARTITION_STATUSES.has(status)) {
        diagnostics?.observePartition(partitionId, 'excluded_status', null);
        diagnostics?.disposition(partitionId, 'excluded_status', status);
        continue;
      }
      const isBusy = busyPartitions.has(partitionId);
      diagnostics?.observePartition(partitionId, 'evaluation_unexamined', isBusy);
      const {replicationFactor} = resolveDesiredReplicationFactor(partitionRow);
      const replicaRows = buildPartitionReplicaRows(servicesByPartition.get(partitionId) || [],
        partitionRow[COLUMN.LEADER_NODE_ID], isBusy, promotedByPartition.get(partitionId));
      inputsByPartition.set(partitionId, {replicationFactor, replicaRows, isBusy});
    }
    return inputsByPartition;
  }

  evaluatePassPartition(partitionId, input, targetInputs, previousContext, retainContext) {
    const {replicationFactor, replicaRows, isBusy} = input;
    const context = previousContext ? {...previousContext, ...targetInputs} :
      buildDeficitContext({partitionId, replicationFactor, replicaRows, ...targetInputs});
    const evaluation = evaluateDeficitContext(context);
    return retainContext && evaluation.state !== PLACEMENT_DEFICIT_STATE.NONE ?
      {partitionId, isBusy, evaluation, deficitContext: context} :
      {partitionId, isBusy, evaluation};
  }

  evaluatePassPartitions(inputsByPartition, nodeInput, saturatedTargetNodeIds,
    storageExcludedTargets, targetCapacityRanker = null, preliminary = null, retainContext = false) {
    const targetInputs = {eligibility: nodeInput.eligibility, saturatedTargetNodeIds,
      storageExcludedTargets, targetCapacityRanker};
    if (preliminary) {
      // Only this synchronous budget turn shares replica and membership inputs.
      return preliminary.map((entry) => entry.evaluation.state === PLACEMENT_DEFICIT_STATE.NONE ?
        entry : this.evaluatePassPartition(entry.partitionId, inputsByPartition.get(entry.partitionId),
          targetInputs, entry.deficitContext));
    }
    return Array.from(inputsByPartition, ([partitionId, input]) =>
      this.evaluatePassPartition(partitionId, input, targetInputs, null, retainContext));
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

  reevaluateSaturatedTarget(candidate, inputsByPartition, nodeInput, saturatedTargets,
    storageExcludedTargets, targetCapacityRanker = null) {
    if (!COPY_MOVE_TYPES.has(candidate.move.type) ||
        !saturatedTargets.has(candidate.move.targetNodeId)) return candidate;
    const input = inputsByPartition.get(candidate.partitionId);
    const reevaluated = evaluatePartitionDeficit({
      partitionId: candidate.partitionId, replicationFactor: input.replicationFactor,
      replicaRows: input.replicaRows, eligibility: nodeInput.eligibility,
      saturatedTargetNodeIds: saturatedTargets, storageExcludedTargets, targetCapacityRanker,
    });
    return reevaluated.state === PLACEMENT_DEFICIT_STATE.CANDIDATE ? reevaluated.candidate : null;
  }

  async isCandidateAdmissibleNow(candidate, repairWaitingSourceNodeIds, occupancy, pass,
    budgetSnapshot = null) {
    if (candidate.move.type === OperationType.REMOVE) {
      if (candidate.deficitKind === PLACEMENT_DEFICIT_KIND.DEAD_LEARNER) return true;
      return this.canAdmitRemove(candidate, pass);
    }
    if (!COPY_MOVE_TYPES.has(candidate.move.type)) return true;
    const check = decideCopyCapacity(candidate, repairWaitingSourceNodeIds, occupancy, budgetSnapshot);
    pass.decisionDiagnostics?.recordCopyCheck(check);
    return check.allowed;
  }

  preparePassOrderedCandidates(nodeInput, inputsByPartition, saturatedTargets,
    storageExcludedTargets, targetCapacityRanker = null, diagnostics, preliminary = null) {
    const evaluations = this.evaluatePassPartitions(inputsByPartition, nodeInput,
      saturatedTargets, storageExcludedTargets,
      targetCapacityRanker, preliminary);
    return buildPassOrderedCandidates(evaluations, inputsByPartition, nodeInput.formation, diagnostics);
  }

  resolveAdaptiveCopyLimitsForMove(move, nowMs = this.now()) {
    return resolveOwnerMoveCopyLimits(this, move, nowMs);
  }

  async proposeOrderedCandidate(rawCandidate, context, progress) {
    const {inputsByPartition, repairWaitingSourceNodeIds, nodeInput,
      busyPartitions, occupancy, saturatedTargets, storageExcludedTargets,
      budgetSnapshot, targetCapacityRanker, pass} = context;
    if (busyPartitions.has(rawCandidate.partitionId)) {
      pass.decisionDiagnostics?.disposition(rawCandidate.partitionId, 'partition_busy');
      return null;
    }
    const candidate = this.reevaluateSaturatedTarget(rawCandidate, inputsByPartition,
      nodeInput, saturatedTargets, storageExcludedTargets, targetCapacityRanker);
    if (candidate === null) {
      pass.decisionDiagnostics?.disposition(rawCandidate.partitionId, 'saturated_target_reevaluation');
      return null;
    }
    recordCapacityCheck(pass);
    if (!(await this.isCandidateAdmissibleNow(candidate, repairWaitingSourceNodeIds,
      occupancy, pass, budgetSnapshot))) {
      if (!COPY_MOVE_TYPES.has(candidate.move.type)) {
        pass.decisionDiagnostics?.disposition(candidate.partitionId, 'remove_denied');
      }
      return null;
    }
    if (!this.checkpoint(pass, CHECKPOINT.AFTER_ADMISSIBILITY)) {
      pass.decisionDiagnostics?.disposition(candidate.partitionId, 'tenure_ended');
      return null;
    }
    const isCopy = COPY_MOVE_TYPES.has(candidate.move.type);
    const kSrc = isCopy ? sourceLimitOf(candidate.move.copySourceNodeId, budgetSnapshot) :
      PLACEMENT_COPY_CAPACITY.K_SRC;
    const kTgt = isCopy ? targetLimitOf(candidate.move.targetNodeId, budgetSnapshot) :
      PLACEMENT_COPY_CAPACITY.K_TGT;
    const answer = await this.submitCandidateAdmission(candidate, () =>
      buildPlacementAdmissionStatement(candidate, {
        sourceNodeId: this.resolveStatementSourceNodeId(candidate, inputsByPartition),
        repairWaitingSourceNodeIds, formationLatchEpoch: nodeInput.formation.latchEpoch,
        membershipPublicationEpoch: null,
        positions: {nodesEpoch: nodeInput.epoch?.publicationEpoch ?? null},
        kSrc, kTgt,
      }), pass, progress);
    const result = answer?.[PLACEMENT_RESULT_FIELD];
    pass.decisionDiagnostics?.disposition(candidate.partitionId,
      isWriteOutcomeUnknown(answer) ? 'uncertain' : result?.outcome ??
        (answer?.failureCode ? 'refused' : answer?.tenureFence ? 'tenure_ended' : 'unconfirmed'),
      result?.reason ?? answer?.failureCode ?? null);
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
    const diagnostics = pass.decisionDiagnostics?.snapshot;
    if (diagnostics) diagnostics.orderedCount = ordered.length;
    for (const rawCandidate of ordered) {
      if (!this.checkpoint(pass, CHECKPOINT.CANDIDATE) ||
          shouldStopPlacementPass(rawCandidate, state)) {
        if (diagnostics) diagnostics.stopReason = pass.stale ? 'tenure_ended' : 'ledger_exclusion';
        break;
      }
      if (diagnostics) diagnostics.admissionExamined++;
      const proposal = await this.proposeCandidateIsolated(rawCandidate, context);
      if (proposal === null || proposal === CANDIDATE_FAILED) continue;
      const {candidate, operationId} = proposal;
      recordAdmittedOperation(pass, operationId);
      busyPartitions.add(candidate.partitionId);
      state.incompleteCount += 1;
      state.copyCount += recordAdmittedCopyOccupancy(
        candidate, occupancy, saturatedTargets, context.budgetSnapshot);
      if (candidate.placementClass === PLACEMENT_CLASS.LEDGER &&
          !(await this.releaseAdmittedLedgerHold(operationId, state, pass))) {
        if (diagnostics) diagnostics.stopReason = 'ledger_hold_checkpoint';
        break;
      }
      if (this.pendingTriggers.size > 0) {
        if (diagnostics) diagnostics.stopReason = 'pending_trigger';
        break;
      }
    }
  }

  // The census after the custody's one leadership-start reconciliation and an
  // idle ledger hold's release; null when the tenure ended across either.
  async readPassCensus(pass) {
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
    pass.decisionDiagnostics = createPlacementDecisionDiagnostics(pass, nowMs);
    const occupancy = summarizeCopyOccupancy(census, pass.decisionDiagnostics);
    recordCapacityCheck(pass);
    const storageExcludedTargets = this.readStorageExcludedTargets(nodeInput, nowMs);
    const promotedByPartition = promotedVoterReplicaIdsByPartition(census);
    const inputsByPartition = this.readPassPartitionInputs(busyPartitions, promotedByPartition,
      pass.decisionDiagnostics);
    const preliminary = this.evaluatePassPartitions(inputsByPartition, nodeInput, new Set(),
      storageExcludedTargets, null, null, true);
    const {waitingBySource, waitingByTarget} = computeCopyWaitingDemand(preliminary,
      nodeInput.formation, nodeInput.eligibility.eligibleNodeIds, storageExcludedTargets);
    const budgetSnapshot = this.adaptiveBudgetController ?
      this.adaptiveBudgetController.evaluatePassBudgets({
        nodeInput, occupancy, waitingBySource, waitingByTarget, storageExcludedTargets, nowMs,
        recordWindow: pass.decisionDiagnostics.recordWindow,
      }) : null;
    pass.decisionDiagnostics.recordAdmissionLimits(budgetSnapshot);
    const effectiveExcludedTargets = budgetSnapshot?.hardExcludedTargets || storageExcludedTargets;
    const saturatedTargets = saturatedTargetsOf(occupancy.byTarget, budgetSnapshot,
      nodeInput.eligibility.eligibleNodeIds);
    const targetCapacityRanker = buildTargetCapacityRanker(budgetSnapshot,
      nodeInput.eligibility.eligibleNodeIds);
    const prepared = this.preparePassOrderedCandidates(nodeInput, inputsByPartition,
      saturatedTargets, effectiveExcludedTargets, targetCapacityRanker, pass.decisionDiagnostics, preliminary);
    recordPassEvaluations(pass, prepared);
    return this.admitOrderedCandidates({
      ordered: prepared.ordered, inputsByPartition: prepared.inputsByPartition,
      repairWaitingSourceNodeIds: prepared.repairWaitingSourceNodeIds, nodeInput,
      busyPartitions, occupancy, saturatedTargets,
      storageExcludedTargets: effectiveExcludedTargets,
      budgetSnapshot, targetCapacityRanker, pass,
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
  async runPass(triggers, repeatOnly = false) {
    const pass = beginPlacementPass(this.observation, this.custody, triggers);
    try {
      await this.runPassSteps(pass);
    } catch (error) {
      recordPassFailure(pass, error);
      throw error;
    } finally {
      if (pass.stoppedAt === CHECKPOINT.RUNNING) pass.stoppedAt = CHECKPOINT.ABORTED;
      this.placementResyncAdmissions += resyncAdmissionsOf(pass, triggers);
      if (pass.custody && triggers.size === 1 && triggers.has(PLACEMENT_TRIGGER.SERVICES_CHANGED)) {
        const totals = pass.custody.serviceWakes.totals;
        totals.serviceOnlyPasses++;
        totals.serviceOnlyEvaluations += pass.evaluated;
        if (repeatOnly) {
          totals.repeatOnlyPasses++;
          totals.repeatOnlyEvaluations += pass.evaluated;
          totals.repeatOnlyProposals += pass.proposals;
          totals.repeatOnlyAdmissions += pass.operationIds.length;
        }
      }
      if (pass.custody === this.custody || this.custody === null) {
        if (pass.decisionDiagnostics && pass.custody === this.custody) {
          this.lastPlacementDecision = {...pass.decisionDiagnostics.snapshot,
            triggerNotifications: {...this.observation.triggerNotifications},
            passesByTrigger: {...this.observation.passesByTrigger},
            serviceWakes: {...pass.custody.serviceWakes.totals},
          };
        }
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

export {REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID, attachReplicaPlacementOwner,
  createReplicaPlacementOwner};
