// Shared, read-only support for the overflow-budget audit's evidence tests
// (quest critical-spread-overflow-budget-audit).
//
// It owns three things the audit's tests would otherwise each restate:
//   - where the decision matrix, the epoch-domain inventory and the gate
//     document live, and how to read them;
//   - the predicate measurement itself, so the partition-set receipt, the
//     grid receipt and the matrix validator all measure the SAME sets from
//     the real owners rather than from three copies of a list;
//   - the placement evidence shape the cure policy's mint is asked for.
//
// Nothing here decides anything. It reads production owners and repository
// artifacts; the audit's claims live in the tests that import it.
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  classifySystemPartition,
  isBootstrapCriticalSystemPartitionId,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  authorizeSpreadCureTransition,
} from '../../src/rebalancer/replica-placement-cure-policy.js';
import {
  createPartitionServiceLearnerPromotionMethods,
} from '../../src/partition/partition-service-learner-promotion-methods.js';
import {
  createPartitionServiceLearnerPromotionProofMethods,
} from '../../src/partition/partition-service-learner-promotion-proof-methods.js';
import {TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';

const EPIC_DIR = path.join('solve', 'epics', 'formation-seed-decoupling');
const MATRIX_JSON =
  path.join(EPIC_DIR, 'overflow-budget-decision-matrix.json');
const MATRIX_MARKDOWN =
  path.join(EPIC_DIR, 'overflow-budget-decision-matrix.md');
const EPOCH_INVENTORY_JSON =
  path.join(EPIC_DIR, 'membership-epoch-domain-inventory.json');
const EPOCH_INVENTORY_MARKDOWN =
  path.join(EPIC_DIR, 'membership-epoch-domain-inventory.md');
const GATE_MARKDOWN = path.join(EPIC_DIR, 'enforcement-entry-gate.md');

const UTF8 = 'utf8';
const DEFAULT_TARGET_REPLICA_COUNT = 3;
const DEFAULT_OVER_TARGET_VOTER_COUNT = 4;
const DEFAULT_DESTINATION_NODE_ID = 'node-audit-destination';
const DEFAULT_OBSERVED_EPOCH = 1;

function readJsonArtifact(relativePath) {
  return JSON.parse(readFileSync(relativePath, UTF8));
}

function readTextArtifact(relativePath) {
  return readFileSync(relativePath, UTF8);
}

/**
 * The exact placement evidence that satisfies
 * classifyPriorityOverTargetSpreadCureCondition, so asking the real cure
 * policy whether it can mint for a partition is a question about the
 * partition and nothing else.
 * @param {string} partitionId the partition to ask about
 * @return {Object} placement evidence
 */
function overTargetSpreadCureEvidence(partitionId) {
  return {
    partitionId,
    inFlightReplaceCount: 0,
    addMoveCount: 1,
    voterReplicaCount: DEFAULT_OVER_TARGET_VOTER_COUNT,
    activeDistinctNodeCount: 2,
    targetReplicaCount: DEFAULT_TARGET_REPLICA_COUNT,
    targetDistinctNodeCount: DEFAULT_TARGET_REPLICA_COUNT,
  };
}

// Ask the REAL cure policy owner whether it would mint an authorization for
// this partition in the one state it authorizes. Module-local: the set
// measurement below is the only consumer, and an export nothing imports
// would raise the unused-export ratchet.
function mintForPartition(partitionId) {
  return authorizeSpreadCureTransition(
    overTargetSpreadCureEvidence(partitionId),
    {
      destinationNodeId: DEFAULT_DESTINATION_NODE_ID,
      resolvePartitionRow: () => ({
        partition_id: partitionId,
        replica_count: DEFAULT_TARGET_REPLICA_COUNT,
      }),
      observedMembershipEpoch: DEFAULT_OBSERVED_EPOCH,
    },
  );
}

/**
 * Measure both predicates over every declared system-table partition, from
 * the real owners. This is the audit's one measurement of the sets; every
 * receipt that needs them reads it here.
 * @return {Object} frozen measured sets
 */
function measurePartitionSets() {
  const all = Object.values(INITIAL_PARTITION_IDS);
  const bootstrapCritical = [];
  const mintable = [];
  const budgetEvaluated = [];
  const criticalWithoutMint = [];
  for (const partitionId of all) {
    const classification = classifySystemPartition({partitionId});
    const critical = isBootstrapCriticalSystemPartitionId(partitionId);
    const mints = mintForPartition(partitionId) !== null;
    if (critical) {
      bootstrapCritical.push(partitionId);
    }
    if (mints) {
      mintable.push(partitionId);
    }
    if (classification.priorityControlPlane === true) {
      budgetEvaluated.push(partitionId);
    }
    if (critical && !mints) {
      criticalWithoutMint.push(partitionId);
    }
  }
  return Object.freeze({
    all: Object.freeze(all),
    bootstrapCritical: Object.freeze(bootstrapCritical),
    mintable: Object.freeze(mintable),
    // The partitions for which the guard's budget owner is evaluated at all:
    // resolvePriorityRecoveryCompletionForLearnerPromotion returns null for
    // every other partition, so the budget input is undefined there.
    budgetEvaluated: Object.freeze(budgetEvaluated),
    criticalWithoutMint: Object.freeze(criticalWithoutMint),
  });
}

const GUARD_METHODS = createPartitionServiceLearnerPromotionMethods();
const GUARD_PROOF_METHODS = createPartitionServiceLearnerPromotionProofMethods();
const LEARNER_ROLE = 'learner';
const LEADER_ROLE = 'leader';
const FOLLOWER_ROLE = 'follower';
const PROOF_GRANTED = 'proof-gate';
const NO_BUDGET = 0;

/**
 * One partition-replica services row, in the shape the promotion guard reads.
 * @param {string} partitionId the partition
 * @param {number} index the replica index
 * @param {string} nodeId the node hosting it
 * @param {string} raftRole leader, follower or learner
 * @param {string} status the replica status
 * @return {Object} a services row
 */
function guardServiceRow(partitionId, index, nodeId, raftRole, status) {
  const replicaId = `${partitionId}-r${index}`;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION,
    status: status || ReplicaStatus.ACTIVE,
    raft_role: raftRole,
    node_id: nodeId,
  };
}

function guardPlanningAnswer(nodeId, priorityPartitionSummary) {
  return priorityPartitionSummary === undefined ? null : {
    nodeId,
    publicationEpoch: 7,
    publicationStatus: 'published',
    priorityPartitionSummary,
    publishedActiveNodeIds: ['node-0', 'node-1', nodeId],
  };
}

function guardCache(partitionId, rows) {
  const rowsFor = (tableName) => {
    if (tableName === TABLES.SERVICES) {
      return rows.serviceRows;
    }
    if (tableName === TABLES.REPLICA_OPERATIONS) {
      return rows.operationRows;
    }
    return rows.partitionRow ? [rows.partitionRow] : [];
  };
  return {
    get: (tableName, key) =>
      (tableName === TABLES.PARTITIONS && key === partitionId ?
        rows.partitionRow :
        null),
    filter: (tableName, predicate) => rowsFor(tableName).filter(predicate),
  };
}

/**
 * A promotion-guard context composed from the REAL learner-promotion methods
 * bag and the REAL promotion-proof bag, exactly as partition-service-assembly
 * composes them. One owner for the audit's guard driver: every audit test
 * that needs the real guard uses this rather than a copy of it.
 * @param {Object} options the membership and readiness to drive
 * @return {Object} {context, logLines}
 */
function createPromotionGuardContext(options = {}) {
  const partitionId = options.partitionId;
  const learnerNodeId = options.learnerNodeId || 'node-L';
  const replicaId = options.replicaId || `${partitionId}-r99`;
  const logLines = [];
  const context = {
    ...GUARD_METHODS,
    ...GUARD_PROOF_METHODS,
    role: LEARNER_ROLE,
    leaderId: `${partitionId}-r1`,
    partitionId,
    replicaId,
    nodeId: learnerNodeId,
    systemTableCache: guardCache(partitionId, {
      serviceRows: options.serviceRows || [],
      operationRows: options.operationRows || [],
      partitionRow: options.partitionRow === undefined ?
        {partition_id: partitionId, replica_count: 3} :
        options.partitionRow,
    }),
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningAnswerSync: () =>
        guardPlanningAnswer(learnerNodeId, options.priorityPartitionSummary),
      getNodeReadinessSync: (nodeId) => ({
        nodeId, ready: true, phase: LIFECYCLE_PHASE.TRAFFIC_READY, reasons: [],
      }),
    },
    metadataPublicationReadinessState: {
      getSnapshot: () => ({
        phase: LIFECYCLE_PHASE.WARMING,
        ready: false,
        draining: false,
        reasons: options.recoveryPending === false ?
          [] :
          [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
      }),
    },
    isJoiningExistingGroup: options.isJoiningExistingGroup === true,
    isShutdown: false,
    learnerPromotionTimer: null,
    learnerPromotionCountCheckInputsLogged: false,
    learnerCatchUpCheckIntervalMs: 1000,
    logger: {
      info: (message, fields) => logLines.push({message, fields}),
      warn: (message, fields) => logLines.push({message, fields}),
      debug: () => {},
    },
    scheduleLearnerPromotion: () => {},
    applyLearnerPromotionProofGate: async () => {
      logLines.push({message: PROOF_GRANTED, fields: null});
    },
  };
  if (options.zeroBudget === true) {
    forceZeroBudget(context);
  }
  return {context, logLines};
}

// The DOUBLE of the completion owner: the guard's own resolver runs, and the
// one field this audit is about is forced to zero on the way back. Nothing in
// src changes; the guard runs its real path around it.
function forceZeroBudget(context) {
  const real = context.resolvePriorityRecoveryCompletionForLearnerPromotion;
  context.resolvePriorityRecoveryCompletionForLearnerPromotion =
    function resolveWithZeroBudget(options) {
      const resolved = real.call(this, options);
      return resolved === null ? null : Object.freeze({
        ...resolved,
        completion: Object.freeze({
          ...resolved.completion,
          temporaryOverflowVoterBudget: NO_BUDGET,
        }),
      });
    };
}

/**
 * Run the REAL promotion check once and say whether the proof gate was
 * reached, i.e. whether the promotion was granted.
 * @param {Object} options the same options createPromotionGuardContext takes
 * @return {Promise<Object>} {granted, logLines, observation}
 */
async function runPromotionGuard(options) {
  const driven = createPromotionGuardContext(options);
  const observation = driven.context.observeLearnerPromotionCountCheck();
  await driven.context.runLearnerPromotionCheck();
  return {
    granted: driven.logLines.some((line) => line.message === PROOF_GRANTED),
    logLines: driven.logLines,
    observation,
  };
}

// Every readiness dimension healthy on every node. The local-mutation
// admission gate above the coordinator's creation hop reads
// controlPlaneWritable and metadataPublicationHealthy, which are a different
// owner's concern and decide nothing about authority; they are made healthy
// so a trace reaches the coordinator rather than being deferred by an
// unrelated gate.
function healthyReadinessService(nodeIds) {
  const readinessByNodeId = {};
  for (const nodeId of nodeIds) {
    const dimensions = {};
    for (const dimension of Object.values(CONTROL_PLANE_READINESS_DIMENSION)) {
      dimensions[dimension] = true;
    }
    readinessByNodeId[nodeId] =
      {nodeId, ready: true, dimensions, reasonCodes: []};
  }
  return createMockControlPlaneReadinessService({
    defaultRepairEligible: true, readinessByNodeId,
  });
}

/**
 * A real UnifiedRebalancer wired to a real RebalanceCoordinator over one
 * membership. ONE owner for the audit's producer-to-coordinator driver, so
 * every end-to-end trace enters production the same way.
 * @param {Object} options {partitionId, tableId, nodeIds, services, target}
 * @return {Object} {rebalancer, coordinator, cacheData}
 */
function createWiredRebalancer(options) {
  const nodeIds = options.nodeIds;
  const cacheData = {
    nodes: nodeIds.map((nodeId) => ({node_id: nodeId, status: 'active'})),
    replicaOperations: options.replicaOperations || [],
    services: options.services,
    partitions: [{partition_id: options.partitionId,
      table_id: options.tableId, replica_count: options.target}],
  };
  const admit = async () => ({
    decision: 'allow', allowed: true, decisionType: 'admitted',
  });
  const storageAdmissionService = {
    checkAdd: admit, checkReplace: admit, checkSplit: admit,
  };
  const controlPlaneReadinessService = healthyReadinessService(nodeIds);
  const coordinator = createTestCoordinator({
    nodeId: nodeIds[0], cacheData, storageAdmissionService,
    controlPlaneReadinessService, enableTimeouts: false,
  });
  const rebalancer = createTestRebalancer({
    entityId: options.partitionId,
    entityType: EntityType.PARTITION,
    nodeId: nodeIds[0],
    cacheData,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService,
    storageAdmissionService,
    storageAccountingService: {estimateReplicaBytes: () => 1},
  });
  rebalancer.setLeader(true);
  rebalancer.clusterReadinessConfirmed = true;
  rebalancer.isStabilized = () => true;
  return {rebalancer, coordinator, cacheData};
}

export {
  createWiredRebalancer,
  FOLLOWER_ROLE,
  LEADER_ROLE,
  LEARNER_ROLE,
  createPromotionGuardContext,
  guardServiceRow,
  runPromotionGuard,
  EPOCH_INVENTORY_JSON,
  EPOCH_INVENTORY_MARKDOWN,
  GATE_MARKDOWN,
  MATRIX_JSON,
  MATRIX_MARKDOWN,
  measurePartitionSets,
  overTargetSpreadCureEvidence,
  readJsonArtifact,
  readTextArtifact,
};
