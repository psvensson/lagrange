// Every legitimate trigger of the retained owner only queues a named kind on
// the record and starts the one drain; the drain runs one serialized decision
// per record after the decision in flight settles. Publication rows are hints:
// the decision re-resolves the binding from the canonical route itself.
import {isDeepStrictEqual} from 'node:util';
import {LEDGER_PARTITION_ID, readPlacementCensus, readPlacementCopyOccupancy} from
  '../partition/partition-placement-admission-decision.js';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {PLACEMENT_TRIGGER} from './replica-placement-owner-constants.js';
import {REPAIR_OBSERVATION as OBSERVATION, peerObservationMayClear, ownRowObservation,
  recordRepairObservation, takeRepairObservations} from './replica-operation-retained-repair-observation.js';
import {RETAINED_REPAIR_BINDING as BINDING, RETAINED_REPAIR_BLOCKER as BLOCKER,
  RETAINED_REPAIR_CUSTODY as CUSTODY, RETAINED_REPAIR_DECISION_RUN as RUN,
  RETAINED_REPAIR_ENTRY as ENTRY, RETAINED_REPAIR_ORIGIN as ORIGIN,
  RETAINED_REPAIR_TENURE as TENURE, NO_TENURE, entryBody} from './replica-operation-retained-repair-record.js';

const READ_BLOCKER_SQL = 'SELECT created_at, workflow_step, completed_at FROM replica_operations ' +
  'WHERE operation_id = ?';
const REPAIR_LOG = Object.freeze({DEFERRED: 'Retained placement repair deferred'});
const ROUTE_TABLES = new Set([SYSTEM_TABLE_NAME.PARTITIONS, SYSTEM_TABLE_NAME.SERVICES]);

function sameBlocker(row, blocker) {
  return row?.created_at === blocker.createdAt &&
    row.workflow_step === blocker.workflowStep && row.completed_at === blocker.completedAt;
}

function ledgerTerm(service) {
  return service.raft.readStatus().term;
}

function holdsTenure(attempt, service) {
  return attempt.tenure.state === TENURE.LEDGER && attempt.tenure.service === service;
}

// A receiver tenure is one ledger term of one live local service.
function tenureEnded(attempt) {
  const service = attempt.tenure.service;
  return service.isShutdown === true || !service.isLeader ||
    attempt.tenure.term !== ledgerTerm(service);
}

function pinnedEntryCommitted(attempt, event) {
  return attempt.entry.state === ENTRY.PINNED &&
    event?.command?.entryId === attempt.entry.entryId;
}

// A ledger commit clears a refusal that waits for one, only when it changed a
// recorded blocker or the recorded copy occupancy.
function commitClears(attempt, event, service) {
  if (attempt.custody.state === CUSTODY.DELEGATED || pinnedEntryCommitted(attempt, event)) {
    return false;
  }
  if (attempt.tenure.state === TENURE.LEDGER && !attempt.tenure.service.isLeader) return false;
  if (attempt.clearingTrigger !== PLACEMENT_TRIGGER.LEDGER_COMMIT) return false;
  const db = service.db;
  switch (attempt.blocker.kind) {
  case BLOCKER.OCCUPANCY:
    return !isDeepStrictEqual(attempt.blocker.occupancy, readPlacementCopyOccupancy(
      entryBody(attempt.entry).copyPolicy.statement, readPlacementCensus(db)));
  case BLOCKER.OPERATIONS:
    return attempt.blocker.operations.some((blocker) =>
      !sameBlocker(db.prepare(READ_BLOCKER_SQL).get(blocker.operationId), blocker));
  default:
    return true;
  }
}

function releaseClears(attempt, service) {
  return attempt.custody.state === CUSTODY.SELF &&
    attempt.clearingTrigger === PLACEMENT_TRIGGER.WRITE_PATH_RELEASED &&
    (attempt.tenure.state === TENURE.NONE || (holdsTenure(attempt, service) && service.isLeader));
}

function routePublication(attempt, tableName, row) {
  if (ROUTE_TABLES.has(tableName)) return row?.partition_id === LEDGER_PARTITION_ID;
  // The bound receiver's process incarnation is published on its NODES row.
  return tableName === SYSTEM_TABLE_NAME.NODES && attempt.binding.state === BINDING.REMOTE &&
    row?.node_id === attempt.binding.nodeId &&
    row.boot_incarnation !== attempt.binding.nodeBootIncarnation;
}

function assignRetainedRepairWakeMethods(Repository) {
  Object.assign(Repository.prototype, {
    wakeRetainedPlacementRepairs(predicate, kind) {
      if (this.isShuttingDownRequested()) return;
      for (const attempt of this.retainedPlacementRepairs.values()) {
        if (predicate(attempt)) recordRepairObservation(attempt, kind);
      }
      this.ensureRetainedRepairDrain();
    },

    ensureRetainedRepairDrain() {
      if (this.retainedPlacementRepairDrain) return;
      this.retainedPlacementRepairDrain = Promise.resolve()
        .then(() => this.redriveRetainedPlacementRepairs())
        .catch((error) => this.logger.warn(REPAIR_LOG.DEFERRED,
          {error: error?.message || String(error)}))
        .finally(() => {
          this.retainedPlacementRepairDrain = null;
          if ([...this.retainedPlacementRepairs.values()].some((attempt) => attempt.observations)) {
            this.ensureRetainedRepairDrain();
          }
        });
    },

    // One decision in flight per record and at most one reconsideration owed:
    // hints arriving during a decision are consumed after it settles.
    async redriveRetainedPlacementRepairs() {
      while (!this.isShuttingDownRequested()) {
        const attempts = [...this.retainedPlacementRepairs.values()]
          .filter((attempt) => attempt.observations);
        if (attempts.length === 0) return;
        for (const attempt of attempts) {
          while (attempt.decision.state === RUN.RUNNING) await attempt.decision.promise;
          if (!this.retainedRepairAttemptIsCurrent(attempt) || !attempt.observations) continue;
          const kinds = takeRepairObservations(attempt);
          await this.runRetainedRepairDecision(attempt, kinds);
        }
      }
    },

    observeRetainedPlacementRepairCommit(tableName, row) {
      for (const attempt of this.retainedPlacementRepairs.values()) {
        const kind = this.retainedRepairObservationKind(attempt, tableName, row);
        if (kind !== OBSERVATION.NONE) {
          this.wakeRetainedPlacementRepairs((candidate) => candidate === attempt, kind);
        }
      }
    },

    retainedRepairObservationKind(attempt, tableName, row) {
      if (ownRowObservation(attempt, tableName, row)) return OBSERVATION.OWN_ROW;
      if (routePublication(attempt, tableName, row)) return OBSERVATION.ROUTE;
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        if (attempt.custody.state === CUSTODY.DELEGATED) return OBSERVATION.NONE;
        return attempt.clearingTrigger === PLACEMENT_TRIGGER.LEADERSHIP_START ||
          attempt.clearingTrigger === PLACEMENT_TRIGGER.NODES_OR_FORMATION ?
          OBSERVATION.CLEARING : OBSERVATION.NONE;
      }
      const blockerCleared = attempt.blocker.kind === BLOCKER.OPERATIONS &&
        attempt.blocker.operations.some((blocker) =>
          blocker.operationId === row?.operation_id && !sameBlocker(row, blocker));
      const possiblyClearedWhilePending = (attempt.decision.state === RUN.RUNNING ||
        attempt.blocker.kind === BLOCKER.OCCUPANCY) && peerObservationMayClear(attempt, row);
      return blockerCleared || possiblyClearedWhilePending ?
        OBSERVATION.CLEARING : OBSERVATION.NONE;
    },

    // Local ledger leadership started: a refusal waiting for it may clear, and
    // every record's binding may now be the local service.
    observeRetainedLedgerLeadershipStart() {
      this.wakeRetainedPlacementRepairs((attempt) =>
        attempt.clearingTrigger === PLACEMENT_TRIGGER.LEADERSHIP_START, OBSERVATION.CLEARING);
      this.wakeRetainedPlacementRepairs(() => true, OBSERVATION.ROUTE);
    },

    // Receiver custody lives within one ledger tenure of one local service.
    // When that tenure ended (not leader, a later term, or shut down), an
    // ingress-only record is released with its continuation; a caller's record
    // keeps its obligation and rebinds at the next route publication. The
    // ledger replica's leadership-loss drive is the trigger (the placement
    // owner's setLeader(false)); a decision in flight is released when it
    // settles (releaseEndedRetainedTenure).
    retireEndedRetainedTenures(service) {
      for (const attempt of [...this.retainedPlacementRepairs.values()]) {
        if (holdsTenure(attempt, service)) this.releaseEndedRetainedTenure(attempt);
      }
    },

    releaseEndedRetainedTenure(attempt) {
      if (attempt.tenure.state !== TENURE.LEDGER || attempt.decision.state === RUN.RUNNING ||
          !this.retainedRepairAttemptIsCurrent(attempt) || !tenureEnded(attempt)) return;
      if (attempt.origin === ORIGIN.INGRESS) {
        this.retireRetainedRepair(attempt);
      } else {
        attempt.tenure = NO_TENURE;
        recordRepairObservation(attempt, OBSERVATION.ROUTE);
      }
    },

    bindRetainedPlacementRepairWake(service) {
      if (this.retainedPlacementRepairWakes.has(service)) return;
      const onCommit = (event) => {
        this.retireEndedRetainedTenures(service);
        // Q8: the pinned entry's own commit settles it from its committed
        // result, even when the answer that should have carried it is lost.
        this.wakeRetainedPlacementRepairs((attempt) =>
          pinnedEntryCommitted(attempt, event), OBSERVATION.ENTRY);
        this.wakeRetainedPlacementRepairs((attempt) =>
          commitClears(attempt, event, service), OBSERVATION.CLEARING);
      };
      const onReleased = () => {
        this.retainedPlacementRepairReleaseSequence += 1;
        this.retireEndedRetainedTenures(service);
        this.wakeRetainedPlacementRepairs((attempt) => releaseClears(attempt, service),
          OBSERVATION.CLEARING);
      };
      service.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, onCommit);
      service.on(PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED, onReleased);
      this.retainedPlacementRepairWakes.set(service, () => {
        service.off(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, onCommit);
        service.off(PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED, onReleased);
      });
    },

    unbindRetainedPlacementRepairWake(service) {
      this.retainedPlacementRepairWakes.get(service)?.();
      this.retainedPlacementRepairWakes.delete(service);
    },
  });
}

export {assignRetainedRepairWakeMethods, ledgerTerm};
