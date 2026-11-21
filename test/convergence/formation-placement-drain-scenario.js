// The placement drain of a fresh formation (quest
// replica-placement-admission-owner, design section 4.2): the joint-admission
// formation world (formation-joint-admission-world.js) with every placement
// decider mounted as the production composition builds it, driven with NO
// placement polling, and observed at the durable operation store.
//
// What changes against the joint-admission reproducer, and why:
//   - deciders: the joint-admission world mounts planners for the six
//     priority partitions only and polls them every round, so the background
//     wave never exists there. Here the tree's own composition is mounted on
//     the leader node of every entity, and nothing polls it: a decider plans
//     when its own production triggers fire. Which composition a tree has is
//     decided in this harness (the COMPOSITION section), never in src;
//   - time: as in the joint-admission world, no timer fires and the clock
//     moves one millisecond per evaluation instant. The platform clock is
//     pinned to the world clock (one clock, as in production): the
//     background placement path reads a READY lease against Date.now. The
//     execution cadences are stepped by name (formation-joint-admission-
//     rounds.js). The timers a placement decider arms stay armed; only the
//     timer probe fires them, earliest due first, and every operation
//     admitted while it runs is attributed to it;
//   - observation: every write to the durable REPLICA_OPERATIONS rows is
//     observed where the store applies it, so an admission is seen whichever
//     entry created it, and copy concurrency is sampled at every change.
//
// Phases of one run: FROZEN (formation and drain to a fixpoint with no
// placement timer firing), REDELIVERY (every terminal row delivered again),
// PROBE (the placement timers fired in due order, each followed by rounds to
// a fixpoint, until the drain is complete and one more step admitted
// nothing, or the cap), REDELIVERY again.
//
// Nothing here decides placement. The census below states the properties an
// owner must satisfy (design sections 2.5 to 2.7: one unresolved operation
// per entity, capacity per copy source and per target, ledger exclusivity,
// the formation gate, class order, fewest hosts first); it never plans.
//
// LIMITS: every node reads one shared row store (no replication lag). The
// replica runtime promotes every learner in one step, so admission
// concurrency is measured, not copy cost. The partition services'
// traffic-ready readiness transition is not hosted (this world has no
// lifecycle readiness state); on this tree its branch for an under-spread
// background partition arms a stagger timer, a placement timer here as
// everywhere. The timer probe does not move the clock: before it fires it
// ages the deciders' spacing windows (as the joint-admission driver does
// before it polls), and it never lets an execution bound expire. This world
// has no SQL engine for CREATE TABLE, so a user table's founding creates are
// not hosted here.

import Database from 'better-sqlite3';
import {EventEmitter} from 'node:events';
import {
  INITIAL_MESSAGE_GROUP_ID,
  REPLICA_OPERATIONS_SCHEMA,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {
  classifySystemPartition,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  resolveDesiredReplicationFactor,
} from '../../src/bootstrap/replication-target-authority.js';
import {
  CDC_OPERATION, COLUMN, SERVICE_STATUS, TABLES, WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {
  LEDGER_PARTITION_ID,
} from '../../src/partition/partition-placement-admission-decision.js';
import {
  applyPlacementCommand,
} from '../../src/partition/partition-placement-admission.js';
import {ControlPlaneSetup} from '../../src/bootstrap/shared/control-plane-setup.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {settledTurn} from '../../src/raft/raft-rs-turn-answer.js';
import {applyCommandThroughApplicationOwner, leadingLedgerStubFields} from
  '../test-helpers/controllable-consensus-port.js';
import {
  PARTITION_CDC_EVENT_BUILD_STATE,
} from '../../src/partition/partition-cdc-generator.js';
import {
  ensureCdcObligationLedger,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  committedStatementEntryKey,
  createCommittedStatementOutcomeTable,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  openParticipantTransactionStore,
  recordPartitionWriteOrigin,
} from '../../src/partition/partition-participant-transaction-store.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {
  runtimeBuildProvenance,
} from '../../src/diagnostics/runtime-build-provenance.js';
import {
  readParticipantReleaseFacts,
  resumeParticipantCutoverAdmission,
} from '../../src/partition/partition-participant-transaction-pause.js';
import {
  releaseIdentityOf,
} from '../../src/partition/partition-participant-release-contract.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
} from '../../src/raft/raft-committed-membership-constants.js';
import {
  deriveRaftRsPeerId,
} from '../../src/raft/raft-rs-peer-identity.js';
import {
  raftRsConfStateKey,
} from '../../src/raft/raft-rs-conf-state-key.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  PLACEMENT_COPY_CAPACITY,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {createRoundDriver} from './formation-joint-admission-rounds.js';
import {
  applyEvent,
  createObserver,
  isSpreadPublished,
  worldDigest,
} from './formation-joint-admission-scenario.js';
import {
  WORLD_START_MS,
  createFormationWorld,
} from './formation-joint-admission-world.js';

// The capacity the owner must respect (design section 2.11, recommendation
// D2): unresolved copy-phase operations per copy-source node and per target.
const {K_SRC, K_TGT} = PLACEMENT_COPY_CAPACITY;
// From admission until the learner is voter-ready (design section 2.5).
const COPY_PHASE_STEPS = new Set([
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
  WORKFLOW_STEP.SYNCING,
]);
const COPY_OPERATION_TYPES = new Set([OperationType.ADD, OperationType.REPLACE]);
// The admission order (design section 2.6): the ledger, the other priority
// control-plane partitions, then after the published formation fact the
// formation dependency (nodes-p1), the other system partitions, user
// partitions.
const PLACEMENT_CLASS = Object.freeze({
  LEDGER: 1,
  PRIORITY: 2,
  FORMATION_DEPENDENCY: 3,
  SYSTEM: 4,
  USER: 5,
});
const FIRST_FORMATION_GATED_CLASS = PLACEMENT_CLASS.FORMATION_DEPENDENCY;
// Whether a spread move may use every source slot or leaves one for repair
// is open (design D2; sections 2.5 and 2.10 read both ways). The order
// census counts a spread candidate as admissible only below the stricter
// reading, so an owner of either reading is never reported out of order.
const SPREAD_SOURCE_CAPACITY = K_SRC - 1;
const IDLE_EXAMPLE_LIMIT = 6;
const VOTER_READY_FLOOR = 3;
const SYNCING_SERVICE_STATUS = 'syncing';
const ROUND_CAP = 160;
const REDELIVERY_ROUNDS = 3;
const TIMER_PROBE_CAP = 400;
const INJECTED_CREATE_FAILURE = 'injected_replica_create_failure';
const QUIET_LOGGER = Object.freeze({
  debug() {}, info() {}, warn() {}, error() {},
  child() {
    return QUIET_LOGGER;
  },
});

// The driver steps every admission is attributed to.
const STEP = Object.freeze({
  SEED_FORMATION: 'seed-formation',
  EVENT: 'event',
  READY_SIGNALS: 'ready-signals',
  MEMBERSHIP_TICK: 'membership-tick',
  AUTHORITY_READ: 'authority-read',
  PLANNER_POLL: 'planner-poll',
  COORDINATOR_TICK: 'coordinator-tick',
  COMMIT_DELIVERY: 'commit-delivery',
  EXECUTION_RETRY: 'execution-retry-cadences',
  TERMINAL_REDELIVERY: 'terminal-redelivery',
  PLACEMENT_TIMER: 'placement-timer',
});
// An admission made while the driver polled a decider or fired a timer a
// decider armed is caused by that poll or timer, not by a committed change.
// The execution cadences are the workflow owner's, not placement mechanisms
// (quest constraint no-timer-no-bound-no-retry): an admission in one of them
// answers the commit that cadence produced.
const TIMER_OR_POLL_STEPS = new Set([STEP.PLANNER_POLL, STEP.PLACEMENT_TIMER]);
const DRIVER_STEP_METHODS = Object.freeze({
  formSeed: STEP.SEED_FORMATION,
  joinerArrives: STEP.EVENT,
  seedLinkTo: STEP.EVENT,
  membershipDerivation: STEP.MEMBERSHIP_TICK,
  readSeedAuthority: STEP.AUTHORITY_READ,
  planPriorityPartitions: STEP.PLANNER_POLL,
  evaluateCoordinators: STEP.COORDINATOR_TICK,
  stepReplicaRuntime: STEP.COMMIT_DELIVERY,
  stepRetryCadences: STEP.EXECUTION_RETRY,
});

// ---------------------------------------------------------------------------
// COMPOSITION: the tree's placement deciders (the one seam a cutover changes).
// ---------------------------------------------------------------------------

// Timers a placement decider of this tree arms, by arming site.
const PLACEMENT_TIMER_SITES = Object.freeze([
  'src/rebalancer/replica-placement-owner.js',
]);

function isPlacementTimer(timer) {
  return PLACEMENT_TIMER_SITES.some((site) => timer.armedBy.startsWith(site));
}

const LEDGER_STORE_BY_CACHE = new WeakMap();

function getOrCreateSimulatedLedgerStore(cache) {
  const existing = LEDGER_STORE_BY_CACHE.get(cache);
  if (existing && existing.db.open) return existing;
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  for (const indexSql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) {
    db.exec(indexSql);
  }
  createCommittedStatementOutcomeTable(db);
  openParticipantTransactionStore(db);
  recordPartitionWriteOrigin(db, {index: 1, term: 1});
  ensureCdcObligationLedger(db);
  const columns = REPLICA_OPERATIONS_SCHEMA.columns.map((c) => c.name);
  const placeholders = columns.map(() => '?').join(', ');
  const upsertStmt = db.prepare(
    `INSERT OR REPLACE INTO ${REPLICA_OPERATIONS_SCHEMA.tableName} ` +
      `(${columns.join(', ')}) VALUES (${placeholders})`,
  );
  const deleteStmt = db.prepare(
    `DELETE FROM ${REPLICA_OPERATIONS_SCHEMA.tableName} WHERE operation_id = ?`,
  );
  const bindVal = (v) => (typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);
  const syncRowToDb = (row) => {
    if (!row || !row[COLUMN.OPERATION_ID]) return;
    upsertStmt.run(...columns.map((col) => bindVal(row[col])));
  };
  for (const existingRow of cache.getAll(TABLES.REPLICA_OPERATIONS)) {
    syncRowToDb(existingRow);
  }
  const store = {
    db,
    logIndex: 1,
    applyingPlacementCommand: false,
  };
  cache.onCacheApplyChange((tableName, operation, row) => {
    if (tableName !== TABLES.REPLICA_OPERATIONS || store.applyingPlacementCommand) return;
    if (operation === CDC_OPERATION.DELETE) {
      if (row?.[COLUMN.OPERATION_ID]) deleteStmt.run(row[COLUMN.OPERATION_ID]);
    } else {
      syncRowToDb(row);
    }
  });
  LEDGER_STORE_BY_CACHE.set(cache, store);
  return store;
}

function createSimulatedLedgerPartitionService({seedHosts, cache}) {
  const store = getOrCreateSimulatedLedgerStore(cache);
  const {db} = store;
  const emitter = new EventEmitter();
  const pendingOutcomes = new Map();
  const commitWaiters = new Map();

  const replicaId = `${LEDGER_PARTITION_ID}-r1`;
  const peerId = deriveRaftRsPeerId(replicaId);
  const confState = Object.freeze({
    voters: [peerId],
    votersOutgoing: [],
    learners: [],
    learnersNext: [],
  });
  const configurationKey = raftRsConfStateKey(confState);
  const identities = Object.freeze({[peerId]: replicaId});
  const leadership = leadingLedgerStubFields();

  const service = Object.assign(emitter, {
    partitionId: LEDGER_PARTITION_ID,
    tableName: REPLICA_OPERATIONS_SCHEMA.tableName,
    replicaId,
    replicaIds: [
      replicaId,
      `${LEDGER_PARTITION_ID}-r2`,
      `${LEDGER_PARTITION_ID}-r3`,
    ],
    nodeId: seedHosts.nodeId,
    db,
    initialized: true,
    proposalQueue: {size: 0},
    pendingWriteOutcomes: pendingOutcomes,
    systemTableCache: cache,
    rebalanceCoordinator: seedHosts.rebalanceCoordinator,
    timeSource: {
      now: seedHosts.now,
      setTimeout: (fn, ms) => seedHosts.setTimeoutFn(fn, ms),
      // The placement owner's resync timer, on the host's virtual time.
      setInterval: (fn, ms) => seedHosts.setIntervalFn(fn, ms),
      clearInterval: (handle) => seedHosts.clearIntervalFn(handle),
    },
    hlcClock: {now: () => `${seedHosts.now()}:0:${seedHosts.nodeId}`},
    logger: QUIET_LOGGER,
    cdcPipelineMetrics: {increment() {}},
    isLeader: false,
    isShutdown: false,
    hasKnownRemoteLeaderWitness: () => false,
    trackPendingCDCEvent() {},
    cdcDelivery: {
      driveCdcObligations: async () => {},
    },
    getCommittedEntryKey: (command) => committedStatementEntryKey(command),
    getPendingCommittedWriteOutcome: (entryId) =>
      pendingOutcomes.get(entryId) ?? null,
    setPendingCommittedWriteOutcome: (entryId, promise) => {
      pendingOutcomes.set(entryId, promise);
      promise.finally(() => {
        if (pendingOutcomes.get(entryId) === promise) {
          pendingOutcomes.delete(entryId);
        }
      }).catch(() => {});
    },
    waitForCommittedWrite: (entryId) => {
      const {promise, resolve, reject} = Promise.withResolvers();
      commitWaiters.set(entryId, {resolve, reject});
      return promise;
    },
    markCommittedWriteProposal: () => true,
    recordWritePhaseDuration: () => {},
    applyWriteSideEffectPlan: async () => {},
    syncCDCGeneratorDependencies: () => ({
      buildEvent: ({type, tableName, data, whereClause, entryId, timestamp}) => ({
        state: PARTITION_CDC_EVENT_BUILD_STATE.BUILT,
        cdcEvent: {
          type,
          tableName,
          operation:
            type === PARTITION_SERVICE_OPERATION.INSERT ?
              CDC_OPERATION.INSERT :
              CDC_OPERATION.UPDATE,
          data,
          whereClause,
          entryId,
          timestamp,
        },
      }),
    }),
    resolveCommittedWrite: (entryId, answer) => {
      const waiter = commitWaiters.get(entryId);
      commitWaiters.delete(entryId);
      waiter?.resolve(answer);
    },
    rejectCommittedWrite: (entryId, error) => {
      const waiter = commitWaiters.get(entryId);
      commitWaiters.delete(entryId);
      waiter?.reject(error);
    },
    leadershipTenure: leadership.leadershipTenure,
    raft: {
      subscribe: leadership.raft.subscribe,
      readStatus: () => ({
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        role: service.isLeader ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
        currentTermApplied: service.isLeader === true,
        term: 1,
        leaderId: replicaId,
        leaderAddress: seedHosts.nodeId,
        configurationKey,
        membershipGenerationIndex: 1,
        appliedIndex: store.logIndex,
        commitIndex: store.logIndex,
        lastIndex: store.logIndex,
        runtimeGeneration: 1,
        lifecycleIncarnation: 1,
        confChangePending: false,
        peers: [],
      }),
      readCommittedMembership: async () => ({
        kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
        ...confState,
        identities,
        appliedIndex: store.logIndex,
        commitIndex: store.logIndex,
        configurationKey,
        membershipGenerationIndex: 1,
        term: 1,
        leaderId: replicaId,
        gateOpen: true,
      }),
      propose: (entry) => {
        store.logIndex += 1;
        store.applyingPlacementCommand = true;
        try {
          applyCommandThroughApplicationOwner({
            database: db,
            groupId: LEDGER_PARTITION_ID,
            index: store.logIndex,
            term: 1,
            command: entry,
            applyCommittedEntry: (committed) =>
              applyPlacementCommand(service, {
                command: committed.command,
                index: committed.index,
                term: committed.term,
                afterCommit: (fn) => committed.effects.afterCommit.push(fn),
                afterRollback: (fn) => committed.effects.afterRollback.push(fn),
              }),
          });
        } finally {
          store.applyingPlacementCommand = false;
        }
        return settledTurn(Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK}));
      },
    },
    rebalancerLeadershipSink: null,
    replicaPlacementOwnerAttachment: null,
    resolveRebalancerLeadership() {
      return Boolean(this.isLeader && !this.isShutdown);
    },
    driveRebalancerLeadershipSink:
      PartitionService.prototype.driveRebalancerLeadershipSink,
    setRebalancerLeadershipSink:
      PartitionService.prototype.setRebalancerLeadershipSink,
    ensureReplicaPlacementOwnerAttached:
      PartitionService.prototype.ensureReplicaPlacementOwnerAttached,
    close: () => {},
  });

  return {service};
}

/**
 * Mount the placement decider of a starting seed as this tree's production
 * composition builds it: one ReplicaPlacementOwner attached by
 * PartitionService.prototype.ensureReplicaPlacementOwnerAttached on
 * replica_operations-p1, using the real requestPlacementAdmission /
 * requestPlacementHoldRelease -> write kernel -> proposal codec ->
 * RaftRsApplicationTransactionOwner path.
 * @param {object} mount
 * @param {object} mount.seedHosts the seed's real owners
 * @param {object} mount.clock the world clock
 * @param {object} mount.cache the durable row store
 * @return {Map<string, object>} the deciders by entity id
 */
async function resumeSimulatedLedgerCutoverAdmission(service) {
  const handler = {
    nodeId: service.nodeId,
    ownerIncarnation: 1,
    shuttingDown: false,
    localServices: new Map([[service.replicaId, service]]),
  };
  const facts = await readParticipantReleaseFacts(handler, service);
  if (facts.outcome !== PARTICIPANT_CUTOVER_OUTCOME.OBSERVED) {
    throw new Error(`Simulated ledger facts unavailable: ${JSON.stringify(facts)}`);
  }
  const release = releaseIdentityOf({
    partitionId: service.partitionId,
    targetBuildDigest: facts.buildDigest,
    configurationKey: facts.membership.configurationKey,
    membershipGenerationIndex: facts.membership.membershipGenerationIndex,
  });
  const outcome = await resumeParticipantCutoverAdmission(handler, service, {
    release,
    census: [facts],
  });
  if (outcome !== PARTICIPANT_CUTOVER_OUTCOME.RESUMED) {
    throw new Error(`Simulated ledger cutover release refused: ${outcome}`);
  }
}

function mountPlacementDeciders({seedHosts, cache}) {
  const {service} = createSimulatedLedgerPartitionService({seedHosts, cache});
  // The seed's coordinator gets the production factory as
  // ControlPlaneSetup.create binds it (the hosts build the coordinator
  // without the setup); the attach below goes through it.
  seedHosts.rebalanceCoordinator.bindReplicaPlacementOwnerFactory(
    ControlPlaneSetup.createReplicaPlacementOwnerFactory({
      nodeId: seedHosts.nodeId,
      controlPlaneReadinessService: seedHosts.controlPlaneReadinessService,
      rebalanceCoordinator: seedHosts.rebalanceCoordinator,
      systemTableCache: seedHosts.rebalanceCoordinator.systemTableCache,
      storageAccountingService: seedHosts.storageAccountingService,
    }));
  service.ensureReplicaPlacementOwnerAttached();
  service.isLeader = true;
  void resumeSimulatedLedgerCutoverAdmission(service);
  const attachment = service.replicaPlacementOwnerAttachment;
  const {owner} = attachment;
  owner.shutdown = () => {
    attachment.detach();
    service.close();
  };
  return new Map([[LEDGER_PARTITION_ID, owner]]);
}

function elapseDeciderWindows(_deciders) {}

// ---------------------------------------------------------------------------
// CENSUS of the durable rows (properties, never planning).
// ---------------------------------------------------------------------------

function isUnresolved(row) {
  return row.completed_at === null || row.completed_at === undefined;
}

function isMessageGroupOperation(row) {
  return row[COLUMN.ENTITY_TYPE] === EntityType.MESSAGE_GROUP ||
    row[COLUMN.PARTITION_ID] === INITIAL_MESSAGE_GROUP_ID;
}

function placementClassOf(partitionId) {
  const classification = classifySystemPartition({partitionId});
  if (classification.operationLedger) return PLACEMENT_CLASS.LEDGER;
  if (classification.priorityControlPlane) return PLACEMENT_CLASS.PRIORITY;
  if (classification.formationLivenessDependency) {
    return PLACEMENT_CLASS.FORMATION_DEPENDENCY;
  }
  return classification.systemTable ?
    PLACEMENT_CLASS.SYSTEM : PLACEMENT_CLASS.USER;
}

function readyNodeIds(world) {
  const now = world.clock.now();
  return new Set(world.cache.getAll(TABLES.NODES)
    .filter((row) => isNodeRecordReady(row, {now}))
    .map((row) => row[COLUMN.NODE_ID]));
}

function partitionLeaderOf(world, partitionId) {
  return world.cache.get(TABLES.PARTITIONS, partitionId)?.[
    COLUMN.LEADER_NODE_ID] || null;
}

function isCopyPhase(row) {
  return isUnresolved(row) &&
    COPY_OPERATION_TYPES.has(row.type) &&
    COPY_PHASE_STEPS.has(row.workflow_step);
}

// Unresolved copy-phase operations per copy source and per target. The copy
// source of an operation is the partition's leader node when its CREATE was
// sent (recorded at the replica runtime boundary), and the current leader
// before that.
function copyOccupancy(world, copySources, excludeOperationId = null) {
  const bySource = {};
  const byTarget = {};
  for (const row of world.cache.getAll(TABLES.REPLICA_OPERATIONS)) {
    const operationId = row[COLUMN.OPERATION_ID];
    if (operationId === excludeOperationId || !isCopyPhase(row)) continue;
    const source = copySources.get(operationId) ||
      partitionLeaderOf(world, row[COLUMN.PARTITION_ID]);
    const target = row[COLUMN.TARGET_NODE_ID];
    bySource[source] = (bySource[source] || 0) + 1;
    byTarget[target] = (byTarget[target] || 0) + 1;
  }
  return {bySource, byTarget};
}

function unresolvedByPartition(world, excludeOperationId = null) {
  const byPartition = new Map();
  for (const row of world.cache.getAll(TABLES.REPLICA_OPERATIONS)) {
    if (!isUnresolved(row) ||
        row[COLUMN.OPERATION_ID] === excludeOperationId) {
      continue;
    }
    const partitionId = row[COLUMN.PARTITION_ID];
    byPartition.set(partitionId,
      [...(byPartition.get(partitionId) || []), row[COLUMN.OPERATION_ID]]);
  }
  return byPartition;
}

function isVoterRow(row) {
  return row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER ||
    row[COLUMN.RAFT_ROLE] === RAFT_ROLE.FOLLOWER;
}

// Every partition's placement against its declared RF on READY nodes.
function partitionPlacement(world) {
  const ready = readyNodeIds(world);
  const rowsByPartition = new Map();
  for (const row of world.cache.getAll(TABLES.SERVICES)) {
    const partitionId = row[COLUMN.PARTITION_ID];
    if (!partitionId) continue;
    rowsByPartition.set(partitionId,
      [...(rowsByPartition.get(partitionId) || []), row]);
  }
  const placements = [];
  for (const partition of world.cache.getAll(TABLES.PARTITIONS)) {
    const partitionId = partition[COLUMN.PARTITION_ID];
    const declared = resolveDesiredReplicationFactor(partition)
      .replicationFactor;
    const rows = rowsByPartition.get(partitionId) || [];
    const readyVoterRows = rows.filter((row) =>
      ready.has(row[COLUMN.NODE_ID]) && isVoterRow(row));
    const voterNodeIds = new Set(readyVoterRows
      .filter((row) => row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE)
      .map((row) => row[COLUMN.NODE_ID]));
    const required = Math.min(declared, ready.size);
    placements.push({
      partitionId,
      placementClass: placementClassOf(partitionId),
      required,
      distinctReadyVoterNodes: voterNodeIds.size,
      voterReady: readyVoterRows.filter((row) =>
        row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE ||
        row[COLUMN.STATUS] === SYNCING_SERVICE_STATUS).length,
      replicas: rows.length,
      hostingNodeIds: new Set(rows.map((row) => row[COLUMN.NODE_ID])),
      leaderNodeId: partition[COLUMN.LEADER_NODE_ID],
      spreadDeficit: voterNodeIds.size < required,
      surplus: rows.length > declared,
    });
  }
  return placements.sort((left, right) =>
    left.partitionId.localeCompare(right.partitionId));
}

// The copy candidates an owner could admit now: a partition below its
// spread, with no unresolved operation, of a class the formation gate
// admits, while the ledger admits it, whose copy source is below K_SRC and
// with a READY target that does not host it and is below K_TGT.
function admissibleCopyCandidates(world, copySources, excludeOperationId) {
  const formed = isSpreadPublished(world);
  const unresolved = unresolvedByPartition(world, excludeOperationId);
  const ledgerBusy = [...unresolved.keys()].some((partitionId) =>
    placementClassOf(partitionId) === PLACEMENT_CLASS.LEDGER);
  const ready = readyNodeIds(world);
  const occupancy = copyOccupancy(world, copySources, excludeOperationId);
  const candidates = [];
  for (const placement of partitionPlacement(world)) {
    if (!placement.spreadDeficit ||
        unresolved.has(placement.partitionId) ||
        ledgerBusy ||
        (placement.placementClass === PLACEMENT_CLASS.LEDGER &&
          unresolved.size > 0) ||
        (placement.placementClass >= FIRST_FORMATION_GATED_CLASS && !formed)) {
      continue;
    }
    const source = placement.leaderNodeId;
    if ((occupancy.bySource[source] || 0) >= SPREAD_SOURCE_CAPACITY) continue;
    const targets = [...ready].filter((nodeId) =>
      !placement.hostingNodeIds.has(nodeId) &&
      (occupancy.byTarget[nodeId] || 0) < K_TGT);
    if (targets.length === 0) continue;
    candidates.push({
      partitionId: placement.partitionId,
      placementClass: placement.placementClass,
      distinctHosts: placement.distinctReadyVoterNodes,
      source,
    });
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// INSTRUMENTATION.
// ---------------------------------------------------------------------------

function createStepTracker(world, driver, afterStep) {
  const stack = [];
  const tracker = {
    current: () => stack[stack.length - 1] || STEP.EVENT,
    async within(step, run) {
      stack.push(step);
      try {
        return await run();
      } finally {
        stack.pop();
        afterStep(step);
      }
    },
  };
  for (const [method, step] of Object.entries(DRIVER_STEP_METHODS)) {
    const original = driver[method].bind(driver);
    driver[method] = (...args) => tracker.within(step, () => original(...args));
  }
  return tracker;
}

function seedSingleVoterFounding(world) {
  for (const row of world.cache.getAll(TABLES.SERVICES)) {
    if (!row[COLUMN.PARTITION_ID]) continue;
    if (row[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER) {
      world.cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.DELETE,
        row,
      );
    }
  }
}

function seedThreeVoterFounding(world) {
  const existingByPartition = new Map();
  for (const row of world.cache.getAll(TABLES.SERVICES)) {
    const partitionId = row[COLUMN.PARTITION_ID];
    if (!partitionId) continue;
    const list = existingByPartition.get(partitionId) || [];
    list.push(row);
    existingByPartition.set(partitionId, list);
  }
  for (const [partitionId, rows] of existingByPartition.entries()) {
    if (rows.length >= 3) continue;
    const leaderRow = rows[0];
    for (const ordinal of [2, 3]) {
      const replicaId = `${partitionId}-r${ordinal}`;
      if (rows.some((r) => r[COLUMN.REPLICA_ID] === replicaId)) continue;
      world.cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.INSERT,
        {
          ...leaderRow,
          [COLUMN.SERVICE_ID]: replicaId,
          [COLUMN.REPLICA_ID]: replicaId,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        },
      );
    }
  }
}

function stepSingleVoterLearnerCatchUp(world) {
  const nowMs = world.clock.now();
  const syncingLearners = world.cache.getAll(TABLES.SERVICES)
    .filter((row) =>
      row[COLUMN.PARTITION_ID] &&
      row[COLUMN.STATUS] === SYNCING_SERVICE_STATUS &&
      row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEARNER);
  for (const row of syncingLearners) {
    const replicaId = row[COLUMN.REPLICA_ID];
    world.cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPDATE,
      {
        ...row,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
      },
    );
    const opRow = world.cache.getAll(TABLES.REPLICA_OPERATIONS)
      .find((candidate) =>
        isUnresolved(candidate) &&
        candidate.type === OperationType.ADD &&
        candidate[COLUMN.REPLICA_ID] === replicaId);
    if (opRow) {
      const history = typeof opRow.steps_history === 'string' && opRow.steps_history.length > 0 ?
        JSON.parse(opRow.steps_history) : [];
      const nextHistory = [...history, {step: WORKFLOW_STEP.ACTIVE, timestamp: nowMs}];
      world.cache.applySystemTableChange(
        TABLES.REPLICA_OPERATIONS,
        CDC_OPERATION.UPDATE,
        {
          ...opRow,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          workflow_step: WORKFLOW_STEP.ACTIVE,
          updated_at: nowMs,
          completed_at: nowMs,
          steps_history: JSON.stringify(nextHistory),
        },
      );
    }
  }
}

function answerProposeGrowthPromote(world, nodeId, payload) {
  const operationId = payload?.[ReplicaOperationField.OPERATION_ID] || null;
  const partitionId = payload?.[ReplicaOperationField.PARTITION_ID] || null;
  const leaderNodeId = partitionLeaderOf(world, partitionId);
  if (!partitionId || nodeId !== leaderNodeId) {
    return {
      status: ReplicaOperationResponseStatus.INITIATED,
      [ReplicaOperationField.PROPOSAL]: Object.freeze({
        outcome: 'core_refused',
        reason: 'not_leader',
        retryable: true,
        operationId,
      }),
      committedVotersReached: false,
      partitionId,
      nodeId,
    };
  }
  const promoteIds = Array.isArray(
    payload?.[ReplicaOperationField.PROMOTE_REPLICA_IDS],
  ) && payload[ReplicaOperationField.PROMOTE_REPLICA_IDS].length > 0 ?
    payload[ReplicaOperationField.PROMOTE_REPLICA_IDS] :
    [
      payload?.[ReplicaOperationField.REPLICA_ID],
      payload?.[ReplicaOperationField.SOURCE_REPLICA_ID],
    ].filter(Boolean);
  if (promoteIds.length === 0) {
    return {
      status: ReplicaOperationResponseStatus.INITIATED,
      [ReplicaOperationField.PROPOSAL]: Object.freeze({
        outcome: 'core_refused',
        reason: 'multi_change_shape_refused',
        retryable: false,
        operationId,
      }),
      committedVotersReached: false,
      partitionId,
      nodeId,
    };
  }
  const serviceRows = promoteIds.map((replicaId) =>
    world.cache.get(TABLES.SERVICES, replicaId));
  if (serviceRows.some((row) => !row || row[COLUMN.PARTITION_ID] !== partitionId)) {
    return {
      status: ReplicaOperationResponseStatus.INITIATED,
      [ReplicaOperationField.PROPOSAL]: Object.freeze({
        outcome: 'core_refused',
        reason: 'not_learner',
        retryable: false,
        operationId,
      }),
      committedVotersReached: false,
      partitionId,
      nodeId,
    };
  }
  if (serviceRows.some((row) => row[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE)) {
    return {
      status: ReplicaOperationResponseStatus.INITIATED,
      [ReplicaOperationField.PROPOSAL]: Object.freeze({
        outcome: 'core_refused',
        reason: 'promotion_progress_behind',
        retryable: true,
        operationId,
      }),
      committedVotersReached: false,
      partitionId,
      nodeId,
    };
  }
  for (const row of serviceRows) {
    if (row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEARNER) {
      world.cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPDATE,
        {
          ...row,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
        },
      );
    }
  }
  return {
    status: ReplicaOperationResponseStatus.INITIATED,
    [ReplicaOperationField.PROPOSAL]: Object.freeze({
      outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
      operationId,
      promotedReplicaIds: Object.freeze([...promoteIds]),
    }),
    committedVotersReached: true,
    partitionId,
    nodeId,
  };
}

// The replica runtime boundary: the copy source of every CREATE, read from
// the leader fixture when the CREATE arrives; and, when a scenario asks for
// it, the first CREATE of one partition fails as the replica handler reports
// a failed create (REPLICA_CREATE_FAILED to its own node's coordinator, an
// error answer): no learner is registered, so membership is unchanged.
function instrumentReplicaRuntime(
  world,
  {failFirstCreateOf = null, singleVoterFounding = false} = {},
) {
  const copySources = new Map();
  const injected = {failure: null};
  const answer = world.replicaRuntime.answer.bind(world.replicaRuntime);
  world.replicaRuntime.answer = (nodeId, payload) => {
    const operationId = payload?.[ReplicaOperationField.OPERATION_ID];
    const partitionId = payload?.[ReplicaOperationField.PARTITION_ID];
    const messageType = payload?.[ReplicaOperationField.TYPE];
    if (messageType === ReplicaOperationMessageType.PROPOSE_GROWTH_PROMOTE) {
      return answerProposeGrowthPromote(world, nodeId, payload);
    }
    const isCreate = messageType ===
      ReplicaOperationMessageType.CREATE_REPLICA;
    if (isCreate && operationId && !copySources.has(operationId)) {
      copySources.set(operationId, partitionLeaderOf(world, partitionId));
    }
    if (isCreate && failFirstCreateOf === partitionId &&
        (injected.failure === null ||
          injected.failure.operationId === operationId)) {
      injected.failure = {operationId, partitionId, nodeId};
      world.hostsById.get(nodeId).rebalanceCoordinator.executorOutcomeEmitter
        .emitOutcome(EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
          operationId, WORKFLOW_STEP.FAILED, {
            replicaId: payload[ReplicaOperationField.REPLICA_ID],
            partitionId,
            errorCode: INJECTED_CREATE_FAILURE,
            errorMessage: INJECTED_CREATE_FAILURE,
          });
      return {status: ReplicaOperationResponseStatus.ERROR,
        error: INJECTED_CREATE_FAILURE};
    }
    return answer(nodeId, payload);
  };
  if (singleVoterFounding) {
    const baseStep = world.replicaRuntime.step.bind(world.replicaRuntime);
    world.replicaRuntime.step = () => {
      stepSingleVoterLearnerCatchUp(world);
      baseStep();
    };
  }
  return {copySources, injected};
}

function exceedances(counts, limit, side) {
  return Object.entries(counts).filter(([, count]) => count > limit)
    .map(([nodeId, count]) => ({side, nodeId, count}));
}

function admissionRecord(world, ledger, copySources, row, where) {
  const operationId = row[COLUMN.OPERATION_ID];
  const partitionId = row[COLUMN.PARTITION_ID];
  const placementClass = placementClassOf(partitionId);
  const others = unresolvedByPartition(world, operationId);
  const waiting = admissibleCopyCandidates(world, copySources, operationId);
  const own = partitionPlacement(world)
    .find((placement) => placement.partitionId === partitionId);
  const targetNodeId = row[COLUMN.TARGET_NODE_ID] || null;
  return {
    seq: ledger.admissions.length + 1,
    ...where,
    operationId,
    type: row.type,
    partitionId,
    placementClass,
    messageGroup: isMessageGroupOperation(row),
    targetNodeId,
    targetReady: COPY_OPERATION_TYPES.has(row.type) ?
      readyNodeIds(world).has(targetNodeId) : null,
    formed: isSpreadPublished(world),
    distinctHosts: own ? own.distinctReadyVoterNodes : null,
    unresolvedOnPartition: others.get(partitionId) || [],
    ledgerUnresolved: [...others.entries()]
      .filter(([candidate]) =>
        placementClassOf(candidate) === PLACEMENT_CLASS.LEDGER)
      .flatMap(([, operationIds]) => operationIds),
    anyUnresolved: [...others.values()].flat(),
    higherClassWaiting: waiting
      .filter((candidate) => candidate.placementClass < placementClass)
      .map((candidate) => candidate.partitionId),
    // Within a class (design section 2.6) a spread copy precedes any other
    // kind, and among spread copies the fewest distinct hosts go first.
    sameClassEarlierWaiting: waiting
      .filter((candidate) => candidate.placementClass === placementClass &&
        (!COPY_OPERATION_TYPES.has(row.type) || !own ||
          candidate.distinctHosts < own.distinctReadyVoterNodes))
      .map((candidate) => candidate.partitionId),
  };
}

// Every change of a durable REPLICA_OPERATIONS row, observed where the
// store applies it.
function observeLedger(world, driver, tracker, copySources) {
  const ledger = {
    admissions: [],
    series: [],
    maxBySource: {},
    maxByTarget: {},
    capacityViolations: [],
    laneViolations: [],
    failedOperations: new Map(),
  };
  const seen = new Set();
  let lastSeriesKey = null;
  const where = () => ({round: driver.roundCounter.number,
    step: tracker.current()});
  const sample = () => {
    const occupancy = copyOccupancy(world, copySources);
    for (const [nodeId, count] of Object.entries(occupancy.bySource)) {
      ledger.maxBySource[nodeId] =
        Math.max(ledger.maxBySource[nodeId] || 0, count);
    }
    for (const [nodeId, count] of Object.entries(occupancy.byTarget)) {
      ledger.maxByTarget[nodeId] =
        Math.max(ledger.maxByTarget[nodeId] || 0, count);
    }
    for (const over of [
      ...exceedances(occupancy.bySource, K_SRC, 'source'),
      ...exceedances(occupancy.byTarget, K_TGT, 'target'),
    ]) {
      ledger.capacityViolations.push({...over, ...where()});
    }
    for (const [partitionId, operationIds] of unresolvedByPartition(world)) {
      if (operationIds.length > 1) {
        ledger.laneViolations.push({partitionId, operationIds, ...where()});
      }
    }
    const key = JSON.stringify(occupancy);
    if (key !== lastSeriesKey) {
      lastSeriesKey = key;
      ledger.series.push({...where(), ...occupancy});
    }
  };
  const apply = world.cache.applySystemTableChange.bind(world.cache);
  world.cache.applySystemTableChange = (tableName, operation, data, options) => {
    const result = apply(tableName, operation, data, options);
    if (tableName !== TABLES.REPLICA_OPERATIONS) return result;
    const operationId = data?.[COLUMN.OPERATION_ID];
    const row = operationId ?
      world.cache.get(TABLES.REPLICA_OPERATIONS, operationId) : null;
    if (row && !seen.has(operationId)) {
      seen.add(operationId);
      ledger.admissions.push(
        admissionRecord(world, ledger, copySources, row, where()));
    }
    if (row?.workflow_step === WORKFLOW_STEP.FAILED &&
        !ledger.failedOperations.has(operationId)) {
      ledger.failedOperations.set(operationId, {
        type: row.type,
        partitionId: row[COLUMN.PARTITION_ID],
        targetNodeId: row[COLUMN.TARGET_NODE_ID] || null,
        admissionsBefore: ledger.admissions.length,
        ...where(),
      });
    }
    sample();
    return result;
  };
  return ledger;
}

// The voter-ready floor of every partition (ACTIVE or SYNCING voter rows on
// READY nodes), checked after every driver step: no removal takes a
// partition below min(VOTER_READY_FLOOR, the count it started from).
function createFloorWatch(world, {singleVoterFounding = false} = {}) {
  const baseline = new Map();
  const violations = [];
  const evenVoterViolations = [];
  const colocationViolations = [];
  return {
    violations,
    evenVoterViolations,
    colocationViolations,
    check(step) {
      for (const placement of partitionPlacement(world)) {
        if (!baseline.has(placement.partitionId)) {
          baseline.set(placement.partitionId, placement.voterReady);
        }
        const floor = Math.min(VOTER_READY_FLOOR,
          baseline.get(placement.partitionId));
        if (placement.voterReady < floor) {
          violations.push({step, partitionId: placement.partitionId,
            voterReady: placement.voterReady});
        }
      }
      if (!singleVoterFounding) return;
      const rowsByPartition = new Map();
      for (const row of world.cache.getAll(TABLES.SERVICES)) {
        const partitionId = row[COLUMN.PARTITION_ID];
        if (!partitionId) continue;
        const list = rowsByPartition.get(partitionId) || [];
        list.push(row);
        rowsByPartition.set(partitionId, list);
      }
      for (const [partitionId, rows] of rowsByPartition.entries()) {
        const activeVoters = rows.filter((row) =>
          row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE && isVoterRow(row));
        if (activeVoters.length > 0 && activeVoters.length % 2 === 0) {
          evenVoterViolations.push({
            step,
            partitionId,
            voterCount: activeVoters.length,
          });
        }
        const nodes = rows.map((row) => row[COLUMN.NODE_ID]);
        if (new Set(nodes).size < nodes.length) {
          colocationViolations.push({
            step,
            partitionId,
            nodes,
          });
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// THE RUN.
// ---------------------------------------------------------------------------

function drainDigest(driver, world) {
  return JSON.stringify({
    world: worldDigest(driver),
    services: world.cache.getAll(TABLES.SERVICES)
      .map((row) => `${row[COLUMN.REPLICA_ID]}:${row[COLUMN.NODE_ID]}:` +
        `${row[COLUMN.STATUS]}:${row[COLUMN.RAFT_ROLE]}`).sort(),
  });
}

// Work conservation (design A3), checked when a round ends: no copy source
// is idle while an admissible copy candidate on it exists.
function recordIdleSources(context) {
  const {world, driver, copySources, idleSources} = context;
  const occupancy = copyOccupancy(world, copySources);
  const idle = admissibleCopyCandidates(world, copySources, null)
    .filter((candidate) => !occupancy.bySource[candidate.source]);
  if (idle.length === 0) return;
  idleSources.rounds += 1;
  if (idleSources.examples.length < IDLE_EXAMPLE_LIMIT) {
    idleSources.examples.push({round: driver.roundCounter.number,
      step: context.tracker.current(), source: idle[0].source,
      candidates: idle.map((candidate) => candidate.partitionId)});
  }
}

function createIdleSources() {
  return {rounds: 0, examples: []};
}

async function roundsToFixpoint(context, cap = ROUND_CAP) {
  const {driver, world, observer} = context;
  let digest = drainDigest(driver, world);
  let rounds = 0;
  let fixpoint = false;
  while (rounds < cap && !fixpoint) {
    await driver.round();
    rounds += 1;
    observer.observe(`round ${driver.roundCounter.number}`);
    recordIdleSources(context);
    const next = drainDigest(driver, world);
    fixpoint = next === digest;
    digest = next;
  }
  return {rounds, fixpoint};
}

// Every terminal row delivered again, exactly as it is (a CDC redelivery),
// then a few rounds.
async function redeliverTerminalRows(context) {
  const {world, driver, tracker, ledger} = context;
  const mark = ledger.admissions.length;
  const terminalRows = world.cache.getAll(TABLES.REPLICA_OPERATIONS)
    .filter((row) => !isUnresolved(row));
  await tracker.within(STEP.TERMINAL_REDELIVERY, async () => {
    for (const row of terminalRows) {
      world.cache.applySystemTableChange(
        TABLES.REPLICA_OPERATIONS, CDC_OPERATION.UPDATE, {...row});
    }
    await driver.settle();
  });
  const run = await roundsToFixpoint(context, REDELIVERY_ROUNDS);
  return {redelivered: terminalRows.length, rounds: run.rounds,
    admissions: ledger.admissions.slice(mark)};
}

// One step of the timer probe: the earliest-due timers a placement decider
// armed run once, as if their delay had elapsed; the clock does not move.
async function firePlacementTimers(context) {
  const {world, driver, tracker} = context;
  const armed = world.time.armedTimers().filter(isPlacementTimer);
  if (armed.length === 0) return 0;
  const due = Math.min(...armed.map((timer) =>
    timer.armedAtMs + timer.delayMs));
  elapseDeciderWindows(world.seedRebalancers);
  let fired = 0;
  await tracker.within(STEP.PLACEMENT_TIMER, async () => {
    fired = world.time.stepCadence(STEP.PLACEMENT_TIMER, (timer) =>
      isPlacementTimer(timer) && timer.armedAtMs + timer.delayMs === due);
    await driver.settle();
  });
  return fired;
}

function isDrainComplete(world) {
  return world.cache.getAll(TABLES.REPLICA_OPERATIONS).every(
    (row) => !isUnresolved(row)) &&
    partitionPlacement(world).every((placement) =>
      !placement.spreadDeficit && !placement.surplus);
}

async function runTimerProbe(context, cap) {
  const {ledger} = context;
  const mark = ledger.admissions.length;
  let steps = 0;
  let firings = 0;
  let stepsAfterComplete = 0;
  let rounds = 0;
  while (steps < cap && stepsAfterComplete < 1) {
    const complete = isDrainComplete(context.world);
    const fired = await firePlacementTimers(context);
    if (fired === 0) break;
    firings += fired;
    steps += 1;
    if (complete) stepsAfterComplete += 1;
    rounds += (await roundsToFixpoint(context)).rounds;
  }
  return {steps, firings, rounds, capReached: steps >= cap,
    admissions: ledger.admissions.slice(mark)};
}

function messageGroupPlacement(world) {
  return world.cache.filter(TABLES.SERVICES, (row) =>
    row[COLUMN.GROUP_ID] === INITIAL_MESSAGE_GROUP_ID)
    .map((row) => `${row[COLUMN.NODE_ID]}:${row[COLUMN.STATUS]}:` +
      `${row[COLUMN.RAFT_ROLE]}`).sort();
}

function summarizeTimers(timers) {
  const bySite = {};
  for (const timer of timers) {
    bySite[timer.armedBy] = (bySite[timer.armedBy] || 0) + 1;
  }
  return bySite;
}

function stateAt(context, run) {
  const {world, driver, ledger} = context;
  const placements = partitionPlacement(world);
  const armedPlacementTimers =
    world.time.armedTimers().filter(isPlacementTimer);
  return {
    rounds: run.rounds,
    fixpoint: run.fixpoint,
    formed: isSpreadPublished(world),
    complete: isDrainComplete(world),
    elapsedMs: world.clock.now() - WORLD_START_MS,
    shortestArmedBoundMs: Math.min(...driver.armedBounds()
      .filter((timer) => !isPlacementTimer(timer))
      .map((timer) => timer.delayMs)),
    unresolvedOperations: world.cache.getAll(TABLES.REPLICA_OPERATIONS)
      .filter(isUnresolved)
      .map((row) => `${row.type} ${row[COLUMN.PARTITION_ID]} ` +
        `${row.source_node_id || ''}>${row[COLUMN.TARGET_NODE_ID]} ` +
        `${row.workflow_step}`).sort(),
    partitions: placements.length,
    spreadDeficits: placements.filter((placement) => placement.spreadDeficit)
      .map((placement) => `${placement.partitionId}:` +
        `${placement.distinctReadyVoterNodes}/${placement.required}`),
    surplus: placements.filter((placement) => placement.surplus)
      .map((placement) => `${placement.partitionId}:${placement.replicas}`),
    admissions: ledger.admissions.length,
    armedPlacementTimers: summarizeTimers(armedPlacementTimers),
    armedPlacementTimerCount: armedPlacementTimers.length,
    spentBounds: [...driver.spentBounds],
  };
}

// The rows of the partition whose first create was made to fail.
function retryOutcome(world, ledger, injected) {
  if (!injected.failure) return null;
  const {operationId, partitionId} = injected.failure;
  const failedRow = world.cache.get(TABLES.REPLICA_OPERATIONS, operationId);
  const failedAt = ledger.failedOperations.get(operationId) || null;
  const retries = failedAt ? ledger.admissions.slice(failedAt.admissionsBefore)
    .filter((entry) => entry.partitionId === partitionId &&
      COPY_OPERATION_TYPES.has(entry.type)) : [];
  return {
    operationId,
    partitionId,
    failedRowRetained: failedRow?.workflow_step === WORKFLOW_STEP.FAILED,
    failedAt,
    retries: retries.map((entry) => ({
      seq: entry.seq,
      operationId: entry.operationId,
      step: entry.step,
      round: entry.round,
      workflowStep: world.cache.get(TABLES.REPLICA_OPERATIONS,
        entry.operationId)?.workflow_step || null,
    })),
  };
}

/**
 * Run one arrival order through the four phases.
 * @param {object[]} order the arrival events
 * @param {object} [options]
 * @param {number} [options.timerProbeCap] timer-probe steps at most (0
 *   skips the probe and the second redelivery)
 * @param {string} [options.failFirstCreateOf] the partition whose first
 *   replica create fails
 * @return {Promise<object>} the report
 */
async function runPlacementDrain(order, options = {}) {
  await runtimeBuildProvenance();
  const singleVoterFounding = options.singleVoterFounding === true;
  const world = createFormationWorld({
    mountPlacementDeciders,
    platformClockIsWorldClock: true,
  });
  if (singleVoterFounding) {
    seedSingleVoterFounding(world);
  } else {
    seedThreeVoterFounding(world);
  }
  const driver = createRoundDriver(world, {plannerPolling: false});
  const floorWatch = createFloorWatch(world, {singleVoterFounding});
  const tracker = createStepTracker(world, driver, (step) => floorWatch.check(step));
  const {copySources, injected} = instrumentReplicaRuntime(world, {
    failFirstCreateOf: options.failFirstCreateOf || null,
    singleVoterFounding,
  });
  const ledger = observeLedger(world, driver, tracker, copySources);
  const observer = createObserver(world, driver);
  const context = {world, driver, tracker, observer, copySources, ledger,
    idleSources: createIdleSources()};
  const initialMessageGroup = messageGroupPlacement(world);
  const cap = options.timerProbeCap ?? TIMER_PROBE_CAP;
  try {
    await driver.formSeed();
    observer.observe('seed formed');
    elapseDeciderWindows(world.seedRebalancers);
    for (const [index, event] of order.entries()) {
      await tracker.within(STEP.EVENT, () => applyEvent(driver, event));
      observer.observe(`event ${index} ${event.type}`);
    }
    await tracker.within(STEP.READY_SIGNALS, async () => {
      for (const joiner of driver.joiners.values()) {
        driver.startReadySignal(joiner.nodeId);
      }
      await driver.settle();
    });
    observer.observe('ready signals started');

    const frozen = stateAt(context, await roundsToFixpoint(context));
    frozen.idleSources = {...context.idleSources,
      examples: [...context.idleSources.examples]};
    const firstRedelivery = await redeliverTerminalRows(context);
    const probe = cap > 0 ? await runTimerProbe(context, cap) : null;
    const final = stateAt(context, {rounds: probe ? probe.rounds : 0,
      fixpoint: true});
    const lastRedelivery = probe ? await redeliverTerminalRows(context) : null;
    return {
      order,
      frozen,
      probe,
      final,
      redeliveries: [firstRedelivery, lastRedelivery].filter(Boolean),
      ledger,
      retry: retryOutcome(world, ledger, injected),
      idleSources: context.idleSources,
      floorViolations: floorWatch.violations,
      evenVoterViolations: floorWatch.evenVoterViolations,
      colocationViolations: floorWatch.colocationViolations,
      servicesSnapshot: world.cache.getAll(TABLES.SERVICES)
        .filter((row) => Boolean(row[COLUMN.PARTITION_ID])),
      safety: observer.safety,
      messageGroup: {
        initial: initialMessageGroup,
        final: messageGroupPlacement(world),
      },
      steppedCadences: driver.steppedCadences(),
    };
  } finally {
    driver.close();
  }
}

function countBy(items, keyOf) {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function formatState(label, state) {
  return [
    `${label}: fixpoint=${state.fixpoint} rounds=${state.rounds} ` +
      `formed=${state.formed} complete=${state.complete} admissions=` +
      `${state.admissions} elapsed=${state.elapsedMs} ms (shortest armed ` +
      `execution bound ${state.shortestArmedBoundMs} ms) spentBounds=` +
      `${state.spentBounds.length}`,
    `${label} spread deficits ${state.spreadDeficits.length}/` +
      `${state.partitions}: ${state.spreadDeficits.join(' ')}`,
    `${label} surplus: ${state.surplus.join(' ')}`,
    `${label} unresolved: ${state.unresolvedOperations.join(', ')}`,
    `${label} armed placement timers (${state.armedPlacementTimerCount}): ` +
      JSON.stringify(state.armedPlacementTimers),
  ];
}

/**
 * The report a run prints: where the drain stood, what it waited on, and
 * what caused every admission.
 * @param {object} report a runPlacementDrain report
 * @return {string}
 */
function formatDrainReport(report) {
  const {ledger, probe} = report;
  const lines = [...formatState('FROZEN', report.frozen)];
  if (probe) {
    lines.push(`PROBE: steps=${probe.steps} timers fired=${probe.firings} ` +
      `rounds=${probe.rounds} capReached=${probe.capReached} ` +
      `admissions=${probe.admissions.length}`);
    lines.push(...formatState('FINAL', report.final));
  }
  lines.push('redeliveries: ' + report.redeliveries.map((redelivery) =>
    `${redelivery.redelivered} rows -> ${redelivery.admissions.length} ` +
    'admissions').join('; '));
  lines.push('admissions by step: ' +
    JSON.stringify(countBy(ledger.admissions, (entry) => entry.step)));
  lines.push('admissions by class: ' +
    JSON.stringify(countBy(ledger.admissions,
      (entry) => entry.placementClass)));
  lines.push('max unresolved copy-phase operations per copy source ' +
    `${JSON.stringify(ledger.maxBySource)}, per target ` +
    `${JSON.stringify(ledger.maxByTarget)} (K_src=${K_SRC}, K_tgt=${K_TGT})`);
  lines.push('admission order (seq:type:partition>target@round/step): ' +
    ledger.admissions.map((entry) =>
      `${entry.seq}:${entry.type}:${entry.partitionId}>` +
      `${entry.targetNodeId}@r${entry.round}/${entry.step}` +
      `${entry.formed ? '' : '/unformed'}`).join(' '));
  return lines.join('\n');
}

export {
  FIRST_FORMATION_GATED_CLASS,
  K_SRC,
  K_TGT,
  PLACEMENT_CLASS,
  STEP,
  TIMER_OR_POLL_STEPS,
  countBy,
  formatDrainReport,
  runPlacementDrain,
};
