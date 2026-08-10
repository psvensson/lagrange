import t from 'tap';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  getNextWorkflowStep,
  isTerminalStep,
} from '../../src/rebalancer/replica-operation-progress.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {
  createTimeoutTestCoordinator,
} from '../rebalancer/timeout-test-coordinator.js';
import {
  isLedgerQuorumConcentratedPartition,
} from '../../src/rebalancer/operation-ledger-hold-policy.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {
  LEDGER_PARTITION_ID,
  SEED_NODE_ID,
  JOINER_1_NODE_ID,
  JOINER_2_NODE_ID,
  applyRow,
  buildFormationBarrierOwner,
  buildFormationCache,
  buildRealLedgerPlanner,
  currentLedgerReplicas,
  initializeEnvironment,
  resetEnvironment,
} from './formation-barrier-test-fixture.js';

// Quest formation-barrier-spread-release-oscillation — deterministic
// reproduction of the abfix red-run wedge (live 3-node docker joins,
// ec-abfix-20260809T174802Z lineage):
//
//   The seed's ledger spread ops must execute THROUGH the concentrated
//   formation window they exist to cure. Two production-shaped execution
//   faults close the circle:
//   - Link A: an operation-row INSERT that carries a system write session
//     rides the seed-led, unspread write-session tables and fails
//     DISTRIBUTED_PARTICIPANT_FAILURE retryable-forever while formation
//     pressure lasts (every step-transition write already bypasses the
//     session — the admission INSERT was the remaining session-coupled
//     write).
//   - Link B: a spread op that reached STOPPING defers
//     control_plane_pressure_degraded forever when the authoritative
//     services observation lane is shed, pinning a REMOVING voter on the
//     seed so the ledger never unconcentrates.
//   Pressure persists exactly while the ledger is concentrated, so each
//   link keeps the other failing and the joiner's engaged formation
//   barrier oscillates (waiting_for_ledger_spread <->
//   waiting_for_ledger_observation) until its fail-closed 120s timeout.
//
// HONEST SCOPE (dt6-formation-ledger-* idiom):
//   - REAL: the joiner's barrier loop (snapshot legs, engagement latch,
//     release states) on a virtual clock; the MovePlanner spread cures over
//     live cache rows; the RebalanceCoordinator admission chain +
//     createOperation INSERT write shapes; every workflow step-transition
//     persist; reconcileStoppingOperationProgress with the repository's
//     real authoritative-read + cache-fallback observation; terminal
//     transitions.
//   - MODELED (deterministic drive at the invariant layer): the tick driver
//     folds one workflow action per barrier poll and applies the physical
//     placement effects of executed steps to the shared cache rows
//     (production: target-node execution + CDC). The fault model keys on
//     the REAL queryOptions/read lanes the owners emit: session-carrying
//     ledger mutations and authoritative services reads fail while the
//     formation storm (= concentrated ledger after the join wave arrives)
//     is active; session-less single-statement ledger writes led by the
//     live seed succeed.

const BARRIER_START_MS = 1000;
// Production-faithful virtual cadence: one execution action per 250ms poll
// (the TRANSITION_RETRY_DELAY_MS defer cadence) against the real 120s
// barrier budget, so the bounded starvation escalation's count AND
// elapsed-time bounds are both exercised at their production magnitudes.
const BARRIER_POLL_MS = 250;
const BARRIER_TIMEOUT_MS = 120000;
const STORM_START_OFFSET_MS = 2;
const CASE2_SERVICES_READ_FAIL_BUDGET = 6;
const STOPPING_STARVATION_MESSAGE_FRAGMENT = 'stopping-observation starvation';
const BARRIER_STATE = Object.freeze({
  SATISFIED: 'ledger_spread_satisfied',
  WAITING_OBSERVATION: 'waiting_for_ledger_observation',
  WAITING_OPERATION_DRAIN: 'waiting_for_ledger_operation_drain',
  WAITING_SPREAD: 'waiting_for_ledger_spread',
});
const PRESSURE_READ_FAILURE = Object.freeze({
  success: false,
  deferRetry: true,
  errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
  error: 'authoritative services lane shed under control-plane pressure',
});

function buildParticipantWriteFailure() {
  const participant = {
    tableName: 'sql_transaction_participants',
    deferRetry: true,
  };
  return {
    success: false,
    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    deferRetry: true,
    retryAfterMs: 1,
    participantFailures: [participant],
    firstFailedParticipant: participant,
  };
}

function serveServicesReadFromCache(cache, sql, params) {
  const rows = currentLedgerReplicas(cache);
  let matched = rows;
  if (sql.includes('service_type = ?') && sql.includes('partition_id = ?')) {
    matched = rows.filter(
      (row) => row.service_type === params[0] && row.partition_id === params[1],
    );
  } else if (sql.includes('service_id = ?')) {
    matched = rows.filter(
      (row) =>
        row.service_id === params[0] || row.replica_id === params[0],
    );
  } else if (sql.includes('partition_id = ?') && sql.includes('node_id = ?')) {
    matched = rows.filter(
      (row) => row.partition_id === params[0] && row.node_id === params[1],
    );
  } else if (sql.includes('partition_id = ?')) {
    matched = rows.filter((row) => row.partition_id === params[0]);
  }
  return {
    success: true,
    source: 'owner_rpc_lane',
    rows: matched.map((row) => ({...row})),
  };
}

function isSessionCarryingLedgerMutation(sql, options) {
  if (typeof sql !== 'string') {
    return false;
  }
  const ledgerWrite =
    (sql.includes('INSERT INTO replica_operations') ||
      sql.includes('UPDATE replica_operations')) &&
    !sql.includes('lease_expires_at');
  return (
    ledgerWrite &&
    options?.disableSystemWriteSession !== true &&
    typeof options?.sessionId === 'string' &&
    options.sessionId.length > 0
  );
}

function distinctVoterNodeCount(cache) {
  return new Set(
    currentLedgerReplicas(cache)
      .filter((row) =>
        [ReplicaStatus.ACTIVE, ReplicaStatus.REMOVING].includes(row.status))
      .map((row) => row.node_id),
  ).size;
}

function buildScenario(options = {}) {
  initializeEnvironment();
  const cache = buildFormationCache({
    joinerNodeIds: [JOINER_1_NODE_ID, JOINER_2_NODE_ID],
  });
  const clockAtBuild = {now: BARRIER_START_MS};
  const fixture = createTimeoutTestCoordinator({
    timeSource: {now: () => clockAtBuild.now},
  });
  const {coordinator, trackedOperations} = fixture;
  coordinator.systemTableCache = cache;
  coordinator.repository.systemTableCache = cache;
  const clock = clockAtBuild;
  const stormStartAt = BARRIER_START_MS + STORM_START_OFFSET_MS;
  const witnesses = {
    sessionWritesFailedDuringStorm: 0,
    sessionlessLedgerInsertsDuringStorm: 0,
    createRejections: [],
    barrierStates: [],
    servicesReadFailures: 0,
  };

  const concentrated = () =>
    isLedgerQuorumConcentratedPartition(cache, LEDGER_PARTITION_ID);
  const defaultStormActive = () =>
    concentrated() && clock.now >= stormStartAt;
  const stormActive = options.stormActive || defaultStormActive;
  const writeFaultActive = options.writeFaultActive || stormActive;

  // Authoritative services reads, shed per the FIELD-observed shapes: the
  // replica STATUS probes (service_id-scoped — the STOPPING observation
  // lane) stayed control_plane_pressure_degraded across whole red windows,
  // while partition-scoped placement reads (the barrier lane and the
  // destructive REMOVE fence) answered intermittently — red-run barrier
  // logs carry owner_rpc_lane observations DURING the storm. Model the
  // status probes as fully shed while the storm lasts and the placement
  // reads as alternating.
  let partitionScopedReadCalls = 0;
  const serveShedAwareServicesRead = (sql, params) => {
    const statusProbe = String(sql).includes('service_id = ?');
    if (stormActive()) {
      if (statusProbe) {
        witnesses.servicesReadFailures++;
        return {...PRESSURE_READ_FAILURE};
      }
      partitionScopedReadCalls++;
      if (partitionScopedReadCalls % 2 === 1) {
        witnesses.servicesReadFailures++;
        return {...PRESSURE_READ_FAILURE};
      }
    }
    return serveServicesReadFromCache(cache, String(sql), params || []);
  };
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const baseReadAuthoritativeRows =
    gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (tableName, sql, params, opts) => {
    if (tableName === 'services' || /FROM services/.test(String(sql))) {
      return serveShedAwareServicesRead(sql, params);
    }
    return baseReadAuthoritativeRows(tableName, sql, params, opts);
  };

  // The joiner barrier's strict owner-RPC placement lane: alternates
  // shed/answer under the storm so BOTH release-evidence lanes are
  // exercised (the field flap: owner answers "3 voters on 2 nodes", the
  // next poll is shed and falls back to concentrated cache evidence).
  let placementLaneCalls = 0;
  coordinator.controlPlaneReadinessService.getAuthoritativeControlPlaneView =
    () => ({
      canRead: () => true,
      readRows: async (tableName, sql, params) => {
        placementLaneCalls++;
        if (stormActive() && placementLaneCalls % 2 === 1) {
          return {...PRESSURE_READ_FAILURE};
        }
        return serveServicesReadFromCache(cache, String(sql), params || []);
      },
    });

  // Ledger mutations: a session-carrying write's bookkeeping rides the
  // seed-led, unspread write-session tables and fails as a participant
  // failure while the storm lasts; session-less single-statement writes
  // into the live seed-led ledger succeed. The fail-soft owner-lease touch
  // is excluded (never load-bearing for workflow progress).
  const baseExecuteQuery = gateway.executeQuery.bind(gateway);
  gateway.executeQuery = async (sql, params, queryOptions) => {
    if (writeFaultActive() && isSessionCarryingLedgerMutation(sql, queryOptions)) {
      witnesses.sessionWritesFailedDuringStorm++;
      return buildParticipantWriteFailure();
    }
    if (
      writeFaultActive() &&
      String(sql).includes('INSERT INTO replica_operations') &&
      queryOptions?.disableSystemWriteSession === true
    ) {
      witnesses.sessionlessLedgerInsertsDuringStorm++;
    }
    return baseExecuteQuery(sql, params, queryOptions);
  };

  // Authoritative cache-row refresh used by the REPLACE terminal handoff
  // confirm: same lane, same shedding.
  coordinator.repository.cdcIntegrationService.refreshAuthoritativeCacheRow =
    async (tableName, replicaId, refreshOptions) => {
      if (stormActive()) {
        return false;
      }
      const row = currentLedgerReplicas(cache).find(
        (candidate) =>
          candidate.service_id === replicaId ||
          candidate.replica_id === replicaId,
      );
      const expected = refreshOptions?.expectedFields || {};
      return Boolean(
        row &&
        row.status === expected.status &&
        row.node_id === expected.node_id,
      );
    };

  const planner = buildRealLedgerPlanner(cache, trackedOperations);
  const executionState = {pending: null, addAllocationCount: 0};

  // Physical placement effect of an accepted step (production: remote
  // target/source node execution + CDC into the services rows). The driver
  // owns ONLY these physical effects; the durable workflow row and every
  // ledger write shape stay with the real owners.
  const applyPhysicalStepEffect = (operation, step) => {
    const isReplace = operation.type === OperationType.REPLACE;
    if (
      step === WORKFLOW_STEP.ACTIVE &&
      (isReplace || operation.type === OperationType.ADD)
    ) {
      applyRow(cache, 'services', {
        service_id: operation.replicaId,
        replica_id: operation.replicaId,
        partition_id: LEDGER_PARTITION_ID,
        node_id: operation.targetNodeId,
        service_type: REBALANCER_ENTITY_TYPE.PARTITION,
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
      });
    }
    if (step === WORKFLOW_STEP.STOPPING) {
      const removingReplicaId = isReplace ?
        coordinator.repository.getReplaceSourceReplicaId(operation) :
        operation.replicaId;
      if (removingReplicaId) {
        cache.applySystemTableChange('services', 'DELETE', {
          service_id: removingReplicaId,
        });
      }
    }
  };

  // Advance the pending op one action; true = this tick is consumed.
  const advancePendingOperation = async () => {
    const {operation} = executionState.pending;
    if (isTerminalStep(operation.type, operation.workflowStep)) {
      executionState.pending = null;
      return false;
    }
    if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
      await coordinator.workflowOwner.reconcileStoppingOperationProgress(
        operation,
      );
      return true;
    }
    const nextStep = getNextWorkflowStep(
      operation.type,
      operation.workflowStep,
    );
    if (!nextStep) {
      executionState.pending = null;
      return true;
    }
    if (
      isTerminalStep(operation.type, nextStep) &&
      nextStep !== WORKFLOW_STEP.STOPPING
    ) {
      applyPhysicalStepEffect(operation, WORKFLOW_STEP.ACTIVE);
      await coordinator.completeOperation(operation);
      executionState.pending = null;
      return true;
    }
    await coordinator.workflowOwner.updateStep(operation, nextStep);
    applyPhysicalStepEffect(operation, nextStep);
    return true;
  };

  const planAndCreateNextMove = async () => {
    const replicas = currentLedgerReplicas(cache);
    const targetState = await planner.calculateTargetState(replicas, {
      targetReplicaCount: 3,
      placementConstraints: {
        spreadAcrossNodes: true,
      },
    });
    const moves = planner.calculateMoves(replicas, targetState);
    const move = moves[0] || null;
    if (!move) {
      return;
    }
    try {
      const operation = await coordinator.createOperation({
        type: move.type,
        partitionId: LEDGER_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        entityId: LEDGER_PARTITION_ID,
        nodeId: move.nodeId,
        replicaId:
          move.type === REBALANCER_MOVE_TYPE.ADD ?
            `${LEDGER_PARTITION_ID}-r${4 + executionState.addAllocationCount++}` :
            move.replicaId,
        sourceNodeId: move.sourceNodeId,
      });
      coordinator.workflowOwner.ensureOperationWorkflow(operation);
      executionState.pending = {move, operation};
    } catch (error) {
      witnesses.createRejections.push({
        message: error?.message || String(error),
        code: error?.code || error?.errorCode || null,
      });
    }
  };

  const driveExecutionTick = async () => {
    if (executionState.pending && await advancePendingOperation()) {
      return;
    }
    await planAndCreateNextMove();
  };

  const owner = buildFormationBarrierOwner({
    cache,
    coordinator,
    joinerNodeIds: [JOINER_1_NODE_ID, JOINER_2_NODE_ID],
    now: () => clock.now,
    sleep: async (delayMs) => {
      await driveExecutionTick();
      clock.now += delayMs;
    },
  });
  owner.config.priorityPlacementFormationPollMs = BARRIER_POLL_MS;
  owner.config.priorityPlacementFormationTimeoutMs = BARRIER_TIMEOUT_MS;
  owner.logger = {
    info: (message, payload) => {
      if (payload && typeof payload.state === 'string') {
        witnesses.barrierStates.push(payload.state);
      }
    },
    warn: () => {},
    error: () => {},
  };

  return {
    cache,
    clock,
    coordinator: fixture.coordinator,
    owner,
    trackedOperations,
    witnesses,
  };
}

function nonTerminalTrackedOperations(trackedOperations) {
  return [...trackedOperations.values()].filter(
    (operation) => !isTerminalStep(operation.type, operation.workflow_step),
  );
}

t.test(
  'an engaged formation barrier releases within budget when spread-op ' +
    'execution faults are formation-shaped (link A: session-carried ' +
    'admission writes; link B: shed stopping observation)',
  async (t) => {
    const scenario = buildScenario();
    const {cache, coordinator, owner, trackedOperations, witnesses} = scenario;

    try {
      const barrierError = await owner
        .awaitOperationLedgerFormationBarrier()
        .then(() => null, (error) => error);

      const stuckOperations = nonTerminalTrackedOperations(trackedOperations);
      t.equal(
        barrierError,
        null,
        'the engaged barrier releases inside its budget ' +
          `(got ${barrierError?.code || 'release'}, ` +
          `distinctVoterNodes=${distinctVoterNodeCount(cache)}/3, ` +
          `stuck=${JSON.stringify(stuckOperations.map((operation) => ({
            type: operation.type,
            step: operation.workflow_step,
          })))}, ` +
          `createRejections=${JSON.stringify(witnesses.createRejections.slice(0, 2))})`,
      );
      t.equal(
        witnesses.barrierStates[witnesses.barrierStates.length - 1],
        BARRIER_STATE.SATISFIED,
        'the release is a genuine SATISFIED, not a bypass',
      );
      t.equal(
        distinctVoterNodeCount(cache),
        3,
        'the ledger genuinely reaches one voter per node',
      );
      t.equal(
        isLedgerQuorumConcentratedPartition(cache, LEDGER_PARTITION_ID),
        false,
        'ledger quorum concentration is cured, lifting formation pressure',
      );
      t.equal(
        stuckOperations.length,
        0,
        'no spread operation is starved non-terminal at release',
      );
      t.ok(
        witnesses.barrierStates.includes(BARRIER_STATE.WAITING_SPREAD) &&
          witnesses.barrierStates.includes(BARRIER_STATE.WAITING_OBSERVATION),
        'the cross-lane evidence flap (spread <-> observation) occurred and ' +
          'did not prevent release',
      );
      t.equal(
        witnesses.sessionWritesFailedDuringStorm,
        0,
        'no formation-window ledger mutation depended on the seed-led ' +
          'write-session tables',
      );
      t.ok(
        witnesses.sessionlessLedgerInsertsDuringStorm >= 1,
        'at least one spread-op admission INSERT executed session-less ' +
          'through the concentrated window (link A relief engaged)',
      );
      const failedOperations = [...trackedOperations.values()].filter(
        (operation) => operation.workflow_step === WORKFLOW_STEP.FAILED,
      );
      t.ok(
        failedOperations.length >= 1 &&
          failedOperations.every((operation) =>
            String(operation.error_message || '').includes(
              STOPPING_STARVATION_MESSAGE_FRAGMENT,
            )),
        'starved STOPPING observation escalates to a VISIBLE typed failure ' +
          'instead of deferring forever (link B relief engaged)',
      );
      t.ok(
        [...trackedOperations.values()].some(
          (operation) => operation.workflow_step === WORKFLOW_STEP.REMOVED,
        ),
        'a later spread cure completes cleanly once concentration is cured',
      );
    } finally {
      await coordinator.shutdown();
      resetEnvironment();
    }
  },
);

t.test(
  'a sub-limit authoritative-observation outage completes the spread op ' +
    'without a visible failure (escalation is bounded, not eager)',
  async (t) => {
    let servicesReadFailBudget = CASE2_SERVICES_READ_FAIL_BUDGET;
    const scenario = buildScenario({
      stormActive: () => {
        if (servicesReadFailBudget > 0) {
          servicesReadFailBudget--;
          return true;
        }
        return false;
      },
      writeFaultActive: () => false,
    });
    const {coordinator, owner, trackedOperations, witnesses} = scenario;

    try {
      const barrierError = await owner
        .awaitOperationLedgerFormationBarrier()
        .then(() => null, (error) => error);

      t.equal(
        barrierError,
        null,
        'a transient observation blip does not prevent release',
      );
      t.equal(
        [...trackedOperations.values()].filter(
          (operation) => operation.workflow_step === WORKFLOW_STEP.FAILED,
        ).length,
        0,
        'no operation is visibly failed for a sub-limit outage',
      );
      t.equal(
        witnesses.sessionWritesFailedDuringStorm,
        0,
        'the blip case exercises the observation lane only',
      );
    } finally {
      await coordinator.shutdown();
      resetEnvironment();
    }
  },
);

// Quest formation-barrier-release-snapshot-coherence — the busy-healthy
// shape from live runs public-path-multinode-baseline-20260810T154716Z/
// 155045Z: every lower face fixed (ops completing, zero refusals), the
// ledger genuinely spread on three distinct nodes, its own REMOVE already
// COMPLETE ("Replica removal completed" 15:52:51) — but the removed
// replica's services row lingers as a terminal REMOVING ghost, the joiner
// cache stays stale-concentrated, the owner-RPC placement lane answers only
// intermittently, and the rebalancer keeps minting operations on OTHER
// partitions. On the incoherent barrier, each RPC failure substituted the
// stale cache verdict and each RPC answer counted the ghost as a quorum
// voter, so the two release legs deadlocked (the self-op drain observation
// was never even attempted: inFlightOperationCount stayed null for 135s)
// and the barrier starved to timeout in a healthy busy cluster. The
// coherent barrier evaluates all legs from one per-iteration evidence unit
// and releases: settled ACTIVE spread (3/3/unconcentrated) proven on the
// owner lane AND self-operations terminal.
const CHURN_PARTITION_ID = 'user_sessions-p1';
const BUSY_HEALTHY_RELEASE_BUDGET_POLLS = 10;
const CHURN_MINT_TICK_INTERVAL = 20;
const RAFT_ROLE_LEADER = 'leader';
const RAFT_ROLE_FOLLOWER = 'follower';

function buildGhostLedgerOwnerRows() {
  const rows = [
    [1, SEED_NODE_ID, RAFT_ROLE_LEADER],
    [2, JOINER_1_NODE_ID, RAFT_ROLE_FOLLOWER],
    [4, JOINER_2_NODE_ID, RAFT_ROLE_FOLLOWER],
    // r3 becomes the ghost: ACTIVE at REMOVE creation (production
    // ordering), flipped to REMOVING once the removal has executed and
    // the services-row DELETE lags.
    [3, SEED_NODE_ID, RAFT_ROLE_FOLLOWER],
  ];
  return rows.map(([index, nodeId, raftRole]) => ({
    service_id: `${LEDGER_PARTITION_ID}-r${index}`,
    replica_id: `${LEDGER_PARTITION_ID}-r${index}`,
    partition_id: LEDGER_PARTITION_ID,
    node_id: nodeId,
    service_type: REBALANCER_ENTITY_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: raftRole,
  }));
}

async function buildBusyHealthyScenario(options = {}) {
  initializeEnvironment();
  const cache = buildFormationCache({
    joinerNodeIds: [JOINER_1_NODE_ID, JOINER_2_NODE_ID],
  });
  const clock = {now: BARRIER_START_MS};
  const fixture = createTimeoutTestCoordinator({
    timeSource: {now: () => clock.now},
  });
  const {coordinator, trackedOperations} = fixture;
  coordinator.systemTableCache = cache;
  coordinator.repository.systemTableCache = cache;
  const witnesses = {
    barrierStates: [],
    churnOperationIds: [],
    placementLaneFailures: 0,
    placementLaneAnswers: 0,
  };

  // The destructive-REMOVE placement fence and other coordinator-side
  // guards read the authoritative services owner at creation time; serve
  // them the ghost placement (4 voters, r3 REMOVING on the seed). The
  // BARRIER's own placement lane is stubbed separately below — the
  // intermittency under test lives there.
  const ghostRows = buildGhostLedgerOwnerRows();
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const baseReadAuthoritativeRows =
    gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (tableName, sql, params, opts) => {
    if (tableName === 'services' || /FROM services/.test(String(sql))) {
      return {
        success: true,
        source: 'owner_rpc_lane',
        rows: ghostRows.map((row) => ({...row})),
      };
    }
    return baseReadAuthoritativeRows(tableName, sql, params, opts);
  };

  // The ledger partition's own REMOVE self-operation (the ghost row's op).
  const ledgerRemoval = await coordinator.createOperation({
    type: OperationType.REMOVE,
    partitionId: LEDGER_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    entityId: LEDGER_PARTITION_ID,
    nodeId: SEED_NODE_ID,
    replicaId: `${LEDGER_PARTITION_ID}-r3`,
    sourceNodeId: SEED_NODE_ID,
  });
  if (options.ledgerSelfOperationInFlight !== true) {
    await coordinator.completeOperation(ledgerRemoval);
  }
  // The removal has executed: the replica left the raft group, but the
  // services-row DELETE lags — the live-run terminal ghost (REMOVING row
  // persisting for 70+ seconds after "Replica removal completed").
  const ghostRow = ghostRows.find(
    (row) => row.service_id === `${LEDGER_PARTITION_ID}-r3`,
  );
  ghostRow.status = ReplicaStatus.REMOVING;

  // Best-effort: while a ledger self-move is in flight the REAL admission
  // interlock defers other-partition creates — itself production-faithful
  // churn pressure, so refusals are simply not counted.
  const mintChurnOperation = async () => {
    const churnIndex = witnesses.churnOperationIds.length + 2;
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: CHURN_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        entityId: CHURN_PARTITION_ID,
        nodeId: JOINER_1_NODE_ID,
        replicaId: `${CHURN_PARTITION_ID}-r${churnIndex}`,
      });
      witnesses.churnOperationIds.push(operation.operationId);
    } catch {
      witnesses.churnMintRefusals = (witnesses.churnMintRefusals || 0) + 1;
    }
  };
  // A busy rebalancer: operations on OTHER partitions are in flight before
  // the barrier engages and keep getting minted while it waits.
  await mintChurnOperation();
  await mintChurnOperation();

  let placementLaneCalls = 0;
  coordinator.controlPlaneReadinessService.getAuthoritativeControlPlaneView =
    () => ({
      canRead: () => true,
      readRows: async () => {
        placementLaneCalls++;
        const shedThisCall = options.placementLaneAvailable === false ||
          placementLaneCalls % 2 === 1;
        if (shedThisCall) {
          witnesses.placementLaneFailures++;
          return {...PRESSURE_READ_FAILURE};
        }
        witnesses.placementLaneAnswers++;
        return {
          success: true,
          source: 'owner_rpc_lane',
          rows: ghostRows.map((row) => ({...row})),
        };
      },
    });

  let tickCount = 0;
  const owner = buildFormationBarrierOwner({
    cache,
    coordinator,
    joinerNodeIds: [JOINER_1_NODE_ID, JOINER_2_NODE_ID],
    now: () => clock.now,
    sleep: async (delayMs) => {
      tickCount++;
      if (tickCount % CHURN_MINT_TICK_INTERVAL === 0) {
        await mintChurnOperation();
      }
      clock.now += delayMs;
    },
  });
  owner.config.priorityPlacementFormationPollMs = BARRIER_POLL_MS;
  owner.config.priorityPlacementFormationTimeoutMs = BARRIER_TIMEOUT_MS;
  owner.logger = {
    info: (message, payload) => {
      if (payload && typeof payload.state === 'string') {
        witnesses.barrierStates.push(payload.state);
      }
    },
    warn: () => {},
    error: () => {},
  };

  return {cache, clock, coordinator, owner, trackedOperations, witnesses};
}

function inFlightChurnOperationCount(trackedOperations, witnesses) {
  return [...trackedOperations.values()].filter(
    (operation) =>
      witnesses.churnOperationIds.includes(operation.operation_id) &&
      !isTerminalStep(operation.type, operation.workflow_step),
  ).length;
}

t.test(
  'an engaged barrier over a genuinely spread ledger with a terminal ghost ' +
    'REMOVING row, an intermittent owner lane, and other-partition churn ' +
    'releases from one coherent snapshot within a few polls',
  async (t) => {
    const scenario = await buildBusyHealthyScenario();
    const {clock, coordinator, owner, trackedOperations, witnesses} =
      scenario;

    try {
      const barrierError = await owner
        .awaitOperationLedgerFormationBarrier()
        .then(() => null, (error) => error);

      t.equal(
        barrierError,
        null,
        'the busy-healthy cluster releases the barrier ' +
          `(got ${barrierError?.code || 'release'} after ` +
          `${clock.now - BARRIER_START_MS}ms virtual)`,
      );
      t.equal(
        witnesses.barrierStates[witnesses.barrierStates.length - 1],
        BARRIER_STATE.SATISFIED,
        'the release is a genuine SATISFIED, not a bypass',
      );
      t.ok(
        clock.now - BARRIER_START_MS <=
          BUSY_HEALTHY_RELEASE_BUDGET_POLLS * BARRIER_POLL_MS,
        'release lands within a few polls, not the 120s timeout ' +
          `(${clock.now - BARRIER_START_MS}ms virtual elapsed)`,
      );
      t.ok(
        witnesses.placementLaneFailures >= 1 &&
          witnesses.placementLaneAnswers >= 1,
        'per-leg observations genuinely arrived at different iteration ' +
          'instants (the owner lane both shed and answered)',
      );
      t.ok(
        inFlightChurnOperationCount(trackedOperations, witnesses) >= 1,
        'rebalancer churn on OTHER partitions is still in flight at ' +
          'release and did not defer it',
      );
      t.ok(
        witnesses.barrierStates.includes(BARRIER_STATE.WAITING_OBSERVATION),
        'an unavailable placement leg is a typed defer iteration',
      );
    } finally {
      await coordinator.shutdown();
      resetEnvironment();
    }
  },
);

t.test(
  'the same ghost shape with the ledger REMOVE still in flight holds the ' +
    'barrier fail-closed to timeout (self-ops must be terminal)',
  async (t) => {
    const scenario = await buildBusyHealthyScenario({
      ledgerSelfOperationInFlight: true,
    });
    const {coordinator, owner, witnesses} = scenario;

    try {
      const barrierError = await owner
        .awaitOperationLedgerFormationBarrier()
        .then(() => null, (error) => error);

      t.match(
        barrierError,
        {code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT'},
        'an in-flight ledger self-operation keeps the engaged barrier ' +
          'closed until the fail-closed timeout',
      );
      t.ok(
        witnesses.barrierStates.includes(
          BARRIER_STATE.WAITING_OPERATION_DRAIN,
        ),
        'the hold is attributed to the self-operation drain leg',
      );
      t.notOk(
        witnesses.barrierStates.includes(BARRIER_STATE.SATISFIED),
        'no iteration released over the in-flight self-operation',
      );
    } finally {
      await coordinator.shutdown();
      resetEnvironment();
    }
  },
);

t.test(
  'a spread-looking joiner cache cannot release an engaged barrier while ' +
    'the authoritative placement lane stays unavailable',
  async (t) => {
    const scenario = await buildBusyHealthyScenario({
      placementLaneAvailable: false,
    });
    const {cache, coordinator, owner, witnesses} = scenario;
    // The joiner's LOCAL cache view happens to look fully spread — the
    // exact shape that previously released with zero owner evidence.
    for (const [replicaIndex, nodeId] of [
      [2, JOINER_1_NODE_ID],
      [3, JOINER_2_NODE_ID],
    ]) {
      cache.applySystemTableChange('services', 'UPDATE', {
        ...cache.get('services', `${LEDGER_PARTITION_ID}-r${replicaIndex}`),
        node_id: nodeId,
      });
    }

    try {
      const barrierError = await owner
        .awaitOperationLedgerFormationBarrier()
        .then(() => null, (error) => error);

      t.match(
        barrierError,
        {code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT'},
        'without an authoritative owner answer the engaged barrier fails ' +
          'closed instead of trusting the local cache verdict',
      );
      t.equal(
        barrierError?.formationBarrier?.spreadProofComplete,
        false,
        'the terminal snapshot records the missing placement proof as a ' +
          'typed defer, not a cache-derived verdict',
      );
      t.notOk(
        witnesses.barrierStates.includes(BARRIER_STATE.SATISFIED),
        'no iteration released on cache-only spread evidence',
      );
    } finally {
      await coordinator.shutdown();
      resetEnvironment();
    }
  },
);
