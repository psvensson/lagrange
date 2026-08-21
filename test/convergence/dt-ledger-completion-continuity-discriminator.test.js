/**
 * Quest movielens-ledger-completion-continuity-discriminator — deterministic
 * production-seam discriminator for operation-ledger REPLACE completion
 * continuity. In the live five-node MovieLens run, schema admission wedges at
 * replica_operations_in_flight=1: one REPLACE row never reaches cache-visible
 * terminal completion.
 *
 * The discriminator classifies, with the REAL owners and predicates and no
 * runtime change, exactly which evidence releases the in-flight hold and which
 * hostile evidence must never release canonical remove safety:
 *
 *   Family N  (control)   — normal completion: exact-target ACTIVE + retired
 *                           source durable evidence releases in-flight even
 *                           while the ledger row is still SYNCING; a late
 *                           terminal row also releases.
 *   Family L  (loss/late) — a lost completion response alone cannot wedge:
 *                           release is durable-observation-driven; but with
 *                           the source not retired the row is held, and the
 *                           level-triggered orphan sweep redrives ONLY
 *                           locally-owned rows (the handed-off row is the
 *                           unrescued class — operation-workflow-recovery-
 *                           timeout.js reconcileOrphanedOperations filters on
 *                           repository.isOperationLocallyOwned).
 *   Family H  (pre-hydration leadership) — a leader whose critical service
 *                           catalog is not yet hydrated gets a safety HOLD,
 *                           never an authorization.
 *   Family T  (terminal)  — independent ACTIVE, STOPPING, terminal-
 *                           persistence, and visibility-confirmation
 *                           failures: an unconfirmed terminal transition
 *                           arms the real terminal-transition repair (never
 *                           silently releases), and the repair attempt
 *                           re-persists the exact projection until the
 *                           authoritative row confirms.
 *   Negative-safety matrix — wrong-generation replacement, transport ack
 *                           without processing evidence, demoted target,
 *                           stale prior leader, absent quorum, and failed
 *                           authoritative terminal persistence: none release
 *                           removal or the serialized ledger hold.
 *   Physical-leadership witness — only recorded exact-target election
 *                           evidence CONTINUEs a remove-safety handoff.
 */
import t from 'tap';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE} from '../../src/constants/index.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  isReplicaOperationInFlight,
  normalizeReplicaOperationRecord,
  summarizeReplicaOperationLiveness,
} from '../../src/rebalancer/replica-operation-liveness.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SAFETY_SHARED,
} from '../../src/rebalancer/priority-publication-safety-shared.js';
import {
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createMockPolicyService,
  createMockMessageRouter,
  createTestCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  createTimeoutTestCoordinator,
} from '../rebalancer/timeout-test-coordinator.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';

const {
  PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE,
  decidePriorityPublicationFollowerSourceRemovalSafety,
} = SAFETY_SHARED;

const PARTITION_ID = 'ratings-p1';
const TARGET_NODE = 'node-target';
const SOURCE_NODE = 'node-source';
const TARGET_REPLICA = `${PARTITION_ID}-r4`;
const SOURCE_REPLICA = `${PARTITION_ID}-r1`;
const NOW_MS = 1_784_300_000_000;

// The live wedge shape: a REPLACE whose ledger row is still SYNCING while the
// physical work may or may not have completed on the target.
function buildSyncingReplaceRow(overrides = {}) {
  return {
    operation_id: 'op-replace-1',
    type: OperationType.REPLACE,
    partition_id: PARTITION_ID,
    entity_type: 'partition',
    entity_id: PARTITION_ID,
    replica_id: TARGET_REPLICA,
    source_replica_id: SOURCE_REPLICA,
    source_node_id: SOURCE_NODE,
    target_node_id: TARGET_NODE,
    status: ReplicaStatus.SYNCING,
    workflow_step: 'SYNCING',
    created_at: NOW_MS,
    updated_at: NOW_MS,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([{step: 'SYNCING', timestamp: NOW_MS}]),
    ...overrides,
  };
}

function activeTargetServiceRow(overrides = {}) {
  return {
    service_id: TARGET_REPLICA,
    replica_id: TARGET_REPLICA,
    partition_id: PARTITION_ID,
    service_type: 'partition',
    node_id: TARGET_NODE,
    status: 'active',
    ...overrides,
  };
}

function activeSourceServiceRow(overrides = {}) {
  return {
    service_id: SOURCE_REPLICA,
    replica_id: SOURCE_REPLICA,
    partition_id: PARTITION_ID,
    service_type: 'partition',
    node_id: SOURCE_NODE,
    status: 'active',
    ...overrides,
  };
}

function inFlightWith(row, serviceRows) {
  const record = normalizeReplicaOperationRecord(row, {nowMs: NOW_MS});
  return isReplicaOperationInFlight(record, {serviceRows, nowMs: NOW_MS});
}

t.test(
  'family N: exact-target ACTIVE plus retired source releases in-flight ' +
    'while the ledger row is still SYNCING',
  async (t) => {
    const row = buildSyncingReplaceRow();
    t.equal(
      inFlightWith(row, [activeTargetServiceRow()]),
      false,
      'durable observed completion (target exact ACTIVE, source retired) ' +
        'releases the hold without any completion response',
    );
    const summary = summarizeReplicaOperationLiveness([row], {
      serviceRows: [activeTargetServiceRow()],
      nowMs: NOW_MS,
    });
    t.equal(
      summary.inFlightCount,
      0,
      'the quiescence in-flight count reads 0 for the observed-complete REPLACE',
    );
  },
);

t.test(
  'family N: a late terminal ledger row releases in-flight on arrival',
  async (t) => {
    const held = buildSyncingReplaceRow();
    t.equal(
      inFlightWith(held, []),
      true,
      'before the late response lands the row is held',
    );
    const lateTerminal = buildSyncingReplaceRow({
      status: 'removed',
      workflow_step: 'REMOVED',
      completed_at: NOW_MS + 5_000,
      updated_at: NOW_MS + 5_000,
    });
    t.equal(
      inFlightWith(lateTerminal, []),
      false,
      'the late-arriving terminal transition releases the hold idempotently',
    );
  },
);

t.test(
  'family L: a lost completion response with the source not yet retired ' +
    'holds in-flight — the exact live wedge shape',
  async (t) => {
    const row = buildSyncingReplaceRow();
    t.equal(
      inFlightWith(row, [activeTargetServiceRow(), activeSourceServiceRow()]),
      true,
      'target ACTIVE alone is not REPLACE completion: the still-active source ' +
        'blocks retirement evidence, so the row stays in-flight',
    );
    const summary = summarizeReplicaOperationLiveness([row], {
      serviceRows: [activeTargetServiceRow(), activeSourceServiceRow()],
      nowMs: NOW_MS,
    });
    t.equal(
      summary.inFlightCount,
      1,
      'the quiescence oracle counts exactly the live replica_operations_in_flight=1',
    );
  },
);

t.test(
  'negative matrix: wrong-generation replacement evidence cannot release',
  async (t) => {
    const row = buildSyncingReplaceRow();
    const wrongGenerationRow = activeTargetServiceRow({
      service_id: `${PARTITION_ID}-r9`,
      replica_id: `${PARTITION_ID}-r9`,
    });
    t.equal(
      inFlightWith(row, [wrongGenerationRow]),
      true,
      'an ACTIVE replica on the target node with a different replica id ' +
        '(wrong generation) is rejected by the exact-target witness',
    );
  },
);

t.test(
  'negative matrix: a transport acknowledgement without processing evidence ' +
    'cannot release',
  async (t) => {
    const acknowledgedRow = buildSyncingReplaceRow({
      status: 'sending',
      workflow_step: 'SENDING',
      steps_history: JSON.stringify([{step: 'SENDING', timestamp: NOW_MS}]),
    });
    t.equal(
      inFlightWith(acknowledgedRow, []),
      true,
      'a dispatched-and-acknowledged operation with no durable catalog ' +
        'evidence stays in-flight',
    );
  },
);

t.test(
  'negative matrix: a demoted (non-ACTIVE) exact target cannot release',
  async (t) => {
    const row = buildSyncingReplaceRow();
    const demotedTargetRow = activeTargetServiceRow({status: 'syncing'});
    t.equal(
      inFlightWith(row, [demotedTargetRow]),
      true,
      'the exact target replica present but not ACTIVE is not completion evidence',
    );
  },
);

t.test(
  'physical-leadership witness: only recorded exact-target election evidence ' +
    'continues a remove-safety handoff',
  async (t) => {
    t.equal(
      REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE.get(
        REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE
          .EXACT_TARGET_ELECTION_EVIDENCE_RECORDED,
      ),
      REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION.CONTINUE,
      'recorded exact-target election evidence is the only CONTINUE state',
    );
    t.equal(
      REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE.get(
        REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE.NOT_APPLICABLE,
      ),
      REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION.WAIT,
      'anything short of recorded election evidence WAITs',
    );
  },
);

t.test(
  'negative matrix: stale prior leader evidence holds follower source removal',
  async (t) => {
    const fullEvidence = {
      priorityRecoveryCompletionSafe: true,
      sourceLeadershipReleaseObserved: true,
      replacementTopologyVoterSufficient: true,
      partitionLeaderStillSource: false,
      coLocatedLeaderSiblingObserved: false,
      publicationPartition: false,
    };
    t.equal(
      decidePriorityPublicationFollowerSourceRemovalSafety(fullEvidence).state,
      PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.SAFE,
      'control: complete succession evidence is SAFE',
    );
    t.equal(
      decidePriorityPublicationFollowerSourceRemovalSafety({
        ...fullEvidence,
        sourceLeadershipReleaseObserved: false,
      }).state,
      PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.HOLD,
      'unobserved source leadership release (stale prior leader) HOLDs',
    );
    t.equal(
      decidePriorityPublicationFollowerSourceRemovalSafety({
        ...fullEvidence,
        partitionLeaderStillSource: true,
      }).state,
      PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.HOLD,
      'a partition leader still on the source without a co-located sibling HOLDs',
    );
    t.equal(
      decidePriorityPublicationFollowerSourceRemovalSafety({
        ...fullEvidence,
        replacementTopologyVoterSufficient: false,
      }).state,
      PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.HOLD,
      'insufficient replacement voter topology HOLDs',
    );
  },
);

// ---------------------------------------------------------------------------
// Real-owner composition: the level-triggered orphan sweep. The locality
// filter (operation-workflow-recovery-timeout.js, reconcileOrphanedOperations:
// ownedOps = incompleteOps.filter(... isOperationLocallyOwned)) is
// type-independent; the proven ADD shape from
// orphaned-operation-reconcile-redrive.test.js isolates it exactly.
// ---------------------------------------------------------------------------

function buildSweepCoordinator({operationRows, serviceRows}) {
  const trackedOperations = new Map();
  for (const row of operationRows) {
    trackedOperations.set(row.operation_id, {...row});
  }
  const trackedServices = new Map();
  for (const row of serviceRows) {
    trackedServices.set(row.service_id, {...row});
  }
  const sqlEngine = {
    executeQuery: async (sql, params) => {
      if (sql.includes('UPDATE replica_operations')) {
        const [status, workflowStep, updatedAt, completedAt, errorMessage,
          stepsHistory, replicaId, operationId] = params;
        const existing = trackedOperations.get(operationId);
        if (existing) {
          trackedOperations.set(operationId, {
            ...existing, status, workflow_step: workflowStep,
            updated_at: updatedAt, completed_at: completedAt,
            error_message: errorMessage, steps_history: stepsHistory,
            replica_id: replicaId,
          });
        }
        return {success: true};
      }
      // The exact-target observation SELECTs full identity columns and
      // rejects rows whose node_id does not match the intended target
      // (doesObservedReplicaRowMatchTarget), so the authoritative services
      // read must answer with the whole tracked row, not a bare status.
      if (sql.includes('services') && sql.includes('service_id = ?')) {
        const [serviceId] = params;
        const service = trackedServices.get(serviceId);
        return {
          success: true,
          rows: service ? [{...service}] : [],
        };
      }
      if (sql.includes('services') && sql.includes('partition_id = ?')) {
        const [partitionId, nodeId] = params;
        const matching = Array.from(trackedServices.values()).filter((s) =>
          s.partition_id === partitionId && s.node_id === nodeId);
        return {
          success: true,
          rows: matching.map((service) => ({...service})),
        };
      }
      if (sql.includes('replica_operations')) {
        const allOps = Array.from(trackedOperations.values());
        if (sql.includes('operation_id = ?')) {
          const [operationId] = params;
          const op = trackedOperations.get(operationId);
          return {success: true, rows: op ? [op] : []};
        }
        if (sql.includes('partition_id = ?') &&
            sql.includes('target_node_id = ?')) {
          const [partitionId, targetNodeId] = params;
          return {success: true, rows: allOps.filter((op) =>
            op.partition_id === partitionId &&
            op.target_node_id === targetNodeId &&
            !['active', 'removed', 'failed'].includes(op.status))};
        }
        if (sql.includes('NOT IN')) {
          return {success: true, rows: allOps.filter((op) =>
            !['active', 'removed', 'failed'].includes(op.status))};
        }
        return {success: true, rows: allOps};
      }
      return {success: true, rows: []};
    },
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: 'test-node-1',
    systemTableCache: createMockCache(),
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
      // Authoritative cache-alignment seam: confirmActiveReplicaTerminalHandoff
      // gates SYNCING->ACTIVE completion on this repair reporting that the
      // exact SERVICES row matches the expected fields (see
      // operation-workflow-active-cache-handoff.test.js). Report alignment
      // only from the tracked authoritative service rows so the redrive
      // completes on real evidence, never on a blanket stub.
      refreshAuthoritativeCacheRow: async (tableName, key, options = {}) => {
        if (tableName !== SYSTEM_TABLE_NAME.SERVICES) {
          return false;
        }
        const serviceRow = trackedServices.get(key);
        if (!serviceRow) {
          return false;
        }
        return Object.entries(options.expectedFields || {}).every(
          ([field, expectedValue]) => serviceRow[field] === expectedValue,
        );
      },
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway(sqlEngine),
    transactionCoordinator: {
      begin: async () => ({success: true}),
      commit: async () => ({success: true}),
      rollback: async () => ({success: true}),
    },
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {estimateReplicaBytes: () => 1},
    enableTimeouts: false,
  });
  return {coordinator, getOp: (id) => trackedOperations.get(id) || null};
}

t.test(
  'family L: the orphan sweep redrives only locally-owned rows — the ' +
    'handed-off row is the unrescued class',
  async (t) => {
    const now = Date.now();
    const localRow = {
      operation_id: 'op-local-1',
      type: OperationType.ADD,
      partition_id: 'latency_groups-p1',
      entity_type: 'partition',
      entity_id: 'latency_groups-p1',
      replica_id: 'replica-local-1',
      source_node_id: 'test-node-1',
      target_node_id: 'test-node-1',
      status: ReplicaStatus.SYNCING,
      workflow_step: 'SYNCING',
      created_at: now,
      updated_at: now,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
    };
    const handedOffRow = {
      ...localRow,
      operation_id: 'op-handed-off-1',
      replica_id: 'replica-handed-off-1',
      source_node_id: 'node-former-owner',
    };
    const {coordinator, getOp} = buildSweepCoordinator({
      operationRows: [localRow, handedOffRow],
      serviceRows: [
        {
          service_id: 'replica-local-1',
          replica_id: 'replica-local-1',
          partition_id: 'latency_groups-p1',
          node_id: 'test-node-1',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 'replica-handed-off-1',
          replica_id: 'replica-handed-off-1',
          partition_id: 'latency_groups-p1',
          node_id: 'test-node-1',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });
    coordinator.initialize();
    try {
      await coordinator.reconcileOrphanedOperations();
      t.equal(
        getOp('op-local-1').status,
        ReplicaStatus.ACTIVE,
        'the locally-owned completed-SYNCING row is redriven to ACTIVE',
      );
      t.equal(
        getOp('op-handed-off-1').status,
        ReplicaStatus.SYNCING,
        'the row owned by another node is NOT redriven by this sweep — the ' +
          'measured unrescued class behind the live in-flight wedge',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

t.test(
  'family T: STOPPING holds in-flight without retirement evidence and ' +
    'releases only on observed completion',
  async (t) => {
    const stoppingRow = buildSyncingReplaceRow({
      status: ReplicaStatus.STOPPING,
      workflow_step: 'STOPPING',
      steps_history: JSON.stringify([{step: 'STOPPING', timestamp: NOW_MS}]),
    });
    t.equal(
      inFlightWith(stoppingRow, [
        activeTargetServiceRow(),
        activeSourceServiceRow(),
      ]),
      true,
      'a STOPPING REPLACE whose source has not retired stays in-flight',
    );
    t.equal(
      inFlightWith(stoppingRow, [activeTargetServiceRow()]),
      false,
      'observed exact-target ACTIVE plus retired source releases STOPPING too',
    );
  },
);

t.test(
  'family T: an unconfirmed terminal transition arms the real terminal-' +
    'transition repair, and the repair re-persists until confirmed',
  async (t) => {
    const now = Date.now();
    const syncingRow = {
      operation_id: 'op-terminal-1',
      type: OperationType.REPLACE,
      partition_id: 'latency_groups-p1',
      entity_type: 'partition',
      entity_id: 'latency_groups-p1',
      replica_id: 'replica-terminal-1',
      source_replica_id: 'replica-terminal-0',
      source_node_id: 'test-node-1',
      target_node_id: 'test-node-1',
      status: ReplicaStatus.SYNCING,
      workflow_step: 'SYNCING',
      created_at: now,
      updated_at: now,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
    };
    const {coordinator, getOp} = buildSweepCoordinator({
      operationRows: [syncingRow],
      serviceRows: [],
    });
    coordinator.initialize();
    const owner = coordinator.workflowOwner;
    // Deterministic scheduler seam (documented in
    // operation-workflow-terminal-transition-repair.js): capture the repair
    // callback instead of letting a wall-clock timer race the test.
    const scheduledRepairs = [];
    owner.setTimeoutFn = (callback) => {
      scheduledRepairs.push(callback);
      return {captured: true};
    };
    // Bound the visibility-confirmation poll so the deadline elapses in-test.
    owner.repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 5;
    try {
      const durable = await coordinator.queryOperationById('op-terminal-1');
      const projectedTerminal = {
        ...durable,
        status: 'removed',
        workflowStep: 'REMOVED',
        updatedAt: now + 10,
        completedAt: now + 10,
      };

      // The terminal write never landed durably (failed authoritative
      // terminal persistence): the durable row still says SYNCING.
      await owner.confirmCommittedTransitionPersistence(projectedTerminal, {
        terminalTransitionRepair: true,
      });

      t.equal(
        owner.terminalTransitionRepairStateByOperationId.has('op-terminal-1'),
        true,
        'the unconfirmed terminal transition arms terminal-transition repair',
      );
      t.equal(
        scheduledRepairs.length,
        1,
        'exactly one repair attempt is scheduled',
      );
      t.equal(
        getOp('op-terminal-1').status,
        ReplicaStatus.SYNCING,
        'the durable row is still non-terminal after the failed persistence',
      );
      t.equal(
        inFlightWith(getOp('op-terminal-1'), []),
        true,
        'negative matrix: failed authoritative terminal persistence does NOT ' +
          'release replica_operations_in_flight',
      );

      // The armed repair re-persists the exact retained projection; once the
      // durable row reflects it, visibility confirms and the repair clears.
      owner.terminalTransitionRepairTimerByOperationId.delete('op-terminal-1');
      await scheduledRepairs[0]();

      t.equal(
        getOp('op-terminal-1').status,
        'removed',
        'the repair attempt re-persisted the terminal projection durably',
      );
      t.equal(
        owner.terminalTransitionRepairStateByOperationId.has('op-terminal-1'),
        false,
        'a positively confirmed terminal transition clears the armed repair',
      );
      t.equal(
        inFlightWith(getOp('op-terminal-1'), []),
        false,
        'the durably terminal row releases in-flight',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

t.test(
  'family T: an unconfirmed ACTIVE transition arms the same repair — the ' +
    'ADD/ACTIVE cell is independent of the REPLACE/REMOVED cell',
  async (t) => {
    const now = Date.now();
    const syncingAddRow = {
      operation_id: 'op-active-1',
      type: OperationType.ADD,
      partition_id: 'latency_groups-p1',
      entity_type: 'partition',
      entity_id: 'latency_groups-p1',
      replica_id: 'replica-active-1',
      source_node_id: 'test-node-1',
      target_node_id: 'test-node-1',
      status: ReplicaStatus.SYNCING,
      workflow_step: 'SYNCING',
      created_at: now,
      updated_at: now,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
    };
    const {coordinator, getOp} = buildSweepCoordinator({
      operationRows: [syncingAddRow],
      serviceRows: [],
    });
    coordinator.initialize();
    const owner = coordinator.workflowOwner;
    const scheduledRepairs = [];
    owner.setTimeoutFn = (callback) => {
      scheduledRepairs.push(callback);
      return {captured: true};
    };
    owner.repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 5;
    try {
      const durable = await coordinator.queryOperationById('op-active-1');
      const projectedActive = {
        ...durable,
        status: ReplicaStatus.ACTIVE,
        workflowStep: 'ACTIVE',
        updatedAt: now + 10,
        completedAt: now + 10,
      };
      await owner.confirmCommittedTransitionPersistence(projectedActive, {
        terminalTransitionRepair: true,
      });
      t.equal(
        owner.terminalTransitionRepairStateByOperationId.has('op-active-1'),
        true,
        'the unconfirmed ACTIVE transition arms terminal-transition repair',
      );
      t.equal(
        getOp('op-active-1').status,
        ReplicaStatus.SYNCING,
        'the durable row still says SYNCING — the ACTIVE cell held, not lost',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

t.test(
  'family T sibling (quest terminal-write-refusal-retry-ownership): a ' +
    'committed:false/REFUSED terminal persist keeps a retry owner — ' +
    'failOperation arms the SAME terminal-transition repair, and the ' +
    'repair lands the held terminal once the write path heals',
  async (t) => {
    const now = Date.now();
    const refusedRow = {
      operation_id: 'op-terminal-refused-1',
      type: OperationType.REPLACE,
      partition_id: 'latency_groups-p1',
      entity_type: 'partition',
      entity_id: 'latency_groups-p1',
      replica_id: 'replica-refused-1',
      source_replica_id: 'replica-refused-0',
      source_node_id: 'test-node-1',
      target_node_id: 'test-node-1',
      status: ReplicaStatus.SYNCING,
      workflow_step: 'SYNCING',
      created_at: now,
      updated_at: now,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
    };
    const {coordinator, getOp} = buildSweepCoordinator({
      operationRows: [refusedRow],
      serviceRows: [],
    });
    coordinator.initialize();
    const owner = coordinator.workflowOwner;
    const scheduledRepairs = [];
    owner.setTimeoutFn = (callback) => {
      scheduledRepairs.push(callback);
      return {captured: true};
    };
    owner.repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 5;
    // Refuse the guarded terminal UPDATE (zero rows changed, row left
    // untouched) while reads keep serving the live SYNCING row — the
    // resolveZeroChangeOperationUpdate REFUSED shape from the live runs.
    const gateway = owner.repository.controlPlaneSystemTableGateway;
    const originalExecuteQuery = gateway.executeQuery.bind(gateway);
    let refuseTerminalWrites = true;
    gateway.executeQuery = async (sql, params, queryOptions) => {
      if (
        refuseTerminalWrites &&
        typeof sql === 'string' &&
        sql.includes('UPDATE replica_operations') &&
        sql.includes('completed_at IS NULL')
      ) {
        return {success: true, changes: 0};
      }
      return originalExecuteQuery(sql, params, queryOptions);
    };
    try {
      const durable = await coordinator.queryOperationById(
        'op-terminal-refused-1',
      );

      const transitionOutcome = await owner.failOperation(
        durable,
        'refused-write arm probe',
      );

      t.same(
        {
          committed: transitionOutcome?.committed,
          disposition: transitionOutcome?.disposition,
        },
        {committed: false, disposition: 'refused'},
        'the refused terminal persist reports its typed outcome',
      );
      t.equal(
        owner.terminalTransitionRepairStateByOperationId.has(
          'op-terminal-refused-1',
        ),
        true,
        'the REFUSED arm arms the SAME terminal-transition repair the ' +
          'committed-but-invisible arm uses',
      );
      t.equal(
        scheduledRepairs.length,
        1,
        'exactly one repair attempt is scheduled for the refusal',
      );
      t.equal(
        getOp('op-terminal-refused-1').status,
        ReplicaStatus.SYNCING,
        'the durable row is untouched — the refusal was a real zero-change',
      );
      t.equal(
        inFlightWith(getOp('op-terminal-refused-1'), []),
        true,
        'the ledger row stays in-flight while the terminal is unresolved',
      );

      // The write path heals; the held repair re-asserts the retained
      // FAILED projection and confirms it.
      refuseTerminalWrites = false;
      owner.terminalTransitionRepairTimerByOperationId.delete(
        'op-terminal-refused-1',
      );
      await scheduledRepairs[0]();

      t.equal(
        getOp('op-terminal-refused-1').status,
        ReplicaStatus.FAILED,
        'the repair landed the exact refused terminal projection',
      );
      t.equal(
        owner.terminalTransitionRepairStateByOperationId.has(
          'op-terminal-refused-1',
        ),
        false,
        'the confirmed repair stands down',
      );
      t.equal(
        inFlightWith(getOp('op-terminal-refused-1'), []),
        false,
        'the durably failed row releases in-flight',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

t.test(
  'negative matrix: failed authoritative terminal persistence cannot ' +
    'release the serialized ledger hold',
  async (t) => {
    const fixture = createTimeoutTestCoordinator({nodeId: 'node-1'});
    const {coordinator, trackedOperations} = fixture;
    const ledgerPartitionId = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
    const dependentPartitionId =
      `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
    try {
      const selfMove = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: ledgerPartitionId,
        entityType: 'partition',
        entityId: ledgerPartitionId,
        replicaId: `${ledgerPartitionId}-r4`,
        sourceNodeId: 'node-1',
        nodeId: 'node-2',
        enforceConcurrentOperationBudget: true,
      });
      // The hold-release decision reads the authoritative lifecycle owner
      // view (dt6-operation-ledger-terminal-hold seam).
      coordinator.queryAuthoritativeOperationVisibilityObservation = async (
        operationId,
      ) => ({
        operation: await coordinator.queryOperationById(operationId),
        deferredOutcome: null,
      });

      // The owner committed a terminal projection but authoritative terminal
      // persistence FAILED: the durable ledger row is still non-terminal.
      const attemptDependent = async () => {
        try {
          return {
            admitted: true,
            reason: null,
            operation: await coordinator.createOperation({
              type: OperationType.REPLACE,
              partitionId: dependentPartitionId,
              entityType: 'partition',
              entityId: dependentPartitionId,
              replicaId: `${dependentPartitionId}-r4`,
              sourceNodeId: 'node-1',
              nodeId: 'node-2',
              enforceConcurrentOperationBudget: true,
            }),
          };
        } catch (error) {
          return {
            admitted: false,
            reason:
              error?.admissionResult?.reason ||
              error?.rebalanceSkipReason ||
              error?.message ||
              'unknown',
          };
        }
      };

      const whileUnpersisted = await attemptDependent();
      t.equal(
        whileUnpersisted.admitted,
        false,
        'the dependent operation cannot admit across the unpersisted terminal',
      );
      t.equal(
        whileUnpersisted.reason,
        'operation_ledger_self_move_in_flight',
        'the serialized ledger hold names itself; a believed-but-unpersisted ' +
          'terminal releases nothing',
      );

      // Only the durably persisted terminal row releases the hold.
      const durableRow = trackedOperations.get(selfMove.operationId);
      durableRow.status = 'removed';
      durableRow.workflow_step = WORKFLOW_STEP.REMOVED;
      durableRow.updated_at = Date.now();
      durableRow.completed_at = Date.now();

      const afterDurableTerminal = await attemptDependent();
      t.equal(
        afterDurableTerminal.admitted,
        true,
        'durably persisted authoritative terminal evidence releases the hold',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

// ---------------------------------------------------------------------------
// Real-owner composition: canonical remove safety (quorum floor and the
// pre-hydration catalog HOLD).
// ---------------------------------------------------------------------------

function createReadyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + 60000,
  };
}

function createCriticalPartitionServiceRow({
  partitionId,
  replicaId,
  nodeId,
  raftRole,
}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

t.test(
  'negative matrix: absent quorum cannot authorize a critical remove',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    const deliveries = [];
    const coordinator = createTestCoordinator({
      nodeId: 'seed-node',
      enableTimeouts: false,
      messageRouter: {
        deliver: async () => {
          deliveries.push('deliver');
          return {acknowledged: true, status: 'completed'};
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({minReplicaCount: 3}),
      },
      cacheData: {
        nodes: [
          createReadyNode('node-a'),
          createReadyNode('node-b'),
          createReadyNode('node-c'),
        ],
        services: [
          createCriticalPartitionServiceRow({
            partitionId: 'nodes-p1',
            replicaId: 'nodes-p1-r1',
            nodeId: 'node-a',
            raftRole: 'leader',
          }),
          createCriticalPartitionServiceRow({
            partitionId: 'nodes-p1',
            replicaId: 'nodes-p1-r2',
            nodeId: 'node-b',
            raftRole: 'follower',
          }),
          createCriticalPartitionServiceRow({
            partitionId: 'nodes-p1',
            replicaId: 'nodes-p1-r3',
            nodeId: 'node-c',
            raftRole: 'follower',
          }),
        ],
      },
    });
    coordinator.initialize();
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'nodes-p1',
        nodeId: 'node-d',
        replicaId: 'nodes-p1-r1',
      });
      const result = await coordinator.executeOperation(operation);
      t.equal(result.success, false, 'the quorum-dropping remove is refused');
      t.match(
        result.error,
        /below minimum/,
        'refusal names the quorum floor, not a transient error',
      );
      t.equal(deliveries.length, 0, 'no removal work is dispatched');
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

t.test(
  'family H: a leader with an unhydrated critical catalog gets a safety ' +
    'HOLD, never an authorization',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    const deliveries = [];
    const coordinator = createTestCoordinator({
      nodeId: 'seed-node',
      enableTimeouts: false,
      messageRouter: {
        deliver: async () => {
          deliveries.push('deliver');
          return {acknowledged: true, status: 'completed'};
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({minReplicaCount: 3}),
      },
      // Leadership acquired before local PARTITIONS/service hydration: the
      // node cache knows the members, but the critical service catalog is
      // still empty.
      cacheData: {
        nodes: [
          createReadyNode('node-a'),
          createReadyNode('node-b'),
          createReadyNode('node-c'),
        ],
        services: [],
      },
    });
    coordinator.initialize();
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'nodes-p1',
        nodeId: 'node-d',
        replicaId: 'nodes-p1-r1',
      });
      const result = await coordinator.executeOperation(operation);
      t.equal(
        result.success,
        false,
        'a pre-hydration safety read cannot authorize the remove',
      );
      t.equal(deliveries.length, 0, 'no removal work is dispatched pre-hydration');
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);
